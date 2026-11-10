# v10 printed-part clearance under the retargeted `greet_02` (Issue #177)

Evaluator: Claude. Date: 2026-11-10. **Research only.** All v10 inputs were read only and none are committed (hashes in `METHOD_AND_CRITERIA_FROZEN.md`). Nothing is approved for production; the user decides.

## 1. Verdicts

| Version | C0 calibration | C0b detection | C1 body pairs ≥ 1 mm (A1 pose) |
|---|---|---|---|
| **Frozen method + A1 sampling** (`5c1f056`, `1d24992`) | **FAIL** | PASS | **NOT VERIFIABLE** (on record) |
| **+ A2, post-hoc** (`bb8f497`) | **PASS** (22/22 within ±0.30 mm; max error 0.006 mm) | PASS (hand_right\|thigh_right in contact) | **PASS:** 0 of 135 keys below 1 mm; min **1.434 mm** (upper_arm_left vs seg_mid_chest, 5.458 s; 1.75 mm at rest) |

- **A2 was frozen after the frozen-method failure.** The failure was a test-design error: the prefilter skipped the calibration pairs, and spine/neck joints were classed as body pairs. A2 is not blind; what had been seen is listed in the amendment.
- **Reproducibility:** run twice, `part_clearance_a2.json` byte-identical (SHA-256 `2c2957cd8ac6e232d3691b08c0f15acf7ee15c3f4243b4c56e2b0f1945f1365c`).
- **An earlier A2 run was killed by a machine restart.** Its log (`outputs/part_clearance_a2_interrupted_run.log`) shows the same C0, C0b and C1 lines.

## 2. Body pairs (A1 pose): the printed body stays clear of itself

Closest body pairs over all 135 keys:

| Pair | Clearance | At |
|---|---|---|
| upper_arm_left vs seg_mid_chest | 1.434 mm | 5.458 s |
| upper_arm_right vs seg_mid_chest | 1.924 mm | 1.917 s |
| upper_arm_right vs seg_upper_chest | 2.776 mm | 3.458 s |
| upper_arm_left vs seg_upper_chest | 3.674 mm | 5.458 s |
| shoulder_marker_left vs seg_mid_chest | 4.771 mm | 1.708 s |

**Everything else is ≥ 5 mm.** The wave's hand never reaches the head solid.

**Original pose (`main`, information only): FAIL**, 97/135 keys. Hands and forearms go into the thighs, pelvis and hip segment. This confirms on real parts that the arm rest correction (retarget amendment A1) is needed.

## 3. Joint pairs (C2, reported, not gated): the wave bends joints further than the printed shapes allow

18 joint pairs touch or overlap at some key (A1 pose):

| Region | Pairs (time of deepest contact) |
|---|---|
| Neck | head vs seg_upper_chest (3.208 s); head vs neck_cyl (3.208 s) |
| Spine | pelvis vs seg_hip (3.583 s); seg_mid_chest vs seg_waist (4.125 s); 4 segment-vs-spine-marker pairs |
| Shoulders | shoulder_marker vs upper_arm, L (4.917 s) and R (1.458 s) |
| Elbows | forearm_right vs upper_arm_right (2.917 s) |
| Wrists | forearm vs hand, L (2.958 s) and R (3.875 s) |
| Hips | pelvis vs thigh, L (0.333 s) and R (3.042 s) |
| Knees | thigh vs shin, L (0.542 s) and R (4.125 s) |
| Ankle | shin_right vs foot_right (3.667 s) |

- **Depth is not measured.** This method floors at −h (−0.25 mm), so "−0.25" means contact or overlap of unknown depth.
- **Joint markers stay clear** (0.15 mm or more), as do the elbow_left and ankle_left pairs.
- **Meaning:** the v10 solids are rigid blocks with 2 mm joint gaps. Any real bend at a joint brings the rims together within a few degrees, so the printed pieces, as shaped, cannot follow this animation at most joints.
- **For a poseable print**, the joints need shaped ends (domes, sockets or chamfers) or larger gaps. For a static print, this does not matter.

## 4. Limits

- Keys only; no clearance between keys. Contact depth not measured. Hair, skin and clothing not included.
- The part-to-bone mapping is by position and the README's part list (frozen). Shells are identified by index, not by name, since the STL has no names.
- The pose is the retarget's, which drops fingers, twist bones and clavicle shift.
- The split archive `cadbro_cadquery_exports_20261110.zip` (other CADBro variants) was not used.

## 5. Files

- **Frozen and amendments:**
  - `METHOD_AND_CRITERIA_FROZEN.md` (`5c1f056`)
  - `AMENDMENT_A1_SAMPLING_FROZEN.md` (`1d24992`)
  - `AMENDMENT_A2_CALIBRATION_AND_SPINE_JOINTS_FROZEN.md` (`bb8f497`)
- **Scripts:**
  - `scripts/stlparts.py`
  - `scripts/part_clearance.py` (frozen + A1)
  - `scripts/part_clearance_a2.py` (+ A2)
- **Outputs:**
  - `outputs/part_clearance_a2.json`
  - `outputs/part_clearance_a2_run1.log`, `outputs/part_clearance_a2_run2.log`
  - `outputs/part_clearance_a2_interrupted_run.log`
  - `outputs/part_clearance_frozen_run_log.txt` (the frozen-method run; stopped after its verdict lines to free the CPU)

Reproduce: `python3 -I scripts/part_clearance_a2.py star_rai_locked_final_v10_print.stl star_rai_locked_final_v10_blender_bones.json <pose JSON from retarget_v10.py @798db9f> scripts out.json`

## 6. Next (user decides)

1. **Is v10 meant to be poseable or static?** If poseable, a per-joint bend-range check (the bend each printed joint allows vs the bend the wave asks for) would say which joints need redesign and by how much.
2. **If depth matters,** add an inside/outside test to measure overlap depth.
