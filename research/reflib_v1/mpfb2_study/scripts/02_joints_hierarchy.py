"""Task 1: joint position + hierarchy analysis for all four MPFB2 rig JSONs.
Recomputes every head/tail from base.obj using the stored strategy and compares to default_position."""
import sys, os, collections
sys.path.insert(0, os.path.dirname(__file__))
from common import *

verts, faces, fgroup, groups, order = parse_obj()
P = obj_to_rig(verts)          # rig space, metres
GROUND_Z = float(P[groups["joint-ground"]].mean(0)[2])   # -0.8183: z of joint-ground cube in the mesh frame
# Frame offsets (MEASURED, see 03_coordinates.py): standard rigs use the mesh frame (offset 0);
# Rigify rigs use a ground-at-z=0 frame, i.e. mesh frame + (0,0,-GROUND_Z).
FRAME_OFFSET = {"default": np.zeros(3), "game_engine": np.zeros(3),
                "rigify_human": np.array([0, 0, -GROUND_Z]), "rigify_human_toes": np.array([0, 0, -GROUND_Z])}
import re as _re
HAND_RE = _re.compile(r"finger|^f_|palm|thumb|index|middle|ring|pinky|metacarpal|wrist|hand", _re.I)

def recompute(end):
    s = end["strategy"]
    if s == "CUBE":
        r = P[groups[end["cube_name"]]].mean(0)
    elif s == "VERTEX":
        r = P[end["vertex_index"]]
    elif s == "MEAN":
        r = P[end["vertex_indices"]].mean(0)
    elif s == "XYZ":   # x from 1st vertex, y from 2nd, z from 3rd (hypothesis; validated below)
        i, j, k = end["vertex_indices"]
        r = np.array([P[i, 0], P[j, 1], P[k, 2]])
    else:
        raise ValueError(s)
    if "offset" in end:
        r = r + np.array(end["offset"])
    return r

summary = {}
stat_rows = []
for rig, path in RIGS.items():
    bs = bones_of(load_json(path))
    names = list(bs)
    children = collections.defaultdict(list)
    for n, b in bs.items():
        children[b["parent"]].append(n)
    # hierarchy
    roots = [n for n, b in bs.items() if b["parent"] == "" or b["parent"] not in bs]
    missing_parent = [n for n, b in bs.items() if b["parent"] != "" and b["parent"] not in bs]
    depth = {}
    cyc = False
    def d(n, seen=()):
        global cyc
        if n in depth: return depth[n]
        if n in seen: cyc = True; return 0
        p = bs[n]["parent"]
        depth[n] = 0 if (p == "" or p not in bs) else d(p, seen + (n,)) + 1
        return depth[n]
    for n in names: d(n)
    rows = []
    errs = collections.defaultdict(list); regerr = collections.defaultdict(list); worst = []
    conn_bad = 0; conn_n = 0
    for n, b in bs.items():
        h, t = b["head"], b["tail"]
        rh, rt = recompute(h) + FRAME_OFFSET[rig], recompute(t) + FRAME_OFFSET[rig]
        dh, dt = np.array(h["default_position"]), np.array(t["default_position"])
        eh, et = np.linalg.norm(rh - dh), np.linalg.norm(rt - dt)
        errs[("head", h["strategy"])].append(eh); errs[("tail", t["strategy"])].append(et)
        reg = "hand_fingers" if HAND_RE.search(n) else "other"
        regerr[reg].extend([eh, et]); worst.append((max(eh, et), n))
        if b["use_connect"] and b["parent"] in bs:
            conn_n += 1
            if np.linalg.norm(dh - np.array(bs[b["parent"]]["tail"]["default_position"])) > 1e-4: conn_bad += 1
        rows.append([n, b["parent"], depth[n], len(children[n]), b["use_connect"],
                     h["strategy"], h.get("cube_name", h.get("vertex_index", h.get("vertex_indices", ""))),
                     t["strategy"], t.get("cube_name", t.get("vertex_index", t.get("vertex_indices", ""))),
                     *[round(x, 6) for x in dh], *[round(x, 6) for x in dt],
                     *[round(x, 6) for x in rh], *[round(x, 6) for x in rt],
                     round(eh, 6), round(et, 6),
                     round(float(np.linalg.norm(dt - dh)), 6), round(float(np.linalg.norm(rt - rh)), 6),
                     b.get("roll"), b.get("roll_strategy", "")])
    write_csv(f"joints_{rig}.csv",
              ["bone", "parent", "depth", "n_children", "use_connect", "head_strategy", "head_source", "tail_strategy", "tail_source",
               "head_default_x", "head_default_y", "head_default_z", "tail_default_x", "tail_default_y", "tail_default_z",
               "head_recomp_x", "head_recomp_y", "head_recomp_z", "tail_recomp_x", "tail_recomp_y", "tail_recomp_z",
               "head_err_m", "tail_err_m", "len_default_m", "len_recomp_m", "roll_rad", "roll_strategy"], rows)
    st = {}
    for (end, strat), v in sorted(errs.items()):
        v = np.array(v)
        st[f"{end}:{strat}"] = dict(n=len(v), max_m=float(v.max()), median_m=float(np.median(v)), p95_m=float(np.percentile(v, 95)),
                                  n_within_1mm=int((v < 1e-3).sum()), n_within_1cm=int((v < 1e-2).sum()))
    allerr = np.array([x for v in errs.values() for x in v])
    reg_st = {k: dict(n=len(v), median_m=float(np.median(v)), p95_m=float(np.percentile(v, 95)), max_m=float(np.max(v))) for k, v in regerr.items()}
    worst.sort(reverse=True)
    summary[rig] = dict(n_bones=len(bs), n_roots=len(roots), roots=roots, missing_parent=missing_parent,
                        max_depth=max(depth.values()), cycle=cyc, n_leaf=sum(1 for n in names if not children[n]),
                        n_use_connect=sum(1 for b in bs.values() if b["use_connect"]),
                        connect_checked=conn_n, connect_head_ne_parent_tail=conn_bad,
                        strategy_counts={f"{e}:{s}": c for (e, s), c in collections.Counter(
                            (e, bs[n][e]["strategy"]) for n in names for e in ("head", "tail")).items()},
                        n_with_offset=sum(1 for b in bs.values() for e in ("head", "tail") if "offset" in b[e]),
                        frame_offset_applied_m=FRAME_OFFSET[rig].tolist(),
                        recompute_error_by_strategy=st, recompute_error_by_region=reg_st,
                        worst_bones=[(n, round(e, 4)) for e, n in worst[:10]],
                        recompute_error_all=dict(n=len(allerr), median_m=float(np.median(allerr)), p95_m=float(np.percentile(allerr, 95)), max_m=float(allerr.max())),
                        bones_with_parent_empty=len(roots))
# CUBE centre definition: mean vs bbox centre
cube = {}
for k, ix in groups.items():
    if k.startswith("joint-"):
        vs = P[ix]
        cube[k] = dict(n_verts=len(ix), mean=vs.mean(0).tolist(), bbox_centre=((vs.min(0) + vs.max(0)) / 2).tolist(),
                       bbox_size_m=(vs.max(0) - vs.min(0)).tolist())
dm = [np.linalg.norm(np.array(c["mean"]) - np.array(c["bbox_centre"])) for c in cube.values()]
summary["_cube_groups"] = dict(n_groups=len(cube), verts_per_group_set=sorted(set(c["n_verts"] for c in cube.values())),
                               mean_vs_bbox_centre_max_dist_m=float(max(dm)))
write_json("joint_cube_groups.json", cube)
write_json("joints_hierarchy_summary.json", summary)
print(json.dumps({k: (v if k.startswith("_") else {kk: vv for kk, vv in v.items() if kk in ("n_bones","max_depth","roots","recompute_error_all","connect_head_ne_parent_tail","connect_checked","strategy_counts")}) for k, v in summary.items()}, indent=1))
