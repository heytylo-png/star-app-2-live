#!/usr/bin/env python3
"""Collision test v2 (Issue #177) — implements METHOD_AND_CRITERIA_V2_FROZEN.md (sha256 ea25ab7b…2f43).
Usage: python3 -I collide_v2.py RIGGED.glb GLBIO_DIR OUT.json
Implementation details fixed BEFORE any v2 result was computed (disclosed in the report):
 D1 A triangle's group = the most common group among its 3 vertices (dominant bone); ties -> group of its first vertex.
 D2 Candidate search: scipy cKDTree.query_pairs on posed centroids with r = 2 x max posed radius, then the exact
    bound |c_i - c_j| <= r_i + r_j. Pairs in the same group and adjacent pairs near the seam are dropped before the
    exact test (they are never counted).
 D3 Segment-triangle test (Moller-Trumbore): hit if |det| > 1e-12, u >= -1e-9, v >= -1e-9, u+v <= 1+1e-9,
    -1e-9 <= t <= 1+1e-9, for each of the 3 edges of each triangle against the other (6 tests per pair).
 D4 Positive control PC: L_Upperarm rotated -25 deg and R_Upperarm +25 deg about world +Z (toward the midline).
"""
import json, math, os, sys
import numpy as np
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
sys.path.insert(0, sys.argv[2])
from glbio import load_rig, trs

GLB, OUTF = sys.argv[1], sys.argv[3]
R = load_rig(GLB); V, F, J, W, names, IBM, js, parent, joints = R["V"], R["F"], R["J"], R["W"], R["names"], R["IBM"], R["js"], R["parent"], R["joints"]
H = float(V[:, 1].max() - V[:, 1].min()); NJ = len(names); idx = {n: i for i, n in enumerate(names)}
B = np.array([np.linalg.inv(m) for m in IBM]); P0 = B[:, :3, 3]
GHEAD = {"Head", "FacialBone", "L_Eye", "R_Eye", "NeckTwist01", "NeckTwist02"}; GT = {"BoneRoot", "Hip", "Pelvis", "Waist", "Spine01", "Spine02"}
def grp(n):
    if n in GHEAD: return "head"
    if n in GT: return "torso"
    s = n[:2]
    if any(k in n for k in ("Hand", "Thumb", "Index", "Mid", "Ring", "Pinky")): return s + "hand"
    if any(k in n for k in ("Clavicle", "Upperarm", "Forearm", "ElbowShareBone")): return s + "arm"
    if any(k in n for k in ("Thigh", "Calf", "KneeShareBone")): return s + "leg"
    return s + "foot"
GROUPS = ["head", "torso", "L_arm", "R_arm", "L_hand", "R_hand", "L_leg", "R_leg", "L_foot", "R_foot"]
NG = len(GROUPS)
dom = J[np.arange(len(J)), W.argmax(1)]; vg = np.array([GROUPS.index(grp(names[d])) for d in dom])
# D1 triangle groups
tg3 = vg[F]
def mode3(a):
    m = a[:, 0].copy()
    m = np.where((a[:, 1] == a[:, 2]) & (a[:, 1] != a[:, 0]), a[:, 1], m)
    return m
tg = mode3(tg3)
# welding
q = np.round(V / 1e-7).astype(np.int64); _, wid = np.unique(q, axis=0, return_inverse=True); wid = wid.ravel(); NW = wid.max() + 1
Fw = wid[F]
Ew = np.unique(np.sort(np.concatenate([Fw[:, [0, 1]], Fw[:, [1, 2]], Fw[:, [2, 0]]]), axis=1), axis=0); Ew = Ew[Ew[:, 0] != Ew[:, 1]]
# welded vertex group (first original vertex mapping)
wg = np.zeros(NW, int); wg[wid] = vg
Vw = np.zeros((NW, 3)); Vw[wid] = V
# adjacency
adj = np.zeros((NG, NG), bool)
ga, gb = wg[Ew[:, 0]], wg[Ew[:, 1]]
adj[ga, gb] = True; adj[gb, ga] = True; np.fill_diagonal(adj, False)
# seam geodesic distances per adjacent pair
L = np.linalg.norm(Vw[Ew[:, 0]] - Vw[Ew[:, 1]], axis=1)
G = coo_matrix((np.concatenate([L, L]), (np.concatenate([Ew[:, 0], Ew[:, 1]]), np.concatenate([Ew[:, 1], Ew[:, 0]]))), shape=(NW, NW)).tocsr()
seamdist = {}
for a in range(NG):
    for b in range(a + 1, NG):
        if not adj[a, b]: continue
        m = ((ga == a) & (gb == b)) | ((ga == b) & (gb == a))
        src = np.unique(Ew[m].ravel())
        d = dijkstra(G, directed=False, indices=src, min_only=True)
        seamdist[(a, b)] = d[Fw].min(1)  # per triangle
FAR = 0.05 * H

def skin(Gm):
    S = Gm @ IBM; A = np.einsum("vk,vkij->vij", W, S[J][:, :, :3, :])
    return np.einsum("vij,vj->vi", A[:, :, :3], V) + A[:, :, 3]

def seg_tri(p, qq, a, b, c):
    e1 = b - a; e2 = c - a; d = qq - p
    h = np.cross(d, e2); det = np.einsum("ij,ij->i", e1, h)
    ok = np.abs(det) > 1e-12; inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = p - a; u = inv * np.einsum("ij,ij->i", s, h)
    qv = np.cross(s, e1); v = inv * np.einsum("ij,ij->i", d, qv); t = inv * np.einsum("ij,ij->i", e2, qv)
    tol = 1e-9
    return ok & (u >= -tol) & (v >= -tol) & (u + v <= 1 + tol) & (t >= -tol) & (t <= 1 + tol)

def collisions(Vp):
    P = Vp[F]; c = P.mean(1); r = np.linalg.norm(P - c[:, None], axis=2).max(1)
    pairs = cKDTree(c).query_pairs(2 * r.max(), output_type="ndarray")
    i, j = pairs[:, 0], pairs[:, 1]
    keep = np.linalg.norm(c[i] - c[j], axis=1) <= r[i] + r[j]
    i, j = i[keep], j[keep]
    gi, gj = tg[i], tg[j]
    keep = gi != gj; i, j, gi, gj = i[keep], j[keep], gi[keep], gj[keep]
    # shared welded vertex
    sh = np.zeros(len(i), bool)
    for x in range(3):
        for y in range(3): sh |= Fw[i, x] == Fw[j, y]
    i, j, gi, gj = i[~sh], j[~sh], gi[~sh], gj[~sh]
    isadj = adj[gi, gj]
    lo, hi = np.minimum(gi, gj), np.maximum(gi, gj)
    far = np.ones(len(i), bool)
    for (a, b), d in seamdist.items():
        m = isadj & (lo == a) & (hi == b)
        far[m] = (d[i[m]] > FAR) & (d[j[m]] > FAR)
    keep = (~isadj) | far
    i, j, isadj, lo, hi = i[keep], j[keep], isadj[keep], lo[keep], hi[keep]
    hit = np.zeros(len(i), bool)
    for s0 in range(0, len(i), 500000):
        sl = slice(s0, s0 + 500000); A, Bt = P[i[sl]], P[j[sl]]; h = np.zeros(len(A), bool)
        for e in ((0, 1), (1, 2), (2, 0)):
            h |= seg_tri(A[:, e[0]], A[:, e[1]], Bt[:, 0], Bt[:, 1], Bt[:, 2])
            h |= seg_tri(Bt[:, e[0]], Bt[:, e[1]], A[:, 0], A[:, 1], A[:, 2])
        hit[sl] = h
    out = {}
    for k in np.where(hit)[0]:
        key = (int(i[k]), int(j[k])) if i[k] < j[k] else (int(j[k]), int(i[k]))
        out[key] = ("adjacent-far" if isadj[k] else "non-adjacent", f"{GROUPS[lo[k]]}|{GROUPS[hi[k]]}")
    return out, int(len(i))

def summarize(col, rest):
    new = {k: v for k, v in col.items() if k not in rest}
    res = {}
    for cat in ("non-adjacent", "adjacent-far"):
        ks = [k for k, v in new.items() if v[0] == cat]
        pairs = {}
        for k in ks: pairs[new[k][1]] = pairs.get(new[k][1], 0) + 1
        tris = np.unique(np.array(ks).ravel()) if ks else np.array([], int)
        yr = (np.array([V[F[t]][:, 1].mean() for t in tris]) / H * 100) if len(tris) else None
        res[cat] = dict(new_pairs=len(ks), by_group_pair=dict(sorted(pairs.items())), distinct_triangles=int(len(tris)),
                        y_pctH=[round(float(yr.min()), 2), round(float(yr.max()), 2)] if yr is not None else None)
    return res

# poses (identical to v1)
node2j = {n: i for i, n in enumerate(joints)}; jpar = {i: node2j.get(parent.get(n)) for i, n in enumerate(joints)}
children = {i: [] for i in range(NJ)}
for i, p in jpar.items():
    if p is not None: children[p].append(i)
def subtree(i):
    out, st = [], [i]
    while st: k = st.pop(); out.append(k); st.extend(children[k])
    return out
def depth(i):
    d = 0
    while jpar[i] is not None: i = jpar[i]; d += 1
    return d
def rod(ax, ang):
    a = np.asarray(ax, float); a = a / np.linalg.norm(a); K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K
def pose_world(deltas):
    Gm = B.copy()
    for name, Rm in sorted(deltas, key=lambda d: depth(idx[d[0]])):
        j = idx[name]; c = Gm[j, :3, 3].copy(); M = np.eye(4); M[:3, :3] = Rm; M[:3, 3] = c - Rm @ c
        for k in subtree(j): Gm[k] = M @ Gm[k]
    return Gm
def dirv(a, b): v = P0[idx[b]] - P0[idx[a]]; return v / np.linalg.norm(v)
def rot_toward(d, t):
    t = t / np.linalg.norm(t); ax = np.cross(d, t); s = np.linalg.norm(ax)
    return np.eye(3) if s < 1e-12 else rod(ax, math.atan2(s, float(d @ t)))
def flex(d, f, ang): f = f - (f @ d) * d; f = f / np.linalg.norm(f); return rod(np.cross(d, f), math.radians(ang))
FRONT, BACK, UP, ZAX = np.array([0, 0, 1.0]), np.array([0, 0, -1.0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0])
POSES = {k: [] for k in ("P1", "P2", "P3", "P4", "P5", "P6")}
for s in ("L", "R"):
    ua = dirv(f"{s}_Upperarm", f"{s}_Forearm"); fa = dirv(f"{s}_Forearm", f"{s}_Hand"); th = dirv(f"{s}_Thigh", f"{s}_Calf"); cf = dirv(f"{s}_Calf", f"{s}_Foot")
    ox = 1.0 if s == "L" else -1.0; tw = 1.0 if s == "L" else -1.0
    POSES["P1"].append((f"{s}_Upperarm", rot_toward(ua, np.array([ox * math.hypot(ua[0], ua[1]), 0, ua[2]]))))
    POSES["P2"].append((f"{s}_Upperarm", rot_toward(ua, FRONT)))
    POSES["P3"].append((f"{s}_Forearm", flex(fa, FRONT, 90)))
    POSES["P4"] += [(f"{s}_ForearmTwist01", rod(fa, tw * math.radians(30))), (f"{s}_ForearmTwist02", rod(fa, tw * math.radians(30))), (f"{s}_Hand", rod(fa, tw * math.radians(90)))]
    POSES["P5"].append((f"{s}_Thigh", flex(th, FRONT, 60))); POSES["P6"].append((f"{s}_Calf", flex(cf, BACK, 90)))
POSES["P7"] = [("Head", rod(UP, math.radians(45)))]; POSES["P8"] = [("Spine01", rod(np.array([1.0, 0, 0]), math.radians(20)))]
POSES["PC"] = [("L_Upperarm", rod(ZAX, math.radians(-25))), ("R_Upperarm", rod(ZAX, math.radians(25)))]

res = dict(input=dict(H=round(H, 6), vertices=int(len(V)), welded=int(NW), triangles=int(len(F))),
           adjacency=sorted(f"{GROUPS[a]}|{GROUPS[b]}" for a in range(NG) for b in range(a + 1, NG) if adj[a, b]),
           far_threshold=round(FAR, 6))
rest, nc = collisions(V)
res["rest"] = dict(candidates_tested=nc, intersecting={c: sum(1 for v in rest.values() if v[0] == c) for c in ("non-adjacent", "adjacent-far")},
                   by_group_pair={p: sum(1 for v in rest.values() if v[1] == p) for p in sorted(set(v[1] for v in rest.values()))})
res["poses"] = {}
for pk in ("PC", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"):
    col, nc = collisions(skin(pose_world(POSES[pk])))
    res["poses"][pk] = dict(candidates_tested=nc, **summarize(col, rest))
    print(pk, res["poses"][pk]["non-adjacent"]["new_pairs"], res["poses"][pk]["adjacent-far"]["new_pairs"], flush=True)
# animation
g = R["g"]; anim = js["animations"][0]; chan = {}
for c in anim["channels"]:
    smp = anim["samplers"][c["sampler"]]
    chan[(c["target"]["node"], c["target"]["path"])] = (g.acc(smp["input"]).astype(float), g.acc(smp["output"]).astype(float), smp.get("interpolation", "LINEAR"))
tmin = min(v[0].min() for v in chan.values()); tmax = max(v[0].max() for v in chan.values())
def sample(key, t, dflt):
    if key not in chan: return dflt
    ti, vo, it = chan[key]
    if t <= ti[0]: return vo[0]
    if t >= ti[-1]: return vo[-1]
    k = int(np.searchsorted(ti, t) - 1); u = (t - ti[k]) / (ti[k + 1] - ti[k])
    if it == "STEP": return vo[k]
    a, b = vo[k], vo[k + 1]
    if key[1] == "rotation":
        if a @ b < 0: b = -b
        th = math.acos(min(1.0, abs(float(a @ b))))
        qq = a + u * (b - a) if th < 1e-8 else (math.sin((1 - u) * th) * a + math.sin(u * th) * b) / math.sin(th)
        return qq / np.linalg.norm(qq)
    return a + u * (b - a)
def world_at(t):
    cache = {}
    def wm(n):
        if n in cache: return cache[n]
        nd = js["nodes"][n]
        M = trs(dict(translation=sample((n, "translation"), t, np.array(nd.get("translation", [0, 0, 0]), float)),
                     rotation=sample((n, "rotation"), t, np.array(nd.get("rotation", [0, 0, 0, 1]), float)),
                     scale=sample((n, "scale"), t, np.array(nd.get("scale", [1, 1, 1]), float))))
        p = parent.get(n); cache[n] = (wm(p) @ M) if p is not None else M
        return cache[n]
    return np.array([wm(n) for n in joints])
frames = []
for k in range(48):
    t = tmin + (tmax - tmin) * k / 47
    col, nc = collisions(skin(world_at(t)))
    sm = summarize(col, rest); frames.append(dict(t=round(t, 6), **sm))
w = max(frames, key=lambda f: f["non-adjacent"]["new_pairs"])
res["animation"] = dict(name=anim.get("name"), n_frames=48, worst_non_adjacent=w,
                        per_frame_non_adjacent=[f["non-adjacent"]["new_pairs"] for f in frames],
                        per_frame_adjacent_far=[f["adjacent-far"]["new_pairs"] for f in frames])
# verdict
pc_ok = res["poses"]["PC"]["non-adjacent"]["new_pairs"] >= 1
gated = ("P1", "P2", "P3", "P4", "P6", "P7", "P8")
A = {p: res["poses"][p]["non-adjacent"]["new_pairs"] == 0 for p in gated}
Bg = {p: res["poses"][p]["adjacent-far"]["new_pairs"] <= 20 for p in gated}
if not pc_ok: verdict = "METHOD INVALID (positive control not detected)"
elif all(A.values()) and all(Bg.values()): verdict = "USABLE"
elif all(A.values()) and sum(not v for v in Bg.values()) <= 2: verdict = "PARTLY USABLE"
else: verdict = "NOT USABLE"
res["verdict"] = dict(positive_control_detected=pc_ok, gate_A=A, gate_B=Bg, verdict=verdict)
json.dump(res, open(OUTF, "w"), indent=1, sort_keys=True)
print(json.dumps(res["verdict"]))
