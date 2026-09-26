/* ============================================================
   오늘의 예배 — 홈페이지 첫 화면(히어로)에 그날의 예배를 띄우고,
   정회원이 누르면 순서대로 넘겨 보는 전체 화면을 연다.
   · 주일: 주보(js/bulletins.js) 순서 → 송영·찬송(악보 그림)·교독문·사도신경·성경봉독·말씀 …
   · 수요일: 주보의 수요기도회 줄 → 제목·본문(개역개정)
   · 월~토 새벽: 그날 QT(qt_published) 본문 = 새벽기도회 본문
   · 자료: 찬송가 악보 modu/data/hymn/NNN.webp, 교독문 js/gyodok-data.js, 성경 data/bible-gyr.json
   · 보기는 로그인한 정회원(member_links.member_status = '정회원')만. 히어로 안내는 누구나 봄.
   이 파일은 main.js 보다 먼저 읽혀야 한다 (히어로 슬라이드를 먼저 끼워 넣어야 회전기가 셈에 넣는다)
   ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var BIBLE_VER = '20260729';
  var HYMN_IMG = 'modu/data/hymn/';

  /* ── 오늘(한국 시각) ── */
  function kst() { var d = new Date(Date.now() + (9 * 60 + new Date().getTimezoneOffset()) * 60000); return d; }
  function ymd(d) { return d.toISOString().slice(0, 10); }
  var today = kst(), todayStr = ymd(today), dow = today.getUTCDay();   /* kst() 는 UTC 값을 한국 시각으로 옮겨 둔 것 */
  var DOWK = ['일', '월', '화', '수', '목', '금', '토'];

  /* ── 성경 이름 → 자료 열쇠 ── */
  var BOOKS = [['창세기', '창'], ['출애굽기', '출'], ['레위기', '레'], ['민수기', '민'], ['신명기', '신'], ['여호수아', '수'], ['사사기', '삿'], ['룻기', '룻'], ['사무엘상', '삼상'], ['사무엘하', '삼하'], ['열왕기상', '왕상'], ['열왕기하', '왕하'], ['역대상', '대상'], ['역대하', '대하'], ['에스라', '스'], ['느헤미야', '느'], ['에스더', '에'], ['욥기', '욥'], ['시편', '시'], ['잠언', '잠'], ['전도서', '전'], ['아가', '아'], ['이사야', '사'], ['예레미야', '렘'], ['예레미야애가', '애'], ['에스겔', '겔'], ['다니엘', '단'], ['호세아', '호'], ['요엘', '욜'], ['아모스', '암'], ['오바댜', '옵'], ['요나', '욘'], ['미가', '미'], ['나훔', '나'], ['하박국', '합'], ['스바냐', '습'], ['학개', '학'], ['스가랴', '슥'], ['말라기', '말'], ['마태복음', '마'], ['마가복음', '막'], ['누가복음', '눅'], ['요한복음', '요'], ['사도행전', '행'], ['로마서', '롬'], ['고린도전서', '고전'], ['고린도후서', '고후'], ['갈라디아서', '갈'], ['에베소서', '엡'], ['빌립보서', '빌'], ['골로새서', '골'], ['데살로니가전서', '살전'], ['데살로니가후서', '살후'], ['디모데전서', '딤전'], ['디모데후서', '딤후'], ['디도서', '딛'], ['빌레몬서', '몬'], ['히브리서', '히'], ['야고보서', '약'], ['베드로전서', '벧전'], ['베드로후서', '벧후'], ['요한일서', '요일'], ['요한이서', '요이'], ['요한삼서', '요삼'], ['유다서', '유'], ['요한계시록', '계']];
  var BOOK_KEY = {};
  BOOKS.forEach(function (b) { BOOK_KEY[b[0]] = b[1]; BOOK_KEY[b[1]] = b[1]; });
  BOOK_KEY['시'] = '시'; BOOK_KEY['애가'] = '애'; BOOK_KEY['계시록'] = '계'; BOOK_KEY['요한1서'] = '요일'; BOOK_KEY['요한2서'] = '요이'; BOOK_KEY['요한3서'] = '요삼';
  function bookName(key) { for (var i = 0; i < BOOKS.length; i++) if (BOOKS[i][1] === key) return BOOKS[i][0]; return key; }
  var bibleCache = null;
  function loadBible() {
    if (bibleCache) return Promise.resolve(bibleCache);
    if (window.BIBLE_GYR) return Promise.resolve((bibleCache = window.BIBLE_GYR));
    return fetch('data/bible-gyr.json?v=' + BIBLE_VER).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { bibleCache = d; window.BIBLE_GYR = d; return d; });
  }
  /* "역대상 10:13–11:3" · "레위기 11:1–47" · "시편 23:1" · "창세기 1장" → [{ch, v, t}] */
  function parseRef(ref) {
    var s = String(ref || '').replace(/[–—~]/g, '-').replace(/\s+/g, ' ').trim();
    var m = s.match(/^([가-힣0-9]+)\s*(\d+)\s*(?:[:장]\s*(\d+)?)?(?:\s*-\s*(\d+)(?::(\d+))?)?/);
    if (!m) return null;
    var key = BOOK_KEY[m[1]]; if (!key) return null;
    var c1 = +m[2], v1 = m[3] ? +m[3] : 0, c2 = c1, v2 = 0;
    if (m[4] && m[5]) { c2 = +m[4]; v2 = +m[5]; }            /* 10:13-11:3 */
    else if (m[4]) { if (v1) v2 = +m[4]; else { c2 = +m[4]; } } /* 11:1-47  또는 1-3장 */
    else if (v1) v2 = v1;
    return { key: key, c1: c1, v1: v1, c2: c2, v2: v2, book: bookName(key) };
  }
  function versesFor(data, p) {
    var out = [], book = data[p.key] || [];
    for (var c = p.c1; c <= p.c2; c++) {
      var ch = book[c - 1] || [], from = (c === p.c1 && p.v1) ? p.v1 : 1, to = (c === p.c2 && p.v2) ? p.v2 : ch.length;
      for (var v = from; v <= Math.min(to, ch.length); v++) out.push({ ch: c, v: v, t: String(ch[v - 1] || '').trim() });
    }
    return out;
  }

  /* ── 고정 문안 ── */
  var CREED = ['전능하사 천지를 만드신 하나님 아버지를 내가 믿사오며,', '그 외아들 우리 주 예수 그리스도를 믿사오니,', '이는 성령으로 잉태하사 동정녀 마리아에게 나시고,', '본디오 빌라도에게 고난을 받으사, 십자가에 못 박혀 죽으시고,', '장사한 지 사흘 만에 죽은 자 가운데서 다시 살아나시며,', '하늘에 오르사, 전능하신 하나님 우편에 앉아 계시다가,', '저리로서 산 자와 죽은 자를 심판하러 오시리라.', '성령을 믿사오며, 거룩한 공회와, 성도가 서로 교통하는 것과,', '죄를 사하여 주시는 것과, 몸이 다시 사는 것과, 영원히 사는 것을 믿사옵나이다. 아멘.'];
  var LORD = ['하늘에 계신 우리 아버지여,', '이름이 거룩히 여김을 받으시오며,', '나라가 임하시오며,', '뜻이 하늘에서 이루어진 것 같이 땅에서도 이루어지이다.', '오늘 우리에게 일용할 양식을 주시옵고,', '우리가 우리에게 죄 지은 자를 사하여 준 것 같이 우리 죄를 사하여 주시옵고,', '우리를 시험에 들게 하지 마시옵고, 다만 악에서 구하시옵소서.', '대개 나라와 권세와 영광이 아버지께 영원히 있사옵나이다. 아멘.'];

  /* ── 주보 ── */
  function bulletins() { try { return (typeof BULLETINS !== 'undefined' && BULLETINS) || window.BULLETINS || []; } catch (e) { return []; } }
  function sundayBulletin() {                      /* 내일까지의 가장 최근 주보 — 토요일에 올린 내일 주보가 바로 보이고, 주일이면 오늘 것 */
    var L = bulletins(), lim = ymd(new Date(today.getTime() + 864e5));
    for (var i = 0; i < L.length; i++) if (L[i].date <= lim) return L[i];
    return L[0] || null;
  }
  function wedInfo(bul) {                          /* 주보의 수요기도회 줄 → 제목·본문 (bul 없으면 이번 주) */
    var b = bul || sundayBulletin(); if (!b || !b.wed) return null;
    var s = String(b.wed), t = (s.match(/«([^»]+)»/) || [])[1] || '', ser = (s.match(/·\s*([^«—]+?)\s*(?:«|—)/) || [])[1] || '';
    var ref = (s.match(/—\s*([가-힣]+\s*\d+:\d+(?:\s*[-–~]\s*\d+(?::\d+)?)?)/) || [])[1] || '';
    return { title: t, series: ser.trim(), ref: ref.trim(), who: (s.match(/\/\s*([^/]+)$/) || [])[1] || '', raw: s };
  }

  /* ── 오늘 QT(새벽기도회 본문) ── */
  var qtCache = {};
  function loadQt(date) {
    date = date || todayStr;
    if (qtCache[date] !== undefined) return Promise.resolve(qtCache[date]);
    if (!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY)) return Promise.resolve((qtCache[date] = null));
    var u = window.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/qt_published?select=sermon_date,title,scripture,qt_bible_text&sermon_date=eq.' + date + '&limit=1';
    return fetch(u, { headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY } })
      .then(function (r) { return r.ok ? r.json() : null; }).then(function (rows) { qtCache[date] = rows && rows[0] ? rows[0] : null; return qtCache[date]; })
      .catch(function () { qtCache[date] = null; return null; });
  }
  /* 설교 매니저(sermons)에 적어 둔 찬송가·교독문·제목·구절 — 정회원용 뷰 worship_published (로그인 토큰으로 읽음) */
  var svcCache = {};
  function loadService(date, services) {
    var key = date + '|' + services.join(',');
    if (svcCache[key] !== undefined) return Promise.resolve(svcCache[key]);
    var s = session();
    if (!s || !(window.SUPABASE_URL && window.SUPABASE_ANON_KEY)) return Promise.resolve((svcCache[key] = null));
    var u = window.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/worship_published?select=sermon_date,service,title,scripture,hymns,gyodok,preacher&sermon_date=eq.' + date + '&service=in.(' + services.map(encodeURIComponent).join(',') + ')&limit=5';
    return fetch(u, { headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + s.token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) { var pick = null; if (rows && rows.length) { services.some(function (sv) { pick = rows.filter(function (r) { return r.service === sv; })[0] || null; return !!pick; }); } svcCache[key] = pick; return pick; })
      .catch(function () { svcCache[key] = null; return null; });
  }
  function hymnNos(str) { return String(str || '').split(/[,\s·]+/).map(function (x) { return parseInt(x, 10); }).filter(function (n) { return n >= 1 && n <= 645; }); }
  function gyodokNo(str) { var m = String(str || '').match(/(\d{1,3})/); return m ? +m[1] : 0; }
  /* 새벽·수요기도회 순서: 찬송 → 교독문 → 본문 → 말씀 */
  function midweekSlides(k, date, title, ref, who, rec) {
    slides.push({ type: 'cover', k: k, date: dateLabel(date), title: title || '', ref: ref || '', who: who || '', quote: '' });
    if (rec) {
      hymnNos(rec.hymns).forEach(function (n) { slides.push({ type: 'hymn', head: '찬송', no: n, title: hymnTitle(n) }); });
      var g = gyodokNo(rec.gyodok); if (g) slides.push({ type: 'gyodok', head: '성시교독', no: g, sub: String(rec.gyodok).replace(/^\d+\.?\s*/, '') });
    }
    if (ref) slides.push({ type: 'bible', head: '성경 본문', ref: ref });
    slides.push({ type: 'sermon', head: '말씀', title: title || '', ref: ref || '', who: who || '', quote: '' });
  }
  function dateLabel(d) { var m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return String(d); var dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return (+m[2]) + '월 ' + (+m[3]) + '일 (' + DOWK[dt.getUTCDay()] + ')'; }

  /* ── 로그인·정회원 확인 (layout.js 와 같은 방식: 저장된 세션 → member_links) ── */
  function session() {
    try {
      var ref = new URL(window.SUPABASE_URL).hostname.split('.')[0];
      var raw = localStorage.getItem('sb-' + ref + '-auth-token'); if (!raw) return null;
      var s0 = JSON.parse(raw), s = s0 && s0.currentSession ? s0.currentSession : s0;
      return s && s.user ? { uid: s.user.id, token: s.access_token } : null;
    } catch (e) { return null; }
  }
  var memberCache = null;
  function checkMember() {
    var s = session();
    if (!s) return Promise.resolve('login');
    if (memberCache) return Promise.resolve(memberCache);
    return fetch(window.SUPABASE_URL + '/rest/v1/member_links?user_id=eq.' + s.uid + '&select=member_status', { headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + s.token } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { var st = rows && rows[0] && rows[0].member_status; memberCache = st === '정회원' ? 'ok' : 'not-member'; return memberCache; })
      .catch(function () { return 'error'; });
  }

  /* ── 오늘의 예배 목록 — 예배 시간 앞뒤 10분 안에서만 뜬다 (한국 시각)
       · 새벽기도회 04:30~06:00 → 04:20~06:10 (달력에 '새벽기도'가 있는 날만, 주일 제외)
       · 수요기도회 수 11:00 (약 한 시간) → 10:50~12:10
       · 주일 낮 예배 09:20~12:30 → 09:10~12:40 ── */
  var PAD = 10;
  var SCHED = [
    { kind: 'dawn',   label: '새벽기도회', time: '새벽 4:30 ~ 6:00',   days: [1, 2, 3, 4, 5, 6], from: 4 * 60 + 30,  to: 6 * 60 },   /* 보통 화~금 — 실제로는 설교작성관리 달력에 '새벽기도'가 있는 날만 뜬다(주일 제외) */
    { kind: 'wed',    label: '수요기도회', time: '오전 11:00',          days: [3],          from: 11 * 60,       to: 12 * 60 },
    { kind: 'sunday', label: '주일 예배',  time: '오전 9:20 ~ 12:30',   days: [0],          from: 9 * 60 + 20,   to: 12 * 60 + 30 }
  ];
  function nowMin() { return today.getUTCHours() * 60 + today.getUTCMinutes(); }
  function services(force) {                      /* force: true = 오늘 요일의 예배를 시간 무시하고, 'sunday'|'wed'|'dawn' = 그 예배만 */
    var out = [], b = sundayBulletin(), n = nowMin();
    SCHED.forEach(function (sc) {
      if (typeof force === 'string') { if (sc.kind !== force) return; }
      else {
        if (sc.days.indexOf(dow) < 0) return;
        if (!force && !(n >= sc.from - PAD && n <= sc.to + PAD)) return;
      }
      var sub = '';
      if (sc.kind === 'sunday') sub = b ? (b.date >= todayStr ? b.title : '지난 주보 · ' + b.title) : '';
      else if (sc.kind === 'wed') { var w = wedInfo(); sub = w ? (w.title ? '«' + w.title + '» · ' : '') + w.ref : ''; }
      else sub = '오늘의 QT 본문';
      out.push({ kind: sc.kind, label: sc.label, sub: sub, time: sc.time });
    });
    return out;
  }

  /* 설교작성관리 달력에 그날 예배가 있는지 — 공개 뷰 worship_schedule(날짜·예배 종류만) */
  function hasSermon(date, service) {
    if (!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY)) return Promise.resolve(false);
    var u = window.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/worship_schedule?select=sermon_date&sermon_date=eq.' + date + '&service=eq.' + encodeURIComponent(service) + '&limit=1';
    return fetch(u, { headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY } })
      .then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) { return !!(rows && rows.length); }).catch(function () { return false; });
  }

  /* ── 히어로 슬라이드 (main.js 보다 먼저 끼워 넣는다) ── */
  function heroSlide() {
    var rot = $('heroRotator'); if (!rot) return;
    var fm = location.search.match(/[?&]worship=(sunday|wed|dawn|1)/), force = fm ? (fm[1] === '1' ? true : fm[1]) : false;   /* ?worship=1|sunday|wed|dawn : 시간과 상관없이 띄움(미리 보기용) */
    var list = services(force); if (!list.length) return;
    /* 새벽기도회는 설교작성관리 달력에 그날 '새벽기도'가 있을 때만 — 확인이 끝난 뒤 끼워 넣는다 */
    var dawn = list.filter(function (s) { return s.kind === 'dawn'; })[0];
    if (dawn && !force) {
      hasSermon(todayStr, '새벽기도').then(function (ok) {
        var rest = list.filter(function (s) { return s.kind !== 'dawn'; });
        if (ok) rest.unshift(dawn);
        if (rest.length) mount(rot, rest);
      });
      return;
    }
    mount(rot, list);
  }
  function mount(rot, list) {
    var d = document.createElement('div'); d.className = 'hero-slide is-active hero-worship'; d.id = 'heroWorship';
    d.innerHTML = '<p class="hw-eyebrow">TODAY’S WORSHIP</p><h1 class="hero-title">오늘의 예배</h1>' +
      '<p class="hero-sub hw-date">' + esc(today.getUTCMonth() + 1) + '월 ' + esc(today.getUTCDate()) + '일 (' + DOWK[dow] + ') · ' + esc(list.map(function (s) { return s.time; }).join(' / ')) + '</p>' +
      '<div class="hw-btns">' + list.map(function (s) { return '<button type="button" class="hero-cta hw-btn" data-kind="' + s.kind + '"><b>' + esc(s.label) + '</b><small>' + esc(s.sub || s.time) + '</small></button>'; }).join('') + '</div>' +
      '<p class="hw-note">정회원 로그인 후 순서대로 볼 수 있습니다</p>';
    /* 예배가 있을 때는 히어로에 예배만 — 다른 슬라이드·말씀 구절·점 표시를 뺀다 (슬라이드가 하나면 main.js 회전기는 돌지 않는다) */
    [].forEach.call(rot.querySelectorAll('.hero-slide'), function (el) { el.remove(); });
    rot.appendChild(d);
    var hero = rot.closest('.hero') || document.body;
    ['.hero-verse', '#heroDots', '.hero-since'].forEach(function (sel) { var el = hero.querySelector(sel); if (el) el.hidden = true; });
    hero.classList.add('hero-worship-only');
    d.addEventListener('click', function (e) { var b = e.target.closest('.hw-btn'); if (b) openGate(b.dataset.kind); });
  }

  /* ── 문: 로그인·정회원 확인 뒤 열기 ── */
  function openGate(kind, ctx) {                 /* ctx: { date, bulletin } — 예배순서 보관함에서 지난 날짜를 열 때 */
    ctx = ctx || {};
    var ov = ensureOverlay();
    ov.hidden = false; document.body.classList.add('ws-open');
    if (window.ModalNav) ModalNav.open(closeViewer);
    setBody('<div class="ws-lock"><div class="ws-lock-t">확인 중…</div></div>');
    $('wsStrip').innerHTML = ''; $('wsStep').textContent = '';
    checkMember().then(function (st) {
      if (st === 'ok') return openKind(kind, ctx);
      if (st === 'login') return lock('로그인이 필요합니다', '오늘의 예배는 교적 인증을 마친 정회원이 볼 수 있습니다. 먼저 로그인해 주세요.', '로그인', function () { closeViewer(); var b = $('loginBtn'); if (b) b.click(); else location.href = 'account.html'; });
      if (st === 'not-member') return lock('정회원 전용입니다', '내 정보에서 교적 연결을 마치시면 바로 보실 수 있습니다.', '내 정보 열기', function () { location.href = 'account.html'; });
      lock('확인하지 못했습니다', '인터넷 연결을 확인한 뒤 다시 시도해 주세요.', '다시 시도', function () { openGate(kind, ctx); });
    });
  }
  function lock(t, m, btn, fn) {
    setBody('<div class="ws-lock"><div class="ws-lock-t">' + esc(t) + '</div><p>' + esc(m) + '</p><button type="button" class="ws-btn primary" id="wsLockBtn">' + esc(btn) + '</button></div>');
    $('wsLockBtn').onclick = fn;
  }

  /* ── 슬라이드 만들기 ── */
  var slides = [], idx = 0, curKind = '';
  function songs(s) { var out = []; String(s).replace(/«([^»]+)»/g, function (_, t) { out.push(t.trim()); }); return out; }
  function hymnTitle(no) { var L = window.HYMNS || []; for (var i = 0; i < L.length; i++) if (L[i].no === no) return L[i].title; return ''; }
  function parseItem(line, b) {
    var p = String(line).split(/\s*·\s*/), head = (p[0] || '').trim(), rest = p.slice(1).join(' · ').trim();
    var hy = rest.match(/(\d{1,3})\s*장/), gd = rest.match(/교독문\s*(\d{1,3})/);
    if (/송영|찬송|찬양/.test(head) && hy && !/성가대|경배와 찬양/.test(head)) return { type: 'hymn', head: head, no: +hy[1], title: songs(rest)[0] || hymnTitle(+hy[1]) };
    if (gd) return { type: 'gyodok', head: head, no: +gd[1], sub: rest.replace(/교독문\s*\d+\s*번?/, '').replace(/[()]/g, '').trim() };
    if (/신앙고백/.test(head) || /사도신경/.test(rest)) return { type: 'creed', head: head };
    if (/주기도문/.test(head) || /주기도문/.test(rest)) return { type: 'lord', head: head };
    if (/성경봉독|본문/.test(head)) return { type: 'bible', head: head, ref: rest };
    if (/말씀강해|설교|말씀/.test(head)) return { type: 'sermon', head: head, title: songs(rest)[0] || rest, ref: b.scripture || '', who: b.preacher || '', quote: b.quote || '' };
    if (/경배와 찬양|성가대/.test(head)) return { type: 'text', head: head, lines: songs(rest).length ? songs(rest) : [rest], big: true };
    return { type: 'text', head: head, lines: [rest] };
  }
  function openKind(kind, ctx) {
    ctx = ctx || {}; curKind = kind; slides = []; idx = 0;
    var date = ctx.date || todayStr;
    if (kind === 'sunday') {
      var b = ctx.bulletin || sundayBulletin();
      if (!b) return setBody('<div class="ws-none">이번 주 주보 자료가 아직 없습니다.</div>');
      slides.push({ type: 'cover', k: '주일 예배', date: (b.dateLabel || b.date) + ' · ' + (b.week || ''), title: b.title, ref: b.scripture, who: b.preacher, quote: b.quote });
      /* 화면에 띄우지 않는 순서: 경배와 찬양·목회 기도·신앙고백·기도·성가대 찬양·헌금봉헌·교회소식·축도 (2026-09-26 목사님 지시) */
      var SKIP = /^(경배와\s*찬양|목회\s*기도|신앙\s*고백|기도|성가대\s*찬양|헌금\s*봉헌|교회\s*소식|축도)$/;
      (b.order || []).forEach(function (l) { var head = String(l).split(/\s*·\s*/)[0].trim(); if (SKIP.test(head)) return; slides.push(parseItem(l, b)); });
      start();
    } else if (kind === 'wed') {
      var w = wedInfo(ctx.bulletin);
      setBody('<div class="ws-lock"><div class="ws-lock-t">수요기도회 자료를 불러오는 중…</div></div>');
      loadService(date, ['수요기도회']).then(function (rec) {
        if (!rec && !w) return setBody('<div class="ws-none">이 주 수요기도회 자료가 없습니다.<br>설교 매니저에 수요기도회 설교를 저장하거나 주보를 올려 주세요.</div>');
        midweekSlides('수요기도회', date, (rec && rec.title) || (w && w.title), (rec && rec.scripture) || (w && w.ref), (rec && rec.preacher) || (w && w.who), rec);
        start();
      });
    } else {
      setBody('<div class="ws-lock"><div class="ws-lock-t">QT 본문을 불러오는 중…</div></div>');
      Promise.all([loadQt(date), loadService(date, ['매일 QT', '새벽기도'])]).then(function (rs) {
        var q = rs[0], rec = rs[1];
        if (!q && !rec) return setBody('<div class="ws-none">이 날 새벽기도회 본문(QT)이 없습니다.</div>');
        midweekSlides('새벽기도회', date, (q && q.title) || (rec && rec.title), (q && q.scripture) || (rec && rec.scripture), rec && rec.preacher, rec);
        var bs = slides.filter(function (x) { return x.type === 'bible'; })[0]; if (bs && q) bs.text = q.qt_bible_text || '';
        start();
      });
    }
  }
  function start() { strip(); render(); }
  function strip() {
    $('wsStrip').innerHTML = slides.map(function (s, i) {
      var lb = s.type === 'cover' ? '표지' : (s.head || '').replace(/\s*·.*$/, '');
      if (s.type === 'hymn') lb += ' ' + s.no + '장';
      return '<button type="button" class="ws-chip" data-i="' + i + '">' + esc(lb) + '</button>';
    }).join('');
  }
  function linesHtml(arr, cls) { return '<div class="ws-lines ' + (cls || '') + '">' + arr.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</div>'; }
  function gyodokHtml(g) {
    var h = '', role = 0;
    g.body.forEach(function (line) {
      var all = /^\(다\s*같이\)/.test(line), txt = all ? line.replace(/^\(다\s*같이\)\s*/, '') : line, ref = '';
      var m = txt.match(/\s*\(([^()]*\d[^()]*)\)\s*$/); if (m) { ref = m[1]; txt = txt.slice(0, m.index); }
      h += '<p class="gd-line ' + (all ? 'gd-all' : (role ? 'gd-people' : 'gd-leader')) + '"><span class="gd-who">' + (all ? '다같이' : (role ? '회중' : '인도자')) + '</span><span class="gd-txt">' + esc(txt) + (ref ? '<small class="gd-ref">(' + esc(ref) + ')</small>' : '') + '</span></p>';
      if (!all) role = 1 - role;
    });
    return '<div class="ws-gd">' + h + '</div>';
  }
  function render() {
    var s = slides[idx]; if (!s) return;
    $('wsStep').textContent = (idx + 1) + ' / ' + slides.length;
    $('wsPrev').disabled = idx <= 0; $('wsNext').disabled = idx >= slides.length - 1;
    [].forEach.call($('wsStrip').children, function (c, i) { c.classList.toggle('on', i === idx); if (i === idx) try { c.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {} });
    var head = s.head ? '<div class="ws-head">' + esc(s.head) + '</div>' : '', h = '';
    if (s.type === 'cover') {
      h = '<div class="ws-cover"><div class="ws-cover-k">' + esc(s.k) + '</div><div class="ws-cover-date">' + esc(s.date) + '</div><div class="ws-cover-t">' + esc(s.title || '') + '</div>' +
        '<div class="ws-cover-s">' + esc(s.ref || '') + (s.who ? ' · ' + esc(s.who) : '') + '</div>' + (s.quote ? '<div class="ws-cover-q">' + esc(s.quote) + '</div>' : '') +
        '<div class="ws-tip">옆으로 밀거나 [다음]을 누르면 순서대로 이어집니다</div></div>';
    } else if (s.type === 'hymn') {
      h = head + '<div class="ws-item-t"><b>' + s.no + '장</b> ' + esc(s.title || '') + '</div><div class="ws-img" id="wsImgBox"><img id="wsImg" src="' + HYMN_IMG + ('00' + s.no).slice(-3) + '.webp" alt="새찬송가 ' + s.no + '장"></div><div class="ws-tip">두 손가락으로 벌리면 커집니다</div>';
    } else if (s.type === 'gyodok') {
      var g = (window.GYODOK || []).filter(function (x) { return x.no === s.no; })[0];
      h = head + '<div class="ws-item-t"><b>교독문 ' + s.no + '번</b> ' + esc(s.sub || (g ? g.title : '')) + '</div>' + (g ? gyodokHtml(g) : '<div class="ws-none">교독문 ' + s.no + '번 자료가 없습니다</div>');
    } else if (s.type === 'creed') { h = head + '<div class="ws-title">사도신경</div>' + linesHtml(CREED, 'ws-creed'); }
    else if (s.type === 'lord') { h = head + '<div class="ws-title">주기도문</div>' + linesHtml(LORD, 'ws-creed'); }
    else if (s.type === 'bible') {
      h = head + '<div class="ws-title">' + esc(s.ref) + '</div><div class="ws-verses" id="wsVerses"><p class="ws-tip">본문을 불러오는 중…</p></div>';
    } else if (s.type === 'sermon') {
      h = head + '<div class="ws-cover"><div class="ws-cover-t">' + esc(s.title || '') + '</div><div class="ws-cover-s">' + esc(s.ref || '') + (s.who ? ' · ' + esc(s.who) : '') + '</div>' + (s.quote ? '<div class="ws-cover-q">' + esc(s.quote) + '</div>' : '') + '</div>';
    } else { h = head + linesHtml(s.lines || [], s.big ? 'ws-big' : ''); }
    setBody(h);
    if (s.type === 'hymn') pinch($('wsImgBox'), $('wsImg'));
    if (s.type === 'bible') fillBible(s);
  }
  function fillBible(s) {
    var box = $('wsVerses'), p = parseRef(s.ref);
    function paint(list, multi) {
      if (!box || !box.isConnected) return;
      box.innerHTML = list.length ? list.map(function (v) { return '<p><span class="ws-vn">' + (multi ? v.ch + ':' : '') + v.v + '</span>' + esc(v.t) + '</p>'; }).join('') + '<p class="ws-tip">개역개정</p>' : '<div class="ws-none">본문을 찾지 못했습니다 — ' + esc(s.ref) + '</div>';
    }
    if (!p) {                                                   /* 구절을 못 읽으면 QT 에 담긴 본문 글로 */
      if (s.text) { box.innerHTML = linesHtml(String(s.text).split(/\n+/).filter(Boolean)); return; }
      return paint([], false);
    }
    loadBible().then(function (d) {
      if (!d) { if (s.text) box.innerHTML = linesHtml(String(s.text).split(/\n+/).filter(Boolean)); else paint([], false); return; }
      paint(versesFor(d, p), p.c1 !== p.c2);
    });
  }
  function setBody(h) { var b = $('wsBody'); b.innerHTML = h; b.scrollTop = 0; b.scrollLeft = 0; }
  function go(i) { if (i < 0 || i >= slides.length) return; idx = i; render(); }

  /* ── 손짓: 좌우 밀기, 두 손가락 확대 ── */
  function swipe(el, fn) {
    var sx = 0, sy = 0, sl = 0, on = false;
    el.addEventListener('touchstart', function (e) { if (e.touches.length !== 1) { on = false; return; } on = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY; sl = el.scrollLeft; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (!on) return; on = false;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      var box = $('wsImgBox');
      if (box) { var maxL = box.scrollWidth - box.clientWidth; if (maxL > 2) { if (dx < 0 && box.scrollLeft < maxL - 2) return; if (dx > 0 && box.scrollLeft > 2) return; } }
      fn(dx < 0 ? -1 : 1);
    }, { passive: true });
  }
  function pinch(box, img) {
    var d0 = 0, z0 = 1, z = 1, on = false;
    function dist(t) { var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
    box.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { on = true; d0 = dist(e.touches); z0 = z; } else on = false; }, { passive: true });
    box.addEventListener('touchmove', function (e) {
      if (!on || e.touches.length !== 2) return;
      e.preventDefault();
      var r = box.getBoundingClientRect(), mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      var px = (box.scrollLeft + mx) / z, py = (box.scrollTop + my) / z;
      z = Math.max(1, Math.min(4, z0 * dist(e.touches) / d0)); img.style.width = (z * 100) + '%';
      box.scrollLeft = px * z - mx; box.scrollTop = py * z - my;
    }, { passive: false });
    box.addEventListener('touchend', function (e) { if (e.touches.length < 2) on = false; }, { passive: true });
    box.addEventListener('dblclick', function () { z = z === 1 ? 2 : 1; img.style.width = (z * 100) + '%'; });
  }

  /* ── 전체 화면 ── */
  var overlay = null, textSize = 1;
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div'); overlay.id = 'wsOverlay'; overlay.hidden = true; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', '오늘의 예배');
    overlay.innerHTML =
      '<div class="ws-card">' +
        '<div class="ws-top"><b>오늘의 예배</b><span class="ws-step" id="wsStep"></span><span class="ws-sp"></span>' +
          '<button type="button" class="ws-ib" id="wsSmall" title="글자 작게">A−</button><button type="button" class="ws-ib" id="wsLarge" title="글자 크게">A+</button>' +
          '<button type="button" class="ws-ib ws-x" id="wsClose" aria-label="닫기">×</button></div>' +
        '<div class="ws-strip" id="wsStrip"></div>' +
        '<div class="ws-body" id="wsBody"></div>' +
        '<div class="ws-nav"><button type="button" class="ws-btn" id="wsPrev">◀ 이전</button><button type="button" class="ws-btn primary" id="wsNext">다음 ▶</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    $('wsClose').onclick = function () { if (window.ModalNav) ModalNav.close(); else closeViewer(); };
    $('wsPrev').onclick = function () { go(idx - 1); };
    $('wsNext').onclick = function () { go(idx + 1); };
    $('wsStrip').addEventListener('click', function (e) { var c = e.target.closest('.ws-chip'); if (c) go(+c.dataset.i); });
    $('wsSmall').onclick = function () { setSize(-0.1); }; $('wsLarge').onclick = function () { setSize(0.1); };
    swipe($('wsBody'), function (dir) { go(idx + (dir < 0 ? 1 : -1)); });
    document.addEventListener('keydown', function (e) {
      if (overlay.hidden) return;
      if (e.key === 'ArrowLeft') { go(idx - 1); e.preventDefault(); } else if (e.key === 'ArrowRight') { go(idx + 1); e.preventDefault(); }
    });
    try { textSize = +localStorage.getItem('wpc.worship.size') || 1; } catch (e) {}
    setSize(0);
    return overlay;
  }
  function setSize(d) { textSize = Math.max(0.8, Math.min(1.8, +(textSize + d).toFixed(2))); var b = $('wsBody'); if (b) b.style.fontSize = (textSize * 100) + '%'; try { localStorage.setItem('wpc.worship.size', String(textSize)); } catch (e) {} }
  function closeViewer() { if (!overlay) return; overlay.hidden = true; document.body.classList.remove('ws-open'); }

  window.WPCWorship = { open: openGate, close: closeViewer, services: services, wedInfo: wedInfo, bulletins: bulletins, today: todayStr };
  heroSlide();
})();
