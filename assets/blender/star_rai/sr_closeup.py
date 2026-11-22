"""Close-up review renders of a stress frame (Cycles CPU, transparent). args: -- out prefix action armature
frame tx ty tz dist angle_deg(-90=front, 0=her left, 180=her right, 90=back) height_offset lens res spp"""
import bpy, math, os, sys
from mathutils import Vector
a = sys.argv[sys.argv.index("--")+1:]
out, prefix, action, armname, frame = a[0], a[1], a[2], a[3], int(a[4])
t = Vector((float(a[5]), float(a[6]), float(a[7]))); dist, ang, dz, lens, res, spp = float(a[8]), float(a[9]), float(a[10]), float(a[11]), int(a[12]), int(a[13])
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = spp
sc.cycles.use_denoising = True; sc.render.resolution_x = sc.render.resolution_y = res; sc.render.film_transparent = True
sc.view_settings.view_transform = "Standard"
w = sc.world or bpy.data.worlds.new("W"); sc.world = w
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND"); bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.9
for o in bpy.data.objects:
    if o.type == "ARMATURE": o.hide_render = True
bpy.data.objects[armname].animation_data.action = bpy.data.actions[action]; sc.frame_set(frame)
cam = bpy.data.objects.new("C", bpy.data.cameras.new("C")); cam.data.lens = lens; sc.collection.objects.link(cam); sc.camera = cam
r = math.radians(ang); cam.location = t + Vector((math.cos(r) * dist, math.sin(r) * dist, dz))
cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
sun = bpy.data.objects.new("S", bpy.data.lights.new("S", "SUN")); sun.data.energy = 1.6; sun.data.angle = math.radians(25)
sc.collection.objects.link(sun); kd = ((cam.location - t).normalized() + Vector((0, 0, .6))).normalized()
sun.rotation_euler = (-kd).to_track_quat("-Z", "Y").to_euler()
sc.render.filepath = os.path.join(out, f"{prefix}.png"); bpy.ops.render.render(write_still=True)
