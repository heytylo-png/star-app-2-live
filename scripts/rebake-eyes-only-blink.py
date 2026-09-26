#!/usr/bin/env python3
"""Rebake the four full-frame idle blink sheets onto public/rai/idle.png.

Eyes only. Every pixel outside the documented eye box is copied from idle.png.
Frame 01 is a byte copy of idle.png. --proof-only refreshes the standing
clip from the locked sheets and does not re-encode 02–04. The standing
gif hard-replaces exactly one 1008×1792 sheet per frame (no crossfade).
Runtime blink stays parked: IDLE_BLINK_ENABLED is false in src/lib/rai.ts.

Lids are painted on the idle.png canvas. A GIF palette is not the source.
02 drops the upper lid and leaves the lower iris. 03 sits between 02 and 04.
04 shuts the lid: no sclera and no iris inside the sockets.
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

# How far the upper lid travels down each socket, top → bottom.
# 02 leaves the lower iris. 03 is the step between that and fully shut.
CLOSING_FRAC = 0.50
HALF_FRAC = 0.74

# Each socket window. Highlights outside the fitted contour still get absorbed
# if they sit in here. Cheek blush below y=229 is not an iris.
SOCKETS = (
    (448, 512, 205, 229),
    (530, 602, 202, 229),
)


def is_sclera_px(p: np.ndarray) -> bool:
    r, g, b = int(p[0]), int(p[1]), int(p[2])
    return r >= 236 and g >= 218 and b >= 198 and (r - b) < 85


def is_iris_px(p: np.ndarray) -> bool:
    """Amber iris. Cheek peach fails the green-minus-blue test."""
    r, g, b = int(p[0]), int(p[1]), int(p[2])
    if r < 150 or g < 55 or b > 145:
        return False
    if (g - b) < 50 or (r - b) < 78:
        return False
    if r + 8 < g:
        return False
    return True


def is_dark(p: np.ndarray) -> bool:
    return int(max(int(p[0]), int(p[1]), int(p[2]))) < 80


def build_eye(idle: np.ndarray, x0: int, x1: int, y0: int, y1: int) -> np.ndarray:
    """Sclera seeds, grown through the amber iris, plus the dark pupil gaps."""
    h, w, _ = idle.shape
    mask = np.zeros((h, w), dtype=bool)
    for y in range(y0, y1):
        for x in range(x0, x1):
            if is_sclera_px(idle[y, x]):
                mask[y, x] = True
    for _ in range(14):
        ys, xs = np.where(mask[y0:y1, x0:x1])
        if xs.size == 0:
            break
        grown = mask.copy()
        added = 0
        for y, x in zip((ys + y0).tolist(), (xs + x0).tolist()):
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    ny, nx = y + dy, x + dx
                    if ny < y0 or ny >= y1 or nx < x0 or nx >= x1 or grown[ny, nx]:
                        continue
                    if is_iris_px(idle[ny, nx]) or is_sclera_px(idle[ny, nx]):
                        grown[ny, nx] = True
                        added += 1
        mask = grown
        if added == 0:
            break
    for x in range(x0, x1):
        ys = np.where(mask[:, x])[0]
        if ys.size < 2:
            continue
        lo, hi = int(ys.min()), int(ys.max())
        if hi - lo > 22:
            continue
        for y in range(lo, hi + 1):
            if mask[y, x]:
                continue
            if is_dark(idle[y, x]) or is_iris_px(idle[y, x]) or is_sclera_px(idle[y, x]):
                mask[y, x] = True
    return mask


def contours_from_mask(mask: np.ndarray, x0: int, x1: int) -> tuple[dict[int, int], dict[int, int]]:
    tops: dict[int, int] = {}
    bots: dict[int, int] = {}
    for x in range(x0, x1):
        ys = np.where(mask[:, x])[0]
        if ys.size >= 3:
            tops[x] = int(ys.min())
            bots[x] = int(ys.max())
    if not tops:
        return tops, bots
    xs = sorted(tops)
    x = xs[0]
    while x <= xs[-1]:
        if x not in tops:
            prev = max(k for k in tops if k < x)
            later = [k for k in tops if k > x]
            nxt = min(later) if later else None
            if nxt is not None and nxt - prev <= 4:
                span = nxt - prev
                t = (x - prev) / span
                tops[x] = int(round(tops[prev] * (1 - t) + tops[nxt] * t))
                bots[x] = int(round(bots[prev] * (1 - t) + bots[nxt] * t))
        x += 1
    keys = sorted(tops)
    smooth_top: dict[int, int] = {}
    smooth_bot: dict[int, int] = {}
    for i, x in enumerate(keys):
        win = keys[max(0, i - 1) : i + 2]
        smooth_top[x] = int(np.median([tops[k] for k in win]))
        smooth_bot[x] = int(np.median([bots[k] for k in win]))
    return smooth_top, smooth_bot


def absorb_highlights(
    idle: np.ndarray,
    tops: dict[int, int],
    bots: dict[int, int],
    x0: int,
    x1: int,
    y0: int,
    y1: int,
) -> None:
    """Stretch the contour so every socket highlight is inside it.

    Smoothing can shave a catchlight off the edge. Closed lids have to cover
    those pixels or the iris still reads as open.
    """
    for y in range(y0, y1):
        for x in range(x0, x1):
            if not (is_sclera_px(idle[y, x]) or is_iris_px(idle[y, x])):
                continue
            if x in tops:
                tops[x] = min(tops[x], y)
                bots[x] = max(bots[x], y)
            else:
                tops[x] = y
                bots[x] = y


def sample_skin(idle: np.ndarray, x: int, top: int, bot: int) -> np.ndarray:
    samples = []
    h = idle.shape[0]
    for y in range(max(185, top - 18), max(185, top - 1)):
        r, g, b = (int(v) for v in idle[y, x])
        if r > 155 and g > 95 and b > 70 and max(r, g, b) < 248 and min(r, g, b) > 60 and (g - b) < 75:
            samples.append(idle[y, x].astype(np.float64))
    if len(samples) >= 2:
        return np.median(np.stack(samples), axis=0)
    samples = []
    for y in range(bot + 2, min(h, bot + 8)):
        r, g, b = (int(v) for v in idle[y, x])
        if r > 170 and g > 110 and b > 85 and int(max(r, g, b)) < 255:
            samples.append(idle[y, x].astype(np.float64))
    if samples:
        return np.median(np.stack(samples), axis=0)
    return np.array([214.0, 154.0, 122.0])


def sample_lash(idle: np.ndarray, x: int, top: int) -> np.ndarray:
    samples = []
    for y in range(max(185, top - 10), top):
        if int(max(int(v) for v in idle[y, x])) < 60:
            samples.append(idle[y, x].astype(np.float64))
    if len(samples) >= 2:
        return np.median(np.stack(samples), axis=0)
    return np.array([32.0, 8.0, 2.0])


def socket_contours(idle: np.ndarray) -> list[tuple[dict[int, int], dict[int, int]]]:
    found = []
    for x0, x1, y0, y1 in SOCKETS:
        mask = build_eye(idle, x0, x1, y0, y1)
        tops, bots = contours_from_mask(mask, x0, x1)
        absorb_highlights(idle, tops, bots, x0, x1, y0, y1)
        if not tops:
            raise SystemExit(f"no eye socket in {(x0, x1, y0, y1)}")
        found.append((tops, bots))
    return found


def lid_cut(top: int, bot: int, iris_ys: list[int], frac: float, lash_px: int) -> int:
    """First row the lid does not paint. Iris rows past the cut stay the original eye."""
    if frac >= 0.999:
        return bot + 1
    if iris_ys:
        take = int(frac * len(iris_ys) + 0.5)
        take = min(max(take, 1), len(iris_ys) - 1)
        return iris_ys[take]
    return min(bot, top + max(lash_px + 1, int(frac * (bot - top + 1) + 0.5)))


def paint_lids(idle: np.ndarray, frac: float, contours: list[tuple[dict[int, int], dict[int, int]]]) -> np.ndarray:
    """Drop the upper lid. frac 1 fills the socket: skin, then a lash where the lids meet."""
    out = idle.copy()
    ex, ey, ew, eh = EYE_BOX
    lash_px = 3 if frac >= 0.999 else 2
    for tops, bots in contours:
        columns: list[tuple[int, int, int, int]] = []
        for x, top in tops.items():
            bot = bots[x]
            if bot < top:
                continue
            if x < ex or x >= ex + ew or top < ey or bot >= ey + eh:
                raise SystemExit(f"lid column x={x} y={top}-{bot} escapes the eye box")
            iris_ys = [y for y in range(top, bot + 1) if is_iris_px(idle[y, x])]
            cut = lid_cut(top, bot, iris_ys, frac, lash_px)
            columns.append((x, top, bot, cut))
        by_x = {col[0]: col for col in columns}
        smooth: dict[int, int] = {}
        for x, top, bot, cut in columns:
            if frac >= 0.999:
                # Shut lids cover the whole socket. Smoothing would uncover the last rows.
                smooth[x] = cut
                continue
            neigh = [by_x[k][3] for k in range(x - 2, x + 3) if k in by_x]
            # Never paint past this column's own cut: that row is reserved iris.
            smooth[x] = min(cut, max(top + 1, int(np.median(neigh))))
        for x, top, bot, _cut in columns:
            cut = smooth[x]
            upper = sample_skin(idle, x, top, bot)
            lower_samples = []
            for y in range(bot + 1, min(idle.shape[0], bot + 6)):
                r, g, b = (int(v) for v in idle[y, x])
                if r > 160 and g > 100 and b > 80:
                    lower_samples.append(idle[y, x].astype(np.float64))
            lower = np.median(np.stack(lower_samples), axis=0) if lower_samples else upper
            lash = sample_lash(idle, x, top)
            span = max(cut - top - 1, 1)
            for y in range(top, cut):
                dist = (cut - 1) - y
                if dist < lash_px:
                    out[y, x] = np.clip(lash, 0, 255).astype(np.uint8)
                elif dist == lash_px:
                    out[y, x] = np.clip(lash * 0.45 + upper * 0.55, 0, 255).astype(np.uint8)
                else:
                    t = (y - top) / span
                    skin = upper * (1.0 - t) + lower * t
                    out[y, x] = np.clip(skin, 0, 255).astype(np.uint8)
    return out


def count_socket_features(img: np.ndarray) -> tuple[int, int]:
    """Sclera and iris inside the socket windows. Cheek below the windows is ignored."""
    iris = 0
    sclera = 0
    for x0, x1, y0, y1 in SOCKETS:
        for y in range(y0, y1):
            for x in range(x0, x1):
                if is_sclera_px(img[y, x]):
                    sclera += 1
                elif is_iris_px(img[y, x]):
                    iris += 1
    return iris, sclera


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
    contours = socket_contours(idle)
    return {
        "idle_blink_01_open.png": idle.copy(),
        "idle_blink_02_closing.png": paint_lids(idle, CLOSING_FRAC, contours),
        "idle_blink_03_half.png": paint_lids(idle, HALF_FRAC, contours),
        "idle_blink_04_closed.png": paint_lids(idle, 1.0, contours),
    }


def assert_art(idle: np.ndarray, frames: dict[str, np.ndarray]) -> None:
    """02 still shows iris. 04 does not. 03 sits between them."""
    open_iris, open_sclera = count_socket_features(idle)
    closing_iris, closing_sclera = count_socket_features(frames["idle_blink_02_closing.png"])
    half_iris, half_sclera = count_socket_features(frames["idle_blink_03_half.png"])
    closed_iris, closed_sclera = count_socket_features(frames["idle_blink_04_closed.png"])
    print(
        f"socket features open iris={open_iris} sclera={open_sclera} "
        f"02 iris={closing_iris} sclera={closing_sclera} "
        f"03 iris={half_iris} sclera={half_sclera} "
        f"04 iris={closed_iris} sclera={closed_sclera}"
    )
    if open_iris < 80 or open_sclera < 80:
        raise SystemExit("open eye lost its iris or sclera before the lid paint")
    if not (open_iris * 0.30 <= closing_iris <= open_iris * 0.75):
        raise SystemExit(f"02 iris {closing_iris} is not a readable partial of open {open_iris}")
    if closing_iris <= half_iris:
        raise SystemExit("03 is not a further close than 02")
    if half_iris < 12:
        raise SystemExit("03 closed the iris; it should stay a slit between 02 and 04")
    if closed_iris != 0 or closed_sclera != 0:
        raise SystemExit(f"04 still shows the eye (iris={closed_iris} sclera={closed_sclera})")
    # The bottom of each iris stays the original idle paint, so 02 is still her eye.
    closing = frames["idle_blink_02_closing.png"]
    for x0, x1, y0, y1 in SOCKETS:
        iris_ys = [y for y in range(y0, y1) for x in range(x0, x1) if is_iris_px(idle[y, x])]
        kept = 0
        for x in range(x0, x1):
            ys = [y for y in range(y0, y1) if is_iris_px(idle[y, x])]
            if len(ys) < 8:
                continue
            take = int(CLOSING_FRAC * len(ys) + 0.5)
            take = min(max(take, 1), len(ys) - 1)
            for y in ys[take:]:
                if not np.array_equal(closing[y, x], idle[y, x]):
                    raise SystemExit(f"02 covered the lower iris at {x},{y}")
                kept += 1
        if kept < 12:
            raise SystemExit(f"02 kept only {kept} lower-iris pixels in x {x0}-{x1}")
        print(f"02 lower iris kept {kept} original pixels in x {x0}-{x1}")


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
    # Review holds. Runtime dwells stay 160/160/640/1000 in rai-motion.ts.
    # 02 is on the way closed and on the way open. Do not skip it.
    durations = [400, 480, 720, 960, 720, 480, 400]
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
    assert_art(idle, frames)
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
