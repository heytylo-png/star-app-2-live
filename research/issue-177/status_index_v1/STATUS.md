# Issue #177 status index (v1)

Compiled by Claude, 2026-11-11 UTC. **An index, not a result.** It lists every research branch for #177, its verdict as stated in its own handoff, its review status and the open decisions. Verdicts are quoted from the handoff comments and branch tips; they were not re-verified here unless the "Checked here" column says so. Nothing in this file approves anything. The user decides.

- **Snapshot:** 21 comments on #177 (latest 2026-11-10 23:41 UTC); 19 research branches.
- **Base:** every research branch is cut from master `4fd282e3a1c7cf261b134b2fd6d55c3dc7c35dfb`. Master has since moved to `97e11c0` (PR #180, app fixes); that change touches no file under `research/`.
- **None of these branches is merged and none has a pull request.**

## 1. Where things stand

- **bv9 body vs the official references:** bv9 does not meet the references. Three correction candidates failed or could not be verified. The blocker is the unknown camera scale of the reference images.
- **Tripo model 2 as a preview rig:** usable for animation previews. Its two preset animations collide with the thighs as shipped; a +20° upper-arm offset removes that, and the faded version keeps the wave intact.
- **Tripo `greet_02` on the locked v10 skeleton:** retargets cleanly at skeleton level once the arms get a rest correction. Against the real v10 printed parts the limbs clear each other, but 18 joints touch or overlap, and the joint-range check so far finds the neck and left hip cannot follow the wave. That check is still running.

## 2. bv9 reference benchmark

| Task | Branch @ tip | Verdict in its handoff | Review |
|---|---|---|---|
| Reference accuracy validation | `research/bv9-reference-validation` @ `f81fa46` | bv9 does NOT meet the references: front, side and back FAIL (outline p95 4.1–5.1 mm); three-quarter views and head NOT VERIFIABLE | none posted for this branch |
| Correction study v1 | `research/bv9-correction-study-v1` @ `5a75023` | A arm/hand FAIL; B foot FAIL; B1 foot FAIL; C legs NOT VERIFIABLE | reviewed: `research/issue-177-bv9-correction-claude-review` @ `567d04f`, verdicts reproduce |
| Camera-scale verification v1 | `research/issue-177-camera-scale-v1` @ `9939d18` | shared scale NOT VERIFIABLE (side vs back differ 1.11 %); front reference CROPPED; step 3 not run | reviewed: `research/issue-177-camera-scale-claude-review` @ `1981955`, results reproduce |

## 3. Tripo model evaluation

| Task | Branch @ tip | Verdict in its handoff | Review |
|---|---|---|---|
| GLB inspection (model 1) | `research/issue-177-tripo-glb-inspection-v1` @ `e2ed44e` | usable for relative torso/arm/leg proportions; not for head, feet or topology | none posted |
| Auto-rig evaluation v1 (models 1 and 2) | `research/issue-177-tripo-autorig-eval-v1` @ `2b726cd` | frozen verdict NOT USABLE for both; the penetration gate was found to misfire, so for model 2 it should be read as NOT VERIFIABLE; model 1's arms are fused to the body | none posted; gate replaced by collision v2 |
| Collision test v2 (model 2) | `research/issue-177-tripo-collision-v2` @ `19d405f` | **USABLE for animation previews**; `greet_02` as shipped passes arms into thighs in 37 of 48 frames | none posted |
| Animation screening v1 | `research/issue-177-anim-screen-v1` @ `344ee17` | `standing_relax` collides in 48 of 48 frames; exploratory: 15° outward upper-arm offset clears both animations, 20° suggested | none posted |

## 4. Arm offset on the Tripo preview rig

| Task | Branch @ tip | Verdict in its handoff | Review | Checked here |
|---|---|---|---|---|
| +20° offset, first implementation | `research/issue-177-armfix20-v1` @ `aa747d0` | 0 collisions in both animations (every second key); output `95616b21…` | none posted | no |
| +20° offset, second implementation | `research/issue-177-arm-offset-v1` @ `d03d7d5` | 0 new pairs at every key in both animations; mesh, weights and skeleton byte-identical; in `greet_02` the raised hand ends up in front of the face; output `72e56941…4a1b` | reviewed with the fade (below) | manifest and 8 report claims rechecked in the audit of 2026-11-10 |
| Elevation fade of the offset | `research/issue-177-arm-fade-v1` @ `f2e3a43` | **frozen verdict FAIL:** C1 holds (0 new pairs at every key); C2 fails (hand path, 8 of 38 keys, max 8.60 % H) because the window includes arms-down frames; output `bc6111e7…c3fc` | reviewed: `research/issue-177-arm-fade-claude-review` @ `5bc3bf7`. FAIL confirmed; amendment A1 (window = raised part) PASS; no snap measurable; reviewer calls the faded file suitable for preview tests | manifest and 11 report claims rechecked in the audit |

The two +20° implementations were made independently. Their output files differ in size and hash; they have not been compared with each other.

## 5. Tripo animation on the locked v10 skeleton

| Task | Branch @ tip | Verdict in its handoff | Review | Checked here |
|---|---|---|---|---|
| Proportions, preliminary | `research/issue-177-v10-proportions-prelim` @ `5624f80` | superseded by the next row | — | no |
| Joint-by-joint comparison | `research/issue-177-v10-compare-v1` @ `5b1265b` | arms within 5 %; Tripo stance wider (ankles 41 vs 20 mm); shoulders 17 % narrower | none posted | no |
| Retarget v1 (`greet_02`) | `research/issue-177-v10-retarget-v1` @ `571381c` | C1, C2, C3 PASS at skeleton level; arms 11°–18° off Tripo's directions without a rest correction | reviewed at `798db9f`: `research/issue-177-v10-retarget-claude-review` @ `9daf678`. All numbers reproduce; amendment A1 (arms get the rest correction) PASS. **Addendum `571381c` not reviewed** | manifest and 10 report claims rechecked in the audit; addendum added after it |
| Printed-part clearance | `research/issue-177-v10-part-clearance-v1` @ `9247164` | frozen method: calibration C0 FAIL, so C1 NOT VERIFIABLE (on record). Post-hoc A2: C1 PASS, min clearance 1.434 mm. Without the arm correction: FAIL in 97 of 135 keys. 18 joint pairs touch or overlap | none posted | no |
| Joint range | `research/issue-177-v10-joint-range-v1` @ `82e35e0` | **interim, run in progress.** Neck LIMITED (wave asks 36.8°, about 13° available). Left hip LIMITED (asks up to 41°). Two lower spine joints FOLLOW; waist to mid-chest LIMITED by 0.7°; mid-chest to upper chest not exercised | none yet | interim table compared with the committed run logs: matches |

## 6. Open decisions for the user

**bv9**
1. Which camera, if any, is accepted for the reference images; the correction work is blocked on this.
2. Whether to supply three-quarter references and a scale statement.
3. Foot: a decision on foot volume and the locked v10 foot bone before any further foot work.
4. Process flag from the camera-scale review: the protected file set on the producing machine fell from 9,079 to 8,024 files. Whether any of the 1,055 were protected checkpoints is not verifiable from GitHub.

**Tripo**
5. Whether the Tripo GLB is accepted as a proportion reference, with which scale convention, and where the binaries are stored.
6. Whether the faded +20° file is the one to use for previews (the reviewer says it is suitable; not production).

**v10**
7. Whether v10 is meant to be poseable. The joint contacts and the joint-range limits matter only if it is.
8. If it is: what to do where the wave exceeds a joint, once the joint-range run is complete (clamp, scale the motion, or change the bone map).
9. Whether the printed-part clearance result needs an independent review; its passing result comes from a post-hoc amendment.

## 7. Open work items

- Joint-range run: right hip, elbows, wrists, knees and ankles still to finish; final handoff with manifest still to come.
- Review of the retarget addendum (`571381c`).
- Two ideas not yet tested, both aimed at the joint-range limits (proposals only):
  - map Tripo's lower neck joint onto v10's `upper_chest`, whose joint currently gets 0°, to share the neck's load;
  - run the other reading of the leg stance correction (v10 keeps its own narrow stance) and compare hip demand.

## 8. Files that are deliberately not on GitHub

| File | SHA-256 (as recorded in the handoffs) |
|---|---|
| `star_rai_locked_final_v10_blender_bones.json` | `eab1839c7eb4d05b6e7c8a98527d40a6a88e5679c12b249e87aff65bdb686c05` |
| `star_rai_armature_final_v10.blend` | `f459ea1f14ca09d59b2cf7e227182b74d65ecfbb0271d1189045d1b5a8f0514f` |
| `starmodelrigpose.glb` (Tripo model 2 with both animations) | `57cb05de332adaae6271d5ba5852d5b268dab20abfd3bf4c53f92f58536229c7` |
| `starmodelmeshrig.glb` (Tripo model 2, `greet_02`) | `f688ab28c9640c5f6c6e5038715fc26f8652759cd151bdc79e2c324de7c03f08` |
| `starmodelrigpose_arm20.glb` (unfaded +20°) | `72e56941cdaf453fbe5a9434847a31181d4c8b0a91ecce48ae329085dc7c4a1b` |
| `starmodelrigpose_armfade20.glb` (faded +20°) | `bc6111e72051f15b15457b259090e15a3bdd6af51adffadcb7bb2317d7bfc3fc` |
| `v10_greet02_pose.json` (retargeted pose) | `aaa2fe73a01806d0ed896d05fa1559ce7d9c452eb62b271235dd76610ad52355` |

Also not on GitHub: the bv9 `.blend` files and mesh exports, the nine official reference images, Tripo model 1, and the v10 printed-part STL files.

## 9. How this index was made

- Branch list and tips: `git fetch` of all `research/*` branches, 2026-11-11 UTC.
- Verdicts and review status: the 21 comments on #177. A branch is marked "reviewed" only where a review comment names it.
- "Checked here" refers to the self-audit of 2026-11-10 in the session that produced `arm_offset_v1`, `arm_fade_v1` and `v10_retarget_v1`.
- This file goes stale with the next handoff. Replace it with a new version on a new branch; do not edit it in place.
