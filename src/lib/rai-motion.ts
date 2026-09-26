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
 * `IDLE_BLINK_FADE_MS` is the close phase and the open phase (split across
 * the early/mid lid frames). `IDLE_BLINK_HOLD_MS` is the fully-closed dwell.
 * Both stay inside 80–120ms and under the pose crossfade.
 */
export const IDLE_BLINK_FADE_MS = 100;
export const IDLE_BLINK_HOLD_MS = 100;
/** Random gap between blinks, inclusive range ~3–6s. */
export const IDLE_BLINK_GAP_MIN_MS = 3000;
export const IDLE_BLINK_GAP_MAX_MS = 6000;

export type IdleBlinkStep = { blink: 0 | 1 | 2 | 3; at: number };

/**
 * One rest blink: early lid → mid → closed hold → mid → early → glare eyes.
 * `at` is ms from the start of the blink. Frame 0 restores `idle.png` eyes.
 */
export function idleBlinkSchedule(): IdleBlinkStep[] {
  const step = IDLE_BLINK_FADE_MS / 2;
  const hold = IDLE_BLINK_HOLD_MS;
  return [
    { blink: 1, at: 0 },
    { blink: 2, at: step },
    { blink: 3, at: step * 2 },
    { blink: 2, at: step * 2 + hold },
    { blink: 1, at: step * 3 + hold },
    { blink: 0, at: step * 4 + hold },
  ];
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
