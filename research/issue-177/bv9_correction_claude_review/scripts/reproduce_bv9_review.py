#!/usr/bin/env python3
"""Independent checks of BlendBro's bv9 correction study v1 (Issue #177).

Input (committed, read-only): research/issue-177/bv9_correction_study_v1/ at commit
5a75023d974d1741fbdff3f9ef41f5cc5f707c43 (branch research/bv9-correction-study-v1).
No .blend, no mesh export, no reference pixels (none are committed). Python 3 stdlib + numpy.
The pre-registered verdict rule is re-implemented here from CORRECTION_STUDY_PREREGISTRATION_FROZEN.md
and AMENDMENT_B1_FROZEN.md text; scripts/c14_evaluate.py was read for field names only.

Usage: python3 -I reproduce_bv9_review.py STUDY_DIR > bv9_review_output.json
"""
import hashlib, json, math, os, re, sys
import numpy as np

D = sys.argv[1]
J = lambda p: json.load(open(os.path.join(D, p)))
out = {}

# ---- 1. manifest -------------------------------------------------------------------------
ok, bad, n = 0, [], 0
for line in open(os.path.join(D, "MANIFEST_sha256.txt")):
    m = re.match(r"^([0-9a-f]{64})\s+\.?/?(\S+)\s*$", line.strip())
    if not m: continue
    n += 1; h, p = m.groups()
    if hashlib.sha256(open(os.path.join(D, p), "rb").read()).hexdigest() == h: ok += 1
    else: bad.append(p)
out["manifest"] = dict(entries=n, match=ok, mismatches=bad,
                       manifest_sha256=hashlib.sha256(open(os.path.join(D, "MANIFEST_sha256.txt"), "rb").read()).hexdigest(),
                       files_in_folder=sum(len(f) for _, _, f in os.walk(D)))

# ---- 2. run1 vs run2 reproducibility --------------------------------------------------------
def flat(o, p=""):
    r = {}
    if isinstance(o, dict):
        for k, v in o.items():
            if k != "seconds": r.update(flat(v, f"{p}/{k}"))
    elif isinstance(o, list):
        for i, v in enumerate(o): r.update(flat(v, f"{p}[{i}]"))
    elif isinstance(o, (int, float)) and not isinstance(o, bool): r[p] = float(o)
    return r
rep = {}
for a, b in (("data/measure_run1.json", "data/measure_run2.json"), ("data/measure_b1_run1.json", "data/measure_b1_run2.json")):
    fa, fb = flat(J(a)), flat(J(b))
    rep[a] = dict(numbers=len(fa), same_keys=set(fa) == set(fb), max_abs_diff=max(abs(fa[k] - fb[k]) for k in fa))
out["reproducibility"] = rep

# ---- 3. re-apply the pre-registered verdict rule -----------------------------------------
M = J("data/measure_run1.json"); M["B1"] = J("data/measure_b1_run1.json")["B1"]
INT = J("data/candidate_integrity.json"); VR = J("data/verdicts_raw.json")["candidates"]
base = M["baseline"]["P"]
INTENDED_BANDS = {"A": {"hips/crotch", "waist/ribs"}, "B": {"feet", "ankles/shins"}, "B1": {"feet", "ankles/shins"}}
def zone(k, v, md, zn): return (M[k]["P"] if k != "baseline" else base)[v][md]["zones"][zn]["all"]
def regress(k, md):
    f = []
    for v in ("front", "side", "back"):
        s, b = M[k]["P"][v][md], base[v][md]
        if s["mean"] - b["mean"] > 0.25: f.append(f"{v} mean")
        if s["p95"] - b["p95"] > 0.5: f.append(f"{v} p95")
        if s["max"] - b["max"] > 1.0: f.append(f"{v} max")
        if b["frac_le_1.0mm"] - s["frac_le_1.0mm"] > 0.03: f.append(f"{v} %<=1mm")
        for bn, bs in s["bands"].items():
            if bn in INTENDED_BANDS[k]: continue
            bb = b["bands"][bn]
            if bs.get("sym_mean") is None or bb.get("sym_mean") is None: continue
            if bs["sym_mean"] - bb["sym_mean"] > 0.5: f.append(f"{v} band {bn} mean")
            if bb.get("frac_le_1") is not None and bs.get("frac_le_1") is not None and bb["frac_le_1"] - bs["frac_le_1"] > 0.10:
                f.append(f"{v} band {bn} %<=1mm")
    if k == "A":
        if md == "modeF":
            for v in ("front", "back"):
                a, b = M[k]["P"][v][md]["arm_outer_edge_z40_80"]["mean_abs"], base[v][md]["arm_outer_edge_z40_80"]["mean_abs"]
                if a - b > 0.5: f.append(f"{v} arm outer edge")
        if M[k]["P"]["side"][md]["mean"] - base["side"][md]["mean"] > 0.10: f.append("side mean (A)")
        for v in ("front", "back"):
            if zone(k, v, md, "hand_z15_45")["mean"] - zone("baseline", v, md, "hand_z15_45")["mean"] > 0.5: f.append(f"{v} hand zone")
    else:
        for v in ("front", "back"):
            if zone(k, v, md, "foot_zlt-60")["mean"] - zone("baseline", v, md, "foot_zlt-60")["mean"] > 0.5: f.append(f"{v} foot zone")
        if zone(k, "side", md, "ankle_z-75_-55")["mean"] - zone("baseline", "side", md, "ankle_z-75_-55")["mean"] > 0.5: f.append("side ankle zone")
        if zone(k, "side", md, "nonfoot_z-60_100")["mean"] - zone("baseline", "side", md, "nonfoot_z-60_100")["mean"] > 0.25: f.append("side non-foot")
    return f
def improves(k, md):
    if k == "A":
        d = {v: zone("baseline", v, md, "gap_z25_80")["mean"] - zone(k, v, md, "gap_z25_80")["mean"] for v in ("front", "back")}
        return all(x >= 0.30 for x in d.values()), {v: round(x, 3) for v, x in d.items()}
    fz = zone("baseline", "side", md, "foot_zlt-60")["mean"] - zone(k, "side", md, "foot_zlt-60")["mean"]
    sd = base["side"][md]["sole_envelope"]["mean_abs_dz"] - M[k]["P"]["side"][md]["sole_envelope"]["mean_abs_dz"]
    return (fz >= 1.0 and sd >= 2.0), dict(foot_zone_decrease=round(fz, 3), sole_env_decrease=round(sd, 3))
V = {}
for k in ("A", "B", "B1"):
    IF, dF = improves(k, "modeF"); IL, dL = improves(k, "modeL")
    RF, RL = regress(k, "modeF"), regress(k, "modeL")
    newp = INT.get(k, {}).get("bvh", {}).get("new_pairs")
    minz = M[k]["min_z_mm"]
    if (not IF and not IL) or (RF and RL) or (newp or 0) > 0 or not (-88.1 <= minz <= -87.9): verdict = "FAIL"
    elif IF and IL and not RF and not RL: verdict = "PASS (would still need the recalibrated Mode-F sign check)"
    else: verdict = "NOT VERIFIABLE"
    # verdict ignoring the intersection rule, to show what decides A
    if k == "A":
        v_no_int = "FAIL" if ((not IF and not IL) or (RF and RL)) else ("PASS" if IF and IL and not RF and not RL else "NOT VERIFIABLE")
    V[k] = dict(I_F=IF, I_L=IL, intended_F=dF, intended_L=dL, R_F=RF, R_L=RL, new_bvh_pairs=newp, min_z_mm=minz, verdict=verdict,
                matches_committed_flags=all(VR[k][x] == y for x, y in (("I_F", IF), ("I_L", IL), ("R_F", bool(RF)), ("R_L", bool(RL)))),
                committed_recal_modeF_agrees_sign=VR[k]["recal_modeF_agrees_sign"])
    if k == "A": V[k]["verdict_if_intersections_ignored"] = v_no_int
out["verdicts"] = V

# ---- 4. REPORT.md §3 table cross-check --------------------------------------------------------
rep_txt = open(os.path.join(D, "REPORT.md")).read()
sect = {"A": rep_txt.split("**Candidate A**")[1].split("**Candidate B**")[0],
        "B": rep_txt.split("**Candidate B**")[1].split("**Candidate B1")[0],
        "B1": rep_txt.split("**Candidate B1 (post-hoc)**")[1].split("Candidate C:")[0]}
mism = []; checked = 0
for k, txt in sect.items():
    for row in re.finditer(r"\| (front|side|back) \| (F|L) \| (.+?) \|", txt):
        v, c, cells = row.group(1), "mode" + row.group(2), row.group(3)
        parts = [p.strip() for p in cells.split("/")]
        s, b = M[k]["P"][v][c], base[v][c]
        for lab, p, key in zip(("mean", "p50", "p95", "max", "pct1"), parts, ("mean", "p50", "p95", "max", "frac_le_1.0mm")):
            x0, x1 = p.replace("%", "").split("→")
            f = (lambda z: round(100 * z)) if lab == "pct1" else (lambda z: round(z, 2))
            checked += 1
            if f(b[key]) != float(x0) or f(s[key]) != float(x1): mism.append(f"{k} {v} {c} {lab}: report {p} vs data {f(b[key])}->{f(s[key])}")
out["report_table_check"] = dict(cells_checked=checked, mismatches=mism)

# ---- 5. penetration / intersections --------------------------------------------------------
pa, pb = J("data/penetration_A.json"), J("data/penetration_baseline.json")
out["candidate_A_intersections"] = dict(
    new_pairs=INT["A"]["bvh"]["new_pairs"], baseline_pairs=INT["A"]["bvh"]["baseline_pairs"],
    by_groups=INT["A"]["bvh"]["new_pairs_by_dominant_groups"], z_range_mm=[INT["A"]["bvh"]["new_pair_vertex_bbox_mm"][0][2], INT["A"]["bvh"]["new_pair_vertex_bbox_mm"][1][2]],
    max_depth_mm={s: round(-pa[s]["min_signed_mm"], 3) for s in ("right", "left")},
    n_inside={s: pa[s]["n_inside"] for s in ("right", "left")},
    baseline_clearance_mm={s: round(pb[s]["min_signed_mm"], 3) for s in ("right", "left")},
    moved_by_dominant_group=INT["A"]["moved_verts_by_dominant_group"])

# ---- 6. camera scale consistency across views ------------------------------------------------
cams = {md: {v: base[v][md]["cam"]["s"] for v in ("front", "side", "back")} for md in ("modeF", "modeL")}
out["camera_scale_px_per_mm"] = {md: dict(per_view={v: round(x, 4) for v, x in c.items()},
                                          spread_pct=round(100 * (max(c.values()) - min(c.values())) / min(c.values()), 2)) for md, c in cams.items()}
out["camera_scale_px_per_mm"]["modeL_landmark_rows"] = {v: dict(sole_row=base[v]["modeL"]["cam"].get("sole_row"), top_row=base[v]["modeL"]["cam"].get("top_row")) for v in ("front", "side", "back")}
out["camera_scale_px_per_mm"]["F_over_L"] = {v: round(cams["modeF"][v] / cams["modeL"][v], 4) for v in ("front", "side", "back")}

# ---- 7. edit-method analysis (analytic, from committed scripts/cs_edits.py parameters) -------------
phi = math.radians(28.1)
blend = {str(w): round(math.sqrt((1 - w) ** 2 + w ** 2 + 2 * w * (1 - w) * math.cos(phi)), 4) for w in (0.25, 0.5, 0.75)}
bB, bB1 = J("data/candidate_B_build.json"), J("data/candidate_B1_build.json")
out["foot_edit_method"] = dict(
    method="p' = p + w*(R(p-Pv)+Pv-p), then z += dz*w; B1 adds y += dy*w (scripts/cs_edits.py edit_B/edit_B1)",
    radial_scale_factor_at_partial_weight=blend,
    note="factor <1 = vertices with partial foot weight are pulled toward the pivot (linear blend of a 28.1 deg rotation)",
    dz_mm=round(bB["dz_mm"], 3), dy_mm_B1=round(bB1["dy_mm"], 3),
    max_disp_mm={"B": round(bB["max_disp_mm"], 2), "B1": round(bB1["max_disp_mm"], 2)},
    translation_gradient_note="the uniform dz (and B1 dy) is scaled by foot weight, so the full ~9.7 mm drop (and 8.6 mm shift) is absorbed across the ankle weight transition")

# ---- 8. foot-length and sweep claims -------------------------------------------------------
out["foot_length_check"] = dict(model_3d_mm=round((22.5 - (-8.2)) / math.cos(phi), 2), reference_y_extent_mm=round(23.3 - (-11.0), 2),
                                source="reports/REPORT_candidate_B.md L20 inputs (envelope Y range, pitch 28.1 deg)")
sw = J("data/A_exploratory_sweep.json")
out["A_sweep_gap_mean_mm"] = {d: {v: {md: round(sw[d][v][md]["gap_mean"], 3) for md in ("modeF", "modeL")} for v in ("front", "back")} for d in sw}
json.dump(out, sys.stdout, indent=1)
print()
