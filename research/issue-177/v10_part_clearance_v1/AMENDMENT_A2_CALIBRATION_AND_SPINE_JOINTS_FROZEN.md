# v10 part clearance, amendment A2: calibration without prefilter; spine and neck joints (FROZEN, POST-HOC)

Issue #177. Research only. Evaluator: Claude. Frozen 2026-11-10.

## Result of the frozen method (+A1), recorded as is

- **C0: FAIL.** Under the frozen rule this makes **C1 NOT VERIFIABLE.** That stands.
- **C0b: PASS** (forearm-into-body control: hand_right|thigh_right −0.247 mm).

## Seen before freezing this (disclosure)

- **The run-1 log's two lines:**
  - C0 FAIL; C0b as above;
  - `variant_B`: 130 of 135 keys below 1 mm, min −0.249 mm `head|seg_upper_chest` at 3.208 s; the first 10 per-key minima, all `head|seg_upper_chest`; 16 joint pairs overlapping.
- **A diagnostic re-run of the rest pose only:** the C0 rows, the rest joint-pair minima, and the rest body pairs below 3 mm.
- **Not seen:** the worst-10 body pairs, other pairs' posed values, and anything from `main`.

## Why C0 failed (design errors, not data)

1. **The prefilter skipped the calibration pairs.** It drops pairs whose posed boxes are more than 5 mm apart, but 8 of the 12 README calibration values are 5.46–16.64 mm, so they returned no measurement.
2. **The comparison used the conservative value.** C0 compared d_s − h with the README's exact distance. d_s ∈ [true, true + h], so the measured values sat 0.244 mm low: 1.506 vs 1.750, 1.954 vs 2.199, 4.771 vs 5.015, and 1.75 vs 2.000 for all 10 limb gaps.

## Why C1 counts the wrong pairs (design error)

- **Adjacent spine segments, and the head with the top chest segment, meet at joints.** Each pair sits about 1.6 mm apart across a marker or the neck at rest, and the spine and neck bend between them by design.
- **The README's intended-contact list names the segment–marker contacts but not these segment–segment pairs**, so the frozen pair classes treated them as body pairs.

## Changes

1. **C0:**
   - The 22 calibration pairs are measured **without the prefilter**.
   - The upper bound d_s is compared with the README value, tolerance ±0.30 mm as before.
   - C0b is unchanged.
2. **Joint pairs** (reported in C2, not gated in C1) **gain:** `seg_hip|seg_lower_waist`, `seg_lower_waist|seg_waist`, `seg_waist|seg_mid_chest`, `seg_mid_chest|seg_upper_chest`, `head|seg_upper_chest`.
3. **Unchanged:**
   - h, the reported clearance d_s − h, the 1.0 mm C1 threshold, the prefilter for C1/C2, the mapping, the poses and the keys.
   - The original C0 FAIL and the frozen-method verdict stay on record.

**This amendment is post-hoc and the A2 result is not blind.** It fixes test-design errors found by the failed calibration.
