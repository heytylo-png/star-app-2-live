# Tripo GLB inspection: bikini_3d_model.glb (Issue #177)

Inspector: Claude. Date: 2026-11-09. **Research only.** Read-only inspection of a user-supplied, Tripo-generated model. It is evaluated as a possible measurement reference for bv9. It is **not** approved as a reference, and nothing here authorizes a production change. **The GLB itself is not committed** (62.5 MB third-party generated binary; handoff-standard asset controls).

## 1. Source and identity (MEASURED)

| Item | Value |
|---|---|
| File | `bikini_3d_model.glb`, 62,502,928 bytes, SHA-256 `b4511e3f0d6f11e21b26c7ee12fd3ad1fed06cda4783741f1b54e095f1707c02` |
| Generator | `asset.generator = "Tripo"`; AIGC label in `asset.extras` with ProduceID `66a1c105-882b-4a55-861c-6a017092e46c` |
| Structure | 1 node, 1 mesh, 1 primitive, 1 material (baseColor + metallic-roughness + normal textures, 3 images). No skin, no animation, no extensions. |
| Size | 981,701 vertices (944,200 after welding duplicates at texture seams), 1,888,611 triangles |
| Axes and units | glTF Y-up, facing +Z (toes at +Z, face to +Z in the side view). Bounding box x ±0.1367, y 0…0.9782, z ±0.0891: **normalised, no absolute scale** |

## 2. Geometry findings (MEASURED)

- **One fused surface.** After welding by position (tolerance 1e-7 to 1e-5, same result) the mesh is a **single connected piece**: 5 open edges, 7 non-manifold edges. Before welding there are 453 index-pieces, split along texture seams. **Body, hair, bikini and earrings are fused.** There is no skull under the hair, so no crown landmark exists.
- **Mirror-symmetric.** Mirroring 20,000 sampled vertices about x = 0 gives a nearest-vertex distance of median 0.04 % and p95 0.28 % of height. Both feet agree to 4 decimals.
- **Orthographic consistency.** Front (+Z) and back (−Z) silhouettes rendered from this one mesh at one scale agree at 99.8 % of pixels when mirrored; the rest is edge anti-aliasing. Any views rendered from this mesh share one camera scale by construction. That is what the image reference set could not show.
- **Feet: tiptoe pose with a phantom heel spike.**
  - Each heel is lifted about 0.056 units (**5.7 % of height**), and the sole slopes about **30.3°** from heel to ball.
  - A thin vertical spike (z −0.039…−0.027, about 1.2 % of height wide) runs from under each heel to the ground, like a stiletto heel.
  - Ground contact is the spike plus the ball/toes (z +0.063…+0.083).
  - This contradicts the barefoot, flat-footed full-body image the user shared, so it is treated as a **generation artifact**.

## 3. Inferences (INFERRED, not verified)

- **bv9's foot pitch may come from this kind of geometry.** bv9's measured sole pitch is 28.1° (correction study `5a75023`), close to this model's 30.3°, and the Star Rai v8.3 rig files are named `star_rai_tripo`. bv9's "tiptoe" foot is plausibly inherited from a Tripo-generated high-heel pose rather than intended design. This needs the bv9/v8.3 build history to confirm.
- **This model is probably not the source of the official #177 images.** The official side/back references are bald (frozen method of `9939d18`); this model has fused hair.

## 4. Suitability as a measurement reference

| Use | Suitable? | Why |
|---|---|---|
| Relative proportions of torso, arms and legs across views | **Yes, with a declared scale convention** | One mesh means one consistent scale for front, side and back. This removes the camera question. |
| Absolute scale | **No (convention needed)** | The model is normalised. Its overall height includes hair (not crown) and is raised by the tiptoe pose. A neutral convention is a **torso landmark span** (e.g. crotch to shoulder), unaffected by hair and feet. The user decides. |
| Head and crown | **No** | Hair is fused; there is no skull surface. |
| Feet and ankles | **No** | Tiptoe pose plus phantom heel spike; contradicts the source image. |
| Topology | **No** | Dense generated triangle mesh (1.9 M triangles); not a topology reference. |

## 5. Outputs

- `glb_inspection.json`: counts, bounding box, index-pieces, edges, symmetry, silhouettes, facing check
- `foot_check.json`: per-foot lower outline, ground contact and toe/heel points
- `weld_check.txt`: pieces and open edges after welding
- `silhouettes_front_side_back.png`: orthographic silhouettes rendered at one scale (front +Z, side +X, back −Z); geometry only, no texture
- `scripts/inspect_glb.py`, `scripts/weld_check.py`, `scripts/foot_check.py`: run as `python3 -I <script> bikini_3d_model.glb <out>` (Python 3, numpy, scipy, Pillow)

## 6. Decisions for the user

1. **Accept or reject this GLB as the proportion reference** for torso, arms and legs, replacing the image set for those regions.
2. **If accepted, choose the scale convention:** a torso span, or another landmark.
3. **The feet need a separate design reference.** The model's feet are an artifact, not a target.
4. **Record provenance and permissions.** Tripo terms apply. The GLB stays out of the repository unless you approve a storage method.
