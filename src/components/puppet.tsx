import { useEffect, useMemo, useRef, useState } from "react";
import {
  allSpriteUrls,
  canIdleBlink,
  IDLE_BLINK_ENABLED,
  IDLE_REST_LAYER_ID,
  idleBlinkFrameUrls,
  idleRestSrc,
  isRetiredBlinkSrc,
  layersFor,
  POSE_CROSSFADE_MS,
  USE_EXPO_TALK_BUST,
  type EmotionId,
  type PoseId,
  type SpriteLayer,
} from "@/lib/rai";
import {
  IDLE_BEAT_FADE_MS,
  IDLE_BLINK_FIRST_MS,
  IDLE_BLINK_GAP_MAX_MS,
  IDLE_BLINK_GAP_MIN_MS,
  idleBlinkSchedule,
  idleBlinkStepName,
  puppetIdleMotion,
  puppetRigTransform,
  type IdleBlinkFrame,
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
  if (layer.role === "eyes") return true;
  return talking && (layer.id === "talk" || layer.role === "talk");
}

/** off = pose timing. snap = cut to the new sheet when a blink is cancelled. */
type BlinkFadeMode = "off" | "snap";

function fadeMsFor(layer: SpriteLayer, talking: boolean, blinkMode: BlinkFadeMode): number {
  if (isInstantLayer(layer, talking)) return 0;
  if (layer.id.startsWith("idle-beat")) return IDLE_BEAT_FADE_MS;
  if (layer.id === "expo-talk") return 180;
  // Pose / talk / emotion swap mid-blink: cut, don't ease the closed frame out.
  if (blinkMode === "snap") return 0;
  return POSE_CROSSFADE_MS;
}

/**
 * Star Rai 2D puppet — planted idle life, look-at lean, talk/mood sheets.
 * Studio-white cards are punched to alpha. Layers crossfade by stable id.
 * Spoken bubble holds talk/mood through the line; frown idle is rest-only.
 * Rest idle is one full-frame image: public/rai/idle.png.
 * Blink is parked (IDLE_BLINK_ENABLED). The timer does not cycle frames.
 * The baked sheets stay on disk but are not swapped in. No eye strip,
 * no hole overlay, no second <img> for lids. Expo bust mouth/eye crops
 * stay off. Dedicated poses do not blink.
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
  const [blink, setBlink] = useState<IdleBlinkFrame>(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [display, setDisplay] = useState<DisplayLayer[]>([]);
  const [sheets, setSheets] = useState<Record<string, string>>({});
  const prevIds = useRef<Map<string, DisplayLayer>>(new Map());
  const fadeTimers = useRef<Map<string, number>>(new Map());
  const fadingIn = useRef<Set<string>>(new Set());
  const fadeRaf = useRef(0);
  const [blinkMode, setBlinkMode] = useState<BlinkFadeMode>("off");
  const blinkRef = useRef<IdleBlinkFrame>(0);

  // Punch studio-white cards to alpha, then decode so pose swaps never flash a plate.
  // Blink frames are decoded before they enter `sheets`, so a src swap is one image.
  useEffect(() => {
    let cancelled = false;
    const blinkFrames = idleBlinkFrameUrls();
    const blinkSet = new Set(blinkFrames);
    const urls = allSpriteUrls();
    const ordered = [...blinkFrames, ...urls.filter((src) => !blinkSet.has(src))];
    for (const src of ordered) {
      if (isRetiredBlinkSrc(src)) continue;
      void punchedSpriteUrl(src).then(async (url) => {
        if (blinkSet.has(src)) {
          const img = new Image();
          img.decoding = "async";
          img.src = url;
          try {
            await img.decode();
          } catch {
            // Store the URL anyway. The blink timer stays off until every frame lands.
          }
        }
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

  // Full-frame blink on rest idle only, after the four baked sheets have decoded.
  // Parked (IDLE_BLINK_ENABLED false): this effect returns before any timeout,
  // so the timer does not cycle frames. TyLo FAIL was two PNGs at once
  // (ghost / second body). Stay parked until a standing clip shows one body,
  // lids only, no ghost.
  const restingBlink = canIdleBlink({ pose, emotion, talking, reducedMotion });
  const framesReady = idleBlinkFrameUrls().every((src) => sheets[src] != null);
  useEffect(() => {
    if (!IDLE_BLINK_ENABLED) return;
    if (USE_EXPO_TALK_BUST || !framesReady || !restingBlink) return;

    let cancelled = false;
    let timer = 0;

    const stop = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
    };

    const gapMs = () =>
      IDLE_BLINK_GAP_MIN_MS + Math.random() * (IDLE_BLINK_GAP_MAX_MS - IDLE_BLINK_GAP_MIN_MS);

    // Chain one timeout per step, measured from when that frame is shown.
    // A 50ms half on this long shot is over before the eye band can be read.
    const runCycle = () => {
      if (cancelled || reducedRef.current || talkingRef.current) return;
      const steps = idleBlinkSchedule();
      const show = (index: number) => {
        if (cancelled || reducedRef.current || talkingRef.current) return;
        const step = steps[index];
        if (!step) return;
        blinkRef.current = step.blink;
        setBlink(step.blink);
        const upcoming = steps[index + 1];
        if (!upcoming) {
          timer = window.setTimeout(runCycle, gapMs());
          return;
        }
        timer = window.setTimeout(show, upcoming.at - step.at, index + 1);
      };
      show(0);
    };

    timer = window.setTimeout(runCycle, IDLE_BLINK_FIRST_MS);
    return () => {
      cancelled = true;
      stop();
      const midBlink = blinkRef.current > 0;
      blinkRef.current = 0;
      setBlink(0);
      if (midBlink) setBlinkMode("snap");
    };
  }, [restingBlink, framesReady]);

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

  const blinkShown = !IDLE_BLINK_ENABLED
    ? 0
    : USE_EXPO_TALK_BUST
      ? blink
      : framesReady
        ? blink
        : 0;
  // Pose / talk / emotion can change a frame before the blink timer cleans up.
  // Derive snap in that render so the next sheet cuts in instead of easing from a closed frame.
  let blinkModeLive: BlinkFadeMode = blinkMode;
  if (!USE_EXPO_TALK_BUST && !restingBlink && blinkShown > 0) {
    blinkModeLive = "snap";
  }

  const desired = useMemo(
    () =>
      layersFor({
        pose,
        emotion,
        talking,
        amplitude: ampLive,
        angle: 0,
        talkPhase: 0,
        blink: blinkShown,
        idleBeat: "none",
        reducedMotion,
      }),
    [pose, emotion, talking, ampLive, blinkShown, reducedMotion],
  );
  const plates = useMemo(
    () => desired.filter((layer) => layer.role !== "eyes" && !isRetiredBlinkSrc(layer.src)),
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
  // Rest blink keeps IDLE_REST_LAYER_ID, so a frame step updates that one layer.
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

  const restPunched = sheets[idleRestSrc()];
  const stageReady = Boolean(restPunched);
  const talkOverlay = display.find((layer) => layer.role === "talk");
  const blinkFrame = restingBlink ? idleBlinkStepName(blinkShown) : "off";
  // Rest blink is one full frame. Pose crossfade may still overlap a sheet on
  // the way in or out; once that handoff is done, paint only this sprite.
  const restPlate = plates.length === 1 && plates[0]?.id === IDLE_REST_LAYER_ID ? plates[0] : null;
  const poseHandoff = display.some((layer) => layer.id !== IDLE_REST_LAYER_ID && layer.opacity > 0.01);
  const restOnly = Boolean(restPlate) && !poseHandoff;
  const restOnlySrc = restPlate ? sheets[restPlate.src] : undefined;

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
      data-rai-blink-frame={blinkFrame}
      data-rai-talk-flap={talkOverlay ? talkOverlay.opacity.toFixed(3) : "0"}
    >
      <div data-rai-rig className="rai-rig">
        {restOnly && restOnlySrc ? (
          <img
            key={IDLE_REST_LAYER_ID}
            src={restOnlySrc}
            alt=""
            draggable={false}
            decoding="sync"
            className="rai-layer"
            data-rai-role="body"
            data-rai-sheet={blinkFrame}
            style={{ opacity: 1, zIndex: 1, transition: "none" }}
          />
        ) : (
          display.map((layer) => {
            if (layer.role === "eyes" || isRetiredBlinkSrc(layer.src)) return null;
            const src = sheets[layer.src];
            if (!src) return null;
            const fadeMs = fadeMsFor(layer, talking, blinkModeLive);
            // A visible rest frame never opacity-blends. Src swaps are a cut.
            // Fading this sheet out for a pose still uses the pose crossfade.
            const restHardCut = layer.id === IDLE_REST_LAYER_ID && layer.opacity > 0;
            const style = {
              opacity: layer.opacity,
              zIndex: layer.z,
              transition:
                restHardCut || isInstantLayer(layer, talking) || fadeMs === 0
                  ? "none"
                  : `opacity ${fadeMs}ms var(--ease-smooth-out)`,
            };
            return (
              <img
                key={layer.id}
                src={src}
                alt=""
                draggable={false}
                decoding="async"
                className="rai-layer"
                data-rai-role={layer.role}
                data-rai-sheet={layer.id === IDLE_REST_LAYER_ID ? blinkFrame : undefined}
                style={style}
              />
            );
          })
        )}
        {/* Ahoge / hair tip proxy — rotates over the crown */}
        <span data-rai-ahoge className="rai-ahoge" />
      </div>
    </div>
  );
}
