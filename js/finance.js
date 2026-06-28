/* finance.js — 재정관리(오직 스타일): 전표입력·장부관리·결산보고서·예산
 * 콘솔: [finance.js] v20260701a
 */
console.log('[finance.js] v20260701a');

(function () {
  var root = document.getElementById('finRoot');
  if (!root) return;

  var M = { members: [], accounts: [], services: [], budget: [], vouchers: [], loaded: false };
  var won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR'); };
  var parseNum = function (s) { return Number(String(s == null ? '' : s).replace(/[^\d-]/g, '')) || 0; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pad2 = function (n) { return ('0' + n).slice(-2); };
  var fmtD = function (d) { return String(d == null ? '' : d).slice(0, 10); }; // 'YYYY-MM-DDT..Z' → 'YYYY-MM-DD'
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };

  // ── 회계연도 ──
  function fyStartMonth() { var v = Number(localStorage.getItem('wpf_fy_start')); return (v >= 1 && v <= 12) ? v : 1; }
  function lastDay(y, m) { return new Date(y, m, 0).getDate(); }
  function fyRange(year) {
    var sm = fyStartMonth();
    var from = year + '-' + pad2(sm) + '-01';
    var endY = (sm === 1) ? year : year + 1, endM = (sm === 1) ? 12 : sm - 1;
    return { from: from, to: endY + '-' + pad2(endM) + '-' + pad2(lastDay(endY, endM)) };
  }
  function curFY() { var d = new Date(), y = d.getFullYear(), m = d.getMonth() + 1; return (m >= fyStartMonth()) ? y : y - 1; }
  function inFY(x) { var r = fyRange(M.fy), d = String(x['일자']).slice(0, 10); return d >= r.from && d <= r.to; }
  function vouchersFY() { return M.vouchers.filter(inFY); }
  M.fy = curFY();

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

  // ── 보고서 인쇄/PDF ──
  function printDoc(title, inner, sub) {
    var r = fyRange(M.fy);
    var subLine = sub || (M.fy + '년도 회계연도 (' + r.from + ' ~ ' + r.to + ')');
    var w = window.open('', '_blank', 'width=920,height=760');
    if (!w) { alert('팝업이 차단되었습니다. 브라우저에서 팝업을 허용한 뒤 다시 시도해 주세요.'); return; }
    var css = 'body{font-family:"Malgun Gothic","맑은 고딕","Noto Sans KR",sans-serif;color:#1a1a1a;padding:30px;}' +
      'h1{font-size:21px;text-align:center;margin:0 0 4px;}' +
      '.sub{text-align:center;color:#555;font-size:12px;margin-bottom:20px;}' +
      'table{width:100%;border-collapse:collapse;font-size:12px;margin:0 0 18px;}' +
      'th,td{border:1px solid #b9c2cf;padding:6px 8px;}th{background:#eef2f7;text-align:left;}' +
      '.num{text-align:right!important;font-variant-numeric:tabular-nums;}' +
      'tfoot td,tr[style*="bold"]{font-weight:700;}' +
      '.fin-card{margin-bottom:16px;}.fin-pill{font-size:11px;padding:1px 6px;border-radius:8px;}' +
      '.help{font-size:11px;color:#888;}.sign{margin-top:44px;text-align:right;font-size:13px;line-height:2.4;}' +
      '.mng{display:none!important;}' +
      '@page{size:A4;margin:20mm 15mm;}' +
      '@media print{body{padding:0;}.noprint{display:none;}}';
    var html = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>운평장로교회 ' + esc(title) + '</title><style>' + css + '</style></head><body>' +
      '<h1>운평장로교회 ' + esc(title) + '</h1>' +
      '<div class="sub">' + esc(subLine) + ' · 출력일 ' + today() + '</div>' +
      inner +
      '<div class="sign">담임목사 ＿＿＿＿＿ (인)　　　재정부장 ＿＿＿＿＿ (인)　　　회계 ＿＿＿＿＿ (인)</div>' +
      '<div class="noprint" style="text-align:center;margin-top:24px;"><button onclick="window.print()" style="padding:9px 22px;font-size:14px;cursor:pointer;">🖨 인쇄 / PDF 저장</button></div>' +
      '</body></html>';
    w.document.write(html); w.document.close(); w.focus();
    setTimeout(function () { try { w.print(); } catch (e) { } }, 500);
  }
  // 선택 일괄 삭제
  function bulkDelete(ids, after) {
    if (!ids.length) { alert('선택된 항목이 없습니다. 삭제할 항목을 체크해 주세요.'); return; }
    if (!confirm('선택한 ' + ids.length + '건을 삭제할까요?')) return;
    Promise.all(ids.map(function (id) { return WPF.call('deleteVoucher', { id: id }); }))
      .then(function () { M.loaded = false; after(); })
      .catch(function (e) { alert('삭제 중 오류: ' + e.message); M.loaded = false; after(); });
  }
  // 체크박스 목록 공통 배선(전체선택 + 선택삭제)
  function wireChecks(box, reload) {
    var allck = box.querySelector('[data-all]');
    if (allck) allck.onclick = function () { Array.prototype.forEach.call(box.querySelectorAll('.rowck'), function (c) { c.checked = allck.checked; }); };
    var bulk = box.querySelector('[data-bulk]');
    if (bulk) bulk.onclick = function () { bulkDelete(Array.prototype.map.call(box.querySelectorAll('.rowck:checked'), function (c) { return c.value; }), reload); };
  }

  // 보고서 패널에 인쇄 버튼을 얹고 본문을 감싼다
  function withPrint(el, title, contentHTML, sub) {
    el.innerHTML = '<div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button class="btn btn-line" data-print>🖨 인쇄 / PDF</button></div><div class="rep-body">' + contentHTML + '</div>';
    el.querySelector('[data-print]').onclick = function () { printDoc(title, el.querySelector('.rep-body').innerHTML, sub); };
  }
  // 주(週) 범위: 일요일~토요일
  function ymdOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function weekRange(dateStr) {
    var d = new Date((dateStr || today()) + 'T00:00:00'); var day = d.getDay();
    var s = new Date(d); s.setDate(d.getDate() - day);
    var e = new Date(s); e.setDate(s.getDate() + 6);
    return { from: ymdOf(s), to: ymdOf(e) };
  }

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
    ['finrep', '재정보고서'], ['bulletin', '헌금명단'], ['receipt', '기부금영수증'],
    ['budget', '예산'], ['settings', '설정']
  ];
  var tab = 'offering';
  function fyBar() {
    var d = new Date(), y = d.getFullYear(), opts = '';
    for (var yr = y + 1; yr >= y - 4; yr--) opts += '<option value="' + yr + '"' + (yr === M.fy ? ' selected' : '') + '>' + yr + '년도</option>';
    var r = fyRange(M.fy);
    return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;padding:10px 14px;background:#f5f8fc;border:1px solid #e3ebf5;border-radius:10px;">' +
      '<b style="color:var(--accent,#032257)">📅 회계연도</b>' +
      '<select id="fySel" style="padding:6px 10px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;background:#fff;">' + opts + '</select>' +
      '<span style="color:#7b8794;font-size:.86rem;">' + r.from + ' ~ ' + r.to + '</span>' +
      '<span style="color:#9aa5b1;font-size:.8rem;margin-left:auto;">시작월·범위는 <b>설정</b> 탭에서</span></div>';
  }
  function render() {
    root.innerHTML = fyBar() + '<div class="fin-tabs">' + TABS.map(function (t) { return '<button data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div id="finPanel"></div>';
    var sel = document.getElementById('fySel');
    if (sel) sel.onchange = function () { M.fy = Number(sel.value); render(); };
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
    else if (tab === 'finrep') renderFinReport(p);
    else if (tab === 'bulletin') renderGiverList(p);
    else if (tab === 'receipt') renderReceipt(p);
    else if (tab === 'budget') renderBudget(p);
    else if (tab === 'settings') renderSettings(p);
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
      '<div class="form-field" style="position:relative"><label>헌금자(교적 검색)</label><input type="text" id="o_payer" autocomplete="off" placeholder="이름 입력 → 선택"><input type="hidden" id="o_key"><input type="hidden" id="o_spouseKey"><div id="o_spouseBox" style="margin-top:4px"></div></div>' +
      '<div class="form-field"><label>금액</label><input type="text" id="o_amt" inputmode="numeric" placeholder="0" style="text-align:right;font-weight:700"></div>' +
      '<div class="form-field"><label>적요(선택)</label><input type="text" id="o_memo"></div>' +
      '</div><div style="margin-top:6px;display:flex;gap:10px;align-items:center;"><button class="btn btn-solid" id="o_add">＋ 헌금 추가</button><span class="fin-msg" id="o_msg"></span></div></div><div id="o_today"></div>';
    var spouseBox = panel.querySelector('#o_spouseBox');
    setupMemberSearch(panel.querySelector('#o_payer'), panel.querySelector('#o_key'), function (m) {
      panel.querySelector('#o_spouseKey').value = (m && m.spouseKey) || '';
      if (m && m.spouse) spouseBox.innerHTML = '<label class="sw" style="font-size:.82rem;display:inline-flex;align-items:center;gap:5px;color:#1e874b"><input type="checkbox" id="o_couple" checked> 💑 배우자 <b>' + esc(m.spouse) + '</b> 합산(가정 헌금)</label>';
      else spouseBox.innerHTML = '';
    });
    var amt = panel.querySelector('#o_amt');
    amt.addEventListener('input', function () { var n = parseNum(amt.value); amt.value = n ? won(n) : ''; });
    panel.querySelector('#o_add').onclick = function () {
      var payerName = panel.querySelector('#o_payer').value.trim();
      var coupleCk = panel.querySelector('#o_couple');
      var spLabel = spouseBox.querySelector('b');
      if (coupleCk && coupleCk.checked && spLabel && payerName.indexOf('(') < 0) payerName = payerName + '(' + spLabel.textContent + ')';
      var v = { date: panel.querySelector('#o_date').value, type: '수입', kind: '헌금', account: panel.querySelector('#o_acc').value, service: panel.querySelector('#o_svc').value, payer: payerName, memberKey: panel.querySelector('#o_key').value, amount: parseNum(amt.value), method: panel.querySelector('#o_method').value, memo: panel.querySelector('#o_memo').value.trim() };
      var msg = panel.querySelector('#o_msg');
      if (!v.date || !v.amount) { msg.style.color = '#c0392b'; msg.textContent = '일자와 금액을 입력하세요.'; return; }
      msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
      WPF.call('addVoucher', { voucher: v }).then(function () { msg.style.color = 'green'; msg.textContent = '✓ 추가됨'; panel.querySelector('#o_payer').value = ''; panel.querySelector('#o_key').value = ''; panel.querySelector('#o_spouseKey').value = ''; spouseBox.innerHTML = ''; amt.value = ''; panel.querySelector('#o_memo').value = ''; M.loaded = false; loadToday(v.date); }).catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = e.message; });
    };
    var box = panel.querySelector('#o_today');
    function loadToday(d) {
      loading(box);
      ensureVouchers().then(function () {
        var list = M.vouchers.filter(function (x) { return fmtD(x['일자']) === d && String(x['종류']) === '헌금'; });
        var tot = list.reduce(function (s, x) { return s + (Number(x['금액']) || 0); }, 0);
        if (!list.length) { box.innerHTML = '<div class="fin-card"><b>' + esc(d) + '</b> 헌금 내역이 없습니다.</div>'; return; }
        var byId = {}; list.forEach(function (x) { byId[x['전표ID']] = x; });
        box.innerHTML = '<div class="fin-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>' + esc(d) + ' 헌금</b><div style="display:flex;gap:10px;align-items:center"><button class="btn btn-line" style="padding:4px 12px;font-size:.8rem" data-bulk>🗑 선택 삭제</button><b style="color:#1e874b">' + won(tot) + '원</b></div></div><div style="overflow:auto"><table class="fin-table"><thead><tr><th style="width:30px;text-align:center"><input type="checkbox" data-all></th><th>예배</th><th>항목</th><th>헌금자</th><th class="num">금액</th><th>관리</th></tr></thead><tbody>' +
          list.map(function (x) { return '<tr><td style="text-align:center"><input type="checkbox" class="rowck" value="' + esc(x['전표ID']) + '"></td><td>' + esc(x['예배'] || '') + '</td><td>' + esc(x['계정']) + '</td><td>' + esc(x['헌금자'] || '') + '</td><td class="num">' + won(x['금액']) + '</td><td style="white-space:nowrap"><button class="btn btn-line" style="padding:3px 9px;font-size:.78rem" data-edit="' + esc(x['전표ID']) + '">수정</button> <button class="btn btn-line" style="padding:3px 9px;font-size:.78rem" data-del="' + esc(x['전표ID']) + '">삭제</button></td></tr>'; }).join('') + '</tbody></table></div></div>';
        wireChecks(box, function () { loadToday(d); });
        Array.prototype.forEach.call(box.querySelectorAll('[data-edit]'), function (b) { b.onclick = function () { openEditor(byId[b.dataset.edit], function () { loadToday(d); }); }; });
        Array.prototype.forEach.call(box.querySelectorAll('[data-del]'), function (b) { b.onclick = function () { if (!confirm('삭제할까요?')) return; WPF.call('deleteVoucher', { id: b.dataset.del }).then(function () { M.loaded = false; loadToday(d); }); }; });
      }).catch(function (e) { box.innerHTML = msgCard('조회 실패', e.message); });
    }
    panel.querySelector('#o_date').addEventListener('change', function () { loadToday(this.value); });
    loadToday(panel.querySelector('#o_date').value);
  }
  function setupMemberSearch(input, hidden, onPick) {
    var pop = null, hi = -1, matches = [];
    function close() { if (pop) { pop.remove(); pop = null; hi = -1; } }
    input.addEventListener('input', function () {
      hidden.value = ''; var q = input.value.trim().toLowerCase(); close(); if (!q) return;
      matches = M.members.filter(function (m) { return (m.name || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 8); if (!matches.length) return;
      pop = document.createElement('div'); pop.className = 'fin-sugg';
      matches.forEach(function (m) { var bd = (String(m.key || '').split('|')[1]) || ''; var bs = bd.length === 8 ? bd.slice(0, 4) + '-' + bd.slice(4, 6) + '-' + bd.slice(6, 8) : String(m.birth || '').slice(0, 10); var d = document.createElement('div'); d.innerHTML = esc(m.name) + ' <span style="color:#9aa5b1;font-size:.78rem">' + esc(bs) + ' · ' + esc(m.group || '') + '</span>'; d.onclick = function () { pick(m); }; pop.appendChild(d); });
      input.parentElement.appendChild(pop);
    });
    input.addEventListener('keydown', function (e) { if (!pop) return; var rows = pop.querySelectorAll('div'); if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hi + 1, rows.length - 1); } else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(hi - 1, 0); } else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(matches[hi]); return; } else return; Array.prototype.forEach.call(rows, function (r, i) { r.classList.toggle('hi', i === hi); }); });
    input.addEventListener('blur', function () { setTimeout(close, 180); });
    function pick(m) { input.value = m.name; hidden.value = m.key || ''; close(); if (onPick) onPick(m); }
  }

  var ymdStr = function (v) { return String(v == null ? '' : v).slice(0, 10); };

  /* ── 전표 수정 모달(헌금/지출 공용) ── */
  function openEditor(x, onSaved) {
    if (!x) return;
    var isExp = String(x['구분']) === '지출';
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px';
    ov.innerHTML = '<div class="fin-card" style="max-width:460px;width:100%;background:#fff;max-height:90vh;overflow:auto">' +
      '<h3 style="margin:0 0 14px;color:var(--accent,#032257)">' + (isExp ? '지출' : '헌금') + ' 전표 수정</h3>' +
      '<div class="form-field"><label>일자</label><input type="date" id="ed_date" value="' + esc(ymdStr(x['일자'])) + '"></div>' +
      '<div class="form-field"><label>계정</label><select id="ed_acc">' + (isExp ? accOptions('지출') : accOptions('수입', '헌금')) + '</select></div>' +
      (isExp ? '' : '<div class="form-field"><label>예배</label><select id="ed_svc">' + svcOptions() + '</select></div>') +
      '<div class="form-field"><label>' + (isExp ? '거래처/수령인' : '헌금자') + '</label><input type="text" id="ed_payer" value="' + esc(x['헌금자'] || '') + '"></div>' +
      '<div class="form-field"><label>금액</label><input type="text" id="ed_amt" inputmode="numeric" value="' + won(x['금액']) + '" style="text-align:right;font-weight:700"></div>' +
      '<div class="form-field"><label>수단</label><select id="ed_method"><option>현금</option><option>통장</option></select></div>' +
      '<div class="form-field"><label>적요</label><input type="text" id="ed_memo" value="' + esc(x['적요'] || '') + '"></div>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:16px"><button class="btn btn-solid" id="ed_save">저장</button><button class="btn btn-line" id="ed_cancel">취소</button><span class="fin-msg" id="ed_msg"></span></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#ed_acc').value = x['계정'] || '';
    if (!isExp) ov.querySelector('#ed_svc').value = x['예배'] || '';
    ov.querySelector('#ed_method').value = x['수단'] || '현금';
    var amtI = ov.querySelector('#ed_amt');
    amtI.addEventListener('input', function () { var n = parseNum(amtI.value); amtI.value = n ? won(n) : ''; });
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('#ed_cancel').onclick = close;
    ov.querySelector('#ed_save').onclick = function () {
      var v = {
        date: ov.querySelector('#ed_date').value, type: x['구분'], kind: x['종류'],
        account: ov.querySelector('#ed_acc').value, service: isExp ? '' : ov.querySelector('#ed_svc').value,
        payer: ov.querySelector('#ed_payer').value.trim(), memberKey: x['매칭키'] || '',
        amount: parseNum(amtI.value), method: ov.querySelector('#ed_method').value, memo: ov.querySelector('#ed_memo').value.trim()
      };
      var msg = ov.querySelector('#ed_msg');
      if (!v.date || !v.amount) { msg.style.color = '#c0392b'; msg.textContent = '일자·금액을 확인하세요.'; return; }
      msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
      WPF.call('updateVoucher', { id: x['전표ID'], voucher: v }).then(function () { M.loaded = false; close(); if (onSaved) onSaved(); }).catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = e.message; });
    };
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
      '</div><div style="margin-top:6px;display:flex;gap:10px;align-items:center;"><button class="btn btn-solid" id="e_add">＋ 지출 추가</button><span class="fin-msg" id="e_msg"></span></div></div><div id="e_today"></div>';
    var amt = panel.querySelector('#e_amt');
    amt.addEventListener('input', function () { var n = parseNum(amt.value); amt.value = n ? won(n) : ''; });
    panel.querySelector('#e_add').onclick = function () {
      var v = { date: panel.querySelector('#e_date').value, type: '지출', kind: '일반', account: panel.querySelector('#e_acc').value, service: '', payer: panel.querySelector('#e_payer').value.trim(), memberKey: '', amount: parseNum(amt.value), method: panel.querySelector('#e_method').value, memo: panel.querySelector('#e_memo').value.trim() };
      var msg = panel.querySelector('#e_msg');
      if (!v.date || !v.memo || !v.amount) { msg.style.color = '#c0392b'; msg.textContent = '일자·적요·금액을 입력하세요.'; return; }
      msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
      WPF.call('addVoucher', { voucher: v }).then(function () { msg.style.color = 'green'; msg.textContent = '✓ 추가됨'; panel.querySelector('#e_memo').value = ''; panel.querySelector('#e_payer').value = ''; amt.value = ''; M.loaded = false; loadExp(v.date); }).catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = e.message; });
    };
    var ebox = panel.querySelector('#e_today');
    function loadExp(d) {
      loading(ebox);
      ensureVouchers().then(function () {
        var list = M.vouchers.filter(function (x) { return fmtD(x['일자']) === d && String(x['구분']) === '지출'; });
        var tot = list.reduce(function (s, x) { return s + (Number(x['금액']) || 0); }, 0);
        if (!list.length) { ebox.innerHTML = '<div class="fin-card"><b>' + esc(d) + '</b> 지출 내역이 없습니다.</div>'; return; }
        var byId = {}; list.forEach(function (x) { byId[x['전표ID']] = x; });
        ebox.innerHTML = '<div class="fin-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>' + esc(d) + ' 지출</b><div style="display:flex;gap:10px;align-items:center"><button class="btn btn-line" style="padding:4px 12px;font-size:.8rem" data-bulk>🗑 선택 삭제</button><b style="color:#c0392b">' + won(tot) + '원</b></div></div><div style="overflow:auto"><table class="fin-table"><thead><tr><th style="width:30px;text-align:center"><input type="checkbox" data-all></th><th>계정</th><th>적요</th><th>거래처</th><th class="num">금액</th><th>관리</th></tr></thead><tbody>' +
          list.map(function (x) { return '<tr><td style="text-align:center"><input type="checkbox" class="rowck" value="' + esc(x['전표ID']) + '"></td><td>' + esc(x['계정']) + '</td><td>' + esc(x['적요'] || '') + '</td><td>' + esc(x['헌금자'] || '') + '</td><td class="num">' + won(x['금액']) + '</td><td style="white-space:nowrap"><button class="btn btn-line" style="padding:3px 9px;font-size:.78rem" data-edit="' + esc(x['전표ID']) + '">수정</button> <button class="btn btn-line" style="padding:3px 9px;font-size:.78rem" data-del="' + esc(x['전표ID']) + '">삭제</button></td></tr>'; }).join('') + '</tbody></table></div></div>';
        wireChecks(ebox, function () { loadExp(d); });
        Array.prototype.forEach.call(ebox.querySelectorAll('[data-edit]'), function (b) { b.onclick = function () { openEditor(byId[b.dataset.edit], function () { loadExp(d); }); }; });
        Array.prototype.forEach.call(ebox.querySelectorAll('[data-del]'), function (b) { b.onclick = function () { if (!confirm('삭제할까요?')) return; WPF.call('deleteVoucher', { id: b.dataset.del }).then(function () { M.loaded = false; loadExp(d); }); }; });
      }).catch(function (e) { ebox.innerHTML = msgCard('조회 실패', e.message); });
    }
    panel.querySelector('#e_date').addEventListener('change', function () { loadExp(this.value); });
    loadExp(panel.querySelector('#e_date').value);
  }

  /* ── 거래장부 ── */
  function renderLedger(panel) {
    var _r = fyRange(M.fy);
    panel.innerHTML = '<div class="fin-card"><div class="fin-grid"><div class="form-field"><label>시작일</label><input type="date" id="l_from" value="' + _r.from + '"></div><div class="form-field"><label>종료일</label><input type="date" id="l_to" value="' + _r.to + '"></div><div class="form-field"><label>검색(계정/이름/적요)</label><input type="text" id="l_q"></div><div class="form-field" style="align-self:end"><button class="btn btn-solid" id="l_go">조회</button></div></div></div><div id="l_out"></div>';
    var out = panel.querySelector('#l_out');
    function draw() {
      loading(out);
      ensureVouchers().then(function () {
        var f = panel.querySelector('#l_from').value, t = panel.querySelector('#l_to').value, q = panel.querySelector('#l_q').value.trim().toLowerCase();
        var list = M.vouchers.filter(function (x) { var dd = fmtD(x['일자']); return (!f || dd >= f) && (!t || dd <= t) && (!q || (String(x['계정']) + x['헌금자'] + x['적요']).toLowerCase().indexOf(q) >= 0); }).slice().sort(function (a, b) { return fmtD(b['일자']).localeCompare(fmtD(a['일자'])); });
        var inc = 0, exp = 0; list.forEach(function (x) { if (String(x['구분']) === '수입') inc += Number(x['금액']) || 0; else exp += Number(x['금액']) || 0; });
        withPrint(out, '거래장부', '<div class="fin-card" style="display:flex;gap:24px;flex-wrap:wrap;align-items:center"><div>수입 <b style="color:#1e874b">' + won(inc) + '</b></div><div>지출 <b style="color:#c0392b">' + won(exp) + '</b></div><div>차액 <b>' + won(inc - exp) + '</b></div><div style="margin-left:auto">' + list.length + '건</div><button class="btn btn-line mng" style="padding:4px 12px;font-size:.8rem" data-bulk>🗑 선택 삭제</button></div>' +
          '<div class="fin-card" style="overflow:auto;max-height:560px"><table class="fin-table"><thead><tr><th class="mng" style="width:30px;text-align:center"><input type="checkbox" data-all></th><th>일자</th><th>구분</th><th>계정</th><th>상대/적요</th><th class="num">수입</th><th class="num">지출</th><th class="mng">관리</th></tr></thead><tbody>' +
          list.slice(0, 1500).map(function (x) { var isIn = String(x['구분']) === '수입'; return '<tr><td class="mng" style="text-align:center"><input type="checkbox" class="rowck" value="' + esc(x['전표ID']) + '"></td><td>' + esc(fmtD(x['일자'])) + '</td><td><span class="fin-pill ' + (isIn ? 'in' : 'out') + '">' + esc(x['구분']) + '</span></td><td>' + esc(x['계정']) + '</td><td>' + esc(x['헌금자'] || x['적요'] || '') + '</td><td class="num">' + (isIn ? won(x['금액']) : '') + '</td><td class="num">' + (!isIn ? won(x['금액']) : '') + '</td><td class="mng" style="white-space:nowrap"><button class="btn btn-line" style="padding:3px 8px;font-size:.76rem" data-edit="' + esc(x['전표ID']) + '">수정</button> <button class="btn btn-line" style="padding:3px 8px;font-size:.76rem" data-del="' + esc(x['전표ID']) + '">삭제</button></td></tr>'; }).join('') + '</tbody></table>' + (list.length > 1500 ? '<p class="help" style="padding:8px">최근 1,500건만 표시(합계는 전체 기준).</p>' : '') + '</div>');
        var byId = {}; list.forEach(function (x) { byId[x['전표ID']] = x; });
        wireChecks(out, draw);
        Array.prototype.forEach.call(out.querySelectorAll('[data-edit]'), function (b) { b.onclick = function () { openEditor(byId[b.dataset.edit], draw); }; });
        Array.prototype.forEach.call(out.querySelectorAll('[data-del]'), function (b) { b.onclick = function () { if (!confirm('삭제할까요?')) return; WPF.call('deleteVoucher', { id: b.dataset.del }).then(function () { M.loaded = false; draw(); }); }; });
      }).catch(function (e) { out.innerHTML = msgCard('조회 실패', e.message); });
    }
    panel.querySelector('#l_go').onclick = draw; draw();
  }

  /* ── 헌금자통계 ── */
  function renderGivers(panel) {
    loading(panel);
    ensureVouchers().then(function () {
      var map = {};
      vouchersFY().filter(function (x) { return String(x['종류']) === '헌금'; }).forEach(function (v) {
        var key = v['매칭키'] || ('이름:' + (v['헌금자'] || '무명')); if (!map[key]) map[key] = { name: v['헌금자'] || '무명', key: v['매칭키'], count: 0, total: 0 };
        map[key].count++; map[key].total += Number(v['금액']) || 0;
      });
      var rows = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.total - a.total; });
      var tot = rows.reduce(function (s, r) { return s + r.total; }, 0);
      withPrint(panel, '헌금자 통계', '<div class="fin-card"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>헌금자 순위 (' + rows.length + '명/팀)</b><b style="color:#1e874b">' + won(tot) + '원</b></div><div style="overflow:auto;max-height:600px"><table class="fin-table"><thead><tr><th>순위</th><th>헌금자</th><th>구분</th><th class="num">건수</th><th class="num">총 헌금액</th></tr></thead><tbody>' +
        rows.map(function (r, i) { return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.name) + '</b></td><td>' + (r.key ? '<span class="fin-pill in">교인</span>' : '<span style="color:#9aa5b1">미등록</span>') + '</td><td class="num">' + r.count + '</td><td class="num"><b>' + won(r.total) + '</b></td></tr>'; }).join('') + '</tbody></table></div></div>');
    }).catch(function (e) { panel.innerHTML = msgCard('조회 실패', e.message); });
  }

  /* ── 총계정원장 (계정별 집계) ── */
  function renderGL(panel) {
    loading(panel);
    ensureVouchers().then(function () {
      var content = '';
      ['수입', '지출'].forEach(function (type) {
        var byAcc = {}; var tot = 0;
        vouchersFY().filter(function (x) { return String(x['구분']) === type; }).forEach(function (v) { var a = v['계정'] || '?'; if (!byAcc[a]) byAcc[a] = { count: 0, sum: 0 }; byAcc[a].count++; byAcc[a].sum += Number(v['금액']) || 0; tot += Number(v['금액']) || 0; });
        var rows = Object.keys(byAcc).map(function (k) { return { acc: k, count: byAcc[k].count, sum: byAcc[k].sum }; }).sort(function (a, b) { return b.sum - a.sum; });
        content += '<div class="fin-card" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>' + type + ' 계정별 집계</b><b style="color:' + (type === '수입' ? '#1e874b' : '#c0392b') + '">' + won(tot) + '원</b></div><div style="overflow:auto"><table class="fin-table"><thead><tr><th>계정</th><th class="num">건수</th><th class="num">금액</th><th class="num">비율</th></tr></thead><tbody>' +
          rows.map(function (r) { return '<tr><td><b>' + esc(r.acc) + '</b></td><td class="num">' + r.count + '</td><td class="num"><b>' + won(r.sum) + '</b></td><td class="num">' + (tot ? (r.sum / tot * 100).toFixed(1) + '%' : '-') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
      });
      withPrint(panel, '총계정원장', content);
    }).catch(function (e) { panel.innerHTML = msgCard('조회 실패', e.message); });
  }

  /* ── 결산보고서 (월별현황 + 예산대비) ── */
  function renderReport(panel) {
    loading(panel);
    Promise.all([ensureVouchers(), ensureBudget()]).then(function () {
      var months = {}; var order = [];
      vouchersFY().forEach(function (v) { var m = String(v['일자']).slice(0, 7); if (!months[m]) { months[m] = { inc: 0, exp: 0 }; order.push(m); } if (String(v['구분']) === '수입') months[m].inc += Number(v['금액']) || 0; else months[m].exp += Number(v['금액']) || 0; });
      order.sort();
      var ti = 0, te = 0;
      var monthTbl = order.map(function (m) { ti += months[m].inc; te += months[m].exp; return '<tr><td>' + esc(m) + '</td><td class="num">' + won(months[m].inc) + '</td><td class="num">' + won(months[m].exp) + '</td><td class="num"><b>' + won(months[m].inc - months[m].exp) + '</b></td></tr>'; }).join('');
      var budIn = 0, budExp = 0;
      M.budget.forEach(function (b) { var code = String(b['계정코드'] || ''); var amt = Number(b['예산']) || 0; if (code.slice(-4) === '0000') return; if (/^1/.test(code)) budIn += amt; else if (/^2/.test(code)) budExp += amt; });
      withPrint(panel, '결산보고서',
        '<div class="fin-card"><b>월별 수입·지출 현황</b><div style="overflow:auto;margin-top:8px"><table class="fin-table"><thead><tr><th>월</th><th class="num">수입</th><th class="num">지출</th><th class="num">차액</th></tr></thead><tbody>' + monthTbl +
        '</tbody><tfoot><tr style="font-weight:700;background:#f5f8fc"><td>합계</td><td class="num">' + won(ti) + '</td><td class="num">' + won(te) + '</td><td class="num">' + won(ti - te) + '</td></tr></tfoot></table></div></div>' +
        (M.budget.length ? '<div class="fin-card"><b>예산 대비 실적</b><div style="overflow:auto;margin-top:8px"><table class="fin-table"><thead><tr><th>구분</th><th class="num">연간 예산</th><th class="num">실적 누계</th><th class="num">집행률</th></tr></thead><tbody>' +
          '<tr><td>수입</td><td class="num">' + won(budIn) + '</td><td class="num">' + won(ti) + '</td><td class="num">' + (budIn ? (ti / budIn * 100).toFixed(1) + '%' : '-') + '</td></tr>' +
          '<tr><td>지출</td><td class="num">' + won(budExp) + '</td><td class="num">' + won(te) + '</td><td class="num">' + (budExp ? (te / budExp * 100).toFixed(1) + '%' : '-') + '</td></tr>' +
          '</tbody></table></div><p class="help">예산=연간 기준, 실적=입력된 ' + order.length + '개월 누계.</p></div>' : ''));
    }).catch(function (e) { panel.innerHTML = msgCard('조회 실패', e.message); });
  }

  /* ── 재정보고서 (월별/주별/분기별/직접 기간) ── */
  function renderFinReport(panel) {
    panel.innerHTML =
      '<div class="fin-card"><div class="fin-grid" style="align-items:end">' +
      '<div class="form-field"><label>기간 구분</label><select id="fr_type"><option value="month">월별</option><option value="week">주별</option><option value="quarter">분기별</option><option value="custom">직접 선택</option></select></div>' +
      '<div class="form-field" id="fr_month_wrap"><label>월</label><select id="fr_month"></select></div>' +
      '<div class="form-field" id="fr_quarter_wrap" style="display:none"><label>분기</label><select id="fr_quarter"><option value="1">1분기(1~3월)</option><option value="2">2분기(4~6월)</option><option value="3">3분기(7~9월)</option><option value="4">4분기(10~12월)</option></select></div>' +
      '<div class="form-field" id="fr_week_wrap" style="display:none"><label>기준일(해당 주)</label><input type="date" id="fr_week" value="' + today() + '"></div>' +
      '<div class="form-field" id="fr_from_wrap" style="display:none"><label>시작일</label><input type="date" id="fr_from"></div>' +
      '<div class="form-field" id="fr_to_wrap" style="display:none"><label>종료일</label><input type="date" id="fr_to"></div>' +
      '<div class="form-field"><button class="btn btn-solid" id="fr_go">조회</button></div>' +
      '</div></div><div id="fr_out"></div>';
    var msel = panel.querySelector('#fr_month'), nowM = new Date().getMonth() + 1, im = '';
    for (var i = 1; i <= 12; i++) im += '<option value="' + i + '"' + (i === nowM ? ' selected' : '') + '>' + i + '월</option>';
    msel.innerHTML = im;
    var typeSel = panel.querySelector('#fr_type');
    function toggle() {
      var t = typeSel.value;
      panel.querySelector('#fr_month_wrap').style.display = t === 'month' ? '' : 'none';
      panel.querySelector('#fr_quarter_wrap').style.display = t === 'quarter' ? '' : 'none';
      panel.querySelector('#fr_week_wrap').style.display = t === 'week' ? '' : 'none';
      panel.querySelector('#fr_from_wrap').style.display = t === 'custom' ? '' : 'none';
      panel.querySelector('#fr_to_wrap').style.display = t === 'custom' ? '' : 'none';
    }
    typeSel.onchange = toggle; toggle();
    function range() {
      var t = typeSel.value, y = M.fy;
      if (t === 'month') { var m = Number(msel.value); return { from: y + '-' + pad2(m) + '-01', to: y + '-' + pad2(m) + '-' + pad2(lastDay(y, m)), label: y + '년 ' + m + '월' }; }
      if (t === 'quarter') { var q = Number(panel.querySelector('#fr_quarter').value), sm = (q - 1) * 3 + 1, em = sm + 2; return { from: y + '-' + pad2(sm) + '-01', to: y + '-' + pad2(em) + '-' + pad2(lastDay(y, em)), label: y + '년 ' + q + '분기 (' + sm + '~' + em + '월)' }; }
      if (t === 'week') { var w = weekRange(panel.querySelector('#fr_week').value); return { from: w.from, to: w.to, label: w.from + ' ~ ' + w.to + ' (주간)' }; }
      var f = panel.querySelector('#fr_from').value, tt = panel.querySelector('#fr_to').value; return { from: f, to: tt, label: (f || '?') + ' ~ ' + (tt || '?') };
    }
    var out = panel.querySelector('#fr_out');
    function go() {
      var rg = range();
      if (!rg.from || !rg.to) { out.innerHTML = msgCard('기간 확인', '시작일과 종료일을 선택하세요.'); return; }
      loading(out);
      ensureVouchers().then(function () {
        var list = M.vouchers.filter(function (x) { var d = fmtD(x['일자']); return d >= rg.from && d <= rg.to; });
        var inc = 0, exp = 0, accIn = {}, accEx = {};
        list.forEach(function (v) { var amt = Number(v['금액']) || 0, a = v['계정'] || '?'; if (String(v['구분']) === '수입') { inc += amt; if (!accIn[a]) accIn[a] = { c: 0, s: 0 }; accIn[a].c++; accIn[a].s += amt; } else { exp += amt; if (!accEx[a]) accEx[a] = { c: 0, s: 0 }; accEx[a].c++; accEx[a].s += amt; } });
        function tbl(map, tot) { var rows = Object.keys(map).map(function (k) { return { a: k, c: map[k].c, s: map[k].s }; }).sort(function (a, b) { return b.s - a.s; }); if (!rows.length) return '<p class="help">내역 없음</p>'; return '<table class="fin-table"><thead><tr><th>계정</th><th class="num">건수</th><th class="num">금액</th><th class="num">비율</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + esc(r.a) + '</td><td class="num">' + r.c + '</td><td class="num"><b>' + won(r.s) + '</b></td><td class="num">' + (tot ? (r.s / tot * 100).toFixed(1) + '%' : '-') + '</td></tr>'; }).join('') + '</tbody><tfoot><tr style="font-weight:700;background:#f5f8fc"><td>합계</td><td class="num">' + rows.reduce(function (s, r) { return s + r.c; }, 0) + '</td><td class="num">' + won(tot) + '</td><td class="num">100%</td></tr></tfoot></table>'; }
        var content = '<div class="fin-card" style="display:flex;gap:20px;flex-wrap:wrap;align-items:center"><b>' + esc(rg.label) + '</b><div style="margin-left:auto">수입 <b style="color:#1e874b">' + won(inc) + '</b></div><div>지출 <b style="color:#c0392b">' + won(exp) + '</b></div><div>차액 <b>' + won(inc - exp) + '</b></div><div>' + list.length + '건</div></div>' +
          '<div class="fin-card"><b>수입 계정별</b><div style="overflow:auto;margin-top:8px">' + tbl(accIn, inc) + '</div></div>' +
          '<div class="fin-card"><b>지출 계정별</b><div style="overflow:auto;margin-top:8px">' + tbl(accEx, exp) + '</div></div>';
        withPrint(out, '재정보고서', content, rg.label);
      }).catch(function (e) { out.innerHTML = msgCard('조회 실패', e.message); });
    }
    panel.querySelector('#fr_go').onclick = go; go();
  }

  /* ── 헌금명단 (주보용: 주간·항목별 명단) ── */
  function renderGiverList(panel) {
    panel.innerHTML =
      '<div class="fin-card"><div class="fin-grid" style="align-items:end">' +
      '<div class="form-field"><label>기준일(해당 주)</label><input type="date" id="gl2_date" value="' + today() + '"></div>' +
      '<div class="form-field"><label>주간 선택</label><div style="display:flex;gap:6px"><button class="btn btn-line" id="gl2_this">이번주</button><button class="btn btn-line" id="gl2_last">지난주</button></div></div>' +
      '<div class="form-field"><label>옵션</label><label class="sw" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="gl2_amt"> 금액 표시</label></div>' +
      '<div class="form-field"><button class="btn btn-solid" id="gl2_go">조회</button></div>' +
      '</div><p class="help" style="margin-top:6px">주보용 헌금자 명단 — 십일조·감사 등 <b>항목별로 명단</b>을 출력합니다.</p></div><div id="gl2_out"></div>';
    var dateInp = panel.querySelector('#gl2_date');
    panel.querySelector('#gl2_this').onclick = function () { dateInp.value = today(); go(); };
    panel.querySelector('#gl2_last').onclick = function () { var d = new Date(today() + 'T00:00:00'); d.setDate(d.getDate() - 7); dateInp.value = ymdOf(d); go(); };
    var out = panel.querySelector('#gl2_out');
    function go() {
      var w = weekRange(dateInp.value), showAmt = panel.querySelector('#gl2_amt').checked;
      loading(out);
      ensureVouchers().then(function () {
        var list = M.vouchers.filter(function (x) { var d = fmtD(x['일자']); return d >= w.from && d <= w.to && String(x['종류']) === '헌금'; });
        if (!list.length) { out.innerHTML = '<div class="fin-card">해당 주(' + w.from + ' ~ ' + w.to + ') 헌금 내역이 없습니다.</div>'; return; }
        var byAcc = {}, order = [];
        list.forEach(function (v) { var a = v['계정'] || '기타'; if (!byAcc[a]) { byAcc[a] = []; order.push(a); } byAcc[a].push(v); });
        function accSum(a) { return byAcc[a].reduce(function (s, v) { return s + (Number(v['금액']) || 0); }, 0); }
        order.sort(function (a, b) { return accSum(b) - accSum(a); });
        var totAll = list.reduce(function (s, v) { return s + (Number(v['금액']) || 0); }, 0);
        var content = '<div class="fin-card" style="display:flex;gap:18px;flex-wrap:wrap;align-items:center"><b>' + w.from + ' ~ ' + w.to + ' 헌금자 명단</b><div style="margin-left:auto">총 ' + list.length + '건 · ' + won(totAll) + '원</div></div>';
        order.forEach(function (a) {
          var arr = byAcc[a], sum = accSum(a);
          var names = arr.map(function (v) { var nm = esc(v['헌금자'] || '무명'); var memo = v['적요'] ? ' (' + esc(v['적요']) + ')' : ''; var amt = showAmt ? ' <span style="color:#1e874b">' + won(v['금액']) + '</span>' : ''; return nm + memo + amt; });
          content += '<div class="fin-card"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><b style="color:var(--accent,#032257)">' + esc(a) + ' (' + arr.length + '명)</b><b style="color:#1e874b">' + won(sum) + '원</b></div><div style="line-height:2.1;font-size:.95rem">' + names.join('<span style="color:#cbd5e1"> · </span>') + '</div></div>';
        });
        withPrint(out, '헌금자 명단', content, w.from + ' ~ ' + w.to + ' 주간');
      }).catch(function (e) { out.innerHTML = msgCard('조회 실패', e.message); });
    }
    panel.querySelector('#gl2_go').onclick = go; go();
  }

  /* ── 기부금영수증 (교인 헌금 누계) ── */
  function renderReceipt(panel) {
    loading(panel);
    ensureVouchers().then(function () {
      var map = {};
      vouchersFY().filter(function (x) { return String(x['종류']) === '헌금' && x['매칭키']; }).forEach(function (v) { var k = v['매칭키']; if (!map[k]) map[k] = { name: v['헌금자'], key: k, total: 0, count: 0 }; map[k].total += Number(v['금액']) || 0; map[k].count++; });
      var rows = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.total - a.total; });
      var tot = rows.reduce(function (s, r) { return s + r.total; }, 0);
      withPrint(panel, '기부금 영수증 (교인별 헌금 누계)', '<div class="fin-card"><div style="background:#fff8e8;border:1px solid #f0d98c;color:#8a6512;padding:10px 14px;border-radius:9px;font-size:.85rem;margin-bottom:12px">연말정산 기부금영수증용 — 교적 매칭된 교인의 헌금 누계입니다. (미등록 헌금자 제외)</div><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>교인별 헌금 누계 (' + rows.length + '명)</b><b style="color:#1e874b">' + won(tot) + '원</b></div><div style="overflow:auto;max-height:600px"><table class="fin-table"><thead><tr><th>이름</th><th>생년월일</th><th class="num">건수</th><th class="num">헌금 누계</th></tr></thead><tbody>' +
        rows.map(function (r) { var bd = (r.key || '').split('|')[1] || ''; var b = bd ? bd.slice(0, 4) + '-' + bd.slice(4, 6) + '-' + bd.slice(6, 8) : ''; return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(b) + '</td><td class="num">' + r.count + '</td><td class="num"><b>' + won(r.total) + '</b></td></tr>'; }).join('') + '</tbody></table></div></div>');
    }).catch(function (e) { panel.innerHTML = msgCard('조회 실패', e.message); });
  }

  /* ── 예산(앱 내 직접 편집 → 구글시트 저장) ── */
  function renderBudget(panel) {
    loading(panel);
    ensureBudget().then(function () {
      if (!M.budget.length) { panel.innerHTML = msgCard('예산 없음', '예산 데이터를 불러오지 못했습니다. Apps Script에 budget 액션이 배포됐는지 확인하세요.'); return; }
      panel.innerHTML = '';
      var info = document.createElement('div'); info.className = 'fin-card'; info.style.marginBottom = '14px';
      info.innerHTML = '<p style="margin:0;color:var(--ink-soft);font-size:.88rem">금년예산 칸을 클릭해 직접 수정하면 <b>구글시트(운평재정_예산)에 자동 저장</b>됩니다. 소계(코드 끝 0000)는 하위 항목 합계로 자동 계산됩니다.</p>';
      panel.appendChild(info);
      ['수입', '지출'].forEach(function (g) {
        var rows = M.budget.filter(function (b) { return String(b['구분']) === g; });
        if (!rows.length) return;
        var card = document.createElement('div'); card.className = 'fin-card'; card.style.marginBottom = '16px';
        function sumOf() { return rows.filter(function (b) { return String(b['계정코드'] || '').slice(-4) !== '0000'; }).reduce(function (s, b) { return s + (Number(b['예산']) || 0); }, 0); }
        var head = document.createElement('div'); head.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:8px'; head.innerHTML = '<b>' + g + ' 예산</b><b class="bud-sum">' + won(sumOf()) + '원</b>';
        var wrap = document.createElement('div'); wrap.style.overflow = 'auto';
        var tbl = document.createElement('table'); tbl.className = 'fin-table';
        tbl.innerHTML = '<thead><tr><th>코드</th><th>계정</th><th class="num">전년예산</th><th class="num">전년결산</th><th class="num">금년예산</th></tr></thead><tbody></tbody>';
        var tb = tbl.querySelector('tbody');
        rows.forEach(function (b) {
          var top = String(b['계정코드'] || '').slice(-4) === '0000';
          var tr = document.createElement('tr'); if (top) tr.style.cssText = 'font-weight:700;background:#f5f8fc';
          tr.innerHTML = '<td>' + esc(b['계정코드']) + '</td><td>' + esc(b['계정이름']) + '</td><td class="num">' + won(b['전년예산']) + '</td><td class="num">' + won(b['전년결산']) + '</td>';
          var td = document.createElement('td'); td.className = 'num';
          if (top) { td.innerHTML = '<b>' + won(b['예산']) + '</b>'; }
          else {
            var inp = document.createElement('input'); inp.type = 'text'; inp.inputMode = 'numeric'; inp.value = won(b['예산']);
            inp.style.cssText = 'width:120px;text-align:right;border:1px solid #dfe5ee;border-radius:6px;padding:4px 7px;font:inherit';
            inp.addEventListener('input', function () { var n = parseNum(inp.value); inp.value = n ? won(n) : ''; });
            inp.addEventListener('change', function () {
              var n = parseNum(inp.value); var prev = Number(b['예산']) || 0; if (n === prev) return;
              inp.style.borderColor = '#9aa5b1';
              WPF.call('updateBudget', { code: b['계정코드'], amount: n }).then(function () {
                b['예산'] = n; M._b = false; // 결산보고서 재집계용 캐시 무효화
                inp.style.borderColor = '#1e874b'; head.querySelector('.bud-sum').textContent = won(sumOf()) + '원';
                setTimeout(function () { inp.style.borderColor = '#dfe5ee'; }, 1200);
              }).catch(function (e) { inp.style.borderColor = '#c0392b'; inp.value = won(prev); alert('저장 실패: ' + e.message); });
            });
            td.appendChild(inp);
          }
          tr.appendChild(td); tb.appendChild(tr);
        });
        wrap.appendChild(tbl); card.appendChild(head); card.appendChild(wrap); panel.appendChild(card);
      });
    }).catch(function (e) { panel.innerHTML = msgCard('조회 실패', e.message); });
  }

  /* ── 설정(회계연도 시작 월) ── */
  function renderSettings(panel) {
    var sm = fyStartMonth();
    var mopts = '';
    for (var i = 1; i <= 12; i++) mopts += '<option value="' + i + '"' + (i === sm ? ' selected' : '') + '>' + i + '월</option>';
    var r = fyRange(M.fy);
    panel.innerHTML = '<div class="fin-card" style="max-width:560px">' +
      '<h3 style="margin:0 0 6px;color:var(--accent,#032257)">회계연도 설정</h3>' +
      '<p style="color:var(--ink-soft);font-size:.88rem;margin-bottom:16px">회계연도가 시작하는 월을 정합니다. 거래장부·통계·결산보고서·기부금영수증이 선택한 회계연도 범위로 집계됩니다.</p>' +
      '<div class="form-field" style="max-width:220px"><label>회계연도 시작 월</label><select id="set_sm">' + mopts + '</select></div>' +
      '<p class="help" style="margin-top:10px">예) <b>1월</b> → 1/1 ~ 12/31 · <b>12월</b> → 12/1 ~ 익년 11/30(오직 방식) · <b>3월</b> → 3/1 ~ 익년 2/말</p>' +
      '<p style="margin-top:6px;font-size:.86rem">현재 <b>' + M.fy + '년도</b> 범위: <b>' + r.from + ' ~ ' + r.to + '</b></p>' +
      '<div style="margin-top:14px;display:flex;gap:10px;align-items:center"><button class="btn btn-solid" id="set_save">저장</button><span class="fin-msg" id="set_msg"></span></div>' +
      '<p style="color:#9aa5b1;font-size:.78rem;margin-top:12px">※ 이 설정은 현재 브라우저에 저장됩니다(관리자 PC 기준). 회계연도 선택은 상단 드롭다운에서 바꿀 수 있습니다.</p></div>';
    panel.querySelector('#set_save').onclick = function () {
      var v = Number(panel.querySelector('#set_sm').value);
      localStorage.setItem('wpf_fy_start', v);
      M.fy = curFY();
      var msg = panel.querySelector('#set_msg'); msg.style.color = 'green'; msg.textContent = '✓ 저장됨';
      setTimeout(render, 700);
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
