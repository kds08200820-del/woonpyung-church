/* gyojeok.js — 교적관리(관리자 전용): 권한관리 + 교적명단
 * 콘솔: [gyojeok.js] v20260701e
 */
console.log('[gyojeok.js] v20260701e');

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
  var ALL = [];
  function renderMembers(panel) {
    loading(panel);
    WPF.call('listGyojeok').then(function (r) {
      var ms = (r.members || []).filter(function (m) { return m['이름']; });
      ms.sort(function (a, b) { var ha = a['세대주'] || a['이름'], hb = b['세대주'] || b['이름']; if (ha !== hb) return ha.localeCompare(hb, 'ko'); return (a['이름'] === ha ? -1 : 1) - (b['이름'] === hb ? -1 : 1); });
      ALL = ms;
      var couples = ms.filter(function (m) { return m['배우자']; }).length / 2;
      panel.innerHTML = '<div class="fin-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px;flex-wrap:wrap"><b>교적 명단 (' + ms.length + '명)</b><input type="text" id="gj_search" placeholder="🔍 이름 검색" style="padding:7px 11px;border:1px solid #cdd7e3;border-radius:8px;font:inherit;flex:1;min-width:140px;max-width:260px"><span style="color:var(--ink-soft);font-size:.85rem">부부 ' + Math.round(couples) + '쌍</span></div><p style="color:var(--ink-soft);font-size:.83rem;margin-bottom:8px">이름을 클릭하면 개인 신상을 볼 수 있습니다.</p><div style="overflow:auto;max-height:640px"><table class="fin-table"><thead><tr><th>이름</th><th>생년월일</th><th>세대주</th><th>관계</th><th>배우자</th><th>그룹</th><th>직책</th><th>휴대폰</th></tr></thead><tbody id="gj_tbody"></tbody></table></div></div>';
      var tbody = panel.querySelector('#gj_tbody');
      function draw(q) {
        q = (q || '').trim();
        var rows = q ? ms.filter(function (m) { return String(m['이름']).indexOf(q) >= 0; }) : ms;
        tbody.innerHTML = rows.map(function (m) { var isHead = (m['세대주'] || m['이름']) === m['이름']; return '<tr' + (isHead ? ' style="background:#f7faff"' : '') + '><td><a href="#" class="gj-name" data-key="' + esc(m['매칭키']) + '" style="color:var(--accent,#032257);font-weight:700;text-decoration:none;border-bottom:1px dashed #9ab">' + esc(m['이름']) + '</a></td><td>' + esc(birthOf(m)) + '</td><td>' + esc(m['세대주'] || '') + '</td><td>' + esc(m['관계'] || '') + '</td><td>' + (m['배우자'] ? '💑 ' + esc(m['배우자']) : '') + '</td><td>' + esc(m['그룹']) + '</td><td>' + esc(m['직책']) + '</td><td>' + esc(fmtPhone(m['휴대폰'])) + '</td></tr>'; }).join('');
        Array.prototype.forEach.call(tbody.querySelectorAll('.gj-name'), function (a) { a.onclick = function (e) { e.preventDefault(); var m = ms.filter(function (x) { return String(x['매칭키']) === a.dataset.key; })[0]; if (m) showDetail(m); }; });
      }
      draw('');
      panel.querySelector('#gj_search').addEventListener('input', function () { draw(this.value); });
    }).catch(function (e) {
      panel.innerHTML = msgCard('조회 실패', e.message);
    });
  }

  /* ── 개인 신상 상세(클릭 시 모달, 보기/수정/사진) ── */
  // 수정 가능한 항목(라벨 → 교적 열 이름)
  var EDIT_FIELDS = [
    ['이름', '이름', 'text'], ['생년월일', '생년월일', 'birth'], ['성별', '성별', 'sex'],
    ['휴대폰', '휴대폰', 'tel'], ['신급', '신급', 'text'], ['직책', '직책', 'text'],
    ['세례일', '세례일', 'date'], ['임직일', '임직일', 'date'],
    ['세대주', '세대주', 'text'], ['세대주와 관계', '관계', 'text'], ['배우자', '배우자', 'text'],
    ['구역/부서', '그룹', 'text'], ['회원상태', '회원상태', 'text'], ['주소', '주소', 'text']
  ];
  var GROUP_PRESET = ['여전도회', '권사회', '남전도회', '구제선교위원회', '성가대', '찬양대'];
  function groupsOf(m) { return String(m['소속그룹'] || '').split(/[,·]/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function photoUrl(m) { return m['사진'] || ''; }
  function avatar(m, size) {
    var u = photoUrl(m); size = size || 84;
    if (u) return '<img src="' + esc(u) + '" alt="" style="width:' + size + 'px;height:' + size + 'px;border-radius:12px;object-fit:cover;border:1px solid #e3e7ee">';
    return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:12px;background:#eef2f7;display:flex;align-items:center;justify-content:center;color:#9aa5b1;font-size:1.6rem;border:1px solid #e3e7ee">👤</div>';
  }
  function showDetail(m) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:24px 16px;overflow:auto';
    ov.innerHTML = '<div class="fin-card" id="gd_box" style="max-width:580px;width:100%;background:#fff;margin:auto"></div>';
    document.body.appendChild(ov);
    var box = ov.querySelector('#gd_box');
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

    function viewMode(cur) {
      var head = cur['세대주'] || cur['이름'];
      var family = ALL.filter(function (x) { return (x['세대주'] || x['이름']) === head; });
      function row(label, val) { return val ? '<div style="display:flex;padding:7px 0;border-bottom:1px solid #f0f3f7"><div style="flex:0 0 96px;color:#7b8794;font-size:.85rem">' + esc(label) + '</div><div style="flex:1;font-size:.92rem">' + esc(val) + '</div></div>' : ''; }
      var age = '', bd = (String(cur['매칭키'] || '').split('|')[1]) || '';
      if (bd.length === 8) { var y = Number(bd.slice(0, 4)); if (y) age = (new Date().getFullYear() - y + 1) + '세'; }
      var famRows = family.map(function (f) { var isMe = f['매칭키'] === cur['매칭키']; return '<tr' + (isMe ? ' style="background:#eef4ff"' : '') + '><td><a href="#" class="gd-fam" data-key="' + esc(f['매칭키']) + '" style="color:var(--accent,#032257);text-decoration:none;font-weight:600">' + esc(f['이름']) + '</a></td><td>' + esc(f['관계'] || '') + '</td><td>' + esc(birthOf(f)) + '</td><td>' + esc(f['직책'] || '') + '</td></tr>'; }).join('');
      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:14px">' +
        '<div style="display:flex;gap:14px;align-items:center">' + avatar(cur, 84) + '<div><h3 style="margin:0;color:var(--accent,#032257)">' + esc(cur['이름']) + (cur['직책'] ? ' <span style="font-size:.8rem;color:#7b8794">' + esc(cur['직책']) + '</span>' : '') + '</h3><div style="color:#7b8794;font-size:.85rem;margin-top:3px">' + esc(cur['그룹'] || '') + (cur['세대주'] ? ' · ' + esc(cur['세대주']) + '의 가정' : '') + '</div></div></div>' +
        '<div style="display:flex;gap:6px"><button class="btn btn-solid" id="gd_edit" style="padding:4px 14px">수정</button><button class="btn btn-line" id="gd_close" style="padding:4px 12px">닫기</button></div></div>' +
        '<div style="display:flex;gap:18px;flex-wrap:wrap"><div style="flex:1;min-width:240px">' +
        row('생년월일', birthOf(cur) + (age ? ' (' + age + ')' : '')) + row('성별', cur['성별']) + row('휴대폰', fmtPhone(cur['휴대폰'])) + row('신급', cur['신급']) + row('세례일', cur['세례일']) +
        '</div><div style="flex:1;min-width:240px">' +
        row('세대주', cur['세대주']) + row('세대주와 관계', cur['관계']) + row('배우자', cur['배우자']) + row('회원상태', cur['회원상태']) + row('임직일', cur['임직일']) +
        '</div></div>' + (cur['주소'] ? row('주소', cur['주소']) : '') + (groupsOf(cur).length ? '<div style="margin-top:12px"><div style="color:#7b8794;font-size:.85rem;margin-bottom:5px">소속 그룹</div>' + groupsOf(cur).map(function (g) { return '<span class="fin-pill" style="background:#e8f0fb;color:#2b5797;margin:0 6px 6px 0;display:inline-block">' + esc(g) + '</span>'; }).join('') + '</div>' : '') +
        '<div style="margin-top:16px"><b style="color:var(--accent,#032257)">가족 관계</b><div style="overflow:auto;margin-top:6px"><table class="fin-table" style="font-size:.86rem"><thead><tr><th>이름</th><th>관계</th><th>생년월일</th><th>직책</th></tr></thead><tbody>' + famRows + '</tbody></table></div></div>';
      box.querySelector('#gd_close').onclick = close;
      box.querySelector('#gd_edit').onclick = function () { editMode(cur); };
      Array.prototype.forEach.call(box.querySelectorAll('.gd-fam'), function (a) { a.onclick = function (e) { e.preventDefault(); var f = ALL.filter(function (x) { return String(x['매칭키']) === a.dataset.key; })[0]; if (f) viewMode(f); }; });
    }

    function editMode(cur) {
      var curGroups = groupsOf(cur);
      var extraGroups = curGroups.filter(function (g) { return GROUP_PRESET.indexOf(g) < 0; }).join(', ');
      function inp(label, col, type) {
        var v = (col === '생년월일') ? birthOf(cur) : (cur[col] == null ? '' : cur[col]);
        var ctrl;
        if (type === 'sex') ctrl = '<select data-col="' + col + '"><option value=""></option><option' + (v === '남' ? ' selected' : '') + '>남</option><option' + (v === '여' ? ' selected' : '') + '>여</option></select>';
        else ctrl = '<input type="text" data-col="' + col + '" value="' + esc(v) + '"' + (type === 'tel' ? ' inputmode="numeric"' : '') + (type === 'birth' ? ' placeholder="예: 1981-08-19"' : '') + '>';
        return '<div class="af-field"><label>' + esc(label) + '</label>' + ctrl + '</div>';
      }
      box.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h3 style="margin:0;color:var(--accent,#032257)">교적 수정 — ' + esc(cur['이름']) + '</h3><button class="btn btn-line" id="gd_cancel" style="padding:4px 12px">취소</button></div>' +
        '<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px">' +
        '<div style="text-align:center"><div id="gd_photo">' + avatar(cur, 96) + '</div><div style="margin-top:8px"><input type="file" id="gd_file" accept="image/*" style="display:none"><button type="button" class="btn btn-line" id="gd_upbtn" style="padding:4px 10px;font-size:.8rem">📷 사진 선택</button></div><input type="hidden" data-col="사진" id="gd_photourl" value="' + esc(photoUrl(cur)) + '"><div id="gd_upmsg" style="font-size:.76rem;color:#7b8794;margin-top:4px"></div></div>' +
        '<div class="fin-grid" style="flex:1;min-width:260px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">' +
        EDIT_FIELDS.map(function (f) { return inp(f[0], f[1], f[2]); }).join('') +
        '</div></div>' +
        '<div style="margin-bottom:12px;border-top:1px solid #eef1f5;padding-top:12px"><label style="display:block;font-size:.8rem;color:#7b8794;margin-bottom:7px">소속 그룹 (여러 개 선택 가능)</label><div style="display:flex;flex-wrap:wrap;gap:8px 16px">' +
        GROUP_PRESET.map(function (g) { return '<label class="sw"><input type="checkbox" class="gd-grp" value="' + esc(g) + '"' + (curGroups.indexOf(g) >= 0 ? ' checked' : '') + '> ' + esc(g) + '</label>'; }).join('') +
        '</div><input type="text" id="gd_grp_extra" placeholder="기타 그룹 추가 (쉼표로 구분)" value="' + esc(extraGroups) + '" style="margin-top:9px;width:100%;padding:8px 10px;border:1px solid #dfe5ee;border-radius:8px;font:inherit"></div>' +
        '<div style="display:flex;gap:10px;align-items:center;margin-top:6px"><button class="btn btn-solid" id="gd_save">저장</button><span class="fin-msg" id="gd_msg"></span></div>' +
        '<p class="help" style="margin-top:8px">※ 이름·생년월일을 바꾸면 매칭키가 갱신됩니다(이전에 입력된 헌금 연결은 그대로 유지).</p>';
      box.querySelector('#gd_cancel').onclick = function () { viewMode(cur); };
      // 사진 업로드
      var fileInp = box.querySelector('#gd_file'), upmsg = box.querySelector('#gd_upmsg'), purl = box.querySelector('#gd_photourl');
      box.querySelector('#gd_upbtn').onclick = function () { fileInp.click(); };
      fileInp.onchange = function () {
        var f = fileInp.files && fileInp.files[0]; if (!f) return;
        if (!window.ChurchUpload || !ChurchUpload.isReady()) { upmsg.style.color = '#c0392b'; upmsg.textContent = '업로드 서버 미설정 — URL 직접 입력은 추후 지원'; return; }
        upmsg.style.color = '#7b8794'; upmsg.textContent = '업로드 중…';
        ChurchUpload.upload(f, { folder: 'gyojeok' }).then(function (r) { purl.value = r.url; box.querySelector('#gd_photo').innerHTML = '<img src="' + esc(r.url) + '" style="width:96px;height:96px;border-radius:12px;object-fit:cover;border:1px solid #e3e7ee">'; upmsg.style.color = 'green'; upmsg.textContent = '✓ 사진 업로드됨'; }).catch(function (e) { upmsg.style.color = '#c0392b'; upmsg.textContent = '업로드 실패: ' + e.message; });
      };
      box.querySelector('#gd_save').onclick = function () {
        var fields = {};
        Array.prototype.forEach.call(box.querySelectorAll('[data-col]'), function (el) { fields[el.dataset.col] = el.value.trim(); });
        // 소속 그룹: 체크된 프리셋 + 기타입력 병합(중복 제거)
        var gset = [];
        Array.prototype.forEach.call(box.querySelectorAll('.gd-grp:checked'), function (c) { if (gset.indexOf(c.value) < 0) gset.push(c.value); });
        (box.querySelector('#gd_grp_extra').value || '').split(/[,·]/).forEach(function (s) { s = s.trim(); if (s && gset.indexOf(s) < 0) gset.push(s); });
        fields['소속그룹'] = gset.join(', ');
        var msg = box.querySelector('#gd_msg');
        if (!fields['이름']) { msg.style.color = '#c0392b'; msg.textContent = '이름은 필수입니다.'; return; }
        msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
        WPF.call('updateGyojeok', { id: cur['교적ID'], fields: fields }).then(function () {
          // 로컬 갱신
          Object.keys(fields).forEach(function (k) { cur[k] = fields[k]; });
          if (fields['이름'] || fields['생년월일']) { var b = String(fields['생년월일'] || birthOf(cur)).replace(/[^0-9]/g, '').slice(0, 8); cur['매칭키'] = String(fields['이름'] || cur['이름']).trim() + '|' + b; }
          msg.style.color = 'green'; msg.textContent = '✓ 저장되었습니다';
          setTimeout(function () { renderMembers(document.getElementById('gjPanel')); viewMode(cur); }, 500);
        }).catch(function (e) {
          if (/unknown action/i.test(e.message)) { msg.style.color = '#c0392b'; msg.textContent = '교적 수정은 Apps Script 재배포 후 가능합니다.'; }
          else { msg.style.color = '#c0392b'; msg.textContent = '저장 실패: ' + e.message; }
        });
      };
    }

    viewMode(m);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
