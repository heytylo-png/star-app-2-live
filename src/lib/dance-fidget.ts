/**
 * Life dance fidgets. While a track is actually playing on Life, the stage
 * cycles the existing sheets — wave, peace, heart, laugh, smug — one image
 * at a time. Hard cut. No crossfade, no second driver.
 *
 * Stop, or leaving Life, snaps to official idle. If the desk loop is already
 * the Life look (no dance this visit), it stays. A chat bubble does not take
 * the image. A named pose wins for that line, then the dance resumes while
 * the track is still playing. Chart and Chat do not dance.
 */

import { LIVE_POSE_FILES, type PoseId } from "./rai.ts";
import type { StagePlace } from "./stage-source.ts";

/** Existing sheets only. Heart is the hearts key (heart_official.png). */
export const DANCE_SHEETS = ["wave", "peace", "hearts", "laugh", "smug"] as const;
export type DanceSheet = (typeof DANCE_SHEETS)[number];

export const DANCE_HOLD_MIN_MS = 500;
export const DANCE_HOLD_MAX_MS = 800;

export function isDanceSheet(value: unknown): value is DanceSheet {
  return typeof value === "string" && (DANCE_SHEETS as readonly string[]).includes(value);
}

/** File the puppet already serves. No new art. */
export function danceSheetFile(sheet: DanceSheet): string {
  return LIVE_POSE_FILES[sheet];
}

/**
 * Hold length from a unit in [0, 1). 0 is 500ms, just under 1 is 800ms.
 * Inclusive of both ends.
 */
export function danceHoldMs(unit: number): number {
  const u = Number.isFinite(unit) ? Math.min(Math.max(unit, 0), 0.999999999) : 0;
  const span = DANCE_HOLD_MAX_MS - DANCE_HOLD_MIN_MS + 1;
  return DANCE_HOLD_MIN_MS + Math.floor(u * span);
}

/** Next sheet in the cycle. A missing current starts at wave. */
export function advanceDanceSheet(current: DanceSheet | null): DanceSheet {
  if (!current) return DANCE_SHEETS[0];
  const index = DANCE_SHEETS.indexOf(current);
  return DANCE_SHEETS[(index + 1) % DANCE_SHEETS.length]!;
}

/** Session on and a real title. A stopped session keeps the title and does not dance. */
export function lifeTrackPlaying(
  life: { on?: boolean; now_playing?: string | null } | null | undefined,
): boolean {
  if (!life?.on) return false;
  return Boolean(life.now_playing?.replace(/\s+/g, " ").trim());
}

/**
 * The user named this pose and it is the pose on stage. Kiss is not a pose.
 * An automatic tint does not win: the ref has to be this pose.
 */
export function namedPoseWins(
  named: PoseId | false | null | undefined,
  pose: PoseId,
): PoseId | null {
  if (named == null || named === false || named === "idle") return null;
  if (pose !== named) return null;
  return named;
}

/** A Life stop line does not keep the wave tint. The stage is official idle. */
export function poseOnLifeStop(kind: string, pose: PoseId): PoseId {
  return kind === "session_stop" ? "idle" : pose;
}

/** True on the edge from a playing dance to stopped or left. */
export function danceShouldSnapIdle(wasPlaying: boolean, place: StagePlace, trackPlaying: boolean): boolean {
  if (!wasPlaying) return false;
  return !(place === "life" && trackPlaying);
}

export type StageImageDriver =
  | { kind: "dance"; sheet: DanceSheet }
  | { kind: "named"; pose: PoseId }
  | { kind: "desk" }
  | { kind: "idle" }
  | { kind: "puppet" };

/**
 * Exactly one driver of the stage image.
 * Dance only on Life while a track is playing, unless a named pose owns the line.
 * A chat bubble does not change the driver.
 */
export function stageImageDriver(input: {
  place: StagePlace;
  trackPlaying: boolean;
  namedPose: PoseId | null;
  /** Stop snapped Life to idle. Cleared by leaving Life or by the next track. */
  idleSnap: boolean;
  /** Desk video or its reduced-motion poster is Life's look. */
  deskIsLifeLook: boolean;
  sheet: DanceSheet;
  /** A chat line is up. It talks over the dance and does not take the image. */
  bubble?: boolean;
}): StageImageDriver {
  void input.bubble;
  if (input.place === "life" && input.trackPlaying) {
    if (input.namedPose) return { kind: "named", pose: input.namedPose };
    return { kind: "dance", sheet: input.sheet };
  }
  if (input.place === "life") {
    if (input.idleSnap || !input.deskIsLifeLook) return { kind: "idle" };
    return { kind: "desk" };
  }
  return { kind: "puppet" };
}
