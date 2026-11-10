#!/usr/bin/env python3
"""PRELIMINARY: compare Tripo bind-pose joint proportions with the locked v10 numbers the user has STATED (not read
from the v10 file, which is not on GitHub). Lengths are 3D joint-to-joint distances, so A-pose vs straight-down arms
does not matter. Everything is normalised by shoulder-to-ankle height. Usage: python3 -I this.py RIG.glb GLBIO_DIR OUT.json"""
import json, sys
import numpy as np
glb, gdir, outj = sys.argv[1:4]; sys.path.insert(0, gdir)
from glbio import load_rig
r = load_rig(glb); P = {n: np.linalg.inv(m)[:3, 3] for n, m in zip(r["names"], r["IBM"])}
H = float(r["V"][:, 1].max() - r["V"][:, 1].min())
# user-stated v10 (mm, Y up): shoulders y 100, elbows 70, wrists 40, knees -7, ankles -62, head starts y 116,
# arms x -20.3 / +20.75 (moved out ~1 mm for print clearance), total height ~210-216
v10 = dict(upper_arm=30.0, forearm=30.0, shank=55.0, shoulder_to_knee=107.0, shoulder_to_ankle=162.0,
           shoulder_width=41.05, shoulder_to_head_start=16.0)
def avg(a, b): return (np.linalg.norm(P["L_" + b] - P["L_" + a]) + np.linalg.norm(P["R_" + b] - P["R_" + a])) / 2
sy = (P["L_Upperarm"][1] + P["R_Upperarm"][1]) / 2; ky = (P["L_Calf"][1] + P["R_Calf"][1]) / 2; ay = (P["L_Foot"][1] + P["R_Foot"][1]) / 2
tr = dict(upper_arm=avg("Upperarm", "Forearm"), forearm=avg("Forearm", "Hand"), shank=avg("Calf", "Foot"),
          shoulder_to_knee=sy - ky, shoulder_to_ankle=sy - ay,
          shoulder_width=float(np.linalg.norm(P["L_Upperarm"] - P["R_Upperarm"])),
          shoulder_to_head_joint=P["Head"][1] - sy, shoulder_to_neck_joint=P["NeckTwist01"][1] - sy)
k = v10["shoulder_to_ankle"] / tr["shoulder_to_ankle"]   # mm per Tripo unit, matching shoulder-to-ankle
rows = {}
for name in ("upper_arm", "forearm", "shank", "shoulder_to_knee", "shoulder_width"):
    a, b = v10[name] / v10["shoulder_to_ankle"], tr[name] / tr["shoulder_to_ankle"]
    rows[name] = dict(v10_mm=v10[name], tripo_scaled_mm=round(tr[name] * k, 2), v10_ratio=round(a, 4), tripo_ratio=round(b, 4), diff_pct=round(100 * (b - a) / a, 1))
res = dict(note="PRELIMINARY; v10 values are user-stated, not read from the v10 file", scale_mm_per_unit=round(k, 2),
           tripo_total_height_scaled_mm=round(H * k, 1), v10_total_height_stated_mm="~210-216",
           head=dict(v10_shoulder_to_head_start_mm=16.0, tripo_shoulder_to_neck_joint_mm=round(tr["shoulder_to_neck_joint"] * k, 1),
                     tripo_shoulder_to_head_joint_mm=round(tr["shoulder_to_head_joint"] * k, 1)), lengths=rows)
json.dump(res, open(outj, "w"), indent=1, sort_keys=True); print(json.dumps(res, indent=1, sort_keys=True))
