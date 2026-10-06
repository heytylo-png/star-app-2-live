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
    // No stage, nothing to wait for: let any deferred line start now.
    setSmugReleasePending(false);
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
  // The stage is on the smug beat (968 coming in, the hold, or 973 going out): the
  // next pose waits behind 973 + idle. Marked here, synchronously, so a reply that
  // lands before the stage re-renders is still deferred (paste-15).
  if (mounted && phase !== "idle") releasePending = true;
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

/**
 * paste-15: while a smug release is pending (973 still to play, or idle not landed
 * yet) the next reply's pose and chew are not on stage. The app defers their clocks
 * (actLandedAt, text chew) and starts them when the stage lets the next pose on.
 * The puppet clears it from its gate; listeners hear the moment it lands.
 */
let releasePending = false;
const landedListeners = new Set<() => void>();

export function setSmugReleasePending(on: boolean): void {
  if (on === releasePending) return;
  releasePending = on;
  if (!on) for (const fn of landedListeners) fn();
}

export function readSmugReleasePending(): boolean {
  return releasePending;
}

export function subscribeSmugReleaseLanded(fn: () => void): () => void {
  landedListeners.add(fn);
  return () => {
    landedListeners.delete(fn);
  };
}
