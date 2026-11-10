#!/usr/bin/env python3
"""Apply a constant outward rotation of both upper arms about world +Z to every animation in a GLB (Issue #177).
Only the rotation keyframe values of L_Upperarm and R_Upperarm are rewritten, in place, in the binary chunk.
The JSON chunk, mesh, skin weights, inverse bind matrices, node hierarchy and every other animation channel are
left byte-identical; the file length does not change.
For each rotation key at time t:  q_local' = P(t)^-1 * Rz(sign*angle) * P(t) * q_local
where P(t) is the world rotation of the upper arm's parent at t (left sign = +1, right = -1, as in
anim_screen_v1/scripts/offset_sweep.py). The world position of the upper-arm joint is unchanged.
Usage: python3 -I apply_arm_offset.py IN.glb GLBIO_DIR OUT.glb [angle_deg=20]
"""
import json, math, struct, sys
import numpy as np
inp, gdir, outp = sys.argv[1:4]; ANG = float(sys.argv[4]) if len(sys.argv) > 4 else 20.0
sys.path.insert(0, gdir)
from glbio import GLB, trs, quat_to_mat
raw = bytearray(open(inp, "rb").read())
g = GLB(inp); js = g.js
cl = struct.unpack("<I", raw[12:16])[0]; BIN0 = 20 + cl + 8          # file offset of the binary chunk payload
names = [n.get("name") for n in js["nodes"]]
parent = {}
for i, n in enumerate(js["nodes"]):
    for c in n.get("children", []): parent[c] = i

def mat_to_quat(R):
    t = np.trace(R)
    if t > 0: s = math.sqrt(t + 1) * 2; q = [(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, s / 4]
    else:
        i = int(np.argmax(np.diag(R))); j, k = (i + 1) % 3, (i + 2) % 3
        s = math.sqrt(1 + R[i, i] - R[j, j] - R[k, k]) * 2; q = [0, 0, 0, 0]
        q[i] = s / 4; q[j] = (R[j, i] + R[i, j]) / s; q[k] = (R[k, i] + R[i, k]) / s; q[3] = (R[k, j] - R[j, k]) / s
    q = np.array(q); return q / np.linalg.norm(q)
def rotz(a): c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])
def polar_rot(M):
    U, _, Vt = np.linalg.svd(M); Rm = U @ Vt
    if np.linalg.det(Rm) < 0: U[:, -1] *= -1; Rm = U @ Vt
    return Rm

report = dict(angle_deg=ANG, axis="world +Z (glTF)", sign=dict(L_Upperarm=+1, R_Upperarm=-1), animations=[])
touched = set()
for anim in js["animations"]:
    chan = {}
    for c in anim["channels"]:
        smp = anim["samplers"][c["sampler"]]
        chan[(c["target"]["node"], c["target"]["path"])] = (g.acc(smp["input"]).astype(float), g.acc(smp["output"]).astype(float), smp.get("interpolation", "LINEAR"), smp["output"])
    def sample(key, t, dflt):
        if key not in chan: return dflt
        ti, vo, it, _ = chan[key]
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
    def world(n, t):
        nd = js["nodes"][n]
        M = trs(dict(translation=sample((n, "translation"), t, np.array(nd.get("translation", [0, 0, 0]), float)),
                     rotation=sample((n, "rotation"), t, np.array(nd.get("rotation", [0, 0, 0, 1]), float)),
                     scale=sample((n, "scale"), t, np.array(nd.get("scale", [1, 1, 1]), float))))
        p = parent.get(n); return world(p, t) @ M if p is not None else M
    arep = dict(name=anim.get("name"), bones={})
    for bone, sgn in (("L_Upperarm", 1.0), ("R_Upperarm", -1.0)):
        n = names.index(bone); key = (n, "rotation")
        if key not in chan: raise SystemExit(f"{bone}: no rotation channel in {anim.get('name')}")
        ti, vo, it, acc_i = chan[key]
        if it != "LINEAR": raise SystemExit(f"{bone}: rotation interpolation {it} not supported")
        if acc_i in touched: raise SystemExit(f"accessor {acc_i} is shared; refusing to edit twice")
        touched.add(acc_i)
        a = js["accessors"][acc_i]; bv = js["bufferViews"][a["bufferView"]]
        assert a["componentType"] == 5126 and a["type"] == "VEC4" and not bv.get("byteStride") and "sparse" not in a
        users = [1 for an in js["animations"] for s in an["samplers"] if s["output"] == acc_i]
        assert len(users) == 1, "output accessor used by more than one sampler"
        Rz = rotz(sgn * math.radians(ANG)); new = np.zeros_like(vo); maxscale = 0.0; prev = None
        for k, t in enumerate(ti):
            Pm = world(parent[n], float(t))[:3, :3]; P = polar_rot(Pm)
            maxscale = max(maxscale, float(np.abs(Pm - P).max()))
            q = mat_to_quat(P.T @ Rz @ P @ quat_to_mat(vo[k] / np.linalg.norm(vo[k])))
            ref = vo[k] if prev is None else prev
            if q @ ref < 0: q = -q
            new[k] = q; prev = q
        off = BIN0 + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        raw[off: off + 16 * len(new)] = new.astype("<f4").tobytes()
        if "min" in a or "max" in a: raise SystemExit("output accessor has min/max; JSON update needed")
        arep["bones"][bone] = dict(node=n, output_accessor=acc_i, keys=int(len(new)), file_offset=off, bytes=16 * len(new),
                                   parent_world_non_rotation_max=round(maxscale, 9))
    report["animations"].append(arep)
open(outp, "wb").write(raw)
print(json.dumps(report, indent=1, sort_keys=True))
