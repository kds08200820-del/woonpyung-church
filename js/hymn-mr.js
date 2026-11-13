/* 새찬송가 반주(MR) 재생기 — 2026-11-13 (담임목사: 악보대로 전주 4마디 + 전곡, 오케스트라·피아노, 로그인한 성도만)
   반주는 교회 PC 가 악보 그림으로 만든다(tools/hymn_mr). 파일은 교회 파일 저장소의 보호 폴더에 있고,
   로그인한 성도가 누르면 저장소 워커가 6시간짜리 재생 주소를 준다(/hymn-mr-url). 공개 주소는 없다.

   HymnMR.has(장)            반주가 있는 장인지 (목록은 처음 한 번 /hymn-mr-have 에서 받는다)
   HymnMR.play(장, 단추, opt)  화면 구석에 재생 창 — opt.bottom(아래 여백), opt.doc(다른 창의 문서), opt.big(가사를 처음부터 크게 — 예배 화면)
   HymnMR.toggle / stop / sync(장, 단추)  — 보는 장이 바뀌면 sync: 다른 장은 끄고, 단추는 반주가 있는 장에서만 보인다
   노래방 가사(2026-11-13 담임목사): 반주와 같은 시간표(NNN_lyrics.json)로 지금 줄을 음절마다 밝히고, 다음 줄을 아래에 보인다. 「크게」는 화면 가운데 큰 글씨. */
(function () {
  var STORE = (window.R2_UPLOAD_URL || 'https://church-files.kds08200820.workers.dev').replace(/\/$/, '');
  var have = null, loading = null, waiters = [];
  var box = null, cur = 0, btn = null, audio = null, raf = 0;
  var KIND_KEY = 'hymnMrKind';

  function load() {
    if (have || loading) return loading;
    loading = fetch(STORE + '/hymn-mr-have').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { setTimeout(function () { have = null; loading = null; }, 30000); return { nos: [] }; })   // 못 받으면 30초 뒤 다시
      .then(function (j) { have = {}; (j.nos || []).forEach(function (n) { have[n] = 1; }); waiters.splice(0).forEach(function (f) { f(); }); });
    return loading;
  }
  function has(no) { return !!(have && have[+no]); }
  function ready(f) { if (have) f(); else { waiters.push(f); load(); } }

  function token() {
    try {
      var url = window.SUPABASE_URL || (window.MODU && window.MODU.supabaseUrl) || 'https://cetacttsdwzxjzkyozgd.supabase.co';
      var ref = new URL(url).hostname.split('.')[0], raw = localStorage.getItem('sb-' + ref + '-auth-token');
      if (!raw) return null;
      var s0 = JSON.parse(raw), s = s0 && s0.currentSession ? s0.currentSession : s0;
      if (!s || !s.access_token) return null;
      if (s.expires_at && s.expires_at * 1000 < Date.now()) return null;
      return s.access_token;
    } catch (e) { return null; }
  }
  function label(b, on) { if (!b) return; b.textContent = on ? '반주 끄기' : (b.getAttribute('data-idle') || '반주'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (audio) { try { audio.pause(); } catch (e) {} audio = null; }
    if (box) { box.remove(); box = null; }
    cur = 0; label(btn, false); btn = null;
  }

  function play(no, b, opt) {
    stop();
    opt = opt || {};
    var doc = opt.doc || document;
    no = +no; cur = no; btn = b || null; label(btn, true);
    box = doc.createElement('div');
    box.setAttribute('role', 'region'); box.setAttribute('aria-label', '새찬송가 ' + no + '장 반주');
    box.style.cssText = 'position:fixed;right:10px;bottom:' + (opt.bottom || 12) + 'px;z-index:2147483000;width:300px;max-width:calc(100vw - 20px);' +
      'background:#111;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35);font:13px/1.4 "Noto Sans KR",sans-serif';
    var bs = 'border:1px solid #777;background:transparent;color:#fff;font:inherit;padding:3px 9px;cursor:pointer;margin-left:6px';
    var bar = doc.createElement('div'); bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:7px 9px 5px';
    var t = doc.createElement('span'); t.textContent = no + '장 반주';
    var right = doc.createElement('span');
    var kinds = {}, kind = 'orch';
    try { kind = localStorage.getItem(KIND_KEY) || 'orch'; } catch (e) {}
    [['orch', '오케스트라'], ['piano', '피아노']].forEach(function (k) {
      var x = doc.createElement('button'); x.type = 'button'; x.textContent = k[1]; x.style.cssText = bs; x.hidden = true;
      x.onclick = function () { choose(k[0], true); };
      kinds[k[0]] = x; right.appendChild(x);
    });
    // 빠르기: 기본 1.25배(2026-11-13 목사님). 고른 값은 이 기기에 기억한다. 음높이는 그대로(브라우저 기본)
    var RATE_KEY = 'hymnmr_rate', rate = 1.25;
    try { var sr = parseFloat(localStorage.getItem(RATE_KEY)); if (sr >= 0.5 && sr <= 2) rate = sr; } catch (e) {}
    var rateSel = doc.createElement('select'); rateSel.title = '빠르기';
    rateSel.style.cssText = bs + ';padding-right:4px';
    [1, 1.1, 1.25, 1.4, 1.5].forEach(function (v) { var o = doc.createElement('option'); o.value = v; o.textContent = v + '배'; o.style.color = '#111'; rateSel.appendChild(o); });
    rateSel.value = rate;
    if (rateSel.value === '') { var o2 = doc.createElement('option'); o2.value = rate; o2.textContent = rate + '배'; o2.style.color = '#111'; rateSel.appendChild(o2); rateSel.value = rate; }
    function applyRate() { if (audio) { audio.defaultPlaybackRate = rate; audio.playbackRate = rate; } }
    rateSel.onchange = function () { rate = parseFloat(rateSel.value) || 1.25; try { localStorage.setItem(RATE_KEY, rate); } catch (e) {} applyRate(); };
    right.appendChild(rateSel);
    var bigBtn = doc.createElement('button'); bigBtn.type = 'button'; bigBtn.textContent = '크게'; bigBtn.style.cssText = bs; bigBtn.hidden = true;
    var close = doc.createElement('button'); close.type = 'button'; close.textContent = '닫기'; close.style.cssText = bs; close.onclick = stop;
    right.appendChild(bigBtn); right.appendChild(close);
    bar.appendChild(t); bar.appendChild(right);
    var msg = doc.createElement('div'); msg.style.cssText = 'padding:2px 10px 9px;color:#ccc'; msg.textContent = '반주를 불러오는 중…';
    // 노래방 가사 자리
    var ly = doc.createElement('div'); ly.hidden = true;
    ly.style.cssText = 'padding:4px 12px 10px;text-align:center';
    var lyLab = doc.createElement('div'), lyNow = doc.createElement('div'), lyNext = doc.createElement('div');
    ly.appendChild(lyLab); ly.appendChild(lyNow); ly.appendChild(lyNext);
    box.appendChild(bar); box.appendChild(ly); box.appendChild(msg);
    doc.body.appendChild(box);
    var myBox = box, files = {}, LY = null, rows = [], shown = -2, big = false, smallCss = box.style.cssText;
    function lyStyle() {
      lyLab.style.cssText = 'font-size:' + (big ? '15px' : '11px') + ';color:#9a9a9a;letter-spacing:.08em;min-height:1.3em';
      lyNow.style.cssText = 'font-size:' + (big ? 'clamp(26px,4.2vw,52px)' : '18px') + ';line-height:1.35;font-weight:600;min-height:1.35em;word-break:keep-all';
      lyNext.style.cssText = 'font-size:' + (big ? 'clamp(17px,2.4vw,30px)' : '13px') + ';line-height:1.4;color:#7d7d7d;min-height:1.4em;margin-top:' + (big ? '10px' : '3px') + ';word-break:keep-all';
    }
    lyStyle();
    bigBtn.onclick = function () {
      big = !big; bigBtn.textContent = big ? '작게' : '크게';
      box.style.cssText = big
        ? 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483000;width:min(94vw,1100px);background:#111;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.5);font:15px/1.4 "Noto Sans KR",sans-serif'
        : smallCss;
      ly.style.padding = big ? '18px 24px 26px' : '4px 12px 10px';
      lyStyle(); shown = -2;
    };
    function lineHtml(row, t) {
      return row.syl.map(function (w) {
        var c = t >= w[1] ? '#fff' : '#777', u = '';
        if (t >= w[0] && t < w[1]) {         // 지금 부르는 음절: 앞에서부터 차오른다
          var pc = Math.max(0, Math.min(100, Math.round((t - w[0]) / (w[1] - w[0]) * 100)));
          return '<span style="background:linear-gradient(90deg,#fff ' + pc + '%,#777 ' + pc + '%);-webkit-background-clip:text;background-clip:text;color:transparent">' + esc(w[2]) + '</span>' + (w[3] ? ' ' : '');
        }
        return '<span style="color:' + c + u + '">' + esc(w[2]) + '</span>' + (w[3] ? ' ' : '');
      }).join('');
    }
    function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function plain(row) { return row ? esc(row.syl.map(function (w) { return w[2] + (w[3] ? ' ' : ''); }).join('')) : ''; }
    function setupLyrics(d) {
      LY = d; rows = [];
      (d.verses || []).forEach(function (v) { (v.lines || []).forEach(function (ln) { if (ln.length) rows.push({ lab: v.n + '절', syl: ln, t0: ln[0][0], t1: ln[ln.length - 1][1] }); }); });
      if (d.amen && d.amen.length) rows.push({ lab: '아멘', syl: d.amen, t0: d.amen[0][0], t1: d.amen[d.amen.length - 1][1] });
      if (!rows.length) return;
      ly.hidden = false; bigBtn.hidden = false;
      if (opt.big && !big) bigBtn.onclick();       // 예배 화면(오늘의 예배·설교 발표)에서는 가사를 처음부터 크게
      tick();
    }
    function tick() {
      raf = 0;
      if (!draw()) return;
      if (!audio.paused) raf = requestAnimationFrame(tick);
    }
    function draw() {
      if (myBox !== box || !audio || !rows.length) return false;
      var t = audio.currentTime + ((LY.shift || {})[kind] || 0) + 0.05;
      var i = -1;
      for (var k = 0; k < rows.length; k++) { if (rows[k].t0 <= t + 0.25) i = k; else break; }   // 줄은 0.25초 먼저 보인다
      if (i < 0) {
        if (shown !== -1) { lyLab.textContent = '전주'; lyNow.innerHTML = ''; lyNext.innerHTML = plain(rows[0]); shown = -1; }
      } else {
        lyLab.textContent = rows[i].lab;
        lyNow.innerHTML = lineHtml(rows[i], t);
        if (shown !== i) { lyNext.innerHTML = plain(rows[i + 1]); shown = i; }
      }
      return true;
    }

    function choose(k, user) {
      if (!files[k]) return;
      kind = k;
      if (user) { try { localStorage.setItem(KIND_KEY, k); } catch (e) {} }
      Object.keys(kinds).forEach(function (n) { kinds[n].style.background = n === k ? '#fff' : 'transparent'; kinds[n].style.color = n === k ? '#111' : '#fff'; });
      var at = audio ? audio.currentTime : 0, was = audio && !audio.paused;
      if (!audio) {
        audio = doc.createElement('audio'); audio.controls = true; audio.preload = 'auto';
        audio.setAttribute('controlslist', 'nodownload'); audio.oncontextmenu = function () { return false; };
        audio.style.cssText = 'display:block;width:100%;height:40px';
        msg.replaceWith(audio);
        // 음원 출처(이용 조건: CC BY-SA·CC BY 는 출처를 밝혀야 한다)
        var cr = doc.createElement('div');
        cr.style.cssText = 'padding:3px 10px 7px;font-size:10px;line-height:1.4;color:#8a8a8a';
        cr.textContent = '오르간 Lars Palo · Piteå MHS (CC BY-SA) · 오케스트라 Virtual Playing Orchestra · 피아노 Salamander Grand Piano (CC BY) · 울림 OpenAIR, University of York (CC BY)';
        audio.after(cr);
        audio.addEventListener('loadedmetadata', applyRate);
        audio.addEventListener('play', function () { if (!raf && rows.length) raf = requestAnimationFrame(tick); });
        audio.addEventListener('seeked', function () { shown = -2; draw(); });
        audio.addEventListener('timeupdate', function () { draw(); });   // 화면이 뒤에 있어 그리기 틀이 멈춰도 1초에 4번은 맞춘다
        audio.onerror = function () { if (myBox === box) { var m = doc.createElement('div'); m.style.cssText = 'padding:2px 10px 9px;color:#f2b8b0'; m.textContent = '반주를 틀지 못했습니다. 새로고침 후 다시 눌러 주세요.'; box.appendChild(m); } };
        was = true;
      }
      audio.src = files[k]; applyRate();
      if (at) { audio.addEventListener('loadedmetadata', function f() { audio.removeEventListener('loadedmetadata', f); audio.currentTime = at; }); }
      if (was) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
    }

    var tk = token();
    if (!tk) { msg.textContent = '찬송가 반주는 로그인한 성도만 들을 수 있습니다. 로그인한 뒤 다시 눌러 주세요.'; return true; }
    fetch(STORE + '/hymn-mr-url', { method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify({ no: no }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._s = r.status; return j; }); })
      .then(function (j) {
        if (myBox !== box) return;                       // 그사이 닫거나 다른 장을 눌렀다
        if (j._s === 401) { msg.textContent = '찬송가 반주는 로그인한 성도만 들을 수 있습니다. 다시 로그인해 주세요.'; return; }
        files = j.files || {};
        if (!files.orch && !files.piano) { msg.textContent = j.error || '이 장의 반주는 아직 준비 중입니다.'; return; }
        Object.keys(kinds).forEach(function (k) { kinds[k].hidden = !files[k]; });
        choose(files[kind] ? kind : (files.orch ? 'orch' : 'piano'), false);
        if (files.lyrics) fetch(files.lyrics).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) { if (d && myBox === box) setupLyrics(d); }).catch(function () {});
      })
      .catch(function () { if (myBox === box) msg.textContent = '반주를 불러오지 못했습니다. 잠시 뒤 다시 눌러 주세요.'; });
    return true;
  }
  function toggle(no, b, opt) { if (cur === +no) stop(); else play(no, b, opt); }
  function sync(no, b) {
    if (cur && cur !== +no) stop();
    if (!b) return;
    var show = function () { b.hidden = !has(no); b.style.display = has(no) ? '' : 'none'; if (cur === +no) { btn = b; label(b, true); } else label(b, false); };
    b.hidden = true; b.style.display = 'none';
    ready(show);
  }
  window.HymnMR = { has: has, load: load, ready: ready, play: play, stop: stop, toggle: toggle, sync: sync, playing: function () { return cur; } };
  load();
})();
