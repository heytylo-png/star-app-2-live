# Star Rai animation

Presence is a **PNG puppet**. Official pose sheets under `public/rai/` are the face of the live app. This file is the motion model for that puppet (track **#1**), the Spine/cutout foothold (track **#2**), and a stub for Rive (track **#3**).

3D / Lab / WIP mesh is **not her**. Do not ship a Lab toggle as Rai. PR #15’s 3D-as-Rai path stays unmerged. `?lab=1` / `?3d=1` do not change the body.

## Track 1 — PNG puppet (shipping)

Default body: `idle.png`, `talk_official.png`, and the other live keys in [POSING.md](./POSING.md). Kiss stays unmapped. `scold` ≠ `shy` ≠ `pout`.

### Idle life

The rig (`[data-rai-rig]`) is hip-origin (`transform-origin: 50% 72%`). A rAF loop applies:

- **Breathe** — tiny scale (~0.75%)
- **Weight shift** — a few pixels of X + sub-degree `rotateZ`
- **Look-at** — pointer lean on X / Z only (no `rotateY` / perspective card-flip)
- **Ahoge** — a light extra rotate on `[data-rai-ahoge]`

Vertical travel stays under ~1px at rest so she does not float. `prefers-reduced-motion: reduce` zeros the loop.

Code: `src/lib/rai-motion.ts` + `src/components/puppet.tsx`. Stage switch: `src/components/presence-stage.tsx` (PNG unless a Spine query flag is on).

### Pose crossfade

Body sheets swap by stable layer id (`body:<src>`). Incoming starts at opacity 0, outgoing eases to 0, overlap ~**380ms** (`POSE_CROSSFADE_MS`, `--ease-smooth-out`). Studio-white is punched to alpha first so the beige stage never flashes a card.

### Talk / mouth

Idle is rest-only (pose tint). The live `talk` key and other mood sheets hold their PNG through the spoken bubble — frown `idle.png` is not the body under that line. Idle.png is the next rest, after the caption is no longer that reply.

While speaking on rest idle (no dedicated/mood sheet yet):

- **Body** = `talk_official.png` (not frown idle underneath)

Amplitude still drives a small talk bob on the rig. Dedicated poses (`talk`, `wave`, `scold`, `wink`, …) **hold their own PNG** through speech — no mouth overlay on those sheets.

**Not used on the live body**

- Expo `mouth_*.png` / `face_eyes_*.png` — portrait busts. Overlaying them on the long-shot pack would fight the figure. Idle blink does **not** use them.
- Helix `star-rai/idle-talk.png` — different crop / line. Official talk sheet replaces it.
- Expo `_alt_idle_smile` / `_alt_grin_open` — not aligned with official idle.

### Idle blink

**Parked.** Rest idle paints `public/rai/idle.png` only (`IDLE_BLINK_ENABLED` is false). The blink timer does not cycle frames. Do not re-enable in this change. Re-enable only when TyLo says pass. CoS alone is not enough.

TyLo FAIL: two PNGs up at once (ghost / second body during blink). The four eyes-only sheets stay on disk and are not the rest body. Source of truth: `artifacts/star-rai-blink-frames/baked/`. The same bytes are in `public/rai/`:

- `idle_blink_01_open.png` — byte copy of `idle.png`
- `idle_blink_02_closing.png`
- `idle_blink_03_half.png`
- `idle_blink_04_closed.png`

Each file is a full **1008×1792** frame on the `idle.png` canvas. Outside the eye box `(420, 185, 210, 70)` max abs RGB delta versus `idle.png` is 0. Only the lids change.

Cycle map for a future hard-cut wire (not live): **02 → 03 → 04 → 03 → 02** in **~300ms** total (60ms a cut), then **hold 01**. Do not skip 02. One `<img>` only — no stack, no dual PNG, no opacity blend of two sheets. Those timings are not running while the flag is false.

Art gate: `artifacts/star-rai-blink-frames/baked/proof_standing_full.gif` and `proof_standing_strip.png`. The gif composites exactly one full frame at a time (hard replace, no crossfade). One body throughout; only the lids change. Runtime must hard-swap a single `<img>` / texture (no stack, no dual PNG). This proof is the art gate before re-enable.

Named poses, talk, and emotion sheets still do not blink. `prefers-reduced-motion: reduce` stays on `idle.png`. Spoken `talk` / mood is a single body sheet.

## Track 2 — Spine / cutout (foothold)

**Primary engine: Spine** (Essential license when we export a real rig). DragonBones is a free/stale fallback — not the authoring home. Full decision, licenses, layer cuts, and bone map: **[SPINE.md](./SPINE.md)**.

A licensed Spine Editor export is **not** here (do not buy Essential for this PR). What *is* here:

- In-repo **Canvas cutout** player (`src/lib/cutout-runtime.ts`) — Spine-shaped JSON, no Esoteric npm, no Pixi.
- **`?spine=1`** (or `?engine=spine`) — geometric sample girl. Badge: not Rai. Pose keys still drive idle / talk / wave / scold / pout / shy.
- **`?spine=rai`** — `public/spine/rai/skeleton.json` + official idle cut layers in `layers/`. Pose clips are ported from `src/lib/cutout-sample.ts` (wave `upperArmR` 128→148 flap; talk mouth is `skeleton.talk`, not jaw keys). Missing files → **PNG puppet** (same Call/Chat). Do not recut the frozen pack to fix empty clips.
- Cut guide + glance still: `public/spine/rai/cut-guide.svg`, `layers/README.md`, `composite_idle_still.png`.

Default URL is unchanged: `data-rai-engine="png-puppet"`. Do not flip this on in Pages deploy.

Honest next step: import these cuts in Spine Essential → JSON+atlas in `public/spine/rai/export/` → later PR dynamic-imports `@esotericsoftware/spine-webgl` behind the same flag.

## Track 3 — Rive (later)

Stub only: [public/rive/README.md](./public/rive/README.md). After Spine/cutout is proven on official art, Rive can own the interactive state machine (pointer, Call amplitude → mouth). Do not buy Live2D or run After Effects. No Rive runtime is bundled.

## Do not

- Replace official PNGs with AI video or 3D as the live face
- Invent a kiss sheet
- Advance Lab mesh identity
- Add a heavy animation engine (Pixi, spine-ts, Rive) to the **default** bundle just for idle life
