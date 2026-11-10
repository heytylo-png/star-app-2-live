# v10 retarget v1: Tripo `greet_02` onto the locked v10 skeleton — method and criteria (FROZEN before any retarget result was computed)

Issue #177. **Research only.** Evaluator: Claude. Frozen 2026-11-10. The task, the method outline and criteria C1–C3 were specified by the user; this document fixes the remaining details before running. The v10 files are read from copies and are never modified, re-saved or committed. No GLB, .blend or Tripo binary is committed.

## Inputs (user uploads; hashes verified; not committed)

| File | SHA-256 |
|---|---|
| `star_rai_locked_final_v10_blender_bones.json` | `eab1839c7eb4d05b6e7c8a98527d40a6a88e5679c12b249e87aff65bdb686c05` |
| `star_rai_armature_final_v10.blend` | `f459ea1f14ca09d59b2cf7e227182b74d65ecfbb0271d1189045d1b5a8f0514f` |
| `starmodelrigpose.glb` (Tripo) | `57cb05de332adaae6271d5ba5852d5b268dab20abfd3bf4c53f92f58536229c7` |

Animation: the ORIGINAL `greet_02.001` in `starmodelrigpose.glb`. The +20° and faded files are not used.

## Disclosure (prior knowledge)

Before freezing, the evaluator knew:
- `research/issue-177-v10-compare-v1` @ `5b1265b` (bind-pose comparison: arm lengths within 5 %, Tripo ankles 40.9 vs 20 mm apart, Tripo shoulders 17 % narrower, scale 227.616 mm per Tripo unit);
- from the arm-offset and arm-fade work on the Tripo rig: in `greet_02` the right arm is the waving arm; its upper arm is at or above horizontal from about 3.04 s to 3.92 s; in the source animation the arms and hands pass into the Tripo thighs in most arms-down frames; front renders of the Tripo body at 0.04–4.2 s;
- the v10 skeleton, read from a copy of the .blend with Blender 4.5.3 (read-only; the file was written by Blender 5.2, and Blender warned of possible data loss on load): 31 bones whose heads match the JSON; attachment bones are 2 mm stubs in the .blend and zero-length in the JSON; 21 proxy meshes, each a stick of radius 1.2 mm around one bone; no actions.

No v10 pose, retargeted rotation, hand height or segment distance for any animated frame had been computed.

## Coordinate conventions

- v10: mm, Z up, faces +Y, character's left at −X. Skeleton data are taken from the JSON.
- Tripo: glTF units, Y up, faces +Z, left at +X.
- Axis map A (Tripo → v10): x_v = −x_t, y_v = z_t, z_v = y_t (a proper rotation). A Tripo rotation D becomes A·D·Aᵀ.
- Scale k: as in `v10_compare.py` @ `5b1265b` (v10 shoulder-to-ankle height divided by Tripo's, bind pose).

## Bone map: Tripo → v10's 19 bones

| v10 bone | Tripo joint (rotation source) | Tripo segment used for rest direction |
|---|---|---|
| `pelvis` (root) | `Pelvis` | — |
| `hip` | `Hip` | — |
| `lower_waist` | `Waist` | — |
| `waist` | `Spine01` | — |
| `mid_chest` | `Spine02` | — |
| `upper_chest` | `Spine02` (same source as `mid_chest`) | — |
| `head` | `Head` | — |
| `upper_arm_left/right` | `L/R_Upperarm` | `Upperarm → Forearm` |
| `lower_arm_left/right` | `L/R_Forearm` | `Forearm → Hand` |
| `hand_left/right` | `L/R_Hand` | `Hand → Mid1` |
| `thigh_left/right` | `L/R_Thigh` | `Thigh → Calf` |
| `shin_left/right` | `L/R_Calf` | `Calf → Foot` |
| `foot_left/right` | `L/R_Foot` | `Foot → ToeBase` |

Where the other Tripo joints go:
- **Root translation:** the v10 `pelvis` head follows the Tripo `Hip` joint: rest position + k · A · (Hip(t) − Hip(bind)). `BoneRoot` has no v10 counterpart; its motion is included because world transforms are used.
- **Extra spine bone:** Tripo has 3 spine joints above `Hip` (`Waist`, `Spine01`, `Spine02`); v10 has 4 bones above `hip`. `upper_chest` and `mid_chest` both take `Spine02`, so there is no bend between them.
- **Neck:** `NeckTwist01` and `NeckTwist02` are not mapped. Their rotation reaches the v10 `head` through the world rotation of `Head`; their bend along the neck is dropped (v10 has one neck point).
- **Clavicles:** not mapped. The v10 shoulder points are rigid on `upper_chest`, so the shoulder shift caused by clavicle motion is dropped. The clavicle's rotation is included in the world rotation of `Upperarm`.
- **Twist bones** (`UpperarmTwist`, `ForearmTwist`, `ThighTwist`, `CalfTwist`), **share bones** (`ElbowShareBone`, `KneeShareBone`): dropped. The mapped joints carry the limb rotation.
- **Fingers** (15 per hand), **toes** (`ToeBase`), **eyes**, **`FacialBone`**: dropped. `Mid1` and `ToeBase` are used only as rest-direction end points.
- **v10 attachment bones** (12): not animated. Each stays rigid on its parent.

## Retarget method

For every `L_Upperarm` rotation key time t of `greet_02.001` (the keys; 24 per second):

1. **Tripo world rotations.** W_j(t) = rotation part (polar decomposition) of joint j's world matrix, with channels sampled as in `collide_v2.py` @ `19d405f`. Rest = the bind pose, W_j(bind) = rotation part of the inverse of the joint's inverse bind matrix.
2. **Rest-relative world delta.** D_j(t) = A · W_j(t) · W_j(bind)ᵀ · Aᵀ.
3. **v10 world delta per bone.** Q_b(t) = D_j(t) · C_b, with j the mapped joint and C_b the rest correction:
   - **Arms, hands, torso, head:** C_b = identity. The bone turns from its own v10 rest pose by the same world rotation as the Tripo joint turns from its bind pose.
   - **Legs (rest-pose stance correction):** for `thigh` and `shin`, C_b is the shortest rotation that takes the v10 rest bone direction to the Tripo bind direction of the mapped segment (in v10 axes). The v10 leg bones then point in the same world directions as the Tripo leg segments at every frame, so the Tripo rest stance is not mistaken for motion.
   - **Feet:** the bone definitions differ (v10's foot bone runs diagonally to the toe; Tripo's runs ankle to toe base). C_b is the rotation about world Z that takes the horizontal heading of the v10 rest foot direction to the horizontal heading of the Tripo bind `Foot → ToeBase` direction. Heading is matched; pitch is not.
4. **Positions (forward kinematics).** head_b(t) = head_parent(t) + Q_parent(t) · (head_b(rest) − head_parent(rest)); tail_b(t) = head_b(t) + Q_b(t) · (tail_b(rest) − head_b(rest)). Attachment bones use their parent's Q. Only the root has a translation. No bone is scaled.

**Interpretation chosen (manual choice 1):** "rest-pose stance correction for the legs" is read as correcting for the difference between the two rest stances, so the v10 legs follow the Tripo leg directions. The arms use the plain rest-relative transfer as specified, although the two rest arm poses also differ (Tripo's arms angle out more).

## Criteria

Evaluated at every key (step above) on the main method.

| | Rule |
|---|---|
| **C1** | For each of the 19 v10 bones at every key: abs(|tail − head| − rest length) ≤ **0.01 mm**. |
| **C2** | The raised part of the wave = the keys where the Tripo source `R_Upperarm → R_Forearm` direction is at or above horizontal. C2 holds if at one or more of those keys the highest point of the `hand_right` bone (the greater z of its head and tail) is ≥ **116 mm** and ≥ the z of the `head` bone's head at the same key. If no key is in the raised part, C2 fails. |
| **C3** | Capsule test at every key. Each of the 19 bones is a capsule around its head–tail segment with radius **1.2 mm** (the radius of v10's own proxy sticks in the .blend; it is a skeleton radius, not body thickness). Groups: left arm (`upper_arm`, `lower_arm`, `hand`), right arm, left leg (`thigh`, `shin`, `foot`), right leg, torso (`pelvis`, `hip`, `lower_waist`, `waist`, `mid_chest`, `upper_chest`). For every pair of segments from two different groups, the surface clearance = segment-to-segment distance − 2.4 mm must be ≥ **2 mm** (axis distance ≥ 4.4 mm). Excluded as sharing a joint: `upper_arm` vs `upper_chest` (shoulder), and `thigh` vs `pelvis` (hip joint). C3 holds if no tested pair at any key is below 2 mm. |

- **Sanity check for C3:** the v10 rest pose must itself pass. If it does not, C3 is NOT VERIFIABLE.
- The `head` bone is not a limb or a torso segment in the user's wording; arm-vs-head clearances are reported, not gated.
- **Verdict:** PASS or FAIL per criterion; no combined verdict. No criterion, radius, window or map is changed after results are seen; any change is a new, separately frozen amendment.

## Reported, not gated

- **Per-joint angle differences vs Tripo:** per key, for each of the 12 limb bones, the angle between the v10 bone direction and the Tripo segment direction (v10 axes); and joint angles (elbow, knee: angle between the two adjacent bone directions; shoulder, hip: angle of the upper bone from straight down) on v10 minus on Tripo. Maximum and mean over keys.
- **Renders:** v10 skeleton, front and side views, at t = 0.04, 2.20, 3.00, 3.40, 3.80 and 5.00 s. The skeleton is rebuilt in a new Blender scene from the JSON; the v10 .blend is not used for rendering.
- **Variant B (for information):** the same run with the leg-style direction correction also applied to `upper_arm`, `lower_arm` and `hand`. C1–C3 are computed for it and labelled non-gating.
- **C3 detail:** minimum axis distance per group pair and the key where it occurs, so other radii can be applied by a reviewer; arm-vs-head minimum.
- **C2 detail:** per-key z of the right wrist, right hand tip and `head` bone head; the keys of the raised part.
- **Feet:** z range of both ankles and foot tails over the animation (floor drift caused by the different leg lengths).
- **Blender cross-check of C1:** the retargeted pose is applied to a skeleton built from the JSON in a new Blender scene; bone head and tail positions evaluated by Blender are compared with the forward kinematics above.
- **JSON vs .blend:** bone head and tail differences (read-only load of a copy).
- **Tripo rest check:** difference between the bind pose and the pose given by the GLB's static node transforms.
- v10 file hashes before and after the run.

## Not covered

- No body mesh: v10 has only a skeleton here, so body-surface collisions are not tested. C3 is a skeleton clearance test.
- Clearances are tested at keys only, not swept between keys.
- No finger, face or toe motion; no bone roll (twist about a bone's own axis is transferred but cannot be seen on a stick skeleton).

## Reproducibility

- Python 3, numpy only for the retarget and criteria. Run twice; the result JSON must be byte-identical.
- The full per-key retargeted pose is derived from a Tripo preset animation; it is hashed and delivered to the user, not committed. Per-key criterion values are committed.
