import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  IDLE_BLINK_FIRST_MS,
  IDLE_BLINK_GAP_MAX_MS,
  IDLE_BLINK_GAP_MIN_MS,
  IDLE_BLINK_PASS_MS,
  IDLE_BLINK_STEP_MS,
  idleBlinkSchedule,
  idleBlinkStepName,
  IDLE_REST_SCALE,
  IDLE_MAX_ROCK_DEG,
  IDLE_MAX_TRANSLATE_Y_PX,
  POSE_CROSSFADE_MS,
  puppetIdleMotion,
  puppetRigTransform,
  snapToDevicePx,
} from "./rai-motion.ts";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../styles.css"), "utf8");

describe("official PNG puppet motion", () => {
  it("keeps idle breathe/sway planted (no float, no cardboard Y flip)", () => {
    for (let i = 0; i < 80; i++) {
      const t = i * 0.12;
      const m = puppetIdleMotion(t, { look: 0, talking: false, jaw: 0 });
      assert.ok(Math.abs(m.translateY) <= IDLE_MAX_TRANSLATE_Y_PX, `floaty Y ${m.translateY} at t=${t}`);
      assert.ok(Math.abs(m.rotateZ) <= IDLE_MAX_ROCK_DEG, `rock ${m.rotateZ} at t=${t}`);
      assert.equal(m.scale, 1, `rest scale ${m.scale}`);
      assert.ok(Math.abs(m.translateX) < 4, `sway X ${m.translateX}`);
    }
    const cssForm = puppetRigTransform(puppetIdleMotion(1.3));
    assert.match(cssForm, /translate\(/);
    // Idle rest: whole-pixel sway only; no rotation resample unless she leans to look.
    assert.doesNotMatch(cssForm, /rotate/);
    assert.match(puppetRigTransform(puppetIdleMotion(1.3, { look: 0.8 })), /rotateZ\(-0\.68deg\)/);
    assert.doesNotMatch(puppetRigTransform(puppetIdleMotion(1.3, { look: 0.02 })), /rotate/);
    // Sharpness: no zoom in the rig transform, rest scale exactly 1.
    assert.equal(IDLE_REST_SCALE, 1);
    assert.doesNotMatch(cssForm, /scale/);
    assert.doesNotMatch(cssForm, /rotateY/);
    assert.doesNotMatch(cssForm, /perspective/);
  });

  it("translates the rig by whole pixels only (no fractional resample)", () => {
    for (let i = 0; i < 120; i++) {
      const m = puppetIdleMotion(i * 0.173, { look: 0.3, talking: i % 2 === 0, jaw: 0.7 });
      const px = puppetRigTransform(m).match(/translate\((-?[0-9.]+)px, (-?[0-9.]+)px\)/);
      assert.ok(px, puppetRigTransform(m));
      assert.ok(Number.isInteger(Number(px[1])) && Number.isInteger(Number(px[2])), px[0]);
      for (const dpr of [2, 3, 3.5]) {
        const d = puppetRigTransform(m, dpr).match(/translate\((-?[0-9.e-]+)px, (-?[0-9.e-]+)px\)/);
        assert.ok(d);
        for (const v of [Number(d[1]), Number(d[2])]) {
          assert.ok(Math.abs(v * dpr - Math.round(v * dpr)) < 1e-6, `${v}px @${dpr}`);
        }
      }
    }
    assert.equal(snapToDevicePx(2.4), 2);
    assert.equal(snapToDevicePx(-0.4), 0);
    assert.equal(snapToDevicePx(1.2, 3.5), 8 / 7);
  });

  it("drops will-change and transform-scale zoom so the sheet is resampled once", () => {
    const rig = css.match(/\.rai-rig\s*\{[^}]*\}/)?.[0] ?? "";
    assert.doesNotMatch(rig, /will-change\s*:/);
    const layers = css.match(/\.rai-layer\s*\{[^}]*\}/g) ?? [];
    assert.ok(layers.length > 0);
    for (const block of layers) assert.doesNotMatch(block, /scale\(/);
    assert.match(layers[0], /image-rendering:\s*auto/);
    // translateZ(0) was measured to re-introduce a compositor resample; keep the layer unpromoted.
    assert.match(layers[0], /transform:\s*none/);
    for (const block of layers) assert.doesNotMatch(block, /transform:\s*translateZ|will-change\s*:/);
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
    // Five hard cuts, then hold 01. The lid pass is ~300ms total.
    assert.equal(IDLE_BLINK_STEP_MS, 60);
    assert.equal(IDLE_BLINK_PASS_MS, 300);
    assert.equal(IDLE_BLINK_PASS_MS, IDLE_BLINK_STEP_MS * 5);
    assert.equal(IDLE_BLINK_FIRST_MS, 900);
    assert.ok(IDLE_BLINK_FIRST_MS <= 2000);
    assert.equal(IDLE_BLINK_GAP_MIN_MS, 4500);
    assert.equal(IDLE_BLINK_GAP_MAX_MS, 7000);
    assert.ok(IDLE_BLINK_GAP_MAX_MS <= 10000);
    const blink = idleBlinkSchedule();
    assert.deepEqual(
      blink.map((step) => step.blink),
      [2, 3, 4, 3, 2, 1],
    );
    assert.deepEqual(
      blink.map((step) => idleBlinkStepName(step.blink)),
      ["02-closing", "03-half", "04-closed", "03-half", "02-closing", "01-open"],
    );
    assert.equal(blink[0]!.at, 0);
    for (let i = 0; i < 5; i++) {
      assert.equal(blink[i + 1]!.at - blink[i]!.at, IDLE_BLINK_STEP_MS);
    }
    assert.equal(blink[5]!.at, IDLE_BLINK_PASS_MS);
    assert.equal(blink[5]!.blink, 1);
    assert.match(css, /\.rai-rig\s*\{/);
    assert.match(css, /transform-origin:\s*50%\s*72%/);
    assert.doesNotMatch(css, /perspective\(1400px\)/);
  });
});
