#!/usr/bin/env python3
"""Arm fade v1 (Issue #177): evaluate FADE_DEFINITION_AND_CRITERIA_FROZEN.md criteria C1 and C2 for ONE animation,
plus the pre-registered reported quantities. The fade weight is recomputed here independently of apply_arm_fade.py,
from collide_v2's own pose sampler.
Usage: python3 -I verify_fade.py SRC.glb FADED.glb UNFADED20.glb COLLIDE_V2_DIR GLBIO_DIR OUT.json ANIM_INDEX [angle_deg=20]
"""
import hashlib, json, math, struct, sys
import numpy as np
src, out, unf, cdir, gdir, repf, ai = sys.argv[1:8]; ai = int(ai); ANG = float(sys.argv[8]) if len(sys.argv) > 8 else 20.0
sys.path.insert(0, gdir)
from glbio import GLB
a, b = open(src, "rb").read(), open(out, "rb").read(); gs, go = GLB(src), GLB(out); js = gs.js
rep = dict(angle_deg=ANG, source_sha256=hashlib.sha256(a).hexdigest(), faded_sha256=hashlib.sha256(b).hexdigest(),
           unfaded_sha256=hashlib.sha256(open(unf, "rb").read()).hexdigest())
cl = struct.unpack("<I", a[12:16])[0]; BIN0 = 20 + cl + 8
names = [n.get("name") for n in js["nodes"]]; arm = {names.index("L_Upperarm"), names.index("R_Upperarm")}; allowed = []
for an in js["animations"]:
    for c in an["channels"]:
        if c["target"]["node"] in arm and c["target"]["path"] == "rotation":
            ac = js["accessors"][an["samplers"][c["sampler"]]["output"]]; bv = js["bufferViews"][ac["bufferView"]]
            o = BIN0 + bv.get("byteOffset", 0) + ac.get("byteOffset", 0); allowed.append((o, o + 16 * ac["count"]))
A, Bb = np.frombuffer(a, np.uint8), np.frombuffer(b, np.uint8); d = np.nonzero(A != Bb)[0]; inside = np.zeros(len(d), bool)
for lo, hi in allowed: inside |= (d >= lo) & (d < hi)
rep["byte_diff"] = dict(same_length=len(a) == len(b), length=len(b), differing_bytes=int(len(d)), allowed_bytes=int(sum(h - l for l, h in allowed)),
                        differing_bytes_outside_allowed=int((~inside).sum()))
p = js["meshes"][0]["primitives"][0]; sk = js["skins"][0]; st = dict(json_chunk_identical=a[20:20 + cl] == b[20:20 + cl])
for k, i in sorted(p["attributes"].items()) + [("indices", p["indices"]), ("inverseBindMatrices", sk["inverseBindMatrices"])]:
    st[k + "_identical"] = bool(np.array_equal(gs.acc(i), go.acc(i)))
rep["static_data"] = st

def lib(glb):
    code = open(f"{cdir}/collide_v2.py").read(); head = code.partition("\nres = dict(input=")[0]
    part = code[code.index("# animation\n"): code.index("frames = []")].replace('js["animations"][0]', f'js["animations"][{ai}]')
    sys.argv = ["collide_v2.py", glb, gdir, "/dev/null"]; ns = {"__name__": "collide_v2_lib"}
    exec(compile(head, "collide_v2_head", "exec"), ns); exec(compile(part, "collide_v2_anim", "exec"), ns); return ns
S, O, U = lib(src), lib(out), lib(unf); H = S["H"]; idx = S["idx"]; an = js["animations"][ai]; Z = np.array([0, 0, 1.0])
rest, _ = O["collisions"](O["V"])
n = names.index("L_Upperarm")
tk = [gs.acc(an["samplers"][c["sampler"]]["input"]).astype(float) for c in an["channels"] if c["target"]["node"] == n and c["target"]["path"] == "rotation"][0]
def weight(Gm, side):
    dv = Gm[idx[f"{side}_Forearm"], :3, 3] - Gm[idx[f"{side}_Upperarm"], :3, 3]; dv = dv / np.linalg.norm(dv)
    th = math.degrees(math.acos(max(-1.0, min(1.0, float(-dv[1])))))
    x = (90.0 - th) / 45.0; return th, (1.0 if th <= 45.0 else 0.0 if th >= 90.0 else x * x * (3 - 2 * x))
def ref(Gsrc):
    Gm = Gsrc.copy(); tw = {}
    for side, sgn in (("L", 1.0), ("R", -1.0)):
        th, w = weight(Gsrc, side); tw[side] = (th, w)
        j = idx[f"{side}_Upperarm"]; c = Gm[j, :3, 3].copy(); Rm = S["rod"](Z, sgn * w * math.radians(ANG))
        M = np.eye(4); M[:3, :3] = Rm; M[:3, 3] = c - Rm @ c
        for s in S["subtree"](j): Gm[s] = M @ Gm[s]
    return S["skin"](Gm), tw
rh = S["vg"] == S["GROUPS"].index("R_hand"); jh = idx["R_Hand"]
keys = []; ek = em = eu = 0.0
for k, t in enumerate(tk):
    t = float(t); Gs = S["world_at"](t); Go = O["world_at"](t); Vo = O["skin"](Go); Vr, tw = ref(Gs)
    ek = max(ek, float(np.linalg.norm(Vo - Vr, axis=1).max()))
    eu = max(eu, float(np.linalg.norm(Vo - U["skin"](U["world_at"](t)), axis=1).max()))
    col, _ = O["collisions"](Vo); new = [v for q, v in col.items() if q not in rest]
    keys.append(dict(t=round(t, 6), theta_L=round(tw["L"][0], 3), w_L=round(tw["L"][1], 6), theta_R=round(tw["R"][0], 3), w_R=round(tw["R"][1], 6),
                     new_non_adjacent=sum(1 for v in new if v[0] == "non-adjacent"), new_adjacent_far=sum(1 for v in new if v[0] == "adjacent-far"),
                     R_Hand_joint_dist=float(np.linalg.norm(Go[jh, :3, 3] - Gs[jh, :3, 3])),
                     R_hand_vertex_dist_max=float(np.linalg.norm(Vo[rh] - S["skin"](Gs)[rh], axis=1).max())))
    if k + 1 < len(tk):
        tm = float(0.5 * (t + tk[k + 1])); em = max(em, float(np.linalg.norm(O["skin"](O["world_at"](tm)) - ref(S["world_at"](tm))[0], axis=1).max()))
rep["animation"] = an.get("name"); rep["H"] = round(H, 6); rep["rotation_keys"] = len(keys)
rep["C1"] = dict(rule="0 new non-adjacent pairs at every key", keys=len(keys), keys_with_new_non_adjacent=sum(x["new_non_adjacent"] > 0 for x in keys),
                 max_new_non_adjacent=max(x["new_non_adjacent"] for x in keys), holds=all(x["new_non_adjacent"] == 0 for x in keys))
rep["adjacent_far"] = dict(keys_with_new=sum(x["new_adjacent_far"] > 0 for x in keys), max_new=max(x["new_adjacent_far"] for x in keys))
rep["weights"] = {s: dict(w_min=min(x[f"w_{s}"] for x in keys), w_max=max(x[f"w_{s}"] for x in keys),
                          t_partial=[x["t"] for x in keys if 0 < x[f"w_{s}"] < 1], keys_w0=sum(x[f"w_{s}"] == 0 for x in keys)) for s in ("L", "R")}
rep["equivalence"] = dict(max_vertex_dist_at_keys=float(f"{ek:.3e}"), pct_H_at_keys=float(f"{ek / H * 100:.3e}"),
                          max_vertex_dist_at_midpoints=float(f"{em:.3e}"), pct_H_at_midpoints=float(f"{em / H * 100:.3e}"))
rep["vs_unfaded_20"] = dict(max_vertex_dist_at_keys=float(f"{eu:.3e}"), pct_H=float(f"{eu / H * 100:.3e}"))
if "greet_02" in (an.get("name") or ""):
    TH = 0.005 * H; win = [x for x in keys if 2.6 <= x["t"] <= 4.2]; ok = [x["R_Hand_joint_dist"] <= TH for x in win]
    best = (0, None, None); i = 0
    while i < len(win):
        if ok[i]:
            j = i
            while j + 1 < len(win) and ok[j + 1]: j += 1
            if j - i + 1 > best[0]: best = (j - i + 1, win[i]["t"], win[j]["t"])
            i = j + 1
        else: i += 1
    worst = max(win, key=lambda x: x["R_Hand_joint_dist"])
    rep["C2"] = dict(rule="R_Hand joint within 0.5 % H of source at every key with 2.6 <= t <= 4.2", threshold=round(TH, 6), keys_in_window=len(win),
                     keys_over_threshold=int(sum(not o for o in ok)), max_dist=round(worst["R_Hand_joint_dist"], 6),
                     max_dist_pct_H=round(worst["R_Hand_joint_dist"] / H * 100, 4), t_at_max=worst["t"], holds=all(ok),
                     longest_passing_subinterval=dict(keys=best[0], t_start=best[1], t_end=best[2]),
                     window_start=dict(t=win[0]["t"], theta_R=win[0]["theta_R"], w_R=win[0]["w_R"]), window_end=dict(t=win[-1]["t"], theta_R=win[-1]["theta_R"], w_R=win[-1]["w_R"]),
                     vertex_cross_check=dict(max_R_hand_vertex_dist_pct_H=round(max(x["R_hand_vertex_dist_max"] for x in win) / H * 100, 4),
                                             keys_over_threshold=int(sum(x["R_hand_vertex_dist_max"] > TH for x in win))))
for x in keys: x["R_Hand_joint_dist"] = float(f"{x['R_Hand_joint_dist']:.6e}"); x["R_hand_vertex_dist_max"] = float(f"{x['R_hand_vertex_dist_max']:.6e}")
rep["per_key"] = keys
json.dump(rep, open(repf, "w"), indent=1, sort_keys=True)
print(json.dumps({k: v for k, v in rep.items() if k != "per_key"}))
