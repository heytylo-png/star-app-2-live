# Star Rai: from image to a rigged 3D model

This guide turns the 2D Star Rai reference into a rigged, poseable 3D character, and exports it as `.glb`, `.fbx` for Unity, `.fbx` for Unreal, and optionally `.vrm`.

The pipeline: **image prep → Tripo (image to 3D) → Blender cleanup → AccuRIG (body rig) → Blender extra bones → shape keys → export.**

The scripts in this folder automate the Blender steps. They are written for Blender 4.2 LTS through 5.0 and were tested headless on 5.0.1.

| Script | Step | What it does |
|---|---|---|
| `sr_cleanup.py` | 2 | Removes debris and floating islands, scales to real height, centres the model, merges vertices, fixes normals, decimates, smooth-shades |
| `sr_materials.py` | 2 | Rebuilds materials so they export cleanly, adds a toon preview, gives the earrings a gold material |
| `sr_secondary_bones.py` | 3 | Adds breast, back hair, side lock and ahoge bones, and weights them |
| `sr_shape_keys.py` | 4 | Adds named facial shape keys (VRM and ARKit names) and splits keys into left and right |
| `sr_export.py` | 5 | Checks the rig and exports GLB, FBX for Unity and FBX for Unreal |

Each script runs from the Blender Text Editor (edit `CONFIG` at the top, then Run Script) or from the command line:

```bash
blender -b in.blend --python sr_cleanup.py -- --height 1.65 --save out.blend
```

---

## 0. Prepare the input image first (the biggest quality lever)

Image-to-3D tools invent everything they can't see. A single front-facing image with arms down gives a guessed back, arms fused to the hips, and hair melted into a slab. Spend 15 minutes here before generating anything:

1. **Make a turnaround** with an image model that supports character references (GPT image, Gemini image, Flux Kontext, Midjourney `--cref`, etc.). Example prompt:
   > character turnaround sheet of this exact character, front view, left side view, back view, full body, **A-pose (arms 30–45° away from body, palms down)**, legs slightly apart, neutral expression, mouth closed, flat even lighting, no shadows, plain white background, same outfit, same hair, gold star earrings
2. **Check each view for consistency:** long black hair with soft bangs, the single upright ahoge, amber eyes, star earrings, black triangle top and side-tie bottoms. Fix any errors by inpainting.
3. **Crop each view** to its own square image, 1024–2048 px, with the character filling about 85% of the height and nothing cut off.
4. **Flat lighting matters:** any shadow in the image gets baked into the texture.
5. **Keep a gap** between the arms and torso, and between the hair and the arms. That gap is what stops the generator from fusing them.

---

## 1. Image to 3D: recommended tool order

### First choice: **Tripo** (Tripo Studio, newest model)
- It currently gives the cleanest stylized/anime geometry of the mainstream tools, with smooth surfaces and crisp hair silhouettes.
- It accepts **front, side and back images** as input, which fixes the guessed back.
- It can output **quad topology** with a face limit, which deforms much better when rigged than triangle soup.
- It has **part segmentation**, which lets you split the hair from the body. That saves the hardest manual job in step 3.
- Retries are cheap, so you can generate 3–4 versions and keep the best.

### Second choice: **Meshy** (newest model)
Use it if Tripo merges the arms or hair. Meshy has explicit **A-pose** and **Symmetry** options and a built-in quad remesh with a target polycount. Its faces are sometimes softer than Tripo's.

### If the face or hair detail is poor: **Rodin (Hyper3D, Gen-2)**
It gives the highest geometric fidelity, especially on faces, and has a quad mode. It costs more per generation, and its output tends to need more decimation.

### Skip Luma for this
Luma Genie is fine for props but behind the others on stylized characters.

Use these tools' built-in auto-rigs only as a quick preview. They don't give finger, breast or hair bones.

### Tripo settings
Option names change between releases. Match these by meaning, not exact label.

| Setting | Value | Why |
|---|---|---|
| Model version | Newest available | Each version improves a lot |
| Input | **Multiview**: front + side + back from step 0 | Fixes the guessed back and the hair volume |
| Pose / T-A pose (if offered) | **A-pose** | Better shoulder deformation, and AccuRIG prefers it |
| Texture | On, **HD / 4K / Detailed** | The face and eyes need the resolution |
| PBR | **Off** (base color only) | Anime is flat shaded, and PBR adds fake metal and roughness |
| Geometry quality | Highest (Detailed / Ultra) | |
| Topology | **Quad** | Rigging needs clean edge flow |
| Face limit | **40k–60k** for PC/console/Blender, **15k–25k** for mobile/VR | |
| Auto size / real scale | On | `sr_cleanup.py` rescales anyway |
| Part segmentation | Run it, then export the hair as its own mesh if it separates cleanly | |
| Export | **GLB** (embedded textures) | |

**Meshy equivalents:** Image to 3D, multi-image input, Symmetry **On**, A-pose **On**, Topology **Quad**, target polycount 50k, texture on, PBR off, highest texture resolution, export GLB.

**Choosing between generations:** take the one with a clean face, open space under the armpits, separated fingers (or at least separated thumbs), a gap between the legs, and hair that doesn't touch the shoulders or arms. Hair detail can be fixed later. Fused limbs are much harder to fix.

---

## 2. Cleanup and optimization in Blender

1. **Import:** File → Import → glTF (`.glb`).
2. **Run the cleanup script.** It removes floating confetti first, then scales to 1.65 m, puts the feet on the floor, centres the model, merges vertices, fills small holes, recalculates normals and smooth-shades:
   ```bash
   blender -b --python sr_cleanup.py -- --import-path tripo.glb --height 1.65 --target-tris 60000 --save 01_clean.blend
   ```
   Add `--symmetrize` only if the model is already close to symmetric. It mirrors her left side onto her right, so check the ahoge and earrings afterwards.
3. **Inspect and fix by hand in Sculpt Mode.** Smooth, Grab and Crease are enough:
   - Pull apart fused armpits, inner thighs and fingers.
   - Flatten the nose bridge. AI gives anime faces a realistic nose bump, and anime noses are almost flat.
   - Sharpen the edges of the bikini with Crease.
4. **Separate the hair** if Tripo didn't: in Edit Mode select the hair (L to select linked, or box select plus Ctrl +/−), then **P → Selection**, and name the result `Hair`. Do the same for the earrings, or select their faces and run `sr_materials.py --gold-from-selection`.
5. **Fix materials:**
   ```bash
   blender -b 01_clean.blend --python sr_materials.py -- --mode export --save 02_mat.blend
   ```
   Add `--mode toon` for a cel-shaded look in Eevee. The export script swaps the export materials back automatically.
6. **Retopologize only if needed.** Tripo or Meshy quad output at 40–60k is usually good enough to rig. Retopo if the mesh is triangle soup, has spiral edge flow around the shoulders, hips or knees, or you need under 20k triangles.
   - **Quad Remesher** (Exoside, paid). This is the best automatic option. Settings: about 15–25k quads, Adaptive Size 50%, symmetry X on. Paint guides around the eyes, mouth, shoulders and hips.
   - **Blender's built-in QuadriFlow** (Object Data → Remesh → Quad), free. It works acceptably on the body but badly on the face.
   - **Instant Meshes** (free, standalone) is another free option.
   - **RetopoFlow 4** (manual) is for a hand-built face loop layout if you need good facial animation.
   - After any retopo, **bake the texture back** from the original: select the original, then Shift-select the retopo mesh. Cycles → Bake → Diffuse (Color only) → Selected to Active, with extrusion around 0.01 m.
7. **Paint out baked shadows** with Blender Texture Paint, Krita or Photoshop. Watch the neck, under the breasts, the armpits and the hair underside. For a sharper face, project-paint the original 2D face onto the model (Texture Paint → Clone/Projection from the reference image).

---

## 3. Rigging

### Recommendation: **AccuRIG** for the body, then `sr_secondary_bones.py` for breasts, hair and ahoge

| Option | Verdict for this character |
|---|---|
| **AccuRIG (Reallusion, free)** | **Best free choice.** It handles stylized proportions, rigs all five fingers, produces good weights, and has export presets for Blender, Unity and Unreal. It is also compatible with the ActorCore and Mixamo motion libraries. |
| Auto-Rig Pro (Blender, paid) | **Best paid upgrade** if you'll animate inside Blender. It has a great IK/FK control rig, Smart auto-placement, a game-engine export that strips control bones, and a retargeting tool. |
| Mixamo | Good for a fast motion test only. Its skeleton is fixed and has no breast or hair bones, its wrist and shoulder weights are often poor, and it needs an Adobe login. |
| Rigify | Great for animating in Blender, but exporting it to game engines needs extra work. Not worth it here. |

### AccuRIG steps

1. **Export from Blender** in the A-pose, feet at the origin, at real scale. Select the body (plus the hair and earrings meshes), then File → Export → **FBX** with: Selected Objects, Apply Transform on, Forward −Z, Up Y. AccuRIG binds every mesh you give it.
2. **AccuRIG → Import** the FBX. If it looks tiny or huge, re-export at 1.65 m (the cleanup script already set this).
3. **Rig Body:**
   - Turn **Symmetry** on.
   - Place the guide markers: chin, wrists, elbows, knees and groin. Put the wrist markers at the joint, not the cuff. Put the groin marker at the crotch line, not the bikini tie height.
   - Generate.
4. **Rig Hand:** set the finger count to 5 (lower it if the fingers are fused), place the knuckle markers, and generate.
5. **Check the result:** open the motion preview and play a few clips, including arms up, squat and walk. Look at the armpits, the hips and groin, and the hair falling through the shoulders (the next step fixes that).
6. **Export FBX** with the **Blender** preset and T-pose or A-pose matching how you modelled. Leave "export motion" off.
7. **In Blender:** Import → FBX, with **Automatic Bone Orientation** and **Ignore Leaf Bones** on.

### Breast, hair and ahoge bones

**First make a hair mask:** either keep the hair as a separate object (step 2.4), or select the hair vertices and assign them to a vertex group called `HairMask`. The bikini is the same black as the hair, so the script can't guess which vertices are hair.

```bash
# Place the bones and weight them:
blender -b 03_rigged.blend --python sr_secondary_bones.py -- --hair-mesh Hair --save 04_bones.blend
# Check the bone positions in Edit Mode and move heads/tails as needed, then re-weight only:
blender -b 04_bones.blend --python sr_secondary_bones.py -- --hair-mesh Hair --weight --save 04_bones.blend
```

The script creates:
- **`Breast_L` / `Breast_R`**, parented to the chest bone (it detects AccuRIG `CC_Base_Spine02`, Mixamo, Auto-Rig Pro and Rigify names). Each gets a smooth radial falloff that is taken out of the chest weights. If AccuRIG already made breast bones, it keeps them.
- **`Hair_Back_N_*`**: 5 chains of 4 bones each down the back hair.
- **`Hair_Side_L/R_*`**: 3-bone chains for the front side locks.
- **`Ahoge_1..3`**: the upright strand.

Hair vertices lose any spine or shoulder weights the auto-rigger gave them. They are weighted to the nearest chain segment and blend into the head bone at each chain's root. Weights are then cleaned, limited to 4 influences per vertex and normalised.

### Tuning the deformation

Use **Weight Paint mode** with a test pose. Pose mode → rotate the bone → check → Alt+R / Alt+G to reset.

**Breasts**
- Raise both arms to 160°. If the breast stretches up towards the armpit, smooth the `Breast_*` weights at the outer edge and add a little `upperarm` weight to the outer side boob.
- Bend the spine forward 30° and check there's no creasing in the cleavage. Use the Smooth brush with low strength over the chest bone weights.
- Jiggle comes from physics in the engine, not from more bones: VRM SpringBone or Magica Cloth 2 in Unity, Kawaii Physics in Unreal, the Wiggle 2 add-on in Blender. Use high stiffness (about 0.7) and low gravity.

**Hips and thighs (the bikini line)**
- Squat test: rotate the thigh 90° forward. If the groin collapses, split the weights roughly 50/50 between pelvis and thigh across about 4 cm of the crease, and use the **thigh twist** bones AccuRIG provides for the twisting part.
- Weight the bikini side ties mostly to the pelvis (about 70%) so they don't stretch with the leg.
- For hero shots, add a **corrective shape key** (`thigh_up_L`) driven by the thigh rotation. Unity, Unreal and GLB all carry shape keys, but you have to recreate the driver in the engine.
- The Blender-only fix is **Preserve Volume** on the Armature modifier, which is dual quaternion skinning. Engines use linear skinning, so test without it.

**Hair**
- Keep chains parented to the **head**, never to the neck or spine.
- Add colliders in the engine on the head, neck, upper arms and chest so long hair doesn't pass through the body.
- Set the ahoge to very stiff (about 0.9) with zero gravity, so it bobs but stays up.
- The bangs usually don't need bones. Weighting them 100% to the head keeps the face silhouette stable.

**Earrings:** weight them 100% to the head (or the ear bone, if one exists). Make them a separate object and parent them to the head bone if you want them to swing with a spring bone.

---

## 4. Facial setup (optional)

AI meshes paint the eyes and mouth onto the texture, so there are no eyelids or mouth interior to rig with bones. **Use shape keys.**

```bash
blender -b 04_bones.blend --python sr_shape_keys.py -- --create --save 05_face.blend          # add --arkit for iPhone face capture
# Sculpt "blink", "aa", "happy", etc. (select the key in Object Data → Shape Keys, then Sculpt Mode)
blender -b 05_face.blend --python sr_shape_keys.py -- --split-lr --save 05_face.blend         # makes blinkLeft/Right and happyLeft/Right
```

- The key names match the **VRM 1.0 expression presets**, so the VRM add-on and three-vrm map them automatically.
- **Better eyes:** delete the painted eye area, add two UV spheres textured with the amber iris, and parent each to a new `Eye_L` / `Eye_R` bone under the head. This gives real eye look-at. Alternatively, keep the painted eyes and swap textures or UV offsets in the engine, the way anime games usually do.
- **Mouth:** to get visible lip sync, sculpt a small mouth opening, paint the interior dark, and weight the lower lip area to a new `Jaw` bone. Or swap mouth textures.

---

## 5. Export

```bash
blender -b 05_face.blend --python sr_export.py -- --out ./export --glb --fbx unity --fbx unreal
```

Before exporting, the script restores the export materials, resets the pose to rest, applies mesh transforms, limits weights to 4 per vertex and normalises them. It warns about armature scale that isn't 1 and about vertices with no weights.

| File | Settings used | Use in |
|---|---|---|
| `StarRai.glb` | GLB, Y up, skins, shape keys (with normals), deform bones only, modifiers applied | Web / three.js, Godot, Blender, VRM tools |
| `StarRai_unity.fbx` | FBX Scale All (1 m = 1 unit), −Z forward / Y up, deform bones only, no leaf bones, textures embedded | Unity: Rig → **Humanoid**, configure avatar. Hair and breast bones stay unmapped, which is expected. |
| `StarRai_unreal.fbx` | Same, but with no FBX scale and the armature temporarily named `Armature` so UE doesn't add an extra root bone | Unreal: import as Skeletal Mesh, then retarget to Manny/Quinn with IK Retargeter |

**VRM (recommended for anime avatars, VTubing, VRChat-style apps):** install the **VRM Add-on for Blender** from extensions.blender.org. Then:
1. Assign the humanoid bones (auto-detect works on the AccuRIG skeleton).
2. Add spring bone chains for `Hair_*`, `Ahoge_*` and `Breast_*` with colliders.
3. Link the expressions; the shape key names already match.
4. Export `.vrm`. It carries the physics and expressions, which FBX and GLB can't.

**Manual export, if not using the script:**
- **GLB:** File → Export → glTF 2.0. Format GLB, Limit to Selected, Include: Skinning + Shape Keys, Data → Armature: Export Deformation Bones Only, Apply Modifiers on.
- **FBX:** File → Export → FBX. Selected Objects, Object Types Armature + Mesh, Apply Scaling "FBX All" for Unity, Forward −Z / Up Y, Armature: Add Leaf Bones **off**, Only Deform Bones **on**, Bake Animation off, Path Mode Copy + Embed Textures.

---

## Common problems with AI-generated anime characters

| Problem | Cause | Fix |
|---|---|---|
| Back of the body or hair looks invented or lumpy | Front-only input | Multiview input from step 0 |
| Arms fused to the torso, mitten hands | Arms down in the reference, no gap | A-pose input; sculpt the gap; set AccuRIG's finger count to match |
| Hair is a solid helmet or slab, webbed to the shoulders | Generators can't make thin strands | Sculpt a gap and separate it, or **rebuild the hair** with Blender hair curves → Convert to Mesh strips. Anime hair is clumps, which is easy to model by hand. |
| Ahoge missing or too thick | Too thin for the generator | Model it: a Bezier curve with bevel and taper, converted to mesh, joined to the hair, then re-run `--place` |
| Shadows baked into the skin | Lit reference image | Flat-lit input; paint them out; toon material |
| Plastic or metallic skin | Generated PBR maps | `sr_materials.py --mode export` (metallic 0, roughness 0.6) |
| Blurry eyes and face | Texture resolution spent on the whole body | Highest texture setting; project-paint the 2D face; real eye spheres |
| Realistic nose, mouth or cheek bumps | The AI has a realistic bias | Flatten in Sculpt mode; anime faces are nearly flat with a small nose tip |
| Bikini is part of the skin | Single fused mesh | Fine for games. For cloth sim, duplicate the faces, solidify 2 mm and separate. |
| Floating bits around the hair and fingers | Reconstruction noise | `sr_cleanup.py` removes islands under 30 faces (`--min-island-faces`) |
| Dark patches or flipped shading | Inverted normals, duplicate vertices | `sr_cleanup.py` (merge plus recalculated normals) |
| Character is tiny or huge in the engine, or a 100× root scale | Units | Scale in `sr_cleanup.py`; the FBX settings in `sr_export.py` |
| Hair moves with the shoulders | Auto-rigger weighted the hair to the spine | `sr_secondary_bones.py` removes those weights inside the hair mask |
| Unity "too many bone influences" or jitter | More than 4 weights per vertex | `sr_export.py` limits to 4 |
| Extra root bone in Unreal | Armature object not named `Armature` | Handled by `--fbx unreal` |
| Lopsided model | Generator asymmetry | `--symmetrize`, then re-add the asymmetric details |

---

## Alternative if the AI result disappoints: VRoid Studio

If you need the cleanest possible anime result with full expressions, rebuilding Star Rai in **VRoid Studio** (free) often beats cleaning up an AI mesh:
- You get real hair strands with physics, about 50 facial blendshapes, a correct humanoid rig, and VRM export.
- Use the reference sheet from step 0 and the Tripo model as visual guides.
- This takes a few hours and gives a lower-detail but much cleaner rig.
- A hybrid works well too: a VRoid body and face, with a texture painted from the AI model.
