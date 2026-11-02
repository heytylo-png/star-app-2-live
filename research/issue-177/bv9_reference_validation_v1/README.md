# bv9 reference accuracy validation v1 (issue #177, task t125u) — research handoff

Read-only audit of `star_rai_base_body_bv9.blend` (sha256 `d72cedc1fbe6aaa14bebddbe052af97321816f88e8c3065a920165cbcf6d9689`) against the official issue #177 reference set. **Verdict: FAIL (not meeting the reference requirements; ~1 mm outline agreement not achieved).** Start with `REPORT.md`.

This is a research/evidence commit only. It is not approval of any model version, does not authorise geometry/rig/production changes, and is not to be merged by the producing bot.

## Included
- `REPORT.md` — full report (verdict, reference inventory, bv9 integrity, per-view tables, geometry review, classified findings, ranked proposals — proposals only).
- `METHOD_AND_CRITERIA_FROZEN.md` (frozen before computing), `METHOD_AMENDMENT_A1.md` (disclosed post-run segmentation correction).
- `scripts/` — all scripts used (`s01`…`s11`, `refseg.py`, `snapshot_protected.sh`). Absolute paths are local to the producing box.
- `data/` — measurement JSON (final: `silhouette_measurements.json`, `geometry_review.json`, `fractions_within_tolerance.json`, `head_zone_info.json`, `reference_inventory.json`, `bv9_inspect.json`, `slice_loops_diag_z21_41.json`), plus the superseded run-1/run-2 numbers for transparency (`superseded_run1/`, `silhouette_measurements_run2_*.json`).
- `logs/` — run logs, frozen-criteria and amendment hashes, protected-file before/after summary.
- `overlays_publishable/` — contour-only overlays and deviation heat maps (red = reference outline, cyan = bv9 outline). They contain **no reference-image pixels**.
- `MANIFEST_sha256.txt` — SHA-256 of every file in this folder except itself.

## Not included (deliberately)
- The `.blend`, raw mesh exports (`bv9_geom.npz`), and any bv9 geometry.
- The nine official reference images: they are **not in the public repository** (checked by blob size/hash across fetched refs) and were not added. Their paths, sizes and SHA-256 are in `data/reference_inventory.json`; reviewers need the originals from the project owner to rerun `s05`.
- Local overlays with the dimmed reference as underlay (`overlays/`, `overlays_superseded_run1/`), and the full 8,245-line protected-file hash lists (summary + list hashes are in `logs/protected_summary.txt`).

## Unavailable / not verifiable evidence
Full-body three-quarter views (missing from the official set), camera calibration of the references, the "earlier shaded multi-view" official appearance images mentioned in #177, any scale link for the head close-ups. See `REPORT.md` sections 2 and 7.
