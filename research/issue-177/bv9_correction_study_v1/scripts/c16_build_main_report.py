#!/usr/bin/env python3
import json,hashlib,sys
N='/workspace/blendbro/out/bv9_correction_study_v1/'
M=json.load(open(N+'data/measure_run1.json')); M['B1']=json.load(open(N+'data/measure_b1_run1.json'))['B1']
V=json.load(open(N+'data/verdicts_raw.json')); BV=json.load(open(N+'data/baseline_verification.json')); INT=json.load(open(N+'data/candidate_integrity.json'))
sha=lambda p:hashlib.sha256(open(p,'rb').read()).hexdigest()
CAND={'A':'bv9_candidate_A_arm_hand.blend','B':'bv9_candidate_B_foot.blend','B1':'bv9_candidate_B1_foot_ytrans.blend','C':'bv9_candidate_C_legs.blend'}
def row(k,v,m,cond='P'):
    b=M['baseline'][cond][v][m]; s=M[k][cond][v][m]; return f"{b['mean']:.2f}→{s['mean']:.2f} / {b['p50']:.2f}→{s['p50']:.2f} / {b['p95']:.2f}→{s['p95']:.2f} / {b['max']:.2f}→{s['max']:.2f} / {100*b['frac_le_1.0mm']:.0f}→{100*s['frac_le_1.0mm']:.0f}%"
T=lambda k:'\n'.join(f"| {v} | {mn} | {row(k,v,m)} |" for v in ['front','side','back'] for m,mn in [('modeF','F'),('modeL','L')])
R=f"""# bv9 controlled correction study v1 — REPORT (research only; task t126u)

**This is not approval to modify or replace bv9.** bv9, v8, v8s, v10 and all protected files were not touched; no combination of A/B/C, no production version, no topology/weights/skeleton/texture/material change, no installs or downloads. Date 2026-11-02 (America/Chicago). Handoff per `docs/WORK_HANDOFF_STANDARD.md` (branch `docs/shared-bot-handoff-standard`, not merged).

## 0. Result in one table (verdicts per the pre-registered rules)
| candidate | what was tested | intended metric | result | verdict |
|---|---|---|---|---|
| **A** arm/hand | whole arm 3.5 mm toward midline (weights × taper, mesh copy) | gap zone z 25–80 mm (front/back) | improves under landmark camera (Mode L: gap-zone mean 2.58→1.67 front, 1.94→1.13 back), **worsens under best-fit camera** (2.29→2.88, 1.40→2.43); 110 new arm↔hip mesh intersections (≤0.8 mm deep) | **FAIL** (new intersections); as an improvement claim also NOT VERIFIABLE (camera-dependent) |
| **B** foot (pre-registered) | toe-up pitch 28.1° about ankle + floor drop 9.7 mm | side foot zone z<−60 & sole line | sole line 4.66→2.16 mm mean abs dz, foot zone only −0.69 mm (needs ≥1.0); toe tip ≈8.4 mm too far forward | **FAIL** |
| **B1** foot (post-hoc amendment) | B + 8.6 mm Y shift to the reference toe tip | same | sole line 4.66→0.70 mm mean abs dz (max 12.2→1.4); foot zone −0.11 mm only; **ankle zone 0.85→3.25 mm** | **FAIL** (post-hoc design) |
| **C** legs | no edit (support rule not met) | leg band widths | model narrower than reference in all 20 camera variants but magnitude 0.2–3.1 mm is camera-dependent | **NOT VERIFIABLE — no candidate change** (`bv9_candidate_C_legs.blend` ≡ bv9 bytes) |

None of the three discrepancies is corrected by a measured, camera-robust improvement; ~1 mm outline agreement is **not** claimed anywhere. Passing side-view knee/thigh bands were not touched (side numbers identical for A and C by construction; B/B1 change only the foot/ankle).

Reproducibility: every measurement was run twice (all four camera conditions × 3 views × baseline/A/B, and B1 separately): max absolute difference between runs **{V['reproducibility_max_abs_diff_run1_vs_run2']:g}** over 38,023 (+12,685 for B1) numbers.

## 1. Immutable baseline verification (measured)
- `/workspace/blender/star_rai/star_rai_base_body_bv9.blend` sha256 `{BV['bv9']['sha256']}`, {BV['bv9']['bytes']:,} bytes — **match** (before, after, and at the end). Opened only as a copy in Blender 5.2.2 headless.
- Reference manifest `/workspace/blendbro/references/issue177_official_v1/issue177_reference_images/REFERENCE_MANIFEST.json` sha256 `{BV['manifest_sha256']}`: all 9 files match sha256 and byte size (`data/baseline_verification.json`).
- Validation commit `f81fa4646855610b139026348177177ff78e8ff9`; frozen method `METHOD_AND_CRITERIA_FROZEN.md` sha `9af41e41…e59e`, Amendment A1 `834ed0dd…`; validation scripts imported unchanged: `s05_measure.py` `{BV['validation_files']['scripts/s05_measure.py'][:12]}…`, `refseg.py` `{BV['validation_files']['scripts/refseg.py'][:12]}…`, `s03_export_geometry.py` `{BV['validation_files']['scripts/s03_export_geometry.py'][:12]}…`, `s02_inspect_bv9.py` `{BV['validation_files']['scripts/s02_inspect_bv9.py'][:12]}…` (full hashes in `data/baseline_verification.json`). The study's measurement layer reproduces the validation's baseline numbers exactly (e.g. front Mode F mean 1.322, p95 5.076, max 13.626; back Mode L mean 1.588).
- bv9 record (`data/bv9_inspect_baseline.json`, `data/bv9_inspect_extra.json`): object `StarRai_base_body` 30,007 verts / 61,630 edges / 31,659 faces (28,071 quads, 3,588 tris), 74 connected components, 17 shape keys (all value 0), 32 vertex groups, parent armature `StarRai_star_rai_locked_v10` (31 bones, rest pose, identity transforms), modifiers Armature + NormalEdit + Outline (Solidify, muted in memory for silhouettes; unchanged), scene METRIC, scale_length 1.0, length unit METERS (1 BU = 1 m), Z up, figure faces +Y, right side +X, bbox 70.8 × 38.6 × 244.8 mm, sole z −88.0 mm.
- v8s `1c5ce67f…27e9`, v10 armature `f459ea1f…514f`, and all {9079:,} protected files hashed before/after: **0 differences** (`logs/protected_summary.txt`). The research reference-library files (`research/reflib_v1`, 54 files in one subfolder) are inside that set (unchanged).

## 2. Method (frozen before any candidate existed)
`CORRECTION_STUDY_PREREGISTRATION_FROZEN.md` (sha `{sha(N+'CORRECTION_STUDY_PREREGISTRATION_FROZEN.md')[:16]}…`) fixes edits, intended metrics, thresholds, verdict rule and cameras. Primary camera = the bv9 baseline cameras held fixed (Mode F best-fit and Mode L landmark) → differences are geometry only; secondary = the validation's calibration procedure re-run on the candidate (includes calibration drift). Same reference masks (A1), zones (z<100), bands, 1 mm fraction. Candidate edits are mesh-only and use existing vertex-group weights (read only). Reports: `reports/REPORT_candidate_A.md`, `reports/REPORT_candidate_B.md` (B and B1), `reports/REPORT_candidate_C.md`.

## 3. Before → after, fixed baseline cameras (mean / p50 / p95 / max mm / % outline ≤ 1 mm)
**Candidate A**
| view | cam | before → after |
|---|---|---|
{T('A')}

**Candidate B**
| view | cam | before → after |
|---|---|---|
{T('B')}

**Candidate B1 (post-hoc)**
| view | cam | before → after |
|---|---|---|
{T('B1')}

Candidate C: no edit → identical to baseline (see candidate C report for the exploratory in-memory knee test, labelled not a candidate).

## 4. Regression analysis (pre-registered thresholds)
- **A:** Mode F: front p95 +0.52 mm, %≤1 mm −4.9 pts, back mean +0.35 mm, %≤1 mm −12 pts, arm outer-edge offset 0.77→2.61 mm (front) and 0.34→3.26 mm (back), back hand zone +0.53 mm; **no regression flagged under Mode L**; 110 new intersections (z 40.8–48.1 mm, ≤0.82 mm penetration).
- **B:** no regression under Mode F; Mode L: %≤1 mm drops (front 61.3→57.2, side 67.5→64.2); no new intersections; floor at −88.000 mm.
- **B1:** side ankle zone (z −75…−55) 0.85→3.25 mm (F) / 0.65→3.08 mm (L); front/side %≤1 mm drops under Mode L; heel back now 3.4 mm behind the reference heel (model Y_min −14.4 vs reference −11.0).
- **C:** nothing changed.
Details and per-band before/after tables: candidate reports.

## 5. Findings by question (measured / inferred / NOT VERIFIED kept apart)
**Measured:** excess arm–torso gap ≈4–6 mm per side at z 40–80 in both cameras; its attribution flips with the camera (Mode F: torso 4.4–5.6 mm narrower at z 50–70, arms match; Mode L: torso ≈ matches, arms 2.2–3.7 mm too far out); bv9 sole-envelope pitch −28.4°/−27.8°, foot length along the sole ≈ reference foot length (34.8 vs 34.3 mm), so the sole mismatch is orientation, and it is camera-independent (reference heel/toe Y agree between cameras within 0.4 mm); leg bands narrower than the reference in every camera variant (sign), magnitude camera-dependent; Mode F vs Mode L scale differ by ≈5 % in the front/back views.
**Inferred:** the remaining foot error after flattening is foot volume/shape (thin model foot vs thick reference heel/instep) — from overlays; the arm–torso excess is real geometry whichever side owns it.
**NOT VERIFIED / NOT VERIFIABLE:** camera type and scale of the references (orthographic assumed), hand length/placement (front and back references disagree), hidden geometry, rig effects of mesh edits without bone changes, any 1 mm claim, three-quarter views (none in the official set).

## 6. Recommended next correction (proposal only — nothing started)
1. **Resolve the camera/scale question first** (supply the missing full-body three-quarter views and a scale/camera statement, or confirm which calibration TyLo accepts). Candidates A and C cannot be judged without it: the verdict on A flips between Mode F and Mode L.
2. **If the height-consistent (Mode L) calibration is accepted:** a new, separately approved arm test at Δ ≤ 2.0 mm (the largest penetration-free inward shift; exploratory sweep: Mode L mean front 1.38→1.13, back 1.59→1.33, Mode F ≈ neutral/+0.1 mm) — still far from 1 mm. **If best-fit (Mode F) is accepted:** the evidence points to torso/waist width at z 50–75 (+4.5–5.6 mm per side), a body-geometry change that is outside this task and needs its own approval.
3. **Foot:** the pitch correction is measured to fix the sole line (mean 4.66→0.70 mm) but a rigid pitch is not enough; any further step needs a TyLo decision on foot volume/shape (heel, instep, ankle blend) and on the 45°-pitched locked v10 foot bone. No candidate recommended now.
4. **Legs (C):** no change until item 1.

## 7. Disclosures (read)
- Baseline numbers and the baseline mapping (`data/baseline_mapping.json`) were examined **before** the pre-registration was frozen; no candidate geometry existed then. The pre-registration says Mode L "torso matches (≤1.4 mm)"; the later full table shows ≤1.4 mm mostly and up to 2.5 mm (reports use the corrected figures; the frozen file was not edited).
- The pre-registered B design did not anticipate that rotating about the ankle swings the long foot ≈8.5 mm forward; amendment B1 (`AMENDMENT_B1_FROZEN.md`) was written after B was measured and before B1 was built. B1 is post-hoc.
- `scripts/c09_measure.py` received an optional `ONLY` environment filter between run 1 and run 2 (no effect on default behaviour; B1 was measured with it, twice).
- Candidate A uses the existing arm weights, which includes 63 torso vertices at the armpit that carry a partial arm weight (they moved ≤3.5 mm × weight × taper). I did not hide this by editing torso vertices.
- Intersection check = non-adjacent triangle pairs of the rest base mesh; bv9 already has 974 such pairs (hair cap/other parts), only *new* pairs are counted.
- Candidate .blend files were re-saved by Blender 5.2.2 from copies of bv9 (their hashes differ from bv9 only through the edit and save); C is a plain byte copy. **No .blend, mesh export or official reference pixel is committed.** Local candidate files are in `/workspace/blendbro/out/bv9_correction_study_v1/candidates/`.
- Contour-only overlays are committed; overlays with the dimmed reference underlay exist only locally (`overlays/`).

## 8. Local candidate files
"""+'\n'.join(f"- `/workspace/blendbro/out/bv9_correction_study_v1/candidates/{n}` sha256 `{sha(N+'candidates/'+n)}`" for n in CAND.values())+f"""

## 9. Reproduction
Python 3.13.5, numpy 2.5.4, scipy 1.18.1, OpenCV 5.0.0, Blender 5.2.2 LTS (headless, already installed). Order: `c01_baseline_verify.py` → Blender: `c02_inspect_extra.py`, `c02b_export_weights.py`, validation `s02/s03` on the baseline copy → `c03_baseline_mapping.py` → *(freeze)* → `c08_c_support_rule.py` → Blender `c04_make_candidate.py A|B|B1` → candidate exports (`s03`, `c02b`, `c02`, `s02`, `c07_bvh_overlaps.py`, `c12_penetration_depth.py`) → `c06_verify_candidates.py` → `c09_measure.py run1/run2` (+ `ONLY=B1`) → `c14_evaluate.py` → `c10_C_exploratory.py`, `c13_A_sweep.py` → `c11_overlays.py` → `c15_build_reports.py`, `c16_build_main_report.py`. Scripts contain local absolute paths. The official reference images and the exported geometry are required inputs and are NOT in the repository.
"""
open(N+'REPORT.md','w').write(R); print(len(R))
