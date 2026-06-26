/* ============================================================
   운평장로교회 — 양육 자료실 (Supabase Storage + resources 테이블)
   - 카테고리 카드(아코디언): 클릭하면 펼쳐짐
   - 로그인 교인: 목록·다운로드 / 관리자: 드래그&드롭 업로드·삭제
   - 파일은 영문 안전키로 저장, 한글 원본명은 resources 테이블에 보관
   ============================================================ */
(function () {
  const area = document.getElementById("resourceArea");
  if (!area) return;
  const BUCKET = "resources";
  const CATEGORIES = [
    { id: "newcomer", label: "새가족" },
    { id: "nurture", label: "양육반" },
    { id: "discipleship", label: "제자훈련" },
    { id: "sunday-school", label: "주일학교" },
    { id: "middle", label: "중등부" },
    { id: "youth", label: "청년부" },
    { id: "faith-edu", label: "신앙교육" },
  ];

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    area.innerHTML = '<p class="placeholder-note">로그인 기능 연결 후 이용할 수 있습니다.</p>';
    return;
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtSize = (n) => { if (!n && n !== 0) return ""; if (n < 1024) return n + " B"; if (n < 1048576) return (n / 1024).toFixed(0) + " KB"; return (n / 1048576).toFixed(1) + " MB"; };
  const icon = (name) => {
    const e = (name.split(".").pop() || "").toLowerCase();
    if (e === "pdf") return "📕";
    if (["hwp", "hwpx"].includes(e)) return "📄";
    if (["doc", "docx"].includes(e)) return "📘";
    if (["xls", "xlsx", "csv"].includes(e)) return "📊";
    if (["ppt", "pptx"].includes(e)) return "📙";
    if (["png", "jpg", "jpeg", "gif", "webp"].includes(e)) return "🖼️";
    if (["zip", "7z", "rar"].includes(e)) return "🗜️";
    return "📎";
  };

  function localSession() {
    try {
      const ref = new URL(window.SUPABASE_URL).hostname.split(".")[0];
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.currentSession ? s.currentSession : s;
    } catch (e) { return null; }
  }
  function currentUser() { const s = localSession(); return (s && s.user) || null; }
  function token() { const s = localSession(); return s && s.access_token; }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("서버 응답이 지연됩니다")), ms))]);
  function authHeaders(extra) {
    const h = { apikey: window.SUPABASE_ANON_KEY };
    const t = token(); if (t) h.Authorization = "Bearer " + t;
    if (extra) Object.assign(h, extra);
    return h;
  }
  async function jsonFetch(url, opts, ms) {
    const res = await withTimeout(fetch(url, opts), ms || 10000);
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!res.ok) { const m = (data && (data.message || data.error || data.msg || data.hint)) || ("HTTP " + res.status); const err = new Error(m); err.status = res.status; throw err; }
    return data;
  }

  // ── 데이터 접근 ──
  async function isAdminUser(uid) {
    try { const r = await jsonFetch(window.SUPABASE_URL + "/rest/v1/admins?uid=eq." + uid + "&select=uid", { headers: authHeaders() }, 8000); return Array.isArray(r) && r.length > 0; }
    catch (e) { return false; }
  }
  async function listRows() {
    return jsonFetch(window.SUPABASE_URL + "/rest/v1/resources?select=*&order=created_at.desc", { headers: authHeaders() }, 9000);
  }
  function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }
  async function signedUrl(path, title) {
    const d = await jsonFetch(window.SUPABASE_URL + "/storage/v1/object/sign/" + BUCKET + "/" + encPath(path), {
      method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: 3600 }),
    }, 10000);
    return window.SUPABASE_URL + "/storage/v1" + d.signedURL + "&download=" + encodeURIComponent(title || "");
  }
  async function uploadOne(catId, file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = catId + "/" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + (ext ? "." + ext : "");
    const res = await withTimeout(fetch(window.SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + encPath(key), {
      method: "POST", headers: authHeaders({ "x-upsert": "true", "Content-Type": file.type || "application/octet-stream" }), body: file,
    }, 120000), 121000);
    if (!res.ok) { let m = "HTTP " + res.status; try { const j = JSON.parse(await res.text()); m = j.message || j.error || m; } catch (e) {} throw new Error(m); }
    await jsonFetch(window.SUPABASE_URL + "/rest/v1/resources", {
      method: "POST", headers: authHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify({ category: catId, title: file.name, path: key, size: file.size }),
    }, 10000);
  }
  async function deleteRow(row) {
    try { await withTimeout(fetch(window.SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + encPath(row.path), { method: "DELETE", headers: authHeaders() }), 10000); } catch (e) {}
    await jsonFetch(window.SUPABASE_URL + "/rest/v1/resources?id=eq." + row.id, { method: "DELETE", headers: authHeaders({ Prefer: "return=minimal" }) }, 10000);
  }

  function loginPrompt() {
    area.innerHTML = `<div class="member-lock"><div class="lock-icon">🔒</div><h3>회원 전용 자료실</h3>
      <p>로그인한 등록 교인만 자료를 보고 내려받을 수 있습니다.</p>
      <button type="button" class="btn btn-line" id="resLogin" style="margin-top:12px;">로그인</button></div>`;
    const b = document.getElementById("resLogin");
    if (b) b.addEventListener("click", () => { const m = document.getElementById("authModal"); if (m) { m.hidden = false; document.body.style.overflow = "hidden"; } });
  }

  let admin = false;

  function fileRowHTML(row) {
    return `<div class="resource-item" data-id="${row.id}">
      <span class="ri-name">${icon(row.title)} ${esc(row.title)}${row.size ? ` <small style="color:var(--ink-soft);font-weight:400;">· ${fmtSize(row.size)}</small>` : ""}</span>
      <span style="display:flex;gap:8px;align-items:center;">
        <button type="button" class="ri-go res-dl" style="background:none;border:0;cursor:pointer;font:inherit;">다운로드 ↓</button>
        ${admin ? `<button type="button" class="btn res-del" style="padding:4px 12px;font-size:.8rem;background:#c0392b;color:#fff;border:0;">삭제</button>` : ""}
      </span>
    </div>`;
  }

  function render(rows) {
    const byCat = {};
    CATEGORIES.forEach((c) => (byCat[c.id] = []));
    (rows || []).forEach((r) => { if (byCat[r.category]) byCat[r.category].push(r); else (byCat[r.category] = [r]); });

    area.innerHTML = `<div class="res-cats">` + CATEGORIES.map((c) => {
      const items = byCat[c.id] || [];
      const filesHTML = items.length ? `<div class="resource-list">${items.map(fileRowHTML).join("")}</div>` : `<p class="placeholder-note" style="margin:0;">등록된 자료가 없습니다.</p>`;
      const dropHTML = admin ? `
        <div class="res-drop" data-cat="${c.id}">
          <p>📁 파일을 여기로 끌어다 놓거나 <button type="button" class="res-pick btn btn-line" style="padding:5px 14px;font-size:.85rem;">파일 선택</button></p>
          <input type="file" class="res-input" multiple hidden />
          <span class="res-upmsg"></span>
        </div>` : "";
      return `<div class="res-cat" data-cat="${c.id}">
        <button type="button" class="res-cat-head">
          <span class="rc-label">${c.label}</span>
          <span class="rc-right"><span class="rc-count">${items.length}</span><span class="rc-chevron">▾</span></span>
        </button>
        <div class="res-cat-body" hidden>${dropHTML}${filesHTML}</div>
      </div>`;
    }).join("") + `</div>`;

    // 아코디언 토글
    area.querySelectorAll(".res-cat").forEach((card) => {
      const head = card.querySelector(".res-cat-head");
      const body = card.querySelector(".res-cat-body");
      head.addEventListener("click", () => { card.classList.toggle("open"); body.hidden = !body.hidden; });
    });

    // 다운로드 / 삭제
    area.querySelectorAll(".resource-item").forEach((el) => {
      const id = el.getAttribute("data-id");
      const row = (rows || []).find((r) => String(r.id) === String(id));
      const dl = el.querySelector(".res-dl");
      const del = el.querySelector(".res-del");
      if (dl && row) dl.addEventListener("click", async () => {
        const old = dl.textContent; dl.textContent = "준비 중…"; dl.disabled = true;
        try { window.open(await signedUrl(row.path, row.title), "_blank"); } catch (e) { alert("다운로드 오류: " + e.message); }
        dl.textContent = old; dl.disabled = false;
      });
      if (del && row) del.addEventListener("click", async () => {
        if (!confirm(`‘${row.title}’ 자료를 삭제할까요?`)) return;
        del.disabled = true;
        try { await deleteRow(row); load(); } catch (e) { del.disabled = false; alert("삭제 오류: " + e.message); }
      });
    });

    // 업로드(드래그&드롭 + 선택)
    if (admin) area.querySelectorAll(".res-drop").forEach((zone) => {
      const cat = zone.getAttribute("data-cat");
      const input = zone.querySelector(".res-input");
      const pick = zone.querySelector(".res-pick");
      const msg = zone.querySelector(".res-upmsg");
      const handle = async (files) => {
        const arr = Array.from(files || []);
        if (!arr.length) return;
        for (const f of arr) {
          msg.textContent = `‘${f.name}’ 업로드 중…`; msg.style.color = "var(--ink-soft)";
          try { await uploadOne(cat, f); } catch (e) { msg.textContent = "업로드 오류: " + e.message; msg.style.color = "#c0392b"; return; }
        }
        msg.textContent = "업로드 완료 ✓"; msg.style.color = "var(--accent)";
        load();
      };
      pick.addEventListener("click", () => input.click());
      input.addEventListener("change", () => handle(input.files));
      ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
      ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "dragleave" && zone.contains(e.relatedTarget)) return; zone.classList.remove("drag"); }));
      zone.addEventListener("drop", (e) => { if (e.dataTransfer && e.dataTransfer.files) handle(e.dataTransfer.files); });
    });
  }

  async function load() {
    const me = currentUser();
    if (!me || !me.id) { loginPrompt(); return; }
    area.innerHTML = '<p class="qt-loading">불러오는 중…</p>';
    admin = await isAdminUser(me.id);
    try {
      const rows = await listRows();
      render(rows);
    } catch (e) {
      if (/resources|relation|does not exist|schema cache|404/i.test(e.message) || e.status === 404) {
        area.innerHTML = `<p class="placeholder-note">자료실이 아직 준비되지 않았습니다. (관리자가 Supabase에서 resources 테이블·버킷을 생성하면 이용 가능합니다.)</p>`;
      } else {
        area.innerHTML = `<p class="qt-loading">불러오기 오류: ${esc(e.message)}</p>`;
      }
    }
  }

  load();
})();
