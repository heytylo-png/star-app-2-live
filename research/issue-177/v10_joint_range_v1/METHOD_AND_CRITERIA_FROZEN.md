# v10 joint bend range vs the retargeted `greet_02` (Issue #177) — method and criteria (FROZEN before any result)

Research only. Evaluator: Claude. Frozen 2026-11-10. The user said v10 is meant to be **poseable**. Inputs are read only and not committed (same files and hashes as `research/issue-177/v10_part_clearance_v1/METHOD_AND_CRITERIA_FROZEN.md` @ `5c1f056`). The pose is `variant_B` (retarget amendment A1).

## Disclosure (prior knowledge)

From `research/issue-177-v10-part-clearance-v1` @ `9247164`, the evaluator knew which joint pairs touch or overlap during the wave, and when they reach their minimum. No bend angle, demanded or allowed, had been computed.

## Reused unchanged from part clearance (A1/A2)

- STL loader and shell split
- part → bone mapping
- forward kinematics
- longest-edge bisection sampling with h = 0.25 mm
- KD-tree distance, with clearance = d_s − h

## Joints and the pairs that limit them

For a pair of parts on bones p (parent) and c (child, a descendant of p), the **joint point** is the rest head of c.

| Joint | Pairs checked |
|---|---|
| neck | head vs neck_cyl; head vs seg_upper_chest; head vs neck_marker |
| spine hip–lower_waist | seg_hip vs seg_lower_waist |
| spine lower_waist–waist | seg_lower_waist vs seg_waist |
| spine waist–mid_chest | seg_waist vs seg_mid_chest |
| spine mid_chest–upper_chest | seg_mid_chest vs seg_upper_chest |
| hip L/R | pelvis vs thigh; hip_attachment vs pelvis is excluded (same chain, no relative motion at the hip joint) |
| elbow L/R | upper_arm vs forearm; elbow_marker vs forearm |
| wrist L/R | forearm vs hand; wrist_marker vs hand |
| knee L/R | thigh vs shin; knee_marker vs shin |
| ankle L/R | shin vs foot; ankle_marker vs foot |

- **Not assessed:** the 13 README **intended contacts** (shoulder_marker vs upper_arm, pelvis vs seg_hip, and segment vs spine-marker pairs). They touch at rest by design, so a contact test says nothing about their range. The **shoulders** have no other joint pair and are **not assessed**. Their body-pair clearance was already measured (≥ 1.43 mm).

## Demanded bend

- At each key t, R_rel(t) = Q_p(t)ᵀ · Q_c(t), the child's rotation relative to the parent; it is the identity at rest.
- The demanded angle θ(t) is the rotation angle of R_rel(t).
- It is also split into **swing**, the change of the child bone's direction, and **twist**, rotation about the child bone axis.

## Allowed bend

- **Set-up:** with the parent part at rest, the child part is rotated about the joint point by R_rel(t)^s, the same axis scaled by s ∈ [0, 1].
- **Search:** s* is the largest s with clearance > 0 for every pair of that joint. Test s = 1 first; if it is not clear, bisect for 10 steps (resolution θ/1024).
- **Points used:** only points within **25 mm** of the joint point, on both parts.
- **Allowed angle at t** = s* · θ(t).
- **Rest check:** at s = 0 every listed pair must have clearance > 0. If a pair does not, that joint is NOT VERIFIABLE.

## Criteria (per joint)

| | Rule |
|---|---|
| **FOLLOWS** | s* = 1 at every key, so the printed parts can make every bend the wave asks of that joint. |
| **LIMITED** | Otherwise. Reported: the number of keys limited, the maximum demanded angle (total, swing, twist), and at the worst key the allowed angle and the shortfall (demanded − allowed). |

- **Control:** for knee_right, a 90° flexion about the knee's sideways axis must be LIMITED (s* < 1). If not, all verdicts are NOT VERIFIABLE.
- **No change after results;** any change is a new, separately frozen amendment.
- **Run twice;** the result JSON must be byte-identical.

## Not covered

- Shoulders and intended contacts.
- Combined effects of more than one joint (each joint is tested alone, parent part fixed).
- Contact depth.
- Joint mechanisms (pins, friction), printability and strength.
