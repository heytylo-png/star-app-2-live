#!/usr/bin/env python3
"""v10 limited wave, amendment A1 part 1 (Issue #177): re-plant the feet with a rigid per-key shift of the whole figure.
Implements AMENDMENT_A1_FEET_AND_PART_CLEARANCE_FROZEN.md. Read-only on all inputs. numpy/scipy (via stlparts) only.
Usage: python3 -I replant_feet.py PRINT.stl V10_BONES.json LIMITED_POSE.json INPUT_POSE.json STLPARTS_DIR RESULT.json REPLANTED_POSE_OUT.json
"""
import hashlib, json, math, sys
import numpy as np
stl, v10p, limp, inp, tdir, resf, outp = sys.argv[1:8]; sys.path.insert(0, tdir)
from stlparts import load_stl, shells
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
HEAD_Z = 116.0
V, F = load_stl(stl); SH = shells(V, F); assert len(SH) == 36
FOOT = {"left": np.unique(F[SH[11]].ravel()), "right": np.unique(F[SH[27]].ravel())}
VB = {b["name"]: b for b in json.load(open(v10p))["bones"]}; H0 = {n: np.array(VB[n]["head"], float) for n in VB}
for s, x in (("left", -1), ("right", 1)):   # shells 11 / 27 really are the left / right foot solids
    c = V[FOOT[s]].mean(0); assert np.sign(c[0]) == x and c[2] < -60, (s, c)
z_floor = float(min(V[FOOT[s]][:, 2].min() for s in FOOT))
L = json.load(open(limp)); lim = L["main"]; order = L["order"]; inpose = json.load(open(inp))["variant_B"]; assert len(lim) == len(inpose) == 135
def foot_low(fr, s, shift=np.zeros(3)):
    b = f"foot_{s}"; R = np.array(fr["Q"][b]); return float((V[FOOT[s]] @ R.T + (np.array(fr["head"][b]) + shift - R @ H0[b]))[:, 2].min())
keys, out = [], []; prev = None; step_z = step_xy = 0.0
for fr, fi in zip(lim, inpose):
    assert abs(fr["t"] - fi["t"]) < 1e-9
    a_lim, a_in = np.array(fr["head"]["foot_right"]), np.array(fi["head"]["foot_right"])
    d = np.array([a_in[0] - a_lim[0], a_in[1] - a_lim[1], 0.0])                       # step A
    low0 = {s: foot_low(fr, s) for s in FOOT}; low_in = {s: foot_low(fi, s) for s in FOOT}
    d[2] = z_floor - min(low0.values())                                               # step B
    low1 = {s: foot_low(fr, s, d) for s in FOOT}
    new = dict(t=fr["t"], pelvis_head=[float(x) for x in np.array(fr["pelvis_head"]) + d], Q=fr["Q"],
               head={n: [float(x) for x in np.array(fr["head"][n]) + d] for n in order}, tail={n: [float(x) for x in np.array(fr["tail"][n]) + d] for n in order})
    out.append(new)
    if prev is not None: step_z = max(step_z, abs(d[2] - prev[2])); step_xy = max(step_xy, float(np.linalg.norm(d[:2] - prev[:2])))
    prev = d
    hand_hi = max(new["head"]["hand_right"][2], new["tail"]["hand_right"][2])
    keys.append(dict(t=fr["t"], shift=[round(float(x), 4) for x in d], lowest_before={s: round(low0[s] - z_floor, 4) for s in FOOT}, lowest_input_pose={s: round(low_in[s] - z_floor, 4) for s in FOOT},
                     height_above_floor={s: round(low1[s] - z_floor, 4) for s in FOOT}, floor_err=float(f"{abs(min(low1.values()) - z_floor):.2e}"),
                     ankle_R_xy_err=float(f"{float(np.linalg.norm(np.array(new['head']['foot_right'])[:2] - a_in[:2])):.2e}"),
                     hand_high_z=round(hand_hi, 4), wrist_R_z=round(new["head"]["hand_right"][2], 4), head_head_z=round(new["head"]["head"][2], 4)))
raised = [x for x in keys if 3.0416 <= x["t"] <= 3.9168]; assert len(raised) == 22
met = sum(1 for x in raised if x["hand_high_z"] >= HEAD_Z and x["hand_high_z"] >= x["head_head_z"])
f1 = max(x["floor_err"] for x in keys); f2 = max(x["ankle_R_xy_err"] for x in keys)
res = dict(amendment_sha256="7f39e162e82c6a4c2d74e28ce904da9b573be95132673694b073361456c77bd9",
           inputs=dict(stl_sha256=sha(stl), limited_pose_sha256=sha(limp), input_pose_sha256=sha(inp), v10_json_sha256=sha(v10p)),
           z_floor=round(z_floor, 4), foot_solid_vertices={s: int(len(FOOT[s])) for s in FOOT},
           F1=dict(max_floor_error_mm=f1, result="PASS" if f1 <= 0.01 else "FAIL"), F2=dict(max_right_ankle_xy_error_mm=f2, result="PASS" if f2 <= 0.01 else "FAIL"),
           F3=dict(rotations_changed_deg=0.0, note="Q is copied unchanged from the limited pose; only positions are shifted", result="PASS"),
           F4=dict(raised_keys=22, keys_meeting=met, highest_hand_point_z=max(x["hand_high_z"] for x in raised), highest_wrist_z=max(x["wrist_R_z"] for x in raised), result="PASS" if met >= 1 else "FAIL"),
           height_above_floor={s: dict(max_mm=max(x["height_above_floor"][s] for x in keys), keys_above_0p5=int(sum(x["height_above_floor"][s] > 0.5 for x in keys)),
                                       keys_on_floor=int(sum(x["height_above_floor"][s] <= 0.01 for x in keys))) for s in FOOT},
           lowest_before_shift={s: dict(min_mm=min(x["lowest_before"][s] for x in keys), max_mm=max(x["lowest_before"][s] for x in keys)) for s in FOOT},
           lowest_input_pose={s: dict(min_mm=min(x["lowest_input_pose"][s] for x in keys), max_mm=max(x["lowest_input_pose"][s] for x in keys)) for s in FOOT},
           shift=dict(z_range=[min(x["shift"][2] for x in keys), max(x["shift"][2] for x in keys)], xy_max=round(max(math.hypot(x["shift"][0], x["shift"][1]) for x in keys), 4),
                      max_key_to_key_z=round(step_z, 4), max_key_to_key_xy=round(step_xy, 4)), per_key=keys)
json.dump(res, open(resf, "w"), indent=1, sort_keys=True); json.dump(dict(animation=L.get("animation"), order=order, parents=L["parents"], main=out), open(outp, "w"))
print(json.dumps({k: v for k, v in res.items() if k != "per_key"}, indent=1))
