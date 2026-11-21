/* ============================================================
   운평장로교회 — 자료실 > 회의자료실(당회록 · 공동의회록) · 요람  (2026-11-21 담임목사 지시)
   - 파일: Supabase 비공개 버킷 'meeting-docs' (경로 첫 칸 = 종류: session · congregation · yoram)
   - 목록: meeting_docs 표 / 권한: rpc meeting_access()  — SQL supabase/20261121_1500_meeting_docs.sql
     당회록 = 당회원(담임목사 · 시무장로)만 / 공동의회록 = 세례교인 열람 / 요람 = 정회원 열람
   - 권한은 서버(RLS · 저장소 정책)가 막는다. 이 화면은 보여 주기만 한다.
   ============================================================ */
(function () {
  const BUCKET = "meeting-docs";
  const AREAS = [
    { kind: "session", el: document.getElementById("meetingSession"), name: "당회록", dateLabel: "회의 날짜",
      who: "당회록은 당회원(담임목사 · 시무장로)만 열람할 수 있습니다." },
    { kind: "congregation", el: document.getElementById("meetingCongregation"), name: "공동의회록", dateLabel: "회의 날짜",
      who: "공동의회록은 세례교인(세례 · 입교)만 열람할 수 있습니다. 교적에 세례 기록이 없으면 교회 사무실에 말씀해 주십시오." },
    { kind: "yoram", el: document.getElementById("yoramArea"), name: "요람", dateLabel: "발행일",
      who: "요람은 교적이 확인된 정회원만 열람할 수 있습니다." },
  ].filter((a) => a.el);
  if (!AREAS.length) return;
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    AREAS.forEach((a) => (a.el.innerHTML = '<p class="placeholder-note">로그인 기능 연결 후 이용할 수 있습니다.</p>'));
    return;
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtSize = (n) => { if (!n && n !== 0) return ""; if (n < 1024) return n + " B"; if (n < 1048576) return (n / 1024).toFixed(0) + " KB"; return (n / 1048576).toFixed(1) + " MB"; };
  const fmtDate = (d) => { if (!d) return ""; const p = String(d).slice(0, 10).split("-"); return p.length === 3 ? `${p[0]}. ${+p[1]}. ${+p[2]}.` : d; };

  function session() {
    try {
      const ref = new URL(window.SUPABASE_URL).hostname.split(".")[0];
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.currentSession ? s.currentSession : s;
    } catch (e) { return null; }
  }
  const token = () => { const s = session(); return s && s.access_token; };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("서버 응답이 지연됩니다")), ms))]);
  function headers(extra) {
    const h = { apikey: window.SUPABASE_ANON_KEY };
    const t = token(); if (t) h.Authorization = "Bearer " + t;
    return Object.assign(h, extra || {});
  }
  async function api(url, opts, ms) {
    const res = await withTimeout(fetch(window.SUPABASE_URL + url, opts), ms || 10000);
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!res.ok) { const err = new Error((data && (data.message || data.error || data.hint)) || ("HTTP " + res.status)); err.status = res.status; err.code = data && data.code; throw err; }
    return data;
  }
  const encPath = (p) => p.split("/").map(encodeURIComponent).join("/");

  let access = null;
  let rows = [];

  function lockHTML(title, text, login) {
    return `<div class="member-lock"><h3>${esc(title)}</h3><p>${esc(text)}</p>${login ? '<button type="button" class="btn btn-line md-login" style="margin-top:12px;">로그인</button>' : ""}</div>`;
  }

  function render(area) {
    const canRead = access && access[area.kind];
    const canWrite = access && access[area.kind + "_w"];
    if (!canRead && !canWrite) { area.el.innerHTML = lockHTML(area.name + " — 열람 권한이 없습니다", area.who); return; }
    const mine = rows.filter((r) => r.kind === area.kind);
    const form = canWrite ? `
      <form class="md-form" data-kind="${area.kind}">
        <div class="md-form-row">
          <label>제목<input type="text" name="doc_title" required maxlength="120" placeholder="${area.kind === "yoram" ? "예: 2027년 교회 요람" : "예: 2026년 제5차 " + area.name.replace("록", "")}" /></label>
          <label>${area.dateLabel}<input type="date" name="date" /></label>
        </div>
        <div class="md-form-row">
          <label class="md-file">파일<input type="file" name="file" required /></label>
          <button type="submit" class="btn btn-solid">올리기</button>
        </div>
        <p class="md-msg" aria-live="polite"></p>
      </form>` : "";
    const list = !canRead ? "" : mine.length ? `<div class="md-list">${mine.map((r) => `
        <div class="md-item" data-id="${r.id}">
          <span class="md-date">${esc(fmtDate(r.meeting_date))}</span>
          <span class="md-title">${esc(r.title)}<small>${esc(r.file_name)}${r.size ? " · " + fmtSize(r.size) : ""}</small></span>
          <span class="md-acts">
            <button type="button" class="btn btn-line md-dl">내려받기</button>
            ${canWrite ? '<button type="button" class="btn btn-line md-del">삭제</button>' : ""}
          </span>
        </div>`).join("")}</div>`
      : `<p class="placeholder-note">${area.kind === "yoram" ? "요람은 준비 중입니다. 곧 올려 드리겠습니다." : "등록된 " + area.name + "이 없습니다."}</p>`;
    area.el.innerHTML = form + list;

    area.el.querySelectorAll(".md-item").forEach((el) => {
      const row = mine.find((r) => String(r.id) === el.getAttribute("data-id"));
      el.querySelector(".md-dl").addEventListener("click", async (e) => {
        const b = e.currentTarget; b.disabled = true; const t = b.textContent; b.textContent = "준비 중…";
        try {
          const d = await api(`/storage/v1/object/sign/${BUCKET}/${encPath(row.path)}`, {
            method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ expiresIn: 300 }),
          });
          window.open(window.SUPABASE_URL + "/storage/v1" + d.signedURL + "&download=" + encodeURIComponent(row.file_name || ""), "_blank");
        } catch (err) { alert("내려받기 오류: " + err.message); }
        b.disabled = false; b.textContent = t;
      });
      const del = el.querySelector(".md-del");
      if (del) del.addEventListener("click", async () => {
        if (!confirm(`‘${row.title}’ 을(를) 삭제할까요? 지운 파일은 되살릴 수 없습니다.`)) return;
        del.disabled = true;
        try {
          await api(`/rest/v1/meeting_docs?id=eq.${row.id}`, { method: "DELETE", headers: headers({ Prefer: "return=minimal" }) });
          try { await api(`/storage/v1/object/${BUCKET}/${encPath(row.path)}`, { method: "DELETE", headers: headers() }); } catch (e) {}
          load();
        } catch (err) { del.disabled = false; alert("삭제 오류: " + err.message); }
      });
    });

    const f = area.el.querySelector(".md-form");
    if (f) f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = f.querySelector(".md-msg");
      const el = f.elements;
      const file = el.namedItem("file").files[0];
      const title = el.namedItem("doc_title").value.trim();
      if (!file || !title) return;
      const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      msg.textContent = `‘${file.name}’ 올리는 중…`; msg.className = "md-msg";
      const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const key = `${area.kind}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext ? "." + ext : ""}`;
      try {
        await api(`/storage/v1/object/${BUCKET}/${encPath(key)}`, {
          method: "POST", headers: headers({ "Content-Type": file.type || "application/octet-stream" }), body: file,
        }, 180000);
        try {
          await api("/rest/v1/meeting_docs", {
            method: "POST", headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
            body: JSON.stringify({ kind: area.kind, title, meeting_date: el.namedItem("date").value || null, file_name: file.name, path: key, size: file.size }),
          });
        } catch (err) {
          try { await api(`/storage/v1/object/${BUCKET}/${encPath(key)}`, { method: "DELETE", headers: headers() }); } catch (x) {}
          throw err;
        }
        load();
      } catch (err) { btn.disabled = false; msg.textContent = "올리기 오류: " + err.message; msg.className = "md-msg md-err"; }
    });
  }

  async function load() {
    const s = session();
    if (!s || !s.user) {
      AREAS.forEach((a) => (a.el.innerHTML = lockHTML("로그인이 필요합니다", a.who, true)));
      document.querySelectorAll(".md-login").forEach((b) => b.addEventListener("click", () => {
        const m = document.getElementById("authModal"); if (m) { m.hidden = false; document.body.style.overflow = "hidden"; }
      }));
      return;
    }
    AREAS.forEach((a) => (a.el.innerHTML = '<p class="qt-loading">불러오는 중…</p>'));
    try {
      access = await api("/rest/v1/rpc/meeting_access", { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: "{}" });
      rows = await api("/rest/v1/meeting_docs?select=id,kind,title,meeting_date,file_name,path,size,created_at&order=meeting_date.desc.nullslast,created_at.desc", { headers: headers() });
      AREAS.forEach(render);
    } catch (e) {
      const notReady = e.status === 404 || /PGRST202|PGRST205|42P01|meeting_/.test((e.code || "") + e.message);
      const html = notReady ? '<p class="placeholder-note">준비 중입니다. 곧 열립니다.</p>' : `<p class="qt-loading">불러오기 오류: ${esc(e.message)}</p>`;
      AREAS.forEach((a) => (a.el.innerHTML = html));
    }
  }

  load();
})();
