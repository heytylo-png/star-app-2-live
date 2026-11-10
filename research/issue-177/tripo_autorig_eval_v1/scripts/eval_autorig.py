#!/usr/bin/env python3
"""Tripo auto-rig evaluation (Issue #177) — implements METHOD_AND_CRITERIA_FROZEN.md (sha256 8c7cd584…3f73).

Usage: python3 -I eval_autorig.py RIGGED.glb V83_BONES.json OUTDIR
Writes OUTDIR/autorig_eval.json and OUTDIR/poses_contact_sheet.png. numpy + scipy + Pillow only; no Blender.

Implementation clarifications (fixed BEFORE any posed result was computed; disclosed in the report):
 C1 Cross-section (metric 2): vertices are selected at rest exactly as frozen (adjacent bone sets, slab +-0.03H along
    the distal bone axis around the joint, radius <= 0.08H from the distal line); each selected vertex's radial distance
    is measured to the line of ITS OWN segment (proximal or distal bone), rest vs pose, because a single line is
    undefined across a bent joint.
 C2 Shoulder slump (metric 3): measured as the lag of LBS-skinned arm-group vertices within 0.06H of the Upperarm joint
    behind the same vertices moved RIGIDLY with the upper arm, along the posed 'up' direction perpendicular to the arm
    (mean and max, % H). The frozen 'highest point in a lateral window' would be dominated by the fused hair/head.
 C3 P4 twist amounts are absolute about the forearm axis: ForearmTwist01 30 deg, ForearmTwist02 60 deg total (30 deg on
    top of its parent), Hand 90 deg. Sign: positive right-handed about the Forearm->Hand axis (left) and mirrored (right).
 C4 'toward front' axis for P3/P5 and 'toward back' for P6: axis = normalize(d x f) where d is the bone direction and
    f the unit front (+Z) or back (-Z) component orthogonal to d; rotation +angle about that axis moves d toward f.
"""
import json, math, sys, os
import numpy as np
from scipy.spatial import cKDTree
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbio import load_rig, trs, quat_to_mat

GLB_PATH, V83_PATH, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
R = load_rig(GLB_PATH)
V, N, F, J, W = R["V"], R["N"], R["F"], R["J"], R["W"]
names, joints, IBM, js, parent = R["names"], R["joints"], R["IBM"], R["js"], R["parent"]
NJ = len(names); idx = {n: i for i, n in enumerate(names)}
H = float(V[:, 1].max() - V[:, 1].min()); T = 0.004 * H
B = np.array([np.linalg.inv(m) for m in IBM]); P0 = B[:, :3, 3]
r6 = lambda x: float(round(float(x), 6))

# joint hierarchy (joint indices)
node2j = {n: i for i, n in enumerate(joints)}
jpar = {i: node2j.get(parent.get(n)) for i, n in enumerate(joints)}
children = {i: [] for i in range(NJ)}
for i, p in jpar.items():
    if p is not None: children[p].append(i)
def subtree(i):
    out, st = [], [i]
    while st:
        k = st.pop(); out.append(k); st.extend(children[k])
    return out
def depth(i):
    d = 0
    while jpar[i] is not None: i = jpar[i]; d += 1
    return d

# groups
G_HEAD = {"Head", "FacialBone", "L_Eye", "R_Eye", "NeckTwist01", "NeckTwist02"}
G_TORSO = {"BoneRoot", "Hip", "Pelvis", "Waist", "Spine01", "Spine02"}
def group_of(n):
    if n in G_HEAD: return "head"
    if n in G_TORSO: return "torso"
    s = n[:2]
    if any(k in n for k in ("Hand", "Thumb", "Index", "Mid", "Ring", "Pinky")): return s + "hand"
    if any(k in n for k in ("Clavicle", "Upperarm", "Forearm", "ElbowShareBone")): return s + "arm"
    if any(k in n for k in ("Thigh", "Calf", "KneeShareBone")): return s + "leg"
    if any(k in n for k in ("Foot", "ToeBase")): return s + "foot"
    raise ValueError(n)
GROUPS = ["head", "torso", "L_arm", "R_arm", "L_hand", "R_hand", "L_leg", "R_leg", "L_foot", "R_foot"]
gid_of_joint = np.array([GROUPS.index(group_of(n)) for n in names])
dom = J[np.arange(len(J)), W.argmax(1)]
vg = gid_of_joint[dom]

# ---------------- skinning ----------------
def skin(Gm):
    S = Gm @ IBM                                  # (NJ,4,4)
    A = np.einsum("vk,vkij->vij", W, S[J][:, :, :3, :])   # (V,3,4)
    Vp = np.einsum("vij,vj->vi", A[:, :, :3], V) + A[:, :, 3]
    Np = np.einsum("vij,vj->vi", A[:, :, :3], N)
    Np /= np.linalg.norm(Np, axis=1, keepdims=True) + 1e-20
    return Vp, Np

def rodrigues(axis, ang):
    a = np.asarray(axis, float); a = a / np.linalg.norm(a)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K

def pose_world(deltas):
    """deltas: list of (joint_name, R3x3) world-axis rotations about the joint's CURRENT position, applied root->leaf."""
    Gm = B.copy()
    for name, Rm in sorted(deltas, key=lambda d: depth(idx[d[0]])):
        j = idx[name]; c = Gm[j, :3, 3].copy()
        M = np.eye(4); M[:3, :3] = Rm; M[:3, 3] = c - Rm @ c
        for k in subtree(j): Gm[k] = M @ Gm[k]
    return Gm

def dirv(a, b): v = P0[idx[b]] - P0[idx[a]]; return v / np.linalg.norm(v)
def rot_toward(d, target):
    d = d / np.linalg.norm(d); t = target / np.linalg.norm(target)
    ax = np.cross(d, t); s = np.linalg.norm(ax)
    if s < 1e-12: return np.eye(3)
    return rodrigues(ax, math.atan2(s, float(d @ t)))
def flex(d, f_world, ang):
    f = f_world - (f_world @ d) * d; f /= np.linalg.norm(f)
    return rodrigues(np.cross(d, f), math.radians(ang))

FRONT, BACK, UP = np.array([0, 0, 1.0]), np.array([0, 0, -1.0]), np.array([0, 1.0, 0])
def P(side):
    s = side
    ua = dirv(f"{s}_Upperarm", f"{s}_Forearm"); fa = dirv(f"{s}_Forearm", f"{s}_Hand")
    th = dirv(f"{s}_Thigh", f"{s}_Calf"); cf = dirv(f"{s}_Calf", f"{s}_Foot")
    out_x = 1.0 if s == "L" else -1.0
    horiz = np.array([out_x * math.hypot(ua[0], ua[1]), 0.0, ua[2]])
    tw_sign = 1.0 if s == "L" else -1.0
    return dict(
        P1=[(f"{s}_Upperarm", rot_toward(ua, horiz))],
        P2=[(f"{s}_Upperarm", rot_toward(ua, FRONT))],
        P3=[(f"{s}_Forearm", flex(fa, FRONT, 90))],
        P4=[(f"{s}_ForearmTwist01", rodrigues(fa, tw_sign * math.radians(30))),
            (f"{s}_ForearmTwist02", rodrigues(fa, tw_sign * math.radians(30))),
            (f"{s}_Hand", rodrigues(fa, tw_sign * math.radians(90)))],
        P5=[(f"{s}_Thigh", flex(th, FRONT, 60))],
        P6=[(f"{s}_Calf", flex(cf, BACK, 90))])
PL, PR = P("L"), P("R")
POSES = {k: PL[k] + PR[k] for k in PL}
POSES["P7"] = [("Head", rodrigues(UP, math.radians(45)))]
POSES["P8"] = [("Spine01", rodrigues(np.array([1.0, 0, 0]), math.radians(20)))]

# ---------------- metrics ----------------
def penetration(Vp, Np):
    depthv = np.zeros(len(Vp)); other = np.full(len(Vp), -1)
    for g in range(len(GROUPS)):
        mq = vg == g; mt = ~mq
        if not mq.any(): continue
        ti = np.where(mt)[0]; tree = cKDTree(Vp[ti])
        _, nn = tree.query(Vp[mq], workers=-1)
        q = ti[nn]; d = np.einsum("ij,ij->i", Vp[q] - Vp[mq], Np[q])
        depthv[mq] = np.maximum(d, 0); other[mq] = vg[q]
    return depthv, other
def pair_table(mask, depthv, other):
    tab = {}
    for i in np.where(mask)[0]:
        a, b = sorted((GROUPS[vg[i]], GROUPS[other[i]])); k = f"{a}|{b}"
        c, m = tab.get(k, (0, 0.0)); tab[k] = (c + 1, max(m, depthv[i]))
    return {k: dict(n=c, max_depth_pctH=r6(100 * m / H)) for k, (c, m) in sorted(tab.items())}
def volume(Vp):
    a, b, c = Vp[F[:, 0]], Vp[F[:, 1]], Vp[F[:, 2]]
    return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6)

def line_dist(X, a, b):
    d = (b - a) / np.linalg.norm(b - a); v = X - a
    return np.linalg.norm(v - np.outer(v @ d, d), axis=1)
def cross_section(Gm, Vp, joint, distal, prox_bones, dist_bones, proxjoint):
    j, dj, pj = idx[joint], idx[distal], idx[proxjoint]
    a0, b0, p0 = P0[j], P0[dj], P0[pj]
    dax = (b0 - a0) / np.linalg.norm(b0 - a0)
    bones = prox_bones | dist_bones
    cand = np.isin(dom, [idx[n] for n in bones if n in idx])
    t = (V - a0) @ dax
    sel = cand & (np.abs(t) <= 0.03 * H) & (line_dist(V, a0, b0) <= 0.08 * H)
    si = np.where(sel)[0]
    is_dist = np.isin(dom[si], [idx[n] for n in dist_bones if n in idx])
    a1, b1, p1 = Gm[j, :3, 3], Gm[dj, :3, 3], Gm[pj, :3, 3]
    r0 = np.where(is_dist, line_dist(V[si], a0, b0), line_dist(V[si], p0, a0))
    r1 = np.where(is_dist, line_dist(Vp[si], a1, b1), line_dist(Vp[si], p1, a1))
    return dict(n=int(len(si)), mean_change_pct=r6(100 * (r1.mean() / r0.mean() - 1)),
                p5_change_pct=r6(100 * (np.percentile(r1, 5) / np.percentile(r0, 5) - 1)))
def slump(Gm, Vp, side):
    j = idx[f"{side}_Upperarm"]; c0 = P0[j]
    arm = np.isin(dom, [idx[n] for n in names if group_of(n) == f"{side}_arm"])
    sel = arm & (np.linalg.norm(V - c0, axis=1) <= 0.06 * H)
    M = Gm[j] @ IBM[j]
    rigid = V[sel] @ M[:3, :3].T + M[:3, 3]
    ad = Gm[idx[f"{side}_Forearm"], :3, 3] - Gm[j, :3, 3]; ad /= np.linalg.norm(ad)
    up = UP - (UP @ ad) * ad; up /= np.linalg.norm(up)
    lag = (rigid - Vp[sel]) @ up
    return dict(n=int(sel.sum()), mean_pctH=r6(100 * lag.mean() / H), max_pctH=r6(100 * lag.max() / H))

# ---------------- run ----------------
res = dict(input=dict(H=r6(H), T=r6(T), vertices=int(len(V)), triangles=int(len(F)), joints=NJ))
res["skeleton"] = dict(names=names, bind_positions={n: [r6(x) for x in P0[i]] for i, n in enumerate(names)},
                       parents={n: (names[jpar[i]] if jpar[i] is not None else None) for i, n in enumerate(names)},
                       has_hair_bones=any("hair" in n.lower() for n in names), has_jaw=any("jaw" in n.lower() for n in names))
s = W.sum(1); nz = (W > 1e-6).sum(1)
res["weights"] = dict(max_abs_sum_minus_1=r6(np.abs(s - 1).max()), influences_hist=np.bincount(nz, minlength=5).tolist(),
                      unweighted=int((nz == 0).sum()), negative=int((W < 0).sum()),
                      G1=bool(np.abs(s - 1).max() <= 1e-4 and nz.max() <= 4 and (nz == 0).sum() == 0))
res["group_vertex_counts"] = {g: int((vg == i).sum()) for i, g in enumerate(GROUPS)}
def hist(mask):
    c = np.bincount(dom[mask], minlength=NJ); o = np.argsort(-c)
    return {names[i]: int(c[i]) for i in o if c[i] > 0}
heel = (V[:, 1] < 0.05) & (V[:, 2] >= -0.039) & (V[:, 2] <= -0.027)
res["drivers"] = dict(heel_spike_L=hist(heel & (V[:, 0] > 0)), heel_spike_R=hist(heel & (V[:, 0] < 0)))
ya, yh = P0[idx["L_Upperarm"], 1], P0[idx["Head"], 1]
hairside = (V[:, 1] >= ya) & (V[:, 1] <= yh) & (np.abs(V[:, 0]) > 0.045) & (vg == 0)
res["drivers"]["hair_beside_neck"] = dict(n=int(hairside.sum()), bones=hist(hairside),
                                         all_verts_in_slab_bones=hist((V[:, 1] >= ya) & (V[:, 1] <= yh) & (np.abs(V[:, 0]) > 0.045)))

rest_d, rest_o = penetration(V, N)
rest_pen = rest_d > T
res["rest"] = dict(penetrating=int(rest_pen.sum()), pairs=pair_table(rest_pen, rest_d, rest_o), volume=r6(volume(V)))
vol0 = volume(V)
sheet = []
def splat(X, a, b, size=360):
    h = X[:, a]; v = X[:, 1]
    img = np.zeros((size, size), np.uint8)
    lo = np.array([-0.55, -0.02]); sc = size / 1.07
    xi = ((h - lo[0]) * sc).astype(int); yi = (size - 1 - (v - lo[1]) * sc).astype(int)
    ok = (xi >= 0) & (xi < size) & (yi >= 0) & (yi < size)
    img[yi[ok], xi[ok]] = 255
    return img
sheet.append(("rest", splat(V, 0, 1), splat(V, 2, 1)))
res["poses"] = {}
for pk in ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"]:
    Gm = pose_world(POSES[pk]); Vp, Np = skin(Gm)
    d, o = penetration(Vp, Np)
    new = (d > T) & ~rest_pen
    nonhead = new & (vg != 0) & (o != 0)
    headhair = new & ((vg == 0) | (o == 0))
    r = dict(new_penetrating=int(new.sum()), new_nonhead=int(nonhead.sum()), new_headhair=int(headhair.sum()),
             nonhead_pairs=pair_table(nonhead, d, o), headhair_pairs=pair_table(headhair, d, o),
             volume_change_pct=r6(100 * (volume(Vp) / vol0 - 1)))
    if pk == "P1": r["shoulder_slump"] = {s: slump(Gm, Vp, s) for s in ("L", "R")}; r["cross_section_shoulder"] = {s: cross_section(Gm, Vp, f"{s}_Upperarm", f"{s}_Forearm", {f"{s}_Clavicle"}, {f"{s}_Upperarm", f"{s}_UpperarmTwist01", f"{s}_UpperarmTwist02"}, f"{s}_Clavicle") for s in ("L", "R")}
    if pk == "P3": r["cross_section_elbow"] = {s: cross_section(Gm, Vp, f"{s}_Forearm", f"{s}_Hand", {f"{s}_Upperarm", f"{s}_UpperarmTwist01", f"{s}_UpperarmTwist02", f"{s}_ElbowShareBone"}, {f"{s}_Forearm", f"{s}_ForearmTwist01", f"{s}_ForearmTwist02"}, f"{s}_Upperarm") for s in ("L", "R")}
    if pk == "P6": r["cross_section_knee"] = {s: cross_section(Gm, Vp, f"{s}_Calf", f"{s}_Foot", {f"{s}_Thigh", f"{s}_ThighTwist01", f"{s}_ThighTwist02", f"{s}_KneeShareBone"}, {f"{s}_Calf", f"{s}_CalfTwist01", f"{s}_CalfTwist02"}, f"{s}_Thigh") for s in ("L", "R")}
    if pk == "P4":
        out = {}
        for s in ("L", "R"):
            a0, b0 = P0[idx[f"{s}_Forearm"]], P0[idx[f"{s}_Hand"]]; m0 = (a0 + b0) / 2; dax = (b0 - a0) / np.linalg.norm(b0 - a0)
            fb = np.isin(dom, [idx[n] for n in (f"{s}_Forearm", f"{s}_ForearmTwist01", f"{s}_ForearmTwist02", f"{s}_Hand")])
            sel = fb & (np.abs((V - m0) @ dax) <= 0.03 * H) & (line_dist(V, a0, b0) <= 0.08 * H)
            r0 = line_dist(V[sel], a0, b0); r1 = line_dist(Vp[sel], Gm[idx[f"{s}_Forearm"], :3, 3], Gm[idx[f"{s}_Hand"], :3, 3])
            out[s] = dict(n=int(sel.sum()), mean_change_pct=r6(100 * (r1.mean() / r0.mean() - 1)), p5_change_pct=r6(100 * (np.percentile(r1, 5) / np.percentile(r0, 5) - 1)))
        r["cross_section_forearm_mid"] = out
    res["poses"][pk] = r
    sheet.append((pk, splat(Vp, 0, 1), splat(Vp, 2, 1)))
    print(pk, r["new_nonhead"], r["new_headhair"], flush=True)

# ---------------- animation ----------------
anim = js["animations"][0]; g = R["g"]
chan = {}
for c in anim["channels"]:
    smp = anim["samplers"][c["sampler"]]
    chan[(c["target"]["node"], c["target"]["path"])] = (g.acc(smp["input"]).astype(float), g.acc(smp["output"]).astype(float), smp.get("interpolation", "LINEAR"))
tmin = min(v[0].min() for v in chan.values()); tmax = max(v[0].max() for v in chan.values())
def sample(key, t, default):
    if key not in chan: return default
    ti, vo, it = chan[key]
    if t <= ti[0]: return vo[0]
    if t >= ti[-1]: return vo[-1]
    k = int(np.searchsorted(ti, t) - 1); u = (t - ti[k]) / (ti[k + 1] - ti[k])
    if it == "STEP": return vo[k]
    a, b = vo[k], vo[k + 1]
    if key[1] == "rotation":
        if a @ b < 0: b = -b
        th = math.acos(min(1.0, abs(float(a @ b))))
        if th < 1e-8: q = a + u * (b - a)
        else: q = (math.sin((1 - u) * th) * a + math.sin(u * th) * b) / math.sin(th)
        return q / np.linalg.norm(q)
    return a + u * (b - a)
def node_local(n, t):
    nd = js["nodes"][n]
    d = dict(translation=sample((n, "translation"), t, np.array(nd.get("translation", [0, 0, 0]), float)),
             rotation=sample((n, "rotation"), t, np.array(nd.get("rotation", [0, 0, 0, 1]), float)),
             scale=sample((n, "scale"), t, np.array(nd.get("scale", [1, 1, 1]), float)))
    return trs(d)
def world_at(t):
    cache = {}
    def wm(n):
        if n in cache: return cache[n]
        M = node_local(n, t); p = parent.get(n)
        cache[n] = (wm(p) @ M) if p is not None else M
        return cache[n]
    return np.array([wm(n) for n in joints])
frames = []
for i in range(48):
    t = tmin + (tmax - tmin) * i / 47
    Gm = world_at(t); Vp, Np = skin(Gm)
    d, o = penetration(Vp, Np)
    new = (d > T) & ~rest_pen
    nonhead = new & (vg != 0) & (o != 0)
    frames.append(dict(t=r6(t), new_nonhead=int(nonhead.sum()), new_headhair=int((new & ((vg == 0) | (o == 0))).sum()),
                       max_nonhead_depth_pctH=r6(100 * d[nonhead].max() / H) if nonhead.any() else 0.0,
                       nonhead_pairs=pair_table(nonhead, d, o)))
    if i in (0, 16, 32, 47): sheet.append((f"anim t={t:.2f}", splat(Vp, 0, 1), splat(Vp, 2, 1)))
w = max(frames, key=lambda f: f["new_nonhead"])
res["animation"] = dict(name=anim.get("name"), t_range=[r6(tmin), r6(tmax)], n_frames=48, worst_frame=w, frames=frames)

# ---------------- v8.3 stand-in joint comparison ----------------
v83 = {b["name"]: b for b in json.load(open(V83_PATH))["bones"]}
pairs = {"L_Thigh": ("thigh_left", "head"), "L_Calf": ("knee_left", "head"), "L_Foot": ("ankle_left", "head"),
         "L_Upperarm": ("upper_arm_left", "head"), "L_Forearm": ("elbow_left", "head"), "L_Hand": ("wrist_left", "head"),
         "R_Thigh": ("thigh_right", "head"), "R_Calf": ("knee_right", "head"), "R_Foot": ("ankle_right", "head"),
         "R_Upperarm": ("upper_arm_right", "head"), "R_Forearm": ("elbow_right", "head"), "R_Hand": ("wrist_right", "head"),
         "NeckTwist01": ("neck", "head"), "Head": ("head", "head")}
Mm = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], float)
tp = {k: Mm @ P0[idx[k]] for k in pairs}
vp = {k: np.array(v83[b][e], float) for k, (b, e) in pairs.items() if b in v83}
s_ = (vp["L_Upperarm"][2] - vp["L_Thigh"][2]) / (tp["L_Upperarm"][2] - tp["L_Thigh"][2])
mid_t = (tp["L_Thigh"] + tp["R_Thigh"]) / 2 * s_; mid_v = (vp["L_Thigh"] + vp["R_Thigh"]) / 2
off = {}
for k in pairs:
    if k not in vp: off[k] = "missing in v8.3"; continue
    d = (tp[k] * s_ - mid_t + mid_v) - vp[k]
    off[k] = dict(dx_pctS=r6(100 * d[0] / 0.95), dy_pctS=r6(100 * d[1] / 0.95), dz_pctS=r6(100 * d[2] / 0.95), dist_pctS=r6(100 * np.linalg.norm(d) / 0.95))
res["v83_standin_joint_offsets"] = dict(scale=r6(s_), note="informational only; v10 NOT VERIFIABLE", offsets=off)

# ---------------- verdict ----------------
G2 = {pk: res["poses"][pk]["new_nonhead"] <= 50 for pk in ["P1", "P2", "P3", "P4", "P6", "P7", "P8"]}
G3 = {"P3_elbow": all(res["poses"]["P3"]["cross_section_elbow"][s]["p5_change_pct"] >= -30 for s in "LR"),
      "P4_forearm": all(res["poses"]["P4"]["cross_section_forearm_mid"][s]["p5_change_pct"] >= -30 for s in "LR"),
      "P6_knee": all(res["poses"]["P6"]["cross_section_knee"][s]["p5_change_pct"] >= -30 for s in "LR"),
      "P1_slump": all(res["poses"]["P1"]["shoulder_slump"][s]["max_pctH"] <= 2.0 for s in "LR")}
fails = [k for k, v in G2.items() if not v] + [k for k, v in G3.items() if not v]
G1 = res["weights"]["G1"]
verdict = "USABLE" if G1 and not fails else ("PARTLY USABLE" if G1 and len(fails) <= 2 else "NOT USABLE")
res["verdict"] = dict(G1=G1, G2=G2, G3=G3, failures=fails, verdict=verdict)
json.dump(res, open(os.path.join(OUT, "autorig_eval.json"), "w"), indent=1, sort_keys=True)

# contact sheet
cols = len(sheet); im = Image.new("L", (cols * 360, 2 * 360 + 20), 30)
from PIL import ImageDraw
dr = ImageDraw.Draw(im)
for c, (lab, a, b) in enumerate(sheet):
    im.paste(Image.fromarray(a), (c * 360, 20)); im.paste(Image.fromarray(b), (c * 360, 380)); dr.text((c * 360 + 4, 4), lab, fill=255)
im.save(os.path.join(OUT, "poses_contact_sheet.png"))
print(json.dumps(res["verdict"]))
