#!/usr/bin/env python3
"""Cross-region mesh joins: edges whose two vertices have dominant bones in different body groups (read-only).
Usage: python3 -I joins.py RIGGED.glb > joins.json"""
import json, os, sys
from collections import Counter
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbio import load_rig
R = load_rig(sys.argv[1]); V, F, J, W, names = R["V"], R["F"], R["J"], R["W"], R["names"]
H = float(V[:, 1].max() - V[:, 1].min())
GH = {"Head", "FacialBone", "L_Eye", "R_Eye", "NeckTwist01", "NeckTwist02"}; GT = {"BoneRoot", "Hip", "Pelvis", "Waist", "Spine01", "Spine02"}
def grp(n):
    if n in GH: return "head"
    if n in GT: return "torso"
    s = n[:2]
    if any(k in n for k in ("Hand", "Thumb", "Index", "Mid", "Ring", "Pinky")): return s + "hand"
    if any(k in n for k in ("Clavicle", "Upperarm", "Forearm", "ElbowShareBone")): return s + "arm"
    if any(k in n for k in ("Thigh", "Calf", "KneeShareBone")): return s + "leg"
    return s + "foot"
dom = J[np.arange(len(J)), W.argmax(1)]; g = np.array([grp(names[d]) for d in dom])
E = np.unique(np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1), axis=0)
ga, gb = g[E[:, 0]], g[E[:, 1]]
out = {}
for a, b in sorted(Counter(tuple(sorted((x, y))) for x, y in zip(ga, gb) if x != y)):
    m = ((ga == a) & (gb == b)) | ((ga == b) & (gb == a)); y = V[E[m]][:, :, 1].ravel() / H * 100
    out[f"{a}|{b}"] = dict(edges=int(m.sum()), y_pctH=[round(float(y.min()), 2), round(float(y.max()), 2)])
B = np.array([np.linalg.inv(m) for m in R["IBM"]])[:, :3, 3]; idx = {n: i for i, n in enumerate(names)}
ref = {n: round(float(B[idx[n], 1] / H * 100), 2) for n in ("L_Upperarm", "L_Forearm", "L_Hand", "L_Thigh", "Head")}
json.dump(dict(H=round(H, 6), unique_edges=int(len(E)), joint_heights_pctH=ref, joins=out), sys.stdout, indent=1, sort_keys=True); print()
