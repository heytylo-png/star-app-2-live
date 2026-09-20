import { lazy, Suspense, useState } from "react";
import { Puppet } from "@/components/puppet";
import { StageShell } from "@/components/stage-shell";
import { usePresenceMode } from "@/lib/presence-mode";
import type { EmotionId, PoseId } from "@/lib/rai";

const ToonPresence = lazy(() => import("@/components/toon-presence"));

export type PresenceProps = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  className?: string;
};

/**
 * Shipping presence is the official PNG puppet.
 * Lab mounts a WIP mesh preview that is not Star Rai.
 */
export function Presence({ pose, emotion, talking, amplitude, className }: PresenceProps) {
  const mode = usePresenceMode((s) => s.mode);
  const [labFailed, setLabFailed] = useState(false);
  const labOn = mode === "lab" && !labFailed;

  return (
    <>
      {labOn ? (
        <Suspense fallback={<StageShell className={className} />}>
          <ToonPresence
            pose={pose}
            emotion={emotion}
            talking={talking}
            amplitude={amplitude}
            className={className}
            onFail={() => setLabFailed(true)}
          />
        </Suspense>
      ) : (
        <Puppet pose={pose} emotion={emotion} talking={talking} amplitude={amplitude} className={className} />
      )}
      {labOn ? (
        <p className="pointer-events-none absolute top-[max(3.6rem,calc(env(safe-area-inset-top)+2.6rem))] left-1/2 z-[6] -translate-x-1/2 rounded-full bg-elevated/90 px-2.5 py-0.5 text-[10px] tracking-wide text-muted shadow-[var(--shadow-border)]">
          WIP mesh · not Rai
        </p>
      ) : null}
    </>
  );
}
