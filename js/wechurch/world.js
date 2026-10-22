/* We Church 소개 — 살아 있는 장면 + '지금, 이 고장' 표 + 이 고장의 나무
   reality.js(해·달·절기·공휴일·교회력·날씨·물리)와 nature.js(1년 기온 기록 → 꽃·단풍)를 읽어 그린다.
   미리 보기: ?t=2026-12-24T21:00 (그 시각으로) · ?wx=clear|cloudy|fog|rain|snow|storm · ?air=1~4 · ?region=<id> */
(function () {
  'use strict';
  var W = window.WorldReality, N = window.Nature;
  if (!W) return;
  var Q = new URLSearchParams(location.search);
  var DEMO = { t: Q.get('t'), wx: Q.get('wx'), air: Q.get('air'), region: Q.get('region') };
  var HORIZON = 0.39;   // 마을 그림(1536×768)에서 먼 언덕 꼭대기 높이(위에서 39%)
  var FOV = 140;        // 장면이 보여 주는 하늘 너비(°). 남쪽을 보고 선 자리 — 왼쪽이 동쪽, 오른쪽이 서쪽
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = window.matchMedia && matchMedia('(max-width: 820px)').matches;
  var $ = function (id) { return document.getElementById(id); };
  var M = { region: null, S: null, wx: null, air: null, natureKey: '', skyOn: 'a', skyUrl: '', parts: [], raf: 0, lastT: 0 };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(d) { if (!d) return '—'; var p = W.localParts(d, M.region.tz); return pad(p.h) + ':' + pad(p.mi); }
  function f1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
  function md(ymd) { return +ymd.slice(5, 7) + '/' + +ymd.slice(8, 10); }
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function now() { if (DEMO.t) { var d = new Date(DEMO.t); if (!isNaN(d)) return d; } return new Date(); }

  // ---------------------------------------------------------------- 고장 고르기
  function pickRegion() {
    var id = DEMO.region;
    if (!id) { try { id = localStorage.getItem('wc_region'); } catch (e) { id = null; } }
    return W.regionById(id) || W.REGIONS[0];
  }
  function fillSelect() {
    var sel = $('regionSel'), groups = {};
    W.REGIONS.forEach(function (r) { (groups[r.prov] = groups[r.prov] || []).push(r); });
    sel.innerHTML = Object.keys(groups).map(function (p) {
      return '<optgroup label="' + esc(p) + '">' + groups[p].map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    sel.value = M.region.id;
    sel.addEventListener('change', function () { setRegion(W.regionById(sel.value)); });
    var gb = $('geoBtn');
    if (!navigator.geolocation) { gb.hidden = true; return; }
    gb.addEventListener('click', function () {
      gb.disabled = true; gb.textContent = '위치 확인 중';
      navigator.geolocation.getCurrentPosition(function (p) {
        var n = W.nearestRegion(p.coords.latitude, p.coords.longitude);
        gb.disabled = false; gb.textContent = '내 위치로';
        setRegion(n.region); sel.value = n.region.id;
      }, function () { gb.disabled = false; gb.textContent = '위치를 쓸 수 없음'; }, { timeout: 10000, maximumAge: 600000 });
    });
  }
  function setRegion(r) {
    if (!r) return;
    M.region = r;
    try { if (!DEMO.region) localStorage.setItem('wc_region', r.id); } catch (e) { /* 저장 못 해도 */ }
    $('nowRegion').textContent = r.name;
    refresh(true);
    try { document.dispatchEvent(new CustomEvent('wc:region', { detail: { region: r } })); } catch (e) { /* 옛 브라우저 */ }
  }

  // ---------------------------------------------------------------- 날씨 미리 보기(가짜)
  function demoWeather(kind) {
    var base = { temp: 14, feels: 13, humidity: 62, isDay: true, precip: 0, rain: 0, snow: 0, code: 0, cloud: 10, pressure: 1012, wind: 3.2, windDir: 300, gust: 6, recentRain: 0 };
    var o = { clear: {}, cloudy: { code: 3, cloud: 92 }, fog: { code: 45, cloud: 100, humidity: 98, wind: 0.6 },
      rain: { code: 63, cloud: 100, rain: 4.2, precip: 4.2, recentRain: 9, humidity: 94, wind: 5.5 },
      storm: { code: 95, cloud: 100, rain: 18, precip: 18, recentRain: 30, wind: 15.5, gust: 24 },
      snow: { code: 73, cloud: 100, snow: 1.4, precip: 1.2, temp: -2.5, feels: -6, wind: 2.4 } }[kind] || {};
    for (var k in o) base[k] = o[k];
    base.kind = W.wxKind(base.code); base.label = W.WMO[base.code] || '';
    return base;
  }

  // ---------------------------------------------------------------- 다시 셈
  function refresh(refetch) {
    var r = M.region, t = now();
    var wxP = DEMO.wx ? Promise.resolve(demoWeather(DEMO.wx)) : (refetch || !M.wx ? W.fetchWeather(r.lat, r.lng) : Promise.resolve(M.wx));
    var airP = DEMO.air ? Promise.resolve({ pm10: [0, 20, 50, 110, 180][+DEMO.air] || 20, pm25: [0, 10, 25, 50, 90][+DEMO.air] || 10, grade: W.airGrade([0, 20, 50, 110, 180][+DEMO.air], [0, 10, 25, 50, 90][+DEMO.air]) })
      : (refetch || !M.air ? W.fetchAir(r.lat, r.lng) : Promise.resolve(M.air));
    return Promise.all([wxP, airP]).then(function (x) {
      if (M.region !== r) return;
      M.wx = x[0]; M.air = x[1];
      M.S = W.snapshot(r, t, M.wx, M.air);
      paintScene(M.S); paintPanel(M.S); loadNature(M.S);
    });
  }

  // ---------------------------------------------------------------- 장면
  var SKY = { night: 'night', dawn: 'dawn', sunrise: 'dawn', day: 'day', sunset: 'dusk', dusk: 'dusk' };
  function skyUrl(phase) { return '../images/garden/default/sky/sky-' + SKY[phase] + (small ? '-768' : '') + '.webp'; }
  function setSky(phase) {
    var url = skyUrl(phase);
    if (url === M.skyUrl) return;
    M.skyUrl = url;
    var next = M.skyOn === 'a' ? $('wcSkyB') : $('wcSkyA'), cur = M.skyOn === 'a' ? $('wcSkyA') : $('wcSkyB');
    var img = new Image();
    img.onload = function () { next.style.backgroundImage = 'url(' + url + ')'; next.style.opacity = '1'; cur.style.opacity = '0'; M.skyOn = M.skyOn === 'a' ? 'b' : 'a'; };
    img.src = url;
  }
  function skyXY(alt, az) {   // 하늘의 (고도, 방위) → 장면 안 비율 좌표
    var d = ((az - 180 + 540) % 360) - 180;
    return { x: 0.5 + d / FOV, y: HORIZON - Math.max(-4, alt) / 62 * (HORIZON - 0.03) };
  }
  function moonSvg(f) {
    var k = Math.cos(2 * Math.PI * f), rx = Math.abs(k) * 50, waxing = f < 0.5, sweep = k > 0 ? 0 : 1;
    var lit = '<path d="M50,0 A50,50 0 0 1 50,100 A' + rx.toFixed(2) + ',50 0 0 ' + sweep + ' 50,0 Z" fill="#FFF6DD"' + (waxing ? '' : ' transform="translate(100,0) scale(-1,1)"') + '/>';
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="49" fill="rgba(40,46,80,.45)"/>' + lit + '</svg>';
  }
  function buildStars() {
    var box = $('wcStars'), h = '';
    for (var i = 0; i < 70; i++) {
      var x = (i * 73.13 % 100), y = (i * 37.71 % 36) + 1, o = 0.35 + (i * 17 % 10) / 15;
      h += '<i style="left:' + x.toFixed(2) + '%;top:' + y.toFixed(2) + '%;opacity:' + o.toFixed(2) + '"></i>';
    }
    box.innerHTML = h;
  }
  function paintScene(S) {
    var w = S.weather || {}, kind = w.kind || 'clear', ph = S.phase, night = ph === 'night';
    setSky(ph);
    // 흐림·비·눈·안개면 하늘을 잿빛으로 (구름양에 따라)
    var over = kind === 'rain' || kind === 'storm' ? 1 : kind === 'snow' || kind === 'fog' ? 0.8 : Math.max(0, ((w.cloud == null ? 0 : w.cloud) - 55) / 45) * 0.7;
    var skyF = over > 0.02 ? 'grayscale(' + (0.65 * over).toFixed(2) + ') brightness(' + (1 - 0.2 * over).toFixed(2) + ')' : 'none';
    $('wcSkyA').style.filter = skyF; $('wcSkyB').style.filter = skyF;
    $('wcClouds').style.filter = over > 0.5 ? 'grayscale(.55) brightness(.8)' : 'none';
    $('wcStars').style.opacity = night ? String(kind === 'clear' ? 1 : 0.15) : (ph === 'dusk' || ph === 'dawn' ? '0.25' : '0');
    $('wcClouds').style.backgroundImage = 'url(../images/garden/default/sky/clouds-overlay.webp)';
    $('wcClouds').style.opacity = String(Math.min(1, 0.12 + (w.cloud == null ? 30 : w.cloud) / 100 * 0.9) * (night ? 0.55 : 1));
    // 해
    var sun = $('wcSun'), sp = skyXY(S.sun.alt, S.sun.az), cloudy = (w.cloud || 0) > 85 || kind === 'rain' || kind === 'snow' || kind === 'storm' || kind === 'fog';
    var sunUp = S.sun.alt > -1.5 && sp.x > -0.05 && sp.x < 1.05;
    sun.hidden = !sunUp; sun.style.left = (sp.x * 100) + '%'; sun.style.top = (sp.y * 100) + '%';
    sun.style.opacity = cloudy ? '0.25' : '1';
    sun.style.background = S.sun.alt < 8 ? '#FFD9A8' : '#FFF3D6';
    // 달 — 달이 해보다 (월령 × 24.84시간) 늦게 뜨고 진다고 보고 그 자리
    var moon = $('wcMoon'), mPos = W.sunPosition(new Date(S.now.getTime() - S.moon.phase * 24.84 * 3600000), S.region.lat, S.region.lng), mp = skyXY(mPos.alt, mPos.az);
    var moonUp = mPos.alt > 0 && mp.x > -0.03 && mp.x < 1.03 && S.moon.illum > 0.03 && (S.sun.alt < 2 || S.moon.illum > 0.4);
    moon.hidden = !moonUp; moon.style.left = (mp.x * 100) + '%'; moon.style.top = (mp.y * 100) + '%';
    if (moonUp) moon.innerHTML = moonSvg(S.moon.phase);
    moon.style.opacity = night ? (cloudy ? '0.35' : '1') : '0.55';
    // 무지개 — 방금 비가 그쳤고 해가 0~42° 이고 구름이 걷혔을 때, 해 반대편 42° 원
    var rb = $('wcRainbow'), rain = w.recentRain > 0.2 && kind !== 'rain' && kind !== 'storm' && S.sun.alt > 0 && S.sun.alt < 42 && (w.cloud == null || w.cloud < 75);
    if (rain) {
      var ap = skyXY(-S.sun.alt, (S.sun.az + 180) % 360), cx = ap.x * 1536, cy = (HORIZON + S.sun.alt / 62 * (HORIZON - 0.03)) * 768, R = 42 / FOV * 1536;
      var cols = ['#E35D5D', '#F0A04B', '#F2D45C', '#7CC07A', '#5E9BD6', '#8A72C9'];
      rb.innerHTML = cols.map(function (c, i) { return '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (R - i * 9).toFixed(1) + '" fill="none" stroke="' + c + '" stroke-width="9" opacity=".32"/>'; }).join('');
    }
    rb.style.opacity = rain ? '1' : '0';
    // 땅 — 빛의 때와 날씨로 색을 고친다
    var land = $('wcLand');
    if (!land.style.backgroundImage) land.style.backgroundImage = 'url(../images/wechurch/' + (small ? 'world-768' : 'world') + '.webp?v=20261023wc1)';
    var filt = { night: 'brightness(.5) saturate(.65)', dawn: 'brightness(.8) saturate(.85)', sunrise: 'brightness(.95) saturate(.95)', day: 'none', sunset: 'brightness(.92) saturate(1.05)', dusk: 'brightness(.7) saturate(.85)' }[ph];
    if (kind === 'rain' || kind === 'storm' || kind === 'snow' || kind === 'cloudy') filt = (filt === 'none' ? '' : filt + ' ') + 'brightness(.9) saturate(.82)';
    land.style.filter = filt || 'none';
    $('wcTint').style.backgroundColor = { night: 'rgba(52,64,128,.42)', dawn: 'rgba(250,184,170,.22)', sunrise: 'rgba(255,214,170,.14)', day: 'rgba(255,255,255,0)', sunset: 'rgba(255,170,110,.18)', dusk: 'rgba(214,120,110,.26)' }[ph];
    var lvl = S.air ? S.air.grade.level : 0, haze = kind === 'fog' ? 'rgba(236,234,229,.55)' : lvl >= 4 ? 'rgba(206,196,178,.38)' : lvl === 3 ? 'rgba(214,205,190,.22)' : 'rgba(214,205,190,0)';
    $('wcHaze').style.backgroundColor = haze;
    // 비·눈 입자 — 낙하 속도와 기울기는 reality.js 의 물리 값
    setParticles(S);
    // 띠
    var chip = $('wcChip');
    chip.classList.toggle('demo', !!(DEMO.t || DEMO.wx || DEMO.air));
    $('wcChipText').textContent = S.region.name + ' · ' + pad(S.local.h) + ':' + pad(S.local.mi) + ' · ' + (w.label || (S.weather ? '' : '날씨 자료 없음')) +
      (w.temp != null ? ' ' + f1(w.temp) + '℃' : '') + (DEMO.t || DEMO.wx || DEMO.air ? ' · 미리 보기' : '');
  }

  // ---------------------------------------------------------------- 비·눈
  function setParticles(S) {
    var w = S.weather || {}, kind = w.kind, cv = $('wcFx');
    var type = kind === 'rain' || kind === 'storm' ? 'rain' : kind === 'snow' ? 'snow' : null;
    M.pType = type;
    if (!type || reduce) { M.parts = []; cancelAnimationFrame(M.raf); M.raf = 0; var c0 = cv.getContext('2d'); c0.clearRect(0, 0, cv.width, cv.height); return; }
    var rect = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(rect.width * dpr); cv.height = Math.round(rect.height * dpr);
    var pxPerM = cv.height / 14;   // 장면 높이를 약 14m 로 본다
    var P = S.physics, dirX = Math.sin((w.windDir || 0) * Math.PI / 180);   // 남쪽을 보고 섰을 때 바람이 미는 화면 가로 성분
    M.vy = (type === 'rain' ? P.rainSpeed : P.snowSpeed) * pxPerM;
    M.vx = (w.wind || 0) * dirX * pxPerM * (type === 'snow' ? 0.9 : 1);
    var amount = type === 'rain' ? Math.min(420, 60 + (w.rain || w.precip || 1) * 40) : Math.min(260, 70 + (w.snow || 0.5) * 90);
    var n = Math.round(amount * (rect.width / 1100));
    M.parts = [];
    for (var i = 0; i < n; i++) M.parts.push({ x: Math.random() * cv.width, y: Math.random() * cv.height, s: 0.7 + Math.random() * 0.6, ph: Math.random() * 6.28 });
    M.dpr = dpr;
    draw(0, 0);   // 첫 장은 바로 그린다(애니메이션이 멈춘 환경에서도 비·눈이 보이게)
    if (!M.raf) { M.lastT = 0; M.raf = requestAnimationFrame(tick); }
  }
  function tick(t) {
    var dt = M.lastT ? Math.min(0.05, (t - M.lastT) / 1000) : 0.016;
    M.lastT = t;
    draw(t, dt);
    var stage = $('wcStage');
    if (!stage.isConnected || !M.parts.length) { M.raf = 0; return; }
    M.raf = requestAnimationFrame(tick);
  }
  function draw(t, dt) {
    var cv = $('wcFx'), ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    var rain = M.pType === 'rain', W2 = cv.width, H2 = cv.height, len = rain ? Math.max(8, M.vy * 0.035) : 0;
    ctx.strokeStyle = 'rgba(214,222,234,.7)'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.2 * M.dpr;
    if (rain) ctx.beginPath();
    for (var i = 0; i < M.parts.length; i++) {
      var p = M.parts[i];
      p.y += M.vy * p.s * dt; p.x += M.vx * p.s * dt + (rain ? 0 : Math.sin(t / 900 + p.ph) * 12 * dt * M.dpr);
      if (p.y > H2 + 10) { p.y = -10; p.x = Math.random() * W2; }
      if (p.x > W2 + 20) p.x -= W2 + 40; else if (p.x < -20) p.x += W2 + 40;
      if (rain) { var k = len / Math.max(1, M.vy); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - M.vx * k, p.y - M.vy * k); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * p.s * M.dpr, 0, 6.283); ctx.fill(); }
    }
    if (rain) ctx.stroke();
  }

  // ---------------------------------------------------------------- 표
  function stat(k, v, s, extra) { return '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v">' + (extra || '') + esc(v) + '</div><div class="s">' + esc(s) + '</div></div>'; }
  function paintPanel(S) {
    var w = S.weather, P = S.physics, t = S.sunTimes, L = S.local, h = [];
    var dayKind = S.holiday.length ? S.holiday.map(function (x) { return x.name; }).join(', ') : S.sunday ? '주일' : L.dow === 6 ? '토요일' : '평일';
    h.push(stat('시각', pad(L.h) + ':' + pad(L.mi), L.y + '년 ' + L.m + '월 ' + L.d + '일 ' + DOW[L.dow] + '요일 · ' + dayKind));
    var dl = t.dayLength, dlS = Math.floor(dl) + '시간 ' + Math.round((dl % 1) * 60) + '분';
    h.push(stat('해', S.sun.alt > 0 ? '높이 ' + Math.round(S.sun.alt) + '° ' + W.compass(S.sun.az) + '쪽' : '해가 진 뒤', '해돋이 ' + hm(t.sunrise) + ' · 해넘이 ' + hm(t.sunset) + ' · 낮 ' + dlS));
    h.push(stat('달', S.moon.name, '월령 ' + f1(S.moon.age) + '일 · 밝기 ' + Math.round(S.moon.illum * 100) + '%'));
    if (w) {
      h.push(stat('날씨', (w.label || '—') + ' ' + f1(w.temp) + '℃', '체감 ' + f1(w.feels) + '℃ · 습도 ' + Math.round(w.humidity) + '% · 구름 ' + Math.round(w.cloud || 0) + '%' + (w.tmax != null ? ' · 오늘 ' + Math.round(w.tmin) + '~' + Math.round(w.tmax) + '℃' : '')));
      h.push(stat('바람', P.beaufort.name + ' ' + f1(w.wind) + 'm/s', P.windFrom + '쪽에서 · 돌풍 ' + f1(w.gust) + 'm/s · 바람 압력 ' + f1(P.windQ) + 'Pa'));
    } else {
      h.push(stat('날씨', '불러오지 못함', '잠시 뒤 다시 셉니다'));
      h.push(stat('바람', '—', ''));
    }
    h.push(stat('대기질', S.air ? '미세먼지 ' + S.air.grade.name : '—', S.air ? 'PM10 ' + Math.round(S.air.pm10) + ' · PM2.5 ' + Math.round(S.air.pm25) + ' ㎍/㎥' : '자료 없음'));
    h.push(stat('절기 · 계절', S.term.name + ' · ' + W.SEASON_KO[S.season], S.term.about + '. 다음 ' + S.term.next + ' ' + md(S.term.nextDate) + '(' + S.term.daysToNext + '일 뒤)'));
    var nh = S.nextHoliday;
    h.push(stat('공휴일', S.holiday.length ? '오늘 ' + S.holiday[0].name : '오늘은 공휴일 아님', nh ? '다음: ' + nh.name + ' ' + md(nh.date) : ''));
    var nc = S.nextChurchDay;
    h.push(stat('교회력', S.liturgy.name, '절기 색 ' + S.liturgy.colorKo + (nc ? ' · 다음: ' + nc.name + ' ' + md(nc.date) + (nc.days ? '(' + nc.days + '일 뒤)' : '(오늘)') : ''), '<span class="swatch" style="background:' + S.liturgy.hex + '"></span>'));
    h.push(stat('물리', '중력 ' + P.g.toFixed(3) + 'm/s²', '공기 밀도 ' + P.rho.toFixed(3) + 'kg/m³ · 소리 ' + Math.round(P.sound) + 'm/s · 빗방울 ' + f1(P.rainSpeed) + 'm/s' + (w && w.wind >= 1 ? '(바람에 ' + Math.round(W.fallAngle(w.wind, P.rainSpeed)) + '° 기울어짐)' : '')));
    $('nowGrid').innerHTML = h.join('');
    $('fxList').innerHTML = W.effects(S).map(function (e) { return '<li><b>' + esc(e.area) + '</b><span>' + esc(e.text) + '</span></li>'; }).join('');
  }

  // ---------------------------------------------------------------- 이 고장의 나무 (nature.js)
  var TREES = ['maple', 'ginkgo', 'cherry'];
  function loadNature(S) {
    if (!N) return;
    var key = S.region.id + ':' + S.local.ymd;
    if (M.natureKey === key) return;
    M.natureKey = key;
    var r = S.region;
    N.load(r.lat, r.lng, S.now).then(function (rows) {
      if (M.region !== r) return;
      var w = S.weather || {};
      var C = N.compute(rows, r.lat, S.now, { sunAlt: S.sun.alt, sunAz: S.sun.az, temp: w.temp, raining: w.kind === 'rain' || w.kind === 'storm', wind: (w.wind || 0) * 3.6, cloud: (w.cloud || 0) / 100, recentRain: w.recentRain > 0.2, hum: w.humidity });
      var h = TREES.map(function (sp) {
        var st = N.plantState(sp, C.I, S.now, {}), s = N.SPECIES[sp];
        return stat(s.name, st.note || '', s.rule || '');
      });
      $('natureRow').innerHTML = h.join('') + (C.synthetic ? '' : '');
      if (C.synthetic) $('natureRow').insertAdjacentHTML('beforeend', '<p class="src-note" style="grid-column:1/-1">기온 기록을 받지 못해 위도로 셈한 평년 기후로 대신 보여 줍니다.</p>');
    }).catch(function () { $('natureRow').innerHTML = stat('나무', '기록을 불러오지 못했습니다', ''); });
  }

  // ---------------------------------------------------------------- 시작
  M.region = pickRegion();
  $('nowRegion').textContent = M.region.name;
  fillSelect();
  buildStars();
  refresh(true);
  setInterval(function () { if (!document.hidden) refresh(false); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(false); });
  var rz = 0;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (M.S) setParticles(M.S); }, 200); });
  window.WCWorld = { get: function () { return { region: M.region, S: M.S }; } };
})();
