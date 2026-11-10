#!/usr/bin/env python3
"""v10 retarget v1 (Issue #177), POST-HOC addendum A: evidence for three statements in REPORT.md that had no committed
output. Not part of the frozen method; changes no criterion or verdict. Read-only on all inputs. numpy only.
Compares, at every key, Tripo joint positions (converted to v10 axes and mm as in v10_compare.py @ 5b1265b: scaled by k
about the bind-pose ankle midpoint) with the retargeted v10 positions from the pose file written by retarget_v10.py.
Usage: python3 -I tripo_reference_check.py V10_BONES.json TRIPO.glb GLBIO_DIR POSE.json OUT.json
"""
import contextlib, hashlib, io, json, os, runpy, sys
import numpy as np
v10p, glb, gdir, posep, outf = sys.argv[1:6]
here = os.path.dirname(os.path.abspath(__file__)); sys.argv = ["retarget_v10.py", v10p, glb, gdir, os.devnull, os.devnull]
with contextlib.redirect_stdout(io.StringIO()): ns = runpy.run_path(os.path.join(here, "retarget_v10.py"))   # reuse its loader and sampler
world_all, tv, K, t_an, v_an = ns["world_all"], ns["tv"], ns["K"], ns["t_an"], ns["v_an"]
pose = json.load(open(posep))["main"]
def tp(W, j): return (tv(W[j][:3, 3]) - t_an) * K + v_an
rows = []
for f in pose:
    W = world_all(f["t"]); h = f["head"]; mid_t = tp(W, "Hip")[0]; mid_v = h["pelvis"][0]
    up = {s: tv(W[f"{s}_Forearm"][:3, 3] - W[f"{s}_Upperarm"][:3, 3]) for s in "LR"}
    down = {s: float(np.degrees(np.arccos(-up[s][2] / np.linalg.norm(up[s])))) for s in "LR"}
    rows.append(dict(t=f["t"], arms_down=bool(down["L"] <= 45 and down["R"] <= 45),
                     wrist_R_z=[round(float(tp(W, "R_Hand")[2]), 3), round(h["hand_right"][2], 3)],
                     wrist_lateral_L=[round(abs(float(tp(W, "L_Hand")[0]) - float(mid_t)), 3), round(abs(h["hand_left"][0] - mid_v), 3)],
                     wrist_lateral_R=[round(abs(float(tp(W, "R_Hand")[0]) - float(mid_t)), 3), round(abs(h["hand_right"][0] - mid_v), 3)],
                     ankle_z_L=[round(float(tp(W, "L_Foot")[2]), 3), round(h["foot_left"][2], 3)],
                     ankle_z_R=[round(float(tp(W, "R_Foot")[2]), 3), round(h["foot_right"][2], 3)]))
def col(k, i, sel=lambda r: True): return np.array([r[k][i] for r in rows if sel(r)])
ad = lambda r: r["arms_down"]; pk = max(rows, key=lambda r: r["wrist_R_z"][0]); pv = max(rows, key=lambda r: r["wrist_R_z"][1])
res = dict(note="POST-HOC addendum A; not part of the frozen method; no criterion or verdict changed", order="each pair is [Tripo scaled to v10 mm, v10 retarget]",
           pose_sha256=hashlib.sha256(open(posep, "rb").read()).hexdigest(), keys=len(rows), scale_mm_per_tripo_unit=round(K, 3),
           wrist_R_peak=dict(tripo=dict(z=pk["wrist_R_z"][0], t=pk["t"]), v10=dict(z=pv["wrist_R_z"][1], t=pv["t"]),
                             max_tripo_minus_v10=round(float((col("wrist_R_z", 0) - col("wrist_R_z", 1)).max()), 3)),
           arms_down=dict(rule="both Tripo upper arms within 45 deg of straight down", keys=int(sum(ad(r) for r in rows)),
                          wrist_lateral_from_pelvis_mm={s: dict(tripo_mean=round(float(col(f"wrist_lateral_{s}", 0, ad).mean()), 2), tripo_range=[float(col(f"wrist_lateral_{s}", 0, ad).min()), float(col(f"wrist_lateral_{s}", 0, ad).max())],
                                                                 v10_mean=round(float(col(f"wrist_lateral_{s}", 1, ad).mean()), 2), v10_range=[float(col(f"wrist_lateral_{s}", 1, ad).min()), float(col(f"wrist_lateral_{s}", 1, ad).max())]) for s in "LR"}),
           ankle_z_v10_minus_tripo_mm={s: dict(max_abs=round(float(np.abs(col(f"ankle_z_{s}", 1) - col(f"ankle_z_{s}", 0)).max()), 3), mean=round(float((col(f"ankle_z_{s}", 1) - col(f"ankle_z_{s}", 0)).mean()), 3),
                                               tripo_range=[float(col(f"ankle_z_{s}", 0).min()), float(col(f"ankle_z_{s}", 0).max())], v10_range=[float(col(f"ankle_z_{s}", 1).min()), float(col(f"ankle_z_{s}", 1).max())]) for s in "LR"},
           per_key=rows)
json.dump(res, open(outf, "w"), indent=1, sort_keys=True); print(json.dumps({k: v for k, v in res.items() if k != "per_key"}, indent=1))
