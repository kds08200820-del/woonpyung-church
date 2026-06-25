// ============================================================
//  운평장로교회 홈페이지 스크립트
// ============================================================

// ===== 1. 말씀(설교) 카드 덱: 최대 4주 · 3D 회전 전환 =====
const WEEKS = BULLETINS.slice(0, 4); // 최근 4주만 표기
const sermonDeck = document.getElementById("sermonDeck");
const sermonSide = document.getElementById("sermonSide");
const sermonDots = document.getElementById("sermonDots");
const sermonNewer = document.getElementById("sermonNewer");
const sermonOlder = document.getElementById("sermonOlder");
let active = 0; // 0 = 이번 주(최신)

function cardInner(b) {
  return `
    <div class="sermon-meta">
      <span class="sermon-date">${b.dateLabel} · 주일 낮 예배</span>
      <h3 class="sermon-title">${b.title}</h3>
      <p class="sermon-ref">${b.scripture}</p>
      <p class="sermon-preacher">설교 · ${b.preacher}</p>
    </div>
    <blockquote class="sermon-quote">${b.quote}</blockquote>
    ${b.summary ? `<span class="sermon-more">설교 요약 보기 →</span>` : ""}`;
}

function renderSide(b) {
  sermonSide.innerHTML = `
    <div class="side-card">
      <span class="side-tag">수요기도회</span>
      <p>${b.wed.replace(/^수요기도회 · /, "")}</p>
    </div>
    <div class="side-card">
      <span class="side-tag">새벽기도회</span>
      <p>${b.dawn.replace(/^새벽기도회 · /, "")}</p>
    </div>`;
}

function layoutDeck() {
  [...sermonDeck.children].forEach((card) => {
    const i = Number(card.dataset.i);
    const d = i - active; // d>0: 지나간(과거) 주, d<0: 이후 주
    const ad = Math.abs(d);
    card.style.zIndex = String(50 - ad);
    if (d === 0) {
      card.style.transform = "translate(0,0) scale(1) rotateY(0deg)";
      card.style.opacity = "1";
      card.classList.add("is-active");
    } else {
      const dir = d > 0 ? 1 : -1;
      card.style.transform =
        `translateX(${dir * (30 + (ad - 1) * 10)}px) translateY(${ad * 16}px) ` +
        `scale(${1 - ad * 0.05}) rotateY(${dir * -14}deg)`;
      card.style.opacity = String(Math.max(0.06, 0.32 - (ad - 1) * 0.11));
      card.classList.remove("is-active");
    }
  });
  [...sermonDots.children].forEach((dot, i) => dot.classList.toggle("active", i === active));
  sermonNewer.classList.toggle("disabled", active <= 0);
  sermonOlder.classList.toggle("disabled", active >= WEEKS.length - 1);
  renderSide(WEEKS[active]);
}

function buildDeck() {
  sermonDeck.innerHTML = WEEKS.map(
    (b, i) => `<article class="sermon-feature deck-card" data-i="${i}">${cardInner(b)}</article>`
  ).join("");
  sermonDots.innerHTML = WEEKS.map(
    (_, i) => `<button class="sdot" data-i="${i}" aria-label="${i + 1}주 전 말씀"></button>`
  ).join("");
  layoutDeck();
}

function goSermon(delta) {
  const n = Math.min(WEEKS.length - 1, Math.max(0, active + delta));
  if (n === active) return;
  active = n;
  layoutDeck();
}

if (sermonDeck) {
  buildDeck();
  sermonNewer.addEventListener("click", () => goSermon(-1)); // 이번 주 방향
  sermonOlder.addEventListener("click", () => goSermon(1)); // 지난 주 방향
  sermonDots.addEventListener("click", (e) => {
    const dot = e.target.closest(".sdot");
    if (dot) { active = Number(dot.dataset.i); layoutDeck(); }
  });

  // 모바일: 좌우 스와이프(손으로 밀기)로 카드 넘기기
  let touchStartX = 0, touchStartY = 0, swiped = false;
  sermonDeck.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX; touchStartY = t.clientY; swiped = false;
  }, { passive: true });
  sermonDeck.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    // 가로 이동이 충분하고 세로(스크롤)보다 클 때만 카드 전환
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      swiped = true;
      goSermon(dx < 0 ? 1 : -1); // 왼쪽으로 밀면 지난 주, 오른쪽으로 밀면 이번 주
    }
  }, { passive: true });

  // 카드 클릭(탭): 활성 카드 → 설교 요약 열기 / 뒤 카드 → 앞으로 가져오기
  sermonDeck.addEventListener("click", (e) => {
    if (swiped) { swiped = false; return; } // 스와이프 동작은 탭으로 처리하지 않음
    const card = e.target.closest(".deck-card");
    if (!card) return;
    const i = Number(card.dataset.i);
    if (card.classList.contains("is-active")) {
      openSermonSummary(i);
    } else {
      active = i;
      layoutDeck();
    }
  });
}

// ===== 1-2. 이 달의 봉사위원 (현재 달 기준 자동 표시) =====
const committeeBox = document.getElementById("committee");
if (committeeBox && typeof COMMITTEES !== "undefined" && COMMITTEES.length) {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  // 현재 달과 일치하는 항목, 없으면 현재 달 이하 중 가장 최근, 그래도 없으면 첫 항목
  const sorted = [...COMMITTEES].sort((a, b) => (a.month < b.month ? 1 : -1));
  const c = sorted.find((x) => x.month === ym) || sorted.find((x) => x.month <= ym) || sorted[0];
  committeeBox.innerHTML = `
    <div class="committee-head">
      <span class="w-en light">SERVICE TEAM</span>
      <h4>${c.label} 봉사위원</h4>
    </div>
    <div class="committee-rows">
      ${c.roles.map((r) => `<div class="committee-item"><span class="c-role">${r.role}</span><p class="c-names">${r.names}</p></div>`).join("")}
    </div>`;
}

// ===== 1-3. 매일 말씀 묵상(QT) — 구글 시트 연동(오늘 날짜 자동) =====
(function () {
  const todayBox = document.getElementById("qtToday");
  const modal = document.getElementById("qtModal");
  if (!todayBox || !modal) return;
  const dateListEl = document.getElementById("qtDateList");
  const detailEl = document.getElementById("qtDetail");

  // 구글 시트(공유: 링크가 있는 모든 사용자) CSV 내보내기
  const SHEET_CSV =
    "https://docs.google.com/spreadsheets/d/1Yg0dPnZEj18e9K5t-CC8ESwoXp1hP9Ro9AdTEhFSb0w/gviz/tq?tqx=out:csv";

  let entries = []; // [{date, content, title, ref}] (최신 → 과거)

  function parseCSV(text) {
    const rows = []; let row = []; let field = ""; let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { row.push(field); field = ""; }
        else if (c === "\r") { /* skip */ }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function digest(content) {
    const lines = content.split("\n").map((s) => s.trim()).filter(Boolean);
    const meaningful = lines.filter((l) => !/^📖|^📅|^샬롬|오늘의 QT/.test(l));
    const ref = meaningful.find((l) => /\d+\s*[:：]\s*\d+/.test(l) && l.length < 30) || "";
    const title = meaningful.find((l) => l !== ref) || meaningful[0] || "오늘의 말씀 묵상";
    return { title, ref };
  }

  function todayStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }

  function renderToday() {
    if (!entries.length) {
      todayBox.innerHTML = `<p class="qt-loading">아직 등록된 QT 말씀이 없습니다.</p>`;
      return;
    }
    const ts = todayStr();
    const todayEntry = entries.find((e) => e.date === ts);
    const entry = todayEntry || entries[0];
    const isToday = !!todayEntry;
    todayBox.innerHTML = `
      <button class="qt-card-today" id="qtOpen">
        <span class="qt-badge">${isToday ? "오늘의 QT" : "최근 QT"} · ${entry.date}</span>
        <h3 class="qt-card-title">${entry.title}</h3>
        ${entry.ref ? `<p class="qt-card-ref">${entry.ref}</p>` : ""}
        <span class="qt-card-more">묵상 전문 읽기 →</span>
      </button>`;
    document.getElementById("qtOpen").addEventListener("click", () => openModal(entry.date));
  }

  function buildDateList(activeDate) {
    dateListEl.innerHTML =
      `<h4 class="qt-dl-head">묵상 보기</h4>` +
      entries.map((e) => `<button class="qt-dl-item${e.date === activeDate ? " active" : ""}" data-date="${e.date}">${e.date}</button>`).join("");
  }

  function showDetail(date) {
    const e = entries.find((x) => x.date === date);
    if (!e) return;
    detailEl.innerHTML = "";
    const h = document.createElement("p");
    h.className = "qt-detail-date";
    h.textContent = e.date;
    const body = document.createElement("div");
    body.className = "qt-detail-body";
    body.textContent = e.content; // 텍스트로 출력(줄바꿈은 CSS pre-line)
    detailEl.appendChild(h);
    detailEl.appendChild(body);
    [...dateListEl.querySelectorAll(".qt-dl-item")].forEach((b) => b.classList.toggle("active", b.dataset.date === date));
    detailEl.scrollTop = 0;
  }

  function openModal(date) {
    buildDateList(date);
    showDetail(date);
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  dateListEl.addEventListener("click", (e) => {
    const b = e.target.closest(".qt-dl-item");
    if (b) showDetail(b.dataset.date);
  });
  modal.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  fetch(SHEET_CSV)
    .then((r) => r.text())
    .then((txt) => {
      const rows = parseCSV(txt);
      if (!rows.length) throw new Error("empty");
      const header = rows[0].map((h) => h.trim());
      const di = header.findIndex((h) => h.includes("날짜"));
      const ci = header.findIndex((h) => h.includes("내용") || h.toUpperCase().includes("QT"));
      const dIdx = di >= 0 ? di : 1;
      const cIdx = ci >= 0 ? ci : 2;
      entries = rows.slice(1)
        .map((r) => ({ date: (r[dIdx] || "").trim(), content: (r[cIdx] || "").replace(/\r\n?/g, "\n").trim() }))
        .filter((e) => e.date && e.content)
        .map((e) => ({ ...e, ...digest(e.content) }));
      entries.sort((a, b) => (a.date < b.date ? 1 : -1));
      renderToday();
      // 푸시 알림 클릭(?qt=open 또는 #qt-open)으로 진입 시 모달 자동 열기
      const wantOpen =
        location.hash === "#qt-open" ||
        new URLSearchParams(location.search).get("qt") === "open";
      if (wantOpen && entries.length) {
        const ts = todayStr();
        openModal(entries.find((e) => e.date === ts) ? ts : entries[0].date);
      }
    })
    .catch(() => {
      todayBox.innerHTML = `<p class="qt-loading">오늘의 말씀을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>`;
    });
})();

// ===== 2. 주보 보관함: 월 필터 + 검색 =====
const bulletinList = document.getElementById("bulletinList");
const bulletinMonth = document.getElementById("bulletinMonth");
const bulletinSearch = document.getElementById("bulletinSearch");
const bulletinEmpty = document.getElementById("bulletinEmpty");

function buildMonthOptions() {
  const months = [];
  BULLETINS.forEach((b) => {
    if (!months.find((m) => m.value === b.month)) months.push({ value: b.month, label: b.monthLabel });
  });
  bulletinMonth.innerHTML =
    `<option value="all">전체 보기</option>` +
    months.map((m) => `<option value="${m.value}">${m.label}</option>`).join("");
}

function bulletinCardHTML(b, idx) {
  return `
    <button class="bulletin-card" data-idx="${idx}">
      <span class="b-week">${b.week}</span>
      <span class="b-date">${b.dateLabel}</span>
      <h4>${b.title}</h4>
      <p class="b-ref">${b.scripture}</p>
      <span class="b-more">주보 보기 →</span>
    </button>`;
}

function renderBulletins() {
  const month = bulletinMonth.value;
  const q = bulletinSearch.value.trim().toLowerCase();
  const items = BULLETINS.map((b, i) => ({ b, i })).filter(({ b }) => {
    const monthOk = month === "all" || b.month === month;
    const text = `${b.title} ${b.scripture} ${b.dateLabel} ${b.week} ${b.preacher}`.toLowerCase();
    const searchOk = !q || text.includes(q);
    return monthOk && searchOk;
  });
  bulletinList.innerHTML = items.map(({ b, i }) => bulletinCardHTML(b, i)).join("");
  bulletinEmpty.hidden = items.length > 0;
}

if (bulletinList) {
  buildMonthOptions();
  renderBulletins();
  bulletinMonth.addEventListener("change", renderBulletins);
  bulletinSearch.addEventListener("input", renderBulletins);
}

// ===== 3. 주보 상세 모달 =====
const modal = document.getElementById("bulletinModal");
const modalBody = document.getElementById("modalBody");

function openBulletin(idx) {
  const b = BULLETINS[idx];
  if (!b) return;
  modalBody.innerHTML = `
    <span class="m-eyebrow">${b.week} · 주일 낮 예배</span>
    <h3 id="modalTitle" class="m-title">${b.title}</h3>
    <p class="m-sub">${b.dateLabel} · ${b.scripture} · ${b.preacher}</p>
    <blockquote class="m-quote">${b.quote}</blockquote>

    <h4 class="m-head">예배 순서</h4>
    <ol class="m-order">${b.order.map((o) => `<li>${o}</li>`).join("")}</ol>

    <h4 class="m-head">이 주의 말씀 강해</h4>
    <ul class="m-extra">
      <li>${b.wed}</li>
      <li>${b.dawn}</li>
      <li>${b.qt}</li>
    </ul>

    <h4 class="m-head">한 주의 소식</h4>
    <ol class="m-news">
      ${(b.news || []).map((n) => `<li><strong>${n.title}</strong><span>${n.detail}</span></li>`).join("")}
    </ol>

    <h4 class="m-head">향기로운 예물</h4>
    <div class="m-offering">
      ${(b.offering || []).map((o) => `<div class="m-off-row"><span class="m-off-cat">${o.cat}</span><span class="m-off-names">${o.names.split(" · ").map((n) => `<span>${n}</span>`).join("")}</span></div>`).join("")}
    </div>

    ${b.book ? `
    <h4 class="m-head">Faith &amp; Books</h4>
    <div class="m-book">
      <p class="m-book-title">「${b.book.title}」 · ${b.book.author} <span>(${b.book.publisher})</span></p>
      <p class="m-book-text">${b.book.text}</p>
    </div>` : ""}

    <p class="m-note">* 감사한 마음으로 드린 예물의 명단만 안내하며, 헌금 금액 내역은 게시하지 않습니다.</p>`;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

// 설교 카드 클릭 시: 요약 설교 보기
function openSermonSummary(idx) {
  const b = BULLETINS[idx];
  if (!b || !b.summary || !modal || !modalBody) return;
  const s = b.summary;
  modalBody.innerHTML = `
    <span class="m-eyebrow">${b.dateLabel} · 주일 낮 예배 · 설교 요약</span>
    <h3 id="modalTitle" class="m-title">${s.heading}</h3>
    <p class="m-sub">${b.scripture} · ${b.preacher}</p>

    <h4 class="m-head">${s.sectionTitle}</h4>
    <div class="sm-points">
      ${s.points.map((p) => `<div class="sm-point"><strong>${p.lead}</strong><p>${p.text}</p></div>`).join("")}
    </div>

    <div class="sm-apply">
      <span class="sm-apply-tag">🌱 적용 및 결단</span>
      <p>${s.apply}</p>
      ${s.applyRef ? `<span class="sm-apply-ref">${s.applyRef}</span>` : ""}
    </div>`;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";
}

if (modal) {
  bulletinList.addEventListener("click", (e) => {
    const card = e.target.closest(".bulletin-card");
    if (card) openBulletin(Number(card.dataset.idx));
  });
  modal.addEventListener("click", (e) => {
    if (e.target.hasAttribute("data-close")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) closeModal();
  });
}

// ===== 3-2. 앱 설치 안내 배너 (PWA) =====
(function () {
  const bar = document.getElementById("installBar");
  if (!bar) return;
  const goBtn = document.getElementById("installGo");
  const closeBtn = document.getElementById("installClose");
  const msg = document.getElementById("installMsg");

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  const dismissed = localStorage.getItem("installDismissed") === "1";
  if (isStandalone || dismissed) return; // 이미 설치했거나 닫았으면 표시 안 함

  let deferredPrompt = null;

  // 안드로이드/크롬: 설치 프롬프트 가로채기
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    bar.hidden = false;
  });

  goBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      bar.hidden = true;
    }
  });

  closeBtn.addEventListener("click", () => {
    bar.hidden = true;
    localStorage.setItem("installDismissed", "1");
  });

  // iOS(사파리): beforeinstallprompt 미지원 → 안내 문구로 표시
  const ua = window.navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  if (isIOS && !isStandalone) {
    msg.textContent = "공유 버튼(↑) → ‘홈 화면에 추가’를 눌러 설치하세요.";
    goBtn.hidden = true;
    bar.hidden = false;
  }
})();

// (헤더 스크롤·모바일 메뉴 로직은 js/layout.js로 이관됨)

// ===== 4. 홈 '이번 주 말씀' 하이라이트 =====
const homeSermon = document.getElementById("homeSermon");
if (homeSermon && typeof BULLETINS !== "undefined" && BULLETINS.length) {
  const b = BULLETINS[0];
  homeSermon.innerHTML = `
    <span class="hs-date">${b.dateLabel} · 주일 낮 예배</span>
    <h3 class="hs-title">${b.title}</h3>
    <p class="hs-ref">${b.scripture} · ${b.preacher}</p>
    <blockquote class="hs-quote">${b.quote}</blockquote>
    <a class="btn btn-line" href="word.html">설교 더 보기 →</a>`;
}

// ===== 5. 새가족 등록 폼 (welcome) =====
const newcomerForm = document.getElementById("newcomerForm");
if (newcomerForm) {
  newcomerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    newcomerForm.hidden = true;
    const done = document.getElementById("newcomerDone");
    if (done) done.hidden = false;
  });
}

// ===== 5-2. 삶의 질문 Q&A 아코디언 =====
document.querySelectorAll(".qna-q").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".qna-item");
    const open = item.classList.toggle("open");
    const mark = btn.querySelector(".qna-mark");
    if (mark) mark.textContent = open ? "−" : "+";
  });
});

// ===== 5-3. 하이델베르크 요리문답 — 카드 클릭 시 문답 탐색 =====
(function () {
  const card = document.getElementById("hcCard");
  const modal = document.getElementById("hcModal");
  if (!card || !modal || !window.HEIDELBERG) return;
  const body = document.getElementById("hcBody");
  const search = document.getElementById("hcSearch");
  const HC = window.HEIDELBERG;

  // 자주 묻는 신앙의 궁금증 → 해당 문답 번호
  const CURATED = [
    { n: 3, label: "내 죄와 비참함은 무엇을 통해 알 수 있나요?" },
    { n: 8, label: "사람은 정말 선을 조금도 행할 수 없나요?" },
    { n: 11, label: "하나님은 자비로우신데 왜 죄를 그냥 넘기지 않으시나요?" },
    { n: 16, label: "중보자는 왜 참 하나님이면서 참 사람이어야 했나요?" },
    { n: 21, label: "‘참된 믿음’이란 정확히 무엇인가요?" },
    { n: 38, label: "사도신경의 ‘본디오 빌라도에게 고난을 받으사’는 왜 들어 있나요?" },
    { n: 44, label: "예수님이 ‘음부에 내려가셨다’는 건 무슨 뜻인가요?" },
    { n: 60, label: "나는 어떻게 하나님 앞에서 의롭다 함을 받나요?" },
    { n: 72, label: "세례의 물 자체가 죄를 씻어 주는 건가요?" },
    { n: 78, label: "성찬의 떡과 포도주가 실제로 살과 피로 변하나요?" },
    { n: 86, label: "구원은 은혜로 받았는데 왜 선을 행해야 하나요?" },
    { n: 99, label: "십계명에서 하나님의 이름을 ‘망령되이 일컫지 말라’는 것의 의미는?" },
    { n: 103, label: "제4계명, 주일은 꼭 지켜야 하나요?" },
    { n: 105, label: "‘살인하지 말라’가 마음의 미움까지 포함하나요?" },
    { n: 116, label: "하나님은 다 아시는데 왜 기도해야 하나요?" },
    { n: 125, label: "‘일용할 양식을 주옵시고’는 무엇을 구하는 기도인가요?" },
    { n: 129, label: "기도 끝의 ‘아멘’은 무슨 뜻인가요?" },
  ];

  let part = "전체", query = "";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const get = (n) => HC.find((x) => x.n === n);

  function listView() {
    const q = query.trim().toLowerCase();
    let items = HC;
    if (part !== "전체") items = items.filter((x) => x.part === part);
    if (q) items = items.filter((x) => `문 ${x.n} ${x.q} ${x.a} ${x.ldTitle}`.toLowerCase().includes(q));

    const curated = !q ? `
      <div class="hc-curated">
        <p class="hc-section-t">이런 것이 궁금하셨나요?</p>
        <div class="hc-chips">
          ${CURATED.map((c) => `<button class="hc-chip" data-n="${c.n}">${esc(c.label)}</button>`).join("")}
        </div>
      </div>` : "";

    const tabs = `
      <div class="hc-filters">
        ${["전체", "비참", "구원", "감사"].map((p) => `<button class="hc-tab${p === part ? " active" : ""}" data-part="${p}">${p}</button>`).join("")}
        <span class="hc-count">${items.length}문항</span>
      </div>`;

    const list = items.length
      ? `<div class="hc-list">${items.map((x) => `
          <button class="hc-item" data-n="${x.n}">
            <span class="hc-num">문 ${x.n}</span>
            <span class="hc-q">${esc(x.q)}</span>
            <span class="hc-ld">${x.part} · ${esc(x.ldTitle)}</span>
          </button>`).join("")}</div>`
      : `<p class="hc-empty">검색 결과가 없습니다.</p>`;

    body.innerHTML = curated + tabs + list;
    body.scrollTop = 0;
  }

  function detailView(n) {
    const it = get(n);
    if (!it) return;
    const ans = esc(it.a).split("\n").map((p) => `<p>${p}</p>`).join("");
    const prev = get(n - 1), next = get(n + 1);
    body.innerHTML = `
      <button class="hc-back" data-back>← 목록으로</button>
      <div class="hc-detail">
        <span class="hc-d-meta">제${it.n}문 · 제${it.ld}주일 ${esc(it.ldTitle)} · ${it.part}</span>
        <h4 class="hc-d-q">${esc(it.q)}</h4>
        <div class="hc-d-a">${ans}</div>
        <div class="hc-d-nav">
          ${prev ? `<button class="hc-navbtn" data-n="${prev.n}">← 제${prev.n}문</button>` : `<span></span>`}
          ${next ? `<button class="hc-navbtn" data-n="${next.n}">제${next.n}문 →</button>` : `<span></span>`}
        </div>
      </div>`;
    body.scrollTop = 0;
  }

  function openModal() { listView(); modal.hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal() { modal.hidden = true; document.body.style.overflow = ""; if (search) search.value = ""; query = ""; part = "전체"; }

  card.addEventListener("click", openModal);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(); } });

  body.addEventListener("click", (e) => {
    if (e.target.closest("[data-back]")) { listView(); return; }
    const tab = e.target.closest(".hc-tab");
    if (tab) { part = tab.dataset.part; listView(); return; }
    const el = e.target.closest("[data-n]");
    if (el) { detailView(Number(el.dataset.n)); return; }
  });

  if (search) search.addEventListener("input", () => { query = search.value; listView(); });
  modal.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  // 다른 페이지(히어로 등)에서 ?hc=open 으로 진입하면 모달 자동 열기
  if (new URLSearchParams(location.search).get("hc") === "open") openModal();
})();

// ===== 5-4. 목사님의 글(칼럼) — 카드 렌더 + 전문 모달 =====
(function () {
  const grid = document.getElementById("columnGrid");
  const modal = document.getElementById("columnModal");
  if (!grid || !modal || !window.COLUMNS) return;
  const body = document.getElementById("columnBody");
  const COLS = window.COLUMNS;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  grid.innerHTML = COLS.map((c, i) => {
    const open = !c.coming && Array.isArray(c.body) && c.body.length;
    return `
      <article class="story-card column-card${open ? " is-open" : " is-coming"}"${open ? ` data-col="${i}" role="button" tabindex="0"` : ""}>
        <div class="sc-body">
          <span class="sc-tag">${esc(c.tag || "칼럼")}</span>
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.teaser || "")}${c.coming ? " <span class=\"placeholder-note\">준비 중</span>" : ""}</p>
          ${open ? `<span class="column-go">전문 읽기 →</span>` : ""}
        </div>
      </article>`;
  }).join("");

  function openCol(i) {
    const c = COLS[i];
    if (!c || !c.body) return;
    body.innerHTML = `
      <span class="m-eyebrow">PASTOR'S COLUMN${c.scripture ? " · " + esc(c.scripture) : ""}</span>
      <h3 class="column-title">${esc(c.title)}</h3>
      ${c.author ? `<p class="column-author">${esc(c.author)}</p>` : ""}
      <div class="column-text">${c.body.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    body.scrollTop = 0;
  }
  function closeCol() { modal.hidden = true; document.body.style.overflow = ""; }

  grid.addEventListener("click", (e) => {
    const card = e.target.closest("[data-col]");
    if (card) openCol(Number(card.dataset.col));
  });
  grid.addEventListener("keydown", (e) => {
    const card = e.target.closest("[data-col]");
    if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openCol(Number(card.dataset.col)); }
  });
  modal.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeCol(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeCol(); });
})();

// ===== 5-5. 히어로 제목 회전(서서히 반복 전환) =====
(function () {
  const rot = document.getElementById("heroRotator");
  if (!rot) return;
  const slides = [...rot.querySelectorAll(".hero-slide")];
  if (slides.length < 2) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let i = 0;
  setInterval(() => {
    slides[i].classList.remove("is-active");
    i = (i + 1) % slides.length;
    slides[i].classList.add("is-active");
  }, 5200);
})();

// ===== 5-6. 함께 드리는 기도(prayer.html) — 이번 주 기도 제목 =====
(function () {
  const box = document.getElementById("prayerThisWeek");
  if (!box || typeof BULLETINS === "undefined" || !BULLETINS.length) return;
  const b = BULLETINS[0];
  const news = (b.news || []).map((n) => `<div class="pr-item"><h4>${n.title}</h4><p>${n.detail}</p></div>`).join("");
  box.innerHTML = `
    <div class="pr-meet">
      <div class="side-card"><span class="side-tag">수요기도회</span><p>${(b.wed || "").replace(/^수요기도회 · /, "")}</p></div>
      <div class="side-card"><span class="side-tag">새벽기도회</span><p>${(b.dawn || "").replace(/^새벽기도회 · /, "")}</p></div>
    </div>
    ${news ? `<div class="pr-news">${news}</div>` : ""}
    <p class="pr-source">${b.dateLabel} 주보 기준</p>`;
})();

// ===== 6. 스크롤 등장 애니메이션 =====
const revealTargets = document.querySelectorAll(
  ".about-intro, .servants, .worship-card, .sermon-nav, .sermon-side, .qt-today, .bulletin-controls, .bulletin-card, .news-item, .mission-card, .location-grid, .entry-card, .home-sermon, .info-card, .roadmap-step, .community-card, .group-card, .story-card, .qna-item, .timeline-item, .region-card, .cta-flow"
);
revealTargets.forEach((el) => el.classList.add("reveal"));

const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        entry.target.style.transitionDelay = `${(i % 4) * 0.08}s`;
        entry.target.classList.add("visible");
        io.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 }
);
revealTargets.forEach((el) => io.observe(el));
