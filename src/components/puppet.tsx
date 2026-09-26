import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { eyeOverlayRect, IDLE_EYE_RECTS, IDLE_PLATE_HEIGHT, IDLE_PLATE_WIDTH } from "@/lib/idle-blink";
import {
  allSpriteUrls,
  canIdleBlink,
  layersFor,
  POSE_CROSSFADE_MS,
  SPRITES,
  USE_EXPO_TALK_BUST,
  type EmotionId,
  type PoseId,
  type SpriteLayer,
} from "@/lib/rai";
import {
  IDLE_BEAT_FADE_MS,
  IDLE_BLINK_FADE_MS,
  IDLE_BLINK_GAP_MAX_MS,
  IDLE_BLINK_GAP_MIN_MS,
  IDLE_BLINK_HOLD_MS,
  puppetIdleMotion,
  puppetRigTransform,
} from "@/lib/rai-motion";
import { punchedSpriteUrl } from "@/lib/punch-white";
import { cn } from "@/lib/utils";

type PuppetProps = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  className?: string;
};

type DisplayLayer = SpriteLayer & { z: number };

const LOOK_LERP = 6.5; // higher = snappier; frame-rate independent
const AMP_LERP = 10;
const DEADZONE = 0.04;
/** Immediate jaw kick when talk starts so first frames aren't stuck closed. */
const TALK_AMP_KICK = 0.42;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function expApproach(current: number, target: number, rate: number, dt: number): number {
  const k = 1 - Math.exp(-rate * dt);
  return lerp(current, target, k);
}

/** Synthetic jaw so visemes cycle even when TTS amp is flat/near-zero. */
function syntheticJaw(t: number): number {
  return 0.25 + 0.55 * Math.abs(Math.sin(t * 11)) * Math.abs(Math.sin(t * 3.3));
}

function isInstantLayer(layer: SpriteLayer, talking: boolean): boolean {
  return talking && (layer.id === "talk" || layer.role === "talk");
}

function fadeMsFor(layer: SpriteLayer, talking: boolean): number {
  if (isInstantLayer(layer, talking)) return 0;
  if (layer.id.startsWith("idle-beat")) return IDLE_BEAT_FADE_MS;
  if (layer.id === "expo-talk") return 180;
  return POSE_CROSSFADE_MS;
}

/**
 * Eye-only lid overlay. The idle <img> stays mounted and fully opaque.
 * This canvas receives putImageData of the two eye rects and nothing else.
 */
function IdleEyes({
  blinkUrl,
  opacity,
  zIndex,
  transition,
  paintRef,
}: {
  blinkUrl: string | undefined;
  opacity: number;
  zIndex: number;
  transition: string;
  paintRef: { current: (alpha: number) => boolean };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blinkRef = useRef<Uint8ClampedArray | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    let cancelled = false;
    blinkRef.current = null;
    paintRef.current = () => false;
    if (!canvas || !blinkUrl) {
      return () => {
        paintRef.current = () => false;
      };
    }

    const img = new Image();
    img.decoding = "async";
    img.src = blinkUrl;
    void img
      .decode()
      .then(() => {
        if (cancelled) return;
        const plate = document.createElement("canvas");
        plate.width = IDLE_PLATE_WIDTH;
        plate.height = IDLE_PLATE_HEIGHT;
        const ctx = plate.getContext("2d", { willReadFrequently: true });
        if (!ctx || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
        if (img.naturalWidth === IDLE_PLATE_WIDTH && img.naturalHeight === IDLE_PLATE_HEIGHT) {
          ctx.drawImage(img, 0, 0);
        } else {
          ctx.drawImage(img, 0, 0, IDLE_PLATE_WIDTH, IDLE_PLATE_HEIGHT);
        }
        blinkRef.current = new Uint8ClampedArray(
          ctx.getImageData(0, 0, IDLE_PLATE_WIDTH, IDLE_PLATE_HEIGHT).data,
        );
        paintRef.current = (alpha: number) => {
          const blink = blinkRef.current;
          const node = canvasRef.current;
          if (!blink || !node) return false;
          const dest = node.getContext("2d", { alpha: true });
          if (!dest) return false;
          for (const rect of IDLE_EYE_RECTS) {
            const pixels = eyeOverlayRect(blink, IDLE_PLATE_WIDTH, rect, alpha);
            const image = new ImageData(rect.width, rect.height);
            image.data.set(pixels);
            dest.putImageData(image, rect.x, rect.y);
          }
          return true;
        };
      })
      .catch(() => {
        if (!cancelled) paintRef.current = () => false;
      });

    return () => {
      cancelled = true;
      paintRef.current(0);
      paintRef.current = () => false;
      blinkRef.current = null;
    };
  }, [blinkUrl, paintRef]);

  return (
    <canvas
      ref={canvasRef}
      width={IDLE_PLATE_WIDTH}
      height={IDLE_PLATE_HEIGHT}
      className="rai-layer rai-eye-overlay"
      data-rai-role="eyes"
      data-rai-sheet="idle-eyes"
      aria-hidden="true"
      style={{ opacity, zIndex, transition }}
    />
  );
}

/**
 * Star Rai 2D puppet — planted idle life, look-at lean, talk/mood sheets.
 * Studio-white cards are punched to alpha. Layers crossfade by stable id.
 * Spoken bubble holds talk/mood through the line; frown idle is rest-only.
 * Rest idle keeps one idle.png body. Blink copies two eye rects from
 * idle_blink.png and does not draw the rest of that plate.
 * Expo bust mouth/eye crops stay off. Dedicated poses hold their own sheet.
 */
export function Puppet({ pose, emotion, talking, amplitude, className }: PuppetProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerTarget = useRef(0);
  const lookSmooth = useRef(0);
  const ampSmooth = useRef(0);
  const ampTarget = useRef(amplitude);
  const talkingRef = useRef(talking);
  const lastTs = useRef(0);
  const raf = useRef(0);
  const reducedRef = useRef(false);

  ampTarget.current = amplitude;
  talkingRef.current = talking;

  const [ampLive, setAmpLive] = useState(0);
  const [blink, setBlink] = useState<0 | 1 | 2>(0);
  const [eyesClosed, setEyesClosed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [display, setDisplay] = useState<DisplayLayer[]>([]);
  const [sheets, setSheets] = useState<Record<string, string>>({});
  const prevIds = useRef<Map<string, DisplayLayer>>(new Map());
  const fadeTimers = useRef<Map<string, number>>(new Map());
  const fadingIn = useRef<Set<string>>(new Set());
  const fadeRaf = useRef(0);
  const paintLids = useRef<(alpha: number) => boolean>(() => false);

  // Punch studio-white cards to alpha, then decode so pose swaps never flash a plate.
  useEffect(() => {
    let cancelled = false;
    const urls = allSpriteUrls();
    const idle = SPRITES.poses.idle;
    const ordered = [idle, ...urls.filter((src) => src !== idle)];
    for (const src of ordered) {
      void punchedSpriteUrl(src).then((url) => {
        if (cancelled) return;
        setSheets((prev) => (prev[src] === url ? prev : { ...prev, [src]: url }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const mq =
      typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const sync = () => {
      const on = mq?.matches ?? false;
      reducedRef.current = on;
      setReducedMotion(on);
    };
    sync();
    mq?.addEventListener("change", sync);
    return () => mq?.removeEventListener("change", sync);
  }, []);

  // Kick ampLive as soon as talking starts so first frames aren't stuck closed.
  useEffect(() => {
    if (!talking) return;
    const kick = Math.max(ampTarget.current, TALK_AMP_KICK);
    ampSmooth.current = Math.max(ampSmooth.current, kick);
    setAmpLive((prev) => Math.max(prev, kick));
  }, [talking]);

  // Expo bust blink while speaking. Official PNG does not use face_eyes_*.
  useEffect(() => {
    if (!USE_EXPO_TALK_BUST || reducedRef.current) return;
    let cancelled = false;
    let sleepTimer = 0;
    let stepTimer = 0;

    const schedule = () => {
      const wait = 1800 + Math.random() * 1200;
      sleepTimer = window.setTimeout(() => {
        if (cancelled) return;
        if (!talkingRef.current) {
          schedule();
          return;
        }
        setBlink(1);
        stepTimer = window.setTimeout(() => {
          if (cancelled) return;
          setBlink(2);
          stepTimer = window.setTimeout(() => {
            if (cancelled) return;
            setBlink(1);
            stepTimer = window.setTimeout(() => {
              if (cancelled) return;
              setBlink(0);
              schedule();
            }, 40);
          }, 70);
        }, 40);
      }, wait);
    };

    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(sleepTimer);
      window.clearTimeout(stepTimer);
      setBlink(0);
    };
  }, []);

  // Rest-idle blink: lid alpha inside the eye rects. The idle body img never swaps.
  // Layout cleanup so leaving rest opens the eyes before the next paint.
  useLayoutEffect(() => {
    if (USE_EXPO_TALK_BUST) return;
    const resting = canIdleBlink({ pose, emotion, talking, reducedMotion });
    if (!resting) return;

    let cancelled = false;
    let sleepTimer = 0;
    let rafId = 0;
    let wake = () => {};

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        wake = resolve;
        sleepTimer = window.setTimeout(resolve, ms);
      });

    const tween = (from: number, to: number, ms: number) =>
      new Promise<boolean>((resolve) => {
        const t0 = performance.now();
        const frame = (now: number) => {
          if (cancelled) {
            resolve(false);
            return;
          }
          const u = ms <= 0 ? 1 : Math.min(1, (now - t0) / ms);
          const ok = paintLids.current(from + (to - from) * u);
          if (!ok) {
            resolve(false);
            return;
          }
          if (u >= 1) resolve(true);
          else rafId = requestAnimationFrame(frame);
        };
        rafId = requestAnimationFrame(frame);
      });

    const run = async () => {
      while (!cancelled) {
        const wait =
          IDLE_BLINK_GAP_MIN_MS +
          Math.random() * (IDLE_BLINK_GAP_MAX_MS - IDLE_BLINK_GAP_MIN_MS);
        await sleep(wait);
        if (cancelled || reducedRef.current || talkingRef.current) break;
        if (!paintLids.current(0)) continue;
        if (cancelled) break;
        setEyesClosed(true);
        const closed = await tween(0, 1, IDLE_BLINK_FADE_MS);
        if (!closed || cancelled) {
          if (!cancelled) {
            paintLids.current(0);
            setEyesClosed(false);
          }
          if (cancelled) break;
          continue;
        }
        await sleep(IDLE_BLINK_HOLD_MS);
        if (cancelled) break;
        const opened = await tween(1, 0, IDLE_BLINK_FADE_MS);
        if (!cancelled) setEyesClosed(false);
        if (!opened && !cancelled) paintLids.current(0);
      }
    };

    void run();
    return () => {
      cancelled = true;
      window.clearTimeout(sleepTimer);
      cancelAnimationFrame(rafId);
      wake();
      paintLids.current(0);
      setEyesClosed(false);
    };
  }, [pose, emotion, talking, reducedMotion]);

  // Pointer → look target (normalized -1..1), deadzone kills micro-jitter.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      let x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      if (Math.abs(x) < DEADZONE) x = 0;
      else x = Math.sign(x) * ((Math.abs(x) - DEADZONE) / (1 - DEADZONE));
      pointerTarget.current = Math.max(-1, Math.min(1, x));
    };
    const onLeave = () => {
      pointerTarget.current = 0;
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // Idle life + look-at lean + amp smoothing — DOM transforms, minimal React.
  useEffect(() => {
    const tick = (now: number) => {
      const dt = lastTs.current ? Math.min(0.05, (now - lastTs.current) / 1000) : 0.016;
      lastTs.current = now;
      const t = now / 1000;
      const reduced = reducedRef.current;

      lookSmooth.current = expApproach(
        lookSmooth.current,
        pointerTarget.current,
        LOOK_LERP,
        dt,
      );

      ampSmooth.current = expApproach(ampSmooth.current, ampTarget.current, AMP_LERP, dt);

      // Mix real TTS amp with synthetic jaw so visemes cycle even when amp is flat.
      let jaw = ampSmooth.current;
      if (talkingRef.current && !reduced) {
        const syn = syntheticJaw(t);
        jaw = Math.max(ampSmooth.current, syn * 0.85);
      } else if (!talkingRef.current) {
        jaw = ampSmooth.current;
      }

      // Amp is for the talk bob on the rig. Spoken sheets do not flap idle underneath.
      setAmpLive((prev) => (Math.abs(prev - jaw) > 0.02 ? jaw : prev));

      const motion = puppetIdleMotion(t, {
        reduced,
        look: lookSmooth.current,
        talking: talkingRef.current,
        jaw,
      });

      const node = stageRef.current?.querySelector<HTMLElement>("[data-rai-rig]");
      const ahoge = stageRef.current?.querySelector<HTMLElement>("[data-rai-ahoge]");
      if (node) {
        node.style.transform = puppetRigTransform(motion);
      }
      if (ahoge) {
        ahoge.style.transform = `rotate(${motion.hairDeg.toFixed(2)}deg) scaleY(${(
          1 + Math.sin(t * 2.05) * 0.03
        ).toFixed(3)})`;
      }

      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const restingBlink = canIdleBlink({ pose, emotion, talking, reducedMotion });

  const desired = useMemo(
    () =>
      layersFor({
        pose,
        emotion,
        talking,
        amplitude: ampLive,
        angle: 0,
        talkPhase: 0,
        blink,
        idleBeat: "none",
        reducedMotion,
      }),
    [pose, emotion, talking, ampLive, blink, reducedMotion],
  );

  // Crossfade pool: incoming fades from 0, outgoing fades to 0, overlap both.
  useEffect(() => {
    if (fadeRaf.current) {
      window.clearTimeout(fadeRaf.current);
      fadeRaf.current = 0;
    }

    const next = new Map<string, DisplayLayer>();
    desired.forEach((layer, i) => {
      // Body starts at 1 so sheets sit above .rai-rig::after (contact shadow at z 0).
      next.set(layer.id, { ...layer, z: layer.role === "talk" ? 20 + i : i + 1 });
    });

    const merged = new Map(prevIds.current);
    const incoming: Array<[string, DisplayLayer]> = [];
    const firstPaint = prevIds.current.size === 0;

    for (const [id, layer] of next) {
      const existingTimer = fadeTimers.current.get(id);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        fadeTimers.current.delete(id);
      }
      const prev = merged.get(id);
      if (!prev) {
        if (isInstantLayer(layer, talking) || firstPaint) {
          // First paint snaps on — fading from empty left the stage blank.
          merged.set(id, layer);
        } else {
          // Incoming on top at 0 so the outgoing PNG stays visible until the fade starts.
          merged.set(id, { ...layer, opacity: 0, z: 10 + layer.z });
          fadingIn.current.add(id);
          incoming.push([id, layer]);
        }
      } else if (fadingIn.current.has(id)) {
        // Keep the fade-in; don't snap to target when talkPhase retriggers.
        merged.set(id, { ...layer, opacity: prev.opacity });
      } else {
        merged.set(id, layer);
      }
    }

    for (const [id, layer] of merged) {
      if (!next.has(id) && layer.opacity > 0) {
        fadingIn.current.delete(id);
        merged.set(id, { ...layer, opacity: 0 });
        const existingTimer = fadeTimers.current.get(id);
        if (existingTimer) window.clearTimeout(existingTimer);
        const fadeMs = fadeMsFor(layer, talking);
        const timer = window.setTimeout(() => {
          prevIds.current.delete(id);
          fadeTimers.current.delete(id);
          setDisplay(Array.from(prevIds.current.values()).sort((a, b) => a.z - b.z));
        }, fadeMs + 40);
        fadeTimers.current.set(id, timer);
      }
    }

    prevIds.current = merged;
    setDisplay(Array.from(merged.values()).sort((a, b) => a.z - b.z));

    if (incoming.length) {
      if (fadeRaf.current) window.clearTimeout(fadeRaf.current);
      // Wait one paint at opacity 0 so CSS can interpolate 0 → target (not a hard cut in).
      fadeRaf.current = window.setTimeout(() => {
        for (const [id, layer] of incoming) {
          if (!prevIds.current.has(id)) continue;
          prevIds.current.set(id, layer);
          fadingIn.current.delete(id);
        }
        setDisplay(Array.from(prevIds.current.values()).sort((a, b) => a.z - b.z));
      }, 48);
    }
  }, [desired, talking]);

  useEffect(() => {
    return () => {
      for (const t of fadeTimers.current.values()) window.clearTimeout(t);
      fadeTimers.current.clear();
      if (fadeRaf.current) window.clearTimeout(fadeRaf.current);
    };
  }, []);

  const stageReady = Boolean(sheets[SPRITES.poses.idle]);
  const talkOverlay = display.find((layer) => layer.role === "talk");

  return (
    <div
      ref={stageRef}
      className={cn("rai-stage", !stageReady && "rai-stage-pending", className)}
      aria-hidden="true"
      data-rai-engine="png-puppet"
      data-rai-pose={pose}
      data-rai-emotion={emotion}
      data-rai-talking={talking ? "1" : "0"}
      data-rai-blink={eyesClosed && restingBlink ? "1" : "0"}
      data-rai-talk-flap={talkOverlay ? talkOverlay.opacity.toFixed(3) : "0"}
    >
      <div data-rai-rig className="rai-rig">
        {display.map((layer) => {
          const src = sheets[layer.src];
          if (!src) return null;
          const transition = isInstantLayer(layer, talking)
            ? "none"
            : `opacity ${fadeMsFor(layer, talking)}ms var(--ease-smooth-out)`;
          const style = {
            opacity: layer.opacity,
            zIndex: layer.z,
            transition,
          };
          const idleBody = !USE_EXPO_TALK_BUST && layer.src === SPRITES.poses.idle;
          if (idleBody) {
            return (
              <Fragment key={layer.id}>
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  decoding="async"
                  className="rai-layer"
                  data-rai-role={layer.role}
                  data-rai-sheet="idle"
                  style={style}
                />
                <IdleEyes
                  blinkUrl={sheets[SPRITES.idleBlink]}
                  opacity={layer.opacity}
                  zIndex={layer.z + 1}
                  transition={transition}
                  paintRef={paintLids}
                />
              </Fragment>
            );
          }
          return (
            <img
              key={layer.id}
              src={src}
              alt=""
              draggable={false}
              decoding="async"
              className="rai-layer"
              data-rai-role={layer.role}
              style={style}
            />
          );
        })}
        {/* Ahoge / hair tip proxy — rotates over the crown */}
        <span data-rai-ahoge className="rai-ahoge" />
      </div>
    </div>
  );
}
