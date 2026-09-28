/**
 * Official PNG puppet motion model (animation track #1).
 *
 * Hip-origin micro-motion on the live pose sheets. No rotateY cardboard flip.
 * Expo bust mouth/eye crops do not participate — they fight the full-body pack.
 * See ANIMATION.md.
 */

export const POSE_CROSSFADE_MS = 380;
/** Smile/grin Expo alts are not official idle beats — kept for API only. */
export const IDLE_BEAT_FADE_MS = 400;

/**
 * Rest-idle blink timing. One full frame replaces the last on a single
 * image. Not an opacity crossfade of two sheets, and not a second image
 * over the body.
 *
 * The lid pass is five hard cuts — 02 → 03 → 04 → 03 → 02 — in 300ms,
 * then hold 01. The first blink starts soon after rest idle; later gaps
 * still land another cycle inside a 10–20s watch. Blink is on
 * (IDLE_BLINK_ENABLED). Approved by TyLo on 2026-09-26
 * (807-referenced painted lids, pass 4b).
 */
/** One lid cut. Five of these are the whole close-and-open. */
export const IDLE_BLINK_STEP_MS = 60;
/** 02 → 03 → 04 → 03 → 02. Hold 01 after this, not during it. */
export const IDLE_BLINK_PASS_MS = IDLE_BLINK_STEP_MS * 5;
/** Delay before the first blink once rest idle is allowed. */
export const IDLE_BLINK_FIRST_MS = 900;
/** Random gap after a cycle finishes, before the next one. */
export const IDLE_BLINK_GAP_MIN_MS = 4500;
export const IDLE_BLINK_GAP_MAX_MS = 7000;

/** 0 rests on 01 open. 1 = 01 open, 2 = 02 closing, 3 = 03 half, 4 = 04 closed. */
export type IdleBlinkFrame = 0 | 1 | 2 | 3 | 4;

export type IdleBlinkStep = { blink: IdleBlinkFrame; at: number };

/** Lid pass only. 01 is the hold after this, not a step inside it. */
const IDLE_BLINK_LIDS = [2, 3, 4, 3, 2] as const;

/** Step name for a schedule frame. `rest` is the same sheet as 01 open. */
export function idleBlinkStepName(
  blink: number,
): "01-open" | "02-closing" | "03-half" | "04-closed" | "rest" {
  if (blink === 1) return "01-open";
  if (blink === 2) return "02-closing";
  if (blink === 3) return "03-half";
  if (blink === 4) return "04-closed";
  return "rest";
}

/**
 * One rest blink: 02 → 03 → 04 → 03 → 02 in 300ms, then hold 01.
 * Do not skip 02. `at` is ms from the start of the blink. The last step
 * is 01 open and stays up until the next gap. Each step is a hard cut of
 * one full frame on one image. Never opacity-blend two sheets. Blink is
 * on (IDLE_BLINK_ENABLED). Approved by TyLo on 2026-09-26
 * (807-referenced painted lids, pass 4b).
 */
export function idleBlinkSchedule(): IdleBlinkStep[] {
  const frames: IdleBlinkFrame[] = [...IDLE_BLINK_LIDS, 1];
  let at = 0;
  return frames.map((blink) => {
    const entry: IdleBlinkStep = { blink, at };
    // 01 is the hold. The gap timer starts when it lands.
    if (blink !== 1) at += IDLE_BLINK_STEP_MS;
    return entry;
  });
}

/**
 * Idle talking mouth. Same rule as the blink: one full 1008×1792 sheet on the
 * one rest <img>, hard cuts only. Runs only while she is speaking on the idle
 * pose (IDLE_MOUTH_ENABLED in rai.ts). At rest she sits on 01.
 *
 * Default syllable is 01 → 02 → 03 → 02 → 01. 04 (oo) and 06 (smirk) are
 * occasional spice. 05 (wide) only on hype lines (exclamation-heavy text).
 * talk_official.png is never a viseme.
 */
export const IDLE_MOUTH_STEP_MIN_MS = 90;
export const IDLE_MOUTH_STEP_MAX_MS = 120;
/** Share of syllables whose peak is 04 oo instead of 03 open. */
export const IDLE_MOUTH_OO_CHANCE = 0.12;
/** Share of syllables that are a short 06 smirk beat instead of a flap. */
export const IDLE_MOUTH_SMIRK_CHANCE = 0.07;
/** On a hype line, share of peaks that open to 05 wide. Never on other lines. */
export const IDLE_MOUTH_WIDE_HYPE_CHANCE = 0.4;
/** Real TTS amplitude below this (once audio has been heard) holds 01 closed. */
export const IDLE_MOUTH_SILENT_AMP = 0.04;
/** Real TTS amplitude below this only opens to 02 small. */
export const IDLE_MOUTH_QUIET_AMP = 0.12;

/**
 * 0 rests on 01 (the rest sheet, byte copy of idle.png).
 * 1 closed, 2 small, 3 open, 4 oo, 5 wide, 6 smirk.
 */
export type IdleMouthFrame = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type IdleMouthStep = { mouth: IdleMouthFrame; ms: number };

export function idleMouthStepName(
  mouth: number,
): "01-closed" | "02-small" | "03-open" | "04-oo" | "05-wide" | "06-smirk" | "rest" {
  if (mouth === 1) return "01-closed";
  if (mouth === 2) return "02-small";
  if (mouth === 3) return "03-open";
  if (mouth === 4) return "04-oo";
  if (mouth === 5) return "05-wide";
  if (mouth === 6) return "06-smirk";
  return "rest";
}

/** One mouth cut, jittered inside 90–120ms. */
export function idleMouthStepMs(rand: () => number = Math.random): number {
  const t = Math.min(1, Math.max(0, rand()));
  return Math.round(IDLE_MOUTH_STEP_MIN_MS + t * (IDLE_MOUTH_STEP_MAX_MS - IDLE_MOUTH_STEP_MIN_MS));
}

/** Hype / excited line: two or more "!", or one "!" with a shouted word. */
export function isHypeLine(text: string | null | undefined): boolean {
  if (!text) return false;
  const bangs = (text.match(/!/g) ?? []).length;
  if (bangs >= 2) return true;
  return bangs === 1 && /\b[A-Z]{3,}\b/.test(text);
}

/**
 * The next syllable, starting from 01 closed and ending back on 01.
 * Default [02, 03, 02, 01]. `amplitude` is used only once real TTS audio has
 * been heard on this line (`ampLive`): silence holds 01, quiet opens to 02.
 */
export function idleMouthSyllable(
  opts: {
    hype?: boolean;
    amplitude?: number;
    ampLive?: boolean;
    rand?: () => number;
  } = {},
): IdleMouthStep[] {
  const rand = opts.rand ?? Math.random;
  const step = () => idleMouthStepMs(rand);
  if (opts.ampLive) {
    const a = opts.amplitude ?? 0;
    if (a < IDLE_MOUTH_SILENT_AMP) return [{ mouth: 1, ms: step() }];
    if (a < IDLE_MOUTH_QUIET_AMP) {
      return [
        { mouth: 2, ms: step() },
        { mouth: 1, ms: step() },
      ];
    }
  }
  const roll = rand();
  if (roll < IDLE_MOUTH_SMIRK_CHANCE) {
    // A beat of smirk, held two cuts, then closed.
    return [
      { mouth: 6, ms: step() + step() },
      { mouth: 1, ms: step() },
    ];
  }
  let peak: IdleMouthFrame = 3;
  if (opts.hype && rand() < IDLE_MOUTH_WIDE_HYPE_CHANCE) peak = 5;
  else if (roll < IDLE_MOUTH_SMIRK_CHANCE + IDLE_MOUTH_OO_CHANCE) peak = 4;
  return [
    { mouth: 2, ms: step() },
    { mouth: peak, ms: step() },
    { mouth: 2, ms: step() },
    { mouth: 1, ms: step() },
  ];
}

/** Idle vertical travel stays under this so the sheet does not float. */
export const IDLE_MAX_TRANSLATE_Y_PX = 1.2;
/** Weight-shift rock, excluding look-at lean. */
export const IDLE_MAX_ROCK_DEG = 0.65;
/**
 * Rest scale is exactly 1. The sheet is sized once, in whole device pixels, by
 * the stage (see puppet.tsx). A breathe scale here resampled it a second time
 * every frame and made her face soft on high-DPR phones.
 */
export const IDLE_REST_SCALE = 1;

export type PuppetMotion = {
  translateX: number;
  translateY: number;
  rotateZ: number;
  scale: number;
  hairDeg: number;
};

export type PuppetMotionOpts = {
  reduced?: boolean;
  /** Pointer look-at, -1..1. */
  look?: number;
  talking?: boolean;
  jaw?: number;
};

/**
 * Planted idle life + a small talk bob. Apply to [data-rai-rig] (hip origin).
 * Ahoge uses `hairDeg` separately.
 */
export function puppetIdleMotion(tSeconds: number, opts: PuppetMotionOpts = {}): PuppetMotion {
  const look = opts.look ?? 0;
  const talking = opts.talking ?? false;
  const jaw = opts.jaw ?? 0;

  if (opts.reduced) {
    return {
      translateX: look * 2,
      translateY: 0,
      rotateZ: look * -0.35,
      scale: IDLE_REST_SCALE,
      hairDeg: 0,
    };
  }

  const swayX = Math.sin(tSeconds * 0.52) * 2.4 + Math.sin(tSeconds * 0.21) * 0.9;
  // No idle rock: any rotateZ resamples the whole sheet every frame (measured:
  // face sharpness ~400 with the 0.48deg rock vs ~695 without at DPR 3). The
  // weight shift is whole-pixel X sway; rotation is kept only for look-at lean.
  const rock = look * -0.85;
  const lookX = look * 5.5;
  const settleY = Math.sin(tSeconds * 1.12) * 0.55;
  const talkBob = talking ? Math.sin(tSeconds * 5.1) * jaw * 1.05 : 0;
  const hair = Math.sin(tSeconds * 1.65) * 3.1 + Math.sin(tSeconds * 0.88) * 1.35 + look * 2.2;

  return {
    translateX: swayX + lookX,
    translateY: settleY + talkBob,
    rotateZ: rock,
    scale: IDLE_REST_SCALE,
    hairDeg: hair,
  };
}

/** Below this the look-at lean is omitted from the rig transform. */
export const ROCK_EPSILON_DEG = 0.05;

/** Snap a CSS length to whole device pixels (whole CSS px when dpr is 1). */
export function snapToDevicePx(px: number, dpr = 1): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const v = Math.round(px * d) / d;
  return Object.is(v, -0) ? 0 : v;
}

/**
 * Rig transform: whole-pixel translate (+ look-at lean only). No scale() at all, so the sheet
 * is never resampled by a zoom here. Pass `devicePixelRatio` so the translate
 * lands on whole device pixels (at dpr 1 this is plain Math.round).
 */
export function puppetRigTransform(motion: PuppetMotion, dpr = 1): string {
  const x = snapToDevicePx(motion.translateX, dpr);
  const y = snapToDevicePx(motion.translateY, dpr);
  const parts = [`translate(${x}px, ${y}px)`];
  // Sub-0.05deg lean (look easing back to centre) is dropped so rest stays pixel-exact.
  if (Math.abs(motion.rotateZ) >= ROCK_EPSILON_DEG) parts.push(`rotateZ(${motion.rotateZ.toFixed(2)}deg)`);
  return parts.join(" ");
}
