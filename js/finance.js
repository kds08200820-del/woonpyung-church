/* finance.js — 재정관리 페이지(권한자만): 헌금/지출 입력 + 장부
 * 콘솔: [finance.js] v20260630g
 */
console.log('[finance.js] v20260630g');

(function () {
  var root = document.getElementById('finRoot');
  if (!root) return;

  var M = { members: [], accounts: [], services: [] };
  var won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR'); };
  var parseNum = function (s) { return Number(String(s == null ? '' : s).replace(/[^\d]/g, '')) || 0; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var today = function () { var d = new Date(), p = function (x) { return ('' + x).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  function elFromHTML(html) { var t = document.createElement('div'); t.innerHTML = html.trim(); return t.firstChild; }

  // 로그인/권한 대기
  var tries = 0;
  function boot() {
    if (!window.FINANCE_API_URL) { root.innerHTML = msgCard('준비 중', '재정 API가 아직 설정되지 않았습니다.'); return; }
    if (!(window.WPF && WPF.token())) {
      if (tries++ < 20) { setTimeout(boot, 400); return; }
      root.innerHTML = msgCard('로그인이 필요합니다', '상단의 로그인 후 이용해 주세요. 재정관리는 권한이 부여된 회원만 접근할 수 있습니다.');
      return;
    }
    root.innerHTML = '<p class="qt-loading">권한 확인 중입니다…</p>';
    WPF.call('me').then(function (me) {
      if (!me.canFinance) { root.innerHTML = msgCard('접근 권한이 없습니다', '재정관리는 관리자 승인을 받은 회원만 이용할 수 있습니다. 담임목사님께 권한을 요청하세요.'); return; }
      WPF.call('masters').then(function (m) {
        M.members = m.members || []; M.accounts = m.accounts || []; M.services = m.services || [];
        render();
      }).catch(function (e) { root.innerHTML = msgCard('불러오기 실패', e.message); });
    }).catch(function (e) { root.innerHTML = msgCard('확인 실패', e.message); });
  }

  function msgCard(title, text) {
    return '<div class="fin-card" style="text-align:center;padding:40px 18px;"><h3 style="margin:0 0 8px;color:var(--accent,#032257);">' + esc(title) + '</h3><p style="color:var(--ink-soft,#7b8794);">' + esc(text) + '</p></div>';
  }

  var tab = 'offering';
  function render() {
    root.innerHTML =
      '<div class="fin-tabs">' +
      '<button data-t="offering">헌금 입력</button>' +
      '<button data-t="expense">지출 입력</button>' +
      '<button data-t="ledger">장부 조회</button>' +
      '</div><div id="finPanel"></div>';
    Array.prototype.forEach.call(root.querySelectorAll('.fin-tabs button'), function (b) {
      if (b.dataset.t === tab) b.classList.add('active');
      b.onclick = function () { tab = b.dataset.t; render(); };
    });
    var panel = document.getElementById('finPanel');
    if (tab === 'offering') renderOffering(panel);
    else if (tab === 'expense') renderExpense(panel);
    else renderLedger(panel);
  }

  function accOptions(type, group) {
    return M.accounts.filter(function (a) {
      return String(a['구분']) === type && (!group || String(a['분류']) === group);
    }).map(function (a) { return '<option value="' + esc(a['계정명']) + '">' + esc(a['계정명']) + '</option>'; }).join('');
  }
  function svcOptions() {
    return M.services.map(function (s) { return '<option value="' + esc(s['예배명']) + '">' + esc(s['예배명']) + '</option>'; }).join('');
  }

  // ── 헌금 입력 ──
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
      '</div><div style="margin-top:6px;display:flex;gap:10px;align-items:center;">' +
      '<button class="btn btn-solid" id="o_add">＋ 헌금 추가</button><span class="fin-msg" id="o_msg"></span></div></div>' +
      '<div id="o_today"></div>';
    setupMemberSearch(panel.querySelector('#o_payer'), panel.querySelector('#o_key'));
    var amt = panel.querySelector('#o_amt');
    amt.addEventListener('input', function () { var n = parseNum(amt.value); amt.value = n ? won(n) : ''; });
    panel.querySelector('#o_add').onclick = function () {
      var v = {
        date: panel.querySelector('#o_date').value, type: '수입', kind: '헌금',
        account: panel.querySelector('#o_acc').value, service: panel.querySelector('#o_svc').value,
        payer: panel.querySelector('#o_payer').value.trim(), memberKey: panel.querySelector('#o_key').value,
        amount: parseNum(amt.value), method: panel.querySelector('#o_method').value,
        memo: panel.querySelector('#o_memo').value.trim()
      };
      var msg = panel.querySelector('#o_msg');
      if (!v.date || !v.amount) { msg.style.color = '#c0392b'; msg.textContent = '일자와 금액을 입력하세요.'; return; }
      msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
      WPF.call('addVoucher', { voucher: v }).then(function () {
        msg.style.color = 'green'; msg.textContent = '✓ 추가됨';
        panel.querySelector('#o_payer').value = ''; panel.querySelector('#o_key').value = '';
        amt.value = ''; panel.querySelector('#o_memo').value = '';
        loadToday(panel.querySelector('#o_date').value);
      }).catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = e.message; });
    };
    var todayBox = panel.querySelector('#o_today');
    function loadToday(d) {
      todayBox.innerHTML = '<p class="qt-loading">불러오는 중…</p>';
      WPF.call('listVouchers', { from: d, to: d }).then(function (r) {
        var list = (r.vouchers || []).filter(function (x) { return String(x['종류']) === '헌금'; });
        var total = list.reduce(function (s, x) { return s + (Number(x['금액']) || 0); }, 0);
        if (!list.length) { todayBox.innerHTML = '<div class="fin-card"><b>' + esc(d) + '</b> 헌금 내역이 없습니다.</div>'; return; }
        var rows = list.map(function (x) {
          return '<tr><td>' + esc(x['예배'] || '') + '</td><td>' + esc(x['계정']) + '</td><td>' + esc(x['헌금자'] || '') +
            '</td><td class="num">' + won(x['금액']) + '</td><td><button class="btn btn-line" style="padding:3px 9px;font-size:.78rem" data-del="' + esc(x['전표ID']) + '">삭제</button></td></tr>';
        }).join('');
        todayBox.innerHTML = '<div class="fin-card"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>' + esc(d) + ' 헌금</b><b style="color:#1e874b">' + won(total) + '원</b></div>' +
          '<div style="overflow:auto"><table class="fin-table"><thead><tr><th>예배</th><th>항목</th><th>헌금자</th><th class="num">금액</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
        Array.prototype.forEach.call(todayBox.querySelectorAll('[data-del]'), function (b) {
          b.onclick = function () { if (!confirm('이 헌금 전표를 삭제할까요?')) return; WPF.call('deleteVoucher', { id: b.dataset.del }).then(function () { loadToday(d); }); };
        });
      }).catch(function (e) { todayBox.innerHTML = msgCard('조회 실패', e.message); });
    }
    panel.querySelector('#o_date').addEventListener('change', function () { loadToday(this.value); });
    loadToday(panel.querySelector('#o_date').value);
  }

  // 교적 검색 자동완성
  function setupMemberSearch(input, hidden) {
    var pop = null, hi = -1, matches = [];
    function close() { if (pop) { pop.remove(); pop = null; hi = -1; } }
    input.addEventListener('input', function () {
      hidden.value = ''; var q = input.value.trim().toLowerCase(); close();
      if (!q) return;
      matches = M.members.filter(function (m) { return (m.name || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      if (!matches.length) return;
      pop = document.createElement('div'); pop.className = 'fin-sugg';
      matches.forEach(function (m) {
        var d = document.createElement('div');
        d.innerHTML = esc(m.name) + ' <span style="color:#9aa5b1;font-size:.78rem">' + esc(m.birth || '') + ' · ' + esc(m.group || '') + '</span>';
        d.onclick = function () { pick(m); };
        pop.appendChild(d);
      });
      input.parentElement.appendChild(pop);
    });
    input.addEventListener('keydown', function (e) {
      if (!pop) return; var rows = pop.querySelectorAll('div');
      if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hi + 1, rows.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(hi - 1, 0); }
      else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(matches[hi]); return; }
      else return;
      Array.prototype.forEach.call(rows, function (r, i) { r.classList.toggle('hi', i === hi); });
    });
    input.addEventListener('blur', function () { setTimeout(close, 180); });
    function pick(m) { input.value = m.name; hidden.value = m.key || ''; close(); }
  }

  // ── 지출 입력 ──
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
      '</div><div style="margin-top:6px;display:flex;gap:10px;align-items:center;">' +
      '<button class="btn btn-solid" id="e_add">＋ 지출 추가</button><span class="fin-msg" id="e_msg"></span></div></div>';
    var amt = panel.querySelector('#e_amt');
    amt.addEventListener('input', function () { var n = parseNum(amt.value); amt.value = n ? won(n) : ''; });
    panel.querySelector('#e_add').onclick = function () {
      var v = {
        date: panel.querySelector('#e_date').value, type: '지출', kind: '일반',
        account: panel.querySelector('#e_acc').value, service: '', payer: panel.querySelector('#e_payer').value.trim(),
        memberKey: '', amount: parseNum(amt.value), method: panel.querySelector('#e_method').value,
        memo: panel.querySelector('#e_memo').value.trim()
      };
      var msg = panel.querySelector('#e_msg');
      if (!v.date || !v.memo || !v.amount) { msg.style.color = '#c0392b'; msg.textContent = '일자·적요·금액을 입력하세요.'; return; }
      msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
      WPF.call('addVoucher', { voucher: v }).then(function () {
        msg.style.color = 'green'; msg.textContent = '✓ 추가됨';
        panel.querySelector('#e_memo').value = ''; panel.querySelector('#e_payer').value = ''; amt.value = '';
      }).catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = e.message; });
    };
  }

  // ── 장부 조회 ──
  function renderLedger(panel) {
    panel.innerHTML =
      '<div class="fin-card"><div class="fin-grid">' +
      '<div class="form-field"><label>시작일</label><input type="date" id="l_from"></div>' +
      '<div class="form-field"><label>종료일</label><input type="date" id="l_to"></div>' +
      '<div class="form-field" style="align-self:end"><button class="btn btn-solid" id="l_go">조회</button></div>' +
      '</div></div><div id="l_out"><p class="qt-loading">불러오는 중…</p></div>';
    var out = panel.querySelector('#l_out');
    function load() {
      out.innerHTML = '<p class="qt-loading">불러오는 중…</p>';
      var q = {};
      if (panel.querySelector('#l_from').value) q.from = panel.querySelector('#l_from').value;
      if (panel.querySelector('#l_to').value) q.to = panel.querySelector('#l_to').value;
      WPF.call('listVouchers', q).then(function (r) {
        var list = r.vouchers || [];
        var inc = 0, exp = 0;
        list.forEach(function (x) { if (String(x['구분']) === '수입') inc += Number(x['금액']) || 0; else exp += Number(x['금액']) || 0; });
        if (!list.length) { out.innerHTML = '<div class="fin-card">조회된 내역이 없습니다.</div>'; return; }
        var rows = list.map(function (x) {
          var isIn = String(x['구분']) === '수입';
          return '<tr><td>' + esc(x['일자']) + '</td><td><span class="fin-pill ' + (isIn ? 'in' : 'out') + '">' + esc(x['구분']) + '</span></td><td>' + esc(x['계정']) +
            '</td><td>' + esc(x['헌금자'] || x['적요'] || '') + '</td><td class="num">' + (isIn ? won(x['금액']) : '') + '</td><td class="num">' + (!isIn ? won(x['금액']) : '') +
            '</td><td><button class="btn btn-line" style="padding:3px 9px;font-size:.78rem" data-del="' + esc(x['전표ID']) + '">삭제</button></td></tr>';
        }).join('');
        out.innerHTML = '<div class="fin-card" style="display:flex;gap:24px;flex-wrap:wrap"><div>수입 <b style="color:#1e874b">' + won(inc) + '원</b></div><div>지출 <b style="color:#c0392b">' + won(exp) + '원</b></div><div>차액 <b>' + won(inc - exp) + '원</b></div></div>' +
          '<div class="fin-card" style="overflow:auto"><table class="fin-table"><thead><tr><th>일자</th><th>구분</th><th>계정</th><th>상대/적요</th><th class="num">수입</th><th class="num">지출</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
        Array.prototype.forEach.call(out.querySelectorAll('[data-del]'), function (b) {
          b.onclick = function () { if (!confirm('이 전표를 삭제할까요?')) return; WPF.call('deleteVoucher', { id: b.dataset.del }).then(load); };
        });
      }).catch(function (e) { out.innerHTML = msgCard('조회 실패', e.message); });
    }
    panel.querySelector('#l_go').onclick = load;
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
