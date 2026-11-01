# Independent review: MPFB2 read-only study (Reference Library v1, Issue #179)

Reviewer: Claude (independent reviewer). Date: 2026-11-01. **This is a research-only review.** Nothing in it authorizes changes to Star Rai's mesh, skeleton, weights, foot rig or production pipeline.

## 1. Executive summary

- **Access and integrity:** The study is accessible at the exact commit. All 38 files listed in its manifest match by SHA-256 and byte size.
- **No raw re-run:** The 10 MPFB2 input files are **not committed** (by design) and were not re-acquired. No claim was re-derived from raw MPFB2 data.
- **What was reproduced (L2):** The checks below were rebuilt from the study's **committed intermediate outputs** (CSV/JSON) plus a reading of the committed scripts. Star Rai v8.3 checks also used the **committed v8.3 bone JSONs**, which match the study's input SHA-256 values exactly.
- **Results:**
  - **Reproduced:** the coordinate conversion; the v8.3 axis compatibility; the Rigify Z offset; every joint-error statistic (default, game_engine and Rigify median/p95/max, per-strategy figures, the `Root` anomaly); all four default-rig blend-zone widths (15.4 / 7.1 / 20.3 / 9.1 cm, left side); foot pitch 27.2°; sole slope 0.52°; ankle height 6.75 cm; every v8.3 proportion value.
  - **Discrepancies:** five, all small (§6). The head (+40–60 %) and ankle (2.3–2.5×) ranges understate the reproduced spread. The "6.37 cm" default-position ankle height uses a different plane point from the same JSON's "6.43 cm". The headline knee blend width is left-side only (the right side is 7.86 cm). One transferable lesson states as fact what the report itself marks NOT VERIFIABLE.
  - **NOT VERIFIABLE:** everything involving Star Rai **v10** (its input JSON is not committed), and the **cause** of the stored-versus-mesh joint mismatch. The study itself labels the cause as such.
- **Production:** The study does **not** show that Star Rai joint placement is correct or incorrect, and it justifies no production change.

## 2. Exact commit and files inspected

| Item | Value |
|---|---|
| Repository | `heytylo-png/star-app-2-live` |
| Study branch | `research/reflib-v1-mpfb2-study`, head `8513fffa818c17e98bb47edee76c11a4d678ff3b` (verified with `git ls-remote`) |
| Study commit reviewed | `8513fffa818c17e98bb47edee76c11a4d678ff3b` |
| Study directory | `research/reflib_v1/mpfb2_study/` (39 files: 38 listed in the manifest, plus `MANIFEST.sha256`) |
| Read in full | `REPORT.md`, `README.md`, `MANIFEST.sha256`. Script sections: `scripts/02_joints_hierarchy.py` L9–11, L56–100; `scripts/03_coordinates_foot.py` L100–155; `scripts/05_weight_falloff.py` L13–20, L60–101; `scripts/06_compare_star_rai.py` L1–60 |
| Data used | `outputs/joints_{default,game_engine,rigify_human,rigify_human_toes}.csv`, `outputs/coordinates_foot.json`, `outputs/weight_falloff_profiles.csv`, `outputs/weight_falloff_summary.json`, `outputs/compare_ratios.csv`, `outputs/compare_segments.csv`, `outputs/compare_landmarks_normalised.csv`, `outputs/compare_star_rai.json`, `outputs/joints_hierarchy_summary.json`, `outputs/weights_summary.json` |
| Additional committed input (separately identified, §5.0) | `public/rig/star_rai_tripo/star_rai_tripo_v8_3_blender_bones.json` (SHA-256 `5d373125cc4fe19d97c0df0d986e362c0030228734fddac580b4c0b97c80849f`) and `…_mm.json` (`235767bfa9a932a6f8d4bb5892ea4a8568afb53d614d26dc83676c6ba31fc1de`) at commit `3ac5602ca232abee0a3e78b1ad450f73e6c4f512` (branch `rig/tripo-v8_3-hairalt-v3_5_1-experimental`). Read with `git show` into a read-only scratch copy; nothing checked out or modified. |
| Not available | The 10 MPFB2 input files (not committed, by design). Star Rai v10 `star_rai_locked_final_v10_blender_bones.json` (`eab1839c…`): not found on any repository branch. |

## 3. Access and manifest verification

- **Fetch and extract:**
  - `git fetch --depth=1 origin 8513fffa818c17e98bb47edee76c11a4d678ff3b`
  - `git archive 8513fff research/reflib_v1/mpfb2_study | tar -x` (into a scratch folder)
- **Manifest check:** For every `INCLUDED` line, `sha256sum` and `stat -c%s` were compared with the manifest. **38 of 38 matched; 0 mismatches.**
- **The manifest itself:** It does not list its own hash, by design. SHA-256 of `MANIFEST.sha256` at this commit: `1c97bd95a2ceaa08d676eec3df20b4a40b9f0a7d0d7831fb67810ff3b34bd910`.
- **Inputs not committed:** The 10 MPFB2 inputs appear in the manifest as `INPUT_NOT_COMMITTED`, with SHA-256 and git blob SHA-1. Their hashes could not be checked by this reviewer.
- **Study hash reports:** The study's before/after protected-file reports (`outputs/hash_verification_*.json`) concern files on the study author's machine. **NOT VERIFIABLE** here, and not needed for any technical verdict.

## 4. Claim-by-claim verdicts

Level: **L2** means reproduced from committed intermediate data and script review. **L1**, a raw-input re-run, was not performed for any claim.

| # | Claim (REPORT.md location) | Verdict | Confidence | Explanation |
|---|---|---|---|---|
| 1.1 | `rig = (x, −z, y)/10` is a proper rotation (§3.2 L48) | **PASS** | High | The matrix is orthonormal with det +1, a +90° rotation about X. Mapping the committed raw OBJ extents reproduces the rig extents and the 1.66589 m height exactly. |
| 1.2 | v8.3 uses the MPFB2 convention, so the mapping is identity (§6.1 L121–126) | **PASS** | High | Verified from the committed v8.3 JSON (§5.0): header Z-up, facing −Y, `_left = +X`. 21/21 left bones x>0 and 19/19 right bones x<0. Foot tail at −Y. The mm file is exactly 1000× the m file. **Scope:** this establishes axis-convention compatibility only. No spatial registration of meshes was performed or claimed. |
| 1.3 | v10 maps by (x,y,z)→(−x,−y,z), det +1, mm→m; front +Y, left −X (§6.1) | **NOT VERIFIABLE** | – | The v10 JSON is not committed anywhere. Only the study's summary booleans in `compare_star_rai.json` exist. |
| 1.4 | Rigify rigs are shifted +0.8183 m in Z; median VERTEX offset 0.8237 m (§3.2 L51) | **PASS** | Medium-high | Rigify `recomp` columns embed +0.818305 m, which is −z of `joint-ground` (`coordinates_foot.json`). The residual VERTEX dz median is 5.41 mm, comparable to the default rig's own 6.95 mm residual. So 0.8237 = 0.8183 + the general stored-versus-mesh drift. The ground-cube z itself comes from the raw mesh (L2 only). |
| 2.1 | Default recompute error: median 3.1, p95 5.9, max 6.2 cm, worst finger3-3 tails (§3.3 table) | **PASS** | High | Recomputed from the CSV coordinates: 3.12 / 5.93 / 6.24 cm, n=326, worst `finger3-3.L/.R`. The `head_err_m` and `tail_err_m` columns match the coordinate differences (0 mismatches). |
| 2.2 | game_engine: 5.5 / 6.2 / 81.8 cm (`Root`) | **PASS** | High | 5.54 / 6.16 / 81.83 cm, n=106. Without `Root`, the median is still 5.54 and the max 6.24 cm. |
| 2.3 | rigify_human 1.1 / 5.9 / 6.2 cm; rigify_human_toes 1.3 / 5.9 / 6.2 cm | **PASS** | High | 1.08 / 5.91 / 6.23 and 1.28 / 5.91 / 6.23 cm. |
| 2.4 | Per-strategy medians (VERTEX ≈0.96/0.95, MEAN ≈2.2, CUBE ≈3.9 cm); hand 5.8 versus other 1.7 cm (§3.3 L65) | **PASS** | High | head:VERTEX 0.96, tail:VERTEX 0.95, MEAN 2.11/2.25, CUBE 3.96/3.92 cm. Hand 5.79 against other 1.68 cm matches `joints_hierarchy_summary.json`. Strategy counts CUBE 216 / VERTEX 84 / MEAN 26 reproduced. |
| 2.5 | `Root` anomaly: default_position (0,0,0) but `joint-ground` at z −0.8183 (§3.2 L52) | **PASS** | High | `joints_game_engine.csv` row `Root`: CUBE `joint-ground`, default z 0.0, recomp z −0.818305, err 0.818305 m. |
| 2.6 | Why stored positions differ from the mesh (§3.3 L66, §1 #12) | **NOT VERIFIABLE** | – | The files do not establish a cause. The study labels "default macro targets" as INFERRED / NOT VERIFIABLE, which is correct. That hypothesis must not be read as a finding. |
| 3.1 | Blend widths: shoulder 15.4, elbow 7.1, hip 20.3, knee 9.1 cm (default, left) (§5 table) | **PASS** | High (arithmetic) | Recomputed from per-bin means in `weight_falloff_profiles.csv` with the script's interpolated first-crossing rule (`05_weight_falloff.py` L86–91): 15.44 / 7.14 / 20.30 / 9.13 cm. Each profile crosses 10 % and 90 % exactly once. Units are rig-space metres from dm/10. See §6 D3 for side dependence. |
| 3.2 | game_engine blend positions identical to default (§5 (b)) | **PASS** | High | Identical t10, t50 and t90 at all four joints on both sides. "Merged from default" stays NOT VERIFIABLE, as the report states. |
| 3.3 | Rigify widths are biased and not comparable (§5 footnote) | **PASS** | Medium | Widths reproduce (8.37 / 10.13 / 13.96 / 6.05 cm). The bias explanation is consistent with the helper-weight column (`w_helper_mean`) but is an interpretation. |
| 3.4 | Widths are reference information, not transferable settings | **PASS** (justified) | High | The measurement depends on: a per-joint cylinder radius (7–14 cm) and window (−15…+20 cm) with no sensitivity analysis; bin means rather than per-vertex values; the raw, unshaped base mesh in A-pose; one side (the knee differs by side); and static weights with no deformation test. These make the numbers descriptive of MPFB2 only. |
| 4.1 | Foot-bone pitch ≈27.2° (default `foot.L` and game_engine `foot_l`) (§3.5 L79) | **PASS** | High | atan2 over the committed head and tail gives 27.233° for both. 25.197° (default, mesh) and 28.229° (game_engine, mesh) are also reproduced. Frame: rig space, Z-up. |
| 4.2 | Sole slope ≈0.52°, toe slightly higher (§3.5 L80) | **PASS** | Medium | From the committed plane coefficients (dz/dx 0.02176, dz/dy −0.00908) along the script's axis (`03_coordinates_foot.py` L125–127): 0.521°, toe higher. The 288-vertex plane fit itself needs the raw mesh (L2 only). Sensitivity: 0.499° along ankle→toe instead. The plane also has an unreported **1.25° lateral tilt** (dz/dx). |
| 4.3 | Ankle height 6.75 cm above the sole plane (§3.5 L80) | **PASS** | Medium | −0.744785 − (−0.812298) = 6.751 cm. The plane fit itself is L2 only. See §6 D2 for the companion 6.37 cm value. |
| 4.4 | game_engine foot tail 1–3 mm from the sole; tail-on-sole pitch 28.8–29.0° (§3.5 L81) | **PASS** | Medium | `foot_tail_height_vs_sole`: 2.96 mm (default) and 1.04 mm (mesh); 28.82° and 29.01°. Internally consistent. |
| 5.1 | v8.3 proportion values (§6.3) | **PASS** | High | Recomputed from the committed v8.3 JSON with the study's landmark pairing (`06_compare_star_rai.py` `sr_landmarks`): head/S 0.1262, ankle/S 0.100, thigh:shin 1.1027, upper:fore 0.8273, leg/S 0.4421, hip spacing/leg 0.1938, foot/S 0.1299, arm/leg 0.6664. v8.3 foot pitch 46.305°. All match the CSV. |
| 5.2 | v10 proportion values (§6.3) | **NOT VERIFIABLE** | – | The v10 input is not committed. |
| 5.3 | MPFB2 proportion values (§6.3) | **PASS** | Medium | Ratio arithmetic spot-checked from `compare_segments.csv` lengths (thigh/shin 0.42128/0.38173 = 1.1036; default 0.39444/0.4076 = 0.9677; head/S 0.0915). The landmark positions come from the raw mesh (L2 only). |
| 5.4 | Star Rai head is "+40–60 %" larger relative to stature (§6.3 L146) | **FAIL** (minor range error) | High | Reproduced range: v8.3 +38 to +46 %, v10 +55 to +64 % (v10 itself NOT VERIFIABLE). The stated range omits both ends. |
| 5.5 | Ankle "2.3–2.5×" higher relative to stature (§6.3 L146) | **FAIL** (minor range error) | High | v8.3 2.30–2.44× (inside). v10 2.52–2.67× (outside the stated upper bound; v10 NOT VERIFIABLE). |
| 5.6 | Proportion comparison is distinct from joint validation; limitations stated (§6.2, §6.4, §1 #11) | **PASS** | High | Only pose-independent quantities are compared. Arm and lateral landmarks are excluded. Joint-placement quality is explicitly NOT VERIFIABLE. Nothing claims Star Rai joints are right or wrong. |
| 6.1 | Lesson: mesh-driven joint placement (§8.1) | **PASS** as a principle | Medium | The strategies are observed in the data (CUBE/VERTEX/MEAN counts reproduced). The study's own measured 1–6 cm drift of cached positions supports "always recompute". That it works for Star Rai is not tested. |
| 6.2 | Lesson: blend widths as fractions of segment length, a starting reference (§8.4) | **PASS** as reference only | Medium | Fractions reproduce: 0.678 / 0.315 / 0.482 / 0.239 (left) against the cube-to-cube limb length. They inherit every method dependency in 3.4. The right knee gives 0.206. |
| 6.3 | Lesson: foot pitch follows from proportions over a flat sole (§8.2) | **PASS** within MPFB2 | Medium | Supported for game_engine `foot_l` (4.4). Applying ~45° to Star Rai is an INFERENCE; the v8s sole is not analysed. |
| 6.4 | Lesson: game variant "derived from the rich set at identical blend positions" (§8.3) | **FAIL** (as worded) | High | §1 #13 and §5 (b) mark the derivation NOT VERIFIABLE, but §8.3 states it as fact. Identical blend positions are verified; the derivation is not. |
| 6.5 | Lesson: masks kept as separate vertex groups (§8.5) | **PASS** | Medium | `mhmask-no-smooth` and `mhmask-preserve-volume` are present in `weights_summary.json`. |

## 5. Reproduction methods, commands and results

### 5.0 External-to-study input (identified separately)

The study read Star Rai bone JSONs from a local path (`06_compare_star_rai.py`: `/workspace/artifacts/spine_requests`) that this reviewer cannot reach. The v8.3 files with **identical SHA-256** are committed in this repository at `3ac5602` (paths in §2). They were used, read-only, to verify the v8.3 claims. This is the same input by hash, not an unrelated source. No v10 file with SHA-256 `eab1839c…` exists on any branch.

### 5.1 Commands

```
git fetch --depth=1 origin 8513fffa818c17e98bb47edee76c11a4d678ff3b
git archive 8513fffa818c17e98bb47edee76c11a4d678ff3b research/reflib_v1/mpfb2_study | tar -x -C <scratch>/study
git fetch --depth=1 origin rig/tripo-v8_3-hairalt-v3_5_1-experimental      # -> 3ac5602ca232abee0a3e78b1ad450f73e6c4f512
git show 3ac5602:public/rig/star_rai_tripo/star_rai_tripo_v8_3_blender_bones.json    > <scratch>/v83.json     # sha256 5d373125…
git show 3ac5602:public/rig/star_rai_tripo/star_rai_tripo_v8_3_blender_bones_mm.json > <scratch>/v83_mm.json  # sha256 235767bf…
python3 -I scripts/reproduce_mpfb2_review.py <scratch>/study/research/reflib_v1/mpfb2_study <scratch>/v83.json <scratch>/v83_mm.json > outputs/repro_output.json
```

The manifest check loop is in §3. Environment: Python 3 and numpy. No Blender, no add-ons, no downloads of MPFB2 assets.

### 5.2 Results

All figures in §4 come from `outputs/repro_output.json`, keyed by check group: `C1_conversion`, `C1b_v83`, `C1d_rigify_offset`, `C2_joints`, `C3_blend`, `C4_foot`, `C5_proportions`.

A separate one-off check confirmed that each default-rig blend profile has exactly one upward 10 % and one upward 90 % crossing (no ambiguity in the first-crossing rule). It is not in the committed script; the result is recorded here.

## 6. Corrections to the original report (identified separately; the original is not edited)

- **D1, head and ankle ranges (§6.3 L146).** "+40–60 %" should read about **+38–64 %** (v8.3 +38–46 %, v10 +55–64 %). "2.3–2.5×" should read about **2.30–2.67×** (v8.3 2.30–2.44×, v10 2.52–2.67×). The v10 parts are NOT VERIFIABLE here.
- **D2, default-position ankle height (§3.5 L80).** "6.37 cm (default_position)" evaluates the sole plane under the **recomputed** ankle. Evaluated under the default-position ankle, it is **6.43 cm**, which is the value the same JSON uses in `foot_tail_height_vs_sole`. The difference is 0.6 mm, caused by the plane's 1.25° lateral tilt. The two definitions should be stated.
- **D3, blend widths are left-side only (§5).** The right side matches within 0.05 cm for shoulder, elbow and hip, but the **right knee width is 7.86 cm against 9.13 cm on the left** (14 % narrower; t10 −2.34 against −3.52 cm). The report mentions the knee t10 difference but quotes 9.1 cm as if general.
- **D4, lesson §8.3 wording.** "Derived from the rich set" contradicts the report's own NOT VERIFIABLE label (§1 #13). It should read "consistent with being derived".
- **D5, unreported lateral sole tilt.** The sole plane tilts about 1.25° across the foot (dz/dx = 0.0218). This is not mentioned in the report text, though it is in `coordinates_foot.json`.

## 7. Unsupported or unresolved claims

- **Everything about v10:** axis mapping, sole at −88 mm, the ankle→head 211.65 mm header match, the v10 ratios, and "no uniform transform from v10 to v8.3". The input is not committed.
- **Cause of the default_position-versus-mesh drift.** Not established by the files.
- **game_engine weights as a merge of default.** Not established. The study says so too.
- **Raw-level results.** The plane fit, cube centres, cylinder selections and weight sums all need the 10 raw inputs. Reproduced here only from the derived outputs (L2).
- **Protected-file before/after hashes.** These refer to files outside this reviewer's reach.
- **Deformation quality.** Not evaluated: no Blender. Weights were analysed statically only.

## 8. Transferable research lessons

**General methods worth keeping:**

- Define joints from mesh features (cube centre, vertex, mean of vertices) and **recompute from the live mesh**. Treat stored coordinates as caches to validate, not as truth. The study's measured 1–6 cm cache drift is the evidence.
- Report joint discrepancies **by strategy and region** (VERTEX ≈1 cm, CUBE ≈4 cm, hands ≈5.8 cm). Aggregate figures hide where the error sits.
- Measure blend zones with an explicit, reproducible definition (10 %→90 % of distal weight along the limb axis). State the radius, window, binning and side, and report **both sides**.
- Normalise proportions by stature and compare **only pose-independent quantities**. Keep convention mapping (axes, units, sole reference) explicit and verified from data.
- Separate MEASURED, INFERRED and NOT VERIFIABLE throughout. The study mostly does this well.

**MPFB2-specific, not to transfer directly:**

- MPFB2 joint coordinates, weights and vertex indices (a different topology).
- The ~11-head realistic proportions.
- MPFB2 and Rigify bone naming and rig structure (Rigify needs generation, has 6 parentless roots and constraints).
- The specific blend widths as settings.
- The 27° foot pitch.
- The game_engine `Root` convention.

## 9. Production-safety conclusion

This review found no evidence that would justify changing Star Rai's mesh, skeleton, weights, foot or ankle rig, or production pipeline. The MPFB2 comparison establishes **proportion differences** at v8.3 (verified) and v10 (not verifiable here). It does **not** validate or invalidate any Star Rai joint position. **No production change is recommended or authorized.** The user remains the final approver for any future application.

## 10. Remaining questions and recommended next research step

1. **L1 re-run (recommended next step; research only, no new downloads).** A bot holding the already-approved 10 MPFB2 files re-runs `scripts/run_all.sh` at `8513fff` and compares every output's SHA-256 with `MANIFEST.sha256`. That converts the L2 verdicts here to L1.
2. **v10 evidence.** If the user wants the v10 claims verified, the v10 bone JSON (`eab1839c…`) or its derived landmarks must be committed under the handoff standard. That is the user's decision.
3. **Sensitivity of the blend widths.** Vary the cylinder radius (±30 %) and the window, and report the right side, before using any width even as a reference range.
4. **Update the original report.** The study author should address D1–D5 in a new commit on the study branch. This reviewer does not edit it.
