"""Step 4b (optional) - Facial shape keys for expressions and lip sync.

AI meshes paint the eyes and mouth onto the texture, so there are no eyelids
or mouth interior to rig with bones. Shape keys are the practical route.

  --create      adds empty, correctly named keys (VRM 1.0 preset names, which
                UniVRM, VSeeFace, VRChat-style tools and three-vrm understand):
                  blink, aa, ih, ou, ee, oh, happy, angry, sad, relaxed,
                  surprised, lookUp, lookDown, lookLeft, lookRight
                You then sculpt each one (select key, Sculpt/Edit Mode, shape it).
  --split-lr    after sculpting "blink" (and optionally "happy"), bakes
                blinkLeft/blinkRight (and happyLeft/happyRight) by masking the
                delta with a soft left/right falloff across the face midline.
  --arkit       also adds the 52 ARKit names (for iPhone face capture apps).

Sculpting tips for anime faces:
  * blink: pull the upper lid line down onto the lower lid; anime blinks close
    in a slight downward curve ("smile" shape), not a flat line.
  * aa/ih/ou/ee/oh: if the mouth is only painted, either sculpt a small
    opening and paint the interior dark in the texture, or swap mouth textures
    in the engine instead of using these keys.

Usage:
  blender -b rigged.blend --python sr_shape_keys.py -- --create --save keys.blend
  (sculpt)  then:  ... -- --split-lr --save keys.blend
"""

import argparse
import os
import sys

import bpy


def _script_dirs():
    try:
        yield os.path.dirname(os.path.abspath(__file__))
    except NameError:
        pass
    for t in bpy.data.texts:
        if t.filepath:
            yield os.path.dirname(bpy.path.abspath(t.filepath))


sys.path.extend(_script_dirs())
from sr_common import find_mesh, log, parse_args, save_if_requested, select_only  # noqa: E402

CONFIG = {
    "mesh": None,
    "create": False,
    "split_lr": False,
    "arkit": False,
    "midline_blend": 0.01,  # metres of soft blend across x = 0
    "save": None,
}

VRM_KEYS = [
    "blink", "aa", "ih", "ou", "ee", "oh",
    "happy", "angry", "sad", "relaxed", "surprised",
    "lookUp", "lookDown", "lookLeft", "lookRight",
]
SPLIT_KEYS = ["blink", "happy"]

ARKIT_KEYS = [
    "eyeBlinkLeft", "eyeLookDownLeft", "eyeLookInLeft", "eyeLookOutLeft", "eyeLookUpLeft",
    "eyeSquintLeft", "eyeWideLeft", "eyeBlinkRight", "eyeLookDownRight", "eyeLookInRight",
    "eyeLookOutRight", "eyeLookUpRight", "eyeSquintRight", "eyeWideRight", "jawForward",
    "jawLeft", "jawRight", "jawOpen", "mouthClose", "mouthFunnel", "mouthPucker",
    "mouthLeft", "mouthRight", "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft",
    "mouthFrownRight", "mouthDimpleLeft", "mouthDimpleRight", "mouthStretchLeft",
    "mouthStretchRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower",
    "mouthShrugUpper", "mouthPressLeft", "mouthPressRight", "mouthLowerDownLeft",
    "mouthLowerDownRight", "mouthUpperUpLeft", "mouthUpperUpRight", "browDownLeft",
    "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "cheekPuff",
    "cheekSquintLeft", "cheekSquintRight", "noseSneerLeft", "noseSneerRight", "tongueOut",
]


def create_keys(obj, names):
    select_only(obj)
    if obj.data.shape_keys is None:
        obj.shape_key_add(name="Basis", from_mix=False)
    kb = obj.data.shape_keys.key_blocks
    added = [n for n in names if n not in kb]
    for n in added:
        obj.shape_key_add(name=n, from_mix=False)
    log(f"added {len(added)} shape keys ({len(kb) - 1} total, Basis excluded)")


def split_lr(obj, blend):
    keys = obj.data.shape_keys
    if keys is None:
        raise SystemExit("No shape keys - run --create and sculpt first")
    kb = keys.key_blocks
    basis = keys.reference_key
    for name in SPLIT_KEYS:
        src = kb.get(name)
        if src is None:
            continue
        moved = sum((a.co - b.co).length > 1e-6 for a, b in zip(src.data, basis.data))
        if not moved:
            log(f"'{name}' is not sculpted yet; skipping")
            continue
        # Her left is +X (model faces -Y).
        for side, sign in (("Left", 1), ("Right", -1)):
            dst = kb.get(name + side) or obj.shape_key_add(name=name + side, from_mix=False)
            for d, s, b in zip(dst.data, src.data, basis.data):
                x = sign * b.co.x
                w = min(1.0, max(0.0, 0.5 + x / (2 * blend)))
                d.co = b.co + (s.co - b.co) * w
        log(f"split '{name}' -> {name}Left / {name}Right ({moved} moved verts)")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mesh")
    p.add_argument("--create", action="store_true")
    p.add_argument("--split-lr", dest="split_lr", action="store_true")
    p.add_argument("--arkit", action="store_true")
    p.add_argument("--save")
    cfg = parse_args(p, CONFIG)
    if not cfg.create and not cfg.split_lr:
        cfg.create = True

    obj = find_mesh(cfg.mesh)
    if cfg.create:
        create_keys(obj, VRM_KEYS + (ARKIT_KEYS if cfg.arkit else []))
    if cfg.split_lr:
        split_lr(obj, cfg.midline_blend)
    save_if_requested(cfg.save)


if __name__ == "__main__":
    main()
