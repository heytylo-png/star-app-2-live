#!/usr/bin/env python3
"""Independent check of arm_fade_v1 (Issue #177 review). Uses collide_v2.py @19d405f (world_at, skin, collisions).
Usage: python3 -I indep_check.py ORIG.glb FADE.glb COLLIDE_V2_DIR GLBIO_DIR STEP OUT.json"""
import json, math, sys
import numpy as np
orig, fade, cdir, gdir, step, outj = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], int(sys.argv[5]), sys.argv[6]
sys.path.insert(0, gdir)
from glbio import GLB
src = open(f"{cdir}/collide_v2.py").read()
head = src.partition("\nres = dict(input=")[0]; anim_src = src[src.index("# animation\n"): src.index("frames = []")]
def lib(path, ai):
    sys.argv = ["collide_v2.py", path, gdir, "/dev/null"]; ns = {"__name__": "lib"}
    exec(compile(head, "head", "exec"), ns)
    exec(compile(anim_src.replace('anim = js["animations"][0]', f'anim = js["animations"][{ai}]'), "anim", "exec"), ns); return ns
G = GLB(fade); res = {}
for ai, an in enumerate(G.js["animations"]):
    F, O = lib(fade, ai), lib(orig, ai); H = F["H"]; idx = F["idx"]
    ch = [c for c in an["channels"] if c["target"]["node"] == idx["L_Upperarm"] and c["target"]["path"] == "rotation"][0]
    T = G.acc(an["samplers"][ch["sampler"]]["input"]).astype(float)
    rest, _ = F["collisions"](F["V"])
    rows = []
    for k, t in enumerate(T):
        Gf, Go = F["world_at"](t), O["world_at"](t)
        d = Go[idx["R_Forearm"], :3, 3] - Go[idx["R_Upperarm"], :3, 3]; d /= np.linalg.norm(d)
        th = math.degrees(math.acos(max(-1, min(1, -d[1]))))
        hand = float(np.linalg.norm(Gf[idx["R_Hand"], :3, 3] - Go[idx["R_Hand"], :3, 3])) / H * 100
        row = dict(t=round(float(t), 4), R_theta=round(th, 2), R_hand_pctH=round(hand, 4))
        if k % step == 0:
            col, _ = F["collisions"](F["skin"](Gf)); new = [v for kk, v in col.items() if kk not in rest]
            row["non_adjacent"] = sum(v[0] == "non-adjacent" for v in new); row["adjacent_far"] = sum(v[0] == "adjacent-far" for v in new)
        rows.append(row)
    def win(a, b):
        r = [x for x in rows if a - 1e-6 <= x["t"] <= b + 1e-6]
        return dict(keys=len(r), over=sum(x["R_hand_pctH"] > 0.5 for x in r), max_pctH=max(x["R_hand_pctH"] for x in r))
    sc = [x for x in rows if "non_adjacent" in x]
    res[an.get("name")] = dict(H=H, keys=len(T), screened=len(sc), non_adjacent_max=max(x["non_adjacent"] for x in sc),
        adjacent_far_max=max(x["adjacent_far"] for x in sc),
        windows={"2.6-4.2(frozen)": win(2.6, 4.2), "2.85-4.0": win(2.85, 4.0), "raised(theta>=90)": None}, rows=rows)
    up = [x for x in rows if x["R_theta"] >= 90]
    if up: res[an.get("name")]["windows"]["raised(theta>=90)"] = dict(t0=up[0]["t"], t1=up[-1]["t"], **win(up[0]["t"], up[-1]["t"]))
    print(an.get("name"), json.dumps({k: v for k, v in res[an.get("name")].items() if k != "rows"}), flush=True)
json.dump(res, open(outj, "w"), indent=1, sort_keys=True)
