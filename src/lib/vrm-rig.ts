import type { EmotionId, PoseId } from "@/lib/rai";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";

export const STANDIN_VRM_FILE = "models/star-standin.vrm";

/** Extra Euler (radians, XYZ) added on top of a bone's rest pose. */
export type BoneEuler = { x: number; y: number; z: number };

export const ZERO: BoneEuler = { x: 0, y: 0, z: 0 };

export const RIG_BONES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
] as const satisfies readonly VRMHumanBoneName[];

export type RigBoneName = (typeof RIG_BONES)[number];

export type RigPose = Partial<Record<RigBoneName, BoneEuler>>;

const SHY_RIG: RigPose = {
  head: { x: 0.28, y: 0.22, z: 0.04 },
  neck: { x: 0.1, y: 0.08, z: 0 },
  spine: { x: 0.08, y: 0.06, z: 0 },
  leftUpperArm: { x: 0.15, y: 0, z: 0.42 },
  rightUpperArm: { x: 0.15, y: 0, z: -0.42 },
  leftHand: { x: 0, y: 0.15, z: 0.1 },
  rightHand: { x: 0, y: -0.15, z: -0.1 },
};

const POINT_RIG: RigPose = {
  rightShoulder: { x: 0, y: 0.18, z: 0.1 },
  rightUpperArm: { x: -0.35, y: 0.45, z: 1.05 },
  rightLowerArm: { x: 0.1, y: -0.15, z: 0.05 },
  rightHand: { x: 0.1, y: 0, z: 0.12 },
  head: { x: -0.04, y: 0.08, z: 0 },
};

/**
 * VRM rest is T-pose. Drop the arms into a relaxed A-pose so idle
 * doesn't look like a bind pose. Pose extras still stack on rest.
 */
const IDLE_A_POSE: RigPose = {
  leftUpperArm: { x: 0.04, y: 0.08, z: 1.22 },
  rightUpperArm: { x: 0.04, y: -0.08, z: -1.22 },
  leftLowerArm: { x: 0.06, y: 0.12, z: 0.1 },
  rightLowerArm: { x: 0.06, y: -0.12, z: -0.1 },
  leftHand: { x: 0.05, y: 0.08, z: 0.04 },
  rightHand: { x: 0.05, y: -0.08, z: -0.04 },
};

/**
 * Procedural body language for Helix pose keys that the stand-in can act.
 * Unlisted keys fall back to the PNG puppet (see `toonHandlesPose`).
 */
const POSE_RIG: Partial<Record<PoseId, RigPose>> = {
  idle: IDLE_A_POSE,
  talk: IDLE_A_POSE,
  wink: {
    head: { x: 0.02, y: 0.14, z: 0.06 },
    neck: { x: 0, y: 0.06, z: 0.03 },
  },
  laugh: {
    spine: { x: 0.08, y: 0, z: 0 },
    chest: { x: 0.05, y: 0, z: 0 },
    head: { x: -0.06, y: 0, z: 0.04 },
  },
  think: {
    head: { x: 0.12, y: -0.22, z: 0.05 },
    neck: { x: 0.06, y: -0.08, z: 0 },
    rightShoulder: { x: 0, y: 0.15, z: 0.1 },
    rightUpperArm: { x: -0.45, y: 0.55, z: 1.35 },
    rightLowerArm: { x: 0.25, y: -1.55, z: 0.2 },
    rightHand: { x: 0.15, y: -0.2, z: 0.25 },
  },
  pout: {
    head: { x: 0.08, y: 0.1, z: 0.04 },
    neck: { x: 0.04, y: 0.04, z: 0 },
    spine: { x: 0.04, y: 0, z: 0 },
  },
  tired: {
    head: { x: 0.22, y: -0.06, z: 0 },
    neck: { x: 0.12, y: 0, z: 0 },
    spine: { x: 0.12, y: 0, z: 0 },
    chest: { x: 0.04, y: 0, z: 0 },
    leftUpperArm: { x: 0.1, y: 0, z: 0.16 },
    rightUpperArm: { x: 0.1, y: 0, z: -0.16 },
  },
  smug: {
    head: { x: -0.04, y: 0.16, z: 0.07 },
    neck: { x: -0.02, y: 0.06, z: 0.03 },
    hips: { x: 0, y: -0.1, z: 0.03 },
    spine: { x: -0.03, y: -0.04, z: 0.02 },
  },
  wave: {
    rightShoulder: { x: 0, y: 0.12, z: 0.18 },
    rightUpperArm: { x: -0.15, y: 0.25, z: 2.35 },
    rightLowerArm: { x: 0, y: -0.35, z: 0.1 },
    rightHand: { x: 0.1, y: 0, z: 0.15 },
    head: { x: 0, y: 0.12, z: 0.04 },
  },
  embarrassed: SHY_RIG,
  scold: POINT_RIG,
  shy: SHY_RIG,
  sad: {
    head: { x: 0.22, y: -0.08, z: 0 },
    neck: { x: 0.1, y: 0, z: 0 },
    spine: { x: 0.1, y: 0, z: 0 },
    leftUpperArm: { x: 0.12, y: 0, z: 0.2 },
    rightUpperArm: { x: 0.12, y: 0, z: -0.2 },
  },
  surprise: {
    head: { x: -0.1, y: 0, z: 0 },
    neck: { x: -0.04, y: 0, z: 0 },
    spine: { x: -0.04, y: 0, z: 0 },
  },
  content: {
    head: { x: 0.04, y: 0, z: 0 },
    spine: { x: 0.03, y: 0, z: 0 },
  },
  hearts: {
    spine: { x: 0.06, y: 0, z: 0 },
    chest: { x: 0.04, y: 0, z: 0 },
    leftShoulder: { x: 0, y: -0.12, z: -0.08 },
    rightShoulder: { x: 0, y: 0.12, z: 0.08 },
    leftUpperArm: { x: 0.45, y: -0.15, z: 0.85 },
    rightUpperArm: { x: 0.45, y: 0.15, z: -0.85 },
    leftLowerArm: { x: 0.2, y: 1.05, z: 0.15 },
    rightLowerArm: { x: 0.2, y: -1.05, z: -0.15 },
    leftHand: { x: 0.15, y: 0.2, z: 0.1 },
    rightHand: { x: 0.15, y: -0.2, z: -0.1 },
    head: { x: -0.04, y: 0, z: 0 },
  },
  turn: {
    hips: { x: 0, y: 0.72, z: 0 },
    spine: { x: 0.04, y: 0.18, z: 0.04 },
    chest: { x: 0, y: 0.12, z: 0 },
    neck: { x: 0.06, y: 0.2, z: 0.04 },
    head: { x: 0.08, y: 0.28, z: 0.06 },
    leftUpperArm: { x: 0.08, y: 0, z: 0.18 },
    rightUpperArm: { x: 0.08, y: 0, z: -0.12 },
  },
  profile: {
    hips: { x: 0, y: 1.15, z: 0 },
    spine: { x: 0, y: 0.15, z: 0 },
    neck: { x: 0, y: 0.12, z: 0 },
    head: { x: 0, y: 0.18, z: 0 },
  },
  three_quarter_left: {
    hips: { x: 0, y: 0.42, z: 0 },
    spine: { x: 0, y: 0.08, z: 0 },
    head: { x: 0, y: 0.1, z: 0 },
  },
  three_quarter_right: {
    hips: { x: 0, y: -0.42, z: 0 },
    spine: { x: 0, y: -0.08, z: 0 },
    head: { x: 0, y: -0.1, z: 0 },
  },
  three_quarter: {
    hips: { x: 0, y: 0.28, z: 0 },
    head: { x: 0, y: 0.08, z: 0 },
  },
  point: POINT_RIG,
};

/** Emotion-only body language when pose is idle/talk. */
const EMOTION_RIG: Record<EmotionId, RigPose> = {
  bratty: {
    head: { x: -0.05, y: 0.12, z: 0.05 },
    neck: { x: -0.02, y: 0.05, z: 0.02 },
    hips: { x: 0, y: -0.08, z: 0.03 },
  },
  smug: POSE_RIG.smug ?? {},
  tired: POSE_RIG.tired ?? {},
  shy: SHY_RIG,
  soft: {
    head: { x: 0.04, y: 0, z: 0 },
    spine: { x: 0.03, y: 0, z: 0 },
  },
  hype: {
    head: { x: -0.08, y: 0, z: 0 },
    spine: { x: -0.04, y: 0, z: 0 },
    chest: { x: 0.04, y: 0, z: 0 },
  },
  glance: {
    head: { x: 0.02, y: 0.28, z: 0.04 },
    neck: { x: 0, y: 0.1, z: 0.02 },
  },
};

export function rigFor(pose: PoseId, emotion: EmotionId): RigPose {
  if (pose !== "idle" && pose !== "talk") {
    return { ...IDLE_A_POSE, ...(POSE_RIG[pose] ?? {}) };
  }
  return { ...IDLE_A_POSE, ...(EMOTION_RIG[emotion] ?? {}) };
}

/** Root-group yaw (radians). Front / slight ¾ by default — no 180° spin. */
export function rootYawFor(pose: PoseId): number {
  if (pose === "turn") return 0.55;
  if (pose === "profile") return 1.05;
  if (pose === "three_quarter_left") return 0.48;
  if (pose === "three_quarter_right") return -0.48;
  if (pose === "three_quarter") return 0.32;
  if (pose === "shy" || pose === "embarrassed") return 0.22;
  return 0.16;
}

/**
 * Hand-shape / prop poses the generic VRM cannot act without looking wrong.
 * 3D mode stays on; Presence covers these with the PNG puppet.
 */
export const PNG_FALLBACK_POSES = new Set<PoseId>(["peace", "middle_finger", "hold"]);

export function toonHandlesPose(pose: PoseId): boolean {
  return !PNG_FALLBACK_POSES.has(pose);
}

export type ExprMap = Record<string, number>;

const EMOTION_EXPR: Record<EmotionId, ExprMap> = {
  bratty: { angry: 0.28, happy: 0.18 },
  smug: { happy: 0.42, relaxed: 0.2 },
  tired: { relaxed: 0.55, sad: 0.12 },
  shy: { blush: 0.55, happy: 0.12 },
  soft: { happy: 0.38, relaxed: 0.25 },
  hype: { happy: 0.78, surprised: 0.15 },
  glance: { relaxed: 0.15 },
};

const POSE_EXPR: Partial<Record<PoseId, ExprMap>> = {
  wink: { blink: 0 }, // wink uses blinkLeft when present
  laugh: { happy: 0.9 },
  think: { relaxed: 0.28 },
  pout: { angry: 0.22, sad: 0.18 },
  tired: { relaxed: 0.5 },
  smug: { happy: 0.4 },
  wave: { happy: 0.35 },
  embarrassed: { blush: 0.5, happy: 0.1 },
  scold: { angry: 0.55 },
  shy: { blush: 0.45, happy: 0.1 },
  sad: { sad: 0.72 },
  surprise: { surprised: 0.84 },
  content: { happy: 0.4, relaxed: 0.3 },
  hearts: { happy: 0.88 },
  turn: { angry: 0.18, sad: 0.1 },
  point: { angry: 0.2 },
};

export function expressionsFor(
  pose: PoseId,
  emotion: EmotionId,
  talking: boolean,
  amplitude: number,
  blink: number,
): ExprMap {
  const out: ExprMap = {};
  mergeExpr(out, EMOTION_EXPR[emotion]);
  if (pose !== "idle" && pose !== "talk") mergeExpr(out, POSE_EXPR[pose] ?? {});
  if (pose === "wink") out.blinkLeft = 1;
  if (talking || pose === "talk") {
    const a = Math.max(0, Math.min(1, amplitude));
    const shaped = a * a * (3 - 2 * a);
    const open = talking ? 0.16 + shaped * 0.78 : 0.22;
    out.aa = Math.max(out.aa ?? 0, open);
    out.oh = Math.max(out.oh ?? 0, shaped * 0.18);
  }
  if (blink > 0.01 && pose !== "wink") out.blink = blink;
  return out;
}

function mergeExpr(target: ExprMap, extra: ExprMap) {
  for (const [key, value] of Object.entries(extra)) {
    target[key] = Math.max(target[key] ?? 0, value);
  }
}

/** VRM 1.0 presets plus common VRM 0.0 / VRoid aliases. */
const EXPR_ALIASES: Record<string, readonly string[]> = {
  happy: ["happy", "Joy", "joy", "Fun"],
  angry: ["angry", "Angry"],
  sad: ["sad", "Sorrow", "sorrow"],
  surprised: ["surprised", "Surprised"],
  relaxed: ["relaxed", "Fun", "Neutral"],
  aa: ["aa", "A", "a"],
  ih: ["ih", "I", "i"],
  ou: ["ou", "U", "u"],
  ee: ["ee", "E", "e"],
  oh: ["oh", "O", "o"],
  blink: ["blink", "Blink"],
  blinkLeft: ["blinkLeft", "Blink_L", "blink_l"],
  blush: ["blush", "Blush", "cheek", "Cheek"],
};

export function resolveExprName(available: Set<string>, logical: string): string | null {
  const aliases = EXPR_ALIASES[logical] ?? [logical];
  for (const name of aliases) {
    if (available.has(name)) return name;
  }
  return null;
}

export function lerpEuler(current: BoneEuler, target: BoneEuler, t: number): BoneEuler {
  return {
    x: current.x + (target.x - current.x) * t,
    y: current.y + (target.y - current.y) * t,
    z: current.z + (target.z - current.z) * t,
  };
}

export function expT(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}
