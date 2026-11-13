# v10 limited wave, amendment A2: legs in the v10 rest stance (FROZEN before any A2 result)

Issue #177. **Research only**, rig side. Evaluator: Claude. Frozen 2026-11-13. The user approved this step ("Go ahead"). The v10 files are read from copies and are not modified or committed. No STL, STEP, GLB, .blend or pose file is committed.

v1 (`9bb9c3f`) and amendment A1 (`3b6d46f`) stay on record unchanged, including A1's P2 FAIL.

## Why

A1 showed the limited wave fails below the waist: with the knees and hips held to their limits the left foot runs into the right foot (39 of 135 keys below 1 mm), and after re-planting the weight-bearing right foot floats up to 9.3 mm. The legs cannot follow this wave on the printed parts.

## Inputs

| Input | Identity |
|---|---|
| v1 limited pose | `v10_greet02_limited_pose.json`, SHA-256 `b5276ff932efbcdab1136d0ab02ae5a0925e6494732491034d32dbcf12391ed2` |
| Input pose (retarget A1, `variant_B`), for the reproduction check only | SHA-256 `aaa2fe73a01806d0ed896d05fa1559ce7d9c452eb62b271235dd76610ad52355` |
| Print STL | `star_rai_locked_final_v10_print.stl`, SHA-256 `42010637c9d80705355a79a621d0e44546fb4250951ab8040503ee3d1bc99a13` |
| v10 bones JSON | SHA-256 `eab1839c7eb4d05b6e7c8a98527d40a6a88e5679c12b249e87aff65bdb686c05` |
| `part_clearance_a2.py`, `stlparts.py` | `v10_part_clearance_v1/scripts/` @ `92471641bec4f9e259acbeeae45abc671538820d`, unchanged |

## Disclosure (prior knowledge)

All v1 and A1 results, including: in the limited pose every body pair that does not involve a leg or foot is at 1.434 mm or more; the joint-range limits hold with the whole figure posed; the hand reaches 136.9 mm with the pelvis following the wave. No A2 pose or A2 clearance had been computed. Because A2 keeps the upper body rigid relative to the pelvis, the evaluator expects pairs within the upper body to keep the limited pose's clearances; the new information is in the pairs between the arms and the resting legs.

## Method

At every key:

1. **Lower body at rest:** `pelvis`, both thighs, shins and feet take their v10 rest orientation (Q = identity) and the pelvis head stays at its rest position (0, 0, 50). The wave's pelvis translation and rotation are dropped.
2. **Upper body carried over rigidly:** for every other bone b, Q″_b = Q′_pelvisᵀ · Q′_b, where Q′ is the v1 limited pose. Every relative rotation above the pelvis, including `pelvis` → `hip`, the spine, the neck, the shoulders, the elbows and the wrists, is exactly the limited pose's.
3. Attachment bones take their parent's rotation. Positions by forward kinematics. No smoothing.

What this drops on purpose: the weight shift, the body's sway and turn (they came from the pelvis), and all leg motion.

## Criteria

| | Rule |
|---|---|
| **G1** | Bone lengths within 0.01 mm of rest, 19 bones, every key. |
| **G2** | Lower body at rest: the pelvis, thigh, shin and foot bones' heads and tails equal their rest positions within 1e-9 mm at every key; and the lowest point of each foot solid (STL shells 11 and 27) is within 0.01 mm of the floor, so both feet are flat on it. |
| **G3** | Upper-body joints unchanged: for every bone above the pelvis, its rotation relative to its parent bone equals the limited pose's within 1e-6°. The 15 limited joints therefore stay inside their limits (hips, knees and ankles are at 0°). |
| **G4** | Hand reach, the v1 L3 rule: in the 22 raised keys, at one or more the highest point of `hand_right` is ≥ 116 mm and ≥ the z of the `head` bone's head at that key. |
| **G5** | Part clearance, `part_clearance_a2.py` unchanged, with `variant_B` = the input pose and `main` = the A2 pose. (a) C0 and C0b PASS; (b) `variant_B` reproduces the published result (0 keys below 1 mm, minimum 1.434 mm, 18 overlapping joint pairs); (c) A2 pose: 0 of 135 keys with a body-pair clearance below 1.0 mm; (d) every part pair listed for the 15 joints in the joint-range method has clearance > 0 at every key. If (a) or (b) fails, (c) and (d) are NOT VERIFIABLE. |

PASS or FAIL per rule. Nothing is changed after results.

## Reported, not gated

- The pelvis rotation and translation that were removed (largest values).
- Right hand: highest point and wrist height in the raised part, next to v1's; the right wrist's and hand tip's largest distance from the v1 limited positions.
- The direction the head points, largest change from v1.
- The ten closest body pairs and the pairs between arm parts and leg or pelvis parts.
- Joint pairs with clearance ≤ 0.
- Renders: front and side at the keys nearest 0.04, 2.20, 3.00, 3.40, 3.80 and 5.00 s, input pose and A2 pose.

## Not covered

- Shoulder range (measured separately, `v10_shoulder_range_v1`).
- Whether a wave with still legs and no body sway looks acceptable.
- Balance of the printed figure; clearance between keys; contact depth; the neck's larger key-to-key step (unchanged from v1).

## Reproducibility

Python 3, numpy and scipy. Each step is run twice; outputs must be byte-identical.
