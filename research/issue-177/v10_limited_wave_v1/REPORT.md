# v10 limited wave v1: the retargeted `greet_02` held inside the measured printed-joint limits (Issue #177)

Evaluator: Claude. Date: 2026-11-12. **Research only**, rig side: no part geometry is changed and nothing here proposes a redesign. Nothing is approved for production; the user decides. The v10 files were read from copies and are unchanged. No GLB, .blend, STL or pose file is committed.

Frozen method: `METHOD_AND_CRITERIA_FROZEN.md` (SHA-256 `6ddaa9fffd2be1f7d9863af68bda7e939e78bc613c7ad1d019ea336adcea1727`), committed and pushed as `9e053aa422e6b664a4ad2bebedffc92462da678e` before any limited pose was computed. Unchanged since.

## Amendment A2 results: legs in the v10 rest stance (2026-11-13)

Frozen: `AMENDMENT_A2_LEGS_AT_REST_FROZEN.md` (SHA-256 `e55204cb288c6b6bb50fa106d8915a7bd87a18a7b573fb078d79eb7bbc3bcfc2`), committed and pushed as `818896a` before any A2 pose or clearance was computed. Unchanged since. The A1 section and sections 1–8 below are unchanged.

### A2.1 Summary

**With the legs left in v10's own stance, the limited wave passes every frozen check.** Both feet stay flat on the floor, no two parts come closer than 1.43 mm, the limited joints stay clear, and the hand still reaches head height. The cost: the body no longer sways or turns, and the arm still reaches forward as in v1.

| Rule | Result | Measured |
|---|---|---|
| **G1** bone lengths | PASS | largest error 2e-13 mm |
| **G2** lower body at rest, both feet on the floor | PASS | position error 0.0 mm; foot-to-floor error 0.0 mm at every key |
| **G3** upper-body joints unchanged | PASS | largest difference 9.8e-15° (see A2.2) |
| **G4** hand reach (v1 L3 rule) | PASS | 22 of 22 raised keys; highest hand point 141.6 mm |
| **G5a** calibration (C0, C0b) | PASS | C0 22/22 within 0.006 mm; C0b detects the control contact |
| **G5b** published result reproduced on the input pose | PASS | 0 keys below 1 mm; minimum 1.434 mm; 18 overlapping joint pairs |
| **G5c** body pairs ≥ 1 mm in the A2 pose | PASS | 0 of 135 keys below 1 mm; minimum 1.434 mm, `seg_mid_chest\|upper_arm_left`, 5.458 s |
| **G5d** the 15 limited joints stay clear | PASS | all 25 listed part pairs > 0; lowest 0.002 mm |

### A2.2 Disclosure: the G3 check was corrected after a first FAIL

- The first run of `legs_at_rest.py` reported G3 **FAIL**: 1.323e-05° against the 1e-6° rule.
- Cause: the check computed the angle as acos of the matrix trace, which cannot resolve angles below about 1e-5° in double precision. It was a fault of the measuring formula, not of the pose.
- The check now uses an atan2 form, which gives 9.761e-15°. The frozen rule and its 1e-6° tolerance were not changed.
- The pose file is byte-identical before and after this fix (SHA-256 `25b7c486…db9c`). Both values are in `outputs/legs_at_rest_result.json` (`first_implementation_acos_form_deg`, and per key).
- A reviewer should judge whether this counts as a measurement fix, as claimed here, or as a change after a result.

### A2.3 Pre-registered results (MEASURED)

- **Removed pelvis motion:** up to 22.5° of rotation (1.167 s) and up to 28.1 mm of translation (3.958 s).
- **Right hand, raised part:** highest hand point 141.6 mm (v1: 136.9 mm); highest wrist 131.3 mm; wrist at or above 116 mm at 20 of 22 keys.
- **Distance from the v1 limited positions:** right wrist up to 34.2 mm (4.042 s); right hand tip up to 35.4 mm (4.083 s).
- **Head direction:** changes by up to 13.4° from v1 (1.125 s).
- **Closest body pairs:** `seg_mid_chest|upper_arm_left` 1.434 mm; `seg_mid_chest|upper_arm_right` 1.924 mm; `seg_upper_chest|upper_arm_right` 2.776 mm; `seg_upper_chest|upper_arm_left` 3.674 mm; `seg_mid_chest|shoulder_marker_left` 4.771 mm. Every other body pair is at the method's 5 mm search bound or beyond.
- **Arms against legs and pelvis:** no pair is closer than 5 mm at any key.
- **Joint pairs with clearance ≤ 0:** 7, the same seven as in A1 (`pelvis|seg_hip`, both shoulder markers against the upper arms, four segment-against-spine-marker pairs). All are README intended contacts.
- **Thin margins by construction:** five limited-joint pairs sit at 0.002–0.003 mm (`forearm|hand` both sides, `head|seg_upper_chest`, `seg_mid_chest|seg_waist`, `forearm_right|upper_arm_right`).
- **Blender cross-check** (`blender_check_render.py`, unchanged): bone heads within 0.0006 mm of the JSON pose over 135 keys.
- **Determinism:** `legs_at_rest.py` and the part-clearance run were each run twice; outputs byte-identical.
- Render: `outputs/legs_at_rest_front_side.png`.

### A2.4 Files not committed (delivered to the user)

| File | SHA-256 | Bytes |
|---|---|---|
| `v10_greet02_limited_legsrest_pose.json` | `25b7c48678f72b028bf742331ba13c9a2813059105f2f417602fe7f4d319db9c` | 1,192,886 |
| `v10_greet02_limited_legsrest_TEST.blend` (new scene, not the v10 file) | `b777b6ce8d660915f1eac4f4dbf6d9da8cd9939f1cf70476d7d3938a78018b36` | 1,694,656 |

### A2.5 Limits

- Passing these checks does not make the wave look right. With still legs, no sway and a forward-reaching arm it may read as stiff; that is a visual judgment for the user.
- Shoulder range is not covered here (`v10_shoulder_range_v1`, in progress).
- Not tested: balance of the printed figure, clearance between keys, contact depth. The neck's larger key-to-key step is unchanged from v1.
- Not independently reviewed.

### A2.6 Reproduce

```
python3 -I scripts/legs_at_rest.py PRINT.stl V10_BONES.json LIMITED_POSE.json STLPARTS_DIR RESULT.json A2_POSE_OUT.json
python3 -I part_clearance_a2.py ...   # @ 9247164, on a pose file with variant_B = input pose, main = A2 pose
```

## Amendment A1 results: feet re-planted; part clearance of the limited pose (2026-11-13)

Frozen: `AMENDMENT_A1_FEET_AND_PART_CLEARANCE_FROZEN.md` (SHA-256 `7f39e162e82c6a4c2d74e28ce904da9b573be95132673694b073361456c77bd9`), committed and pushed as `1d6914a8f597fc73359c888447d97a34a03a0a62` before the STL was loaded or any A1 result computed. Unchanged since. Sections 1–8 below are the v1 report as published at `9bb9c3f`.

### A1.1 Summary

**The limited wave does not work from the waist down.** Holding the knees and hips to their limits straightens the left leg, and that leg's foot then runs into the right foot. Re-planting by shifting the whole figure removes the floor penetration but leaves the weight-bearing right foot in the air. The upper body is clear, and the joint limits themselves are confirmed.

| Rule | Result | Measured |
|---|---|---|
| **F1** lowest foot point on the floor | PASS | error 0.0 mm at every key |
| **F2** right ankle does not slide | PASS | 2e-15 mm |
| **F3** no rotation changed | PASS | rotations copied unchanged |
| **F4** hand reach (v1 L3 rule) | PASS | 17 of 22 raised keys; highest point 138.8 mm |
| **P0** calibration of the part-clearance script here | PASS | C0 22/22 within 0.006 mm; C0b detects the control contact |
| **P1** published result reproduced on the input pose | PASS | 0 keys below 1 mm; minimum 1.434 mm, `seg_mid_chest\|upper_arm_left`, 5.458 s; 18 overlapping joint pairs. All as published at `9247164` |
| **P2** body pairs ≥ 1 mm in the limited pose | **FAIL** | 39 of 135 keys below 1 mm, all `foot_left\|foot_right`; 26 of them in contact or overlap |
| **P3** the 15 limited joints stay clear | PASS | all 25 listed part pairs > 0 at every key; lowest 0.002 mm (`head\|seg_upper_chest`, 1.417 s) |

### A1.2 Feet (MEASURED)

- **Before the shift** the left foot solid is up to 9.30 mm below the floor and the right up to 2.84 mm (input pose: 2.26 mm and 0.42 mm).
- **After the shift** nothing is below the floor, but the two feet cannot both touch:
  - the **right** foot, which carries the weight in the source animation, is more than 0.5 mm above the floor at 81 of 135 keys, by up to **9.32 mm**;
  - the left foot is above the floor at 29 keys, by up to 2.66 mm;
  - both feet touch the floor together at only 1 key.
- **Size of the shift:** up to 9.30 mm upward and up to 24.98 mm sideways. Largest key-to-key change 1.24 mm vertically and 3.20 mm horizontally.
- With the knees at their 22° limit the legs cannot shorten, so no rigid shift can put both feet down. See `outputs/replanted_front_side.png`.

### A1.3 Part clearance (MEASURED; `part_clearance_a2.py` @ `9247164`, unchanged, two runs byte-identical)

- **Feet collide.** `foot_left|foot_right` is below 1 mm at 39 keys: every key from 0.042 s to 1.583 s (38 keys) and the last key, 5.625 s. At 26 keys the solids touch or overlap (the method cannot measure depth).
- **Everything else is clear.** The next closest body pairs are the upper arms against the chest segments, 1.434 mm and above, the same values as in the input pose. The forward-reaching arm does not come near the head or torso solids.
- **The joint limits hold with the whole figure posed.** Overlapping joint pairs drop from 18 in the input pose to 7. None of the 7 belongs to a limited joint: they are `pelvis|seg_hip`, both shoulder markers against the upper arms, and four segment-against-spine-marker pairs. All seven are among the pairs the joint-range check did not assess (the README's intended contacts).
- **Margins are thin by construction.** The limited joints sit right at their limit; the smallest clearance among them is 0.002 mm.

### A1.4 Decision recorded: the arm

Kept as limited, as stated in the frozen amendment. A new gesture would rest on the shoulders, whose range is not measured.

### A1.5 Files not committed (delivered to the user)

| File | SHA-256 | Bytes |
|---|---|---|
| `v10_greet02_limited_replanted_pose.json` | `998c2aaf4da23829be4319d4ca36135566cc09fbb288aa97344e29afef81e630` | 1,536,679 |
| `v10_greet02_limited_replanted_TEST.blend` (new scene, not the v10 file) | `79abb6a784a7e1623c5c38b3df06b1d8c0e5d8db59d4ad55436f3636f839dd0c` | 1,694,656 |

Inputs: CAD export zip `c67d9f1f…b45b`, print STL `42010637…9a13`; not committed.

### A1.6 Proposal (nothing done; the user decides)

Clamping the legs gives a stance the printed figure cannot stand in. A cleaner rig-side choice is to **stop taking the legs from the wave**: keep the hips, knees and ankles in v10's own rest stance, keep the pelvis level and at rest height, and take only the spine, neck and arms from the limited wave. Both feet then stay flat on the floor by construction and the feet cannot collide. This would be amendment A2, frozen before running, with the same part-clearance and floor checks.

## 1. Result per criterion

| Criterion | Result | Measured |
|---|---|---|
| **L1** bone lengths unchanged (≤ 0.01 mm) | **PASS** | 2e-13 mm; 0.0003 mm when evaluated in Blender |
| **L2** every assessed joint within its published allowed angle at every key | **PASS** | all 15 joints, 135 keys; joints with s* = 1 are unchanged (0.0°) |
| **L3** right hand at or above the head bone's head (z 116) in the raised part | **PASS** | 17 of 22 raised keys; highest point 136.9 mm (input 141.4 mm) |
| **L4** skeleton clearance ≥ 2 mm (capsule radius 1.2 mm) | **PASS** | smallest axis distance 13.4 mm (left foot vs right foot) |

**The evaluator's stated expectation was wrong.** The frozen file predicted L3 would probably fail. It passes, because the shoulder does most of the lifting and the shoulder is not limited (its range was never measured).

## 2. What the limited wave loses (MEASURED)

The criteria pass, but the motion is visibly different. See `outputs/limited_wave_front_side.png` (rows: input front, limited front, input side, limited side).

- **The hand no longer comes back to the head.** The right elbow bends at most 25.3° instead of 78.1°, so the arm reaches up and forward, nearly straight. The right wrist ends up to 27.4 mm from its input position and the hand tip up to 39.3 mm (37.1 mm within the raised part). The wrist alone reaches 116 mm at 10 of the 22 raised keys.
- **The knees barely bend.** Both are held to 22.0° (input 59.1° left, 50.4° right), so the weight-shift stance at the start is mostly gone.
- **The left foot goes through the floor.** Straighter legs with an unchanged pelvis height push the left foot tail down to −97.2 mm; the floor is at −88. It is more than 0.5 mm below the floor at 81 of 135 keys (input: 9 keys, lowest −90.1 mm). Nothing re-plants the feet. The right foot stays within 0.2 mm of the floor.
- **The head turns less.** The direction the head points changes by up to 18.2°.
- **The neck gets jerkier.** Its largest key-to-key change rises from 6.8° to 9.5°. The right ankle's rises from 2.8° to 3.4°. Every other joint is as smooth as the input or smoother.
- **The left arm is almost unchanged** (wrist within 0.8 mm).
- 128 of 135 keys have one or more joints limited.

## 3. Per joint

| Joint | Largest angle, input | Largest angle, limited | Keys changed | Pure swing of the input | Published allowance when limited (lowest) |
|---|---|---|---|---|---|
| elbow right | 78.1° | 25.3° | 39 | 78.1° | 25.0° |
| knee left | 59.1° | 22.0° | 81 | 59.1° | 22.0° |
| knee right | 50.4° | 22.0° | 47 | 50.4° | 22.0° |
| wrist right | 85.4° | 64.5° | 32 | 57.5° | 31.5° |
| neck | 36.8° | 32.1° | 62 | 28.1° | 10.1° |
| hip left | 41.0° | 28.5° | 78 | 29.4° | 21.1° |
| wrist left | 48.3° | 37.7° | 15 | 45.0° | 33.6° |
| hip right | 22.9° | 22.9° | 12 | 20.6° | 18.0° |
| ankle right | 44.2° | 44.2° | 4 | 25.1° | 34.8° |
| spine waist→mid_chest | 8.4° | 8.4° | 13 | 7.4° | 7.1° |
| elbow left, ankle left, three other spine joints | unchanged | unchanged | 0 | — | — |

- **Why "largest angle, limited" can exceed the allowance column:** the allowance depends on the direction of the bend at each key. A joint can be free at one key (for example the right wrist at 64.5°) and limited at another where it bends a different way.
- **Pure swing** is the change in the child bone's direction alone, with twist about its own axis removed. No bone map can ask for less than this at the same joint positions. For the right elbow and both knees the pure swing equals the full demand, so their shortfall comes from the wave itself and not from the retarget.

## 4. Other pre-registered results

- **Blender cross-check** (`outputs/blender_check.json`, Blender 4.5.3 LTS, skeleton rebuilt from the JSON): positions agree with the forward kinematics to 0.0006 mm.
- **Reproducibility:** run twice; `limited_wave_result.json` (`539b0681…`) and the pose file byte-identical.
- **Feet, ankle heights:** left −64.0 to −59.3 mm (input −61.7 to −50.6); right −64.1 to −60.4 mm (input −61.5 to −55.3). Rest is −62.0.
- **L4 input comparison:** the input pose's smallest axis distance is 14.1 mm.

Post-hoc counts in §2 (keys with the foot below the floor, keys with any joint limited) are read from the committed per-key data; they are not criteria.

## 5. Files not committed (delivered to the user)

| File | SHA-256 | Bytes |
|---|---|---|
| `v10_greet02_limited_pose.json` | `b5276ff932efbcdab1136d0ab02ae5a0925e6494732491034d32dbcf12391ed2` | 1,534,959 |
| `v10_greet02_limited_TEST.blend` (new scene rebuilt from the JSON, with the limited wave as an action; not the v10 file) | `a6a0335b341127dbdd21519ca419f93d25f333756d646518683c124da08763b8` | 1,694,656 |

Inputs: pose `aaa2fe73…2355` (variant B), `joint_range.json` `42b8b3ec…b213` @ `d5f543e`, v10 bones JSON `eab1839c…6c05`. The v10 .blend (`f459ea1f…514f`) was not used; its copy is unchanged.

## 6. Limits

- **Part clearance in the limited pose is not tested.** Each limit comes from a test of one joint alone. With the arm now reaching forward and the legs straighter, limbs and body parts are in new places; whether the printed parts clear each other needs the part-clearance test with the STL, which this evaluator does not have. L4 is skeleton-only.
- **Shoulders are not limited,** because their range was not assessed. The wave leans on them heavily; if their real range is small, the hand will not reach.
- Each key is limited on its own; nothing is smoothed, and nothing is tested between keys.
- The limits are those measured for this wave's bend directions; they are not a general range of motion.
- One animation only.

## 7. Decisions for the user (proposals; nothing done)

1. **Feet:** re-plant them (lower-body correction so the feet stay on the floor) or accept the stance as is. Needs a frozen amendment.
2. **Neck:** smooth the limited neck motion, or accept the step.
3. **Arm shape:** the limited arm reaches forward instead of waving at the head. If that is not acceptable on the current parts, the remaining rig-side option is a different gesture authored within about 25° of elbow bend.
4. **Next check:** part clearance of this limited pose with the STL, and a shoulder range measurement.

## 8. Reproduce

```
python3 -I scripts/limit_wave.py star_rai_locked_final_v10_blender_bones.json v10_greet02_pose.json joint_range.json outputs/limited_wave_result.json v10_greet02_limited_pose.json [input_pose_for_renders.json]
blender -b --python scripts/blender_check_render.py -- star_rai_locked_final_v10_blender_bones.json v10_greet02_limited_pose.json outputs/blender_check.json <render prefix> 0.041667,2.208333,3.0,3.416667,3.791667,5.0 [new.blend]
```

`v10_greet02_pose.json`: `v10_retarget_v1/scripts/retarget_v10.py` @ `798db9f`. `joint_range.json`: `v10_joint_range_v1/outputs/` @ `d5f543e`. `blender_check_render.py` is copied unchanged from `v10_retarget_v1/scripts/` @ `571381c`. Python 3.13, numpy 2.5.3; Blender 4.5.3 LTS.
