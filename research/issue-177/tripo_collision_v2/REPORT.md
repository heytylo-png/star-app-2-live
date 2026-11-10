# Tripo auto-rig collision test v2: model 2 (Issue #177)

Evaluator: Claude. Date: 2026-11-10. **Research only.** No production approval. The Tripo rig stays out of production; the locked v10 rig remains the source of truth.

## 1. Result

- **Frozen v2 verdict: USABLE for animation previews.**
- **Positive control detected:** a 25° arm swing into the body gives 504 new non-adjacent intersecting triangle pairs, all arm/hand against leg, at 42–64 % H. The test can see collisions.
- **All 8 test poses:** 0 new intersecting pairs, both categories.
  - Gate A (non-adjacent = 0): passes in all 7 gated poses.
  - Gate B (adjacent-far ≤ 20): passes in all 7 gated poses.
- **Combined with v1** (weights valid G1; bending G3 within limits), model 2's rig is plausible for previews.
- **Not for the `greet_02` wave animation as shipped.** Arms and hands pass into the thighs in 37 of 48 sampled frames, up to **1,226** non-adjacent pairs (worst t = 2.18 s: L_hand|L_leg 478, R_arm|R_leg 421, L_arm|L_leg 241, R_hand|R_leg 86). Only the raised-arm part of the wave is clean. The animation's rest arm position is too close to these hips and thighs.

## 2. Input and method

- **Input:** `starmodelmeshrig.glb`, SHA-256 `f688ab28c9640c5f6c6e5038715fc26f8652759cd151bdc79e2c324de7c03f08` (user upload; not committed). Its surface is identical to `starmodelmesh.glb` (v1 report).
- **Frozen method:** `METHOD_AND_CRITERIA_V2_FROZEN.md` (SHA-256 `ea25ab7be423517da6f82dc8ab89f17bd7e6264437f53a86f526fafbf9952f43`), frozen before any v2 result. It replaces only v1's penetration gate G2, which v1 §5 showed misfires at shared-skin creases.
- **Implementation details D1–D4,** fixed before any v2 result (header of `scripts/collide_v2.py`):
  - **D1:** triangle group = majority vertex group.
  - **D2:** candidate search.
  - **D3:** segment–triangle tolerances.
  - **D4:** positive-control rotation.
- **Test:** exact triangle–triangle intersection (edge-crosses-triangle, both ways) after linear blend skinning. Same poses as v1, same body groups.
  - **Non-adjacent:** groups that share no skin.
  - **Adjacent-far:** groups that share skin, with both triangles > 0.05 H (0.049) of geodesic distance from their shared seam.
- **Group adjacency** (from the rest mesh): arm–hand, leg–foot, head–torso, torso–arm, torso–leg (both sides). Every other pair is non-adjacent.
- **Reproducibility:** run twice, byte-identical (`collide_v2.json` SHA-256 `723e3def0808680c6d7c91c6c72dc349086f09b85146f80ba8786f091306e797`). Python 3, numpy, scipy.

## 3. Details (MEASURED)

| | Candidate pairs tested | New non-adjacent | New adjacent-far |
|---|---|---|---|
| Rest (baseline) | 0 | 0 | 0 |
| PC (control) | 15,260 | **504** | 139 (torso\|arm, 61–65 % H) |
| P1–P8 | 0 each | 0 | 0 |

"0 candidates" means no triangle of one body part comes within the intersection bound of a triangle of a separate part. The separations are wide; the zeros are not marginal.

**Animation, per-frame new non-adjacent pairs (48 samples):**

```
938 909 909 907 870 941 939 955 1002 991 1033 1088 969 1077 1081 1038 1120 1178 1226 1221 1189 1099
75 0 0 0 0 0 0 0 0 222 157 0 0 0 0 154 323 326 277 346 449 779 938 931 853 916
```

Adjacent-far pairs peak at 66 in the same arms-down frames.

## 4. Limits (what v2 does not establish)

- **Skin folding inside a bending joint is not tested.** That covers the back of the knee, the elbow crease, the groin in hip flexion and the armpit: within-group pairs and adjacent pairs within 0.05 H of the seam are excluded by design. v1's cross-section check (G3) covers collapse there partially. The knee (−25 %) and right elbow (−25 %) were close to the 30 % limit.
- **Coplanar overlaps** are not detected.
- **Only these 8 poses and this one animation** were tested. Other motions are not covered.
- **No visual or render check;** geometry only.
- **No comparison with the locked v10 rig** (v10 JSON not on GitHub).

## 5. Recommendations (proposals; user decides)

1. **Model 2's rig can be used for preview tests,** not production.
2. **Don't use `greet_02` as shipped.** Choose or author animations whose arm rest position clears these hips (about 25°+ abduction at rest), or check each candidate animation with `scripts/collide_v2.py` before use.
3. **If previews matter for close-ups,** add a crease check, frozen in advance, for the knee, elbow and hip folds.
4. **Before any production use:** compare joints against the locked v10 rig (needs the v10 JSON) and add hair and jaw handling. Both are outside this rig.

## 6. Files

- `METHOD_AND_CRITERIA_V2_FROZEN.md`
- `scripts/collide_v2.py`, which uses `glbio.py` from `research/issue-177/tripo_autorig_eval_v1/scripts/` @ `2b726cd`. A copy is included here.
- `outputs/collide_v2.json` (run 1 = run 2)
