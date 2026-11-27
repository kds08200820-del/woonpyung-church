/* ============================================================
   한 주간의 이슈 고민 (2026-11-27 담임목사)
   · 처음: "메뉴에서 지역과 세상을 세상을 향하여 라고 수정 해주시고, 그곳에 오늘의 이슈 고민 항목을 만들어주세요.
     정기 구독을 통해 나의 서재에 있는 이 오늘의 이슈 관련 내용을 자동으로 업로드 할 수 있도록 두 홈페이지 간 연동"
   · 바꿈: "오늘의 이슈 고민을 한 주간의 이슈 고민 으로 해주시고, 4개 중 하나를 관리자가 선택해서 기재 할 수 있도록.
     한 주간의 이슈 선택 역시 관리자가 나의 서재 캘린더를 운평교회에서 임배드 해서 선택할 수 있도록,
     선택이 없을 시 월요일을 기준으로 업데이트를 하고 1번 이슈를 메인으로"
   나의 서재(preacherlibrary.com)가 매일 아침 고른 사회 이슈 · 함께 읽을 책을 구독 주소에서 받는다.
     받는 곳: https://library-api.preacherlibrary.com/feed/issues?key=<구독 열쇠>  (나의 서재 서버 cloud/library-api/src/feed.js)
       ?week=<그 주 월요일> 그 주의 가장 이른 날(월요일) · ?day=<날> 그날 · /days 받아 둔 날짜들 · /c/<책> 표지
   이번 주에 보이는 이슈:
     1) 관리자가 고른 것 — church_settings 'weekly_issue' { week: 그 주 월요일, day, topic } (공개 읽기: rpc weekly_issue_pick,
        supabase/20261127_1500_weekly_issue.sql). week 가 이번 주 월요일일 때만 쓴다
     2) 없으면 이번 주 월요일 것(그 주에 받아 둔 가장 이른 날)의 1번 이슈
   관리자 고르기: 세상을 향하여 화면에서 「이번 주 이슈 고르기」 → 나의 서재 달력(이슈가 있는 날) → 그날의 이슈 가운데 하나
   쓰는 법: <div data-issue-feed></div>  (data-compact: 첫 화면용 — 책 3권까지, 없으면 구역째 숨김)
   ============================================================ */
(function () {
  "use strict";
  console.log("[issues-feed.js] v20261127bk3");
  var FEED = "https://library-api.preacherlibrary.com/feed/issues";
  var KEY = "f_u4D69qgxAnkAYayG7UmMCuV8";   // 구독 열쇠 — 나의 서재 서버에서 받은 값 (공개돼도 이 추천만 읽을 수 있다)
  var LOCAL_PICK = null;   // 로컬 시험용: ?pick=local 이면 고른 것을 이 브라우저(localStorage)에만 둔다
  // 로컬 시험: localhost 에서만 ?feed=<주소>&key=<열쇠>[&pick=local][&admin=1] 로 바꿔 볼 수 있다
  var TEST_ADMIN = false;
  try {
    var q = new URLSearchParams(location.search), h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1") {
      if (q.get("feed")) { FEED = q.get("feed"); KEY = q.get("key") || KEY; }
      if (q.get("pick") === "local") LOCAL_PICK = "wpc-weekly-issue-test";
      TEST_ADMIN = q.get("admin") === "1";
    }
  } catch (e) { /* 옛 브라우저 */ }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function names(a) { return (Array.isArray(a) ? a : []).map(function (x) { return String(x).replace(/\+/g, " ").trim(); }).filter(Boolean).join(", "); }
  function parts(d) { var p = String(d || "").split("-"); return p.length === 3 ? [+p[0], +p[1], +p[2]] : null; }
  function dayText(d) { var p = parts(d); if (!p) return ""; var w = "일월화수목금토".charAt(new Date(p[0], p[1] - 1, p[2]).getDay()); return p[1] + "월 " + p[2] + "일 (" + w + ")"; }
  function ymd(t) { return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0"); }
  // 한국 시각 기준 이번 주 월요일
  function thisMonday() { var t = new Date(Date.now() + 9 * 3600e3); var dow = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dow); return ymd(t); }
  function addDays(d, n) { var p = parts(d); var t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)); return ymd(t); }
  function weekText(m) { var p = parts(m), e = parts(addDays(m, 6)); return p[1] + "월 " + p[2] + "일 ~ " + (e[1] !== p[1] ? e[1] + "월 " : "") + e[2] + "일"; }
  function withTimeout(pr) { return Promise.race([pr, new Promise(function (_, no) { setTimeout(function () { no(new Error("timeout")); }, 8000); })]); }
  function get(u) { return withTimeout(fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })); }
  function url(path, extra) { return FEED + path + "?key=" + encodeURIComponent(KEY) + (extra || ""); }
  function coverOf(b) { return b.cover || (/^[A-Za-z0-9]{6,40}$/.test(b.id || "") ? url("/c/" + b.id) : ""); }

  // ── 교회 Supabase (로그인 토큰은 localStorage 에서 바로 — 개발지침서 5-1) ──
  function session() {
    try {
      var ref = new URL(window.SUPABASE_URL).hostname.split(".")[0];
      var s0 = JSON.parse(localStorage.getItem("sb-" + ref + "-auth-token") || "null");
      var s = s0 && s0.currentSession ? s0.currentSession : s0;
      return s && s.access_token ? { token: s.access_token, uid: s.user && s.user.id } : null;
    } catch (e) { return null; }
  }
  function sb(method, path, body, prefer) {
    var s = session(), hd = { apikey: window.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (s) hd.Authorization = "Bearer " + s.token;
    if (prefer) hd.Prefer = prefer;
    return withTimeout(fetch(window.SUPABASE_URL + "/rest/v1/" + path, { method: method, headers: hd, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(t || String(r.status)); }); return r.status === 204 ? null : r.text().then(function (t) { return t ? JSON.parse(t) : null; }); }));
  }
  function readPick() {
    if (LOCAL_PICK) { try { return Promise.resolve(JSON.parse(localStorage.getItem(LOCAL_PICK) || "null")); } catch (e) { return Promise.resolve(null); } }
    if (!window.SUPABASE_URL) return Promise.resolve(null);
    return sb("POST", "rpc/weekly_issue_pick", {}).catch(function () { return null; });   // 함수가 아직 없어도 월요일 1번으로
  }
  function savePick(data) {
    if (LOCAL_PICK) { localStorage.setItem(LOCAL_PICK, JSON.stringify(data)); return Promise.resolve(); }
    return sb("POST", "church_settings?on_conflict=key", { key: "weekly_issue", data: data, updated_at: new Date().toISOString() }, "resolution=merge-duplicates,return=minimal");
  }
  function isAdmin() {
    if (TEST_ADMIN) return Promise.resolve(true);
    var s = session();
    if (!s || !s.uid || !window.SUPABASE_URL) return Promise.resolve(false);
    return sb("GET", "admins?uid=eq." + encodeURIComponent(s.uid) + "&select=uid").then(function (r) { return !!(r && r.length); }).catch(function () { return false; });
  }

  // 이번 주에 보일 이슈 하나: { week, day, topic, picked, more }
  function loadWeek() {
    var M = thisMonday();
    return readPick().then(function (p) {
      if (p && p.week === M && p.topic && p.topic.theme) return { week: M, day: p.day, topic: p.topic, picked: true };
      return get(url("", "&week=" + M)).then(function (d) {
        var ts = (d && d.topics) || [];
        return ts.length ? { week: M, day: d.day, topic: ts[0], picked: false } : null;
      });
    });
  }
  var weekOnce = null;   // 첫 화면은 두 곳(정원 칸 상자 · 저서 위 구역)이 같은 것을 쓴다 — 한 번만 받는다
  function loadWeekOnce() { return weekOnce || (weekOnce = loadWeek()); }

  function bookHtml(b) {
    var c = coverOf(b);
    var cover = c ? '<img src="' + esc(c) + '" alt="' + esc(b.title) + ' 표지" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;if-ph&quot;></div>\'" />' : '<div class="if-ph">' + esc(b.title) + "</div>";
    var ok = /^[A-Za-z0-9]{6,40}$/.test(b.id || "");
    return '<li class="if-book"' + (ok ? ' data-book="' + esc(b.id) + '" role="button" tabindex="0" title="눌러서 이 책의 요약 보기"' : "") + '><div class="if-cover">' + cover + "</div><div class=\"if-binfo\">" +
      "<h4>『" + esc(b.title) + "』</h4>" + (names(b.authors) ? '<p class="if-au">' + esc(names(b.authors)) + "</p>" : "") +
      (b.reason ? '<p class="if-reason">' + esc(b.reason) + "</p>" : "") +
      (b.one_line ? '<p class="if-one">' + esc(String(b.one_line).split("**").join("")) + "</p>" : "") + "</div></li>";
  }
  function topicHtml(t, max) {
    var bs = (t.books || []).slice(0, max || 6);
    return '<article class="if-topic">' +
      (t.issue ? '<p class="if-issue"><span>이슈</span>' + esc(t.issue) + (t.source ? ' <em>(' + esc(t.source) + ")</em>" : "") + "</p>" : "") +
      "<h3>" + esc(t.theme) + "</h3>" +
      (t.why ? '<p class="if-why">' + esc(t.why) + "</p>" : "") +
      '<p class="if-with">함께 읽을 책 ' + bs.length + '권 <span class="if-hint">· 책을 누르면 요약과 핵심 내용을 볼 수 있습니다</span></p>' +
      '<ul class="if-books">' + bs.map(bookHtml).join("") + "</ul></article>";
  }
  function headHtml(w) {
    return '<p class="if-day"><strong>' + esc(weekText(w.week)) + "</strong> 주간" +
      (w.day ? ' <span class="if-from">· ' + esc(dayText(w.day)) + "</span>" : "") + "</p>";
  }

  // 첫 화면(home.html, 저서 위): 이번 주 이슈와 책 3권까지, 없으면 구역째 숨긴다
  function mountCompact(el) {
    var sec = el.closest("section") || el;
    function hide() { sec.hidden = true; }
    if (!KEY) return hide();
    loadWeekOnce().then(function (w) {
      if (!w) return hide();
      el.innerHTML = '<div class="if-home">' + headHtml(w) + topicHtml(w.topic, 3) +
        '<a class="btn btn-line if-more" href="world.html#issues">한 주간의 이슈 고민 보기 →</a></div>';
      sec.hidden = false;
    }).catch(hide);
  }

  function mount(el) {
    if (el.hasAttribute("data-compact")) return mountCompact(el);
    el.innerHTML = '<div class="if-admin" hidden></div><div class="if-body"><p class="if-msg">이번 주 이슈를 불러오는 중…</p></div>';
    var body = el.querySelector(".if-body"), adm = el.querySelector(".if-admin");
    if (!KEY) { body.innerHTML = '<p class="if-msg">한 주간의 이슈 고민은 곧 시작합니다.</p>'; return; }
    function show() {
      body.innerHTML = '<p class="if-msg">불러오는 중…</p>';
      loadWeek().then(function (w) {
        if (!w) { body.innerHTML = '<p class="if-msg">이번 주에는 아직 올라온 이슈가 없습니다.</p>'; return; }
        body.innerHTML = headHtml(w) + topicHtml(w.topic);   // 2026-11-27 담임목사: 아래 안내 문구 삭제
        adm.setAttribute("data-state", w.picked ? "picked" : "auto");
        var st = adm.querySelector(".if-adm-state");
        if (st) st.textContent = w.picked ? "관리자가 고른 이슈가 걸려 있습니다." : "고른 이슈가 없어 이번 주 월요일 추천의 1번 이슈가 걸려 있습니다.";
      }).catch(function () {
        body.innerHTML = '<p class="if-msg">지금은 이슈를 불러오지 못했습니다. <button type="button" class="if-retry">다시 시도</button></p>';
        body.querySelector(".if-retry").onclick = show;
      });
    }
    show();
    isAdmin().then(function (yes) { if (yes) picker(adm, show); });
  }

  // ── 관리자: 나의 서재 달력에서 날 → 그날의 이슈 가운데 하나를 이번 주 이슈로 ──
  function picker(adm, refresh) {
    adm.hidden = false;
    adm.innerHTML = '<div class="if-adm-top"><span class="if-adm-tag">관리자</span><span class="if-adm-state"></span>' +
      '<button type="button" class="if-adm-open">이번 주 이슈 고르기</button></div><div class="if-cal" hidden></div>' +
      '<div class="if-adm-foot" hidden><button type="button" class="if-adm-close">닫기</button></div>';
    var cal = adm.querySelector(".if-cal"), openBtn = adm.querySelector(".if-adm-open"), foot = adm.querySelector(".if-adm-foot"), days = null, view = null, sel = null;
    // 2026-11-27 담임목사 "관리자 창을 닫을 수 없습니다. 닫기 버튼 만드세요": 위 버튼은 열림/닫기로 바뀌고, 아래에도 닫기
    function closeCal() { cal.hidden = true; foot.hidden = true; openBtn.textContent = "이번 주 이슈 고르기"; }
    adm.querySelector(".if-adm-close").onclick = closeCal;
    openBtn.onclick = function () {
      if (!cal.hidden) { closeCal(); return; }
      cal.hidden = false; foot.hidden = false; openBtn.textContent = "닫기";
      cal.innerHTML = '<p class="if-msg">나의 서재 달력을 불러오는 중…</p>';
      get(url("/days")).then(function (d) {
        days = (d && d.days) || [];
        var last = days[0] || ymd(new Date(Date.now() + 9 * 3600e3));
        view = last.slice(0, 7);
        sel = days.indexOf(thisMonday()) >= 0 ? thisMonday() : days.filter(function (x) { return x >= thisMonday(); }).pop() || days[0] || null;
        draw();
      }).catch(function () { cal.innerHTML = '<p class="if-msg">달력을 불러오지 못했습니다.</p>'; });
    };
    function draw() {
      var p = view.split("-").map(Number), first = new Date(Date.UTC(p[0], p[1] - 1, 1)), lead = (first.getUTCDay() + 6) % 7;
      var nDays = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate(), M = thisMonday(), cells = "";
      for (var i = 0; i < lead; i++) cells += "<span></span>";
      for (var dd = 1; dd <= nDays; dd++) {
        var key = view + "-" + String(dd).padStart(2, "0"), has = days.indexOf(key) >= 0;
        var cls = (has ? "has" : "") + (key === sel ? " on" : "") + (key >= M && key <= addDays(M, 6) ? " wk" : "");
        cells += has ? '<button type="button" class="' + cls + '" data-d="' + key + '">' + dd + "</button>" : '<span class="' + cls + '">' + dd + "</span>";
      }
      cal.innerHTML = '<div class="if-cal-grid"><div class="if-cal-head"><button type="button" data-m="-1" aria-label="이전 달">‹</button><strong>' + p[0] + "년 " + p[1] + '월</strong><button type="button" data-m="1" aria-label="다음 달">›</button></div>' +
        '<div class="if-cal-week"></div>' +
        '<div class="if-cal-days">' + cells + "</div>" +
        '<p class="if-cal-note">점이 있는 날에 나의 서재 추천이 있습니다. 회색 줄이 이번 주입니다.</p></div><div class="if-cal-list"></div>';
      cal.querySelector(".if-cal-week").innerHTML = "월화수목금토일".split("").map(function (c) { return "<span>" + c + "</span>"; }).join("");
      cal.querySelectorAll("[data-m]").forEach(function (b) { b.onclick = function () { var t = new Date(Date.UTC(p[0], p[1] - 1 + (+b.getAttribute("data-m")), 1)); view = ymd(t).slice(0, 7); draw(); }; });
      cal.querySelectorAll("[data-d]").forEach(function (b) { b.onclick = function () { sel = b.getAttribute("data-d"); draw(); }; });
      if (sel) list(sel);
    }
    function list(day) {
      var box = cal.querySelector(".if-cal-list");
      box.innerHTML = '<p class="if-msg">' + esc(dayText(day)) + " 추천을 불러오는 중…</p>";
      get(url("", "&day=" + day)).then(function (d) {
        var ts = (d && d.topics) || [];
        if (!ts.length) { box.innerHTML = '<p class="if-msg">이날은 추천이 없습니다.</p>'; return; }
        box.innerHTML = '<p class="if-cal-day">' + esc(dayText(day)) + " 추천 " + ts.length + "가지</p>" + ts.map(function (t, i) {
          return '<div class="if-pick"><span class="if-pick-n">' + (i + 1) + '</span><div><strong>' + esc(t.theme) + "</strong>" +
            (t.issue ? "<p>" + esc(t.issue) + "</p>" : "") + '<p class="if-pick-books">' + (t.books || []).map(function (b) { return "『" + esc(b.title) + "』"; }).join(" ") + "</p></div>" +
            '<button type="button" data-i="' + i + '">이번 주 이슈로 걸기</button></div>';
        }).join("") + '<button type="button" class="if-pick-clear">고른 것 풀기 (월요일 1번 이슈로)</button><p class="if-pick-msg" aria-live="polite"></p>';
        var msg = box.querySelector(".if-pick-msg");
        box.querySelectorAll("[data-i]").forEach(function (b) {
          b.onclick = function () {
            var t = ts[+b.getAttribute("data-i")];
            var topic = { theme: t.theme, why: t.why || "", issue: t.issue || "", source: t.source || "",
              books: (t.books || []).map(function (x) { return { id: x.id, title: x.title, authors: x.authors || [], one_line: x.one_line || "", reason: x.reason || "" }; }) };
            msg.textContent = "거는 중…";
            savePick({ week: thisMonday(), day: day, topic: topic, at: new Date().toISOString() }).then(function () { msg.textContent = "이번 주 이슈로 걸었습니다."; refresh(); })
              .catch(function (e) { msg.textContent = /42P01|PGRST205|does not exist|schema cache/i.test(e.message) ? "church_settings.sql 실행이 필요합니다." : "걸지 못했습니다: " + e.message; });
          };
        });
        box.querySelector(".if-pick-clear").onclick = function () {
          msg.textContent = "푸는 중…";
          savePick({ week: null, at: new Date().toISOString() }).then(function () { msg.textContent = "풀었습니다. 이번 주 월요일 추천의 1번 이슈가 보입니다."; refresh(); })
            .catch(function (e) { msg.textContent = "풀지 못했습니다: " + e.message; });
        };
      }).catch(function () { box.innerHTML = '<p class="if-msg">추천을 불러오지 못했습니다.</p>'; });
    }
  }

  // 첫 화면 정원 칸의 「한 주간의 이슈 고민」 상자 (home.html #hpGI) — 이번 주 이슈 제목. 없으면 숨긴 그대로
  // ── 책 요약 창 (2026-11-27 담임목사 "책을 클릭 하면 그 책에 대한 요약과 핵심 내용을 간단하게 볼 수 있도록",
  //    "만일 공개가 저작권 떄문에 어렵다면 관리자인 내가 혼자라도 볼 수 있게") ──
  //   나의 서재 서버 /feed/issues/book/<책>. 누구나: 한 줄 · 핵심 내용 · 함께 생각할 질문.
  //   2026-11-27 담임목사 "관리자와 성도가 같은 내용을 보도록" → 관리자도 같은 것만 (관리자 전용 열쇠는 나의 서재 서버에서 끊음).
  //   서버가 개요 · 장별 요약을 보내면(전체 열쇠일 때만) 아래 if-bk-full 칸에 보인다 — 지금은 쓰지 않는다
  function rich(s) { return esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").split("**").join(""); }
  function paras(s) { return String(s || "").split(/\n{2,}/).filter(function (x) { return x.trim(); }).map(function (x) { return "<p>" + rich(x.trim()) + "</p>"; }).join(""); }
  var bookCache = {}, lastFocus = null;
  function closeBook() {
    var m = document.getElementById("ifBook"); if (!m) return;
    m.hidden = true; document.documentElement.classList.remove("if-lock");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function openBook(id) {
    lastFocus = document.activeElement;
    var m = document.getElementById("ifBook");
    if (!m) {
      m = document.createElement("div"); m.id = "ifBook"; m.className = "if-modal"; m.hidden = true;
      m.innerHTML = '<div class="if-modal-bg" data-close></div><div class="if-modal-box" role="dialog" aria-modal="true" aria-label="책 요약"><button type="button" class="if-modal-x" data-close aria-label="닫기">&times;</button><div class="if-modal-body"></div></div>';
      document.body.appendChild(m);
      m.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) closeBook(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !m.hidden) closeBook(); });
    }
    var body = m.querySelector(".if-modal-body");
    body.innerHTML = '<p class="if-msg">책 요약을 불러오는 중…</p>';
    m.hidden = false; document.documentElement.classList.add("if-lock");
    m.querySelector(".if-modal-x").focus();
    (bookCache[id] || (bookCache[id] = get(url("/book/" + id)))).then(function (b) {
      var meta = [names(b.authors), b.translator && b.translator.length ? names(b.translator) + " 옮김" : "", b.publisher, b.year, b.pages ? b.pages + "쪽" : ""].filter(Boolean).join(" · ");
      body.innerHTML =
        '<div class="if-bk-head' + (b.cover ? "" : " nc") + '">' + (b.cover ? '<img src="' + esc(b.cover) + '" alt="' + esc(b.title) + ' 표지" />' : "") +
          "<div><h3>『" + esc(b.title) + "』</h3>" + (b.subtitle ? '<p class="if-bk-sub">' + esc(b.subtitle) + "</p>" : "") +
          (meta ? '<p class="if-bk-meta">' + esc(meta) + "</p>" : "") + "</div></div>" +
        (b.one_line ? '<p class="if-bk-one">' + rich(b.one_line) + "</p>" : "") +
        ((b.key_points || []).length ? '<h4>핵심 내용</h4><ol class="if-bk-keys">' + b.key_points.map(function (x) { return "<li>" + rich(x) + "</li>"; }).join("") + "</ol>" : "") +
        ((b.questions || []).length ? '<h4>함께 생각할 질문</h4><ul class="if-bk-q">' + b.questions.map(function (x) { return "<li>" + rich(x) + "</li>"; }).join("") + "</ul>" : "") +
        (b.overview || (b.chapters || []).length ? '<div class="if-bk-full">' +
          (b.overview ? '<h4>요약</h4><div class="if-bk-over">' + paras(b.overview) + "</div>" : "") +
          ((b.chapters || []).length ? '<details class="if-bk-ch"><summary>장별 요약 (' + b.chapters.length + ")</summary>" + b.chapters.map(function (c) { return "<div><b>" + esc(c.title) + "</b>" + (c.summary ? "<p>" + rich(c.summary) + "</p>" : "") + "</div>"; }).join("") + "</details>" : "") + "</div>" : "") +
        (!b.one_line && !(b.key_points || []).length && !b.overview ? '<p class="if-msg">이 책은 아직 요약이 없습니다.</p>' : "");
      body.scrollTop = 0;
    }).catch(function () { delete bookCache[id]; body.innerHTML = '<p class="if-msg">책 요약을 불러오지 못했습니다.</p>'; });
  }
  document.addEventListener("click", function (e) {
    var li = e.target.closest && e.target.closest(".if-book[data-book]");
    if (li) { e.preventDefault(); openBook(li.getAttribute("data-book")); }
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".if-book[data-book]")) { e.preventDefault(); openBook(e.target.getAttribute("data-book")); }
  });

  function gardenBox() {
    var box = document.getElementById("hpGI"), t = document.getElementById("hpGIT");
    if (!box || !t || !KEY) return;
    loadWeekOnce().then(function (w) { if (w && w.topic && w.topic.theme) { t.textContent = w.topic.theme; box.hidden = false; } }).catch(function () { /* 숨긴 그대로 */ });
  }
  function init() { document.querySelectorAll("[data-issue-feed]").forEach(mount); gardenBox(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
