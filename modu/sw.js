/* 2026 모두의 성경 — 서비스 워커
   · 앱 껍데기(html·css·js·글꼴)는 판(version)마다 새 저장소에 담고 옛것은 지운다
   · 큰 자료(R2 의 성경·사전·지도·주석)는 한 번 받으면 오래 둔다 (자료 판이 바뀌면 주소가 바뀐다)
   · Supabase(로그인·메모)는 늘 네트워크 */
var VERSION = '1.0.4';
var SHELL = 'modu-shell-' + VERSION, DATA = 'modu-data-v2';   /* v2: crossOrigin 없이 받아 둔 불투명 응답을 버린다 */
var CORE = ['./', 'index.html', 'style.css', 'mobile.css', 'config.js', 'bridge.js', 'mobile.js', 'icon.png', 'manifest.webmanifest'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(SHELL).then(function(c){ return c.addAll(CORE).catch(function(){}); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return (k.indexOf('modu-shell-') === 0 && k !== SHELL) || (k.indexOf('modu-data-') === 0 && k !== DATA); }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('message', function(e){ if(e.data && e.data.type === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', function(e){
  var req = e.request, url = new URL(req.url);
  if(req.method !== 'GET') return;
  if(/supabase\.co|googleapis|gstatic|kakao/.test(url.host)) return;                 /* 로그인·메모·API 는 그대로 */
  var isData = url.host.indexOf('r2.dev') >= 0 || /\/data\//.test(url.pathname);
  if(isData){
    e.respondWith(caches.open(DATA).then(function(c){
      return c.match(req).then(function(hit){
        /* CORS 로 달라는 요청(캔버스·WebGL 에 쓰는 그림)에 불투명 응답을 주면 텍스처가 막힌다 → 다시 받는다 */
        if(hit && !(req.mode === 'cors' && hit.type === 'opaque')) return hit;
        return fetch(req).then(function(r){ if(r && r.ok) c.put(req, r.clone()); return r; });
      });
    }));
    return;
  }
  if(url.origin === location.origin){
    /* 껍데기: 저장된 것을 먼저 주고, 없으면 받아서 담는다 */
    e.respondWith(caches.open(SHELL).then(function(c){
      return c.match(req, { ignoreSearch:true }).then(function(hit){
        var net = fetch(req).then(function(r){ if(r && r.ok) c.put(req, r.clone()); return r; }).catch(function(){ return hit; });
        return hit || net;
      });
    }));
  }
});
