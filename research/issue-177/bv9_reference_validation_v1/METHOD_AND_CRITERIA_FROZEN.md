# bv9 reference validation — FROZEN method and criteria (written before any model-vs-reference deviation was computed)

Task: t125u, READ-ONLY audit of `star_rai_base_body_bv9.blend` against the official Star Rai reference set (GitHub issue #177).
Frozen: 2026-11-01 (America/Chicago). This file is hashed (see `logs/frozen_criteria_sha256.txt`) before `s05`/`s06` are run.
What had been looked at before freezing (not model-vs-reference deviation): inventory/hash of files, bv9 mesh statistics, reference segmentation
(masks only), a model-only silhouette sanity picture (orientation check), reference-only extents.

## 1. Reference set used (only these; no substitution)
Official set = the nine files of `/workspace/blendbro/references/issue177_official_v1/issue177_reference_images/` (hashes verified against `REFERENCE_MANIFEST.json`).
Quantitative full-body views: `02_full_body_front_wireframe.jpg`, `03_full_body_side_wireframe.jpg`, `04_full_body_back_wireframe.jpg` (864x1536).
Head close-ups `01/05/06/07/08/09` are inventoried; they have no scale link to the full-body views -> NOT VERIFIABLE for mm outline measurement.
The older colour "bikini" set (`/workspace/blender/star_rai/reference/bikini/*`, used to fit bv9) and `star-rai-canon-refs/*` are NOT used for any verdict (provenance vs #177 unverified).
Missing for the full set: full-body three-quarter front, three-quarter back (only a head close-up exists).

## 2. Model under test
`/workspace/blender/star_rai/star_rai_base_body_bv9.blend` (a COPY is opened headless in Blender 5.2.2; never saved). Object `StarRai_base_body`.
Evaluated geometry for silhouettes = armature modifier at current pose (verified identity/rest) with the `Outline` solidify modifier (toon back-face shell, 0.3 mm) muted in memory, `FaceNormals` has no positional effect.
The hair strands object `StarRai_hair_strands` is NOT included (the body mesh already contains the hair-cap / hair geometry).
Units: Blender units are metres; the figure is ~244.8 mm tall in model units. **All mm in this audit are model mm** (1 BU = 1 m).

## 3. Camera model (assumptions, all NOT VERIFIED against any camera data)
Orthographic, vertical axis = model Z. Image u: front `u=-X`, back `u=+X`, side `u=-Y` (faces image-left like the reference); image v = -Z. Px->mm uses a single isotropic scale s [px/mm] per view.
Two calibrations are reported for every view:
- **Mode L (landmark-only, no model-silhouette fitting):** sole line = lowest foreground row of the reference mask <-> model z = -88.0 mm (floor). Scale: side and back use reference sole->top-of-bald-skull (mask top row) divided by model sole->z_crown, with z_crown = max z of model material 0 (`Rai_body_toon`, assumed to be the scalp/face skin; assumption NOT VERIFIED). Front reference is clipped at the image top (hair/ahoge) so it has no crown landmark: front uses the mean of the side and back scales (assumes one common camera setup; NOT VERIFIED). Horizontal anchor = x-centroid of the mask rows covering model z in [-60,-30] mm (lower legs) in ref and model.
- **Mode F (best-fit similarity):** (s, tx, ty) maximise IoU of model vs reference masks over the primary body zone (below), Nelder-Mead from Mode L, s bounded to +-6% of Mode L. Mode F is the most favourable camera for the model within a similarity (ortho) camera class, so a deviation that remains under Mode F cannot be explained by scale/offset error.

## 4. Reference silhouette extraction (frozen parameters)
Background = quadratic surface fitted to image margins; foreground = (local std 3x3 > 4.0 grey levels) OR (|3x3 mean - background| > 10); 5x5 elliptical close; fill enclosed holes; keep the largest component plus any component > 2000 px.
Segmentation uncertainty is measured by repeating with texture thresholds 3.0 and 6.0 (sensitivity table). 1 reference pixel = 1/s mm (~0.17 mm).
Model silhouette: orthographic triangle rasterisation at 4x reference resolution. Reference mask is upsampled 4x (nearest) so both share the same grid and half-pixel convention.

## 5. Measurement
Zones (model z): **primary body zone** = z < 100 mm (soles to just below shoulder tops). **Head/hair/shoulder-top zone** z >= 100 mm is reported as informational only and is NOT VERIFIABLE for a PASS/FAIL (model carries hair geometry on all views; reference side and back are bald; front reference hair is clipped at image top).
Contour = all boundary pixels of the mask (outer and inner contours) inside the zone.
Deviation d = nearest-neighbour distance between the two contours (Euclidean distance transform), in mm = px/(4 s).
Reported for ref->model (R2M), model->ref (M2R) and the union ("sym"): mean, p50, p90, p95, p99, max, plus IoU and symmetric-difference area. Per-row signed outline offset (model minus reference, outward positive) at every 5 mm of z, left and right, and per-band tables:
bands (z mm): feet -88..-75, ankles/shins -75..-40, knees -40..-15, thighs -15..25, hips/crotch 25..60, waist/ribs 60..80, bust/arms 80..100.

## 6. Classification rules (frozen)
Per view, primary zone, Mode F "sym" distribution:
- **PASS (about 1 mm outline agreement)**: p95 <= 1.0 mm AND mean <= 0.5 mm AND (Mode L p95 <= 1.0 mm too).
- **FAIL**: Mode F p95 > 1.0 mm (a mismatch that no similarity camera fit removes; the reference being an AI-generated, non-metric image remains a caveat that is stated, not a reason to downgrade).
- **NOT VERIFIABLE**: Mode F p95 <= 1.0 mm but Mode L p95 > 1.0 mm (camera-dependent), or a view/region lacks reference evidence or calibration.
Band level: FAIL if the band's mean |signed offset| under Mode F > 1.0 mm; PASS if <= 0.5 mm in both modes; else NOT VERIFIABLE/marginal (reported with numbers).
Overall verdict: bv9 "meets the official reference requirements" only if every available full-body view PASSES and no required view is missing. Missing required views (three-quarter) can only yield NOT VERIFIABLE for those views and an incomplete benchmark.
The 1 mm target is NEVER claimed unless the numbers satisfy the PASS rule.

## 7. Geometry/surface review (frozen metrics; model-only unless stated)
- Silhouette continuity: turning-angle kinks (>25 deg over 1 mm arc) on the model outline in each view.
- Cross-sections: planar slices every 2 mm of z (z from -88 to 100): number of loops, area, perimeter; flag levels where area/perimeter second difference exceeds 4 sigma of its robust spread (bumps/pinches).
- Bumps/pinching: width profile w(z) (front and side) minus Gaussian-smoothed (sigma 4 mm) profile; flag |residual| > 1.0 mm.
- Surface smoothness: dihedral angle between adjacent faces on the skin material (material 2) below z=100: p99 and count > 30 deg; clusters listed.
- Asymmetry: model mirror deviation (x -> -x nearest vertex, skin below z=100, excluding arms |x|>=22 mm region noted) vs reference mask left/right half-width asymmetry per row (front and back views, about each view's own symmetry axis fitted per band).
- Reference cross-view consistency (reference-only): front vs back mask widths at the same px/mm (back scale; assumption) per band; not averaged, reported.
- Hidden geometry (depth between views, under-bikini/hair regions, soles, inner thigh gap, armpits) -> NOT VERIFIABLE unless a view gives direct evidence.

## 8. Not done / out of scope
No geometry, rig, weights, material or mesh changes; no new body version; no recommendations implemented; no installs; no downloads.
Measured facts, inferences and NOT VERIFIED items are kept in separate sections of REPORT.md.
