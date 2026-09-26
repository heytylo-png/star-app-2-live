#!/usr/bin/env python3
"""Rebake idle blink sheets by transplanting 807 lids onto idle.png.

Frame 01 is a byte copy of public/rai/idle.png. Frames 02–04 change only
pixels inside the eye box (420, 185, 210, 70). The 807 video is a different
crop, so the open frame is registered to idle's eyes and that same scale is
used for the blink frames, plus a per-frame translation from the brow.

The source snaps from open to half in one frame (about 6.88s to 6.89s). There
is no photographed pose between them. 03 is 807 at 7s. 04 is 807 at 8s, the
whole socket, so the iris and sclera are gone. 02 is that same 7s lid — the
real lash included — shifted up a few pixels so the lash sits between open
and half.

Runtime blink stays parked: IDLE_BLINK_ENABLED is false in src/lib/rai.ts.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
IDLE_PATH = ROOT / "public/rai/idle.png"
BAKED = ROOT / "artifacts/star-rai-blink-frames/baked"
PUBLIC = ROOT / "public/rai"
SOURCE = ROOT / "artifacts/star-rai-blink-frames/source"

# x, y, w, h. Every pixel outside this box must match idle.png.
EYE_BOX = (420, 185, 210, 70)
EX, EY, EW, EH = EYE_BOX

# 807 source → idle. Open-eye registration, scale about 0.515.
AFFINE = np.array(
    [
        [5.1498961e-01, -3.2677008e-03, 2.2519878e02],
        [3.2677008e-03, 5.1498961e-01, -2.8784843e01],
    ],
    dtype=np.float64,
)
# Content shift in source pixels, from a brow template match against 0s.
SHIFT_HALF = (33, -21)  # 7s
SHIFT_SHUT = (33, -15)  # 8s
# How far the 7s lid is set back up, in idle pixels, to make the light drop.
LIGHT_DROP_PX = 3

FRAMES = (
    "idle_blink_01_open.png",
    "idle_blink_02_closing.png",
    "idle_blink_03_half.png",
    "idle_blink_04_closed.png",
)


def warp(src: np.ndarray, shift: tuple[int, int]) -> np.ndarray:
    sx, sy = shift
    t = AFFINE[:, 2] - AFFINE[:, :2] @ np.array([sx, sy], np.float64)
    matrix = np.array(
        [
            [AFFINE[0, 0], AFFINE[0, 1], t[0]],
            [AFFINE[1, 0], AFFINE[1, 1], t[1]],
        ],
        dtype=np.float32,
    )
    return cv2.warpAffine(
        src,
        matrix,
        (1008, 1792),
        flags=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REFLECT,
    )


def channels(im: np.ndarray):
    r, g, b = [im[:, :, i].astype(np.int16) for i in range(3)]
    mx = np.maximum(np.maximum(r, g), b).astype(np.float32)
    mn = np.minimum(np.minimum(r, g), b).astype(np.float32)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    lum = (0.25 * r + 0.60 * g + 0.10 * b).astype(np.float32)
    return r, g, b, sat, lum


def eye_parts(im: np.ndarray):
    r, g, b, sat, lum = channels(im)
    iris = (r > 160) & (b < 85) & ((r - b) > 110) & (sat > 0.55) & (g > 35) & (r + 10 > g) & (g < 180)
    sclera = (r > 220) & (g > 205) & (b > 185) & (sat < 0.28) & (lum > 170)
    return iris, sclera


def socket_mask(idle: np.ndarray):
    """Fill each eye from the smoothed top and bottom of its sclera and iris."""
    iris, sclera = eye_parts(idle)
    seed = (iris | sclera).astype(np.uint8)
    seed[: EY + 2, :] = 0
    seed[EY + EH - 2 :, :] = 0
    seed[:, : EX + 2] = 0
    seed[:, EX + EW - 2 :] = 0
    top = np.full(idle.shape[1], np.nan)
    bot = np.full(idle.shape[1], np.nan)
    for x in range(idle.shape[1]):
        ys = np.where(seed[:, x])[0]
        if ys.size >= 2:
            top[x] = ys.min()
            bot[x] = ys.max()

    def fill_small_gaps(arr: np.ndarray) -> np.ndarray:
        idx = np.where(~np.isnan(arr))[0]
        out = arr.copy()
        for i in range(len(idx) - 1):
            gap = int(idx[i + 1] - idx[i])
            if 1 < gap <= 6:
                sl = np.arange(idx[i], idx[i + 1])
                out[sl] = np.interp(sl, [idx[i], idx[i + 1]], [arr[idx[i]], arr[idx[i + 1]]])
        return out

    top, bot = fill_small_gaps(top), fill_small_gaps(bot)

    def envelope(arr: np.ndarray, radius: int, take_min: bool) -> np.ndarray:
        out = arr.copy()
        xs = np.where(~np.isnan(arr))[0]
        for x in xs:
            sl = arr[max(0, x - radius) : x + radius + 1]
            sl = sl[~np.isnan(sl)]
            if sl.size:
                out[x] = sl.min() if take_min else sl.max()
        return out

    top_s = envelope(top, 4, True)
    bot_s = envelope(bot, 4, False)
    mask = np.zeros(seed.shape, np.uint8)
    for x in range(EX + 2, EX + EW - 2):
        if np.isnan(top_s[x]) or np.isnan(bot_s[x]):
            continue
        t, b = int(top_s[x]), int(bot_s[x])
        if 4 <= b - t <= 36:
            mask[t : b + 1, x] = 1
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 3)))
    box = np.zeros_like(mask)
    box[EY : EY + EH, EX : EX + EW] = 1
    inset = np.zeros_like(mask)
    inset[EY + 2 : EY + EH - 2, EX + 2 : EX + EW - 2] = 1
    return (mask & inset).astype(bool), box, inset


def hair_mask(idle: np.ndarray, shut: np.ndarray, box: np.ndarray) -> np.ndarray:
    """Thin strands that are dark in idle and still dark when the eye is shut.

    The open upper lash is not in this set: the shut frame paints skin there.
    An even morph kernel is not used — it smears the mask onto catchlights.
    """
    r, g, b, _sat, lum = channels(idle)
    lum_shut = channels(shut)[4]
    dark = (lum < 34) & (np.maximum(np.maximum(r, g), b) < 48) & (lum_shut < 55)
    dens = cv2.filter2D(dark.astype(np.uint8), -1, np.ones((5, 5), np.uint8))
    hair = dark & (dens <= 6) & box.astype(bool)
    return hair


def skin_delta(idle: np.ndarray, blink: np.ndarray) -> np.ndarray:
    """Match 807 brow skin to idle so the lid is the same paint."""
    _r, _g, _b, sat, lum = channels(idle)
    lum_b = channels(blink)[4]
    brow = np.zeros(lum.shape, bool)
    brow[EY : EY + 12, EX + 40 : EX + EW - 40] = True
    sample = brow & (lum > 145) & (lum < 215) & (lum_b > 125) & (sat < 0.5)
    if int(sample.sum()) < 30:
        return np.zeros(3, np.float32)
    return (idle[sample].mean(0) - blink[sample].mean(0)).astype(np.float32)


def partial_lid(blink: np.ndarray, open_w: np.ndarray, opening: np.ndarray) -> np.ndarray:
    """Where the blink has covered idle's eyeball. Iris still showing stays idle."""
    iris_b, sclera_b = eye_parts(blink)
    lum_b = channels(blink)[4]
    lum_o = channels(open_w)[4]
    diff = np.abs(blink.astype(np.int16) - open_w.astype(np.int16)).max(2)
    pupil = (lum_b < 68) & (lum_o < 68) & (diff < 48)
    still = iris_b | sclera_b | pupil
    lid = opening & ~still
    dark = lum_b < 60
    touch = cv2.dilate(lid.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    lid = lid | (dark & touch & ~opening & ~still)
    lid = cv2.morphologyEx(lid.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    return lid.astype(bool)


def shift_up(img: np.ndarray, mask: np.ndarray, pixels: int):
    if not pixels:
        return img, mask
    matrix = np.array([[1, 0, 0], [0, 1, -float(pixels)]], np.float32)
    moved = cv2.warpAffine(
        img, matrix, (img.shape[1], img.shape[0]), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    moved_mask = cv2.warpAffine(
        mask.astype(np.uint8),
        matrix,
        (img.shape[1], img.shape[0]),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
    )
    return moved, moved_mask > 0.4


def feather(mask: np.ndarray, band: float = 2.6) -> np.ndarray:
    binary = mask.astype(np.uint8)
    inside = cv2.distanceTransform(binary, cv2.DIST_L2, 3)
    outside = cv2.distanceTransform(1 - binary, cv2.DIST_L2, 3)
    return np.clip(((inside - outside) + band * 0.45) / band, 0, 1).astype(np.float32)


def composite(idle, blink, mask, box, inset, hair, shift: int) -> np.ndarray:
    matched = np.clip(blink.astype(np.float32) + skin_delta(idle, blink), 0, 255)
    matched, mask = shift_up(matched, mask, shift)
    mask = mask & inset.astype(bool)
    alpha = feather(mask)
    alpha[inset == 0] = 0
    _r, _g, _b, _sat, lum = channels(idle)
    near = cv2.dilate(hair.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    fringe = near & (lum < 70) & ~hair
    alpha[fringe] *= 0.15
    alpha[hair] = 0
    out = np.clip(idle.astype(np.float32) * (1 - alpha[:, :, None]) + matched * alpha[:, :, None], 0, 255)
    out = out.astype(np.uint8)
    out[box == 0] = idle[box == 0]
    out[hair] = idle[hair]
    return out


def strict_counts(im: np.ndarray, opening: np.ndarray) -> tuple[int, int]:
    r, g, b, sat, _lum = channels(im)
    iris = (sat > 0.72) & (b < 70) & (r > 175) & ((r - b) > 145) & (g > 40) & (g < 170) & opening
    sclera = (r > 228) & (g > 210) & (b > 195) & (sat < 0.20) & opening
    return int(iris.sum()), int(sclera.sum())


def max_abs_outside(a: np.ndarray, b: np.ndarray) -> int:
    x, y, w, h = EYE_BOX
    delta = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(axis=2)
    delta[y : y + h, x : x + w] = 0
    return int(delta.max())


def build_frames(idle: np.ndarray) -> dict[str, np.ndarray]:
    open_src = np.array(Image.open(SOURCE / "807_0s.png").convert("RGB"))
    half_src = np.array(Image.open(SOURCE / "807_7s.png").convert("RGB"))
    shut_src = np.array(Image.open(SOURCE / "807_8s.png").convert("RGB"))
    if open_src.shape != (1572, 1078, 3):
        raise SystemExit(f"807 open frame is {open_src.shape}, expected 1078×1572 RGB")
    open_w = warp(open_src, (0, 0))
    half_w = warp(half_src, SHIFT_HALF)
    shut_w = warp(shut_src, SHIFT_SHUT)
    opening, box, inset = socket_mask(idle)
    hair = hair_mask(idle, shut_w, box)
    lid = partial_lid(half_w, open_w, opening)
    lum_shut = channels(shut_w)[4]
    lash = cv2.dilate(opening.astype(np.uint8), np.ones((3, 5), np.uint8)).astype(bool)
    lash = lash & ~opening & (lum_shut < 58) & inset.astype(bool)
    shut_mask = (opening | lash) & inset.astype(bool)
    frames = {
        FRAMES[0]: idle.copy(),
        FRAMES[1]: composite(idle, half_w, lid, box, inset, hair, LIGHT_DROP_PX),
        FRAMES[2]: composite(idle, half_w, lid, box, inset, hair, 0),
        FRAMES[3]: composite(idle, shut_w, shut_mask, box, inset, hair, 0),
    }
    check_frames(idle, frames, opening)
    print(f"socket {int(opening.sum())} hair {int(hair.sum())}")
    return frames


def check_frames(idle: np.ndarray, frames: dict[str, np.ndarray], opening: np.ndarray) -> None:
    if not np.array_equal(frames[FRAMES[0]], idle):
        raise SystemExit("01 is not identical to idle.png")
    counts = {}
    for name in FRAMES:
        outside = max_abs_outside(frames[name], idle)
        iris_n, sclera_n = strict_counts(frames[name], opening)
        counts[name] = (iris_n, sclera_n, outside)
        if outside != 0:
            raise SystemExit(f"{name} drifted outside the eye box (max {outside})")
        print(f"{name} iris {iris_n} sclera {sclera_n} outside_max {outside}")
    open_i, open_s, _ = counts[FRAMES[0]]
    drop_i, drop_s, _ = counts[FRAMES[1]]
    half_i, half_s, _ = counts[FRAMES[2]]
    shut_i, shut_s, _ = counts[FRAMES[3]]
    if open_i < 80 or open_s < 80:
        raise SystemExit("open eye lost its iris or sclera before the transplant")
    if not (drop_i > half_i >= shut_i):
        raise SystemExit(f"iris did not step down {drop_i} > {half_i} >= {shut_i}")
    if not (drop_s > half_s > shut_s):
        raise SystemExit(f"sclera did not step down {drop_s} > {half_s} > {shut_s}")
    if shut_i != 0 or shut_s != 0:
        raise SystemExit(f"04 still shows the eye (iris {shut_i} sclera {shut_s})")
    if half_i < 20:
        raise SystemExit("03 closed the iris; the half pose should keep a readable slit")


def save_rgb(path: Path, rgb: np.ndarray) -> None:
    Image.fromarray(rgb, mode="RGB").save(path, format="PNG", optimize=True)


def composite_hard_replace(sheet: np.ndarray) -> np.ndarray:
    if sheet.dtype != np.uint8 or sheet.shape != (1792, 1008, 3):
        raise SystemExit(f"hard replace wants one 1008×1792 RGB sheet, got {getattr(sheet, 'shape', None)}")
    canvas = np.empty_like(sheet)
    canvas[:, :, :] = sheet
    return canvas


def write_standing_proof(idle: np.ndarray, frames: dict[str, np.ndarray]) -> None:
    order_names = [
        FRAMES[0],
        FRAMES[1],
        FRAMES[2],
        FRAMES[3],
        FRAMES[2],
        FRAMES[1],
        FRAMES[0],
    ]
    durations = [500, 60, 60, 60, 60, 60, 500]
    order = [composite_hard_replace(frames[name]) for name in order_names]
    base = Image.fromarray(idle).quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    gif_frames = []
    for im in order:
        frame = Image.fromarray(im).quantize(palette=base, dither=Image.Dither.NONE)
        frame.info.pop("transparency", None)
        gif_frames.append(frame)
    gif_path = BAKED / "proof_standing_full.gif"
    gif_frames[0].save(
        gif_path,
        save_all=True,
        append_images=gif_frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )
    gif = Image.open(gif_path)
    if gif.n_frames != 7 or gif.size != (1008, 1792):
        raise SystemExit(f"standing gif is {gif.n_frames} frames {gif.size}")
    gif.seek(0)
    ref = np.array(gif.convert("RGB"))
    x, y, w, h = EYE_BOX
    for index in range(gif.n_frames):
        gif.seek(index)
        if getattr(gif, "disposal_method", None) != 2:
            raise SystemExit(f"standing gif frame {index} disposal is not 2")
        arr = np.array(gif.convert("RGB"))
        outside = max_abs_outside(arr, ref)
        if outside != 0:
            raise SystemExit(f"standing gif frame {index} drifted outside the eye box (max {outside})")
        bg_ref = (ref[:, :, 0] >= 250) & (ref[:, :, 1] >= 250) & (ref[:, :, 2] >= 250)
        bg = (arr[:, :, 0] >= 250) & (arr[:, :, 1] >= 250) & (arr[:, :, 2] >= 250)
        extra = bg_ref ^ bg
        extra[y : y + h, x : x + w] = False
        if bool(extra.any()):
            raise SystemExit(f"standing gif frame {index} shows a second silhouette")
    print("standing gif 7 frames 1008x1792 hard-replace disposal=2 outside_max_vs_01=0")

    panels = [("idle", idle)] + [
        (label, frames[name])
        for label, name in (
            ("01", FRAMES[0]),
            ("02", FRAMES[1]),
            ("03", FRAMES[2]),
            ("04", FRAMES[3]),
        )
    ]
    target_h = 720
    scale = target_h / idle.shape[0]
    target_w = int(round(idle.shape[1] * scale))
    gap = 8
    label_h = 28
    thumbs, diffs = [], []
    for _, im in panels:
        thumbs.append(Image.fromarray(im).resize((target_w, target_h), Image.Resampling.BOX))
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


def write_proofs(idle: np.ndarray, frames: dict[str, np.ndarray]) -> None:
    face = (360, 120, 700, 460)
    panels = [("idle", idle)] + [(name[11:13], frames[name]) for name in FRAMES]
    crops = [Image.fromarray(im[face[1] : face[3], face[0] : face[2]]) for _, im in panels]
    gap = 8
    w, h = crops[0].size
    sheet = Image.new("RGB", (len(crops) * w + (len(crops) - 1) * gap, h), (28, 24, 32))
    for i, crop in enumerate(crops):
        sheet.paste(crop, (i * (w + gap), 0))
    sheet.save(BAKED / "proof_strip.png", format="PNG", optimize=True)

    eyes = []
    for name in FRAMES:
        crop = Image.fromarray(frames[name][EY : EY + EH, EX : EX + EW])
        eyes.append(crop.resize((EW * 2, EH * 2), Image.Resampling.NEAREST))
    ew2, eh2 = eyes[0].size
    band = Image.new("RGB", (len(eyes) * ew2 + (len(eyes) - 1) * gap, eh2), (28, 24, 32))
    for i, crop in enumerate(eyes):
        band.paste(crop, (i * (ew2 + gap), 0))
    band.save(BAKED / "proof_eyes.png", format="PNG", optimize=True)
    # Flush 2× strip, no gap, the art-review crop of 01–04.
    flush = Image.new("RGB", (len(eyes) * ew2, eh2))
    for i, crop in enumerate(eyes):
        flush.paste(crop, (i * ew2, 0))
    flush.save(BAKED / "proof_eyes_strip.png", format="PNG")

    order = [frames[FRAMES[i]] for i in (0, 1, 2, 3, 2, 1, 0)]
    base = Image.fromarray(idle).quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    gif_frames = [Image.fromarray(im).quantize(palette=base, dither=Image.Dither.NONE) for im in order]
    gif_frames[0].save(
        BAKED / "proof_blink.gif",
        save_all=True,
        append_images=gif_frames[1:],
        duration=[500, 60, 60, 60, 60, 60, 500],
        loop=0,
        disposal=2,
        optimize=False,
    )
    write_standing_proof(idle, frames)


def main() -> None:
    for name in ("807_0s.png", "807_7s.png", "807_8s.png"):
        if not (SOURCE / name).is_file():
            raise SystemExit(f"missing {SOURCE / name}")
    idle = np.array(Image.open(IDLE_PATH).convert("RGB"))
    if idle.shape != (1792, 1008, 3):
        raise SystemExit(f"idle.png is {idle.shape}, expected 1008×1792 RGB")
    frames = build_frames(idle)
    BAKED.mkdir(parents=True, exist_ok=True)
    for folder in (BAKED, PUBLIC):
        shutil.copyfile(IDLE_PATH, folder / FRAMES[0])
    for name in FRAMES[1:]:
        save_rgb(BAKED / name, frames[name])
        shutil.copyfile(BAKED / name, PUBLIC / name)
    frames[FRAMES[0]] = np.array(Image.open(BAKED / FRAMES[0]).convert("RGB"))
    write_proofs(idle, frames)
    for name in FRAMES:
        if (BAKED / name).read_bytes() != (PUBLIC / name).read_bytes():
            raise SystemExit(f"{name} bytes differ between baked/ and public/rai/")
    if (BAKED / FRAMES[0]).read_bytes() != IDLE_PATH.read_bytes():
        raise SystemExit("01 is not a byte copy of idle.png")
    print("wrote", ", ".join(FRAMES))


if __name__ == "__main__":
    main()
