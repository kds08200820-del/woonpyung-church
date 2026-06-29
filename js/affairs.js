/* affairs.js — 행정관리(관리자 전용): 심방관리 · 상담관리
 * 데이터는 Supabase(visitations/counsels, 관리자 RLS)에 저장.
 * 콘솔: [affairs.js] v20260701cw
 */
console.log('[affairs.js] v20260701cw');

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
      // return=minimal 의 POST 는 201(빈 본문), PATCH/DELETE 는 204 → 본문 유무로 안전 파싱
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
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
    },
    edu: {
      table: 'edu_records', name: '교육', dateCol: 'edu_date',
      fields: [
        { k: 'edu_date', label: '일자', type: 'date' },
        { k: 'title', label: '교육명', type: 'text', ph: '예: 새가족반 3주차' },
        { k: 'target', label: '대상/부서', type: 'text', ph: '예: 새가족, 중등부' },
        { k: 'teacher', label: '강사/인도자', type: 'text' },
        { k: 'attendance', label: '참석 인원', type: 'text', ph: '예: 12명' },
        { k: 'content', label: '내용/비고', type: 'textarea', full: true }
      ],
      cols: [['edu_date', '일자'], ['title', '교육명'], ['target', '대상'], ['teacher', '강사'], ['attendance', '인원'], ['content', '내용']]
    },
    sermon: {
      table: 'sermons', name: '설교', dateCol: 'sermon_date',
      fields: [
        { k: 'sermon_date', label: '일자', type: 'date' },
        { k: 'service', label: '예배', type: 'select', opts: ['주일 낮 예배', '주일 밤 예배', '수요예배', '금요기도회', '새벽기도', '매일 QT', '특별집회', '기타'] },
        { k: 'title', label: '제목', type: 'text' },
        { k: 'scripture', label: '본문(성경)', type: 'text', ph: '예: 요한복음 3:16' },
        { k: 'preacher', label: '설교자', type: 'text', ph: '예: 김동석 목사' },
        { k: 'media_url', label: '영상/음성 링크', type: 'text', ph: '유튜브 등 URL' },
        { k: 'file_url', label: '설교 원고/자료', type: 'file' },
        { k: 'content', label: '요약/메모', type: 'textarea', full: true }
      ],
      cols: [['sermon_date', '일자'], ['service', '예배'], ['title', '제목'], ['scripture', '본문'], ['preacher', '설교자'], ['file_url', '자료'], ['content', '요약']]
    },
    doc: {
      table: 'documents', name: '문서', dateCol: 'doc_date',
      fields: [
        { k: 'doc_date', label: '일자', type: 'date' },
        { k: 'title', label: '제목', type: 'text' },
        { k: 'category', label: '분류', type: 'select', opts: ['공문', '회의록', '보고서', '양식', '규정/정관', '대외협조', '기타'] },
        { k: 'manager', label: '담당/부서', type: 'text' },
        { k: 'file_url', label: '첨부 파일', type: 'file' },
        { k: 'content', label: '내용/비고', type: 'textarea', full: true }
      ],
      cols: [['doc_date', '일자'], ['title', '제목'], ['category', '분류'], ['manager', '담당'], ['file_url', '파일'], ['content', '내용']]
    }
  };
  var TAB_ORDER = [['sermon', '설교관리'], ['bulletin', '주보제작'], ['visit', '심방관리'], ['counsel', '상담관리'], ['edu', '교육관리'], ['doc', '문서관리'], ['settings', '설정']];

  var tab = 'sermon';
  function render() {
    root.innerHTML = '<div class="fin-tabs">' + TAB_ORDER.map(function (t) { return '<button data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div id="afPanel"></div>';
    Array.prototype.forEach.call(root.querySelectorAll('.fin-tabs button'), function (b) {
      if (b.dataset.t === tab) b.classList.add('active');
      b.onclick = function () { tab = b.dataset.t; render(); };
    });
    var p = document.getElementById('afPanel');
    if (tab === 'sermon') renderSermon(p);
    else if (tab === 'bulletin') renderBulletinAdmin(p);
    else if (tab === 'settings') renderSettings(p);
    else renderManager(p, TYPES[tab]);
  }

  function fieldHTML(f, val) {
    var v = val == null ? '' : val;
    var inner;
    if (f.type === 'select') inner = '<select data-k="' + f.k + '"><option value="">선택</option>' + f.opts.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
    else if (f.type === 'textarea') inner = '<textarea data-k="' + f.k + '" placeholder="' + esc(f.ph || '') + '">' + esc(v) + '</textarea>';
    else if (f.type === 'check') inner = '<label class="sw" style="display:inline-flex;align-items:center;gap:6px;margin-top:6px"><input type="checkbox" data-k="' + f.k + '"' + (v ? ' checked' : '') + '> 예</label>';
    else if (f.type === 'file') inner = '<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap"><input type="hidden" data-k="' + f.k + '" value="' + esc(v) + '"><button type="button" class="btn btn-line af-file" data-for="' + f.k + '" style="padding:5px 11px;font-size:.82rem">📎 ' + (v ? '파일 교체' : '파일 선택') + '</button><a class="af-file-link" data-for="' + f.k + '" href="' + esc(v || '#') + '" target="_blank" rel="noopener" style="font-size:.8rem;' + (v ? '' : 'display:none') + '">열기</a></div>';
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
    function pick(m) { input.value = m.name; close(); setKey(m); setTimeout(function () { var nx = form.querySelector('[data-k="category"]'); if (nx) nx.focus(); }, 0); }
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
      else if (e.key === 'Enter') { if (matches.length) { e.preventDefault(); pick(matches[hi >= 0 ? hi : 0]); } return; }
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
    var hasMember = type.fields.some(function (f) { return f.k === 'member_name'; });
    var editId = null;
    function syncFiles() { Array.prototype.forEach.call(form.querySelectorAll('.af-file-link'), function (lk) { var hid = form.querySelector('input[type="hidden"][data-k="' + lk.dataset.for + '"]'); var u = hid ? hid.value : ''; lk.href = u || '#'; lk.style.display = u ? '' : 'none'; var btn = form.querySelector('.af-file[data-for="' + lk.dataset.for + '"]'); if (btn) btn.textContent = '📎 ' + (u ? '파일 교체' : '파일 선택'); }); }
    function clearForm() {
      editId = null; resetBtn.style.display = 'none'; panel.querySelector('#af_save').textContent = '＋ 추가';
      type.fields.forEach(function (f) { var el = form.querySelector('[data-k="' + f.k + '"]'); if (!el) return; if (f.type === 'check') el.checked = false; else el.value = (f.type === 'date') ? today() : ''; });
      linkCtl.clear(); syncFiles();
    }
    resetBtn.onclick = clearForm;
    // 파일 업로드(R2)
    Array.prototype.forEach.call(form.querySelectorAll('.af-file'), function (btn) {
      btn.onclick = function () {
        if (!(window.ChurchUpload && ChurchUpload.isReady())) { msg.style.color = '#c0392b'; msg.textContent = '업로드 서버가 설정되지 않았습니다.'; return; }
        var fi = document.createElement('input'); fi.type = 'file';
        fi.onchange = function () {
          var f = fi.files && fi.files[0]; if (!f) return;
          var old = btn.textContent; btn.textContent = '업로드 중…'; btn.disabled = true;
          ChurchUpload.upload(f, { folder: 'affairs/' + type.table, compress: false }).then(function (res) {
            var hid = form.querySelector('input[type="hidden"][data-k="' + btn.dataset.for + '"]'); if (hid) hid.value = res.url;
            btn.disabled = false; syncFiles();
          }).catch(function (e) { btn.disabled = false; btn.textContent = old; msg.style.color = '#c0392b'; msg.textContent = '업로드 실패: ' + e.message; });
        };
        fi.click();
      };
    });
    form.onsubmit = function (e) {
      e.preventDefault();
      var rec = collect(form, type);
      var nme = form.querySelector('[data-k="member_name"]');
      rec.member_key = (nme && nme.dataset.memberKey) ? nme.dataset.memberKey : null; // 교적 매칭키(관계 연결)
      if (!rec[type.dateCol] || (hasMember && !rec.member_name)) { msg.style.color = '#c0392b'; msg.textContent = hasMember ? '일자와 대상자는 필수입니다.' : '일자는 필수입니다.'; return; }
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
                if (/url$/.test(k)) return '<td style="white-space:nowrap">' + (val ? '<a href="' + esc(val) + '" target="_blank" rel="noopener">📎 열기</a>' : '') + '</td>';
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
            linkCtl.setByKey(r.member_key, r.member_name); syncFiles();
            panel.scrollIntoView({ behavior: 'smooth' });
          };
        });
        Array.prototype.forEach.call(listBox.querySelectorAll('[data-del]'), function (b) {
          b.onclick = function () { if (!confirm('삭제할까요?')) return; api('DELETE', type.table + '?id=eq.' + b.dataset.del, null, 'return=minimal').then(loadList).catch(function (e) { alert('삭제 실패: ' + e.message); }); };
        });
      }).catch(function (e) {
        if (/relation .* does not exist|42P01|PGRST205|schema cache|Could not find the table/i.test(e.message)) listBox.innerHTML = msgCard('테이블 준비 필요', 'Supabase → SQL Editor 에서 supabase/affairs.sql (심방·상담) 및 supabase/affairs_modules.sql (교육·설교·문서) 을 1회 실행해 주세요.');
        else listBox.innerHTML = msgCard('조회 실패', e.message);
      });
    }
    loadList();
  }

  // ── 설교관리(전용): 작성 페이지 · 도구상자 · 내보내기 · 아이패드 보기 ──
  var SERMON_TOOLS = [
    { label: '📖 성경본문', url: 'https://bible.goodtv.co.kr/' }
  ];
  function hymnTitle(n) { var H = window.HYMNS; if (H) { n = Number(n); for (var i = 0; i < H.length; i++) if (H[i].no === n) return H[i].title || ''; } return ''; }
  // 찬송가 검색 선택기(번호·제목, 복수 선택) — 숫자만 입력해도 바로 검색
  function hymnPicker(initial, onDone) {
    var HY = window.HYMNS || [];
    var sel = {}; (initial || []).forEach(function (n) { n = Number(n); if (n) sel[n] = 1; });
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,15,25,.5);z-index:9500;display:flex;align-items:flex-start;justify-content:center;padding:24px 14px;overflow:auto';
    ov.innerHTML = '<div class="fin-card" style="max-width:560px;width:100%;background:#fff">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3 style="margin:0;color:var(--accent,#032257)">🎵 찬송가 선택 (복수 선택)</h3><button class="btn btn-line" id="hp_close" style="padding:3px 11px">닫기</button></div>' +
      '<input type="text" id="hp_q" placeholder="🔍 번호 또는 제목 검색 (숫자만 입력해도 바로 검색)" style="width:100%;padding:9px 11px;border:1px solid #dfe5ee;border-radius:8px;font:inherit;margin-bottom:8px">' +
      '<div id="hp_sel" style="margin-bottom:8px;min-height:26px"></div>' +
      '<div id="hp_list" style="max-height:340px;overflow:auto;border:1px solid #eef1f5;border-radius:8px"></div>' +
      '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;justify-content:flex-end"><button class="btn btn-solid" id="hp_done" style="padding:8px 18px">선택 완료</button></div></div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.querySelector('#hp_close').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var selBox = ov.querySelector('#hp_sel'), listEl = ov.querySelector('#hp_list'), qEl = ov.querySelector('#hp_q');
    function nums() { return Object.keys(sel).map(Number).sort(function (a, b) { return a - b; }); }
    function drawSel() {
      var ns = nums();
      selBox.innerHTML = ns.length ? ns.map(function (n) { return '<span class="hp-chip" data-n="' + n + '" style="display:inline-flex;align-items:center;gap:5px;background:#e7f0ff;color:#1f3a5f;border-radius:999px;padding:3px 10px;margin:0 5px 5px 0;font-size:.84rem;font-weight:700">' + n + '장' + (hymnTitle(n) ? ' <span style="font-weight:400">' + esc(hymnTitle(n)) + '</span>' : '') + ' <b style="cursor:pointer;color:#c0392b">✕</b></span>'; }).join('') : '<span style="font-size:.84rem;color:#9aa5b1">아직 선택한 찬송가가 없습니다. 위에서 검색해 고르세요.</span>';
      Array.prototype.forEach.call(selBox.querySelectorAll('.hp-chip b'), function (x) { x.onclick = function () { delete sel[Number(x.parentNode.dataset.n)]; drawSel(); drawList(qEl.value); }; });
    }
    function drawList(q) {
      q = (q || '').trim().toLowerCase();
      var rows = HY.filter(function (h) { return !q || String(h.no).indexOf(q) >= 0 || (h.title || '').toLowerCase().indexOf(q) >= 0; }).slice(0, 400);
      listEl.innerHTML = rows.length ? rows.map(function (h) { return '<div class="hp-item" data-n="' + h.no + '" style="padding:8px 11px;border-bottom:1px solid #f0f0f0;cursor:pointer;display:flex;align-items:center;gap:8px;background:' + (sel[h.no] ? '#eef4ff' : '#fff') + '"><span style="flex:0 0 48px;font-weight:700;color:' + (sel[h.no] ? '#1f3a5f' : '#7b8794') + '">' + h.no + '장</span><span>' + esc(h.title || '') + '</span>' + (sel[h.no] ? '<span style="margin-left:auto;color:#1e874b">✓</span>' : '') + '</div>'; }).join('') : '<p style="padding:10px;color:#9aa5b1">결과 없음</p>';
      Array.prototype.forEach.call(listEl.querySelectorAll('.hp-item'), function (d) { d.onclick = function () { var n = Number(d.dataset.n); if (sel[n]) delete sel[n]; else sel[n] = 1; drawSel(); drawList(qEl.value); }; });
    }
    qEl.oninput = function () { drawList(this.value); };
    qEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var q = qEl.value.trim(); if (/^\d+$/.test(q)) { var n = Number(q); if (n >= 1 && n <= 645) { sel[n] = 1; qEl.value = ''; drawSel(); drawList(''); } } } });
    ov.querySelector('#hp_done').onclick = function () { if (onDone) onDone(nums()); close(); };
    drawSel(); drawList('');
    setTimeout(function () { qEl.focus(); }, 40);
  }
  function hymnsLabel(s) { var a = String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); return a.map(function (n) { var t = hymnTitle(n); return n + '장' + (t ? ' ' + t : ''); }).join(' · '); }
  // 교독문 본문을 인도자/회중/다같이 역할로 렌더
  function gyodokBodyHTML(body) {
    var lead = true;
    return (body || []).map(function (line) {
      if (/다같이/.test(line.slice(0, 8))) return '<div style="text-align:center;font-weight:600;color:#1f3a5f;margin:5px 0">' + esc(line) + '</div>';
      var role = lead ? '인도자' : '회중'; lead = !lead;
      return '<div style="margin:3px 0;display:flex;gap:8px"><span style="flex:0 0 46px;color:#9aa5b1;font-size:.76rem;padding-top:2px">' + role + '</span><span>' + esc(line) + '</span></div>';
    }).join('');
  }
  // 교독문 선택기(목록·검색·미리보기). 선택은 localStorage 에 저장(차후 예배 콘티에 자동 삽입).
  function gyodokPicker(onPick) {
    if (!window.GYODOK || !window.GYODOK.length) { alert('교독문 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,15,25,.5);z-index:9500;display:flex;align-items:flex-start;justify-content:center;padding:24px 14px;overflow:auto';
    ov.innerHTML = '<div class="fin-card" style="max-width:760px;width:100%;background:#fff">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3 style="margin:0;color:var(--accent,#032257)">📜 교독문 선택</h3><button class="btn btn-line" id="gp_close" style="padding:3px 11px">닫기</button></div>' +
      '<input type="text" id="gp_q" placeholder="🔍 번호·제목 검색 (예: 시편 23, 성탄)" style="width:100%;padding:8px 11px;border:1px solid #dfe5ee;border-radius:8px;font:inherit;margin-bottom:10px">' +
      '<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">' +
      '<div id="gp_list" style="flex:0 0 230px;max-width:100%;max-height:430px;overflow:auto;border:1px solid #eef1f5;border-radius:8px"></div>' +
      '<div style="flex:1;min-width:240px"><div id="gp_prev" style="max-height:390px;overflow:auto;border:1px solid #eef1f5;border-radius:8px;padding:12px;color:#48576b;font-size:.92rem">왼쪽에서 교독문을 선택하세요.</div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button class="btn btn-solid" id="gp_pick" disabled style="padding:8px 16px">이 교독문 선택</button><span id="gp_msg" style="font-size:.84rem;color:#7b8794"></span></div></div>' +
      '</div></div>';
    document.body.appendChild(ov);
    var sel = null;
    function close() { ov.remove(); }
    ov.querySelector('#gp_close').onclick = close;
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var listEl = ov.querySelector('#gp_list'), prevEl = ov.querySelector('#gp_prev'), pickBtn = ov.querySelector('#gp_pick');
    function drawList(q) {
      q = (q || '').trim().toLowerCase();
      var rows = window.GYODOK.filter(function (g) { return !q || (g.no + '. ' + g.title).toLowerCase().indexOf(q) >= 0; });
      listEl.innerHTML = rows.map(function (g) { return '<div class="gp-item" data-no="' + g.no + '" style="padding:8px 11px;border-bottom:1px solid #f0f0f0;cursor:pointer;font-size:.9rem"><b>' + g.no + '.</b> ' + esc(g.title) + '</div>'; }).join('') || '<p style="padding:10px;color:#9aa5b1">결과 없음</p>';
      Array.prototype.forEach.call(listEl.querySelectorAll('.gp-item'), function (d) {
        d.onclick = function () {
          var g = window.GYODOK.filter(function (x) { return x.no === Number(d.dataset.no); })[0]; if (!g) return;
          sel = g; pickBtn.disabled = false;
          Array.prototype.forEach.call(listEl.querySelectorAll('.gp-item'), function (x) { x.style.background = ''; });
          d.style.background = '#eef4ff';
          prevEl.innerHTML = '<div style="font-weight:700;color:var(--accent,#032257);margin-bottom:8px">' + g.no + '. ' + esc(g.title) + '</div>' + gyodokBodyHTML(g.body);
        };
      });
    }
    ov.querySelector('#gp_q').oninput = function () { drawList(this.value); };
    pickBtn.onclick = function () {
      if (!sel) return;
      try { localStorage.setItem('wpc_sel_gyodok', JSON.stringify({ no: sel.no, title: sel.title })); } catch (e) {}
      if (onPick) onPick(sel);
      close();
    };
    drawList('');
  }
  function selectedGyodok() { try { return JSON.parse(localStorage.getItem('wpc_sel_gyodok') || 'null'); } catch (e) { return null; } }
  var SVC_OPTS = ['주일 낮 예배', '주일 밤 예배', '수요예배', '금요기도회', '새벽기도', '매일 QT', '특별집회', '기타'];

  function renderSermon(panel) {
    var WTPL = {}, smView = 'list', smRows = [], calYM = null;
    var SERVICE_COLORS = { '주일 낮 예배': '#2563eb', '주일 밤 예배': '#4f46e5', '수요예배': '#1e874b', '금요기도회': '#7c3aed', '새벽기도': '#0d9488', '매일 QT': '#d97706', '특별집회': '#c0392b', '기타': '#64748b' };
    function svcColor(s) { return SERVICE_COLORS[s] || '#64748b'; }
    api('GET', 'worship_templates?select=*').then(function (rows) { WTPL = {}; (rows || []).forEach(function (r) { WTPL[r.service] = r.items || []; }); }).catch(function () {});
    panel.innerHTML =
      '<div class="fin-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">' +
      '<div><b style="font-size:1.08rem;color:var(--accent,#032257)">설교 작성·관리</b>' +
      '<div style="font-size:.84rem;color:var(--ink-soft);margin-top:4px">캘린더에서 <b>날짜를 클릭</b>하면 그 날짜로 바로 설교를 준비할 수 있고, 아래 <b>목록</b>에서도 관리됩니다.</div></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
      '<button class="btn btn-solid" id="sm_start" style="padding:11px 22px;font-size:1rem">✍️ 설교 시작</button></div></div>' +
      '<div id="sm_cal"></div>' +
      '<div id="sm_list"><p class="qt-loading">불러오는 중…</p></div>';
    panel.querySelector('#sm_start').onclick = function () { sermonEditor(null); };

    function loadList() {
      api('GET', 'sermons?select=*&order=sermon_date.desc,created_at.desc').then(function (rows) { smRows = rows || []; renderView(); }).catch(function (e) {
        var listBox = panel.querySelector('#sm_list');
        if (/42P01|PGRST205|does not exist|schema cache|Could not find the table/i.test(e.message)) listBox.innerHTML = msgCard('테이블 준비 필요', 'Supabase → SQL Editor 에서 supabase/affairs_modules.sql 을 1회 실행해 주세요.');
        else listBox.innerHTML = msgCard('조회 실패', e.message);
      });
    }
    function renderView() { renderCalendar(); renderTable(); }
    function wireRows(box) {
      var byId = {}; smRows.forEach(function (r) { byId[r.id] = r; });
      Array.prototype.forEach.call(box.querySelectorAll('.sm-read'), function (b) { b.onclick = function () { sermonReadingView(byId[b.dataset.id], { qt: false }); }; });
      Array.prototype.forEach.call(box.querySelectorAll('.sm-qt'), function (b) { b.onclick = function () { sermonReadingView(byId[b.dataset.id], { qt: true }); }; });
      Array.prototype.forEach.call(box.querySelectorAll('.sm-kakao'), function (b) { b.onclick = function () { copyKakaoQt(byId[b.dataset.id]); }; });
      Array.prototype.forEach.call(box.querySelectorAll('.sm-edit'), function (b) { b.onclick = function () { sermonEditor(byId[b.dataset.id]); }; });
      Array.prototype.forEach.call(box.querySelectorAll('.sm-del'), function (b) { b.onclick = function () { if (!confirm('이 설교를 삭제할까요?')) return; api('DELETE', 'sermons?id=eq.' + b.dataset.id, null, 'return=minimal').then(loadList).catch(function (e) { alert('삭제 실패: ' + e.message); }); }; });
      Array.prototype.forEach.call(box.querySelectorAll('.cal-item'), function (el) { el.onclick = function (e) { e.stopPropagation(); sermonEditor(byId[el.dataset.id]); }; });
    }
    function renderTable() {
      var listBox = panel.querySelector('#sm_list'), rows = smRows;
      if (!rows.length) { listBox.innerHTML = '<div class="fin-card"><p style="color:var(--ink-soft);margin:0">등록된 설교가 없습니다. <b>설교 시작</b>으로 작성해 보세요.</p></div>'; return; }
      listBox.innerHTML = '<div class="fin-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>설교 (' + rows.length + '편)</b></div><div style="overflow:auto"><table class="fin-table"><thead><tr><th>일자</th><th>예배</th><th>제목</th><th>본문</th><th>설교자</th><th>관리</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var c = svcColor(r.service);
          return '<tr><td style="white-space:nowrap">' + esc(fmtD(r.sermon_date)) + '</td><td style="white-space:nowrap"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + c + ';margin-right:5px"></span>' + esc(r.service || '') + '</td><td><b>' + esc(r.title || '(제목없음)') + '</b></td><td style="white-space:nowrap">' + esc(r.scripture || '') + '</td><td style="white-space:nowrap">' + esc(r.preacher || '') + '</td>' +
            '<td style="white-space:nowrap"><button class="btn btn-solid sm-read" data-id="' + esc(r.id) + '" style="padding:4px 11px;font-size:.78rem">📖 보기</button>' +
            (r.service === '매일 QT' ? ' <button class="btn btn-line sm-qt" data-id="' + esc(r.id) + '" title="우리말성경 QT로 보기" style="padding:4px 9px;font-size:.78rem;background:#fff8e6;border-color:#e6c97a">📲 QT</button> <button class="btn btn-line sm-kakao" data-id="' + esc(r.id) + '" title="카카오톡 발송 양식 복사" style="padding:4px 9px;font-size:.78rem;background:#fff8c4;border-color:#f4d641">💬 톡 복사</button>' : '') +
            ' <button class="btn btn-line sm-edit" data-id="' + esc(r.id) + '" style="padding:4px 9px;font-size:.78rem">수정</button> <button class="btn btn-line sm-del" data-id="' + esc(r.id) + '" style="padding:4px 9px;font-size:.78rem">삭제</button></td></tr>';
        }).join('') + '</tbody></table></div></div>';
      wireRows(listBox);
    }
    function renderCalendar() {
      var calBox = panel.querySelector('#sm_cal');
      if (!calBox) return;
      if (!calYM) { var t = new Date(); calYM = { y: t.getFullYear(), m: t.getMonth() }; }
      var y = calYM.y, m = calYM.m, startDow = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
      var todayStr = today();
      var byDate = {}; smRows.forEach(function (r) { var d = fmtD(r.sermon_date); if (d) (byDate[d] = byDate[d] || []).push(r); });
      var legend = Object.keys(SERVICE_COLORS).map(function (s) { return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:.74rem;margin:0 9px 4px 0"><span style="width:11px;height:11px;border-radius:3px;background:' + SERVICE_COLORS[s] + '"></span>' + esc(s) + '</span>'; }).join('');
      var wd = ['일', '월', '화', '수', '목', '금', '토'];
      var html = '<div class="fin-card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">' +
        '<div style="display:flex;align-items:center;gap:8px"><button class="btn btn-line" id="cal_prev" style="padding:3px 11px">‹</button><b style="font-size:1.05rem;min-width:110px;text-align:center">' + y + '년 ' + (m + 1) + '월</b><button class="btn btn-line" id="cal_next" style="padding:3px 11px">›</button><button class="btn btn-line" id="cal_today" style="padding:3px 10px;font-size:.8rem">오늘</button></div>' +
        '<div style="display:flex;flex-wrap:wrap;align-items:center"><span style="font-size:.72rem;color:#9aa5b1;margin-right:10px">날짜 클릭 → 설교 작성</span>' + legend + '</div></div>' +
        '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">' +
        wd.map(function (w, i) { return '<div style="text-align:center;font-size:.78rem;font-weight:700;color:' + (i === 0 ? '#c0392b' : (i === 6 ? '#2563eb' : '#7b8794')) + ';padding:4px 0">' + w + '</div>'; }).join('');
      for (var b = 0; b < startDow; b++) html += '<div></div>';
      for (var dd = 1; dd <= days; dd++) {
        var ds = y + '-' + pad2(m + 1) + '-' + pad2(dd), dow = new Date(y, m, dd).getDay(), isToday = (ds === todayStr);
        var items = (byDate[ds] || []).map(function (r) { var c = svcColor(r.service); return '<div class="cal-item" data-id="' + esc(r.id) + '" title="' + esc((r.service || '') + ' · ' + (r.title || '') + (r.scripture ? ' · ' + r.scripture : '')) + '" style="background:' + c + '1a;border-left:3px solid ' + c + ';border-radius:4px;padding:2px 5px;margin-top:3px;cursor:pointer;font-size:.72rem;line-height:1.25"><b style="color:' + c + '">' + esc(r.title || '(제목없음)') + '</b>' + (r.scripture ? '<div style="color:#7b8794">' + esc(r.scripture) + '</div>' : '') + '</div>'; }).join('');
        var dnumColor = isToday ? '#fff' : (dow === 0 ? '#c0392b' : (dow === 6 ? '#2563eb' : '#48576b'));
        var dnum = isToday
          ? '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border-radius:50%;background:#2f5d50;color:#fff;font-size:.74rem;font-weight:700">' + dd + '</span>'
          : '<span style="font-size:.78rem;color:' + dnumColor + '">' + dd + '</span>';
        html += '<div class="cal-day" data-date="' + ds + '" title="' + ds + ' — 이 날짜로 설교 작성" style="min-height:86px;border:1px solid ' + (isToday ? '#2f5d50' : '#eef1f5') + ';border-radius:8px;padding:4px 5px;background:' + (isToday ? '#f1f7f5' : '#fff') + ';cursor:pointer;transition:background .12s">' + dnum + items + '</div>';
      }
      html += '</div><div style="font-size:.72rem;color:#9aa5b1;margin-top:8px">＋ 빈 날짜를 클릭하면 그 날짜로 새 설교를, 설교 칸을 클릭하면 해당 설교를 엽니다.</div></div>';
      calBox.innerHTML = html;
      panel.querySelector('#cal_prev').onclick = function () { var nm = m - 1, ny = y; if (nm < 0) { nm = 11; ny--; } calYM = { y: ny, m: nm }; renderCalendar(); };
      panel.querySelector('#cal_next').onclick = function () { var nm = m + 1, ny = y; if (nm > 11) { nm = 0; ny++; } calYM = { y: ny, m: nm }; renderCalendar(); };
      panel.querySelector('#cal_today').onclick = function () { var t = new Date(); calYM = { y: t.getFullYear(), m: t.getMonth() }; renderCalendar(); };
      Array.prototype.forEach.call(calBox.querySelectorAll('.cal-day'), function (cell) {
        cell.onmouseenter = function () { cell.style.background = '#eef4ff'; };
        cell.onmouseleave = function () { cell.style.background = (cell.dataset.date === todayStr) ? '#f1f7f5' : '#fff'; };
        cell.onclick = function () { sermonEditor({ sermon_date: cell.dataset.date }); };
      });
      wireRows(calBox);
    }
    loadList();

    // 설교 작성 페이지(전체화면)
    function sermonEditor(rec) {
      rec = rec || {};
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:#f5f7fa;z-index:9000;overflow:auto';
      var svcOpts = SVC_OPTS.map(function (o) { return '<option' + (o === (rec.service || '') ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
      ov.innerHTML =
        '<style>' +
        '.sed-wrap{position:relative;padding:22px 24px 70px}' +
        '.sed-aside{position:absolute;left:24px;top:22px;width:268px}' +
        '.sed-form{max-width:760px;margin:0 auto}' +
        '.sed-qt{display:flex;align-items:center;gap:7px;background:#fff7e3;border:1px solid #e8cd86;border-radius:8px;padding:0 11px;height:40px;font-size:.84rem;font-weight:500;color:#8a6d1f;cursor:pointer;user-select:none}' +
        '.sed-row2{display:grid;grid-template-columns:2.3fr 1fr;gap:12px;margin-bottom:12px}' +
        '@media(max-width:1240px){.sed-aside{position:static;left:auto;top:auto;width:auto;max-width:760px;margin:0 auto 20px}.sed-form{max-width:760px}}' +
        '@media(max-width:560px){.sed-row2{grid-template-columns:1fr}}' +
        '</style>' +
        '<header style="position:sticky;top:0;z-index:6;background:linear-gradient(180deg,#ffffff 0%,#f7f9fc 100%);border-bottom:1px solid #e1e6ef;box-shadow:0 2px 10px rgba(3,34,87,.06)">' +
        '<div style="margin:0 auto;padding:11px 22px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
        '<button class="btn btn-line" id="se_close" style="padding:8px 14px;border-radius:9px">‹ 닫기</button>' +
        '<div style="flex:1;min-width:160px;text-align:center;line-height:1.25">' +
        '<div style="font-family:\'Noto Serif KR\',serif;font-weight:700;font-size:1.22rem;color:var(--accent,#032257);letter-spacing:-.01em">예배 준비 도우미</div>' +
        '<div style="font-size:.72rem;color:#9aa5b1;margin-top:2px;letter-spacing:.02em">설교문과 QT를 함께 준비하고 아이패드로 내보냅니다</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">' +
        '<button class="btn btn-line" id="se_save" style="padding:8px 13px;border-radius:9px">💾 임시저장</button>' +
        '<button class="btn btn-line" id="se_kakao" style="padding:8px 12px;border-radius:9px;background:#fbe94d;border-color:#e6d23f;color:#3a2e00;font-weight:600;display:none">💬 카카오톡 복사</button>' +
        '<button class="btn btn-solid" id="se_export" style="padding:8px 18px;border-radius:9px;font-weight:700">📤 내보내기</button>' +
        '</div>' +
        '<div id="se_msg" class="fin-msg" style="flex-basis:100%;text-align:right;min-height:0;margin-top:-2px"></div>' +
        '</div></header>' +
        '<div class="sed-wrap">' +
        '<div class="sed-aside"><div class="af-field" style="margin:0">' +
        '<label style="font-size:1.18rem;font-weight:700;color:var(--accent,#032257);margin-bottom:2px">📋 예배 순서</label>' +
        '<div style="font-size:.74rem;color:#9aa5b1;margin-bottom:9px">교독문·찬송가·CCM·항목을 추가하고 드래그로 정렬 · 항목에 📎 파일 첨부</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px"><button type="button" class="btn btn-line" id="se_tpl_load" style="padding:6px 8px;font-size:.78rem">📋 양식 불러오기</button><button type="button" class="btn btn-line" id="se_tpl_save" style="padding:6px 8px;font-size:.78rem">💾 양식 저장</button></div>' +
        '<div id="se_tpl_msg" style="font-size:.74rem;color:#7b8794;min-height:0;margin-bottom:6px"></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px"><button type="button" class="btn btn-line" id="se_gyodok" style="padding:7px 4px;font-size:.8rem">📜 교독문</button><button type="button" class="btn btn-line" id="se_hymn" style="padding:7px 4px;font-size:.8rem">🎵 찬송가</button><button type="button" class="btn btn-line" id="se_ccm" style="padding:7px 4px;font-size:.8rem">🎶 CCM</button></div>' +
        '<div id="se_order"></div>' +
        '</div></div>' +
        '<div class="sed-form">' +
        '<div class="fin-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:12px">' +
        '<div class="af-field"><label>일자</label><input type="date" id="se_date" value="' + esc(fmtD(rec.sermon_date) || today()) + '"></div>' +
        '<div class="af-field"><label>예배</label><select id="se_service"><option value="">선택</option>' + svcOpts + '</select></div>' +
        '<div class="af-field"><label>설교자</label><input type="text" id="se_preacher" value="' + esc(rec.preacher || '김동석 목사') + '"></div>' +
        '<div class="af-field"><label>QT</label><label class="sed-qt" id="se_qt_lbl"><input type="checkbox" id="se_qt_toggle" style="width:16px;height:16px;cursor:pointer;accent-color:#c79a2e">📲 함께 만들기</label></div>' +
        '<input type="hidden" id="se_gyodok_v" value="' + esc(rec.gyodok || '') + '"><input type="hidden" id="se_hymns_v" value="' + esc(rec.hymns || '') + '">' +
        '</div>' +
        '<div class="sed-row2">' +
        '<div class="af-field"><label>제목</label><input type="text" id="se_title" value="' + esc(rec.title || '') + '" placeholder="설교 제목" style="font-size:1.1rem;font-weight:700"></div>' +
        '<div class="af-field"><label>본문(성경) <a href="' + esc(SERMON_TOOLS[0].url) + '" target="_blank" rel="noopener" style="font-weight:400;font-size:.74rem;color:#1f6feb">📖 검색</a></label><input type="text" id="se_scripture" value="' + esc(rec.scripture || '') + '" placeholder="예: 요한복음 3:16"></div>' +
        '</div>' +
        '<div class="af-field" style="margin-bottom:10px"><label>📖 성경 본문 — 개역개정 <span style="font-weight:400;font-size:.74rem;color:#9aa5b1">새벽기도회·주일 설교 등에 사용</span></label><textarea id="se_bible" placeholder="개역개정 본문을 입력/붙여넣으세요. (예: 1 태초에 하나님이 천지를 창조하시니라 …)" style="min-height:120px;line-height:1.8;font-size:1rem;font-family:\'Noto Serif KR\',serif">' + esc(rec.bible_text || '') + '</textarea></div>' +
        '<div class="af-field" id="se_qt_bible_wrap" style="margin-bottom:12px;display:none"><label>📲 성경 본문 — 우리말성경 (QT 전용) <span style="font-weight:400;font-size:.74rem;color:#9aa5b1">QT 내보내기·카카오톡 양식에 사용</span></label><textarea id="se_qt_bible" placeholder="우리말성경 본문을 입력/붙여넣으세요." style="min-height:120px;line-height:1.8;font-size:1rem;font-family:\'Noto Serif KR\',serif">' + esc(rec.qt_bible_text || '') + '</textarea></div>' +
        '<div class="af-field"><label>설교 원고</label><textarea id="se_content" placeholder="설교 원고를 작성하세요. 줄바꿈·문단이 그대로 설교문에 반영됩니다." style="min-height:50vh;line-height:1.8;font-size:1.02rem">' + esc(rec.content || '') + '</textarea></div>' +
        '<input type="hidden" id="se_media" value="' + esc(rec.media_url || '') + '"><input type="hidden" id="se_file" value="' + esc(rec.file_url || '') + '">' +
        '</div></div>';
      document.body.appendChild(ov);
      document.body.style.overflow = 'hidden';
      function close() { ov.remove(); document.body.style.overflow = ''; }
      ov.querySelector('#se_close').onclick = close;

      // ── 예배 순서(드래그) + 항목별 파일 업로드 ──
      var dragKind = null, dragOrderIdx = -1, dragGyodok = null;

      // ── 예배 순서(왼쪽): 항목 추가 · 드래그 정렬 ──
      var order = []; try { order = JSON.parse(rec.worship_order || '[]') || []; } catch (e) { order = []; }
      var oSortable = null;
      // 주보와 동일한 주일 낮 예배 순서(15항목) 프리셋
      function sundayPresetOrder() { return BULLETIN_PRESET.map(function (n) { return { label: n, detail: '' }; }); }
      function uploadToOrder(i, f) {
        if (!f || !order[i]) return;
        if (!(window.ChurchUpload && ChurchUpload.isReady())) { alert('업로드 서버가 설정되지 않았습니다.'); return; }
        order[i]._up = true; renderOrder();
        ChurchUpload.upload(f, { folder: 'worship/order', compress: false }).then(function (res) { if (order[i]) { order[i].url = res.url; order[i]._up = false; } renderOrder(); }).catch(function (e) { if (order[i]) order[i]._up = false; renderOrder(); alert('업로드 실패: ' + e.message); });
      }
      var oBox = ov.querySelector('#se_order');
      var PRESETS = ['묵도', '찬송', '신앙고백', '교독문', '대표기도', '성경봉독', '찬양', '특송', '봉헌', '말씀(설교)', '주기도문', '광고', '축도', '기타'];
      function presetDetail(label) {
        if (label === '교독문') return ov.querySelector('#se_gyodok_v').value || '';
        if (label === '성경봉독') return ov.querySelector('#se_scripture').value || '';
        if (label === '말씀(설교)') return ov.querySelector('#se_title').value || '';
        if (label === '찬송') return hymnsLabel(ov.querySelector('#se_hymns_v').value) || '';
        return '';
      }
      function renderOrder() {
        var rowsHtml = order.map(function (it, i) {
          var detailLine = it.detail ? '<div class="od-detail-view" style="font-size:.82rem;color:#48576b;margin-top:2px">' + esc(it.detail) + '</div>' : '';
          return '<div class="od-row" data-i="' + i + '" style="display:flex;align-items:flex-start;gap:6px;border:1px solid #e1e7ef;border-radius:9px;padding:6px 8px;margin-bottom:6px;background:#fff">' +
            '<span class="od-handle" style="cursor:grab;color:#9aa5b1;padding-top:2px;touch-action:none">≡</span>' +
            '<span style="flex:0 0 16px;text-align:center;color:#7b8794;font-size:.74rem;padding-top:3px">' + (i + 1) + '</span>' +
            '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:.85rem;color:var(--accent,#032257)">' + esc(it.label || '항목') + (it.url ? ' <a href="' + esc(it.url) + '" target="_blank" rel="noopener" style="font-size:.72rem;font-weight:400">자료</a>' : '') + '</div>' +
            detailLine +
            '</div>' +
            '<button type="button" class="od-edit" data-i="' + i + '" title="수정/검색" style="border:0;background:none;cursor:pointer;color:#5b6b7d;padding-top:2px;font-size:.9rem">✎</button>' +
            '<button type="button" class="od-file" data-i="' + i + '" title="파일 첨부 (드래그앤드롭 가능)" style="border:0;background:none;cursor:pointer;color:' + (it.url ? '#1e874b' : '#5b6b7d') + ';padding-top:2px;font-size:.92rem">' + (it._up ? '⏳' : '📎') + '</button>' +
            '<button type="button" class="od-del" data-i="' + i + '" style="border:0;background:none;color:#c0392b;cursor:pointer;padding-top:2px">✕</button>' +
            '</div>';
        }).join('');
        oBox.innerHTML =
          '<button type="button" class="btn btn-line" id="od_add" style="padding:6px 13px;font-size:.84rem;margin-bottom:6px">＋ 항목 추가</button><div id="od_menu" style="display:none;flex-wrap:wrap;gap:5px;margin-bottom:8px"></div>' +
          '<div id="od_rows">' + rowsHtml + '</div>';
        Array.prototype.forEach.call(oBox.querySelectorAll('.od-del'), function (b) { b.onclick = function () { order.splice(Number(b.dataset.i), 1); renderOrder(); }; });
        Array.prototype.forEach.call(oBox.querySelectorAll('.od-file'), function (b) { b.onclick = function () { var fi = document.createElement('input'); fi.type = 'file'; fi.onchange = function () { uploadToOrder(Number(b.dataset.i), fi.files && fi.files[0]); }; fi.click(); }; });
        Array.prototype.forEach.call(oBox.querySelectorAll('.od-edit'), function (b) {
          b.onclick = function () {
            var i = Number(b.dataset.i), it = order[i]; if (!it) return;
            if (it.label === '교독문') {
              gyodokPicker(function (g) { it.detail = g.no + '. ' + g.title; if (ov.querySelector('#se_gyodok_v')) ov.querySelector('#se_gyodok_v').value = it.detail; renderOrder(); });
            } else if (it.label === '찬송') {
              hymnPicker(it.hno ? [it.hno] : [], function (ns) {
                if (!ns.length) return;
                var f0 = ns[0]; it.hno = f0; it.detail = f0 + '장' + (hymnTitle(f0) ? ' ' + hymnTitle(f0) : '');
                var extras = ns.slice(1).map(function (n) { return { label: '찬송', detail: n + '장' + (hymnTitle(n) ? ' ' + hymnTitle(n) : ''), url: '', hno: n }; });
                if (extras.length) Array.prototype.splice.apply(order, [i + 1, 0].concat(extras));
                renderOrder();
              });
            } else {
              var v = prompt(it.label + ' 내용을 입력하세요', it.detail || '');
              if (v !== null) { it.detail = v.trim(); renderOrder(); }
            }
          };
        });
        var menu = oBox.querySelector('#od_menu');
        menu.innerHTML = PRESETS.map(function (p) { return '<button type="button" class="btn btn-line od-preset" style="padding:3px 9px;font-size:.78rem">' + esc(p) + '</button>'; }).join('');
        oBox.querySelector('#od_add').onclick = function () { menu.style.display = (menu.style.display === 'none' ? 'flex' : 'none'); };
        Array.prototype.forEach.call(menu.querySelectorAll('.od-preset'), function (b) { b.onclick = function () { var lb = b.textContent; order.push({ label: lb, detail: presetDetail(lb), url: '' }); renderOrder(); }; });
        function insertAt(idx, item) { if (idx < 0 || idx > order.length) idx = order.length; order.splice(idx, 0, item); }
        function clearDrag() { dragKind = null; dragOrderIdx = -1; dragGyodok = null; }
        function dropItem() {
          if (dragKind === 'gyodok' && dragGyodok) return { label: '교독문', detail: dragGyodok, url: '' };
          return null;
        }
        Array.prototype.forEach.call(oBox.querySelectorAll('.od-row'), function (row) {
          row.addEventListener('dragover', function (e) { e.preventDefault(); row.style.borderColor = '#6f9be0'; });
          row.addEventListener('dragleave', function () { row.style.borderColor = '#e1e7ef'; });
          row.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); row.style.borderColor = '#e1e7ef'; var to = Number(row.dataset.i);
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) { uploadToOrder(to, f); return; }
            var it = dropItem();
            if (it) { insertAt(to, it); clearDrag(); renderOrder(); }
          });
        });
        if (oSortable) { try { oSortable.destroy(); } catch (e) { } oSortable = null; }
        var oRows = oBox.querySelector('#od_rows');
        if (window.Sortable && oRows) oSortable = window.Sortable.create(oRows, {
          handle: '.od-handle', draggable: '.od-row', animation: 170, easing: 'cubic-bezier(.2,.6,.35,1)',
          onEnd: function () {
            var ids = Array.prototype.map.call(oRows.querySelectorAll('.od-row'), function (r) { return Number(r.dataset.i); });
            var no = ids.map(function (idx) { return order[idx]; }).filter(Boolean);
            if (!no.length) { renderOrder(); return; }
            order.length = 0; Array.prototype.push.apply(order, no); renderOrder();
          }
        });
      }
      renderOrder();

      // 예배별 순서 양식: 저장/불러오기 + 예배 변경 시 자동 불러오기
      function tplMsg(t, ok) { var e = ov.querySelector('#se_tpl_msg'); if (e) { e.style.color = ok === false ? '#c0392b' : (ok ? 'green' : '#7b8794'); e.textContent = t; if (t) setTimeout(function () { if (e.textContent === t) e.textContent = ''; }, 2500); } }
      ov.querySelector('#se_tpl_save').onclick = function () {
        var svc = ov.querySelector('#se_service').value; if (!svc) { tplMsg('예배를 먼저 선택하세요.', false); return; }
        if (!order.length) { tplMsg('저장할 순서가 없습니다.', false); return; }
        tplMsg('저장 중…');
        api('POST', 'worship_templates?on_conflict=service', { service: svc, items: order, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal')
          .then(function () { WTPL[svc] = JSON.parse(JSON.stringify(order)); tplMsg('✓ ' + svc + ' 양식 저장됨', true); })
          .catch(function (e) { if (/42P01|PGRST205|does not exist|schema cache/i.test(e.message)) tplMsg('worship_templates.sql 실행 필요', false); else tplMsg('저장 실패: ' + e.message, false); });
      };
      function loadTpl(svc, silent) {
        if (!svc || !WTPL[svc] || !WTPL[svc].length) { if (!silent) tplMsg('저장된 양식이 없습니다.', false); return false; }
        order = JSON.parse(JSON.stringify(WTPL[svc])); renderOrder(); if (!silent) tplMsg('✓ ' + svc + ' 양식 불러옴', true); return true;
      }
      ov.querySelector('#se_tpl_load').onclick = function () { loadTpl(ov.querySelector('#se_service').value, false); };
      // 예배 변경 시: 저장된 양식 우선, 없고 주일 낮 예배면 주보 표준 15순서 자동
      function autoFillOrder(svc) {
        if (order.length) return;
        if (loadTpl(svc, true)) return;
        if (svc === '주일 낮 예배') { order = sundayPresetOrder(); renderOrder(); }
      }
      ov.querySelector('#se_service').addEventListener('change', function () { autoFillOrder(this.value); });
      if (!rec.id) autoFillOrder(ov.querySelector('#se_service').value); // 새 설교 → 자동

      // 교독문·찬송가 선택 → 예배 순서에 항목으로 추가(드래그·파일 가능)
      ov.querySelector('#se_gyodok').onclick = function () {
        gyodokPicker(function (g) {
          var d = g.no + '. ' + g.title;
          ov.querySelector('#se_gyodok_v').value = d;
          order = order.filter(function (it) { return it.label !== '교독문'; });
          order.push({ label: '교독문', detail: d, url: '' });
          renderOrder();
        });
      };
      ov.querySelector('#se_hymn').onclick = function () {
        var cur = ov.querySelector('#se_hymns_v').value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        hymnPicker(cur, function (ns) {
          ov.querySelector('#se_hymns_v').value = ns.join(',');
          var have = {}; order.forEach(function (it) { if (it.label === '찬송' && it.hno) have[it.hno] = 1; });
          order = order.filter(function (it) { return !(it.label === '찬송' && it.hno && ns.indexOf(it.hno) < 0); }); // 선택 해제된 찬송 제거
          ns.forEach(function (n) { if (!have[n]) { var t = hymnTitle(n); order.push({ label: '찬송', detail: n + '장' + (t ? ' ' + t : ''), url: '', hno: n }); } });
          renderOrder();
        });
      };
      // CCM: 예배 순서에 빈 CCM 항목 추가(✎로 곡명 입력, 📎로 파일 첨부)
      ov.querySelector('#se_ccm').onclick = function () {
        var v = prompt('CCM 곡명을 입력하세요', '');
        order.push({ label: 'CCM', detail: (v || '').trim(), url: '' });
        renderOrder();
      };
      // QT 내보내기 체크박스: 켜면 우리말성경 본문칸·카카오톡 버튼 표시
      var qtToggle = ov.querySelector('#se_qt_toggle');
      var qtWrap = ov.querySelector('#se_qt_bible_wrap');
      var kakaoBtn = ov.querySelector('#se_kakao');
      function qtOn() { return !!(qtToggle && qtToggle.checked); }
      function syncQt() { var on = qtOn(); if (qtWrap) qtWrap.style.display = on ? '' : 'none'; if (kakaoBtn) kakaoBtn.style.display = on ? '' : 'none'; }
      if (qtToggle) {
        qtToggle.checked = !!(rec.qt_bible_text || rec.service === '매일 QT');
        qtToggle.onchange = syncQt;
      }
      syncQt();

      function gather() {
        return {
          sermon_date: ov.querySelector('#se_date').value || null,
          service: ov.querySelector('#se_service').value || null,
          title: ov.querySelector('#se_title').value.trim() || null,
          scripture: ov.querySelector('#se_scripture').value.trim() || null,
          preacher: ov.querySelector('#se_preacher').value.trim() || null,
          content: ov.querySelector('#se_content').value || null,
          bible_text: (ov.querySelector('#se_bible') ? ov.querySelector('#se_bible').value : '') || null,
          qt_bible_text: (qtOn() && ov.querySelector('#se_qt_bible') ? ov.querySelector('#se_qt_bible').value : '') || null,
          media_url: ov.querySelector('#se_media').value || null,
          file_url: ov.querySelector('#se_file').value || null,
          gyodok: ov.querySelector('#se_gyodok_v').value || null,
          hymns: ov.querySelector('#se_hymns_v').value || null,
          worship_order: (order.length ? JSON.stringify(order) : null)
        };
      }
      function save(then) {
        var data = gather();
        var msg = ov.querySelector('#se_msg');
        if (!data.sermon_date || !data.title) { msg.style.color = '#c0392b'; msg.textContent = '일자와 제목은 필수입니다.'; return; }
        msg.style.color = '#7b8794'; msg.textContent = '저장 중…';
        var p = rec.id ? api('PATCH', 'sermons?id=eq.' + rec.id, data, 'return=representation') : api('POST', 'sermons', data, 'return=representation');
        p.then(function (rows) { var saved = (rows && rows[0]) || data; if (rows && rows[0]) rec.id = rows[0].id; msg.style.color = 'green'; msg.textContent = '✓ 저장되었습니다'; loadList(); if (then) then(saved); })
          .catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = '저장 실패: ' + e.message; });
      }
      ov.querySelector('#se_save').onclick = function () { save(null); };
      ov.querySelector('#se_export').onclick = function () {
        var alsoQt = qtOn();
        if (alsoQt && !ov.querySelector('#se_qt_bible').value.trim()) {
          if (!confirm('우리말성경(QT) 본문이 비어 있습니다. QT 출력을 건너뛰고 새벽(개역개정)만 내보낼까요?\n\n[취소]를 누르면 우리말성경 본문을 먼저 입력하세요.')) return;
          alsoQt = false;
        }
        save(function (saved) {
          sermonReadingView(saved, { qt: false });           // ① 새벽 — 개역개정 (예배 순서 포함)
          if (alsoQt) setTimeout(function () { sermonReadingView(saved, { qt: true }); }, 350); // ② QT — 우리말성경 (예배 순서 제외)
        });
      };
      ov.querySelector('#se_kakao').onclick = function () {
        save(function (saved) { copyKakaoQt(saved); });
      };
    }
  }

  // QT 카카오톡 발송 양식 (텍스트) — 클립보드에 복사
  function kakaoQtText(r) {
    r = r || {};
    var d = r.sermon_date ? new Date(r.sermon_date + 'T00:00:00') : new Date();
    var DOW = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    var dateStr = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0') + ' ' + DOW[d.getDay()];
    var lines = [];
    lines.push('📖 샬롬! 오늘의 QT입니다.');
    lines.push('');
    lines.push('📅 날짜: ' + dateStr);
    lines.push('');
    if (r.title) lines.push(r.title);
    if (r.scripture) lines.push(r.scripture);
    lines.push('');
    lines.push('📖 성경 본문 (우리말 성경)');
    lines.push((r.qt_bible_text || '').trim() || '(우리말성경 본문이 입력되지 않았습니다)');
    lines.push('');
    lines.push('📝 묵상');
    lines.push('');
    lines.push((r.content || '').trim());
    return lines.join('\n');
  }
  function copyKakaoQt(r) {
    var text = kakaoQtText(r);
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); alert('✓ 카카오톡 양식이 복사되었습니다. 카카오톡에 붙여 넣으세요.'); } catch (e) { alert('복사 실패: ' + e.message); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { alert('✓ 카카오톡 양식이 복사되었습니다. 카카오톡에 붙여 넣으세요.'); }, fallback);
    } else fallback();
  }

  // 아이패드용 설교문 보기(큰 글씨·스크롤·페이지넘김·전체화면·다크모드·인쇄)
  function sermonReadingView(r, opts) {
    r = r || {}; opts = opts || {};
    var qtMode = !!opts.qt;
    var w = window.open('', '_blank');
    if (!w) { alert('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.'); return; }
    var meta = [r.service, fmtD(r.sermon_date), r.preacher].filter(Boolean).map(function (x) { return esc(x); }).join(' · ');
    var hymnsTxt = hymnsLabel(r.hymns);
    var wOrder = (function () { try { return JSON.parse(r.worship_order || '[]') || []; } catch (e) { return []; } })();
    function isImg(u) { return /\.(jpg|jpeg|png|webp|gif|bmp)(\?|$)/i.test(u || ''); }

    // QT 출력에는 예배 순서·이미지(찬송가 등)를 넣지 않음
    var imgPageItems = [];
    var orderRows = '';
    if (!qtMode) {
      if (wOrder.length) {
        orderRows = wOrder.map(function (it, i) {
          var d = it.detail ? ' &nbsp;<span style="color:#5b6b7d">' + esc(it.detail) + '</span>' : '';
          var a = '';
          if (it.url && isImg(it.url)) {
            imgPageItems.push({ label: it.label || '항목', detail: it.detail || '', url: it.url });
            a = ' <span style="color:#1e874b;font-size:.8em">📑 이미지</span>';
          } else if (it.url) {
            a = ' <a href="' + esc(it.url) + '" target="_blank" rel="noopener" style="font-size:.8em">자료</a>';
          }
          return '<div><span style="display:inline-block;min-width:16px;color:#9a8f78">' + (i + 1) + '.</span> <b>' + esc(it.label || '항목') + '</b>' + d + a + '</div>';
        }).join('');
      } else {
        if (r.gyodok) orderRows += '<div>📜 <b>교독문</b> &nbsp;' + esc(r.gyodok) + '</div>';
        if (hymnsTxt) orderRows += '<div>🎵 <b>찬송가</b> &nbsp;' + esc(hymnsTxt) + '</div>';
        if (r.scripture) orderRows += '<div>📖 <b>본문</b> &nbsp;' + esc(r.scripture) + '</div>';
      }
    }
    var orderHtml = orderRows ? '<div class="order"><div class="order-t">■ 예배 순서</div>' + orderRows + '</div>' : '';
    var bibleSrc = qtMode ? (r.qt_bible_text || r.bible_text || '') : (r.bible_text || '');
    var bibleLabel = qtMode ? '성경 본문 (우리말성경)' : '성경 본문 (개역개정)';
    var bibleHtml = bibleSrc ? '<div class="bible"><div class="bible-t">■ ' + bibleLabel + (r.scripture ? ' <span style="font-weight:400;color:#9a8f78">' + esc(r.scripture) + '</span>' : '') + '</div>' + esc(bibleSrc).replace(/\n/g, '<br>') + '</div>' : '';
    // 설교 원고는 페이지 모드에서 화면 높이에 맞춰 동적으로 여러 페이지로 분할됨(아래 JS).
    // 원고 줄 배열을 JSON으로 안전하게 주입('<' 이스케이프로 </script> 차단)
    var bodyLinesJson = JSON.stringify((r.content || '').split('\n')).replace(/</g, '\\u003c');

    // ── 고정 페이지 구성(표지·성경·이미지). 설교 원고 페이지는 JS가 동적 생성 ──
    var pages = [];
    // 페이지 0: 표지 (제목+메타+예배순서)
    pages.push('<div class="pg pg-fixed pg-cover">' +
      '<h1>' + esc(r.title || '(제목 없음)') + '</h1>' +
      (r.scripture ? '<div class="scr">' + esc(r.scripture) + '</div>' : '') +
      (meta ? '<div class="meta">' + meta + '</div>' : '') +
      orderHtml +
      '</div>');
    // 페이지 1: 성경 본문 (있을 때만)
    if (bibleHtml) pages.push('<div class="pg pg-fixed pg-bible">' + bibleHtml + '</div>');
    // 페이지 2~N: 이미지 페이지 (예배순서 항목 중 이미지)
    imgPageItems.forEach(function (it) {
      pages.push('<div class="pg pg-fixed pg-img">' +
        '<div class="img-pg-t">' + esc(it.label) + (it.detail ? ' · ' + esc(it.detail) : '') + '</div>' +
        '<img src="' + esc(it.url) + '" alt="' + esc(it.label) + '">' +
        '</div>');
    });

    var css = [
      '*{box-sizing:border-box}',
      'html,body{margin:0;height:100%}',
      'body{font-family:"Noto Serif KR",serif;background:#fbf9f4;color:#1a1a1a;font-size:22px;line-height:1.9;-webkit-text-size-adjust:100%;display:flex;flex-direction:column}',
      /* 상단 바 */
      '.bar{flex-shrink:0;position:sticky;top:0;background:rgba(255,255,255,.96);border-bottom:1px solid #e3ddd0;padding:6px 12px;display:flex;gap:6px;align-items:center;flex-wrap:nowrap;overflow-x:auto;z-index:10;-webkit-overflow-scrolling:touch}',
      '.bar button{flex-shrink:0;font:inherit;font-size:14px;border:1px solid #cdd7e3;background:#fff;border-radius:8px;padding:5px 11px;cursor:pointer;white-space:nowrap}',
      '.bar button.active{background:#032257;color:#fff;border-color:#032257}',
      '.bar .hint{flex-shrink:0;font-size:12px;color:#9a8f78;margin-left:auto;white-space:nowrap}',
      /* 덱 컨테이너 */
      '#deck{flex:1;overflow:hidden;position:relative}',
      '#track{height:100%}',
      /* ── 스크롤 모드 (기본) ── */
      'body.scroll #deck{overflow-y:auto;overflow-x:hidden}',
      'body.scroll #track{display:block;height:auto;transform:none!important}',
      'body.scroll .pg{max-width:820px;margin:0 auto;padding:24px 22px 60px;height:auto}',
      'body.scroll .pg+.pg{border-top:2px dashed #e7e0cf;padding-top:36px}',
      /* ── 페이지 모드 (transform 슬라이드 — iOS 안정) ── */
      'body.paged #deck{overflow:hidden}',
      'body.paged #track{display:flex;flex-direction:row;height:100%;transition:transform .32s cubic-bezier(.4,0,.2,1);will-change:transform}',
      'body.paged .pg{flex:0 0 100%;width:100%;height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:24px 28px 44px}',
      'body.paged .pg-img{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px}',
      /* 공통 요소 */
      'h1{font-size:1.6em;margin:0 0 6px;line-height:1.35}',
      '.scr{font-size:1.05em;color:#7a5d27;font-weight:600;margin:0 0 4px}',
      '.meta{font-size:.78em;color:#9a8f78;margin:0 0 14px;font-family:"Noto Sans KR",sans-serif}',
      '.order{font-family:"Noto Sans KR",sans-serif;font-size:.82em;background:#f1ece0;border:1px solid #e4dcc9;border-radius:10px;padding:11px 15px;margin:0 0 0;line-height:1.85}',
      '.order-t{font-weight:700;color:#7a5d27;margin-bottom:5px}.order a{color:#1f6feb}',
      '.bible{font-size:1em;background:#f6f2e8;border:1px solid #e7e0cf;border-left:4px solid #b89b5e;border-radius:8px;padding:14px 18px;line-height:1.95}',
      '.bible-t{font-family:"Noto Sans KR",sans-serif;font-weight:700;font-size:.8em;color:#7a5d27;margin-bottom:7px}',
      '.pg-img .img-pg-t{font-family:"Noto Sans KR",sans-serif;font-size:.75em;color:#7a5d27;font-weight:700;margin-bottom:10px;text-align:center}',
      '.pg-img img{max-width:100%;max-height:calc(100% - 40px);object-fit:contain;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.1)}',
      '.body{white-space:normal}',
      /* 페이지 표시기 */
      '#pg_ind{flex-shrink:0;font-size:12px;color:#9a8f78;min-width:44px;text-align:center;display:none}',
      'body.paged #pg_ind{display:block}',
      /* 몰입 모드(전체화면 폴백) — 상단 바 숨김 */
      'body.immersive .bar{display:none}',
      '#exitfs{position:fixed;top:8px;left:8px;z-index:30;display:none;font:inherit;font-size:12px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.78);color:#5b6b7d;border-radius:16px;padding:5px 11px;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.1);opacity:.78}',
      'body.immersive #exitfs{display:block}',
      'body.dark #exitfs{background:rgba(35,38,44,.85);color:#cdd3dc;border-color:#3a3d44}',
      /* 페이지 모드: 양 끝 탭 영역 + 화살표 힌트 */
      '.edge{position:fixed;top:0;bottom:0;width:22%;max-width:150px;z-index:15;display:none;align-items:center;pointer-events:none}',
      'body.paged .edge{display:flex}',
      '#edgeL{left:0;justify-content:flex-start;padding-left:6px}#edgeR{right:0;justify-content:flex-end;padding-right:6px}',
      '.edge span{font-size:34px;line-height:1;color:rgba(60,72,90,.16);transition:color .15s}',
      '.edge:active span{color:rgba(60,72,90,.42)}',
      'body.dark .edge span{color:rgba(255,255,255,.18)}body.dark .edge:active span{color:rgba(255,255,255,.44)}',
      /* 다크 모드 */
      'body.dark{background:#15171b;color:#e9e6df}',
      'body.dark .bar{background:rgba(21,23,27,.96);border-color:#2a2d33}',
      'body.dark .bar button{background:#23262c;color:#e9e6df;border-color:#3a3d44}',
      'body.dark .bar button.active{background:#5b8dee;border-color:#5b8dee;color:#fff}',
      'body.dark .scr{color:#e0c98a}body.dark .meta{color:#8a8576}',
      'body.dark .order{background:#23262c;border-color:#3a3d44}body.dark .order-t{color:#e0c98a}',
      'body.dark .bible{background:#1e2026;border-color:#3a3d44;border-left-color:#7a5d27}body.dark .bible-t{color:#e0c98a}',
      'body.dark .pg+.pg{border-top-color:#2a2d33}',
      '@media print{.bar{display:none}body{display:block;font-size:13pt}#deck{display:block;overflow:visible}#track,body.paged #track{display:block;transform:none!important}body.paged .pg{width:auto;height:auto;page-break-after:always;overflow:visible}}'
    ].join('');

    var js = '(function(){' +
      'var b=document.body,s=22,deck=document.getElementById("deck"),track=document.getElementById("track"),ind=document.getElementById("pg_ind");' +
      'var BODY=' + bodyLinesJson + ';' +
      'var curPg=0,total=0,reflowTimer=null;' +
      'function eh(x){return String(x).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}' +
      'function lineHtml(x){return (x?eh(x):"")+"<br>";}' +
      'function fullBodyHtml(){return BODY.map(function(x){return x?eh(x):"";}).join("<br>");}' +
      'function mkBodyPage(){var pg=document.createElement("div");pg.className="pg pg-body";var inr=document.createElement("div");inr.className="body";pg.appendChild(inr);return pg;}' +
      /* 설교 원고를 현재 화면 높이에 맞춰 분할(페이지 모드) 또는 한 덩어리(스크롤 모드) */
      'function buildBody(){' +
        'var olds=track.querySelectorAll(".pg-body");for(var k=0;k<olds.length;k++)olds[k].parentNode.removeChild(olds[k]);' +
        'if(!b.classList.contains("paged")){var pg=mkBodyPage();track.appendChild(pg);pg.firstChild.innerHTML=fullBodyHtml();}' +
        'else{var i=0;if(!BODY.length){var e=mkBodyPage();track.appendChild(e);}' +
          'while(i<BODY.length){var pg=mkBodyPage();track.appendChild(pg);var inr=pg.firstChild,started=false;' +
            'while(i<BODY.length){var prev=inr.innerHTML;inr.innerHTML=prev+lineHtml(BODY[i]);' +
              'if(started&&pg.scrollHeight>pg.clientHeight+1){inr.innerHTML=prev;break;}' +
              'started=true;i++;}' +
          '}' +
        '}' +
        'total=track.querySelectorAll(".pg").length;if(curPg>total-1)curPg=total-1;if(curPg<0)curPg=0;' +
      '}' +
      /* 글자 크기 */
      'function ap(){b.style.fontSize=s+"px";try{localStorage.setItem("sermonFs",s)}catch(e){}if(b.classList.contains("paged")){buildBody();apply();}}' +
      'try{var sv=parseInt(localStorage.getItem("sermonFs"),10);if(sv)s=sv}catch(e){}' +
      'document.getElementById("inc").onclick=function(){s=Math.min(52,s+2);ap()};' +
      'document.getElementById("dec").onclick=function(){s=Math.max(14,s-2);ap()};' +
      /* 다크 */
      'document.getElementById("dark").onclick=function(){b.classList.toggle("dark")};' +
      /* 전체화면 — 지원되면 Fullscreen API, 아이패드 등 미지원이면 몰입 모드(바 숨김) */
      'var fsBtn=document.getElementById("fs"),exitBtn=document.getElementById("exitfs");' +
      'function isFs(){return document.fullscreenElement||document.webkitFullscreenElement;}' +
      'function updateFs(){var on=isFs()||b.classList.contains("immersive");fsBtn.textContent=on?"⊡ 창모드":"⛶ 전체화면";fsBtn.classList.toggle("active",on);}' +
      'function reflow(){if(b.classList.contains("paged")){buildBody();apply();}}' +
      'function enterImmersive(){b.classList.add("immersive");updateFs();setTimeout(reflow,60);}' +
      'function exitImmersive(){b.classList.remove("immersive");updateFs();setTimeout(reflow,60);}' +
      'fsBtn.onclick=function(){var el=document.documentElement;' +
        'if(isFs()){(document.exitFullscreen||document.webkitExitFullscreen).call(document);return;}' +
        'if(b.classList.contains("immersive")){exitImmersive();return;}' +
        'var req=el.requestFullscreen||el.webkitRequestFullscreen;' +
        'if(req){try{var p=req.call(el);if(p&&p.catch)p.catch(function(){enterImmersive();});}catch(e){enterImmersive();}}' +
        'else{enterImmersive();}' +
      '};' +
      'exitBtn.onclick=function(){if(isFs()){(document.exitFullscreen||document.webkitExitFullscreen).call(document);}exitImmersive();};' +
      'document.addEventListener("fullscreenchange",function(){updateFs();setTimeout(reflow,60);});' +
      'document.addEventListener("webkitfullscreenchange",function(){updateFs();setTimeout(reflow,60);});' +
      /* transform 슬라이드 적용 */
      'function apply(){if(b.classList.contains("paged")){track.style.transform="translateX("+(-curPg*100)+"%)";}ind.textContent=(curPg+1)+"/"+total;}' +
      'function goPage(d){curPg=Math.max(0,Math.min(total-1,curPg+d));apply();}' +
      /* 페이지↔스크롤 토글 */
      'var pgBtn=document.getElementById("pgbtn");' +
      'function setMode(paged){' +
        'b.classList.toggle("paged",paged);b.classList.toggle("scroll",!paged);' +
        'pgBtn.classList.toggle("active",paged);' +
        'try{localStorage.setItem("sermonPaged",paged?"1":"0")}catch(e){}' +
        'if(!paged){track.style.transform="";}else{curPg=0;}' +
        'buildBody();apply();' +
      '}' +
      'pgBtn.onclick=function(){setMode(!b.classList.contains("paged"))};' +
      'ap();' +
      'try{setMode(localStorage.getItem("sermonPaged")==="1")}catch(e){setMode(false)}' +
      /* ◀ ▶ 버튼 */
      'document.getElementById("prev").onclick=function(){goPage(-1)};' +
      'document.getElementById("next").onclick=function(){goPage(1)};' +
      /* 키보드 */
      'document.addEventListener("keydown",function(e){' +
        'if(!b.classList.contains("paged"))return;' +
        'if(e.key==="ArrowRight"||e.key==="PageDown"||e.key===" "){e.preventDefault();goPage(1);}' +
        'else if(e.key==="ArrowLeft"||e.key==="PageUp"){e.preventDefault();goPage(-1);}' +
      '});' +
      /* 좌/우 가장자리 탭으로 페이지 넘김 (스와이프가 안 되는 환경 대비, 링크·버튼·스와이프 직후 제외) */
      'var moved=false;' +
      'deck.addEventListener("click",function(e){if(!b.classList.contains("paged"))return;if(moved){moved=false;return;}if(e.target.closest&&e.target.closest("a,button,input,textarea"))return;var x=e.clientX,w=window.innerWidth||deck.clientWidth;if(x<w*0.22){goPage(-1);}else if(x>w*0.78){goPage(1);}});' +
      /* 터치 스와이프 — 손가락 따라 미리보기 후 손 떼면 페이지 전환 */
      'var sx=0,sy=0,st=0,sw=0,dragging=false,locked=false;' +
      'track.addEventListener("touchstart",function(e){if(!b.classList.contains("paged"))return;var t=e.touches[0];sx=t.clientX;sy=t.clientY;st=Date.now();sw=deck.clientWidth||window.innerWidth||1;dragging=true;locked=false;track.style.transition="none";},{passive:true});' +
      'track.addEventListener("touchmove",function(e){if(!dragging)return;var t=e.touches[0],dx=t.clientX-sx,dy=t.clientY-sy;' +
        'if(!locked){if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>6){locked="x";}else if(Math.abs(dy)>10){locked="y";}}' +
        'if(locked==="x"){moved=true;var pct=(-curPg*100)+(dx/sw*100);track.style.transform="translateX("+pct+"%)";}},{passive:true});' +
      'track.addEventListener("touchend",function(e){if(!dragging)return;dragging=false;track.style.transition="";' +
        'var t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy,dt=Date.now()-st;' +
        'if(locked==="x"&&(Math.abs(dx)>sw*0.12||(dt<500&&Math.abs(dx)>30))){goPage(dx<0?1:-1);}else{apply();}' +
        'setTimeout(function(){moved=false;},50);},{passive:true});' +
      /* 창 크기/회전 시 재분할 */
      'window.addEventListener("resize",function(){clearTimeout(reflowTimer);reflowTimer=setTimeout(reflow,150);});' +
      /* 인쇄 */
      'document.getElementById("print").onclick=function(){window.print()};' +
      '})();';

    var html = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
      '<title>' + esc(r.title || '설교문') + '</title>' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet">' +
      '<style>' + css + '</style></head><body class="scroll">' +
      '<div class="bar">' +
        '<button id="dec">가–</button>' +
        '<button id="inc">가+</button>' +
        '<button id="dark">🌙</button>' +
        '<button id="fs">⛶ 전체화면</button>' +
        '<button id="pgbtn">📖 페이지</button>' +
        '<button id="prev">◀</button>' +
        '<span id="pg_ind"></span>' +
        '<button id="next">▶</button>' +
        '<button id="print">🖨</button>' +
        '<span class="hint">' + (qtMode ? 'QT · 우리말성경' : '설교') + ' · 좌우 끝을 탭하면 넘김</span>' +
      '</div>' +
      '<div id="deck"><div id="track">' + pages.join('') + '</div></div>' +
      '<div class="edge" id="edgeL"><span>‹</span></div><div class="edge" id="edgeR"><span>›</span></div>' +
      '<button id="exitfs">⊡ 도구 보기</button>' +
      '<script>' + js + '<\/script>' +
      '</body></html>';
    w.document.write(html); w.document.close(); w.focus();
  }

  // ====================================================================
  //  주보 제작 (설교 연동 · Supabase 저장/게시 · 인쇄 PDF)
  // ====================================================================
  var BULLETIN_PRESET = ['경배와찬양', '목회 기도', '송영', '성시교독', '신앙고백', '찬송', '기도', '성경봉독', '성가대찬양', '말씀강해', '헌금봉헌', '교회소식', '기도', '찬송', '축도'];
  var OFFER_KEYS = ['십일조', '감사헌금', '주일헌금', '건축헌금', '선교헌금', '유년부', '차량헌금', '일천번기도'];
  var AMOUNT_KEYS = ['십일조', '감사헌금', '주일헌금', '생일감사', '건축헌금', '선교헌금', '차량헌금', '일천번제', '합계'];
  var COMMITTEE_KEYS = ['헌금위원', '안내위원', '주차·사찰', '이주의 기도'];
  function addDays(d, n) { var t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + n); return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()); }
  function nextSunday() { var d = new Date(); var add = (7 - d.getDay()) % 7; d.setDate(d.getDate() + (add === 0 ? 7 : add)); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  // 그 해 몇 번째 일요일(주차)
  function weekNoOfYear(bd) {
    var d = new Date(bd + 'T00:00:00'); var y = d.getFullYear();
    var jan1 = new Date(y, 0, 1);
    var firstSun = new Date(y, 0, 1 + ((7 - jan1.getDay()) % 7)); // 그 해 첫 일요일
    return Math.round((d - firstSun) / (7 * 86400000)) + 1;
  }
  // 교회 설립일(설정에서 변경). 호수의 주년 계산 기준
  var FOUNDED_DATE = '1964-03-01', FOUNDED_YEAR = 1964;
  var PDF_NAME = '{date} 주보'; // 주보 PDF 기본 파일명 형식
  function loadGeneral() {
    return api('GET', 'church_settings?key=eq.general&select=data').then(function (rows) {
      var g = (rows && rows[0] && rows[0].data) || {};
      if (g.founded) { FOUNDED_DATE = g.founded; FOUNDED_YEAR = new Date(g.founded + 'T00:00:00').getFullYear(); }
      if (g.pdf_name) PDF_NAME = g.pdf_name;
      return g;
    }).catch(function () { return {}; });
  }
  // 호수: (설립연도 기준 주년)-(그 해 주차). 예: 1964설립·2026-07-05 → 62-27
  function bulletinNo(bd) { if (!bd) return ''; var y = new Date(bd + 'T00:00:00').getFullYear(); return (y - FOUNDED_YEAR) + '-' + weekNoOfYear(bd); }
  // 주보 PDF 파일명: {date}=YYYYMMDD, {no}=호수, {week}=주차
  function bulletinFileName(rec) {
    rec = rec || {}; var d = rec.data || {};
    var ds = String(rec.bdate || '').replace(/-/g, '');
    return ((PDF_NAME || '{date} 주보').replace(/\{date\}/g, ds).replace(/\{no\}/g, d.no || '').replace(/\{week\}/g, d.week || '').replace(/\s+/g, ' ').trim()) || ('주보 ' + ds);
  }
  // 주차 라벨: "7월 첫째 주"
  function bulletinWeekLabel(bd) {
    if (!bd) return ''; var d = new Date(bd + 'T00:00:00');
    var nth = Math.floor((d.getDate() - 1) / 7) + 1;
    var ord = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째'][nth - 1] || (nth + '');
    return (d.getMonth() + 1) + '월 ' + ord + ' 주';
  }
  function ymOf(bd) { return String(bd || '').slice(0, 7); }
  function nextMonthYM(bd) { var d = new Date(bd + 'T00:00:00'); d.setMonth(d.getMonth() + 1); return d.getFullYear() + '-' + pad2(d.getMonth() + 1); }
  // 그 달의 마지막 주일인가(다음 일요일이 다음 달이면 마지막 주일)
  function isLastSundayOfMonth(bd) { return new Date(addDays(bd, 7) + 'T00:00:00').getMonth() !== new Date(bd + 'T00:00:00').getMonth(); }

  // 연간 봉사위원 설정 캐시 (설정 탭에서 저장, 주보에서 사용)
  var COMMITTEES = null; // [{month:'2026-07', offering, guide, parking}]
  function loadCommittees() {
    return api('GET', 'church_settings?key=eq.committees&select=data').then(function (rows) {
      COMMITTEES = (rows && rows[0] && rows[0].data && rows[0].data.months) || [];
      return COMMITTEES;
    }).catch(function () { COMMITTEES = []; return COMMITTEES; });
  }
  function committeeFor(ym) { if (!COMMITTEES) return null; for (var i = 0; i < COMMITTEES.length; i++) if (COMMITTEES[i].month === ym) return COMMITTEES[i]; return null; }

  function renderBulletinAdmin(panel) {
    panel.innerHTML =
      '<div class="fin-card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
      '<div><h3 style="margin:0 0 4px;color:var(--accent,#032257)">주보 제작</h3><p style="margin:0;color:var(--ink-soft,#7b8794);font-size:.9rem">설교목록에서 <b>다음 주 설교</b>를 불러와 채우고, <b>게시</b>하면 홈페이지 주보란에 자동 반영됩니다. (인쇄는 금액 포함, 홈페이지는 금액 제외)</p></div>' +
      '<button class="btn btn-solid" id="bt_new" style="white-space:nowrap">🖨 주보 제작</button></div></div>' +
      '<div id="bt_list"><p class="qt-loading">불러오는 중…</p></div>';
    panel.querySelector('#bt_new').onclick = function () { bulletinEditor({}); };
    loadBulletinList(panel);
  }
  function loadBulletinList(panel) {
    api('GET', 'bulletins?select=id,bdate,title,scripture,preacher,published,updated_at&order=bdate.desc').then(function (rows) {
      var box = panel.querySelector('#bt_list');
      if (!rows || !rows.length) { box.innerHTML = '<div class="fin-card"><p style="margin:0;color:var(--ink-soft)">아직 제작한 주보가 없습니다. <b>주보 제작</b>으로 시작하세요.</p></div>'; return; }
      box.innerHTML = '<div class="fin-card"><div style="overflow:auto"><table class="fin-table"><thead><tr><th>주일</th><th>제목</th><th>본문</th><th>게시</th><th>관리</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td style="white-space:nowrap">' + esc(fmtD(r.bdate)) + '</td><td><b>' + esc(r.title || '(제목없음)') + '</b></td><td style="white-space:nowrap">' + esc(r.scripture || '') + '</td>' +
            '<td>' + (r.published ? '<span class="fin-pill" style="background:#e6f4ea;color:#1e874b">게시중</span>' : '<span class="fin-pill">비공개</span>') + '</td>' +
            '<td style="white-space:nowrap"><button class="btn btn-line bt-edit" data-id="' + esc(r.id) + '" style="padding:4px 10px;font-size:.78rem">수정</button> <button class="btn btn-line bt-print" data-id="' + esc(r.id) + '" style="padding:4px 10px;font-size:.78rem">🖨 인쇄</button> <button class="btn btn-line bt-del" data-id="' + esc(r.id) + '" style="padding:4px 9px;font-size:.78rem;color:#c0392b">삭제</button></td></tr>';
        }).join('') + '</tbody></table></div></div>';
      var byId = {}; rows.forEach(function (r) { byId[r.id] = r; });
      Array.prototype.forEach.call(box.querySelectorAll('.bt-edit'), function (b) { b.onclick = function () { api('GET', 'bulletins?id=eq.' + b.dataset.id + '&select=*').then(function (rs) { bulletinEditor((rs && rs[0]) || {}); }); }; });
      Array.prototype.forEach.call(box.querySelectorAll('.bt-print'), function (b) {
        b.onclick = function () {
          var w = window.open('', '_blank'); // 클릭 즉시 동기 오픈(팝업 차단 회피)
          api('GET', 'bulletins?id=eq.' + b.dataset.id + '&select=*').then(function (rs) {
            var rec = (rs && rs[0]) || {};
            if (w && window.BulletinRender) { w.document.write(window.BulletinRender.html(rec, { amounts: true, layout: 'print3', fileName: bulletinFileName(rec) })); w.document.close(); w.focus(); }
            else if (w) { w.close(); alert('주보 렌더러를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.'); }
          }).catch(function (e) { if (w) w.close(); alert('불러오기 실패: ' + e.message); });
        };
      });
      Array.prototype.forEach.call(box.querySelectorAll('.bt-del'), function (b) { b.onclick = function () { if (!confirm('이 주보를 삭제할까요?')) return; api('DELETE', 'bulletins?id=eq.' + b.dataset.id, null, 'return=minimal').then(function () { loadBulletinList(panel); }).catch(function (e) { alert('삭제 실패: ' + e.message); }); }; });
    }).catch(function (e) {
      var box = panel.querySelector('#bt_list');
      if (/42P01|PGRST205|does not exist|schema cache|Could not find the table/i.test(e.message)) box.innerHTML = msgCard('테이블 준비 필요', 'Supabase → SQL Editor 에서 supabase/bulletins.sql 을 1회 실행해 주세요.');
      else box.innerHTML = msgCard('조회 실패', e.message);
    });
  }

  function bulletinEditor(rec) {
    rec = rec || {}; var d = rec.data || {};
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:#f5f7fa;z-index:9000;overflow:auto';
    var bd0 = fmtD(rec.bdate) || nextSunday();
    var order = (d.order && d.order.length) ? d.order : BULLETIN_PRESET.map(function (n) { return { name: n, detail: '' }; });
    function tA(label, id, val, ph, h) { return '<div class="af-field" style="margin-bottom:10px"><label>' + label + '</label><textarea id="' + id + '" placeholder="' + esc(ph || '') + '" style="min-height:' + (h || 60) + 'px">' + esc(val || '') + '</textarea></div>'; }
    function tI(label, id, val, ph) { return '<div class="af-field"><label>' + label + '</label><input type="text" id="' + id + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '"></div>'; }
    var off = d.offering || {}, amt = d.offering_amounts || {}, com = d.committee || {};
    ov.innerHTML =
      '<header style="position:sticky;top:0;z-index:6;background:linear-gradient(180deg,#fff,#f7f9fc);border-bottom:1px solid #e1e6ef;box-shadow:0 2px 10px rgba(3,34,87,.06)">' +
      '<div style="max-width:1100px;margin:0 auto;padding:11px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
      '<button class="btn btn-line" id="bt_close" style="padding:8px 14px;border-radius:9px">‹ 닫기</button>' +
      '<div style="flex:1;text-align:center"><div style="font-family:\'Noto Serif KR\',serif;font-weight:700;font-size:1.2rem;color:var(--accent,#032257)">주보 제작</div><div style="font-size:.72rem;color:#9aa5b1">설교 연동 · 인쇄(PDF) · 홈페이지 게시</div></div>' +
      '<button class="btn btn-line" id="bt_pull" style="padding:8px 13px;border-radius:9px;background:#eef4ff;border-color:#9cc0f0">📥 데이터 불러오기</button>' +
      '<button class="btn btn-line" id="bt_ai" style="padding:8px 13px;border-radius:9px;background:#f3eefc;border-color:#c4a8ee">✨ AI 검수</button>' +
      '<button class="btn btn-line" id="bt_save" style="padding:8px 13px;border-radius:9px">💾 임시저장</button>' +
      '<button class="btn btn-line" id="bt_printbtn" style="padding:8px 13px;border-radius:9px">🖨 3단 인쇄(PDF)</button>' +
      '<button class="btn btn-solid" id="bt_publish" style="padding:8px 16px;border-radius:9px;font-weight:700">🌐 게시</button>' +
      '<div id="bt_msg" class="fin-msg" style="flex-basis:100%;text-align:right;margin-top:-2px"></div>' +
      '</div></header>' +
      '<div style="max-width:1100px;margin:0 auto;padding:20px 18px 70px">' +
      // 기본
      '<div class="fin-card"><h4 style="margin:0 0 10px;color:var(--accent)">① 기본 정보</h4>' +
      '<div class="fin-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">' +
      '<div class="af-field"><label>주일 날짜</label><input type="date" id="bt_bdate" value="' + esc(bd0) + '"></div>' +
      tI('호수(No.) <span style="font-weight:400;font-size:.72rem;color:#9aa5b1">날짜 선택 시 자동</span>', 'bt_no', d.no || bulletinNo(bd0), '예: 62-27') +
      tI('주차 <span style="font-weight:400;font-size:.72rem;color:#9aa5b1">자동</span>', 'bt_week', d.week || bulletinWeekLabel(bd0), '예: 7월 첫째 주') +
      '</div></div>' +
      // 주일 낮 예배
      '<div class="fin-card"><h4 style="margin:0 0 10px;color:var(--accent)">② 주일 낮 예배</h4>' +
      '<div class="fin-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:12px">' +
      tI('설교 제목', 'bt_title', rec.title) + tI('본문', 'bt_scripture', rec.scripture, '예: 나훔 2:8-13') + tI('설교자', 'bt_preacher', rec.preacher || '김동석 목사') +
      '</div>' +
      '<label style="font-size:.82rem;color:#7b8794;display:block;margin-bottom:6px">예배 순서 <span style="font-weight:400">(순서명 · 내용/담당) — 설교 불러오기 시 예배 순서가 자동 채워집니다</span></label>' +
      '<div id="bt_order"></div></div>' +
      // 주중 예배
      '<div class="fin-card"><h4 style="margin:0 0 10px;color:var(--accent)">③ 주중 · 새벽 · QT</h4>' +
      '<div class="fin-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div>' + tI('수요기도회 — 강해 시리즈', 'bt_wed_series', d.wed_series, '예: 레위기 강해(1)') + '</div>' +
      '<div>' + tI('수요기도회 — 제목', 'bt_wed_title', d.wed_title, '예: 레위기란 어떤 책인가?') + '</div>' +
      '</div>' +
      tI('수요기도회 — 날짜·본문·설교자 <span style="font-weight:400;font-size:.72rem;color:#9aa5b1">날짜 자동(그 주 수요일)</span>', 'bt_wed_line', d.wed_dateline, '예: 2026. 07. 01 · 레위기 1장1절 · 김동석 목사') +
      '<div class="fin-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">' +
      '<div>' + tI('새벽기도회 본문', 'bt_dawn', d.dawn, '예: 나훔, 시편 강해') + '</div>' +
      '<div>' + tI('매일 QT 본문', 'bt_qt', d.qt, '예: 나훔 3장, 시편107편~109편') + '</div>' +
      '</div></div>' +
      // 향기로운 예물 + 헌금 금액(통합 동적 표 — 특별헌금 등 자유 추가)
      '<div class="fin-card"><h4 style="margin:0 0 4px;color:var(--accent)">④ 향기로운 예물 · 헌금</h4>' +
      '<p style="margin:0 0 10px;font-size:.8rem;color:#9aa5b1">항목을 자유롭게 추가할 수 있습니다(특별헌금·추수감사·맥추감사 등). <b>명단</b>은 홈페이지에도 공개되고, <b>금액</b>은 🔒 인쇄(PDF)에만 표시됩니다. — 데이터 불러오기 시 직전 주일 헌금이 항목별로 채워집니다.</p>' +
      '<div id="bt_offer"></div></div>' +
      // 봉사위원
      '<div class="fin-card"><h4 style="margin:0 0 10px;color:var(--accent)">⑥ 봉사위원 · 이주의 기도</h4>' +
      '<div class="fin-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      COMMITTEE_KEYS.map(function (k) { return tI(k, 'bt_com_' + k, com[k]); }).join('') +
      '</div></div>' +
      // 칼럼
      '<div class="fin-card"><h4 style="margin:0 0 10px;color:var(--accent)">⑦ 신앙과 책 (칼럼)</h4>' +
      tI('제목/출처', 'bt_col_title', d.column_title, '예: 김다위, 「하나님 마음에 맞는 사람」 (두란노)') +
      tA('본문', 'bt_col_body', d.column_body, '칼럼 내용…', 140) + '</div>' +
      // 광고
      '<div class="fin-card"><h4 style="margin:0 0 10px;color:var(--accent)">⑧ 한 주의 소식 (광고)</h4>' +
      tA('소식 (한 줄에 하나씩)', 'bt_notices', d.notices, '다음 주는 맥추감사주일로 지킵니다.\n학습세례 문답 및 성찬 예식이 있습니다.', 140) + '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    function close() { ov.remove(); document.body.style.overflow = ''; }
    ov.querySelector('#bt_close').onclick = close;
    function bmsg(t, c) { var e = ov.querySelector('#bt_msg'); e.style.color = c || '#7b8794'; e.textContent = t; }

    // 수요기도회 날짜(그 주 수요일 = 주일+3) 자동 입력. 본문·설교자는 뒤에 유지
    function wedDateStr(bd) { var d = new Date(addDays(bd, 3) + 'T00:00:00'); return d.getFullYear() + '. ' + pad2(d.getMonth() + 1) + '. ' + pad2(d.getDate()); }
    function setWedDate(bd) {
      var el = ov.querySelector('#bt_wed_line'); if (!el) return;
      var dt = wedDateStr(bd), cur = el.value;
      var re = /^\s*\d{4}\s*[.\-]\s*\d{1,2}\s*[.\-]\s*\d{1,2}\s*\.?/;
      if (re.test(cur)) el.value = cur.replace(re, dt);            // 앞 날짜만 교체
      else if (!cur.trim()) el.value = dt + ' · ';                  // 비었으면 날짜+구분자
      else el.value = dt + ' · ' + cur;                            // 본문/설교자만 있으면 앞에 날짜
    }
    // 주일 날짜 선택 → 호수·주차·수요일 날짜 자동 갱신
    ov.querySelector('#bt_bdate').addEventListener('change', function () {
      var bd = this.value; if (!bd) return;
      ov.querySelector('#bt_no').value = bulletinNo(bd);
      ov.querySelector('#bt_week').value = bulletinWeekLabel(bd);
      setWedDate(bd);
    });
    if (!rec.id && !(d && d.wed_dateline)) setWedDate(bd0); // 신규 작성 시 기본 채움
    // 설립일(호수 주년 기준)이 아직 로드 전이면 로드 후 호수 보정(사용자가 비워둔 경우만)
    loadGeneral().then(function () {
      var bd = ov.querySelector('#bt_bdate').value;
      if (bd && !(d && d.no)) ov.querySelector('#bt_no').value = bulletinNo(bd);
    });

    // 예배 순서 편집
    var oBox = ov.querySelector('#bt_order');
    function renderBOrder() {
      oBox.innerHTML = order.map(function (it, i) {
        return '<div class="bo-row" style="display:flex;gap:7px;align-items:center;margin-bottom:6px">' +
          '<span style="flex:0 0 18px;text-align:center;color:#9aa5b1;font-size:.78rem">' + (i + 1) + '</span>' +
          '<input type="text" class="bo-name" data-i="' + i + '" value="' + esc(it.name || '') + '" placeholder="순서명" style="flex:0 0 130px;padding:6px 8px;border:1px solid #dfe5ee;border-radius:7px;font:inherit;font-size:.85rem">' +
          '<input type="text" class="bo-detail" data-i="' + i + '" value="' + esc(it.detail || '') + '" placeholder="내용/담당 (예: 79장, 김애자 권사)" style="flex:1;padding:6px 8px;border:1px solid #dfe5ee;border-radius:7px;font:inherit;font-size:.85rem">' +
          '<button type="button" class="bo-del" data-i="' + i + '" style="border:0;background:none;color:#c0392b;cursor:pointer">✕</button></div>';
      }).join('') + '<button type="button" class="btn btn-line" id="bo_add" style="padding:5px 12px;font-size:.8rem;margin-top:4px">＋ 순서 추가</button>';
      Array.prototype.forEach.call(oBox.querySelectorAll('.bo-name'), function (inp) { inp.oninput = function () { order[Number(inp.dataset.i)].name = inp.value; }; });
      Array.prototype.forEach.call(oBox.querySelectorAll('.bo-detail'), function (inp) { inp.oninput = function () { order[Number(inp.dataset.i)].detail = inp.value; }; });
      Array.prototype.forEach.call(oBox.querySelectorAll('.bo-del'), function (b) { b.onclick = function () { order.splice(Number(b.dataset.i), 1); renderBOrder(); }; });
      oBox.querySelector('#bo_add').onclick = function () { order.push({ name: '', detail: '' }); renderBOrder(); };
    }
    renderBOrder();

    // ── 헌금(향기로운 예물 명단 + 금액) 동적 표 — 특별헌금 등 자유 추가 ──
    var OFFER_BASE = ['십일조', '감사헌금', '주일헌금', '생일감사', '건축헌금', '선교헌금', '유년부', '차량헌금', '일천번기도'];
    var coffer = (function () {
      var names = [], idx = {};
      function add(n) { if (n && !idx[n]) { idx[n] = 1; names.push(n); } }
      OFFER_BASE.forEach(add);
      Object.keys(off).forEach(add);
      Object.keys(amt).forEach(function (k) { if (k !== '합계') add(k); });
      return names.map(function (n) { return { name: n, givers: off[n] || '', amount: amt[n] || '' }; });
    })();
    function numAmt(v) { return Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')) || 0; }
    function commaAmt(v) { var n = numAmt(v); return n ? n.toLocaleString('en-US') : ''; }
    var ofBox = ov.querySelector('#bt_offer');
    function renderOffer() {
      var total = coffer.reduce(function (s, r) { return s + numAmt(r.amount); }, 0);
      ofBox.innerHTML = '<div style="overflow:auto"><table class="fin-table" style="table-layout:fixed;width:100%;min-width:560px">' +
        '<colgroup><col style="width:22%"><col style="width:48%"><col style="width:24%"><col style="width:6%"></colgroup>' +
        '<thead><tr><th>항목</th><th>헌금자 명단 <span style="font-weight:400;color:#9aa5b1;font-size:.72rem">(공개)</span></th><th>금액 <span style="font-weight:400;color:#8a6d1f;font-size:.72rem">🔒</span></th><th></th></tr></thead><tbody>' +
        coffer.map(function (r, i) {
          return '<tr>' +
            '<td><input type="text" class="of-name" data-i="' + i + '" value="' + esc(r.name || '') + '" placeholder="예: 특별헌금" style="width:100%;padding:5px 7px;border:1px solid #dfe5ee;border-radius:7px;font:inherit;font-size:.84rem;font-weight:600;color:#34415c;box-sizing:border-box"></td>' +
            '<td><input type="text" class="of-givers" data-i="' + i + '" value="' + esc(r.givers || '') + '" placeholder="이름 이름 이름" title="' + esc(r.givers || '') + '" style="width:100%;padding:5px 7px;border:1px solid #dfe5ee;border-radius:7px;font:inherit;font-size:.84rem;box-sizing:border-box"></td>' +
            '<td><input type="text" class="of-amount" data-i="' + i + '" value="' + esc(r.amount || '') + '" placeholder="0" inputmode="numeric" style="width:100%;padding:5px 7px;border:1px solid #dfe5ee;border-radius:7px;font:inherit;font-size:.84rem;text-align:right;box-sizing:border-box"></td>' +
            '<td style="text-align:center"><button type="button" class="of-del" data-i="' + i + '" style="border:0;background:none;color:#c0392b;cursor:pointer">✕</button></td></tr>';
        }).join('') +
        '<tr style="background:#faf6ea"><td style="font-weight:700;color:#8a6d1f">합계</td><td></td><td style="text-align:right;font-weight:700">' + (total ? total.toLocaleString('en-US') + ' 원' : '') + '</td><td></td></tr>' +
        '</tbody></table></div>' +
        '<button type="button" class="btn btn-line" id="of_add" style="padding:5px 12px;font-size:.8rem;margin-top:8px">＋ 헌금 항목 추가</button>';
      Array.prototype.forEach.call(ofBox.querySelectorAll('.of-name'), function (inp) { inp.oninput = function () { coffer[Number(inp.dataset.i)].name = inp.value; }; });
      Array.prototype.forEach.call(ofBox.querySelectorAll('.of-givers'), function (inp) { inp.oninput = function () { coffer[Number(inp.dataset.i)].givers = inp.value; }; });
      Array.prototype.forEach.call(ofBox.querySelectorAll('.of-amount'), function (inp) {
        inp.oninput = function () { coffer[Number(inp.dataset.i)].amount = inp.value; };
        inp.onblur = function () { var i = Number(inp.dataset.i); coffer[i].amount = commaAmt(inp.value); renderOffer(); };
      });
      Array.prototype.forEach.call(ofBox.querySelectorAll('.of-del'), function (b) { b.onclick = function () { coffer.splice(Number(b.dataset.i), 1); renderOffer(); }; });
      ofBox.querySelector('#of_add').onclick = function () { coffer.push({ name: '', givers: '', amount: '' }); renderOffer(); var ins = ofBox.querySelectorAll('.of-name'); if (ins.length) ins[ins.length - 1].focus(); };
    }
    renderOffer();

    function gather() {
      var data = {
        no: ov.querySelector('#bt_no').value.trim(), week: ov.querySelector('#bt_week').value.trim(),
        order: order.filter(function (o) { return o.name || o.detail; }),
        wed_series: ov.querySelector('#bt_wed_series').value.trim(), wed_title: ov.querySelector('#bt_wed_title').value.trim(), wed_dateline: ov.querySelector('#bt_wed_line').value.trim(),
        dawn: ov.querySelector('#bt_dawn').value.trim(), qt: ov.querySelector('#bt_qt').value.trim(),
        offering: {}, offering_amounts: {}, committee: {},
        column_title: ov.querySelector('#bt_col_title').value.trim(), column_body: ov.querySelector('#bt_col_body').value,
        notices: ov.querySelector('#bt_notices').value,
        founded: FOUNDED_DATE
      };
      var tot = 0;
      coffer.forEach(function (r) {
        var nm = (r.name || '').trim(); if (!nm) return;
        if (r.givers && r.givers.trim()) data.offering[nm] = r.givers.trim();
        var a = numAmt(r.amount); if (a) { data.offering_amounts[nm] = commaAmt(r.amount); tot += a; }
      });
      if (tot) data.offering_amounts['합계'] = tot.toLocaleString('en-US');
      COMMITTEE_KEYS.forEach(function (k) { data.committee[k] = ov.querySelector('#bt_com_' + k).value.trim(); });
      return {
        bdate: ov.querySelector('#bt_bdate').value || null,
        title: ov.querySelector('#bt_title').value.trim() || null,
        scripture: ov.querySelector('#bt_scripture').value.trim() || null,
        preacher: ov.querySelector('#bt_preacher').value.trim() || null,
        data: data
      };
    }
    function save(then, extra) {
      var payload = gather();
      if (extra) for (var k in extra) payload[k] = extra[k];
      if (!payload.bdate) { bmsg('주일 날짜는 필수입니다.', '#c0392b'); return; }
      payload.updated_at = new Date().toISOString();
      bmsg('저장 중…');
      var p = rec.id ? api('PATCH', 'bulletins?id=eq.' + rec.id, payload, 'return=representation') : api('POST', 'bulletins?on_conflict=bdate', payload, 'resolution=merge-duplicates,return=representation');
      p.then(function (rows) { var saved = (rows && rows[0]) || payload; if (rows && rows[0]) { rec.id = rows[0].id; rec.published = rows[0].published; } bmsg('✓ 저장되었습니다', 'green'); if (then) then(saved); })
        .catch(function (e) { if (/42P01|PGRST205|does not exist|schema cache/i.test(e.message)) bmsg('bulletins.sql 실행 필요', '#c0392b'); else bmsg('저장 실패: ' + e.message, '#c0392b'); });
    }
    ov.querySelector('#bt_save').onclick = function () { save(null); };
    ov.querySelector('#bt_printbtn').onclick = function () {
      // 새 창은 클릭 즉시 동기로 열어야 팝업 차단을 피함(저장은 백그라운드)
      bulletinView(gather(), { amounts: true, layout: 'print3' });
      save(null);
    };

    // ── ✨ AI 검수: 주보 초안을 직렬화해 bulletin-ai Edge Function 호출 ──
    function serializeBulletin(p) {
      var d = p.data || {}, L = [];
      L.push('[기본] 주일 ' + (p.bdate || '') + ' · 호수 ' + (d.no || '') + ' · ' + (d.week || ''));
      L.push('[주일 낮 예배] 제목: ' + (p.title || '(없음)') + ' / 본문: ' + (p.scripture || '(없음)') + ' / 설교자: ' + (p.preacher || '(없음)'));
      L.push('예배 순서: ' + (d.order || []).map(function (o, i) { return (i + 1) + '.' + (o.name || '') + (o.detail ? '(' + o.detail + ')' : ''); }).join(' '));
      L.push('[주중] 수요기도회: ' + [d.wed_series, d.wed_title, d.wed_dateline].filter(Boolean).join(' · '));
      L.push('새벽기도회: ' + (d.dawn || '') + ' / 매일 QT: ' + (d.qt || ''));
      var offs = Object.keys(d.offering || {}).map(function (k) { return k + '(' + d.offering[k] + ')'; });
      if (offs.length) L.push('[향기로운 예물] ' + offs.join(' / '));
      var amts = Object.keys(d.offering_amounts || {}).map(function (k) { return k + ':' + d.offering_amounts[k]; });
      if (amts.length) L.push('[헌금 금액(내부)] ' + amts.join(' / '));
      var coms = Object.keys(d.committee || {}).filter(function (k) { return d.committee[k]; }).map(function (k) { return k + ':' + d.committee[k]; });
      if (coms.length) L.push('[봉사위원] ' + coms.join(' / '));
      if (d.column_title || d.column_body) L.push('[칼럼] ' + (d.column_title || '') + '\n' + (d.column_body || ''));
      if (d.notices) L.push('[광고]\n' + d.notices);
      return L.join('\n');
    }
    function aiPanel() {
      var ai = document.createElement('div');
      ai.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:9600;display:flex;align-items:center;justify-content:center;padding:16px';
      ai.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #eef1f5">' +
        '<b style="font-size:1.05rem;color:#5b34a8">✨ AI 주보 검수</b>' +
        '<span style="font-size:.74rem;color:#9aa5b1">헤드라인 제안 · 실수/누락 · 철자 · 특수상황</span>' +
        '<button id="ai_close" class="btn btn-line" style="margin-left:auto;padding:5px 12px">닫기</button></div>' +
        '<div id="ai_body" style="padding:18px 20px;overflow:auto;line-height:1.75;font-size:.95rem;white-space:pre-wrap;word-break:break-word"></div></div>';
      document.body.appendChild(ai);
      ai.querySelector('#ai_close').onclick = function () { ai.remove(); };
      ai.addEventListener('click', function (e) { if (e.target === ai) ai.remove(); });
      return ai.querySelector('#ai_body');
    }
    function mdLite(t) {
      return esc(t)
        .replace(/^\s*##\s*(.+)$/gm, '<div style="font-weight:700;color:#5b34a8;margin:14px 0 6px;font-size:1rem">$1</div>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/\n/g, '<br>');
    }
    ov.querySelector('#bt_ai').onclick = function () {
      var s = sess(); if (!s || !s.token) { bmsg('로그인이 필요합니다.', '#c0392b'); return; }
      var bodyEl = aiPanel();
      bodyEl.innerHTML = '<p style="color:#7b8794">AI가 주보를 검토하는 중입니다… (10~20초)</p>';
      fetch(SB.replace(/\/$/, '') + '/functions/v1/bulletin-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.token, 'apikey': AK },
        body: JSON.stringify({ content: serializeBulletin(gather()) })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (o) {
          if (!o.ok) { bodyEl.innerHTML = '<p style="color:#c0392b">' + esc((o.j && o.j.error) || '검수에 실패했습니다.') + '</p>' + ((o.j && o.j.detail) ? '<p style="font-size:.8rem;color:#9aa5b1">' + esc(o.j.detail) + '</p>' : '') + '<p style="font-size:.82rem;color:#9aa5b1;margin-top:10px">※ bulletin-ai Edge Function 배포가 필요할 수 있습니다.</p>'; return; }
          bodyEl.innerHTML = mdLite((o.j && o.j.result) || '결과가 비어 있습니다.');
        })
        .catch(function (e) { bodyEl.innerHTML = '<p style="color:#c0392b">호출 실패: ' + esc(e.message) + '</p><p style="font-size:.82rem;color:#9aa5b1;margin-top:10px">※ Supabase에 bulletin-ai Edge Function을 배포해 주세요.</p>'; });
    };
    ov.querySelector('#bt_publish').onclick = function () {
      if (!confirm('이 주보를 홈페이지에 게시할까요?\n(헌금 금액은 홈페이지에 노출되지 않습니다)')) return;
      save(function () { bmsg('✓ 게시되었습니다 — 홈페이지 주보란에 반영됩니다', 'green'); }, { published: true });
    };
    // 봉사위원 자동 채움(설정 → 연간 봉사위원). 마지막 주일이면 다음 달도 병기
    function fillCommittee(bd) {
      var cur = committeeFor(ymOf(bd)); if (!cur) return false;
      function set(id, val) { var el = document.getElementById(id); if (el && val) el.value = val; }
      var nextTxt = '';
      if (isLastSundayOfMonth(bd)) { var nx = committeeFor(nextMonthYM(bd)); if (nx) nextTxt = nx; }
      function merge(a, b) { return b ? (a || '') + (a ? '  /  ' : '') + '(다음 달) ' + b : (a || ''); }
      set('bt_com_헌금위원', merge(cur.offering, nextTxt && nextTxt.offering));
      set('bt_com_안내위원', merge(cur.guide, nextTxt && nextTxt.guide));
      set('bt_com_주차·사찰', merge(cur.parking, nextTxt && nextTxt.parking));
      // 이주의 기도(2부 예배 기도) — 그 주차에 해당하는 기도자
      if (cur.prayer && cur.prayer.length) {
        var nth = Math.floor((new Date(bd + 'T00:00:00').getDate() - 1) / 7) + 1;
        var pr = null;
        for (var i = 0; i < cur.prayer.length; i++) { if ((cur.prayer[i].week || '').indexOf(nth + '주') >= 0) { pr = cur.prayer[i]; break; } }
        if (pr && pr.person) set('bt_com_이주의 기도', pr.person);
      }
      return true;
    }
    // 헌금 집계(Supabase offerings) → 동적 헌금 표(coffer)에 항목별 반영. 특별헌금 등은 자동 추가
    function fillOfferings(rows) {
      if (!rows) return false;
      var byCat = {};
      rows.forEach(function (r) {
        var c = (r.category || '기타').trim();
        if (!byCat[c]) byCat[c] = { givers: [], sum: 0 };
        if (r.giver && r.giver.trim()) byCat[c].givers.push(r.giver.trim());
        byCat[c].sum += Number(r.amount) || 0;
      });
      var ALIAS = { '일천번제': '일천번기도', '일천번기도': '일천번제' };
      Object.keys(byCat).forEach(function (cat) {
        var b = byCat[cat], row = null;
        for (var i = 0; i < coffer.length; i++) { if (coffer[i].name === cat || ALIAS[coffer[i].name] === cat) { row = coffer[i]; break; } }
        if (!row) { row = { name: cat, givers: '', amount: '' }; coffer.push(row); }
        row.givers = b.givers.join(' ');
        row.amount = b.sum ? b.sum.toLocaleString('en-US') : '';
      });
      renderOffer();
      return rows.length > 0;
    }
    // 데이터 불러오기: 설교(주일/수요/새벽/QT) + 봉사위원(설정) + 헌금(Supabase)
    ov.querySelector('#bt_pull').onclick = function () {
      var bd = ov.querySelector('#bt_bdate').value; if (!bd) { bmsg('주일 날짜를 먼저 선택하세요.', '#c0392b'); return; }
      bmsg('데이터 불러오는 중…');
      var prevSun = addDays(bd, -7); // 지난 주 헌금 = 직전 주일
      var pSerm = api('GET', 'sermons?select=*&sermon_date=gte.' + bd + '&sermon_date=lte.' + addDays(bd, 6) + '&order=sermon_date.asc');
      var pCom = COMMITTEES ? Promise.resolve(COMMITTEES) : loadCommittees();
      var pOff = api('GET', 'offerings?select=category,giver,amount&offer_date=eq.' + prevSun).catch(function () { return null; });
      Promise.all([pSerm, pCom, pOff]).then(function (res) {
        var rows = res[0] || [];
        function pick(svc) { for (var i = 0; i < rows.length; i++) if (rows[i].service === svc) return rows[i]; return null; }
        var sun = pick('주일 낮 예배'), wed = pick('수요예배'), dawn = pick('새벽기도'), qt = pick('매일 QT');
        var n = 0, parts = [];
        if (sun) {
          if (sun.title) ov.querySelector('#bt_title').value = sun.title;
          if (sun.scripture) ov.querySelector('#bt_scripture').value = sun.scripture;
          if (sun.preacher) ov.querySelector('#bt_preacher').value = sun.preacher;
          var wo = []; try { wo = JSON.parse(sun.worship_order || '[]') || []; } catch (e) { wo = []; }
          if (wo.length) { order = wo.map(function (it) { return { name: it.label || '', detail: it.detail || '' }; }); renderBOrder(); }
          n++;
        }
        if (wed) { if (wed.title) ov.querySelector('#bt_wed_title').value = wed.title; ov.querySelector('#bt_wed_line').value = [fmtD(wed.sermon_date), wed.scripture, wed.preacher].filter(Boolean).join(' · '); n++; }
        if (dawn) { ov.querySelector('#bt_dawn').value = dawn.scripture || dawn.title || ''; n++; }
        if (qt) { ov.querySelector('#bt_qt').value = qt.scripture || qt.title || ''; n++; }
        if (n) parts.push('설교 ' + n + '건');
        if (fillCommittee(bd)) parts.push('봉사위원');
        var offs = res[2];
        if (offs && offs.length) { fillOfferings(offs); parts.push('헌금 ' + offs.length + '건(직전 주일 ' + prevSun + ')'); }
        bmsg(parts.length ? ('✓ ' + parts.join(' · ') + ' 불러옴') + (offs && !offs.length ? ' · 직전 주일(' + prevSun + ') 헌금 없음' : '') : '해당 주/일에 불러올 데이터가 없습니다.', parts.length ? 'green' : '#c0392b');
      }).catch(function (e) { bmsg('불러오기 실패: ' + e.message, '#c0392b'); });
    };
  }

  // 주보 보기/인쇄(새 창) — 공용 렌더러(js/bulletin-render.js) 사용. opts.amounts=true 면 금액 포함
  function bulletinView(rec, opts) {
    opts = opts || {};
    if (!opts.fileName) opts.fileName = bulletinFileName(rec); // PDF 기본 파일명
    if (window.BulletinRender) { window.BulletinRender.open(rec, opts); return; }
    alert('주보 렌더러(bulletin-render.js)가 로드되지 않았습니다. 페이지를 새로고침해 주세요.');
  }

  // 한글(.hwpx) '예배 봉사자' 표 파싱 → 월별 봉사위원
  //   표: c0=월 c1=안내 c2=헌금위원 c3/c4=2부기도(주차) c5=주차·사찰
  function parseBongsaHwpx(xml, filename) {
    function dec(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); }); }
    var tcs = xml.match(/<hp:tc\b[\s\S]*?<\/hp:tc>/g) || [];
    var grid = {}, maxr = 0;
    tcs.forEach(function (tc) {
      var a = tc.match(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/);
      if (!a) return;
      var sp = tc.match(/<hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"/);
      var col = +a[1], row = +a[2], rs = sp ? +sp[2] : 1;
      var ts = tc.match(/<hp:t>[\s\S]*?<\/hp:t>/g) || [];
      var txt = ts.map(function (t) { return dec(t.replace(/<\/?hp:t>/g, '')).trim(); }).join(' ').replace(/\s+/g, ' ').trim();
      grid[row + ',' + col] = { txt: txt, rs: rs };
      if (row > maxr) maxr = row;
    });
    function cell(r, c) { return grid[r + ',' + c] || { txt: '', rs: 1 }; }
    // 연도: 제목 셀 → 파일명 → 올해
    var ym = (cell(0, 0).txt.match(/(\d{4})/) || (String(filename || '').match(/(\d{4})/)) || [])[1];
    var year = ym || String(new Date().getFullYear());
    var months = [];
    for (var r = 1; r <= maxr; r++) {
      var c0 = cell(r, 0).txt; var mm = c0.match(/(\d{1,2})\s*월/);
      if (!mm) continue;
      var mno = ('0' + mm[1]).slice(-2);
      var rs = cell(r, 0).rs, prayer = [];
      for (var rr = r; rr < r + rs; rr++) { var wk = cell(rr, 3).txt, ps = cell(rr, 4).txt; if (ps) prayer.push({ week: wk, person: ps }); }
      months.push({ month: year + '-' + mno, guide: cell(r, 1).txt, offering: cell(r, 2).txt, parking: cell(r, 5).txt, prayer: prayer });
    }
    return { year: year, months: months };
  }

  // ====================================================================
  //  설정 — 연간 봉사위원 (주보 제작 시 자동 채움)
  // ====================================================================
  function renderSettings(panel) {
    panel.innerHTML =
      '<div class="fin-card"><h3 style="margin:0 0 4px;color:var(--accent,#032257)">교회 기본 정보</h3>' +
      '<p style="margin:0 0 12px;color:var(--ink-soft,#7b8794);font-size:.9rem">설립일을 기준으로 주보 <b>호수(No.)</b>의 주년이 정해집니다. 예) 1964년 설립 → 2026년은 62주년 → 62-○○주.</p>' +
      '<div class="fin-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end">' +
      '<div class="af-field"><label>교회 설립일</label><input type="date" id="set_founded" value=""></div>' +
      '<div class="af-field"><label>현재 주년(자동)</label><input type="text" id="set_anniv" value="" readonly style="background:#f5f7fa"></div>' +
      '</div></div>' +
      // 주보 PDF 저장
      '<div class="fin-card"><h3 style="margin:0 0 4px;color:var(--accent,#032257)">주보 PDF 저장</h3>' +
      '<p style="margin:0 0 12px;color:var(--ink-soft,#7b8794);font-size:.9rem">주보를 <b>🖨 3단 인쇄(PDF)</b> 할 때 PDF의 기본 <b>파일명</b>을 정합니다. 사용 가능한 항목: <code>{date}</code>(20260705) · <code>{no}</code>(62-27) · <code>{week}</code>(7월 첫째 주)</p>' +
      '<div class="fin-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;align-items:end">' +
      '<div class="af-field"><label>PDF 파일명 형식</label><input type="text" id="set_pdfname" value="" placeholder="{date} 주보"></div>' +
      '<div class="af-field"><label>미리보기</label><input type="text" id="set_pdfprev" value="" readonly style="background:#f5f7fa"></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><button class="btn btn-solid" id="set_save_g" style="padding:8px 16px;font-size:.85rem">💾 기본 정보 저장</button> <span id="set_gmsg" class="fin-msg"></span></div>' +
      '<p style="margin:10px 0 0;color:#9aa5b1;font-size:.78rem">※ 브라우저 보안상 웹페이지가 PC의 저장 <b>폴더</b>를 직접 지정할 수는 없습니다. 인쇄 창에서 <b>대상 → ‘PDF로 저장’</b>을 고른 뒤 폴더를 한 번 선택하면, 브라우저가 그 위치를 기억해 다음부터 같은 폴더로 저장됩니다.</p>' +
      '</div>' +
      '<div class="fin-card"><h3 style="margin:0 0 4px;color:var(--accent,#032257)">연간 봉사위원</h3>' +
      '<p style="margin:0 0 12px;color:var(--ink-soft,#7b8794);font-size:.9rem">월별 봉사위원을 한 번 입력해 두면, <b>주보 제작 → 데이터 불러오기</b> 시 해당 월 봉사위원이 자동으로 채워집니다. 그 달 <b>마지막 주일</b> 주보에는 다음 달 봉사위원도 함께 표기됩니다.</p>' +
      '<div id="set_rows"></div>' +
      '<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><button class="btn btn-line" id="set_add" style="padding:6px 13px;font-size:.85rem">＋ 월 추가</button><button class="btn btn-solid" id="set_save" style="padding:6px 16px;font-size:.85rem">💾 저장</button><span id="set_msg" class="fin-msg"></span></div>' +
      '<div id="set_drop" style="margin-top:14px;border:2px dashed #cdd7e3;border-radius:10px;padding:16px;text-align:center;color:#9aa5b1;font-size:.84rem">📄 한글(.hwpx) 봉사자 파일을 여기로 드래그하면 자동으로 채웁니다 <span style="font-size:.76rem">(텍스트 추출 · 베타)</span></div>' +
      '</div>';
    function msg(t, c) { var e = panel.querySelector('#set_msg'); if (e) { e.style.color = c || '#7b8794'; e.textContent = t; if (t) setTimeout(function () { if (e.textContent === t) e.textContent = ''; }, 3000); } }
    var coms = [];
    function rowsBox() { return panel.querySelector('#set_rows'); }
    function prayerToText(arr) { return (arr || []).map(function (p) { return (p.week ? p.week + ':' : '') + (p.person || ''); }).filter(Boolean).join('\n'); }
    function textToPrayer(s) { return String(s || '').split(/[\n\/]/).map(function (part) { var i = part.indexOf(':'); if (i < 0) { var t = part.trim(); return t ? { week: '', person: t } : null; } return { week: part.slice(0, i).trim(), person: part.slice(i + 1).trim() }; }).filter(function (p) { return p && p.person; }); }
    function renderRows() {
      var box = rowsBox();
      var ist = 'width:100%;padding:5px 7px;border:1px solid #dfe5ee;border-radius:7px;font:inherit;font-size:.84rem;box-sizing:border-box';
      box.innerHTML = '<div style="overflow:auto"><table class="fin-table" style="table-layout:fixed;width:100%;min-width:780px">' +
        '<colgroup><col style="width:8%"><col style="width:16%"><col style="width:14%"><col style="width:14%"><col style="width:45%"><col style="width:3%"></colgroup>' +
        '<thead><tr><th>월</th><th>헌금위원</th><th>안내위원</th><th>주차·사찰</th><th>이주의 기도 <span style="font-weight:400;color:#9aa5b1;font-size:.72rem">(주차별 · 한 줄에 하나)</span></th><th></th></tr></thead><tbody>' +
        coms.map(function (c, i) {
          var lines = Math.max(2, (c.prayer && c.prayer.length) || 0);
          return '<tr>' +
            '<td><input type="month" class="set-month" data-i="' + i + '" value="' + esc(c.month || '') + '" style="' + ist + '"></td>' +
            '<td><input type="text" class="set-offering" data-i="' + i + '" value="' + esc(c.offering || '') + '" placeholder="이름 이름" title="' + esc(c.offering || '') + '" style="' + ist + '"></td>' +
            '<td><input type="text" class="set-guide" data-i="' + i + '" value="' + esc(c.guide || '') + '" title="' + esc(c.guide || '') + '" style="' + ist + '"></td>' +
            '<td><input type="text" class="set-parking" data-i="' + i + '" value="' + esc(c.parking || '') + '" title="' + esc(c.parking || '') + '" style="' + ist + '"></td>' +
            '<td><textarea class="set-prayer" data-i="' + i + '" rows="' + lines + '" placeholder="1주:신용화 장로&#10;2주:박경자 권사" style="' + ist + ';line-height:1.5;resize:vertical;min-height:52px">' + esc(prayerToText(c.prayer)) + '</textarea></td>' +
            '<td style="text-align:center;vertical-align:top;padding-top:8px"><button type="button" class="set-del" data-i="' + i + '" style="border:0;background:none;color:#c0392b;cursor:pointer">✕</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      function bind(cls, key) { Array.prototype.forEach.call(box.querySelectorAll('.' + cls), function (inp) { inp.oninput = function () { coms[Number(inp.dataset.i)][key] = inp.value; }; }); }
      bind('set-month', 'month'); bind('set-offering', 'offering'); bind('set-guide', 'guide'); bind('set-parking', 'parking');
      Array.prototype.forEach.call(box.querySelectorAll('.set-prayer'), function (inp) { inp.oninput = function () { coms[Number(inp.dataset.i)].prayer = textToPrayer(inp.value); }; });
      Array.prototype.forEach.call(box.querySelectorAll('.set-del'), function (b) { b.onclick = function () { coms.splice(Number(b.dataset.i), 1); renderRows(); }; });
    }
    // 교회 기본 정보(설립일) — 호수 주년 기준
    function gmsg(t, c) { var e = panel.querySelector('#set_gmsg'); if (e) { e.style.color = c || '#7b8794'; e.textContent = t; if (t) setTimeout(function () { if (e.textContent === t) e.textContent = ''; }, 3000); } }
    function annivOf(fdate) { if (!fdate) return ''; var fy = new Date(fdate + 'T00:00:00').getFullYear(); return (new Date().getFullYear() - fy) + '주년'; }
    var fEl = panel.querySelector('#set_founded'), aEl = panel.querySelector('#set_anniv');
    var pEl = panel.querySelector('#set_pdfname'), pvEl = panel.querySelector('#set_pdfprev');
    function pdfPreview() {
      var fmt = pEl.value || '{date} 주보';
      var ds = (nextSunday()).replace(/-/g, '');
      pvEl.value = fmt.replace(/\{date\}/g, ds).replace(/\{no\}/g, bulletinNo(nextSunday())).replace(/\{week\}/g, bulletinWeekLabel(nextSunday())).replace(/\s+/g, ' ').trim() + '.pdf';
    }
    fEl.addEventListener('change', function () { aEl.value = annivOf(fEl.value); });
    pEl.addEventListener('input', pdfPreview);
    panel.querySelector('#set_save_g').onclick = function () {
      var fd = fEl.value; if (!fd) { gmsg('설립일을 입력하세요.', '#c0392b'); return; }
      var pn = (pEl.value || '{date} 주보').trim();
      gmsg('저장 중…');
      api('POST', 'church_settings?on_conflict=key', { key: 'general', data: { founded: fd, pdf_name: pn }, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal')
        .then(function () { FOUNDED_DATE = fd; FOUNDED_YEAR = new Date(fd + 'T00:00:00').getFullYear(); PDF_NAME = pn; gmsg('✓ 저장됨 — 주보 호수·PDF 파일명에 반영됩니다', 'green'); })
        .catch(function (e) { if (/42P01|PGRST205|does not exist|schema cache/i.test(e.message)) gmsg('church_settings.sql 실행 필요', '#c0392b'); else gmsg('저장 실패: ' + e.message, '#c0392b'); });
    };
    loadGeneral().then(function (g) { fEl.value = (g && g.founded) || FOUNDED_DATE; aEl.value = annivOf(fEl.value); pEl.value = (g && g.pdf_name) || PDF_NAME; pdfPreview(); });
    panel.querySelector('#set_add').onclick = function () { coms.push({ month: '', offering: '', guide: '', parking: '' }); renderRows(); };
    panel.querySelector('#set_save').onclick = function () {
      coms.sort(function (a, b) { return (a.month || '') < (b.month || '') ? -1 : 1; });
      msg('저장 중…');
      api('POST', 'church_settings?on_conflict=key', { key: 'committees', data: { months: coms }, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal')
        .then(function () { COMMITTEES = coms.slice(); msg('✓ 저장되었습니다', 'green'); })
        .catch(function (e) { if (/42P01|PGRST205|does not exist|schema cache/i.test(e.message)) msg('church_settings.sql 실행 필요', '#c0392b'); else msg('저장 실패: ' + e.message, '#c0392b'); });
    };
    // 한글(.hwpx) 봉사자 파일 드롭 → 표 파싱 → 월별 봉사위원 자동 채움
    function applyParsed(parsed) {
      if (!parsed || !parsed.months || !parsed.months.length) { msg('봉사자 표를 찾지 못했습니다. (예배 봉사자 .hwpx 파일인지 확인해 주세요)', '#c0392b'); return; }
      var byMonth = {}; coms.forEach(function (c) { if (c.month) byMonth[c.month] = c; });
      var added = 0, updated = 0;
      parsed.months.forEach(function (m) {
        if (byMonth[m.month]) { var c = byMonth[m.month]; c.offering = m.offering; c.guide = m.guide; c.parking = m.parking; if (m.prayer) c.prayer = m.prayer; updated++; }
        else { coms.push(m); byMonth[m.month] = m; added++; }
      });
      coms = coms.filter(function (c) { return c.month || c.offering || c.guide || c.parking; });
      coms.sort(function (a, b) { return (a.month || '') < (b.month || '') ? -1 : 1; });
      renderRows();
      msg('✓ ' + parsed.year + '년 ' + parsed.months.length + '개월 불러옴 (추가 ' + added + ' · 갱신 ' + updated + ') — 확인 후 💾 저장하세요', 'green');
    }
    function handleFile(f) {
      if (!f) return;
      if (!/\.hwpx$/i.test(f.name)) { msg('한글 .hwpx 파일만 지원합니다. (.hwp 구형식은 한글에서 hwpx로 저장 후 사용)', '#c0392b'); return; }
      if (!window.JSZip) { msg('압축 해제 모듈(JSZip)이 로드되지 않았습니다. 새로고침 후 다시 시도해 주세요.', '#c0392b'); return; }
      msg('파일 분석 중…');
      f.arrayBuffer().then(function (buf) { return window.JSZip.loadAsync(buf); })
        .then(function (zip) { var fe = zip.file('Contents/section0.xml') || zip.file('section0.xml'); if (!fe) throw new Error('section0.xml 없음'); return fe.async('string').then(function (xml) { return { xml: xml, name: f.name }; }); })
        .then(function (o) { applyParsed(parseBongsaHwpx(o.xml, o.name)); })
        .catch(function (e) { msg('파일을 읽지 못했습니다: ' + e.message, '#c0392b'); });
    }
    var drop = panel.querySelector('#set_drop');
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.style.background = '#eef4ff'; });
    drop.addEventListener('dragleave', function () { drop.style.background = ''; });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.style.background = ''; handleFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
    drop.style.cursor = 'pointer';
    drop.addEventListener('click', function () { var fi = document.createElement('input'); fi.type = 'file'; fi.accept = '.hwpx'; fi.onchange = function () { handleFile(fi.files && fi.files[0]); }; fi.click(); });
    api('GET', 'church_settings?key=eq.committees&select=data').then(function (rows) {
      coms = (rows && rows[0] && rows[0].data && rows[0].data.months) || [];
      COMMITTEES = coms.slice();
      if (!coms.length) coms.push({ month: '', offering: '', guide: '', parking: '' });
      renderRows();
    }).catch(function (e) {
      if (/42P01|PGRST205|does not exist|schema cache|Could not find the table/i.test(e.message)) rowsBox().innerHTML = msgCard('테이블 준비 필요', 'Supabase → SQL Editor 에서 supabase/church_settings.sql 을 1회 실행해 주세요.');
      else rowsBox().innerHTML = msgCard('조회 실패', e.message);
    });
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
      loadGeneral(); // 설립일(호수 주년 기준) 미리 로드
      render();
    }).catch(function (e) { root.innerHTML = msgCard('오류', e.message); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
