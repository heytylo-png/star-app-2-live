/**
 * Life desk loop — what the character stage shows.
 * SoT: artifacts/star-rai-video-loops.txt
 *
 * Life plays diary-loop.mp4. Chat, Chart, and Call stay on the official PNG
 * puppet. The clip is never idle and never the launch state (the app boots
 * on Chat). Chart diary may reuse the loop later; this slice keeps Chart on
 * the PNG. prefers-reduced-motion shows the poster still. A failed load or
 * rejected autoplay falls back to the PNG.
 */

import type { ShellTab } from "./shell.ts";

export const DIARY_LOOP_FILE = "clips/diary-loop.mp4";
export const DIARY_POSTER_FILE = "clips/diary-poster.jpg";

/** Chat / Chart / Life tabs, plus Call (a mode, not a tab). */
export type StagePlace = ShellTab | "call";

export type StageSource =
  | { kind: "png" }
  | {
      kind: "video";
      src: string;
      poster: string;
      loop: true;
      muted: true;
      playsInline: true;
      autoplay: true;
      controls: false;
    }
  | { kind: "poster"; src: string };

export function stagePlace(opts: { tab: ShellTab; callActive?: boolean }): StagePlace {
  return opts.callActive ? "call" : opts.tab;
}

/**
 * Tab (and Call) → stage source.
 * Leaving Life is just asking again with chat, chart, or call.
 */
export function stageSourceFor(input: {
  place: StagePlace;
  reducedMotion?: boolean;
  /** Video failed to load, or autoplay was rejected. */
  playbackFailed?: boolean;
}): StageSource {
  if (input.place !== "life" || input.playbackFailed) {
    return { kind: "png" };
  }
  if (input.reducedMotion) {
    return { kind: "poster", src: DIARY_POSTER_FILE };
  }
  return {
    kind: "video",
    src: DIARY_LOOP_FILE,
    poster: DIARY_POSTER_FILE,
    loop: true,
    muted: true,
    playsInline: true,
    autoplay: true,
    controls: false,
  };
}

/** Launch is Chat, so the stage boots on the PNG. Never the desk clip. */
export function launchStageSource(): StageSource {
  return stageSourceFor({ place: "chat" });
}

/** Chat, Chart, or Call. The desk clip is gone; the PNG puppet is back. */
export function stageSourceAfterLeave(next: Exclude<StagePlace, "life">): StageSource {
  return stageSourceFor({ place: next });
}
