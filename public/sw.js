/* HaftDast service worker.
 * - Hashed build assets (/_next/static) are cached forever (cache-first).
 * - Pages are network-first with a cache fallback, so bot games keep working offline.
 * - Socket.IO traffic is never intercepted.
 */
const VERSION = "v2";
const STATIC_CACHE = `haftdast-static-${VERSION}`;
const PAGE_CACHE = `haftdast-pages-${VERSION}`;
const PRECACHE = [
  "/fa",
  "/en",
  "/fa/play",
  "/en/play",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/cards/back.svg?v=2",
  "/ornament/palmette.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("haftdast-") && k !== STATIC_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/socket.io")) return;

  // Build assets and fonts: cache first.
  if (
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/cards/") ||
    url.pathname.startsWith("/ornament/")
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navigations and the rest: network first, fall back to cache.
  if (request.mode === "navigate" || request.destination === "document" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.open(PAGE_CACHE).then(async (cache) => {
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          const hit = await cache.match(request, { ignoreSearch: true });
          if (hit) return hit;
          // Offline and never visited: serve the Persian home page as the app shell.
          const shell = await cache.match("/fa");
          return shell ?? Response.error();
        }
      }),
    );
  }
});
