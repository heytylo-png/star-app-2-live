"""Place META_Knight joints at the knight's pivots (T-pose, faces -Y). Mirrors .L to .R."""
import bpy, sys, json
from mathutils import Vector
arm = bpy.data.objects["META_Knight"]; arm.location = (0, 0, 0)
C = {"spine": ((0, .01, .92), (0, .01, 1.06)), "spine.001": ((0, .01, 1.06), (0, .01, 1.20)),
     "spine.002": ((0, .01, 1.20), (0, .01, 1.34)), "spine.003": ((0, .01, 1.34), (0, .01, 1.45)),
     "spine.004": ((0, .01, 1.45), (0, .01, 1.52)), "spine.005": ((0, .01, 1.52), (0, .01, 1.58)),
     "spine.006": ((0, .01, 1.58), (0, .01, 1.95))}
L = {"shoulder": ((.03, -.01, 1.41), (.20, 0, 1.39)), "upper_arm": ((.22, 0, 1.36), (.56, .015, 1.36)),
     "forearm": ((.56, .015, 1.36), (.80, 0, 1.36)), "hand": ((.80, 0, 1.36), (.93, 0, 1.36)),
     "breast": ((.11, -.02, 1.32), (.11, -.12, 1.32)), "pelvis": ((0, .01, .92), (.12, -.06, 1.0)),
     "thigh": ((.12, 0, .90), (.12, -.015, .50)), "shin": ((.12, -.015, .50), (.12, 0, .10)),
     "foot": ((.12, 0, .10), (.12, -.12, .03)), "toe": ((.12, -.12, .03), (.12, -.17, .03)),
     "heel.02": ((.07, .08, 0), (.17, .08, 0))}
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
