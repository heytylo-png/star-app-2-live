# bv9 camera-scale verification (Issue #177) — FROZEN method and acceptance criteria

Frozen before any step 1–3 measurement was run. Its SHA-256 is recorded in `logs/frozen_criteria_sha256.txt` with a box-local
timestamp (America/Chicago). Research only: no geometry, weight, bone or armature change; no candidates; reference pixels are not committed.

## 0. Inputs and reused code (unchanged, imported)
- bv9 `/workspace/blender/star_rai/star_rai_base_body_bv9.blend`, expected sha256 `d72cedc1…9689`. Geometry = `work/bv9_geom.npz`,
  re-exported from a COPY of bv9 with the unchanged validation `s03_export_geometry.py`; must hash to `f7b8d84c…0aff`
  (value recorded in the correction study `data/baseline_verification.json`). Model z_sole = −88.0 mm, z_crown = max z of
  material 0 (validation definition; assumption carried over, NOT VERIFIED).
- References: `/workspace/blendbro/references/issue177_official_v1/issue177_reference_images/`, manifest sha256 must be
  `c972df6a…5fef` and all 9 image hashes must match it, else STOP.
- Code: validation commit `f81fa464` (`refseg.py`, `s05_measure.py`) and correction-study commit `5a75023d` (`cs_common.py`,
  `c09_measure.py`, `c03`/`c08` definitions) exported with `git archive` into `prior/` and imported unchanged through
  `scripts/compat.py`, which only remaps read paths of the vanished local study folders (and redirects c09's output file to this folder).

## Step 1 — per-image reference scale
Segmentation: `refseg.segment` (Amendment-A1 version, tex_thr 4.0) exactly as the validation. For the 6 close-ups the same function is
called by adding their filenames to `refseg.FILES` at run time (no file edit).
- **D1 (primary, = validation Mode L landmark):** head-top row `top = min foreground row`; sole row `sole = max foreground row + 1`
  (s05 convention); height `H = sole − top` px.
- **Detection-uncertainty variants:** (a) tex_thr 3.0, (b) tex_thr 6.0 (the validation's own sensitivity values),
  (c) row-count rule on the D1 mask: top = first row with ≥ 5 foreground px, sole = (last row with ≥ 5 foreground px) + 1.
  Per view `u_v = max |H_variant − H_D1|` px.
- **Implied px/mm** `s_v = H_v / (z_crown − z_sole)`. Valid as a scale landmark only for full-body views whose top row is the
  bald skull (side, back). Front: the validation records the front top as hair, clipped at the image top → front crown value is
  reported but is NOT a scale landmark. Close-ups (01, 05–09): rows reported; scale **NOT VERIFIABLE** (not full-body; no link to the body views).
- **Front scale without a crown (model-independent), r_fb = s_front / s_back:**
  - **D3 (primary): width-profile mirror match.** Front and back outlines of one body in one pose, in orthographic projection,
    are mirror images, so the outer-extent width w(h) at height h above the sole must agree after scaling. For each row, w = (last fg col + 1) − first fg col
    on the D1 mask; h = sole − (row + 0.5). Grid r ∈ [0.90, 1.10] step 0.0005; cost(r) = mean over back rows with
    h ∈ [0.03·H_back, 0.75·H_back] (soles excluded, head/hair excluded) of |w_front(r·h) − r·w_back(h)| (w_front linearly interpolated).
    r_fb = argmin; report cost(r_fb) and cost(1.0).
  - **D4 (check): crotch apex height.** x_mid = mean of the lower-leg mask columns in rows h ∈ [0.08, 0.20]·H; for columns
    x_mid ± 15 px, the background run that starts at the sole row and goes up; apex h = max height reached. r_crotch = h_front / h_back.
  - s_front = s_back · r_fb.
- **Shared-scale criterion (a priori):** spread = (max − min)/mean of {s_front, s_side, s_back}.
  **SHARED** iff spread ≤ **1.0 %** AND |r_fb − r_crotch|/r_fb ≤ 1.0 % AND the D3 match is good (cost(r_fb) ≤ 2.0 px).
  **NOT SHARED** iff spread > 1.0 % + 2·u_rel, where u_rel = max over views of u_v / H_v (spread clearly outside detection uncertainty).
  Otherwise (or if D3/D4 disagree or D3 cost > 2 px) **NOT VERIFIABLE (inconclusive)**.
  Justification, fixed before measuring: edge-position uncertainty of this segmentation (3×3 texture window, 5 px close) is
  expected ≈ ±2 px per edge; at H ≈ 1,440 px that is ≤ 0.3 % per view and ≤ ≈ 0.6 % between views. 1.0 % leaves margin for that,
  is 5× below the 5.0 % Mode-F spread under test, and 4–5× below the 4–5 % front/back deficit Mode F implies, so it separates
  "one scale (as Mode L assumes)" from "front/back really ≈ 5 % smaller (as Mode F implies)". At a 25 mm half-width a 1 % scale error is 0.25 mm (< 1 mm target).
- Side-vs-back spread (crown-based only) is also reported; it does not depend on z_crown (common factor).

## Step 2 — front crop
For every image: n0 = foreground px in row 0 of the D1 mask, n0..4 per row (rows 0–4), and the length of the mask contour lying on y = 0.
- **CROPPED** iff top_row = 0 AND n0 ≥ 10 px (outline runs along the edge for ≥ 10 px ≈ 1.7 mm).
- **TOUCHING / inconclusive** iff top_row ≤ 2 AND n0 < 10. **NOT CROPPED** iff top_row ≥ 3.
- Supporting evidence (INFERRED, not part of the criterion): predicted front bald-skull-top row y_pred = sole_front − r_fb·H_back;
  head-height ratios (head-top-to-neck / H) for side, back and front, neck row = row of minimum outer width in h ∈ [0.78, 0.94]·H.
- **Bias statement:** (i) as implemented, Mode L front scale = mean(side, back) (s05 `modeL`), so top_row is not used by it → bias on the
  implemented Mode L front scale is 0 (verified by re-running `modeL` and by code). (ii) Hypothetical crown-based front scale
  (sole_front − 0)/(z_crown − z_sole): if the skull top lies above the frame (y_pred < 0) it is biased LOW by (sole_f)/(sole_f − y_pred) − 1;
  if the skull is inside the frame (y_pred ≥ 0) and only hair is clipped, it is biased HIGH by (sole_f − y_pred)/… i.e. by the
  in-frame hair height, which is a lower bound because clipped hair height is unknown. Contour-only crop PNG, no reference pixels.

## Step 3 — constrained recalibration (ONLY if Step 1 = SHARED)
- **Fc (constrained Mode F):** one s for front, side, back; (tx_v, ty_v) free per view. Objective: maximise the mean over the three views of the
  unchanged `s05.iou_zone` (z < 100). Optimisation: grid s ∈ [5.60, 6.10] step 0.02; at each s, per view Nelder-Mead on (tx, ty) from the
  landmark translation at that s (ty = sole + z_sole·s; tx by the s05 lower-leg-centroid rule), initial simplex ±3 px, xatol 1e-3, fatol 1e-6,
  maxiter 200; then bounded Brent on s within ±0.02 of the best grid s (xatol 1e-4) with the same inner fit.
- **Lc (constrained Mode L):** s_L = mean(s_side, s_back) from D1 (one scale; front has no crown); per-view translation by the s05
  landmark rule (sole row ↔ z = −88; lower-leg centroid).
- **Gap attribution, z 40–80 mm (front, back):** rows z = 40, 45, …, 80 (c03 convention, up = 1 masks, runs ≥ 3 px). Use rows where reference
  and model both have exactly 3 runs (arm | torso | arm). Per side: G = gap_model − gap_ref; a = outward displacement of the model arm
  inner edge vs reference; t = inward displacement of the model torso edge vs reference; G = a + t identically. Average over rows and both sides (cancels tx error).
  Class per view/camera: NONE if Ḡ < 1.0 mm; ARMS if ā ≥ ⅔·Ḡ; TORSO if t̄ ≥ ⅔·Ḡ; else MIXED.
  **Camera-robust attribution** iff Fc and Lc give the same class in both front and back → MEASURED; otherwise NOT VERIFIABLE.
- **Leg bands** (ankles/shins −75…−40, knees −40…−15, thighs −15…18; front, back, side): signed outer-edge offsets from unchanged
  `s05.rowprofile` (up = 4), negative = model narrower. Per band/view: **ROBUST** iff all 4 values (2 sides × Fc, Lc) have the same sign,
  min |value| ≥ 0.5 mm, and per side |Fc − Lc| ≤ 0.5 mm; **SIGN-ONLY** iff same sign and min |value| ≥ 0.5 mm but magnitude differs > 0.5 mm;
  **NOT ROBUST** otherwise. Compared with the unconstrained validation cameras.
- If Step 1 ≠ SHARED: Step 3 is not run.

## Step 4 — recal_modeF_agrees_sign
Pre-registered meaning (correction-study preregistration, PASS clause): the intended-metric change measured with the calibration
procedure re-run on the candidate (condition R, Mode F; `cs_common.cams_recal`) must have the same sign as under the fixed baseline
cameras (condition P, Mode F). Intended metrics = those of `c14_evaluate.py`: A → per-view (front, back) decrease of `gap_z25_80` mean;
B/B1 → side `foot_zlt-60` mean decrease and side sole-envelope mean |Δz| decrease. Returns True iff every component is non-zero
(|Δ| > 1e-9 mm) in both P and R and the signs agree; False otherwise (with reasons). Implemented as a function in
`scripts/verdict_rule.py`; demonstrated on the baseline (bv9 vs itself → Δ = 0 → False, "no change") using a fresh unchanged-c09
baseline measurement, which is also compared with the committed `measure_run1.json` baseline.

## Reproducibility and labels
Every step 1–4 measurement runs twice (run1, run2) from scratch; JSON outputs must be identical (byte-equal after removing wall-clock fields).
Findings are labelled MEASURED / INFERRED / NOT VERIFIABLE. Protected files are hashed before and after.

## Disclosure — seen before freezing
- Claude review §6.1 numbers: Mode F s front 5.6943 / side 5.9800 / back 5.7367 (spread 5.0 %); Mode L 6.0005 / 6.0339 / 5.9671 (1.1 %); F/L 0.949 / 0.991 / 0.961; Mode L front uses top_row = 0.
- Validation (f81fa464) frozen method / report text: front reference has hair clipped at the image top; side/back are bald; front Mode L scale = mean(side, back); z_crown 151.6 mm.
- Correction study (5a75023d): excess arm–torso gap ≈ 4–6 mm/side; Mode F → torso 4.4–5.6 mm narrower, Mode L → arms 2.2–3.7 mm (outer) / 3.4–4.5 mm (inner) too far out; leg bands narrower in all variants, 0.2–3.1 mm; c03/c08/c09/c14 code.
- In this task before freezing: hashed inputs and reused scripts; re-exported geometry (hash matched f7b8d84c…); timed one model render and one
  front segmentation (no values printed or inspected). No reference image pixels or masks were viewed. Nothing in steps 1–3 was computed.
