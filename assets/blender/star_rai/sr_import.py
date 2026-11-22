"""Import the Tripo GLB (KHR_mesh_quantization), bake each part's node transform into its mesh, and
report per-part triangle counts, bounds and areas (Blender Z-up)."""
import bpy, json, sys
from mathutils import Vector
src, out = sys.argv[sys.argv.index("--")+1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
parts = [o for o in bpy.data.objects if o.type == "MESH"]
for o in parts:                                   # unparent (keep world transform), then apply it to the mesh
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    o.data.transform(mw); o.matrix_world.identity()
    o.name = o.data.name = o.name.replace("tripo_part_", "P")
for o in [o for o in bpy.data.objects if o.type == "EMPTY"]: bpy.data.objects.remove(o)
rep = []
for o in sorted(parts, key=lambda o: int(o.name[1:])):
    me = o.data; ws = [v.co for v in me.vertices]
    mn = Vector([min(w[i] for w in ws) for i in range(3)]); mx = Vector([max(w[i] for w in ws) for i in range(3)])
    rep.append(dict(part=o.name, tris=sum(len(p.vertices)-2 for p in me.polygons), verts=len(me.vertices),
        area=round(sum(p.area for p in me.polygons), 4), centre=[round(v, 3) for v in (mn+mx)/2],
        size=[round(v, 3) for v in mx-mn], mats=[m.name for m in me.materials]))
allv = [v.co for o in parts for v in o.data.vertices]
lo = [round(min(v[i] for v in allv), 3) for i in range(3)]; hi = [round(max(v[i] for v in allv), 3) for i in range(3)]
bpy.ops.wm.save_as_mainfile(filepath=out)
print("@@JSON@@" + json.dumps(dict(parts=rep, bounds_min=lo, bounds_max=hi,
      images=[(i.name, tuple(i.size), i.colorspace_settings.name) for i in bpy.data.images])))
