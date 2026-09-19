import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_EMOTION,
  EMOTION_HOLD_MS,
  LIVE_POSE_FILES,
  POSE_HOLD_AFTER_TALK_MS,
  POSE_HOLD_MIN_MS,
  RAI_SYSTEM,
  SPRITES,
  clampEmotion,
  isDedicatedPose,
  layersFor,
  namedPoseFromText,
  normalizePose,
  parseAct,
  poseResetDelayMs,
} from "./rai.ts";

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), "../../public");

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

  it("holds emotion-mapped poses (shy/smug/tired) even when pose is idle", () => {
    const delay = poseResetDelayMs({
      pose: "idle",
      emotion: "shy",
      talking: false,
      actLandedAt: 5_000,
      now: 5_000,
    });
    assert.equal(delay, POSE_HOLD_MIN_MS);
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

  it("uses talk_official when idle and talking", () => {
    const layers = layersFor({ ...base, pose: "idle", talking: true });
    assert.equal(layers.length, 1);
    assert.match(layers[0]!.src, /talk_official/);
    assert.ok(!layers.some((l) => l.role === "talk"));
  });

  it("resolves idle to official idle.png", () => {
    const layers = layersFor({ ...base, pose: "idle", talking: false });
    assert.match(layers[0]!.src, /rai\/idle\.png/);
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

  it("marks dedicated pose ids", () => {
    assert.equal(isDedicatedPose("idle"), false);
    assert.equal(isDedicatedPose("talk"), true);
    assert.equal(isDedicatedPose("three_quarter_left"), true);
    assert.equal(isDedicatedPose("profile"), true);
  });

  it("wave/hold/scold use official sheets", () => {
    assert.match(layersFor({ ...base, pose: "wave", talking: false })[0]!.src, /wave_official/);
    assert.match(layersFor({ ...base, pose: "hold", talking: false })[0]!.src, /hold_official/);
    assert.match(layersFor({ ...base, pose: "scold", talking: false })[0]!.src, /scold_official/);
  });
});

describe("voice card prompt", () => {
  it("matches artifacts/star-rai-voice-card.txt character-for-character", () => {
    const card = readFileSync(join(publicRoot, "../artifacts/star-rai-voice-card.txt"), "utf8");
    assert.equal(RAI_SYSTEM, card);
  });
});
