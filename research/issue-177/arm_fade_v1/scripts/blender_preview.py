"""Blender check (Issue #177): import a GLB, report armature/mesh/action counts, render front views of given frames.
Read-only use of Blender; nothing is exported from Blender. Visual aid only, not a test.
Usage: blender -b --python blender_preview.py -- IN.glb OUT_PREFIX ACTION_SUBSTR t1,t2,... (times in seconds)
"""
import bpy, sys, json, math
from mathutils import Vector
glb, prefix, actname, times = sys.argv[sys.argv.index("--") + 1:][:4]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]; mesh = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
info = dict(blender=bpy.app.version_string, bones=len(arm.data.bones), vertices=len(mesh.data.vertices),
            vertex_groups=len(mesh.vertex_groups), actions=sorted(a.name for a in bpy.data.actions))
act = [a for a in bpy.data.actions if actname in a.name][0]
arm.animation_data_create(); arm.animation_data.action = act
try:
    if act.slots: arm.animation_data.action_slot = act.slots[0]
except Exception: pass
for t in arm.animation_data.nla_tracks: t.mute = True
s = bpy.context.scene; s.render.fps = 24; s.render.engine = "CYCLES"; s.cycles.samples = 12; s.cycles.use_denoising = False
s.render.resolution_x, s.render.resolution_y = 480, 720
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); s.collection.objects.link(cam); s.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 1.15
cam.location = Vector((0, -5, 0.5)); cam.rotation_euler = (math.radians(90), 0, 0)   # looks along +Y; the model faces -Y in Blender
w = bpy.data.worlds.new("w"); s.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.2
for t in [float(x) for x in times.split(",")]:
    s.frame_set(round(t * 24)); s.render.filepath = f"{prefix}_{t:05.2f}s.png"; bpy.ops.render.render(write_still=True)
print("PREVIEW_INFO " + json.dumps(info, sort_keys=True))
