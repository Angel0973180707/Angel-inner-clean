// sw.js (Stable Release) — Core precache + Audio network-first
const CACHE_NAME = "angel-v11";          // 👈 每次要強制更新，就改這個版本號
const CORE_CACHE = `${CACHE_NAME}-core`;
const RUNTIME_CACHE = `${CACHE_NAME}-runtime`;

// ✅ 只預快取「核心檔」：讓離線能打開、版本好控管
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.png",
  "./icon-512.png"
];

// --- Install: precache core ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting(); // 讓新 SW 盡快進入等待接管
});

// --- Activate: clean old caches ---
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => !k.startsWith(CACHE_NAME))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim(); // 立刻接管已開啟的頁面
  })());
});

// --- Helpers ---
function isAudioRequest(req) {
  try {
    const url = new URL(req.url);
    return url.pathname.endsWith(".mp3") || url.pathname.endsWith(".wav") || url.pathname.endsWith(".ogg");
  } catch {
    return false;
  }
}

function isNavigationRequest(event) {
  return event.request.mode === "navigate";
}

// --- Fetch Strategy ---
// 1) Navigation (App shell): cache-first (core), fallback to network
// 2) Audio: network-first, fallback to cache (避免卡舊音檔)
// 3) Others: stale-while-revalidate (順滑但仍可更新)
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // 只處理 GET
  if (req.method !== "GET") return;

  // ① App shell：離線也能開
  if (isNavigationRequest(event)) {
    event.respondWith((async () => {
      const cache = await caches.open(CORE_CACHE);
      const cached = await cache.match("./index.html");
      if (cached) return cached;

      // 理論上不會走到這裡，但保底
      const res = await fetch(req);
      cache.put("./index.html", res.clone());
      return res;
    })());
    return;
  }

  // ② 音檔：網路優先（避免一直吃舊的），失敗才用快取備援
  if (isAudioRequest(req)) {
    event.respondWith((async () => {
      const runtime = await caches.open(RUNTIME_CACHE);

      try {
        const res = await fetch(req, { cache: "no-store" });
        // 只在成功回應才更新快取
        if (res && res.ok) runtime.put(req, res.clone());
        return res;
      } catch (e) {
        const cached = await runtime.match(req);
        if (cached) return cached;
        // 真的完全沒網路、也沒快取，就丟回原錯（前端可顯示提示）
        throw e;
      }
    })());
    return;
  }

  // ③ 其他檔案：stale-while-revalidate（先回快取，再更新快取）
  event.respondWith((async () => {
    const runtime = await caches.open(RUNTIME_CACHE);
    const cached = await runtime.match(req);

    const fetchPromise = fetch(req)
      .then((res) => {
        if (res && res.ok) runtime.put(req, res.clone());
        return res;
      })
      .catch(() => null);

    return cached || (await fetchPromise) || Response.error();
  })());
});

// --- Optional: allow page to trigger skipWaiting via postMessage ---
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
