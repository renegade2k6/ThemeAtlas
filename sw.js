// Theme Atlas service worker.
// Strategy:
//   - HTML/CSS/JS  → cache-first (they're content-hashed via the build step)
//   - themes/*.json → stale-while-revalidate (users see new themes on next
//     visit without forcing a full reload)
//   - everything else → network-first, fall back to cache
//
// The CACHE_NAME is injected at build time by tools/build-themes.mjs;
// the placeholder below is replaced during `npm run build`.

const CACHE_NAME = "theme-atlas-2026-06-08-b9cfce40";
const RUNTIME_CACHE = "theme-atlas-runtime-2026-06-08-b9cfce40";

const PRECACHE = [
  "./",
  "index.html",
  "404.html",
  "site.webmanifest",
  "robots.txt",
  "assets/app.css",
  "assets/app.js",
  "assets/app-utils.mjs",
  "assets/theme-viewer-icon.svg",
  "assets/theme-atlas-og.svg",
  "themes/index.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim(),
    ])
  );
});

function isThemeAsset(url) {
  return url.pathname.startsWith("/themes/") && url.pathname.endsWith(".json");
}

function isStaticAsset(url) {
  return (
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".mjs") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webmanifest")
  );
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Stale-while-revalidate for theme JSON files
  if (isThemeAsset(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Cache-first for hashed static assets
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        }).catch(() => caches.match("index.html"));
      })
    );
    return;
  }

  // Default: network, fall back to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Allow the page to tell the new worker to take over immediately
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
