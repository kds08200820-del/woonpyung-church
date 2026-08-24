/* ============================================================
   운평장로교회 — 운평 말씀지기 (페이지 내장 AI 질문창)
   #askForm 이 있는 페이지에서만 작동
   추천 질문은 '이번 주 말씀'(BULLETINS)에 맞춰 자동 생성

   답변은 교회 컴퓨터(24시간 켜짐)의 Claude CLI 가 만듭니다.
     ① ai_enqueue() 로 질문을 큐(ai_jobs)에 넣고
     ② 교회 PC 워커(tools/ai_worker.py)가 가져가 답을 쓰고
     ③ 이 화면이 폴링해서 답이 오면 보여 줍니다.
     ④ 페이지를 열면 지난 질문·답변 기록(내 것만)을 불러와 이어서 보여 주고,
        답을 못 받은 질문이 있으면 이어서 기다립니다 — 질문 당시 워커가
        꺼져 있었어도 답이 사라지지 않습니다.
   (예전에는 Edge Function → 구글 Gemini 였는데, 구글 사용 한도가
    걸리면서 전부 멈춰 이 방식으로 바꿨습니다. 외부 API 키가 없습니다.)
   ============================================================ */
(function () {
  const form = document.getElementById("askForm");
  if (!form) return; // 질문창이 있는 페이지에서만
  if (!window.SUPABASE_URL) return;

  const REST = window.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
  const POLL_MS = 1500;      // 답 확인 간격(처음 30초)
  const POLL_SLOW_MS = 4000; // 30초가 지나면 천천히 확인
  const OFFLINE_MS = 45000;  // 이 시간 안에 워커가 안 가져가면 '늦어지고 있어요' 안내
  const GIVEUP_MS = 600000;  // 최대 대기(10분) — 그 뒤에도 답은 기록에 저장된다
  const HISTORY_N = 20;      // 처음 열 때 불러올 지난 문답 수
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

  // quiet=true 면 화면을 움직이지 않는다(지난 기록을 채워 넣을 때 —
  //  페이지가 갑자기 질문창으로 튀지 않도록).
  function addMsg(role, text, quiet) {
    thread.hidden = false;
    const el = document.createElement("div");
    el.className = "askai-msg " + (role === "user" ? "me" : "ai");
    const body = role === "user" ? fmt(text) : mdToHtml(text);
    el.innerHTML = `<div class="askai-bubble">${body}</div>`;
    thread.appendChild(el);
    if (!quiet) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return el;
  }
  function addTyping(quiet) {
    thread.hidden = false;
    const el = document.createElement("div");
    el.className = "askai-msg ai askai-waiting";
    el.innerHTML =
      `<div class="askai-bubble askai-typing"><span></span><span></span><span></span></div>` +
      `<div class="askai-wait" hidden></div>`;
    thread.appendChild(el);
    if (!quiet) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
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

  // 답이 올 때까지 확인한다. 질문은 이미 저장되어 있으므로 도중에 포기하지 않는다 —
  // 교회 컴퓨터가 늦게 켜져도 답이 만들어지면 이 화면(또는 다음 방문 때 기록)에 나타난다.
  //   onState('claimed')  교회 PC가 작업을 잡은 순간
  //   onState('offline')  워커가 오래 안 잡을 때(안내만 하고 계속 기다린다)
  async function waitForAnswer(token, id, onState) {
    const t0 = Date.now();
    let claimed = false, toldOffline = false;
    while (Date.now() - t0 < GIVEUP_MS) {
      await sleep(Date.now() - t0 < 30000 ? POLL_MS : POLL_SLOW_MS);
      const res = await fetch(
        REST + "/ai_jobs?id=eq." + encodeURIComponent(id) + "&select=status,result,error",
        { headers: headers(token) }
      );
      if (res.ok) {
        const row = (await res.json().catch(() => []))[0];
        if (row) {
          if (row.status === "done") return { text: row.result || "" };
          if (row.status === "error") return { error: row.error || "답변을 만들지 못했어요." };
          if (row.status === "processing" && !claimed) { claimed = true; onState && onState("claimed"); }
        }
      }
      if (!claimed && !toldOffline && Date.now() - t0 > OFFLINE_MS) {
        toldOffline = true;
        onState && onState("offline");
      }
    }
    return {
      error: claimed
        ? "답변이 평소보다 오래 걸리고 있어요. 완성되면 이 질문 기록에 저장되니, 잠시 뒤 화면을 새로고침해 확인해 주세요. 🙏"
        : "지금 말씀지기 컴퓨터가 응답하지 않고 있어요. 질문은 저장되었고, 컴퓨터가 다시 켜지면 답변이 만들어져 이 기록에 남습니다. 나중에 다시 확인해 주세요. 🙏",
      offline: !claimed,
    };
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
      const r = await waitForAnswer(token, q.id, (state) => {
        if (state === "claimed") typing.note("말씀지기가 답을 쓰고 있어요…");
        else if (state === "offline")
          typing.note("교회 컴퓨터의 응답이 늦어지고 있어요. 질문은 저장되었으니 이대로 두시면 답이 도착하는 대로 여기에 보여드려요.");
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

  // ── 지난 질문·답변 기록 — 페이지를 다시 열어도 이어서 보인다 ──
  //  질문할 때 워커가 꺼져 있어 답을 못 받았더라도, 나중에 만들어진 답이
  //  여기서 보인다. (내 질문만 — RLS 가 다른 사람 것은 막는다)
  function dayLabel(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일";
  }
  function addDay(label) {
    const el = document.createElement("div");
    el.className = "askai-day";
    el.textContent = label;
    thread.appendChild(el);
  }
  function lastQuestion(msgs) {
    if (!Array.isArray(msgs)) return "";
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m && m.role === "user" && m.content) return String(m.content);
    }
    return "";
  }

  // 아직 답이 오지 않은 지난 질문을 이어서 기다린다.
  async function resumeWait(token, id, typing, q) {
    const r = await waitForAnswer(token, id, (state) => {
      if (state === "claimed") typing.note("말씀지기가 답을 쓰고 있어요…");
      else if (state === "offline")
        typing.note("교회 컴퓨터가 켜지면 답변이 도착해요. 이대로 두셔도 괜찮아요.");
    });
    typing.remove();
    const text = (r.text || "").trim();
    if (text) {
      addMsg("ai", text, true);
      history.push({ role: "user", content: q }, { role: "assistant", content: text });
    } else {
      addMsg("ai", r.error || "답변을 만들지 못했어요. 다시 한 번 물어봐 주세요.", true);
    }
  }

  async function loadHistory(retry) {
    const token = getToken();
    if (!token) return;
    let rows = [];
    try {
      const res = await fetch(
        REST + "/ai_jobs?kind=eq.counsel" +
          "&select=id,status,result,error,created_at,messages:payload->messages" +
          "&order=created_at.desc&limit=" + HISTORY_N,
        { headers: headers(token) }
      );
      if (!res.ok) {
        console.error("[말씀지기] 기록 조회 실패", res.status);
        // 오랜만에 연 화면은 저장된 토큰이 만료돼 401이 난다 — 로그인 클라이언트가
        // 토큰을 갱신할 시간을 준 뒤 한 번 더 시도한다. (성장기와 같은 문제, 2026-08-25)
        if (!retry) setTimeout(() => loadHistory(true), 3000);
        return;
      }
      rows = (await res.json().catch(() => [])) || [];
    } catch (e) {
      if (!retry) setTimeout(() => loadHistory(true), 3000);
      return;
    }
    if (!rows.length) return;

    rows.reverse(); // 오래된 것부터 위에서 아래로
    let day = "";
    for (const row of rows) {
      const q = lastQuestion(row.messages);
      if (!q) continue;
      const d = dayLabel(row.created_at);
      if (d && d !== day) { addDay(d); day = d; }
      addMsg("user", q, true);
      if (row.status === "done" && (row.result || "").trim()) {
        addMsg("ai", row.result, true);
        history.push({ role: "user", content: q }, { role: "assistant", content: row.result });
      } else if (row.status === "error") {
        addMsg("ai", row.error || "그때는 답변을 만들지 못했어요. 다시 한 번 물어봐 주세요.", true);
      } else {
        // pending / processing — 화면을 닫는 바람에 아직 답을 못 본 질문
        const typing = addTyping(true);
        typing.note("아직 답을 기다리고 있는 질문이에요…");
        resumeWait(token, row.id, typing, q);
      }
    }
    history = history.slice(-12);
    // 스레드 안에서만 맨 아래(최근 문답)로 — 페이지 전체는 움직이지 않는다
    thread.scrollTop = thread.scrollHeight;
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); ask(); });

  buildSuggestions();
  loadHistory();
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
