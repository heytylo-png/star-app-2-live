# MPFB2 complementary mesh analysis (read-only) — Issue #179

Author: BlendBro. Status: **research record only. No production approval, no geometry transfer, no Star Rai asset touched.**
Source: MakeHuman/MPFB2 `v2.0.18`, commit `6ff1eb358f6c1959ced77e79e6dd2406d9a71f49`. Only the 10 approved files (CC0 per their headers/LICENSE; see `/MANIFEST_sha256_blobsha1.txt` held by CAD Bro) were read. Tools: Python 3.13 stdlib + numpy 2.5.4. No Blender, installs, downloads or file modifications.

Evidence labels: **MEASURED** = computed directly from the 10 files by the scripts here. **INFERRED** = reasoned from MEASURED data. **NOT VERIFIED** = cannot be established from the approved files.

## 0. Method freeze and deviations
- `METHOD_FROZEN.md` (sha256 `5643ba0cfb3b6dcf9551348811f38c9bbd67b747453fdea67d3e75868e989ed2`) was written **before** any computation (only format peeks: OBJ header, JSON key/strategy tallies, line counts).
- Main run = `mpfb2_analysis.py` (implements M1–M6 exactly as frozen).
- **Post-freeze additions** (motivated by what the main run showed; NOT in the frozen method; labelled): `mpfb2_supplement.py` (body-only weight stats, rigify mask-bone sums, residual distribution, "lowest point" identity) and `extra_check.py` (MEAN arity, rigify `extra_bones`, frame-offset of exact-VERTEX joints). `_common.py` is a shared loader extracted from the main script.
- After first run the scripts were edited **only** to drop raw coordinates from outputs (so no derived geometry is committed) and to fix CSV empty-cell quoting; results were regenerated and are the ones reported here.
- Input integrity: sha256 of all 10 files taken before and after: **identical** (`hashes_before.txt` == `hashes_after.txt`; both equal the hashes in the CAD Bro manifest). CAD Bro's `analysis/` folder was read only (it appeared at 21:35 CDT while I worked); I wrote nothing there.

## 1. base.obj counts — MEASURED
| item | value |
|---|---|
| `v` | **19,158** |
| `vt` | **21,334** |
| `vn` | 0 (no normals stored); `s off` ×1; no `usemtl`/`mtllib`/`o` |
| `f` | **18,486**, **all quads** (tris 0, ngons 0) |
| `g` lines | 172 segments → 139 distinct names (body 1, `helper-*` 13, `joint-*` 125). Repeated: `helper-tights`×2, `helper-{l,r}-eyelashes-{1,2}`×9 each |
| faces with UV | 18,486 / 18,486; UV range [0.0092, 0.9935]×[0.0096, 0.9922]; 0 outside 0–1 |
| unreferenced vertices | 0 |

Group vertex sets (an OBJ group owns faces; vertex set = vertices those faces reference; **no vertex is shared between any two groups**):
- `body`: 13,380 verts, 13,378 faces, indices **0–13,379 exactly**.
- helpers (verts): tongue 226 (13,380–13,605), l-eye 72, r-eye 72, lower-teeth 68, upper-teeth 68, l-eyelashes-2 65, l-eyelashes-1 60, r-eyelashes-2 65, r-eyelashes-1 60, genital 200, tights 2,674 (15,328–18,001), skirt 720, hair 428 (18,722–19,149).
- 125 `joint-*` groups × 8 verts × 6 faces = **1,000 verts**, indices 13,606–19,157, interleaved with helper index ranges (not one contiguous block). All are quad boxes ("cubes").
- 13,380 + 5,778 helper/joint verts = 19,158 ✔ (CSV: `joint_groups.csv`).

## 2. Vertex-index correspondence with weight files — MEASURED
Weights format: `{"weights": {bone: [[vertex_index, weight], …]}}`, indices are **base.obj 0-based vertex indices**.

| file | bones | entries | idx min–max | out-of-range | dup (bone,idx) | verts weighted | unweighted | weight-sum min/max/mean |
|---|---|---|---|---|---|---|---|---|
| default | 163 (24 with empty lists) | 58,388 | 0–19,157 | 0 | 0 | **19,158** | 0 | 0.9998 / 1.0000 / 1.0000 |
| game_engine | 53 (`Root` empty) | 36,416 | 0–19,157 | 0 | 0 | **19,158** | 0 | 0.9999 / 1.0000 / 1.0000 |
| rigify human_toes | 209 | 69,658 | 0–19,149 | 0 | 0 | 19,142 | **16** | 0.999 / **2.85** / 1.1955 |

- **The weights cover the whole base.obj index space, including helper and proxy geometry** (all 13 helper groups + all joint cubes: 13,380 body + 5,778 helper/joint vertices weighted in default and game_engine). Max index = 19,157 = nv−1, so weight files and base.obj have the same vertex count/order; no out-of-range, no index beyond the OBJ.
- Rigify file: the 16 unweighted vertices are exactly the two cubes `joint-ground` and `joint-pelvis`. Sums above 1 (4,317 verts, max 2.85) are caused by two pseudo-bones `mhmask-no-smooth`, `mhmask-preserve-volume`; **excluding them every sum is 0.999–1.0001** (n=19,142). 12 weight-bone names are not in rig `bones`: 10 are listed in the rig's `extra_bones`, 2 are the mask pseudo-bones. 16 rig bones have no weights (glue/master/heel helpers).
- Bone-name sets: default weights = default rig bones (163/163 identical); game weights = game rig (53/53).
- default weights: 24 facial muscle-style bones (e.g. `levator02.L`, `oris06`, `special01`) have empty lists.
- Body-only influence counts (post-freeze, `supplement_results.json`): default max 8 mean 3.058; game max 6 mean 1.848; rigify max 11 mean 3.784. Game_engine: 18,177 / 19,158 verts (94.9%) have ≤4 influences (histogram: 1:9,369 2:5,586 3:1,941 4:1,281 5:962 6:15 7:4).
- Note: counts use "entries per vertex". No entries have weight 0, so ">0" and "all entries" agree; with a 1e-3 threshold means drop to 2.97 (default) / 1.86 (game).

## 3. Topology / structure — MEASURED
- **Body (13,380 V, 26,756 E, 13,378 F)**: one connected component; **0 boundary edges, 0 non-manifold edges, consistent winding**; Euler characteristic V−E+F = **2** (closed, genus-0 shell). All quads. Valence: **4 → 13,060 (97.6%)**, 3 → 164, 5 → 156, none ≥6 (320 poles; Σ(4−valence)=164−156=8=4χ ✔).
- **Whole mesh**: 154 components = body 1 + 28 helper components (hair strips are 16 separate pieces) + 125 cubes. 784 boundary edges (all on helper pieces), 0 non-manifold. Valences: 2→92, 3→1,908, 4→16,970, 5→188.
- Helper boundary/closure (`results.json` → `M3.per_group`): tongue and both eye-helpers are closed; tights/skirt/genital/teeth/eyelashes/hair are open shells.
- **UV**: body has 14,517 unique (v,vt) pairs for 13,380 vertices ⇒ 1,137 seam splits. Whole mesh 21,833 pairs vs 21,334 `vt` lines ⇒ some `vt` entries are shared by more than one vertex (cause not analysed). No UV outside 0–1.
- **X-mirror symmetry (body, 13,380 verts)**: every vertex has an exact mirror (x→−x) partner: residual max 0.0 within the OBJ's 4-decimal precision (all within 1e-4); 188 centre-line vertices (|x|≤1e-4) pair with themselves; the nearest-partner map is a perfect involution (13,380 unique targets). The 55 `joint-l-*` / 55 `joint-r-*` cubes mirror exactly (centroid residual 0). INFERRED: body and cubes are authored as mirrored pairs; whether per-index mirror tables exist in the repo is NOT VERIFIED (not among files).
- Extent (OBJ units): body x ±4.9627, y −8.1676…8.4913, z −1.0154…3.2147.

## 4. How the joint groups relate to the mesh — MEASURED
- Rig head/tail specs: `CUBE` (`cube_name` = an OBJ group), `VERTEX` (`vertex_index`), `MEAN` (`vertex_indices`, always **2** indices in default/game; rigify has some 12-index tails), `XYZ` (rigify only: 2 heads, 2 tails).
- **A CUBE joint = mean of an OBJ `joint-*` group, which is a separate 8-vertex helper cube sharing no vertex with the body** (shared_with_body = 0 for all 125). Every `cube_name` in all 4 rigs exists in the OBJ; all 125 cubes are used by at least one rig.
- VERTEX joints in the default rig: all 37 VERTEX heads point at body vertices. Counting every vertex reference of VERTEX/MEAN heads and tails in the default rig by OBJ group: body 110, `helper-tights` 10, `helper-hair` 2, `helper-tongue` 14 (max index 18,889). MEAN heads: 4 body-only, 5 body+tights, 1 body+hair, 3 tongue-only.
- game_engine: all 53 heads and 52 tails are CUBE; only `Root` tail is MEAN of 19152/19155 = two `joint-ground` cube vertices.
- INFERRED: joint cubes are intended to be carried through the same shape changes as the body (otherwise rig-from-mesh would not make sense), but **no morph/target data is in the 10 files — NOT VERIFIED**.

## 5. Lessons for Star Rai — PROPOSALS ONLY (not observations)
1. Keep a published topology benchmark: closed quad-only body, 97.6% valence-4, 320 poles, 0 boundary. Use as a checklist to *measure* v8.3/v10 body topology; do not transfer geometry.
2. Append non-body parts (clothes proxies, teeth, joints) **after** the body index range and keep indices stable, so one weights file remains valid (MPFB2 weights address all 19,158 indices). Verify the same for Star Rai before any retarget.
3. Define joint locators as named helper groups (8-vertex boxes) rather than raw coordinates, *only if* they deform with the mesh — the deformation link is NOT VERIFIED here.
4. Check Star Rai's body for exact X symmetry before mirroring weights; MPFB2's body is exactly symmetric, which is what makes simple mirroring possible.
5. Strip pseudo-bones (`mhmask-*`) before normalisation checks; without that the rigify sums exceed 1.
6. The game rig needs ≤4 influences for 94.9% of vertices (19 verts have 6–7); MPFB2 default rig goes up to 8. Whether any Star Rai engine limit applies, and any performance effect, is **not measured**.
7. Foot: in raw base.obj the left sole is almost flat (see §6 row 7) while the foot bones are pitched ≈27°; a pitched bone therefore does not require a sloped sole (INFERRED; for the v8s sole discussion only; no correction proposed).

## 6. CAD Bro claim check
Rig-frame numbers use `default_position` stored in the rig JSON; "OBJ-recon" = recomputed from base.obj with rig=(x,−z,y)/10.

| # | CAD Bro claim | Verdict | Numbers |
|---|---|---|---|
| 1 | 19,158 weighted verts | **CONFIRMED** (with caveat) | default 19,158; game 19,158; rigify 19,142. 19,158 = *every* vertex incl. 5,778 helper/joint-cube verts; body-only = 13,380 |
| 2 | default 163 bones / game 53 | **CONFIRMED** | rig 163 / 53; weights 163 / 53 (identical name sets) |
| 3a | max influences 8 / 7 | **CONFIRMED** (all 19,158 verts) | 8 / 7; body-only 8 / 6 |
| 3b | mean 3.05 / 1.90 | **CONFIRMED** (all verts, entries/vertex) | 3.0477 / 1.9008; body-only 3.058 / 1.848; threshold >1e-3: 2.97 / 1.86 |
| 4 | joint heads 113 group-mean / 37 vertex / 13 two-vertex mean | **CONFIRMED** counts; wording differs | default heads CUBE 113, VERTEX 37, MEAN 13 (tails 103/47/13). "Group" = a separate 8-vertex helper cube, not a group of body vertices; MEAN arity 2 ✔ (some include tights/hair/tongue verts) |
| 5a | foot bone pitched 27.2° down, 0.066 m | **CONFIRMED vs rig JSON; differs ≈2° vs raw OBJ** | default `foot.L` 27.233°, 0.06575 m; game `foot_l` 27.233°, 0.1315 m (CAD: 0.132 ✔). OBJ-recon: default foot.L 25.2°, 0.0705 m; game foot_l 28.2°, 0.138 m |
| 5b | `ball_l` ≈ +2.7° | **CONFIRMED in magnitude; sign convention unstated; differs vs OBJ-recon** | rig: tail 0.0031 m *above* head (2.66° upward; −2.659° in my down-positive convention); OBJ-recon: 7.9° upward |
| 6a | ankle z −0.749 | **CONFIRMED** | rig −0.74861; OBJ-recon −0.74479 |
| 6b | ball z −0.809 | **CONFIRMED** | rig −0.80879; OBJ-recon −0.81015; ankle−ball 6.02 cm |
| 7 | ankle ≈9.6 cm above sole ("lowest point of the mesh") | **DIFFERS (number reproduced, reference point is not the sole)** | 9.63 cm = rig ankle z − min z of *all* vertices (−0.84488), and that lowest vertex is **idx 19150 in helper cube `joint-ground`** (cube centroid z −0.8183, so 2.7 cm below the cube centre). Against the lowest **body** vertex (−0.81676, idx 5796): **6.81 cm** (rig ankle) / 7.20 cm (OBJ frame). Lowest `helper-tights` z −0.8221 → ≈7.35 cm. Sole slope: lowest z per 12 y-bins of 1,068 left-foot verts, fit **0.36°** (all bins) / **0.71°** (central bins); Δz across the sole 0.8 cm over 21.1 cm length ⇒ approximately flat |
| 8 | OBJ Y-up dm → Z-up m | **CONFIRMED as axis map; exact position match NOT achieved** | best of 24 positive-scale axis maps = (x,−z,y) with scale 0.1006 (robust refit 0.1027); next-best map RMSE 0.193 m vs 0.055 m. Body height 1.666 m under ÷10. But residuals vs rig `default_position` are **not mm-level**: median 3.8 cm, p90 5.9 cm; by strategy median: VERTEX 0.96 cm, MEAN 2.1–2.6 cm, CUBE 4.2–4.6 cm (heads/tails); `Root` head default (0,0,0) vs `joint-ground` cube (0,0,−0.8183). Signed offset of exact-VERTEX joints (default rig): median (0, +6.0 mm, +6.9 mm). Rigify rig frame is shifted ≈ +0.8237 m in z (ground at z=0) |

Extra cross-check: CAD Bro's `analysis/outputs` reproduce my numbers where compared (strategy counts, body 0–13,379, 125 cubes/1,000 verts/0 shared, rigify z-offset 0.8237, default VERTEX offset 0.0060/0.0069). CAD foot-vertex count differs (1,103 vs my 1,068) because selections differ; not an error.

Claim "rig follows the body when the body changes shape" (CAD Bro): **NOT VERIFIED** here — requires the shape targets (not in the 10 files); MEASURED part is only that joints are derived from the mesh (cubes/vertices) rather than stored as fixed coordinates in the rig *spec*.
Residual source: the recomputed positions miss `default_position` by centimetres. INFERRED (not verified) that `default_position` was saved from the shaped default human, not the raw base.obj; this cannot be tested without Blender/targets.

## 7. Limitations
- No Blender / targets / modifiers: shape-dependent claims (deformation quality, joint-follows-body, skinning quality, pose results) are **NOT VERIFIED**.
- Weight statistics describe file structure only; no skinning test was run.
- Coordinates in base.obj have 4 decimals; symmetry "0.0" means identical at that precision.
- OBJ→rig mapping tested only on joints in default/game rigs (432 points); mapping was selected by fit, not documented in the files.
- Sole-flatness: computed from vertices (not surface), left foot selected by dominant game-engine weight (foot_l/ball_l), 12 bins — a coarse measure; raw base.obj is not the shaped default human.
- Edge-based valence/pole stats exclude vn/UV splits. Component counts are face-connectivity based.
- Comparison with Star Rai assets was not performed (no access to production files was used).
- No performance claim is made anywhere.

## 8. File list (see `MANIFEST_sha256.txt`)
`REPORT.md`, `METHOD_FROZEN.md`, `METHOD_FROZEN.sha256`, `mpfb2_analysis.py`, `mpfb2_supplement.py`, `extra_check.py`, `_common.py`, `run_all.sh`, `results.json`, `supplement_results.json`, `extra_check_results.json`, `bone_vertex_counts.csv` (counts only), `joint_groups.csv` (indices only), `joint_specs.csv` (strategy/indices only, no coordinates), `hashes_before.txt`, `hashes_after.txt`.
Not committed: any MPFB2 asset file, vertex/joint coordinate tables, derived geometry.
