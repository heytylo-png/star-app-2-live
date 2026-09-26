#!/usr/bin/env python3
"""Rebake the four full-frame idle blink sheets onto public/rai/idle.png.

Eyes only. Every pixel outside the documented eye box is copied from idle.png.
Frame 01 is a byte copy of idle.png. --proof-only refreshes the standing
clip from the locked sheets and does not re-encode 02–04. The standing
gif hard-replaces exactly one 1008×1792 sheet per frame (no crossfade).
Runtime blink stays parked: IDLE_BLINK_ENABLED is false in src/lib/rai.ts.

Lids are painted on the idle opening. 02 is the step between open and half
(upper lid down, lower iris still idle). 03 is the half close. 04 fills the
socket: no sclera and no iris. Not a GIF palette and not a stamp of the
tylo-holes bands.
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

# How far the upper lid travels down each socket column (top → bottom).
# 02 is between open and half. 03 is the half close. 04 shuts the socket.
CLOSING_FRAC = 0.50
HALF_FRAC = 0.70


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


def is_sclera_px(p: np.ndarray) -> bool:
    r, g, b = int(p[0]), int(p[1]), int(p[2])
    return r >= 236 and g >= 218 and b >= 198 and (r - b) < 85


def is_iris_px(p: np.ndarray) -> bool:
    r, g, b = int(p[0]), int(p[1]), int(p[2])
    if r < 150 or g < 55 or b > 145:
        return False
    if (g - b) < 50 or (r - b) < 78:
        return False
    if r + 8 < g:
        return False
    return True


def sample_skin(idle: np.ndarray, x: int, top: int) -> np.ndarray:
    samples = []
    for y in range(max(180, top - 16), top):
        r, g, b = (int(v) for v in idle[y, x])
        if r > 165 and g > 105 and b > 75 and max(r, g, b) < 248:
            samples.append(idle[y, x].astype(np.float64))
    if len(samples) >= 2:
        return np.median(np.stack(samples), axis=0)
    return np.array([210.0, 150.0, 120.0])


def sample_lash(idle: np.ndarray, x: int, top: int) -> np.ndarray:
    samples = []
    for y in range(max(185, top - 6), top + 3):
        if int(max(int(v) for v in idle[y, x])) < 70:
            samples.append(idle[y, x].astype(np.float64))
    if len(samples) >= 2:
        return np.median(np.stack(samples), axis=0)
    return np.array([28.0, 8.0, 4.0])


def paint_lids(idle: np.ndarray, mask: np.ndarray, frac: float) -> np.ndarray:
    """Drop the upper lid from the top of each socket column.

    Pixels below the cut stay idle, so a partial close keeps her iris.
    frac 1 fills the socket with lid skin and a lash where the lids meet.
    """
    out = idle.copy()
    ex, ey, ew, eh = EYE_BOX
    cols: dict[int, tuple[int, int]] = {}
    for x in range(mask.shape[1]):
        ys = np.where(mask[:, x])[0]
        if ys.size < 4:
            continue
        top, bot = int(ys.min()), int(ys.max())
        if x < ex or x >= ex + ew or top < ey or bot >= ey + eh:
            raise SystemExit(f"socket column x={x} y={top}-{bot} escapes the eye box")
        cols[x] = (top, bot)
    cuts: dict[int, int] = {}
    for x, (top, bot) in cols.items():
        if frac >= 0.999:
            cuts[x] = bot + 1
        else:
            cuts[x] = top + max(4, int(round(frac * (bot - top + 1))))
    xs = sorted(cuts)
    smooth: dict[int, int] = {}
    for i, x in enumerate(xs):
        window = [cuts[xs[j]] for j in range(max(0, i - 3), min(len(xs), i + 4))]
        smooth[x] = cuts[x] if frac >= 0.999 else int(np.median(window))
    lash_px = 2
    for x, (top, bot) in cols.items():
        cut = min(bot + 1, smooth[x])
        skin = sample_skin(idle, x, top)
        lash = sample_lash(idle, x, top)
        for y in range(top, cut):
            if not mask[y, x]:
                continue
            dist = cut - 1 - y
            if dist < lash_px:
                out[y, x] = np.clip(lash, 0, 255).astype(np.uint8)
            else:
                out[y, x] = np.clip(skin, 0, 255).astype(np.uint8)
    return out


def unchanged_features(idle: np.ndarray, frame: np.ndarray, mask: np.ndarray) -> tuple[int, int]:
    """Iris and sclera pixels of idle that this frame left untouched."""
    iris = 0
    sclera = 0
    ys, xs = np.where(mask)
    for y, x in zip(ys.tolist(), xs.tolist()):
        if not np.array_equal(frame[y, x], idle[y, x]):
            continue
        if is_iris_px(idle[y, x]):
            iris += 1
        elif is_sclera_px(idle[y, x]):
            sclera += 1
    return iris, sclera


def assert_art(idle: np.ndarray, frames: dict[str, np.ndarray], mask: np.ndarray) -> None:
    open_iris, open_sclera = unchanged_features(idle, idle, mask)
    closing = frames["idle_blink_02_closing.png"]
    half = frames["idle_blink_03_half.png"]
    closed = frames["idle_blink_04_closed.png"]
    c_iris, c_sclera = unchanged_features(idle, closing, mask)
    h_iris, h_sclera = unchanged_features(idle, half, mask)
    z_iris, z_sclera = unchanged_features(idle, closed, mask)
    print(
        f"unchanged features open iris={open_iris} sclera={open_sclera} "
        f"02 iris={c_iris} sclera={c_sclera} "
        f"03 iris={h_iris} sclera={h_sclera} "
        f"04 iris={z_iris} sclera={z_sclera}"
    )
    if open_iris < 80 or open_sclera < 40:
        raise SystemExit("open eye lost its iris or sclera before the lid paint")
    if not (open_iris * 0.25 <= c_iris <= open_iris * 0.85):
        raise SystemExit(f"02 iris {c_iris} is not a readable partial of open {open_iris}")
    if h_iris >= c_iris:
        raise SystemExit("03 is not a further close than 02")
    if h_iris < 8:
        raise SystemExit("03 closed the iris; it should stay a slit between 02 and 04")
    if z_iris != 0 or z_sclera != 0:
        raise SystemExit(f"04 still shows the eye (iris={z_iris} sclera={z_sclera})")
    # Below the lid cut, 02 is still the original iris.
    kept = 0
    for x in range(mask.shape[1]):
        ys = [y for y in range(mask.shape[0]) if mask[y, x] and is_iris_px(idle[y, x])]
        if len(ys) < 6:
            continue
        for y in ys[len(ys) // 2 :]:
            if np.array_equal(closing[y, x], idle[y, x]):
                kept += 1
    if kept < 40:
        raise SystemExit(f"02 kept only {kept} lower-iris pixels")
    print(f"02 lower iris kept {kept} original pixels")


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


def build_frames(idle: np.ndarray) -> tuple[dict[str, np.ndarray], np.ndarray]:
    mask = eye_socket_mask(idle)
    frames = {
        "idle_blink_01_open.png": idle.copy(),
        "idle_blink_02_closing.png": paint_lids(idle, mask, CLOSING_FRAC),
        "idle_blink_03_half.png": paint_lids(idle, mask, HALF_FRAC),
        "idle_blink_04_closed.png": paint_lids(idle, mask, 1.0),
    }
    assert_art(idle, frames, mask)
    return frames, mask


def composite_hard_replace(sheet: np.ndarray) -> np.ndarray:
    """Exactly one full 1008×1792 sheet on a fresh canvas.

    Hard replace: every pixel is copied from this sheet. No previous frame,
    no second body, no alpha, and no opacity blend with another sheet.
    """
    if sheet.dtype != np.uint8 or sheet.shape != (1792, 1008, 3):
        raise SystemExit(
            f"hard replace wants one 1008×1792 RGB sheet, got {getattr(sheet, 'shape', None)}"
        )
    canvas = np.empty((1792, 1008, 3), dtype=np.uint8)
    canvas[:, :, :] = sheet
    if not np.array_equal(canvas, sheet):
        raise SystemExit("hard replace changed the single sheet")
    return canvas


def write_standing_proof(idle: np.ndarray, frames: dict[str, np.ndarray]) -> None:
    """Full-body cycle gif plus a standing strip with a diff row.

    Each gif frame is one full sheet, hard-replaced onto an empty canvas.
    Holds are longer than the runtime dwells so 02 closing is obvious.
    The gif uses one palette and no dither: identical body pixels stay
    identical across frames. Disposal restores to background before the
    next frame so a viewer cannot leave the previous body underneath.
    The diff row is computed from the PNG sheets.
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
    # Bookend holds so the standing body reads. The five lid cuts
    # 02 → 03 → 04 → 03 → 02 are 60ms each (300ms), then 01 holds.
    durations = [500, 60, 60, 60, 60, 60, 500]
    order = [composite_hard_replace(frames[name]) for name in order_names]
    for index, (sheet, name) in enumerate(zip(order, order_names)):
        if not np.array_equal(sheet, frames[name]):
            raise SystemExit(f"cycle step {index} is not exactly {name}")
        if index == 0:
            continue
        prev = order[index - 1]
        if np.array_equal(sheet, prev):
            continue
        blend = ((sheet.astype(np.uint16) + prev.astype(np.uint16)) // 2).astype(np.uint8)
        if np.array_equal(sheet, blend):
            raise SystemExit(f"cycle step {index} is an opacity blend of two sheets")
        # A blend would move the eye-box pixels halfway. The hard cut must not.
        eye = np.abs(sheet.astype(np.int16) - blend.astype(np.int16)).max()
        if eye == 0:
            raise SystemExit(f"cycle step {index} matches a crossfade of the previous sheet")

    base = Image.fromarray(idle).quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    gif_frames = []
    for im in order:
        frame = Image.fromarray(im).quantize(palette=base, dither=Image.Dither.NONE)
        frame.info.pop("transparency", None)
        gif_frames.append(frame)
    gif_path = BAKED / "proof_standing_full.gif"
    # disposal=2: restore to background, then draw the next full sheet.
    # That is a hard replace. disposal=1 would leave the previous texture
    # in place under any partial update.
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
    if gif.n_frames != len(order_names) or gif.size != (1008, 1792):
        raise SystemExit(f"standing gif is {gif.n_frames} frames {gif.size}, expected 7×1008×1792")
    gif.seek(0)
    ref = np.array(gif.convert("RGB"))
    x, y, w, h = EYE_BOX
    for index in range(gif.n_frames):
        gif.seek(index)
        if gif.size != (1008, 1792):
            raise SystemExit(f"standing gif frame {index} is {gif.size}, expected 1008×1792")
        if getattr(gif, "disposal_method", None) != 2:
            raise SystemExit(f"standing gif frame {index} disposal is not hard-replace (2)")
        if gif.info.get("transparency") is not None:
            raise SystemExit(f"standing gif frame {index} has a transparency index")
        arr = np.array(gif.convert("RGB"))
        outside = max_abs_outside(arr, ref, EYE_BOX)
        if outside != 0:
            raise SystemExit(f"standing gif frame {index} drifted outside the eye box (max {outside})")
        # Non-background silhouette outside the eye box must match frame 01.
        # A second body would show up here even if a blend hid it in the lids.
        bg_ref = (ref[:, :, 0] >= 250) & (ref[:, :, 1] >= 250) & (ref[:, :, 2] >= 250)
        bg = (arr[:, :, 0] >= 250) & (arr[:, :, 1] >= 250) & (arr[:, :, 2] >= 250)
        extra = bg_ref ^ bg
        extra[y : y + h, x : x + w] = False
        if bool(extra.any()):
            raise SystemExit(f"standing gif frame {index} shows a second silhouette")
    print(f"standing gif {gif.n_frames} frames {gif.size[0]}x{gif.size[1]} hard-replace disposal=2 outside_max_vs_01=0")

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
        duration=[500, 60, 60, 60, 60, 60, 500],
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
    frames, _mask = build_frames(idle)
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
