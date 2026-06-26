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
  const submitBtn = document.getElementById("authSubmit");
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
    toggleBtn.textContent = m === "login" ? "회원가입" : "로그인하기";
    document.querySelector(".auth-switch").firstChild.textContent =
      m === "login" ? "처음이신가요? " : "이미 회원이신가요? ";
    msg.hidden = true;
  }

  function showMsg(text, ok) {
    msg.hidden = false;
    msg.textContent = text;
    msg.className = "auth-msg" + (ok ? " ok" : " err");
  }

  // 헤더 로그인 상태 표시
  async function renderAuth() {
    const { data } = await sb.auth.getUser();
    const user = data && data.user;
    if (!slot) return;
    if (user) {
      const name =
        (user.user_metadata && (user.user_metadata.name || user.user_metadata.full_name)) ||
        (user.email ? user.email.split("@")[0] : "성도");
      slot.innerHTML = `<span class="auth-name">${name}님</span><button class="auth-btn" id="logoutBtn">로그아웃</button>`;
      document.getElementById("logoutBtn").addEventListener("click", async () => {
        await sb.auth.signOut();
        location.reload();
      });
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
          const { error } = await sb.auth.signUp({
            email, password, options: { data: { name: name || email.split("@")[0] } },
          });
          if (error) throw error;
          showMsg("가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 인증해 주세요.", true);
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
          closeModal();
          location.reload();
        }
      } catch (err) {
        showMsg("오류: " + (err.message || "다시 시도해 주세요."), false);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  sb.auth.onAuthStateChange(() => renderAuth());
  renderAuth();
  window.dispatchEvent(new CustomEvent("sb-ready", { detail: { sb } }));
})();
