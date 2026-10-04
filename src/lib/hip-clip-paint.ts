import { HIP_CLIP_CROP, HIP_CLIP_FRAMES } from "./hip-clip.ts";

/** Paint picture `index` of the hip clip: cropped bitmap placed in the 720x1280 sheet space. */
export function paintHipPicture(canvas: HTMLCanvasElement | null, bitmap: ImageBitmap | undefined, index: number): void {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !bitmap || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, HIP_CLIP_CROP.x, HIP_CLIP_CROP.y);
  canvas.dataset.raiSheet = `clip-${String(index).padStart(2, "0")}`;
  canvas.dataset.raiClipSource = String(HIP_CLIP_FRAMES[index]?.source ?? "");
}

