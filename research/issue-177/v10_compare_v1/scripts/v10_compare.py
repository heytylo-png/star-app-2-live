#!/usr/bin/env python3
"""Compare Tripo bind-pose joints with the locked v10 Blender bone JSON (Issue #177). Read-only on both inputs.
v10: mm, Z up, character's left at -X. Tripo: glTF units, Y up, character's left at +X.
Tripo is converted to v10 axes (x_v10 = -x, y_v10 = +z: both face +Y, as the v10 toes point to +Y; z_v10 = y), then scaled so its shoulder-to-ankle
height equals v10's, and translated so the ankle midpoints coincide. Joints are matched by meaning (table JOINTS).
Usage: python3 -I v10_compare.py V10.json RIG.glb GLBIO_DIR OUT.json"""
import json, sys
import numpy as np
v10p, glb, gdir, outj = sys.argv[1:5]; sys.path.insert(0, gdir)
from glbio import load_rig
v = {b["name"]: b for b in json.load(open(v10p))["bones"]}
r = load_rig(glb); P = {n: np.linalg.inv(m)[:3, 3] for n, m in zip(r["names"], r["IBM"])}
def tv(p): return np.array([-p[0], p[2], p[1]])
T = {n: tv(p) for n, p in P.items()}
def vh(n): return np.array(v[n]["head"], float)
def vt(n): return np.array(v[n]["tail"], float)
# (label, v10 point, tripo joint)
JOINTS = []
for vs, ts in (("left", "L"), ("right", "R")):
    JOINTS += [(f"hip_joint_{vs}", vh(f"thigh_{vs}"), f"{ts}_Thigh"), (f"knee_{vs}", vh(f"knee_{vs}"), f"{ts}_Calf"),
               (f"ankle_{vs}", vh(f"ankle_{vs}"), f"{ts}_Foot"), (f"toe_{vs}", vt(f"foot_{vs}"), f"{ts}_ToeBase"),
               (f"shoulder_{vs}", vh(f"shoulder_{vs}"), f"{ts}_Upperarm"), (f"elbow_{vs}", vh(f"elbow_{vs}"), f"{ts}_Forearm"),
               (f"wrist_{vs}", vh(f"wrist_{vs}"), f"{ts}_Hand"), (f"hand_tip_{vs}", vt(f"hand_{vs}"), f"{ts}_Mid3")]
JOINTS += [("pelvis", vh("pelvis"), "Hip"), ("lower_waist", vh("lower_waist"), "Waist"), ("waist", vh("waist"), "Spine01"),
           ("mid_chest", vh("mid_chest"), "Spine02"), ("neck", vh("neck_attachment"), "NeckTwist01"), ("head_joint", vh("head"), "Head")]
mid = lambda d, a, b: (d[a] + d[b]) / 2
v_sh, v_an = (vh("shoulder_left") + vh("shoulder_right")) / 2, (vh("ankle_left") + vh("ankle_right")) / 2
t_sh, t_an = mid(T, "L_Upperarm", "R_Upperarm"), mid(T, "L_Foot", "R_Foot")
k = (v_sh[2] - v_an[2]) / (t_sh[2] - t_an[2])
def tp(n): return (T[n] - t_an) * k + v_an
rows = []
for lab, pv, tn in JOINTS:
    pt = tp(tn); d = pt - pv
    rows.append(dict(joint=lab, tripo=tn, v10=[round(x, 2) for x in pv], tripo_mm=[round(float(x), 2) for x in pt],
                     dx=round(float(d[0]), 2), dy=round(float(d[1]), 2), dz=round(float(d[2]), 2), dist=round(float(np.linalg.norm(d)), 2)))
def L(a, b): return float(np.linalg.norm(a - b))
seg = {}
for vs, ts in (("left", "L"), ("right", "R")):
    for name, va, vb, ta, tb in (("upper_arm", vh(f"upper_arm_{vs}"), vt(f"upper_arm_{vs}"), f"{ts}_Upperarm", f"{ts}_Forearm"),
                                 ("forearm", vh(f"lower_arm_{vs}"), vt(f"lower_arm_{vs}"), f"{ts}_Forearm", f"{ts}_Hand"),
                                 ("hand", vh(f"hand_{vs}"), vt(f"hand_{vs}"), f"{ts}_Hand", f"{ts}_Mid3"),
                                 ("thigh", vh(f"thigh_{vs}"), vt(f"thigh_{vs}"), f"{ts}_Thigh", f"{ts}_Calf"),
                                 ("shin", vh(f"shin_{vs}"), vt(f"shin_{vs}"), f"{ts}_Calf", f"{ts}_Foot"),
                                 ("foot", vh(f"foot_{vs}"), vt(f"foot_{vs}"), f"{ts}_Foot", f"{ts}_ToeBase")):
        a, b = L(va, vb), L(tp(ta), tp(tb)); seg[f"{name}_{vs}"] = dict(v10=round(a, 2), tripo=round(b, 2), diff_pct=round(100 * (b - a) / a, 1))
wid = {}
for name, (va, vb), (ta, tb) in (("shoulders", ("shoulder_left", "shoulder_right"), ("L_Upperarm", "R_Upperarm")),
                                 ("hips", ("thigh_left", "thigh_right"), ("L_Thigh", "R_Thigh")),
                                 ("knees", ("knee_left", "knee_right"), ("L_Calf", "R_Calf")),
                                 ("ankles", ("ankle_left", "ankle_right"), ("L_Foot", "R_Foot")),
                                 ("elbows", ("elbow_left", "elbow_right"), ("L_Forearm", "R_Forearm")),
                                 ("wrists", ("wrist_left", "wrist_right"), ("L_Hand", "R_Hand"))):
    a, b = abs(vh(va)[0] - vh(vb)[0]), abs(tp(ta)[0] - tp(tb)[0]); wid[name] = dict(v10=round(a, 2), tripo=round(float(b), 2), diff_pct=round(100 * (b - a) / a, 1))
V = r["V"]; top = float(V[:, 1].max()); floor = float(V[:, 1].min())
res = dict(scale_mm_per_tripo_unit=round(float(k), 3),
           heights=dict(v10_ankle_to_head_tail=round(vt("head")[2] - v_an[2], 2), tripo_ankle_to_mesh_top=round((top - (t_an[2])) * k, 2),
                        tripo_ankle_to_head_joint=round((T["Head"][2] - t_an[2]) * k, 2), tripo_ankle_above_floor=round((t_an[2] - floor) * k, 2),
                        v10_ankle_above_toe_tail=round(v_an[2] - vt("foot_left")[2], 2)),
           joints=rows, segments=seg, widths=wid,
           hierarchy=dict(v10_entries=len(v), v10_bones=sum(b["type"] == "bone" for b in v.values()),
                          v10_attachments=sum(b["type"] == "attachment" for b in v.values()), tripo_joints=len(P),
                          v10_missing_vs_tripo="fingers, clavicles, twist bones, eyes/face, toes as separate bone, 3rd spine bone"))
json.dump(res, open(outj, "w"), indent=1); print(json.dumps({k2: v2 for k2, v2 in res.items() if k2 != "joints"}, indent=1))
for x in rows: print(f'{x["joint"]:16s} d={x["dist"]:6.2f}  dx={x["dx"]:+6.2f} dy={x["dy"]:+6.2f} dz={x["dz"]:+6.2f}  v10 z {x["v10"][2]:7.2f}  tripo z {x["tripo_mm"][2]:7.2f}')
