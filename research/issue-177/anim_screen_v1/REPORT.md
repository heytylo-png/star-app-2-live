# Animation screening v1: Tripo presets on model 2 (Issue #177)

Evaluator: Claude. Date: 2026-11-10. **Research only.** The Tripo rig and its animations are not approved for production.

## Inputs (not committed)

| File | SHA-256 | Contents |
|---|---|---|
| `starmodelrigpose.glb` | `57cb05de332adaae6271d5ba5852d5b268dab20abfd3bf4c53f92f58536229c7` | Same mesh and rig as `starmodelmeshrig.glb` (`f688ab28…`): vertices match exactly, inverse bind matrices are equal, and there are the same 78 joints. Two animations: `standing_relax` (17.6 s) and `greet_02` (5.6 s) |
| `starmodelmeshrig.glb` | `f688ab28c9640c5f6c6e5038715fc26f8652759cd151bdc79e2c324de7c03f08` | `greet_02` |

## 1. Frozen v2 screen of `standing_relax`

Method: unchanged `collide_v2.py` from `research/issue-177/tripo_collision_v2` @ `19d405f`. Output: `outputs/collide_v2_standing_relax.json`.

- **Rig poses:** identical to the v2 run. Positive control detected; P1–P8 have 0 new intersections; USABLE.
- **`standing_relax`:**
  - Arms and hands pass into the thighs in **48 of 48** sampled frames.
  - 707–1,390 new non-adjacent triangle pairs per frame. Worst at t = 0.04 s: R_hand|R_leg 511, R_arm|R_leg 449, L_hand|L_leg 353, L_arm|L_leg 77.
  - The contacts lie at 43–64 % H.
  - **Not usable as shipped.**

## 2. Arm-offset sweep (EXPLORATORY, not frozen)

`scripts/offset_sweep.py` takes each sampled frame (24 per animation) and adds a constant outward rotation of each upper arm about world Z at its posed joint. It then reruns `collide_v2`'s intersection test.

| Extra outward rotation | `standing_relax` worst frame / frames with contact | `greet_02` worst frame / frames with contact |
|---|---|---|
| 0° | 1,390 / 24 | 1,203 / 19 |
| 5° | 597 / 24 | 455 / 14 |
| 10° | 63 / 4 | 94 / 7 |
| **15°** | **0 / 0** | **0 / 0** |
| 20°–30° | 0 / 0 | 0 / 0 |

**Finding (exploratory):** a constant **15° outward offset on both upper arms** removes all arm/hand–leg intersections in both animations at the sampled frames.

**Limits:**
- 24 samples (0.73 s spacing for `standing_relax`); contacts between samples are possible.
- The offset axis is world Z. This assumes the character faces roughly +Z throughout, which holds for idle motions.
- Skin folding within joints is not tested.
- It has not been checked whether the offset looks acceptable.

**Suggestion:** use **20°** for margin.

## 3. Recommendation (proposal; user decides)

- Apply a constant +20° upper-arm abduction layer on top of preset animations for this model. In Blender this is an additive pose layer or a constraint on the upper-arm bones. It changes no mesh or weights.
- Re-screen the final animation with `collide_v2.py` at a finer sampling before using it for previews.
- Do not modify the locked v10 rig. This applies only to the Tripo preview rig.

## Reproduce

```
python3 -I scripts/offset_sweep.py starmodelrigpose.glb <dir with collide_v2.py> <dir with glbio.py> outputs/sweep_standing_relax.json 24
python3 -I scripts/offset_sweep.py starmodelmeshrig.glb <dir with collide_v2.py> <dir with glbio.py> outputs/sweep_greet_02.json 24
```

`collide_v2.py` and `glbio.py` are in `research/issue-177/tripo_collision_v2/scripts/` @ `19d405f`.
