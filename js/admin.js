/* ============================================================
   운평장로교회 — 회원 관리(관리자) + 내 정보 + 연말정산
   ※ supabase-js SDK의 getSession() 잠금(navigator lock)으로 인한
     "확인 중" 무한 대기를 피하기 위해, localStorage의 로그인 토큰으로
     Supabase REST API를 직접 호출합니다. (모든 요청에 타임아웃 적용)
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
  const fmtT = (iso) => { try { const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; } catch (e) { return ""; } };
  const provLabel = (p) => (p === "kakao" ? "카카오" : p === "email" ? "이메일" : p || "-");

  function lock(msg) {
    box.innerHTML = `<div class="member-lock"><div class="lock-icon">🔒</div><h3>관리자 전용</h3><p>${msg}</p></div>`;
  }

  // ── localStorage에 저장된 Supabase 세션 읽기(getSession 미사용) ──
  function localSession() {
    try {
      const ref = new URL(window.SUPABASE_URL).hostname.split(".")[0];
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.currentSession ? s.currentSession : s;
    } catch (e) { return null; }
  }

  const withTimeout = (p, ms, label) =>
    Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error((label || "요청") + " 응답이 지연됩니다")), ms)),
    ]);

  // ── Supabase REST 직접 호출 ──
  async function api(method, path, body, extraHeaders) {
    const sess = localSession();
    const token = sess && sess.access_token;
    const headers = { apikey: window.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    if (extraHeaders) Object.assign(headers, extraHeaders);
    const res = await withTimeout(
      fetch(window.SUPABASE_URL + "/rest/v1/" + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }),
      8000,
      "서버"
    );
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!res.ok) {
      const msg = (data && (data.message || data.hint || data.error)) || ("HTTP " + res.status);
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return data;
  }
  const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);

  async function start() {
    try { await run(); }
    catch (e) {
      const msg = String((e && e.message) || e);
      if (e && e.status === 401) {
        box.innerHTML = `<div class="member-lock"><div class="lock-icon">🔑</div><h3>다시 로그인이 필요합니다</h3><p>로그인 정보가 만료되었습니다. 우측 상단 "로그아웃" 후 다시 로그인해 주세요.</p></div>`;
      } else if (/profiles|schema cache|does not exist|relation/i.test(msg)) {
        box.innerHTML = `<div class="member-lock"><div class="lock-icon">🛠️</div><h3>회원 정보 테이블 준비 필요</h3><p>관리자가 Supabase에서 회원 프로필 테이블(profiles)을 생성하면 이용할 수 있습니다.</p></div>`;
      } else {
        box.innerHTML = `<p class="qt-loading">불러오기 오류: ${esc(msg)}</p>
          <p style="text-align:center;margin-top:14px;"><button type="button" class="btn btn-line" id="adminRetry">다시 시도</button></p>`;
        const rb = document.getElementById("adminRetry");
        if (rb) rb.addEventListener("click", () => { box.innerHTML = '<p class="qt-loading">확인 중입니다…</p>'; start(); });
      }
    }
  }

  async function run() {
    const sess = localSession();
    const me = sess && sess.user;
    if (!me || !me.id) {
      lock('로그인 후 이용할 수 있습니다. 우측 상단 "로그인"을 눌러 주세요.');
      return;
    }

    // ===== 내 정보 수정 폼 =====
    const pForm = document.getElementById("profileForm");
    const pMsg = document.getElementById("profileMsg");
    let mineRow = null;
    if (pForm) {
      mineRow = first(await api("GET", `profiles?id=eq.${me.id}&select=*`));
      pForm.elements.name.value =
        (mineRow && mineRow.name) ||
        (me.user_metadata && (me.user_metadata.name || me.user_metadata.full_name)) ||
        (me.email ? me.email.split("@")[0] : "");
      if (pForm.elements.role) pForm.elements.role.value = (mineRow && mineRow.role) || "";
      if (mineRow && mineRow.phone) pForm.elements.phone.value = mineRow.phone;
      if (pForm.elements.birth && mineRow && mineRow.birth) pForm.elements.birth.value = mineRow.birth;
      if (pForm.elements.address && mineRow && mineRow.address) pForm.elements.address.value = mineRow.address;
      if (mineRow && mineRow.bio) pForm.elements.bio.value = mineRow.bio;
      pForm.hidden = false;
      pForm.onsubmit = async (e) => {
        e.preventDefault();
        const name = pForm.elements.name.value.trim();
        const phone = pForm.elements.phone.value.trim();
        const birth = pForm.elements.birth ? pForm.elements.birth.value.trim() : "";
        const address = pForm.elements.address ? pForm.elements.address.value.trim() : "";
        const bio = pForm.elements.bio.value.trim();
        // 직책(role)은 본인이 수정 불가(관리자 전용) — 저장에서 제외
        const payload = { id: me.id, name: name || null, email: me.email || null };
        if (phone) payload.phone = phone;
        if (birth) payload.birth = birth;
        if (address) payload.address = address;
        if (bio) payload.bio = bio;
        try {
          await api("POST", "profiles?on_conflict=id", payload, { Prefer: "resolution=merge-duplicates,return=minimal" });
          pMsg.textContent = "저장되었습니다 ✓";
          pMsg.style.color = "var(--accent)";
          const slotName = document.querySelector(".auth-name");
          if (slotName && name) slotName.textContent = name + "님 ▾";
        } catch (err) {
          pMsg.textContent = "오류: " + err.message;
          pMsg.style.color = "#c0392b";
        }
        setTimeout(() => { pMsg.textContent = ""; }, 3000);
      };
    }

    const adminRows = await api("GET", `admins?uid=eq.${me.id}&select=uid`);
    const isAdmin = Array.isArray(adminRows) && adminRows.length > 0;

    // ===== 연말정산 신청 폼 =====
    setupTaxForm(me, mineRow);

    // RLS: 관리자는 전체, 일반 회원은 본인 행만 반환됩니다.
    const rows = (await api("GET", "profiles?select=*&order=created_at.desc")) || [];

    if (isAdmin) {
      renderAdminTable(rows);
      if (countEl) countEl.textContent = `(${rows.length}명)`;
      loadTaxAdmin();
    } else {
      if (countEl) countEl.textContent = "";
      const mine = rows.filter((r) => r.id === me.id);
      box.innerHTML = `<p class="member-role-note">내 정보입니다.</p>` + memberTable(mine.length ? mine : [{ name: (me.user_metadata && me.user_metadata.name) || (me.email ? me.email.split("@")[0] : "성도"), provider: (me.app_metadata && me.app_metadata.provider) || "email", email: me.email, created_at: me.created_at }], false);
    }
  }

  // ===== 회원 목록 테이블 =====
  function memberTable(list, admin) {
    return `
      <div class="member-table-wrap">
        <table class="member-table">
          <thead><tr><th>이름/닉네임</th><th>직책</th><th>가입 방식</th><th>이메일</th><th>가입일</th>${admin ? "<th></th>" : ""}</tr></thead>
          <tbody>
            ${list.map((r) => `<tr data-uid="${esc(r.id)}">
              <td>${esc(r.name) || "-"}</td>
              <td>${admin
                ? `<input type="text" class="role-input" value="${esc(r.role) || ""}" placeholder="직책" maxlength="30" />`
                : (esc(r.role) || "-")}</td>
              <td><span class="prov-tag prov-${esc(r.provider)}">${provLabel(r.provider)}</span></td>
              <td>${esc(r.email) || "-"}</td>
              <td>${fmt(r.created_at)}</td>
              ${admin ? `<td><button type="button" class="btn btn-line role-save" style="padding:4px 12px;font-size:.8rem;">직책 저장</button></td>` : ""}
            </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function renderAdminTable(rows) {
    box.innerHTML = `<p class="member-role-note">관리자 모드 — 전체 회원을 볼 수 있고, 각 회원의 직책을 수정할 수 있습니다.</p>` + memberTable(rows, true);
    box.querySelectorAll("tr[data-uid]").forEach((tr) => {
      const uid = tr.getAttribute("data-uid");
      const input = tr.querySelector(".role-input");
      const btn = tr.querySelector(".role-save");
      if (!uid || !input || !btn) return;
      btn.addEventListener("click", async () => {
        const role = input.value.trim();
        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = "저장 중…";
        try {
          await api("PATCH", `profiles?id=eq.${uid}`, { role: role || null }, { Prefer: "return=minimal" });
          btn.textContent = "저장됨 ✓";
          setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 2000);
        } catch (err) {
          btn.textContent = "오류";
          btn.style.color = "#c0392b";
          setTimeout(() => { btn.textContent = old; btn.style.color = ""; btn.disabled = false; }, 2500);
        }
      });
    });
  }

  // ===== 연말정산 신청 폼 =====
  function setupTaxForm(me, mineRow) {
    const taxBox = document.getElementById("taxBox");
    const openBtn = document.getElementById("taxOpenBtn");
    const taxForm = document.getElementById("taxForm");
    const cancelBtn = document.getElementById("taxCancelBtn");
    const taxMsg = document.getElementById("taxMsg");
    if (!taxBox || !openBtn || !taxForm) return;
    taxBox.hidden = false;

    const meta = me.user_metadata || {};
    taxForm.elements.name.value = (mineRow && mineRow.name) || meta.name || meta.full_name || "";
    if (mineRow && mineRow.phone) taxForm.elements.phone.value = mineRow.phone;
    if (mineRow && mineRow.birth) taxForm.elements.birth.value = mineRow.birth;
    if (mineRow && mineRow.address) taxForm.elements.address.value = mineRow.address;

    openBtn.onclick = () => {
      taxForm.hidden = !taxForm.hidden;
      openBtn.textContent = taxForm.hidden ? "연말정산 신청하기" : "신청서 닫기";
    };
    if (cancelBtn) cancelBtn.onclick = () => {
      taxForm.hidden = true;
      openBtn.textContent = "연말정산 신청하기";
    };

    taxForm.onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        user_id: me.id,
        name: taxForm.elements.name.value.trim(),
        phone: taxForm.elements.phone.value.trim(),
        birth: taxForm.elements.birth.value.trim(),
        rrn_front: taxForm.elements.rrn_front.value.trim(),
        address: taxForm.elements.address.value.trim(),
      };
      if (!payload.name || !payload.phone || !payload.birth || !payload.rrn_front || !payload.address) {
        taxMsg.textContent = "모든 항목을 입력해 주세요.";
        taxMsg.style.color = "#c0392b";
        return;
      }
      taxMsg.textContent = "제출 중…";
      taxMsg.style.color = "var(--ink-soft)";
      try {
        await api("POST", "tax_requests", payload, { Prefer: "return=minimal" });
      } catch (err) {
        taxMsg.textContent = /tax_requests|does not exist|relation|schema cache/i.test(err.message)
          ? "신청 테이블이 아직 준비되지 않았습니다. 관리자에게 문의해 주세요."
          : "오류: " + err.message;
        taxMsg.style.color = "#c0392b";
        return;
      }
      notifyAdminEmail(payload.name);
      taxMsg.textContent = "신청이 접수되었습니다. 감사합니다 🙏";
      taxMsg.style.color = "var(--accent)";
      taxForm.reset();
      setTimeout(() => {
        taxForm.hidden = true;
        openBtn.textContent = "연말정산 신청하기";
        taxMsg.textContent = "";
      }, 2500);
    };
  }

  // ===== 관리자 이메일 알림(Web3Forms) — 민감정보는 보내지 않음 =====
  function notifyAdminEmail(name) {
    const key = window.WEB3FORMS_KEY;
    if (!key) return;
    const when = fmtT(new Date().toISOString());
    const body = {
      access_key: key,
      subject: "[운평장로교회] 새 연말정산 신청 접수",
      from_name: "운평장로교회 홈페이지",
      message:
        "새 연말정산(기부금 영수증) 신청이 접수되었습니다.\n\n" +
        "· 신청자: " + (name || "(이름 미상)") + "\n" +
        "· 접수 시각: " + when + "\n\n" +
        "전화번호·주소·주민번호 앞자리 등 자세한 내용은 홈페이지\n" +
        "'내 정보 · 회원 관리' 페이지의 [연말정산 신청 내역]에서 확인해 주세요.\n" +
        "(민감정보 보호를 위해 이메일에는 포함하지 않습니다.)",
    };
    try {
      fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    } catch (e) {}
  }

  // ===== 관리자: 연말정산 신청 내역 =====
  async function loadTaxAdmin() {
    const wrap = document.getElementById("taxAdmin");
    const listEl = document.getElementById("taxList");
    const cntEl = document.getElementById("taxCount");
    if (!wrap || !listEl) return;
    wrap.hidden = false;
    let reqs;
    try {
      reqs = (await api("GET", "tax_requests?select=*&order=created_at.desc")) || [];
    } catch (err) {
      listEl.innerHTML = /tax_requests|does not exist|relation|schema cache/i.test(err.message)
        ? `<p class="member-role-note">연말정산 테이블(tax_requests)이 아직 생성되지 않았습니다.</p>`
        : `<p class="qt-loading">불러오기 오류: ${esc(err.message)}</p>`;
      return;
    }
    if (cntEl) cntEl.textContent = `(${reqs.length}건)`;
    if (!reqs.length) {
      listEl.innerHTML = `<p class="member-role-note">아직 접수된 신청이 없습니다.</p>`;
      return;
    }
    listEl.innerHTML = `
      <div class="member-table-wrap">
        <table class="member-table">
          <thead><tr><th>신청일</th><th>이름</th><th>전화번호</th><th>생년월일</th><th>주민번호 앞</th><th>주소</th><th></th></tr></thead>
          <tbody>
            ${reqs.map((r) => `<tr data-id="${r.id}">
              <td>${fmtT(r.created_at)}</td>
              <td>${esc(r.name)}</td>
              <td>${esc(r.phone)}</td>
              <td>${esc(r.birth)}</td>
              <td>${esc(r.rrn_front)}</td>
              <td>${esc(r.address)}</td>
              <td><button type="button" class="btn btn-line tax-del" style="padding:4px 12px;font-size:.8rem;">삭제</button></td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="member-role-note" style="margin-top:10px;">🔒 민감정보입니다. 처리 후에는 삭제해 주세요.</p>`;
    listEl.querySelectorAll("tr[data-id]").forEach((tr) => {
      const id = tr.getAttribute("data-id");
      const btn = tr.querySelector(".tax-del");
      if (!id || !btn) return;
      btn.addEventListener("click", async () => {
        if (!confirm("이 신청 내역을 삭제할까요?")) return;
        btn.disabled = true;
        try {
          await api("DELETE", `tax_requests?id=eq.${id}`, null, { Prefer: "return=minimal" });
          tr.remove();
          if (cntEl) cntEl.textContent = `(${listEl.querySelectorAll("tr[data-id]").length}건)`;
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "오류";
        }
      });
    });
  }

  start();
})();
