import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sheetBox } from "./rai-sheet-box.ts";

const onGrid = (v: number, dpr: number) => Math.abs(v * dpr - Math.round(v * dpr)) < 1e-6;

describe("PNG sheet box (sharpness)", () => {
  it("lands the zoomed sheet on whole device pixels within half a pixel of the old scale()", () => {
    for (const dpr of [1, 2, 2.625, 3, 3.5]) {
      for (const [vw, rigH] of [[412, 743.8], [384, 697.3], [390, 700.13]]) {
        const rigW = vw * 1.04;
        const originX = -vw * 0.02;
        const originY = 55.2;
        const b = sheetBox({ originX, originY, rigW, rigH, zoom: 1.08, topFrac: 0.0125, dpr });
        for (const edge of [originX + b.x, originY + b.y, originX + b.x + b.w, originY + b.y + b.h]) {
          assert.ok(onGrid(edge, dpr), `edge ${edge} @${dpr}`);
        }
        const old = { x: (rigW - rigW * 1.08) / 2, y: 0.0125 * rigH, w: rigW * 1.08, h: rigH * 1.08 };
        const tol = 0.5 / dpr + 1e-9;
        assert.ok(Math.abs(b.x - old.x) <= tol && Math.abs(b.y - old.y) <= tol, "left/top within half a device px");
        assert.ok(Math.abs(b.x + b.w - (old.x + old.w)) <= tol, "right edge within half a device px");
        assert.ok(Math.abs(b.y + b.h - (old.y + old.h)) <= tol, "bottom edge within half a device px");
      }
    }
  });
});
