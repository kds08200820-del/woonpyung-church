/* 운평장로교회 PWA 서비스 워커
   네트워크 우선(online 시 항상 최신) + 오프라인 시 캐시 폴백 */
const CACHE = "unpyeong-v8";
const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./images/icon-192.png",
  "./images/icon-512.png",
  "./images/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((r) => r || caches.match("./index.html"))
      )
  );
});
