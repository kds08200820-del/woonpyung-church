/* ============================================================
 *  운평장로교회 — AX 관제실 (ax.html) · 2026-10-27 담임목사 지시
 *  · 목사님(관리자)이 명령을 적으면 ax_tasks 에 '대기'로 들어가고, 정해진 시간에 깨어나는 Claude 일꾼(AX)이
 *    ax_claim 으로 가져가 담당별로 처리한 뒤 ax_update 로 결과·링크를 적는다(.claude/skills/ax/SKILL.md).
 *  · 게시·발송처럼 바깥으로 나가는 일은 '확인 기다림'으로 올라오고, 여기서 [승인]해야 일꾼이 이어서 한다.
 *  · 참여 현황은 ax_week_stats(건수만, 이름 없음)를 열 때마다 바로 셈한다. 일정은 다가오는 주일·신청서 마감·할 일 기한.
 *  · 지우지 않는다 — 취소는 상태(cancelled)로. SQL(20261027_1500_ax_control.sql) 전이면 안내만 보인다.
 * ============================================================ */
(function () {
  'use strict';
  var SB = window.SUPABASE_URL, AK = window.SUPABASE_ANON_KEY;
  var ROLES = [
    { k: 'bulletin', ic: '📰', name: '주보 담당', desc: '주일 주보·주일학교 주보 초안' },
    { k: 'qt', ic: '📖', name: '큐티 담당', desc: '한 주 치 새벽 QT 정리·홈페이지 큐티' },
    { k: 'voice', ic: '🎙', name: '음성 담당', desc: '큐티·설교 요약 낭독 원고·음성' },
    { k: 'report', ic: '📊', name: '참여 현황', desc: '주간 참여 보고 (건수만)' },
    { k: 'youth', ic: '🧑‍🎓', name: '중등부 교재', desc: '학생용·교사용 교재' },
    { k: 'schedule', ic: '🗓', name: '일정 담당', desc: '주간 일정·마감 알림' }
  ];
  var EXTRA = { auto: { ic: '🤖', name: 'AX가 나눔' }, other: { ic: '✳️', name: '기타' }, human: { ic: '🙋', name: '사람이 할 일' } };
  var ST = { queued: '대기', working: '작업 중', review: '확인 기다림', approved: '승인됨', done: '끝', failed: '못 함', cancelled: '취소' };
  var STATS = [
    ['qt_amen', '큐티 아멘', '회'], ['qt_people', '큐티 아멘한 분', '명'], ['ss_kids', '주일학교 인증한 어린이', '명'], ['ss_talent', '주일학교 달란트', ''],
    ['bible', '성경 읽기', '회'], ['posts', '나눔 글', '개'], ['form_entries', '새 신청', '건'], ['garden_people', '정원 가꾼 분', '명']
  ];
  var A = { tasks: [], role: '', filter: 'open', worker: null, stats: null, prev: null, forms: [], cfg: {} };
  var ROOT = null;   // 그릴 자리: ax.html 의 #axPage, 또는 목회행정 'AX 관제실' 탭의 패널(AXRoom.mount)

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function linkify(s) { return esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); }
  function roleOf(k) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].k === k) return ROLES[i]; return EXTRA[k] || EXTRA.other; }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function nextSunday() { var d = new Date(); d.setHours(0, 0, 0, 0); return addDays(d, (7 - d.getDay()) % 7); }
  function mdw(s) { var d = s instanceof Date ? s : new Date(String(s).slice(0, 10) + 'T00:00:00'); return (d.getMonth() + 1) + '/' + d.getDate() + '(' + '일월화수목금토'[d.getDay()] + ')'; }
  function ago(iso) {
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 1 ? '방금' : m < 60 ? m + '분 전' : m < 1440 ? Math.round(m / 60) + '시간 전' : Math.round(m / 1440) + '일 전';
  }

  /* ── 로그인·요청 (목회행정과 같은 방식: 만료되면 refresh_token 으로 한 번 갱신) ── */
  function authKey() { var m = (SB || '').match(/https?:\/\/([^.]+)\./); return m ? 'sb-' + m[1] + '-auth-token' : ''; }
  function sess() {
    try { var raw = localStorage.getItem(authKey()); if (!raw) return null; var s = JSON.parse(raw); s = s && s.currentSession ? s.currentSession : s; return { uid: s && s.user && s.user.id, token: s && s.access_token, rt: s && s.refresh_token }; }
    catch (e) { return null; }
  }
  var refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    var key = authKey(), raw = localStorage.getItem(key); if (!raw) return Promise.reject(new Error('login'));
    var stored = JSON.parse(raw), cur = stored.currentSession || stored;
    refreshing = fetch(SB + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: AK, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: cur.refresh_token }) })
      .then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.access_token) throw new Error('login');
        cur.access_token = d.access_token; cur.refresh_token = d.refresh_token || cur.refresh_token; if (d.expires_at) cur.expires_at = d.expires_at;
        localStorage.setItem(key, JSON.stringify(stored)); return d.access_token;
      });
    refreshing.then(function () { refreshing = null; }, function () { refreshing = null; });
    return refreshing;
  }
  function api(method, path, body, prefer, retried) {
    var s = sess(), h = { apikey: AK, 'Content-Type': 'application/json' };
    if (s && s.token) h.Authorization = 'Bearer ' + s.token;
    if (prefer) h.Prefer = prefer;
    return fetch(SB + '/rest/v1/' + path, { method: method, headers: h, body: body == null ? undefined : JSON.stringify(body) }).then(function (r) {
      if (r.status === 401 && !retried && s && s.rt) return refresh().then(function () { return api(method, path, body, prefer, true); });
      if (r.status === 204) return null;
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { }
        if (!r.ok) { var err = new Error((j && (j.message || j.hint)) || ('HTTP ' + r.status)); err.status = r.status; err.code = j && j.code; throw err; }
        return j;
      });
    });
  }
  function noTable(e) { return e && (e.code === 'PGRST205' || e.code === '42P01' || e.code === 'PGRST202' || e.status === 404); }

  /* ── 시작 ── */
  function start() {
    var box = ROOT, s = sess();
    if (!s || !s.uid) { box.innerHTML = '<div class="ax-card"><p class="ax-empty">관리자로 <b>로그인</b>하면 AX 관제실을 볼 수 있습니다. (화면 오른쪽 위 로그인)</p></div>'; return; }
    api('GET', 'admins?uid=eq.' + s.uid + '&select=uid').then(function (rows) {
      if (!rows || !rows.length) { box.innerHTML = '<div class="ax-card"><p class="ax-empty">AX 관제실은 관리자만 볼 수 있습니다.</p></div>'; return; }
      return loadAll().then(render);
    }).catch(function (e) {
      if (noTable(e)) { box.innerHTML = setupHTML(); return; }
      box.innerHTML = '<div class="ax-card"><p class="ax-empty">불러오지 못했습니다: ' + esc(e.message) + '</p></div>';
    });
  }
  function setupHTML() {
    return '<div class="ax-card ax-setup"><h3>⚙️ AX 관제실 준비 중</h3>' +
      '<p>서버에 할 일 표가 아직 없습니다. <code>supabase/20261027_1500_ax_control.sql</code> 을 실행하면 이 화면이 열립니다.</p>' +
      '<p>실행한 뒤에는 ① 일꾼용 계정을 하나 만들어 <code>ax_workers</code> 에 등록하고 ② Claude 환경 비밀값 <code>AX_EMAIL</code>·<code>AX_PASSWORD</code> 를 넣고 ③ 예약 작업을 걸면 일꾼이 다니기 시작합니다.</p></div>';
  }
  function loadAll() {
    var mon = addDays(new Date(), -((new Date().getDay() + 6) % 7)), today = new Date();
    var pmon = addDays(mon, -7), psun = addDays(mon, -1);
    return Promise.all([
      api('GET', 'ax_tasks?select=*&order=created_at.desc&limit=300'),
      api('GET', 'church_settings?key=in.(ax_worker,ax_config)&select=key,data').catch(function () { return []; }),
      api('POST', 'rpc/ax_week_stats', { p_from: ymd(mon), p_to: ymd(today) }).catch(function () { return null; }),
      api('POST', 'rpc/ax_week_stats', { p_from: ymd(pmon), p_to: ymd(psun) }).catch(function () { return null; }),
      api('POST', 'rpc/app_open_forms', {}).catch(function () { return []; })
    ]).then(function (rs) {
      A.tasks = rs[0] || [];
      (rs[1] || []).forEach(function (r) { if (r.key === 'ax_worker') A.worker = r.data; if (r.key === 'ax_config') A.cfg = r.data || {}; });
      A.stats = rs[2] && rs[2].ok ? rs[2] : null; A.prev = rs[3] && rs[3].ok ? rs[3] : null; A.range = [mon, today];
      A.forms = rs[4] || [];
    });
  }
  function reload() { return loadAll().then(render).catch(function (e) { msg(e.message, true); }); }

  /* ── 그리기 ── */
  function render() {
    var box = ROOT; if (!box || !document.body.contains(box)) return;   // 다른 탭으로 옮겼으면 그리지 않는다
    var kt = $('ax_text'), kv = kt ? kt.value : '', kr = $('ax_role'), krv = kr && kr.dataset.touched ? kr.value : '', kd = $('ax_due'), kdv = kd ? kd.value : '';   // 적던 명령·고른 담당·기한은 다시 그려도 남긴다
    var review = A.tasks.filter(function (t) { return t.status === 'review'; });
    box.innerHTML =
      '<div class="ax-top">' + pulseHTML() + '<button type="button" class="btn btn-line" id="ax_reload" style="padding:6px 14px;font-size:.85rem">새로 고침</button></div>' +
      '<div class="ax-grid"><div>' +
      '<div class="ax-card"><h3>🔔 확인을 기다리는 일 ' + (review.length ? '<span class="ax-badge">' + review.length + '</span>' : '') + '</h3>' +
      (review.length ? review.map(taskHTML).join('') : '<p class="ax-empty">지금 확인하실 일은 없습니다.</p>') + '</div>' +
      cmdHTML() +
      '<div class="ax-card"><h3>📋 할 일 기록 <small>담당 카드를 누르면 그 담당 것만</small></h3>' + filterHTML() + '<div id="ax_list">' + listHTML() + '</div></div>' +
      '</div><div>' +
      '<div class="ax-card"><h3>👥 담당</h3><div class="ax-roles">' + ROLES.map(roleHTML).join('') + '</div></div>' +
      statsHTML() + agendaHTML() +
      '</div></div>';
    if (kv) $('ax_text').value = kv;
    if (krv) { $('ax_role').value = krv; $('ax_role').dataset.touched = '1'; }
    if (kdv) $('ax_due').value = kdv;
    $('ax_role').onchange = function () { this.dataset.touched = '1'; };
    bind();
  }
  function pulseHTML() {
    var at = A.worker && A.worker.at, cls = '', txt;
    if (!at) txt = 'AX 일꾼이 아직 한 번도 다녀가지 않았습니다 — 예약 작업을 걸어야 합니다';
    else { var min = (Date.now() - new Date(at).getTime()) / 60000; cls = min < 90 ? 'is-live' : 'is-late'; txt = 'AX 일꾼이 ' + ago(at) + ' 다녀갔습니다' + (min >= 90 ? ' (오래 쉬고 있습니다)' : ''); }
    var waiting = A.tasks.filter(function (t) { return t.status === 'queued' || t.status === 'approved'; }).length;
    return '<span class="ax-pulse ' + cls + '"><i></i>' + esc(txt) + '</span>' + (waiting ? '<span class="ax-pulse">⏳ 일꾼을 기다리는 일 ' + waiting + '건</span>' : '');
  }
  function taskHTML(t) {
    var r = roleOf(t.role), log = Array.isArray(t.log) ? t.log : [];
    var acts = '';
    if (t.status === 'review') {
      acts = (t.needs_approval && !t.approved_at ? '<button type="button" class="btn btn-solid" data-act="approve" data-id="' + t.id + '">✓ 승인 (이어서 진행)</button>' : '') +
        '<button type="button" class="btn ' + (t.needs_approval && !t.approved_at ? 'btn-line' : 'btn-solid') + '" data-act="done" data-id="' + t.id + '">끝으로 표시</button>' +
        '<button type="button" class="btn btn-line" data-act="redo" data-id="' + t.id + '">다시 해 주세요</button>' +
        '<button type="button" class="btn btn-line" data-act="cancel" data-id="' + t.id + '">취소</button>';
    } else if (t.status === 'queued' || t.status === 'approved') acts = '<button type="button" class="btn btn-line" data-act="cancel" data-id="' + t.id + '">취소</button>';
    else if (t.status === 'failed') acts = '<button type="button" class="btn btn-line" data-act="redo" data-id="' + t.id + '">다시 해 주세요</button><button type="button" class="btn btn-line" data-act="cancel" data-id="' + t.id + '">취소</button>';
    else if (t.status === 'working') acts = '<button type="button" class="btn btn-line" data-act="requeue" data-id="' + t.id + '">대기로 되돌리기</button>';
    return '<div class="ax-task' + (t.status === 'review' ? ' is-review' : '') + '" data-task="' + t.id + '">' +
      '<div class="ax-task-h"><div><div class="ax-task-t">' + r.ic + ' ' + esc(t.title) + '</div>' +
      '<div class="ax-task-m">#' + t.id + ' · ' + esc(r.name) + (t.due_date ? ' · 기한 ' + mdw(t.due_date) : '') + ' · ' + esc(ago(t.updated_at || t.created_at)) + (t.source === 'worker' ? ' · AX가 올림' : '') + (t.needs_approval ? (t.approved_at ? ' · 승인함' : ' · 승인 필요') : '') + '</div></div>' +
      '<span class="ax-pill ax-st-' + esc(t.status) + '">' + esc(ST[t.status] || t.status) + '</span></div>' +
      (t.detail ? '<div class="ax-task-b">' + linkify(t.detail) + '</div>' : '') +
      (t.result || t.result_url ? '<div class="ax-task-r">' + (t.result ? linkify(t.result) : '') + (t.result_url ? (t.result ? '\n' : '') + '🔗 <a href="' + esc(t.result_url) + '" target="_blank" rel="noopener">결과 열기</a>' : '') + '</div>' : '') +
      (acts ? '<div class="ax-acts">' + acts + '</div>' : '') +
      (log.length ? '<details><summary>진행 기록 ' + log.length + '</summary><ol class="ax-log">' + log.map(function (l) { return '<li>' + esc(String(l.at || '').slice(5, 16).replace('T', ' ')) + ' · ' + esc(l.by || '') + ' · ' + esc(ST[l.status] || l.status || '') + (l.note ? ' — ' + esc(l.note) : '') + '</li>'; }).join('') + '</ol></details>' : '') +
      '</div>';
  }
  function cmdHTML() {
    return '<div class="ax-card ax-cmd"><h3>✍️ 명령 내리기 <small>첫 줄이 제목이 됩니다</small></h3>' +
      '<textarea id="ax_text" placeholder="예) 11월 1일 주보 준비해 주세요. 설교 원고는 자료실 ‘주일예배’에 올렸습니다."></textarea>' +
      '<div class="ax-cmd-row"><label><span>담당</span><select id="ax_role"><option value="auto">🤖 AX가 알아서 나눔</option>' +
      ROLES.map(function (r) { return '<option value="' + r.k + '"' + (A.role === r.k ? ' selected' : '') + '>' + r.ic + ' ' + r.name + '</option>'; }).join('') +
      '<option value="other">✳️ 기타</option></select></label>' +
      '<label><span>기한 (선택)</span><input type="date" id="ax_due"></label></div>' +
      '<label class="ax-chk"><input type="checkbox" id="ax_appr" checked> 홈페이지 게시·성도 알림처럼 바깥으로 나가는 일은 제가 승인한 뒤에</label>' +
      '<div class="ax-acts"><button type="button" class="btn btn-solid" id="ax_send">명령 보내기</button></div>' +
      '<div class="ax-quick"><button type="button" class="btn btn-line" data-quick="week">🗂 이번 주 준비 시작</button>' +
      '<button type="button" class="btn btn-line" data-quick="report">📊 지난주 참여 보고</button>' +
      '<button type="button" class="btn btn-line" data-quick="qt">📖 다음 주 큐티 준비</button>' +
      '<button type="button" class="btn btn-line" data-quick="ssb">🧒 주일학교 주보 자료 정리</button></div>' +
      '<p class="ax-msg" id="ax_msg"></p></div>';
  }
  function filterHTML() {
    var F = [['open', '진행 중'], ['done', '끝'], ['all', '모두']];
    return '<div class="ax-filter">' + F.map(function (f) { return '<button type="button" data-filter="' + f[0] + '" class="' + (A.filter === f[0] ? 'is-on' : '') + '">' + f[1] + '</button>'; }).join('') +
      (A.role ? '<button type="button" data-filter-role="" class="is-on">' + esc(roleOf(A.role).name) + ' ✕</button>' : '') + '</div>';
  }
  function listHTML() {
    var rows = A.tasks.filter(function (t) {
      if (A.role && t.role !== A.role) return false;
      if (A.filter === 'open') return ['queued', 'working', 'approved', 'failed'].indexOf(t.status) >= 0;
      if (A.filter === 'done') return t.status === 'done' || t.status === 'cancelled';
      return true;
    });
    return rows.length ? rows.slice(0, 60).map(taskHTML).join('') : '<p class="ax-empty">해당하는 할 일이 없습니다.</p>';
  }
  function roleHTML(r) {
    var mine = A.tasks.filter(function (t) { return t.role === r.k; });
    var n = function (st) { return mine.filter(function (t) { return st.indexOf(t.status) >= 0; }).length; };
    var last = mine.filter(function (t) { return t.status === 'done' || t.status === 'review'; })[0];
    var line = [n(['queued', 'approved']) ? '대기 ' + n(['queued', 'approved']) : '', n(['working']) ? '작업 중 ' + n(['working']) : '', n(['review']) ? '확인 ' + n(['review']) : ''].filter(Boolean).join(' · ') || '쉬는 중';
    return '<button type="button" class="ax-role' + (A.role === r.k ? ' is-on' : '') + '" data-role="' + r.k + '"><b>' + r.ic + ' ' + esc(r.name) + '</b><span>' + esc(r.desc) + '</span><em>' + esc(line) + '</em>' +
      (last ? '<span>최근: ' + esc(last.title).slice(0, 40) + '</span>' : '') + '</button>';
  }
  function statsHTML() {
    if (!A.stats) return '<div class="ax-card"><h3>📊 이번 주 참여 현황</h3><p class="ax-empty">아직 셈할 수 없습니다.</p></div>';
    var s = A.stats.stats || {}, p = (A.prev && A.prev.stats) || {};
    var cells = STATS.filter(function (x) { return s[x[0]] != null; }).map(function (x) {
      var v = +s[x[0]] || 0, pv = p[x[0]] == null ? null : +p[x[0]] || 0, d = pv == null ? '' : v - pv;
      return '<div class="ax-stat"><b>' + v.toLocaleString() + (x[2] ? '<small style="display:inline;font-size:.8rem;color:#8B7F76"> ' + x[2] + '</small>' : '') + '</b><span>' + esc(x[1]) + '</span>' +
        (pv == null ? '' : '<small class="' + (d > 0 ? 'ax-up' : d < 0 ? 'ax-down' : 'ax-same') + '">지난주 ' + pv.toLocaleString() + (d ? ' (' + (d > 0 ? '+' : '') + d + ')' : '') + '</small>') + '</div>';
    });
    var att = s.attendance || {}, attKeys = Object.keys(att);
    if (attKeys.length) cells.push('<div class="ax-stat" style="grid-column:1/-1"><span>출석 (예배별 인원)</span><div style="font-size:.9rem;margin-top:4px">' + attKeys.map(function (k) { return esc(k) + ' <b style="display:inline;font-size:1rem">' + att[k] + '</b>명'; }).join(' · ') + '</div></div>');
    var ss = s.ss_certs || {}, ssKeys = Object.keys(ss);
    if (ssKeys.length) cells.push('<div class="ax-stat" style="grid-column:1/-1"><span>주일학교 인증</span><div style="font-size:.9rem;margin-top:4px">' + ssKeys.map(function (k) { return esc(k) + ' <b style="display:inline;font-size:1rem">' + ss[k] + '</b>회'; }).join(' · ') + '</div></div>');
    return '<div class="ax-card"><h3>📊 이번 주 참여 현황 <small>' + mdw(A.range[0]) + '~' + mdw(A.range[1]) + ' · 건수만</small></h3><div class="ax-stats">' + cells.join('') + '</div></div>';
  }
  function agendaHTML() {
    var items = [], sun = nextSunday();
    items.push({ d: sun, t: '주일 예배 · 주보·주일학교 주보 마감' });
    A.forms.forEach(function (f) { if (f.close_at) items.push({ d: new Date(f.close_at), t: '신청 마감 — ' + (f.title || '') }); });
    A.tasks.forEach(function (t) { if (t.due_date && ['done', 'cancelled'].indexOf(t.status) < 0) items.push({ d: new Date(t.due_date + 'T00:00:00'), t: '기한 — ' + roleOf(t.role).ic + ' ' + t.title }); });
    var now = new Date(); now.setHours(0, 0, 0, 0);
    items = items.filter(function (x) { return x.d >= now && x.d - now < 21 * 864e5; }).sort(function (a, b) { return a.d - b.d; });
    var cal = A.cfg && A.cfg.calendar_src && /^https:\/\/calendar\.google\.com\//.test(A.cfg.calendar_src)
      ? '<iframe class="ax-cal" src="' + esc(A.cfg.calendar_src) + '" title="교회 일정"></iframe>' : '';
    return '<div class="ax-card"><h3>🗓 다가오는 일정 <small>3주 안</small></h3>' +
      (items.length ? '<ul class="ax-agenda">' + items.slice(0, 14).map(function (x) { return '<li><span class="d">' + mdw(x.d) + '</span><span>' + esc(x.t) + '</span></li>'; }).join('') + '</ul>' : '<p class="ax-empty">다가오는 일정이 없습니다.</p>') +
      cal +
      '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:.82rem;color:#93867C">구글 캘린더 붙이기</summary>' +
      '<p class="ax-empty" style="font-size:.8rem;margin:6px 0">구글 캘린더 설정 › 캘린더 통합 › ‘삽입 코드’의 src 주소(https://calendar.google.com/calendar/embed?…)를 넣으세요.</p>' +
      '<div style="display:flex;gap:6px"><input type="text" id="ax_cal" value="' + esc((A.cfg && A.cfg.calendar_src) || '') + '" placeholder="https://calendar.google.com/calendar/embed?src=…" style="flex:1;font:inherit;font-size:.85rem;padding:6px 9px;border:1px solid #D9D1CB;border-radius:8px">' +
      '<button type="button" class="btn btn-line" id="ax_cal_save" style="padding:5px 12px;font-size:.82rem">저장</button></div></details></div>';
  }

  /* ── 동작 ── */
  function msg(t, err) { var e = $('ax_msg'); if (e) { e.textContent = t || ''; e.classList.toggle('is-err', !!err); } }
  function addTasks(list) {
    return api('POST', 'ax_tasks', list.map(function (x) {
      return { role: x.role || 'auto', title: x.title.slice(0, 200), detail: (x.detail || '').slice(0, 4000), due_date: x.due || null, needs_approval: x.appr !== false,
        log: [{ at: new Date().toISOString(), by: '목사님', status: 'queued', note: '명령' }] };
    }), 'return=minimal');
  }
  function patch(id, body, note) {
    var t = A.tasks.filter(function (x) { return x.id === id; })[0]; if (!t) return Promise.resolve();
    body.updated_at = new Date().toISOString();
    body.log = (Array.isArray(t.log) ? t.log : []).concat([{ at: body.updated_at, by: '목사님', status: body.status, note: note || '' }]);
    return api('PATCH', 'ax_tasks?id=eq.' + id, body, 'return=minimal');
  }
  function quick(kind) {
    var sun = ymd(nextSunday()), md = mdw(nextSunday());
    var mon = addDays(new Date(), -((new Date().getDay() + 6) % 7) - 7), sat = addDays(mon, 6);
    var Q = {
      week: [
        { role: 'bulletin', title: md + ' 주보 초안', detail: '설교 원고·광고를 모아 주보 초안을 만들어 주세요.', due: sun },
        { role: 'bulletin', title: md + ' 주일학교 주보 자료 정리', detail: '자료실 ‘주일학교’의 말씀 PDF·PPT를 확인하고 주일학교 주보(ss-bulletin.html) 준비 상태를 알려 주세요.', due: sun },
        { role: 'qt', title: '다음 주 새벽 QT 정리', detail: '노션 설교계획 DB의 다음 주 QT 페이지를 정리해 주세요.', due: sun },
        { role: 'youth', title: md + ' 중등부 교재', detail: '이번 주 설교 본문으로 중등부 학생용·교사용 교재를 만들어 주세요.', due: sun },
        { role: 'schedule', title: '이번 주 일정 정리', detail: '이번 주 일정과 신청서 마감·준비할 것을 정리해 주세요.', due: sun, appr: false },
        { role: 'report', title: '지난주 참여 현황 보고', detail: mdw(mon) + '~' + mdw(sat) + ' 참여 건수를 지지난주와 비교해 보고해 주세요.', appr: false }
      ],
      report: [{ role: 'report', title: '지난주 참여 현황 보고', detail: mdw(mon) + '~' + mdw(sat) + ' 참여 건수를 지지난주와 비교해 보고해 주세요.', appr: false }],
      qt: [{ role: 'qt', title: '다음 주 새벽 QT 정리', detail: '노션 설교계획 DB의 다음 주 QT 페이지를 정리해 주세요.', due: sun }],
      ssb: [{ role: 'bulletin', title: md + ' 주일학교 주보 자료 정리', detail: '자료실 ‘주일학교’의 말씀 PDF·PPT를 확인하고 주일학교 주보(ss-bulletin.html) 준비 상태를 알려 주세요.', due: sun }]
    }[kind];
    return Q;
  }
  function bind() {
    $('ax_reload').onclick = function () { reload(); };
    $('ax_send').onclick = function () {
      var raw = $('ax_text').value.trim(); if (!raw) { msg('명령을 적어 주세요.', true); return; }
      var lines = raw.split('\n'), title = lines[0].trim(), detail = lines.slice(1).join('\n').trim();
      if (title.length > 120) { detail = raw; title = title.slice(0, 60) + '…'; }
      var b = this; b.disabled = true; msg('보내는 중…');
      addTasks([{ role: $('ax_role').value, title: title, detail: detail, due: $('ax_due').value || null, appr: $('ax_appr').checked }])
        .then(function () { $('ax_text').value = ''; $('ax_due').value = ''; delete $('ax_role').dataset.touched; return reload(); }).then(function () { msg('보냈습니다. AX 일꾼이 다음에 깨어날 때 가져갑니다.'); })
        .catch(function (e) { b.disabled = false; msg('보내지 못했습니다: ' + e.message, true); });
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-quick]'), function (b) {
      b.onclick = function () {
        var list = quick(b.getAttribute('data-quick'));
        if (b.dataset.armed !== '1') { b.dataset.armed = '1'; var t0 = b.textContent; b.textContent = '할 일 ' + list.length + '개를 보냅니다 — 한 번 더'; setTimeout(function () { b.dataset.armed = ''; b.textContent = t0; }, 3500); return; }
        b.disabled = true; msg('보내는 중…');
        addTasks(list).then(function () { msg('할 일 ' + list.length + '개를 보냈습니다.'); return reload(); }).catch(function (e) { b.disabled = false; msg('보내지 못했습니다: ' + e.message, true); });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-role]'), function (b) {
      b.onclick = function () { var k = b.getAttribute('data-role'); A.role = A.role === k ? '' : k; render(); };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (b) { b.onclick = function () { A.filter = b.getAttribute('data-filter'); render(); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-filter-role]'), function (b) { b.onclick = function () { A.role = ''; render(); }; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-act]'), function (b) {
      b.onclick = function () {
        var id = +b.getAttribute('data-id'), act = b.getAttribute('data-act');
        if (act === 'redo') {
          var wrap = b.parentNode; if (wrap.querySelector('textarea')) return;
          var ta = document.createElement('textarea'); ta.placeholder = '무엇을 고쳐 주면 될까요? (예: 광고 3번을 빼 주세요)';
          var go = document.createElement('button'); go.type = 'button'; go.className = 'btn btn-solid'; go.textContent = '이대로 다시 맡기기';
          wrap.appendChild(ta); wrap.appendChild(go); ta.focus();
          go.onclick = function () {
            var note = ta.value.trim(), t = A.tasks.filter(function (x) { return x.id === id; })[0];
            go.disabled = true;
            patch(id, { status: 'queued', detail: ((t && t.detail) || '') + (note ? '\n\n[고쳐 주세요] ' + note : '') }, note || '다시 해 주세요').then(reload).catch(function (e) { go.disabled = false; alert(e.message); });
          };
          return;
        }
        if (act === 'cancel' && b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '한 번 더 누르면 취소'; setTimeout(function () { b.dataset.armed = ''; b.textContent = '취소'; }, 3000); return; }
        var body = act === 'approve' ? { status: 'approved', approved_at: new Date().toISOString() }
          : act === 'done' ? { status: 'done' } : act === 'cancel' ? { status: 'cancelled' } : act === 'requeue' ? { status: 'queued' } : null;
        if (!body) return;
        b.disabled = true;
        patch(id, body, { approve: '승인', done: '끝으로 표시', cancel: '취소', requeue: '대기로 되돌림' }[act]).then(reload).catch(function (e) { b.disabled = false; alert('바꾸지 못했습니다: ' + e.message); });
      };
    });
    var cs = $('ax_cal_save');
    if (cs) cs.onclick = function () {
      var v = $('ax_cal').value.trim();
      if (v && !/^https:\/\/calendar\.google\.com\//.test(v)) { alert('구글 캘린더 삽입 주소(https://calendar.google.com/…)만 넣을 수 있습니다.'); return; }
      A.cfg = Object.assign({}, A.cfg, { calendar_src: v });
      api('POST', 'church_settings?on_conflict=key', { key: 'ax_config', data: A.cfg, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal')
        .then(render).catch(function (e) { alert('저장하지 못했습니다: ' + e.message); });
    };
  }

  window.AXRoom = { mount: function (el) { ROOT = el; start(); } };
  function auto() { var el = $('axPage'); if (el) { ROOT = el; start(); } }   // ax.html 에서는 저절로
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
