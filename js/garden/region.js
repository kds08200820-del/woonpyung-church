/* ============================================================
   신앙 정원 — 내 지역(날씨를 볼 곳) (2026-10-23 담임목사)
   "자신의 지역을 설정할 수 있어야 합니다", "우편번호 검색기로 도로명 주소를 입력하면 그 지역의 날씨가",
   "교적에 있는 데이터를 사용하여 기본적으로 성도들의 거주 지역을 설정 — 교적과 연동"
   · 차례: ① 내가 우편번호 검색으로 고른 지역(이 기기에만) ② 교적 주소(garden_my_region — 시·군·구·읍면동만) ③ 교회 위치
   · 좌표는 지역 이름(예: 경기도 화성시 우정읍)만으로 찾는다(OpenStreetMap Nominatim, 안 되면 Open-Meteo). 도로명·번지는 어디에도 보내거나 저장하지 않는다
   · 교적 지역은 7일마다 다시 물어 교적이 바뀌면 따라간다. 교적 주소 자체는 목회 행정에서 고친다
   GardenRegion.init({ sdk }) · ensure() → Promise<지역|null> · current() · pick() → Promise<지역|null> · reset() · onChange(fn)
   지역 = { label, lat, lng, src: 'user'|'gyojeok', at }
   ============================================================ */
window.GardenRegion = (function () {
  'use strict';
  var KEY = 'g_region', TTL = 7 * 86400000;
  var SDK = null, subs = [];
  function read() { try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && isFinite(+v.lat) && isFinite(+v.lng) ? v : null; } catch (e) { return null; } }
  function save(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { } }
  function emit(v) { subs.forEach(function (fn) { try { fn(v); } catch (e) { } }); }
  function round(n) { return Math.round(+n * 1000) / 1000; }   // 약 100m — 날씨에는 넉넉하다

  // 지역 이름 → 좌표. 자세한 것부터 줄여 가며
  function geocode(p) {
    var qs = [[p.sido, p.sigungu, p.dong], [p.sido, p.sigungu], [p.sigungu], [p.sido]].map(function (a) { return a.filter(Boolean).join(' '); })
      .filter(function (q, i, all) { return q && all.indexOf(q) === i; });
    function nomi(i) {
      if (i >= qs.length) return omx(0);
      var u = 'https://nominatim.openstreetmap.org/search?format=json&countrycodes=kr&limit=1&accept-language=ko&q=' + encodeURIComponent(qs[i]);
      return fetch(u).then(function (r) { return r.ok ? r.json() : []; }).then(function (a) {
        if (a && a[0] && isFinite(+a[0].lat)) return { lat: round(a[0].lat), lng: round(a[0].lon) };
        return nomi(i + 1);
      }, function () { return omx(0); });
    }
    var om = [p.dong, p.sigungu && p.sigungu.split(' ')[0], p.sido].filter(Boolean);
    function omx(i) {
      if (i >= om.length) return null;
      var u = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=ko&countryCode=KR&format=json&name=' + encodeURIComponent(om[i]);
      return fetch(u).then(function (r) { return r.ok ? r.json() : {}; }).then(function (d) {
        var x = d && d.results && d.results[0];
        return x ? { lat: round(x.latitude), lng: round(x.longitude) } : omx(i + 1);
      }, function () { return null; });
    }
    return nomi(0);
  }
  function labelOf(p) { return [p.sigungu, p.dong].filter(Boolean).join(' ') || p.sido || ''; }

  function current() { return read(); }
  // 교적 지역을 기본값으로 (내가 고른 지역이 있으면 그대로)
  function ensure() {
    var r = read();
    if (r && r.src === 'user') return Promise.resolve(r);
    if (r && r.src === 'gyojeok' && Date.now() - (r.at || 0) < TTL) return Promise.resolve(r);
    if (!SDK || !SDK.myRegion) return Promise.resolve(r);
    return SDK.myRegion().then(function (res) {
      if (!res || !res.ok) { if (r && r.src === 'gyojeok' && res && res.why === 'none') { save(null); emit(null); return null; } return r; }
      var key = [res.sido, res.sigungu, res.dong].filter(Boolean).join(' ');
      if (r && r.src === 'gyojeok' && r.key === key) { r.at = Date.now(); save(r); return r; }
      return geocode(res).then(function (c) {
        if (!c) return r;
        var v = { src: 'gyojeok', key: key, label: labelOf(res), lat: c.lat, lng: c.lng, at: Date.now() };
        save(v); emit(v); return v;
      });
    }, function () { return r; });
  }

  // 우편번호 검색(다음 우편번호 서비스)으로 고르기 — 도로명은 쓰지 않고 시·도/시·군·구/읍·면·동만
  function loadPostcode() {
    return new Promise(function (res, rej) {
      if (window.daum && window.daum.Postcode) return res();
      var s = document.createElement('script');
      s.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error('postcode')); };
      document.head.appendChild(s);
    });
  }
  function pick(texts) {
    texts = texts || {};
    return loadPostcode().then(function () {
      return new Promise(function (resolve) {
        if (document.querySelector('.postcode-overlay')) return resolve(null);
        var ov = document.createElement('div');
        ov.className = 'postcode-overlay g-region-ov';
        ov.innerHTML = '<div class="postcode-box"><div class="postcode-head"><strong></strong><button type="button" class="postcode-close" aria-label="">&times;</button></div><div class="postcode-embed"></div></div>';
        ov.querySelector('strong').textContent = texts.title || '';
        ov.querySelector('.postcode-close').setAttribute('aria-label', texts.close || '');
        document.body.appendChild(ov);
        var done = false;
        function close(v) { if (done) return; done = true; ov.remove(); resolve(v); }
        ov.querySelector('.postcode-close').onclick = function () { close(null); };
        ov.addEventListener('click', function (e) { if (e.target === ov) close(null); });
        new window.daum.Postcode({
          oncomplete: function (d) { close({ sido: d.sido || '', sigungu: d.sigungu || '', dong: d.bname1 || d.bname || '' }); },
          width: '100%', height: '100%'
        }).embed(ov.querySelector('.postcode-embed'));
      });
    }).then(function (p) { return p ? apply(p) : null; });
  }
  function apply(p) {   // 고른 지역 저장 (시험에서도 부른다)
    return geocode(p).then(function (c) {
      if (!c) return { fail: true };
      var v = { src: 'user', label: labelOf(p), lat: c.lat, lng: c.lng, at: Date.now() };
      save(v); emit(v); return v;
    });
  }
  // 내가 고른 지역을 지우고 교적(없으면 교회)으로
  function reset() {
    save(null); emit(null);
    return ensure();
  }
  function init(o) { SDK = o.sdk; }
  return { init: init, ensure: ensure, current: current, pick: pick, apply: apply, reset: reset, onChange: function (fn) { subs.push(fn); } };
})();
