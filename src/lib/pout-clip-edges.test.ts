import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  POUT_CLIP_BOX,
  POUT_HOLD_FILE,
  POUT_IN_CLIP,
  POUT_OUT_CLIP,
  SMUG_CLIP_BOX,
  SMUG_CLIP_SHEET,
  WAVE_CLIP_BOX,
} from "./pose-bridge.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

type FrameEdge = { i: number; left: number; right: number; bottom: number; bbox: [number, number, number, number] };
type Manifest = {
  box: { x: number; y: number; w: number; h: number };
  strip_px: number;
  clips: Record<string, { sha256: string; frames: number; width: number; height: number; frame_edges: FrameEdge[] }>;
  hold: { file: string; sha256: string; bbox: [number, number, number, number]; outside_band_alpha_max: number; alpha_mean_abs_diff_vs_intro_last: number };
};
/** Decoded alpha of every frame of the shipped pout clips (f807/bridge/p1158/edges/gen_edges.py). */
const manifest = JSON.parse(readFileSync(join(root, "src/lib/pout-clip-edges.json"), "utf8")) as Manifest;
/** Minimum fully transparent margin between the figure and the band's left / right edge. */
const MIN_MARGIN_PX = 8;

describe("pout clip band (1158 / 1162)", () => {
  it("has its own band, drawn 1:1 inside the 720x1280 sheet", () => {
    assert.notDeepEqual(POUT_CLIP_BOX, SMUG_CLIP_BOX);
    assert.notDeepEqual(POUT_CLIP_BOX, WAVE_CLIP_BOX);
    assert.ok(POUT_CLIP_BOX.x >= 0 && POUT_CLIP_BOX.x + POUT_CLIP_BOX.w <= SMUG_CLIP_SHEET.w);
    assert.equal(POUT_CLIP_BOX.y, 0);
    assert.equal(POUT_CLIP_BOX.h, SMUG_CLIP_SHEET.h);
    assert.equal(POUT_CLIP_BOX.w % 2, 0, "AV1 4:2:0 needs an even width");
    assert.deepEqual(manifest.box, { ...POUT_CLIP_BOX });
  });

  it("the pout player draws with the pout band", () => {
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    const pout = puppet.slice(puppet.indexOf("poutPlayer = SmugClipPlayer.for("));
    assert.match(pout.slice(0, 400), /box: POUT_CLIP_BOX,/);
  });

  for (const clip of [POUT_IN_CLIP, POUT_OUT_CLIP]) {
    it(`${clip.file}: no frame has a visible pixel on the band edge (arms / shoes never clipped)`, () => {
      const m = manifest.clips[clip.file];
      assert.ok(m, `manifest has ${clip.file}`);
      const sha = createHash("sha256").update(readFileSync(join(root, "public", clip.file))).digest("hex");
      assert.equal(m.sha256, sha, "manifest was generated from the shipped file");
      assert.equal(m.frames, clip.frames);
      assert.equal(m.width, POUT_CLIP_BOX.w);
      assert.equal(m.height, POUT_CLIP_BOX.h);
      assert.equal(m.frame_edges.length, clip.frames);
      assert.ok(manifest.strip_px >= 2);
      for (const f of m.frame_edges) {
        assert.equal(f.left, 0, `frame ${f.i}: alpha on the left band edge`);
        assert.equal(f.right, 0, `frame ${f.i}: alpha on the right band edge`);
        assert.equal(f.bottom, 0, `frame ${f.i}: alpha on the bottom edge (shoes in frame)`);
        assert.ok(f.bbox[0] - POUT_CLIP_BOX.x >= MIN_MARGIN_PX, `frame ${f.i}: left margin ${f.bbox[0] - POUT_CLIP_BOX.x}`);
        assert.ok(
          POUT_CLIP_BOX.x + POUT_CLIP_BOX.w - 1 - f.bbox[2] >= MIN_MARGIN_PX,
          `frame ${f.i}: right margin ${POUT_CLIP_BOX.x + POUT_CLIP_BOX.w - 1 - f.bbox[2]}`,
        );
      }
    });
  }

  it("the intro is 1158 f0..f48 (0-2.000 s) and the hold is its last frame (crossed-arms frown)", () => {
    const h = manifest.hold;
    assert.equal(h.file, POUT_HOLD_FILE);
    const sha = createHash("sha256").update(readFileSync(join(root, "public", h.file))).digest("hex");
    assert.equal(h.sha256, sha, "manifest was generated from the shipped hold");
    assert.equal(POUT_IN_CLIP.frames, 49, "intro is f0..f48");
    assert.equal(POUT_OUT_CLIP.frames, 145, "1162 plays in full");
    const last = manifest.clips[POUT_IN_CLIP.file]!.frame_edges[POUT_IN_CLIP.frames - 1]!;
    assert.equal(last.i, 48);
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(h.bbox[k]! - last.bbox[k]!) <= 1, `hold bbox ${h.bbox} vs f48 ${last.bbox}`);
    assert.ok(h.alpha_mean_abs_diff_vs_intro_last < 1, `hold alpha vs decoded f48: ${h.alpha_mean_abs_diff_vs_intro_last}`);
    assert.equal(h.outside_band_alpha_max, 0, "hold has nothing outside the pout band");
  });
});
