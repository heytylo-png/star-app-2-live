import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SMUG_CLIP_BOX, SMUG_CLIP_SHEET, WAVE_CLIP_BOX, WAVE_HOLD_FILE, WAVE_IN_CLIP, WAVE_OUT_CLIP } from "./pose-bridge.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

type FrameEdge = { i: number; left: number; right: number; bottom: number; bbox: [number, number, number, number] };
type Manifest = {
  box: { x: number; y: number; w: number; h: number };
  strip_px: number;
  clips: Record<string, { sha256: string; frames: number; width: number; height: number; frame_edges: FrameEdge[] }>;
  hold: { file: string; sha256: string; bbox: [number, number, number, number]; outside_band_alpha_max: number; alpha_mean_abs_diff_vs_intro_last: number };
};
/** Decoded alpha of every frame of the shipped wave clips (f807/bridge/w1126/edges/gen_edges.py). */
const manifest = JSON.parse(readFileSync(join(root, "src/lib/wave-clip-edges.json"), "utf8")) as Manifest;
/** Minimum fully transparent margin between the figure and the band's left / right edge. */
const MIN_MARGIN_PX = 8;

describe("wave clip band (1126 / 1140)", () => {
  it("has its own band, wider than the smug band, drawn 1:1 inside the 720x1280 sheet", () => {
    assert.notDeepEqual(WAVE_CLIP_BOX, SMUG_CLIP_BOX);
    assert.ok(WAVE_CLIP_BOX.w > SMUG_CLIP_BOX.w);
    assert.ok(WAVE_CLIP_BOX.x >= 0 && WAVE_CLIP_BOX.x + WAVE_CLIP_BOX.w <= SMUG_CLIP_SHEET.w);
    assert.equal(WAVE_CLIP_BOX.y, 0);
    assert.equal(WAVE_CLIP_BOX.h, SMUG_CLIP_SHEET.h);
    assert.equal(WAVE_CLIP_BOX.w % 2, 0, "AV1 4:2:0 needs an even width");
    assert.deepEqual(manifest.box, { ...WAVE_CLIP_BOX });
  });

  it("the wave player draws with the wave band, the smug player with the smug band", () => {
    const puppet = readFileSync(join(root, "src/components/puppet.tsx"), "utf8");
    const wave = puppet.slice(puppet.indexOf("wavePlayer = SmugClipPlayer.for("));
    assert.match(wave.slice(0, 400), /box: WAVE_CLIP_BOX,/);
    const smug = puppet.slice(puppet.indexOf("smugPlayer = SmugClipPlayer.for("));
    assert.match(smug.slice(0, 400), /box: SMUG_CLIP_BOX,/);
  });

  for (const clip of [WAVE_IN_CLIP, WAVE_OUT_CLIP]) {
    it(`${clip.file}: no frame has a visible pixel on the band edge (elbow / hand never clipped)`, () => {
      const m = manifest.clips[clip.file];
      assert.ok(m, `manifest has ${clip.file}`);
      const sha = createHash("sha256").update(readFileSync(join(root, "public", clip.file))).digest("hex");
      assert.equal(m.sha256, sha, "manifest was generated from the shipped file");
      assert.equal(m.frames, clip.frames);
      assert.equal(m.width, WAVE_CLIP_BOX.w);
      assert.equal(m.height, WAVE_CLIP_BOX.h);
      assert.equal(m.frame_edges.length, clip.frames);
      assert.ok(manifest.strip_px >= 2);
      for (const f of m.frame_edges) {
        assert.equal(f.left, 0, `frame ${f.i}: alpha on the left band edge`);
        assert.equal(f.right, 0, `frame ${f.i}: alpha on the right band edge`);
        assert.equal(f.bottom, 0, `frame ${f.i}: alpha on the bottom edge (shoes in frame)`);
        assert.ok(f.bbox[0] - WAVE_CLIP_BOX.x >= MIN_MARGIN_PX, `frame ${f.i}: left margin ${f.bbox[0] - WAVE_CLIP_BOX.x}`);
        assert.ok(
          WAVE_CLIP_BOX.x + WAVE_CLIP_BOX.w - 1 - f.bbox[2] >= MIN_MARGIN_PX,
          `frame ${f.i}: right margin ${WAVE_CLIP_BOX.x + WAVE_CLIP_BOX.w - 1 - f.bbox[2]}`,
        );
      }
    });
  }

  it("the hold is the intro's last frame (1126 f98, first curved smile): nothing past it exists", () => {
    const h = manifest.hold;
    assert.equal(h.file, WAVE_HOLD_FILE);
    const sha = createHash("sha256").update(readFileSync(join(root, "public", h.file))).digest("hex");
    assert.equal(h.sha256, sha, "manifest was generated from the shipped hold");
    assert.equal(WAVE_IN_CLIP.frames, 99, "intro is f0..f98");
    const last = manifest.clips[WAVE_IN_CLIP.file]!.frame_edges[WAVE_IN_CLIP.frames - 1]!;
    assert.equal(last.i, 98);
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(h.bbox[k]! - last.bbox[k]!) <= 1, `hold bbox ${h.bbox} vs f98 ${last.bbox}`);
    assert.ok(h.alpha_mean_abs_diff_vs_intro_last < 1, `hold alpha vs decoded f98: ${h.alpha_mean_abs_diff_vs_intro_last}`);
    assert.equal(h.outside_band_alpha_max, 0, "hold has nothing outside the wave band");
  });
});
