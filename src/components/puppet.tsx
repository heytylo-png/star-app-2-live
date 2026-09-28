import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  blinkPassInFlight,
  canIdleBlink,
  canIdleMouth,
  deferredSpriteUrls,
  IDLE_BLINK_ENABLED,
  IDLE_MOUTH_ENABLED,
  IDLE_REST_LAYER_ID,
  idleBlinkFrameUrls,
  idleMouthFrameUrls,
  idleRestSrc,
  isRetiredBlinkSrc,
  layersFor,
  openRestFallback,
  POSE_CROSSFADE_MS,
  priorityPoseSrc,
  startupSpriteUrls,
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
  idleMouthStepName,
  idleMouthSyllable,
  isHypeLine,
  puppetIdleMotion,
  puppetRigTransform,
  type IdleBlinkFrame,
  type IdleMouthFrame,
  type IdleMouthStep,
} from "@/lib/rai-motion";
import { punchedSpriteUrl } from "@/lib/punch-white";
import { sheetBox } from "@/lib/rai-sheet-box";
import { cn } from "@/lib/utils";

type PuppetProps = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  /** Line she is saying. Only read for the hype (05 wide) mouth gate. */
  spokenLine?: string;
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
 * Rest idle is one full-frame image. Blink is on (IDLE_BLINK_ENABLED):
 * hard cuts 02 → 03 → 04 → 03 → 02 in ~300ms, then hold 01.
 * Approved by TyLo on 2026-09-26 (807-referenced painted lids, pass 4b).
 * No eye strip, no hole overlay, no second <img> for lids. Expo bust
 * mouth/eye crops stay off. Dedicated poses do not blink.
 * Talking on the idle pose (IDLE_MOUTH_ENABLED) hard-cuts the same rest
 * <img> through the baked idle_mouth sheets; blink waits until she is done.
 */
export function Puppet({ pose, emotion, talking, amplitude, spokenLine, className }: PuppetProps) {
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
  const hypeRef = useRef(false);
  /** Real TTS amplitude has arrived on this line (audio is playing). */
  const ampSeenRef = useRef(false);
  useEffect(() => {
    hypeRef.current = isHypeLine(spokenLine);
  }, [spokenLine]);
  useEffect(() => {
    if (!talking) ampSeenRef.current = false;
    else if (amplitude > 0.03) ampSeenRef.current = true;
  }, [talking, amplitude]);

  const [ampLive, setAmpLive] = useState(0);
  const [blink, setBlink] = useState<IdleBlinkFrame>(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [display, setDisplay] = useState<DisplayLayer[]>([]);
  const [sheets, setSheets] = useState<Record<string, string>>({});
  const prevIds = useRef<Map<string, DisplayLayer>>(new Map());
  const fadeTimers = useRef<Map<string, number>>(new Map());
  const fadingIn = useRef<Set<string>>(new Set());
  const fadeRaf = useRef(0);
  /** Outgoing ids whose opacity-0 is waiting on the shared fade-in timer. */
  const pendingOutIds = useRef<string[]>([]);
  const [blinkMode, setBlinkMode] = useState<BlinkFadeMode>("off");
  const blinkRef = useRef<IdleBlinkFrame>(0);
  const [mouth, setMouth] = useState<IdleMouthFrame>(0);
  const mouthRef = useRef<IdleMouthFrame>(0);
  const punchOneRef = useRef<(src: string) => Promise<void>>(async () => {});

  // Punch studio-white cards to alpha, then decode so pose swaps never flash a plate.
  // Startup is idle.png then blink 01–04, one file at a time. Every other live
  // pose sheet waits for requestIdleCallback (setTimeout fallback) so it is not
  // one startup task. Blink frames are decoded before they enter `sheets`.
  useEffect(() => {
    let cancelled = false;
    let idleHandle = 0;
    let timeoutHandle = 0;
    // Blink and mouth sheets are decoded before they enter `sheets`, so a
    // hard cut never lands on an undecoded (blank) frame.
    const blinkSet = new Set([...idleBlinkFrameUrls(), ...idleMouthFrameUrls()]);
    const restSrc = idleRestSrc();
    const jobs = new Map<string, Promise<void>>();

    const clearSchedule = () => {
      if (idleHandle) {
        window.cancelIdleCallback(idleHandle);
        idleHandle = 0;
      }
      if (timeoutHandle) {
        window.clearTimeout(timeoutHandle);
        timeoutHandle = 0;
      }
    };

    const store = (src: string, url: string, aliasRest: boolean) => {
      if (cancelled) return;
      setSheets((prev) => {
        const next = { ...prev };
        let changed = false;
        if (next[src] !== url) {
          next[src] = url;
          changed = true;
        }
        // 01 open is a byte copy of idle.png. Paint that punched URL so the
        // rest layer does not wait on a second identical punch.
        if (aliasRest && next[restSrc] == null) {
          next[restSrc] = url;
          changed = true;
        }
        return changed ? next : prev;
      });
    };

    const punchOne = (src: string, aliasRest: boolean) => {
      const existing = jobs.get(src);
      if (existing) return existing;
      const job = (async () => {
        if (isRetiredBlinkSrc(src)) return;
        const url = await punchedSpriteUrl(src);
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
        store(src, url, aliasRest);
      })();
      jobs.set(src, job);
      return job;
    };
    punchOneRef.current = (src) => punchOne(src, false);

    const afterPaint = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

    const scheduleIdle = (run: () => void) => {
      if (typeof window.requestIdleCallback === "function") {
        idleHandle = window.requestIdleCallback(
          () => {
            idleHandle = 0;
            run();
          },
          { timeout: 1500 },
        );
        return;
      }
      timeoutHandle = window.setTimeout(() => {
        timeoutHandle = 0;
        run();
      }, 1);
    };

    const run = async () => {
      const startup = startupSpriteUrls();
      for (let i = 0; i < startup.length; i++) {
        if (cancelled) return;
        const src = startup[i]!;
        await punchOne(src, i === 0 && src !== restSrc);
        if (cancelled) return;
        if (i === 0) await afterPaint();
      }
      const deferred = deferredSpriteUrls();
      let index = 0;
      const step = () => {
        if (cancelled || index >= deferred.length) return;
        // A lid cut is 60ms, a mouth cut ~100ms. A deferred punch on that slice stretches it.
        if (blinkPassInFlight(blinkRef.current) || mouthRef.current > 1) {
          timeoutHandle = window.setTimeout(() => {
            timeoutHandle = 0;
            step();
          }, 16);
          return;
        }
        while (index < deferred.length && jobs.has(deferred[index]!)) index += 1;
        if (index >= deferred.length) return;
        const src = deferred[index]!;
        index += 1;
        void punchOne(src, false).then(() => {
          if (cancelled) return;
          scheduleIdle(step);
        });
      };
      scheduleIdle(step);
    };

    void run();
    return () => {
      cancelled = true;
      punchOneRef.current = async () => {};
      clearSchedule();
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
  // Blink is on, approved by TyLo on 2026-09-26 (807-referenced painted lids,
  // pass 4b). The flag gate stays: a false flag returns before any timeout.
  // One body, hard-swapped lids, no second PNG.
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
      // Mouth owns the one rest <img> while she speaks. Wait for it to hand back 01.
      if (mouthRef.current > 0) {
        timer = window.setTimeout(runCycle, IDLE_BLINK_FIRST_MS);
        return;
      }
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
      // Leaving rest (a pose, talk, or emotion) cancels the lid pass.
      // The open-frame fallback paints that same commit; this drops the lid state.
      const midBlink = blinkRef.current > 0;
      blinkRef.current = 0;
      setBlink(0);
      if (midBlink) setBlinkMode("snap");
    };
  }, [restingBlink, framesReady]);

  // Idle talking mouth. Speaking on the idle pose only, after the five mouth
  // sheets have decoded. Hard cuts on the same rest <img>: 01 → 02 → 03 → 02
  // → 01, ~90–120ms a cut, with 04/06 spice and 05 on hype lines. Blink is
  // paused for the line (canIdleBlink is false while talking); on exit this
  // drops back to 01 and the blink timer starts again from open lids.
  const talkingIdle = canIdleMouth({ pose, emotion, talking, reducedMotion });
  const mouthReady = idleMouthFrameUrls().every((src) => sheets[src] != null);
  useEffect(() => {
    if (!IDLE_MOUTH_ENABLED) return;
    if (!talkingIdle || !mouthReady) return;

    let cancelled = false;
    let timer = 0;
    let queue: IdleMouthStep[] = [];

    const show = () => {
      timer = 0;
      if (cancelled || reducedRef.current || !talkingRef.current) return;
      if (!queue.length) {
        queue = idleMouthSyllable({
          hype: hypeRef.current,
          amplitude: ampTarget.current,
          ampLive: ampSeenRef.current,
        });
      }
      const step = queue.shift()!;
      mouthRef.current = step.mouth;
      setMouth(step.mouth);
      timer = window.setTimeout(show, step.ms);
    };

    show();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      mouthRef.current = 0;
      setMouth(0);
    };
  }, [talkingIdle, mouthReady]);

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

  // Sharpness: size and place the sheet box in whole device pixels (the long-shot
  // zoom used to be transform: scale on top of a composited rig, which
  // resampled the sheet twice). CSS calc() fallbacks cover the first paint.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const rig = stage?.querySelector<HTMLElement>("[data-rai-rig]");
    if (!stage || !rig) return;
    let queued = 0;
    const apply = () => {
      queued = 0;
      const cs = getComputedStyle(rig);
      const rigW = parseFloat(cs.width);
      const rigH = parseFloat(cs.height);
      const zoom = parseFloat(cs.getPropertyValue("--rai-sheet-zoom"));
      const topFrac = parseFloat(cs.getPropertyValue("--rai-sheet-top"));
      if (!(rigW > 0 && rigH > 0)) return;
      const sr = stage.getBoundingClientRect();
      const box = sheetBox({
        originX: sr.left + stage.clientLeft + (parseFloat(cs.left) || 0),
        originY: sr.top + stage.clientTop + (parseFloat(cs.top) || 0),
        rigW,
        rigH,
        zoom: Number.isFinite(zoom) ? zoom : 1,
        topFrac: Number.isFinite(topFrac) ? topFrac : 0,
        dpr: window.devicePixelRatio || 1,
      });
      rig.style.setProperty("--rai-sheet-x", `${box.x}px`);
      rig.style.setProperty("--rai-sheet-y", `${box.y}px`);
      rig.style.setProperty("--rai-sheet-w", `${box.w}px`);
      rig.style.setProperty("--rai-sheet-h", `${box.h}px`);
    };
    const schedule = () => {
      if (!queued) queued = requestAnimationFrame(apply);
    };
    apply();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    ro?.observe(stage);
    ro?.observe(rig);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    let mq: MediaQueryList | null = null;
    const watchDpr = () => {
      mq?.removeEventListener("change", onDpr);
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mq.addEventListener("change", onDpr);
    };
    const onDpr = () => {
      watchDpr();
      schedule();
    };
    watchDpr();
    return () => {
      if (queued) cancelAnimationFrame(queued);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      mq?.removeEventListener("change", onDpr);
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
        node.style.transform = puppetRigTransform(motion, window.devicePixelRatio || 1);
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

  const mouthShown: IdleMouthFrame = talkingIdle && mouthReady ? mouth : 0;

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
        mouth: mouthShown,
        idleBeat: "none",
        reducedMotion,
      }),
    [pose, emotion, talking, ampLive, blinkShown, mouthShown, reducedMotion],
  );
  const shownPlates = useRef<SpriteLayer[]>([]);
  const plates = useMemo(() => {
    const next = desired.filter((layer) => layer.role !== "eyes" && !isRetiredBlinkSrc(layer.src));
    const ready = next.length > 0 && next.every((layer) => sheets[layer.src] != null);
    // Unready pose: keep the last punched plates (idle, or the frame already up).
    const chosen = ready ? next : openRestFallback(shownPlates.current, idleRestSrc());
    const prev = shownPlates.current;
    const same =
      prev.length === chosen.length &&
      prev.every(
        (layer, i) =>
          layer.id === chosen[i]!.id &&
          layer.src === chosen[i]!.src &&
          layer.opacity === chosen[i]!.opacity &&
          layer.role === chosen[i]!.role,
      );
    if (same) return prev;
    shownPlates.current = chosen;
    return chosen;
  }, [desired, sheets]);

  // A pose asked for before its sheet is punched jumps the idle queue.
  // The punch cache makes a later queue pass a no-op. Plates show it only
  // while it is still the requested src.
  useEffect(() => {
    const src = priorityPoseSrc(desired, sheets);
    if (!src || isRetiredBlinkSrc(src)) return;
    void punchOneRef.current(src);
  }, [desired, sheets]);

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

    const incomingDelay = 48;
    // Start the outgoing fade in the same tick as the incoming one, so a long
    // main-thread task cannot let the compositor finish the fade-out first.
    const deferOut = incoming.length > 0;
    const outgoing: string[] = [];
    const queueOut = (id: string) => {
      if (!outgoing.includes(id)) outgoing.push(id);
    };

    for (const [id, layer] of merged) {
      if (!next.has(id) && layer.opacity > 0) {
        fadingIn.current.delete(id);
        if (deferOut) queueOut(id);
        else merged.set(id, { ...layer, opacity: 0 });
        const existingTimer = fadeTimers.current.get(id);
        if (existingTimer) window.clearTimeout(existingTimer);
        const fadeMs = fadeMsFor(layer, talking, blinkModeLive);
        const removeAfter = fadeMs + 40 + (deferOut ? incomingDelay : 0);
        const timer = window.setTimeout(() => {
          prevIds.current.delete(id);
          fadeTimers.current.delete(id);
          pendingOutIds.current = pendingOutIds.current.filter((pending) => pending !== id);
          setDisplay(Array.from(prevIds.current.values()).sort((a, b) => a.z - b.z));
        }, removeAfter);
        fadeTimers.current.set(id, timer);
      }
    }

    // A newer crossfade clears the 48ms timer. Ids still waiting must fade
    // with this one, or drop if this frame brought them back.
    for (const id of pendingOutIds.current) {
      if (next.has(id) || outgoing.includes(id)) continue;
      const layer = merged.get(id);
      if (!layer || layer.opacity <= 0) continue;
      if (deferOut) {
        queueOut(id);
        if (!fadeTimers.current.has(id)) {
          const fadeMs = fadeMsFor(layer, talking, blinkModeLive);
          const timer = window.setTimeout(() => {
            prevIds.current.delete(id);
            fadeTimers.current.delete(id);
            pendingOutIds.current = pendingOutIds.current.filter((pending) => pending !== id);
            setDisplay(Array.from(prevIds.current.values()).sort((a, b) => a.z - b.z));
          }, fadeMs + 40 + incomingDelay);
          fadeTimers.current.set(id, timer);
        }
      } else {
        merged.set(id, { ...layer, opacity: 0 });
        if (!fadeTimers.current.has(id)) {
          const fadeMs = fadeMsFor(layer, talking, blinkModeLive);
          const timer = window.setTimeout(() => {
            prevIds.current.delete(id);
            fadeTimers.current.delete(id);
            setDisplay(Array.from(prevIds.current.values()).sort((a, b) => a.z - b.z));
          }, fadeMs + 40);
          fadeTimers.current.set(id, timer);
        }
      }
    }
    pendingOutIds.current = deferOut ? outgoing.slice() : [];

    prevIds.current = merged;
    setDisplay(Array.from(merged.values()).sort((a, b) => a.z - b.z));

    if (incoming.length) {
      if (fadeRaf.current) window.clearTimeout(fadeRaf.current);
      const batch = outgoing.slice();
      // Wait one paint at opacity 0 so CSS can interpolate 0 → target (not a hard cut in).
      fadeRaf.current = window.setTimeout(() => {
        fadeRaf.current = 0;
        for (const id of batch) {
          if (!pendingOutIds.current.includes(id)) continue;
          const layer = prevIds.current.get(id);
          if (layer) prevIds.current.set(id, { ...layer, opacity: 0 });
        }
        const dropped = new Set(batch);
        pendingOutIds.current = pendingOutIds.current.filter((id) => !dropped.has(id));
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
  const mouthFrame = talkingIdle ? idleMouthStepName(mouthShown) : "off";
  // Rest blink is one full frame. Pose crossfade may still overlap a sheet on
  // the way in or out; once that handoff is done, paint only this sprite.
  const restPlate = plates.length === 1 && plates[0]?.id === IDLE_REST_LAYER_ID ? plates[0] : null;
  const poseHandoff = display.some((layer) => layer.id !== IDLE_REST_LAYER_ID && layer.opacity > 0.01);
  const restOnly = Boolean(restPlate && sheets[restPlate.src]) && !poseHandoff;
  // One list, stable keys. The rest <img> stays mounted when a pose fades in,
  // so the stage does not drop the decoded idle frame and decode it again.
  const layers: DisplayLayer[] =
    restOnly && restPlate ? [{ ...restPlate, opacity: 1, z: 1 }] : display;

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
      data-rai-mouth-frame={mouthFrame}
      data-rai-talk-flap={talkOverlay ? talkOverlay.opacity.toFixed(3) : "0"}
    >
      <div data-rai-rig className="rai-rig">
        {layers.map((layer) => {
          if (layer.role === "eyes" || isRetiredBlinkSrc(layer.src)) return null;
          const src = sheets[layer.src];
          if (!src) return null;
          const fadeMs = fadeMsFor(layer, talking, blinkModeLive);
          // A visible rest frame never opacity-blends. Src swaps are a cut.
          // Fading this sheet out for a pose still uses the pose crossfade.
          const restHardCut = layer.id === IDLE_REST_LAYER_ID && layer.opacity > 0;
          const hardCut = restHardCut || isInstantLayer(layer, talking) || fadeMs === 0;
          const style = hardCut
            ? { opacity: layer.opacity, zIndex: layer.z, transition: "none" }
            : {
                opacity: layer.opacity,
                zIndex: layer.z,
                transition: `opacity ${fadeMs}ms var(--ease-smooth-out)`,
              };
          return (
            <img
              key={layer.id}
              src={src}
              alt=""
              draggable={false}
              decoding={layer.id === IDLE_REST_LAYER_ID ? "sync" : "async"}
              className="rai-layer"
              data-rai-role={layer.role}
              data-rai-sheet={
                layer.id === IDLE_REST_LAYER_ID ? (talkingIdle ? `mouth-${mouthFrame}` : blinkFrame) : undefined
              }
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
