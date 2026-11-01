"""Task 3: normalised proportion comparison MPFB2 vs Star Rai v8.3 / v10 (landmarks only; READ-ONLY on all inputs).
Star Rai files are located by SHA-256 (locked v10 eab1839c..., v8.3 5d373125..., v8.3 mm 235767bf...) and only read.
Axis mapping to MPFB2 convention (Z up, front -Y, character-left = +X):
  v8.3 (m)  : Z up, faces -Y, _left=+X  -> identity (declared in file header; verified from data below)
  v10  (mm) : Z up, faces +Y, _left=-X  -> (x,y,z) -> (-x,-y,z) (180 deg about Z, det=+1), then mm->m (verified from data below)
Vertical origin: sole plane. MPFB2: lowest body vertex. v8.3: z=0 (INFERRED: sole_to_skull_m == head.tail.z == 0.95). v10: z=-88 mm (README 'soles -88'; foot tail z).
Normaliser: stature S = sole -> skull top.  MPFB2 skull top = body top vertex (also reported with joint-head-2); Star Rai skull top = head bone tail."""
import sys, os, collections
sys.path.insert(0, os.path.dirname(__file__))
from common import *
SR = "/workspace/artifacts/spine_requests"
F83 = f"{SR}/star_rai_tripo_blender_bones.json"; F83MM = f"{SR}/star_rai_tripo_blender_bones_mm.json"; F10 = f"{SR}/star_rai_locked_final_v10_blender_bones.json"
EXPECT = {F83: "5d373125", F83MM: "235767bf", F10: "eab1839c"}
hashes = {}
for p, pre in EXPECT.items():
    h = sha256(p); hashes[os.path.basename(p)] = h
    assert h.startswith(pre), (p, h)
verts, faces, fgroup, groups, order = parse_obj()
P = obj_to_rig(verts); B = P[:13380]
cube = lambda n: P[groups[n]].mean(0)
dflt = bones_of(load_json(RIGS["default"])); ge = bones_of(load_json(RIGS["game_engine"]))

# ---------- MPFB2 landmarks (mesh-derived) and default_position-derived variants ----------
LM = ["hip", "knee", "ankle", "toe_tip", "shoulder", "elbow", "wrist", "hand_tip", "neck_base", "skull_base", "skull_top"]
cubes = {"hip": "joint-l-upper-leg", "knee": "joint-l-knee", "ankle": "joint-l-ankle", "toe_tip": "joint-l-toe-2-4", "shoulder": "joint-l-shoulder",
         "elbow": "joint-l-elbow", "wrist": "joint-l-hand", "hand_tip": "joint-l-finger-3-4", "neck_base": "joint-neck", "skull_base": "joint-head", "skull_top": "joint-head-2"}
mp_mesh = {k: cube(c) for k, c in cubes.items()}
# default_position variant: same landmark from the default / game_engine rig JSONs
dp = {"hip": ge["thigh_l"]["head"], "knee": ge["calf_l"]["head"], "ankle": ge["foot_l"]["head"], "toe_tip": ge["ball_l"]["tail"], "shoulder": ge["upperarm_l"]["head"],
      "elbow": ge["lowerarm_l"]["head"], "wrist": ge["hand_l"]["head"], "hand_tip": ge["middle_03_l"]["tail"], "neck_base": ge["neck_01"]["head"],
      "skull_base": ge["head"]["head"], "skull_top": ge["head"]["tail"]}
mp_def = {k: np.array(v["default_position"]) for k, v in dp.items()}
sole_mp = float(B[:, 2].min()); top_mp_body = float(B[:, 2].max())
# note: joint-head-2 vs body top
skull_top_alt = mp_mesh["skull_top"][2]
def norm_mp(L, skull_top_z):
    S = skull_top_z - sole_mp
    return {k: v for k, v in L.items()}, S
# ---------- Star Rai ----------
def sr_landmarks(path, kind):
    d = load_json(path); b = {x["name"]: x for x in d["bones"]}
    if kind == "v83":
        T = lambda v: np.array(v, float) * 1.0                       # metres, identity axes
        scale_note = "metres"; sole = 0.0
    else:
        T = lambda v: np.array([-v[0], -v[1], v[2]], float) / 1000.0  # mm, 180deg about Z
        scale_note = "mm->m"; sole = -88.0 / 1000.0
    lm = {"hip": T(b["thigh_left"]["head"]), "knee": T(b["knee_left"]["head"]), "ankle": T(b["ankle_left"]["head"]), "toe_tip": T(b["foot_left"]["tail"]),
          "shoulder": T(b["upper_arm_left"]["head"]), "elbow": T(b["elbow_left"]["head"]), "wrist": T(b["wrist_left"]["head"]), "hand_tip": T(b["hand_left"]["tail"]),
          "skull_base": T(b["head"]["head"]), "skull_top": T(b["head"]["tail"])}
    if kind == "v83": lm["neck_base"] = T(b["neck"]["head"])
    return lm, sole, d, b, T
sr83, sole83, d83, b83, T83 = sr_landmarks(F83, "v83")
sr10, sole10, d10, b10, T10 = sr_landmarks(F10, "v10")
# ---------- axis-mapping verification from data (MEASURED) ----------
ev = {}
ev["v83"] = dict(header=dict(units=d83["units"], up=d83["up_axis"], facing=d83["facing"], side=d83["side_convention"], height_m=d83["height_m"], sole_to_skull_m=d83["sole_to_skull_m"]),
                 left_bones_x_positive=bool(all(b83[n]["head"][0] > 0 for n in b83 if n.endswith("_left") and abs(b83[n]["head"][0]) > 1e-6)),
                 right_bones_x_negative=bool(all(b83[n]["head"][0] < 0 for n in b83 if n.endswith("_right") and abs(b83[n]["head"][0]) > 1e-6)),
                 foot_tail_forward_is_minus_y=bool(b83["foot_left"]["tail"][1] < b83["foot_left"]["head"][1]),
                 head_tail_z_equals_sole_to_skull=bool(abs(b83["head"]["tail"][2] - d83["sole_to_skull_m"]) < 1e-9),
                 min_bone_z=float(min(min(x["head"][2], x["tail"][2]) for x in d83["bones"])),
                 mm_file_is_1000x=None)
mm = load_json(F83MM); bmm = {x["name"]: x for x in mm["bones"]}
ev["v83"]["mm_file_is_1000x_of_m_file"] = bool(all(np.allclose(np.array(bmm[n]["head"]), 1000 * np.array(b83[n]["head"]), atol=2e-3) and np.allclose(np.array(bmm[n]["tail"]), 1000 * np.array(b83[n]["tail"]), atol=2e-3) for n in b83))
ev["v83"].pop("mm_file_is_1000x")
ev["v10"] = dict(header=dict(height_mm=d10["height_mm"], ankle_to_head_mm=d10["ankle_to_head_mm"]),
                 left_bones_x_negative=bool(all(b10[n]["head"][0] < 0 for n in b10 if n.endswith("_left") and abs(b10[n]["head"][0]) > 1e-6)),
                 right_bones_x_positive=bool(all(b10[n]["head"][0] > 0 for n in b10 if n.endswith("_right") and abs(b10[n]["head"][0]) > 1e-6)),
                 foot_tail_forward_is_plus_y=bool(b10["foot_left"]["tail"][1] > b10["foot_left"]["head"][1]),
                 foot_tail_z_mm=b10["foot_left"]["tail"][2], ankle_to_head_tail_mm=float(b10["head"]["tail"][2] - b10["ankle_left"]["head"][2]),
                 ankle_to_head_matches_header=bool(abs((b10["head"]["tail"][2] - b10["ankle_left"]["head"][2]) - d10["ankle_to_head_mm"]) < 0.01),
                 sole_plane_z_mm_from_foot_tail=b10["foot_left"]["tail"][2])
ev["mapping_det"] = dict(v83=1.0, v10=float(np.linalg.det(np.diag([-1, -1, 1]))))
ev["v83_vs_v10_known_nonuniform"] = "v8.3 foot tail z is 6 mm above sole (z=0 INFERRED) whereas v10 foot tail IS the sole (-88 mm): sole references differ by construction; documented, not corrected"

# ---------- normalise ----------
def table(L, sole, skull_top_key="skull_top"):
    S = L[skull_top_key][2] - sole
    out = {}
    for k, v in L.items():
        out[k] = dict(z_over_S=(v[2] - sole) / S, x_over_S=abs(v[0]) / S, y_fwd_of_ankle_over_S=(-(v[1] - L["ankle"][1])) / S)
    return out, S
tm_mesh, S_mesh = table(mp_mesh, sole_mp)                       # skull top = joint-head-2 cube
mp_mesh_body = dict(mp_mesh); mp_mesh_body["skull_top"] = np.array([0, 0, top_mp_body]); tm_mesh_body, S_mesh_body = table(mp_mesh_body, sole_mp)
tm_def, S_def = table(mp_def, sole_mp)
t83, S83 = table(sr83, sole83); t10, S10 = table(sr10, sole10)
rows = []
for k in LM:
    r = [k]
    for tb in (tm_mesh_body, tm_mesh, tm_def, t83, t10):
        r += [round(tb[k]["z_over_S"], 4) if k in tb else "", round(tb[k]["x_over_S"], 4) if k in tb else "", round(tb[k]["y_fwd_of_ankle_over_S"], 4) if k in tb else ""]
    rows.append(r)
hdr = ["landmark"]
for n in ("mpfb2_mesh_bodytop", "mpfb2_mesh_cubes", "mpfb2_default_position", "starrai_v8_3", "starrai_v10"):
    hdr += [f"{n}:z/S", f"{n}:|x|/S", f"{n}:fwd_of_ankle/S"]
write_csv("compare_landmarks_normalised.csv", hdr, rows)

# segment lengths (3D) and ratios
def seg(L, a, b): return float(np.linalg.norm(L[a] - L[b]))
SEG = {"thigh(hip-knee)": ("hip", "knee"), "shin(knee-ankle)": ("knee", "ankle"), "upper_arm(sh-elbow)": ("shoulder", "elbow"), "forearm(elbow-wrist)": ("elbow", "wrist"),
       "hand(wrist-tip)": ("wrist", "hand_tip"), "foot(ankle-toe)": ("ankle", "toe_tip"), "head(skull_base-top)": ("skull_base", "skull_top"),
       "neck_base_to_skull_base": ("neck_base", "skull_base")}
ds = {"mpfb2_mesh_bodytop": (mp_mesh_body, S_mesh_body), "mpfb2_mesh_cubes": (mp_mesh, S_mesh), "mpfb2_default_position": (mp_def, S_def), "starrai_v8_3": (sr83, S83), "starrai_v10": (sr10, S10)}
srows = []; seg_out = {}
for sn, (a, b) in SEG.items():
    r = [sn]
    for dn, (L, S) in ds.items():
        if a in L and b in L:
            l = seg(L, a, b); r += [round(l, 5), round(l / S, 4)]
            seg_out.setdefault(dn, {})[sn] = dict(length_m=l, over_S=l / S)
        else: r += ["", ""]
    srows.append(r)
# derived ratios
def ratios(L):
    o = {}
    leg = seg(L, "hip", "ankle")
    o["thigh/shin"] = seg(L, "hip", "knee") / seg(L, "knee", "ankle")
    o["upper_arm/forearm"] = seg(L, "shoulder", "elbow") / seg(L, "elbow", "wrist")
    o["leg(hip-ankle)/S"] = leg / (L["skull_top"][2] - (sole_mp if L is mp_mesh or L is mp_mesh_body or L is mp_def else (sole83 if L is sr83 else sole10)))
    o["arm(shoulder-wrist)/leg(hip-ankle)"] = seg(L, "shoulder", "wrist") / leg
    o["ankle_height_over_sole/S"] = None
    return o
rat = {}
for dn, (L, S) in ds.items():
    sole = sole_mp if dn.startswith("mpfb2") else (sole83 if dn == "starrai_v8_3" else sole10)
    r = ratios(L); r["ankle_height_over_sole/S"] = float((L["ankle"][2] - sole) / S)
    r["half_shoulder_width(|x|)/S"] = float(abs(L["shoulder"][0]) / S); r["half_hip_spacing(|x|)/S"] = float(abs(L["hip"][0]) / S)
    r["stature_over_head_length"] = float(S / seg(L, "skull_base", "skull_top"))
    r["head_length/S"] = float(seg(L, "skull_base", "skull_top") / S)
    r["stature_S_m"] = float(S)
    leg = seg(L, "hip", "ankle")
    r["thigh/leg(hip-ankle)"] = seg(L, "hip", "knee") / leg
    r["upper_arm_len/leg"] = seg(L, "shoulder", "elbow") / leg
    r["forearm_len/leg"] = seg(L, "elbow", "wrist") / leg
    r["shoulder_width(2|x|)/leg"] = 2 * abs(L["shoulder"][0]) / leg
    r["hip_spacing(2|x|)/leg"] = 2 * abs(L["hip"][0]) / leg
    r["leg_splay_from_vertical_deg"] = math.degrees(math.atan2(abs(L["ankle"][0] - L["hip"][0]), L["hip"][2] - L["ankle"][2]))
    v = L["wrist"] - L["shoulder"]
    r["arm_angle_from_down_deg(shoulder->wrist)"] = math.degrees(math.atan2(math.hypot(v[0], v[1]), -v[2]))
    rat[dn] = r
keys = list(rat["starrai_v10"].keys())
POSE = {"half_shoulder_width(|x|)/S": "no (arm/clavicle pose-dependent; shoulder joint x depends on A/T pose)", "arm(shoulder-wrist)/leg(hip-ankle)": "yes (3D lengths)",
        "leg_splay_from_vertical_deg": "pose measure", "arm_angle_from_down_deg(shoulder->wrist)": "pose measure"}
write_csv("compare_ratios.csv", ["ratio"] + list(ds) + ["pose_independent"], [[k] + [round(rat[d][k], 4) for d in ds] + [POSE.get(k, "yes")] for k in keys])
write_csv("compare_segments.csv", ["segment"] + [f"{d}:{x}" for d in ds for x in ("len_m", "over_S")], srows)

# foot pitch of Star Rai (ankle -> foot tail), pitch below horizontal in the character frame
def pitch(a, b): return math.degrees(math.atan2(a[2] - b[2], math.hypot(b[0] - a[0], b[1] - a[1])))
foot = dict(mpfb2_default_foot_L_pitch_deg=pitch(*(np.array(dflt["foot.L"][e]["default_position"]) for e in ("head", "tail"))),
            mpfb2_game_engine_foot_l_pitch_deg=pitch(*(np.array(ge["foot_l"][e]["default_position"]) for e in ("head", "tail"))),
            starrai_v8_3_foot_left_pitch_deg=pitch(sr83["ankle"], sr83["toe_tip"]), starrai_v10_foot_left_pitch_deg=pitch(sr10["ankle"], sr10["toe_tip"]),
            starrai_v8_3_foot_length_horizontal_over_S=float(math.hypot(*(sr83["toe_tip"] - sr83["ankle"])[:2]) / S83),
            starrai_v10_foot_length_horizontal_over_S=float(math.hypot(*(sr10["toe_tip"] - sr10["ankle"])[:2]) / S10),
            mpfb2_ankle_to_toe_horizontal_over_S_bodytop=float(math.hypot(*(mp_mesh["toe_tip"] - mp_mesh["ankle"])[:2]) / S_mesh_body),
            starrai_v8_3_ankle_above_sole_over_S=float((sr83["ankle"][2] - sole83) / S83), starrai_v10_ankle_above_sole_over_S=float((sr10["ankle"][2] - sole10) / S10),
            mpfb2_ankle_above_sole_over_S_bodytop=float((mp_mesh["ankle"][2] - sole_mp) / S_mesh_body),
            note="Star Rai foot tail is a bone tail, MPFB2 foot.L tail is 'MEAN' of two vertices near the ball; pitch is ankle->bone tail in both. v10 sole plane assumed flat (z=-88 at tail).")
out = dict(input_hashes=hashes, axis_mapping_evidence=ev, mpfb2=dict(sole_z=sole_mp, body_top_z=top_mp_body, S_body_top_m=S_mesh_body, S_joint_head2_m=S_mesh, S_default_pos_m=S_def),
           starrai=dict(v83_S_m=S83, v83_sole_z=sole83, v10_S_m=S10, v10_sole_z_m=sole10),
           landmarks_normalised=dict(mpfb2_mesh_bodytop=tm_mesh_body, mpfb2_mesh_cubes=tm_mesh, mpfb2_default_position=tm_def, starrai_v8_3=t83, starrai_v10=t10),
           segments=seg_out, ratios=rat, foot=foot,
           v10_to_v83_uniform_fit=None)
# v10 -> v8.3 uniform similarity (scale + z shift) residual, to document the known 'no uniform transform' statement
common = ["hip", "knee", "ankle", "shoulder", "elbow", "wrist", "hand_tip", "skull_base", "skull_top"]
A = np.array([[sr10[k][2]] for k in common]); Bz = np.array([sr83[k][2] for k in common])
Aa = np.c_[A, np.ones(len(A))]; X, *_ = np.linalg.lstsq(Aa, Bz, rcond=None); res = Aa @ X - Bz
out["v10_to_v83_uniform_fit"] = dict(landmarks=common, z_scale=float(X[0]), z_shift_m=float(X[1]), max_resid_m=float(np.abs(res).max()), rms_resid_m=float(np.sqrt((res ** 2).mean())),
                                     per_landmark_resid_m={k: float(r) for k, r in zip(common, res)})
write_json("compare_star_rai.json", out)
print(json.dumps(out["axis_mapping_evidence"], indent=1)); print(json.dumps(out["mpfb2"], indent=1)); print(json.dumps(out["starrai"], indent=1))
print(open(os.path.join(OUT, "compare_ratios.csv")).read()); print(open(os.path.join(OUT, "compare_landmarks_normalised.csv")).read()); print(json.dumps(foot, indent=1)); print(json.dumps(out["v10_to_v83_uniform_fit"], indent=1))
