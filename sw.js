/* Angel Service Worker
 * 更新方法：改 CACHE_NAME 版本號（例如 angel-v6 -> angel-v7）
 */

const CACHE_NAME = "angel-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./sw.js",
  "./icon.png"
];

// install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// fetch (offline-first for app shell)
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // 只處理 GET
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          // 同源才快取（避免 CORS 音源等外部資源造成問題）
          const url = new URL(req.url);
          if (url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // 斷網時，至少保證能回到首頁
          return caches.match("./");
        });
    })
  );
});
