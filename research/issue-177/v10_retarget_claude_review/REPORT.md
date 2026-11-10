# Independent review: v10 retarget v1 (Issue #177)

Reviewer: Claude (this session). Date: 2026-11-10. **Research only.** Reviewed `research/issue-177-v10-retarget-v1` (freeze `b560048e13f2d019b6c8c9e8b6b342902654f912`, results `798db9ff815e1c6a6b044d092c59fc5788584493`). The v10 files were read only. Nothing is approved for production; the user decides.

## 1. Verification

| Check | Result |
|---|---|
| Manifest | 9/9 OK |
| Freeze order | frozen 18:27:27Z, results 18:31:36Z (4 min); frozen file unchanged in `798db9f`. The short gap fits a numpy-only run; that no result existed before the freeze is accepted from the disclosure, not provable. |
| Method | clearly specified; bone map, dropped bones and manual choices disclosed in advance |
| Reproduction | re-ran `retarget_v10.py` twice: `retarget_result.json` SHA-256 `5b7cf225…6fc16`, identical to the committed file; pose JSON `aaa2fe73…52355`, identical to the hash in their manifest |
| v10 JSON hash | `eab1839c…6c05`, unchanged |

## 2. Independent recomputation (own FK, own segment distance, own Tripo posing)

From the per-key world rotations in the pose JSON, with forward kinematics rebuilt from the v10 JSON, segment distances by dense sampling, and Tripo directions from `collide_v2.py` @ `19d405f`:

| | Main (theirs → mine) | Variant B (theirs → mine) |
|---|---|---|
| C1 max length error | 7.8e-14 → 7.8e-14 mm | 7.8e-14 → 7.8e-14 mm |
| C2 raised keys meeting / of 22 | 19 → 19 | 22 → 22 |
| C2 highest hand point | 129.0 → 129.0 mm | 141.37 → 141.37 mm |
| C2 highest wrist | 118.02 → 118.02 mm | 129.84 → 129.84 mm |
| C3 min clearance | 2.622 → 2.622 mm (lower_arm_right\|thigh_right, 1.167 s) | 11.742 → 11.742 mm (thigh\|hip; the same minimum appears on left and right) |

**All of their numbers reproduce.**

**Arm direction vs Tripo (main method):** a constant upper arm 10.8°, forearm 16.7° (L) and 17.7° (R), the same at every key; legs 0.0°. Variant B: 0.0° everywhere. The main-method gap is **purely the rest-pose mismatch**, not error in the motion transfer.

## 3. Decisions (the user deferred to Claude)

1. **Arms get the rest correction → amendment A1** (`AMENDMENT_A1_ARMS_REST_CORRECTION_FROZEN.md`, committed at `9eacccb` before this report).
   - Scored on the existing variant B output: **C1 PASS, C2 PASS (22/22 raised keys), C3 PASS (min clearance 11.7 mm; arm-to-leg axis distance 17.9 mm).**
   - Not blind; disclosed in the amendment.
2. **C3 with body-sized radii: not with guessed radii.**
   - **What matters is clearance between the real v10 printed parts.** v10's solids exist as CadQuery STEP/STL; a 1.2 mm stick radius says nothing about them.
   - **Recommended next step:** run the retargeted poses against the v10 part meshes (STL), so clearance is measured on real geometry. This needs the v10 STL files, read only.
   - Until then, A1's C3 is a skeleton-only result.

## 4. Limits

- Same as theirs: no body mesh; keys only; no bone roll; finger, face and toe motion dropped.
- The .blend was not opened here (no Blender). Their Blender 4.5.3 read of a 5.2 file warned of possible data loss; they used only bone positions, which matched the JSON.
- Variant B makes the v10 arms follow Tripo's arm directions exactly. Where Tripo's arms passed into its own thighs, the v10 arms are only as clear as v10's narrower hips allow. Real-part clearance (point 2) is the check that matters.

## 5. Files

- `AMENDMENT_A1_ARMS_REST_CORRECTION_FROZEN.md`
- `scripts/indep_retarget_check.py`
- `outputs/indep_retarget_check.json`

Reproduce: `python3 -I scripts/indep_retarget_check.py <v10 JSON> <pose JSON from retarget_v10.py> starmodelrigpose.glb <collide_v2 dir> <glbio dir> out.json`
