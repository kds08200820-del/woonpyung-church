/* ============================================================
   운평장로교회 — 인증 (Supabase Auth: 이메일 + 카카오)
   layout.js가 SUPABASE 키 설정 시에만 이 파일을 로드합니다.
   window.__sb (Supabase 클라이언트)를 노출하고 'sb-ready' 이벤트를 발생시켜
   게시판(community.js)이 재사용할 수 있게 합니다.
   ============================================================ */
(function () {
  if (!window.supabase || !window.SUPABASE_URL) return;
  const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  window.__sb = sb;

  const slot = document.getElementById("authSlot");
  const modal = document.getElementById("authModal");
  const form = document.getElementById("authForm");
  const msg = document.getElementById("authMsg");
  const titleEl = document.getElementById("authTitle");
  const subEl = document.getElementById("authSubtitle");
  const nameField = document.getElementById("nameField");
  const channelField = document.getElementById("channelField");
  const submitBtn = document.getElementById("authSubmit");
  const KAKAO_CHANNEL = "_xkdNxfX"; // 카카오톡 채널 공개 ID
  const toggleBtn = document.getElementById("authToggle");
  const kakaoBtn = document.getElementById("kakaoLogin");

  let mode = "login"; // 'login' | 'signup'

  function openModal() { modal.hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal() { modal.hidden = true; document.body.style.overflow = ""; if (msg) msg.hidden = true; }

  function setMode(m) {
    mode = m;
    titleEl.textContent = m === "login" ? "로그인" : "회원가입";
    submitBtn.textContent = m === "login" ? "로그인" : "회원가입";
    nameField.hidden = m === "login";
    if (channelField) channelField.hidden = m === "login";
    // 회원가입 전용: 약관 동의(필수), 비밀번호 8자 이상 / 로그인: 기존 회원 배려(6자 허용)
    const termsField = document.getElementById("termsField");
    if (termsField) termsField.hidden = m === "login";
    const kakaoNote = document.getElementById("kakaoNote");
    if (kakaoNote) kakaoNote.hidden = m === "login";
    const pw = document.getElementById("authPassword");
    if (pw) { pw.minLength = m === "login" ? 6 : 8; pw.placeholder = m === "login" ? "비밀번호" : "8자 이상"; }
    const forgot = document.getElementById("authForgotWrap");
    if (forgot) forgot.hidden = m !== "login";
    toggleBtn.textContent = m === "login" ? "회원가입" : "로그인하기";
    document.querySelector(".auth-switch").firstChild.textContent =
      m === "login" ? "처음이신가요? " : "이미 회원이신가요? ";
    msg.hidden = true;
  }

  // Supabase 오류를 성도님들이 이해할 수 있는 말로 바꿔 보여준다
  // (탈퇴 계정은 이메일이 익명화되어 '없는 계정'이 되므로, banned 오류 = 정지된 계정)
  function friendlyError(err) {
    const m = (err && err.message) || "";
    if (/banned/i.test(m)) return "이용약관 위반으로 계정이 정지되었습니다. 문의는 교회로 부탁드립니다 (010-4032-2903).";
    if (/invalid login credentials/i.test(m)) return "이메일 또는 비밀번호가 올바르지 않습니다.";
    if (/email not confirmed/i.test(m)) return "이메일 인증이 완료되지 않았습니다. 가입 확인 메일을 확인해 주세요.";
    if (/already registered/i.test(m)) return "이미 가입된 이메일입니다. 로그인해 주세요.";
    if (/password should be at least/i.test(m)) return "비밀번호는 8자 이상이어야 합니다.";
    if (/rate limit|too many/i.test(m)) return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
    return m || "다시 시도해 주세요.";
  }

  function showMsg(text, ok) {
    msg.hidden = false;
    msg.textContent = text;
    msg.className = "auth-msg" + (ok ? " ok" : " err");
  }

  // 헤더 로그인 상태 표시
  async function renderAuth() {
    const { data } = await sb.auth.getSession();
    const user = data && data.session && data.session.user;
    if (!slot) return;
    if (user) {
      const meta = user.user_metadata || {};
      const name = meta.name || meta.full_name || meta.nickname || (user.email ? user.email.split("@")[0] : "성도");
      const email = user.email || "";
      const provider = (user.app_metadata && user.app_metadata.provider) || "email";
      const providerLabel = provider === "kakao" ? "카카오" : provider === "email" ? "이메일" : provider;
      const created = user.created_at ? new Date(user.created_at) : null;
      const joined = created ? `${created.getFullYear()}.${String(created.getMonth() + 1).padStart(2, "0")}.${String(created.getDate()).padStart(2, "0")}` : "";
      const avatar = meta.avatar_url || meta.picture || "";
      slot.innerHTML = `
        <div class="auth-wrap">
          <a class="auth-name" href="admin.html" title="내 정보 보기">${name}님 ▾</a>
          <div class="auth-card" role="menu">
            <div class="ac-head">
              ${avatar ? `<img class="ac-avatar" src="${avatar}" alt="" />` : '<div class="ac-avatar ac-avatar-default">👤</div>'}
              <div class="ac-meta">
                <div class="ac-name">${name}</div>
                ${email ? `<div class="ac-email">${email}</div>` : ""}
              </div>
            </div>
            <div class="ac-rows">
              <div class="ac-row"><span>가입 방식</span><strong class="prov-tag prov-${provider}">${providerLabel}</strong></div>
              ${joined ? `<div class="ac-row"><span>가입일</span><strong>${joined}</strong></div>` : ""}
            </div>
            <a class="btn btn-line ac-go" href="admin.html">내 정보 · 수정</a>
          </div>
        </div>
        <button class="auth-btn" id="logoutBtn">로그아웃</button>`;
      document.getElementById("logoutBtn").addEventListener("click", async () => {
        await sb.auth.signOut();
        location.reload();
      });
      // 직분이 지정돼 있으면 이름 옆에 붙여 표시(레이아웃의 헬퍼 재사용)
      if (window.__enhanceHeaderRole) window.__enhanceHeaderRole(user.id, name);
    } else {
      slot.innerHTML = `<button class="auth-btn" id="loginBtn">로그인</button>`;
      document.getElementById("loginBtn").addEventListener("click", () => { setMode("login"); openModal(); });
    }
  }

  // 모달 동작
  if (modal) {
    modal.addEventListener("click", (e) => { if (e.target.hasAttribute("data-close")) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });
    toggleBtn.addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));

    kakaoBtn.addEventListener("click", async () => {
      const { error } = await sb.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: location.origin + location.pathname,
          scopes: "profile_nickname", // 닉네임만 요청 (이메일은 검수 필요해 제외, KOE205 방지)
        },
      });
      if (error) showMsg("카카오 로그인 오류: " + error.message, false);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = fd.get("email"), password = fd.get("password"), name = (fd.get("name") || "").trim();
      submitBtn.disabled = true;
      try {
        if (mode === "signup") {
          if (String(password || "").length < 8) throw new Error("비밀번호는 8자 이상이어야 합니다.");
          if (!fd.get("terms")) throw new Error("이용약관과 개인정보처리방침에 동의해 주세요.");
          const wantChannel = !!fd.get("channel");
          const { error } = await sb.auth.signUp({
            email, password, options: { data: { name: name || email.split("@")[0], terms_agreed_at: new Date().toISOString() } },
          });
          if (error) throw error;
          // 채널 추가 동의 시 카카오톡 채널 추가 페이지 열기
          if (wantChannel) {
            try { window.open("https://pf.kakao.com/" + KAKAO_CHANNEL + "/friend", "_blank", "noopener"); } catch (e) {}
          }
          showMsg("가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 인증해 주세요." + (wantChannel ? " 카카오톡 채널 추가 창도 함께 열었습니다." : ""), true);
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
          closeModal();
          location.reload();
        }
      } catch (err) {
        showMsg("오류: " + friendlyError(err), false);
      } finally {
        submitBtn.disabled = false;
      }
    });

    // 비밀번호 재설정 메일 보내기 (링크는 reset.html로 연결, 1회용)
    const forgotBtn = document.getElementById("authForgot");
    if (forgotBtn) forgotBtn.addEventListener("click", async () => {
      const emailInput = form.querySelector('input[name="email"]');
      const email = (emailInput.value || "").trim();
      if (!email) { showMsg("가입하신 이메일을 위 이메일 칸에 먼저 입력해 주세요.", false); emailInput.focus(); return; }
      forgotBtn.disabled = true;
      try {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/reset.html" });
        if (error) throw error;
        showMsg("비밀번호 재설정 메일을 보냈습니다. 몇 분 안에 안 오면 스팸함을 확인해 주세요. 링크는 1회만 사용할 수 있습니다. ※ 카카오로 가입하셨다면 이 메일은 오지 않습니다 — 노란 '카카오 로그인' 버튼으로 로그인해 주세요.", true);
      } catch (err) {
        showMsg("오류: " + friendlyError(err), false);
      } finally {
        forgotBtn.disabled = false;
      }
    });
  }

  // 카카오 로그인이 정지 계정으로 거부되면 주소 해시에 오류가 담겨 돌아온다 → 안내 표시
  (function checkOAuthBanned() {
    try {
      const h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
      const desc = (h.get("error_description") || "") + " " + (h.get("error_code") || "");
      if (h.get("error") && /banned/i.test(desc)) {
        history.replaceState(null, "", location.pathname + location.search);
        if (modal) {
          setMode("login");
          openModal();
          showMsg("이용약관 위반으로 계정이 정지되었습니다. 문의는 교회로 부탁드립니다 (010-4032-2903).", false);
        } else {
          alert("이용약관 위반으로 계정이 정지되었습니다. 문의는 교회로 부탁드립니다 (010-4032-2903).");
        }
      }
    } catch (e) {}
  })();

  sb.auth.onAuthStateChange(() => renderAuth());
  renderAuth();
  window.dispatchEvent(new CustomEvent("sb-ready", { detail: { sb } }));
})();
