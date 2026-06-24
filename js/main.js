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
    <blockquote class="sermon-quote">${b.quote}</blockquote>`;
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
  // 뒤에 투명하게 겹친 지난 카드를 클릭하면 앞으로 가져오기
  sermonDeck.addEventListener("click", (e) => {
    const card = e.target.closest(".deck-card");
    if (card && !card.classList.contains("is-active")) {
      active = Number(card.dataset.i);
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

// ===== 1-3. 매일 말씀 묵상(QT) — 최신 주보 기준 자동 표시 =====
const qtWrap = document.getElementById("qtWrap");
if (qtWrap && typeof BULLETINS !== "undefined" && BULLETINS.length) {
  const b = BULLETINS[0];
  const reading = b.qt.replace(/^매일 말씀 묵상 · /, "");
  const dawn = b.dawn.replace(/^새벽기도회 · /, "").replace(/\s*\(화~금[^)]*\)/, "");
  qtWrap.innerHTML = `
    <p class="qt-lead">하루를 말씀으로 시작하세요. 이번 주 온 교회가 함께 읽는 본문입니다.</p>
    <div class="qt-cards">
      <div class="qt-card">
        <span class="qt-label">이번 주 묵상 본문</span>
        <p class="qt-main">${reading}</p>
        <span class="qt-sub">${b.dateLabel} · ${b.week}</span>
      </div>
      <div class="qt-card">
        <span class="qt-label">새벽기도회 강해</span>
        <p class="qt-main">${dawn}</p>
        <span class="qt-sub">화~금 오전 5시 · 본당</span>
      </div>
    </div>
    <p class="qt-foot">“주의 말씀은 내 발에 등이요 내 길에 빛이니이다” — 시편 119:105</p>`;
}

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

// ===== 4. 헤더 스크롤 상태 =====
const header = document.getElementById("header");
const onScroll = () => {
  if (window.scrollY > 60) header.classList.add("scrolled");
  else header.classList.remove("scrolled");
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ===== 5. 모바일 메뉴 토글 =====
const navToggle = document.getElementById("navToggle");
const navMenu = document.getElementById("navMenu");
navToggle.addEventListener("click", () => {
  navMenu.classList.toggle("open");
  header.classList.toggle("menu-open");
});
navMenu.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => {
    navMenu.classList.remove("open");
    header.classList.remove("menu-open");
  })
);

// ===== 6. 스크롤 등장 애니메이션 =====
const revealTargets = document.querySelectorAll(
  ".about-intro, .servants, .worship-card, .sermon-nav, .sermon-side, .qt-card, .bulletin-controls, .bulletin-card, .news-item, .mission-card, .location-grid"
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
