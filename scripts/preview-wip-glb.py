"""Render the Lab WIP glb from the same camera as toon-presence.tsx."""
import bpy
import math
import sys
from mathutils import Vector

argv = sys.argv
out = "/tmp/wip-idle-preview.png"
glb = "/workspace/public/models/star-rai-wip.glb"
mode = "full"
if "--" in argv:
    args = argv[argv.index("--") + 1 :]
    if len(args) >= 1:
        glb = args[0]
    if len(args) >= 2:
        out = args[1]
    if len(args) >= 3:
        mode = args[2]

bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)

hide = {
    "mouthOpen",
    "mouthSmirk",
    "mouthGrit",
    "mouthPout",
    "mouthShy",
    "blushShyL",
    "blushShyR",
    "handWaveR",
    "handPointR",
    "teethTalk",
    "teethGrit",
    "smirkLift",
}
for obj in bpy.data.objects:
    if obj.name in hide or obj.name.startswith("blushShy"):
        obj.hide_render = True
        obj.hide_viewport = True

world = bpy.data.worlds.new("white")
bpy.context.scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.97, 0.95, 0.92, 1)
bg.inputs[1].default_value = 1.15

cam_data = bpy.data.cameras.new("lab")
cam = bpy.data.objects.new("lab", cam_data)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam
# three.js (0, 0.95, 3.15) lookAt (0, 0.92, 0) → Blender Z-up
if mode == "face":
    cam.location = (0.0, -0.95, 1.42)
    target = Vector((0.0, 0.0, 1.4))
    cam_data.lens = 55
else:
    cam.location = (0.0, -3.15, 0.95)
    target = Vector((0.0, 0.0, 0.92))
    cam_data.lens = 45
direction = target - cam.location
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
cam_data.clip_start = 0.05
cam_data.clip_end = 40
cam_data.sensor_width = 36

key = bpy.data.lights.new("key", "SUN")
key.energy = 2.4
key.color = (1.0, 0.97, 0.93)
key_ob = bpy.data.objects.new("key", key)
key_ob.rotation_euler = (math.radians(50), math.radians(10), math.radians(20))
bpy.context.scene.collection.objects.link(key_ob)

fill = bpy.data.lights.new("fill", "AREA")
fill.energy = 40
fill.size = 2.5
fill.color = (1.0, 0.92, 0.84)
fill_ob = bpy.data.objects.new("fill", fill)
fill_ob.location = (0.2, -1.6, 1.4)
bpy.context.scene.collection.objects.link(fill_ob)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 720
scene.render.resolution_y = 1280
scene.render.filepath = out
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
try:
    scene.eevee.taa_render_samples = 16
except Exception:
    pass

bpy.ops.render.render(write_still=True)
print("wrote", out)
