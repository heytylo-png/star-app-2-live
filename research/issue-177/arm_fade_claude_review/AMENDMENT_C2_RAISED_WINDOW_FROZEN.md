# Arm fade v1, amendment A1: C2 restricted to the raised-arm keys (FROZEN)

Issue #177. Research only; Tripo preview rig only. Evaluator: Claude (reviewer). Frozen 2026-11-10. The user chose this option ("I'm fine with whatever" after the reviewer proposed option 1). The locked v10 rig is not read or modified.

## Why

The original C2 window (2.6–4.2 s) was the reviewer's specification error. At both window edges the source right arm is still hanging (27.6° and 44.1° from straight down), where the fade applies the full offset **by design**. C2 was meant to protect the raised wave, where the unfaded +20° offset moves the hand in front of the face. This amendment scores that intent.

## Disclosure (prior knowledge, important)

This is **not a blind test.** Before freezing, the reviewer knew the per-key `R_Hand` distances in `research/issue-177/arm_fade_v1/REPORT.md` @ `f2e3a43` (0.000 % H from 3.000 to 3.917 s, where w = 0). The amendment records a decision about **what C2 should measure**; it does not add independent evidence that the fade works. The original C2 result (FAIL) stands and is not rewritten.

## Amended criterion

- **C2-A1:** in `greet_02`, at every `L_Upperarm` rotation key time t where the **source** right-arm angle θ_R(t) ≥ 90° (arm at or above horizontal; θ defined exactly as in `FADE_DEFINITION_AND_CRITERIA_FROZEN.md` @ `5ab465b`), the distance between the world position of joint `R_Hand` in the faded file and in the source file is ≤ 0.5 % H (H = 0.979576).
- **C1** is unchanged.
- **Verdict A1:** PASS if C1 and C2-A1 both hold.
- **File scored:** the existing fade output, `starmodelrigpose_armfade20.glb`, SHA-256 `bc6111e72051f15b15457b259090e15a3bdd6af51adffadcb7bb2317d7bfc3fc`. It is not re-made.

## Reported, not gated

- The first and last key of the θ_R ≥ 90° set, and the number of keys.
- The original-window result, recomputed independently.
- The weight's rate of change around the transitions (2.75–3.00 s and 3.96–4.13 s). The shoulder goes from full offset to none in about 0.25 s, which may read as a jerk. This is flagged for a **visual check by the user**; it is not scored here.
