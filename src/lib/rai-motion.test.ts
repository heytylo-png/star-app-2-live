import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  IDLE_BLINK_FIRST_MS,
  IDLE_BLINK_GAP_MAX_MS,
  IDLE_BLINK_GAP_MIN_MS,
  IDLE_BLINK_HALF_MS,
  IDLE_BLINK_HOLD_MS,
  IDLE_BLINK_OPEN_MS,
  idleBlinkSchedule,
  idleBlinkStepName,
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
    // Half and closed have to stay up long enough to read on the long shot.
    assert.ok(IDLE_BLINK_HALF_MS >= 500);
    assert.ok(IDLE_BLINK_HOLD_MS >= 800);
    assert.ok(IDLE_BLINK_OPEN_MS >= 120 && IDLE_BLINK_OPEN_MS < IDLE_BLINK_HALF_MS);
    assert.equal(IDLE_BLINK_FIRST_MS, 900);
    assert.ok(IDLE_BLINK_FIRST_MS <= 2000);
    assert.equal(IDLE_BLINK_GAP_MIN_MS, 4500);
    assert.equal(IDLE_BLINK_GAP_MAX_MS, 7000);
    assert.ok(IDLE_BLINK_GAP_MAX_MS <= 10000);
    const blink = idleBlinkSchedule();
    assert.deepEqual(
      blink.map((step) => step.blink),
      [1, 2, 3, 2, 1, 0],
    );
    assert.deepEqual(
      blink.map((step) => idleBlinkStepName(step.blink)),
      ["02-open", "03-half", "04-closed", "03-half", "02-open", "idle"],
    );
    assert.equal(blink[0]!.at, 0);
    assert.equal(blink[1]!.at, IDLE_BLINK_OPEN_MS);
    assert.equal(blink[2]!.at - blink[1]!.at, IDLE_BLINK_HALF_MS);
    assert.equal(blink[3]!.at - blink[2]!.at, IDLE_BLINK_HOLD_MS);
    assert.equal(blink[4]!.at - blink[3]!.at, IDLE_BLINK_HALF_MS);
    assert.equal(blink[5]!.at - blink[4]!.at, IDLE_BLINK_OPEN_MS);
    assert.equal(blink[5]!.blink, 0);
    assert.ok(blink[5]!.at >= 1500 && blink[5]!.at <= 3200);
    assert.match(css, /\.rai-rig\s*\{/);
    assert.match(css, /transform-origin:\s*50%\s*72%/);
    assert.doesNotMatch(css, /perspective\(1400px\)/);
  });
});
