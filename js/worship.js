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
  /* 온라인 헌금 계좌 (js/layout.js 의 온라인 헌금 모달과 같은 계좌) */
  var GIVE = { bank: '농협', no: '3511344798723', pretty: '351-1344-7987-23', holder: '운평장로교회', toss: 'supertoss://send?bank=농협&accountNo=3511344798723' };
  var HYMN_IMG = 'modu/data/hymn/';

  /* ── 오늘(한국 시각) ── */
  function kst() { return new Date(Date.now() + 9 * 3600000); }   /* UTC 값(getUTC*)이 한국 시각이 되도록 9시간을 더한다 — 예전 식은 한국 시간대 PC 에서 보정이 0이 되어 UTC 를 썼다 */
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
    var s = session();                                          /* 로그인하지 않아도 공개 뷰로 읽는다 (2026-09-27) */
    if (!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY)) return Promise.resolve((svcCache[key] = null));
    var svIn = '&sermon_date=eq.' + date + '&service=in.(' + services.map(encodeURIComponent).join(',') + ')&limit=5';
    var u = window.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/worship_published?select=sermon_date,service,title,scripture,hymns,gyodok,preacher,songs' + svIn;
    /* 공개 뷰는 한국 시각 '오늘까지'만 보인다 — 내일 수요기도회를 미리 보면 설교 매니저 기록이 안 잡혀 주보 제목만 나오고 찬송이 빠졌다(2026-09-29).
       관리자(담임목사)는 설교 매니저 기록(sermons)을 직접 읽어 앞날도 미리 본다. 교인은 그대로 그날부터. */
    function direct() {
      if (!s || date <= todayStr) return Promise.resolve(null);
      return isAdmin().then(function (ok) {
        if (!ok) return null;
        return fetch(window.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/sermons?select=sermon_date,service,title,scripture,hymns,gyodok,preacher,summary,worship_order' + svIn, { headers: sbHeaders() })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (rows) {
            return (rows || []).map(function (r) {   /* worship_order 에서 찬양 자리만 골라 뷰의 songs 와 같은 모양으로 (worship_songs_of 와 같은 규칙) */
              var wo = []; try { wo = JSON.parse(r.worship_order || '[]') || []; } catch (e) { wo = []; }
              var songs = (Array.isArray(wo) ? wo : []).map(function (e) { var k = e && joySlotKey(e.label); return k ? { label: k, detail: e.detail, jnos: e.jnos || [], items: e.items || [] } : null; }).filter(Boolean);
              var conti = (Array.isArray(wo) ? wo : []).filter(function (e) { return e && e.label && !e.noexport; }).map(function (e) { return { label: e.label, items: e.items, jnos: e.jnos, hno: e.hno, detail: /^(교독|성시교독)/.test(String(e.label).replace(/\s+/g, '')) ? e.detail : undefined }; });
              var o = Object.assign({}, r, { songs: songs.length ? songs : null, conti: conti.length ? conti : null }); delete o.worship_order; return o;
            });
          });
      }).catch(function () { return null; });
    }
    var hd = { headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (s ? s.token : window.SUPABASE_ANON_KEY) } };
    return fetch(u.replace(',songs', ',songs,conti,summary'), hd)   /* summary = 말씀 블록의 설교 요약 (20260930_1100_worship_summary.sql) — SQL 실행 전이면 빼고 다시 */
      .then(function (r) { return r.ok ? r : fetch(u.replace(',songs', ',songs,conti'), hd); })   /* conti = 설교 매니저의 예배 순서 콘티 (20260929_1400_worship_conti.sql) — SQL 실행 전이면 conti 없이 다시 */
      .then(function (r) { return r.ok ? r : fetch(u, hd); })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) { return rows && rows.length ? rows : direct(); })
      .then(function (rows) {
        /* 같은 날 여러 기록(예: 새벽 = '매일 QT' + '새벽기도')이 있으면 앞 순서 기록을 바탕으로, 비어 있는 칸(찬송가·교독문·찬양 등)은 뒤 기록에서 채운다
           — 예전엔 첫 기록만 써서 '새벽기도'에 넣은 찬송가가 '매일 QT'에 가려 나오지 않았다 (2026-09-29) */
        var pick = null;
        services.forEach(function (sv) {
          (rows || []).filter(function (r) { return r.service === sv; }).forEach(function (r) {
            if (!pick) { pick = Object.assign({}, r); return; }
            ['title', 'scripture', 'hymns', 'gyodok', 'preacher', 'songs', 'conti', 'summary'].forEach(function (f) {
              var v = pick[f]; if (v == null || v === '' || (Array.isArray(v) && !v.length)) pick[f] = r[f];
            });
          });
        });
        svcCache[key] = pick; return pick;
      })
      .catch(function () { svcCache[key] = null; return null; });
  }
  function hymnNos(str) { return String(str || '').split(/[,\s·]+/).map(function (x) { return parseInt(x, 10); }).filter(function (n) { return n >= 1 && n <= 645; }); }
  function gyodokNo(str) { var m = String(str || '').match(/(\d{1,3})/); return m ? +m[1] : 0; }
  /* 새벽·수요기도회 순서: 찬송 → 교독문 → 본문 → 말씀 */
  /* 설교 매니저 '예배 순서(콘티)' — 블록 순서 그대로 (말씀 블록이 있을 때만 콘티로 본다, 2026-09-29) */
  function contiSlides(rec, title, ref, who) {
    var out = [], hasBible = false;
    rec.conti.forEach(function (e) {
      var lb = String(e.label || ''), k = joySlotKey(lb), nb = lb.replace(/\s+/g, '');
      if (k) { var head = k === '경배와 찬양' ? '예배 전 찬양' : k === '예배 찬양' ? '찬양' : k === '성가대 찬양' ? '성가곡' : '입례송'; [].push.apply(out, joySlides(head, [], e.jnos, e.items)); }
      else if (nb === '찬송') {
        var its = e.items && e.items.length ? e.items : (e.hno ? [{ b: 'h', n: +e.hno }] : hymnNos(rec.hymns).map(function (n) { return { b: 'h', n: n }; }));
        [].push.apply(out, joySlides('찬송', [], null, its));
      }
      else if (/^(교독|성시교독)/.test(nb)) { var g = gyodokNo(e.detail || rec.gyodok); if (g) out.push({ type: 'gyodok', head: '성시교독', no: g, sub: String(e.detail || rec.gyodok || '').replace(/^\d+\.?\s*/, '') }); }
      else if (/^(성경|본문)/.test(nb)) { if (ref) { out.push({ type: 'bible', head: '성경봉독', ref: ref }); hasBible = true; } }
      else if (/^말씀/.test(nb)) { if (ref && !hasBible) { out.push({ type: 'bible', head: '성경봉독', ref: ref }); hasBible = true; } out.push({ type: 'sermon', head: '말씀', title: title || '', ref: ref || '', who: who || '', quote: '', summary: rec.summary || null }); }
      else if (/주기도/.test(nb)) out.push({ type: 'lord', head: '주기도문' });
      else if (/사도신경|신앙고백/.test(nb)) out.push({ type: 'creed', head: '신앙고백' });
      else out.push({ type: 'text', head: lb, lines: [lb], big: true });
    });
    return out;
  }
  function midweekSlides(k, date, title, ref, who, rec) {
    slides.push({ type: 'cover', k: k, date: dateLabel(date), title: title || '', ref: ref || '', who: who || '', quote: '' });
    if (rec && Array.isArray(rec.conti) && rec.conti.some(function (e) { return /^말씀/.test(String(e && e.label || '').replace(/\s+/g, '')); })) { [].push.apply(slides, contiSlides(rec, title, ref, who)); return; }
    var SGm = {}; ((rec && rec.songs) || []).forEach(function (x) { if (x && x.label) SGm[x.label] = x; });   /* 기쁨으로 찬양 (2026-09-27) */
    if (SGm['경배와 찬양']) [].push.apply(slides, joySlides('경배와 찬양', [], SGm['경배와 찬양'].jnos, SGm['경배와 찬양'].items));
    if (SGm['예배 찬양']) [].push.apply(slides, joySlides('예배 찬양', [], SGm['예배 찬양'].jnos, SGm['예배 찬양'].items));   /* 수요기도회: 예배 전 찬양 다음 예배 찬양 2~3곡 (2026-09-29) */
    if (SGm['입례송']) [].push.apply(slides, joySlides('입례송', [], SGm['입례송'].jnos, SGm['입례송'].items));
    if (rec) {
      hymnNos(rec.hymns).forEach(function (n) { slides.push({ type: 'hymn', head: '찬송', no: n, title: hymnTitle(n) }); });
      var g = gyodokNo(rec.gyodok); if (g) slides.push({ type: 'gyodok', head: '성시교독', no: g, sub: String(rec.gyodok).replace(/^\d+\.?\s*/, '') });
    }
    if (ref) slides.push({ type: 'bible', head: '성경 본문', ref: ref });
    if (SGm['성가대 찬양']) [].push.apply(slides, joySlides('성가대 찬양', [], SGm['성가대 찬양'].jnos, SGm['성가대 찬양'].items));
    slides.push({ type: 'sermon', head: '말씀', title: title || '', ref: ref || '', who: who || '', quote: '', summary: (rec && rec.summary) || null });
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
       · 주일 1부 09:20~10:40 → 09:10~10:50, 2부 11:00~12:30 → 10:50~12:40 (둘 다 같은 주보 순서) ── */
  var PAD = 10;
  var SCHED = [
    { kind: 'dawn',   label: '새벽기도회', time: '새벽 4:30 ~ 6:00',   days: [1, 2, 3, 4, 5, 6], from: 4 * 60 + 30,  to: 6 * 60 },   /* 보통 화~금 — 실제로는 설교작성관리 달력에 '새벽기도'가 있는 날만 뜬다(주일 제외) */
    { kind: 'wed',    label: '수요기도회', time: '오전 11:00',          days: [3],          from: 11 * 60,       to: 12 * 60, lead: 60 },   /* 1시간 전부터 카운트 */
    { kind: 'sunday', part: 1, label: '주일 1부 예배', time: '오전 9:20',  days: [0], from: 9 * 60 + 20, to: 10 * 60 + 40, lead: 200 },   /* 안내는 오전 6시(200분 전)부터 */
    { kind: 'sunday', part: 2, label: '주일 2부 예배', time: '오전 11:00', days: [0], from: 11 * 60,     to: 12 * 60 + 30, lead: 30 }
  ];
  function byPart(p) { for (var i = 0; i < SCHED.length; i++) if (SCHED[i].kind === 'sunday' && SCHED[i].part === p) return SCHED[i]; return null; }
  /* 오늘 1부 예배에 들어간 사람(같은 기기) — 2부 안내·카운트를 띄우지 않는다 */
  function joinedKey() { return 'ws_joined_' + todayStr; }
  function joined() { try { return localStorage.getItem(joinedKey()); } catch (e) { return null; } }
  function markJoined(part) { try { localStorage.setItem(joinedKey(), String(part)); } catch (e) {} }
  function refreshClock() { today = kst(); todayStr = ymd(today); dow = today.getUTCDay(); applySunday(); }
  /* 이번 주일에 1부가 있는가 — 주보로 판단: combined: true/false 가 있으면 그대로, 없으면 소식에 '통합 예배'가 있으면 1부 없음(11시 한 번) */
  function combinedSunday() {
    var b = sundayBulletin(); if (!b) return false;
    if (b.combined === true || b.combined === false) return b.combined;
    var txt = (b.news || []).map(function (n) { return (n.title || '') + ' ' + (n.detail || ''); }).join(' ') + ' ' + (b.note || '') + ' ' + (b.notice || '');
    return /통합\s*예배/.test(txt);
  }
  function partName(sc) { return sc && sc.kind === 'sunday' && !sc.single && sc.part ? sc.part + '부 ' : ''; }
  function applySunday() {
    var comb = combinedSunday(), p1 = byPart(1), p2 = byPart(2);
    p1.days = comb ? [] : [0];
    p2.single = comb; p2.label = comb ? '주일 예배' : '주일 2부 예배'; p2.lead = comb ? 200 : 30;   /* 통합이면 11시 예배 하나를 6시부터 안내 */
  }
  applySunday();
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
      out.push({ kind: sc.kind, part: sc.part || 0, label: sc.label, sub: sub, time: sc.time });
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
  /* ── 출석 (2026-09-27) — 히어로의 예배 단추를 누르면 서버가 시각을 다시 확인해 교적 열쇠로 출석을 남긴다. 미리 보기(?worship=)는 세지 않는다 ── */
  var heroForce = false;
  function serviceName(kind, part) {
    if (kind === 'sunday') { var p = byPart(+part); return p && p.single ? '주일 예배' : '주일 ' + part + '부'; }
    return kind === 'wed' ? '수요기도회' : kind === 'dawn' ? '새벽기도회' : '';
  }
  function attend(kind, part) {
    var s = session(), svc = serviceName(kind, part);
    if (!svc || heroForce) return;
    if (!s) { toastWs('로그인하면 출석이 기록됩니다'); return; }
    fetch(window.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/attend_hero', { method: 'POST',
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_service: svc }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) return;
        if (j.ok && !j.already) toastWs('출석했습니다 — ' + svc + (j.late ? ' · ' + j.late_min + '분 늦음' : ' · 정시'));
        else if (j.ok && j.already) toastWs('오늘 ' + svc + ' 출석은 이미 되어 있습니다');
        else if (j.why === 'member') toastWs('내 정보에서 교적을 연결하면 출석이 기록됩니다');
      }).catch(function () {});
  }
  function heroSlide() {
    var rot = $('heroRotator'); if (!rot) return;
    var fm = location.search.match(/[?&]worship=(sunday|wed|dawn|countdown(?:-wed|-dawn|-2)?|1)/), force = fm ? (fm[1] === '1' ? true : fm[1]) : false;   /* ?worship=1|sunday|wed|dawn|countdown|countdown-wed|countdown-dawn : 시간과 상관없이 띄움(미리 보기용) */
    var list = services(force); heroForce = force;
    if (!list.length) {
      /* 예배 전 안내: 주일은 오전 6시부터 '오늘은 주일입니다'(1시간 전부터 카운트), 수요·새벽은 30분 전부터 '곧 예배가 시작됩니다' + 카운트
         — 그날 예배가 있을 때만(새벽: 달력의 '새벽기도', 수요: 주보의 수요기도회 줄 또는 달력의 '수요기도회') */
      if (typeof force === 'string' && force.indexOf('countdown') === 0) { var pk = force === 'countdown-wed' ? byKind('wed') : force === 'countdown-dawn' ? byKind('dawn') : force === 'countdown-2' ? byPart(2) : byPart(1); return mountCountdown(rot, pk, true); }
      if (force) return;
      var n = nowMin();
      SCHED.forEach(function (sc) {
        if (sc.days.indexOf(dow) < 0) return;
        var lead = sc.lead || 30;
        if (!(n >= sc.from - lead && n < sc.from - PAD)) return;
        if (sc.kind === 'sunday' && sc.part === 2 && !sc.single && joined()) return;   /* 1부에 들어간 사람에겐 2부 카운트를 띄우지 않는다 */
        var chk = sc.kind === 'dawn' ? hasSermon(todayStr, '새벽기도') : sc.kind === 'wed' ? (wedInfo() ? Promise.resolve(true) : hasSermon(todayStr, '수요기도회')) : Promise.resolve(true);
        chk.then(function (ok) { if (ok && !$('heroWorship')) mountCountdown(rot, sc, false); });
      });
      return;
    }
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
    /* 주일 1부 진행 중(10:30~10:50)에 2부 카운트가 겹치는 때: 1부에 들어가지 않은 사람에게는 2부 카운트를 */
    if (!force && dow === 0) {
      var p2 = byPart(2), live1 = list.filter(function (s) { return s.kind === 'sunday' && s.part === 1; })[0];
      if (live1 && p2 && nowMin() >= p2.from - p2.lead && nowMin() < p2.from - PAD && !joined()) { mountCountdown(rot, p2, false); watch(rot); return; }
      if (live1) list = list.filter(function (s) { return !(s.kind === 'sunday' && s.part === 2); });   /* 1부 진행 중에는 2부 안내를 빼고 */
    }
    mount(rot, list);
    watch(rot);
  }
  /* 시간이 흐르며 예배 칸이 바뀌면(1부 끝 → 2부, 예배 끝) 30초마다 다시 셈한다 */
  var watchTm = 0;
  function watch(rot) {
    if (watchTm) return;
    function sig() { refreshClock(); var p2 = byPart(2); return services(false).map(function (s) { return s.kind + s.part; }).join(',') + '|' + (dow === 0 && nowMin() >= p2.from - p2.lead && nowMin() < p2.from - PAD && !joined() ? 'c2' : ''); }
    var last = sig();
    watchTm = setInterval(function () {
      if (document.body.classList.contains('ws-open')) return;           /* 예배 보기 창이 열려 있으면 건드리지 않는다 */
      var now = sig(); if (now === last) return; last = now;
      if (now === '|') { location.reload(); return; }                    /* 예배가 다 끝났으면 원래 첫 화면으로 */
      clearInterval(watchTm); watchTm = 0; var el = $('heroWorship'); if (el) el.remove(); heroSlide();
    }, 30000);
  }
  function mount(rot, list) {
    var d = document.createElement('div'); d.className = 'hero-slide is-active hero-worship'; d.id = 'heroWorship';
    var sp = list.length === 1 && list[0].kind === 'sunday' ? list[0] : null;   /* 주일: 'N부 예배가 진행 중입니다' + 'N부 예배 참여하기' (통합이면 '예배가 진행 중입니다') */
    d.innerHTML = '<p class="hw-eyebrow">' + (sp ? 'THE LORD’S DAY' : 'TODAY’S WORSHIP') + '</p><h1 class="hero-title">' + (sp ? partName(byPart(sp.part)) + '예배가 진행 중입니다' : '오늘의 예배') + '</h1>' +
      '<p class="hero-sub hw-date">' + esc(today.getUTCMonth() + 1) + '월 ' + esc(today.getUTCDate()) + '일 (' + DOWK[dow] + ') · ' + esc(list.map(function (s) { return (s.kind === 'sunday' ? s.label + ' ' : '') + s.time; }).join(' / ')) + '</p>' +
      '<div class="hw-btns">' + list.map(function (s) { return '<button type="button" class="hero-cta hw-btn" data-kind="' + s.kind + '" data-part="' + (s.part || '') + '"><b>' + esc(s.kind === 'sunday' ? partName(byPart(s.part)) + '예배 참여하기' : s.label) + '</b><small>' + esc(s.sub || s.time) + '</small></button>'; }).join('') + '</div>' +
      '';
    /* 예배가 있을 때는 히어로에 예배만 — 다른 슬라이드·말씀 구절·점 표시를 뺀다 (슬라이드가 하나면 main.js 회전기는 돌지 않는다) */
    [].forEach.call(rot.querySelectorAll('.hero-slide'), function (el) { el.remove(); });
    rot.appendChild(d);
    var hero = rot.closest('.hero') || document.body;
    ['.hero-verse', '#heroDots', '.hero-since'].forEach(function (sel) { var el = hero.querySelector(sel); if (el) el.hidden = true; });
    hero.classList.add('hero-worship-only');
    d.addEventListener('click', function (e) { var b = e.target.closest('.hw-btn'); if (!b) return; if (b.dataset.kind === 'sunday' && b.dataset.part) markJoined(b.dataset.part); attend(b.dataset.kind, b.dataset.part); openGate(b.dataset.kind); });
  }

  /* ── 예배 전 안내 슬라이드 — 시간이 되면(예배 10분 전) 스스로 '오늘의 예배'로 바뀐다
       · 주일 1부: 오전 6시부터 '오늘은 주일입니다', 1시간 전부터 '곧 1부 예배가 시작됩니다' + 남은 시간
       · 주일 2부: 10:30부터 '곧 2부 예배가 시작됩니다' + 남은 시간 (1부에 들어간 사람 제외)
       · 수요: 1시간 전, 새벽: 30분 전부터 '곧 예배가 시작됩니다' + 남은 시간 ── */
  function byKind(k) { for (var i = 0; i < SCHED.length; i++) if (SCHED[i].kind === k) return SCHED[i]; return SCHED[2]; }
  function mountCountdown(rot, sc, preview) {
    var b = sundayBulletin(), w = sc.kind === 'wed' ? wedInfo() : null, soonSec = (sc.kind === 'sunday' && (sc.part === 1 || sc.single)) || sc.kind === 'wed' ? 3600 : 1800;   /* 주일 1부(통합이면 그 예배)·수요는 1시간 전, 2부·새벽은 30분 전부터 카운트 */
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    var info = sc.kind === 'sunday' ? (b && b.date >= todayStr && b.title ? '«' + esc(b.title) + '»' + (b.scripture ? ' · ' + esc(b.scripture) : '') : '')
             : sc.kind === 'wed' ? (w ? (w.title ? '«' + esc(w.title) + '»' : '') + (w.ref ? (w.title ? ' · ' : '') + esc(w.ref) : '') : '')
             : '오늘의 QT 본문';
    var d = document.createElement('div'); d.className = 'hero-slide is-active hero-worship hero-countdown'; d.id = 'heroWorship';
    d.innerHTML = '<p class="hw-eyebrow">' + (sc.kind === 'sunday' ? 'THE LORD’S DAY' : 'TODAY’S WORSHIP') + '</p><h1 class="hero-title" id="hwTitle">곧 예배가 시작됩니다</h1>' +
      '<p class="hero-sub hw-date">' + esc(today.getUTCMonth() + 1) + '월 ' + esc(today.getUTCDate()) + '일 (' + DOWK[dow] + ') · ' + esc(sc.label) + ' ' + esc(sc.time) + '</p>' +
      (info ? '<p class="hw-sermon">' + info + '</p>' : '') +
      '<div class="hw-count" id="hwCount" aria-live="polite"></div>' +
      '<div class="hw-btns" id="hwPrep" hidden><button type="button" class="hero-cta hw-btn"><b>오늘의 예배 보기</b><small>말씀을 미리 읽고 준비하세요</small></button></div>' +
      '<p class="hw-note" id="hwNote"></p>';
    [].forEach.call(rot.querySelectorAll('.hero-slide'), function (el) { el.remove(); });
    rot.appendChild(d);
    /* 카운트가 도는 동안(1시간·30분 전)에도 예배 순서·본문을 미리 볼 수 있다 — 출석은 예배 시간에만 (2026-09-27)
       방송실 전체 화면(.hw-fs)에서는 .hw-btns 가 숨겨져 카운트만 나간다 */
    d.querySelector('#hwPrep button').addEventListener('click', function () { openGate(sc.kind); });
    var hero = rot.closest('.hero') || document.body;
    ['.hero-verse', '#heroDots', '.hero-since'].forEach(function (sel) { var el = hero.querySelector(sel); if (el) el.hidden = true; });
    hero.classList.add('hero-worship-only');
    fsButton(hero);
    var tm = 0, startDow = dow;
    function tick() {
      var n = kst(), left = sc.from * 60 - (n.getUTCHours() * 3600 + n.getUTCMinutes() * 60 + n.getUTCSeconds());
      if (!preview && (n.getUTCDay() !== startDow || left <= PAD * 60)) {   /* 예배 10분 전 → 오늘의 예배 슬라이드로 */
        clearInterval(tm); refreshClock();
        d.remove(); heroSlide(); return;
      }
      if (left < 0) left = 0;
      var soon = preview || left <= soonSec, box = $('hwCount'), t = $('hwTitle'), note = $('hwNote');
      if (t) t.textContent = soon ? '곧 ' + partName(sc) + '예배가 시작됩니다' : '오늘은 주일입니다';
      if (note) note.textContent = soon ? '예배 시작까지 남은 시간' : '';
      var prep = $('hwPrep'); if (prep) prep.hidden = !soon;
      if (box) { box.hidden = !soon; if (soon) { var h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s = left % 60; box.innerHTML = (h ? '<span><b>' + h + '</b>시간</span>' : '') + '<span><b>' + pad(m) + '</b>분</span><span><b>' + pad(s) + '</b>초</span>'; } }
    }
    tick(); tm = setInterval(tick, 1000);
  }

  /* ── 방송실: 예배 전 카운트를 전체 화면으로 (방송실 관리자·관리자만 버튼이 보인다) ──
       · 방송실 관리자 = member_links.can_broadcast (교적관리 > 권한 관리에서 지명), 판단은 rpc broadcast_access
       · Esc 로 끝낸다 — 천천히 어두워지며 사라진다(페이드 아웃). 크롬·엣지는 키보드 잠금(navigator.keyboard.lock)으로
         Esc 를 페이지가 먼저 받아 페이드 뒤에 전체 화면을 끈다. 잠금이 안 되는 브라우저는 Esc 에 바로 꺼진다 ── */
  var bcCache = null;
  function canBroadcast() {
    var s = session(); if (!s || !window.SUPABASE_URL) return Promise.resolve(false);
    if (bcCache !== null) return Promise.resolve(bcCache);
    return fetch(window.SUPABASE_URL + '/rest/v1/rpc/broadcast_access', { method: 'POST', headers: sbHeaders(), body: '{}' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (a) { return a ? !!(a.isAdmin || a.canBroadcast) : isAdmin(); })   /* SQL 실행 전이면 관리자만 */
      .then(function (ok) { bcCache = ok; return ok; }).catch(function () { return isAdmin(); });
  }
  function fsOn(hero) { return document.fullscreenElement === hero || document.webkitFullscreenElement === hero || hero.classList.contains('hw-fs-fake'); }
  var FADE_MS = 900, fading = false;
  function fsDone(hero) {
    hero.classList.remove('hw-fs', 'hw-fs-fake'); document.body.classList.remove('hw-fs-body');
    try { if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch (e) {}
    requestAnimationFrame(function () { hero.classList.remove('hw-fs-out'); fading = false; });   /* 원래 화면은 다시 서서히 밝아진다 */
  }
  function fsExit(hero) {
    if (fading) return; fading = true;
    hero.classList.add('hw-fs-out');
    setTimeout(function () {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        var p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        if (p && p.then) p.then(function () { fsDone(hero); }, function () { fsDone(hero); }); else fsDone(hero);
      } else fsDone(hero);
    }, FADE_MS);
  }
  function fsEnter(hero) {
    hero.classList.add('hw-fs');
    var req = hero.requestFullscreen || hero.webkitRequestFullscreen;
    var p = req ? req.call(hero) : null;
    function fake() { hero.classList.add('hw-fs-fake'); document.body.classList.add('hw-fs-body'); }
    function lockEsc() { try { if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(function () {}); } catch (e) {} }
    if (!req) fake(); else if (p && p.then) p.then(lockEsc, fake); else lockEsc();
    setTimeout(function () { if (hero.classList.contains('hw-fs') && !document.fullscreenElement && !document.webkitFullscreenElement) fake(); }, 1200);   /* 전체 화면이 끝내 안 열리면 화면 채우기로 */
  }
  var fsBound = false;
  function fsButton(hero) {
    if (hero === document.body || hero.querySelector('.hw-fsbtn')) return;
    canBroadcast().then(function (ok) {
      if (!ok || hero.querySelector('.hw-fsbtn')) return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'hw-fsbtn'; b.title = '예배 전 카운트를 전체 화면으로 (Esc: 끝내기)';
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>전체 보기';
      b.addEventListener('click', function () { fsEnter(hero); });
      hero.appendChild(b);
      if (fsBound) return; fsBound = true;
      function sync() { if (!fading && !document.fullscreenElement && !document.webkitFullscreenElement && !hero.classList.contains('hw-fs-fake')) fsDone(hero); }
      document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && fsOn(hero)) { e.preventDefault(); fsExit(hero); } });
    });
  }

  /* ── 문: 로그인·정회원 확인 뒤 열기 ── */
  function openGate(kind, ctx) {                 /* ctx: { date, bulletin } — 예배순서 보관함에서 지난 날짜를 열 때 */
    ctx = ctx || {};
    var ov = ensureOverlay();
    ov.hidden = false; document.body.classList.add('ws-open');
    if (window.ModalNav) ModalNav.open(closeViewer);
    setBody('<div class="ws-lock"><div class="ws-lock-t">확인 중…</div></div>');
    $('wsStrip').innerHTML = ''; $('wsStep').textContent = '';
    /* 오늘의 예배 순서는 로그인하지 않은 사람도 본다 (2026-09-27 지시) — 편집만 관리자 */
    return openKind(kind, ctx);
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
  /* ── 기쁨으로 찬양(CCM) — 예배 전 찬양(경배와 찬양)·입례송·성가대 찬양을 악보로 (2026-09-27)
       곡 자료 modu/ccm-data.js(window.CCMS), 악보 modu/data/ccm/NNN.webp
       설교 매니저에 저장한 곡(worship_published.songs: label·jnos)이 있으면 그것을, 없으면 주보 줄의 «곡명»을 목록에서 찾아 쓴다 */
  var JOY_IMG = 'modu/data/ccm/';
  function jnorm(s) { return String(s || '').replace(/[\s,.·!?~\-()]/g, '').toLowerCase(); }
  function joyByNo(n) { var L = window.CCMS || []; n = +n; for (var i = 0; i < L.length; i++) if (L[i].no === n) return L[i]; return null; }
  function joyFind(t) {
    var L = window.CCMS || [], k = jnorm(t); if (!k) return null;
    for (var i = 0; i < L.length; i++) if (jnorm(L[i].title) === k) return L[i];
    for (i = 0; i < L.length; i++) if ((L[i].alt || []).some(function (a) { return jnorm(a) === k; })) return L[i];
    return null;
  }
  function joySlotKey(l) { l = String(l || '').replace(/\s+/g, ''); if (/^(경배와찬양|예배전찬양)/.test(l)) return '경배와 찬양'; if (/^예배찬양/.test(l)) return '예배 찬양'; if (/^입례/.test(l)) return '입례송'; if (/^성가(대찬양|곡|대)?$/.test(l)) return '성가대 찬양'; return ''; }
  /* 옛 기쁨으로 찬양(j)·우리들 찬양(w) 번호 → 모두의 찬양 번호 */
  function legacyCc(b, n) { var L = window.CCMS || [], k = b === 'w' ? 'w' : 'j'; n = +n; for (var i = 0; i < L.length; i++) if (L[i][k] === n) return L[i]; return null; }
  function hymnFind(t) { var L = window.HYMNS || [], k = jnorm(t); for (var i = 0; i < L.length; i++) if (jnorm(L[i].title) === k) return L[i]; return null; }
  /* sg: 설교 매니저 자료 { items:[{b:'j'|'h', n}], jnos } — 두 책(기쁨으로 찬양·새찬송가)을 섞어 쓸 수 있다 */
  function joySlides(head, titles, jnos, items) {
    var out = [];
    if (items && items.length) items.forEach(function (x) {
      if (x.b === 'h') { var t = hymnTitle(+x.n); out.push({ type: 'hymn', head: head, no: +x.n, title: t }); }
      else { var j = (x.b === 'j' || x.b === 'w') ? legacyCc(x.b, x.n) : joyByNo(x.n); if (j) out.push({ type: 'joy', head: head, no: j.no, title: j.title }); }
    });
    else if (jnos && jnos.length) jnos.forEach(function (n) { var j = legacyCc('j', n); if (j) out.push({ type: 'joy', head: head, no: j.no, title: j.title }); });
    else titles.forEach(function (t) {
      var j = joyFind(t), h = j ? null : hymnFind(t);
      out.push(j ? { type: 'joy', head: head, no: j.no, title: j.title } : h ? { type: 'hymn', head: head, no: h.no, title: h.title } : { type: 'text', head: head, lines: [t], big: true });
    });
    return out;
  }
  function parseItem(line, b) {
    var p = String(line).split(/\s*·\s*/), head = (p[0] || '').trim(), rest = p.slice(1).join(' · ').trim();
    var hy = rest.match(/(\d{1,3})\s*장/), gd = rest.match(/교독문\s*(\d{1,3})/);
    if (/송영|찬송|찬양/.test(head) && hy && !/성가대|경배와 찬양/.test(head)) return { type: 'hymn', head: head, no: +hy[1], title: songs(rest)[0] || hymnTitle(+hy[1]) };
    if (gd) return { type: 'gyodok', head: head, no: +gd[1], sub: rest.replace(/교독문\s*\d+\s*번?/, '').replace(/[()]/g, '').trim() };
    if (/신앙고백/.test(head) || /사도신경/.test(rest)) return { type: 'creed', head: head };
    if (/주기도문/.test(head) || /주기도문/.test(rest)) return { type: 'lord', head: head };
    if (/성경봉독|본문/.test(head)) return { type: 'bible', head: head, ref: rest };
    if (/헌금/.test(head)) return { type: 'offering', head: head, sub: rest };
    if (/말씀강해|설교|말씀/.test(head)) return { type: 'sermon', head: head, title: songs(rest)[0] || rest, ref: b.scripture || '', who: b.preacher || '', quote: b.quote || '', summary: b.summary || null };
    if (/경배와 찬양|성가대/.test(head)) return { type: 'text', head: head, lines: songs(rest).length ? songs(rest) : [rest], big: true };
    return { type: 'text', head: head, lines: [rest] };
  }
  function openKind(kind, ctx) {
    ctx = ctx || {}; curKind = kind; slides = []; idx = 0;
    var date = ctx.date || todayStr; curDate = date; editing = false;
    if (kind === 'sunday') {
      var b = ctx.bulletin || sundayBulletin();
      if (!b) return setBody('<div class="ws-none">이번 주 주보 자료가 아직 없습니다.</div>');
      slides.push({ type: 'cover', k: '주일 예배', date: (b.dateLabel || b.date) + ' · ' + (b.week || ''), title: b.title, ref: b.scripture, who: b.preacher, quote: b.quote });
      /* 화면에 띄우지 않는 순서: 목회 기도·신앙고백·기도·교회소식·축도 (2026-09-26 목사님 지시)
         경배와 찬양(예배 전 찬양)·입례송·성가대 찬양은 기쁨으로 찬양 악보로 띄운다 (2026-09-27) · 헌금봉헌은 온라인 헌금 화면 */
      var SKIP = /^(목회\s*기도|신앙\s*고백|기도|교회\s*소식|축도)$/;
      var coverOnly = slides.slice();
      setBody('<div class="ws-lock"><div class="ws-lock-t">예배 순서를 불러오는 중…</div></div>');
      loadService(b.date || date, ['주일 낮 예배']).then(function (rec) {
        slides = coverOnly.slice();
        var SG = {}; ((rec && rec.songs) || []).forEach(function (x) { if (x && x.label) SG[x.label] = x; });
        var used = {};
        (b.order || []).forEach(function (l) {
          var p = String(l).split(/\s*·\s*/), head = (p[0] || '').trim(); if (SKIP.test(head)) return;
          var slot = joySlotKey(head);
          if (slot) {
            used[slot] = 1;
            var sg = SG[slot], titles = songs(p.slice(1).join(' · '));
            [].push.apply(slides, joySlides(head, titles, sg && sg.jnos, sg && sg.items));
            return;
          }
          if (/^송영/.test(head) && SG['입례송'] && !used['입례송']) { used['입례송'] = 1; [].push.apply(slides, joySlides('입례송', [], SG['입례송'].jnos, SG['입례송'].items)); }
          slides.push(parseItem(l, b));
        });
        /* 주보에 줄이 없어도 설교 매니저에 넣은 곡은 들어간다 — 예배 전 찬양은 맨 앞, 성가대 찬양은 말씀 앞 */
        if (SG['경배와 찬양'] && !used['경배와 찬양']) [].splice.apply(slides, [1, 0].concat(joySlides('경배와 찬양', [], SG['경배와 찬양'].jnos, SG['경배와 찬양'].items)));
        if (SG['입례송'] && !used['입례송']) { var at = 1; while (at < slides.length && slides[at].type === 'joy' && slides[at].head === '경배와 찬양') at++; [].splice.apply(slides, [at, 0].concat(joySlides('입례송', [], SG['입례송'].jnos, SG['입례송'].items))); }
        if (SG['예배 찬양'] && !used['예배 찬양']) { var at2 = 1; while (at2 < slides.length && /^(경배와 찬양|입례송)$/.test(joySlotKey(slides[at2].head))) at2++; [].splice.apply(slides, [at2, 0].concat(joySlides('예배 찬양', [], SG['예배 찬양'].jnos, SG['예배 찬양'].items))); }
        if (SG['성가대 찬양'] && !used['성가대 찬양']) { var sm = -1; slides.forEach(function (x, i) { if (sm < 0 && x.type === 'sermon') sm = i; }); [].splice.apply(slides, [sm < 0 ? slides.length : sm, 0].concat(joySlides('성가대 찬양', [], SG['성가대 찬양'].jnos, SG['성가대 찬양'].items))); }
        start();
      });
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
  /* ── 담임목사(관리자) 편집: 그날 예배의 슬라이드를 통째로 worship_edits(date, kind, slides)에 저장하고, 있으면 그것을 보여 준다 ── */
  var curDate = todayStr, editing = false, adminCache = null, hasEdit = false;
  function sbHeaders() { var s = session(); return { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (s ? s.token : window.SUPABASE_ANON_KEY), 'Content-Type': 'application/json' }; }
  function isAdmin() {
    var s = session(); if (!s || !window.SUPABASE_URL) return Promise.resolve(false);
    if (adminCache !== null) return Promise.resolve(adminCache);
    return fetch(window.SUPABASE_URL + '/rest/v1/admins?uid=eq.' + s.uid + '&select=uid', { headers: sbHeaders() })
      .then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) { adminCache = !!(rows && rows.length); return adminCache; }).catch(function () { return false; });
  }
  function loadEdit(kind, date) {
    if (!window.SUPABASE_URL) return Promise.resolve(null);
    return fetch(window.SUPABASE_URL + '/rest/v1/worship_edits?date=eq.' + date + '&kind=eq.' + kind + '&select=slides', { headers: sbHeaders() })
      .then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) { return rows && rows[0] && Array.isArray(rows[0].slides) && rows[0].slides.length ? rows[0].slides : null; }).catch(function () { return null; });
  }
  function saveEdit() {
    var s = session();
    return fetch(window.SUPABASE_URL + '/rest/v1/worship_edits?on_conflict=date,kind', { method: 'POST', headers: Object.assign(sbHeaders(), { Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ date: curDate, kind: curKind, slides: slides, updated_by: s ? s.uid : null, updated_at: new Date().toISOString() }) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); hasEdit = true; });
  }
  function deleteEdit() {
    return fetch(window.SUPABASE_URL + '/rest/v1/worship_edits?date=eq.' + curDate + '&kind=eq.' + curKind, { method: 'DELETE', headers: sbHeaders() })
      .then(function (r) { if (!r.ok) throw new Error(r.status); hasEdit = false; });
  }
  function start() {
    var base = slides.slice();
    loadEdit(curKind, curDate).then(function (ov) {
      if (ov) { slides = ov; hasEdit = true; } else hasEdit = false;
      idx = 0; strip(); render();
      isAdmin().then(function (ok) { var b = $('wsEdit'); if (b) b.hidden = !ok; });
      window.__wsBase = base;                                  /* '원래대로'에 쓸 자동 생성 순서 */
    });
  }
  /* 편집 화면 */
  var FIELDS = {
    cover:    [['k', '예배 이름'], ['date', '날짜 줄'], ['title', '제목'], ['ref', '본문'], ['who', '설교자'], ['quote', '요절', 'area']],
    hymn:     [['no', '장 번호(숫자)'], ['title', '제목']],
    joy:      [['no', '모두의 찬양 번호(숫자)'], ['title', '제목']],
    gyodok:   [['no', '교독문 번호(숫자)'], ['sub', '부제']],
    bible:    [['ref', '본문(예: 역대상 16:1-6)']],
    sermon:   [['title', '제목'], ['ref', '본문'], ['who', '설교자'], ['quote', '요절', 'area']],
    offering: [['sub', '한 줄']],
    creed: [], lord: [],
    text:     [['lines', '내용(줄마다 한 문단)', 'lines'], ['big', '큰 글씨로 가운데 (예/아니오)']]
  };
  var TYPE_NAME = { cover: '표지', joy: '찬양(모두의 찬양)', hymn: '찬송', gyodok: '교독문', bible: '성경 본문', sermon: '말씀', offering: '헌금', creed: '사도신경', lord: '주기도문', text: '글' };
  function slideLabel(sl) { var lb = sl.type === 'cover' ? '표지' : (sl.head || TYPE_NAME[sl.type] || '순서'); if (sl.type === 'hymn') lb += ' ' + sl.no + '장'; if (sl.type === 'joy') lb += ' ' + sl.no + '번'; if (sl.type === 'gyodok') lb += ' ' + sl.no + '번'; return lb; }
  function slideSub(sl) { return sl.title || sl.ref || sl.sub || (sl.lines ? sl.lines.join(' ') : '') || ''; }
  function toggleEdit() { editing = !editing; if (editing) renderEditor(); else { strip(); render(); } var b = $('wsEdit'); if (b) b.textContent = editing ? '보기' : '편집'; }
  function renderEditor(openIdx) {
    var h = '<div class="ws-edit"><div class="ws-edit-h">오늘의 예배 편집 <small>' + esc(curDate) + ' · 저장하면 정회원 모두에게 이 순서로 보입니다' + (hasEdit ? ' · <b>편집본 적용 중</b>' : '') + '</small></div><ol class="ws-edit-list">';
    slides.forEach(function (sl, i) {
      h += '<li data-i="' + i + '"><div class="ws-edit-row"><span class="ws-edit-n">' + (i + 1) + '</span><span class="ws-edit-lbl">' + esc(slideLabel(sl)) + '<small>' + esc(slideSub(sl)).slice(0, 60) + '</small></span>' +
        '<span class="ws-edit-ops"><button type="button" data-op="up" title="위로">▲</button><button type="button" data-op="down" title="아래로">▼</button><button type="button" data-op="edit" title="고치기">✎</button><button type="button" data-op="add" title="이 뒤에 추가">＋</button><button type="button" data-op="del" title="지우기">🗑</button></span></div>';
      if (openIdx === i) h += formHtml(sl);
      h += '</li>';
    });
    h += '</ol><div class="ws-edit-btns"><button type="button" class="ws-btn primary" id="wsSave">저장</button><button type="button" class="ws-btn" id="wsRevert">원래대로 (편집본 지우기)</button></div>' +
      '<p class="ws-tip">✎ 로 내용을 고치고, ＋ 로 그 뒤에 새 글(예: 오늘 함께 나눌 내용)을 넣습니다. 모든 순서에 「덧붙이는 글」을 달 수 있습니다.</p></div>';
    setBody(h);
    var list = $('wsBody').querySelector('.ws-edit-list');
    list.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-op]'); if (!b) return;
      var li = b.closest('li[data-i]'), i = +li.dataset.i, op = b.dataset.op;
      if (op === 'up' && i > 0) { var t = slides[i - 1]; slides[i - 1] = slides[i]; slides[i] = t; renderEditor(); }
      else if (op === 'down' && i < slides.length - 1) { var t2 = slides[i + 1]; slides[i + 1] = slides[i]; slides[i] = t2; renderEditor(); }
      else if (op === 'del') { if (confirm('「' + slideLabel(slides[i]) + '」 순서를 지울까요?')) { slides.splice(i, 1); renderEditor(); } }
      else if (op === 'add') { slides.splice(i + 1, 0, { type: 'text', head: '나눔', lines: [''] }); renderEditor(i + 1); }
      else if (op === 'edit') renderEditor(i);
      else if (op === 'ok') { applyForm(li, i); renderEditor(); }
      else if (op === 'cancel') renderEditor();
    });
    $('wsSave').onclick = function () { $('wsSave').disabled = true; saveEdit().then(function () { editing = false; $('wsEdit').textContent = '편집'; strip(); render(); toastWs('저장했습니다 — 정회원 모두에게 이 순서로 보입니다'); }, function () { $('wsSave').disabled = false; alert('저장하지 못했습니다. 로그인 상태와 인터넷을 확인해 주세요.'); }); };
    $('wsRevert').onclick = function () { if (!confirm('편집본을 지우고 주보 순서대로 되돌릴까요?')) return; deleteEdit().then(function () { slides = (window.__wsBase || []).slice(); editing = false; $('wsEdit').textContent = '편집'; idx = 0; strip(); render(); toastWs('주보 순서로 되돌렸습니다'); }, function () { alert('되돌리지 못했습니다.'); }); };
  }
  function formHtml(sl) {
    var f = FIELDS[sl.type] || [], h = '<div class="ws-edit-form"><label>순서 이름<input data-k="head" value="' + esc(sl.head || '') + '"></label>';
    f.forEach(function (d) {
      var k = d[0], lb = d[1], kind = d[2], v = sl[k];
      if (kind === 'lines') h += '<label>' + lb + '<textarea data-k="lines" rows="5">' + esc((v || []).join('\n')) + '</textarea></label>';
      else if (kind === 'area') h += '<label>' + lb + '<textarea data-k="' + k + '" rows="3">' + esc(v || '') + '</textarea></label>';
      else if (k === 'big') h += '<label class="ws-edit-chk"><input type="checkbox" data-k="big"' + (v ? ' checked' : '') + '> ' + lb + '</label>';
      else h += '<label>' + lb + '<input data-k="' + k + '" value="' + esc(v == null ? '' : v) + '"></label>';
    });
    h += '<label>덧붙이는 글 <small>(이 순서 아래에 함께 보입니다 · 줄마다 한 문단)</small><textarea data-k="note" rows="4">' + esc(sl.note || '') + '</textarea></label>' +
      '<div class="ws-edit-fbtns"><button type="button" data-op="ok" class="ws-btn primary">확인</button><button type="button" data-op="cancel" class="ws-btn">취소</button></div></div>';
    return h;
  }
  function applyForm(li, i) {
    var sl = slides[i];
    [].forEach.call(li.querySelectorAll('[data-k]'), function (el) {
      var k = el.dataset.k, v = el.type === 'checkbox' ? el.checked : el.value;
      if (k === 'lines') sl.lines = String(v).split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
      else if (k === 'no') sl.no = parseInt(v, 10) || sl.no;
      else if (k === 'note') { if (String(v).trim()) sl.note = String(v).trim(); else delete sl.note; }
      else sl[k] = v;
    });
    if (sl.type === 'hymn' && !sl.title) sl.title = hymnTitle(sl.no);
    if (sl.type === 'joy' && !sl.title) { var jj = joyByNo(sl.no); if (jj) sl.title = jj.title; }
  }
  function toastWs(msg) { var t = document.createElement('div'); t.className = 'ws-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
  function noteHtml(sl) { return sl.note ? '<div class="ws-note">' + linesHtml(String(sl.note).split('\n').filter(Boolean)) + '</div>' : ''; }
  function strip() {
    $('wsStrip').innerHTML = slides.map(function (s, i) {
      var lb = s.type === 'cover' ? '표지' : (s.head || TYPE_NAME[s.type] || '순서').replace(/\s*·.*$/, '');
      if (s.type === 'hymn') lb += ' ' + s.no + '장'; if (s.type === 'joy') lb += ' ' + s.no + '번';
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
  /* 홈페이지 '이번 주 말씀'의 설교 요약(주보 summary: heading·sectionTitle·points[{lead,text}]·apply) */
  function summaryHtml(sm) {
    if (typeof sm === 'string') {   /* 새벽·수요기도회: 설교 매니저 '말씀' 블록에 적은 설교 요약(글) — 빈 줄·줄바꿈은 문단으로 (2026-09-30) */
      var ps = sm.replace(/\r/g, '').split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean);
      return ps.length ? '<div class="ws-sum"><div class="ws-sum-t">말씀 요약</div><div class="ws-sum-txt">' + ps.map(function (x) { return '<p>' + esc(x).replace(/\n/g, '<br>') + '</p>'; }).join('') + '</div></div>' : '';
    }
    if (!sm || !(sm.points || []).length) return '';
    return '<div class="ws-sum"><div class="ws-sum-t">' + esc(sm.sectionTitle || '말씀 요약') + '</div>' +
      (sm.points || []).map(function (p, i) { return '<div class="ws-sum-p"><div class="ws-sum-lead"><span class="ws-sum-n">' + (i + 1) + '</span>' + esc(p.lead || '') + '</div><p>' + esc(p.text || '') + '</p></div>'; }).join('') +
      (sm.apply ? '<div class="ws-sum-apply"><div class="ws-sum-lead">삶에 적용</div><p>' + esc(sm.apply) + '</p></div>' : '') + '</div>';
  }
  function render() {
    if (editing) { renderEditor(); return; }
    var s = slides[idx]; if (!s) { setBody('<div class="ws-none">순서가 비어 있습니다.</div>'); return; }
    $('wsStep').textContent = (idx + 1) + ' / ' + slides.length;
    $('wsPrev').disabled = idx <= 0; $('wsNext').disabled = idx >= slides.length - 1;
    [].forEach.call($('wsStrip').children, function (c, i) { c.classList.toggle('on', i === idx); if (i === idx) try { c.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {} });
    var head = s.head ? '<div class="ws-head">' + esc(s.head) + '</div>' : '', h = '';
    if (s.type === 'cover') {
      h = '<div class="ws-cover"><div class="ws-cover-k">' + esc(s.k) + '</div><div class="ws-cover-date">' + esc(s.date) + '</div><div class="ws-cover-t">' + esc(s.title || '') + '</div>' +
        '<div class="ws-cover-s">' + esc(s.ref || '') + (s.who ? ' · ' + esc(s.who) : '') + '</div>' + (s.quote ? '<div class="ws-cover-q">' + esc(s.quote) + '</div>' : '') +
        '<div class="ws-tip">옆으로 밀거나 [다음]을 누르면 순서대로 이어집니다</div></div>';
    } else if (s.type === 'joy') {
      h = head + '<div class="ws-item-t"><b>' + s.no + '번</b> ' + esc(s.title || '') + ' <span style="font-size:.78em;color:#9a9a9a">모두의 찬양</span></div><div class="ws-img" id="wsImgBox"><img id="wsImg" src="' + JOY_IMG + ('00' + s.no).slice(-3) + '.webp" alt="모두의 찬양 ' + s.no + '번"></div><div class="ws-tip">두 손가락으로 벌리면 커집니다</div>';
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
      h = head + '<div class="ws-cover"><div class="ws-cover-t">' + esc(s.title || '') + '</div><div class="ws-cover-s">' + esc(s.ref || '') + (s.who ? ' · ' + esc(s.who) : '') + '</div>' + (s.quote ? '<div class="ws-cover-q">' + esc(s.quote) + '</div>' : '') + '</div>' + summaryHtml(s.summary);
    } else if (s.type === 'offering') {
      h = head + '<div class="ws-title">' + esc(s.sub || '신령과 진정으로') + '</div>' +
        '<div class="ws-give"><div class="ws-give-t">온라인 헌금하기</div>' +
        '<div class="ws-give-acct"><span class="ws-give-bank">' + GIVE.bank + '</span><span class="ws-give-no">' + GIVE.pretty + '</span><span class="ws-give-holder">예금주 · ' + GIVE.holder + '</span></div>' +
        '<div class="ws-give-btns"><a class="ws-btn primary ws-give-toss" href="' + GIVE.toss + '">토스로 이체하기</a><button type="button" class="ws-btn" id="wsGiveCopy">계좌번호 복사</button></div>' +
        '<p class="ws-tip">‘토스로 이체하기’는 토스 앱이 있는 휴대폰에서 이체 화면으로 바로 연결됩니다. 그 밖에는 계좌번호를 복사해 이용해 주세요.</p></div>';
    } else { h = head + linesHtml(s.lines || [], s.big ? 'ws-big' : ''); }
    h += noteHtml(s);
    setBody(h);
    if (s.type === 'offering') { var cb = $('wsGiveCopy'); if (cb) cb.onclick = function () {
      var done = function () { cb.textContent = '✓ 복사되었습니다'; setTimeout(function () { cb.textContent = '계좌번호 복사'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(GIVE.no).then(done, function () { window.prompt('계좌번호를 복사하세요', GIVE.no); });
      else window.prompt('계좌번호를 복사하세요', GIVE.no);
    }; }
    document.querySelectorAll('.ws-body').forEach(function (b) { b.classList.toggle('ws-hymnfit', s.type === 'hymn' || s.type === 'joy'); });
    if (s.type === 'hymn' || s.type === 'joy') { $('wsImg').classList.add('fit'); pinch($('wsImgBox'), $('wsImg')); }
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
    /* 맞춤(1배)은 높이에 맞춰 폭이 좁을 수 있다 — 그 폭 비율에 배율을 곱해야 벌리는 만큼만 이어서 커진다 (2026-09-28) */
    function fitRatio() {
      if (!img.naturalWidth || !img.naturalHeight || !box.clientWidth || !box.clientHeight) return 1;
      return Math.min(1, (box.clientHeight / box.clientWidth) * (img.naturalWidth / img.naturalHeight));
    }
    function apply(nz) {
      z = Math.max(1, Math.min(6, nz)); var fit = z < 1.02; if (fit) z = 1;
      img.style.width = fit ? '' : (fitRatio() * z * 100) + '%'; img.classList.toggle('fit', fit);
    }
    function keep(mx, my, fn) {   /* 가리키는 그림 자리(0~1)를 재고 크기를 바꾼 뒤 같은 화면 위치로 스크롤 */
      var r = box.getBoundingClientRect(), ir = img.getBoundingClientRect();
      var px = (mx - (ir.left - r.left)) / (ir.width || 1), py = (my - (ir.top - r.top)) / (ir.height || 1);
      fn();
      var nr = img.getBoundingClientRect();
      box.scrollLeft = box.scrollLeft + (px * nr.width + (nr.left - r.left)) - mx;
      box.scrollTop = box.scrollTop + (py * nr.height + (nr.top - r.top)) - my;
    }
    box.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { on = true; d0 = dist(e.touches); z0 = z; } else on = false; }, { passive: true });
    box.addEventListener('touchmove', function (e) {
      if (!on || e.touches.length !== 2) return;
      e.preventDefault();
      var r = box.getBoundingClientRect(), mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      var nz = z0 * dist(e.touches) / d0;
      keep(mx, my, function () { apply(nz); });
    }, { passive: false });
    box.addEventListener('touchend', function (e) { if (e.touches.length < 2) on = false; }, { passive: true });
    /* 웹: Ctrl + 마우스 휠로 악보만 확대·축소 (2026-09-27) */
    box.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      var r = box.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, nz = z * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
      keep(mx, my, function () { apply(nz); });
    }, { passive: false });
    box.addEventListener('dblclick', function () { apply(z === 1 ? 2 : 1); });
  }

  /* ── 전체 화면 ── */
  var overlay = null, textSize = 1;
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div'); overlay.id = 'wsOverlay'; overlay.hidden = true; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', '오늘의 예배');
    overlay.innerHTML =
      '<div class="ws-card">' +
        '<div class="ws-top"><b>오늘의 예배</b><span class="ws-step" id="wsStep"></span><span class="ws-sp"></span>' +
          '<button type="button" class="ws-ib ws-edit-btn" id="wsEdit" hidden>편집</button>' +
          '<button type="button" class="ws-ib" id="wsSmall" title="글자 작게">A−</button><button type="button" class="ws-ib" id="wsLarge" title="글자 크게">A+</button>' +
          '<button type="button" class="ws-ib ws-x" id="wsClose" aria-label="닫기">×</button></div>' +
        '<div class="ws-strip" id="wsStrip"></div>' +
        '<div class="ws-body" id="wsBody"></div>' +
        '<div class="ws-nav"><button type="button" class="ws-btn" id="wsPrev">◀ 이전</button><button type="button" class="ws-btn primary" id="wsNext">다음 ▶</button></div>' +
      '</div>';
    document.body.appendChild(overlay);
    $('wsClose').onclick = function () { if (window.ModalNav) ModalNav.close(); else closeViewer(); };
    $('wsPrev').onclick = function () { go(idx - 1); };
    $('wsEdit').onclick = toggleEdit;
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
