# Arm fade v1: elevation-based fade of the +20° upper-arm offset (Issue #177)

Evaluator: Claude. Date: 2026-11-10. **Research only.** Tripo preview rig only. The locked v10 rig was not read, used or modified. Nothing here is approved for production. **Awaiting independent review.**

Frozen definition and criteria: `FADE_DEFINITION_AND_CRITERIA_FROZEN.md` (SHA-256 `742846f6eff65a5f8571062789123af7c46ad185ccb67920e40a22b95ebcbf0f`), committed and pushed as `5ab465bd21288bf124d753a44bb8ff7ed0f67c4a` before any fade result was computed. Nothing in it was changed afterwards.

## 1. Verdict: FAIL (C1 holds, C2 does not)

| Criterion | Result | Holds |
|---|---|---|
| **C1** — 0 new non-adjacent pairs at every key, both animations | 0 at 423/423 keys of `standing_relax`; 0 at 135/135 keys of `greet_02` | **yes** |
| **C2** — `R_Hand` joint within 0.5 % H of the source at every key, `greet_02`, 2.6–4.2 s | 8 of 38 keys over the limit; maximum **8.60 % H** at t = 2.625 s | **no** |

The frozen rule needs both, so the verdict is **FAIL**.

## 2. Why C2 fails (MEASURED)

- C2 holds at every key from **t = 2.833 s to 4.000 s** (29 consecutive keys). From 3.000 s to 3.917 s the right arm is at or above horizontal, the weight is 0, and the hand is exactly on the source path (0.000 % H).
- It fails at both ends of the window, where the arm is still (or again) hanging down and the fade applies the offset by design:

| t (s) | Right arm angle from down | Weight | `R_Hand` distance from source |
|---|---|---|---|
| 2.625 | 27.6° | 1.000 | 8.60 % H |
| 2.667 | 33.8° | 1.000 | 7.92 % H |
| 2.708 | 42.1° | 1.000 | 6.73 % H |
| 2.750 | 50.6° | 0.957 | 4.95 % H |
| 2.792 | 59.8° | 0.747 | 2.36 % H |
| 2.833 | 69.3° | 0.439 | 0.48 % H |
| 3.000–3.917 | 89.9°–111.9° | 0.000 | 0.00 % H |
| 4.000 | 80.0° | 0.127 | 0.38 % H |
| 4.042 | 72.6° | 0.333 | 0.64 % H |
| 4.083 | 62.9° | 0.652 | 0.24 % H |
| 4.125 | 52.7° | 0.922 | 1.38 % H |
| 4.167 | 44.1° | 1.000 | 3.29 % H |

- The frozen document disclosed this risk in advance: renders had shown the arm down at 2.60 s.
- **Stricter cross-check** (skinned `R_hand` vertices instead of the joint): 12 of 38 keys over the limit, maximum 11.36 % H.

**The window and the fade thresholds cannot both be met as specified.** Inside the window the arm passes through angles below 45° from straight down, where the definition requires the full offset.

## 3. Other pre-registered results (MEASURED)

- **Frozen test** (unmodified `collide_v2.py` @ `19d405f`): 0 new pairs in 48/48 frames of each animation, both categories; rig verdict USABLE; positive control 504; two runs byte-identical. The two JSON files are byte-identical to those of the unfaded +20° file (`arm_offset_v1`), because every count is 0 in both.
- **New adjacent-far pairs at every key:** 0 in both animations.
- **Weights:**
  - `standing_relax`: w = 1 at every key for both arms (arm angle 8.2°–20.0° from down).
  - `greet_02` right arm: w = 0 at 22 keys, partial at 12 keys (2.750–3.000 s and 3.958–4.125 s), 1 elsewhere.
  - `greet_02` left arm: w between 0.989 and 1; partial at 6 keys (2.958–3.167 s, angle up to 47.8°).
- **`standing_relax` vs the unfaded +20° file (`72e56941…4a1b`):** maximum vertex distance 0.0 at every key. The fade changes nothing in this animation. The unfaded `standing_relax` result in `arm_offset_v1` is kept as is.
- **`greet_02` vs the unfaded +20° file:** up to 9.35 % H, in the raised-arm part, as intended.
- **Equivalence to the independent reference construction:**

| | at keys | halfway between keys |
|---|---|---|
| `standing_relax` | 0.000007 % H | 0.0003 % H |
| `greet_02` | 0.000006 % H | 0.15 % H |

Between keys the player interpolates the written keys while the weight changes quickly, so the faded result differs from an exactly re-evaluated fade by up to 0.15 % H.

- **Unchanged data:** 13,910 bytes differ from the input, all inside the four upper-arm rotation keyframe arrays (17,856 bytes); JSON chunk, POSITION, NORMAL, TEXCOORD_0, JOINTS_0, WEIGHTS_0, indices and inverse bind matrices identical; file length unchanged.
- **Reproducibility:** the edit was run twice with the same output hash.
- **Renders** (`outputs/preview_greet_02_fade.png`; rows: source, unfaded +20°, faded +20°): with the fade, the waving hand at 3.0–3.8 s is back beside the head as in the source. Visual aid only, not a criterion.

## 4. Files (GLBs not committed)

| File | SHA-256 | Bytes |
|---|---|---|
| `starmodelrigpose.glb` (input) | `57cb05de332adaae6271d5ba5852d5b268dab20abfd3bf4c53f92f58536229c7` | 5,662,836 |
| `starmodelrigpose_armfade20.glb` (output) | `bc6111e72051f15b15457b259090e15a3bdd6af51adffadcb7bb2317d7bfc3fc` | 5,662,836 |
| `starmodelrigpose_armfade20_greet02_first.glb` (test copy, animation order only) | `e0fcd2a335eddc166b32632cfe4b3d7ea9a5897ec241ffe41e2a563a92ee3b26` | 5,662,836 |
| `starmodelrigpose_arm20.glb` (unfaded, from `arm_offset_v1`; comparison only) | `72e56941cdaf453fbe5a9434847a31181d4c8b0a91ecce48ae329085dc7c4a1b` | 5,662,836 |

## 5. Limits

- Skin folding inside joints (armpit, shoulder, elbow) is not tested. The fade changes the shoulder rotation quickly: the weight goes from 1 to 0 in about 0.25 s (2.75–3.00 s).
- The speed and smoothness of the fade transition were not measured or judged.
- Contacts between keys are possible but unlikely at 24 keys per second.
- Coplanar overlaps are not detected.
- Renders are low-sample, front view only.

## 6. Decisions for the user (proposals; nothing done)

No criterion was changed after the results. Any of these needs a new, separately frozen amendment:

1. **Restrict the C2 window to the part where the arm is raised**, for example the keys where the source arm is at or above horizontal (3.04–3.92 s), or 2.85–4.00 s.
2. **Keep the window and change the fade thresholds.** For C2 to hold over all of 2.6–4.2 s the offset would have to be near 0 at 27.6° from down. That is close to the 8°–20° range of `standing_relax`, and a re-sizing check against the hips would be needed.
3. **Accept the fade as specified** and treat the hand movement at the window edges as intended.

## 7. Reproduce

```
python3 -I scripts/apply_arm_fade.py starmodelrigpose.glb <glbio dir> starmodelrigpose_armfade20.glb 20
python3 -I scripts/anim_first.py starmodelrigpose_armfade20.glb greet_02.001 starmodelrigpose_armfade20_greet02_first.glb
python3 -I <collide_v2.py> starmodelrigpose_armfade20.glb <glbio dir> outputs/collide_v2_standing_relax_armfade20.json
python3 -I <collide_v2.py> starmodelrigpose_armfade20_greet02_first.glb <glbio dir> outputs/collide_v2_greet_02_armfade20.json
python3 -I scripts/verify_fade.py starmodelrigpose.glb starmodelrigpose_armfade20.glb starmodelrigpose_arm20.glb <collide_v2 dir> <glbio dir> outputs/verify_fade_standing_relax.json 0
python3 -I scripts/verify_fade.py starmodelrigpose.glb starmodelrigpose_armfade20.glb starmodelrigpose_arm20.glb <collide_v2 dir> <glbio dir> outputs/verify_fade_greet_02.json 1
```

`collide_v2.py` and `glbio.py`: `research/issue-177/tripo_collision_v2/scripts/` @ `19d405f`. Python 3.13, numpy 2.5.3, scipy 1.18.1. Previews: Blender 4.5.3 LTS, `scripts/blender_preview.py`.
