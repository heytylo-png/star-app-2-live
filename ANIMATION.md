# Star Rai animation

Presence is a **PNG puppet**. Official pose sheets under `public/rai/` are the face of the live app. This file is the motion model for that puppet (track **#1**), the Spine/cutout foothold (track **#2**), and a stub for Rive (track **#3**).

3D / Lab / WIP mesh is **not her**. Do not ship a Lab toggle as Rai. PR #15’s 3D-as-Rai path stays unmerged. `?lab=1` / `?3d=1` do not change the body.

## Track 1 — PNG puppet (shipping)

Default body: `idle.png`, `talk_official.png`, and the other live keys in [POSING.md](./POSING.md). Kiss stays unmapped. `scold` ≠ `shy` ≠ `pout`.

### Idle life

The rig (`[data-rai-rig]`) is hip-origin (`transform-origin: 50% 72%`). A rAF loop applies:

- **Weight shift** — a few pixels of X sway, snapped to whole device pixels
- **Look-at** — pointer lean on X / Z only (no `rotateY` / perspective card-flip)
- **Ahoge** — a light extra rotate on `[data-rai-ahoge]`

**Sharpness rules (no second resample).** Rest scale is exactly 1: no breathe `scale()` and no idle `rotateZ` rock in the rig transform (either one resamples the whole sheet every frame). Translates are whole device pixels. The long-shot zoom (`--rai-long-shot*`) is a real width/height on `.rai-layer`, computed in JS in whole device pixels (`src/lib/rai-sheet-box.ts`), not `transform: scale`. No `will-change` on `.rai-rig` and no `translateZ(0)` on `.rai-layer`: promoting either layer made the compositor resample the sheet again. Measured face sharpness at 412x915 @ DPR 3: ~400 before, ~695 after (single resample), with sway running.

Vertical travel stays under ~1px at rest so she does not float. `prefers-reduced-motion: reduce` zeros the loop.

Code: `src/lib/rai-motion.ts` + `src/components/puppet.tsx`. Stage switch: `src/components/presence-stage.tsx` (PNG unless a Spine query flag is on).

### Pose crossfade

Body sheets swap by stable layer id (`body:<src>`). Incoming starts at opacity 0, outgoing eases to 0, overlap ~**380ms** (`POSE_CROSSFADE_MS`, `--ease-smooth-out`). Studio-white is punched to alpha first so the beige stage never flashes a card.

**Decode before swap** (TyLo, 2026-09-27). No sheet can be shown until it has been punched **and** `decode()`d (`decodeSheet`, `src/lib/sheet-decode.ts`). Until then the current frame (idle, or the pose already up) stays on stage. The decoded `Image` objects are held for the life of the stage (`decodedFrames`, same as blink/mouth), so a later switch back is a plain cut. After startup (idle → blink → mouth) every live pose sheet (wave, shy, talk, moods, …) is punched and decoded on idle callbacks, so the first switch is instant; a pose asked for sooner jumps that queue and simply shows once it is ready. If `decode()` takes more than **400ms** (`SHEET_DECODE_TIMEOUT_MS`) or rejects on a file that did load, the sheet is used anyway: every stage `<img>` is `decoding="sync"`, so that paint decodes it (a slow frame at worst, never an empty one). A file that does not load is never mounted.

**Interrupted fades** (`PoseCrossfadePool`, `src/lib/pose-crossfade.ts`). The incoming sheet sits at 0 for one ~48ms paint before it fades up. If the pool updates again inside that window, a fade-in still wanted is re-armed, and one no longer wanted is dropped. Before, A → B → A within ~48ms left B stranded at opacity 0, and the next switch to B faded A out over nothing (an empty stage until something else re-rendered).

### Talk / mouth

Idle is rest **and** the talking body (TyLo, 2026-09-27: "route talking to the idle mouth instead of `talk_official`"). `SPOKEN_TALK_TO_IDLE` in `src/lib/rai.ts` is on: `routeSpokenTalk()` turns every *automatic* `talk` into `idle` for a spoken line — bratty (`EMOTION_TO_POSE.bratty` is now `idle`), a model `"pose":"talk"` key, Music Set / Chart / life / clock `talk` tints, the plain-chat fallback, and the Call turn-start placeholder (`spokenTurnStartPose()`). So an ordinary talky/bratty line stays on `idle.png` and the idle talking mouth plays (below).

Unchanged:

- **Named poses** (the user says wave / shy / scold / … ) still win and hold their own PNG through speech — no mouth overlay on those sheets. A user who literally asks for `talk` still gets `talk_official.png`.
- **Mood sheets** (smug, content, pout, tired, …) still hold their PNG through the spoken bubble; frown `idle.png` is not snapped in under a mood line. Idle.png rest comes after the caption is no longer that reply.
- `talk_official.png` and the `talk` pose key stay in the pack (`POSE_ASSETS`, POSING.md); speech is just no longer routed to it.

Amplitude still drives a small talk bob on the rig.

**Not used on the live body**

- Expo `mouth_*.png` / `face_eyes_*.png` — portrait busts. Overlaying them on the long-shot pack would fight the figure. Idle blink does **not** use them.
- Helix `star-rai/idle-talk.png` — different crop / line. Speech uses the idle mouth sheets instead.
- Expo `_alt_idle_smile` / `_alt_grin_open` — not aligned with official idle.

### Idle blink

**On.** Rest idle hard-swaps one full frame (`IDLE_BLINK_ENABLED` is true). Blink is on, approved by TyLo on 2026-09-26 (807-referenced painted lids, pass 4b). The blink timer cycles one `<img>` only.

The four eyes-only sheets are the rest body, one sheet at a time. Source of truth: `artifacts/star-rai-blink-frames/baked/`. The same bytes are in `public/rai/`:

- `idle_blink_01_open.png` — byte copy of `idle.png`
- `idle_blink_02_closing.png`
- `idle_blink_03_half.png`
- `idle_blink_04_closed.png`

Each file is a full **1008×1792** frame on the `idle.png` canvas. Outside the eye box `(420, 185, 210, 70)` max abs RGB delta versus `idle.png` is 0. Only the lids change. The lids are the 807 video registered onto idle's eyes. 03 sets the 7s lash through the middle of the iris; 04 repaints the old opening with the 8s shut lid and one lash; 02 is that 7s lash only a light drop into the iris.

Live cycle: **02 → 03 → 04 → 03 → 02** in **~300ms** total (60ms a cut), then **hold 01**. Do not skip 02. One `<img>` only — no stack, no dual PNG, no opacity blend of two sheets.

Art gate: `artifacts/star-rai-blink-frames/baked/proof_standing_full.gif` and `proof_standing_strip.png`. The gif composites exactly one full frame at a time (hard replace, no crossfade). One body throughout; only the lids change. Runtime hard-swaps a single `<img>` / texture (no stack, no dual PNG). TyLo approved this on 2026-09-26 (807-referenced painted lids, pass 4b).

Named poses, talk, and emotion sheets still do not blink. `prefers-reduced-motion: reduce` stays on 01 open (a byte copy of `idle.png`). A spoken mood line is a single body sheet; a plain spoken line stays on idle (mouth frames, blink paused).

### Idle talking mouth

**On** (`IDLE_MOUTH_ENABLED`, TyLo "Wire it", 2026-09-27). While she is speaking (`talking`: Call/ElevenLabs line in flight) **and** the pose is still `idle` with no mood sheet pinned, the same rest `<img>` hard-cuts through full mouth sheets. Because automatic `talk` now routes to idle (see Talk / mouth), this is the body for ordinary replies. Any other pose (including a user-named `talk` → `talk_official.png`) and every mood sheet are untouched. `talk_official.png` is never a viseme.

- `idle_mouth_01_closed` = the rest sheet itself (`idle_blink_01_open.png`, byte copy of `idle.png`), so it is not duplicated.
- `public/rai/idle_mouth_02_small.png`, `03_open`, `04_oo`, `05_wide`, `06_smirk` — byte copies of `artifacts/star-rai-blink-frames/baked/` (RGBA, pre-cut, `?v=rgba1`, skipped by punch-white).
- Loop 01 → 02 → 03 → 02 → 01, 90–120 ms a cut (jittered). ~12% of peaks are 04 oo, ~7% of syllables are a 06 smirk beat (held two cuts). 05 wide only on hype lines (two or more `!`, or one `!` with a shouted word), ~40% of their peaks.
- Once real TTS amplitude arrives, silence holds 01 and quiet audio only opens to 02.
- Blink is paused for the whole line; at the end the sheet returns to 01 and the blink timer starts again.
- Mouth sheets load after the blink frames and are `decode()`d before first use. Reduced motion holds 01.

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
