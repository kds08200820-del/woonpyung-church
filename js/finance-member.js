/* finance-member.js — 내 정보(admin.html)의 "교적 인증 · 내 헌금" 섹션
 * 로그인한 회원이 이름+생년월일로 교적 인증(정/준회원) 후 본인 헌금만 조회.
 * 콘솔: [finance-member.js] v20260630i
 */
console.log('[finance-member.js] v20260630i');

(function () {
  var box = document.getElementById('offeringBox');
  var body = document.getElementById('offeringBody');
  if (!box || !body) return;

  var won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR'); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // 로그인 토큰이 준비될 때까지 잠깐 대기(auth.js 로딩 시차)
  var tries = 0;
  function waitLogin() {
    if (!window.FINANCE_API_URL) { box.hidden = true; return; }
    if (window.WPF && WPF.token()) { box.hidden = false; loadMe(); return; }
    if (tries++ < 20) { setTimeout(waitLogin, 400); return; }
    box.hidden = true; // 끝내 비로그인 → 섹션 숨김
  }

  function loading(msg) { body.innerHTML = '<p class="qt-loading">' + esc(msg || '확인 중입니다…') + '</p>'; }
  function errBox(msg) {
    body.innerHTML = '<p style="color:var(--accent-soft);font-size:.9rem;">' + esc(msg) + '</p>';
    var b = document.createElement('button');
    b.className = 'btn btn-line'; b.textContent = '다시 시도'; b.style.marginTop = '10px';
    b.onclick = loadMe; body.appendChild(b);
  }

  function loadMe() {
    loading();
    WPF.call('me').then(function (me) {
      if (me.status === '정회원') renderMember(me);
      else renderMatchForm(me);
    }).catch(function (e) { errBox('불러오기에 실패했습니다: ' + e.message); });
  }

  // 준회원/미인증 → 인증 폼
  function renderMatchForm(me) {
    var pending = me.status === '준회원' && me.memberName;
    body.innerHTML =
      (pending ? '<p style="color:var(--accent-soft);font-size:.92rem;margin-bottom:12px;">현재 <b>준회원</b>입니다. 교적에서 자동 인증되지 않아 관리자 승인을 기다리고 있거나, 아래에서 다시 인증할 수 있습니다.</p>' : '') +
      '<div class="form-grid">' +
      '  <div class="form-field"><label>이름</label><input type="text" id="mm_name" maxlength="40" placeholder="교적에 등록된 이름" /></div>' +
      '  <div class="form-field"><label>생년월일</label><input type="text" id="mm_birth" maxlength="10" placeholder="예: 1981-08-19" inputmode="numeric" /></div>' +
      '</div>' +
      '<div class="form-actions" style="margin-top:14px;display:flex;gap:10px;align-items:center;">' +
      '  <button type="button" class="btn btn-solid" id="mm_btn">교적 인증</button>' +
      '  <span class="profile-msg" id="mm_msg"></span>' +
      '</div>';
    document.getElementById('mm_btn').onclick = function () {
      var name = document.getElementById('mm_name').value.trim();
      var birth = document.getElementById('mm_birth').value.replace(/[^0-9]/g, '');
      var msg = document.getElementById('mm_msg');
      if (!name || birth.length !== 8) { msg.textContent = '이름과 생년월일 8자리를 정확히 입력하세요.'; msg.style.color = 'var(--accent-soft)'; return; }
      msg.style.color = 'var(--ink-soft)'; msg.textContent = '확인 중…';
      WPF.call('match', { name: name, birth: birth }).then(function (r) {
        if (r.status === '정회원') { msg.style.color = 'green'; msg.textContent = '✓ 정회원 인증 완료'; setTimeout(loadMe, 700); }
        else { msg.style.color = 'var(--accent-soft)'; msg.textContent = r.message || '교적에서 일치하는 정보를 찾지 못했습니다.'; }
      }).catch(function (e) { msg.style.color = 'var(--accent-soft)'; msg.textContent = '오류: ' + e.message; });
    };
  }

  // 정회원 → 본인 헌금 + (권한자면) 재정관리 버튼
  function renderMember(me) {
    body.innerHTML =
      '<p style="font-size:.95rem;margin-bottom:14px;">✓ <b>정회원</b>' + (me.memberName ? ' · ' + esc(me.memberName) + '님' : '') + '</p>' +
      '<div id="offeringList"><p class="qt-loading">헌금 내역을 불러오는 중…</p></div>';
    if (me.canFinance) {
      var a = document.createElement('a');
      a.className = 'btn btn-solid'; a.href = 'finance.html'; a.textContent = '재정관리 페이지로 이동 →';
      a.style.marginTop = '16px'; a.style.display = 'inline-block';
      body.appendChild(a);
    }
    WPF.call('myOfferings').then(function (r) {
      var el = document.getElementById('offeringList');
      var list = r.offerings || [];
      if (!list.length) { el.innerHTML = '<p style="color:var(--ink-soft);font-size:.9rem;">조회된 헌금 내역이 없습니다.</p>'; return; }
      var rows = list.map(function (o) {
        return '<tr><td>' + esc(o.date) + '</td><td>' + esc(o.service || '') + '</td><td>' + esc(o.account || '') +
          '</td><td style="text-align:right;font-variant-numeric:tabular-nums;">' + won(o.amount) + '</td></tr>';
      }).join('');
      el.innerHTML =
        '<div style="overflow:auto;"><table class="board-table" style="width:100%;border-collapse:collapse;font-size:.92rem;">' +
        '<thead><tr><th style="text-align:left;">일자</th><th style="text-align:left;">예배</th><th style="text-align:left;">항목</th><th style="text-align:right;">금액</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
        '<tfoot><tr><td colspan="3" style="text-align:right;font-weight:700;">합계</td><td style="text-align:right;font-weight:700;">' + won(r.total) + '원</td></tr></tfoot>' +
        '</table></div>' +
        '<p style="color:var(--ink-soft);font-size:.8rem;margin-top:8px;">🔒 이 내역은 본인에게만 표시됩니다.</p>';
    }).catch(function (e) {
      var el = document.getElementById('offeringList');
      if (el) el.innerHTML = '<p style="color:var(--accent-soft);font-size:.9rem;">헌금 조회 실패: ' + esc(e.message) + '</p>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitLogin);
  else waitLogin();
})();
