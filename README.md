# star-app-2-live

**Live channel for Star Rai presence** — lean Vite + React SPA with the puppet (idle life, look-at, crossfades, mouth, framing), **optional xAI Grok brain**, offline `composeAct` fallback, browser TTS, and durable memory.

## Live URL

**https://heytylo-png.github.io/star-app-2-live/**

Open that link on a desktop or mobile browser. No install required.

## Add a real Grok (xAI) brain

1. Get an API key from [console.x.ai](https://console.x.ai/).
2. Open the live app → **Settings** (gear) → paste the key → **Save key**.
3. The key is stored only in your browser as `localStorage["star-rai-xai-key"]`. It is **never** baked into the GitHub Pages build or committed.
4. Header status shows **Grok** when a key is saved, **Local** otherwise.
5. After save, the UI shows only the last 4 characters (`••••abcd`). Clear removes the key.

When a key is present, the client calls `https://api.x.ai/v1/chat/completions` with model `grok-4-latest` (fallbacks: `grok-4.6`, `grok-3`, `grok-2`). System prompt = `RAI_SYSTEM` + memory facts. Replies must be JSON acts (`parseAct`). Streaming uses SSE when available; otherwise one-shot text is chunked into `onDelta` for mouth/caption UX.

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
| Puppet / poses | Fully client-side |
| Chat brain | Local `composeAct` (tsundere idol lines + memory); optional Grok when key present |
| Voice | Browser `SpeechSynthesis` (prefers female English when available) |
| Hold-to-talk | Browser `SpeechRecognition` when present; otherwise type |
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

Do not rename keys without a migrator. Document schema bumps here.

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
