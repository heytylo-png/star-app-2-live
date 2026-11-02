# Candidate C — leg silhouette (`bv9_candidate_C_legs.blend`; NO CHANGE APPLIED)

Study: bv9 controlled correction study v1 (task t126u; research only, NOT approval to modify or replace bv9). Date 2026-11-02 (America/Chicago). Units: model mm (1 Blender unit = 1 m; figure 244.8 mm tall; real-world scale NOT VERIFIED). Frozen pre-registration: `CORRECTION_STUDY_PREREGISTRATION_FROZEN.md`.

Method = the validation's frozen method + Amendment A1, implemented by the validation scripts imported UNCHANGED (`s05_measure.py`, `refseg.py`); primary camera = baseline (bv9) cameras held fixed (geometry-only differences), secondary = calibration re-run on the candidate. Every number is `before (bv9) → after (candidate)`. Both measurement runs agree to 0 (max abs difference over all reported numbers).

## 1. Verdict: **NOT VERIFIABLE — no candidate change made**
No leg band meets the pre-registered "supported beyond camera uncertainty" rule (same sign in all 10 camera/segmentation variants, both views, both sides, smallest magnitude ≥ 0.5 mm in both views). Per the pre-registration `bv9_candidate_C_legs.blend` is a **byte-identical copy of bv9** (sha256 `d72cedc1fbe6aaa14bebddbe052af97321816f88e8c3065a920165cbcf6d9689` = bv9 `d72cedc1…9689`); it is labelled "no change" and must not be mistaken for a corrected model. The passing side-view knee/thigh bands are untouched by construction.

## 2. Zone map (bv9, signed outline offset model − reference; negative = model narrower, per side; ankles/shins z −75…−40, knees −40…−15, thighs −15…18 mm)
All variants share one sign (model narrower than reference) in front and back, but the magnitude is camera-dependent by a factor of 3–10:
| band | front (all 20 variant-sides) | back (all 20 variant-sides) | side view signed range (mm) | supported by rule |
|---|---|---|---|---|
| ankles/shins | narrower (min 0.23, max 1.51; weakest: modeL (baseline cam) / left) | narrower (min 0.71, max 1.57; weakest: modeL (baseline cam) / right) | -1.27…-0.43 | NO |
| knees | narrower (min 0.70, max 2.17; weakest: modeL (baseline cam) / right) | narrower (min 0.39, max 1.64; weakest: modeL (baseline cam) / right) | -0.84…0.16 | NO |
| thighs | narrower (min 0.20, max 1.44; weakest: modeL (baseline cam) / right) | narrower (min 0.56, max 3.09; weakest: F scale +2% / left) | -0.40…0.29 | NO |

Front, per camera/segmentation variant (left / right mm):
| variant | ankles/shins L/R | knees L/R | thighs L/R |
|---|---|---|---|
| modeF (baseline cam) | -0.84 / -1.13 | -1.41 / -1.62 | -1.03 / -1.05 |
| modeL (baseline cam) | -0.24 / -0.30 | -0.75 / -0.70 | -0.51 / -0.20 |
| F scale -2% | -1.18 / -1.51 | -1.96 / -2.17 | -1.42 / -1.44 |
| F scale -1% | -0.99 / -1.33 | -1.69 / -1.90 | -1.21 / -1.23 |
| F scale +1% | -0.64 / -0.95 | -1.17 / -1.40 | -0.86 / -0.87 |
| F scale +2% | -0.51 / -0.77 | -0.92 / -1.15 | -0.69 / -0.69 |
| F x -1px | -0.67 / -1.30 | -1.23 / -1.80 | -0.86 / -1.23 |
| F x +1px | -1.02 / -0.95 | -1.58 / -1.45 | -1.21 / -0.87 |
| F ref-seg tex 3.0 | -0.92 / -1.18 | -1.50 / -1.78 | -1.17 / -1.08 |
| F ref-seg tex 6.0 | -0.77 / -1.08 | -1.37 / -1.61 | -1.03 / -1.00 |

Back:
| variant | ankles/shins L/R | knees L/R | thighs L/R |
|---|---|---|---|
| modeF (baseline cam) | -1.20 / -0.93 | -1.19 / -1.19 | -0.92 / -1.23 |
| modeL (baseline cam) | -0.91 / -0.71 | -0.41 / -0.39 | -2.82 / -3.09 |
| F scale -2% | -1.58 / -1.32 | -1.62 / -1.64 | -1.30 / -1.64 |
| F scale -1% | -1.41 / -1.17 | -1.41 / -1.43 | -1.13 / -1.44 |
| F scale +1% | -1.01 / -0.82 | -1.00 / -0.98 | -0.74 / -1.05 |
| F scale +2% | -1.07 / -0.75 | -0.76 / -0.75 | -0.56 / -0.85 |
| F x -1px | -1.02 / -1.11 | -1.02 / -1.37 | -0.75 / -1.40 |
| F x +1px | -1.37 / -0.76 | -1.37 / -1.02 | -1.10 / -1.06 |
| F ref-seg tex 3.0 | -1.28 / -1.08 | -1.25 / -1.23 | -0.98 / -1.34 |
| F ref-seg tex 6.0 | -1.11 / -0.88 | -1.14 / -1.14 | -0.87 / -1.13 |

Side (the bands that PASS in the validation; depth, not width):
| variant | ankles/shins L/R | knees L/R | thighs L/R |
|---|---|---|---|
| modeF (baseline cam) | -0.89 / -0.66 | -0.58 / -0.00 | -0.18 / 0.13 |
| modeL (baseline cam) | -0.69 / -0.76 | -0.63 / 0.05 | -0.18 / 0.01 |
| F scale -2% | -0.73 / -0.93 | -0.84 / -0.22 | -0.40 / -0.01 |
| F scale -1% | -0.87 / -0.77 | -0.75 / -0.10 | -0.30 / 0.06 |
| F scale +1% | -1.25 / -0.53 | -0.49 / 0.01 | -0.06 / 0.20 |
| F scale +2% | -1.27 / -0.43 | -0.43 / 0.12 | 0.06 / 0.26 |
| F x -1px | -0.72 / -0.83 | -0.41 / -0.17 | -0.01 / -0.04 |
| F x +1px | -1.05 / -0.49 | -0.75 / 0.16 | -0.35 / 0.29 |
| F ref-seg tex 3.0 | -1.01 / -0.73 | -0.73 / -0.19 | -0.28 / 0.05 |
| F ref-seg tex 6.0 | -0.86 / -0.62 | -0.56 / 0.05 | -0.10 / 0.19 |

## 3. Camera uncertainty vs geometry
- **Direction is robust, size is not.** The model is narrower than the reference in every variant of both views (never wider), so a real narrowness of the legs relative to the references is likely (inference). The size ranges 0.2–2.2 mm (front) and 0.4–3.1 mm (back) per side, spanning Mode L (small) to Mode F with −2 % scale (large): scale ±2 % alone moves a band by ≈0.4–0.5 mm per side.
- Weakest links against the rule: front ankles 0.24 mm and thighs 0.20 mm (Mode L), back knees 0.39 mm (Mode L); only front knees (≥0.70 mm) and back ankles (≥0.71 mm) clear 0.5 mm in one view each, in different bands.
- References are mutually inconsistent (validation: back/front width ratio 0.92–1.08 on legs and torso; reference left/right asymmetry up to 1.2 mm), so a front-derived width change cannot be confirmed by the back at the 0.5 mm level.
- The front/back reference scales differ by ≈5 % between Mode F and Mode L (see candidate A), larger than the effect being corrected.

## 4. Exploratory, in-memory only (NOT a candidate, no file): conservative knee widening
Knee band (z −40…−15) x-scale about each leg axis giving +0.7 mm per side (the smallest robust front magnitude; leg half-width 9.41 mm), smoothstep 5 mm margins; fixed baseline cameras.
| view | cam | mean before → after | p95 | % ≤1 mm | knee-band mean abs outline offset (mm) |
|---|---|---|---|---|---|
| front | Mode F | 1.322 → 1.298 | 5.08 → 5.08 | 61.0 → 60.7 | 1.52 → 0.87 |
| front | Mode L | 1.377 → 1.362 | 4.36 → 4.36 | 61.3 → 63.9 | 0.72 → 0.29 |
| back | Mode F | 1.125 → 1.073 | 4.05 → 4.05 | 57.5 → 63.4 | 1.19 → 0.54 |
| back | Mode L | 1.588 → 1.573 | 4.59 → 4.59 | 41.4 → 44.5 | 0.57 → 0.63 |
| side | Mode F | 1.084 → 1.084 | 4.97 → 4.97 | 72.0 → 72.0 | 0.33 → 0.33 |
| side | Mode L | 1.178 → 1.178 | 4.71 → 4.71 | 67.5 → 67.5 | 0.43 → 0.43 |

Reading: the knee-band offset shrinks in front (both cameras) and in back under Mode F, but grows slightly in back under Mode L (0.57 → 0.63 mm), and overall mean/p95/% ≤1 mm barely move (≤ 0.05 mm mean). Side view is identical (x-only edit) so the side-view PASS bands are preserved. This does not satisfy the pre-registered rule and is **not** claimed as an improvement.

## 5. Uncertainties
Same camera/provenance limits as the validation; no scale data; no three-quarter views. A leg-width change cannot be justified before the camera/scale question is resolved.
