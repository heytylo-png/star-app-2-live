"""Step 3b - Add breast, hair and ahoge bones to an auto-rigged body.

Run AFTER AccuRIG / Mixamo / Auto-Rig Pro / Rigify has produced the main
skeleton and you have imported the rigged FBX into Blender.

Two phases (both run by default):

  --place   creates bones at positions estimated from the mesh:
              Breast_L / Breast_R            parented to the chest bone
              Hair_Back_{1..N}_{1..S}         chains down the back hair
              Hair_Side_L_*/Hair_Side_R_*     front side locks
              Ahoge_1..3                      the strand sticking up
            Estimates are approximate. Check them in Edit Mode, move heads
            and tails as needed, then run again with only --weight.

  --weight  writes vertex weights for those bones:
              breasts: smooth radial falloff, taken out of the chest weights
              hair: nearest-segment weights inside the hair mask, blended into
                    the head bone at each chain's root

THE HAIR MASK (do this first, it matters):
  AI meshes fuse hair to the body, and the black bikini is the same colour as
  the hair, so the script cannot guess which vertices are hair. Either
    a) separate the hair into its own object (Edit Mode, select hair, P >
       Selection) and pass --hair-mesh <name>, or
    b) select the hair vertices and assign them to a vertex group "HairMask".
  Include the ahoge in the mask.

Usage:
  blender -b rigged.blend --python sr_secondary_bones.py -- --save rigged2.blend
  blender -b rigged2.blend --python sr_secondary_bones.py -- --weight --save rigged3.blend
"""

import argparse
import os
import sys

import bpy
from mathutils import Vector
from mathutils.geometry import intersect_point_line


def _script_dirs():
    try:
        yield os.path.dirname(os.path.abspath(__file__))
    except NameError:
        pass
    for t in bpy.data.texts:
        if t.filepath:
            yield os.path.dirname(bpy.path.abspath(t.filepath))


sys.path.extend(_script_dirs())
from sr_common import (find_armature, find_mesh, log, parse_args,  # noqa: E402
                       save_if_requested, select_only)

CONFIG = {
    "mesh": None,
    "armature": None,
    "hair_mesh": None,         # separated hair object (recommended)
    "place": False,            # if neither --place nor --weight: do both
    "weight": False,
    "breasts": True,
    "breast_radius": 0.085,    # metres; influence radius around each breast
    "breast_depth": 0.07,      # bone length: chest wall -> apex
    "back_chains": 5,
    "chain_segments": 4,
    "side_locks": True,
    "ahoge": True,
    "save": None,
}

CHEST_CANDIDATES = [
    "CC_Base_Spine02", "mixamorig:Spine2", "mixamorig:Spine1", "spine_03.x",
    "DEF-spine.003", "spine.003", "Spine2", "chest", "Chest", "UpperChest",
    "J_Bip_C_UpperChest", "J_Bip_C_Chest", "spine_03",
]
HEAD_CANDIDATES = [
    "CC_Base_Head", "mixamorig:Head", "head.x", "DEF-spine.006", "spine.006",
    "Head", "head", "J_Bip_C_Head",
]


def pick_bone(arm, candidates, keyword):
    bones = arm.data.bones
    for name in candidates:
        if name in bones:
            return name
    # fall back to substring search, e.g. "Armature_Spine2"
    hits = [b.name for b in bones if keyword.lower() in b.name.lower()]
    if hits:
        return sorted(hits, key=len)[0]
    raise SystemExit(f"Could not find a {keyword} bone; set it in CHEST/HEAD_CANDIDATES")


def world_verts(obj, group=None):
    mw = obj.matrix_world
    if group is None:
        return [(v.index, mw @ v.co) for v in obj.data.vertices]
    gi = obj.vertex_groups[group].index
    return [(v.index, mw @ v.co) for v in obj.data.vertices
            if any(g.group == gi and g.weight > 0.5 for g in v.groups)]


def hair_vertices(body, hair_obj):
    if hair_obj:
        return hair_obj, world_verts(hair_obj)
    if "HairMask" not in body.vertex_groups:
        return body, []
    return body, world_verts(body, "HairMask")


# --------------------------------------------------------------------------- placement

def estimate_breasts(body, depth):
    """Most forward vertex on each side in the bust height band (character faces -Y)."""
    vs = [co for _, co in world_verts(body)]
    zmin = min(v.z for v in vs)
    h = max(v.z for v in vs) - zmin
    band = [v for v in vs if zmin + 0.68 * h < v.z < zmin + 0.76 * h]
    out = {}
    for side, sign in (("L", 1), ("R", -1)):
        pts = [v for v in band if 0.025 < sign * v.x < 0.16]
        if not pts:
            continue
        apex = min(pts, key=lambda v: v.y)
        head = apex + Vector((0, depth, 0))
        out[side] = (head, apex)
    return out


def chain_points(top, bottom, segments, y_of):
    """Points from top to bottom; y follows the hair surface via y_of(z)."""
    pts = []
    for i in range(segments + 1):
        t = i / segments
        p = top.lerp(bottom, t)
        y = y_of(p)
        if y is not None:
            p.y = y
        pts.append(p)
    return pts


def estimate_hair(hair_pts, head_head, head_tail, cfg):
    """Return {chain_name: [points]} from hair vertex positions."""
    chains = {}
    if not hair_pts:
        return chains
    head_mid = (head_head + head_tail) / 2

    def surface_y(sel):
        def f(p):
            near = [q for q in sel if abs(q.z - p.z) < 0.03 and abs(q.x - p.x) < 0.04]
            if not near:
                return None
            # sit slightly inside the hair volume, not on its outer shell
            ys = sorted(q.y for q in near)
            return ys[len(ys) // 2]
        return f

    # Back hair: vertices behind the head centre (+Y is the back).
    back = [p for p in hair_pts if p.y > head_mid.y]
    if back and cfg.back_chains > 0:
        xmin, xmax = min(p.x for p in back), max(p.x for p in back)
        n = cfg.back_chains
        for i in range(n):
            x = xmin + (xmax - xmin) * (i + 0.5) / n
            col = [p for p in back if abs(p.x - x) < (xmax - xmin) / (2 * n) + 0.01]
            if len(col) < 10:
                continue
            bottom_z = min(p.z for p in col)
            root = Vector((x, head_mid.y + 0.06, head_mid.z))
            if root.z - bottom_z < 0.1:
                continue
            bottom = Vector((x, root.y, bottom_z + 0.02))
            chains[f"Hair_Back_{i + 1}"] = chain_points(
                root, bottom, cfg.chain_segments, surface_y(col))

    # Side locks: hair in front of the face that hangs below the chin.
    if cfg.side_locks:
        chin_z = head_head.z
        for side, sign in (("L", 1), ("R", -1)):
            lock = [p for p in hair_pts if p.y < head_mid.y and sign * p.x > 0.03
                    and p.z < chin_z + 0.04]
            if len(lock) < 10:
                continue
            x = sum(p.x for p in lock) / len(lock)
            y = sum(p.y for p in lock) / len(lock)
            root = Vector((x, y, head_mid.z))
            bottom = Vector((x, y, min(p.z for p in lock) + 0.01))
            chains[f"Hair_Side_{side}"] = chain_points(root, bottom, 3, surface_y(lock))

    # Ahoge: the topmost hair vertices.
    if cfg.ahoge:
        tip = max(hair_pts, key=lambda p: p.z)
        base = Vector((tip.x * 0.5, tip.y * 0.5 + head_mid.y * 0.5, tip.z - 0.09))
        chains["Ahoge"] = [base.lerp(tip, t / 3) for t in range(4)]
    return chains


def place_bones(arm, body, hair_obj, cfg):
    chest = pick_bone(arm, CHEST_CANDIDATES, "spine")
    head = pick_bone(arm, HEAD_CANDIDATES, "head")
    mw = arm.matrix_world
    mwi = mw.inverted()

    select_only(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    head_eb = eb[head]
    head_head, head_tail = mw @ head_eb.head, mw @ head_eb.tail

    def make(name, h, t, parent, connect=False):
        b = eb.get(name) or eb.new(name)
        b.head, b.tail = mwi @ h, mwi @ t
        b.parent = eb[parent] if isinstance(parent, str) else parent
        b.use_connect = connect
        b.use_deform = True
        b.roll = 0.0
        return b

    made = []
    if cfg.breasts:
        if any("breast" in b.name.lower() and b.name not in ("Breast_L", "Breast_R")
               for b in eb):
            log("rig already has breast bones; skipping Breast_L/R (weights still adjustable)")
        else:
            for side, (h, t) in estimate_breasts(body, cfg.breast_depth).items():
                make(f"Breast_{side}", h, t, chest)
                made.append(f"Breast_{side}")

    _, hv = hair_vertices(body, hair_obj)
    for chain, pts in estimate_hair([co for _, co in hv], head_head, head_tail, cfg).items():
        parent = head
        for i in range(len(pts) - 1):
            name = f"{chain}_{i + 1}"
            parent = make(name, pts[i], pts[i + 1], parent, connect=i > 0)
            made.append(name)
    if not hv:
        log("no hair mask found: hair/ahoge bones skipped (see HAIR MASK in the docstring)")

    bpy.ops.object.mode_set(mode="OBJECT")
    # B-Bone-free, simple chains are what Unity/Unreal/VRM spring bones expect.
    log(f"placed {len(made)} bones under '{chest}' / '{head}'")
    return chest, head


# --------------------------------------------------------------------------- weighting

def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def vgroup(obj, name):
    return obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)


def bone_segments(arm, prefix_list):
    mw = arm.matrix_world
    segs = []
    for b in arm.data.bones:
        if any(b.name.startswith(p) for p in prefix_list):
            segs.append((b.name, mw @ b.head_local, mw @ b.tail_local))
    return segs


def seg_dist(p, a, b):
    closest, t = intersect_point_line(p, a, b)
    t = max(0.0, min(1.0, t))
    return (p - a.lerp(b, t)).length, t


def scale_other_groups(obj, vidx, keep_names, factor):
    """Multiply every deform weight except keep_names on vertex vidx by factor."""
    v = obj.data.vertices[vidx]
    keep = {obj.vertex_groups[n].index for n in keep_names if n in obj.vertex_groups}
    for g in v.groups:
        if g.group not in keep:
            g.weight *= factor


def weight_breasts(arm, body, cfg):
    segs = [s for s in bone_segments(arm, ["Breast_"]) if s[0] in ("Breast_L", "Breast_R")]
    if not segs:
        segs = [s for s in bone_segments(arm, [""]) if "breast" in s[0].lower()]
    for name, h, t in segs:
        g = vgroup(body, name)
        center = h.lerp(t, 0.6)
        n = 0
        for vi, co in world_verts(body):
            if co.y > h.y + 0.01:  # behind the chest wall: leave alone
                continue
            d = (co - center).length
            w = 1.0 - smoothstep(cfg.breast_radius * 0.35, cfg.breast_radius, d)
            if w <= 0.001:
                continue
            scale_other_groups(body, vi, [name], 1.0 - w)
            g.add([vi], w, "REPLACE")
            n += 1
        log(f"{name}: weighted {n} verts")


def weight_hair(arm, body, hair_obj, head_bone):
    obj, hv = hair_vertices(body, hair_obj)
    if not hv:
        return
    segs = bone_segments(arm, ["Hair_", "Ahoge_"])
    if not segs:
        log("no Hair_/Ahoge_ bones; run --place first")
        return
    chain_root = {}
    for name, h, t in segs:
        chain = name.rsplit("_", 1)[0]
        if name.endswith("_1"):
            chain_root[chain] = (h, (t - h).normalized())

    head_g = vgroup(obj, head_bone)
    hair_names = {s[0] for s in segs}
    groups = {name: vgroup(obj, name) for name in hair_names}
    for vi, co in hv:
        # Hair verts must not follow the spine/shoulders the auto-rigger gave them.
        v = obj.data.vertices[vi]
        for g in list(v.groups):
            gname = obj.vertex_groups[g.group].name
            if gname not in hair_names and gname != head_bone:
                obj.vertex_groups[g.group].remove([vi])

        ranked = sorted(((seg_dist(co, h, t)[0], name) for name, h, t in segs))[:2]
        (d1, n1), (d2, n2) = ranked[0], ranked[-1]
        w1 = 1.0 if n1 == n2 else (1 / max(d1, 1e-4) ** 4) / (
            1 / max(d1, 1e-4) ** 4 + 1 / max(d2, 1e-4) ** 4)
        root, axis = chain_root[n1.rsplit("_", 1)[0]]
        s = (co - root).dot(axis)               # distance down the chain
        hair_amt = smoothstep(-0.02, 0.04, s)   # 0 at/above root -> head bone

        for name in hair_names:
            groups[name].remove([vi])
        groups[n1].add([vi], w1 * hair_amt, "REPLACE")
        if n2 != n1:
            groups[n2].add([vi], (1 - w1) * hair_amt, "REPLACE")
        head_g.add([vi], 1.0 - hair_amt, "REPLACE")
    log(f"hair: weighted {len(hv)} verts on '{obj.name}'")
    ensure_armature_modifier(obj, arm)


def ensure_armature_modifier(obj, arm):
    if not any(m.type == "ARMATURE" and m.object == arm for m in obj.modifiers):
        m = obj.modifiers.new("Armature", "ARMATURE")
        m.object = arm
    if obj.parent != arm:
        mw = obj.matrix_world.copy()
        obj.parent = arm
        obj.matrix_world = mw


def finalize(obj):
    select_only(obj)
    bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.01)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mesh")
    p.add_argument("--armature")
    p.add_argument("--hair-mesh", dest="hair_mesh")
    p.add_argument("--place", action="store_true")
    p.add_argument("--weight", action="store_true")
    p.add_argument("--no-breasts", dest="breasts", action="store_false")
    p.add_argument("--breast-radius", dest="breast_radius", type=float)
    p.add_argument("--back-chains", dest="back_chains", type=int)
    p.add_argument("--chain-segments", dest="chain_segments", type=int)
    p.add_argument("--no-side-locks", dest="side_locks", action="store_false")
    p.add_argument("--no-ahoge", dest="ahoge", action="store_false")
    p.add_argument("--save")
    cfg = parse_args(p, CONFIG)
    if not cfg.place and not cfg.weight:
        cfg.place = cfg.weight = True

    arm = find_armature(cfg.armature)
    hair_obj = bpy.data.objects.get(cfg.hair_mesh) if cfg.hair_mesh else None
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o != hair_obj]
    body = find_mesh(cfg.mesh) if cfg.mesh else max(meshes, key=lambda o: len(o.data.vertices))

    head = pick_bone(arm, HEAD_CANDIDATES, "head")
    if cfg.place:
        place_bones(arm, body, hair_obj, cfg)
    if cfg.weight:
        if cfg.breasts:
            weight_breasts(arm, body, cfg)
        weight_hair(arm, body, hair_obj, head)
        finalize(body)
        if hair_obj:
            finalize(hair_obj)
    save_if_requested(cfg.save)


if __name__ == "__main__":
    main()
