/* ============================================================
   운평장로교회 — 회원 탈퇴 (Soft Delete)
   supabase/account.sql 의 withdraw_me() 함수를 호출해
   ① 프로필 탈퇴 표시 + 개인정보 익명화 ② 민감정보(연말정산) 삭제
   ③ 게시물 작성자명 '탈퇴한 회원' 처리 ④ 계정 잠금(재로그인 불가)을 수행.
   이메일 가입자는 비밀번호 재확인, 카카오 가입자는 확인창 2번으로 진행.
   ============================================================ */
(function () {
  const box = document.getElementById("withdrawBox");
  if (!box) return;

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    box.innerHTML = '<p class="qt-loading">로그인 기능이 아직 연결되지 않았습니다.</p>';
    return;
  }

  function clearTokens() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") !== -1) localStorage.removeItem(k);
      }
    } catch (e) {}
  }

  function render(sb, user) {
    const provider = (user.app_metadata && user.app_metadata.provider) || "email";
    const isEmail = provider === "email";
    const name = (user.user_metadata && (user.user_metadata.name || user.user_metadata.full_name || user.user_metadata.nickname)) || (user.email ? user.email.split("@")[0] : "회원");
    box.innerHTML = `
      <div class="form-card">
        <h3 class="sub-title" style="text-align:left;margin-bottom:14px;">정말 탈퇴하시겠어요?</h3>
        <div class="withdraw-warn">
          <strong>${name}</strong>님, 탈퇴하시면:<br>
          · 프로필(연락처·생년월일·주소 등)과 이메일 등 개인정보는 <b>익명 처리</b>됩니다<br>
          · 연말정산 신청 내역(주민번호 등 민감정보)은 <b>즉시 삭제</b>됩니다<br>
          · 남긴 글·사진·댓글은 유지되되 작성자가 <b>'탈퇴한 회원'</b>으로 표시됩니다<br>
          · 이 계정으로는 <b>다시 로그인할 수 없습니다</b> (새로 가입은 가능)<br><br>
          탈퇴 후에는 되돌릴 수 없습니다.
        </div>
        ${isEmail ? `
        <div class="form-field" style="max-width:320px;margin-bottom:14px;">
          <label>본인 확인을 위해 비밀번호를 입력해 주세요</label>
          <input type="password" id="wdPw" autocomplete="current-password" />
        </div>` : `
        <p style="color:var(--ink-soft);font-size:.9rem;margin-bottom:14px;">카카오 계정으로 가입하셨습니다. 아래 버튼을 누르면 확인 절차 후 탈퇴가 진행됩니다.</p>`}
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <button type="button" class="btn btn-danger" id="wdGo">회원 탈퇴하기</button>
          <a class="btn btn-line" href="index.html">취소</a>
          <span class="profile-msg" id="wdMsg"></span>
        </div>
      </div>`;

    const goBtn = document.getElementById("wdGo");
    const wdMsg = document.getElementById("wdMsg");
    const say = (t, err) => { wdMsg.textContent = t; wdMsg.style.color = err ? "#c0392b" : "var(--ink-soft)"; };

    goBtn.addEventListener("click", async () => {
      // 실수 방지 확인
      if (isEmail) {
        const pw = (document.getElementById("wdPw").value || "");
        if (!pw) { say("비밀번호를 입력해 주세요.", true); return; }
        goBtn.disabled = true; say("본인 확인 중…");
        const { error: verifyErr } = await sb.auth.signInWithPassword({ email: user.email, password: pw });
        if (verifyErr) { goBtn.disabled = false; say("비밀번호가 올바르지 않습니다.", true); return; }
        if (!confirm("회원 탈퇴를 진행할까요? 탈퇴 후에는 되돌릴 수 없습니다.")) { goBtn.disabled = false; say(""); return; }
      } else {
        if (!confirm("회원 탈퇴를 진행할까요?")) return;
        if (!confirm("탈퇴 후에는 되돌릴 수 없고, 이 카카오 계정으로 다시 로그인할 수 없습니다.\n정말 탈퇴하시겠어요?")) return;
        goBtn.disabled = true;
      }

      say("탈퇴 처리 중…");
      try {
        const { error } = await sb.rpc("withdraw_me");
        if (error) {
          if (/could not find the function/i.test(error.message)) throw new Error("탈퇴 기능 준비가 필요합니다. 관리자가 Supabase ▸ SQL Editor 에서 supabase/account.sql 을 1회 실행해 주세요.");
          throw error;
        }
      } catch (err) {
        goBtn.disabled = false;
        say("오류: " + (err.message || "다시 시도해 주세요."), true);
        return;
      }
      // 세션 정리 후 홈으로
      clearTokens();
      try { sb.auth.signOut().catch(() => {}); } catch (e) {}
      try { sessionStorage.setItem("flashMsg", "회원 탈퇴가 완료되었습니다. 그동안 함께해 주셔서 감사합니다."); } catch (e) {}
      location.href = "index.html";
    });
  }

  function init(sb) {
    sb.auth.getSession().then(({ data }) => {
      const user = data && data.session && data.session.user;
      if (!user) {
        box.innerHTML = `<div class="member-lock"><div class="lock-icon">🔒</div><h3>로그인이 필요합니다</h3>
          <p>회원 탈퇴는 로그인 후 이용할 수 있습니다. 우측 상단 "로그인"을 눌러 주세요.</p></div>`;
        return;
      }
      render(sb, user);
    });
  }

  if (window.__sb) init(window.__sb);
  else window.addEventListener("sb-ready", (e) => init(e.detail.sb), { once: true });
})();
