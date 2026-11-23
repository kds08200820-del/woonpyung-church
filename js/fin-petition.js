/* ============================================================
   운평장로교회 — 재정 청원 (petition.html) (2026-11-24 담임목사 지시)
   DB: supabase/20261124_0800_fin_petitions.sql
   · 청원할 수 있는 사람
       - 부서 부장: 재정관리 ▸ 예산·계정 ▸ 부서·부장 청원 에서 교적으로 지정. 그 부서 계정만.
       - 재정 청원 권한자: 교적관리 ▸ 권한 관리 「재정 청원」. 모든 지출 예산 계정(부서 칸 없음).
   · 계정을 고르면 연 예산 · 집행 · 청원 중 · 집행률 · 남은 예산(% · 원)을 보여 주고,
     이 청원을 더하면 집행률이 몇 %가 되는지도 미리 보여 준다.
   · 영수증 사진(또는 PDF)을 붙인다 — ChurchUpload(R2) 로 올리고 주소를 청원에 담는다.
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
      const [b, mine] = await Promise.all([
        rpc("fin_dept_budget", { p_dept: u.dept }),
        api("GET", "fin_petitions?select=*&order=id.desc&limit=60"),
      ]);
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
    const opts = `<option value="">— 계정을 고르세요 —</option>` + S.budgetList.map((r) => `<option value="${esc(r.hang)}">${esc(r.gwan ? r.gwan + " · " : "")}${esc(r.hang)}</option>`).join("");
    const mine = S.mine.filter((p) => (u.dept ? p.dept === u.dept : true));
    const stName = { submitted: "확인 대기", approved: "확인됨", rejected: "돌려보냄", cancelled: "거둠" };
    root.innerHTML = tabs +
      (has ? `<div class="pt-card"><h3>청원서 쓰기 <small style="font-weight:400;color:#898885">${esc(u.dept ? u.dept : "")}${fy.fy ? (u.dept ? " · " : "") + fy.fy + "년도" : ""}</small></h3><div class="pt-f">
        <div><label>예산 계정</label><select id="ptHang">${opts}</select></div>
        <div><label>금액(원)</label><input id="ptAmt" inputmode="numeric" placeholder="예: 150,000"></div>
        <div class="full"><label>지출 내역</label><input id="ptItem" maxlength="200" placeholder="예: 성탄절 행사 간식"></div>
        <div class="full"><label>메모 <small style="font-weight:400">(받는 분 · 계좌 · 까닭 등)</small></label><textarea id="ptMemo" rows="2"></textarea></div>
        <div class="full"><label>영수증 <small style="font-weight:400">(사진 또는 PDF, 10장까지)</small></label><input id="ptFile" type="file" accept="image/*,application/pdf" multiple><div class="pt-rcps" id="ptRcps"></div></div>
        <div class="pt-after" id="ptAfter"></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn btn-solid" id="ptSend">청원 올리기</button><span class="pt-help">올린 청원은 <b>${esc(sunTxt)}</b> 지출결의서로 갑니다. 재정부가 확인하면 결의서에 들어갑니다.</span></div>
      <div class="pt-msg" id="ptMsg"></div></div>` : `<div class="pt-card"><p class="pt-help">청원할 수 있는 계정이 아직 정해지지 않았습니다. 재정부에 말씀해 주세요.</p></div>`) +
      `<div class="pt-card"><h3>내 청원</h3>` +
      (mine.length ? `<div style="overflow:auto"><table class="pt-t"><thead><tr><th>결의서</th><th>계정</th><th>내역</th><th class="n">금액</th><th>상태</th><th></th></tr></thead><tbody>` +
        mine.map((p) => `<tr><td>${esc(weekName(p.week_sunday))}</td><td>${esc(p.hang)}</td><td>${esc(p.item)}${(p.receipts || []).map((r, i) => ` <a href="${esc(r)}" target="_blank" rel="noopener" style="font-size:.78rem">영수증${(p.receipts || []).length > 1 ? i + 1 : ""}</a>`).join("")}${p.review_note ? `<div class="pt-help">${esc(p.review_note)}</div>` : ""}</td><td class="n">${won(p.amount)}</td><td><span class="pt-st ${esc(p.status)}">${esc(stName[p.status] || p.status)}</span></td><td>${p.status === "submitted" ? `<button class="btn btn-line" data-cancel="${p.id}" style="padding:3px 9px;font-size:.78rem">거두기</button>` : ""}</td></tr>`).join("") +
        `</tbody></table></div>` : `<p class="pt-help">아직 낸 청원이 없습니다.</p>`) + `</div>`;
    wire();
  }

  function after() {
    const box = root.querySelector("#ptAfter"); if (!box) return;
    const hang = root.querySelector("#ptHang").value, amt = num(root.querySelector("#ptAmt").value);
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
    hang.onchange = after;
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
    root.querySelector("#ptSend").onclick = send;
    drawFiles(); after();
  }

  async function send() {
    if (S.busy) return;
    const u = S.units[S.cur], msg = root.querySelector("#ptMsg");
    const hang = root.querySelector("#ptHang").value, amount = num(root.querySelector("#ptAmt").value);
    const item = root.querySelector("#ptItem").value.trim(), memo = root.querySelector("#ptMemo").value.trim();
    if (!hang) { msg.style.color = "#C62828"; msg.textContent = "예산 계정을 골라 주세요."; return; }
    if (!item) { msg.style.color = "#C62828"; msg.textContent = "지출 내역을 적어 주세요."; return; }
    if (!amount) { msg.style.color = "#C62828"; msg.textContent = "금액을 적어 주세요."; return; }
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
      await rpc("fin_petition_submit", { p_dept: u.dept, p_hang: hang, p_item: item, p_amount: amount, p_memo: memo, p_receipts: urls });
      S.files = [];
      await loadUnit();
      const m2 = root.querySelector("#ptMsg"); if (m2) { m2.style.color = "#111"; m2.textContent = "✓ 청원을 올렸습니다. 재정부가 확인하면 지출결의서에 들어갑니다."; }
    } catch (e) {
      msg.style.color = "#C62828"; msg.textContent = "올리지 못했습니다: " + e.message;
    } finally { S.busy = false; }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
})();
