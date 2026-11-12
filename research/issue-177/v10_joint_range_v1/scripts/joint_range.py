#!/usr/bin/env python3
"""v10 joint bend range vs retargeted greet_02 (Issue #177). Implements research/issue-177/v10_joint_range_v1/METHOD_AND_CRITERIA_FROZEN.md @a6c29b2.
Reuses part_clearance_a2.py definitions (mapping, sampling, FK). Usage: python3 -I joint_range.py PRINT.stl V10.json POSE.json SCRIPTS_DIR OUT.json [CHECKPOINT_DIR]"""
import json, math, sys
import numpy as np
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation as Rot
stl, v10p, posep, sdir, outj = sys.argv[1:6]; CACHE = sys.argv[6] if len(sys.argv) > 6 else None  # per-joint checkpoints (resume after restart; results unchanged)
import os
src = open(f"{sdir}/part_clearance_a2.py").read().split("TREES = [cKDTree")[0]
sys.argv = ["pc", stl, v10p, posep, sdir, "/dev/null"]; ns = {"__name__": "pc"}; exec(compile(src, "pc", "exec"), ns)
SAMP, PART, B, H0, T0, fk, H = ns["SAMP"], ns["PART"], ns["B"], ns["H0"], ns["T0"], ns["fk"], ns["H"]
idx = {PART[i][0]: i for i in range(36)}; bone_of = {PART[i][0]: PART[i][1] for i in range(36)}
R_NEAR, NBIS = 25.0, 10
JOINTS = {"neck": [("neck_cyl", "head"), ("seg_upper_chest", "head"), ("neck_marker", "head")],
          "spine_hip_lower_waist": [("seg_hip", "seg_lower_waist")], "spine_lower_waist_waist": [("seg_lower_waist", "seg_waist")],
          "spine_waist_mid_chest": [("seg_waist", "seg_mid_chest")], "spine_mid_upper_chest": [("seg_mid_chest", "seg_upper_chest")]}
for s in ("left", "right"):
    JOINTS[f"hip_{s}"] = [("pelvis", f"thigh_{s}")]
    JOINTS[f"elbow_{s}"] = [(f"upper_arm_{s}", f"forearm_{s}"), (f"elbow_marker_{s}", f"forearm_{s}")]
    JOINTS[f"wrist_{s}"] = [(f"forearm_{s}", f"hand_{s}"), (f"wrist_marker_{s}", f"hand_{s}")]
    JOINTS[f"knee_{s}"] = [(f"thigh_{s}", f"shin_{s}"), (f"knee_marker_{s}", f"shin_{s}")]
    JOINTS[f"ankle_{s}"] = [(f"shin_{s}", f"foot_{s}"), (f"ankle_marker_{s}", f"foot_{s}")]
def ancestors(b):
    out = []
    while B[b]["parent"]: b = B[b]["parent"]; out.append(b)
    return out
def eff(b):  # bone whose Q drives b (attachments use parent's Q)
    return b if B[b]["type"] == "bone" else eff(B[b]["parent"])
setup = {}
for j, pairs in JOINTS.items():
    pb, cb = eff(bone_of[pairs[0][0]]), eff(bone_of[pairs[0][1]])
    assert pb in ancestors(cb), (j, pb, cb)
    J = H0[cb]; prs = []
    for pa, ca in pairs:
        assert eff(bone_of[pa]) == pb and eff(bone_of[ca]) == cb, (j, pa, ca)
        P = SAMP[idx[pa]]; C = SAMP[idx[ca]]
        P = P[np.linalg.norm(P - J, axis=1) <= R_NEAR]; C = C[np.linalg.norm(C - J, axis=1) <= R_NEAR]
        prs.append((f"{pa}|{ca}", cKDTree(P), C - J))
    u = T0[cb] - H0[cb]; u = u / np.linalg.norm(u)
    setup[j] = dict(p=pb, c=cb, J=J, pairs=prs, u=u)
def clear(st, R):
    m = 1e9; who = None
    for name, tree, C in st["pairs"]:
        d = float(tree.query(C @ R.T + st["J"], k=1)[0].min()) - H
        if d < m: m, who = d, name
    return m, who
def allowed(st, R):
    rv = Rot.from_matrix(R).as_rotvec()
    if clear(st, R)[0] > 0: return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(NBIS):
        mid = (lo + hi) / 2
        if clear(st, Rot.from_rotvec(mid * rv).as_matrix())[0] > 0: lo = mid
        else: hi = mid
    return lo
def swing_twist(R, u):
    v = R @ u; sw = math.degrees(math.acos(np.clip(u @ v, -1, 1)))
    ax = np.cross(u, v); n = np.linalg.norm(ax)
    Rs = np.eye(3) if n < 1e-12 else Rot.from_rotvec(ax / n * math.radians(sw)).as_matrix()
    tw = math.degrees(np.linalg.norm(Rot.from_matrix(Rs.T @ R).as_rotvec())); return sw, tw
out = dict(radius_mm=R_NEAR, bisection_steps=NBIS, joints={})
# rest check + control
rest = {j: round(clear(st, np.eye(3))[0], 3) for j, st in setup.items()}
out["rest_clearance"] = rest
ctrl = allowed(setup["knee_right"], Rot.from_rotvec([math.radians(90), 0, 0]).as_matrix())
out["control_knee_right_90deg"] = dict(s_star=round(ctrl, 4), result="PASS" if ctrl < 1 else "FAIL")
print("rest", rest, "\ncontrol", out["control_knee_right_90deg"], flush=True)
P = json.load(open(posep))["variant_B"]
for j, st in setup.items():
    cf = f"{CACHE}/{j}.json" if CACHE else None
    if cf and os.path.exists(cf):
        out["joints"][j] = json.load(open(cf)); print(j, "(checkpoint)", flush=True); continue
    if rest[j] <= 0: out["joints"][j] = dict(verdict="NOT VERIFIABLE", rest_clearance=rest[j]); continue
    rows = []
    for fr in P:
        Qp, Qc = np.array(fr["Q"][st["p"]]), np.array(fr["Q"][st["c"]]); R = Qp.T @ Qc
        th = math.degrees(np.linalg.norm(Rot.from_matrix(R).as_rotvec())); sw, tw = swing_twist(R, st["u"])
        s = allowed(st, R); rows.append(dict(t=round(fr["t"], 6), demanded=round(th, 2), swing=round(sw, 2), twist=round(tw, 2), s=round(s, 4), allowed=round(s * th, 2)))
    lim = [r for r in rows if r["s"] < 1]
    worst = max(lim, key=lambda r: r["demanded"] - r["allowed"]) if lim else None
    out["joints"][j] = dict(verdict="LIMITED" if lim else "FOLLOWS", keys_limited=len(lim), max_demanded=max(r["demanded"] for r in rows),
                            max_swing=max(r["swing"] for r in rows), max_twist=max(r["twist"] for r in rows),
                            worst=None if worst is None else dict(worst, shortfall=round(worst["demanded"] - worst["allowed"], 2)),
                            min_allowed_when_limited=None if not lim else min(r["allowed"] for r in lim), rows=rows)
    if cf:
        json.dump(out["joints"][j], open(cf + ".tmp", "w"), sort_keys=True); os.replace(cf + ".tmp", cf)
    print(j, json.dumps({k: v for k, v in out["joints"][j].items() if k != "rows"}), flush=True)
json.dump(out, open(outj, "w"), indent=1, sort_keys=True)
