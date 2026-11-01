# MPFB2 L1 raw-input reproduction (Reference Library v1, Issue #179)

Research reproducibility check only. It authorises **no** change to Star Rai's mesh, skeleton, weights, foot rig or production pipeline. The user retains final approval.
No MPFB2 asset file, extracted mesh or binary is in this folder. Only scripts, logs and text/JSON summaries of numbers.

Executed 2026-11-01 (America/Chicago, CST) by BlendBro under TyLo's instruction t124u. Handoff follows `docs/WORK_HANDOFF_STANDARD.md` (branch `docs/shared-bot-handoff-standard`, `cb7d3219…`, **not merged**).

## 0. Verdict (summary)
| Material result | Status |
|---|---|
| Exact study commit 8513fffa… present; study directory byte-for-byte equal to the commit; 38/38 committed files match `MANIFEST.sha256` | **PASS** |
| All 10 approved MPFB2 inputs match the approved input manifest (SHA-256, git blob SHA-1, size) **and** the study manifest INPUT lines | **PASS** |
| Original, unmodified pipeline (`scripts/run_all.sh`) ran end-to-end on the 10 inputs: exit status 0, all 7 stages (run twice) | **PASS** |
| 25 of 26 manifest-listed pipeline outputs reproduce; **23 byte-identical**, 2 differ only in a wall-clock `time_local` field (frozen exclusion). 0 numeric differences anywhere (max abs diff 0.0; frozen tolerance 1e-9) | **PASS** |
| `hash_prior_snapshot_comparison.json` (manual snapshot taken at the original task start) | **NOT VERIFIABLE** (no script produces it) |
| Determinism: run 1 vs run 2 (31 files) | **PASS** (29 byte-identical; 2 differ only in `time_local`) |
| 219 pre-declared report claims re-checked against regenerated outputs (report rounding) | **PASS** 219/219 |
| Protected-file hashes (205 files: reflib_v1, blendbro/out, 68 study-protected Star Rai paths) before vs after | **PASS** (no change in sha256, size or mtime) |
| Original study's main conclusions survive the raw-input rerun | **PASS** (see §7), with the limits in §8 |

## 1. Fixed references and exact source
| Item | Value |
|---|---|
| Repository | `heytylo-png/star-app-2-live` |
| Study branch / exact commit | `research/reflib-v1-mpfb2-study` / `8513fffa818c17e98bb47edee76c11a4d678ff3b` (remote head re-checked with `git ls-remote` at start and end: unchanged) |
| Study directory tree at that commit | `96f7455d1abb4294ed9b74f59b89db682531398d`; working copy `git diff` against the commit: empty; no untracked files |
| Study `MANIFEST.sha256` SHA-256 | `1c97bd95a2ceaa08d676eec3df20b4a40b9f0a7d0d7831fb67810ff3b34bd910` |
| Claude review commit (read to identify the gap) | `6c4aea1b5a6a612479ac88e3d6eecd1e74d4b80d` (REVIEW.md §1/§10: "No raw re-run … L2 only"; recommended L1 re-run) |
| Approved MPFB2 source commit | `6ff1eb358f6c1959ced77e79e6dd2406d9a71f49` (upstream tag v2.0.18 per study). **NOT VERIFIED here against upstream**: upstream was deliberately not contacted (no retrieval allowed). Inputs are checked against the approved *local* manifest and the study manifest only. |
| Base for this handoff branch | `master` @ `4fd282e3a1c7cf261b134b2fd6d55c3dc7c35dfb` |

## 2. Input hash verification — 10 files (`logs/step1_inputs_commit_verification.json`)
Inputs read from `/workspace/research/reflib_v1/mpfb2/` (read-only, mode 0444). Approved manifest `MANIFEST_sha256_blobsha1.txt` SHA-256 `93d2801e1191a3f8328c3ae5520acb1db35bbc315888825b7c4ba3973a6ac9c3`. Total 16,498,721 bytes. Both manifests list the same 10 paths.
| path | bytes | SHA-256 | git blob SHA-1 | vs approved manifest and study manifest |
|---|---|---|---|---|
| `LICENSE.ASSETS.md` | 6,962 | `f6089cba01cb570a24712b41ab8a586ccd3cc5ef53dc266ca50b95c288956d2c` | `f3ede1fc3318f8d794e2cb51924186c62f02f71a` | PASS |
| `LICENSE.md` | 3,188 | `5cefb60680cb9efd4550a2e65d719021cfbec9dad3658481d11d48ae863ce04d` | `88cf832acc18dd64fd27ff2efb84625718bf2201` | PASS |
| `src/mpfb/data/3dobjs/base.obj` | 1,749,303 | `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c` | `d26635e9326e3cca30778fd7b9c00062b03cce09` | PASS |
| `src/mpfb/data/rigs/rigify/rig.human.json` | 257,096 | `6c3e61576d299d4acfbe45789d69738608ae0559d382f4a0e9e598a82379be7f` | `90911ccdc5dcb4fc227e2b7a972bf4fd00b540fd` | PASS |
| `src/mpfb/data/rigs/rigify/rig.human_toes.json` | 287,189 | `970f19f9e426528052a0f8bfc2cd6f1eea627aa607517ff4e43ae88d96488846` | `150a96b450f35d6283044041fde9fee8b072f4b0` | PASS |
| `src/mpfb/data/rigs/rigify/weights.human_toes.json` | 5,965,933 | `edcbca3323b03080fe750caa292c673ecbacdd200ebf0062d00d3b425e13a999` | `1931ed762e4e44258fe6dcc3202e73bdeb22169c` | PASS |
| `src/mpfb/data/rigs/standard/rig.default.json` | 126,355 | `8b949de35c2dd70dbb5094e57a8586c3b9a9f650775a293212581a8f67be6797` | `85900f3ac30228f403eadb10cb370f2f99f41263` | PASS |
| `src/mpfb/data/rigs/standard/rig.game_engine.json` | 40,936 | `b324ddb4b707721c19630bfadb87c3e3b38eed3b6e4590bb3cead43ea918f799` | `e0903a1bc1ed7aae1516b1a8d0fe3085bbc6e5f0` | PASS |
| `src/mpfb/data/rigs/standard/weights.default.json` | 5,034,981 | `154b866774a8c2b055a8e86419f22a87b76c60440fdcb70bcb78345f00924e89` | `1328020289b65b019f0881841bf40418c315fef7` | PASS |
| `src/mpfb/data/rigs/standard/weights.game_engine.json` | 3,026,778 | `9f4a773e74ce5ba08415b4f30070338e9f75bae5971b5075b10cd6b9caa58473` | `c9366e4bfe5d1af69c66ebdf4065874b996af6b1` | PASS |

Result: **10/10 PASS**. No input missing, none differed; no replacement or download was needed or made.

## 3. Script versions and environment
Study scripts at the exact commit (SHA-256 of the checked-out files, equal to the manifest entries):
| file | SHA-256 |
|---|---|
| `scripts/00_verify_hashes.py` | `0ef802f09c4fce58ee7cef1a9417084b9ef5c64736b3ef7c55115d0bcea45196` |
| `scripts/02_joints_hierarchy.py` | `746c10e4010f51a78e9cda997cb2423e8861f694b4bd6844d3a69e732d824790` |
| `scripts/03_coordinates_foot.py` | `68739c7a0205875b34859b2ff1d05caf16638f5d8a96c5906cd1190d3e489145` |
| `scripts/04_weights_stats.py` | `a0578738f7c60682a54a1e3c91cb2c5e9803ccf67f89bcc13bbc64e2bd223d48` |
| `scripts/05_weight_falloff.py` | `bc4634b008a57a7511ffdd0997f6543ad79fc2bb5ec489286d4c5dd35a496faa` |
| `scripts/06_compare_star_rai.py` | `c988929b71ef7247be40017da6e06d5250c72b083be7ef864ada3c6d003b78b1` |
| `scripts/07_rig_differences.py` | `6ec303532fc2eb510d66c063ec13feb927274c6434961f1d9fc26f936c242f20` |
| `scripts/common.py` | `7fbceeddccf78d155567e8fd0281a129d7fd42ab9bbca856c1eaa40cc5c56863` |
| `scripts/protected_paths.txt` | `5b1c87d6e43f421f1063a4a49993a6d19f971126ba539326ffe0295b23e9e21f` |
| `scripts/run_all.sh` | `96ce5b0c86cd25785043b9b143ac9fd784843f05abf1fedf4d68acdd202010fb` |

Environment (`logs/step2_environment.txt`): Debian GNU/Linux 13 (trixie), Linux 6.12.94 x86_64; Python 3.13.5 (GCC 14.2.0); numpy 2.5.4; bash 5.2.37; git 2.47.3; coreutils 9.7; `LANG=C.UTF-8`. The study scripts import only the standard library and numpy (scipy/pandas are installed but unused). Nothing was installed. No Blender, no add-ons.
**NOT RECORDED by the original study:** its Python and numpy versions. Equality of environment with the original run therefore cannot be asserted (see §8).

## 4. Commands and execution (MEASURED)
Study checkout (read-only use): `git clone --no-checkout --filter=blob:none <repo> repo`; `git fetch origin research/reflib-v1-mpfb2-study docs/shared-bot-handoff-standard`; `git checkout 8513fff… -- research/reflib_v1/mpfb2_study`.
```
python3 scripts/step1_verify_inputs_and_commit.py repo /workspace/research/reflib_v1/mpfb2 logs/step1_inputs_commit_verification.json
scripts/step2_capture_env.sh repo/research/reflib_v1/mpfb2_study
# criteria + claims frozen here (COMPARISON_CRITERIA_FROZEN.md, claims_frozen.json; hashes in logs/criteria_frozen_sha256.txt)
scripts/step3_run_pipeline.sh repo/research/reflib_v1/mpfb2_study <work>/run1     # runs: MPFB2_ROOT=/workspace/research/reflib_v1/mpfb2 MPFB2_OUT=<work>/run1/outputs PYTHONDONTWRITEBYTECODE=1 bash …/scripts/run_all.sh
scripts/step3_run_pipeline.sh repo/research/reflib_v1/mpfb2_study <work>/run2
python3 scripts/step5_compare.py repo/research/reflib_v1/mpfb2_study run1/outputs logs/step5_compare_run1_vs_committed.json vs_committed   # (and run2)
python3 scripts/step5_compare.py run1/outputs run2/outputs logs/step5_determinism_run1_vs_run2.json determinism
python3 scripts/step6_check_claims.py claims_frozen.json run1/outputs logs/step6_claims_check_run1.json
python3 scripts/step7_claude_discrepancy_check.py run1/outputs logs/step7_claude_discrepancy_check.json
scripts/snapshot.sh before | after        # protected-file hashing
```
`run_all.sh` is **unmodified**; the only change from its defaults is `MPFB2_OUT`, which sends outputs to a fresh directory so the original outputs are never overwritten. Per-run logs are in `run1/` and `run2/` (`command.txt`, `timing.txt`, `run_all.stdout.txt`, `run_all.stderr.txt`, `output_inventory_ls.txt`, `output_sha256.txt`, `text_logs/`).

| stage | script | result |
|---|---|---|
| 00 before | `00_verify_hashes.py before` | inputs_all_ok True, manifest_ok True, 68 protected paths |
| 02 | `02_joints_hierarchy.py` | ran (exit 0) |
| 03 | `03_coordinates_foot.py` | ran (exit 0) |
| 04 | `04_weights_stats.py` | ran (exit 0) |
| 05 | `05_weight_falloff.py` | ran (exit 0) |
| 06 | `06_compare_star_rai.py` | ran (exit 0); asserts SHA-256 prefixes of the three Star Rai bone JSONs (see §8) |
| 07 | `07_rig_differences.py` | ran (exit 0) |
| 00 after | `00_verify_hashes.py after` | inputs_all_ok True, `protected_changed: []` |

Completion: **exit status 0 for both runs**; stderr empty for both. Run 1: 10:38:29–10:38:31 CST, 1.866 s wall (`run1/timing.txt`); run 2: 10:38:34–10:38:36 CST, see `run2/timing.txt`. No `01_*.py` exists in the study commit and `run_all.sh` does not call one (the original numbering skips 01). The full pipeline completed, so no stage isolation was necessary.

## 5. Output-by-output comparison (frozen criteria: `COMPARISON_CRITERIA_FROZEN.md`)
Criteria and tolerances (byte hash first; then structured numeric comparison with ATOL = RTOL = 1e-9; `time_local`/`mtime_ns` declared environment-dependent) were written and hashed **before** the pipeline was run or any comparison computed (`logs/criteria_frozen_sha256.txt`, 2026-11-01T10:38:18-06:00 CST). Reference = committed outputs at 8513fff; candidate = run 1 (run 2 gives the same verdicts: `logs/step5_compare_run2_vs_committed.json`).
Totals: 26 manifest-listed outputs: **25 PASS (23 byte-identical)**, 0 FAIL, 1 NOT VERIFIABLE.
| output | status | basis | numeric diffs above tolerance |
|---|---|---|---|
| `compare_landmarks_normalised.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `compare_ratios.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `compare_segments.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `compare_star_rai.json` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `coordinates_foot.json` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `hash_prior_snapshot_comparison.json` | NOT VERIFIABLE | – | not produced by any study script (manual snapshot at original task start) |
| `hash_verification_after.json` | **PASS** | numeric within frozen tolerance; only `time_local` differs (environment-dependent, excluded per frozen criteria) | 0 numeric diffs (max abs 0.0) |
| `hash_verification_before.json` | **PASS** | numeric within frozen tolerance; only `time_local` differs (environment-dependent, excluded per frozen criteria) | 0 numeric diffs (max abs 0.0) |
| `hash_verification_compare.json` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `joint_cube_groups.json` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `joints_default.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `joints_game_engine.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `joints_hierarchy_summary.json` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `joints_rigify_human.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `joints_rigify_human_toes.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `rig_category_counts.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `rig_differences.json` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `weight_falloff_profiles.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `weight_falloff_summary.json` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `weights_influence_hist_default.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `weights_influence_hist_game_engine.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `weights_influence_hist_rigify_human_toes.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `weights_per_bone_default.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `weights_per_bone_game_engine.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `weights_per_bone_rigify_human_toes.csv` | **PASS** | byte-identical (SHA-256 + size) | 0 |
| `weights_summary.json` | **PASS** | byte-identical (SHA-256 + size) | 0 |

Extra files written by `run_all.sh` that are **not** in the committed manifest: `log_02…07_*.txt` (6). The original study did not commit its logs, so these cannot be compared with the originals (NOT VERIFIABLE vs original); run 1 and run 2 logs are byte-identical to each other.
Local (pre-existing) copy of the original study outputs, scripts and REPORT under `/workspace/research/reflib_v1/mpfb2/analysis/` was also compared with the committed versions (`diff -rq`): no difference. This copy was only read.

### Numerical differences, tolerances and explanations
- Tolerance (frozen): |a−b| ≤ 1e-9 + 1e-9·max(|a|,|b|); ints, booleans and strings exact.
- **Measured differences: none.** All float cells in the 23 byte-identical files are bit-identical as printed. In the 2 non-identical files the only differing field is `time_local` (wall clock of the run: 2026-10-31T21:42:53/21:43:34 −05:00 original vs 2026-11-01T10:38:29/10:38:30 −06:00 rerun). `mtime_ns` of the inputs and of all 68 protected paths and all their SHA-256 values are identical to the original.
- Explanation: deterministic code (pure stdlib + numpy, no RNG, no threads-dependent reductions observed) on identical inputs.
- Sensitivity (negative control, `logs/step5_negative_control.*`): a deliberately perturbed copy (one float +2e-9, one CSV cell altered) is flagged as FAIL by the same comparator, so a PASS is not an artefact of a lenient comparator.

## 6. Determinism and independence checks
- Run 1 vs run 2: 31 files, 29 byte-identical, 2 differ only in `time_local` → **PASS** (`logs/step5_determinism_run1_vs_run2.json`). No nondeterminism observed.
- Independence of the rerun from the committed outputs: all pipeline scripts read inputs from `MPFB2_ROOT` and write only to `MPFB2_OUT`; the only output read back is the run's own `weights_summary.json` (stage 07) and `weight_falloff_profiles.csv` existence test (stage 05). Outputs were written into new empty directories. (INFERENCE from script reading, not a syscall trace.)

## 7. Do the study's main conclusions survive the raw-input rerun?
All headline numbers in the study REPORT were recomputed from the raw inputs. 219 pre-declared claims (`claims_frozen.json`, extracted from REPORT.md text with its own rounding) were checked against the regenerated outputs: **219 PASS, 0 FAIL, 0 NOT VERIFIABLE** (`logs/step6_claims_check_run1.json`). By REPORT §1 item:
| # | REPORT §1 item | L1 rerun status |
|---|---|---|
| 1 | inputs match manifest, unchanged after | **PASS** (§2; protected/inputs unchanged) |
| 2 | `base.obj` body = vertices 0…13379; indices align | **PASS** (coordinates_foot.json counts, 19,158 / 18,486 / 13,380 / 13,378 / 125 groups / 1,000 joint vertices, 0 shared) |
| 3 | `(x,−z,y)/10` proper rotation, Z-up, front −Y, `.L`=+X | **PASS** (det 1, side counts 62/23/47) |
| 4 | `default_position` not reproducible from `base.obj` (study's own **FAIL**) | **PASS**: the study's FAIL finding reproduces exactly (median/p95/max cm: default 3.1/5.9/6.2, game_engine 5.5/6.2/81.8, rigify 1.1/5.9/6.2, rigify_toes 1.3/5.9/6.2) |
| 5 | Rigify shifted +0.8183 m in Z | **PASS** (`joint-ground` z −0.8183) |
| 6 | hierarchy (bones/roots/depth/leaves/use_connect, no cycles) | **PASS** |
| 7 | weight-file integrity | **PASS** (entries 58,388 / 36,416 / 65,101; coverage 19,158 / 19,158 / 19,142; influences 3.06 / 1.85 / 3.44) |
| 8 | falloff widths shoulder/elbow/hip/knee | **PASS** (15.4 / 7.1 / 20.3 / 9.1 cm default, left; t10/t90, vertex counts) |
| 9 | Star Rai axis mapping | **PASS** *for the computation* (see §8: depends on local Star Rai JSONs) |
| 10 | pose-independent proportion comparison | **PASS** *for the numbers*; the bone↔landmark pairing remains INFERRED by the study and cannot be tested by a rerun |
| 11 | quality of Star Rai joint placement | **NOT VERIFIABLE** (unchanged; not a computational claim) |
| 12 | cause of `default_position` vs mesh mismatch | **NOT VERIFIABLE** (unchanged; needs files outside the approved set) |
| 13 | game_engine weights are a merge of default | **NOT VERIFIABLE** (unchanged) |

Items that remain open from Claude's review and are **not** resolved by a rerun (they are report-wording / interpretation issues, not reproducibility): D4 (§8.3 wording "derived from the rich set"), and the interpretation of the blend widths as transferable settings. The rerun does confirm, from regenerated outputs, the numbers behind Claude's D1–D3 and D5 (`logs/step7_claude_discrepancy_check.json`): head ratio v8.3 +37.9…+46.1 %, v10 +54.8…+63.9 %; ankle ratio v8.3 2.30–2.44×, v10 2.52–2.67×; ankle height 6.37 cm vs 6.43 cm (two definitions); default knee width left 9.13 cm vs right 7.86 cm; sole-plane lateral tilt 1.25°. These are arithmetic on regenerated outputs (MEASURED); the original REPORT text was not edited.

## 8. Limitations, inferences and NOT VERIFIED items
MEASURED: everything in §2–§6 and the PASS rows above.
INFERRED:
- Because outputs are bit-identical, the pipeline is insensitive to the differences between the original run's environment and this one, whatever they were. This is an inference: the original Python/numpy versions were not recorded.
- Independence (§6) rests on reading the scripts, not on tracing file access.
NOT VERIFIED / NOT VERIFIABLE:
- **Same machine, same bot family.** The rerun used the same box and the same local input files (hash-verified); it is a rerun, not a rebuild on separate hardware or by a separate organisation. It is independent of the original author's *outputs*, not of the box.
- **Upstream provenance of the 10 inputs** (that they equal `makehumancommunity/mpfb2` @ `6ff1eb35…`): not checked against upstream; hashes agree with the local approved manifest only.
- **Star Rai inputs of stage 06 (not MPFB2 files).** Stage 06 reads three Star Rai bone JSONs read-only from `/workspace/artifacts/spine_requests` and asserts their SHA-256 prefixes (`5d373125` v8.3, `235767bf` v8.3 mm, `eab1839c` locked v10; all three present with matching full hashes recorded in the study manifest). This is the study's own approved workflow, not a new retrieval, but it goes beyond "the 10 MPFB2 files" and is disclosed here. The v10 JSON is **not committed anywhere**, so a reviewer holding only GitHub cannot repeat the v10-dependent numbers (stage 06 v10 columns); for the reviewer those remain NOT VERIFIABLE from GitHub alone, although this rerun reproduced them on the box.
- `hash_prior_snapshot_comparison.json`: no producing script.
- Original `log_*.txt`: not committed, so no comparison.
- Protected-file statements refer to files on this machine; reviewers cannot verify them from GitHub (the committed snapshot copies are redacted for Seed-san paths, see `logs/protected_snapshot_README.txt`).
- The 219 claims were extracted by me from REPORT.md; I looked at committed outputs to find the right keys but fixed expected values from the REPORT text. Because the outputs are byte-identical, this check adds little beyond the byte comparison and is a wording-versus-data check.

## 9. Handoff contents
Folder `research/reflib_v1/mpfb2_l1_repro/`: this `REPORT.md`; `COMPARISON_CRITERIA_FROZEN.md`; `claims_frozen.json`; `scripts/` (step1/2/3/5/6/7 + `snapshot.sh`); `logs/`; `run1/`, `run2/` (commands, timing, stdout/stderr, inventories, output SHA-256 lists, text logs, regenerated `hash_verification_*.json`); `MANIFEST_sha256.txt`.
**Excluded by design:** the 10 raw MPFB2 files; any extracted mesh; regenerated copies of the 23 byte-identical output tables (their SHA-256 are in `run*/output_sha256.txt` and equal the committed study manifest); any Star Rai file; Seed-san material; the unredacted protected snapshots (they stay on the box).
