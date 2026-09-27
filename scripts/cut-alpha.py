#!/usr/bin/env python3
"""Cut Star Rai's idle sheet (and the four baked blink frames) to true RGBA.

Sources (RGB on studio white, never modified; the pre-alpha baked sheets):
  artifacts/star-rai-alpha/rgb-src/idle_blink_0{1..4}_*.png   (01 == the old RGB idle.png bytes)
Outputs:
  artifacts/star-rai-alpha/idle_alpha.png        one 8-bit alpha mask (1008x1792)
  artifacts/star-rai-alpha/pockets.png           review map of what was removed
  public/rai/idle.png                            RGBA
  public/rai/idle_blink_01_open.png              byte copy of the new idle.png
  public/rai/idle_blink_0{2,3,4}_*.png           RGBA, same alpha mask
  artifacts/star-rai-blink-frames/baked/*.png    byte copies of the public frames (drift test)

Method
  1. Studio white = the runtime's own test (min channel >= 238, chroma <= 18), 4-connected,
     the same as src/lib/punch-white.ts. The threshold is NOT loosened.
  2. Background = white connected to the sheet edge + ENCLOSED white pockets picked by explicit
     seed points (ahoge loop, leg gap, arm/body gaps, hand gap, shoe-edge slivers) + every
     enclosed white component whose centroid sits in the two hair-halo zones (gaps between the
     outer hair strands, above the shoulders, outside the face). All other enclosed white stays
     opaque: shirt, collar, eye whites, skirt stripes, highlights.
  3. Soft edge: walk inward from the background while luma keeps falling (the antialias ramp
     toward an outline / hair / shadow) and un-mix the white matte there:
        a = (255 - L) / (255 - L_fg),  c = (O - (1 - a) * 255) / a   (clamped)
     L_fg is the darkest non-background luma within 3px; in the hair zone and under the feet it
     is capped at hair / shadow darkness so thin grey strands and the floor shadow become
     translucent dark instead of opaque grey.
  4. The same mask is applied to all five frames. Frames differ only inside the eye box, which
     is fully opaque, so RGB outside the eyes stays identical across frames.
"""
import hashlib, os, shutil, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "artifacts/star-rai-alpha/rgb-src")
BAKED = os.path.join(ROOT, "artifacts/star-rai-blink-frames/baked")
OUT = os.path.join(ROOT, "artifacts/star-rai-alpha")
PUB = os.path.join(ROOT, "public/rai")
FRAMES = ["idle_blink_01_open.png", "idle_blink_02_closing.png", "idle_blink_03_half.png", "idle_blink_04_closed.png"]
EYE_BOX = (420, 185, 630, 255)  # x0, y0, x1, y1 — the only place the blink frames differ

STUDIO_LUMA_MIN, STUDIO_CHROMA_MAX = 238, 18  # == punch-white.ts

# Explicit seeds (x, y) inside enclosed background pockets. Each fills its 4-connected white component.
SEEDS = {
    "ahoge loop": [(404, 90)],
    "leg gap (thighs to shoes)": [(510, 1488), (523, 1680)],
    "arm/body gap, her right (viewer left)": [(400, 610)],
    "arm/body gap, her left (viewer right)": [(621, 608), (643, 722), (647, 734),
                                              (649, 741), (652, 752), (659, 773), (660, 776), (660, 780), (662, 788)],
    "hand/skirt gap, viewer right": [(689, 935)],
    "shoe-edge slivers": [(412, 1678), (609, 1693)],
}
# Hair-halo zones: enclosed white whose centroid is in here is background (gaps between outer strands).
HAIR_ZONES = [(0, 0, 415, 345), (625, 150, 1008, 345)]  # x0, y0, x1, y1 (centroid test)
HAIR_FG_LUMA = 40      # thin strands in the hair zone un-mix toward dark hair
HAIR_UNMIX_ZONE = (0, 0, 1008, 330)
HAIR_SPECK_LUMA = 145
HAIR_BUMP_LUMA = 100
FLOOR_ZONE = (0, 1640, 1008, 1792)
FLOOR_BUMP_LUMA = 80
FLOOR_FG_LUMA = 40
FLOOR_WHITE = 240.0  # luma where the studio-white test stops (min channel 238)     # floor shadow becomes translucent dark
RAMP_DEPTH, FLOOR_RAMP_DEPTH, RAMP_TOL = 6, 90, 4.0
LOW_ALPHA_LO, LOW_ALPHA_HI = 0.15, 0.40  # colour blend band for faint edge pixels


def load_rgb(path):
    im = Image.open(path)
    assert im.mode == "RGB", f"{path} is {im.mode}; sources must be the RGB baked sheets"
    return np.asarray(im).copy()


def luma(a):
    a = a.astype(np.float64)
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def zone_mask(shape, box):
    m = np.zeros(shape, bool)
    x0, y0, x1, y1 = box
    m[y0:y1, x0:x1] = True
    return m


def build_mask(rgb):
    h, w, _ = rgb.shape
    mx, mn = rgb.max(2).astype(int), rgb.min(2).astype(int)
    white = (mn >= STUDIO_LUMA_MIN) & (mx - mn <= STUDIO_CHROMA_MAX)
    lab, n = ndi.label(white)  # 4-connected, like the runtime flood fill
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    picked = {}
    for name, pts in SEEDS.items():
        for x, y in pts:
            l = int(lab[y, x])
            assert l and l not in edge, f"seed {name} {x,y} is not in an enclosed white pocket"
            picked[l] = name
    cms = ndi.center_of_mass(white, lab, range(1, n + 1))
    for l in range(1, n + 1):
        if l in edge or l in picked:
            continue
        cy, cx = cms[l - 1]
        if any(x0 <= cx < x1 and y0 <= cy < y1 for x0, y0, x1, y1 in HAIR_ZONES):
            picked[l] = "hair halo gap"
    bg = np.isin(lab, list(edge) + list(picked))

    L = luma(rgb)
    # Antialias ramp: from the background inward while luma keeps falling.
    floor = zone_mask(bg.shape, FLOOR_ZONE)
    depth_cap = np.where(floor, FLOOR_RAMP_DEPTH, RAMP_DEPTH)
    ramp = np.zeros_like(bg)
    # The ramp only advances outward, one ring per step (city-block distance k from the
    # background), so it cannot leak sideways along a thin strand's interior.
    ring = ndi.distance_transform_cdt(~bg, metric="taxicab")
    prevL = np.where(bg, 255.0, -1.0)
    for k in range(1, FLOOR_RAMP_DEPTH + 1):
        best = np.full(bg.shape, -1.0)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            best = np.maximum(best, np.roll(np.roll(prevL, dy, 0), dx, 1))
        cand = ~bg & ~ramp & (best >= 0) & (L <= best + RAMP_TOL) & (k <= depth_cap) & (ring == k)
        if not cand.any():
            break
        ramp |= cand
        prevL = np.where(cand, L, -1.0)
    # Hair zone: light pixels caught between the ramp and a thin strand (local luma bumps inside
    # a 1-3px line) are coverage, not highlight; un-mix them too so no light specks remain.
    # Enclosed studio-white that stays (shirt, collar, eye whites, stripes) is never softened
    # by the hair rules; only specks of 6px or less can be.
    csz = np.bincount(lab.ravel())
    kept_white = white & ~bg & (csz[lab] > 6)
    hair_gaps = np.isin(lab, [l for l, nm in picked.items() if nm == "hair halo gap"])
    hz = zone_mask(bg.shape, HAIR_UNMIX_ZONE) | ndi.binary_dilation(hair_gaps, iterations=3)
    for _ in range(2):
        touch = ndi.binary_dilation(bg | ramp, structure=np.ones((3, 3), bool))
        ramp |= hz & touch & ~bg & ~ramp & ~kept_white & (L > HAIR_SPECK_LUMA)
    # Hair zone: a mid-grey pixel (L > 100) sitting right against a still-light ramp pixel is the
    # tail of that antialias ramp (the luma bumped up by a hair's width), not a highlight. Real
    # highlights on the hair rim sit behind the dark outline, whose ramp pixels are dark.
    for _ in range(2):
        lr = ramp & (L > HAIR_BUMP_LUMA)
        t4 = ndi.binary_dilation(lr)  # 4-neighbour touch
        ramp |= hz & t4 & ~bg & ~ramp & ~kept_white & (L > HAIR_BUMP_LUMA) & (ring <= 3)
    # Floor: the soft shadow under the shoes is reached from the background through light pixels
    # (L > 150); shoe highlights are walled in by brown leather and are never reached.
    floor_soft = ndi.binary_propagation(bg & floor, mask=(bg | (L > 150)) & floor) & ~bg
    ramp |= floor_soft
    # Floor: grey antialias pixels between the shadow and the shoe's dark outline (neutral, L > 80,
    # right against a lighter soft pixel) are the tail of that ramp, not leather.
    chroma = mx - mn
    for _ in range(2):
        lr = (ramp | bg) & floor & (L > 150)
        lr |= ramp & floor & (L > FLOOR_BUMP_LUMA)
        ramp |= floor & ndi.binary_dilation(lr) & ~bg & ~ramp & (L > FLOOR_BUMP_LUMA) & (chroma < 24)
    # Anywhere: tiny light islands (<= 6px) left opaque against the background are matte, not art.
    light = ~bg & ~ramp & (L > 200)
    ilab, ni = ndi.label(light, structure=np.ones((3, 3), bool))
    if ni:
        isz = ndi.sum(light, ilab, range(1, ni + 1))
        touch = ndi.binary_dilation(bg | ramp, structure=np.ones((3, 3), bool))
        tl = np.unique(ilab[touch & light])
        tiny = [l for l in tl if l and isz[l - 1] <= 6]
        ramp |= np.isin(ilab, tiny)
    # Background pixels touching the figure also get un-mixed (their faint coverage), not a hard step.
    near = bg & ndi.binary_dilation(~bg, iterations=2)
    soft = ramp | near

    Lfg = ndi.minimum_filter(np.where(bg, 255.0, L), size=7)
    Lfg = np.where(hz, np.minimum(Lfg, HAIR_FG_LUMA), Lfg)
    Lfg = np.where(floor, np.minimum(Lfg, FLOOR_FG_LUMA), Lfg)
    denom = 255.0 - Lfg
    a = np.ones(bg.shape)
    a[bg] = 0.0
    ok = soft & (denom >= 40)
    a[ok] = np.clip((255.0 - L[ok]) / denom[ok], 0, 1)
    a[soft & ~ok & bg] = 0.0
    # Floor shadow: the studio card fades 251 -> 238 into the shadow, and the white test cuts it at
    # 238, so un-mixing against pure 255 starts the shadow at ~8% alpha on a hard line (a seam where
    # the leg gap meets the floor). Un-mix the shadow against the cut-off white instead, so alpha
    # rises from 0 exactly where the background ends.
    matte = np.full(bg.shape, 255.0)
    shadow = floor & (floor_soft | (near & ndi.binary_dilation(floor_soft, iterations=2))) & ok
    matte[shadow] = FLOOR_WHITE
    a[shadow] = np.clip((FLOOR_WHITE - L[shadow]) / (FLOOR_WHITE - Lfg[shadow]), 0, 1)
    # Stray soft pixels inside the opaque figure: a partly transparent pixel (or pocket) whose
    # 4-neighbours are all opaque and that touches no transparent pixel, even diagonally, is a
    # blend of two foreground colours (hair over collar, arm over shirt), not coverage.
    slab, sn = ndi.label(a < 1)
    if sn:
        zero = a <= 0
        has_zero = ndi.maximum(ndi.binary_dilation(zero, structure=np.ones((3, 3), bool)), slab, range(sn + 1))
        stray = [l for l in range(1, sn + 1) if not has_zero[l]]
        a[np.isin(slab, stray)] = 1.0
        print("stray soft pixels inside the figure made opaque:", int(np.isin(slab, stray).sum()),
              "in", len(stray), "pocket(s)")
    alpha = np.round(a * 255).astype(np.uint8)
    return alpha, lab, picked, bg, matte


def apply_mask(rgb, alpha, matte):
    a = alpha.astype(np.float64) / 255.0
    out = rgb.astype(np.float64)
    part = (a > 0) & (a < 1)
    aa = a[part][:, None]
    decon = np.clip((out[part] - (1 - aa) * matte[part][:, None]) / aa, 0, 255)
    solid = out.copy()
    solid[part] = decon
    # Nearest solid pixel (alpha >= 0.5): the colour a faint edge pixel is really made of.
    _, (iy, ix) = ndi.distance_transform_edt(a < 0.5, return_indices=True)
    core = solid[iy, ix]
    # Un-mixing amplifies noise as alpha -> 0 (a 3-level tint in a 2%-alpha pixel becomes pure
    # green). Below ~40% coverage lean on the nearest solid colour instead of the noisy un-mix.
    # The floor shadow is neutral grey with no solid colour of its own (its nearest solid pixel is
    # the shoe), so it keeps the plain un-mix, which lands on a smooth translucent dark.
    t = np.clip((aa - LOW_ALPHA_LO) / (LOW_ALPHA_HI - LOW_ALPHA_LO), 0, 1)
    t[zone_mask(alpha.shape, FLOOR_ZONE)[part]] = 1.0
    out[part] = t * decon + (1 - t) * core[part]
    # Fully transparent pixels take the nearest solid colour (no white or noise under filtering).
    clear = alpha == 0
    out[clear] = core[clear]
    rgba = np.dstack([np.round(out).astype(np.uint8), alpha])
    return rgba


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def main():
    srcs = [load_rgb(os.path.join(SRC, f)) for f in FRAMES]
    x0, y0, x1, y1 = EYE_BOX
    outside = np.ones(srcs[0].shape[:2], bool)
    outside[y0:y1, x0:x1] = False
    for f, s in zip(FRAMES[1:], srcs[1:]):
        assert s.shape == srcs[0].shape and (s[outside] == srcs[0][outside]).all(), f"{f} differs outside eye box"

    alpha, lab, picked, bg, matte = build_mask(srcs[0])
    assert (alpha[y0:y1, x0:x1] == 255).all(), "eye box must be fully opaque"
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(alpha, "L").save(os.path.join(OUT, "idle_alpha.png"), optimize=True)

    # review map: edge background blue, picked pockets red, soft alpha grey ramp
    rev = srcs[0].copy()
    edge_bg = bg & ~np.isin(lab, list(picked))
    rev[edge_bg] = (rev[edge_bg] * 0.35 + np.array([60, 90, 255]) * 0.65).astype(np.uint8)
    pk = np.isin(lab, list(picked))
    rev[pk] = [255, 40, 40]
    Image.fromarray(rev).save(os.path.join(OUT, "pockets.png"), optimize=True)

    outs = [apply_mask(s, alpha, matte) for s in srcs]
    idle_out = os.path.join(PUB, "idle.png")
    Image.fromarray(outs[0], "RGBA").save(idle_out, optimize=True)
    shutil.copyfile(idle_out, os.path.join(PUB, FRAMES[0]))
    for f, o in zip(FRAMES[1:], outs[1:]):
        Image.fromarray(o, "RGBA").save(os.path.join(PUB, f), optimize=True)
    for f in FRAMES:
        shutil.copyfile(os.path.join(PUB, f), os.path.join(BAKED, f))

    names = {}
    for l, nm in picked.items():
        names.setdefault(nm, 0)
        names[nm] += int((lab == l).sum())
    for nm, px in names.items():
        print(f"pocket: {nm}: {px} px")
    print("alpha: 0 =", int((alpha == 0).sum()), " soft =", int(((alpha > 0) & (alpha < 255)).sum()),
          " opaque =", int((alpha == 255).sum()))
    print("sha256 idle.png      ", sha(idle_out))
    print("sha256 idle_blink_01 ", sha(os.path.join(PUB, FRAMES[0])))


if __name__ == "__main__":
    sys.exit(main())
