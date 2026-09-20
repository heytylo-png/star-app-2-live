/**
 * Public-domain-style sample cutout (not Star Rai).
 *
 * Proves the track #2 runtime: idle breathe, talk jaw, wave / scold / pout / shy.
 * Official PNG sheets stay the shipping face. See SPINE.md.
 */

import type { CutoutAttachment, CutoutClip, CutoutSkeleton, CutoutSlot } from "./cutout-runtime.ts";

const SKIN = "#d08b5c";
const SKIN_DEEP = "#c47b4e";
const HAIR = "#1a1614";
const HAIR_SHINE = "#2c2622";
const SHIRT = "#f6f3ec";
const NAVY = "#1c2c48";
const NAVY_DEEP = "#152238";
const BOW = "#c4162e";
const SOCK = "#243552";
const SHOE = "#6b3c28";
const EYE = "#e8a31c";
const EYE_DARK = "#3a220c";
const LIP = "#b45a4a";

function ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, stroke?: string): CutoutAttachment["shapes"] {
  const shapes: NonNullable<CutoutAttachment["shapes"]> = [{ type: "ellipse", cx, cy, rx, ry, fill, stroke, strokeWidth: stroke ? 1.1 : 0 }];
  return shapes;
}

function slot(name: string, bone: string, attachment: CutoutAttachment, extra?: Record<string, CutoutAttachment>): CutoutSlot {
  return {
    name,
    bone,
    attachment: attachment.name,
    attachments: { [attachment.name]: attachment, ...(extra ?? {}) },
  };
}

function att(name: string, shapes: NonNullable<CutoutAttachment["shapes"]>, x = 0, y = 0): CutoutAttachment {
  return { name, x, y, shapes };
}

function keys(pairs: Array<[number, number]>): { time: number; value: number }[] {
  return pairs.map(([time, value]) => ({ time, value }));
}

const idle: CutoutClip = {
  duration: 3.2,
  loop: true,
  bones: {
    hip: {
      rotate: keys([
        [0, 0],
        [0.8, -0.55],
        [1.6, 0.2],
        [2.4, 0.5],
        [3.2, 0],
      ]),
      x: keys([
        [0, 0],
        [1.6, 3.2],
        [3.2, 0],
      ]),
    },
    torso: {
      scaleY: keys([
        [0, 1],
        [1.55, 1.018],
        [3.2, 1],
      ]),
      scaleX: keys([
        [0, 1],
        [1.55, 0.992],
        [3.2, 1],
      ]),
    },
    chest: {
      y: keys([
        [0, -46],
        [1.55, -49],
        [3.2, -46],
      ]),
    },
    ahoge: {
      rotate: keys([
        [0, 18],
        [0.9, 28],
        [1.8, 12],
        [2.6, 24],
        [3.2, 18],
      ]),
    },
    hairFront: {
      rotate: keys([
        [0, 0],
        [1.6, 1.4],
        [3.2, 0],
      ]),
    },
    upperArmL: {
      rotate: keys([
        [0, 8],
        [1.6, 11],
        [3.2, 8],
      ]),
    },
    upperArmR: {
      rotate: keys([
        [0, -8],
        [1.6, -11],
        [3.2, -8],
      ]),
    },
  },
};

const talk: CutoutClip = {
  duration: 3.2,
  loop: true,
  bones: {
    ...idle.bones,
    torso: {
      ...idle.bones?.torso,
      y: keys([
        [0, -42],
        [0.18, -40],
        [0.4, -43],
        [3.2, -42],
      ]),
    },
  },
};

const wave: CutoutClip = {
  duration: 1.6,
  loop: true,
  bones: {
    hip: { rotate: keys([[0, 2]]) },
    torso: { rotate: keys([[0, 4]]) },
    head: { rotate: keys([[0, 6]]) },
    upperArmR: {
      rotate: keys([
        [0, -145],
        [0.4, -128],
        [0.8, -152],
        [1.2, -130],
        [1.6, -145],
      ]),
    },
    forearmR: {
      rotate: keys([
        [0, -18],
        [0.4, 8],
        [0.8, -22],
        [1.2, 6],
        [1.6, -18],
      ]),
    },
    handR: {
      rotate: keys([
        [0, 8],
        [0.4, 18],
        [0.8, 4],
        [1.6, 8],
      ]),
    },
    upperArmL: { rotate: keys([[0, 42]]) },
    forearmL: { rotate: keys([[0, 48]]) },
    handL: { rotate: keys([[0, 12]]) },
    ahoge: {
      rotate: keys([
        [0, 22],
        [0.8, 34],
        [1.6, 22],
      ]),
    },
  },
};

const scold: CutoutClip = {
  duration: 1.4,
  loop: true,
  bones: {
    hip: { rotate: keys([[0, -2]]), y: keys([[0, 0]]) },
    torso: { rotate: keys([[0, 8]]), scaleY: keys([[0, 1.02]]) },
    chest: { rotate: keys([[0, 6]]) },
    head: { rotate: keys([[0, 4]]) },
    upperArmR: {
      rotate: keys([
        [0, -88],
        [0.7, -82],
        [1.4, -88],
      ]),
    },
    forearmR: { rotate: keys([[0, -8]]) },
    handR: { rotate: keys([[0, 4]]) },
    upperArmL: { rotate: keys([[0, 46]]) },
    forearmL: { rotate: keys([[0, 52]]) },
    thighL: { rotate: keys([[0, -8]]) },
    thighR: { rotate: keys([[0, 8]]) },
    ahoge: { rotate: keys([[0, 8]]) },
  },
};

const pout: CutoutClip = {
  duration: 2.4,
  loop: true,
  bones: {
    hip: { rotate: keys([[0, 3]]) },
    torso: { rotate: keys([[0, -3]]) },
    head: {
      rotate: keys([
        [0, -8],
        [1.2, -6],
        [2.4, -8],
      ]),
    },
    upperArmL: { rotate: keys([[0, 16]]) },
    upperArmR: { rotate: keys([[0, -16]]) },
    ahoge: {
      rotate: keys([
        [0, 10],
        [1.2, 16],
        [2.4, 10],
      ]),
    },
  },
};

const shy: CutoutClip = {
  duration: 2.6,
  loop: true,
  bones: {
    hip: { rotate: keys([[0, -4]]) },
    torso: { rotate: keys([[0, 6]]), scaleY: keys([[0, 0.985]]) },
    chest: { rotate: keys([[0, 4]]) },
    head: { rotate: keys([[0, 12]]), y: keys([[0, 4]]) },
    upperArmL: { rotate: keys([[0, 38]]) },
    forearmL: { rotate: keys([[0, 55]]) },
    upperArmR: { rotate: keys([[0, -36]]) },
    forearmR: { rotate: keys([[0, -50]]) },
    ahoge: { rotate: keys([[0, 32]]) },
  },
};

export const RAI_CUTOUT_BONES = [
  "root",
  "hip",
  "torso",
  "chest",
  "neck",
  "head",
  "jaw",
  "hairBack",
  "hairFront",
  "ahoge",
  "shoulderL",
  "upperArmL",
  "forearmL",
  "handL",
  "shoulderR",
  "upperArmR",
  "forearmR",
  "handR",
  "skirt",
  "thighL",
  "calfL",
  "footL",
  "thighR",
  "calfR",
  "footR",
  "bow",
] as const;

export function sampleGirlSkeleton(): CutoutSkeleton {
  return {
    name: "sample-girl",
    width: 360,
    height: 720,
    fps: 30,
    demo: true,
    bones: [
      { name: "root", x: 180, y: 430 },
      { name: "hip", parent: "root", x: 0, y: 0 },
      { name: "torso", parent: "hip", x: 0, y: -42 },
      { name: "chest", parent: "torso", x: 0, y: -46 },
      { name: "bow", parent: "chest", x: 0, y: -8 },
      { name: "neck", parent: "chest", x: 0, y: -52 },
      { name: "head", parent: "neck", x: 0, y: -28 },
      { name: "jaw", parent: "head", x: 0, y: 22 },
      { name: "hairBack", parent: "head", x: 0, y: 8 },
      { name: "hairFront", parent: "head", x: 0, y: 4 },
      { name: "ahoge", parent: "head", x: -16, y: -50, rotation: 18, length: 54 },
      { name: "shoulderL", parent: "chest", x: 36, y: -22 },
      { name: "upperArmL", parent: "shoulderL", x: 6, y: 16, rotation: 8, length: 52 },
      { name: "forearmL", parent: "upperArmL", x: 2, y: 50, rotation: 4, length: 46 },
      { name: "handL", parent: "forearmL", x: 0, y: 42, length: 18 },
      { name: "shoulderR", parent: "chest", x: -36, y: -22 },
      { name: "upperArmR", parent: "shoulderR", x: -6, y: 16, rotation: -8, length: 52 },
      { name: "forearmR", parent: "upperArmR", x: -2, y: 50, rotation: -4, length: 46 },
      { name: "handR", parent: "forearmR", x: 0, y: 42, length: 18 },
      { name: "skirt", parent: "hip", x: 0, y: 8 },
      { name: "thighL", parent: "hip", x: 16, y: 18, rotation: 3, length: 78 },
      { name: "calfL", parent: "thighL", x: 0, y: 78, length: 72 },
      { name: "footL", parent: "calfL", x: 2, y: 74, length: 22 },
      { name: "thighR", parent: "hip", x: -16, y: 18, rotation: -3, length: 78 },
      { name: "calfR", parent: "thighR", x: 0, y: 78, length: 72 },
      { name: "footR", parent: "calfR", x: -2, y: 74, length: 22 },
    ],
    slots: [
      slot("hairBack", "hairBack", att("hairBack", [
        { type: "ellipse", cx: 0, cy: 6, rx: 52, ry: 58, fill: HAIR },
        { type: "ellipse", cx: -36, cy: 28, rx: 22, ry: 34, fill: HAIR },
        { type: "ellipse", cx: 38, cy: 30, rx: 20, ry: 32, fill: HAIR },
      ])),
      slot("upperArmR", "upperArmR", att("upperArmR", ellipse(0, 22, 11, 28, SKIN, SKIN_DEEP)!)),
      slot("upperArmL", "upperArmL", att("upperArmL", ellipse(0, 22, 11, 28, SKIN, SKIN_DEEP)!)),
      slot("thighR", "thighR", att("thighR", ellipse(0, 36, 16, 42, SKIN, SKIN_DEEP)!)),
      slot("thighL", "thighL", att("thighL", ellipse(0, 36, 16, 42, SKIN, SKIN_DEEP)!)),
      slot("calfR", "calfR", att("calfR", [
        { type: "ellipse", cx: 0, cy: 18, rx: 12, ry: 22, fill: SKIN },
        { type: "rect", x: -13, y: 28, width: 26, height: 48, rx: 11, fill: SOCK },
      ])),
      slot("calfL", "calfL", att("calfL", [
        { type: "ellipse", cx: 0, cy: 18, rx: 12, ry: 22, fill: SKIN },
        { type: "rect", x: -13, y: 28, width: 26, height: 48, rx: 11, fill: SOCK },
      ])),
      slot("footR", "footR", att("footR", [
        { type: "ellipse", cx: 2, cy: 8, rx: 16, ry: 9, fill: SHOE },
        { type: "rect", x: -10, y: -6, width: 20, height: 12, rx: 4, fill: SHOE },
      ])),
      slot("footL", "footL", att("footL", [
        { type: "ellipse", cx: -2, cy: 8, rx: 16, ry: 9, fill: SHOE },
        { type: "rect", x: -10, y: -6, width: 20, height: 12, rx: 4, fill: SHOE },
      ])),
      slot("skirt", "skirt", att("skirt", [
        { type: "polygon", points: [-48, -8, 48, -8, 62, 52, -62, 52], fill: NAVY, stroke: NAVY_DEEP, strokeWidth: 1.2 },
        { type: "rect", x: -58, y: 46, width: 116, height: 7, rx: 2, fill: "#e8e4dc" },
      ])),
      slot("torso", "torso", att("torso", [
        { type: "rect", x: -40, y: -58, width: 80, height: 92, rx: 16, fill: SHIRT, stroke: "#ddd6c8", strokeWidth: 1 },
        { type: "ellipse", cx: 0, cy: -8, rx: 8, ry: 8, fill: "#c4a574" },
        { type: "ellipse", cx: 0, cy: 12, rx: 8, ry: 8, fill: "#c4a574" },
        { type: "ellipse", cx: 0, cy: 32, rx: 8, ry: 8, fill: "#c4a574" },
      ])),
      slot("chest", "chest", att("chest", [
        { type: "rect", x: -38, y: -24, width: 76, height: 36, rx: 12, fill: SHIRT },
        { type: "rect", x: -42, y: -8, width: 18, height: 14, rx: 4, fill: NAVY },
        { type: "rect", x: 24, y: -8, width: 18, height: 14, rx: 4, fill: NAVY },
      ])),
      slot("bow", "bow", att("bow", [
        { type: "polygon", points: [-22, -2, -2, -10, -2, 10], fill: BOW },
        { type: "polygon", points: [22, -2, 2, -10, 2, 10], fill: BOW },
        { type: "ellipse", cx: 0, cy: 0, rx: 6, ry: 5, fill: "#9b1022" },
      ])),
      slot("forearmR", "forearmR", att("forearmR", ellipse(0, 18, 9, 24, SKIN, SKIN_DEEP)!)),
      slot("forearmL", "forearmL", att("forearmL", ellipse(0, 18, 9, 24, SKIN, SKIN_DEEP)!)),
      slot("handR", "handR", att("handR", ellipse(0, 6, 10, 12, SKIN, SKIN_DEEP)!)),
      slot("handL", "handL", att("handL", ellipse(0, 6, 10, 12, SKIN, SKIN_DEEP)!)),
      slot("neck", "neck", att("neck", ellipse(0, 6, 10, 14, SKIN)!)),
      slot("head", "head", att("head", [
        { type: "ellipse", cx: 0, cy: 6, rx: 38, ry: 44, fill: SKIN, stroke: SKIN_DEEP, strokeWidth: 1 },
        { type: "ellipse", cx: -14, cy: 2, rx: 7, ry: 8, fill: "#fff" },
        { type: "ellipse", cx: 14, cy: 2, rx: 7, ry: 8, fill: "#fff" },
        { type: "ellipse", cx: -13, cy: 3, rx: 4.2, ry: 5, fill: EYE },
        { type: "ellipse", cx: 15, cy: 3, rx: 4.2, ry: 5, fill: EYE },
        { type: "ellipse", cx: -13, cy: 4, rx: 2, ry: 2.4, fill: EYE_DARK },
        { type: "ellipse", cx: 15, cy: 4, rx: 2, ry: 2.4, fill: EYE_DARK },
        { type: "ellipse", cx: -16, cy: -2, rx: 8, ry: 2.2, fill: HAIR },
        { type: "ellipse", cx: 16, cy: -2, rx: 8, ry: 2.2, fill: HAIR },
      ])),
      slot(
        "mouth",
        "jaw",
        att("mouthClosed", [{ type: "ellipse", cx: 0, cy: 0, rx: 7, ry: 2.2, fill: LIP }]),
        {
          mouthOpen: att("mouthOpen", [
            { type: "ellipse", cx: 0, cy: 1, rx: 8, ry: 6, fill: "#6a2a28" },
            { type: "ellipse", cx: 0, cy: -1, rx: 7, ry: 2.4, fill: "#f2d8c8" },
          ]),
        },
      ),
      slot("hairFront", "hairFront", att("hairFront", [
        { type: "ellipse", cx: 0, cy: -28, rx: 44, ry: 22, fill: HAIR },
        { type: "ellipse", cx: -30, cy: -4, rx: 16, ry: 28, fill: HAIR },
        { type: "ellipse", cx: 32, cy: -2, rx: 15, ry: 26, fill: HAIR },
        { type: "ellipse", cx: -8, cy: -32, rx: 10, ry: 8, fill: HAIR_SHINE },
      ])),
      slot("ahoge", "ahoge", att("ahoge", [
        { type: "polygon", points: [-4, 8, 4, 8, 2, -48, -10, -42], fill: HAIR },
        { type: "ellipse", cx: -8, cy: -46, rx: 8, ry: 6, fill: HAIR },
      ])),
    ],
    animations: { idle, talk, wave, scold, pout, shy },
    poseToAnimation: {
      idle: "idle",
      talk: "talk",
      wave: "wave",
      scold: "scold",
      pout: "pout",
      shy: "shy",
      peace: "wave",
      laugh: "talk",
      embarrassed: "shy",
      smug: "pout",
      think: "pout",
      hold: "idle",
      tired: "idle",
      sad: "shy",
      surprise: "scold",
      content: "idle",
      hearts: "wave",
      wink: "idle",
      middle_finger: "scold",
    },
    talk: { bone: "jaw", slot: "mouth", closed: "mouthClosed", open: "mouthOpen", maxDeg: 14 },
  };
}
