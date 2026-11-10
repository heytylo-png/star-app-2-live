"""Minimal read-only GLB reader shared by the auto-rig evaluation scripts (numpy only)."""
import json, struct
import numpy as np

CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

class GLB:
    def __init__(self, path):
        b = open(path, "rb").read()
        cl = struct.unpack("<I", b[12:16])[0]
        self.js = json.loads(b[20:20 + cl])
        off = 20 + cl
        bl = struct.unpack("<I", b[off:off + 4])[0]
        self.bin = b[off + 8: off + 8 + bl]

    def acc(self, i):
        a = self.js["accessors"][i]; bv = self.js["bufferViews"][a["bufferView"]]
        o = bv.get("byteOffset", 0) + a.get("byteOffset", 0); n = NC[a["type"]]; dt = np.dtype(CT[a["componentType"]])
        st = bv.get("byteStride", 0)
        if st and st != n * dt.itemsize:
            raw = np.frombuffer(self.bin, np.uint8, count=st * a["count"], offset=o).reshape(a["count"], st)
            arr = raw[:, : n * dt.itemsize].copy().view(dt).reshape(a["count"], n)
        else:
            arr = np.frombuffer(self.bin, dt, count=a["count"] * n, offset=o).reshape(a["count"], n)
        if a.get("normalized") and dt.kind == "u":
            arr = arr.astype(np.float64) / np.iinfo(dt).max
        return arr if n > 1 else arr[:, 0]

def quat_to_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

def trs(node_or_dict):
    M = np.eye(4)
    t = node_or_dict.get("translation", [0, 0, 0]); r = node_or_dict.get("rotation", [0, 0, 0, 1]); s = node_or_dict.get("scale", [1, 1, 1])
    M[:3, :3] = quat_to_mat(r) @ np.diag(s); M[:3, 3] = t
    return M

def load_rig(path):
    g = GLB(path); js = g.js
    mi = [i for i, n in enumerate(js["nodes"]) if "mesh" in n][0]
    p = js["meshes"][js["nodes"][mi]["mesh"]]["primitives"][0]
    V = g.acc(p["attributes"]["POSITION"]).astype(np.float64)
    N = g.acc(p["attributes"]["NORMAL"]).astype(np.float64)
    F = g.acc(p["indices"]).astype(np.int64).reshape(-1, 3)
    J = g.acc(p["attributes"]["JOINTS_0"]).astype(np.int64)
    W = g.acc(p["attributes"]["WEIGHTS_0"]).astype(np.float64)
    sk = js["skins"][js["nodes"][mi]["skin"]]
    joints = sk["joints"]; names = [js["nodes"][j].get("name") for j in joints]
    IBM = g.acc(sk["inverseBindMatrices"]).astype(np.float64).reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major -> row-major
    parent = {}
    for i, n in enumerate(js["nodes"]):
        for c in n.get("children", []): parent[c] = i
    return dict(g=g, js=js, mesh_node=mi, V=V, N=N, F=F, J=J, W=W, joints=joints, names=names, IBM=IBM, parent=parent)
