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

  // 구글 시트(레거시 — 운영중에는 Supabase 사용)
  const SHEET_CSV =
    "https://docs.google.com/spreadsheets/d/1Yg0dPnZEj18e9K5t-CC8ESwoXp1hP9Ro9AdTEhFSb0w/gviz/tq?tqx=out:csv";

  let entries = []; // [{date, content, title, ref}] (최신 → 과거)

  // Supabase 'qt_published' 뷰에서 매일 QT 가져오기 → 카카오톡 발송 양식과 동일한 텍스트로 합성
  function fmtKakaoDateFromIso(iso) {
    if (!iso) return "";
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return iso;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const dow = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][d.getDay()];
    return `${m[1]}.${m[2]}.${m[3]} ${dow}`;
  }
  function rowToQtContent(r) {
    const dateStr = fmtKakaoDateFromIso(r.sermon_date);
    const out = [];
    out.push("📖 샬롬! 오늘의 QT입니다.");
    out.push("");
    out.push(`📅 날짜: ${dateStr}`);
    out.push("");
    if (r.title) out.push(r.title);
    if (r.scripture) out.push(r.scripture);
    out.push("");
    out.push("📖 성경 본문 (우리말 성경)");
    out.push((r.qt_bible_text || "").trim());
    out.push("");
    out.push("📝 묵상");
    out.push("");
    out.push((r.content || "").trim());
    return out.join("\n");
  }
  function loadQtFromSupabase() {
    if (!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY)) return Promise.resolve(null);
    const u = window.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/qt_published?select=sermon_date,title,scripture,qt_bible_text,content&order=sermon_date.desc&limit=180";
    return fetch(u, { headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: "Bearer " + window.SUPABASE_ANON_KEY } })
      .then((r) => r.ok ? r.json() : null)
      .then((rows) => {
        if (!rows || !rows.length) return null;
        const ymd = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}.${m[2]}.${m[3]}` : ""; };
        return rows
          .filter((r) => r.sermon_date && (r.qt_bible_text || r.content))
          .map((r) => ({ date: ymd(r.sermon_date), content: rowToQtContent(r) }));
      })
      .catch(() => null);
  }

  // ── 갓피아(GODpia) 성경 듣기 딥링크: reading.asp?vol=<책코드>&chap=<장> ──
  const GODPIA_BASE = "https://www.godpia.com/read/reading.asp";
  const GODPIA_VOL = {
    "창세기":"gen","출애굽기":"exo","레위기":"lev","민수기":"num","신명기":"deu",
    "여호수아":"jos","사사기":"jdg","룻기":"rut","사무엘상":"1sa","사무엘하":"2sa",
    "열왕기상":"1ki","열왕기하":"2ki","역대상":"1ch","역대하":"2ch","에스라":"ezr",
    "느헤미야":"neh","에스더":"est","욥기":"job","시편":"psa","잠언":"pro",
    "전도서":"ecc","아가":"sng","이사야":"isa","예레미야":"jer","예레미야애가":"lam",
    "에스겔":"ezk","다니엘":"dan","호세아":"hos","요엘":"jol","아모스":"amo",
    "오바댜":"oba","요나":"jnh","미가":"mic","나훔":"nam","하박국":"hab",
    "스바냐":"zep","학개":"hag","스가랴":"zec","말라기":"mal","마태복음":"mat",
    "마가복음":"mrk","누가복음":"luk","요한복음":"jhn","사도행전":"act","로마서":"rom",
    "고린도전서":"1co","고린도후서":"2co","갈라디아서":"gal","에베소서":"eph","빌립보서":"php",
    "골로새서":"col","데살로니가전서":"1th","데살로니가후서":"2th","디모데전서":"1ti","디모데후서":"2ti",
    "디도서":"tit","빌레몬서":"phm","히브리서":"heb","야고보서":"jas","베드로전서":"1pe",
    "베드로후서":"2pe","요한일서":"1jn","요한이서":"2jn","요한삼서":"3jn","유다서":"jud","요한계시록":"rev",
    // 흔한 약어
    "창":"gen","출":"exo","레":"lev","민":"num","신":"deu","수":"jos","삿":"jdg","룻":"rut",
    "삼상":"1sa","삼하":"2sa","왕상":"1ki","왕하":"2ki","대상":"1ch","대하":"2ch","스":"ezr",
    "느":"neh","에":"est","욥":"job","시":"psa","잠":"pro","전":"ecc","아":"sng","사":"isa",
    "렘":"jer","애":"lam","겔":"ezk","단":"dan","호":"hos","욜":"jol","암":"amo","옵":"oba",
    "욘":"jnh","미":"mic","나":"nam","합":"hab","습":"zep","학":"hag","슥":"zec","말":"mal",
    "마":"mat","막":"mrk","눅":"luk","요":"jhn","행":"act","롬":"rom","고전":"1co","고후":"2co",
    "갈":"gal","엡":"eph","빌":"php","골":"col","살전":"1th","살후":"2th","딤전":"1ti","딤후":"2ti",
    "딛":"tit","몬":"phm","히":"heb","약":"jas","벧전":"1pe","벧후":"2pe","요일":"1jn","요이":"2jn",
    "요삼":"3jn","유":"jud","계":"rev",
  };
  // "나훔 2:1~7", "시편 119:105", "고린도전서 13:4" → 책+장으로 변환
  function godpiaUrl(ref) {
    if (!ref) return GODPIA_BASE;
    const m = String(ref).replace(/\s+/g, " ").trim().match(/([가-힣]+)\s*(\d+)\s*[:：]/);
    if (!m) return GODPIA_BASE;
    const code = GODPIA_VOL[m[1]];
    return code ? `${GODPIA_BASE}?vol=${code}&chap=${m[2]}` : GODPIA_BASE;
  }

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
  // 날짜 문자열 → 비교용 숫자(YYYYMMDD). 미래 QT 숨김에 사용
  function dateNum(s) {
    const m = String(s).match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return m ? Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]) : 0;
  }
  function todayNum() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
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

    // '말씀 듣기' 버튼 → 오늘(또는 최근) 본문이 재생되는 갓피아 페이지로 연결
    const listenBtn = document.querySelector(".qt-listen-btn");
    if (listenBtn) {
      listenBtn.href = godpiaUrl(entry.ref);
      const note = document.querySelector(".qt-listen-note");
      if (note) {
        note.textContent = entry.ref
          ? `갓피아(GODpia)에서 ‘${entry.ref}’ 말씀을 들어요`
          : "갓피아(GODpia) 성경 듣기로 이동합니다";
      }
    }
  }

  const escQt = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // QT 본문(시트 텍스트)을 제목·본문·섹션으로 구조화
  function parseQt(raw) {
    const lines = (raw || "").split("\n").map((s) => s.replace(/\s+$/g, ""));
    let date = "", title = "", ref = "";
    const sections = []; let cur = null;
    for (const ln of lines) {
      const t = ln.trim();
      if (!t) { if (cur) cur.body.push(""); continue; }
      if (/^📖/.test(t) && /(샬롬|오늘의\s*QT)/.test(t)) continue;           // 인사말 제거
      const dm = t.match(/^📅\s*날짜\s*[:：]?\s*(.+)$/);
      if (dm) { date = dm[1].trim(); continue; }                             // 날짜(한 번만)
      const hm = t.match(/^(?:📖|📝|🙏|💡|✏️|🕊️|✨|🌱|📌|✝️?)\s*(.+)$/);  // 섹션 헤더
      if (hm) { cur = { head: hm[1].trim(), body: [] }; sections.push(cur); continue; }
      if (!cur) {
        if (!title) { title = t; continue; }
        if (!ref && /\d/.test(t) && /[:：~∼\-장절,\s]/.test(t) && t.length <= 32) { ref = t; continue; }
        title += " " + t; continue;
      }
      cur.body.push(t);
    }
    return { date, title, ref, sections };
  }

  function qtParas(lines) {
    const out = []; let buf = [];
    for (const l of lines) { if (l === "") { if (buf.length) { out.push(buf.join("\n")); buf = []; } } else buf.push(l); }
    if (buf.length) out.push(buf.join("\n"));
    return out;
  }

  function buildDateList(activeDate) {
    dateListEl.innerHTML = entries
      .map((e) => `<button class="qt-dl-item${e.date === activeDate ? " active" : ""}" data-date="${e.date}">${e.date}</button>`)
      .join("");
  }

  function showDetail(date) {
    const e = entries.find((x) => x.date === date);
    if (!e) return;
    const p = parseQt(e.content);
    const secHtml = p.sections.map((s) => `
      <h4 class="qt-d-head">${escQt(s.head)}</h4>
      <div class="qt-d-sec">${qtParas(s.body).map((par) => `<p>${escQt(par)}</p>`).join("")}</div>`).join("");
    detailEl.innerHTML = `
      <div class="qt-d-top">
        <span class="qt-d-date">${escQt(p.date || e.date)}</span>
        ${p.title ? `<h3 class="qt-d-title">${escQt(p.title)}</h3>` : ""}
        ${p.ref ? `<p class="qt-d-ref">${escQt(p.ref)}</p>` : ""}
        ${p.ref ? `<a class="qt-d-listen" href="${godpiaUrl(p.ref)}" target="_blank" rel="noopener noreferrer">🎧 이 본문 듣기</a>` : ""}
      </div>
      ${secHtml || `<div class="qt-d-sec"><p>${escQt(e.content)}</p></div>`}`;
    const items = [...dateListEl.querySelectorAll(".qt-dl-item")];
    items.forEach((b) => b.classList.toggle("active", b.dataset.date === date));
    const act = dateListEl.querySelector(".qt-dl-item.active");
    if (act && act.scrollIntoView) act.scrollIntoView({ inline: "center", block: "nearest" });
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

  function afterEntries() {
    entries = entries
      .filter((e) => e.date && e.content)
      .filter((e) => dateNum(e.date) <= todayNum())
      .map((e) => ({ ...e, ...digest(e.content) }));
    entries.sort((a, b) => (a.date < b.date ? 1 : -1));
    renderToday();
    const wantOpen =
      location.hash === "#qt-open" ||
      new URLSearchParams(location.search).get("qt") === "open";
    if (wantOpen && entries.length) {
      const ts = todayStr();
      openModal(entries.find((e) => e.date === ts) ? ts : entries[0].date);
    }
  }

  // 1) Supabase qt_published 우선 → 2) 비어 있으면 구글 시트 백업
  loadQtFromSupabase().then((sb) => {
    if (sb && sb.length) { entries = sb; afterEntries(); return; }
    return fetch(SHEET_CSV)
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
          .map((r) => ({ date: (r[dIdx] || "").trim(), content: (r[cIdx] || "").replace(/\r\n?/g, "\n").trim() }));
        afterEntries();
      });
  }).catch(() => {
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

  // 기기 판별: iOS(아이폰·아이패드)는 프로그램 설치 미지원 → 안내만 가능
  const ua = window.navigator.userAgent;
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    // 아이패드OS 사파리는 UA가 'Macintosh'로 보고됨 → 터치 지원으로 보정
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isIOSNonSafari = isIOS && /crios|fxios|edgios|naver|kakaotalk|daum/i.test(ua);

  // 안드로이드/크롬·엣지(데스크톱): 설치 프롬프트 가로채기
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    msg.textContent = "홈 화면에 추가하여 앱처럼 사용하세요.";
    goBtn.textContent = "설치";
    goBtn.hidden = false;
    bar.hidden = false;
  });

  goBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      bar.hidden = true;
    } else if (isIOS) {
      showIosGuide(); // iOS는 설치 API가 없으므로 수동 추가 방법을 안내
    }
  });

  closeBtn.addEventListener("click", () => {
    bar.hidden = true;
    localStorage.setItem("installDismissed", "1");
  });

  // iOS: beforeinstallprompt 미지원 → '방법' 버튼으로 안내 모달 제공
  if (isIOS && !isStandalone) {
    msg.textContent = isIOSNonSafari
      ? "Safari에서 ‘홈 화면에 추가’로 설치할 수 있어요."
      : "공유 → ‘홈 화면에 추가’로 설치하세요.";
    goBtn.textContent = "방법 보기";
    goBtn.hidden = false;
    bar.hidden = false;
  }

  function showIosGuide() {
    let m = document.getElementById("iosGuideModal");
    if (!m) {
      const shareSvg =
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#032257" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M8.5 7.5 12 4l3.5 3.5"/><rect x="5" y="11" width="14" height="9" rx="2"/></svg>';
      const safariSteps =
        '<li><span class="ios-step-no">1</span><div>화면 아래(아이패드는 위)의 <b>공유 버튼</b> <span class="ios-share">' + shareSvg + '</span> 을 누릅니다.</div></li>' +
        '<li><span class="ios-step-no">2</span><div>메뉴를 내려 <b>‘홈 화면에 추가’</b> 를 누릅니다.</div></li>' +
        '<li><span class="ios-step-no">3</span><div>오른쪽 위 <b>‘추가’</b> 를 누르면 홈 화면에 운평교회 앱이 생깁니다.</div></li>';
      const note = isIOSNonSafari
        ? '<p class="ios-note">※ 지금 브라우저(크롬 등)에서는 설치가 제한될 수 있어요. <b>Safari</b>로 <b>k-logos.com</b>을 연 뒤 위 방법으로 진행해 주세요.</p>'
        : '<p class="ios-note">※ 아이폰·아이패드는 이렇게 ‘홈 화면에 추가’ 방식으로만 앱을 설치할 수 있어요(애플 정책).</p>';
      m = document.createElement("div");
      m.id = "iosGuideModal";
      m.className = "modal";
      m.hidden = true;
      m.innerHTML =
        '<div class="modal-backdrop" data-iclose></div>' +
        '<div class="modal-box modal-box-ios" role="dialog" aria-modal="true" aria-label="앱 설치 방법">' +
          '<button class="modal-close" data-iclose aria-label="닫기">&times;</button>' +
          '<div class="ios-guide">' +
            '<img src="images/icon-192.png?v=20260629a" class="ios-guide-icon" alt="" />' +
            '<h3>홈 화면에 앱 추가하기</h3>' +
            '<p class="ios-guide-sub">아이폰·아이패드는 아래 방법으로 설치합니다.</p>' +
            '<ol class="ios-steps">' + safariSteps + '</ol>' +
            note +
          '</div>' +
        '</div>';
      document.body.appendChild(m);
      m.addEventListener("click", (e) => { if (e.target.hasAttribute("data-iclose")) m.hidden = true; });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !m.hidden) m.hidden = true; });
    }
    m.hidden = false;
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
  newcomerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(newcomerForm);
    const name = (fd.get("name") || "").trim();
    const phone = (fd.get("phone") || "").trim();
    if (!name || !phone) { alert("이름과 연락처를 입력해 주세요."); return; }
    const to = window.FORMSUBMIT_EMAIL;
    if (!to) { alert("접수 이메일이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요."); return; }
    const btn = newcomerForm.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = "보내는 중…"; }
    try {
      const res = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: "[운평장로교회] 새가족 등록 신청",
          _template: "table",
          _captcha: "false",
          이름: name,
          연락처: phone,
          방문예정일: (fd.get("visit") || "").trim() || "-",
          함께오는가족: (fd.get("family") || "").trim() || "-",
          남기실말씀: (fd.get("message") || "").trim() || "-",
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (j && (j.success === "true" || j.success === true)) {
        newcomerForm.innerHTML = '<div style="text-align:center;padding:24px 0;"><p style="font-size:1.1rem;font-weight:600;color:var(--accent);">등록 신청이 접수되었습니다 🙏</p><p style="color:var(--ink-soft);margin-top:8px;">새가족 담당자가 따뜻하게 연락드리겠습니다.</p></div>';
      } else {
        throw new Error((j && j.message) || "전송에 실패했습니다");
      }
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = "등록 신청"; }
      alert("전송 오류: " + err.message + "\n잠시 후 다시 시도해 주세요.");
    }
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

// ===== 5-5. 히어로 제목 회전 + 점 인디케이터 + 손가락 스와이프 =====
(function () {
  const rot = document.getElementById("heroRotator");
  if (!rot) return;
  const slides = [...rot.querySelectorAll(".hero-slide")];
  if (slides.length < 2) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dotsBox = document.getElementById("heroDots");
  let i = 0, timer = null;

  // 점(바) 생성
  let dots = [];
  if (dotsBox) {
    dotsBox.innerHTML = slides
      .map((_, n) => `<button type="button" class="hero-dot${n === 0 ? " active" : ""}" aria-label="${n + 1}번째 슬라이드"></button>`)
      .join("");
    dots = [...dotsBox.querySelectorAll(".hero-dot")];
  }

  function go(n) {
    slides[i].classList.remove("is-active");
    if (dots[i]) dots[i].classList.remove("active");
    i = (n + slides.length) % slides.length;
    slides[i].classList.add("is-active");
    if (dots[i]) dots[i].classList.add("active");
  }
  function start() { stop(); if (!reduce) timer = setInterval(() => go(i + 1), 5200); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  dots.forEach((d, n) => d.addEventListener("click", () => { go(n); start(); }));

  // 손가락 스와이프(좌/우)
  let x0 = null;
  const surface = rot.closest(".hero") || rot;
  surface.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  surface.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) { go(dx < 0 ? i + 1 : i - 1); start(); }
    x0 = null;
  }, { passive: true });

  start();
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

// ===== 5-7. 지도 모달 (선교지 등 주소 카드 클릭 시) =====
(function () {
  const modal = document.getElementById("mapModal");
  if (!modal) return;
  const frame = document.getElementById("mapFrame");
  const titleEl = document.getElementById("mapTitle");
  const addrEl = document.getElementById("mapAddr");
  const kakao = document.getElementById("mapKakao");
  function openMap(name, addr) {
    titleEl.textContent = name || "지도";
    addrEl.textContent = addr;
    frame.src = "https://www.google.com/maps?q=" + encodeURIComponent(addr) + "&hl=ko&z=15&output=embed";
    kakao.href = "https://map.kakao.com/?q=" + encodeURIComponent(addr);
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeMap() { modal.hidden = true; document.body.style.overflow = ""; frame.src = "about:blank"; }
  document.querySelectorAll("[data-map]").forEach((el) => {
    el.addEventListener("click", () => openMap(el.dataset.name, el.dataset.map));
  });
  modal.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeMap(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeMap(); });
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

// ===== 7. 김동석 목사 저서 — 책 미리보기 모달 =====
(function () {
  const modal = document.getElementById("bookModal");
  if (!modal) return;
  const box = modal.querySelector(".book-read");
  const openers = [
    document.getElementById("bookPreviewOpen"),
    document.getElementById("bookPreviewOpen2"),
  ].filter(Boolean);

  function open() {
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (box) box.scrollTop = 0;
  }
  function close() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  openers.forEach((el) => {
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
  modal.addEventListener("click", (e) => { if (e.target.hasAttribute("data-bclose")) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) close(); });
})();
