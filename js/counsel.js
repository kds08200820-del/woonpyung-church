/* ============================================================
   운평장로교회 — 상담 AI(말씀 도우미) 위젯
   로그인한 교인에게만 노출 · Supabase Edge Function(counsel) 호출
   ============================================================ */
(function () {
  if (!window.SUPABASE_URL) return; // 백엔드 미설정 시 비활성
  const ENDPOINT = window.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/counsel";

  let sb = null;
  let signedIn = false;
  let history = []; // [{role, content}]
  let busy = false;

  const WELCOME =
    "안녕하세요, 운평 말씀지기예요. 🙏\n마음에 담긴 이야기나 신앙의 질문을 편하게 들려주세요. 함께 말씀 안에서 답을 찾아가겠습니다.";

  // ── UI 주입 ──
  const wrap = document.createElement("div");
  wrap.id = "counselWidget";
  wrap.hidden = true;
  wrap.innerHTML = `
    <button class="counsel-fab" id="counselFab" type="button" aria-label="말씀 상담 열기">
      <span class="counsel-fab-ico">💬</span><span class="counsel-fab-txt">말씀 상담</span>
    </button>
    <div class="counsel-panel" id="counselPanel" hidden role="dialog" aria-label="말씀 상담">
      <div class="counsel-head">
        <div>
          <strong>운평 말씀지기</strong>
          <span class="counsel-sub">김동석 목사님의 가르침을 학습한 AI 도우미</span>
        </div>
        <button class="counsel-x" id="counselClose" aria-label="닫기">&times;</button>
      </div>
      <div class="counsel-disclaimer">⚠️ 저는 목사님 본인이 아닌 AI예요. 위급하거나 중대한 일은 목사님(010-4032-2903)께 직접 연락해 주세요.</div>
      <div class="counsel-body" id="counselBody"></div>
      <form class="counsel-input" id="counselForm">
        <textarea id="counselText" rows="1" placeholder="마음에 있는 이야기를 들려주세요…" maxlength="1500"></textarea>
        <button type="submit" id="counselSend" aria-label="보내기">↑</button>
      </form>
    </div>`;
  document.body.appendChild(wrap);

  const fab = wrap.querySelector("#counselFab");
  const panel = wrap.querySelector("#counselPanel");
  const bodyEl = wrap.querySelector("#counselBody");
  const form = wrap.querySelector("#counselForm");
  const textEl = wrap.querySelector("#counselText");
  const sendBtn = wrap.querySelector("#counselSend");

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (s) => esc(s).replace(/\n/g, "<br/>");

  function addMsg(role, text) {
    const el = document.createElement("div");
    el.className = "counsel-msg " + (role === "user" ? "me" : "ai");
    el.innerHTML = `<div class="counsel-bubble">${fmt(text)}</div>`;
    bodyEl.appendChild(el);
    bodyEl.scrollTop = bodyEl.scrollHeight;
    return el;
  }
  function addTyping() {
    const el = document.createElement("div");
    el.className = "counsel-msg ai";
    el.innerHTML = `<div class="counsel-bubble counsel-typing"><span></span><span></span><span></span></div>`;
    bodyEl.appendChild(el);
    bodyEl.scrollTop = bodyEl.scrollHeight;
    return el;
  }

  let opened = false;
  function openPanel() {
    panel.hidden = false;
    fab.classList.add("hide");
    if (!opened) { opened = true; addMsg("ai", WELCOME); }
    setTimeout(() => textEl.focus(), 60);
  }
  function closePanel() {
    panel.hidden = true;
    fab.classList.remove("hide");
  }
  fab.addEventListener("click", openPanel);
  wrap.querySelector("#counselClose").addEventListener("click", closePanel);

  // textarea 자동 높이
  textEl.addEventListener("input", () => {
    textEl.style.height = "auto";
    textEl.style.height = Math.min(textEl.scrollHeight, 120) + "px";
  });
  textEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  async function getToken() {
    if (!sb) return null;
    try { const { data } = await sb.auth.getSession(); return data?.session?.access_token ?? null; }
    catch { return null; }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = textEl.value.trim();
    if (!msg || busy) return;
    busy = true; sendBtn.disabled = true;
    textEl.value = ""; textEl.style.height = "auto";
    addMsg("user", msg);
    history.push({ role: "user", content: msg });
    const typing = addTyping();

    const token = await getToken();
    if (!token) {
      typing.remove();
      addMsg("ai", "로그인이 필요해요. 상단의 ‘로그인’ 후 다시 이용해 주세요. 🙏");
      busy = false; sendBtn.disabled = false; return;
    }

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
          "apikey": window.SUPABASE_ANON_KEY || "",
        },
        body: JSON.stringify({ messages: history.slice(-12) }),
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();
      if (!res.ok) {
        addMsg("ai", data.error || "잠시 후 다시 시도해 주세요.");
      } else {
        addMsg("ai", data.reply);
        history.push({ role: "assistant", content: data.reply });
      }
    } catch {
      typing.remove();
      addMsg("ai", "연결에 문제가 있어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      busy = false; sendBtn.disabled = false; textEl.focus();
    }
  });

  // ── 로그인 상태에 따라 위젯 표시 ──
  async function refresh() {
    if (!sb) return;
    try {
      const { data } = await sb.auth.getSession();
      signedIn = !!data?.session;
    } catch { signedIn = false; }
    wrap.hidden = !signedIn;
    if (!signedIn) closePanel();
  }

  function bind(client) {
    sb = client;
    refresh();
    try { sb.auth.onAuthStateChange(() => refresh()); } catch (e) {}
  }

  if (window.__sb) bind(window.__sb);
  else window.addEventListener("sb-ready", (e) => bind((e.detail && e.detail.sb) || window.__sb), { once: true });
})();
