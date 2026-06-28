/* gyojeok.js — 교적관리(관리자 전용): 권한관리 + 교적명단
 * 콘솔: [gyojeok.js] v20260630w
 */
console.log('[gyojeok.js] v20260630w');

(function () {
  var root = document.getElementById('gjRoot');
  if (!root) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  // 생년월일: 매칭키(이름|YYYYMMDD)에서 정확히 추출, 없으면 ISO 앞 10자
  function birthOf(m) { var bd = (String(m['매칭키'] || '').split('|')[1]) || ''; if (bd.length === 8) return bd.slice(0, 4) + '-' + bd.slice(4, 6) + '-' + bd.slice(6, 8); return String(m['생년월일'] || '').slice(0, 10); }
  // 휴대폰: 앞 0 복원 + 010-XXXX-XXXX 형식
  function fmtPhone(p) { p = String(p == null ? '' : p).replace(/[^0-9]/g, ''); if (!p) return ''; if (p.length === 10 && p.charAt(0) !== '0') p = '0' + p; if (p.length === 11) return p.slice(0, 3) + '-' + p.slice(3, 7) + '-' + p.slice(7); if (p.length === 10) return p.slice(0, 3) + '-' + p.slice(3, 6) + '-' + p.slice(6); return p; }
  function msgCard(t, x) { return '<div class="fin-card" style="text-align:center;padding:40px 18px;"><h3 style="margin:0 0 8px;color:var(--accent,#032257);">' + esc(t) + '</h3><p style="color:var(--ink-soft,#7b8794);">' + esc(x) + '</p></div>'; }
  function loading(el) { el.innerHTML = '<p class="qt-loading">불러오는 중…</p>'; }

  var tries = 0, tab = 'access';
  function boot() {
    if (!window.FINANCE_API_URL) { root.innerHTML = msgCard('준비 중', '재정 API가 설정되지 않았습니다.'); return; }
    if (!(window.WPF && WPF.token())) {
      if (tries++ < 20) { setTimeout(boot, 400); return; }
      root.innerHTML = msgCard('로그인이 필요합니다', '상단에서 로그인 후 이용해 주세요.'); return;
    }
    render();
  }
  function render() {
    root.innerHTML = '<div class="fin-tabs"><button data-t="access">권한 관리</button><button data-t="members">교적 명단</button></div><div id="gjPanel"></div>';
    Array.prototype.forEach.call(root.querySelectorAll('.fin-tabs button'), function (b) {
      if (b.dataset.t === tab) b.classList.add('active');
      b.onclick = function () { tab = b.dataset.t; render(); };
    });
    var p = document.getElementById('gjPanel');
    if (tab === 'access') renderAccess(p); else renderMembers(p);
  }

  /* ── 권한 관리: 가입 회원에게 관리자/재정권한 부여 ── */
  function renderAccess(panel) {
    loading(panel);
    WPF.call('listAccess').then(function (r) {
      var users = (r.users || []).sort(function (a, b) { return (b.isAdmin - a.isAdmin) || (b.canFinance - a.canFinance) || String(a.name).localeCompare(String(b.name), 'ko'); });
      panel.innerHTML = '<div class="fin-card"><p style="color:var(--ink-soft);font-size:.88rem;margin-bottom:12px">홈페이지에 가입한 회원입니다. 체크하면 즉시 권한이 부여됩니다. <b>관리자</b>는 이 교적관리·전체 기능, <b>재정권한</b>은 재정관리 페이지에 접근할 수 있습니다.</p>' +
        '<div style="overflow:auto"><table class="fin-table"><thead><tr><th>이름</th><th>이메일</th><th>회원</th><th style="text-align:center">관리자</th><th style="text-align:center">재정권한</th></tr></thead><tbody>' +
        users.map(function (u) {
          return '<tr data-uid="' + esc(u.uid) + '"><td><b>' + esc(u.name || '(이름없음)') + '</b></td><td style="color:var(--ink-soft)">' + esc(u.email) + '</td>' +
            '<td>' + (u.status === '정회원' ? '<span class="fin-pill in">정회원</span>' : '<span class="fin-pill out">준회원</span>') + '</td>' +
            '<td style="text-align:center"><input type="checkbox" class="ck-admin" ' + (u.isAdmin ? 'checked' : '') + '></td>' +
            '<td style="text-align:center"><input type="checkbox" class="ck-fin" ' + (u.canFinance ? 'checked' : '') + '></td></tr>';
        }).join('') + '</tbody></table></div><p class="help" id="gj_msg" style="margin-top:10px"></p></div>';
      Array.prototype.forEach.call(panel.querySelectorAll('tr[data-uid]'), function (tr) {
        var uid = tr.getAttribute('data-uid');
        var ckA = tr.querySelector('.ck-admin'), ckF = tr.querySelector('.ck-fin');
        var msg = panel.querySelector('#gj_msg');
        function save(field, val, cb) {
          var body = { targetUid: uid }; body[field] = val;
          msg.style.color = 'var(--ink-soft)'; msg.textContent = '저장 중…';
          WPF.call('setAccess', body).then(function () { msg.style.color = 'green'; msg.textContent = '✓ 저장됨'; })
            .catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = '오류: ' + e.message; if (cb) cb(); });
        }
        ckA.addEventListener('change', function () { save('isAdmin', ckA.checked, function () { ckA.checked = !ckA.checked; }); });
        ckF.addEventListener('change', function () { save('canFinance', ckF.checked, function () { ckF.checked = !ckF.checked; }); });
      });
    }).catch(function (e) {
      if (/unknown action/i.test(e.message)) root.innerHTML = msgCard('백엔드 업데이트 필요', 'Apps Script를 최신본으로 다시 배포해 주세요. (관리·교적관리 기능이 추가됨)');
      else if (e.message.indexOf('관리자') >= 0) root.innerHTML = msgCard('접근 권한이 없습니다', '교적관리는 관리자만 이용할 수 있습니다.');
      else root.innerHTML = msgCard('오류', e.message);
    });
  }

  /* ── 교적 명단 ── */
  function renderMembers(panel) {
    loading(panel);
    WPF.call('listGyojeok').then(function (r) {
      var ms = (r.members || []).filter(function (m) { return m['이름']; });
      // 세대주별 묶음(가나다), 세대주 먼저
      ms.sort(function (a, b) { var ha = a['세대주'] || a['이름'], hb = b['세대주'] || b['이름']; if (ha !== hb) return ha.localeCompare(hb, 'ko'); return (a['이름'] === ha ? -1 : 1) - (b['이름'] === hb ? -1 : 1); });
      var couples = ms.filter(function (m) { return m['배우자']; }).length / 2;
      panel.innerHTML = '<div class="fin-card"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><b>교적 명단 (' + ms.length + '명)</b><span style="color:var(--ink-soft);font-size:.85rem">부부 ' + Math.round(couples) + '쌍</span></div><div style="overflow:auto;max-height:640px"><table class="fin-table"><thead><tr><th>이름</th><th>생년월일</th><th>세대주</th><th>관계</th><th>배우자</th><th>그룹</th><th>직책</th><th>휴대폰</th></tr></thead><tbody>' +
        ms.map(function (m) { var isHead = (m['세대주'] || m['이름']) === m['이름']; return '<tr' + (isHead ? ' style="background:#f7faff"' : '') + '><td><b>' + esc(m['이름']) + '</b></td><td>' + esc(birthOf(m)) + '</td><td>' + esc(m['세대주'] || '') + '</td><td>' + esc(m['관계'] || '') + '</td><td>' + (m['배우자'] ? '💑 ' + esc(m['배우자']) : '') + '</td><td>' + esc(m['그룹']) + '</td><td>' + esc(m['직책']) + '</td><td>' + esc(fmtPhone(m['휴대폰'])) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    }).catch(function (e) {
      panel.innerHTML = msgCard('조회 실패', e.message);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
