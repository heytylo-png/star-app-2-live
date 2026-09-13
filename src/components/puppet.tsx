import { useEffect, useMemo, useRef, useState } from "react";
import {
  allSpriteUrls,
  layersFor,
  type EmotionId,
  type PoseId,
  type SpriteLayer,
} from "@/lib/rai";
import { cn } from "@/lib/utils";

type PuppetProps = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  className?: string;
};

type DisplayLayer = SpriteLayer & { z: number };

const FADE_MS = 280;
const LOOK_LERP = 6.5; // higher = snappier; frame-rate independent
const LOOK_DISPLAY_LERP = 4.2;
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
 * Star Rai 2D puppet — idle life, look-at, amplitude visemes, mid-shot framing.
 * Layers crossfade by stable id so pose changes never hard-pop.
 * Expo talk busts share id "expo-talk"; img key includes src so mouth frames remount.
 */
export function Puppet({ pose, emotion, talking, amplitude, className }: PuppetProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerTarget = useRef(0);
  const lookSmooth = useRef(0);
  const lookForLayers = useRef(0);
  const ampSmooth = useRef(0);
  const ampTarget = useRef(amplitude);
  const talkingRef = useRef(talking);
  const lastTs = useRef(0);
  const raf = useRef(0);
  const reducedRef = useRef(false);
  const jawLive = useRef(0);

  ampTarget.current = amplitude;
  talkingRef.current = talking;

  const [lookAngle, setLookAngle] = useState(0);
  const [ampLive, setAmpLive] = useState(0);
  const [blink, setBlink] = useState<0 | 1 | 2>(0);
  const [display, setDisplay] = useState<DisplayLayer[]>([]);
  const prevIds = useRef<Map<string, DisplayLayer>>(new Map());
  const fadeTimers = useRef<Map<string, number>>(new Map());

  // Preload every sprite (Helix + Expo talk pack).
  useEffect(() => {
    const urls = allSpriteUrls();
    for (const src of urls) {
      const img = new Image();
      img.decoding = "async";
      img.src = src;
    }
  }, []);

  useEffect(() => {
    const mq =
      typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const sync = () => {
      reducedRef.current = mq?.matches ?? false;
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
    jawLive.current = Math.max(jawLive.current, kick);
    setAmpLive((prev) => Math.max(prev, kick));
  }, [talking]);

  // Blink every ~1.8–3s while talking — no amp gate; ~150ms half→closed→half.
  useEffect(() => {
    if (reducedRef.current) return;
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

  // Idle life + look-at + amp smoothing — DOM transforms, minimal React.
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
      lookForLayers.current = expApproach(
        lookForLayers.current,
        lookSmooth.current,
        LOOK_DISPLAY_LERP,
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
      jawLive.current = jaw;

      // Publish look/amp to React at a gentler cadence (angle layers / visemes).
      setLookAngle((prev) =>
        Math.abs(prev - lookForLayers.current) > 0.012 ? lookForLayers.current : prev,
      );
      setAmpLive((prev) => (Math.abs(prev - jaw) > 0.02 ? jaw : prev));

      const sway = reduced ? 0 : Math.sin(t * 0.95) * 5.5 + Math.sin(t * 0.37) * 2.2;
      const rock = reduced ? 0 : Math.sin(t * 0.55) * 1.15 + lookSmooth.current * -1.4;
      const breathe = reduced ? 1 : 1 + Math.sin(t * 1.05) * 0.012 + Math.sin(t * 0.48) * 0.004;
      const hair = reduced
        ? 0
        : Math.sin(t * 2.1) * 5.5 + Math.sin(t * 1.05) * 2.2 + lookSmooth.current * 3;
      const talkBob =
        reduced || !talkingRef.current ? 0 : Math.sin(t * 7.5) * jaw * 1.8;

      const node = stageRef.current?.querySelector<HTMLElement>("[data-rai-rig]");
      const ahoge = stageRef.current?.querySelector<HTMLElement>("[data-rai-ahoge]");
      if (node) {
        const ax = lookSmooth.current;
        node.style.transform = [
          "perspective(1400px)",
          `rotateY(${(-ax * 16).toFixed(2)}deg)`,
          `translateY(${(sway + talkBob).toFixed(2)}px)`,
          `rotateZ(${(rock + sway * 0.05).toFixed(2)}deg)`,
          `scale(${breathe.toFixed(4)})`,
        ].join(" ");
      }
      if (ahoge) {
        ahoge.style.transform = `rotate(${hair.toFixed(2)}deg) scaleY(${(1 + Math.sin(t * 2.4) * 0.04).toFixed(3)})`;
      }

      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const desired = useMemo(
    () =>
      layersFor({
        pose,
        emotion,
        talking,
        amplitude: ampLive,
        angle: lookAngle,
        blink,
      }),
    [pose, emotion, talking, ampLive, lookAngle, blink],
  );

  // Crossfade pool: keep outgoing layers at opacity 0 until fade completes.
  // expo-talk keeps a stable id in the pool; React img key includes src for hard remount.
  useEffect(() => {
    const next = new Map<string, DisplayLayer>();
    desired.forEach((layer, i) => {
      next.set(layer.id, { ...layer, z: layer.role === "talk" ? 20 + i : i });
    });

    const merged = new Map(prevIds.current);

    for (const [id, layer] of next) {
      const existingTimer = fadeTimers.current.get(id);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        fadeTimers.current.delete(id);
      }
      merged.set(id, layer);
    }

    for (const [id, layer] of merged) {
      if (!next.has(id) && layer.opacity > 0) {
        merged.set(id, { ...layer, opacity: 0 });
        const existingTimer = fadeTimers.current.get(id);
        if (existingTimer) window.clearTimeout(existingTimer);
        const timer = window.setTimeout(() => {
          prevIds.current.delete(id);
          fadeTimers.current.delete(id);
          setDisplay(Array.from(prevIds.current.values()).sort((a, b) => a.z - b.z));
        }, FADE_MS + 40);
        fadeTimers.current.set(id, timer);
      }
    }

    prevIds.current = merged;
    setDisplay(Array.from(merged.values()).sort((a, b) => a.z - b.z));
  }, [desired]);

  useEffect(() => {
    return () => {
      for (const t of fadeTimers.current.values()) window.clearTimeout(t);
      fadeTimers.current.clear();
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className={cn("relative h-full w-full overflow-hidden bg-stage", className)}
      aria-hidden="true"
    >
      {/* White studio mid-shot backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_22%,#ffffff_0%,#f7f4ee_42%,#ebe6dc_78%,#e4ddd2_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-[#e8e2d8]/90 via-[#ebe6dc]/35 to-transparent" />

      {/*
        Framing: header clearance + bottom chrome room so feet/head aren't clipped.
        Character owns the vertical stage between chrome bands.
      */}
      <div
        data-rai-rig
        className="absolute inset-x-0 top-[max(3.25rem,env(safe-area-inset-top))] bottom-[clamp(7.5rem,28vh,11rem)] origin-center will-change-transform sm:inset-x-[8%] md:inset-x-[14%] lg:inset-x-[18%]"
        style={{ transformOrigin: "50% 38%" }}
      >
        {display.map((layer) => (
          <img
            key={`${layer.id}:${layer.src}`}
            src={layer.src}
            alt=""
            draggable={false}
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain object-[center_12%] select-none"
            style={{
              opacity: layer.opacity,
              zIndex: layer.z,
              // Soft crossfade for pose/mode changes; expo-talk src swaps remount via key.
              transition:
                layer.id === "expo-talk"
                  ? "opacity 180ms var(--ease-smooth-out)"
                  : `opacity ${FADE_MS}ms var(--ease-smooth-out)`,
            }}
          />
        ))}
        {/* Ahoge / hair tip proxy — rotates over the crown */}
        <span
          data-rai-ahoge
          className="pointer-events-none absolute top-[1%] left-[40%] h-[16%] w-[24%] origin-[48%_100%] will-change-transform"
        />
      </div>
    </div>
  );
}
