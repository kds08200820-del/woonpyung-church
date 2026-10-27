/* cert.js — 교회행정 > 증명서 발급 (cert.html, 2026-10-25 담임목사 지시)
 *  "강의를 듣지 않았다 하더라도 증명서 발급을 할 수 있어야 합니다. 동일한 학습 세례 양식의 증명서를 발급하여 해당 성도의 db 자료실에
 *   넣어 줄 수 있도록 해주세요. 증명서 발급은 교회 행정에 증명서 발급 란을 만들어 주시고, 목회자만 이용할 수 있도록 해주세요."
 *  · 문: 목회자만 — rpc edu_is_pastor()(관리자이면서 직분에 '목사'·'전도사' 또는 '목회자' 지명). SQL 20261025_2000 실행 전에는
 *        같은 기준을 화면에서 본다(admins · profiles.role · broadcast_access.canPastor). 서버 발급 함수도 2000 뒤에는 목회자만 받는다.
 *  · 본문: js/edu-admin.js 의 WPCEduAdmin.page(root, ctx) — 종류별 발급 단추 · 도장 설정 · 발급 대장(보기·인쇄·취소)
 */
console.log('[cert.js] v20261025ct1');

(function () {
  var root = document.getElementById('certRoot');
  if (!root) return;
  var SB = String(window.SUPABASE_URL || '').replace(/\/$/, ''), AK = window.SUPABASE_ANON_KEY;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ref() { try { return new URL(SB).hostname.split('.')[0]; } catch (e) { return ''; } }
  function store() { try { return JSON.parse(localStorage.getItem('sb-' + ref() + '-auth-token')); } catch (e) { return null; } }
  function sess() { var s = store(); s = s && s.currentSession ? s.currentSession : s; return s && s.access_token && s.user ? { uid: s.user.id, token: s.access_token } : null; }
  var refreshing = null;
  function refreshToken() {
    if (refreshing) return refreshing;
    refreshing = new Promise(function (resolve, reject) {
      var st = store(), cur = st && (st.currentSession || st), rt = cur && cur.refresh_token;
      if (!rt) { reject(new Error('no refresh token')); return; }
      fetch(SB + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: AK, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          if (!d || !d.access_token) throw new Error('refresh failed');
          cur.access_token = d.access_token; cur.refresh_token = d.refresh_token || rt;
          if (d.expires_at) cur.expires_at = d.expires_at; if (d.user) cur.user = d.user;
          localStorage.setItem('sb-' + ref() + '-auth-token', JSON.stringify(st));
          resolve(d.access_token);
        }).catch(reject);
    });
    refreshing.then(function () { refreshing = null; }, function () { refreshing = null; });
    return refreshing;
  }
  // 목회행정(affairs.js)과 같은 꼴: api(method, path, body, prefer)
  function api(method, path, body, prefer, retried) {
    var s = sess(), h = { apikey: AK, 'Content-Type': 'application/json' };
    if (s) h.Authorization = 'Bearer ' + s.token;
    if (prefer) h.Prefer = prefer;
    var opt = { method: method, headers: h };
    if (body) opt.body = JSON.stringify(body);
    return fetch(SB + '/rest/v1/' + path, opt).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        if (!retried && (r.status === 401 || /JWT expired|PGRST303|invalid (JWT|token)/i.test(t || ''))) return refreshToken().then(function () { return api(method, path, body, prefer, true); });
        var e = new Error(t || ('HTTP ' + r.status)); e.status = r.status; throw e;
      });
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }
  // 창 닫기: 뒤로 가기로도 닫힌다
  var closers = [];
  window.addEventListener('popstate', function () { var f = closers.pop(); if (f) f(); });
  function pushBackClose(teardown) {
    closers.push(teardown);
    history.pushState({ _ctModal: 1 }, '');
    return function close() { if (closers.indexOf(teardown) < 0) return; history.back(); };
  }
  function msg(title, text, login) {
    root.innerHTML = '<div class="fin-card ct-msg"><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>' +
      (login ? '<p style="margin-top:14px"><button type="button" class="btn btn-solid" id="ctLogin" style="padding:9px 20px">로그인</button></p>' : '') + '</div>';
    var b = document.getElementById('ctLogin');
    if (b) b.onclick = function () { var m = document.getElementById('authModal'); if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; } };
  }
  function notFound(e) { return /42883|PGRST20[0-9]|does not exist|schema cache|Could not find/i.test((e && e.message) || ''); }
  // 목회자인가 — 서버 함수(2000) 우선, 없으면 같은 기준을 화면에서
  function isPastor(s) {
    return api('POST', 'rpc/edu_is_pastor', {}).then(function (v) { return v === true; }, function (e) {
      if (!notFound(e)) throw e;
      return Promise.all([
        api('GET', 'admins?uid=eq.' + s.uid + '&select=uid'),
        api('GET', 'profiles?id=eq.' + s.uid + '&select=role'),
        api('POST', 'rpc/broadcast_access', {}).catch(function () { return null; })
      ]).then(function (r) {
        var admin = (r[0] || []).length > 0, role = ((r[1] || [])[0] || {}).role || '', named = !!(r[2] && r[2].canPastor);
        return admin && (named || /목사|전도사/.test(role));
      });
    });
  }

  var s = sess();
  if (!SB || !AK) return msg('설정이 없습니다', '사이트 설정(config.js)을 확인해 주십시오.');
  if (!s) return msg('로그인이 필요합니다', '증명서 발급은 목회자만 이용할 수 있습니다. 로그인해 주십시오.', true);
  isPastor(s).then(function (ok) {
    if (!ok) return msg('목회자만 이용할 수 있습니다', '증명서 발급은 담임목사·목사·전도사(관리자) 또는 목회자로 지명된 관리자만 열 수 있습니다. 필요하시면 담임목사님께 말씀해 주십시오.');
    if (!window.WPCEduAdmin || !window.WPCEduAdmin.page) return msg('불러오지 못했습니다', '화면 파일을 불러오지 못했습니다. 새로고침해 주십시오.');
    window.WPCEduAdmin.page(root, { api: api, esc: esc, note: function () { }, pushBackClose: pushBackClose });
  }).catch(function (e) { msg('권한을 확인하지 못했습니다', (e && e.message) || '잠시 뒤에 다시 열어 주십시오.'); });
})();
