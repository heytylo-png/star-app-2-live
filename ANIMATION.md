# Star Rai animation

Presence is a **PNG puppet**. Official pose sheets under `public/rai/` are the face of the live app. This file is the motion model for that puppet (track **#1**) and a stub for the next engines.

3D / Lab / WIP mesh is **not her**. Do not ship a Lab toggle as Rai. PR #15’s 3D-as-Rai path stays unmerged.

## Track 1 — PNG puppet (shipping)

Default body: `idle.png`, `talk_official.png`, and the other live keys in [POSING.md](./POSING.md). Kiss stays unmapped. `scold` ≠ `shy` ≠ `pout`.

### Idle life

The rig (`[data-rai-rig]`) is hip-origin (`transform-origin: 50% 72%`). A rAF loop applies:

- **Breathe** — tiny scale (~0.75%)
- **Weight shift** — a few pixels of X + sub-degree `rotateZ`
- **Look-at** — pointer lean on X / Z only (no `rotateY` / perspective card-flip)
- **Ahoge** — a light extra rotate on `[data-rai-ahoge]`

Vertical travel stays under ~1px at rest so she does not float. `prefers-reduced-motion: reduce` zeros the loop.

Code: `src/lib/rai-motion.ts` + `src/components/puppet.tsx`.

### Pose crossfade

Body sheets swap by stable layer id (`body:<src>`). Incoming starts at opacity 0, outgoing eases to 0, overlap ~**380ms** (`POSE_CROSSFADE_MS`, `--ease-smooth-out`). Studio-white is punched to alpha first so the beige stage never flashes a card.

### Talk / mouth

Idle and the live `talk` key share the same official full-body frame. While speaking on that path:

1. **Body** = `idle.png` (closed)
2. **Talk overlay** = `talk_official.png` at `talkFlapOpacity(phase, amplitude)`

Amplitude comes from TTS (or a synthetic jaw when the analyser is flat). Overlay opacity is **instant** while talking so the mouth can cycle; when speech ends the overlay eases out with the pose fade.

Dedicated poses (`wave`, `scold`, `wink`, …) **hold their own PNG** through speech — no mouth overlay on those sheets.

**Not used on the live body**

- Expo `mouth_*.png` / `face_eyes_*.png` — portrait busts. Overlaying them on the long-shot pack would fight the figure.
- Helix `star-rai/idle-talk.png` — different crop / line. Official talk sheet replaces it.
- Expo `_alt_idle_smile` / `_alt_grin_open` — not aligned with official idle.

Blink / eye layers: skipped for the same reason. Revisit only if we get eye sheets that match the official full-body frame.

Fallback: no overlay → idle or `talk_official` as a single body sheet. Reduced motion → static `talk_official` while speaking.

## Track 2 — Spine / DragonBones (next)

Not in this PR. When we move off dual-PNG visemes, a Spine (or DragonBones) skeleton can own breathe, blink, and visemes on the **same official art**. Budget path: export from the PNG pack; no Live2D license.

Stub: keep `data-rai-engine="png-puppet"` so a later engine can swap the stage without renaming live pose keys.

## Track 3 — Rive (after Spine)

Not in this PR. Rive is the later interactive pass (state machine, pointer, Call amplitude → mouth). Do not buy Live2D or run After Effects for this. No Rive runtime is bundled today.

## Do not

- Replace official PNGs with AI video or 3D as the live face
- Invent a kiss sheet
- Advance Lab mesh identity
- Add a heavy animation engine just for idle life
