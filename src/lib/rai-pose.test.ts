import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHART_BEAT_TINT_POSES,
  IDLE_BLINK_ENABLED,
  IDLE_MOUTH_ENABLED,
  IDLE_FRAME_SIZE,
  SPOKEN_TALK_TO_IDLE,
  routeSpokenTalk,
  spokenTurnStartPose,
  IDLE_REST_LAYER_ID,
  allSpriteUrls,
  canIdleBlink,
  canIdleMouth,
  idleBlinkFrameSrc,
  idleBlinkFrameUrls,
  idleMouthFrameSrc,
  idleRestSrc,
  isGreetingSpokenLine,
  restAfterSpokenLine,
  snapGreetingSheet,
  isRetiredBlinkSrc,
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
  settledRestPose,
  spokenBubbleResetDelay,
  streamLineClosed,
  streamSpokenAct,
  talkFlapOpacity,
  USE_EXPO_TALK_BUST,
} from "./rai.ts";
import { actToJson, composeAct } from "./brain.ts";
import { POSE_TINT_SOURCE } from "./generated/star-rai-artifacts.ts";
import { parseTrackTitle, resolveLifeTurn } from "./life.ts";
import { applySlotPatch, extractSlotsFromUserText } from "./memory-slots.ts";
import { IDLE_BLINK_PASS_MS, IDLE_BLINK_STEP_MS, idleBlinkSchedule } from "./rai-motion.ts";

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

/**
 * Eye box for the eyes-only rebake. Matches
 * artifacts/star-rai-blink-frames/baked/README.md.
 */
const IDLE_BLINK_EYE_BOX = { x: 420, y: 185, w: 210, h: 70 } as const;

/** Max abs RGB delta. Pixels inside `box` are ignored when `outside` is set. */
function maxAbsRgb(
  a: Uint8Array,
  b: Uint8Array,
  width: number,
  height: number,
  box?: { x: number; y: number; w: number; h: number },
  outside = false,
): number {
  let max = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inBox =
        !!box && x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h;
      if (outside ? inBox : box ? !inBox : false) continue;
      const i = (y * width + x) * 4;
      const dr = Math.abs(a[i]! - b[i]!);
      const dg = Math.abs(a[i + 1]! - b[i + 1]!);
      const db = Math.abs(a[i + 2]! - b[i + 2]!);
      const ch = dr > dg ? (dr > db ? dr : db) : dg > db ? dg : db;
      if (ch > max) max = ch;
    }
  }
  return max;
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
    smug: "rai/smug1085_hold.webp",
    wave: "rai/wave1110_hold.webp",
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

  it("wave pose is the 1110 hold WebP (720×1280, exact 2.0s frame)", () => {
    assert.equal(LIVE_POSE_FILES.wave, "rai/wave1110_hold.webp");
    assert.match(SPRITES.poses.wave, /rai\/wave1110_hold\.webp/);
    const buf = readFileSync(join(publicRoot, "rai/wave1110_hold.webp"));
    assert.equal(buf[0], 0x52);
    assert.equal(buf[1], 0x49);
    assert.equal(buf[2], 0x46);
    assert.equal(buf[3], 0x46);
    const helix = readFileSync(join(publicRoot, "star-rai/poses/wave.png"));
    assert.equal(helix.subarray(0, 8).toString("binary"), "\x89PNG\r\n\x1a\n");
    assert.equal(helix.readUInt32BE(16), 1152);
    assert.equal(helix.readUInt32BE(20), 1728);
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

  it("talks on the idle sheet (mouth frames) on idle, and holds talk_official on the talk key", () => {
    assert.equal(IDLE_MOUTH_ENABLED, true);
    const idle = layersFor({ ...base, pose: "idle", emotion: "bratty", talking: true });
    assert.equal(idle.length, 1);
    assert.equal(idle[0]!.id, IDLE_REST_LAYER_ID);
    assert.equal(idle[0]!.src, idleRestSrc());
    assert.doesNotMatch(idle[0]!.src, /talk_official/);
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

  it("holds 01 closed (no mouth steps) when reduced-motion is on", () => {
    const layers = layersFor({
      ...base,
      pose: "idle",
      emotion: "bratty",
      talking: true,
      mouth: 3,
      reducedMotion: true,
    });
    assert.equal(layers.length, 1);
    assert.equal(layers[0]!.src, idleRestSrc());
    assert.equal(canIdleMouth({ pose: "idle", emotion: "bratty", talking: true, reducedMotion: true }), false);
  });

  it("does not overlay Expo mouth or eye busts on the official pack", () => {
    assert.equal(USE_EXPO_TALK_BUST, false);
    const layers = layersFor({ ...base, pose: "idle", talking: true, blink: 2 });
    const blob = layers.map((l) => l.src).join(" ");
    assert.doesNotMatch(blob, /mouth_speak|mouth_oh|mouth_grin|face_eyes/);
    assert.doesNotMatch(blob, /star-rai\/idle-talk/);
  });

  it("rests idle on 01 open while blink is on", () => {
    const layers = layersFor({ ...base, pose: "idle", emotion: "bratty", talking: false });
    assert.equal(IDLE_BLINK_ENABLED, true);
    assert.equal(layers.length, 1);
    assert.equal(layers[0]!.id, IDLE_REST_LAYER_ID);
    assert.equal(layers[0]!.src, idleRestSrc());
    assert.equal(layers[0]!.src, SPRITES.idleBlinkOpen);
    assert.match(layers[0]!.src, /idle_blink_01_open\.png(?:\?|$)/);
  });

  it("hard-cuts one blink image through 02-03-04-03-02 then holds 01", () => {
    const rest = {
      ...base,
      pose: "idle" as const,
      emotion: "bratty" as const,
      talking: false,
      blink: 4 as const,
    };
    const closed = layersFor(rest);
    assert.equal(IDLE_BLINK_ENABLED, true);
    assert.equal(closed.length, 1);
    assert.equal(closed[0]!.role, "body");
    assert.equal(closed[0]!.id, IDLE_REST_LAYER_ID);
    assert.equal(closed[0]!.src, idleBlinkFrameSrc(4));
    assert.equal(closed[0]!.src, SPRITES.idleBlinkClosed);
    assert.match(closed[0]!.src, /idle_blink_04_closed\.png(?:\?|$)/);
    assert.doesNotMatch(closed.map((l) => l.src).join(" "), /face_eyes|mouth_speak|mouth_oh/);
    assert.equal(idleBlinkFrameSrc(0), SPRITES.idleBlinkOpen);
    assert.equal(idleBlinkFrameSrc(1), SPRITES.idleBlinkOpen);
    assert.equal(idleBlinkFrameSrc(2), SPRITES.idleBlinkClosing);
    assert.equal(idleBlinkFrameSrc(3), SPRITES.idleBlinkHalf);
    assert.equal(idleBlinkFrameSrc(4), SPRITES.idleBlinkClosed);
    assert.equal(isRetiredBlinkSrc("/rai/idle_blink.png"), true);
    assert.equal(isRetiredBlinkSrc("/rai/idle_blink_01.png"), true);
    assert.equal(isRetiredBlinkSrc("/rai/idle_blink_02.png"), true);
    assert.equal(isRetiredBlinkSrc("/rai/idle_blink_l.png"), true);
    assert.equal(isRetiredBlinkSrc("/rai/idle_blink_01_l.png"), true);
    assert.equal(isRetiredBlinkSrc("/rai/idle_blink_open_brow.png"), true);
    assert.equal(isRetiredBlinkSrc("/rai/idle_blink_02_open.png"), true);
    assert.equal(isRetiredBlinkSrc("artifacts/star-rai-blink-frames/eyes/01-open_L.png"), true);
    assert.equal(isRetiredBlinkSrc("artifacts/star-rai-blink-frames/tylo-holes/02-open.png"), true);
    assert.equal(isRetiredBlinkSrc("scrap/01-open-brow.png"), true);
    assert.equal(isRetiredBlinkSrc(SPRITES.idleBlinkOpen), false);
    assert.equal(isRetiredBlinkSrc(SPRITES.idleBlinkClosing), false);
    assert.equal(isRetiredBlinkSrc(SPRITES.idleBlinkHalf), false);
    assert.equal(isRetiredBlinkSrc(SPRITES.idleBlinkClosed), false);

    const blinkSteps = [0, 1, 2, 3, 4] as const;
    const frames = blinkSteps.map((blink) => layersFor({ ...rest, blink }));
    for (const [i, layer] of frames.entries()) {
      assert.equal(layer.length, 1);
      assert.equal(layer[0]!.id, IDLE_REST_LAYER_ID);
      assert.equal(layer[0]!.role, "body");
      assert.equal(layer[0]!.src, idleBlinkFrameSrc(blinkSteps[i]!));
    }
    assert.equal(new Set(frames.map((layer) => layer[0]!.src)).size, 4);
    assert.equal(frames[0]![0]!.src, frames[1]![0]!.src);
    assert.equal(frames[0]![0]!.src, SPRITES.idleBlinkOpen);
    const cycle = idleBlinkSchedule();
    assert.deepEqual(
      cycle.map((step) => step.blink),
      [2, 3, 4, 3, 2, 1],
    );
    assert.equal(IDLE_BLINK_STEP_MS, 60);
    assert.equal(IDLE_BLINK_PASS_MS, 300);
    for (let i = 0; i < 5; i++) {
      assert.equal(cycle[i + 1]!.at - cycle[i]!.at, IDLE_BLINK_STEP_MS);
    }

    assert.equal(layersFor({ ...rest, talking: true }).length, 1);
    assert.equal(layersFor({ ...rest, talking: true })[0]!.src, idleRestSrc());
    assert.equal(layersFor({ ...rest, talking: true })[0]!.id, IDLE_REST_LAYER_ID);
    assert.match(layersFor({ ...rest, pose: "wave" })[0]!.src, /wave1110_hold/);
    assert.match(layersFor({ ...rest, pose: "scold" })[0]!.src, /scold_official/);
    assert.match(layersFor({ ...rest, pose: "talk" })[0]!.src, /talk_official/);
    assert.match(layersFor({ ...rest, pose: "smug" })[0]!.src, /smug1085_hold/);
    assert.match(layersFor({ ...rest, emotion: "smug" })[0]!.src, /smug1085_hold/);
    assert.match(layersFor({ ...rest, emotion: "shy" })[0]!.src, /shy_official/);
    assert.match(layersFor({ ...rest, emotion: "hype" })[0]!.src, /peace\.png/);
    const reduced = layersFor({ ...rest, reducedMotion: true, blink: 0 });
    assert.equal(reduced.length, 1);
    assert.equal(reduced[0]!.src, idleRestSrc());
    assert.doesNotMatch(reduced[0]!.src, /face_eyes/);
    const glance = layersFor({ ...rest, emotion: "glance", blink: 0 });
    assert.equal(glance.length, 1);
    assert.equal(glance[0]!.src, idleRestSrc());
    assert.equal(glance[0]!.id, IDLE_REST_LAYER_ID);

    assert.equal(canIdleBlink(rest), true);
    assert.equal(canIdleBlink({ ...rest, talking: true }), false);
    assert.equal(canIdleBlink({ ...rest, pose: "wave" }), false);
    assert.equal(canIdleBlink({ ...rest, reducedMotion: true }), false);
    assert.equal(USE_EXPO_TALK_BUST, false);
    const baked = idleBlinkFrameUrls();
    assert.deepEqual(baked, [
      SPRITES.idleBlinkOpen,
      SPRITES.idleBlinkClosing,
      SPRITES.idleBlinkHalf,
      SPRITES.idleBlinkClosed,
    ]);
    for (const src of baked) {
      assert.ok(allSpriteUrls().includes(src));
      assert.equal(isRetiredBlinkSrc(src), false);
      assert.doesNotMatch(src, /_l\.png|_r\.png|open_brow|02_open|blink-frames\/eyes|tylo-holes\//);
    }
    assert.ok(allSpriteUrls().every((src) => !isRetiredBlinkSrc(src)));
    assert.ok(
      allSpriteUrls().every(
        (src) => !/_l\.png|_r\.png|open_brow|02_open|blink-frames\/eyes|tylo-holes\//.test(src),
      ),
    );

    const srcRoot = join(publicRoot, "../src");
    const puppetSrc = readFileSync(join(srcRoot, "components/puppet.tsx"), "utf8");
    const motionSrc = readFileSync(join(srcRoot, "lib/rai-motion.ts"), "utf8");
    const raiSrc = readFileSync(join(srcRoot, "lib/rai.ts"), "utf8");
    for (const source of [puppetSrc, motionSrc, raiSrc]) {
      assert.doesNotMatch(source, /IDLE_BLINK_DEST_RECT|idleBlinkPatchSrc|copyEyeRect|planIdleCanvasDraws|drawEyeRect/);
      assert.doesNotMatch(source, /790-open-brow|788-open|791-half|789-closed/);
    }
    // Blink never paints through a canvas. The only canvases on the stage are the four bridge clip
    // canvases (paste-15), handed to the clip worker: the puppet itself never draws on them.
    assert.doesNotMatch(puppetSrc, /drawImage|getContext/);
    const canvases = puppetSrc.match(/<canvas[\s\S]*?\/>/g) ?? [];
    assert.equal(canvases.length, 4);
    for (const c of canvases) assert.match(c, /data-rai-role="bridge"/);
    assert.match(puppetSrc, /restOnly/);
    assert.match(puppetSrc, /transition: "none"/);
    assert.match(puppetSrc, /if \(!IDLE_BLINK_ENABLED\) return;/);
    const timerGate = puppetSrc.indexOf("if (!IDLE_BLINK_ENABLED) return;");
    const cycleStart = puppetSrc.indexOf("setTimeout(runCycle");
    assert.ok(timerGate >= 0 && cycleStart > timerGate, "blink timer must return before it cycles frames");
    assert.equal(existsSync(join(srcRoot, "lib/idle-blink-paint.ts")), false);
    assert.equal(existsSync(join(publicRoot, "rai/idle_blink_open_brow.png")), false);
    assert.equal(existsSync(join(publicRoot, "rai/idle_blink_02_open.png")), false);
    for (const retired of [
      "idle_blink.png",
      "idle_blink_01.png",
      "idle_blink_02.png",
      "idle_blink_l.png",
      "idle_blink_r.png",
      "idle_blink_01_l.png",
      "idle_blink_01_r.png",
      "idle_blink_02_l.png",
      "idle_blink_02_r.png",
    ]) {
      assert.equal(existsSync(join(publicRoot, "rai", retired)), false, retired);
    }

    const idle = decodePng(readFileSync(join(publicRoot, "rai/idle.png")));
    assert.equal(idle.width, IDLE_FRAME_SIZE.width);
    assert.equal(idle.height, IDLE_FRAME_SIZE.height);
    const bakedRoot = join(publicRoot, "../artifacts/star-rai-blink-frames/baked");
    const runtimeFrames = [
      ["rai/idle_blink_01_open.png", "idle_blink_01_open.png"],
      ["rai/idle_blink_02_closing.png", "idle_blink_02_closing.png"],
      ["rai/idle_blink_03_half.png", "idle_blink_03_half.png"],
      ["rai/idle_blink_04_closed.png", "idle_blink_04_closed.png"],
    ] as const;
    let openRgba: Uint8Array | null = null;
    for (const [runtimeRel, bakedName] of runtimeFrames) {
      const runtime = readFileSync(join(publicRoot, runtimeRel));
      const artifact = readFileSync(join(bakedRoot, bakedName));
      assert.deepEqual(runtime, artifact, `${runtimeRel} drifted from baked/${bakedName}`);
      const frame = decodePng(runtime);
      assert.equal(frame.width, IDLE_FRAME_SIZE.width, runtimeRel);
      assert.equal(frame.height, IDLE_FRAME_SIZE.height, runtimeRel);
      // True RGBA since the offline alpha cut (scripts/cut-alpha.py), one shared mask.
      assert.equal(frame.colorType, 6, runtimeRel);
      if (bakedName.endsWith("01_open.png")) openRgba = frame.rgba;
    }
    if (!openRgba) throw new Error("missing 01_open pixels");
    assert.deepEqual(
      readFileSync(join(publicRoot, "rai/idle_blink_01_open.png")),
      readFileSync(join(publicRoot, "rai/idle.png")),
      "01_open must be a byte copy of idle.png",
    );
    assert.equal(
      maxAbsRgb(idle.rgba, openRgba, idle.width, idle.height),
      0,
      "01_open pixels must match idle.png",
    );
    for (const name of [
      "rai/idle_blink_02_closing.png",
      "rai/idle_blink_03_half.png",
      "rai/idle_blink_04_closed.png",
    ]) {
      const frame = decodePng(readFileSync(join(publicRoot, name)));
      const outside = maxAbsRgb(
        idle.rgba,
        frame.rgba,
        idle.width,
        idle.height,
        IDLE_BLINK_EYE_BOX,
        true,
      );
      const inside = maxAbsRgb(
        idle.rgba,
        frame.rgba,
        idle.width,
        idle.height,
        IDLE_BLINK_EYE_BOX,
        false,
      );
      assert.equal(outside, 0, `${name} drifted outside the eye box`);
      assert.ok(inside > 0, `${name} did not change the eyes`);
    }
    assert.equal(IDLE_BLINK_ENABLED, true);
    assert.equal(idleRestSrc(), SPRITES.idleBlinkOpen);
    assert.match(idleRestSrc(), /idle_blink_01_open\.png(?:\?|$)/);

    const gif = readFileSync(join(bakedRoot, "proof_standing_full.gif"));
    assert.equal(gif.subarray(0, 6).toString(), "GIF89a");
    assert.equal(gif.readUInt16LE(6), IDLE_FRAME_SIZE.width);
    assert.equal(gif.readUInt16LE(8), IDLE_FRAME_SIZE.height);
    const note = readFileSync(join(bakedRoot, "README.md"), "utf8");
    assert.match(note, /02 → 03 → 04 → 03 → 02/);
    assert.match(note, /300ms/);
    assert.match(note, /hold 01/);
    assert.match(note, /Do not skip 02/);
    assert.match(note, /one `<img>`/);
    assert.match(note, /no stack/);
    assert.match(note, /no dual PNG/);
    assert.match(note, /IDLE_BLINK_ENABLED` is true/);
    assert.match(note, /Blink is on, approved by TyLo on 2026-09-26/);
    assert.match(note, /807-referenced painted lids, pass 4b/);
  });

  it("pins soft/hype off frown idle even when pose is still idle", () => {
    assert.match(layersFor({ ...base, pose: "idle", emotion: "soft", talking: false })[0]!.src, /content_official/);
    assert.match(layersFor({ ...base, pose: "idle", emotion: "hype", talking: false })[0]!.src, /peace\.png/);
    assert.match(layersFor({ ...base, pose: "idle", emotion: "smug", talking: true })[0]!.src, /smug1085_hold/);
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
    assert.equal(layers[0]!.src, idleRestSrc());
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
    assert.match(waveSrc, /rai\/wave1110_hold\.webp/);
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
    assert.doesNotMatch(layers[0]!.src, /talk_official/);
    const talk = layersFor({ ...base, pose: "talk", emotion: "bratty", talking: true });
    assert.ok(!talk.some((l) => /kiss/i.test(l.src)));
    assert.match(talk[0]!.src, /talk_official/);
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

  it("maps omitted emotion: bratty stays on idle (idle mouth), moods keep their sheet", () => {
    assert.equal(SPOKEN_TALK_TO_IDLE, true);
    assert.equal(EMOTION_TO_POSE.bratty, "idle");
    assert.equal(routeSpokenTalk("talk"), "idle");
    assert.equal(routeSpokenTalk("wave"), "wave");
    assert.equal(routeSpokenTalk("idle"), "idle");
    assert.equal(spokenTurnStartPose(), "idle");
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
      "idle",
    );
    // A model "talk" key on a spoken line lands on idle; a user-named "talk" still shows talk.
    assert.equal(
      resolveSpokenPose({ namedPose: null, modelPose: "talk", emotion: "bratty", spoken: true, currentPose: "idle" }),
      "idle",
    );
    assert.equal(
      resolveSpokenPose({ namedPose: "talk", modelPose: null, emotion: "bratty", spoken: true, currentPose: "idle" }),
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

  it("keeps a dedicated current body for unmapped kiss only", () => {
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
    assert.equal(
      resolveSpokenPose({
        namedPose: null,
        modelPose: null,
        emotion: "bratty",
        spoken: true,
        currentPose: "wave",
      }),
      "idle",
    );
  });

  it("tints now_playing-just-set and Chart beat; a talk tint lands on idle", () => {
    const music = resolveSpokenPose({
      namedPose: null,
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      nowPlayingJustSet: true,
      lifeTintPose: "talk",
      currentPose: "idle",
    });
    assert.equal(music, "idle");
    const content = resolveSpokenPose({
      namedPose: null,
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      nowPlayingJustSet: true,
      lifeTintPose: "content",
      currentPose: "idle",
    });
    assert.equal(content, "content");
    assert.equal(
      resolveSpokenPose({
        namedPose: null,
        modelPose: "idle",
        emotion: "bratty",
        spoken: true,
        chartBeat: true,
        chartTintPose: "talk",
        currentPose: "idle",
      }),
      "idle",
    );

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

  it("keeps a spoken bratty line on idle (idle mouth), never talk", () => {
    const pose = resolveSpokenPose({
      namedPose: null,
      modelPose: "idle",
      emotion: "bratty",
      spoken: true,
      currentPose: "idle",
    });
    assert.equal(pose, "idle");
    assert.notEqual(pose, "talk");
  });

  it("talks on idle for a playful line, then rests on 01 a moment after the line ends", () => {
    const pose = resolveSpokenPose({
      namedPose: null,
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      currentPose: "idle",
      seed: "you're cute. Yeah, I heard that~",
    });
    assert.equal(pose, "idle");
    const src = layersFor({
      pose,
      emotion: "bratty",
      talking: true,
      amplitude: 0.5,
      angle: 0,
      mouth: 2,
    })[0]!.src;
    assert.match(src, /idle_mouth_02_small/);
    assert.doesNotMatch(src, /talk_official/);

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

    // Line over: already on idle, only the short emotion reset remains.
    const restDelay = poseResetDelayMs({
      pose,
      emotion: "bratty",
      talking: false,
      actLandedAt: 1_000,
      now: 61_000,
    });
    assert.ok(restDelay != null && restDelay < POSE_HOLD_AFTER_TALK_MS);
    assert.ok((restDelay ?? Infinity) < 10_000);
    const restSrc = layersFor({
      pose: "idle",
      emotion: DEFAULT_EMOTION,
      talking: false,
      amplitude: 0,
      angle: 0,
    })[0]!.src;
    assert.equal(restSrc, idleRestSrc());
    assert.equal(restSrc, SPRITES.idleBlinkOpen);
    assert.match(restSrc, /idle_blink_01_open\.png(?:\?|$)/);
    assert.equal(
      canIdleBlink({ pose: "idle", emotion: DEFAULT_EMOTION, talking: false }),
      true,
    );
  });

  it("Music Set omitted pose is idle (talk tint), content, or smug, even if emotion is tired", () => {
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
      assert.equal(pose, tint === "talk" ? "idle" : tint);
      assert.notEqual(pose, "talk");
      if (pose !== "idle") {
        const src = layersFor({
          pose,
          emotion: "tired",
          talking: false,
          amplitude: 0,
          angle: 0,
        })[0]!.src;
        assert.doesNotMatch(src, /\/idle\.png(?:\?|$)/);
        assert.doesNotMatch(src, /tired_official/);
      }
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
    assert.equal(lineFirst.pose, "idle");
    assert.notEqual(lineFirst.pose, "talk");
    assert.equal(lineFirst.emotion, DEFAULT_EMOTION);

    const smug = streamSpokenAct('{"line":"Cute.","emotion":"smug"', { currentPose: "idle" });
    assert.equal(smug?.pose, "smug");
    assert.equal(smug?.emotion, "smug");

    const named = streamSpokenAct('{"line":"Wink~"', { namedPose: "wink", currentPose: "idle" });
    assert.equal(named?.pose, "wink");

    const fresh = streamSpokenAct('{"line":"Still waving."', { currentPose: "wave" });
    assert.equal(fresh?.pose, "idle");
    assert.notEqual(fresh?.pose, "wave");
    assert.notEqual(fresh?.pose, "think");
  });

  it("Music Set from the Life sentence stays talk|content|smug on that bubble", () => {
    // The Set button sends this sentence. The turn is not pre-marked.
    const text = "I'm listening to ETA";
    const patch = extractSlotsFromUserText(text);
    const after = applySlotPatch({}, patch).life;
    const turn = resolveLifeTurn({ userText: text, before: undefined, after });
    assert.equal(turn.kind, "track_change");
    // ETA's tint is content/smug (a "talk" tint would land on idle; see the Music Set test above).
    assert.notEqual(turn.tintPose, "talk");

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
    assert.doesNotMatch(src, /\/idle\.png(?:\?|$)/);

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

    // Next rest (caption gone) still settles a playful line onto idle.png. Blink is on.
    const playful = spokenBubbleResetDelay({
      pose: "talk",
      emotion: "bratty",
      talking: false,
      actLandedAt: 1_000,
      now: 61_000,
      lifeKind: "none",
    });
    assert.equal(playful, POSE_HOLD_AFTER_TALK_MS);

    // The line she just said is still the bubble. Do not snap to frown idle under it.
    const onBubble = spokenBubbleResetDelay({
      pose: "talk",
      emotion: "bratty",
      talking: false,
      actLandedAt: 1_000,
      now: 61_000,
      lifeKind: "none",
      captionLive: true,
    });
    assert.equal(onBubble, null);

    // The Life Set path in the app must pass that turn into the settle, not only tint.
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../components/rai-app.tsx"), "utf8");
    assert.match(app, /spokenBubbleResetDelay\(\{[\s\S]*lifeKind:\s*bubbleLifeKind/);
    assert.match(app, /captionLive:\s*false/);
    assert.match(app, /setBubbleLifeKind\(lifeTurn\.kind\)/);
    assert.match(app, /namedThisTurn == null/);
    assert.match(app, /setPose\(settledRestPose\(\)\)/);
  });
});

describe("spoken pose re-resolves each line", () => {
  const teaseLines = [
    { emotion: "bratty" as const, seed: "you're cute. keep up~" },
    { emotion: "smug" as const, seed: "as if I'd let that slide" },
    { emotion: "bratty" as const, seed: "playful tease. yeah I heard that" },
    { emotion: "bratty" as const, seed: "bratty on purpose :3" },
  ];

  it("resolves several tease lines in a row to idle (idle mouth) or smug, never think", () => {
    let current: "think" | "idle" | "smug" | "pout" | "tired" = "think";
    for (const line of teaseLines) {
      const pose = resolveSpokenPose({
        namedPose: null,
        modelPose: null,
        emotion: line.emotion,
        spoken: true,
        currentPose: current,
        seed: line.seed,
      });
      assert.ok(pose === "idle" || pose === "smug", `${line.seed} → ${pose}`);
      assert.notEqual(pose, "think");
      assert.notEqual(pose, "talk");
      const src = layersFor({
        pose,
        emotion: line.emotion,
        talking: true,
        amplitude: 0.2,
        angle: 0,
        mouth: 3,
      })[0]!.src;
      assert.doesNotMatch(src, /think_official/);
      assert.doesNotMatch(src, /talk_official/);
      assert.doesNotMatch(src, /\/idle\.png(?:\?|$)/);
      current = pose as typeof current;
    }
  });

  it("does not carry think from line N onto line N+1 unless N+1 calls think", () => {
    const lineN = resolveSpokenPose({
      namedPose: null,
      modelPose: "think",
      emotion: "glance",
      spoken: true,
      currentPose: "talk",
      seed: "give me a second",
    });
    assert.equal(lineN, "think");

    const next = resolveSpokenPose({
      namedPose: null,
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      currentPose: lineN,
      seed: "okay I'm done teasing",
    });
    assert.equal(next, "idle");
    assert.notEqual(next, "think");

    const callsThink = resolveSpokenPose({
      namedPose: null,
      modelPose: "think",
      emotion: "bratty",
      spoken: true,
      currentPose: "talk",
      seed: "actually wait",
    });
    assert.equal(callsThink, "think");
  });

  it("talks on idle with the mouth, then settles to official idle 01, never think", () => {
    const spoken = resolveSpokenPose({
      namedPose: null,
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      currentPose: "think",
      seed: "tease",
    });
    assert.equal(spoken, "idle");
    const talkingSrc = layersFor({
      pose: spoken,
      emotion: "bratty",
      talking: true,
      amplitude: 0,
      angle: 0,
      mouth: 3,
    })[0]!.src;
    assert.match(talkingSrc, /idle_mouth_03_open/);
    assert.doesNotMatch(talkingSrc, /talk_official/);
    assert.doesNotMatch(talkingSrc, /think_official/);

    const delay = spokenBubbleResetDelay({
      pose: spoken,
      emotion: "bratty",
      talking: false,
      actLandedAt: 1_000,
      now: 61_000,
      captionLive: false,
    });
    assert.ok(delay != null && delay < POSE_HOLD_AFTER_TALK_MS);
    assert.equal(settledRestPose(), "idle");
    assert.notEqual(settledRestPose(), "think");
    const restSrc = layersFor({
      pose: settledRestPose(),
      emotion: DEFAULT_EMOTION,
      talking: false,
      amplitude: 0,
      angle: 0,
    })[0]!.src;
    assert.equal(restSrc, idleRestSrc());
    assert.match(restSrc, /idle_blink_01_open\.png(?:\?|$)/);
    assert.doesNotMatch(restSrc, /think_official/);
    assert.equal(
      canIdleBlink({ pose: settledRestPose(), emotion: DEFAULT_EMOTION, talking: false }),
      true,
    );
  });

  it("applies a user-named pose for one turn, then re-resolves", () => {
    assert.equal(namedPoseFromText("do a wink"), "wink");
    const named = resolveSpokenPose({
      namedPose: "wink",
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      currentPose: "think",
      seed: "do a wink",
    });
    assert.equal(named, "wink");

    const next = resolveSpokenPose({
      namedPose: null,
      modelPose: null,
      emotion: "smug",
      spoken: true,
      currentPose: named,
      seed: "cute. your turn",
    });
    assert.equal(next, "smug");
    assert.notEqual(next, "wink");
    assert.notEqual(next, "think");
  });

  it("still uses think for an explicit think emotion and a Chart beat", () => {
    assert.equal(clampEmotion("think"), "glance");
    assert.equal(clampEmotion("thinking"), "glance");
    assert.equal(EMOTION_TO_POSE.glance, "think");
    assert.equal(
      resolveSpokenPose({
        namedPose: null,
        modelPose: null,
        emotion: clampEmotion("think"),
        spoken: true,
        currentPose: "talk",
        seed: "hmm",
      }),
      "think",
    );
    assert.equal(
      resolveSpokenPose({
        namedPose: null,
        modelPose: null,
        emotion: "glance",
        spoken: true,
        currentPose: "smug",
        seed: "let me think",
      }),
      "think",
    );
    assert.equal(
      resolveSpokenPose({
        namedPose: "think",
        modelPose: null,
        emotion: "bratty",
        spoken: true,
        currentPose: "talk",
        seed: "think pose",
      }),
      "think",
    );

    const chart = resolveSpokenPose({
      namedPose: null,
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      chartBeat: true,
      chartTintPose: "think",
      currentPose: "talk",
      seed: "What do you make of my chart?",
    });
    assert.equal(chart, "think");
    assert.match(
      layersFor({
        pose: chart,
        emotion: "bratty",
        talking: false,
        amplitude: 0,
        angle: 0,
      })[0]!.src,
      /think_official/,
    );
  });
});

describe("greeting lines stay on idle and chew", () => {
  const greetings = ["Hello", "hi", "hi back", "hey", "hi back~", "Hello!"];

  it("does not resolve a greeting reply to wink or talk_official", () => {
    for (const line of greetings) {
      assert.equal(isGreetingSpokenLine(line), true, line);
      assert.equal(namedPoseFromText(line), null, line);
      for (const modelPose of ["wink", "talk", null] as const) {
        const pose = resolveSpokenPose({
          namedPose: null,
          modelPose,
          emotion: "bratty",
          spoken: true,
          seed: line,
          currentPose: "idle",
        });
        assert.equal(pose, "idle", `${line} model=${modelPose}`);
        const src = layersFor({
          pose,
          emotion: "bratty",
          talking: true,
          amplitude: 0,
          angle: 0,
          mouth: 3,
        })[0]!.src;
        assert.match(src, /idle_mouth_03_open/);
        assert.doesNotMatch(src, /wink_official|talk_official/);
        assert.equal(
          canIdleMouth({ pose, emotion: "bratty", talking: false, lineLive: true }),
          true,
        );
      }
      const streamed = streamSpokenAct(`{"line":"${line}","emotion":"bratty","pose":"wink"}`, {
        namedPose: null,
        currentPose: "idle",
      });
      assert.equal(streamed?.pose, "idle", line);
    }
  });

  it("shows wink when the user said wink", () => {
    assert.equal(namedPoseFromText("wink"), "wink");
    assert.equal(namedPoseFromText("do a wink"), "wink");
    const pose = resolveSpokenPose({
      namedPose: "wink",
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      seed: "Hello",
      currentPose: "idle",
    });
    assert.equal(pose, "wink");
    const src = layersFor({
      pose,
      emotion: "bratty",
      talking: true,
      amplitude: 0,
      angle: 0,
      mouth: 3,
    })[0]!.src;
    assert.match(src, /wink_official/);
    assert.equal(canIdleMouth({ pose, emotion: "bratty", talking: true, lineLive: true }), false);
  });

  it("shows wink when the reply pose tag is exactly wink", () => {
    const pose = resolveSpokenPose({
      namedPose: null,
      modelPose: "wink",
      emotion: "bratty",
      spoken: true,
      seed: "Catch it~",
      currentPose: "idle",
    });
    assert.equal(pose, "wink");
    const streamed = streamSpokenAct('{"line":"Catch it~","emotion":"bratty","pose":"wink"}', {
      namedPose: null,
      currentPose: "idle",
    });
    assert.equal(streamed?.pose, "wink");
    assert.match(
      layersFor({
        pose: streamed!.pose,
        emotion: "bratty",
        talking: false,
        amplitude: 0,
        angle: 0,
      })[0]!.src,
      /wink_official/,
    );
    assert.equal(
      restAfterSpokenLine({
        pose: "wink",
        line: "Catch it~",
        namedPose: null,
        replyPose: "wink",
      }),
      "wink",
    );
  });

  it("returns to official idle and mouth 01 when the line ends", () => {
    assert.equal(
      restAfterSpokenLine({
        pose: "wink",
        line: "hi back",
        namedPose: null,
        replyPose: "wink",
      }),
      "idle",
    );
    assert.equal(
      snapGreetingSheet({
        pose: "wink",
        line: "hi back",
        namedPose: null,
        replyPose: "wink",
      }),
      true,
    );
    assert.equal(
      snapGreetingSheet({
        pose: "talk",
        line: "Hello",
        namedPose: null,
        replyPose: "talk",
      }),
      true,
    );
    assert.equal(idleMouthFrameSrc(1), idleRestSrc());
    const restSrc = layersFor({
      pose: "idle",
      emotion: DEFAULT_EMOTION,
      talking: false,
      amplitude: 0,
      angle: 0,
      blink: 0,
      mouth: 1,
    })[0]!.src;
    assert.equal(restSrc, idleRestSrc());
    assert.match(restSrc, /idle_blink_01_open/);
    assert.doesNotMatch(restSrc, /wink_official|talk_official/);
    assert.equal(canIdleBlink({ pose: "idle", emotion: DEFAULT_EMOTION, talking: false }), true);
    assert.equal(
      canIdleMouth({ pose: "idle", emotion: DEFAULT_EMOTION, talking: false, lineLive: false }),
      false,
    );
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../components/rai-app.tsx"), "utf8");
    assert.match(app, /snapGreetingSheet\(\{/);
    assert.match(app, /setPose\(settledRestPose\(\)\)/);
  });

  it("still swaps a named pose and cancels the idle mouth", () => {
    assert.equal(namedPoseFromText("wave"), "wave");
    const pose = resolveSpokenPose({
      namedPose: "wave",
      modelPose: "wink",
      emotion: "bratty",
      spoken: true,
      seed: "hi back",
      currentPose: "idle",
    });
    assert.equal(pose, "wave");
    assert.match(
      layersFor({
        pose,
        emotion: "bratty",
        talking: true,
        amplitude: 0,
        angle: 0,
        mouth: 3,
      })[0]!.src,
      /wave1110_hold/,
    );
    assert.equal(canIdleMouth({ pose, emotion: "bratty", talking: true, lineLive: true }), false);
    assert.equal(
      restAfterSpokenLine({
        pose: "wave",
        line: "hi back",
        namedPose: "wave",
        replyPose: "wink",
      }),
      "wave",
    );
    assert.equal(
      snapGreetingSheet({
        pose: "wave",
        line: "hi back",
        namedPose: "wave",
        replyPose: "wink",
      }),
      false,
    );
    const namedTalk = resolveSpokenPose({
      namedPose: "talk",
      modelPose: null,
      emotion: "bratty",
      spoken: true,
      seed: "talk",
      currentPose: "idle",
    });
    assert.equal(namedTalk, "talk");
    assert.match(
      layersFor({
        pose: namedTalk,
        emotion: "bratty",
        talking: true,
        amplitude: 0,
        angle: 0,
      })[0]!.src,
      /talk_official/,
    );
  });

  it("holds a tag-first wink or talk until the greeting line is closed", () => {
    const open = [
      '{"pose":"wink","emotion":"bratty","line":"h',
      '{"pose":"wink","emotion":"bratty","line":"hi b',
      '{"pose":"wink","emotion":"bratty","line":"hi ba',
      '{"pose":"talk","emotion":"bratty","line":"h',
      '{"pose":"talk","emotion":"bratty","line":"hi back',
    ];
    for (const partial of open) {
      assert.equal(streamLineClosed(partial), false, partial);
      const streamed = streamSpokenAct(partial, { namedPose: null, currentPose: "idle" });
      assert.equal(streamed?.pose, "idle", partial);
      assert.doesNotMatch(
        layersFor({
          pose: streamed!.pose,
          emotion: "bratty",
          talking: true,
          amplitude: 0,
          angle: 0,
          mouth: 3,
        })[0]!.src,
        /wink_official|talk_official/,
      );
    }

    const closed = '{"pose":"wink","emotion":"bratty","line":"hi back :3"}';
    assert.equal(streamLineClosed(closed), true);
    const greeting = streamSpokenAct(closed, { namedPose: null, currentPose: "idle" });
    assert.equal(greeting?.pose, "idle");

    const quoted = '{"pose":"wink","emotion":"bratty","line":"hi back :3"';
    assert.equal(streamLineClosed(quoted), true);
    assert.equal(
      streamSpokenAct(quoted, { namedPose: null, currentPose: "idle" })?.pose,
      "idle",
    );

    const winkOpen = '{"pose":"wink","emotion":"bratty","line":"Cat';
    assert.equal(streamSpokenAct(winkOpen, { namedPose: null, currentPose: "idle" })?.pose, "idle");
    const wink = '{"pose":"wink","emotion":"bratty","line":"Catch it~"}';
    assert.equal(streamLineClosed(wink), true);
    assert.equal(streamSpokenAct(wink, { namedPose: null, currentPose: "idle" })?.pose, "wink");

    const named = streamSpokenAct('{"pose":"wink","emotion":"bratty","line":"h', {
      namedPose: "wink",
      currentPose: "idle",
    });
    assert.equal(named?.pose, "wink");

    const hiThereOpen = [
      '{"pose":"wink","emotion":"bratty","line":"h',
      '{"pose":"wink","emotion":"bratty","line":"hi t',
      '{"pose":"wink","emotion":"bratty","line":"hi the',
      '{"pose":"talk","emotion":"bratty","line":"hi there',
    ];
    for (const partial of hiThereOpen) {
      assert.equal(streamLineClosed(partial), false, partial);
      const streamed = streamSpokenAct(partial, { namedPose: null, currentPose: "idle" });
      assert.equal(streamed?.pose, "idle", partial);
      assert.doesNotMatch(
        layersFor({
          pose: streamed!.pose,
          emotion: "bratty",
          talking: true,
          amplitude: 0,
          angle: 0,
          mouth: 3,
        })[0]!.src,
        /wink_official|talk_official/,
      );
    }
    const hiThere = '{"pose":"wink","emotion":"bratty","line":"hi there :3"}';
    assert.equal(streamLineClosed(hiThere), true);
    assert.equal(streamSpokenAct(hiThere, { namedPose: null, currentPose: "idle" })?.pose, "idle");
  });

  it("chews short greeting openers on idle, then rests on mouth 01", () => {
    const lines = [
      "hi there",
      "hey there",
      "hello there",
      "hey how are you",
      "hi how are you",
      "yo what's up",
      "sup",
      "what's up",
      "hey you",
      "hi again",
      "hello again",
      "hey~ :3",
    ];
    for (const line of lines) {
      assert.equal(isGreetingSpokenLine(line), true, line);
      assert.equal(namedPoseFromText(line), null, line);
      for (const modelPose of ["wink", "talk"] as const) {
        const pose = resolveSpokenPose({
          namedPose: null,
          modelPose,
          emotion: "bratty",
          spoken: true,
          seed: line,
          currentPose: "idle",
        });
        assert.equal(pose, "idle", `${line} model=${modelPose}`);
        const chewing = layersFor({
          pose,
          emotion: "bratty",
          talking: true,
          amplitude: 0,
          angle: 0,
          mouth: 3,
        })[0]!.src;
        assert.match(chewing, /idle_mouth_03_open/);
        assert.doesNotMatch(chewing, /wink_official|talk_official/);
        assert.equal(
          canIdleMouth({ pose, emotion: "bratty", talking: false, lineLive: true }),
          true,
        );
        assert.equal(
          restAfterSpokenLine({
            pose: modelPose,
            line,
            namedPose: null,
            replyPose: modelPose,
          }),
          "idle",
        );
      }
      const restSrc = layersFor({
        pose: "idle",
        emotion: DEFAULT_EMOTION,
        talking: false,
        amplitude: 0,
        angle: 0,
        blink: 0,
        mouth: 1,
      })[0]!.src;
      assert.equal(restSrc, idleMouthFrameSrc(1));
      assert.equal(restSrc, idleRestSrc());
      assert.match(restSrc, /idle_blink_01_open/);
      assert.equal(canIdleBlink({ pose: "idle", emotion: DEFAULT_EMOTION, talking: false }), true);
      assert.equal(
        canIdleMouth({ pose: "idle", emotion: DEFAULT_EMOTION, talking: false, lineLive: false }),
        false,
      );
    }
  });

  it("still winks when a tagged line is not a short greeting", () => {
    const lines = [
      "Catch it~",
      "hey, watch this, I can do a whole trick for you if you ask nicely",
      "hi wink",
    ];
    for (const line of lines) {
      assert.equal(isGreetingSpokenLine(line), false, line);
      const pose = resolveSpokenPose({
        namedPose: null,
        modelPose: "wink",
        emotion: "bratty",
        spoken: true,
        seed: line,
        currentPose: "idle",
      });
      assert.equal(pose, "wink", line);
      assert.match(
        layersFor({
          pose,
          emotion: "bratty",
          talking: true,
          amplitude: 0,
          angle: 0,
          mouth: 3,
        })[0]!.src,
        /wink_official/,
      );
      assert.equal(canIdleMouth({ pose, emotion: "bratty", talking: true, lineLive: true }), false);
    }
  });
});
