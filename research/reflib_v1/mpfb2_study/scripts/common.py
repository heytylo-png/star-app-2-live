"""Shared helpers for the MPFB2 read-only study. stdlib + numpy only. Never writes to input dirs."""
import json, os, hashlib, re, math
import numpy as np

ROOT = os.environ.get("MPFB2_ROOT", "/workspace/research/reflib_v1/mpfb2")
DATA = os.path.join(ROOT, "src/mpfb/data")
OBJ = os.path.join(DATA, "3dobjs/base.obj")
RIGS = {
    "default":     os.path.join(DATA, "rigs/standard/rig.default.json"),
    "game_engine": os.path.join(DATA, "rigs/standard/rig.game_engine.json"),
    "rigify_human":       os.path.join(DATA, "rigs/rigify/rig.human.json"),
    "rigify_human_toes":  os.path.join(DATA, "rigs/rigify/rig.human_toes.json"),
}
WEIGHTS = {
    "default":     os.path.join(DATA, "rigs/standard/weights.default.json"),
    "game_engine": os.path.join(DATA, "rigs/standard/weights.game_engine.json"),
    "rigify_human_toes": os.path.join(DATA, "rigs/rigify/weights.human_toes.json"),
}
OUT = os.environ.get("MPFB2_OUT", os.path.join(ROOT, "analysis/outputs"))
os.makedirs(OUT, exist_ok=True)

def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()

def git_blob_sha1(p):
    b = open(p, "rb").read()
    return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()

def load_json(p):
    with open(p) as f:
        return json.load(f)

def write_json(name, obj):
    with open(os.path.join(OUT, name), "w") as f:
        json.dump(obj, f, indent=1, sort_keys=False)

def write_csv(name, header, rows):
    import csv
    with open(os.path.join(OUT, name), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)

def parse_obj(path=OBJ):
    """Returns verts (N,3 float, raw OBJ units), faces (list of vertex-index tuples, 0-based),
    face_group (group name per face), groups {name: sorted vertex idx array}, vertex first-use order."""
    verts = []
    faces = []
    fgroup = []
    cur = None
    order = []
    with open(path) as f:
        for ln in f:
            if ln.startswith("v "):
                verts.append([float(x) for x in ln.split()[1:4]])
            elif ln.startswith("g "):
                cur = ln.split(None, 1)[1].strip()
                order.append(cur)
            elif ln.startswith("f "):
                idx = tuple(int(t.split("/")[0]) - 1 for t in ln.split()[1:])
                faces.append(idx)
                fgroup.append(cur)
    verts = np.array(verts)
    groups = {}
    for fi, g in zip(faces, fgroup):
        groups.setdefault(g, set()).update(fi)
    groups = {k: np.array(sorted(v)) for k, v in groups.items()}
    return verts, faces, fgroup, groups, order

def obj_to_rig(v):
    """OBJ (Y-up, decimetres) -> rig space (Z-up, metres, front -Y, .L = +X): (x, -z, y)/10"""
    v = np.asarray(v, dtype=float)
    return np.stack([v[..., 0], -v[..., 2], v[..., 1]], axis=-1) / 10.0

def bones_of(rig_json):
    """Uniform {name: bone dict} for standard and rigify rigs."""
    return rig_json["bones"] if "bones" in rig_json else rig_json

def seg_param(pt, a, b):
    """Signed distance of pt along axis a->b measured from a (metres), and perpendicular distance."""
    ax = b - a
    L = np.linalg.norm(ax)
    u = ax / L
    t = (pt - a) @ u
    perp = np.linalg.norm((pt - a) - np.outer(t, u) if pt.ndim > 1 else (pt - a) - t * u, axis=-1)
    return t, perp, L
