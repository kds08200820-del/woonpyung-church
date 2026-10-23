/* ============================================================
   신앙 정원 — 장면 렌더 (순수 렌더: 네트워크·저장소 접근 없음)
   · 설계 좌표 1600×900 을 .g-scene 안에 '덮기(cover)' 로 맞춘다 (transform scale)
   · 층: sky(2장 크로스페이드) / stars / clouds / mid(언덕, 시차 .25) / floor(.5) / fog / plot(캐릭터·식물·이름판) / fx
     비·눈 입자는 장면 위 캔버스(뷰포트 좌표, ≤30fps, 숨은 탭이면 정지)
   · 세계 모형: 지역 → 교회 맵(격자) → 자리(x,y) → 내 자리 앵커. 1단계는 내 자리 한 칸만 그린다.
   · 그림 images/garden/default/<…>.webp?v=<manifest.version> — manifest 에 없는 파일은 자리표시(그라데이션·도형)로 그린다
   ============================================================ */
window.GardenScene = (function () {
  'use strict';
  var W = 1600, H = 900, GROUND = 700;   /* 땅 선: 캐릭터·식물의 발. 이름판(+46)이 하단 바(≈830) 위에 오도록 */
  var LAYERS = [
    { id: 'sky', px: 0 }, { id: 'stars', px: 0 }, { id: 'clouds', px: .1 }, { id: 'mid', px: .25 },
    { id: 'floor', px: .5 }, { id: 'fog', px: 0 }, { id: 'plot', px: .5 }, { id: 'fx', px: .5 }
  ];
  /* 내 자리 안의 앵커(설계 좌표). 2단계에서 이웃 자리를 그릴 때는 cellOrigin() 을 더해 쓴다 */
  var ANCHOR = { character: { x: 610, y: GROUND }, plant: { x: 890, y: GROUND }, bubble: { x: 1010, y: 380 }, nameplate: { x: 890, y: GROUND + 46 }, xp: { x: 890, y: 520 } };
  var world = { region: null, church: null, map: { cols: 1, rows: 1, cellW: W, cellH: H }, plot: { plot_no: 0, x: 0, y: 0 } };
  function cellOrigin(/* plot */) { return { x: 0, y: 0 }; }   /* 1단계: 내 자리만, 늘 원점. 2단계: (plot.x − cam.x)·cellW … */

  var PHASE_BG = {
    dawn: 'linear-gradient(180deg,#5b5aa0 0%,#c58fb0 38%,#f0b4a3 68%,#fbdcb6 100%)',
    day: 'linear-gradient(180deg,#8ec7f3 0%,#b9dcf6 55%,#e6f2fb 100%)',
    dusk: 'linear-gradient(180deg,#48478f 0%,#9a6da1 40%,#e5866f 72%,#f7c58b 100%)',
    night: 'linear-gradient(180deg,#1c2250 0%,#2b3570 55%,#4e5a93 100%)'
  };
  var SPECIES_COLOR = {
    sunflower: { leaf: '#7cb97a', leaf2: '#5f9f60', bloom: '#f3c64b', core: '#6b4a2b', fruit: '#8a5a2b' },
    olive: { leaf: '#9db38e', leaf2: '#7c9a70', bloom: '#f6f1d6', core: '#c9c08f', fruit: '#4e5f3d' },
    fig: { leaf: '#6fa37c', leaf2: '#4f8560', bloom: '#e9c4d6', core: '#b8809c', fruit: '#7b4f8e' },
    grape: { leaf: '#86b26e', leaf2: '#5f8f4c', bloom: '#e7e2c2', core: '#c9c08f', fruit: '#6b4a8e' },
    mustard: { leaf: '#9cc46a', leaf2: '#789f4a', bloom: '#f6d94c', core: '#d4b53a', fruit: '#b59b32' },
    lily: { leaf: '#7fb08a', leaf2: '#5c8f68', bloom: '#fff4f6', core: '#f2b85c', fruit: '#f0cfa0' }
  };
  var CHAR_COLOR = { a: { skin: '#f8dcc6', body: '#e9805f' }, b: { skin: '#f3d5bd', body: '#6f9fcf' }, c: { skin: '#f6d9c4', body: '#7fb089' } };

  var S = {
    root: null, stage: null, el: {}, scale: 1, offX: 0, offY: 0, small: false,
    phase: 'day', weather: 'clear', season: 'spring', reduce: false, manifest: null, base: 'images/garden/default/',
    species: 'sunflower', stageNo: 0, canvas: null, ctx: null, parts: [], pType: null, raf: 0, lastT: 0, skyA: true,
    charKey: 'a', nickname: '', plantName: '', mounted: false
  };

  /* ── 그림 조회 ── */
  function has(path) {
    var m = S.manifest; if (!m) return false;
    var f = m.files;
    if (Array.isArray(f)) return f.indexOf(path) >= 0;
    if (f && typeof f === 'object') return !!f[path];
    return false;
  }
  function url(path) { return S.base + path + '?v=' + encodeURIComponent(String((S.manifest && S.manifest.version) || '0')); }
  function asset(path) {
    if (S.small && /\.webp$/.test(path)) { var v = path.replace(/\.webp$/, '-768.webp'); if (has(v)) return url(v); }
    return has(path) ? url(path) : null;
  }
  function plantPath(species, stage) { return 'plants/' + species + '-' + stage + '.webp'; }
  function hillsPath(season) { return has('mid/hills-' + season + '.webp') ? 'mid/hills-' + season + '.webp' : 'mid/hills.webp'; }
  function preload(urls) {
    var list = (urls || []).filter(Boolean);
    return Promise.all(list.map(function (u) {
      return new Promise(function (res) { var im = new Image(); im.onload = im.onerror = function () { res(u); }; im.src = u; });
    }));
  }
  function assetsFor(phase, season, species, stage) {
    return [asset('sky/sky-' + phase + '.webp'), asset('sky/clouds-overlay.webp'), asset(hillsPath(season)), asset('floor/floor-tiles.webp'),
      asset('study/shelf-wall.webp'), asset(plantPath(species, stage)), asset('chars/char-' + S.charKey + '.webp')].filter(Boolean);
  }

  /* ── 공용 ── */
  function el(tag, cls, html) { var d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ── 시각·날씨·계절 판정(순수) ── */
  function phaseOf(nowMin, sunriseMin, sunsetMin) {
    if (sunriseMin == null || sunsetMin == null) { sunriseMin = 6 * 60 + 30; sunsetMin = 18 * 60 + 30; }
    if (nowMin >= sunriseMin - 60 && nowMin <= sunriseMin + 30) return 'dawn';
    if (nowMin >= sunsetMin - 60 && nowMin <= sunsetMin + 30) return 'dusk';
    if (nowMin > sunriseMin + 30 && nowMin < sunsetMin - 60) return 'day';
    return 'night';
  }
  function weatherOf(code) {
    code = +code;
    if (!(code >= 0)) return 'clear';
    if (code <= 1) return 'clear';
    if (code <= 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 51) return 'rain';
    return 'cloudy';
  }
  function seasonOf(month, lat) {
    var m = +month; if (+lat < 0) m = ((m + 5) % 12) + 1;
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
  }
  function toMin(hhmm) { var m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; }

  /* ── 배치 ── */
  function layout() {
    if (!S.root || !S.stage) return;
    var w = S.root.clientWidth || 1, h = S.root.clientHeight || 1;
    S.small = w <= 800;
    var s = Math.max(w / W, h / H);
    S.scale = s; S.offX = (w - W * s) / 2; S.offY = (h - H * s) / 2;
    S.stage.style.transform = 'translate(' + S.offX.toFixed(2) + 'px,' + S.offY.toFixed(2) + 'px) scale(' + s.toFixed(4) + ')';
    if (S.canvas) {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      S.canvas.width = Math.round(w * dpr); S.canvas.height = Math.round(h * dpr);
      S.canvas.style.width = w + 'px'; S.canvas.style.height = h + 'px';
      S.ctx = S.canvas.getContext('2d'); S.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S.parts = [];
    }
    if (S.fieldList && Math.abs(visBottom() - (S.fieldVB || 0)) > 8) setField();   // 화면 비율이 바뀌어 아래가 잘리면 밭 앞줄을 다시 맞춘다
  }
  /* 화면에 보이는 장면의 맨 아래(설계 y) — 넓고 낮은 칸에서는 장면 아래가 잘린다 */
  function visBottom() { return S.root ? Math.min(H, H / 2 + (S.root.clientHeight || H) / (2 * (S.scale || 1))) : H; }
  /* 설계 좌표 → 뷰포트 좌표(fixed 기준). 말풍선 패널 위치 잡기에 쓴다 */
  function project(x, y) {
    if (!S.root) return { x: 0, y: 0, scale: 1 };
    var r = S.root.getBoundingClientRect();
    return { x: r.left + S.offX + x * S.scale, y: r.top + S.offY + y * S.scale, scale: S.scale };
  }
  /* 밭이 있으면 믿음 나무는 밭 가운데 제 칸(S.treeAt)에 원근 크기로 선다 — 나무에 딸린 앵커(이름판·말풍선·+XP)도 같이 옮기고 줄인다 */
  function anchors() {
    var o = cellOrigin(world.plot), out = {}, T = S.treeAt, P = ANCHOR.plant;
    for (var k in ANCHOR) {
      var a = ANCHOR[k];
      out[k] = T && k !== 'character' ? { x: T.x + (a.x - P.x) * T.s + o.x, y: T.y + (a.y - P.y) * T.s + o.y } : { x: a.x + o.x, y: a.y + o.y };
    }
    return out;
  }
  function treeScale() { return S.treeAt ? S.treeAt.s : 1; }

  /* ── 층 만들기 ── */
  function buildSky() {
    var a = el('div', 'g-sky g-sky-a'), b = el('div', 'g-sky g-sky-b'), tint = el('div', 'g-skytint');
    S.el.sky.appendChild(a); S.el.sky.appendChild(b); S.el.sky.appendChild(tint);
    S.el.skyA = a; S.el.skyB = b; S.el.tint = tint;
  }
  function buildStars() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 46; i++) {
      var st = el('span', 'g-star');
      var sz = rnd(2, 5);
      st.style.cssText = 'left:' + rnd(0, W) + 'px;top:' + rnd(10, H * .5) + 'px;width:' + sz + 'px;height:' + sz + 'px;animation-delay:' + rnd(0, 4) + 's';
      frag.appendChild(st);
    }
    var moon = el('span', 'g-moon'); frag.appendChild(moon);
    S.el.stars.appendChild(frag);
  }
  function buildClouds() {
    var img = asset('sky/clouds-overlay.webp');
    if (img) { var im = el('img', 'g-clouds-img'); im.src = img; im.alt = ''; im.draggable = false; S.el.clouds.appendChild(im); return; }
    var spec = [[120, 120, 1.1], [520, 70, .8], [900, 150, 1.3], [1250, 90, .9], [1500, 200, .7]];
    spec.forEach(function (c, i) {
      var d = el('div', 'g-cloud');
      d.style.cssText = 'left:' + c[0] + 'px;top:' + c[1] + 'px;transform:scale(' + c[2] + ');animation-duration:' + (70 + i * 17) + 's;animation-delay:-' + (i * 11) + 's';
      d.innerHTML = '<i></i><i></i><i></i><i></i>';
      S.el.clouds.appendChild(d);
    });
  }
  function buildHills() {
    S.el.mid.innerHTML = '';
    var img = asset(hillsPath(S.season));
    if (img) { var im = el('img', 'g-hills-img'); im.src = img; im.alt = ''; im.draggable = false; S.el.mid.appendChild(im); return; }
    var ph = el('div', 'g-hills-ph');
    ph.innerHTML =
      '<div class="g-hill g-hill-far" style="left:-200px;width:900px;height:520px;bottom:60px"></div>' +
      '<div class="g-hill g-hill-far" style="left:700px;width:1100px;height:480px;bottom:70px"></div>' +
      '<div class="g-hill g-hill-mid" style="left:-120px;width:760px;height:360px;bottom:40px"></div>' +
      '<div class="g-hill g-hill-mid" style="left:1000px;width:820px;height:380px;bottom:36px"></div>' +
      '<div class="g-hill g-hill-near" style="left:200px;width:1300px;height:300px;bottom:0"></div>' +
      '<div class="g-tree" style="left:240px;bottom:150px;--s:1.1"></div>' +
      '<div class="g-tree" style="left:1330px;bottom:140px;--s:1.25"></div>' +
      '<div class="g-tree" style="left:1440px;bottom:120px;--s:.8"></div>' +
      '<div class="g-path"></div>';
    S.el.mid.appendChild(ph);
  }
  function buildFloor() {
    var img = asset('floor/floor-tiles.webp');
    if (img) { var im = el('img', 'g-floor-img'); im.src = img; im.alt = ''; im.draggable = false; S.el.floor.appendChild(im); return; }
    S.el.floor.appendChild(el('div', 'g-floor-ph'));
  }
  function buildFog() { S.el.fog.appendChild(el('div', 'g-fog-ph')); }
  function buildPlot() {
    var A = anchors();
    var ch = el('div', 'g-char-anchor'); ch.style.left = A.character.x + 'px'; ch.style.top = A.character.y + 'px';
    ch.appendChild(el('div', 'g-char')); S.el.charAnchor = ch; S.el.char = ch.firstChild;
    var soil = el('div', 'g-soil'); soil.style.left = A.plant.x + 'px'; soil.style.top = A.plant.y + 'px';
    var pl = el('div', 'g-plant-anchor'); pl.style.left = A.plant.x + 'px'; pl.style.top = A.plant.y + 'px';
    pl.appendChild(el('div', 'g-plant')); S.el.plantAnchor = pl; S.el.plant = pl.firstChild;
    var np = el('div', 'g-np-anchor'); np.style.left = A.nameplate.x + 'px'; np.style.top = A.nameplate.y + 'px'; S.el.np = np;
    /* 이름판은 평소 숨기고 나무를 누르면 잠깐 보인다 (2026-10-23 담임목사: "이 문구 삭제, 클릭하면 보여주세요") */
    pl.addEventListener('click', function (e) { e.stopPropagation(); peekName(); });
    soil.addEventListener('click', function (e) { e.stopPropagation(); peekName(); });
    S.el.plot.appendChild(soil); S.el.plot.appendChild(ch); S.el.plot.appendChild(pl); S.el.plot.appendChild(np);
    S.el.soil = soil;
    placeTree();
  }
  /* 나무·흙·이름판을 지금 자리(S.treeAt)로 — 없으면 처음 자리(밭 앞) */
  var SOIL_K = 0.6;
  function placeTree() {
    var A = anchors(), T = S.treeAt, s = treeScale();
    function put(node, x, y, tf, z) {
      if (!node) return;
      node.style.left = x + 'px'; node.style.top = y + 'px';
      node.style.transform = T ? tf : ''; node.style.transformOrigin = T && tf.indexOf('-100%') > 0 ? '50% 100%' : '';
      node.style.zIndex = T ? z : '';
    }
    put(S.el.plantAnchor, A.plant.x, A.plant.y, 'translate(-50%,-100%) scale(' + s.toFixed(3) + ')', T && T.z);
    put(S.el.soil, A.plant.x, A.plant.y, 'translate(-50%,-50%) scale(' + (s * SOIL_K).toFixed(3) + ')', T && T.z);
    put(S.el.np, A.nameplate.x, A.nameplate.y, 'translate(-50%,0)', 300);
  }

  /* ── 내 땅(밭): 산 칸마다 밭두둑, 심은 것은 그 위에 (2026-10-23) ──
     정면 장면이라 '내 땅' 창의 마름모 대신 나무 뒤 땅에 원근으로 줄지어 놓는다: 앞줄은 크고 아래(설계 y 740), 뒷줄일수록 작고 위(잔디 언덕 능선 쪽).
     칸 사이를 띄우고 앞에서 FIELD.rows 줄까지만 그린다(담임목사 "밭이 너무 빽빽합니다. 여유 있게 띄워 주세요") — 그 뒤 줄은 돌려 보면 앞으로 온다.
     x 는 나무(0,0) 기준 좌우. S.fieldRot(0~3)만큼 땅을 90°씩 돌려서 본다 — 화면 돌리기 단추(hud.js). 누르면 내 땅 가꾸기 창(o.onOpen)
     믿음 나무는 입체 정원처럼 제 칸(0,0)에 선다(담임목사 "올리브 나무도 밭 중간에 있는 것을 그대로") — 나무 앞은 많아야 FIELD.ahead 줄,
     그보다 앞줄은 화면 밖(돌려 보면 보인다). 앞줄일수록 z 가 커서 나무 밑동을 가린다
     땅 곡면: 뒷줄은 잔디 언덕 능선(CREST) 아래에서 멈추고, 줄은 가운데가 높고 양옆이 낮은 둥근 언덕을 따라 휜다(bend)
     — 담임목사 "공중에 떠 있습니다. 지면의 곡률에 따라 적용되어야 합니다" */
  var FIELD = { rows: 6, ahead: 3, pitch: 116, yFront: 740, gapTop: 12, bend: 36, depth: 0.3, treeK: 0.95 };
  /* 잔디 언덕 능선(먼 산과 만나는 선) — 언덕 그림 mid/hills.webp 에서 잰 설계 좌표 [x, y] */
  var CREST = [[0, 520], [330, 520], [420, 505], [500, 528], [600, 548], [700, 555], [900, 560], [1450, 558], [1600, 566]];
  function crestAt(x) {
    for (var j = 1; j < CREST.length; j++) {
      if (x <= CREST[j][0] || j === CREST.length - 1) { var a = CREST[j - 1], b = CREST[j], t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0]))); return a[1] + (b[1] - a[1]) * t; }
    }
  }
  function zRow(i) { return 100 - i * 2; }
  function turnCell(c, n) { var x = c.x, y = c.y, t; for (var i = 0; i < n; i++) { t = x; x = -y; y = t; } return { x: x, y: y }; }   // 위에서 봐서 시계 방향 90°씩
  function setField(list, o) {
    if (list !== undefined) { S.fieldList = list; S.fieldOpts = o || {}; }   // 인자 없이 부르면 마지막 밭을 다시 그린다(돌리기)
    list = S.fieldList; o = S.fieldOpts || {};
    if (!S.el.plot) return;
    if (S.el.field) { S.el.field.remove(); S.el.field = null; }
    if (S.root) S.root.dispatchEvent(new CustomEvent('g:field', { bubbles: true, detail: { n: list ? list.length : 0 } }));
    if (!list || !list.length) { if (S.treeAt) { S.treeAt = null; placeTree(); } return; }
    var P = ANCHOR.plant, F = FIELD, front = 0;     // 나무 칸(0,0)도 땅이다
    var cells = list.map(function (c) { var p = turnCell(c, S.fieldRot || 0); front = Math.max(front, p.y); return { c: c, x: p.x, y: p.y }; });
    front = Math.min(front, F.ahead);
    S.fieldVB = visBottom();
    var yFront = Math.max(crestAt(P.x) + 60, Math.min(F.yFront, S.fieldVB - 40));   // 앞줄이 화면 아래로 잘리지 않게
    // k = 원근(크기), kx = 좌우 간격 — 뒷줄이 나무 쪽으로 너무 몰리지 않게 원근보다 덜 좁힌다
    function rowAt(i) { var k = 1 / (1 + i * F.depth); return { k: k, kx: 0.5 + 0.5 * k }; }
    // 땅 위 y: 능선 바로 아래(top)와 앞줄(front, 양옆으로 갈수록 낮게) 사이를 원근으로
    function groundY(i, x) {
      var k = rowAt(i).k, dx = (x - P.x) / 800, top = crestAt(x) + F.gapTop, fy = yFront + F.bend * dx * dx;
      return top + (fy - top) * k;
    }
    var T0 = rowAt(front);
    S.treeAt = { x: P.x, y: groundY(front, P.x) + 4 * T0.k, s: T0.k * F.treeK, z: zRow(front) };
    placeTree();
    var box = el('div', 'g-field');
    cells.filter(function (q) { var i = front - q.y; return i >= 0 && i < F.rows; })
      .sort(function (a, b) { return a.y - b.y || a.x - b.x; })     // 뒷줄부터 그려야 앞줄이 위에 온다
      .forEach(function (q) {
        var c = q.c, i = front - q.y, R = rowAt(i), k = R.k;
        var x = P.x + q.x * F.pitch * R.kx, w = F.pitch * k * 0.64, y = groundY(i, x), gap = y - groundY(i + 1, x);
        if (x < -w || x > W + w) return;
        var bed = el('div', 'g-fbed' + (c.land === 'dae' ? ' is-dae' : c.planted ? '' : ' is-empty'));
        bed.style.left = x.toFixed(1) + 'px'; bed.style.top = y.toFixed(1) + 'px'; bed.style.width = w.toFixed(1) + 'px'; bed.style.height = Math.min(w * 0.34, gap * 0.72).toFixed(1) + 'px';
        bed.style.zIndex = zRow(i);
        box.appendChild(bed);
        if (c.src) {
          var im = el('img', 'g-fspr' + (c.dead ? ' is-dead' : '')); im.src = c.src; im.alt = ''; im.draggable = false;
          im.style.left = x.toFixed(1) + 'px'; im.style.top = (y + w * 0.05).toFixed(1) + 'px'; im.style.height = Math.max(14, Math.round(c.h * k)) + 'px';
          im.style.zIndex = zRow(i);
          im.onerror = function () { im.remove(); };
          box.appendChild(im);
        }
      });
    if (o.onOpen) { box.classList.add('is-open'); box.setAttribute('role', 'button'); box.setAttribute('aria-label', o.label || ''); box.addEventListener('click', function (e) { e.stopPropagation(); o.onOpen(); }); }
    S.el.plot.insertBefore(box, S.el.plot.firstChild);   // 흙·인물·나무보다 뒤
    S.el.field = box;
  }
  function rotateField(n) { S.fieldRot = ((n | 0) % 4 + 4) % 4; setField(); return S.fieldRot; }

  /* ── 입자(비·눈) ── */
  function startParticles(type) {
    S.pType = type;
    if (S.reduce || !S.canvas || !S.ctx) return;
    if (!S.raf && !document.hidden) { S.lastT = 0; S.raf = requestAnimationFrame(pTick); }
  }
  function stopParticles(clear) {
    if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    if (clear && S.ctx && S.canvas) S.ctx.clearRect(0, 0, S.canvas.width, S.canvas.height);
    if (clear) S.pType = null;
  }
  function pTick(t) {
    S.raf = 0;
    if (document.hidden || !S.pType || !S.ctx) return;
    S.raf = requestAnimationFrame(pTick);
    if (t - S.lastT < 33) return;            /* ≤30fps */
    var dt = Math.min(t - (S.lastT || t), 100) / 16.7; S.lastT = t;
    var w = S.root.clientWidth, h = S.root.clientHeight, ctx = S.ctx;
    var want = Math.round((w * h) / (S.pType === 'rain' ? 9000 : 14000));
    while (S.parts.length < want) S.parts.push(newPart(w, h, true));
    if (S.parts.length > want) S.parts.length = want;
    ctx.clearRect(0, 0, w, h);
    if (S.pType === 'rain') {
      ctx.strokeStyle = 'rgba(205,225,245,.55)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath();
      S.parts.forEach(function (p) {
        p.y += p.v * dt; p.x -= p.v * .18 * dt;
        if (p.y > h + 20) { var n = newPart(w, h, false); p.x = n.x; p.y = n.y; p.v = n.v; p.l = n.l; }
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.l * .18, p.y - p.l);
      });
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      S.parts.forEach(function (p) {
        p.ph += .02 * dt; p.y += p.v * dt; p.x += Math.sin(p.ph) * .6 * dt;
        if (p.y > h + 10) { var n = newPart(w, h, false); p.x = n.x; p.y = n.y; p.v = n.v; p.r = n.r; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      });
    }
  }
  function newPart(w, h, anywhere) {
    if (S.pType === 'rain') return { x: rnd(-20, w + 60), y: anywhere ? rnd(-h, h) : rnd(-80, -10), v: rnd(9, 15), l: rnd(14, 26) };
    return { x: rnd(-10, w + 10), y: anywhere ? rnd(-h, h) : rnd(-30, -5), v: rnd(.8, 1.8), r: rnd(1.6, 3.6), ph: rnd(0, 6.28) };
  }

  /* ── 공개: 올리기 ── */
  function mount(container, opts) {
    opts = opts || {};
    S.root = container; S.manifest = opts.manifest || null; if (opts.base) S.base = opts.base;
    S.reduce = !!opts.reduce; if (opts.world) for (var k in opts.world) world[k] = opts.world[k];
    container.innerHTML = '';
    container.classList.add('g-scene-ready');
    S.small = (container.clientWidth || 0) <= 800;
    var stage = el('div', 'g-stage'); S.stage = stage;
    LAYERS.forEach(function (L) { var d = el('div', 'g-layer g-l-' + L.id); stage.appendChild(d); S.el[L.id] = d; });
    buildSky(); buildStars(); buildClouds(); buildHills(); buildFloor(); buildFog(); buildPlot();
    container.appendChild(stage);
    var cv = el('canvas', 'g-particles'); cv.setAttribute('aria-hidden', 'true'); container.appendChild(cv); S.canvas = cv;
    layout();
    window.addEventListener('resize', layout);
    if (window.ResizeObserver) { try { new ResizeObserver(layout).observe(container); } catch (e) { } }
    /* 마우스를 따라 배경이 움직이던 시차(parallax)는 없앴다 — 어지럽다는 담임목사 의견(2026-10-23). 배경은 고정 */
    document.addEventListener('visibilitychange', function () { if (document.hidden) stopParticles(false); else if (S.pType) startParticles(S.pType); });
    setReducedMotion(S.reduce);
    setSky(S.phase, S.weather, { instant: true });
    setSeason(S.season);
    S.mounted = true;
  }

  /* ── 하늘: 시각(phase) × 날씨 ── */
  function setSky(phase, weather, o) {
    o = o || {};
    phase = PHASE_BG[phase] ? phase : 'day';
    weather = /^(clear|cloudy|fog|rain|snow)$/.test(weather) ? weather : 'clear';
    S.phase = phase; S.weather = weather;
    if (!S.stage) return;
    S.stage.setAttribute('data-phase', phase); S.stage.setAttribute('data-weather', weather);
    var img = asset('sky/sky-' + phase + '.webp');
    var bg = img ? 'url("' + img + '")' : PHASE_BG[phase];
    var next = S.skyA ? S.el.skyB : S.el.skyA, cur = S.skyA ? S.el.skyA : S.el.skyB;
    if (o.instant) { cur.style.backgroundImage = bg; cur.style.opacity = '1'; next.style.opacity = '0'; }
    else { next.style.backgroundImage = bg; next.style.opacity = '1'; cur.style.opacity = '0'; S.skyA = !S.skyA; }
    var tint = { clear: 0, cloudy: .28, fog: .34, rain: .42, snow: .22 }[weather];
    S.el.tint.style.opacity = String(tint);
    var cl = { clear: phase === 'night' ? .18 : .45, cloudy: .95, fog: .55, rain: 1, snow: .9 }[weather];
    S.el.clouds.style.opacity = String(cl);
    S.el.fog.style.opacity = weather === 'fog' ? '1' : (weather === 'rain' || weather === 'snow' ? '.35' : '0');
    if (weather === 'rain' || weather === 'snow') startParticles(weather); else stopParticles(true);
  }
  function setSeason(season) {
    season = /^(spring|summer|autumn|winter)$/.test(season) ? season : 'spring';
    var changed = season !== S.season; S.season = season;
    if (!S.stage) return;
    S.stage.setAttribute('data-season', season);
    if (changed) buildHills();
  }

  /* ── 식물 ── */
  function plantPlaceholder(species, stage) {
    var c = SPECIES_COLOR[species] || SPECIES_COLOR.sunflower;
    var h = [30, 90, 160, 240, 290, 320][stage] || 30;
    var d = el('div', 'g-pp g-pp-' + stage);
    d.style.setProperty('--leaf', c.leaf); d.style.setProperty('--leaf2', c.leaf2); d.style.setProperty('--bloom', c.bloom);
    d.style.setProperty('--core', c.core); d.style.setProperty('--fruit', c.fruit); d.style.setProperty('--h', h + 'px');
    var html = '';
    if (stage === 0) html = '<i class="g-pp-seed"></i>';
    else {
      html += '<i class="g-pp-stem"></i>';
      var leaves = stage === 1 ? 2 : stage === 2 ? 4 : 2;
      for (var i = 0; i < leaves; i++) html += '<i class="g-pp-leaf" style="--i:' + i + '"></i>';
      if (stage >= 3) html += '<i class="g-pp-canopy"></i><i class="g-pp-canopy g-pp-canopy2"></i>';
      /* 꽃·열매 자리(캐노피 안, 왼쪽부터): [left, 캐노피 꼭대기에서 내려온 거리] */
      var SPOTS = [[66, 70], [136, 36], [206, 78], [96, 140], [176, 150], [236, 126], [46, 118]];
      if (stage >= 4) for (var f = 0; f < 6; f++) html += '<i class="g-pp-bloom" style="left:' + SPOTS[f][0] + 'px;bottom:calc(var(--h) - ' + SPOTS[f][1] + 'px)"></i>';
      if (stage >= 5) for (var g = 0; g < 7; g++) html += '<i class="g-pp-fruit" style="left:' + (SPOTS[g][0] + 18) + 'px;bottom:calc(var(--h) - ' + (SPOTS[g][1] + 24) + 'px)"></i>';
    }
    d.innerHTML = html;
    return d;
  }
  function setPlant(species, stage, o) {
    o = o || {};
    species = String(species || 'sunflower').toLowerCase(); stage = Math.max(0, Math.min(5, +stage || 0));
    S.species = species; S.stageNo = stage;
    if (!S.el.plant) return Promise.resolve();
    var img = asset(plantPath(species, stage));
    var node = img ? (function () { var im = el('img', 'g-plant-img'); im.src = img; im.alt = ''; im.draggable = false; return im; })() : plantPlaceholder(species, stage);
    var box = S.el.plant;
    box.setAttribute('data-species', species); box.setAttribute('data-stage', String(stage));
    box.innerHTML = ''; box.appendChild(node);
    if (o.animate && !S.reduce) { box.classList.remove('g-pop'); void box.offsetWidth; box.classList.add('g-pop'); sparkle(8); }
    /* 다음 단계 그림 미리 받기 */
    if (stage < 5) preload([asset(plantPath(species, stage + 1))]);
    return Promise.resolve();
  }
  function stageUp(species, stage) {
    sparkle(18, true);
    if (S.el.fx) { var ring = el('div', 'g-ring'); var A = anchors(); ring.style.left = A.plant.x + 'px'; ring.style.top = (A.plant.y - 120 * treeScale()) + 'px'; S.el.fx.appendChild(ring); setTimeout(function () { ring.remove(); }, 1400); }
    return new Promise(function (res) { setTimeout(function () { setPlant(species, stage, { animate: true }).then(function () { peekName(4500); res(); }); }, S.reduce ? 0 : 320); });
  }
  function sparkle(n, big) {
    if (!S.el.fx) return;
    var A = anchors(), k = treeScale(), frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var s = el('i', 'g-spark' + (big ? ' g-spark-big' : ''));
      s.style.cssText = 'left:' + (A.plant.x + rnd(-150, 150) * k) + 'px;top:' + (A.plant.y - rnd(40, 320) * k) + 'px;animation-delay:' + rnd(0, .5) + 's';
      frag.appendChild(s);
      (function (node) { setTimeout(function () { node.remove(); }, 1600); })(s);
    }
    S.el.fx.appendChild(frag);
  }
  /* +XP 떠오름 */
  function floatXp(amount, label) {
    if (!S.el.fx) return;
    var A = anchors(), d = el('div', 'g-xp');
    d.textContent = label || ('+' + amount);
    d.style.left = (A.xp.x + rnd(-60, 60)) + 'px'; d.style.top = (A.xp.y + rnd(-20, 20)) + 'px';
    S.el.fx.appendChild(d);
    setTimeout(function () { d.remove(); }, 1500);
  }

  /* ── 캐릭터 ── */
  function setCharacter(key, o) {
    o = o || {};
    /* 도서관 인물 9명(pastor·m1~m4·f1~f4) + 예전 키 a/b/c — 그림이 있는 키만 받고, 없으면 a */
    var k = String(key || 'a').toLowerCase();
    if (!/^[a-z0-9-]{1,20}$/.test(k) || !(CHAR_COLOR[k] || has('chars/char-' + k + '.webp'))) k = 'a';
    S.charKey = k; S.nickname = o.nickname || '';
    if (!S.el.char) return;
    var box = S.el.char; box.innerHTML = ''; box.setAttribute('data-char', k);
    var src = null;
    if (o.avatarUrl && /^(https?:)?\/\//.test(o.avatarUrl)) src = o.avatarUrl;
    else if (o.avatarUrl && has(o.avatarUrl.replace(/^images\/garden\/default\//, ''))) src = url(o.avatarUrl.replace(/^images\/garden\/default\//, ''));
    else src = asset('chars/char-' + k + '.webp');
    /* 인물은 장면이 아니라 오른쪽 메뉴의 '내 모습' 칸에 보인다(2026-10-23) — 같은 그림을 알려 준다 */
    try { document.dispatchEvent(new CustomEvent('g-character', { detail: { key: k, src: src, nickname: S.nickname } })); } catch (e) { }
    if (src) { var im = el('img', 'g-char-img'); im.src = src; im.alt = ''; im.draggable = false; box.appendChild(im); return; }
    var c = CHAR_COLOR[k] || CHAR_COLOR.a, ph = el('div', 'g-char-ph');
    ph.style.setProperty('--skin', c.skin); ph.style.setProperty('--body', c.body);
    ph.innerHTML = '<i class="g-cp-head"></i><i class="g-cp-body"><b>' + esc((o.nickname || '').trim().slice(0, 1)) + '</b></i><i class="g-cp-arm g-cp-arm-l"></i><i class="g-cp-arm g-cp-arm-r"></i><i class="g-cp-shadow"></i>';
    box.appendChild(ph);
  }

  function peekName(ms) {
    if (!S.el.np) return;
    S.el.np.classList.add('is-show'); clearTimeout(S.npT);
    S.npT = setTimeout(function () { S.el.np.classList.remove('is-show'); }, ms || 3500);
  }

  /* ── 이름판(SVG 고리) ── */
  function setNameplate(name, sub) {
    S.plantName = name || '';
    if (!S.el.np) return;
    var text = (name || '').trim(), sub2 = (sub || '').trim();
    var full = sub2 ? text + ' · ' + sub2 : text;
    var estW = 0; for (var i = 0; i < full.length; i++) estW += full.charCodeAt(i) > 255 ? 19 : 11;
    var maxW = 250, tl = estW > maxW ? ' textLength="' + maxW + '" lengthAdjust="spacingAndGlyphs"' : '';
    S.el.np.innerHTML =
      '<svg class="g-np" viewBox="0 0 320 64" width="320" height="64" aria-hidden="true">' +
      '<rect x="4" y="8" width="312" height="48" rx="24" class="g-np-bg"/>' +
      '<circle cx="32" cy="32" r="13" class="g-np-ring"/>' +
      '<circle cx="32" cy="32" r="5" class="g-np-dot"/>' +
      '<text x="58" y="39" class="g-np-text"' + tl + '>' + esc(full) + '</text></svg>';
  }

  function setReducedMotion(on) {
    S.reduce = !!on;
    if (S.stage) S.stage.classList.toggle('g-reduce', S.reduce);
    if (S.root) S.root.classList.toggle('g-reduce', S.reduce);
    if (S.reduce) { stopParticles(true); LAYERS.forEach(function (L) { if (S.el[L.id]) S.el[L.id].style.transform = ''; }); }
    else if (S.pType) startParticles(S.pType);
    else if (S.weather === 'rain' || S.weather === 'snow') startParticles(S.weather);
  }
  function setWorld(w) { for (var k in w) world[k] = w[k]; }
  function preview() {
    return {
      sky: function (p, w) { setSky(p, w); return S.phase + '/' + S.weather; },
      season: setSeason, plant: function (sp, st) { return setPlant(sp, st, { animate: true }); },
      stageUp: function (st) { return stageUp(S.species, st == null ? Math.min(5, S.stageNo + 1) : st); },
      xp: function (n) { floatXp(n || 10); }, state: function () { return JSON.parse(JSON.stringify({ phase: S.phase, weather: S.weather, season: S.season, species: S.species, stage: S.stageNo, scale: S.scale, reduce: S.reduce, hasManifest: !!S.manifest })); }
    };
  }

  return {
    W: W, H: H, mount: mount, layout: layout, project: project, anchors: anchors, world: function () { return world; }, setWorld: setWorld, setField: setField,
    rotateField: rotateField, fieldRot: function () { return S.fieldRot || 0; },
    setSky: setSky, setSeason: setSeason, setPlant: setPlant, stageUp: stageUp, setCharacter: setCharacter, floatXp: floatXp, sparkle: sparkle,
    setNameplate: setNameplate, peekName: peekName, setReducedMotion: setReducedMotion, preview: preview,
    phaseOf: phaseOf, weatherOf: weatherOf, seasonOf: seasonOf, toMin: toMin,
    asset: asset, has: has, preload: preload, assetsFor: assetsFor, setManifest: function (m, base) { S.manifest = m || null; if (base) S.base = base; },
    mounted: function () { return S.mounted; }, phase: function () { return S.phase; }, weather: function () { return S.weather; }
  };
})();
