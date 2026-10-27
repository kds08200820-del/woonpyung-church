/* ============================================================
 *  운평장로교회 — 주일학교 주보 만들기 (ss-bulletin.html) · 2026-10-27 담임목사 지시
 *  · 자료: 말씀 PDF(공과 '설교예시문' — 과·제목·본문·교육목표·핵심메시지·말씀 챈트)와 예배 PPT(그림)
 *          → 내 컴퓨터(구글 드라이브 폴더 포함)에서 고르거나, 자료실 '주일학교'에 올린 파일을 고른다
 *  · 자동으로 채우는 것: 과·제목·본문·암송(3줄로)·활동지(○× 초안은 교육목표에서, 빈칸은 암송 구절에서)·
 *          호수(지난 호 + 주 수)·날짜(다가오는 주일)·교회 소식(지난 주보에 쓴 것 + 지금 받는 신청서)·
 *          달란트 현황(교사단 로그인 시 지난 한 주 QT 인증·받은 달란트·누적 달란트)
 *  · 고친 내용은 이 기기에 남는다(localStorage). 인쇄 → 'PDF로 저장'으로 A4 가로 두 쪽 PDF 를 만든다.
 *  · 서버에 쓰는 것 없음(읽기만). 달란트·인증 기록은 교사단·관리자만 읽힌다(RLS · ss_students).
 * ============================================================ */
(function () {
  'use strict';
  var URL0 = window.SUPABASE_URL, ANON = window.SUPABASE_ANON_KEY;
  var KEY = 'ssb-v1';
  var BG1 = 'images/ss-bulletin/bg-inner.jpg', BG2 = 'images/ss-bulletin/bg-outer.jpg';
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  var BASE0 = { no: 32, date: '2026-10-25' };   // 제26-32호 · 2026년 10월 25일 (지난 주보) — 여기서 주마다 1씩
  var NEWS0 = [
    '운평장로교회 어플을 다운받으세요. — 다운받은 어린이에게 10달란트를 지급합니다.',
    '필사와 QT는 어플에서 진행하세요. — QT 1회당 5달란트를 지급합니다.',
    '주중 미션에 참여하세요. — 10달란트를 지급합니다.'
  ].join('\n');

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nl(s) { return esc(s).replace(/\n/g, '<br>'); }
  function status(msg) { var e = $('st'); if (e) e.textContent = msg || ''; }

  /* ── 날짜 ── */
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function parseYmd(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function nextSunday() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return ymd(d); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function koDate(s) { var d = parseYmd(s); return d ? d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일' : ''; }
  function md(s) { var d = parseYmd(s); return d ? (d.getMonth() + 1) + '/' + d.getDate() : ''; }
  function weeksBetween(a, b) { var x = parseYmd(a), y = parseYmd(b); return x && y ? Math.round((y - x) / 864e5 / 7) : 0; }
  function autoNo(date) { var b = S.base || BASE0; return Math.max(1, (+b.no || 1) + weeksBetween(b.date, date)); }
  function issueText() { var d = parseYmd(S.date); return '제' + String(d ? d.getFullYear() : '').slice(2) + '-' + (S.no || '') + '호 · ' + koDate(S.date); }

  /* ── 상태 (이 기기에 저장) ── */
  var S = load();
  function load() {
    var s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    var d = {
      date: nextSunday(), no: 0, noEdited: false, base: BASE0,
      unit: '', lesson: '', title: '', ref: '', preacher: '김동석 목사님', core: '', goals: [],
      chantRef: '', chantText: '', blanks: null,
      actTitle: '', actSub: '', actIntro: '', ox: '', pledgeTitle: '이번 주 나의 다짐', pledgeNote: '이번 주에 실천할 일을 한 가지 적어 보세요.',
      band: '', offering: '어린이', motto: '주님밖에 없습니다.', news: NEWS0, talMode: 'table', talGroup: '어린이', pic: ''
    };
    Object.keys(d).forEach(function (k) { if (s[k] === undefined) s[k] = d[k]; });
    if (!s.date || s.date < ymd(new Date())) { s.date = nextSunday(); s.noEdited = false; }   // 지난 주일 것이면 다가오는 주일로
    if (!s.noEdited) s.no = 0;
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 그림이 너무 크면 그림만 빼고 */ try { var c = Object.assign({}, S, { pic: '' }); localStorage.setItem(KEY, JSON.stringify(c)); } catch (e2) { } } }

  /* ── 로그인 ── */
  function session() {
    try {
      var ref = new URL(URL0).hostname.split('.')[0], raw = localStorage.getItem('sb-' + ref + '-auth-token');
      if (!raw) return null; var v = JSON.parse(raw); return v && v.currentSession ? v.currentSession : v;
    } catch (e) { return null; }
  }
  function token() { var s = session(); return (s && s.access_token) || null; }
  function api(path, opt) {
    opt = opt || {};
    return fetch(URL0 + '/rest/v1/' + path, {
      method: opt.method || 'GET',
      headers: { apikey: ANON, Authorization: 'Bearer ' + (token() || ANON), 'Content-Type': 'application/json' },
      body: opt.body
    }).then(function (r) { return r.ok ? r.json() : r.text().then(function (t) { throw new Error(r.status + ' ' + t); }); });
  }

  /* ── 라이브러리 (쓸 때만 CDN 에서 한 번) ── */
  var libs = {};
  function lib(url, test) {
    if (test()) return Promise.resolve(test());
    if (libs[url]) return libs[url];
    libs[url] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = url;
      s.onload = function () { test() ? res(test()) : rej(new Error('불러오기 실패')); };
      s.onerror = function () { libs[url] = null; rej(new Error('도구를 불러오지 못했습니다(인터넷 연결 확인)')); };
      document.head.appendChild(s);
    });
    return libs[url];
  }
  function pdfjs() { return lib(PDFJS, function () { return window.pdfjsLib; }).then(function (p) { p.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return p; }); }
  function jszip() { return lib(JSZIP, function () { return window.JSZip; }); }

  /* ── 그림: 너무 크면 줄여서 jpeg 로 ── */
  function toJpeg(src, w, h) {
    var k = Math.min(1, 1000 / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    if (src instanceof ImageData) { var t = document.createElement('canvas'); t.width = w; t.height = h; t.getContext('2d').putImageData(src, 0, 0); src = t; }
    x.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86);
  }
  function blobToJpeg(blob) {
    return new Promise(function (res) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { var d = null; try { if (im.naturalWidth >= 200 && im.naturalHeight >= 140) d = { src: toJpeg(im, im.naturalWidth, im.naturalHeight), w: im.naturalWidth, h: im.naturalHeight }; } catch (e) { } URL.revokeObjectURL(u); res(d); };
      im.onerror = function () { URL.revokeObjectURL(u); res(null); };
      im.src = u;
    });
  }

  /* ── 말씀 PDF 읽기: 글자(줄 단위) + 그림 ── */
  function pdfLines(items) {
    var rows = [];
    items.forEach(function (it) {
      if (!it.str) return;
      var y = it.transform[5], x = it.transform[4], row = null;
      for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) < 2.5) { row = rows[i]; break; }
      if (!row) { row = { y: y, its: [] }; rows.push(row); }
      row.its.push({ x: x, w: it.width || 0, s: it.str });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.its.sort(function (a, b) { return a.x - b.x; });
      var out = '', end = null;
      r.its.forEach(function (it) { if (end != null && it.x - end > 1.2 && !/\s$/.test(out)) out += ' '; out += it.s; end = it.x + it.w; });
      return out.replace(/[\u200b-\u200f\ufeff\ue000-\uf8ff]/g, '').replace(/\s+/g, ' ').trim();   // 한글 PDF 의 사용자 정의 글자(U+F000 등)는 뺀다
    }).filter(Boolean);
  }
  function getObj(page, name) {
    return new Promise(function (res) {
      var store = name.indexOf('g_') === 0 ? page.commonObjs : page.objs, done = false;
      setTimeout(function () { if (!done) { done = true; res(null); } }, 4000);
      try { store.get(name, function (o) { if (!done) { done = true; res(o); } }); } catch (e) { done = true; res(null); }
    });
  }
  function objToJpeg(o) {
    if (!o) return null;
    var w = o.width, h = o.height, src = o.bitmap || o;
    if (!w || !h || w < 240 || h < 160) return null;
    if (src.data && !(src instanceof HTMLImageElement)) {
      var d = src.data, n = w * h, rgba;
      if (d.length === n * 4) rgba = new Uint8ClampedArray(d);
      else if (d.length === n * 3) { rgba = new Uint8ClampedArray(n * 4); for (var i = 0, j = 0; i < n; i++) { rgba[j++] = d[i * 3]; rgba[j++] = d[i * 3 + 1]; rgba[j++] = d[i * 3 + 2]; rgba[j++] = 255; } }
      else return null;
      src = new ImageData(rgba, w, h);
    }
    try { return { src: toJpeg(src, w, h), w: w, h: h }; } catch (e) { return null; }
  }
  function readPdf(buf) {
    return pdfjs().then(function (P) {
      return P.getDocument({ data: buf }).promise.then(function (doc) {
        var lines = [], pics = [], n = Math.min(doc.numPages, 12);
        var chain = Promise.resolve();
        for (var p = 1; p <= n; p++) (function (pn) {
          chain = chain.then(function () { return doc.getPage(pn); }).then(function (page) {
            return page.getTextContent().then(function (tc) { lines = lines.concat(pdfLines(tc.items)); })
              .then(function () { return pics.length < 16 ? page.getOperatorList() : null; })
              .then(function (ops) {
                if (!ops) return;
                var names = [];
                ops.fnArray.forEach(function (f, i) { if (f === P.OPS.paintImageXObject || f === P.OPS.paintJpegXObject) { var nm = ops.argsArray[i][0]; if (names.indexOf(nm) < 0) names.push(nm); } });
                return names.reduce(function (pr, nm) {
                  return pr.then(function () { return getObj(page, nm).then(function (o) { var j = objToJpeg(o); if (j && pics.length < 16) pics.push(j); }); });
                }, Promise.resolve());
              });
          });
        })(p);
        return chain.then(function () { return { lines: lines, pics: pics }; });
      });
    });
  }

  /* ── 공과 글자에서 칸 뽑기 ── */
  var RE_REF = /([가-힣]{1,8}(?:\s?[가-힣]{1,4})?\s*\d+\s*장(?:\s*\d+\s*(?:[~\-–]\s*\d+\s*)?절)?)/;
  function between(flat, a, b) {
    var m = a.exec(flat); if (!m) return '';
    var rest = flat.slice(m.index + m[0].length), e = b ? b.exec(rest) : null;
    return (e ? rest.slice(0, e.index) : rest.slice(0, 400)).trim();
  }
  function parseLesson(lines) {
    var L = { lesson: '', title: '', ref: '', goals: [], core: '', chantRef: '', chantText: '' };
    var flat = lines.join(' ').replace(/\s+/g, ' ');
    var mL = /(\d{1,3})\s*과/.exec(flat); if (mL) L.lesson = mL[1] + '과';
    var GOAL = /교\s?육\s?목\s?표/, CORE = /핵\s?심\s?메\s?시\s?지/, CHANT = /말\s?씀\s?챈\s?트|암\s?송\s?(?:말\s?씀|구\s?절)?/, END = /Foundation|기\s?초\s?세\s?우\s?기|도\s?입|Framing/;
    // 제목·본문: '○과' 줄 다음부터 '교육 목표' 앞까지
    var gi = -1; for (var i = 0; i < lines.length; i++) if (/\d{1,3}\s*과/.test(lines[i])) { gi = i; break; }
    for (var k = gi + 1; k < lines.length && k < gi + 8; k++) {
      var l = lines[k]; if (GOAL.test(l)) break;
      if (/^설교\s?예시문/.test(l) || /^\d{1,3}\s*과$/.test(l)) continue;
      var r = RE_REF.exec(l);
      if (r && r[0].length >= l.length - 3) { if (!L.ref) L.ref = l.replace(/\s+/g, ' '); continue; }
      if (!L.title) L.title = l;
    }
    var g = between(flat, GOAL, CORE);
    if (g) L.goals = g.split(/\s*\d\.\s+/).map(function (x) { return x.trim(); }).filter(function (x) { return /[가-힣A-Za-z0-9]/.test(x); });
    L.core = between(flat, CORE, CHANT);
    var ch = '', mc = CHANT.exec(flat);
    if (mc) { var after = flat.slice(mc.index + mc[0].length), me = END.exec(after); ch = (me ? after.slice(0, me.index) : after.slice(0, 300)).trim(); }
    if (ch) {
      var rr = RE_REF.exec(ch); if (rr) L.chantRef = rr[0].replace(/\s+/g, ' ').trim();
      var q = /[“"]([^”"]+)[”"]/.exec(ch);
      L.chantText = (q ? q[1] : (rr ? ch.slice(rr.index + rr[0].length) : ch)).replace(/\s+/g, ' ').trim();
    }
    return L;
  }

  /* ── 활동지 초안 ── */
  // 교육목표 '…임을 안다.' → '…' (○ 문장 초안 — 선생님이 틀린 문장을 섞는다)
  function batchim(ch) { var c = (ch || '').charCodeAt(0) - 0xAC00; return c >= 0 && c < 11172 && c % 28 !== 0; }
  function goalToStatement(g) {
    var t = String(g || '').replace(/\s+/g, ' ').trim().replace(/[.。]$/, ''), m;
    if ((m = /^(.*\S)임을\s*(?:안다|알게 된다|깨닫는다|배운다)$/.exec(t))) return m[1] + (batchim(m[1].slice(-1)) ? '이에요' : '예요');   // '…승리임을 안다' → '…승리예요'
    if ((m = /^(.*\S)\s*(?:을|를)\s*(?:안다|깨닫는다|배운다)$/.exec(t))) return t.replace(/\s*(?:안다|깨닫는다|배운다)$/, ' 알아요');
    return t;
  }
  var STOP = ['하나님', '예수님', '예수', '주님', '우리', '너희', '이것', '그것', '저것', '무릇', '모든', '자마다', '그러나', '그리고', '여호와', '그들', '나의', '너의'];
  var COPULA = /(이시니라|이시니|이니라|이니|이요|이라|이다|이며|이로다)$/;
  var VERB = /(느니라|니라|리라|하라|노라|도다|하니|하고|하여|하며|하면|다|고|며|니|면|서|여|라)$/;
  var JOSA = ['께로부터', '으로부터', '로부터', '에게서', '에게', '께서', '으로', '에서', '부터', '까지', '처럼', '보다', '마다', '을', '를', '이', '가', '은', '는', '의', '에', '도', '만', '과', '와', '로', '께'];
  function cleanTok(t) { return String(t || '').replace(/[“”"'.,!?·:;()\[\]]/g, ''); }
  function stemOf(tok) {
    var c = cleanTok(tok), m;
    if ((m = COPULA.exec(c)) && c.length - m[0].length >= 2) return { stem: c.slice(0, c.length - m[0].length), noun: true };
    if (VERB.test(c)) return { stem: '', noun: false };
    for (var i = 0; i < JOSA.length; i++) {
      var j = JOSA[i];
      if (c.length - j.length >= 2 && c.slice(-j.length) === j) return { stem: c.slice(0, c.length - j.length), noun: false, josa: j };
    }
    return { stem: c, noun: false };
  }
  function verseToks() { return String(S.chantText || '').replace(/\n/g, ' ').split(/\s+/).filter(Boolean); }
  function autoBlanks() {
    var toks = verseToks(), ctx = [S.title, S.core, (S.goals || []).join(' ')].join(' '), seen = {}, cand = [];
    var count = {}; toks.forEach(function (t) { var s = stemOf(t).stem; if (s) count[s] = (count[s] || 0) + 1; });
    toks.forEach(function (t, i) {
      var st = stemOf(t), s = st.stem;
      if (!s || s.length < 2 || STOP.indexOf(s) >= 0 || seen[s]) return;
      seen[s] = 1;
      var sc = s.length + (ctx.indexOf(s) >= 0 ? 10 : 0) + (count[s] > 1 ? 3 : 0) + (st.noun ? 1 : 0);
      if (/(기|하|되|시)$/.test(s) && (st.josa === '는' || st.josa === '은')) sc -= 3;   // '이기는'처럼 꾸미는 말
      cand.push({ i: i, sc: sc });
    });
    cand.sort(function (a, b) { return b.sc - a.sc || a.i - b.i; });
    return cand.slice(0, 3).map(function (c) { return c.i; }).sort(function (a, b) { return a - b; });
  }
  function breakTitle(t) {
    t = String(t || '').trim(); if (t.indexOf('\n') >= 0 || t.length <= 11) return t;
    var mid = t.length / 2, best = -1;
    for (var i = 0; i < t.length; i++) if (t[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    return best > 0 ? t.slice(0, best) + '\n' + t.slice(best + 1) : t;
  }
  function breakVerse(t, max) {
    var w = String(t || '').replace(/\s+/g, ' ').trim().split(' '), lines = [], cur = '';
    w.forEach(function (x) { if (cur && (cur + ' ' + x).length > max) { lines.push(cur); cur = x; } else cur = cur ? cur + ' ' + x : x; });
    if (cur) lines.push(cur);
    return lines.join('\n');
  }
  function applyLesson(L) {
    if (L.lesson) S.lesson = L.lesson;
    if (L.title) S.title = breakTitle(L.title);
    if (L.ref) S.ref = L.ref;
    if (L.core) S.core = L.core;
    if (L.goals && L.goals.length) S.goals = L.goals;
    if (L.chantRef) S.chantRef = L.chantRef;
    if (L.chantText) S.chantText = breakVerse(L.chantText, 22);
    var t1 = String(L.title || '').replace(/\s+/g, ' ').trim(), parts = t1.split(/\s*:\s*/);
    S.actTitle = parts.length > 1 ? parts[0] + ' 찾기' : '말씀 탐험';
    S.actSub = [S.ref, parts.length > 1 ? parts.slice(1).join(': ') : ''].filter(Boolean).join(' · ');
    S.actIntro = S.core;
    S.band = S.core;
    S.ox = (S.goals || []).map(goalToStatement).filter(Boolean).join('\n');
    S.blanks = null;
  }

  /* ── 달란트 현황 (교사단: ss_students + 지난 한 주 ss_talents · ss_submissions) ── */
  var T = { ok: false, teacher: false, students: [], week: {}, loadedFor: '', err: '' };
  function weekRange() { return { from: addDays(S.date, -7), to: addDays(S.date, -1) }; }
  function loadTalents() {
    if (!token()) { T.ok = false; T.err = 'login'; return Promise.resolve(); }
    var wr = weekRange(), key = wr.from + '~' + wr.to;
    if (T.ok && T.loadedFor === key) return Promise.resolve();
    status('달란트 기록을 불러오는 중…');
    return api('rpc/ss_context', { method: 'POST', body: '{}' }).then(function (c) {
      T.teacher = !!(c && c.isTeacher);
      if (!T.teacher) { T.ok = false; T.err = 'teacher'; return; }
      return Promise.all([
        api('rpc/ss_students', { method: 'POST', body: '{}' }),
        api('ss_talents?select=member_key,amount&talent_date=gte.' + wr.from + '&talent_date=lte.' + wr.to + '&limit=5000'),
        api('ss_submissions?select=member_key,stype&sub_date=gte.' + wr.from + '&sub_date=lte.' + wr.to + '&limit=5000')
      ]).then(function (rs) {
        var wk = {};
        function w(k) { return wk[k] || (wk[k] = { amt: 0, qt: 0, pilsa: 0, mission: 0 }); }
        (rs[1] || []).forEach(function (r) { w(r.member_key).amt += +r.amount || 0; });
        (rs[2] || []).forEach(function (r) { var o = w(r.member_key); if (r.stype === 'QT') o.qt++; else if (r.stype === '필사') o.pilsa++; else if (r.stype === '미션') o.mission++; });
        T.students = rs[0] || []; T.week = wk; T.ok = true; T.err = ''; T.loadedFor = key;
      });
    }).catch(function (e) { T.ok = false; T.err = 'net'; console.warn('[ss-bulletin]', e); })
      .then(function () { status(''); });
  }
  function groupsOf(s) { return [s.ss_role || '어린이']; }   // 교적의 주일학교 직분: 어린이 · 중학생 · 고등학생 (유년 주보는 어린이)
  function talentRows() {
    return T.students.filter(function (s) { return !S.talGroup || groupsOf(s).indexOf(S.talGroup) >= 0; })
      .map(function (s) { var w = T.week[s.member_key] || {}; return { name: s.name, qt: w.qt || 0, wk: w.amt || 0, total: +s.total || 0, pilsa: w.pilsa || 0, mission: w.mission || 0 }; });
  }

  /* ── 그리기 ── */
  function blankVerse() {
    var toks = verseToks(), set = S.blanks || [], ans = [];
    var html = toks.map(function (t, i) {
      if (set.indexOf(i) < 0) return esc(t);
      var c = cleanTok(t), st = stemOf(t).stem || c; ans.push(st);
      var k = t.indexOf(st);
      return k >= 0 ? esc(t.slice(0, k)) + '<span class="blank"></span>' + esc(t.slice(k + st.length)) : '<span class="blank"></span>';
    }).join(' ');
    return { html: html, ans: ans.slice().sort(function (a, b) { return a.localeCompare(b, 'ko'); }) };
  }
  function lay1() {
    var ox = String(S.ox || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    var bv = blankVerse(), sec = 0, circ = ['①', '②', '③', '④'];
    var act = '';
    if (ox.length) act += '<div class="jua" style="font-size:1.4em;color:#e5735f;margin-bottom:.5em">' + circ[sec++] + ' 맞는 것에 ○, 틀린 것에 × 하세요</div>' +
      '<table class="ox" style="width:100%;border-collapse:separate;border-spacing:0 .45em;font-size:1.02em">' +
      ox.map(function (s) { return '<tr><td>· ' + esc(s) + '</td><td style="width:4.6em;text-align:right;white-space:nowrap">(　　)</td></tr>'; }).join('') + '</table>';
    if (bv.ans.length) act += '<div class="jua" style="font-size:1.4em;color:#e5735f;margin:' + (sec ? '.9em' : '0') + ' 0 .5em">' + circ[sec++] + ' 말씀 빈칸을 채워 보세요</div>' +
      '<div style="font-size:1.05em;line-height:2">' + bv.html + (S.chantRef ? ' <span style="color:#2f7fd8">- ' + esc(S.chantRef) + ' -</span>' : '') + '</div>' +
      '<div style="margin-top:.3em;font-size:.93em;color:#8b7b6c">보기 :　' + esc(bv.ans.join(' · ')) + '</div>';
    act += '<div class="jua" style="font-size:1.4em;color:#e5735f;margin:' + (sec ? '.9em' : '0') + ' 0 .4em">' + circ[sec++] + ' ' + esc(S.pledgeTitle) + '</div>' +
      '<div style="font-size:.93em;color:#6b6157;margin-bottom:.2em">' + esc(S.pledgeNote) + '</div>' +
      '<div style="height:2.1em;border-bottom:1px dashed #d9b9ae"></div><div style="height:2.1em;border-bottom:1px dashed #d9b9ae"></div>';
    return '<img class="bg" src="' + BG1 + '" alt="">' +
      '<div class="a jua" id="f_actTitle" style="left:55px;top:40px;width:165px;font-size:22px;line-height:1.1;white-space:nowrap">' + esc(S.actTitle) + '</div>' +
      '<div class="a" style="left:57px;top:69px;width:170px;font-size:7.4px;color:#2f7fd8;font-weight:700">' + esc(S.actSub) + '</div>' +
      '<div class="a" id="f_intro" style="left:28px;top:94px;width:300px;font-size:7.6px">' + esc(S.actIntro) + '</div>' +
      '<div class="a jua" style="left:229px;top:52px;width:97px;text-align:center;font-size:12px"><span style="display:inline-block;width:46px;border-bottom:1px solid #c9a94a;height:13px;vertical-align:-2px"></span> ' + esc(S.offering) + '</div>' +
      '<div class="a" id="f_act" style="left:40px;top:128px;width:272px;height:300px;overflow:hidden;font-size:8.2px;line-height:1.55">' + act + '</div>' +
      '<div class="a jua" id="f_band" style="left:40px;top:442px;width:270px;text-align:center;font-size:9.5px;color:#e5735f;white-space:nowrap;overflow:hidden">' + esc(S.band) + '</div>' +
      '<div class="a" style="left:391px;top:58px;font-size:8px;color:#2f7fd8;font-weight:700"' + (S.lesson ? '' : ' data-empty') + '>' + esc([S.unit, S.lesson].filter(Boolean).join(' ')) + '</div>' +
      '<div class="a jua" id="f_title" style="left:390px;top:74px;width:' + (S.pic ? 140 : 275) + 'px;font-size:19px;line-height:1.25;color:#1f2a44"' + (S.title ? '' : ' data-empty') + '>' + nl(S.title || '설교 제목') + '</div>' +
      '<div class="a" style="left:391px;top:128px;width:135px;font-size:7.6px;color:#2f7fd8;font-weight:700">' + esc(S.ref) + '</div>' +
      (S.pic ? '<img class="a" src="' + esc(S.pic) + '" alt="" style="left:532px;top:120px;width:125px;height:84px;object-fit:cover;border-radius:8px">' : '') +
      '<div class="a" style="left:412px;top:200px;font-size:8.6px;font-weight:700">' + esc(S.preacher) + '</div>' +
      '<div class="a jua" id="f_chant" style="left:380px;top:282px;width:290px;height:72px;overflow:hidden;text-align:center;font-size:13.5px;line-height:1.75"' + (S.chantText ? '' : ' data-empty') + '>' + nl(S.chantText) + '</div>' +
      '<div class="a" style="left:380px;top:357px;width:290px;text-align:center;font-size:8.4px;color:#e5735f;font-weight:700">' + esc(S.chantRef) + '</div>';
  }
  function newsHTML() {
    return String(S.news || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean).map(function (x, i) {
      var p = x.split(/\s+[—–-]\s+|\s*\|\s*/), head = p.shift(), rest = p.join(' ');
      return '<div style="margin-bottom:.7em"><b style="color:#2e8b57">' + (i + 1) + '. ' + esc(head) + '</b>' + (rest ? '<br><span style="padding-left:1.2em;display:inline-block">' + esc(rest) + '</span>' : '') + '</div>';
    }).join('');
  }
  function talentHTML() {
    var wr = weekRange(), head = md(wr.from) + '~' + md(wr.to);
    var lines12 = new Array(13).join('<div style="height:12px;border-bottom:1px solid #e3dcf0"></div>');
    if (S.talMode === 'blank' || !T.ok) return '<div style="margin-bottom:5px">이번 주 달란트는 선생님이 적어 주세요.</div>' + lines12;
    var rows = talentRows();
    var sum = rows.reduce(function (a, r) { a.qt += r.qt; a.wk += r.wk; a.pilsa += r.pilsa; a.mission += r.mission; return a; }, { qt: 0, wk: 0, pilsa: 0, mission: 0 });
    var top = '<div style="margin-bottom:5px">' + esc(head) + ' · QT 인증 ' + sum.qt + '회 · 필사 ' + sum.pilsa + '회 · 미션 ' + sum.mission + '회 · 받은 달란트 ' + sum.wk + '</div>';
    if (S.talMode === 'sum') {
      return top + '<div style="font-size:10px;line-height:2.1;color:#3d3a36;margin-top:6px">' +
        '<div>📖 QT 인증한 친구 <b>' + rows.filter(function (r) { return r.qt; }).length + '명</b> (모두 ' + sum.qt + '회)</div>' +
        '<div>✍️ 필사 ' + sum.pilsa + '회 · 🎯 미션 ' + sum.mission + '회</div>' +
        '<div>🪙 이번 주 받은 달란트 모두 <b>' + sum.wk + '</b></div></div>' + new Array(6).join('<div style="height:12px;border-bottom:1px solid #e3dcf0"></div>');
    }
    if (!rows.length) return top + '<div style="color:#8b7b6c">어린이 명단이 없습니다(교적부의 주일학교 직분 ‘어린이’).</div>';
    var n = rows.length, cols = n <= 12 ? 1 : n <= 26 ? 2 : 3, per = Math.ceil(n / cols), fs = cols === 3 ? 6 : 7;
    var maxRows = Math.floor(150 / (fs + 4.6)), cut = 0;
    if (per > maxRows) { cut = n - maxRows * cols; per = maxRows; }
    var parts = [];
    for (var c = 0; c < cols; c++) {
      var sl = rows.slice(c * per, (c + 1) * per); if (!sl.length) break;
      parts.push('<table class="tal" style="font-size:' + fs + 'px"><thead><tr><th>이름</th><th class="n">QT</th><th class="n">이번 주</th><th class="n">누적</th></tr></thead><tbody>' +
        sl.map(function (r) { return '<tr><td style="max-width:4.5em">' + esc(r.name) + '</td><td class="n">' + (r.qt || '') + '</td><td class="n">' + (r.wk ? (r.wk > 0 ? '+' : '') + r.wk : '') + '</td><td class="n">' + r.total + '</td></tr>'; }).join('') + '</tbody></table>');
    }
    return top + '<div style="display:flex;gap:8px;align-items:flex-start">' + parts.map(function (p) { return '<div style="flex:1;min-width:0">' + p + '</div>'; }).join('') + '</div>' +
      (cut > 0 ? '<div style="margin-top:3px;color:#8b7b6c">외 ' + cut + '명</div>' : '');
  }
  function lay2() {
    return '<img class="bg" src="' + BG2 + '" alt="">' +
      '<div class="a" id="f_news" style="left:40px;top:62px;width:215px;height:150px;overflow:hidden;font-size:8.3px;line-height:1.5">' + newsHTML() + '</div>' +
      '<div class="a" style="left:44px;top:276px;width:262px;height:172px;overflow:hidden;font-size:7px;color:#6b6157">' + talentHTML() + '</div>' +
      '<div class="a" style="left:530px;top:27px;width:147px;text-align:right;font-size:7.4px;color:#3d4a6b">' + esc(issueText()) + '</div>' +
      '<div class="a jua" id="f_motto" style="left:415px;top:170px;width:222px;text-align:center;font-size:13px;color:#1f2a44;white-space:nowrap;overflow:hidden">' + esc(S.motto) + '</div>';
  }
  // 넘치면 글자를 줄인다 (칸 크기는 그대로)
  function fit(id, minPx, wide) {
    var e = $(id); if (!e) return;
    var fs = parseFloat(e.style.fontSize) || 10, guard = 40;
    function over() { return wide ? e.scrollWidth > e.clientWidth + 1 : e.scrollHeight > e.clientHeight + 1; }
    if (!e.style.height && !wide) return;
    while (over() && fs > minPx && guard--) { fs = Math.round((fs - 0.3) * 10) / 10; e.style.fontSize = fs + 'px'; }
  }
  function fitTitle() {
    var e = $('f_title'); if (!e) return; var fs = 19, guard = 30;
    while (e.scrollHeight > 50 && fs > 11 && guard--) { fs -= 0.5; e.style.fontSize = fs + 'px'; }
  }
  function render() {
    if (!S.no || !S.noEdited) S.no = autoNo(S.date);
    if (S.blanks == null) S.blanks = autoBlanks();
    $('lay1').innerHTML = lay1(); $('lay2').innerHTML = lay2();
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fonts.then(function () { fit('f_act', 5.5); fit('f_news', 6); fit('f_chant', 9); fitTitle(); fit('f_band', 6.5, true); fit('f_motto', 8, true); fit('f_actTitle', 13, true); });
    save();
  }
  function scale() {
    var pv = $('pv'); if (!pv) return;
    var k = Math.min(1.6036, Math.max(0.4, (pv.clientWidth - 4) / 700));
    document.documentElement.style.setProperty('--k', k.toFixed(4));
  }

  /* ── 입력 칸 ── */
  function fld(k, label, opt) {
    opt = opt || {};
    var v = S[k] == null ? '' : S[k];
    if (opt.rows) return '<label class="ed-f"><span>' + label + '</span><textarea data-k="' + k + '" rows="' + opt.rows + '">' + esc(v) + '</textarea></label>';
    return '<label class="ed-f"><span>' + label + '</span><input type="' + (opt.type || 'text') + '" data-k="' + k + '" value="' + esc(v) + '"' + (opt.ph ? ' placeholder="' + esc(opt.ph) + '"' : '') + '></label>';
  }
  function editor() {
    var grpOpts = {}; T.students.forEach(function (s) { groupsOf(s).forEach(function (g) { grpOpts[g] = 1; }); });
    var talNote = T.ok ? '지난 한 주(' + md(weekRange().from) + '~' + md(weekRange().to) + ') 홈페이지 기록으로 채웠습니다. 어린이 ' + talentRows().length + '명.'
      : T.err === 'login' ? '로그인하면(교사단·관리자) 홈페이지의 QT 인증·달란트 기록으로 채울 수 있습니다.'
      : T.err === 'teacher' ? '달란트 기록은 주일학교 교사단·관리자만 볼 수 있습니다. 지금은 선생님이 적는 빈칸으로 나옵니다.'
      : T.err === 'net' ? '달란트 기록을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.' : '';
    $('ed').innerHTML =
      '<h3 class="ed-h">1. 자료 올리기</h3>' +
      '<div class="ed-drop" id="drop"><b>말씀 PDF · 예배 PPT · 그림</b>을 여기에 끌어 놓거나<div class="ed-acts" style="justify-content:center;margin-top:8px">' +
      '<button type="button" class="b-btn" id="b_file">내 컴퓨터에서 고르기</button><button type="button" class="b-btn" id="b_res">자료실(주일학교)에서 고르기</button></div>' +
      '<input type="file" id="file" accept=".pdf,.pptx,image/*" multiple hidden></div>' +
      '<p class="ed-note">구글 드라이브의 파일은 PC의 ‘Google Drive’ 폴더에서 바로 고르거나, 내려받아 끌어 놓으세요. PPT는 .pptx 만 읽습니다(그림을 가져옵니다).</p>' +
      '<div id="resBox"></div><ul class="ed-files" id="files"></ul>' +
      '<h3 class="ed-h">2. 표지 · 설교</h3>' +
      '<div class="ed-row">' + fld('date', '주일', { type: 'date' }) + fld('no', '호수') + '</div>' +
      fld('motto', '표지 말풍선') +
      '<div class="ed-row">' + fld('unit', '단원', { ph: '예: 9단원' }) + fld('lesson', '과', { ph: '예: 36과' }) + '</div>' +
      fld('title', '설교 제목 (줄 바꿈 그대로 나옵니다)', { rows: 2 }) +
      '<div class="ed-row">' + fld('ref', '본문') + fld('preacher', '설교') + '</div>' +
      '<label class="ed-f"><span>설교 그림</span></label><div class="ed-pics" id="pics"></div>' +
      '<div class="ed-acts"><button type="button" class="b-btn" id="b_pic">그림 올리기</button><button type="button" class="b-btn" id="b_nopic">그림 빼기</button><input type="file" id="picFile" accept="image/*" hidden></div>' +
      '<h3 class="ed-h">3. 말씀 암송</h3>' +
      fld('chantText', '암송 구절 (줄 바꿈 그대로)', { rows: 3 }) + fld('chantRef', '장·절') +
      '<h3 class="ed-h">4. 활동지</h3>' +
      '<div class="ed-row">' + fld('actTitle', '활동 제목') + fld('offering', '헌금 위원 칸 (뒤에 붙는 말)') + '</div>' +
      fld('actSub', '활동 부제') + fld('actIntro', '한 줄 안내') +
      fld('ox', '○× 문장 (한 줄에 하나 · 비우면 빠집니다)', { rows: 4 }) +
      '<p class="ed-note">교육목표로 맞는 문장 초안을 넣었습니다. <b>틀린 문장도 섞어</b> ○× 문제를 만들어 주세요.</p>' +
      '<label class="ed-f"><span>빈칸 낱말 (누르면 빈칸이 됩니다)</span></label><div class="ed-words" id="words"></div>' +
      '<div class="ed-row">' + fld('pledgeTitle', '다짐 제목') + fld('pledgeNote', '다짐 안내') + '</div>' +
      fld('band', '아래 띠 문구') +
      '<h3 class="ed-h">5. 교회 소식 · 달란트</h3>' +
      fld('news', '교회 소식 (한 줄에 하나 · ‘제목 — 설명’)', { rows: 5 }) +
      '<div class="ed-acts"><button type="button" class="b-btn" id="b_forms">지금 받는 신청서 넣기</button></div>' +
      '<label class="ed-f"><span>달란트 현황</span><select data-k="talMode"><option value="table">어린이별 표 (이름 · QT · 이번 주 · 누적)</option><option value="sum">합계만 (이름 없이)</option><option value="blank">선생님이 적는 빈칸</option></select></label>' +
      (Object.keys(grpOpts).length > 1 ? '<label class="ed-f"><span>누구를 넣을까요</span><select data-k="talGroup"><option value="">모두</option>' + Object.keys(grpOpts).sort().map(function (g) { return '<option value="' + esc(g) + '">' + esc(g) + '</option>'; }).join('') + '</select></label>' : '') +
      (talNote ? '<p class="ed-note">' + esc(talNote) + '</p>' : '') +
      '<p class="ed-note" style="margin-top:14px">고친 내용은 이 기기에 저장됩니다. 다 되면 위의 <b>인쇄 · PDF로 저장</b>을 누르고, 대상을 ‘PDF로 저장’, 용지를 A4 가로로 고르세요.</p>' +
      '<div class="ed-acts"><button type="button" class="b-btn" id="b_reset">이번 주 내용 비우기</button></div>';
    Array.prototype.forEach.call($('ed').querySelectorAll('select[data-k]'), function (s) { s.value = S[s.getAttribute('data-k')] || ''; });
    bindEditor(); renderPics(); renderWords(); renderLog();
  }
  function bindEditor() {
    var ed = $('ed'), tmr = 0;
    ed.addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k) return;
      var v = e.target.value;
      if (k === 'no') { S.no = parseInt(v, 10) || 0; S.noEdited = !!S.no; }
      else if (k === 'date') { if (!parseYmd(v)) return; S.date = v; if (!S.noEdited) S.no = 0; var nf = ed.querySelector('[data-k=no]'); if (nf && !S.noEdited) nf.value = autoNo(v); loadTalents().then(function () { render(); editor(); }); return; }
      else S[k] = v;
      if (k === 'chantText') { S.blanks = null; renderWords(); }
      clearTimeout(tmr); tmr = setTimeout(render, 120);
    });
    ed.addEventListener('change', function (e) { var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (k === 'talMode' || k === 'talGroup') { S[k] = e.target.value; render(); } });
    $('b_file').onclick = function () { $('file').click(); };
    $('file').onchange = function () { handleFiles(this.files); this.value = ''; };
    $('b_pic').onclick = function () { $('picFile').click(); };
    $('picFile').onchange = function () { var f = this.files[0]; this.value = ''; if (f) blobToJpeg(f).then(function (j) { if (j) { PICS.unshift(j); S.pic = j.src; renderPics(); render(); } }); };
    $('b_nopic').onclick = function () { S.pic = ''; renderPics(); render(); };
    $('b_res').onclick = openResources;
    $('b_forms').onclick = addForms;
    $('b_reset').onclick = function () {
      if (this.dataset.armed !== '1') { this.dataset.armed = '1'; this.textContent = '한 번 더 누르면 비웁니다'; var b = this; setTimeout(function () { b.dataset.armed = ''; b.textContent = '이번 주 내용 비우기'; }, 3000); return; }
      ['lesson', 'title', 'ref', 'core', 'chantRef', 'chantText', 'actTitle', 'actSub', 'actIntro', 'ox', 'band', 'pic'].forEach(function (k) { S[k] = ''; });
      S.goals = []; S.blanks = null; PICS = []; editor(); render();
    };
    var drop = $('drop');
    ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files); });
  }
  var PICS = [];
  function renderPics() {
    var box = $('pics'); if (!box) return;
    var list = PICS.slice(); if (S.pic && !list.some(function (p) { return p.src === S.pic; })) list.unshift({ src: S.pic });
    box.innerHTML = list.length ? list.map(function (p, i) { return '<button type="button" data-i="' + i + '" class="' + (p.src === S.pic ? 'is-on' : '') + '" aria-label="그림 ' + (i + 1) + '"><img src="' + esc(p.src) + '" alt=""></button>'; }).join('')
      : '<p class="ed-note" style="grid-column:1/-1;margin:0">자료(PDF·PPT)를 올리면 그 안의 그림이 여기에 나옵니다.</p>';
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) { b.onclick = function () { var p = list[+b.getAttribute('data-i')]; S.pic = S.pic === p.src ? '' : p.src; renderPics(); render(); }; });
  }
  function renderWords() {
    var box = $('words'); if (!box) return;
    if (S.blanks == null) S.blanks = autoBlanks();
    var toks = verseToks();
    box.innerHTML = toks.length ? toks.map(function (t, i) { return '<button type="button" data-i="' + i + '" class="' + (S.blanks.indexOf(i) >= 0 ? 'is-on' : '') + '">' + esc(cleanTok(t)) + '</button>'; }).join('')
      : '<p class="ed-note" style="margin:0">암송 구절을 넣으면 낱말이 나옵니다.</p>';
    Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
      b.onclick = function () { var i = +b.getAttribute('data-i'), k = S.blanks.indexOf(i); if (k >= 0) S.blanks.splice(k, 1); else S.blanks.push(i); S.blanks.sort(function (a, c) { return a - c; }); renderWords(); render(); };
    });
  }

  /* ── 파일 처리 ── */
  var LOG = [];   // 올린 파일 기록(입력 칸을 다시 그려도 남게)
  function renderLog() { var ul = $('files'); if (ul) ul.innerHTML = LOG.map(function (x) { return '<li>' + esc(x.t) + '</li>'; }).join(''); }
  function fileItem(name) { var it = { t: '⏳ ' + name }; LOG.push(it); renderLog(); return function (ok, m) { it.t = (ok ? '✓ ' : '⚠ ') + name + (m ? ' — ' + m : ''); renderLog(); }; }
  function handleFiles(list) {
    var arr = Array.prototype.slice.call(list || []);
    return arr.reduce(function (p, f) { return p.then(function () { return handleFile(f, f.name); }); }, Promise.resolve());
  }
  function handleFile(blob, name) {
    var lower = String(name || '').toLowerCase(), done = fileItem(name);
    var job;
    if (/\.pdf$/.test(lower) || blob.type === 'application/pdf') {
      job = blob.arrayBuffer().then(readPdf).then(function (r) {
        var L = parseLesson(r.lines), got = [];
        if (L.title || L.chantText) { applyLesson(L); got.push('제목·본문·암송'); }
        r.pics.forEach(function (p) { PICS.push(p); });
        if (r.pics.length) got.push('그림 ' + r.pics.length + '장');
        if (!S.pic && r.pics.length) S.pic = pickPic(r.pics);
        editor(); render();
        done(true, got.length ? got.join(' · ') + ' 가져옴' : '읽을 글자를 찾지 못했습니다(그림으로 된 PDF일 수 있습니다)');
      });
    } else if (/\.pptx$/.test(lower)) {
      job = jszip().then(function (Z) { return Z.loadAsync(blob); }).then(function (zip) {
        var files = Object.keys(zip.files).filter(function (k) { return /^ppt\/media\/.+\.(png|jpe?g)$/i.test(k); }).sort();
        return files.slice(0, 30).reduce(function (p, k) {
          return p.then(function () { return zip.file(k).async('blob').then(blobToJpeg).then(function (j) { if (j) PICS.push(j); }); });
        }, Promise.resolve()).then(function () {
          if (!S.pic) { var c = PICS.filter(function (p) { return p.w; }); if (c.length) S.pic = pickPic(c); }
          renderPics(); render(); done(true, '그림 ' + files.length + '장 가운데 쓸 만한 것을 가져옴');
        });
      });
    } else if (/^image\//.test(blob.type) || /\.(png|jpe?g|webp)$/.test(lower)) {
      job = blobToJpeg(blob).then(function (j) { if (j) { PICS.unshift(j); S.pic = j.src; renderPics(); render(); done(true, '설교 그림으로 넣음'); } else done(false, '그림이 너무 작습니다'); });
    } else { done(false, 'PDF · PPTX · 그림만 읽습니다'); return Promise.resolve(); }
    return job.catch(function (e) { console.warn('[ss-bulletin]', e); done(false, (e && e.message) || '읽지 못했습니다'); });
  }
  // 설교 그림: 가로가 조금 긴(3:2 안팎) 큰 그림을 먼저
  function pickPic(list) {
    var best = null, bs = -1;
    list.forEach(function (p) { if (!p.w) return; var r = p.w / p.h, s = (r >= 1.1 && r <= 2.1 ? 2 : 0) + Math.min(1, p.w * p.h / 4e5); if (s > bs) { bs = s; best = p; } });
    return best ? best.src : '';
  }

  /* ── 자료실 '주일학교' ── */
  function openResources() {
    var box = $('resBox');
    if (!token()) { box.innerHTML = '<div class="ed-warn">자료실은 로그인한 교인만 볼 수 있습니다. 홈페이지에서 로그인한 뒤 다시 열어 주세요.</div>'; return; }
    box.innerHTML = '<p class="ed-note">자료실을 불러오는 중…</p>';
    api('resources?select=id,title,path,size,created_at&category=eq.sunday-school&order=created_at.desc&limit=40').then(function (rows) {
      rows = (rows || []).filter(function (r) { return /\.(pdf|pptx|png|jpe?g|webp)$/i.test(r.title || ''); });
      if (!rows.length) { box.innerHTML = '<div class="ed-warn">자료실 ‘주일학교’에 PDF·PPTX 파일이 없습니다. 자료실에 먼저 올려 주세요.</div>'; return; }
      box.innerHTML = '<div class="ed-res">' + rows.map(function (r, i) { return '<button type="button" data-i="' + i + '">📄 ' + esc(r.title) + ' <small style="color:#8b7b6c">· ' + esc(String(r.created_at || '').slice(0, 10)) + '</small></button>'; }).join('') + '</div>';
      Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) {
        b.onclick = function () { var r = rows[+b.getAttribute('data-i')]; box.innerHTML = ''; fetchResource(r); };
      });
    }).catch(function () { box.innerHTML = '<div class="ed-warn">자료실을 불러오지 못했습니다.</div>'; });
  }
  function fetchResource(r) {
    var urlP = /^https?:\/\//.test(r.path || '') ? Promise.resolve(r.path)
      : fetch(URL0 + '/storage/v1/object/sign/resources/' + String(r.path).split('/').map(encodeURIComponent).join('/'), {
        method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 600 })
      }).then(function (x) { return x.json(); }).then(function (d) { if (!d || !d.signedURL) throw new Error('내려받기 주소를 받지 못했습니다'); return URL0 + '/storage/v1' + d.signedURL; });
    status('자료실 파일을 내려받는 중…');
    return urlP.then(function (u) { return fetch(u); }).then(function (x) { if (!x.ok) throw new Error('HTTP ' + x.status); return x.blob(); })
      .then(function (b) { status(''); return handleFile(b, r.title); })
      .catch(function (e) { status(''); var d = fileItem(r.title); d(false, e.message || '내려받지 못했습니다'); });
  }

  /* ── 지금 받는 신청서 → 교회 소식 ── */
  function addForms() {
    api('rpc/app_open_forms', { method: 'POST', body: '{}' }).then(function (rows) {
      var have = String(S.news || ''), add = [];
      (rows || []).forEach(function (f) {
        if (!f.title || have.indexOf(f.title) >= 0) return;
        var c = f.close_at ? new Date(f.close_at) : null;
        add.push(f.title + ' — ' + (c ? (c.getMonth() + 1) + '월 ' + c.getDate() + '일까지 ' : '') + '홈페이지 신청서에서 신청하세요.');
      });
      if (!add.length) { status('새로 넣을 신청서가 없습니다'); setTimeout(function () { status(''); }, 2500); return; }
      S.news = (have.trim() ? have.trim() + '\n' : '') + add.join('\n');
      editor(); render();
    }).catch(function () { status('신청서를 불러오지 못했습니다'); });
  }

  /* ── 인쇄 ── */
  function doPrint() {
    S.base = { no: S.no, date: S.date }; S.noEdited = false; save();   // 다음 주는 이 호에서 +1
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fonts.then(function () { window.print(); });
  }

  /* ── 시작 ── */
  function start() {
    $('b_print').onclick = doPrint;
    window.addEventListener('resize', scale);
    window.addEventListener('beforeprint', function () { document.documentElement.style.removeProperty('--k'); });
    window.addEventListener('afterprint', scale);
    scale(); editor(); render();
    loadTalents().then(function () { editor(); render(); });
  }
  window.SSBulletin = { parseLesson: parseLesson, autoBlanks: autoBlanks, state: function () { return S; } };   // 점검용
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
