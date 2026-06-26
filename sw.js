/* 운평장로교회 서비스 워커 — 네트워크 전용(항상 최신 파일)
   기존 캐시를 모두 비우고, 더 이상 앱 파일을 캐시하지 않습니다.
   (잦은 업데이트 중 옛 파일이 남는 문제를 방지) */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
