import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMOTION_HOLD_MS,
  POSE_HOLD_AFTER_TALK_MS,
  POSE_HOLD_MIN_MS,
  clampEmotion,
  isDedicatedPose,
  layersFor,
  normalizePose,
  parseAct,
  poseFromUserText,
  poseResetDelayMs,
} from "./rai.ts";

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
      emotion: "smug",
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
    assert.match(layers[0]!.src, /rai\/wink/);
    assert.ok(!layers.some((l) => l.role === "talk"));
  });

  it("uses the official talk sheet when idle and talking", () => {
    const layers = layersFor({ ...base, pose: "idle", talking: true });
    assert.equal(layers.length, 1);
    assert.match(layers[0]!.src, /rai\/talk/);
  });

  it("does not let idleBeat replace a dedicated pose", () => {
    const layers = layersFor({
      ...base,
      pose: "peace",
      talking: false,
      idleBeat: "grin",
    });
    assert.equal(layers.length, 1);
    assert.match(layers[0]!.src, /rai\/peace/);
  });

  it("marks dedicated pose ids", () => {
    assert.equal(isDedicatedPose("idle"), false);
    assert.equal(isDedicatedPose("talk"), true);
    assert.equal(isDedicatedPose("three_quarter_left"), true);
    assert.equal(isDedicatedPose("profile"), true);
  });
});

describe("normalizePose / parseAct voice card", () => {
  it("maps turn-away to turn and rejects kiss", () => {
    assert.equal(normalizePose("turn-away"), "turn");
    assert.equal(normalizePose("kiss"), null);
    assert.equal(normalizePose("finger"), "think");
    assert.equal(normalizePose("middle_finger"), "middle_finger");
  });

  it("omitted pose keeps current (null) and omitted emotion is bratty", () => {
    const act = parseAct('{"line":"Hey. Took you long enough~"}');
    assert.equal(act.line, "Hey. Took you long enough~");
    assert.equal(act.emotion, "bratty");
    assert.equal(act.pose, null);
    assert.equal(clampEmotion(undefined), "bratty");
  });

  it("parses a named official pose", () => {
    const act = parseAct('{"line":"Caught that?","emotion":"smug","pose":"wink"}');
    assert.equal(act.pose, "wink");
    assert.equal(act.emotion, "smug");
  });

  it("only treats explicit pose names as commands", () => {
    assert.equal(poseFromUserText("wink"), "wink");
    assert.equal(poseFromUserText("do a pout"), "pout");
    assert.equal(poseFromUserText("I think that's funny"), null);
    assert.equal(poseFromUserText("blow me a kiss"), null);
  });
});
