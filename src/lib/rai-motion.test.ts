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
  IDLE_BREATHE_MAX,
  IDLE_BREATHE_MIN,
  IDLE_MAX_ROCK_DEG,
  IDLE_MAX_TRANSLATE_Y_PX,
  POSE_CROSSFADE_MS,
  RAI_SHEET_H,
  RAI_SHEET_W,
  framingTopRatio,
  framingZoomForViewport,
  puppetIdleMotion,
  puppetRigTransform,
  snapPuppetSheet,
  snapStageHeight,
} from "./rai-motion.ts";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../styles.css"), "utf8");
const puppetSrc = readFileSync(join(here, "../components/puppet.tsx"), "utf8");

describe("official PNG puppet motion", () => {
  it("keeps idle breathe/sway planted (no float, no cardboard Y flip)", () => {
    for (let i = 0; i < 80; i++) {
      const t = i * 0.12;
      const m = puppetIdleMotion(t, { look: 0, talking: false, jaw: 0 });
      assert.ok(Math.abs(m.translateY) <= IDLE_MAX_TRANSLATE_Y_PX, `floaty Y ${m.translateY} at t=${t}`);
      assert.ok(Math.abs(m.rotateZ) <= IDLE_MAX_ROCK_DEG, `rock ${m.rotateZ} at t=${t}`);
      assert.equal(m.scale, 1);
      assert.ok(m.scale >= IDLE_BREATHE_MIN && m.scale <= IDLE_BREATHE_MAX, `scale ${m.scale}`);
      assert.ok(Math.abs(m.translateX) < 4, `sway X ${m.translateX}`);
      const cssForm = puppetRigTransform(m);
      assert.doesNotMatch(cssForm, /scale\(/);
      assert.match(cssForm, /translateX\(-?\d+px\)/);
      assert.match(cssForm, /translateY\(-?\d+px\)/);
      assert.match(cssForm, /translateZ\(0\)/);
      const x = Number(cssForm.match(/translateX\((-?\d+)px\)/)?.[1]);
      const y = Number(cssForm.match(/translateY\((-?\d+)px\)/)?.[1]);
      assert.equal(x, Math.round(m.translateX) || 0);
      assert.equal(y, Math.round(m.translateY) || 0);
    }
    const cssForm = puppetRigTransform(puppetIdleMotion(1.3));
    assert.match(cssForm, /translateX\(/);
    assert.match(cssForm, /rotateZ\(/);
    assert.doesNotMatch(cssForm, /scale\(/);
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

  it("keeps rest and idle transforms at scale 1 with whole-pixel translates", () => {
    assert.equal(IDLE_BREATHE_MIN, 1);
    assert.equal(IDLE_BREATHE_MAX, 1);
    const samples = [
      puppetIdleMotion(0),
      puppetIdleMotion(1.3),
      puppetIdleMotion(4.2, { look: 0.37, talking: true, jaw: 0.8 }),
      puppetIdleMotion(2, { reduced: true, look: 0.8, talking: true, jaw: 1 }),
    ];
    for (const motion of samples) {
      assert.equal(motion.scale, 1);
      const cssForm = puppetRigTransform(motion);
      assert.doesNotMatch(cssForm, /scale\(/);
      assert.match(cssForm, /translateZ\(0\)/);
      assert.match(cssForm, /translateX\(-?\d+px\)/);
      assert.match(cssForm, /translateY\(-?\d+px\)/);
      assert.doesNotMatch(cssForm, /translateX\(-?\d+\.\d+px\)/);
      assert.doesNotMatch(cssForm, /translateY\(-?\d+\.\d+px\)/);
    }
    assert.doesNotMatch(puppetSrc, /scale\(/);
  });

  it("snaps the stage and the 1008×1792 sheet to whole pixels at framing C", () => {
    assert.equal(RAI_SHEET_W, 1008);
    assert.equal(RAI_SHEET_H, 1792);
    assert.equal(framingZoomForViewport(390, 844), 1.08);
    assert.equal(framingZoomForViewport(1280, 800), 1.04);
    assert.equal(framingZoomForViewport(1280, 1000), 1);
    assert.equal(framingTopRatio(390), 0.0125);
    assert.equal(snapStageHeight(800.6), 801);
    assert.equal(snapStageHeight(800.4), 800);
    const phone = snapPuppetSheet(663.4, framingZoomForViewport(390, 844));
    assert.equal(phone.height, Math.round(663.4 * 1.08));
    assert.equal(phone.width, Math.round((phone.height * RAI_SHEET_W) / RAI_SHEET_H));
    assert.equal(phone.height, Math.round(phone.height));
    assert.equal(phone.width, Math.round(phone.width));
    assert.match(puppetSrc, /snapStageHeight\(/);
    assert.match(puppetSrc, /snapPuppetSheet\(/);
  });

  it("paints one body image and keeps .rai-layer crisp", () => {
    assert.equal(puppetSrc.match(/<img\b/g)?.length, 1);
    assert.match(puppetSrc, /data-rai-role="body"/);
    assert.match(puppetSrc, /transition: "none"/);
    assert.doesNotMatch(puppetSrc, /display\.map/);
    assert.doesNotMatch(puppetSrc, /opacity:\s*0/);
    assert.doesNotMatch(puppetSrc, /opacity \$\{/);
    const layerBlocks = css.match(/\.rai-layer\s*\{[^}]*\}/g) ?? [];
    assert.ok(layerBlocks.length >= 1);
    assert.match(layerBlocks[0]!, /image-rendering:\s*auto/);
    assert.match(layerBlocks[0]!, /transform:\s*translateZ\(0\)/);
    for (const block of layerBlocks) {
      assert.doesNotMatch(block, /scale\(/);
    }
    assert.doesNotMatch(css, /scale\(var\(--rai-long-shot/);
  });
});
