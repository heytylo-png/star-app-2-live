#!/usr/bin/env python3
"""Rebake the four full-frame idle blink sheets onto public/rai/idle.png.

Eyes only. Every pixel outside the documented eye box is copied from idle.png.
Frame 01 is a byte copy of idle.png. Does not enable runtime blink.

Lid paint is the TyLo v2 eye-band art (791 half, 789 closed), sampled only
inside the idle eye sockets. Those patches are not stamped as full sheets.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IDLE_PATH = ROOT / "public/rai/idle.png"
BAKED = ROOT / "artifacts/star-rai-blink-frames/baked"
PUBLIC = ROOT / "public/rai"

# Generous box around both idle eye sockets. Documented in the baked README.
# Every pixel outside this box must match idle.png exactly.
EYE_BOX = (420, 185, 210, 70)  # x, y, w, h

FRAMES = (
    "idle_blink_01_open.png",
    "idle_blink_02_closing.png",
    "idle_blink_03_half.png",
    "idle_blink_04_closed.png",
)

# Closing lid covers this fraction of each socket column (top → down).
CLOSING_FRAC = 0.48


def dilate(mask: np.ndarray, rad: int) -> np.ndarray:
    out = mask.copy()
    ys, xs = np.where(mask)
    h, w = mask.shape
    for y, x in zip(ys.tolist(), xs.tolist()):
        y1 = y - rad if y - rad > 0 else 0
        y2 = y + rad + 1 if y + rad + 1 < h else h
        x1 = x - rad if x - rad > 0 else 0
        x2 = x + rad + 1 if x + rad + 1 < w else w
        out[y1:y2, x1:x2] = True
    return out


def erode(mask: np.ndarray, rad: int) -> np.ndarray:
    """Erode inside the mask's own bbox so the inverse is not the full frame."""
    ys, xs = np.where(mask)
    out = np.zeros_like(mask)
    if ys.size == 0:
        return out
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    sub = mask[y0:y1, x0:x1]
    grown = dilate(~sub, rad)
    out[y0:y1, x0:x1] = sub & ~grown
    return out


def eye_socket_mask(idle: np.ndarray) -> np.ndarray:
    """Almonds around idle's catchlights and the iris sitting on them."""
    r = idle[:, :, 0].astype(np.int16)
    g = idle[:, :, 1].astype(np.int16)
    b = idle[:, :, 2].astype(np.int16)
    white = (r > 240) & (g > 230) & (b > 215)
    white[:200, :] = False
    white[245:, :] = False
    white[:, :430] = False
    white[:, 620:] = False
    near = dilate(white, 12)
    iris = (
        (r > 160)
        & (r < 225)
        & (g > 50)
        & (g < 140)
        & (b < 85)
        & ((r - b) > 95)
        & ((r - g) > 40)
        & near
    )
    iris[:205, :] = False
    iris[236:, :] = False
    iris[:, :440] = False
    iris[:, 610:] = False
    seed = white | iris
    cols = seed.sum(axis=0)
    for x in range(seed.shape[1]):
        if 0 < int(cols[x]) < 3:
            seed[:, x] = False
    left = np.zeros_like(seed)
    right = np.zeros_like(seed)
    left[:, 440:515] = seed[:, 440:515]
    right[:, 515:610] = seed[:, 515:610]
    left = dilate(left, 5)
    right = dilate(right, 5)
    left[:, 515:] = False
    right[:, :515] = False
    left[:196, :] = False
    left[238:, :] = False
    right[:196, :] = False
    right[240:, :] = False
    return left | right


def load_band(path: Path, idle: np.ndarray) -> np.ndarray:
    """Place a 196×57 eye-band patch on a copy of idle. Outside the band, idle."""
    patch = np.array(Image.open(path).convert("RGB"))
    if patch.shape[0] != 57 or patch.shape[1] != 196:
        raise SystemExit(f"{path} is {patch.shape[1]}×{patch.shape[0]}, expected 196×57")
    out = idle.copy()
    out[193:250, 424:620] = patch
    return out


def blend_into(dst: np.ndarray, src: np.ndarray, mask: np.ndarray, weight: int) -> None:
    """weight 0..255. 255 copies src exactly. Only touches mask pixels."""
    if weight <= 0:
        return
    if weight >= 255:
        dst[mask] = src[mask]
        return
    s = src[mask].astype(np.uint16)
    d = dst[mask].astype(np.uint16)
    dst[mask] = ((s * weight + d * (255 - weight) + 127) // 255).astype(np.uint8)


def paint_socket(idle: np.ndarray, src: np.ndarray, mask: np.ndarray, partial: float | None) -> np.ndarray:
    """Copy src into the sockets. Optional top-fraction for the closing frame.

    The outer two pixels of the socket ease back to idle so the lid does not
    leave a hard skin seam. The interior (lash line, iris cover) stays solid.
    """
    out = idle.copy()
    inner = erode(mask, 2)
    ring2 = erode(mask, 1) & ~inner
    ring1 = mask & ~erode(mask, 1)
    layers = ((inner, 255), (ring2, 200), (ring1, 110))

    if partial is None:
        for sel, weight in layers:
            blend_into(out, src, sel, weight)
        return out

    height, width = mask.shape
    cut_at = np.full(width, -1, np.int32)
    for x in range(width):
        ys = np.where(mask[:, x])[0]
        if ys.size < 3:
            continue
        y0 = int(ys.min())
        y1 = int(ys.max())
        cut_at[x] = y0 + max(1, int(round(partial * (y1 - y0 + 1))))

    for sel, weight in layers:
        chosen = np.zeros_like(sel)
        ys, xs = np.where(sel)
        for y, x in zip(ys.tolist(), xs.tolist()):
            cut = int(cut_at[x])
            if cut >= 0 and y <= cut:
                chosen[y, x] = True
        blend_into(out, src, chosen, weight)

    # Soft leading edge of the descending lid, interior of the socket only.
    for x in range(width):
        cut = int(cut_at[x])
        if cut < 0:
            continue
        for dy, weight in ((1, 165), (2, 80)):
            y = cut + dy
            if 0 <= y < height and inner[y, x]:
                out[y, x] = (
                    (
                        src[y, x].astype(np.uint16) * weight
                        + idle[y, x].astype(np.uint16) * (255 - weight)
                        + 127
                    )
                    // 255
                ).astype(np.uint8)
    return out


def max_abs_outside(a: np.ndarray, b: np.ndarray, box: tuple[int, int, int, int]) -> int:
    x, y, w, h = box
    d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(axis=2)
    d[y : y + h, x : x + w] = 0
    return int(d.max())


def changed_bbox(a: np.ndarray, b: np.ndarray) -> tuple[int, int, int, int] | None:
    d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(axis=2)
    ys, xs = np.where(d > 0)
    if xs.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def save_rgb(path: Path, rgb: np.ndarray) -> None:
    Image.fromarray(rgb, mode="RGB").save(path, format="PNG", optimize=True)


def build_frames(idle: np.ndarray) -> dict[str, np.ndarray]:
    mask = eye_socket_mask(idle)
    half = load_band(ROOT / "artifacts/star-rai-blink-frames/tylo-holes-v2/791-half.png", idle)
    closed = load_band(ROOT / "artifacts/star-rai-blink-frames/tylo-holes-v2/789-closed.png", idle)
    return {
        "idle_blink_01_open.png": idle.copy(),
        "idle_blink_02_closing.png": paint_socket(idle, half, mask, CLOSING_FRAC),
        "idle_blink_03_half.png": paint_socket(idle, half, mask, None),
        "idle_blink_04_closed.png": paint_socket(idle, closed, mask, None),
    }


def write_standing_proof(idle: np.ndarray, frames: dict[str, np.ndarray]) -> None:
    """Full-body cycle gif plus a standing strip with a diff row.

    Holds are longer than the runtime dwells so 02 closing is obvious.
    The gif uses one palette and no dither: identical body pixels stay
    identical across frames. The diff row is computed from the PNG sheets.
    """
    order_names = [
        "idle_blink_01_open.png",
        "idle_blink_02_closing.png",
        "idle_blink_03_half.png",
        "idle_blink_04_closed.png",
        "idle_blink_03_half.png",
        "idle_blink_02_closing.png",
        "idle_blink_01_open.png",
    ]
    # Review holds. Runtime dwells stay 160/160/640/1000 in rai-motion.ts.
    durations = [400, 480, 720, 960, 720, 480, 400]
    order = [frames[name] for name in order_names]
    base = Image.fromarray(idle).quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    gif_frames = [
        Image.fromarray(im).quantize(palette=base, dither=Image.Dither.NONE) for im in order
    ]
    gif_path = BAKED / "proof_standing_full.gif"
    gif_frames[0].save(
        gif_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=durations,
        loop=0,
        disposal=1,
        optimize=False,
    )

    gif = Image.open(gif_path)
    gif.seek(0)
    ref = np.array(gif.convert("RGB"))
    x, y, w, h = EYE_BOX
    for index in range(1, gif.n_frames):
        gif.seek(index)
        arr = np.array(gif.convert("RGB"))
        outside = max_abs_outside(arr, ref, EYE_BOX)
        if outside != 0:
            raise SystemExit(f"standing gif frame {index} drifted outside the eye box (max {outside})")
    print(f"standing gif {gif.n_frames} frames {gif.size[0]}x{gif.size[1]} outside_max_vs_01=0")

    # Standing strip: idle | 01 | 02 | 03 | 04, then the same frames as a
    # diff against idle.png (red = any channel changed). Full body, not an eye crop.
    panels = [("idle", idle)] + [
        (label, frames[name])
        for label, name in (
            ("01", "idle_blink_01_open.png"),
            ("02", "idle_blink_02_closing.png"),
            ("03", "idle_blink_03_half.png"),
            ("04", "idle_blink_04_closed.png"),
        )
    ]
    target_h = 720
    scale = target_h / idle.shape[0]
    target_w = int(round(idle.shape[1] * scale))
    gap = 8
    label_h = 28
    from PIL import ImageDraw

    thumbs = []
    diffs = []
    for _, im in panels:
        thumb = Image.fromarray(im).resize((target_w, target_h), Image.Resampling.BOX)
        thumbs.append(thumb)
        delta = np.abs(im.astype(np.int16) - idle.astype(np.int16)).max(axis=2)
        heat = np.zeros_like(im)
        heat[delta > 0] = (220, 48, 48)
        diffs.append(Image.fromarray(heat).resize((target_w, target_h), Image.Resampling.BOX))

    sheet_w = len(thumbs) * target_w + (len(thumbs) - 1) * gap
    sheet_h = label_h + target_h + gap + label_h + target_h
    sheet = Image.new("RGB", (sheet_w, sheet_h), (28, 24, 32))
    draw = ImageDraw.Draw(sheet)
    captions = ["idle.png", "01 open", "02 closing", "03 half", "04 closed"]
    for i, thumb in enumerate(thumbs):
        x0 = i * (target_w + gap)
        draw.text((x0 + 8, 6), captions[i], fill=(236, 228, 214))
        sheet.paste(thumb, (x0, label_h))
        draw.text((x0 + 8, label_h + target_h + gap + 6), "diff vs idle", fill=(236, 228, 214))
        sheet.paste(diffs[i], (x0, label_h + target_h + gap + label_h))
    sheet.save(BAKED / "proof_standing_strip.png", format="PNG", optimize=True)
    print(f"standing strip {sheet.size[0]}x{sheet.size[1]}")


def write_proofs(idle: np.ndarray, frames: dict[str, np.ndarray]) -> None:
    # Face strip: idle | 01 | 02 | 03 | 04
    face = (360, 120, 700, 460)  # x0,y0,x1,y1
    panels = [("idle", idle)] + [(name[11:13], frames[name]) for name in FRAMES]
    crops = [Image.fromarray(im[face[1] : face[3], face[0] : face[2]]) for _, im in panels]
    gap = 8
    w, h = crops[0].size
    sheet = Image.new("RGB", (len(crops) * w + (len(crops) - 1) * gap, h), (28, 24, 32))
    for i, crop in enumerate(crops):
        sheet.paste(crop, (i * (w + gap), 0))
    sheet.save(BAKED / "proof_strip.png", format="PNG", optimize=True)

    # Eye band of 01–04, scaled so the lids read.
    ex, ey, ew, eh = EYE_BOX
    eyes = []
    for name in FRAMES:
        crop = Image.fromarray(frames[name][ey : ey + eh, ex : ex + ew])
        eyes.append(crop.resize((ew * 2, eh * 2), Image.Resampling.NEAREST))
    ew2, eh2 = eyes[0].size
    band = Image.new("RGB", (len(eyes) * ew2 + (len(eyes) - 1) * gap, eh2), (28, 24, 32))
    for i, crop in enumerate(eyes):
        band.paste(crop, (i * (ew2 + gap), 0))
    band.save(BAKED / "proof_eyes.png", format="PNG", optimize=True)

    # Standing cycle. One shared palette and no dither so identical body
    # pixels cannot shimmer between frames.
    order = [
        frames["idle_blink_01_open.png"],
        frames["idle_blink_02_closing.png"],
        frames["idle_blink_03_half.png"],
        frames["idle_blink_04_closed.png"],
        frames["idle_blink_03_half.png"],
        frames["idle_blink_02_closing.png"],
        frames["idle_blink_01_open.png"],
    ]
    base = Image.fromarray(idle).quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    gif_frames = [
        Image.fromarray(im).quantize(palette=base, dither=Image.Dither.NONE) for im in order
    ]
    gif_frames[0].save(
        BAKED / "proof_blink.gif",
        save_all=True,
        append_images=gif_frames[1:],
        duration=120,
        loop=0,
        disposal=2,
        optimize=False,
    )
    write_standing_proof(idle, frames)


def assert_lock(idle: np.ndarray, frames: dict[str, np.ndarray]) -> None:
    x, y, w, h = EYE_BOX
    open_frame = frames["idle_blink_01_open.png"]
    if not np.array_equal(open_frame, idle):
        raise SystemExit("01_open is not identical to idle.png")
    for name in FRAMES[1:]:
        outside = max_abs_outside(frames[name], idle, EYE_BOX)
        if outside != 0:
            raise SystemExit(f"{name} drifted outside the eye box (max {outside})")
        bbox = changed_bbox(frames[name], idle)
        if bbox is None:
            raise SystemExit(f"{name} did not change the eyes")
        x0, y0, x1, y1 = bbox
        if x0 < x or y0 < y or x1 >= x + w or y1 >= y + h:
            raise SystemExit(f"{name} change bbox {bbox} escapes eye box {EYE_BOX}")
        inside = np.abs(frames[name][y : y + h, x : x + w].astype(np.int16) - idle[y : y + h, x : x + w].astype(np.int16)).max()
        print(f"{name} outside_max=0 inside_max={int(inside)} change_bbox={bbox}")
    print(f"eye box x={x} y={y} w={w} h={h}")


def load_locked_frames() -> tuple[np.ndarray, dict[str, np.ndarray]]:
    """Read the sheets already on disk. 01 must be the idle.png file bytes."""
    idle_bytes = IDLE_PATH.read_bytes()
    for folder in (BAKED, PUBLIC):
        got = (folder / FRAMES[0]).read_bytes()
        if got != idle_bytes:
            raise SystemExit(f"{folder / FRAMES[0]} is not a byte copy of idle.png")
    for name in FRAMES:
        if (BAKED / name).read_bytes() != (PUBLIC / name).read_bytes():
            raise SystemExit(f"{name} bytes differ between baked/ and public/rai/")
    idle = np.array(Image.open(IDLE_PATH).convert("RGB"))
    frames = {name: np.array(Image.open(BAKED / name).convert("RGB")) for name in FRAMES}
    assert_lock(idle, frames)
    return idle, frames


def main() -> None:
    import sys

    proof_only = "--proof-only" in sys.argv[1:]
    if proof_only:
        idle, frames = load_locked_frames()
        write_standing_proof(idle, frames)
        print("locked 01; wrote standing proof without re-encoding 02–04")
        return

    idle = np.array(Image.open(IDLE_PATH).convert("RGB"))
    if idle.shape != (1792, 1008, 3):
        raise SystemExit(f"idle.png is {idle.shape}, expected 1008×1792 RGB")
    frames = build_frames(idle)
    assert_lock(idle, frames)
    BAKED.mkdir(parents=True, exist_ok=True)
    # 01 is the idle file itself, not a re-encode.
    for folder in (BAKED, PUBLIC):
        shutil.copyfile(IDLE_PATH, folder / FRAMES[0])
    for name in FRAMES[1:]:
        save_rgb(BAKED / name, frames[name])
        shutil.copyfile(BAKED / name, PUBLIC / name)
    # Reload 01 from the byte copy so proofs use the same pixels.
    frames[FRAMES[0]] = np.array(Image.open(BAKED / FRAMES[0]).convert("RGB"))
    write_proofs(idle, frames)
    for name in FRAMES:
        a = (BAKED / name).read_bytes()
        b = (PUBLIC / name).read_bytes()
        if a != b:
            raise SystemExit(f"{name} bytes differ between baked/ and public/rai/")
    print("wrote", ", ".join(FRAMES))


if __name__ == "__main__":
    main()
