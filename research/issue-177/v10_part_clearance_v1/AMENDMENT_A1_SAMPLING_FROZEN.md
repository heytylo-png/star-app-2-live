# v10 part clearance, amendment A1: surface sampling (FROZEN before any result)

Issue #177. Research only. Evaluator: Claude. Frozen 2026-11-10.

## Why

- **The frozen lattice is too dense on long, thin triangles.** It subdivides each triangle n = ceil(longest edge / h) times in both barycentric directions. The cylinder parts have triangles about 30 mm long and under 1 mm wide, which gives thousands of points each and millions per part.
- **The first run was stopped after 16 minutes of CPU time, before it printed anything.** No C0, C0b, C1 or C2 value was computed (empty log, no result file).

## Change

- **Sampling only.** Each triangle is split repeatedly at the midpoint of its longest edge (longest-edge bisection) until every sub-triangle's longest edge is ≤ h.
- **The samples** are the vertices of the resulting sub-triangles, deduplicated, with h = 0.25 mm as before.
- **The bound still holds.** Every point of a sub-triangle with longest edge ≤ h is within h of one of its vertices, so the true surface distance still lies in [d_s − h, d_s].
- **Unchanged:** reported clearance = d_s − h; thresholds, pair classes, mapping, criteria and the prefilter.
