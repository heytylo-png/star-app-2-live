/* Star Rai — minimal app-shell service worker.
 * Caches same-origin static assets for offline shell.
 * Does not intercept cross-origin (Grok / fonts) or mutate localStorage.
 *
 * Two caches:
 *   SHELL  — index.html + hashed /assets/ bundles. Named per build (the build
 *            stamps __BUILD_ID__), so a deploy drops the previous build's bundles.
 *   ASSETS — puppet art, icons and other unhashed files. Kept across deploys so
 *            the art is not re-downloaded every release. */
const SHELL = "star-rai-shell-__BUILD_ID__";
const ASSETS = "star-rai-assets-v1";
const BASE = "/star-app-2-live/";
const PRECACHE_SHELL = [BASE, BASE + "index.html"];
const PRECACHE_ASSETS = [
  BASE + "manifest.webmanifest",
  BASE + "icon-192.png",
  BASE + "icon-512.png",
  BASE + "icon-192-maskable.png",
  BASE + "icon-512-maskable.png",
  BASE + "apple-touch-icon.png",
  BASE + "favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL).then((cache) => cache.addAll(PRECACHE_SHELL)),
      caches.open(ASSETS).then((cache) => cache.addAll(PRECACHE_ASSETS)),
    ])
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Leave cross-origin alone (api.x.ai, Google Fonts, etc.)
  if (url.origin !== self.location.origin) return;

  // Never cache API probes / future backends
  if (url.pathname.includes("/api/")) return;

  // App navigations → network-first, offline shell fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(SHELL).then((c) => c.put(BASE + "index.html", copy));
          return res;
        })
        .catch(() =>
          caches.match(BASE + "index.html").then((r) => r || caches.match(BASE)),
        ),
    );
    return;
  }

  // Same-origin static → cache-first, then network + warm cache
  const cacheName = url.pathname.startsWith(BASE + "assets/") ? SHELL : ASSETS;
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            void caches.open(cacheName).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
