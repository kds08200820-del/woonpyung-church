/* edu-print.js — 강의실 시험지·결과지와 학습·세례·입교 교인 증명서 · 유아세례 증명서 인쇄 (2026-10-25 담임목사 지시)
 *  edu-print.html?sheet=<결과 번호>  : 서버에 저장된 시험지·결과 (본인·관리자만 — RLS)
 *  edu-print.html?local=learn|baptism|infant : 이 기기에 보관된 마지막 시험 결과(서버 저장 전)
 *  edu-print.html?cert=<증명서 번호>  : 증명서 (관리자·본인만 — RLS)
 *  인쇄 창에서 'PDF로 저장' 을 고르면 PDF 가 된다. 자료실(member_files)의 강의실 항목이 이 주소로 연결된다.
 */
console.log('[edu-print.js] v20261026pr1');

(function () {
  var C = window.WPC_CATECHISM || { courses: {}, church: {} };
  var CH = C.church || {};
  var doc = document.getElementById('doc'), bar = document.getElementById('bar');
  var SB = String(window.SUPABASE_URL || '').replace(/\/$/, ''), AK = window.SUPABASE_ANON_KEY;
  var Q = new URLSearchParams(location.search);
  var COURSE_T = { learn: '학습 과정', baptism: '세례(입교) 과정', infant: '유아세례 과정(부모 교육)' };
  // 유아세례 증명서: 세례받을 때 만 7~13세였으면 '어린이세례'(총회 문답서 세례 2문)
  function infantLabel(c) {
    var b = c.birth && new Date(c.birth + 'T00:00:00'), d = c.rite_date && new Date(c.rite_date + 'T00:00:00');
    if (!b || !d || isNaN(b) || isNaN(d)) return '유아세례';
    var age = d.getFullYear() - b.getFullYear() - ((d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) ? 1 : 0);
    return age >= 7 ? '어린이세례' : '유아세례';
  }
  function certTitle(c) { return c.kind === '유아세례' ? infantLabel(c) + ' 증명서' : c.kind + '교인 증명서'; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function kdate(d) { if (!d) return ''; var x = new Date(String(d).length === 10 ? d + 'T00:00:00' : d); if (isNaN(x)) return ''; return x.getFullYear() + '년 ' + (x.getMonth() + 1) + '월 ' + x.getDate() + '일'; }
  function dotdate(d) { if (!d) return ''; var x = new Date(String(d).length === 10 ? d + 'T00:00:00' : d); if (isNaN(x)) return ''; return x.getFullYear() + '. ' + (x.getMonth() + 1) + '. ' + x.getDate() + '.'; }
  function ref() { try { return new URL(SB).hostname.split('.')[0]; } catch (e) { return ''; } }
  function sess() {
    try {
      var s = JSON.parse(localStorage.getItem('sb-' + ref() + '-auth-token')); s = (s && s.currentSession) ? s.currentSession : s;
      if (!s || !s.access_token || !s.user) return null;
      var md = s.user.user_metadata || {};
      return { uid: s.user.id, token: s.access_token, name: md.name || md.full_name || md.nickname || '' };
    } catch (e) { return null; }
  }
  function get(path) {
    var s = sess(), h = { apikey: AK };
    if (s) h.Authorization = 'Bearer ' + s.token;
    return fetch(SB + '/rest/v1/' + path, { headers: h }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
      return r.json();
    });
  }
  function message(title, text) {
    doc.innerHTML = '<div class="msg"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p><p><a href="classroom.html">강의실로 가기</a></p></div>';
  }
  // 증명서 인쇄: 종이 여백을 0 으로(브라우저 머리글·바닥글도 빠짐) — 여백은 증명서 상자(210×297mm)의 안쪽 12·13mm 가 맡는다
  function certPage() {
    document.body.classList.add('is-cert');
    if (document.getElementById('certPageCss')) return;
    var st = document.createElement('style'); st.id = 'certPageCss';
    st.textContent = '@page{size:A4 portrait;margin:0}';
    document.head.appendChild(st);
  }
  function ready(title) {
    if (title) document.title = title + ' | 운평장로교회';
    bar.hidden = false;
    document.getElementById('btnPrint').onclick = function () { window.print(); };
    document.getElementById('btnClose').onclick = function () { if (history.length > 1 && document.referrer) history.back(); else window.close(); setTimeout(function () { location.href = 'classroom.html'; }, 300); };
  }
  function bankEx(course, id) {
    var c = C.courses[course]; if (!c) return '';
    var b = c.bank.filter(function (x) { return x.id === id; })[0];
    return b && b.ex ? b.ex : '';
  }

  /* ── 시험지·결과 ── */
  function sheetHTML(r) {
    var sheet = Array.isArray(r.sheet) ? r.sheet : [], total = r.total || sheet.length, pass = r.passed;
    var title = (COURSE_T[r.course] || '교육 과정') + ' 이수 시험 답안지';
    var KEYS = ['①', '②', '③', '④'];
    var qs = sheet.map(function (x, k) {
      var okk = x.p != null && x.p === x.a, ex = bankEx(r.course, x.id);
      return '<div class="q ' + (okk ? 'o' : 'x') + '"><div class="t"><span class="m">' + (okk ? '○' : '✕') + '</span><span>' + (k + 1) + '. ' + esc(x.q) + '</span></div>' +
        '<ol>' + (x.o || []).map(function (o, i) {
          var cls = (i === x.a ? 'ans' : '') + (i === x.p ? ' pick' + (okk ? '' : ' wrong') : '');
          return '<li class="' + cls + '">' + (KEYS[i] || (i + 1) + '.') + ' ' + esc(o) + '</li>';
        }).join('') + '</ol>' +
        (x.p == null ? '<div class="nopick">답하지 않음</div>' : '') +
        (ex ? '<div class="ex">풀이: ' + esc(ex) + '</div>' : '') + '</div>';
    }).join('');
    return '<div class="page">' +
      '<div class="sh-h"><div><div class="ch">' + esc(CH.name || '운평장로교회') + ' 강의실 · 「학습·세례문답서」</div><h1>' + esc(title) + '</h1></div>' +
      '<div class="st"><b>' + esc(r.score) + '점</b>' + esc(r.correct) + ' / ' + esc(total) + ' 정답</div></div>' +
      '<table class="info"><tr><td class="l">이름</td><td>' + esc(r.member_name || '') + '</td><td class="l">과정</td><td>' + esc(COURSE_T[r.course] || r.course) + '</td></tr>' +
      '<tr><td class="l">응시일</td><td>' + esc(kdate(r.created_at)) + '</td><td class="l">결과</td><td>' + (pass ? '<span class="stamp ok">합격 · 이수</span>' : '<span class="stamp no">불합격</span>') + ' &nbsp;기준 ' + ((C.exam && C.exam.pass) || 70) + '점 이상</td></tr>' +
      (r.local ? '<tr><td class="l">비고</td><td colspan="3">이 기기에 보관된 결과입니다(서버 저장 전).</td></tr>' : '') +
      '</table>' +
      '<div class="qs">' + qs + '</div>' +
      '<div class="sh-f"><span>▶ 고른 답 · ✔ 정답 · 문항당 ' + (100 / (total || 20)) + '점 · 문제은행에서 무작위 출제</span><span><b>' + esc(CH.name || '운평장로교회') + '</b>' + (r.id ? ' · 결과 번호 ' + esc(r.id) : '') + '</span></div>' +
      '</div>';
  }

  /* ── 증명서 ── */
  // 도장 두 개(2026-10-25 담임목사): 교회 직인은 '운평장로교회' 의 끝 글자 '회' 에 반쯤 걸쳐 찍고,
  //   '담임목사 김동석 (인)' 자리에는 당회장 도장(목회행정 > 교인 증명서 > 도장 설정에서 올린 이미지, app_settings 'edu_img_pastor_seal')을 찍는다.
  //   당회장 도장은 관리자(교적·재정 권한)만 읽을 수 있어, 성도 본인이 열면 '(인)' 만 보인다.
  function certHTML(c, res, pastorSeal) {
    var kind = c.kind, church = c.church || CH.name || '운평장로교회', inf = kind === '유아세례';
    var dayLabel = kind === '학습' ? '학습받은 날' : kind === '입교' ? '입교한 날' : '세례받은 날';
    var verb = kind === '학습' ? '학습을 받았음을' : kind === '세례' ? '세례를 받았음을' : '입교하였음을';
    var course = kind === '학습' ? '학습' : '세례(입교)';
    var blank = '<span class="blank"></span>';
    var row = function (l, v) { return '<tr><td class="l">' + esc(l) + '</td><td class="v">' + (v ? esc(v) : blank) + '</td></tr>'; };
    var seal = 'images/' + encodeURIComponent('운평장로교회직인.png'), chName = CH.name || '운평장로교회';
    return '<div class="page cert"><div class="frame"><div class="frame-in">' +
      (c.voided_at ? '<div class="void"><span>취 소</span></div>' : '') +
      '<div class="c-no">제 ' + esc(c.cert_no) + ' 호</div>' +
      '<div class="c-title">' + esc(certTitle(c)) + '</div>' +
      (inf
        ? '<table class="c-tb">' + row('성 명', c.member_name) + row('생년월일', c.birth ? kdate(c.birth) : '') + row('부 모', c.parents) +
          row(dayLabel, kdate(c.rite_date)) + row('집례 목사', c.officiant) + row('받은 곳', church) + '</table>' +
          '<p class="c-body">위 어린이는 믿는 부모의 신앙고백과 서약에 따라 당회의 문답을 거쳐 ' + esc(church) + '에서 ' + esc(infantLabel(c)) + '를 받았음을 증명합니다.</p>'
        : '<table class="c-tb">' + row('성 명', c.member_name) + row('생년월일', c.birth ? kdate(c.birth) : '') + row('문답받은 날', kdate(c.qa_date)) +
          row(dayLabel, kdate(c.rite_date)) + row('집례 목사', c.officiant) + row('받은 곳', church) + '</table>' +
          '<p class="c-body">위 사람은 「학습·세례문답서」에 따른 ' + esc(course) + ' 교육을 마치고, 당회의 문답을 거쳐 ' + esc(church) + '에서 ' + esc(verb) + ' 증명합니다.</p>') +
      (res ? '<p class="c-edu">' + (inf ? '부모 교육 이수: ' : '교육 이수: ') + esc(CH.name || '운평장로교회') + ' 강의실 ' + esc(COURSE_T[res.course] || '') + ' (' + esc(dotdate(res.created_at)) + (inf ? '' : ' · ' + esc(res.score) + '점') + ')</p>' : '') +
      '<p class="c-date">' + esc(kdate(c.issued_on)) + '</p>' +
      '<div class="c-sign"><div class="dn">' + esc(CH.denom || '대한예수교장로회(합동)') + ' ' + esc(CH.presbytery || '') + '</div>' +
      '<div class="ch">' + esc(chName.slice(0, -1)) + '<span class="last">' + esc(chName.slice(-1)) + '<img src="' + seal + '" alt="교회 직인"></span></div>' +
      '<div class="ps">담임목사 ' + esc((CH.pastor || '').split('').join(' ')) + '<span class="in">(인)' + (pastorSeal ? '<img src="' + esc(pastorSeal) + '" alt="당회장 도장">' : '') + '</span></div></div>' +
      (c.memo ? '<p class="c-edu" style="margin-top:8mm">' + esc(c.memo) + '</p>' : '') +
      '</div></div></div>';
  }

  var sheetId = Q.get('sheet'), certId = Q.get('cert'), local = Q.get('local');
  if (local) {
    var s = sess(), store = null;
    try { store = JSON.parse(localStorage.getItem('wpc_cr_v1_' + (s ? s.uid : 'guest'))); } catch (e) { }
    var rec = store && store.last && store.last[local];
    if (!rec || !rec.sheet) return message('보관된 결과가 없습니다', '이 기기에서 본 시험 결과가 없습니다. 강의실에서 시험을 먼저 보십시오.');
    doc.innerHTML = sheetHTML({ course: local, sheet: rec.sheet, score: rec.score, correct: rec.correct, total: rec.total, passed: rec.passed, created_at: rec.at, member_name: (s && s.name) || '', id: rec.id || null, local: !rec.id });
    return ready(COURSE_T[local] + ' 시험지');
  }
  if (!sess()) return message('로그인이 필요합니다', '시험지와 증명서는 로그인한 본인과 교회 관리자만 볼 수 있습니다. 로그인한 뒤 다시 열어 주십시오.');
  if (sheetId && /^\d+$/.test(sheetId)) {
    get('edu_exam_results?id=eq.' + sheetId + '&select=*').then(function (rows) {
      var r = rows && rows[0];
      if (!r) return message('볼 수 없는 시험지입니다', '본인의 시험지이거나 관리자일 때만 볼 수 있습니다.');
      doc.innerHTML = sheetHTML(r);
      ready((r.member_name || '') + ' ' + (COURSE_T[r.course] || '') + ' 시험지');
    }).catch(function (e) { message('불러오지 못했습니다', (e && e.message) || '잠시 뒤에 다시 열어 주십시오.'); });
    return;
  }
  if (certId && /^\d+$/.test(certId)) {
    get('edu_certificates?id=eq.' + certId + '&select=*').then(function (rows) {
      var c = rows && rows[0];
      if (!c) return message('볼 수 없는 증명서입니다', '본인의 증명서이거나 관리자일 때만 볼 수 있습니다.');
      var p = c.result_id ? get('edu_exam_results?id=eq.' + c.result_id + '&select=id,course,score,created_at').then(function (x) { return x && x[0]; }, function () { return null; }) : Promise.resolve(null);
      var ps = get('app_settings?key=eq.edu_img_pastor_seal&select=value').then(function (x) { return (x && x[0] && x[0].value) || ''; }, function () { return ''; });
      return Promise.all([p, ps]).then(function (two) {
        var res = two[0];
        doc.innerHTML = certHTML(c, res, two[1]);
        certPage();
        ready(c.member_name + ' ' + certTitle(c));
      });
    }).catch(function (e) { message('불러오지 못했습니다', (e && e.message) || '잠시 뒤에 다시 열어 주십시오.'); });
    return;
  }
  message('주소가 올바르지 않습니다', '강의실이나 목회행정 화면에서 다시 열어 주십시오.');
})();
