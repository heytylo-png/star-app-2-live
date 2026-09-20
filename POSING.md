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
    smug_official.png
    wave_official.png       # NOT wave.png / front_wave.png
    hold_official.png       # NOT front_hold.png
    embarrassed_official.png
    scold_official.png      # live scold key — scold-front.png stays on disk unused
    shy_official.png
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
| `smug` | `rai/smug_official.png` |
| `wave` | `rai/wave_official.png` |
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

## Talking

- Live key `talk` uses `talk_official.png` (dedicated; holds ~3.4s / ~2.8s after speech like other non-idle poses).
- Idle + speaking uses the same official talk sheet (full body, not Helix `idle-talk` overlay).
- Other dedicated poses still hold their own PNG through speech (PR #1). No mouth overlay on those sheets.

## Add a new pose in 3 steps

1. Drop the file into `public/rai/` (or `public/star-rai/` only for kept Helix extras).
2. Wire it in `src/lib/rai.ts`: `POSES`, `LIVE_POSE_FILES` / `SPRITES.poses`, `POSE_ALIASES`. Mention it in `artifacts/star-rai-voice-card.txt` only if Grok may pick it, then run `npm run sync:artifacts`. Add pose-keyed lines to `artifacts/star-rai-local-brain.txt` for the offline fallback. Memory slots live in `artifacts/star-rai-memory-slots.txt` (facts after the voice card — not pose art). Clock / NOW is `artifacts/star-rai-clock.txt` (compact fact, not a pose).
3. Redeploy (`npm run build`, push `main`, deploy `dist` to `gh-pages`). Hard-refresh the live app.

## Act pose hold (unchanged from PR #1)

Dedicated poses stay on screen at least **~3.4s** after they land (and **~2.8s after speech ends**, whichever is later). Crossfade ~340ms. Talking does not snap a dedicated pose to idle/talk unless the pose is idle (then the talk sheet is the idle-talk path).
