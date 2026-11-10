#!/usr/bin/env python3
"""Independent checks of BlendBro's bv9 camera-scale verification v1 (Issue #177).

Input (committed, read-only): research/issue-177/bv9_camera_scale_v1/ at commit
9939d1829b9d2c0ce9e21f73110d8b401bb1ad23 (branch research/issue-177-camera-scale-v1).
Reference pixels, masks and geometry are NOT committed; everything here is recomputed from the committed
JSON outputs and the frozen method text. Python 3 stdlib only.
Usage: python3 -I reproduce_camera_scale_review.py STUDY_DIR > camera_scale_review_output.json
"""
import hashlib, json, os, re, sys

D = sys.argv[1]
J = lambda p: json.load(open(os.path.join(D, p)))
out = {}

# 1. manifest
n = ok = 0; bad = []
for line in open(os.path.join(D, "MANIFEST_sha256.txt")):
    m = re.match(r"^([0-9a-f]{64})\s+\.?/?(\S+)\s*$", line.strip())
    if not m: continue
    n += 1; h, p = m.groups()
    (bad.append(p) if hashlib.sha256(open(os.path.join(D, p), "rb").read()).hexdigest() != h else None); ok += hashlib.sha256(open(os.path.join(D, p), "rb").read()).hexdigest() == h
sha = lambda p: hashlib.sha256(open(os.path.join(D, p), "rb").read()).hexdigest()
out["manifest"] = dict(entries=n, match=int(ok), mismatches=bad, manifest_sha256=sha("MANIFEST_sha256.txt"),
                       frozen_method_sha256=sha("METHOD_AND_CRITERIA_FROZEN.md"))

# 2. run1 vs run2 (ignoring the run label and wall-clock keys)
def flat(o, p=""):
    r = {}
    if isinstance(o, dict):
        for k, v in o.items():
            if k == "run" or any(s in k.lower() for s in ("second", "elapsed", "wall")): continue
            r.update(flat(v, f"{p}/{k}"))
    elif isinstance(o, list):
        for i, v in enumerate(o): r.update(flat(v, f"{p}[{i}]"))
    else: r[p] = o
    return r
out["reproducibility"] = {s: flat(J(f"data/{s}_run1.json")) == flat(J(f"data/{s}_run2.json"))
                          for s in ("step12", "step4_recal_sign", "exploratory_width", "c09_measure_baseline")}

# 3. step 1 recomputation from committed per-image rows
S = J("data/step12_run1.json")
L = S["model"]["sole_to_crown_mm"]
img = {r["view"]: r for r in S["per_image"]}
H = {v: img[v]["H_px_D1"] for v in ("front", "side", "back")}
u = {v: img[v]["detection_uncertainty_px"] for v in ("side", "back")}
s = {v: H[v] / L for v in ("side", "back")}
s["front_via_D3"] = s["back"] * S["D3_width_mirror"]["r_fb"]
mean_sb = (s["side"] + s["back"]) / 2
sb_spread = (s["side"] - s["back"]) / mean_sb * 100
vals3 = [s["front_via_D3"], s["side"], s["back"]]
spread3 = (max(vals3) - min(vals3)) / (sum(vals3) / 3) * 100
u_rel = max(u[v] / H[v] for v in ("side", "back"))
d3cost = S["D3_width_mirror"]["cost_at_r_fb_px"]; rcr = S["D4_crotch"]["r_crotch"]; rfb = S["D3_width_mirror"]["r_fb"]
gates = dict(spread_le_1pct=spread3 <= 1.0, D3_D4_agree_1pct=abs(rfb - rcr) / rfb <= 0.01, D3_cost_le_2px=d3cost <= 2.0)
if all(gates.values()): verdict = "SHARED"
elif spread3 > 1.0 + 200 * u_rel and gates["D3_cost_le_2px"] and gates["D3_D4_agree_1pct"]: verdict = "NOT SHARED"
else: verdict = "NOT VERIFIABLE (inconclusive)"
cost_curve = S["D3_width_mirror"]["cost_curve"]; cmin = min(cost_curve, key=lambda t: t[1])
out["step1"] = dict(sole_to_crown_mm=L, H_px=H, px_per_mm={k: round(v, 4) for k, v in s.items()},
                    modeL_front_equals_mean_side_back=abs(S["validation_cameras"]["front"]["modeL_s"] - mean_sb) < 1e-9,
                    side_back_spread_pct=round(sb_spread, 3), three_view_spread_pct=round(spread3, 3), u_rel_pct=round(100 * u_rel, 3),
                    not_shared_threshold_pct=round(1.0 + 200 * u_rel, 3), D3_r_fb=rfb, D3_cost_px=round(d3cost, 2),
                    D3_cost_at_1=round(S["D3_width_mirror"]["cost_at_1_px"], 2), D3_grid_min=cmin, D4_r_crotch=round(rcr, 4),
                    gates=gates, verdict_recomputed=verdict, verdict_committed=S["scale"]["verdict"])

# 4. reviewer addition: are Mode-F per-view scale RATIOS consistent with the references' own figure heights?
#    Model-independent: the model's sole-to-crown height cancels in ratios. Only assumption: the same figure has the
#    same sole-to-crown height in the side and back drawings (and the drawings share one scale).
vc = S["validation_cameras"]
ref_ratio_side_back = H["side"] / H["back"]
modeF_ratio_side_back = vc["side"]["modeF_s"] / vc["back"]["modeF_s"]
modeL_ratio_side_back = vc["side"]["modeL_s"] / vc["back"]["modeL_s"]
implied_H_modeF = {v: round(vc[v]["modeF_s"] * L, 1) for v in ("side", "back")}
out["reviewer_ratio_test"] = dict(
    reference_height_ratio_side_over_back=round(ref_ratio_side_back, 4),
    modeF_scale_ratio_side_over_back=round(modeF_ratio_side_back, 4),
    modeL_scale_ratio_side_over_back=round(modeL_ratio_side_back, 4),
    modeF_minus_reference_pct=round((modeF_ratio_side_back / ref_ratio_side_back - 1) * 100, 2),
    detection_uncertainty_ratio_pct=round(100 * (u["side"] / H["side"] + u["back"] / H["back"]), 3),
    modeF_implied_figure_height_px=implied_H_modeF, reference_measured_height_px={v: H[v] for v in ("side", "back")},
    modeF_front_over_back=round(vc["front"]["modeF_s"] / vc["back"]["modeF_s"], 4), D3_r_fb=rfb)

# 5. crop
c = S["crop"]
out["step2"] = dict(front_class=c["front_class"], contour_px_on_top_edge=c["front_contour_px_on_top_edge"],
                    rule_cropped=(img["front"]["top_row_D1"] == 0 and c["front_fg_px_rows0to4"][0] >= 10),
                    side_back_top_rows=[img["side"]["top_row_D1"], img["back"]["top_row_D1"]],
                    implemented_modeL_bias_pct=c["implemented_modeL_front_scale_bias_pct"],
                    crown_based_front_scale=round(H["front"] / L, 4),
                    bias_vs_mean_side_back_pct=round((H["front"] / L / mean_sb - 1) * 100, 2),
                    bias_vs_D3_front_pct=round((H["front"] / L / s["front_via_D3"] - 1) * 100, 2),
                    predicted_skull_row_recomputed=round(img["front"]["sole_row_D1"] - rfb * H["back"], 1),
                    predicted_skull_row_committed=c["predicted_front_bald_skull_top_row"],
                    note="prediction uses r_fb from the failed D3 estimator -> INFERRED only")

# 6. step 4
s4 = J("data/step4_recal_sign_run1.json")
def summ(block):
    return {k: dict(value=v["value"], deltas=[(x["cond"], x["name"], round(x["delta"], 4)) for x in v["components"]]) for k, v in block.items()}
retro = summ(s4["retrospective_committed"])
consistent = {}
for k, v in retro.items():
    comps = {}
    for cond, name, d in v["deltas"]: comps.setdefault(name, {})[cond] = d
    exp = all(abs(x.get("P", 0)) > 1e-9 and abs(x.get("R", 0)) > 1e-9 and (x["P"] > 0) == (x["R"] > 0) for x in comps.values())
    consistent[k] = (exp == v["value"])
out["step4"] = dict(baseline_vs_itself={k: v["value"] for k, v in s4["baseline_vs_itself"].items()},
                    retrospective=retro, value_consistent_with_frozen_definition=consistent)
cmp_ = J("data/c09_baseline_comparison.json")
out["c09_fresh_vs_committed_baseline"] = {k: v for k, v in cmp_.items() if not isinstance(v, (dict, list))} if isinstance(cmp_, dict) else cmp_
json.dump(out, sys.stdout, indent=1, default=str)
print()
