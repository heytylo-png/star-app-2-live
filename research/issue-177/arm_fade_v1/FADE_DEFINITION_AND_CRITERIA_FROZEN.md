# Arm fade v1: elevation-based fade of the +20° upper-arm offset — definition and acceptance criteria (FROZEN before any fade result was computed)

Issue #177. Research only; Tripo preview rig only. Evaluator: Claude. Frozen 2026-11-10. The fade rule, the angle, the criteria and the window were specified by the user; this document fixes the remaining implementation details before running. The locked v10 rig is not read or modified.

## Disclosure (prior knowledge)

Before freezing, the evaluator knew:
- the unfaded +20° results (`research/issue-177/arm_offset_v1` @ `d03d7d5`): 0 new intersecting pairs at every key in both animations;
- from front-view renders of `greet_02`, source and unfaded: at t = 2.60 s both arms still hang down; at t = 3.00, 3.40 and 3.80 s the right arm is raised and the unfaded offset puts the hand in front of the face. **The start of the 2.6–4.2 s window therefore probably includes frames where the arm is not yet raised, where the fade weight is near 1 and the hand moves by design. Criterion C2 may fail for that reason.** The window is kept as specified; see "Reported, not gated".

No fade weight, faded pose or faded collision result had been computed.

## Input

`starmodelrigpose.glb`, SHA-256 `57cb05de332adaae6271d5ba5852d5b268dab20abfd3bf4c53f92f58536229c7` (user upload; not committed). Animations `standing_relax.001` and `greet_02.001`.

## Fade definition

For each side s ∈ {L, R}, each animation, and each rotation key time t of `s_Upperarm`:

1. **Pose:** the SOURCE animation at t (no offset), sampled as in `collide_v2.py` @ `19d405f` (`world_at`).
2. **Arm direction:** d = unit vector from the world position of joint `s_Upperarm` to the world position of joint `s_Forearm`.
3. **Angle from straight down:** θ = angle between d and world −Y (glTF down), in degrees. θ = 0° is straight down, 90° is horizontal, more than 90° is above horizontal.
4. **Weight:**
   - θ ≤ 45°: w = 1
   - θ ≥ 90°: w = 0
   - otherwise: x = (90 − θ) / 45, w = x²(3 − 2x) (smoothstep)
5. **Offset:** rotate the `s_Upperarm` subtree by sign · w · 20° about world +Z at the posed `s_Upperarm` joint. Sign is +1 for L and −1 for R, as in `anim_screen_v1/scripts/offset_sweep.py` and `arm_offset_v1`.
6. **Write-back:** `q' = P(t)⁻¹ · Rz(sign · w · 20°) · P(t) · q`, with P(t) the world rotation of the upper arm's parent (rotation part by polar decomposition). Only the rotation key values of `L_Upperarm` and `R_Upperarm` are overwritten in the binary chunk. Mesh, weights, skeleton, JSON chunk and all other channels stay byte-identical. Quaternion sign is chosen for continuity with the previous key.

The weights of the two arms are independent. The weight is evaluated per key; between keys the player interpolates the written keys.

## Acceptance criteria

H = 0.979576 (model height as computed by `collide_v2.py`).

| | Rule |
|---|---|
| **C1** | 0 new **non-adjacent** intersecting triangle pairs at **every** `L_Upperarm` rotation key time, in **both** animations. Intersection routine, groups, adjacency and "new vs rest" exactly as in `collide_v2.py` @ `19d405f`, applied to the faded file. |
| **C2** | In `greet_02`, for every rotation key time with 2.6 s ≤ t ≤ 4.2 s: the distance between the world position of joint `R_Hand` in the faded file and in the source file is ≤ **0.5 % H** (0.004898). The raised hand in `greet_02` is the right hand. |

**Verdict:** PASS if C1 and C2 both hold; otherwise FAIL. C1 and C2 are reported separately either way. No criterion, window or threshold is changed after results are seen; any follow-up is a new, separately frozen amendment.

## Reported, not gated

- Unmodified `collide_v2.py` @ `19d405f` on the faded file (48 samples per animation; `greet_02` via an animation-order copy), run twice, JSON byte-identical.
- New adjacent-far pairs at every key.
- Per-key w for both arms in both animations: min, max, and the times where 0 < w < 1.
- C2 detail: per-key `R_Hand` joint distance over 2.6–4.2 s; the largest sub-interval of the window in which every key is ≤ 0.5 % H; the right-arm θ and w at the window ends.
- The same distance measured on the skinned vertices of the `R_hand` group (max over vertices), as a stricter cross-check.
- `standing_relax`: maximum vertex distance between the faded file and the unfaded +20° file (`72e56941…4a1b`). The unfaded `standing_relax` result in `arm_offset_v1` is kept as is and is not replaced by this work.
- Equivalence: maximum vertex distance between the faded file and an independent reference construction (source pose, subtree rotated by w · 20°), at keys and halfway between keys.
- Byte diff and static-data identity against the input.
- Front-view before/after renders (Blender, import and render only). Visual aid; not a criterion.

## Reproducibility

- The edit is run twice; output SHA-256 must match.
- Python 3, numpy, scipy only for edit and tests.
