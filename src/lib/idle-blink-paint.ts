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
