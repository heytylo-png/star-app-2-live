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
- `?lab=1` opens Lab when no v2 key is set.

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
| Kiss | **Unmapped.** Do not sculpt, map, or render kiss / blow-kiss / heart-hands. Mood PNG art still deferred. |

## Lab mesh

`public/models/star-rai-wip.glb` — authored toon stand-in (`npm run build:wip-mesh`).

- Humanoid groups: hips → spine → chest → neck → head, plus arms/legs.
- Rest pose is a hanging **A-pose** with the idle **glare** (lids half-closed, flat frown).
- Blink: `lidLeft` / `lidRight`. Talk: `mouthOpen` (idle frown hides while talking).
- Runtime converts exported colors to `MeshToonMaterial`.
- Path constant: `WIP_GLB_FILE` in `src/lib/vrm-rig.ts`.

This is an honest low-poly WIP. It is meant to be **Star-shaped** (locks above), not another booth schoolgirl.

### Remaining gaps

- Primitive volumes, not a sculpted VRM. No fingers, no cloth sim. Face slots are mesh visibility (glare / talk smile / smirk / grit / pout / shy), not sculpted blendshapes.
- Hair is layered capsules, not individual locks. Ahoge is a tube hook.
- No official 3/4 / side / back stills were checked in as separate art (turnaround notes in the brief).
- Mood PNGs and a kiss pose are out of scope.
- Not ready to replace the live PNG body.

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

Lab uses `MeshToonMaterial` + a 3-stop gradient map. Lighting is hemisphere + two
directionals — no IBL, no ACES.
