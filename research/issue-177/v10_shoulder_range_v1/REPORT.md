# v10 shoulder range v1: how far the printed arm swings before first contact (Issue #177)

Evaluator: Claude. Date: 2026-11-13. **Research only**, rig side. Nothing is approved for production; the user decides. The v10 files and the STL were read from copies and are unchanged. No STL, GLB, .blend or pose file is committed. Not independently reviewed.

Frozen method: `METHOD_AND_CRITERIA_FROZEN.md` (SHA-256 `d2e9a1d3de6ed723f76b93f2cff30d1588bb6350a07668e2630e357dfffcbed6`), committed and pushed as `f06ba755997044d3b63efff883d04260f2bec327` before any swing limit was computed. Unchanged since.

## 1. Verdict under the frozen rules: NOT VERIFIABLE

| Rule | Result | Measured |
|---|---|---|
| **S0** rest clearance | **FAIL** | all four set-ups are clear at rest, but the arm-only rest distance is 0.402 mm on both sides (nearest part: the same arm's forearm), not within 0.30 mm of 1.750 / 2.199 mm |
| **S1** adduction control, arm-only below 15° | **FAIL** | 15.0° on both sides; the rule requires below 15° |
| **S2** two runs byte-identical | PASS | SHA-256 `12d4624f3b771e656d23d5fdc23e3736313e1972dc623ffed2dde8450cc1b64c` both runs |

The frozen S1 rule says that if it fails, all results are NOT VERIFIABLE. That is the verdict. Section 3 is therefore **provisional**.

## 2. Why S0 and S1 failed (evaluator's analysis, written after the results; not a frozen finding)

Both rules were written wrongly by the evaluator before any data.

- **S0** assumed the arm-only group's nearest fixed part at rest is `seg_mid_chest`. In the arm-only set-up the same arm's forearm is a fixed part and sits 0.402 mm from the elbow marker (the elbow joint gap). The frozen fixed group should have left out the rest of the same arm.
- **S1** set the control threshold at "below 15°" for the arm-only group. The upper arm alone first touches `seg_lower_waist` after 15.0° of adduction; the threshold was a guess and the measured value sits exactly on it.
- **The straight-arm group, which has no such flaw, gives what the two rules were meant to confirm:** rest distance 1.756 mm (left) and 2.204 mm (right), within 0.006 mm of the README; adduction first contact at 10.0° (left, `thigh_left`) and 12.5° (right, `pelvis`). So the contact test does detect contact.
- The fixed forearm is never the limiting part in any arm-only direction, so removing it from the fixed group would not lower any arm-only angle below. This is an argument, not a rerun.

Whether the straight-arm evidence is enough to accept the measurement is for the reviewer and the user. A corrected validity rule would need its own frozen amendment, and it would be frozen with these results already known.

## 3. Provisional measurement (MEASURED; validity not established, see section 1)

First-contact swing angle, rounded down to the 2.5° grid, with the fixed part that stops it. No direction reaches 180°.

| Direction φ | Left, arm only | Left, straight arm | Right, arm only | Right, straight arm |
|---|---|---|---|---|
| 0° — forward (flexion) | 150° seg_upper_chest | 150° seg_upper_chest | 152.5° seg_upper_chest | 152.5° seg_upper_chest |
| 15°  | 160° seg_upper_chest | 160° seg_upper_chest | 162.5° seg_upper_chest | 162.5° seg_upper_chest |
| 30°  | 167.5° seg_upper_chest | 167.5° seg_upper_chest | 167.5° seg_upper_chest | 167.5° seg_upper_chest |
| 45° — forward-out | 170° seg_upper_chest | 170° seg_upper_chest | 170° seg_upper_chest | 170° seg_upper_chest |
| 60°  | 170° seg_upper_chest | 170° seg_upper_chest | 172.5° seg_upper_chest | 172.5° seg_upper_chest |
| 75°  | 172.5° seg_upper_chest | 172.5° seg_upper_chest | 172.5° seg_upper_chest | 172.5° seg_upper_chest |
| 90° — out to the side (abduction) | 172.5° seg_upper_chest | 172.5° seg_upper_chest | 172.5° seg_upper_chest | 172.5° seg_upper_chest |
| 105°  | 172.5° seg_upper_chest | 172.5° seg_upper_chest | 172.5° seg_upper_chest | 172.5° seg_upper_chest |
| 120°  | 170° seg_upper_chest | 170° seg_upper_chest | 172.5° seg_upper_chest | 172.5° seg_upper_chest |
| 135° — back-out | 170° seg_upper_chest | 170° seg_upper_chest | 170° seg_upper_chest | 170° seg_upper_chest |
| 150°  | 167.5° seg_upper_chest | 167.5° seg_upper_chest | 167.5° seg_upper_chest | 167.5° seg_upper_chest |
| 165°  | 160° seg_upper_chest | 160° seg_upper_chest | 162.5° seg_upper_chest | 162.5° seg_upper_chest |
| 180° — backward (extension) | 150° seg_upper_chest | 150° seg_upper_chest | 152.5° seg_upper_chest | 152.5° seg_upper_chest |
| 195°  | 102.5° seg_mid_chest | 102.5° seg_mid_chest | 125° seg_upper_chest | 125° seg_upper_chest |
| 210°  | 40° seg_mid_chest | 40° seg_mid_chest | 47.5° seg_mid_chest | 47.5° seg_mid_chest |
| 225°  | 25° seg_mid_chest | 25° seg_mid_chest | 27.5° seg_mid_chest | 27.5° seg_mid_chest |
| 240°  | 20° seg_mid_chest | 15° pelvis | 22.5° seg_lower_waist | 17.5° pelvis |
| 255°  | 17.5° seg_lower_waist | 12.5° thigh_left | 17.5° seg_lower_waist | 12.5° thigh_right |
| 270° — toward the body (adduction) | 15° seg_lower_waist | 10° thigh_left | 15° seg_lower_waist | 12.5° pelvis |
| 285°  | 15° seg_lower_waist | 12.5° thigh_left | 17.5° seg_lower_waist | 12.5° thigh_right |
| 300°  | 17.5° seg_lower_waist | 15° pelvis | 20° seg_lower_waist | 17.5° pelvis |
| 315°  | 27.5° seg_lower_waist | 27.5° seg_lower_waist | 30° seg_lower_waist | 30° seg_lower_waist |
| 330°  | 67.5° seg_mid_chest | 67.5° seg_mid_chest | 82.5° seg_mid_chest | 82.5° seg_mid_chest |
| 345°  | 112.5° seg_upper_chest | 112.5° seg_upper_chest | 125° seg_upper_chest | 125° seg_upper_chest |

- **Up, forward, sideways and backward the arm is free for 150° or more.** It is stopped by `seg_upper_chest` when it comes over the top.
- **Toward the body it is stopped almost at once:** 10–17.5° for the straight arm (thigh or pelvis), 15–22.5° for the upper arm alone (`seg_lower_waist`, `seg_mid_chest`).
- Arm-only and straight-arm angles are equal in every direction from 315° through 0° to 225°; they differ only from 240° to 300°, where the forearm and hand reach the pelvis or thigh first.
- Smallest clearance inside the clear range: 0.003 mm (left), 0.026–0.047 mm (right). The swing passes very close to the chest in some directions before first contact.

### Limited wave shoulders (information only, as frozen)

| | Largest swing | Smallest margin to the arm-only first contact | Keys within 5° or beyond |
|---|---|---|---|
| Right (waving) | 111.5° at 3.458 s, direction 46° (forward-out) | 58.7° at the same key | 0 of 135 |
| Left | 22.8° at 3.000 s, direction 93° | 12.2° at 5.125 s (swing 3.0° toward the body, direction 269°) | 0 of 135 |

In this measurement the shoulders are not what limits the wave. The wave also twists the arm and bends the elbow, which is not included.

## 4. Deviations and disclosures

- **Speed change after the first start.** The first run was stopped after 6 directions because it would have taken about 30 hours (`outputs/run1_aborted_slow.log`). The nearest-distance query was changed to (1) query a 1-in-64 subsample to get an upper bound on the minimum distance, then (2) query all points with that bound, using all CPU cores. The minimum distance and its nearest part are the same by construction; the 6 directions from the stopped run are identical in the final run. No frozen parameter changed.
- The frozen document was written with knowledge of the README rest clearances and the part-clearance results (listed there).

## 5. Limits

- **The shoulder marker is not assessed.** It touches the upper arm at rest by design; how far the arm turns before binding on it is unknown, and it may be the real limit.
- Pure swing only: no twist about the arm's axis, no bent elbow, torso and head at rest.
- 15° direction grid, 2.5° angle grid; contact between steps is not seen; contact depth is not measured.
- Clearance > 0 is geometry only: no friction, joint mechanism, printability or strength.

## 6. Reproduce

```
python3 -I scripts/shoulder_range.py PRINT.stl V10_BONES.json LIMITED_POSE.json PART_CLEARANCE_SCRIPTS_DIR OUT.json
```

Inputs: print STL `42010637…9a13`; v10 bones JSON `eab1839c…6c05`; limited pose `b5276ff9…1ed2`; `part_clearance_a2.py` and `stlparts.py` @ `9247164`. About 80 minutes per run on 4 cores.
