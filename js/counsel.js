/* ============================================================
   운평장로교회 — 운평 말씀지기 (페이지 내장 AI 질문창)
   #askForm 이 있는 페이지에서만 작동 · Supabase Edge Function(counsel) 호출
   추천 질문은 '이번 주 말씀'(BULLETINS)에 맞춰 자동 생성
   ============================================================ */
(function () {
  const form = document.getElementById("askForm");
  if (!form) return; // 질문창이 있는 페이지에서만
  if (!window.SUPABASE_URL) return;

  const ENDPOINT = window.SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/counsel";
  const input = document.getElementById("askInput");
  const sendBtn = document.getElementById("askSend");
  const thread = document.getElementById("askThread");
  const suggest = document.getElementById("askSuggest");

  let sb = null;
  let history = [];
  let busy = false;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (s) => esc(s).replace(/\n/g, "<br/>");

  function addMsg(role, text) {
    thread.hidden = false;
    const el = document.createElement("div");
    el.className = "askai-msg " + (role === "user" ? "me" : "ai");
    el.innerHTML = `<div class="askai-bubble">${fmt(text)}</div>`;
    thread.appendChild(el);
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return el;
  }
  function addTyping() {
    thread.hidden = false;
    const el = document.createElement("div");
    el.className = "askai-msg ai";
    el.innerHTML = `<div class="askai-bubble askai-typing"><span></span><span></span><span></span></div>`;
    thread.appendChild(el);
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return el;
  }

  // ── 추천 질문(이번 주 말씀 기반 + 일반) ──
  function buildSuggestions() {
    const chips = [];
    try {
      const list = (typeof BULLETINS !== "undefined") ? BULLETINS : (window.BULLETINS || null);
      const b = (list && list[0]) || null;
      if (b) {
        if (b.scripture) chips.push(`이번 주 본문 「${b.scripture}」은 어떤 내용인가요?`);
        if (b.title) chips.push(`설교 「${b.title}」을 쉽게 풀어 설명해 주세요`);
        if (b.scripture) chips.push(`「${b.scripture}」에서 어려운 단어를 풀어 주세요`);
      }
    } catch (e) {}
    chips.push("요즘 마음이 많이 힘든데, 위로가 되는 말씀이 있을까요?");
    chips.push("오늘 QT 본문은 어떻게 묵상하면 좋을까요?");
    chips.push("개혁주의 신앙이 무엇인지 쉽게 알려주세요");

    suggest.innerHTML =
      '<span class="askai-suggest-label">이런 걸 물어볼 수 있어요</span>' +
      chips.slice(0, 6).map((c) => `<button type="button" class="askai-chip">${esc(c)}</button>`).join("");
    suggest.querySelectorAll(".askai-chip").forEach((btn) =>
      btn.addEventListener("click", () => { input.value = btn.textContent; ask(); })
    );
  }

  async function getToken() {
    if (!sb) return null;
    try { const { data } = await sb.auth.getSession(); return data?.session?.access_token ?? null; }
    catch { return null; }
  }

  async function ask() {
    const msg = (input.value || "").trim();
    if (!msg || busy) return;
    busy = true; sendBtn.disabled = true;
    input.value = "";
    addMsg("user", msg);
    history.push({ role: "user", content: msg });
    const typing = addTyping();

    const token = await getToken();
    if (!token) {
      typing.remove();
      addMsg("ai", "이 기능은 로그인한 교인만 이용할 수 있어요. 우측 상단에서 로그인하신 뒤 다시 물어봐 주세요. 🙏");
      try { document.getElementById("loginBtnInit")?.click(); } catch (e) {}
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
      busy = false; sendBtn.disabled = false; input.focus();
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); ask(); });

  buildSuggestions();

  // Supabase 클라이언트 연결(로그인 여부 확인용)
  if (window.__sb) sb = window.__sb;
  else window.addEventListener("sb-ready", (e) => { sb = (e.detail && e.detail.sb) || window.__sb; }, { once: true });
})();
