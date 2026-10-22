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
      '&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&timezone=' + encodeURIComponent(tz || 'auto') + '&forecast_days=1';
    return fetch(u).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !j.current) return null;
      var d = j.daily || {};
      var data = {
        temp: j.current.temperature_2m, code: j.current.weather_code, isDay: j.current.is_day !== 0,
        sunrise: hhmm(d.sunrise && d.sunrise[0]), sunset: hhmm(d.sunset && d.sunset[0]),
        utcOffset: j.utc_offset_seconds || 0, at: Date.now()
      };
      try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: data })); } catch (e) { }
      return data;
    }).catch(function () { return null; });
  }
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
    qtToday: qtToday, amenState: amenState, amen: amen, amenRank: amenRank,
    attend: attend, hasSermon: hasSermon, weather: weather,
    lastState: lastState, saveState: saveState, notReady: notReady, isNetwork: isNetwork
  };
})();
