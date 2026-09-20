import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStudioWhite, punchStudioWhite, STUDIO_LUMA_MIN } from "./punch-white.ts";

function px(w: number, h: number, fill: [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = fill[3];
  }
  return data;
}

function set(data: Uint8ClampedArray, w: number, x: number, y: number, c: [number, number, number, number]) {
  const o = (y * w + x) * 4;
  data[o] = c[0];
  data[o + 1] = c[1];
  data[o + 2] = c[2];
  data[o + 3] = c[3];
}

function getA(data: Uint8ClampedArray, w: number, x: number, y: number): number {
  return data[(y * w + x) * 4 + 3]!;
}

function getRgb(data: Uint8ClampedArray, w: number, x: number, y: number): [number, number, number] {
  const o = (y * w + x) * 4;
  return [data[o]!, data[o + 1]!, data[o + 2]!];
}

describe("punchStudioWhite", () => {
  it("treats official-pack studio fill as punchable and shaded shirt as not", () => {
    assert.equal(isStudioWhite(255, 255, 255), true);
    assert.equal(isStudioWhite(244, 244, 246), true);
    assert.equal(isStudioWhite(238, 238, 240), true);
    assert.equal(isStudioWhite(223, 220, 228), false);
    assert.equal(isStudioWhite(220, 211, 206), false);
    assert.ok(223 < STUDIO_LUMA_MIN);
  });

  it("clears the connected white card from the edges", () => {
    const w = 12;
    const h = 12;
    const data = px(w, h, [255, 255, 255, 255]);
    // body (shaded, not studio)
    for (let y = 3; y <= 8; y++) {
      for (let x = 4; x <= 7; x++) set(data, w, x, y, [223, 220, 228, 255]);
    }
    punchStudioWhite(data, w, h);
    assert.equal(getA(data, w, 0, 0), 0);
    assert.equal(getA(data, w, 11, 11), 0);
    assert.equal(getA(data, w, 1, 6), 0);
    assert.deepEqual(getRgb(data, w, 5, 5), [223, 220, 228]);
    assert.equal(getA(data, w, 5, 5), 255);
  });

  it("does not punch a white highlight trapped inside the figure", () => {
    const w = 10;
    const h = 10;
    const data = px(w, h, [255, 255, 255, 255]);
    for (let y = 2; y <= 7; y++) {
      for (let x = 2; x <= 7; x++) set(data, w, x, y, [40, 40, 50, 255]);
    }
    set(data, w, 4, 4, [255, 255, 255, 255]);
    punchStudioWhite(data, w, h);
    assert.equal(getA(data, w, 0, 0), 0);
    assert.equal(getA(data, w, 4, 4), 255);
    assert.deepEqual(getRgb(data, w, 4, 4), [255, 255, 255]);
  });

  it("punches white between the legs when it still touches the card", () => {
    const w = 9;
    const h = 10;
    const data = px(w, h, [255, 255, 255, 255]);
    // two legs, gap of studio white in the middle that connects below
    for (let y = 2; y <= 6; y++) {
      set(data, w, 2, y, [30, 30, 40, 255]);
      set(data, w, 3, y, [30, 30, 40, 255]);
      set(data, w, 5, y, [30, 30, 40, 255]);
      set(data, w, 6, y, [30, 30, 40, 255]);
    }
    punchStudioWhite(data, w, h);
    assert.equal(getA(data, w, 4, 4), 0);
    assert.equal(getA(data, w, 2, 4), 255);
    assert.equal(getA(data, w, 6, 4), 255);
  });
});
