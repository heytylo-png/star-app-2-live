# Independent review: bv9 camera-scale verification v1 (Issue #177)

Reviewer: Claude (independent reviewer). Date: 2026-11-09. **Research only.** No camera is accepted by this review; that is the user's decision. It approves no change to bv9, the v10 armature or any production asset.

## 1. Executive summary

- **Evidence and verdict.** The committed evidence is intact: 35 of 35 manifest entries match, and the frozen-method hash matches. Every step reproduces from the committed data. Recomputed from the committed rows and the frozen rule, the scale verdict is **NOT VERIFIABLE (inconclusive)**, matching BlendBro.
  - side 6.0339 px/mm, back 5.9671 px/mm (1446 and 1430 px over 239.647 mm)
  - side-vs-back spread 1.113 %, between the 1.0 % SHARED and 1.415 % NOT SHARED thresholds
  - both front estimators fail their gates: width-mirror cost 17.1 px against ≤ 2 px; crotch ratio 1.178 against the mirror ratio 0.9945
- **Step 3.** Correctly not run.
- **Correction to my own earlier review.** `567d04f` §6.1 said Mode L's scale was "consistent across three views (1.1 %)". That was wrong. Mode L's front scale is **defined** as mean(side, back) (6.0005 = (6.0339 + 5.9671)/2, confirmed). The 1.1 % is side against back only and never tested the front. BlendBro is right (its F5).
- **New point (INFERRED, model-independent).** The references' own figure heights give a side/back ratio of **1.0112**. Mode F's scales imply **1.0424**, which is **3.1 % off**, about 9× the detection uncertainty (0.35 %). Mode L matches 1.0112 by construction. The only assumption is that the same figure has the same sole-to-crown height in the side and back drawings.
  - So Mode F's view-to-view scaling is inconsistent with the references themselves. That supports the earlier suspicion that the best-fit camera absorbs shape mismatch into scale.
  - It does **not** prove Mode L's absolute scale. Mode L also assumes the model's sole-to-crown proportion equals the reference's.
- **Front crop.** Confirmed CROPPED: 20 px of outline on row 0, against 41 px of margin in side and back. The implemented Mode L front scale is unaffected (0 % bias, as defined). A crown-based front scale would be **+5.8 %** high against mean(side, back), or +7.0 % against the failed D3 front value. BlendBro's "5–7 %" spans both.
- **Step 4.** Implemented correctly. Recomputing the sign rule from the committed components gives the same values: baseline false (no change); retrospective A false (sign flips under recalibration), B true, B1 true. No earlier verdict changes.
- **Process flag: needs the user's attention.** The local folders of the bv9 validation and the correction study vanished from BlendBro's machine. The protected set is now **8,024 files, down from 9,079**. That "all protected files unchanged" is true only for the current, smaller set. Whether any of the 1,055 missing files were protected checkpoints, and not just study outputs, is **NOT VERIFIABLE** here and should be checked on the machine.

## 2. Exact commit and files inspected

| Item | Value |
|---|---|
| Repository | `heytylo-png/star-app-2-live` |
| Branch / commit | `research/issue-177-camera-scale-v1` @ `9939d1829b9d2c0ce9e21f73110d8b401bb1ad23` (branch head confirmed with `git ls-remote`) |
| Folder | `research/issue-177/bv9_camera_scale_v1/`: 35 files |
| Read | `METHOD_AND_CRITERIA_FROZEN.md` (SHA-256 `c714596611ebef477ed14eded3307348b453ff4d02f4fd806687273d6ae55f9c`), `REPORT.md` |
| Data used | `data/step12_run{1,2}.json`, `data/step4_recal_sign_run{1,2}.json`, `data/exploratory_width_run{1,2}.json`, `data/c09_measure_baseline_run{1,2}.json`, `data/c09_baseline_comparison.json` |
| Viewed | The contour images supplied with the handoff: the width profile, the front top crop and the full-body top/sole rows |
| Not available (by design) | Reference pixels and masks, bv9 geometry. Nothing that needs them was re-derived. |

## 3. Access and manifest verification

- **Fetch:** In a fresh `git init` folder: `git fetch --depth=1 https://github.com/heytylo-png/star-app-2-live 9939d1829b9d2c0ce9e21f73110d8b401bb1ad23`, then `git archive … | tar -x`.
- **Manifest:** 35 of 35 entries match by SHA-256. `MANIFEST_sha256.txt` = `45ea9af0e34df955362ef5429901e9c74bcbd67c99ee0b6d059ed7195f8a4ea6`, as stated.
- **Run-to-run:** Runs 1 and 2 are identical for steps 1–2, step 4, the exploratory width check and the c09 baseline. Steps 1–2 differ only in the `run` label.
- **Baseline re-measure:** The fresh c09 baseline equals the committed correction-study baseline (12,741 keys, max diff 0.0).

## 4. Claim-by-claim verdicts

| # | BlendBro claim | Verdict | Confidence | Evidence |
|---|---|---|---|---|
| 1 | Side 6.034 and back 5.967 px/mm, 1.11 % apart (MEASURED) | **PASS** | High | 1446/239.647 = 6.0339; 1430/239.647 = 5.9671; spread 1.113 %. The pixel rows themselves need the uncommitted masks. |
| 2 | 1.11 % falls between the frozen 1.0 % and 1.41 % thresholds → inconclusive | **PASS** | High | u_rel = 3/1446 = 0.207 %, so the NOT SHARED threshold is 1.0 + 2 × 0.207 = 1.415 %. |
| 3 | Mode L front = mean(side, back), so the front was never tested | **PASS** | High | 6.000480 = (6.033863 + 5.967098)/2 exactly. Also stated in the frozen method §2. |
| 4 | Both independent front estimators fail their quality checks | **PASS** | High | D3 mirror cost 17.13 px (gate ≤ 2), with a flat minimum at r ≈ 0.995 (cost 17.13 against 17.34 at r = 1). D4 r_crotch 1.178 against r_fb 0.9945 (18.5 % apart; gate ≤ 1 %). |
| 5 | Front and back outlines don't mirror at any one scale (MEASURED); the cause is INFERRED | **PASS** | Medium | The cost curve never approaches the 2 px gate (min 17.1 px). The width-profile plot shows close agreement from the soles to the hips, then divergence at the arms and hair/shoulders. Cause not established. |
| 6 | Front reference cropped: 20 px on row 0 (MEASURED); skull top probably in frame (INFERRED) | **PASS** | High (crop) / Low (skull) | Frozen rule: top_row 0 and n0 = 20 ≥ 10 → CROPPED. The predicted skull row (98.9) uses r_fb from the failed D3 estimator, so it is INFERRED only. |
| 7 | Crop has 0 effect on the implemented Mode L front scale | **PASS** | High | Mode L front = mean(side, back); blanking the top 7 rows leaves it identical. |
| 8 | A row-0-based front scale would be ≈ 5–7 % too high | **PASS** | Medium | 6.3468 against 6.0005 (+5.8 %) or against D3's 5.9343 (+7.0 %). |
| 9 | Step 3 not run because Step 1 ≠ SHARED | **PASS** | High | Required by the frozen precondition. |
| 10 | `recal_modeF_agrees_sign` implemented; baseline false; retrospective A false, B and B1 true; no verdict changes | **PASS** | High | Values recomputed from the committed P/R components match the frozen definition (non-zero, same sign). A: P −0.593 / −1.032 against R +0.637 / +0.340. |
| 11 | All protected files unchanged | **PASS** for the current set; **NOT VERIFIABLE** for the original set | – | 8,024 files hashed before and after, against 9,079 in the correction study. The difference comes from the vanished folders (REPORT L119–121). |
| 12 | Disclosures: post-run fix of the NOT SHARED label; exploratory width check added after run 1 | **PASS** (adequately disclosed) | High | The fix applies a frozen override; the exploratory check does not feed the verdict. |

## 5. Reviewer addition: view-to-view scale ratios

This test is independent of the model's proportions: the model height cancels in the ratios.

| Quantity | side/back |
|---|---|
| Reference figure heights (sole-to-crown px, 1446 / 1430) | **1.0112** |
| Mode L scales | 1.0112 (by construction) |
| Mode F scales (5.9800 / 5.7367) | **1.0424** |
| Mode F against reference | **+3.09 %** |
| Detection uncertainty on the ratio (3/1446 + 2/1430) | 0.35 % |

- **Interpretation (INFERRED).** If the side and back drawings show the same figure at its true height, Mode F's per-view scales disagree with the references themselves by about 3 %. Mode F's implied back figure height is 1374.8 px; the reference's is 1430 px. That is consistent with Mode F shrinking the back (and front: Mode F front/back = 0.9926 ≈ r_fb 0.9945) to fit a model whose torso and arm outline differs from the reference.
- **What it does not show.** Mode L's absolute scale relies on the model's sole-to-crown height matching the reference's proportions, which is not established. So this weighs against Mode F's per-view scaling, but it does not validate Mode L.

## 6. Production-safety conclusion

No camera is accepted, no candidate exists, and nothing justifies changing bv9, the v10 armature or any production asset. **No production change is recommended or authorized.**

## 7. Open items

1. **Missing local folders and the reduced protected set (user action).** Confirm on BlendBro's machine what removed `/workspace/blendbro/out/bv9_reference_validation_v1/` and `…/bv9_correction_study_v1/`, and whether any of the 1,055 files absent from the protected set were protected checkpoints. The candidate `.blend` files and the underlay overlays are gone locally. The committed GitHub evidence is intact.
2. **Absolute scale.** This needs outside input: a front reference with the full head in frame, or a stated scale or camera for the reference set. Images alone cannot settle it.
3. **Possible next research step (proposal; needs approval).** Fix the **relative** view scales from the reference heights (side/back = 1.0112; front from the full-head reference once supplied). Then report the arm/torso gap attribution as a function of the single unknown absolute scale. That shows which absolute scale would make the gap "arms" against "torso", without choosing one.
