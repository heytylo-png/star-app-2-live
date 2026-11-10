#!/usr/bin/env python3
"""EXPLORATORY (not frozen): how much extra upper-arm abduction removes arm/hand-into-leg collisions in an animation.
For each offset angle, every sampled frame is posed by the animation, then each Upperarm subtree is rotated by the
offset about the world Z axis at the posed Upperarm joint (left outward = +angle, right = -angle), skinned, and tested
with collide_v2's triangle-intersection routine. Reports max/mean new non-adjacent pairs over frames per offset.
Usage: python3 -I offset_sweep.py ANIM.glb COLLIDE_V2_DIR GLBIO_DIR OUT.json [n_frames=24]
"""
import json, math, sys, runpy, types
import numpy as np
glb, cdir, gdir, outf = sys.argv[1:5]; nfr = int(sys.argv[5]) if len(sys.argv) > 5 else 24
# load collide_v2 definitions without running its main body: execute up to the 'res = dict(' line
src = open(f"{cdir}/collide_v2.py").read()
head, sep, _ = src.partition("\nres = dict(input=")
anim_part = src[src.index("# animation\n"): src.index("frames = []")]
sys.argv = ["collide_v2.py", glb, gdir, "/dev/null"]
ns = {"__name__": "collide_v2_lib"}
exec(compile(head, "collide_v2_head", "exec"), ns)
rest, _ = ns["collisions"](ns["V"])
exec(compile(anim_part, "collide_v2_anim", "exec"), ns)
world_at, skin, collisions, subtree, idx = ns["world_at"], ns["skin"], ns["collisions"], ns["subtree"], ns["idx"]
rod, tmin, tmax = ns["rod"], ns["tmin"], ns["tmax"]
Z = np.array([0, 0, 1.0])
res = dict(note="EXPLORATORY offset sweep; not a frozen test", animation=ns["anim"].get("name"), n_frames=nfr, offsets={})
for off in (0, 5, 10, 15, 20, 25, 30):
    per = []
    for k in range(nfr):
        t = tmin + (tmax - tmin) * k / (nfr - 1)
        Gm = world_at(t).copy()
        for side, sgn in (("L", 1.0), ("R", -1.0)):
            j = idx[f"{side}_Upperarm"]; c = Gm[j, :3, 3].copy(); Rm = rod(Z, sgn * math.radians(off))
            M = np.eye(4); M[:3, :3] = Rm; M[:3, 3] = c - Rm @ c
            for s in subtree(j): Gm[s] = M @ Gm[s]
        col, _ = collisions(skin(Gm))
        new = {k2: v for k2, v in col.items() if k2 not in rest}
        per.append(sum(1 for v in new.values() if v[0] == "non-adjacent"))
    res["offsets"][str(off)] = dict(max=int(max(per)), mean=round(float(np.mean(per)), 1), frames_with_contact=int(sum(p > 0 for p in per)), per_frame=per)
    print(off, res["offsets"][str(off)]["max"], res["offsets"][str(off)]["frames_with_contact"], flush=True)
json.dump(res, open(outf, "w"), indent=1, sort_keys=True)
