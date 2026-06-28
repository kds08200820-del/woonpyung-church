/* affairs.js — 행정관리(관리자 전용): 심방관리 · 상담관리
 * 데이터는 Supabase(visitations/counsels, 관리자 RLS)에 저장.
 * 콘솔: [affairs.js] v20260701aa
 */
console.log('[affairs.js] v20260701aa');

(function () {
  var root = document.getElementById('afRoot');
  if (!root) return;
  var SB = window.SUPABASE_URL, AK = window.SUPABASE_ANON_KEY;

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pad2 = function (n) { return ('0' + n).slice(-2); };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  var fmtD = function (d) { return String(d == null ? '' : d).slice(0, 10); };
  var nl2br = function (s) { return esc(s).replace(/\n/g, '<br>'); };
  function msgCard(t, x) { return '<div class="fin-card" style="text-align:center;padding:40px 18px;"><h3 style="margin:0 0 8px;color:var(--accent,#032257);">' + esc(t) + '</h3><p style="color:var(--ink-soft,#7b8794);">' + esc(x) + '</p></div>'; }

  // ── 교적 연동(대상자 자동완성·관계 표시) ──
  var MEMBERS = [], membersLoaded = false;
  function ymd(v) { return String(v == null ? '' : v).slice(0, 10); }
  function findMember(key) { if (!key) return null; for (var i = 0; i < MEMBERS.length; i++) if (String(MEMBERS[i].key) === String(key)) return MEMBERS[i]; return null; }
  // 교적은 구글시트에만 있으므로 Apps Script API(listGyojeok, 관리자 권한)로 1회 로드
  function loadMembers() {
    if (membersLoaded || !window.WPF || !window.FINANCE_API_URL) return;
    WPF.call('listGyojeok').then(function (r) {
      MEMBERS = (r.members || []).map(function (m) {
        return { name: m['이름'], key: m['매칭키'], birth: ymd(m['생년월일']),
                 role: m['직책'] || '', group: m['그룹'] || m['소속그룹'] || '', head: m['세대주'] || '', rel: m['관계'] || '', spouse: m['배우자'] || '' };
      }).filter(function (m) { return m.name; });
      membersLoaded = true;
    }).catch(function () { /* 연동 실패 시 자동완성만 비활성, 이름 직접입력은 정상 동작 */ });
  }
  // 교적 매칭 정보를 한 줄로 요약(직책·구역·세대)
  function memberLine(m) {
    if (!m) return '';
    var bits = [];
    if (m.role) bits.push(m.role);
    if (m.group) bits.push(m.group);
    if (m.head && m.head !== m.name) bits.push(m.head + '의 가정');
    if (m.birth) bits.push(m.birth);
    return bits.join(' · ');
  }

  function sess() {
    try {
      var ref = (SB || '').match(/https:\/\/([^.]+)\./)[1];
      var raw = localStorage.getItem('sb-' + ref + '-auth-token');
      if (!raw) return null;
      var s = JSON.parse(raw); s = (s && s.currentSession) ? s.currentSession : s;
      return { uid: s && s.user && s.user.id, token: s && s.access_token };
    } catch (e) { return null; }
  }
  function api(method, path, body, prefer) {
    var s = sess(); var h = { apikey: AK, 'Content-Type': 'application/json' };
    if (s && s.token) h.Authorization = 'Bearer ' + s.token;
    if (prefer) h.Prefer = prefer;
    var opt = { method: method, headers: h };
    if (body) opt.body = JSON.stringify(body);
    return fetch(SB + '/rest/v1/' + path, opt).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); });
      return (r.status === 204) ? null : r.json();
    });
  }

  // ── 레코드 유형 정의 ──
  var TYPES = {
    visit: {
      table: 'visitations', name: '심방', dateCol: 'visit_date',
      fields: [
        { k: 'visit_date', label: '일자', type: 'date' },
        { k: 'member_name', label: '대상자', type: 'text', ph: '이름' },
        { k: 'category', label: '심방 종류', type: 'select', opts: ['일반심방', '병원심방', '구역심방', '새가족심방', '임종/장례', '경조사', '기타'] },
        { k: 'location', label: '장소', type: 'text', ph: '예: 자택, ○○병원' },
        { k: 'pastor', label: '심방자', type: 'text', ph: '예: 김동석 목사' },
        { k: 'content', label: '심방 내용', type: 'textarea', full: true }
      ],
      cols: [['visit_date', '일자'], ['member_name', '대상자'], ['category', '종류'], ['location', '장소'], ['pastor', '심방자'], ['content', '내용']]
    },
    counsel: {
      table: 'counsels', name: '상담', dateCol: 'counsel_date',
      fields: [
        { k: 'counsel_date', label: '일자', type: 'date' },
        { k: 'member_name', label: '대상자', type: 'text', ph: '이름' },
        { k: 'category', label: '분류', type: 'select', opts: ['신앙', '가정', '부부', '자녀', '진로/직업', '대인관계', '재정', '정서/심리', '기타'] },
        { k: 'counselor', label: '상담자', type: 'text', ph: '예: 김동석 목사' },
        { k: 'content', label: '상담 내용', type: 'textarea', full: true },
        { k: 'followup', label: '후속 조치', type: 'textarea', full: true },
        { k: 'is_private', label: '비공개(민감)', type: 'check' }
      ],
      cols: [['counsel_date', '일자'], ['member_name', '대상자'], ['category', '분류'], ['counselor', '상담자'], ['content', '내용']]
    }
  };

  var tab = 'visit';
  function render() {
    root.innerHTML = '<div class="fin-tabs"><button data-t="visit">심방관리</button><button data-t="counsel">상담관리</button></div><div id="afPanel"></div>';
    Array.prototype.forEach.call(root.querySelectorAll('.fin-tabs button'), function (b) {
      if (b.dataset.t === tab) b.classList.add('active');
      b.onclick = function () { tab = b.dataset.t; render(); };
    });
    renderManager(document.getElementById('afPanel'), TYPES[tab]);
  }

  function fieldHTML(f, val) {
    var v = val == null ? '' : val;
    var inner;
    if (f.type === 'select') inner = '<select data-k="' + f.k + '"><option value="">선택</option>' + f.opts.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
    else if (f.type === 'textarea') inner = '<textarea data-k="' + f.k + '" placeholder="' + esc(f.ph || '') + '">' + esc(v) + '</textarea>';
    else if (f.type === 'check') inner = '<label class="sw" style="display:inline-flex;align-items:center;gap:6px;margin-top:6px"><input type="checkbox" data-k="' + f.k + '"' + (v ? ' checked' : '') + '> 예</label>';
    else inner = '<input type="' + (f.type === 'date' ? 'date' : 'text') + '" data-k="' + f.k + '" value="' + esc(v) + '" placeholder="' + esc(f.ph || '') + '">';
    return '<div class="af-field' + (f.full ? ' full' : '') + '" style="' + (f.full ? 'grid-column:1/-1' : '') + '"><label>' + esc(f.label) + '</label>' + inner + '</div>';
  }

  function collect(formEl, type) {
    var rec = {};
    type.fields.forEach(function (f) {
      var el = formEl.querySelector('[data-k="' + f.k + '"]');
      if (!el) return;
      if (f.type === 'check') rec[f.k] = !!el.checked;
      else rec[f.k] = el.value.trim() === '' ? null : el.value.trim();
    });
    return rec;
  }

  // 대상자 입력에 교적 자동완성 + 매칭키(관계) 연결을 부착
  function setupMemberLink(form) {
    var input = form.querySelector('[data-k="member_name"]');
    if (!input) return { clear: function () {}, setByKey: function () {} };
    input.setAttribute('autocomplete', 'off');
    var field = input.closest('.af-field'); if (field) field.style.position = 'relative';
    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:.78rem;margin-top:5px;min-height:1.1em;';
    if (field) field.appendChild(hint);
    var pop = null, hi = -1, matches = [];
    function close() { if (pop) { pop.remove(); pop = null; hi = -1; } }
    function showHint(m) {
      if (m) { var line = memberLine(m); hint.style.color = '#1e874b'; hint.innerHTML = '🔗 교적 연결: <b>' + esc(m.name) + '</b>' + (line ? ' <span style="color:#5b6b7d">· ' + esc(line) + '</span>' : ''); }
      else if (input.value.trim()) { hint.style.color = '#9aa5b1'; hint.innerHTML = '교적 미연결 — 이름만 저장됩니다(검색해서 연결 권장).'; }
      else { hint.innerHTML = ''; }
    }
    function setKey(m) { input.dataset.memberKey = (m && m.key) || ''; showHint(m); }
    function pick(m) { input.value = m.name; close(); setKey(m); }
    input.addEventListener('input', function () {
      input.dataset.memberKey = ''; var q = input.value.trim().toLowerCase(); close(); showHint(null);
      if (!q || !MEMBERS.length) return;
      matches = MEMBERS.filter(function (m) { return (m.name || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 8);
      if (!matches.length) return;
      pop = document.createElement('div'); pop.className = 'fin-sugg';
      matches.forEach(function (m) {
        var d = document.createElement('div'); var line = memberLine(m);
        d.innerHTML = esc(m.name) + (line ? ' <span style="color:#9aa5b1;font-size:.78rem">' + esc(line) + '</span>' : '');
        d.onclick = function () { pick(m); };
        pop.appendChild(d);
      });
      if (field) field.appendChild(pop);
    });
    input.addEventListener('keydown', function (e) {
      if (!pop) return; var rows = pop.querySelectorAll('div');
      if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hi + 1, rows.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(hi - 1, 0); }
      else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(matches[hi]); return; }
      else if (e.key === 'Escape') { close(); return; }
      else return;
      Array.prototype.forEach.call(rows, function (r, i) { r.classList.toggle('hi', i === hi); });
    });
    input.addEventListener('blur', function () { setTimeout(close, 180); });
    return {
      clear: function () { input.dataset.memberKey = ''; hint.innerHTML = ''; close(); },
      setByKey: function (key, name) {
        if (name != null) input.value = name;
        input.dataset.memberKey = key || '';
        var m = findMember(key);
        if (m) showHint(m);
        else if (key) { hint.style.color = '#1e874b'; hint.innerHTML = '🔗 교적 연결됨'; }
        else showHint(null);
      }
    };
  }

  function renderManager(panel, type) {
    panel.innerHTML =
      '<div class="fin-card"><h3 style="margin:0 0 12px;color:var(--accent,#032257)">' + type.name + ' 기록 추가</h3>' +
      '<form id="afForm"><div class="fin-grid">' + type.fields.map(function (f) { return fieldHTML(f, f.type === 'date' ? today() : ''); }).join('') + '</div>' +
      '<div style="margin-top:14px;display:flex;gap:10px;align-items:center"><button type="submit" class="btn btn-solid" id="af_save">＋ 추가</button><button type="button" class="btn btn-line" id="af_reset" style="display:none">취소</button><span class="fin-msg" id="af_msg"></span></div></form></div>' +
      '<div id="afList"><p class="qt-loading">불러오는 중…</p></div>';

    var form = panel.querySelector('#afForm');
    var msg = panel.querySelector('#af_msg');
    var resetBtn = panel.querySelector('#af_reset');
    var linkCtl = setupMemberLink(form);
    var editId = null;
    function clearForm() {
      editId = null; resetBtn.style.display = 'none'; panel.querySelector('#af_save').textContent = '＋ 추가';
      type.fields.forEach(function (f) { var el = form.querySelector('[data-k="' + f.k + '"]'); if (!el) return; if (f.type === 'check') el.checked = false; else el.value = (f.type === 'date') ? today() : ''; });
      linkCtl.clear();
    }
    resetBtn.onclick = clearForm;
    form.onsubmit = function (e) {
      e.preventDefault();
      var rec = collect(form, type);
      var nme = form.querySelector('[data-k="member_name"]');
      rec.member_key = (nme && nme.dataset.memberKey) ? nme.dataset.memberKey : null; // 교적 매칭키(관계 연결)
      if (!rec[type.dateCol] || !rec.member_name) { msg.style.color = '#c0392b'; msg.textContent = '일자와 대상자는 필수입니다.'; return; }
      msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
      var p = editId
        ? api('PATCH', type.table + '?id=eq.' + editId, rec, 'return=minimal')
        : api('POST', type.table, rec, 'return=minimal');
      p.then(function () { msg.style.color = 'green'; msg.textContent = '✓ 저장되었습니다'; clearForm(); loadList(); setTimeout(function () { msg.textContent = ''; }, 2500); })
        .catch(function (err) { msg.style.color = '#c0392b'; msg.textContent = '저장 실패: ' + err.message; });
    };

    var listBox = panel.querySelector('#afList');
    function loadList() {
      api('GET', type.table + '?select=*&order=' + type.dateCol + '.desc,created_at.desc').then(function (rows) {
        rows = rows || [];
        if (!rows.length) { listBox.innerHTML = '<div class="fin-card"><p style="color:var(--ink-soft);margin:0">등록된 ' + type.name + ' 기록이 없습니다.</p></div>'; return; }
        var byId = {}; rows.forEach(function (r) { byId[r.id] = r; });
        listBox.innerHTML = '<div class="fin-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>' + type.name + ' 기록 (' + rows.length + '건)</b><button class="btn btn-line" style="padding:4px 12px;font-size:.8rem" data-bulk>🗑 선택 삭제</button></div><div style="overflow:auto"><table class="fin-table"><thead><tr><th style="width:28px;text-align:center"><input type="checkbox" data-all></th>' +
          type.cols.map(function (c) { return '<th>' + esc(c[1]) + '</th>'; }).join('') + '<th>관리</th></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td style="text-align:center"><input type="checkbox" class="rowck" value="' + esc(r.id) + '"></td>' +
              type.cols.map(function (c) {
                var k = c[0], val = r[k];
                if (k === type.dateCol) return '<td style="white-space:nowrap">' + esc(fmtD(val)) + '</td>';
                if (k === 'member_name') { var mm = findMember(r.member_key); var badge = mm ? ' <span class="fin-pill" style="background:#e8f6ee;color:#1e874b">🔗 ' + esc(mm.role || mm.group || '교적') + '</span>' : (r.member_key ? ' <span class="fin-pill" style="background:#e8f6ee;color:#1e874b">🔗</span>' : ''); return '<td style="white-space:nowrap">' + esc(val || '') + badge + '</td>'; }
                if (k === 'category') return '<td><span class="fin-pill">' + esc(val || '') + '</span></td>';
                if (k === 'content') return '<td style="max-width:320px;white-space:normal;color:#48576b">' + nl2br(String(val || '').slice(0, 140)) + (String(val || '').length > 140 ? '…' : '') + (r.is_private ? ' <span class="fin-pill" style="background:#fdecea;color:#c0392b">비공개</span>' : '') + '</td>';
                return '<td style="white-space:nowrap">' + esc(val || '') + '</td>';
              }).join('') +
              '<td style="white-space:nowrap"><button class="btn btn-line" style="padding:3px 9px;font-size:.78rem" data-edit="' + esc(r.id) + '">수정</button> <button class="btn btn-line" style="padding:3px 9px;font-size:.78rem" data-del="' + esc(r.id) + '">삭제</button></td></tr>';
          }).join('') + '</tbody></table></div></div>';

        // 전체선택 + 일괄삭제
        var allck = listBox.querySelector('[data-all]');
        if (allck) allck.onclick = function () { Array.prototype.forEach.call(listBox.querySelectorAll('.rowck'), function (c) { c.checked = allck.checked; }); };
        listBox.querySelector('[data-bulk]').onclick = function () {
          var ids = Array.prototype.map.call(listBox.querySelectorAll('.rowck:checked'), function (c) { return c.value; });
          if (!ids.length) { alert('선택된 항목이 없습니다.'); return; }
          if (!confirm('선택한 ' + ids.length + '건을 삭제할까요?')) return;
          api('DELETE', type.table + '?id=in.(' + ids.join(',') + ')', null, 'return=minimal').then(loadList).catch(function (e) { alert('삭제 실패: ' + e.message); });
        };
        // 개별 수정/삭제
        Array.prototype.forEach.call(listBox.querySelectorAll('[data-edit]'), function (b) {
          b.onclick = function () {
            var r = byId[b.dataset.edit]; if (!r) return;
            editId = r.id; resetBtn.style.display = ''; panel.querySelector('#af_save').textContent = '저장(수정)';
            type.fields.forEach(function (f) { var el = form.querySelector('[data-k="' + f.k + '"]'); if (!el) return; if (f.type === 'check') el.checked = !!r[f.k]; else el.value = (f.type === 'date') ? fmtD(r[f.k]) : (r[f.k] == null ? '' : r[f.k]); });
            linkCtl.setByKey(r.member_key, r.member_name);
            panel.scrollIntoView({ behavior: 'smooth' });
          };
        });
        Array.prototype.forEach.call(listBox.querySelectorAll('[data-del]'), function (b) {
          b.onclick = function () { if (!confirm('삭제할까요?')) return; api('DELETE', type.table + '?id=eq.' + b.dataset.del, null, 'return=minimal').then(loadList).catch(function (e) { alert('삭제 실패: ' + e.message); }); };
        });
      }).catch(function (e) {
        if (/relation .* does not exist|42P01|PGRST205|schema cache|Could not find the table/i.test(e.message)) listBox.innerHTML = msgCard('테이블 준비 필요', 'Supabase → SQL Editor 에서 supabase/affairs.sql 을 1회 실행해 주세요(visitations·counsels 테이블 생성).');
        else listBox.innerHTML = msgCard('조회 실패', e.message);
      });
    }
    loadList();
  }

  // ── 부팅: 로그인 + 관리자 확인 ──
  var tries = 0;
  function boot() {
    if (!SB) { root.innerHTML = msgCard('준비 중', 'Supabase 설정이 없습니다.'); return; }
    var s = sess();
    if (!s || !s.uid || !s.token) {
      if (tries++ < 20) { setTimeout(boot, 400); return; }
      root.innerHTML = msgCard('로그인이 필요합니다', '상단에서 로그인 후 이용해 주세요.'); return;
    }
    api('GET', 'admins?uid=eq.' + s.uid + '&select=uid').then(function (rows) {
      if (!rows || !rows.length) { root.innerHTML = msgCard('접근 권한이 없습니다', '행정관리는 관리자만 이용할 수 있습니다.'); return; }
      loadMembers();
      render();
    }).catch(function (e) { root.innerHTML = msgCard('오류', e.message); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
