import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOUTH_RMS_HALF_OFF,
  MOUTH_RMS_HALF_ON,
  MOUTH_RMS_OPEN_OFF,
  MOUTH_RMS_OPEN_ON,
  mouthFrameFromPlayback,
  reduceMouthPlayback,
  type MouthAudioEvent,
} from "./mouth-sync.ts";

describe("mouth sync from playback", () => {
  it("stays on the rest frame before playing and after the last sample", () => {
    const events: MouthAudioEvent[] = [
      { type: "rms", rms: 0.8 },
      { type: "playing" },
      { type: "rms", rms: 0 },
      { type: "rms", rms: 0.2 },
      { type: "rms", rms: 0.01 },
      { type: "rms", rms: 0.16 },
      { type: "ended" },
      { type: "rms", rms: 0.8 },
    ];
    const frames = reduceMouthPlayback(events);
    assert.equal(frames[0]!.frame, 0);
    assert.equal(frames[0]!.open, false);
    assert.equal(frames[0]!.drive, "rest");
    assert.equal(frames[1]!.frame, 0);
    assert.equal(frames[1]!.open, false);
    assert.equal(frames[1]!.drive, "rms");
    assert.equal(frames[2]!.frame, 1);
    assert.equal(frames[2]!.open, false);
    assert.equal(frames[3]!.frame, 3);
    assert.equal(frames[3]!.open, true);
    assert.equal(frames[4]!.frame, 1);
    assert.equal(frames[4]!.open, false);
    assert.equal(frames[5]!.open, true);
    assert.equal(frames[6]!.frame, 0);
    assert.equal(frames[6]!.open, false);
    assert.equal(frames[6]!.drive, "rest");
    assert.equal(frames[7]!.frame, 0);
    assert.equal(frames[7]!.open, false);
    const openIdx = frames.map((f, i) => (f.open ? i : -1)).filter((i) => i >= 0);
    assert.ok(openIdx.every((i) => i > 1 && i < 6));
  });

  it("closes on pause, error, and stop even if the last sample was loud", () => {
    for (const type of ["pause", "error", "stop"] as const) {
      const frames = reduceMouthPlayback([
        { type: "playing" },
        { type: "rms", rms: 0.4 },
        { type },
      ]);
      assert.equal(frames[1]!.open, true);
      assert.equal(frames[2]!.frame, 0);
      assert.equal(frames[2]!.open, false);
      assert.equal(frames[2]!.drive, "rest");
    }
  });

  it("uses the half-open frame between closed and open", () => {
    const mid = (MOUTH_RMS_HALF_ON + MOUTH_RMS_OPEN_ON) / 2;
    const snap = mouthFrameFromPlayback({
      phase: "playing",
      rms: mid,
      prev: 1,
      analyserOk: true,
    });
    assert.equal(snap.frame, 2);
    assert.equal(snap.open, true);
  });

  it("holds open and half-open across a small dip, then closes in a gap", () => {
    const openHold = (MOUTH_RMS_OPEN_OFF + MOUTH_RMS_OPEN_ON) / 2;
    const fromOpen = mouthFrameFromPlayback({
      phase: "playing",
      rms: openHold,
      prev: 3,
      analyserOk: true,
    });
    const fromClosed = mouthFrameFromPlayback({
      phase: "playing",
      rms: openHold,
      prev: 1,
      analyserOk: true,
    });
    assert.equal(fromOpen.frame, 3);
    assert.notEqual(fromClosed.frame, 3);

    const halfHold = (MOUTH_RMS_HALF_OFF + MOUTH_RMS_HALF_ON) / 2;
    const stayHalf = mouthFrameFromPlayback({
      phase: "playing",
      rms: halfHold,
      prev: 2,
      analyserOk: true,
    });
    const stayClosed = mouthFrameFromPlayback({
      phase: "playing",
      rms: halfHold,
      prev: 1,
      analyserOk: true,
    });
    assert.equal(stayHalf.frame, 2);
    assert.equal(stayClosed.frame, 1);

    const gap = mouthFrameFromPlayback({
      phase: "playing",
      rms: 0,
      prev: 3,
      analyserOk: true,
    });
    assert.equal(gap.frame, 1);
    assert.equal(gap.open, false);
  });

  it("falls back to the timed chew only while playing when the analyser cannot attach", () => {
    const frames = reduceMouthPlayback([
      { type: "playing", analyserOk: false },
      { type: "rms", rms: 0.9 },
      { type: "ended" },
    ]);
    assert.equal(frames[0]!.drive, "chew");
    assert.equal(frames[0]!.open, false);
    assert.equal(frames[0]!.frame, 0);
    assert.equal(frames[1]!.drive, "chew");
    assert.equal(frames[1]!.open, false);
    assert.equal(frames[2]!.drive, "rest");
    assert.equal(frames[2]!.frame, 0);
    assert.equal(frames[2]!.phase, "ended");
  });
});
