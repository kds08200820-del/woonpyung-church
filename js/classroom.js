/* classroom.js — 강의실 (학습·세례(입교)·유아세례 교육과정, 2026-10-25 담임목사 지시)
 *  · 교재·문제은행: js/catechism-data.js (window.WPC_CATECHISM)
 *  · 화면(주소 #): 첫 화면 '#' · 과정 '#learn' · 장 '#learn/3' · 서약 문답 '#learn/vows' · 시험 '#learn/exam' · 결과 '#learn/result'
 *  · 진행 단계 네비게이션 바: 장 → 서약 문답 → 시험. 마친 단계는 채워지고 진행률(%)이 보인다
 *  · 시험: 과정 문제은행에서 20문항을 무작위로(장마다 한 문제 이상) · 문항당 5점 · 70점 이상 통과
 *  · 저장: 이 기기(localStorage)에 먼저, 로그인하면 서버(edu_progress_save · edu_exam_submit)에도 —
 *    통과하면 교적 매칭키와 함께 기록되어 목회행정 대시보드·교적 상세·자료실에 나타난다
 *    (supabase/20261025_1600_edu_classroom.sql — 실행 전에는 결과 저장만 '준비 중' 으로 안내)
 *  · 유아세례 과정(부모 교육)은 20261025_1800_edu_infant.sql 로 서버가 받는다 — 실행 전에는 이 기기에 먼저 보관
 *  · 재시험(2026-10-26 담임목사): 70점에 못 미치면 새 문제로 다시 본다. 앞선 응시 기록은 지우지 않고(서버 edu_exam_results 에 한 줄씩)
 *    '응시 기록'으로 보여 주며 회차마다 시험지를 다시 볼 수 있다. 통과한 과정은 다시 보지 않는다(하루 10번까지 — 서버가 센다)
 */
console.log('[classroom.js] v20261026rt1');

(function () {
  var C = window.WPC_CATECHISM;
  var root = document.getElementById('crRoot');
  if (!root || !C) return;
  var SB = String(window.SUPABASE_URL || '').replace(/\/$/, ''), AK = window.SUPABASE_ANON_KEY;
  var ORDER = ['learn', 'baptism', 'infant'];
  // 네비게이션 바에 쓰는 짧은 장 이름
  var SHORT = {
    learn: ['자격과 목적', '성경', '하나님', '창조', '죄', '예수 그리스도', '예배', '공적 예배', '성도의 생활', '주기도문·사도신경'],
    baptism: ['자격', '성경', '하나님', '사탄과 범죄', '예수님의 사역', '성령과 구원', '교회생활', '종말과 재림', '세례와 성찬', '성경교육·선교', '꼭 암송할 것'],
    infant: ['유아세례란', '세례의 뜻', '물과 성령', '믿음의 가정', '성찬과 입교']
  };
  // 과정별 단추 색: 학습 기본 · 세례 주황 · 유아세례 초록
  function tone(cid) { return cid === 'baptism' ? ' cr-gold' : cid === 'infant' ? ' cr-sage' : ''; }
  var VOW_STEP = 0;   // 서약 문답은 장 번호 0 으로 진도에 넣는다

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { d = d ? new Date(d) : new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function kdate(d) { d = new Date(d); return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ── 로그인 세션 · REST (forms.js 와 같은 방식 — SDK 없이 localStorage 토큰) ── */
  function ref() { try { return new URL(SB).hostname.split('.')[0]; } catch (e) { return ''; } }
  function sess() {
    try {
      var raw = localStorage.getItem('sb-' + ref() + '-auth-token');
      if (!raw) return null;
      var s = JSON.parse(raw); s = (s && s.currentSession) ? s.currentSession : s;
      if (!s || !s.access_token || !s.user) return null;
      var md = s.user.user_metadata || {};
      return { uid: s.user.id, token: s.access_token, name: md.name || md.full_name || md.nickname || '' };
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
  function api(method, path, body, retried) {
    if (!SB || !AK) return Promise.reject(new Error('no-config'));
    var s = sess(), h = { apikey: AK, 'Content-Type': 'application/json' };
    if (s) h.Authorization = 'Bearer ' + s.token;
    var opt = { method: method, headers: h };
    if (body) opt.body = JSON.stringify(body);
    var ctl = window.AbortController ? new AbortController() : null;
    if (ctl) { opt.signal = ctl.signal; setTimeout(function () { ctl.abort(); }, 12000); }
    return fetch(SB + '/rest/v1/' + path, opt).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        if (!retried && s && (r.status === 401 || /JWT expired|PGRST303|invalid (JWT|token)/i.test(t || ''))) {
          return refreshToken().then(function () { return api(method, path, body, true); });
        }
        var e = new Error(t || ('HTTP ' + r.status)); e.status = r.status; throw e;
      });
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }
  function rpc(name, args) { return api('POST', 'rpc/' + name, args || {}); }
  function notReady(e) { return /42P01|42883|PGRST20[0-9]|does not exist|schema cache|Could not find/i.test((e && e.message) || ''); }
  function openLogin() { var m = document.getElementById('authModal'); if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; } }

  /* ── 이 기기 저장(사람마다) ── */
  var S = sess();
  var LS_KEY = 'wpc_cr_v1_' + (S ? S.uid : 'guest');
  function loadLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  var L = loadLocal();
  L.prog = L.prog || {}; L.exam = L.exam || {}; L.last = L.last || {};
  function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(L)); } catch (e) { } }

  /* ── 서버 상태 ── */
  var SV = { ready: null, results: [], certs: [], loaded: false };
  function doneOf(cid) { return (L.prog[cid] || []).slice(); }
  function passedOf(cid) {
    var r = SV.results.filter(function (x) { return x.course === cid && x.passed; })[0];
    if (r) return { score: r.score, at: r.created_at, id: r.id };
    var l = L.last[cid];
    return l && l.passed ? { score: l.score, at: l.at, id: l.id || null, local: !l.id } : null;
  }
  // 응시 기록(오래된 것부터): 서버에 저장된 회차 + 아직 이 기기에만 있는 마지막 결과
  function triesOf(cid) {
    var list = SV.results.filter(function (r) { return r.course === cid; }).slice().sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); });
    var l = L.last[cid];
    if (l && !l.id && l.sheet) list.push({ id: null, course: cid, score: l.score, passed: l.passed, created_at: l.at, local: true });
    return list;
  }
  function failsOf(cid) { return triesOf(cid).filter(function (r) { return !r.passed; }); }
  function bestOf(list) { return list.length ? Math.max.apply(null, list.map(function (r) { return +r.score || 0; })) : null; }
  function historyHTML(cid, curId) {
    var list = triesOf(cid); if (!list.length) return '';
    return '<section class="cr-hist" aria-label="응시 기록"><h3 class="cr-sub-h">응시 기록 <small>지난 기록은 지워지지 않고 그대로 남습니다</small></h3><ol>' +
      list.map(function (r, i) {
        var url = r.id ? 'edu-print.html?sheet=' + r.id : 'edu-print.html?local=' + cid;
        return '<li class="' + (r.passed ? 'is-pass' : 'is-fail') + (curId && r.id === curId ? ' is-cur' : '') + '"><span class="n">' + (i + 1) + '회</span>' +
          '<span class="d">' + esc(kdate(r.created_at)) + (r.local ? ' · 이 기기에 보관' : '') + '</span><b>' + esc(r.score) + '점</b>' +
          '<span class="r">' + (r.passed ? '통과' : '미달') + '</span><a class="cr-line cr-sm" href="' + url + '" target="_blank" rel="noopener">시험지</a></li>';
      }).join('') + '</ol></section>';
  }
  function loadServer() {
    if (!S) { SV.loaded = true; return Promise.resolve(); }
    return Promise.all([
      api('GET', 'edu_course_progress?select=course,done'),
      api('GET', 'edu_exam_results?select=id,course,score,correct,total,passed,created_at&order=created_at.desc&limit=60'),
      api('GET', 'edu_certificates?select=id,cert_no,kind,member_name,issued_on,voided_at&order=issued_on.desc').catch(function () { return []; })
    ]).then(function (res) {
      SV.ready = true;
      var changed = {};
      (res[0] || []).forEach(function (row) {
        var mine = L.prog[row.course] || [], srv = Array.isArray(row.done) ? row.done : [];
        var u = {}; mine.concat(srv).forEach(function (n) { u[n] = 1; });
        var merged = Object.keys(u).map(Number).sort(function (a, b) { return a - b; });
        if (merged.length !== srv.length) changed[row.course] = 1;
        L.prog[row.course] = merged;
      });
      ORDER.forEach(function (cid) { if ((L.prog[cid] || []).length && !(res[0] || []).some(function (r) { return r.course === cid; })) changed[cid] = 1; });
      SV.results = res[1] || [];
      SV.certs = (res[2] || []).filter(function (c) { return !c.voided_at; });
      saveLocal();
      Object.keys(changed).forEach(pushProgress);
      // 이 기기에만 남은 통과 기록(서버 준비 전 결과)이 있으면 서버에 늦게라도 올린다
      ORDER.forEach(function (cid) {
        var l = L.last[cid];
        if (l && l.passed && !l.id && !SV.results.some(function (r) { return r.course === cid && r.passed; })) submitServer(cid, l).then(function () { render(); }, function () { });
      });
    }).catch(function (e) { SV.ready = notReady(e) ? false : null; }).then(function () { SV.loaded = true; });
  }
  var pushTimers = {};
  function pushProgress(cid) {
    if (!S || SV.ready === false) return;
    clearTimeout(pushTimers[cid]);
    pushTimers[cid] = setTimeout(function () {
      rpc('edu_progress_save', { p_course: cid, p_done: L.prog[cid] || [] }).then(function () { SV.ready = true; }, function (e) { if (notReady(e)) SV.ready = false; });
    }, 400);
  }
  function markDone(cid, n) {
    var d = L.prog[cid] || [];
    if (d.indexOf(n) < 0) { d.push(n); d.sort(function (a, b) { return a - b; }); L.prog[cid] = d; saveLocal(); pushProgress(cid); }
  }

  /* ── 과정 단계 계산 ── */
  function steps(cid) {
    var c = C.courses[cid], d = doneOf(cid), pass = passedOf(cid);
    var list = c.chapters.map(function (ch, i) { return { key: String(ch.no), n: ch.no, label: SHORT[cid][i] || ch.title, title: ch.title, done: d.indexOf(ch.no) >= 0 }; });
    list.push({ key: 'vows', n: VOW_STEP, label: '서약 문답', title: '서약 문답 미리 보기', done: d.indexOf(VOW_STEP) >= 0, vows: true });
    var lessonsDone = list.every(function (s) { return s.done; });
    list.push({ key: 'exam', label: pass ? '이수 완료' : '시험', title: '이수 시험', done: !!pass, exam: true, lock: !lessonsDone && !pass, pass: !!pass });
    return list;
  }
  function pct(cid) { var st = steps(cid), n = st.filter(function (s) { return s.done; }).length; return { done: n, total: st.length, pct: Math.round(n / st.length * 100) }; }
  function firstTodo(cid) { var st = steps(cid); for (var i = 0; i < st.length; i++) if (!st[i].done && !st[i].lock) return st[i].key; return st[st.length - 1].key; }

  /* ── 머리글 높이만큼 네비게이션 바를 내린다 ── */
  function syncTop() { var h = document.getElementById('header'); if (h) document.documentElement.style.setProperty('--cr-top', (h.offsetHeight || 64) + 'px'); }
  window.addEventListener('resize', syncTop);
  setTimeout(syncTop, 300);
  if (window.ResizeObserver) setTimeout(function () { var h = document.getElementById('header'); if (h) new ResizeObserver(syncTop).observe(h); }, 0);

  /* ── 주소(#) 로 화면 고르기 ── */
  function route() {
    var h = decodeURIComponent((location.hash || '').replace(/^#\/?/, '')), p = h.split('/');
    var cid = C.courses[p[0]] ? p[0] : null;
    return { cid: cid, step: cid ? (p[1] || '') : '' };
  }
  function go(hash, replace) {
    if (replace) { history.replaceState(null, '', hash); render(); }
    else if (location.hash === hash) render();
    else location.hash = hash;
  }
  // 화면이 바뀌면 맨 위로 — 과정 화면은 히어로를 건너뛰어 진행 막대·본문 첫머리가 머리글 바로 아래에 오게
  function toTop() {
    var y = 0, h = document.getElementById('header');
    if (route().cid) y = Math.max(0, root.getBoundingClientRect().top + window.pageYOffset - (h ? h.offsetHeight : 0) - 12);
    try { window.scrollTo({ top: y, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); }
  }
  window.addEventListener('hashchange', function () { render(); toTop(); });

  function render() {
    var r = route();
    if (!r.cid) return renderHome();
    if (!S) return renderNeedLogin(r.cid);
    if (!r.step) return go('#' + r.cid + '/' + firstTodo(r.cid), true);
    if (r.step === 'exam') return renderExam(r.cid);
    if (r.step === 'result') return renderResult(r.cid);
    if (r.step === 'vows') return renderVows(r.cid);
    var no = parseInt(r.step, 10), ch = C.courses[r.cid].chapters.filter(function (x) { return x.no === no; })[0];
    if (!ch) return go('#' + r.cid, true);
    renderLesson(r.cid, ch);
  }

  /* ═════════════ 첫 화면 ═════════════ */
  function renderHome() {
    var html = '<div class="cr-wrap is-home">' +
      '<section class="cr-guide" aria-labelledby="crGuideT"><h2 id="crGuideT">강의실은 이렇게 진행됩니다</h2>' +
      '<p>대한예수교장로회총회 「학습·세례문답서」를 한 장씩 친절한 풀이와 함께 배웁니다. 공부한 곳은 위쪽 진행 막대에 표시되고, 다 마치면 시험을 봅니다.</p>' +
      '<ol class="cr-flow">' +
      '<li><b>과정 고르기</b>학습 · 세례(입교) · 유아세례(부모)</li>' +
      '<li><b>장마다 공부</b>문답 원문과 풀이</li>' +
      '<li><b>서약 문답</b>예식 때 드릴 고백 미리 보기</li>' +
      '<li><b>이수 시험</b>20문항 · 70점 이상 통과</li>' +
      '<li class="is-church"><b>교적에 이수 기록</b>목회자가 확인</li>' +
      '<li class="is-church"><b>당회 문답·예식</b>증명서 발급</li>' +
      '</ol></section>' +
      (S && SV.ready === false ? '<p class="cr-warn">강의실 기록 저장을 준비하고 있습니다. 공부와 시험은 지금도 할 수 있고, 결과는 이 기기에 먼저 보관됩니다.</p>' : '') +
      '<div class="cr-courses">' + ORDER.map(courseCard).join('') + '</div>' +
      (S ? mineHTML() : '<div class="cr-card" style="margin-top:22px"><h2>로그인하고 시작하세요</h2><p>공부한 진도와 시험 결과는 내 계정에 기록되어 교적에 이수로 남습니다.</p><div class="cr-acts"><button type="button" class="cr-btn" data-login>로그인</button></div></div>') +
      '<p class="cr-note">' + esc(C.source) + ' 이 강의실의 이수는 교육을 마쳤다는 기록이며, 학습·세례(입교)·유아세례는 당회의 문답과 예식을 거쳐 받습니다.</p>' +
      '</div>';
    root.innerHTML = html;
    bindLogin();
  }
  function courseCard(cid) {
    var c = C.courses[cid], p = pct(cid), pass = passedOf(cid), started = doneOf(cid).length > 0;
    var st = steps(cid), lessonsDone = !st[st.length - 1].lock;
    var fails = pass ? [] : failsOf(cid);
    var badge = pass ? '<span class="cr-badge is-pass">✓ 이수 완료 ' + pass.score + '점</span>' :
      fails.length ? '<span class="cr-badge is-retry">재시험 가능 · 최고 ' + bestOf(fails) + '점</span>' :
      (lessonsDone ? '<span class="cr-badge is-ready">시험을 볼 수 있습니다</span>' : (started ? '<span class="cr-badge">공부 중</span>' : ''));
    var label = !S ? '로그인하고 시작하기' : pass ? '과정 다시 보기' : lessonsDone ? (fails.length ? '재시험 보기' : '이수 시험 보기') : started ? '이어서 공부하기' : '공부 시작하기';
    return '<article class="cr-course is-' + cid + '">' +
      '<p class="cr-c-part">' + esc(c.part) + '</p><h2>' + esc(c.title) + '</h2>' +
      '<p class="cr-c-sub">' + esc(c.sub) + ' · 이수 시험 ' + C.exam.count + '문항</p>' +
      '<p class="cr-c-lead">' + esc(c.lead) + '</p>' +
      '<p class="cr-c-who"><b>대상</b>' + esc(c.who) + '</p>' +
      '<div class="cr-c-prog"><div class="cr-c-stat"><span>' + (badge || '진행률') + '</span><b>' + p.pct + '%</b></div>' +
      '<div class="cr-bar" role="progressbar" aria-label="' + esc(c.title) + ' 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.pct + '"><i style="width:' + p.pct + '%"></i></div>' +
      '<a class="cr-btn' + tone(cid) + '" href="#' + cid + (pass ? '/1' : fails.length && lessonsDone ? '/exam' : '') + '"' + (!S ? ' data-login' : '') + '>' + esc(label) + '</a></div>' +
      '</article>';
  }
  function mineHTML() {
    var rows = [];
    ORDER.forEach(function (cid) {
      var c = C.courses[cid], pass = passedOf(cid);
      if (pass) rows.push('<li><span><b>' + esc(c.title) + '</b> 이수 · ' + pass.score + '점<small>' + esc(kdate(pass.at)) + '</small></span>' +
        '<a class="cr-line cr-sm" href="' + (pass.id ? 'edu-print.html?sheet=' + pass.id : 'edu-print.html?local=' + cid) + '" target="_blank" rel="noopener">시험지·결과 보기</a></li>');
      var tries = SV.results.filter(function (r) { return r.course === cid && !r.passed; }).length;
      if (!pass && tries) rows.push('<li><span><b>' + esc(c.title) + '</b> 시험 ' + tries + '회 응시<small>최고 ' + Math.max.apply(null, SV.results.filter(function (r) { return r.course === cid; }).map(function (r) { return r.score; })) + '점</small></span><a class="cr-line cr-sm" href="#' + cid + '/exam">재시험 보기</a></li>');
    });
    SV.certs.forEach(function (ct) {
      rows.push('<li><span><b>' + esc(ct.kind === '유아세례' ? '유아세례 증명서' + (ct.member_name ? ' (' + ct.member_name + ')' : '') : ct.kind + '교인 증명서') + '</b> 제 ' + esc(ct.cert_no) + ' 호<small>' + esc(ct.issued_on) + ' 발급</small></span><a class="cr-line cr-sm" href="edu-print.html?cert=' + ct.id + '" target="_blank" rel="noopener">증명서 보기</a></li>');
    });
    return '<section class="cr-mine" aria-labelledby="crMineT"><h2 id="crMineT">내 기록</h2>' +
      (rows.length ? '<ul class="cr-mine-list">' + rows.join('') + '</ul>' : '<p class="cr-note" style="margin:0">아직 이수한 과정이 없습니다. 위에서 과정을 골라 시작해 보세요.</p>') +
      '</section>';
  }
  function bindLogin() { Array.prototype.forEach.call(root.querySelectorAll('[data-login]'), function (b) { b.addEventListener('click', function (e) { e.preventDefault(); openLogin(); }); }); }
  function renderNeedLogin(cid) {
    var c = C.courses[cid];
    root.innerHTML = '<div class="cr-wrap"><div class="cr-card"><h2>' + esc(c.title) + '</h2><p>강의실은 로그인한 뒤 들어올 수 있습니다. 공부한 진도와 시험 결과가 내 계정에 기록됩니다.</p>' +
      '<div class="cr-acts"><button type="button" class="cr-btn" data-login>로그인</button><a class="cr-line" href="#">강의실 첫 화면</a></div></div></div>';
    bindLogin();
  }

  /* ═════════════ 진행 단계 네비게이션 바 ═════════════ */
  function navHTML(cid, curKey) {
    var c = C.courses[cid], st = steps(cid), p = pct(cid);
    return '<nav class="cr-nav is-' + cid + '" aria-label="' + esc(c.title) + ' 진행 단계">' +
      '<div class="cr-nav-top"><a class="cr-nav-back" href="#">‹ 강의실</a><span class="cr-nav-title">' + esc(c.title) + '</span>' +
      '<span class="cr-nav-pct"><b>' + p.pct + '%</b> · ' + p.done + '/' + p.total + '단계</span></div>' +
      '<div class="cr-bar' + (cid !== 'learn' ? ' is-' + cid : '') + '" role="progressbar" aria-label="진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.pct + '"><i style="width:' + p.pct + '%"></i></div>' +
      '<ol class="cr-steps">' + st.map(function (s) {
        var cls = 'cr-step' + (s.done ? ' is-done' : '') + (s.key === curKey ? ' is-cur' : '') + (s.lock ? ' is-lock' : '') + (s.exam ? ' is-exam' : '') + (s.pass ? ' is-pass' : '');
        var num = s.exam ? (s.pass ? '✓' : '시험') : s.vows ? '서약' : String(s.n);
        var state = s.done ? '마침' : s.lock ? '잠김' : '아직';
        return '<li><a class="' + cls + '" href="#' + cid + '/' + s.key + '" title="' + esc(s.title) + '"' + (s.key === curKey ? ' aria-current="step"' : '') + '>' +
          '<span class="n" style="' + (s.exam || s.vows ? 'font-size:.66rem' : '') + '">' + esc(num) + '</span><span class="t">' + esc(s.label) + '</span><span class="cr-sr"> (' + state + ')</span></a></li>';
      }).join('') + '</ol></nav>';
  }
  function centerCurrentStep() {
    var ol = root.querySelector('.cr-steps'), cur = ol && ol.querySelector('.is-cur');
    if (ol && cur && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = cur.parentNode.offsetLeft - (ol.clientWidth - cur.parentNode.offsetWidth) / 2;
  }
  function stepNeighbors(cid, key) {
    var st = steps(cid), i = 0;
    for (; i < st.length; i++) if (st[i].key === key) break;
    return { prev: st[i - 1] || null, next: st[i + 1] || null };
  }

  /* ═════════════ 장(강의) ═════════════ */
  function answerHTML(a) {
    if (!a) return '';
    if (Array.isArray(a)) return a.length === 1 ? esc(a[0]) : '<ol>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';
    return esc(a);
  }
  function reciteHTML(lines, isTen) {
    return '<div class="cr-recite' + (isTen ? ' is-ten' : '') + '"><div class="cr-recite-bar"><span>가린 줄을 누르면 하나씩 보입니다</span>' +
      '<button type="button" class="cr-line cr-sm" data-recite>가리고 외워 보기</button></div>' +
      '<ol class="cr-lines">' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ol></div>';
  }
  function renderLesson(cid, ch) {
    var c = C.courses[cid], key = String(ch.no), nb = stepNeighbors(cid, key), isDone = doneOf(cid).indexOf(ch.no) >= 0;
    var first = ch.qa[0].n, last = ch.qa[ch.qa.length - 1].n;
    var html = '<div class="cr-wrap">' + navHTML(cid, key) +
      '<article class="cr-lesson">' +
      '<header class="cr-l-head"><p class="cr-l-eye">' + esc(c.part) + ' · 제' + ch.no + '장</p><h2>' + esc(ch.title) + '</h2>' +
      '<p class="cr-l-meta">' + (ch.meta ? '제2편 ' + esc(ch.meta) + ' — 문답 ' + ch.qa.length + '개' : '문답 ' + first + (last !== first ? '~' + last : '') + ' · ' + ch.qa.length + '문') + '</p></header>' +
      '<section class="cr-l-intro"><h3>📖 이 장의 풀이</h3>' + ch.intro.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') + '</section>' +
      '<ol class="cr-qa">' + ch.qa.map(function (q) {
        return '<li class="cr-q"><div class="cr-q-h"><span class="cr-q-n' + (q.src ? ' is-src' : '') + '">' + (q.src ? esc(q.src) + ' ' : '') + q.n + '문</span><b>' + esc(q.q) + '</b></div>' +
          (q.a ? '<div class="cr-q-a">' + answerHTML(q.a) + '</div>' : '') +
          (q.recite ? reciteHTML(q.recite, q.recite.length < 14 && q.recite[0].length > 40) : '') +
          (q.tip ? '<div class="cr-q-tip"><span>풀이</span>' + esc(q.tip) + '</div>' : '') + '</li>';
      }).join('') + '</ol>' +
      (ch.verse ? '<aside class="cr-verse"><h3 class="cr-sub-h">기억할 말씀</h3><p>“' + esc(ch.verse.text) + '”</p><cite>' + esc(ch.verse.ref) + '</cite></aside>' : '') +
      (ch.think && ch.think.length ? '<aside class="cr-think"><h3 class="cr-sub-h">생각해 볼 질문</h3><ul>' + ch.think.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></aside>' : '') +
      '<div class="cr-l-foot">' +
      (nb.prev ? '<a class="cr-line" href="#' + cid + '/' + nb.prev.key + '">‹ ' + esc(nb.prev.label) + '</a>' : '<a class="cr-line" href="#">‹ 강의실</a>') +
      (isDone ? '<span class="cr-done-msg">✓ 마친 장입니다</span>' : '') +
      '<button type="button" class="cr-btn' + tone(cid) + '" data-done>' + (isDone ? '다음으로 ›' : '이 장을 마쳤어요 ✓') + '</button>' +
      '</div></article></div>';
    root.innerHTML = html;
    centerCurrentStep();
    bindRecite();
    root.querySelector('[data-done]').onclick = function () {
      markDone(cid, ch.no);
      var nx = stepNeighbors(cid, key).next;
      go('#' + cid + '/' + (nx ? nx.key : 'exam'));
    };
  }
  function bindRecite() {
    Array.prototype.forEach.call(root.querySelectorAll('.cr-recite'), function (box) {
      var b = box.querySelector('[data-recite]');
      b.onclick = function () {
        var on = box.classList.toggle('is-hidden');
        Array.prototype.forEach.call(box.querySelectorAll('li'), function (li) { li.classList.remove('is-shown'); });
        b.textContent = on ? '모두 보기' : '가리고 외워 보기';
      };
      Array.prototype.forEach.call(box.querySelectorAll('li'), function (li) {
        li.onclick = function () { if (box.classList.contains('is-hidden')) li.classList.add('is-shown'); };
      });
    });
  }

  /* ═════════════ 서약 문답 ═════════════ */
  function renderVows(cid) {
    var c = C.courses[cid], nb = stepNeighbors(cid, 'vows'), isDone = doneOf(cid).indexOf(VOW_STEP) >= 0;
    var html = '<div class="cr-wrap">' + navHTML(cid, 'vows') +
      '<article class="cr-lesson">' +
      '<header class="cr-l-head"><p class="cr-l-eye">제3편 부록</p><h2>서약 문답 미리 보기</h2><p class="cr-l-meta">' + (cid === 'learn' ? '학습 문답' : cid === 'infant' ? '유아·어린이 세례 문답 (부모의 서약)' : '세례 문답 · 입교 문답 · 유아·어린이 세례 문답') + '</p></header>' +
      '<section class="cr-l-intro"><h3>📖 예식 때 이렇게 묻고 답합니다</h3><p>' + esc(C.vowNote) + '</p>' +
      (cid === 'infant' ? '<p>유아·어린이 세례 때에는 아이 대신 부모가 세 가지를 묻고 답합니다. 아이에게 그리스도의 피로 씻음과 성령으로 거듭나는 은혜가 필요함을 인정하고, 아이가 하나님의 언약의 자손임을 믿으며, 아이를 하나님께 바치고 모범과 기도와 말씀으로 기르기를 서약합니다. 부모 두 분이 함께 읽어 보십시오.</p>' :
       cid === 'baptism' ? '<p>세례를 받는 분은 ‘세례 문답’, 어려서 세례를 받고 입교하는 분은 ‘입교 문답’으로 서약합니다. ‘유아·어린이 세례 문답’은 자녀에게 세례를 받게 하는 부모가 드리는 서약으로, 장차 부모가 될 세례교인이 함께 알아 두면 좋습니다.</p>' : '<p>학습 문답은 네 가지입니다. 하나님을 믿는 고백, 예수님이 나의 구주이심을 믿는 고백, 말씀대로 살겠다는 다짐, 주일과 예배와 기도를 힘쓰겠다는 작정입니다.</p>') +
      '</section>' +
      c.vows.map(function (k) {
        var v = C.vows[k];
        return '<section class="cr-vow"><h3>' + esc(v.title) + '<small>' + esc(v.sub) + '</small></h3><ol>' +
          v.items.map(function (it) { return '<li>' + esc(it) + '<em>답: 예</em></li>'; }).join('') + '</ol></section>';
      }).join('') +
      '<div class="cr-l-foot">' +
      (nb.prev ? '<a class="cr-line" href="#' + cid + '/' + nb.prev.key + '">‹ ' + esc(nb.prev.label) + '</a>' : '<span></span>') +
      (isDone ? '<span class="cr-done-msg">✓ 읽은 단계입니다</span>' : '') +
      '<button type="button" class="cr-btn' + tone(cid) + '" data-done>' + (isDone ? '시험으로 ›' : '잘 읽었습니다 ✓') + '</button>' +
      '</div></article></div>';
    root.innerHTML = html;
    centerCurrentStep();
    root.querySelector('[data-done]').onclick = function () { markDone(cid, VOW_STEP); go('#' + cid + '/exam'); };
  }

  /* ═════════════ 시험 ═════════════ */
  function makeExam(cid) {
    var c = C.courses[cid], n = C.exam.count, byCh = {}, picked = [], used = {};
    c.bank.forEach(function (b) { (byCh[b.ch] = byCh[b.ch] || []).push(b); });
    // 장마다 한 문제씩 먼저(장 순서는 섞어서) → 남은 자리는 나머지에서 무작위로
    shuffle(Object.keys(byCh)).forEach(function (k) { if (picked.length < n) { var b = byCh[k][Math.floor(Math.random() * byCh[k].length)]; picked.push(b); used[b.id] = 1; } });
    var rest = shuffle(c.bank.filter(function (b) { return !used[b.id]; }));
    while (picked.length < n && rest.length) picked.push(rest.shift());
    picked.sort(function (a, b) { return a.ch - b.ch; });
    return picked.map(function (b) {
      var o, a;
      if (b.ox) { o = ['O (맞다)', 'X (틀리다)']; a = b.a ? 0 : 1; }
      else { var idx = shuffle(b.o.map(function (_, i) { return i; })); o = idx.map(function (i) { return b.o[i]; }); a = idx.indexOf(0); }
      return { id: b.id, ch: b.ch, q: b.q, o: o, a: a, p: null };
    });
  }
  function bankItem(cid, id) { return C.courses[cid].bank.filter(function (b) { return b.id === id; })[0] || null; }
  function renderExam(cid) {
    var c = C.courses[cid], st = steps(cid), exam = st[st.length - 1], pass = passedOf(cid), fails = failsOf(cid);
    if (pass) return renderPassed(cid, pass);
    var ex = L.exam[cid];
    if (ex && ex.sheet && ex.sheet.length === C.exam.count) return renderQuestion(cid, ex.cur || 0);
    var todo = st.filter(function (s) { return !s.exam && !s.done; });
    var html = '<div class="cr-wrap">' + navHTML(cid, 'exam') +
      '<article class="cr-lesson cr-exam-intro">' +
      '<header class="cr-l-head"><p class="cr-l-eye">' + esc(c.title) + '</p><h2>이수 시험</h2><p class="cr-l-meta">문제은행에서 무작위로 출제됩니다. 볼 때마다 문제가 달라집니다.</p></header>' +
      '<ul style="margin-top:18px"><li><b>' + C.exam.count + '</b>문항</li><li><b>' + (100 / C.exam.count) + '</b>점씩</li><li><b>' + C.exam.pass + '</b>점 이상 통과</li><li><b>' + c.bank.length + '</b>문제 은행</li></ul>' +
      (exam.lock ? '<p class="cr-warn">아래 단계를 마치면 시험을 볼 수 있습니다.</p><ul class="cr-todo">' + todo.map(function (s) {
        return '<li><span>' + (s.vows ? '서약 문답' : '제' + s.n + '장 ' + esc(s.title)) + '</span><a class="cr-line cr-sm" href="#' + cid + '/' + s.key + '">공부하기</a></li>';
      }).join('') + '</ul>' :
        (fails.length ? '<p class="cr-retry"><b>재시험</b>지난 시험 ' + fails.length + '회 · 최고 ' + bestOf(fails) + '점 — ' + C.exam.pass + '점에 못 미쳐 다시 봅니다. 새 문제가 나오며, 지난 기록은 지워지지 않고 그대로 남습니다.</p>' : '') +
        '<p class="cr-note" style="margin:0 0 16px">모든 장을 마쳤습니다. 준비가 되면 시작하세요. 시험 중에 창을 닫아도 이 기기에서 이어서 볼 수 있습니다. 통과하면 교적에 이수가 기록되고, 목회자가 확인한 뒤 당회 문답을 안내합니다.</p>' +
        '<div class="cr-acts"><button type="button" class="cr-btn' + tone(cid) + '" data-start>' + (fails.length ? '재시험 시작하기' : '시험 시작하기') + '</button><a class="cr-line" href="#' + cid + '/1">처음부터 복습하기</a></div>') +
      historyHTML(cid) +
      '</article></div>';
    root.innerHTML = html;
    centerCurrentStep();
    var sb = root.querySelector('[data-start]');
    if (sb) sb.onclick = function () {
      L.exam[cid] = { sheet: makeExam(cid), started: new Date().toISOString(), cur: 0, ver: C.version };
      saveLocal();
      renderQuestion(cid, 0);
      toTop();
    };
  }
  function renderQuestion(cid, i) {
    var c = C.courses[cid], ex = L.exam[cid], sh = ex.sheet, q = sh[i], n = sh.length;
    ex.cur = i; saveLocal();
    var answered = sh.filter(function (x) { return x.p != null; }).length;
    var chT = (c.chapters.filter(function (x) { return x.no === q.ch; })[0] || {}).title || '';
    var isOx = q.o.length === 2 && /^O /.test(q.o[0]);
    var html = '<div class="cr-wrap">' + navHTML(cid, 'exam') +
      '<div class="cr-ex">' +
      '<div class="cr-ex-top"><b>' + esc(c.title) + ' 이수 시험</b><span>답한 문항 ' + answered + '/' + n + '</span></div>' +
      '<ol class="cr-dots" aria-label="문항 바로 가기">' + sh.map(function (x, k) {
        return '<li><button type="button" class="cr-dot' + (x.p != null ? ' is-ans' : '') + (k === i ? ' is-cur' : '') + '" data-go="' + k + '" aria-label="' + (k + 1) + '번' + (x.p != null ? ' (답함)' : '') + '"' + (k === i ? ' aria-current="true"' : '') + '>' + (k + 1) + '</button></li>';
      }).join('') + '</ol>' +
      '<p class="cr-ex-n"><b>문제 ' + (i + 1) + '</b> / ' + n + ' · 제' + q.ch + '장 ' + esc(chT) + '</p>' +
      '<h3 class="cr-ex-q" id="crQ">' + esc(q.q) + '</h3>' +
      '<div class="cr-opts' + (isOx ? ' is-ox' : '') + '" role="radiogroup" aria-labelledby="crQ">' + q.o.map(function (o, k) {
        return '<button type="button" class="cr-opt" role="radio" aria-checked="' + (q.p === k) + '" data-pick="' + k + '">' + (isOx ? '' : '<span class="k">' + (k + 1) + '</span>') + '<span>' + esc(o) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="cr-ex-foot">' +
      '<button type="button" class="cr-line" data-prev' + (i === 0 ? ' disabled' : '') + '>‹ 이전 문제</button>' +
      (i < n - 1 ? '<button type="button" class="cr-btn" data-next>다음 문제 ›</button>' : '<button type="button" class="cr-btn cr-gold" data-submit>제출하기</button>') +
      '</div>' +
      (i < n - 1 && answered === n ? '<div class="cr-acts" style="justify-content:center;margin-top:12px"><button type="button" class="cr-btn cr-gold" data-submit>모두 답했습니다 · 제출하기</button></div>' : '') +
      '</div></div>';
    root.innerHTML = html;
    centerCurrentStep();
    Array.prototype.forEach.call(root.querySelectorAll('[data-pick]'), function (b) {
      b.onclick = function () {
        q.p = Number(b.dataset.pick); saveLocal();
        // 고르면 잠깐 보여 주고 다음 문제로
        Array.prototype.forEach.call(root.querySelectorAll('[data-pick]'), function (x) { x.setAttribute('aria-checked', String(x === b)); });
        setTimeout(function () { if (route().step === 'exam' && L.exam[cid] === ex) renderQuestion(cid, i < n - 1 ? i + 1 : i); }, 260);
      };
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-go]'), function (b) { b.onclick = function () { renderQuestion(cid, Number(b.dataset.go)); }; });
    var pv = root.querySelector('[data-prev]'); if (pv) pv.onclick = function () { if (i > 0) renderQuestion(cid, i - 1); };
    var nx = root.querySelector('[data-next]'); if (nx) nx.onclick = function () { renderQuestion(cid, i + 1); };
    Array.prototype.forEach.call(root.querySelectorAll('[data-submit]'), function (b) { b.onclick = function () { submitExam(cid, b); }; });
    var cur = root.querySelector('.cr-opt[aria-checked="true"]') || root.querySelector('.cr-opt');
    if (cur && document.activeElement && document.activeElement !== document.body) cur.focus({ preventScroll: true });
  }
  function grade(sheet) {
    var ok = sheet.filter(function (x) { return x.p != null && x.p === x.a; }).length;
    return { correct: ok, score: ok * 100 / sheet.length };
  }
  function submitServer(cid, rec) {
    return rpc('edu_exam_submit', { p_course: cid, p_sheet: rec.sheet, p_name: (S && S.name) || null, p_started: rec.started || null, p_ver: rec.ver || C.version })
      .then(function (r) {
        SV.ready = true;
        if (r && r.ok) {
          rec.id = r.id; rec.score = r.score; rec.passed = r.passed; rec.linked = r.linked; saveLocal();
          SV.results.unshift({ id: r.id, course: cid, score: r.score, correct: r.correct, total: r.total, passed: r.passed, created_at: rec.at });
          return r;
        }
        if (r && r.why === 'already') { rec.dupe = true; saveLocal(); return r; }
        var e = new Error((r && r.error) || '저장하지 못했습니다.'); e.why = r && r.why; throw e;
      });
  }
  function submitExam(cid, btn) {
    var ex = L.exam[cid], sh = ex.sheet, left = sh.filter(function (x) { return x.p == null; }).length;
    if (left && !confirm('아직 답하지 않은 문항이 ' + left + '개 있습니다. 그대로 제출할까요? (답하지 않은 문항은 틀린 것으로 셉니다)')) return;
    var g = grade(sh);
    var rec = { sheet: sh, started: ex.started, ver: ex.ver, at: new Date().toISOString(), score: g.score, correct: g.correct, total: sh.length, passed: g.score >= C.exam.pass };
    btn.disabled = true; btn.textContent = '채점하는 중…';
    var done = function (msg) {
      rec.saveMsg = msg || '';
      L.last[cid] = rec; delete L.exam[cid]; saveLocal();
      go('#' + cid + '/result');
    };
    submitServer(cid, rec).then(function () { done(''); }, function (e) {
      if (notReady(e) || e.why === 'course') { if (e.why !== 'course') SV.ready = false; done('강의실 기록 저장을 준비하고 있어 결과를 이 기기에 먼저 보관했습니다. 준비가 끝나면 이 화면을 다시 열 때 자동으로 올라갑니다.'); }
      else if (e.why === 'limit') { done(e.message); }
      else done('결과를 서버에 저장하지 못했습니다(' + (e.message || '연결 오류') + '). 이 기기에 보관했으니 잠시 뒤 강의실을 다시 열어 주십시오.');
    });
  }

  /* ═════════════ 결과 ═════════════ */
  function reviewHTML(cid, sheet) {
    return '<section class="cr-review"><h3>문항별 풀이</h3><ol class="cr-rv">' + sheet.map(function (x, k) {
      var okk = x.p != null && x.p === x.a, b = bankItem(cid, x.id);
      return '<li class="' + (okk ? 'is-o' : 'is-x') + '"><div class="h"><span class="m" aria-label="' + (okk ? '정답' : '오답') + '">' + (okk ? '○' : '✕') + '</span><span>' + (k + 1) + '. ' + esc(x.q) + '</span></div>' +
        '<div class="d">' + (okk ? '<span class="ok">내 답: ' + esc(x.o[x.p]) + '</span>' :
          '<span class="no">내 답: ' + (x.p == null ? '(답하지 않음)' : esc(x.o[x.p])) + '</span><span class="ok">정답: ' + esc(x.o[x.a]) + '</span>') +
        (b && b.ex ? '<span class="ex">' + esc(b.ex) + '</span>' : '') + '</div></li>';
    }).join('') + '</ol></section>';
  }
  function renderResult(cid) {
    var c = C.courses[cid], rec = L.last[cid];
    if (!rec) return go('#' + cid + '/exam', true);
    var pass = rec.passed, printUrl = rec.id ? 'edu-print.html?sheet=' + rec.id : 'edu-print.html?local=' + cid;
    var html = '<div class="cr-wrap">' + navHTML(cid, 'exam') +
      '<div class="cr-result' + (pass ? ' is-pass' : '') + '">' +
      '<div class="cr-score" style="--p:' + rec.score + '"><b>' + rec.score + '</b><span>점 · ' + rec.correct + '/' + rec.total + ' 정답</span></div>' +
      (pass ? '<h2>축하합니다! ' + esc(c.title) + '을 이수했습니다</h2>' +
        '<p>' + (rec.id ? (rec.linked === false ? '이수 기록이 저장되었습니다. 계정이 아직 교적과 연결되지 않아 목회자가 확인한 뒤 교적에 연결해 드립니다.' : '이수 기록이 교적에 저장되었습니다. 목회자가 확인한 뒤 당회 문답과 예식을 안내해 드립니다.') : '') + '</p>' +
        '<p>' + esc(c.next) + '</p>'
        : '<h2>아쉽지만 ' + C.exam.pass + '점에 조금 모자랍니다</h2><p>틀린 문항의 풀이를 살펴보고, 해당 장을 복습한 뒤 <b>재시험</b>을 보세요. 재시험에는 새 문제가 나오며, 이번 기록(' + rec.score + '점)도 지워지지 않고 응시 기록에 남습니다.</p>') +
      (rec.saveMsg ? '<p class="cr-warn" style="text-align:left;margin-top:12px">' + esc(rec.saveMsg) + '</p>' : '') +
      '<div class="cr-acts">' +
      (pass ? '<a class="cr-btn" href="' + printUrl + '" target="_blank" rel="noopener">🖨 시험지·결과 PDF</a>' + (cid === 'infant' ? '' : '<a class="cr-line" href="forms.html">학습·세례 신청서 보기</a>')
        : '<button type="button" class="cr-btn cr-gold" data-retry>재시험 보기</button><a class="cr-line" href="' + printUrl + '" target="_blank" rel="noopener">🖨 시험지 인쇄</a>') +
      '<a class="cr-line" href="#">강의실 첫 화면</a></div>' +
      (pass ? '' : historyHTML(cid, rec.id)) +
      reviewHTML(cid, rec.sheet) +
      '</div></div>';
    root.innerHTML = html;
    centerCurrentStep();
    var rt = root.querySelector('[data-retry]');
    if (rt) rt.onclick = function () { go('#' + cid + '/exam'); };
  }
  function renderPassed(cid, pass) {
    var c = C.courses[cid], rec = L.last[cid];
    var printUrl = pass.id ? 'edu-print.html?sheet=' + pass.id : 'edu-print.html?local=' + cid;
    root.innerHTML = '<div class="cr-wrap">' + navHTML(cid, 'exam') +
      '<div class="cr-result is-pass"><div class="cr-score" style="--p:' + pass.score + '"><b>' + pass.score + '</b><span>점 · 이수 완료</span></div>' +
      '<h2>' + esc(c.title) + ' 이수 완료</h2><p>' + esc(kdate(pass.at)) + '에 이수했습니다. ' + esc(c.next) + '</p>' +
      '<div class="cr-acts"><a class="cr-btn" href="' + printUrl + '" target="_blank" rel="noopener">🖨 시험지·결과 PDF</a><a class="cr-line" href="#' + cid + '/1">과정 다시 보기</a><a class="cr-line" href="#">강의실 첫 화면</a></div>' +
      (triesOf(cid).length > 1 ? historyHTML(cid, pass.id) : '') +
      (rec && rec.passed && rec.sheet ? reviewHTML(cid, rec.sheet) : '') +
      '</div></div>';
    centerCurrentStep();
  }

  /* ── 시작 ── */
  root.innerHTML = '<p class="qt-loading">강의실을 여는 중…</p>';
  loadServer().then(render, render);
  // 다른 창에서 로그인·로그아웃하면 다시 그린다
  window.addEventListener('storage', function (e) { if (e.key && e.key.indexOf('-auth-token') > 0) location.reload(); });
})();
