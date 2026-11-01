# Seed-san study: independent review (Claude)

Issue: #179, Reference Library v1. Status: research record only. **This review approves no production integration, asset use, redistribution or training.** It does not recommend production integration.

Repository visibility: **public**. Per `docs/WORK_HANDOFF_STANDARD.md` (pilot clause, branch `docs/shared-bot-handoff-standard`, commit `cb7d3219ca4ca11d834ab30ad5a7b482fa6b11b8`), this review contains summary-level findings only. It contains no extracted textures, file-level hashes of extracted assets, per-material parameter tables or JSON excerpts.

## 1. Access check (standard step 5)

Checked on 2026-11-01 (UTC), against `heytylo-png/star-app-2-live`:

| Check | Result |
|---|---|
| Branch for Seed-san evidence (e.g. `research/issue-179-seed-san-evidence`) | **Does not exist.** All 137 branches were listed; there are no `research/*` branches. |
| Committed TextureBro `REPORT.md`, images, `uv_stats.json`, scripts | **Not committed** on any branch. |
| Committed BlendBro `HANDOFF.md`, `verify_counts.py`, manifest | **Not committed** on any branch. |
| Code search for `Seed-san` in this repo | 0 results. Note that code search covers the default branch only. |
| Only Seed-san-related committed text | The issue #179 comments and `docs/WORK_HANDOFF_STANDARD.md` (commit `cb7d321`), which state scope only, not evidence. |

**Conclusion: no Seed-san study evidence is accessible from the repository.** Under standard step 6, every technical claim is therefore **NOT VERIFIABLE from repository evidence**.

Outside the repository, the reviewer received BlendBro's `HANDOFF.md` as a chat attachment (SHA-256 `8203c28a067b208d88b9f700e4fdc6f52c19f0470640282e05d09d080661eb52`, matching the hash BlendBro stated). It is used below **only** to record what BlendBro reports. It is not repository evidence and is not committed here.

## 2. Scope and approval status (from issue #179 comments)

- **Approved for Seed-san:** a metadata-only partial-range read (GLB header and JSON chunk, licence fields only).
- **Exceeded:** TextureBro's full-file study (full download, texture extraction, material, texture, spring and expression analysis) went beyond that approval. TextureBro disclosed this, and the handoff standard confirms it is not retroactively authorized.
- **Later instruction:** The full JSON chunk is to be quarantined or discarded, and mesh, material and expression descriptors are not to be analyzed.
- **Consequence:** Closing any NOT VERIFIABLE item below would require evidence the user has ordered quarantined. **That needs explicit user approval.** This review does not request or assume it.

## 3. Evidence classes used

- **[IND]: independently verified by Claude** from public upstream sources, or by recomputing arithmetic from figures.
- **[BB]: reported by BlendBro** in the off-repository `HANDOFF.md`. Not independently checked against data.
- **[NV]: not verifiable.** No evidence is accessible.

Not one technical claim below is verified from repository evidence. Even the [BB] corrections rest on `json_chunk.json`, which TextureBro extracted. Its integrity against the source file was never re-checked, and both bots depend on it.

## 4. Claims, verdicts and corrections

| # | TextureBro claim | BlendBro-reported correction [BB] | Independent check [IND] | Verdict on repo evidence | Verdict if [BB] is accepted |
|---|---|---|---|---|---|
| 1 | 17 materials: 9 MToon, 8 PBR | 17 total; **10 MToon, 7 non-MToon** (6 plain PBR, 1 emissive-only). REPORT's own table shows 10. Backpack PBR materials also use a base-colour texture. | Arithmetic only: the 10/7 split is consistent with BlendBro's own table. | **NOT VERIFIABLE** | Split **FAIL**, total PASS |
| 2 | 15 PNGs, ≈6.7 MB, mostly 1024px | 15 PNGs; 9 at 1024²; total 6,952,233 B, or 6,759,468 B without the thumbnail | Recomputed from BlendBro's per-file byte list: 6.952 MB / 6.630 MiB (all), 6.759 MB / 6.446 MiB (no thumbnail). "6.7 MB" matches neither. 9 of 15 at 1024² reconfirmed from the listed dimensions. | **NOT VERIFIABLE** | **PARTIAL**: count and resolution pass, size figure fails |
| 3 | 9 hair spring chains, 28 joints, 8 colliders | Totals hold (9 springs, 28 joints, 8 colliders: 7 capsule, 1 sphere). **One chain is a backpack wire.** Hair is **8 chains, 21 joints**; only **4 colliders** serve hair (tail only); front hair has none. Whether chain end-joints simulate is undocumented. | Arithmetic: 7 + 7×2 + 7 = 28 and 7 + 14 = 21 are consistent. | **NOT VERIFIABLE** | **FAIL** as a hair claim; totals pass |
| 4 | 18 presets driven by blendshapes | 18 presets; **`neutral` drives nothing** (REPORT lists 17). **5 emotion presets also drive texture-offset binds on the robot visor material.** 43 morph targets, 27 unused. | The public upstream README describes Seed-san as "Expressions (Morph, UV Transform)", which corroborates that not all expressions are morph-only. | **NOT VERIFIABLE**. Public corroboration is partial only. | **PARTIAL** |
| 5 | Eye movement by blendshapes, not eye bones | `lookAt.type = expression`; look presets bind 4 look morphs; no `leftEye`/`rightEye` in the humanoid map | The public upstream README lists Seed-san "LookAt (Expression)". | **NOT VERIFIABLE** for the file itself. Public corroboration of the configured LookAt type. | **PASS** at configuration level; runtime behaviour untested |

Upstream public source for the [IND] corroboration: `vrm-c/vrm-specification`, commit `94e82dd346fa6cf0337c4421728640e5252dd38e`, `samples/README.md`.

### Further BlendBro-reported issues [BB], all NOT VERIFIABLE from repo evidence

- The face texel-density figure (1,208 px/m) is a **whole-head average**, not the face island. "≈2.5×" is 2.67× against body skin or 2.28× against clothes (ratio arithmetic [IND]).
- REPORT's flipped-triangle "mirrored strips" reading is unsupported: the baseline is about 100% on 16 of 21 primitives.
- "Non-mirrored butterfly" overstates the face layout; only non-overlap is supported.
- 27 morph accessors are stored densely, not "a few".
- An unexplained 40-vertex clothing-material primitive sits inside the hair mesh.
- The following are unreproducible even off-repo: weight statistics and "face 100% single-bone", hair colour samples, texture-to-anatomy mapping, the code behind the contact sheet and UV overlays, and the decoded-memory method.

## 5. Proposed lessons: demonstrated versus borrowed

| Lesson | Demonstrated by Seed-san? (per [BB]) | Verdict |
|---|---|---|
| Gradient-strip hair atlas | Strip stacking reported (high UV self-overlap). Gradient colour content is unreproducible. | **PARTIAL**, NOT VERIFIABLE on repo evidence |
| Packed material channels | **Not demonstrated.** The reported evidence shows separate single-purpose masks and no packed metal/roughness texture. | **FAIL** as a Seed-san lesson. It may be a valid independent idea. |
| Material-specific outlines | Per-material outline width and colour, plus width masks, reported | **PASS** on [BB]. Adoption cost is unmeasured. |
| Higher face texture resolution | What is reported is extra face texel density **within a shared atlas**, not a higher-resolution texture | **PARTIAL** |
| Painted skin-shadow control | A shading-shift texture is reported; what anatomy it covers was not mapped. MToon shading-shift is not automatically equivalent to an ILM threshold channel. | **PARTIAL** |
| Short spring chains | True for front hair (2 joints) only; tail hair is 7 joints. End-joint semantics unknown. | **PARTIAL** |
| Expression overlays | Texture-offset expressions are reported **only on a flat robot visor**, never on a deforming face | **FAIL** as a derived lesson |

## 6. Mobile performance: measured results versus assumptions

**Measured results: none.** No frame-time, GPU-memory, draw-call, skinning or morph-cost measurement exists in the study or in this repository. REPORT's performance statements are assertions.

**Arithmetic estimates.** These come from BlendBro-reported dimensions [BB] with recomputed arithmetic [IND]. They are not measurements:

- The 14 runtime textures (thumbnail excluded), decoded as RGBA8 with full mips, come to about **53.7 MiB**. With block compression: about 13.4 MiB at ASTC 4×4, about 6.0 MiB at ASTC 6×6, about 3.4 MiB at ASTC 8×8.
- 21 primitives means at least 21 draw calls before any outline passes.

**Assumptions** (not verified; Star Rai's target device and renderer are not established in this review):

- Outlines may add a pass per outlined material.
- An 80-joint skin may exceed some mobile GPU-skinning limits.
- Dense morph targets and per-frame spring and constraint updates have engine-dependent cost.
- Seed-san is a format sample, not a mobile-tuned model, and its settings are **not** a budget for Star Rai.

## 7. Open items and what would close them

| Item | Needed to close | Approval required? |
|---|---|---|
| Any claim in §4 or §5 on repository evidence | Commit permitted evidence (summaries, scripts, stats) to a task branch, consistent with the handoff standard | **Yes**: the pilot clause forbids committing the over-scope evidence without explicit user authorization |
| JSON-chunk integrity against the pinned source file | A byte-range comparison | **Yes**: touches the source file |
| Face-island density, anatomy mapping, mask greyscale test, end-joint semantics, hair skin joints | Analysis of descriptors now under quarantine | **Yes**: conflicts with the current quarantine instruction |
| Any Star Rai performance claim | Star Rai device budgets, then on-device measurement on non-production test copies | **Yes**, and outside this review's scope |

Until the user decides otherwise, these items remain **NOT VERIFIABLE**.

## 8. Bottom line

- **On repository evidence:** every TextureBro technical claim is **NOT VERIFIABLE**, because no Seed-san evidence has been committed.
- **On BlendBro's off-repo re-derivation:** the inventory totals hold. The material split, the hair scope and the texture-size figure are wrong. The preset accounting is incomplete. Two of the seven lessons (packed channels, expression overlays) are not demonstrated by Seed-san at all.
- **Performance:** no performance claim is measured.
- **Production:** nothing here supports production integration.
