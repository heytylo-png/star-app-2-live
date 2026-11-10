#!/usr/bin/env python3
"""Read-only inspection of a Tripo GLB as a possible Star Rai reference.
Usage: python3 -I inspect_glb.py MODEL.glb OUTDIR
Outputs OUTDIR/glb_inspection.json and orthographic silhouette PNGs (front/side/back) made by
rasterising every triangle (PIL polygon fill) — exact silhouettes, no texture.
"""
import json, struct, sys, os
import numpy as np
from PIL import Image, ImageDraw
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

path, outdir = sys.argv[1], sys.argv[2]
os.makedirs(outdir, exist_ok=True)
b = open(path, "rb").read()
cl = struct.unpack("<I", b[12:16])[0]
js = json.loads(b[20:20 + cl])
off = 20 + cl
bl, _ = struct.unpack("<I4s", b[off:off + 8]); BIN = b[off + 8: off + 8 + bl]
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
def acc(i):
    a = js["accessors"][i]; bv = js["bufferViews"][a["bufferView"]]
    o = bv.get("byteOffset", 0) + a.get("byteOffset", 0); n = NC[a["type"]]; dt = np.dtype(CT[a["componentType"]])
    stride = bv.get("byteStride", 0)
    if stride and stride != n * dt.itemsize:
        raw = np.frombuffer(BIN, np.uint8, count=stride * a["count"], offset=o).reshape(a["count"], stride)
        return raw[:, : n * dt.itemsize].copy().view(dt).reshape(a["count"], n)
    return np.frombuffer(BIN, dt, count=a["count"] * n, offset=o).reshape(a["count"], n) if n > 1 else np.frombuffer(BIN, dt, count=a["count"], offset=o)
p = js["meshes"][0]["primitives"][0]
V = acc(p["attributes"]["POSITION"]).astype(np.float64)
F = acc(p["indices"]).astype(np.int64).reshape(-1, 3)
R = {}
R["counts"] = dict(vertices=int(len(V)), triangles=int(len(F)))
R["bbox"] = dict(min=V.min(0).round(6).tolist(), max=V.max(0).round(6).tolist(), size=(V.max(0) - V.min(0)).round(6).tolist())

# connected components
n = len(V)
e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
G = coo_matrix((np.ones(len(e), np.int8), (e[:, 0], e[:, 1])), shape=(n, n))
nc, lab = connected_components(G, directed=False)
sizes = np.bincount(lab)
order = np.argsort(-sizes)
comps = []
for c in order[:12]:
    m = lab == c
    comps.append(dict(vertices=int(sizes[c]), bbox_min=V[m].min(0).round(4).tolist(), bbox_max=V[m].max(0).round(4).tolist()))
R["components"] = dict(count=int(nc), largest=comps, n_tiny_le_10_verts=int((sizes <= 10).sum()))

# boundary edges (open mesh check)
es = np.sort(e, axis=1)
key = es[:, 0] * n + es[:, 1]
_, cnt = np.unique(key, return_counts=True)
R["edges"] = dict(unique=int(len(cnt)), boundary=int((cnt == 1).sum()), nonmanifold_gt2=int((cnt > 2).sum()))

# symmetry about x=0 (sampled nearest neighbour of mirrored points)
from scipy.spatial import cKDTree
rng = np.random.default_rng(0); idx = rng.choice(n, 20000, replace=False)
T = cKDTree(V); Mv = V[idx] * np.array([-1, 1, 1])
d, _ = T.query(Mv)
H = V[:, 1].max() - V[:, 1].min()
R["mirror_symmetry_x"] = dict(sampled=20000, median_dist_over_height=float(np.median(d) / H), p95_over_height=float(np.percentile(d, 95) / H))

# orthographic silhouettes, Y up; glTF front = +Z (checked below via nose/toes)
def render(axis_h, axis_v, flip_h, name, px_per_unit):
    h = V[:, axis_h] * (-1 if flip_h else 1); v = V[:, axis_v]
    hmin, hmax, vmin, vmax = h.min(), h.max(), v.min(), v.max()
    W = int((hmax - hmin) * px_per_unit) + 20; Hh = int((vmax - vmin) * px_per_unit) + 20
    X = (h - hmin) * px_per_unit + 10; Y = (vmax - v) * px_per_unit + 10
    im = Image.new("L", (W, Hh), 0); dr = ImageDraw.Draw(im)
    P = np.stack([X[F], Y[F]], -1)
    for tri in P: dr.polygon([tuple(t) for t in tri], fill=255)
    im.save(os.path.join(outdir, f"silhouette_{name}.png"))
    a = np.array(im) > 0
    rows = np.where(a.any(1))[0]
    return dict(image=f"silhouette_{name}.png", size_px=[W, Hh], px_per_unit=px_per_unit, top_row=int(rows.min()), bottom_row=int(rows.max()), height_px=int(rows.max() - rows.min() + 1)), a
PPU = 1400 / H
R["silhouettes"] = {}
fr, A_front = render(0, 1, False, "front_+Z_view", PPU)
bk, A_back = render(0, 1, True, "back_-Z_view", PPU)
sd, A_side = render(2, 1, False, "side_+X_view", PPU)
R["silhouettes"] = dict(front=fr, back=bk, side=sd)
# front vs back silhouettes are mirror images in an orthographic projection of one mesh: check
same = (A_front == A_back[:, ::-1]) if A_front.shape == A_back.shape else None
R["silhouettes"]["front_back_mirror_pixel_agreement"] = float(same.mean()) if same is not None else None

# facing direction: compare z-extent near head-face height vs back of head; and toes
y = V[:, 1]
foot = V[y < 0.03 * H + y.min()]
R["facing_check"] = dict(foot_z_mean=float(foot[:, 2].mean()), foot_z_min=float(foot[:, 2].min()), foot_z_max=float(foot[:, 2].max()),
                         note="toes extend toward +Z if the model faces +Z (glTF convention)")

# width profile (front) per height fraction, for proportion landmarks
rowsw = []
for r in range(A_front.shape[0]):
    c = np.where(A_front[r])[0]
    if len(c): rowsw.append((r, int(c.min()), int(c.max()), int(len(c))))
R["front_width_profile_rows"] = len(rowsw)
np.save(os.path.join(outdir, "front_width_profile.npy"), np.array(rowsw))
json.dump(R, open(os.path.join(outdir, "glb_inspection.json"), "w"), indent=1)
print(json.dumps(R, indent=1))
