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
- Brain (`composeAct` + Grok `RAI_SYSTEM` extra) shifts tone slightly with tier and can mention she noticed a multi-day gap — still tsundere, never gacha-loud.
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

When a key is present, the client calls `https://api.x.ai/v1/chat/completions` with model `grok-4-latest` (fallbacks: `grok-4.6`, `grok-3`, `grok-2`). System prompt = `RAI_SYSTEM` + memory facts + affection block. Replies must be JSON acts (`parseAct`). Streaming uses SSE when available; otherwise one-shot text is chunked into `onDelta` for mouth/caption UX.

If there is no key, CORS failure, or API error → existing offline brain (`composeAct`). She never breaks character about APIs.

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
| Chat brain | Local `composeAct` (tsundere idol lines + memory + affection); optional Grok when key present |
| Voice | Browser `SpeechSynthesis` (prefers female English when available) |
| Hold-to-talk | Browser `SpeechRecognition` when present; otherwise type |
| Call mode | Continuous listen→reply→speak + barge-in when SpeechRecognition present |
| Affection | `localStorage` (`star-rai-affection`) — tier chip + tone |
| Memory | `localStorage` (`star-rai-memory`) — name, likes, city, job |
| Chat threads | `localStorage` (`star-rai-chat`) |
| xAI key | `localStorage` (`star-rai-xai-key`) — browser only |

There is **no** server API on Pages (unless you deploy the optional Worker). Client also probes:

- `/star-app-2-live/api/chat`
- `/star-app-2-live/api/tts`

Future env: `VITE_API_BASE` — leave unset for pure Pages. `VITE_GROK_PROXY_URL` — optional CORS proxy base URL.

## Persist keys (stable)

- `star-rai-memory` — memory facts (schema v1)
- `star-rai-chat` — threads + `voiceOn`
- `star-rai-xai-key` — optional xAI API key (never commit)
- `star-rai-affection` — affection score, last talk day, streak (schema v1)

Do not rename keys without a migrator. Document schema bumps here.


## Posing / PNGs

See **[POSING.md](./POSING.md)** for the drop-in guide:

- Directory layout (`public/star-rai/` Helix look-at vs `public/rai/` official act poses)
- Filename → pose id map (voice-card list: wink, laugh, peace, middle_finger, … — never kiss)
- 3-step add: drop file → wire `POSES` / `SPRITES` in `src/lib/rai.ts` → redeploy
- Style tips (2:3 mid-shot, white studio, cel-shade) and Helix vs Expo differences

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
