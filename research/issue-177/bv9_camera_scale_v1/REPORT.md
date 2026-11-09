# bv9 camera-scale verification v1 — Issue #177 (research only)

**Result: the official front, side and back references are NOT shown to share one px/mm.** Under the frozen criterion the
shared-scale verdict is **NOT VERIFIABLE (inconclusive)**, so Step 3 (constrained recalibration) was **not run**, as the brief requires.
The front head is **CROPPED** at the top edge, but by hair; the implemented Mode-L front scale does not use that row (bias 0).
Step 4 (`recal_modeF_agrees_sign`) is implemented and runs on the baseline.

Frozen method: `METHOD_AND_CRITERIA_FROZEN.md`, sha256 `c714596611ebef477ed14eded3307348b453ff4d02f4fd806687273d6ae55f9c`,
frozen 2026-11-09 17:00:31 CST, before any Step 1–3 value was computed (`logs/frozen_criteria_sha256.txt`). No geometry, weight, bone or
armature was changed; no candidate was built. All measurements ran twice and matched exactly.

## 0. Inputs (MEASURED)
- bv9 `/workspace/blender/star_rai/star_rai_base_body_bv9.blend` sha256 `d72cedc1fbe6aaa14bebddbe052af97321816f88e8c3065a920165cbcf6d9689` before and after.
- Reference manifest sha256 `c972df6a995a8443038164c1304ba0e15931def5db5086def64f424d8be75fef`; all 9 image hashes match it (`data/step12_run1.json` → `reference_hashes`).
- Geometry re-exported from a copy of bv9 with the unchanged validation `s03_export_geometry.py` (Blender 5.2.2, headless):
  `work/bv9_geom.npz` sha256 `f7b8d84c5f27a843efdcde568a79cfa3150c5e6236c562a51e8e513d54530aff`, the same as the value recorded by the correction study.
- Reused code is imported unchanged from `git archive` exports of f81fa464 and 5a75023d. Hashes are in `logs/reused_script_hashes.txt`, and
  `refseg.py`, `s05_measure.py`, `s03` and the frozen/amendment files match the hashes recorded in the correction study. `scripts/compat.py` only remaps the vanished local paths.
- **Pipeline check (MEASURED):** the unchanged `c09_measure.py` re-run on the baseline reproduces the committed correction-study
  baseline (`measure_run1.json`) on all **12,741 numeric values, with a maximum difference of 0.0**, and run 1 equals run 2 (`data/c09_baseline_comparison.json`).

## 1. Reference scale check
Model sole-to-crown = 151.647 − (−88.0) = **239.647 mm**. z_crown is the max z of material 0, the validation definition (NOT VERIFIED). It is a common factor, so it does not affect the spread.
Detection: top = min foreground row, sole = max foreground row + 1 of the validation segmentation (`refseg`, A1, tex 4.0). Uncertainty is the
max change of H over the variants tex 3.0, tex 6.0 and a ≥5-px row-count rule. The image is not committed. Only the contour is committed, in `contours/fullbody_contours_top_sole_rows.png`.

| image | W×H px | top row | sole row | H px | det. unc. | implied px/mm | scale status | row-0 fg px | crop |
|---|---|---|---|---|---|---|---|---|---|
| 01 head front shaded | 864×1536 | 165 | 1536 | 1371 | ±1 | 5.7209 | NOT VERIFIABLE (close-up) | 0 | NOT CROPPED |
| 02 full-body front | 864×1536 | 0 | 1521 | 1521 | ±1 | 6.3468 | not a scale landmark (hair, cropped) | 20 | CROPPED |
| 03 full-body side | 864×1536 | 41 | 1487 | 1446 | ±3 | 6.0339 | MEASURED (bald-skull crown) | 0 | NOT CROPPED |
| 04 full-body back | 864×1536 | 41 | 1471 | 1430 | ±2 | 5.9671 | MEASURED (bald-skull crown) | 0 | NOT CROPPED |
| 05 head side | 864×1536 | 184 | 1536 | 1352 | ±1 | 5.6416 | NOT VERIFIABLE (close-up) | 0 | NOT CROPPED |
| 06 head back | 864×1536 | 206 | 1536 | 1330 | ±1 | 5.5498 | NOT VERIFIABLE (close-up) | 0 | NOT CROPPED |
| 07 head 3/4 back | 864×1536 | 194 | 1536 | 1342 | ±1 | 5.5999 | NOT VERIFIABLE (close-up) | 0 | NOT CROPPED |
| 08 head front | 864×1536 | 163 | 1536 | 1373 | ±3 | 5.7292 | NOT VERIFIABLE (close-up) | 0 | NOT CROPPED |
| 09 head front shaded (dup) | 864×1536 | 165 | 1536 | 1371 | ±1 | 5.7209 | NOT VERIFIABLE (close-up) | 0 | NOT CROPPED |

The close-ups' "sole row" 1536 is the bottom image edge (the head is cut at the bottom), not a sole.

**Front scale without a crown (model-independent):**
- **D3, front/back outer-width mirror match:** r_fb = **0.9945**. The best-match mean |Δwidth| is **17.13 px**, against **17.34 px** at r = 1. This fails the frozen ≤ 2 px quality gate.
- **D4, crotch-apex height:** front 747 px against back 634 px, so r = **1.178**. That is 18.5 % from D3 and fails the 1 % agreement gate.

**Spread (MEASURED):**
- **All three views:** front 5.9343 (via D3), side 6.0339, back 5.9671 px/mm, spread **1.67 %**. This uses the failed D3 front value.
- **Side vs back** (the only two independent crown landmarks): **1.11 %**. That is above the 1.0 % threshold, but below the 1.41 % NOT SHARED threshold (1.0 % + 2·u_rel, with u_rel = 0.21 %).

**Verdict (frozen rule): NOT VERIFIABLE (inconclusive).** The front estimator fails both quality gates. Side vs back is in the inconclusive band. Step 3 is not run.

**Related MEASURED facts:**
- In the validation code (s05 `modeL`), the Mode-L front scale is **defined** as mean(side, back) = 6.0005. So Claude's "Mode L spread 1.1 %" is the side-vs-back difference alone, and it does not test the front.
- Mode F against the side/back crown scales: front 0.960, side 0.991, back 0.961.
- The figures are framed differently: the sole rows are 1521, 1487 and 1471.

**Post-hoc exploratory** (`scripts/s1b_exploratory_width.py`, designed after seeing run 1, not used for the verdict). The front and back outer widths disagree by these mean |Δ| amounts:
- 7–12 px (≈1.2–2 mm) in the legs.
- 38 px, up to 130 px, at z ≈ −16…20 mm.
- 19 px at z ≈ 20…56 mm.

A legs-only fit gives r = 1.022, against 0.993 for the upper body. No single similarity scale makes the front and back outlines mirror-consistent. Two causes are possible: the two drawings are not metrically consistent orthographic views, or the arm/hand pose differs between them. Both are **INFERRED**; neither is established.

## 2. Front crop check (MEASURED unless labelled)
- **CROPPED.** The front top row is 0. Foreground px in rows 0–4: 20, 20, 23, 28, 33. 20 contour px lie on the top edge, against a ≥ 10 px criterion.
  Side and back have a 41 px margin, and none of the close-ups touch the top. Evidence: `contours/front_top_crop_contour.png` and `contours/front_top_crop_contour_zoom4x.png` (contour only).
- **What is cut (INFERRED):** the clipped outline is the hair/ahoge. The validation recorded the front as hair and the side/back as bald.
  - Mapping the back's bald-skull height onto the front with D3 r_fb puts the skull top at row **≈ 99**, inside the frame.
  - Under any scale from 5.93 to 6.03 px/mm (1521 − 239.647·s) it falls at rows ≈ 75–99.
  - So the skull is probably in frame and only hair is clipped. This rests on D3 and the front sole row, so it is INFERRED.
- **Head-ratio evidence: NOT VERIFIABLE for the front.** Hair hides the neck, so the neck rule hit the hair (width 223 px against 79–80 px in back/side). Head-top-to-neck / H is 0.150 (side) and 0.136 (back).
- **Bias on the implemented Mode-L front scale: 0 (MEASURED).** It is mean(side, back). Re-running the unchanged `modeL` gives 6.000480, the same as the validation camera, and blanking the top 7 rows leaves it identical.
  The front Mode-L `ty` uses only the sole row.
- **Hypothetical crown-based front scale** with top_row = 0: 1521/239.647 = **6.347 px/mm**.
  - Against a skull-based value it is **+5.2 % to +7.0 % HIGH**, because the hair is counted as head.
  - The true hair top is above row 0, so this figure is a lower bound for a hair-inclusive scale. The crop shrinks the bias but cannot remove it.
  - Direction is MEASURED. Magnitude is INFERRED, because it rests on the skull-row estimate above.

## 3. Constrained recalibration: NOT RUN
The frozen precondition (Step 1 = SHARED) is not met. So none of these were measured:
- the constrained Fc/Lc cameras;
- the gap attribution (arms too far out vs torso too narrow), which stays **NOT VERIFIABLE** as in the correction study;
- leg-band camera robustness.

The scripts for these were defined in the frozen method but were not written or run.

## 4. recal_modeF_agrees_sign: implemented (`scripts/verdict_rule.py`)
- `recal_modeF_agrees_sign(meas_base, meas_cand, kind)` uses c09-format P/R measurements and the c14 intended metrics. It returns True/False with its reasons and never None.
  `require_ready()` raises if any verdict still holds None; it is tested and rejects None.
- **Baseline (MEASURED):** bv9 vs itself gives **False** for both A and B: "zero change (P +0.0000, R +0.0000) → cannot agree".
  For the baseline, the R cameras equal the P cameras exactly in all 6 view/mode pairs.
- **Retrospective on the committed correction-study data** (no new candidate; earlier verdicts unchanged):
  - **A = False.** Front: P −0.593, R +0.638. Back: P −1.032, R +0.341. The recalibrated Mode F reverses the sign, consistent with the camera flip.
  - **B = True** (+0.686/+0.692, +2.503/+2.463).
  - **B1 = True.**
  - A, B and B1 stay FAIL on other clauses.
- Output: `data/step4_recal_sign_run{1,2}.json` and `logs/step4_run1.log`. The two runs are identical.

## Findings
| # | finding | label |
|---|---|---|
| F1 | 9/9 reference hashes and the manifest match; bv9 geometry export reproduces f7b8d84c… | MEASURED |
| F2 | Side vs back crown scale differ by 1.11 % (> 1.0 %, < 1.41 %) | MEASURED |
| F3 | Front scale cannot be established model-independently (D3 cost 17.1 px > 2; D3/D4 differ 18.5 %) | MEASURED (gates) / NOT VERIFIABLE (front scale) |
| F4 | Front/side/back share one px/mm | NOT VERIFIABLE (inconclusive) |
| F5 | Mode-L front scale is mean(side, back) by definition, so the "1.1 % Mode L spread" does not test the front | MEASURED |
| F6 | Front head cropped at top (row 0, 20 px on edge) | MEASURED |
| F7 | Crop clips hair, skull probably in frame (rows ≈ 75–99) | INFERRED |
| F8 | Crop bias on implemented Mode-L front scale = 0; a crown-based front scale would be biased high (≈ +5–7 %) | MEASURED / INFERRED (magnitude) |
| F9 | Front and back outlines are not mirror-consistent at any single scale (exploratory) | MEASURED (post-hoc); cause INFERRED |
| F10 | Arm vs torso attribution; leg-band camera robustness | NOT VERIFIABLE (Step 3 not run) |
| F11 | recal_modeF_agrees_sign implemented; baseline → False (no change); retrospective A False, B/B1 True | MEASURED |
| F12 | All protected files byte-identical before/after (8,024 files; list sha256 ec493e51…5efc both times) | MEASURED |

## Disclosures
1. **Seen before freezing:** the items listed in the frozen file (Claude §6.1 numbers, validation and correction-study numbers and code). No reference pixels or masks.
2. **Fix after run 1.** The first run-1 code printed "NOT SHARED" because it had not applied the frozen override "(or if D3/D4 disagree or D3 cost > 2 px) NOT VERIFIABLE".
   I fixed it and re-ran runs 1 and 2. The final verdict is NOT VERIFIABLE. Either label leads to Step 3 being skipped.
3. **Post-hoc analysis.** `s1b_exploratory_width.py` was added after run 1. I viewed only the contour-only PNGs for QA after run 1.
4. **Missing local folders.** The earlier local study folders (`/workspace/blendbro/out/bv9_reference_validation_v1/`, `…/bv9_correction_study_v1/`) no longer exist on the box.
   Their committed contents were used instead, and the geometry was re-exported with a matching hash.
   Because those folders are gone, the protected set is 8,024 files now, against 9,079 in the correction study.
5. **No single r3 file.** I found no Star Rai body file named "r3". All of `/workspace/blender` is in the protected hash list, including the `hairalt_v3_1_bound_r3.blend`, `work/r3_spring.blend` and `retopo/var/k_r3.blend` files.
6. **c09 output path.** `compat.py` redirects c09's output file to `data/c09_measure_*.json`. c09 itself is unchanged.

## Scope
Research only. No arm, foot, leg or torso edits, no foot-bone test, no candidates, no production change. The user decides which camera is accepted and whether any correction test proceeds.
