/* ============================================================
   신앙 정원 — 나의 정원에 들어가기 (입체)
   2026-10-23 담임목사: "정원을 크게 입체적으로 볼 수 있어야 합니다", "모바일은 전체 화면이 되게"
   · 도서관 프로그램 '정원 가꾸기'와 같은 2.5D 클레이: 땅·빛·그림자·바람·비·눈은 three.js 3D,
     나무·꽃·작물·인물·먼 언덕·구름은 정원과 같은 클레이 그림 판(늘 보는 쪽으로 돈다). 코드로 그린 나무는 쓰지 않는다
   · 해: 교회 자리의 지금 해 방위·고도 → 빛 방향과 그림자 길이. 해가 지면 달빛과 별
   · 칸: '내 땅' 마름모 창과 같은 칸(가운데 0,0 = 믿음 나무). 전은 흙 무늬, 대지는 대지 무늬
   · 그리기만 한다: 자료는 여는 쪽(main.js)이 넘긴다. 받는 것은 three.js 와 그림뿐
   Garden3D.open({ title, sub, place, plant:{src,name}, character:{src,name}, tiles:[{x,y,land,src,h,dead,name}] | Promise,
                   lat, lng, wx:{code,temp,wind,isDay}, art:{hills,clouds,soil,dae}, t(key,vars), reduce, opener, onClose })
   ============================================================ */
window.Garden3D = (function () {
  'use strict';
  var THREE_URLS = [
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
    'https://unpkg.com/three@0.160.0/build/three.module.min.js'
  ];
  var TS = 2.2;                 // 칸 한 변(m)
  var HILL_R = 45;              // 먼 언덕 둘레 반지름(m)
  var T = null, CUR = null, OK = null;

  function loadThree() {
    if (T) return Promise.resolve(T);
    var i = 0;
    function next() { return import(THREE_URLS[i]).then(function (m) { T = m; return m; }, function (e) { i++; if (i < THREE_URLS.length) return next(); throw e; }); }
    return next();
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
  function loadImage(src) { return new Promise(function (res) { if (!src) return res(null); var i = new Image(); i.decoding = 'async'; i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }

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
  function avgColor(im, y0, y1) {   // 그림 한 띠(위에서 y0~y1, 0~1)의 평균 색
    var c = document.createElement('canvas'); c.width = 16; c.height = 2;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, im.height * y0, im.width, Math.max(1, im.height * (y1 - y0)), 0, 0, 16, 2);
    var d, r = 0, gg = 0, b = 0, n = 0;
    try { d = g.getImageData(0, 0, 16, 2).data; } catch (e) { return null; }
    for (var i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    return n ? [r / n / 255, gg / n / 255, b / n / 255] : null;
  }

  function open(o) {
    if (CUR) return CUR;
    o = o || {};
    var t = o.t || function (k) { return k; };
    var dead = false, R = null, raf = 0, pushed = false, reduce = !!o.reduce;
    var touch = false; try { touch = matchMedia('(pointer: coarse)').matches; } catch (e) { }
    var phone = false; try { phone = matchMedia('(max-width: 760px)').matches; } catch (e) { }

    /* ── 화면 ── */
    var canvas = h('canvas', { class: 'g3d-cv', 'aria-label': t('g3d.canvas') });
    var load = h('div', { class: 'g3d-load', role: 'status', text: t('g3d.loading') });
    var wxLine = h('div', { class: 'g3d-wx', hidden: '' });
    var hint = h('div', { class: 'g3d-hint', text: t(touch ? 'g3d.hint.touch' : 'g3d.hint') });
    var tip = h('div', { class: 'g3d-tip', role: 'status', 'aria-live': 'polite', hidden: '' });
    var fullBtn = (document.fullscreenEnabled && !phone) ? h('button', { type: 'button', class: 'g3d-btn', text: t('g3d.full') }) : null;
    var resetBtn = h('button', { type: 'button', class: 'g3d-btn', text: t('g3d.reset') });
    var closeBtn = h('button', { type: 'button', class: 'g3d-btn g3d-btn-close', text: t('g3d.close') });
    var stage = h('div', { class: 'g3d-stage' }, [canvas, load, wxLine, hint, tip]);
    var root = h('div', { class: 'g3d' + (phone ? ' is-phone' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || t('g3d.title') }, [
      h('header', { class: 'g3d-top' }, [h('b', { class: 'g3d-title', text: o.title || t('g3d.title') }), o.sub ? h('span', { class: 'g3d-sub', text: o.sub }) : null, h('span', { class: 'g3d-grow' }), resetBtn, fullBtn, closeBtn]),
      stage
    ]);
    document.body.append(root);
    document.documentElement.classList.add('g3d-open');
    // 휴대폰은 화면 전체로(주소창까지 숨김). 누른 그 순간에만 허락되므로 여기서 바로 부른다
    if (phone && root.requestFullscreen) { try { root.requestFullscreen({ navigationUI: 'hide' }).catch(function () { }); } catch (e) { } }
    // 뒤로 가기 = 닫기
    try { history.pushState({ g3d: 1 }, ''); pushed = true; } catch (e) { }
    closeBtn.focus({ preventScroll: true });
    setTimeout(function () { hint.classList.add('is-gone'); }, 7000);

    function onFs() { if (fullBtn) fullBtn.textContent = t(document.fullscreenElement === root ? 'g3d.fullExit' : 'g3d.full'); setTimeout(onResize, 60); }
    document.addEventListener('fullscreenchange', onFs);
    if (fullBtn) fullBtn.onclick = function () {
      if (document.fullscreenElement === root) document.exitFullscreen().catch(function () { });
      else root.requestFullscreen().catch(function () { });
    };
    closeBtn.onclick = function () { close(); };
    function onKey(e) { if (e.key === 'Escape' && !document.fullscreenElement) close(); }
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
    function onResize() {
      if (!R) return;
      var w = stage.clientWidth || 1, hh = stage.clientHeight || 1;
      R.renderer.setSize(w, hh, false); R.camera.aspect = w / hh; R.camera.updateProjectionMatrix();
      if (R.refit) R.refit();
    }
    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(onResize); ro.observe(stage); } else window.addEventListener('resize', onResize);
    function onVis() { if (!document.hidden && R && !raf) raf = requestAnimationFrame(R.tick); }
    document.addEventListener('visibilitychange', onVis);

    var art = o.art || {};
    Promise.all([loadThree(), loadImage(art.hills), loadImage(art.clouds), null, loadImage(art.soil), loadImage(art.dae), loadImage(o.plant && o.plant.src), loadImage(o.character && o.character.src)])
      .then(function (rs) {
        if (dead) return;
        try { build({ hills: rs[1], clouds: rs[2], soil: rs[4], dae: rs[5], plant: rs[6], character: rs[7] }); }
        catch (e) { load.textContent = t('g3d.fail'); return; }
        load.remove();
      }, function () { if (!dead) load.textContent = t('g3d.fail'); });

    /* ── 3D ── */
    function build(img) {
      var now = new Date(), lat = isFinite(+o.lat) ? +o.lat : 37.09, lng = isFinite(+o.lng) ? +o.lng : 126.8;
      var sun = sunPos(now, lat, lng), wx = o.wx || {}, kind = wxKind(wx.code);
      var day = clamp((sun.alt + 4) / 14, 0, 1), sunUp = sun.alt > 0;
      var cloud = { clear: 0.12, cloudy: 0.72, fog: 0.8, rain: 0.95, snow: 0.85 }[kind];
      var wind = clamp((+wx.wind || 6) / 30, 0, 1.3);

      var hillCol = (img.hills && avgColor(img.hills, 0.83, 0.93)) || [0.8, 0.84, 0.5];
      var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(phone ? 1.75 : 2, window.devicePixelRatio || 1));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
      var scene = new T.Scene(), camera = new T.PerspectiveCamera(46, 1, 0.1, 400);
      R = { renderer: renderer, scene: scene, camera: camera };
      onResize();

      function tex(im, o2) {
        var tx = new T.Texture(im); tx.colorSpace = T.SRGBColorSpace; tx.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        if (o2 && o2.repeat) { tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.repeat.set(o2.repeat, o2.repeat); }
        tx.needsUpdate = true;
        return tx;
      }

      // 하늘: 해 고도·구름양으로 색(낮 파랑 → 노을 → 밤)
      var dusk = clamp(1 - Math.abs(sun.alt - 2) / 10, 0, 1);
      var zen = new T.Color().setRGB(mix(0.05, 0.36, day), mix(0.09, 0.62, day), mix(0.2, 0.86, day));
      var hor = new T.Color().setRGB(mix(0.16, 0.82, day), mix(0.2, 0.9, day), mix(0.32, 0.96, day)).lerp(new T.Color(0.98, 0.72, 0.52), dusk * 0.7);
      var grey = new T.Color(0.72, 0.74, 0.78).multiplyScalar(mix(0.25, 1, day));
      zen.lerp(grey, cloud * 0.7); hor.lerp(grey, cloud * 0.6);
      var sky = new T.Mesh(new T.SphereGeometry(190, 32, 16), new T.ShaderMaterial({
        side: T.BackSide, depthWrite: false, uniforms: { zen: { value: zen }, hor: { value: hor } },
        vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 zen; uniform vec3 hor; varying vec3 vp; void main(){ float k = clamp(vp.y*1.5, 0.0, 1.0); gl_FragColor = vec4(mix(hor, zen, pow(k, 0.7)), 1.0); }'
      }));
      sky.renderOrder = -3; scene.add(sky);
      // 안개 색은 하늘 지평선과 같게(하늘은 색 변환 없이 그리므로 안개 쪽을 거꾸로 맞춘다)
      var fogCol = hor.clone().convertSRGBToLinear();
      scene.fog = kind === 'fog' ? new T.Fog(fogCol, 6, 48) : new T.Fog(fogCol, 34, 170);
      // 별: 해가 지고 하늘이 개면
      var nightK = clamp((-sun.alt - 4) / 8, 0, 1) * (1 - cloud);
      if (nightK > 0.05) {
        var sp = new Float32Array(700 * 3);
        for (var s = 0; s < 700; s++) { var th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.92 + 0.08); sp.set([Math.sin(ph) * Math.cos(th) * 170, Math.cos(ph) * 170, Math.sin(ph) * Math.sin(th) * 170], s * 3); }
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
      sl.position.copy(sunDir.clone().multiplyScalar(50)); sl.target.position.set(0, 0, 0);
      sl.castShadow = true; sl.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
      sl.shadow.bias = -0.0006; sl.shadow.normalBias = 0.02; sl.shadow.radius = 3;
      scene.add(sl, sl.target);
      scene.add(new T.HemisphereLight(hor.clone().lerp(new T.Color(1, 1, 1), 0.35), new T.Color(0.42, 0.38, 0.3), mix(0.35, 1.0, day)));
      scene.add(new T.AmbientLight(0xffffff, mix(0.18, 0.12, day)));

      // 먼 언덕: 정원 언덕 그림의 먼 산 부분(왼쪽 큰 나무를 뺀 오른쪽 75%, 위 58%)을 둘레 원통 안쪽에 여섯 번, 거울로 이어 이음매가 없다
      if (img.hills) {
        var hc2 = document.createElement('canvas'), hw = Math.round(img.hills.width * 0.75), hh2 = Math.round(img.hills.height * 0.58);
        hc2.width = hw; hc2.height = hh2; hc2.getContext('2d').drawImage(img.hills, img.hills.width - hw, 0, hw, hh2, 0, 0, hw, hh2);
        var htx = new T.CanvasTexture(hc2); htx.colorSpace = T.SRGBColorSpace; htx.anisotropy = 4;
        htx.wrapS = T.MirroredRepeatWrapping; htx.repeat.set(-6, 1); htx.offset.set(4.25, 0); htx.needsUpdate = true;
        var BH = HILL_R * (Math.PI / 3) * hh2 / hw;
        var hills = new T.Mesh(new T.CylinderGeometry(HILL_R, HILL_R, BH, 128, 1, true), new T.MeshBasicMaterial({ map: htx, transparent: true, side: T.BackSide, depthWrite: false }));
        hills.position.y = BH / 2 - 0.4; hills.renderOrder = -1;
        hills.material.color.setScalar(mix(0.38, 1, day) * (1 - cloud * 0.12));
        scene.add(hills);
      }
      // 구름: 정원 구름 그림 띠, 바람 따라 천천히 돈다
      var clouds = null;
      if (img.clouds) {
        var ctx2 = tex(img.clouds); ctx2.wrapS = T.MirroredRepeatWrapping; ctx2.repeat.set(-4, 1); ctx2.offset.set(3, 0); ctx2.needsUpdate = true;
        var CR = 100, CH = CR * (Math.PI / 2) / 3 * 0.6;   // 조금 납작하게 — 먼 언덕 바로 위로 떠 간다
        clouds = new T.Mesh(new T.CylinderGeometry(CR, CR, CH, 96, 1, true), new T.MeshBasicMaterial({ map: ctx2, transparent: true, side: T.BackSide, depthWrite: false, fog: false, opacity: (kind === 'clear' ? 0.75 : 0.95) * mix(0.25, 1, day) }));
        clouds.position.y = CH / 2 - 2; clouds.renderOrder = -2;
        clouds.material.color.setScalar(mix(0.35, 1, day)).lerp(new T.Color(0.7, 0.72, 0.76), cloud * 0.5);
        scene.add(clouds);
      }

      // 땅: 언덕 그림 앞쪽 잔디(그림 아래 83~93%, 왼쪽 40%)를 떼어 거울로 이어 깐다 → 먼 언덕과 같은 점토 잔디
      var wet = (kind === 'rain') ? 1 : 0, snowK = kind === 'snow' ? 0.7 : 0;
      function tint(c) { return c.multiplyScalar(1 - wet * 0.2).lerp(new T.Color(0.95, 0.96, 1), snowK); }
      var groundMat = new T.MeshStandardMaterial({ roughness: 1, emissive: new T.Color(1, 1, 1), emissiveIntensity: 0.05 + 0.22 * day });   // 먼 언덕(빛 없이 그린 그림)과 밝기를 맞춘다
      if (img.hills) {
        var lc = document.createElement('canvas'); lc.width = 256; lc.height = 128;
        lc.getContext('2d').drawImage(img.hills, 0, img.hills.height * 0.83, img.hills.width * 0.4, img.hills.height * 0.1, 0, 0, 256, 128);
        var ltx = new T.CanvasTexture(lc); ltx.colorSpace = T.SRGBColorSpace; ltx.wrapS = ltx.wrapT = T.MirroredRepeatWrapping;
        ltx.repeat.set((HILL_R + 2) * 2 / 7, (HILL_R + 2) * 2 / 3.5); ltx.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        groundMat.map = ltx; groundMat.emissiveMap = ltx;
      } else groundMat.color.setRGB(hillCol[0], hillCol[1], hillCol[2], T.SRGBColorSpace);
      tint(groundMat.color);
      var ground = new T.Mesh(new T.CircleGeometry(HILL_R + 2, 96), groundMat);
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

      // 그림 판(나무·꽃·작물·인물): 보이는 판은 늘 카메라 쪽, 그림자 판은 늘 해 쪽 → 어느 쪽에서 봐도 그림자가 온전하다
      var items = [], shadowYaw = Math.atan2(sunDir.x, sunDir.z), plantGroup = new T.Group(); scene.add(plantGroup);
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
        var g = new T.Group(); g.position.set(s.x, s.y || 0, s.z); g.add(mesh, shm); plantGroup.add(g);
        var it = { g: g, mesh: mesh, shm: shm, im: im, ph: Math.random() * 6.28, stiff: s.stiff == null ? (H > 2.4 ? 0.4 : 1) : s.stiff, name: s.name || '', drop: 0, vy: 0 };
        items.push(it);
        return it;
      }
      function plateMat(map, color) { var m = new T.MeshStandardMaterial({ roughness: 1, color: color || 0xffffff }); if (map) m.map = map; return m; }
      var soilTx = img.soil ? tex(img.soil, { repeat: 2.5 }) : null, daeTx = img.dae ? tex(img.dae) : null;
      var M = {
        jeonTop: plateMat(soilTx, soilTx ? 0xd2bfae : 0x8a6a4a), jeonSide: plateMat(null, 0x6a5036),
        daeTop: plateMat(daeTx, daeTx ? 0xffffff : 0xe6d8bc), daeSide: plateMat(null, 0xc4b08a),
        homeTop: plateMat(groundMat.map || null, groundMat.map ? 0xe8ecd8 : 0x8fa66a), homeSide: plateMat(null, 0x7d8c58)
      };
      [M.jeonTop, M.daeTop, M.homeTop].forEach(function (m) { tint(m.color); });
      var gJeon = new T.BoxGeometry(TS * 0.94, 0.16, TS * 0.94), gDae = new T.BoxGeometry(TS * 0.94, 0.09, TS * 0.94), gHome = new T.BoxGeometry(TS * 0.94, 0.11, TS * 0.94);
      function plate(x, y, kind2) {
        var geo = kind2 === 'dae' ? gDae : kind2 === 'home' ? gHome : gJeon, top = M[kind2 + 'Top'] || M.jeonTop, side = M[kind2 + 'Side'] || M.jeonSide;
        var m = new T.Mesh(geo, [side, side, top, side, side, side]);
        m.position.set(x * TS, geo.parameters.height / 2, y * TS); m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
        return geo.parameters.height;
      }

      // 가운데 칸: 믿음 나무 + 흙 둔덕, 그 앞 왼쪽에 나
      var homeH = plate(0, 0, 'home');
      var mound = new T.Mesh(new T.CylinderGeometry(TS * 0.3, TS * 0.36, 0.08, 40), plateMat(null, 0x7a5c40));
      mound.position.set(0, homeH + 0.04, 0); mound.receiveShadow = true; scene.add(mound);
      if (img.plant) sprite(img.plant, { x: 0, z: 0, y: homeH + 0.06, size: 3.9, center: true, name: o.plant.name });
      if (img.character) sprite(img.character, { x: -TS * 0.36, z: TS * 0.36, y: homeH, h: 1.62, stiff: 0, name: o.character.name });

      // 칸들(내 땅)
      Promise.resolve(o.tiles).then(function (tiles) {
        if (dead || !Array.isArray(tiles)) return;
        tiles.forEach(function (tl) {
          if (!tl || (tl.x === 0 && tl.y === 0)) return;
          var top = plate(tl.x, tl.y, tl.land === 'dae' ? 'dae' : 'jeon');
          extent = Math.max(extent, (Math.max(Math.abs(tl.x), Math.abs(tl.y)) + 0.5) * TS);
          if (tl.src) loadImage(tl.src).then(function (im) {
            if (dead || !im) return;
            var it = sprite(im, { x: tl.x * TS, z: tl.y * TS, y: top, h: Math.max(0.35, (+tl.h || 60) / 100 * 1.5), dead: !!tl.dead, name: tl.name });
            if (!reduce) { it.drop = 1.2 + Math.random(); it.vy = 0; }   // 처음 열 때 살짝 내려앉는다
          });
        });
        var sc = sl.shadow.camera, ext = extent + 4; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 120; sc.updateProjectionMatrix();
        R.refit();
      });
      var sc0 = sl.shadow.camera; sc0.left = -8; sc0.right = 8; sc0.top = 8; sc0.bottom = -8; sc0.near = 1; sc0.far = 120;

      // 비·눈: 지금 날씨대로(중력 + 바람)
      var rain = null, snow = null, wv = wind;
      if (kind === 'rain') {
        var n = phone ? 1200 : 2200, pos = new Float32Array(n * 6);
        for (var k = 0; k < n; k++) { var x = (Math.random() - 0.5) * 40, yy = Math.random() * 18, z = (Math.random() - 0.5) * 40; pos.set([x, yy, z, x - wv * 0.3, yy + 0.5, z], k * 6); }
        var rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(pos, 3));
        rain = new T.LineSegments(rg, new T.LineBasicMaterial({ color: 0xd7e3f1, transparent: true, opacity: 0.5 })); scene.add(rain);
      } else if (kind === 'snow') {
        var m2 = phone ? 900 : 1600, sp2 = new Float32Array(m2 * 3);
        for (var q = 0; q < m2; q++) sp2.set([(Math.random() - 0.5) * 40, Math.random() * 18, (Math.random() - 0.5) * 40], q * 3);
        var sg2 = new T.BufferGeometry(); sg2.setAttribute('position', new T.BufferAttribute(sp2, 3));
        snow = new T.Points(sg2, new T.PointsMaterial({ color: 0xffffff, size: 0.1, transparent: true, opacity: 0.9 })); scene.add(snow);
      }
      var bits = [];
      if (o.place) bits.push(o.place);
      bits.push(t('wx.' + kind) + (wx.temp != null ? ' ' + Math.round(wx.temp) + '°' : ''));
      bits.push(sunUp ? t('g3d.sun', { n: Math.round(sun.alt) }) : t('g3d.night'));
      if (wx.wind != null && +wx.wind >= 8) bits.push(t('g3d.wind', { n: Math.round(+wx.wind) }));
      wxLine.textContent = bits.join(' · '); wxLine.hidden = false;

      // 카메라: '내 땅' 마름모 창처럼 남동쪽 위에서 내려다본다. 끌면 둘레를 돌고, 휠·두 손가락으로 가까이
      var homeCam = { az: Math.PI / 4, pol: 1.26, dist: 12, ty: 1.2 }, extent = TS * 1.5, touched = false;
      // 밭 넓이와 화면 비율에 맞는 거리 — 세로 화면(휴대폰)은 시야를 넓히고 조금 물러서 양옆이 잘리지 않게
      R.refit = function () {
        var a = camera.aspect || 1, fov = a < 0.8 ? 54 : 46;
        if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
        homeCam.dist = clamp(5.5 + extent * 1.4, 8.5, 30) * (a < 1 ? Math.pow(Math.min(2.1, 1 / a), 0.7) : 1);
        if (!touched && !fly && cam) cam.dist = homeCam.dist;
      };
      var cam = null, fly = null;
      R.refit();
      cam = reduce ? Object.assign({}, homeCam) : { az: homeCam.az - 0.7, pol: 0.72, dist: homeCam.dist * 1.7, ty: homeCam.ty };
      fly = reduce ? null : { from: Object.assign({}, cam), t0: performance.now(), dur: 1900 };
      var vel = { az: 0, pol: 0 };
      function placeCam() {
        var s1 = Math.sin(cam.pol);
        camera.position.set(cam.dist * s1 * Math.sin(cam.az), cam.ty + cam.dist * Math.cos(cam.pol), cam.dist * s1 * Math.cos(cam.az));
        camera.lookAt(0, cam.ty, 0);
      }
      placeCam();
      resetBtn.onclick = function () { fly = { from: Object.assign({}, cam), t0: performance.now(), dur: reduce ? 1 : 900 }; vel.az = vel.pol = 0; };

      // 끌기·누르기
      var ray = new T.Raycaster(), ndc = new T.Vector2(), pointers = {}, pinch = 0, drag = null;
      var alphaCv = document.createElement('canvas'), alphaG = alphaCv.getContext('2d', { willReadFrequently: true });
      function alphaAt(im, u, v) { alphaCv.width = 1; alphaCv.height = 1; alphaG.clearRect(0, 0, 1, 1); alphaG.drawImage(im, Math.floor(u * im.width), Math.floor((1 - v) * im.height), 1, 1, 0, 0, 1, 1); return alphaG.getImageData(0, 0, 1, 1).data[3]; }
      function pick(e) {
        var r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
        var hits = ray.intersectObjects(items.map(function (it) { return it.mesh; }), false);
        for (var j = 0; j < hits.length; j++) {
          var ht = hits[j], it = items.filter(function (x) { return x.mesh === ht.object; })[0];
          if (it && ht.uv && alphaAt(it.im, ht.uv.x, ht.uv.y) > 40) return it;
        }
        return null;
      }
      var tipTimer = 0;
      function showTip(text) { clearTimeout(tipTimer); tip.textContent = text; tip.hidden = !text; if (text) tipTimer = setTimeout(function () { tip.hidden = true; }, 2600); }
      canvas.addEventListener('pointerdown', function (e) {
        canvas.setPointerCapture(e.pointerId); pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        touched = true; fly = null; vel.az = vel.pol = 0; hint.classList.add('is-gone');
        var ps = Object.values(pointers);
        if (ps.length === 2) { pinch = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y); drag = null; return; }
        drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0 };
        canvas.classList.add('is-drag');
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!pointers[e.pointerId]) return;
        pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ps = Object.values(pointers);
        if (ps.length === 2 && pinch) { var d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y); cam.dist = clamp(cam.dist * pinch / Math.max(1, d), 4.5, 42); pinch = d; return; }
        if (!drag) return;
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        vel.az = -dx * 0.006; vel.pol = -dy * 0.005;
        cam.az += vel.az; cam.pol = clamp(cam.pol + vel.pol, 0.32, 1.48);
        drag.x = e.clientX; drag.y = e.clientY;
      });
      function up(e) {
        var wasTap = drag && drag.moved < 8 && Object.keys(pointers).length === 1;
        delete pointers[e.pointerId]; pinch = 0;
        if (wasTap) { vel.az = vel.pol = 0; var it = pick(e); showTip(it ? it.name : ''); if (it) { it.drop = 0.25; it.vy = 0; } }
        drag = null; canvas.classList.remove('is-drag');
      }
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', function (e) { e.preventDefault(); touched = true; fly = null; cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.08 : 0.93), 4.5, 42); }, { passive: false });

      // 움직임: 날아 들어오기 · 끌기 관성 · 바람(흔들림) · 내려앉기(중력) · 비·눈 · 구름
      var last = performance.now();
      function ease(k) { return 1 - Math.pow(1 - k, 3); }
      R.tick = function tick(ts) {
        raf = 0;
        if (dead || document.hidden) return;
        raf = requestAnimationFrame(tick);
        var dt = Math.min(0.05, (ts - last) / 1000), tt = ts / 1000; last = ts;
        if (fly) {
          var k = clamp((ts - fly.t0) / fly.dur, 0, 1), e2 = ease(k), toAz = homeCam.az + Math.round((fly.from.az - homeCam.az) / (Math.PI * 2)) * Math.PI * 2;
          cam.az = mix(fly.from.az, toAz, e2); cam.pol = mix(fly.from.pol, homeCam.pol, e2); cam.dist = mix(fly.from.dist, homeCam.dist, e2); cam.ty = mix(fly.from.ty, homeCam.ty, e2);
          if (k >= 1) fly = null;
        } else if (!drag && (Math.abs(vel.az) > 1e-4 || Math.abs(vel.pol) > 1e-4)) {
          cam.az += vel.az; cam.pol = clamp(cam.pol + vel.pol, 0.32, 1.48); vel.az *= 0.9; vel.pol *= 0.9;
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
        if (clouds && !reduce) clouds.rotation.y += dt * (0.002 + wind * 0.006);
        if (rain) {
          var a = rain.geometry.attributes.position.array, fall = 18 * dt, dx = wv * 5 * dt;
          for (var k2 = 0; k2 < a.length; k2 += 6) {
            a[k2 + 1] -= fall; a[k2 + 4] -= fall; a[k2] += dx; a[k2 + 3] += dx;
            if (a[k2 + 1] < 0) { var x0 = (Math.random() - 0.5) * 40, z0 = (Math.random() - 0.5) * 40; a[k2] = x0; a[k2 + 1] = 18; a[k2 + 2] = z0; a[k2 + 3] = x0 - wv * 0.3; a[k2 + 4] = 18.5; a[k2 + 5] = z0; }
          }
          rain.geometry.attributes.position.needsUpdate = true;
        }
        if (snow) {
          var b = snow.geometry.attributes.position.array;
          for (var k3 = 0; k3 < b.length; k3 += 3) { b[k3 + 1] -= 1.1 * dt; b[k3] += (Math.sin(tt + k3) * 0.3 + wv * 2) * dt; if (b[k3 + 1] < 0) { b[k3 + 1] = 18; b[k3] = (Math.random() - 0.5) * 40; } }
          snow.geometry.attributes.position.needsUpdate = true;
        }
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(R.tick);
    }
    CUR = { close: function () { close(); } };
    return CUR;
  }

  return { open: open, supported: supported, sunPos: sunPos, isOpen: function () { return !!CUR; } };
})();
