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
  USE_EXPO_TALK_BUST,
  type EmotionId,
  type PoseId,
} from "@/lib/rai";
import {
  IDLE_BLINK_FIRST_MS,
  IDLE_BLINK_GAP_MAX_MS,
  IDLE_BLINK_GAP_MIN_MS,
  framingTopRatio,
  framingZoomForViewport,
  idleBlinkSchedule,
  idleBlinkStepName,
  puppetIdleMotion,
  puppetRigTransform,
  snapPuppetSheet,
  snapStageHeight,
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

type SheetBox = { width: number; height: number; top: number; left: number };

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

/**
 * Star Rai 2D puppet — planted idle life, look-at lean, talk/mood sheets.
 * Studio-white cards are punched to alpha. Exactly one body image.
 * Pose, talk, and blink are hard src cuts. No opacity crossfade and no
 * second sheet stacked under the body.
 * Spoken bubble holds talk/mood through the line; frown idle is rest-only.
 * Rest idle is one full-frame image. Blink is on (IDLE_BLINK_ENABLED):
 * hard cuts 02 → 03 → 04 → 03 → 02 in ~300ms, then hold 01.
 * Approved by TyLo on 2026-09-26 (807-referenced painted lids, pass 4b).
 * No eye strip, no hole overlay, no second image for lids. Expo bust
 * mouth/eye crops stay off. Dedicated poses do not blink.
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
  const [sheets, setSheets] = useState<Record<string, string>>({});
  const [sheetBox, setSheetBox] = useState<SheetBox | null>(null);
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
      blinkRef.current = 0;
      setBlink(0);
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
        ahoge.style.transform = `rotate(${motion.hairDeg.toFixed(2)}deg)`;
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
    () => desired.filter((layer) => layer.role === "body" && !isRetiredBlinkSrc(layer.src)),
    [desired],
  );

  // Whole-pixel stage height and a 1008:1792 sheet. Framing zoom is an integer size.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const apply = () => {
      const parent = stage.parentElement;
      const rawH = (parent ?? stage).getBoundingClientRect().height;
      const snapped = snapStageHeight(rawH);
      if (snapped > 0) stage.style.height = `${snapped}px`;

      const rig = stage.querySelector<HTMLElement>("[data-rai-rig]");
      if (!rig) return;
      const box = rig.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0) return;
      const zoom = framingZoomForViewport(window.innerWidth, window.innerHeight);
      const sheet = snapPuppetSheet(box.height, zoom);
      const top = Math.round(box.height * framingTopRatio(window.innerWidth));
      const left = Math.round((box.width - sheet.width) / 2);
      setSheetBox((prev) =>
        prev &&
        prev.width === sheet.width &&
        prev.height === sheet.height &&
        prev.top === top &&
        prev.left === left
          ? prev
          : { width: sheet.width, height: sheet.height, top, left },
      );
    };

    apply();
    const ro = new ResizeObserver(apply);
    if (stage.parentElement) ro.observe(stage.parentElement);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  const restPunched = sheets[idleRestSrc()];
  const stageReady = Boolean(restPunched);
  const blinkFrame = restingBlink ? idleBlinkStepName(blinkShown) : "off";
  // One body plate. Rest blink keeps IDLE_REST_LAYER_ID and only swaps src.
  const bodyPlate = plates[0] ?? null;
  const restOnly = Boolean(bodyPlate && plates.length === 1 && bodyPlate.id === IDLE_REST_LAYER_ID);
  const restOnlySrc = restOnly && bodyPlate ? sheets[bodyPlate.src] : undefined;
  const shownSrc = bodyPlate ? sheets[bodyPlate.src] : undefined;

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
      data-rai-talk-flap="0"
    >
      <div data-rai-rig className="rai-rig">
        {shownSrc && bodyPlate ? (
          <img
            key={restOnly ? IDLE_REST_LAYER_ID : bodyPlate.id}
            src={restOnly ? restOnlySrc : shownSrc}
            alt=""
            draggable={false}
            decoding="sync"
            className="rai-layer"
            data-rai-role="body"
            data-rai-sheet={restOnly ? blinkFrame : undefined}
            style={{
              opacity: 1,
              zIndex: 1,
              transition: "none",
              width: sheetBox ? `${sheetBox.width}px` : undefined,
              height: sheetBox ? `${sheetBox.height}px` : undefined,
              top: sheetBox ? `${sheetBox.top}px` : undefined,
              left: sheetBox ? `${sheetBox.left}px` : undefined,
            }}
          />
        ) : null}
        {/* Ahoge / hair tip proxy — rotates over the crown */}
        <span data-rai-ahoge className="rai-ahoge" />
      </div>
    </div>
  );
}
