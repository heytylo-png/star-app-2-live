import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyIdleCanvasPlan,
  BROWSER_DEFAULT_CANVAS,
  drawEyeRect,
  drawGlareEyeRect,
  drawIdleBody,
  eyeRectFitsCanvas,
  planIdleCanvasDraws,
  type IdleCanvasDraw,
} from "./idle-blink-paint.ts";
import { IDLE_BLINK_CANVAS, IDLE_BLINK_DEST_RECT } from "./rai.ts";

const mountedReady = {
  canvasMounted: true,
  idleReady: true,
  bodyPainted: false,
  canvasWidth: BROWSER_DEFAULT_CANVAS.width,
  canvasHeight: BROWSER_DEFAULT_CANVAS.height,
  blink: 0,
  eyesReady: true,
  lidsOnCanvas: false,
  allowLids: true,
};

function plan(over: Partial<typeof mountedReady> = {}): IdleCanvasDraw[] {
  return planIdleCanvasDraws({ ...mountedReady, ...over });
}

describe("planIdleCanvasDraws", () => {
  it("draws idle.png once when the canvas mounts, before any blink", () => {
    assert.deepEqual(plan(), [{ kind: "body" }]);
    assert.deepEqual(
      plan({
        canvasWidth: IDLE_BLINK_CANVAS.width,
        canvasHeight: IDLE_BLINK_CANVAS.height,
      }),
      [{ kind: "body" }],
    );
  });

  it("does not wait for the blink timer to paint the body", () => {
    assert.deepEqual(plan({ eyesReady: true, blink: 0 }), [{ kind: "body" }]);
    assert.deepEqual(plan({ eyesReady: false, blink: 0 }), [{ kind: "body" }]);
  });

  it("does not redraw the full sheet once the body is on the canvas", () => {
    assert.deepEqual(
      plan({
        bodyPainted: true,
        canvasWidth: IDLE_BLINK_CANVAS.width,
        canvasHeight: IDLE_BLINK_CANVAS.height,
        blink: 0,
      }),
      [],
    );
  });

  it("blink only schedules the dest rect", () => {
    assert.deepEqual(
      plan({
        bodyPainted: true,
        canvasWidth: IDLE_BLINK_CANVAS.width,
        canvasHeight: IDLE_BLINK_CANVAS.height,
        blink: 3,
      }),
      [{ kind: "eyes", mode: "lid" }],
    );
  });

  it("restores glare eyes from the idle sheet rects, not a second full draw", () => {
    assert.deepEqual(
      plan({
        bodyPainted: true,
        canvasWidth: IDLE_BLINK_CANVAS.width,
        canvasHeight: IDLE_BLINK_CANVAS.height,
        blink: 0,
        lidsOnCanvas: true,
      }),
      [{ kind: "eyes", mode: "glare" }],
    );
  });

  it("does not draw lids onto an empty default canvas", () => {
    assert.deepEqual(
      plan({
        canvasMounted: true,
        idleReady: false,
        bodyPainted: false,
        blink: 3,
      }),
      [],
    );
    assert.deepEqual(plan({ canvasMounted: false, blink: 3, bodyPainted: false }), []);
  });

  it("paints the body before lids when mount was missed and a blink frame arrives", () => {
    assert.deepEqual(plan({ blink: 3, eyesReady: true }), [
      { kind: "body" },
      { kind: "eyes", mode: "lid" },
    ]);
  });

  it("keeps DEST_RECT outside 300×150 and inside the idle bitmap", () => {
    assert.equal(eyeRectFitsCanvas(IDLE_BLINK_DEST_RECT, BROWSER_DEFAULT_CANVAS), false);
    assert.equal(eyeRectFitsCanvas(IDLE_BLINK_DEST_RECT, IDLE_BLINK_CANVAS), true);
    assert.deepEqual(IDLE_BLINK_DEST_RECT, { x: 424, y: 193, w: 196, h: 57 });
  });
});

function fakeCtx(calls: unknown[][]) {
  return {
    imageSmoothingEnabled: true,
    globalCompositeOperation: "source-over",
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    drawImage(...args: unknown[]) {
      calls.push(args);
    },
  };
}

describe("idle canvas drawImage", () => {
  it("draws the full idle sheet once and one patch at DEST_RECT", () => {
    const calls: unknown[][] = [];
    const ctx = fakeCtx(calls);
    const idle = { name: "idle" };
    const patch = { name: "02-open" };
    const draws = applyIdleCanvasPlan(
      [
        { kind: "body" },
        { kind: "eyes", mode: "lid" },
      ],
      ctx,
      { idle: idle as CanvasImageSource, lid: patch as CanvasImageSource },
    );
    const hole = IDLE_BLINK_DEST_RECT;
    assert.equal(draws, 3);
    assert.deepEqual(calls[0], [idle, 0, 0]);
    assert.deepEqual(calls[1], [idle, hole.x, hole.y, hole.w, hole.h, hole.x, hole.y, hole.w, hole.h]);
    assert.deepEqual(calls[2], [patch, 0, 0, hole.w, hole.h, hole.x, hole.y, hole.w, hole.h]);
    assert.equal(
      calls.filter((args) => args.length === 3).length,
      1,
      "blink must not drawImage the full sheet again",
    );
  });

  it("puts the dest rect back from idle.png source rects only", () => {
    const calls: unknown[][] = [];
    const ctx = fakeCtx(calls);
    const idle = { name: "idle" };
    drawIdleBody(ctx, idle as CanvasImageSource);
    calls.length = 0;
    drawGlareEyeRect(ctx, idle as CanvasImageSource, IDLE_BLINK_DEST_RECT);
    drawEyeRect(ctx, { name: "patch" } as CanvasImageSource, IDLE_BLINK_DEST_RECT);
    const hole = IDLE_BLINK_DEST_RECT;
    assert.deepEqual(calls[0], [idle, hole.x, hole.y, hole.w, hole.h, hole.x, hole.y, hole.w, hole.h]);
    assert.equal(calls[1]?.[5], hole.x);
    assert.equal(calls[1]?.[6], hole.y);
    assert.equal(calls[1]?.[7], hole.w);
    assert.equal(calls[1]?.[8], hole.h);
    assert.ok(calls.every((args) => args.length === 9));
  });
});
