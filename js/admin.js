/* ============================================================
   운평장로교회 — 회원 관리(관리자 전용)
   profiles 조회. RLS로 관리자만 전체 조회 가능.
   ============================================================ */
(function () {
  const box = document.getElementById("memberList");
  if (!box) return;
  const notice = document.getElementById("adminNotice");
  const countEl = document.getElementById("memberCount");

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    if (notice) notice.hidden = false;
    box.innerHTML = "";
    return;
  }

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  const fmt = (iso) => { try { const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`; } catch (e) { return ""; } };
  const provLabel = (p) => (p === "kakao" ? "카카오" : p === "email" ? "이메일" : p || "-");

  function lock(msg) {
    box.innerHTML = `<div class="member-lock"><div class="lock-icon">🔒</div><h3>관리자 전용</h3><p>${msg}</p></div>`;
  }

  async function start(sb) {
    const { data } = await sb.auth.getSession();
    const me = data && data.session && data.session.user;
    if (!me) {
      lock('로그인 후 이용할 수 있습니다. 우측 상단 "로그인"을 눌러 주세요.');
      return;
    }
    const { data: adm } = await sb.from("admins").select("uid").eq("uid", me.id).maybeSingle();
    const isAdmin = !!adm;

    // RLS: 관리자는 전체, 일반 회원은 본인 행만 조회됩니다.
    const { data: rows, error } = await sb.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) { box.innerHTML = `<p class="qt-loading">불러오기 오류: ${esc(error.message)}</p>`; return; }

    const tableHTML = (list) => `
      <div class="member-table-wrap">
        <table class="member-table">
          <thead><tr><th>이름/닉네임</th><th>가입 방식</th><th>이메일</th><th>가입일</th></tr></thead>
          <tbody>
            ${list.map((r) => `<tr>
              <td>${esc(r.name) || "-"}</td>
              <td><span class="prov-tag prov-${esc(r.provider)}">${provLabel(r.provider)}</span></td>
              <td>${esc(r.email) || "-"}</td>
              <td>${fmt(r.created_at)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;

    if (isAdmin) {
      // 관리자: 전체 회원 목록
      if (countEl) countEl.textContent = `(${rows.length}명)`;
      box.innerHTML = `<p class="member-role-note">관리자 모드 — 전체 회원을 볼 수 있습니다.</p>` + tableHTML(rows);
    } else {
      // 일반 회원: 본인 정보만
      if (countEl) countEl.textContent = "";
      const mine = (rows || []).filter((r) => r.id === me.id);
      box.innerHTML = `<p class="member-role-note">내 정보입니다.</p>` + tableHTML(mine.length ? mine : [{ name: (me.user_metadata && me.user_metadata.name) || (me.email ? me.email.split("@")[0] : "성도"), provider: (me.app_metadata && me.app_metadata.provider) || "email", email: me.email, created_at: me.created_at }]);
    }
  }

  if (window.__sb) start(window.__sb);
  else window.addEventListener("sb-ready", (e) => start(e.detail.sb), { once: true });
})();
