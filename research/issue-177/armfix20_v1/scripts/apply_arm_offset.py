#!/usr/bin/env python3
"""Add a constant outward (abduction) offset to the upper arms in every animation of a Tripo GLB.

For each animation and each rotation key of L_Upperarm / R_Upperarm at time t:
  world rotation of the upper arm  W_u(t) = P(t) * L_u(t)   (P = parent world rotation at t)
  wanted                            W_u'(t) = Rz(+-a) * W_u(t)  (world +Z axis, left +a, right -a; about the joint)
  so the new local key              L_u'(t) = P(t)^-1 * Rz(+-a) * P(t) * L_u(t)
Because the rotation is about the upper arm's own joint, its translation key is unchanged, and all children follow.
New rotation data is APPENDED as new accessors (nothing in the original buffer is overwritten); only the two
samplers' 'output' indices change. Mesh, skin, weights, skeleton and all other channels are untouched.
Requires all ancestors' rotation keys to share the upper-arm key times (checked; aborts otherwise).

Usage: python3 -I apply_arm_offset.py IN.glb GLBIO_DIR OUT.glb DEGREES
"""
import json, math, struct, sys
import numpy as np
inp, gdir, outp, deg = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
sys.path.insert(0, gdir)
from glbio import GLB, quat_to_mat

raw = open(inp, "rb").read()
g = GLB(inp); js = json.loads(json.dumps(g.js)); BIN = bytearray(g.bin)
nodes = js["nodes"]; name2node = {n.get("name"): i for i, n in enumerate(nodes)}
parent = {}
for i, n in enumerate(nodes):
    for c in n.get("children", []): parent[c] = i

def mat_to_quat(M):
    m = M; tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0:
        s = math.sqrt(tr + 1.0) * 2; w = 0.25 * s; x = (m[2, 1] - m[1, 2]) / s; y = (m[0, 2] - m[2, 0]) / s; z = (m[1, 0] - m[0, 1]) / s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; w = (m[2, 1] - m[1, 2]) / s; x = 0.25 * s; y = (m[0, 1] + m[1, 0]) / s; z = (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; w = (m[0, 2] - m[2, 0]) / s; x = (m[0, 1] + m[1, 0]) / s; y = 0.25 * s; z = (m[1, 2] + m[2, 1]) / s
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; w = (m[1, 0] - m[0, 1]) / s; x = (m[0, 2] + m[2, 0]) / s; y = (m[1, 2] + m[2, 1]) / s; z = 0.25 * s
    q = np.array([x, y, z, w]); return q / np.linalg.norm(q)

def Rz(a):
    c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])

def append_accessor(arr, template_acc):
    global BIN
    while len(BIN) % 4: BIN.append(0)
    off = len(BIN); data = arr.astype("<f4").tobytes(); BIN += data
    js["bufferViews"].append(dict(buffer=0, byteOffset=off, byteLength=len(data)))
    acc = dict(bufferView=len(js["bufferViews"]) - 1, componentType=5126, count=int(len(arr)), type="VEC4")
    js["accessors"].append(acc); return len(js["accessors"]) - 1

report = {}
for an in js["animations"]:
    rot = {}  # node -> (sampler index, times, values)
    for c in an["channels"]:
        if c["target"]["path"] != "rotation": continue
        s = an["samplers"][c["sampler"]]
        rot[c["target"]["node"]] = (c["sampler"], s["input"], g.acc(s["output"]).astype(np.float64), s.get("interpolation", "LINEAR"))
    def static_rot(n): return np.array(nodes[n].get("rotation", [0, 0, 0, 1]), float)
    for side, sgn in (("L", 1.0), ("R", -1.0)):
        u = name2node[f"{side}_Upperarm"]
        si, tin, vals, interp = rot[u]
        if interp != "LINEAR": raise SystemExit(f"unexpected interpolation {interp}")
        K = len(vals)
        # ancestors' world rotation per key (ancestors must share the input accessor or have no rotation channel)
        anc = []; n = parent.get(u)
        while n is not None: anc.append(n); n = parent.get(n)
        Pk = np.repeat(np.eye(3)[None], K, axis=0)
        for a in reversed(anc):  # root -> parent
            if a in rot:
                if rot[a][1] != tin: raise SystemExit(f"ancestor {nodes[a].get('name')} has different key times")
                Ra = np.array([quat_to_mat(q) for q in rot[a][2]])
            else:
                Ra = np.repeat(quat_to_mat(static_rot(a))[None], K, axis=0)
            Sa = np.diag(nodes[a].get("scale", [1, 1, 1]))  # static scale (animated scale keys are STEP ~1; ignored for rotation)
            Pk = Pk @ (Ra @ Sa)
        Roff = Rz(sgn * math.radians(deg))
        new = np.zeros_like(vals)
        for k in range(K):
            P = Pk[k]; Pn = P / np.cbrt(np.linalg.det(P))  # remove uniform scale
            Lq = quat_to_mat(vals[k])
            Lnew = np.linalg.inv(Pn) @ Roff @ Pn @ Lq
            q = mat_to_quat(Lnew)
            if q @ vals[k] < 0: q = -q  # keep hemisphere continuity with the original key
            new[k] = q
        idx = append_accessor(new, js["accessors"][an["samplers"][si]["output"]])
        an["samplers"][si]["output"] = idx
        ang = [math.degrees(2 * math.acos(min(1.0, abs(float(np.dot(new[k], vals[k])))))) for k in range(K)]
        report[f"{an.get('name')}:{side}_Upperarm"] = dict(keys=K, local_change_deg_min=round(min(ang), 4), local_change_deg_max=round(max(ang), 4))

js["buffers"][0]["byteLength"] = len(BIN)
js.setdefault("asset", {}).setdefault("extras", {})["StarRaiArmOffset"] = f"+{deg} deg upper-arm abduction added by apply_arm_offset.py (Issue #177 research)"
jb = json.dumps(js, separators=(",", ":")).encode()
while len(jb) % 4: jb += b" "
while len(BIN) % 4: BIN.append(0)
total = 12 + 8 + len(jb) + 8 + len(BIN)
out = struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(jb), b"JSON") + jb + struct.pack("<I4s", len(BIN), b"BIN\x00") + bytes(BIN)
open(outp, "wb").write(out)
print(json.dumps(dict(degrees=deg, input_bytes=len(raw), output_bytes=len(out), channels=report), indent=1))
