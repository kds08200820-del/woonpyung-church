/* ============================================================
   운평장로교회 — 양육 자료실 (Supabase Storage)
   - 로그인한 교인: 목록 보기 + 다운로드
   - 관리자: 업로드 + 삭제
   ※ getSession 잠금 회피를 위해 localStorage 토큰으로 Storage REST 직접 호출
   버킷: resources (비공개) / supabase/resources.sql 의 정책 필요
   ============================================================ */
(function () {
  const area = document.getElementById("resourceArea");
  if (!area) return;
  const BUCKET = "resources";

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    area.innerHTML = '<p class="placeholder-note">로그인 기능 연결 후 이용할 수 있습니다.</p>';
    return;
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtSize = (n) => {
    if (!n && n !== 0) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
    return (n / 1024 / 1024).toFixed(1) + " MB";
  };
  const icon = (name) => {
    const e = (name.split(".").pop() || "").toLowerCase();
    if (["pdf"].includes(e)) return "📕";
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
    const t = token();
    if (t) h.Authorization = "Bearer " + t;
    if (extra) Object.assign(h, extra);
    return h;
  }
  async function jsonFetch(url, opts, ms) {
    const res = await withTimeout(fetch(url, opts), ms || 10000);
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!res.ok) { const m = (data && (data.message || data.error || data.msg)) || ("HTTP " + res.status); const err = new Error(m); err.status = res.status; throw err; }
    return data;
  }
  // REST(테이블) — admins 확인용
  async function isAdminUser(uid) {
    try {
      const rows = await jsonFetch(window.SUPABASE_URL + "/rest/v1/admins?uid=eq." + uid + "&select=uid", { headers: authHeaders() }, 8000);
      return Array.isArray(rows) && rows.length > 0;
    } catch (e) { return false; }
  }
  async function listFiles() {
    return jsonFetch(window.SUPABASE_URL + "/storage/v1/object/list/" + BUCKET, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix: "", limit: 200, offset: 0, sortBy: { column: "name", order: "asc" } }),
    }, 10000);
  }
  async function signedUrl(name) {
    const d = await jsonFetch(window.SUPABASE_URL + "/storage/v1/object/sign/" + BUCKET + "/" + encodeURIComponent(name), {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn: 3600 }),
    }, 10000);
    // d.signedURL 은 "/object/sign/..." 상대경로
    return window.SUPABASE_URL + "/storage/v1" + d.signedURL + "&download=" + encodeURIComponent(name);
  }
  async function uploadFile(file) {
    const res = await withTimeout(fetch(window.SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + encodeURIComponent(file.name), {
      method: "POST",
      headers: authHeaders({ "x-upsert": "true", "Content-Type": file.type || "application/octet-stream" }),
      body: file,
    }, 120000), 121000);
    if (!res.ok) { let m = "HTTP " + res.status; try { const j = JSON.parse(await res.text()); m = j.message || j.error || m; } catch (e) {} throw new Error(m); }
    return true;
  }
  async function deleteFile(name) {
    return jsonFetch(window.SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + encodeURIComponent(name), { method: "DELETE", headers: authHeaders() }, 10000);
  }

  function loginPrompt() {
    area.innerHTML = `<div class="member-lock"><div class="lock-icon">🔒</div><h3>회원 전용 자료실</h3>
      <p>로그인한 등록 교인만 자료를 보고 내려받을 수 있습니다.</p>
      <button type="button" class="btn btn-line" id="resLogin" style="margin-top:12px;">로그인</button></div>`;
    const b = document.getElementById("resLogin");
    if (b) b.addEventListener("click", () => { const m = document.getElementById("authModal"); if (m) { m.hidden = false; document.body.style.overflow = "hidden"; } });
  }

  let admin = false;

  function renderList(files) {
    const items = (files || []).filter((f) => f && f.name && f.name !== ".emptyFolderPlaceholder");
    const adminBar = admin ? `
      <div class="res-upload">
        <label class="btn btn-solid" style="cursor:pointer;">
          자료 올리기<input type="file" id="resFile" multiple hidden />
        </label>
        <span class="res-upmsg" id="resUpMsg"></span>
      </div>` : "";
    const listHTML = items.length ? `<div class="resource-list">` + items.map((f) => {
      const size = f.metadata && f.metadata.size;
      return `<div class="resource-item" data-name="${esc(f.name)}">
        <span class="ri-name">${icon(f.name)} ${esc(f.name)}${size ? ` <small style="color:var(--ink-soft);font-weight:400;">· ${fmtSize(size)}</small>` : ""}</span>
        <span style="display:flex;gap:8px;align-items:center;">
          <button type="button" class="ri-go res-dl" style="background:none;border:0;cursor:pointer;font:inherit;">다운로드 ↓</button>
          ${admin ? `<button type="button" class="btn res-del" style="padding:4px 12px;font-size:.8rem;background:#c0392b;color:#fff;border:0;">삭제</button>` : ""}
        </span>
      </div>`;
    }).join("") + `</div>` : `<p class="placeholder-note">아직 등록된 자료가 없습니다.${admin ? " 위 ‘자료 올리기’로 추가해 주세요." : ""}</p>`;

    area.innerHTML = adminBar + listHTML;

    if (admin) {
      const fileInput = document.getElementById("resFile");
      const upMsg = document.getElementById("resUpMsg");
      fileInput.addEventListener("change", async () => {
        const files = Array.from(fileInput.files || []);
        if (!files.length) return;
        for (const file of files) {
          upMsg.textContent = `‘${file.name}’ 업로드 중…`;
          upMsg.style.color = "var(--ink-soft)";
          try { await uploadFile(file); }
          catch (e) { upMsg.textContent = "업로드 오류: " + e.message; upMsg.style.color = "#c0392b"; return; }
        }
        upMsg.textContent = "업로드 완료 ✓";
        upMsg.style.color = "var(--accent)";
        load();
      });
    }

    area.querySelectorAll(".resource-item").forEach((row) => {
      const name = row.getAttribute("data-name");
      const dl = row.querySelector(".res-dl");
      const del = row.querySelector(".res-del");
      if (dl) dl.addEventListener("click", async () => {
        const old = dl.textContent; dl.textContent = "준비 중…"; dl.disabled = true;
        try { const url = await signedUrl(name); window.open(url, "_blank"); }
        catch (e) { alert("다운로드 오류: " + e.message); }
        dl.textContent = old; dl.disabled = false;
      });
      if (del) del.addEventListener("click", async () => {
        if (!confirm(`‘${name}’ 자료를 삭제할까요?`)) return;
        del.disabled = true;
        try { await deleteFile(name); row.remove(); }
        catch (e) { del.disabled = false; alert("삭제 오류: " + e.message); }
      });
    });
  }

  async function load() {
    const me = currentUser();
    if (!me || !me.id) { loginPrompt(); return; }
    area.innerHTML = '<p class="qt-loading">불러오는 중…</p>';
    admin = await isAdminUser(me.id);
    try {
      const files = await listFiles();
      renderList(files);
    } catch (e) {
      if (/bucket|not found|404/i.test(e.message) || e.status === 404) {
        area.innerHTML = `<p class="placeholder-note">자료실 저장소가 아직 준비되지 않았습니다. (관리자가 Supabase에서 resources 버킷을 생성하면 이용 가능합니다.)</p>`;
      } else {
        area.innerHTML = `<p class="qt-loading">불러오기 오류: ${esc(e.message)}</p>`;
      }
    }
  }

  load();
})();
