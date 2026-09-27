import { useEffect, useRef } from "react";
import type { StageSource } from "@/lib/stage-source";
import { withBasePath } from "@/lib/rai-engine";
import { cn } from "@/lib/utils";

type DeskSource = Exclude<StageSource, { kind: "png" }>;

type DeskLoopProps = {
  source: DeskSource;
  className?: string;
  onFail?: () => void;
};

/**
 * Life desk clip, painted in the same stage box as the PNG puppet.
 * Sibling of the puppet — not a .rai-rig / .rai-layer. Unmount pauses and
 * drops src so no desk frame stays up under Chat.
 */
export function DeskLoop({ source, className, onFail }: DeskLoopProps) {
  if (source.kind === "poster") {
    return (
      <div className={cn("rai-desk-stage", className)} data-rai-desk="poster" aria-hidden="true">
        <img
          src={withBasePath(source.src)}
          alt=""
          draggable={false}
          decoding="async"
          className="rai-desk-loop"
          onError={() => onFail?.()}
        />
      </div>
    );
  }

  return <DeskVideo source={source} className={className} onFail={onFail} />;
}

function DeskVideo({
  source,
  className,
  onFail,
}: {
  source: Extract<StageSource, { kind: "video" }>;
  className?: string;
  onFail?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const alive = useRef(true);
  const onFailRef = useRef(onFail);
  const src = withBasePath(source.src);
  const poster = withBasePath(source.poster);

  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    alive.current = true;
    el.muted = true;
    el.defaultMuted = true;
    el.setAttribute("muted", "");
    el.setAttribute("playsinline", "");
    // Cleanup clears src (and Strict Mode replays that cleanup). Put it back
    // before play(), or the element stays on the poster with an empty src.
    const absolute = new URL(src, window.location.href).href;
    if (el.currentSrc !== absolute) el.src = src;
    let cancelled = false;
    const pending = el.play();
    if (pending && typeof pending.catch === "function") {
      void pending.catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        onFailRef.current?.();
      });
    }
    return () => {
      cancelled = true;
      alive.current = false;
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, [src]);

  return (
    <div className={cn("rai-desk-stage", className)} data-rai-desk="video" aria-hidden="true">
      <video
        ref={videoRef}
        className="rai-desk-loop"
        src={src}
        poster={poster}
        loop={source.loop}
        muted={source.muted}
        playsInline={source.playsInline}
        autoPlay={source.autoplay}
        controls={source.controls}
        preload="auto"
        onError={() => {
          if (!alive.current) return;
          onFail?.();
        }}
      />
    </div>
  );
}
