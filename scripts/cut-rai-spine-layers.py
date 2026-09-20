#!/usr/bin/env python3
"""Cut official idle.png into Spine cutout layers (track #2).

Free-tool pipeline (Python / Pillow). Does not redraw Rai. Does not touch
Expo bust crops. Character-left = her left = screen right.

Source: public/rai/idle.png (1008×1792). mouth_open from talk_official.png
aligned to the idle head.
"""
from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
IDLE_PATH = ROOT / "public/rai/idle.png"
TALK_PATH = ROOT / "public/rai/talk_official.png"
OUT_DIR = ROOT / "public/spine/rai/layers"
SKEL_PATH = ROOT / "public/spine/rai/skeleton.json"
COMPOSITE_PATH = ROOT / "public/spine/rai/composite_idle_still.png"

STUDIO_LUMA_MIN = 238
STUDIO_CHROMA_MAX = 18
FRINGE_LUMA_MIN = 224
FRINGE_CHROMA_MAX = 24
OVERLAP = 12  # px, within the 8–16 spec
CX = 504  # idle body center (button / bow line)

REQUIRED = [
    "hair_back",
    "ahoge",
    "hair_front",
    "head",
    "brow",
    "mouth_closed",
    "mouth_open",
    "neck",
    "torso",
    "bow",
    "upper_arm_r",
    "forearm_r",
    "hand_r",
    "upper_arm_l",
    "forearm_l",
    "hand_l",
    "skirt",
    "thigh_r",
    "thigh_l",
    "calf_r",
    "calf_l",
    "foot_r",
    "foot_l",
]


def is_studio_white_arr(rgb: np.ndarray, a: np.ndarray) -> np.ndarray:
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    return (a >= 8) & (mn >= STUDIO_LUMA_MIN) & ((mx - mn) <= STUDIO_CHROMA_MAX)


def punch_studio_white(arr: np.ndarray) -> np.ndarray:
    """Edge flood-fill of studio white + fringe, matching src/lib/punch-white.ts."""
    h, w = arr.shape[:2]
    data = arr.copy()
    rgb = data[:, :, :3]
    a = data[:, :, 3]
    studio = is_studio_white_arr(rgb, a)
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
    t = np.clip((mn.astype(np.float32) - FRINGE_LUMA_MIN) / (255 - FRINGE_LUMA_MIN), 0, 1)
    fade = fringe & neigh
    data[:, :, 3] = np.where(fade, np.round(aa * (1 - t)).astype(np.uint8), aa)
    return data


def punch_soft_ground_shadow(arr: np.ndarray) -> np.ndarray:
    """Drop the contact shadow under the loafers so it is not a foot layer."""
    h, w = arr.shape[:2]
    yy = np.arange(h)[:, None]
    rgb = arr[:, :, :3].astype(np.int16)
    a = arr[:, :, 3]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    chroma = mx - mn
    shadow = (a > 8) & (yy > 1688) & (mn > 190) & (chroma < 28)
    out = arr.copy()
    out[shadow] = 0
    return out


def align_talk(idle: np.ndarray, talk: np.ndarray) -> np.ndarray:
    """Scale talk_official to idle and nudge so the amber eyes share a frame."""
    scaled = np.array(Image.fromarray(talk).resize((idle.shape[1], idle.shape[0]), Image.Resampling.LANCZOS))
    # Measured eye-center delta (idle - talk) after uniform scale.
    dx, dy = 14, -4
    aligned = np.zeros_like(scaled)
    src_y0, src_x0 = max(0, -dy), max(0, -dx)
    dst_y0, dst_x0 = max(0, dy), max(0, dx)
    hh = idle.shape[0] - abs(dy)
    ww = idle.shape[1] - abs(dx)
    aligned[dst_y0 : dst_y0 + hh, dst_x0 : dst_x0 + ww] = scaled[src_y0 : src_y0 + hh, src_x0 : src_x0 + ww]
    return aligned


def box(h: int, w: int, x0: int, y0: int, x1: int, y1: int) -> np.ndarray:
    yy, xx = np.ogrid[0:h, 0:w]
    return (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)


def dilate(mask: np.ndarray, px: int) -> np.ndarray:
    if px <= 0:
        return mask
    return ndimage.binary_dilation(mask, iterations=px)


def close_holes(mask: np.ndarray, px: int = 2) -> np.ndarray:
    return ndimage.binary_closing(mask, iterations=px)


def crop_masked(src: np.ndarray, mask: np.ndarray, pad: int = 2) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise SystemExit(f"empty mask")
    h, w = src.shape[:2]
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(w, int(xs.max()) + 1 + pad)
    y1 = min(h, int(ys.max()) + 1 + pad)
    layer = np.zeros((y1 - y0, x1 - x0, 4), dtype=np.uint8)
    local = mask[y0:y1, x0:x1]
    layer[local] = src[y0:y1, x0:x1][local]
    return layer, (x0, y0, x1, y1)


def classify(arr: np.ndarray) -> dict[str, np.ndarray]:
    h, w = arr.shape[:2]
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    a = arr[:, :, 3]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    chroma = mx - mn
    sil = a > 16
    yy = np.arange(h)[:, None]
    xx = np.arange(w)[None, :]

    dark = sil & (mx < 100)
    navy_zone = ((yy >= 730) & (yy <= 1025)) | ((yy >= 1235) & (yy <= 1670))
    cuff_zone = (yy >= 490) & (yy <= 575) & ((xx < 410) | (xx > 600))
    navy = sil & (b + 12 >= r) & (mx < 95) & (navy_zone | cuff_zone)
    eye_box = (yy >= 196) & (yy <= 252) & (xx >= 428) & (xx <= 612)
    hair = dark & ~navy & (yy < 440) & ~eye_box
    hair = hair | (
        sil & (yy < 440) & (mx < 150) & (mn < 95) & (chroma < 45) & ~navy & ~eye_box
    )

    skin = sil & (r > 175) & (g > 100) & (b > 60) & (r > b + 18) & (r + 8 >= g)
    shirt = sil & (mn > 155) & (chroma < 48) & (yy > 340) & (yy < 830)
    bow = sil & (r > 135) & (r > g + 38) & (r > b + 38) & (g < 130) & (yy > 348) & (yy < 470)
    button = sil & (r > 155) & (g > 115) & (b < 145) & (r > b + 25) & (yy > 410) & (yy < 760) & (xx > 470) & (xx < 535)
    shoe = sil & (r > 50) & (r > g) & (r > b + 12) & (g > 22) & (b < 115) & (yy > 1588) & (yy < 1770)
    sock = navy & (yy >= 1235)
    skirt_navy = navy & (yy >= 730) & (yy <= 1025) & ~cuff_zone
    hem = sil & (mn > 170) & (chroma < 40) & (yy >= 930) & (yy <= 1015) & (xx > 300) & (xx < 710)

    return {
        "sil": sil,
        "hair": hair,
        "skin": skin,
        "shirt": shirt,
        "bow": bow,
        "button": button,
        "shoe": shoe,
        "sock": sock,
        "navy": navy,
        "skirt_navy": skirt_navy,
        "hem": hem,
        "yy": yy,
        "xx": xx,
        "eye_box": eye_box,
    }


def build_masks(idle: np.ndarray, talk: np.ndarray) -> dict[str, np.ndarray]:
    h, w = idle.shape[:2]
    c = classify(idle)
    hair, skin, shirt = c["hair"], c["skin"], c["shirt"]
    sil, yy, xx, eye_box = c["sil"], c["yy"], c["xx"], c["eye_box"]
    talk_c = classify(talk)

    def B(x0, y0, x1, y1):
        return box(h, w, x0, y0, x1, y1)

    # --- ahoge: thin antenna + 12px scalp overlap ---
    ahoge = np.zeros((h, w), dtype=bool)
    for y in range(0, 158):
        xs = np.where(hair[y])[0]
        xs = xs[(xs >= 370) & (xs <= 640)]
        if len(xs) == 0:
            continue
        span = int(xs.max() - xs.min())
        # curl is a thin stroke; near the scalp keep the left-hand stem
        if span < 120 or y < 78:
            ahoge[y, xs] = True
        else:
            stem = xs[xs < 530]
            if len(stem):
                ahoge[y, stem[stem > 450]] = True
    scalp = hair & B(460, 118, 540, 162)
    ahoge = close_holes(ahoge | scalp, 1)

    # --- hair front: bangs + cheek / shoulder locks (draw-order on top) ---
    bangs = hair & B(390, 70, 650, 228)
    lock_r = hair & B(275, 155, 430, 430)  # screen left lock (her right)
    lock_l = hair & B(590, 155, 740, 430)
    hair_front = close_holes(bangs | lock_r | lock_l, 2) & ~eye_box

    # --- hair back: crown + nape (behind body) — no bow / shirt ---
    crown = hair & B(355, 40, 680, 230)
    nape = hair & B(360, 190, 680, 400)
    hair_back = close_holes((crown | nape) & ~ahoge, 2)
    hair_back = hair_back & ~c["bow"] & ~c["shirt"]
    hair_back = hair_back | (hair_front & B(360, 90, 670, 220) & dilate(hair_back, OVERLAP))
    hair_front = hair_front | (hair_back & B(390, 90, 650, 228) & dilate(hair_front, OVERLAP))
    hair_front = hair_front & ~eye_box

    # --- head: cranium + eyes + ears; no jaw / mouth / hair volume ---
    face_skin = skin & B(400, 165, 630, 300) & ~hair
    eyes = sil & B(430, 198, 610, 250) & ~hair
    ear_r = (skin | sil) & B(388, 218, 432, 272) & ~hair & ~c["navy"]
    ear_l = (skin | sil) & B(592, 218, 648, 272) & ~hair & ~c["navy"]
    earring = sil & B(385, 228, 650, 262) & (idle[:, :, 0] > 160) & (idle[:, :, 2] < 140)
    mouth_hole = B(470, 250, 562, 318)
    head = close_holes((face_skin | eyes | ear_r | ear_l | earring) & ~mouth_hole, 2)
    head = head | (skin & B(478, 248, 554, 264))

    # --- brow: just the scowl lines, not the bangs ---
    brow_dark = sil & (idle[:, :, 0] < 80) & (idle[:, :, 1] < 70)
    brow = close_holes(
        (brow_dark & (B(442, 184, 498, 204) | B(534, 184, 590, 204))),
        1,
    )

    # --- mouth ---
    mouth_box = B(466, 248, 562, 318)
    mouth_closed = close_holes((skin | sil) & mouth_box & ~hair, 1)
    mouth_open = close_holes((talk_c["skin"] | (talk[:, :, 3] > 16)) & mouth_box & ~talk_c["hair"], 1)

    # --- neck ---
    neck = close_holes(skin & B(448, 288, 575, 405), 2)
    neck = neck | (skin & B(470, 300, 560, 330))  # chin / jaw overlap

    # --- bow ---
    bow = close_holes(dilate(c["bow"], 1), 1)

    # --- torso: shirt + buttons, sleeves cropped off ---
    torso_x = B(392, 360, 622, 820)
    sleeves_off = ~((yy < 575) & ((xx < 400) | (xx > 618)))
    collar = shirt & B(430, 348, 590, 412)
    torso = close_holes(((shirt | c["button"]) & torso_x & sleeves_off) | collar, 2)
    torso = torso & ~dilate(bow, 1)
    # waist overlap with skirt
    torso = torso | (c["skirt_navy"] & B(400, 768, 620, 792))

    # --- arms (her right = screen left = wave / scold) ---
    sleeve_r = shirt & B(278, 400, 412, 575)
    sleeve_l = shirt & B(598, 400, 732, 575)
    cuff_r = c["navy"] & B(278, 500, 400, 575)
    cuff_l = c["navy"] & B(610, 500, 732, 575)
    upper_arm_r = close_holes((sleeve_r | cuff_r | (skin & B(278, 530, 402, 690))), 2)
    upper_arm_l = close_holes((sleeve_l | cuff_l | (skin & B(608, 530, 732, 690))), 2)
    forearm_r = close_holes(skin & B(276, 658, 400, 910), 2)
    forearm_l = close_holes(skin & B(618, 658, 730, 910), 2)
    hand_r = close_holes(dilate(skin & B(274, 855, 372, 1055), 2), 2)
    hand_l = close_holes(dilate(skin & B(640, 848, 732, 1055), 2), 2)
    # joint overlaps
    upper_arm_r = upper_arm_r | (forearm_r & B(276, 658, 400, 658 + OVERLAP))
    upper_arm_l = upper_arm_l | (forearm_l & B(618, 658, 730, 658 + OVERLAP))
    forearm_r = forearm_r | (upper_arm_r & B(276, 690 - OVERLAP, 400, 690)) | (hand_r & B(274, 855, 372, 855 + OVERLAP))
    forearm_l = forearm_l | (upper_arm_l & B(618, 690 - OVERLAP, 730, 690)) | (hand_l & B(648, 850, 730, 850 + OVERLAP))

    # --- skirt ---
    skirt = close_holes((c["skirt_navy"] | c["hem"]) & B(288, 752, 720, 1018), 2)
    skirt = skirt & ~dilate(hand_r | hand_l, 3)
    skirt = skirt | (torso & B(420, 768, 600, 812))
    skirt = skirt | (shirt & B(430, 752, 590, 800))

    # --- legs ---
    thigh_r = close_holes(skin & B(355, 968, 512, 1315), 2)
    thigh_l = close_holes(skin & B(508, 968, 662, 1315), 2)
    thigh_r = thigh_r | (skirt & B(355, 968, 512, 968 + OVERLAP))
    thigh_l = thigh_l | (skirt & B(508, 968, 662, 968 + OVERLAP))
    calf_r = close_holes((skin | c["sock"]) & B(378, 1268, 500, 1655), 2)
    calf_l = close_holes((skin | c["sock"]) & B(520, 1268, 640, 1655), 2)
    calf_r = calf_r | (thigh_r & B(378, 1315 - OVERLAP, 500, 1315))
    calf_l = calf_l | (thigh_l & B(520, 1315 - OVERLAP, 640, 1315))
    foot_r = close_holes(c["shoe"] & B(400, 1592, 512, 1768), 2)
    foot_l = close_holes(c["shoe"] & B(508, 1592, 630, 1768), 2)
    foot_r = foot_r | (calf_r & B(400, 1638, 512, 1638 + OVERLAP))
    foot_l = foot_l | (calf_l & B(508, 1638, 630, 1638 + OVERLAP))

    return {
        "hair_back": hair_back,
        "ahoge": ahoge,
        "hair_front": hair_front,
        "head": head,
        "brow": brow,
        "mouth_closed": mouth_closed,
        "mouth_open": mouth_open,
        "neck": neck,
        "torso": torso,
        "bow": bow,
        "upper_arm_r": upper_arm_r,
        "forearm_r": forearm_r,
        "hand_r": hand_r,
        "upper_arm_l": upper_arm_l,
        "forearm_l": forearm_l,
        "hand_l": hand_l,
        "skirt": skirt,
        "thigh_r": thigh_r,
        "thigh_l": thigh_l,
        "calf_r": calf_r,
        "calf_l": calf_l,
        "foot_r": foot_r,
        "foot_l": foot_l,
    }


# Joint pivots in idle pixel space (y-down). Her right = screen left.
PIVOTS = {
    "hair_back": (510, 200),
    "ahoge": (488, 128),
    "hair_front": (517, 210),
    "head": (517, 228),
    "brow": (517, 192),
    "mouth_closed": (517, 268),
    "mouth_open": (517, 268),
    "neck": (508, 338),
    "torso": (504, 620),
    "bow": (513, 403),
    "upper_arm_r": (350, 520),
    "forearm_r": (338, 680),
    "hand_r": (325, 920),
    "upper_arm_l": (655, 520),
    "forearm_l": (675, 680),
    "hand_l": (688, 920),
    "skirt": (504, 880),
    "thigh_r": (430, 1050),
    "thigh_l": (575, 1050),
    "calf_r": (438, 1380),
    "calf_l": (577, 1380),
    "foot_r": (445, 1675),
    "foot_l": (575, 1675),
}

# World-space bone pivots (idle pixels). Same names as skeleton.json.
BONE_WORLD = {
    "root": (504, 810),
    "hip": (504, 810),
    "torso": (504, 620),
    "chest": (504, 470),
    "bow": (513, 403),
    "neck": (508, 338),
    "head": (517, 228),
    "jaw": (517, 268),
    "brow": (517, 192),
    "hairBack": (510, 200),
    "hairFront": (517, 210),
    "ahoge": (488, 128),
    "shoulderL": (648, 445),
    "upperArmL": (655, 520),
    "forearmL": (675, 680),
    "handL": (688, 920),
    "shoulderR": (360, 445),
    "upperArmR": (350, 520),
    "forearmR": (338, 680),
    "handR": (325, 920),
    "skirt": (504, 880),
    "thighL": (575, 1050),
    "calfL": (577, 1380),
    "footL": (575, 1675),
    "thighR": (430, 1050),
    "calfR": (438, 1380),
    "footR": (445, 1675),
}

BONE_PARENT = {
    "hip": "root",
    "torso": "hip",
    "chest": "torso",
    "bow": "chest",
    "neck": "chest",
    "head": "neck",
    "jaw": "head",
    "brow": "head",
    "hairBack": "head",
    "hairFront": "head",
    "ahoge": "head",
    "shoulderL": "chest",
    "upperArmL": "shoulderL",
    "forearmL": "upperArmL",
    "handL": "forearmL",
    "shoulderR": "chest",
    "upperArmR": "shoulderR",
    "forearmR": "upperArmR",
    "handR": "forearmR",
    "skirt": "hip",
    "thighL": "hip",
    "calfL": "thighL",
    "footL": "calfL",
    "thighR": "hip",
    "calfR": "thighR",
    "footR": "calfR",
}

SLOT_BONE = {
    "hair_back": ("hairBack", "hairBack"),
    "upper_arm_r": ("upperArmR", "upperArmR"),
    "upper_arm_l": ("upperArmL", "upperArmL"),
    "thigh_r": ("thighR", "thighR"),
    "thigh_l": ("thighL", "thighL"),
    "calf_r": ("calfR", "calfR"),
    "calf_l": ("calfL", "calfL"),
    "foot_r": ("footR", "footR"),
    "foot_l": ("footL", "footL"),
    "skirt": ("skirt", "skirt"),
    "torso": ("torso", "torso"),
    "bow": ("bow", "bow"),
    "forearm_r": ("forearmR", "forearmR"),
    "forearm_l": ("forearmL", "forearmL"),
    "hand_r": ("handR", "handR"),
    "hand_l": ("handL", "handL"),
    "neck": ("neck", "neck"),
    "head": ("head", "head"),
    "brow": ("brow", "brow"),
    "mouth_closed": ("mouth", "jaw"),
    "mouth_open": ("mouth", "jaw"),
    "hair_front": ("hairFront", "hairFront"),
    "ahoge": ("ahoge", "ahoge"),
}

DRAW_ORDER = [
    "hair_back",
    "upper_arm_r",
    "upper_arm_l",
    "thigh_r",
    "thigh_l",
    "calf_r",
    "calf_l",
    "foot_r",
    "foot_l",
    "skirt",
    "torso",
    "bow",
    "forearm_r",
    "forearm_l",
    "hand_r",
    "hand_l",
    "neck",
    "head",
    "brow",
    "mouth_closed",
    "hair_front",
    "ahoge",
]


def local_offset(name: str) -> tuple[float, float]:
    wx, wy = BONE_WORLD[name]
    parent = BONE_PARENT.get(name)
    if not parent:
        return wx, wy
    px, py = BONE_WORLD[parent]
    return wx - px, wy - py


def write_skeleton(meta: dict[str, dict]) -> None:
    bones = [{"name": "root", "x": BONE_WORLD["root"][0], "y": BONE_WORLD["root"][1]}]
    order = [
        "hip",
        "torso",
        "chest",
        "bow",
        "neck",
        "head",
        "jaw",
        "brow",
        "hairBack",
        "hairFront",
        "ahoge",
        "shoulderL",
        "upperArmL",
        "forearmL",
        "handL",
        "shoulderR",
        "upperArmR",
        "forearmR",
        "handR",
        "skirt",
        "thighL",
        "calfL",
        "footL",
        "thighR",
        "calfR",
        "footR",
    ]
    for name in order:
        lx, ly = local_offset(name)
        bones.append(
            {
                "name": name,
                "parent": BONE_PARENT[name],
                "x": round(lx, 2),
                "y": round(ly, 2),
                "length": 20,
            }
        )

    def att(layer: str) -> dict:
        m = meta[layer]
        x0, y0, x1, y1 = m["bbox"]
        px, py = PIVOTS[layer]
        w, h = x1 - x0, y1 - y0
        return {
            "name": layer,
            "path": f"spine/rai/layers/{layer}.png",
            "width": w,
            "height": h,
            "x": round((x0 + w / 2) - px, 2),
            "y": round((y0 + h / 2) - py, 2),
        }

    slots = []
    done_mouth = False
    for layer in DRAW_ORDER:
        if layer in ("mouth_closed", "mouth_open"):
            if done_mouth:
                continue
            slots.append(
                {
                    "name": "mouth",
                    "bone": "jaw",
                    "attachment": "mouth_closed",
                    "attachments": {
                        "mouth_closed": att("mouth_closed"),
                        "mouth_open": att("mouth_open"),
                    },
                }
            )
            done_mouth = True
            continue
        slot_name, bone = SLOT_BONE[layer]
        slots.append(
            {
                "name": slot_name,
                "bone": bone,
                "attachment": layer,
                "attachments": {layer: att(layer)},
            }
        )

    empty = {n: {"duration": d, "loop": True, "bones": {}} for n, d in {
        "idle": 3.2,
        "talk": 3.2,
        "wave": 1.6,
        "scold": 1.4,
        "pout": 2.4,
        "shy": 2.6,
    }.items()}

    skel = {
        "name": "star-rai-cutout",
        "width": 1008,
        "height": 1792,
        "fps": 30,
        "demo": False,
        "bones": bones,
        "slots": slots,
        "animations": empty,
        "poseToAnimation": {
            "idle": "idle",
            "talk": "talk",
            "wave": "wave",
            "scold": "scold",
            "pout": "pout",
            "shy": "shy",
        },
        "talk": {
            "bone": "jaw",
            "slot": "mouth",
            "closed": "mouth_closed",
            "open": "mouth_open",
            "maxDeg": 10,
        },
    }
    SKEL_PATH.write_text(json.dumps(skel, indent=2) + "\n")


def runtime_composite(skel: dict) -> np.ndarray:
    """Stack attachments at rest the same way cutout-runtime.ts does."""
    locals_: dict[str, dict] = {}
    for b in skel["bones"]:
        locals_[b["name"]] = {
            "x": b.get("x", 0),
            "y": b.get("y", 0),
            "rotation": b.get("rotation", 0),
            "scaleX": b.get("scaleX", 1),
            "scaleY": b.get("scaleY", 1),
            "parent": b.get("parent"),
        }
    order: list[str] = []
    seen: set[str] = set()

    def visit(name: str) -> None:
        if name in seen:
            return
        bone = locals_[name]
        if bone["parent"]:
            visit(bone["parent"])
        seen.add(name)
        order.append(name)

    for b in skel["bones"]:
        visit(b["name"])

    world: dict[str, dict] = {}
    for name in order:
        loc = locals_[name]
        parent = world.get(loc["parent"]) if loc["parent"] else None
        if not parent:
            world[name] = {k: loc[k] for k in ("x", "y", "rotation", "scaleX", "scaleY")}
            continue
        rad = parent["rotation"] * np.pi / 180.0
        c, s = np.cos(rad), np.sin(rad)
        world[name] = {
            "x": parent["x"] + (loc["x"] * parent["scaleX"] * c - loc["y"] * parent["scaleY"] * s),
            "y": parent["y"] + (loc["x"] * parent["scaleX"] * s + loc["y"] * parent["scaleY"] * c),
            "rotation": parent["rotation"] + loc["rotation"],
            "scaleX": parent["scaleX"] * loc["scaleX"],
            "scaleY": parent["scaleY"] * loc["scaleY"],
        }

    W, H = int(skel["width"]), int(skel["height"])
    acc = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for slot in skel["slots"]:
        key = slot.get("attachment")
        att = slot["attachments"][key]
        bone = world[slot["bone"]]
        path = ROOT / "public" / att["path"]
        img = Image.open(path).convert("RGBA")
        w, h = int(att.get("width", img.width)), int(att.get("height", img.height))
        if img.size != (w, h):
            img = img.resize((w, h), Image.Resampling.LANCZOS)
        sx = bone["x"] + att.get("x", 0)
        sy = bone["y"] + att.get("y", 0)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer.paste(img, (int(round(sx - w / 2)), int(round(sy - h / 2))), img)
        acc = Image.alpha_composite(acc, layer)
    return np.array(acc)


def source_composite(idle_shape: tuple[int, ...], layers: dict[str, tuple[np.ndarray, tuple[int, int, int, int]]]) -> np.ndarray:
    canvas = np.zeros(idle_shape, dtype=np.uint8)
    for name in DRAW_ORDER:
        img, (x0, y0, x1, y1) = layers[name]
        dst = canvas[y0:y1, x0:x1]
        src_a = img[:, :, 3:4].astype(np.float32) / 255.0
        dst[:, :, :3] = np.round(img[:, :, :3] * src_a + dst[:, :, :3] * (1 - src_a)).astype(np.uint8)
        dst[:, :, 3] = np.maximum(dst[:, :, 3], img[:, :, 3])
    return canvas


def label_still(arr: np.ndarray, title: str) -> Image.Image:
    img = Image.fromarray(arr)
    # place on a beige stage like the live app, with a label strip
    w, h = img.size
    pad = 36
    label_h = 72
    out = Image.new("RGBA", (w + pad * 2, h + pad * 2 + label_h), (239, 236, 230, 255))
    out.paste(img, (pad, pad + label_h), img)
    draw = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
        small = font
    draw.text((pad, 16), title, fill=(28, 25, 22, 255), font=font)
    draw.text(
        (pad, 44),
        "Official idle cuts · not a redraw · seams/gaps possible · ?spine=rai",
        fill=(109, 103, 95, 255),
        font=small,
    )
    return out


def main() -> int:
    if not IDLE_PATH.is_file():
        print("missing", IDLE_PATH, file=sys.stderr)
        return 1
    idle_rgb = np.array(Image.open(IDLE_PATH).convert("RGBA"))
    talk_rgb = np.array(Image.open(TALK_PATH).convert("RGBA"))
    idle = punch_soft_ground_shadow(punch_studio_white(idle_rgb))
    talk_p = punch_soft_ground_shadow(punch_studio_white(talk_rgb))
    talk = align_talk(idle, talk_p)

    masks = build_masks(idle, talk)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    meta: dict[str, dict] = {}
    layers: dict[str, tuple[np.ndarray, tuple[int, int, int, int]]] = {}

    for name in REQUIRED:
        src = talk if name == "mouth_open" else idle
        mask = masks[name]
        n = int(mask.sum())
        if n < 40:
            print(f"WARNING {name} only {n} pixels", file=sys.stderr)
        img, bbox = crop_masked(src, mask)
        Image.fromarray(img).save(OUT_DIR / f"{name}.png", optimize=True)
        layers[name] = (img, bbox)
        meta[name] = {"bbox": bbox, "pixels": n, "pivot": PIVOTS[name]}
        print(f"{name:16s} {n:7d}px  bbox={bbox}")

    write_skeleton(meta)
    skel = json.loads(SKEL_PATH.read_text())
    still = runtime_composite(skel)
    label_still(still, "Glance test — assembled official cut layers").save(COMPOSITE_PATH, optimize=True)
    print("wrote", COMPOSITE_PATH)
    print("wrote", SKEL_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
