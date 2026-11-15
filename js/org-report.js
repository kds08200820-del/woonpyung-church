/* ============================================================
   운평장로교회 — 기관 보고서 · 예산 청원서 (org-report.html) (2026-11-15 담임목사 지시)
   DB: supabase/20261115_1100_org_reports.sql
   · 로그인한 성도 누구나 쓰고 제출한다(올해만 — 권한은 나중에 따로).
   · 쓴 사람은 승인 전까지 고친다. 담임(관리자)은 승인하거나 메모와 함께 돌려보낸다.
   · 승인하면 선출된 임원이 2027년 교회 행정의 기관 임원(org_officers)으로 들어간다(교적 연결).
   표가 없으면(SQL 실행 전) '준비 중'만 보인다.
   ============================================================ */
(function () {
  const root = document.getElementById("orRoot");
  if (!root) return;
  const FY = 2027;
  const ORGS = ["남선교회", "여전도회", "주일학교", "유치부", "유년부", "초등부", "중등부", "고등부", "청년부", "성가대", "찬양단", "구제선교위원회", "교육위원회"];
  const ROLES = ["회장", "부회장", "총무", "서기", "회계"];

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const won = (n) => (n === "" || n == null || isNaN(Number(n)) ? "" : Number(n).toLocaleString("ko-KR"));
  const num = (v) => { const n = Number(String(v == null ? "" : v).replace(/[^\d-]/g, "")); return isNaN(n) ? 0 : n; };
  const dot = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}.${m[2]}.${m[3]}` : ""; };

  function ready() { return !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY); }
  function sess() {
    try {
      const ref = new URL(window.SUPABASE_URL).hostname.split(".")[0];
      const raw = localStorage.getItem(`sb-${ref}-auth-token`);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.currentSession ? s.currentSession : s;
    } catch (e) { return null; }
  }
  const me = () => { const s = sess(); return (s && s.user) || null; };
  const myName = () => { const u = me(); return (u && u.user_metadata && (u.user_metadata.name || u.user_metadata.full_name)) || (u && u.email ? u.email.split("@")[0] : ""); };
  async function api(method, path, body, extra) {
    const s = sess();
    const headers = { apikey: window.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (s && s.access_token) headers.Authorization = "Bearer " + s.access_token;
    if (extra) Object.assign(headers, extra);
    const res = await fetch(window.SUPABASE_URL + "/rest/v1/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!res.ok) { const e = new Error((data && (data.message || data.error)) || ("HTTP " + res.status)); e.status = res.status; e.code = data && data.code; throw e; }
    return data;
  }
  function openLogin() { const m = document.getElementById("authModal"); if (m) { m.hidden = false; document.body.style.overflow = "hidden"; } }

  const S = { admin: false, list: null, officers: null, cur: null, missing: false };

  /* ───────── 읽기 ───────── */
  async function load() {
    if (!ready()) { root.innerHTML = `<p class="or-empty">준비 중입니다.</p>`; return; }
    if (!sess()) { renderGuest(); return; }
    try {
      const u = me();
      const ad = await api("GET", `admins?uid=eq.${u.id}&select=uid`).catch(() => []);
      S.admin = Array.isArray(ad) && ad.length > 0;
      S.list = await api("GET", `org_reports?select=id,fy_year,org_name,manager_name,status,author_name,user_id,updated_at,submitted_at,approved_at,hidden&fy_year=eq.${FY}&order=org_name.asc,id.asc`) || [];
      S.missing = false;
    } catch (e) {
      if (e.code === "PGRST205" || e.code === "42P01" || e.status === 404) { S.missing = true; root.innerHTML = `<p class="or-empty">기관 보고서 기능을 준비하고 있습니다.</p>`; return; }
      root.innerHTML = `<p class="or-empty">불러오지 못했습니다: ${esc(e.message)}</p>`; return;
    }
    try { S.officers = await api("POST", "rpc/org_officer_list", { p_year: FY }); } catch (e) { S.officers = null; }
    renderList();
  }

  function renderGuest() {
    root.innerHTML = `<div class="or-card"><p>기관 보고서 · 예산 청원서는 로그인한 성도가 쓸 수 있습니다.</p>
      <p><button type="button" class="btn btn-solid" id="orLogin">로그인</button></p></div>`;
    root.querySelector("#orLogin").onclick = openLogin;
  }

  /* ───────── 목록 ───────── */
  const STATUS_CLS = { "작성중": "draft", "제출": "sent", "승인": "ok", "돌려보냄": "back" };
  function renderList() {
    const uid = (me() || {}).id;
    const list = (S.list || []).filter((r) => !r.hidden || S.admin);
    let h = `<div class="or-bar"><p class="or-lead">${FY}년도 기관 보고서 · 예산 청원서 — 기관마다 한 장씩 씁니다. 임원 선출 결과는 담임목사님이 승인하면 ${FY}년 교회 행정에 반영됩니다.</p>
      <button type="button" class="btn btn-solid" id="orNew">보고서 쓰기</button></div>`;
    if (!list.length) h += `<p class="or-empty">아직 올라온 보고서가 없습니다.</p>`;
    else h += `<table class="or-list"><thead><tr><th>기관</th><th>담당자</th><th>상태</th><th>쓴 사람</th><th>고친 날</th>${S.admin ? "<th></th>" : ""}</tr></thead><tbody>
      ${list.map((r) => `<tr>
        <td><button type="button" class="or-link" data-open="${r.id}">${esc(r.org_name)}</button>${r.hidden ? " <small>(숨김)</small>" : ""}</td>
        <td>${esc(r.manager_name)}</td>
        <td><span class="or-st ${STATUS_CLS[r.status] || ""}">${esc(r.status)}</span></td>
        <td>${esc(r.author_name)}${r.user_id === uid ? " <small>(나)</small>" : ""}</td>
        <td>${esc(dot(r.updated_at))}</td>
        ${S.admin ? `<td class="or-acts">${r.status === "제출" || r.status === "돌려보냄" || r.status === "작성중" ? `<button type="button" class="btn btn-solid or-s" data-ok="${r.id}">승인</button><button type="button" class="or-link" data-back="${r.id}">돌려보내기</button>` : r.status === "승인" ? `<button type="button" class="or-link" data-ok="${r.id}">다시 반영</button>` : ""}</td>` : ""}
      </tr>`).join("")}</tbody></table>`;
    // 2027 기관 임원(승인되어 교회 행정에 들어간 것)
    if (Array.isArray(S.officers)) {
      const by = {};
      S.officers.forEach((o) => { (by[o.org] = by[o.org] || []).push(o); });
      const orgs = Object.keys(by);
      h += `<h3 class="or-h">${FY}년 기관 임원 <small>(승인되어 교회 행정에 반영된 명단)</small></h3>`;
      h += orgs.length ? `<ul class="or-officers">${orgs.map((g) => `<li><b>${esc(g)}</b> ${by[g].map((o) => `${esc(o.role)} ${esc(o.name)}${S.admin && !o.linked ? "<sup title='교적에서 한 분으로 찾지 못함'>*</sup>" : ""}`).join(" · ")}</li>`).join("")}</ul>
        ${S.admin ? `<p class="or-note">* 표시는 교적에서 같은 이름을 한 분으로 찾지 못해 교적과 이어지지 않은 분입니다(동명이인 · 교적 없음).</p>` : ""}`
        : `<p class="or-empty">아직 승인된 임원이 없습니다.</p>`;
    }
    root.innerHTML = h;
    root.querySelector("#orNew").onclick = () => openEditor(null);
    root.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openReport(Number(b.dataset.open)));
    root.querySelectorAll("[data-ok]").forEach((b) => b.onclick = () => approve(Number(b.dataset.ok)));
    root.querySelectorAll("[data-back]").forEach((b) => b.onclick = () => sendBack(Number(b.dataset.back)));
  }

  async function approve(id) {
    const r = (S.list || []).find((x) => x.id === id);
    if (!confirm(`${r ? r.org_name : ""} 보고서를 승인할까요?\n선출된 임원이 ${FY}년 교회 행정의 기관 임원으로 들어갑니다(그 기관의 예전 명단은 꺼집니다).`)) return;
    try { const x = await api("POST", "rpc/org_report_approve", { p_id: id }); alert(`승인했습니다. 임원 ${x.officers}명을 반영했고, 그 가운데 ${x.linked}명을 교적과 이었습니다.`); await load(); }
    catch (e) { alert("승인하지 못했습니다: " + e.message); }
  }
  async function sendBack(id) {
    const note = prompt("돌려보내는 까닭(쓴 분에게 보입니다)", "");
    if (note === null) return;
    try { await api("POST", "rpc/org_report_return", { p_id: id, p_note: note }); await load(); }
    catch (e) { alert("처리하지 못했습니다: " + e.message); }
  }

  /* ───────── 보고서 열기 · 쓰기 ───────── */
  async function openReport(id) {
    try { const r = await api("GET", `org_reports?id=eq.${id}&select=*`); if (r && r[0]) openEditor(r[0]); }
    catch (e) { alert("열지 못했습니다: " + e.message); }
  }
  const empty = () => ({ id: null, fy_year: FY, org_name: "", manager_name: "", officers: ROLES.map((x) => ({ role: x, name: "" })),
    biz_report: [{}, {}, {}], settle: {}, plan: [{}, {}, {}], budget: [{}, {}, {}], suggestion: "", status: "작성중", admin_note: "", user_id: (me() || {}).id });

  function openEditor(r) {
    const R = r ? JSON.parse(JSON.stringify(r)) : empty();
    const uid = (me() || {}).id;
    const mine = !R.id || R.user_id === uid;
    const canEdit = (mine && R.status !== "승인") || S.admin;
    S.cur = R;
    const dis = canEdit ? "" : "disabled";
    const rows = (arr, n) => { const a = Array.isArray(arr) ? arr.slice() : []; while (a.length < n) a.push({}); return a; };
    const inp = (cls, v, ph, extra) => `<input type="text" class="${cls}" value="${esc(v == null ? "" : v)}" placeholder="${esc(ph || "")}" ${dis} ${extra || ""} />`;
    let h = `<div class="or-top"><button type="button" class="or-link" id="orBack">← 목록</button>
      <span class="or-st ${STATUS_CLS[R.status] || ""}">${esc(R.status)}</span>
      <button type="button" class="or-link" id="orPrint">인쇄</button></div>
      ${R.status === "돌려보냄" && R.admin_note ? `<p class="or-backnote">담임목사님 메모: ${esc(R.admin_note)}</p>` : ""}
      ${!canEdit ? `<p class="or-note">${R.status === "승인" ? "승인된 보고서는 고칠 수 없습니다." : "다른 분이 쓴 보고서는 볼 수만 있습니다."}</p>` : ""}
      <div class="or-sheet">
        <h2 class="or-title">${FY}년도 기관 보고서 · 예산 청원서</h2>
        <div class="or-grid2">
          <label>기관명 <input type="text" id="fOrg" list="orOrgs" value="${esc(R.org_name)}" ${dis} maxlength="60" /></label>
          <label>담당자 <input type="text" id="fMgr" value="${esc(R.manager_name)}" ${dis} maxlength="50" /></label>
        </div>
        <datalist id="orOrgs">${ORGS.map((o) => `<option value="${esc(o)}">`).join("")}</datalist>

        <h3>1. 임원 선출 결과</h3>
        <div class="or-off" id="fOff">${rows(R.officers, 1).map((o) => `<span class="or-pair">${inp("oRole", o.role, "직책", 'maxlength="30"')}${inp("oName", o.name, "이름", 'maxlength="50"')}</span>`).join("")}</div>
        ${canEdit ? `<button type="button" class="or-link or-add" data-add="off">+ 임원 더하기</button>` : ""}

        <h3>2. ${FY - 1}년도 사업 보고</h3>
        <table class="or-t"><thead><tr><th>사업</th><th>내용과 결과</th><th>쓴 돈</th></tr></thead><tbody id="fBiz">
          ${rows(R.biz_report, 1).map((x) => `<tr><td>${inp("bName", x.name)}</td><td>${inp("bDetail", x.detail)}</td><td>${inp("bSpent num", won(x.spent), "", 'inputmode="numeric"')}</td></tr>`).join("")}
        </tbody></table>
        ${canEdit ? `<button type="button" class="or-link or-add" data-add="biz">+ 줄 더하기</button>` : ""}

        <h3>3. ${FY - 1}년도 결산</h3>
        <div class="or-grid4">
          ${[["carry", "전년 이월"], ["income", "수입"], ["spend", "지출"], ["left", "남은 돈"]].map((k) => `<label>${k[1]} <input type="text" class="num" data-settle="${k[0]}" value="${esc(won((R.settle || {})[k[0]]))}" inputmode="numeric" ${dis} /></label>`).join("")}
        </div>

        <h3>4. ${FY}년도 사업 계획</h3>
        <table class="or-t"><thead><tr><th>사업</th><th>내용</th></tr></thead><tbody id="fPlan">
          ${rows(R.plan, 1).map((x) => `<tr><td>${inp("pName", x.name)}</td><td>${inp("pDetail", x.detail)}</td></tr>`).join("")}
        </tbody></table>
        ${canEdit ? `<button type="button" class="or-link or-add" data-add="plan">+ 줄 더하기</button>` : ""}

        <h3>5. ${FY}년도 예산 청원</h3>
        <table class="or-t"><thead><tr><th>항목</th><th>청원 금액</th><th>사유</th></tr></thead><tbody id="fBud">
          ${rows(R.budget, 1).map((x) => `<tr><td>${inp("uItem", x.item)}</td><td>${inp("uAmt num", won(x.amount), "", 'inputmode="numeric"')}</td><td>${inp("uWhy", x.reason)}</td></tr>`).join("")}
        </tbody><tfoot><tr><th>합계</th><th class="num" id="fBudSum"></th><th></th></tr></tfoot></table>
        ${canEdit ? `<button type="button" class="or-link or-add" data-add="bud">+ 줄 더하기</button>` : ""}

        <h3>6. 건의 사항</h3>
        <textarea id="fSug" rows="3" maxlength="2000" ${dis}>${esc(R.suggestion)}</textarea>
      </div>
      ${canEdit ? `<div class="or-save"><button type="button" class="btn btn-line" id="orDraft">임시 저장</button>
        <button type="button" class="btn btn-solid" id="orSend">제출</button><span class="or-msg" id="orMsg"></span></div>` : ""}`;
    root.innerHTML = h;
    const q = (s) => root.querySelector(s);
    q("#orBack").onclick = load;
    q("#orPrint").onclick = () => window.print();
    const sum = () => { let t = 0; root.querySelectorAll(".uAmt").forEach((i) => { t += num(i.value); }); q("#fBudSum").textContent = won(t); };
    sum();
    root.oninput = (e) => { if (e.target.classList.contains("uAmt")) sum(); };
    root.onchange = (e) => { if (e.target.classList.contains("num")) { const v = num(e.target.value); e.target.value = v ? won(v) : ""; } };
    root.querySelectorAll("[data-add]").forEach((b) => b.onclick = () => {
      const k = b.dataset.add;
      if (k === "off") q("#fOff").insertAdjacentHTML("beforeend", `<span class="or-pair">${inp("oRole", "", "직책")}${inp("oName", "", "이름")}</span>`);
      if (k === "biz") q("#fBiz").insertAdjacentHTML("beforeend", `<tr><td>${inp("bName", "")}</td><td>${inp("bDetail", "")}</td><td>${inp("bSpent num", "", "", 'inputmode="numeric"')}</td></tr>`);
      if (k === "plan") q("#fPlan").insertAdjacentHTML("beforeend", `<tr><td>${inp("pName", "")}</td><td>${inp("pDetail", "")}</td></tr>`);
      if (k === "bud") q("#fBud").insertAdjacentHTML("beforeend", `<tr><td>${inp("uItem", "")}</td><td>${inp("uAmt num", "", "", 'inputmode="numeric"')}</td><td>${inp("uWhy", "")}</td></tr>`);
    });
    if (q("#orDraft")) q("#orDraft").onclick = () => save(R.status === "제출" ? "제출" : "작성중");
    if (q("#orSend")) q("#orSend").onclick = () => save("제출");
    window.scrollTo(0, Math.max(0, root.getBoundingClientRect().top + window.scrollY - 90));
  }

  function collect() {
    const q = (s) => root.querySelector(s), all = (s) => [...root.querySelectorAll(s)];
    const v = (el, s) => (el.querySelector(s) || {}).value || "";
    const officers = all("#fOff .or-pair").map((p) => ({ role: v(p, ".oRole").trim(), name: v(p, ".oName").trim() })).filter((x) => x.name);
    const biz = all("#fBiz tr").map((t) => ({ name: v(t, ".bName").trim(), detail: v(t, ".bDetail").trim(), spent: num(v(t, ".bSpent")) || null })).filter((x) => x.name || x.detail);
    const plan = all("#fPlan tr").map((t) => ({ name: v(t, ".pName").trim(), detail: v(t, ".pDetail").trim() })).filter((x) => x.name || x.detail);
    const budget = all("#fBud tr").map((t) => ({ item: v(t, ".uItem").trim(), amount: num(v(t, ".uAmt")) || null, reason: v(t, ".uWhy").trim() })).filter((x) => x.item || x.amount);
    const settle = {}; all("[data-settle]").forEach((i) => { const n = num(i.value); if (i.value.trim()) settle[i.dataset.settle] = n; });
    return { org_name: q("#fOrg").value.trim(), manager_name: q("#fMgr").value.trim(), officers, biz_report: biz, settle, plan, budget, suggestion: q("#fSug").value.trim() };
  }
  async function save(status) {
    const R = S.cur, d = collect(), msg = root.querySelector("#orMsg");
    if (!d.org_name) { msg.textContent = "기관명을 적어 주세요."; return; }
    if (status === "제출" && !confirm("제출할까요? 제출한 뒤에도 승인 전까지는 고칠 수 있습니다.")) return;
    const row = Object.assign(d, { status, updated_at: new Date().toISOString() });
    if (status === "제출") row.submitted_at = new Date().toISOString();
    msg.textContent = "저장 중…";
    try {
      if (R.id) await api("PATCH", `org_reports?id=eq.${R.id}`, row, { Prefer: "return=minimal" });
      else {
        Object.assign(row, { fy_year: FY, user_id: (me() || {}).id, author_name: myName() });
        const r = await api("POST", "org_reports", row, { Prefer: "return=representation" });
        if (r && r[0]) R.id = r[0].id;
      }
      R.status = status;
      msg.textContent = status === "제출" ? "제출했습니다." : "저장했습니다.";
      if (status === "제출") { await load(); }
    } catch (e) { msg.textContent = "저장하지 못했습니다: " + e.message; }
  }

  load();
  window.addEventListener("church:auth", load);
  window.OrgReport = { reload: load, state: S };
})();
