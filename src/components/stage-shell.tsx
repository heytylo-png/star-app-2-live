import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared beige Helix stage plate. PNG and Lab both sit on this so
 * toggling modes does not change the room.
 */
export function StageShell({
  children,
  className,
  stageRef,
}: {
  children?: ReactNode;
  className?: string;
  stageRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={stageRef}
      className={cn("rai-stage", className)}
      aria-hidden="true"
    >
      <div className="rai-stage-wash" />
      <div className="rai-stage-floor" />
      {children}
    </div>
  );
}

/** Same inset the PNG rig uses — header clearance + bottom chrome room. */
export function PresenceFrame({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-x-0 top-[max(3.25rem,env(safe-area-inset-top))] bottom-[clamp(7.5rem,28vh,11rem)] sm:inset-x-[8%] md:inset-x-[14%] lg:inset-x-[18%]">
      {children}
    </div>
  );
}
