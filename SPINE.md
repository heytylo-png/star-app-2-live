# Spine vs DragonBones (track #2)

**Primary: Spine.** DragonBones is documented as a free/stale fallback, not the engine we will buy toward.

Official PNG sheets remain the shipping face until a **Spine (or this repo’s cutout) runtime is proven on cut official art**. This file is the decision, the cut pipeline, and what a human still has to do in Spine Editor. Live flag: `?spine=1` (sample cutout) or `?spine=rai` (official layers — falls back to PNG if the cut pack is missing). Default URL is still the PNG puppet. 3D / Lab / `?lab=1` is **not** this path and is not mapped on.

## Recommendation

| | **Spine (primary)** | **DragonBones / LoongBones** |
| --- | --- | --- |
| Web runtime | Official `spine-ts`: `@esotericsoftware/spine-webgl`, `spine-player`, `spine-pixi-v8` — ESM, Vite-friendly, maintained 2026 | MIT `DragonBonesJS` (last npm `5.6.200` in 2018). Community `pixi-dragonbones-runtime` exists; authoring moved to LoongBones and is no longer a safe free bet |
| Editor | Spine Essential **$69** one-time (lifetime under $500k revenue). Pro **$329** if we need meshes/IK/constraints beyond Essential | DragonBones Pro was free; project is abandoned. LoongBones is a different, increasingly paid product |
| License to *ship* a runtime | Need a Spine license on the publishing entity. Evaluation of runtimes/examples is free. Do **not** vendor Esoteric code until Essential is bought | Runtime MIT — legally easy, technically stale |
| Fit for Rai | Mesh hair + pleated skirt, IK for wave/scold point, skins for mouth/brow, same bone names as live pose keys | Fine for rigid cutout; hair/skirt will look worse; format lock-in to a dead tool |
| This Vite/React app | Flagged canvas cutout **now** (no Pixi, no Spine npm). Swap in `spine-webgl` later behind the same flag | Not wired. If we ever need it: dynamic-import a Pixi 8 runtime, never default |

**Why not Pixi in this PR:** Pixi 8 + `spine-pixi-v8` is the nicest *future* Spine host, but it is a large extra engine on a budget Pages companion. The in-repo player is a Spine-*shaped* JSON cutout (bones, slots, attachments, timelines) on Canvas 2D. It is original code so we do not ship Esoteric runtimes without a license.

**Why not Live2D / After Effects / AI video:** budget + prior bans. Track #3 is Rive, stub only (`public/rive/README.md`).

## What is in the repo today

| Path | Role |
| --- | --- |
| `src/lib/cutout-runtime.ts` | Player (pose mix 380ms, talk jaw, look-at) |
| `src/lib/cutout-sample.ts` | Geometric **sample girl** — not Rai |
| `src/components/spine-stage.tsx` | Canvas stage; PNG fallback on failure |
| `src/components/presence-stage.tsx` | Query-flag switch. Default = `Puppet` |
| `public/spine/rai/skeleton.json` | Rai-oriented bone/slot stub |
| `public/spine/rai/cut-guide.svg` | Layer cut overlay (schematic, not a tracing) |
| `public/spine/rai/layers/` | Official idle cut PNGs + filename table |

`data-rai-engine` is `png-puppet` on the live body, `spine-demo` on the sample, `spine-rai` only when layers actually load.

## Pipeline: official PNG → cutout / Spine

Idle is the cut source: `public/rai/idle.png` is **1008×1792**. Most other official sheets are **720×1280**. In Spine, set the skeleton to **720×1280** (or 1008×1792 and scale uniformly). Hip origin stays ~**72%** down the figure (same as `[data-rai-rig]`).

### Layers to separate (from idle)

Punch studio-white to alpha first. Overlap joints 8–16px so rotates do not flash gaps. **Do not** reuse Expo `mouth_*.png` / `face_eyes_*.png` (bust crops).

1. **hair_back** — nape + behind shoulders  
2. **ahoge** — antenna curl; pivot on the scalp  
3. **hair_front** — bangs + cheek strands (draw order above face)  
4. **head** — cranium + eyes + ears; **no** jaw/mouth  
5. **brow** — rest scowl vs later skins (scold / shy / pout)  
6. **jaw / mouth_closed** — idle frown  
7. **mouth_open** — taken from `talk_official.png` on the **same** head frame (not Helix `idle-talk`)  
8. **neck**  
9. **torso** — white shirt, buttons; **sleeves cropped off**  
10. **bow** — red ribbon, own bone  
11. **upper_arm_r / forearm_r / hand_r** — her **right** = viewer left = **wave + scold point**  
12. **upper_arm_l / forearm_l / hand_l** — her left = hip hand on wave  
13. **skirt** — rigid PNG now; **mesh in Spine** (pleats)  
14. **thigh_l / thigh_r** — tuck under skirt  
15. **calf_l / calf_r** — include navy socks (or split sock later)  
16. **foot_l / foot_r** — loafers  

Extra hand drawings when the idle fist is wrong: **wave** (open palm), **scold** (foreshortened point). Those are attachment swaps, not new skeletons.

`scold` ≠ `shy` ≠ `pout`: same body bones; different **head/brow/mouth** skins + arm pose. Kiss stays unmapped — no sheet, no bones.

### Bone list (idle / talk / wave / scold / pout / shy)

Names match `public/spine/rai/skeleton.json` and the sample girl.

| Bone | Parent | Idle | Talk | Wave | Scold | Pout | Shy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `root` | — | place | | | | | |
| `hip` | root | weight shift | slight bob | plant | wider stand | plant | plant |
| `torso` / `chest` | hip → torso | breathe scale | breathe | twist toward waving arm | lean in | small twist | close / hunch |
| `bow` | chest | follow chest | | | | | |
| `neck` / `head` | chest → neck | look-at | look-at | tilt to waving side | chin forward | tilt ~8° | down / away |
| `jaw` | head | closed | amplitude + viseme | closed unless talking | open (scold mouth skin) | closed pout skin | closed |
| `brow` | head | rest | rest | rest | knit | down | up/worried |
| `hairBack` / `hairFront` | head | follow | | | | | |
| `ahoge` | head | extra sway | extra | extra | stiffer | droop | extra |
| `shoulderR` → `handR` | chest | hang | hang | **raise + flap** | **point at camera** | hang in | cover / in |
| `shoulderL` → `handL` | chest | hang | hang | **on hip** | on hip | hang in | cover / in |
| `skirt` | hip | follow hip | | | | | |
| `thigh*` / `calf*` / `foot*` | hip | planted | planted | planted | slightly wider | planted | planted |

IK (Spine Pro or Essential depending on version): arm R two-bone IK for wave/scold. Optional leg IK later. Not required for the first idle.

### Tools

| Step | Tool | $ |
| --- | --- | --- |
| Punch white / cut layers | [Photopea](https://www.photopea.com/) or Krita / GIMP | 0 |
| First playable rig **in this app** | Drop PNGs into `public/spine/rai/layers/` (filenames in that README). `?spine=rai` uses the in-repo player | 0 |
| Production rig | **Spine Essential** — import layers, bind, animate, export JSON + atlas 4.2 | 69 |
| Meshes / constraints / clipping | Spine Professional if Essential cannot mesh the skirt/hair | 329 |
| Do not | Live2D Cubism, After Effects, AI video as a live body, DragonBones as a long-term authoring home | |

Free *preview* of Spine: Essential trial. Do not commit trial exports we cannot legally ship.

## What a human must do in Spine Editor next

1. Buy **Spine Essential** (one seat is enough to export + license the runtime for this app).  
2. New project, 720×1280, 1 px/unit, Y-up (we will flip or use official `spine-webgl` which expects Spine space).  
3. Import the cut PNGs as images; set pivot at each joint (shoulder on the sleeve seam, elbow mid-arm, hip on the skirt band, ankle at sock line, ahoge at scalp).  
4. Create the bone tree above. Bind images to slots. Draw order = `skeleton.json` slot order.  
5. Mesh **hair_back**, **hair_front**, **skirt** (weights to hip + torso). Rigid is OK for v1 if time is short.  
6. Skins: `mouth_closed` / `mouth_open`; later `brow_rest` / `brow_scold` / `brow_shy` / `brow_pout`.  
7. Animate **idle** (breathe + sway, no float), **talk** (jaw + optional torso bob), **wave**, **scold**, **pout**, **shy**. Loop idle/talk. Wave can loop the flap. Match live pose ids — do not invent `kiss`.  
8. Export **JSON + PNG atlas** (Spine 4.2). Drop into `public/spine/rai/export/` (create that folder in the runtime PR).  
9. Engineering follow-up: add `@esotericsoftware/spine-webgl` **dynamic import** behind `?spine=1` / `?spine=rai`, keep PNG default, keep 3D Lab off. Copy the Spine Runtimes license notice.

`?spine=rai` now loads the idle cut pack through the in-repo Canvas player. That is still not a Spine Editor export — step 8 above is the licensed runtime path. The sample girl remains `?spine=1`. Default URL stays the PNG puppet.

## Runtime notes (web)

- **Now:** `CutoutPlayer` + Canvas. No new npm animation dependency. Bundle stays lean.  
- **Next (licensed):** `@esotericsoftware/spine-webgl` or `spine-player` (no Pixi) *or* `@esotericsoftware/spine-pixi-v8` if we already want Pixi for other effects. Dynamic import so the default PNG path does not pay the cost.  
- **GitHub Pages:** all assets static. `import.meta.env.BASE_URL` = `/star-app-2-live/`.  
- **Reduced motion:** freeze the cutout (same as PNG).  
- **Call / Chat:** pose + talking + amplitude still flow in; only the body renderer swaps.

## Track #3

Rive is later (state machine, pointer, Call amplitude → mouth). Stub: `public/rive/README.md`. Do not add `@rive-app/react-canvas` in this PR.
