"""Repair AI mesh: split non-manifold edges, make winding consistent per shell, rename to Knight."""
import bpy, bmesh, json
ob = bpy.data.objects["Knight_src"]; ob.name = ob.data.name = "Knight"
bm = bmesh.new(); bm.from_mesh(ob.data)
nm = [e for e in bm.edges if len(e.link_faces) > 2]
if nm: bmesh.ops.split_edges(bm, edges=nm)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
twist = [e for e in bm.edges if len(e.link_faces) == 2 and not e.is_contiguous]
if twist: bmesh.ops.split_edges(bm, edges=twist)   # non-orientable spots: cut so each side winds consistently
key = lambda f: tuple(sorted(tuple(round(c, 5) for c in v.co) for v in f.verts))
seen, dup = set(), []
for f in bm.faces:
    k = key(f)
    (dup.append(f) if k in seen else seen.add(k))
if dup: bmesh.ops.delete(bm, geom=dup, context="FACES_ONLY")
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bad = sum(1 for e in bm.edges if len(e.link_faces) == 2 and not e.is_contiguous)
# folded faces: coplanar (|n.n'|>0.999) triangles within 1 mm whose areas overlap -> drop the smaller one
from mathutils.bvhtree import BVHTree
from mathutils import geometry
bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
bm.faces.ensure_lookup_table()
tree = BVHTree.FromBMesh(bm)
fold = set()
for f in bm.faces:
    a, b, c = (v.co for v in f.verts); cen = (a + b + c) / 3
    for p in (cen, cen.lerp(a, .6), cen.lerp(b, .6), cen.lerp(c, .6)):
        for _, _, j, _ in tree.find_nearest_range(p, 0.001):
            if j is None or j == f.index: continue
            g = bm.faces[j]
            if abs(f.normal.dot(g.normal)) < 0.999: continue
            a2, b2, c2 = (v.co for v in g.verts)
            q = p - g.normal * g.normal.dot(p - a2)
            if geometry.intersect_point_tri(q, a2, b2, c2):
                fold.add(min((f, g), key=lambda x: x.calc_area()))
if fold: bmesh.ops.delete(bm, geom=list(fold), context="FACES")
bm.to_mesh(ob.data); bm.free()
bpy.ops.wm.save_mainfile()
print("@@JSON@@" + json.dumps(dict(split_nonmanifold_edges=len(nm), split_twisted_edges=len(twist), removed_duplicate_faces=len(dup), removed_folded_faces=len(fold), remaining_inconsistent=bad,
      tris=sum(len(p.vertices)-2 for p in ob.data.polygons), verts=len(ob.data.vertices))))
