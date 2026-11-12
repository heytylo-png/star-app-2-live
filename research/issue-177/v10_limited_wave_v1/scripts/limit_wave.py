#!/usr/bin/env python3
"""v10 limited wave v1 (Issue #177): hold every assessed joint of the retargeted greet_02 to the printed-joint limit.
Implements METHOD_AND_CRITERIA_FROZEN.md. Read-only on all inputs. numpy only.
Usage: python3 -I limit_wave.py V10_BONES.json POSE.json JOINT_RANGE.json RESULT.json LIMITED_POSE_OUT.json [INPUT_POSE_OUT.json]
RESULT.json: criteria and per-key values (committed). The pose outputs are not committed.
"""
import hashlib, json, math, sys
import numpy as np
v10p, posep, jrp, resf, outpose = sys.argv[1:6]; inpose = sys.argv[6] if len(sys.argv) > 6 else None
RADIUS, CLEAR, LEN_TOL, HEAD_Z, MARGIN = 1.2, 2.0, 0.01, 116.0, 0.001
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
VB = {b["name"]: b for b in json.load(open(v10p))["bones"]}
PJ = json.load(open(posep)); order = PJ["order"]; frames = PJ["variant_B"]; JR = json.load(open(jrp))["joints"]
vh = {n: np.array(VB[n]["head"], float) for n in VB}; vt = {n: np.array(VB[n]["tail"], float) for n in VB}
BONES = [n for n in order if VB[n]["type"] == "bone"]; rest_len = {b: float(np.linalg.norm(vt[b] - vh[b])) for b in BONES}
def bone_parent(n):
    p = VB[n]["parent"]
    while p and VB[p]["type"] != "bone": p = VB[p]["parent"]
    return p
JOINTS = {"neck": ("upper_chest", "head"), "spine_hip_lower_waist": ("hip", "lower_waist"), "spine_lower_waist_waist": ("lower_waist", "waist"),
          "spine_waist_mid_chest": ("waist", "mid_chest"), "spine_mid_upper_chest": ("mid_chest", "upper_chest")}
for s in ("left", "right"):
    JOINTS.update({f"hip_{s}": ("pelvis", f"thigh_{s}"), f"elbow_{s}": (f"upper_arm_{s}", f"lower_arm_{s}"), f"wrist_{s}": (f"lower_arm_{s}", f"hand_{s}"),
                   f"knee_{s}": (f"thigh_{s}", f"shin_{s}"), f"ankle_{s}": (f"shin_{s}", f"foot_{s}")})
assert sorted(JOINTS) == sorted(JR) and all(bone_parent(c) == p for p, c in JOINTS.values())
BYCHILD = {c: j for j, (p, c) in JOINTS.items()}
def rotvec(R):
    c = max(-1.0, min(1.0, (np.trace(R) - 1) / 2)); th = math.acos(c)
    if th < 1e-12: return np.zeros(3)
    w = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
    if math.pi - th < 1e-6:
        A = (R + np.eye(3)) / 2; i = int(np.argmax(np.diag(A))); ax = A[:, i] / math.sqrt(A[i, i]); return ax / np.linalg.norm(ax) * th
    return w / (2 * math.sin(th)) * th
def expm(v):
    th = float(np.linalg.norm(v))
    if th < 1e-15: return np.eye(3)
    a = v / th; K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * K @ K
deg = lambda R: math.degrees(float(np.linalg.norm(rotvec(R))))
def unit(v): return v / np.linalg.norm(v)
def angv(u, v): return math.degrees(math.acos(max(-1.0, min(1.0, float(unit(u) @ unit(v))))))
def fk(Q, root):
    H, T = {}, {}
    for n in order:
        p = VB[n]["parent"]; H[n] = root.copy() if p is None else H[p] + Q[p] @ (vh[n] - vh[p]); T[n] = H[n] + Q[n] @ (vt[n] - vh[n])
    return H, T
def seg_dist(p1, q1, p2, q2):
    d1, d2, r = q1 - p1, q2 - p2, p1 - p2; a, e, f = d1 @ d1, d2 @ d2, d2 @ r; eps = 1e-18
    if a <= eps and e <= eps: s = t = 0.0
    elif a <= eps: s, t = 0.0, min(1.0, max(0.0, f / e))
    else:
        c = d1 @ r
        if e <= eps: t, s = 0.0, min(1.0, max(0.0, -c / a))
        else:
            b = d1 @ d2; den = a * e - b * b; s = min(1.0, max(0.0, (b * f - c * e) / den)) if den > eps else 0.0; t = (b * s + f) / e
            if t < 0: t, s = 0.0, min(1.0, max(0.0, -c / a))
            elif t > 1: t, s = 1.0, min(1.0, max(0.0, (b - c) / a))
    return float(np.linalg.norm((p1 + d1 * s) - (p2 + d2 * t)))
GROUPS = {"L_arm": ["upper_arm_left", "lower_arm_left", "hand_left"], "R_arm": ["upper_arm_right", "lower_arm_right", "hand_right"],
          "L_leg": ["thigh_left", "shin_left", "foot_left"], "R_leg": ["thigh_right", "shin_right", "foot_right"],
          "torso": ["pelvis", "hip", "lower_waist", "waist", "mid_chest", "upper_chest"]}
EXCL = {frozenset(p) for p in (("upper_arm_left", "upper_chest"), ("upper_arm_right", "upper_chest"), ("thigh_left", "pelvis"), ("thigh_right", "pelvis"))}
GN = list(GROUPS); PAIRS = [(ga, gb, a, b) for i, ga in enumerate(GN) for gb in GN[i + 1:] for a in GROUPS[ga] for b in GROUPS[gb] if frozenset((a, b)) not in EXCL]
def minclear(H, T):
    best = (1e9, None)
    for ga, gb, a, b in PAIRS:
        d = seg_dist(H[a], T[a], H[b], T[b])
        if d < best[0]: best = (d, f"{a}|{b}")
    return best
Hr, Tr = fk({n: np.eye(3) for n in order}, vh["pelvis"]); rest_min = minclear(Hr, Tr)[0]; THR = 2 * RADIUS + CLEAR

keys, pose_out, pose_in = [], [], []
prevrel = {"in": {}, "out": {}}; step = {j: [0.0, 0.0] for j in JOINTS}
for k, fr in enumerate(frames):
    t = fr["t"]; Q = {n: np.array(fr["Q"][n]) for n in order}; root = np.array(fr["pelvis_head"]); Q2 = {}; jrow = {}
    for n in order:
        if VB[n]["type"] != "bone": Q2[n] = Q2[VB[n]["parent"]]; continue
        p = bone_parent(n)
        if p is None: Q2[n] = Q[n]; continue
        Rrel = Q[p].T @ Q[n]
        if n in BYCHILD:
            j = BYCHILD[n]; row = JR[j]["rows"][k]; assert abs(row["t"] - t) < 1e-5
            s = row["s"]; s2 = 1.0 if s >= 1 else max(0.0, s - MARGIN); th = deg(Rrel)
            R2 = Rrel if s2 >= 1 else expm(s2 * rotvec(Rrel)); th2 = deg(R2)
            jrow[j] = dict(s_star=s, demanded=round(th, 3), limited=round(th2, 3), allowed=round(s * th, 3),
                           within=bool(th2 <= s * th + 0.01), unchanged_err=float(f"{deg(Rrel.T @ R2):.2e}") if s >= 1 else None,
                           swing_in=round(angv(vt[n] - vh[n], Rrel @ (vt[n] - vh[n])), 3))
            for tag, M, i in (("in", Rrel, 0), ("out", R2, 1)):
                if j in prevrel[tag]: step[j][i] = max(step[j][i], deg(prevrel[tag][j].T @ M))
                prevrel[tag][j] = M
        else: R2 = Rrel
        Q2[n] = Q2[p] @ R2
    H, T = fk(Q, root); H2, T2 = fk(Q2, root)
    lenerr = max(abs(float(np.linalg.norm(T2[b] - H2[b])) - rest_len[b]) for b in BONES); mc = minclear(H2, T2); mc0 = minclear(H, T)
    keys.append(dict(t=t, len_err_max_mm=float(f"{lenerr:.3e}"), joints=jrow, min_axis_dist_mm=round(mc[0], 4), min_pair=mc[1], min_axis_dist_input_mm=round(mc0[0], 4),
                     wrist_R_z=[round(float(H["hand_right"][2]), 4), round(float(H2["hand_right"][2]), 4)], hand_tip_R_z=[round(float(T["hand_right"][2]), 4), round(float(T2["hand_right"][2]), 4)],
                     head_head_z=round(float(H2["head"][2]), 4), wrist_R_shift_mm=round(float(np.linalg.norm(H2["hand_right"] - H["hand_right"])), 3),
                     hand_tip_R_shift_mm=round(float(np.linalg.norm(T2["hand_right"] - T["hand_right"])), 3),
                     wrist_L_shift_mm=round(float(np.linalg.norm(H2["hand_left"] - H["hand_left"])), 3),
                     ankle_z=dict(left=[round(float(H["foot_left"][2]), 3), round(float(H2["foot_left"][2]), 3)], right=[round(float(H["foot_right"][2]), 3), round(float(H2["foot_right"][2]), 3)]),
                     foot_tail_z=dict(left=[round(float(T["foot_left"][2]), 3), round(float(T2["foot_left"][2]), 3)], right=[round(float(T["foot_right"][2]), 3), round(float(T2["foot_right"][2]), 3)]),
                     head_dir_change_deg=round(angv(T["head"] - H["head"], T2["head"] - H2["head"]), 3)))
    for dst, QQ, HH, TT in ((pose_out, Q2, H2, T2), (pose_in, Q, H, T)):
        dst.append(dict(t=t, pelvis_head=[float(x) for x in root], Q={n: [[float(x) for x in r] for r in QQ[n]] for n in order},
                        head={n: [float(x) for x in HH[n]] for n in order}, tail={n: [float(x) for x in TT[n]] for n in order}))
raised = [x for x in keys if 3.0416 <= x["t"] <= 3.9168]; assert len(raised) == 22
def reach(i):
    hi = [(max(x["wrist_R_z"][i], x["hand_tip_R_z"][i]), x) for x in raised]; b = max(hi, key=lambda p: p[0])
    met = sum(1 for h, x in hi if h >= HEAD_Z and h >= x["head_head_z"]) if i == 1 else None
    return dict(highest_hand_point_z=round(b[0], 3), t=b[1]["t"], highest_wrist_z=round(max(x["wrist_R_z"][i] for x in raised), 3), keys_meeting=met)
c1 = max(x["len_err_max_mm"] for x in keys)
l2_within = all(v["within"] for x in keys for v in x["joints"].values()); l2_unch = max((v["unchanged_err"] or 0.0) for x in keys for v in x["joints"].values())
viol = [x for x in keys if x["min_axis_dist_mm"] < THR]; worst = min(keys, key=lambda x: x["min_axis_dist_mm"]); r_out = reach(1)
per_joint = {}
for j in JOINTS:
    rows = [x["joints"][j] for x in keys]; lim = [r for r in rows if r["s_star"] < 1]
    per_joint[j] = dict(max_demanded=max(r["demanded"] for r in rows), max_limited=max(r["limited"] for r in rows), keys_changed=len(lim),
                        max_pure_swing_input=max(r["swing_in"] for r in rows), min_allowed_when_limited=min((r["allowed"] for r in lim), default=None),
                        max_key_to_key_step_deg=dict(input=round(step[j][0], 3), limited=round(step[j][1], 3)))
res = dict(frozen_method_sha256="6ddaa9fffd2be1f7d9863af68bda7e939e78bc613c7ad1d019ea336adcea1727",
           inputs=dict(pose_sha256=sha(posep), joint_range_sha256=sha(jrp), v10_json_sha256=sha(v10p)), keys=len(keys), margin_on_s=MARGIN,
           L1=dict(max_abs_length_error_mm=c1, result="PASS" if c1 <= LEN_TOL else "FAIL"),
           L2=dict(all_within_allowed=l2_within, max_change_where_s_is_1_deg=l2_unch, result="PASS" if l2_within and l2_unch <= 1e-6 else "FAIL"),
           L3=dict(raised_keys=len(raised), input=reach(0), limited=r_out, result="PASS" if r_out["keys_meeting"] >= 1 else "FAIL"),
           L4=dict(rest_min_axis_dist_mm=round(rest_min, 4), keys_with_violation=len(viol), worst=dict(t=worst["t"], axis_dist_mm=worst["min_axis_dist_mm"], clearance_mm=round(worst["min_axis_dist_mm"] - 2 * RADIUS, 4), pair=worst["min_pair"]),
                   input_min_axis_dist_mm=min(x["min_axis_dist_input_mm"] for x in keys), result="NOT VERIFIABLE" if rest_min < THR else "PASS" if not viol else "FAIL"),
           per_joint=per_joint,
           right_hand=dict(max_wrist_shift_mm=max(x["wrist_R_shift_mm"] for x in keys), max_tip_shift_mm=max(x["hand_tip_R_shift_mm"] for x in keys),
                           max_wrist_shift_raised_mm=max(x["wrist_R_shift_mm"] for x in raised)),
           left_hand=dict(max_wrist_shift_mm=max(x["wrist_L_shift_mm"] for x in keys)),
           feet={s: dict(ankle_z_input=[min(x["ankle_z"][s][0] for x in keys), max(x["ankle_z"][s][0] for x in keys)], ankle_z_limited=[min(x["ankle_z"][s][1] for x in keys), max(x["ankle_z"][s][1] for x in keys)],
                         foot_tail_z_input=[min(x["foot_tail_z"][s][0] for x in keys), max(x["foot_tail_z"][s][0] for x in keys)], foot_tail_z_limited=[min(x["foot_tail_z"][s][1] for x in keys), max(x["foot_tail_z"][s][1] for x in keys)],
                         max_ankle_z_change=round(max(abs(x["ankle_z"][s][1] - x["ankle_z"][s][0]) for x in keys), 3)) for s in ("left", "right")},
           head=dict(max_direction_change_deg=max(x["head_dir_change_deg"] for x in keys)), per_key=keys)
json.dump(res, open(resf, "w"), indent=1, sort_keys=True)
json.dump(dict(animation=PJ.get("animation"), order=order, parents=PJ["parents"], main=pose_out), open(outpose, "w"))
if inpose: json.dump(dict(animation=PJ.get("animation"), order=order, parents=PJ["parents"], main=pose_in), open(inpose, "w"))
print(json.dumps({k: res[k] for k in ("L1", "L2", "L3", "L4", "right_hand", "left_hand", "feet", "head")}, indent=1)); print(json.dumps(per_joint, indent=1))
