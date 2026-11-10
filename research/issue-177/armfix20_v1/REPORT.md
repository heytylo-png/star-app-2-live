# Arm-offset fix v1: +20° upper-arm abduction for Tripo preview animations (Issue #177)

Author: Claude. Date: 2026-11-10. **Research / preview only.** The Tripo rig is not approved for production. The locked v10 rig is untouched.

## What was done

- **Input:** `starmodelrigpose.glb`, SHA-256 `57cb05de332adaae6271d5ba5852d5b268dab20abfd3bf4c53f92f58536229c7` (model 2 mesh and rig; animations `standing_relax` and `greet_02`).
- **Output:** `starmodel_armfix20.glb`, SHA-256 `95616b21da8638f0d0e4cea316c90194f901bf590a64136a7c6b1a8b4c20786d`, 5,681,264 bytes. Not committed (Tripo-derived binary); delivered to the user directly.
- **Edit:** `scripts/apply_arm_offset.py`. Every L/R_Upperarm rotation key in both animations gets a constant **20°** outward rotation about the world Z axis, at the upper-arm joint. Implemented as `L' = P⁻¹ · Rz(±20°) · P · L` per key, using the parents' posed rotation at that key; all parent rotation keys share the same key times.
  - New keys are **appended** as new accessors. Only those 4 samplers' output indices change.
  - Re-running the script reproduces the output byte for byte.
- **Basis for 20°:** exploratory sweep `research/issue-177/anim_screen_v1` @ `344ee17`. 15° was the minimum that cleared both animations at 24 samples; 20° adds margin.
- **Not used:** Blender. It was not installable in this session (`pypi.org` and `download.blender.org` were refused by the network policy).

## Verification (`scripts/verify_and_screen.py`, output `outputs/screen20.json`)

| Check | Result |
|---|---|
| POSITION, NORMAL, TEXCOORD_0, JOINTS_0, WEIGHTS_0, indices, inverse bind matrices, nodes | **byte-identical** to input |
| Channels changed | exactly 4: `standing_relax` and `greet_02` × L/R_Upperarm rotation |
| Edit vs intended offset (skinned vertices vs original pose + 20° world-Z offset) | max deviation **7.8e-6 % H** |
| Local key change per key (`outputs/edit_report.json`) | 19.9999°–20.0000° |
| `standing_relax`: 212 frames (every 2nd of 423 keys) | **0** new non-adjacent intersections; adjacent-far max 0 |
| `greet_02`: 68 frames (every 2nd of 135 keys) | **0** new non-adjacent intersections; adjacent-far max 0 |

Before the fix (same test): `standing_relax` collided in 48/48 frames (≤ 1,390 pairs), and `greet_02` in 37/48 frames (≤ 1,226).

## Limits

- **Screening covers every second key.** Keys are about 1/24 s apart, so samples are about 1/12 s apart. Contact between samples is possible but unlikely at this spacing.
- **Not tested:** skin folding inside bending joints (v2 limits), and appearance. The offset also widens the arm during the wave in `greet_02`; see `outputs/armfix20_before_after.png`.
- **Preview use only.** No production approval, no change to the locked v10 rig, no hair or jaw handling.
