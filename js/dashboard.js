/* dashboard.js — 대시보드(dashboard.html): 정회원 전용 개인 홈
 * 오늘의 큐티(아멘 체크)·이번주 설교·주보·진행중인 교육·헌금·가계도·QT 진행표
 * 콘솔: [dashboard.js] v20260701da
 */
console.log('[dashboard.js] v20260809ss9 (주일학교: 성장기 전용 섹션)');

(function () {
  var root = document.getElementById('dashRoot');
  if (!root) return;

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR'); };
  function pad2(n) { return ('0' + n).slice(-2); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  // 성경 본문(줄마다 "번호 내용")을 절 목록으로 정돈
  function bibleVersesHTML(text) {
    var lines = String(text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    return lines.map(function (ln) {
      var m = ln.match(/^(\d+)\s*(.*)$/);
      if (m) return '<div class="qtc-verse"><span class="qtc-vn">' + m[1] + '</span><span>' + esc(m[2]) + '</span></div>';
      return '<div class="qtc-verse"><span>' + esc(ln) + '</span></div>';
    }).join('');
  }
  // ── 갓피아(GODpia) 성경 듣기 딥링크 (main.js의 QT 위젯 내부 스코프라 접근 불가 → 자체 보유) ──
  var GODPIA_BASE = 'https://www.godpia.com/read/reading.asp';
  var GODPIA_VOL = {
    '창세기':'gen','출애굽기':'exo','레위기':'lev','민수기':'num','신명기':'deu',
    '여호수아':'jos','사사기':'jdg','룻기':'rut','사무엘상':'1sa','사무엘하':'2sa',
    '열왕기상':'1ki','열왕기하':'2ki','역대상':'1ch','역대하':'2ch','에스라':'ezr',
    '느헤미야':'neh','에스더':'est','욥기':'job','시편':'psa','잠언':'pro',
    '전도서':'ecc','아가':'sng','이사야':'isa','예레미야':'jer','예레미야애가':'lam',
    '에스겔':'ezk','다니엘':'dan','호세아':'hos','요엘':'jol','아모스':'amo',
    '오바댜':'oba','요나':'jnh','미가':'mic','나훔':'nam','하박국':'hab',
    '스바냐':'zep','학개':'hag','스가랴':'zec','말라기':'mal','마태복음':'mat',
    '마가복음':'mrk','누가복음':'luk','요한복음':'jhn','사도행전':'act','로마서':'rom',
    '고린도전서':'1co','고린도후서':'2co','갈라디아서':'gal','에베소서':'eph','빌립보서':'php',
    '골로새서':'col','데살로니가전서':'1th','데살로니가후서':'2th','디모데전서':'1ti','디모데후서':'2ti',
    '디도서':'tit','빌레몬서':'phm','히브리서':'heb','야고보서':'jas','베드로전서':'1pe',
    '베드로후서':'2pe','요한일서':'1jn','요한이서':'2jn','요한삼서':'3jn','유다서':'jud','요한계시록':'rev',
    '창':'gen','출':'exo','레':'lev','민':'num','신':'deu','수':'jos','삿':'jdg','룻':'rut',
    '삼상':'1sa','삼하':'2sa','왕상':'1ki','왕하':'2ki','대상':'1ch','대하':'2ch','스':'ezr',
    '느':'neh','에':'est','욥':'job','시':'psa','잠':'pro','전':'ecc','아':'sng','사':'isa',
    '렘':'jer','애':'lam','겔':'ezk','단':'dan','호':'hos','욜':'jol','암':'amo','옵':'oba',
    '욘':'jnh','미':'mic','나':'nam','합':'hab','습':'zep','학':'hag','슥':'zec','말':'mal',
    '마':'mat','막':'mrk','눅':'luk','요':'jhn','행':'act','롬':'rom','고전':'1co','고후':'2co',
    '갈':'gal','엡':'eph','빌':'php','골':'col','살전':'1th','살후':'2th','딤전':'1ti','딤후':'2ti',
    '딛':'tit','몬':'phm','히':'heb','약':'jas','벧전':'1pe','벧후':'2pe','요일':'1jn','요이':'2jn',
    '요삼':'3jn','유':'jud','계':'rev'
  };
  function godpiaUrl(ref) {
    if (!ref) return GODPIA_BASE;
    var m = String(ref).replace(/\s+/g, ' ').trim().match(/([가-힣]+)\s*(\d+)\s*[:：]/);
    if (!m) return GODPIA_BASE;
    var code = GODPIA_VOL[m[1]];
    return code ? (GODPIA_BASE + '?vol=' + code + '&chap=' + m[2]) : GODPIA_BASE;
  }

  // 묵상/기도(HTML 또는 줄바꿈 텍스트)를 문단 블록으로 변환
  function toParaHTML(text) {
    var s = String(text || '');
    if (!s.trim()) return '';
    if (/<[a-z][\s\S]*>/i.test(s)) return s; // 이미 HTML(리치텍스트)이면 그대로
    return s.split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }

  function sbUser() {
    try {
      var ref = new URL(window.SUPABASE_URL).hostname.split('.')[0];
      var raw = localStorage.getItem('sb-' + ref + '-auth-token');
      if (!raw) return null;
      var s = JSON.parse(raw); s = s.currentSession || s;
      return (s && s.user) || null;
    } catch (e) { return null; }
  }

  // ── 로그인 대기 → 정회원 확인 ──
  var tries = 0;
  function waitLogin() {
    if (!window.FINANCE_API_URL) { showLocked('준비 중', '로그인 기능이 아직 설정되지 않았습니다.'); return; }
    if (window.WPF && WPF.token()) { boot(); return; }
    if (tries++ < 20) { setTimeout(waitLogin, 400); return; }
    showLocked('로그인이 필요합니다', '대시보드는 정회원 로그인 후 이용할 수 있습니다.', true);
  }
  function showLocked(title, msg, offerProfileLink) {
    root.innerHTML = '<div class="member-lock"><div class="lock-icon">🔒</div><h3>' + esc(title) + '</h3><p>' + esc(msg) + '</p></div>';
    var lock = root.querySelector('.member-lock');
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-line'; b.style.marginTop = '12px';
    if (offerProfileLink) {
      b.textContent = '로그인';
      b.onclick = function () { var m = document.getElementById('authModal'); if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; } };
    } else {
      b.textContent = '내 정보로 이동 →';
      b.onclick = function () { location.href = 'admin.html'; };
    }
    lock.appendChild(b);
  }

  function boot() {
    root.innerHTML = '<p class="qt-loading">확인 중입니다…</p>';
    WPF.call('me').then(function (me) {
      if (me.status !== '정회원') { showLocked('정회원 전용 페이지입니다', '교적 인증 후 정회원이 되면 대시보드를 이용할 수 있습니다.'); return; }
      renderDashboard(me);
    }).catch(function (e) { showLocked('오류가 발생했습니다', e.message); });
  }

  function renderDashboard(me) {
    var grp = 'font-family:"Noto Serif KR",serif;font-size:1.05rem;font-weight:700;color:var(--accent,#032257);margin:32px 0 16px;padding-bottom:8px;border-bottom:2px solid var(--accent,#032257);';
    root.innerHTML =
      '<div class="form-card" style="margin-bottom:22px;padding:16px 18px;">' +
      '<h2 id="dashWelcome" style="margin:0;font-size:1.15rem;color:var(--accent,#032257);">' + esc(me.memberName || '') + '님, 환영합니다 🙏</h2>' +
      '</div>' +
      '<h2 style="' + grp + 'margin-top:6px;">🕊 나의 신앙생활</h2>' +
      '<div id="dashQt" style="margin-bottom:22px;"></div>' +
      '<div id="bibleRead" style="margin-bottom:22px;"></div>' +
      '<div id="qtProgress" style="margin-bottom:22px;"></div>' +
      '<div id="myEdu" style="margin-bottom:22px;"></div>' +
      '<h2 style="' + grp + '">💒 나의 교회생활</h2>' +
      '<div id="ssDash" style="margin-bottom:22px;"></div>' +
      '<div class="form-card" style="margin-bottom:22px;padding:16px 18px;"><h3 style="margin:0 0 10px;font-size:1rem;color:var(--accent,#032257);">💝 헌금</h3><div id="offeringList"><p class="qt-loading">불러오는 중…</p></div></div>' +
      '<div id="myDocs" style="margin-bottom:22px;"></div>' +
      '<div id="familyTree" style="margin-bottom:22px;"></div>' +
      '<p style="text-align:center;margin-top:14px;"><a class="btn btn-line" href="index.html#qt">이번 주 말씀·주보는 홈에서 보기 →</a></p>';
    loadWelcomeName(me);
    loadTodayQt(me);
    loadBibleReading(me);
    loadQtProgress(me);
    loadMyEdu(me);
    loadSundaySchool(me);
    loadOfferings(me);
    loadMyDocs(me);
    loadFamily(me);
  }

  /* ================= 나의 성경읽기 (구속사 365 · 우리말성경) ================= */
  var BR = { rows: [], readers: null };   // rows: [{day_no, done_at}] (본인 진도)
  function brFetch(path, opt) {
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, tok = (window.WPF && WPF.token && WPF.token());
    if (!url || !ak || !tok) return Promise.reject(new Error('no-auth'));
    var o = opt || {};
    var h = { apikey: ak, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
    if (o.headers) { for (var k in o.headers) h[k] = o.headers[k]; }
    o.headers = h;
    return fetch(url + '/rest/v1/' + path, o).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }
  function brP2(n) { return String(n).padStart(2, '0'); }
  function brDayKey(dt) { return dt.getFullYear() + '-' + brP2(dt.getMonth() + 1) + '-' + brP2(dt.getDate()); }
  // 연속일: 읽은 '날짜'가 오늘(또는 오늘 아직 안 읽었으면 어제)부터 며칠 이어졌는지
  function brStreak(rows) {
    var days = {};
    rows.forEach(function (r) { var d = new Date(r.done_at); if (!isNaN(d)) days[brDayKey(d)] = 1; });
    var cur = new Date(), n = 0;
    if (!days[brDayKey(cur)]) cur.setDate(cur.getDate() - 1);   // 오늘 미체크는 아직 끊긴 게 아님
    while (days[brDayKey(cur)]) { n++; cur.setDate(cur.getDate() - 1); }
    return n;
  }
  // 완주 예상일: 시작일부터의 평균 속도(일차/일)로 남은 분량을 나눔
  function brEta(rows) {
    if (rows.length < 3 || rows.length >= 365) return '';
    var first = Infinity;
    rows.forEach(function (r) { var t = new Date(r.done_at).getTime(); if (t && t < first) first = t; });
    if (!isFinite(first)) return '';
    var elapsed = Math.max(1, (Date.now() - first) / 86400000);
    var rate = rows.length / elapsed;
    if (!(rate > 0)) return '';
    var eta = new Date(Date.now() + Math.ceil((365 - rows.length) / rate) * 86400000);
    return eta.getFullYear() + '.' + brP2(eta.getMonth() + 1) + '.' + brP2(eta.getDate());
  }
  function loadBibleReading(me) {
    var el = document.getElementById('bibleRead'); if (!el) return;
    if (!window.BIBLE_PLAN) { el.innerHTML = ''; return; }
    var head = '<div class="form-card" style="padding:16px 18px"><h3 style="margin:0 0 10px;font-size:1rem;color:var(--accent,#032257)">📖 나의 성경읽기 <span style="font-weight:400;font-size:.76rem;color:#9aa5b1">구속사 365 · 우리말성경</span></h3>';
    el.innerHTML = head + '<p class="qt-loading">불러오는 중…</p></div>';
    var uid = sbUser() && sbUser().id;
    if (!uid) { el.innerHTML = head + '<p style="color:#9aa5b1;font-size:.88rem;margin:0">성경읽기 진도를 불러오지 못했습니다.</p></div>'; return; }
    // 반드시 본인(user_id) 것만 조회 — 관리자는 RLS상 전체 bible_reading을 읽을 수 있어, 필터가 없으면
    // 다른 성도의 체크가 섞여 '내 진도'처럼 잘못 표시된다.
    Promise.all([
      brFetch('bible_reading?select=day_no,done_at&user_id=eq.' + uid + '&order=day_no'),
      brFetch('rpc/bible_readers_count', { method: 'POST', body: '{}' }).catch(function () { return null; })
    ]).then(function (rs) {
      BR.rows = rs[0] || []; BR.readers = rs[1];
      paintBibleCard(el, head);
    }).catch(function (e) {
      var m = (e && e.message) || '';
      el.innerHTML = head + (/42P01|does not exist|schema cache|Could not find/i.test(m)
        ? '<p style="color:#9aa5b1;font-size:.88rem;margin:0">성경읽기 표가 아직 준비되지 않았습니다 — 관리자가 supabase/bible_reading.sql 을 실행하면 열립니다.</p>'
        : '<p style="color:#9aa5b1;font-size:.88rem;margin:0">성경읽기 진도를 불러오지 못했습니다.</p>') + '</div>';
    });
  }
  function paintBibleCard(el, head) {
    var P = window.BIBLE_PLAN, rows = BR.rows;
    var done = {}; rows.forEach(function (r) { done[r.day_no] = 1; });
    var cnt = rows.length, next = 0;
    for (var i = 1; i <= 365; i++) { if (!done[i]) { next = i; break; } }
    var pct = Math.round(cnt / 365 * 100);
    var day = next ? P.days[next - 1] : null;
    var streak = brStreak(rows), eta = brEta(rows);
    var meta = [];
    if (streak > 0) meta.push('🔥 연속 ' + streak + '일');
    if (eta) meta.push('이 속도면 <b>' + eta + '</b> 완주');
    if (BR.readers != null && BR.readers > 0) meta.push('🙌 함께 읽는 성도 <b>' + BR.readers + '명</b>');
    el.innerHTML = head +
      '<div style="display:flex;justify-content:space-between;align-items:center;font-size:.84rem;color:#5b6b7d;margin-bottom:6px"><span>' + cnt + ' / 365일</span><b style="color:var(--accent,#032257)">' + pct + '%</b></div>' +
      '<div style="background:#eef2f7;border-radius:7px;height:10px;overflow:hidden;margin-bottom:12px"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#3a6db5,#032257)"></div></div>' +
      (day
        ? '<div style="background:#f6f9f3;border:1px solid #e2e8da;border-radius:11px;padding:12px 14px;margin-bottom:12px">' +
          '<div style="font-size:.76rem;color:#5b7a52;font-weight:700;margin-bottom:3px">오늘의 읽기 · Day ' + day.d + '</div>' +
          '<div style="font-size:.8rem;color:#7b8794;margin-bottom:4px">' + esc(P.themes[day.t]) + '</div>' +
          '<div style="font-size:1.06rem;font-weight:700;color:var(--accent,#032257)">' + esc(day.r) + '</div>' +
          (window.BIBLE_NOTES && window.BIBLE_NOTES.days[day.d - 1]
            ? '<div style="margin-top:9px;padding-top:9px;border-top:1px dashed #d9e2d2;font-size:.87rem;line-height:1.75;color:#3f5240">💬 ' + esc(window.BIBLE_NOTES.days[day.d - 1]) + '</div>'
            : '') +
          '</div>'
        : '<div style="background:#f0f7ef;border:1px solid #d8e8d4;border-radius:11px;padding:14px;text-align:center;margin-bottom:12px;font-weight:700;color:#2f5d3a">🎉 365일 완주를 축하합니다!</div>') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:' + (meta.length ? '10px' : '0') + '">' +
      (day
        ? '<button type="button" id="brRead" style="padding:9px 18px;border:0;border-radius:9px;background:var(--accent,#032257);color:#fff;font:inherit;font-weight:700;cursor:pointer">📖 본문 읽기</button>' +
          '<button type="button" class="btn btn-line" id="brDone" style="padding:8px 16px">✓ 읽기 완료</button>'
        : '') +
      '<button type="button" class="btn btn-line" id="brTable" style="padding:8px 16px">전체 표</button></div>' +
      (meta.length ? '<div style="font-size:.8rem;color:#7b8794">' + meta.join(' · ') + '</div>' : '') +
      '</div>';
    var rd = el.querySelector('#brRead'), dn = el.querySelector('#brDone'), tb = el.querySelector('#brTable');
    if (rd) rd.onclick = function () { brReadingModal(day, function () { brCheck(day.d, el, head); }); };
    if (dn) dn.onclick = function () { brCheck(day.d, el, head); };
    if (tb) tb.onclick = function () { brTableModal(el, head); };
  }
  function brCheck(dayNo, el, head) {
    if (BR.rows.some(function (r) { return r.day_no === dayNo; })) return;
    brFetch('bible_reading', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ day_no: dayNo }) })
      .then(function () { BR.rows.push({ day_no: dayNo, done_at: new Date().toISOString() }); paintBibleCard(el, head); })
      .catch(function (e) {
        if (/duplicate|23505/i.test((e && e.message) || '')) { BR.rows.push({ day_no: dayNo, done_at: new Date().toISOString() }); paintBibleCard(el, head); return; }
        alert('저장 실패: ' + ((e && e.message) || '네트워크 오류'));
      });
  }
  function brUncheck(dayNo) {
    return brFetch('bible_reading?day_no=eq.' + dayNo, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
      .then(function () { BR.rows = BR.rows.filter(function (r) { return r.day_no !== dayNo; }); });
  }
  function brLoadUrm() {
    if (window.BIBLE_URM) return Promise.resolve(window.BIBLE_URM);
    return fetch('data/bible-urm.json?v=20260729').then(function (r) { if (!r.ok) throw new Error('성경 본문을 불러오지 못했습니다'); return r.json(); })
      .then(function (d) { window.BIBLE_URM = d; return d; });
  }
  // 브라우저 내장 음성 중 가장 자연스러운 한국어 목소리 선택(AI·비용 없이 즉시 재생)
  function brBestVoice() {
    var vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    var ko = vs.filter(function (v) { return /^ko/i.test(v.lang || ''); });
    function score(v) {
      var n = (v.name || '').toLowerCase();
      if (/google/.test(n)) return 4;                                   // 크롬 '구글 한국어' — 가장 자연스러움
      if (/natural|neural|premium|enhanced|yuna|sora|heami|siri/.test(n)) return 3;
      if (!v.localService) return 2;                                    // 온라인 음성이 대체로 더 자연스러움
      return 1;
    }
    ko.sort(function (a, b) { return score(b) - score(a); });
    return ko[0] || null;
  }
  // 본문 읽기(우리말성경) — 🔊 듣기(절 따라 하이라이트) + 하단 [읽기 완료]까지 한 흐름
  function brReadingModal(day, onDone) {
    var P = window.BIBLE_PLAN;
    var ttsOk = !!window.speechSynthesis;
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,15,25,.55);z-index:9600;display:flex;align-items:flex-start;justify-content:center;padding:20px 12px;overflow:auto';
    ov.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:720px;width:100%;padding:16px 18px;box-shadow:0 24px 60px rgba(0,0,0,.32);display:flex;flex-direction:column;max-height:calc(100vh - 28px);max-height:calc(100dvh - 28px)">' +
      '<div style="flex:0 0 auto;display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div style="min-width:0">' +
      '<div style="font-size:.76rem;color:#5b7a52;font-weight:700">Day ' + day.d + ' · ' + esc(P.themes[day.t]) + '</div>' +
      '<h3 style="margin:4px 0 0;color:var(--accent,#032257);font-family:\'Noto Serif KR\',serif">' + esc(day.r) + ' <span style="font-size:.72rem;color:#9aa5b1;font-weight:400">우리말성경</span></h3></div>' +
      '<div style="display:flex;gap:6px;flex:0 0 auto">' +
      '<button class="btn btn-line" id="brm_ai" style="padding:4px 12px;white-space:nowrap">🔊 음성듣기</button>' +
      '<button class="btn btn-line" id="brm_close" style="padding:4px 12px;white-space:nowrap">닫기</button></div></div>' +
      '<div id="brm_scroll" style="flex:1 1 auto;overflow-y:auto;min-height:0;-webkit-overflow-scrolling:touch;margin-top:6px">' +
      (function () {   // 🧭 구속사 파노라마: 지금 성경 전체 이야기의 어디쯤을 읽고 있는지 + 오늘 본문의 의미
        var N = window.BIBLE_NOTES; if (!N) return '';
        var t = N.themes[day.t] || '', dn = N.days[day.d - 1] || '';
        return '<div style="background:#f4f7fb;border:1px solid #dde6f2;border-radius:11px;padding:12px 14px">' +
          '<div style="font-size:.74rem;font-weight:700;color:#3a5a8c;margin-bottom:5px">🧭 구속사 파노라마 · 주제 ' + (day.t + 1) + '/38</div>' +
          (t ? '<div style="font-size:.84rem;line-height:1.75;color:#44506a">' + esc(t) + '</div>' : '') +
          (dn ? '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #d3ddeb;font-size:.86rem;line-height:1.75;color:#3f5240">💬 ' + esc(dn) + '</div>' : '') +
          '</div>';
      })() +
      '<div id="brm_body" style="margin-top:14px;line-height:1.95;font-size:1.02rem;font-family:\'Noto Serif KR\',serif;color:#1f2937"><p class="qt-loading">본문을 불러오는 중…</p></div>' +
      '</div>' +
      (onDone ? '<div style="flex:0 0 auto;margin-top:12px;text-align:center"><button type="button" id="brm_done" style="padding:10px 28px;border:0;border-radius:10px;background:var(--accent,#032257);color:#fff;font:inherit;font-weight:700;cursor:pointer">✓ 읽기 완료</button></div>' : '') +
      '</div>';
    document.body.appendChild(ov); document.body.style.overflow = 'hidden';

    // ── 성경 듣기: 브라우저 내장 음성(비용·생성 대기 없음). 절 단위로 끊어 읽어 호흡이 자연스럽고,
    //    읽는 절을 하이라이트+자동 스크롤. 절을 누르면 그 절부터 듣는다. 절 번호는 읽지 않음.
    var tts = { on: false, gen: 0, idx: 0, items: [], btn: null };
    var TTS_LSK = 'wpBibleTtsPos';   // 멈춘 위치 저장(일차별) → 다음에 이어 듣기
    function savePos() {
      try {
        if (tts.idx > 0 && tts.idx < tts.items.length) localStorage.setItem(TTS_LSK, JSON.stringify({ d: day.d, i: tts.idx }));
        else { var sv = JSON.parse(localStorage.getItem(TTS_LSK) || 'null'); if (sv && sv.d === day.d) localStorage.removeItem(TTS_LSK); }
      } catch (e) { }
    }
    function ttsBtnLabel() { if (tts.btn) tts.btn.textContent = tts.idx > 0 ? '🔊 이어 듣기' : '🔊 듣기'; }
    function ttsHi(el, on) { if (el) { el.style.background = on ? 'rgba(249,222,116,.5)' : ''; el.style.borderRadius = on ? '6px' : ''; } }
    function ttsStop(finished) {
      tts.gen++; tts.on = false;
      if (tts.items[tts.idx]) ttsHi(tts.items[tts.idx].el, false);
      try { speechSynthesis.cancel(); } catch (e) { }
      if (finished) tts.idx = 0;   // 끝까지 들었으면 처음으로
      savePos();
      ttsBtnLabel();
    }
    function ttsSpeakFrom(i) {
      if (typeof aiStop === 'function') { try { aiStop(); } catch (e) { } }   // 브라우저 듣기 시작 시 AI 재생 정지
      tts.gen++; var myGen = tts.gen;
      try { speechSynthesis.cancel(); } catch (e) { }
      if (tts.items[tts.idx]) ttsHi(tts.items[tts.idx].el, false);
      tts.on = true; tts.idx = i;
      if (tts.btn) tts.btn.textContent = '⏸ 멈춤';
      (function next() {
        if (!tts.on || myGen !== tts.gen) return;
        if (tts.idx >= tts.items.length) { ttsStop(true); return; }
        var it = tts.items[tts.idx];
        ttsHi(it.el, true);
        try { it.el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { }
        var u = new SpeechSynthesisUtterance(it.text);
        u.lang = 'ko-KR'; var v = brBestVoice(); if (v) u.voice = v;
        u.rate = 0.95; u.pitch = 1.0;                       // 살짝 느리게 — 낭독 톤
        u.onend = function () { if (myGen !== tts.gen) return; ttsHi(it.el, false); tts.idx++; savePos(); next(); };
        u.onerror = function () { if (myGen !== tts.gen) return; ttsHi(it.el, false); tts.idx++; next(); };
        try { speechSynthesis.speak(u); } catch (e) { ttsStop(); }
      })();
    }

    // ── AI 음성(교회 서버 낭독): 장별 MP3(bible-<책번호>-<장>.mp3)를 순서대로 재생 ──
    var R2B = (window.R2_UPLOAD_URL || 'https://church-files.kds08200820.workers.dev').replace(/\/$/, '') + '/f/bible/';
    var aiChaps = [];
    (day.refs || []).forEach(function (rf) {
      var bid = Object.keys(P.names).indexOf(rf[0]) + 1;
      for (var c = rf[1]; c <= rf[2]; c++) aiChaps.push({ name: P.names[rf[0]] || rf[0], ch: c, url: R2B + 'bible-' + bid + '-' + c + '.mp3' });
    });
    var aiBtn = ov.querySelector('#brm_ai'), aiStarted = false, aiIdx = 0;
    // 플레이어 바(진행 슬라이더 + 장 이동) — 헤더 아래, 본문 위에 삽입
    var pl = document.createElement('div');
    pl.style.cssText = 'flex:0 0 auto;display:none;margin-top:8px;background:#eef4ee;border:1px solid #cfe0cf;border-radius:12px;padding:9px 12px';
    pl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">' +
      '<button type="button" class="btn btn-line" id="brm_prev" style="padding:2px 10px">⏮</button>' +
      '<div id="brm_plabel" style="flex:1;text-align:center;font-weight:700;color:#2f5133;font-size:.92rem">–</div>' +
      '<button type="button" class="btn btn-line" id="brm_next" style="padding:2px 10px">⏭</button></div>' +
      '<audio id="brm_audio" controls preload="metadata" style="width:100%;height:38px"></audio>';
    var scrollRef = ov.querySelector('#brm_scroll');   // 재생바는 스크롤 영역 밖(헤더 아래 고정) — 본문만 스크롤
    if (scrollRef && scrollRef.parentNode) scrollRef.parentNode.insertBefore(pl, scrollRef);
    var audioEl = pl.querySelector('#brm_audio'), plabel = pl.querySelector('#brm_plabel');
    function setBtn(t) { if (aiBtn) aiBtn.textContent = t; }
    function aiStop() { aiStarted = false; try { audioEl.pause(); } catch (e) { } pl.style.display = 'none'; setBtn('🔊 음성듣기'); }   // 모달 닫을 때만 완전 정지
    function playChap(i) {
      if (i < 0) i = 0;
      if (i >= aiChaps.length) { try { audioEl.pause(); } catch (e) { } setBtn('🔊 다시 듣기'); return; }   // 전체 끝
      aiIdx = i; var c = aiChaps[i];
      plabel.textContent = c.name + ' ' + c.ch + '장  (' + (i + 1) + '/' + aiChaps.length + ')';
      audioEl.src = c.url;
      audioEl.play().catch(function () { });
    }
    // 한 장이 끝나면 다음 장 자동 재생(위치 이어감). 마지막 장이면 '다시 듣기'로.
    audioEl.addEventListener('ended', function () { if (aiIdx < aiChaps.length - 1) playChap(aiIdx + 1); else setBtn('🔊 다시 듣기'); });
    audioEl.addEventListener('error', function () { if (aiStarted && aiIdx < aiChaps.length - 1) playChap(aiIdx + 1); });   // 없는 장 자동 건너뜀
    audioEl.addEventListener('play', function () { setBtn('⏸ 멈춤'); });     // 네이티브 컨트롤과 헤더 버튼 라벨 동기화
    audioEl.addEventListener('pause', function () { if (aiStarted && !audioEl.ended) setBtn('▶ 이어듣기'); });
    pl.querySelector('#brm_prev').onclick = function () { if (aiStarted) playChap(aiIdx - 1); };
    pl.querySelector('#brm_next').onclick = function () { if (aiStarted) playChap(aiIdx + 1); };
    if (aiBtn) aiBtn.onclick = function () {
      if (!aiStarted) {   // 최초 시작
        if (!aiChaps.length) { alert('본문 정보를 찾을 수 없습니다.'); return; }
        setBtn('⏳ 확인 중…');
        fetch(aiChaps[0].url, { method: 'GET', headers: { Range: 'bytes=0-1' } }).then(function (r) {
          if (r.status !== 200 && r.status !== 206) { setBtn('🔊 음성듣기'); alert('이 본문의 AI 음성이 아직 준비되지 않았습니다.'); return; }
          aiStarted = true; pl.style.display = 'block'; playChap(0);
        }).catch(function () { setBtn('🔊 음성듣기'); alert('AI 음성을 불러오지 못했습니다.'); });
        return;
      }
      // 이미 재생 세션 중: 재생/일시정지 토글(위치 유지). 다 들었으면 처음부터.
      if (audioEl.ended) { playChap(0); return; }
      if (audioEl.paused) audioEl.play().catch(function () { }); else audioEl.pause();
    };

    function closeDom() { ttsStop(); aiStop(); ov.remove(); document.body.style.overflow = ''; }
    if (window.ModalNav) window.ModalNav.open(closeDom);
    function close() { if (window.ModalNav && window.ModalNav.close()) return; closeDom(); }
    ov.querySelector('#brm_close').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var doneBtn = ov.querySelector('#brm_done');
    if (doneBtn) doneBtn.onclick = function () { close(); if (onDone) onDone(); };

    brLoadUrm().then(function (B) {
      var html = '';
      (day.refs || []).forEach(function (ref) {
        var ab = ref[0], book = B[ab] || [];
        for (var c = ref[1]; c <= ref[2]; c++) {
          var verses = book[c - 1] || [];
          html += '<h4 class="brm-h" style="margin:20px 0 8px;color:var(--accent,#032257);font-size:1.05rem;border-bottom:1px solid #eef1f5;padding-bottom:6px">' + esc((P.names[ab] || ab) + ' ' + c + (ab === '시' ? '편' : '장')) + '</h4>' +
            verses.map(function (v, i) { return '<p class="brm-v" style="margin:0 0 6px"><sup style="color:#9db4d6;font-size:.72rem;margin-right:4px">' + (i + 1) + '</sup>' + esc(v) + '</p>'; }).join('');
        }
      });
      var body = ov.querySelector('#brm_body');
      if (!body) return;
      body.innerHTML = html || '<p style="color:#c0392b">본문 데이터를 찾지 못했습니다.</p>';
      if (!ttsOk || !html) return;
      // 듣기 목록: 장 제목 + 각 절(절 번호 sup 제외한 본문만 읽음)
      tts.items = [];
      Array.prototype.forEach.call(body.querySelectorAll('.brm-h, .brm-v'), function (el) {
        var text = '';
        if (el.classList.contains('brm-h')) text = el.textContent;
        else Array.prototype.forEach.call(el.childNodes, function (n) { if (n.nodeName !== 'SUP') text += n.textContent; });
        text = String(text || '').trim();
        if (text) tts.items.push({ el: el, text: text });
      });
      // 지난번에 멈춘 절이 있으면 그 자리에서 이어 듣기
      try {
        var sv = JSON.parse(localStorage.getItem(TTS_LSK) || 'null');
        if (sv && sv.d === day.d && sv.i > 0 && sv.i < tts.items.length) tts.idx = sv.i;
      } catch (e) { }
      tts.btn = ov.querySelector('#brm_tts');
      ttsBtnLabel();
      if (tts.btn) tts.btn.onclick = function () { if (tts.on) ttsStop(); else ttsSpeakFrom(tts.idx < tts.items.length ? tts.idx : 0); };
      // (절-탭 브라우저 음성은 제거됨 — 낭독은 상단 '음성듣기'(AI)로 통일)
      // 일부 브라우저는 목소리 목록이 늦게 로드됨 — 미리 한 번 불러 캐시
      if (speechSynthesis.getVoices && !speechSynthesis.getVoices().length && 'onvoiceschanged' in speechSynthesis) {
        speechSynthesis.onvoiceschanged = function () { speechSynthesis.onvoiceschanged = null; };
      }
    }).catch(function (e) { var body = ov.querySelector('#brm_body'); if (body) body.innerHTML = '<p style="color:#c0392b">' + esc((e && e.message) || '오류') + '</p>'; });
  }
  // 전체 표: 38개 구속사 주제별 아코디언 + 일차 체크(해제 가능) + 📖 본문 열기
  function brTableModal(cardEl, head) {
    var P = window.BIBLE_PLAN;
    var done = {}; BR.rows.forEach(function (r) { done[r.day_no] = 1; });
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,15,25,.55);z-index:9550;display:flex;align-items:flex-start;justify-content:center;padding:20px 12px;overflow:auto';
    var groups = P.themes.map(function (t, ti) {
      var days = P.days.filter(function (d) { return d.t === ti; });
      var dn = days.filter(function (d) { return done[d.d]; }).length;
      var rowsH = days.map(function (d) {
        return '<div style="display:flex;align-items:center;gap:9px;padding:7px 4px;border-top:1px solid #f2f5f9">' +
          '<input type="checkbox" class="br-ck" data-d="' + d.d + '"' + (done[d.d] ? ' checked' : '') + ' style="width:17px;height:17px;flex:0 0 auto;cursor:pointer">' +
          '<span style="flex:0 0 56px;font-size:.78rem;color:#9aa5b1">Day ' + d.d + '</span>' +
          '<span style="flex:1;font-size:.9rem;color:#1f2937">' + esc(d.r) + '</span>' +
          '<button type="button" class="br-open" data-d="' + d.d + '" title="본문 읽기" style="border:1px solid #dfe5ee;background:#fff;border-radius:7px;padding:3px 8px;cursor:pointer;font-size:.8rem">📖</button>' +
          '</div>';
      }).join('');
      return '<details' + (days.some(function (d) { return !done[d.d]; }) && dn > 0 ? ' open' : '') + ' style="border:1px solid #e6ebf2;border-radius:10px;margin-bottom:8px;background:#fff">' +
        '<summary style="cursor:pointer;padding:10px 12px;font-weight:700;color:var(--accent,#032257);font-size:.9rem;list-style-position:inside">' + (ti + 1) + '. ' + esc(t) +
        ' <span class="br-gcnt" data-ti="' + ti + '" style="font-weight:400;color:' + (dn === days.length ? '#1e874b' : '#9aa5b1') + ';font-size:.78rem">' + (dn === days.length ? '✓ 완료' : dn + '/' + days.length + '일') + '</span></summary>' +
        '<div style="padding:2px 12px 10px">' +
        (window.BIBLE_NOTES && window.BIBLE_NOTES.themes[ti]
          ? '<div style="margin:4px 0 8px;padding:9px 11px;background:#f4f7fb;border-radius:8px;font-size:.8rem;line-height:1.7;color:#44506a">🧭 ' + esc(window.BIBLE_NOTES.themes[ti]) + '</div>'
          : '') +
        rowsH + '</div></details>';
    }).join('');
    ov.innerHTML = '<div style="background:#f7f9fc;border-radius:14px;max-width:720px;width:100%;padding:20px 18px;box-shadow:0 24px 60px rgba(0,0,0,.32)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><h3 style="margin:0;color:var(--accent,#032257)">📖 구속사 성경읽기 365 <span id="brt_cnt" style="font-size:.84rem;color:#9aa5b1;font-weight:600">' + BR.rows.length + '/365</span></h3><button class="btn btn-line" id="brt_close" style="padding:4px 12px">닫기</button></div>' +
      '<p style="margin:0 0 12px;font-size:.76rem;color:#9aa5b1">✅ 체크하면 <b>바로 저장</b>되고, 체크를 해제하면 <b>삭제</b>됩니다(별도 저장 버튼이 필요 없어요) · 📖 를 누르면 우리말성경 본문이 열립니다</p>' +
      '<div style="max-height:64vh;overflow:auto"><div id="brt_cov"></div>' + groups + '</div></div>';
    document.body.appendChild(ov); document.body.style.overflow = 'hidden';
    function closeDom() { ov.remove(); document.body.style.overflow = ''; paintBibleCard(cardEl, head); }   // 닫을 때 카드 갱신
    if (window.ModalNav) window.ModalNav.open(closeDom);
    function close() { if (window.ModalNav && window.ModalNav.close()) return; closeDom(); }
    ov.querySelector('#brt_close').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

    // ── 성경 전체 커버리지: 66권 각각 몇 장을 읽었는지 한눈에(권별 읽은 장/전체 장) ──
    var ORDER_OT = ['창', '출', '레', '민', '신', '수', '삿', '룻', '삼상', '삼하', '왕상', '왕하', '대상', '대하', '스', '느', '에', '욥', '시', '잠', '전', '아', '사', '렘', '애', '겔', '단', '호', '욜', '암', '옵', '욘', '미', '나', '합', '습', '학', '슥', '말'];
    var ORDER_NT = ['마', '막', '눅', '요', '행', '롬', '고전', '고후', '갈', '엡', '빌', '골', '살전', '살후', '딤전', '딤후', '딛', '몬', '히', '약', '벧전', '벧후', '요일', '요이', '요삼', '유', '계'];
    function paintCov() {
      var box = ov.querySelector('#brt_cov'); if (!box) return;
      var doneNow = {}; BR.rows.forEach(function (r) { doneNow[r.day_no] = 1; });
      var total = {}, read = {};   // 책별 장 집합 (읽기표가 성경 1189장 전체를 정확히 1회 커버함이 검증돼 있어 total=권별 전체 장수)
      P.days.forEach(function (d) {
        var isDone = doneNow[d.d];
        (d.refs || []).forEach(function (rf) {
          var ab = rf[0];
          var t = total[ab] || (total[ab] = {}), rd = read[ab] || (read[ab] = {});
          for (var c = rf[1]; c <= rf[2]; c++) { t[c] = 1; if (isDone) rd[c] = 1; }
        });
      });
      var totCh = 0, readCh = 0;
      Object.keys(total).forEach(function (ab) { totCh += Object.keys(total[ab]).length; readCh += Object.keys(read[ab] || {}).length; });
      function cells(list) {
        var doneBooks = 0;
        var html = list.map(function (ab) {
          var t = Object.keys(total[ab] || {}).length, r = Object.keys(read[ab] || {}).length;
          if (!t) return '';
          var full = r >= t; if (full) doneBooks++;
          var st = full
            ? 'background:#e7f4ea;border-color:#a9d5b3;color:#1e6b35'
            : (r > 0 ? 'background:#eaf1fb;border-color:#b9cff0;color:#2c4a7c' : 'background:#f6f8fb;border-color:#e4e9f1;color:#a6afbd');
          return '<div style="border:1px solid;border-radius:8px;padding:6px 4px;text-align:center;min-height:44px;display:flex;flex-direction:column;justify-content:center;gap:1px;' + st + '">' +
            '<span style="font-size:.76rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(P.names[ab] || ab) + '</span>' +
            '<span style="font-size:.68rem;font-weight:600">' + (full ? '✓ ' + t + '장' : (r > 0 ? r + '/' + t + '장' : '·')) + '</span></div>';
        }).join('');
        return { html: html, done: doneBooks };
      }
      var ot = cells(ORDER_OT), nt = cells(ORDER_NT);
      var pct = totCh ? Math.round(readCh / totCh * 100) : 0;
      box.innerHTML = '<div style="border:1px solid #e6ebf2;border-radius:10px;background:#fff;padding:12px;margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:7px">' +
        '<b style="color:var(--accent,#032257);font-size:.9rem">📖 성경 전체 진도</b>' +
        '<span style="font-size:.78rem;color:#5b6b7d">' + readCh + ' / ' + totCh + '장 · <b style="color:var(--accent,#032257)">' + pct + '%</b></span></div>' +
        '<div style="background:#eef2f7;border-radius:6px;height:9px;overflow:hidden;margin-bottom:11px"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#3a6db5,#032257)"></div></div>' +
        '<div style="font-size:.74rem;color:#7b8794;font-weight:700;margin-bottom:5px">구약 <span style="color:#1f6feb">' + ot.done + '</span>/39권 완독</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:5px;margin-bottom:11px">' + ot.html + '</div>' +
        '<div style="font-size:.74rem;color:#7b8794;font-weight:700;margin-bottom:5px">신약 <span style="color:#d6455a">' + nt.done + '</span>/27권 완독</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:5px">' + nt.html + '</div>' +
        '</div>';
    }
    paintCov();

    function refreshCnt() {
      var c = ov.querySelector('#brt_cnt'); if (c) c.textContent = BR.rows.length + '/365';
      paintCov();   // 체크가 바뀌면 성경 전체 진도도 함께 갱신
    }
    Array.prototype.forEach.call(ov.querySelectorAll('.br-ck'), function (ck) {
      ck.onchange = function () {
        var d = Number(ck.dataset.d);
        ck.disabled = true;
        var p = ck.checked
          ? brFetch('bible_reading', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ day_no: d }) })
              .then(function () { BR.rows.push({ day_no: d, done_at: new Date().toISOString() }); })
          : brUncheck(d);
        p.then(function () { ck.disabled = false; refreshCnt(); })
          .catch(function (e) { ck.disabled = false; ck.checked = !ck.checked; alert('저장 실패: ' + ((e && e.message) || '오류')); });
      };
    });
    Array.prototype.forEach.call(ov.querySelectorAll('.br-open'), function (b) {
      b.onclick = function () {
        var d = Number(b.dataset.d), day = P.days[d - 1];
        var already = BR.rows.some(function (r) { return r.day_no === d; });
        brReadingModal(day, already ? null : function () {
          brFetch('bible_reading', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ day_no: d }) })
            .then(function () { BR.rows.push({ day_no: d, done_at: new Date().toISOString() }); refreshCnt(); var ck = ov.querySelector('.br-ck[data-d="' + d + '"]'); if (ck) ck.checked = true; })
            .catch(function () { });
        });
      };
    });
  }

  /* ================= 나의 문서 (자료실에서 교회가 보관해 준 본인 자료) ================= */
  function loadMyDocs(me) {
    var el = document.getElementById('myDocs'); if (!el) return;
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, tok = (window.WPF && WPF.token && WPF.token());
    var head = '<div class="form-card" style="padding:16px 18px"><h3 style="margin:0 0 12px;font-size:1rem;color:var(--accent,#032257)">📄 나의 문서</h3>';
    var empty = head + '<p style="color:#9aa5b1;font-size:.9rem;margin:0">아직 등록된 문서가 없습니다.</p></div>';
    if (!url || !ak || !tok) { el.innerHTML = ''; return; }
    // 본인(+배우자) 매칭키로만 조회 — 관리자여도 대시보드에선 남의 문서가 보이면 안 됨
    var keys = [me.memberKey, me.spouseKey].filter(Boolean);
    if (!keys.length) { el.innerHTML = empty; return; }
    var inlist = keys.map(function (k) { return '"' + encodeURIComponent(k) + '"'; }).join(',');
    el.innerHTML = head + '<p class="qt-loading">불러오는 중…</p></div>';
    fetch(url + '/rest/v1/member_files?select=id,category,title,file_url,file_name,doc_date,created_at&member_key=in.(' + inlist + ')&order=created_at.desc', { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); }); return r.json(); })
      .then(function (rows) {
        rows = rows || [];
        if (!rows.length) { el.innerHTML = empty; return; }
        var d = function (f) { return (String(f.doc_date || '').slice(0, 10)) || (String(f.created_at || '').slice(0, 10)); };
        el.innerHTML = head + '<div style="overflow:auto"><table class="fin-table" style="font-size:.88rem"><thead><tr><th>분류</th><th>파일</th><th>일자</th></tr></thead><tbody>' +
          rows.map(function (f) {
            var name = f.file_name || f.title || '문서';
            var cell = f.file_url ? '<a href="' + esc(f.file_url) + '" target="_blank" rel="noopener noreferrer">📎 ' + esc(name) + '</a>' : esc(name);
            return '<tr><td>' + esc(f.category || '') + '</td><td>' + cell + '</td><td style="white-space:nowrap">' + esc(d(f)) + '</td></tr>';
          }).join('') +
          '</tbody></table></div></div>';
      })
      .catch(function (e) {
        var m = (e && e.message) || '';
        el.innerHTML = head + (/42P01|does not exist|schema cache|Could not find/i.test(m) ? '<p style="color:#9aa5b1;font-size:.88rem;margin:0">문서 보관함이 아직 준비되지 않았습니다.</p>' : '<p style="color:#9aa5b1;font-size:.88rem;margin:0">문서를 불러오지 못했습니다.</p>') + '</div>';
      });
  }

  // 이름 옆에 직책(profiles.role)을 붙여 표시
  function loadWelcomeName(me) {
    var el = document.getElementById('dashWelcome'); if (!el) return;
    var uid = sbUser() && sbUser().id;
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, tok = (window.WPF && WPF.token && WPF.token());
    if (!uid || !url || !ak || !tok) return;
    fetch(url + '/rest/v1/profiles?id=eq.' + uid + '&select=name,role', { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var row = rows && rows[0]; if (!row) return;
        var nm = me.memberName || row.name || '';
        var disp = row.role ? (nm + ' ' + row.role) : nm;
        el.textContent = disp + '님, 환영합니다 🙏';
      })
      .catch(function () {});
  }

  /* ================= 이번 주 말씀 / 주보 (main.js 홈 위젯을 대시보드에서 직접 채움) ================= */
  // main.js는 페이지 로드 시 1회만 #homeSermon/#homeBulletin을 채우는데, 대시보드는
  // 로그인 확인 후 비동기로 이 요소들을 나중에 만들기 때문에 그 타이밍을 놓친다.
  // 그래서 같은 BULLETINS 데이터로 대시보드가 직접 채운다.
  function loadHomeSermon() {
    var el = document.getElementById('homeSermon');
    if (!el || typeof BULLETINS === 'undefined' || !BULLETINS.length) return;
    var b = BULLETINS[0];
    el.style.cursor = 'pointer';
    el.title = '클릭해서 설교 요약 보기';
    el.innerHTML =
      '<span class="hs-date">' + b.dateLabel + ' · 주일 낮 예배</span>' +
      '<h3 class="hs-title">' + b.title + '</h3>' +
      '<p class="hs-ref">' + b.scripture + ' · ' + b.preacher + '</p>' +
      '<blockquote class="hs-quote">' + b.quote + '</blockquote>';
    el.onclick = function () { if (typeof openSermonSummary === 'function') openSermonSummary(0); };
  }
  function loadHomeBulletin() {
    var el = document.getElementById('homeBulletin');
    if (!el || typeof BULLETINS === 'undefined' || !BULLETINS.length) return;
    var b = BULLETINS[0];
    var orderItems = (b.order || []).map(function (o) { return '<li>' + o + '</li>'; }).join('');
    var newsItems = (b.news || []).slice(0, 3).map(function (n) { return '<li><strong>' + n.title + '</strong>' + n.detail + '</li>'; }).join('');
    el.innerHTML =
      '<div class="hb-card">' +
      '<div class="hb-hd"><span class="hb-hd-week">' + b.week + ' · 주일 낮 예배</span><span class="hb-hd-date">' + b.dateLabel + '</span></div>' +
      '<div class="hb-body">' +
      '<div class="hb-col"><p class="hb-col-title">예배 순서</p><ol class="hb-order">' + orderItems + '</ol></div>' +
      '<div class="hb-col"><p class="hb-col-title">이 주의 말씀 강해</p><ul class="hb-extra"><li>' + (b.wed || '') + '</li><li>' + (b.dawn || '') + '</li><li>' + (b.qt || '') + '</li></ul>' +
      (newsItems ? '<p class="hb-col-title">한 주의 소식</p><ul class="hb-news">' + newsItems + '</ul>' : '') +
      '</div></div>' +
      '<div class="hb-ft"><a class="btn btn-line" href="word.html#archive">주보 전체 보기 →</a></div>' +
      '</div>';
  }

  /* ================= 오늘의 큐티 (홈 화면과 동일한 카드) + 아멘 체크 ================= */
  function loadTodayQt(me) {
    var el = document.getElementById('dashQt'); if (!el) return;
    el.innerHTML = '<div class="qt-today"><p class="qt-loading">오늘의 말씀을 불러오는 중입니다…</p></div>';
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, t = todayStr();
    // 오늘 QT가 없으면 홈 화면처럼 가장 최근(오늘 이전) QT로 대체
    fetch(url + '/rest/v1/qt_published?select=*&sermon_date=lte.' + t + '&order=sermon_date.desc&limit=1', { headers: { apikey: ak, Authorization: 'Bearer ' + ak } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var q = rows && rows[0];
        if (!q) { el.innerHTML = '<div class="qt-today"><p class="qt-loading">아직 등록된 큐티가 없습니다.</p></div>'; return; }
        var qDate = String(q.sermon_date || t).slice(0, 10);
        var isToday = (qDate === t);
        var dotDate = qDate.replace(/-/g, '.');
        var listenHref = (typeof godpiaUrl === 'function') ? godpiaUrl(q.scripture) : 'https://www.godpia.com/read/reading.asp';
        el.innerHTML =
          '<div class="qt-today">' +
          '<button type="button" class="qt-card-today" id="dashQtOpen">' +
          '<span class="qt-badge">' + (isToday ? '오늘의 QT · ' : '최근 QT · ') + esc(dotDate) + '</span>' +
          (q.title ? '<h3 class="qt-card-title">' + esc(q.title) + '</h3>' : '') +
          (q.scripture ? '<p class="qt-card-ref">' + esc(q.scripture) + '</p>' : '') +
          '<span class="qt-card-more">묵상 전문 읽기 →</span>' +
          '</button>' +
          '<div id="dashQtFull" hidden style="margin-top:18px"></div>' +
          '</div>' +
          '<div class="qt-listen-wrap"><button type="button" class="qt-listen-btn" id="dashTtsBtn" style="border:0;cursor:pointer;font:inherit">🔊 오늘의 말씀 듣기</button></div>';
        var opened = false;
        function renderFullOnce() {
          var full = document.getElementById('dashQtFull'); if (!full || full.dataset.loaded) return;
          full.dataset.loaded = '1';
          full.innerHTML =
            '<div class="form-card qtc-card">' +
            (q.qt_bible_text ? '<div class="qtc-bible">' + bibleVersesHTML(q.qt_bible_text) + '</div>' : '') +
            (q.content ? '<div class="qtc-head">📝 묵상</div><div class="qtc-body">' + toParaHTML(q.content) + '</div>' : '') +
            (q.prayer ? '<div class="qtc-head">🙏 기도</div><div class="qtc-body">' + toParaHTML(q.prayer) + '</div>' : '') +
            '<div id="dashAmenBox" class="qtc-amen"></div>' +
            '</div>';
          loadAmenState(me, qDate);
        }
        function openFull() { var full = document.getElementById('dashQtFull'); if (!full) return; renderFullOnce(); opened = true; full.hidden = false; }
        document.getElementById('dashQtOpen').onclick = function () {
          opened = !opened;
          var full = document.getElementById('dashQtFull');
          full.hidden = !opened;
          if (opened) renderFullOnce();
        };
        // 🔊 오늘의 말씀 듣기 — 누르면 본문(묵상 전문)을 자동으로 펼치고 낭독
        (function () {
          var tb = document.getElementById('dashTtsBtn'); if (!tb) return;
          if (!(window.WPCTts && window.WPCTts.supported)) { tb.style.display = 'none'; return; }
          // 낭독 텍스트는 반드시 WPCQtText(main.js 공용 조립)로 만든다.
          // 조립이 다르면 지문(sig)이 어긋나 교회 서버가 만든 음성 파일(qt-<날짜>-<sig>.wav)을
          // 영영 못 찾고 "만드는 중…" 12분 대기 후 기본 음성으로 빠진다.
          var readText = window.WPCQtText.readTextFromRow(q);
          var preText = [q.title || '', q.scripture || ''].filter(Boolean).join(' ');
          tb.onclick = function () {
            var starting = tb.textContent.indexOf('멈춤') < 0 && tb.textContent.indexOf('준비') < 0;
            if (starting) { openFull(); try { document.getElementById('dashQtFull').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }
            window.WPCTts.toggle(readText, tb, '🔊 오늘의 말씀 듣기', { date: qDate, trackEl: document.getElementById('dashQtFull'), preText: preText });
          };
        })();
      })
      .catch(function () { el.innerHTML = '<p style="color:#c0392b;font-size:.88rem;">큐티를 불러오지 못했습니다.</p>'; });
  }
  function fetchAmenRank(t, ak, tok, url) {
    return fetch(url + '/rest/v1/rpc/qt_check_rank', {
      method: 'POST', headers: { apikey: ak, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_date: t })
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  var AMEN_MSG_FIRST = [
    '오늘 1번째 아멘을 하셨네요! 오늘 하루도 말씀 안에서 승리하세요! 🏆',
    '가장 먼저 아멘하셨어요! 오늘의 첫 열매가 되셨습니다 🌱',
    '1등으로 아멘! 부지런한 새벽이 복되다 하셨죠 ✨',
    '오늘의 첫 아멘의 주인공입니다! 은혜가 넘치는 하루 되세요 🙌'
  ];
  var AMEN_MSG_NEXT = [
    '오늘 {n}번째 아멘을 하셨네요! 축하합니다 🎉',
    '{n}번째로 함께해 주셨네요! 오늘도 은혜 충만하세요 🙏',
    '말씀과 함께한 {n}번째 발걸음이에요! 오늘 하루도 평안하세요 🌿',
    '{n}번째 아멘, 참 귀합니다! 늘 강건하시길 축복합니다 💚',
    '오늘 {n}번째로 큐티를 마치셨네요! 주님과 동행하는 하루 되세요 ✨'
  ];
  function pickAmenMessage(rank) {
    if (!rank) return '오늘의 큐티를 마치고 아멘 하셨습니다';   // ✓는 amenDoneHTML에서 붙임(중복 방지)
    var pool = rank === 1 ? AMEN_MSG_FIRST : AMEN_MSG_NEXT;
    var msg = pool[Math.floor(Math.random() * pool.length)];
    return msg.replace('{n}', rank);
  }
  function amenDoneHTML(rank) {
    return '<span class="qtc-amen-done">✓ ' + esc(pickAmenMessage(rank)) + '</span>';
  }
  function loadAmenState(me, t) {
    var box = document.getElementById('dashAmenBox'); if (!box) return;
    var uid = sbUser() && sbUser().id, tok = WPF.token();
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY;
    if (!uid) { box.innerHTML = ''; return; }
    // 반드시 본인(user_id) 것만 조회 — 관리자는 RLS상 전체 qt_checks를 읽을 수 있어, 필터가 없으면
    // 다른 성도의 아멘이 잡혀 '내가 아멘한 것'처럼 잘못 표시된다.
    fetch(url + '/rest/v1/qt_checks?select=id&user_id=eq.' + uid + '&check_date=eq.' + t, { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        if (rows && rows.length) {
          box.innerHTML = amenDoneHTML(null);
          fetchAmenRank(t, ak, tok, url).then(function (rank) { if (rank) box.innerHTML = amenDoneHTML(rank); });
          return;
        }
        box.innerHTML = '<label><input type="checkbox" id="dashAmenChk"> 🙏 기도문까지 읽고, 오늘의 큐티에 아멘 합니다</label>';
        var chk = document.getElementById('dashAmenChk');
        if (chk) chk.onchange = function () {
          if (!chk.checked) return;
          chk.disabled = true;
          fetch(url + '/rest/v1/qt_checks', {
            method: 'POST', headers: { apikey: ak, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ user_id: uid, check_date: t })
          }).then(function (r) {
            if (!r.ok && r.status !== 409) return r.text().then(function (txt) { throw new Error(txt); });
            box.innerHTML = amenDoneHTML(null);
            fetchAmenRank(t, ak, tok, url).then(function (rank) { if (rank) box.innerHTML = amenDoneHTML(rank); });
          }).catch(function (e) {
            chk.disabled = false; chk.checked = false;
            var msg = (e && e.message) || '';
            if (/does not exist|42P01|schema cache|Could not find the table/i.test(msg)) {
              alert('저장에 실패했습니다 — Supabase에 qt_checks 테이블이 아직 없습니다.\n관리자는 supabase/qt_checks.sql 을 Supabase SQL Editor에서 1회 실행해 주세요.');
            } else {
              alert('저장에 실패했습니다: ' + (msg || '알 수 없는 오류') + '\n다시 시도해 주세요.');
            }
          });
        };
      })
      .catch(function () { box.innerHTML = ''; });
  }

  /* ================= 진행중인 교육 ================= */
  function fmtSize(n) { if (!n && n !== 0) return ''; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
  function eduLabel(r) { return esc(r.title) + (r.cohort ? ' · ' + esc(r.cohort) : '') + (r.class_name ? ' · ' + esc(r.class_name) : ''); }
  function loadMyEdu(me) {
    var el = document.getElementById('myEdu'); if (!el) return;
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, tok = (window.WPF && WPF.token && WPF.token());
    if (!url || !ak || !tok) return;
    var t = todayStr();
    fetch(url + '/rest/v1/edu_records?select=id,title,cohort,class_name,edu_date,end_date,teacher&edu_date=lte.' + t, { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var ongoing = (rows || []).filter(function (r) { return !r.end_date || r.end_date >= t; });
        if (!ongoing.length) { el.innerHTML = ''; return; }
        var box = '<div class="form-card" style="padding:16px 18px;"><h3 style="margin:0 0 10px;font-size:1rem;color:var(--accent,#032257);">📚 진행중인 교육</h3>';
        el.innerHTML = box + ongoing.map(function (r) {
          return '<div class="my-edu-item" data-id="' + esc(r.id) + '" style="border:1px solid #e8edf3;border-radius:10px;padding:10px 12px;margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" class="my-edu-head">' +
            '<b style="font-size:.92rem">' + eduLabel(r) + '</b>' +
            '<span style="font-size:.78rem;color:#9aa5b1">' + esc(r.teacher || '') + ' ▾</span></div>' +
            '<div class="my-edu-body" hidden style="margin-top:8px;font-size:.83rem"></div></div>';
        }).join('') + '</div>';
        Array.prototype.forEach.call(el.querySelectorAll('.my-edu-item'), function (box2) {
          var head = box2.querySelector('.my-edu-head'), bodyEl = box2.querySelector('.my-edu-body');
          var loaded = false;
          head.onclick = function () {
            bodyEl.hidden = !bodyEl.hidden;
            if (!bodyEl.hidden && !loaded) { loaded = true; loadMyEduMaterials(box2.dataset.id, bodyEl, tok, url, ak); }
          };
        });
      })
      .catch(function () { el.innerHTML = ''; });
  }
  function loadMyEduMaterials(eduId, bodyEl, tok, url, ak) {
    bodyEl.innerHTML = '<p class="qt-loading">자료 불러오는 중…</p>';
    fetch(url + '/rest/v1/edu_materials?edu_id=eq.' + eduId + '&select=*&order=created_at.desc', { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        rows = rows || [];
        if (!rows.length) { bodyEl.innerHTML = '<p style="color:#9aa5b1">등록된 자료가 없습니다.</p>'; return; }
        bodyEl.innerHTML = rows.map(function (r) {
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid #f0f3f7">' +
            '<span>📎 ' + esc(r.title) + (r.size ? ' <span style="color:#9aa5b1;font-size:.76rem">· ' + fmtSize(r.size) + '</span>' : '') + '</span>' +
            '<a href="#" class="my-mat-dl" data-path="' + esc(r.path) + '" data-title="' + esc(r.title) + '" style="color:var(--accent,#032257)">다운로드</a></div>';
        }).join('');
        Array.prototype.forEach.call(bodyEl.querySelectorAll('.my-mat-dl'), function (a) {
          a.onclick = function (e) {
            e.preventDefault(); var old = a.textContent; a.textContent = '준비 중…';
            fetch(url + '/storage/v1/object/sign/edu_materials/' + a.dataset.path.split('/').map(encodeURIComponent).join('/'), {
              method: 'POST', headers: { apikey: ak, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 })
            }).then(function (r) { return r.json(); }).then(function (d) {
              a.textContent = old;
              if (!d || !d.signedURL) { alert('다운로드 오류: ' + (d && d.message || '알 수 없는 오류')); return; }
              window.open(url + '/storage/v1' + d.signedURL + '&download=' + encodeURIComponent(a.dataset.title || ''), '_blank');
            }).catch(function (err) { a.textContent = old; alert('다운로드 오류: ' + err.message); });
          };
        });
      })
      .catch(function () { bodyEl.innerHTML = '<p style="color:#9aa5b1">자료를 불러오지 못했습니다.</p>'; });
  }

  /* ================= 헌금 ================= */
  function offeringsFromSupabase(me) {
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, tok = (window.WPF && WPF.token && WPF.token());
    var keys = [me.memberKey, me.spouseKey].filter(Boolean);
    if (!url || !ak || !tok || !keys.length) return Promise.reject(new Error('no-supabase'));
    var inlist = keys.map(function (k) { return '"' + encodeURIComponent(k) + '"'; }).join(',');
    var q = url + '/rest/v1/offerings?select=offer_date,category,service,giver,member_key,amount&member_key=in.(' + inlist + ')&order=offer_date.desc&limit=5000';
    return fetch(q, { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); }); return r.json(); });
  }
  function spouseBanner(name) {
    return name ? '<p style="background:#e8f6ee;border:1px solid #bfe3cd;color:#1e874b;padding:8px 12px;border-radius:8px;font-size:.85rem;margin-bottom:14px;">💑 배우자 <b>' + esc(name) + '</b>님과 <b>가정 헌금</b>이 합산되어 표시됩니다.</p>' : '';
  }
  function loadOfferings(me) {
    var el = document.getElementById('offeringList');
    offeringsFromSupabase(me).then(function (rows) {
      var note = spouseBanner(me.spouse);
      var list = (rows || []).map(function (o) {
        return { date: o.offer_date, account: o.category || '', service: o.service || '', amount: o.amount, giver: o.giver || '',
                 who: (me.spouseKey && String(o.member_key) === String(me.spouseKey)) ? 'spouse' : 'self' };
      });
      if (!list.length) { el.innerHTML = note + '<p style="color:var(--ink-soft);font-size:.9rem;">조회된 헌금 내역이 없습니다.</p>'; return; }
      var r = { spouse: me.spouse || '', total: list.reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0) };
      renderWithFilter(el, list, r, me, note);
    }).catch(function () {
      WPF.call('myOfferings').then(function (r) {
        var note = spouseBanner(r.spouse);
        var list = r.offerings || [];
        if (!list.length) { el.innerHTML = note + '<p style="color:var(--ink-soft);font-size:.9rem;">조회된 헌금 내역이 없습니다.</p>'; return; }
        renderWithFilter(el, list, r, me, note);
      }).catch(function (e) {
        if (el) el.innerHTML = '<p style="color:var(--accent-soft);font-size:.9rem;">헌금 조회 실패: ' + esc(e.message) + '</p>';
      });
    });
  }
  function fmtDate(d) { return String(d == null ? '' : d).slice(0, 10); }
  function anyService(list) { return list.some(function (o) { return o.service; }); }
  function statCard(label, val, color) {
    return '<div style="flex:1;min-width:104px;background:#fff;border:1px solid #e8edf3;border-radius:12px;padding:13px 15px;"><div style="color:#7b8794;font-size:.76rem;margin-bottom:5px;">' + label + '</div><div style="font-size:1.2rem;font-weight:700;color:' + color + ';">' + val + '</div></div>';
  }
  function whoOf(o, selfName, spouseName) {
    if (o.giver) {
      if (spouseName && o.giver === spouseName) return 'spouse';
      if (selfName && o.giver === selfName) return 'self';
    }
    if (o.who === 'self' || o.who === 'spouse') return o.who;
    return 'self';
  }
  function renderWithFilter(el, list, r, me, spouseNote) {
    var selfName = me.memberName || '본인';
    var spouseName = r.spouse || '';
    var hasSelf = list.some(function (o) { return whoOf(o, selfName, spouseName) === 'self'; });
    var hasSpouse = !!spouseName && list.some(function (o) { return whoOf(o, selfName, spouseName) === 'spouse'; });
    if (!hasSpouse || !hasSelf) { renderOfferingView(el, list, r, me, spouseNote); return; }
    el.innerHTML =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
      '  <button type="button" class="btn fm-who" data-w="all">합산</button>' +
      '  <button type="button" class="btn fm-who" data-w="self">' + esc(selfName) + '</button>' +
      '  <button type="button" class="btn fm-who" data-w="spouse">' + esc(spouseName) + '</button>' +
      '</div><div id="fmInner"></div>';
    var inner = el.querySelector('#fmInner');
    var tabs = el.querySelectorAll('.fm-who');
    function setActive(b) {
      Array.prototype.forEach.call(tabs, function (x) { x.style.background = '#fff'; x.style.color = 'var(--accent,#032257)'; x.style.border = '1px solid #cdd7e3'; });
      b.style.background = 'var(--accent,#032257)'; b.style.color = '#fff'; b.style.border = '1px solid var(--accent,#032257)';
    }
    function show(w, btn) {
      setActive(btn);
      var filtered = w === 'all' ? list : list.filter(function (o) { return whoOf(o, selfName, spouseName) === w; });
      var note = w === 'all' ? spouseNote : '';
      var rr = { spouse: r.spouse, total: w === 'all' ? r.total : undefined };
      renderOfferingView(inner, filtered, rr, me, note);
    }
    Array.prototype.forEach.call(tabs, function (b) { b.onclick = function () { show(b.dataset.w, b); }; });
    show('all', tabs[0]);
  }
  function renderOfferingView(el, list, r, me, spouseNote) {
    var PAL = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7', '#eab308', '#f43f5e', '#0ea5e9'];
    var byAcc = {};
    list.forEach(function (o) { var a = o.account || '기타'; if (!byAcc[a]) byAcc[a] = { name: a, total: 0, count: 0 }; byAcc[a].total += Number(o.amount) || 0; byAcc[a].count++; });
    var accs = Object.keys(byAcc).map(function (k) { return byAcc[k]; }).sort(function (a, b) { return b.total - a.total; });
    accs.forEach(function (a, i) { a.color = PAL[i % PAL.length]; });
    var total = r.total || list.reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0);
    var ds = list.map(function (o) { return fmtDate(o.date); }).filter(Boolean).sort();
    var period = ds.length ? ds[0] + ' ~ ' + ds[ds.length - 1] : '';
    var hasGiver = list.some(function (o) { return o.giver && o.giver !== (me.memberName || ''); });
    var R = 54, C = 2 * Math.PI * R, off = 0;
    var segs = accs.map(function (a) {
      var len = (a.total / (total || 1)) * C;
      var s = '<circle r="' + R + '" cx="75" cy="75" fill="none" stroke="' + a.color + '" stroke-width="22" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 75 75)"></circle>';
      off += len; return s;
    }).join('');
    var donut = '<svg viewBox="0 0 150 150" width="150" height="150" style="flex:0 0 auto;">' + segs +
      '<text x="75" y="70" text-anchor="middle" font-size="10" fill="#7b8794">총 헌금</text>' +
      '<text x="75" y="89" text-anchor="middle" font-size="12" font-weight="700" fill="#032257">' + won(total) + '</text></svg>';
    var legend = '<div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:6px;">' +
      accs.map(function (a) { return '<div style="display:flex;align-items:center;gap:8px;font-size:.85rem;"><span style="width:11px;height:11px;border-radius:3px;background:' + a.color + ';flex:0 0 auto;"></span><span style="flex:1;">' + esc(a.name) + '</span><b style="font-variant-numeric:tabular-nums;">' + won(a.total) + '</b><span style="color:#9aa5b1;width:40px;text-align:right;">' + (total ? (a.total / total * 100).toFixed(0) : 0) + '%</span></div>'; }).join('') +
      '</div>';
    var maxAcc = accs.length ? accs[0].total : 1;
    var byTab = '<table style="width:100%;border-collapse:collapse;font-size:.88rem;">' +
      accs.map(function (a) {
        var bar = (a.total / (maxAcc || 1) * 100).toFixed(1);
        return '<tr><td style="padding:7px 8px 7px 0;white-space:nowrap;"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + a.color + ';margin-right:6px;"></span>' + esc(a.name) + '</td>' +
          '<td style="width:44%;padding:7px 0;"><div style="background:#eef2f7;border-radius:5px;height:9px;overflow:hidden;"><div style="width:' + bar + '%;height:100%;background:' + a.color + ';"></div></div></td>' +
          '<td style="text-align:right;padding:7px 0 7px 8px;font-variant-numeric:tabular-nums;"><b>' + won(a.total) + '</b> <span style="color:#9aa5b1;">' + a.count + '건</span></td></tr>';
      }).join('') + '</table>';
    var sorted = list.slice().sort(function (a, b) { return String(fmtDate(b.date)).localeCompare(String(fmtDate(a.date))); });
    var sv = anyService(list);
    var allTab = '<div style="overflow:auto;max-height:460px;"><table class="board-table" style="width:100%;border-collapse:collapse;font-size:.88rem;">' +
      '<thead><tr style="position:sticky;top:0;background:#f5f8fc;"><th style="text-align:left;padding:8px;">일자</th>' + (hasGiver ? '<th style="text-align:left;padding:8px;">헌금자</th>' : '') + '<th style="text-align:left;padding:8px;">항목</th>' + (sv ? '<th style="text-align:left;padding:8px;">예배</th>' : '') + '<th style="text-align:right;padding:8px;">금액</th></tr></thead><tbody>' +
      sorted.map(function (o) { return '<tr><td style="padding:6px 8px;">' + esc(fmtDate(o.date)) + '</td>' + (hasGiver ? '<td style="padding:6px 8px;">' + esc(o.giver || '') + '</td>' : '') + '<td style="padding:6px 8px;">' + esc(o.account || '') + '</td>' + (sv ? '<td style="padding:6px 8px;">' + esc(o.service || '') + '</td>' : '') + '<td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;">' + won(o.amount) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr style="font-weight:700;background:#f5f8fc;"><td colspan="' + (1 + (hasGiver ? 1 : 0) + (sv ? 1 : 0)) + '" style="padding:8px;text-align:right;">합계</td><td style="padding:8px;text-align:right;">' + won(total) + '</td></tr></tfoot></table></div>';
    el.innerHTML = spouseNote +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">' +
        statCard('총 헌금액', won(total) + '원', '#032257') +
        statCard('헌금 건수', list.length + '건', '#1e874b') +
        statCard('헌금 항목', accs.length + '개', '#3b82f6') +
      '</div>' +
      '<div class="form-card" style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;justify-content:center;margin-bottom:14px;padding:18px;">' + donut + legend + '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
        '<button type="button" class="btn os-tab" data-o="acc">항목별</button>' +
        '<button type="button" class="btn os-tab" data-o="all">전체 내역</button>' +
      '</div>' +
      '<div id="osPanel"></div>' +
      '<p style="color:var(--ink-soft);font-size:.8rem;margin-top:10px;">🔒 본인(부부)에게만 표시됩니다.' + (period ? ' · 기간 ' + esc(period) : '') + '</p>';
    var panel = el.querySelector('#osPanel');
    var tabs2 = el.querySelectorAll('.os-tab');
    function setActive2(b) {
      Array.prototype.forEach.call(tabs2, function (x) { x.style.background = '#fff'; x.style.color = 'var(--accent,#032257)'; x.style.border = '1px solid #cdd7e3'; });
      b.style.background = 'var(--accent,#032257)'; b.style.color = '#fff'; b.style.border = '1px solid var(--accent,#032257)';
    }
    function show2(which, btn) { setActive2(btn); panel.innerHTML = which === 'all' ? allTab : '<div class="form-card" style="padding:16px;">' + byTab + '</div>'; }
    Array.prototype.forEach.call(tabs2, function (b) { b.onclick = function () { show2(b.dataset.o, b); }; });
    show2('acc', tabs2[0]);
  }

  /* ================= 가계도 ================= */
  // 가족 명단(my_family)은 가계도와 주일학교 안내가 같이 쓰므로 한 번만 불러 재사용한다.
  var FAM_CACHE = null;
  function famMembers() {
    if (FAM_CACHE) return FAM_CACHE;
    if (!(window.WPF && WPF.call)) return Promise.reject(new Error('no-wpf'));
    FAM_CACHE = WPF.call('myFamily').then(function (r) { return (r && r.members) || []; });
    return FAM_CACHE;
  }
  // 생년월일: 매칭키(이름|YYYYMMDD)에서 정확히 추출, 없으면 birth 앞 10자. 없으면 ''.
  function famBirth(m) { var bd = (String(m.member_key || '').split('|')[1]) || ''; if (bd.length === 8) return bd.slice(0, 4) + '-' + bd.slice(4, 6) + '-' + bd.slice(6, 8); return String(m.birth || '').slice(0, 10); }
  // 만 나이. 생년월일이 없으면 null(= 나이를 모름).
  function famAge(m) {
    var b = famBirth(m); if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
    var d = new Date(b + 'T00:00:00'); if (isNaN(d)) return null;
    var n = new Date(), a = n.getFullYear() - d.getFullYear();
    if ((n.getMonth() - d.getMonth() || n.getDate() - d.getDate()) < 0) a--;
    return a;
  }
  function famHeadOf(m) { return m.head || m.name; }
  function loadFamily(me) {
    var el = document.getElementById('familyTree'); if (!el) return;
    if (!(window.WPF && WPF.call)) return;
    famMembers().then(function (ms) {
      if (!ms.length) { el.innerHTML = ''; return; }
      el.innerHTML = renderFamilyTree(ms, me);
    }).catch(function () { el.innerHTML = ''; });
  }
  function renderFamilyTree(ms, me) {
    var myKeys = [me.memberKey, me.spouseKey].filter(Boolean).map(String);
    var bday = famBirth;
    function headOf(m) { return famHeadOf(m); }
    var heads = {}, order = [];
    ms.forEach(function (m) { var h = headOf(m); if (!heads[h]) { heads[h] = []; order.push(h); } heads[h].push(m); });
    var myHead = (function () { for (var i = 0; i < ms.length; i++) if (myKeys.indexOf(String(ms[i].member_key)) >= 0) return headOf(ms[i]); return order[0]; })();
    order.sort(function (a, b) { return (b === myHead ? 0 : 1) - (a === myHead ? 0 : 1) || a.localeCompare(b, 'ko'); });
    function isMine(m) { return myKeys.indexOf(String(m.member_key)) >= 0; }
    function person(m, kind) {
      var mine = isMine(m);
      var icon = kind === 'head' ? '⌂ ' : (kind === 'spouse' ? '💑 ' : '');
      return '<span style="display:inline-flex;align-items:center;gap:5px">' + icon +
        '<b style="' + (mine ? 'color:#1e874b' : (kind === 'head' ? 'color:var(--accent,#032257)' : '')) + '">' + esc(m.name) + '</b>' +
        (mine ? '<span style="font-size:.7rem;background:#e8f6ee;color:#1e874b;border-radius:999px;padding:1px 7px">나</span>' : '') +
        '<span style="font-size:.74rem;color:#7b8794">' + esc(kind === 'head' ? '세대주' : (m.relation || (kind === 'spouse' ? '배우자' : ''))) + (bday(m) ? ' · ' + esc(bday(m)) : '') + '</span></span>';
    }
    function household(h) {
      var fam = heads[h];
      var head = null, spouse = null;
      for (var i = 0; i < fam.length; i++) if (fam[i].name === h) { head = fam[i]; break; }
      for (var j = 0; j < fam.length; j++) { var f = fam[j]; if (f !== head && (f.relation === '배우자' || (head && f.member_key && f.member_key === head.spouse_key))) { spouse = f; break; } }
      var others = fam.filter(function (m) { return m !== head && m !== spouse; }).sort(function (a, b) { return bday(a).localeCompare(bday(b)); });
      var origin = head && head.origin_head ? head.origin_head : '';
      var isMy = (h === myHead);
      return '<div style="border:1px solid ' + (isMy ? '#bfe3cd' : '#e8edf3') + ';border-radius:12px;padding:12px 14px;margin-bottom:10px;background:' + (isMy ? '#f4fbf6' : '#fff') + '">' +
        (origin ? '<div style="font-size:.76rem;color:#9aa5b1;margin-bottom:5px">↑ ' + esc(origin) + '님 가정에서 분가</div>' : '') +
        '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' + (head ? person(head, 'head') : '') + (spouse ? '<span style="color:#cdd5e1">—</span>' + person(spouse, 'spouse') : '') + '</div>' +
        others.map(function (m) { return '<div style="padding:4px 0 4px 18px;color:#cbd5e1">└ ' + person(m, 'child') + '</div>'; }).join('') +
        '</div>';
    }
    return '<div class="form-card" style="padding:16px 18px;"><h3 style="margin:0 0 4px;color:var(--accent,#032257);font-size:1rem">👪 우리 가족 가계도</h3>' +
      '<p style="color:var(--ink-soft);font-size:.82rem;margin:0 0 12px">교적에 등록된 우리 가족 관계입니다. (변경은 교회 사무실·관리자에게 문의)</p>' +
      order.map(household).join('') + '</div>';
  }

  /* ================= QT 진행표 (성경 66권 커버리지) ================= */
  var BIBLE_OT = ['창세기', '출애굽기', '레위기', '민수기', '신명기', '여호수아', '사사기', '룻기', '사무엘상', '사무엘하', '열왕기상', '열왕기하', '역대상', '역대하', '에스라', '느헤미야', '에스더', '욥기', '시편', '잠언', '전도서', '아가', '이사야', '예레미야', '예레미야애가', '에스겔', '다니엘', '호세아', '요엘', '아모스', '오바댜', '요나', '미가', '나훔', '하박국', '스바냐', '학개', '스가랴', '말라기'];
  var BIBLE_NT = ['마태복음', '마가복음', '누가복음', '요한복음', '사도행전', '로마서', '고린도전서', '고린도후서', '갈라디아서', '에베소서', '빌립보서', '골로새서', '데살로니가전서', '데살로니가후서', '디모데전서', '디모데후서', '디도서', '빌레몬서', '히브리서', '야고보서', '베드로전서', '베드로후서', '요한일서', '요한이서', '요한삼서', '유다서', '요한계시록'];
  var BOOK_ALIAS = (function () {
    var m = {};
    BIBLE_OT.concat(BIBLE_NT).forEach(function (n) { m[n] = n; });
    var ab = { 창: '창세기', 출: '출애굽기', 레: '레위기', 민: '민수기', 신: '신명기', 수: '여호수아', 삿: '사사기', 룻: '룻기', 삼상: '사무엘상', 삼하: '사무엘하', 왕상: '열왕기상', 왕하: '열왕기하', 대상: '역대상', 대하: '역대하', 스: '에스라', 느: '느헤미야', 에: '에스더', 욥: '욥기', 시: '시편', 잠: '잠언', 전: '전도서', 아: '아가', 사: '이사야', 렘: '예레미야', 애: '예레미야애가', 겔: '에스겔', 단: '다니엘', 호: '호세아', 욜: '요엘', 암: '아모스', 옵: '오바댜', 욘: '요나', 미: '미가', 나: '나훔', 합: '하박국', 습: '스바냐', 학: '학개', 슥: '스가랴', 말: '말라기', 마: '마태복음', 막: '마가복음', 눅: '누가복음', 요: '요한복음', 행: '사도행전', 롬: '로마서', 고전: '고린도전서', 고후: '고린도후서', 갈: '갈라디아서', 엡: '에베소서', 빌: '빌립보서', 골: '골로새서', 살전: '데살로니가전서', 살후: '데살로니가후서', 딤전: '디모데전서', 딤후: '디모데후서', 딛: '디도서', 몬: '빌레몬서', 히: '히브리서', 약: '야고보서', 벧전: '베드로전서', 벧후: '베드로후서', 요일: '요한일서', 요이: '요한이서', 요삼: '요한삼서', 유: '유다서', 계: '요한계시록' };
    Object.keys(ab).forEach(function (k) { m[k] = ab[k]; });
    return m;
  })();
  function bookOf(scripture) {
    var s = String(scripture == null ? '' : scripture).trim();
    var m = s.match(/^([가-힣]+)/);
    if (!m) return null;
    var tok = m[1];
    if (BOOK_ALIAS[tok]) return BOOK_ALIAS[tok];
    for (var len = tok.length; len >= 1; len--) {
      var pre = tok.slice(0, len);
      if (BOOK_ALIAS[pre]) return BOOK_ALIAS[pre];
    }
    return null;
  }
  function loadQtProgress(me) {
    var el = document.getElementById('qtProgress'); if (!el) return;
    el.innerHTML = '<div class="form-card" style="padding:16px 18px;"><h3 style="margin:0 0 4px;font-size:1rem;color:var(--accent,#032257);">📊 QT 진행표</h3><p style="color:var(--ink-soft);font-size:.82rem;margin:0 0 12px;">아멘한 큐티의 말씀 본문이 성경 66권 중 어디를 지나왔는지 보여줍니다. 표시된 책을 누르면 그때 읽은 큐티를 다시 볼 수 있습니다.</p><div id="qtProgGrid"><p class="qt-loading">불러오는 중…</p></div><div id="qtProgDetail"></div></div>';
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, tok = (window.WPF && WPF.token && WPF.token());
    var uid = sbUser() && sbUser().id;
    if (!uid || !tok) { el.querySelector('#qtProgGrid').innerHTML = ''; return; }
    fetch(url + '/rest/v1/qt_checks?select=check_date&order=check_date.asc', { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (checks) {
        var dates = (checks || []).map(function (c) { return c.check_date; }).filter(Boolean);
        if (!dates.length) { drawGrid({}, {}); return; }
        var inlist = dates.map(function (d) { return '"' + d + '"'; }).join(',');
        return fetch(url + '/rest/v1/qt_published?select=sermon_date,title,scripture,qt_bible_text,content,prayer&sermon_date=in.(' + inlist + ')&order=sermon_date.desc', { headers: { apikey: ak, Authorization: 'Bearer ' + ak } })
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (rows) {
            // 같은 날짜에 중복 게시된 큐티가 있으면 하루=1건으로 합침(내용이 더 채워진 레코드 우선)
            var seen = {}, uniq = [];
            function score(r) { return (r.content ? 1 : 0) + (r.qt_bible_text ? 1 : 0) + (r.prayer ? 1 : 0); }
            (rows || []).forEach(function (r) {
              var k = r.sermon_date;
              if (!(k in seen)) { seen[k] = uniq.length; uniq.push(r); }
              else if (score(r) > score(uniq[seen[k]])) uniq[seen[k]] = r;
            });
            var covered = {}, byBook = {};
            uniq.forEach(function (r) {
              var bk = bookOf(r.scripture); if (!bk) return;
              covered[bk] = (covered[bk] || 0) + 1;
              (byBook[bk] = byBook[bk] || []).push(r);
            });
            drawGrid(covered, byBook);
          });
      })
      .catch(function () { drawGrid({}, {}); });
    function grpHTML(list, covered) {
      return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px;">' +
        list.map(function (b) {
          var n = covered[b] || 0;
          var on = n > 0;
          return '<div class="qtc-bookcell' + (on ? ' on' : '') + '" data-book="' + esc(b) + '" title="' + esc(b) + (on ? ' · ' + n + '회 · 눌러서 보기' : '') + '" style="padding:7px 4px;text-align:center;border-radius:6px;font-size:.74rem;font-weight:700;background:' + (on ? '#0d9488' : '#eef2f7') + ';color:' + (on ? '#fff' : '#9aa5b1') + ';word-break:keep-all;line-height:1.3;' + (on ? 'cursor:pointer;' : '') + '">' + esc(b) + (on ? '<div style="font-size:.64rem;font-weight:400;opacity:.85;">' + n + '회</div>' : '') + '</div>';
        }).join('') + '</div>';
    }
    function entryHTML(r, i) {
      return '<div class="qtc-bookentry" data-i="' + i + '" style="border:1px solid #e8edf3;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<b style="font-size:.9rem;">' + esc(r.title || '') + '</b>' +
        '<span style="font-size:.76rem;color:#9aa5b1;">' + esc(r.sermon_date) + ' ▾</span></div>' +
        (r.scripture ? '<div style="font-size:.8rem;color:var(--accent,#032257);margin-top:2px;">' + esc(r.scripture) + '</div>' : '') +
        '<div class="qtc-bookentry-body" hidden style="margin-top:10px;"></div></div>';
    }
    function drawGrid(covered, byBook) {
      var grid = el.querySelector('#qtProgGrid'); if (!grid) return;
      var detail = el.querySelector('#qtProgDetail');
      var totalCovered = BIBLE_OT.concat(BIBLE_NT).filter(function (b) { return covered[b]; }).length;
      grid.innerHTML =
        '<p style="font-size:.85rem;color:#3a4a63;margin:0 0 10px;font-weight:600;">' + totalCovered + ' / 66권 커버</p>' +
        '<div style="margin-bottom:6px;font-size:.76rem;color:#9aa5b1;font-weight:700;">구약</div>' + grpHTML(BIBLE_OT, covered) +
        '<div style="margin:14px 0 6px;font-size:.76rem;color:#9aa5b1;font-weight:700;">신약</div>' + grpHTML(BIBLE_NT, covered);
      Array.prototype.forEach.call(grid.querySelectorAll('.qtc-bookcell.on'), function (cell) {
        cell.onclick = function () { showBookQt(cell.dataset.book, byBook[cell.dataset.book] || [], detail); };
      });
    }
    function showBookQt(book, rows, detail) {
      if (!detail) return;
      detail.innerHTML = '<div style="border-top:1px solid #eef1f5;margin-top:16px;padding-top:14px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
        '<b style="font-size:.92rem;color:var(--accent,#032257);">' + esc(book) + ' — 읽은 큐티 ' + rows.length + '건</b>' +
        '<button type="button" id="qtProgDetailClose" class="btn btn-line" style="padding:3px 12px;font-size:.78rem;white-space:nowrap;">✕ 닫기</button></div>' +
        '<div style="margin-top:10px;">' + rows.map(entryHTML).join('') + '</div></div>';
      var closeBtn = detail.querySelector('#qtProgDetailClose');
      if (closeBtn) closeBtn.onclick = function () { detail.innerHTML = ''; };
      Array.prototype.forEach.call(detail.querySelectorAll('.qtc-bookentry'), function (card) {
        var r = rows[Number(card.dataset.i)];
        var body = card.querySelector('.qtc-bookentry-body');
        var loaded = false;
        card.onclick = function () {
          body.hidden = !body.hidden;
          if (!body.hidden && !loaded) {
            loaded = true;
            body.innerHTML =
              (r.qt_bible_text ? '<div class="qtc-bible">' + bibleVersesHTML(r.qt_bible_text) + '</div>' : '') +
              (r.content ? '<div class="qtc-head">📝 묵상</div><div class="qtc-body">' + toParaHTML(r.content) + '</div>' : '') +
              (r.prayer ? '<div class="qtc-head">🙏 기도</div><div class="qtc-body">' + toParaHTML(r.prayer) + '</div>' : '');
          }
        };
      });
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  /* ================= 주일학교 — 교사 현황·달란트 / 어린이 내 달란트 =================
   * 권한은 supabase/sunday_school.sql 의 RLS·RPC가 결정:
   *  · 교사/부장/서기(+관리자) → 현황판·어린이 달란트 관리, 부장/서기만 현황판 편집
   *  · 어린이 → 자기 달란트 조회만
   * SQL 미실행 등으로 RPC가 없으면 섹션 자체를 조용히 숨긴다. */
  // 학생으로 취급하는 주일학교 직분 — supabase ss_student_roles() 와 값·순서를 맞춘다.
  var SS_LEVELS = ['어린이', '중학생', '고등학생'];
  // isStudent 는 20260817_2345_ss_school_levels.sql 이후에 내려온다. 아직 안 돌렸으면 role 로 판단.
  function isSsStudent(ctx) { return !!(ctx && (ctx.isStudent || SS_LEVELS.indexOf(ctx.role) >= 0)); }
  function ssLevelOrder(r) { var i = SS_LEVELS.indexOf(r || '어린이'); return i < 0 ? 99 : i; }

  function loadSundaySchool(me) {
    var el = document.getElementById('ssDash'); if (!el) return;
    brFetch('rpc/ss_context', { method: 'POST', body: '{}' }).then(function (ctx) {
      ctx = ctx || {};
      if (ctx.isTeacher) renderSsTeacher(el, ctx, me);
      else if (isSsStudent(ctx)) {
        el.innerHTML = '<div id="ssMyTalents" style="margin-bottom:22px;"></div><div id="ssMyCerts"></div>';
        loadMyTalents(el.querySelector('#ssMyTalents'), ctx, me);
        loadMyCerts(el.querySelector('#ssMyCerts'), me.memberKey, me.memberName || '', function () { loadMyTalents(el.querySelector('#ssMyTalents'), ctx, me); });
      }
      else {
        // 보호자: 같은 세대(가계도)에 '어린이'가 있으면 자녀 현황 화면
        brFetch('rpc/ss_my_children', { method: 'POST', body: '{}' }).then(function (kids) {
          kids = kids || [];
          if (kids.length) { renderSsGuardian(el, ctx, me, kids); return; }
          // 자녀가 0명 — 교적상 자녀는 있는데 주일학교와 연결이 안 됐을 수 있으므로,
          // 그냥 숨기지 말고 무엇이 빠졌는지 안내한다(2026-08-26).
          el.innerHTML = '<div id="ssTalBox"></div><div id="ssKidHint"></div>';
          loadMyTalents(el.querySelector('#ssTalBox'), ctx, me);
          ssGuardianHint(el.querySelector('#ssKidHint'), me);
        }).catch(function () { loadMyTalents(el, ctx, me); });
      }
    }).catch(function () { el.innerHTML = ''; });
  }

  /* ── 보호자 안내: 교적에 자녀가 있는데 ss_my_children() 이 0명일 때 ──
   * 자녀가 '우리 아이 주일학교'에 뜨려면 교적(gyojeok)이 세 가지를 모두 갖춰야 한다.
   *   ① 세대주가 나와 같을 것            ② 주일학교 = 어린이·중학생·고등학생
   *   ③ 매칭키(이름|생년월일)가 비어 있지 않을 것
   * ①은 가계도에 자녀가 보이는 것으로 이미 확인되므로, 남은 ②·③을 짚어 준다.
   * (my_family 는 주일학교 칸을 돌려주지 않으므로 ②는 단정하지 않고 함께 안내) */
  var SS_CHILD_REL = /^(장남|차남|삼남|사남|아들|장녀|차녀|삼녀|사녀|딸|자녀|손자|손녀)$/;
  function ssGuardianHint(el, me) {
    if (!el) return;
    famMembers().then(function (ms) {
      var myKeys = [me.memberKey, me.spouseKey].filter(Boolean).map(String);
      var myHead = '';
      for (var i = 0; i < ms.length; i++) if (myKeys.indexOf(String(ms[i].member_key)) >= 0) { myHead = famHeadOf(ms[i]); break; }
      if (!myHead) { el.innerHTML = ''; return; }
      // 같은 세대의 자녀 중 미성년(또는 생년월일 미등록으로 나이를 모르는) 경우만 안내한다.
      var kids = ms.filter(function (m) {
        if (famHeadOf(m) !== myHead) return false;
        if (myKeys.indexOf(String(m.member_key)) >= 0) return false;
        if (!SS_CHILD_REL.test(String(m.relation || '').trim())) return false;
        var a = famAge(m);
        return a === null || a < 20;
      });
      if (!kids.length) { el.innerHTML = ''; return; }
      var noKey = kids.filter(function (m) { return !String(m.member_key || '').trim(); });
      var names = kids.map(function (m) { return esc(m.name); }).join('·');
      el.innerHTML =
        '<div class="form-card" style="padding:16px 18px;">' +
        '<h3 style="margin:0 0 6px;font-size:1rem;color:var(--accent,#032257);">👨‍👧 우리 아이 주일학교</h3>' +
        '<p style="color:var(--ink-soft);font-size:.84rem;margin:0 0 8px;line-height:1.75;">' +
        '<b>' + names + '</b> 자녀가 아직 <b>주일학교와 연결되지 않았습니다</b>. 연결되면 이곳에서 자녀의 달란트·QT/필사·미션 인증·헌금을 보고, 인증샷을 대신 올릴 수 있어요.</p>' +
        '<p style="font-size:.82rem;color:#7b8794;margin:0 0 10px;line-height:1.75;">교적에 자녀의 <b>' +
        (noKey.length ? '생년월일' : '주일학교 학년(어린이·중학생·고등학생)') + '</b>이 없어서 그렇습니다. <b>내 정보</b>에서 직접 입력하실 수 있어요.</p>' +
        '<a class="btn btn-line" href="admin.html" style="padding:7px 15px;font-size:.85rem;">내 정보에서 자녀 교적 정보 입력 →</a>' +
        '<p style="font-size:.76rem;color:#9aa5b1;margin:10px 0 0;">※ 세대주와 그 배우자만 수정할 수 있습니다. 이름·가족관계 변경은 교회 사무실에 문의해 주세요.</p>' +
        '</div>';
    }).catch(function () { el.innerHTML = ''; });
  }

  /* ── 어린이(달란트 받은 계정): 나의 달란트 ── */
  function loadMyTalents(el, ctx, me) {
    if (!me.memberKey) { el.innerHTML = ''; return; }
    brFetch('ss_talents?select=id,amount,reason,talent_date,created_by&member_key=eq.' + encodeURIComponent(me.memberKey) + '&order=talent_date.desc,id.desc&limit=500')
      .then(function (rows) {
        rows = rows || [];
        if (!rows.length && !isSsStudent(ctx)) { el.innerHTML = ''; return; }
        var total = rows.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
        el.innerHTML =
          '<div class="form-card" style="padding:16px 18px;">' +
          '<h3 style="margin:0 0 4px;font-size:1rem;color:var(--accent,#032257);">⭐ 나의 달란트</h3>' +
          '<p style="color:var(--ink-soft);font-size:.82rem;margin:0 0 12px;">주일학교 선생님께 받은 달란트 현황입니다.</p>' +
          '<div style="text-align:center;background:#fffbe8;border:1px solid #f2e2ae;border-radius:12px;padding:16px;margin-bottom:12px;">' +
          '<div style="font-size:.8rem;color:#8a6d1f;">지금까지 모은 달란트</div>' +
          '<div style="font-size:1.9rem;font-weight:800;color:#b7791f;">' + won(total) + ' <span style="font-size:1rem;">달란트</span></div></div>' +
          (rows.length ?
            '<div style="overflow:auto;max-height:320px;"><table class="board-table" style="width:100%;border-collapse:collapse;font-size:.86rem;">' +
            '<thead><tr style="background:#f5f8fc;"><th style="text-align:left;padding:7px 8px;">날짜</th><th style="text-align:left;padding:7px 8px;">내용</th><th style="text-align:right;padding:7px 8px;">달란트</th></tr></thead><tbody>' +
            rows.map(function (r) {
              var a = Number(r.amount) || 0;
              return '<tr><td style="padding:6px 8px;white-space:nowrap;">' + esc(r.talent_date) + '</td><td style="padding:6px 8px;">' + esc(r.reason || '') + '</td>' +
                '<td style="padding:6px 8px;text-align:right;font-weight:700;color:' + (a < 0 ? '#c0392b' : '#1e874b') + ';">' + (a > 0 ? '+' : '') + won(a) + '</td></tr>';
            }).join('') + '</tbody></table></div>' :
            '<p style="color:#9aa5b1;font-size:.86rem;">아직 받은 달란트가 없어요. 첫 달란트를 기대해요! 🌱</p>');
      }).catch(function () { el.innerHTML = ''; });
  }

  /* ── 교사단: 주일학교 현황 + 어린이 달란트 관리 ── */
  function renderSsTeacher(el, ctx, me) {
    var roleLabel = ctx.role || '관리자';
    el.innerHTML =
      '<div class="form-card" style="padding:16px 18px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
      '<h3 style="margin:0;font-size:1rem;color:var(--accent,#032257);">🏫 주일학교 현황</h3>' +
      '<span style="font-size:.78rem;background:#e8f0fb;color:#2b5797;border-radius:999px;padding:3px 11px;">내 직분: ' + esc(roleLabel) + '</span></div>' +
      '<div id="ssStats" style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;"></div>' +
      '<div id="ssMissionBox" style="margin-bottom:14px;"></div>' +
      '<div id="ssBoardBox" style="margin-bottom:14px;"></div>' +
      '<div id="ssCertsBox" style="margin-bottom:14px;"></div>' +
      '<div id="ssStudentsBox"></div>' +
      '<p class="fin-msg" id="ssMsg" style="margin-top:8px;"></p></div>' +
      '<div id="ssGuardianBox" style="margin-top:22px;"></div>';
    loadSsMission(el, ctx, me);
    loadSsBoard(el, ctx, me);
    loadSsCerts(el, ctx, me);
    loadSsStudents(el, ctx, me);
    // 새 인증 푸시를 받을 수 있게 이 기기를 '교사 기기'로 태그 (apps-script/ss-cert-push.gs가 이 태그로 발송)
    if (window.ONESIGNAL_APP_ID) {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function (OneSignal) {
        try { await OneSignal.User.addTag('ss_teacher', '1'); } catch (e) {}
      });
    }
    // 교사·관리자가 보호자(같은 세대에 어린이)이기도 하면 '우리 아이' 섹션을 아래에 표시
    brFetch('rpc/ss_my_children', { method: 'POST', body: '{}' }).then(function (kids) {
      kids = kids || [];
      if (kids.length) renderSsGuardian(el.querySelector('#ssGuardianBox'), ctx, me, kids);
    }).catch(function () {});
  }
  function ssFlash(el, ok, txt) { var m = el.querySelector('#ssMsg'); if (m) { m.style.color = ok ? 'green' : '#c0392b'; m.textContent = txt; } }

  /* ── 이번주 미션 — 교사단이 한 주에 하나 설정, 어린이가 인증하면 달란트 자동 지급 ──
   * 데이터: ss_missions (supabase/20260823_1500_ss_weekly_mission.sql)
   * SQL 미실행 등으로 테이블이 없으면 박스를 조용히 숨긴다(다른 SS 섹션과 동일). */
  function ssWeekStartStr() {
    var d = new Date(todayStr() + 'T00:00:00');
    d.setDate(d.getDate() - d.getDay());          // 이번 주 일요일
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function loadSsMission(el, ctx, me) {
    var box = el.querySelector('#ssMissionBox'); if (!box) return;
    var ws = ssWeekStartStr();
    brFetch('ss_missions?select=*&week_start=eq.' + ws).then(function (rows) {
      var m = (rows || [])[0] || null;
      var editing = !m;                            // 아직 없으면 바로 입력 폼
      var opened = !!m;                            // 폼은 '미션 정하기'를 눌러야 펼침
      function head(btnHtml) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
          '<b style="font-size:.9rem;color:var(--accent,#032257);">🎯 이번주 미션</b>' + (btnHtml || '') + '</div>';
      }
      function draw() {
        if (m && !editing) {
          box.innerHTML = head('<button type="button" class="btn btn-line" id="ssMsEdit" style="padding:3px 12px;font-size:.78rem;">수정</button>') +
            '<div style="border:1px solid #f2e2ae;background:#fffbe8;border-radius:10px;padding:10px 12px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">' +
            '<b style="font-size:.88rem;color:#8a6d1f;">' + esc(m.title) + '</b>' +
            '<span style="font-size:.76rem;background:#fff;border:1px solid #f2e2ae;border-radius:999px;padding:2px 10px;color:#b7791f;font-weight:700;">달란트 ' + (Number(m.amount) || 1) + '개</span></div>' +
            (m.description ? '<div style="font-size:.82rem;color:#6b5b26;margin-top:5px;line-height:1.6;">' + esc(m.description).replace(/\n/g, '<br>') + '</div>' : '') +
            '<div style="font-size:.72rem;color:#9aa5b1;margin-top:5px;">' + esc(ws) + ' 주간 · ' + esc(m.created_by || '') + ' · 어린이가 주중 언제든 한 번 인증하면 자동 지급</div></div>';
          box.querySelector('#ssMsEdit').onclick = function () { editing = true; draw(); };
          return;
        }
        if (!opened) {
          box.innerHTML = head('<button type="button" class="btn btn-line" id="ssMsAdd" style="padding:3px 12px;font-size:.78rem;">＋ 미션 정하기</button>') +
            '<p style="color:#9aa5b1;font-size:.84rem;margin:4px 0 0;">이번 주 미션이 아직 없습니다. 한 주에 하나, 어린이들이 주중에 수행할 미션을 정해 주세요.</p>';
          box.querySelector('#ssMsAdd').onclick = function () { opened = true; draw(); };
          return;
        }
        box.innerHTML = head() +
          '<div style="border:1px solid #e8edf3;border-radius:10px;padding:12px;">' +
          '<div class="af-field" style="margin-bottom:8px;"><label style="font-size:.78rem;color:#7b8794;">미션 이름</label>' +
          '<input type="text" id="ssMsTitle" maxlength="60" placeholder="예: 부모님 안마해 드리기" value="' + esc(m ? m.title : '') + '" style="width:100%;padding:8px 10px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;"></div>' +
          '<div class="af-field" style="margin-bottom:8px;"><label style="font-size:.78rem;color:#7b8794;">설명(선택)</label>' +
          '<textarea id="ssMsDesc" maxlength="300" placeholder="어떻게 하면 되는지, 인증샷은 무엇을 찍으면 되는지" style="width:100%;min-height:56px;padding:8px 10px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;">' + esc(m ? (m.description || '') : '') + '</textarea></div>' +
          '<div class="af-field" style="margin-bottom:10px;"><label style="font-size:.78rem;color:#7b8794;">달성 시 달란트</label>' +
          '<input type="number" id="ssMsAmt" min="1" max="100" value="' + esc(m ? m.amount : 3) + '" style="width:110px;padding:8px 10px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;"></div>' +
          '<div style="display:flex;gap:8px;">' +
          '<button type="button" class="btn btn-solid" id="ssMsSave" style="padding:6px 16px;">저장</button>' +
          '<button type="button" class="btn btn-line" id="ssMsCancel" style="padding:6px 16px;">취소</button></div></div>';
        box.querySelector('#ssMsCancel').onclick = function () { editing = !!m ? false : true; opened = !!m; draw(); };
        box.querySelector('#ssMsSave').onclick = function () {
          var title = box.querySelector('#ssMsTitle').value.trim();
          var desc = box.querySelector('#ssMsDesc').value.trim();
          var amt = Math.max(1, Number(box.querySelector('#ssMsAmt').value) || 1);
          if (!title) { ssFlash(el, false, '미션 이름을 입력해 주세요.'); return; }
          var req = m
            ? brFetch('ss_missions?id=eq.' + m.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ title: title, description: desc, amount: amt }) })
            : brFetch('ss_missions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ week_start: ws, title: title, description: desc, amount: amt, created_by: me.memberName || '관리자' }) });
          req.then(function () { ssFlash(el, true, '✓ 이번주 미션이 저장되었습니다.'); loadSsMission(el, ctx, me); })
            .catch(function (e) { ssFlash(el, false, '미션 저장 실패: ' + e.message); });
        };
      }
      draw();
    }).catch(function () { box.innerHTML = ''; });
  }

  /* 현황판(공지) — 조회는 교사단, 편집은 부장·서기(+관리자) */
  function loadSsBoard(el, ctx, me) {
    var box = el.querySelector('#ssBoardBox'); if (!box) return;
    brFetch('ss_board?select=*&order=sort.asc,id.asc').then(function (rows) {
      rows = rows || [];
      var canEdit = !!ctx.isEditor;
      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
        '<b style="font-size:.9rem;color:var(--accent,#032257);">📌 현황판</b>' +
        (canEdit ? '<button type="button" class="btn btn-line" id="ssBoardAdd" style="padding:3px 12px;font-size:.78rem;">＋ 항목 추가</button>' : '') + '</div>' +
        (rows.length ? rows.map(function (r) {
          return '<div style="border:1px solid #e8edf3;border-radius:10px;padding:10px 12px;margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
            '<b style="font-size:.88rem;">' + esc(r.title) + '</b>' +
            (canEdit ? '<span style="white-space:nowrap;"><button type="button" class="btn btn-line ss-bd-edit" data-id="' + r.id + '" style="padding:2px 9px;font-size:.74rem;">수정</button> <button type="button" class="btn btn-line ss-bd-del" data-id="' + r.id + '" style="padding:2px 9px;font-size:.74rem;color:#c0392b;">삭제</button></span>' : '') + '</div>' +
            (r.content ? '<div style="font-size:.84rem;color:#3a4a63;margin-top:5px;line-height:1.7;">' + esc(r.content).replace(/\n/g, '<br>') + '</div>' : '') +
            (r.updated_by ? '<div style="font-size:.72rem;color:#9aa5b1;margin-top:5px;">' + esc(r.updated_by) + ' · ' + esc(String(r.updated_at || '').slice(0, 10)) + '</div>' : '') +
            '</div>';
        }).join('') : '<p style="color:#9aa5b1;font-size:.84rem;margin:4px 0 0;">' + (canEdit ? '아직 항목이 없습니다. ‘＋ 항목 추가’로 공지·현황을 올려 주세요.' : '아직 등록된 현황이 없습니다. (편집은 부장·서기)') + '</p>');
      if (!canEdit) return;
      var addBtn = box.querySelector('#ssBoardAdd');
      if (addBtn) addBtn.onclick = function () { ssBoardForm(el, ctx, me, null); };
      Array.prototype.forEach.call(box.querySelectorAll('.ss-bd-edit'), function (b) {
        var r = rows.filter(function (x) { return String(x.id) === b.dataset.id; })[0];
        b.onclick = function () { ssBoardForm(el, ctx, me, r); };
      });
      Array.prototype.forEach.call(box.querySelectorAll('.ss-bd-del'), function (b) {
        var r = rows.filter(function (x) { return String(x.id) === b.dataset.id; })[0];
        b.onclick = function () {
          if (!confirm('「' + (r ? r.title : '') + '」 항목을 삭제할까요?')) return;
          brFetch('ss_board?id=eq.' + b.dataset.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
            .then(function () { loadSsBoard(el, ctx, me); })
            .catch(function (e) { ssFlash(el, false, '삭제 실패: ' + e.message); });
        };
      });
    }).catch(function () { box.innerHTML = ''; });
  }
  function ssBoardForm(el, ctx, me, row) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:40px 16px;overflow:auto;';
    ov.innerHTML = '<div class="form-card" style="max-width:480px;width:100%;background:#fff;margin:auto;padding:18px;">' +
      '<h3 style="margin:0 0 10px;color:var(--accent,#032257);font-size:1rem;">' + (row ? '현황판 수정' : '현황판 항목 추가') + '</h3>' +
      '<label style="display:block;font-size:.8rem;color:#7b8794;margin-bottom:4px;">제목</label>' +
      '<input type="text" id="ssbTitle" value="' + esc(row ? row.title : '') + '" placeholder="예: 8월 둘째 주 공과 안내" style="width:100%;padding:9px 11px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;margin-bottom:10px;box-sizing:border-box;">' +
      '<label style="display:block;font-size:.8rem;color:#7b8794;margin-bottom:4px;">내용</label>' +
      '<textarea id="ssbContent" rows="5" style="width:100%;padding:9px 11px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;box-sizing:border-box;">' + esc(row ? (row.content || '') : '') + '</textarea>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;"><button type="button" class="btn btn-line" id="ssbCancel">취소</button><button type="button" class="btn btn-solid" id="ssbSave">저장</button></div>' +
      '<p class="fin-msg" id="ssbMsg"></p></div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('#ssbCancel').onclick = close;
    ov.querySelector('#ssbSave').onclick = function () {
      var title = ov.querySelector('#ssbTitle').value.trim();
      var content = ov.querySelector('#ssbContent').value.trim();
      var msg = ov.querySelector('#ssbMsg');
      if (!title) { msg.style.color = '#c0392b'; msg.textContent = '제목을 입력해 주세요.'; return; }
      msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
      var body = { title: title, content: content, updated_by: me.memberName || '', updated_at: new Date().toISOString() };
      var req = row
        ? brFetch('ss_board?id=eq.' + row.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) })
        : brFetch('ss_board', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      req.then(function () { close(); loadSsBoard(el, ctx, me); })
        .catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = '저장 실패: ' + e.message; });
    };
  }

  /* 어린이 명단 + 달란트 관리(교사단) */
  function loadSsStudents(el, ctx, me) {
    var stats = el.querySelector('#ssStats'), box = el.querySelector('#ssStudentsBox');
    if (!box) return;
    box.innerHTML = '<p class="qt-loading">불러오는 중…</p>';
    brFetch('rpc/ss_students', { method: 'POST', body: '{}' }).then(function (students) {
      students = students || [];
      var totalT = students.reduce(function (s, r) { return s + (Number(r.total) || 0); }, 0);
      // 학년별 인원(어린이·중학생·고등학생) — 교적의 '주일학교' 항목에서 온다.
      var byLevel = SS_LEVELS.map(function (lv) {
        return { lv: lv, n: students.filter(function (s) { return (s.ss_role || '어린이') === lv; }).length };
      }).filter(function (x) { return x.n; });
      if (stats) stats.innerHTML =
        statCard('학생', students.length + '명', '#032257') +
        statCard('교사진', (ctx.teacherCount || 0) + '명', '#1e874b') +
        statCard('달란트 총계', won(totalT), '#b7791f');
      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">' +
        '<b style="font-size:.9rem;color:var(--accent,#032257);">⭐ 학생 달란트 관리' +
        (byLevel.length ? ' <span style="font-weight:400;font-size:.78rem;color:#7b8794;">' + byLevel.map(function (x) { return esc(x.lv) + ' ' + x.n; }).join(' · ') + '</span>' : '') + '</b>' +
        '<span style="display:flex;gap:6px;">' +
        '<button type="button" class="btn btn-line" id="ssItemsBtn" style="padding:3px 11px;font-size:.76rem;">🏷 항목 관리</button>' +
        (students.length ? '<button type="button" class="btn btn-solid" id="ssBulkBtn" style="padding:3px 11px;font-size:.76rem;">⚡ 일괄 지급</button>' : '') +
        '</span></div>' +
        (students.length ?
          '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
          '<button type="button" class="btn ss-view-tab" data-v="table" style="padding:3px 14px;font-size:.76rem;">표</button>' +
          '<button type="button" class="btn ss-view-tab" data-v="chart" style="padding:3px 14px;font-size:.76rem;">📊 그래프</button>' +
          '</div><div id="ssStudentsView"></div>' :
          '<p style="color:#9aa5b1;font-size:.84rem;">교적에서 <b>주일학교</b>가 <b>어린이·중학생·고등학생</b>으로 지정된 교인이 아직 없습니다.<br>교적관리 → 교적 명단에서 학생의 이름을 클릭 → <b>수정</b> → ‘주일학교’ 항목을 지정해 주세요.</p>');
      var itemsBtn = box.querySelector('#ssItemsBtn');
      if (itemsBtn) itemsBtn.onclick = function () { ssItemManager(); };
      var bulkBtn = box.querySelector('#ssBulkBtn');
      if (bulkBtn) bulkBtn.onclick = function () { ssBulkModal(el, ctx, me, students); };
      var view = box.querySelector('#ssStudentsView');
      if (!view) return;
      // 정렬 상태(머리글 클릭): 이름 가나다 / 생년월일 / 달란트
      var sortKey = 'name', sortDir = 1, curList = students.slice(), activeBtn = null;
      function sortedStudents() {
        var arr = students.slice();
        arr.sort(function (a, b) {
          var r = 0;
          if (sortKey === 'total') r = (Number(a.total) || 0) - (Number(b.total) || 0);
          else if (sortKey === 'birth') r = String(a.birth || '9999-99-99').localeCompare(String(b.birth || '9999-99-99'));
          else if (sortKey === 'level') r = ssLevelOrder(a.ss_role) - ssLevelOrder(b.ss_role) || String(a.name).localeCompare(String(b.name), 'ko');
          else r = String(a.name).localeCompare(String(b.name), 'ko');
          return r * sortDir;
        });
        return arr;
      }
      function tableHTML() {
        curList = sortedStudents();
        function th(k, label, align) {
          var mark = sortKey === k ? (sortDir > 0 ? ' ▲' : ' ▼') : ' <span style="color:#c3ccd6;">↕</span>';
          return '<th class="ss-st-sort" data-s="' + k + '" style="text-align:' + (align || 'left') + ';padding:7px 8px;cursor:pointer;white-space:nowrap;" title="클릭하여 정렬">' + label + mark + '</th>';
        }
        return '<div style="overflow:auto;max-height:420px;"><table class="board-table" style="width:100%;border-collapse:collapse;font-size:.86rem;">' +
          '<thead><tr style="background:#f5f8fc;">' + th('name', '이름') + th('level', '학년') + th('birth', '생년월일') + th('total', '달란트', 'right') + '<th style="padding:7px 8px;"></th></tr></thead><tbody>' +
          curList.map(function (s, i) {
            var lv = s.ss_role || '어린이';
            return '<tr><td style="padding:6px 8px;"><a href="#" class="ss-st-name" data-i="' + i + '" title="기록 보기" style="color:var(--accent,#032257);font-weight:700;text-decoration:none;border-bottom:1px dashed #9ab;">' + esc(s.name) + '</a></td>' +
              '<td style="padding:6px 8px;"><span style="font-size:.76rem;background:#fff3d6;color:#8a6d1f;border-radius:999px;padding:2px 9px;white-space:nowrap;">' + esc(lv) + '</span></td>' +
              '<td style="padding:6px 8px;color:#7b8794;">' + esc(String(s.birth || '').slice(0, 10)) + '</td>' +
              '<td style="padding:6px 8px;text-align:right;font-weight:700;color:#b7791f;">' + won(s.total) + '</td>' +
              '<td style="padding:6px 8px;text-align:right;white-space:nowrap;"><button type="button" class="btn btn-line ss-st-open" data-i="' + i + '" style="padding:3px 11px;font-size:.76rem;">내역·지급</button></td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<p style="color:#9aa5b1;font-size:.76rem;margin:6px 0 0;">이름을 클릭하면 출석률·QT·필사 등 기록을 볼 수 있습니다.</p>';
      }
      function chartHTML() {
        var sorted = students.slice().sort(function (a, b) { return (Number(b.total) || 0) - (Number(a.total) || 0); });
        var max = 1;
        sorted.forEach(function (s) { var t = Number(s.total) || 0; if (t > max) max = t; });
        return '<div style="border:1px solid #e8edf3;border-radius:10px;padding:12px 14px;"><table style="width:100%;border-collapse:collapse;font-size:.86rem;">' +
          sorted.map(function (s) {
            var t = Number(s.total) || 0;
            var w = (Math.max(0, t) / max * 100).toFixed(1);
            return '<tr><td style="padding:6px 8px 6px 0;white-space:nowrap;">' + esc(s.name) + '</td>' +
              '<td style="width:55%;padding:6px 0;"><div style="background:#f5f1e6;border-radius:5px;height:14px;overflow:hidden;"><div style="width:' + w + '%;height:100%;background:linear-gradient(90deg,#e2b95e,#b7791f);"></div></div></td>' +
              '<td style="text-align:right;padding:6px 0 6px 8px;font-variant-numeric:tabular-nums;"><b style="color:' + (t < 0 ? '#c0392b' : '#b7791f') + ';">' + won(t) + '</b></td></tr>';
          }).join('') + '</table></div>';
      }
      var tabs = box.querySelectorAll('.ss-view-tab');
      function show(which, btn) {
        activeBtn = btn;
        Array.prototype.forEach.call(tabs, function (x) { x.style.background = '#fff'; x.style.color = 'var(--accent,#032257)'; x.style.border = '1px solid #cdd7e3'; });
        btn.style.background = 'var(--accent,#032257)'; btn.style.color = '#fff'; btn.style.border = '1px solid var(--accent,#032257)';
        view.innerHTML = which === 'chart' ? chartHTML() : tableHTML();
        Array.prototype.forEach.call(view.querySelectorAll('.ss-st-open'), function (b) {
          b.onclick = function () { ssTalentModal(el, ctx, me, curList[Number(b.dataset.i)]); };
        });
        Array.prototype.forEach.call(view.querySelectorAll('.ss-st-name'), function (a) {
          a.onclick = function (e) { e.preventDefault(); ssChildDetail(el, ctx, me, curList[Number(a.dataset.i)]); };
        });
        Array.prototype.forEach.call(view.querySelectorAll('.ss-st-sort'), function (h) {
          h.onclick = function () {
            var k = h.dataset.s;
            if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
            show('table', activeBtn || tabs[0]);
          };
        });
      }
      Array.prototype.forEach.call(tabs, function (b) { b.onclick = function () { show(b.dataset.v, b); }; });
      if (tabs.length) show('table', tabs[0]);
    }).catch(function (e) { box.innerHTML = '<p style="color:#9aa5b1;font-size:.84rem;">학생 명단을 불러오지 못했습니다: ' + esc(e.message) + '</p>'; });
  }
  function ssTalentModal(el, ctx, me, student) {
    if (!student) return;
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:30px 16px;overflow:auto;';
    ov.innerHTML = '<div class="form-card" id="sstBox" style="max-width:520px;width:100%;background:#fff;margin:auto;padding:18px;"></div>';
    document.body.appendChild(ov);
    var box = ov.querySelector('#sstBox');
    var editing = null;   // 수정 중인 항목(null이면 새로 지급)
    function close() { ov.remove(); loadSsStudents(el, ctx, me); }   // 닫을 때 합계 새로고침
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    function draw() {
      box.innerHTML = '<p class="qt-loading">불러오는 중…</p>';
      brFetch('ss_talents?select=*&member_key=eq.' + encodeURIComponent(student.member_key) + '&order=talent_date.desc,id.desc&limit=1000')
        .then(function (rows) {
          rows = rows || [];
          var total = rows.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
          box.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<h3 style="margin:0;color:var(--accent,#032257);font-size:1.02rem;">⭐ ' + esc(student.name) + ' — ' + won(total) + ' 달란트</h3>' +
            '<button type="button" class="btn btn-line" id="sstClose" style="padding:4px 12px;">닫기</button></div>' +
            '<div style="background:#fafbfd;border:1px solid #e8edf3;border-radius:10px;padding:12px;margin-bottom:12px;">' +
            '<b style="font-size:.84rem;color:var(--accent,#032257);">' + (editing ? '✏️ 항목 수정' : '＋ 달란트 지급/차감') + '</b>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:end;">' +
            '<div style="flex:0 0 122px;"><label style="display:block;font-size:.74rem;color:#7b8794;margin-bottom:3px;">날짜</label><input type="date" id="sstDate" value="' + esc(editing ? editing.talent_date : todayStr()) + '" style="width:100%;padding:7px 8px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;box-sizing:border-box;"></div>' +
            '<div style="flex:0 0 92px;"><label style="display:block;font-size:.74rem;color:#7b8794;margin-bottom:3px;">달란트(±)</label><input type="number" id="sstAmount" value="' + (editing ? (Number(editing.amount) || 0) : '') + '" placeholder="예: 5" style="width:100%;padding:7px 8px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;box-sizing:border-box;"></div>' +
            '<div id="sstReasonWrap" style="flex:1;min-width:130px;"><label style="display:block;font-size:.74rem;color:#7b8794;margin-bottom:3px;">내용</label><input type="text" id="sstReason" value="' + esc(editing ? (editing.reason || '') : '') + '" placeholder="클릭하여 항목 선택" autocomplete="off" style="width:100%;padding:7px 8px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;box-sizing:border-box;"></div>' +
            '<span style="white-space:nowrap;"><button type="button" class="btn btn-solid" id="sstSave" style="padding:7px 14px;">' + (editing ? '수정 저장' : '지급') + '</button>' + (editing ? ' <button type="button" class="btn btn-line" id="sstEditCancel" style="padding:7px 10px;">취소</button>' : '') + '</span></div>' +
            '<p style="font-size:.72rem;color:#9aa5b1;margin:6px 0 0;">차감은 음수로 입력하세요(예: -3).</p>' +
            '<p class="fin-msg" id="sstMsg"></p></div>' +
            (rows.length ?
              '<div style="overflow:auto;max-height:340px;"><table class="board-table" style="width:100%;border-collapse:collapse;font-size:.84rem;">' +
              '<thead><tr style="background:#f5f8fc;"><th style="text-align:left;padding:6px 8px;">날짜</th><th style="text-align:left;padding:6px 8px;">내용</th><th style="text-align:right;padding:6px 8px;">달란트</th><th style="padding:6px 8px;"></th></tr></thead><tbody>' +
              rows.map(function (r) {
                var a = Number(r.amount) || 0;
                return '<tr><td style="padding:5px 8px;white-space:nowrap;">' + esc(r.talent_date) + '</td><td style="padding:5px 8px;">' + esc(r.reason || '') + (r.created_by ? ' <span style="color:#c3ccd6;font-size:.72rem;">· ' + esc(r.created_by) + '</span>' : '') + '</td>' +
                  '<td style="padding:5px 8px;text-align:right;font-weight:700;color:' + (a < 0 ? '#c0392b' : '#1e874b') + ';">' + (a > 0 ? '+' : '') + won(a) + '</td>' +
                  '<td style="padding:5px 8px;text-align:right;white-space:nowrap;"><button type="button" class="btn btn-line sst-edit" data-id="' + r.id + '" style="padding:2px 8px;font-size:.72rem;">수정</button> <button type="button" class="btn btn-line sst-del" data-id="' + r.id + '" style="padding:2px 8px;font-size:.72rem;color:#c0392b;">삭제</button></td></tr>';
              }).join('') + '</tbody></table></div>' :
              '<p style="color:#9aa5b1;font-size:.84rem;">아직 지급한 달란트가 없습니다.</p>');
          box.querySelector('#sstClose').onclick = close;
          attachItemPicker(box.querySelector('#sstReasonWrap'), box.querySelector('#sstReason'), box.querySelector('#sstAmount'));
          var msg = box.querySelector('#sstMsg');
          function fail(t) { msg.style.color = '#c0392b'; msg.textContent = t; }
          box.querySelector('#sstSave').onclick = function () {
            var d = box.querySelector('#sstDate').value;
            var amt = Number(box.querySelector('#sstAmount').value);
            var rsn = box.querySelector('#sstReason').value.trim();
            if (!d) { fail('날짜를 선택해 주세요.'); return; }
            if (!amt) { fail('달란트를 숫자로 입력해 주세요(차감은 음수).'); return; }
            msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
            var req = editing
              ? brFetch('ss_talents?id=eq.' + editing.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ amount: amt, reason: rsn, talent_date: d }) })
              : brFetch('ss_talents', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ member_key: student.member_key, child_name: student.name, amount: amt, reason: rsn, talent_date: d, created_by: me.memberName || '' }) });
            req.then(function () { editing = null; draw(); }).catch(function (e) { fail('저장 실패: ' + e.message); });
          };
          var ec = box.querySelector('#sstEditCancel');
          if (ec) ec.onclick = function () { editing = null; draw(); };
          Array.prototype.forEach.call(box.querySelectorAll('.sst-edit'), function (b) {
            b.onclick = function () { editing = rows.filter(function (x) { return String(x.id) === b.dataset.id; })[0] || null; draw(); };
          });
          Array.prototype.forEach.call(box.querySelectorAll('.sst-del'), function (b) {
            b.onclick = function () {
              if (!confirm('이 달란트 항목을 삭제할까요?')) return;
              brFetch('ss_talents?id=eq.' + b.dataset.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
                .then(function () { draw(); }).catch(function (e) { fail('삭제 실패: ' + e.message); });
            };
          });
        }).catch(function (e) {
          box.innerHTML = '<p style="color:#c0392b;">불러오기 실패: ' + esc(e.message) + '</p><button type="button" class="btn btn-line" id="sstClose">닫기</button>';
          var c = box.querySelector('#sstClose'); if (c) c.onclick = close;
        });
    }
    draw();
  }

  /* ── 어린이 기록 카드: 출석률(%)·QT·필사·항목별 집계 (이름 클릭 시) ── */
  function ssWeekSunday(dstr) {
    var d = new Date(String(dstr).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() - d.getDay());   // 그 주의 주일(일요일)
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function ssChildDetail(el, ctx, me, s) {
    if (!s) return;
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:30px 16px;overflow:auto;';
    ov.innerHTML = '<div class="form-card" id="scdBox" style="max-width:560px;width:100%;background:#fff;margin:auto;padding:18px;"><p class="qt-loading">불러오는 중…</p></div>';
    document.body.appendChild(ov);
    var box = ov.querySelector('#scdBox');
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    Promise.all([
      brFetch('ss_talents?select=id,amount,reason,talent_date,created_by&member_key=eq.' + encodeURIComponent(s.member_key) + '&order=talent_date.desc,id.desc&limit=1000'),
      brFetch('ss_submissions?select=id,stype,sub_date,confirmed_by,liked_by&member_key=eq.' + encodeURIComponent(s.member_key) + '&order=sub_date.desc,id.desc&limit=500')
    ]).then(function (res) {
      var tal = res[0] || [], certs = res[1] || [];
      var total = tal.reduce(function (x, r) { return x + (Number(r.amount) || 0); }, 0);
      // 출석률: 최근 1년(52주, 이번 주 포함) 중 '출석' 기록이 있는 주의 비율
      var attWeeks = {};
      tal.forEach(function (r) { if (String(r.reason || '').indexOf('출석') >= 0) { var w = ssWeekSunday(r.talent_date); if (w) attWeeks[w] = 1; } });
      var WEEKS = 52, now = new Date(); now.setDate(now.getDate() - now.getDay());
      var dots = [], attCnt = 0;
      for (var i = WEEKS - 1; i >= 0; i--) {
        var d = new Date(now.getTime()); d.setDate(d.getDate() - 7 * i);
        var key = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
        var on = !!attWeeks[key]; if (on) attCnt++;
        dots.push('<span title="' + key + (on ? ' 출석' : ' 기록 없음') + '" style="width:11px;height:11px;border-radius:50%;display:inline-block;background:' + (on ? '#1e874b' : '#e8edf3') + ';"></span>');
      }
      var pct = Math.round(attCnt / WEEKS * 100);
      // QT·필사 집계
      var ym = monthKey(todayStr());
      function certStat(t) {
        var all = certs.filter(function (r) { return r.stype === t; });
        return { all: all.length, month: all.filter(function (r) { return monthKey(r.sub_date) === ym; }).length };
      }
      var qt = certStat('QT'), pil = certStat('필사');
      // 항목별 집계(달란트 사유 기준)
      var byReason = {};
      tal.forEach(function (r) { var k = r.reason || '(내용 없음)'; if (!byReason[k]) byReason[k] = { cnt: 0, sum: 0 }; byReason[k].cnt++; byReason[k].sum += Number(r.amount) || 0; });
      var reasons = Object.keys(byReason).sort(function (a, b) { return byReason[b].cnt - byReason[a].cnt; });
      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<h3 style="margin:0;color:var(--accent,#032257);font-size:1.05rem;">' + esc(s.name) + ' <span style="font-size:.8rem;color:#7b8794;font-weight:400;">' + esc(String(s.birth || '').slice(0, 10)) + '</span></h3>' +
        '<button type="button" class="btn btn-line" id="scdClose" style="padding:4px 12px;">닫기</button></div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' +
        statCard('출석률(최근 1년)', pct + '%', pct >= 75 ? '#1e874b' : (pct >= 50 ? '#b7791f' : '#c0392b')) +
        statCard('달란트', won(total), '#b7791f') +
        statCard('QT', qt.all + '회', '#2b5797') +
        statCard('필사', pil.all + '회', '#1e874b') +
        '</div>' +
        '<div style="background:#fafbfd;border:1px solid #e8edf3;border-radius:10px;padding:12px;margin-bottom:12px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">' +
        '<b style="font-size:.84rem;color:var(--accent,#032257);">🗓 최근 1년 출석 (52주)</b>' +
        '<span style="font-size:.78rem;color:#7b8794;">' + attCnt + '/' + WEEKS + '주 · 이번 달 QT ' + qt.month + '회 · 필사 ' + pil.month + '회</span></div>' +
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;">' + dots.join('') + '</div>' +
        '<p style="font-size:.72rem;color:#9aa5b1;margin:6px 0 0;">달란트 지급 항목에 ‘출석’이 포함된 기록을 기준으로 계산합니다(왼쪽이 과거).</p></div>' +
        (reasons.length ?
          '<b style="font-size:.84rem;color:var(--accent,#032257);display:block;margin-bottom:6px;">📋 항목별 기록</b>' +
          '<div style="overflow:auto;max-height:220px;margin-bottom:12px;"><table class="board-table" style="width:100%;border-collapse:collapse;font-size:.84rem;">' +
          '<thead><tr style="background:#f5f8fc;"><th style="text-align:left;padding:6px 8px;">항목</th><th style="text-align:right;padding:6px 8px;">횟수</th><th style="text-align:right;padding:6px 8px;">달란트 합계</th></tr></thead><tbody>' +
          reasons.map(function (k) {
            var g = byReason[k];
            return '<tr><td style="padding:5px 8px;">' + esc(k) + '</td><td style="padding:5px 8px;text-align:right;">' + g.cnt + '회</td><td style="padding:5px 8px;text-align:right;font-weight:700;color:' + (g.sum < 0 ? '#c0392b' : '#1e874b') + ';">' + (g.sum > 0 ? '+' : '') + won(g.sum) + '</td></tr>';
          }).join('') + '</tbody></table></div>' :
          '<p style="color:#9aa5b1;font-size:.84rem;margin-bottom:12px;">아직 기록이 없습니다.</p>') +
        (certs.length ?
          '<b style="font-size:.84rem;color:var(--accent,#032257);display:block;margin-bottom:6px;">📖 최근 인증</b>' +
          '<div style="overflow:auto;max-height:180px;margin-bottom:12px;">' +
          certs.slice(0, 10).map(function (r) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 2px;border-bottom:1px dashed #eef1f5;font-size:.82rem;">' +
              '<span>' + certPill(r.stype) + ' <span style="color:#7b8794;">' + esc(r.sub_date) + '</span></span>' +
              '<span>' + ((r.liked_by || []).length ? '<span style="color:#e0639b;">❤ ' + (r.liked_by || []).length + '</span> ' : '') +
              (r.confirmed_by ? '<span style="color:#1e874b;font-weight:700;">✓ 확인</span>' : '<span style="color:#9aa5b1;">대기</span>') + '</span></div>';
          }).join('') + '</div>' : '') +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button type="button" class="btn btn-solid" id="scdLedger" style="padding:7px 14px;">⭐ 달란트 내역·지급</button>' +
        '<button type="button" class="btn btn-line" id="scdItems" style="padding:7px 14px;">🏷 항목 관리</button></div>';
      box.querySelector('#scdClose').onclick = close;
      box.querySelector('#scdLedger').onclick = function () { close(); ssTalentModal(el, ctx, me, s); };
      box.querySelector('#scdItems').onclick = function () { ssItemManager(); };
    }).catch(function (e) {
      box.innerHTML = '<p style="color:#c0392b;">기록을 불러오지 못했습니다: ' + esc(e.message) + '</p><button type="button" class="btn btn-line" id="scdClose">닫기</button>';
      var c = box.querySelector('#scdClose'); if (c) c.onclick = close;
    });
  }

  /* ── 달란트 항목(프리셋): '내용' 클릭 시 목록 표시 + 교사단이 추가/수정/삭제 ── */
  var SS_ITEMS = null;   // 캐시(항목 관리에서 변경 시 무효화)
  function loadSsItems(force) {
    if (SS_ITEMS && !force) return Promise.resolve(SS_ITEMS);
    return brFetch('ss_talent_items?select=*&order=sort.asc,id.asc')
      .then(function (rows) { SS_ITEMS = rows || []; return SS_ITEMS; })
      .catch(function () { SS_ITEMS = []; return SS_ITEMS; });
  }
  // reasonInp 클릭/포커스 → wrap 아래에 항목 드롭다운. 선택하면 내용+달란트 자동 입력.
  function attachItemPicker(wrap, reasonInp, amountInp) {
    if (!wrap || !reasonInp) return;
    var dd = document.createElement('div');
    dd.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid #cdd7e3;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.14);z-index:60;max-height:210px;overflow:auto;display:none;margin-top:2px;';
    wrap.style.position = 'relative';
    wrap.appendChild(dd);
    function render() {
      loadSsItems().then(function (items) {
        dd.innerHTML = (items.length ? items.map(function (it) {
          var a = Number(it.amount) || 0;
          return '<div class="ssi-opt" data-name="' + esc(it.name) + '" data-amount="' + a + '" style="padding:8px 11px;cursor:pointer;display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #f0f3f7;font-size:.86rem;"><span>' + esc(it.name) + '</span><b style="color:#b7791f;">' + (a > 0 ? '+' : '') + a + '</b></div>';
        }).join('') : '<div style="padding:9px 11px;color:#9aa5b1;font-size:.82rem;">등록된 항목이 없습니다. ‘🏷 항목 관리’에서 추가해 주세요.</div>');
        Array.prototype.forEach.call(dd.querySelectorAll('.ssi-opt'), function (o) {
          o.addEventListener('mousedown', function (e) {   // blur보다 먼저 처리되도록 mousedown 사용
            e.preventDefault();
            reasonInp.value = o.dataset.name;
            if (amountInp && Number(o.dataset.amount)) amountInp.value = o.dataset.amount;
            dd.style.display = 'none';
          });
        });
      });
    }
    function open() { render(); dd.style.display = 'block'; }
    reasonInp.addEventListener('focus', open);
    reasonInp.addEventListener('click', open);
    reasonInp.addEventListener('blur', function () { setTimeout(function () { dd.style.display = 'none'; }, 160); });
  }

  /* 항목 관리(교사단): 추가·수정·삭제. onClose: 닫힐 때 호출(버튼 목록 새로고침용) */
  function ssItemManager(onClose) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:30px 16px;overflow:auto;';
    ov.innerHTML = '<div class="form-card" id="ssiBox" style="max-width:440px;width:100%;background:#fff;margin:auto;padding:18px;"></div>';
    document.body.appendChild(ov);
    var box = ov.querySelector('#ssiBox');
    var editing = null;
    function close() { ov.remove(); if (onClose) onClose(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    function draw() {
      box.innerHTML = '<p class="qt-loading">불러오는 중…</p>';
      loadSsItems(true).then(function (items) {
        box.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<h3 style="margin:0;color:var(--accent,#032257);font-size:1rem;">🏷 달란트 항목 관리</h3>' +
          '<button type="button" class="btn btn-line" id="ssiClose" style="padding:4px 12px;">닫기</button></div>' +
          '<p style="color:var(--ink-soft);font-size:.8rem;margin:0 0 10px;">자주 쓰는 항목을 등록해 두면, 지급할 때 ‘내용’ 칸을 클릭해 바로 고를 수 있습니다.</p>' +
          '<div style="background:#fafbfd;border:1px solid #e8edf3;border-radius:10px;padding:12px;margin-bottom:12px;">' +
          '<b style="font-size:.84rem;color:var(--accent,#032257);">' + (editing ? '✏️ 항목 수정' : '＋ 새 항목') + '</b>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:end;">' +
          '<div style="flex:1;min-width:130px;"><label style="display:block;font-size:.74rem;color:#7b8794;margin-bottom:3px;">이름</label><input type="text" id="ssiName" value="' + esc(editing ? editing.name : '') + '" placeholder="예: 출석" style="width:100%;padding:7px 8px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;box-sizing:border-box;"></div>' +
          '<div style="flex:0 0 92px;"><label style="display:block;font-size:.74rem;color:#7b8794;margin-bottom:3px;">달란트(±)</label><input type="number" id="ssiAmount" value="' + (editing ? (Number(editing.amount) || 0) : '') + '" placeholder="예: 1" style="width:100%;padding:7px 8px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;box-sizing:border-box;"></div>' +
          '<span style="white-space:nowrap;"><button type="button" class="btn btn-solid" id="ssiSave" style="padding:7px 14px;">' + (editing ? '수정 저장' : '추가') + '</button>' + (editing ? ' <button type="button" class="btn btn-line" id="ssiEditCancel" style="padding:7px 10px;">취소</button>' : '') + '</span></div>' +
          '<p class="fin-msg" id="ssiMsg"></p></div>' +
          (items.length ?
            '<table class="board-table" style="width:100%;border-collapse:collapse;font-size:.86rem;">' +
            '<thead><tr style="background:#f5f8fc;"><th style="text-align:left;padding:6px 8px;">항목</th><th style="text-align:right;padding:6px 8px;">달란트</th><th style="padding:6px 8px;"></th></tr></thead><tbody>' +
            items.map(function (it) {
              var a = Number(it.amount) || 0;
              return '<tr><td style="padding:6px 8px;">' + esc(it.name) + '</td>' +
                '<td style="padding:6px 8px;text-align:right;font-weight:700;color:' + (a < 0 ? '#c0392b' : '#1e874b') + ';">' + (a > 0 ? '+' : '') + a + '</td>' +
                '<td style="padding:6px 8px;text-align:right;white-space:nowrap;"><button type="button" class="btn btn-line ssi-edit" data-id="' + it.id + '" style="padding:2px 8px;font-size:.72rem;">수정</button> <button type="button" class="btn btn-line ssi-del" data-id="' + it.id + '" style="padding:2px 8px;font-size:.72rem;color:#c0392b;">삭제</button></td></tr>';
            }).join('') + '</tbody></table>' :
            '<p style="color:#9aa5b1;font-size:.84rem;">등록된 항목이 없습니다. 위에서 추가해 주세요.</p>');
        box.querySelector('#ssiClose').onclick = close;
        var msg = box.querySelector('#ssiMsg');
        function fail(t) { msg.style.color = '#c0392b'; msg.textContent = t; }
        box.querySelector('#ssiSave').onclick = function () {
          var nm = box.querySelector('#ssiName').value.trim();
          var amt = Number(box.querySelector('#ssiAmount').value);
          if (!nm) { fail('이름을 입력해 주세요.'); return; }
          if (!amt) { fail('달란트를 숫자로 입력해 주세요(차감 항목은 음수).'); return; }
          msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
          var req = editing
            ? brFetch('ss_talent_items?id=eq.' + editing.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name: nm, amount: amt }) })
            : brFetch('ss_talent_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name: nm, amount: amt, sort: items.length + 1 }) });
          req.then(function () { editing = null; SS_ITEMS = null; draw(); }).catch(function (e) { fail('저장 실패: ' + e.message); });
        };
        var ec = box.querySelector('#ssiEditCancel');
        if (ec) ec.onclick = function () { editing = null; draw(); };
        Array.prototype.forEach.call(box.querySelectorAll('.ssi-edit'), function (b) {
          b.onclick = function () { editing = items.filter(function (x) { return String(x.id) === b.dataset.id; })[0] || null; draw(); };
        });
        Array.prototype.forEach.call(box.querySelectorAll('.ssi-del'), function (b) {
          var it = items.filter(function (x) { return String(x.id) === b.dataset.id; })[0];
          b.onclick = function () {
            if (!confirm('「' + (it ? it.name : '') + '」 항목을 삭제할까요? (이미 지급한 달란트 기록은 그대로 남습니다)')) return;
            brFetch('ss_talent_items?id=eq.' + b.dataset.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
              .then(function () { SS_ITEMS = null; draw(); }).catch(function (e) { fail('삭제 실패: ' + e.message); });
          };
        });
      });
    }
    draw();
  }

  /* 일괄 지급: 어린이 여러 명 선택 → 같은 항목·달란트를 한 번에 등록 */
  function ssBulkModal(el, ctx, me, students) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:30px 16px;overflow:auto;';
    ov.innerHTML = '<div class="form-card" id="ssbkBox" style="max-width:560px;width:100%;background:#fff;margin:auto;padding:18px;"></div>';
    document.body.appendChild(ov);
    var box = ov.querySelector('#ssbkBox');
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<h3 style="margin:0;color:var(--accent,#032257);font-size:1rem;">⚡ 달란트 일괄 지급</h3>' +
      '<button type="button" class="btn btn-line" id="ssbkClose" style="padding:4px 12px;">닫기</button></div>' +
      '<p style="color:var(--ink-soft);font-size:.8rem;margin:0 0 10px;">항목 버튼을 누르면 달란트·내용이 채워집니다. 학생을 선택하고 지급하면 모두에게 한 번에 등록됩니다.</p>' +
      '<div id="ssbkItems" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:10px;">' +
      '<div style="flex:0 0 122px;"><label style="display:block;font-size:.74rem;color:#7b8794;margin-bottom:3px;">날짜</label><input type="date" id="ssbkDate" value="' + esc(todayStr()) + '" style="width:100%;padding:7px 8px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;box-sizing:border-box;"></div>' +
      '<div style="flex:0 0 92px;"><label style="display:block;font-size:.74rem;color:#7b8794;margin-bottom:3px;">달란트(±)</label><input type="number" id="ssbkAmount" placeholder="예: 1" style="width:100%;padding:7px 8px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;box-sizing:border-box;"></div>' +
      '<div id="ssbkReasonWrap" style="flex:1;min-width:140px;"><label style="display:block;font-size:.74rem;color:#7b8794;margin-bottom:3px;">내용</label><input type="text" id="ssbkReason" placeholder="클릭하여 항목 선택" autocomplete="off" style="width:100%;padding:7px 8px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;box-sizing:border-box;"></div></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
      '<b style="font-size:.84rem;color:var(--accent,#032257);">학생 선택</b>' +
      '<label class="sw" style="font-size:.8rem;"><input type="checkbox" id="ssbkAll"> 전체 선택</label></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;border:1px solid #e8edf3;border-radius:10px;padding:10px;max-height:220px;overflow:auto;margin-bottom:12px;">' +
      students.map(function (s, i) {
        return '<label style="display:flex;align-items:center;gap:6px;font-size:.86rem;cursor:pointer;"><input type="checkbox" class="ssbk-kid" data-i="' + i + '"> ' + esc(s.name) + '</label>';
      }).join('') + '</div>' +
      '<div style="display:flex;gap:10px;align-items:center;"><button type="button" class="btn btn-solid" id="ssbkSave" style="padding:8px 16px;">선택한 학생에게 지급</button><span class="fin-msg" id="ssbkMsg"></span></div>';
    box.querySelector('#ssbkClose').onclick = close;
    attachItemPicker(box.querySelector('#ssbkReasonWrap'), box.querySelector('#ssbkReason'), box.querySelector('#ssbkAmount'));
    // 항목 버튼(칩): 누르면 달란트·내용 자동 입력. '항목 관리'로 버튼 추가/삭제.
    function renderChips() {
      var wrap = box.querySelector('#ssbkItems'); if (!wrap) return;
      loadSsItems(true).then(function (items) {
        wrap.innerHTML = items.map(function (it, i) {
          var a = Number(it.amount) || 0;
          return '<button type="button" class="ssbk-chip" data-i="' + i + '" style="border:1px solid #e2cf9b;background:#fffbe8;color:#8a6d1f;border-radius:999px;padding:5px 13px;font:inherit;font-size:.82rem;cursor:pointer;">' + esc(it.name) + ' <b>' + (a > 0 ? '+' : '') + a + '</b></button>';
        }).join('') +
        '<button type="button" id="ssbkManage" style="border:1px dashed #cdd7e3;background:#fff;color:#7b8794;border-radius:999px;padding:5px 13px;font:inherit;font-size:.82rem;cursor:pointer;">🏷 항목 관리</button>';
        Array.prototype.forEach.call(wrap.querySelectorAll('.ssbk-chip'), function (c) {
          c.onclick = function () {
            var it = items[Number(c.dataset.i)]; if (!it) return;
            box.querySelector('#ssbkAmount').value = Number(it.amount) || 0;
            box.querySelector('#ssbkReason').value = it.name;
            Array.prototype.forEach.call(wrap.querySelectorAll('.ssbk-chip'), function (x) { x.style.background = '#fffbe8'; x.style.borderColor = '#e2cf9b'; });
            c.style.background = '#f6e3b0'; c.style.borderColor = '#b7791f';
          };
        });
        var mg = wrap.querySelector('#ssbkManage');
        if (mg) mg.onclick = function () { ssItemManager(renderChips); };
      });
    }
    renderChips();
    var allChk = box.querySelector('#ssbkAll'), kids = box.querySelectorAll('.ssbk-kid');
    allChk.onchange = function () { Array.prototype.forEach.call(kids, function (c) { c.checked = allChk.checked; }); };
    var msg = box.querySelector('#ssbkMsg');
    function fail(t) { msg.style.color = '#c0392b'; msg.textContent = t; }
    box.querySelector('#ssbkSave').onclick = function () {
      var d = box.querySelector('#ssbkDate').value;
      var amt = Number(box.querySelector('#ssbkAmount').value);
      var rsn = box.querySelector('#ssbkReason').value.trim();
      var sel = [];
      Array.prototype.forEach.call(kids, function (c) { if (c.checked) { var s = students[Number(c.dataset.i)]; if (s) sel.push(s); } });
      if (!d) { fail('날짜를 선택해 주세요.'); return; }
      if (!amt) { fail('달란트를 숫자로 입력해 주세요(차감은 음수).'); return; }
      if (!sel.length) { fail('학생을 한 명 이상 선택해 주세요.'); return; }
      msg.style.color = '#7b8794'; msg.textContent = sel.length + '명에게 지급 중…';
      var rows = sel.map(function (s) {
        return { member_key: s.member_key, child_name: s.name, amount: amt, reason: rsn, talent_date: d, created_by: me.memberName || '' };
      });
      brFetch('ss_talents', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(rows) })
        .then(function () {
          msg.style.color = 'green'; msg.textContent = '✓ ' + sel.length + '명에게 ' + (amt > 0 ? '+' : '') + amt + ' 달란트 지급 완료';
          setTimeout(function () { close(); loadSsStudents(el, ctx, me); }, 700);
        })
        .catch(function (e) { fail('지급 실패: ' + e.message); });
    };
  }

  /* ================= QT·필사 인증 (인증샷 → R2, 기록 → ss_submissions) ================= */
  var TYPE_COLOR = { 'QT': '#2b5797', '필사': '#1e874b', '미션': '#b7791f' };  // 달력 점 색
  function certPill(stype) {
    var qt = stype === 'QT', ms = stype === '미션';
    return '<span style="font-size:.72rem;font-weight:700;border-radius:999px;padding:2px 9px;background:' + (ms ? '#fdf3e0' : qt ? '#e8f0fb' : '#e8f6ee') + ';color:' + (ms ? '#b7791f' : qt ? '#2b5797' : '#1e874b') + ';">' + esc(stype) + '</span>';
  }
  function certThumb(r, size) {
    size = size || 56;
    if (!r.photo_url) return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:8px;background:#eef2f7;display:flex;align-items:center;justify-content:center;color:#9aa5b1;flex:0 0 auto;">📷</div>';
    return '<a href="' + esc(r.photo_url) + '" target="_blank" rel="noopener" style="flex:0 0 auto;"><img src="' + esc(r.photo_url) + '" alt="인증샷" loading="lazy" style="width:' + size + 'px;height:' + size + 'px;border-radius:8px;object-fit:cover;border:1px solid #e3e7ee;"></a>';
  }
  function monthKey(d) { return String(d || '').slice(0, 7); }

  // 교사 화면 인증 줄의 '좋아요 이름' 표시 — 그릴 때와 하트를 누른 뒤 갱신할 때 함께 쓴다
  function likeLine(r) {
    var names = r.liked_by || [];
    return (names.length ? '❤ ' + names.map(esc).join(', ') : '아직 좋아요가 없습니다') +
      (r.confirmed_by ? ' · <span style="color:#1e874b;font-weight:700;">✓ ' + esc(r.confirmed_by) + ' 확인</span>' : '');
  }
  function likeBtnStyle(mine) { return 'padding:3px 10px;font-size:.78rem;' + (mine ? 'background:#fdeef5;border-color:#e0639b;color:#e0639b;' : ''); }

  /* ── QT·필사 인증 올리기 + 내역 (어린이 본인 또는 보호자가 자녀 대신)
   * onChange: 업로드/삭제 후 호출 — 달란트 카드 새로고침용(자동 지급 반영) ── */
  function loadMyCerts(container, subjKey, subjName, onChange) {
    if (!container || !subjKey) return;
    var fMonth = monthKey(todayStr());   // 인증 달력에 표시할 달 — 기본은 이번 달
    var fDay = '';                       // 달력에서 고른 날짜('' = 그 달 전체)
    function draw() {
      container.innerHTML = '<div class="form-card" style="padding:16px 18px;"><p class="qt-loading">불러오는 중…</p></div>';
      Promise.all([
        brFetch('ss_submissions?select=*&member_key=eq.' + encodeURIComponent(subjKey) + '&order=sub_date.desc,id.desc&limit=300'),
        // 이번 주 미션(없으면 null) — SQL 미실행 등으로 RPC가 없으면 조용히 없는 것으로 처리
        brFetch('rpc/ss_current_mission', { method: 'POST', body: '{}' }).catch(function () { return null; })
      ])
        .then(function (res) {
          var rows = res[0] || [];
          var mission = res[1] || null;
          var ym = monthKey(todayStr());
          var mQt = rows.filter(function (r) { return r.stype === 'QT' && monthKey(r.sub_date) === ym; }).length;
          var mPil = rows.filter(function (r) { return r.stype === '필사' && monthKey(r.sub_date) === ym; }).length;
          // 하루 한 번 규칙 — 오늘 이미 올린 종류는 버튼을 '완료'로 바꿔 헛걸음을 막는다
          var td = todayStr();
          function doneToday(t) { return rows.filter(function (r) { return r.stype === t && r.sub_date === td; }).length > 0; }
          var doneQt = doneToday('QT'), donePil = doneToday('필사');
          // 미션은 '한 주에 한 번' — 이번 주 미션으로 올린 인증이 있으면 완료
          var doneMission = !!(mission && rows.filter(function (r) { return r.stype === '미션' && String(r.mission_id) === String(mission.id); }).length);
          var calParts = certCalendarHtml();   // { cal: 달력, list: 인증 목록 }
          container.innerHTML =
            '<div class="form-card" style="padding:16px 18px;">' +
            '<h3 style="margin:0 0 4px;font-size:1rem;color:var(--accent,#032257);">📖 QT·필사·미션 인증</h3>' +
            '<p style="color:var(--ink-soft);font-size:.82rem;margin:0 0 12px;">QT·필사는 <b>각각 하루에 한 번</b>, 미션은 <b>한 주에 한 번</b> 올릴 수 있어요. 올리면 <b style="color:#b7791f;">달란트가 자동 지급</b>되고, 홈 화면 <b>‘주일학교 성장기’</b> 섹션에 게시됩니다. 이번 달 QT <b>' + mQt + '회</b> · 필사 <b>' + mPil + '회</b></p>' +
            calParts.cal +   // 달력을 맨 위로(2026-08-25 요청) — 미션·버튼은 그 아래
            (mission ?
              '<div style="border:1px solid #f2e2ae;background:#fffbe8;border-radius:12px;padding:12px 14px;margin-bottom:12px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">' +
              '<b style="font-size:.92rem;color:#8a6d1f;">🎯 이번주 미션 · ' + esc(mission.title) + '</b>' +
              '<span style="font-size:.78rem;background:#fff;border:1px solid #f2e2ae;border-radius:999px;padding:2px 10px;color:#b7791f;font-weight:700;">달란트 ' + (Number(mission.amount) || 1) + '개</span></div>' +
              (mission.description ? '<div style="font-size:.82rem;color:#6b5b26;margin-top:5px;line-height:1.6;">' + esc(mission.description).replace(/\n/g, '<br>') + '</div>' : '') +
              '<div style="margin-top:10px;">' +
              (doneMission ?
                '<button type="button" class="btn btn-line" disabled style="padding:7px 15px;color:#1e874b;border-color:#bfe3cc;background:#f7fcf8;">✓ 이번 주 미션 완료!</button>' :
                '<button type="button" class="btn btn-solid" id="sscUpMs" style="padding:7px 15px;background:#b7791f;border-color:#b7791f;">📷 미션 인증 올리기</button>') +
              '</div></div>' : '') +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
            '<button type="button" class="btn ' + (doneQt ? 'btn-line' : 'btn-solid') + '" id="sscUpQt" style="padding:8px 16px;' + (doneQt ? 'color:#1e874b;border-color:#bfe3cc;background:#f7fcf8;' : '') + '">' + (doneQt ? '✓ 오늘 QT 인증 완료' : '📷 QT 인증 올리기') + '</button>' +
            '<button type="button" class="btn ' + (donePil ? 'btn-line' : 'btn-solid') + '" id="sscUpPil" style="padding:8px 16px;' + (donePil ? 'color:#1e874b;border-color:#bfe3cc;background:#f7fcf8;' : 'background:#1e874b;border-color:#1e874b;') + '">' + (donePil ? '✓ 오늘 필사 인증 완료' : '✍️ 필사 인증 올리기') + '</button>' +
            '<input type="file" id="sscFile" accept="image/*" style="display:none;"></div>' +
            '<p class="fin-msg" id="sscMsg" style="margin:0 0 8px;"></p>' +
            calParts.list +
            '</div>';
          // ── 인증 달력 — 월별로 관리(◀ ▶ 이동), 인증한 날에 종류별 색 점,
          //    날짜를 누르면 그날 인증만 아래에, 목록은 스크롤 박스 안에(2026-08-25)
          //    달력(cal)과 목록(list)을 나눠 돌려준다 — 달력은 카드 맨 위, 목록은 맨 아래 ──
          function certCalendarHtml() {
            if (!rows.length) return { cal: '', list: '<p style="color:#9aa5b1;font-size:.86rem;">아직 올린 인증이 없어요. 첫 인증샷을 올려 보세요! 🌱</p>' };
            var mLabel = Number(fMonth.slice(0, 4)) + '년 ' + Number(fMonth.slice(5, 7)) + '월';
            var monthRows = rows.filter(function (r) { return monthKey(r.sub_date) === fMonth; });
            var byDay = {};
            monthRows.forEach(function (r) { (byDay[r.sub_date] = byDay[r.sub_date] || []).push(r.stype); });
            // 달력 격자
            var first = new Date(fMonth + '-01T00:00:00');
            var startDow = first.getDay();
            var days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
            var td = todayStr();
            var cells = '';
            for (var i = 0; i < startDow; i++) cells += '<div></div>';
            for (var d = 1; d <= days; d++) {
              var ds = fMonth + '-' + pad2(d);
              var types = byDay[ds] || [];
              var dots = [];
              ['QT', '필사', '미션'].forEach(function (t) {
                if (types.indexOf(t) >= 0) dots.push('<span style="width:6px;height:6px;border-radius:50%;background:' + TYPE_COLOR[t] + ';display:inline-block;"></span>');
              });
              var sel = fDay === ds, isToday = ds === td;
              cells += '<div class="ssc-day" data-d="' + ds + '" style="min-height:44px;border-radius:9px;padding:4px 2px 3px;text-align:center;' +
                (types.length ? 'cursor:pointer;background:#f7fafd;' : 'color:#c3ccd6;') +
                (sel ? 'outline:2px solid var(--accent,#032257);background:#eef3fb;' : '') +
                (isToday && !sel ? 'outline:1px dashed #b7c4d6;' : '') + '">' +
                '<div style="font-size:.78rem;' + (types.length ? 'font-weight:700;color:var(--accent,#032257);' : '') + '">' + d + '</div>' +
                '<div style="display:flex;gap:2px;justify-content:center;margin-top:3px;min-height:6px;">' + dots.join('') + '</div></div>';
            }
            var list = fDay ? monthRows.filter(function (r) { return r.sub_date === fDay; }) : monthRows;
            var calHtml = '<div style="border:1px solid #e8edf3;border-radius:12px;padding:10px 12px;margin-bottom:10px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
              '<button type="button" class="btn btn-line" id="sscPrevM" style="padding:2px 11px;font-size:.82rem;">◀</button>' +
              '<b style="font-size:.9rem;color:var(--accent,#032257);">' + mLabel + ' <span style="font-weight:400;color:#7b8794;font-size:.78rem;">인증 ' + monthRows.length + '건</span></b>' +
              '<button type="button" class="btn btn-line" id="sscNextM" style="padding:2px 11px;font-size:.82rem;">▶</button></div>' +
              '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;font-size:.72rem;color:#9aa5b1;text-align:center;margin-bottom:3px;">' +
              ['일', '월', '화', '수', '목', '금', '토'].map(function (w, i) { return '<div style="' + (i === 0 ? 'color:#c0392b;' : '') + '">' + w + '</div>'; }).join('') + '</div>' +
              '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;">' + cells + '</div>' +
              '<div style="display:flex;gap:10px;justify-content:center;margin-top:8px;font-size:.72rem;color:#7b8794;">' +
              ['QT', '필사', '미션'].map(function (t) { return '<span><span style="width:6px;height:6px;border-radius:50%;background:' + TYPE_COLOR[t] + ';display:inline-block;margin-right:3px;"></span>' + t + '</span>'; }).join('') + '</div></div>';
            var listHtml = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
              '<b style="font-size:.84rem;color:var(--accent,#032257);">🗂 ' + (fDay ? Number(fDay.slice(8, 10)) + '일 인증 (' + list.length + '건)' : mLabel + ' 인증 (' + list.length + '건)') + '</b>' +
              (fDay ? '<button type="button" class="btn btn-line" id="sscAllDays" style="padding:2px 10px;font-size:.74rem;">이 달 전체 보기</button>' : '') + '</div>' +
              (list.length ?
                '<div style="max-height:380px;overflow:auto;padding-right:2px;">' +
                list.map(function (r) {
                  var likes = (r.liked_by || []).length;
                  return '<div style="display:flex;gap:10px;align-items:center;border:1px solid #e8edf3;border-radius:10px;padding:8px 10px;margin-bottom:8px;">' +
                    certThumb(r, 56) +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' + certPill(r.stype) + '<span style="font-size:.8rem;color:#7b8794;">' + esc(r.sub_date) + '</span></div>' +
                    '<div style="font-size:.8rem;margin-top:3px;">' +
                    (likes ? '<span style="color:#e0639b;">❤ ' + likes + '</span> ' : '') +
                    (r.confirmed_by ? '<span style="color:#1e874b;font-weight:700;">✓ ' + esc(r.confirmed_by) + ' 선생님 확인</span>' : '<span style="color:#9aa5b1;">확인 대기중</span>') +
                    '</div></div>' +
                    '<button type="button" class="btn btn-line ssc-del" data-id="' + r.id + '" style="padding:2px 8px;font-size:.72rem;color:#c0392b;">삭제</button></div>';
                }).join('') + '</div>' :
                '<p style="color:#9aa5b1;font-size:.84rem;">이 달에는 올린 인증이 없어요.</p>');
            return { cal: calHtml, list: listHtml };
          }
          function shiftMonth(delta) {
            var d = new Date(fMonth + '-01T00:00:00');
            d.setMonth(d.getMonth() + delta);
            fMonth = d.getFullYear() + '-' + pad2(d.getMonth() + 1);
            fDay = '';
            draw();
          }
          var pm = container.querySelector('#sscPrevM'); if (pm) pm.onclick = function () { shiftMonth(-1); };
          var nm = container.querySelector('#sscNextM'); if (nm) nm.onclick = function () { shiftMonth(1); };
          var ad = container.querySelector('#sscAllDays'); if (ad) ad.onclick = function () { fDay = ''; draw(); };
          Array.prototype.forEach.call(container.querySelectorAll('.ssc-day'), function (c) {
            c.onclick = function () {
              var ds = c.dataset.d;
              if (!rows.filter(function (r) { return r.sub_date === ds; }).length) return; // 인증 없는 날은 무시
              fDay = (fDay === ds) ? '' : ds;
              draw();
            };
          });
          var msg = container.querySelector('#sscMsg');
          function flash(ok, t) { msg.style.color = ok ? 'green' : '#c0392b'; msg.textContent = t; }
          var fileInp = container.querySelector('#sscFile'), curType = 'QT';
          // 하루 한 번(QT·필사)/주 1회(미션) — 이미 올렸으면 사진 고르는 창을 열지 않는다(서버도 트리거로 한 번 더 막는다)
          function pick(t) {
            if (t === '미션' ? doneMission : doneToday(t)) {
              flash(false, t === '미션'
                ? '이번 주 미션 인증은 이미 올렸어요. 미션은 한 주에 한 번만 올릴 수 있어요.'
                : '오늘 ' + t + ' 인증은 이미 올렸어요. 하루에 한 번만 올릴 수 있어요. 바꾸시려면 아래 목록에서 오늘 것을 삭제한 뒤 다시 올려 주세요.');
              return;
            }
            curType = t; fileInp.click();
          }
          container.querySelector('#sscUpQt').onclick = function () { pick('QT'); };
          container.querySelector('#sscUpPil').onclick = function () { pick('필사'); };
          var msBtn = container.querySelector('#sscUpMs');
          if (msBtn) msBtn.onclick = function () { pick('미션'); };
          fileInp.onchange = function () {
            var f = fileInp.files && fileInp.files[0]; fileInp.value = '';
            if (!f) return;
            if (!/^image\//.test(f.type)) { flash(false, '이미지 파일만 올릴 수 있어요.'); return; }
            if (!(window.ChurchUpload && ChurchUpload.isReady())) { flash(false, '업로드 서버가 설정되지 않았습니다.'); return; }
            flash(true, ''); msg.style.color = '#7b8794'; msg.textContent = curType + ' 인증샷 올리는 중…';
            ChurchUpload.upload(f, { folder: 'ss-cert' }).then(function (up) {
              var body = { member_key: subjKey, child_name: subjName || '', stype: curType, photo_url: up.url, photo_key: up.key || '' };
              if (curType === '미션' && mission) body.mission_id = mission.id;
              return brFetch('ss_submissions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
            }).then(function () { flash(true, '✓ ' + curType + ' 인증이 올라갔어요! 달란트 지급 + 성장기 게시 완료 ⭐'); draw(); if (onChange) onChange(); })
              .catch(function (e) {
                var m = (e && e.message) || '';
                try { var j = JSON.parse(m); if (j && j.message) m = j.message; } catch (x) { }
                flash(false, /이미 올렸/.test(m) ? m : ('올리기 실패: ' + m));
                draw();
              });
          };
          Array.prototype.forEach.call(container.querySelectorAll('.ssc-del'), function (b) {
            var r = rows.filter(function (x) { return String(x.id) === b.dataset.id; })[0];
            b.onclick = function () {
              if (!confirm('이 인증을 삭제할까요?')) return;
              brFetch('ss_submissions?id=eq.' + b.dataset.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
                .then(function () { if (r && r.photo_key && window.ChurchUpload) ChurchUpload.remove(r.photo_key); draw(); if (onChange) onChange(); })
                .catch(function (e) { flash(false, '삭제 실패: ' + e.message); });
            };
          });
        })
        .catch(function () { container.innerHTML = ''; });
    }
    draw();
  }

  /* ── 보호자: 우리 아이 달란트·인증·헌금 (같은 세대의 '어린이' 자동 판별) ── */
  function renderSsGuardian(el, ctx, me, kids) {
    var cur = 0;
    function draw() {
      var c = kids[cur];
      el.innerHTML =
        '<div class="form-card" style="padding:16px 18px;margin-bottom:14px;">' +
        '<h3 style="margin:0 0 4px;font-size:1rem;color:var(--accent,#032257);">👨‍👧 우리 아이 주일학교</h3>' +
        '<p style="color:var(--ink-soft);font-size:.82rem;margin:0 0 ' + (kids.length > 1 ? '10px' : '0') + ';">보호자 화면입니다. 자녀의 달란트·QT/필사 인증·헌금을 보고, 인증샷을 대신 올릴 수 있습니다.</p>' +
        (kids.length > 1 ? '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + kids.map(function (k, i) {
          var on = i === cur;
          return '<button type="button" class="ssg-kid" data-i="' + i + '" style="border:1px solid ' + (on ? 'var(--accent,#032257)' : '#cdd7e3') + ';background:' + (on ? 'var(--accent,#032257)' : '#fff') + ';color:' + (on ? '#fff' : 'var(--accent,#032257)') + ';border-radius:999px;padding:5px 14px;font:inherit;font-size:.84rem;cursor:pointer;">' + esc(k.name) + '</button>';
        }).join('') + '</div>' : '') +
        '</div>' +
        // 인증(달력)을 '우리 아이 주일학교' 바로 다음에 — 매일 쓰는 화면이 맨 위(2026-08-25)
        '<div id="ssgCerts" style="margin-bottom:14px;"></div>' +
        '<div id="ssgTal" style="margin-bottom:14px;"></div>' +
        '<div id="ssgOff"></div>';
      Array.prototype.forEach.call(el.querySelectorAll('.ssg-kid'), function (b) {
        b.onclick = function () { cur = Number(b.dataset.i); draw(); };
      });
      ssGuardianTalents(el.querySelector('#ssgTal'), c);
      loadMyCerts(el.querySelector('#ssgCerts'), c.member_key, c.name, function () { ssGuardianTalents(el.querySelector('#ssgTal'), c); });
      ssGuardianOfferings(el.querySelector('#ssgOff'), c);
    }
    draw();
  }
  function ssGuardianTalents(container, child) {
    if (!container) return;
    brFetch('ss_talents?select=amount,reason,talent_date,created_by&member_key=eq.' + encodeURIComponent(child.member_key) + '&order=talent_date.desc,id.desc&limit=200')
      .then(function (rows) {
        rows = rows || [];
        var total = rows.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
        container.innerHTML =
          '<div class="form-card" style="padding:16px 18px;">' +
          '<h3 style="margin:0 0 10px;font-size:1rem;color:var(--accent,#032257);">⭐ ' + esc(child.name) + ' 달란트 — <span style="color:#b7791f;">' + won(total) + '</span></h3>' +
          (rows.length ?
            '<div style="overflow:auto;max-height:260px;"><table class="board-table" style="width:100%;border-collapse:collapse;font-size:.86rem;">' +
            '<thead><tr style="background:#f5f8fc;"><th style="text-align:left;padding:6px 8px;">날짜</th><th style="text-align:left;padding:6px 8px;">내용</th><th style="text-align:right;padding:6px 8px;">달란트</th></tr></thead><tbody>' +
            rows.map(function (r) {
              var a = Number(r.amount) || 0;
              return '<tr><td style="padding:5px 8px;white-space:nowrap;">' + esc(r.talent_date) + '</td><td style="padding:5px 8px;">' + esc(r.reason || '') + '</td><td style="padding:5px 8px;text-align:right;font-weight:700;color:' + (a < 0 ? '#c0392b' : '#1e874b') + ';">' + (a > 0 ? '+' : '') + won(a) + '</td></tr>';
            }).join('') + '</tbody></table></div>' :
            '<p style="color:#9aa5b1;font-size:.86rem;">아직 받은 달란트가 없습니다.</p>');
      }).catch(function () { container.innerHTML = ''; });
  }
  function ssGuardianOfferings(container, child) {
    if (!container) return;
    brFetch('rpc/ss_child_offerings', { method: 'POST', body: JSON.stringify({ p_key: child.member_key }) })
      .then(function (rows) {
        rows = rows || [];
        var total = rows.reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0);
        container.innerHTML =
          '<div class="form-card" style="padding:16px 18px;">' +
          '<h3 style="margin:0 0 10px;font-size:1rem;color:var(--accent,#032257);">💝 ' + esc(child.name) + ' 헌금 — ' + won(total) + '원</h3>' +
          (rows.length ?
            '<div style="overflow:auto;max-height:260px;"><table class="board-table" style="width:100%;border-collapse:collapse;font-size:.86rem;">' +
            '<thead><tr style="background:#f5f8fc;"><th style="text-align:left;padding:6px 8px;">일자</th><th style="text-align:left;padding:6px 8px;">항목</th><th style="text-align:right;padding:6px 8px;">금액</th></tr></thead><tbody>' +
            rows.map(function (o) {
              return '<tr><td style="padding:5px 8px;white-space:nowrap;">' + esc(String(o.date || '').slice(0, 10)) + '</td><td style="padding:5px 8px;">' + esc(o.account || '') + (o.service ? ' <span style="color:#9aa5b1;font-size:.76rem;">· ' + esc(o.service) + '</span>' : '') + '</td><td style="padding:5px 8px;text-align:right;font-variant-numeric:tabular-nums;">' + won(o.amount) + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<p style="color:var(--ink-soft);font-size:.78rem;margin-top:8px;">🔒 보호자(같은 세대 가족)에게만 표시됩니다.</p>' :
            '<p style="color:#9aa5b1;font-size:.86rem;">조회된 헌금 내역이 없습니다.</p>');
      }).catch(function () { container.innerHTML = ''; });
  }

  /* ── 교사단: QT·필사 인증 관리(좋아요·확인·기록) ── */
  function loadSsCerts(el, ctx, me) {
    var box = el.querySelector('#ssCertsBox'); if (!box) return;
    var fType = 'all', fPending = false, fChild = '';
    function draw() {
      brFetch('ss_submissions?select=*&order=sub_date.desc,id.desc&limit=300').then(function (rows) {
        rows = rows || [];
        var myName = me.memberName || '관리자';
        var childNames = [];
        rows.forEach(function (r) { var n = r.child_name || ''; if (n && childNames.indexOf(n) < 0) childNames.push(n); });
        childNames.sort(function (a, b) { return a.localeCompare(b, 'ko'); });
        var list = rows.filter(function (r) {
          if (fType !== 'all' && r.stype !== fType) return false;
          if (fPending && r.confirmed_by) return false;
          if (fChild && r.child_name !== fChild) return false;
          return true;
        });
        var pending = rows.filter(function (r) { return !r.confirmed_by; }).length;
        box.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px;">' +
          '<b style="font-size:.9rem;color:var(--accent,#032257);">📖 QT·필사·미션 인증 관리</b>' +
          '<span style="font-size:.78rem;color:#7b8794;">전체 ' + rows.length + '건 · 미확인 <b style="color:' + (pending ? '#c0392b' : '#1e874b') + ';">' + pending + '건</b></span></div>' +
          (rows.length ?
            '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">' +
            ['all', 'QT', '필사', '미션'].map(function (t) {
              var on = fType === t;
              return '<button type="button" class="ssct-type" data-t="' + t + '" style="border:1px solid ' + (on ? 'var(--accent,#032257)' : '#cdd7e3') + ';background:' + (on ? 'var(--accent,#032257)' : '#fff') + ';color:' + (on ? '#fff' : 'var(--accent,#032257)') + ';border-radius:999px;padding:3px 13px;font:inherit;font-size:.76rem;cursor:pointer;">' + (t === 'all' ? '전체' : t) + '</button>';
            }).join('') +
            '<label class="sw" style="font-size:.78rem;margin-left:4px;"><input type="checkbox" id="ssctPending"' + (fPending ? ' checked' : '') + '> 미확인만</label>' +
            '<select id="ssctChild" style="padding:4px 8px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;font-size:.78rem;"><option value="">자녀 전체</option>' +
            childNames.map(function (n) { return '<option' + (fChild === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></div>' +
            (list.length ? '<div style="max-height:440px;overflow:auto;">' + list.map(function (r) {
              var likes = r.liked_by || [];
              var iLiked = likes.indexOf(myName) >= 0;
              return '<div style="display:flex;gap:10px;align-items:center;border:1px solid ' + (r.confirmed_by ? '#d7ead9' : '#e8edf3') + ';background:' + (r.confirmed_by ? '#f7fcf8' : '#fff') + ';border-radius:10px;padding:8px 10px;margin-bottom:8px;">' +
                certThumb(r, 56) +
                '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><b style="font-size:.88rem;">' + esc(r.child_name || '') + '</b>' + certPill(r.stype) + '<span style="font-size:.78rem;color:#7b8794;">' + esc(r.sub_date) + '</span></div>' +
                '<div class="ssct-likes" data-id="' + r.id + '" style="font-size:.76rem;color:#9aa5b1;margin-top:3px;">' +
                likeLine(r) +
                '</div></div>' +
                '<span style="white-space:nowrap;display:flex;gap:4px;">' +
                '<button type="button" class="btn btn-line ssct-like" data-id="' + r.id + '" style="' + likeBtnStyle(iLiked) + '">❤ ' + likes.length + '</button>' +
                '<button type="button" class="btn ' + (r.confirmed_by ? 'btn-line' : 'btn-solid') + ' ssct-ok" data-id="' + r.id + '" style="padding:3px 10px;font-size:.78rem;">' + (r.confirmed_by ? '확인 취소' : '✔ 확인') + '</button>' +
                '<button type="button" class="btn btn-line ssct-del" data-id="' + r.id + '" style="padding:3px 8px;font-size:.72rem;color:#c0392b;">삭제</button></span></div>';
            }).join('') + '</div>' : '<p style="color:#9aa5b1;font-size:.84rem;">조건에 맞는 인증이 없습니다.</p>') :
            '<p style="color:#9aa5b1;font-size:.84rem;margin:4px 0 0;">아직 올라온 인증이 없습니다. 어린이가 대시보드에서 QT·필사 인증샷을 올리면 여기에 표시됩니다.</p>');
        function find(id) { return rows.filter(function (x) { return String(x.id) === id; })[0]; }
        Array.prototype.forEach.call(box.querySelectorAll('.ssct-type'), function (b) { b.onclick = function () { fType = b.dataset.t; draw(); }; });
        var pd = box.querySelector('#ssctPending'); if (pd) pd.onchange = function () { fPending = pd.checked; draw(); };
        var cs = box.querySelector('#ssctChild'); if (cs) cs.onchange = function () { fChild = cs.value; draw(); };
        Array.prototype.forEach.call(box.querySelectorAll('.ssct-like'), function (b) {
          b.onclick = function () {
            var r = find(b.dataset.id); if (!r) return;
            // 성도용 좋아요와 같은 함수를 쓴다 — 내 계정으로 기록돼 동명이인이 있어도 정확히 취소된다
            if (b.disabled) return;
            b.disabled = true;
            brFetch('rpc/ss_toggle_like', { method: 'POST', body: JSON.stringify({ p_id: r.id }) })
              .then(function () { return brFetch('ss_submissions?select=liked_by&id=eq.' + r.id); })
              .then(function (rr) {
                // 목록 전체를 다시 그리면 보고 있던 자리를 잃는다(휴대폰에서 특히) — 이 줄만 고쳐 쓴다
                r.liked_by = (rr && rr[0] && rr[0].liked_by) || [];
                var mine = r.liked_by.indexOf(myName) >= 0;
                b.textContent = '❤ ' + r.liked_by.length;
                b.setAttribute('style', likeBtnStyle(mine));
                var ln = box.querySelector('.ssct-likes[data-id="' + r.id + '"]');
                if (ln) ln.innerHTML = likeLine(r);
                b.disabled = false;
              })
              .catch(function (e) { b.disabled = false; ssFlash(el, false, '좋아요 실패: ' + e.message); });
          };
        });
        Array.prototype.forEach.call(box.querySelectorAll('.ssct-ok'), function (b) {
          b.onclick = function () {
            var r = find(b.dataset.id); if (!r) return;
            var body = r.confirmed_by ? { confirmed_by: null, confirmed_at: null } : { confirmed_by: myName, confirmed_at: new Date().toISOString() };
            if (r.confirmed_by && !confirm('확인을 취소할까요?')) return;
            brFetch('ss_submissions?id=eq.' + r.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) })
              .then(draw).catch(function (e) { ssFlash(el, false, '확인 실패: ' + e.message); });
          };
        });
        Array.prototype.forEach.call(box.querySelectorAll('.ssct-del'), function (b) {
          b.onclick = function () {
            var r = find(b.dataset.id); if (!r) return;
            if (!confirm((r.child_name || '') + ' 어린이의 ' + r.stype + ' 인증(' + r.sub_date + ')을 삭제할까요? (자동 지급된 달란트도 회수됩니다)')) return;
            brFetch('ss_submissions?id=eq.' + r.id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
              .then(function () { if (r.photo_key && window.ChurchUpload) ChurchUpload.remove(r.photo_key); draw(); loadSsStudents(el, ctx, me); })
              .catch(function (e) { ssFlash(el, false, '삭제 실패: ' + e.message); });
          };
        });
      }).catch(function () { box.innerHTML = ''; });
    }
    draw();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitLogin);
  else waitLogin();
})();
