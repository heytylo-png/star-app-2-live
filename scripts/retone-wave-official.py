#!/usr/bin/env python3
"""Retone official full-body wave skin to the live plate cheek, punch studio white.

Source: public/rai/wave_official.png (dark 720×1280 sheet TyLo flagged).
Tone target: live public/star-rai/poses/wave.png cheek ~ (221, 150, 116).
Secondary: official idle/talk highlight peach.

Does not touch public/star-rai/poses/wave.png (live crop already matched).
Does not rewrite the Pages plate pipeline — replaces the body-pack PNG only.

Output: public/rai/wave_official.png as 1008×1792 RGBA (idle canvas, 9:16).
1152×1728 live crop would lose socks/shoes; documented in the PR.
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public/rai/wave_official.png"
LIVE = ROOT / "public/star-rai/poses/wave.png"
OUT = ROOT / "public/rai/wave_official.png"
COMPARE = Path("/tmp/wave-retone-compare.png")

# Live plate cheek (TyLo). Mid-face tan, not the hottest blush.
TARGET_CHEEK = np.array([221.0, 150.0, 116.0], dtype=np.float32)
# Dark-wave face mid sampled at (385, 245) / forehead cluster.
SOURCE_CHEEK = np.array([214.0, 130.0, 94.0], dtype=np.float32)

OUT_W, OUT_H = 1008, 1792  # match official idle; same 9:16 as 720×1280

STUDIO_LUMA_MIN = 238
STUDIO_CHROMA_MAX = 18
FRINGE_LUMA_MIN = 200
FRINGE_CHROMA_MAX = 32


def rgb_to_hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    r = rgb[:, :, 0] / 255.0
    g = rgb[:, :, 1] / 255.0
    b = rgb[:, :, 2] / 255.0
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    df = mx - mn
    h = np.zeros_like(mx)
    mask = df > 1e-6
    m = mask & (mx == r)
    h[m] = np.mod((g[m] - b[m]) / df[m], 6.0)
    m = mask & (mx == g)
    h[m] = (b[m] - r[m]) / df[m] + 2.0
    m = mask & (mx == b)
    h[m] = (r[m] - g[m]) / df[m] + 4.0
    h = h * 60.0
    s = np.where(mx > 1e-6, df / np.maximum(mx, 1e-6), 0.0)
    return h, s, mx


def skin_weight(arr: np.ndarray) -> np.ndarray:
    """Soft 0..1 weight for tan skin (face, arms, legs). Not hair/navy/bow/shirt/shoes."""
    rgb = arr[:, :, :3].astype(np.float32)
    a = arr[:, :, 3].astype(np.float32)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    h, s, v = rgb_to_hsv(rgb)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    chroma = mx - mn
    h_h, w = arr.shape[:2]
    yy = np.arange(h_h, dtype=np.float32)[:, None]

    # Core tan: orange hue, R leads G leads B, enough chroma to skip shirt gray.
    hue_ok = ((h >= 6.0) & (h <= 42.0)).astype(np.float32)
    rg = r - g
    rb = r - b
    gb = g - b
    lead = np.clip((rg - 42.0) / 18.0, 0.0, 1.0) * np.clip((rb - 50.0) / 18.0, 0.0, 1.0)
    lead *= np.clip((gb + 8.0) / 10.0, 0.0, 1.0)
    sat = np.clip((s - 0.16) / 0.10, 0.0, 1.0) * np.clip((0.70 - s) / 0.10, 0.0, 1.0)
    val = np.clip((v - 0.30) / 0.10, 0.0, 1.0) * np.clip((0.97 - v) / 0.04, 0.0, 1.0)
    chroma_ok = np.clip((chroma - 28.0) / 16.0, 0.0, 1.0)
    alpha_ok = np.clip((a - 200.0) / 40.0, 0.0, 1.0)

    wgt = hue_ok * lead * sat * val * chroma_ok * alpha_ok

    # Navy skirt/socks (blue-black, B leads).
    navy = ((b >= g - 2) & (b >= r - 2) & (v < 0.42) & (chroma < 55)).astype(np.float32)
    wgt *= 1.0 - navy

    # Red bow / lips: hue near 0 with high sat.
    red = (((h < 8.0) | (h > 348.0)) & (s > 0.50) & (v > 0.30)).astype(np.float32)
    wgt *= 1.0 - red

    # White / cool shirt (low sat, high value) — keep blouse highlights.
    shirt = ((s < 0.18) & (v > 0.72) & (rg < 48)).astype(np.float32)
    wgt *= 1.0 - shirt

    # Loafers: lower canvas, darker brown.
    shoes = (yy > h_h * 0.88).astype(np.float32) * np.clip((0.48 - v) / 0.12, 0.0, 1.0)
    wgt *= 1.0 - np.clip(shoes, 0.0, 1.0)

    return np.clip(wgt, 0.0, 1.0)


def soften(weight: np.ndarray, radius: int = 2) -> np.ndarray:
    img = Image.fromarray((np.clip(weight, 0, 1) * 255).astype(np.uint8), mode="L")
    img = img.filter(ImageFilter.GaussianBlur(radius=radius))
    return np.array(img).astype(np.float32) / 255.0


def retone_skin(arr: np.ndarray, weight: np.ndarray) -> np.ndarray:
    """Lift muddy tan toward live cheek without crushing blacks or clipping highlights.

    Multiplicative match of the sampled face mid to TARGET_CHEEK, with a highlight
    rolloff so palms/thigh sheen (already brighter) do not go neon.
    """
    rgb = arr[:, :, :3].astype(np.float32)
    scale = TARGET_CHEEK / np.maximum(SOURCE_CHEEK, 1.0)
    # Highlight rolloff: full strength near source cheek, fade as R exceeds ~230.
    r = rgb[:, :, 0]
    strength = np.clip((238.0 - r) / (238.0 - SOURCE_CHEEK[0]), 0.0, 1.0)
    # Keep some of the match even on highlights (chroma), but less luma lift.
    strength = 0.22 + 0.78 * strength
    strength *= weight

    out = rgb * (1.0 + (scale[None, None, :] - 1.0) * strength[:, :, None])
    out = np.clip(out, 0.0, 255.0)

    result = arr.copy()
    result[:, :, :3] = np.round(out).astype(np.uint8)
    return result


def is_studio_white_arr(rgb: np.ndarray, a: np.ndarray) -> np.ndarray:
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    return (a >= 8) & (mn >= STUDIO_LUMA_MIN) & ((mx - mn) <= STUDIO_CHROMA_MAX)


def ground_shadow_mask(arr: np.ndarray) -> np.ndarray:
    """Soft contact shadow under the loafers (bridges the shoes and traps leg-gap white)."""
    h, _w = arr.shape[:2]
    rgb = arr[:, :, :3].astype(np.int16)
    a = arr[:, :, 3]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    chroma = mx - mn
    yy = np.arange(h)[:, None]
    return (a > 8) & (yy > int(h * 0.88)) & (mn > 150) & (chroma <= 50) & (mx < 252)


def punch_studio_white(arr: np.ndarray) -> np.ndarray:
    """Edge flood-fill of studio white + ground shadow, then fringe fade.

    Ground shadow is included in the flood so the gap between the loafers opens
    and between-leg plate can clear. Shirt-interior highlights stay — they are
    not edge-connected. Matches src/lib/punch-white.ts plus the shoe-shadow hole.
    """
    h, w = arr.shape[:2]
    data = arr.copy()
    rgb = data[:, :, :3]
    a = data[:, :, 3]
    studio = is_studio_white_arr(rgb, a) | ground_shadow_mask(data)
    seen = np.zeros((h, w), dtype=np.uint8)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if x < 0 or y < 0 or x >= w or y >= h:
            return
        if seen[y, x] or not studio[y, x]:
            return
        seen[y, x] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(1, h - 1):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.pop()
        data[y, x] = 0
        studio[y, x] = False
        push(x - 1, y)
        push(x + 1, y)
        push(x, y - 1)
        push(x, y + 1)

    # Ahoge loop can trap a small studio-white island at the crown.
    punch_small_white_islands(data, y_max=int(h * 0.20), max_area=2500)

    r, g, b, aa = (data[:, :, i] for i in range(4))
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    fringe = (aa > 0) & (mn >= FRINGE_LUMA_MIN) & ((mx - mn) <= FRINGE_CHROMA_MAX)
    clear = aa == 0
    neigh = np.zeros((h, w), dtype=bool)
    neigh[:, 1:] |= clear[:, :-1]
    neigh[:, :-1] |= clear[:, 1:]
    neigh[1:, :] |= clear[:-1, :]
    neigh[:-1, :] |= clear[1:, :]
    # 8-connected fringe so hair AA against the plate fades.
    neigh[1:, 1:] |= clear[:-1, :-1]
    neigh[1:, :-1] |= clear[:-1, 1:]
    neigh[:-1, 1:] |= clear[1:, :-1]
    neigh[:-1, :-1] |= clear[1:, 1:]
    t = np.clip((mn.astype(np.float32) - FRINGE_LUMA_MIN) / (255 - FRINGE_LUMA_MIN), 0, 1)
    fade = fringe & neigh
    data[:, :, 3] = np.where(fade, np.round(aa * (1 - t)).astype(np.uint8), aa)
    return data


def punch_small_white_islands(data: np.ndarray, y_max: int, max_area: int) -> None:
    """Clear enclosed studio-white blobs in the hair zone (ahoge hole). In-place."""
    h, w = data.shape[:2]
    rgb = data[:, :, :3]
    a = data[:, :, 3]
    studio = is_studio_white_arr(rgb, a) & (np.arange(h)[:, None] <= y_max)
    seen = np.zeros((h, w), dtype=np.uint8)
    for y0 in range(y_max + 1):
        for x0 in range(w):
            if seen[y0, x0] or not studio[y0, x0]:
                continue
            stack = [(x0, y0)]
            seen[y0, x0] = 1
            blob: list[tuple[int, int]] = []
            while stack:
                x, y = stack.pop()
                blob.append((x, y))
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h or ny > y_max:
                        continue
                    if seen[ny, nx] or not studio[ny, nx]:
                        continue
                    seen[ny, nx] = 1
                    stack.append((nx, ny))
            if 4 <= len(blob) <= max_area:
                for x, y in blob:
                    data[y, x] = 0


def fit_idle_canvas(arr: np.ndarray) -> np.ndarray:
    """720×1280 (9:16) → 1008×1792, same framing as official idle."""
    img = Image.fromarray(arr, mode="RGBA")
    img = img.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
    return np.array(img)


def checkerboard(w: int, h: int, cell: int = 24) -> Image.Image:
    img = Image.new("RGB", (w, h), (235, 235, 235))
    px = np.array(img)
    yy, xx = np.indices((h, w))
    alt = ((xx // cell) + (yy // cell)) % 2 == 0
    px[alt] = (210, 210, 214)
    return Image.fromarray(px)


def composite_on(bg: Image.Image, fg: Image.Image) -> Image.Image:
    canvas = bg.convert("RGBA")
    layer = fg.convert("RGBA")
    if layer.size != canvas.size:
        layer = layer.resize(canvas.size, Image.Resampling.LANCZOS)
    return Image.alpha_composite(canvas, layer).convert("RGB")


def label(img: Image.Image, text: str) -> Image.Image:
    pad = 44
    out = Image.new("RGB", (img.width, img.height + pad), (18, 18, 22))
    out.paste(img, (0, pad))
    d = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
    d.text((16, 10), text, fill=(245, 245, 245), font=font)
    return out


def build_compare(before: Image.Image, after: np.ndarray, live_path: Path, dest: Path) -> None:
    after_img = Image.fromarray(after, mode="RGBA")
    live = Image.open(live_path).convert("RGBA")

    # Common preview height; keep aspect. Checker shows punched alpha.
    ph = 960
    def fit_h(im: Image.Image) -> Image.Image:
        w = max(1, round(im.width * ph / im.height))
        return im.resize((w, ph), Image.Resampling.LANCZOS)

    b = fit_h(before.convert("RGBA"))
    a = fit_h(after_img)
    # Live is a tighter 3/4 crop — scale so heads read at similar size.
    l = fit_h(live)

    checker_b = checkerboard(b.width, b.height)
    checker_a = checkerboard(a.width, a.height)
    checker_l = checkerboard(l.width, l.height)
    # Before still has a white plate; show it as-is (the too-dark sheet).
    panel_b = label(b.convert("RGB"), "before  dark wave_official")
    panel_a = label(composite_on(checker_a, a), "retone  body pack  1008×1792 RGBA")
    panel_l = label(composite_on(checker_l, l), "live wave.png  cheek target")

    gap = 16
    w = panel_b.width + panel_a.width + panel_l.width + gap * 4
    h = max(panel_b.height, panel_a.height, panel_l.height) + gap * 2
    canvas = Image.new("RGB", (w, h), (18, 18, 22))
    x = gap
    for p in (panel_b, panel_a, panel_l):
        canvas.paste(p, (x, gap))
        x += p.width + gap
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dest, "PNG")
    print(f"wrote compare {dest} {canvas.size}")


def main() -> None:
    src_path = SRC
    backup = Path("/tmp/wave_official_before.png")
    probe = Image.open(src_path)
    if probe.size != (720, 1280) and backup.exists():
        src_path = backup
        probe = Image.open(src_path)
    src_img = probe.convert("RGBA")
    before = src_img.copy()
    arr = np.array(src_img)
    print(f"source {src_path} {arr.shape[1]}x{arr.shape[0]} {src_img.mode}")

    wgt = skin_weight(arr)
    wgt = soften(wgt, radius=1)
    print(f"skin weight mean={wgt.mean():.4f} max={wgt.max():.3f} p50={np.median(wgt[wgt>0.1]) if (wgt>0.1).any() else 0:.3f}")

    # Debug overlay for local inspection.
    overlay = arr.copy()
    heat = (wgt * 255).astype(np.uint8)
    overlay[:, :, 0] = np.maximum(overlay[:, :, 0], heat)
    overlay[:, :, 1] = (overlay[:, :, 1].astype(np.uint16) * (1 - wgt * 0.4)).astype(np.uint8)
    Image.fromarray(overlay).save("/tmp/wave_skin_mask.png")

    retone = retone_skin(arr, wgt)
    punched = punch_studio_white(retone)
    out = fit_idle_canvas(punched)

    # Verify cheek after scale-to-idle (sample scaled coords 385,245 → *1.4)
    cx, cy = int(385 * OUT_W / 720), int(245 * OUT_H / 1280)
    cheek = out[cy, cx, :3]
    print(f"output cheek @({cx},{cy}) {tuple(int(v) for v in cheek)}  target {tuple(TARGET_CHEEK.astype(int))}")
    print(f"alpha zero share {(out[:,:,3]==0).mean():.3f}  opaque {(out[:,:,3]==255).mean():.3f}")

    Image.fromarray(out, mode="RGBA").save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} {OUT_W}x{OUT_H} {OUT.stat().st_size} bytes")

    build_compare(before, out, LIVE, COMPARE)


if __name__ == "__main__":
    main()
