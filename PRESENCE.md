# Presence (PNG shipping + Lab WIP)

Star occupies one stage slot. Two renderers share it:

| Mode | Component | When |
| --- | --- | --- |
| **PNG** (default, shipping) | `src/components/puppet.tsx` | Live body on main / GitHub Pages |
| **Lab** (preview only) | `src/components/toon-presence.tsx` | WIP mesh — **not shipping Rai** |

Chat, Call, talk, memory, and Helix acts are unchanged.
`rai-app.tsx` still drives `pose`, `emotion`, `talking`, and `amplitude`.
`Presence` picks the renderer. A Lab load failure falls back to PNG.

**Do not merge Lab to main as the default body** unless the mesh is clearly her.
**Do not load** `public/models/scaffolding/sairi-ponytail.vrm` as Star.

## Toggle

Header control: **PNG | Lab**. Stored in `localStorage` key `star-rai-presence-v2`.

- Legacy `star-rai-presence` (`toon` / `png`) is ignored so testers are not stuck on the old Sairi scaffold.
- `?lab=1` opens Lab for that load (does not write storage). `?lab=0` forces PNG.
- `?lab=1&wip=scold` (also `talk` / `wave` / `pout` / `shy` / `idle`) pins that Lab still. Kiss is not a pin.

Lab shows a badge: **WIP mesh · not Rai**.

## Canon locks (modeler bible)

Ground truth: `public/rai/idle.png` + `artifacts/star-rai-canon/00-brief.txt`.

| Lock | Spec |
| --- | --- |
| Earrings | Gold **star studs** (one per ear). Not hoops, dangles, or pearls. |
| Collar | Pointed **button-up blouse**. No sailor collar / fuku scarf. |
| Idle face | **Glare** — half-lidded amber, slight frown. Not a cute smile. |
| Skin | Warm tan / light brown. |
| Hair | Messy mid-length black, collarbone / upper chest. One hooked ahoge from crown. |
| Eyes | Amber-gold. |
| Bow | Red **front** bow under the collar. None on the back. |
| Buttons | Five gold buttons on the placket. |
| Cuffs | Navy band + **two** thin white stripes. |
| Skirt | Navy pleats, mid-thigh, **two** white hem stripes all around. |
| Socks | Navy, ribbed, mid-calf / just-below-knee. |
| Shoes | Brown penny loafers. |
| Kiss | **Unmapped.** Do not sculpt, map, or render kiss / blow-kiss / heart-hands. First expression set is checked in under `artifacts/star-rai-canon/` (idle + talk/wave/scold/pout/shy). |

## Lab mesh

`public/models/star-rai-wip.glb` — authored toon stand-in (`npm run build:wip-mesh`).

- Humanoid groups: hips → spine → chest → neck → head, plus arms/legs.
- Hair is hanging layered cards (not a beret / capsule cap). Idle rest is a hanging **A-pose** with the idle **glare**.
- Blink: `lidLeft` / `lidRight`. Talk: `mouthOpen` (idle frown hides while talking).
- Mood slots: glare / talk smile / smirk / grit / pout / shy mouth + extra shy blush. Wave uses `handWaveR` (palm); scold uses `handPointR` (index). Kiss is not a slot.
- Lab keeps the exported `MeshStandardMaterial` (toon gradient swap blanked the stage).
- Path constant: `WIP_GLB_FILE` in `src/lib/vrm-rig.ts`.

This is an honest low-poly WIP. It is meant to be **Star-shaped** (locks above), not another booth schoolgirl.

### Remaining gaps

HARD STOP head reset is **not signed off**. The one grid-off still is still a clay stand-in, not Rai. **Stopped. Do not add verts. Do not start clothes.** Do not merge. Do not deploy Lab to Pages as her.

- Pipe neck is gone (chin sits on the frozen collar). Open temples, hooked ahoge, tiny gold studs, flat frown, warm tan. No idle blush circles.
- Eyes are large amber discs aimed at the gold circles on `11-face-grid.jpg`, not the old slits. They still read as round clay ovals, not the PNG half-lid glare.
- Hair is six collarbone locks + ahoge. Crown flashes scalp. Not messy layered hair.
- Body/clothes/bow/hands/shaders/lighting frozen. Kiss stays unmapped.
- ¾ / side / back / talk / wave / scold / pout / shy stills stay hidden until this head is signed off.

## Scaffolding (do not present as Rai)

`public/models/scaffolding/sairi-ponytail.vrm` is leftover pipeline scaffolding
(Sairi Ponytail, CC BY-SA — see `public/models/ATTRIBUTION.md`).
**Not loaded** by Presence. Do not rename it back to a shipping path.

## Pose map (Lab)

Helix keys stay the PNG contract (`POSING.md` / `src/lib/rai.ts`).
Lab approximates what the WIP armature can act:

**scold ≠ shy ≠ pout.** Never alias those three. **Kiss stays off** — do not sculpt, map, or render kiss / blow-kiss / heart-hands as a default.

| Key | Body | Face |
| --- | --- | --- |
| `idle` | Arms down, feet parallel | Half-lidded amber glare, flat/slight frown |
| `talk` | Same stance as idle | Open-mouth smile with teeth |
| `wave` | R palm up at head height, L hand on hip | Small closed-mouth smirk |
| `scold` | R index point, L on hip | Grit / shout, furrowed brows |
| `pout` | **Crossed arms** | Narrowed glare frown — not shy |
| `shy` | **Fidget hands at waist**, look down | Heavy blush, averted — not crossed arms |
| `think` | Hand near chin | Glare rest |
| `point` | Pointing arm only (not scold) | Glare rest |
| `hearts` | Not acted in Lab (PNG prop sheet only — no heart-hands) | Glare rest |
| `turn` / `profile` / `three_quarter*` | Body yaw only (~¾, not 180°) | Glare rest |
| `kiss` | **Unmapped** | **Unmapped** |

Hand-shape keys (`peace`, `middle_finger`, `hold`) still have no finger rig — Lab holds the body and does not swap in a booth VRM.

## Swap / graduate the mesh

1. Author a closer Star VRM or glTF that keeps the canon locks.
2. Replace `public/models/star-rai-wip.glb` (or point `WIP_GLB_FILE` at the new file).
3. Prefer VRM humanoid bones + presets (`happy`, `angry`, `aa`, `blink`, …) if you move back to a VRM loader.
4. Rebuild. GitHub Pages `base` is `/star-app-2-live/`; `publicUrl()` prefixes it.
5. **Only then** consider making 3D the default — not before she is clearly Rai.

## Toon look

Lab uses `MeshStandardMaterial` on the authored mesh. Lighting is hemisphere + two
directionals — no IBL, no ACES.
