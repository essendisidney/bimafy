/* Bimafy service worker: makes the app installable and usable with no signal.
 *
 * - Build assets (/_next/static, content-hashed): cache first, kept across deploys
 *   so a cached page can always find its scripts.
 * - Pages: network first (fresh when online), falling back to the last copy seen,
 *   then to /offline for pages never opened on this device.
 * - Icons, fonts, images: stale-while-revalidate.
 * - API routes, non-GET requests and other origins (Supabase) are never touched;
 *   offline writes are queued by the app itself (src/lib/outbox.ts).
 */
const VERSION = "v4";
const PAGES = `bimafy-pages-${VERSION}`;
const ASSETS = "bimafy-assets"; // hashed file names: never needs versioning
const STATIC = `bimafy-static-${VERSION}`;
const OFFLINE_URL = "/offline";
// Opened ahead of time so an agent can work offline right after installing.
const WARM_PAGES = [OFFLINE_URL, "/app/agent", "/app/dashboard", "/app/quotes/new"];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      await Promise.all(WARM_PAGES.map((url) => warm(pages, url).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, ASSETS, STATIC]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => (n.startsWith("bimafy-") || n.startsWith("insurax-")) && !keep.has(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  // The app asks to keep pages the agent just opened (e.g. after sign-in).
  if (event.data?.type === "warm" && Array.isArray(event.data.urls)) {
    event.waitUntil(
      caches.open(PAGES).then((pages) =>
        Promise.all(
          event.data.urls
            .filter(isAppPath)
            // Already saved pages are refreshed by normal (network-first) visits.
            .map(async (url) => ((await pages.match(pathOnly(url))) ? undefined : warm(pages, url).catch(() => undefined))),
        ),
      ),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(page(event));
  } else if (/\.(?:png|svg|ico|jpg|jpeg|webp|woff2?|webmanifest)$/.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(request, event));
  }
  // Everything else (RSC payloads for client navigation, data) goes straight to the network;
  // when that fails offline, Next falls back to a full navigation, which `page` serves.
});

/** Fetch a page and the build assets it references, so it opens with no signal. */
async function warm(pages, url) {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok || response.redirected) return;
  await pages.put(pathOnly(url), response.clone());
  const html = await response.text();
  const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? []);
  const cache = await caches.open(ASSETS);
  await Promise.all(
    [...assets].map(async (asset) => {
      if (await cache.match(asset)) return;
      const res = await fetch(asset);
      if (res.ok) await cache.put(asset, res);
    }),
  );
}

async function page(event) {
  const { request } = event;
  const pages = await caches.open(PAGES);
  const key = pathOnly(request.url);
  const network = (async () => {
    const response = (await event.preloadResponse) || (await fetch(request));
    if (response.ok && !response.redirected && response.type === "basic") await pages.put(key, response.clone());
    return response;
  })();
  event.waitUntil(network.catch(() => undefined));
  // Query strings (?lead=…) only steer client state, so any copy of the page will do.
  const cached = async () => (await pages.match(key)) || (await pages.match(request, { ignoreSearch: true }));
  try {
    // On a slow connection, show the saved copy after a few seconds (if there is one)
    // while the fresh page still lands in the cache for next time.
    return await Promise.race([network, delay(NETWORK_TIMEOUT_MS).then(async () => (await cached()) || network)]);
  } catch {
    return (
      (await cached()) ||
      (await pages.match(OFFLINE_URL)) ||
      new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } })
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) return cache.put(request, response.clone()).then(() => response);
      return response;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) || Response.error();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pathOnly(href) {
  const url = new URL(href, self.location.origin);
  return url.origin + url.pathname;
}

function isAppPath(url) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/api/");
}
