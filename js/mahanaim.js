/* ============================================================
   운평장로교회 — 마하나임 찬양단 (mahanaim.html 전용)
   1) 예배 콘티(세트리스트): Supabase praise_setlists 테이블
      · 로그인 교인: 조회 / 관리자: 등록·수정·삭제
   2) 악보·음원 파일 공유: resources.js 가 #resourceAreaPraise 를 렌더(재사용)
   3) 연습 도구: 메트로놈 + 튜너(Web Audio)
   콘솔: [mahanaim.js] v20260716mah
   ============================================================ */
console.log('[mahanaim.js] v20260716mah');

(function () {
  /* ── 탭 전환 ── */
  var tabs = document.getElementById('mhTabs');
  if (tabs) {
    tabs.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        tabs.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        document.querySelectorAll('.mh-panel').forEach(function (p) { p.classList.remove('active'); });
        var panel = document.getElementById('panel-' + b.dataset.p);
        if (panel) panel.classList.add('active');
        if (b.dataset.p === 'tools') Tuner.stop(); // 다른 탭 갈 땐 무관하지만 안전
      });
    });
  }

  /* ============================================================
     1) 예배 콘티(세트리스트)
     ============================================================ */
  var listEl = document.getElementById('contiList');
  var addBtn = document.getElementById('contiAdd');

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  function localSession() {
    try {
      var ref = new URL(window.SUPABASE_URL).hostname.split('.')[0];
      var raw = localStorage.getItem('sb-' + ref + '-auth-token');
      if (!raw) return null;
      var s = JSON.parse(raw);
      return s && s.currentSession ? s.currentSession : s;
    } catch (e) { return null; }
  }
  function currentUser() { var s = localSession(); return (s && s.user) || null; }
  function token() { var s = localSession(); return s && s.access_token; }
  function authHeaders(extra) {
    var h = { apikey: window.SUPABASE_ANON_KEY };
    var t = token(); if (t) h.Authorization = 'Bearer ' + t;
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }
  function jsonFetch(url, opts) {
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (txt) {
        var data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
        if (!res.ok) { var m = (data && (data.message || data.error || data.hint)) || ('HTTP ' + res.status); var err = new Error(m); err.status = res.status; throw err; }
        return data;
      });
    });
  }

  var SB = function () { return window.SUPABASE_URL; };
  var admin = false;

  function isAdminUser(uid) {
    return jsonFetch(SB() + '/rest/v1/admins?uid=eq.' + uid + '&select=uid', { headers: authHeaders() })
      .then(function (r) { return Array.isArray(r) && r.length > 0; }).catch(function () { return false; });
  }
  function listSetlists() {
    return jsonFetch(SB() + '/rest/v1/praise_setlists?select=*&order=service_date.desc.nullslast,id.desc', { headers: authHeaders() });
  }

  // 유튜브 링크 → embed id 추출
  function ytId(url) {
    var m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }
  function fmtDate(d) {
    if (!d) return null;
    var p = String(d).slice(0, 10).split('-'); if (p.length < 3) return { md: String(d), y: '' };
    return { md: Number(p[1]) + '/' + Number(p[2]), y: p[0] };
  }
  function songsOf(row) { try { return Array.isArray(row.songs) ? row.songs : JSON.parse(row.songs || '[]'); } catch (e) { return []; } }

  function loginPrompt() {
    listEl.innerHTML = '<div class="member-lock"><div class="lock-icon">🔒</div><h3>회원 전용</h3>' +
      '<p>로그인한 등록 교인만 찬양단 콘티를 볼 수 있습니다.</p>' +
      '<button type="button" class="btn btn-line mh-login" style="margin-top:12px">로그인</button></div>';
    var b = listEl.querySelector('.mh-login');
    if (b) b.onclick = function () { var m = document.getElementById('authModal'); if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; } };
  }

  function songHTML(s, i) {
    var vid = ytId(s.youtube);
    var tags = '';
    if (s.key) tags += '<span class="song-key">Key ' + esc(s.key) + '</span>';
    if (s.bpm) tags += '<span class="song-bpm">' + esc(s.bpm) + ' BPM</span>';
    var yt = '';
    if (s.youtube) {
      yt = '<span class="song-yt"><a href="' + esc(s.youtube) + '" target="_blank" rel="noopener" class="yt-open" data-vid="' + esc(vid) + '">▶ 영상</a></span>';
    }
    var embed = vid ? '<div class="yt-embed" data-vid="' + esc(vid) + '"></div>' : '';
    return '<div class="song"><div class="song-no">' + (i + 1) + '</div>' +
      '<div class="song-main"><div class="song-title">' + esc(s.title || '(제목 없음)') + '</div>' +
      (tags ? '<div class="song-tags">' + tags + '</div>' : '') +
      (s.memo ? '<div class="song-memo">' + esc(s.memo) + '</div>' : '') + embed + '</div>' + yt + '</div>';
  }

  function contiHTML(row) {
    var songs = songsOf(row);
    var d = fmtDate(row.service_date);
    var dateBox = d ? '<div class="conti-date"><div class="cd-md">' + esc(d.md) + '</div><div class="cd-y">' + esc(d.y) + '</div></div>'
                    : '<div class="conti-date" style="background:#9aa5b1"><div class="cd-md">♪</div></div>';
    var meta = [row.service, row.leader ? '인도 ' + row.leader : ''].filter(Boolean).map(esc).join(' · ');
    return '<div class="conti" data-id="' + esc(row.id) + '">' +
      '<div class="conti-head">' + dateBox +
      '<div class="conti-titlewrap"><div class="conti-title">' + esc(row.title) + '</div>' +
      (meta ? '<div class="conti-meta">' + meta + '</div>' : '') + '</div>' +
      '<span class="conti-count">' + songs.length + '곡</span><span class="conti-chev">▾</span></div>' +
      '<div class="conti-body">' +
      (songs.length ? songs.map(songHTML).join('') : '<p class="placeholder-note" style="margin:6px 0">등록된 찬양이 없습니다.</p>') +
      (row.memo ? '<div class="conti-notememo">📝 ' + esc(row.memo) + '</div>' : '') +
      (admin ? '<div class="conti-actions"><button class="btn btn-line conti-edit" style="padding:5px 14px;font-size:.85rem">수정</button>' +
               '<button class="btn conti-del" style="padding:5px 14px;font-size:.85rem;background:#c0392b;color:#fff;border:0">삭제</button></div>' : '') +
      '</div></div>';
  }

  var ROWS = [];
  function render() {
    if (!ROWS.length) {
      listEl.innerHTML = '<div class="fin-card" style="text-align:center;color:var(--ink-soft,#7b8794);padding:34px 16px">아직 등록된 콘티가 없습니다.' +
        (admin ? '<br>위 <b>＋ 새 콘티</b> 버튼으로 첫 콘티를 만들어 보세요.' : '') + '</div>';
      return;
    }
    listEl.innerHTML = ROWS.map(contiHTML).join('');
    // 아코디언 + 영상 토글 + 관리
    listEl.querySelectorAll('.conti').forEach(function (card) {
      var head = card.querySelector('.conti-head');
      head.addEventListener('click', function (e) {
        if (e.target.closest('.conti-actions') || e.target.closest('.song-yt')) return;
        card.classList.toggle('open');
      });
      var row = ROWS.filter(function (r) { return String(r.id) === card.dataset.id; })[0];
      card.querySelectorAll('.yt-open').forEach(function (a) {
        a.addEventListener('click', function (e) {
          var vid = a.dataset.vid; if (!vid) return; // 유효 유튜브 아니면 새 탭으로
          e.preventDefault();
          var box = a.closest('.song').querySelector('.yt-embed');
          if (!box) { window.open(a.href, '_blank'); return; }
          if (box.classList.contains('show')) { box.classList.remove('show'); box.innerHTML = ''; }
          else { box.innerHTML = '<iframe src="https://www.youtube.com/embed/' + vid + '" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen></iframe>'; box.classList.add('show'); }
        });
      });
      var edit = card.querySelector('.conti-edit'), del = card.querySelector('.conti-del');
      if (edit && row) edit.addEventListener('click', function () { openEditor(row); });
      if (del && row) del.addEventListener('click', function () {
        if (!confirm('‘' + row.title + '’ 콘티를 삭제할까요?')) return;
        del.disabled = true;
        jsonFetch(SB() + '/rest/v1/praise_setlists?id=eq.' + row.id, { method: 'DELETE', headers: authHeaders({ Prefer: 'return=minimal' }) })
          .then(function () { load(); }).catch(function (e) { del.disabled = false; alert('삭제 오류: ' + e.message); });
      });
    });
  }

  function load() {
    var me = currentUser();
    if (!me || !me.id) { loginPrompt(); if (addBtn) addBtn.style.display = 'none'; return; }
    listEl.innerHTML = '<p class="qt-loading">불러오는 중…</p>';
    isAdminUser(me.id).then(function (a) {
      admin = a; if (addBtn) addBtn.style.display = admin ? '' : 'none';
      return listSetlists();
    }).then(function (rows) {
      ROWS = rows || []; render();
    }).catch(function (e) {
      if (/praise_setlists|relation|does not exist|schema cache|404/i.test(e.message) || e.status === 404) {
        listEl.innerHTML = '<div class="fin-card" style="text-align:center;padding:30px 16px"><h3 style="color:var(--accent,#032257);margin:0 0 6px">콘티 기능 준비 필요</h3>' +
          '<p style="color:var(--ink-soft,#7b8794)">관리자가 Supabase SQL Editor에서 <b>supabase/praise.sql</b> 을 한 번 실행하면 콘티를 이용할 수 있습니다.<br>(악보·음원 공유는 지금 바로 사용 가능합니다.)</p></div>';
      } else {
        listEl.innerHTML = '<p class="qt-loading">불러오기 오류: ' + esc(e.message) + '</p>';
      }
    });
  }

  /* ── 콘티 입력/수정 모달 ── */
  var SERVICE_OPTS = ['주일 1부', '주일 2부', '주일 3부', '수요예배', '새벽예배', '금요기도회', '찬양연습', '특별예배', '기타'];
  function songEditRow(s, i) {
    s = s || {};
    return '<div class="song-edit"><div class="se-top"><span class="se-num">' + (i + 1) + '</span>' +
      '<span style="color:var(--ink-soft,#7b8794);font-size:.8rem">번째 찬양</span>' +
      '<button type="button" class="se-del">삭제</button></div>' +
      '<div class="se-grid" style="margin-bottom:8px"><input type="text" class="se-title" placeholder="찬양 제목" value="' + esc(s.title || '') + '">' +
      '<input type="text" class="se-key" placeholder="Key (예: G, Em)" value="' + esc(s.key || '') + '">' +
      '<input type="text" class="se-bpm" inputmode="numeric" placeholder="BPM" value="' + esc(s.bpm || '') + '"></div>' +
      '<input type="text" class="se-yt" placeholder="유튜브 연습 영상 링크 (선택)" value="' + esc(s.youtube || '') + '" style="width:100%;padding:8px 10px;border:1px solid #dfe5ee;border-radius:8px;font:inherit;margin-bottom:8px">' +
      '<input type="text" class="se-memo" placeholder="메모 (예: 1절 후 간주, 조옮김 등)" value="' + esc(s.memo || '') + '" style="width:100%;padding:8px 10px;border:1px solid #dfe5ee;border-radius:8px;font:inherit"></div>';
  }
  function openEditor(row) {
    row = row || {};
    var songs = songsOf(row); if (!songs.length) songs = [{}];
    var ov = document.createElement('div'); ov.className = 'mh-ov';
    ov.innerHTML = '<div class="mh-modal" id="ce_box"></div>';
    document.body.appendChild(ov);
    var box = ov.querySelector('#ce_box');
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var svcList = SERVICE_OPTS.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('');
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h3 style="margin:0;color:var(--accent,#032257)">' + (row.id ? '콘티 수정' : '＋ 새 콘티') + '</h3><button class="btn btn-line" id="ce_cancel" style="padding:4px 12px">취소</button></div>' +
      '<div class="af-row"><div class="af-field"><label>날짜</label><input type="date" id="ce_date" value="' + esc(row.service_date ? String(row.service_date).slice(0, 10) : '') + '"></div>' +
      '<div class="af-field"><label>예배·모임 구분</label><input type="text" id="ce_service" list="ce_svc" placeholder="예: 주일 3부" value="' + esc(row.service || '') + '"><datalist id="ce_svc">' + svcList + '</datalist></div>' +
      '<div class="af-field"><label>인도자</label><input type="text" id="ce_leader" placeholder="예: 홍길동" value="' + esc(row.leader || '') + '"></div></div>' +
      '<div class="af-field"><label>콘티 제목 <span style="color:#9aa5b1;font-weight:400">(비우면 날짜·구분으로 자동 생성)</span></label><input type="text" id="ce_title" placeholder="예: 7/20 주일 3부 찬양" value="' + esc(row.title || '') + '"></div>' +
      '<div style="border-top:1px solid #eef1f5;margin:12px 0 10px;padding-top:12px"><b style="color:var(--accent,#032257)">찬양 목록</b></div>' +
      '<div id="ce_songs">' + songs.map(songEditRow).join('') + '</div>' +
      '<button type="button" class="btn btn-line" id="ce_addsong" style="padding:7px 14px;margin-bottom:12px">＋ 찬양 추가</button>' +
      '<div class="af-field"><label>콘티 메모/전달사항 (선택)</label><textarea id="ce_memo" rows="2" placeholder="찬양단 전체 전달사항">' + esc(row.memo || '') + '</textarea></div>' +
      '<div style="display:flex;gap:10px;align-items:center;margin-top:6px"><button class="btn btn-solid" id="ce_save" style="padding:10px 26px">저장</button><span class="mh-msg" id="ce_msg"></span></div>';

    var songsWrap = box.querySelector('#ce_songs');
    function renumber() { songsWrap.querySelectorAll('.song-edit').forEach(function (el, i) { el.querySelector('.se-num').textContent = i + 1; }); }
    function bindDel() {
      songsWrap.querySelectorAll('.se-del').forEach(function (b) {
        b.onclick = function () { if (songsWrap.querySelectorAll('.song-edit').length <= 1) { b.closest('.song-edit').querySelectorAll('input').forEach(function (i) { i.value = ''; }); return; } b.closest('.song-edit').remove(); renumber(); };
      });
    }
    bindDel();
    box.querySelector('#ce_addsong').onclick = function () {
      var div = document.createElement('div'); div.innerHTML = songEditRow({}, songsWrap.querySelectorAll('.song-edit').length);
      songsWrap.appendChild(div.firstChild); renumber(); bindDel();
    };
    box.querySelector('#ce_cancel').onclick = close;

    var msg = box.querySelector('#ce_msg');
    box.querySelector('#ce_save').onclick = function () {
      var date = box.querySelector('#ce_date').value || null;
      var service = box.querySelector('#ce_service').value.trim();
      var leader = box.querySelector('#ce_leader').value.trim();
      var title = box.querySelector('#ce_title').value.trim();
      var memo = box.querySelector('#ce_memo').value.trim();
      var songArr = [];
      songsWrap.querySelectorAll('.song-edit').forEach(function (el) {
        var t = el.querySelector('.se-title').value.trim();
        var k = el.querySelector('.se-key').value.trim();
        var b = el.querySelector('.se-bpm').value.replace(/[^0-9]/g, '');
        var y = el.querySelector('.se-yt').value.trim();
        var mm = el.querySelector('.se-memo').value.trim();
        if (t || k || y || mm) songArr.push({ title: t, key: k, bpm: b, youtube: y, memo: mm });
      });
      if (!title) {
        if (date) { var dd = fmtDate(date); title = dd.md + (service ? ' ' + service : ' 찬양'); }
        else if (service) title = service + ' 찬양';
        else title = '새 콘티';
      }
      if (!songArr.length) { msg.style.color = '#c0392b'; msg.textContent = '찬양을 1곡 이상 입력해 주세요.'; return; }
      var body = { service_date: date, title: title, service: service || null, leader: leader || null, songs: songArr, memo: memo || null };
      msg.style.color = 'var(--ink-soft,#7b8794)'; msg.textContent = '저장 중…';
      var url = SB() + '/rest/v1/praise_setlists', opts;
      if (row.id) { url += '?id=eq.' + row.id; body.updated_at = new Date().toISOString(); opts = { method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify(body) }; }
      else { opts = { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify(body) }; }
      jsonFetch(url, opts).then(function () {
        msg.style.color = 'green'; msg.textContent = '✓ 저장되었습니다';
        setTimeout(function () { close(); load(); }, 500);
      }).catch(function (e) { msg.style.color = '#c0392b'; msg.textContent = '저장 실패: ' + e.message; });
    };
    setTimeout(function () { var f = box.querySelector('#ce_date'); if (f) f.focus(); }, 50);
  }

  if (addBtn) addBtn.onclick = function () { openEditor(null); };

  /* ── 정회원 전용 접근 게이트 (대시보드와 동일: member_links.member_status) ── */
  var lockEl = document.getElementById('mhLock'), tabsEl = document.getElementById('mhTabs');
  function setContentVisible(show) {
    if (tabsEl) tabsEl.style.display = show ? '' : 'none';
    document.querySelectorAll('.mh-panel').forEach(function (p) { p.style.display = show ? '' : 'none'; });
  }
  function showLock(title, msg, mode) {
    setContentVisible(false);
    if (!lockEl) return;
    lockEl.style.display = '';
    lockEl.innerHTML = '<div class="member-lock"><div class="lock-icon">🔒</div><h3>' + esc(title) + '</h3><p>' + esc(msg) + '</p></div>';
    var box = lockEl.querySelector('.member-lock');
    if (mode === 'login') {
      var b = document.createElement('button'); b.className = 'btn btn-line'; b.style.marginTop = '12px'; b.textContent = '로그인';
      b.onclick = function () { var m = document.getElementById('authModal'); if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; } };
      box.appendChild(b);
    } else if (mode === 'profile') {
      var b2 = document.createElement('button'); b2.className = 'btn btn-line'; b2.style.marginTop = '12px'; b2.textContent = '내 정보로 이동 →';
      b2.onclick = function () { location.href = 'admin.html'; };
      box.appendChild(b2);
    }
  }
  function memberStatus(uid) {
    return jsonFetch(SB() + '/rest/v1/member_links?user_id=eq.' + uid + '&select=member_status', { headers: authHeaders() })
      .then(function (rows) { var r = rows && rows[0]; return r ? r.member_status : ''; }).catch(function () { return ''; });
  }
  function initGate() {
    var me = currentUser();
    if (!me || !me.id) { showLock('로그인이 필요합니다', '마하나임 찬양단은 정회원 로그인 후 이용할 수 있습니다.', 'login'); return; }
    showLock('확인 중', '접근 권한을 확인하고 있습니다…');
    memberStatus(me.id).then(function (st) {
      if (st === '정회원') {
        if (lockEl) lockEl.style.display = 'none';
        setContentVisible(true);
        load();
      } else {
        showLock('정회원 전용입니다', '마하나임 찬양단 자료는 교적 인증을 마친 정회원만 이용할 수 있습니다. (준회원은 교적 연결 후 이용 가능)', 'profile');
      }
    });
  }
  if (listEl) initGate();

  /* ============================================================
     3) 연습 도구 — 메트로놈
     ============================================================ */
  var Metro = (function () {
    var ctx = null, running = false, tempo = 90, beats = 4;
    var current = 0, nextTime = 0, timer = null, queue = [];
    var bpmEl = document.getElementById('mBpm'), range = document.getElementById('mRange');
    var dotsEl = document.getElementById('mDots'), beatsSel = document.getElementById('mBeats');
    var toggle = document.getElementById('mToggle');
    if (!toggle) return {};

    function drawDots() {
      dotsEl.innerHTML = '';
      for (var i = 0; i < beats; i++) { var d = document.createElement('div'); d.className = 'beat-dot' + (i === 0 ? ' accent' : ''); dotsEl.appendChild(d); }
    }
    function setTempo(v) { tempo = Math.max(40, Math.min(240, v | 0)); bpmEl.textContent = tempo; range.value = tempo; }
    function schedule(beat, time) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = beat === 0 ? 1500 : 900;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(beat === 0 ? 0.6 : 0.35, time + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      o.connect(g); g.connect(ctx.destination); o.start(time); o.stop(time + 0.06);
      queue.push({ beat: beat, time: time });
    }
    function scheduler() {
      while (nextTime < ctx.currentTime + 0.12) {
        schedule(current, nextTime);
        nextTime += 60.0 / tempo;
        current = (current + 1) % beats;
      }
    }
    function drawLoop() {
      if (!running) return;
      var now = ctx.currentTime;
      while (queue.length && queue[0].time < now) {
        var b = queue.shift().beat;
        var dots = dotsEl.children;
        for (var i = 0; i < dots.length; i++) dots[i].classList.remove('on');
        if (dots[b]) dots[b].classList.add('on');
      }
      requestAnimationFrame(drawLoop);
    }
    function start() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      running = true; current = 0; nextTime = ctx.currentTime + 0.06; queue = [];
      timer = setInterval(scheduler, 25); requestAnimationFrame(drawLoop);
      toggle.textContent = '■ 정지'; toggle.classList.add('btn-line'); toggle.classList.remove('btn-solid');
    }
    function stop() {
      running = false; if (timer) clearInterval(timer); timer = null; queue = [];
      Array.prototype.forEach.call(dotsEl.children, function (d) { d.classList.remove('on'); });
      toggle.textContent = '▶ 시작'; toggle.classList.add('btn-solid'); toggle.classList.remove('btn-line');
    }

    drawDots();
    toggle.onclick = function () { running ? stop() : start(); };
    document.getElementById('mMinus').onclick = function () { setTempo(tempo - 1); };
    document.getElementById('mPlus').onclick = function () { setTempo(tempo + 1); };
    range.oninput = function () { setTempo(+range.value); };
    beatsSel.onchange = function () { beats = +beatsSel.value; current = 0; drawDots(); };

    // 탭 템포
    var taps = [];
    document.getElementById('mTap').onclick = function () {
      var now = (window.performance && performance.now) ? performance.now() : +new Date();
      taps = taps.filter(function (t) { return now - t < 2500; }); taps.push(now);
      if (taps.length >= 2) {
        var sum = 0; for (var i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
        setTempo(Math.round(60000 / (sum / (taps.length - 1))));
      }
    };
    return { stop: stop };
  })();

  /* ============================================================
     3) 연습 도구 — 튜너 (마이크 + 자기상관 피치검출)
     ============================================================ */
  var Tuner = (function () {
    var NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    var ctx = null, analyser = null, stream = null, buf = null, running = false, raf = null;
    var noteEl = document.getElementById('tNote'), centsEl = document.getElementById('tCents');
    var needle = document.getElementById('tNeedle'), toggle = document.getElementById('tToggle');
    var hint = document.getElementById('tHint');
    if (!toggle) return { stop: function () {} };

    function autoCorrelate(b, rate) {
      var SIZE = b.length, rms = 0, i, j;
      for (i = 0; i < SIZE; i++) rms += b[i] * b[i];
      rms = Math.sqrt(rms / SIZE);
      if (rms < 0.01) return -1;
      var r1 = 0, r2 = SIZE - 1, thres = 0.2;
      for (i = 0; i < SIZE / 2; i++) if (Math.abs(b[i]) < thres) { r1 = i; break; }
      for (i = 1; i < SIZE / 2; i++) if (Math.abs(b[SIZE - i]) < thres) { r2 = SIZE - i; break; }
      b = b.slice(r1, r2); SIZE = b.length;
      var c = new Array(SIZE).fill(0);
      for (i = 0; i < SIZE; i++) for (j = 0; j < SIZE - i; j++) c[i] += b[j] * b[j + i];
      var d = 0; while (d < SIZE - 1 && c[d] > c[d + 1]) d++;
      var maxval = -1, maxpos = -1;
      for (i = d; i < SIZE; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
      var T0 = maxpos;
      if (T0 <= 0) return -1;
      var x1 = c[T0 - 1] || 0, x2 = c[T0], x3 = c[T0 + 1] || 0;
      var a = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
      if (a) T0 = T0 - bb / (2 * a);
      return rate / T0;
    }

    function update() {
      if (!running) return;
      analyser.getFloatTimeDomainData(buf);
      var freq = autoCorrelate(buf, ctx.sampleRate);
      if (freq > 0) {
        var noteFloat = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
        var note = Math.round(noteFloat);
        var cents = Math.floor((noteFloat - note) * 100);
        var name = NOTES[(note % 12 + 12) % 12];
        var oct = Math.floor(note / 12) - 1;
        noteEl.innerHTML = name + '<small>' + oct + '</small>';
        var abs = Math.abs(cents);
        var cls = abs <= 5 ? 'in-tune' : (cents < 0 ? 'flat-note' : 'sharp-note');
        noteEl.className = 'tuner-note ' + cls;
        centsEl.textContent = abs <= 5 ? '정확해요 ✓' : (cents > 0 ? '+' + cents + ' cent (높음 ♯)' : cents + ' cent (낮음 ♭)');
        var pos = Math.max(0, Math.min(100, 50 + cents));
        needle.style.left = pos + '%';
      } else {
        noteEl.textContent = '—'; noteEl.className = 'tuner-note';
        centsEl.textContent = '소리를 들려주세요';
        needle.style.left = '50%';
      }
      raf = requestAnimationFrame(update);
    }

    function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { hint.textContent = '이 브라우저는 마이크 입력을 지원하지 않습니다.'; return; }
      hint.textContent = '마이크 권한을 허용해 주세요…';
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: false } }).then(function (s) {
        stream = s;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
        buf = new Float32Array(analyser.fftSize);
        var src = ctx.createMediaStreamSource(stream); src.connect(analyser);
        running = true; hint.textContent = '';
        toggle.textContent = '■ 튜너 정지'; toggle.classList.add('btn-line'); toggle.classList.remove('btn-solid');
        update();
      }).catch(function (e) { hint.textContent = '마이크를 사용할 수 없습니다: ' + (e && e.message ? e.message : '권한 거부'); });
    }
    function stop() {
      running = false; if (raf) cancelAnimationFrame(raf); raf = null;
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
      noteEl.textContent = '—'; noteEl.className = 'tuner-note'; centsEl.textContent = '시작을 눌러 주세요'; needle.style.left = '50%';
      toggle.textContent = '🎤 튜너 시작'; toggle.classList.add('btn-solid'); toggle.classList.remove('btn-line');
    }
    toggle.onclick = function () { running ? stop() : start(); };
    return { stop: stop };
  })();

  // 페이지 벗어날 때 마이크/오디오 정리
  window.addEventListener('pagehide', function () { try { Tuner.stop(); } catch (e) {} try { Metro.stop && Metro.stop(); } catch (e) {} });
})();
