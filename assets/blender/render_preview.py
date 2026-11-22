import bpy, math, sys, mathutils
out = sys.argv[sys.argv.index("--")+1]
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 96; sc.cycles.use_denoising = True
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.render.film_transparent = False
sc.view_settings.view_transform = "AgX"
w = sc.world or bpy.data.worlds.new("W"); sc.world = w
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.62, 0.68, 0.75, 1); bg.inputs[1].default_value = 0.8
# ground
me = bpy.data.meshes.new("Ground"); me.from_pydata([(-5,-5,0),(5,-5,0),(5,5,0),(-5,5,0)],[],[(0,1,2,3)])
g = bpy.data.objects.new("Ground", me); sc.collection.objects.link(g)
gm = bpy.data.materials.new("M_Ground"); next(n for n in gm.node_tree.nodes if n.type=="BSDF_PRINCIPLED").inputs["Base Color"].default_value=(0.5,0.5,0.5,1); me.materials.append(gm)
sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN")); sun.data.energy = 3.5; sun.data.angle = math.radians(3)
sun.rotation_euler = (math.radians(50), 0, math.radians(35)); sc.collection.objects.link(sun)
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); cam.data.lens = 50; sc.collection.objects.link(cam)
cam.location = (2.6, -3.2, 2.1)
cam.rotation_euler = (mathutils.Vector((0,0,0.45)) - cam.location).to_track_quat("-Z","Y").to_euler()
sc.camera = cam
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
