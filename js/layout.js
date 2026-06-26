/* ============================================================
   운평장로교회 — 공유 레이아웃 (모든 페이지 공통)
   헤더(5대메뉴)·푸터·설치배너 주입 + 스크롤/모바일메뉴 + PWA/푸시
   ============================================================ */
(function () {
  const NAV = [
    { href: "welcome.html", label: "처음 오셨나요" },
    { href: "word.html", label: "말씀으로" },
    { href: "grow.html", label: "함께 자라기" },
    { href: "world.html", label: "지역과 세상" },
    { href: "story.html", label: "우리 이야기" },
    { href: "community.html", label: "나눔터" },
  ];

  const path = location.pathname.split("/").pop() || "index.html";

  // ===== 헤더 =====
  const navLinks = NAV.map(
    (n) => `<a href="${n.href}"${path === n.href ? ' class="active"' : ""}>${n.label}</a>`
  ).join("");

  const headerHTML = `
    <header id="header">
      <div class="nav-inner">
        <a href="index.html" class="logo">
          <img src="images/icon-192.png?v=20260625e" alt="" class="logo-mark" />
          <span class="logo-txt">
            <span class="logo-kr">운평장로교회</span>
            <span class="logo-en">UNPYEONG CHURCH</span>
          </span>
        </a>
        <nav class="nav-menu" id="navMenu">${navLinks}</nav>
        <div class="auth-slot" id="authSlot"></div>
        <button class="nav-toggle" id="navToggle" aria-label="메뉴 열기"><span></span><span></span><span></span></button>
      </div>
    </header>`;
  document.body.insertAdjacentHTML("afterbegin", headerHTML);

  // ===== 푸터 =====
  const footerHTML = `
    <footer class="footer">
      <div class="container footer-inner">
        <div class="footer-brand">
          <span class="logo-kr">운평장로교회</span>
          <span class="logo-en">UNPYEONG PRESBYTERIAN CHURCH · SINCE 1964</span>
        </div>
        <nav class="footer-nav">${NAV.map((n) => `<a href="${n.href}">${n.label}</a>`).join("")}<a href="prayer.html">기도</a><a href="bylaws.html">정관</a><a href="privacy.html">개인정보처리방침</a></nav>
        <a class="kakao-channel-btn" href="https://pf.kakao.com/_xkdNxfX" target="_blank" rel="noopener">💬 카카오톡 채널 추가</a>
        <div class="footer-meta">
          <p>담임목사 김동석 · 원로목사 김충현 · 협동목사 안창선</p>
          <p>화성특례시 만세구 우정읍 운평길 47 · T. <a href="tel:010-4032-2903">010-4032-2903</a></p>
          <p class="copy">© 2026 Unpyeong Presbyterian Church. All rights reserved.</p>
        </div>
      </div>
    </footer>
    <div class="install-bar" id="installBar" hidden>
      <img src="images/icon-192.png?v=20260625e" alt="운평교회" class="install-icon" />
      <div class="install-text">
        <strong>운평장로교회 앱 설치</strong>
        <span id="installMsg">홈 화면에 추가하여 앱처럼 사용하세요.</span>
      </div>
      <button class="install-go" id="installGo">설치</button>
      <button class="install-close" id="installClose" aria-label="닫기">&times;</button>
    </div>

    <!-- 로그인/회원가입 모달 -->
    <div class="modal" id="authModal" hidden>
      <div class="modal-backdrop" data-close></div>
      <div class="modal-box modal-box-auth" role="dialog" aria-modal="true" aria-label="로그인">
        <button class="modal-close" data-close aria-label="닫기">&times;</button>
        <div class="auth-head">
          <img src="images/icon-192.png?v=20260625e" alt="" class="auth-logo" />
          <h3 id="authTitle">로그인</h3>
          <p id="authSubtitle">운평장로교회 나눔터에 오신 것을 환영합니다.</p>
        </div>
        <button class="kakao-btn" id="kakaoLogin"><span>💬</span> 카카오로 시작하기</button>
        <div class="auth-divider"><span>또는 이메일로</span></div>
        <form id="authForm" class="auth-form">
          <div class="form-field" id="nameField" hidden><label>이름</label><input type="text" name="name" placeholder="홍길동" /></div>
          <div class="form-field"><label>이메일</label><input type="email" name="email" required placeholder="name@example.com" /></div>
          <div class="form-field"><label>비밀번호</label><input type="password" name="password" required minlength="6" placeholder="6자 이상" /></div>
          <p class="auth-msg" id="authMsg" hidden></p>
          <button type="submit" class="btn btn-solid auth-submit" id="authSubmit">로그인</button>
        </form>
        <p class="auth-switch">처음이신가요? <button type="button" id="authToggle">회원가입</button></p>
      </div>
    </div>`;
  document.body.insertAdjacentHTML("beforeend", footerHTML);

  // ===== 헤더 스크롤 상태 =====
  const header = document.getElementById("header");
  const hasHero = !!document.querySelector(".hero, .page-hero");
  const onScroll = () => {
    if (window.scrollY > 60 || !hasHero) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ===== 모바일 메뉴 =====
  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");
  navToggle.addEventListener("click", () => {
    navMenu.classList.toggle("open");
    header.classList.toggle("menu-open");
  });
  navMenu.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      navMenu.classList.remove("open");
      header.classList.remove("menu-open");
    })
  );

  // ===== 서비스 워커(PWA) =====
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // ===== 푸시 알림(OneSignal) — App ID 설정 시에만 =====
  if (window.ONESIGNAL_APP_ID) {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const s = document.createElement("script");
    s.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
    s.defer = true;
    document.head.appendChild(s);
    window.OneSignalDeferred.push(async function (OneSignal) {
      try {
        await OneSignal.init({
          appId: window.ONESIGNAL_APP_ID,
          serviceWorkerPath: "OneSignalSDKWorker.js",
          serviceWorkerParam: { scope: "/woonpyung-church/onesignal/" },
          allowLocalhostAsSecureOrigin: true,
          notifyButton: {
            enable: true,
            size: "medium",
            position: "bottom-right",
            text: {
              "tip.state.unsubscribed": "매일 QT 알림 받기",
              "tip.state.subscribed": "QT 알림을 받고 있습니다",
              "tip.state.blocked": "알림이 차단되어 있습니다",
              "message.prenotify": "클릭하여 매일 아침 QT 알림을 받으세요",
              "message.action.subscribed": "이제 매일 아침 QT를 받습니다 🙏",
              "message.action.resubscribed": "QT 알림을 다시 받습니다 🙏",
              "message.action.unsubscribed": "QT 알림을 끕니다",
              "dialog.main.title": "운평장로교회 QT 알림",
              "dialog.main.button.subscribe": "알림 받기",
              "dialog.main.button.unsubscribe": "알림 끄기",
              "dialog.blocked.title": "알림 차단 해제",
              "dialog.blocked.message": "브라우저 설정에서 알림을 허용해 주세요.",
            },
          },
        });
      } catch (e) {
        /* 대시보드 Web 설정 완료 전에는 조용히 무시 */
      }
    });
  }

  // ===== 회원/로그인(Supabase) — 키 설정 시에만 로드 =====
  if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    // SDK 로딩 전에도 로그인 버튼이 항상 보이도록 즉시 표시(아래 auth.js가 업그레이드)
    const slot0 = document.getElementById("authSlot");
    if (slot0) {
      slot0.innerHTML = '<button class="auth-btn" id="loginBtnInit">로그인</button>';
      document.getElementById("loginBtnInit").addEventListener("click", () => {
        const m = document.getElementById("authModal");
        if (m) { m.hidden = false; document.body.style.overflow = "hidden"; }
      });
    }
    const sdk = document.createElement("script");
    sdk.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    sdk.onload = function () {
      const auth = document.createElement("script");
      auth.src = "js/auth.js?v=20260626v";
      document.body.appendChild(auth);
    };
    // SDK 로드 실패 시에도 버튼은 유지(클릭 시 모달은 위 핸들러가 처리)
    document.head.appendChild(sdk);
  } else {
    const slot = document.getElementById("authSlot");
    if (slot) slot.innerHTML = '<span class="auth-pending" title="로그인 기능 준비 중">로그인</span>';
  }
})();
