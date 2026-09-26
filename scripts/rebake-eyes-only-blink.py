#!/usr/bin/env python3
"""Rebake idle blink sheets by transplanting 807 lids onto idle.png.

Frame 01 is a byte copy of public/rai/idle.png. Frames 02–04 change only
pixels inside the eye box (420, 185, 210, 70). The 807 video is a different
crop, so the open frame is registered to idle's eyes (sub-pixel, Lanczos)
and that same scale is used for the blink frames, plus a per-frame brow shift.

The source snaps from open to half in one frame (about 6.88s to 6.89s). There
is no photographed pose between them. 03 places the 7s lash through the middle
of idle's iris, so the upper lid cuts the iris by about half. 02 is that same
lash, only a light drop into the top of the iris. 04 repaints the whole old
opening, including the old upper lid, with 8s skin and one crisp 8s lash.
The lash pixels are a single Lanczos sample. Feathering is only on the mask
edge. No Gaussian blur on the lash, no square morphology, no binary cutout.

Runtime blink is on: IDLE_BLINK_ENABLED is true in src/lib/rai.ts.
Approved by TyLo on 2026-09-26 (807-referenced painted lids, pass 4b).
"""

from __future__ import annotations

import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, gaussian_filter1d
from scipy.special import erf

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
SHIFT_HALF = (33.0, -21.0)  # 7s
SHIFT_SHUT = (33.0, -15.0)  # 8s
# Fraction of the bright opening the lash covers, measured down from its top.
# 02 only enters the upper iris. 03 crosses the middle of it.
LIGHT_DROP_FRAC = 0.12
HALF_DROP_FRAC = 0.46
# 04 covers the old lid above the iris and the rest of the opening below it.
SHUT_ABOVE = 8.0
SHUT_BELOW = 5.5
# Mask-edge feather only. The lash itself is not blurred.
FEATHER_SIGMA = 1.55
LASH_EDGE_SIGMA = 0.95

FRAMES = (
    "idle_blink_01_open.png",
    "idle_blink_02_closing.png",
    "idle_blink_03_half.png",
    "idle_blink_04_closed.png",
)


def warp(src: np.ndarray, shift: tuple[float, float], nudge: tuple[float, float] = (0.0, 0.0)) -> np.ndarray:
    """Map 807 onto the idle canvas. One Lanczos sample, sub-pixel shift.

    OpenCV's warpAffine reads src at M * [x, y, 1]. `nudge` moves the painted
    content in idle pixels (positive = right / down) without a second resample.
    """
    sx, sy = shift
    t = AFFINE[:, 2] - AFFINE[:, :2] @ np.array([sx, sy], np.float64)
    linear = AFFINE[:, :2]
    t = t - linear @ np.array(nudge, np.float64)
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


def subpixel_peak(corr: np.ndarray) -> tuple[float, float, float]:
    _minv, maxv, _minloc, maxloc = cv2.minMaxLoc(corr)
    x, y = maxloc

    def quad(a: float, b: float, c: float) -> float:
        denom = a - 2 * b + c
        if abs(denom) < 1e-6:
            return 0.0
        return float(0.5 * (a - c) / denom)

    dx = dy = 0.0
    if 0 < x < corr.shape[1] - 1:
        dx = quad(float(corr[y, x - 1]), float(corr[y, x]), float(corr[y, x + 1]))
    if 0 < y < corr.shape[0] - 1:
        dy = quad(float(corr[y - 1, x]), float(corr[y, x]), float(corr[y + 1, x]))
    return x + dx, y + dy, float(maxv)


def brow_nudge(ref: np.ndarray, mov: np.ndarray) -> tuple[float, float, float]:
    """Sub-pixel shift that lines `mov`'s brow up with `ref`. Content delta."""
    y0, y1, x0, x1 = 158, 184, 450, 640
    margin = 12
    ref_g = cv2.cvtColor(ref[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
    mov_g = cv2.cvtColor(mov[y0 - margin : y1 + margin, x0 - margin : x1 + margin], cv2.COLOR_RGB2GRAY)
    corr = cv2.matchTemplate(mov_g, ref_g, cv2.TM_CCOEFF_NORMED)
    px, py, score = subpixel_peak(corr)
    # Peak at (margin, margin) means the brows already agree.
    return px - margin, py - margin, score


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


def eye_box() -> np.ndarray:
    box = np.zeros((1792, 1008), np.uint8)
    box[EY : EY + EH, EX : EX + EW] = 1
    return box


def column_bands(seed: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Top and bottom of columns that actually span the eyeball, not a speck."""
    top = np.full(seed.shape[1], np.nan)
    bot = np.full(seed.shape[1], np.nan)
    for x in range(seed.shape[1]):
        ys = np.where(seed[:, x])[0]
        if ys.size < 2:
            continue
        if int(ys.max() - ys.min()) > 28:
            med = float(np.median(ys))
            ys = ys[np.abs(ys - med) <= 12]
        if ys.size >= 2 and int(ys.max() - ys.min()) >= 8:
            top[x] = float(ys.min())
            bot[x] = float(ys.max())
    return top, bot


def split_eyes(top: np.ndarray) -> list[tuple[int, int]]:
    """Two eyes, cut at the gap nearest the middle of the eye box."""
    xs = np.where(~np.isnan(top))[0]
    if xs.size < 8:
        return []
    gaps = []
    for i in range(1, xs.size):
        gap = int(xs[i] - xs[i - 1])
        if gap > 4:
            gaps.append((gap, int(xs[i - 1]), int(xs[i])))
    if not gaps:
        return [(int(xs[0]), int(xs[-1]))]
    mid = EX + EW / 2
    # Prefer a real nose gap: wide, and sitting between the two eyes.
    gap, left, right = max(gaps, key=lambda g: (g[0], -abs((g[1] + g[2]) / 2 - mid)))
    if gap < 6 or not (EX + 20 < left < EX + EW - 20):
        return [(int(xs[0]), int(xs[-1]))]
    return [(int(xs[0]), left), (right, int(xs[-1]))]


def eye_spans(top: np.ndarray) -> list[tuple[int, int]]:
    xs = np.where(~np.isnan(top))[0]
    if xs.size == 0:
        return []
    spans: list[tuple[int, int]] = []
    start = prev = int(xs[0])
    for x in xs[1:]:
        x = int(x)
        if x - prev > 8:
            spans.append((start, prev))
            start = x
        prev = x
    spans.append((start, prev))
    return [(a, b) for a, b in spans if b - a >= 12]


def _fill_span(values: np.ndarray) -> np.ndarray:
    idx = np.where(~np.isnan(values))[0]
    out = np.full(values.shape, np.nan)
    if idx.size < 2:
        return out
    sl = np.arange(idx[0], idx[-1] + 1)
    out[sl] = np.interp(sl, idx, values[idx])
    return out


def smooth_eye(top: np.ndarray, bot: np.ndarray, x0: int, x1: int, sigma: float = 3.4) -> None:
    """Gaussian along the lid, then a cosine cap so the corners are round."""
    t = _fill_span(top[x0 : x1 + 1])
    b = _fill_span(bot[x0 : x1 + 1])
    known = ~np.isnan(t) & ~np.isnan(b)
    if int(known.sum()) < 8:
        top[x0 : x1 + 1] = np.nan
        bot[x0 : x1 + 1] = np.nan
        return
    t = gaussian_filter1d(np.where(known, t, np.nanmedian(t[known])), sigma, mode="nearest")
    b = gaussian_filter1d(np.where(known, b, np.nanmedian(b[known])), sigma, mode="nearest")
    cap = 12
    w = np.ones(t.shape, np.float64)
    if t.size > cap * 2:
        ramp = 0.5 * (1.0 - np.cos(np.linspace(0, np.pi, cap)))
        w[:cap] = ramp
        w[-cap:] = ramp[::-1]
    mid = 0.5 * (t + b)
    half = 0.5 * (b - t) * w
    top[x0 : x1 + 1] = mid - half
    bot[x0 : x1 + 1] = mid + half


def socket_curves(idle: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Smooth top and bottom of each eye. NaN off the eyes."""
    r, g, b, sat, lum = channels(idle)
    iris = (sat > 0.55) & (b < 100) & (r > 150) & ((r - b) > 90) & (g > 30) & (g < 200)
    sclera = (r > 215) & (g > 200) & (b > 180) & (sat < 0.32) & (lum > 165)
    seed = iris | sclera
    seed[:EY, :] = False
    seed[EY + EH :, :] = False
    seed[:, :EX] = False
    seed[:, EX + EW :] = False
    raw_top, raw_bot = column_bands(seed)
    top = np.full(idle.shape[1], np.nan)
    bot = np.full(idle.shape[1], np.nan)
    spans = split_eyes(raw_top)
    if len(spans) != 2:
        raise SystemExit(f"expected two eyes, found {spans}")
    for x0, x1 in spans:
        top[x0 : x1 + 1] = raw_top[x0 : x1 + 1]
        bot[x0 : x1 + 1] = raw_bot[x0 : x1 + 1]
        smooth_eye(top, bot, x0, x1)
    return top, bot


def bright_opening(idle: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Top and bottom of the bright iris and sclera, one curve per eye.

    This is the colored opening a viewer reads as the eye. The bangs above it
    are not part of the opening, so a lid aimed at the socket's dark top never
    reaches the iris.
    """
    r, g, b, sat, lum = channels(idle)
    iris = (sat > 0.62) & (b < 100) & (r > 165) & ((r - b) > 110) & (g > 35) & (g < 200) & (lum > 45)
    sclera = (r > 220) & (g > 200) & (b > 175) & (sat < 0.28) & (lum > 160)
    seed = iris | sclera
    seed[:EY, :] = False
    seed[EY + EH :, :] = False
    seed[:, :EX] = False
    seed[:, EX + EW :] = False
    raw_top = np.full(idle.shape[1], np.nan)
    raw_bot = np.full(idle.shape[1], np.nan)
    for x in range(EX, EX + EW):
        ys = np.where(seed[:, x])[0]
        if ys.size < 2:
            continue
        if int(ys.max() - ys.min()) > 28:
            med = float(np.median(ys))
            ys = ys[np.abs(ys - med) <= 12]
        if ys.size >= 2 and int(ys.max() - ys.min()) >= 4:
            raw_top[x] = float(ys.min())
            raw_bot[x] = float(ys.max())
    spans = split_eyes(raw_top)
    if len(spans) != 2:
        raise SystemExit(f"expected two eyes, found {spans}")
    top = np.full(idle.shape[1], np.nan)
    bot = np.full(idle.shape[1], np.nan)
    for i, (x0, x1) in enumerate(spans):
        sl = slice(x0, x1 + 1)
        med_t = float(np.nanmedian(raw_top[sl]))
        med_b = float(np.nanmedian(raw_bot[sl]))
        # Hair and the brow throw a few columns far off the iris.
        keep = np.isfinite(raw_top[sl]) & (np.abs(raw_top[sl] - med_t) <= 9) & (np.abs(raw_bot[sl] - med_b) <= 8)
        raw_top[sl] = np.where(keep, raw_top[sl], np.nan)
        raw_bot[sl] = np.where(keep, raw_bot[sl], np.nan)
        idx = np.where(np.isfinite(raw_top[sl]))[0]
        if idx.size < 6:
            raise SystemExit(f"eye {x0}-{x1} lost its iris outline")
        xx = np.arange(x1 - x0 + 1)
        t = gaussian_filter1d(np.interp(xx, idx, raw_top[sl][idx]), 2.8, mode="nearest")
        b = gaussian_filter1d(np.interp(xx, idx, raw_bot[sl][idx]), 2.8, mode="nearest")
        # Outer corner only. Do not grow across the nose.
        grow_left = 8 if i == 0 else 3
        grow_right = 3 if i == 0 else 8
        aa = max(EX + 2, x0 - grow_left)
        bb = min(EX + EW - 3, x1 + grow_right)
        width = bb - aa + 1
        full_t = np.empty(width, np.float64)
        full_b = np.empty(width, np.float64)
        off = x0 - aa
        full_t[:off] = t[0]
        full_b[:off] = b[0]
        full_t[off : off + t.size] = t
        full_b[off : off + t.size] = b
        full_t[off + t.size :] = t[-1]
        full_b[off + t.size :] = b[-1]
        top[aa : bb + 1] = full_t
        bot[aa : bb + 1] = full_b
    return top, bot


def lash_bottom(im: np.ndarray, top: np.ndarray, bot: np.ndarray) -> np.ndarray:
    """Bottom row of the dark upper-lid stroke. The y-position is smoothed; the pixels are not."""
    lum = channels(im)[4]
    out = np.full(im.shape[1], np.nan)
    for x in range(im.shape[1]):
        if np.isnan(top[x]) or np.isnan(bot[x]):
            continue
        t = int(max(EY, np.floor(top[x] - 14)))
        b = int(min(EY + EH - 2, np.ceil(max(bot[x], top[x] + 8))))
        if b - t < 6:
            continue
        col = lum[t : b + 1, x]
        i = int(np.argmin(col))
        if col[i] > 75:
            continue
        end = i
        while end + 1 < col.size and col[end + 1] < 105 and col[end + 1] < col[i] + 40:
            end += 1
        out[x] = float(t + end)
    for x0, x1 in eye_spans(top):
        sl = slice(x0, x1 + 1)
        filled = _fill_span(out[sl])
        known = ~np.isnan(filled)
        if int(known.sum()) < 4:
            med = float(np.nanmedian(top[sl])) + 3.0
            out[sl] = med
            continue
        med = float(np.nanmedian(filled[known]))
        filled = np.where(known, filled, med)
        out[sl] = gaussian_filter1d(filled, 1.3, mode="nearest")
    return out


def gaussian_edge(dist: np.ndarray, sigma: float = FEATHER_SIGMA) -> np.ndarray:
    """Anti-aliased step. dist > 0 is inside. The ramp is about 4–5px wide."""
    return (0.5 * (1.0 + erf(dist / (sigma * np.sqrt(2.0))))).astype(np.float32)


def curve_distance(top: np.ndarray, bot: np.ndarray) -> np.ndarray:
    """Signed distance to a smooth per-column band. Positive inside.

    Past the end of an eye the distance falls off, so the corner is a curve
    rather than a vertical wall.
    """
    h, w = 1792, 1008
    yy = np.arange(h, dtype=np.float32)[:, None]
    valid = ~np.isnan(top) & ~np.isnan(bot)
    top_f = np.where(valid, top, 0).astype(np.float32)
    bot_f = np.where(valid, bot, 0).astype(np.float32)
    inside = np.minimum(yy - top_f[None, :], bot_f[None, :] - yy)
    side = np.full(w, 48.0, np.float32)
    for x0, x1 in eye_spans(np.where(valid, 0.0, np.nan)):
        side[x0 : x1 + 1] = 0
        left = np.arange(max(0, x0 - 28), x0)
        side[left] = np.minimum(side[left], (x0 - left).astype(np.float32))
        right = np.arange(x1 + 1, min(w, x1 + 29))
        side[right] = np.minimum(side[right], (right - x1).astype(np.float32))
    dist = inside - side[None, :] * 1.35
    dist[:, ~valid] = np.minimum(dist[:, ~valid], -side[None, ~valid])
    return dist.astype(np.float32)


def box_fade() -> np.ndarray:
    """Die out inside the eye box so the box itself is never a painted edge."""
    yy = np.arange(1792, dtype=np.float32)[:, None]
    xx = np.arange(1008, dtype=np.float32)[None, :]
    inset = np.minimum(
        np.minimum(yy - EY, (EY + EH - 1) - yy),
        np.minimum(xx - EX, (EX + EW - 1) - xx),
    )
    return gaussian_edge(inset - 3.0, sigma=1.15)


def hair_weight(idle: np.ndarray, source: np.ndarray, top: np.ndarray) -> np.ndarray:
    """Soft weight of bangs that stay above the new lid.

    Strands are thin and dark in idle and connect to the hair above the eye.
    The edge is a Gaussian. A shut lash is a wide dark band, not a thin
    strand, so it is not pulled back to the open eye.
    """
    _r, _g, _b, _sat, lum_i = channels(idle)
    surround = gaussian_filter(lum_i, 1.35)
    thin = np.clip((surround - lum_i) / 12.0, 0.0, 1.0)
    dark = np.clip((42.0 - lum_i) / 16.0, 0.0, 1.0)
    strand = (thin * dark).astype(np.float32)
    above = np.zeros_like(strand)
    for x, t in enumerate(top):
        if np.isnan(t):
            continue
        y1 = int(max(EY, np.floor(t) + 1))
        above[EY:y1, x] = 1.0
    seed = strand * above
    gate = np.clip(strand * 2.2, 0.0, 1.0)
    field = seed.copy()
    # Spread the full weight along the strand. Max keeps it from fading out;
    # gating by the strand keeps it off the pupil and off the skin.
    allow = np.clip(gate + seed, 0.0, 1.0)
    for _ in range(26):
        field = np.maximum(field, gaussian_filter(field, 0.85)) * allow
        field = np.maximum(field, seed)
    nz = field[field > 0.02]
    hi = float(np.percentile(nz, 80)) if nz.size else 0.0
    if hi < 1e-4:
        return np.zeros_like(field)
    return gaussian_filter(np.clip(field / hi, 0.0, 1.0), 1.25).astype(np.float32)


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


def match_skin(idle: np.ndarray, blink: np.ndarray) -> np.ndarray:
    return np.clip(blink.astype(np.float32) + skin_delta(idle, blink), 0, 255).astype(np.float32)


def translate_lash(src: np.ndarray, lash_src: np.ndarray, lash_dst: np.ndarray, anchor: np.ndarray) -> np.ndarray:
    """Move a lash onto `lash_dst` with one Lanczos resample.

    The stroke itself is a pure translation, so it is not stretched. Skin above
    the stroke takes up the gap. Rows at `anchor` stay put.
    """
    h, w = src.shape[:2]
    src_f = np.asarray(src, np.float32)
    map_x = np.tile(np.arange(w, dtype=np.float32), (h, 1))
    ys = np.arange(h, dtype=np.float32)[:, None]
    finite = np.isfinite(lash_src) & np.isfinite(lash_dst) & np.isfinite(anchor)
    src_l = np.where(finite, lash_src, 0.0).astype(np.float32)
    dst_l = np.where(finite, lash_dst, 0.0).astype(np.float32)
    anch = np.where(finite, anchor, 0.0).astype(np.float32)
    delta = dst_l - src_l
    band = dst_l - 2.4
    denom = np.maximum(band - anch, 1.0)
    t = (ys - anch[None, :]) / denom[None, :]
    stretch = anch[None, :] + t * ((src_l - 2.4) - anch)[None, :]
    shifted = ys - delta[None, :]
    map_y = np.broadcast_to(ys, (h, w)).copy()
    use_stretch = finite[None, :] & (ys > anch[None, :]) & (ys < band[None, :])
    use_shift = finite[None, :] & (ys >= band[None, :]) & (ys < (dst_l[None, :] + 14.0))
    map_y = np.where(use_shift, shifted, np.where(use_stretch, stretch, map_y))
    return cv2.remap(
        src_f,
        map_x,
        map_y.astype(np.float32),
        interpolation=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REPLICATE,
    )


def _taper_band(y_top: np.ndarray, y_bot: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Shrink the band to a point at each end so the corner is not a wall."""
    yt = y_top.copy()
    yb = y_bot.copy()
    valid = np.isfinite(yt) & np.isfinite(yb)
    cap = 12
    for a, b in eye_spans(np.where(valid, 0.0, np.nan)):
        center = 0.5 * (np.nanmedian(yt[a : b + 1]) + np.nanmedian(yb[a : b + 1]))
        for i, x in enumerate(range(a, min(a + cap, b + 1))):
            # Keep most of the height. Only the last columns round off,
            # otherwise the inner-corner sclera falls outside the lid.
            wgt = 0.55 + 0.45 * 0.5 * (1.0 - np.cos(np.pi * i / max(cap - 1, 1)))
            yt[x] = center + (yt[x] - center) * wgt
            yb[x] = center + (yb[x] - center) * wgt
        for i, x in enumerate(range(b, max(b - cap, a) - 1, -1)):
            wgt = 0.55 + 0.45 * 0.5 * (1.0 - np.cos(np.pi * i / max(cap - 1, 1)))
            yt[x] = center + (yt[x] - center) * wgt
            yb[x] = center + (yb[x] - center) * wgt
    return yt, yb


def band_alpha(y_top: np.ndarray, y_bot: np.ndarray, sigma: float) -> np.ndarray:
    """Soft band. Feather is the mask edge; the interior stays opaque."""
    h, w = 1792, 1008
    yt, yb = _taper_band(y_top, y_bot)
    valid = np.isfinite(y_top) & np.isfinite(y_bot)
    yy = np.arange(h, dtype=np.float32)[:, None]
    top_f = np.where(valid, yt, 0.0).astype(np.float32)
    bot_f = np.where(valid, yb, 0.0).astype(np.float32)
    inside = np.minimum(yy - top_f[None, :], bot_f[None, :] - yy)
    side = np.full(w, 40.0, np.float32)
    for a, b in eye_spans(np.where(valid, 0.0, np.nan)):
        side[a : b + 1] = 0
        left = np.arange(max(0, a - 16), a)
        side[left] = np.minimum(side[left], (a - left).astype(np.float32))
        right = np.arange(b + 1, min(w, b + 17))
        side[right] = np.minimum(side[right], (right - b).astype(np.float32))
    dist = inside - side[None, :] * 1.2
    dist[:, ~valid] = np.minimum(dist[:, ~valid], -side[None, ~valid])
    alpha = gaussian_edge(dist, sigma) * box_fade()
    alpha[:EY, :] = 0
    alpha[EY + EH :, :] = 0
    alpha[:, :EX] = 0
    alpha[:, EX + EW :] = 0
    return alpha


def cover_eye_white(alpha: np.ndarray, idle: np.ndarray) -> np.ndarray:
    """Pull leftover sclera and iris in the eye box under the shut lid."""
    r, g, b, sat, lum = channels(idle)
    white = (r > 215) & (g > 195) & (b > 170) & (sat < 0.32) & (lum > 155)
    iris = (sat > 0.72) & (b < 70) & (r > 175) & ((r - b) > 145) & (g > 40) & (g < 170)
    specks = white | iris
    specks[:EY, :] = False
    specks[EY + EH :, :] = False
    specks[:, :EX] = False
    specks[:, EX + EW :] = False
    # Already covered by the shut band. Only the stragglers at the corners.
    specks &= alpha < 0.92
    if not np.any(specks):
        return alpha
    near = gaussian_filter(specks.astype(np.float32), 1.25)
    return np.maximum(alpha, np.clip(near * 1.45, 0.0, 1.0) * box_fade())


def clear_ghosts(paint: np.ndarray, lash: np.ndarray, y_top: np.ndarray, y_bot: np.ndarray) -> np.ndarray:
    """Repaint dark pixels that are not the lash with the lid's own shading.

    A copied skin row goes flat and reads as a rectangle. Dark ghosts are
    filled by interpolating the skin above and below them, so the shading
    stays continuous. The lash stroke itself is not touched and not blurred.
    """
    out = np.array(paint, np.float32, copy=True)
    lum = channels(np.clip(out, 0, 255).astype(np.uint8))[4]
    for x in range(out.shape[1]):
        if not np.isfinite(lash[x]) or not np.isfinite(y_top[x]) or not np.isfinite(y_bot[x]):
            continue
        y0 = int(max(EY, np.floor(y_top[x])))
        y1 = int(min(EY + EH - 1, np.ceil(y_bot[x])))
        if y1 - y0 < 4:
            continue
        lash_y = float(lash[x])
        skin = [y for y in range(y0, y1 + 1) if abs(y - lash_y) > 2.6 and lum[y, x] > 140]
        if len(skin) < 2:
            continue
        skin_a = np.asarray(skin)
        for y in range(y0, y1 + 1):
            if abs(y - lash_y) <= 2.6:
                continue
            above = skin_a[skin_a < y]
            below = skin_a[skin_a > y]
            if above.size and below.size:
                y_a = int(above[-1])
                y_b = int(below[0])
                span = max(y_b - y_a, 1)
                t = (y - y_a) / span
                fill = (1.0 - t) * out[y_a, x] + t * out[y_b, x]
            elif above.size:
                fill = out[int(above[-1]), x]
            elif below.size:
                fill = out[int(below[0]), x]
            else:
                continue
            # A second dark line above the lash is the old lid. Skin that is
            # already as light as the lid shading stays, so the paint does not
            # collapse into one flat colour.
            fill_lum = 0.25 * fill[0] + 0.60 * fill[1] + 0.10 * fill[2]
            if lum[y, x] < fill_lum - 22.0:
                out[y, x] = fill
    return out


def composite(idle: np.ndarray, painted: np.ndarray, alpha: np.ndarray, box: np.ndarray) -> np.ndarray:
    a = np.clip(alpha, 0.0, 1.0)
    a[box == 0] = 0
    out = idle.astype(np.float32) * (1.0 - a[:, :, None]) + painted * a[:, :, None]
    out = np.clip(out, 0, 255).astype(np.uint8)
    out[box == 0] = idle[box == 0]
    return out


def _bright_band(idle: np.ndarray, top: np.ndarray, bot: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Top and bottom of the actually bright iris/sclera inside each eye."""
    _r, _g, _b, _sat, lum = channels(idle)
    r = idle[:, :, 0].astype(np.float32)
    g = idle[:, :, 1].astype(np.float32)
    b = idle[:, :, 2].astype(np.float32)
    bright = ((lum > 165) & (r > 175)) | ((r > 210) & (g > 185) & (b > 150))
    bt = top.copy()
    bb = bot.copy()
    for x in range(idle.shape[1]):
        if not np.isfinite(top[x]) or not np.isfinite(bot[x]):
            continue
        y0 = int(max(EY, np.floor(top[x] - 2)))
        y1 = int(min(EY + EH - 1, np.ceil(bot[x] + 3)))
        ys = np.where(bright[y0 : y1 + 1, x])[0]
        if ys.size < 3:
            continue
        bt[x] = float(y0 + ys.min())
        bb[x] = float(y0 + ys.max())
    for x0, x1 in eye_spans(top):
        sl = slice(x0, x1 + 1)
        for curve in (bt, bb):
            idx = np.where(np.isfinite(curve[sl]))[0]
            if idx.size < 4:
                continue
            filled = np.interp(np.arange(x1 - x0 + 1), idx, curve[sl][idx])
            curve[sl] = gaussian_filter1d(filled, 2.2, mode="nearest")
    return bt, bb


def build_frames(idle: np.ndarray) -> dict[str, np.ndarray]:
    open_src = np.array(Image.open(SOURCE / "807_0s.png").convert("RGB"))
    half_src = np.array(Image.open(SOURCE / "807_7s.png").convert("RGB"))
    shut_src = np.array(Image.open(SOURCE / "807_8s.png").convert("RGB"))
    if open_src.shape != (1572, 1078, 3):
        raise SystemExit(f"807 open frame is {open_src.shape}, expected 1078×1572 RGB")
    # Coarse warp, then fold the brow's sub-pixel residual into one Lanczos sample.
    open_w = warp(open_src, (0.0, 0.0))
    dx, dy, score = brow_nudge(idle, open_w)
    print(f"open brow nudge {dx:.3f},{dy:.3f} corr {score:.3f}")
    half_coarse = warp(half_src, SHIFT_HALF, (dx, dy))
    hx, hy, hs = brow_nudge(idle, half_coarse)
    print(f"half brow nudge {hx:.3f},{hy:.3f} corr {hs:.3f}")
    half_w = match_skin(idle, warp(half_src, SHIFT_HALF, (dx + hx, dy + hy)))
    shut_coarse = warp(shut_src, SHIFT_SHUT, (dx, dy))
    sx, sy, ss = brow_nudge(idle, shut_coarse)
    print(f"shut brow nudge {sx:.3f},{sy:.3f} corr {ss:.3f}")
    shut_w = match_skin(idle, warp(shut_src, SHIFT_SHUT, (dx + sx, dy + sy)))

    top, bot = bright_opening(idle)
    spans = eye_spans(top)
    if len(spans) != 2:
        raise SystemExit(f"expected two eyes, found {spans}")
    for x0, x1 in spans:
        print(
            f"eye {x0}-{x1} top {np.nanmedian(top[x0:x1+1]):.1f} "
            f"bot {np.nanmedian(bot[x0:x1+1]):.1f}"
        )
    half_lash = lash_bottom(half_w, top, bot)
    shut_lash = lash_bottom(shut_w, top, bot)
    # Aim at the bright iris, not the dark lash that sits above it. Where a
    # column has no bright pixels, fall back to the opening curve.
    bright_top, bright_bot = _bright_band(idle, top, bot)
    height = np.maximum(bright_bot - bright_top, 4.0)
    lash02 = bright_top + LIGHT_DROP_FRAC * height
    lash03 = bright_top + HALF_DROP_FRAC * height
    lash04 = bright_top + 0.58 * height
    gap = float(np.nanmedian(lash03[np.isfinite(lash03)] - lash02[np.isfinite(lash02)]))
    print(
        f"lash y 02 {np.nanmedian(lash02):.1f}  03 {np.nanmedian(lash03):.1f}  "
        f"04 {np.nanmedian(lash04):.1f}  gap {gap:.2f}  "
        f"src7 {np.nanmedian(half_lash):.1f} src8 {np.nanmedian(shut_lash):.1f}"
    )
    if gap < 2.2:
        raise SystemExit("02 and 03 lashes are too close")

    anchor = top - 11.0
    light_paint = translate_lash(half_w, half_lash, lash02, anchor)
    half_paint = translate_lash(half_w, half_lash, lash03, anchor)
    shut_paint = translate_lash(shut_w, shut_lash, lash04, anchor)
    # The old upper lid is the dark line above the new lash. Paint it out with
    # the lid's own skin. The lash stroke is left untouched.
    shut_top = top - SHUT_ABOVE
    shut_bot = bot + SHUT_BELOW
    light_paint = clear_ghosts(light_paint, lash02, top - 6.0, lash02 + 1.0)
    half_paint = clear_ghosts(half_paint, lash03, top - 6.0, lash03 + 1.0)
    shut_paint = clear_ghosts(shut_paint, lash04, shut_top, shut_bot)

    # 02/03 cut on the lash with a tight edge so the stroke stays sharp.
    # 04 is opaque across the whole old opening; only its outer rim feathers.
    alpha02 = band_alpha(top - 5.0, lash02 + 0.35, LASH_EDGE_SIGMA)
    alpha03 = band_alpha(top - 6.0, lash03 + 0.35, LASH_EDGE_SIGMA)
    alpha04 = band_alpha(shut_top, shut_bot, FEATHER_SIGMA)
    alpha04 = cover_eye_white(alpha04, idle)
    box = eye_box()
    frames = {
        FRAMES[0]: idle.copy(),
        FRAMES[1]: composite(idle, light_paint, alpha02, box),
        FRAMES[2]: composite(idle, half_paint, alpha03, box),
        FRAMES[3]: composite(idle, shut_paint, alpha04, box),
    }
    check_frames(idle, frames)
    return frames


def eye_box_mask() -> np.ndarray:
    mask = np.zeros((1792, 1008), bool)
    mask[EY : EY + EH, EX : EX + EW] = True
    return mask


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


def check_frames(idle: np.ndarray, frames: dict[str, np.ndarray]) -> None:
    if not np.array_equal(frames[FRAMES[0]], idle):
        raise SystemExit("01 is not identical to idle.png")
    box = eye_box_mask()
    counts = {}
    for name in FRAMES:
        outside = max_abs_outside(frames[name], idle)
        iris_n, sclera_n = strict_counts(frames[name], box)
        counts[name] = (iris_n, sclera_n, outside)
        if outside != 0:
            raise SystemExit(f"{name} drifted outside the eye box (max {outside})")
        print(f"{name} iris {iris_n} sclera {sclera_n} outside_max {outside}")
    open_i, open_s, _ = counts[FRAMES[0]]
    drop_i, drop_s, _ = counts[FRAMES[1]]
    half_i, half_s, _ = counts[FRAMES[2]]
    shut_i, shut_s, _ = counts[FRAMES[3]]
    if open_i < 80 or open_s < 40:
        raise SystemExit("open eye lost its iris or sclera before the transplant")
    if not (drop_i > half_i > shut_i):
        raise SystemExit(f"iris did not step down {drop_i} > {half_i} > {shut_i}")
    if shut_i != 0 or shut_s != 0:
        raise SystemExit(f"04 still shows the eye (iris {shut_i} sclera {shut_s})")
    # 03 cuts the iris by about half. 02 stays a light drop, so most of the iris remains.
    # Strict iris sits in the upper opening, so a lid through the visual middle
    # keeps a slit of it. The readable lower iris is checked by eye on the strip.
    if not (4 <= half_i <= 0.9 * open_i):
        raise SystemExit(f"03 iris {half_i} is not a half of open {open_i}")
    if drop_i < 0.2 * open_i:
        raise SystemExit(f"02 closed too far (iris {drop_i} vs open {open_i})")
    if not (drop_s > half_s >= shut_s):
        raise SystemExit(f"sclera did not step down {drop_s} > {half_s} >= {shut_s}")


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
    zoom = 3
    for name in FRAMES:
        crop = Image.fromarray(frames[name][EY : EY + EH, EX : EX + EW])
        eyes.append(crop.resize((EW * zoom, EH * zoom), Image.Resampling.LANCZOS))
    ew2, eh2 = eyes[0].size
    band = Image.new("RGB", (len(eyes) * ew2 + (len(eyes) - 1) * gap, eh2), (28, 24, 32))
    for i, crop in enumerate(eyes):
        band.paste(crop, (i * (ew2 + gap), 0))
    band.save(BAKED / "proof_eyes.png", format="PNG", optimize=True)
    # Flush 3× strip, no gap, the art-review crop of 01–04.
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
