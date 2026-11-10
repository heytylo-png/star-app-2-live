#!/usr/bin/env python3
"""Verify the arm-offset GLB and screen its animations for collisions (Issue #177 research).
 1. Mesh/skin identity: POSITION, NORMAL, TEXCOORD_0, JOINTS_0, WEIGHTS_0, indices, inverseBindMatrices bytes equal.
 2. Edit correctness: at sampled key times, skinned vertices of OUT equal ORIGINAL posed + world-Z offset about the
    posed upper-arm joints (as in offset_sweep.py); report max deviation (% H).
 3. Collision screen with collide_v2's triangle test (non-adjacent and adjacent-far, new vs rest) at every STEP-th
    rotation key time of each animation.
Usage: python3 -I verify_and_screen.py ORIG.glb OUT.glb COLLIDE_V2_DIR GLBIO_DIR DEGREES STEP OUT.json
"""
import hashlib, json, math, sys
import numpy as np
orig, outg, cdir, gdir, deg, step, outj = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], float(sys.argv[5]), int(sys.argv[6]), sys.argv[7]
sys.path.insert(0, gdir)
from glbio import GLB, load_rig, trs

res = {}
A, B = GLB(orig), GLB(outg)
pa, pb = A.js["meshes"][0]["primitives"][0], B.js["meshes"][0]["primitives"][0]
same = {}
for k in ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"):
    same[k] = hashlib.sha256(A.acc(pa["attributes"][k]).tobytes()).hexdigest() == hashlib.sha256(B.acc(pb["attributes"][k]).tobytes()).hexdigest()
same["indices"] = np.array_equal(A.acc(pa["indices"]), B.acc(pb["indices"]))
same["inverseBindMatrices"] = np.array_equal(A.acc(A.js["skins"][0]["inverseBindMatrices"]), B.acc(B.js["skins"][0]["inverseBindMatrices"]))
same["nodes"] = A.js["nodes"] == B.js["nodes"]
changed = []
for ai, (aa, ab) in enumerate(zip(A.js["animations"], B.js["animations"])):
    for si, (sa, sb) in enumerate(zip(aa["samplers"], ab["samplers"])):
        if not np.array_equal(A.acc(sa["output"]), B.acc(sb["output"])):
            ch = [c for c in ab["channels"] if c["sampler"] == si][0]
            changed.append(f'{ab.get("name")}:{B.js["nodes"][ch["target"]["node"]].get("name")}:{ch["target"]["path"]}')
res["identity"] = same; res["changed_channels"] = changed

# load collide_v2 library parts against the OUT file, and a second copy against ORIG for the reference
src = open(f"{cdir}/collide_v2.py").read()
head = src.partition("\nres = dict(input=")[0]
anim_src = src[src.index("# animation\n"): src.index("frames = []")]
def lib(path, anim_index):
    sys.argv = ["collide_v2.py", path, gdir, "/dev/null"]
    ns = {"__name__": "lib"}
    exec(compile(head, "head", "exec"), ns)
    a_src = anim_src.replace('anim = js["animations"][0]', f'anim = js["animations"][{anim_index}]')
    exec(compile(a_src, "anim", "exec"), ns)
    return ns
H = None
res["animations"] = {}
for ai, an in enumerate(B.js["animations"]):
    L_out = lib(outg, ai); L_org = lib(orig, ai)
    if H is None: H = L_out["H"]
    rest, _ = L_out["collisions"](L_out["V"])
    times = B.acc(an["samplers"][[c for c in an["channels"] if c["target"]["path"] == "rotation"][0]["sampler"]]["input"]).astype(float)
    sel = times[::step]
    maxdev = 0.0; per_na = []; per_af = []; worst = None
    Z = np.array([0, 0, 1.0])
    for t in sel:
        Gm = L_out["world_at"](t); Vp = L_out["skin"](Gm)
        # reference: original pose + world-Z offset about posed upper-arm joints
        Go = L_org["world_at"](t).copy()
        for side, sgn in (("L", 1.0), ("R", -1.0)):
            j = L_org["idx"][f"{side}_Upperarm"]; c = Go[j, :3, 3].copy(); Rm = L_org["rod"](Z, sgn * math.radians(deg))
            M = np.eye(4); M[:3, :3] = Rm; M[:3, 3] = c - Rm @ c
            for s in L_org["subtree"](j): Go[s] = M @ Go[s]
        Vr = L_org["skin"](Go)
        maxdev = max(maxdev, float(np.abs(Vp - Vr).max()))
        col, _ = L_out["collisions"](Vp)
        new = {k: v for k, v in col.items() if k not in rest}
        na = sum(1 for v in new.values() if v[0] == "non-adjacent"); af = sum(1 for v in new.values() if v[0] == "adjacent-far")
        per_na.append(na); per_af.append(af)
        if worst is None or na > worst[1]:
            pairs = {}
            for v in new.values():
                if v[0] == "non-adjacent": pairs[v[1]] = pairs.get(v[1], 0) + 1
            worst = (round(float(t), 6), na, pairs)
    res["animations"][an.get("name")] = dict(keys=int(len(times)), sampled=int(len(sel)), step=step,
        edit_max_deviation_pctH=round(100 * maxdev / H, 8),
        non_adjacent_max=int(max(per_na)), frames_with_non_adjacent=int(sum(x > 0 for x in per_na)),
        adjacent_far_max=int(max(per_af)), frames_with_adjacent_far_over_20=int(sum(x > 20 for x in per_af)),
        worst=dict(t=worst[0], non_adjacent=worst[1], by_pair=worst[2]), per_frame_non_adjacent=per_na, per_frame_adjacent_far=per_af)
    print(an.get("name"), json.dumps({k: v for k, v in res["animations"][an.get("name")].items() if not k.startswith("per_frame")}), flush=True)
json.dump(res, open(outj, "w"), indent=1, sort_keys=True)
print(json.dumps(dict(identity=res["identity"], changed=res["changed_channels"])))
