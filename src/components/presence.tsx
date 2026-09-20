import { lazy, Suspense, useState } from "react";
import { Puppet } from "@/components/puppet";
import { StageShell } from "@/components/stage-shell";
import { usePresenceMode } from "@/lib/presence-mode";
import type { EmotionId, PoseId } from "@/lib/rai";
import { toonHandlesPose } from "@/lib/vrm-rig";

const ToonPresence = lazy(() => import("@/components/toon-presence"));

export type PresenceProps = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  className?: string;
};

/**
 * Presence slot: toon-shaded VRM is the default path.
 * PNG puppet stays the toggle/safety-net, and covers Helix keys the
 * stand-in cannot act (hand-shape poses).
 */
export function Presence({ pose, emotion, talking, amplitude, className }: PresenceProps) {
  const mode = usePresenceMode((s) => s.mode);
  const [toonFailed, setToonFailed] = useState(false);
  const engineOn = mode === "toon" && !toonFailed;
  const showToon = engineOn && toonHandlesPose(pose);
  const showPng = !showToon;

  return (
    <>
      {engineOn ? (
        <Suspense fallback={showPng ? null : <StageShell className={className} />}>
          <div className={showToon ? "absolute inset-0" : "pointer-events-none invisible absolute inset-0"}>
            <ToonPresence
              pose={pose}
              emotion={emotion}
              talking={talking}
              amplitude={amplitude}
              className="h-full w-full"
              onFail={() => setToonFailed(true)}
            />
          </div>
        </Suspense>
      ) : null}
      {showPng ? (
        <Puppet pose={pose} emotion={emotion} talking={talking} amplitude={amplitude} className={className} />
      ) : null}
    </>
  );
}
