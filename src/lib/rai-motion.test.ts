import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  IDLE_BLINK_GAP_MAX_MS,
  IDLE_BLINK_GAP_MIN_MS,
  IDLE_BLINK_SEQUENCE,
  IDLE_BLINK_STEP_FRAMES,
  IDLE_BLINK_STEP_MS,
  idleBlinkSchedule,
  IDLE_BREATHE_MAX,
  IDLE_BREATHE_MIN,
  IDLE_MAX_ROCK_DEG,
  IDLE_MAX_TRANSLATE_Y_PX,
  POSE_CROSSFADE_MS,
  puppetIdleMotion,
  puppetRigTransform,
} from "./rai-motion.ts";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");

describe("official PNG puppet motion", () => {
  it("keeps idle breathe/sway planted (no float, no cardboard Y flip)", () => {
    for (let i = 0; i < 80; i++) {
      const t = i * 0.12;
      const m = puppetIdleMotion(t, { look: 0, talking: false, jaw: 0 });
      assert.ok(Math.abs(m.translateY) <= IDLE_MAX_TRANSLATE_Y_PX, `floaty Y ${m.translateY} at t=${t}`);
      assert.ok(Math.abs(m.rotateZ) <= IDLE_MAX_ROCK_DEG, `rock ${m.rotateZ} at t=${t}`);
      assert.ok(m.scale >= IDLE_BREATHE_MIN && m.scale <= IDLE_BREATHE_MAX, `scale ${m.scale}`);
      assert.ok(Math.abs(m.translateX) < 4, `sway X ${m.translateX}`);
    }
    const cssForm = puppetRigTransform(puppetIdleMotion(1.3));
    assert.match(cssForm, /translateX\(/);
    assert.match(cssForm, /rotateZ\(/);
    assert.match(cssForm, /scale\(/);
    assert.doesNotMatch(cssForm, /rotateY/);
    assert.doesNotMatch(cssForm, /perspective/);
  });

  it("zeros micro-motion when reduced-motion is on", () => {
    const m = puppetIdleMotion(4, { reduced: true, look: 0.8, talking: true, jaw: 1 });
    assert.equal(m.translateY, 0);
    assert.equal(m.scale, 1);
    assert.equal(m.hairDeg, 0);
  });

  it("crossfades pose sheets and plants the rig on the hips", () => {
    assert.equal(POSE_CROSSFADE_MS, 380);
    assert.ok(POSE_CROSSFADE_MS >= 300 && POSE_CROSSFADE_MS <= 480);
    assert.equal(IDLE_BLINK_STEP_FRAMES, 2);
    assert.equal(IDLE_BLINK_STEP_MS, Math.round((1000 / 24) * 2));
    assert.ok(IDLE_BLINK_STEP_MS < POSE_CROSSFADE_MS);
    assert.equal(IDLE_BLINK_GAP_MIN_MS, 3000);
    assert.equal(IDLE_BLINK_GAP_MAX_MS, 6000);
    assert.deepEqual(IDLE_BLINK_SEQUENCE, [
      "open",
      "closing",
      "half",
      "closed",
      "half",
      "closing",
      "open",
    ]);
    const blink = idleBlinkSchedule();
    // Leading open is the idle bitmap. The timer plays the other six steps.
    assert.deepEqual(
      blink.map((step) => step.blink),
      [1, 2, 3, 2, 1, 0],
    );
    assert.equal(blink[0]!.at, 0);
    for (let i = 1; i < blink.length; i++) {
      assert.equal(blink[i]!.at - blink[i - 1]!.at, IDLE_BLINK_STEP_MS);
    }
    assert.equal(blink[5]!.blink, 0);
    assert.equal(blink.length, IDLE_BLINK_SEQUENCE.length - 1);
    assert.match(css, /\.rai-rig\s*\{/);
    assert.match(css, /transform-origin:\s*50%\s*72%/);
    assert.doesNotMatch(css, /perspective\(1400px\)/);
  });
});
