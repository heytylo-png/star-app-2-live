/**
 * Helix pose bridge: a short run of in-between frames played when the shown
 * sheet changes between a paired set of poses. First pair only, idle <-> smug.
 *
 * Frames are hard cuts on one `<img>` (no crossfade, no loop), about 100 ms
 * each. 01 is the idle pose and 06 is the hand-on-hip step into smug; the
 * live `idle.png` and the shipped `smug_official.png` stay the rest and the
 * hold, so a bridge is only ever the in-betweens.
 *
 * This module is pure (no DOM, no React). The puppet owns the one `<img>`;
 * the sequencer only says which frame is up. Timers and randomness are
 * injected so the order can be tested without a clock.
 */

/** In-between frames for idle -> smug, in play order. Smug -> idle plays them reversed. */
export const BRIDGE_IDLE_SMUG_FILES = [
  "rai/bridge_idle_smug_01.png",
  "rai/bridge_idle_smug_02.png",
  "rai/bridge_idle_smug_03.png",
  "rai/bridge_idle_smug_04.png",
  "rai/bridge_idle_smug_05.png",
  "rai/bridge_idle_smug_06.png",
] as const;

/**
 * Pair table: "<from>><to>" -> files to play, in order. Keys are the shown
 * sheet's bridge key (see bridgeKeyOfSrc). A pair that is not here hard-cuts
 * the way every pose change did before. Add a row to grow it.
 */
export const POSE_BRIDGE_PAIRS: Readonly<Record<string, readonly string[]>> = {
  "idle>smug": BRIDGE_IDLE_SMUG_FILES,
  "smug>idle": [...BRIDGE_IDLE_SMUG_FILES].reverse(),
};

/** Every file any pair plays, in first-seen order, no repeats. */
export function bridgeFiles(): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const list of Object.values(POSE_BRIDGE_PAIRS)) {
    for (const file of list) {
      if (seen.has(file)) continue;
      seen.add(file);
      files.push(file);
    }
  }
  return files;
}

/** Files for a pair, or null when that pair has no bridge. */
export function bridgeFilesFor(from: string | null, to: string | null): readonly string[] | null {
  if (!from || !to || from === to) return null;
  return POSE_BRIDGE_PAIRS[`${from}>${to}`] ?? null;
}

/** Per-frame hold: 100 ms with a little jitter, always inside 80-120 ms. */
export const BRIDGE_FRAME_MS = 100;
export const BRIDGE_JITTER_MS = 20;

export function bridgeFrameMs(rand: () => number): number {
  const r = Math.min(1, Math.max(0, rand()));
  return Math.round(BRIDGE_FRAME_MS - BRIDGE_JITTER_MS + r * 2 * BRIDGE_JITTER_MS);
}

/**
 * Which paired pose a shown sheet is. The idle rest sheet, its blink frames
 * and its mouth frames are all "idle" (the rest layer hard-swaps through them).
 * Anything else is null: no bridge starts from or lands on it.
 */
export function bridgeKeyOfSrc(src: string): string | null {
  const path = src.split(/[?#]/)[0] ?? src;
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (name === "idle.png" || /^idle_(blink|mouth)_\d\d_/.test(name)) return "idle";
  if (name === "smug_official.png") return "smug";
  return null;
}

/** The bridge key of what is on stage: one body sheet, or null. */
export function bridgeKeyOfPlates(plates: readonly { src: string }[]): string | null {
  if (plates.length !== 1) return null;
  return bridgeKeyOfSrc(plates[0]!.src);
}

export type BridgeTimers = {
  set: (fn: () => void, ms: number) => number;
  clear: (handle: number) => void;
};

export type BridgeRequest = {
  /** Bridge key of the sheet that was on stage, and the one that is now. */
  from: string | null;
  to: string | null;
  /** A spoken line is up: speech stays on idle with the mouth, never a bridge. */
  talking: boolean;
  /** prefers-reduced-motion: hard-cut. */
  reducedMotion: boolean;
  /** Maps a bridge file to the src the stage paints. */
  srcFor: (file: string) => string;
  /** True once that src has decoded. A frame is never shown before this. */
  isReady: (src: string) => boolean;
};

/**
 * Plays one bridge at a time. `onFrame(src)` is a frame to show; `onFrame(null)`
 * means the bridge is over (landed, dropped, or never started) and the stage
 * shows the live sheet.
 */
export class PoseBridge {
  private frames: string[] = [];
  private index = 0;
  private handle = 0;
  private running = false;

  private readonly timers: BridgeTimers;
  private readonly rand: () => number;
  private readonly onFrame: (src: string | null) => void;

  constructor(timers: BridgeTimers, rand: () => number, onFrame: (src: string | null) => void) {
    this.timers = timers;
    this.rand = rand;
    this.onFrame = onFrame;
  }

  active(): boolean {
    return this.running;
  }

  /** Src of the frame on stage now, or null. */
  current(): string | null {
    return this.running ? (this.frames[this.index] ?? null) : null;
  }

  private stop() {
    if (this.handle) this.timers.clear(this.handle);
    this.handle = 0;
    this.running = false;
    this.frames = [];
    this.index = 0;
  }

  /**
   * A shown-sheet change. Drops whatever was playing, then starts the pair if
   * it has one and every frame has decoded; otherwise the change is a hard cut.
   * Returns whether a bridge is now playing.
   */
  request(req: BridgeRequest): boolean {
    const wasRunning = this.running;
    this.stop();
    const files = bridgeFilesFor(req.from, req.to);
    if (!files || req.talking || req.reducedMotion) {
      if (wasRunning) this.onFrame(null);
      return false;
    }
    const srcs = files.map((file) => req.srcFor(file));
    if (!srcs.every((src) => req.isReady(src))) {
      if (wasRunning) this.onFrame(null);
      return false;
    }
    this.frames = srcs;
    this.index = 0;
    this.running = true;
    this.onFrame(srcs[0]!);
    this.handle = this.timers.set(this.advance, bridgeFrameMs(this.rand));
    return true;
  }

  private advance = () => {
    this.handle = 0;
    if (!this.running) return;
    this.index += 1;
    if (this.index >= this.frames.length) {
      this.stop();
      this.onFrame(null);
      return;
    }
    this.onFrame(this.frames[this.index]!);
    this.handle = this.timers.set(this.advance, bridgeFrameMs(this.rand));
  };

  /** Drop the remaining frames (talk started, unmount). Shows the live sheet. */
  cancel() {
    if (!this.running) return;
    this.stop();
    this.onFrame(null);
  }

  dispose() {
    this.stop();
  }
}
