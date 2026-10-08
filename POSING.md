# Star Rai posing — drop-in PNG guide

How to add new pose art without breaking talk hold or crossfades.

## Directory layout

```
public/
  rai/                      # Morning official pack (live chat keys) + kept Expo extras
    idle.png
    talk_official.png
    peace.png
    middle_finger.png
    wink_official.png
    laugh_official.png
    think_official.png
    pout_official.png
    tired_official.png
    smug1085_hold.webp      # smug hold (1085 at 2.000 s); bridge clips: smug1085_in.avif (0-2 s), smug1084_out.avif (full)
    wave1126_hold.webp      # wave hold (1126 at 4.000 s); bridge clips: wave1126_in.avif (0-4 s), wave1140_out.avif (full)
    wave_official.png       # TyLo's 2026-10-06 wave still (1008×1792 RGBA, white-matte cut, no re-tone). Not on the Wave key. Not poses/wave.png / front_wave.png
    hold_official.png       # NOT front_hold.png
    embarrassed_official.png
    scold_official.png      # live scold key — scold-front.png stays on disk unused
    shy_official.png        # pre-cut RGBA (PRE_CUT_ALPHA_FILES, no runtime punch)
    sad_official.png
    surprise_official.png
    content_official.png
    heart_official.png
    three_quarter.png
    three_quarter_left.png
    three_quarter_right.png
    side_profile.png
  star-rai/                 # Kept Helix extras (not the live wave/hold/kiss keys)
    poses/turn-away.png     # live `turn` key
    point-front.png         # live `point` / "point at me"
    finger-front.png        # on disk; live alias → middle_finger
    scold-front.png         # on disk; live `scold` → scold_official.png
    lean-front.png          # unused for live keys
    poses/kiss.png          # unmapped
```

Live chat keys use the **morning official pack** under `public/rai/`. Do not point `wave` / `hold` at Expo `front_wave` / `front_hold` or the old Helix `wave.png`.

## Filename → pose id map (live keys)

| Pose id | File |
| --- | --- |
| `idle` | `rai/idle.png` |
| `talk` | `rai/talk_official.png` |
| `peace` | `rai/peace.png` |
| `middle_finger` | `rai/middle_finger.png` |
| `wink` | `rai/wink_official.png` |
| `laugh` | `rai/laugh_official.png` |
| `think` | `rai/think_official.png` |
| `pout` | `rai/pout_official.png` |
| `tired` | `rai/tired_official.png` |
| `smug` | `rai/smug1085_hold.webp` |
| `wave` | `rai/wave1126_hold.webp` via the idle↔wave 1126/1140 video bridge (1126 0–4.0 s, hold on the 4.0 s smile frame, 1140 out; TyLo 2026-10-08, replaces 1110/1114). `rai/wave_official.png` is TyLo's 2026-10-06 still (right hand up waving, left hand on hip, glare, sailor uniform): white-matte cut, uniform ×1.4 onto the 1008×1792 idle canvas, feet line = idle, pixels as supplied (no re-tone). It replaces the old retoned dark sheet and is not painted by the live Wave key. Not `star-rai/poses/wave.png` (Helix 1152×1728 3/4) and not `rai/front_wave.png` (Expo alt). |
| `hold` | `rai/hold_official.png` |
| `embarrassed` | `rai/embarrassed_official.png` |
| `scold` | `rai/scold_official.png` |
| `shy` | `rai/shy_official.png` |
| `sad` | `rai/sad_official.png` |
| `surprise` | `rai/surprise_official.png` |
| `content` | `rai/content_official.png` |
| `hearts` | `rai/heart_official.png` |
| `turn` | `star-rai/poses/turn-away.png` (unchanged) |
| `profile` | `rai/side_profile.png` (unchanged) |
| `three_quarter_left` | `rai/three_quarter_left.png` (unchanged) |
| `three_quarter_right` | `rai/three_quarter_right.png` (unchanged) |

**Helix extra (not in the Grok pose list):** `point` → `star-rai/point-front.png`. Also `three_quarter` → `rai/three_quarter.png`.

**Aliases** (`normalizePose` / named commands):

- `finger-front` / `finger-point` / `finger` → `middle_finger` (file stays `star-rai/finger-front.png` on disk)
- `point` / `point at me` / `point-front` → `point` (do not wipe `point-front.png`)
- `scold-front` as a name → live `scold` (`scold_official.png`); `scold-front.png` stays on disk
- `turn-away` → `turn`
- `heart` → `hearts`

**Unmapped:** `kiss` — no sheet, no command. Keep the current body if requested.

## Transparent cuts (pre-cut RGBA pose sheets)

Most pose sheets are offline white-matte cuts (true RGBA, studio card removed, enclosed gaps in the hair and between the legs transparent, no gAMA/cHRM/iCCP). They sit in `PRE_CUT_ALPHA_FILES` (`src/lib/rai.ts`), so the runtime punch-white does not run on them, and their URLs carry `?v=${PRE_CUT_ALPHA_VERSION}` (now `rgba3`) so a service worker holding the old RGB copy is bypassed (sw CACHE `star-rai-shell-v6`).

Cut (each keeps its own canvas): `shy`, `wink`, `laugh`, `surprise`, `smug`, `content`, `sad`, `hearts`, `hold`, `talk`, `think` (720×1264), `embarrassed`, `pout`, `middle_finger`, `scold`, `tired` (all 720×1280), `peace` (843×1500), `profile`, `three_quarter_left`, `three_quarter_right` (768×1168). `pre-cut-alpha.test.ts` pins every sha256 and size.

Still RGB-on-white with the runtime punch (edges not chosen yet): `three_quarter` (grey fringe), `wave` (RGBA with holes), `turn` (`star-rai/poses/turn-away.png`), and `point` (room scene, nothing to cut).

Tone: the old `*_official` sheets and `middle_finger` carried `gAMA 0.50994`, which Chrome applies, so they rendered darker than their raw pixels. The cuts drop the tag and render raw, so those 15 sheets read lighter than before (same as shy, closer to idle/wave): about +8 luma levels on the figure, 7–10% (skin about 6%). `peace` (sRGB ICC), `side_profile`, `three_quarter_left` and `three_quarter_right` had no gamma tag, so their colours are unchanged. Re-cutting a sheet means a new sha pin and a version bump.

## Pose bridge (idle ↔ smug)

The only bridged pair so far. Two video clips, `rai/smug1085_in.avif` (entry, 0–2.0 s) and `rai/smug1084_out.avif` (exit, full length), played at their native 24 fps by the clip worker between the live `idle.png` and the hold `smug1085_hold.webp`; they are not poses and have no live key. Reduced motion and every other pose pair keep the normal change. It plays on spoken smug replies too (voice on or off); a normal talk line on idle never changes pose so never bridges. See [ANIMATION.md](./ANIMATION.md) "Pose bridge" for the order, timing, interrupts, and how to add a pair.

## Talking

- Speech stays on idle (`SPOKEN_TALK_TO_IDLE`, TyLo 2026-09-27). Bratty, a model `talk` key, and Music / Chart / life / clock `talk` tints all land on `idle` for a spoken line, and the idle talking mouth plays on the rest sheet (see [ANIMATION.md](./ANIMATION.md)).
- Live key `talk` still maps to `talk_official.png` (dedicated). It only shows when the user names it ("talk"); it then holds through that bubble.
- Mood sheets still hold their PNG through the spoken bubble; frown idle is not snapped in under a mood line.
- Other dedicated poses still hold their own PNG through speech (PR #1). No mouth overlay on those sheets.
- Reduced motion: same mood/named sheets; idle holds the closed mouth (no flap).
- Motion model: [ANIMATION.md](./ANIMATION.md).

## Add a new pose in 3 steps

1. Drop the file into `public/rai/` (or `public/star-rai/` only for kept Helix extras).
2. Wire it in `src/lib/rai.ts`: `POSES`, `LIVE_POSE_FILES` / `SPRITES.poses`, `POSE_ALIASES`. Mention it in `artifacts/star-rai-voice-card.txt` only if Grok may pick it, then run `npm run sync:artifacts`. Add pose-keyed lines to `artifacts/star-rai-local-brain.txt` for the offline fallback. Memory slots live in `artifacts/star-rai-memory-slots.txt` (facts after the voice card — not pose art). Clock / NOW is `artifacts/star-rai-clock.txt` (compact fact, not a pose).
3. Redeploy (`npm run build`, push `main`, deploy `dist` to `gh-pages`). Hard-refresh the live app.

## Act pose hold

A spoken line keeps its mood or named sheet on that bubble (a plain line stays on idle with the mouth), including while the caption is still the reply. Frown `idle.png` is not that line. The next rest — caption cleared, no spoken bubble — may settle to the rest sheet (01 open, a byte copy of `idle.png`) after the usual hold (~3.4s from landing, at least ~2.8s; smug instead holds its beat: line landing + reading time or speech end, + 1.5s). Rest blink is on (`IDLE_BLINK_ENABLED` is true), approved by TyLo on 2026-09-26 (807-referenced painted lids, pass 4b). Body-sheet crossfade ~380ms. Talking does not snap a dedicated pose (including `talk`) to frown idle.
