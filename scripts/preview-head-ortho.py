"""Front-ortho head stills against the Star Rai face grid.

Blender camera background images are viewport-only. This script renders the
WIP on white; grid-on stills are Image.blend(off, grid, 0.4) at 528x692.
Does not change lighting in the app. Head-align pass only. Not Rai.
"""
import bpy
import math
import sys
from mathutils import Vector

argv = sys.argv
glb = "/workspace/public/models/star-rai-wip.glb"
out = "/tmp/head-ortho-grid.png"
mode = "grid"  # grid | off
grid_path = "/workspace/star-rai-head/11-face-grid.jpg"
if "--" in argv:
    args = argv[argv.index("--") + 1 :]
    if len(args) >= 1:
        glb = args[0]
    if len(args) >= 2:
        out = args[1]
    if len(args) >= 3:
        mode = args[2]
    if len(args) >= 4:
        grid_path = args[3]

bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)

hide = {
    "mouthOpen",
    "mouthSmirk",
    "mouthGrit",
    "mouthPout",
    "mouthShy",
    "blushL",
    "blushR",
    "blushShyL",
    "blushShyR",
    "handWaveR",
    "handPointR",
    "teethTalk",
    "teethGrit",
    "smirkLift",
}
for obj in bpy.data.objects:
    if obj.name in hide or obj.name.startswith("blush"):
        obj.hide_render = True
        obj.hide_viewport = True

world = bpy.data.worlds.new("white")
bpy.context.scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (1, 1, 1, 1)
bg.inputs[1].default_value = 1.0

cam_data = bpy.data.cameras.new("ortho")
cam_data.type = "ORTHO"
cam_data.ortho_scale = 0.58
cam_data.clip_start = 0.05
cam_data.clip_end = 40
cam = bpy.data.objects.new("ortho", cam_data)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam
# Frame ahoge through bow. Z-up after glTF import.
cam.location = (0.0, -2.2, 1.28)
target = Vector((0.0, 0.0, 1.28))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()

# Even clay light — local to this preview script, not the app.
sun = bpy.data.lights.new("clay", "SUN")
sun.energy = 2.0
sun.color = (1.0, 0.98, 0.95)
sun_ob = bpy.data.objects.new("clay", sun)
sun_ob.rotation_euler = (math.radians(55), math.radians(8), math.radians(15))
bpy.context.scene.collection.objects.link(sun_ob)
fill = bpy.data.lights.new("fill", "SUN")
fill.energy = 0.55
fill.color = (1.0, 0.94, 0.88)
fill_ob = bpy.data.objects.new("fill", fill)
fill_ob.rotation_euler = (math.radians(15), math.radians(-30), 0)
bpy.context.scene.collection.objects.link(fill_ob)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 528
scene.render.resolution_y = 692
scene.render.filepath = out
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
try:
    scene.eevee.taa_render_samples = 12
except Exception:
    pass

bpy.ops.render.render(write_still=True)
print("wrote", out, "mode", mode)
