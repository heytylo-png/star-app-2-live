# Tripo auto-rig evaluation: method and criteria (FROZEN before any deformation was computed)

Issue #177. Research only. Evaluator: Claude. Frozen 2026-11-10.

**Disclosure.** Before freezing, the evaluator had seen:
- the GLB structure (78 joints, no hair or jaw bones, 1 animation `greet_02`);
- skin-weight validity (all sums 1 ± 1e-7, at most 4 influences, 0 unweighted);
- mesh identity with `b4511e3f…`;
- the bind joint positions.

No posed geometry, penetration, volume or animation results had been computed or viewed.

## Inputs

- `bikini_wave.glb`, SHA-256 `7b709d8ba43745c715e5809a913a8ed9fc797950d9a040b7dd03cd80add2fbdc`, 74,676,980 bytes. User upload; not committed.
- Committed v8.3 bones (stand-in only; v10 not available): `public/rig/star_rai_tripo/star_rai_tripo_v8_3_blender_bones.json` @ `3ac5602`, SHA-256 `5d373125…`.

## Units

- Model height H = 0.978211 (Tripo normalised units).
- Thresholds are fractions of H. **T = 0.004 H** (≈ 1 mm on a ~250 mm figure).

## Skinning

- Linear blend skinning: `p' = Σ w_i · (G_i · IBM_i) p`, with G_i the posed world matrix of joint i.
- Normals are skinned with the same blended 3×3 and renormalised.
- Bind pose = `inverse(IBM)` (verified equal to the node rest pose within 2.4e-7).

## Body groups (by dominant bone)

| Group | Bones |
|---|---|
| head | Head, FacialBone, L/R_Eye, NeckTwist01/02. **Contains the fused hair.** |
| torso | BoneRoot, Hip, Pelvis, Waist, Spine01, Spine02 |
| L_arm / R_arm | Clavicle, Upperarm (+ twists), Forearm (+ twists), ElbowShareBone |
| L_hand / R_hand | Hand and all fingers |
| L_leg / R_leg | Thigh (+ twists), Calf (+ twists), KneeShareBone |
| L_foot / R_foot | Foot, ToeBase |

## Poses

Each pose applies a world-axis delta rotation at the bind position of the named joint to that joint's subtree. Left and right are applied symmetrically. glTF axes: Y up, front +Z, character left +X.

| # | Pose | Definition |
|---|---|---|
| P1 | Arms abducted to horizontal | Upperarm rotated about world Z so the Upperarm→Forearm direction becomes horizontal (outward), keeping its front–back component |
| P2 | Arms forward | Upperarm rotated by the minimal rotation taking Upperarm→Forearm onto horizontal front (0,0,1) |
| P3 | Elbows flexed 90° | Forearm subtree rotated 90° toward front: axis = Forearm→Hand dir × (front component orthogonal to it) |
| P4 | Forearm twist 90° | About the Forearm→Hand axis: Hand 90°, ForearmTwist02 60°, ForearmTwist01 30° (pronation sign) |
| P5 | Hips flexed 60° | Thigh subtree rotated 60° toward front (same axis construction as P3) |
| P6 | Knees flexed 90° | Calf subtree rotated 90° toward back |
| P7 | Head turned 45° | Head subtree rotated 45° about world Y (to character left) |
| P8 | Spine bent 20° forward | Spine01 subtree rotated 20° about world X (toward front) |

## Metrics (per pose; rest pose computed as baseline)

1. **Penetration.**
   - For every vertex p, find the nearest vertex q of a different group, using posed positions and normals. Depth = max(0, (q − p)·n_q).
   - A vertex is **penetrating** if depth > T.
   - **New** = penetrating in the pose and not in rest.
   - Report per group pair: count and max depth.
   - Pairs involving the head group are reported as **head/hair**, separately.
2. **Joint cross-section change** (collapse).
   - At elbow (P3), knee (P6), shoulder (P1) and wrist/forearm midpoint (P4).
   - Take vertices of the joint's two adjacent groups within ±0.03 H along the posed bone axis of the distal bone, and within 0.08 H radially.
   - Report the mean and 5th-percentile radial distance from the posed bone line, rest vs pose (% change).
3. **Shoulder slump (P1).** Highest surface point above the Upperarm joint within a lateral window |x − x_joint| ≤ 0.02 H, in pose vs the rest pose rigidly rotated with the upper arm. Report the drop as % H.
4. **Global volume change.** Signed volume of the skinned closed mesh, pose vs rest (%).
5. **Head/hair contact (P1, P7, P8).** New penetrations between head and torso/arm groups.

## Animation

- `greet_02`: sample 48 evenly spaced times across its time range.
- glTF interpolation: LINEAR (slerp for rotations), STEP as declared.
- Metric 1 per frame; report the worst frame.

## Weights and drivers (descriptive)

- **Heel spike:** vertices with y < 0.05 and z in [−0.039, −0.027] (per foot side). Report the dominant-bone histogram.
- **Hair beside the neck:** vertices with y in [y(L_Upperarm), y(Head)] and |x| > 0.045, whose dominant bone is in the head group. Report the count and bone histogram.

## Joint placement (informational, v8.3 stand-in; v10 NOT VERIFIABLE)

- Mapping v8.3 = s·(x, −z, y) + t.
- s from the vertical span L_Thigh→L_Upperarm (Tripo) vs thigh_left.head→upper_arm_left.head (v8.3).
- t aligns the thigh-joint midpoints.
- Report offsets in % of v8.3 stature (0.95).
- **This is not a correctness test for either rig.**

## Verdict (animation previews only)

**Gates:**
- **G1:** weights valid: |Σw − 1| ≤ 1e-4, at most 4 influences, 0 unweighted.
- **G2:** for each of P1–P4 and P6–P8, at most 50 **new** penetrating vertices between **non-head** groups.
- **G3:** P3/P4/P6 5th-percentile cross-section shrink ≤ 30 %; P1 slump ≤ 2 % H.

**Rule:**
- **USABLE:** G1 and G2 pass in all 7 poses, and G3 passes.
- **PARTLY USABLE:** G1 passes and at most 2 of the poses or G3 items fail.
- **NOT USABLE:** anything else.

P5 is reported but not gated, because hip flexion legitimately brings the thigh to the torso. Head/hair contacts are reported, not gated, because the hair is fused and cannot be separated.

## Reproducibility

The script is run twice and the output JSON must be byte-identical.
