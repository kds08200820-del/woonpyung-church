/* ============================================================
   운평장로교회 — 구제선교위원회 (mission.html)
   1) 회원: 회기(회계연도) 안에 선교헌금을 1회 이상 낸 사람
        rpc mission_committee — 금액은 받지 않는다. 공개 범위는 서버가 지킨다.
   2) 연간 사역 게시판: public.mission_posts (누구나 보기, 글쓰기는 관리자)
   3) 후원하는 교회와 기관: public.mission_partners (누구나 보기, 고치기는 관리자)
   SQL: supabase/20261110_1900_mission_committee.sql
   SQL 을 아직 실행하지 않은 곳에서는 기본 화면(회원 기준 글, 기본 후원 교회 목록)만 보이고
   쓰기 단추는 나오지 않는다.
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const boxMember = $("msMember"), boxBoard = $("msBoard"), boxPartners = $("msPartners");
  if (!boxMember && !boxBoard && !boxPartners) return;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, "<br>");
  const dot = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}.${m[2]}.${m[3]}` : ""; };
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");

  function ready() { return !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY); }
  function localSession() {
    try {
      const ref = new URL(window.SUPABASE_URL).hostname.split(".")[0];
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.currentSession ? s.currentSession : s;
    } catch (e) { return null; }
  }
  const currentUser = () => { const s = localSession(); return (s && s.user) || null; };
  const displayName = (u) => (u && u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name)) || (u && u.email ? u.email.split("@")[0] : "관리자");
  async function api(method, path, body, extra) {
    const sess = localSession();
    const headers = { apikey: window.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (sess && sess.access_token) headers.Authorization = "Bearer " + sess.access_token;
    if (extra) Object.assign(headers, extra);
    const res = await fetch(window.SUPABASE_URL + "/rest/v1/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!res.ok) { const m = (data && (data.message || data.error)) || ("HTTP " + res.status); const e = new Error(m); e.status = res.status; throw e; }
    return data;
  }
  let _admin = null;
  async function isAdmin() {
    if (_admin !== null) return _admin;
    const me = currentUser();
    if (!me || !me.id || !ready()) { _admin = false; return false; }
    try { const r = await api("GET", `admins?uid=eq.${me.id}&select=uid`); _admin = Array.isArray(r) && r.length > 0; }
    catch (e) { _admin = false; }
    return _admin;
  }

  // 회기 연도 — 서버 답이 없을 때 쓰는 기본 규칙(12월 시작, 끝나는 해로 부른다). 서버 답이 오면 그 값을 쓴다.
  function guessFY() { const d = new Date(); return d.getMonth() + 1 >= 12 ? d.getFullYear() + 1 : d.getFullYear(); }
  function guessRange(y) { return { from: `${y - 1}-12-01`, to: `${y}-11-30` }; }

  const S = {
    admin: false,
    fy: guessFY(),          // 지금 회기
    mem: null,              // rpc mission_committee 답 (없으면 null)
    posts: null,            // null = 표 없음(SQL 실행 전), [] = 글 없음
    partners: null,
    year: null,             // 게시판에서 고른 회기
  };

  /* ───────── 1) 회원 ───────── */
  const VIS = [
    ["count", "회원 수는 누구나, 명단은 관리자·재정 담당만"],
    ["names", "회원 수는 누구나, 이름은 교적에 연결된 성도(로그인)에게"],
    ["admin", "회원 수와 명단 모두 관리자·재정 담당만"],
  ];
  function renderMember() {
    if (!boxMember) return;
    const m = S.mem;
    const y = m ? m.year : S.fy;
    const r = m ? { from: m.from, to: m.to } : guessRange(y);
    let h = `<p class="ms-member-term">${esc(y)}년도 회기 · ${esc(dot(r.from))} ~ ${esc(dot(r.to))}</p>`;
    if (m && m.count != null) h += `<p class="ms-member-count">회원<b>${esc(m.count)}</b>명</p>`;
    h += `<p class="ms-member-rule">이 회기 안에 선교헌금을 한 번 이상 드린 성도가 회원입니다. 헌금 금액과 내역은 이 화면에 나오지 않습니다.</p>`;
    if (m && m.me === true) h += `<p class="ms-member-me">${esc(y)}년도 회기 구제선교위원회 회원이십니다.</p>`;
    else if (m && m.me === false && !m.staff) h += `<p class="ms-member-me">이 회기에 드린 선교헌금 기록이 아직 없습니다.</p>`;

    if (m && Array.isArray(m.detail)) {
      h += `<div class="ms-names"><h4>회원 명단 (관리자·재정 담당에게만 보입니다)</h4>
        <p class="ms-names-note">점선 테두리는 교적에 연결되지 않아 헌금자 이름으로 센 분입니다.</p>
        ${m.detail.length ? `<ul class="ms-name-list">${m.detail.map((d) => `<li class="${d.linked ? "" : "unlinked"}">${esc(d.name)}</li>`).join("")}</ul>` : `<p class="ms-empty">이 회기에 선교헌금을 드린 분이 아직 없습니다.</p>`}
      </div>`;
    } else if (m && Array.isArray(m.names)) {
      h += `<div class="ms-names"><h4>회원 명단</h4>
        ${m.names.length ? `<ul class="ms-name-list">${m.names.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : `<p class="ms-empty">이 회기 회원이 아직 없습니다.</p>`}
      </div>`;
    }
    if (m && S.admin) {
      h += `<div class="ms-vis"><label for="msVis">회원 공개 범위</label>
        <select id="msVis">${VIS.map((v) => `<option value="${v[0]}"${m.visibility === v[0] ? " selected" : ""}>${esc(v[1])}</option>`).join("")}</select>
        <span class="ms-vis-status" id="msVisSt"></span></div>`;
    }
    boxMember.innerHTML = h;
    const sel = $("msVis");
    if (sel) sel.addEventListener("change", async () => {
      const st = $("msVisSt"); sel.disabled = true; st.textContent = "저장 중…";
      try { await api("POST", "rpc/mission_set_visibility", { p_visibility: sel.value }); await loadMember(); renderMember(); const s2 = $("msVisSt"); if (s2) s2.textContent = "저장했습니다."; }
      catch (e) { sel.disabled = false; st.textContent = "저장하지 못했습니다: " + e.message; }
    });
  }
  async function loadMember() {
    if (!ready()) { S.mem = null; return; }
    try { const r = await api("POST", "rpc/mission_committee", {}); S.mem = (r && typeof r === "object" && r.year) ? r : null; if (S.mem) S.fy = S.mem.year; }
    catch (e) { S.mem = null; }   // SQL 실행 전 → 기준 글만 보인다
  }

  /* ───────── 2) 연간 사역 게시판 ───────── */
  function years() {
    const set = {}; set[S.fy] = 1;
    (S.posts || []).forEach((p) => { set[p.fy_year] = 1; });
    return Object.keys(set).map(Number).sort((a, b) => b - a);
  }
  function termOf(y) {
    if (S.mem && S.mem.year && S.mem.from && S.mem.to) {
      const d = y - S.mem.year, sh = (iso) => (Number(iso.slice(0, 4)) + d) + iso.slice(4);
      const to = sh(S.mem.to);
      // 2월 말일로 끝나는 회기만 윤년 보정이 필요하다
      if (to.slice(5) === "02-28" || to.slice(5) === "02-29") { const yy = Number(to.slice(0, 4)); return { from: sh(S.mem.from), to: `${yy}-02-${new Date(yy, 2, 0).getDate()}` }; }
      return { from: sh(S.mem.from), to };
    }
    return guessRange(y);
  }
  function renderBoard() {
    if (!boxBoard) return;
    if (S.posts === null) { boxBoard.innerHTML = `<p class="ms-empty">연간 사역 게시판은 준비 중입니다.</p>`; return; }
    const ys = years();
    if (S.year == null || ys.indexOf(S.year) < 0) S.year = ys[0];
    const t = termOf(S.year);
    const list = S.posts.filter((p) => p.fy_year === S.year)
      .sort((a, b) => String(a.event_date || a.created_at).localeCompare(String(b.event_date || b.created_at)));
    let h = `<div class="ms-bar"><div class="ms-years">${ys.map((y) => `<button type="button" class="ms-year${y === S.year ? " on" : ""}" data-y="${y}">${y}년도</button>`).join("")}</div>
      ${S.admin ? `<button type="button" class="btn btn-solid nt-write" id="msWrite">사역 글 쓰기</button>` : ""}</div>
      <p class="ms-term">${S.year}년도 회기 · ${esc(dot(t.from))} ~ ${esc(dot(t.to))}</p>`;
    if (!list.length) h += `<p class="ms-empty">이 회기에 올린 사역이 아직 없습니다.</p>`;
    else h += `<div class="ms-posts">` + list.map((p) => `
      <article class="ms-post${p.hidden ? " is-hidden" : ""}">
        <header class="ms-post-head">
          <h4>${esc(p.title)}${p.hidden ? `<span class="ms-tag-hidden">숨김</span>` : ""}</h4>
          ${p.event_date ? `<span class="ms-post-date">${esc(dot(p.event_date))}</span>` : ""}
        </header>
        ${p.body && p.body.trim() ? `<div class="ms-post-body">${nl2br(p.body)}</div>` : ""}
        ${S.admin ? `<div class="ms-post-meta"><span>${esc(p.author_name || "")}</span>
          <button type="button" class="ms-link" data-pedit="${p.id}">수정</button>
          <button type="button" class="ms-link" data-phide="${p.id}">${p.hidden ? "다시 보이기" : "숨기기"}</button></div>` : ""}
      </article>`).join("") + `</div>`;
    boxBoard.innerHTML = h;
    boxBoard.querySelectorAll(".ms-year").forEach((b) => b.addEventListener("click", () => { S.year = Number(b.dataset.y); renderBoard(); }));
    const w = $("msWrite"); if (w) w.addEventListener("click", () => openPost(null));
    boxBoard.querySelectorAll("[data-pedit]").forEach((b) => b.addEventListener("click", () => { const p = S.posts.find((x) => String(x.id) === b.dataset.pedit); if (p) openPost(p); }));
    boxBoard.querySelectorAll("[data-phide]").forEach((b) => b.addEventListener("click", async () => {
      const p = S.posts.find((x) => String(x.id) === b.dataset.phide); if (!p) return;
      if (!p.hidden && !confirm("이 글을 숨길까요? 관리자에게만 보이고, 다시 보이게 할 수 있습니다.")) return;
      b.disabled = true;
      try { await api("PATCH", `mission_posts?id=eq.${p.id}`, { hidden: !p.hidden, updated_at: new Date().toISOString() }, { Prefer: "return=minimal" }); await loadPosts(); renderBoard(); }
      catch (e) { b.disabled = false; alert("저장하지 못했습니다: " + e.message); }
    }));
  }
  async function loadPosts() {
    if (!ready()) { S.posts = null; return; }
    try { const r = await api("GET", "mission_posts?select=*&order=fy_year.desc,event_date.asc.nullslast,created_at.asc&limit=500"); S.posts = Array.isArray(r) ? r : []; }
    catch (e) { S.posts = null; }
  }

  /* ───────── 3) 후원하는 교회와 기관 ───────── */
  function partnerCard(p) {
    const url = safeUrl(p.url);
    let go = "";
    if (p.address) go += `<button type="button" class="m-go" data-msmap="${esc(p.address)}" data-name="${esc(p.name)}">지도 보기 →</button>`;
    if (url) go += `${p.address ? " &nbsp; " : ""}<a class="m-go" href="${esc(url)}" target="_blank" rel="noopener">홈페이지 보기 →</a>`;
    return `<div class="mission-card ms-partner${p.active === false ? " is-hidden" : ""}">
      <h4>${esc(p.name)}${p.active === false ? `<span class="ms-tag-hidden">숨김</span>` : ""}</h4>
      ${p.summary ? `<p class="m-region">${esc(p.summary)}</p>` : ""}
      ${p.person ? `<p class="m-name">${esc(p.person)}</p>` : ""}
      ${go}
      ${S.admin ? `<div class="ms-partner-admin"><button type="button" class="ms-link" data-redit="${p.id}">수정</button>
        <button type="button" class="ms-link" data-rhide="${p.id}">${p.active === false ? "다시 보이기" : "숨기기"}</button></div>` : ""}
    </div>`;
  }
  function renderPartners() {
    if (!boxPartners) return;
    if (S.partners === null) return;    // 표 없음 → HTML 에 적어 둔 기본 목록 그대로
    const sorted = S.partners.slice().sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
    let h = S.admin ? `<div class="nt-adminbar"><button type="button" class="btn btn-solid nt-write" id="msAddPartner">후원처 추가</button></div>` : "";
    ["교회", "기관"].forEach((k) => {
      const list = sorted.filter((p) => p.kind === k);
      if (!list.length) return;
      h += `<h3 class="ms-kind">${k}</h3><div class="mission-grid">${list.map(partnerCard).join("")}</div>`;
    });
    if (!sorted.length) h += `<p class="ms-empty">등록한 후원처가 아직 없습니다.</p>`;
    boxPartners.innerHTML = h;
    const a = $("msAddPartner"); if (a) a.addEventListener("click", () => openPartner(null));
    boxPartners.querySelectorAll("[data-redit]").forEach((b) => b.addEventListener("click", () => { const p = S.partners.find((x) => String(x.id) === b.dataset.redit); if (p) openPartner(p); }));
    boxPartners.querySelectorAll("[data-rhide]").forEach((b) => b.addEventListener("click", async () => {
      const p = S.partners.find((x) => String(x.id) === b.dataset.rhide); if (!p) return;
      if (p.active !== false && !confirm(`「${p.name}」을(를) 목록에서 숨길까요? 관리자에게만 보이고, 다시 보이게 할 수 있습니다.`)) return;
      b.disabled = true;
      try { await api("PATCH", `mission_partners?id=eq.${p.id}`, { active: p.active === false, updated_at: new Date().toISOString() }, { Prefer: "return=minimal" }); await loadPartners(); renderPartners(); }
      catch (e) { b.disabled = false; alert("저장하지 못했습니다: " + e.message); }
    }));
  }
  async function loadPartners() {
    if (!ready()) { S.partners = null; return; }
    try { const r = await api("GET", "mission_partners?select=*&order=sort.asc,id.asc&limit=300"); S.partners = Array.isArray(r) ? r : []; }
    catch (e) { S.partners = null; }
  }

  // 지도 — 카드가 나중에 그려지므로 여기서 연다. 닫기는 js/main.js 의 지도 모달 코드가 맡는다.
  if (boxPartners) boxPartners.addEventListener("click", (e) => {
    const b = e.target.closest("[data-msmap]"); if (!b) return;
    const modal = $("mapModal"); if (!modal) return;
    const addr = b.dataset.msmap;
    $("mapTitle").textContent = b.dataset.name || "지도";
    $("mapAddr").textContent = addr;
    $("mapFrame").src = "https://www.google.com/maps?q=" + encodeURIComponent(addr) + "&hl=ko&z=15&output=embed";
    $("mapKakao").href = "https://map.kakao.com/?q=" + encodeURIComponent(addr);
    modal.hidden = false; document.body.style.overflow = "hidden";
  });

  /* ───────── 입력 창(관리자) ───────── */
  function makeModal(label, inner) {
    const m = document.createElement("div");
    m.className = "modal"; m.hidden = true;
    m.innerHTML = `<div class="modal-backdrop" data-msclose></div>
      <div class="modal-box modal-box-notice" role="dialog" aria-modal="true" aria-label="${esc(label)}">
        <button class="modal-close" data-msclose aria-label="닫기">&times;</button>${inner}</div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (e) => { if (e.target.hasAttribute("data-msclose")) closeModal(m); });
    return m;
  }
  function openModal(m) { m.hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal(m) { m.hidden = true; document.body.style.overflow = ""; }
  document.addEventListener("keydown", (e) => { if (e.key !== "Escape") return; [postM, partnerM].forEach((m) => { if (m && !m.hidden) closeModal(m); }); });

  let postM = null, postId = null;
  function openPost(p) {
    if (!S.admin) return;
    if (!postM) {
      postM = makeModal("사역 글", `<h3 class="m-title"></h3>
        <form class="nt-form ms-form">
          <div class="ms-form-row">
            <label class="nt-f"><span>회기 연도</span><input type="number" id="mpYear" min="2000" max="2100" required /></label>
            <label class="nt-f"><span>사역한 날 <em class="ms-form-hint">(없으면 비워 둡니다)</em></span><input type="date" id="mpDate" /></label>
          </div>
          <label class="nt-f"><span>제목</span><input type="text" id="mpTitle" maxlength="200" required placeholder="예: 성탄절 이웃 돕기" /></label>
          <label class="nt-f"><span>내용</span><textarea id="mpBody" rows="7" placeholder="언제, 어디서, 누구를, 어떻게 섬겼는지 적습니다"></textarea></label>
          <button type="submit" class="btn btn-solid nt-submit"></button>
          <div class="nt-status" hidden></div>
        </form>`);
      postM.querySelector("form").addEventListener("submit", savePost);
    }
    postId = p ? p.id : null;
    postM.querySelector(".m-title").textContent = p ? "사역 글 수정" : "사역 글 쓰기";
    postM.querySelector(".nt-submit").textContent = p ? "수정 저장" : "올리기";
    postM.querySelector("#mpYear").value = p ? p.fy_year : (S.year || S.fy);
    postM.querySelector("#mpDate").value = p && p.event_date ? String(p.event_date).slice(0, 10) : "";
    postM.querySelector("#mpTitle").value = p ? p.title : "";
    postM.querySelector("#mpBody").value = p ? (p.body || "") : "";
    const st = postM.querySelector(".nt-status"); st.hidden = true; st.textContent = "";
    openModal(postM); postM.querySelector("#mpTitle").focus();
  }
  async function savePost(e) {
    e.preventDefault();
    const me = currentUser(); if (!me) { alert("로그인이 필요합니다."); return; }
    const row = {
      fy_year: Number(postM.querySelector("#mpYear").value),
      event_date: postM.querySelector("#mpDate").value || null,
      title: postM.querySelector("#mpTitle").value.trim(),
      body: postM.querySelector("#mpBody").value,
    };
    if (!row.title || !(row.fy_year >= 2000 && row.fy_year <= 2100)) return;
    const btn = postM.querySelector(".nt-submit"), st = postM.querySelector(".nt-status");
    btn.disabled = true; st.hidden = false; st.textContent = "저장 중…";
    try {
      if (postId) await api("PATCH", `mission_posts?id=eq.${postId}`, Object.assign(row, { updated_at: new Date().toISOString() }), { Prefer: "return=minimal" });
      else await api("POST", "mission_posts", Object.assign(row, { user_id: me.id, author_name: displayName(me) }), { Prefer: "return=minimal" });
      closeModal(postM); S.year = row.fy_year;
      await loadPosts(); renderBoard();
    } catch (er) { st.textContent = "저장하지 못했습니다: " + er.message; }
    btn.disabled = false;
  }

  let partnerM = null, partnerId = null;
  function openPartner(p) {
    if (!S.admin) return;
    if (!partnerM) {
      partnerM = makeModal("후원처", `<h3 class="m-title"></h3>
        <form class="nt-form ms-form">
          <div class="ms-form-row">
            <label class="nt-f"><span>구분</span><select id="mrKind"><option value="교회">교회</option><option value="기관">기관</option></select></label>
            <label class="nt-f"><span>보이는 순서 <em class="ms-form-hint">(작은 수가 앞)</em></span><input type="number" id="mrSort" min="0" max="9999" /></label>
          </div>
          <label class="nt-f"><span>이름</span><input type="text" id="mrName" maxlength="100" required /></label>
          <label class="nt-f"><span>한 줄 소개</span><input type="text" id="mrSummary" maxlength="200" placeholder="예: 제천 작은 교회" /></label>
          <label class="nt-f"><span>담당자</span><input type="text" id="mrPerson" maxlength="100" placeholder="예: ○○○ 목사" /></label>
          <label class="nt-f"><span>주소 <em class="ms-form-hint">(적으면 '지도 보기'가 생깁니다)</em></span><input type="text" id="mrAddr" maxlength="200" /></label>
          <label class="nt-f"><span>홈페이지 <em class="ms-form-hint">(https:// 로 시작)</em></span><input type="url" id="mrUrl" maxlength="300" placeholder="https://" /></label>
          <button type="submit" class="btn btn-solid nt-submit"></button>
          <div class="nt-status" hidden></div>
        </form>`);
      partnerM.querySelector("form").addEventListener("submit", savePartner);
    }
    partnerId = p ? p.id : null;
    const q = (s) => partnerM.querySelector(s);
    q(".m-title").textContent = p ? "후원처 수정" : "후원처 추가";
    q(".nt-submit").textContent = p ? "수정 저장" : "추가";
    q("#mrKind").value = p ? p.kind : "교회";
    q("#mrSort").value = p ? p.sort : (((S.partners || []).reduce((mx, x) => Math.max(mx, x.sort || 0), 0)) + 10);
    q("#mrName").value = p ? p.name : "";
    q("#mrSummary").value = p ? (p.summary || "") : "";
    q("#mrPerson").value = p ? (p.person || "") : "";
    q("#mrAddr").value = p ? (p.address || "") : "";
    q("#mrUrl").value = p ? (p.url || "") : "";
    const st = q(".nt-status"); st.hidden = true; st.textContent = "";
    openModal(partnerM); q("#mrName").focus();
  }
  async function savePartner(e) {
    e.preventDefault();
    const q = (s) => partnerM.querySelector(s);
    const row = {
      kind: q("#mrKind").value === "기관" ? "기관" : "교회",
      sort: Number(q("#mrSort").value) || 100,
      name: q("#mrName").value.trim(),
      summary: q("#mrSummary").value.trim(),
      person: q("#mrPerson").value.trim(),
      address: q("#mrAddr").value.trim(),
      url: safeUrl(q("#mrUrl").value),
    };
    if (!row.name) return;
    const btn = q(".nt-submit"), st = q(".nt-status");
    btn.disabled = true; st.hidden = false; st.textContent = "저장 중…";
    try {
      if (partnerId) await api("PATCH", `mission_partners?id=eq.${partnerId}`, Object.assign(row, { updated_at: new Date().toISOString() }), { Prefer: "return=minimal" });
      else await api("POST", "mission_partners", row, { Prefer: "return=minimal" });
      closeModal(partnerM);
      await loadPartners(); renderPartners();
    } catch (er) { st.textContent = "저장하지 못했습니다: " + er.message; }
    btn.disabled = false;
  }

  /* ───────── 시작 ───────── */
  async function refresh() {
    _admin = null;
    const r = await Promise.all([isAdmin(), loadMember(), loadPosts(), loadPartners()]);
    S.admin = !!r[0];
    renderMember(); renderBoard(); renderPartners();
  }
  renderMember();
  refresh();
  window.addEventListener("church:auth", refresh);
  window.ChurchMission = { refresh, state: S };
})();
