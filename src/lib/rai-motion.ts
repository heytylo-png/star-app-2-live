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
 * Rest-idle blink timing. Not an opacity crossfade of two full sheets.
 *
 * The long shot shows the eye band at about 80×23 CSS pixels. A 50ms half
 * and a 100ms closed dwell are over before a glance can register the step.
 * 02-open is the short lead-in. 03-half and 04-closed stay up long enough
 * to read. The first blink starts soon after rest idle; later gaps still
 * land another cycle inside a 10–20s watch.
 */
export const IDLE_BLINK_OPEN_MS = 160;
export const IDLE_BLINK_HALF_MS = 640;
export const IDLE_BLINK_HOLD_MS = 1000;
/** Delay before the first blink once rest idle is allowed. */
export const IDLE_BLINK_FIRST_MS = 900;
/** Random gap after a cycle finishes, before the next one. */
export const IDLE_BLINK_GAP_MIN_MS = 4500;
export const IDLE_BLINK_GAP_MAX_MS = 7000;

export type IdleBlinkStep = { blink: 0 | 1 | 2 | 3; at: number };

/** Maker frames. 1 = 02-open (788), 2 = 03-half (791), 3 = 04-closed (789). */
const IDLE_BLINK_FORWARD = [1, 2, 3] as const;

/**
 * Patch name for a schedule step. `idle` is the dest rect copied back from
 * idle.png — not a fourth patch, and not 01-open-brow.
 */
export function idleBlinkStepName(blink: number): "02-open" | "03-half" | "04-closed" | "idle" {
  if (blink === 1) return "02-open";
  if (blink === 2) return "03-half";
  if (blink >= 3) return "04-closed";
  return "idle";
}

/**
 * One rest blink on the single dest rect.
 * 02-open → 03-half → 04-closed → reverse (03-half → 02-open) → idle dest.
 * `at` is ms from the start of the blink. The last step restores idle.png
 * inside the dest rect. The body sheet is not swapped.
 */
function idleBlinkDwellMs(blink: 0 | 1 | 2 | 3): number {
  if (blink === 3) return IDLE_BLINK_HOLD_MS;
  if (blink === 2) return IDLE_BLINK_HALF_MS;
  return IDLE_BLINK_OPEN_MS;
}

export function idleBlinkSchedule(): IdleBlinkStep[] {
  const forward: Array<1 | 2 | 3> = [...IDLE_BLINK_FORWARD];
  const reverse = forward.slice(0, -1).reverse();
  const frames: Array<0 | 1 | 2 | 3> = [...forward, ...reverse, 0];
  let at = 0;
  return frames.map((blink) => {
    const entry: IdleBlinkStep = { blink, at };
    // The idle restore has no lid dwell. The gap timer starts when it lands.
    if (blink !== 0) at += idleBlinkDwellMs(blink);
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
