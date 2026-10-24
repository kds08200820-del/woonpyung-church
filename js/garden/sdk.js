/* ============================================================
   신앙 정원 — SDK (백엔드를 아는 유일한 파일)
   · 세션/토큰 갱신/REST/RPC 는 js/forms.js 124-173 의 sess/refreshToken/api/rpc 를 그대로 복사
   · 정원 상태·동기화·심기·프로필·창고 = RPC(garden_*) 만 호출 (원천 표는 클라이언트가 읽지 않는다)
   · 큐티(qt_published)·아멘(qt_checks: 반드시 user_id=eq.<내 uid> 필터)·출석(attend_hero)·달력(worship_schedule)
   · 날씨 = Open-Meteo(키 없음), sessionStorage 30분 캐시, 실패 시 null
   · 오프라인 대비: lastState/saveState (localStorage)
   · 교회 slug: ?church= → body[data-church] → 'woonpyung'
   ============================================================ */
(function () {
  'use strict';
  var SB = '', AK = '', SLUG = 'woonpyung';
  var WX_URL = 'https://api.open-meteo.com/v1/forecast';
  var WX_TTL = 30 * 60 * 1000;

  function cfg() { SB = String(window.SUPABASE_URL || '').replace(/\/$/, ''); AK = window.SUPABASE_ANON_KEY || ''; }
  function resolveSlug() {
    var q = '';
    try { q = new URLSearchParams(location.search).get('church') || ''; } catch (e) { }
    if (q && /^[a-z0-9_-]{2,40}$/i.test(q)) return q.toLowerCase();
    var b = document.body && document.body.getAttribute('data-church');
    return (b && /^[a-z0-9_-]{2,40}$/i.test(b)) ? b.toLowerCase() : 'woonpyung';
  }
  function init() { cfg(); SLUG = resolveSlug(); return SLUG; }

  /* ── 로그인 세션 (forms.js 와 같은 방식) ── */
  function ref() { try { return new URL(SB).hostname.split('.')[0]; } catch (e) { return ''; } }
  function sess() {
    try {
      var raw = localStorage.getItem('sb-' + ref() + '-auth-token');
      if (!raw) return null;
      var s = JSON.parse(raw); s = (s && s.currentSession) ? s.currentSession : s;
      if (!s || !s.access_token || !s.user) return null;
      return { uid: s.user.id, token: s.access_token };
    } catch (e) { return null; }
  }
  var refreshing = null;
  function refreshToken() {
    if (refreshing) return refreshing;
    refreshing = new Promise(function (resolve, reject) {
      var key = 'sb-' + ref() + '-auth-token', stored, cur;
      try { stored = JSON.parse(localStorage.getItem(key)); cur = stored && (stored.currentSession || stored); } catch (e) { }
      var rt = cur && cur.refresh_token;
      if (!rt) { reject(new Error('no refresh token')); return; }
      fetch(SB + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: AK, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.access_token) throw new Error('refresh failed');
          cur.access_token = d.access_token; cur.refresh_token = d.refresh_token || rt;
          if (d.expires_at) cur.expires_at = d.expires_at;
          if (d.user) cur.user = d.user;
          localStorage.setItem(key, JSON.stringify(stored));
          resolve(d.access_token);
        }).catch(reject);
    });
    refreshing.then(function () { refreshing = null; }, function () { refreshing = null; });
    return refreshing;
  }
  /* 응답(Response)까지만 돌려주는 바탕 요청 — 401/만료면 토큰을 한 번 갱신해 다시 보낸다 */
  function request(method, path, body, extra, retried) {
    if (!SB || !AK) return Promise.reject(new Error('no-config'));
    var s = sess(), h = { apikey: AK, 'Content-Type': 'application/json' };
    if (s) h.Authorization = 'Bearer ' + s.token;
    if (extra) for (var k in extra) h[k] = extra[k];
    var opt = { method: method, headers: h };
    if (body) opt.body = JSON.stringify(body);
    return fetch(SB + '/rest/v1/' + path, opt).then(function (r) {
      if (!r.ok && !retried && s && r.status === 401) {
        return r.text().then(function (t) {
          if (/JWT expired|PGRST303|invalid (JWT|token)/i.test(t || '') || r.status === 401) {
            return refreshToken().then(function () { return request(method, path, body, extra, true); });
          }
          return new Response(t, { status: r.status, headers: r.headers });
        });
      }
      return r;
    });
  }
  function api(method, path, body) {
    return request(method, path, body).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { var e = new Error(t || ('HTTP ' + r.status)); e.status = r.status; throw e; });
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }
  function rpc(name, args) { return api('POST', 'rpc/' + name, args || {}); }
  /* 공개 뷰 읽기(anon 키) — qt_published, worship_schedule */
  function pub(path) {
    if (!SB || !AK) return Promise.reject(new Error('no-config'));
    return fetch(SB + '/rest/v1/' + path, { headers: { apikey: AK, Authorization: 'Bearer ' + AK } })
      .then(function (r) { return r.ok ? r.json() : []; });
  }
  function notReady(e) { return /42P01|42883|PGRST20[0-9]|does not exist|schema cache|Could not find/i.test((e && e.message) || ''); }
  function isNetwork(e) { return !!e && !e.status && /fetch|network|Failed|load/i.test(e.message || e.name || ''); }

  /* ── 정원 RPC (설계안 B-3) ── */
  function state() { return rpc('garden_state', { p_church: SLUG }); }
  function sync() { return rpc('garden_sync', { p_church: SLUG }); }
  function setPlant(species, name) { return rpc('garden_set_plant', { p_church: SLUG, p_species: species, p_name: name || null }); }
  function setProfile(p) {
    var a = {}; p = p || {};
    if (p.nickname != null) a.p_nickname = p.nickname;
    if (p.avatar_url != null) a.p_avatar_url = p.avatar_url;     // https:// 사진 주소만(서버가 거른다)
    if (p.avatar_key != null) a.p_avatar_key = p.avatar_key;     // 점토 캐릭터 a/b/c
    if (p.visibility != null) a.p_visibility = p.visibility;
    if (p.locale != null) a.p_locale = p.locale;
    return rpc('garden_set_profile', a);
  }
  /* 내 땅·작물·열매 (20261023_1300_garden_farm.sql) */
  function farm() { return rpc('garden_farm', { p_church: SLUG }); }
  function notices() { return api('GET', 'notices?select=id,title,created_at,pinned&order=pinned.desc,created_at.desc&limit=3'); }   // 안내 도우미: 교회 소식
  /* 정원 초대하기·방문하기·방명록 (20261023_2100 SQL) */
  function visitSet(open) { return rpc('garden_visit_set', { p_church: SLUG, p_open: !!open }); }
  function visitList() { return rpc('garden_visit_list', { p_church: SLUG }); }
  function visitView(plot) { return rpc('garden_visit_view', { p_church: SLUG, p_plot: plot | 0 }); }
  function guestbookPost(plot, body) { return rpc('garden_guestbook_post', { p_church: SLUG, p_plot: plot | 0, p_body: String(body || '') }); }
  function guestbookHide(id) { return rpc('garden_guestbook_hide', { p_church: SLUG, p_id: id }); }
  function neighborRequest(plot) { return rpc('garden_neighbor_request', { p_church: SLUG, p_plot: plot | 0 }); }
  function neighborRespond(id, accept) { return rpc('garden_neighbor_respond', { p_church: SLUG, p_id: id, p_accept: !!accept }); }
  function neighborRemove(id) { return rpc('garden_neighbor_remove', { p_church: SLUG, p_id: id }); }
  function neighborList() { return rpc('garden_neighbor_list', { p_church: SLUG }); }
  function gift(plot, amount, note) { return rpc('garden_gift', { p_church: SLUG, p_plot: plot | 0, p_amount: +amount || 0, p_note: note || null }); }
  function farmBuy(x, y) { return rpc('garden_farm_buy', { p_church: SLUG, p_x: x, p_y: y }); }
  function farmPlant(x, y, crop) { return rpc('garden_farm_plant', { p_church: SLUG, p_x: x, p_y: y, p_crop: crop }); }
  function farmPick(x, y, n) { return rpc('garden_farm_pick', { p_church: SLUG, p_x: x, p_y: y, p_n: n }); }
  function pickFruit(n) { return rpc('garden_pick_fruit', { p_church: SLUG, p_n: n }); }
  /* 마이월렛·물 주기·땅 종류·꽃집 (20261023_1500_garden_wallet_shop.sql) */
  function wallet() { return rpc('garden_wallet', { p_church: SLUG }); }
  function water() { return rpc('garden_water', { p_church: SLUG }); }
  function farmBuyMany(cells) { return rpc('garden_farm_buy_many', { p_church: SLUG, p_cells: cells }); }
  function farmConvert(cells) { return rpc('garden_farm_convert', { p_church: SLUG, p_cells: cells }); }
  function shop() { return rpc('garden_shop', { p_church: SLUG }); }
  function shopBuy(item, qty) { return rpc('garden_shop_buy', { p_church: SLUG, p_item: item, p_qty: qty || 1 }); }
  function farmPlantItem(x, y, item) { return rpc('garden_farm_plant_item', { p_church: SLUG, p_x: x, p_y: y, p_item: item }); }
  function farmHarvest(x, y, n) { return rpc('garden_farm_harvest', { p_church: SLUG, p_x: x, p_y: y, p_n: n }); }
  function farmClear(x, y) { return rpc('garden_farm_clear', { p_church: SLUG, p_x: x, p_y: y }); }
  function adminSetLandPrices(j, d) { return rpc('garden_admin_set_land_prices', { p_church: SLUG, p_jeon: j, p_dae: d }); }
  function adminSetItemPrice(item, price) { return rpc('garden_admin_set_item_price', { p_church: SLUG, p_item: item, p_price: price }); }
  /* 경제 가격표 · 나무 스토어 재고 · 나의 보관함 · 건축 미션 (20261024_0010_garden_economy_build.sql) */
  function farmCut(x, y) { return rpc('garden_farm_cut', { p_church: SLUG, p_x: x, p_y: y }); }
  function farmDig(x, y, dead) { return rpc('garden_farm_dig', { p_church: SLUG, p_x: x, p_y: y, p_dead: !!dead }); }
  function treeSell(x, y) { return rpc('garden_tree_sell', { p_church: SLUG, p_x: x, p_y: y }); }
  function treeBuy(item, qty) { return rpc('garden_tree_buy', { p_church: SLUG, p_item: item, p_qty: qty || 1 }); }
  function storage() { return rpc('garden_storage', { p_church: SLUG }); }
  function adminSetStock(item, qty) { return rpc('garden_admin_set_stock', { p_church: SLUG, p_item: item, p_qty: qty | 0 }); }
  /* 하우스(유리 온실) · 하우스 작물 (20261024_0100_garden_greenhouse.sql) */
  function house() { return rpc('garden_house', { p_church: SLUG }); }
  function houseBuild(cells) { return rpc('garden_house_build', { p_church: SLUG, p_cells: cells || [] }); }
  function houseRemove(x, y) { return rpc('garden_house_remove', { p_church: SLUG, p_x: x, p_y: y }); }
  function adminSetHousePrice(p) { return rpc('garden_admin_set_house_price', { p_church: SLUG, p_price: p }); }
  /* 건축: 집 짓기 · 교회 건축헌금 (20261024_0200_garden_build.sql) */
  function home() { return rpc('garden_home', { p_church: SLUG }); }
  function homeBuild(kind, cells) { return rpc('garden_home_build', { p_church: SLUG, p_kind: kind, p_cells: cells || [] }); }
  function church() { return rpc('garden_church', { p_church: SLUG }); }
  function churchOffer(build, amount) { return rpc('garden_church_offer', { p_church: SLUG, p_build: build, p_amount: amount }); }
  function adminChurchStart(kind, goal) { return rpc('garden_admin_church_start', { p_church: SLUG, p_kind: kind, p_goal: goal == null ? null : goal }); }
  function adminChurchGoal(goal) { return rpc('garden_admin_church_goal', { p_church: SLUG, p_goal: goal }); }
  function adminChurchStop() { return rpc('garden_admin_church_stop', { p_church: SLUG }); }
  function history(limit, offset) { return rpc('garden_history', { p_church: SLUG, p_limit: Math.min(Math.max(+limit || 30, 1), 100), p_offset: Math.max(+offset || 0, 0) }); }

  /* ── 큐티 (dashboard.js 897 방식: 오늘 이전 최근 1건) ── */
  function qtToday(today) {
    return pub('qt_published?select=*&sermon_date=lte.' + encodeURIComponent(today) + '&order=sermon_date.desc&limit=1')
      .then(function (rows) { return (rows && rows[0]) || null; });
  }
  /* ── 아멘 (main.js 738-793 방식; GET 은 반드시 내 user_id 로 거른다 — 관리자는 전원 행을 읽을 수 있다) ── */
  function amenState(date) {
    var s = sess(); if (!s) return Promise.resolve(false);
    return api('GET', 'qt_checks?select=id&user_id=eq.' + encodeURIComponent(s.uid) + '&check_date=eq.' + encodeURIComponent(date))
      .then(function (rows) { return !!(rows && rows.length); });
  }
  function amen(date) {
    var s = sess(); if (!s) return Promise.reject(new Error('login'));
    return request('POST', 'qt_checks', { user_id: s.uid, check_date: date }, { Prefer: 'return=minimal' }).then(function (r) {
      if (r.ok) return { ok: true, already: false };
      if (r.status === 409) return { ok: true, already: true };
      return r.text().then(function (t) { var e = new Error(t || ('HTTP ' + r.status)); e.status = r.status; throw e; });
    });
  }
  function amenRank(date) { return rpc('qt_check_rank', { p_date: date }).catch(function () { return null; }); }

  /* ── 출석 (modu/worship-banner.js 65-82 방식: rpc attend_hero) ── */
  function attend(service) { return rpc('attend_hero', { p_service: service }); }
  /* ── 그날 예배가 달력에 있는가 (worship_schedule 공개 뷰) ── */
  function hasSermon(date, service) {
    if (!service) return Promise.resolve(true);
    return pub('worship_schedule?select=sermon_date&sermon_date=eq.' + encodeURIComponent(date) + '&service=eq.' + encodeURIComponent(service) + '&limit=1')
      .then(function (rows) { return !!(rows && rows.length); }).catch(function () { return false; });
  }

  /* ── 날씨 (Open-Meteo) — {temp, code, isDay, sunrise:'HH:MM', sunset:'HH:MM', utcOffset, at} | null ── */
  function wxKey(lat, lng) { return 'g_wx:' + (+lat).toFixed(2) + ',' + (+lng).toFixed(2); }
  function weather(lat, lng, tz) {
    if (!(isFinite(+lat) && isFinite(+lng))) return Promise.resolve(null);
    var key = wxKey(lat, lng);
    try {
      var c = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (c && c.at && (Date.now() - c.at) < WX_TTL && c.data) return Promise.resolve(c.data);
    } catch (e) { }
    var u = WX_URL + '?latitude=' + encodeURIComponent(+lat) + '&longitude=' + encodeURIComponent(+lng) +
      '&current=temperature_2m,weather_code,is_day,wind_speed_10m&daily=sunrise,sunset&timezone=' + encodeURIComponent(tz || 'auto') + '&forecast_days=1';
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.current) return null;
      var d = j.daily || {};
      var data = {
        temp: j.current.temperature_2m, code: j.current.weather_code, isDay: j.current.is_day !== 0, wind: j.current.wind_speed_10m,
        sunrise: hhmm(d.sunrise && d.sunrise[0]), sunset: hhmm(d.sunset && d.sunset[0]),
        utcOffset: j.utc_offset_seconds || 0, at: Date.now()
      };
      try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { }
      return data;
    }).catch(function () { return null; });
  }
  /* 7일 예보(Open-Meteo, 바람은 m/s) — [{date, code, tmax, tmin, rain, pop, wind, gust}] | null, 1시간 저장 */
  function forecast(lat, lng, tz) {
    if (!(isFinite(+lat) && isFinite(+lng))) return Promise.resolve(null);
    var key = 'g_fc:' + (+lat).toFixed(2) + ',' + (+lng).toFixed(2);
    try { var c = JSON.parse(sessionStorage.getItem(key) || 'null'); if (c && c.at && Date.now() - c.at < 60 * 60 * 1000 && c.data) return Promise.resolve(c.data); } catch (e) { }
    var u = WX_URL + '?latitude=' + encodeURIComponent(+lat) + '&longitude=' + encodeURIComponent(+lng) +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max' +
      '&wind_speed_unit=ms&forecast_days=7&timezone=' + encodeURIComponent(tz || 'auto');
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var d = j && j.daily; if (!d || !d.time) return null;
      var out = d.time.map(function (ds, i) {
        return { date: ds, code: d.weather_code[i], tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], rain: d.precipitation_sum[i] || 0,
          pop: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null, wind: d.wind_speed_10m_max[i], gust: d.wind_gusts_10m_max ? d.wind_gusts_10m_max[i] : null };
      });
      try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: out })); } catch (e) { }
      return out;
    }).catch(function () { return null; });
  }
  // 교적 주소의 시·도/시·군·구/읍·면·동 (본인 것만, 20261023_2330 SQL)
  function myRegion() { return rpc('garden_my_region', {}); }
  function hhmm(iso) { var m = String(iso || '').match(/T(\d{2}):(\d{2})/); return m ? m[1] + ':' + m[2] : null; }

  /* ── 오프라인 대비: 마지막 상태 ── */
  function stateKey() { var s = sess(); return 'g_state:' + SLUG + ':' + (s ? s.uid : 'anon'); }
  function lastState() {
    try { var raw = localStorage.getItem(stateKey()); if (!raw) return null; var o = JSON.parse(raw); return o && o.state ? o : null; } catch (e) { return null; }
  }
  function saveState(st) { try { localStorage.setItem(stateKey(), JSON.stringify({ at: Date.now(), state: st })); } catch (e) { } }

  window.GardenSDK = {
    init: init, slug: function () { return SLUG; }, session: sess, hasConfig: function () { return !!(SB && AK); },
    state: state, sync: sync, setPlant: setPlant, setProfile: setProfile, history: history,
    farm: farm, farmBuy: farmBuy, farmPlant: farmPlant, farmPick: farmPick, pickFruit: pickFruit,
    notices: notices, forecast: forecast, myRegion: myRegion, visitSet: visitSet, visitList: visitList, visitView: visitView, guestbookPost: guestbookPost, guestbookHide: guestbookHide,
    gift: gift, neighborRequest: neighborRequest, neighborRespond: neighborRespond, neighborRemove: neighborRemove, neighborList: neighborList,
    wallet: wallet, water: water, farmBuyMany: farmBuyMany, farmConvert: farmConvert, shop: shop, shopBuy: shopBuy,
    farmPlantItem: farmPlantItem, farmHarvest: farmHarvest, farmClear: farmClear, adminSetLandPrices: adminSetLandPrices, adminSetItemPrice: adminSetItemPrice,
    farmCut: farmCut, farmDig: farmDig, treeSell: treeSell, treeBuy: treeBuy, storage: storage, adminSetStock: adminSetStock,
    house: house, houseBuild: houseBuild, houseRemove: houseRemove, adminSetHousePrice: adminSetHousePrice,
    home: home, homeBuild: homeBuild, church: church, churchOffer: churchOffer, adminChurchStart: adminChurchStart, adminChurchGoal: adminChurchGoal, adminChurchStop: adminChurchStop,
    openForms: function () { return rpc('app_open_forms').then(function (r) { return r || []; }); },   // 지금 신청 기간인 신청서(서버 시계) — 로그인 전에도 읽는다
    qtToday: qtToday, amenState: amenState, amen: amen, amenRank: amenRank,
    attend: attend, hasSermon: hasSermon, weather: weather,
    lastState: lastState, saveState: saveState, notReady: notReady, isNetwork: isNetwork
  };
})();
