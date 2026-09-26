/**
 * Rest-idle blink composites closed lids onto the live idle.png body.
 *
 * idle_blink.png is a source plate only. After it is registered to the
 * 1008×1792 idle frame, the two eye rects are the only pixels copied.
 * Standing-body pixels live outside those rects and are never written.
 */

export const IDLE_PLATE_WIDTH = 1008;
export const IDLE_PLATE_HEIGHT = 1792;

export type EyeRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Left and right eyes on the registered plate.
 * Their union is the only region where idle_blink.png differs from idle.png.
 */
export const IDLE_EYE_RECTS: readonly EyeRect[] = [
  { x: 423, y: 210, width: 93, height: 109 },
  { x: 516, y: 210, width: 96, height: 109 },
];

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

export function eyeRectsFitPlate(
  width = IDLE_PLATE_WIDTH,
  height = IDLE_PLATE_HEIGHT,
): boolean {
  return IDLE_EYE_RECTS.every(
    (rect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.width <= width &&
      rect.y + rect.height <= height,
  );
}

/** True when (x, y) is inside one of the eye rects. */
export function isEyePixel(x: number, y: number): boolean {
  for (const rect of IDLE_EYE_RECTS) {
    if (x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height) {
      return true;
    }
  }
  return false;
}

/**
 * Closed-lid pixels for one eye rect. Does not allocate a full plate and
 * does not read blink samples outside the rect.
 */
export function eyeOverlayRect(
  blink: Uint8ClampedArray,
  plateWidth: number,
  rect: EyeRect,
  alpha: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  const a = clamp01(alpha);
  const stride = plateWidth * 4;
  for (let y = 0; y < rect.height; y++) {
    let si = (rect.y + y) * stride + rect.x * 4;
    let di = y * rect.width * 4;
    for (let x = 0; x < rect.width; x++) {
      out[di] = blink[si] ?? 0;
      out[di + 1] = blink[si + 1] ?? 0;
      out[di + 2] = blink[si + 2] ?? 0;
      out[di + 3] = Math.round((blink[si + 3] ?? 0) * a);
      si += 4;
      di += 4;
    }
  }
  return out;
}

/**
 * Copy closed lids onto `dest`. Pixels outside the eye rects are not written.
 * Returns false (and writes nothing) when the buffers are not the registered plate.
 */
export function applyEyeOverlay(
  dest: Uint8ClampedArray,
  width: number,
  height: number,
  blink: Uint8ClampedArray,
  alpha: number,
): boolean {
  if (width !== IDLE_PLATE_WIDTH || height !== IDLE_PLATE_HEIGHT) return false;
  if (!eyeRectsFitPlate(width, height)) return false;
  const need = width * height * 4;
  if (dest.length < need || blink.length < need) return false;

  for (const rect of IDLE_EYE_RECTS) {
    const patch = eyeOverlayRect(blink, width, rect, alpha);
    let p = 0;
    for (let y = 0; y < rect.height; y++) {
      let di = ((rect.y + y) * width + rect.x) * 4;
      for (let x = 0; x < rect.width; x++) {
        dest[di] = patch[p]!;
        dest[di + 1] = patch[p + 1]!;
        dest[di + 2] = patch[p + 2]!;
        dest[di + 3] = patch[p + 3]!;
        di += 4;
        p += 4;
      }
    }
  }
  return true;
}
