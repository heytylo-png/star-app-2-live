# Amendment A1 to METHOD_AND_CRITERIA_FROZEN.md (made AFTER the first full measurement run; disclosed)

Reason: run 1 of `s05_measure.py` (results retained unchanged in `data/superseded_run1/` and `overlays_superseded_run1/`) showed that the reference
segmentation filled the enclosed arm-torso background pockets of the front and back references (and used a brightness-difference test that mis-flagged
pocket pixels as foreground because the quadratic background fit is unreliable away from the image margins). The model silhouette, in contrast, kept its
own arm-torso gaps, so run 1 reported large spurious "model beyond reference" distances at z 25..80 mm in the front/back views. That is a reference-segmentation defect, not a camera or model result.

Change (reference segmentation only, section 4 of the frozen file):
1. The brightness-difference criterion is disabled (foreground = 3x3 local std > 4.0 only).
2. Enclosed holes are filled unless the hole has area >= 150 px AND > 85% of its pixels are background-like (3x3 std <= 4.0 and |3x3 mean - local background median| < 12).
Everything else is unchanged: zones, calibration modes, metrics, thresholds, classification rules (section 6) and the 1 mm PASS rule were NOT changed.
This amendment was decided after seeing run-1 summary numbers; it is therefore a post-hoc correction of a measurement defect and is stated as such in REPORT.md. Both runs' numbers are published.
