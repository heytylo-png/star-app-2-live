# Optional xAI CORS proxy (Cloudflare Worker)

GitHub Pages is static. Browsers often block direct calls to `https://api.x.ai` (no CORS). This tiny Worker forwards chat completions and lets the SPA keep the API key in the browser only.

## Behavior

- Accepts `POST /v1/chat/completions` (and `OPTIONS` for CORS).
- Reads the user key from `X-User-Key` or `Authorization: Bearer …`.
- Forwards the JSON body to `https://api.x.ai/v1/chat/completions`.
- Does **not** store or log the key.
- Returns CORS headers so the Pages origin can call it.

## Deploy

```bash
# From this folder (requires wrangler + a Cloudflare account)
npx wrangler deploy
```

Copy the Worker URL, then rebuild the SPA with:

```bash
VITE_GROK_PROXY_URL=https://YOUR_WORKER.workers.dev npm run build
```

Leave `VITE_GROK_PROXY_URL` unset to try direct `api.x.ai` first (works if CORS is allowed; otherwise the app falls back to the offline brain).

Chart / sky facts are computed **in the browser** (`astronomy-engine`). Do not add a Worker `/sky` route for this pass and do not `wrangler deploy` for horoscope.

## Security note

The Worker is a CORS bypass, not a secret vault. It only forwards requests whose `Origin` header is on the allowlist in `wrangler.toml` (`ALLOWED_ORIGINS`: the Pages site and local Vite by default); anything else gets `403`. An `Origin` header can be forged outside a browser, so this stops other websites using your Worker, not a determined script. Callers always spend **their own** key. Add Cloudflare Access or rate limiting if you need tighter control.

If you serve the app from another origin, add it to `ALLOWED_ORIGINS` and run `npx wrangler deploy` again.
