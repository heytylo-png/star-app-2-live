# v10 limited wave, amendment A1: re-plant the feet; part clearance of the limited pose (FROZEN before any A1 result)

Issue #177. **Research only**, rig side. Evaluator: Claude. Frozen 2026-11-12. The user approved re-planting the feet and uploaded the v10 CAD export. The v10 files are read from copies and are not modified or committed. No STL, STEP, GLB, .blend or pose file is committed.

The v1 method, criteria and results (`METHOD_AND_CRITERIA_FROZEN.md`, commit `9bb9c3f`) stay on record unchanged. This amendment adds two things on top of the v1 limited pose; it changes no joint angle.

## Inputs

| Input | Identity |
|---|---|
| Limited pose (v1 output) | `v10_greet02_limited_pose.json`, SHA-256 `b5276ff932efbcdab1136d0ab02ae5a0925e6494732491034d32dbcf12391ed2` |
| Input pose (retarget amendment A1, `variant_B`) | `v10_greet02_pose.json`, SHA-256 `aaa2fe73a01806d0ed896d05fa1559ce7d9c452eb62b271235dd76610ad52355` |
| CAD export (user upload) | `cadbro_v10_cadquery_export_20261110.zip`, SHA-256 `c67d9f1f9f14e73bc14a06141a32c13ff8d69d64fc80ced4ec3e4fa6fc7fb45b`; its own `SHA256SUMS.txt` verifies |
| → print STL | `star_rai_locked_final_v10_print.stl`, SHA-256 `42010637c9d80705355a79a621d0e44546fb4250951ab8040503ee3d1bc99a13` (the file the part-clearance and joint-range checks used) |
| v10 bones JSON | SHA-256 `eab1839c7eb4d05b6e7c8a98527d40a6a88e5679c12b249e87aff65bdb686c05` |
| Part-clearance scripts | `part_clearance_a2.py` and `stlparts.py` from `research/issue-177/v10_part_clearance_v1/scripts/` @ `92471641bec4f9e259acbeeae45abc671538820d`, used unchanged |

## Disclosure (prior knowledge)

Before freezing, the evaluator knew:
- all v1 limited-wave results (`9bb9c3f`): the left foot bone's tail goes down to −97.2 mm against a rest height of −88, the right foot stays within 0.2 mm of it, and the knees are at their 22° limit for long stretches, so the legs cannot be shortened by bending;
- the published part-clearance results for the unlimited pose (`9247164`): body pairs ≥ 1.434 mm; 18 joint pairs touching or overlapping;
- the published joint-range results (`d5f543e`);
- the contents of the CAD export's file list and checksums, and the part-clearance method, amendments and script text.

The STL had not been loaded, and no re-planted position or part clearance of the limited pose had been computed.

## Part 1: re-plant the feet

With the knees and hips at their limits, the legs cannot bend to reach the floor, so the correction is a rigid shift of the whole figure at each key. No joint angle changes.

- **Foot solids:** STL shells 11 (left foot) and 27 (right foot), posed with their foot bones exactly as in the part-clearance method. Only their vertices are used.
- **Floor:** z_floor = the lowest z of the two foot solids in the v10 rest pose.
- **Support foot:** the right foot (in the input pose its foot bone stays within about 1 mm of its rest height through the whole animation).
- **Step A, no sliding:** shift the figure in x and y so the right ankle (head of `foot_right`) has the same x and y as in the input pose at that key.
- **Step B, on the floor:** shift the figure in z so the lowest point of the two foot solids is exactly at z_floor.

| | Rule |
|---|---|
| **F1** | At every key the lowest point of the two foot solids is within 0.01 mm of z_floor. |
| **F2** | At every key the right ankle's x and y equal the input pose's within 0.01 mm. |
| **F3** | Every bone's world rotation is unchanged from the v1 limited pose (≤ 1e-9°), so v1's L1 and L2 still hold. |
| **F4** | Hand reach, the v1 L3 rule, re-evaluated on the re-planted pose. |

Reported, not gated: for each foot, how high its lowest point sits above the floor (largest value and the number of keys above 0.5 mm), since with locked knees both feet cannot always touch; the size of the vertical and horizontal shifts and their largest key-to-key change; the lowest point of the two foot solids before the shift, for the limited pose and for the input pose.

## Part 2: part clearance of the limited pose

`part_clearance_a2.py` is run unchanged. It reads two poses from one file: `variant_B` is given the input pose (as published) and `main` is given the v1 limited pose. The foot shift of Part 1 is a rigid move of the whole figure and does not change any clearance, so the limited pose is tested before the shift.

| | Rule |
|---|---|
| **P0** | Calibration: the script's C0 and C0b both PASS on this machine. If either fails, P1–P3 are NOT VERIFIABLE. |
| **P1** | Reproduction: `variant_B` gives the published C1 result (0 keys below 1 mm; minimum 1.434 mm, `seg_mid_chest\|upper_arm_left`, 5.458 s) and the published count of 18 overlapping joint pairs. If not, P2 and P3 are NOT VERIFIABLE. |
| **P2** | Body pairs, limited pose: 0 of 135 keys with a body-pair clearance below 1.0 mm (the script's C1 rule and pair classes). |
| **P3** | Limited joints stay clear: every part pair that `v10_joint_range_v1/METHOD_AND_CRITERIA_FROZEN.md` lists for its 15 joints has a minimum clearance > 0 over all keys in the limited pose. This checks the joint-range limits independently, with the whole figure posed instead of one joint at a time. |

Reported, not gated: the ten closest body pairs; every joint pair with clearance ≤ 0 in the limited pose (expected among the pairs the joint-range check did not assess: shoulder markers, `pelvis|seg_hip`, spine markers); the same list for the input pose.

## Decision recorded: the arm

The user left the choice between accepting the forward-reaching limited arm and authoring a new gesture to the evaluator. **Decision: keep the limited arm for now.** A new gesture would lean entirely on the shoulders, whose range has not been measured; authoring it before that measurement would be guesswork. The shoulder range is the next rig-side measurement, under its own frozen method.

## Not covered

- Shoulder range.
- Balance: whether a figure posed this way stands without support.
- Clearance between keys; contact depth.
- Smoothing of the neck (v1 decision 2), which is not part of this amendment.

## Reproducibility

Python 3, numpy and scipy. Each part is run twice; outputs must be byte-identical. PASS or FAIL per rule; nothing is changed after results.
