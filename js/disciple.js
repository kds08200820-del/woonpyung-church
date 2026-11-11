/* disciple.js — 강의실 '제자훈련 양육반' (2026-11-11 담임목사 지시)
 *  · classroom.js 가 주소 #disciple… 를 이 파일에 넘긴다: WPCDisciple.render(rest, ctx)
 *  · 내용: js/disciple-data.js(window.WPC_DISCIPLE) · 서버: supabase/20261111_1900_edu_disciple.sql 의 rpc
 *  · 화면은 로그인한 사람의 권한(반마다)에 따라 둘로 나뉜다 — 인도자(관리자 포함)용 / 수강생용
 *    #disciple                  과정 소개 · 13강 차례 · 내 반
 *    #disciple/c/<반>           반 화면 — 진도(13강·대목) · (인도자) 모임 기록·명단·출석·이수 / (수강생) 내 출석·과제
 *    #disciple/c/<반>/l/<강>    강 화면 — 요약·목표·대목·구절·나눔 질문·과제·암송 + (인도자) 과제 확인 / (수강생) 내 글
 *    #disciple/c/<반>/m[/<날짜>] 인도자: 모임 기록(그날 나간 대목·출석·메모) — 같은 날짜는 고쳐 쓴다
 *  · 진도는 반마다 '강-대목'('3-4')으로 남고, 한 과를 여러 모임에 나누어 나갈 수 있다. 다음 모임은 못 다 나간 대목부터.
 */
console.log('[disciple.js] v20261111a');

(function () {
  var D = window.WPC_DISCIPLE;
  var X = null;            // classroom.js 가 넘기는 것: { root, api, rpc, esc, sess, openLogin, notReady }
  var CLS = null;          // rpc edu_my_classes 결과
  var ST = {};             // 반 id → rpc edu_class_state 결과
  var BIBLE = null;        // 개역개정(구절 본문 보기 — 누를 때 한 번 불러온다)
  var dirty = false;       // 쓰다 만 글
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  function esc(s) { return X.esc(s); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function kd(s) { var m = String(s || '').match(/^(\d{4})-(\d\d)-(\d\d)/); return m ? (+m[2]) + '월 ' + (+m[3]) + '일' : ''; }
  function kdy(s) { var m = String(s || '').match(/^(\d{4})-(\d\d)-(\d\d)/); return m ? m[1] + '년 ' + (+m[2]) + '월 ' + (+m[3]) + '일' : ''; }
  function lead() { return X.root; }
  function setHTML(h) { lead().innerHTML = h; }
  function msg(h) { setHTML('<div class="cr-wrap"><div class="cr-card">' + h + '</div></div>'); }
  function isLeader(st) { return st && (st.role === 'leader' || st.role === 'admin'); }
  function roleLabel(r) { return r === 'admin' ? '관리자' : r === 'leader' ? '인도자' : '수강생'; }
  function className(c) { return (c.title || D.title) + (c.cohort ? ' ' + c.cohort : '') + (c.class_name ? ' · ' + c.class_name : ''); }
  function fail(e) {
    if (X.notReady(e)) return msg('<h2>' + esc(D.title) + '</h2><p>양육반 기록 저장을 준비하고 있습니다. 조금 뒤에 다시 들어와 주십시오.</p>');
    msg('<h2>' + esc(D.title) + '</h2><p>불러오지 못했습니다. 잠시 뒤 다시 시도해 주십시오.</p><p class="cr-note">' + esc(e && e.message || '') + '</p>');
  }

  /* ── 진도 계산: 마친 대목 ['3-4', …] → 강마다 {n, all}, 지금 강, 다음에 시작할 대목 ── */
  function prog(done) {
    var set = {}; (done || []).forEach(function (k) { set[k] = 1; });
    var per = {}, cur = null, next = null, got = 0, total = 0;
    D.lessons.forEach(function (l) {
      var n = 0;
      l.parts.forEach(function (p, i) { total++; if (set[l.no + '-' + (i + 1)]) { n++; got++; } else if (!next) next = { lesson: l.no, part: i + 1, label: p }; });
      per[l.no] = { n: n, all: l.parts.length, state: n === l.parts.length ? 'done' : n ? 'cur' : 'todo' };
      if (!cur && n < l.parts.length) cur = l.no;
    });
    return { set: set, per: per, cur: cur, next: next, got: got, total: total, pct: Math.round(got / total * 100), allDone: got === total };
  }
  function progLabel(p) {
    if (!p.got) return '시작 전';
    if (p.allDone) return '13강 모두 마침';
    var c = p.per[p.cur];
    return c.n ? p.cur + '강 진행 중 · ' + c.all + '대목 중 ' + c.n : (p.cur - 1) + '강까지 마침';
  }
  // 수강생이 열어 볼 수 있는 강: 지금 강까지 + 바로 다음 강(예습)
  function canOpen(st, no) { if (isLeader(st)) return true; var p = prog(st.done); return no <= Math.min(13, (p.cur || 13) + 1); }

  /* ── 서버 ── */
  function loadClasses(force) {
    if (CLS && !force) return Promise.resolve(CLS);
    return X.rpc('edu_my_classes', { p_course: 'disciple' }).then(function (r) { CLS = Array.isArray(r) ? r : []; return CLS; });
  }
  function loadState(id, force) {
    if (ST[id] && !force) return Promise.resolve(ST[id]);
    return X.rpc('edu_class_state', { p_edu: id }).then(function (r) { if (r && r.ok) ST[id] = r; return r; });
  }

  /* ═════════════ 라우팅 ═════════════ */
  function render(rest, ctx) {
    X = ctx;
    if (!D) return msg('<h2>제자훈련 양육반</h2><p>강의 내용을 불러오지 못했습니다.</p>');
    dirty = false;
    var id = rest[0] === 'c' ? rest[1] : null;
    if (!id) return renderHome();
    if (!X.sess) return renderNeedLogin();
    setHTML('<div class="cr-wrap"><p class="qt-loading">불러오는 중…</p></div>');
    loadState(id, true).then(function (st) {
      if (!st || !st.ok) return msg('<h2>' + esc(D.title) + '</h2><p>이 반은 볼 수 없습니다. 반에 등록된 수강생과 인도자만 들어올 수 있습니다.</p><div class="cr-acts"><a class="cr-line" href="#disciple">‹ 양육반</a></div>');
      if (rest[2] === 'l') {
        var no = parseInt(rest[3], 10), l = D.lesson(no);
        if (!l) return go('#disciple/c/' + id);
        if (!canOpen(st, no)) return msg('<h2>' + no + '강은 아직 열리지 않았습니다</h2><p>우리 반이 앞 강을 마치면 열립니다. 바로 다음 강은 미리 열려 있어 예습할 수 있습니다.</p><div class="cr-acts"><a class="cr-line" href="#disciple/c/' + esc(id) + '">‹ 우리 반</a></div>');
        return renderLesson(st, l);
      }
      if (rest[2] === 'm' && isLeader(st)) return renderMeeting(st, rest[3] || '');
      renderClass(st);
    }).catch(fail);
  }
  function go(h) { if (location.hash === h) X.rerender(); else location.hash = h; }
  function renderNeedLogin() {
    msg('<h2>' + esc(D.title) + '</h2><p>양육반은 로그인한 뒤 들어올 수 있습니다. 등록된 반의 진도·과제·출석이 내 계정에 보입니다.</p>' +
      '<div class="cr-acts"><button type="button" class="cr-btn" data-login>로그인</button><a class="cr-line" href="#">강의실 첫 화면</a></div>');
    bindLogin();
  }
  function bindLogin() { Array.prototype.forEach.call(lead().querySelectorAll('[data-login]'), function (b) { b.onclick = function (e) { e.preventDefault(); X.openLogin(); }; }); }

  /* ═════════════ 과정 소개 · 내 반 ═════════════ */
  function tocHTML() {
    return D.groups.map(function (g) {
      return '<div class="dc-toc-g"><h3>' + esc(g.name) + ' <small>' + esc(g.sub) + '</small></h3><ol class="dc-toc" start="' + g.from + '">' +
        D.lessons.filter(function (l) { return l.no >= g.from && l.no <= g.to; }).map(function (l) {
          return '<li><b>' + esc(l.title) + '</b><span>' + esc(l.one) + '</span></li>';
        }).join('') + '</ol></div>';
    }).join('');
  }
  function renderHome() {
    setHTML('<div class="cr-wrap">' +
      '<nav class="dc-crumb"><a href="#">‹ 강의실</a></nav>' +
      '<section class="cr-card dc-intro dc-left"><p class="cr-c-part">' + esc(D.part) + '</p><h2>' + esc(D.title) + '</h2>' +
      '<p class="cr-c-lead">' + esc(D.lead) + '</p><p class="cr-note" style="margin-top:0">' + esc(D.textbook) + '</p></section>' +
      '<section class="dc-mine" aria-labelledby="dcMineT"><h2 id="dcMineT">내 반</h2><div id="dcMine"><p class="qt-loading">불러오는 중…</p></div></section>' +
      '<section class="cr-card dc-tocbox dc-left"><h2>13강 차례</h2>' + tocHTML() + '</section>' +
      '</div>');
    var box = lead().querySelector('#dcMine');
    if (!X.sess) { box.innerHTML = '<div class="cr-card"><p style="margin:0 0 12px">로그인하면 등록된 반이 여기에 나타납니다.</p><button type="button" class="cr-btn" data-login>로그인</button></div>'; bindLogin(); return; }
    loadClasses(true).then(function (list) {
      if (!document.body.contains(box)) return;
      if (!list.length) {
        box.innerHTML = '<div class="cr-card"><p style="margin:0">아직 등록된 반이 없습니다. 양육반에 등록되면 여기에 우리 반이 나타납니다.</p>' +
          '<p class="cr-note">등록은 교회(목회행정 매니저 → 교육관리)에서 합니다. 교적과 이어진 계정(정회원)이어야 내 반이 보입니다.</p></div>';
        return;
      }
      box.innerHTML = '<div class="dc-classes">' + list.map(function (c) {
        var p = prog(c.done);
        return '<a class="dc-class" href="#disciple/c/' + esc(c.id) + '">' +
          '<span class="dc-role is-' + esc(c.role) + '">' + roleLabel(c.role) + '</span>' +
          '<b>' + esc(className(c)) + '</b>' +
          (c.meet_info ? '<small>' + esc(c.meet_info) + '</small>' : '') +
          '<span class="dc-class-prog"><span>' + esc(progLabel(p)) + '</span><span>' + p.pct + '%</span></span>' +
          '<span class="cr-bar"><i style="width:' + p.pct + '%"></i></span>' +
          (c.role !== 'student' ? '<small>수강생 ' + c.students + '명 · 모임 ' + (c.meetings || 0) + '회</small>' : '') +
          '</a>';
      }).join('') + '</div>';
    }).catch(function (e) {
      box.innerHTML = '<div class="cr-card"><p style="margin:0">' + (X.notReady(e) ? '양육반 기록 저장을 준비하고 있습니다.' : '내 반을 불러오지 못했습니다.') + '</p></div>';
    });
  }

  /* ═════════════ 반 화면 ═════════════ */
  function lessonsHTML(st, p) {
    var id = st['class'].id;
    return '<ol class="dc-lessons">' + D.lessons.map(function (l) {
      var s = p.per[l.no], open = canOpen(st, l.no);
      var badge = s.state === 'done' ? '<em class="is-done">마침</em>' : s.state === 'cur' ? '<em class="is-cur">' + s.all + '대목 중 ' + s.n + '</em>' : (p.cur === l.no ? '<em class="is-next">다음</em>' : '');
      var inner = '<span class="n">' + l.no + '</span><span class="t"><b>' + esc(l.title) + '</b><small>' + esc(l.group) + ' · 교재 ' + esc(l.pages) + '쪽</small></span>' + badge;
      return '<li class="is-' + s.state + (p.cur === l.no ? ' is-here' : '') + '">' +
        (open ? '<a href="#disciple/c/' + esc(id) + '/l/' + l.no + '">' + inner + '</a>' : '<span class="dc-locked" title="우리 반이 앞 강을 마치면 열립니다">' + inner + '<em class="is-lock">잠김</em></span>') + '</li>';
    }).join('') + '</ol>';
  }
  function headHTML(st, sub) {
    var c = st['class'], p = prog(st.done);
    return '<nav class="dc-crumb"><a href="#disciple">‹ 양육반</a></nav>' +
      '<header class="cr-card dc-head dc-left"><p class="cr-c-part">' + esc(roleLabel(st.role)) + (st.role === 'student' && st.me && st.me.name ? ' · ' + esc(st.me.name) : '') + '</p>' +
      '<h2>' + esc(className(c)) + '</h2>' + (c.meet_info ? '<p class="cr-c-sub" style="margin:0 0 10px">' + esc(c.meet_info) + '</p>' : '') +
      '<div class="cr-c-stat"><span>' + esc(progLabel(p)) + (p.next && p.got ? ' · 다음 모임은 ' + p.next.lesson + '강 「' + esc(p.next.label) + '」부터' : '') + '</span><b>' + p.pct + '%</b></div>' +
      '<div class="cr-bar" role="progressbar" aria-label="우리 반 진도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.pct + '"><i style="width:' + p.pct + '%"></i></div>' +
      (sub || '') + '</header>';
  }
  function attendOf(st, pid) {
    var live = {}; (st.meetings || []).forEach(function (m) { if (!m.voided) live[m.id] = 1; });
    var n = 0; (st.attend || []).forEach(function (a) { if (a.pid === pid && live[a.meeting_id] && (a.status === '출석' || a.status === '지각')) n++; });
    return n;
  }
  function liveMeetings(st) { return (st.meetings || []).filter(function (m) { return !m.voided; }); }

  function renderClass(st) {
    var c = st['class'], p = prog(st.done), id = c.id, lv = liveMeetings(st);
    if (!isLeader(st)) {
      var my = (st.my_attend || []).filter(function (a) { return a.status === '출석' || a.status === '지각'; }).length;
      var tasks = (st.my_work || []).filter(function (w) { return w.share_note || w.task_note; }).length;
      setHTML('<div class="cr-wrap">' + headHTML(st,
        '<ul class="dc-stats"><li><b>' + my + '</b><span>출석 / 모임 ' + lv.length + '회</span></li><li><b>' + tasks + '</b><span>낸 과제</span></li>' +
        '<li><b>' + (st.completion ? '수료' : '수강 중') + '</b><span>' + (st.completion ? esc(kdy(st.completion.completed_on)) + ' · 제 ' + esc(st.completion.cert_no) + ' 호' : '13강을 마치면 수료') + '</span></li></ul>') +
        (p.cur && p.cur <= 13 ? '<div class="cr-acts" style="margin:0 0 18px"><a class="cr-btn" href="#disciple/c/' + esc(id) + '/l/' + p.cur + '">' + p.cur + '강 공부하기 ›</a>' +
          (p.cur < 13 ? '<a class="cr-line" href="#disciple/c/' + esc(id) + '/l/' + (p.cur + 1) + '">' + (p.cur + 1) + '강 예습</a>' : '') + '</div>' : '') +
        '<section class="cr-card dc-left"><h2 class="dc-h">13강</h2>' + lessonsHTML(st, p) + '</section>' +
        '<p class="cr-note">' + esc(D.textbook) + '</p></div>');
      return;
    }
    // 인도자
    var comp = {}; (st.completions || []).forEach(function (x) { if (!x.voided) comp[x.pid] = x; });
    var need = Math.ceil(lv.length * 2 / 3);
    var taskCnt = {}; (st.checks || []).forEach(function (k) { if (k.task) taskCnt[k.pid] = (taskCnt[k.pid] || 0) + 1; });
    setHTML('<div class="cr-wrap">' + headHTML(st,
      '<div class="cr-acts" style="margin-top:14px"><a class="cr-btn" href="#disciple/c/' + esc(id) + '/m">오늘 모임 기록하기</a>' +
      (p.cur ? '<a class="cr-line" href="#disciple/c/' + esc(id) + '/l/' + p.cur + '">' + p.cur + '강 내용 보기</a>' : '') + '</div>') +
      '<section class="cr-card dc-left"><h2 class="dc-h">수강생 <small>' + (st.roster || []).length + '명 · 모임 ' + lv.length + '회</small></h2>' +
      ((st.roster || []).length ? '<div class="dc-scroll"><table class="dc-table"><thead><tr><th>이름</th><th>출석</th><th>삶의 과제</th><th>수료</th></tr></thead><tbody>' +
        st.roster.map(function (m) {
          var a = attendOf(st, m.pid), done = comp[m.pid], ok = p.allDone && a >= need;
          return '<tr><td><b>' + esc(m.name) + '</b>' + (m.linked ? (m.has_account ? '' : ' <small class="dc-warn">계정 없음</small>') : ' <small class="dc-warn">교적 미연결</small>') + '</td>' +
            '<td>' + a + ' / ' + lv.length + '</td><td>' + (taskCnt[m.pid] || 0) + '강</td>' +
            '<td>' + (done ? '<span class="cr-badge is-pass">수료 · 제 ' + esc(done.cert_no) + ' 호</span>'
              : '<button type="button" class="cr-line cr-sm" data-issue="' + esc(m.pid) + '" data-name="' + esc(m.name) + '"' + (ok ? '' : ' data-early="1"') + '>' + (ok ? '이수 처리' : '이수 처리(기준 미달)') + '</button>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="cr-note">이수 기준(기본값): 13강 진도를 마치고 모임의 3분의 2 이상 출석(지금 기준 ' + need + '회). 마지막 판단은 인도자가 합니다.</p>'
        : '<p style="margin:0">등록된 수강생이 없습니다. 목회행정 매니저 → 교육관리에서 이 반에 수강생을 넣어 주십시오.</p>') + '</section>' +
      '<section class="cr-card dc-left"><h2 class="dc-h">모임 기록 <small>' + lv.length + '회</small></h2>' +
      ((st.meetings || []).length ? '<ul class="dc-meets">' + st.meetings.slice().sort(function (a, b) { return a.meet_date < b.meet_date ? 1 : -1; }).map(function (m) {
        var here = (st.attend || []).filter(function (a) { return a.meeting_id === m.id && (a.status === '출석' || a.status === '지각'); }).length;
        return '<li class="' + (m.voided ? 'is-void' : '') + '"><span class="d">' + esc(kd(m.meet_date)) + '</span>' +
          '<span class="t">' + esc(partsSummary(m.parts)) + (m.memo ? '<small>' + esc(m.memo) + '</small>' : '') + '</span>' +
          '<span class="c">' + (m.voided ? '취소됨' : '출석 ' + here + '명') + '</span>' +
          '<span class="a">' + (m.voided ? '<button type="button" class="cr-line cr-sm" data-void="' + esc(m.meet_date) + '" data-on="0">되살리기</button>'
            : '<a class="cr-line cr-sm" href="#disciple/c/' + esc(id) + '/m/' + esc(m.meet_date) + '">고치기</a><button type="button" class="cr-line cr-sm" data-void="' + esc(m.meet_date) + '" data-on="1">취소</button>') + '</span></li>';
      }).join('') + '</ul>' : '<p style="margin:0">아직 모임 기록이 없습니다. 위 <b>오늘 모임 기록하기</b>로 시작하십시오.</p>') + '</section>' +
      '<section class="cr-card dc-left"><h2 class="dc-h">13강</h2>' + lessonsHTML(st, p) + '</section>' +
      '</div>');
    Array.prototype.forEach.call(lead().querySelectorAll('[data-void]'), function (b) {
      b.onclick = function () {
        var on = b.dataset.on === '1';
        if (on && !confirm(kd(b.dataset['void']) + ' 모임 기록을 취소할까요? 지우지 않고 \'취소됨\'으로 남기며, 그날의 진도는 빠집니다.')) return;
        if (b.disabled) return; b.disabled = true;
        X.rpc('edu_meeting_void', { p_edu: id, p_date: b.dataset['void'], p_void: on }).then(function (r) {
          if (!r || !r.ok) throw new Error(r && r.error || '실패');
          X.rerender();
        }).catch(function (e) { b.disabled = false; alert('고치지 못했습니다: ' + e.message); });
      };
    });
    Array.prototype.forEach.call(lead().querySelectorAll('[data-issue]'), function (b) {
      b.onclick = function () {
        var name = b.dataset.name;
        var q = b.dataset.early ? name + ' 님은 아직 이수 기준(13강 진도·출석 3분의 2)에 이르지 않았습니다. 그래도 이수 처리할까요?' : name + ' 님을 ' + className(c) + ' 수료로 처리할까요? 수료증 번호가 매겨지고 교적의 성도별 자료실에 남습니다.';
        if (!confirm(q)) return;
        if (b.disabled) return; b.disabled = true; b.textContent = '처리 중…';
        X.rpc('edu_complete_issue', { p_edu: id, p_pid: b.dataset.issue, p_name: null, p_date: null, p_memo: null }).then(function (r) {
          if (!r || !r.ok) throw new Error(r && r.error || '실패');
          X.rerender();
        }).catch(function (e) { b.disabled = false; b.textContent = '이수 처리'; alert('이수 처리하지 못했습니다: ' + e.message); });
      };
    });
  }
  function partsSummary(parts) {
    var by = {}; (parts || []).forEach(function (k) { var a = String(k).split('-'); (by[a[0]] = by[a[0]] || []).push(+a[1]); });
    var keys = Object.keys(by).map(Number).sort(function (a, b) { return a - b; });
    if (!keys.length) return '진도 기록 없음';
    return keys.map(function (no) {
      var l = D.lesson(no), list = by[no].sort(function (a, b) { return a - b; });
      if (l && list.length === l.parts.length) return no + '강 전체';
      return no + '강 ' + (list.length > 1 && list[list.length - 1] - list[0] === list.length - 1 ? list[0] + '~' + list[list.length - 1] : list.join('·')) + '대목';
    }).join(', ');
  }

  /* ═════════════ 모임 기록(인도자) ═════════════ */
  function renderMeeting(st, date) {
    var c = st['class'], id = c.id;
    date = /^\d{4}-\d\d-\d\d$/.test(date) ? date : today();
    var mt = (st.meetings || []).filter(function (m) { return m.meet_date === date; })[0] || null;
    var mine = {}; (mt ? mt.parts : []).forEach(function (k) { mine[k] = 1; });
    // 다른 모임에서 이미 나간 대목(이 모임 것은 빼고)
    var other = {}; (st.meetings || []).forEach(function (m) { if (!m.voided && (!mt || m.id !== mt.id)) (m.parts || []).forEach(function (k) { other[k] = 1; }); });
    var p = prog(Object.keys(other)), from = p.cur || 13;
    var att = {}; if (mt) (st.attend || []).forEach(function (a) { if (a.meeting_id === mt.id) att[a.pid] = a.status; });
    setHTML('<div class="cr-wrap">' +
      '<nav class="dc-crumb"><a href="#disciple/c/' + esc(id) + '">‹ ' + esc(className(c)) + '</a></nav>' +
      '<form class="cr-card dc-meet dc-left" id="dcMeet" novalidate><h2>' + (mt ? '모임 기록 고치기' : '모임 기록하기') + '</h2>' +
      '<div class="dc-field"><label for="dcDate">모임 날짜</label><input type="date" id="dcDate" value="' + esc(date) + '" max="' + esc(today()) + '">' +
      (mt ? '<small>' + (mt.voided ? '취소된 기록입니다 — 저장하면 되살아납니다' : '이 날짜의 기록을 고칩니다') + '</small>' : '') + '</div>' +
      '<h3 class="dc-h3">오늘 나간 대목 <small>지난번에 멈춘 ' + (p.next ? p.next.lesson + '강 「' + esc(p.next.label) + '」' : '곳') + '부터</small></h3>' +
      '<div class="dc-pick">' + D.lessons.map(function (l) {
        var s = p.per[l.no], show = l.no >= from && l.no <= from + 1 || l.parts.some(function (x, i) { return mine[l.no + '-' + (i + 1)]; });
        return '<details class="dc-pl"' + (show ? ' open' : '') + '><summary><b>' + l.no + '강</b> ' + esc(l.title) + ' <small>' + (s.state === 'done' ? '마침' : s.n ? s.all + '대목 중 ' + s.n + ' 나감' : '') + '</small></summary><div class="dc-parts">' +
          l.parts.map(function (x, i) {
            var k = l.no + '-' + (i + 1), was = other[k];
            return '<label class="dc-part' + (was ? ' is-was' : '') + '"><input type="checkbox" value="' + k + '"' + (mine[k] ? ' checked' : '') + '><span>' + (i + 1) + '. ' + esc(x) + (was ? ' <em>나감</em>' : '') + '</span></label>';
          }).join('') + '</div></details>';
      }).join('') + '</div>' +
      '<h3 class="dc-h3">출석 <small><button type="button" class="cr-line cr-sm" id="dcAll">모두 출석</button></small></h3>' +
      ((st.roster || []).length ? '<ul class="dc-att">' + st.roster.map(function (m) {
        var s = att[m.pid] || '';
        return '<li data-pid="' + esc(m.pid) + '"><b>' + esc(m.name) + '</b><span class="dc-seg" role="group" aria-label="' + esc(m.name) + ' 출석">' +
          ['출석', '지각', '결석'].map(function (v) { return '<button type="button" data-v="' + v + '" aria-pressed="' + (s === v) + '" class="' + (s === v ? 'is-on' : '') + '">' + v + '</button>'; }).join('') + '</span></li>';
      }).join('') + '</ul>' : '<p>등록된 수강생이 없습니다.</p>') +
      '<div class="dc-field"><label for="dcMemo">메모</label><textarea id="dcMemo" rows="3" maxlength="500" placeholder="예: 3강 삼위일체에서 나눔이 길어 다음 주에 이어서">' + esc(mt && mt.memo || '') + '</textarea></div>' +
      '<div class="cr-acts dc-foot"><button type="submit" class="cr-btn" id="dcSave">저장</button><a class="cr-line" href="#disciple/c/' + esc(id) + '">취소</a><span class="dc-msg" id="dcMsg" role="status"></span></div>' +
      '</form></div>');
    var form = lead().querySelector('#dcMeet');
    form.addEventListener('input', function () { dirty = true; });
    form.querySelector('#dcDate').onchange = function () { var v = this.value; if (v && v !== date) { if (dirty && !confirm('쓰던 내용이 있습니다. 날짜를 바꾸면 그 날짜의 기록을 새로 엽니다. 바꿀까요?')) { this.value = date; return; } dirty = false; go('#disciple/c/' + id + '/m/' + v); } };
    Array.prototype.forEach.call(form.querySelectorAll('.dc-seg button'), function (b) {
      b.onclick = function () {
        var on = !b.classList.contains('is-on');
        Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.remove('is-on'); x.setAttribute('aria-pressed', 'false'); });
        if (on) { b.classList.add('is-on'); b.setAttribute('aria-pressed', 'true'); }
        dirty = true;
      };
    });
    var all = form.querySelector('#dcAll'); if (all) all.onclick = function () {
      Array.prototype.forEach.call(form.querySelectorAll('.dc-att li'), function (li) { if (!li.querySelector('.is-on')) li.querySelector('[data-v="출석"]').click(); });
    };
    form.onsubmit = function (e) {
      e.preventDefault();
      var btn = form.querySelector('#dcSave'), out = form.querySelector('#dcMsg');
      if (btn.disabled) return;
      var d = form.querySelector('#dcDate').value;
      if (!d) { out.textContent = '모임 날짜를 골라 주십시오.'; return; }
      var parts = Array.prototype.map.call(form.querySelectorAll('.dc-parts input:checked'), function (x) { return x.value; });
      var attend = Array.prototype.map.call(form.querySelectorAll('.dc-att li'), function (li) { var on = li.querySelector('.is-on'); return { pid: li.dataset.pid, status: on ? on.dataset.v : '' }; });
      if (!parts.length && !attend.some(function (a) { return a.status; }) && !confirm('나간 대목과 출석이 모두 비어 있습니다. 그래도 저장할까요?')) return;
      btn.disabled = true; btn.textContent = '저장 중…'; out.textContent = '';
      X.rpc('edu_meeting_save', { p_edu: id, p_date: d, p_parts: parts, p_memo: form.querySelector('#dcMemo').value, p_attend: attend }).then(function (r) {
        if (!r || !r.ok) throw new Error(r && r.error || '저장하지 못했습니다.');
        dirty = false; CLS = null;
        go('#disciple/c/' + id);
      }).catch(function (err) { btn.disabled = false; btn.textContent = '저장'; out.textContent = '저장하지 못했습니다: ' + err.message; });
    };
  }

  /* ═════════════ 강 화면 ═════════════ */
  function verseRows(l) {
    return l.verses.map(function (v, i) {
      return '<li><button type="button" class="dc-vbtn" data-vi="' + i + '" aria-expanded="false"><b>' + esc(D.refLabel(v)) + '</b><span>' + esc(v[4] || '') + '</span></button><p class="dc-vtext" hidden></p></li>';
    }).join('');
  }
  function reciteHTML(lines) {
    return '<div class="cr-recite"><div class="cr-recite-bar"><span>가린 줄을 누르면 하나씩 보입니다</span><button type="button" class="cr-line cr-sm" data-recite>가리고 외워 보기</button></div>' +
      '<ol class="cr-lines">' + lines.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></div>';
  }
  // 암송 구절을 외우기 좋게 어절 묶음(대략 18자)으로 나눈다
  function chunk(text) {
    var words = String(text).split(/\s+/), out = [], cur = '';
    words.forEach(function (w) { if ((cur + ' ' + w).trim().length > 18 && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) out.push(cur);
    return out;
  }
  function renderLesson(st, l) {
    var c = st['class'], id = c.id, p = prog(st.done), lp = p.per[l.no], lead_ = isLeader(st);
    var prev = l.no > 1 && canOpen(st, l.no - 1) ? l.no - 1 : 0, next = l.no < 13 && canOpen(st, l.no + 1) ? l.no + 1 : 0;
    var nextPart = p.next && p.next.lesson === l.no ? p.next.part : 0;
    var html = '<div class="cr-wrap">' +
      '<nav class="dc-crumb"><a href="#disciple/c/' + esc(id) + '">‹ ' + esc(className(c)) + '</a></nav>' +
      '<article class="cr-lesson">' +
      '<header class="cr-l-head"><p class="cr-l-eye">' + esc(l.group) + ' · 제' + l.no + '강</p><h2>' + esc(l.title) + '</h2>' +
      '<p class="cr-l-meta">교재 ' + esc(l.pages) + '쪽 · 우리 반 ' + (lp.state === 'done' ? '마침' : lp.n ? lp.all + '대목 중 ' + lp.n + ' 나감' : '아직') + '</p></header>' +
      '<section class="cr-l-intro"><h3>한 줄로</h3><p><b>' + esc(l.one) + '</b></p>' + l.summary.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') + '</section>' +
      '<section class="dc-sec"><h3 class="cr-sub-h">학습 목표</h3><ul class="dc-goals">' + l.goals.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></section>' +
      '<section class="dc-sec"><h3 class="cr-sub-h">교재의 흐름 <small>우리 반 진도</small></h3><ol class="dc-flow">' + l.parts.map(function (x, i) {
        var k = l.no + '-' + (i + 1), done = p.set[k];
        return '<li class="' + (done ? 'is-done' : nextPart === i + 1 ? 'is-next' : '') + '"><span>' + esc(x) + '</span>' + (done ? '<em>나감</em>' : nextPart === i + 1 ? '<em>다음 모임은 여기부터</em>' : '') + '</li>';
      }).join('') + '</ol></section>' +
      '<section class="dc-sec"><h3 class="cr-sub-h">예습 — 먼저 읽을 구절 <small>누르면 본문이 열립니다. 나머지는 교재를 펴서 찾아 적어 오십시오</small></h3><ul class="dc-verses">' + verseRows(l) + '</ul></section>' +
      '<aside class="cr-think"><h3 class="cr-sub-h">나눔 질문</h3><ul>' + l.questions.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul></aside>' +
      '<section class="dc-sec"><h3 class="cr-sub-h">삶의 과제</h3><ul class="dc-goals">' + l.tasks.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></section>' +
      '<aside class="cr-verse"><h3 class="cr-sub-h">암송 · ' + esc(D.refLabel(l.memory.ref)) + '</h3><p>“' + esc(l.memory.text) + '”</p>' + reciteHTML(chunk(l.memory.text)) + '</aside>' +
      (lead_ ? checksHTML(st, l) : workHTML(st, l)) +
      '<div class="cr-l-foot">' + (prev ? '<a class="cr-line" href="#disciple/c/' + esc(id) + '/l/' + prev + '">‹ ' + prev + '강</a>' : '<a class="cr-line" href="#disciple/c/' + esc(id) + '">‹ 우리 반</a>') +
      (next ? '<a class="cr-btn" href="#disciple/c/' + esc(id) + '/l/' + next + '">' + next + '강 ›</a>' : '<span></span>') + '</div>' +
      '</article></div>';
    setHTML(html);
    bindRecite(); bindVerses(l);
    if (lead_) bindChecks(st, l); else bindWork(st, l);
  }
  function bindRecite() {
    Array.prototype.forEach.call(lead().querySelectorAll('.cr-recite'), function (box) {
      var b = box.querySelector('[data-recite]');
      b.onclick = function () {
        var on = box.classList.toggle('is-hidden');
        Array.prototype.forEach.call(box.querySelectorAll('li'), function (li) { li.classList.remove('is-shown'); });
        b.textContent = on ? '모두 보기' : '가리고 외워 보기';
      };
      Array.prototype.forEach.call(box.querySelectorAll('li'), function (li) { li.onclick = function () { if (box.classList.contains('is-hidden')) li.classList.add('is-shown'); }; });
    });
  }
  function bindVerses(l) {
    Array.prototype.forEach.call(lead().querySelectorAll('.dc-vbtn'), function (b) {
      b.onclick = function () {
        var p = b.nextElementSibling, v = l.verses[+b.dataset.vi];
        var open = p.hidden; p.hidden = !open; b.setAttribute('aria-expanded', String(open));
        if (!open || p.dataset.ok) return;
        p.textContent = '본문을 불러오는 중…';
        (BIBLE ? Promise.resolve(BIBLE) : fetch('data/bible-gyr.json?v=20261111b').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) { BIBLE = j; return j; }))
          .then(function (B) {
            var ch = B[v[0]] && B[v[0]][v[1] - 1], out = [];
            for (var n = v[2]; n <= (v[3] || v[2]); n++) if (ch && ch[n - 1]) out.push((v[3] && v[3] !== v[2] ? n + ' ' : '') + ch[n - 1]);
            p.textContent = out.length ? out.join('  ') : '본문을 찾지 못했습니다.'; p.dataset.ok = '1';
          }).catch(function () { p.textContent = '본문을 불러오지 못했습니다. 성경을 펴서 찾아 주십시오.'; });
      };
    });
  }

  /* ── 수강생: 내 글(예습·암송 표시, 가족과 나눈 느낀 점, 과제 실천) ── */
  function workHTML(st, l) {
    var w = (st.my_work || []).filter(function (x) { return x.lesson_no === l.no; })[0] || {};
    var k = (st.my_checks || []).filter(function (x) { return x.lesson_no === l.no; })[0] || null;
    return '<form class="dc-work" id="dcWork" novalidate><h3 class="cr-sub-h">내 과제</h3>' +
      '<label class="dc-chk"><input type="checkbox" id="dcPrep"' + (w.prep_done ? ' checked' : '') + '> 예습했습니다 <small>구절을 교재에 찾아 적었습니다</small></label>' +
      '<label class="dc-chk"><input type="checkbox" id="dcRec"' + (w.recite_done ? ' checked' : '') + '> 암송 구절을 외웠습니다</label>' +
      '<div class="dc-field"><label for="dcShare">가족과 나눈 느낀 점</label><textarea id="dcShare" rows="4" maxlength="2000">' + esc(w.share_note || '') + '</textarea></div>' +
      '<div class="dc-field"><label for="dcTask">삶의 과제를 실천한 것</label><textarea id="dcTask" rows="4" maxlength="2000">' + esc(w.task_note || '') + '</textarea></div>' +
      '<div class="cr-acts"><button type="submit" class="cr-btn" id="dcWSave">저장</button><span class="dc-msg" id="dcWMsg" role="status">' + (w.updated_at ? esc(kd(w.updated_at)) + '에 저장함' : '') + '</span></div>' +
      (k ? '<p class="cr-note">인도자 확인 — 예습 ' + (k.prep ? '✓' : '—') + ' · 삶의 과제 ' + (k.task ? '✓' : '—') + ' · 암송 ' + (k.recite ? '✓' : '—') + '</p>' : '') +
      '<p class="cr-note">적은 글은 나와 우리 반 인도자만 봅니다.</p></form>';
  }
  function bindWork(st, l) {
    var f = lead().querySelector('#dcWork'); if (!f) return;
    f.addEventListener('input', function () { dirty = true; f.querySelector('#dcWMsg').textContent = '저장하지 않은 글이 있습니다'; });
    f.onsubmit = function (e) {
      e.preventDefault();
      var b = f.querySelector('#dcWSave'), out = f.querySelector('#dcWMsg');
      if (b.disabled) return; b.disabled = true; b.textContent = '저장 중…';
      X.rpc('edu_work_save', { p_edu: st['class'].id, p_lesson: l.no, p_prep: f.querySelector('#dcPrep').checked, p_recite: f.querySelector('#dcRec').checked,
        p_share: f.querySelector('#dcShare').value, p_task: f.querySelector('#dcTask').value }).then(function (r) {
        if (!r || !r.ok) throw new Error(r && r.error || '저장하지 못했습니다.');
        dirty = false; b.disabled = false; b.textContent = '저장'; out.textContent = '✓ 저장했습니다';
        loadState(st['class'].id, true).catch(function () { });
      }).catch(function (err) { b.disabled = false; b.textContent = '저장'; out.textContent = '저장하지 못했습니다: ' + err.message; });
    };
  }

  /* ── 인도자: 이 강의 과제 확인(예습·삶의 과제·암송) + 수강생이 낸 글 ── */
  function checksHTML(st, l) {
    var ck = {}, wk = {};
    (st.checks || []).forEach(function (x) { if (x.lesson_no === l.no) ck[x.pid] = x; });
    (st.work || []).forEach(function (x) { if (x.lesson_no === l.no) wk[x.pid] = x; });
    if (!(st.roster || []).length) return '';
    return '<section class="dc-sec dc-checks"><h3 class="cr-sub-h">' + l.no + '강 과제 확인 <small>누르면 바로 저장됩니다</small></h3><div class="dc-scroll"><table class="dc-table"><thead><tr><th>이름</th><th>예습</th><th>삶의 과제</th><th>암송</th><th>낸 글</th></tr></thead><tbody>' +
      st.roster.map(function (m) {
        var k = ck[m.pid] || {}, w = wk[m.pid];
        var box = function (f, label) { return '<td><label class="dc-tick"><input type="checkbox" data-f="' + f + '"' + (k[f] ? ' checked' : '') + ' aria-label="' + esc(m.name + ' ' + label) + '"></label></td>'; };
        return '<tr data-pid="' + esc(m.pid) + '" data-name="' + esc(m.name) + '"><td><b>' + esc(m.name) + '</b></td>' + box('prep', '예습') + box('task', '삶의 과제') + box('recite', '암송') +
          '<td>' + (w ? '<details><summary>' + (w.prep_done ? '예습 ✓ ' : '') + (w.recite_done ? '암송 ✓ ' : '') + (w.share_note || w.task_note ? '글 보기' : '') + '</summary>' +
            (w.share_note ? '<p><b>가족과 나눈 느낀 점</b><br>' + esc(w.share_note) + '</p>' : '') + (w.task_note ? '<p><b>삶의 과제</b><br>' + esc(w.task_note) + '</p>' : '') + '</details>' : '<span class="dc-dim">—</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="dc-msg" id="dcCMsg" role="status"></p></section>';
  }
  function bindChecks(st, l) {
    var out = lead().querySelector('#dcCMsg');
    Array.prototype.forEach.call(lead().querySelectorAll('.dc-checks tr[data-pid]'), function (tr) {
      Array.prototype.forEach.call(tr.querySelectorAll('input[data-f]'), function (cb) {
        cb.onchange = function () {
          var v = {}; Array.prototype.forEach.call(tr.querySelectorAll('input[data-f]'), function (x) { v[x.dataset.f] = x.checked; x.disabled = true; });
          X.rpc('edu_check_save', { p_edu: st['class'].id, p_lesson: l.no, p_pid: tr.dataset.pid, p_name: null, p_prep: v.prep, p_task: v.task, p_recite: v.recite, p_memo: null })
            .then(function (r) { if (!r || !r.ok) throw new Error(r && r.error || '실패'); out.textContent = '✓ ' + tr.dataset.name + ' 님 저장'; })
            .catch(function (e) { cb.checked = !cb.checked; out.textContent = '저장하지 못했습니다: ' + e.message; })
            .then(function () { Array.prototype.forEach.call(tr.querySelectorAll('input[data-f]'), function (x) { x.disabled = false; }); });
        };
      });
    });
  }

  /* ═════════════ 강의실 첫 화면의 카드 ═════════════ */
  function cardHTML(hasSession) {
    if (!D) return '';
    return '<article class="cr-course dc-home">' +
      '<div><p class="cr-c-part">' + esc(D.part) + '</p><h2>' + esc(D.title) + '</h2>' +
      '<p class="cr-c-sub">' + esc(D.sub) + '</p><p class="cr-c-lead">' + esc(D.lead) + '</p><p class="cr-c-who"><b>대상</b>' + esc(D.who) + '</p></div>' +
      '<div class="dc-home-act"><a class="cr-btn" href="#disciple"' + (hasSession ? '' : ' data-login') + '>' + (hasSession ? '양육반 들어가기' : '로그인하고 들어가기') + '</a>' +
      '<a class="cr-line" href="#disciple">13강 차례 보기</a></div></article>';
  }

  window.WPCDisciple = { render: render, card: function (ctx, hasSession) { X = X || ctx; return cardHTML(hasSession); } };
})();
