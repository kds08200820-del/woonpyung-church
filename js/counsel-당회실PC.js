/* ============================================================
   운평장로교회 — 운평 말씀지기 (페이지 내장 AI 질문창)
   #askForm 이 있는 페이지에서만 작동
   추천 질문은 '이번 주 말씀'(BULLETINS)에 맞춰 자동 생성

   답변은 교회 컴퓨터(24시간 켜짐)의 Claude CLI 가 만듭니다.
     ① ai_enqueue() 로 질문을 큐(ai_jobs)에 넣고
     ② 교회 PC 워커(tools/ai_worker.py)가 가져가 답을 쓰고
     ③ 이 화면이 폴링해서 답이 오면 보여 줍니다.
   (예전에는 Edge Function → 구글 Gemini 였는데, 구글 사용 한도가
    걸리면서 전부 멈춰 이 방식으로 바꿨습니다. 외부 API 키가 없습니다.)
   ============================================================ */
(function () {
  const form = document.getElementById("askForm");
  if (!form) return; // 질문창이 있는 페이지에서만
  if (!window.SUPABASE_URL) return;

  const REST = window.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
  const POLL_MS = 1500;      // 답 확인 간격
  const OFFLINE_MS = 45000;  // 이 시간 안에 워커가 안 가져가면 '꺼져 있음'으로 안내
  const GIVEUP_MS = 240000;  // 최대 대기
  const input = document.getElementById("askInput");
  const sendBtn = document.getElementById("askSend");
  const thread = document.getElementById("askThread");
  const suggest = document.getElementById("askSuggest");

  let sb = null;
  let history = [];
  let busy = false;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (s) => esc(s).replace(/\n/g, "<br/>");

  // 마크다운 기호(**굵게**, > 인용, - 목록, # 제목)를 실제 서식으로 변환
  function inlineMd(t) {
    return t
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/_([^_\n]+)_/g, "<em>$1</em>")
      .replace(/`([^`\n]+)`/g, "$1");
  }
  function mdToHtml(src) {
    const lines = esc(src).split("\n");
    let html = "", inList = false, inQuote = false;
    const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
    const closeQuote = () => { if (inQuote) { html += "</blockquote>"; inQuote = false; } };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (/^\s*&gt;\s?/.test(line)) { // 인용( > )
        closeList();
        if (!inQuote) { html += '<blockquote class="askai-q">'; inQuote = true; }
        html += inlineMd(line.replace(/^\s*&gt;\s?/, "")) + "<br/>";
        continue;
      }
      closeQuote();
      const li = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.+)/); // 목록( - * 1. )
      if (li) {
        if (!inList) { html += '<ul class="askai-ul">'; inList = true; }
        html += "<li>" + inlineMd(li[1]) + "</li>";
        continue;
      }
      closeList();
      const h = line.match(/^\s*#{1,6}\s+(.+)/); // 제목( # )
      if (h) { html += '<strong class="askai-h">' + inlineMd(h[1]) + "</strong>"; continue; }
      if (line.trim() === "") { html += "<br/>"; continue; }
      html += inlineMd(line) + "<br/>";
    }
    closeList(); closeQuote();
    return html;
  }

  function addMsg(role, text) {
    thread.hidden = false;
    const el = document.createElement("div");
    el.className = "askai-msg " + (role === "user" ? "me" : "ai");
    const body = role === "user" ? fmt(text) : mdToHtml(text);
    el.innerHTML = `<div class="askai-bubble">${body}</div>`;
    thread.appendChild(el);
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return el;
  }
  function addTyping() {
    thread.hidden = false;
    const el = document.createElement("div");
    el.className = "askai-msg ai askai-waiting";
    el.innerHTML =
      `<div class="askai-bubble askai-typing"><span></span><span></span><span></span></div>` +
      `<div class="askai-wait" hidden></div>`;
    thread.appendChild(el);
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // 답이 오기까지 20~30초쯤 걸리므로, 멈춘 게 아니라는 것을 알려 준다.
    el.note = (t) => {
      const n = el.querySelector(".askai-wait");
      n.textContent = t || "";
      n.hidden = !t;
    };
    return el;
  }

  // ── 추천 질문: ①주일 말씀 ②오늘 큐티 ③신앙과 신학 교리 ──
  function group(no, title, items) {
    if (!items.length) return "";
    return (
      '<div class="askai-suggest-group">' +
        '<span class="askai-suggest-label"><span class="askai-grp-no">' + no + "</span>" + esc(title) + "</span>" +
        '<div class="askai-chip-row">' +
          items.map((c) => `<button type="button" class="askai-chip">${esc(c)}</button>`).join("") +
        "</div>" +
      "</div>"
    );
  }

  function buildSuggestions() {
    // ① 주일 말씀 (이번 주 설교 기반)
    const sermon = [];
    try {
      const list = (typeof BULLETINS !== "undefined") ? BULLETINS : (window.BULLETINS || null);
      const b = (list && list[0]) || null;
      if (b) {
        if (b.scripture) sermon.push(`이번 주 본문 「${b.scripture}」은 어떤 내용인가요?`);
        if (b.title) sermon.push(`설교 「${b.title}」을 쉽게 풀어 설명해 주세요`);
        if (b.scripture) sermon.push(`「${b.scripture}」에서 어려운 단어를 풀어 주세요`);
      }
    } catch (e) {}
    if (!sermon.length) sermon.push("이번 주 주일 설교 본문을 쉽게 설명해 주세요");

    // ② 오늘 큐티 (가능하면 오늘 본문 자동 반영)
    const qt = [];
    const qtRef = document.querySelector("#qtToday .qt-card-ref");
    const ref = qtRef && qtRef.textContent.trim();
    if (ref) qt.push(`오늘 QT 「${ref}」은 무슨 뜻인가요?`);
    qt.push("오늘 QT 말씀을 삶에 어떻게 적용할 수 있을까요?");
    qt.push("오늘 본문에서 하나님은 어떤 분으로 나타나나요?");

    // ③ 신앙과 신학 교리
    const doctrine = [
      "개혁주의 신앙이 무엇인지 쉽게 알려주세요",
      "구원은 어떻게 받는 건가요?",
      "하이델베르크 교리문답은 무엇인가요?",
    ];

    suggest.innerHTML =
      '<span class="askai-suggest-head">이런 걸 물어볼 수 있어요</span>' +
      group(1, "주일 말씀", sermon) +
      group(2, "오늘 큐티", qt) +
      group(3, "신앙과 신학 교리", doctrine);
    suggest.querySelectorAll(".askai-chip").forEach((btn) =>
      btn.addEventListener("click", () => { input.value = btn.textContent; ask(); })
    );
  }

  // ※ sb.auth.getSession()은 LockManager 잠금으로 멈출 수 있어 사용 금지.
  //   다른 페이지들과 동일하게 localStorage 토큰을 직접 읽습니다.
  function getToken() {
    try {
      const ref = new URL(window.SUPABASE_URL).hostname.split(".")[0];
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const sess = s && s.currentSession ? s.currentSession : s;
      return (sess && sess.access_token) || null;
    } catch (e) { return null; }
  }

  // 이번 주 설교 전문(bulletins.js의 manuscript)을 참고자료로 함께 전송
  function sermonContext() {
    try {
      const list = (typeof BULLETINS !== "undefined") ? BULLETINS : (window.BULLETINS || null);
      const b = list && list[0];
      if (b && b.manuscript) {
        return `[이번 주(${b.dateLabel || ""}) 설교 — ${b.title || ""} / ${b.scripture || ""}]\n${b.manuscript}`;
      }
    } catch (e) {}
    return "";
  }

  // ── 교회 PC(Claude CLI)에 질문을 맡기고 답을 기다린다 ──
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function headers(token) {
    return {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
      "apikey": window.SUPABASE_ANON_KEY || "",
    };
  }

  // 질문을 큐에 넣는다. 한도 초과·권한 문제는 { ok:false, error } 로 돌아온다.
  async function enqueue(token, payload) {
    const res = await fetch(REST + "/rpc/ai_enqueue", {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ p_kind: "counsel", p_payload: payload }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[말씀지기] ai_enqueue", res.status, t);
      throw new Error(
        res.status === 404
          ? "AI 준비가 아직 끝나지 않았습니다. (supabase/ai_jobs.sql 실행 필요)"
          : "질문을 보내지 못했어요. 잠시 후 다시 시도해 주세요."
      );
    }
    return await res.json();
  }

  // 답이 올 때까지 확인한다. onState('writing') 은 교회 PC가 작업을 잡은 순간.
  async function waitForAnswer(token, id, onState) {
    const t0 = Date.now();
    let claimed = false;
    while (Date.now() - t0 < GIVEUP_MS) {
      await sleep(POLL_MS);
      const res = await fetch(
        REST + "/ai_jobs?id=eq." + encodeURIComponent(id) + "&select=status,result,error",
        { headers: headers(token) }
      );
      if (res.ok) {
        const row = (await res.json().catch(() => []))[0];
        if (row) {
          if (row.status === "done") return { text: row.result || "" };
          if (row.status === "error") return { error: row.error || "답변을 만들지 못했어요." };
          if (row.status === "processing" && !claimed) { claimed = true; onState && onState(); }
        }
      }
      // 워커가 꺼져 있으면 아무리 기다려도 상태가 바뀌지 않는다 — 일찍 알려 준다.
      if (!claimed && Date.now() - t0 > OFFLINE_MS) {
        return { error: "지금은 말씀지기가 잠시 쉬고 있어요. 조금 뒤에 다시 물어봐 주세요. 🙏", offline: true };
      }
    }
    return { error: "답변이 평소보다 오래 걸리고 있어요. 잠시 후 다시 한 번 물어봐 주세요." };
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
      addMsg("ai", "이 기능은 로그인한 교인만 이용할 수 있어요. 우측 상단에서 로그인하신 뒤 다시 물어봐 주세요.");
      try { document.getElementById("loginBtnInit")?.click(); } catch (e) {}
      busy = false; sendBtn.disabled = false; return;
    }

    typing.note("교회 컴퓨터에 질문을 전하고 있어요…");
    try {
      const q = await enqueue(token, {
        messages: history.slice(-12),
        context: sermonContext(),
      });

      // 한도 초과·권한 등은 서버가 안내 문구를 그대로 담아 보낸다.
      if (!q || !q.ok) {
        typing.remove();
        addMsg("ai", (q && q.error) || "잠시 후 다시 시도해 주세요.");
        return;
      }

      typing.note("답을 기다리는 중이에요… (20~30초쯤 걸려요)");
      const r = await waitForAnswer(token, q.id, () => {
        typing.note("말씀지기가 답을 쓰고 있어요…");
      });
      typing.remove();

      const text = (r.text || "").trim();
      if (text) {
        addMsg("ai", text);
        history.push({ role: "assistant", content: text });
      } else {
        if (r.offline) console.error("[말씀지기] 교회 PC 워커 응답 없음 — ai_worker.py 실행 여부 확인");
        addMsg("ai", r.error || "죄송해요, 답변을 만들지 못했어요. 다시 한 번 물어봐 주세요.");
      }
    } catch (err) {
      typing.remove();
      addMsg("ai", (err && err.message) || "연결에 문제가 있어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      busy = false; sendBtn.disabled = false; input.focus();
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); ask(); });

  buildSuggestions();
  // 오늘 QT 본문이 비동기로 로드되면 ‘오늘 큐티’ 추천을 한 번 더 갱신
  let qtTries = 0;
  const qtTimer = setInterval(() => {
    qtTries++;
    if (document.querySelector("#qtToday .qt-card-ref")) { buildSuggestions(); clearInterval(qtTimer); }
    else if (qtTries > 12) clearInterval(qtTimer);
  }, 500);

  // Supabase 클라이언트 연결(로그인 여부 확인용)
  if (window.__sb) sb = window.__sb;
  else window.addEventListener("sb-ready", (e) => { sb = (e.detail && e.detail.sb) || window.__sb; }, { once: true });
})();
