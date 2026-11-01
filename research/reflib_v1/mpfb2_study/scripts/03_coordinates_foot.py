"""Task 2: coordinate-system / unit / frame verification + foot geometry (re-measured from body vertices only)."""
import sys, os, collections
sys.path.insert(0, os.path.dirname(__file__))
from common import *

verts, faces, fgroup, groups, order = parse_obj()
P = obj_to_rig(verts)
NB = 13380
res = {}
# --- body vertices -------------------------------------------------------------
bset = set(groups["body"].tolist())
joint_idx = np.unique(np.concatenate([groups[k] for k in groups if k.startswith("joint-")]))
res["body_vertices"] = dict(
    n_vertices_total=len(verts), n_faces=len(faces), all_quads=all(len(f) == 4 for f in faces),
    body_group_vertex_count=len(bset), body_is_exactly_0_to_13379=(bset == set(range(NB))),
    body_faces=sum(1 for g in fgroup if g == "body"),
    helper_groups={k: [int(len(groups[k])), int(groups[k].min()), int(groups[k].max())] for k in groups if k.startswith("helper-")},
    joint_groups=len([k for k in groups if k.startswith("joint-")]), joint_vertices=int(len(joint_idx)),
    joint_vertices_index_range=[int(joint_idx.min()), int(joint_idx.max())],
    joint_vertices_shared_with_body=int(len(set(joint_idx.tolist()) & bset)),
    vertices_in_no_face=int(len(set(range(len(verts))) - set(np.concatenate(list(groups.values())).tolist()))))
B = P[:NB]
res["body_extent_rig_space_m"] = dict(min=B.min(0).tolist(), max=B.max(0).tolist(), height_z=float(np.ptp(B[:, 2])),
                                     raw_obj_min=verts[:NB].min(0).tolist(), raw_obj_max=verts[:NB].max(0).tolist())
# --- transform properties -------------------------------------------------------
M = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float)
res["conversion"] = dict(formula="rig = (x, -z, y)/10  (OBJ Y-up dm -> rig Z-up m)", matrix_det=float(np.linalg.det(M)),
                         is_proper_rotation=bool(abs(np.linalg.det(M) - 1) < 1e-12), equivalent="+90 deg rotation about X, then /10")
# --- axis conventions (MEASURED from data) ----------------------------------------
allb = {}
for rig, path in RIGS.items():
    allb[rig] = bones_of(load_json(path))
def side_check(bs, L, R):
    out = dict(n_L=0, L_head_x_pos=0, n_R=0, R_head_x_neg=0)
    for n, b in bs.items():
        x = b["head"]["default_position"][0]
        if n.endswith(L) and abs(x) > 1e-4: out["n_L"] += 1; out["L_head_x_pos"] += x > 0
        if n.endswith(R) and abs(x) > 1e-4: out["n_R"] += 1; out["R_head_x_neg"] += x < 0
    return out
res["side_convention"] = {"default": side_check(allb["default"], ".L", ".R"), "game_engine": side_check(allb["game_engine"], "_l", "_r"),
                          "rigify_human": side_check(allb["rigify_human"], ".L", ".R")}
# front direction: toe tips / breast / nose-like extrema
lf = B[(B[:, 0] > 0.05) & (B[:, 2] < -0.70)]
res["front_axis"] = dict(
    left_foot_vertices_used=int(len(lf)), foot_ymin=float(lf[:, 1].min()), foot_ymax=float(lf[:, 1].max()),
    toe_end_is_neg_y_vs_ankle=bool(lf[:, 1].min() < allb["default"]["foot.L"]["head"]["default_position"][1] - 0.1),
    eye_y_lt_spine_y=bool(allb["default"]["eye.L"]["head"]["default_position"][1] < allb["default"]["spine01"]["head"]["default_position"][1]),
    breast_y_lt_spine_y=bool(allb["default"]["breast.L"]["tail"]["default_position"][1] < allb["default"]["spine01"]["head"]["default_position"][1]),
    breast_L_tail_y_default=allb["default"]["breast.L"]["tail"]["default_position"][1],
    eye_L_y=allb["default"]["eye.L"]["head"]["default_position"][1], head_head_y=allb["default"]["head"]["head"]["default_position"][1],
    spine01_y_default=allb["default"]["spine01"]["head"]["default_position"][1],
    jaw_tail_y=allb["default"]["jaw"]["tail"]["default_position"][1])
# --- frames of each rig (offset between default_position and mesh-recomputed positions) -----------------
gz = float(P[groups["joint-ground"]].mean(0)[2])
frames = {}
for rig, bs in allb.items():
    dz = []
    for n, b in bs.items():
        for e in ("head", "tail"):
            end = b[e]
            if end["strategy"] == "VERTEX":      # exact-vertex joints only: no helper-geometry bias
                dz.append(np.array(end["default_position"]) - P[end["vertex_index"]] - np.array(end.get("offset", [0, 0, 0])))
    if not dz:
        frames[rig] = dict(n_vertex_joints=0, note='no VERTEX-strategy joints in this rig; frame inferred only via CUBE/MEAN (see joints_hierarchy_summary.json)'); continue
    dz = np.array(dz)
    frames[rig] = dict(n_vertex_joints=len(dz), median_default_minus_mesh=np.median(dz, 0).tolist(),
                       p5=np.percentile(dz, 5, 0).tolist(), p95=np.percentile(dz, 95, 0).tolist())
res["frames"] = dict(vertex_joint_offsets=frames, joint_ground_z_in_mesh_frame=gz,
                     conclusion="standard rigs (default, game_engine) share the mesh frame; Rigify rigs are shifted +%.4f m in Z (ground at z=0)" % (-gz))
# game_engine Root anomaly
r = allb["game_engine"]["Root"]["head"]
res["game_engine_Root"] = dict(cube=r["cube_name"], default_position=r["default_position"],
                               recomputed_from_cube=P[groups[r["cube_name"]]].mean(0).tolist(),
                               note="Root default_position is (0,0,0) in the mesh frame, but its cube joint-ground sits at z=%.4f" % gz)
# --- is residual (default_position - mesh recompute) a rigid/affine transform? ------------------------
def recompute(end, off):
    s = end["strategy"]
    if s == "CUBE": r = P[groups[end["cube_name"]]].mean(0)
    elif s == "VERTEX": r = P[end["vertex_index"]]
    elif s == "MEAN": r = P[end["vertex_indices"]].mean(0)
    else:
        i, j, k = end["vertex_indices"]; r = np.array([P[i, 0], P[j, 1], P[k, 2]])
    return r + np.array(end.get("offset", [0, 0, 0])) + off
aff = {}
for rig in ("default", "rigify_human"):
    off = np.array([0, 0, -gz]) if rig.startswith("rigify") else np.zeros(3)
    for strat in ("VERTEX", "CUBE", "MEAN"):
        D = []; R = []
        for n, b in allb[rig].items():
            for e in ("head", "tail"):
                if b[e]["strategy"] == strat:
                    D.append(b[e]["default_position"]); R.append(recompute(b[e], off))
        if not D: continue
        D = np.array(D); R = np.array(R)
        A = np.hstack([R, np.ones((len(R), 1))]); X, *_ = np.linalg.lstsq(A, D, rcond=None)
        resid = np.linalg.norm(A @ X - D, axis=1); raw = np.linalg.norm(R - D, axis=1)
        aff[f"{rig}:{strat}"] = dict(n=len(D), raw_rms_m=float(np.sqrt((raw ** 2).mean())), affine3d_fit_rms_m=float(np.sqrt((resid ** 2).mean())),
                                     affine_linear_part_diag=np.diag(X[:3]).tolist())
res["residual_affine_fit"] = aff
# --- foot / sole geometry (body vertices only; left side) -----------------------------------------
d = allb["default"]
def vec(rig, bone, end, mode):
    e = allb[rig][bone][end]
    off = np.array([0, 0, -gz]) if rig.startswith("rigify") else np.zeros(3)
    return np.array(e["default_position"]) if mode == "default" else recompute(e, off)
foot = {}
for mode in ("default", "recomputed"):
    a = vec("default", "foot.L", "head", mode); b = vec("default", "foot.L", "tail", mode)
    ball = vec("default", "toe1-1.L", "head", mode) if "toe1-1.L" in allb["default"] else None
    pitch = math.degrees(math.atan2(b[2] - a[2], math.hypot(b[0] - a[0], b[1] - a[1])))
    foot[f"default_rig_foot.L_{mode}"] = dict(head=a.tolist(), tail=b.tolist(), length_m=float(np.linalg.norm(b - a)), pitch_deg_below_horizontal=-pitch,
                                              heading_deg_from_minus_y=math.degrees(math.atan2(b[0] - a[0], -(b[1] - a[1]))))
    a = vec("game_engine", "foot_l", "head", mode); b = vec("game_engine", "foot_l", "tail", mode)
    foot[f"game_engine_foot_l_{mode}"] = dict(head=a.tolist(), tail=b.tolist(), length_m=float(np.linalg.norm(b - a)),
                                              pitch_deg_below_horizontal=-math.degrees(math.atan2(b[2] - a[2], math.hypot(b[0] - a[0], b[1] - a[1]))))
    a = vec("game_engine", "ball_l", "head", mode); b = vec("game_engine", "ball_l", "tail", mode)
    foot[f"game_engine_ball_l_{mode}"] = dict(head=a.tolist(), tail=b.tolist(), length_m=float(np.linalg.norm(b - a)),
                                              pitch_deg_below_horizontal=-math.degrees(math.atan2(b[2] - a[2], math.hypot(b[0] - a[0], b[1] - a[1]))))
res["foot_bones"] = foot
# sole plane: lowest-N left-foot body vertices, least-squares plane z = a*y + b*x + c ; slope along foot axis
foot_pts = B[(B[:, 0] > 0.05) & (B[:, 2] < -0.70)]
lowest = foot_pts[np.argsort(foot_pts[:, 2])[:288]]
A = np.c_[lowest[:, 1], lowest[:, 0], np.ones(len(lowest))]
(cy, cx, c0), *_ = np.linalg.lstsq(A, lowest[:, 2], rcond=None)
fa = np.array(foot["default_rig_foot.L_recomputed"]["head"]); fb = np.array(foot["default_rig_foot.L_recomputed"]["tail"])
axis2d = np.array([fb[0] - fa[0], fb[1] - fa[1]]); axis2d /= np.linalg.norm(axis2d)
slope_along = cx * axis2d[0] + cy * axis2d[1]       # dz per metre along (heel->toe) horizontal direction
sole_z_at_ankle = c0 + cx * fa[0] + cy * fa[1]
ankle = vec("default", "foot.L", "head", "recomputed"); ankle_d = vec("default", "foot.L", "head", "default")
res["sole_plane"] = dict(n_foot_vertices=int(len(foot_pts)), n_lowest_used=288,
                         selection="body verts with x>0.05 m and z<-0.70 m (rig space); 288 lowest by z",
                         lowest_z=float(lowest[:, 2].min()), lowest_z_max_of_288=float(lowest[:, 2].max()),
                         plane_dz_dy=float(cy), plane_dz_dx=float(cx), slope_deg_heel_to_toe_along_foot_axis=float(math.degrees(math.atan(slope_along))),
                         extent_along_axis_m=float(np.ptp((lowest[:, :2] - fa[:2]) @ axis2d)),
                         plane_z_under_ankle=float(sole_z_at_ankle),
                         ankle_height_above_sole_m_recomputed_joint=float(ankle[2] - sole_z_at_ankle),
                         ankle_height_above_sole_m_default_position=float(ankle_d[2] - sole_z_at_ankle),
                         ankle_height_above_lowest_body_vertex_m_recomputed=float(ankle[2] - B[:, 2].min()),
                         body_vertex_min_z=float(B[:, 2].min()), all_vertex_min_z=float(P[:, 2].min()))
# foot-bone tail height above the sole plane and the pitch that a 'tail-on-sole' bone would need
sp = res["sole_plane"]
def sole_z_at(p): return sp["plane_z_under_ankle"] + cx * (p[0] - fa[0]) + cy * (p[1] - fa[1])
tail_h = {}
for mode in ("default", "recomputed"):
    for key, rg, bn in (("default_foot.L", "default", "foot.L"), ("game_engine_foot_l", "game_engine", "foot_l")):
        a = vec(rg, bn, "head", mode); b = vec(rg, bn, "tail", mode)
        horiz = math.hypot(b[0] - a[0], b[1] - a[1])
        ankle_h = a[2] - sole_z_at(a); tail_hh = b[2] - sole_z_at(b)
        tail_h[f"{key}_{mode}"] = dict(ankle_height_above_sole_m=float(ankle_h), tail_height_above_sole_m=float(tail_hh),
                                      tail_height_over_ankle_height=float(tail_hh / ankle_h), horizontal_ankle_to_tail_m=float(horiz),
                                      pitch_deg=float(-math.degrees(math.atan2(b[2] - a[2], horiz))),
                                      pitch_deg_if_tail_were_on_sole=float(math.degrees(math.atan2(ankle_h, horiz))))
res["foot_tail_height_vs_sole"] = tail_h
write_json("coordinates_foot.json", res)
print(json.dumps({k: res[k] for k in ("body_vertices", "conversion", "side_convention", "frames", "game_engine_Root", "residual_affine_fit", "foot_bones", "sole_plane", "foot_tail_height_vs_sole")}, indent=1))
