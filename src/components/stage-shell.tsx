import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared white-studio presence plate. PNG and 3D both sit on this so
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
      className={cn("relative h-full w-full overflow-hidden bg-stage", className)}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_22%,#ffffff_0%,#f7f4ee_42%,#ebe6dc_78%,#e4ddd2_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-[#e8e2d8]/90 via-[#ebe6dc]/35 to-transparent" />
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
