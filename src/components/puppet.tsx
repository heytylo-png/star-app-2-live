import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { applyIdleCanvasPlan, planIdleCanvasDraws } from "@/lib/idle-blink-paint";
import {
  allSpriteUrls,
  canIdleBlink,
  IDLE_BLINK_CANVAS,
  IDLE_BLINK_DEST_RECT,
  idleBlinkPatchSrc,
  idleBlinkPatchUrls,
  isFullBlinkPlate,
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
  IDLE_BLINK_GAP_MAX_MS,
  IDLE_BLINK_GAP_MIN_MS,
  idleBlinkSchedule,
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
  // Lid holes cut in. Fading them would dissolve a second image over the body.
  if (layer.role === "eyes") return true;
  return talking && (layer.id === "talk" || layer.role === "talk");
}

/** off = pose timing. snap = drop lids and cut to the new sheet. */
type BlinkFadeMode = "off" | "snap";

function fadeMsFor(layer: SpriteLayer, talking: boolean, blinkMode: BlinkFadeMode): number {
  if (isInstantLayer(layer, talking)) return 0;
  if (layer.id.startsWith("idle-beat")) return IDLE_BEAT_FADE_MS;
  if (layer.id === "expo-talk") return 180;
  // Pose / talk / emotion swap mid-blink: cut, don't ease the closed lids out.
  if (blinkMode === "snap") return 0;
  return POSE_CROSSFADE_MS;
}

/**
 * Star Rai 2D puppet — planted idle life, look-at lean, talk/mood sheets.
 * Studio-white cards are punched to alpha. Layers crossfade by stable id.
 * Spoken bubble holds talk/mood through the line; frown idle is rest-only.
 * Rest idle keeps one idle.png bitmap. Blink pastes one TyLo patch at (424, 193).
 * Expo bust mouth/eye crops stay off. Dedicated poses hold their own sheet and do not blink.
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
  const [blink, setBlink] = useState<0 | 1 | 2 | 3>(0);
  /** Three TyLo dest patches decoded. Until then blink stays off — no full-plate fallback. */
  const [eyesReady, setEyesReady] = useState(false);
  /** Punched idle bitmap decoded. The canvas draws this and never swaps it out. */
  const [idleBitmapUrl, setIdleBitmapUrl] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [display, setDisplay] = useState<DisplayLayer[]>([]);
  const [sheets, setSheets] = useState<Record<string, string>>({});
  const prevIds = useRef<Map<string, DisplayLayer>>(new Map());
  const fadeTimers = useRef<Map<string, number>>(new Map());
  const fadingIn = useRef<Set<string>>(new Set());
  const fadeRaf = useRef(0);
  const [blinkMode, setBlinkMode] = useState<BlinkFadeMode>("off");
  const blinkRef = useRef<0 | 1 | 2 | 3>(0);
  const idleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintedUrlRef = useRef<string | null>(null);
  const lidsOnCanvasRef = useRef(false);
  const idleBitmapRef = useRef<HTMLImageElement | null>(null);
  const eyeImageRef = useRef<Record<string, HTMLImageElement>>({});
  const paintStateRef = useRef({
    blinkShown: 0,
    eyesReady: false,
    idleReady: false,
    idleSheetUrl: null as string | null,
    restingBlink: false,
  });

  // Punch studio-white cards to alpha, then decode so pose swaps never flash a plate.
  useEffect(() => {
    let cancelled = false;
    const urls = allSpriteUrls();
    const idle = SPRITES.poses.idle;
    const eyeCrops = new Set(idleBlinkPatchUrls());
    const ordered = [idle, ...urls.filter((src) => src !== idle && !eyeCrops.has(src))];
    for (const src of ordered) {
      if (isFullBlinkPlate(src)) continue;
      void punchedSpriteUrl(src).then((url) => {
        if (cancelled) return;
        setSheets((prev) => (prev[src] === url ? prev : { ...prev, [src]: url }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Decode the three TyLo patches. Failure leaves blink off — no full-plate fallback.
  useEffect(() => {
    let cancelled = false;
    const urls = idleBlinkPatchUrls();
    const hole = IDLE_BLINK_DEST_RECT;
    void Promise.all(
      urls.map(async (src) => {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
        await img.decode();
        if (img.naturalWidth !== hole.w || img.naturalHeight !== hole.h) {
          throw new Error("tylo blink patch does not match DEST_RECT");
        }
        eyeImageRef.current[src] = img;
      }),
    )
      .then(() => {
        if (!cancelled) setEyesReady(true);
      })
      .catch(() => {
        // Crops are not ready. Blink stays off. Do not draw a blink plate.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const idleSheetUrl = sheets[SPRITES.poses.idle];
  useEffect(() => {
    if (!idleSheetUrl) return;
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.src = idleSheetUrl;
    void img.decode().then(() => {
      if (cancelled) return;
      if (img.naturalWidth !== IDLE_BLINK_CANVAS.width || img.naturalHeight !== IDLE_BLINK_CANVAS.height) {
        return;
      }
      idleBitmapRef.current = img;
      setIdleBitmapUrl(idleSheetUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [idleSheetUrl]);

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

  // Dest-rect blink on rest idle only, and only after the TyLo patches decode.
  // The idle.png body stays the only full texture. Pose, talk, and emotion cancel it.
  useEffect(() => {
    if (USE_EXPO_TALK_BUST || !eyesReady) return;
    const resting = canIdleBlink({ pose, emotion, talking, reducedMotion });
    if (!resting) return;

    let cancelled = false;
    const timers: number[] = [];

    const clearTimers = () => {
      for (const timer of timers) window.clearTimeout(timer);
      timers.length = 0;
    };

    const arm = () => {
      clearTimers();
      const wait =
        IDLE_BLINK_GAP_MIN_MS +
        Math.random() * (IDLE_BLINK_GAP_MAX_MS - IDLE_BLINK_GAP_MIN_MS);
      timers.push(
        window.setTimeout(() => {
          if (cancelled || reducedRef.current || talkingRef.current) return;
          for (const step of idleBlinkSchedule()) {
            timers.push(
              window.setTimeout(() => {
                if (cancelled || reducedRef.current || talkingRef.current) return;
                blinkRef.current = step.blink;
                setBlink(step.blink);
                if (step.blink === 0) arm();
              }, step.at),
            );
          }
        }, wait),
      );
    };

    arm();
    return () => {
      cancelled = true;
      clearTimers();
      const midBlink = blinkRef.current > 0;
      blinkRef.current = 0;
      setBlink(0);
      if (midBlink) setBlinkMode("snap");
    };
  }, [pose, emotion, talking, reducedMotion, eyesReady]);

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
  const blinkShown = eyesReady ? blink : 0;
  // Pose / talk / emotion can change a frame before the blink timer cleans up.
  // Derive snap in that render so the next sheet cuts in instead of easing from closed lids.
  let blinkModeLive: BlinkFadeMode = blinkMode;
  if (!USE_EXPO_TALK_BUST && !restingBlink && blinkShown > 0) {
    blinkModeLive = "snap";
  }

  // Blink must not change the layer list. A new layer remounts the body.
  const sheetBlink = USE_EXPO_TALK_BUST ? blink : 0;
  const desired = useMemo(
    () =>
      layersFor({
        pose,
        emotion,
        talking,
        amplitude: ampLive,
        angle: 0,
        talkPhase: 0,
        blink: sheetBlink,
        idleBeat: "none",
        reducedMotion,
      }),
    [pose, emotion, talking, ampLive, sheetBlink, reducedMotion],
  );
  const plates = useMemo(
    () => desired.filter((layer) => layer.role !== "eyes" && !isFullBlinkPlate(layer.src)),
    [desired],
  );

  // Drop snap timing once the cancelled blink has cut to the new sheet.
  useEffect(() => {
    if (blinkMode !== "snap") return;
    const timer = window.setTimeout(() => {
      setBlinkMode((mode) => (mode === "snap" ? "off" : mode));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [blinkMode]);

  // Crossfade pool: incoming fades from 0, outgoing fades to 0, overlap both.
  useEffect(() => {
    if (fadeRaf.current) {
      window.clearTimeout(fadeRaf.current);
      fadeRaf.current = 0;
    }

    const next = new Map<string, DisplayLayer>();
    plates.forEach((layer, i) => {
      // Body starts at 1 so sheets sit above .rai-rig::after (contact shadow at z 0).
      const z = layer.role === "talk" ? 20 + i : i + 1;
      next.set(layer.id, { ...layer, z });
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
        if (isInstantLayer(layer, talking) || firstPaint || blinkModeLive === "snap") {
          // First paint and cancelled blinks snap on — fading from empty left a blank or a stuck lid.
          merged.set(id, layer);
        } else {
          // Incoming on top at 0 so the outgoing PNG stays visible until the fade starts.
          merged.set(id, { ...layer, opacity: 0, z: 10 + layer.z });
          fadingIn.current.add(id);
          incoming.push([id, layer]);
        }
      } else if (fadingIn.current.has(id) && blinkModeLive !== "snap") {
        // Keep the fade-in; don't snap to target when talkPhase retriggers.
        merged.set(id, { ...layer, opacity: prev.opacity });
      } else {
        if (blinkModeLive === "snap") fadingIn.current.delete(id);
        merged.set(id, layer);
      }
    }

    for (const [id, layer] of merged) {
      if (!next.has(id) && layer.opacity > 0) {
        fadingIn.current.delete(id);
        merged.set(id, { ...layer, opacity: 0 });
        const existingTimer = fadeTimers.current.get(id);
        if (existingTimer) window.clearTimeout(existingTimer);
        const fadeMs = fadeMsFor(layer, talking, blinkModeLive);
        const removeAfter = fadeMs + 40;
        const timer = window.setTimeout(() => {
          prevIds.current.delete(id);
          fadeTimers.current.delete(id);
          setDisplay(Array.from(prevIds.current.values()).sort((a, b) => a.z - b.z));
        }, removeAfter);
        fadeTimers.current.set(id, timer);
      }
    }

    prevIds.current = merged;
    setDisplay(Array.from(merged.values()).sort((a, b) => a.z - b.z));

    if (incoming.length) {
      if (fadeRaf.current) window.clearTimeout(fadeRaf.current);
      // Wait one paint at opacity 0 so CSS can interpolate 0 → target (not a hard cut in).
      const incomingDelay = 48;
      fadeRaf.current = window.setTimeout(() => {
        for (const [id, layer] of incoming) {
          if (!prevIds.current.has(id)) continue;
          prevIds.current.set(id, layer);
          fadingIn.current.delete(id);
        }
        setDisplay(Array.from(prevIds.current.values()).sort((a, b) => a.z - b.z));
      }, incomingDelay);
    }
  }, [plates, talking, blinkModeLive]);

  useEffect(() => {
    return () => {
      for (const t of fadeTimers.current.values()) window.clearTimeout(t);
      fadeTimers.current.clear();
      if (fadeRaf.current) window.clearTimeout(fadeRaf.current);
    };
  }, []);

  const stageReady = Boolean(idleSheetUrl && idleBitmapUrl === idleSheetUrl);
  const talkOverlay = display.find((layer) => layer.role === "talk");
  const idleReady = Boolean(idleSheetUrl && idleBitmapUrl === idleSheetUrl);

  const paintIdleCanvas = useCallback(() => {
    const state = paintStateRef.current;
    const canvas = idleCanvasRef.current;
    const idleImg = idleBitmapRef.current;
    const bodyPainted =
      canvas != null &&
      paintedCanvasRef.current === canvas &&
      paintedUrlRef.current === state.idleSheetUrl;
    const plan = planIdleCanvasDraws({
      canvasMounted: canvas != null,
      idleReady: state.idleReady,
      bodyPainted,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      blink: state.blinkShown,
      eyesReady: state.eyesReady,
      lidsOnCanvas: lidsOnCanvasRef.current,
      allowLids: state.restingBlink,
    });
    if (!canvas || !idleImg || plan.length === 0) return;
    const drawsBody = plan.some((step) => step.kind === "body");
    if (drawsBody) {
      // Reset once so a remount cannot source-over idle.png onto itself.
      // Blink frames must not reach this — resizing clears the body.
      canvas.width = IDLE_BLINK_CANVAS.width;
      canvas.height = IDLE_BLINK_CANVAS.height;
    } else if (canvas.width !== IDLE_BLINK_CANVAS.width || canvas.height !== IDLE_BLINK_CANVAS.height) {
      return;
    }
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const patchSrc = idleBlinkPatchSrc(state.blinkShown);
    const lid = patchSrc ? (eyeImageRef.current[patchSrc] ?? null) : null;
    applyIdleCanvasPlan(plan, ctx, { idle: idleImg, lid });
    if (drawsBody) {
      paintedCanvasRef.current = canvas;
      paintedUrlRef.current = state.idleSheetUrl;
      lidsOnCanvasRef.current = false;
    }
    const eyeStep = plan.find((step) => step.kind === "eyes");
    if (eyeStep?.kind === "eyes") {
      if (eyeStep.mode === "lid" && lid) lidsOnCanvasRef.current = true;
      if (eyeStep.mode === "glare") lidsOnCanvasRef.current = false;
    }
  }, []);

  const bindIdleCanvas = useCallback(
    (node: HTMLCanvasElement | null) => {
      idleCanvasRef.current = node;
      if (!node) {
        paintedCanvasRef.current = null;
        paintedUrlRef.current = null;
        lidsOnCanvasRef.current = false;
        return;
      }
      // Mount: draw idle.png before the browser shows the canvas.
      paintIdleCanvas();
    },
    [paintIdleCanvas],
  );

  // idle.png becoming ready, and each blink frame. The canvas mounts in the
  // idleBitmapUrl commit — that has to be a dependency, or the bitmap stays
  // the browser default 300×150 and the dest rect (y=193) never lands.
  useLayoutEffect(() => {
    paintStateRef.current = {
      blinkShown,
      eyesReady,
      idleReady,
      idleSheetUrl: idleSheetUrl ?? null,
      restingBlink,
    };
    paintIdleCanvas();
  }, [blinkShown, eyesReady, idleBitmapUrl, idleSheetUrl, idleReady, restingBlink, paintIdleCanvas]);

  return (
    <div
      ref={stageRef}
      className={cn("rai-stage", !stageReady && "rai-stage-pending", className)}
      aria-hidden="true"
      data-rai-engine="png-puppet"
      data-rai-pose={pose}
      data-rai-emotion={emotion}
      data-rai-talking={talking ? "1" : "0"}
      data-rai-blink={blinkShown > 0 && restingBlink ? "1" : "0"}
      data-rai-talk-flap={talkOverlay ? talkOverlay.opacity.toFixed(3) : "0"}
    >
      <div data-rai-rig className="rai-rig">
        {display.map((layer) => {
          if (layer.role === "eyes" || isFullBlinkPlate(layer.src)) return null;
          const src = sheets[layer.src];
          if (!src) return null;
          const style = {
            opacity: layer.opacity,
            zIndex: layer.z,
            transition: isInstantLayer(layer, talking)
              ? "none"
              : `opacity ${fadeMsFor(layer, talking, blinkModeLive)}ms var(--ease-smooth-out)`,
          };
          if (layer.role === "body" && layer.src === SPRITES.poses.idle) {
            if (idleBitmapUrl !== src) return null;
            return (
              <canvas
                key={layer.id}
                ref={bindIdleCanvas}
                width={IDLE_BLINK_CANVAS.width}
                height={IDLE_BLINK_CANVAS.height}
                className="rai-layer"
                data-rai-role="body"
                data-rai-sheet="idle"
                style={style}
              />
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
              data-rai-sheet={undefined}
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
