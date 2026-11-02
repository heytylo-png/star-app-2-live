# bv9 controlled correction study v1 (issue #177) — research only

**Not approval to modify or replace bv9.** Start with `REPORT.md`; candidate reports are in `reports/`.

- Baseline: `star_rai_base_body_bv9.blend` sha256 `d72cedc1fbe6aaa14bebddbe052af97321816f88e8c3065a920165cbcf6d9689` (verified, never modified). Validation it builds on: commit `f81fa4646855610b139026348177177ff78e8ff9` (`research/issue-177/bv9_reference_validation_v1/`).
- Candidates (each a separate copy of bv9; local only): A arm/hand (FAIL), B foot (FAIL), B1 foot post-hoc amendment (FAIL), C legs (NOT VERIFIABLE, no change; byte-identical to bv9).
- Pre-registered before any candidate existed: `CORRECTION_STUDY_PREREGISTRATION_FROZEN.md`; post-hoc amendment (disclosed): `AMENDMENT_B1_FROZEN.md`.
- Measurement: the validation's frozen method + Amendment A1, with the validation scripts imported unchanged (hashes in `data/baseline_verification.json`); each measurement run twice (identical).

Layout: `REPORT.md`, `reports/` (A, B/B1, C), `scripts/`, `data/` (measurements, mapping, integrity, verdicts), `logs/`, `overlays_publishable/` (contour-only before/after overlays: red = official reference outline, cyan = bv9, yellow = candidate; no reference pixels), `MANIFEST_sha256.txt`.

NOT committed: any `.blend`, mesh export, the nine official reference images (not in the public repo; paths and hashes in the validation's `data/reference_inventory.json`), local overlays with reference underlay. The scripts need those local inputs, so the numbers can be audited here but only re-run on the originating machine.
