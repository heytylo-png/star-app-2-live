# star-app-2-live

**Live channel for Star Rai presence** — lean Vite + React SPA with the puppet (idle life, look-at, crossfades, Helix talk flap, framing), **optional xAI Grok brain**, offline `composeAct` fallback, browser TTS, Call mode, soft affection, and durable memory.

## Live URL

**https://heytylo-png.github.io/star-app-2-live/**

Open that link on a desktop or mobile browser. Optional: install as a home-screen app (below).

## Call mode

Tap the **phone** icon in the header.

- Continuous **listen → reply → speak** loop while the call is active (no hold-to-talk).
- After she finishes TTS, listening starts again automatically.
- **Barge-in:** tap the stage (or speak over her) to stop TTS and listen.
- Status shows **On call / Listening / Speaking**; **Hang up** ends the loop.
- Needs browser `SpeechRecognition` (Chrome / Edge / Android Chrome). If missing, she stays on typed chat + hold-to-talk when available.
- Normal text chat and PTT are unchanged when Call is off.

## Affection / relationship

Soft tier chip in the header: **Stranger → Familiar → Close → Devoted** (score 0–100 in `localStorage` / zustand, key `star-rai-affection`).

- Nudges up on greetings, compliments, chats, shared memories; tiny day-streak bonus.
- Decays slowly after unused days (lightweight).
- Brain (`RAI_SYSTEM` voice card + grok-4-latest MEMORY FACTS slots) can use streak/relationship when those slots are filled. Offline fallback uses pose-keyed lines from `artifacts/star-rai-local-brain.txt` — still in character, never gacha-loud.
- Optional streak shown as e.g. `Close · 3d`.

## Install on Samsung (PWA)

Open **https://heytylo-png.github.io/star-app-2-live/** in **Chrome** on your phone.

1. Tap the **⋮** menu (top right).
2. Choose **Install app** or **Add to Home screen**.
3. Confirm — Star Rai opens full-screen like a native app (standalone, portrait).

Works offline for the app shell + static assets (puppet art already on device after first visit). Chat with Grok still needs network + your key in Settings. Memory, affection, and the xAI key stay in `localStorage` on the device.

## Add a real Grok (xAI) brain

1. Get an API key from [console.x.ai](https://console.x.ai/).
2. Open the live app → **Settings** (gear) → paste the key → **Save key**.
3. The key is stored only in your browser as `localStorage["star-rai-xai-key"]`. It is **never** baked into the GitHub Pages build or committed.
4. Header status shows **Grok** when a key is saved, **Local** otherwise.
5. After save, the UI shows only the last 4 characters (`••••abcd`). Clear removes the key.

When a key is present, the client calls `https://api.x.ai/v1/chat/completions` with model `grok-4-latest` (fallbacks: `grok-4.6`, `grok-3`, `grok-2`). System prompt = baked voice card (`artifacts/star-rai-voice-card.txt` → `RAI_SYSTEM`) plus a compact **MEMORY FACTS** block (`artifacts/star-rai-memory-slots.txt`) of **filled slots only**:

```
MEMORY FACTS
name: Tylo
mood: tired
last_topic: talking at night
last_choice: wave
streak: 3 days
relationship: Close
role: photographer
date: saturday
time: 7pm
place: Shibuya
now_playing: lo-fi
mood_tag: cozy
```

Empty keys are omitted. `role` is sent only if they stated one (never a default cameraman). Meetup Chart (`date` / optional `time` / `place`) and Life (`now_playing` / `mood_tag`) are omitted unless a meetup or session actually filled them. Natal Chart v1 keys (`user_birth_date`, optional `user_birth_time` / `user_birth_place`, `user_sun`, `chart_source`) are omitted until first-launch setup (or a later birthday) fills them. `user_rising` is never sent. Her lore bio stays in the voice card under LORE USE — it is not a topic list.

When Chart v1 **fires** (once per local day while Chat is already in use, or when they asked), a separate **CHART** block is appended after MEMORY FACTS:

```
CHART
today_date: 2026-09-19
her_sun: Libra
user_sun: Aries
last_topic: rough day

Tint one line only. Never say "your reading for today is." Never list planets.
At most one you+me glance. Not a compatibility essay.
Prefer pose content|think|smug|tired|talk|idle. Never kiss.
```

`today_date` uses the **browser IANA timezone** (`Intl.DateTimeFormat().resolvedOptions().timeZone`), falling back to `America/Chicago`. Same local day does not fire again unless they asked. Ask-path (her sign / birthday / origin) and diary stay on the local brain so her bio is not dumped through Grok. Fail / CORS / bad JSON / no key → pose-keyed local brain (Chart tint pose when Chart fired). The model must not dump the slot list into `line`. Replies are JSON acts (`parseAct`). Streaming uses SSE when available; otherwise one-shot text is chunked into `onDelta` for mouth/caption UX.

If there is no key, CORS failure, timeout (~12s), bad JSON, or API error → pose-keyed local brain (`artifacts/star-rai-local-brain.txt`). She never breaks character about APIs. There is **no** Settings field for the voice card — only the xAI key (localStorage).

### CORS / optional proxy

Many browsers block direct `api.x.ai` calls (no CORS). Prefer trying direct first (default build). If chat stays on Local after saving a valid key, deploy the tiny Cloudflare Worker in [`worker/`](./worker/) and rebuild with:

```bash
VITE_GROK_PROXY_URL=https://YOUR_WORKER.workers.dev npm run build
```

The Worker forwards `POST /v1/chat/completions`, reads the key from `X-User-Key` or `Authorization`, and adds CORS headers. See [`worker/README.md`](./worker/README.md).

## What works offline (GitHub Pages)

| Feature | Behavior |
| --- | --- |
| Puppet / poses | Fully client-side (Helix talk flap) |
| Chat brain | Local pose-keyed `artifacts/star-rai-local-brain.txt`; optional Grok (`grok-4-latest`) when key present |
| Voice | Browser `SpeechSynthesis` (prefers female English when available) |
| Hold-to-talk | Browser `SpeechRecognition` when present; otherwise type |
| Call mode | Continuous listen→reply→speak + barge-in when SpeechRecognition present |
| Affection | `localStorage` (`star-rai-affection`) — tier chip + tone |
| Memory | `localStorage` (`star-rai-memory`) — compact slots + optional freeform notes |
| Chat threads | `localStorage` (`star-rai-chat`) |
| xAI key | `localStorage` (`star-rai-xai-key`) — browser only |

There is **no** server API on Pages (unless you deploy the optional Worker). Client also probes:

- `/star-app-2-live/api/chat`
- `/star-app-2-live/api/tts`

Future env: `VITE_API_BASE` — leave unset for pure Pages. `VITE_GROK_PROXY_URL` — optional CORS proxy base URL.

## Persist keys (stable)

- `star-rai-memory` — memory facts + compact slots (schema v2)
- `star-rai-chat` — threads + `voiceOn`
- `star-rai-xai-key` — optional xAI API key (never commit)
- `star-rai-affection` — affection score, last talk day, streak (schema v1)
- `star-rai-chart` — Chart v1 setup skip/done, last fire day, diary pages

Do not rename keys without a migrator. Document schema bumps here.


## Posing / PNGs

See **[POSING.md](./POSING.md)** for the drop-in guide:

- Morning official pack under `public/rai/` (`*_official.png`, `idle.png`, `peace.png`, `middle_finger.png`, `heart_official.png`)
- Live key → file table (`wave` → `wave_official.png`, `hold` → `hold_official.png`, `scold` → `scold_official.png`; `kiss` unmapped)
- Kept as-today: `turn`, `profile`, `three_quarter_left`, `three_quarter_right`; Helix extra `point` → `point-front.png`
- Voice card (`artifacts/star-rai-voice-card.txt`) is baked into `RAI_SYSTEM` at sync/build (`scripts/sync-star-rai-artifacts.js`); offline fallback is `artifacts/star-rai-local-brain.txt` (pose-keyed lines); memory-slot contract is `artifacts/star-rai-memory-slots.txt` (appended after the voice card on grok-4-latest, filled keys only). Chart v1 SoT is `artifacts/star-chart-v1.txt`. Do not edit `src/lib/generated/star-rai-artifacts.ts` by hand.

## Develop

```bash
npm install
npm run dev
```

## Build / deploy

```bash
npm run build
# base is /star-app-2-live/ (see vite.config.ts)
# push main, then force-push dist/ to gh-pages with .nojekyll
```

## Repo

https://github.com/heytylo-png/star-app-2-live
