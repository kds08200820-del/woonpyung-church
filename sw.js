/* 운평장로교회 서비스 워커 — 항상 최신 파일 강제
   HTML/CSS/JS는 브라우저 HTTP 캐시까지 우회(no-store)해 항상 새로 받습니다.
   (업데이트 후 옛 화면이 남는 캐시 문제 방지) */
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
  let url;
  try { url = new URL(e.request.url); } catch (_) { return; }

  // 페이지·스크립트·스타일은 항상 네트워크에서 새로(브라우저 캐시 우회)
  const freshNeeded =
    e.request.mode === "navigate" ||
    (url.origin === self.location.origin && /\.(?:html|js|css)(?:\?|$)/.test(url.pathname + url.search));

  if (freshNeeded) {
    e.respondWith(
      fetch(e.request.url, { cache: "no-store" }).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  }
});
