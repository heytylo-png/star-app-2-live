import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  IDLE_MOUTH_OPEN_ALT_CHANCE,
  IDLE_MOUTH_STEP_MAX_MS,
  IDLE_MOUTH_STEP_MIN_MS,
  blinkPausedForMouth,
  idleMouthAllowed,
  idleMouthCycle,
  idleMouthFile,
  idleMouthPeak,
  idleMouthStepMs,
  idleMouthStepName,
  isWideMouthCue,
  mouthFrameAfterSnap,
  mouthFrameWhenCancelled,
  mouthFrameWhenLineEnds,
  shouldStartIdleMouth,
  type IdleMouthFrame,
} from "./idle-mouth.ts";
import {
  IDLE_REST_LAYER_ID,
  idleMouthFrameSrc,
  idleMouthFrameUrls,
  isExpressiveEmotion,
  layersFor,
  SPRITES,
  startupSpriteUrls,
  type EmotionId,
} from "./rai.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function pathOf(url: string): string {
  return url.replace(/^\//, "").split("?")[0]!;
}

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

describe("idle mouth cycle", () => {
  it("steps 01-02-03-02-01 and keeps each hold inside 120-180ms", () => {
    assert.deepEqual(idleMouthCycle(3), [1, 2, 3, 2, 1]);
    assert.equal(idleMouthStepMs(() => 0), IDLE_MOUTH_STEP_MIN_MS);
    assert.equal(idleMouthStepMs(() => 1), IDLE_MOUTH_STEP_MAX_MS);
    assert.equal(IDLE_MOUTH_STEP_MIN_MS, 120);
    assert.equal(IDLE_MOUTH_STEP_MAX_MS, 180);
    for (let i = 0; i <= 10; i++) {
      const ms = idleMouthStepMs(() => i / 10);
      assert.ok(ms >= 120 && ms <= 180, String(ms));
    }
    assert.equal(idleMouthStepName(1), "01-closed");
    assert.equal(idleMouthStepName(3), "03-open");
  });

  it("uses 05 only for hype, scold, and bratty-loud", () => {
    const quiet = ["bratty", "smug", "tired", "shy", "soft", "glance", "idle"];
    for (const emotion of quiet) {
      assert.equal(isWideMouthCue(emotion), false, emotion);
      assert.equal(idleMouthPeak({ emotion, smirk: false, rng: () => 0.99 }), 3, emotion);
    }
    for (const cue of ["hype", "scold", "bratty-loud"]) {
      assert.equal(idleMouthPeak({ emotion: cue, smirk: true, rng: () => 0 }), 5, cue);
      assert.deepEqual(idleMouthCycle(5), [1, 2, 5, 2, 1]);
    }
    assert.equal(idleMouthPeak({ emotion: "bratty", pose: "scold", smirk: false, rng: () => 0 }), 5);
  });

  it("replaces 03 with 04, and with 06 only when that sheet exists", () => {
    assert.equal(IDLE_MOUTH_OPEN_ALT_CHANCE, 0.25);
    assert.equal(idleMouthPeak({ emotion: "bratty", smirk: false, rng: () => 0.24 }), 4);
    assert.equal(idleMouthPeak({ emotion: "bratty", smirk: false, rng: seq([0.0, 0.0]) }), 4);
    assert.equal(idleMouthPeak({ emotion: "bratty", smirk: true, rng: seq([0.0, 0.0]) }), 6);
    assert.equal(idleMouthPeak({ emotion: "bratty", smirk: true, rng: seq([0.0, 0.9]) }), 4);
    assert.equal(existsSync(join(root, "public/rai/idle_mouth_06_smirk.png")), false);
    const seen = new Set<IdleMouthFrame>();
    for (let i = 0; i < 40; i++) {
      seen.add(idleMouthPeak({ emotion: "bratty", smirk: false, rng: () => i / 40 }));
    }
    assert.equal(seen.has(6), false);
    assert.equal(seen.has(5), false);
    assert.equal(idleMouthFrameUrls(false).some((src) => src.includes("idle_mouth_06")), false);
    assert.equal(idleMouthFile(6), "rai/idle_mouth_06_smirk.png");
  });

  it("does not cycle off idle, on a mood sheet, or under reduced motion", () => {
    const base = { emotion: "bratty", lineLive: true, reducedMotion: false };
    assert.equal(idleMouthAllowed({ ...base, pose: "idle" }), true);
    assert.equal(idleMouthAllowed({ ...base, pose: "talk" }), false);
    assert.equal(idleMouthAllowed({ ...base, pose: "wave" }), false);
    assert.equal(idleMouthAllowed({ ...base, pose: "scold" }), false);
    assert.equal(idleMouthAllowed({ ...base, pose: "idle", lineLive: false }), false);
    assert.equal(idleMouthAllowed({ ...base, pose: "idle", reducedMotion: true }), false);
    for (const emotion of ["shy", "smug", "tired", "soft", "hype"] as const) {
      assert.equal(isExpressiveEmotion(emotion as EmotionId), true);
      assert.equal(idleMouthAllowed({ ...base, pose: "idle", emotion }), false, emotion);
    }
  });

  it("skips a line that starts before the frames decode, and does not start late", () => {
    assert.equal(shouldStartIdleMouth({ allowed: true, decoded: false, alreadySkipped: false }), false);
    assert.equal(shouldStartIdleMouth({ allowed: true, decoded: true, alreadySkipped: true }), false);
    assert.equal(shouldStartIdleMouth({ allowed: true, decoded: true, alreadySkipped: false }), true);
    assert.equal(shouldStartIdleMouth({ allowed: false, decoded: true, alreadySkipped: false }), false);
  });

  it("cancels on a pose change and snaps to 01 when the line ends", () => {
    assert.equal(mouthFrameWhenCancelled(), 0);
    assert.equal(mouthFrameWhenLineEnds(true), 1);
    assert.equal(mouthFrameWhenLineEnds(false), 0);
    assert.equal(mouthFrameAfterSnap(), 0);
    assert.equal(idleMouthStepName(mouthFrameWhenLineEnds(true)), "01-closed");
  });

  it("pauses blink while a mouth frame is up and resumes after the snap", () => {
    assert.equal(blinkPausedForMouth(0), false);
    for (const frame of [1, 2, 3, 4, 5, 6]) assert.equal(blinkPausedForMouth(frame), true);
    const during = blinkPausedForMouth(3);
    const after = blinkPausedForMouth(mouthFrameAfterSnap());
    assert.equal(during, true);
    assert.equal(after, false);
  });

  it("mounts the mouth sheet on the idle layer and leaves talk_official alone", () => {
    const rest = {
      pose: "idle" as const,
      emotion: "bratty" as const,
      talking: false,
      amplitude: 0,
      angle: 0,
      blink: 4 as const,
    };
    const open = layersFor({ ...rest, mouth: 3 });
    assert.equal(open.length, 1);
    assert.equal(open[0]!.id, IDLE_REST_LAYER_ID);
    assert.match(open[0]!.src, /idle_mouth_03_open\.png/);
    assert.doesNotMatch(open[0]!.src, /idle\.png/);
    assert.doesNotMatch(open[0]!.src, /talk_official/);

    const talkOnIdle = layersFor({ ...rest, talking: true, mouth: 2 });
    assert.match(talkOnIdle[0]!.src, /idle_mouth_02_small\.png/);
    assert.equal(talkOnIdle[0]!.id, IDLE_REST_LAYER_ID);

    const untouched = layersFor({ ...rest, talking: true });
    assert.match(untouched[0]!.src, /talk_official/);

    const wave = layersFor({ ...rest, pose: "wave", mouth: 5 });
    assert.match(wave[0]!.src, /wave_official/);
    assert.equal(mouthFrameWhenCancelled(), 0);

    const hype = layersFor({ ...rest, emotion: "hype", mouth: 5 });
    assert.match(hype[0]!.src, /peace\.png/);
  });

  it("keeps mouth frames off the first-paint list and out of other visemes", () => {
    for (const src of startupSpriteUrls()) assert.equal(src.includes("idle_mouth"), false, src);
    const urls = idleMouthFrameUrls(false).map(pathOf);
    assert.deepEqual(urls, [
      "rai/idle_mouth_01_closed.png",
      "rai/idle_mouth_02_small.png",
      "rai/idle_mouth_03_open.png",
      "rai/idle_mouth_04_oo.png",
      "rai/idle_mouth_05_wide.png",
    ]);
    assert.equal(pathOf(idleMouthFrameSrc(1)), "rai/idle_mouth_01_closed.png");
    assert.equal(pathOf(SPRITES.poses.talk).includes("idle_mouth"), false);
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    assert.match(puppet, /idleMouthFrameUrls\(/);
    assert.doesNotMatch(puppet, /mouth_speak\.png|mouth_oh\.png|mouth_closed_smile\.png/);
    const startupAt = puppet.indexOf("startupSpriteUrls()");
    const mouthAt = puppet.indexOf("idleMouthFrameUrls(");
    assert.ok(startupAt >= 0 && mouthAt > startupAt);
  });

  it("keeps 01 byte-identical to the open blink and idle.png", () => {
    const sha = (file: string) =>
      createHash("sha256").update(readFileSync(join(root, "public", file))).digest("hex");
    assert.equal(sha("rai/idle_mouth_01_closed.png"), sha("rai/idle_blink_01_open.png"));
    assert.equal(sha("rai/idle_mouth_01_closed.png"), sha("rai/idle.png"));
  });
});
