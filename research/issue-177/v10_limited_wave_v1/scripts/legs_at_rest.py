#!/usr/bin/env python3
"""v10 limited wave, amendment A2 (Issue #177): lower body in the v10 rest stance, upper body carried over rigidly
from the v1 limited pose. Implements AMENDMENT_A2_LEGS_AT_REST_FROZEN.md (rules G1-G4; G5 is part_clearance_a2.py).
Usage: python3 -I legs_at_rest.py PRINT.stl V10_BONES.json LIMITED_POSE.json STLPARTS_DIR RESULT.json A2_POSE_OUT.json
"""
import hashlib, json, math, sys
import numpy as np
stl, v10p, limp, tdir, resf, outp = sys.argv[1:7]; sys.path.insert(0, tdir)
from stlparts import load_stl, shells
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest(); HEAD_Z = 116.0
VB = {b["name"]: b for b in json.load(open(v10p))["bones"]}; vh = {n: np.array(VB[n]["head"], float) for n in VB}; vt = {n: np.array(VB[n]["tail"], float) for n in VB}
L = json.load(open(limp)); order = L["order"]; lim = L["main"]; BONES = [n for n in order if VB[n]["type"] == "bone"]
LOWER = ["pelvis"] + [f"{b}_{s}" for s in ("left", "right") for b in ("thigh", "shin", "foot")]
def bone_parent(n):
    p = VB[n]["parent"]
    while p and VB[p]["type"] != "bone": p = VB[p]["parent"]
    return p
def under(n, roots):
    while n: 
        if n in roots: return True
        n = VB[n]["parent"]
    return False
LEGSET = {n for n in order if under(n, {f"thigh_{s}" for s in ("left", "right")})}
V, F = load_stl(stl); SH = shells(V, F); FOOT = {"left": np.unique(F[SH[11]].ravel()), "right": np.unique(F[SH[27]].ravel())}
z_floor = float(min(V[FOOT[s]][:, 2].min() for s in FOOT))
def deg(R):
    """Rotation angle. atan2 form: accurate near 0, where the acos-of-trace form loses precision (about 1e-5 deg)."""
    s = 0.5 * math.sqrt((R[2, 1] - R[1, 2]) ** 2 + (R[0, 2] - R[2, 0]) ** 2 + (R[1, 0] - R[0, 1]) ** 2)
    return math.degrees(math.atan2(s, (np.trace(R) - 1) / 2))
def deg_acos(R): return math.degrees(math.acos(max(-1.0, min(1.0, (np.trace(R) - 1) / 2))))   # first implementation, kept for the record
def unit(v): return v / np.linalg.norm(v)
def angv(u, v): return math.degrees(math.acos(max(-1.0, min(1.0, float(unit(u) @ unit(v))))))
def fk(Q, root):
    H, T = {}, {}
    for n in order:
        p = VB[n]["parent"]; H[n] = root.copy() if p is None else H[p] + Q[p] @ (vh[n] - vh[p]); T[n] = H[n] + Q[n] @ (vt[n] - vh[n])
    return H, T
keys, out = [], []
for fr in lim:
    Q1 = {n: np.array(fr["Q"][n]) for n in order}; Qp = Q1["pelvis"]; Q2 = {}
    for n in order: Q2[n] = np.eye(3) if (n == "pelvis" or n in LEGSET) else Qp.T @ Q1[n]
    H, T = fk(Q2, vh["pelvis"]); H1 = {n: np.array(fr["head"][n]) for n in order}; T1 = {n: np.array(fr["tail"][n]) for n in order}
    lenerr = max(abs(float(np.linalg.norm(T[b] - H[b])) - float(np.linalg.norm(vt[b] - vh[b]))) for b in BONES)
    lowerr = max(max(float(np.linalg.norm(H[b] - vh[b])), float(np.linalg.norm(T[b] - vt[b]))) for b in LOWER)
    footerr = max(abs(float((V[FOOT[s]] @ Q2[f"foot_{s}"].T + (H[f"foot_{s}"] - Q2[f"foot_{s}"] @ vh[f"foot_{s}"]))[:, 2].min()) - z_floor) for s in FOOT)
    relerr = max(deg((Q1[bone_parent(b)].T @ Q1[b]).T @ (Q2[bone_parent(b)].T @ Q2[b])) for b in BONES if b not in LOWER)
    relerr_acos = max(deg_acos((Q1[bone_parent(b)].T @ Q1[b]).T @ (Q2[bone_parent(b)].T @ Q2[b])) for b in BONES if b not in LOWER)
    hi = max(H["hand_right"][2], T["hand_right"][2])
    keys.append(dict(t=fr["t"], len_err_max_mm=float(f"{lenerr:.3e}"), lower_body_pos_err_mm=float(f"{lowerr:.3e}"), foot_floor_err_mm=float(f"{footerr:.3e}"), upper_rel_rot_err_deg=float(f"{relerr:.3e}"), upper_rel_rot_err_deg_acos_form=float(f"{relerr_acos:.3e}"),
                     hand_high_z=round(float(hi), 4), wrist_R_z=round(float(H["hand_right"][2]), 4), head_head_z=round(float(H["head"][2]), 4),
                     pelvis_rotation_removed_deg=round(deg(Qp), 3), pelvis_translation_removed_mm=round(float(np.linalg.norm(np.array(fr["pelvis_head"]) - vh["pelvis"])), 3),
                     wrist_R_shift_vs_v1_mm=round(float(np.linalg.norm(H["hand_right"] - H1["hand_right"])), 3), hand_tip_R_shift_vs_v1_mm=round(float(np.linalg.norm(T["hand_right"] - T1["hand_right"])), 3),
                     head_dir_change_vs_v1_deg=round(angv(T["head"] - H["head"], T1["head"] - H1["head"]), 3)))
    out.append(dict(t=fr["t"], pelvis_head=[float(x) for x in vh["pelvis"]], Q={n: [[float(x) for x in r] for r in Q2[n]] for n in order},
                    head={n: [float(x) for x in H[n]] for n in order}, tail={n: [float(x) for x in T[n]] for n in order}))
raised = [x for x in keys if 3.0416 <= x["t"] <= 3.9168]; assert len(raised) == 22
met = sum(1 for x in raised if x["hand_high_z"] >= HEAD_Z and x["hand_high_z"] >= x["head_head_z"])
mx = lambda k: max(x[k] for x in keys)
res = dict(amendment_sha256="e55204cb288c6b6bb50fa106d8915a7bd87a18a7b573fb078d79eb7bbc3bcfc2", inputs=dict(limited_pose_sha256=sha(limp), stl_sha256=sha(stl), v10_json_sha256=sha(v10p)), keys=len(keys), z_floor=round(z_floor, 4),
           G1=dict(max_abs_length_error_mm=mx("len_err_max_mm"), result="PASS" if mx("len_err_max_mm") <= 0.01 else "FAIL"),
           G2=dict(max_lower_body_position_error_mm=mx("lower_body_pos_err_mm"), max_foot_floor_error_mm=mx("foot_floor_err_mm"), result="PASS" if mx("lower_body_pos_err_mm") <= 1e-9 and mx("foot_floor_err_mm") <= 0.01 else "FAIL"),
           G3=dict(max_upper_body_relative_rotation_error_deg=mx("upper_rel_rot_err_deg"), first_implementation_acos_form_deg=mx("upper_rel_rot_err_deg_acos_form"), note="the acos-of-trace angle cannot resolve below about 1e-5 deg; the atan2 form is used for the rule", result="PASS" if mx("upper_rel_rot_err_deg") <= 1e-6 else "FAIL"),
           G4=dict(raised_keys=22, keys_meeting=met, highest_hand_point_z=max(x["hand_high_z"] for x in raised), highest_wrist_z=max(x["wrist_R_z"] for x in raised),
                   wrist_keys_at_or_above_116=int(sum(x["wrist_R_z"] >= HEAD_Z for x in raised)), result="PASS" if met >= 1 else "FAIL"),
           removed=dict(max_pelvis_rotation_deg=mx("pelvis_rotation_removed_deg"), max_pelvis_translation_mm=mx("pelvis_translation_removed_mm")),
           vs_v1=dict(max_wrist_R_shift_mm=mx("wrist_R_shift_vs_v1_mm"), max_hand_tip_R_shift_mm=mx("hand_tip_R_shift_vs_v1_mm"), max_head_direction_change_deg=mx("head_dir_change_vs_v1_deg")), per_key=keys)
json.dump(res, open(resf, "w"), indent=1, sort_keys=True); json.dump(dict(animation=L.get("animation"), order=order, parents=L["parents"], main=out), open(outp, "w"))
print(json.dumps({k: v for k, v in res.items() if k != "per_key"}, indent=1))
