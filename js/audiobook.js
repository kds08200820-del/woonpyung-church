/* ============================================================
   운평장로교회 — 오디오북 듣기 (audiobook.html 전용)
   «레위기에서 만난 예수 그리스도» 낭독 음원 재생기.

   · 접근: 교적 인증을 마친 정회원(member_links.member_status)과 관리자만.
   · 음원: Cloudflare R2 의 audiobook/ 폴더. 공개 주소(/f/)로는 열리지 않고,
           워커의 /book-audio-url 이 발급한 짧은 서명(6시간)이 붙은 주소로만 재생된다.
   · 이어듣기: 마지막에 듣던 장과 위치를 이 기기(localStorage)에 저장하고,
               서버(audiobook_progress)에도 올려 둔다 — 기기를 바꿔도 이어지고,
               목회행정 '오디오북 듣기 현황' 카드가 이 기록을 읽는다.
   콘솔: [audiobook.js] v20260806abp
   ============================================================ */
console.log('[audiobook.js] v20260806abp');

(function () {
  var DATA = window.AUDIOBOOK;
  var lockEl = document.getElementById('abLock');
  var bodyEl = document.getElementById('abBody');
  if (!lockEl || !bodyEl || !DATA) return;

  var listEl = document.getElementById('abList');
  var audio = document.getElementById('abAudio');
  var statusEl = document.getElementById('abStatus');
  var nowNo = document.getElementById('abNowNo');
  var nowTitle = document.getElementById('abNowTitle');
  var nowSub = document.getElementById('abNowSub');

  var PROGRESS_KEY = 'wp-audiobook-progress';
  var RATE_KEY = 'wp-audiobook-rate';

  var tickets = null;   // { exp, base, files: { 'book-01.mp3': '서명' } }
  var available = null; // 실제로 올라와 있는 파일 이름 Set (null = 아직 모름)
  var current = null;   // 지금 재생 중인 장
  var saveTimer = null;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ── 로그인 상태 (다른 페이지들과 같은 방식) ── */
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

  /* ── 이어듣기 기록 ── */
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) {}
  }
  function markPosition(id, sec, dur, flush) {
    var p = loadProgress();
    // 거의 끝까지 들었으면 '들음'으로 남기고 위치는 처음으로 되돌린다.
    var done = dur && sec > dur - 20;
    p[id] = { sec: done ? 0 : Math.floor(sec), dur: Math.floor(dur || 0), done: done || (p[id] && p[id].done) || false, ts: Date.now() };
    p.last = id;
    saveProgress(p);
    queuePush(id, done || flush);
  }

  /* ── 서버 동기화 (audiobook_progress) ──
     기기가 바뀌어도 이어듣도록, 그리고 목회행정 현황 카드가 읽도록
     들은 위치를 서버에도 저장한다. 실패해도 조용히 넘어간다(다음에 다시 시도). */
  var PUSH_MIN_MS = 30000;    // 재생 중에는 장마다 최대 30초에 한 번만 올린다
  var pushedAt = {};          // chapter_id → 마지막으로 올린 시각(ms)
  function queuePush(id, force) {
    var me = currentUser();
    if (!me || !me.id) return;
    var now = Date.now();
    if (!force && pushedAt[id] && now - pushedAt[id] < PUSH_MIN_MS) return;
    var rec = loadProgress()[id];
    if (!rec || (!rec.done && !(rec.sec > 5))) return;   // 5초 이상 들었을 때부터 기록
    pushedAt[id] = now;
    fetch(window.SUPABASE_URL + '/rest/v1/audiobook_progress', {
      method: 'POST',
      keepalive: !!force,   // 페이지를 닫는 순간에도 전송이 끊기지 않게
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + token(),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ user_id: me.id, chapter_id: id, sec: rec.sec, dur: rec.dur, done: rec.done }])
    }).catch(function () {});
  }
  // 서버 기록을 내려받아 이 기기 기록과 합친다(장마다 더 최근 것을 남김).
  function pullProgress() {
    var me = currentUser();
    if (!me || !me.id) return Promise.resolve();
    // ※ 관리자 계정은 RLS 상 전체를 볼 수 있으므로 반드시 본인 것만 청한다
    return fetch(window.SUPABASE_URL + '/rest/v1/audiobook_progress' +
      '?user_id=eq.' + me.id + '&select=chapter_id,sec,dur,done,updated_at', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token() }
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        if (!rows || !rows.length) return;
        var p = loadProgress();
        var newest = null;
        rows.forEach(function (row) {
          var local = p[row.chapter_id];
          var serverTs = Date.parse(row.updated_at) || 0;
          if (!local || serverTs > (local.ts || 0)) {
            p[row.chapter_id] = {
              sec: row.sec || 0, dur: row.dur || 0,
              done: (row.done || (local && local.done)) || false, ts: serverTs
            };
          } else if (row.done && !local.done) {
            local.done = true;   // 완료 표시는 어느 쪽에 있든 남긴다
          }
          if (!newest || serverTs > newest.ts) newest = { id: row.chapter_id, ts: serverTs };
        });
        if (!p.last && newest) p.last = newest.id;
        saveProgress(p);
      })
      .catch(function () {});
  }

  function fmt(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h) return h + '시간 ' + m + '분';
    return m + '분';
  }

  /* ── 잠금 안내 ── */
  function showLock(title, msg, mode) {
    bodyEl.style.display = 'none';
    lockEl.style.display = '';
    lockEl.innerHTML = '<div class="member-lock"><div class="lock-icon">🔒</div><h3>' +
      esc(title) + '</h3><p>' + esc(msg) + '</p></div>';
    var box = lockEl.querySelector('.member-lock');
    function addBtn(label, fn) {
      var b = document.createElement('button');
      b.className = 'btn btn-line';
      b.style.margin = '14px 6px 0';
      b.textContent = label;
      b.onclick = fn;
      box.appendChild(b);
    }
    if (mode === 'login') {
      addBtn('로그인', function () {
        var m = document.getElementById('authModal');
        if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; }
      });
    } else if (mode === 'profile') {
      addBtn('내 정보로 이동 →', function () { location.href = 'admin.html'; });
    }
    if (mode === 'login' || mode === 'profile') {
      addBtn('책 미리보기', function () { location.href = 'book.html'; });
    }
  }

  /* ── 목록 그리기 ── */
  function render() {
    var prog = loadProgress();
    var html = '';
    DATA.chapters.forEach(function (c) {
      if (c.part) html += '<div class="ab-part">' + esc(c.part) + '</div>';
      var p = prog[c.id] || {};
      var here = current && current.id === c.id;
      var missing = available && !available.has(c.id + '.mp3');
      var cls = 'ab-item' + (here ? ' playing' : '') + (missing ? ' missing' : '');
      var no = c.no === 0 ? '여는<br/>글' : (c.no === 28 ? '닫는<br/>글' : c.no + '장');
      var meta = missing ? '준비 중입니다' :
        [c.subtitle, c.scripture].filter(Boolean).join(' · ');
      var right = missing ? '' :
        (p.done ? '<span class="ab-done" title="다 들으셨습니다">✓</span>' : '') +
        '<span class="ab-len">' + fmt(p.dur || c.estSec) + '</span>';
      var barPct = (!missing && p.sec && (p.dur || c.estSec))
        ? Math.min(100, Math.round(p.sec / (p.dur || c.estSec) * 100)) : 0;
      html += '<button type="button" class="' + cls + '" data-id="' + esc(c.id) + '"' +
        (missing ? ' disabled' : '') + '>' +
        '<span class="ab-no">' + no + '</span>' +
        '<span class="ab-main">' +
          '<span class="ab-title">' + esc(c.title) + '</span>' +
          (meta ? '<span class="ab-meta">' + esc(meta) + '</span>' : '') +
          (barPct ? '<span class="ab-bar"><span style="width:' + barPct + '%"></span></span>' : '') +
        '</span>' +
        '<span class="ab-right">' + right + '</span>' +
      '</button>';
    });
    listEl.innerHTML = html;
    listEl.querySelectorAll('.ab-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var c = byId(el.dataset.id);
        if (c) play(c, null);
      });
    });
  }

  function byId(id) {
    for (var i = 0; i < DATA.chapters.length; i++) {
      if (DATA.chapters[i].id === id) return DATA.chapters[i];
    }
    return null;
  }

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || '';
    statusEl.className = 'ab-status' + (isErr ? ' err' : '');
  }

  /* ── 재생 열쇠 발급 ── */
  // 한 번 부르면 29개 장 전부에 대한 서명을 받아 둔다(장을 넘길 때마다 왕복하지 않게).
  function fetchTickets() {
    var names = DATA.chapters.map(function (c) { return c.id + '.mp3'; });
    return fetch(window.R2_UPLOAD_URL + '/book-audio-url', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: names })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.ok) {
          var err = new Error(j.error || ('재생 준비 실패(' + r.status + ')'));
          err.status = r.status; err.reason = j.reason;
          throw err;
        }
        tickets = j;
        // 워커는 실제로 올라와 있는 장에만 서명을 준다 — 그게 곧 '들을 수 있는 목록'이다.
        available = new Set(Object.keys(j.files || {}));
        return j;
      });
    });
  }

  function srcFor(c) {
    if (!tickets || !tickets.files[c.id + '.mp3']) return null;
    return tickets.base + encodeURIComponent(c.id + '.mp3') +
      '?e=' + tickets.exp + '&s=' + tickets.files[c.id + '.mp3'];
  }

  /* ── 재생 ── */
  function play(c, startAt) {
    var url = srcFor(c);
    if (!url) { setStatus('재생 준비 중입니다. 잠시 후 다시 눌러 주세요.', true); return; }
    current = c;
    nowNo.innerHTML = c.no === 0 ? '여는<br/>글' : (c.no === 28 ? '닫는<br/>글' : c.no + '장');
    nowTitle.textContent = (c.label + ' · ' + c.title).replace(/^(여는 글|닫는 글) · /, '');
    nowSub.textContent = [c.subtitle, c.scripture].filter(Boolean).join(' · ') || DATA.book;
    setStatus('');
    audio.src = url;
    var resume = startAt;
    if (resume == null) {
      var p = loadProgress()[c.id];
      resume = p && p.sec > 5 ? p.sec : 0;
    }
    if (resume) {
      audio.addEventListener('loadedmetadata', function once() {
        audio.removeEventListener('loadedmetadata', once);
        try { audio.currentTime = resume; } catch (e) {}
      });
    }
    audio.play().catch(function () { /* 사용자가 직접 재생 버튼을 누르면 된다 */ });
    render();
    var p2 = loadProgress(); p2.last = c.id; saveProgress(p2);
  }

  function step(delta) {
    if (!current) return;
    var list = DATA.chapters.filter(function (c) {
      return !available || available.has(c.id + '.mp3');
    });
    var i = list.findIndex(function (c) { return c.id === current.id; });
    var next = list[i + delta];
    if (next) play(next, 0);
  }

  /* ── 플레이어 이벤트 ── */
  audio.addEventListener('timeupdate', function () {
    if (!current) return;
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      markPosition(current.id, audio.currentTime, audio.duration);
    }, 3000);
  });
  audio.addEventListener('pause', function () {
    if (current) markPosition(current.id, audio.currentTime, audio.duration, true);
  });
  audio.addEventListener('ended', function () {
    if (current) { markPosition(current.id, audio.duration, audio.duration); render(); }
    step(1);
  });
  audio.addEventListener('error', function () {
    if (!current || !audio.src) return;
    // 6시간짜리 서명이 만료됐을 수 있으니 한 번은 조용히 다시 받아 이어 준다.
    var at = audio.currentTime;
    fetchTickets().then(function () {
      var url = srcFor(current);
      if (url && url !== audio.src) { audio.src = url; audio.currentTime = at; audio.play().catch(function () {}); }
      else setStatus('음원을 불러오지 못했습니다. 새로고침해 주세요.', true);
    }).catch(function () {
      setStatus('음원을 불러오지 못했습니다. 새로고침해 주세요.', true);
    });
  });
  window.addEventListener('pagehide', function () {
    if (current) markPosition(current.id, audio.currentTime, audio.duration, true);
  });

  document.getElementById('abPrev').onclick = function () { step(-1); };
  document.getElementById('abNext').onclick = function () { step(1); };

  var rateBtns = [].slice.call(document.querySelectorAll('.ab-rate'));
  function setRate(r) {
    audio.playbackRate = r;
    try { localStorage.setItem(RATE_KEY, String(r)); } catch (e) {}
    rateBtns.forEach(function (b) { b.classList.toggle('on', Number(b.dataset.rate) === r); });
  }
  rateBtns.forEach(function (b) {
    b.onclick = function () { setRate(Number(b.dataset.rate)); };
  });
  setRate(Number(localStorage.getItem(RATE_KEY)) || 1);

  /* ── 시작 ── */
  function start() {
    lockEl.style.display = 'none';
    bodyEl.style.display = '';
    render();
    setStatus('재생 준비 중…');
    Promise.all([fetchTickets(), pullProgress()]).then(function () {
      setStatus(available.size ? '' : '아직 올라온 음원이 없습니다.', !available.size);
      render();
      // 마지막에 듣던 장이 있으면 그 자리에 미리 올려 둔다(자동 재생은 하지 않음).
      var last = loadProgress().last;
      var c = last && byId(last);
      if (c && available.has(c.id + '.mp3')) {
        current = c;
        nowNo.innerHTML = c.no === 0 ? '여는<br/>글' : (c.no === 28 ? '닫는<br/>글' : c.no + '장');
        nowTitle.textContent = '이어 듣기 — ' + c.title;
        nowSub.textContent = '지난번에 듣던 곳부터 재생됩니다.';
        audio.src = srcFor(c);
        var p = loadProgress()[c.id];
        if (p && p.sec > 5) {
          audio.addEventListener('loadedmetadata', function once() {
            audio.removeEventListener('loadedmetadata', once);
            try { audio.currentTime = p.sec; } catch (e) {}
          });
        }
        render();
      }
    }).catch(function (e) {
      if (e.reason === 'not-member') {
        showLock('정회원 전용입니다',
          '오디오북은 교적 인증을 마친 정회원만 들을 수 있습니다. 내 정보에서 교적 연결을 마치시면 바로 이용하실 수 있습니다.', 'profile');
      } else {
        setStatus(e.message || '재생 준비에 실패했습니다.', true);
      }
    });
  }

  function memberStatus(uid) {
    return fetch(window.SUPABASE_URL + '/rest/v1/member_links?user_id=eq.' + uid + '&select=member_status', {
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token() }
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { return (rows && rows[0] && rows[0].member_status) || ''; })
      .catch(function () { return ''; });
  }

  function initGate() {
    if (!window.R2_UPLOAD_URL) {
      showLock('준비 중입니다', '오디오북 설정이 아직 끝나지 않았습니다. 잠시 후 다시 찾아와 주세요.');
      return;
    }
    var me = currentUser();
    if (!me || !me.id) {
      showLock('로그인이 필요합니다',
        '오디오북은 교적 인증을 마친 정회원이 무료로 들으실 수 있습니다. 먼저 로그인해 주세요.', 'login');
      return;
    }
    showLock('확인 중', '듣기 권한을 확인하고 있습니다…');
    // 정회원 여부를 먼저 보는 것은 화면을 빨리 띄우기 위해서다.
    // 준회원처럼 보여도 관리자일 수 있으니, 최종 판단은 서버(워커)에 맡긴다.
    memberStatus(me.id).then(start);
  }

  // layout.js 가 Supabase 클라이언트를 붙인 뒤 시작한다.
  if (window.__sb) initGate();
  else {
    window.addEventListener('sb-ready', initGate, { once: true });
    setTimeout(function () { if (!lockEl.innerHTML) initGate(); }, 1500);
  }
})();
