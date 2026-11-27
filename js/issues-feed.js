/* ============================================================
   오늘의 이슈 고민 (2026-11-27 담임목사 "메뉴에서 지역과 세상을 세상을 향하여 라고 수정 해주시고, 그곳에 오늘의 이슈 고민 항목을 만들어주세요.
   정기 구독을 통해 나의 서재에 있는 이 오늘의 이슈 관련 내용을 자동으로 업로드 할 수 있도록 두 홈페이지 간 연동")
   나의 서재(preacherlibrary.com)가 매일 아침 고른 사회 이슈 · 함께 읽을 책을 구독 주소에서 받아 보인다.
     받는 곳: https://library-api.preacherlibrary.com/feed/issues?key=<구독 열쇠>  (나의 서재 서버 cloud/library-api/src/feed.js)
     열쇠 끊기 · 새로 받기: 나의 서재 서버의 /admin/feeds (맞추기 열쇠) — 끊으면 이 구역은 「잠시 쉽니다」로 바뀐다
   쓰는 법: <div data-issue-feed></div>  (data-compact 를 붙이면 날짜 고르기 없이 오늘 것만)
   ============================================================ */
(function () {
  "use strict";
  console.log("[issues-feed.js] v20261127if1");
  var FEED = "https://library-api.preacherlibrary.com/feed/issues";
  var KEY = "f_u4D69qgxAnkAYayG7UmMCuV8";   // 구독 열쇠 — 나의 서재 서버에서 받은 값 (공개돼도 이 추천만 읽을 수 있다)
  // 로컬 시험: localhost 에서만 ?feed=<주소>&key=<열쇠> 로 바꿔 볼 수 있다
  try {
    var q = new URLSearchParams(location.search), h = location.hostname;
    if ((h === "localhost" || h === "127.0.0.1") && q.get("feed")) { FEED = q.get("feed"); KEY = q.get("key") || KEY; }
  } catch (e) { /* 옛 브라우저 */ }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function names(a) { return (Array.isArray(a) ? a : []).map(function (x) { return String(x).replace(/\+/g, " ").trim(); }).filter(Boolean).join(", "); }
  function dayText(d) { var p = String(d || "").split("-"); if (p.length !== 3) return ""; var w = "일월화수목금토".charAt(new Date(+p[0], +p[1] - 1, +p[2]).getDay()); return (+p[1]) + "월 " + (+p[2]) + "일 (" + w + ")"; }
  function get(url) {
    return Promise.race([
      fetch(url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }),
      new Promise(function (_, no) { setTimeout(function () { no(new Error("timeout")); }, 8000); }),
    ]);
  }
  function url(path, extra) { return FEED + path + "?key=" + encodeURIComponent(KEY) + (extra || ""); }

  function bookHtml(b) {
    var cover = b.cover ? '<img src="' + esc(b.cover) + '" alt="' + esc(b.title) + ' 표지" loading="lazy" />' : '<div class="if-ph">' + esc(b.title) + "</div>";
    return '<li class="if-book"><div class="if-cover">' + cover + "</div><div class=\"if-binfo\">" +
      "<h4>『" + esc(b.title) + "』</h4>" + (names(b.authors) ? '<p class="if-au">' + esc(names(b.authors)) + "</p>" : "") +
      (b.reason ? '<p class="if-reason">' + esc(b.reason) + "</p>" : "") +
      (b.one_line ? '<p class="if-one">' + esc(b.one_line) + "</p>" : "") + "</div></li>";
  }
  function topicHtml(t, i) {
    return '<article class="if-topic">' +
      '<span class="if-num">' + String(i + 1).padStart(2, "0") + "</span>" +
      (t.issue ? '<p class="if-issue"><span>이슈</span>' + esc(t.issue) + (t.source ? ' <em>(' + esc(t.source) + ")</em>" : "") + "</p>" : "") +
      "<h3>" + esc(t.theme) + "</h3>" +
      (t.why ? '<p class="if-why">' + esc(t.why) + "</p>" : "") +
      '<p class="if-with">함께 읽을 책 ' + (t.books || []).length + "권</p>" +
      '<ul class="if-books">' + (t.books || []).map(bookHtml).join("") + "</ul></article>";
  }

  // 첫 화면(home.html, 저서 위 — 2026-11-27 담임목사 "오늘의 이슈 추천 책"): 첫 주제 하나와 그 책들만, 없으면 구역째 숨긴다
  function mountCompact(el) {
    var sec = el.closest("section") || el;
    function hide() { sec.hidden = true; }
    if (!KEY) return hide();
    get(url("")).then(function (d) {
      var ts = (d && d.topics) || [];
      if (!ts.length) return hide();
      var t = ts[0];
      el.innerHTML = '<div class="if-home">' +
        '<p class="if-day">' + esc(dayText(d.day)) + (t.issue ? ' · <span class="if-home-issue">' + esc(t.issue) + "</span>" : "") + "</p>" +
        "<h3>" + esc(t.theme) + "</h3>" +
        (t.why ? '<p class="if-why">' + esc(t.why) + "</p>" : "") +
        '<ul class="if-books">' + (t.books || []).slice(0, 3).map(bookHtml).join("") + "</ul>" +
        '<a class="btn btn-line if-more" href="world.html#issues">' + (ts.length > 1 ? "다른 이슈 " + (ts.length - 1) + "개 더 보기 →" : "오늘의 이슈 고민 보기 →") + "</a></div>";
      sec.hidden = false;
    }).catch(hide);
  }

  function mount(el) {
    var compact = el.hasAttribute("data-compact");
    if (compact) return mountCompact(el);
    el.innerHTML = '<div class="if-bar"></div><div class="if-body"><p class="if-msg">오늘의 이슈를 불러오는 중…</p></div>';
    var bar = el.querySelector(".if-bar"), body = el.querySelector(".if-body");
    if (!KEY) { body.innerHTML = '<p class="if-msg">오늘의 이슈 고민은 곧 시작합니다.</p>'; return; }

    function show(day) {
      body.innerHTML = '<p class="if-msg">불러오는 중…</p>';
      get(url("", day ? "&day=" + encodeURIComponent(day) : "")).then(function (d) {
        var ts = (d && d.topics) || [];
        if (!ts.length) { body.innerHTML = '<p class="if-msg">이날은 올라온 이슈가 없습니다.</p>'; return; }
        body.innerHTML = '<p class="if-day">' + esc(dayText(d.day)) + "</p>" + ts.map(topicHtml).join("") +
          '<p class="if-src">매일 아침 <a href="https://preacherlibrary.com/" target="_blank" rel="noopener">나의 서재</a>에서 함께 고민할 이슈와 책을 보내 옵니다.</p>';
        bar.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-day") === d.day); });
      }).catch(function () {
        body.innerHTML = '<p class="if-msg">지금은 오늘의 이슈를 불러오지 못했습니다. <button type="button" class="if-retry">다시 시도</button></p>';
        body.querySelector(".if-retry").onclick = function () { show(day); };
      });
    }
    show("");
    get(url("/days")).then(function (d) {
      var days = ((d && d.days) || []).slice(0, 14);
      if (days.length < 2) return;
      bar.innerHTML = '<span class="if-bar-label">지난 이슈</span>' + days.map(function (x, i) {
        return '<button type="button" data-day="' + esc(x) + '"' + (i === 0 ? ' class="on"' : "") + ">" + esc(dayText(x).replace(/ \(.\)$/, "")) + "</button>";
      }).join("");
      bar.addEventListener("click", function (e) {
        var b = e.target.closest("button[data-day]");
        if (b) show(b.getAttribute("data-day"));
      });
    }).catch(function () { /* 날짜 고르기는 덤 */ });
  }

  function init() { document.querySelectorAll("[data-issue-feed]").forEach(mount); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
