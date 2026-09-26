/**
 * Rest-idle blink paint.
 *
 * One canvas holds idle.png for the whole blink. The full sheet is drawn once
 * when that canvas mounts and when the bitmap is ready. Blink frames only
 * paste one opaque patch into DEST_RECT — never a second full figure, never a clear.
 */
import { IDLE_BLINK_CANVAS, IDLE_BLINK_DEST_RECT } from "./rai.ts";

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
 * The dest paste is omitted until the body is on the canvas. A 300×150 default
 * bitmap cannot take DEST_RECT (424, 193, 196×57).
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
  globalCompositeOperation: string;
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
  ctx.globalCompositeOperation = "source-over";
  draw();
  ctx.restore();
}

/** One full idle.png. Call once per canvas, after the bitmap is 1008×1792. */
export function drawIdleBody(ctx: DrawImageCtx, image: CanvasImageSource): void {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
}

/**
 * Opaque TyLo patch → DEST_RECT. Source is the patch's own pixels, not a full plate.
 * Caller restores the idle dest rect first so the paste lands on idle.png.
 */
export function drawEyeRect(
  ctx: DrawImageCtx,
  crop: CanvasImageSource,
  hole: { x: number; y: number; w: number; h: number },
): void {
  clipHole(ctx, hole, () => {
    ctx.drawImage(crop, 0, 0, hole.w, hole.h, hole.x, hole.y, hole.w, hole.h);
  });
}

/** Dest rect back from the same idle.png. Source rect only — not a second full draw. */
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
 * Run a plan. Body is one drawImage(idle, 0, 0). A lid step pastes one patch
 * into DEST_RECT after copying that rect back from idle.png. Returns how many
 * drawImage calls landed.
 */
export function applyIdleCanvasPlan(
  plan: readonly IdleCanvasDraw[],
  ctx: DrawImageCtx,
  images: {
    idle: CanvasImageSource;
    lid: CanvasImageSource | null;
  },
): number {
  let draws = 0;
  const hole = IDLE_BLINK_DEST_RECT;
  for (const step of plan) {
    if (step.kind === "body") {
      drawIdleBody(ctx, images.idle);
      draws += 1;
      continue;
    }
    if (step.mode === "glare") {
      drawGlareEyeRect(ctx, images.idle, hole);
      draws += 1;
      continue;
    }
    if (!images.lid) continue;
    // Paste onto idle pixels in the dest rect, not onto the previous patch.
    drawGlareEyeRect(ctx, images.idle, hole);
    drawEyeRect(ctx, images.lid, hole);
    draws += 2;
  }
  return draws;
}

/**
 * Source-over one dest rect onto an idle bitmap. Touches only x..x+w, y..y+h.
 * Opaque TyLo patches replace those pixels. Callers must not clear the
 * destination. Pixels outside the rect stay put.
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
  for (let row = 0; row < h; row++) {
    const d = ((y + row) * destWidth + x) * 4;
    const s = row * w * 4;
    for (let col = 0; col < w; col++) {
      const si = s + col * 4;
      const di = d + col * 4;
      const sa = pixels[si + 3]! / 255;
      const da = dest[di + 3]! / 255;
      const outA = sa + da * (1 - sa);
      if (outA === 0) {
        dest[di] = 0;
        dest[di + 1] = 0;
        dest[di + 2] = 0;
        dest[di + 3] = 0;
        continue;
      }
      const inv = 1 - sa;
      dest[di] = Math.round((pixels[si]! * sa + dest[di]! * da * inv) / outA);
      dest[di + 1] = Math.round((pixels[si + 1]! * sa + dest[di + 1]! * da * inv) / outA);
      dest[di + 2] = Math.round((pixels[si + 2]! * sa + dest[di + 2]! * da * inv) / outA);
      dest[di + 3] = Math.round(outA * 255);
    }
  }
}
