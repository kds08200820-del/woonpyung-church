/* We Church — 내 고장 3D (1차): 실제 지도 자료(OpenStreetMap 건물·길 높이 + 땅 높이)를 세우고, 빛은 지금 해의 방향에서.
   MapLibre GL 을 단추를 누를 때만 불러온다(첫 화면을 무겁게 하지 않게). 땅 구획 칸은 예시로만 그린다.
   다음 단계(땅 사기·짓기·길 놓기)는 이 지도 위에 garden_plots 같은 구획 자료를 올린다. */
(function () {
  'use strict';
  var LIB = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl';
  var STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  var DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
  var map = null, loading = null;
  var $ = function (id) { return document.getElementById(id); };

  function loadLib() {
    if (window.maplibregl) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LIB + '.css'; document.head.appendChild(css);
      var s = document.createElement('script'); s.src = LIB + '.js'; s.onload = resolve; s.onerror = function () { loading = null; reject(new Error('지도 프로그램을 불러오지 못했습니다')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // 가운데를 둘러싼 n×n 구획(한 변 size m). 가운데 칸은 '교회 자리 예시'
  function parcels(lat, lng, n, size) {
    var dLat = size / 111320, dLng = size / (111320 * Math.cos(lat * Math.PI / 180)), half = (n * size) / 2, feats = [];
    var lat0 = lat - half / 111320, lng0 = lng - half / (111320 * Math.cos(lat * Math.PI / 180));
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
      var a = lng0 + i * dLng, b = lat0 + j * dLat, mid = i === (n - 1) / 2 && j === (n - 1) / 2;
      feats.push({ type: 'Feature', properties: { mid: mid }, geometry: { type: 'Polygon', coordinates: [[[a, b], [a + dLng, b], [a + dLng, b + dLat], [a, b + dLat], [a, b]]] } });
    }
    return { type: 'FeatureCollection', features: feats };
  }

  function sunLight(S) {
    if (!S) return null;
    var alt = S.sun.alt, night = alt < -2;
    // MapLibre light.position = [거리, 방위(북=0 시계방향), 극각(머리 위=0)]
    return { anchor: 'map', position: [1.5, night ? 200 : S.sun.az, night ? 70 : Math.max(10, 90 - Math.max(alt, 0))],
      color: night ? '#9AA6D8' : alt < 8 ? '#FFD2A6' : '#FFF4E2', intensity: night ? 0.25 : alt < 8 ? 0.45 : 0.6 };
  }
  function skyOf(S) {
    var ph = S ? S.phase : 'day';
    var c = { night: ['#1C2250', '#3A4380'], dawn: ['#F2B9A9', '#FBE3CF'], sunrise: ['#F8CDA8', '#FDEBD7'], day: ['#8FC3EA', '#DDEFF9'], sunset: ['#F2A77C', '#FBD9BD'], dusk: ['#7C6A9E', '#E8A992'] }[ph] || ['#8FC3EA', '#DDEFF9'];
    return { 'sky-color': c[0], 'horizon-color': c[1], 'fog-color': c[1], 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.6 };
  }

  function apply(region, S) {
    if (!map || !map.isStyleLoaded()) return;
    var L = sunLight(S); if (L) map.setLight(L);
    try { map.setSky(skyOf(S)); } catch (e) { /* 옛 판 */ }
    var src = map.getSource('wc-parcels'); if (src) src.setData(parcels(region.lat, region.lng, 7, 120));
  }

  function open() {
    var cover = $('mapCover'), btn = $('mapBtn');
    btn.disabled = true; btn.textContent = '지도를 세우는 중';
    loadLib().then(function () {
      var cur = (window.WCWorld && window.WCWorld.get()) || {}, r = cur.region || (window.WorldReality && window.WorldReality.REGIONS[0]);
      map = new maplibregl.Map({
        container: 'map3d', style: STYLE, center: [r.lng, r.lat], zoom: 15.3, pitch: 62, bearing: -18, maxPitch: 80,
        attributionControl: { compact: true }, cooperativeGestures: true
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
      map.on('load', function () {
        map.addSource('wc-dem', { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 14, attribution: '땅 높이 Mapzen Terrain Tiles' });
        map.setTerrain({ source: 'wc-dem', exaggeration: 1.5 });
        map.addLayer({ id: 'wc-hillshade', type: 'hillshade', source: 'wc-dem', paint: { 'hillshade-shadow-color': '#6E523C', 'hillshade-exaggeration': 0.35 } }, firstSymbol());
        // 건물을 도서관 테마 색으로 (크림·흙빛)
        if (map.getLayer('building-3d')) {
          map.setPaintProperty('building-3d', 'fill-extrusion-color', ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, '#EADBC6', 30, '#D9C2A3', 120, '#C9A884']);
          map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.92);
        }
        map.addSource('wc-parcels', { type: 'geojson', data: parcels(r.lat, r.lng, 7, 120) });
        map.addLayer({ id: 'wc-parcel-fill', type: 'fill', source: 'wc-parcels', paint: { 'fill-color': '#B5562F', 'fill-opacity': ['case', ['get', 'mid'], 0.22, 0.05] } }, firstSymbol());
        map.addLayer({ id: 'wc-parcel-line', type: 'line', source: 'wc-parcels', paint: { 'line-color': '#B5562F', 'line-width': ['case', ['get', 'mid'], 2.5, 1], 'line-opacity': 0.75 } }, firstSymbol());
        apply(r, cur.S);
        var lg = document.createElement('div'); lg.className = 'map-legend'; lg.innerHTML = '<i></i>땅 구획 예시(한 칸 120m) · ' + esc(r.name);
        $('mapBox').appendChild(lg); M.legend = lg;
        cover.hidden = true;
      });
      map.on('error', function (e) { if (e && e.error && /style|Failed to fetch/i.test(String(e.error.message))) fail('지도 자료를 받지 못했습니다. 인터넷 연결을 확인해 주세요.'); });
    }).catch(function (e) { fail(e.message); });
  }
  var M = {};
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function firstSymbol() { var ls = map.getStyle().layers; for (var i = 0; i < ls.length; i++) if (ls[i].type === 'symbol') return ls[i].id; return undefined; }
  function fail(msg) { var btn = $('mapBtn'); btn.disabled = false; btn.textContent = '다시 시도'; var p = $('mapCover').querySelector('p'); if (p) p.textContent = msg; }

  document.addEventListener('wc:region', function (e) {
    if (!map) return;
    var r = e.detail.region;
    map.flyTo({ center: [r.lng, r.lat], zoom: 15.3, pitch: 62, bearing: -18, duration: 2200 });
    setTimeout(function () { var cur = window.WCWorld && window.WCWorld.get(); apply(r, cur && cur.S); if (M.legend) M.legend.innerHTML = '<i></i>땅 구획 예시(한 칸 120m) · ' + esc(r.name); }, 400);
  });
  setInterval(function () { if (map && !document.hidden) { var cur = window.WCWorld && window.WCWorld.get(); if (cur && cur.region) apply(cur.region, cur.S); } }, 60000);

  var b = $('mapBtn'); if (b) b.addEventListener('click', open);
})();
