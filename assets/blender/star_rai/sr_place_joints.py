"""Place META_StarRai joints at Star Rai's pivots (T-pose, faces -Y). Mirrors .L to .R."""
import bpy, sys, json
from mathutils import Vector
arm = bpy.data.objects.get("META_StarRai") or bpy.data.objects["metarig"]
arm.name = arm.data.name = "META_StarRai"; arm.location = (0, 0, 0)
C = {"spine": ((0, .02, .90), (0, .02, 1.00)), "spine.001": ((0, .02, 1.00), (0, .02, 1.10)),
     "spine.002": ((0, .02, 1.10), (0, .02, 1.21)), "spine.003": ((0, .02, 1.21), (0, .015, 1.30)),
     "spine.004": ((0, .015, 1.30), (0, .01, 1.36)), "spine.005": ((0, .01, 1.36), (0, .005, 1.40)),
     "spine.006": ((0, .005, 1.40), (0, .005, 1.60))}
L = {"shoulder": ((.02, -.005, 1.27), (.12, .02, 1.255)), "upper_arm": ((.14, .025, 1.24), (.32, .04, 1.218)),
     "forearm": ((.32, .04, 1.218), (.56, .03, 1.208)), "hand": ((.56, .03, 1.208), (.72, .02, 1.20)),
     "breast": ((.06, -.05, 1.19), (.06, -.13, 1.19)), "pelvis": ((0, .02, .90), (.11, -.06, .97)),
     "thigh": ((.085, .0, .87), (.075, -.012, .48)), "shin": ((.075, -.012, .48), (.066, .025, .17)),
     "foot": ((.066, .025, .17), (.055, -.095, .02)), "toe": ((.055, -.095, .02), (.042, -.135, .012)),
     "heel.02": ((.035, .075, 0), (.10, .075, 0))}
for k, (h, t) in L.items():
    C[k + ".L"] = (h, t)
    C[k + ".R"] = ((-h[0], h[1], h[2]), (-t[0], t[1], t[2]))
with bpy.context.temp_override(object=arm, active_object=arm, selected_objects=[arm]):
    bpy.ops.object.mode_set(mode="EDIT")
eb = arm.data.edit_bones
zold = {b.name: b.z_axis.copy() for b in eb}
missing = [n for n in C if n not in eb]
for b in eb:  # disconnect first so heads move freely
    b.use_connect = False
for n, (h, t) in C.items():
    b = eb[n]; b.head = Vector(h); b.tail = Vector(t)
for n in C:  # keep each bone's previous roll orientation, projected onto the new bone
    b = eb[n]; z = zold[n] - zold[n].project(b.y_axis)
    if z.length > 1e-4: b.align_roll(z)
for n in ["spine.001", "spine.002", "spine.003", "spine.005", "spine.006"] + \
         [f"{p}.{s}" for p in ("forearm", "hand", "shin", "foot", "toe") for s in "LR"]:
    eb[n].use_connect = True
with bpy.context.temp_override(object=arm, active_object=arm, selected_objects=[arm]):
    bpy.ops.object.mode_set(mode="OBJECT")
bad = [(b.name, round((b.head_local - Vector(C[b.name][0])).length, 4)) for b in arm.data.bones
       if b.name in C and (b.head_local - Vector(C[b.name][0])).length > 1e-3]
print("@@JSON@@" + json.dumps(dict(placed=len(C), missing=missing, off=bad, total=len(arm.data.bones))))
bpy.ops.wm.save_mainfile()
