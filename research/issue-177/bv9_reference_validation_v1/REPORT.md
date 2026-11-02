# bv9 reference accuracy validation — REPORT (read-only audit, task t125u)

Model: `/workspace/blender/star_rai/star_rai_base_body_bv9.blend`  ·  References: official issue #177 set (`/workspace/blendbro/references/issue177_official_v1/`)  ·  Date: 2026-11-01 (America/Chicago)

## 0. Verdict (read this first)

**bv9 does NOT meet the official reference requirements, and the ~1 mm outline target is NOT achieved (and cannot be claimed).** Front **FAIL**, side **FAIL**, back **FAIL**; full-body three-quarter views are missing from the official set (NOT VERIFIABLE); head close-ups have no scale link (NOT VERIFIABLE). The benchmark is incomplete.

| view | calibration | mean | p50 | p90 | p95 | p99 | max (mm) | share of outline ≤1.0 mm | IoU (z<100) | class |
|---|---|---|---|---|---|---|---|---|---|---|
| front | F best-fit | 1.32 | 0.75 | 2.94 | 5.08 | 8.82 | 13.63 | 61% | 0.842 | FAIL |
| front | L landmark | 1.38 | 0.58 | 3.70 | 4.36 | 7.14 | 11.76 | 61% | 0.820 |  |
| side | F best-fit | 1.08 | 0.50 | 2.72 | 4.97 | 8.55 | 10.18 | 72% | 0.889 | FAIL |
| side | L landmark | 1.18 | 0.54 | 2.80 | 4.71 | 9.08 | 10.73 | 67% | 0.880 |  |
| back | F best-fit | 1.13 | 0.74 | 3.24 | 4.05 | 5.32 | 6.68 | 57% | 0.852 | FAIL |
| back | L landmark | 1.59 | 1.26 | 3.59 | 4.59 | 7.77 | 9.93 | 41% | 0.803 |  |

Distances are model-mm (1 Blender unit = 1 m; the figure is 244.8 mm tall). Contour-to-contour nearest distance, both directions, primary body zone z < 100 mm (soles to just under the shoulder tops). The median outline error is 0.5–0.75 mm, so most of the outline is near 1 mm, but every view has a tail of 4.0–5.1 mm (p95) and 6.7–13.6 mm (max) that no scale/offset change in the tested range removes (see section 4.4).

Biggest discrepancies (Mode F): (1) **feet in side view** — the reference outline lies 8–10 mm beyond bv9 at the sole line (inference from the overlay and earlier bv9 notes: the reference foot is flat while the bv9 foot is pitched, "tiptoe"); (2) **arms/hands vs hips in front and back views** — bv9 arms hang away from the body leaving a gap wedge the references do not show (reference arms touch the hips), 10–18 mm in the outer silhouette; fingers/hands end 4–5 mm away from the reference at z 17–30; (3) front **knees/ankles** (−0.8…−1.6 mm per side) and back **ankles/knees/thighs** (−0.8…−1.5 mm per side) are narrower than the references in Mode F (partly camera-dependent: Mode L gives smaller front values); (4) head/hair/shoulder-top cannot be judged (section 5).

**Process disclosures (read):** (a) the method/criteria were frozen and hashed before computing (`METHOD_AND_CRITERIA_FROZEN.md`); (b) after the first full run I found a *reference-segmentation* defect (it filled the real arm–torso gaps and used an unreliable brightness test) and corrected it in a disclosed Amendment A1 (`METHOD_AMENDMENT_A1.md`); the first-run numbers are kept in `data/superseded_run1/` — classification rules and thresholds were not changed; (c) a supplementary outer-contour-only metric (S1, section 4.5) was added post hoc and does not feed the classification; (d) two early scripting bugs (a triangle-fill call using even-odd fill, a horizontal-anchor bug) were fixed before any result below was produced; (e) two small implementation departures from the frozen text: outline-offset rows are every 2.5 mm (frozen text said 5 mm), and the bump/pinch check is implemented as a high-pass (σ 6 mm) of the model-minus-reference outline offset rather than a Gaussian-smoothed (σ 4 mm) model width profile.

## 1. Scope, safety and what was (not) done
- Read-only. A COPY of bv9 (`work/bv9_copy.blend`, sha256 `d72cedc1…9689`, identical to the original) was opened with the already-installed Blender 5.2.2 in background mode to read mesh data; nothing was saved. No renders, installs, downloads, geometry/rig/weight/material changes, or new body version. Protected-file hashes before/after: see `logs/protected_before.txt`, `logs/protected_after.txt`, `logs/protected_diff.txt`.
- Not committed to the repo: the .blend, raw mesh exports (`work/*.npz`), and the official reference images (they are **not** in the public repo — checked by blob size/hash across all fetched refs). Committed overlays are contour-only (`overlays_publishable/`, no reference pixels). Local overlays with the dimmed reference as underlay are in `overlays/` (not committed).

## 2. Step 1 — reference integrity (measured)

Official set = nine files "supplied in the conversation" and copied byte-for-byte (README/manifest in the same folder). Manifest hashes, byte sizes and pixel dimensions were re-verified: **9 files, 8 unique images** (files 01 and 09 are byte-identical). All match `REFERENCE_MANIFEST.json`.

| file | view / class | px | bytes | sha256 | used for mm measurement |
|---|---|---|---|---|---|
| `01_head_front_shaded_detail.jpg` | Head/face close-up, front, shaded sculpt reference | 864×1536 | 204489 | `0be85208edd547b6796746e160f3f3172093676f536ff6001eab84ff0a32092c` | no (close-up, no scale link; or duplicate) |
| `02_full_body_front_wireframe.jpg` | Full-body front view, wireframe/topology reference | 864×1536 | 197729 | `9145d12f95ce9089289ead6e7afa25186a7b5a00a1535a4d7cb997468c82f280` | YES (front) |
| `03_full_body_side_wireframe.jpg` | Full-body side view, wireframe/topology reference | 864×1536 | 145596 | `aac1885ebb32c3573e18866bf30d1137eb4f2f4563cad146f2788a84c22de4cb` | YES (side) |
| `04_full_body_back_wireframe.jpg` | Full-body back view, wireframe/topology reference | 864×1536 | 195425 | `fb9dcf137da76a35e9a92b7a1a3fce81972be5d52956f49ad100c10980f31bfc` | YES (back) |
| `05_head_side_wireframe.jpg` | Head/face side close-up, wireframe/topology reference | 864×1536 | 203760 | `06db16bcfac7da6c11fa989d6243cfaf2514897974e7ad7f2df1877b74d121f9` | no (close-up, no scale link; or duplicate) |
| `06_head_back_wireframe.jpg` | Head/back close-up, wireframe/topology reference | 864×1536 | 229273 | `44cd23e689b5f5b51e82184e54a744b98c7b9adb6bdd23bee22f6d4895d3b43c` | no (close-up, no scale link; or duplicate) |
| `07_head_threequarter_back_wireframe.jpg` | Head/back three-quarter close-up, wireframe/topology reference | 864×1536 | 201953 | `c90eee9f1b899b12dc2c52c3c24e6c7ac305dbe255572c6b938d32f8791bffb9` | no (close-up, no scale link; or duplicate) |
| `08_head_front_wireframe.jpg` | Head/face front close-up, wireframe/topology reference | 864×1536 | 280196 | `0fb0d44b2f4b2983f3adb4eadc8d4b304dcc2ce1fd388c2de0473888cfc999ee` | no (close-up, no scale link; or duplicate) |
| `09_head_front_shaded_detail_duplicate.jpg` | Head/face close-up, front, shaded sculpt reference | 864×1536 | 204489 | `0be85208edd547b6796746e160f3f3172093676f536ff6001eab84ff0a32092c` | no (close-up, no scale link; or duplicate) |

Gaps and uncertainty (measured/recorded, not inferred):
- **Missing:** full-body three-quarter front; full-body three-quarter back (only a head/back three-quarter close-up `07` exists). Issue #177 also mentions "earlier shaded multi-view appearance images" as official appearance references — **they are not among the nine files** and I found no file I can tie to them (NOT VERIFIABLE which, if any, workspace file they are).
- **Camera/provenance:** package README says not to assume calibrated orthographic views; no camera type, focal length, scale bar, framing or crop data exists. Original uploads are named `1655.jpg`…`1669.jpg`; provenance beyond the transfer package is NOT VERIFIED. All mm values below therefore rest on stated camera assumptions.
- **Reference content differs between views:** front reference has hair (clipped by the top image edge); side and back references show a bald head. bv9 carries hair geometry in all views.
- **Not used (unverified provenance, per instruction not to substitute):** the older colour "bikini" 5-view set the earlier bv9 fit was based on, and `star-rai-canon-refs/*`. They are inventoried in `data/reference_inventory.json` (sha256, dims) but contribute to no verdict. The earlier validation (`base_body/star_rai_base_body_bv9_validation.md`) used that bikini set — it is **not** a validation against the #177 set.

## 3. Step 2 — model integrity (measured)

- File: `/workspace/blender/star_rai/star_rai_base_body_bv9.blend`, 15,663,552 bytes, sha256 `d72cedc1fbe6aaa14bebddbe052af97321816f88e8c3065a920165cbcf6d9689`. It is **byte-identical** to `star_rai_base_body_v9.blend` (same hash), i.e. one candidate, not two. Format v5.2 (opened in Blender 5.2.2 LTS).
- Object `StarRai_base_body` (parent: armature `StarRai_star_rai_locked_v10`): **30,007 verts, 61,630 edges, 31,659 faces** (28,071 quads, 3,588 tris, 0 n-gons), 123,048 loops; boundary edges 212, non-manifold edges 0, loose vertices 62; **74 connected components** (largest 22,727, 4,171, 2,276 verts; the rest are small parts and 62 loose vertices). Materials: Rai_body_toon (4,546 tris, z 119–152 mm), Rai_hair_cap_toon (9,812 tris, z 100–157), Rai_skin_base_toon (45,372 tris, z −88–122), Rai_outline. 17 shape keys, 32 vertex groups.
- Units/dimensions: scene unit METRIC, scale_length 1.0, length unit METERS. World bbox x [-35.2, 35.6] y [-16.1, 22.5] z [-88.0, 156.8] mm → **70.8 × 38.6 × 244.8 mm** (sole z = −88.0 mm). The real-world scale this represents is not stored in the file (earlier notes disagree: constants 1.6554 / 1.65 m / 239.65 mm) — **NOT VERIFIED**; all mm here are model mm.
- Axes/orientation: Z up, the figure faces +Y, its right side is +X; object transforms identity (parent armature identity); empty `RaiFaceNormalCenter` present. Rest pose: no pose bone is non-identity.
- Modifiers on the body: Armature (max displacement vs base mesh 1.5e-08 m → none at rest), NormalEdit (no positional effect), **Outline = Solidify** (thickness 0.3 mm, offset +1, flipped normals, no rim). Evaluated geometry with Outline on = 60,014 verts / 119,460 tris (a back-face shell that makes a toon render ~0.3 mm larger than the measured silhouette). **Measurements use the evaluated mesh with Outline muted in memory** (30,007 verts). The separate object `StarRai_hair_strands` (16,068 verts) is not part of the silhouette.
- v8s unchanged: `star_rai_base_body_v8s.blend` sha256 `1c5ce67f…27e9` (before and after; see `logs/protected_diff.txt`). v10 armature `f459ea1f…514f` also unchanged.

## 4. Step 3 — view-by-view silhouette comparison

### 4.1 Method (frozen; see `METHOD_AND_CRITERIA_FROZEN.md`)
- Reference silhouette: wire-texture segmentation (3×3 local std > 4 grey levels, close 5×5, hole policy per Amendment A1). Model silhouette: orthographic triangle rasterisation of the evaluated mesh at 4× reference resolution (same grid/half-pixel convention as the 4×-upsampled reference mask).
- Camera (orthographic **assumed**, NOT VERIFIED): isotropic scale s [px/mm], translation. Two calibrations per view: **Mode L** = landmark-only (sole line ↔ z=−88; scale from reference sole→bald-skull-top ÷ model sole→top of material-0 head surface for side/back, front uses the mean of side/back because its crown is clipped; horizontal anchor = lower-leg centroid) and **Mode F** = best-fit similarity (maximise IoU over z<100, ±6% scale). Mode F is the most favourable camera for the model within this camera class.
- Metric: nearest distance between the two outlines (all contours incl. enclosed gaps), both directions, in zone z < 100 mm. 1 reference px = 1/s mm ≈ 0.17 mm. Landmarks used: lowest foreground row (sole), top foreground row of the bald head (side/back), lower-leg centroid rows z −60…−30, model z_crown = max z of material 0 (151.6 mm; assumption NOT VERIFIED).

### 4.2 Cameras

| view | Mode L s (px/mm) | Mode F s (px/mm) | F−L scale | F tx, ty (px) | IoU z<100 (F) | note |
|---|---|---|---|---|---|---|
| front | 6.000 | 5.694 | -5.1% | 446.0, 1017.4 | 0.843 | L scale assumed = mean(side,back); crown clipped |
| side | 6.034 | 5.980 | -0.9% | 457.6, 964.1 | 0.889 | L from sole→skull |
| back | 5.967 | 5.737 | -3.9% | 442.8, 986.0 | 0.854 | L from sole→skull |

The best-fit scales differ between views by up to 5.0% (front 5.69, back 5.74, side 5.98 px/mm). One camera scale cannot reconcile all three views with the model: either the reference views are not mutually scale-consistent, or bv9's height-to-width proportions differ from the references, or the views are perspective — these cannot be separated with the evidence available (NOT VERIFIED). I did not average or force the views into agreement.

### 4.3 Per-view results (primary body zone z < 100 mm; Mode F first, Mode L in the summary table above)

#### FRONT — FAIL  (reference `02`; overlay: `overlays_publishable/overlay_front_modeF.png`, heat: `deviation_heat_front_modeF.png`)
- Outline distance R→M (reference points to model outline): mean 0.96, p50 0.67, p90 2.33, p95 2.80, p99 4.18, max 7.30 mm; M→R: mean 1.68, p50 0.79, p90 4.69, p95 7.45, p99 10.57, max 13.63 mm.
- Area: reference 7694 mm² vs model 6973 mm² in zone; symmetric difference 1254 mm² (IoU 0.842). Share of outline points beyond tolerance: ≤0.5 mm 38%, ≤1 mm 61%, ≤2 mm 81%.

| band (z mm) | sym mean | sym p95 | sym max | mean abs outline offset F / L (mm) | signed offset L-side / R-side (+ = model wider), F | share ≤1 mm (F) | band class |
|---|---|---|---|---|---|---|---|
| feet (-88…-75) | 0.94 | 2.38 | 2.72 | 1.95 / 1.64 | -1.55 / -1.01 | 61% | FAIL |
| ankles/shins (-75…-40) | 0.67 | 1.40 | 1.67 | 0.98 / 0.27 | -0.84 / -1.13 | 79% | NOT VERIFIABLE |
| knees (-40…-15) | 1.01 | 2.65 | 3.04 | 1.52 / 0.72 | -1.41 / -1.62 | 62% | FAIL |
| thighs (-15…25) | 0.82 | 2.75 | 5.28 | 1.55 / 0.64 | -0.32 / -0.31 | 71% | FAIL |
| hips/crotch (25…60) | 1.88 | 7.02 | 12.60 | 1.87 / 2.98 | 1.73 / 1.99 | 50% | FAIL |
| waist/ribs (60…80) | 3.15 | 9.65 | 13.63 | 0.89 / 3.53 | 0.86 / 0.63 | 28% | NOT VERIFIABLE |
| bust/arms (80…100) | 0.86 | 2.41 | 3.20 | 0.52 / 2.72 | 0.58 / -0.02 | 66% | NOT VERIFIABLE |

Worst regions (Mode F; clusters of outline points > 1 mm from the other outline, 3 mm z-bins; "model short" = reference outline lies outside bv9; "model proud" = bv9 outline lies outside the reference):
- z 20…23 mm, image-right: model proud, n=34, mean 5.03 mm, max 5.28 mm
- z 23…26 mm, image-left: model proud, n=138, mean 4.16 mm, max 5.15 mm
- z 20…23 mm, image-left: model proud, n=38, mean 4.35 mm, max 5.10 mm
- z 23…26 mm, image-right: model proud, n=138, mean 4.07 mm, max 5.09 mm
- z 26…29 mm, image-right: model proud, n=136, mean 2.90 mm, max 4.32 mm
- z 23…26 mm, image-left: model short, n=82, mean 3.58 mm, max 4.22 mm

Sensitivity of p95 (mm) — separation of camera/segmentation uncertainty from geometry mismatch (Mode F camera, one parameter varied):

| baseline | scale −2% | scale +2% | x ±1 px | y ±2 px | ref segmentation thr 3 / 6 | Mode L p95 |
|---|---|---|---|---|---|---|
| 5.08 | 5.47 | 4.84 | 5.11 / 5.03 | 4.91 / 5.24 | 6.97 / 4.89 | 4.36 |

#### SIDE — FAIL  (reference `03`; overlay: `overlays_publishable/overlay_side_modeF.png`, heat: `deviation_heat_side_modeF.png`)
- Outline distance R→M (reference points to model outline): mean 1.24, p50 0.54, p90 3.52, p95 5.42, p99 9.50, max 10.18 mm; M→R: mean 0.89, p50 0.50, p90 1.98, p95 3.56, p99 6.45, max 7.83 mm.
- Area: reference 4147 mm² vs model 3832 mm² in zone; symmetric difference 470 mm² (IoU 0.889). Share of outline points beyond tolerance: ≤0.5 mm 48%, ≤1 mm 72%, ≤2 mm 87%.

| band (z mm) | sym mean | sym p95 | sym max | mean abs outline offset F / L (mm) | signed offset L-side / R-side (+ = model wider), F | share ≤1 mm (F) | band class |
|---|---|---|---|---|---|---|---|
| feet (-88…-75) | 4.03 | 9.33 | 10.18 | 11.24 / 9.58 | -7.48 / -15.00 | 20% | FAIL |
| ankles/shins (-75…-40) | 0.68 | 1.95 | 3.18 | 0.77 / 0.73 | -0.89 / -0.66 | 86% | NOT VERIFIABLE |
| knees (-40…-15) | 0.36 | 0.92 | 1.65 | 0.33 / 0.43 | -0.58 / -0.00 | 97% | PASS |
| thighs (-15…25) | 0.30 | 0.67 | 1.25 | 0.32 / 0.35 | -0.08 / 0.18 | 100% | PASS |
| hips/crotch (25…60) | 0.61 | 1.34 | 1.51 | 0.64 / 0.80 | 0.32 / 0.91 | 76% | NOT VERIFIABLE |
| waist/ribs (60…80) | 0.89 | 1.80 | 2.01 | 0.92 / 1.11 | 0.10 / -1.60 | 50% | NOT VERIFIABLE |
| bust/arms (80…100) | 1.16 | 2.72 | 3.10 | 1.20 / 1.87 | 0.22 / -2.07 | 53% | FAIL |

Worst regions (Mode F; clusters of outline points > 1 mm from the other outline, 3 mm z-bins; "model short" = reference outline lies outside bv9; "model proud" = bv9 outline lies outside the reference):
- z -88…-85 mm, image-right: model short, n=278, mean 8.52 mm, max 10.18 mm
- z -85…-82 mm, image-right: model short, n=93, mean 9.07 mm, max 9.99 mm
- z -82…-79 mm, image-right: model short, n=81, mean 6.70 mm, max 8.01 mm
- z -88…-85 mm, image-left: model short, n=347, mean 4.22 mm, max 6.35 mm
- z -79…-76 mm, image-left: model short, n=200, mean 4.37 mm, max 5.70 mm
- z -82…-79 mm, image-left: model short, n=200, mean 5.16 mm, max 5.62 mm

Sensitivity of p95 (mm) — separation of camera/segmentation uncertainty from geometry mismatch (Mode F camera, one parameter varied):

| baseline | scale −2% | scale +2% | x ±1 px | y ±2 px | ref segmentation thr 3 / 6 | Mode L p95 |
|---|---|---|---|---|---|---|
| 4.97 | 5.13 | 4.51 | 4.98 / 4.95 | 4.91 / 4.88 | 5.09 / 4.89 | 4.71 |

#### BACK — FAIL  (reference `04`; overlay: `overlays_publishable/overlay_back_modeF.png`, heat: `deviation_heat_back_modeF.png`)
- Outline distance R→M (reference points to model outline): mean 1.05, p50 0.73, p90 2.81, p95 3.83, p99 4.53, max 5.45 mm; M→R: mean 1.20, p50 0.78, p90 3.64, p95 4.23, p99 5.75, max 6.68 mm.
- Area: reference 7803 mm² vs model 6972 mm² in zone; symmetric difference 1178 mm² (IoU 0.852). Share of outline points beyond tolerance: ≤0.5 mm 39%, ≤1 mm 57%, ≤2 mm 85%.

| band (z mm) | sym mean | sym p95 | sym max | mean abs outline offset F / L (mm) | signed offset L-side / R-side (+ = model wider), F | share ≤1 mm (F) | band class |
|---|---|---|---|---|---|---|---|
| feet (-88…-75) | 2.32 | 4.44 | 5.02 | 3.00 / 2.25 | -3.05 / -2.45 | 28% | FAIL |
| ankles/shins (-75…-40) | 0.69 | 1.28 | 2.66 | 1.06 / 0.85 | -1.20 / -0.93 | 68% | FAIL |
| knees (-40…-15) | 0.77 | 1.35 | 1.67 | 1.19 / 0.57 | -1.19 / -1.19 | 55% | FAIL |
| thighs (-15…25) | 0.88 | 3.42 | 5.45 | 1.43 / 3.35 | -1.25 / -1.51 | 64% | FAIL |
| hips/crotch (25…60) | 1.31 | 5.15 | 6.68 | 0.31 / 1.94 | 0.05 / 0.29 | 63% | NOT VERIFIABLE |
| waist/ribs (60…80) | 1.56 | 4.27 | 5.04 | 0.43 / 2.91 | -0.25 / -0.11 | 42% | NOT VERIFIABLE |
| bust/arms (80…100) | 0.68 | 1.54 | 2.35 | 0.49 / 1.42 | -0.50 / -0.43 | 65% | NOT VERIFIABLE |

Worst regions (Mode F; clusters of outline points > 1 mm from the other outline, 3 mm z-bins; "model short" = reference outline lies outside bv9; "model proud" = bv9 outline lies outside the reference):
- z 17…20 mm, image-right: model short, n=200, mean 3.21 mm, max 5.45 mm
- z 17…20 mm, image-left: model short, n=215, mean 3.36 mm, max 5.37 mm
- z -79…-76 mm, image-left: model short, n=154, mean 4.24 mm, max 5.02 mm
- z -82…-79 mm, image-left: model short, n=145, mean 3.18 mm, max 4.62 mm
- z -88…-85 mm, image-left: model proud, n=252, mean 3.77 mm, max 4.59 mm
- z 71…74 mm, image-right: model short, n=179, mean 2.68 mm, max 4.57 mm

Sensitivity of p95 (mm) — separation of camera/segmentation uncertainty from geometry mismatch (Mode F camera, one parameter varied):

| baseline | scale −2% | scale +2% | x ±1 px | y ±2 px | ref segmentation thr 3 / 6 | Mode L p95 |
|---|---|---|---|---|---|---|
| 4.05 | 4.08 | 3.99 | 4.01 / 4.04 | 3.94 / 4.18 | 4.24 / 3.99 | 4.59 |

Note on the band tables: "mean abs outline offset" uses the outermost left/right extents of each 2.5 mm row, so rows where the hands/fingers are the outermost feature (front/back z ≈ 15–25) inflate the thighs band (front thighs signed means are only −0.3 mm). The signed means and the contour-distance columns are given alongside for that reason. The band class is the frozen rule applied literally.

### 4.4 Geometry mismatch vs camera/projection uncertainty (the separation requested)
- **Measured:** within the tested uncertainty (scale ±2%, shifts ±1–2 px ≈ ±0.2–0.35 mm, segmentation threshold 3…6) p95 moves by at most ~0.5 mm (front thr-3 segmentation: +1.9 mm, because the arm–torso gap pocket detection changes); it stays 4–5 mm. Mode L and Mode F give similar tails (4.4–4.7 vs 4.1–5.1 mm). The p95 failure therefore does not come from scale/offset error of an orthographic camera, nor from the ±1 px (±0.17 mm) edge uncertainty.
- **Inference (not measured):** the dominant tails are geometry/pose differences at the arms/hands/hips (front, back) and the feet (side, back): they are localised, large (5–18 mm), consistent between overlays, and absent from the leg shafts where agreement is ~0.3–1.0 mm (mean outline distance).
- **NOT VERIFIED:** perspective/lens effects, view-to-view reference inconsistency, and reference distortion cannot be excluded; they would act as an additional, unquantified uncertainty on every number here. The sub-mm figures (e.g. side thighs mean 0.30 mm) are also bounded below by the reference edge uncertainty (±1 px ≈ ±0.17 mm) and segmentation threshold dependence.

### 4.5 Supplement S1 (post hoc, disclosed): outer contour only
Enclosed gaps (arm–torso pockets) were also filled in both masks, so only the visible external outline is compared. It does not feed the classification.

| view | calibration | mean | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| front | modeF outer | 2.10 | 0.75 | 9.75 | 16.86 | 18.11 |
| front | modeL outer | 1.89 | 0.58 | 7.60 | 13.92 | 14.94 |
| side | modeF outer | 1.08 | 0.50 | 4.97 | 8.55 | 10.18 |
| side | modeL outer | 1.18 | 0.54 | 4.71 | 9.08 | 10.73 |
| back | modeF outer | 2.31 | 0.87 | 10.76 | 17.56 | 18.81 |
| back | modeL outer | 2.53 | 1.38 | 10.24 | 14.73 | 17.47 |

Front/back worsen (p95 ≈ 10 mm, max 18–19 mm) because the model has an open slit between arm and hip where the references show the arm touching the hip. Side is unchanged (arms overlap the torso in profile).

### 4.6 Informational: head/hair/shoulder-top zone (z ≥ 100 mm) — NOT used for classification
| view | mean | p50 | p95 | max (mm) |
|---|---|---|---|---|
| front | 7.80 | 6.53 | 19.34 | 21.94 |
| side | 2.62 | 2.37 | 5.89 | 7.19 |
| back | 4.24 | 4.01 | 9.43 | 11.20 |
Model has hair geometry; side/back references are bald; the front reference is clipped at the top edge. No valid like-for-like comparison exists.

## 5. Step 4 — geometry and surface review

Measured on bv9 only unless stated. These checks have no pass/fail threshold supplied by the references, so the class is NOT VERIFIABLE unless stated.
- **Surface smoothness** (dihedral angle across 63,684 skin-material edges, z<100): p50 2.4°, p95 26.6°, p99 49.6°, max 177°; 2,779 edges > 30°, 1,229 > 45°, 478 > 60°. Counts by 10-mm z-bin of edges > 30°: {'-90': 515, '-80': 18, '-70': 6, '20': 1168, '30': 843, '40': 22, '50': 28, '60': 9, '80': 74, '90': 96}. The clusters at z ≈ 20…36 mm, x ≈ ±33 mm are the **hands/fingers** (slice loops at z 25–33 show four small loops per side at x ≈ ±34: `data/slice_loops_diag_z21_41.json`) and z ≈ −90…−70 are the **toes/foot**; creases there are expected anatomy (inference from the slice diagnostic). No bump/crease audit against the reference surfaces is possible from silhouettes.
- **Cross-section consistency** (skin slices every 2 mm, z −87…99): loop count 2 (legs) up to z≈21, 6–12 at z 23–35 (hands/fingers beside the hips), 3 at z 37–89, 1 at z 91–97, and 8 at z=99 (head/hair surface, 5 loops not closed by the walker). The loop-count changes are explained by legs/crotch/fingers; no unexplained extra shells in the trunk. Area second-difference extremes (> 4 robust σ) at z = [-83.0, -81.0, -75.0, 27.0, 43.0, 45.0, 47.0, 51.0, 53.0, 81.0, 85.0, 87.0, 93.0]. The cluster at **z 43–47 (negative) and z 53 (positive)** matches the "hip shelf then waist pinch" described in the earlier bv9 validation; this audit could not confirm it against the references there (front/back references have the arms occluding the torso side; side-view outline offset at hips/crotch is 0.6 mm mean). Class: **NOT VERIFIABLE** against references.
- **Silhouette continuity** (kinks > 25° within 1 mm arc on the model outer outline, z<100): front 11, side 1, back 11 clusters; they are at the fingers (z ≈ 23–36), the toe/sole (z ≈ −88) and the shoulder/armpit junction (z ≈ 90–91) — the model outline is otherwise continuous (leg shafts and torso have none).
- **Bumps/pinching vs reference** (outline offset high-pass σ=6 mm, |Δ|>1 mm): front at z 15–25 (hand/finger zone, offsets up to +10 mm) and z 30–37; side at the foot (z −85…−70, −9…−21 mm) only; back at z −82…−77 and z 20. No bump/pinch candidates along the leg shafts, torso or thighs in the side view. Candidates are listed in `data/geometry_review.json` (`bump_pinch_candidates_modelminusref_highpass_gt1mm`).
- **Asymmetry:** bv9 mirror deviation (x→−x, nearest skin vertex): mean 0.40 mm, p95 1.18 mm, max 3.04 mm; the **knees band is the largest** (mean 1.52 mm, max 3.04 mm), other bands ≤ 0.55 mm mean. Outline half-width L−R about the Mode-F axis: bv9 ≤ 0.5 mm in every band; **the references themselves are asymmetric by up to 1.23 mm** (hips band, front ref mean +0.7 mm), so a mirror-symmetric model cannot match both sides of the references within 1 mm everywhere. Reference asymmetry is a floor on the achievable agreement (measured; the cause — drawing vs pose — is NOT VERIFIED).
- **Reference cross-view consistency (reference-only; assumes the same px/mm in front and back — NOT VERIFIED):** figure heights sole→top: front ≥1521 px (clipped), side 1446 px, back 1430 px. Back/front outer width ratios at equal height above the sole range 0.92–1.08 on the legs and torso (e.g. 0.92 at 420 px, 1.08 at 240 px, 1.05 at 300 px) and 1.2–1.4 at the hips/arms (arms attach differently), so the reference views are not mutually consistent at the mm level. Not averaged.
- **Hidden / non-establishable geometry (NOT VERIFIABLE):** depth profile of the torso/bust/arms between views (only three axis-aligned views, no 3/4 body views), inner thigh gap and crotch, armpits, under-bikini surface (references show a bikini; bv9 body is bare skin), sole/underfoot, back of the head under hair vs bald refs, anything above z=100 mm. No geometry was inferred or invented for these.

## 6. Step 5 — findings (classified)

| id | finding | class | evidence |
|---|---|---|---|
| R1 | All nine #177 reference files exist and match manifest hashes/sizes/dims (8 unique) | PASS | `data/reference_inventory.json` |
| R2 | Full-body front, side, back available | PASS | refs 02, 03, 04 |
| R3 | Full-body three-quarter (front and back) views | NOT VERIFIABLE (missing from official set) | section 2 |
| R4 | Camera type/scale/framing of the references | NOT VERIFIABLE (no data; orthographic assumed) | section 2/4.1 |
| R5 | Head close-ups (01,05,06,07,08,09) vs model | NOT VERIFIABLE (no scale link to the body views, hair/bald mismatch) | section 2 |
| M1 | bv9 identity, counts, dimensions, axes, modifiers recorded; single candidate (bv9 ≡ v9) | PASS (measured) | section 3 |
| M2 | v8s, v10 armature, other protected files unchanged by this audit | PASS (hash before/after) | `logs/protected_diff.txt` |
| V-front | front silhouette, z<100: p95 5.08 mm, mean 1.32 mm (Mode F); Mode L p95 4.36 mm | FAIL | section 4.3, `overlays_publishable/overlay_front_modeF.png` |
| V-side | side silhouette, z<100: p95 4.97 mm, mean 1.08 mm (Mode F); Mode L p95 4.71 mm | FAIL | section 4.3, `overlays_publishable/overlay_side_modeF.png` |
| V-back | back silhouette, z<100: p95 4.05 mm, mean 1.13 mm (Mode F); Mode L p95 4.59 mm | FAIL | section 4.3, `overlays_publishable/overlay_back_modeF.png` |
| V-1mm | "~1 mm outline agreement" target | FAIL — not achieved in any view; 57–72% of outline points ≤1 mm (Mode F), tails 4.0–5.1 mm (p95) | section 4.3 |
| V-3q | three-quarter silhouette comparison | NOT VERIFIABLE (no reference) | section 2 |
| B-side-leg | side view knees and thighs (z −40…25): mean abs offset 0.33 / 0.32 mm (F), 0.43 / 0.35 (L); sym p95 0.92 / 0.67 mm | PASS (band rule; still bounded by ±0.17 mm edge uncertainty and assumed camera) | section 4.3 |
| B-feet | feet: side p95 9.3 mm (model foot pitched/short vs flat reference foot), back 4.4 mm, front 2.4 mm | FAIL | section 4.3 |
| B-arms | arms/hands vs hips (front/back outline gap wedge; hands 4–5 mm off at z 17–30; outer silhouette max 18–19 mm) | FAIL | sections 4.3, 4.5 |
| B-legs-fb | front knees/ankles (−0.8…−1.6 mm per side) and back ankles/knees/thighs (−0.8…−1.5 mm per side) narrower than the references in Mode F (band mean abs offset 1.0–1.5 mm; 0.3–0.7 mm in Mode L for front knees/thighs/ankles, so partly camera-dependent) | FAIL (Mode F) / camera-dependent | section 4.3 |
| B-torso | waist/ribs, bust/arms bands | FAIL (side bust/arms), NOT VERIFIABLE elsewhere (arm occlusion, bikini, hair) | section 4.3 |
| G-smooth | surface smoothness / creases | NOT VERIFIABLE vs references (measured values in section 5; creases located at fingers/toes) | section 5 |
| G-xsec | cross-section consistency | PASS for internal consistency (loop counts explained); hip-shelf/pinch signature at z 43–53 NOT VERIFIABLE vs references | section 5 |
| G-sym | asymmetry | bv9 mirror deviation mean 0.40 mm (knees larger, 1.5 mm mean) — NOT VERIFIABLE vs the (themselves asymmetric, ≤1.2 mm) references | section 5 |
| G-head | head/hair/shoulder-top zone z ≥ 100 | NOT VERIFIABLE | section 4.6 |
| G-hidden | hidden geometry (depth, under-bikini, crotch, armpits, soles) | NOT VERIFIABLE | section 5 |

## 7. Measured / inferred / NOT VERIFIED (kept separate)
**Measured:** reference and model hashes, dims and counts; silhouette distance statistics for the stated camera assumptions; sensitivity of those statistics; band tables; slice loop counts; dihedral statistics; mirror deviation; reference L/R asymmetry; reference cross-view width ratios.
**Inferred (labelled where used):** that the large tails are arm/hand/hip pose and foot-shape differences (from overlays and band positions); that crease clusters are fingers/toes (from slice-loop diagnostic); that the front-vs-side-vs-back scale spread points to reference inconsistency and/or proportion mismatch.
**NOT VERIFIED:** orthographic assumption; the real-world scale of the model; z_crown = top of material-0 (used only in Mode L); that "official" views are metrically consistent; missing 3/4 views and "earlier shaded" appearance set; anything under hair/bikini; perspective effects.

## 8. Ranked correction proposals (PROPOSALS ONLY — nothing implemented; each needs TyLo's explicit approval and must change one variable at a time)
1. **Arm/hand placement vs hips (front/back, largest area error, 10–18 mm outer-silhouette tail):** compare arm abduction/hand position against the references; the references show the arms touching the hips. Highest visual impact. Note arm/shoulder rig interplay (v10 armature is locked).
2. **Feet (side p95 9 mm, 8–10 mm model-short at the sole line; back 4–5 mm):** foot pitch/sole flatness and toe length vs the references. Previously noted as blocked by the locked v10 foot bones — needs a TyLo decision before any work.
3. **Obtain calibration/references before any mm claim:** supply the missing full-body three-quarter views, a statement of camera type/scale (or orthographic turnaround with scale bar), and confirmation of which "earlier shaded" images are official. Without this, even a perfect model cannot be shown to reach 1 mm.
4. **Front knee/ankle and back ankle/knee/thigh width (≈0.8–1.6 mm per side narrower in Mode F):** may be partly camera-dependent (Mode L shows 0.3–0.7 mm for front knees/thighs); re-measure after item 3 before changing anything.
5. **Hip shelf / waist pinch (z 43–53 area-profile signature):** re-check once arm-free reference evidence exists; not confirmed here.
6. **Head/hair:** define the head reference to compare (bald vs hair); until then the head zone is not assessable.

## 9. Relation to the earlier bv9 validation
`base_body/star_rai_base_body_bv9_validation.md` (earlier session) measured v8→bv9 against the colour "bikini" set with different masks and masked-out regions (it reports bv9 mean outline error of 0.46 mm front and 0.63 mm side). Those numbers are **not comparable** with this audit (different reference set, different segmentation, ~44–50% of edges masked, camera fitted by body-mesh matching). Qualitatively both identify the arm/hip region and the feet as the main problems.

## 10. Reproduction
Environment: Debian, Python 3.13.5, numpy 2.5.4, scipy 1.18.1, OpenCV 5.0.0, Pillow; Blender 5.2.2 LTS (headless, read-only, copy of bv9). Order: `s01_reference_inventory.py` → (Blender) `s02_inspect_bv9.py`, `s03_export_geometry.py` → `s05_measure.py` → `s06_geometry_review.py` → `s09_loop_diag.py` → `s10_fractions.py` → `s07_overlays.py` → `s11_build_report.py`. `refseg.py` is the reference segmentation (Amendment A1 version). Reference images are required inputs but are NOT in the repo (paths and sha256 in `data/reference_inventory.json`); the exported geometry (`work/bv9_geom.npz`) is likewise not committed. Scripts contain absolute paths of the local box.
