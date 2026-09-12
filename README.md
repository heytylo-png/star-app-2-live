# star-app-2-live

**Live channel for Star Rai presence** — lean Vite + React SPA with the puppet (idle life, look-at, crossfades, mouth, framing), local brain, browser TTS, and durable memory.

## Live URL

**https://heytylo-png.github.io/star-app-2-live/**

Open that link on a desktop or mobile browser. No install required.

## What works offline (GitHub Pages)

| Feature | Behavior |
| --- | --- |
| Puppet / poses | Fully client-side |
| Chat brain | Local `composeAct` (tsundere idol lines + memory) |
| Voice | Browser `SpeechSynthesis` (prefers female English when available) |
| Hold-to-talk | Browser `SpeechRecognition` when present; otherwise type |
| Memory | `localStorage` (`star-rai-memory`) — name, likes, city, job |
| Chat threads | `localStorage` (`star-rai-chat`) |

There is **no** server API on Pages. Optional future endpoints:

Client already probes:

- `/star-app-2-live/api/chat`
- `/star-app-2-live/api/tts`

Future env (when a backend exists): `VITE_API_BASE` — leave unset for pure Pages.

If those routes return OK, the client will use them; otherwise it stays on the local brain + browser voice.

## Persist keys (stable)

- `star-rai-memory` — memory facts (schema v1)
- `star-rai-chat` — threads + `voiceOn`

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
