// ============================================================
//  운평장로교회 홈페이지 스크립트
// ============================================================

// ===== 1. 말씀(설교) 탭: 이번 주 / 지난 주 =====
const sermonFeature = document.getElementById("sermonFeature");
const sermonSide = document.getElementById("sermonSide");
const sermonTabs = document.getElementById("sermonTabs");

function renderSermon(idx) {
  const b = BULLETINS[idx];
  if (!b) return;
  sermonFeature.innerHTML = `
    <div class="sermon-meta">
      <span class="sermon-date">${b.dateLabel} · 주일 낮 예배</span>
      <h3 class="sermon-title">${b.title}</h3>
      <p class="sermon-ref">${b.scripture}</p>
      <p class="sermon-preacher">설교 · ${b.preacher}</p>
    </div>
    <blockquote class="sermon-quote">${b.quote}</blockquote>`;
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

if (sermonTabs) {
  sermonTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".sermon-tab");
    if (!btn) return;
    sermonTabs.querySelectorAll(".sermon-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderSermon(Number(btn.dataset.idx));
  });
  renderSermon(0); // 기본: 이번 주
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
      ${(b.offering || []).map((o) => `<div class="m-off-row"><span class="m-off-cat">${o.cat}</span><span class="m-off-names">${o.names}</span></div>`).join("")}
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
  ".about-intro, .servants, .worship-card, .sermon-feature, .sermon-side, .bulletin-controls, .bulletin-card, .news-item, .mission-card, .location-grid"
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
