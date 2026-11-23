"""Repair decimated parts: weld duplicates, dissolve degenerate faces, collapse zero-UV-area faces,
split non-manifold edges, make winding consistent; then resolve z-fighting between parts by pushing the
lower layer (skin < clothing < hair) inward along its normal. Folded faces within one part: drop the smaller."""
import bpy, bmesh, json, sys
from mathutils import Vector, geometry
from mathutils.bvhtree import BVHTree
PUSH, EPS = 0.0012, 0.001   # push > QA's 1 mm coplanar tolerance
LAYER = {"hair": 3, "eye": 2, "ear": 2, "earring": 2, "chest_cloth": 1, "bottom_cloth": 1, "tie": 1}
CLOTH = {"P15": "chest_cloth", "P16": "chest_cloth", "P7": "bottom_cloth", "P18": "tie", "P19": "tie"}
parts = sorted([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: int(o.name[1:]))
for o in parts:
    if o.name in CLOTH: o["role"] = CLOTH[o.name]
rank = lambda o: LAYER.get(o["role"], 0)

def uv_area(f, uvl):
    a, b, c = (l[uvl].uv for l in f.loops[:3])
    return abs((b - a).cross(c - a)) / 2

rep = {}
for o in parts:
    bm = bmesh.new(); bm.from_mesh(o.data); uvl = bm.loops.layers.uv.active; r = {}
    n = len(bm.verts); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6); r["welded"] = n - len(bm.verts)
    deg = [f for f in bm.faces if f.calc_area() < 1e-12]
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges); r["degenerate"] = len(deg)
    zuv = [f for f in bm.faces if len(f.verts) == 3 and uv_area(f, uvl) < 1e-10]
    for f in zuv:                                  # collapse the shortest edge of each zero-UV face
        if f.is_valid:
            e = min(f.edges, key=lambda e: e.calc_length())
            bmesh.ops.collapse(bm, edges=[e], uvs=True)
    r["zero_uv_collapsed"] = len(zuv)
    nm = [e for e in bm.edges if len(e.link_faces) > 2]
    if nm: bmesh.ops.split_edges(bm, edges=nm)
    r["nonmanifold_split"] = len(nm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tw = [e for e in bm.edges if len(e.link_faces) == 2 and not e.is_contiguous]
    if tw: bmesh.ops.split_edges(bm, edges=tw); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    r["twisted_split"] = len(tw)
    wire = [e for e in bm.edges if not e.link_faces]
    if wire: bmesh.ops.delete(bm, geom=wire, context="EDGES")
    r["wire_removed"] = len(wire)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.to_mesh(o.data); bm.free(); o.data.update()
    rep[o.name] = r

# ---- z-fighting across / within parts ----
bms = {}
for o in parts:
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table(); bm.normal_update(); bms[o.name] = bm
trees = {n: BVHTree.FromBMesh(bm) for n, bm in bms.items()}
push, fold, pairs = {n: set() for n in bms}, {n: set() for n in bms}, 0
for o in parts:
    A = bms[o.name]
    for f in A.faces:
        a, b, c = (v.co for v in f.verts); cen = (a + b + c) / 3
        for p in (cen, cen.lerp(a, .6), cen.lerp(b, .6), cen.lerp(c, .6)):
            for q in parts:
                B = bms[q.name]
                for _, _, j, _ in trees[q.name].find_nearest_range(p, EPS):
                    if j is None or (q == o and j == f.index): continue
                    g = B.faces[j]
                    if q == o and set(f.verts) & set(g.verts): continue
                    d = f.normal.dot(g.normal)
                    if d < 0.999: continue                          # same-facing coplanar only (z-fight)
                    a2, b2, c2 = (v.co for v in g.verts)
                    if not geometry.intersect_point_tri(p - g.normal * g.normal.dot(p - a2), a2, b2, c2): continue
                    pairs += 1
                    if q == o: fold[o.name].add(min(f, g, key=lambda x: x.calc_area()).index)
                    else:
                        lower = (o, f) if rank(o) < rank(q) or (rank(o) == rank(q) and o.name > q.name) else (q, g)
                        push[lower[0].name].add(lower[1].index)
moved = {}
for o in parts:
    bm = bms[o.name]; vs = {}
    for fi in push[o.name]:
        for v in bm.faces[fi].verts: vs[v] = v.normal.copy()
    for v, nrm in vs.items(): v.co -= nrm * PUSH
    if fold[o.name]: bmesh.ops.delete(bm, geom=[bm.faces[i] for i in fold[o.name]], context="FACES")
    if vs or fold[o.name]: bm.to_mesh(o.data); o.data.update()
    moved[o.name] = (len(vs), len(fold[o.name])); bm.free()
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps(dict(repair={k: v for k, v in rep.items() if any(v.values())},
      zfight_pairs_seen=pairs, pushed_verts={k: v[0] for k, v in moved.items() if v[0]},
      folded_faces_removed={k: v[1] for k, v in moved.items() if v[1]},
      tris=sum(len(p.vertices) - 2 for o in parts for p in o.data.polygons))))
