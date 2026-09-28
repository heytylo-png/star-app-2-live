/**
 * Idle mouth cycle. One baked full-body sheet at a time, same idea as the
 * rest blink. No stickers, overlays, or phoneme sync.
 *
 * 06 smirk is optional. Callers pass smirk: false when
 * public/rai/idle_mouth_06_smirk.png is not in the tree.
 */

export const IDLE_MOUTH_STEP_MIN_MS = 120;
export const IDLE_MOUTH_STEP_MAX_MS = 180;
/** Chance a non-wide peak uses 04 (or 06 when that sheet exists) instead of 03. */
export const IDLE_MOUTH_OPEN_ALT_CHANCE = 0.25;

/** 1 closed, 2 small, 3 open, 4 oo, 5 wide, 6 smirk. */
export type IdleMouthFrame = 1 | 2 | 3 | 4 | 5 | 6;

const MOUTH_FILES: Record<IdleMouthFrame, string> = {
  1: "rai/idle_mouth_01_closed.png",
  2: "rai/idle_mouth_02_small.png",
  3: "rai/idle_mouth_03_open.png",
  4: "rai/idle_mouth_04_oo.png",
  5: "rai/idle_mouth_05_wide.png",
  6: "rai/idle_mouth_06_smirk.png",
};

const WIDE_CUES = new Set(["hype", "scold", "bratty-loud"]);

/** Emotions that pin a different sheet, so the idle mouth must not run. */
const SHEET_SWAP_EMOTIONS = new Set(["shy", "smug", "tired", "soft", "hype"]);

export function idleMouthFile(frame: number): string | null {
  if (frame === 1 || frame === 2 || frame === 3 || frame === 4 || frame === 5 || frame === 6) {
    return MOUTH_FILES[frame];
  }
  return null;
}

export function isIdleMouthSrc(src: string): boolean {
  return /\/idle_mouth_0[1-6]_[a-z]+\.png(?:\?|#|$)/.test(src);
}

export function idleMouthStepName(frame: number): string {
  switch (frame) {
    case 1:
      return "01-closed";
    case 2:
      return "02-small";
    case 3:
      return "03-open";
    case 4:
      return "04-oo";
    case 5:
      return "05-wide";
    case 6:
      return "06-smirk";
    default:
      return "off";
  }
}

export function idleMouthStepMs(rng: () => number = Math.random): number {
  const t = Math.min(1, Math.max(0, rng()));
  return IDLE_MOUTH_STEP_MIN_MS + t * (IDLE_MOUTH_STEP_MAX_MS - IDLE_MOUTH_STEP_MIN_MS);
}

export function isWideMouthCue(emotion: string, pose = ""): boolean {
  return WIDE_CUES.has(emotion) || WIDE_CUES.has(pose);
}

/**
 * Peak frame in the 01-02-peak-02-01 loop.
 * Default 03. ~25% becomes 04, or 06 when that sheet exists.
 * 05 only for hype / scold / bratty-loud.
 */
export function idleMouthPeak(opts: {
  emotion: string;
  pose?: string;
  smirk: boolean;
  rng?: () => number;
}): IdleMouthFrame {
  if (isWideMouthCue(opts.emotion, opts.pose ?? "")) return 5;
  const rng = opts.rng ?? Math.random;
  if (rng() < IDLE_MOUTH_OPEN_ALT_CHANCE) {
    if (opts.smirk && rng() < 0.5) return 6;
    return 4;
  }
  return 3;
}

/** One loop. The timer repeats this until the line ends. */
export function idleMouthCycle(peak: IdleMouthFrame): IdleMouthFrame[] {
  return [1, 2, peak, 2, 1];
}

/**
 * True when a spoken line should drive the idle mouth.
 * Pose must still be idle. Mood pins and any other pose sheet do not cycle.
 * `lineLive` is the streaming bubble or Call TTS, not a leftover caption.
 */
export function idleMouthAllowed(opts: {
  pose: string;
  emotion: string;
  lineLive: boolean;
  reducedMotion: boolean;
}): boolean {
  if (!opts.lineLive || opts.reducedMotion) return false;
  if (opts.pose !== "idle") return false;
  if (SHEET_SWAP_EMOTIONS.has(opts.emotion)) return false;
  return true;
}

/**
 * Start only when the baked frames are already decoded.
 * A line that began before decode stays skipped (`alreadySkipped`).
 */
export function shouldStartIdleMouth(opts: {
  allowed: boolean;
  decoded: boolean;
  alreadySkipped: boolean;
}): boolean {
  return opts.allowed && opts.decoded && !opts.alreadySkipped;
}

/** Blink scheduler stays off while any mouth frame is the idle sheet. */
export function blinkPausedForMouth(mouthFrame: number): boolean {
  return mouthFrame > 0;
}

/** Line over on idle: show 01 closed, then the caller releases blink. */
export function mouthFrameWhenLineEnds(wasShowingMouth: boolean): 0 | 1 {
  return wasShowingMouth ? 1 : 0;
}

/** Pose left idle, or reduced motion: drop the mouth frame. Do not keep 02–06. */
export function mouthFrameWhenCancelled(): 0 {
  return 0;
}

/** After the 01 snap has painted, blink owns the open-lid sheet again. */
export function mouthFrameAfterSnap(): 0 {
  return 0;
}

/**
 * Lids to play before the mouth if a blink is already in progress.
 * Closed or half: 03 → 02 → 01. Already at 02: finish 02 → 01.
 * Open lids start the mouth immediately.
 */
export function blinkReopenFrames(current: number): number[] {
  if (current >= 3) return [3, 2, 1];
  if (current === 2) return [2, 1];
  return [];
}
