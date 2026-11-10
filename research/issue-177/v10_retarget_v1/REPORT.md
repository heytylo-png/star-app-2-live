# v10 retarget v1: Tripo `greet_02` test-retargeted onto the locked v10 skeleton (Issue #177)

Evaluator: Claude. Date: 2026-11-10. **Research only.** Nothing here is approved for production; the user decides. The v10 files were read from copies and were not modified, re-saved or committed. No GLB, .blend or Tripo binary is committed.

Frozen method and criteria: `RETARGET_METHOD_AND_CRITERIA_FROZEN.md` (SHA-256 `23e3907744c29de669f84983d5148bc5c5e552068a31f9d7c919095369c5f10b`), committed and pushed as `b560048e13f2d019b6c8c9e8b6b342902654f912` before any retarget result was computed. Nothing in it was changed afterwards.

## 1. Result per criterion (main method)

| Criterion | Result | Measured |
|---|---|---|
| **C1** — v10 bone lengths unchanged (≤ 0.01 mm), 19 bones, 135 keys | **PASS** | largest length error 8e-14 mm |
| **C2** — right hand at or above the head bone's head (z 116) in the raised part | **PASS** | met at 19 of the 22 raised keys; highest point 129.0 mm at t = 3.625 s (hand tip), head bone head then at 113.7 mm |
| **C3** — no segment within 2 mm of another limb's or the torso's segments (capsule radius 1.2 mm) | **PASS** | 0 of 135 keys below the limit; smallest clearance **2.62 mm** (right forearm vs right thigh, t = 1.167 s; limit 2 mm) |

The criteria pass, but the pose is not a faithful copy of the Tripo wave and C3 is a skeleton test only. Read §2 before using the result.

## 2. What the pass does and does not show

- **The v10 arms sit lower and closer to the body than Tripo's.** The arms use the plain rest-relative transfer, as specified. The two rest poses differ, so every v10 arm bone is turned from the Tripo direction by a constant angle: upper arm 10.8°, forearm 16.7° (left) and 17.7° (right), hand 12.7° and 14.2°.
  - In the wave the v10 right wrist peaks at 118.0 mm; the Tripo wrist, at the same scale, is at about 131 mm at t = 3.417 s. The wrist alone reaches 116 mm at only 7 of the 22 raised keys; C2 passes mainly on the hand tip.
  - With arms down, the v10 wrists hang about 15–17 mm from the midline, against about 25 mm on Tripo.
- **C3 passes narrowly and only for a 1.2 mm skeleton.** The right forearm comes within 5.02 mm (axis to axis) of the right thigh. 74 of 135 keys are within 3 mm of the limit. A real body is far thicker than 1.2 mm, so on a body the forearms and hands would be inside the hips and thighs in the arms-down frames. The Tripo source already has that problem (`tripo_collision_v2`), and the plain transfer makes it worse.
- **Legs follow Tripo exactly in direction** (0.0° difference for thighs and shins at every key), which is what the stance correction does.
- **Variant B (not gated)** applies the same direction correction to the arms. The arm bones then match Tripo's directions exactly; C1, C2 and C3 all pass; the hand tip reaches 141.4 mm (wrist 129.8 mm, at all 22 raised keys); the smallest arm-to-leg axis distance is 17.9 mm instead of 5.0 mm. This variant was pre-registered as information only.

## 3. Inputs (hashes verified before and after the run; not committed)

| File | SHA-256 | Bytes |
|---|---|---|
| `star_rai_locked_final_v10_blender_bones.json` | `eab1839c7eb4d05b6e7c8a98527d40a6a88e5679c12b249e87aff65bdb686c05` | 7,321 |
| `star_rai_armature_final_v10.blend` | `f459ea1f14ca09d59b2cf7e227182b74d65ecfbb0271d1189045d1b5a8f0514f` | 188,616 |
| `starmodelrigpose.glb` (Tripo; original `greet_02.001`) | `57cb05de332adaae6271d5ba5852d5b268dab20abfd3bf4c53f92f58536229c7` | 5,662,836 |

Outputs not committed (delivered to the user):

| File | SHA-256 | Bytes |
|---|---|---|
| `v10_greet02_pose.json` (full per-key pose, main and variant B) | `aaa2fe73a01806d0ed896d05fa1559ce7d9c452eb62b271235dd76610ad52355` | 3,066,821 |
| `v10_greet02_retarget_TEST.blend` (new scene: skeleton rebuilt from the JSON, with the main retarget as an action; not the v10 file) | `d8622efb4c8c0cc230206f6d7c0b6928e85d61573b89715f08b9240f7faf2cf5` | 1,694,656 |

## 4. Other pre-registered results (MEASURED)

**Per-joint angle differences, v10 minus Tripo (135 keys)**

| Joint | Largest | Mean |
|---|---|---|
| Elbow left / right (bend) | 3.3° / 6.3° | −2.0° / −2.8° |
| Shoulder left / right (upper arm from straight down) | 10.8° / 10.8° | −6.0° / −9.8° |
| Knee, hip (both sides) | 0.0° | 0.0° |

Bone direction differences are constant over the animation: thigh and shin 0.0°; foot 9.4° (left) and 9.0° (right), pitch only, because the two foot bones are defined differently; arms as in §2. All values per key are in `outputs/retarget_result.json`.

**C3 detail: smallest axis distance per group pair**

| Pair | mm | t (s) |
|---|---|---|
| right arm – right leg | 5.02 | 1.167 |
| left arm – left leg | 7.04 | 2.208 |
| right arm – torso | 13.46 | 0.042 |
| left arm – torso | 17.10 | 4.625 |
| left leg – right leg | 19.25 | 1.208 |
| right arm – left leg | 21.59 | 0.042 |
| left arm – right leg | 26.97 | 2.292 |
| left arm – right arm | 29.56 | 0.042 |
| legs – torso | 14.14 | 0.042 |

- v10 rest pose: smallest axis distance 14.14 mm; the sanity check passes.
- Arms vs `head` bone (not gated): never closer than 25.85 mm.

**C2 detail.** The raised part is 22 keys, t = 3.042–3.917 s. The `head` bone's head moves between 111.8 and 116.2 mm over the animation because the body dips and leans. The lowest "highest hand point" in the raised part is 114.5 mm.

**Feet.** Ankles range from −61.7 to −50.6 mm (rest −62.0); foot tails from −90.1 to −83.7 mm (rest −88.0). The foot tails go up to 2.1 mm below their rest height. At the two keys checked by hand (0.042 s and 3.417 s) the v10 ankle heights are within 1 mm of the scaled Tripo ankles, so the 11 mm ankle lift is the animation's own leg movement (post-hoc check, two keys only).

**Blender cross-check of C1** (`outputs/blender_check.json`, Blender 4.5.3 LTS): the pose was keyframed onto a skeleton rebuilt from the JSON. Blender's evaluated positions differ from the forward kinematics by at most 0.0005 mm (heads) and 0.0006 mm (tails); the largest bone length error is 0.0003 mm.

**JSON vs .blend** (`outputs/blend_vs_json.json`): 31 bones in both, same names and parents; heads differ by at most 3e-6 mm and the 19 bone tails by 7e-6 mm. The 12 attachment bones are 2 mm stubs in the .blend and zero-length in the JSON. The .blend has no actions.

**Tripo rest check:** the bind pose and the GLB's static node pose agree to 2.5e-7 units and 1.6e-5°.

**Scale:** 227.616 mm per Tripo unit, as in `v10_compare_v1`.

**Reproducibility:** the retarget was run twice; `retarget_result.json` (`5b7cf225…e59e`) and the pose file were byte-identical.

**Renders:** `outputs/v10_greet02_front_side.png` — top row front, bottom row side, six times. Red = character's right, blue = left. Sticks have the 1.2 mm capsule radius; the grey sphere only marks the head.

## 5. Manual choices

1. **Reading of "stance correction":** the v10 legs follow the Tripo leg directions (frozen before running). The other reading, keeping v10's own narrow stance, was not run.
2. **Arms use no rest correction,** as the method statement says, although the rest arm poses differ by 11°–18°. Variant B shows the alternative.
3. **Feet:** heading matched, pitch not, because the bone definitions differ.
4. **Spine:** `upper_chest` and `mid_chest` both follow Tripo `Spine02`; `pelvis` follows Tripo `Pelvis` and `hip` follows Tripo `Hip`; the root position follows Tripo `Hip`.
5. **C2 point:** the highest point of the `hand_right` bone, compared with both 116 mm and the moving head-bone head.
6. **C3 radius 1.2 mm,** taken from v10's proxy sticks; shared-joint exclusions are `upper_arm`–`upper_chest` and `thigh`–`pelvis`; the head bone is reported, not gated.
7. **Tripo rest = bind pose** (inverse bind matrices).
8. **Render times:** the frozen list says 0.04, 2.20, 3.00, 3.40, 3.80 and 5.00 s. The renders use the nearest keys: 0.042, 2.208, 3.000, 3.417, 3.792 and 5.000 s.
9. **Blender version:** the v10 .blend was written by Blender 5.2 and read with 4.5.3, which warns of possible data loss. Only bone names, parents, heads and tails were read from it, and they match the JSON. The retarget itself uses the JSON only.
10. **The full pose is not committed** because it is derived from a Tripo preset animation.

## 6. Limits

- No body mesh on v10 here: no skin, weights or surface collision was tested.
- Clearances are tested at the 135 keys, not between them.
- Twist about a bone's own axis is transferred but not checked; bone rolls in the .blend were not used.
- Fingers, toes, face, clavicle shift and neck bend are dropped.
- Only `greet_02` was retargeted.

## 7. Decisions for the user (proposals; nothing done)

- Whether arms should also get the rest correction (variant B). It follows the Tripo wave more closely and keeps the arms much further from the legs. It needs its own frozen amendment to count as a result.
- Whether C3 should be repeated with body-sized radii. That needs agreed radii per segment, since v10 has no body mesh in these files.

## 8. Reproduce

```
python3 -I scripts/retarget_v10.py star_rai_locked_final_v10_blender_bones.json starmodelrigpose.glb <glbio dir> outputs/retarget_result.json v10_greet02_pose.json
blender -b --python scripts/blender_check_render.py -- star_rai_locked_final_v10_blender_bones.json v10_greet02_pose.json outputs/blender_check.json <render prefix> 0.041667,2.208333,3.0,3.416667,3.791667,5.0 [new.blend]
blender -b <COPY of v10 .blend> --python scripts/blend_vs_json.py -- star_rai_locked_final_v10_blender_bones.json outputs/blend_vs_json.json
```

`glbio.py`: `research/issue-177/tripo_collision_v2/scripts/` @ `19d405f`. Python 3.13, numpy 2.5.3; Blender 4.5.3 LTS.
