/**
 * Official pose sheets are RGB on a studio-white card. mix-blend multiply
 * failed on the live 3D rig (Android still showed a white plate). Flood-fill
 * connected backdrop from the edges so the shirt's shaded white stays.
 */

export const STUDIO_LUMA_MIN = 244;
export const STUDIO_CHROMA_MAX = 16;
const FRINGE_LUMA_MIN = 228;
const FRINGE_CHROMA_MAX = 24;

export function isStudioWhite(r: number, g: number, b: number, a = 255): boolean {
  if (a < 8) return false;
  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  return min >= STUDIO_LUMA_MIN && max - min <= STUDIO_CHROMA_MAX;
}

/** In-place: punch connected studio-white to alpha 0. */
export function punchStudioWhite(data: Uint8ClampedArray, width: number, height: number): void {
  if (width <= 0 || height <= 0) return;
  const n = width * height;
  if (data.length < n * 4) return;

  const seen = new Uint8Array(n);
  const stack: number[] = [];

  const tryPush = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (seen[i]) return;
    const o = i * 4;
    if (!isStudioWhite(data[o]!, data[o + 1]!, data[o + 2]!, data[o + 3]!)) return;
    seen[i] = 1;
    stack.push(i);
  };

  for (let x = 0; x < width; x++) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (stack.length) {
    const i = stack.pop()!;
    const o = i * 4;
    data[o] = 0;
    data[o + 1] = 0;
    data[o + 2] = 0;
    data[o + 3] = 0;
    const x = i % width;
    const y = (i / width) | 0;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      const a = data[o + 3]!;
      if (a === 0) continue;
      const r = data[o]!;
      const g = data[o + 1]!;
      const b = data[o + 2]!;
      const max = r > g ? (r > b ? r : b) : g > b ? g : b;
      const min = r < g ? (r < b ? r : b) : g < b ? g : b;
      if (min < FRINGE_LUMA_MIN || max - min > FRINGE_CHROMA_MAX) continue;
      const neighborClear =
        (x > 0 && data[(i - 1) * 4 + 3] === 0) ||
        (x < width - 1 && data[(i + 1) * 4 + 3] === 0) ||
        (y > 0 && data[(i - width) * 4 + 3] === 0) ||
        (y < height - 1 && data[(i + width) * 4 + 3] === 0);
      if (!neighborClear) continue;
      const t = (min - FRINGE_LUMA_MIN) / (255 - FRINGE_LUMA_MIN);
      data[o + 3] = Math.round(a * (1 - Math.min(1, Math.max(0, t))));
    }
  }
}

const punchedCache = new Map<string, Promise<string>>();

async function punchSrc(src: string): Promise<string> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return src;
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  punchStudioWhite(image.data, canvas.width, canvas.height);
  ctx.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
  if (!blob) return src;
  return URL.createObjectURL(blob);
}

/** Decode a sprite and return an object URL with the studio card punched out. */
export function punchedSpriteUrl(src: string): Promise<string> {
  const hit = punchedCache.get(src);
  if (hit) return hit;
  const job = punchSrc(src).catch(() => src);
  punchedCache.set(src, job);
  return job;
}
