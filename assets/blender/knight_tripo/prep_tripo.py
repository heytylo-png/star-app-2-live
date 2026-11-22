"""Import Tripo GLB, weld split verts, orient to face -Y, scale to target height, feet on Z=0, apply transforms."""
import bpy, bmesh, math, sys, json
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--")+1:]
src, out, rot_deg, height = a[0], a[1], float(a[2]), float(a[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ob = next(o for o in bpy.data.objects if o.type == "MESH"); ob.name = ob.data.name = "Knight_src"
ob.data.materials[0].name = "M_Knight"
me = ob.data
before = (len(me.vertices), sum(len(p.vertices)-2 for p in me.polygons))
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.transform(bm, matrix=ob.matrix_world, verts=bm.verts)
bmesh.ops.rotate(bm, cent=(0,0,0), matrix=Matrix.Rotation(math.radians(rot_deg), 3, "Z"), verts=bm.verts)
welded = len(bm.verts); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6); welded -= len(bm.verts)
zs = [v.co.z for v in bm.verts]; s = height / (max(zs) - min(zs))
bmesh.ops.scale(bm, vec=(s, s, s), verts=bm.verts)
xs = [v.co.x for v in bm.verts]; ys = [v.co.y for v in bm.verts]; zmin = min(v.co.z for v in bm.verts)
bmesh.ops.translate(bm, vec=(-(min(xs)+max(xs))/2, -(min(ys)+max(ys))/2, -zmin), verts=bm.verts)
bm.to_mesh(me); bm.free(); ob.matrix_world = Matrix.Identity(4)
bpy.ops.wm.save_as_mainfile(filepath=out)
print("@@JSON@@" + json.dumps(dict(verts_before=before[0], tris=before[1], verts_after=len(me.vertices), welded=welded,
      dims=[round(d, 3) for d in ob.dimensions])))
