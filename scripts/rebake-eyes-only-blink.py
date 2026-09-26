#!/usr/bin/env python3
"""Rebake idle blink sheets by transplanting 807 lids onto idle.png.

Frame 01 is a byte copy of public/rai/idle.png. Frames 02–04 change only
pixels inside the eye box (420, 185, 210, 70). The 807 video is a different
crop, so the open frame is registered to idle's eyes (sub-pixel, Lanczos)
and that same scale is used for the blink frames, plus a per-frame brow shift.

The source snaps from open to half in one frame (about 6.88s to 6.89s). There
is no photographed pose between them. 03 is the 807 lid at 7s. 04 is 807 at
8s across the whole socket, so the iris and sclera are gone and the painted
lash stays continuous. 02 warps that same 7s lid part of the way toward the
open eye, so the upper lid is lowered and the iris stays readable.

Masks are smooth distance fields with a Gaussian edge. No square morphology,
no nearest-neighbour resample, no binary cutout.

Runtime blink stays parked: IDLE_BLINK_ENABLED is false in src/lib/rai.ts.
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
# 02 sits this far along the open → 7s lid travel. 03 is the full 7s lid.
LIGHT_DROP_T = 0.34
# Gaussian edge. Width from ~10% to ~90% is about 2.6*sigma, so 1.7 ≈ 4.4px.
FEATHER_SIGMA = 1.75

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


def lash_bottom(im: np.ndarray, top: np.ndarray, bot: np.ndarray) -> np.ndarray:
    """Bottom row of the dark upper-lid stroke. NaN where the stroke is missing."""
    lum = channels(im)[4]
    out = np.full(im.shape[1], np.nan)
    for x in range(im.shape[1]):
        if np.isnan(top[x]) or np.isnan(bot[x]):
            continue
        t = int(max(EY, np.floor(top[x] - 4)))
        b = int(min(EY + EH - 2, np.ceil(bot[x])))
        if b - t < 6:
            continue
        col = lum[t : b + 1, x]
        seen = False
        start = None
        for i, v in enumerate(col):
            if v > 125:
                seen = True
            if seen and v < 85:
                start = i
                break
        if start is None:
            continue
        end = start
        while end + 1 < col.size and col[end + 1] < 115:
            end += 1
        out[x] = float(t + end)
    for x0, x1 in eye_spans(top):
        filled = _fill_span(out[x0 : x1 + 1])
        known = ~np.isnan(filled)
        if int(known.sum()) < 4:
            continue
        med = float(np.nanmedian(filled))
        filled = np.where(known, filled, med)
        out[x0 : x1 + 1] = gaussian_filter1d(filled, 2.6, mode="nearest")
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


def lift_lid(src: np.ndarray, lash_src: np.ndarray, lash_dst: np.ndarray, anchor: np.ndarray) -> np.ndarray:
    """Move the 7s lash up onto `lash_dst`. One Lanczos resample.

    Rows at `anchor` stay put. Below the destination lash the sample holds,
    and the mask (not this remap) is what reveals idle's iris.
    """
    h, w = src.shape[:2]
    map_x = np.tile(np.arange(w, dtype=np.float32), (h, 1))
    map_y = np.tile(np.arange(h, dtype=np.float32)[:, None], (1, w))
    ys = np.arange(h, dtype=np.float32)[:, None]
    span = lash_dst - anchor
    safe = np.isfinite(lash_src) & np.isfinite(lash_dst) & np.isfinite(anchor) & (np.abs(span) > 1.5)
    t = np.zeros((h, w), np.float32)
    t[:, safe] = (ys - anchor[None, safe]) / span[None, safe]
    src_y = anchor[None, :] + t * (lash_src - anchor)[None, :]
    use = safe[None, :] & (t > -0.25) & (t < 1.35)
    map_y = np.where(use, src_y, map_y).astype(np.float32)
    return cv2.remap(src, map_x, map_y, interpolation=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)


def lid_alpha(top: np.ndarray, bot: np.ndarray, lash: np.ndarray, fade: np.ndarray) -> np.ndarray:
    """Socket, cut on the lash, with a Gaussian edge and no rectangular clip."""
    h = 1792
    yy = np.arange(h, dtype=np.float32)[:, None]
    valid = np.isfinite(top) & np.isfinite(bot) & np.isfinite(lash)
    top_f = np.where(valid, top, 0).astype(np.float32)
    bot_f = np.where(valid, bot, 0).astype(np.float32)
    # The cut sits just under the lash stroke so the painted lash stays opaque.
    cut = np.where(valid, lash + 1.6, 0).astype(np.float32)
    sock = np.minimum(yy - (top_f[None, :] - 1.5), bot_f[None, :] - yy)
    above_cut = cut[None, :] - yy
    dist = np.minimum(sock, above_cut)
    dist[:, ~valid] = -48
    # Side falloff lives in curve_distance's ends; apply it here too.
    side = curve_distance(np.where(valid, top, np.nan), np.where(valid, bot, np.nan))
    dist = np.minimum(dist, side)
    return gaussian_edge(dist) * fade


def shut_alpha(top: np.ndarray, bot: np.ndarray, fade: np.ndarray) -> np.ndarray:
    # Pad the band a little so the lash, which sits inside it, is not feathered away.
    top_p = np.where(np.isnan(top), np.nan, top - 2.0)
    bot_p = np.where(np.isnan(bot), np.nan, bot + 2.0)
    return gaussian_edge(curve_distance(top_p, bot_p)) * fade


def composite(idle: np.ndarray, painted: np.ndarray, alpha: np.ndarray, hair: np.ndarray, box: np.ndarray) -> np.ndarray:
    a = np.clip(alpha * (1.0 - hair), 0.0, 1.0)
    a[box == 0] = 0
    out = idle.astype(np.float32) * (1.0 - a[:, :, None]) + painted * a[:, :, None]
    out = np.clip(out, 0, 255).astype(np.uint8)
    out[box == 0] = idle[box == 0]
    return out


def opening_from_curves(top: np.ndarray, bot: np.ndarray) -> np.ndarray:
    dist = curve_distance(top, bot)
    return dist > 0


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
    open_w = warp(open_src, (0.0, 0.0), (dx, dy))
    half_coarse = warp(half_src, SHIFT_HALF, (dx, dy))
    hx, hy, hs = brow_nudge(idle, half_coarse)
    print(f"half brow nudge {hx:.3f},{hy:.3f} corr {hs:.3f}")
    half_w = warp(half_src, SHIFT_HALF, (dx + hx, dy + hy))
    shut_coarse = warp(shut_src, SHIFT_SHUT, (dx, dy))
    sx, sy, ss = brow_nudge(idle, shut_coarse)
    print(f"shut brow nudge {sx:.3f},{sy:.3f} corr {ss:.3f}")
    shut_w = warp(shut_src, SHIFT_SHUT, (dx + sx, dy + sy))

    top, bot = socket_curves(idle)
    if not eye_spans(top):
        raise SystemExit("no eye outline in idle.png")
    half_lash = lash_bottom(half_w, top, bot)
    travel = half_lash - top
    known = np.isfinite(travel)
    if int(known.sum()) < 10:
        raise SystemExit("could not find the 7s lash")
    med_travel = float(np.median(travel[known]))
    print(f"7s lid travel median {med_travel:.2f}px over {int(known.sum())} columns")
    if med_travel < 4:
        raise SystemExit("7s lid did not drop far enough to separate 02 from 03")
    # Where a column missed the stroke, use the eye's median travel.
    for x0, x1 in eye_spans(top):
        sl = slice(x0, x1 + 1)
        local = travel[sl]
        fill = float(np.nanmedian(local)) if np.isfinite(local).any() else med_travel
        half_lash[sl] = np.where(np.isfinite(half_lash[sl]), half_lash[sl], top[sl] + fill)
        half_lash[sl] = gaussian_filter1d(half_lash[sl], 1.8, mode="nearest")
    lash02 = top + LIGHT_DROP_T * (half_lash - top)
    gap = float(np.nanmedian((half_lash - lash02)[np.isfinite(half_lash)]))
    print(f"02 vs 03 lash gap {gap:.2f}px")
    if gap < 4:
        raise SystemExit("02 and 03 lashes are too close")

    anchor = top - 8.0
    half_paint = match_skin(idle, half_w)
    shut_paint = match_skin(idle, shut_w)
    light_paint = lift_lid(half_paint, half_lash, lash02, anchor)

    fade = box_fade()
    box = eye_box()
    alpha02 = lid_alpha(top, bot, lash02, fade)
    alpha03 = lid_alpha(top, bot, half_lash, fade)
    alpha04 = shut_alpha(top, bot, fade)
    hair02 = hair_weight(idle, light_paint, top)
    hair03 = hair_weight(idle, half_paint, top)
    hair04 = hair_weight(idle, shut_paint, top)
    frames = {
        FRAMES[0]: idle.copy(),
        FRAMES[1]: composite(idle, light_paint, alpha02, hair02, box),
        FRAMES[2]: composite(idle, half_paint, alpha03, hair03, box),
        FRAMES[3]: composite(idle, shut_paint, alpha04, hair04, box),
    }
    opening = opening_from_curves(top, bot)
    check_frames(idle, frames, opening)
    print(
        f"socket {int(opening.sum())} hair02 {float(hair02[box == 1].mean()):.3f} "
        f"hair04 {float(hair04[box == 1].mean()):.3f}"
    )
    return frames


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
    if open_i < 80 or open_s < 40:
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
