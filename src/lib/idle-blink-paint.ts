/**
 * Rest-idle blink paint.
 *
 * One canvas holds idle.png for the whole blink. The full sheet is drawn once
 * when that canvas mounts and when the bitmap is ready. Blink frames only
 * drawImage the two eye rects — never a second full figure, never a clear.
 */
import { IDLE_BLINK_CANVAS, IDLE_BLINK_EYE_HOLES } from "./rai.ts";

/** What a fresh <canvas> uses before width/height are set. Eye holes sit outside it. */
export const BROWSER_DEFAULT_CANVAS = { width: 300, height: 150 } as const;

export type IdleCanvasDraw =
  | { kind: "body" }
  | { kind: "eyes"; mode: "lid" | "glare" };

export function eyeRectFitsCanvas(
  hole: { x: number; y: number; w: number; h: number },
  canvas: { width: number; height: number },
): boolean {
  return (
    hole.x >= 0 &&
    hole.y >= 0 &&
    hole.x + hole.w <= canvas.width &&
    hole.y + hole.h <= canvas.height
  );
}

export function idleCanvasBitmapReady(canvas: { width: number; height: number }): boolean {
  return canvas.width === IDLE_BLINK_CANVAS.width && canvas.height === IDLE_BLINK_CANVAS.height;
}

/**
 * Draw list for the single idle canvas.
 *
 * Full idle.png is scheduled when the canvas is mounted and the bitmap is
 * ready, and only if this canvas has not been painted yet. Blink does not
 * schedule that full draw again.
 *
 * Eye draws are omitted until the body is on the canvas. A 300×150 default
 * bitmap cannot take the holes (left 434,208 80×28; right 514,208 98×30).
 */
export function planIdleCanvasDraws(input: {
  canvasMounted: boolean;
  idleReady: boolean;
  bodyPainted: boolean;
  canvasWidth: number;
  canvasHeight: number;
  blink: number;
  eyesReady: boolean;
  /** A previous frame already replaced the glare eyes on this canvas. */
  lidsOnCanvas: boolean;
  /** Rest idle. Pose, talk, and emotion cancel lid draws. */
  allowLids: boolean;
}): IdleCanvasDraw[] {
  const out: IdleCanvasDraw[] = [];
  if (input.canvasMounted && input.idleReady && !input.bodyPainted) {
    out.push({ kind: "body" });
  }

  const bodyReady = input.bodyPainted || out.some((step) => step.kind === "body");
  const sized = idleCanvasBitmapReady({ width: input.canvasWidth, height: input.canvasHeight });
  // The body step sizes the canvas before any eye drawImage in the same pass.
  const canLand = input.canvasMounted && bodyReady && (sized || out.some((step) => step.kind === "body"));
  if (!canLand) return out;

  const showLids = input.allowLids && input.eyesReady && input.blink > 0;
  if (showLids) {
    out.push({ kind: "eyes", mode: "lid" });
    return out;
  }
  if (input.lidsOnCanvas) {
    out.push({ kind: "eyes", mode: "glare" });
  }
  return out;
}

type DrawImageCtx = {
  imageSmoothingEnabled: boolean;
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  drawImage(
    image: CanvasImageSource,
    dx: number,
    dy: number,
  ): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
};

/** Keep drawImage inside the hole so filtering cannot touch the idle body. */
function clipHole(
  ctx: DrawImageCtx,
  hole: { x: number; y: number; w: number; h: number },
  draw: () => void,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(hole.x, hole.y, hole.w, hole.h);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  draw();
  ctx.restore();
}

/** One full idle.png. Call once per canvas, after the bitmap is 1008×1792. */
export function drawIdleBody(ctx: DrawImageCtx, image: CanvasImageSource): void {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
}

/** Crop sheet → one eye hole. Source is the crop's own pixels, not the full plate. */
export function drawEyeRect(
  ctx: DrawImageCtx,
  crop: CanvasImageSource,
  hole: { x: number; y: number; w: number; h: number },
): void {
  clipHole(ctx, hole, () => {
    ctx.drawImage(crop, 0, 0, hole.w, hole.h, hole.x, hole.y, hole.w, hole.h);
  });
}

/** Glare eyes back from the same idle.png. Source rect only — not a second full draw. */
export function drawGlareEyeRect(
  ctx: DrawImageCtx,
  idle: CanvasImageSource,
  hole: { x: number; y: number; w: number; h: number },
): void {
  clipHole(ctx, hole, () => {
    ctx.drawImage(idle, hole.x, hole.y, hole.w, hole.h, hole.x, hole.y, hole.w, hole.h);
  });
}

/**
 * Run a plan. Body is one drawImage(idle, 0, 0). Eyes are the two holes only.
 * Returns how many drawImage calls landed.
 */
export function applyIdleCanvasPlan(
  plan: readonly IdleCanvasDraw[],
  ctx: DrawImageCtx,
  images: {
    idle: CanvasImageSource;
    lids: readonly [CanvasImageSource, CanvasImageSource] | null;
  },
): number {
  let draws = 0;
  for (const step of plan) {
    if (step.kind === "body") {
      drawIdleBody(ctx, images.idle);
      draws += 1;
      continue;
    }
    if (step.mode === "glare") {
      for (const hole of IDLE_BLINK_EYE_HOLES) {
        drawGlareEyeRect(ctx, images.idle, hole);
        draws += 1;
      }
      continue;
    }
    if (!images.lids) continue;
    IDLE_BLINK_EYE_HOLES.forEach((hole, index) => {
      const crop = images.lids?.[index];
      if (!crop) return;
      drawEyeRect(ctx, crop, hole);
      draws += 1;
    });
  }
  return draws;
}

/**
 * Copy one eye-rect into an idle bitmap. Touches only x..x+w, y..y+h.
 * Callers must not clear the destination. Pixels outside the rect stay put.
 */
export function copyEyeRect(
  dest: Uint8ClampedArray,
  destWidth: number,
  pixels: Uint8ClampedArray,
  hole: { x: number; y: number; w: number; h: number },
): void {
  const { x, y, w, h } = hole;
  if (w <= 0 || h <= 0) throw new Error("eye rect is empty");
  if (pixels.length !== w * h * 4) throw new Error("eye rect pixel count");
  const rowBytes = w * 4;
  for (let row = 0; row < h; row++) {
    const d = ((y + row) * destWidth + x) * 4;
    const s = row * rowBytes;
    dest.set(pixels.subarray(s, s + rowBytes), d);
  }
}
