#!/usr/bin/env python3
"""POST-HOC supplementary metric (added after the user pointed out arm-leg fusion; NOT part of the frozen method).
Measures stretching of 'abnormal bridge' edges in the fused Tripo mesh under the frozen poses and the animation.

Abnormal bridges (by dominant-bone group of the edge's two vertices):
  arm<->leg, hand<->leg (same side), arm<->head, and arm<->torso edges below 72 % H (below the armpit band).
Per pose/frame: number of bridge edges stretched > 2x and > 4x their rest length, max stretch ratio, and the total
area ratio of triangles containing a bridge edge.
Usage: python3 -I bridge_stretch.py RIGGED.glb OUTDIR
"""
import json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbio import load_rig, trs

GLB, OUT = sys.argv[1], sys.argv[2]
R = load_rig(GLB); V, F, J, W, names, IBM, js, parent, joints = R["V"], R["F"], R["J"], R["W"], R["names"], R["IBM"], R["js"], R["parent"], R["joints"]
H = float(V[:, 1].max() - V[:, 1].min()); idx = {n: i for i, n in enumerate(names)}; NJ = len(names)
B = np.array([np.linalg.inv(m) for m in IBM]); P0 = B[:, :3, 3]
G_HEAD = {"Head", "FacialBone", "L_Eye", "R_Eye", "NeckTwist01", "NeckTwist02"}; G_T = {"BoneRoot", "Hip", "Pelvis", "Waist", "Spine01", "Spine02"}
def grp(n):
    if n in G_HEAD: return "head"
    if n in G_T: return "torso"
    s = n[:2]
    if any(k in n for k in ("Hand", "Thumb", "Index", "Mid", "Ring", "Pinky")): return s + "hand"
    if any(k in n for k in ("Clavicle", "Upperarm", "Forearm", "ElbowShareBone")): return s + "arm"
    if any(k in n for k in ("Thigh", "Calf", "KneeShareBone")): return s + "leg"
    return s + "foot"
dom = J[np.arange(len(J)), W.argmax(1)]; g = np.array([grp(names[d]) for d in dom])
E = np.unique(np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1), axis=0)
ga, gb = g[E[:, 0]], g[E[:, 1]]; ymid = V[E].mean(1)[:, 1]
def pair(a, b, x, y): return ((a == x) & (b == y)) | ((a == y) & (b == x))
cats = {}
for s in ("L_", "R_"):
    cats[s + "arm-leg"] = pair(ga, gb, s + "arm", s + "leg")
    cats[s + "hand-leg"] = pair(ga, gb, s + "hand", s + "leg")
    cats[s + "arm-head"] = pair(ga, gb, s + "arm", "head")
    cats[s + "arm-torso_below72pctH"] = pair(ga, gb, s + "arm", "torso") & (ymid < 0.72 * H)
anyb = np.zeros(len(E), bool)
for m in cats.values(): anyb |= m
L0 = np.linalg.norm(V[E[:, 0]] - V[E[:, 1]], axis=1)
# triangles containing a bridge edge
ekey = {tuple(e): i for i, e in enumerate(E[anyb])}
tri_e = [np.sort(F[:, [0, 1]], 1), np.sort(F[:, [1, 2]], 1), np.sort(F[:, [2, 0]], 1)]
bset = set(map(tuple, E[anyb]))
tmask = np.zeros(len(F), bool)
for te in tri_e:
    tmask |= np.array([tuple(x) in bset for x in te])
def area(X, Fm): a, b, c = X[Fm[:, 0]], X[Fm[:, 1]], X[Fm[:, 2]]; return float(np.linalg.norm(np.cross(b - a, c - a), axis=1).sum() / 2)
A0 = area(V, F[tmask])

def skin(Gm):
    S = Gm @ IBM; A = np.einsum("vk,vkij->vij", W, S[J][:, :, :3, :])
    return np.einsum("vij,vj->vi", A[:, :, :3], V) + A[:, :, 3]
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
    a = np.asarray(ax, float); a /= np.linalg.norm(a); K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
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
def flex(d, f, ang): f = f - (f @ d) * d; f /= np.linalg.norm(f); return rod(np.cross(d, f), math.radians(ang))
FRONT, BACK, UP = np.array([0, 0, 1.0]), np.array([0, 0, -1.0]), np.array([0, 1.0, 0])
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

def measure(Vp):
    L1 = np.linalg.norm(Vp[E[:, 0]] - Vp[E[:, 1]], axis=1); r = L1 / np.maximum(L0, 1e-12)
    out = {}
    for k, m in cats.items():
        out[k] = dict(edges=int(m.sum()), gt2x=int((r[m] > 2).sum()), gt4x=int((r[m] > 4).sum()), max_ratio=round(float(r[m].max()), 3) if m.any() else None)
    out["bridge_triangle_area_ratio"] = round(area(Vp, F[tmask]) / A0, 4) if A0 > 0 else None
    return out
res = dict(note="POST-HOC supplementary metric; not part of the frozen method", H=round(H, 6),
           categories={k: int(m.sum()) for k, m in cats.items()}, bridge_triangles=int(tmask.sum()), rest_bridge_area=round(A0, 8), poses={})
for pk, d in POSES.items():
    res["poses"][pk] = measure(skin(pose_world(d))); print(pk, json.dumps({k: v["gt2x"] for k, v in res["poses"][pk].items() if isinstance(v, dict)}), flush=True)
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
        q = a + u * (b - a) if th < 1e-8 else (math.sin((1 - u) * th) * a + math.sin(u * th) * b) / math.sin(th)
        return q / np.linalg.norm(q)
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
fr = []
for i in range(48):
    t = tmin + (tmax - tmin) * i / 47; m = measure(skin(world_at(t)))
    fr.append(dict(t=round(t, 6), gt2x=sum(v["gt2x"] for v in m.values() if isinstance(v, dict)),
                   gt4x=sum(v["gt4x"] for v in m.values() if isinstance(v, dict)),
                   max_ratio=max([v["max_ratio"] or 0 for v in m.values() if isinstance(v, dict)] or [0]), area_ratio=m["bridge_triangle_area_ratio"], detail=m))
res["animation"] = dict(frames=fr, worst=max(fr, key=lambda f: f["gt2x"]))
os.makedirs(OUT, exist_ok=True)
json.dump(res, open(os.path.join(OUT, "bridge_stretch.json"), "w"), indent=1, sort_keys=True)
print("worst anim", json.dumps({k: res["animation"]["worst"][k] for k in ("t", "gt2x", "gt4x", "max_ratio", "area_ratio")}))
