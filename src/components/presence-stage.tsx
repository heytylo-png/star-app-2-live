import { useEffect, useState } from "react";
import { Puppet } from "@/components/puppet";
import { SpineStage } from "@/components/spine-stage";
import { isSpineDemoEngine, parseRaiEngine, type RaiEngineId } from "@/lib/rai-engine";
import type { EmotionId, PoseId } from "@/lib/rai";

type PresenceStageProps = {
  pose: PoseId;
  emotion: EmotionId;
  talking: boolean;
  amplitude: number;
  className?: string;
};

function readEngine(): RaiEngineId {
  if (typeof window === "undefined") return "png-puppet";
  return parseRaiEngine(window.location.search);
}

/**
 * Official PNG puppet by default. Spine/cutout only when `?spine=1` (sample)
 * or `?spine=rai` (official layers — falls back if the cut pack is missing).
 */
export function PresenceStage(props: PresenceStageProps) {
  const [engine, setEngine] = useState<RaiEngineId>(readEngine);

  useEffect(() => {
    const sync = () => setEngine(readEngine());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  if (isSpineDemoEngine(engine)) {
    return <SpineStage {...props} target={engine} />;
  }
  return <Puppet {...props} />;
}
