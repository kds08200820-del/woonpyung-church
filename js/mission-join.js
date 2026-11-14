/* ============================================================
   운평장로교회 — 구제선교위원회 정회원 가입 · 회비 (2026-11-14 담임목사 지시)
   mission.html 의 #join 칸.  DB: supabase/20261114_1500_mission_regular_members.sql
   · 성도: 정회원 가입 신청 · 내 상태 · 이번 회기 회비 납부 칸 보기 · 신청 취소
   · 그 회기 임원 · 관리자 · 재정 담당: 정회원 명부(승인 · 반려 · 실행위원 · 교적 연결 · 대신 올리기)
   · 그 회기 회계 · 관리자 · 재정 담당: 회비 칸 체크(연납 · 12월 ~ 11월)
   함수가 없으면(SQL 실행 전) 칸 전체를 숨긴다.
   ============================================================ */
(function () {
  const sec = document.getElementById("join"), box = document.getElementById("msJoin");
  if (!sec || !box) return;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const won = (n) => Number(n || 0).toLocaleString("ko-KR");
  const dot = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}.${m[2]}.${m[3]}` : ""; };
  const PERIODS = ["12", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"];
  const mLabel = (p) => Number(p) + "월";

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
  async function rpc(name, args) {
    const s = sess();
    const headers = { apikey: window.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (s && s.access_token) headers.Authorization = "Bearer " + s.access_token;
    const res = await fetch(window.SUPABASE_URL + "/rest/v1/rpc/" + name, { method: "POST", headers, body: JSON.stringify(args || {}) });
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!res.ok) { const e = new Error((data && (data.message || data.error)) || ("HTTP " + res.status)); e.status = res.status; throw e; }
    return data;
  }
  function openLogin() { const m = document.getElementById("authModal"); if (m) { m.hidden = false; document.body.style.overflow = "hidden"; } }
  const selYear = () => (window.ChurchMission && window.ChurchMission.state && window.ChurchMission.state.year) || null;
  function sideRefresh() {
    const CM = window.ChurchMission;
    if (CM && CM.renderSide) CM.renderSide();
    // 왼쪽 '임원 관리'의 정회원 · 회비 단추는 이 파일이 준비된 뒤(renderSide) 켜진다
  }

  const J = { me: null, roster: null, ok: false, busy: false };

  /* 토스 송금 — js/forms.js 와 같은 규칙. toss.me 링크가 있으면 금액을 붙여 열고, 없으면 토스 앱 송금 화면(supertoss://) */
  function tossMeUrl(u, amount) {
    u = String(u || "").trim(); if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    let x; try { x = new URL(u); } catch (e) { return ""; }
    if (!/^https?:$/.test(x.protocol)) return "";
    if (/(^|\.)toss\.me$/i.test(x.hostname) && amount > 0) {
      const parts = x.pathname.split("/").filter(Boolean);
      if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) parts.pop();
      if (parts.length) return x.origin + "/" + parts.join("/") + "/" + amount;
    }
    return x.href;
  }
  function tossApp(p, amount) {
    const acct = String(p.account || "").replace(/[^0-9]/g, "");
    if (!p.bank || !acct) return "";
    return "supertoss://send?bank=" + encodeURIComponent(p.bank) + "&accountNo=" + acct + (amount > 0 ? "&amount=" + amount : "");
  }
  // 회비 내기: 한 달 / 연납 금액으로 토스 송금, 또는 계좌번호 복사
  function payBox(me) {
    const p = me.pay;
    if (!p) return `<p class="ms-form-hint mj-pay">회비 받을 계좌를 회계가 정하고 있습니다. 정해지면 이곳에 계좌와 토스 송금 단추가 나옵니다.</p>`;
    const rate = Number(me.rate || 10000), year = rate === 20000 ? 240000 : 100000;
    const btn = (amt, lbl) => { const web = tossMeUrl(p.toss_url, amt), app = web ? "" : tossApp(p, amt); const u = web || app;
      return u ? `<a class="btn btn-solid ms-btn-s mj-toss" href="${esc(u)}"${web ? ' target="_blank" rel="noopener"' : ""}>토스로 ${lbl} ${won(amt)}원 보내기</a>` : ""; };
    return `<div class="mj-pay">
      <h4>회비 내기</h4>
      <div class="mj-pay-btns">${btn(rate, "한 달")}${btn(year, "연납")}</div>
      ${p.account ? `<p class="mj-acct">${esc(p.bank)} ${esc(p.account)}${p.holder ? ` · 예금주 ${esc(p.holder)}` : ""}
        <button type="button" class="ms-link" id="mjCopy" data-acct="${esc(String(p.account).replace(/[^0-9-]/g, ""))}">계좌번호 복사</button></p>` : ""}
      <p class="ms-form-hint">보내는 분 이름은 본인 이름으로 해 주세요. 회계가 통장과 맞춰 본 뒤 위 칸에 체크합니다.${p.toss_url ? "" : " ‘토스로 보내기’는 토스 앱이 있는 휴대폰에서 송금 화면으로 열립니다. 다른 기기에서는 계좌번호를 복사해 보내 주세요."}</p>
    </div>`;
  }
  function dueBox(me) {
    const d = me.member && me.member.due_day;
    return `<form class="mj-due" id="mjDue"><label class="nt-f"><span>나의 회비 납부일</span>
        <select id="mjDueDay"><option value="">정하지 않음</option>${Array.from({ length: 31 }, (_, i) => i + 1).map((n) => `<option value="${n}"${d === n ? " selected" : ""}>매달 ${n}일</option>`).join("")}</select></label>
      <span class="ms-form-hint" id="mjDueSt">${d ? "납부일이 지나도 이번 달 회비가 확인되지 않으면 알림을 드립니다(홈페이지 알림을 켠 기기)." : "납부일을 정하면, 그날이 지나도 회비가 확인되지 않을 때 알림을 드립니다."}</span></form>`;
  }
  // 이 기기에 알림 열쇠 태그(md) — apps-script/mission-dues-push.gs 가 이 태그가 붙은 기기에만 보낸다
  function tagDevice(me) {
    const k = me && me.member && me.member.due_day && me.member.push_key;
    if (!k || !window.ONESIGNAL_APP_ID) return;
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function (OneSignal) { try { await OneSignal.User.addTag("md", k); } catch (e) { } });
  }

  // 회비 칸: 연납이면 한 해 완납. 아니면 낸 달 수
  function duesSummary(d, rate) {
    d = d || {};
    if (d["연납"]) return { full: true, months: 12, total: Object.values(d).reduce((s, x) => s + Number(x.amount || 0), 0) };
    const months = PERIODS.filter((p) => d[p]).length;
    return { full: months === 12, months, total: Object.values(d).reduce((s, x) => s + Number(x.amount || 0), 0), rate };
  }
  function duesStrip(d) {
    d = d || {};
    const year = !!d["연납"];
    return `<div class="mj-strip" role="list">
      <span class="mj-cell mj-year${year ? " on" : ""}" role="listitem" title="${year ? "연납 " + won(d["연납"].amount) + "원 · " + dot(d["연납"].date) : "연납"}">연납</span>
      ${PERIODS.map((p) => `<span class="mj-cell${d[p] || year ? " on" : ""}" role="listitem" title="${d[p] ? won(d[p].amount) + "원 · " + dot(d[p].date) : ""}">${mLabel(p)}</span>`).join("")}
    </div>`;
  }

  /* ───────── 성도 화면 ───────── */
  const RULE = `<ul class="mj-duty">
      <li>회비: 1년에 10만 원(월 1만 원). 임원은 월 2만 원입니다.</li>
      <li>구제선교위원회 사업에 적극 참여합니다.</li>
      <li>경조사를 임원에게 알리고 함께 위로와 격려에 참여합니다.</li>
      <li>복음을 전하는 일에 적극 협력합니다.</li>
    </ul>
    <p class="ms-form-hint">총회 의결권은 그 회기 회비를 총회 전까지 낸 정회원에게 있습니다. 일반회원은 언권회원으로 총회에서 발언할 수 있으나 표결에는 참여하지 않습니다.</p>`;
  function render() {
    if (!J.ok) { sec.hidden = true; sideRefresh(); return; }
    sec.hidden = false;
    const me = J.me;
    let h = "";
    if (!sess() || !me) {
      h += `<p class="ms-member-rule">선교헌금을 드린 모든 성도는 일반회원입니다. 정회원은 홈페이지에서 가입하면 바로 정회원이 됩니다.</p>${RULE}
        <p><button type="button" class="btn btn-solid ms-btn-s" id="mjLogin">로그인하고 신청하기</button></p>`;
    } else {
      const m = me.member;
      if (!m || m.status === "탈퇴" || m.status === "반려") {
        h += `<p class="ms-member-rule">선교헌금을 드린 모든 성도는 일반회원입니다. 정회원은 아래 의무를 함께 지는 회원입니다.</p>${RULE}`;
        if (m && m.status === "반려") h += `<p class="ms-member-me">지난 신청은 받아들여지지 않았습니다. 궁금한 점은 임원에게 물어 주세요.</p>`;
        h += `<form class="nt-form ms-form mj-form" id="mjForm">
            ${me.linked ? `<p class="ms-form-hint">${esc(me.name || "")} 님 이름으로 신청합니다. 교적과 함께 연결됩니다.</p>`
              : `<label class="nt-f"><span>이름</span><input type="text" id="mjName" maxlength="50" required autocomplete="name" /></label>
                 <p class="ms-form-hint">교적 인증을 아직 안 하셨으면 이름으로 신청됩니다. 임원이 교적과 이어 드립니다.</p>`}
            <label class="nt-f"><span>한마디 (선택)</span><input type="text" id="mjNote" maxlength="200" autocomplete="off" /></label>
            <button type="submit" class="btn btn-solid nt-submit">정회원 가입하기</button>
            <div class="nt-status" hidden></div>
          </form>`;
      } else if (m.status === "신청") {
        h += `<p class="ms-member-me">${dot(m.applied_at)}에 정회원 가입을 신청하셨습니다. 임원이 확인하면 정회원이 됩니다.</p>
          <p><button type="button" class="ms-link" id="mjCancel">신청 취소</button></p>`;
      } else {
        const s = duesSummary(me.dues, me.rate);
        if (J.justJoined) h += `<div class="mj-welcome"><b>정회원으로 가입되었습니다.</b> 회비는 1년에 10만 원(월 1만 원)입니다. 아래 「회비 내기」에서 토스로 보내시거나 계좌로 보내 주세요. 납부일을 정해 두시면 날짜가 지났을 때 알려 드립니다.</div>`;
        h += `<p class="ms-member-me">구제선교위원회 정회원이십니다${m.exec ? " · 실행위원" : ""}.</p>
          <div class="mj-mine">
            <h4>${esc(me.year)}년도 회비 <small class="ms-names-who">(${dot(me.from)} ~ ${dot(me.to)} · 회계가 확인한 것)</small></h4>
            ${duesStrip(me.dues)}
            <p class="mj-sum">${s.full ? "한 해 회비를 모두 내셨습니다" : `낸 달 ${s.months}개월`} · 합계 ${won(s.total)}원 <span class="ms-form-hint">한 달 ${won(me.rate)}원${me.rate === 20000 ? "(임원)" : ""}</span></p>
            ${payBox(me)}
            ${dueBox(me)}
            ${me.prev && Object.keys(me.prev).length ? `<details class="mj-prev"><summary>지난 회기(${me.year - 1}년도)</summary>${duesStrip(me.prev)}</details>` : ""}
          </div>
          <p><button type="button" class="ms-link" id="mjCancel">정회원 탈퇴</button></p>`;
      }
    }
    if (J.roster) {
      const ms = J.roster.members || [];
      const wait = ms.filter((x) => x.status === "신청").length, reg = ms.filter((x) => x.status === "정회원").length;
      h += `<div class="ms-book-bar"><span>정회원 명부 <small class="ms-names-who">(${esc(J.roster.year)}년도 · 정회원 ${reg}명${wait ? ` · 신청 ${wait}건` : ""})</small></span>
        <span class="ms-book-btns"><button type="button" class="btn btn-line ms-btn-s" id="mjRosterOpen">${J.roster.can_dues ? "명부 · 회비 체크" : "명부 보기"}</button></span></div>`;
    }
    box.innerHTML = h;
    const q = (s) => box.querySelector(s);
    if (q("#mjLogin")) q("#mjLogin").onclick = openLogin;
    if (q("#mjForm")) q("#mjForm").onsubmit = apply;
    if (q("#mjCancel")) q("#mjCancel").onclick = cancel;
    if (q("#mjRosterOpen")) q("#mjRosterOpen").onclick = openRoster;
    if (q("#mjCopy")) q("#mjCopy").onclick = (e) => {
      const a = e.target.dataset.acct, done = () => { e.target.textContent = "복사했습니다"; };
      if (navigator.clipboard) navigator.clipboard.writeText(a).then(done, () => prompt("계좌번호", a)); else prompt("계좌번호", a);
    };
    if (q("#mjDueDay")) q("#mjDueDay").onchange = async (e) => {
      const st = q("#mjDueSt"); e.target.disabled = true; st.textContent = "저장 중…";
      try { J.me = await rpc("mission_join_set_due_day", { p_day: e.target.value ? Number(e.target.value) : null }); render(); }
      catch (er) { e.target.disabled = false; st.textContent = "저장하지 못했습니다: " + er.message; }
    };
    tagDevice(me);
    sideRefresh();
  }
  async function apply(e) {
    e.preventDefault();
    const f = e.target, st = f.querySelector(".nt-status"), btn = f.querySelector(".nt-submit");
    const name = f.querySelector("#mjName") ? f.querySelector("#mjName").value.trim() : null;
    btn.disabled = true; st.hidden = false; st.textContent = "가입하는 중…";
    try {
      J.me = await rpc("mission_join_apply", { p_name: name, p_note: f.querySelector("#mjNote").value.trim() });
      J.justJoined = !!(J.me && J.me.member && J.me.member.status === "정회원");
      await loadRoster(); render();
      const wl = box.querySelector(".mj-welcome"); if (wl) wl.scrollIntoView({ block: "center" });
    }
    catch (er) { btn.disabled = false; st.textContent = "가입하지 못했습니다: " + er.message; }
  }
  async function cancel() {
    const m = J.me && J.me.member;
    if (!m || !confirm(m.status === "신청" ? "정회원 가입 신청을 취소할까요?" : "정회원에서 탈퇴할까요? 회비 기록은 그대로 남습니다.")) return;
    try { J.me = await rpc("mission_join_cancel", {}); await loadRoster(); render(); } catch (er) { alert("처리하지 못했습니다: " + er.message); }
  }

  /* ───────── 명부 · 회비 체크 (임원 · 회계) ───────── */
  let modal = null, rYear = null;
  function makeModal() {
    modal = document.createElement("div");
    modal.className = "modal"; modal.hidden = true;
    modal.innerHTML = `<div class="modal-backdrop" data-mjclose></div>
      <div class="modal-box modal-box-notice ms-modal-wide" role="dialog" aria-modal="true" aria-label="정회원 명부">
        <button class="modal-close" data-mjclose aria-label="닫기">&times;</button>
        <h3 class="m-title"></h3><div id="mjBody"></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target.hasAttribute("data-mjclose")) { modal.hidden = true; document.body.style.overflow = ""; render(); } });
  }
  async function openRoster() {
    if (!modal) makeModal();
    rYear = selYear() || (J.roster && J.roster.year);
    modal.hidden = false; document.body.style.overflow = "hidden";
    await reloadRoster();
  }
  async function reloadRoster() {
    const body = modal.querySelector("#mjBody");
    try { const r = await rpc("mission_roster", { p_year: rYear }); if (r) { J.rosterY = r; if (!J.roster || r.year === J.roster.year) J.roster = r; } }
    catch (e) { body.innerHTML = `<p class="ms-empty">명부를 읽지 못했습니다: ${esc(e.message)}</p>`; return; }
    drawRoster();
  }
  function drawRoster() {
    const R = J.rosterY, body = modal.querySelector("#mjBody");
    if (!R) { body.innerHTML = `<p class="ms-empty">이 회기 명부를 볼 권한이 없습니다.</p>`; return; }
    modal.querySelector(".m-title").textContent = `정회원 명부 — ${R.year}년도 회기`;
    const ms = R.members || [];
    const wait = ms.filter((x) => x.status === "신청"), reg = ms.filter((x) => x.status === "정회원"), out = ms.filter((x) => x.status === "반려" || x.status === "탈퇴");
    const execN = reg.filter((x) => x.exec).length;
    let h = "";
    if (wait.length) {
      h += `<h4 class="mj-h">가입 신청 ${wait.length}건</h4><ul class="mj-wait">${wait.map((m) => `<li>
          <span class="mj-name">${esc(m.name)}</span>${m.linked ? "" : ` <small class="mj-unlinked">교적 미연결</small>`}
          <small class="ms-form-hint">${dot(m.applied_at)}${m.note ? " · " + esc(m.note) : ""}</small>
          <span class="mj-acts"><button type="button" class="btn btn-solid ms-btn-s" data-ok="${m.id}">승인</button>
          <button type="button" class="ms-link" data-no="${m.id}">반려</button></span></li>`).join("")}</ul>`;
    }
    const voters = reg.filter((x) => duesSummary(x.dues, x.rate).full), voteN = voters.length;
    // 의결권 있는 정회원 명단 — 그 회기 회비를 다 낸 정회원(연납 또는 12달). 총회 출석부로 쓴다
    h = `<div class="mj-voters"><h4 class="mj-h">의결권 있는 정회원 ${voteN}명 <small class="ms-names-who">(${R.year}년도 회기 회비를 모두 낸 정회원 · 정회원 ${reg.length}명 가운데)</small></h4>
      ${voteN ? `<ol class="mj-voter-list">${voters.map((m) => `<li>${esc(m.name)}${m.exec ? " <small>실행위원</small>" : ""}${m.officer ? " <small>임원</small>" : ""}</li>`).join("")}</ol>
        <button type="button" class="ms-link" id="mjVoteCopy">명단 복사</button>`
      : `<p class="ms-empty">아직 이 회기 회비를 모두 낸 정회원이 없습니다.</p>`}</div>` + h;
    h += `<h4 class="mj-h">정회원 ${reg.length}명 <small class="ms-names-who">실행위원 ${execN}명 (5인까지) · 의결권(이 회기 회비 완납) ${voteN}명</small></h4>
      <p class="ms-form-hint">정회원은 탈퇴하지 않는 한 다음 회기에도 명부에 그대로 남습니다. 의결권은 연납 또는 12달 회비를 모두 낸 분에게 표시됩니다.</p>`;
    if (R.can_dues) h += `<p class="ms-form-hint">회비 칸을 누르면 낸 것으로 체크합니다(금액은 한 달 1만 원, 임원 2만 원, 연납 10만 원 · 임원 24만 원으로 들어가며 바꿀 수 있습니다). 다시 누르면 체크를 풉니다.</p>`;
    if (!reg.length) h += `<p class="ms-empty">아직 정회원이 없습니다.</p>`;
    else {
      h += `<div class="mj-table-wrap"><table class="mj-table"><thead><tr><th>이름</th><th>실행위원</th><th>연납</th>${PERIODS.map((p) => `<th>${mLabel(p)}</th>`).join("")}<th>합계</th><th>의결권</th><th>납부일</th><th></th></tr></thead><tbody>
        ${reg.map((m) => {
          const d = m.dues || {}, s = duesSummary(d, m.rate);
          const cell = (p) => {
            const on = !!d[p], cover = p !== "연납" && !!d["연납"];
            const t = on ? `${won(d[p].amount)}원 · ${dot(d[p].date)}${d[p].note ? " · " + d[p].note : ""}` : cover ? "연납" : "";
            return `<td><button type="button" class="mj-dot${on ? " on" : ""}${cover ? " cover" : ""}" ${R.can_dues ? "" : "disabled"} data-m="${m.id}" data-p="${p}" title="${esc(t)}" aria-pressed="${on}" aria-label="${esc(m.name)} ${p === "연납" ? "연납" : mLabel(p)}">${on ? "✓" : cover ? "·" : ""}</button></td>`;
          };
          return `<tr><th scope="row"><span class="mj-name">${esc(m.name)}</span>${m.officer ? ` <small class="mj-tag">임원</small>` : ""}${m.linked ? "" : ` <button type="button" class="ms-link mj-unlinked" data-link="${m.id}" title="교적에서 같은 이름 한 분이면 연결합니다">교적 연결</button>`}</th>
            <td><input type="checkbox" data-exec="${m.id}" ${m.exec ? "checked" : ""} ${R.can_exec ? "" : "disabled"} aria-label="${esc(m.name)} 실행위원" /></td>
            ${cell("연납")}${PERIODS.map(cell).join("")}
            <td class="mj-total">${won(s.total)}</td>
            <td>${s.full ? "있음" : `<small class="mj-unlinked">회비 전</small>`}</td>
            <td>${m.due_day ? `${m.due_day}일` : ""}</td>
            <td><button type="button" class="ms-link" data-out="${m.id}">내리기</button></td></tr>`;
        }).join("")}</tbody></table></div>`;
    }
    h += `<form class="mj-add" id="mjAdd"><label class="nt-f"><span>교적에서 찾아 올리기${R.can_exec ? " · 실행위원 세우기" : ""}</span>
        <input type="text" id="mjAddName" maxlength="50" placeholder="이름" autocomplete="off" required /></label>
        <button type="submit" class="btn btn-line ms-btn-s">교적에서 찾기</button></form>
      <div id="mjFound"></div>
      ${R.can_exec ? "" : `<p class="ms-form-hint">실행위원은 위원장 · 서기가 세웁니다.</p>`}`;
    if (R.can_dues) {
      const p = R.pay || {};
      h += `<form class="mj-payset" id="mjPaySet"><h4 class="mj-h">회비 받는 계좌 <small class="ms-names-who">(회계가 정합니다 · 로그인한 정회원에게 보입니다)</small></h4>
        <div class="mj-payset-row">
          <label class="nt-f"><span>은행</span><input type="text" id="mpBank" maxlength="30" value="${esc(p.bank || "")}" placeholder="농협" /></label>
          <label class="nt-f"><span>계좌번호</span><input type="text" id="mpAcct" maxlength="40" value="${esc(p.account || "")}" inputmode="numeric" /></label>
          <label class="nt-f"><span>예금주</span><input type="text" id="mpHolder" maxlength="50" value="${esc(p.holder || "")}" placeholder="구제선교위원회" /></label>
        </div>
        <label class="nt-f"><span>토스 송금 링크 (선택 · 예: https://toss.me/아이디)</span><input type="text" id="mpToss" maxlength="200" value="${esc(p.toss_url || "")}" /></label>
        <p class="ms-form-hint">토스 링크를 비워 두면 ‘토스로 보내기’가 토스 앱 송금 화면(은행 · 계좌번호 · 금액이 채워진 화면)으로 열립니다.</p>
        <div><button type="submit" class="btn btn-line ms-btn-s">계좌 저장</button> <span class="ms-form-hint" id="mpSt"></span></div></form>`;
    }
    if (out.length) h += `<details class="mj-prev"><summary>반려 · 탈퇴 ${out.length}명</summary><ul class="mj-wait">${out.map((m) => `<li><span class="mj-name">${esc(m.name)}</span> <small class="ms-form-hint">${esc(m.status)}</small>
        <span class="mj-acts"><button type="button" class="ms-link" data-ok="${m.id}">정회원으로</button></span></li>`).join("")}</ul></details>`;
    body.innerHTML = h;

    const run = async (fn) => { try { await fn(); await reloadRoster(); } catch (e) { alert("처리하지 못했습니다: " + e.message); } };
    body.querySelectorAll("[data-ok]").forEach((b) => b.onclick = () => run(() => rpc("mission_member_set", { p_id: Number(b.dataset.ok), p_status: "정회원" })));
    body.querySelectorAll("[data-no]").forEach((b) => b.onclick = () => { if (confirm("이 신청을 반려할까요?")) run(() => rpc("mission_member_set", { p_id: Number(b.dataset.no), p_status: "반려" })); });
    body.querySelectorAll("[data-out]").forEach((b) => b.onclick = () => { if (confirm("정회원 명부에서 내릴까요(탈퇴)? 회비 기록은 남습니다.")) run(() => rpc("mission_member_set", { p_id: Number(b.dataset.out), p_status: "탈퇴" })); });
    body.querySelectorAll("[data-exec]").forEach((c) => c.onchange = () => run(() => rpc("mission_member_set", { p_id: Number(c.dataset.exec), p_exec: c.checked })));
    body.querySelectorAll("[data-link]").forEach((b) => b.onclick = () => run(async () => {
      const r = await rpc("mission_member_link", { p_id: Number(b.dataset.link) });
      if (!r || !r.linked) alert("교적에서 이 이름을 한 분으로 찾지 못했습니다(없거나 같은 이름이 여럿). 교적 인증을 마치면 다시 눌러 주세요.");
    }));
    body.querySelectorAll(".mj-dot").forEach((b) => b.onclick = () => {
      if (!R.can_dues) return;
      const m = (R.members || []).find((x) => String(x.id) === b.dataset.m), p = b.dataset.p, on = b.classList.contains("on");
      if (on) { if (!confirm(`${m.name} 님 ${p === "연납" ? "연납" : mLabel(p)} 체크를 풀까요?`)) return; run(() => rpc("mission_dues_set", { p_member_id: m.id, p_year: R.year, p_period: p, p_paid: false })); return; }
      const def = p === "연납" ? (m.rate === 20000 ? 240000 : 100000) : m.rate;
      const v = prompt(`${m.name} 님 ${p === "연납" ? "연납" : mLabel(p)} 회비 금액(원)`, String(def));
      if (v === null) return;
      const amt = Number(String(v).replace(/[^\d]/g, ""));
      if (!amt) { alert("금액을 숫자로 적어 주세요."); return; }
      run(() => rpc("mission_dues_set", { p_member_id: m.id, p_year: R.year, p_period: p, p_paid: true, p_amount: amt }));
    });
    const vc = body.querySelector("#mjVoteCopy");
    if (vc) vc.onclick = () => {
      const t = voters.map((m, i) => `${i + 1}. ${m.name}`).join(String.fromCharCode(10));
      const done = () => { vc.textContent = "복사했습니다"; };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, () => prompt("명단", t)); else prompt("명단", t);
    };
    const ps = body.querySelector("#mjPaySet");
    if (ps) ps.onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => ps.querySelector(id).value.trim(), st = ps.querySelector("#mpSt");
      if (!v("#mpToss") && !(v("#mpBank") && v("#mpAcct"))) { st.textContent = "은행과 계좌번호, 또는 토스 링크를 적어 주세요."; return; }
      st.textContent = "저장 중…";
      try {
        const r = await rpc("mission_pay_set", { p_bank: v("#mpBank"), p_account: v("#mpAcct"), p_holder: v("#mpHolder"), p_toss_url: v("#mpToss") });
        R.pay = r; if (J.me) J.me.pay = r; st.textContent = "저장했습니다.";
      } catch (er) { st.textContent = "저장하지 못했습니다: " + er.message; }
    };
    const add = body.querySelector("#mjAdd"), found = body.querySelector("#mjFound");
    add.onsubmit = async (e) => {
      e.preventDefault();
      const n = add.querySelector("#mjAddName").value.trim(); if (!n) return;
      found.innerHTML = `<p class="ms-form-hint">찾는 중…</p>`;
      let list = [];
      try { list = await rpc("mission_gyojeok_find", { p_name: n }) || []; }
      catch (er) { found.innerHTML = `<p class="ms-form-hint">교적을 읽지 못했습니다: ${esc(er.message)}</p>`; return; }
      const nameOnly = `<p class="ms-form-hint">교적에 없는 분이면 <button type="button" class="ms-link" id="mjNameOnly">「${esc(n)}」 이름으로만 정회원 올리기</button> (교적과 연결되지 않습니다)</p>`;
      if (!list.length) { found.innerHTML = `<p class="ms-form-hint">교적에서 찾지 못했습니다.</p>${nameOnly}`; }
      else {
        found.innerHTML = `<ul class="mj-wait mj-found">${list.map((g, i) => `<li>
            <span class="mj-name">${esc(g.name)}</span> <small class="ms-form-hint">${g.born ? esc(g.born) + "년생" : ""}${g.role ? " · " + esc(g.role) : ""}${g.status ? " · " + esc(g.status) + (g.exec ? " · 실행위원" : "") : ""}</small>
            <span class="mj-acts">${g.status === "정회원" ? "" : `<button type="button" class="btn btn-line ms-btn-s" data-gadd="${i}">정회원으로</button>`}
            ${R.can_exec && !g.exec ? `<button type="button" class="btn btn-solid ms-btn-s" data-gexec="${i}">실행위원으로</button>` : ""}</span></li>`).join("")}</ul>${nameOnly}`;
      }
      const go = (g, exec) => run(async () => {
        await rpc("mission_member_add", { p_name: g.name, p_gyojeok_id: g.id, p_exec: exec });
      });
      found.querySelectorAll("[data-gadd]").forEach((b) => b.onclick = () => go(list[Number(b.dataset.gadd)], false));
      found.querySelectorAll("[data-gexec]").forEach((b) => b.onclick = () => go(list[Number(b.dataset.gexec)], true));
      const no = found.querySelector("#mjNameOnly");
      if (no) no.onclick = () => run(async () => {
        const r = await rpc("mission_member_add", { p_name: n, p_gyojeok_id: null, p_exec: false });
        if (r && !r.linked) alert(`${n} 님을 올렸습니다. 교적과는 연결되지 않았습니다.`);
      });
    };
  }

  /* ───────── 읽기 ───────── */
  async function loadRoster() {
    J.roster = null;
    if (!sess()) return;
    try { J.roster = await rpc("mission_roster", { p_year: null }); } catch (e) { J.roster = null; }
  }
  async function load() {
    if (!ready()) { J.ok = false; render(); return; }
    try { J.me = await rpc("mission_join_me", {}); J.ok = true; }
    catch (e) { J.ok = false; J.me = null; }        // 함수 없음 = SQL 실행 전 → 칸을 숨긴다
    if (J.ok) await loadRoster();
    render();
  }
  load();
  window.addEventListener("church:auth", load);
  window.MissionJoin = { reload: load, state: J, openRoster };
})();
