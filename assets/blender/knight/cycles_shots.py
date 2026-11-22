"""Render frames/views of a character with Cycles CPU (no GPU needed).
args: -- out_dir prefix frames(comma) views(comma: front,side,three_quarter,back) res samples"""
import bpy, math, sys, os
from mathutils import Vector
a = sys.argv[sys.argv.index("--")+1:]
out, prefix, frames, views, res, spp = a[0], a[1], [int(f) for f in a[2].split(",")], a[3].split(","), int(a[4]), int(a[5])
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = spp; sc.cycles.use_denoising = True
sc.render.resolution_x = sc.render.resolution_y = res; sc.view_settings.view_transform = "AgX"
w = sc.world or bpy.data.worlds.new("W"); sc.world = w
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.55, 0.6, 0.68, 1); bg.inputs[1].default_value = 1.0
for o in bpy.data.objects:
    if o.type == "ARMATURE": o.hide_render = True
me = bpy.data.meshes.new("Ground"); me.from_pydata([(-6,-6,0),(6,-6,0),(6,6,0),(-6,6,0)],[],[(0,1,2,3)])
g = bpy.data.objects.new("Ground", me); sc.collection.objects.link(g)
gm = bpy.data.materials.new("M_Ground"); next(n for n in gm.node_tree.nodes if n.type=="BSDF_PRINCIPLED").inputs["Base Color"].default_value=(0.35,0.35,0.36,1); me.materials.append(gm)
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")); sun.data.energy = 4; sun.data.angle = math.radians(4)
sun.rotation_euler = (math.radians(45), 0, math.radians(-30)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); cam.data.lens = 50; sc.collection.objects.link(cam); sc.camera = cam
target = Vector((0, 0, 1.0)); dist = 5.2
VIEW = {"front": -90, "three_quarter": -55, "side": 0, "back": 90}
for f in frames:
    sc.frame_set(f)
    for v in views:
        ang = math.radians(VIEW[v])
        cam.location = target + Vector((math.cos(ang) * dist, math.sin(ang) * dist, 0.6))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = os.path.join(out, f"{prefix}_f{f:02d}_{v}.png")
        bpy.ops.render.render(write_still=True)
