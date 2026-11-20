"""Step 2 - Clean an AI-generated character mesh (Tripo / Meshy / Rodin export).

What it does, in order:
  * applies rotation/scale, stands the model upright on the floor at the origin
  * scales to a real-world height (default 1.65 m) so rigging tools behave
  * merges duplicate vertices, deletes loose geometry and degenerate faces
  * removes tiny floating islands (the "confetti" AI generators leave around hair)
  * recalculates normals outward, fills small holes
  * optional decimate to a target triangle count
  * optional X-mirror symmetrize (only if the mesh is already nearly symmetric)
  * smooth shading with angle-based sharp edges

Run it BEFORE retopology or rigging. Usage:
  blender -b raw.blend --python sr_cleanup.py -- --height 1.65 --target-tris 60000 --save clean.blend
Or import the .glb, open this in the Text Editor, edit CONFIG, Run Script.
"""

import argparse
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector


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
    "mesh": None,            # object name, or None = largest mesh in the scene
    "import_path": None,     # optional .glb/.fbx/.obj to import first
    "height": 1.65,          # metres, top of head (not the ahoge) to floor
    "merge_dist": 0.0001,    # metres, after scaling
    "min_island_faces": 30,  # islands smaller than this are deleted
    "hole_sides": 12,        # fill holes with <= this many edges (0 = off)
    "target_tris": 0,        # 0 = no decimation
    "symmetrize": False,     # mirror +X onto -X; only for near-symmetric meshes
    "sharp_angle": 40.0,     # degrees, for smooth-by-angle
    "save": None,
}


def import_file(path: str) -> None:
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    else:
        raise SystemExit(f"Unsupported import type: {ext}")
    log(f"imported {path}")


def unparent_keep_transform(obj) -> None:
    """glTF imports often nest the mesh under an empty with a rotation."""
    if obj.parent:
        mw = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = mw


def normalize_transform(obj, height: float) -> None:
    select_only(obj)
    unparent_keep_transform(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    # Bounding box in world space after applying rotation/scale.
    xs, ys, zs = zip(*(v.co for v in obj.data.vertices))
    cur_h = max(zs) - min(zs)
    if cur_h <= 0:
        raise SystemExit("Mesh has zero height")
    # The ahoge adds a few cm; the target height is approximate on purpose.
    s = height / cur_h
    obj.scale = (s, s, s)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    xs, ys, zs = zip(*(v.co for v in obj.data.vertices))
    offset = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)))
    for v in obj.data.vertices:
        v.co -= offset
    obj.location = (0, 0, 0)
    log(f"scaled x{s:.4f} to {height} m, feet on floor, centred on origin")


def remove_small_islands(bm, min_faces: int) -> int:
    """Delete connected face islands smaller than min_faces. Returns count."""
    seen, doomed, removed = set(), [], 0
    for f in bm.faces:
        if f in seen:
            continue
        island, stack = [], [f]
        seen.add(f)
        while stack:
            cur = stack.pop()
            island.append(cur)
            for e in cur.edges:
                for nf in e.link_faces:
                    if nf not in seen:
                        seen.add(nf)
                        stack.append(nf)
        if len(island) < min_faces:
            doomed.extend(island)
            removed += 1
    if doomed:
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    return removed


def _edit_bmesh(obj, fn):
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    result = fn(bm)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return result


def remove_debris(obj, cfg) -> None:
    """Scale-independent: loose verts/edges and floating islands. Runs before
    normalize_transform so stray confetti cannot skew the height/centre."""
    def fn(bm):
        before = len(bm.verts)
        loose_e = [e for e in bm.edges if not e.link_faces]
        bmesh.ops.delete(bm, geom=loose_e, context="EDGES")
        loose_v = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose_v, context="VERTS")
        islands = remove_small_islands(bm, cfg.min_island_faces) if cfg.min_island_faces else 0
        return before, len(bm.verts), islands
    before, after, islands = _edit_bmesh(obj, fn)
    log(f"debris: verts {before} -> {after}, removed {islands} floating islands")


def clean_geometry(obj, cfg) -> None:
    """Metric cleanup; runs after scaling so merge_dist is in real metres."""
    def fn(bm):
        before = len(bm.verts)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=cfg.merge_dist)
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=cfg.merge_dist)
        if cfg.hole_sides:
            bmesh.ops.holes_fill(bm, edges=bm.edges, sides=cfg.hole_sides)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return before, len(bm.verts)
    before, after = _edit_bmesh(obj, fn)
    log(f"merge/normals: verts {before} -> {after}")


def decimate(obj, target_tris: int) -> None:
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    if not target_tris or tris <= target_tris:
        return
    mod = obj.modifiers.new("SR_Decimate", "DECIMATE")
    mod.ratio = target_tris / tris
    mod.use_collapse_triangulate = False
    select_only(obj)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    log(f"decimated {tris} -> ~{target_tris} tris")


def symmetrize(obj) -> None:
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # Character faces -Y in Blender, so her left side is +X.
    bpy.ops.mesh.symmetrize(direction="POSITIVE_X", threshold=0.001)
    bpy.ops.object.mode_set(mode="OBJECT")
    log("symmetrized +X -> -X (re-check asymmetric details: hair strand, earrings)")


def shade(obj, angle_deg: float) -> None:
    select_only(obj)
    try:  # Blender 4.1+
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle_deg))
    except (AttributeError, RuntimeError, TypeError):
        bpy.ops.object.shade_smooth()
        if hasattr(obj.data, "use_auto_smooth"):  # <= 4.0
            obj.data.use_auto_smooth = True
            obj.data.auto_smooth_angle = math.radians(angle_deg)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--mesh")
    p.add_argument("--import-path", dest="import_path")
    p.add_argument("--height", type=float)
    p.add_argument("--merge-dist", dest="merge_dist", type=float)
    p.add_argument("--min-island-faces", dest="min_island_faces", type=int)
    p.add_argument("--hole-sides", dest="hole_sides", type=int)
    p.add_argument("--target-tris", dest="target_tris", type=int)
    p.add_argument("--symmetrize", action="store_true")
    p.add_argument("--sharp-angle", dest="sharp_angle", type=float)
    p.add_argument("--save")
    cfg = parse_args(p, CONFIG)

    if cfg.import_path:
        import_file(cfg.import_path)
    obj = find_mesh(cfg.mesh)
    obj.name = "StarRai_Body"
    log(f"cleaning '{obj.name}' ({len(obj.data.vertices)} verts)")

    remove_debris(obj, cfg)
    normalize_transform(obj, cfg.height)
    clean_geometry(obj, cfg)
    decimate(obj, cfg.target_tris)
    if cfg.symmetrize:
        symmetrize(obj)
    shade(obj, cfg.sharp_angle)

    # Remove the empties the glTF importer leaves behind.
    for o in list(bpy.context.scene.objects):
        if o.type == "EMPTY" and not o.children:
            bpy.data.objects.remove(o)

    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    log(f"done: {len(obj.data.vertices)} verts, {tris} tris")
    save_if_requested(cfg.save)


if __name__ == "__main__":
    main()
