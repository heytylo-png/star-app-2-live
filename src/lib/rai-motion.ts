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
 * still land another cycle inside a 10–20s watch. Not scheduled while
 * IDLE_BLINK_ENABLED is false.
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
 * one full frame on one image. Never opacity-blend two sheets. Not
 * scheduled while IDLE_BLINK_ENABLED is false — rest stays on idle.png.
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

/** Idle vertical travel stays under this so the sheet does not float. */
export const IDLE_MAX_TRANSLATE_Y_PX = 1.2;
/** Weight-shift rock, excluding look-at lean. */
export const IDLE_MAX_ROCK_DEG = 0.65;
export const IDLE_BREATHE_MIN = 0.988;
export const IDLE_BREATHE_MAX = 1.014;

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
      scale: 1,
      hairDeg: 0,
    };
  }

  const breathe = 1 + Math.sin(tSeconds * 1.12) * 0.0075 + Math.sin(tSeconds * 0.43) * 0.0025;
  const swayX = Math.sin(tSeconds * 0.52) * 2.4 + Math.sin(tSeconds * 0.21) * 0.9;
  const rock = Math.sin(tSeconds * 0.46) * 0.48 + look * -0.85;
  const lookX = look * 5.5;
  const settleY = Math.sin(tSeconds * 1.12) * 0.55;
  const talkBob = talking ? Math.sin(tSeconds * 5.1) * jaw * 1.05 : 0;
  const hair = Math.sin(tSeconds * 1.65) * 3.1 + Math.sin(tSeconds * 0.88) * 1.35 + look * 2.2;

  return {
    translateX: swayX + lookX,
    translateY: settleY + talkBob,
    rotateZ: rock,
    scale: breathe,
    hairDeg: hair,
  };
}

export function puppetRigTransform(motion: PuppetMotion): string {
  return [
    `translateX(${motion.translateX.toFixed(2)}px)`,
    `translateY(${motion.translateY.toFixed(2)}px)`,
    `rotateZ(${motion.rotateZ.toFixed(2)}deg)`,
    `scale(${motion.scale.toFixed(4)})`,
  ].join(" ");
}
