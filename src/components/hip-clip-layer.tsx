import { forwardRef } from "react";
import { HIP_CLIP_SHEET } from "@/lib/hip-clip";

/**
 * The one visible image while the hip clip is up (live sheets are visibility:hidden then).
 * Same box, object-fit and rim as every sheet (.rai-layer); 720x1280 is the sheet space the
 * pictures were cropped from.
 */
export const HipClipLayer = forwardRef<HTMLCanvasElement, { visible: boolean }>(function HipClipLayer(
  { visible },
  ref,
) {
  return (
    <canvas
      ref={ref}
      width={HIP_CLIP_SHEET.w}
      height={HIP_CLIP_SHEET.h}
      aria-hidden="true"
      className="rai-layer"
      data-rai-role="clip"
      style={{ opacity: 1, zIndex: 60, transition: "none", visibility: visible ? "visible" : "hidden" }}
    />
  );
});
