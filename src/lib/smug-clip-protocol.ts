/** Messages between the stage and the smug clip worker (smug-clip-worker.ts). */
export type ClipKey = "in" | "out";

export type ClipWorkerIn =
  | {
      type: "init";
      /** Main-thread performance.timeOrigin, so frame times come back on the stage clock. */
      timeOrigin: number;
      /** Where the clip band is drawn in the 720×1280 sheet space (1:1, no resampling). */
      box: { x: number; y: number; w: number; h: number };
      clips: { key: ClipKey; url: string; frames: number; canvas: OffscreenCanvas }[];
    }
  /** Retry a failed load. */
  | { type: "load" }
  /** The stage shows `key`'s canvas (frame `start` is on it): play from there. */
  | { type: "play"; key: ClipKey; id: number; start: number }
  /** Drop play `id` (the canvas keeps its frame until "hidden"). */
  | { type: "stop"; key: ClipKey; id: number }
  /** The stage has hidden `key`'s canvas (painted): it may re-arm on frame 0. */
  | { type: "hidden"; key: ClipKey }
  | { type: "pause"; paused: boolean };

export type ClipWorkerOut =
  /** `ready`: loaded, first frames decoded, and frame 0 is on the (hidden) canvas. */
  | { type: "state"; key: ClipKey; ready: boolean; failed: boolean; unsupported: boolean }
  /** Frame `index` of play `id` was painted at `t` (stage clock). */
  | { type: "shown"; key: ClipKey; id: number; index: number; t: number }
  /** Play `id` is over: its last frame has had its dwell (or it could not start: failed). */
  | { type: "done"; key: ClipKey; id: number; stalls: number; reanchors: number; failed?: boolean };
