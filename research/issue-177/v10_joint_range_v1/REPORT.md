# v10 joint bend range vs the retargeted `greet_02` (Issue #177)

Evaluator: Claude. Dates: 2026-11-10 to 11. **Research only.** v10 inputs were read only and not committed. Nothing is approved for production; the user decides. Method: `METHOD_AND_CRITERIA_FROZEN.md` @ `a6c29b2`, frozen before any result, with no amendments.

## 1. Validity

- **Rest check:** every joint is clear at rest (min 0.15 mm).
- **Control:** knee_right flexed 90° → s* = 0.2451 (allowed about 22°). **PASS:** the test detects limits.
- **Reproducibility:** two independent runs; `joint_range.json` byte-identical (SHA-256 `42b8b3eca1c3b5babd8242c01f58b7db81c8564605182c342ba2de79d4e1b213`).
- **Machine restarts:** the runs were interrupted by restarts. Per-joint checkpoints were added after the interim commit (`82e35e0`); they change nothing in the method or results. Both runs' checkpoints matched joint for joint, and the first interrupted runs' values for neck, spine and left hip match the final ones.

## 2. Results (pose: retarget amendment A1, all 135 keys)

| Joint | Verdict | Keys limited | Max demanded | Allowed at worst key | Shortfall | Worst at |
|---|---|---|---|---|---|---|
| **elbow right** | LIMITED | 39 | 78.1° | 25.1° | **53.0°** | 4.000 s |
| **knee left** | LIMITED | 81 | 59.1° | 22.0° | **37.1°** | 1.250 s |
| **wrist right** | LIMITED | 32 | 85.4° | 38.1° | **32.7°** | 3.458 s |
| **knee right** | LIMITED | 47 | 50.4° | 22.0° | **28.3°** | 3.833 s |
| **neck** | LIMITED | 62 | 36.8° | 13.1° | **23.6°** | 3.042 s |
| hip left | LIMITED | 78 | 41.0° | 21.2° | 15.0° | 1.208 s |
| wrist left | LIMITED | 15 | 48.3° | 33.6° | 14.6° | 3.000 s |
| hip right | LIMITED | 12 | 22.9° | 18.6° | 3.6° | 3.042 s |
| ankle right | LIMITED | 4 | 44.2° | 36.4° | 2.6° | 3.667 s |
| spine waist→mid_chest | LIMITED | 13 | 8.4° | 7.3° | 0.7° | 4.125 s |
| elbow left | FOLLOWS | 0 | 22.7° | — | — | — |
| ankle left | FOLLOWS | 0 | 43.3° | — | — | — |
| spine hip→lower_waist | FOLLOWS | 0 | 10.8° | — | — | — |
| spine lower_waist→waist | FOLLOWS | 0 | 9.0° | — | — | — |
| spine mid_chest→upper_chest | FOLLOWS (not exercised: 0°) | 0 | 0.0° | — | — | — |

**Not assessed (frozen):** shoulders, and the README's intended-contact pairs.

## 3. Reading (proposal)

- **The printed v10 joints allow roughly 13–38° before parts touch:**
  - knees and hips about 22°;
  - elbows about 25°;
  - wrists about 31–38°;
  - neck about 13°;
  - ankles about 35°.

  This is a property of the solid shapes with 2 mm gaps, not of the wave.
- **Elbow, knee, wrist and neck need about 25–55° more** to follow this wave. Hips and ankles need less.
- **Knees, elbows and wrists bend almost purely by swing** (twist under 11° at knees and elbows), so a hinge-style redesign (a cut-back or domed joint end on the bending side) would address them. The neck and the right wrist mix swing and large twist (up to 31° and 74°), which suggests ball-type ends.
- **Suggested target for a redesign:** the max-demanded column plus a margin, for example 10°.

## 4. Limits

- Each joint is tested alone, with the parent part fixed; combined effects are not tested.
- Only points within 25 mm of the joint are used; contact farther out is not seen.
- Keys only; nothing between keys.
- One animation (the retargeted `greet_02`). Other poses may ask for more.
- Shoulders not assessed. Contact depth, pins, friction, printability and strength not assessed.

## 5. Files

- `METHOD_AND_CRITERIA_FROZEN.md`
- `scripts/joint_range.py` (with checkpoint resume)
- `outputs/joint_range.json`, with per-key rows for each joint
- `outputs/run1.log`, `outputs/run2.log`
- `outputs/interrupted_run1/`: logs from the runs stopped by a restart

Uses `part_clearance_a2.py` and `stlparts.py` from `research/issue-177/v10_part_clearance_v1/scripts/` @ `9247164`.

Reproduce: `python3 -I scripts/joint_range.py star_rai_locked_final_v10_print.stl star_rai_locked_final_v10_blender_bones.json <pose JSON @798db9f> <dir with part_clearance_a2.py and stlparts.py> out.json [checkpoint_dir]`
