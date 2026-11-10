"""v10 retarget v1 (Issue #177): Blender cross-check and renders. Builds a NEW scene; the v10 .blend is never opened here.
 1 Builds the v10 skeleton from the bones JSON (1 Blender unit = 1 mm; zero-length attachment bones become 2 mm stubs).
 2 Applies the retargeted pose (POSE.json, variant 'main') as keyframes and compares the bone head/tail positions that
   Blender evaluates with the forward-kinematics positions in POSE.json; also checks bone lengths.
 3 Renders stick views (front: camera on +Y; side: camera on +X) at the given times from the Blender-evaluated pose.
 4 Optionally saves the new scene with the action to OUT_BLEND (a new file; not committed).
Usage: blender -b --python blender_check_render.py -- V10_BONES.json POSE.json CHECK_OUT.json RENDER_PREFIX t1,t2,... [OUT_BLEND]
"""
import bpy, json, math, sys
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index("--") + 1:]; v10p, posep, outp, prefix, times = a[:5]; out_blend = a[5] if len(a) > 5 else None
vb = json.load(open(v10p))["bones"]; P = json.load(open(posep)); order = P["order"]; par = P["parents"]; frames = P["main"]
VB = {b["name"]: b for b in vb}
bpy.ops.wm.read_factory_settings(use_empty=True)
s = bpy.context.scene; s.render.fps = 24
ad = bpy.data.armatures.new("v10_copy_from_json"); ob = bpy.data.objects.new("v10_copy_from_json", ad); s.collection.objects.link(ob)
bpy.context.view_layer.objects.active = ob; bpy.ops.object.mode_set(mode="EDIT")
for n in order:
    e = ad.edit_bones.new(n); h = Vector(VB[n]["head"]); t = Vector(VB[n]["tail"])
    if (t - h).length < 1e-9: t = h + Vector((0, 0, 2.0))
    e.head, e.tail = h, t
for n in order:
    if par[n]: ad.edit_bones[n].parent = ad.edit_bones[par[n]]; ad.edit_bones[n].use_connect = False
bpy.ops.object.mode_set(mode="POSE")
rest = {n: ob.data.bones[n].matrix_local.copy() for n in order}
stub = {n: (ob.data.bones[n].tail_local - ob.data.bones[n].head_local) for n in order}
maxh = maxt = maxl = 0.0; evald = {}
for fr in frames:
    f = round(fr["t"] * 24)
    for n in order:
        pb = ob.pose.bones[n]; Q = Matrix(fr["Q"][n]); M = (Q @ rest[n].to_3x3()).to_4x4(); M.translation = Vector(fr["head"][n])
        pb.matrix = M; bpy.context.view_layer.update()
        pb.keyframe_insert("rotation_quaternion", frame=f)
        if par[n] is None: pb.keyframe_insert("location", frame=f)
for fr in frames:   # read back from the keyframed action
    f = round(fr["t"] * 24); s.frame_set(f); pos = {}
    for n in order:
        pb = ob.pose.bones[n]; eh = Vector(fr["head"][n]); maxh = max(maxh, (pb.head - eh).length)
        if VB[n]["type"] == "bone":
            maxt = max(maxt, (pb.tail - Vector(fr["tail"][n])).length)
            maxl = max(maxl, abs((pb.tail - pb.head).length - (Vector(VB[n]["tail"]) - Vector(VB[n]["head"])).length))
        pos[n] = (pb.head.copy(), pb.tail.copy())
    evald[f] = pos
chk = dict(blender=bpy.app.version_string, keys=len(frames), bones=len(order), max_head_diff_mm=float(f"{maxh:.3e}"), max_tail_diff_mm_19_bones=float(f"{maxt:.3e}"),
           max_bone_length_error_mm_19_bones=float(f"{maxl:.3e}"), frame_rounding="key times are exact multiples of 1/24 s")
json.dump(chk, open(outp, "w"), indent=1, sort_keys=True); print("CHECK " + json.dumps(chk))
if out_blend: bpy.ops.object.mode_set(mode="OBJECT"); bpy.ops.wm.save_as_mainfile(filepath=out_blend)
# renders
bpy.ops.object.mode_set(mode="OBJECT"); ob.hide_render = True
s.render.engine = "CYCLES"; s.cycles.samples = 16; s.cycles.use_denoising = False; s.render.resolution_x, s.render.resolution_y = 360, 600
w = bpy.data.worlds.new("w"); s.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
def mat(name, c):
    m = bpy.data.materials.new(name); m.use_nodes = True; m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*c, 1); return m
MAT = dict(right=mat("right", (0.85, 0.1, 0.1)), left=mat("left", (0.1, 0.25, 0.85)), mid=mat("mid", (0.15, 0.15, 0.15)), floor=mat("floor", (0.6, 0.6, 0.6)))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); s.collection.objects.link(cam); s.camera = cam; cam.data.type = "ORTHO"; cam.data.ortho_scale = 290
tmp = []
def stick(p, q, r, m):
    d = q - p; bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(p + q) / 2, vertices=16); o = bpy.context.object
    o.rotation_mode = "QUATERNION"; o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized()); o.data.materials.append(m); tmp.append(o)
    for e in (p, q):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r * 1.5, location=e, segments=12, ring_count=8); bpy.context.object.data.materials.append(m); tmp.append(bpy.context.object)
for t in [float(x) for x in times.split(",")]:
    f = round(t * 24); pos = evald[f]
    for n in order:
        if VB[n]["type"] != "bone": continue
        m = MAT["right"] if n.endswith("_right") else MAT["left"] if n.endswith("_left") else MAT["mid"]; stick(pos[n][0], pos[n][1], 1.2, m)
    for pa, ch in (("upper_chest", "upper_arm_left"), ("upper_chest", "upper_arm_right"), ("pelvis", "thigh_left"), ("pelvis", "thigh_right")):
        stick(pos[pa][1], pos[ch][0], 0.6, MAT["mid"])
    hc = (pos["head"][0] + pos["head"][1]) / 2; bpy.ops.mesh.primitive_uv_sphere_add(radius=11, location=hc, segments=24, ring_count=12); o = bpy.context.object; o.data.materials.append(MAT["floor"]); tmp.append(o)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, -89)); o = bpy.context.object; o.scale = (120, 120, 1); o.data.materials.append(MAT["floor"]); tmp.append(o)
    for view, loc, rot in (("front", (0, 600, 32), (math.radians(90), 0, math.radians(180))), ("side", (600, 0, 32), (math.radians(90), 0, math.radians(90)))):
        cam.location = loc; cam.rotation_euler = rot; s.render.filepath = f"{prefix}_{view}_{t:05.2f}s.png"; bpy.ops.render.render(write_still=True)
    for o in tmp: bpy.data.objects.remove(o, do_unlink=True)
    tmp.clear()
