/* ============================================================
   신앙 정원 — 나의 정원에 들어가기 (입체)
   2026-10-23 담임목사: "정원을 크게 입체적으로 볼 수 있어야", "모바일은 전체 화면이 되게",
     "이런 식으로 보여야 합니다. 확대 축소 해서 볼 수 있어야" (농장 게임처럼 땅 전체를 마름모로 내려다보는 그림)
   · 보기: 내 땅 전체(산 칸 + 앞으로 살 수 있는 칸)를 도톰한 잔디 판으로 놓고 남동쪽 위에서 마름모로 내려다본다.
     끌면 옮겨 보고, 휠·두 손가락으로 확대·축소, 돌리기 단추·오른쪽 끌기·두 손가락 비틀기로 돈다.
     보는 각도(기울기)는 따로: 기울기 단추·오른쪽 끌기 위아래·두 손가락을 함께 위아래로 (2026-10-23 담임목사 "보는 각도를 조절, 모바일은 두 손으로, 더 축소")
   · 2.5D 클레이(도서관 프로그램 '정원 가꾸기'와 같은 방식): 땅·빛·그림자·바람·비·눈은 three.js 3D,
     나무·꽃·작물·인물은 정원과 같은 클레이 그림 판(늘 보는 쪽으로 돈다). 코드로 그린 나무는 쓰지 않는다
   · 해: 교회 자리의 지금 해 방위·고도 → 빛 방향과 그림자 길이. 해가 지면 달빛과 별
   · 거둘 때가 된 작물·열매 나무 위에는 열매 말풍선 — 누르면 거두러 간다(o.onBubble)
   · 그리기만 한다: 자료는 여는 쪽(main.js)이 넘긴다. 받는 것은 three.js 와 그림뿐
   Garden3D.open({ title, sub, place, plant:{src,name,bubble}, land:{tiles:[{x,y,land,src,h,dead,name,bubble}], max} | Promise,
                   lat, lng, wx:{code,temp,wind}, art:{hills,clouds,soil,dae}, t(key,vars), reduce, opener, onBubble(kind), onClose,
                   prep: Promise<{위 칸들 일부 | error}> — 누른 순간 창부터 열고(휴대폰 전체 화면은 누른 순간에만 된다) 자료는 뒤에 채운다(이웃 정원 방문),
                   side: 오른쪽 칸(방명록 등, 휴대폰은 아래에서 올라오는 칸), sideLabel,
                   onTile(cell{x,y,owned}) · fmtLeft(ms) · onExpire() — 내 땅 가꾸기(farm.js)가 칸 누르기·남은 시간을 받는다 })
   돌려주는 것: { close, side(label), openSide(on), setLand(land), setTreeBubble(src), flash(cell, text) }
   land = { tiles:[{x,y,land,planted,src,h,dead,name,bubble,until,tag,house}], max, buyable:[{x,y,label}], picks:{'x,y':1}, pickable:{'x,y':1}, mode }
   tile.house = 하우스(유리 온실, 20261024_0100) — 박공지붕 유리 온실을 칸 위에 세우고, 안의 그림은 처마 높이에 맞춰 줄인다
   ============================================================ */
window.Garden3D = (function () {
  'use strict';
  var THREE_URLS = [
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
    'https://unpkg.com/three@0.160.0/build/three.module.min.js'
  ];
  var TS = 2.2;                 // 칸 한 변(m)
  var HILL_R = 160;             // 먼 언덕 둘레 반지름(m) — 멀리 물러나도 언덕 안쪽에 있게
  var T = null, CUR = null, OK = null;

  function loadThree() {
    if (T) return Promise.resolve(T);
    var i = 0;
    function next() { return import(THREE_URLS[i]).then(function (m) { T = m; return m; }, function (e) { i++; if (i < THREE_URLS.length) return next(); throw e; }); }
    return next();
  }
  /* 쓰는 법 안내: 하루 한 번, 10초 — 사흘 잇달아 들어와 가꾸었으면(심기·거두기 등) 더는 안 보인다 (2026-10-23 담임목사) */
  function dayKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function markUsed() {
    try {
      var now = new Date(), today = dayKey(now), y = new Date(now.getTime() - 86400000), st = JSON.parse(localStorage.getItem('g3d_use') || 'null') || { last: '', n: 0 };
      if (st.last === today) return;
      st.n = st.last === dayKey(y) ? st.n + 1 : 1; st.last = today;
      localStorage.setItem('g3d_use', JSON.stringify(st));
    } catch (e) { }
  }
  function hintWanted() {
    try {
      var st = JSON.parse(localStorage.getItem('g3d_use') || 'null');
      if (st && st.n >= 3) return false;
      var today = dayKey(new Date()), seen = localStorage.getItem('g3d_hint_day');
      localStorage.setItem('g3d_hint_day', today);
      return seen !== today;
    } catch (e) { return true; }
  }
  function supported() {
    if (OK !== null) return OK;
    try { var c = document.createElement('canvas'); OK = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { OK = false; }
    return OK;
  }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) { if (k === 'text') e.textContent = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) e.append(c); });
    return e;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mix(a, b, k) { return a + (b - a) * k; }
  var IMG = {};
  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (!IMG[src]) IMG[src] = new Promise(function (res) { var i = new Image(); i.decoding = 'async'; i.onload = function () { res(i); }; i.onerror = function () { delete IMG[src]; res(null); }; i.src = src; });
    return IMG[src];
  }

  /* 해 위치(저정밀 천문 계산, 오차 1° 안쪽): 고도·방위(북 0°, 동 90°) */
  function sunPos(date, lat, lng) {
    var rad = Math.PI / 180, d = date.getTime() / 86400000 - 10957.5;   // 2000-01-01 12:00 UTC 부터 날 수
    var g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
    var L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
    var ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    var gmst = ((18.697374558 + 24.06570982441908 * d) % 24) * 15 * rad;
    var H = gmst + lng * rad - ra, la = lat * rad;
    var alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H));
    var az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(H));
    return { alt: alt / rad, az: ((az / rad) % 360 + 360) % 360 };
  }
  /* 날씨 코드 → 하늘 (scene.js weatherOf 와 같은 규칙) */
  function wxKind(code) {
    code = +code;
    if (!(code >= 0) || code <= 1) return 'clear';
    if (code <= 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 51) return 'rain';
    return 'cloudy';
  }
  /* 그림 안 실제 모양의 테두리(0~1) — 밑동을 땅에 맞추고, 크기를 모양 기준으로 정한다 */
  function bbox(im) {
    var n = 64, c = document.createElement('canvas'); c.width = n; c.height = n;
    var g = c.getContext('2d', { willReadFrequently: true }), d;
    g.drawImage(im, 0, 0, n, n);
    try { d = g.getImageData(0, 0, n, n).data; } catch (e) { return { l: 0, r: 1, t: 0, b: 1 }; }
    var l = n, r = -1, tp = n, b = -1;
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (d[(y * n + x) * 4 + 3] > 40) { if (x < l) l = x; if (x > r) r = x; if (y < tp) tp = y; if (y > b) b = y; }
    if (r < 0) return { l: 0, r: 1, t: 0, b: 1 };
    return { l: l / n, r: (r + 1) / n, t: tp / n, b: (b + 1) / n };
  }

  function open(o) {
    if (CUR) return CUR;
    o = o || {};
    var t = o.t || function (k) { return k; };
    var dead = false, R = null, raf = 0, pushed = false, reduce = !!o.reduce;
    var touch = false; try { touch = matchMedia('(pointer: coarse)').matches; } catch (e) { }
    var phone = false; try { phone = matchMedia('(max-width: 760px)').matches; } catch (e) { }

    /* ── 화면 ── */
    var canvas = h('canvas', { class: 'g3d-cv', tabindex: '0', 'aria-label': t('g3d.canvas') });
    var load = h('div', { class: 'g3d-load', role: 'status', text: t('g3d.loading') });
    var wxLine = h('div', { class: 'g3d-wx', hidden: '' });
    var hint = h('div', { class: 'g3d-hint', text: t(touch ? 'g3d.hint.touch' : 'g3d.hint') });
    var tip = h('div', { class: 'g3d-tip', role: 'status', 'aria-live': 'polite', hidden: '' });
    function ctl(key, txt) { return h('button', { type: 'button', class: 'g3d-ctl-b', 'aria-label': t(key), title: t(key), text: txt }); }
    var zIn = ctl('g3d.zoomIn', '+'), zOut = ctl('g3d.zoomOut', '−'), rL = ctl('g3d.rotL', '↺'), rR = ctl('g3d.rotR', '↻');
    var tUp = ctl('g3d.tiltUp', '∧'), tDn = ctl('g3d.tiltDn', '∨');
    var ctls = h('div', { class: 'g3d-ctl' }, [zIn, zOut, tUp, tDn, rL, rR]);
    var fullBtn = (document.fullscreenEnabled && !phone) ? h('button', { type: 'button', class: 'g3d-btn', text: t('g3d.full') }) : null;
    var resetBtn = h('button', { type: 'button', class: 'g3d-btn', text: t('g3d.reset') });
    var closeBtn = h('button', { type: 'button', class: 'g3d-btn g3d-btn-close', text: t('g3d.close') });
    var stage = h('div', { class: 'g3d-stage' }, [canvas, load, wxLine, hint, tip, ctls]);
    var titleEl = h('b', { class: 'g3d-title', text: o.title || t('g3d.title') }), subEl = h('span', { class: 'g3d-sub', text: o.sub || '' });
    var sideBtn = h('button', { type: 'button', class: 'g3d-btn g3d-side-btn', hidden: '', 'aria-expanded': 'false' });
    var body = h('div', { class: 'g3d-body' }, [stage]);
    var root = h('div', { class: 'g3d' + (phone ? ' is-phone' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || t('g3d.title') }, [
      h('header', { class: 'g3d-top' }, [titleEl, subEl, h('span', { class: 'g3d-grow' }), sideBtn, resetBtn, fullBtn, closeBtn]),
      body
    ]);
    // 오른쪽 칸(방명록): 넓은 화면은 늘 펼침, 휴대폰은 단추로 아래에서 올린다
    function setSide(el, label) {
      if (!el) return;
      el.classList.add('g3d-side'); body.append(el); root.classList.add('has-side');
      sideBtn.textContent = label || ''; sideBtn.hidden = !phone || !label;
      sideBtn.onclick = function () { var on = !root.classList.contains('is-side'); root.classList.toggle('is-side', on); sideBtn.setAttribute('aria-expanded', String(on)); setTimeout(onResize, 30); };
      setTimeout(onResize, 30);
    }
    function setHead() { titleEl.textContent = o.title || t('g3d.title'); subEl.textContent = o.sub || ''; subEl.hidden = !o.sub; root.setAttribute('aria-label', o.title || t('g3d.title')); }
    setHead();
    document.body.append(root);
    document.documentElement.classList.add('g3d-open');
    // 휴대폰은 화면 전체로(주소창까지 숨김). 누른 그 순간에만 허락되므로 여기서 바로 부른다
    if (phone && root.requestFullscreen) { try { root.requestFullscreen({ navigationUI: 'hide' }).catch(function () { }); } catch (e) { } }
    // 뒤로 가기 = 닫기
    try { history.pushState({ g3d: 1 }, ''); pushed = true; } catch (e) { }
    closeBtn.focus({ preventScroll: true });
    // 쓰는 법 안내는 하루에 한 번만, 10초 뒤(또는 처음 만질 때) 사라진다 — 2026-10-23 담임목사
    function hideHint() { if (hint.hidden || hint.classList.contains('is-gone')) return; hint.classList.add('is-gone'); setTimeout(function () { hint.hidden = true; }, 700); }
    if (!hintWanted()) hint.hidden = true; else setTimeout(hideHint, 10000);

    function onFs() { if (fullBtn) fullBtn.textContent = t(document.fullscreenElement === root ? 'g3d.fullExit' : 'g3d.full'); setTimeout(onResize, 60); }
    document.addEventListener('fullscreenchange', onFs);
    if (fullBtn) fullBtn.onclick = function () {
      if (document.fullscreenElement === root) document.exitFullscreen().catch(function () { });
      else root.requestFullscreen().catch(function () { });
    };
    closeBtn.onclick = function () { close(); };
    function onKey(e) {
      if (e.key === 'Escape' && !document.fullscreenElement) { close(); return; }
      if (R && R.key && !e.altKey && !e.ctrlKey && !e.metaKey && R.key(e.key)) e.preventDefault();
    }
    document.addEventListener('keydown', onKey);
    function onPop() { pushed = false; close(true); }
    window.addEventListener('popstate', onPop);

    function close(fromPop) {
      if (dead) return;
      dead = true; CUR = null;
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('popstate', onPop); document.removeEventListener('visibilitychange', onVis);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', onResize);
      if (document.fullscreenElement === root) { try { document.exitFullscreen().catch(function () { }); } catch (e) { } }
      if (R) {
        R.scene.traverse(function (m) {
          if (m.geometry) m.geometry.dispose();
          if (m.material) [].concat(m.material).forEach(function (mt) { ['map', 'emissiveMap', 'alphaMap'].forEach(function (k) { if (mt[k]) mt[k].dispose(); }); mt.dispose(); });
        });
        R.renderer.dispose(); try { R.renderer.forceContextLoss(); } catch (e) { }
      }
      root.remove(); document.documentElement.classList.remove('g3d-open');
      if (pushed && !fromPop && history.state && history.state.g3d) { try { history.back(); } catch (e) { } }
      if (o.opener && o.opener.focus) o.opener.focus({ preventScroll: true });
      if (o.onClose) o.onClose();
    }
    var pendingLand = null;
    CUR = {
      close: function () { close(); },
      side: function (label) { if (label != null) { sideBtn.textContent = label; } },
      openSide: function (on) { if (!phone) return; root.classList.toggle('is-side', !!on); sideBtn.setAttribute('aria-expanded', String(!!on)); },
      setLand: function (land) { if (R && R.drawLand) R.drawLand(land); else pendingLand = land; },
      setTreeBubble: function (src) { if (R && R.treeBubble) R.treeBubble(src); },
      flash: function (cell, text) { if (R && R.flash) R.flash(cell, text); },
      // 칸 가운데의 화면 좌표(시험·도움말용)
      project: function (cx, cy, hh) {
        if (!R || !T) return null;
        var v = new T.Vector3(cx * TS, hh || 0, cy * TS).project(R.camera), r = canvas.getBoundingClientRect();
        return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
      }
    };
    function onResize() {
      if (!R) return;
      var w = stage.clientWidth || 1, hh = stage.clientHeight || 1;
      R.renderer.setSize(w, hh, false); R.camera.aspect = w / hh; R.camera.updateProjectionMatrix();
      if (R.refit) R.refit();
    }
    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(onResize); ro.observe(stage); } else window.addEventListener('resize', onResize);
    function onVis() { if (!document.hidden && R && R.tick && !raf) raf = requestAnimationFrame(R.tick); }
    document.addEventListener('visibilitychange', onVis);

    var art = o.art || {};
    Promise.resolve(o.prep).then(function (x) {
      if (dead) return Promise.reject(null);
      if (x && x.error) { load.textContent = x.error; return Promise.reject(null); }
      if (x) for (var k in x) o[k] = x[k];
      setHead(); setSide(o.side, o.sideLabel);
      return Promise.all([loadThree(), loadImage(art.hills), loadImage(art.clouds), loadImage(art.soil), loadImage(art.dae), loadImage(o.plant && o.plant.src), loadImage(art.grass)]);
    }).then(function (rs) {
        if (dead) return;
        try { build({ hills: rs[1], clouds: rs[2], soil: rs[3], dae: rs[4], plant: rs[5], grass: rs[6] }); }
        catch (e) { load.textContent = t('g3d.fail'); return; }
        load.remove();
      }, function (e) { if (!dead && e !== null) load.textContent = t('g3d.fail'); });

    /* ── 3D ── */
    function build(img) {
      var now = new Date(), lat = isFinite(+o.lat) ? +o.lat : 37.09, lng = isFinite(+o.lng) ? +o.lng : 126.8;
      var sun = sunPos(now, lat, lng), wx = o.wx || {}, kind = wxKind(wx.code);
      var day = clamp((sun.alt + 4) / 14, 0, 1), sunUp = sun.alt > 0;
      var cloud = { clear: 0.12, cloudy: 0.72, fog: 0.8, rain: 0.95, snow: 0.85 }[kind];
      var wind = clamp((+wx.wind || 6) / 30, 0, 1.3);

      var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(phone ? 1.75 : 2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
      var scene = new T.Scene(), camera = new T.PerspectiveCamera(32, 1, 0.1, 900);
      R = { renderer: renderer, scene: scene, camera: camera };
      onResize();

      function tex(im, o2) {
        var tx = new T.Texture(im); tx.colorSpace = T.SRGBColorSpace; tx.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        if (o2 && o2.repeat) { tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.repeat.set(o2.repeat, o2.repeat); }
        tx.needsUpdate = true;
        return tx;
      }

      // 하늘: 해 고도·구름양으로 색(낮 파랑 → 노을 → 밤). 멀리 물러나면 땅 끝 너머로 보인다
      var dusk = clamp(1 - Math.abs(sun.alt - 2) / 10, 0, 1);
      var zen = new T.Color().setRGB(mix(0.05, 0.36, day), mix(0.09, 0.62, day), mix(0.2, 0.86, day));
      var hor = new T.Color().setRGB(mix(0.16, 0.82, day), mix(0.2, 0.9, day), mix(0.32, 0.96, day)).lerp(new T.Color(0.98, 0.72, 0.52), dusk * 0.7);
      var grey = new T.Color(0.72, 0.74, 0.78).multiplyScalar(mix(0.25, 1, day));
      zen.lerp(grey, cloud * 0.7); hor.lerp(grey, cloud * 0.6);
      var sky = new T.Mesh(new T.SphereGeometry(600, 32, 16), new T.ShaderMaterial({
        side: T.BackSide, depthWrite: false, uniforms: { zen: { value: zen }, hor: { value: hor } },
        vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 zen; uniform vec3 hor; varying vec3 vp; void main(){ float k = clamp(vp.y*1.5, 0.0, 1.0); gl_FragColor = vec4(mix(hor, zen, pow(k, 0.7)), 1.0); }'
      }));
      sky.renderOrder = -3; scene.add(sky);
      // 안개 색은 하늘 지평선과 같게(하늘은 색 변환 없이 그리므로 안개 쪽을 거꾸로 맞춘다)
      var fogCol = hor.clone().convertSRGBToLinear();
      scene.fog = kind === 'fog' ? new T.Fog(fogCol, 30, 160) : new T.Fog(fogCol, 140, 520);
      // 별: 해가 지고 하늘이 개면
      var nightK = clamp((-sun.alt - 4) / 8, 0, 1) * (1 - cloud);
      if (nightK > 0.05) {
        var sp = new Float32Array(700 * 3);
        for (var s = 0; s < 700; s++) { var th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.92 + 0.08); sp.set([Math.sin(ph) * Math.cos(th) * 560, Math.cos(ph) * 560, Math.sin(ph) * Math.sin(th) * 560], s * 3); }
        var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3));
        var stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85 * nightK, fog: false, depthWrite: false }));
        stars.renderOrder = -2; scene.add(stars);
      }

      // 빛: 해 방향(북 = -z, 동 = +x). 해가 지면 달빛
      var az = sun.az * Math.PI / 180, alt = Math.max(sun.alt, -10) * Math.PI / 180;
      var sunDir = new T.Vector3(Math.sin(az) * Math.cos(alt), Math.max(Math.sin(alt), 0.05), -Math.cos(az) * Math.cos(alt)).normalize();
      var warm = clamp(sun.alt / 25, 0, 1);
      var sl = new T.DirectionalLight(new T.Color(1, mix(0.78, 0.97, warm), mix(0.62, 0.92, warm)), sunUp ? clamp(Math.sin(alt) * 2.6 + 0.4, 0.4, 2.4) * (1 - cloud * 0.55) : 0);
      if (!sunUp) { sl.color.setRGB(0.62, 0.7, 0.92); sl.intensity = 0.45; sunDir.set(-0.4, 0.75, -0.5).normalize(); }
      sl.position.copy(sunDir.clone().multiplyScalar(60)); sl.target.position.set(0, 0, 0);
      sl.castShadow = true; sl.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
      sl.shadow.bias = -0.0006; sl.shadow.normalBias = 0.02; sl.shadow.radius = 3;
      var sc0 = sl.shadow.camera; sc0.near = 1; sc0.far = 160;
      scene.add(sl, sl.target);
      scene.add(new T.HemisphereLight(hor.clone().lerp(new T.Color(1, 1, 1), 0.35), new T.Color(0.42, 0.38, 0.3), mix(0.35, 1.0, day)));
      scene.add(new T.AmbientLight(0xffffff, mix(0.18, 0.12, day)));

      // 먼 언덕(땅 끝 너머): 정원 언덕 그림의 먼 산 부분(큰 나무를 뺀 오른쪽 75%, 위 58%)을 둘레에 여섯 번, 거울로 이어 이음매가 없다
      if (img.hills) {
        var hc2 = document.createElement('canvas'), hw = Math.round(img.hills.width * 0.75), hh2 = Math.round(img.hills.height * 0.58);
        hc2.width = hw; hc2.height = hh2; hc2.getContext('2d').drawImage(img.hills, img.hills.width - hw, 0, hw, hh2, 0, 0, hw, hh2);
        var htx = new T.CanvasTexture(hc2); htx.colorSpace = T.SRGBColorSpace; htx.anisotropy = 4;
        htx.wrapS = T.MirroredRepeatWrapping; htx.repeat.set(-6, 1); htx.offset.set(4.25, 0); htx.needsUpdate = true;
        var BH = HILL_R * (Math.PI / 3) * hh2 / hw;
        var hills = new T.Mesh(new T.CylinderGeometry(HILL_R, HILL_R, BH, 128, 1, true), new T.MeshBasicMaterial({ map: htx, transparent: true, side: T.BackSide, depthWrite: false }));
        hills.position.y = BH / 2 - 1.2; hills.renderOrder = -1;
        hills.material.color.setScalar(mix(0.38, 1, day) * (1 - cloud * 0.12));
        scene.add(hills);
      }
      var clouds = null;
      if (img.clouds) {
        var ctx2 = tex(img.clouds); ctx2.wrapS = T.MirroredRepeatWrapping; ctx2.repeat.set(-4, 1); ctx2.offset.set(3, 0); ctx2.needsUpdate = true;
        var CR = 380, CH = CR * (Math.PI / 2) / 3 * 0.6;
        clouds = new T.Mesh(new T.CylinderGeometry(CR, CR, CH, 96, 1, true), new T.MeshBasicMaterial({ map: ctx2, transparent: true, side: T.BackSide, depthWrite: false, fog: false, opacity: (kind === 'clear' ? 0.75 : 0.95) * mix(0.25, 1, day) }));
        clouds.position.y = CH / 2 - 4; clouds.renderOrder = -2;
        clouds.material.color.setScalar(mix(0.35, 1, day)).lerp(new T.Color(0.7, 0.72, 0.76), cloud * 0.5);
        scene.add(clouds);
      }

      // 잔디: 언덕 그림 앞쪽 잔디(아래 83~93%, 왼쪽 40%)를 떼어 거울로 이어 깐다 → 정원 장면과 같은 점토 잔디
      var wet = (kind === 'rain') ? 1 : 0, snowK = kind === 'snow' ? 0.7 : 0;
      function tint(c) { return c.multiplyScalar(1 - wet * 0.2).lerp(new T.Color(0.95, 0.96, 1), snowK); }
      var lawnCv = null;
      if (img.hills) {
        lawnCv = document.createElement('canvas'); lawnCv.width = 256; lawnCv.height = 128;
        lawnCv.getContext('2d').drawImage(img.hills, 0, img.hills.height * 0.83, img.hills.width * 0.4, img.hills.height * 0.1, 0, 0, 256, 128);
      }
      function lawnMat(rep, color, glow) {
        var m = new T.MeshStandardMaterial({ roughness: 1, color: color, emissive: new T.Color(1, 1, 1), emissiveIntensity: glow * (0.25 + 0.75 * day) });
        if (lawnCv) { var lt = new T.CanvasTexture(lawnCv); lt.colorSpace = T.SRGBColorSpace; lt.wrapS = lt.wrapT = T.MirroredRepeatWrapping; lt.repeat.set(rep, rep * 2); lt.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); m.map = lt; m.emissiveMap = lt; }
        else m.color.multiply(new T.Color(0.8, 0.84, 0.5));
        tint(m.color);
        return m;
      }
      // 바깥 땅: 내 땅보다 짙은 풀색 (게임 그림처럼 판이 또렷하게)
      var outer = new T.Mesh(new T.CircleGeometry(HILL_R + 2, 96), lawnMat((HILL_R + 2) / 4, new T.Color(0.5, 0.64, 0.4), 0.12));
      outer.rotation.x = -Math.PI / 2; outer.position.y = -0.7; outer.receiveShadow = true; scene.add(outer);

      // 그림 판(나무·꽃·작물·인물): 보이는 판은 늘 카메라 쪽, 그림자 판은 늘 해 쪽 → 어느 쪽에서 봐도 그림자가 온전하다
      var items = [], bubbles = [], shadowYaw = Math.atan2(sunDir.x, sunDir.z), plantGroup = new T.Group(); scene.add(plantGroup);
      function sprite(im, s) {
        // s: { x, z, y, h: 모양 높이(m) | size: 그림 높이(m), center, stiff, dead, name }
        var bb = bbox(im), ar = im.width / im.height;
        var H = s.size || s.h / Math.max(0.05, bb.b - bb.t), W = H * ar;
        var cx = s.center ? 0.5 : (bb.l + bb.r) / 2;
        var geo = new T.PlaneGeometry(1, 1); geo.translate(0.5 - cx, bb.b - 0.5 - 0.01, 0);
        var tx = tex(im);
        var mat = new T.MeshStandardMaterial({ map: tx, alphaTest: 0.5, side: T.DoubleSide, roughness: 1, emissive: new T.Color(1, 1, 1), emissiveMap: tx, emissiveIntensity: s.dead ? 0.08 : 0.14 + 0.26 * day });
        mat.alphaToCoverage = true;
        if (s.dead) mat.color.setRGB(0.66, 0.63, 0.58);
        var mesh = new T.Mesh(geo, mat); mesh.rotation.order = 'YXZ'; mesh.scale.set(W, H, 1);
        // 그림자 판: 화면에는 안 그리고(colorWrite false) 그림자 지도에만 — three 는 그림자를 그릴 때 이 재질의 map·alphaTest·side 를 쓴다
        var shm = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tx, alphaTest: 0.5, side: T.DoubleSide, colorWrite: false, depthWrite: false }));
        shm.rotation.order = 'YXZ'; shm.scale.set(W, H, 1); shm.rotation.y = shadowYaw; shm.castShadow = true;
        var g = new T.Group(); g.position.set(s.x, s.y || 0, s.z); g.add(mesh, shm); (s.parent || plantGroup).add(g);
        var it = { g: g, mesh: mesh, shm: shm, im: im, ph: Math.random() * 6.28, stiff: s.stiff == null ? (H > 2.4 ? 0.4 : 1) : s.stiff, name: s.name || '', drop: 0, vy: 0, top: H * (bb.b - bb.t), cell: s.cell || null, tile: !!s.cell };
        items.push(it);
        return it;
      }
      // 열매 말풍선: 흰 말풍선 안에 열매 그림. 늘 보이고(depthTest 끔) 살짝 떠 오르내린다
      function bubble(src, x, y, z, kind2, data, gen) {
        loadImage(src).then(function (im) {
          if (dead || !im || (gen != null && gen !== landGen)) return;
          var c = document.createElement('canvas'); c.width = 128; c.height = 148;
          var g = c.getContext('2d');
          g.beginPath(); g.arc(64, 60, 52, 0, Math.PI * 2); g.moveTo(50, 104); g.lineTo(64, 132); g.lineTo(78, 104); g.closePath();
          g.shadowColor = 'rgba(80,60,40,.28)'; g.shadowBlur = 10; g.shadowOffsetY = 3; g.fillStyle = '#fffaf3'; g.fill();
          g.shadowColor = 'transparent'; g.lineWidth = 3; g.strokeStyle = '#e6d6c3'; g.stroke();
          var k = 78 / Math.max(im.width, im.height); g.drawImage(im, 64 - im.width * k / 2, 60 - im.height * k / 2, im.width * k, im.height * k);
          var bt = new T.CanvasTexture(c); bt.colorSpace = T.SRGBColorSpace;
          var sp2 = new T.Sprite(new T.SpriteMaterial({ map: bt, depthTest: false, depthWrite: false, fog: false }));
          sp2.center.set(0.5, 0); sp2.scale.set(0.95, 0.95 * 148 / 128, 1); sp2.position.set(x, y, z); sp2.renderOrder = 10;
          scene.add(sp2);
          bubbles.push({ s: sp2, y: y, ph: Math.random() * 6.28, kind: kind2, data: data || null, tile: kind2 === 'tile' });
        });
      }
      function plateMat(map, color) { var m = new T.MeshStandardMaterial({ roughness: 1, color: color || 0xffffff }); if (map) m.map = map; return m; }
      var soilTx = img.soil ? tex(img.soil, { repeat: 2.5 }) : null, daeTx = img.dae ? tex(img.dae) : null;
      var M = {
        jeonTop: plateMat(soilTx, soilTx ? 0xd2bfae : 0x8a6a4a), jeonSide: plateMat(null, 0x6a5036),
        daeTop: plateMat(daeTx, daeTx ? 0xffffff : 0xe6d8bc), daeSide: plateMat(null, 0xc4b08a),
        homeTop: plateMat(null, 0xb9a98e), homeSide: plateMat(null, 0x8f7f66),
        grassTop: plateMat(img.grass ? tex(img.grass) : null, img.grass ? 0xffffff : 0x9cb46c), grassSide: plateMat(null, 0x7d6a4c)   // 빈 밭(2D 내 땅과 같은 잔디 무늬)
      };
      [M.jeonTop, M.daeTop, M.homeTop, M.grassTop].forEach(function (m) { tint(m.color); });
      var gJeon = new T.BoxGeometry(TS * 0.94, 0.16, TS * 0.94), gDae = new T.BoxGeometry(TS * 0.94, 0.09, TS * 0.94), gHome = new T.BoxGeometry(TS * 0.94, 0.07, TS * 0.94), gGrass = new T.BoxGeometry(TS * 0.94, 0.1, TS * 0.94);
      var tileMeshes = [];
      function plate(x, y, kind2, parent, cell) {
        var geo = kind2 === 'dae' ? gDae : kind2 === 'home' ? gHome : kind2 === 'grass' ? gGrass : gJeon, top = M[kind2 + 'Top'] || M.jeonTop, side = M[kind2 + 'Side'] || M.jeonSide;
        var m = new T.Mesh(geo, [side, side, top, side, side, side]);
        m.position.set(x * TS, geo.parameters.height / 2, y * TS); m.castShadow = true; m.receiveShadow = true;
        if (cell) { m.userData.cell = cell; tileMeshes.push(m); }
        (parent || scene).add(m);
        return geo.parameters.height;
      }

      // 내 땅 판: 앞으로 살 수 있는 칸까지(-max~max) 도톰한 잔디 판, 칸 금은 옅게. 산 칸은 그 위에 밭·대지로
      var landGroup = new T.Group(); scene.add(landGroup);
      var half = TS * 4.5, extent = TS * 1.5;
      function makeLand(max) {
        landGroup.children.slice().forEach(function (c) { landGroup.remove(c); if (c.geometry) c.geometry.dispose(); });
        var n = 2 * max + 1, size = n * TS; half = size / 2;
        var top = lawnMat(size / 4, new T.Color(1, 1, 1), 0.2), side = plateMat(null, 0x8a6a48); tint(side.color);
        var base = new T.Mesh(new T.BoxGeometry(size, 0.7, size), [side, side, top, side, side, side]);
        base.position.y = -0.35; base.receiveShadow = true; landGroup.add(base);
        var lp = [];
        for (var i = 0; i <= n; i++) { var v = -half + i * TS; lp.push(v, 0.01, -half, v, 0.01, half, -half, 0.01, v, half, 0.01, v); }
        var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(lp, 3));
        landGroup.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false })));
        var sc = sl.shadow.camera, ext = half + 4; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix();
      }
      makeLand(4);

      // 가운데 칸: 믿음 나무 + 흙 둔덕 (사람은 세우지 않는다 — 2026-10-23 담임목사 "사람을 삭제해 주세요")
      var homeH = plate(0, 0, 'home', null, { x: 0, y: 0, owned: true, home: true });
      var mound = new T.Mesh(new T.CylinderGeometry(TS * 0.3, TS * 0.36, 0.08, 40), plateMat(null, 0x7a5c40));
      mound.position.set(0, homeH + 0.04, 0); mound.receiveShadow = true; scene.add(mound);
      if (img.plant) {
        var tree = sprite(img.plant, { x: 0, z: 0, y: homeH + 0.06, size: 3.9, center: true, name: o.plant.name || '' });
        tree.cell = { x: 0, y: 0, owned: true, home: true };
        if (o.plant.bubble) bubble(o.plant.bubble, 0, homeH + tree.top + 0.3, 0, 'tree');
      }
      R.treeBubble = function (src) {   // 믿음 나무 열매를 다 따면 말풍선을 뗀다
        bubbles = bubbles.filter(function (b) { if (b.kind === 'tree') { scene.remove(b.s); b.s.material.map.dispose(); b.s.material.dispose(); return false; } return true; });
        if (src && tree) bubble(src, 0, homeH + tree.top + 0.3, 0, 'tree');
      };

      // 글 딱지(남은 시간·목말라요·값·✓): 캔버스 글씨 판, 늘 보이게
      function tagTex(text, tone) {
        var c = document.createElement('canvas'), g = c.getContext('2d'), fs = 30;
        g.font = '700 ' + fs + 'px "Noto Sans KR", sans-serif';
        var w = Math.ceil(g.measureText(text).width) + 32, hh = fs + 22;
        c.width = w; c.height = hh; g.font = '700 ' + fs + 'px "Noto Sans KR", sans-serif';
        var bg = tone === 'warn' ? '#fbe3da' : tone === 'buy' ? '#fffaf3' : tone === 'pick' ? '#e9805f' : '#fffaf3';
        var fg = tone === 'warn' ? '#b5523a' : tone === 'pick' ? '#ffffff' : tone === 'buy' ? '#b5523a' : '#4a3b31';
        g.fillStyle = bg; g.strokeStyle = tone === 'pick' ? '#cc6546' : '#e6d6c3'; g.lineWidth = 3;
        var r = hh / 2 - 2; g.beginPath(); g.moveTo(r + 2, 2); g.arcTo(w - 2, 2, w - 2, hh - 2, r); g.arcTo(w - 2, hh - 2, 2, hh - 2, r); g.arcTo(2, hh - 2, 2, 2, r); g.arcTo(2, 2, w - 2, 2, r); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, hh / 2 + 1);
        var tx = new T.CanvasTexture(c); tx.colorSpace = T.SRGBColorSpace;
        return { tx: tx, w: w, h: hh };
      }
      var tags = [];
      function tagAt(x, y, z, text, tone, until, parent) {
        var tt = tagTex(text, tone), sp = new T.Sprite(new T.SpriteMaterial({ map: tt.tx, depthTest: false, depthWrite: false, fog: false }));
        var k = 0.0105; sp.center.set(0.5, 0); sp.scale.set(tt.w * k, tt.h * k, 1); sp.position.set(x, y, z); sp.renderOrder = 9;
        (parent || scene).add(sp);
        var tg = { s: sp, text: text, tone: tone, until: until || 0, fired: false }; tags.push(tg);
        return tg;
      }
      function retag(tg, text) {
        if (tg.text === text) return;
        var tt = tagTex(text, tg.tone); tg.s.material.map.dispose(); tg.s.material.map = tt.tx; tg.s.material.needsUpdate = true;
        tg.s.scale.set(tt.w * 0.0105, tt.h * 0.0105, 1); tg.text = text;
      }
      // 거둔 뒤 떠오르는 글씨(+0.4 달란트)
      var flashes = [];
      R.flash = function (cell, text) {
        if (!cell) return;
        var tg = tagAt(cell.x * TS, 1.2, cell.y * TS, text, 'pick');
        tags.splice(tags.indexOf(tg), 1); flashes.push({ s: tg.s, t0: performance.now(), y: 1.2 });
      };

      // 칸들(내 땅) — 한 묶음(tileGroup)에 두고, 내 땅 가꾸기(farm.js)가 바뀔 때마다 setLand 로 다시 그린다
      var tileGroup = new T.Group(); scene.add(tileGroup);
      var landGen = 0, curMax = 4, firstLand = true;
      var cellGeo = new T.PlaneGeometry(TS * 0.92, TS * 0.92);
      var buyMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
      var buyLine = new T.LineDashedMaterial({ color: 0xd9826a, dashSize: 0.22, gapSize: 0.14, transparent: true, opacity: 0.9 });
      var pickMat = new T.MeshBasicMaterial({ color: 0xe9805f, transparent: true, opacity: 0.45, depthWrite: false });
      var canMat = new T.MeshBasicMaterial({ color: 0xe9805f, transparent: true, opacity: 0.16, depthWrite: false });
      var edgeGeo = new T.EdgesGeometry(cellGeo);
      function clearTiles() {
        landGen++;
        items = items.filter(function (it) { if (!it.tile) return true; it.mesh.material.map.dispose(); it.mesh.material.dispose(); it.shm.material.dispose(); it.mesh.geometry.dispose(); return false; });
        bubbles = bubbles.filter(function (b) { if (!b.tile) return true; scene.remove(b.s); b.s.material.map.dispose(); b.s.material.dispose(); return false; });
        tags = tags.filter(function (tg) { if (tg.s.parent !== tileGroup) return true; tg.s.material.map.dispose(); tg.s.material.dispose(); return false; });
        tileMeshes = tileMeshes.filter(function (m) { return m.parent !== tileGroup; });
        tileGroup.children.slice().forEach(function (c) { tileGroup.remove(c); });
      }
      // 하우스(유리 온실): 박공지붕 유리 몸통(눌러지는 칸) + 흰 철골. 모양·재질은 한 번만 만들어 함께 쓴다
      var GH = { W: TS * 0.9, D: TS * 0.9, H1: 1.45, H2: 2.15, bar: 0.05, plantMax: 1.6 }, gh = null;
      function ghParts() {
        if (gh) return gh;
        var W2 = GH.W / 2, sh = new T.Shape();
        sh.moveTo(-W2, 0); sh.lineTo(W2, 0); sh.lineTo(W2, GH.H1); sh.lineTo(0, GH.H2); sh.lineTo(-W2, GH.H1); sh.lineTo(-W2, 0);
        var glassGeo = new T.ExtrudeGeometry(sh, { depth: GH.D, bevelEnabled: false }); glassGeo.translate(0, 0, -GH.D / 2);
        var glass = new T.MeshStandardMaterial({ color: tint(new T.Color(0xe2f1ee)), transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0.1, depthWrite: false, side: T.DoubleSide });
        var frame = new T.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 0.5, metalness: 0.25 });
        gh = { glassGeo: glassGeo, glass: glass, frame: frame, barGeo: new T.BoxGeometry(1, 1, 1), z: new T.Vector3(0, 0, 1) };
        return gh;
      }
      function ghBar(g, a, b) {
        var P = ghParts(), A = new T.Vector3(a[0], a[1], a[2]), B = new T.Vector3(b[0], b[1], b[2]), d = B.clone().sub(A);
        var m = new T.Mesh(P.barGeo, P.frame); m.scale.set(GH.bar, GH.bar, d.length() + GH.bar);
        m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(P.z, d.normalize()); m.castShadow = true;
        g.add(m);
      }
      function greenhouse(x, y, top, cell) {
        var P = ghParts(), cx = x * TS, cz = y * TS, W2 = GH.W / 2, D2 = GH.D / 2, H1 = GH.H1, H2 = GH.H2;
        var body = new T.Mesh(P.glassGeo, P.glass); body.position.set(cx, top, cz); body.renderOrder = 3; body.userData.cell = cell;
        tileGroup.add(body); tileMeshes.push(body);   // 유리를 눌러도 그 칸
        var g = new T.Group(); g.position.set(cx, top, cz);
        [[-W2, -D2], [W2, -D2], [-W2, D2], [W2, D2], [-W2, 0], [W2, 0]].forEach(function (q) { ghBar(g, [q[0], 0, q[1]], [q[0], H1, q[1]]); });
        ghBar(g, [-W2, H1, -D2], [-W2, H1, D2]); ghBar(g, [W2, H1, -D2], [W2, H1, D2]); ghBar(g, [0, H2, -D2], [0, H2, D2]);
        [-D2, 0, D2].forEach(function (z) { ghBar(g, [-W2, H1, z], [0, H2, z]); ghBar(g, [W2, H1, z], [0, H2, z]); });
        ghBar(g, [-W2, 0.02, -D2], [W2, 0.02, -D2]); ghBar(g, [-W2, 0.02, D2], [W2, 0.02, D2]);
        ghBar(g, [-0.32, 0, D2], [-0.32, 1.2, D2]); ghBar(g, [0.32, 0, D2], [0.32, 1.2, D2]); ghBar(g, [-0.32, 1.2, D2], [0.32, 1.2, D2]);   // 문
        tileGroup.add(g);
      }
      function overlay(x, y, h, mat) {
        var m = new T.Mesh(cellGeo, mat); m.rotation.x = -Math.PI / 2; m.position.set(x * TS, h + 0.012, y * TS); m.renderOrder = 2; tileGroup.add(m);
      }
      function drawLand(land) {
        if (dead || !land) return;
        clearTiles();
        var gen = landGen, tiles = Array.isArray(land) ? land : land.tiles || [], picks = land.picks || {}, can = land.pickable || {}, mode = land.mode || 'normal';
        var max = Math.max(1, Math.min(12, (land.max | 0) || 0));
        tiles.forEach(function (tl) { if (tl) max = Math.max(max, Math.abs(tl.x), Math.abs(tl.y)); });
        if (max !== curMax || firstLand) { makeLand(max); curMax = max; }
        extent = TS * 1.5;
        tiles.forEach(function (tl) {
          if (!tl || (tl.x === 0 && tl.y === 0)) return;
          var key = tl.x + ',' + tl.y, cell = { x: tl.x, y: tl.y, owned: true };
          var top = plate(tl.x, tl.y, tl.land === 'dae' ? 'dae' : tl.planted || tl.house ? 'jeon' : 'grass', tileGroup, cell);
          if (tl.house) greenhouse(tl.x, tl.y, top, cell);
          extent = Math.max(extent, (Math.max(Math.abs(tl.x), Math.abs(tl.y)) + 0.5) * TS);
          if (picks[key]) overlay(tl.x, tl.y, top, pickMat); else if (can[key]) overlay(tl.x, tl.y, top, canMat);
          if (picks[key]) tagAt(tl.x * TS, top + 0.15, tl.y * TS, '✓', 'pick', 0, tileGroup);
          var label = function (y0) {
            if (tl.until) tagAt(tl.x * TS, y0, tl.y * TS, o.fmtLeft ? o.fmtLeft(tl.until - Date.now()) : '', 'time', tl.until, tileGroup);
            else if (tl.tag) tagAt(tl.x * TS, y0, tl.y * TS, tl.tag, 'warn', 0, tileGroup);
          };
          if (tl.src) loadImage(tl.src).then(function (im) {
            if (dead || !im || gen !== landGen) return;
            var hh = Math.max(0.35, (+tl.h || 60) / 100 * 1.5);
            if (tl.house) hh = Math.min(hh, GH.plantMax);   // 하우스 안 — 처마 위로 나오지 않게
            var it = sprite(im, { x: tl.x * TS, z: tl.y * TS, y: top, h: hh, dead: !!tl.dead, name: tl.name, cell: cell, parent: tileGroup });
            if (firstDrop && !reduce) { it.drop = 1.2 + Math.random(); it.vy = 0; }   // 처음 열 때 살짝 내려앉는다
            if (tl.bubble) bubble(tl.bubble, tl.x * TS, top + it.top + 0.25, tl.y * TS, 'tile', cell, gen);
            else label(top + it.top + 0.15);
          });
          else label(top + 0.2);
        });
        (land.buyable || []).forEach(function (b) {
          var key = b.x + ',' + b.y, m = new T.Mesh(cellGeo, buyMat);
          m.rotation.x = -Math.PI / 2; m.position.set(b.x * TS, 0.012, b.y * TS); m.userData.cell = { x: b.x, y: b.y, owned: false }; m.renderOrder = 1;
          tileGroup.add(m); tileMeshes.push(m);
          var ln = new T.LineSegments(edgeGeo, buyLine); ln.computeLineDistances(); ln.rotation.x = -Math.PI / 2; ln.position.set(b.x * TS, 0.02, b.y * TS); tileGroup.add(ln);
          if (picks[key]) { overlay(b.x, b.y, 0, pickMat); tagAt(b.x * TS, 0.1, b.y * TS, '✓', 'pick', 0, tileGroup); }
          else if (mode === 'buy' && b.label) tagAt(b.x * TS, 0.1, b.y * TS, b.label, 'buy', 0, tileGroup);
        });
        firstLand = false; setTimeout(function () { firstDrop = false; }, 2500);
        R.refit();
      }
      var firstDrop = true;
      R.drawLand = drawLand;
      Promise.resolve(o.land).then(function (land) { drawLand(pendingLand || land); pendingLand = null; });

      // 비·눈: 지금 날씨대로(중력 + 바람)
      var rain = null, snow = null, wv = wind, SPAN = 44;
      if (kind === 'rain') {
        var n = phone ? 1400 : 2600, pos = new Float32Array(n * 6);
        for (var k = 0; k < n; k++) { var x = (Math.random() - 0.5) * SPAN, yy = Math.random() * 20, z = (Math.random() - 0.5) * SPAN; pos.set([x, yy, z, x - wv * 0.3, yy + 0.5, z], k * 6); }
        var rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(pos, 3));
        rain = new T.LineSegments(rg, new T.LineBasicMaterial({ color: 0xd7e3f1, transparent: true, opacity: 0.5 })); scene.add(rain);
      } else if (kind === 'snow') {
        var m2 = phone ? 1000 : 1800, sp2 = new Float32Array(m2 * 3);
        for (var q = 0; q < m2; q++) sp2.set([(Math.random() - 0.5) * SPAN, Math.random() * 20, (Math.random() - 0.5) * SPAN], q * 3);
        var sg2 = new T.BufferGeometry(); sg2.setAttribute('position', new T.BufferAttribute(sp2, 3));
        snow = new T.Points(sg2, new T.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.9 })); scene.add(snow);
      }
      var bits = [];
      if (o.place) bits.push(o.place);
      bits.push(t('wx.' + kind) + (wx.temp != null ? ' ' + Math.round(wx.temp) + '°' : ''));
      bits.push(sunUp ? t('g3d.sun', { n: Math.round(sun.alt) }) : t('g3d.night'));
      if (wx.wind != null && +wx.wind >= 8) bits.push(t('g3d.wind', { n: Math.round(+wx.wind) }));
      wxLine.textContent = bits.join(' · '); wxLine.hidden = false;

      /* ── 카메라: 남동쪽 위에서 마름모로 내려다본다 ──
         cam = { tx, tz: 보는 곳, az: 방위, dist: 거리 }. 기울기는 거리로 정한다 — 멀면 위에서(지도처럼), 가까우면 눈높이로 */
      var cam = null, fly = null, touched = false, lim = { min: 4, max: 60, fit: 16 }, POL = { min: 0.12, max: 1.45, home: 0.92 };
      function distFor(w) {   // 가로 w(m) 마름모가 화면에 들어오는 거리
        var tv = Math.tan(camera.fov * Math.PI / 360), th = tv * (camera.aspect || 1);
        return Math.max(w / 2 / th, w * 0.62 / 2 / tv);
      }
      R.refit = function () {
        var a = camera.aspect || 1, fov = a < 0.8 ? 44 : 32;
        if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
        lim.max = clamp(distFor(half * 2 * 1.414 + 3) * 2.4, 40, 150);   // 땅 전체보다 훨씬 멀리까지
        lim.fit = clamp(distFor((extent + TS * (a < 0.8 ? 0.25 : 0.8)) * 2 * 1.414), lim.min + 4, lim.max);   // 산 땅 + 둘레 한 칸쯤(넓힐 땅이 보이게)
        if (cam && !touched && !fly) cam.dist = lim.fit;
        if (cam) cam.dist = clamp(cam.dist, lim.min, lim.max);
      };
      R.refit();
      var home = function () { return { tx: 0, tz: 0, az: Math.PI / 4, dist: lim.fit, pol: POL.home }; };
      cam = reduce ? home() : { tx: 0, tz: 0, az: Math.PI / 4 - 0.5, dist: Math.min(lim.max, lim.fit * 2.4), pol: 0.55 };
      fly = reduce ? null : { from: Object.assign({}, cam), to: null, t0: performance.now(), dur: 1800 };
      var vel = { x: 0, z: 0, az: 0 };
      function zoomK() { return clamp((lim.max - cam.dist) / Math.max(1, lim.max - lim.min), 0, 1); }
      function placeCam() {
        var k = Math.pow(zoomK(), 2.2), pol = clamp(cam.pol, POL.min, POL.max), ty = mix(0.2, 1.1, k), s1 = Math.sin(pol);
        camera.position.set(cam.tx + cam.dist * s1 * Math.sin(cam.az), ty + cam.dist * Math.cos(pol), cam.tz + cam.dist * s1 * Math.cos(cam.az));
        camera.lookAt(cam.tx, ty, cam.tz);
        R.pitch = Math.PI / 2 - pol;
      }
      placeCam();
      function goTo(to, dur) { touched = true; vel.x = vel.z = vel.az = 0; fly = { from: Object.assign({}, cam), to: to, t0: performance.now(), dur: reduce ? 1 : dur || 450 }; }
      function zoomBy(f) { var c = fly && fly.to ? fly.to : cam; goTo(Object.assign({}, c, { dist: clamp(c.dist * f, lim.min, lim.max) }), 320); }
      function rotBy(a) { var c = fly && fly.to ? fly.to : cam; goTo(Object.assign({}, c, { az: c.az + a }), 450); }
      function tiltBy(a) { var c = fly && fly.to ? fly.to : cam; goTo(Object.assign({}, c, { pol: clamp(c.pol + a, POL.min, POL.max) }), 380); }
      tUp.onclick = function () { tiltBy(-0.18); };   // 더 위에서(지도처럼)
      tDn.onclick = function () { tiltBy(0.18); };    // 더 옆에서(눈높이로)
      resetBtn.onclick = function () { touched = false; goTo(home(), 800); touched = false; };
      zIn.onclick = function () { zoomBy(0.7); };
      zOut.onclick = function () { zoomBy(1 / 0.7); };
      rL.onclick = function () { rotBy(-Math.PI / 2); };
      rR.onclick = function () { rotBy(Math.PI / 2); };
      function pan(dx, dy) {   // 화면에서 끈 만큼 땅을 옮긴다
        var wpp = 2 * cam.dist * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, canvas.clientHeight);
        var fx = -Math.sin(cam.az), fz = -Math.cos(cam.az), rx = Math.cos(cam.az), rz = -Math.sin(cam.az), fwd = dy * wpp / Math.max(0.35, Math.sin(R.pitch || 0.6));
        var mx = -rx * dx * wpp + fx * fwd, mz = -rz * dx * wpp + fz * fwd;
        cam.tx = clamp(cam.tx + mx, -half, half); cam.tz = clamp(cam.tz + mz, -half, half);
        return { x: mx, z: mz };
      }
      R.key = function (key) {
        var step = 40;
        if (key === '+' || key === '=') zoomBy(0.8);
        else if (key === '-' || key === '_') zoomBy(1.25);
        else if (key === 'ArrowLeft') pan(step, 0); else if (key === 'ArrowRight') pan(-step, 0);
        else if (key === 'ArrowUp') pan(0, step); else if (key === 'ArrowDown') pan(0, -step);
        else if (key === 'PageUp' || key === 'w' || key === 'W') tiltBy(-0.15); else if (key === 'PageDown' || key === 's' || key === 'S') tiltBy(0.15);
        else if (key === 'q' || key === 'Q') rotBy(-Math.PI / 2); else if (key === 'e' || key === 'E') rotBy(Math.PI / 2);
        else return false;
        touched = true; fly = fly && fly.to ? fly : null;
        return true;
      };

      // 끌기(옮기기) · 오른쪽 끌기(돌리기) · 두 손가락(확대·축소·돌리기·옮기기) · 누르기(이름, 말풍선)
      var ray = new T.Raycaster(), ndc = new T.Vector2(), pointers = {}, two = null, drag = null;
      var alphaCv = document.createElement('canvas'), alphaG = alphaCv.getContext('2d', { willReadFrequently: true });
      function alphaAt(im, u, v) { alphaCv.width = 1; alphaCv.height = 1; alphaG.clearRect(0, 0, 1, 1); alphaG.drawImage(im, Math.floor(u * im.width), Math.floor((1 - v) * im.height), 1, 1, 0, 0, 1, 1); return alphaG.getImageData(0, 0, 1, 1).data[3]; }
      function setRay(e) { var r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
      function pick(e) {
        setRay(e);
        var bh = ray.intersectObjects(bubbles.map(function (b) { return b.s; }), false);
        if (bh.length) { var b = bubbles.filter(function (x) { return x.s === bh[0].object; })[0]; if (b) return { bubble: b }; }
        var hits = ray.intersectObjects(items.map(function (it) { return it.mesh; }), false);
        for (var j = 0; j < hits.length; j++) {
          var ht = hits[j], it = items.filter(function (x) { return x.mesh === ht.object; })[0];
          if (it && ht.uv && alphaAt(it.im, ht.uv.x, ht.uv.y) > 40) return { item: it, cell: it.cell };
        }
        var th = ray.intersectObjects(tileMeshes, false);
        if (th.length) return { cell: th[0].object.userData.cell };
        return null;
      }
      var tipTimer = 0;
      function showTip(text) { clearTimeout(tipTimer); tip.textContent = text; tip.hidden = !text; if (text) tipTimer = setTimeout(function () { tip.hidden = true; }, 2600); }
      function twoState() { var ps = Object.values(pointers); return { d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), a: Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x), x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 }; }
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      canvas.addEventListener('pointerdown', function (e) {
        try { canvas.setPointerCapture(e.pointerId); } catch (er) { }
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        touched = true; fly = null; vel.x = vel.z = vel.az = 0; hideHint();
        if (Object.keys(pointers).length === 2) { two = twoState(); drag = null; return; }
        drag = { x: e.clientX, y: e.clientY, moved: 0, rot: e.button === 2 || e.shiftKey };
        canvas.classList.add('is-drag');
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!pointers[e.pointerId]) return;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (Object.keys(pointers).length === 2 && two) {
          var n2 = twoState(), da = n2.a - two.a;
          if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
          cam.dist = clamp(cam.dist * two.d / Math.max(1, n2.d), lim.min, lim.max);
          cam.az += da;   // 손가락을 시계 방향으로 비틀면 땅도 시계 방향으로(돌리기 단추 ↺·↻ 와 같은 방향) — 2026-10-23 담임목사 "반대로 돌아갑니다"
          cam.pol = clamp(cam.pol - (n2.y - two.y) * 0.006, POL.min, POL.max);   // 두 손가락을 함께 위로 밀면 눕고(눈높이), 아래로 당기면 위에서
          two = n2; return;
        }
        if (!drag) return;
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.rot) { vel.az = -dx * 0.006; cam.az += vel.az; cam.pol = clamp(cam.pol - dy * 0.005, POL.min, POL.max); }
        else { var mv = pan(dx, dy); vel.x = mv.x; vel.z = mv.z; }
        drag.x = e.clientX; drag.y = e.clientY;
      });
      function up(e) {
        var wasTap = drag && drag.moved < 8 && Object.keys(pointers).length === 1;
        delete pointers[e.pointerId];
        if (Object.keys(pointers).length < 2) two = null;
        if (wasTap) {
          vel.x = vel.z = vel.az = 0;
          var p = pick(e);
          if (p && p.bubble && o.onBubble) {   // onBubble 이 true 를 돌려주면 창을 닫지 않는다(내 땅에서 바로 거두기)
            var kd = p.bubble.kind, dd = p.bubble.data;
            if (o.onBubble(kd, dd) !== true) close();
            drag = null; canvas.classList.remove('is-drag'); return;
          }
          if (p && p.item) { p.item.drop = 0.25; p.item.vy = 0; }
          if (p && p.cell && o.onTile) o.onTile(p.cell);
          else showTip(p && p.item ? p.item.name : '');
        }
        drag = null; canvas.classList.remove('is-drag');
      }
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', function (e) { e.preventDefault(); touched = true; fly = null; cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.91), lim.min, lim.max); }, { passive: false });

      // 움직임: 날아 들어오기 · 끌기 관성 · 바람(흔들림) · 내려앉기(중력) · 말풍선 · 비·눈 · 구름
      var last = performance.now();
      function ease(k) { return 1 - Math.pow(1 - k, 3); }
      R.tick = function tick(ts) {
        raf = 0;
        if (dead || document.hidden) return;
        raf = requestAnimationFrame(tick);
        var dt = Math.min(0.05, (ts - last) / 1000), tt = ts / 1000; last = ts;
        if (fly) {
          var to = fly.to || home(), k = clamp((ts - fly.t0) / fly.dur, 0, 1), e2 = ease(k);
          cam.tx = mix(fly.from.tx, to.tx, e2); cam.tz = mix(fly.from.tz, to.tz, e2); cam.dist = mix(fly.from.dist, to.dist, e2); cam.az = mix(fly.from.az, to.az, e2); cam.pol = mix(fly.from.pol, to.pol, e2);
          if (k >= 1) fly = null;
        } else if (!drag && !two) {
          if (Math.abs(vel.x) + Math.abs(vel.z) > 1e-4) { cam.tx = clamp(cam.tx + vel.x, -half, half); cam.tz = clamp(cam.tz + vel.z, -half, half); vel.x *= 0.88; vel.z *= 0.88; }
          if (Math.abs(vel.az) > 1e-4) { cam.az += vel.az; vel.az *= 0.88; }
        }
        placeCam();
        items.forEach(function (it) {
          if (it.drop > 0 || it.vy !== 0) {
            it.vy -= 9.8 * dt; it.drop += it.vy * dt;
            if (it.drop <= 0) { it.drop = 0; it.vy = Math.abs(it.vy) > 0.7 ? -it.vy * 0.25 : 0; }
          }
          it.mesh.position.y = it.shm.position.y = it.drop;
          var gp = it.g.position;
          it.mesh.rotation.y = Math.atan2(camera.position.x - gp.x, camera.position.z - gp.z);
          var sway = reduce ? 0 : wind * it.stiff * (0.035 * Math.sin(tt * 1.3 + it.ph) + 0.02 * Math.sin(tt * 0.47 + it.ph * 2) + 0.015);
          it.mesh.rotation.z = it.shm.rotation.z = sway;
        });
        if (!reduce) bubbles.forEach(function (b) { b.s.position.y = b.y + Math.sin(tt * 2.2 + b.ph) * 0.08; });
        if (ts - (R.tagT || 0) > 1000) {   // 남은 시간은 1초마다, 다 되면 내 땅에 알린다
          R.tagT = ts;
          tags.forEach(function (tg) {
            if (!tg.until) return;
            var ms = tg.until - Date.now();
            if (ms <= 0) { if (!tg.fired) { tg.fired = true; if (o.onExpire) setTimeout(o.onExpire, 50); } return; }
            if (o.fmtLeft) retag(tg, o.fmtLeft(ms));
          });
        }
        flashes = flashes.filter(function (f) {
          var k = (ts - f.t0) / 1200;
          if (k >= 1) { scene.remove(f.s); f.s.material.map.dispose(); f.s.material.dispose(); return false; }
          f.s.position.y = f.y + k * 1.4; f.s.material.opacity = 1 - k * k; f.s.material.transparent = true;
          return true;
        });
        if (clouds && !reduce) clouds.rotation.y += dt * (0.002 + wind * 0.006);
        if (rain) {
          var a = rain.geometry.attributes.position.array, fall = 18 * dt, dx = wv * 5 * dt;
          for (var k2 = 0; k2 < a.length; k2 += 6) {
            a[k2 + 1] -= fall; a[k2 + 4] -= fall; a[k2] += dx; a[k2 + 3] += dx;
            if (a[k2 + 1] < 0) { var x0 = (Math.random() - 0.5) * SPAN, z0 = (Math.random() - 0.5) * SPAN; a[k2] = x0; a[k2 + 1] = 20; a[k2 + 2] = z0; a[k2 + 3] = x0 - wv * 0.3; a[k2 + 4] = 20.5; a[k2 + 5] = z0; }
          }
          rain.geometry.attributes.position.needsUpdate = true;
        }
        if (snow) {
          var b2 = snow.geometry.attributes.position.array;
          for (var k3 = 0; k3 < b2.length; k3 += 3) { b2[k3 + 1] -= 1.1 * dt; b2[k3] += (Math.sin(tt + k3) * 0.3 + wv * 2) * dt; if (b2[k3 + 1] < 0) { b2[k3 + 1] = 20; b2[k3] = (Math.random() - 0.5) * SPAN; } }
          snow.geometry.attributes.position.needsUpdate = true;
        }
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(R.tick);
    }
    return CUR;
  }

  return { open: open, supported: supported, sunPos: sunPos, markUsed: markUsed, isOpen: function () { return !!CUR; } };
})();
