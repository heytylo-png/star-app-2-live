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
 * Rest-idle blink timing. One full frame replaces the last. Not an opacity
 * crossfade of two sheets, and not a second image over the body.
 *
 * The long shot shows the eye band at about 80×23 CSS pixels. A 50ms half
 * and a 100ms closed dwell are over before a glance can register the step.
 * Twos at 24fps are ~83ms; every lid step holds at least that. 01 open and
 * 02 closing are the short lead-in. 03 half and 04 closed stay up long
 * enough to read. The first blink starts soon after rest idle; later gaps
 * still land another cycle inside a 10–20s watch.
 */
/** Two frames at 24fps. Shorter than this (the old 50ms half) does not read. */
export const IDLE_BLINK_MIN_STEP_MS = Math.round(2000 / 24);
/** 01 open. Visible step, not a one-frame smear. */
export const IDLE_BLINK_OPEN_MS = 160;
/** 02 closing. Same open-ish hold so the step reads on the long shot. */
export const IDLE_BLINK_CLOSING_MS = 160;
export const IDLE_BLINK_HALF_MS = 640;
export const IDLE_BLINK_HOLD_MS = 1000;
/** Delay before the first blink once rest idle is allowed. */
export const IDLE_BLINK_FIRST_MS = 900;
/** Random gap after a cycle finishes, before the next one. */
export const IDLE_BLINK_GAP_MIN_MS = 4500;
export const IDLE_BLINK_GAP_MAX_MS = 7000;

/** 0 rests on 01 open. 1 = 01 open, 2 = 02 closing, 3 = 03 half, 4 = 04 closed. */
export type IdleBlinkFrame = 0 | 1 | 2 | 3 | 4;

export type IdleBlinkStep = { blink: IdleBlinkFrame; at: number };

/** Baked full frames, forward order. 1 open → 2 closing → 3 half → 4 closed. */
const IDLE_BLINK_FORWARD = [1, 2, 3, 4] as const;

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
 * One rest blink: 01 → 02 → 03 → 04 → 03 → 02 → 01, then rest.
 * Do not skip 02. `at` is ms from the start of the blink. The last step
 * is rest, which is the 01 open sheet again. Each step is a hard cut of
 * one full frame. Never opacity-blend two sheets. Not scheduled while
 * IDLE_BLINK_ENABLED is false — rest stays on idle.png.
 */
function idleBlinkDwellMs(blink: IdleBlinkFrame): number {
  if (blink === 4) return IDLE_BLINK_HOLD_MS;
  if (blink === 3) return IDLE_BLINK_HALF_MS;
  if (blink === 2) return IDLE_BLINK_CLOSING_MS;
  return IDLE_BLINK_OPEN_MS;
}

export function idleBlinkSchedule(): IdleBlinkStep[] {
  const forward: IdleBlinkFrame[] = [...IDLE_BLINK_FORWARD];
  const reverse = forward.slice(0, -1).reverse();
  const frames: IdleBlinkFrame[] = [...forward, ...reverse, 0];
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
