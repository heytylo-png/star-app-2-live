"""Task 4b: weight falloff across shoulder / hip / knee (+ elbow) for the three MPFB2 weight files.
Joint centres and limb axes come from the base.obj joint cubes (mesh frame) so weights and geometry are in the SAME frame
(this deliberately avoids the default_position/mesh offsets documented in 02/03).
w_dist(v) = sum of weights of the bones distal to the joint; t = signed distance of v's projection on the joint->next-joint axis (+ = toward limb end)."""
import sys, os, collections
sys.path.insert(0, os.path.dirname(__file__))
from common import *
NB = 13380
verts, faces, fgroup, groups, order = parse_obj()
P = obj_to_rig(verts)
cube = lambda n: P[groups[n]].mean(0)

# joint -> (centre cube, next cube, perpendicular radius m)
JOINTS = {
    "shoulder": ("joint-{s}-shoulder", "joint-{s}-elbow", 0.10),
    "elbow":    ("joint-{s}-elbow",    "joint-{s}-hand",  0.07),
    "hip":      ("joint-{s}-upper-leg", "joint-{s}-knee", 0.14),
    "knee":     ("joint-{s}-knee",     "joint-{s}-ankle", 0.09),
}
TMIN, TMAX, BIN = -0.15, 0.20, 0.01

def subtree(rig, root):
    ch = collections.defaultdict(list)
    for n, b in rig.items(): ch[b["parent"]].append(n)
    out = []
    def rec(n):
        out.append(n)
        for c in ch.get(n, []): rec(c)
    rec(root); return out

def sets_for(rigname, joint, side):
    rig = bones_of(load_json(RIGS[rigname]))
    L = side == "l"
    if rigname == "default":
        root = {"shoulder": "upperarm01", "elbow": "lowerarm01", "hip": "upperleg01", "knee": "lowerleg01"}[joint] + (".L" if L else ".R")
        return set(subtree(rig, root)), set()
    if rigname == "game_engine":
        root = {"shoulder": "upperarm", "elbow": "lowerarm", "hip": "thigh", "knee": "calf"}[joint] + ("_l" if L else "_r")
        return set(subtree(rig, root)), set()
    S = ".L" if L else ".R"
    root = {"shoulder": "upper_arm", "elbow": "forearm", "hip": "thigh", "knee": "shin"}[joint] + S
    dist = set(subtree(rig, root))
    # Rigify second-half deform bones are not in the rig JSON (extra_bones): add by name
    extra = {"shoulder": ["upper_arm", "forearm"], "elbow": ["forearm"], "hip": ["thigh", "shin"], "knee": ["shin"]}[joint]
    dist |= {f"DEF-{e}{S}.001" for e in extra}
    helpers = {n for n in rig if "helper" in n and n.endswith(S) or ("helper" in n and S + "." in n)}
    return dist, helpers

summary = {}
for rigname, wpath in WEIGHTS.items():
    ws = {b: v for b, v in load_json(wpath)["weights"].items() if not b.startswith("mhmask")}
    names = list(ws); idx = {b: k for k, b in enumerate(names)}
    # dense (NV x nB) is large; use per-bone sparse vectors on demand
    NV = len(verts)
    def vec(bs):
        a = np.zeros(NV)
        for b in bs:
            if b in ws:
                for i, x in ws[b]: a[i] += x
        return a
    total = np.zeros(NV); infl = np.zeros(NV, int)
    for b, l in ws.items():
        for i, x in l: total[i] += x; infl[i] += 1
    for joint, (cj, nj, rad) in JOINTS.items():
        for side in ("l", "r"):
            a = cube(cj.format(s=side)); b = cube(nj.format(s=side))
            u = (b - a) / np.linalg.norm(b - a); limb_len = float(np.linalg.norm(b - a))
            dist_set, helper_set = sets_for(rigname, joint, side)
            missing = sorted(x for x in dist_set if x not in ws and not x.startswith("DEF-"))
            wd = vec(dist_set); wh = vec(helper_set)
            sign = 1 if side == "l" else -1
            Pb = P[:NB]; rel = Pb - a
            t = rel @ u; perp = np.linalg.norm(rel - np.outer(t, u), axis=1)
            sel = (perp <= rad) & (t >= TMIN) & (t <= TMAX) & (np.sign(Pb[:, 0]) == sign)
            ii = np.where(sel)[0]
            edges = np.arange(TMIN, TMAX + 1e-9, BIN)
            rows = []; mid = []; mean = []; mi = []
            for lo in edges[:-1]:
                m = ii[(t[ii] >= lo) & (t[ii] < lo + BIN)]
                if len(m) == 0: continue
                v = wd[m]
                rows.append([rigname, joint, side, round(lo + BIN / 2, 4), len(m), round(float(v.mean()), 4), round(float(np.percentile(v, 10)), 4),
                             round(float(np.percentile(v, 90)), 4), round(float(wh[m].mean()), 4), round(float(infl[m].mean()), 3), int(infl[m].max())])
                mid.append(lo + BIN / 2); mean.append(float(v.mean())); mi.append(float(infl[m].mean()))
            mid = np.array(mid); mean = np.array(mean); mi = np.array(mi)
            def cross(level):
                for k in range(1, len(mean)):
                    if mean[k - 1] < level <= mean[k]:
                        return float(mid[k - 1] + (level - mean[k - 1]) / (mean[k] - mean[k - 1]) * (mid[k] - mid[k - 1]))
                return None
            t10 = cross(0.1); t50 = cross(0.5); t90 = cross(0.9)
            zone = (mean > 0.1) & (mean < 0.9)
            vz = ii[(wd[ii] > 0.1) & (wd[ii] < 0.9)]
            summary.setdefault(rigname, {})[f"{joint}_{side}"] = dict(
                n_vertices_in_cylinder=int(len(ii)), radius_m=rad, limb_axis_len_m=limb_len, centre=a.tolist(),
                distal_bones=sorted(dist_set & set(ws)), helper_bones=sorted(helper_set & set(ws)), distal_bones_missing_from_weights=missing,
                t10_m=t10, t50_m=t50, t90_m=t90,
                blend_width_10_90_m=(t90 - t10) if (t10 is not None and t90 is not None) else None,
                crossover_offset_from_joint_centre_m=t50,
                plateau_proximal_mean=float(mean[mid < -0.08].mean()) if (mid < -0.08).any() else None,
                plateau_distal_mean=float(mean[mid > 0.12].mean()) if (mid > 0.12).any() else None,
                n_vertices_partial_0p1_0p9=int(len(vz)), pct_partial=float(len(vz) / max(len(ii), 1) * 100),
                partial_vertex_t_range_m=[float(t[vz].min()), float(t[vz].max())] if len(vz) else None,
                mean_influences_in_zone=float(infl[vz].mean()) if len(vz) else None,
                max_influences_in_zone=int(infl[vz].max()) if len(vz) else None,
                mean_influences_cylinder=float(infl[ii].mean()), max_influences_cylinder=int(infl[ii].max()),
                mean_helper_weight_in_zone=float(wh[vz].mean()) if len(vz) else 0.0,
                weight_sum_check_min=float(total[ii].min()), weight_sum_check_max=float(total[ii].max()))
            profile_rows = rows
            if not os.path.exists(os.path.join(OUT, "weight_falloff_profiles.csv")) and rigname == "default" and joint == "shoulder" and side == "l":
                pass
            summary[rigname][f"{joint}_{side}"]["_rows"] = rows
# write profiles + summary
allrows = [r for rg in summary.values() for v in rg.values() for r in v["_rows"]]
write_csv("weight_falloff_profiles.csv", ["rig", "joint", "side", "t_bin_centre_m", "n_vertices", "w_distal_mean", "w_distal_p10", "w_distal_p90", "w_helper_mean", "mean_influences", "max_influences"], allrows)
for rg in summary.values():
    for v in rg.values(): v.pop("_rows")
write_json("weight_falloff_summary.json", summary)
print(f"{'rig':18s} {'joint':9s} sd  n    t10    t50    t90   width  partial%  infl_zone(mean/max)  helper_w")
for rn, rg in summary.items():
    for k, v in rg.items():
        f = lambda x: "  n/a " if x is None else f"{x*100:6.1f}"
        print(f"{rn:18s} {k:9s} {v['n_vertices_in_cylinder']:4d} {f(v['t10_m'])} {f(v['t50_m'])} {f(v['t90_m'])} {f(v['blend_width_10_90_m'])} {v['pct_partial']:6.1f}  {v['mean_influences_in_zone'] if v['mean_influences_in_zone'] is None else round(v['mean_influences_in_zone'],2)}/{v['max_influences_in_zone']}  {v['mean_helper_weight_in_zone']:.2f}  miss={v['distal_bones_missing_from_weights']}")
