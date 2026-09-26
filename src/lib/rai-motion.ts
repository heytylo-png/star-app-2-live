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
 * Each lid drawing is held for about two 24fps animation frames so close
 * and open are steps (closing, half, closed) instead of an open↔closed pop.
 * One step stays under the pose crossfade; a pose change still cuts the blink.
 */
export const IDLE_BLINK_STEP_FRAMES = 2;
/** 24fps twos. ~83ms, about two animation frames. */
export const IDLE_BLINK_STEP_MS = Math.round((1000 / 24) * IDLE_BLINK_STEP_FRAMES);
/** Random gap between blinks, inclusive range ~3–6s. */
export const IDLE_BLINK_GAP_MIN_MS = 3000;
export const IDLE_BLINK_GAP_MAX_MS = 6000;

export type IdleBlinkStep = { blink: 0 | 1 | 2 | 3; at: number };

/**
 * TyLo L/R hole sequence, about two frames each.
 * 01-open → 02-closing → 03-half → 04-462-blink → 03-half → 02-closing → 01-open.
 *
 * `at` is ms from the start of the blink. blink 0 paints the 01-open crops
 * onto idle.png. 1 = 02-closing, 2 = 03-half, 3 = 04-462-blink.
 */
export const IDLE_BLINK_SEQUENCE = [
  "open",
  "closing",
  "half",
  "closed",
  "half",
  "closing",
  "open",
] as const;

const IDLE_BLINK_FRAME = {
  open: 0,
  closing: 1,
  half: 2,
  closed: 3,
} as const satisfies Record<(typeof IDLE_BLINK_SEQUENCE)[number], 0 | 1 | 2 | 3>;

export function idleBlinkSchedule(): IdleBlinkStep[] {
  return IDLE_BLINK_SEQUENCE.map((lid, index) => ({
    blink: IDLE_BLINK_FRAME[lid],
    at: index * IDLE_BLINK_STEP_MS,
  }));
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
