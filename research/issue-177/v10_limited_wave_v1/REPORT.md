# v10 limited wave v1: the retargeted `greet_02` held inside the measured printed-joint limits (Issue #177)

Evaluator: Claude. Date: 2026-11-12. **Research only**, rig side: no part geometry is changed and nothing here proposes a redesign. Nothing is approved for production; the user decides. The v10 files were read from copies and are unchanged. No GLB, .blend, STL or pose file is committed.

Frozen method: `METHOD_AND_CRITERIA_FROZEN.md` (SHA-256 `6ddaa9fffd2be1f7d9863af68bda7e939e78bc613c7ad1d019ea336adcea1727`), committed and pushed as `9e053aa422e6b664a4ad2bebedffc92462da678e` before any limited pose was computed. Unchanged since.

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
