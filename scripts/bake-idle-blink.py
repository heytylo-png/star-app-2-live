#!/usr/bin/env python3
"""Bake rest-idle blink frames: one idle.png body, two eye holes per lid step.

Source of truth for the hole rects is this script. Keep src/lib/rai.ts
IDLE_BLINK_EYE_HOLES in sync.

Reads public/rai/idle.png (live glare, 1008×1792) and the registered lid
sheets. TyLo 782 / 783 are bake inputs (public/rai/blink-frames/ or
IDLE_BLINK_CLOSING / IDLE_BLINK_HALF). Do not commit those full sheets and
do not mount them. Only the two eye holes are pasted. Outside those rects
RGB matches idle (max delta 0) and alpha is 0. The runtime mounts the
per-eye crops — never a full sheet, and never 782/783 as idle.

Seven steps, about two frames each: open (idle) → closing (782) → half (783)
→ closed (existing angry lids) → half → closing → open.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IDLE_PATH = ROOT / "public/rai/idle.png"
# Closed-lid source. The shipped plate is already eye-hole-only; re-pasting
# those holes is idempotent. Pass the original angry sheet via IDLE_BLINK_SOURCE
# if re-baking from a backup.
LID_PATH = Path(os.environ.get("IDLE_BLINK_SOURCE", ROOT / "public/rai/idle_blink.png"))
CLOSING_PATH = Path(
    os.environ.get(
        "IDLE_BLINK_CLOSING",
        ROOT / "public/rai/blink-frames/blink-02-closing.jpg",
    )
)
HALF_PATH = Path(
    os.environ.get(
        "IDLE_BLINK_HALF",
        ROOT / "public/rai/blink-frames/blink-03-half.jpg",
    )
)

CANVAS = (1008, 1792)

# Same x,y,w,h on glare and on every registered lid sheet.
# Tight on the lids: bangs above y=208, mouth, and collar stay outside.
EYE_HOLES = (
    (434, 208, 80, 28),  # left
    (514, 208, 98, 30),  # right
)

# Real lid drawings pasted into the holes. Not blends of open and closed.
# 01 = closing (782), 02 = half (783), idle_blink = closed hold.
STEPS = (
    ("idle_blink_01.png", CLOSING_PATH),
    ("idle_blink_02.png", HALF_PATH),
    ("idle_blink.png", LID_PATH),
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


def paste_eyes(idle: np.ndarray, lid: np.ndarray) -> np.ndarray:
    """Idle body everywhere. Lid pixels only inside the two eye holes."""
    out = np.zeros((idle.shape[0], idle.shape[1], 4), dtype=np.uint8)
    out[:, :, :3] = idle
    # Alpha stays 0 outside the holes so a full-canvas overlay cannot cover the body.
    for x, y, w, h in EYE_HOLES:
        out[y : y + h, x : x + w, :3] = lid[y : y + h, x : x + w]
        out[y : y + h, x : x + w, 3] = 255
    return out


def hole_mask(shape: tuple[int, int]) -> np.ndarray:
    holes = np.zeros(shape, dtype=bool)
    for x, y, w, h in EYE_HOLES:
        holes[y : y + h, x : x + w] = True
    return holes


def main() -> None:
    idle_img = Image.open(IDLE_PATH).convert("RGB")
    if idle_img.size != CANVAS:
        raise SystemExit(f"live idle is {idle_img.size}, expected {CANVAS}")
    idle = np.asarray(idle_img)
    out_dir = ROOT / "public/rai"
    holes = hole_mask(idle.shape[:2])
    written: list[np.ndarray] = []
    for name, src in STEPS:
        if not src.is_file():
            raise SystemExit(f"missing lid sheet {src}")
        lid_img = register(Image.open(src), CANVAS)
        lid = np.asarray(lid_img)
        frame = paste_eyes(idle, lid)
        rgb = frame[:, :, :3].astype(np.int16)
        alpha = frame[:, :, 3]
        outside = ~holes
        delta = np.abs(rgb - idle.astype(np.int16)).max(axis=2)
        if int(delta[outside].max()) != 0:
            raise SystemExit(f"{name} RGB drifted outside eye holes")
        if int(alpha[outside].max()) != 0:
            raise SystemExit(f"{name} alpha leaked outside eye holes")
        if int(delta[holes].max()) == 0:
            raise SystemExit(f"{name} did not change the eyes")
        # Source holes must land unchanged — a blend would not match the sheet.
        src_delta = np.abs(rgb - lid.astype(np.int16)).max(axis=2)
        if int(src_delta[holes].max()) != 0:
            raise SystemExit(f"{name} eye holes do not match {src.name}")
        Image.fromarray(frame, "RGBA").save(out_dir / name, optimize=True)
        hole_mean = float(delta[holes].mean())
        print(
            f"wrote {name} from {src.name} outside_max={int(delta[outside].max())} "
            f"hole_max={int(delta[holes].max())} hole_mean={hole_mean:.1f}"
        )
        written.append(rgb)
        # Runtime mounts these crops only — never the full plate or the jpg.
        for (x, y, w, h), tag in zip(EYE_HOLES, ("l", "r"), strict=True):
            crop = frame[y : y + h, x : x + w]
            if crop.shape[1] != w or crop.shape[0] != h:
                raise SystemExit(f"{name} crop {tag} is {crop.shape}")
            if int(crop[:, :, 3].min()) != 255:
                raise SystemExit(f"{name} crop {tag} is not opaque")
            crop_name = name.replace(".png", f"_{tag}.png")
            Image.fromarray(crop, "RGBA").save(out_dir / crop_name, optimize=True)
            print(f"  crop {crop_name} {w}x{h}")
    # Closing, half, and closed must be three different drawings.
    for i, j in ((0, 1), (0, 2), (1, 2)):
        diff = np.abs(written[i] - written[j]).max(axis=2)
        if int(diff[holes].max()) == 0:
            raise SystemExit(f"{STEPS[i][0]} and {STEPS[j][0]} share the same eyelids")
        print(f"distinct {STEPS[i][0]} vs {STEPS[j][0]} hole_mean={float(diff[holes].mean()):.1f}")


if __name__ == "__main__":
    main()
