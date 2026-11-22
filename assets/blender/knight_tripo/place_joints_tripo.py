"""Place META_Knight joints at the knight's pivots (T-pose, faces -Y). Mirrors .L to .R."""
import bpy, sys, json
from mathutils import Vector
arm = bpy.data.objects["META_Knight"]; arm.location = (0, 0, 0)
C = {"spine": ((0, .01, .90), (0, .01, 1.02)), "spine.001": ((0, .01, 1.02), (0, .01, 1.14)),
     "spine.002": ((0, .01, 1.14), (0, .01, 1.30)), "spine.003": ((0, .01, 1.30), (0, .01, 1.47)),
     "spine.004": ((0, .01, 1.47), (0, -.01, 1.53)), "spine.005": ((0, -.01, 1.53), (0, -.02, 1.58)),
     "spine.006": ((0, -.02, 1.58), (0, -.02, 1.86))}
L = {"shoulder": ((.04, 0, 1.40), (.18, .02, 1.33)), "upper_arm": ((.20, .02, 1.30), (.54, .04, 1.285)),
     "forearm": ((.54, .04, 1.285), (.73, -.06, 1.285)), "hand": ((.73, -.06, 1.285), (.92, -.10, 1.28)),
     "breast": ((.10, -.06, 1.30), (.10, -.16, 1.30)), "pelvis": ((0, .01, .90), (.12, -.08, 1.0)),
     "thigh": ((.13, 0, .86), (.18, -.02, .46)), "shin": ((.18, -.02, .46), (.23, .01, .11)),
     "foot": ((.23, .01, .11), (.26, -.13, .03)), "toe": ((.26, -.13, .03), (.27, -.21, .03)),
     "heel.02": ((.19, .09, 0), (.31, .09, 0))}
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
