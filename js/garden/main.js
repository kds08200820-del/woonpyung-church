/* ============================================================
   신앙 정원 — 부팅 (설계안 A-2 'main.js' 행)
   slug → sdk → 세션 없으면 안내판 / 있으면 state()(실패 시 lastState + 오프라인 칩) → 시간대·통화명·지역 적용
   → preload(하늘·언덕·바닥·책장·현재 식물) → 날씨 비동기 → 식물 없으면 첫 심기 → scene.mount → hud.render → sync()
   타이머: 날씨 30분 · 하늘 60초 · visibilitychange 재동기화 · 교회 시간대 날짜 바뀌면 reload
   미리 보기: ?tod=dawn|day|dusk|night ?wx=clear|cloudy|fog|rain|snow ?season= ?svc=live|soon|day ?new=1 ?reduce=1
   ============================================================ */
(function () {
  'use strict';
  var I = window.GardenI18n, SDK = window.GardenSDK, SCENE = window.GardenScene, HUD = window.GardenHud;
  if (!(I && SDK && SCENE && HUD)) return;
  var t = I.t;
  var Q; try { Q = new URLSearchParams(location.search); } catch (e) { Q = { get: function () { return null; } }; }
  var P = { tod: Q.get('tod') || '', wx: Q.get('wx') || '', season: Q.get('season') || '', svc: Q.get('svc') || '', isNew: Q.get('new') === '1', reduce: Q.get('reduce') === '1' };
  var BASE = 'images/garden/default/';
  var M = { state: null, offline: false, manifest: null, wx: null, bootDay: '', lastSync: 0, church: null, demo: false };

  function reduceMotion() { try { return P.reduce || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return P.reduce; } }
  function fixHeader() { var a = document.querySelector('#header .logo'); if (a) a.setAttribute('href', 'garden.html'); }
  function setTitle() { document.title = t('page.title'); }

  /* ── 시각·날씨·계절 ── */
  function phaseNow() {
    if (/^(dawn|day|dusk|night)$/.test(P.tod)) return P.tod;
    var n = I.nowParts(), nowMin = n.hh * 60 + n.mm, w = M.wx;
    return SCENE.phaseOf(nowMin, w ? SCENE.toMin(w.sunrise) : null, w ? SCENE.toMin(w.sunset) : null);
  }
  function weatherNow() { if (/^(clear|cloudy|fog|rain|snow)$/.test(P.wx)) return P.wx; return M.wx ? SCENE.weatherOf(M.wx.code) : 'clear'; }
  function seasonNow() {
    if (/^(spring|summer|autumn|winter)$/.test(P.season)) return P.season;
    var lat = (M.church && M.church.lat != null) ? +M.church.lat : 37.09;
    return SCENE.seasonOf(I.nowParts().m, lat);
  }
  function applySky() {
    if (!SCENE.mounted()) return;
    var ph = phaseNow();
    SCENE.setSky(ph, weatherNow()); SCENE.setSeason(seasonNow());
    HUD.setWeather(M.wx, ph);
  }
  function loadManifest() {
    return fetch(BASE + 'manifest.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (m) { M.manifest = (m && typeof m === 'object') ? m : null; SCENE.setManifest(M.manifest, BASE); return M.manifest; });
  }
  function refreshWeather() {
    var ch = M.church;
    var lat = ch && ch.lat != null ? +ch.lat : 37.09, lng = ch && ch.lng != null ? +ch.lng : 126.80;
    return SDK.weather(lat, lng, I.timezone()).then(function (w) { M.wx = w; applySky(); return w; });
  }
  function preloadFor(st) {
    var g = (st && st.garden) || {};
    var urls = SCENE.assetsFor(phaseNow(), seasonNow(), g.species || 'sunflower', Math.max(0, Math.min(5, (g.stage | 0) - 1)));   // 서버 단계 1부터 → 그림 0부터
    return Promise.race([SCENE.preload(urls), new Promise(function (res) { setTimeout(res, 2500); })]);
  }
  function mountScene(st) {
    SCENE.mount(document.getElementById('gScene'), { manifest: M.manifest, base: BASE, reduce: reduceMotion(), world: st ? { plot: st.plot || { plot_no: 0, x: 0, y: 0 }, church: st.church ? { slug: st.church.slug, name: st.church.name, theme: st.church.theme } : null } : {} });
    applySky();
  }
  /* 안내판 뒤에 보이는 빈 정원(세션 없음·오류) */
  function mountDemo() {
    if (M.demo) return; M.demo = true;
    loadManifest().then(function () { return preloadFor(null); }).then(function () {
      mountScene(null);
      SCENE.setCharacter('a', { nickname: '' });
      SCENE.setPlant('sunflower', 2);
      SCENE.setNameplate(t('demo.name'), t('stage.2'));
      refreshWeather();
      setInterval(applySky, 60 * 1000);
    });
  }

  /* ── 동기화 ── */
  function doSync() {
    if (M.offline || !SDK.session()) return Promise.resolve(null);
    M.lastSync = Date.now();
    return SDK.sync().then(function (r) { HUD.applySync(r); M.state = HUD.state() || M.state; return r; })
      .catch(function (e) { if (SDK.isNetwork(e)) { M.offline = true; HUD.render(M.state, { offline: true }); } return null; });
  }
  function timers() {
    setInterval(refreshWeather, 30 * 60 * 1000);
    setInterval(applySky, 60 * 1000);
    setInterval(function () { if (I.todayStr() !== M.bootDay) location.reload(); }, 60 * 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      if (I.todayStr() !== M.bootDay) { location.reload(); return; }
      applySky();
      // 다른 페이지(성장기 하트·QT·성경)에 다녀오면 바로 다시 셈한다
      if (Date.now() - M.lastSync > 5 * 1000) doSync();
    });
    // 뒤로 가기로 돌아온 페이지(bfcache)는 visibilitychange 가 없을 수 있다
    window.addEventListener('pageshow', function (ev) { if (ev.persisted && Date.now() - M.lastSync > 5 * 1000) doSync(); });
  }

  /* ── 나의 정원에 들어가기(입체, 2026-10-23 담임목사) ──
     장면과 같은 그림(나무 단계·내 모습·언덕·구름)과 '내 땅' 칸을 넘겨 garden3d.js 가 그린다. 내 땅을 아직 안 불렀으면 불러서 넘긴다 */
  function bind3d() {
    var b = document.getElementById('gEnter3d');
    if (!b || !window.Garden3D || !window.Garden3D.supported()) return;
    b.hidden = false;
    b.addEventListener('click', function () { open3d(b); });
  }
  // 입체 창 공통(날씨·해·그림) — 내 정원과 이웃 정원 방문이 같이 쓴다
  function base3d() {
    var ch = M.church || {};
    return { place: ch.name || '', lat: ch.lat, lng: ch.lng, wx: M.wx, t: t, reduce: reduceMotion(),
      art: { hills: SCENE.asset('mid/hills.webp'), clouds: SCENE.asset('sky/clouds-overlay.webp'), soil: 'images/garden/farm/tex-soil.webp', dae: 'images/garden/farm/tex-dae.webp', grass: 'images/garden/farm/tex-grass.webp' } };
  }
  // 내 정원(입체) — 내 땅 가꾸기(심기·거두기·땅 사기·메뉴)를 이 창 하나에서 (2D 내 땅 창은 없앴다, 2026-10-23)
  function open3d(btn) {
    if (!window.Garden3D || !window.Garden3D.supported()) { HUD.toast(t('g3d.fail')); return; }
    if (window.Garden3D.isOpen()) return;
    var st = M.state || {}, g = HUD.garden() || {}, FARM = window.GardenFarm;
    var sp = g.species || 'sunflower', stg = Math.max(0, Math.min(5, g.stage | 0)), fr = st.fruit;
    var treeFruit = fr && fr.per_day > 0 && (fr.picked || []).length < fr.per_day ? 'images/garden/farm/fruit-' + sp + '.webp' : '';
    var opts = Object.assign(base3d(), {
      title: t('g3d.title'), sub: (g.plant_name || HUD.speciesName(sp)) + ' · ' + HUD.stageName(sp, stg),
      opener: btn && btn.focus ? btn : null,
      plant: { src: SCENE.asset('plants/' + sp + '-' + stg + '.webp'), name: (g.plant_name || HUD.speciesName(sp)) + ' · ' + HUD.stageName(sp, stg), bubble: treeFruit }
    });
    var farmOn = FARM && FARM.attach3d && fr !== undefined && !M.offline;   // 내 땅 기능이 있는 서버(state.fruit)일 때만
    if (farmOn) FARM.attach3d(opts);
    var view = window.Garden3D.open(opts);
    if (farmOn) FARM.bindView(view);
  }

  /* ── 카카오 로그인 복귀(#access_token=…): sb-ready → SIGNED_IN 뒤 garden.html 로 ── */
  function signing() {
    HUD.showGate('signing'); mountDemo();
    var done = false;
    function go() { if (done) return; done = true; location.replace('garden.html'); }
    function onReady(ev) {
      var sb = ev && ev.detail && ev.detail.sb; if (!sb || !sb.auth) return;
      try { sb.auth.onAuthStateChange(function (event, session) { if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session) go(); }); } catch (e) { }
    }
    window.addEventListener('sb-ready', onReady);
    if (window.__sb) onReady({ detail: { sb: window.__sb } });
    var n = 0, iv = setInterval(function () {
      if (SDK.session()) { clearInterval(iv); go(); return; }
      if (++n > 40) { clearInterval(iv); if (!done) HUD.showGate('login'); }
    }, 500);
  }

  /* ── 본 부팅 ── */
  function start(st) {
    M.church = st.church || {};
    I.setLocale(M.church.locale || 'ko', M.church.timezone || 'Asia/Seoul');
    setTitle(); I.apply(document);
    M.bootDay = I.todayStr();
    var g = st.garden || {};
    return loadManifest().then(function () {
      var shelf = SCENE.asset('study/shelf-wall.webp');
      /* CSS 변수 안의 상대 주소는 css/garden.css 기준으로 풀리므로(→ css/images/… 없음) 페이지 기준 절대 주소로 넣는다 */
      if (shelf) { document.documentElement.style.setProperty('--g-shelf', 'url("' + new URL(shelf, document.baseURI).href + '")'); document.getElementById('gStudy').classList.add('has-shelf'); }
      return preloadFor(st);
    }).then(function () {
      mountScene(st);
      HUD.render(st, { offline: M.offline });
      bind3d();
      HUD.startBanner(P.svc);
      HUD.loadQt();
      refreshWeather();
      var needPlant = (P.isNew || !g.chosen_at) && !M.offline;
      return needPlant ? HUD.openOnboarding(st).then(function (planted) { if (!planted) HUD.syncPlot(false); return planted; }) : null;
    }).then(function () { return doSync(); }).then(function () {
      timers();
      if (window.GardenVisit && !M.offline) window.GardenVisit.start();   // 초대하기·방문하기 (서버에 기능이 있을 때만 단추가 보인다)
      // 내 땅(밭)을 메인 장면에도 — 땅 기능이 있는 서버(state.fruit)일 때만, 창을 열지 않고 조용히 불러온다
      var s2 = M.state || st;
      var farmP = window.GardenFarm && s2 && s2.fruit !== undefined && !M.offline ? window.GardenFarm.reload() : null;
      // 안내 도우미: 하루 처음 들어올 때(밭·날씨를 받은 뒤, 첫 심기 창이 없을 때)
      if (window.GardenGuide) Promise.all([farmP, M.wx ? null : refreshWeather()]).then(function () { window.GardenGuide.daily(); }, function () { window.GardenGuide.daily(); });
    });
  }
  function boot() {
    SDK.init();
    I.setLocale('ko', 'Asia/Seoul'); setTitle(); fixHeader();
    HUD.init({ i18n: I, sdk: SDK, scene: SCENE, params: P });
    if (window.GardenShop) window.GardenShop.init({ i18n: I, sdk: SDK, hud: HUD });
    if (window.GardenFarm) window.GardenFarm.init({ i18n: I, sdk: SDK, hud: HUD, shop: window.GardenShop, plant: window.GardenPlant });
    if (window.GardenVisit) window.GardenVisit.init({ i18n: I, sdk: SDK, hud: HUD, scene: SCENE, farm: window.GardenFarm, base3d: base3d });
    if (window.GardenGuide) window.GardenGuide.init({ i18n: I, sdk: SDK, hud: HUD, scene: SCENE, farm: window.GardenFarm, ctx: function () { return { wx: M.wx, church: M.church, offline: M.offline }; } });
    if (reduceMotion()) document.documentElement.classList.add('g-reduce');
    M.bootDay = I.todayStr();
    if (/(^|[#&])access_token=/.test(location.hash || '')) { signing(); return; }
    if (!SDK.hasConfig()) { HUD.showGate('error', { msg: t('gate.noconfig'), retry: function () { location.reload(); } }); mountDemo(); return; }
    if (!SDK.session()) { HUD.showGate('login'); mountDemo(); return; }
    document.getElementById('gRoot').setAttribute('data-mode', 'loading');
    SDK.state()
      .then(function (st) {
        if (!st || st.ok === false) { var e = new Error((st && st.why) || 'state'); e.why = st && st.why; throw e; }
        M.state = st; SDK.saveState(st); return st;
      })
      .catch(function (e) {
        var last = SDK.lastState();
        if (last && last.state && !(e && e.why === 'login') && !SDK.notReady(e)) { M.state = last.state; M.offline = true; return M.state; }
        throw e;
      })
      .then(start)
      .catch(function (e) {
        if (e && e.why === 'login') HUD.showGate('login');
        else if (SDK.notReady(e)) HUD.showGate('notready');
        else HUD.showGate('error', { retry: function () { location.reload(); } });
        mountDemo();
      });
  }

  window.GardenApp = { open3d: open3d, preview: SCENE.preview, state: function () { return M.state; }, sync: doSync, applySky: applySky, params: P, hud: HUD, scene: SCENE, sdk: SDK };
  boot();
})();
