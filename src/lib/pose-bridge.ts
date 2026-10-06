/**
 * Helix pose bridge: a short run of in-between frames played when the shown
 * sheet changes between a paired set of poses. First pair only, idle <-> smug.
 *
 * Frames are hard cuts on one `<img>` (no crossfade, no loop), about 150 ms
 * each, paint-paced. Intro (968) lands on `smug968_hold.webp`; rest (973) plays
 * forward onto idle glare then the live idle sheet. No reverse.
 *
 * This module is pure (no DOM, no React). The puppet owns the one `<img>`;
 * the sequencer only says which frame is up. Timers and randomness are
 * injected so the order can be tested without a clock.
 */

/**
 * Intro (968, paste-13): start → elbow → hand rise → hip → smirk-hold, then the live
 * smug968_hold sheet (= the 05 smirk-hold cut). Exit (973) is a separate forward set.
 * Offline white-matte cuts, 720×1280 RGBA WebP (alpha lossless).
 */
export const SMUG_IN_FILES = [
  "rai/smug968_in_01.webp",
  "rai/smug968_in_02.webp",
  "rai/smug968_in_03.webp",
  "rai/smug968_in_04.webp",
  "rai/smug968_in_05.webp",
] as const;

/**
 * Rest (973): hip → hand leave → arm down → soft → glare, then the live idle sheet.
 * Forward only. 973 frames the figure ~0.78× of 968/idle; the cuts are registered to the
 * idle sheet offline (uniform ×1.275, translate −98,−173 px in 720×1280, no visible pixel
 * leaves the canvas), so the stage paints them like every other sheet.
 */
export const SMUG_OUT_FILES = [
  "rai/smug973_out_01.webp",
  "rai/smug973_out_02.webp",
  "rai/smug973_out_03.webp",
  "rai/smug973_out_04.webp",
  "rai/smug973_out_05.webp",
] as const;

/**
 * Pair table: "<from>><to>" -> files to play, in order. Keys are the shown
 * sheet's bridge key (see bridgeKeyOfSrc). A pair that is not here hard-cuts
 * the way every pose change did before. Add a row to grow it.
 */
export const POSE_BRIDGE_PAIRS: Readonly<Record<string, readonly string[]>> = {
  "idle>smug": SMUG_IN_FILES,
  "smug>idle": SMUG_OUT_FILES,
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

/**
 * Clip timing for the smug pair (paste-14). Each entry is how long that frame stays up,
 * counted from when it was set (but never ending before it has been painted).
 * Entry 968: 01 start, 02 at ~0.5 s, 03 (arm up) at ~1.0 s, 04 at ~1.6 s, 05 (hip set) at
 * ~2.2 s, then the identical smug968_hold sheet.
 * Exit 973: 02 (hand leaves) at ~0.35 s, 03 (arm down) at ~0.75 s, 04 at ~1.05 s, 05 (glare)
 * at ~1.35 s, idle at ~1.7 s.
 */
export const SMUG_IN_DWELL_MS = [500, 500, 600, 600, 150] as const;
export const SMUG_OUT_DWELL_MS = [350, 400, 300, 300, 350] as const;
/** A frame always stays up at least this long after its paint, whatever the clock says. */
export const BRIDGE_MIN_AFTER_PAINT_MS = 34;

/** Per-frame dwell for a pair, or null (generic ~150 ms jitter). */
export function bridgeDwellsFor(from: string | null, to: string | null): readonly number[] | null {
  if (from === "idle" && to === "smug") return SMUG_IN_DWELL_MS;
  if (from === "smug" && to === "idle") return SMUG_OUT_DWELL_MS;
  return null;
}

/** Per-frame hold: ~150 ms with a little jitter, always inside 130-170 ms. */
export const BRIDGE_FRAME_MS = 150;
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
  if (name === "smug968_hold.webp") return "smug";
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
  /** Clock (ms). With it a frame's dwell counts from when it was set, so paint latency does not stretch the clip. */
  now?: () => number;
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
  /** True while 973 (smug→idle) is the sequence on stage. */
  private exitInFlight = false;
  private cancelPaint: (() => void) | null = null;
  /** Per-frame dwell of the sequence on stage (clip timing), or null for the generic jitter. */
  private dwells: readonly number[] | null = null;
  private readonly dwellsFor: (from: string | null, to: string | null) => readonly number[] | null;
  /** When the frame on stage was set (timers.now clock). */
  private frameSetAt = 0;

  private readonly timers: BridgeTimers;
  private readonly rand: () => number;
  private readonly onFrame: (src: string | null) => void;
  private readonly afterPaint: AfterPaint | null;

  constructor(
    timers: BridgeTimers,
    rand: () => number,
    onFrame: (src: string | null) => void,
    afterPaint?: AfterPaint,
    /** Per-pair clip timing (the stage passes bridgeDwellsFor); default: generic ~150 ms jitter. */
    dwellsFor: (from: string | null, to: string | null) => readonly number[] | null = () => null,
  ) {
    this.timers = timers;
    this.rand = rand;
    this.onFrame = onFrame;
    this.afterPaint = afterPaint ?? null;
    this.dwellsFor = dwellsFor;
  }

  private frameMs(): number {
    return this.dwells?.[this.index] ?? bridgeFrameMs(this.rand);
  }

  private markSet() {
    this.frameSetAt = this.timers.now ? this.timers.now() : 0;
  }

  /**
   * Arms the dwell of the frame that is up. Paint-paced: nothing advances before the
   * frame has painted; with a clock the dwell counts from when the frame was set (so
   * the sequence keeps the clip's timing), floored at BRIDGE_MIN_AFTER_PAINT_MS after paint.
   */
  private armDwell() {
    if (this.paused || this.handle || this.cancelPaint) return;
    const dwell = this.frameMs();
    if (this.paintPaced && this.afterPaint) {
      const index = this.index;
      this.cancelPaint = this.afterPaint(() => {
        this.cancelPaint = null;
        if (!this.running || this.paused || this.index !== index || this.handle) return;
        const now = this.timers.now;
        const left = now ? Math.max(BRIDGE_MIN_AFTER_PAINT_MS, dwell - (now() - this.frameSetAt)) : dwell;
        this.handle = this.timers.set(this.advance, left);
      });
      return;
    }
    this.handle = this.timers.set(this.advance, dwell);
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
    this.exitInFlight = false;
    this.dwells = null;
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
    const files = bridgeFilesFor(req.from, req.to);
    // A spoken line does not gate this: the pair is a pose change, and speech
    // (voice on or off) lands the pose within a few ms of the line starting. A
    // normal talk line never changes the pose, so it never gets here.
    //
    // Smug→idle exit (973) in flight: an unpaired key (wink, wave, …) must not
    // abort — finish the out frames; the live sheet settles under the last one
    // (213ea91 / TyLo phone: wink at out_02 was dropping the rest).
    if (wasRunning && this.exitInFlight && !files && !req.reducedMotion) {
      return true;
    }
    this.stop();
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
    this.exitInFlight = req.from === "smug" && req.to === "idle";
    this.dwells = this.dwellsFor(req.from, req.to);
    // Both directions wait for a paint before the dwell starts (never skip an unpainted frame).
    this.paintPaced = Boolean(this.afterPaint);
    this.markSet();
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
    if (this.running) {
      // Time spent hidden does not count: the frame gets its full dwell again on return.
      this.markSet();
      this.armDwell();
    }
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
    this.markSet();
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
 * Idle↔smug needs its Helix frames before either end of the pair may hard-cut.
 * Entering smug (wanted smug) waits for 968+973 files. Leaving smug (shown smug
 * → wanted idle) also waits — otherwise the stage snaps to idle.png and 973
 * never plays (TyLo phone FAIL on 7c4e54f).
 */
export function bridgeWantsFrames(
  wantedKey: string | null,
  shownKey: string | null = null,
): boolean {
  if (wantedKey === "smug") return true;
  if (shownKey === "smug" && wantedKey === "idle") return true;
  return false;
}

/**
 * Should the stage hold the wanted sheet back? Smug never shows (and so a paired
 * change never hard-cuts) just because its frames have not decoded yet: the
 * old sheet stays up until every frame is ready, up to BRIDGE_WAIT_MAX_MS, and
 * only then does it cut, loudly (the puppet logs it and sets
 * `data-rai-bridge-fallback`). Leaving smug for idle keeps `smug968_hold` up until
 * 973 can play — never a straight hold→idle.png snap. Reduced motion is the
 * one user request that skips the bridge, and it never waits.
 */
export function bridgeGate(opts: {
  wantedKey: string | null;
  /** Key of the plates currently on stage (smug while holding). */
  shownKey?: string | null;
  framesReady: boolean;
  reducedMotion: boolean;
  waitExpired: boolean;
}): "go" | "wait" {
  if (!bridgeWantsFrames(opts.wantedKey, opts.shownKey ?? null)) return "go";
  if (opts.reducedMotion || opts.framesReady || opts.waitExpired) return "go";
  return "wait";
}

/**
 * Smug hold release (paste-14). smug968_hold has no timer: it stays up until the
 * user's next send (`release` changes) or until another pose is wanted over it. Then
 * the stage shows plain idle rest instead of the wanted plates, so the driver plays
 * 973 forward; only after idle has landed (`landed()`) does the wanted pose go on.
 * A release that arrives while 968 is still coming in waits for the hold (973 never
 * starts from a half-raised arm), and nothing else takes the stage meanwhile.
 */
export type SmugGateStep = "wanted" | "keep-shown" | "exit-to-idle";

export class SmugReleaseGate {
  private seen: number;
  private wanted = false;
  private exitActive = false;

  constructor(release = 0) {
    this.seen = release;
  }

  /** One plates pass: what the stage should take. */
  step(opts: { shownKey: string | null; wantedKey: string | null; release: number; entering: boolean }): SmugGateStep {
    const onSmug = opts.shownKey === "smug";
    if (opts.release !== this.seen) {
      this.seen = opts.release;
      if (onSmug) this.wanted = true;
    }
    if (onSmug && opts.wantedKey !== "smug") this.wanted = true;
    if (!onSmug) this.wanted = false;
    if (this.wanted && !opts.entering) {
      this.wanted = false;
      this.exitActive = true;
    }
    if (this.exitActive) return "exit-to-idle";
    if (this.wanted) return "keep-shown";
    return "wanted";
  }

  /** 973 is playing or idle has not landed yet: the wanted pose waits. */
  exiting(): boolean {
    return this.exitActive;
  }

  /** Idle landed after 973 (or there was nothing to play): the wanted pose may go on. */
  landed(): void {
    this.exitActive = false;
  }
}
