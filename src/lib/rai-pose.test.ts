import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHART_BEAT_TINT_POSES,
  IDLE_BLINK_CANVAS,
  IDLE_BLINK_EYE_HOLES,
  allSpriteUrls,
  canIdleBlink,
  idleBlinkEyeSrcs,
  idleBlinkLid,
  isFullBlinkPlate,
  DEFAULT_EMOTION,
  EMOTION_HOLD_MS,
  EMOTION_TO_POSE,
  LIVE_POSE_FILES,
  NOW_PLAYING_TINT_POSES,
  POSE_HOLD_AFTER_TALK_MS,
  POSE_HOLD_MIN_MS,
  RAI_SYSTEM,
  SPRITES,
  clampEmotion,
  inferEmotionPose,
  isDedicatedPose,
  isTalkPathPose,
  layersFor,
  namedPoseFromText,
  needsPoseTint,
  normalizePose,
  parseAct,
  poseResetDelayMs,
  resolveSpokenPose,
  spokenBubbleResetDelay,
  streamSpokenAct,
  talkFlapOpacity,
  USE_EXPO_TALK_BUST,
} from "./rai.ts";
import { actToJson, composeAct } from "./brain.ts";
import { copyEyeRect } from "./idle-blink-paint.ts";
import { POSE_TINT_SOURCE } from "./generated/star-rai-artifacts.ts";
import { parseTrackTitle, resolveLifeTurn } from "./life.ts";
import { applySlotPatch, extractSlotsFromUserText } from "./memory-slots.ts";

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), "../../public");

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** 8-bit RGB or RGBA PNG. Enough for the idle / blink plates. */
function decodePng(buf: Buffer): {
  width: number;
  height: number;
  colorType: number;
  rgba: Uint8Array;
} {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported png bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const rgba = new Uint8Array(width * height * 4);
  let s = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[s]!;
    s += 1;
    const row = Buffer.from(raw.subarray(s, s + stride));
    s += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? row[i - bpp]! : 0;
      const up = prev[i]!;
      const ul = i >= bpp ? prev[i - bpp]! : 0;
      if (filter === 1) row[i] = (row[i]! + left) & 255;
      else if (filter === 2) row[i] = (row[i]! + up) & 255;
      else if (filter === 3) row[i] = (row[i]! + ((left + up) >> 1)) & 255;
      else if (filter === 4) row[i] = (row[i]! + paeth(left, up, ul)) & 255;
      else if (filter !== 0) throw new Error(`bad png filter ${filter}`);
    }
    prev = row;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const i = x * bpp;
      rgba[o] = row[i]!;
      rgba[o + 1] = row[i + 1]!;
      rgba[o + 2] = row[i + 2]!;
      rgba[o + 3] = bpp === 4 ? row[i + 3]! : 255;
    }
  }
  return { width, height, colorType, rgba };
}

function listPublicFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listPublicFiles(path));
    else out.push(path);
  }
  return out;
}

function holeMask(width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const hole of IDLE_BLINK_EYE_HOLES) {
    for (let y = hole.y; y < hole.y + hole.h; y++) {
      for (let x = hole.x; x < hole.x + hole.w; x++) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

describe("poseResetDelayMs", () => {
  it("does not reset while talking", () => {
    assert.equal(
      poseResetDelayMs({ pose: "wink", talking: true, actLandedAt: 1_000, now: 1_100 }),
      null,
    );
  });

  it("holds a dedicated pose at least POSE_HOLD_MIN_MS after it lands", () => {
    const delay = poseResetDelayMs({
      pose: "scold",
      talking: false,
      actLandedAt: 10_000,
      now: 10_000,
    });
    assert.equal(delay, POSE_HOLD_MIN_MS);
  });

  it("keeps a dedicated pose after a long speech", () => {
    const delay = poseResetDelayMs({
      pose: "hold",
      talking: false,
      actLandedAt: 1_000,
      now: 9_000,
    });
    assert.equal(delay, POSE_HOLD_AFTER_TALK_MS);
    assert.ok((delay ?? 0) >= 2500);
  });

  it("holds emotion-mapped poses (shy/smug/tired/soft/hype) even when pose is idle", () => {
    const delay = poseResetDelayMs({
      pose: "idle",
      emotion: "shy",
      talking: false,
      actLandedAt: 5_000,
      now: 5_000,
    });
    assert.equal(delay, POSE_HOLD_MIN_MS);
    assert.equal(
      poseResetDelayMs({
        pose: "idle",
        emotion: "soft",
        talking: false,
        actLandedAt: 5_000,
        now: 5_000,
      }),
      POSE_HOLD_MIN_MS,
    );
  });

  it("uses a shorter hold for idle presence", () => {
    const delay = poseResetDelayMs({
      pose: "idle",
      emotion: "bratty",
      talking: false,
      actLandedAt: 0,
      now: 0,
    });
    assert.equal(delay, EMOTION_HOLD_MS);
  });
});

describe("live key → file map", () => {
  const expected: Record<string, string> = {
    idle: "rai/idle.png",
    talk: "rai/talk_official.png",
    peace: "rai/peace.png",
    middle_finger: "rai/middle_finger.png",
    wink: "rai/wink_official.png",
    laugh: "rai/laugh_official.png",
    think: "rai/think_official.png",
    pout: "rai/pout_official.png",
    tired: "rai/tired_official.png",
    smug: "rai/smug_official.png",
    wave: "rai/wave_official.png",
    hold: "rai/hold_official.png",
    embarrassed: "rai/embarrassed_official.png",
    scold: "rai/scold_official.png",
    shy: "rai/shy_official.png",
    sad: "rai/sad_official.png",
    surprise: "rai/surprise_official.png",
    content: "rai/content_official.png",
    hearts: "rai/heart_official.png",
    turn: "star-rai/poses/turn-away.png",
    profile: "rai/side_profile.png",
    three_quarter_left: "rai/three_quarter_left.png",
    three_quarter_right: "rai/three_quarter_right.png",
    point: "star-rai/point-front.png",
  };

  for (const [key, file] of Object.entries(expected)) {
    it(`${key} → ${file}`, () => {
      assert.equal(LIVE_POSE_FILES[key as keyof typeof LIVE_POSE_FILES], file);
      assert.match(SPRITES.poses[key as keyof typeof SPRITES.poses], new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.ok(existsSync(join(publicRoot, file)), `missing public/${file}`);
    });
  }

  it("does not point wave at old wave.png or front_wave", () => {
    assert.doesNotMatch(SPRITES.poses.wave, /front_wave|star-rai\/poses\/wave/);
  });

  it("PNG puppet wave is wired to the retoned official sheet (1008×1792 RGBA)", () => {
    assert.equal(LIVE_POSE_FILES.wave, "rai/wave_official.png");
    assert.match(SPRITES.poses.wave, /rai\/wave_official\.png/);
    const ihdr = (rel: string) => {
      const buf = readFileSync(join(publicRoot, rel));
      assert.equal(buf.subarray(0, 8).toString("binary"), "\x89PNG\r\n\x1a\n");
      return {
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
        colorType: buf[25],
      };
    };
    const pack = ihdr("rai/wave_official.png");
    assert.equal(pack.width, 1008);
    assert.equal(pack.height, 1792);
    assert.equal(pack.colorType, 6, "RGBA");
    // Helix 3/4 crop is not the live wave key (object-fit contain; 9:16 pack).
    const helix = ihdr("star-rai/poses/wave.png");
    assert.equal(helix.width, 1152);
    assert.equal(helix.height, 1728);
  });

  it("does not point hold at old front_hold", () => {
    assert.doesNotMatch(SPRITES.poses.hold, /front_hold/);
  });

  it("does not point scold at scold-front", () => {
    assert.doesNotMatch(SPRITES.poses.scold, /scold-front/);
    assert.ok(existsSync(join(publicRoot, "star-rai/scold-front.png")));
  });

  it("keeps finger-front and point-front on disk", () => {
    assert.ok(existsSync(join(publicRoot, "star-rai/finger-front.png")));
    assert.ok(existsSync(join(publicRoot, "star-rai/point-front.png")));
    assert.match(SPRITES.poses.point, /point-front/);
  });

  it("does not map kiss", () => {
    assert.equal(normalizePose("kiss"), null);
    assert.equal("kiss" in SPRITES.poses, false);
  });
});

describe("normalizePose aliases", () => {
  it("maps finger-front / finger-point to middle_finger", () => {
    assert.equal(normalizePose("finger-front"), "middle_finger");
    assert.equal(normalizePose("finger-point"), "middle_finger");
    assert.equal(normalizePose("finger"), "middle_finger");
    assert.equal(normalizePose("middle_finger"), "middle_finger");
  });

  it("maps point / point-front to point", () => {
    assert.equal(normalizePose("point"), "point");
    assert.equal(normalizePose("point-front"), "point");
  });

  it("maps turn-away to turn", () => {
    assert.equal(normalizePose("turn-away"), "turn");
    assert.equal(normalizePose("turn"), "turn");
  });

  it("maps heart to hearts", () => {
    assert.equal(normalizePose("heart"), "hearts");
  });
});

describe("namedPoseFromText", () => {
  it("swaps distinctive named poses", () => {
    assert.equal(namedPoseFromText("wink"), "wink");
    assert.equal(namedPoseFromText("do a pout"), "pout");
    assert.equal(namedPoseFromText("scold"), "scold");
    assert.equal(namedPoseFromText("wave"), "wave");
    assert.equal(namedPoseFromText("finger-front"), "middle_finger");
    assert.equal(namedPoseFromText("point at me"), "point");
  });

  it("does not treat casual English as talk/think/hold", () => {
    assert.equal(namedPoseFromText("can we talk later"), null);
    assert.equal(namedPoseFromText("I think that is fine"), null);
    assert.equal(namedPoseFromText("don't hold back"), null);
  });

  it("unmaps kiss and keeps current body", () => {
    assert.equal(namedPoseFromText("kiss"), false);
    assert.equal(namedPoseFromText("blow me a kiss"), false);
  });
});

describe("parseAct pose omit + voice card emotions", () => {
  it("omits pose when Grok leaves it off", () => {
    const act = parseAct('{"line":"Hey.","emotion":"bratty"}');
    assert.equal(act.line, "Hey.");
    assert.equal(act.emotion, "bratty");
    assert.equal(act.pose, null);
  });

  it("keeps current body for kiss", () => {
    const act = parseAct('{"line":"Nope.","emotion":"smug","pose":"kiss"}');
    assert.equal(act.pose, null);
    assert.equal(act.emotion, "smug");
  });

  it("defaults omitted emotion to bratty", () => {
    const act = parseAct('{"line":"Mm.","pose":"wink"}');
    assert.equal(act.emotion, DEFAULT_EMOTION);
    assert.equal(act.pose, "wink");
  });

  it("clamps legacy emotions", () => {
    assert.equal(clampEmotion("idle"), "bratty");
    assert.equal(clampEmotion("thinking"), "glance");
    assert.equal(clampEmotion("happy"), "hype");
  });
});

describe("layersFor talking vs pose hold", () => {
  const base = {
    emotion: "hype" as const,
    amplitude: 0.4,
    angle: 0,
    talkPhase: 1,
    blink: 0 as const,
    idleBeat: "none" as const,
  };

  it("keeps a dedicated pose on while talking (no idle-talk snap)", () => {
    const layers = layersFor({ ...base, pose: "wink", talking: true });
    assert.equal(layers.length, 1);
    assert.match(layers[0]!.src, /wink_official/);
    assert.ok(!layers.some((l) => l.role === "talk"));
  });

  it("holds talk_official while the talk key is speaking — no frown idle mid-line", () => {
    const idle = layersFor({ ...base, pose: "idle", emotion: "bratty", talking: true });
    assert.equal(idle.length, 1);
    assert.match(idle[0]!.src, /talk_official/);
    assert.doesNotMatch(idle[0]!.src, /rai\/idle\.png/);
    assert.ok(!idle.some((l) => l.role === "talk"));

    const talk = layersFor({ ...base, pose: "talk", emotion: "bratty", talking: true });
    assert.equal(talk.length, 1);
    assert.match(talk[0]!.src, /talk_official/);
    assert.doesNotMatch(talk.map((l) => l.src).join(" "), /rai\/idle\.png/);
    assert.ok(!talk.some((l) => l.role === "talk"));
  });

  it("holds talk_official after speech on the talk key", () => {
    const layers = layersFor({ ...base, pose: "talk", talking: false });
    assert.equal(layers.length, 1);
    assert.match(layers[0]!.src, /talk_official/);
    assert.ok(!layers.some((l) => l.role === "talk"));
  });

  it("uses a static talk sheet when reduced-motion is on", () => {
    const layers = layersFor({
      ...base,
      pose: "idle",
      emotion: "bratty",
      talking: true,
      reducedMotion: true,
    });
    assert.equal(layers.length, 1);
    assert.match(layers[0]!.src, /talk_official/);
  });

  it("does not overlay Expo mouth or eye busts on the official pack", () => {
    assert.equal(USE_EXPO_TALK_BUST, false);
    const layers = layersFor({ ...base, pose: "idle", talking: true, blink: 2 });
    const blob = layers.map((l) => l.src).join(" ");
    assert.doesNotMatch(blob, /mouth_speak|mouth_oh|mouth_grin|face_eyes/);
    assert.doesNotMatch(blob, /star-rai\/idle-talk/);
  });

  it("resolves idle to official idle.png", () => {
    const layers = layersFor({ ...base, pose: "idle", emotion: "bratty", talking: false });
    assert.match(layers[0]!.src, /rai\/idle\.png/);
    assert.doesNotMatch(layers[0]!.src, /idle_blink/);
  });

  it("keeps one idle body while blink copies two eye rects onto that bitmap", () => {
    const rest = {
      ...base,
      pose: "idle" as const,
      emotion: "bratty" as const,
      talking: false,
      blink: 3 as const,
    };
    const blink = layersFor(rest);
    assert.equal(blink.length, 1);
    assert.equal(blink[0]!.role, "body");
    assert.match(blink[0]!.src, /rai\/idle\.png$/);
    assert.doesNotMatch(blink.map((l) => l.src).join(" "), /idle_blink|face_eyes|mouth_speak|mouth_oh/);
    assert.equal(idleBlinkLid(0), "open");
    assert.equal(idleBlinkLid(1), "closing");
    assert.equal(idleBlinkLid(2), "half");
    assert.equal(idleBlinkLid(3), "closed");
    assert.deepEqual(idleBlinkEyeSrcs(0), [SPRITES.idleBlinkOpenL, SPRITES.idleBlinkOpenR]);
    assert.deepEqual(idleBlinkEyeSrcs(1), [SPRITES.idleBlink01L, SPRITES.idleBlink01R]);
    assert.deepEqual(idleBlinkEyeSrcs(2), [SPRITES.idleBlink02L, SPRITES.idleBlink02R]);
    assert.deepEqual(idleBlinkEyeSrcs(3), [SPRITES.idleBlinkL, SPRITES.idleBlinkR]);
    assert.equal(isFullBlinkPlate("/rai/idle_blink.png"), true);
    assert.equal(isFullBlinkPlate("/rai/idle_blink_01.png"), true);
    assert.equal(isFullBlinkPlate("/rai/idle_blink_02.png"), true);
    assert.equal(isFullBlinkPlate("/rai/blink-frames/blink-02-closing.jpg"), true);
    assert.equal(isFullBlinkPlate("/rai/blink-frames/blink-03-half.jpg"), true);
    assert.equal(isFullBlinkPlate("/rai/blink-02-closing.jpg"), true);
    assert.equal(isFullBlinkPlate("blink-03-half.JPG"), true);
    assert.equal(isFullBlinkPlate(SPRITES.idleBlinkL), false);
    assert.equal(isFullBlinkPlate(SPRITES.idleBlinkR), false);
    assert.ok(allSpriteUrls().every((src) => !src.includes("blink-frames")));
    assert.ok(allSpriteUrls().every((src) => !/\.jpe?g(?:\?|$)/.test(src)));

    const early = layersFor({ ...rest, blink: 1 });
    assert.equal(early.length, 1);
    assert.match(early[0]!.src, /rai\/idle\.png$/);
    const mid = layersFor({ ...rest, blink: 2 });
    assert.equal(mid.length, 1);
    assert.equal(mid[0]!.src, early[0]!.src);

    assert.equal(layersFor({ ...rest, blink: 0 }).length, 1);
    assert.match(layersFor({ ...rest, blink: 0 })[0]!.src, /rai\/idle\.png$/);
    assert.equal(layersFor({ ...rest, talking: true }).length, 1);
    assert.match(layersFor({ ...rest, talking: true })[0]!.src, /talk_official/);
    assert.match(layersFor({ ...rest, pose: "wave" })[0]!.src, /wave_official/);
    assert.match(layersFor({ ...rest, pose: "scold" })[0]!.src, /scold_official/);
    assert.match(layersFor({ ...rest, pose: "talk" })[0]!.src, /talk_official/);
    assert.match(layersFor({ ...rest, pose: "smug" })[0]!.src, /smug_official/);
    assert.match(layersFor({ ...rest, emotion: "smug" })[0]!.src, /smug_official/);
    assert.match(layersFor({ ...rest, emotion: "shy" })[0]!.src, /shy_official/);
    assert.match(layersFor({ ...rest, emotion: "hype" })[0]!.src, /peace\.png/);
    const reduced = layersFor({ ...rest, reducedMotion: true });
    assert.equal(reduced.length, 1);
    assert.match(reduced[0]!.src, /rai\/idle\.png$/);
    assert.doesNotMatch(reduced[0]!.src, /idle_blink|face_eyes/);
    const glance = layersFor({ ...rest, emotion: "glance" });
    assert.equal(glance.length, 1);
    assert.match(glance[0]!.src, /rai\/idle\.png$/);
    assert.ok(glance.every((layer) => !isFullBlinkPlate(layer.src)));

    assert.equal(canIdleBlink(rest), true);
    assert.equal(canIdleBlink({ ...rest, talking: true }), false);
    assert.equal(canIdleBlink({ ...rest, pose: "wave" }), false);
    assert.equal(canIdleBlink({ ...rest, reducedMotion: true }), false);
    assert.equal(USE_EXPO_TALK_BUST, false);
    for (const src of [
      SPRITES.idleBlinkOpenL,
      SPRITES.idleBlinkOpenR,
      SPRITES.idleBlink01L,
      SPRITES.idleBlink01R,
      SPRITES.idleBlink02L,
      SPRITES.idleBlink02R,
      SPRITES.idleBlinkL,
      SPRITES.idleBlinkR,
    ]) {
      assert.ok(allSpriteUrls().includes(src));
      assert.equal(isFullBlinkPlate(src), false);
    }
    assert.ok(allSpriteUrls().every((src) => !isFullBlinkPlate(src)));

    assert.deepEqual(
      IDLE_BLINK_EYE_HOLES.map((hole) => ({ x: hole.x, y: hole.y, w: hole.w, h: hole.h })),
      [
        { x: 432, y: 202, w: 80, h: 40 },
        { x: 508, y: 202, w: 80, h: 40 },
      ],
    );
    const idle = decodePng(readFileSync(join(publicRoot, "rai/idle.png")));
    assert.equal(idle.width, IDLE_BLINK_CANVAS.width);
    assert.equal(idle.height, IDLE_BLINK_CANVAS.height);
    assert.equal(idle.colorType, 2);
    const holes = holeMask(idle.width, idle.height);
    const crops = [
      "rai/idle_blink_open_l.png",
      "rai/idle_blink_open_r.png",
      "rai/idle_blink_01_l.png",
      "rai/idle_blink_01_r.png",
      "rai/idle_blink_02_l.png",
      "rai/idle_blink_02_r.png",
      "rai/idle_blink_l.png",
      "rai/idle_blink_r.png",
    ] as const;
    for (const cropRel of crops) {
      const eye = cropRel.endsWith("_l.png") ? 0 : 1;
      const hole = IDLE_BLINK_EYE_HOLES[eye]!;
      const crop = decodePng(readFileSync(join(publicRoot, cropRel)));
      assert.equal(crop.width, hole.w, cropRel);
      assert.equal(crop.height, hole.h, cropRel);
      assert.equal(crop.colorType, 6, `${cropRel} is an RGBA soft lid`);
      assert.ok(crop.width < idle.width && crop.height < idle.height);
      assert.equal(crop.rgba[3], 0, `${cropRel} corner stays transparent`);
      const center = ((hole.h >> 1) * crop.width + (hole.w >> 1)) * 4 + 3;
      assert.equal(crop.rgba[center], 255, `${cropRel} covers the iris`);
      let partial = 0;
      for (let i = 3; i < crop.rgba.length; i += 4) {
        const a = crop.rgba[i]!;
        if (a > 0 && a < 255) partial++;
      }
      assert.ok(partial > 0, `${cropRel} has a soft edge`);
    }

    const painted = new Uint8ClampedArray(idle.rgba);
    const closedCrops = ["rai/idle_blink_l.png", "rai/idle_blink_r.png"] as const;
    closedCrops.forEach((cropRel, eye) => {
      const hole = IDLE_BLINK_EYE_HOLES[eye]!;
      const crop = decodePng(readFileSync(join(publicRoot, cropRel)));
      const before = new Uint8ClampedArray(painted);
      copyEyeRect(painted, idle.width, crop.rgba, hole);
      for (let y = 0; y < hole.h; y++) {
        for (let x = 0; x < hole.w; x++) {
          if (crop.rgba[(y * hole.w + x) * 4 + 3] !== 0) continue;
          const pi = ((hole.y + y) * idle.width + (hole.x + x)) * 4;
          for (let c = 0; c < 4; c++) {
            assert.equal(painted[pi + c], before[pi + c], `${cropRel} punched ${x},${y}`);
          }
        }
      }
    });
    let outsideMax = 0;
    let insideChanged = 0;
    for (let i = 0; i < holes.length; i++) {
      const dr = Math.abs(painted[i * 4]! - idle.rgba[i * 4]!);
      const dg = Math.abs(painted[i * 4 + 1]! - idle.rgba[i * 4 + 1]!);
      const db = Math.abs(painted[i * 4 + 2]! - idle.rgba[i * 4 + 2]!);
      const da = Math.abs(painted[i * 4 + 3]! - idle.rgba[i * 4 + 3]!);
      const delta = Math.max(dr, dg, db, da);
      if (!holes[i]) {
        if (delta > outsideMax) outsideMax = delta;
      } else if (delta > 0) insideChanged++;
    }
    assert.equal(outsideMax, 0, "copying eye rects moved idle pixels outside the holes");
    assert.ok(insideChanged > 0, "closed lids did not change the eye holes");
  });

  it("steps closing and half lids through the eye holes without moving the body", () => {
    const idle = decodePng(readFileSync(join(publicRoot, "rai/idle.png")));
    const holes = holeMask(idle.width, idle.height);
    const artifactRoot = join(publicRoot, "../artifacts/star-rai-blink-frames/eyes");
    const pack = [
      ["rai/idle_blink_open_l.png", "01-open_L.png"],
      ["rai/idle_blink_open_r.png", "01-open_R.png"],
      ["rai/idle_blink_01_l.png", "02-closing_L.png"],
      ["rai/idle_blink_01_r.png", "02-closing_R.png"],
      ["rai/idle_blink_02_l.png", "03-half_L.png"],
      ["rai/idle_blink_02_r.png", "03-half_R.png"],
      ["rai/idle_blink_l.png", "04-462-blink_L.png"],
      ["rai/idle_blink_r.png", "04-462-blink_R.png"],
    ] as const;
    for (const [cropRel, packName] of pack) {
      const runtime = readFileSync(join(publicRoot, cropRel));
      const source = readFileSync(join(artifactRoot, packName));
      assert.ok(runtime.equals(source), `${cropRel} must match Maker pack ${packName}`);
    }

    const opaqueMean = (a: Uint8Array, b: Uint8Array) => {
      let sum = 0;
      let n = 0;
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i += 4) {
        if (a[i + 3] === 0 && b[i + 3] === 0) continue;
        sum += Math.abs(a[i]! - b[i]!);
        sum += Math.abs(a[i + 1]! - b[i + 1]!);
        sum += Math.abs(a[i + 2]! - b[i + 2]!);
        n += 3;
      }
      return n === 0 ? 0 : sum / n;
    };
    const closingL = decodePng(readFileSync(join(publicRoot, "rai/idle_blink_01_l.png")));
    const halfL = decodePng(readFileSync(join(publicRoot, "rai/idle_blink_02_l.png")));
    const closedL = decodePng(readFileSync(join(publicRoot, "rai/idle_blink_l.png")));
    assert.ok(opaqueMean(closingL.rgba, halfL.rgba) > 4, "closing and half are different lids");
    assert.ok(opaqueMean(closingL.rgba, closedL.rgba) > 4, "closing and closed are different lids");
    assert.ok(opaqueMean(halfL.rgba, closedL.rgba) > 4, "half and closed are different lids");

    for (const [lid, crops] of [
      ["open", ["rai/idle_blink_open_l.png", "rai/idle_blink_open_r.png"]],
      ["closing", ["rai/idle_blink_01_l.png", "rai/idle_blink_01_r.png"]],
      ["half", ["rai/idle_blink_02_l.png", "rai/idle_blink_02_r.png"]],
      ["closed", ["rai/idle_blink_l.png", "rai/idle_blink_r.png"]],
    ] as const) {
      const painted = new Uint8ClampedArray(idle.rgba);
      crops.forEach((cropRel, eye) => {
        const hole = IDLE_BLINK_EYE_HOLES[eye]!;
        const crop = decodePng(readFileSync(join(publicRoot, cropRel)));
        assert.equal(crop.width, hole.w);
        assert.equal(crop.height, hole.h);
        copyEyeRect(painted, idle.width, crop.rgba, hole);
      });
      let outsideMax = 0;
      let insideChanged = 0;
      for (let i = 0; i < holes.length; i++) {
        const o = i * 4;
        const delta = Math.max(
          Math.abs(painted[o]! - idle.rgba[o]!),
          Math.abs(painted[o + 1]! - idle.rgba[o + 1]!),
          Math.abs(painted[o + 2]! - idle.rgba[o + 2]!),
          Math.abs(painted[o + 3]! - idle.rgba[o + 3]!),
        );
        if (!holes[i]) {
          if (delta > outsideMax) outsideMax = delta;
        } else if (delta > 0) insideChanged++;
      }
      assert.equal(outsideMax, 0, `${lid} eye paint moved pixels outside the holes`);
      if (lid === "open") {
        assert.equal(insideChanged, 0, "01-open must match the idle eye holes");
      } else {
        assert.ok(insideChanged > 0, `${lid} eye paint did not change the holes`);
      }
    }

    // 782/783 are not body-locked. They must not ship as jpg full sheets.
    const shipped = listPublicFiles(publicRoot);
    const jpgs = shipped.filter((file) => /\.jpe?g$/i.test(file));
    assert.deepEqual(jpgs, [], `full jpg sheets in public: ${jpgs.join(", ")}`);
    assert.equal(
      shipped.some((file) => /blink-0[23]/i.test(file)),
      false,
      "782/783 filenames must not be in the public tree",
    );
    for (const src of allSpriteUrls()) {
      assert.equal(isFullBlinkPlate(src), false, src);
      assert.doesNotMatch(src, /blink-0[23]|blink-frames|\.jpe?g/i);
    }
    assert.match(SPRITES.poses.idle, /rai\/idle\.png$/);
    assert.doesNotMatch(SPRITES.poses.idle, /blink-frames|idle_blink/);
  });

  it("pins soft/hype off frown idle even when pose is still idle", () => {
    assert.match(layersFor({ ...base, pose: "idle", emotion: "soft", talking: false })[0]!.src, /content_official/);
    assert.match(layersFor({ ...base, pose: "idle", emotion: "hype", talking: false })[0]!.src, /peace\.png/);
    assert.match(layersFor({ ...base, pose: "idle", emotion: "smug", talking: true })[0]!.src, /smug_official/);
    assert.doesNotMatch(
      layersFor({ ...base, pose: "idle", emotion: "smug", talking: true })[0]!.src,
      /rai\/idle\.png/,
    );
  });

  it("does not let idleBeat replace a dedicated pose", () => {
    const layers = layersFor({
      ...base,
      pose: "point",
      talking: false,
      idleBeat: "grin",
    });
    assert.equal(layers.length, 1);
    assert.match(layers[0]!.src, /point-front/);
  });

  it("does not swap Expo alt smile/grin onto official idle", () => {
    const layers = layersFor({
      ...base,
      pose: "idle",
      emotion: "bratty",
      talking: false,
      idleBeat: "grin",
    });
    assert.equal(layers.length, 1);
    assert.match(layers[0]!.src, /rai\/idle\.png/);
    assert.doesNotMatch(layers[0]!.src, /_alt_/);
  });

  it("marks dedicated pose ids and the talk-flap path", () => {
    assert.equal(isDedicatedPose("idle"), false);
    assert.equal(isDedicatedPose("talk"), true);
    assert.equal(isTalkPathPose("idle"), true);
    assert.equal(isTalkPathPose("talk"), true);
    assert.equal(isTalkPathPose("wave"), false);
    assert.equal(isDedicatedPose("three_quarter_left"), true);
    assert.equal(isDedicatedPose("profile"), true);
  });

  it("wave/hold/scold use official sheets", () => {
    const waveSrc = layersFor({ ...base, pose: "wave", talking: false })[0]!.src;
    assert.match(waveSrc, /rai\/wave_official\.png/);
    assert.doesNotMatch(waveSrc, /front_wave|star-rai\/poses\/wave/);
    assert.match(layersFor({ ...base, pose: "hold", talking: false })[0]!.src, /hold_official/);
    assert.match(layersFor({ ...base, pose: "scold", talking: false })[0]!.src, /scold_official/);
  });

  it("keeps scold, shy, and pout as distinct official sheets", () => {
    const scold = layersFor({ ...base, pose: "scold", talking: false })[0]!.src;
    const shy = layersFor({ ...base, pose: "shy", talking: false })[0]!.src;
    const pout = layersFor({ ...base, pose: "pout", talking: false })[0]!.src;
    assert.match(scold, /scold_official/);
    assert.match(shy, /shy_official/);
    assert.match(pout, /pout_official/);
    assert.notEqual(scold, shy);
    assert.notEqual(scold, pout);
    assert.notEqual(shy, pout);
  });

  it("does not invent kiss on the talk path", () => {
    const layers = layersFor({ ...base, pose: "idle", emotion: "bratty", talking: true });
    assert.ok(!layers.some((l) => /kiss/i.test(l.src)));
    assert.match(layers[0]!.src, /talk_official/);
  });
});

describe("talkFlapOpacity", () => {
  it("is closed when not talking and open while speaking", () => {
    assert.equal(talkFlapOpacity(1, 0.8, false), 0);
    const a = talkFlapOpacity(0.2, 0.7, true);
    const b = talkFlapOpacity(0.5, 0.7, true);
    assert.ok(a > 0 && a <= 1);
    assert.ok(b > 0 && b <= 1);
    assert.notEqual(a, b);
  });
});

describe("voice card prompt", () => {
  it("matches artifacts/star-rai-voice-card.txt character-for-character", () => {
    const card = readFileSync(join(publicRoot, "../artifacts/star-rai-voice-card.txt"), "utf8");
    assert.equal(RAI_SYSTEM, card);
    assert.match(RAI_SYSTEM, /^TRACK$/m);
    assert.match(RAI_SYSTEM, /^CORRECTION$/m);
    assert.match(RAI_SYSTEM, /^ASKS$/m);
    assert.match(RAI_SYSTEM, /Looking at you\. Don't flinch/);
    assert.match(RAI_SYSTEM, /Then ask already/);
    assert.match(RAI_SYSTEM, /Never kiss/);
    assert.match(RAI_SYSTEM, /\{"line":"...","emotion":/);
  });
});

describe("pose tint", () => {
  it("matches artifacts/star-rai-pose-tint.txt character-for-character", () => {
    const disk = readFileSync(join(publicRoot, "../artifacts/star-rai-pose-tint.txt"), "utf8");
    assert.equal(POSE_TINT_SOURCE, disk);
    assert.match(POSE_TINT_SOURCE, /STAR RAI — POSE TINT/);
    assert.match(POSE_TINT_SOURCE, /Idle sheet/);
    assert.match(POSE_TINT_SOURCE, /never invent kiss sheet/);
  });

  it("maps omitted emotion onto a dedicated sheet — never frown idle", () => {
    assert.equal(EMOTION_TO_POSE.bratty, "talk");
    assert.equal(EMOTION_TO_POSE.soft, "content");
    assert.ok(EMOTION_TO_POSE.hype === "peace" || EMOTION_TO_POSE.hype === "wave");
    assert.equal(needsPoseTint(null), true);
    assert.equal(needsPoseTint("idle"), true);
    assert.equal(needsPoseTint("wink"), false);
    assert.ok(["peace", "wave"].includes(inferEmotionPose("hype", "seed-a")));
  });

  it("lets a user-named pose win over model and context", () => {
    assert.equal(
      resolveSpokenPose({
        namedPose: "wink",
        modelPose: "talk",
        emotion: "bratty",
        spoken: true,
        nowPlayingJustSet: true,
        chartBeat: true,
        currentPose: "idle",
      }),
      "wink",
    );
  });

  it("uses a live model key when pose is not idle", () => {
    assert.equal(
      resolveSpokenPose({
        namedPose: null,
        modelPose: "scold",
        emotion: "bratty",
        spoken: true,
        currentPose: "idle",
      }),
      "scold",
    );
  });

  it("infers bratty talking / soft / smug when pose is omitted", () => {
    assert.equal(
      resolveSpokenPose({ namedPose: null, modelPose: null, emotion: "bratty", spoken: true, currentPose: "idle" }),
      "talk",
    );
    assert.equal(
      resolveSpokenPose({ namedPose: null, modelPose: null, emotion: "soft", spoken: true, currentPose: "idle" }),
      "content",
    );
    assert.equal(
      resolveSpokenPose({ namedPose: false, modelPose: null, emotion: "smug", spoken: true, currentPose: "idle" }),
      "smug",
    );
  });

  it("keeps a dedicated current body for kiss / omit until context tint applies", () => {
    assert.equal(
      resolveSpokenPose({
        namedPose: false,
        modelPose: null,
        emotion: "bratty",
        spoken: true,
        currentPose: "wave",
      }),
      "wave",
    );
  });

  it("tints now_playing-just-set and Chart beat off idle", () => {
    const music = resolveSpokenPose({
      namedPose: null,
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      nowPlayingJustSet: true,
      lifeTintPose: "talk",
      currentPose: "idle",
    });
    assert.ok((NOW_PLAYING_TINT_POSES as readonly string[]).includes(music));
    assert.notEqual(music, "idle");

    const chart = resolveSpokenPose({
      namedPose: null,
      modelPose: "idle",
      emotion: "bratty",
      spoken: true,
      chartBeat: true,
      chartTintPose: "think",
      currentPose: "idle",
    });
    assert.equal(chart, "think");
    assert.ok((CHART_BEAT_TINT_POSES as readonly string[]).includes(chart));
    assert.equal((CHART_BEAT_TINT_POSES as readonly string[]).includes("idle"), false);
  });

  it("maps tired onto the tired sheet — never grin / peace / wave", () => {
    assert.equal(EMOTION_TO_POSE.tired, "tired");
    assert.equal(
      resolveSpokenPose({
        namedPose: null,
        modelPose: "talk",
        emotion: "tired",
        spoken: true,
        currentPose: "idle",
      }),
      "tired",
    );
    assert.equal(
      resolveSpokenPose({
        namedPose: null,
        modelPose: "peace",
        emotion: "tired",
        spoken: true,
        currentPose: "wave",
      }),
      "tired",
    );
    assert.equal(
      resolveSpokenPose({
        namedPose: null,
        modelPose: "wave",
        emotion: "tired",
        spoken: true,
        nowPlayingJustSet: true,
        chartBeat: true,
        currentPose: "talk",
      }),
      "tired",
    );
    assert.match(
      layersFor({
        pose: "tired",
        emotion: "tired",
        talking: false,
        amplitude: 0,
        angle: 0,
      })[0]!.src,
      /tired_official/,
    );
    assert.match(
      layersFor({
        pose: "idle",
        emotion: "tired",
        talking: false,
        amplitude: 0,
        angle: 0,
      })[0]!.src,
      /tired_official/,
    );
  });

  it("still lets a user-named pose win over tired tint", () => {
    assert.equal(
      resolveSpokenPose({
        namedPose: "wave",
        modelPose: "talk",
        emotion: "tired",
        spoken: true,
        currentPose: "idle",
      }),
      "wave",
    );
  });

  it("does not snap a spoken bratty line back to idle", () => {
    const pose = resolveSpokenPose({
      namedPose: null,
      modelPose: "idle",
      emotion: "bratty",
      spoken: true,
      currentPose: "idle",
    });
    assert.equal(pose, "talk");
    assert.notEqual(pose, "idle");
  });

  it("holds talk on a playful line, then idle.png a few seconds after the line ends", () => {
    const pose = resolveSpokenPose({
      namedPose: null,
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      currentPose: "idle",
      seed: "you're cute. Yeah, I heard that~",
    });
    assert.equal(pose, "talk");
    const src = layersFor({
      pose,
      emotion: "bratty",
      talking: false,
      amplitude: 0,
      angle: 0,
    })[0]!.src;
    assert.match(src, /talk_official/);
    assert.doesNotMatch(src, /\/idle\.png$/);
    assert.doesNotMatch(src, /idle_blink/);

    // Still saying the line — do not snap to frown idle.
    assert.equal(
      poseResetDelayMs({
        pose,
        emotion: "bratty",
        talking: true,
        actLandedAt: 1_000,
        now: 30_000,
      }),
      null,
    );

    // Line over, even a minute later: a few seconds, not stuck on talk.
    const restDelay = poseResetDelayMs({
      pose,
      emotion: "bratty",
      talking: false,
      actLandedAt: 1_000,
      now: 61_000,
    });
    assert.equal(restDelay, POSE_HOLD_AFTER_TALK_MS);
    assert.ok((restDelay ?? Infinity) < 10_000);
    const restSrc = layersFor({
      pose: "idle",
      emotion: DEFAULT_EMOTION,
      talking: false,
      amplitude: 0,
      angle: 0,
    })[0]!.src;
    assert.match(restSrc, /\/idle\.png$/);
    assert.equal(
      canIdleBlink({ pose: "idle", emotion: DEFAULT_EMOTION, talking: false }),
      true,
    );
  });

  it("Music Set omitted pose is talk, content, or smug — not idle, even if emotion is tired", () => {
    for (const tint of NOW_PLAYING_TINT_POSES) {
      const pose = resolveSpokenPose({
        namedPose: null,
        modelPose: "idle",
        emotion: "tired",
        spoken: true,
        nowPlayingJustSet: true,
        lifeTintPose: tint,
        currentPose: "idle",
        seed: "Super Shy",
      });
      assert.equal(pose, tint);
      assert.notEqual(pose, "idle");
      const src = layersFor({
        pose,
        emotion: "tired",
        talking: false,
        amplitude: 0,
        angle: 0,
      })[0]!.src;
      assert.doesNotMatch(src, /\/idle\.png$/);
      assert.doesNotMatch(src, /tired_official/);
    }

    const named = resolveSpokenPose({
      namedPose: "wink",
      modelPose: "talk",
      emotion: "tired",
      spoken: true,
      nowPlayingJustSet: true,
      lifeTintPose: "content",
      currentPose: "idle",
    });
    assert.equal(named, "wink");

    const kiss = resolveSpokenPose({
      namedPose: false,
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      currentPose: "wave",
    });
    assert.equal(kiss, "wave");
    assert.equal("kiss" in SPRITES.poses, false);
  });

  it("tints as soon as the spoken line streams — before pose/emotion keys", () => {
    assert.equal(streamSpokenAct("{"), null);
    const lineFirst = streamSpokenAct('{"line":"Facing you. Front and center~"', {
      currentPose: "idle",
    });
    assert.ok(lineFirst);
    assert.equal(lineFirst.pose, "talk");
    assert.notEqual(lineFirst.pose, "idle");
    assert.equal(lineFirst.emotion, DEFAULT_EMOTION);

    const smug = streamSpokenAct('{"line":"Cute.","emotion":"smug"', { currentPose: "idle" });
    assert.equal(smug?.pose, "smug");
    assert.equal(smug?.emotion, "smug");

    const named = streamSpokenAct('{"line":"Wink~"', { namedPose: "wink", currentPose: "idle" });
    assert.equal(named?.pose, "wink");

    const keep = streamSpokenAct('{"line":"Still waving."', { currentPose: "wave" });
    assert.equal(keep?.pose, "wave");
  });

  it("Music Set from the Life sentence stays talk|content|smug on that bubble", () => {
    // The Set button sends this sentence. The turn is not pre-marked.
    const text = "I'm listening to ETA";
    const patch = extractSlotsFromUserText(text);
    const after = applySlotPatch({}, patch).life;
    const turn = resolveLifeTurn({ userText: text, before: undefined, after });
    assert.equal(turn.kind, "track_change");

    const act = composeAct([{ role: "user", content: text }], "", "idle", undefined, turn);
    const raw = actToJson(act);
    const parsed = parseAct(raw);
    const lifeTitle = parseTrackTitle(text);
    const pose = resolveSpokenPose({
      namedPose: lifeTitle ? null : namedPoseFromText(text),
      modelPose: parsed.pose,
      emotion: parsed.emotion,
      spoken: Boolean(parsed.line),
      nowPlayingJustSet: turn.kind === "track_change",
      lifeTintPose: turn.tintPose,
      seed: parsed.line,
      currentPose: "idle",
    });
    assert.ok(pose === "talk" || pose === "content" || pose === "smug");
    assert.notEqual(pose, "idle");
    const src = layersFor({
      pose,
      emotion: parsed.emotion,
      talking: false,
      amplitude: 0,
      angle: 0,
    })[0]!.src;
    assert.doesNotMatch(src, /\/idle\.png$/);

    // Model idle must not win on this same turn — CoS saw frown idle under the reply.
    const grokIdle = parseAct('{"line":"ETA. Yeah, that one~","emotion":"tired","pose":"idle"}');
    const overIdle = resolveSpokenPose({
      namedPose: null,
      modelPose: grokIdle.pose,
      emotion: grokIdle.emotion,
      spoken: true,
      nowPlayingJustSet: turn.kind === "track_change",
      lifeTintPose: turn.tintPose,
      seed: grokIdle.line,
      currentPose: "idle",
    });
    assert.ok(overIdle === "talk" || overIdle === "content" || overIdle === "smug");
    assert.notEqual(overIdle, "idle");

    const streamed = streamSpokenAct('{"line":"ETA. Yeah, that one~","emotion":"bratty","pose":"idle"', {
      nowPlayingJustSet: turn.kind === "track_change",
      lifeTintPose: turn.tintPose,
      currentPose: "idle",
      seed: "ETA",
    });
    assert.ok(streamed);
    assert.ok(streamed.pose === "talk" || streamed.pose === "content" || streamed.pose === "smug");

    // A minute later the music reply is still the bubble. Do not snap to idle.png.
    const held = spokenBubbleResetDelay({
      pose,
      emotion: parsed.emotion,
      talking: false,
      actLandedAt: 1_000,
      now: 61_000,
      lifeKind: turn.kind,
    });
    assert.equal(held, null);

    // A normal playful line still settles so rest blink can run.
    const playful = spokenBubbleResetDelay({
      pose: "talk",
      emotion: "bratty",
      talking: false,
      actLandedAt: 1_000,
      now: 61_000,
      lifeKind: "none",
    });
    assert.equal(playful, POSE_HOLD_AFTER_TALK_MS);

    // The Life Set path in the app must pass that turn into the settle, not only tint.
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../components/rai-app.tsx"), "utf8");
    assert.match(app, /spokenBubbleResetDelay\(\{[\s\S]*lifeKind:\s*bubbleLifeKind/);
    assert.match(app, /setBubbleLifeKind\(lifeTurn\.kind\)/);
  });
});
