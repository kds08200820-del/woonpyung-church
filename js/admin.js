/* ============================================================
   운평장로교회 — 회원 관리(관리자 전용) + 내 정보 + 연말정산
   profiles 조회. RLS로 관리자만 전체 조회/수정 가능.
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

  async function start(sb) {
    try { await run(sb); }
    catch (e) {
      const msg = String((e && e.message) || e);
      if (/profiles|schema cache|does not exist/i.test(msg)) {
        box.innerHTML = `<div class="member-lock"><div class="lock-icon">🛠️</div><h3>회원 정보 테이블 준비 필요</h3><p>관리자가 Supabase에서 회원 프로필 테이블(profiles)을 생성하면 이용할 수 있습니다.</p></div>`;
      } else {
        box.innerHTML = `<p class="qt-loading">불러오기 오류: ${esc(msg)}</p>`;
      }
    }
  }

  async function run(sb) {
    const { data } = await sb.auth.getSession();
    const me = data && data.session && data.session.user;
    if (!me) {
      lock('로그인 후 이용할 수 있습니다. 우측 상단 "로그인"을 눌러 주세요.');
      return;
    }

    // ===== 내 정보 수정 폼 =====
    const pForm = document.getElementById("profileForm");
    const pMsg = document.getElementById("profileMsg");
    let mineRow = null;
    if (pForm) {
      const { data: row, error: mErr } = await sb.from("profiles").select("*").eq("id", me.id).maybeSingle();
      if (mErr) throw mErr;
      mineRow = row;
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
      pForm.addEventListener("submit", async (e) => {
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
        const { error } = await sb.from("profiles").upsert(payload);
        if (error) {
          if (/column .* does not exist|phone|bio|birth|address/i.test(error.message)) {
            pMsg.textContent = "이름은 저장됐어요. (일부 컬럼은 관리자가 활성화하면 사용 가능합니다.)";
            pMsg.style.color = "var(--accent-soft)";
            await sb.from("profiles").upsert({ id: me.id, name: name || null, email: me.email || null });
          } else {
            pMsg.textContent = "오류: " + error.message;
            pMsg.style.color = "#c0392b";
          }
        } else {
          pMsg.textContent = "저장되었습니다 ✓";
          pMsg.style.color = "var(--accent)";
        }
        const slotName = document.querySelector(".auth-name");
        if (slotName && name) slotName.textContent = name + "님";
        setTimeout(() => { pMsg.textContent = ""; }, 3000);
      });
    }

    const { data: adm } = await sb.from("admins").select("uid").eq("uid", me.id).maybeSingle();
    const isAdmin = !!adm;

    // ===== 연말정산 신청 폼 =====
    setupTaxForm(sb, me, mineRow);

    // RLS: 관리자는 전체, 일반 회원은 본인 행만 조회됩니다.
    const { data: rows, error } = await sb.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) throw error;

    if (isAdmin) {
      renderAdminTable(sb, rows);
      if (countEl) countEl.textContent = `(${rows.length}명)`;
      loadTaxAdmin(sb);
    } else {
      if (countEl) countEl.textContent = "";
      const mine = (rows || []).filter((r) => r.id === me.id);
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

  function renderAdminTable(sb, rows) {
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
        const { error } = await sb.from("profiles").update({ role: role || null }).eq("id", uid);
        btn.disabled = false;
        if (error) {
          btn.textContent = "오류";
          btn.style.color = "#c0392b";
          setTimeout(() => { btn.textContent = old; btn.style.color = ""; }, 2500);
        } else {
          btn.textContent = "저장됨 ✓";
          setTimeout(() => { btn.textContent = old; }, 2000);
        }
      });
    });
  }

  // ===== 연말정산 신청 폼 =====
  function setupTaxForm(sb, me, mineRow) {
    const taxBox = document.getElementById("taxBox");
    const openBtn = document.getElementById("taxOpenBtn");
    const taxForm = document.getElementById("taxForm");
    const cancelBtn = document.getElementById("taxCancelBtn");
    const taxMsg = document.getElementById("taxMsg");
    if (!taxBox || !openBtn || !taxForm) return;
    taxBox.hidden = false;

    // 프로필 정보로 미리 채우기
    const meta = me.user_metadata || {};
    taxForm.elements.name.value = (mineRow && mineRow.name) || meta.name || meta.full_name || "";
    if (mineRow && mineRow.phone) taxForm.elements.phone.value = mineRow.phone;
    if (mineRow && mineRow.birth) taxForm.elements.birth.value = mineRow.birth;
    if (mineRow && mineRow.address) taxForm.elements.address.value = mineRow.address;

    openBtn.addEventListener("click", () => {
      taxForm.hidden = !taxForm.hidden;
      openBtn.textContent = taxForm.hidden ? "연말정산 신청하기" : "신청서 닫기";
    });
    if (cancelBtn) cancelBtn.addEventListener("click", () => {
      taxForm.hidden = true;
      openBtn.textContent = "연말정산 신청하기";
    });

    taxForm.addEventListener("submit", async (e) => {
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
      const { error } = await sb.from("tax_requests").insert(payload);
      if (error) {
        if (/tax_requests|does not exist|schema cache/i.test(error.message)) {
          taxMsg.textContent = "신청 테이블이 아직 준비되지 않았습니다. 관리자에게 문의해 주세요.";
        } else {
          taxMsg.textContent = "오류: " + error.message;
        }
        taxMsg.style.color = "#c0392b";
        return;
      }
      taxMsg.textContent = "신청이 접수되었습니다. 감사합니다 🙏";
      taxMsg.style.color = "var(--accent)";
      taxForm.reset();
      setTimeout(() => {
        taxForm.hidden = true;
        openBtn.textContent = "연말정산 신청하기";
        taxMsg.textContent = "";
      }, 2500);
    });
  }

  // ===== 관리자: 연말정산 신청 내역 =====
  async function loadTaxAdmin(sb) {
    const wrap = document.getElementById("taxAdmin");
    const listEl = document.getElementById("taxList");
    const cntEl = document.getElementById("taxCount");
    if (!wrap || !listEl) return;
    wrap.hidden = false;
    const { data: reqs, error } = await sb.from("tax_requests").select("*").order("created_at", { ascending: false });
    if (error) {
      listEl.innerHTML = /tax_requests|does not exist|schema cache/i.test(error.message)
        ? `<p class="member-role-note">연말정산 테이블(tax_requests)이 아직 생성되지 않았습니다.</p>`
        : `<p class="qt-loading">불러오기 오류: ${esc(error.message)}</p>`;
      return;
    }
    if (cntEl) cntEl.textContent = `(${(reqs || []).length}건)`;
    if (!reqs || !reqs.length) {
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
        const { error: dErr } = await sb.from("tax_requests").delete().eq("id", id);
        if (dErr) { btn.disabled = false; btn.textContent = "오류"; return; }
        tr.remove();
        if (cntEl) {
          const left = listEl.querySelectorAll("tr[data-id]").length;
          cntEl.textContent = `(${left}건)`;
        }
      });
    });
  }

  let started = false;
  function go(client) { if (started) return; started = true; start(client); }
  if (window.__sb) go(window.__sb);
  else {
    window.addEventListener("sb-ready", (e) => go(e.detail.sb), { once: true });
    setTimeout(() => {
      if (started) return;
      if (window.__sb) go(window.__sb);
      else box.innerHTML = '<p class="qt-loading">로그인 정보를 불러오지 못했습니다. 잠시 후 새로고침(Ctrl+Shift+R) 해주세요.</p>';
    }, 7000);
  }
})();
