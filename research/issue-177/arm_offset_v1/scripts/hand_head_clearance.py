#!/usr/bin/env python3
"""EXPLORATORY: minimum distance between hand and head vertices over an animation, plus hand position relative to
the face, to quantify how a world-Z arm offset moves a RAISED hand (Issue #177). Not a frozen test.
Usage: python3 -I hand_head_clearance.py FILE.glb ANIM_INDEX COLLIDE_V2_DIR GLBIO_DIR OUT.json [stride=2]
"""
import json, sys
import numpy as np
from scipy.spatial import cKDTree
glb, ai, cdir, gdir, outf = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5]; stride = int(sys.argv[6]) if len(sys.argv) > 6 else 2
code = open(f"{cdir}/collide_v2.py").read()
head = code.partition("\nres = dict(input=")[0]
part = code[code.index("# animation\n"): code.index("frames = []")].replace('js["animations"][0]', f'js["animations"][{ai}]')
sys.argv = ["collide_v2.py", glb, gdir, "/dev/null"]; ns = {"__name__": "collide_v2_lib"}
exec(compile(head, "h", "exec"), ns); exec(compile(part, "a", "exec"), ns)
vg, GROUPS, H = ns["vg"], ns["GROUPS"], ns["H"]
hd = vg == GROUPS.index("head"); res = dict(note="EXPLORATORY; not a frozen test", animation=ns["anim"].get("name"), H=round(H, 6), hands={})
times = sorted(set(float(t) for v in ns["chan"].values() for t in v[0]))[::stride]
for side in ("L", "R"):
    hm = vg == GROUPS.index(f"{side}_hand"); best = None; front = 0
    for t in times:
        Vp = ns["skin"](ns["world_at"](t)); d, _ = cKDTree(Vp[hd]).query(Vp[hm]); m = float(d.min())
        hc = Vp[hm].mean(0); hb = Vp[hd]
        # hand centroid inside the head's x/y silhouette box and in front of the head centroid (+Z) = covering the face
        cover = bool(hb[:, 0].min() <= hc[0] <= hb[:, 0].max() and hb[:, 1].min() <= hc[1] <= hb[:, 1].max() and hc[2] > hb[:, 2].mean())
        front += cover
        if best is None or m < best[0]: best = (m, t)
    res["hands"][side] = dict(min_dist=round(best[0], 6), min_dist_pctH=round(best[0] / H * 100, 3), t_at_min=round(best[1], 4),
                              frames_sampled=len(times), frames_hand_centroid_in_front_of_head=int(front))
json.dump(res, open(outf, "w"), indent=1, sort_keys=True); print(json.dumps(res))
