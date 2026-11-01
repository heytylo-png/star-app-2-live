#!/usr/bin/env python3
"""Independent reproduction checks for the MPFB2 study (Issue #179).

Inputs (all committed, read-only):
  STUDY  = research/reflib_v1/mpfb2_study/ at commit 8513fffa818c17e98bb47edee76c11a4d678ff3b
  V83    = public/rig/star_rai_tripo/star_rai_tripo_v8_3_blender_bones{,_mm}.json at commit
           3ac5602ca232abee0a3e78b1ad450f73e6c4f512 (branch rig/tripo-v8_3-hairalt-v3_5_1-experimental),
           identified by SHA-256 5d373125... / 235767bf... (the study's stated Star Rai inputs)
No MPFB2 asset file, no v10 file, no Blender. Python 3 stdlib + numpy.
Usage: python3 -I reproduce_mpfb2_review.py STUDY_DIR V83_JSON V83_MM_JSON > repro_output.json
"""
import csv, hashlib, json, math, sys
import numpy as np

STUDY, V83, V83MM = sys.argv[1], sys.argv[2], sys.argv[3]
out = {}

def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()

def rows(name):
    with open(f"{STUDY}/outputs/{name}", newline="") as f:
        return list(csv.DictReader(f))

def jl(name):
    return json.load(open(f"{STUDY}/outputs/{name}"))

out["input_sha256"] = {"v83": sha(V83), "v83_mm": sha(V83MM)}

# ---------------- C1 coordinate conversion ----------------
M = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float)   # rig = M @ obj / 10
cf = jl("coordinates_foot.json")
ext = cf["body_extent_rig_space_m"]
lo, hi = np.array(ext["raw_obj_min"]), np.array(ext["raw_obj_max"])
corners = np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])])
rc = (M @ corners.T).T / 10
out["C1_conversion"] = dict(
    det=float(np.linalg.det(M)), orthonormal=bool(np.allclose(M @ M.T, np.eye(3))),
    rig_min_from_raw=rc.min(0).round(6).tolist(), rig_max_from_raw=rc.max(0).round(6).tolist(),
    reported_min=ext["min"], reported_max=ext["max"],
    height_from_raw=float(rc[:, 2].max() - rc[:, 2].min()), reported_height=ext["height_z"])

# ---------------- C1b v8.3 conventions (from committed JSON) ----------------
d83 = json.load(open(V83)); dmm = json.load(open(V83MM))
b83 = {b["name"]: b for b in d83["bones"]}; bmm = {b["name"]: b for b in dmm["bones"]}
left = [n for n in b83 if n.endswith("_left") and abs(b83[n]["head"][0]) > 1e-6]
right = [n for n in b83 if n.endswith("_right") and abs(b83[n]["head"][0]) > 1e-6]
mm_ratio = [bmm[n][k][i] / b83[n][k][i] for n in b83 for k in ("head", "tail") for i in range(3) if abs(b83[n][k][i]) > 1e-4]
out["C1b_v83"] = dict(
    header={k: d83[k] for k in ("units", "up_axis", "facing", "side_convention", "height_m", "sole_to_skull_m")},
    n_bones=len(b83), left_x_pos=f"{sum(b83[n]['head'][0] > 0 for n in left)}/{len(left)}",
    right_x_neg=f"{sum(b83[n]['head'][0] < 0 for n in right)}/{len(right)}",
    foot_tail_minus_y=bool(b83["foot_left"]["tail"][1] < b83["foot_left"]["head"][1]),
    head_tail_z=b83["head"]["tail"][2], min_bone_z=min(min(b["head"][2], b["tail"][2]) for b in d83["bones"]),
    mm_over_m_ratio_min=min(mm_ratio), mm_over_m_ratio_max=max(mm_ratio))

# ---------------- C1d / C2 joints ----------------
def stats(v):
    v = np.array(v)
    return dict(n=int(len(v)), median_cm=round(float(np.median(v)) * 100, 2), p95_cm=round(float(np.percentile(v, 95)) * 100, 2), max_cm=round(float(v.max()) * 100, 2))

C2 = {}
GROUND = cf["frames"]["joint_ground_z_in_mesh_frame"]
for rig in ("default", "game_engine", "rigify_human", "rigify_human_toes"):
    R = rows(f"joints_{rig}.csv")
    errs, col_mismatch, vz = [], 0, []
    for r in R:
        for e in ("head", "tail"):
            d = np.array([float(r[f"{e}_default_{a}"]) for a in "xyz"]); c = np.array([float(r[f"{e}_recomp_{a}"]) for a in "xyz"])
            err = float(np.linalg.norm(d - c)); errs.append(err)
            if abs(err - float(r[f"{e}_err_m"])) > 2e-6: col_mismatch += 1
            if r[f"{e}_strategy"] == "VERTEX": vz.append(d[2] - c[2])
    worst = sorted(((max(float(r["head_err_m"]), float(r["tail_err_m"])), r["bone"]) for r in R), reverse=True)[:3]
    C2[rig] = dict(n_bones=len(R), **stats(errs), err_column_mismatches=col_mismatch, worst3=[(b, round(e * 100, 2)) for e, b in worst],
                   vertex_ends=len(vz), vertex_dz_median_mm=round(float(np.median(vz)) * 1000, 2) if vz else None)
    if rig == "game_engine":
        rr = [r for r in R if r["bone"] == "Root"][0]
        C2[rig]["Root"] = {k: rr[k] for k in ("head_strategy", "head_source", "head_default_z", "head_recomp_z", "head_err_m")}
        C2[rig]["without_Root"] = stats([float(r[f"{e}_err_m"]) for r in R if r["bone"] != "Root" for e in ("head", "tail")])
    if rig.startswith("rigify"):
        C2[rig]["frame_offset_note"] = "recomp columns already include +%.6f m (= -joint-ground z); vertex_dz_median is the residual" % -GROUND
Rd = rows("joints_default.csv")
by = {}
for r in Rd:
    for e in ("head", "tail"):
        by.setdefault(f"{e}:{r[f'{e}_strategy']}", []).append(float(r[f"{e}_err_m"]))
C2["default_by_strategy"] = {k: stats(v) for k, v in sorted(by.items())}
hand = [float(r[f"{e}_err_m"]) for r in Rd for e in ("head", "tail") if any(s in r["bone"] for s in ("finger", "metacarpal", "wrist"))]
other = [float(r[f"{e}_err_m"]) for r in Rd for e in ("head", "tail") if not any(s in r["bone"] for s in ("finger", "metacarpal", "wrist"))]
C2["default_hand_vs_other"] = dict(hand_name_filter="finger|metacarpal|wrist (reviewer's filter; study's region rule not in data)",
                                   hand=stats(hand), other=stats(other))
out["C2_joints"] = C2
fr = cf["frames"]["vertex_joint_offsets"]
out["C1d_rigify_offset"] = dict(joint_ground_z=GROUND, rigify_vertex_median_dz_total=fr["rigify_human"]["median_default_minus_mesh"][2],
                                default_vertex_median_dz=fr["default"]["median_default_minus_mesh"][2],
                                residual_rigify_minus_ground_mm=round((fr["rigify_human"]["median_default_minus_mesh"][2] + GROUND) * 1000, 2))

# ---------------- C3 weight blend zones ----------------
prof = rows("weight_falloff_profiles.csv"); summ = jl("weight_falloff_summary.json")
def cross(mid, mean, level):
    for k in range(1, len(mean)):
        if mean[k - 1] < level <= mean[k]:
            return mid[k - 1] + (level - mean[k - 1]) / (mean[k] - mean[k - 1]) * (mid[k] - mid[k - 1])
    return None
C3 = {}
for rig in ("default", "game_engine", "rigify_human_toes"):
    for joint in ("shoulder", "elbow", "hip", "knee"):
        for side in ("l", "r"):
            P = [p for p in prof if p["rig"] == rig and p["joint"] == joint and p["side"] == side]
            mid = [float(p["t_bin_centre_m"]) for p in P]; mean = [float(p["w_distal_mean"]) for p in P]
            t10, t50, t90 = (cross(mid, mean, l) for l in (0.1, 0.5, 0.9))
            s = summ[rig][f"{joint}_{side}"]
            mono = all(mean[i] <= mean[i + 1] + 1e-9 for i in range(len(mean) - 1))
            C3[f"{rig}:{joint}_{side}"] = dict(
                t10_cm=round(t10 * 100, 2), t50_cm=round(t50 * 100, 2), t90_cm=round(t90 * 100, 2), width_cm=round((t90 - t10) * 100, 2),
                summary_width_cm=round(s["blend_width_10_90_m"] * 100, 2), radius_m=s["radius_m"], limb_axis_len_m=round(s["limb_axis_len_m"], 4),
                width_over_limb=round((t90 - t10) / s["limb_axis_len_m"], 3), n_bins=len(P), n_vertices=sum(int(p["n_vertices"]) for p in P),
                monotonic_bin_means=mono)
out["C3_blend"] = C3

# ---------------- C4 foot ----------------
fb = cf["foot_bones"]
def pitch(a, b):
    return -math.degrees(math.atan2(b[2] - a[2], math.hypot(b[0] - a[0], b[1] - a[1])))
C4 = {k: dict(pitch_recomputed=round(pitch(v["head"], v["tail"]), 3), reported=round(v["pitch_deg_below_horizontal"], 3)) for k, v in fb.items()}
sp = cf["sole_plane"]
ank = fb["default_rig_foot.L_recomputed"]["head"]; toe = fb["game_engine_ball_l_recomputed"]["tail"]
# axis exactly as scripts/03_coordinates_foot.py L126: default foot.L recomputed head -> tail (horizontal)
mtail = fb["default_rig_foot.L_recomputed"]["tail"]
ax = np.array(mtail[:2]) - np.array(ank[:2]); ax /= np.linalg.norm(ax)
slope_along = sp["plane_dz_dx"] * ax[0] + sp["plane_dz_dy"] * ax[1]
# sensitivity: axis ankle -> game_engine ball_l tail (toe)
ax2 = np.array(toe[:2]) - np.array(ank[:2]); ax2 /= np.linalg.norm(ax2)
slope_toe_axis = sp["plane_dz_dx"] * ax2[0] + sp["plane_dz_dy"] * ax2[1]
ank_d = fb["default_rig_foot.L_default"]["head"]
plane_under_default_ankle = sp["plane_z_under_ankle"] + sp["plane_dz_dx"] * (ank_d[0] - ank[0]) + sp["plane_dz_dy"] * (ank_d[1] - ank[1])
C4["sole"] = dict(
    axis_used_here="default foot.L recomputed head->tail (as scripts/03 L126)",
    slope_deg_recomputed=round(math.degrees(math.atan(slope_along)), 3), slope_deg_reported=round(sp["slope_deg_heel_to_toe_along_foot_axis"], 3),
    slope_deg_sensitivity_axis_ankle_to_toe=round(math.degrees(math.atan(slope_toe_axis)), 3),
    toe_higher=bool(slope_along > 0),
    lateral_tilt_deg_dzdx=round(math.degrees(math.atan(sp["plane_dz_dx"])), 3),
    ankle_h_recomputed_cm=round((ank[2] - sp["plane_z_under_ankle"]) * 100, 3), reported_recomputed_cm=round(sp["ankle_height_above_sole_m_recomputed_joint"] * 100, 3),
    ankle_h_default_using_plane_under_recomputed_ankle_cm=round((ank_d[2] - sp["plane_z_under_ankle"]) * 100, 3),
    ankle_h_default_using_plane_under_default_ankle_cm=round((ank_d[2] - plane_under_default_ankle) * 100, 3),
    reported_default_cm_sole_plane=round(sp["ankle_height_above_sole_m_default_position"] * 100, 3),
    reported_default_cm_tail_table=round(cf["foot_tail_height_vs_sole"]["default_foot.L_default"]["ankle_height_above_sole_m"] * 100, 3))
# v8.3 foot pitch from committed JSON
C4["v83_foot_left_pitch"] = round(pitch(b83["foot_left"]["head"], b83["foot_left"]["tail"]), 3)
C4["v83_ankle_left_pitch"] = round(pitch(b83["ankle_left"]["head"], b83["ankle_left"]["tail"]), 3) if "ankle_left" in b83 else None
out["C4_foot"] = C4

# ---------------- C5 proportions ----------------
ratios = {r["ratio"]: r for r in rows("compare_ratios.csv")}
seg = {r["segment"]: r for r in rows("compare_segments.csv")}
# v8.3 recomputation with the study's landmark pairing (scripts/06_compare_star_rai.py, sr_landmarks)
L = {"hip": b83["thigh_left"]["head"], "knee": b83["knee_left"]["head"], "ankle": b83["ankle_left"]["head"], "toe_tip": b83["foot_left"]["tail"],
     "shoulder": b83["upper_arm_left"]["head"], "elbow": b83["elbow_left"]["head"], "wrist": b83["wrist_left"]["head"], "hand_tip": b83["hand_left"]["tail"],
     "skull_base": b83["head"]["head"], "skull_top": b83["head"]["tail"], "neck_base": b83["neck"]["head"]}
L = {k: np.array(v, float) for k, v in L.items()}
S = L["skull_top"][2] - 0.0
dist = lambda a, b: float(np.linalg.norm(L[a] - L[b]))
v83 = dict(S=S, head_over_S=(L["skull_top"][2] - L["skull_base"][2]) / S, head_len3d_over_S=dist("skull_base", "skull_top") / S,
           ankle_over_S=L["ankle"][2] / S, thigh_over_shin=dist("hip", "knee") / dist("knee", "ankle"),
           upper_over_fore=dist("shoulder", "elbow") / dist("elbow", "wrist"), leg_over_S=dist("hip", "ankle") / S,
           hip_spacing_over_leg=2 * abs(L["hip"][0]) / dist("hip", "ankle"), foot_over_S=dist("ankle", "toe_tip") / S,
           arm_over_leg=dist("shoulder", "wrist") / dist("hip", "ankle"))
v83 = {k: round(v, 4) for k, v in v83.items()}
v83["study_csv"] = {"head_length/S": ratios["head_length/S"]["starrai_v8_3"], "ankle_height_over_sole/S": ratios["ankle_height_over_sole/S"]["starrai_v8_3"],
                    "thigh/shin": ratios["thigh/shin"]["starrai_v8_3"], "upper_arm/forearm": ratios["upper_arm/forearm"]["starrai_v8_3"],
                    "leg(hip-ankle)/S": ratios["leg(hip-ankle)/S"]["starrai_v8_3"], "hip_spacing(2|x|)/leg": ratios["hip_spacing(2|x|)/leg"]["starrai_v8_3"],
                    "foot/S": seg["foot(ankle-toe)"]["starrai_v8_3:over_S"], "arm/leg": ratios["arm(shoulder-wrist)/leg(hip-ankle)"]["starrai_v8_3"]}
mp_cols = ("mpfb2_mesh_bodytop", "mpfb2_mesh_cubes", "mpfb2_default_position")
def rng(ratio, sr):
    vals = [float(ratios[ratio][sr]) / float(ratios[ratio][c]) for c in mp_cols]
    return [round(min(vals), 3), round(max(vals), 3)]
out["C5_proportions"] = dict(
    v83_recomputed=v83,
    head_ratio_starrai_over_mpfb2={"v8_3": rng("head_length/S", "starrai_v8_3"), "v10": rng("head_length/S", "starrai_v10")},
    ankle_ratio_starrai_over_mpfb2={"v8_3": rng("ankle_height_over_sole/S", "starrai_v8_3"), "v10": rng("ankle_height_over_sole/S", "starrai_v10")},
    report_claims={"head": "+40-60 %", "ankle": "2.3-2.5x"})
json.dump(out, sys.stdout, indent=1, default=float)
print()
