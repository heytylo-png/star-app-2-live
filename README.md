# star-app-2-live

**This IS the live app channel for star-app-2 presence work.**

Lean Vite + React SPA shipping the Star Rai puppet (idle life, look-at, crossfades, mouth, framing) from the `presence/puppet-life` branch — without the broken TanStack/Grok Build scaffold.

- Live URL: https://heytylo-png.github.io/star-app-2-live/
- Source of truth for playable presence demos (not GitHub source browsing alone)
- Offline demo chat/TTS fallbacks when APIs are unavailable

## Develop

```bash
npm install
npm run dev
```

## Build / deploy

```bash
npm run build
# push main + deploy dist to gh-pages (with .nojekyll)
```

`base` is `/star-app-2-live/` for GitHub Pages.
