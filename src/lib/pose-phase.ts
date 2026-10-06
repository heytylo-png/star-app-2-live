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

/**
 * The smug hold has no timer (paste-14): smug968_hold stays up until the user's next
 * send. The app bumps this on every send; the stage, if it is on the hold, plays 973
 * forward to idle before anything else (a new smug then runs 968 again from idle).
 */
let releaseSeq = 0;
const releaseListeners = new Set<() => void>();

export function requestSmugRelease(): void {
  releaseSeq += 1;
  for (const fn of releaseListeners) fn();
}

export function readSmugRelease(): number {
  return releaseSeq;
}

export function subscribeSmugRelease(fn: () => void): () => void {
  releaseListeners.add(fn);
  return () => {
    releaseListeners.delete(fn);
  };
}
