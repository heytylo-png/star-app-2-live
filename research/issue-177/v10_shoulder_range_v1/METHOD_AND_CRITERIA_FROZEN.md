# v10 shoulder range v1: how far the printed arm can swing about the shoulder — method and criteria (FROZEN before any result)

Issue #177. **Research only.** A measurement of the existing printed parts for rig use; no part is changed and no redesign is proposed. Evaluator: Claude. Frozen 2026-11-13. Inputs are read from copies and are not committed.

## Why

The joint-range check (`v10_joint_range_v1` @ `d5f543e`) could not assess the shoulders: the only joint pair there, the shoulder marker against the upper arm, touches by design. The limited wave leans on the shoulders, and any new gesture would too. This measures the range that the rest of the body allows the arm.

## Inputs

| Input | Identity |
|---|---|
| Print STL | `star_rai_locked_final_v10_print.stl`, SHA-256 `42010637c9d80705355a79a621d0e44546fb4250951ab8040503ee3d1bc99a13` (from `cadbro_v10_cadquery_export_20261110.zip`, `c67d9f1f…b45b`) |
| v10 bones JSON | SHA-256 `eab1839c7eb4d05b6e7c8a98527d40a6a88e5679c12b249e87aff65bdb686c05` |
| `part_clearance_a2.py`, `stlparts.py` (loader, shell split, part map, sampling) | `v10_part_clearance_v1/scripts/` @ `92471641bec4f9e259acbeeae45abc671538820d`, reused unchanged |

## Disclosure (prior knowledge)

Before freezing, the evaluator knew:
- the README's rest clearances: upper arm to `seg_mid_chest` 1.750 mm (left) and 2.199 mm (right); the solids' extents;
- from part clearance: during the wave the upper arms stay 1.434 mm or more from the chest segments, with the right shoulder rotated far enough to lift the hand above the head;
- that the shoulder markers touch the upper arms by design and overlap them during the wave.

No swing limit in any direction had been computed.

## Set-up

- All parts are in the v10 rest pose except one arm.
- **Moving group:** one side's upper arm with its elbow marker (**arm-only**), or the whole straight arm: upper arm, elbow marker, forearm, wrist marker and hand, with elbow and wrist at rest (**straight arm**).
- **Fixed group:** every other part, including the other arm, **except that side's shoulder marker**, which is excluded because it touches the upper arm by design.
- **Joint point:** the rest head of `upper_arm_<side>`.
- **Rotation:** pure swing, no twist about the arm's own axis. With u the rest direction of the upper arm, f the forward direction (+Y) made perpendicular to u, and o = the direction perpendicular to both that points away from the body (−X for the left arm, +X for the right), the hand moves toward m(φ) = cos φ · f + sin φ · o, and the rotation axis is u × m(φ). φ = 0° is forward (flexion), 90° is out to the side (abduction), 180° is backward (extension), 270° is toward the body (adduction).
- **Sampling and distance:** as in part clearance A1/A2: longest-edge bisection with h = 0.25 mm, KD-tree nearest distance d_s, clearance = d_s − h.

## Measurement

For each side, each group and each of 24 directions (φ = 0°, 15°, …, 345°):

- Step the swing angle θ from 0° to 180° in 2.5° steps.
- **First-contact angle:** the largest θ on the grid such that the clearance is > 0 at every grid step from 0° to θ. If the clearance is > 0 at all steps, it is reported as "≥ 180°".
- Also recorded: the fixed part that is closest at the first step that is not clear, and the smallest clearance over the clear range.
- The result is rounded down to the 2.5° grid. Contact between grid steps is not seen.

## Validity criteria

| | Rule |
|---|---|
| **S0** | Rest: at θ = 0° the clearance is > 0 for both sides and both groups, and the arm-only rest clearance (which is against `seg_mid_chest`) is within 0.30 mm of the README values 1.750 mm (left) and 2.199 mm (right), comparing d_s as in part-clearance A2. |
| **S1** | Control: in the adduction direction (φ = 270°) the arm-only first-contact angle is below 15° on both sides, because the arm starts 1.75–2.2 mm from the chest. If not, the test does not detect contact and all results are NOT VERIFIABLE. |
| **S2** | Two runs give a byte-identical result file. |

There is no pass or fail for the range itself; it is a measurement.

## Reported

- The first-contact angle for all 24 directions, both sides, both groups, with the limiting part.
- Named directions: flexion (0°), abduction (90°), extension (180°), adduction (270°), and the two diagonals forward-out (45°) and back-out (135°).
- For the limited wave: at each key, the right and left shoulder's swing direction and angle (from the v1 limited pose, relative to `upper_chest`) next to the arm-only first-contact angle interpolated between the two neighbouring directions; and how many keys are within 5° of it or beyond it. This is information only: the wave also twists the arm and bends the elbow, which this measurement does not include.

## Not covered

- **The shoulder marker.** How far the upper arm can turn before it binds on the marker is not measured; the marker touches at rest, so a contact test cannot tell.
- Twist about the arm's axis; bent elbows; a moving torso or head.
- Directions between the 15° grid; angles between the 2.5° steps; contact depth.
- Joint mechanism, friction, printability and strength.

## Reproducibility

Python 3, numpy and scipy. Run twice; byte-identical output required.
