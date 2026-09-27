import { snapToDevicePx } from "./rai-motion.ts";

export type SheetBoxInput = {
  /** Rig's untransformed top-left in viewport CSS px (may be fractional). */
  originX: number;
  originY: number;
  /** Rig's used width/height in CSS px (may be fractional). */
  rigW: number;
  rigH: number;
  /** Long-shot zoom (--rai-long-shot*), crown-origin. */
  zoom: number;
  /** Crown drop as a fraction of rig height (0.0125 phone, 0.02 otherwise). */
  topFrac: number;
  dpr: number;
};

export type SheetBox = { x: number; y: number; w: number; h: number };

/**
 * The sheet box that `transform: scale(zoom)` from 50% 0% used to produce,
 * but as a real size and position whose edges sit on whole device pixels.
 * x/y are relative to the rig; w/h are the <img> box (object-fit: contain).
 * Snapping moves each edge by at most half a device pixel.
 */
export function sheetBox(i: SheetBoxInput): SheetBox {
  const zoom = Number.isFinite(i.zoom) && i.zoom > 0 ? i.zoom : 1;
  const halfW = (i.rigW * zoom) / 2;
  const cx = i.originX + i.rigW / 2;
  const top0 = i.originY + i.topFrac * i.rigH;
  // Snap each edge of the old scale() box on its own: every edge moves <= 0.5 device px.
  const left = snapToDevicePx(cx - halfW, i.dpr);
  const right = snapToDevicePx(cx + halfW, i.dpr);
  const top = snapToDevicePx(top0, i.dpr);
  const bottom = snapToDevicePx(top0 + i.rigH * zoom, i.dpr);
  return { x: left - i.originX, y: top - i.originY, w: right - left, h: bottom - top };
}
