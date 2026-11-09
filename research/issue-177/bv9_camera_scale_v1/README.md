# bv9 camera-scale verification v1 (Issue #177) — research only

Purpose: test whether the official #177 front/side/back references share one px/mm (Claude review 567d04f7 §6.1), check the front top-edge crop,
and implement `recal_modeF_agrees_sign`. Read `REPORT.md`; method frozen in `METHOD_AND_CRITERIA_FROZEN.md` before measuring.

Order: `scripts/s1_s2_scale_crop.py run1|run2` → `scripts/s1b_exploratory_width.py run1|run2` (post-hoc) → `scripts/run_c09_unchanged.py baseline_run1|baseline_run2`
→ `scripts/compare_c09_baseline.py` → `scripts/verdict_rule.py run1|run2`. `scripts/compat.py` imports the unchanged validation (f81fa464) and correction-study
(5a75023d) scripts from local `git archive` exports at `prior/research/issue-177/...` and the geometry `work/bv9_geom.npz` (re-exported from a bv9 copy, sha256 f7b8d84c…).
Environment: Debian 13, Python 3.13.5, numpy 2.5.4, scipy 1.18.1, OpenCV 5.0.0; Blender 5.2.2 LTS headless (geometry export only, on a copy).

Not committed: `.blend` files, `bv9_geom.npz`, reference images and masks (only contour-only PNGs), full protected path lists.
Step 3 (constrained recalibration) was not run because Step 1 did not establish a shared scale.
