import { useEffect, useState } from "react";
import { DeskLoop } from "@/components/desk-loop";
import { Puppet } from "@/components/puppet";
import { SpineStage } from "@/components/spine-stage";
import { isSpineDemoEngine, parseRaiEngine, type RaiEngineId } from "@/lib/rai-engine";
import type { DanceSheet } from "@/lib/dance-fidget";
import type { EmotionId, PoseId } from "@/lib/rai";
import type { IdleMouthFrame } from "@/lib/rai-motion";
import type { StageSource } from "@/lib/stage-source";

type PresenceStageProps = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  /** Line she is saying. PNG puppet reads it for the hype (05 wide) mouth only. */
  spokenLine?: string;
  /** Loudness frame while TTS audio is playing. Omitted for the timed chew. */
  audioMouth?: IdleMouthFrame | null;
  className?: string;
  /** Life desk clip. PNG (or omitted) keeps the official puppet. */
  desk?: StageSource;
  /** One existing sheet, hard-cut. While set, the desk clip is not the driver. */
  danceSheet?: DanceSheet | null;
  onDeskFail?: () => void;
};

function readEngine(): RaiEngineId {
  if (typeof window === "undefined") return "png-puppet";
  return parseRaiEngine(window.location.search);
}

/**
 * Official PNG puppet by default. Spine/cutout only when `?spine=1` (sample)
 * or `?spine=rai` (official layers — falls back if the cut pack is missing).
 */
export function PresenceStage({
  desk,
  danceSheet = null,
  onDeskFail,
  className,
  spokenLine,
  audioMouth = null,
  ...props
}: PresenceStageProps) {
  const [engine, setEngine] = useState<RaiEngineId>(readEngine);

  useEffect(() => {
    const sync = () => setEngine(readEngine());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const body = isSpineDemoEngine(engine) ? (
    <SpineStage {...props} className={className} target={engine} />
  ) : (
    <Puppet {...props} spokenLine={spokenLine} audioMouth={audioMouth} danceSheet={danceSheet} className={className} />
  );

  return (
    <div className={className}>
      {body}
      {desk != null && desk.kind !== "png" ? (
        <DeskLoop source={desk} className={className} onFail={onDeskFail} />
      ) : null}
    </div>
  );
}
