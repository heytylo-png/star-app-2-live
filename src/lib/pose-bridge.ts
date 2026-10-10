/**
 * Helix pose bridge: in-between motion played when the shown sheet changes between a
 * paired set of poses. Pairs: idle <-> smug (1085/1084), idle <-> wave (1126/1140) and
 * idle <-> pout (1158/1162).
 *
 * Both pairs are two real videos played as video, every source frame in order at their
 * native 24 fps. The intro runs from 0.000 s to its hold frame only (smug 1085: 2.000 s,
 * frames 0..48; wave 1126: 4.083 s, frames 0..98; pout 1158: 2.000 s, frames 0..48) and lands on a hold WebP (= that exact
 * frame) until the next send. The rest runs its full 145 frames forward onto the live idle
 * sheet. No reverse, no audio (the clips are AVIF image sequences). Smug, wave and pout each have
 * their own canvases / hold sheet.
 *
 * This module is pure (no DOM, no React). The puppet owns the one canvas the frames are
 * drawn on; the sequencer only says which frame is up. Timers are injected so the order
 * and pacing can be tested without a clock.
 */

/** Native rate of both clips. */
export const SMUG_CLIP_FPS = 24;
/** One clip frame on stage: 41.67 ms. */
export const SMUG_CLIP_FRAME_MS = 1000 / SMUG_CLIP_FPS;

export type ClipPair = "smug" | "wave" | "pout";
export type SmugClip = {
  /** Which hold pose this clip belongs to. */
  readonly pair: ClipPair;
  /** "in" = intro (idle -> hold), "out" = rest (hold -> idle). */
  readonly key: "in" | "out";
  /** Animated AVIF (AV1 + alpha, 24 fps, no audio) under public/. */
  readonly file: string;
  /** Frames in the file; every one is shown, in order. */
  readonly frames: number;
};

/**
 * Intro: 1085 from 0.000 s to 2.000 s inclusive (49 frames at 24 fps). Arms down → hand
 * rises → hand on hip + smirk. The file ends on the 2.000 s frame; the mouth-open part
 * (3 s on) is not in it.
 */
export const SMUG_IN_CLIP: SmugClip = { pair: "smug", key: "in", file: "rai/smug1085_in.avif", frames: 49 };
/** Rest: 1084 over its full length (145 frames, 6.04 s). Hand on hip → arm drops → idle glare. */
export const SMUG_OUT_CLIP: SmugClip = { pair: "smug", key: "out", file: "rai/smug1084_out.avif", frames: 145 };
/** The smug hold sheet: the exact 2.000 s frame of 1085 (frame 48), 720×1280 RGBA WebP. */
export const SMUG_HOLD_FILE = "rai/smug1085_hold.webp";

/**
 * Wave intro (TyLo 2026-10-08): 1126 from 0.000 s to frame 98 (4.083 s) inclusive (99 frames).
 * Arms-down glare → wave arm out (1 s) → palm up, other hand on hip (2 s) → smile. The 4.000 s
 * frame's mouth is still flat; f98 is the first frame where the smile curves (w5, TyLo 13:30:
 * "hold the first frame where it actually curves... Do not play past that frame"). Nothing past
 * f98 is in the file (the 2 s frame is still the glare).
 */
export const WAVE_IN_CLIP: SmugClip = { pair: "wave", key: "in", file: "rai/wave1126_in.avif", frames: 99 };
/** Wave rest: 1140 full length (145 frames, 6.04 s). Wave hand comes down → both arms down → idle glare. */
export const WAVE_OUT_CLIP: SmugClip = { pair: "wave", key: "out", file: "rai/wave1140_out.avif", frames: 145 };
/** Wave hold sheet: 1126 frame 98 (4.083 s, first curved smile) = the intro's last frame, 720×1280 RGBA WebP. */
export const WAVE_HOLD_FILE = "rai/wave1126_hold.webp";

/**
 * Pout intro (TyLo 2026-10-10): 1158 from 0.000 s to 2.000 s inclusive (49 frames). Arms-down
 * glare → both arms crossed (by ~0.4-1 s) → crossed-arms frown. Nothing past 2.000 s is in the file.
 */
export const POUT_IN_CLIP: SmugClip = { pair: "pout", key: "in", file: "rai/pout1158_in.avif", frames: 49 };
/** Pout rest: 1162 full length (145 frames, 6.04 s). Crossed arms → both arms down (~1 s) → idle glare. */
export const POUT_OUT_CLIP: SmugClip = { pair: "pout", key: "out", file: "rai/pout1162_out.avif", frames: 145 };
/** Pout hold sheet: 1158 frame 48 (2.000 s, crossed-arms frown) = the intro's last frame, 720×1280 RGBA WebP. Not pout_official.png. */
export const POUT_HOLD_FILE = "rai/pout1158_hold.webp";

/**
 * Both clips are white-matte cuts registered to idle.png in the 720×1280 sheet space
 * (1085 shifted 0,−3 px; 1084 uniform ×1.005 + −2,−10 px; no visible pixel leaves the
 * canvas). The bitstream holds only the x 112..560 band (the rest is transparent margin
 * in every frame), drawn back 1:1 at this offset: nothing cropped, nothing zoomed.
 */
export const SMUG_CLIP_SHEET = { w: 720, h: 1280 } as const;
export const SMUG_CLIP_BOX = { x: 112, y: 0, w: 448, h: 1280 } as const;
/**
 * Wave clips (1126 720×1280 and 1140 784×1168) are white-matte cuts registered to idle.png in the
 * same 720×1280 sheet space: 1126 uniform ×1.040, 1140 uniform ×1.118, each anchored on the soles
 * and feet centre of idle (feet, scale and head land on idle and on each other at the joins).
 * The raised wave arm reaches far wider than the smug band, so wave has its own band: x 0..672.
 * Every frame of both clips has a fully transparent margin at the band's left and right edges
 * (pinned by wave-clip-edges.json + its test), so no elbow or hand is clipped at the edge.
 */
export const WAVE_CLIP_BOX = { x: 0, y: 0, w: 672, h: 1280 } as const;
/**
 * Pout clips (1158 and 1162, both 784×1168, same framing) are white-matte cuts registered to
 * idle.png in the 720×1280 sheet space with one transform for both: uniform ×1.33, +(−162, −152)
 * (joint silhouette fit of 1158 f0 and 1162 f144 on idle), so there is no size jump at any join.
 * Every frame's alpha sits inside x 142..592, so pout has its own band x 128..608; its edge strips
 * are transparent in every frame (pout-clip-edges.json + test): no elbow or hand clipped.
 */
export const POUT_CLIP_BOX = { x: 128, y: 0, w: 480, h: 1280 } as const;

/** Bridge frame id for frame `index` of a clip: `<file>#NNN`. */
export function clipFrameFile(clip: SmugClip, index: number): string {
  return `${clip.file}#${String(index).padStart(3, "0")}`;
}

/** Every frame id of a clip, in play order. */
export function clipFrameFiles(clip: SmugClip): string[] {
  return Array.from({ length: clip.frames }, (_, i) => clipFrameFile(clip, i));
}

/** Clip and frame index of a bridge frame id / src, or null. */
export function parseClipFrame(src: string): { clip: SmugClip; index: number } | null {
  const m = /([^/?#]+\.avif)(?:\?[^#]*)?#(\d{3})$/.exec(src);
  if (!m) return null;
  const clip = [SMUG_IN_CLIP, SMUG_OUT_CLIP, WAVE_IN_CLIP, WAVE_OUT_CLIP, POUT_IN_CLIP, POUT_OUT_CLIP].find(
    (c) => c.file.endsWith(`/${m[1]}`) || c.file === m[1],
  );
  if (!clip) return null;
  const index = Number(m[2]);
  return index < clip.frames ? { clip, index } : null;
}

/** Intro frame ids (1085, 0.000–2.000 s). */
export const SMUG_IN_FILES: readonly string[] = clipFrameFiles(SMUG_IN_CLIP);
/** Rest frame ids (1084, full length). */
export const SMUG_OUT_FILES: readonly string[] = clipFrameFiles(SMUG_OUT_CLIP);

/** The clips any pair plays. */
export function bridgeClips(): SmugClip[] {
  return [SMUG_IN_CLIP, SMUG_OUT_CLIP, WAVE_IN_CLIP, WAVE_OUT_CLIP, POUT_IN_CLIP, POUT_OUT_CLIP];
}

export const WAVE_IN_FILES: readonly string[] = clipFrameFiles(WAVE_IN_CLIP);
export const WAVE_OUT_FILES: readonly string[] = clipFrameFiles(WAVE_OUT_CLIP);
export const POUT_IN_FILES: readonly string[] = clipFrameFiles(POUT_IN_CLIP);
export const POUT_OUT_FILES: readonly string[] = clipFrameFiles(POUT_OUT_CLIP);

/**
 * Pair table: "<from>><to>" -> frames to play, in order. Keys are the shown
 * sheet's bridge key (see bridgeKeyOfSrc). A pair that is not here hard-cuts
 * the way every pose change did before.
 */
export const POSE_BRIDGE_PAIRS: Readonly<Record<string, readonly string[]>> = {
  "idle>smug": SMUG_IN_FILES,
  "smug>idle": SMUG_OUT_FILES,
  "idle>wave": WAVE_IN_FILES,
  "wave>idle": WAVE_OUT_FILES,
  "idle>pout": POUT_IN_FILES,
  "pout>idle": POUT_OUT_FILES,
};

/** Every frame any pair plays, in first-seen order, no repeats. */
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
 * Clip timing: every frame is up for one 24 fps frame (41.67 ms). The schedule is anchored
 * to the clip start (frame k is due at k × 41.67 ms), so on a 60 Hz screen frames alternate
 * 3 and 2 refreshes like any 24 fps video, and on 120 Hz each gets 5. A frame is never
 * skipped: each is drawn in its own animation frame, after the one before has painted, and
 * a late frame (jank, decode) pushes the schedule back instead of being dropped.
 */
export const SMUG_IN_DWELL_MS: readonly number[] = SMUG_IN_FILES.map(() => SMUG_CLIP_FRAME_MS);
export const SMUG_OUT_DWELL_MS: readonly number[] = SMUG_OUT_FILES.map(() => SMUG_CLIP_FRAME_MS);
export const WAVE_IN_DWELL_MS: readonly number[] = WAVE_IN_FILES.map(() => SMUG_CLIP_FRAME_MS);
export const WAVE_OUT_DWELL_MS: readonly number[] = WAVE_OUT_FILES.map(() => SMUG_CLIP_FRAME_MS);
export const POUT_IN_DWELL_MS: readonly number[] = POUT_IN_FILES.map(() => SMUG_CLIP_FRAME_MS);
export const POUT_OUT_DWELL_MS: readonly number[] = POUT_OUT_FILES.map(() => SMUG_CLIP_FRAME_MS);
/** A frame always stays up at least this long after its paint, whatever the clock says (0 = the next animation frame). */
export const BRIDGE_MIN_AFTER_PAINT_MS = 0;
/**
 * Late by more than this (a real stall, not refresh-rate rounding): the rest of the clip
 * shifts back by the delay. Up to one frame late, the next frame keeps its slot on the
 * 24 fps clock (it simply follows sooner), so the clip keeps its length. Never skips.
 */
export const BRIDGE_LATE_REANCHOR_MS = SMUG_CLIP_FRAME_MS;
/** Next frame not decoded yet: look again this soon (the frame on stage stays up meanwhile). */
export const BRIDGE_STALL_POLL_MS = 4;

/** Per-frame dwell for a pair, or null (generic ~150 ms jitter). */
export function bridgeDwellsFor(from: string | null, to: string | null): readonly number[] | null {
  if (from === "idle" && to === "smug") return SMUG_IN_DWELL_MS;
  if (from === "smug" && to === "idle") return SMUG_OUT_DWELL_MS;
  if (from === "idle" && to === "wave") return WAVE_IN_DWELL_MS;
  if (from === "wave" && to === "idle") return WAVE_OUT_DWELL_MS;
  if (from === "idle" && to === "pout") return POUT_IN_DWELL_MS;
  if (from === "pout" && to === "idle") return POUT_OUT_DWELL_MS;
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
  if (name === "smug1085_hold.webp") return "smug";
  if (name === "wave1126_hold.webp") return "wave";
  if (name === "pout1158_hold.webp") return "pout";
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
  /** Clock (ms). With it frames run on the clip schedule (anchored at frame 0), so paint latency does not stretch the clip. */
  now?: () => number;
};

/**
 * Runs `fn` once the frame just handed to `onFrame` has been painted, and
 * returns a cancel function. The stage uses the next animation frame (with a
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
  /** True once that frame has decoded. A frame is never shown before this (the one on stage stays up). */
  isReady: (src: string) => boolean;
};

/** What the sequencer has done on the clip on stage (debug / proofs). */
export type BridgeStats = {
  /** Frames handed to the stage, in order (no index is ever skipped). */
  shown: number;
  /** Times the next frame was not decoded when due (the frame on stage stayed up). */
  stalls: number;
  /** Times the schedule was pushed back because a frame came late. */
  reanchors: number;
};

/** What a clip player reports back while it plays a bridge (see BridgeClipPlayer). */
export type BridgeClipEvents = {
  /** Frame `index` has been painted. */
  shown: (index: number) => void;
  /** The last frame has had its dwell: the stage shows the live sheet now. */
  done: () => void;
};

/**
 * Optional pacer that plays a bridge's frames itself (the smug clips: a worker paints them at
 * 24 fps off the main thread, see smug-clip-player.ts). PoseBridge then only mirrors it.
 */
export type BridgeClipPlayer = {
  /** Frame `start` of `files` is already on the stage; play on from it. False: cannot start. */
  play: (files: readonly string[], start: number, events: BridgeClipEvents) => boolean;
  stop: () => void;
  setPaused: (paused: boolean) => void;
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
  /** Paint-paced: nothing advances before the frame on stage has been painted. */
  private paintPaced = false;
  /** True while 1084 (smug→idle) is the sequence on stage. */
  private exitInFlight = false;
  private cancelPaint: (() => void) | null = null;
  /** Per-frame dwell of the sequence on stage (clip timing), or null for the generic jitter. */
  private dwells: readonly number[] | null = null;
  private readonly dwellsFor: (from: string | null, to: string | null) => readonly number[] | null;
  /** Clock time frame 0 was (or would have been, after a late frame) due: frame k is due at anchor + its start offset. */
  private anchor = 0;
  /** Start offset of each frame from the anchor (cumulative dwells). */
  private offsets: number[] = [];
  private isReady: (src: string) => boolean = () => true;
  private counts: BridgeStats = { shown: 0, stalls: 0, reanchors: 0 };
  /** The external player is pacing the sequence on stage (no timers here). */
  private playing = false;
  private playToken = 0;
  private readonly player: BridgeClipPlayer | null;

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
    /** Plays the frames itself when given (the smug clips); PoseBridge mirrors what it shows. */
    player: BridgeClipPlayer | null = null,
  ) {
    this.player = player;
    this.timers = timers;
    this.rand = rand;
    this.onFrame = onFrame;
    this.afterPaint = afterPaint ?? null;
    this.dwellsFor = dwellsFor;
  }

  private frameMs(index: number): number {
    return this.dwells?.[index] ?? bridgeFrameMs(this.rand);
  }

  private now(): number {
    return this.timers.now ? this.timers.now() : 0;
  }

  /** When frame `index` is due (timers.now clock). */
  private dueAt(index: number): number {
    return this.anchor + (this.offsets[index] ?? 0);
  }

  /**
   * Arms the dwell of the frame that is up. Paint-paced: nothing advances before the frame
   * has painted. With a clock the next frame is due on the clip schedule (anchored at frame
   * 0), floored at BRIDGE_MIN_AFTER_PAINT_MS after this frame's paint.
   */
  private armDwell() {
    if (this.paused || this.handle || this.cancelPaint) return;
    const index = this.index;
    const fire = () => {
      if (!this.running || this.paused || this.index !== index || this.handle) return;
      const left = this.timers.now
        ? Math.max(BRIDGE_MIN_AFTER_PAINT_MS, this.dueAt(index + 1) - this.now())
        : this.frameMs(index);
      this.handle = this.timers.set(this.advance, left);
    };
    if (this.paintPaced && this.afterPaint) {
      this.cancelPaint = this.afterPaint(() => {
        this.cancelPaint = null;
        fire();
      });
      return;
    }
    fire();
  }

  active(): boolean {
    return this.running;
  }

  /** Src of the frame on stage now, or null. */
  current(): string | null {
    return this.running ? (this.frames[this.index] ?? null) : null;
  }

  /** Counters for the clip on stage (or the last one). */
  stats(): BridgeStats {
    return { ...this.counts };
  }

  private stop() {
    if (this.playing) {
      this.playing = false;
      this.playToken += 1;
      this.player?.stop();
    }
    if (this.handle) this.timers.clear(this.handle);
    this.handle = 0;
    if (this.cancelPaint) this.cancelPaint();
    this.cancelPaint = null;
    this.running = false;
    this.exitInFlight = false;
    this.dwells = null;
    this.frames = [];
    this.offsets = [];
    this.index = 0;
  }

  /**
   * A shown-sheet change. Drops whatever was playing, then starts the pair if
   * it has one and its first frame has decoded (the stage only lets the change
   * through once the clip is primed); otherwise the change is a hard cut.
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
    // Smug→idle exit (1084) in flight: an unpaired key (wink, wave, …) must not
    // abort — finish the out frames; the live sheet settles under the last one
    // (213ea91 / TyLo phone: wink mid-exit was dropping the rest).
    if (wasRunning && this.exitInFlight && !files && !req.reducedMotion) {
      return true;
    }
    this.stop();
    if (!files || req.reducedMotion) {
      if (wasRunning) this.onFrame(null);
      return false;
    }
    const srcs = files.map((file) => req.srcFor(file));
    // Interrupted by the opposite direction: carry on from the frame that is up when
    // both directions share it (they do not for 1085/1084, so each starts at frame 0).
    const resume = onStage ? srcs.indexOf(onStage) : -1;
    const start = resume >= 0 ? resume : 0;
    // Not reachable from the stage while it waits for the clip (see bridgeGate); only a
    // bounded wait that ran out, or a failed load, ends up here.
    if (!req.isReady(srcs[start]!)) {
      if (wasRunning) this.onFrame(null);
      return false;
    }
    this.frames = srcs;
    this.index = start;
    this.running = true;
    this.isReady = req.isReady;
    this.exitInFlight = req.from === "smug" && req.to === "idle";
    this.dwells = this.dwellsFor(req.from, req.to);
    this.offsets = [];
    let at = 0;
    for (let i = 0; i < srcs.length; i++) {
      this.offsets.push(at);
      at += this.frameMs(i);
    }
    this.offsets.push(at);
    // Both directions wait for a paint before the dwell starts (never skip an unpainted frame).
    this.paintPaced = Boolean(this.afterPaint);
    this.counts = { shown: 1, stalls: 0, reanchors: 0 };
    if (this.player) return this.startPlayer(srcs, start);
    this.anchor = this.now() - (this.offsets[start] ?? 0);
    this.onFrame(srcs[this.index]!);
    this.armDwell();
    return true;
  }

  /** Hand the sequence to the external player: the stage shows frame `start` now, the player paces the rest. */
  private startPlayer(srcs: string[], start: number): boolean {
    const token = ++this.playToken;
    this.playing = true;
    this.onFrame(srcs[start]!);
    const live = () => this.running && this.playing && this.playToken === token;
    const ok = this.player!.play(srcs, start, {
      shown: (index) => {
        if (!live() || index === this.index || !srcs[index]) return;
        this.index = index;
        this.counts.shown += 1;
        this.onFrame(srcs[index]!);
      },
      done: () => {
        if (!live()) return;
        this.playing = false;
        this.stop();
        this.onFrame(null);
      },
    });
    if (!ok) {
      this.playing = false;
      this.stop();
      this.onFrame(null);
      return false;
    }
    return true;
  }

  /**
   * The page went to the background (true) or came back (false). A hidden page
   * gets throttled or frozen timers. The bridge holds the frame that is up while
   * hidden and carries on from it on return (the time spent hidden does not count).
   */
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.player?.setPaused(paused);
    if (paused) {
      if (this.handle) this.timers.clear(this.handle);
      this.handle = 0;
      if (this.cancelPaint) this.cancelPaint();
      this.cancelPaint = null;
      return;
    }
    if (this.running && !this.playing) {
      // The frame that is up gets its full dwell again on return.
      this.anchor = this.now() - (this.offsets[this.index] ?? 0);
      this.armDwell();
    }
  }

  private advance = () => {
    this.handle = 0;
    if (!this.running) return;
    const next = this.index + 1;
    if (next >= this.frames.length) {
      this.stop();
      this.onFrame(null);
      return;
    }
    // Never skip: the next frame is shown only once it has decoded; the frame on stage stays up.
    if (!this.isReady(this.frames[next]!)) {
      this.counts.stalls += 1;
      this.handle = this.timers.set(this.advance, BRIDGE_STALL_POLL_MS);
      return;
    }
    if (this.timers.now) {
      const late = this.now() - this.dueAt(next);
      if (late > BRIDGE_LATE_REANCHOR_MS) {
        // Late frame: shift the rest of the clip back by the delay (no catch-up skipping).
        this.anchor += late;
        this.counts.reanchors += 1;
      }
    }
    this.index = next;
    this.counts.shown += 1;
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
 * Idle↔smug needs its clips before either end of the pair may hard-cut.
 * Entering smug (wanted smug) waits for 1085 + 1084 to be loaded and primed. Leaving
 * smug (shown smug → wanted idle) also waits — otherwise the stage snaps to idle.png
 * and 1084 never plays (TyLo phone FAIL on 7c4e54f).
 */
export function bridgeWantsFrames(
  wantedKey: string | null,
  shownKey: string | null = null,
): boolean {
  if (wantedKey === "smug" || wantedKey === "wave" || wantedKey === "pout") return true;
  if ((shownKey === "smug" || shownKey === "wave" || shownKey === "pout") && wantedKey === "idle") return true;
  return false;
}

/**
 * Should the stage hold the wanted sheet back? Smug never shows (and so a paired
 * change never hard-cuts) just because its frames have not decoded yet: the
 * old sheet stays up until every frame is ready, up to BRIDGE_WAIT_MAX_MS, and
 * only then does it cut, loudly (the puppet logs it and sets
 * `data-rai-bridge-fallback`). Leaving smug for idle keeps `smug1085_hold` up until
 * 1084 can play — never a straight hold→idle.png snap. Reduced motion is the
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
 * Smug hold release (paste-14). smug1085_hold has no timer: it stays up until the
 * user's next send (`release` changes) or until another pose is wanted over it. Then
 * the stage shows plain idle rest instead of the wanted plates, so the driver plays
 * 1084 forward; only after idle has landed (`landed()`) does the wanted pose go on.
 * A release that arrives while 1085 is still coming in waits for the hold (1084 never
 * starts from a half-raised arm), and nothing else takes the stage meanwhile.
 */
export type SmugGateStep = "wanted" | "keep-shown" | "exit-to-idle";

/** Hold poses that stay on their hold frame until the next send (smug 1085 at 2.0 s, wave 1126 at 4.083 s, pout 1158 at 2.0 s). */
export const BRIDGE_HOLD_KEYS = new Set<string>(["smug", "wave", "pout"]);

export class SmugReleaseGate {
  private seen: number;
  private wanted = false;
  private exitActive = false;

  constructor(release = 0) {
    this.seen = release;
  }

  /** One plates pass: what the stage should take. */
  step(opts: { shownKey: string | null; wantedKey: string | null; release: number; entering: boolean }): SmugGateStep {
    const onHold = opts.shownKey != null && BRIDGE_HOLD_KEYS.has(opts.shownKey);
    if (opts.release !== this.seen) {
      this.seen = opts.release;
      if (onHold) this.wanted = true;
    }
    if (onHold && opts.wantedKey !== opts.shownKey) this.wanted = true;
    if (!onHold) this.wanted = false;
    if (this.wanted && !opts.entering) {
      this.wanted = false;
      this.exitActive = true;
    }
    if (this.exitActive) return "exit-to-idle";
    if (this.wanted) return "keep-shown";
    return "wanted";
  }

  /** 1084 is playing or idle has not landed yet: the wanted pose waits. */
  exiting(): boolean {
    return this.exitActive;
  }

  /** Idle landed after 1084 (or there was nothing to play): the wanted pose may go on. */
  landed(): void {
    this.exitActive = false;
  }
}
