# Candidate B — foot alignment (`bv9_candidate_B_foot.blend`; plus post-hoc amendment B1 `bv9_candidate_B1_foot_ytrans.blend`)

Study: bv9 controlled correction study v1 (task t126u; research only, NOT approval to modify or replace bv9). Date 2026-11-02 (America/Chicago). Units: model mm (1 Blender unit = 1 m; figure 244.8 mm tall; real-world scale NOT VERIFIED). Frozen pre-registration: `CORRECTION_STUDY_PREREGISTRATION_FROZEN.md`.

Method = the validation's frozen method + Amendment A1, implemented by the validation scripts imported UNCHANGED (`s05_measure.py`, `refseg.py`); primary camera = baseline (bv9) cameras held fixed (geometry-only differences), secondary = calibration re-run on the candidate. Every number is `before (bv9) → after (candidate)`. Both measurement runs agree to 0 (max abs difference over all reported numbers).

## 1. Verdicts
- **B (pre-registered): FAIL.** The flat-sole correction measurably moves the sole line toward the reference (side sole-envelope mean |Δz| 4.66 → 2.16 mm) but the foot zone (side, z < −60 mm) improves only 0.69 mm (Mode F) / 0.70 mm (Mode L) against the pre-registered ≥ 1.0 mm threshold (I_F = False, I_L = False), and the toe tip lands ≈8.4 mm in front of the reference (model Y_max 31.6 vs reference 23.1–23.3 mm); under Mode L the %-of-outline-within-1 mm drops (front 61.3 → 57.2 %, side 67.5 → 64.2 %).
- **B1 (post-hoc amendment, designed after seeing B): FAIL.** Sole line now agrees (mean |Δz| 4.66 → 0.70 mm, max 12.2 → 1.4 mm) and the toe tip is at the reference position, but the whole-foot zone barely improves (Mode F 0.11 mm) and the **side ankle zone (z −75…−55) worsens from 0.85 to 3.25 mm (Mode F)** — the weight-blended ankle is sheared by the foot translation/rotation (regression flags R_F = True, R_L = True).
- Net finding: **the pitch hypothesis is supported for the sole line, but a rigid foot alignment is not sufficient** — the remaining foot-zone error (≈2.8 mm mean) is foot *volume/shape* (heel, instep, ankle height), which rotation/translation of the existing mesh cannot fix. Pitch and sole-line are measured; the "volume" interpretation is an inference from the overlays.

## 2. What was changed (copies only; foot bones, weights, topology untouched)
- **B**: per side w = clip(foot_s weight); rotate about the world-X axis through the ankle pivot (±10.0, 0.0, −62.0) mm (the locked v10 `foot_*` bone head, read only) by **+28.1 ° (toe up)** = mean of the measured bv9 sole pitches (right −28.44 °, left −27.83 °); then translate z by -9.678 mm (weighted) so the lowest vertex is z = -88.000 mm (floor landmark). 4,250 vertices moved (max 13.68 mm): foot-dominant 3,962, shin-dominant (ankle blend) 288; no vertex with zero foot weight moved.
- **B1** (`AMENDMENT_B1_FROZEN.md`, written after B was measured): B plus a Y translation of -8.591 mm (weighted by foot weights) so the toe tip (max Y of foot-weighted vertices) sits at the reference toe tip Y = 23.09 mm (mean of the Mode F / L reference extents 23.27 / 22.91).
- New BVH intersections: B 0, B1 0. Lowest vertex z: B -88.000, B1 -88.000 mm.
- The flattened foot lowers the foot by 9.7 mm relative to the unchanged shin (the baseline "tiptoe" raises the heel; keeping the sole on the floor with an unchanged ankle requires this drop), stretching the lower-shin weight blend; this is why the ankle band regresses. The v10 foot bone itself is pitched 45° (head (10,0,−62) → tail (10,26,−88) mm) — a foot flattened in the mesh no longer follows the bone axis (rig consequence NOT assessed; bones were not changed).

## 3. Orientation vs geometry vs camera (measured on bv9)
- bv9 sole-envelope pitch: right −28.4 °, left −27.8 ° (toe low, heel raised: envelope z at Y=−8 mm is −73.6 mm; at Y=16 mm −88.1 mm). Reference sole is flat (z −84.9…−87.4 mm over Y −10…22).
- Foot length: model 3D length along the sole ≈ (22.5 − (−8.2)) / cos 28.1 ° = 34.8 mm vs reference foot Y extent 34.3 mm (−11.0…23.3) → **length matches within ≈0.5 mm; the sole-line mismatch is orientation**, not foot length (measured/derived from the envelopes).
- Camera: reference toe/heel Y extents agree between Mode F and Mode L within 0.4 mm (−11.01/23.27 vs −11.07/22.91), the reference sole row is a landmark in both → the sole mismatch (up to 12 mm at the heel) is **not** a camera effect.
- Side sole envelope, z (mm) by Y — reference vs bv9 (Mode F):
| Y (mm) | reference z | bv9 z |
|---|---|---|
| -8 | -85.8 | -73.6 |
| -4 | -86.1 | -76.9 |
| 0 | -85.9 | -79.1 |
| 4 | -86.3 | -80.7 |
| 8 | -87.3 | -82.8 |
| 12 | -87.4 | -86.6 |
| 16 | -87.4 | -88.1 |
| 20 | -87.1 | -88.1 |

## 4. Measurement (before → after)
### 4.1 B — fixed baseline cameras (primary)
| view | cam | mean | p50 | p95 | p99 | max (mm) | % ≤1 mm | IoU |
|---|---|---|---|---|---|---|---|---|
| front | Mode F | 1.32 → 1.37 | 0.75 → 0.83 | 5.08 → 5.08 | 8.82 → 8.83 | 13.63 → 13.63 | 61.0 → 58.2 | 0.842 → 0.837 |
| front | Mode L | 1.38 → 1.43 | 0.58 → 0.67 | 4.36 → 4.37 | 7.14 → 7.14 | 11.76 → 11.76 | 61.3 → 57.2 | 0.820 → 0.815 |
| side | Mode F | 1.08 → 0.97 | 0.50 → 0.50 | 4.97 → 3.52 | 8.55 → 6.65 | 10.18 → 8.36 | 72.0 → 70.5 | 0.889 → 0.904 |
| side | Mode L | 1.18 → 1.07 | 0.54 → 0.58 | 4.71 → 3.13 | 9.08 → 7.00 | 10.73 → 8.75 | 67.5 → 64.2 | 0.880 → 0.895 |
| back | Mode F | 1.13 → 1.13 | 0.74 → 0.78 | 4.05 → 3.99 | 5.32 → 5.33 | 6.68 → 6.68 | 57.5 → 56.6 | 0.852 → 0.851 |
| back | Mode L | 1.59 → 1.60 | 1.26 → 1.26 | 4.59 → 4.59 | 7.77 → 7.78 | 9.93 → 9.93 | 41.4 → 40.9 | 0.803 → 0.801 |

### 4.2 B1 — fixed baseline cameras (primary)
| view | cam | mean | p50 | p95 | p99 | max (mm) | % ≤1 mm | IoU |
|---|---|---|---|---|---|---|---|---|
| front | Mode F | 1.32 → 1.37 | 0.75 → 0.83 | 5.08 → 5.08 | 8.82 → 8.83 | 13.63 → 13.63 | 61.0 → 58.2 | 0.842 → 0.837 |
| front | Mode L | 1.38 → 1.43 | 0.58 → 0.67 | 4.36 → 4.37 | 7.14 → 7.14 | 11.76 → 11.76 | 61.3 → 57.2 | 0.820 → 0.815 |
| side | Mode F | 1.08 → 1.11 | 0.50 → 0.52 | 4.97 → 4.73 | 8.55 → 8.04 | 10.18 → 9.26 | 72.0 → 70.9 | 0.889 → 0.879 |
| side | Mode L | 1.18 → 1.20 | 0.54 → 0.54 | 4.71 → 4.68 | 9.08 → 7.80 | 10.73 → 8.67 | 67.5 → 64.4 | 0.880 → 0.872 |
| back | Mode F | 1.13 → 1.13 | 0.74 → 0.78 | 4.05 → 3.99 | 5.32 → 5.33 | 6.68 → 6.68 | 57.5 → 56.6 | 0.852 → 0.851 |
| back | Mode L | 1.59 → 1.60 | 1.26 → 1.26 | 4.59 → 4.59 | 7.77 → 7.78 | 9.93 → 9.93 | 41.4 → 40.9 | 0.803 → 0.801 |

### 4.3 Calibration procedure re-run (secondary) — B1 (B in the JSON)
| view | cam | mean | p50 | p95 | p99 | max (mm) | % ≤1 mm | IoU |
|---|---|---|---|---|---|---|---|---|
| front | Mode F | 1.32 → 1.38 | 0.75 → 0.81 | 5.08 → 5.16 | 8.82 → 8.82 | 13.63 → 13.62 | 61.0 → 58.1 | 0.842 → 0.837 |
| front | Mode L | 1.38 → 1.43 | 0.58 → 0.67 | 4.36 → 4.37 | 7.14 → 7.14 | 11.76 → 11.76 | 61.3 → 57.2 | 0.820 → 0.815 |
| side | Mode F | 1.08 → 1.12 | 0.50 → 0.48 | 4.97 → 4.75 | 8.55 → 7.88 | 10.18 → 8.85 | 72.0 → 71.4 | 0.889 → 0.881 |
| side | Mode L | 1.18 → 1.20 | 0.54 → 0.54 | 4.71 → 4.68 | 9.08 → 7.79 | 10.73 → 8.67 | 67.5 → 64.4 | 0.880 → 0.872 |
| back | Mode F | 1.13 → 1.13 | 0.74 → 0.76 | 4.05 → 4.09 | 5.32 → 5.29 | 6.68 → 6.67 | 57.5 → 59.1 | 0.852 → 0.851 |
| back | Mode L | 1.59 → 1.60 | 1.26 → 1.26 | 4.59 → 4.59 | 7.77 → 7.78 | 9.93 → 9.93 | 41.4 → 40.9 | 0.803 → 0.801 |

### 4.4 Intended region — side foot zone z < −60 mm, ankle zone z −75…−55, non-foot z ≥ −60
B: | side foot zone | cam | n | mean | p50 | p95 | max | % ≤1 mm |
|---|---|---|---|---|---|---|---|
| side | Mode F | 4581 → 5174 | 2.92 → 2.24 | 2.03 → 1.68 | 8.39 → 6.44 | 10.18 → 8.36 | 37 → 35 |
| side | Mode L | 4570 → 5233 | 2.89 → 2.18 | 1.90 → 1.77 | 8.95 → 6.78 | 10.73 → 8.75 | 41 → 31 |

B1: | side foot zone | cam | n | mean | p50 | p95 | max | % ≤1 mm |
|---|---|---|---|---|---|---|---|
| side | Mode F | 4581 → 5173 | 2.92 → 2.82 | 2.03 → 2.01 | 8.39 → 7.78 | 10.18 → 9.26 | 37 → 37 |
| side | Mode L | 4570 → 5235 | 2.89 → 2.75 | 1.90 → 1.78 | 8.95 → 7.65 | 10.73 → 8.67 | 41 → 32 |

Ankle zone (z −75…−55) B / B1:
| side ankle zone | cam | n | mean | p50 | p95 | max | % ≤1 mm |
|---|---|---|---|---|---|---|---|
| side | Mode F | 2160 → 2159 | 0.85 → 1.29 | 0.59 → 0.71 | 2.41 → 3.79 | 3.18 → 4.64 | 76 → 59 |
| side | Mode L | 2152 → 2150 | 0.65 → 1.10 | 0.62 → 0.70 | 1.68 → 3.07 | 2.61 → 3.96 | 86 → 63 |

| side ankle zone | cam | n | mean | p50 | p95 | max | % ≤1 mm |
|---|---|---|---|---|---|---|---|
| side | Mode F | 2160 → 2159 | 0.85 → 3.25 | 0.59 → 3.14 | 2.41 → 8.53 | 3.18 → 9.26 | 76 → 30 |
| side | Mode L | 2152 → 2150 | 0.65 → 3.08 | 0.62 → 2.96 | 1.68 → 7.90 | 2.61 → 8.64 | 86 → 32 |

Non-foot zone (z ≥ −60): B 0.583 (before 0.583); B1 0.583 — unchanged (Mode F).

Sole-envelope deviation to reference (side, Y −8…22 mm, mean |Δz| / max |Δz| mm):
| cam | bv9 | B | B1 |
|---|---|---|---|
| Mode F | 4.66 / 12.2 | 2.16 / 17.6 | 0.70 / 1.4 |
| Mode L | 4.94 / 12.8 | 2.50 / 18.3 | 0.72 / 1.8 |

Front/back foot zone (z < −60) sym mean, Mode F: front 0.89 → B 1.20 → B1 1.20; back 1.48 → B 1.62 → B1 1.62.

### 4.5 Bands, side view, fixed Mode F camera — B1 (B in JSON)
| view | band (z mm) | sym mean (mm) | % ≤1 mm | signed outline offset L / R (mm) |
|---|---|---|---|---|
| side | feet | 4.03 → 2.21 | 20 → 50 | -7.48/-15.00 → -11.55/2.07 |
| side | ankles/shins | 0.68 → 2.09 | 86 → 59 | -0.89/-0.66 → -3.83/1.14 |
| side | knees | 0.36 → 0.36 | 97 → 97 | -0.58/-0.00 → -0.58/-0.00 |
| side | thighs | 0.30 → 0.30 | 100 → 100 | -0.08/0.18 → -0.08/0.18 |
| side | hips/crotch | 0.61 → 0.61 | 76 → 76 | 0.32/0.91 → 0.32/0.91 |
| side | waist/ribs | 0.89 → 0.89 | 50 → 50 | 0.10/-1.60 → 0.10/-1.60 |
| side | bust/arms | 1.16 → 1.16 | 53 → 53 | 0.22/-2.07 → 0.22/-2.07 |

## 5. Regression analysis
**B**
- **Mode F (fixed baseline camera):** none
- **Mode L (fixed baseline camera):** front: %<=1mm 57.2 vs 61.3 (drop>3 pts); side: %<=1mm 64.2 vs 67.5 (drop>3 pts)

**B1**
- **Mode F (fixed baseline camera):** side ankle zone z-75..-55 sym mean 0.85->3.25 (>+0.5)
- **Mode L (fixed baseline camera):** front: %<=1mm 57.2 vs 61.3 (drop>3 pts); side: %<=1mm 64.4 vs 67.5 (drop>3 pts); side ankle zone z-75..-55 sym mean 0.65->3.08 (>+0.5)

Front/back views: overall mean changes ≤ +0.06 mm (B) / +0.06 mm (B1) in Mode F (front 1.322 → 1.375 / 1.375; back 1.125 → 1.133 / 1.133); leg bands unchanged.

## 6. Uncertainties and limits
- The reference foot is an AI-style wireframe render, perspective/camera NOT VERIFIED; the sole line is a landmark in both calibrations.
- Heel/instep volume mismatch is inferred from overlays (the model foot is a thin band; the reference foot is a thick wedge); no sculpt/volume test was run.
- Foot weights are linear-blend; a different pivot or weight-aware deformation could move the shear elsewhere. Not explored (one variable at a time).
- B1 was designed after B's result and uses reference landmarks (toe tip) from the same reference; it is post-hoc and not a pre-registered result.

## 7. Files
B `/workspace/blendbro/out/bv9_correction_study_v1/candidates/bv9_candidate_B_foot.blend` sha256 `6ee9b5964a2a9d59665aa49476bb83f9f4e5a6ee93e4f08fc1e7f110af7cc45f`; B1 `/workspace/blendbro/out/bv9_correction_study_v1/candidates/bv9_candidate_B1_foot_ytrans.blend` sha256 `f7d11773b27bfbcd22537302f5586df122be603e04f2502b0df281c8bf18564c`; parameters `data/candidate_B_build.json`, `data/candidate_B1_build.json`; measurements `data/measure_run1.json` (key `B`), `data/measure_b1_run1.json` (key `B1`) and their run-2 repeats; overlays `overlays_publishable/candB_*`, `candB1_*`.
