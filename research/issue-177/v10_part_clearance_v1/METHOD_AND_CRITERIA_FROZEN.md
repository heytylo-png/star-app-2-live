# v10 printed-part clearance under the retargeted `greet_02` (Issue #177) — method and criteria (FROZEN before any posed clearance was computed)

Research only. Evaluator: Claude. Frozen 2026-11-10. The user asked for the check ("Proceed") and uploaded the parts. All inputs are read only and none are committed. The locked v10 files are not modified.

## Inputs (user uploads; not committed)

| File | SHA-256 |
|---|---|
| `cadbro_v10_cadquery_export_20261110.zip` | `c67d9f1f9f14e73bc14a06141a32c13ff8d69d64fc80ced4ec3e4fa6fc7fb45b` |
| → `star_rai_locked_final_v10_print.stl` (its own SHA256SUMS: OK) | `42010637c9d80705355a79a621d0e44546fb4250951ab8040503ee3d1bc99a13` |
| → `star_rai_locked_final_v10_README.md` (rest clearances, part list) | `5a85d75cbc8cf7752ed84c273631572a1c63bd7f2956faa3b4ce15a7fea8b738` |
| `star_rai_locked_final_v10_blender_bones.json` | `eab1839c7eb4d05b6e7c8a98527d40a6a88e5679c12b249e87aff65bdb686c05` |
| Retarget pose JSON from `retarget_v10.py` @ `798db9f` (`variant_B` = amendment A1, `main` = original) | `aaa2fe73a01806d0ed896d05fa1559ce7d9c452eb62b271235dd76610ad52355` |

The split archive `cadbro_cadquery_exports_20261110.zip` (joined SHA-256 `981f505c…0481`; other CADBro variants) is **not used**.

## Disclosure (prior knowledge)

Before freezing, the evaluator knew:
- the STL's 36 shells (all watertight), with rest centroids and bounding boxes;
- the README's rest clearances (Solid.distance);
- the skeleton-level retarget results (`798db9f`, review `9daf678`):
  - **A1 / variant B:** arm-to-leg axis distance ≥ 17.9 mm; right hand tip up to 141.4 mm;
  - **main:** forearm-to-thigh axis distance down to 5.0 mm.

No posed part position or posed clearance had been computed.

## Parts → bones (rigid; mm, v10 axes)

Shell indices are from the STL in file order (0-based).

| Part | Shells (L / R or single) | Moves with bone |
|---|---|---|
| head | 17 | `head` |
| neck_marker, neck_cyl | 24, 18 | `upper_chest` |
| seg_upper_chest | 9 | `upper_chest` |
| shoulder_marker | 5 / 31 | `upper_chest` |
| spine marker mid_chest–upper_chest | 19 | `mid_chest` |
| seg_mid_chest | 10 | `mid_chest` |
| spine marker waist–mid_chest | 22 | `waist` |
| seg_waist | 16 | `waist` |
| spine marker lower_waist–waist | 21 | `lower_waist` |
| seg_lower_waist | 13 | `lower_waist` |
| spine marker hip–lower_waist | 20 | `hip` |
| seg_hip | 12 | `hip` |
| hip_attachment | 23 | `hip` |
| pelvis | 7 | `pelvis` |
| upper_arm | 3 / 30 | `upper_arm_*` |
| elbow_marker | 4 / 33 | `upper_arm_*` |
| forearm | 1 / 32 | `lower_arm_*` |
| wrist_marker | 2 / 35 | `lower_arm_*` |
| hand | 0 / 34 | `hand_*` |
| thigh | 6 / 25 | `thigh_*` |
| knee_marker | 15 / 29 | `thigh_*` |
| shin | 8 / 26 | `shin_*` |
| ankle_marker | 14 / 28 | `shin_*` |
| foot | 11 / 27 | `foot_*` |

**Rule:** markers move with the parent of their attachment bone, as in the retarget. Spine markers move with the lower segment.

**Posing:** x' = head_b(t) + Q_b(t) · (x − head_b(rest)). Q_b and head_b come from forward kinematics on the v10 JSON with the per-key world rotations and root translation in the pose JSON.

## Distance method

- **Sampling:** each shell is sampled with a deterministic barycentric lattice, subdividing each triangle n = ceil(longest edge / h) times, with **h = 0.25 mm**.
- **Distance:** for a pair, d_s = the minimum nearest-neighbour distance between the two sample sets (KD-tree).
- **Bounds:** the true surface distance lies in [d_s − h, d_s]. The **reported clearance is d_s − h** (conservative). If d_s ≤ h, the pair is reported as **contact/overlap**.
- **Prefilter:** pairs whose posed bounding boxes are more than 5 mm apart are skipped (reported as > 5 mm).

## Pair classes

- **Same-bone pairs** (rigid together; distance never changes): excluded.
- **Joint pairs:** the 29 joint-gap and marker pairs and the 13 intended contacts listed in the README. Reported, not gated (C2).
- **Body pairs:** every other pair of parts. Gated (C1).

## Criteria

| | Rule |
|---|---|
| **C0** (validity gate) | At rest (no pose), the method reproduces the README's Solid.distance values within **±0.30 mm** for: upper_arm, forearm, hand, shoulder_marker, elbow_marker and wrist_marker vs their nearest body part (12 values); and the 10 limb joint gaps of 2.000 mm. If C0 fails, C1 is NOT VERIFIABLE. |
| **C0b** (detection control) | Posing the rest skeleton with `lower_arm_right` and `hand_right` rotated rigidly 30° about world Y at the right elbow, toward the body, gives a C1 body-pair clearance < 1.0 mm. If not, C1 is NOT VERIFIABLE. |
| **C1** | On the A1 pose (`variant_B`), at all 135 keys, every body pair has clearance ≥ **1.0 mm** (the user's print-clearance rule). |

**Verdict:** PASS or FAIL per criterion. No threshold, h, pair class or mapping is changed after results; any change is a new, separately frozen amendment.

## Reported, not gated

- **C2:** joint pairs: minimum clearance per pair over the keys, and the keys with contact or overlap (how far the motion asks a joint beyond its printed shape).
- Worst 10 body pairs with their key times.
- The same C1 and C2 on the original `main` pose (information only).
- Run twice; the result JSON must be byte-identical.

## Not covered

- Clearance between keys; hair; skin or clothing; joint mechanisms beyond the solid shapes; printability.
