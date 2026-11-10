# Tripo auto-rig collision test v2: method and criteria (FROZEN before any v2 result was computed)

Issue #177. Research only. Evaluator: Claude. Frozen 2026-11-10. **This replaces only the penetration gate G2** of v1 (`tripo_autorig_eval_v1`, commit `2b726cd`), which was shown to misfire at creases where groups share skin. The v1 weight check (G1) and bending check (G3) results stand as published.

## Disclosure (prior knowledge)

Before freezing, the evaluator knew:
- the v1 results for model 2, including that v1's vertex metric found no arm↔leg or hand↔leg contacts in the 8 poses, and up to ~3,100 such vertices in the `greet_02` animation;
- the join table (which groups share skin);
- the triangle size distribution: centroid-to-vertex radius max 0.01063, p99.9 0.00686.

No triangle-intersection result had been computed.

## Input

`starmodelmeshrig.glb`, SHA-256 `f688ab28c9640c5f6c6e5038715fc26f8652759cd151bdc79e2c324de7c03f08` (user upload; not committed). Model 1 is not tested.

## Geometry and skinning

- Same as v1: linear blend skinning from the glTF skin, the same pose definitions P1–P8 (v1 `scripts/eval_autorig.py`, including clarifications C3 and C4), and the same body groups (by dominant bone).
- Vertices are welded by position (1e-7) to define connectivity. Skinning acts on the original vertices.

## Group adjacency (from the rest mesh)

- Two groups are **adjacent** if they share at least one welded edge at rest, i.e. continuous skin.
- All other group pairs are **non-adjacent**.

## Intersection test

1. **Candidate pairs:** triangle pairs whose centroids lie within r_i + r_j, where r is each triangle's centroid-to-vertex radius in the posed mesh. Triangles sharing a welded vertex are excluded.
2. **Exact test:** two triangles intersect if any edge of one crosses the interior of the other, using a segment–triangle test with parameter tolerance 1e-9. Coplanar overlaps are not detected; this is a known limitation.
3. **Categories:**
   - **non-adjacent:** the triangles' groups are non-adjacent.
   - **adjacent-far:** the groups are adjacent, and both triangles are farther than **0.05 H** in geodesic distance from the shared skin seam of that pair. Distance is measured with Dijkstra over welded edge lengths on the rest mesh, from all vertices on edges joining the two groups.
   - Pairs within the same group, and adjacent pairs near the seam, are **not counted**. That is where natural creases fold.
4. **New:** intersecting pairs that do not intersect at rest (matched by triangle-id pair).

## Positive control (pre-registered; validates the test)

- **PC:** rotate L_Upperarm and R_Upperarm 25° **toward** the body midline about world Z (adduction). From the A-pose, this drives the forearms and hands into the hips and thighs.
- The test **must** report ≥ 1 new non-adjacent intersecting pair for PC. If it does not, the method is declared invalid and no verdict is issued.

## Poses and gates

**Gated poses:** P1, P2, P3, P4, P6, P7, P8. P5 (hip flexion) is reported but not gated.

| Gate | Rule |
|---|---|
| **A** | 0 new **non-adjacent** intersecting pairs in each gated pose |
| **B** | ≤ 20 new **adjacent-far** intersecting pairs in each gated pose |

**Verdict for animation previews** (v1 G1 and G3 passed; carried over):
- **USABLE:** A and B pass in all 7 gated poses.
- **PARTLY USABLE:** A passes in all 7 gated poses, and B fails in at most 2 of them.
- **NOT USABLE:** anything else.

## Animation (reported, not gated)

- `greet_02`, 48 evenly spaced samples (v1 sampler).
- Per frame: new non-adjacent and adjacent-far intersecting pairs, broken down by group pair, plus the worst frame.
- An animation is chosen per use; this result informs that choice rather than the rig verdict.

## Reported per pose

- Counts per category and group pair.
- The number of distinct triangles involved.
- The y-range of involved triangles (% H).
- The rest-pose baseline counts.

## Reproducibility

- Run twice; the JSON must be byte-identical.
- Python 3, numpy, scipy only.
