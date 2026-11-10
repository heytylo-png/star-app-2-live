# Tripo preview rig vs locked v10 rig: joint-by-joint (Issue #177)

Evaluator: Claude. Date: 2026-11-10. **Research only.** Both inputs were read only; nothing was modified. Nothing here is approved for production. The user decides. This supersedes `research/issue-177-v10-proportions-prelim` @ `5624f80`, which used conversation values.

## Inputs (user uploads; NOT committed, protected v10 assets)

| File | SHA-256 | Bytes |
|---|---|---|
| `star_rai_locked_final_v10_blender_bones.json` | `eab1839c7eb4d05b6e7c8a98527d40a6a88e5679c12b249e87aff65bdb686c05` | 7,321 |
| `star_rai_armature_final_v10.blend` (hashed only; Blender unavailable here, zstd-compressed) | `f459ea1f14ca09d59b2cf7e227182b74d65ecfbb0271d1189045d1b5a8f0514f` | 188,616 |
| `starmodelrigpose.glb` (Tripo) | `57cb05de332adaae6271d5ba5852d5b268dab20abfd3bf4c53f92f58536229c7` | 5,662,836 |

**Not verified:** that the JSON is an exact export of the .blend (needs Blender).

## Method

- v10 is in mm, Z up, character's left at −X, and faces +Y (its foot bones point to +Y).
- Tripo is in glTF units, Y up, left at +X, and faces +Z.
- **Conversion:** Tripo axes are rotated to v10's, then scaled so shoulder-to-ankle height equals v10's (227.6 mm per unit), then shifted so the ankle midpoints coincide.
- **Joint matching:** by meaning, as listed in `scripts/v10_compare.py`. v10 attachment points stand for joints.

## Results (MEASURED)

**Arms match well.**

| | v10 | Tripo | Diff |
|---|---|---|---|
| Upper arm | 30.4 mm | 30.1 mm | −1 % |
| Forearm | 30.4 mm | 30.7 / 32.0 mm (L/R) | +1 / +5 % |
| Shoulder joints | z 100 | z 100 (by construction) | 4.2–4.6 mm off overall |
| Elbows | z 70.2 | z 72.1 | 3.6–3.8 mm off |

**Legs: lengths are close; the stance is wider.**

| | v10 | Tripo | Diff |
|---|---|---|---|
| Thigh | 47.0 mm | 51.5 mm | +9.5 % (Tripo hip joint 5 mm higher) |
| Shin | 55.0 mm | 56.2 mm | +2.2 % |
| Hip joints apart | 20.0 mm | 25.3 mm | +26 % |
| Knees apart | 20.0 mm | 30.5 mm | +52 % |
| Ankles apart | 20.0 mm | 40.9 mm | +105 % |

v10's legs go straight down; the Tripo body stands with its feet apart. That is a rest-pose difference, not a bone-length difference.

**Widths (upper body)**

| | v10 | Tripo | Diff |
|---|---|---|---|
| Shoulders | 41.1 mm | 34.0 mm | −17 % |
| Elbows | 53.0 mm | 56.6 mm | +7 % |
| Wrists | 64.9 mm | 86.0 mm | +32 % (Tripo arms angle out more) |

**Spine and head**
- **Spine:** Tripo's joints sit lower by 4–9 mm (waist 8.8 mm lower) and 4–8 mm further forward. v10 has 4 torso bones (hip, lower_waist, waist, mid/upper_chest); Tripo has Waist, Spine01, Spine02.
- **Neck and head:** v10 uses one point at z 116 for both; Tripo's neck is 4.7 mm lower and its head joint 4.0 mm higher.
- **Height:** ankle to top of head is 211.65 mm on v10 (head bone tail) and 207.7 mm on Tripo (mesh top), −1.9 %.

**Not comparable as defined**
- **Hand:** v10's hand bone is 12.6 mm; Tripo's wrist to middle-finger end is 22 mm.
- **Foot:** v10's foot bone runs 36.8 mm diagonally down to z −88; Tripo's ankle to toe base is 18 mm.

**Hierarchy**
- **v10:** 31 entries (19 bones + 12 attachment points).
- **Tripo:** 78 joints, including fingers, clavicles, twist bones, eyes, face and toes. v10 has none of these.

## Reading (proposal)

- **Overall:** at the same scale, most matched joints are within 4–11 mm on a 212 mm figure. The arm and leg lengths are close enough that Tripo animations could in principle be **retargeted** to v10 by mapping bones and transferring rotations.
- **The real differences are:**
  1. leg stance;
  2. shoulder width;
  3. spine joint spacing;
  4. hand and foot bone definitions.
- **Retargeting would need:** a rest-pose correction for the stance, and a decision on how Tripo's extra bones fold into v10's 19.
- **The earlier arm offset:** its "+20° outward" is relative to Tripo's narrower shoulders. It would need re-checking on v10's body; it does not carry over automatically.

## Limits

- Bind pose only. Rest-pose differences are mixed in with proportion differences.
- Joints are matched by meaning; v10's attachment semantics are assumed.
- The JSON field `height_mm: 66.0` doesn't match any obvious measurement; it is left unexplained.
- No weights, bone rolls or meshes compared. The .blend was not opened.

## Reproduce

`python3 -I scripts/v10_compare.py <v10 bones JSON> starmodelrigpose.glb <glbio dir> outputs/v10_compare.json` (`glbio.py` @ `19d405f`)
