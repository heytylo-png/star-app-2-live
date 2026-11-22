"""Sprite-camera renders: orthographic, transparent 2:3 canvas, soft key from the camera side + even fill,
Standard view transform (flat, sprite-like colour). Views match public/star-rai/angles:
front (camera at -Y), three_quarter (between front and her left), side (her left, +X; she faces screen-left).
args: -- out_dir prefix views(comma) width samples [action armature frame]"""
import bpy, math, os, sys
from mathutils import Vector
a = sys.argv[sys.argv.index("--")+1:]
out, prefix, views, width, spp = a[0], a[1], a[2].split(","), int(a[3]), int(a[4])
action, armname, frame = (a[5], a[6], int(a[7])) if len(a) > 7 else (None, None, 1)
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = spp; sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = width, int(width * 1.5); sc.render.film_transparent = True
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.cycles.max_bounces = 4
w = sc.world or bpy.data.worlds.new("SpriteWorld"); sc.world = w
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.9          # even ambient fill
for o in bpy.data.objects:
    if o.type in ("ARMATURE", "LIGHT", "CAMERA"): o.hide_render = True
if action:
    bpy.data.objects[armname].animation_data.action = bpy.data.actions[action]
sc.frame_set(frame)
dg = bpy.context.evaluated_depsgraph_get()
pts = [o.matrix_world @ Vector(c) for o in bpy.data.objects if o.type == "MESH" and not o.hide_render
       for c in o.evaluated_get(dg).bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
centre = (lo + hi) / 2; H = hi.z - lo.z
cam = bpy.data.objects.new("SpriteCam", bpy.data.cameras.new("SpriteCam")); sc.collection.objects.link(cam)
cam.data.type = "ORTHO"; cam.data.ortho_scale = H * 1.08; cam.data.clip_end = 100; sc.camera = cam
key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN")); sc.collection.objects.link(key)
key.data.energy = 1.6; key.data.angle = math.radians(25)                              # big soft key, weak shadows
ANG = {"front": -90, "three_quarter": -45, "side": 0, "back": 90}
for v in views:
    t = math.radians(ANG[v]); d = Vector((math.cos(t), math.sin(t), 0))
    cam.location = centre + d * 10
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    kd = (d + Vector((0, 0, 0.6))).normalized()                                       # key from camera side, above
    key.rotation_euler = (-kd).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(out, f"{prefix}_{v}.png")
    bpy.ops.render.render(write_still=True)
