# Star Rai posing — drop-in PNG guide

How to add new pose / idle art without breaking look-at or talk.

## Directory layout

```
public/
  star-rai/                 # Helix pack (default idle / look-at / talk framing)
    angles/
      front.png
      three-quarter.png
      side.png
      back.png
    poses/
      idle.png
      shy.png
      kiss.png
      wave.png
      hearts.png
      turn-away.png
    idle-talk.png           # mouth-open flap over angles.front while speaking
    lean-front.png
    scold-front.png
    point-front.png
    finger-front.png
  rai/                      # Expo pack (extra poses, alts, optional talk bust)
    front_hold.png
    three_quarter.png
    three_quarter_left.png
    three_quarter_right.png
    side_profile.png
    back_turn.png
    _alt_idle_smile.png
    _alt_grin_open.png
    _alt_hearts_open.png
    _alt_hearts_release.png
    front_idle.png          # alt bodies (optional)
    front_shy.png
    front_kiss.png
    front_wave.png
    front_hearts.png
    mouth_*.png             # Expo talk bust (USE_EXPO_TALK_BUST only)
    face_eyes_*.png
```

Keep **Helix under `public/star-rai/`**. Put Expo / mid-shot extras under **`public/rai/`**.

## Size / style tips

- **Aspect:** ~2:3 portrait mid-shot (chest-up / waist-up). Match existing Helix framing so crossfades don’t jump.
- **Backdrop:** clean white / light studio — same as live stage radial wash.
- **Shading:** soft cel-shade, consistent lighting from upper-front.
- **Safe area:** leave headroom at top for ahoge sway; don’t crop feet/hands at the frame edge if the pose needs them.
- **Opacity:** opaque character on transparent or white; talk flap (`idle-talk.png`) must align pixel-perfect with `angles/front.png`.
- **Export:** PNG, sRGB, no heavy compression artifacts on hair edges.

## Filename → pose id map

| Pose id | File | Pack |
| --- | --- | --- |
| `idle` | `star-rai/poses/idle.png` (+ look-at angles) | Helix |
| `shy` | `star-rai/poses/shy.png` | Helix |
| `kiss` | `star-rai/poses/kiss.png` | Helix |
| `wave` | `star-rai/poses/wave.png` | Helix |
| `hearts` | `star-rai/poses/hearts.png` | Helix |
| `turn-away` | `star-rai/poses/turn-away.png` | Helix |
| `lean` | `star-rai/lean-front.png` | Helix |
| `scold` | `star-rai/scold-front.png` | Helix |
| `point` | `star-rai/point-front.png` | Helix |
| `finger` | `star-rai/finger-front.png` | Helix |
| `hold` | `rai/front_hold.png` | Expo |
| `three_quarter` | `rai/three_quarter.png` | Expo |
| `three_quarter_left` | `rai/three_quarter_left.png` | Expo |
| `three_quarter_right` | `rai/three_quarter_right.png` | Expo |
| `profile` | `rai/side_profile.png` | Expo |

**Idle alts** (not act poses — puppet timer / `idleBeat`):

| Beat | File |
| --- | --- |
| smile | `rai/_alt_idle_smile.png` |
| grin | `rai/_alt_grin_open.png` |

Aliases accepted by `clampPose` / `normalizePose`: `turn_away`, `three-quarter`, `side-profile`, etc.

## Add a new pose in 3 steps

1. **Drop the file** into the right tree (`public/star-rai/…` for Helix-matched framing, `public/rai/` for Expo mid-shots).
2. **Wire it in code** (`src/lib/rai.ts`):
   - Add the id to `POSES`.
   - Add `SPRITES.poses.<id> = ASSET("…")`.
   - Optionally map aliases in `POSE_ALIASES`, mention it in `RAI_SYSTEM`, and teach `composeAct` / `intentToAct` in `brain.ts`.
3. **Redeploy** (or tell Starai):

   ```bash
   npm run build
   # push main + gh-pages (base `/star-app-2-live/`)
   ```

   After Pages updates, hard-refresh the live app so the new PNG is cached.

## Helix vs Expo packs

| | Helix (`star-rai/`) | Expo (`rai/`) |
| --- | --- | --- |
| Role | Default presence | Extra poses + idle alts |
| Idle | Look-at blend of `angles/*` | Brief `_alt_*` smile/grin beats |
| Talking | `angles/front` + `idle-talk` opacity flap | Mouth/eyes busts only if `USE_EXPO_TALK_BUST` |
| Framing | Stable mid-shot (no zoom jump) | Slightly different crop — don’t mix as default talk |
| Dedicated acts | shy / kiss / wave / hearts / turn-away / lean / scold / point / finger | hold / three_quarter* / profile |

**Talk path stays Helix** (`USE_EXPO_TALK_BUST = false`). `turn-away` remains special (no face / no flap).

## Idle variety (no fight look-at)

While `pose === idle`, not talking, and emotion is idle/happy, the puppet every **16–24s** may show `_alt_idle_smile` or `_alt_grin_open` for **~2.8–4.2s** (opacity fade ~400ms) **only when look angle is near front**. Side/back look-at is left alone. Idle beats never interrupt a dedicated act pose or an expressive emotion (angry/flirty/shy). Rare `finger` / `lean` beats come from the offline brain via emotion, not the timer.

**Act pose hold:** dedicated poses stay on screen at least **~3.4s** after they land (and **~2.8s after speech ends**, whichever is later). Talking does not snap a dedicated pose to Helix front — idle talking still uses Helix front + `idle-talk` flap.
