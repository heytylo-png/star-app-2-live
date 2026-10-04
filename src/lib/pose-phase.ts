import type { PosePhase } from "./rai.ts";

/**
 * Where the stage's smug beat is, as painted. The puppet writes it, the app's
 * release timer reads it (one stage per page), so a beat never ends on a hip
 * that was never shown.
 */
let phase: PosePhase = "idle";
let holdSince = 0;
let mounted = false;

/** The PNG puppet is on the page (the spine/desk engines have no bridge to wait for). */
export function setPoseStageMounted(on: boolean): void {
  mounted = on;
  if (!on) {
    phase = "idle";
    holdSince = 0;
  }
}

export function setPosePhase(next: PosePhase, now: number = Date.now()): void {
  if (next === phase) return;
  phase = next;
  holdSince = next === "hold" ? now : 0;
}

export function readPosePhase(): { phase: PosePhase; holdSince: number; mounted: boolean } {
  return { phase, holdSince, mounted };
}
