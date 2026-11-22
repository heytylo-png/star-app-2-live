"""Re-import the exported GLB into an empty scene (verification + render source)."""
import bpy, sys, json
src, out = sys.argv[sys.argv.index("--")+1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == "MESH" and o.name.startswith("Icosphere"): bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE"); me = next(o for o in bpy.data.objects if o.type == "MESH")
bpy.context.view_layer.update()
pts = [me.matrix_world @ v.co for v in me.data.vertices]
bpy.ops.wm.save_as_mainfile(filepath=out)
print("@@JSON@@" + json.dumps(dict(armature=arm.name, bones=len(arm.data.bones), root="root" in arm.data.bones,
      mesh=me.name, tris=sum(len(p.vertices) - 2 for p in me.data.polygons), groups=len(me.vertex_groups),
      height=round(max(p.z for p in pts) - min(p.z for p in pts), 4), min_z=round(min(p.z for p in pts), 4),
      centre_xy=[round((max(p[i] for p in pts) + min(p[i] for p in pts)) / 2, 4) for i in (0, 1)],
      images=[(i.name, tuple(i.size)) for i in bpy.data.images])))
