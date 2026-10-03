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

/**
 * Runs `fn` once the frame just handed to `onFrame` has been painted, and
 * returns a cancel function. The stage uses two animation frames (with a
 * timer backstop); tests use their own clock. Without one a frame's dwell
 * starts the moment it is set.
 */
export type AfterPaint = (fn: () => void) => () => void;

export type BridgeRequest = {
  /** Bridge key of the sheet that was on stage, and the one that is now. */
  from: string | null;
  to: string | null;
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
  /** Page hidden: frames hold where they are (background timers are throttled to 1 s or frozen). */
  private paused = false;
  /**
   * Entry (idle -> smug): each frame's 80-120 ms starts once it has been
   * painted, not when it was set. A main-thread stall (sheets punching, a
   * stream of renders) can no longer let a frame's timer run out before the
   * screen ever showed it, which is how an arm-rise frame got skipped.
   */
  private paintPaced = false;
  private cancelPaint: (() => void) | null = null;

  private readonly timers: BridgeTimers;
  private readonly rand: () => number;
  private readonly onFrame: (src: string | null) => void;
  private readonly afterPaint: AfterPaint | null;

  constructor(
    timers: BridgeTimers,
    rand: () => number,
    onFrame: (src: string | null) => void,
    afterPaint?: AfterPaint,
  ) {
    this.timers = timers;
    this.rand = rand;
    this.onFrame = onFrame;
    this.afterPaint = afterPaint ?? null;
  }

  /** Arms the dwell of the frame that is up: from its paint on entry, from now otherwise. */
  private armDwell() {
    if (this.paused || this.handle || this.cancelPaint) return;
    if (this.paintPaced && this.afterPaint) {
      const index = this.index;
      this.cancelPaint = this.afterPaint(() => {
        this.cancelPaint = null;
        if (!this.running || this.paused || this.index !== index || this.handle) return;
        this.handle = this.timers.set(this.advance, bridgeFrameMs(this.rand));
      });
      return;
    }
    this.handle = this.timers.set(this.advance, bridgeFrameMs(this.rand));
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
    if (this.cancelPaint) this.cancelPaint();
    this.cancelPaint = null;
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
    const onStage = this.current();
    this.stop();
    const files = bridgeFilesFor(req.from, req.to);
    // A spoken line does not gate this: the pair is a pose change, and speech
    // (voice on or off) lands the pose within a few ms of the line starting. A
    // normal talk line never changes the pose, so it never gets here.
    if (!files || req.reducedMotion) {
      if (wasRunning) this.onFrame(null);
      return false;
    }
    const srcs = files.map((file) => req.srcFor(file));
    // Not reachable from the stage while it waits for the frames (see bridgeGate);
    // only a bounded wait that ran out, or a failed load, ends up here.
    if (!srcs.every((src) => req.isReady(src))) {
      if (wasRunning) this.onFrame(null);
      return false;
    }
    this.frames = srcs;
    // Interrupted by the opposite direction (smug -> idle -> smug inside one reply
    // turn): carry on from the frame that is up, so the arm never jumps back.
    const resume = onStage ? srcs.indexOf(onStage) : -1;
    this.index = resume >= 0 ? resume : 0;
    this.running = true;
    this.paintPaced = req.to === "smug";
    this.onFrame(srcs[this.index]!);
    this.armDwell();
    return true;
  }

  /**
   * The page went to the background (true) or came back (false). A hidden page
   * gets throttled or frozen timers, which would stretch a 100 ms frame into
   * seconds and let a cut slip in on return. The bridge holds the frame that is
   * up while hidden and carries on with normal pacing on return, so the way back
   * is always seen as arm frames.
   */
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      if (this.handle) this.timers.clear(this.handle);
      this.handle = 0;
      if (this.cancelPaint) this.cancelPaint();
      this.cancelPaint = null;
      return;
    }
    if (this.running) this.armDwell();
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
    this.armDwell();
  };

  /** Drop the remaining frames and show the live sheet. */
  cancel() {
    if (!this.running) return;
    this.stop();
    this.onFrame(null);
  }

  dispose() {
    this.stop();
  }
}

/**
 * What the puppet does with each committed set of stage plates. The shown
 * sheet's bridge key is compared with the last committed one; a change between
 * the paired poses starts the bridge. Blink and mouth frames are all "idle", so
 * they never look like a change, and a plate set that is not one body sheet
 * (mid-crossfade, wave, pout...) is key null, so it is a hard cut.
 *
 * The decision uses only the plates, never the pose that asked for them, so
 * every route that ends on smug (named, model pose tag, emotion tint, local
 * brain, a pose set twice in one render) is the same change here.
 */
export class BridgeDriver {
  private last: string | null = null;
  private readonly bridge: PoseBridge;

  constructor(bridge: PoseBridge) {
    this.bridge = bridge;
  }

  /** Bridge key of the last committed plates. */
  key(): string | null {
    return this.last;
  }

  /** Returns whether a bridge is now playing. Same key as last time: nothing happens. */
  commit(
    plates: readonly { src: string }[],
    env: Pick<BridgeRequest, "reducedMotion" | "srcFor" | "isReady">,
  ): boolean {
    const from = this.last;
    const to = bridgeKeyOfPlates(plates);
    this.last = to;
    if (from === to) return this.bridge.active();
    return this.bridge.request({ from, to, ...env });
  }
}

/** Longest the stage holds a bridge-eligible sheet change back for its frames to decode. */
export const BRIDGE_WAIT_MAX_MS = 30_000;
/** How often a wait re-asks for frames whose load failed. */
export const BRIDGE_WAIT_RETRY_MS = 400;

/**
 * The sheet that is the far end of a bridged pair (smug). Showing it needs the
 * bridge frames, because every way onto it from idle plays them, and every way
 * back to idle plays them again. Idle is startup-decoded and never waits.
 */
export function bridgeWantsFrames(wantedKey: string | null): boolean {
  return wantedKey === "smug";
}

/**
 * Should the stage hold the wanted sheet back? Smug never shows (and so a paired
 * change never hard-cuts) just because its frames have not decoded yet: the
 * old sheet stays up until every frame is ready, up to BRIDGE_WAIT_MAX_MS, and
 * only then does it cut, loudly (the puppet logs it and sets
 * `data-rai-bridge-fallback`). Reduced motion is the one user request that skips
 * the bridge, and it never waits.
 */
export function bridgeGate(opts: {
  wantedKey: string | null;
  framesReady: boolean;
  reducedMotion: boolean;
  waitExpired: boolean;
}): "go" | "wait" {
  if (!bridgeWantsFrames(opts.wantedKey)) return "go";
  if (opts.reducedMotion || opts.framesReady || opts.waitExpired) return "go";
  return "wait";
}
