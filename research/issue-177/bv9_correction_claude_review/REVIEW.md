# Independent review: bv9 controlled correction study v1 (Issue #177)

Reviewer: Claude (independent reviewer). Date: 2026-11-09. **Research only.** This review approves no change to bv9, v8, v8s, v10, the locked v10 armature or any production asset. It recommends no production integration.

## 1. Executive summary

- **Access and integrity:** The committed evidence is accessible and intact. All 73 of 73 manifest entries match, and the manifest hash matches the one BlendBro stated.
- **Reproduction:** Every verdict reproduces when the pre-registered rule is re-applied independently to the committed measurements: **A FAIL, B FAIL, B1 FAIL, C NOT VERIFIABLE (no edit)**. All 90 before→after cells in REPORT.md §3 match the data. Run 1 and run 2 are identical across 38,023 + 12,685 numbers.
- **Three findings beyond BlendBro's report:**
  1. **The camera-scale question has a measurable lead.** Across the three views, the landmark camera (Mode L) gives nearly the same scale (spread **1.1 %**). The best-fit camera (Mode F) does not (spread **5.0 %**; front and back are about 4–5 % smaller than side). *If* the official reference views share one pixel scale, Mode L is the self-consistent calibration. Whether they do is NOT VERIFIABLE here, because the reference images are not committed.
  2. **The foot candidates test the edit method as much as the idea.** B and B1 blend vertex positions by foot weight rather than rotating the foot through its bone. Ankle vertices with partial weight are pulled toward the pivot (up to about 3 % at w = 0.5). They also absorb the whole ≈9.7 mm floor drop, and in B1 the 8.6 mm shift as well. The ankle regression in B1 is therefore expected from the method. The FAILs stand, but they do **not** show that a flatter foot is wrong.
  3. **The new intersections in A are forearm against pelvis, not hand against hip.** All 110 new pairs are `lower_arm_*|pelvis`, at z 40.8–48.1 mm. The baseline forearm-to-pelvis clearance is only **2.47 mm (left) / 3.19 mm (right)**, so a 3.5 mm inward shift was bound to collide. This is consistent with BlendBro's "≤ 2 mm" suggestion. (It corrects the reviewer's earlier informal remark that the hands caused the collisions.)
- **Implementation gap:** The pre-registered **PASS** condition requires the recalibrated Mode-F camera to agree in sign. That check is never computed (`recal_modeF_agrees_sign: null` for every candidate). It changes no current verdict, since nothing could PASS. It must be implemented before any future candidate is called PASS.

## 2. Exact commit and files inspected

| Item | Value |
|---|---|
| Repository | `heytylo-png/star-app-2-live` |
| Branch / commit | `research/bv9-correction-study-v1` @ `5a75023d974d1741fbdff3f9ef41f5cc5f707c43` (branch head confirmed with `git ls-remote`) |
| Folder | `research/issue-177/bv9_correction_study_v1/`: 74 files (73 listed plus `MANIFEST_sha256.txt`) |
| Read | `REPORT.md`, `CORRECTION_STUDY_PREREGISTRATION_FROZEN.md`, `AMENDMENT_B1_FROZEN.md` (hash only), `reports/REPORT_candidate_B.md` L20, `scripts/cs_edits.py` (all), `scripts/c14_evaluate.py` (for field names) |
| Data used | `data/measure_run{1,2}.json`, `data/measure_b1_run{1,2}.json`, `data/verdicts_raw.json`, `data/candidate_integrity.json`, `data/penetration_{A,baseline}.json`, `data/candidate_{B,B1}_build.json`, `data/A_exploratory_sweep.json` |
| Not available (by design) | bv9 and candidate `.blend` files, mesh exports and vertex weights (`work/bv9_base_weights.npz`), the official reference images. Nothing that needs these was re-derived. |

## 3. Access and manifest verification

- **Commands:**
  - `git init` in an empty folder
  - `git fetch --depth=1 https://github.com/heytylo-png/star-app-2-live 5a75023d974d1741fbdff3f9ef41f5cc5f707c43`
  - `git archive FETCH_HEAD research/issue-177/bv9_correction_study_v1 | tar -x`
- **Result:** 73 of 73 entries match by SHA-256, with no mismatches. SHA-256 of `MANIFEST_sha256.txt` = `a067439b0ec553aa84161f401e30920d901a27e397b74f84ca8ee92c14eb3b88`, matching BlendBro's handoff.
- **Local files:** The local candidate `.blend` hashes (REPORT §8) refer to files on BlendBro's machine. **NOT VERIFIABLE** here.

## 4. Claim-by-claim verdicts

| # | BlendBro claim | Verdict | Confidence | Evidence |
|---|---|---|---|---|
| 1 | A: whole arm 3.5 mm toward the midline is **FAIL** | **PASS** (claim confirmed) | High | Re-applied rule: I_F false, I_L true, R_F has 7 flags, R_L none, 110 new intersection pairs → FAIL. Ignoring intersections it would be NOT VERIFIABLE (camera-dependent). All flags match `verdicts_raw.json`. |
| 2 | A worsens under the best-fit camera (front p95 5.08→5.59; back %≤1 mm 57→45) and improves under the landmark camera (front p95 4.36→3.85) | **PASS** | High | Exact match in data (REPORT §3, A rows). |
| 3 | A creates 110 new arm-hip intersections, up to 0.82 mm deep | **PASS**, with a location correction | High | 110 new pairs (`lower_arm_left|pelvis` 70, `lower_arm_right|pelvis` 40) at z 40.8–48.1 mm. Max depth 0.817 mm left, 0.117 mm right; 43 and 12 vertices inside. They are forearm-to-pelvis contacts. |
| 4 | A also moved 63 armpit torso vertices | **PASS** | High | `moved_verts_by_dominant_group.waist = 63`. |
| 5 | The arm-to-hip gap is real (≈4–6 mm per side) and its attribution depends on the camera | **NOT VERIFIABLE** (attribution); **PASS** that the gap exists in both cameras | Medium | Taken from the frozen baseline mapping. The raw silhouettes and references are not committed. See §6.1 for the camera-scale evidence. |
| 6 | B (foot pitched flat) is **FAIL** | **PASS** (claim confirmed) | High | Neither camera meets the improvement threshold: foot zone −0.69 / −0.70 mm against the required ≥1.0 mm (the sole envelope does meet its ≥2.0 mm). Mode L flags %≤1 mm drops (front, side). |
| 7 | B "fixes the sole line (side 4.97 to 3.52)" | **FAIL** (labelling) | High | 4.97→3.52 is the **side-view p95 outline** (Mode F), not the sole line. The sole-line measure is the sole envelope's mean \|Δz\|: 4.66→2.16 mm (F), 4.94→2.50 mm (L). REPORT.md labels it correctly; the chat summary does not. |
| 8 | Foot length matches the reference (34.8 vs 34.3 mm); the mismatch is the tilt | **PASS** (arithmetic) | Medium | (22.5 − (−8.2)) / cos 28.1° = 34.80 mm against 34.3 mm. This assumes a straight sole line; the inputs come from the uncommitted silhouettes. |
| 9 | B1 fixes the sole but the ankle worsens 0.85→3.25 mm; **FAIL** | **PASS** (claim confirmed) | High | I_F and I_L false (foot zone −0.11 / −0.14 mm). Side ankle zone flagged in both cameras. B1 is post-hoc, as disclosed. |
| 10 | C: legs narrower in every variant, 0.2–3.1 mm, NOT VERIFIABLE, no edit | **PASS** that no edit was made | Medium | The verdict follows the frozen support rule. The variant magnitudes need the uncommitted silhouettes (not re-derived). The C file equals the bv9 hash per BlendBro's local listing (NOT VERIFIABLE here). |
| 11 | Measurements reproducible, two runs identical | **PASS** | High | Max abs diff 0.0 over 38,023 and 12,685 numbers. |
| 12 | Frozen-criteria figure error (1.4 vs 2.5 mm) does not change results | **PASS** | High | The figure is descriptive baseline text in the pre-registration, not a threshold. No verdict uses it. |
| 13 | All 9,079 protected files unchanged | **NOT VERIFIABLE** | – | `logs/protected_summary.txt` reports it, but the files are on BlendBro's machine. |

## 5. Reproduction

```
python3 -I scripts/reproduce_bv9_review.py <fetched>/research/issue-177/bv9_correction_study_v1 > outputs/bv9_review_output.json
```

Python 3 and numpy only; no Blender, no downloads. The script re-implements the verdict rule from the frozen pre-registration text. It checks the manifest, run-to-run reproducibility, all 90 REPORT §3 cells, the intersections and camera scales, and the analytic edit-method factors. Its output is committed as `outputs/bv9_review_output.json`.

## 6. Additional findings

### 6.1 Camera scale: a measurable lead, not a resolution

Baseline camera scale (`cam.s`, px per model-mm, `data/measure_run1.json` → `baseline.P.<view>.<mode>.cam`):

| view | Mode F (best-fit) | Mode L (landmark) | F/L |
|---|---|---|---|
| front | 5.6943 | 6.0005 | 0.949 |
| side | 5.9800 | 6.0339 | 0.991 |
| back | 5.7367 | 5.9671 | 0.961 |
| spread across views | **5.0 %** | **1.1 %** | |

- **What it suggests.** In an orthographic turnaround drawn at one scale, every view should share one px/mm. Mode L nearly does; Mode F's front and back scales are 4–5 % below its side scale. That pattern fits a best-fit camera shrinking the reference to absorb the arm/torso width mismatch, which is exactly where the arm verdict flips.
- **Status: INFERRED, NOT VERIFIABLE.** It depends on the reference images sharing one pixel scale, which needs the uncommitted references or the reference sheet's own statement.
- **Caveat on Mode L front.** The front Mode-L calibration uses `top_row = 0`, so the reference head may touch or be cropped at the image's top edge. That could bias the front Mode-L scale. It should be checked against the reference image.

### 6.2 Foot edit method (B, B1)

`scripts/cs_edits.py` `edit_B`: `p' = p + w·(R(p−Pv)+Pv−p)`, then `z += Δz·w` with Δz = −9.68 mm. `edit_B1` additionally applies `y += Δy·w` with Δy = −8.59 mm.

- **Pull toward the pivot.** Linearly blending a 28.1° rotation pulls partially weighted vertices toward the pivot by a factor of 0.978 at w = 0.25 or 0.75, and 0.970 at w = 0.5. That is up to about 0.3–0.6 mm at 10–20 mm from the pivot.
- **Translations concentrated at the ankle.** The weighted translations put the full 9.7 mm (B) and 8.6 mm more (B1) into the ankle's weight transition band. The pre-registration acknowledged the ankle stretch as a side effect.
- **Consequence.** B and B1 measure "rigid flattening applied by blended mesh displacement". They do not measure a flatter foot achieved by rotating the foot bone through the existing skinning, or by reshaping the foot. The FAIL verdicts are correct for what was tested and should not be generalised.

### 6.3 Arm clearance

The baseline minimum forearm-to-pelvis clearance (2.47 mm left, 3.19 mm right; `data/penetration_baseline.json`) is below the 3.5 mm shift. To first order, it caps a uniform inward shift at about 2.4 mm before contact on the left. The exploratory sweep (`data/A_exploratory_sweep.json`) shows the Mode-L gap mean improving through 2.5 mm (front 2.58→1.79, back 1.94→1.11). Mode-F gap means worsen from 2 mm in front (2.29→2.34) and already at 1 mm in back (1.40→1.44).

### 6.4 PASS check not implemented

`recal_modeF_agrees_sign` is `null` for every candidate (`data/verdicts_raw.json`). The pre-registered PASS requires it. It is not decisive today, but it is a required check before any future PASS.

## 7. Corrections to BlendBro's summary (the original report is not edited)

- **C1.** The chat summary's "sole line 4.97→3.52" is the side-view p95 outline (Mode F). The sole-line metric is 4.66→2.16 mm (Mode F). REPORT.md itself is correct.
- **C2.** The A intersections are forearm (`lower_arm_*`) against pelvis at z 40.8–48.1 mm, not the hands.

## 8. Production-safety conclusion

No candidate is an improvement under the pre-registered rule, and nothing here justifies changing bv9, the v10 armature (including the locked foot bone) or any production asset. **No production change is recommended or authorized.** The user remains the final approver.

## 9. Recommended next research steps (proposals only)

1. **Settle the camera scale.** Use the official reference sheet's stated scale or camera, or the views' common pixel scale; check whether the front reference is cropped at the top. If all views share one scale, the §6.1 table already favours Mode L.
2. **If Mode L is accepted:** a gap-following arm test (shift by height, capped below the 2.47 mm left clearance), pre-registered as before. It also needs the missing recalibrated-sign check implemented.
3. **Foot:** any further test needs your decision first. If you approve, test a flatter foot by **rotating a copy of the foot bone and letting the existing skinning deform the mesh**, or by an explicitly approved reshape, rather than by blended vertex displacement. The locked v10 foot bone itself stays untouched unless you decide otherwise.
4. **Legs:** no action until step 1.
