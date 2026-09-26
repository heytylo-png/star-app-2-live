#!/usr/bin/env python3
"""Retired L/R oval baker.

Source of truth is artifacts/star-rai-blink-frames/tylo-holes/.
DEST_RECT on public/rai/idle.png is (424, 193, 196, 57).
Do not bake the old 80×40 ovals back into the runtime.

Reads public/rai/idle.png (live glare, 1008×1792) and the closed-lid sheet.
If the lid source is not already on that canvas (e.g. 720×1280), it is scaled
to fit and letterboxed. Only the two eye holes are pasted. Outside those rects
RGB matches idle (max delta 0) and alpha is 0. The runtime mounts the per-eye
crops written next to each plate — never the full plate as a second image.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IDLE_PATH = ROOT / "public/rai/idle.png"
# Closed-lid source is read before we overwrite public/rai/idle_blink.png.
# Pass the original sheet via IDLE_BLINK_SOURCE if re-baking from a backup.
LID_PATH = Path(
    __import__("os").environ.get("IDLE_BLINK_SOURCE", ROOT / "public/rai/idle_blink.png")
)

CANVAS = (1008, 1792)

# Same x,y,w,h as IDLE_BLINK_EYE_HOLES. Both 80×40 — the old right rect
# was wider and ate the ear. Bangs above y=202, mouth, and collar stay outside.
# Shipped files are the v4 RGBA soft ellipses. Re-running this bake overwrites
# them with an opaque mix; do not run it over those crops.
EYE_HOLES = (
    (432, 202, 80, 40),  # left
    (508, 202, 80, 40),  # right
)

# Partial closes are mixes of glare and official closed lids — not drawn lids.
FRAMES = (
    ("idle_blink_01.png", 0.40),
    ("idle_blink_02.png", 0.75),
    ("idle_blink.png", 1.00),
)


def register(lid: Image.Image, canvas: tuple[int, int]) -> Image.Image:
    if lid.size == canvas:
        return lid.convert("RGB")
    tw, th = canvas
    sw, sh = lid.size
    scale = min(tw / sw, th / sh)
    nw = max(1, int(round(sw * scale)))
    nh = max(1, int(round(sh * scale)))
    resized = lid.convert("RGB").resize((nw, nh), Image.Resampling.LANCZOS)
    plate = Image.new("RGB", canvas, (255, 255, 255))
    plate.paste(resized, ((tw - nw) // 2, (th - nh) // 2))
    return plate


def bake(idle: np.ndarray, lid: np.ndarray, t: float) -> np.ndarray:
    out = np.zeros((idle.shape[0], idle.shape[1], 4), dtype=np.uint8)
    out[:, :, :3] = idle
    # Alpha stays 0 outside the holes so a full-canvas overlay cannot cover the body.
    for x, y, w, h in EYE_HOLES:
        eye_i = idle[y : y + h, x : x + w].astype(np.float32)
        eye_b = lid[y : y + h, x : x + w].astype(np.float32)
        mixed = np.clip(np.rint(eye_i * (1.0 - t) + eye_b * t), 0, 255).astype(np.uint8)
        out[y : y + h, x : x + w, :3] = mixed
        out[y : y + h, x : x + w, 3] = 255
    return out


def main() -> None:
    raise SystemExit(
        "Retired. Paste artifacts/star-rai-blink-frames/tylo-holes/ "
        "at DEST_RECT (424, 193, 196, 57) on idle.png. "
        "Do not bake L/R 80×40 ovals."
    )


if __name__ == "__main__":
    main()
