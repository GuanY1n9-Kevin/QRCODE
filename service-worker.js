const CACHE_NAME = "polyunion-qr-web-v0.8";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

const STARTUP_ENGINE_ASSETS = [
  "./vendor/zxing/index.js",
  "./vendor/zxing/zxing_reader.wasm"
];

async function cacheAvailableAssets(cache, urls) {
  await Promise.allSettled(
    urls.map(async url => {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`${response.status}: ${url}`);
      await cache.put(url, response);
    })
  );
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        await cacheAvailableAssets(cache, APP_ASSETS);
        await cacheAvailableAssets(cache, STARTUP_ENGINE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isVendorAsset = url.pathname.includes("/vendor/");

  if (isVendorAsset) {
    // Engine files are cached only when they are actually requested.
    // This keeps the opening screen responsive and avoids parsing OpenCV
    // before the user starts a deep scan.
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;

        return fetch(event.request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, copy))
              .catch(() => {});
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for HTML and app shell so updates take effect quickly.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request)
          .then(cached => cached || caches.match("./index.html"))
      )
  );
});
