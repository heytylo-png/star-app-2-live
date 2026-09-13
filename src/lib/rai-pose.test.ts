import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMOTION_HOLD_MS,
  POSE_HOLD_AFTER_TALK_MS,
  POSE_HOLD_MIN_MS,
  isDedicatedPose,
  layersFor,
  poseResetDelayMs,
} from "./rai.ts";

describe("poseResetDelayMs", () => {
  it("does not reset while talking", () => {
    assert.equal(
      poseResetDelayMs({ pose: "lean", talking: true, actLandedAt: 1_000, now: 1_100 }),
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

  it("holds emotion-mapped poses (angry/flirty/shy) even when pose is idle", () => {
    const delay = poseResetDelayMs({
      pose: "idle",
      emotion: "angry",
      talking: false,
      actLandedAt: 5_000,
      now: 5_000,
    });
    assert.equal(delay, POSE_HOLD_MIN_MS);
  });

  it("uses a shorter hold for idle presence", () => {
    const delay = poseResetDelayMs({
      pose: "idle",
      emotion: "idle",
      talking: false,
      actLandedAt: 0,
      now: 0,
    });
    assert.equal(delay, EMOTION_HOLD_MS);
  });
});

describe("layersFor talking vs pose hold", () => {
  const base = {
    emotion: "happy" as const,
    amplitude: 0.4,
    angle: 0,
    talkPhase: 1,
    blink: 0 as const,
    idleBeat: "none" as const,
  };

  it("keeps a dedicated pose on while talking (no Helix-front snap)", () => {
    const layers = layersFor({ ...base, pose: "lean", talking: true });
    assert.equal(layers.length, 1);
    assert.match(layers[0]!.src, /lean-front/);
    assert.ok(!layers.some((l) => l.role === "talk"));
  });

  it("uses Helix front + talk flap when idle and talking", () => {
    const layers = layersFor({ ...base, pose: "idle", talking: true });
    assert.ok(layers.some((l) => l.role === "body" && /angles\/front/.test(l.src)));
    assert.ok(layers.some((l) => l.role === "talk"));
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
    assert.equal(isDedicatedPose("three_quarter"), true);
    assert.equal(isDedicatedPose("profile"), true);
  });
});
