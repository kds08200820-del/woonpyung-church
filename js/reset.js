/* ============================================================
   운평장로교회 — 비밀번호 재설정 (reset.html)
   이메일의 재설정 링크(1회용)로 진입하면 Supabase가 임시 세션을 만들고,
   여기서 새 비밀번호(8자 이상)를 저장합니다.
   ============================================================ */
(function () {
  const box = document.getElementById("resetBox");
  if (!box) return;

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    box.innerHTML = '<p class="qt-loading">로그인 기능이 아직 연결되지 않았습니다.</p>';
    return;
  }

  // supabase-js가 주소의 토큰을 지우기 전에, 들어온 주소를 먼저 기억해 둔다.
  // (이 스크립트는 SDK보다 먼저 실행되므로 이 시점의 주소가 원본이다)
  const entryHash = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  const entryQuery = new URLSearchParams(location.search || "");
  const hadToken = !!(entryHash.get("access_token") || entryQuery.get("code") || entryQuery.get("token_hash"));

  // 링크가 만료/재사용된 경우 오류가 해시 또는 쿼리스트링에 담겨 온다
  function linkError() {
    for (const p of [entryHash, entryQuery]) {
      if (p.get("error")) {
        const d = (p.get("error_description") || "") + " " + (p.get("error_code") || "");
        if (/expired|invalid|otp_expired/i.test(d)) return "재설정 링크가 만료되었거나 이미 사용되었습니다.";
        return "재설정 링크가 올바르지 않습니다.";
      }
    }
    return null;
  }

  function renderError(text, sub) {
    box.innerHTML = `<div class="member-lock"><div class="lock-icon">⏱️</div><h3>${text}</h3>
      <p>${sub || '홈으로 이동해 로그인 창의 "비밀번호를 잊으셨나요?"를 눌러 재설정 메일을 다시 받아 주세요.<br>메일이 안 보이면 <b>스팸함</b>도 확인해 주세요. 링크는 1회만 사용할 수 있습니다.'}</p>
      <a class="btn btn-solid" href="index.html" style="margin-top:14px;">홈으로</a></div>`;
  }

  function renderForm(sb) {
    box.innerHTML = `
      <form class="form-card" id="resetForm" style="max-width:480px;">
        <h3 class="sub-title" style="text-align:left;margin-bottom:14px;">새 비밀번호 설정</h3>
        <div class="form-field"><label>새 비밀번호 (8자 이상)</label><input type="password" name="pw1" required minlength="8" autocomplete="new-password" /></div>
        <div class="form-field" style="margin-top:12px;"><label>새 비밀번호 확인</label><input type="password" name="pw2" required minlength="8" autocomplete="new-password" /></div>
        <div class="form-actions" style="margin-top:18px;display:flex;gap:10px;align-items:center;">
          <button type="submit" class="btn btn-solid" id="resetGo">비밀번호 변경</button>
          <span class="profile-msg" id="resetMsg"></span>
        </div>
      </form>`;
    const form = document.getElementById("resetForm");
    const msg = document.getElementById("resetMsg");
    const go = document.getElementById("resetGo");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const pw1 = fd.get("pw1"), pw2 = fd.get("pw2");
      if (String(pw1).length < 8) { msg.textContent = "비밀번호는 8자 이상이어야 합니다."; msg.style.color = "#c0392b"; return; }
      if (pw1 !== pw2) { msg.textContent = "두 비밀번호가 서로 다릅니다."; msg.style.color = "#c0392b"; return; }
      go.disabled = true; msg.textContent = "변경 중…"; msg.style.color = "var(--ink-soft)";
      try {
        const { error } = await sb.auth.updateUser({ password: pw1 });
        if (error) throw error;
        msg.textContent = "";
        box.innerHTML = `<div class="member-lock"><div class="lock-icon">✅</div><h3>비밀번호가 변경되었습니다</h3>
          <p>새 비밀번호로 로그인된 상태입니다. 홈으로 이동해 이용해 주세요.</p>
          <a class="btn btn-solid" href="index.html" style="margin-top:14px;">홈으로</a></div>`;
      } catch (err) {
        go.disabled = false;
        const m = (err && err.message) || "";
        let t = "오류: " + (m || "다시 시도해 주세요.");
        if (/same password|different from the old/i.test(m)) t = "지금 쓰시는 비밀번호와 같습니다. 그 비밀번호로 바로 로그인하시거나, 다른 비밀번호를 입력해 주세요.";
        else if (/password should be at least|weak/i.test(m)) t = "비밀번호가 너무 짧거나 단순합니다. 8자 이상으로 다시 입력해 주세요.";
        else if (/rate limit|too many/i.test(m)) t = "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
        else if (/session|not.?logged|missing/i.test(m)) t = "확인 시간이 지났습니다. 재설정 메일을 다시 받아 주세요.";
        msg.textContent = t;
        msg.style.color = "#c0392b";
      }
    });
  }

  async function init(sb) {
    const le = linkError();
    if (le) { renderError(le); return; }

    // PKCE형 링크(?code=…)로 들어온 경우: 코드를 세션으로 직접 교환한다.
    const code = entryQuery.get("code");
    if (code) {
      try { await sb.auth.exchangeCodeForSession(code); } catch (e) {}
    }
    // token_hash형 링크(?token_hash=…&type=recovery)도 지원한다.
    const th = entryQuery.get("token_hash");
    if (th) {
      try { await sb.auth.verifyOtp({ type: "recovery", token_hash: th }); } catch (e) {}
    }

    // 재설정 링크로 들어오면 Supabase가 주소의 토큰을 세션으로 교환한다(잠깐 걸릴 수 있음)
    for (let i = 0; i < 20; i++) {
      const { data } = await sb.auth.getSession();
      if (data && data.session) { renderForm(sb); return; }
      await new Promise((r) => setTimeout(r, 300));
    }

    // 세션을 만들지 못했다 — 들어온 경위에 따라 정확히 안내한다.
    if (hadToken) renderError("재설정 링크가 만료되었거나 이미 사용되었습니다.");
    else renderError("메일의 재설정 링크로만 들어올 수 있는 페이지입니다",
      '주소를 직접 입력하면 비밀번호를 바꿀 수 없습니다.<br>홈 화면 로그인 창의 "비밀번호를 잊으셨나요?"를 눌러 재설정 메일을 받은 뒤,<br>그 메일의 <b>링크를 눌러</b> 이 페이지로 들어와 주세요. 메일이 안 보이면 <b>스팸함</b>도 확인해 주세요.');
  }

  if (window.__sb) init(window.__sb);
  else {
    window.addEventListener("sb-ready", (e) => init(e.detail.sb), { once: true });
    // 인터넷이 느리거나 차단돼 로그인 부품(SDK)이 못 오면 "확인 중"에 멈춘다 → 8초 후 안내
    setTimeout(() => {
      if (!window.__sb && box.querySelector(".qt-loading")) {
        renderError("연결이 원활하지 않습니다",
          "인터넷 연결을 확인하신 뒤 새로고침해 주세요.<br>카카오톡 등 앱 안의 브라우저에서 문제가 계속되면, 링크를 길게 눌러 <b>다른 브라우저(크롬·삼성인터넷)로 열기</b>를 시도해 주세요.");
      }
    }, 8000);
  }
})();
