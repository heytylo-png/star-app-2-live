# v10 retarget v1, amendment A1: arms get the rest-pose direction correction (FROZEN)

Issue #177. Research only. Reviewer: Claude. Frozen 2026-11-10. The user left the choice to Claude ("I have no opinion").

## Change

The **variant B** method in `research/issue-177/v10_retarget_v1/RETARGET_METHOD_AND_CRITERIA_FROZEN.md` @ `b560048` becomes the main method:
- `upper_arm`, `lower_arm` and `hand` get the same rest-direction correction C_b as the legs.
- Everything else stays the same: the bone map; C1, C2 and C3 with the 1.2 mm radius; the exclusions; the axis map; the scale.

## Why

- **The main-method arm error is a constant rest-pose mismatch, not motion.** The deviation from Tripo's directions is the same at every key: upper arm 10.8°, forearm 16.7° (L) and 17.7° (R).
- **It is caused by the two rest poses** (Tripo's arms angle out more), exactly the case the legs were already corrected for.
- **Treating arms and legs the same is the consistent choice.**

## Disclosure (not blind)

Variant B's C1–C3 values were already computed and published at `798db9f`, and the reviewer re-derived them independently before freezing this. This amendment records a **method decision**. It is not new evidence. The original main-method results stay on record.

## Verdict rule

A1 is scored on the existing variant B output (pose JSON SHA-256 `aaa2fe73a01806d0ed896d05fa1559ce7d9c452eb62b271235dd76610ad52355`, `variant_B` section), per criterion, as in the frozen file.
