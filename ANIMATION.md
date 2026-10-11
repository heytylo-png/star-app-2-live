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

### 1085 / 1084 video (idle ↔ smug, paste-15 final, 2026-10-06)

TyLo paste-15 replaces the 968/973 stills (and every earlier smug asset) with two real videos played as video: native 24 fps, every source frame in order, no dropped or held frames during playback. `smug968_*` / `smug973_*` are deleted from `public/rai/`. Idle↔smug only, no new art, `idle.png` unchanged.

- Entry (1085, `63172cf2….mp4`, arms down / mad face): `public/rai/smug1085_in.avif`, frames 0..48 = 0.000–2.000 s only (her mouth opens at 3 s; nothing after 2.0 s is in the file). Plays forward on Smug send, 2.0 s.
- Hold: `public/rai/smug1085_hold.webp` = the exact 2.000 s frame (1085 frame 48), held **until the user's next send** (no timer; paste-14 / #121).
- Exit (1084, `b10ac87f….mp4`, starts hand on hip): `public/rai/smug1084_out.avif`, all 145 frames (6.04 s), forward, once, then the live idle; then the next pose (#122 clocks: the next reply's chew and `actLandedAt` start when idle lands).
- Format: animated AVIF (AV1 + alpha, 24 fps, no audio track), decoded frame by frame with WebCodecs `ImageDecoder` — never shown as an animated `<img>`, so nothing loops and nothing starts mid-animation: every play starts on frame 0. Only the x 112..560 band is coded (the rest is transparent margin in every frame); it is drawn back 1:1 at that offset on a 720×1280 canvas that has the same box as the sheets (no crop, no zoom).
- Player (`smug-clip-worker.ts`, `smug-clip-player.ts`): a dedicated worker owns both decoders and two `OffscreenCanvas`es (one per clip) and paints on its own animation frames: frame k due at k × 41.67 ms, at most one frame per animation frame, never skipped; a frame that has not decoded holds the one up (stall); more than one frame late shifts the rest back. A busy main thread (React renders, the reply landing, speech starting) cannot delay, drop or bunch a frame. Each canvas rests on its frame 0 while hidden (armed), so the first frame is on screen in the same paint that hides the live sheet; the stage tells the worker two frames after a canvas is hidden before it re-arms it. `PoseBridge` mirrors the worker (`BridgeClipPlayer`): the rig's `data-rai-bridge-on="in"|"out"` shows that clip's canvas and hides every live sheet (CSS), so `idle.png` can never paint mid-bridge.
- Preload: the worker fetches and opens both clips at startup and decodes the first 12 frames of each (kept for the life of the page); 12 frames are decoded ahead while a clip plays. The stage waits (bounded, loud) until both are armed before letting a smug change through, so a cold first send does not stutter. `stagePreloadOrder`: `idle.png`, blink 01, `smug1085_hold`, then blink 02-04 and mouth.
- Registration (offline, `/workspace/f807/bridge/engine/bake_1085_1084.py`): uniform scale + whole-pixel shift against `idle.png` in 720×1280 space, asserted no visible pixel leaves the canvas: 1085 ×1.0 (0, −3), 1084 ×1.005 (−2, −10). Matte: same white-bg engine as 968/973 (`sheets_1085_1084.py`).
- Allowlist on the smug beat (`isSmugPathSheetSrc`): idle sheets (rest / blink / mouth), `smug1085_in.avif`, `smug1085_hold.webp`, `smug1084_out.avif`. Nothing else.
- Release / interrupts: unchanged from paste-14/15 (`SmugReleaseGate`): a send during the hold plays 1084 → idle → next pose; a send during 1085 waits for the hold, then 1084; Smug → Smug = 1084 then 1085 from frame 0; an unpaired key never aborts 1084.
- Reduced motion, or a browser without `ImageDecoder` / `OffscreenCanvas` workers: hard cut onto the hold, hard cut back to idle.
- Debug: `data-rai-hold-sheet=smug1085_hold` while holding; each clip canvas has `data-rai-clip` and `data-rai-sheet` = `in-NNN` / `out-NNN` (last frame reported); `window.__raiBridgeLog` = `[t, clip, frame]` per painted frame (stage clock), `window.__raiBridgeDone` = `[t, clip, stalls, reanchors]` per play.

### 1126 / 1140 video (idle ↔ wave, 2026-10-08; replaces 1110 / 1114)

Same player path as 1085/1084: muted animated AVIF (no audio track), WebCodecs ImageDecoder in a worker, OffscreenCanvas at 24 fps, every frame in order, no skips. Own canvases (`win`/`wout`) and its own band, `WAVE_CLIP_BOX` = x 0..672 of the 720×1280 sheet space (the smug band x 112..560 clipped the raised elbow/hand).

- Entry (1126, TyLo's 720×1280 video): `public/rai/wave1126_in.avif`, frames 0..98 = 0.000–4.083 s only. Arms-down glare → wave arm out (1 s) → palm up, other hand on hip (2 s, still the glare) → smile. At 4.000 s (f96) the mouth is still flat. f98 is the first frame where the smile curves: mouth-corner lift goes from about −0.4 px (f94–f97) to +2.4 px (f98 on). w5 (TyLo 2026-10-08 13:30) extends the intro to f98 and nothing past it is in the file.
- Hold: `public/rai/wave1126_hold.webp` = 1126 f98 (4.083 s, first curved smile), the intro's last frame, until the next send (same `SmugReleaseGate` / `requestSmugRelease`). Never the 2 s frame. `wave-clip-edges.test.ts` checks that the hold matches the decoded last intro frame.
- Exit (1140, TyLo's 784×1168 video): `public/rai/wave1140_out.avif`, all 145 frames forward → idle → next pose. No idle.png swap inside it; idle only after its last frame.
- Matte / registration: white-matte cut (f807 sweep engine) after a uniform registration onto idle in the 720×1280 sheet space: 1126 ×1.040, 1140 ×1.118, each anchored on idle's soles and feet centre. Joins (alpha ≥ 200, 720 space): idle→1126 f0 sole 0, ahoge −1, body height −2 px; 1126 f98 (hold)→1140 f0 sole +2, crown −4, scale ×1.005 (1140 starts with a wider stance than the 1126 hold: the legs differ in the source); 1140 f144→idle sole −1, ahoge +2, body height −2 px.
- Wave hand: the raised hand sits above the shoulder line, so the hair un-mix zone starts right of it per frame (light finger skin is never softened); enclosed white between the fingers is background, and light neutral matte left in the finger gaps is alpha-cleaned (RGB untouched).
- Skin (w4): both clips are matched to the official dark Rai (idle.png) frame by frame. Each frame's face, arm (with the raised hand) and leg skin LAB means are matched to idle's, skin only (hue/saturation mask; clothes, hair and eyes untouched). Shifts are smoothed over time (σ 2 frames) and space (σ 20 px), so there's no flicker or seam. Residual |ΔL| is ≤ 1.4 on every frame, including the raised-arm frames and the 1140 start, which were up to ΔL +12 lighter before. Script: f807/bridge/w1126/skin3/retone3.py.
- Edges: `src/lib/wave-clip-edges.json` (decoded alpha of every shipped frame, pinned to the AVIF sha256) + `wave-clip-edges.test.ts`: no frame has alpha on the band's left/right/bottom edge, ≥ 8 px margin.
- w6 (2026-10-10, CoS fa14ed7 FAIL): 1126 f0-6/8/10/12/14/18/28/30 had an opaque near-white patch between the thighs (~16.8k px); it is alpha 0 now, with its light 1-3 px fringe (alpha only, RGB untouched). Every decoded intro frame has 0 near-white opaque px in the thigh gap. f41-45 finger-gap matte touching transparency cleared (alpha only). 1140 f0-f7: the hold's (f98) smile is morphed into 1140's own mouth (ink-ratio warp along an interpolated centreline, t=(i/8)^1.4), mouth patch only, alpha/legs/arms/pose untouched, so the mouth no longer snaps at hold→1140. The hold is re-exported from the decoded w6 f98 (alpha identical, colour WebP q95). Scripts: f807/bridge/w1126/w6_fixes.py (gap), w6b_fixes.py, w6c_finger_edge.py.
- Encode: libaom crf 26, 99 / 145 frames, 24 fps, 672×1280 + alpha. URLs carry `?v=w6` for the intro, hold and 1140 (`BRIDGE_FILE_VERSION`); smug/idle URLs unchanged. Allowlist: idle sheets + the two clips + hold.

### 1158 / 1162 video (idle ↔ pout, 2026-10-10; replaces pout_official.png on the Pout beat)
- Intro (1158, TyLo's 784×1168 video, muted): `public/rai/pout1158_in.avif`, f0..f48 only (0–2.000 s, 49 frames; nothing past 2 s ships). It then holds `public/rai/pout1158_hold.webp` (= decoded f48, the crossed-arms frown; alpha identical) until the next send. pout_official.png is no longer the Pout sheet.
- Exit (1162, muted): `public/rai/pout1162_out.avif`, all 145 frames forward → idle. No idle.png inside it; idle only after its last frame.
- Registration: both clips share one affine fit to idle (×1.33, joint silhouette IoU of 1158 f0 + 1162 f144), so there is no size jump at any join. Joins (alpha ≥ 200, 720 space): idle→1158 f0 top −1 / sole +2 / height +3 px; hold→1162 f0 0 / 0 / 0; 1162 f144→idle top +2 / sole −3 / height −5 px. Hold→1162 f0 mouth change 2 px (box 345–405 × 175–215), well under the clip's own frame-to-frame motion (32–169 px): no mouth snap.
- Own band `POUT_CLIP_BOX` (x 128, w 480); every decoded frame has 0 alpha on the left/right/bottom band edges (≥ 15 px margin, shoes in frame). Manifest `src/lib/pout-clip-edges.json` (f807/bridge/p1158/edges/gen_edges.py), test `pout-clip-edges.test.ts`.
- Matte / skin: white-matte cut (f807 sweep engine, leg-gap and arm/body pocket seeds; a 3 px dark-ring test keeps the shirt), then per-frame, per-zone LAB skin match to idle.png (decoded face dE ≤ 1.04, legs ≤ 1.5), then alpha-only speck/leg-fringe clear (0 near-white opaque px in the leg gap). Encode libaom crf 26, 480×1280 + alpha, 24 fps.

- p1 (2026-10-10, CoS 49aa88b): cold-load regression fixed. Each pair's readiness is its own (smug / wave never wait on the pout files and vice versa). The pout worker (it fetches on init) is created lazily after the first stage image, the smug / wave beat, blink and mouth, or at once when a Pout is wanted before that (then the stage stays on its current plates until 1158 f0 has decoded: no skip, no idle.png / pout_official flash). Face skin re-matched to idle in two feathered zones (whole face / lower face) with the AV1 encode bias pre-compensated; RGB only, alpha byte-identical. URLs carry `?v=p1`. Script: f807/bridge/p1158/p1/face_p1e.py.

- p2 (2026-10-10, CoS 30ea1fb): the p1 face retone also lifted the under-chin shadow (up to +16 L*), leaving a flat neck under a dotted jaw outline, and faded the mouth line. p2 retones only the face above the jaw line (per-frame jaw outline found as the top of the first solid dark run below the cheeks; 3 px feather ending 2 px above it). The neck / under-chin shadow, the jaw line and the mouth line + lips (3 px) keep their 49aa88b pixels. URLs carry `?v=p2`. Script: f807/bridge/p1158/p2/face_p2.py + zone.py.

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
