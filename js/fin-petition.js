/* ============================================================
   운평장로교회 — 재정 청원 (petition.html) (2026-11-24 담임목사 지시)
   DB: supabase/20261124_0800_fin_petitions.sql
   · 청원할 수 있는 사람
       - 부서 부장: 재정관리 ▸ 예산·계정 ▸ 부서·부장 청원 에서 교적으로 지정. 그 부서 계정만.
       - 재정 청원 권한자: 교적관리 ▸ 권한 관리 「재정 청원」. 모든 지출 예산 계정(부서 칸 없음).
   · 계정을 고르면 연 예산 · 집행 · 청원 중 · 집행률 · 남은 예산(% · 원)을 보여 주고,
     이 청원을 더하면 집행률이 몇 %가 되는지도 미리 보여 준다.
   · 영수증 사진(또는 PDF)을 붙인다 — ChurchUpload(R2) 로 올리고 주소를 청원에 담는다.
   · 받는 계좌(20261124_0900): 등록한 계좌를 고르거나, 다른 사람이 받을 때는 그때만 쓰는 계좌를 적는다.
     「계좌번호 등록하기」를 고르면 다음에도 쓴다. 등록한 계좌는 지울 수 없다(고치려면 새로 등록).
   · 낸 청원은 돌아오는 주일의 지출결의서로 간다. 재정부가 「확인」하면 결의서에 들어가고 영수증이 첨부된다.
   ============================================================ */
(function () {
  const root = document.getElementById("ptRoot");
  if (!root) return;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const won = (n) => (Number(n) || 0).toLocaleString("ko-KR");
  const num = (v) => Number(String(v == null ? "" : v).replace(/[^\d]/g, "")) || 0;
  const pct = (v) => (v == null ? "—" : (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + "%");
  const DOW = ["주일", "월", "화", "수", "목", "금", "토"];
  function weekName(ds) { const d = new Date(ds + "T00:00:00"); return (d.getMonth() + 1) + "월 " + (Math.floor((d.getDate() - 1) / 7) + 1) + "주"; }
  function nextSunday() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + (7 - d.getDay()) % 7); return d; }

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
  async function api(method, path, body) {
    const s = sess();
    const headers = { apikey: window.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (s && s.access_token) headers.Authorization = "Bearer " + s.access_token;
    const res = await fetch(window.SUPABASE_URL + "/rest/v1/" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!res.ok) { const e = new Error((data && (data.message || data.error)) || ("HTTP " + res.status)); e.status = res.status; e.code = data && data.code; throw e; }
    return data;
  }
  const rpc = (fn, args) => api("POST", "rpc/" + fn, args || {});
  function myId() { const s = sess(); return (s && s.user && s.user.id) || ""; }
  function accLabel(a) { return `${a.bank} ${a.account_no} (${a.holder})`; }

  // 청원 단위: 부서(부장) 또는 '' (재정 청원 권한자)
  const S = { units: [], cur: 0, budget: {}, mine: [], files: [], busy: false };

  async function load() {
    if (!ready()) { root.innerHTML = `<p class="pt-empty">준비 중입니다.</p>`; return; }
    if (!sess()) { root.innerHTML = `<div class="pt-card pt-empty">로그인한 뒤 이용해 주세요. 위쪽 「로그인」을 눌러 주세요.</div>`; return; }
    try {
      const [depts, acc] = await Promise.all([rpc("fin_my_depts"), rpc("broadcast_access").catch(() => ({}))]);
      S.units = (depts || []).map((d) => ({ dept: d.dept, label: d.dept + " 부장" }));
      if (acc && acc.canPetition) S.units.push({ dept: "", label: "재정 청원(모든 계정)" });
    } catch (e) {
      if (e.code === "PGRST202" || e.code === "42883" || e.status === 404) { root.innerHTML = `<p class="pt-empty">재정 청원 기능을 준비하고 있습니다.</p>`; return; }
      root.innerHTML = `<p class="pt-empty">불러오지 못했습니다: ${esc(e.message)}</p>`; return;
    }
    if (!S.units.length) {
      root.innerHTML = `<div class="pt-card pt-empty">재정 청원은 <b>부서 부장</b>으로 지정되었거나 <b>재정 청원 권한</b>을 받은 분만 할 수 있습니다.<br>필요하시면 재정부나 담임목사님께 말씀해 주세요.<br><small>(부장 지정은 교적과 연결된 로그인 계정이어야 합니다.)</small></div>`;
      return;
    }
    await loadUnit();
  }
  async function loadUnit() {
    const u = S.units[S.cur];
    root.innerHTML = `<p class="pt-empty">불러오는 중…</p>`;
    try {
      const uid = encodeURIComponent(myId());
      const [b, mine, accs] = await Promise.all([
        rpc("fin_dept_budget", { p_dept: u.dept }),
        api("GET", "fin_petitions?select=*&requester_uid=eq." + uid + "&order=id.desc&limit=300"),
        api("GET", "fin_payee_accounts?select=id,holder,bank,account_no&owner_uid=eq." + uid + "&order=id.desc").catch(() => null),
      ]);
      S.accounts = accs || [];
      S.accMissing = accs == null;
      S.budget = {}; (b || []).forEach((r) => { S.budget[r.hang] = r; });
      S.budgetList = b || [];
      S.mine = mine || [];
    } catch (e) { root.innerHTML = `<p class="pt-empty">불러오지 못했습니다: ${esc(e.message)}</p>`; return; }
    draw();
  }

  function stat(r, extra) {
    const budget = Number(r.budget) || 0, spent = Number(r.spent) || 0, pend = Number(r.pending) || 0, add = Number(extra) || 0;
    const used = spent + pend + add;
    return { budget, spent, pend, add, rate: budget ? spent / budget * 100 : null, rateAll: budget ? used / budget * 100 : null, left: budget - used, leftPct: budget ? (budget - used) / budget * 100 : null };
  }
  function bar(st) {
    if (!st.budget) return `<span class="pt-left">예산 없음</span>`;
    const a = Math.min(100, st.rate), b = Math.min(100 - a, Math.max(0, st.rateAll - st.rate));
    return `<div class="pt-bar${st.rateAll > 100 ? " over" : ""}"><i style="width:${a}%"></i><i class="p" style="left:${a}%;width:${b}%"></i><b>집행률 ${pct(st.rate)}</b></div>` +
      `<div class="pt-left${st.leftPct != null && st.leftPct < 10 ? " low" : ""}">남은 예산 ${pct(st.leftPct)} · ${won(st.left)}원${st.pend + st.add ? ` <small>(청원 중 ${won(st.pend + st.add)}원 뺀 값)</small>` : ""}</div>`;
  }

  function draw() {
    const u = S.units[S.cur];
    const sun = nextSunday(), sunTxt = `${sun.getMonth() + 1}월 ${sun.getDate()}일(주일)`;
    const tabs = S.units.length > 1 ? `<div class="pt-depts">${S.units.map((x, i) => `<button data-u="${i}"${i === S.cur ? ' class="on"' : ""}>${esc(x.label)}</button>`).join("")}</div>` : "";
    // 2026-11-24 담임목사: "모든 예산을 다 보여주지 마세요. 자신이 선택한 계정의 예산만" → 예산 전체 표 없음. 고른 계정 하나만 아래 상자에.
    const fy = S.budgetList[0] || {};
    const has = S.budgetList.length > 0;
    // 2026-11-24 담임목사: 계정을 고르기도 하고 직접 입력해서도 고를 수 있게 → 입력칸 + 목록(datalist)
    const opts = S.budgetList.map((r) => `<option value="${esc(r.hang)}" label="${esc(r.gwan || "")}"></option>`).join("");
    const mine = S.mine.filter((p) => (u.dept ? p.dept === u.dept : true));
    const stName = { submitted: "확인 대기", approved: "확인됨", rejected: "돌려보냄", cancelled: "거둠" };
    S.sug = suggestions(mine);
    const sugHTML = S.sug.length ? `<div class="pt-sug"><div class="pt-sug-h">전에 청원한 항목 <small>— 누르면 계정 · 내역 · 금액 · 계좌가 채워집니다. 금액은 고칠 수 있습니다.</small></div><div class="pt-sug-l">` +
      S.sug.slice(0, 8).map((g, i) => `<button type="button" data-sug="${i}">${esc(g.item)}<small>${esc(g.hang)} · ${won(g.amount)}원${g.count > 1 ? ` · ${g.count}번` : ""}</small></button>`).join("") + `</div></div>` : "";
    const itemList = `<datalist id="ptItemList">${S.sug.map((g) => `<option value="${esc(g.item)}">`).join("")}</datalist>`;
    root.innerHTML = tabs +
      (has ? `<div class="pt-card"><h3>청원서 쓰기 <small style="font-weight:400;color:#898885">${esc(u.dept ? u.dept : "")}${fy.fy ? (u.dept ? " · " : "") + fy.fy + "년도" : ""}</small></h3>${sugHTML}<div class="pt-f">
        <div><label>예산 계정 <small style="font-weight:400">(적거나 목록에서 고르세요)</small></label><input id="ptHang" list="ptHangList" autocomplete="off" placeholder="예: ${esc((S.budgetList[0] || {}).hang || "계정 이름")}"><datalist id="ptHangList">${opts}</datalist><div class="pt-help" id="ptHangHint" style="display:none;color:#C62828"></div></div>
        <div><label>금액(원)</label><input id="ptAmt" inputmode="numeric" placeholder="예: 150,000"></div>
        <div class="full"><label>지출 내역</label><input id="ptItem" maxlength="200" list="ptItemList" autocomplete="off" placeholder="예: 성탄절 행사 간식">${itemList}</div>
        <div class="full"><label>메모 <small style="font-weight:400">(받는 분 · 계좌 · 까닭 등)</small></label><textarea id="ptMemo" rows="2"></textarea></div>
        <div class="full pt-pay"><label>받는 계좌</label>${payHTML()}</div>
        <div class="full"><label>영수증 <small style="font-weight:400">(사진 또는 PDF, 10장까지)</small></label><input id="ptFile" type="file" accept="image/*,application/pdf" multiple><div class="pt-rcps" id="ptRcps"></div></div>
        <div class="pt-after" id="ptAfter"></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-solid" id="ptSend">청원 올리기</button><span class="pt-help">올린 청원은 <b>${esc(sunTxt)}</b> 지출결의서로 갑니다. 재정부가 확인하면 결의서에 들어갑니다.</span></div>
      <div class="pt-msg" id="ptMsg"></div></div>` : `<div class="pt-card"><p class="pt-help">청원할 수 있는 계정이 아직 정해지지 않았습니다. 재정부에 말씀해 주세요.</p></div>`) +
      `<div class="pt-card"><h3>내 청원</h3>` + sumHTML(mine, fy) +
      (mine.length ? `<p class="pt-help" style="margin:-4px 0 8px">「지급 완료」는 당회장 결재가 끝난 지출결의서가 나와 지급 절차에 들어갔다는 뜻입니다. <b>통장에 들어오기까지 1~2일 걸릴 수 있습니다.</b></p>` +
        `<div style="overflow:auto"><table class="pt-t"><thead><tr><th>결의서</th><th>계정</th><th>내역</th><th class="n">금액</th><th>상태</th><th></th></tr></thead><tbody>` +
        mine.slice(0, 60).map((p) => `<tr><td>${esc(weekName(p.week_sunday))}</td><td>${esc(p.hang)}</td><td>${esc(p.item)}${(p.receipts || []).map((r, i) => ` <a href="${esc(r)}" target="_blank" rel="noopener" style="font-size:.78rem">영수증${(p.receipts || []).length > 1 ? i + 1 : ""}</a>`).join("")}${p.pay_account ? `<div class="pt-help">받는 계좌: ${esc(p.pay_bank)} ${esc(p.pay_account)} (${esc(p.pay_holder)})</div>` : ""}${p.review_note ? `<div class="pt-help">${esc(p.review_note)}</div>` : ""}</td><td class="n">${won(p.amount)}</td><td>${p.status === "approved" && p.paid_at ? `<span class="pt-st paid">지급 완료</span><div class="pt-help" style="white-space:nowrap">${esc(String(p.paid_at).slice(5, 10).replace("-", "/"))} · 입금까지 1~2일</div>` : `<span class="pt-st ${esc(p.status)}">${esc(stName[p.status] || p.status)}</span>`}</td><td>${p.status === "submitted" ? `<button class="btn btn-line" data-cancel="${p.id}" style="padding:3px 9px;font-size:.78rem">거두기</button>` : ""}</td></tr>`).join("") +
        `</tbody></table></div>` : `<p class="pt-help">아직 낸 청원이 없습니다.</p>`) + `</div>`;
    wire();
  }

  // 전에 낸 청원(거둔 것 · 돌려보낸 것 빼고)을 「계정 + 내역」으로 묶어 자주 · 최근 순으로. 올해 고를 수 있는 계정만.
  function suggestions(mine) {
    const by = {}, list = [];
    mine.forEach((p) => {   // mine 은 최근 것이 앞
      if (p.status === "cancelled" || p.status === "rejected" || !S.budget[p.hang]) return;
      const item = String(p.item || "").trim(); if (!item) return;
      const k = p.hang + "|" + item;
      if (!by[k]) { by[k] = { hang: p.hang, item, amount: Number(p.amount) || 0, memo: p.memo || "", pay_bank: p.pay_bank || "", pay_account: p.pay_account || "", pay_holder: p.pay_holder || "", count: 0, order: list.length }; list.push(by[k]); }
      by[k].count++;
    });
    return list.sort((a, b) => b.count - a.count || a.order - b.order);
  }
  function applySug(g, onlyEmpty) {
    const $ = (s) => root.querySelector(s);
    if (!onlyEmpty || !$("#ptHang").value) $("#ptHang").value = g.hang;
    if (!onlyEmpty || !$("#ptItem").value.trim()) $("#ptItem").value = g.item;
    if (!onlyEmpty || !num($("#ptAmt").value)) $("#ptAmt").value = g.amount ? won(g.amount) : "";
    if (!onlyEmpty || !$("#ptMemo").value.trim()) $("#ptMemo").value = g.memo;
    if (g.pay_account && !S.accMissing && !onlyEmpty) {
      const acc = S.accounts.find((a) => a.account_no === g.pay_account && a.bank === g.pay_bank);
      const pick = (v) => { const r = root.querySelector(`input[name="ptPay"][value="${v}"]`); if (r && !r.disabled) { r.checked = true; r.onchange(); return true; } return false; };
      if (acc && pick("saved")) $("#ptAcc").value = String(acc.id);
      else if (pick("new")) { $("#ptBank").value = g.pay_bank; $("#ptAccNo").value = g.pay_account; $("#ptHolder").value = g.pay_holder; }
    }
    after();
  }

  // 회기(회계연도) 안에 내가 청원한 금액 합계 — 거둔 것 · 돌려보낸 것은 빼고, 상태별로 나눠 보인다
  function sumHTML(mine, fy) {
    if (!fy.d_from || !fy.d_to) return "";
    const inFy = mine.filter((p) => p.week_sunday >= fy.d_from && p.week_sunday <= fy.d_to && p.status !== "cancelled" && p.status !== "rejected");
    const s = (f) => inFy.filter(f).reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const all = s(() => true), paid = s((p) => p.status === "approved" && p.paid_at), ok = s((p) => p.status === "approved" && !p.paid_at), wait = s((p) => p.status === "submitted");
    const d = (x) => String(x).slice(2).replace(/-/g, ".");
    return `<div class="pt-sum"><div class="pt-sum-t">${esc(fy.fy || "")}년도 회기 청원 총액 <small>(${d(fy.d_from)} ~ ${d(fy.d_to)} · ${inFy.length}건)</small><b>${won(all)}원</b></div>` +
      `<div class="pt-sum-l"><span>지급 완료 <b>${won(paid)}</b>원</span><span>확인됨 · 지급 전 <b>${won(ok)}</b>원</span><span>확인 대기 <b>${won(wait)}</b>원</span></div>` +
      `<div class="pt-help" style="font-size:.78rem">거둔 청원 · 돌려보낸 청원은 뺀 금액입니다.</div></div>`;
  }
  // 적은 계정 이름 → 고를 수 있는 계정(없으면 ""). 띄어쓰기 무시, 「관 · 항」 꼴도 받음.
  function hangVal() {
    const el = root.querySelector("#ptHang"); if (!el) return "";
    const v = el.value.trim(); if (!v) return "";
    if (S.budget[v]) return v;
    const tail = v.split(/[·>\/]/).pop().trim(), k = tail.replace(/\s+/g, "");
    const r = S.budgetList.find((x) => x.hang.replace(/\s+/g, "") === k);
    return r ? r.hang : "";
  }
  function hint(on, near) {
    const el = root.querySelector("#ptHangHint"); if (!el) return;
    el.style.display = on ? "" : "none";
    el.textContent = on ? "목록에 없는 계정입니다." + (near && near.length ? " 혹시: " + near.join(", ") : " 칸을 눌러 목록에서 골라 주세요.") : "";
  }

  function payHTML() {
    if (S.accMissing) return `<div class="pt-help">계좌 등록 기능을 준비하고 있습니다. 메모 칸에 받는 분 · 계좌를 적어 주세요.</div>`;
    const has = S.accounts.length > 0;
    return `<div class="pt-pay-opt">
        <label class="pt-r"><input type="radio" name="ptPay" value="saved"${has ? " checked" : " disabled"}> 등록한 계좌</label>
        <label class="pt-r"><input type="radio" name="ptPay" value="new"${has ? "" : " checked"}> 계좌 직접 입력 <small>(다른 사람이 받을 때 등)</small></label>
        <label class="pt-r"><input type="radio" name="ptPay" value="none"> 계좌 없음 <small>(현금 등)</small></label>
      </div>
      <div id="ptPaySaved"${has ? "" : ' style="display:none"'}><select id="ptAcc">${S.accounts.map((a) => `<option value="${a.id}">${esc(accLabel(a))}</option>`).join("")}</select>
        <div class="pt-help" style="margin-top:4px">등록한 계좌는 지울 수 없습니다. 계좌가 바뀌면 「계좌 직접 입력」으로 새로 등록하세요.</div></div>
      <div id="ptPayNew"${has ? ' style="display:none"' : ""} class="pt-pay-new">
        <input id="ptBank" maxlength="30" placeholder="은행 (예: 농협)">
        <input id="ptAccNo" maxlength="40" inputmode="numeric" placeholder="계좌번호 (숫자와 -)">
        <input id="ptHolder" maxlength="40" placeholder="예금주">
        <label class="pt-r" style="grid-column:1/-1"><input type="checkbox" id="ptSave"> 계좌번호 등록하기 <small>(다음 청원에도 고를 수 있게 남깁니다)</small></label>
      </div>`;
  }
  function payMode() { const r = root.querySelector('input[name="ptPay"]:checked'); return r ? r.value : "none"; }
  function after() {
    const box = root.querySelector("#ptAfter"); if (!box) return;
    const hang = hangVal(), amt = num(root.querySelector("#ptAmt").value);
    const r = S.budget[hang];
    if (!r) { box.style.display = "none"; box.innerHTML = ""; return; }
    box.style.display = "";
    const st = stat(r, amt);
    box.innerHTML = `<b>${esc(hang)}</b> — 연 예산 ${won(st.budget)}원 · 집행 ${won(st.spent)}원${st.pend ? ` · 청원 중 ${won(st.pend)}원` : ""}` +
      `<div style="margin:6px 0">${bar(st)}</div>` +
      (amt ? `이 청원(${won(amt)}원)까지 더하면 <b>집행률 ${pct(st.rateAll)}</b>` : "") +
      (st.budget && st.left < 0 ? `<br><b style="color:#C62828">예산을 ${won(-st.left)}원 넘습니다. 그래도 올릴 수는 있지만 재정부가 따로 살핍니다.</b>` : "");
  }
  function drawFiles() {
    const box = root.querySelector("#ptRcps"); if (!box) return;
    box.innerHTML = S.files.map((f, i) => `<div>${f.preview ? `<img src="${f.preview}" alt="">` : "PDF"}<button data-rm="${i}">✕</button></div>`).join("");
  }

  function wire() {
    root.querySelectorAll("[data-u]").forEach((b) => { b.onclick = () => { S.cur = Number(b.dataset.u); S.files = []; loadUnit(); }; });
    root.querySelectorAll("[data-cancel]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("이 청원을 거둘까요?")) return;
        try { await rpc("fin_petition_cancel", { p_id: Number(b.dataset.cancel) }); await loadUnit(); } catch (e) { alert(e.message); }
      };
    });
    const hang = root.querySelector("#ptHang"); if (!hang) return;
    const amt = root.querySelector("#ptAmt");
    hang.oninput = () => { hint(false); after(); };
    hang.onchange = () => {   // 띄어쓰기 · 「관 · 항」 꼴로 적어도 맞는 계정으로 바로잡고, 하나뿐인 부분 일치면 그것으로
      const v = hang.value.trim(); if (!v) { hint(false); after(); return; }
      let h = hangVal();
      if (!h) {
        const k = v.replace(/\s+/g, ""), hits = S.budgetList.filter((r) => r.hang.replace(/\s+/g, "").indexOf(k) >= 0);
        if (hits.length === 1) h = hits[0].hang;
      }
      if (h) { hang.value = h; hint(false); }
      else hint(true, S.budgetList.filter((r) => r.hang.replace(/\s+/g, "").indexOf(v.replace(/\s+/g, "").slice(0, 2)) >= 0).map((r) => r.hang).slice(0, 5));
      after();
    };
    amt.oninput = after;
    amt.onblur = () => { const v = num(amt.value); amt.value = v ? won(v) : ""; };
    root.querySelector("#ptFile").onchange = (e) => {
      Array.from(e.target.files || []).forEach((f) => {
        if (S.files.length >= 10) return;
        S.files.push({ file: f, preview: /^image\//.test(f.type) ? URL.createObjectURL(f) : "" });
      });
      e.target.value = ""; drawFiles();
    };
    root.querySelector("#ptRcps").onclick = (e) => { const i = e.target.dataset && e.target.dataset.rm; if (i != null) { S.files.splice(Number(i), 1); drawFiles(); } };
    root.querySelectorAll('input[name="ptPay"]').forEach((r) => {
      r.onchange = () => {
        const m = payMode(), a = root.querySelector("#ptPaySaved"), b = root.querySelector("#ptPayNew");
        if (a) a.style.display = m === "saved" ? "" : "none";
        if (b) b.style.display = m === "new" ? "" : "none";
      };
    });
    root.querySelectorAll("[data-sug]").forEach((b) => {
      b.onclick = () => {
        applySug(S.sug[Number(b.dataset.sug)], false);
        const m = root.querySelector("#ptMsg"); m.style.color = "#565552"; m.textContent = "전에 청원한 내용으로 채웠습니다. 금액 · 영수증을 확인하고 올려 주세요.";
        const a = root.querySelector("#ptAmt"); a.focus(); a.select();
      };
    });
    // 내역을 전에 쓴 것과 똑같이 적으면 빈 칸(계정 · 금액 · 메모)만 채워 준다
    root.querySelector("#ptItem").onchange = (e) => {
      const v = e.target.value.trim(), g = S.sug.find((x) => x.item === v);
      if (g) applySug(g, true);
    };
    root.querySelector("#ptSend").onclick = send;
    drawFiles(); after();
  }

  async function send() {
    if (S.busy) return;
    const u = S.units[S.cur], msg = root.querySelector("#ptMsg");
    const hang = hangVal(), amount = num(root.querySelector("#ptAmt").value);
    const item = root.querySelector("#ptItem").value.trim(), memo = root.querySelector("#ptMemo").value.trim();
    if (!hang) { msg.style.color = "#C62828"; msg.textContent = root.querySelector("#ptHang").value.trim() ? "목록에 있는 예산 계정을 적거나 골라 주세요." : "예산 계정을 적거나 골라 주세요."; return; }
    if (!item) { msg.style.color = "#C62828"; msg.textContent = "지출 내역을 적어 주세요."; return; }
    if (!amount) { msg.style.color = "#C62828"; msg.textContent = "금액을 적어 주세요."; return; }
    const pm = S.accMissing ? "none" : payMode();
    let pay = { p_account_id: null, p_bank: null, p_account: null, p_holder: null, p_save: false };
    if (pm === "saved") {
      const sel = root.querySelector("#ptAcc");
      if (!sel || !sel.value) { msg.style.color = "#C62828"; msg.textContent = "등록한 계좌를 골라 주세요."; return; }
      pay.p_account_id = Number(sel.value);
    } else if (pm === "new") {
      const bank = root.querySelector("#ptBank").value.trim(), no = root.querySelector("#ptAccNo").value.replace(/[^0-9-]/g, ""), holder = root.querySelector("#ptHolder").value.trim();
      if (!bank || !holder || no.replace(/-/g, "").length < 4) { msg.style.color = "#C62828"; msg.textContent = "은행 · 계좌번호 · 예금주를 모두 적어 주세요."; return; }
      pay = { p_account_id: null, p_bank: bank, p_account: no, p_holder: holder, p_save: !!root.querySelector("#ptSave").checked };
    }
    if (!S.files.length && !confirm("영수증 없이 올릴까요? (나중에 재정부에 따로 내도 됩니다)")) return;
    S.busy = true; msg.style.color = "#565552";
    try {
      const urls = [];
      for (let i = 0; i < S.files.length; i++) {
        if (!(window.ChurchUpload && window.ChurchUpload.isReady && window.ChurchUpload.isReady())) throw new Error("영수증을 올릴 수 없습니다(파일 서버 준비 전).");
        msg.textContent = `영수증 올리는 중… (${i + 1}/${S.files.length})`;
        const r = await window.ChurchUpload.upload(S.files[i].file, { folder: "fin-receipts", compress: true });
        urls.push(r.url);
      }
      msg.textContent = "청원 올리는 중…";
      if (S.accMissing) await rpc("fin_petition_submit", { p_dept: u.dept, p_hang: hang, p_item: item, p_amount: amount, p_memo: memo, p_receipts: urls });
      else await rpc("fin_petition_submit2", Object.assign({ p_dept: u.dept, p_hang: hang, p_item: item, p_amount: amount, p_memo: memo, p_receipts: urls }, pay));
      S.files = [];
      await loadUnit();
      const m2 = root.querySelector("#ptMsg"); if (m2) { m2.style.color = "#111"; m2.textContent = "✓ 청원을 올렸습니다. 재정부가 확인하면 지출결의서에 들어갑니다."; }
    } catch (e) {
      msg.style.color = "#C62828"; msg.textContent = "올리지 못했습니다: " + e.message;
    } finally { S.busy = false; }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
})();
