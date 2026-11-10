#!/usr/bin/env python3
"""v10 retarget v1 (Issue #177): retarget Tripo greet_02 onto the locked v10 skeleton and evaluate C1-C3.
Implements RETARGET_METHOD_AND_CRITERIA_FROZEN.md. Read-only on all inputs. numpy only.
Usage: python3 -I retarget_v10.py V10_BONES.json TRIPO.glb GLBIO_DIR RESULT.json POSE_OUT.json [anim_name=greet_02.001]
RESULT.json holds criteria and per-key criterion values (committed). POSE_OUT.json holds the full per-key pose (not committed).
"""
import hashlib, json, math, sys
import numpy as np
v10p, glb, gdir, resf, posef = sys.argv[1:6]; ANIM = sys.argv[6] if len(sys.argv) > 6 else "greet_02.001"
sys.path.insert(0, gdir)
from glbio import GLB, trs
RADIUS, CLEAR, LEN_TOL, HEAD_Z = 1.2, 2.0, 0.01, 116.0
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()

# ---------- v10 skeleton (JSON) ----------
vj = json.load(open(v10p)); VB = {b["name"]: b for b in vj["bones"]}
order = []
def add(n):
    if n in order: return
    if VB[n]["parent"]: add(VB[n]["parent"])
    order.append(n)
for b in vj["bones"]: add(b["name"])
vh = {n: np.array(VB[n]["head"], float) for n in VB}; vt = {n: np.array(VB[n]["tail"], float) for n in VB}
BONES = [n for n in order if VB[n]["type"] == "bone"]; assert len(BONES) == 19
def unit(v): return v / np.linalg.norm(v)

# ---------- Tripo ----------
g = GLB(glb); js = g.js; names = [n.get("name") for n in js["nodes"]]; nidx = {n: i for i, n in enumerate(names) if n}
parent = {}
for i, n in enumerate(js["nodes"]):
    for c in n.get("children", []): parent[c] = i
sk = js["skins"][0]; IBM = g.acc(sk["inverseBindMatrices"]).astype(np.float64).reshape(-1, 4, 4).transpose(0, 2, 1)
BIND = {names[j]: np.linalg.inv(m) for j, m in zip(sk["joints"], IBM)}
anim = [a for a in js["animations"] if a.get("name") == ANIM][0]; chan = {}
for c in anim["channels"]:
    smp = anim["samplers"][c["sampler"]]
    chan[(c["target"]["node"], c["target"]["path"])] = (g.acc(smp["input"]).astype(float), g.acc(smp["output"]).astype(float), smp.get("interpolation", "LINEAR"))
def sample(key, t, dflt):
    if key not in chan: return dflt
    ti, vo, it = chan[key]
    if t <= ti[0]: return vo[0]
    if t >= ti[-1]: return vo[-1]
    k = int(np.searchsorted(ti, t, side="right") - 1); u = (t - ti[k]) / (ti[k + 1] - ti[k])
    if it == "STEP" or u == 0: return vo[k]
    a, b = vo[k], vo[k + 1]
    if key[1] == "rotation":
        if a @ b < 0: b = -b
        th = math.acos(min(1.0, abs(float(a @ b))))
        q = a + u * (b - a) if th < 1e-8 else (math.sin((1 - u) * th) * a + math.sin(u * th) * b) / math.sin(th)
        return q / np.linalg.norm(q)
    return a + u * (b - a)
def world_all(t):
    """World matrix of every node at time t (t=None: static node transforms)."""
    cache = {}
    def wm(n):
        if n in cache: return cache[n]
        nd = js["nodes"][n]; d = lambda p, z: np.array(nd.get(p, z), float)
        if t is None: M = trs(nd) if "matrix" not in nd else np.array(nd["matrix"], float).reshape(4, 4).T
        else: M = trs(dict(translation=sample((n, "translation"), t, d("translation", [0, 0, 0])), rotation=sample((n, "rotation"), t, d("rotation", [0, 0, 0, 1])),
                           scale=sample((n, "scale"), t, d("scale", [1, 1, 1]))))
        p = parent.get(n); cache[n] = wm(p) @ M if p is not None else M
        return cache[n]
    return {nm: wm(i) for nm, i in nidx.items()}
def polar(M):
    U, _, Vt = np.linalg.svd(M[:3, :3]); Rm = U @ Vt
    if np.linalg.det(Rm) < 0: U[:, -1] *= -1; Rm = U @ Vt
    return Rm
A = np.array([[-1.0, 0, 0], [0, 0, 1.0], [0, 1.0, 0]]); assert abs(np.linalg.det(A) - 1) < 1e-12
def tv(p): return A @ p

# scale k as in v10_compare.py @ 5b1265b
Tb = {n: tv(M[:3, 3]) for n, M in BIND.items()}
v_sh, v_an = (vh["shoulder_left"] + vh["shoulder_right"]) / 2, (vh["ankle_left"] + vh["ankle_right"]) / 2
t_sh, t_an = (Tb["L_Upperarm"] + Tb["R_Upperarm"]) / 2, (Tb["L_Foot"] + Tb["R_Foot"]) / 2
K = float((v_sh[2] - v_an[2]) / (t_sh[2] - t_an[2]))

# ---------- bone map ----------
MAP = {"pelvis": ("Pelvis", None), "hip": ("Hip", None), "lower_waist": ("Waist", None), "waist": ("Spine01", None),
       "mid_chest": ("Spine02", None), "upper_chest": ("Spine02", None), "head": ("Head", None)}
for vs, ts in (("left", "L"), ("right", "R")):
    MAP.update({f"upper_arm_{vs}": (f"{ts}_Upperarm", f"{ts}_Forearm"), f"lower_arm_{vs}": (f"{ts}_Forearm", f"{ts}_Hand"), f"hand_{vs}": (f"{ts}_Hand", f"{ts}_Mid1"),
                f"thigh_{vs}": (f"{ts}_Thigh", f"{ts}_Calf"), f"shin_{vs}": (f"{ts}_Calf", f"{ts}_Foot"), f"foot_{vs}": (f"{ts}_Foot", f"{ts}_ToeBase")})
assert sorted(MAP) == sorted(BONES)
LIMB = [b for b in BONES if MAP[b][1]]
def rodrigues(ax, ang):
    a = unit(np.asarray(ax, float)); Kx = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(ang) * Kx + (1 - math.cos(ang)) * Kx @ Kx
def shortest(u, v):
    ax = np.cross(u, v); s = np.linalg.norm(ax)
    return np.eye(3) if s < 1e-12 else rodrigues(ax, math.atan2(s, float(u @ v)))
def rest_dir_v10(b): return unit(vt[b] - vh[b])
def rest_dir_tripo(b): a, e = MAP[b]; return unit(Tb[e] - Tb[a])
def correction(b, variant):
    kind = b.rsplit("_", 1)[0]
    if kind in ("thigh", "shin") or (variant == "B" and kind in ("upper_arm", "lower_arm", "hand")): return shortest(rest_dir_v10(b), rest_dir_tripo(b))
    if kind == "foot":
        u, v = rest_dir_v10(b), rest_dir_tripo(b); return rodrigues([0, 0, 1.0], math.atan2(v[1], v[0]) - math.atan2(u[1], u[0]))
    return np.eye(3)

# ---------- geometry helpers ----------
def seg_dist(p1, q1, p2, q2):
    d1, d2, r = q1 - p1, q2 - p2, p1 - p2; a, e, f = d1 @ d1, d2 @ d2, d2 @ r; eps = 1e-18
    if a <= eps and e <= eps: s = t = 0.0
    elif a <= eps: s, t = 0.0, min(1.0, max(0.0, f / e))
    else:
        c = d1 @ r
        if e <= eps: t, s = 0.0, min(1.0, max(0.0, -c / a))
        else:
            b = d1 @ d2; den = a * e - b * b
            s = min(1.0, max(0.0, (b * f - c * e) / den)) if den > eps else 0.0
            t = (b * s + f) / e
            if t < 0: t, s = 0.0, min(1.0, max(0.0, -c / a))
            elif t > 1: t, s = 1.0, min(1.0, max(0.0, (b - c) / a))
    return float(np.linalg.norm((p1 + d1 * s) - (p2 + d2 * t)))
GROUPS = {"L_arm": ["upper_arm_left", "lower_arm_left", "hand_left"], "R_arm": ["upper_arm_right", "lower_arm_right", "hand_right"],
          "L_leg": ["thigh_left", "shin_left", "foot_left"], "R_leg": ["thigh_right", "shin_right", "foot_right"],
          "torso": ["pelvis", "hip", "lower_waist", "waist", "mid_chest", "upper_chest"]}
EXCL = {frozenset(p) for p in (("upper_arm_left", "upper_chest"), ("upper_arm_right", "upper_chest"), ("thigh_left", "pelvis"), ("thigh_right", "pelvis"))}
GN = list(GROUPS); PAIRS = [(ga, gb, a, b) for i, ga in enumerate(GN) for gb in GN[i + 1:] for a in GROUPS[ga] for b in GROUPS[gb] if frozenset((a, b)) not in EXCL]
def clear_all(H, T):
    out = {}
    for ga, gb, a, b in PAIRS:
        d = seg_dist(H[a], T[a], H[b], T[b]); key = f"{ga}|{gb}"
        if key not in out or d < out[key][0]: out[key] = (d, f"{a}|{b}")
    hd = min((seg_dist(H[a], T[a], H["head"], T["head"]), f"{a}|head") for gname in ("L_arm", "R_arm") for a in GROUPS[gname])
    return out, hd
def fk(Q, root_pos):
    H, T = {}, {}
    for n in order:
        p = VB[n]["parent"]
        H[n] = root_pos.copy() if p is None else H[p] + Q[p] @ (vh[n] - vh[p])
        T[n] = H[n] + Q[n] @ (vt[n] - vh[n])
    return H, T
def ang(u, v): return math.degrees(math.acos(max(-1.0, min(1.0, float(unit(u) @ unit(v))))))
DOWN = np.array([0, 0, -1.0])

# ---------- run ----------
tk = chan[(nidx["L_Upperarm"], "rotation")][0]
Wb = {n: polar(M) for n, M in BIND.items()}
static = world_all(None)
rest_check = dict(max_pos_diff_units=float(f"{max(np.linalg.norm(static[n][:3, 3] - BIND[n][:3, 3]) for n in BIND):.3e}"),
                  max_rot_diff_deg=float(f"{max(ang_ for ang_ in [math.degrees(math.acos(max(-1, min(1, (np.trace(polar(static[n]).T @ Wb[n]) - 1) / 2)))) for n in BIND]):.3e}"))
rest_len = {b: float(np.linalg.norm(vt[b] - vh[b])) for b in BONES}
Hr, Tr = fk({n: np.eye(3) for n in order}, vh["pelvis"]); rc, rhd = clear_all(Hr, Tr)
rest_min = min(v[0] for v in rc.values())
def run(variant):
    C = {b: correction(b, variant) for b in BONES}; keys = []; pose = []
    for t in tk:
        t = float(t); W = world_all(t)
        D = {j: A @ polar(W[j]) @ Wb[j].T @ A.T for j in {MAP[b][0] for b in BONES}}
        Q = {}
        for n in order: Q[n] = D[MAP[n][0]] @ C[n] if n in MAP else Q[VB[n]["parent"]]
        root = vh["pelvis"] + K * (A @ (W["Hip"][:3, 3] - BIND["Hip"][:3, 3]))
        H, T = fk(Q, root)
        lenerr = max(abs(float(np.linalg.norm(T[b] - H[b])) - rest_len[b]) for b in BONES)
        cl, hd = clear_all(H, T); gmin = min(cl.items(), key=lambda kv: kv[1][0])
        tp = {n: tv(W[n][:3, 3]) for n in W if n in BIND}
        d_r = unit(W["R_Forearm"][:3, 3] - W["R_Upperarm"][:3, 3])
        ddir = {b: ang(T[b] - H[b], tp[MAP[b][1]] - tp[MAP[b][0]]) for b in LIMB}
        ja = {}
        for vs, ts in (("left", "L"), ("right", "R")):
            tu, tf = tp[f"{ts}_Forearm"] - tp[f"{ts}_Upperarm"], tp[f"{ts}_Hand"] - tp[f"{ts}_Forearm"]
            tth, tsh = tp[f"{ts}_Calf"] - tp[f"{ts}_Thigh"], tp[f"{ts}_Foot"] - tp[f"{ts}_Calf"]
            vu, vf = T[f"upper_arm_{vs}"] - H[f"upper_arm_{vs}"], T[f"lower_arm_{vs}"] - H[f"lower_arm_{vs}"]
            vth, vsh = T[f"thigh_{vs}"] - H[f"thigh_{vs}"], T[f"shin_{vs}"] - H[f"shin_{vs}"]
            ja[f"elbow_{vs}"] = ang(vu, vf) - ang(tu, tf); ja[f"knee_{vs}"] = ang(vth, vsh) - ang(tth, tsh)
            ja[f"shoulder_{vs}"] = ang(vu, DOWN) - ang(tu, DOWN); ja[f"hip_{vs}"] = ang(vth, DOWN) - ang(tth, DOWN)
        keys.append(dict(t=round(t, 6), len_err_max_mm=float(f"{lenerr:.3e}"), raised=bool(d_r[1] >= 0), tripo_R_upperarm_elev_deg=round(math.degrees(math.asin(max(-1, min(1, float(d_r[1]))))), 3),
                         wrist_R_z=round(float(H["hand_right"][2]), 4), hand_tip_R_z=round(float(T["hand_right"][2]), 4), head_head_z=round(float(H["head"][2]), 4),
                         min_axis_dist_mm=round(gmin[1][0], 4), min_pair=gmin[1][1], per_group_pair={k2: round(v[0], 4) for k2, v in sorted(cl.items())},
                         arm_head_min_axis_dist_mm=round(hd[0], 4), arm_head_pair=hd[1],
                         dir_diff_deg={b: round(v, 3) for b, v in sorted(ddir.items())}, joint_angle_diff_deg={j: round(v, 3) for j, v in sorted(ja.items())},
                         ankle_z=[round(float(H["foot_left"][2]), 3), round(float(H["foot_right"][2]), 3)], foot_tail_z=[round(float(T["foot_left"][2]), 3), round(float(T["foot_right"][2]), 3)],
                         pelvis_head=[round(float(x), 4) for x in root]))
        pose.append(dict(t=round(t, 6), pelvis_head=[float(x) for x in root], Q={n: [[float(x) for x in row] for row in Q[n]] for n in order},
                         head={n: [float(x) for x in H[n]] for n in order}, tail={n: [float(x) for x in T[n]] for n in order}))
    # criteria
    c1max = max(x["len_err_max_mm"] for x in keys)
    raised = [x for x in keys if x["raised"]]
    hi = [(max(x["wrist_R_z"], x["hand_tip_R_z"]), x) for x in raised]
    ok2 = [h >= HEAD_Z and h >= x["head_head_z"] for h, x in hi]
    best = max(hi, key=lambda p: p[0]) if hi else None
    thr = 2 * RADIUS + CLEAR; viol = [x for x in keys if x["min_axis_dist_mm"] < thr]
    worst = min(keys, key=lambda x: x["min_axis_dist_mm"])
    pg = {}
    for x in keys:
        for k2, v in x["per_group_pair"].items():
            if k2 not in pg or v < pg[k2][0]: pg[k2] = (v, x["t"])
    vp = {}
    for x in keys:
        for k2, v in x["per_group_pair"].items():
            if v < thr: vp[k2] = vp.get(k2, 0) + 1
    ah = min(keys, key=lambda x: x["arm_head_min_axis_dist_mm"])
    summ = lambda f: {k2: dict(max_abs=round(max(abs(f(x)[k2]) for x in keys), 3), mean_abs=round(float(np.mean([abs(f(x)[k2]) for x in keys])), 3),
                               mean_signed=round(float(np.mean([f(x)[k2] for x in keys])), 3)) for k2 in sorted(f(keys[0]))}
    res = dict(variant=variant, keys=len(keys),
               C1=dict(rule="bone length within 0.01 mm of rest, 19 bones, every key", max_abs_length_error_mm=c1max, result="PASS" if c1max <= LEN_TOL else "FAIL"),
               C2=dict(rule="raised part: highest point of hand_right >= 116 mm and >= head bone head z at the same key, at one or more keys",
                       raised_keys=len(raised), raised_t=[raised[0]["t"], raised[-1]["t"]] if raised else None, keys_meeting=int(sum(ok2)),
                       highest=dict(t=best[1]["t"], hand_high_z=round(best[0], 4), wrist_z=best[1]["wrist_R_z"], tip_z=best[1]["hand_tip_R_z"], head_head_z=best[1]["head_head_z"]) if best else None,
                       result="PASS" if any(ok2) else "FAIL"),
               C3=dict(rule=f"capsule radius {RADIUS} mm; surface clearance >= {CLEAR} mm (axis distance >= {thr} mm); pairs across groups; shared-joint pairs excluded",
                       tested_pairs=len(PAIRS), rest_min_axis_dist_mm=round(rest_min, 4), rest_passes=bool(rest_min >= thr), keys_with_violation=len(viol),
                       violation_keys_by_group_pair=dict(sorted(vp.items())),
                       worst=dict(t=worst["t"], axis_dist_mm=worst["min_axis_dist_mm"], clearance_mm=round(worst["min_axis_dist_mm"] - 2 * RADIUS, 4), pair=worst["min_pair"]),
                       min_axis_dist_by_group_pair={k2: dict(mm=v[0], t=v[1]) for k2, v in sorted(pg.items())},
                       result=("NOT VERIFIABLE" if rest_min < thr else "PASS" if not viol else "FAIL")),
               arm_vs_head_not_gated=dict(min_axis_dist_mm=ah["arm_head_min_axis_dist_mm"], t=ah["t"], pair=ah["arm_head_pair"],
                                          keys_below_4p4=int(sum(x["arm_head_min_axis_dist_mm"] < thr for x in keys))),
               dir_diff_deg=summ(lambda x: x["dir_diff_deg"]), joint_angle_diff_deg_v10_minus_tripo=summ(lambda x: x["joint_angle_diff_deg"]),
               feet=dict(ankle_z_range=[min(min(x["ankle_z"]) for x in keys), max(max(x["ankle_z"]) for x in keys)], ankle_z_rest=-62.0,
                         foot_tail_z_range=[min(min(x["foot_tail_z"]) for x in keys), max(max(x["foot_tail_z"]) for x in keys)], foot_tail_z_rest=-88.0),
               per_key=keys)
    return res, pose
main, pose_main = run("main"); varB, pose_B = run("B")
out = dict(frozen_method_sha256="23e3907744c29de669f84983d5148bc5c5e552068a31f9d7c919095369c5f10b",
           inputs=dict(v10_json_sha256=sha(v10p), tripo_glb_sha256=sha(glb)), animation=ANIM, scale_mm_per_tripo_unit=round(K, 3),
           t_range=[round(float(tk[0]), 6), round(float(tk[-1]), 6)], tripo_bind_vs_static_nodes=rest_check,
           rest_corrections_deg={b: round(math.degrees(math.acos(max(-1, min(1, (np.trace(correction(b, "B")) - 1) / 2)))), 3) for b in LIMB},
           v10_rest_lengths_mm={b: round(v, 4) for b, v in rest_len.items()}, main=main, variant_B_not_gated=varB)
json.dump(out, open(resf, "w"), indent=1, sort_keys=True)
json.dump(dict(animation=ANIM, order=order, parents={n: VB[n]["parent"] for n in order}, main=pose_main, variant_B=pose_B), open(posef, "w"))
for nm, r in (("main", main), ("B", varB)):
    print(nm, json.dumps({c: {k2: v for k2, v in r[c].items() if k2 != "rule"} for c in ("C1", "C2", "C3")}), json.dumps(r["arm_vs_head_not_gated"]))
print(json.dumps(dict(K=out["scale_mm_per_tripo_unit"], rest=rest_check, corr=out["rest_corrections_deg"])))
