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

Body sheets swap by stable layer id (`body:<src>`). Incoming starts at opacity 0, outgoing eases to 0, overlap ~**380ms** (`POSE_CROSSFADE_MS`, `--ease-smooth-out`). Studio-white is punched to alpha first so the beige stage never flashes a card, except on the pre-cut RGBA pose sheets (most of them; see POSING.md "Transparent cuts"), which skip the punch and are only decoded.

**Decode before swap** (TyLo, 2026-09-27). No sheet can be shown until it has been punched **and** `decode()`d (`decodeSheet`, `src/lib/sheet-decode.ts`). Until then the current frame (idle, or the pose already up) stays on stage. The decoded `Image` objects are held for the life of the stage (`decodedFrames`, same as blink/mouth), so a later switch back is a plain cut. After startup (idle → blink → mouth) every live pose sheet (wave, shy, talk, moods, …) is punched and decoded on idle callbacks, so the first switch is instant; a pose asked for sooner jumps that queue and simply shows once it is ready. If `decode()` takes more than **400ms** (`SHEET_DECODE_TIMEOUT_MS`) or rejects on a file that did load, the sheet is used anyway: every stage `<img>` is `decoding="sync"`, so that paint decodes it (a slow frame at worst, never an empty one). A file that does not load is never mounted.

**Interrupted fades** (`PoseCrossfadePool`, `src/lib/pose-crossfade.ts`). The incoming sheet sits at 0 for one ~48ms paint before it fades up. If the pool updates again inside that window, a fade-in still wanted is re-armed, and one no longer wanted is dropped. Before, A → B → A within ~48ms left B stranded at opacity 0, and the next switch to B faded A out over nothing (an empty stage until something else re-rendered).

### Pose bridge (idle ↔ smug) — legacy six-PNG path (retired; see Helix 956 / 962)

**On** (TyLo, 2026-10-02). When the sheet on stage changes idle → smug, six Helix in-betweens play as hard cuts, then the live smug holds. smug → idle plays the same six reversed, then lands on the live idle. Nothing else bridges: every other pair keeps its normal pose change (the ~380ms crossfade above).

- Frames: `public/rai/bridge_idle_smug_01.png` … `_06.png` (720×1280 RGBA, offline cuts of the Helix frames with the same engine as the pose-sheet sweep, so they match the cut smug; sha256 pinned in `pre-cut-alpha.test.ts`). 01 is the idle pose, 06 is hand-on-hip. They are the in-betweens only: `idle.png` stays the rest and `smug_official.png` the hold (the Helix 07 is byte-identical to the old smug, and 01 lines up with the live idle with no shift), and no live key was renamed.
- Order and timing: 01 → 06 then smug (smug → idle: 06 → 01 then idle), ~**100ms** a frame with small jitter (80–120ms, `bridgeFrameMs`), no loop. One `<img>`: the bridge frame is the only visible image while it plays (the pose layers stay mounted but `visibility: hidden` while it plays, and show again in the commit it lands). Whole-pixel rig translates are unchanged; no scale, no will-change, no translateZ.
- Pair table: `POSE_BRIDGE_PAIRS` in `src/lib/pose-bridge.ts` (`"idle>smug"`, `"smug>idle"`). Add a row (and its frames) to bridge another pair. The key of a sheet is `bridgeKeyOfSrc`: idle rest, blink and mouth frames are all `idle`, so a blink or a chew never looks like a pose change.
- Triggered by the shown sheet changing (the plates), not the requested pose: a sheet that has not decoded yet starts nothing. Interrupt: a new change drops the remaining frames and starts the new pair if it has one (from its first frame), otherwise the stage shows the live sheet (hard cut).
- Speech does not gate it (fixed 2026-10-03, #101 failed on the real device). A real reply lands the smug pose in the same tick that speech starts (`setTalking(true)`), so a talking gate hard-cut every spoken smug reply and the talking-start cancel killed a bridge already running. The bridge now plays whenever the shown sheet changes idle ↔ smug, by any route (named pose, model `pose` tag, emotion tint, local brain, `pose idle` + `emotion smug`), voice on or off, mid-blink or mid-chew (the chew is cancelled by leaving idle; it can only resume once the pose is idle again and a line is speaking). A normal talk line never changes the pose, so it never bridges (idle stays on idle with the mouth; `talk_official` is never a viseme). Opposite-direction interrupts (smug → idle → smug inside one reply turn) carry on from the frame that is up. The decision lives in `BridgeDriver` (`pose-bridge.ts`): it reads only the committed plates, never the pose or talking flag. Bridge frames lead the deferred preload queue so they are decoded before smug is reachable. Reduced motion hard-cuts, and so does a pair whose frame is not decoded. Wave, pout and talk are not wired.
- Preload: the six frames are queued after every pose sheet (`deferredSpriteUrls`), punched through the pre-cut path, `decode()`d, and held in `decodedFrames` like the other sheets. A frame is never shown before it has decoded; if any of the six is missing the pair hard-cuts. After landing on idle the blink timer and the mouth resume as usual (blink first fires ~900ms after rest; the mouth only chews if a line is speaking).
- `data-rai-bridge-frame` on the stage is `01`…`06` while a frame is up, else `off`.
- No silent hard-cut (2026-10-03, after #102 still failed on TyLo's phone). Smug is not shown until all six bridge frames have decoded: `bridgeGate` keeps the old sheet up (idle) and asks for the frames at once (they jump the idle queue, failed loads are retried every 400 ms) until they are all in. `BRIDGE_WAIT_MAX_MS` (30 s, counted from the moment the smug sheet itself has decoded) is only a safety valve for a frame that can never load (offline, 404); a working device never reaches it, so entry never cuts silently. Past it the change cuts, and it says so (`console.warn`, stage `data-rai-bridge-fallback="1"`). Reduced motion (`prefers-reduced-motion: reduce`, read with `matchMedia` in the puppet; stage `data-rai-reduced`) is the only request that skips the bridge, and it never waits. On Samsung this media query is on when Settings > Accessibility > Remove animations (or a power-saving mode) is on; then idle ↔ smug, blink and the chew all hard-cut by design.
- Cold / slow phone (2026-10-03, after #106 still showed idle on TyLo's S-series Ultra). On Slow 4G + 4x CPU the startup queue sent ~7 MB of blink and mouth sheets first and requested the six bridge frames and `smug_official.png` only when Smug was asked for, so the gate waited on a bandwidth-starved queue past the whole beat; the release timer fired from the line landing and she went back to idle without the hip ever painting (reproduced). Now: preload order is `idle.png`, then the seven smug-beat sheets together (`stagePreloadOrder`), then blink and mouth, then everything else. The app's smug release (`smugReleaseWaitMs`) asks the stage first: it waits (up to 30 s) until the hip has been on stage and held at least 1.5 s, so a late decode never skips the beat. While waiting the plain open idle is up (never a mouth or lid state). Debug: stage `data-rai-pose-phase` (idle | bridge-in | hold | bridge-out), `data-rai-pose-wait`, `data-rai-smug-decode` (7 bits: bridge 01..06, sheet), `data-rai-build`; add `?debug=1` to the URL for a small readout (build, pose, phase, reduced motion, decode state).
- Background tab: `PoseBridge.setPaused` (wired to `visibilitychange`). A hidden page has throttled or frozen timers, so the bridge holds the frame it is on and resumes at normal pace on return; a bridge that starts while hidden shows 06 and plays 05..01 on return, never a cut.
- Smug holds until its beat ends (`smugBeatResetDelayMs`, `holdsSmugBeat` in `rai.ts`; used by the reset timer in `rai-app.tsx`). The old rule let go 2.8-3.4 s after the line landed, even on a long line still being read. Now the hold ends at the later of the speech end (voiced lines, `speechEndedAt`) and the reading time from landing (45 ms per character, never under the 3.4 s pose minimum), plus a 1.5 s tail (exactly: the delay is beat end minus now, not the old 2.8 s post-talk hold). The beat is the LINE's, not the pose's: it counts from `lineLandedAt` in `rai-app.tsx`, set when the final line becomes the bubble and cleared at the start of every turn. A pose that resolves early (a model tag at ~1.5 s with the line at ~6 s) starts nothing, and no timer runs while a turn is sending; a re-arm (typing, a voice end) keeps the same absolute end. Only the smug sheet (pose smug, or idle carrying the smug emotion) is stretched; other poses keep their timing. A new send still resets the pose at once, as before. The reply line itself stays in the chat strip after the beat; the beat is what the hold follows.

### 968 / 973 stills (idle ↔ smug, paste-13, 2026-10-05)

TyLo paste-13 replaces every prior smug bridge asset (956 in, 962 out, `smug_hold.png` = Helix 06, `smug_official.png`, the six-PNG set, the hip clip). Those files are deleted from `public/rai/`. Idle↔smug only, no new art.

- Entry (968): `public/rai/smug968_in_01..05.webp` (keyed from `/workspace/bridge/smug-in-968/` 01-start, 02-elbow, 03-hand-rise, 04-hip, 05-smirk-hold). Play **forward** on Smug send, paint-paced (~150 ms a frame).
- Hold: `public/rai/smug968_hold.webp` = the 968 `05-smirk-hold` cut (not 06, which kicks the leg).
- Exit (973): `public/rai/smug973_out_01..05.webp` (keyed from `/workspace/bridge/smug-out-973/` 01-hip, 02-hand-leave, 03-arm-down, 04-soft, 05-glare). Play **forward** after the hold, then the live idle. Never a hold → `idle.png` snap.
- Registration: 968 frames already match the idle sheet (scale 1.0, offset 0,0). 973 frames the figure at ~0.78×; the cuts are registered offline with a uniform ×1.275 and a whole-pixel translate (−98, −173) in 720×1280 space. Only transparent margin leaves the canvas; every visible pixel stays in frame (no crop, no runtime zoom).
- Matte: same engine as the pose sheets (`/workspace/f807/bridge/engine/sheets_968_973.py`; seeds are the ahoge loop, the leg gap and the arm/hip loop). Shipped as WebP q92 with lossless alpha (~1 MB for all 11, down from ~4.9 MB as PNG).
- Allowlist on the smug beat (`isSmugPathSheetSrc`): idle sheets (rest / blink / mouth), `smug968_in_*`, `smug968_hold`, `smug973_out_*`. Nothing else.
- Flow: Smug send → 968 forward → hold until max(lineLandedAt + readingFloor, speechEndedAt) + 1.5 s → 973 forward → idle.
- Preload (`stagePreloadOrder`): `idle.png`, then blink 01, then 968 in + hold + 973 out (in parallel), then blink 02-04 and mouth.
- Reduced motion: hard cut onto `smug968_hold`, hard cut back to idle.
- Debug: `data-rai-hold-sheet=smug968_hold` while holding; bridge layer `data-rai-sheet` is `in-NN` / `out-NN`.

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
- `public/rai/idle_mouth_02_small.png`, `03_open`, `04_oo`, `05_wide`, `06_smirk` — byte copies of `artifacts/star-rai-blink-frames/baked/` (RGBA, pre-cut, `?v=` `PRE_CUT_ALPHA_VERSION`, skipped by punch-white).
- Loop 01 → 02 → 03 → 02 → 01, 90–120 ms a cut (jittered). ~12% of peaks are 04 oo, ~7% of syllables are a 06 smirk beat (held two cuts). 05 wide only on hype lines (two or more `!`, or one `!` with a shouted word), ~40% of their peaks.
- Once real TTS amplitude arrives, silence holds 01 and quiet audio only opens to 02.
- Blink is paused for the whole line; at the end the sheet returns to 01 and the blink timer starts again.
- A pose change mid-chew (a named or late pose while a mouth frame is up) fades out the **closed 01** frame: the crossfade's outgoing snapshot of the rest layer is `idle_blink_01_open.png`, never the open mouth that happened to be showing (`outgoing` in `PoseCrossfadePool`). The mouth sheets themselves are unchanged full frames.
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
- Entry is paint-paced (2026-10-03, after #103 still cut on TyLo's device). On idle → smug `PoseBridge` starts each frame's 80–120 ms dwell when the frame has been painted (`afterPaint`, the puppet passes a requestAnimationFrame with a 500 ms backstop), not when it was set. Before, a main-thread stall (sheets punching, a stream of renders, a busy phone) let a frame's timer run out before the screen ever drew it, so 01..05 flashed by in 0–2 ms and the hip appeared at once. Frame order and durations are the same on a quiet device; the exit (smug → idle) is not paced and unchanged.
