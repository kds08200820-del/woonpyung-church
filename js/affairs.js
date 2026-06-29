/* affairs.js — 행정관리(관리자 전용): 심방관리 · 상담관리
 * 데이터는 Supabase(visitations/counsels, 관리자 RLS)에 저장.
 * 콘솔: [affairs.js] v20260701bp
 */
console.log('[affairs.js] v20260701bp');

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
  var TAB_ORDER = [['sermon', '설교관리'], ['visit', '심방관리'], ['counsel', '상담관리'], ['edu', '교육관리'], ['doc', '문서관리']];

  var tab = 'sermon';
  function render() {
    root.innerHTML = '<div class="fin-tabs">' + TAB_ORDER.map(function (t) { return '<button data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div><div id="afPanel"></div>';
    Array.prototype.forEach.call(root.querySelectorAll('.fin-tabs button'), function (b) {
      if (b.dataset.t === tab) b.classList.add('active');
      b.onclick = function () { tab = b.dataset.t; render(); };
    });
    var p = document.getElementById('afPanel');
    if (tab === 'sermon') renderSermon(p); else renderManager(p, TYPES[tab]);
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
    { label: '📖 성경본문', url: 'https://bible.goodtv.co.kr/' },
    { label: '🎵 찬송가', url: 'https://search.naver.com/search.naver?query=' + encodeURIComponent('찬송가 가사') }
  ];
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
    panel.innerHTML =
      '<div class="fin-card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">' +
      '<div><b style="font-size:1.08rem;color:var(--accent,#032257)">설교 작성·관리</b>' +
      '<div style="font-size:.84rem;color:var(--ink-soft);margin-top:4px">설교를 작성해 <b>내보내기</b>하면 자동 등록되고, 목록의 <b>📖 보기</b>로 아이패드에서 바로 펼쳐 설교할 수 있습니다.</div></div>' +
      '<button class="btn btn-solid" id="sm_start" style="padding:11px 22px;font-size:1rem">✍️ 설교 시작</button></div>' +
      '<div id="sm_list"><p class="qt-loading">불러오는 중…</p></div>';
    panel.querySelector('#sm_start').onclick = function () { sermonEditor(null); };

    function loadList() {
      var listBox = panel.querySelector('#sm_list');
      api('GET', 'sermons?select=*&order=sermon_date.desc,created_at.desc').then(function (rows) {
        rows = rows || [];
        if (!rows.length) { listBox.innerHTML = '<div class="fin-card"><p style="color:var(--ink-soft);margin:0">등록된 설교가 없습니다. <b>설교 시작</b>으로 작성해 보세요.</p></div>'; return; }
        var byId = {}; rows.forEach(function (r) { byId[r.id] = r; });
        listBox.innerHTML = '<div class="fin-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b>설교 (' + rows.length + '편)</b></div><div style="overflow:auto"><table class="fin-table"><thead><tr><th>일자</th><th>예배</th><th>제목</th><th>본문</th><th>설교자</th><th>관리</th></tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr><td style="white-space:nowrap">' + esc(fmtD(r.sermon_date)) + '</td><td style="white-space:nowrap">' + esc(r.service || '') + '</td><td><b>' + esc(r.title || '(제목없음)') + '</b></td><td style="white-space:nowrap">' + esc(r.scripture || '') + '</td><td style="white-space:nowrap">' + esc(r.preacher || '') + '</td>' +
              '<td style="white-space:nowrap"><button class="btn btn-solid sm-read" data-id="' + esc(r.id) + '" style="padding:4px 11px;font-size:.78rem">📖 보기</button> <button class="btn btn-line sm-edit" data-id="' + esc(r.id) + '" style="padding:4px 9px;font-size:.78rem">수정</button> <button class="btn btn-line sm-del" data-id="' + esc(r.id) + '" style="padding:4px 9px;font-size:.78rem">삭제</button></td></tr>';
          }).join('') + '</tbody></table></div></div>';
        Array.prototype.forEach.call(listBox.querySelectorAll('.sm-read'), function (b) { b.onclick = function () { sermonReadingView(byId[b.dataset.id]); }; });
        Array.prototype.forEach.call(listBox.querySelectorAll('.sm-edit'), function (b) { b.onclick = function () { sermonEditor(byId[b.dataset.id]); }; });
        Array.prototype.forEach.call(listBox.querySelectorAll('.sm-del'), function (b) { b.onclick = function () { if (!confirm('이 설교를 삭제할까요?')) return; api('DELETE', 'sermons?id=eq.' + b.dataset.id, null, 'return=minimal').then(loadList).catch(function (e) { alert('삭제 실패: ' + e.message); }); }; });
      }).catch(function (e) {
        if (/42P01|PGRST205|does not exist|schema cache|Could not find the table/i.test(e.message)) listBox.innerHTML = msgCard('테이블 준비 필요', 'Supabase → SQL Editor 에서 supabase/affairs_modules.sql 을 1회 실행해 주세요.');
        else listBox.innerHTML = msgCard('조회 실패', e.message);
      });
    }
    loadList();

    // 설교 작성 페이지(전체화면)
    function sermonEditor(rec) {
      rec = rec || {};
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:#f5f7fa;z-index:9000;overflow:auto';
      var svcOpts = SVC_OPTS.map(function (o) { return '<option' + (o === (rec.service || '') ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
      ov.innerHTML =
        '<div style="position:sticky;top:0;background:#fff;border-bottom:1px solid #e3e7ee;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;z-index:5">' +
        '<b style="color:var(--accent,#032257);font-size:1.05rem;margin-right:auto">✍️ 설교 작성</b>' +
        '<button class="btn btn-line" id="se_tools">🧰 도구상자</button>' +
        '<button class="btn btn-line" id="se_close">닫기</button>' +
        '<button class="btn btn-line" id="se_save">💾 임시저장</button>' +
        '<button class="btn btn-solid" id="se_export">📤 설교 내보내기</button>' +
        '<span class="fin-msg" id="se_msg" style="width:100%;text-align:right"></span></div>' +
        '<div id="se_toolbox" style="display:none;background:#eef4ff;border-bottom:1px solid #d6e2f5;padding:10px 16px"><span style="font-size:.84rem;color:#5b6b7d;margin-right:8px">참고/선택:</span>' +
        SERMON_TOOLS.map(function (t, i) { return '<button class="btn btn-line se-tool" data-i="' + i + '" style="margin:3px 6px 3px 0">' + t.label + '</button>'; }).join('') +
        '<button class="btn btn-line" id="se_gyodok" style="margin:3px 6px 3px 0">📜 교독문</button>' +
        '<span id="se_gyodok_sel" style="font-size:.82rem;color:#1e874b;margin-left:4px"></span>' +
        '<span style="font-size:.78rem;color:#9aa5b1;display:block;margin-top:4px">성경본문·찬송가는 새 탭으로 열립니다. 교독문은 선택하면 저장되어 추후 예배 콘티에 자동 삽입됩니다.</span></div>' +
        '<div style="max-width:880px;margin:0 auto;padding:18px 16px 60px">' +
        '<div class="fin-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:12px">' +
        '<div class="af-field"><label>일자</label><input type="date" id="se_date" value="' + esc(fmtD(rec.sermon_date) || today()) + '"></div>' +
        '<div class="af-field"><label>예배</label><select id="se_service"><option value="">선택</option>' + svcOpts + '</select></div>' +
        '<div class="af-field"><label>설교자</label><input type="text" id="se_preacher" value="' + esc(rec.preacher || '김동석 목사') + '"></div>' +
        '<div class="af-field"><label>본문(성경)</label><input type="text" id="se_scripture" value="' + esc(rec.scripture || '') + '" placeholder="예: 요한복음 3:16"></div>' +
        '</div>' +
        '<div class="af-field" style="margin-bottom:12px"><label>제목</label><input type="text" id="se_title" value="' + esc(rec.title || '') + '" placeholder="설교 제목" style="font-size:1.1rem;font-weight:700"></div>' +
        '<div class="af-field"><label>설교 원고</label><textarea id="se_content" placeholder="설교 원고를 작성하세요. 줄바꿈·문단이 그대로 설교문에 반영됩니다." style="min-height:50vh;line-height:1.8;font-size:1.02rem">' + esc(rec.content || '') + '</textarea></div>' +
        '<input type="hidden" id="se_media" value="' + esc(rec.media_url || '') + '"><input type="hidden" id="se_file" value="' + esc(rec.file_url || '') + '">' +
        '</div>';
      document.body.appendChild(ov);
      document.body.style.overflow = 'hidden';
      function close() { ov.remove(); document.body.style.overflow = ''; }
      ov.querySelector('#se_close').onclick = close;
      ov.querySelector('#se_tools').onclick = function () { var tb = ov.querySelector('#se_toolbox'); tb.style.display = tb.style.display === 'none' ? '' : 'none'; };
      Array.prototype.forEach.call(ov.querySelectorAll('.se-tool'), function (b) { b.onclick = function () { window.open(SERMON_TOOLS[Number(b.dataset.i)].url, '_blank', 'noopener'); }; });
      var gsel = ov.querySelector('#se_gyodok_sel');
      function showGyodok() { var g = selectedGyodok(); gsel.textContent = g ? ('선택됨: ' + g.no + '. ' + g.title) : ''; }
      ov.querySelector('#se_gyodok').onclick = function () { ov.querySelector('#se_toolbox').style.display = ''; gyodokPicker(function () { showGyodok(); }); };
      showGyodok();
      function gather() {
        return {
          sermon_date: ov.querySelector('#se_date').value || null,
          service: ov.querySelector('#se_service').value || null,
          title: ov.querySelector('#se_title').value.trim() || null,
          scripture: ov.querySelector('#se_scripture').value.trim() || null,
          preacher: ov.querySelector('#se_preacher').value.trim() || null,
          content: ov.querySelector('#se_content').value || null,
          media_url: ov.querySelector('#se_media').value || null,
          file_url: ov.querySelector('#se_file').value || null
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
      ov.querySelector('#se_export').onclick = function () { save(function (saved) { sermonReadingView(saved); }); };
    }
  }

  // 아이패드용 설교문 보기(큰 글씨·스크롤·글자크기·다크모드·인쇄)
  function sermonReadingView(r) {
    r = r || {};
    var w = window.open('', '_blank');
    if (!w) { alert('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.'); return; }
    var meta = [r.service, fmtD(r.sermon_date), r.preacher].filter(Boolean).map(function (x) { return esc(x); }).join(' · ');
    var bodyHtml = esc(r.content || '').replace(/\n/g, '<br>');
    var css = [
      '*{box-sizing:border-box}',
      'html,body{margin:0}',
      'body{font-family:"Noto Serif KR",serif;background:#fbf9f4;color:#1a1a1a;font-size:22px;line-height:1.9;-webkit-text-size-adjust:100%}',
      '.bar{position:sticky;top:0;background:rgba(255,255,255,.96);border-bottom:1px solid #e3ddd0;padding:8px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;z-index:10}',
      '.bar button{font:inherit;font-size:15px;border:1px solid #cdd7e3;background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer}',
      '.wrap{max-width:820px;margin:0 auto;padding:26px 22px 120px}',
      'h1{font-size:1.6em;margin:0 0 6px;line-height:1.35}',
      '.scr{font-size:1.05em;color:#7a5d27;font-weight:600;margin:0 0 4px}',
      '.meta{font-size:.8em;color:#9a8f78;margin:0 0 22px;font-family:"Noto Sans KR",sans-serif}',
      '.body{white-space:normal}',
      'body.dark{background:#15171b;color:#e9e6df}body.dark .bar{background:rgba(25,27,31,.96);border-color:#2a2d33}body.dark .bar button{background:#23262c;color:#e9e6df;border-color:#3a3d44}body.dark .scr{color:#e0c98a}body.dark .meta{color:#8a8576}',
      '@media print{.bar{display:none}body{background:#fff;font-size:13pt}.wrap{padding:0}}'
    ].join('');
    var html = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(r.title || '설교문') + '</title>' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&family=Noto+Serif+KR:wght@400;600;700&display=swap" rel="stylesheet">' +
      '<style>' + css + '</style></head><body>' +
      '<div class="bar"><button id="dec">가–</button><button id="inc">가+</button><button id="dark">🌙 다크</button><button id="print">🖨 인쇄</button><span style="font-size:13px;color:#9a8f78;margin-left:auto">아이패드에서 그대로 펼쳐 설교하세요</span></div>' +
      '<div class="wrap"><h1>' + esc(r.title || '(제목 없음)') + '</h1>' + (r.scripture ? '<div class="scr">' + esc(r.scripture) + '</div>' : '') + (meta ? '<div class="meta">' + meta + '</div>' : '') + '<div class="body" id="body">' + bodyHtml + '</div></div>' +
      '<script>(function(){var b=document.body,s=22;function ap(){b.style.fontSize=s+"px";try{localStorage.setItem("sermonFs",s)}catch(e){}}try{var sv=parseInt(localStorage.getItem("sermonFs"),10);if(sv)s=sv}catch(e){}ap();document.getElementById("inc").onclick=function(){s=Math.min(48,s+2);ap()};document.getElementById("dec").onclick=function(){s=Math.max(14,s-2);ap()};document.getElementById("dark").onclick=function(){b.classList.toggle("dark")};document.getElementById("print").onclick=function(){window.print()};})();<\/script>' +
      '</body></html>';
    w.document.write(html); w.document.close(); w.focus();
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
