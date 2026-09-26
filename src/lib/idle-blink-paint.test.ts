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
import { IDLE_BLINK_CANVAS, IDLE_BLINK_EYE_HOLES } from "./rai.ts";

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

  it("blink only schedules the two eye rects", () => {
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

  it("keeps both eye holes outside 300×150 and inside the idle bitmap", () => {
    for (const hole of IDLE_BLINK_EYE_HOLES) {
      assert.equal(eyeRectFitsCanvas(hole, BROWSER_DEFAULT_CANVAS), false);
      assert.equal(eyeRectFitsCanvas(hole, IDLE_BLINK_CANVAS), true);
    }
    assert.deepEqual(IDLE_BLINK_EYE_HOLES[0], { x: 434, y: 208, w: 80, h: 28 });
    assert.deepEqual(IDLE_BLINK_EYE_HOLES[1], { x: 514, y: 208, w: 98, h: 30 });
  });
});

function fakeCtx(calls: unknown[][]) {
  return {
    imageSmoothingEnabled: true,
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
  it("draws the full idle sheet once and eye rects only at the holes", () => {
    const calls: unknown[][] = [];
    const ctx = fakeCtx(calls);
    const idle = { name: "idle" };
    const left = { name: "lid-l" };
    const right = { name: "lid-r" };
    const draws = applyIdleCanvasPlan(
      [
        { kind: "body" },
        { kind: "eyes", mode: "lid" },
      ],
      ctx,
      { idle: idle as CanvasImageSource, lids: [left, right] as unknown as [CanvasImageSource, CanvasImageSource] },
    );
    assert.equal(draws, 3);
    assert.deepEqual(calls[0], [idle, 0, 0]);
    assert.deepEqual(calls[1], [left, 0, 0, 80, 28, 434, 208, 80, 28]);
    assert.deepEqual(calls[2], [right, 0, 0, 98, 30, 514, 208, 98, 30]);
    assert.equal(
      calls.filter((args) => args.length === 3).length,
      1,
      "blink must not drawImage the full sheet again",
    );
  });

  it("puts glare eyes back from idle.png source rects only", () => {
    const calls: unknown[][] = [];
    const ctx = fakeCtx(calls);
    const idle = { name: "idle" };
    drawIdleBody(ctx, idle as CanvasImageSource);
    calls.length = 0;
    drawGlareEyeRect(ctx, idle as CanvasImageSource, IDLE_BLINK_EYE_HOLES[0]);
    drawEyeRect(ctx, { name: "crop" } as CanvasImageSource, IDLE_BLINK_EYE_HOLES[1]);
    assert.deepEqual(calls[0], [idle, 434, 208, 80, 28, 434, 208, 80, 28]);
    assert.equal(calls[1]?.[5], 514);
    assert.equal(calls[1]?.[6], 208);
    assert.ok(calls.every((args) => args.length === 9));
  });
});
