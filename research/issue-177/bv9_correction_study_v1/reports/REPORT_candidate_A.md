# Candidate A — arm / hand placement (`bv9_candidate_A_arm_hand.blend`)

Study: bv9 controlled correction study v1 (task t126u; research only, NOT approval to modify or replace bv9). Date 2026-11-02 (America/Chicago). Units: model mm (1 Blender unit = 1 m; figure 244.8 mm tall; real-world scale NOT VERIFIED). Frozen pre-registration: `CORRECTION_STUDY_PREREGISTRATION_FROZEN.md`.

Method = the validation's frozen method + Amendment A1, implemented by the validation scripts imported UNCHANGED (`s05_measure.py`, `refseg.py`); primary camera = baseline (bv9) cameras held fixed (geometry-only differences), secondary = calibration re-run on the candidate. Every number is `before (bv9) → after (candidate)`. Both measurement runs agree to 0 (max abs difference over all reported numbers).

## 1. Verdict: **FAIL** (pre-registered rule: new mesh intersections) — and, independent of that, **NOT VERIFIABLE** as an improvement (camera-dependent)
- Intended metric (gap zone z 25…80 mm, front and back, sym mean): improves **only under the landmark camera (Mode L)**; **worsens under the best-fit camera (Mode F)**. Pre-registered thresholds: I_F = False, I_L = True; regression flags R_F = True, R_L = False.
- New non-adjacent triangle-pair intersections (BVH, rest mesh): **110** (all lower-arm ↔ pelvis/hip, z 40.8…48.1 mm). Baseline minimum forearm→hip clearance was 3.19 mm (right) / 2.47 mm (left); the 3.5 mm shift penetrates by up to 0.82 mm (left, 43 vertices inside) / 0.12 mm (right, 12 inside). The pre-registered rule makes any new intersection a FAIL.
- **Calibration caveat (important):** when the validation's calibration procedure is re-run on the candidate (secondary condition, §4.2), Mode F re-fits the scale **+5.6 % (front) / +6.0 % (back, at the ±6 % bound)** and A then *improves* front (mean 1.32 → 1.00 mm, 61 → 73 % ≤ 1 mm) and back (1.13 → 1.04 mm, 57 → 71 %). That is the same direction as fixed Mode L (the re-fit lands on the Mode-L scale), so A's apparent gain exists whenever the figure is scaled up ≈5–6 %, and is a regression when the baseline best-fit scale is kept. The references do not tell which scale is real.
- Without the intersection rule the result would be NOT VERIFIABLE: improvement under one calibration, regression under the other. A 3.5 mm inward shift of the whole arm is **not supported as a correction by the official references**.

## 2. What was changed (candidate copy only)
Mesh-only edit of a copy of bv9; no bone, weight, topology, material, texture or modifier change (verified: `data/candidate_integrity.json`). Per side, existing arm vertex-group weights w = clip(upper_arm+lower_arm+hand, 0, 1) × taper(z) (1 for z ≤ 70 mm → 0 at z ≥ 90 mm, smoothstep, to protect the armpit); x translated **3.5 mm toward the midline**. 8,514 vertices moved (max displacement 3.50 mm). Moved vertices by dominant group: {'lower_arm_right': 1177, 'hand_left': 2259, 'upper_arm_right': 758, 'upper_arm_left': 759, 'waist': 63, 'hand_right': 2259, 'lower_arm_left': 1177} — the 63 `waist`-dominant vertices are torso vertices at the armpit that carry a partial arm weight; no vertex with zero arm weight moved. The 17 shape-key blocks received the same delta so their relative offsets are unchanged (all key values are 0). Torso and hip geometry were not edited. Rest-pose skeleton is unchanged, so the arm mesh no longer lines up with the arm bone axis by ≈3.5 mm (a rig consequence NOT assessed here).

## 3. Cause analysis (measured on bv9, before any edit)
The front/back "gap wedge" between arm and hip is, at z 50…70 mm (back view, Mode F), **6.1–9.2 mm wide in the model against 0.2–3.1 mm in the reference** (rows where arm and torso are separable in both masks, `data/baseline_mapping.json`; front view similar: 6.0–8.3 vs 0.9–1.2 mm at z 50 and 75). Excess gap ≈ 4–6 mm per side at z 40…80 in both cameras. **Who owns the excess depends on the camera:**
- **Mode F (best-fit scale):** arm outer edges agree within 0.0–0.7 mm (back, z 40–80) and the arm inner edge is 0.3–1.6 mm off (z 45–80; 2.8–3.3 mm at z 40 where the hand begins); the **torso/waist is 4.4–5.6 mm per side narrower than the reference at z 50–70** (e.g. back z 55: reference half-width 24.2, model 18.7 mm). → body geometry, not arm placement.
- **Mode L (landmark scale, height-consistent):** torso half-width within 2.5 mm (mostly ≤1.4 mm; largest: back z 45 model wider by 2.4, front z 70 model narrower by 2.5), but the model arms sit **2.2–3.7 mm (outer edge) / 3.4–4.5 mm (inner edge) farther out**. → arm placement.
- The two cameras differ by ≈5 % in scale (front F 5.694 vs L 6.001 px/mm; back 5.737 vs 5.967), the F fit for front/back is ≈5 % below the side-view fit (5.980), i.e. the three references are not scale-consistent under the best-fit camera. Which camera is right cannot be established from the references (no scale data) → **the attribution (arm vs torso) is NOT VERIFIABLE**; what is measured is the ≈5 mm excess gap itself.
- Hands: front reference hands end higher (z ≈ 28) and sit against the thigh; back reference hands extend lower (≤ z 18). Front and back references disagree on the hand, so hand placement/length is NOT VERIFIABLE.
- Reference-segmentation spot check (raw grey values along rows z 30…70, front and back): gap pixels between arm and hip are at background grey (≈174–175) and 1–2 mm wide (6–10 px) in the rows where the mask shows a gap, i.e. the reference gap is real there; where the mask shows no gap the arm touches the body or the gap is below ≈1 mm (segmentation resolution 0.17 mm/px). This is a spot check of selected rows, not a full audit of the segmentation.

## 4. Measurement (before → after, same method)
### 4.1 Fixed baseline cameras (primary)
| view | cam | mean | p50 | p95 | p99 | max (mm) | % ≤1 mm | IoU |
|---|---|---|---|---|---|---|---|---|
| front | Mode F | 1.32 → 1.49 | 0.75 → 0.83 | 5.08 → 5.59 | 8.82 → 10.07 | 13.63 → 13.63 | 61.0 → 56.1 | 0.842 → 0.860 |
| front | Mode L | 1.38 → 1.01 | 0.58 → 0.42 | 4.36 → 3.85 | 7.14 → 8.08 | 11.76 → 11.76 | 61.3 → 72.1 | 0.820 → 0.902 |
| side | Mode F | 1.08 → 1.08 | 0.50 → 0.50 | 4.97 → 4.97 | 8.55 → 8.55 | 10.18 → 10.18 | 72.0 → 72.0 | 0.889 → 0.889 |
| side | Mode L | 1.18 → 1.18 | 0.54 → 0.54 | 4.71 → 4.71 | 9.08 → 9.08 | 10.73 → 10.73 | 67.5 → 67.5 | 0.880 → 0.880 |
| back | Mode F | 1.13 → 1.48 | 0.74 → 1.09 | 4.05 → 4.01 | 5.32 → 5.49 | 6.68 → 6.77 | 57.5 → 45.4 | 0.852 → 0.834 |
| back | Mode L | 1.59 → 1.30 | 1.26 → 0.97 | 4.59 → 4.55 | 7.77 → 7.79 | 9.93 → 9.93 | 41.4 → 50.7 | 0.803 → 0.864 |

### 4.2 Calibration procedure re-run on the candidate (secondary; includes calibration drift)
| view | cam | mean | p50 | p95 | p99 | max (mm) | % ≤1 mm | IoU |
|---|---|---|---|---|---|---|---|---|
| front | Mode F | 1.32 → 1.00 | 0.75 → 0.42 | 5.08 → 3.95 | 8.82 → 7.92 | 13.63 → 11.63 | 61.0 → 73.3 | 0.842 → 0.903 |
| front | Mode L | 1.38 → 1.01 | 0.58 → 0.42 | 4.36 → 3.85 | 7.14 → 8.08 | 11.76 → 11.76 | 61.3 → 72.1 | 0.820 → 0.902 |
| side | Mode F | 1.08 → 1.08 | 0.50 → 0.50 | 4.97 → 4.97 | 8.55 → 8.55 | 10.18 → 10.18 | 72.0 → 72.0 | 0.889 → 0.889 |
| side | Mode L | 1.18 → 1.18 | 0.54 → 0.54 | 4.71 → 4.71 | 9.08 → 9.08 | 10.73 → 10.73 | 67.5 → 67.5 | 0.880 → 0.880 |
| back | Mode F | 1.13 → 1.04 | 0.74 → 0.61 | 4.05 → 3.91 | 5.32 → 6.66 | 6.68 → 7.36 | 57.5 → 71.3 | 0.852 → 0.881 |
| back | Mode L | 1.59 → 1.30 | 1.26 → 0.97 | 4.59 → 4.55 | 7.77 → 7.79 | 9.93 → 9.93 | 41.4 → 50.7 | 0.803 → 0.864 |

Scale the re-fit chose for the candidate (Mode F hits/approaches the ±6 % bound because the narrower figure is "rescaled up"; improvements under re-fit Mode F are therefore calibration drift, not geometry):
| view | cam | baseline scale s | candidate scale s (re-fit) | Δs % |
|---|---|---|---|---|
| front | Mode F | 5.6943 | 6.0151 | +5.63 |
| front | Mode L | 6.0005 | 6.0005 | +0.00 |
| side | Mode F | 5.9800 | 5.9800 | +0.00 |
| side | Mode L | 6.0339 | 6.0339 | +0.00 |
| back | Mode F | 5.7367 | 6.0815 | +6.01 |
| back | Mode L | 5.9671 | 5.9671 | +0.00 |

### 4.3 Intended region — gap zone z 25…80 mm
| front gap zone | cam | n | mean | p50 | p95 | max | % ≤1 mm |
|---|---|---|---|---|---|---|---|
| front | Mode F | 14274 → 13844 | 2.29 → 2.88 | 1.32 → 2.28 | 8.10 → 8.79 | 13.63 → 13.63 | 43 → 25 |
| front | Mode L | 15012 → 14558 | 2.58 → 1.67 | 2.73 → 0.84 | 5.69 → 7.18 | 11.76 → 11.76 | 28 → 56 |

| back gap zone | cam | n | mean | p50 | p95 | max | % ≤1 mm |
|---|---|---|---|---|---|---|---|
| back | Mode F | 15786 → 15351 | 1.40 → 2.43 | 0.70 → 2.69 | 4.40 → 4.85 | 6.68 → 6.77 | 55 → 20 |
| back | Mode L | 16671 → 16220 | 1.94 → 1.13 | 1.93 → 0.92 | 4.02 → 3.34 | 7.08 → 7.08 | 29 → 54 |

Arm outer-edge row offset (z 40…80, mean |model − reference|, Mode F fixed camera): front 0.77 → 2.61 mm, back 0.34 → 3.26 mm; (Mode L) front 3.41 → 0.48, back 2.55 → 0.83 mm.

Hand zone z 15…45: | front hand zone | cam | n | mean | p50 | p95 | max | % ≤1 mm |
|---|---|---|---|---|---|---|---|
| front | Mode F | 8416 → 8144 | 1.48 → 1.57 | 0.66 → 0.79 | 5.07 → 5.96 | 8.15 → 8.15 | 61 → 57 |
| front | Mode L | 9032 → 8743 | 1.23 → 1.07 | 0.73 → 0.54 | 3.45 → 3.66 | 6.80 → 6.80 | 58 → 68 |

| back hand zone | cam | n | mean | p50 | p95 | max | % ≤1 mm |
|---|---|---|---|---|---|---|---|
| back | Mode F | 9075 → 8797 | 1.35 → 1.88 | 0.75 → 1.44 | 4.27 → 4.22 | 6.68 → 6.77 | 55 → 35 |
| back | Mode L | 9271 → 8986 | 1.84 → 2.12 | 1.55 → 1.56 | 5.55 → 5.65 | 7.60 → 7.74 | 35 → 28 |

### 4.4 Bands (fixed Mode F camera) — front and back
| view | band (z mm) | sym mean (mm) | % ≤1 mm | signed outline offset L / R (mm) |
|---|---|---|---|---|
| front | feet | 0.94 → 0.94 | 61 → 61 | -1.55/-1.01 → -1.55/-1.01 |
| front | ankles/shins | 0.67 → 0.67 | 79 → 79 | -0.84/-1.13 → -0.84/-1.13 |
| front | knees | 1.01 → 1.01 | 62 → 62 | -1.41/-1.62 → -1.41/-1.62 |
| front | thighs | 0.82 → 0.76 | 71 → 71 | -0.32/-0.31 → -0.54/-0.53 |
| front | hips/crotch | 1.88 → 2.57 | 50 → 29 | 1.73/1.99 → -1.76/-1.51 |
| front | waist/ribs | 3.15 → 3.52 | 28 → 18 | 0.86/0.63 → -2.41/-2.66 |
| front | bust/arms | 0.86 → 0.77 | 66 → 75 | 0.58/-0.02 → 0.13/-0.47 |
| back | feet | 2.32 → 2.32 | 28 → 28 | -3.05/-2.45 → -3.05/-2.45 |
| back | ankles/shins | 0.69 → 0.69 | 68 → 68 | -1.20/-0.93 → -1.20/-0.93 |
| back | knees | 0.77 → 0.77 | 55 → 55 | -1.19/-1.19 → -1.19/-1.19 |
| back | thighs | 0.88 → 0.83 | 64 → 62 | -1.25/-1.51 → -1.47/-1.73 |
| back | hips/crotch | 1.31 → 2.55 | 63 → 19 | 0.05/0.29 → -3.45/-3.21 |
| back | waist/ribs | 1.56 → 2.23 | 42 → 23 | -0.25/-0.11 → -3.51/-3.38 |
| back | bust/arms | 0.68 → 0.71 | 65 → 70 | -0.50/-0.43 → -0.95/-0.88 |

Bands (fixed Mode L camera):
| view | band (z mm) | sym mean (mm) | % ≤1 mm | signed outline offset L / R (mm) |
|---|---|---|---|---|
| front | feet | 0.69 → 0.69 | 72 → 72 | -0.40/0.04 → -0.40/0.04 |
| front | ankles/shins | 0.33 → 0.33 | 100 → 100 | -0.24/-0.30 → -0.24/-0.30 |
| front | knees | 0.45 → 0.45 | 85 → 85 | -0.75/-0.70 → -0.75/-0.70 |
| front | thighs | 0.54 → 0.41 | 86 → 90 | -0.25/0.10 → -0.47/-0.12 |
| front | hips/crotch | 2.28 → 1.95 | 37 → 59 | 2.78/3.18 → -0.72/-0.32 |
| front | waist/ribs | 3.08 → 1.24 | 13 → 51 | 3.61/3.44 → 0.33/0.17 |
| front | bust/arms | 2.60 → 2.33 | 18 → 18 | 2.89/2.56 → 2.44/2.11 |
| back | feet | 0.97 → 0.97 | 63 → 63 | -1.15/-0.04 → -1.15/-0.04 |
| back | ankles/shins | 0.84 → 0.84 | 53 → 53 | -0.91/-0.71 → -0.91/-0.71 |
| back | knees | 0.64 → 0.64 | 70 → 70 | -0.41/-0.39 → -0.41/-0.39 |
| back | thighs | 1.93 → 2.08 | 36 → 34 | -3.23/-3.46 → -3.45/-3.68 |
| back | hips/crotch | 1.70 → 1.45 | 35 → 40 | 1.79/2.08 → -1.71/-1.43 |
| back | waist/ribs | 2.34 → 0.61 | 18 → 77 | 2.86/2.96 → -0.41/-0.30 |
| back | bust/arms | 2.65 → 2.37 | 25 → 31 | 1.35/1.48 → 0.90/1.03 |

### 4.5 Side view
Unchanged by construction (the edit is a pure x-translation): side-view numbers are identical before/after in every camera condition (see §4.1).

## 5. Regression analysis (pre-registered thresholds)
- **Mode F (fixed baseline camera):** front: p95 +0.52 mm (>0.5); front: %<=1mm 56.1 vs 61.0 (drop>3 pts); back: mean +0.35 mm (>0.25); back: %<=1mm 45.4 vs 57.5 (drop>3 pts); front: arm outer-edge mean|offset| z40-80 0.77->2.61 mm (>+0.5); back: arm outer-edge mean|offset| z40-80 0.34->3.26 mm (>+0.5); back: hand zone z15-45 sym mean 1.35->1.88 (>+0.5)
- **Mode L (fixed baseline camera):** none
- Intersections: 110 new pairs; vertex bbox of new pairs z 40.8…48.1 mm, |x| ≤ 26.5 mm (`data/candidate_integrity.json`, `data/penetration_A.json`).
- Other silhouette regions: only front/back arm-torso rows changed; leg, foot and head contours are untouched (identical numbers in those bands).

## 6. Exploratory sweep (in memory only; no files; NOT candidates) — shift Δ vs fixed-camera mean error (front / back) and gap-zone mean
| Δ inward (mm) | Mode F front | Mode F back | Mode L front | Mode L back | Mode L gap-zone front/back |
|---|---|---|---|---|---|
| 0 | 1.322 | 1.125 | 1.377 | 1.588 | 2.58/1.94 |
| 1 | 1.270 | 1.133 | 1.264 | 1.470 | 2.31/1.61 |
| 2 | 1.325 | 1.236 | 1.133 | 1.332 | 1.97/1.23 |
| 2.5 | 1.380 | 1.310 | 1.067 | 1.290 | 1.79/1.11 |
| 3.5 | 1.488 | 1.477 | 1.008 | 1.303 | 1.67/1.13 |
| 5 | 1.582 | 1.683 | 1.133 | 1.556 | 2.10/1.82 |
| 7 | 1.628 | 1.737 | 1.204 | 1.840 | 2.44/2.63 |

Under Mode L the optimum is Δ ≈ 2.5–3.5 mm; under Mode F the best value is Δ ≈ 0–1 mm. Baseline forearm-to-hip clearance (2.47 mm left) bounds penetration-free shifts to Δ ≲ 2.4 mm.

## 7. Uncertainties and limits
- Camera: orthographic, scale/offset unknown; Mode F vs Mode L give opposite verdicts (above). Perspective in the references cannot be excluded.
- The reference views disagree with each other (hand length; ≈5 % scale difference under Mode F).
- Hidden geometry (armpit, inner arm, depth between views) NOT VERIFIABLE; no geometry was invented.
- Rig effect of moving the arm mesh without moving the bones was not evaluated (no posing/sim performed).
- 1 mm agreement is **not** claimed anywhere: best case (Mode L, front) mean 1.01 mm, 72 % ≤ 1 mm.

## 8. Files
Local candidate: `/workspace/blendbro/out/bv9_correction_study_v1/candidates/bv9_candidate_A_arm_hand.blend` sha256 `162c3023d41b4e2e53a3944bc993a7b409edb1435f427a7562bdd043edb5256f`; edit parameters `data/candidate_A_build.json`; measurements `data/measure_run1.json` (key `A`), `data/measure_run2.json`; overlays (contour-only) `overlays_publishable/candA_*`.
