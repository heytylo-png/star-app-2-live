import { useEffect, useRef, useState } from "react";
import { Puppet } from "@/components/puppet";
import { sampleGirlSkeleton } from "@/lib/cutout-sample";
import {
  CutoutPlayer,
  drawCutout,
  imagePaths,
  parseCutoutSkeleton,
  rigStatus,
  type CutoutSkeleton,
} from "@/lib/cutout-runtime";
import { withBasePath, type RaiEngineId } from "@/lib/rai-engine";
import type { EmotionId, PoseId } from "@/lib/rai";
import { cn } from "@/lib/utils";

type SpineStageProps = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  className?: string;
  /** sample = geometric girl; rai = official cutout JSON (falls back if layers missing). */
  target: Extract<RaiEngineId, "spine" | "spine-rai">;
};

const LOOK_LERP = 6.5;
const AMP_LERP = 10;
const DEADZONE = 0.04;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function expApproach(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

async function loadRaiSkeleton(): Promise<CutoutSkeleton> {
  const url = withBasePath("spine/rai/skeleton.json");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`rai skeleton ${res.status}`);
  return parseCutoutSkeleton(await res.json());
}

function probeImages(paths: string[]): Promise<Set<string>> {
  return Promise.all(
    paths.map(
      (rel) =>
        new Promise<string | null>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(rel);
          img.onerror = () => resolve(null);
          img.src = withBasePath(rel);
        }),
    ),
  ).then((hits) => new Set(hits.filter((p): p is string => Boolean(p))));
}

async function loadImages(paths: string[]): Promise<Map<string, CanvasImageSource>> {
  const images = new Map<string, CanvasImageSource>();
  await Promise.all(
    paths.map(
      (rel) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => {
            images.set(rel, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = withBasePath(rel);
        }),
    ),
  );
  return images;
}

/**
 * Track #2 canvas cutout. Never the default body.
 * Load failure / missing Rai layers → official PNG puppet.
 */
export function SpineStage({ pose, emotion, talking, amplitude, className, target }: SpineStageProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [demo, setDemo] = useState(target !== "spine-rai");
  const [reducedMotion, setReducedMotion] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<CutoutPlayer | null>(null);
  const imagesRef = useRef<Map<string, CanvasImageSource>>(new Map());
  const pointerTarget = useRef(0);
  const lookSmooth = useRef(0);
  const ampSmooth = useRef(0);
  const lastTs = useRef(0);
  const raf = useRef(0);
  const reducedRef = useRef(false);
  const poseRef = useRef(pose);
  const talkingRef = useRef(talking);
  const ampTarget = useRef(amplitude);

  useEffect(() => {
    poseRef.current = pose;
    talkingRef.current = talking;
    ampTarget.current = amplitude;
  });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedRef.current = mq.matches;
      setReducedMotion(mq.matches);
      playerRef.current?.setReduced(mq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFailed(false);
    playerRef.current = null;

    const boot = async () => {
      try {
        if (target === "spine-rai") {
          const skel = await loadRaiSkeleton();
          const needed = imagePaths(skel);
          const present = await probeImages(needed);
          const status = rigStatus(skel, present);
          if (cancelled) return;
          if (!status.ready) {
            setFailed(true);
            return;
          }
          imagesRef.current = await loadImages(needed);
          if (cancelled) return;
          playerRef.current = new CutoutPlayer(skel);
          setDemo(false);
        } else {
          const skel = sampleGirlSkeleton();
          playerRef.current = new CutoutPlayer(skel);
          imagesRef.current = new Map();
          setDemo(true);
        }
        playerRef.current.setPose(poseRef.current);
        playerRef.current.setReduced(reducedRef.current);
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    playerRef.current?.setPose(pose);
  }, [pose, ready]);

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
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const tick = (now: number) => {
      const dt = lastTs.current ? Math.min(0.05, (now - lastTs.current) / 1000) : 0.016;
      lastTs.current = now;
      const player = playerRef.current;
      if (player) {
        lookSmooth.current = expApproach(lookSmooth.current, pointerTarget.current, LOOK_LERP, dt);
        ampSmooth.current = expApproach(ampSmooth.current, ampTarget.current, AMP_LERP, dt);
        player.setLook(lookSmooth.current);
        player.setTalk(talkingRef.current, ampSmooth.current);
        player.setPose(poseRef.current);
        player.update(reducedRef.current ? 0 : dt);
        const skel = player.skeleton;
        const cssW = canvas.clientWidth || skel.width;
        const cssH = canvas.clientHeight || skel.height;
        drawCutout(ctx, skel, player.evaluate(), imagesRef.current, { width: cssW, height: cssH });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      ro.disconnect();
    };
  }, [ready]);

  if (failed) {
    return <Puppet pose={pose} emotion={emotion} talking={talking} amplitude={amplitude} className={className} />;
  }

  if (!ready) {
    return (
      <div className={cn("rai-stage rai-stage-pending", className)} data-rai-engine="spine-pending" aria-hidden="true" />
    );
  }

  return (
    <div
      ref={stageRef}
      className={cn("rai-stage", className)}
      aria-hidden="true"
      data-rai-engine={demo ? "spine-demo" : "spine-rai"}
      data-rai-pose={pose}
      data-rai-emotion={emotion}
      data-rai-talking={talking ? "1" : "0"}
      data-rai-reduced={reducedMotion ? "1" : "0"}
    >
      <div data-rai-rig className="rai-rig rai-spine-rig">
        <canvas ref={canvasRef} className="rai-spine-canvas" />
      </div>
      {demo ? (
        <p className="rai-spine-badge">Cutout demo · not Rai · PNG still ships</p>
      ) : (
        <p className="rai-spine-badge">Spine cutout · experimental</p>
      )}
    </div>
  );
}
