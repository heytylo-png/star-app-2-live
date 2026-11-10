#!/usr/bin/env python3
"""v10 printed-part clearance under the retargeted greet_02 (Issue #177). Implements METHOD_AND_CRITERIA_FROZEN.md @5c1f056 with AMENDMENT_A1_SAMPLING @1d24992.
numpy/scipy only. Usage: python3 -I part_clearance.py PRINT.stl V10.json POSE.json STLPARTS_DIR OUT.json"""
import json, math, sys
import numpy as np
from scipy.spatial import cKDTree
stl, v10p, posep, tdir, outj = sys.argv[1:6]; sys.path.insert(0, tdir)
from stlparts import load_stl, shells
H, THR, PRE = 0.25, 1.0, 5.0
V, F = load_stl(stl); SH = shells(V, F); assert len(SH) == 36
PART = {17: ("head", "head"), 24: ("neck_marker", "upper_chest"), 18: ("neck_cyl", "upper_chest"), 9: ("seg_upper_chest", "upper_chest"),
        5: ("shoulder_marker_left", "upper_chest"), 31: ("shoulder_marker_right", "upper_chest"), 19: ("spine_marker_mid_upper", "mid_chest"),
        10: ("seg_mid_chest", "mid_chest"), 22: ("spine_marker_waist_mid", "waist"), 16: ("seg_waist", "waist"),
        21: ("spine_marker_lower_waist", "lower_waist"), 13: ("seg_lower_waist", "lower_waist"), 20: ("spine_marker_hip_lower", "hip"),
        12: ("seg_hip", "hip"), 23: ("hip_attachment", "hip"), 7: ("pelvis", "pelvis")}
for s, (ua, el, fa, wr, ha, th, kn, sh, an, ft) in (("left", (3, 4, 1, 2, 0, 6, 15, 8, 14, 11)), ("right", (30, 33, 32, 35, 34, 25, 29, 26, 28, 27))):
    PART.update({ua: (f"upper_arm_{s}", f"upper_arm_{s}"), el: (f"elbow_marker_{s}", f"upper_arm_{s}"), fa: (f"forearm_{s}", f"lower_arm_{s}"),
                 wr: (f"wrist_marker_{s}", f"lower_arm_{s}"), ha: (f"hand_{s}", f"hand_{s}"), th: (f"thigh_{s}", f"thigh_{s}"),
                 kn: (f"knee_marker_{s}", f"thigh_{s}"), sh: (f"shin_{s}", f"shin_{s}"), an: (f"ankle_marker_{s}", f"shin_{s}"), ft: (f"foot_{s}", f"foot_{s}")})
assert len(PART) == 36
names = [PART[i][0] for i in range(36)]; bone_of = {PART[i][0]: PART[i][1] for i in range(36)}
JOINT = set()
def jp(a, b): JOINT.add(frozenset((a, b)))
for s in ("left", "right"):
    for a, b in ((f"upper_arm_{s}", f"forearm_{s}"), (f"forearm_{s}", f"hand_{s}"), (f"thigh_{s}", f"shin_{s}"), (f"shin_{s}", f"foot_{s}"), ("pelvis", f"thigh_{s}"),
                 (f"elbow_marker_{s}", f"upper_arm_{s}"), (f"elbow_marker_{s}", f"forearm_{s}"), (f"wrist_marker_{s}", f"forearm_{s}"), (f"wrist_marker_{s}", f"hand_{s}"),
                 (f"knee_marker_{s}", f"thigh_{s}"), (f"knee_marker_{s}", f"shin_{s}"), (f"ankle_marker_{s}", f"shin_{s}"), (f"ankle_marker_{s}", f"foot_{s}"),
                 (f"shoulder_marker_{s}", f"upper_arm_{s}")): jp(a, b)
for a, b in (("neck_cyl", "head"), ("neck_marker", "head"), ("hip_attachment", "pelvis"), ("seg_hip", "spine_marker_hip_lower"), ("seg_hip", "pelvis"),
             ("seg_lower_waist", "spine_marker_hip_lower"), ("seg_lower_waist", "spine_marker_lower_waist"), ("seg_waist", "spine_marker_lower_waist"),
             ("seg_waist", "spine_marker_waist_mid"), ("seg_mid_chest", "spine_marker_waist_mid"), ("seg_mid_chest", "spine_marker_mid_upper"),
             ("seg_upper_chest", "spine_marker_mid_upper"), ("seg_upper_chest", "neck_cyl"), ("neck_marker", "neck_cyl")): jp(a, b)
assert len(JOINT) == 42, len(JOINT)
# sampling
def sample(tris):
    """Amendment A1: longest-edge bisection until every edge <= H; samples = sub-triangle vertices."""
    T = np.asarray(tris, float); done = []
    while len(T):
        e = np.stack([np.linalg.norm(T[:, 1] - T[:, 0], axis=1), np.linalg.norm(T[:, 2] - T[:, 1], axis=1), np.linalg.norm(T[:, 0] - T[:, 2], axis=1)], 1)
        ok = e.max(1) <= H; done.append(T[ok].reshape(-1, 3)); T = T[~ok]; e = e[~ok]
        if not len(T): break
        k = e.argmax(1); a = T[np.arange(len(T)), k]; b = T[np.arange(len(T)), (k + 1) % 3]; c = T[np.arange(len(T)), (k + 2) % 3]
        m = (a + b) / 2; T = np.concatenate([np.stack([a, m, c], 1), np.stack([m, b, c], 1)])
    return np.unique(np.round(np.concatenate(done), 9), axis=0)
SAMP = [sample(V[F[SH[i]]]) for i in range(36)]
B = {b["name"]: b for b in json.load(open(v10p))["bones"]}
H0 = {n: np.array(B[n]["head"], float) for n in B}; T0 = {n: np.array(B[n]["tail"], float) for n in B}
def fk(Qd, root):
    Q = {n: np.array(q) for n, q in Qd.items()}
    for n in B:
        if n not in Q: Q[n] = Q[B[n]["parent"]]
    hd = {}
    def head(n):
        if n not in hd:
            p = B[n]["parent"]; hd[n] = np.array(root, float) if p is None else head(p) + Q[p] @ (H0[n] - H0[p])
        return hd[n]
    for n in B: head(n)
    return Q, hd
TREES = [cKDTree(p) for p in SAMP]                     # built once, in rest coordinates (rigid moves preserve distance)
CORN = [np.array([[x, y, z] for x in (p.min(0)[0], p.max(0)[0]) for y in (p.min(0)[1], p.max(0)[1]) for z in (p.min(0)[2], p.max(0)[2])]) for p in SAMP]
def xf(Q, hd):  # per part: rotation R and translation t with x' = R x + t
    out = []
    for i in range(36):
        bn = PART[i][1]; R = Q[bn]; out.append((R, hd[bn] - R @ H0[bn]))
    return out
def pose_pts(Q, hd): return [SAMP[i] @ R.T + t for i, (R, t) in enumerate(xf(Q, hd))]   # kept for reference; not used below
REST_Q = {n: np.eye(3).tolist() for n in B}
def clearances(X):
    """X = per-part (R, t). Min sample distance per pair, computed in the bigger part's rest frame."""
    box = []
    for i, (R, t) in enumerate(X):
        c = CORN[i] @ R.T + t; box.append((c.min(0), c.max(0)))   # conservative posed box
    res = {}
    for i in range(36):
        for j in range(i + 1, 36):
            a, b = names[i], names[j]
            if bone_of[a] == bone_of[b]: continue
            gap = np.maximum(0, np.maximum(box[i][0] - box[j][1], box[j][0] - box[i][1]))
            if np.linalg.norm(gap) > PRE: continue
            sm, bg = (i, j) if len(SAMP[i]) < len(SAMP[j]) else (j, i)
            (Rs, ts), (Rb, tb) = X[sm], X[bg]
            pts = (SAMP[sm] @ Rs.T + ts - tb) @ Rb                  # small part into big part's rest frame
            d = TREES[bg].query(pts, k=1, distance_upper_bound=PRE + 2 * H)[0]
            res[frozenset((a, b))] = float(d.min()) - H if np.isfinite(d.min()) else PRE
    return res
def key(p): return "|".join(sorted(p))
out = dict(h=H, threshold=THR, samples=int(sum(len(s) for s in SAMP)))
# C0
c0 = clearances(xf(*fk(REST_Q, H0["pelvis"])))
readme = {("upper_arm", "seg_mid_chest"): (1.750, 2.199), ("forearm", "seg_lower_waist"): (10.057, 10.506), ("hand", "thigh"): (13.823, 14.272),
          ("shoulder_marker", "seg_mid_chest"): (5.015, 5.464), ("elbow_marker", "seg_lower_waist"): (13.105, 13.554), ("wrist_marker", "thigh"): (16.194, 16.639)}
c0rows = []
for (p, q), (vl, vr) in readme.items():
    for s, ref in (("left", vl), ("right", vr)):
        qq = f"{q}_{s}" if q == "thigh" else q; k = frozenset((f"{p}_{s}", qq)); m = c0.get(k)
        c0rows.append(dict(pair=key(k), readme=ref, measured=None if m is None else round(m, 3), ok=m is not None and abs(m - ref) <= 0.30))
for s in ("left", "right"):
    for a, b in ((f"upper_arm_{s}", f"forearm_{s}"), (f"forearm_{s}", f"hand_{s}"), (f"thigh_{s}", f"shin_{s}"), (f"shin_{s}", f"foot_{s}"), ("pelvis", f"thigh_{s}")):
        m = c0.get(frozenset((a, b))); c0rows.append(dict(pair=key((a, b)), readme=2.0, measured=None if m is None else round(m, 3), ok=m is not None and abs(m - 2.0) <= 0.30))
rest_body_min = min((v, key(k)) for k, v in c0.items() if k not in JOINT)
out["C0"] = dict(rows=c0rows, result="PASS" if all(r["ok"] for r in c0rows) else "FAIL", rest_body_min=[round(rest_body_min[0], 3), rest_body_min[1]])
# C0b
def rotY(a): c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
Qb = dict(REST_Q); R = rotY(math.radians(30)); 
if not ((R @ (T0["lower_arm_right"] - H0["lower_arm_right"]))[0] < (T0["lower_arm_right"] - H0["lower_arm_right"])[0]): R = rotY(math.radians(-30))
Qb["lower_arm_right"] = R.tolist(); Qb["hand_right"] = R.tolist()
cb = clearances(xf(*fk(Qb, H0["pelvis"]))); mb = min((v, key(k)) for k, v in cb.items() if k not in JOINT)
out["C0b"] = dict(min_body_clearance=round(mb[0], 3), pair=mb[1], result="PASS" if mb[0] < THR else "FAIL")
print("C0", out["C0"]["result"], "C0b", out["C0b"], flush=True)
# C1 / C2
P = json.load(open(posep))
for var in ("variant_B", "main"):
    body_min = {}; joint_min = {}; per_key = []
    for fr in P[var]:
        c = clearances(xf(*fk(fr["Q"], fr["pelvis_head"]))); t = round(fr["t"], 6)
        kb = min(((v, key(k)) for k, v in c.items() if k not in JOINT), default=(PRE, None)); per_key.append([t, round(kb[0], 3), kb[1]])
        for k, v in c.items():
            dct = joint_min if k in JOINT else body_min
            if key(k) not in dct or v < dct[key(k)][0]: dct[key(k)] = (v, t)
    viol = [r for r in per_key if r[1] < THR]
    worst = sorted(((round(v, 3), p, t) for p, (v, t) in body_min.items()))[:10]
    jo = sorted(((round(v, 3), p, t) for p, (v, t) in joint_min.items()))
    out[var] = dict(C1=dict(keys=len(per_key), keys_below_1mm=len(viol), min=worst[0] if worst else None, result="PASS" if not viol else "FAIL",
                            first_violations=viol[:10]), worst10_body_pairs=worst, C2_joint_pairs_min=jo,
                    C2_joint_overlap_pairs=[x for x in jo if x[0] <= 0], per_key_min=per_key)
    print(var, json.dumps({k: v for k, v in out[var]["C1"].items()}), "| joint overlaps:", len(out[var]["C2_joint_overlap_pairs"]), flush=True)
json.dump(out, open(outj, "w"), indent=1, sort_keys=True)
