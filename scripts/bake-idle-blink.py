#!/usr/bin/env python3
"""Bake rest-idle blink frames: glare body + two eye holes from the closed-lid sheet.

Source of truth for the hole rects is this script. Keep src/lib/rai.ts
IDLE_BLINK_EYE_HOLES in sync.

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

# Same x,y,w,h on glare and on the registered closed-lid sheet.
# Tight on the lids: bangs above y=208, mouth, and collar stay outside.
EYE_HOLES = (
    (434, 208, 80, 28),  # left
    (514, 208, 98, 30),  # right
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
    idle_img = Image.open(IDLE_PATH).convert("RGB")
    if idle_img.size != CANVAS:
        raise SystemExit(f"live idle is {idle_img.size}, expected {CANVAS}")
    lid_img = register(Image.open(LID_PATH), CANVAS)
    idle = np.asarray(idle_img)
    lid = np.asarray(lid_img)
    out_dir = ROOT / "public/rai"
    for name, t in FRAMES:
        frame = bake(idle, lid, t)
        rgb = frame[:, :, :3].astype(np.int16)
        alpha = frame[:, :, 3]
        holes = np.zeros(alpha.shape, dtype=bool)
        for x, y, w, h in EYE_HOLES:
            holes[y : y + h, x : x + w] = True
        outside = ~holes
        delta = np.abs(rgb - idle.astype(np.int16)).max(axis=2)
        if int(delta[outside].max()) != 0:
            raise SystemExit(f"{name} RGB drifted outside eye holes")
        if int(alpha[outside].max()) != 0:
            raise SystemExit(f"{name} alpha leaked outside eye holes")
        if t == 1.0 and int(delta[holes].max()) == 0:
            raise SystemExit(f"{name} closed frame did not change the eyes")
        Image.fromarray(frame, "RGBA").save(out_dir / name, optimize=True)
        print(f"wrote {name} mix={t} outside_max={int(delta[outside].max())} hole_max={int(delta[holes].max())}")
        # Runtime mounts these crops only — never the full plate.
        for (x, y, w, h), tag in zip(EYE_HOLES, ("l", "r"), strict=True):
            crop = frame[y : y + h, x : x + w]
            if crop.shape[1] != w or crop.shape[0] != h:
                raise SystemExit(f"{name} crop {tag} is {crop.shape}")
            if int(crop[:, :, 3].min()) != 255:
                raise SystemExit(f"{name} crop {tag} is not opaque")
            crop_name = name.replace(".png", f"_{tag}.png")
            Image.fromarray(crop, "RGBA").save(out_dir / crop_name, optimize=True)
            print(f"  crop {crop_name} {w}x{h}")


if __name__ == "__main__":
    main()
