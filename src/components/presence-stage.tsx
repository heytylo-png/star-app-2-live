import { useEffect, useState } from "react";
import { DeskLoop } from "@/components/desk-loop";
import { Puppet } from "@/components/puppet";
import { SpineStage } from "@/components/spine-stage";
import { isSpineDemoEngine, parseRaiEngine, type RaiEngineId } from "@/lib/rai-engine";
import type { EmotionId, PoseId } from "@/lib/rai";
import type { StageSource } from "@/lib/stage-source";

type PresenceStageProps = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  className?: string;
  /** Life desk clip. PNG (or omitted) keeps the official puppet. */
  desk?: StageSource;
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
export function PresenceStage({ desk, onDeskFail, className, ...props }: PresenceStageProps) {
  const [engine, setEngine] = useState<RaiEngineId>(readEngine);

  useEffect(() => {
    const sync = () => setEngine(readEngine());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const body = isSpineDemoEngine(engine) ? (
    <SpineStage {...props} className={className} target={engine} />
  ) : (
    <Puppet {...props} className={className} />
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
