#!/usr/bin/env python3
"""Independent check of v10_retarget_v1 criteria from the per-key world rotations Q (Issue #177 review).
Own FK from the v10 JSON, own segment-segment distance (dense sampling + golden refinement-free brute force),
own Tripo posing via collide_v2.py @19d405f. Usage: python3 -I this.py V10.json POSE.json TRIPO.glb COLLIDE_DIR GLBIO_DIR OUT.json"""
import json, math, sys
import numpy as np
v10p, posep, glb, cdir, gdir, outj = sys.argv[1:7]
B = {b["name"]: b for b in json.load(open(v10p))["bones"]}
H0 = {n: np.array(B[n]["head"], float) for n in B}; T0 = {n: np.array(B[n]["tail"], float) for n in B}
P = json.load(open(posep))
bones = [n for n in B if B[n]["type"] == "bone"]
def fk(fr):
    Q = {n: np.array(q) for n, q in fr["Q"].items()}
    for n in B:  # attachments use parent's Q
        if n not in Q: Q[n] = Q[B[n]["parent"]]
    hd = {}
    def head(n):
        if n in hd: return hd[n]
        par = B[n]["parent"]
        hd[n] = np.array(fr["pelvis_head"]) if par is None else head(par) + Q[par] @ (H0[n] - H0[par]); return hd[n]
    return {n: (head(n), head(n) + Q[n] @ (T0[n] - H0[n])) for n in bones}, Q
def segdist(a0, a1, b0, b1):
    s = np.linspace(0, 1, 201); A = a0 + np.outer(s, a1 - a0); Bp = b0 + np.outer(s, b1 - b0)
    d = np.linalg.norm(A[:, None, :] - Bp[None, :, :], axis=2); return float(d.min())
grp = {}
for s in ("left", "right"):
    for b in ("upper_arm", "lower_arm", "hand"): grp[f"{b}_{s}"] = f"arm_{s}"
    for b in ("thigh", "shin", "foot"): grp[f"{b}_{s}"] = f"leg_{s}"
for b in ("pelvis", "hip", "lower_waist", "waist", "mid_chest", "upper_chest"): grp[b] = "torso"
excl = {frozenset(("upper_arm_left", "upper_chest")), frozenset(("upper_arm_right", "upper_chest")),
        frozenset(("thigh_left", "pelvis")), frozenset(("thigh_right", "pelvis"))}
pairs = [(a, b) for i, a in enumerate(grp) for b in list(grp)[i + 1:] if grp[a] != grp[b] and frozenset((a, b)) not in excl]
# Tripo directions (v10 axes) for the arm-direction claim
sys.path.insert(0, gdir); src = open(f"{cdir}/collide_v2.py").read()
head = src.partition("\nres = dict(input=")[0]; anim_src = src[src.index("# animation\n"): src.index("frames = []")]
sys.argv = ["x", glb, gdir, "/dev/null"]; ns = {"__name__": "lib"}; exec(compile(head, "h", "exec"), ns)
ai = [a.get("name") for a in ns["js"]["animations"]].index(P["animation"])
exec(compile(anim_src.replace('anim = js["animations"][0]', f'anim = js["animations"][{ai}]'), "a", "exec"), ns)
idx = ns["idx"]; A = np.array([[-1, 0, 0], [0, 0, 1], [0, 1, 0.0]])
seg = {"upper_arm": ("Upperarm", "Forearm"), "lower_arm": ("Forearm", "Hand"), "thigh": ("Thigh", "Calf"), "shin": ("Calf", "Foot")}
out = {}
for var in ("main", "variant_B"):
    c1 = 0.0; c3min = (1e9, None, None); raised = []; dirdev = {f"{b}_{s}": [] for b in seg for s in ("left", "right")}
    for fr in P[var]:
        pos, Q = fk(fr); t = fr["t"]
        for n in bones: c1 = max(c1, abs(np.linalg.norm(pos[n][1] - pos[n][0]) - np.linalg.norm(T0[n] - H0[n])))
        for a, b in pairs:
            d = segdist(*pos[a], *pos[b])
            if d < c3min[0]: c3min = (d, t, f"{a}|{b}")
        G = ns["world_at"](t)
        u = G[idx["R_Forearm"], :3, 3] - G[idx["R_Upperarm"], :3, 3]
        if u[1] >= 0: raised.append(dict(t=t, hand_high=max(pos["hand_right"][0][2], pos["hand_right"][1][2]), head_z=pos["head"][0][2], wrist=pos["hand_right"][0][2]))
        for b, (ja, jb) in seg.items():
            for s, sd in (("left", "L"), ("right", "R")):
                td = A @ (G[idx[f"{sd}_{jb}"], :3, 3] - G[idx[f"{sd}_{ja}"], :3, 3]); vd = pos[f"{b}_{s}"][1] - pos[f"{b}_{s}"][0]
                dirdev[f"{b}_{s}"].append(math.degrees(math.acos(np.clip(td @ vd / np.linalg.norm(td) / np.linalg.norm(vd), -1, 1))))
    meet = [r for r in raised if r["hand_high"] >= 116 and r["hand_high"] >= r["head_z"]]
    out[var] = dict(C1_max_err_mm=c1, C3_min_axis_mm=round(c3min[0], 3), C3_min_clear_mm=round(c3min[0] - 2.4, 3), C3_at=c3min[1:], 
                    C2_raised_keys=len(raised), C2_keys_meeting=len(meet), C2_max_hand_mm=round(max(r["hand_high"] for r in raised), 2),
                    C2_max_wrist_mm=round(max(r["wrist"] for r in raised), 2),
                    dir_dev_deg={k: [round(min(v), 1), round(max(v), 1)] for k, v in dirdev.items()})
    print(var, json.dumps(out[var]), flush=True)
json.dump(out, open(outj, "w"), indent=1, default=str)
