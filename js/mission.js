/* ============================================================
   운평장로교회 — 구제선교위원회 (mission.html)
   왼쪽 메뉴에서 회기(연도)를 고르면 그 회기의 화면을 같은 틀로 그린다.
   회기 = 12월 1일 ~ 이듬해 11월 30일. 새 회기는 서버(mission_home)가 날짜를 보고 저절로 더한다.

   1) 회원      : 그 회기에 선교헌금을 1회 이상 낸 사람 — rpc mission_committee(p_year). 금액은 받지 않는다.
   2) 임원      : rpc mission_officer_list(p_year). 정하는 것은 관리자(표 mission_officers).
                  임명된 직책에 따라 권한이 붙는다 — 서기: 일정·활동·동향, 회계: 회계 장부·엑셀 올리기.
   3) 일정      : 표 mission_events (서기)
   4) 활동·동향 : 표 mission_posts.kind (서기)
   5) 회계 보고 : rpc mission_report(p_year) — 장부(mission_ledger)가 있으면 장부에서 계산한 표,
                  없으면 올려 둔 보고서. 장부·엑셀 올리기는 회계(js/mission-ledger.js 가 읽고 분류).
   6) 후원처    : 표 mission_partners (관리자) — 회기와 상관없이 같다.

   SQL: supabase/20261110_1900 · 20261112_1930 · 20261112_2100 · 20261113_1200
   20261113_1200 을 아직 실행하지 않은 곳에서는 임원·일정·장부 칸이 나오지 않고 나머지는 그대로 돈다.
   ============================================================ */
(function () {
  const $ = (id) => document.getElementById(id);
  const boxMember = $("msMember"), boxBoard = $("msBoard"), boxPartners = $("msPartners");
  if (!boxMember && !boxBoard && !boxPartners) return;
  const boxSide = $("msSide"), boxOfficers = $("msOfficers"), boxEvents = $("msEvents");

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, "<br>");
  const dot = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}.${m[2]}.${m[3]}` : ""; };
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "");
  const nowIso = () => new Date().toISOString();

  function ready() { return !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY); }
  function localSession() {
    try {
      const ref = new URL(window.SUPABASE_URL).hostname.split(".")[0];
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.currentSession ? s.currentSession : s;
    } catch (e) { return null; }
  }
  const currentUser = () => { const s = localSession(); return (s && s.user) || null; };
  const displayName = (u) => (u && u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name)) || (u && u.email ? u.email.split("@")[0] : "관리자");
  async function api(method, path, body, extra) {
    const sess = localSession();
    const headers = { apikey: window.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (sess && sess.access_token) headers.Authorization = "Bearer " + sess.access_token;
    if (extra) Object.assign(headers, extra);
    const res = await fetch(window.SUPABASE_URL + "/rest/v1/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!res.ok) { const m = (data && (data.message || data.error)) || ("HTTP " + res.status); const e = new Error(m); e.status = res.status; throw e; }
    return data;
  }
  let _admin = null;
  async function isAdmin() {
    if (_admin !== null) return _admin;
    const me = currentUser();
    if (!me || !me.id || !ready()) { _admin = false; return false; }
    try { const r = await api("GET", `admins?uid=eq.${me.id}&select=uid`); _admin = Array.isArray(r) && r.length > 0; }
    catch (e) { _admin = false; }
    return _admin;
  }

  // 회기 연도 — 서버 답이 없을 때 쓰는 기본 규칙(12월 시작, 끝나는 해로 부른다). 서버 답이 오면 그 값을 쓴다.
  const FIRST_YEAR = 2026;
  function guessFY() { const d = new Date(); return d.getMonth() + 1 >= 12 ? d.getFullYear() + 1 : d.getFullYear(); }
  function guessRange(y) { return { from: `${y - 1}-12-01`, to: `${y}-11-30` }; }
  function yearFromUrl() { const m = /[?&]y=(\d{4})\b/.exec(location.search); return m ? Number(m[1]) : null; }

  const S = {
    admin: false,
    home: null,             // rpc mission_home 답 (없으면 null = 20261113_1200 실행 전)
    fy: guessFY(),          // 지금 회기
    year: yearFromUrl(),    // 고른 회기
    mem: null,              // rpc mission_committee 답
    rep: null,              // rpc mission_report 답 — 회원·임원·재정 담당만
    officers: null,         // [{role,name}] (없으면 null)
    events: null,           // 고른 회기 일정 (없으면 null)
    posts: null,            // null = 표 없음, [] = 글 없음 (모든 회기)
    partners: null,
    kind: "all",            // 활동·동향 거르기
  };
  // 회기 목록 + 다음 회기(준비) — 다음 회기 임원 · 일정을 미리 넣어 둘 수 있다. 12월 1일에 서버(mission_fy)가 새 회기를 '지금'으로 돌리면
  // 그 회기가 저절로 맨 위 '지금'이 되고, 그다음 회기가 새로 '준비'로 붙는다(2026-11-14 담임목사 지시)
  function years() {
    let ys;
    if (S.home && Array.isArray(S.home.years) && S.home.years.length) ys = S.home.years.slice();
    else { ys = []; for (let y = Math.max(S.fy, FIRST_YEAR); y >= FIRST_YEAR; y--) ys.push(y); }
    if (ys.indexOf(S.fy + 1) < 0) ys.push(S.fy + 1);
    return ys.sort((a, b) => b - a);
  }
  function hasRole(role) { return !!(S.home && S.home.my && (S.home.my.roles || []).some((r) => r.year === S.year && r.role === role)); }
  const canSec = () => S.admin || hasRole("서기");                                       // 일정·활동·동향
  // 그 회기 임원(직책 상관없이) · 관리자 · 재정 담당 — '임원 업무' 칸을 본다
  const isStaff = () => !!S.home && (S.admin || !!(S.home.my && S.home.my.finance) || !!(S.home.my && (S.home.my.roles || []).some((r) => r.year === S.year || r.year === S.fy)));
  const canBook = () => !!S.home && (S.admin || !!(S.home.my && S.home.my.finance) || hasRole("회계"));   // 회계 장부

  /* ───────── 왼쪽 메뉴 ───────── */
  function renderSide() {
    if (!boxSide) return;
    const links = [];
    const sj = $("join"); if (sj && !sj.hidden) links.push(["join", "정회원"]);
    links.push(["member", "회원"]);
    if (S.home) links.push(["officers", "임원"], ["schedule", "일정"]);
    links.push(["ministry", "활동과 동향"]);
    if ((S.rep && S.rep.doc) || canBook()) links.push(["finance", "회계 보고"]);
    links.push(["partners", "후원하는 곳"], ["bylaws", "회칙"]);
    boxSide.innerHTML = `<nav class="ms-side-in" aria-label="회기와 차례">
      <p class="ms-side-h">회기</p>
      <ul class="ms-side-years">${years().map((y) => `<li><button type="button" class="${y === S.year ? "on" : ""}" data-y="${y}">${y}년도${y === S.fy ? ` <small>지금</small>` : y > S.fy ? ` <small>준비</small>` : isClosed(y) ? ` <small>마감</small>` : ""}</button></li>`).join("")}</ul>
      <p class="ms-side-h">${esc(S.year)}년도</p>
      <ul class="ms-side-links">${links.map((l) => `<li><a href="#${l[0]}">${l[1]}</a></li>`).join("")}</ul>
      ${sideAdmin()}
    </nav>`;
    boxSide.querySelectorAll("[data-y]").forEach((b) => b.addEventListener("click", () => pickYear(Number(b.dataset.y))));
    boxSide.querySelectorAll("[data-adm]").forEach((b) => b.addEventListener("click", () => sideAct(b.dataset.adm)));
    document.querySelectorAll(".ms-y").forEach((el) => { el.textContent = S.year + "년도"; });
    const so = $("officers"), se = $("schedule");
    if (so) so.hidden = !S.home; if (se) se.hidden = !S.home;
  }
  async function pickYear(y) {
    if (y === S.year) return;
    S.year = y; S.kind = "all";
    picked = true;
    try { const u = new URL(location.href); if (y === S.fy) u.searchParams.delete("y"); else u.searchParams.set("y", y); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch (e) { }
    renderSide();
    await loadYear();
    renderAll();
  }


  /* ───────── 임원 관리 (2026-11-14) — 왼쪽 메뉴 아래, 회기 차례와 따로. 그 회기(또는 지금 회기) 임원 · 관리자 · 재정 담당에게만 ─────────
     권한 있는 단추만 보인다. 장부 · 회비 · 명부 · 일정은 고른 회기(위 회기 단추)에 대해 열린다. */
  // 회기 마감 기록(20261114_2200 실행 뒤에만 서버가 closed 를 준다 — 없으면 마감 단추를 그리지 않는다)
  const termReady = () => !!(S.home && Array.isArray(S.home.closed));
  const isClosed = (y) => termReady() && S.home.closed.indexOf(y) >= 0;
  function sideAdmin() {
    if (!isStaff()) return "";
    const MJ = window.MissionJoin, mjOk = !!(MJ && MJ.state && MJ.state.ok);
    const book = canBook(), secr = canSec();
    const items = [];
    if (book) items.push(["book", "회계 장부 · 엑셀"]);
    if (book && mjOk) items.push(["dues", "회비 체크 · 회비 계좌"]);
    if (mjOk) items.push(["roster", "정회원 · 가입 승인 · 실행위원"]);
    if (secr) items.push(["event", "일정 넣기"], ["post", "활동 · 동향 글 쓰기"]);
    if (S.admin) items.push(["off", "임원 정하기"]);
    if (S.admin && termReady()) {
      if (S.year <= S.fy && !isClosed(S.year)) items.push(["close", `${S.year}년도 회기 마감`]);
      const last = S.home.closed.length ? Math.max(...S.home.closed) : null;
      if (last !== null && S.year === last) items.push(["reopen", `${last}년도 마감 취소`]);
    }
    if (!items.length) return "";
    const mine = (S.home.my.roles || []).filter((r) => r.year === S.year).map((r) => r.role);
    const who = S.admin ? "관리자" : (S.home.my.finance ? "재정 담당" : mine.join(" · "));
    return `<p class="ms-side-h ms-side-adm-h">임원 관리${who ? ` <small>${esc(who)}</small>` : ""}</p>
      <ul class="ms-side-links ms-side-adm">${items.map((x) => `<li><button type="button" data-adm="${x[0]}">${x[1]}</button></li>`).join("")}</ul>`;
  }
  function sideAct(k) {
    const MJ = window.MissionJoin;
    if (k === "book") openBook();
    else if ((k === "dues" || k === "roster") && MJ) MJ.openRoster();
    else if (k === "event") openEvent(null);
    else if (k === "post") openPost(null);
    else if (k === "off") openOfficers();
    else if (k === "close") closeTerm(S.year);
    else if (k === "reopen") reopenTerm(S.year);
  }
  async function closeTerm(y) {
    if (!confirm(`${y}년도 회기를 마감할까요?\n\n마감하면 ${y + 1}년도가 '지금' 회기가 되고, ${y + 2}년도가 '준비' 회기로 새로 생깁니다.\n${y}년도 자료는 그대로 남고 왼쪽 회기 단추로 언제든 볼 수 있습니다.`)) return;
    try { await api("POST", "rpc/mission_term_close", { p_year: y }); picked = false; await refresh(); alert(`${y}년도 회기를 마감했습니다. 이제 ${y + 1}년도가 지금 회기입니다.`); }
    catch (e) { alert("마감하지 못했습니다: " + e.message); }
  }
  async function reopenTerm(y) {
    if (!confirm(`${y}년도 회기 마감을 취소할까요? ${y}년도가 다시 '지금' 회기가 됩니다.`)) return;
    try { await api("POST", "rpc/mission_term_reopen", { p_year: y }); picked = false; await refresh(); }
    catch (e) { alert("취소하지 못했습니다: " + e.message); }
  }

  /* ───────── 1) 회원 ───────── */
  const VIS = [
    ["members", "회원 수는 누구나, 명단은 그 회기 회원(로그인)에게"],
    ["count", "회원 수는 누구나, 명단은 관리자·재정 담당만"],
    ["names", "회원 수는 누구나, 이름은 교적에 연결된 성도(로그인)에게"],
    ["admin", "회원 수와 명단 모두 관리자·재정 담당만"],
  ];
  /* 회계 보고 — rpc mission_report 가 준 표를 그린다(장부에서 계산한 것이든 올려 둔 보고서든 같은 틀) */
  function won(n) { return Number(n || 0).toLocaleString("ko-KR"); }
  function wonCell(n) { return n ? won(n) : "-"; }
  function barsMonthly(rows) {      // 달마다 수입·지출 막대 두 개
    if (!rows.length) return "";
    const W = 640, H = 220, L = 56, B = 28, T = 12, R = 8;
    const max = Math.max(1, ...rows.map((r) => Math.max(r.income, r.spend)));
    const step = Math.max(1, Math.pow(10, Math.floor(Math.log10(max))) / 2), top = Math.ceil(max / step) * step;
    const cw = (W - L - R) / rows.length, bw = Math.min(16, cw * 0.36);
    const y = (v) => T + (H - T - B) * (1 - v / top);
    let g = "";
    for (let v = 0; v <= top + 1; v += step) { const yy = y(v);
      g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="ms-ch-grid"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" class="ms-ch-ax">${esc(won(Math.round(v / 10000)))}만</text>`; }
    rows.forEach((r, i) => { const x = L + cw * i + cw / 2;
      g += `<rect x="${x - bw - 1}" y="${y(r.income)}" width="${bw}" height="${y(0) - y(r.income)}" class="ms-ch-in"><title>${esc(r.ym)} 수입 ${esc(won(r.income))}원</title></rect>`;
      g += `<rect x="${x + 1}" y="${y(r.spend)}" width="${bw}" height="${y(0) - y(r.spend)}" class="ms-ch-out"><title>${esc(r.ym)} 지출 ${esc(won(r.spend))}원</title></rect>`;
      g += `<text x="${x}" y="${H - 8}" text-anchor="middle" class="ms-ch-ax">${esc(String(r.ym).slice(2).replace("-", "."))}</text>`; });
    return `<figure class="ms-chart"><figcaption>월별 수입·지출 <span class="ms-key"><i class="ms-ch-in"></i>수입 <i class="ms-ch-out"></i>지출</span></figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="월별 수입과 지출 막대 그래프">${g}</svg></figure>`;
  }
  function barsItems(list, key, cls, title) {      // 항목별 가로 막대(큰 것부터)
    const rows = list.filter((x) => x[key] > 0).sort((a, b) => b[key] - a[key]);
    if (!rows.length) return "";
    const max = rows[0][key];
    return `<figure class="ms-chart"><figcaption>${esc(title)}</figcaption><div class="ms-hbars">${rows.map((x) =>
      `<div class="ms-hbar"><span class="ms-hbar-l">${esc(x.label)}</span><span class="ms-hbar-t"><i class="${cls}" style="width:${Math.max(1, Math.round(x[key] / max * 100))}%"></i></span><span class="ms-hbar-v">${esc(won(x[key]))}</span></div>`).join("")}</div></figure>`;
  }
  function reportHtml(d) {
    const p = d.period || {};
    const sum = (d.summary || []).map((x) => `<tr><th>${esc(x.label)}</th><td>${esc(won(x.amount))}</td></tr>`).join("");
    const mon = (d.monthly || []).map((x) => `<tr><td>${esc(x.ym)}</td><td>${esc(wonCell(x.income))}</td><td>${esc(wonCell(x.spend))}</td><td class="${x.net < 0 ? "neg" : ""}">${esc(won(x.net))}</td><td>${esc(won(x.balance))}</td></tr>`).join("");
    const it = (d.items || []);
    const itRows = it.map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(wonCell(x.income))}</td><td>${esc(wonCell(x.spend))}</td><td>${esc(x.n)}</td></tr>`).join("");
    const itIn = it.reduce((a, x) => a + x.income, 0), itOut = it.reduce((a, x) => a + x.spend, 0), itN = it.reduce((a, x) => a + x.n, 0);
    const day = (d.daily || []).map((x) => `<tr><td>${esc(x.date)}</td><td>${esc(wonCell(x.income))}</td><td>${esc(wonCell(x.spend))}</td><td class="${x.net < 0 ? "neg" : ""}">${esc(won(x.net))}</td><td>${esc(won(x.balance))}</td></tr>`).join("");
    return `<div class="ms-report" id="report">
      <h4>${esc(d.title || "회계 보고서")} <small class="ms-names-who">(회원과 관리자·재정 담당에게 보입니다)</small></h4>
      <p class="ms-report-meta">${esc(String(d.officers || "").replace(/\s*\n\s*/g, " · "))}${p.from ? `${d.officers ? " · " : ""}보고 기간 ${esc(dot(p.from))} ~ ${esc(dot(p.to))}` : ""}</p>
      ${d.intro ? `<p class="ms-report-intro">${esc(d.intro)}</p>` : ""}
      <h5>수입 지출 총괄 <small>(단위: 원)</small></h5>
      <table class="ms-report-t ms-report-sum-t"><tbody>${sum}</tbody></table>
      <details class="ms-report-more"><summary>월별 · 항목별 · 날짜별 자세한 자료 펼쳐 보기</summary>
      <h5>월별 수입 지출</h5>
      ${barsMonthly(d.monthly || [])}
      <div class="ms-tscroll"><table class="ms-report-t"><thead><tr><th>월</th><th>수입</th><th>지출</th><th>수지</th><th>잔액</th></tr></thead><tbody>${mon}</tbody></table></div>
      <h5>항목별 수입 지출</h5>
      <div class="ms-report-cols">${barsItems(it, "income", "ms-ch-in", "항목별 수입")}${barsItems(it, "spend", "ms-ch-out", "항목별 지출")}</div>
      <div class="ms-tscroll"><table class="ms-report-t"><thead><tr><th>항목</th><th>수입</th><th>지출</th><th>건수</th></tr></thead><tbody>${itRows}</tbody>
        <tfoot><tr><th>합계</th><td>${esc(won(itIn))}</td><td>${esc(won(itOut))}</td><td>${esc(itN)}</td></tr></tfoot></table></div>
      <details class="ms-report-daily"><summary>날짜별 수입 지출 (${esc((d.daily || []).length)}일) 펼쳐 보기</summary>
        <div class="ms-tscroll"><table class="ms-report-t"><thead><tr><th>날짜</th><th>수입</th><th>지출</th><th>수지</th><th>잔액</th></tr></thead><tbody>${day}</tbody></table></div>
      </details>
      </details>
    </div>`;
  }
  function renderReport() {
    const sec = $("finance"), box = $("msReport");
    if (!sec || !box) return;
    const rp = S.rep, has = !!(rp && rp.doc && Array.isArray(rp.doc.summary));
    if (!has && !canBook()) { sec.hidden = true; box.innerHTML = ""; return; }
    sec.hidden = false;
    let h = "";
    if (canBook()) {
      h += `<div class="ms-book-bar"><span>회계 장부 <small class="ms-names-who">(회계·관리자·재정 담당)</small></span>
        <span class="ms-book-btns"><button type="button" class="btn btn-line ms-btn-s" id="msBookOpen">장부 열기 · 엑셀 올리기</button></span></div>`;
    }
    if (has) h += reportHtml(rp.doc);
    else h += `<p class="ms-empty">이 회기의 회계 보고가 아직 없습니다. 장부에 거래를 넣거나 엑셀을 올리면 보고서 표가 만들어집니다.</p>`;
    box.innerHTML = h;
    const bo = $("msBookOpen"); if (bo) bo.addEventListener("click", openBook);
  }
  function renderMember() {
    if (!boxMember) return;
    const m = S.mem;
    const y = m ? m.year : S.year;
    const r = m ? { from: m.from, to: m.to } : guessRange(y);
    let h = `<p class="ms-member-term">${esc(y)}년도 회기 · ${esc(dot(r.from))} ~ ${esc(dot(r.to))}</p>`;
    if (m && m.count != null) h += `<p class="ms-member-count">회원<b>${esc(m.count)}</b>명</p>`;
    h += `<p class="ms-member-rule">이 회기 안에 선교헌금을 한 번 이상 드린 성도가 회원입니다.</p>`;
    if (m && m.me === true) h += `<p class="ms-member-me">${esc(y)}년도 회기 구제선교위원회 회원이십니다.</p>`;
    else if (m && m.me === false && !m.staff) h += `<p class="ms-member-me">이 회기에 드린 선교헌금 기록이 아직 없습니다.</p>`;

    if (m && Array.isArray(m.detail)) {
      h += `<div class="ms-names"><h4>회원 명단 <small class="ms-names-who">(${m.visibility === "members" ? "회원과 관리자·재정 담당에게 보입니다" : m.visibility === "names" ? "교적에 연결된 성도와 관리자·재정 담당에게 보입니다" : "관리자·재정 담당에게만 보입니다"})</small></h4>
        <p class="ms-names-note">점선 테두리는 교적에 연결되지 않아 헌금자 이름으로 센 분입니다.</p>
        ${m.detail.length ? `<ul class="ms-name-list">${m.detail.map((d) => `<li class="${d.linked ? "" : "unlinked"}">${esc(d.name)}</li>`).join("")}</ul>` : `<p class="ms-empty">이 회기에 선교헌금을 드린 분이 아직 없습니다.</p>`}
      </div>`;
    } else if (m && Array.isArray(m.names)) {
      h += `<div class="ms-names"><h4>회원 명단</h4>
        ${m.names.length ? `<ul class="ms-name-list">${m.names.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : `<p class="ms-empty">이 회기 회원이 아직 없습니다.</p>`}
      </div>`;
    }
    if (m && S.admin) {
      h += `<div class="ms-vis"><label for="msVis">회원 공개 범위</label>
        <select id="msVis">${VIS.map((v) => `<option value="${v[0]}"${m.visibility === v[0] ? " selected" : ""}>${esc(v[1])}</option>`).join("")}</select>
        <span class="ms-vis-status" id="msVisSt"></span></div>`;
    }
    boxMember.innerHTML = h;
    const sel = $("msVis");
    if (sel) sel.addEventListener("change", async () => {
      const st = $("msVisSt"); sel.disabled = true; st.textContent = "저장 중…";
      try { await api("POST", "rpc/mission_set_visibility", { p_visibility: sel.value }); await loadMember(); renderMember(); const s2 = $("msVisSt"); if (s2) s2.textContent = "저장했습니다."; }
      catch (e) { sel.disabled = false; st.textContent = "저장하지 못했습니다: " + e.message; }
    });
  }
  async function loadMember() {
    if (!ready()) { S.mem = null; S.rep = null; return; }
    const arg = { p_year: S.year };
    try { const r = await api("POST", "rpc/mission_committee", arg); S.mem = (r && typeof r === "object" && r.year) ? r : null; }
    catch (e) { S.mem = null; }   // SQL 실행 전 → 기준 글만 보인다
    try { const r = localSession() ? await api("POST", "rpc/mission_report", arg) : null; S.rep = (r && typeof r === "object" && r.year) ? r : null; }
    catch (e) { S.rep = null; }   // 회원이 아니거나 SQL 실행 전 → 회계 보고 칸 없음
  }

  /* ───────── 2) 임원 ───────── */
  const ROLES = ["위원장", "부위원장", "서기", "회계"];
  const ROLE_DOES = { "위원장": "위원회를 대표하고 회의를 이끕니다", "부위원장": "위원장을 돕습니다", "서기": "일정, 활동과 동향을 올립니다", "회계": "회계 장부를 쓰고 회계 자료를 올립니다" };
  function renderOfficers() {
    if (!boxOfficers) return;
    if (!S.home || S.officers === null) { boxOfficers.innerHTML = ""; return; }
    let h = S.admin ? `<div class="nt-adminbar"><button type="button" class="btn btn-solid nt-write" id="msOffEdit">임원 정하기</button></div>` : "";
    if (!S.officers.length) h += `<p class="ms-empty">이 회기 임원이 아직 정해지지 않았습니다.</p>`;
    else h += `<ul class="ms-officers">${S.officers.map((o) => `<li><span class="ms-off-role">${esc(o.role)}</span><span class="ms-off-name">${esc(o.name)}</span><span class="ms-off-does">${esc(ROLE_DOES[o.role] || "")}</span></li>`).join("")}</ul>`;
    const mine = (S.home.my.roles || []).filter((r) => r.year === S.year).map((r) => r.role);
    if (mine.length) h += `<p class="ms-member-me">${esc(S.year)}년도 회기 ${esc(mine.join(" · "))}(으)로 임명되어 있습니다.</p>`;
    boxOfficers.innerHTML = h;
    const b = $("msOffEdit"); if (b) b.addEventListener("click", openOfficers);
  }
  async function loadOfficers() {
    if (!ready() || !S.home) { S.officers = null; return; }
    try { const r = await api("POST", "rpc/mission_officer_list", { p_year: S.year }); S.officers = Array.isArray(r) ? r : []; }
    catch (e) { S.officers = null; }
  }

  /* ───────── 3) 일정 ───────── */
  function renderEvents() {
    if (!boxEvents) return;
    if (!S.home || S.events === null) { boxEvents.innerHTML = ""; return; }
    const sec = canSec();
    let h = sec ? `<div class="nt-adminbar"><button type="button" class="btn btn-solid nt-write" id="msEvAdd">일정 넣기</button></div>` : "";
    if (!S.events.length) h += `<p class="ms-empty">이 회기에 올린 일정이 아직 없습니다.</p>`;
    else h += `<ul class="ms-events">${S.events.map((e) => `<li class="${e.hidden ? "is-hidden" : ""}">
        <span class="ms-ev-date">${esc(dot(e.event_date))}${e.end_date && e.end_date !== e.event_date ? ` ~ ${esc(dot(e.end_date).slice(5))}` : ""}</span>
        <span class="ms-ev-body"><b>${esc(e.title)}</b>${e.hidden ? `<span class="ms-tag-hidden">숨김</span>` : ""}${e.place ? `<span class="ms-ev-place">${esc(e.place)}</span>` : ""}${e.note ? `<span class="ms-ev-note">${nl2br(e.note)}</span>` : ""}</span>
        ${sec ? `<span class="ms-ev-tools"><button type="button" class="ms-link" data-eedit="${e.id}">수정</button><button type="button" class="ms-link" data-ehide="${e.id}">${e.hidden ? "다시 보이기" : "숨기기"}</button></span>` : ""}
      </li>`).join("")}</ul>`;
    boxEvents.innerHTML = h;
    const a = $("msEvAdd"); if (a) a.addEventListener("click", () => openEvent(null));
    boxEvents.querySelectorAll("[data-eedit]").forEach((b) => b.addEventListener("click", () => { const e = S.events.find((x) => String(x.id) === b.dataset.eedit); if (e) openEvent(e); }));
    boxEvents.querySelectorAll("[data-ehide]").forEach((b) => b.addEventListener("click", async () => {
      const e = S.events.find((x) => String(x.id) === b.dataset.ehide); if (!e) return;
      if (!e.hidden && !confirm("이 일정을 숨길까요? 다시 보이게 할 수 있습니다.")) return;
      b.disabled = true;
      try { await api("PATCH", `mission_events?id=eq.${e.id}`, { hidden: !e.hidden, updated_at: nowIso() }, { Prefer: "return=minimal" }); await loadEvents(); renderEvents(); }
      catch (er) { b.disabled = false; alert("저장하지 못했습니다: " + er.message); }
    }));
  }
  async function loadEvents() {
    if (!ready() || !S.home) { S.events = null; return; }
    try { const r = await api("GET", `mission_events?select=*&fy_year=eq.${S.year}&order=event_date.asc,id.asc&limit=500`); S.events = Array.isArray(r) ? r : []; }
    catch (e) { S.events = null; }
  }

  /* ───────── 4) 활동과 동향 ───────── */
  function termOf(y) {
    if (S.mem && S.mem.year === y && S.mem.from && S.mem.to) return { from: S.mem.from, to: S.mem.to };
    return guessRange(y);
  }
  function renderBoard() {
    if (!boxBoard) return;
    if (S.posts === null) { boxBoard.innerHTML = `<p class="ms-empty">활동과 동향 게시판은 준비 중입니다.</p>`; return; }
    const t = termOf(S.year), sec = canSec(), kinds = !!S.home;
    const all = S.posts.filter((p) => p.fy_year === S.year);
    const list = all.filter((p) => S.kind === "all" || (p.kind || "활동") === S.kind)
      .sort((a, b) => String(a.event_date || a.created_at).localeCompare(String(b.event_date || b.created_at)));
    const tabs = kinds ? `<div class="ms-years">${[["all", "전체"], ["활동", "활동"], ["동향", "동향"]].map((k) => `<button type="button" class="ms-year${S.kind === k[0] ? " on" : ""}" data-k="${k[0]}">${k[1]}</button>`).join("")}</div>` : `<span></span>`;
    let h = `<div class="ms-bar">${tabs}${sec ? `<button type="button" class="btn btn-solid nt-write" id="msWrite">글 쓰기</button>` : ""}</div>
      <p class="ms-term">${S.year}년도 회기 · ${esc(dot(t.from))} ~ ${esc(dot(t.to))}</p>`;
    if (!list.length) h += `<p class="ms-empty">이 회기에 올린 글이 아직 없습니다.</p>`;
    else h += `<div class="ms-posts">` + list.map((p) => `
      <article class="ms-post${p.hidden ? " is-hidden" : ""}">
        <header class="ms-post-head">
          <h4>${kinds ? `<span class="ms-post-kind">${esc(p.kind || "활동")}</span>` : ""}${esc(p.title)}${p.hidden ? `<span class="ms-tag-hidden">숨김</span>` : ""}</h4>
          ${p.event_date ? `<span class="ms-post-date">${esc(dot(p.event_date))}</span>` : ""}
        </header>
        ${p.body && p.body.trim() ? `<div class="ms-post-body">${nl2br(p.body)}</div>` : ""}
        ${sec ? `<div class="ms-post-meta"><span>${esc(p.author_name || "")}</span>
          <button type="button" class="ms-link" data-pedit="${p.id}">수정</button>
          <button type="button" class="ms-link" data-phide="${p.id}">${p.hidden ? "다시 보이기" : "숨기기"}</button></div>` : ""}
      </article>`).join("") + `</div>`;
    boxBoard.innerHTML = h;
    boxBoard.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => { S.kind = b.dataset.k; renderBoard(); }));
    const w = $("msWrite"); if (w) w.addEventListener("click", () => openPost(null));
    boxBoard.querySelectorAll("[data-pedit]").forEach((b) => b.addEventListener("click", () => { const p = S.posts.find((x) => String(x.id) === b.dataset.pedit); if (p) openPost(p); }));
    boxBoard.querySelectorAll("[data-phide]").forEach((b) => b.addEventListener("click", async () => {
      const p = S.posts.find((x) => String(x.id) === b.dataset.phide); if (!p) return;
      if (!p.hidden && !confirm("이 글을 숨길까요? 다시 보이게 할 수 있습니다.")) return;
      b.disabled = true;
      try { await api("PATCH", `mission_posts?id=eq.${p.id}`, { hidden: !p.hidden, updated_at: nowIso() }, { Prefer: "return=minimal" }); await loadPosts(); renderBoard(); }
      catch (e) { b.disabled = false; alert("저장하지 못했습니다: " + e.message); }
    }));
  }
  async function loadPosts() {
    if (!ready()) { S.posts = null; return; }
    try { const r = await api("GET", "mission_posts?select=*&order=fy_year.desc,event_date.asc.nullslast,created_at.asc&limit=1000"); S.posts = Array.isArray(r) ? r : []; }
    catch (e) { S.posts = null; }
  }

  /* ───────── 6) 후원하는 교회와 기관 ───────── */
  function partnerCard(p) {
    const url = safeUrl(p.url);
    let go = "";
    if (p.address) go += `<button type="button" class="m-go" data-msmap="${esc(p.address)}" data-name="${esc(p.name)}">지도 보기 →</button>`;
    if (url) go += `${p.address ? " &nbsp; " : ""}<a class="m-go" href="${esc(url)}" target="_blank" rel="noopener">홈페이지 보기 →</a>`;
    const logo = String(p.logo_url || "").trim();
    const logoSrc = /^(https:\/\/|images\/)/i.test(logo) ? logo : "";   // 저장소 그림(images/...) 또는 https 주소만
    return `<div class="mission-card ms-partner${p.active === false ? " is-hidden" : ""}">
      ${logoSrc ? `<img class="ms-logo" src="${esc(logoSrc)}" alt="${esc(p.name)} 로고" loading="lazy">` : ""}
      <h4>${esc(p.name)}${p.active === false ? `<span class="ms-tag-hidden">숨김</span>` : ""}</h4>
      ${p.summary ? `<p class="m-region">${esc(p.summary)}</p>` : ""}
      ${p.person ? `<p class="m-name">${esc(p.person)}</p>` : ""}
      ${go}
      ${S.admin ? `<div class="ms-partner-admin"><button type="button" class="ms-link" data-redit="${p.id}">수정</button>
        <button type="button" class="ms-link" data-rhide="${p.id}">${p.active === false ? "다시 보이기" : "숨기기"}</button></div>` : ""}
    </div>`;
  }
  function renderPartners() {
    if (!boxPartners) return;
    if (S.partners === null) return;    // 표 없음 → HTML 에 적어 둔 기본 목록 그대로
    const sorted = S.partners.slice().sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
    let h = S.admin ? `<div class="nt-adminbar"><button type="button" class="btn btn-solid nt-write" id="msAddPartner">후원처 추가</button></div>` : "";
    ["교회", "기관"].forEach((k) => {
      const list = sorted.filter((p) => p.kind === k);
      if (!list.length) return;
      h += `<h3 class="ms-kind">${k}</h3><div class="mission-grid">${list.map(partnerCard).join("")}</div>`;
    });
    if (!sorted.length) h += `<p class="ms-empty">등록한 후원처가 아직 없습니다.</p>`;
    boxPartners.innerHTML = h;
    const a = $("msAddPartner"); if (a) a.addEventListener("click", () => openPartner(null));
    boxPartners.querySelectorAll("[data-redit]").forEach((b) => b.addEventListener("click", () => { const p = S.partners.find((x) => String(x.id) === b.dataset.redit); if (p) openPartner(p); }));
    boxPartners.querySelectorAll("[data-rhide]").forEach((b) => b.addEventListener("click", async () => {
      const p = S.partners.find((x) => String(x.id) === b.dataset.rhide); if (!p) return;
      if (p.active !== false && !confirm(`「${p.name}」을(를) 목록에서 숨길까요? 관리자에게만 보이고, 다시 보이게 할 수 있습니다.`)) return;
      b.disabled = true;
      try { await api("PATCH", `mission_partners?id=eq.${p.id}`, { active: p.active === false, updated_at: nowIso() }, { Prefer: "return=minimal" }); await loadPartners(); renderPartners(); }
      catch (e) { b.disabled = false; alert("저장하지 못했습니다: " + e.message); }
    }));
  }
  async function loadPartners() {
    if (!ready()) { S.partners = null; return; }
    try { const r = await api("GET", "mission_partners?select=*&order=sort.asc,id.asc&limit=300"); S.partners = Array.isArray(r) ? r : []; }
    catch (e) { S.partners = null; }
  }

  // 지도 — 카드가 나중에 그려지므로 여기서 연다. 닫기는 js/main.js 의 지도 모달 코드가 맡는다.
  if (boxPartners) boxPartners.addEventListener("click", (e) => {
    const b = e.target.closest("[data-msmap]"); if (!b) return;
    const modal = $("mapModal"); if (!modal) return;
    const addr = b.dataset.msmap;
    $("mapTitle").textContent = b.dataset.name || "지도";
    $("mapAddr").textContent = addr;
    $("mapFrame").src = "https://www.google.com/maps?q=" + encodeURIComponent(addr) + "&hl=ko&z=15&output=embed";
    $("mapKakao").href = "https://map.kakao.com/?q=" + encodeURIComponent(addr);
    modal.hidden = false; document.body.style.overflow = "hidden";
  });

  /* ───────── 입력 창 ───────── */
  const modals = [];
  function makeModal(label, inner, wide) {
    const m = document.createElement("div");
    m.className = "modal"; m.hidden = true;
    m.innerHTML = `<div class="modal-backdrop" data-msclose></div>
      <div class="modal-box modal-box-notice${wide ? " ms-modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(label)}">
        <button class="modal-close" data-msclose aria-label="닫기">&times;</button>${inner}</div>`;
    document.body.appendChild(m);
    m.addEventListener("click", (e) => { if (e.target.hasAttribute("data-msclose")) closeModal(m); });
    modals.push(m);
    return m;
  }
  function openModal(m) { m.hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal(m) { m.hidden = true; document.body.style.overflow = ""; }
  document.addEventListener("keydown", (e) => { if (e.key !== "Escape") return; modals.forEach((m) => { if (!m.hidden) closeModal(m); }); });
  const stat = (m, t) => { const st = m.querySelector(".nt-status"); if (!st) return; st.hidden = !t; st.textContent = t || ""; };

  /* 글(활동·동향) */
  let postM = null, postId = null;
  function openPost(p) {
    if (!canSec()) return;
    if (!postM) {
      postM = makeModal("활동과 동향 글", `<h3 class="m-title"></h3>
        <form class="nt-form ms-form">
          <div class="ms-form-row">
            <label class="nt-f" id="mpKindWrap"><span>종류</span><select id="mpKind"><option value="활동">활동 — 위원회가 한 일</option><option value="동향">동향 — 후원하는 곳과 선교 현장 소식</option></select></label>
            <label class="nt-f"><span>날짜 <em class="ms-form-hint">(없으면 비워 둡니다)</em></span><input type="date" id="mpDate" /></label>
          </div>
          <label class="nt-f"><span>제목</span><input type="text" id="mpTitle" maxlength="200" required /></label>
          <label class="nt-f"><span>내용</span><textarea id="mpBody" rows="7" placeholder="언제, 어디서, 누구를, 어떻게 섬겼는지 적습니다"></textarea></label>
          <button type="submit" class="btn btn-solid nt-submit"></button>
          <div class="nt-status" hidden></div>
        </form>`);
      postM.querySelector("form").addEventListener("submit", savePost);
    }
    postId = p ? p.id : null;
    const q = (s) => postM.querySelector(s);
    q(".m-title").textContent = (p ? "글 수정" : "글 쓰기") + ` — ${S.year}년도 회기`;
    q(".nt-submit").textContent = p ? "수정 저장" : "올리기";
    q("#mpKindWrap").style.display = S.home ? "" : "none";
    q("#mpKind").value = p ? (p.kind || "활동") : (S.kind === "동향" ? "동향" : "활동");
    q("#mpDate").value = p && p.event_date ? String(p.event_date).slice(0, 10) : "";
    q("#mpTitle").value = p ? p.title : "";
    q("#mpBody").value = p ? (p.body || "") : "";
    stat(postM, "");
    openModal(postM); q("#mpTitle").focus();
  }
  async function savePost(e) {
    e.preventDefault();
    const me = currentUser(); if (!me) { alert("로그인이 필요합니다."); return; }
    const q = (s) => postM.querySelector(s);
    const row = { event_date: q("#mpDate").value || null, title: q("#mpTitle").value.trim(), body: q("#mpBody").value };
    if (S.home) row.kind = q("#mpKind").value === "동향" ? "동향" : "활동";
    if (!row.title) return;
    const btn = q(".nt-submit");
    btn.disabled = true; stat(postM, "저장 중…");
    try {
      if (postId) await api("PATCH", `mission_posts?id=eq.${postId}`, Object.assign(row, { updated_at: nowIso() }), { Prefer: "return=minimal" });
      else await api("POST", "mission_posts", Object.assign(row, { fy_year: S.year, user_id: me.id, author_name: displayName(me) }), { Prefer: "return=minimal" });
      closeModal(postM);
      await loadPosts(); renderBoard();
    } catch (er) { stat(postM, "저장하지 못했습니다: " + er.message); }
    btn.disabled = false;
  }

  /* 일정 */
  let evM = null, evId = null;
  function openEvent(ev) {
    if (!canSec()) return;
    if (!evM) {
      evM = makeModal("일정", `<h3 class="m-title"></h3>
        <form class="nt-form ms-form">
          <div class="ms-form-row">
            <label class="nt-f"><span>날짜</span><input type="date" id="meDate" required /></label>
            <label class="nt-f"><span>끝나는 날 <em class="ms-form-hint">(하루면 비워 둡니다)</em></span><input type="date" id="meEnd" /></label>
          </div>
          <label class="nt-f"><span>일정 이름</span><input type="text" id="meTitle" maxlength="200" required /></label>
          <label class="nt-f"><span>장소</span><input type="text" id="mePlace" maxlength="200" /></label>
          <label class="nt-f"><span>메모</span><textarea id="meNote" rows="3"></textarea></label>
          <button type="submit" class="btn btn-solid nt-submit"></button>
          <div class="nt-status" hidden></div>
        </form>`);
      evM.querySelector("form").addEventListener("submit", saveEvent);
    }
    evId = ev ? ev.id : null;
    const q = (s) => evM.querySelector(s);
    q(".m-title").textContent = (ev ? "일정 수정" : "일정 넣기") + ` — ${S.year}년도 회기`;
    q(".nt-submit").textContent = ev ? "수정 저장" : "넣기";
    q("#meDate").value = ev ? String(ev.event_date).slice(0, 10) : "";
    q("#meEnd").value = ev && ev.end_date ? String(ev.end_date).slice(0, 10) : "";
    q("#meTitle").value = ev ? ev.title : "";
    q("#mePlace").value = ev ? (ev.place || "") : "";
    q("#meNote").value = ev ? (ev.note || "") : "";
    stat(evM, "");
    openModal(evM); q("#meDate").focus();
  }
  async function saveEvent(e) {
    e.preventDefault();
    const me = currentUser(); if (!me) { alert("로그인이 필요합니다."); return; }
    const q = (s) => evM.querySelector(s);
    const row = { event_date: q("#meDate").value, end_date: q("#meEnd").value || null, title: q("#meTitle").value.trim(), place: q("#mePlace").value.trim(), note: q("#meNote").value.trim() };
    if (!row.event_date || !row.title) return;
    if (row.end_date && row.end_date < row.event_date) { stat(evM, "끝나는 날이 시작 날보다 앞입니다."); return; }
    const btn = q(".nt-submit");
    btn.disabled = true; stat(evM, "저장 중…");
    try {
      if (evId) await api("PATCH", `mission_events?id=eq.${evId}`, Object.assign(row, { updated_at: nowIso() }), { Prefer: "return=minimal" });
      else await api("POST", "mission_events", Object.assign(row, { fy_year: S.year, user_id: me.id, author_name: displayName(me) }), { Prefer: "return=minimal" });
      closeModal(evM);
      await loadEvents(); renderEvents();
    } catch (er) { stat(evM, "저장하지 못했습니다: " + er.message); }
    btn.disabled = false;
  }

  /* 임원 정하기(관리자) */
  let offM = null, offRows = [], offPick = null;
  async function openOfficers() {
    if (!S.admin) return;
    if (!offM) {
      offM = makeModal("임원 정하기", `<h3 class="m-title"></h3>
        <p class="ms-form-hint">교적에서 고른 사람은 그 직책의 권한을 받습니다(서기: 일정·활동·동향, 회계: 회계 장부). 이름만 적으면 명단에만 나옵니다.</p>
        <div id="moList"></div>
        <form class="nt-form ms-form ms-off-form">
          <div class="ms-form-row">
            <label class="nt-f"><span>직책</span><select id="moRole">${ROLES.map((r) => `<option>${r}</option>`).join("")}</select></label>
            <label class="nt-f"><span>이름</span><input type="text" id="moName" maxlength="50" required autocomplete="off" /></label>
          </div>
          <div class="ms-off-find"><button type="button" class="btn btn-line ms-btn-s" id="moFind">교적에서 찾기</button><span id="moPicked" class="ms-form-hint"></span></div>
          <div id="moFound"></div>
          <button type="submit" class="btn btn-solid nt-submit">임원으로 넣기</button>
          <div class="nt-status" hidden></div>
        </form>`);
      const q = (s) => offM.querySelector(s);
      q("form").addEventListener("submit", saveOfficer);
      q("#moName").addEventListener("input", () => { offPick = null; q("#moPicked").textContent = ""; });
      q("#moFind").addEventListener("click", findMember);
    }
    offM.querySelector(".m-title").textContent = `임원 정하기 — ${S.year}년도 회기`;
    offPick = null; offM.querySelector("#moName").value = ""; offM.querySelector("#moPicked").textContent = ""; offM.querySelector("#moFound").innerHTML = "";
    stat(offM, "");
    openModal(offM);
    await loadOffRows();
  }
  async function loadOffRows() {
    const box = offM.querySelector("#moList");
    try { offRows = await api("GET", `mission_officers?select=id,role,name,member_key,active&fy_year=eq.${S.year}&order=sort.asc,id.asc`) || []; }
    catch (e) { box.innerHTML = `<p class="ms-empty">임원 표를 읽지 못했습니다: ${esc(e.message)}</p>`; return; }
    const on = offRows.filter((o) => o.active);
    box.innerHTML = on.length ? `<ul class="ms-officers ms-officers-edit">${on.map((o) => `<li><span class="ms-off-role">${esc(o.role)}</span><span class="ms-off-name">${esc(o.name)}</span>
        <span class="ms-off-does">${o.member_key ? "권한 연결됨" : "이름만(권한 없음)"}</span><button type="button" class="ms-link" data-ooff="${o.id}">내리기</button></li>`).join("")}</ul>`
      : `<p class="ms-empty">아직 정한 임원이 없습니다.</p>`;
    box.querySelectorAll("[data-ooff]").forEach((b) => b.addEventListener("click", async () => {
      const o = offRows.find((x) => String(x.id) === b.dataset.ooff); if (!o) return;
      if (!confirm(`${o.role} ${o.name} 님을 ${S.year}년도 임원에서 내릴까요? 그 직책의 권한도 함께 없어집니다.`)) return;
      b.disabled = true;
      try { await api("PATCH", `mission_officers?id=eq.${o.id}`, { active: false, updated_at: nowIso() }, { Prefer: "return=minimal" }); await loadOffRows(); await loadOfficers(); renderOfficers(); }
      catch (e) { b.disabled = false; alert("저장하지 못했습니다: " + e.message); }
    }));
  }
  async function findMember() {
    const q = (s) => offM.querySelector(s);
    const name = q("#moName").value.trim(), box = q("#moFound");
    if (!name) { box.innerHTML = `<p class="ms-form-hint">이름을 먼저 적습니다.</p>`; return; }
    box.innerHTML = `<p class="ms-form-hint">찾는 중…</p>`;
    try {
      const r = await api("GET", `gyojeok?select=name,member_key,birth,role&name=ilike.*${encodeURIComponent(name.replace(/[*%,()]/g, ""))}*&order=name.asc&limit=12`) || [];
      const list = r.filter((x) => x.member_key);
      if (!list.length) { box.innerHTML = `<p class="ms-form-hint">교적에서 찾지 못했습니다. 이름만으로 넣을 수 있습니다(권한 없음).</p>`; return; }
      box.innerHTML = `<ul class="ms-found">${list.map((x, i) => `<li><button type="button" data-i="${i}">${esc(x.name)}${x.birth ? ` <small>${esc(String(x.birth).slice(0, 4))}년생</small>` : ""}${x.role ? ` <small>${esc(x.role)}</small>` : ""}</button></li>`).join("")}</ul>`;
      box.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => {
        const x = list[Number(b.dataset.i)];
        offPick = { name: x.name, member_key: x.member_key };
        q("#moName").value = x.name; q("#moPicked").textContent = "교적에서 골랐습니다 — 권한이 연결됩니다."; box.innerHTML = "";
      }));
    } catch (e) { box.innerHTML = `<p class="ms-form-hint">교적을 읽지 못했습니다: ${esc(e.message)}</p>`; }
  }
  async function saveOfficer(e) {
    e.preventDefault();
    const q = (s) => offM.querySelector(s);
    const name = q("#moName").value.trim(); if (!name) return;
    const row = { fy_year: S.year, role: q("#moRole").value, name, member_key: (offPick && offPick.name === name) ? offPick.member_key : "", sort: (offRows.length + 1) * 10 };
    const btn = q(".nt-submit");
    btn.disabled = true; stat(offM, "저장 중…");
    try {
      await api("POST", "mission_officers", row, { Prefer: "return=minimal" });
      q("#moName").value = ""; q("#moPicked").textContent = ""; offPick = null; stat(offM, "");
      await loadOffRows(); await loadOfficers(); renderOfficers();
    } catch (er) { stat(offM, "저장하지 못했습니다: " + er.message); }
    btn.disabled = false;
  }

  /* 후원처(관리자) */
  let partnerM = null, partnerId = null;
  function openPartner(p) {
    if (!S.admin) return;
    if (!partnerM) {
      partnerM = makeModal("후원처", `<h3 class="m-title"></h3>
        <form class="nt-form ms-form">
          <div class="ms-form-row">
            <label class="nt-f"><span>구분</span><select id="mrKind"><option value="교회">교회</option><option value="기관">기관</option></select></label>
            <label class="nt-f"><span>보이는 순서 <em class="ms-form-hint">(작은 수가 앞)</em></span><input type="number" id="mrSort" min="0" max="9999" /></label>
          </div>
          <label class="nt-f"><span>이름</span><input type="text" id="mrName" maxlength="100" required /></label>
          <label class="nt-f"><span>한 줄 소개</span><input type="text" id="mrSummary" maxlength="200" placeholder="예: 제천 작은 교회" /></label>
          <label class="nt-f"><span>담당자</span><input type="text" id="mrPerson" maxlength="100" placeholder="예: ○○○ 목사" /></label>
          <label class="nt-f"><span>주소 <em class="ms-form-hint">(적으면 '지도 보기'가 생깁니다)</em></span><input type="text" id="mrAddr" maxlength="200" /></label>
          <label class="nt-f"><span>홈페이지 <em class="ms-form-hint">(https:// 로 시작)</em></span><input type="url" id="mrUrl" maxlength="300" placeholder="https://" /></label>
          <label class="nt-f"><span>로고 그림 주소 <em class="ms-form-hint">(https:// 또는 images/… · 비우면 로고 없음)</em></span><input type="text" id="mrLogo" maxlength="300" placeholder="https://" /></label>
          <button type="submit" class="btn btn-solid nt-submit"></button>
          <div class="nt-status" hidden></div>
        </form>`);
      partnerM.querySelector("form").addEventListener("submit", savePartner);
    }
    partnerId = p ? p.id : null;
    const q = (s) => partnerM.querySelector(s);
    q(".m-title").textContent = p ? "후원처 수정" : "후원처 추가";
    q(".nt-submit").textContent = p ? "수정 저장" : "추가";
    q("#mrKind").value = p ? p.kind : "교회";
    q("#mrSort").value = p ? p.sort : (((S.partners || []).reduce((mx, x) => Math.max(mx, x.sort || 0), 0)) + 10);
    q("#mrName").value = p ? p.name : "";
    q("#mrSummary").value = p ? (p.summary || "") : "";
    q("#mrPerson").value = p ? (p.person || "") : "";
    q("#mrAddr").value = p ? (p.address || "") : "";
    q("#mrUrl").value = p ? (p.url || "") : "";
    q("#mrLogo").value = p ? (p.logo_url || "") : "";
    stat(partnerM, "");
    openModal(partnerM); q("#mrName").focus();
  }
  async function savePartner(e) {
    e.preventDefault();
    const q = (s) => partnerM.querySelector(s);
    const row = {
      kind: q("#mrKind").value === "기관" ? "기관" : "교회",
      sort: Number(q("#mrSort").value) || 100,
      name: q("#mrName").value.trim(),
      summary: q("#mrSummary").value.trim(),
      person: q("#mrPerson").value.trim(),
      address: q("#mrAddr").value.trim(),
      url: safeUrl(q("#mrUrl").value),
      logo_url: (/^(https:\/\/|images\/)/i.test(q("#mrLogo").value.trim()) ? q("#mrLogo").value.trim() : ""),
    };
    if (!row.name) return;
    const btn = q(".nt-submit");
    btn.disabled = true; stat(partnerM, "저장 중…");
    try {
      if (partnerId) await api("PATCH", `mission_partners?id=eq.${partnerId}`, Object.assign(row, { updated_at: nowIso() }), { Prefer: "return=minimal" });
      else await api("POST", "mission_partners", row, { Prefer: "return=minimal" });
      closeModal(partnerM);
      await loadPartners(); renderPartners();
    } catch (er) { stat(partnerM, "저장하지 못했습니다: " + er.message); }
    btn.disabled = false;
  }

  /* ───────── 회계 장부 (회계·관리자·재정 담당) ───────── */
  const B = { rows: [], book: null, rules: [], preview: null, editId: null };
  let bookM = null;
  function loadScript(src) {
    return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("읽기 도구를 불러오지 못했습니다")); document.head.appendChild(s); });
  }
  async function openBook() {
    if (!canBook()) return;
    if (!bookM) {
      bookM = makeModal("회계 장부", `<h3 class="m-title"></h3>
        <div class="ms-book-top">
          <label class="ms-book-open"><span>시작 잔액(원)</span><input type="text" id="mbOpen" inputmode="numeric" /><button type="button" class="btn btn-line ms-btn-s" id="mbOpenSave">저장</button></label>
          <label class="btn btn-solid ms-btn-s ms-book-file">엑셀(.xlsx) 올리기<input type="file" id="mbFile" accept=".xlsx" hidden /></label>
        </div>
        <p class="ms-form-hint">은행 거래 내역이나 정리한 엑셀을 올리면 날짜·수입·지출·내용을 읽어 항목을 붙입니다. 저장 전에 항목을 고칠 수 있고, 고친 것은 다음에 올릴 때 그대로 따릅니다. 같은 파일을 다시 올려도 겹쳐 들어가지 않습니다.</p>
        <div class="nt-status" hidden></div>
        <div id="mbPreview"></div>
        <form class="ms-book-add" id="mbAdd">
          <input type="date" id="mbDate" required aria-label="날짜" />
          <select id="mbKind" aria-label="구분"><option>수입</option><option>지출</option></select>
          <input type="text" id="mbCat" list="mbCats" maxlength="60" placeholder="항목" required aria-label="항목" />
          <input type="text" id="mbContent" maxlength="100" placeholder="내용" aria-label="내용" />
          <input type="text" id="mbMemo" maxlength="200" placeholder="메모" aria-label="메모" />
          <input type="text" id="mbAmt" inputmode="numeric" placeholder="금액" required aria-label="금액" />
          <button type="submit" class="btn btn-solid ms-btn-s" id="mbAddBtn">한 줄 넣기</button>
          <button type="button" class="ms-link" id="mbAddCancel" hidden>고치기 그만</button>
        </form>
        <datalist id="mbCats"></datalist>
        <div id="mbSum" class="ms-book-sum"></div>
        <div class="ms-tscroll ms-book-scroll" id="mbRows"></div>`, true);
      const q = (s) => bookM.querySelector(s);
      q("#mbOpenSave").addEventListener("click", saveOpening);
      q("#mbFile").addEventListener("change", onFile);
      q("#mbAdd").addEventListener("submit", saveEntry);
      q("#mbAddCancel").addEventListener("click", () => fillEntry(null));
    }
    bookM.querySelector(".m-title").textContent = `회계 장부 — ${S.year}년도 회기`;
    B.preview = null; bookM.querySelector("#mbPreview").innerHTML = ""; stat(bookM, "");
    fillEntry(null);
    openModal(bookM);
    await loadBook(); renderBook();
  }
  const numOf = (s) => { const n = Number(String(s == null ? "" : s).replace(/[,\s원]/g, "")); return isFinite(n) ? Math.round(n) : NaN; };
  async function loadBook() {
    try {
      const r = await Promise.all([
        api("GET", `mission_ledger?select=*&fy_year=eq.${S.year}&order=entry_date.asc,entry_time.asc,id.asc&limit=5000`),
        api("GET", `mission_books?select=*&fy_year=eq.${S.year}`),
        api("GET", "mission_ledger_rules?select=*&active=is.true&limit=2000").catch(() => []),
      ]);
      B.rows = r[0] || []; B.book = (r[1] || [])[0] || null; B.rules = r[2] || [];
    } catch (e) { B.rows = []; B.book = null; B.rules = []; stat(bookM, "장부를 읽지 못했습니다: " + e.message); }
  }
  function renderBook() {
    const q = (s) => bookM.querySelector(s);
    const open = B.book ? Number(B.book.opening_balance) || 0 : 0;
    q("#mbOpen").value = won(open);
    const cats = {}; B.rows.forEach((r) => { cats[r.category] = 1; });
    q("#mbCats").innerHTML = Object.keys(cats).sort().map((c) => `<option value="${esc(c)}"></option>`).join("");
    const live = B.rows.filter((r) => !r.hidden);
    const inc = live.reduce((a, r) => a + (r.kind === "수입" ? Number(r.amount) : 0), 0), sp = live.reduce((a, r) => a + (r.kind === "지출" ? Number(r.amount) : 0), 0);
    q("#mbSum").textContent = `거래 ${live.length}줄 · 수입 ${won(inc)}원 · 지출 ${won(sp)}원 · 잔액 ${won(open + inc - sp)}원` + (B.rows.length > live.length ? ` · 뺀 줄 ${B.rows.length - live.length}` : "");
    if (!B.rows.length) { q("#mbRows").innerHTML = `<p class="ms-empty">장부에 거래가 아직 없습니다.</p>`; return; }
    let bal = open;
    q("#mbRows").innerHTML = `<table class="ms-report-t ms-book-t"><thead><tr><th>날짜</th><th>항목</th><th>내용</th><th>메모</th><th>수입</th><th>지출</th><th>잔액</th><th></th></tr></thead><tbody>${B.rows.map((r) => {
      if (!r.hidden) bal += r.kind === "수입" ? Number(r.amount) : -Number(r.amount);
      return `<tr class="${r.hidden ? "is-out" : ""}"><td>${esc(r.entry_date)}</td><td>${esc(r.category)}</td><td>${esc(r.content)}</td><td>${esc(r.memo)}</td>
        <td>${r.kind === "수입" ? esc(won(r.amount)) : ""}</td><td>${r.kind === "지출" ? esc(won(r.amount)) : ""}</td><td>${r.hidden ? "뺌" : esc(won(bal))}</td>
        <td><button type="button" class="ms-link" data-bedit="${r.id}">고치기</button><button type="button" class="ms-link" data-bout="${r.id}">${r.hidden ? "되살리기" : "빼기"}</button></td></tr>`;
    }).join("")}</tbody></table>`;
    q("#mbRows").querySelectorAll("[data-bedit]").forEach((b) => b.addEventListener("click", () => { const r = B.rows.find((x) => String(x.id) === b.dataset.bedit); if (r) fillEntry(r); }));
    q("#mbRows").querySelectorAll("[data-bout]").forEach((b) => b.addEventListener("click", async () => {
      const r = B.rows.find((x) => String(x.id) === b.dataset.bout); if (!r) return;
      if (!r.hidden && !confirm("이 줄을 장부 계산에서 뺄까요? 지워지지는 않고, 되살릴 수 있습니다.")) return;
      b.disabled = true;
      try { await api("PATCH", `mission_ledger?id=eq.${r.id}`, { hidden: !r.hidden, updated_at: nowIso() }, { Prefer: "return=minimal" }); await afterBookChange(); }
      catch (e) { b.disabled = false; stat(bookM, "저장하지 못했습니다: " + e.message); }
    }));
  }
  async function afterBookChange() { await loadBook(); renderBook(); await loadMember(); renderMember(); renderReport(); renderSide(); }
  function fillEntry(r) {
    const q = (s) => bookM.querySelector(s);
    B.editId = r ? r.id : null;
    q("#mbDate").value = r ? r.entry_date : ""; q("#mbKind").value = r ? r.kind : "수입"; q("#mbCat").value = r ? r.category : "";
    q("#mbContent").value = r ? (r.content || "") : ""; q("#mbMemo").value = r ? (r.memo || "") : ""; q("#mbAmt").value = r ? won(r.amount) : "";
    q("#mbAddBtn").textContent = r ? "고친 것 저장" : "한 줄 넣기"; q("#mbAddCancel").hidden = !r;
    q("#mbAddCancel").style.display = r ? "" : "none";
    if (r) q("#mbDate").scrollIntoView({ block: "nearest" });
  }
  async function saveEntry(e) {
    e.preventDefault();
    const q = (s) => bookM.querySelector(s), me = currentUser();
    const amt = numOf(q("#mbAmt").value);
    if (!(amt > 0)) { stat(bookM, "금액은 0보다 큰 수로 적습니다."); return; }
    const row = { entry_date: q("#mbDate").value, kind: q("#mbKind").value === "지출" ? "지출" : "수입", category: q("#mbCat").value.trim() || "미분류",
      content: q("#mbContent").value.trim(), memo: q("#mbMemo").value.trim(), amount: amt };
    if (!row.entry_date) return;
    const btn = q("#mbAddBtn"); btn.disabled = true; stat(bookM, "저장 중…");
    try {
      if (B.editId) {
        const old = B.rows.find((x) => x.id === B.editId);
        await api("PATCH", `mission_ledger?id=eq.${B.editId}`, Object.assign(row, { updated_at: nowIso() }), { Prefer: "return=minimal" });
        if (old && old.content && old.category !== row.category) await learn([{ keyword: old.content, kind: row.kind, category: row.category }]);
      } else await api("POST", "mission_ledger", Object.assign(row, { fy_year: S.year, src: "manual", created_by: me ? me.id : null }), { Prefer: "return=minimal" });
      fillEntry(null); stat(bookM, "");
      await afterBookChange();
    } catch (er) { stat(bookM, "저장하지 못했습니다: " + er.message); }
    btn.disabled = false;
  }
  async function saveOpening() {
    const q = (s) => bookM.querySelector(s), n = numOf(q("#mbOpen").value);
    if (!isFinite(n)) { stat(bookM, "시작 잔액은 숫자로 적습니다."); return; }
    stat(bookM, "저장 중…");
    try { await api("POST", "mission_books?on_conflict=fy_year", { fy_year: S.year, opening_balance: n, updated_at: nowIso() }, { Prefer: "resolution=merge-duplicates,return=minimal" }); stat(bookM, "시작 잔액을 저장했습니다."); await afterBookChange(); }
    catch (e) { stat(bookM, "저장하지 못했습니다: " + e.message); }
  }
  async function learn(list) {      // 회계가 고친 항목을 분류 규칙으로 기억한다
    const rows = list.filter((x) => x.keyword && x.category && x.category !== "미분류").map((x) => ({ keyword: String(x.keyword).slice(0, 60), kind: x.kind || "", category: x.category, active: true, updated_at: nowIso() }));
    if (!rows.length) return;
    try { await api("POST", "mission_ledger_rules?on_conflict=keyword,kind", rows, { Prefer: "resolution=merge-duplicates,return=minimal" }); } catch (e) { /* 규칙을 못 남겨도 장부 저장은 됐다 */ }
  }
  async function onFile(ev) {
    const q = (s) => bookM.querySelector(s), file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { stat(bookM, "엑셀(.xlsx) 파일만 읽습니다. .xls 파일은 엑셀에서 「다른 이름으로 저장 → Excel 통합 문서(.xlsx)」로 바꿔 올려 주세요."); return; }
    stat(bookM, "엑셀을 읽는 중…");
    try {
      if (!window.JSZip) await loadScript("js/jszip.min.js?v=20260906lib13");
      const L = window.MissionLedger;
      const got = L.pick(await L.readXlsx(await file.arrayBuffer(), window.JSZip));
      if (!got.entries.length) { stat(bookM, got.note || "거래 줄을 찾지 못했습니다."); return; }
      const have = {}; B.rows.forEach((r) => { if (r.dedupe) have[r.dedupe] = 1; });
      const list = L.classify(got.entries, B.rules, B.rows).map((e) => Object.assign(e, { dup: !!have[e.dedupe], cat0: e.category }));
      B.preview = { file: file.name, sheet: got.sheet, opening: got.opening, list };
      stat(bookM, "");
      renderPreview();
    } catch (e) { stat(bookM, "엑셀을 읽지 못했습니다: " + e.message); }
  }
  const HOW = { file: "", rule: "규칙", history: "예전 기록", basic: "기본 규칙", none: "" };
  function renderPreview() {
    const q = (s) => bookM.querySelector(s), P = B.preview, box = q("#mbPreview");
    if (!P) { box.innerHTML = ""; return; }
    const fresh = P.list.filter((e) => !e.dup), L = window.MissionLedger, sm = L.summarize(fresh, 0);
    const un = fresh.filter((e) => e.category === "미분류").length;
    const setOpen = P.opening != null && (!B.book || !Number(B.book.opening_balance)) && !B.rows.length;
    const cats = {}; P.list.concat(B.rows).forEach((r) => { if (r.category) cats[r.category] = 1; });
    box.innerHTML = `<div class="ms-preview">
      <h4>올린 파일 미리 보기 <small class="ms-names-who">${esc(P.file)}${P.sheet ? ` · 시트 「${esc(P.sheet)}」` : ""}</small></h4>
      <p class="ms-book-sum">읽은 거래 ${P.list.length}줄 · 새로 넣을 것 ${fresh.length}줄${P.list.length > fresh.length ? ` · 이미 장부에 있는 것 ${P.list.length - fresh.length}줄(넣지 않음)` : ""}
        · 수입 ${won(sm.income)}원 · 지출 ${won(sm.spend)}원${un ? ` · <b>미분류 ${un}줄</b>` : ""}${setOpen ? ` · 시작 잔액 ${won(P.opening)}원으로 맞춤` : ""}</p>
      <datalist id="mbPCats">${Object.keys(cats).sort().map((c) => `<option value="${esc(c)}"></option>`).join("")}</datalist>
      <div class="ms-tscroll ms-book-scroll"><table class="ms-report-t ms-book-t"><thead><tr><th>날짜</th><th>항목</th><th>내용</th><th>메모</th><th>수입</th><th>지출</th></tr></thead><tbody>${P.list.map((e, i) =>
        `<tr class="${e.dup ? "is-out" : ""}"><td>${esc(e.entry_date)}</td><td>${e.dup ? esc(e.category) + " <small>(이미 있음)</small>" : `<input type="text" class="ms-pcat${e.category === "미분류" ? " is-none" : ""}" list="mbPCats" maxlength="60" data-i="${i}" value="${esc(e.category)}" aria-label="항목" />${HOW[e.how] ? `<small>${HOW[e.how]}</small>` : ""}`}</td>
          <td>${esc(e.content)}</td><td>${esc(e.memo)}</td><td>${e.kind === "수입" ? esc(won(e.amount)) : ""}</td><td>${e.kind === "지출" ? esc(won(e.amount)) : ""}</td></tr>`).join("")}</tbody></table></div>
      <div class="ms-preview-btns"><button type="button" class="btn btn-solid ms-btn-s" id="mbPSave"${fresh.length ? "" : " disabled"}>장부에 ${fresh.length}줄 넣기</button><button type="button" class="ms-link" id="mbPCancel">그만두기</button></div>
    </div>`;
    box.querySelectorAll(".ms-pcat").forEach((inp) => inp.addEventListener("change", () => {
      const e = P.list[Number(inp.dataset.i)], v = inp.value.trim() || "미분류";
      // 같은 내용의 다른 줄도 함께 바꾼다
      P.list.forEach((x) => { if (!x.dup && x !== e && e.content && x.content === e.content && x.kind === e.kind && x.category === e.category) x.category = v; });
      e.category = v; renderPreview();
    }));
    q("#mbPCancel").addEventListener("click", () => { B.preview = null; renderPreview(); });
    q("#mbPSave").addEventListener("click", async () => {
      const btn = q("#mbPSave"), me = currentUser(); btn.disabled = true; stat(bookM, "장부에 넣는 중…");
      try {
        const rows = fresh.map((e) => ({ fy_year: S.year, entry_date: e.entry_date, entry_time: e.entry_time || "", kind: e.kind, category: e.category || "미분류", content: e.content || "",
          memo: e.memo || "", method: e.method || "", amount: e.amount, src: "excel", dedupe: e.dedupe, created_by: me ? me.id : null }));
        let n = 0;
        for (let i = 0; i < rows.length; i += 200) {
          const r = await api("POST", "mission_ledger?on_conflict=fy_year,dedupe", rows.slice(i, i + 200), { Prefer: "resolution=ignore-duplicates,return=representation" });
          n += Array.isArray(r) ? r.length : 0;
        }
        if (setOpen) await api("POST", "mission_books?on_conflict=fy_year", { fy_year: S.year, opening_balance: P.opening, updated_at: nowIso() }, { Prefer: "resolution=merge-duplicates,return=minimal" });
        const seen = {};
        await learn(fresh.filter((e) => e.content && e.category !== e.cat0).filter((e) => { const k = e.kind + "|" + e.content; if (seen[k]) return false; seen[k] = 1; return true; })
          .map((e) => ({ keyword: e.content, kind: e.kind, category: e.category })));
        B.preview = null; renderPreview();
        stat(bookM, `장부에 ${n}줄을 넣었습니다.`);
        await afterBookChange();
      } catch (e) { btn.disabled = false; stat(bookM, "넣지 못했습니다: " + e.message); }
    });
  }

  /* ───────── 시작 ───────── */
  async function loadHome() {
    if (!ready()) { S.home = null; return; }
    try { const r = await api("POST", "rpc/mission_home", {}); S.home = (r && typeof r === "object" && r.current) ? r : null; }
    catch (e) { S.home = null; }
    if (S.home) S.fy = S.home.current;
  }
  async function loadYear() { await Promise.all([loadMember(), loadOfficers(), loadEvents()]); }
  function renderAll() { renderSide(); renderMember(); renderReport(); renderOfficers(); renderEvents(); renderBoard(); renderPartners(); }
  async function refresh() {
    _admin = null;
    const r = await Promise.all([isAdmin(), loadHome(), loadPosts(), loadPartners()]);
    S.admin = !!r[0];
    if (S.home && !S.home.my) S.home.my = { admin: S.admin, finance: false, roles: [] };
    const ys = years();
    // 주소(?y=)나 왼쪽 메뉴로 고른 적이 없으면 지금 회기를 보인다 — 새 회기가 시작되면 저절로 그 회기가 먼저 나온다
    if (!picked || S.year == null || ys.indexOf(S.year) < 0) S.year = ys.indexOf(S.fy) >= 0 ? S.fy : ys[0];
    await loadYear();
    renderAll();
  }
  let picked = S.year != null;
  if (S.year == null) S.year = Math.max(S.fy, FIRST_YEAR);
  renderSide(); renderMember();
  refresh();
  window.addEventListener("church:auth", refresh);
  window.ChurchMission = { refresh, state: S, book: B, renderSide };
})();
