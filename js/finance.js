/* finance.js — 재정관리(오직 스타일): 전표입력·장부관리·결산보고서·예산
 * 콘솔: [finance.js] v20260630i
 */
console.log('[finance.js] v20260630i');

(function () {
  var root = document.getElementById('finRoot');
  if (!root) return;

  var M = { members: [], accounts: [], services: [], budget: [], vouchers: [], loaded: false };
  var won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR'); };
  var parseNum = function (s) { return Number(String(s == null ? '' : s).replace(/[^\d-]/g, '')) || 0; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var today = function () { var d = new Date(), p = function (x) { return ('' + x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };

  var tries = 0;
  function boot() {
    if (!window.FINANCE_API_URL) { root.innerHTML = msgCard('준비 중', '재정 API가 설정되지 않았습니다.'); return; }
    if (!(window.WPF && WPF.token())) {
      if (tries++ < 20) { setTimeout(boot, 400); return; }
      root.innerHTML = msgCard('로그인이 필요합니다', '상단에서 로그인 후 이용해 주세요.'); return;
    }
    root.innerHTML = '<p class="qt-loading">권한 확인 중입니다…</p>';
    WPF.call('me').then(function (me) {
      if (!me.canFinance) { root.innerHTML = msgCard('접근 권한이 없습니다', '재정관리는 관리자 승인을 받은 회원만 이용할 수 있습니다.'); return; }
      WPF.call('masters').then(function (m) {
        M.members = m.members || []; M.accounts = m.accounts || []; M.services = m.services || [];
        render();
      }).catch(function (e) { root.innerHTML = msgCard('불러오기 실패', e.message); });
    }).catch(function (e) { root.innerHTML = msgCard('확인 실패', e.message); });
  }
  function msgCard(t, x) { return '<div class="fin-card" style="text-align:center;padding:40px 18px;"><h3 style="margin:0 0 8px;color:var(--accent,#032257);">' + esc(t) + '</h3><p style="color:var(--ink-soft,#7b8794);">' + esc(x) + '</p></div>'; }

  function ensureVouchers() {
    if (M.loaded) return Promise.resolve();
    return WPF.call('listVouchers', {}).then(function (r) { M.vouchers = r.vouchers || []; M.loaded = true; });
  }
  function ensureBudget() {
    if (M._b) return Promise.resolve();
    return WPF.call('budget').then(function (r) { M.budget = r.budget || []; M._b = true; }).catch(function () { M.budget = []; M._b = true; });
  }

  var TABS = [
    ['offering', '헌금입력'], ['expense', '지출입력'], ['ledger', '거래장부'],
    ['givers', '헌금자통계'], ['gl', '총계정원장'], ['report', '결산보고서'],
    ['receipt', '기부금영수증'], ['budget', '예산']
  ];
  var tab = 'offering';
  function render() {
    root.innerHTML = '<div class="fin-tabs">' + TABS.map(function (t) { return '<button data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div id="finPanel"></div>';
    Array.prototype.forEach.call(root.querySelectorAll('.fin-tabs button'), function (b) {
      if (b.dataset.t === tab) b.classList.add('active');
      b.onclick = function () { tab = b.dataset.t; render(); };
    });
    var p = document.getElementById('finPanel');
    if (tab === 'offering') renderOffering(p);
    else if (tab === 'expense') renderExpense(p);
    else if (tab === 'ledger') renderLedger(p);
    else if (tab === 'givers') renderGivers(p);
    else if (tab === 'gl') renderGL(p);
    else if (tab === 'report') renderReport(p);
    else if (tab === 'receipt') renderReceipt(p);
    else if (tab === 'budget') renderBudget(p);
  }

  function accOptions(type, group) {
    return M.accounts.filter(function (a) { return String(a['구분']) === type && (!group || String(a['분류']) === group); })
      .map(function (a) { return '<option value="' + esc(a['계정명']) + '">' + esc(a['계정명']) + '</option>'; }).join('');
  }
  function svcOptions() { return M.services.map(function (s) { return '<option value="' + esc(s['예배명']) + '">' + esc(s['예배명']) + '</option>'; }).join(''); }
  function loading(el) { el.innerHTML = '<p class="qt-loading">불러오는 중…</p>'; }

  /* ── 헌금입력 ── */
  function renderOffering(panel) {
    panel.innerHTML =
      '<div class="fin-card"><div class="fin-grid">' +
      '<div class="form-field"><label>일자</label><input type="date" id="o_date" value="' + today() + '"></div>' +
      '<div class="form-field"><label>예배</label><select id="o_svc">' + svcOptions() + '</select></div>' +
      '<div class="form-field"><label>헌금 항목</label><select id="o_acc">' + accOptions('수입', '헌금') + '</select></div>' +
      '<div class="form-field"><label>수단</label><select id="o_method"><option>현금</option><option>통장</option></select></div>' +
      '</div><div class="fin-grid">' +
      '<div class="form-field" style="position:relative"><label>헌금자(교적 검색)</label><input type="text" id="o_payer" autocomplete="off" placeholder="이름 입력 → 선택"><input type="hidden" id="o_key"></div>' +
      '<div class="form-field"><label>금액</label><input type="text" id="o_amt" inputmode="numeric" placeholder="0" style="text-align:right;font-weight:700"></div>' +
      '<div class="form-field"><label>적요(선택)</label><input type="text" id="o_memo"></div>' +
      '</div><div style="margin-top:6px;display:flex;gap:10px;align-items:center;"><button class="btn btn-solid" id="o_add">＋ 헌금 추가</button><span class="fin-msg" id="o_msg"></span></div></div><div id="o_today"></div>';
    setupMemberSearch(panel.querySelector('#o_payer'), panel.querySelector('#o_key'));
    var amt = panel.querySelector('#o_amt');
    amt.addEventListener('input', function () { var n = parseNum(amt.value); amt.value = n ? won(n) : ''; });
    panel.querySelector('#o_add').onclick = function () {
      var v = { date: panel.querySelector('#o_date').value, type: '수입', kind: '헌금', account: panel.querySelector('#o_acc').value, service: panel.querySelector('#o_svc').value, payer: panel.querySelector('#o_payer').value.trim(), memberKey: panel.querySelector('#o_key').value, amount: parseNum(amt.value), method: panel.querySelector('#o_method').value, memo: panel.querySelector('#o_memo').value.trim() };
      var msg = panel.querySelector('#o_msg');
      if (!v.date || !v.amount) { msg.style.color = '#c0392b'; msg.textContent = '일자와 금액을 입력하세요.'; return; }
      msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
      WPF.call('addVoucher', { voucher: v }).then(function () { msg.style.color = 'green'; msg.textContent = '✓ 추가됨'; panel.querySelector('#o_payer').value = ''; panel.querySelector('#o_key').value = ''; amt.value = ''; panel.querySelector('#o_memo').value = ''; M.loaded = false; loadToday(v.date); }).catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = e.message; });
    };
    var box = panel.querySelector('#o_today');
    function loadToday(d) {
      loading(box);
      WPF.call('listVouchers', { from: d, to: d }).then(function (r) {
        var list = (r.vouchers || []).filter(function (x) { return String(x['종류']) === '헌금'; });
        var tot = list.reduce(function (s, x) { return s + (Number(x['금액']) || 0); }, 0);
        if (!list.length) { box.innerHTML = '<div class="fin-card"><b>' + esc(d) + '</b> 헌금 내역이 없습니다.</div>'; return; }
        box.innerHTML = '<div class="fin-card"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>' + esc(d) + ' 헌금</b><b style="color:#1e874b">' + won(tot) + '원</b></div><div style="overflow:auto"><table class="fin-table"><thead><tr><th>예배</th><th>항목</th><th>헌금자</th><th class="num">금액</th><th></th></tr></thead><tbody>' +
          list.map(function (x) { return '<tr><td>' + esc(x['예배'] || '') + '</td><td>' + esc(x['계정']) + '</td><td>' + esc(x['헌금자'] || '') + '</td><td class="num">' + won(x['금액']) + '</td><td><button class="btn btn-line" style="padding:3px 9px;font-size:.78rem" data-del="' + esc(x['전표ID']) + '">삭제</button></td></tr>'; }).join('') + '</tbody></table></div></div>';
        Array.prototype.forEach.call(box.querySelectorAll('[data-del]'), function (b) { b.onclick = function () { if (!confirm('삭제할까요?')) return; WPF.call('deleteVoucher', { id: b.dataset.del }).then(function () { M.loaded = false; loadToday(d); }); }; });
      }).catch(function (e) { box.innerHTML = msgCard('조회 실패', e.message); });
    }
    panel.querySelector('#o_date').addEventListener('change', function () { loadToday(this.value); });
    loadToday(panel.querySelector('#o_date').value);
  }
  function setupMemberSearch(input, hidden) {
    var pop = null, hi = -1, matches = [];
    function close() { if (pop) { pop.remove(); pop = null; hi = -1; } }
    input.addEventListener('input', function () {
      hidden.value = ''; var q = input.value.trim().toLowerCase(); close(); if (!q) return;
      matches = M.members.filter(function (m) { return (m.name || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 8); if (!matches.length) return;
      pop = document.createElement('div'); pop.className = 'fin-sugg';
      matches.forEach(function (m) { var d = document.createElement('div'); d.innerHTML = esc(m.name) + ' <span style="color:#9aa5b1;font-size:.78rem">' + esc(m.birth || '') + ' · ' + esc(m.group || '') + '</span>'; d.onclick = function () { pick(m); }; pop.appendChild(d); });
      input.parentElement.appendChild(pop);
    });
    input.addEventListener('keydown', function (e) { if (!pop) return; var rows = pop.querySelectorAll('div'); if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hi + 1, rows.length - 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(hi - 1, 0); } else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(matches[hi]); return; } else return; Array.prototype.forEach.call(rows, function (r, i) { r.classList.toggle('hi', i === hi); }); });
    input.addEventListener('blur', function () { setTimeout(close, 180); });
    function pick(m) { input.value = m.name; hidden.value = m.key || ''; close(); }
  }

  /* ── 지출입력 ── */
  function renderExpense(panel) {
    panel.innerHTML =
      '<div class="fin-card"><div class="fin-grid">' +
      '<div class="form-field"><label>일자</label><input type="date" id="e_date" value="' + today() + '"></div>' +
      '<div class="form-field"><label>지출 계정</label><select id="e_acc">' + accOptions('지출') + '</select></div>' +
      '<div class="form-field"><label>수단</label><select id="e_method"><option>통장</option><option>현금</option></select></div>' +
      '</div><div class="fin-grid">' +
      '<div class="form-field"><label>적요</label><input type="text" id="e_memo" placeholder="예: 6월 전기요금"></div>' +
      '<div class="form-field"><label>거래처/수령인(선택)</label><input type="text" id="e_payer"></div>' +
      '<div class="form-field"><label>금액</label><input type="text" id="e_amt" inputmode="numeric" placeholder="0" style="text-align:right;font-weight:700"></div>' +
      '</div><div style="margin-top:6px;display:flex;gap:10px;align-items:center;"><button class="btn btn-solid" id="e_add">＋ 지출 추가</button><span class="fin-msg" id="e_msg"></span></div></div>';
    var amt = panel.querySelector('#e_amt');
    amt.addEventListener('input', function () { var n = parseNum(amt.value); amt.value = n ? won(n) : ''; });
    panel.querySelector('#e_add').onclick = function () {
      var v = { date: panel.querySelector('#e_date').value, type: '지출', kind: '일반', account: panel.querySelector('#e_acc').value, service: '', payer: panel.querySelector('#e_payer').value.trim(), memberKey: '', amount: parseNum(amt.value), method: panel.querySelector('#e_method').value, memo: panel.querySelector('#e_memo').value.trim() };
      var msg = panel.querySelector('#e_msg');
      if (!v.date || !v.memo || !v.amount) { msg.style.color = '#c0392b'; msg.textContent = '일자·적요·금액을 입력하세요.'; return; }
      msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
      WPF.call('addVoucher', { voucher: v }).then(function () { msg.style.color = 'green'; msg.textContent = '✓ 추가됨'; panel.querySelector('#e_memo').value = ''; panel.querySelector('#e_payer').value = ''; amt.value = ''; M.loaded = false; }).catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = e.message; });
    };
  }

  /* ── 거래장부 ── */
  function renderLedger(panel) {
    panel.innerHTML = '<div class="fin-card"><div class="fin-grid"><div class="form-field"><label>시작일</label><input type="date" id="l_from"></div><div class="form-field"><label>종료일</label><input type="date" id="l_to"></div><div class="form-field"><label>검색(계정/이름/적요)</label><input type="text" id="l_q"></div><div class="form-field" style="align-self:end"><button class="btn btn-solid" id="l_go">조회</button></div></div></div><div id="l_out"></div>';
    var out = panel.querySelector('#l_out');
    function draw() {
      loading(out);
      ensureVouchers().then(function () {
        var f = panel.querySelector('#l_from').value, t = panel.querySelector('#l_to').value, q = panel.querySelector('#l_q').value.trim().toLowerCase();
        var list = M.vouchers.filter(function (x) { return (!f || x['일자'] >= f) && (!t || x['일자'] <= t) && (!q || (String(x['계정']) + x['헌금자'] + x['적요']).toLowerCase().indexOf(q) >= 0); }).slice().sort(function (a, b) { return String(b['일자']).localeCompare(String(a['일자'])); });
        var inc = 0, exp = 0; list.forEach(function (x) { if (String(x['구분']) === '수입') inc += Number(x['금액']) || 0; else exp += Number(x['금액']) || 0; });
        out.innerHTML = '<div class="fin-card" style="display:flex;gap:24px;flex-wrap:wrap"><div>수입 <b style="color:#1e874b">' + won(inc) + '</b></div><div>지출 <b style="color:#c0392b">' + won(exp) + '</b></div><div>차액 <b>' + won(inc - exp) + '</b></div><div style="margin-left:auto">' + list.length + '건</div></div>' +
          '<div class="fin-card" style="overflow:auto;max-height:560px"><table class="fin-table"><thead><tr><th>일자</th><th>구분</th><th>계정</th><th>상대/적요</th><th class="num">수입</th><th class="num">지출</th></tr></thead><tbody>' +
          list.slice(0, 1500).map(function (x) { var isIn = String(x['구분']) === '수입'; return '<tr><td>' + esc(x['일자']) + '</td><td><span class="fin-pill ' + (isIn ? 'in' : 'out') + '">' + esc(x['구분']) + '</span></td><td>' + esc(x['계정']) + '</td><td>' + esc(x['헌금자'] || x['적요'] || '') + '</td><td class="num">' + (isIn ? won(x['금액']) : '') + '</td><td class="num">' + (!isIn ? won(x['금액']) : '') + '</td></tr>'; }).join('') + '</tbody></table>' + (list.length > 1500 ? '<p class="help" style="padding:8px">최근 1,500건만 표시(합계는 전체 기준).</p>' : '') + '</div>';
      }).catch(function (e) { out.innerHTML = msgCard('조회 실패', e.message); });
    }
    panel.querySelector('#l_go').onclick = draw; draw();
  }

  /* ── 헌금자통계 ── */
  function renderGivers(panel) {
    loading(panel);
    ensureVouchers().then(function () {
      var map = {};
      M.vouchers.filter(function (x) { return String(x['종류']) === '헌금'; }).forEach(function (v) {
        var key = v['매칭키'] || ('이름:' + (v['헌금자'] || '무명')); if (!map[key]) map[key] = { name: v['헌금자'] || '무명', key: v['매칭키'], count: 0, total: 0 };
        map[key].count++; map[key].total += Number(v['금액']) || 0;
      });
      var rows = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.total - a.total; });
      var tot = rows.reduce(function (s, r) { return s + r.total; }, 0);
      panel.innerHTML = '<div class="fin-card"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>헌금자 순위 (' + rows.length + '명/팀)</b><b style="color:#1e874b">' + won(tot) + '원</b></div><div style="overflow:auto;max-height:600px"><table class="fin-table"><thead><tr><th>순위</th><th>헌금자</th><th>구분</th><th class="num">건수</th><th class="num">총 헌금액</th></tr></thead><tbody>' +
        rows.map(function (r, i) { return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.name) + '</b></td><td>' + (r.key ? '<span class="fin-pill in">교인</span>' : '<span style="color:#9aa5b1">미등록</span>') + '</td><td class="num">' + r.count + '</td><td class="num"><b>' + won(r.total) + '</b></td></tr>'; }).join('') + '</tbody></table></div></div>';
    }).catch(function (e) { panel.innerHTML = msgCard('조회 실패', e.message); });
  }

  /* ── 총계정원장 (계정별 집계) ── */
  function renderGL(panel) {
    loading(panel);
    ensureVouchers().then(function () {
      panel.innerHTML = '';
      ['수입', '지출'].forEach(function (type) {
        var byAcc = {}; var tot = 0;
        M.vouchers.filter(function (x) { return String(x['구분']) === type; }).forEach(function (v) { var a = v['계정'] || '?'; if (!byAcc[a]) byAcc[a] = { count: 0, sum: 0 }; byAcc[a].count++; byAcc[a].sum += Number(v['금액']) || 0; tot += Number(v['금액']) || 0; });
        var rows = Object.keys(byAcc).map(function (k) { return { acc: k, count: byAcc[k].count, sum: byAcc[k].sum }; }).sort(function (a, b) { return b.sum - a.sum; });
        var card = document.createElement('div'); card.className = 'fin-card'; card.style.marginBottom = '16px';
        card.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>' + type + ' 계정별 집계</b><b style="color:' + (type === '수입' ? '#1e874b' : '#c0392b') + '">' + won(tot) + '원</b></div><div style="overflow:auto"><table class="fin-table"><thead><tr><th>계정</th><th class="num">건수</th><th class="num">금액</th><th class="num">비율</th></tr></thead><tbody>' +
          rows.map(function (r) { return '<tr><td><b>' + esc(r.acc) + '</b></td><td class="num">' + r.count + '</td><td class="num"><b>' + won(r.sum) + '</b></td><td class="num">' + (tot ? (r.sum / tot * 100).toFixed(1) + '%' : '-') + '</td></tr>'; }).join('') + '</tbody></table></div>';
        panel.appendChild(card);
      });
    }).catch(function (e) { panel.innerHTML = msgCard('조회 실패', e.message); });
  }

  /* ── 결산보고서 (월별현황 + 예산대비) ── */
  function renderReport(panel) {
    loading(panel);
    Promise.all([ensureVouchers(), ensureBudget()]).then(function () {
      var months = {}; var order = [];
      M.vouchers.forEach(function (v) { var m = String(v['일자']).slice(0, 7); if (!months[m]) { months[m] = { inc: 0, exp: 0 }; order.push(m); } if (String(v['구분']) === '수입') months[m].inc += Number(v['금액']) || 0; else months[m].exp += Number(v['금액']) || 0; });
      order.sort();
      var ti = 0, te = 0;
      var monthTbl = order.map(function (m) { ti += months[m].inc; te += months[m].exp; return '<tr><td>' + esc(m) + '</td><td class="num">' + won(months[m].inc) + '</td><td class="num">' + won(months[m].exp) + '</td><td class="num"><b>' + won(months[m].inc - months[m].exp) + '</b></td></tr>'; }).join('');
      var budIn = 0, budExp = 0;
      M.budget.forEach(function (b) { var code = String(b['계정코드'] || ''); var amt = Number(b['예산']) || 0; if (code.slice(-4) === '0000') return; if (/^1/.test(code)) budIn += amt; else if (/^2/.test(code)) budExp += amt; });
      panel.innerHTML =
        '<div class="fin-card"><b>월별 수입·지출 현황</b><div style="overflow:auto;margin-top:8px"><table class="fin-table"><thead><tr><th>월</th><th class="num">수입</th><th class="num">지출</th><th class="num">차액</th></tr></thead><tbody>' + monthTbl +
        '</tbody><tfoot><tr style="font-weight:700;background:#f5f8fc"><td>합계</td><td class="num">' + won(ti) + '</td><td class="num">' + won(te) + '</td><td class="num">' + won(ti - te) + '</td></tr></tfoot></table></div></div>' +
        (M.budget.length ? '<div class="fin-card"><b>예산 대비 실적</b><div style="overflow:auto;margin-top:8px"><table class="fin-table"><thead><tr><th>구분</th><th class="num">연간 예산</th><th class="num">실적 누계</th><th class="num">집행률</th></tr></thead><tbody>' +
          '<tr><td>수입</td><td class="num">' + won(budIn) + '</td><td class="num">' + won(ti) + '</td><td class="num">' + (budIn ? (ti / budIn * 100).toFixed(1) + '%' : '-') + '</td></tr>' +
          '<tr><td>지출</td><td class="num">' + won(budExp) + '</td><td class="num">' + won(te) + '</td><td class="num">' + (budExp ? (te / budExp * 100).toFixed(1) + '%' : '-') + '</td></tr>' +
          '</tbody></table></div><p class="help">예산=연간 기준, 실적=입력된 ' + order.length + '개월 누계.</p></div>' : '');
    }).catch(function (e) { panel.innerHTML = msgCard('조회 실패', e.message); });
  }

  /* ── 기부금영수증 (교인 헌금 누계) ── */
  function renderReceipt(panel) {
    loading(panel);
    ensureVouchers().then(function () {
      var map = {};
      M.vouchers.filter(function (x) { return String(x['종류']) === '헌금' && x['매칭키']; }).forEach(function (v) { var k = v['매칭키']; if (!map[k]) map[k] = { name: v['헌금자'], key: k, total: 0, count: 0 }; map[k].total += Number(v['금액']) || 0; map[k].count++; });
      var rows = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.total - a.total; });
      var tot = rows.reduce(function (s, r) { return s + r.total; }, 0);
      panel.innerHTML = '<div class="fin-card"><div style="background:#fff8e8;border:1px solid #f0d98c;color:#8a6512;padding:10px 14px;border-radius:9px;font-size:.85rem;margin-bottom:12px">연말정산 기부금영수증용 — 교적 매칭된 교인의 헌금 누계입니다. (미등록 헌금자 제외)</div><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>교인별 헌금 누계 (' + rows.length + '명)</b><b style="color:#1e874b">' + won(tot) + '원</b></div><div style="overflow:auto;max-height:600px"><table class="fin-table"><thead><tr><th>이름</th><th>생년월일</th><th class="num">건수</th><th class="num">헌금 누계</th></tr></thead><tbody>' +
        rows.map(function (r) { var bd = (r.key || '').split('|')[1] || ''; var b = bd ? bd.slice(0, 4) + '-' + bd.slice(4, 6) + '-' + bd.slice(6, 8) : ''; return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(b) + '</td><td class="num">' + r.count + '</td><td class="num"><b>' + won(r.total) + '</b></td></tr>'; }).join('') + '</tbody></table></div></div>';
    }).catch(function (e) { panel.innerHTML = msgCard('조회 실패', e.message); });
  }

  /* ── 예산 ── */
  function renderBudget(panel) {
    loading(panel);
    ensureBudget().then(function () {
      if (!M.budget.length) { panel.innerHTML = msgCard('예산 없음', '예산 데이터를 불러오지 못했습니다. Apps Script에 budget 액션이 배포됐는지 확인하세요.'); return; }
      panel.innerHTML = '';
      ['수입', '지출'].forEach(function (g) {
        var rows = M.budget.filter(function (b) { return String(b['구분']) === g; });
        if (!rows.length) return;
        var sum = rows.filter(function (b) { return String(b['계정코드'] || '').slice(-4) !== '0000'; }).reduce(function (s, b) { return s + (Number(b['예산']) || 0); }, 0);
        var card = document.createElement('div'); card.className = 'fin-card'; card.style.marginBottom = '16px';
        card.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>' + g + ' 예산</b><b>' + won(sum) + '원</b></div><div style="overflow:auto"><table class="fin-table"><thead><tr><th>코드</th><th>계정</th><th class="num">전년예산</th><th class="num">전년결산</th><th class="num">금년예산</th></tr></thead><tbody>' +
          rows.map(function (b) { var top = String(b['계정코드'] || '').slice(-4) === '0000'; return '<tr style="' + (top ? 'font-weight:700;background:#f5f8fc' : '') + '"><td>' + esc(b['계정코드']) + '</td><td>' + esc(b['계정이름']) + '</td><td class="num">' + won(b['전년예산']) + '</td><td class="num">' + won(b['전년결산']) + '</td><td class="num"><b>' + won(b['예산']) + '</b></td></tr>'; }).join('') + '</tbody></table></div>';
        panel.appendChild(card);
      });
      var note = document.createElement('p'); note.className = 'help'; note.style.marginTop = '8px'; note.textContent = '※ 예산 편집은 운평재정_예산 시트에서 직접 수정합니다(앱 내 편집은 추후 추가).'; panel.appendChild(note);
    }).catch(function (e) { panel.innerHTML = msgCard('조회 실패', e.message); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
