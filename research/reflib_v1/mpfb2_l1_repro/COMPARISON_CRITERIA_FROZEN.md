# Frozen comparison criteria — MPFB2 L1 raw-input reproduction (Issue #179)

Frozen BEFORE any comparison between generated and committed outputs was computed (and before the pipeline was first executed).
The file's SHA-256 is recorded in `logs/criteria_frozen_sha256.txt` at freeze time and repeated in the report.

## Reference ("original")
`research/reflib_v1/mpfb2_study/outputs/*` and `MANIFEST.sha256` at study commit 8513fffa818c17e98bb47edee76c11a4d678ff3b.

## Candidate
Outputs written by an unmodified `scripts/run_all.sh` from the same commit into a fresh directory (MPFB2_OUT=<run>/outputs), run twice (run1, run2).

## Per-output classification
- **BYTE-IDENTICAL**: SHA-256 and size equal to the committed manifest entry -> **PASS (byte)**.
- Otherwise a structured comparison is made:
  - CSV: same header, same row count, same column count; cells parsed as numbers where both parse as float, else string-exact.
  - JSON: same key set and order-independent structure; booleans, ints (both sides integers), strings, null, list lengths exact; floats compared numerically.
  - Float tolerance: |a-b| <= ATOL + RTOL*max(|a|,|b|) with **ATOL = 1e-9, RTOL = 1e-9** (frozen). Differences within tolerance but not byte-identical -> **PASS (numeric)**; the max abs and max rel difference are reported.
  - Any structural difference, string difference, or float difference above tolerance -> **FAIL** for that output; each differing cell/key is listed (capped at 20 per file in the report, full list in the JSON).
- Secondary, informational report-precision test (does NOT change the PASS/FAIL above): floats differing above tolerance but <= 1e-4 (0.1 mm for metre values; 0.01 cm) are flagged "below report precision".

## Fields declared environment-dependent BEFORE comparison (excluded from the FAIL test, but still reported)
- `hash_verification_before.json` / `hash_verification_after.json`: keys `time_local`, `mtime_ns` (wall-clock / filesystem timestamps), and the `protected[]` list contents (describe the machine's protected Star Rai files at run time, not MPFB2 inputs). For `protected[]` a separate informational check records whether sha256/size of each path equals the committed original (a change would mean a protected file changed since 2026-10-31, not a pipeline defect).
- `hash_verification_compare.json`: derived from the above; compared exactly except `inputs_unchanged_hash_and_mtime`, which depends on mtime equality between the same run's before/after (expected true) and `protected_changed` (expected []).
- `hash_prior_snapshot_comparison.json`: not produced by any study script (a manually generated snapshot at the original task start). Classified **NOT REPRODUCIBLE BY PIPELINE / NOT VERIFIABLE**; it is not compared.
- `log_*.txt` written by `run_all.sh`: not in the committed manifest; recorded as extra outputs, not compared.
- Committed documents `README.md`, `REPORT.md`, `MANIFEST.sha256` are not pipeline outputs (hand-written/derived); they are checked for integrity only (done in step 1).

## Determinism
Run 1 vs Run 2 outputs compared by SHA-256 (excluding the environment-dependent fields above, which are compared for all other content). Any non-identical file is a nondeterminism finding.

## Report-claim check (conclusion survival)
A pre-declared list of headline claims (in `claims_frozen.json`, written at the same time as this file) is checked against the regenerated outputs using the same tolerance, with the stated report precision (value rounded to the number of decimals quoted in the report). A claim is PASS if the regenerated value rounds to the quoted value, FAIL if not, NOT VERIFIABLE if the source quantity cannot be produced by the rerun.

## Status vocabulary
PASS / FAIL / NOT VERIFIABLE. MEASURED facts, INFERENCES and NOT VERIFIED items are kept in separate sections of the report.

## Addendum (still before any run/comparison): magnitude buckets
For any float difference above the strict tolerance, each file is additionally bucketed by its max abs difference: <=1e-6 ; <=1e-4 ; >1e-4. The strict verdict is unchanged (above 1e-9 = FAIL at the frozen tolerance); the bucket is explanatory only.
