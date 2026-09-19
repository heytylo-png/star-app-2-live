# Star Rai posing — drop-in PNG guide

How to add new pose / idle art without breaking look-at or talk.

## Directory layout

There is no `assets/rai/` tree in this repo. **Shipped sprites live under `public/rai/`** (Vite static). Helix look-at stays under `public/star-rai/`.

```
public/
  star-rai/                 # Helix pack (idle look-at / life rig)
    angles/
      front.png
      three-quarter.png
      side.png
      back.png
    idle-talk.png           # Helix mouth-open (opt-in Expo/Helix flap only)
    poses/                  # legacy Helix bodies (not the live act catalog)
    *-front.png             # legacy extras
  rai/                      # Official act poses + Expo leftovers
    idle.png
    talk.png
    peace.png
    middle_finger.png
    wink.png
    laugh.png
    think.png
    pout.png
    tired.png
    smug.png
    wave.png
    hold.png
    embarrassed.png
    scold.png
    shy.png
    sad.png
    surprise.png
    content.png
    hearts.png
    hearts-smile.png        # idle-beat smile alt
    turn.png
    side_profile.png        # pose id: profile (no zip replacement)
    three_quarter_left.png  # no zip replacement — keep Expo
    three_quarter_right.png
    _alt_grin_open.png      # idle-beat grin
    mouth_*.png             # Expo talk bust (USE_EXPO_TALK_BUST only)
    face_eyes_*.png
```

Keep **Helix look-at under `public/star-rai/angles/`**. Put official act sheets under **`public/rai/{poseId}.png`**.

## Allowed pose ids (voice card)

`idle`, `talk`, `peace`, `middle_finger`, `wink`, `laugh`, `think`, `pout`, `tired`, `smug`, `wave`, `hold`, `embarrassed`, `scold`, `shy`, `sad`, `surprise`, `content`, `hearts`, `turn`, `profile`, `three_quarter_left`, `three_quarter_right`

**Never kiss. Never invent a sheet.** Omit pose in JSON = keep the current body.

## Size / style tips

- **Aspect:** ~2:3 portrait mid-shot (chest-up / waist-up) or matching official 720×1280 full-body.
- **Backdrop:** clean white / light studio — same as live stage radial wash.
- **Shading:** soft cel-shade, consistent lighting from upper-front.
- **Safe area:** leave headroom at top for ahoge sway; don’t crop feet/hands at the frame edge if the pose needs them.
- **Export:** PNG, sRGB, no heavy compression artifacts on hair edges.

## Filename → pose id map

| Pose id | File | Notes |
| --- | --- | --- |
| `idle` | `rai/idle.png` | Zip `idle.png`. Look-at still uses Helix `angles/*` while idle. |
| `talk` | `rai/talk.png` | Zip `talk_official.png`. Idle+speech uses this sheet. |
| `peace` | `rai/peace.png` | Zip `peace.png` (no official). |
| `middle_finger` | `rai/middle_finger.png` | Zip `middle_finger.png`. Not `finger-front.png`. |
| `wink` | `rai/wink.png` | Zip `wink_official.png` |
| `laugh` | `rai/laugh.png` | Zip `laugh_official.png` |
| `think` | `rai/think.png` | Zip `think_official.png` |
| `pout` | `rai/pout.png` | Zip `pout_official.png` |
| `tired` | `rai/tired.png` | Zip `tired_official.png` |
| `smug` | `rai/smug.png` | Zip `smug_official.png` |
| `wave` | `rai/wave.png` | Zip `wave_official.png` |
| `hold` | `rai/hold.png` | Zip `hold_official.png` |
| `embarrassed` | `rai/embarrassed.png` | Zip `embarrassed_official.png` |
| `scold` | `rai/scold.png` | Zip `scold_official.png` |
| `shy` | `rai/shy.png` | Zip `shy_official.png` |
| `sad` | `rai/sad.png` | Zip `sad_official.png` |
| `surprise` | `rai/surprise.png` | Zip `surprise_official.png` |
| `content` | `rai/content.png` | Zip `content_official.png` |
| `hearts` | `rai/hearts.png` | Zip `heart_official.png` |
| `turn` | `rai/turn.png` | Zip `turn-away.png` (alias `turn-away`) |
| `profile` | `rai/side_profile.png` | Existing Expo — zip had no replacement |
| `three_quarter_left` | `rai/three_quarter_left.png` | Existing Expo |
| `three_quarter_right` | `rai/three_quarter_right.png` | Existing Expo |

**Idle alts** (not act poses — puppet timer / `idleBeat`):

| Beat | File |
| --- | --- |
| smile | `rai/hearts-smile.png` (zip `hearts-smile.png`) |
| grin | `rai/_alt_grin_open.png` |

Aliases accepted by `clampPose` / `normalizePose`: `turn-away` → `turn`, `thinking` → `think`, `heart` → `hearts`, `finger`/`point` → `think` (not middle finger). `kiss` is rejected.

## Add a new pose in 3 steps

1. **Drop the file** into `public/rai/{id}.png` (Helix-matched look-at stays in `public/star-rai/angles/`).
2. **Wire it in code** (`src/lib/rai.ts`):
   - Add the id to `POSES` (voice-card list only).
   - Add `SPRITES.poses.<id> = ASSET("rai/…")`.
   - Optionally map aliases in `POSE_ALIASES`, mention it in `RAI_SYSTEM`, and teach `composeAct` / `intentToAct` in `brain.ts`.
3. **Redeploy** (or tell Starai):

   ```bash
   npm run build
   # push main + gh-pages (base `/star-app-2-live/`)
   ```

   After Pages updates, hard-refresh the live app so the new PNG is cached.

## Helix vs official pack

| | Helix (`star-rai/`) | Official (`rai/`) |
| --- | --- | --- |
| Role | Idle look-at life | Act poses + talk sheet |
| Idle | Look-at blend of `angles/*` | Brief `hearts-smile` / `_alt_grin_open` beats |
| Talking | Unused unless Expo busts on | Dedicated pose holds; idle+talk → `rai/talk.png` |
| Dedicated acts | — | Voice-card list above |

**Talk path:** idle + speaking shows `rai/talk.png`. A dedicated non-idle pose keeps that PNG through speech. `USE_EXPO_TALK_BUST` stays false.

## Idle variety (no fight look-at)

While `pose === idle`, not talking, and emotion is bratty/hype, the puppet every **16–24s** may show `hearts-smile` or `_alt_grin_open` for **~2.8–4.2s** (opacity fade ~400ms) **only when look angle is near front**. Side/back look-at is left alone. Idle beats never interrupt a dedicated act pose or an expressive emotion (shy/smug/tired).

**Act pose hold:** dedicated poses stay on screen at least **~3.4s** after they land (and **~2.8s after speech ends**, whichever is later). Talking does not snap a dedicated pose to the talk sheet.

## Emotions (voice card)

`bratty` (default) | `smug` | `tired` | `shy` | `soft` | `hype` | `glance`

Omit emotion = bratty. Omit pose = keep current sheet.
