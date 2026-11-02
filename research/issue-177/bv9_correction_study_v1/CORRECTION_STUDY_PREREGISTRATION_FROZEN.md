# bv9 controlled correction study v1 — PRE-REGISTRATION (frozen BEFORE any candidate was built or measured)

Task t126u (research only; NOT approval to modify/replace bv9). Date 2026-11-02 (America/Chicago).
Baseline: `/workspace/blender/star_rai/star_rai_base_body_bv9.blend` sha256 `d72cedc1fbe6aaa14bebddbe052af97321816f88e8c3065a920165cbcf6d9689` (verified, `data/baseline_verification.json`).
Measurement method: the validation's frozen method (`METHOD_AND_CRITERIA_FROZEN.md` sha `9af41e41…e59e`) + Amendment A1 (`834ed0dd…`), implemented by the validation scripts
`s05_measure.py` (sha `b1ed4880…`) and `refseg.py` (sha `05a34ac8…`), IMPORTED UNCHANGED (module globals V,T,MAT,UAX,ZCROWN re-pointed to the candidate mesh at run time; no file edited).
Same reference files (official #177 nine-file set, manifest verified), same segmentation (A1), same zones (z<100 mm), same bands, same distance definition, same 1 mm fraction definition.

## What had been looked at before this freeze (disclosed)
Baseline-only numbers: the validation results and `data/baseline_mapping.json` (edge/gap decomposition for the arm region, sole envelopes, leg-band offsets under camera/segmentation variants). No candidate geometry existed.
Baseline mapping facts that fix the design (measured, bv9 vs official refs, Mode F = best-fit camera, Mode L = landmark-only camera):
- Gap excess (model arm–torso gap minus reference gap) at z 40..80 is ~4–6 mm per side in BOTH cameras. Attribution differs by camera: Mode F → arm edges match (outer ≤0.7 mm) and the torso is ~4.5–5.6 mm narrower per side (z 50..75); Mode L → torso matches (≤1.4 mm) and the arms sit ~2.4–3.7 mm (outer) / 3.4–4.5 mm (inner) farther out. So "arm placement vs body geometry" is camera-dependent.
- Side-view feet: bv9 sole envelope slopes −28.4° (right) / −27.8° (left) (toe-down "tiptoe"; toe touches z=−88, heel envelope ≈ −73.5), the reference sole is flat (z −85…−87.4).
- Legs front/back: model narrower than reference in every camera/segmentation variant, magnitude 0.2–2.2 mm depending on band and variant.

## Cameras (both reported for every candidate and every view)
- **P (primary) = baseline cameras held FIXED** (Mode F and Mode L parameters s,tx,ty taken from the validation's `data/silhouette_measurements.json`). Differences from baseline are then geometry-only.
- **R (secondary) = calibration PROCEDURE re-run** on the candidate (`S.modeL` + `S.fit`, unchanged code). Reported; differences from P are calibration drift.
- Each of P/R is evaluated in Mode F and Mode L → 4 camera conditions per view. Every candidate/baseline measurement is run TWICE; results must agree to 1e-9 or reproducibility = FAIL.

## Statistics reported for each candidate, view, camera condition
mean, p50, p90, p95, p99, max (sym, z<100 mm), % of outline ≤1 mm (and ≤0.5, ≤2), IoU, band tables (validation bands) incl. % ≤1 mm per band, intended-region stats, outer-contour-only supplement S1 (as in validation).
Before/after contour overlays (Mode F fixed camera = primary figure; Mode L also produced). Contour-only copies for publication.

## Verdict rule (all candidates)
Let I_F, I_L = "intended metric improves by at least its threshold" under fixed Mode F / fixed Mode L (P cameras). Let R_F, R_L = "any regression threshold violated" under fixed Mode F / Mode L.
- **PASS** (measured improvement): I_F and I_L and not R_F and not R_L and reproducible and no new intersections and recalibrated (R) Mode F agrees in sign.
- **FAIL**: neither I_F nor I_L, OR (R_F and R_L), OR new intersections / reproducibility failure.
- **NOT VERIFIABLE**: everything else (e.g. improvement under one camera only, or improvement with a regression in one camera) — camera-dependent, labelled as such.
Common regression thresholds, applied to each view (front, side, back) and each fixed camera mode: mean worsens > 0.25 mm, OR p95 worsens > 0.5 mm, OR max worsens > 1.0 mm, OR % ≤1 mm drops by > 3 percentage points; any validation band outside the intended region whose sym_mean worsens > 0.5 mm or whose %≤1 mm drops > 10 points.
(Candidate-specific thresholds below add to these.) A visually plausible change that does not meet the rule is not claimed as an improvement.

## Candidate A — arm/hand placement (hypothesis test, bv9_candidate_A_arm_hand.blend)
Edit (mesh only, rest pose; no bone/weight/topology/material change): for each side s∈{right(+X), left(−X)} per-vertex weight w = clip(W[upper_arm_s]+W[lower_arm_s]+W[hand_s], 0, 1) (existing vertex-group weights, read only);
taper(z)=1 for z≤70 mm, 0 for z≥90 mm, smoothstep between (protects the armpit). Translate x by Δ = **3.5 mm toward the body midline** × w × taper (right arm −X, left arm +X). No torso/hip/leg/head vertex is touched except through w (verts with w=0 stay fixed). 
Δ = 3.5 mm rationale: Mode-L baseline arm centreline offset (front −3.8, back −3.35 mm). Exploratory sweep Δ∈{1,2,3.5,5,7} in memory (no files) is reported but the candidate is fixed at 3.5.
Shape-key blocks: every key block's coordinates for edited vertices receive the same delta (so relative key offsets are unchanged); key values stay 0.
Intended metric: **gap-zone** (z 25…80 mm, front and back) sym mean distance and % ≤1 mm. I_F/I_L = gap-zone sym mean decreases ≥ 0.30 mm in BOTH front and back. 
A-specific regression: arm outer-edge row offsets (z 40…80, both sides, S.rowprofile outline offset) mean |offset| worsens > 0.5 mm in Mode F; side view mean worsens > 0.10 mm; hand zone (z 15…45) sym mean worsens > 0.5 mm; new non-adjacent triangle-pair intersections (BVH) vs baseline > 0.
Not done: torso/hip geometry; not changed to hide an arm problem.

## Candidate B — foot alignment (bv9_candidate_B_foot.blend)
Edit (mesh only; foot BONES and weights not touched): per side, w = clip(W[foot_s],0,1); rotate about the world-X axis through the ankle pivot Pv=(±10.0, 0.0, −62.0) mm (the v10 `foot_*` bone head, read from the locked armature, not modified) by **φ = +28.1° (toe up)** = mean of the measured right/left bv9 sole-envelope pitches (28.44°, 27.83°), via p' = p + w·(R(p−Pv)+Pv−p). Then translate z by Δz·w, where Δz is the single constant that makes the lowest vertex of the edited mesh z = −88.000 mm (restores the floor landmark used by Mode L; expected ≈ −11 mm, i.e. the foot is lowered and the lower shin/ankle blend is stretched — reported as a side effect, not hidden).
Shape-key handling as in A.
Intended metric: side-view foot zone (z < −60 mm) sym mean and the sole-envelope mean |z difference| to the reference over Y∈[−8, 22] mm. I = foot-zone sym mean decreases ≥ 1.0 mm AND sole-envelope mean |Δz| decreases ≥ 2.0 mm (both fixed cameras).
B-specific regression: front/back foot-zone (z<−60) sym mean worsens > 0.5 mm; side-view ankle band (z −75…−55) worsens > 0.5 mm; side-view non-foot (z ≥ −60) mean worsens > 0.25 mm; model min z outside [−88.1, −87.9]; new BVH intersections > 0; max vertex displacement of verts with w=0 must be 0.
Orientation vs geometry separation (reported, measured on baseline): foot length along sole 3D = (Ymax−Ymin)/cos(pitch) vs reference flat Y extent.

## Candidate C — legs (bv9_candidate_C_legs.blend)
Support rule (decided now): a leg band (ankles/shins −75…−40, knees −40…−15, thighs −15…18 mm) is "supported beyond camera uncertainty" only if, in BOTH front and back views and on BOTH sides, the signed outline offset (model − reference) has the same sign in ALL 10 variants of `data/baseline_mapping.json:C_leg_offsets_variants` (Mode F, Mode L, scale ±1%, ±2%, x ±1 px, segmentation threshold 3.0/6.0) AND the smallest variant magnitude is ≥ 0.5 mm in both views, AND the side view of that band is not made worse. If NO band meets this, no edit is made: C = NOT VERIFIABLE, `bv9_candidate_C_legs.blend` is a byte-identical copy of bv9 (explicitly "no change"), and the passing side-view knee/thigh bands are untouched by construction.
If at least one band qualifies: edit = x-offset of leg vertices (thigh_s/shin_s weights, w) by the smallest-variant magnitude (conservative), smooth z-falloff (smoothstep, 5 mm margins) and judged with the same verdict rule; regression thresholds: side view knees/thighs bands may not worsen > 0.25 mm.
An in-memory exploratory test (not a candidate, no file) of a conservative knee-width change is reported separately and labelled exploratory.

## Not done / out of scope
No combination of A/B/C; no new production version; no topology, weights, skeleton, textures or materials changed; no Blender add-ons/installs/downloads; the official reference pixels are not committed.
