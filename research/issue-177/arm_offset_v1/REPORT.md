# Arm offset v1: +20° upper-arm offset on `standing_relax` and `greet_02` (Issue #177)

Evaluator: Claude. Date: 2026-11-10. **Research only.** This applies to the Tripo preview rig only. The locked v10 rig was not read, used or modified. Nothing here is approved for production.

## 1. Result

- **Applied as specified:** a constant +20° outward rotation of both upper arms about world +Z (glTF), on top of both animations. Left +20°, right −20°, about the posed upper-arm joint, as in `anim_screen_v1/scripts/offset_sweep.py`.
- **Mesh, weights and skeleton are unchanged, byte for byte.** The output differs from the input only inside the four rotation keyframe arrays of `L_Upperarm` and `R_Upperarm`.
- **Frozen test passes for both animations:** unmodified `collide_v2.py` @ `19d405f` reports 0 new intersecting pairs in all 48 sampled frames of each animation, both categories. Rig verdict USABLE, positive control detected (504), run twice with byte-identical JSON.
- **Finer screen passes:** 0 new pairs at every rotation keyframe (423 for `standing_relax`, 135 for `greet_02`; 24 per second).
- **Visual problem in `greet_02` (not a collision):** from about 3.0 s to 3.8 s the waving hand sits in front of the face. See §4. `standing_relax` looks as intended.

## 2. Input and output (GLB files not committed)

| File | SHA-256 | Bytes |
|---|---|---|
| `starmodelrigpose.glb` (input, user upload) | `57cb05de332adaae6271d5ba5852d5b268dab20abfd3bf4c53f92f58536229c7` | 5,662,836 |
| `starmodelrigpose_arm20.glb` (output; `standing_relax` first, then `greet_02`) | `72e56941cdaf453fbe5a9434847a31181d4c8b0a91ecce48ae329085dc7c4a1b` | 5,662,836 |
| `starmodelrigpose_arm20_greet02_first.glb` (test copy; animation order swapped only) | `8835789cb5843e5712e995f9f45a93b48077c893adeb98b86a3071a98ebf6fdd` | 5,662,836 |

Both outputs are reproducible from the input with the scripts here: a second run gave the same hashes.

## 3. Method

- **Edit** (`scripts/apply_arm_offset.py`): for each rotation key at time t, `q' = P(t)⁻¹ · Rz(±20°) · P(t) · q`, where P(t) is the world rotation of the upper arm's parent. The new values are written over the old ones in the binary chunk. No Blender export is involved, so nothing else can change.
- **Test copy** (`scripts/anim_first.py`): `collide_v2.py` screens only `animations[0]`. The copy moves `greet_02` to index 0 so the unmodified script screens it. The binary chunk is unchanged.
- **Verification** (`scripts/verify_offset.py`, EXPLORATORY, not frozen):

| Check | `standing_relax` | `greet_02` |
|---|---|---|
| Bytes differing from input | 14,187, all inside the 4 allowed arrays (17,856 bytes); 0 outside | same file |
| JSON chunk, POSITION, NORMAL, TEXCOORD_0, JOINTS_0, WEIGHTS_0, indices, inverse bind matrices | identical | same file |
| Max vertex distance from the `offset_sweep.py` reference, at keys | 7.2e-08 (0.000007 % H) | 5.6e-08 (0.000006 % H) |
| Same, halfway between keys | 3.2e-06 (0.0003 % H) | 1.6e-04 (0.016 % H) |
| New non-adjacent / adjacent-far pairs, every key | 0 / 0 over 423 keys | 0 / 0 over 135 keys |

Between keys the player interpolates the edited keys, so the result differs from an exact constant offset by at most 0.016 % of height.

- **Blender 4.5.3 LTS** was used only to import both files and render previews (`scripts/blender_preview.py`). Both import with 78 bones, 60,175 vertices, 78 vertex groups and both actions.

## 4. Visual finding in `greet_02` (MEASURED by render; user decides)

- A rotation about world +Z moves a hanging arm outward but moves a **raised** arm toward the midline.
- In `greet_02` the right arm is raised to wave. With the offset, the hand moves from beside the head to in front of the face at 3.0–3.8 s. See `outputs/preview_greet_02.png` (top row source, bottom row +20°).
- No geometry intersects. Minimum hand-to-head vertex distance is 9.5 % H with the offset and 8.3 % H without (`outputs/hand_head_greet_02_*.json`, every third key).
- The arms-down part of `greet_02` and all of `standing_relax` look as intended (`outputs/preview_standing_relax.png`).

**Options (proposals):**
1. Use the output for `standing_relax` only, and keep `greet_02` out of previews for now.
2. Scale the offset by how far the arm hangs down: full 20° when down, fading to 0° when raised. This needs a new sizing check, because the fade must still clear the hips.
3. Rotate about the arm's own abduction axis instead of world Z. Same caveat.

## 5. Limits

- Skin folding inside joints (armpit, elbow) is not tested; `collide_v2` excludes it by design. A 20° change at the shoulder was not checked for armpit or shoulder deformation beyond the renders.
- Coplanar overlaps are not detected.
- Contacts between keyframes are possible but unlikely at 24 keys per second.
- The offset axis is world Z, which assumes the character faces roughly +Z throughout.
- Previews are low-sample CPU renders from the front only.

## 6. Reproduce

```
python3 -I scripts/apply_arm_offset.py starmodelrigpose.glb <glbio dir> starmodelrigpose_arm20.glb 20
python3 -I scripts/anim_first.py starmodelrigpose_arm20.glb greet_02.001 starmodelrigpose_arm20_greet02_first.glb
python3 -I <collide_v2.py> starmodelrigpose_arm20.glb <glbio dir> outputs/collide_v2_standing_relax_arm20.json
python3 -I <collide_v2.py> starmodelrigpose_arm20_greet02_first.glb <glbio dir> outputs/collide_v2_greet_02_arm20.json
python3 -I scripts/verify_offset.py starmodelrigpose.glb starmodelrigpose_arm20.glb <collide_v2 dir> <glbio dir> outputs/verify_offset_standing_relax.json 20 0
python3 -I scripts/verify_offset.py starmodelrigpose.glb starmodelrigpose_arm20.glb <collide_v2 dir> <glbio dir> outputs/verify_offset_greet_02.json 20 1
```

`collide_v2.py` (SHA-256 `6a2a3ff5…1f2c`) and `glbio.py` (`b0ccd713…d29a`) are in `research/issue-177/tripo_collision_v2/scripts/` @ `19d405f`. Python 3.13, numpy 2.5.3, scipy 1.18.1.
