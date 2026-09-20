# Presence (PNG + 3D)

Star occupies one stage slot. Two renderers share it:

| Mode | Component | When |
| --- | --- | --- |
| **3D** (default) | `src/components/toon-presence.tsx` | React Three Fiber + `@pixiv/three-vrm` |
| **PNG** | `src/components/puppet.tsx` | Toggle, VRM load failure, or a Helix key the stand-in cannot act |

Chat, Call, talk, memory, and Helix acts are unchanged.
`rai-app.tsx` still drives `pose`, `emotion`, `talking`, and `amplitude`.
`Presence` picks the renderer.

## Toggle

Header control: **3D | PNG**. Stored in `localStorage` key `star-rai-presence`.

## Swap the 3D model

1. Export a VRM (preferred) or keep the same humanoid contract.
2. Replace `public/models/star-standin.vrm`.
3. Keep the filename, or change `STANDIN_VRM_FILE` in `src/lib/vrm-rig.ts`.
4. Rebuild. GitHub Pages `base` is `/star-app-2-live/`; `publicUrl()` prefixes it.

A custom Star mesh that uses standard VRM humanoid bones and expression
presets (`happy`, `angry`, `sad`, `surprised`, `relaxed`, `aa`, `blink`, …)
will pick up idle life, look-at, blink, talk mouth, and pose maps with no
code changes.

Current stand-in: **Sairi Ponytail** (CC BY-SA) — see
`public/models/ATTRIBUTION.md`. School-uniform silhouette, not Star.

## Pose / expression map (3D)

Helix keys stay the PNG contract (`POSING.md` / `src/lib/rai.ts`).
On the 3D path they are approximated when the generic VRM can act them:

| Key | 3D |
| --- | --- |
| `idle` / `talk` | Breathe, sway, look-at, blink; `aa` while talking |
| `think` | Hand near chin |
| `shy` / `embarrassed` | Head down, arms in, blush if the morph exists |
| `wave` | Right arm up, forearm oscillation |
| `hearts` | Hands to chest + `happy` |
| `turn` | Yaw ~¾, not a 180° spin |
| `profile` / `three_quarter*` | Body yaw only |
| `point` / `scold` | Pointing arm |
| `tired` / `sad` / `surprise` / `smug` / `laugh` / `wink` / `pout` / `content` | Face + light body |
| emotions | `bratty`, `smug`, `tired`, `shy`, `soft`, `hype`, `glance` |

**PNG fallback (3D mode stays on):** `peace`, `middle_finger`, `hold` —
hand-shape / prop keys the stand-in cannot do without looking wrong.
Missing morphs are skipped; they do not pop the whole body back to PNG.

## Toon look

MToon materials are flattened (`shadingToonyFactor`) and given a screen-space
outline if the file shipped without one. Lighting is hemisphere + two
directionals — no IBL, no ACES — so the stand-in reads cel-shaded, not plastic PBR.
