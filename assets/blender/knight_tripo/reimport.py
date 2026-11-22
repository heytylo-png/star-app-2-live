import bpy, sys, json
src, out = sys.argv[sys.argv.index("--")+1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == "MESH" and o.name.startswith("Icosphere"): bpy.data.objects.remove(o)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
acts = {a.name: [int(v) for v in a.frame_range] for a in bpy.data.actions}
bpy.ops.wm.save_as_mainfile(filepath=out)
print("@@JSON@@" + json.dumps({"armature": arm.name, "bones": len(arm.data.bones), "root": "root" in arm.data.bones, "actions": acts}))
