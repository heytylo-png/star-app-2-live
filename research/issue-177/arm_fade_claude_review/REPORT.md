# Independent review: arm offset v1 and arm fade v1 (Issue #177)

Reviewer: Claude (this session). Date: 2026-11-10. **Research only.** Tripo preview rig only; the locked v10 rig was not read or modified. Nothing here is approved for production. The user decides.

Reviewed:
- `research/issue-177-arm-offset-v1` @ `d03d7d5e4d206f409b470818d7281c0085c49992`
- `research/issue-177-arm-fade-v1`, freeze `5ab465bd21288bf124d753a44bb8ff7ed0f67c4a`, results `f2e3a43cd005602494afe674b847c64991253118`

## 1. Summary

| Check | Result |
|---|---|
| Manifests | arm_offset_v1 15/15 OK; arm_fade_v1 12/12 OK |
| Freeze order | frozen doc committed 16:11:09Z, results 16:31:58Z; `git diff 5ab465b f2e3a43` on the frozen doc is empty |
| Script matches frozen definition | yes (θ from world −Y, source pose; smoothstep 45°→90°; `P⁻¹·Rz(±w·20°)·P·q`; in-place keyframe overwrite) |
| Reproduction | re-ran `apply_arm_fade.py` twice: output SHA-256 `bc6111e72051f15b15457b259090e15a3bdd6af51adffadcb7bb2317d7bfc3fc` both times = their report; report JSON byte-identical to `outputs/apply_arm_fade.json` |
| C1 (independent, every 3rd key) | 0 new non-adjacent and 0 adjacent-far pairs: `standing_relax` 141/423 keys, `greet_02` 45/135 keys. Agrees with their 0 at every key. |
| C2 original window 2.6–4.2 s (independent) | 8 of 38 keys over 0.5 % H, max 8.595 % H at 2.625 s. **Agrees: FAIL.** |
| **Amendment A1** (`AMENDMENT_C2_RAISED_WINDOW_FROZEN.md`, frozen at `56c62f7` before these numbers) | source right arm θ ≥ 90° at 22 keys, 3.042–3.917 s; max `R_Hand` deviation **0.000 % H**. **C2-A1 holds; C1 holds → A1 verdict PASS.** |

## 2. Assessment

- **Their work is sound.** The failure of the original C2 is real, and it was caused by the window the reviewer specified, not by their implementation. Their report disclosed the risk before running and did not move the goalposts afterwards.
- **A1 is not independent evidence.** Their per-key table already showed 0.000 % H at these keys; A1 records what C2 was meant to measure (the raised wave, where the unfaded offset put the hand in front of the face). The original FAIL stays on record.
- **Exploratory, not gated:** in the narrower window 2.85–4.00 s all 28 keys are ≤ 0.5 % H (max 0.383 % H at 4.000 s).
- **`standing_relax`:** the fade is a no-op there (w = 1 at every key; arm 8°–20° from down), so its result equals the unfaded +20°.

## 3. Open item for the user (visual, not scored)

The right shoulder drops the offset fast. Hand displacement from the source goes 4.95 → 2.36 → 0.48 → 0.25 → 0.16 → 0.02 % H at 2.750 → 2.958 s (weight about 0.96 → 0 in roughly 0.25 s), and back up over 3.96–4.17 s. In playback this may read as a small snap of the shoulder as the arm starts and ends the wave. Their render (`arm_fade_v1/outputs/preview_greet_02_fade.png`) looks right at the sampled frames, but frames are too far apart to show motion. **Play `greet_02` in the faded file around 2.7–3.0 s and 3.9–4.2 s.** If it snaps, widen the fade band (for example 30°→90°) as a new frozen amendment with a fresh hip-clearance check.

## 4. Limits

- Collisions checked at every 3rd key only (their run covers every key).
- Same blind spots as `collide_v2`: creases within 0.05 H of a seam, coplanar overlaps, contacts between keys.
- No playback or motion-smoothness check.
- No comparison with the locked v10 rig (v10 JSON not on GitHub).

## 5. Files

- `AMENDMENT_C2_RAISED_WINDOW_FROZEN.md`: frozen at `56c62f7`, before any reviewer result for `greet_02`.
- `scripts/indep_check.py`: independent hand-path and collision check, using `collide_v2.py` and `glbio.py` @ `19d405f`.
- `outputs/indep_check.json`: per-key θ_R, `R_Hand` deviation, collision counts.
- `outputs/apply_arm_fade_rerun.json`: report from the re-run, identical to theirs.

Inputs (not committed): `starmodelrigpose.glb` `57cb05de…29c7`; fade output `bc6111e7…fc3fc`.

Reproduce:
```
python3 -I <arm_fade_v1>/scripts/apply_arm_fade.py starmodelrigpose.glb <glbio dir> fade.glb 20
python3 -I scripts/indep_check.py starmodelrigpose.glb fade.glb <collide_v2 dir> <glbio dir> 3 outputs/indep_check.json
```

## 6. Addendum: smoothness of the fade transitions (MEASURED, post-hoc, not gated)

Added after the user's playback (which appears to have blended both clips, so it could not isolate the wave). `scripts/smoothness.py` samples `greet_02` at 60 fps from 2.4 to 4.4 s, source vs faded:

| | Source | Faded |
|---|---|---|
| Peak upper-arm angular speed, rise (2.6–3.1 s) | 285 °/s | 326 °/s (×1.14) |
| Peak upper-arm angular speed, drop (3.85–4.3 s) | 269 °/s | 303 °/s (×1.12) |
| Peak hand speed | 1.69 H/s | 1.64 H/s |
| Peak elbow speed | 0.80 H/s | 0.70 H/s |
| Peak upper-arm angular acceleration | 5,642 °/s² at 3.833 s | 5,642 °/s² at 3.833 s (same) |

The fade adds at most 14 % to the shoulder's speed during a motion that is already fast, the hand and elbow move no faster, and the peak acceleration is the source animation's own. **No snap is measurable.** The open item in §3 is closed by measurement; a clean single-clip playback by the user is still welcome but not required.
