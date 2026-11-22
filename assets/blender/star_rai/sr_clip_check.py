"""Clipping check per stress frame. A Hair/Clothes vertex counts as clipped when it is inside a deformed
Body part: ray parity (odd number of crossings) in two directions against that closed part, and deeper
than TOL from its surface. Each Body part is tested separately (they are closed, overlapping shells), so
internal caps between parts can't fool the test. The first frame is the rest baseline; new_vs_rest counts
vertices pushed inside by the pose. args: -- armature action frames(comma) [tol_m]"""
import bpy, json, sys, collections
from mathutils import Vector
from mathutils.bvhtree import BVHTree
a = sys.argv[sys.argv.index("--")+1:]
arm, action, frames = bpy.data.objects[a[0]], a[1], [int(f) for f in a[2].split(",")]
TOL = float(a[3]) if len(a) > 3 else 0.003
PARTNAME = {1: "thigh.R", 4: "thigh.L", 2: "shin.R", 3: "shin.L", 5: "waist", 6: "chest", 8: "upper_arm.L",
            12: "upper_arm.R", 11: "forearm.R", 13: "forearm.L", 9: "hand.L", 10: "hand.R", 17: "neck"}
DIRS = (Vector((0.123, 0.317, 0.940)).normalized(), Vector((-0.577, 0.211, -0.789)).normalized())
body = bpy.data.objects["Body"]; fpart = [d.value for d in body.data.attributes["part"].data]
arm.animation_data.action = bpy.data.actions[action]
sc = bpy.context.scene

def crossings(tree, p, d):
    n, o = 0, p.copy()
    while True:
        hit, _, _, _ = tree.ray_cast(o, d)
        if hit is None: return n
        n += 1; o = hit + d * 1e-5

res, rest = {}, {}
for f in frames:
    sc.frame_set(f); dg = bpy.context.evaluated_depsgraph_get()
    be = body.evaluated_get(dg); bm = be.to_mesh(); mw = be.matrix_world
    V = [mw @ v.co for v in bm.vertices]; P = [p.vertices[:] for p in bm.polygons]; be.to_mesh_clear()
    shells = {}
    for pid in set(fpart):
        polys = [P[i] for i in range(len(P)) if fpart[i] == pid]
        pts = [V[i] for poly in polys for i in poly]
        lo = Vector([min(q[k] for q in pts) for k in range(3)]); hi = Vector([max(q[k] for q in pts) for k in range(3)])
        shells[pid] = (BVHTree.FromPolygons(V, polys), lo, hi)
    row = {}
    for name in ("Hair", "Clothes"):
        oe = bpy.data.objects[name].evaluated_get(dg); om = oe.to_mesh(); ow = oe.matrix_world
        inside = {}
        for v in om.vertices:
            p = ow @ v.co
            for pid, (tree, lo, hi) in shells.items():
                if not all(lo[k] <= p[k] <= hi[k] for k in range(3)): continue
                if crossings(tree, p, DIRS[0]) % 2 and crossings(tree, p, DIRS[1]) % 2:
                    depth = tree.find_nearest(p)[3]
                    if depth > TOL and depth > inside.get(v.index, (0, 0))[1]: inside[v.index] = (pid, depth)
        oe.to_mesh_clear()
        if name not in rest: rest[name] = set(inside)
        new = {i: x for i, x in inside.items() if i not in rest[name]}
        where = collections.Counter(PARTNAME.get(x[0], str(x[0])) for x in new.values())
        row[name] = {"inside": len(inside), "new_vs_rest": len(new),
                     "new_max_mm": round(max((x[1] for x in new.values()), default=0) * 1000, 1),
                     "new_where": dict(where.most_common(4))}
    # reference: how far the body's own thigh shells push into the waist/chest skin (pose limit, not weights)
    bvs = [V[i] for i in range(len(V))]
    waist_ids = {i for k, poly in enumerate(P) if fpart[k] in (5, 6) for i in poly}
    n_self, d_self = 0, 0.0
    for i in waist_ids:
        p = bvs[i]
        for pid in (1, 4):
            tree, lo, hi = shells[pid]
            if all(lo[k] <= p[k] <= hi[k] for k in range(3)) and crossings(tree, p, DIRS[0]) % 2 and crossings(tree, p, DIRS[1]) % 2:
                dd = tree.find_nearest(p)[3]
                if dd > TOL: n_self += 1; d_self = max(d_self, dd)
    row["body_self"] = {"waist_chest_verts_inside_thighs": n_self, "max_mm": round(d_self * 1000, 1)}
    res[f] = row
print("@@JSON@@" + json.dumps(res))
