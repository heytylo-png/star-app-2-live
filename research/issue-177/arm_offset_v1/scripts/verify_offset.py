#!/usr/bin/env python3
"""Verify an arm-offset GLB against its source (Issue #177). EXPLORATORY verification, not a frozen test.
 1 Byte diff: every differing byte must lie inside the rotation output accessors of L_Upperarm / R_Upperarm.
 2 Static data: JSON chunk, POSITION, NORMAL, JOINTS_0, WEIGHTS_0, indices, inverse bind matrices compared.
 3 Equivalence: at every rotation key time and every midpoint between keys, skin the output file and compare with
    the reference construction of offset_sweep.py (source pose, then each Upperarm subtree rotated by the angle about
    world Z at the posed joint). Reports the max vertex distance, in model units and as % of height H.
 4 Dense screen: collide_v2's intersection routine at every rotation key time of each animation (new pairs vs rest).
Usage: python3 -I verify_offset.py SRC.glb OUT.glb COLLIDE_V2_DIR GLBIO_DIR REPORT.json [angle_deg=20] [anim_index=all]
(one animation per process keeps the run time manageable; steps 1 and 2 are repeated in each report)
"""
import hashlib, json, math, struct, sys
import numpy as np
src, out, cdir, gdir, repf = sys.argv[1:6]; ANG = float(sys.argv[6]) if len(sys.argv) > 6 else 20.0
ONLY = int(sys.argv[7]) if len(sys.argv) > 7 else None
sys.path.insert(0, gdir)
from glbio import GLB
a, b = open(src, "rb").read(), open(out, "rb").read()
gs, go = GLB(src), GLB(out); js = gs.js
rep = dict(note="EXPLORATORY verification; not a frozen test", angle_deg=ANG,
           source_sha256=hashlib.sha256(a).hexdigest(), output_sha256=hashlib.sha256(b).hexdigest())
# 1 byte diff
cl = struct.unpack("<I", a[12:16])[0]; BIN0 = 20 + cl + 8
names = [n.get("name") for n in js["nodes"]]; arm = {names.index("L_Upperarm"), names.index("R_Upperarm")}
allowed = []
for an in js["animations"]:
    for c in an["channels"]:
        if c["target"]["node"] in arm and c["target"]["path"] == "rotation":
            ac = js["accessors"][an["samplers"][c["sampler"]]["output"]]; bv = js["bufferViews"][ac["bufferView"]]
            o = BIN0 + bv.get("byteOffset", 0) + ac.get("byteOffset", 0); allowed.append((o, o + 16 * ac["count"]))
A, Bb = np.frombuffer(a, np.uint8), np.frombuffer(b, np.uint8)
same_len = len(a) == len(b); d = np.nonzero(A != Bb)[0] if same_len else None
inside = np.zeros(len(d), bool)
for lo, hi in allowed: inside |= (d >= lo) & (d < hi)
rep["byte_diff"] = dict(same_length=same_len, length=len(b), differing_bytes=int(len(d)), allowed_ranges=sorted(allowed),
                        allowed_bytes=int(sum(h - l for l, h in allowed)), differing_bytes_outside_allowed=int((~inside).sum()))
# 2 static data
p = js["meshes"][0]["primitives"][0]; sk = js["skins"][0]
st = dict(json_chunk_identical=a[20:20 + cl] == b[20:20 + cl])
for k, i in [(k, v) for k, v in sorted(p["attributes"].items())] + [("indices", p["indices"]), ("inverseBindMatrices", sk["inverseBindMatrices"])]:
    st[k + "_identical"] = bool(np.array_equal(gs.acc(i), go.acc(i)))
st["joints"] = len(sk["joints"]); st["nodes"] = len(js["nodes"])
rep["static_data"] = st

def lib(glb, anim_index):
    """collide_v2 definitions bound to one animation of one file (same loader trick as offset_sweep.py)."""
    code = open(f"{cdir}/collide_v2.py").read()
    head = code.partition("\nres = dict(input=")[0]
    part = code[code.index("# animation\n"): code.index("frames = []")].replace('js["animations"][0]', f'js["animations"][{anim_index}]')
    sys.argv = ["collide_v2.py", glb, gdir, "/dev/null"]; ns = {"__name__": "collide_v2_lib"}
    exec(compile(head, "collide_v2_head", "exec"), ns); exec(compile(part, "collide_v2_anim", "exec"), ns); return ns
Z = np.array([0, 0, 1.0]); rep["animations"] = []
for ai, an in enumerate(js["animations"]):
    if ONLY is not None and ai != ONLY: continue
    S, O = lib(src, ai), lib(out, ai); H = S["H"]; idx = S["idx"]
    rest, _ = O["collisions"](O["V"])
    n = names.index("L_Upperarm")
    tk = [gs.acc(an["samplers"][c["sampler"]]["input"]).astype(float) for c in an["channels"] if c["target"]["node"] == n and c["target"]["path"] == "rotation"][0]
    def ref(t):
        Gm = S["world_at"](t).copy()
        for side, sgn in (("L", 1.0), ("R", -1.0)):
            j = idx[f"{side}_Upperarm"]; c = Gm[j, :3, 3].copy(); Rm = S["rod"](Z, sgn * math.radians(ANG))
            M = np.eye(4); M[:3, :3] = Rm; M[:3, 3] = c - Rm @ c
            for s in S["subtree"](j): Gm[s] = M @ Gm[s]
        return S["skin"](Gm)
    ek = em = 0.0; per = []; worst = None
    for k, t in enumerate(tk):
        Vo = O["skin"](O["world_at"](float(t)))
        ek = max(ek, float(np.linalg.norm(Vo - ref(float(t)), axis=1).max()))
        col, _ = O["collisions"](Vo); new = {q: v for q, v in col.items() if q not in rest}
        na = sum(1 for v in new.values() if v[0] == "non-adjacent"); af = sum(1 for v in new.values() if v[0] == "adjacent-far")
        per.append((na, af))
        if k + 1 < len(tk):
            tm = float(0.5 * (t + tk[k + 1]))
            em = max(em, float(np.linalg.norm(O["skin"](O["world_at"](tm)) - ref(tm), axis=1).max()))
    r = dict(name=an.get("name"), rotation_keys=int(len(tk)), t_range=[round(float(tk[0]), 6), round(float(tk[-1]), 6)],
             equivalence=dict(max_vertex_dist_at_keys=float(f"{ek:.3e}"), max_vertex_dist_at_midpoints=float(f"{em:.3e}"),
                              pct_H_at_keys=float(f"{ek / H * 100:.3e}"), pct_H_at_midpoints=float(f"{em / H * 100:.3e}")),
             dense_screen=dict(frames=int(len(per)), frames_with_new_non_adjacent=int(sum(x[0] > 0 for x in per)), max_new_non_adjacent=int(max(x[0] for x in per)),
                               frames_with_new_adjacent_far=int(sum(x[1] > 0 for x in per)), max_new_adjacent_far=int(max(x[1] for x in per))))
    rep["animations"].append(r); print(json.dumps(r), flush=True)
json.dump(rep, open(repf, "w"), indent=1, sort_keys=True)
print(json.dumps({k: rep[k] for k in ("byte_diff", "static_data")}))
