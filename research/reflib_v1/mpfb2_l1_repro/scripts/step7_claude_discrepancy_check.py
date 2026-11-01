#!/usr/bin/env python3
"""L1 repro step 7 (supplementary, derived arithmetic only): recompute from the REGENERATED outputs the quantities behind Claude's review discrepancies D1-D3.
usage: step7_claude_discrepancy_check.py <run_outputs_dir> <out_json>"""
import sys, os, json, csv
run, outp = sys.argv[1:3]
R = {r["ratio"]: r for r in csv.DictReader(open(os.path.join(run, "compare_ratios.csv")))}
f = lambda row, col: float(R[row][col])
out = {}
mp = ["mpfb2_mesh_bodytop", "mpfb2_mesh_cubes", "mpfb2_default_position"]
for row, key in (("head_length/S", "D1_head_ratio"), ("ankle_height_over_sole/S", "D1_ankle_ratio")):
    d = {}
    for sr in ("starrai_v8_3", "starrai_v10"):
        v = [f(row, sr) / f(row, m) for m in mp]
        d[sr] = dict(min=min(v), max=max(v), pct_min=(min(v) - 1) * 100, pct_max=(max(v) - 1) * 100)
    out[key] = d
cf = json.load(open(os.path.join(run, "coordinates_foot.json")))
out["D2_ankle_height_cm"] = dict(sole_plane_under_recomputed_ankle_default_position_field=cf["sole_plane"]["ankle_height_above_sole_m_default_position"] * 100,
    foot_tail_height_vs_sole_default_position_field=cf["foot_tail_height_vs_sole"]["game_engine_foot_l_default"]["ankle_height_above_sole_m"] * 100)
out["D5_sole_plane_lateral_tilt_deg"] = __import__("math").degrees(__import__("math").atan(cf["sole_plane"]["plane_dz_dx"]))
w = json.load(open(os.path.join(run, "weight_falloff_summary.json")))["default"]
out["D3_default_blend_width_cm_left_vs_right"] = {j: dict(left=w[j + "_l"]["blend_width_10_90_m"] * 100, right=w[j + "_r"]["blend_width_10_90_m"] * 100,
        t10_left=w[j + "_l"]["t10_m"] * 100, t10_right=w[j + "_r"]["t10_m"] * 100) for j in ("shoulder", "elbow", "hip", "knee")}
json.dump(out, open(outp, "w"), indent=1); print(json.dumps(out, indent=1))
