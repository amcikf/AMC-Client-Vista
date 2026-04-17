const CACHE_NAME = "amc-hours-tracker-v61";
const CORE_ASSETS = ["./", "./index.html", "./styles.css?v=20260461", "./IKF.png?v=20260447", "./app.js?v=20260461"];
const EXTERNAL_ASSETS = [
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js",
  "https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Manrope:wght@400;500;600;700&display=swap",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS);
      await Promise.all(
        EXTERNAL_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, { mode: "no-cors" });
            await cache.put(url, response);
          } catch (error) {
            console.warn("Skipping external asset during install:", url, error);
          }
        }),
      );
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  if (!event.request.url.startsWith("http://") && !event.request.url.startsWith("https://")) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (shouldBypassCache(requestUrl)) {
    return;
  }
  const isNavigationRequest = event.request.mode === "navigate" || event.request.destination === "document";
  const isHtmlAsset = requestUrl.pathname.endsWith(".html") || requestUrl.pathname === "/";

  if (isNavigationRequest || isHtmlAsset) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse || caches.match("./index.html"))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return networkResponse;
        })
        .catch(() => caches.match("./index.html"));
    }),
  );
});

function shouldBypassCache(requestUrl) {
  if (requestUrl.pathname.startsWith("/api/")) {
    return true;
  }

  if (requestUrl.hostname === "docs.google.com" || requestUrl.hostname === "drive.google.com" || requestUrl.hostname === "www.googleapis.com") {
    return true;
  }

  return false;
}
