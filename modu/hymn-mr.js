/* 새찬송가 반주(MR) 재생기 — 2026-11-13 (담임목사: 악보대로 전주 4마디 + 전곡, 오케스트라·피아노, 로그인한 성도만)
   반주는 교회 PC 가 악보 그림으로 만든다(tools/hymn_mr). 파일은 교회 파일 저장소의 보호 폴더에 있고,
   로그인한 성도가 누르면 저장소 워커가 6시간짜리 재생 주소를 준다(/hymn-mr-url). 공개 주소는 없다.

   HymnMR.has(장)            반주가 있는 장인지 (목록은 처음 한 번 /hymn-mr-have 에서 받는다)
   HymnMR.play(장, 단추, opt)  재생 창 — opt.bottom(아래 여백), opt.doc(다른 창의 문서), opt.big(가사 전체 화면으로 시작 — 예배 화면),
                              opt.review(관리자 검토용 반주), opt.verses([1,4] — 부를 절)
   HymnMR.toggle / stop / sync(장, 단추)  — 보는 장이 바뀌면 sync: 다른 장은 끄고, 단추는 반주가 있는 장에서만 보인다
   노래방 가사: 반주와 같은 시간표(NNN_lyrics.json)로 지금 줄을 음절마다 밝힌다.
   2026-11-13 담임목사 "1절만·반복·전곡 연속·랜덤 재생, 애플 뮤직 같은 화면":
     작은 재생 창(카드) ↔ 가사 전체 화면. 절 고르기(전주·아멘은 그대로, 고르지 않은 절은 건너뜀), 한 곡 반복, 연속 재생(다음 장), 랜덤. */
(function () {
  var STORE = (window.R2_UPLOAD_URL || 'https://church-files.kds08200820.workers.dev').replace(/\/$/, '');
  var have = null, loading = null, waiters = [];
  var box = null, cur = 0, btn = null, audio = null, raf = 0;
  var KIND_KEY = 'hymnMrKind', RATE_KEY = 'hymnmr_rate', MODE_KEY = 'hymnmr_mode';
  var CREDIT = '오르간 Lars Palo · Piteå MHS (CC BY-SA) · 오케스트라 Virtual Playing Orchestra · 피아노 Salamander Grand Piano (CC BY) · 울림 OpenAIR, University of York (CC BY)';
  var FONT = '-apple-system,BlinkMacSystemFont,"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif';

  function load() {
    if (have || loading) return loading;
    loading = fetch(STORE + '/hymn-mr-have').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { setTimeout(function () { have = null; loading = null; }, 30000); return { nos: [] }; })   // 못 받으면 30초 뒤 다시
      .then(function (j) { have = {}; (j.nos || []).forEach(function (n) { have[n] = 1; }); waiters.splice(0).forEach(function (f) { f(); }); });
    return loading;
  }
  function has(no) { return !!(have && have[+no]); }
  function ready(f) { if (have) f(); else { waiters.push(f); load(); } }
  function haveList() { return have ? Object.keys(have).map(Number).sort(function (a, b) { return a - b; }) : []; }

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
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }

  // 아이콘(선 굵기만 다른 단순한 모양)
  var I = {
    play: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path fill="currentColor" d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.3 0-1.7L8.6 3.9C7.9 3.5 7 4 7 4.8z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="6" y="4" width="4.2" height="16" rx="1.2" fill="currentColor"/><rect x="13.8" y="4" width="4.2" height="16" rx="1.2" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path fill="currentColor" d="M11.5 6.2v11.6c0 .7-.8 1.1-1.4.7L2.6 13c-.6-.4-.6-1.3 0-1.7l7.5-5.6c.6-.4 1.4 0 1.4.5zm10 0v11.6c0 .7-.8 1.1-1.4.7L12.6 13c-.6-.4-.6-1.3 0-1.7l7.5-5.6c.6-.4 1.4 0 1.4.5z"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path fill="currentColor" d="M12.5 6.2v11.6c0 .7.8 1.1 1.4.7l7.5-5.5c.6-.4.6-1.3 0-1.7l-7.5-5.6c-.6-.4-1.4 0-1.4.5zm-10 0v11.6c0 .7.8 1.1 1.4.7l7.5-5.5c.6-.4.6-1.3 0-1.7L3.9 5.7c-.6-.4-1.4 0-1.4.5z"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h4v4M4 20 20 4M20 16v4h-4M15 15l5 5M4 4l5 5"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/></svg>',
    repeat1: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/><path d="M11 10h1.5v5" stroke-width="1.8"/></svg>',
    cont: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18.2 8.6a4.3 4.3 0 1 1 0 6.8L12 12l-6.2-3.4a4.3 4.3 0 1 0 0 6.8L12 12z"/></svg>',
    lyrics: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z"/><path d="M8.5 8h7M8.5 11.5h4.5" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg>'
  };

  function label(b, on) { if (!b) return; b.textContent = on ? '반주 끄기' : (b.getAttribute('data-idle') || '반주'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (audio) { try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) {} audio = null; }
    if (box) { box.remove(); box = null; }
    cur = 0; label(btn, false); btn = null;
    try { if (navigator.mediaSession) navigator.mediaSession.playbackState = 'none'; } catch (e) {}
  }

  function play(no, b, opt) {
    stop();
    opt = opt || {};
    var doc = opt.doc || document, win = doc.defaultView || window;
    no = +no; cur = no; btn = b || null; label(btn, true);
    var review = !!opt.review;
    // 재생 방식(이 기기에 기억). 예배 화면(opt.big)에서는 연속·랜덤을 처음엔 끈다 — 예배 중 다음 곡이 저절로 나오면 안 된다
    var M = { repeat: 'off', cont: false, shuffle: false };
    try { var sm = JSON.parse(lsGet(MODE_KEY) || '{}'); if (sm.repeat === 'one') M.repeat = 'one'; M.cont = !!sm.cont; M.shuffle = !!sm.shuffle; } catch (e) {}
    if ((opt.big && !opt._chain) || review) { M.cont = false; M.shuffle = false; }
    var rate = 1.25;
    var sr = parseFloat(lsGet(RATE_KEY)); if (sr >= 0.5 && sr <= 2) rate = sr;
    var kind = lsGet(KIND_KEY) || 'orch';
    var files = {}, LY = null, rows = [], segs = null, sel = null, full = false, shownRow = -2, ended = false, title = '', loadedOk = false;
    if (opt.verses && opt.verses.length) { sel = {}; opt.verses.forEach(function (v) { sel[+v] = 1; }); }

    // ── 뼈대
    box = doc.createElement('div');
    box.setAttribute('role', 'region'); box.setAttribute('aria-label', '새찬송가 ' + no + '장 반주');
    var myBox = box;
    var st = doc.createElement('style');
    st.textContent =
      '.hmr,.hmr *{box-sizing:border-box}.hmr [hidden]{display:none!important}' +
      '.hmr button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '.hmr .ib{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;transition:background .15s,opacity .15s,transform .1s}' +
      '.hmr .ib:hover{background:rgba(255,255,255,.1)}.hmr .ib:active{transform:scale(.92)}' +
      '.hmr .ib.on{color:#fa2d48}.hmr .ib.dim{opacity:.35}' +
      '.hmr .pill{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border-radius:13px;background:rgba(255,255,255,.12);font-size:12px;font-weight:600;white-space:nowrap}' +
      '.hmr .pill:hover{background:rgba(255,255,255,.2)}' +
      '.hmr .seg{display:inline-flex;padding:2px;border-radius:9px;background:rgba(255,255,255,.12)}' +
      '.hmr .seg button{height:22px;padding:0 10px;border-radius:7px;font-size:12px;font-weight:600;color:rgba(255,255,255,.75)}' +
      '.hmr .seg button.on{background:rgba(255,255,255,.92);color:#111}' +
      '.hmr .bar{position:relative;height:16px;cursor:pointer;touch-action:none}' +
      '.hmr .bar i{position:absolute;left:0;right:0;top:6px;height:4px;border-radius:2px;background:rgba(255,255,255,.22);overflow:hidden}' +
      '.hmr .bar b{position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(255,255,255,.9);border-radius:2px}' +
      '.hmr .bar:hover i{top:5px;height:6px;border-radius:3px}' +
      '.hmr .pop{position:absolute;z-index:3;min-width:180px;padding:6px;border-radius:12px;background:rgba(44,44,46,.98);box-shadow:0 10px 30px rgba(0,0,0,.45)}' +
      '.hmr .pop button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:14px;padding:8px 10px;border-radius:8px;font-size:13.5px;text-align:left}' +
      '.hmr .pop button:hover{background:rgba(255,255,255,.1)}.hmr .pop .ck{color:#fa2d48;font-weight:700;min-width:1em;text-align:right}' +
      '.hmr .pop .hd{padding:4px 10px 6px;font-size:11px;color:rgba(255,255,255,.5);font-weight:600}' +
      '.hmr .ln{transition:opacity .35s,transform .35s;transform-origin:left center;word-break:keep-all}' +
      '.hmr .lyl::-webkit-scrollbar{display:none}';
    box.appendChild(st);
    box.className = 'hmr';

    var head = doc.createElement('div'), tile = doc.createElement('div'), tt = doc.createElement('div');
    var tMain = doc.createElement('div'), tSub = doc.createElement('div'), hBtns = doc.createElement('div');
    tile.textContent = no;
    tMain.textContent = no + '장';
    tSub.textContent = review ? '검토용 반주' : '새찬송가 반주';
    tt.appendChild(tMain); tt.appendChild(tSub);
    function ib(svg, title, size) { var x = doc.createElement('button'); x.type = 'button'; x.className = 'ib'; x.title = title; x.setAttribute('aria-label', title); x.innerHTML = svg; x.style.width = x.style.height = (size || 30) + 'px'; x.style.padding = Math.round((size || 30) * 0.2) + 'px'; return x; }
    var lyBtn = ib(I.lyrics, '가사 크게'), minBtn = ib(I.down, '작게'), xBtn = ib(I.close, '닫기');
    lyBtn.hidden = true; minBtn.hidden = true;
    hBtns.appendChild(lyBtn); hBtns.appendChild(minBtn); hBtns.appendChild(xBtn);
    head.appendChild(tile); head.appendChild(tt); head.appendChild(hBtns);

    var lyMini = doc.createElement('div'), lyNow = doc.createElement('div'), lyNext = doc.createElement('div');
    lyMini.appendChild(lyNow); lyMini.appendChild(lyNext); lyMini.hidden = true;
    var lyList = doc.createElement('div'); lyList.className = 'lyl'; lyList.hidden = true;
    var msg = doc.createElement('div'); msg.textContent = '반주를 불러오는 중…';

    var prog = doc.createElement('div'), barEl = doc.createElement('div'), times = doc.createElement('div');
    barEl.className = 'bar'; barEl.innerHTML = '<i><b></b></i>';
    var fill = barEl.querySelector('b'), tL = doc.createElement('span'), tR = doc.createElement('span');
    times.appendChild(tL); times.appendChild(tR);
    prog.appendChild(barEl); prog.appendChild(times);

    var ctl = doc.createElement('div');
    var shBtn = ib(I.shuffle, '랜덤 재생(연속 재생 때)'), pvBtn = ib(I.prev, '처음으로 · 이전 장'), plBtn = ib(I.play, '재생'),
      nxBtn = ib(I.next, '다음 장'), rpBtn = ib(I.repeat, '한 곡 반복'), ctBtn = ib(I.cont, '전곡 연속 재생');
    [ctBtn, shBtn, pvBtn, plBtn, nxBtn, rpBtn].forEach(function (x) { ctl.appendChild(x); });

    var opts = doc.createElement('div');
    var seg = doc.createElement('div'); seg.className = 'seg';
    var kb = {};
    [['orch', '오케스트라'], ['piano', '피아노']].forEach(function (k) {
      var x = doc.createElement('button'); x.type = 'button'; x.textContent = k[1]; x.hidden = true;
      x.onclick = function () { choose(k[0], true); };
      kb[k[0]] = x; seg.appendChild(x);
    });
    var vBtn = doc.createElement('button'); vBtn.type = 'button'; vBtn.className = 'pill'; vBtn.hidden = true;
    var rBtn = doc.createElement('button'); rBtn.type = 'button'; rBtn.className = 'pill';
    opts.appendChild(seg); opts.appendChild(vBtn); opts.appendChild(rBtn);
    var cr = doc.createElement('div'); cr.textContent = CREDIT;

    box.appendChild(head); box.appendChild(lyMini); box.appendChild(lyList); box.appendChild(msg);
    box.appendChild(prog); box.appendChild(ctl); box.appendChild(opts); box.appendChild(cr);
    doc.body.appendChild(box);

    // ── 모양: 작은 카드 ↔ 가사 전체 화면
    function layout() {
      var B = 'position:fixed;z-index:2147483000;color:#fff;font:14px/1.4 ' + FONT + ';-webkit-font-smoothing:antialiased;';
      if (!full) {
        box.style.cssText = B + 'right:12px;bottom:' + (opt.bottom || 12) + 'px;width:360px;max-width:calc(100vw - 24px);padding:12px 14px 9px;border-radius:16px;' +
          'background:rgba(28,28,30,.93);-webkit-backdrop-filter:saturate(180%) blur(28px);backdrop-filter:saturate(180%) blur(28px);' +
          'box-shadow:0 18px 50px rgba(0,0,0,.38),0 0 0 .5px rgba(255,255,255,.08) inset';
        head.style.cssText = 'display:flex;align-items:center;gap:11px';
        tile.style.cssText = 'flex:none;width:46px;height:46px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:#3a2a2c;color:#fff;font-weight:700;font-size:' + (no > 99 ? 16 : 19) + 'px;letter-spacing:-.02em;box-shadow:0 2px 8px rgba(0,0,0,.3)';
        tt.style.cssText = 'flex:1;min-width:0';
        tMain.style.cssText = 'font-size:15px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        tSub.style.cssText = 'font-size:12.5px;color:rgba(255,255,255,.55);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        hBtns.style.cssText = 'display:flex;gap:2px;flex:none';
        lyMini.style.cssText = 'margin:10px 2px 2px;min-height:48px';
        lyNow.style.cssText = 'font-size:16px;font-weight:700;line-height:1.35;min-height:1.35em;word-break:keep-all';
        lyNext.style.cssText = 'font-size:13px;line-height:1.4;color:rgba(255,255,255,.4);min-height:1.4em;margin-top:2px;word-break:keep-all';
        lyList.hidden = true; lyMini.hidden = !rows.length;
        msg.style.cssText = 'padding:10px 2px 2px;font-size:13px;color:rgba(255,255,255,.7)';
        prog.style.cssText = 'margin-top:8px';
        times.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:rgba(255,255,255,.5);font-variant-numeric:tabular-nums;margin-top:-1px';
        ctl.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:2px 4px 0';
        size(ctBtn, 30); size(shBtn, 30); size(pvBtn, 38); size(plBtn, 46); size(nxBtn, 38); size(rpBtn, 30);
        opts.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:6px;flex-wrap:wrap;margin-top:8px';
        cr.style.cssText = 'margin-top:8px;font-size:9.5px;line-height:1.35;color:rgba(255,255,255,.32);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        lyBtn.hidden = !rows.length; minBtn.hidden = true;
      } else {
        box.style.cssText = B + 'inset:0;display:flex;flex-direction:column;padding:max(18px,env(safe-area-inset-top)) clamp(18px,4vw,56px) max(14px,env(safe-area-inset-bottom));' +
          'background:rgba(22,20,21,.97);-webkit-backdrop-filter:blur(40px);backdrop-filter:blur(40px)';
        head.style.cssText = 'display:flex;align-items:center;gap:14px;flex:none;max-width:1100px;width:100%;margin:0 auto';
        tile.style.cssText = 'flex:none;width:56px;height:56px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#3a2a2c;color:#fff;font-weight:700;font-size:22px;box-shadow:0 4px 14px rgba(0,0,0,.35)';
        tt.style.cssText = 'flex:1;min-width:0';
        tMain.style.cssText = 'font-size:18px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        tSub.style.cssText = 'font-size:14px;color:rgba(255,255,255,.55)';
        hBtns.style.cssText = 'display:flex;gap:6px;flex:none';
        lyMini.hidden = true;
        lyList.hidden = false;
        lyList.style.cssText = 'flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;max-width:1100px;width:100%;margin:0 auto;padding:22vh 0 40vh;' +
          '-webkit-mask-image:linear-gradient(transparent,#000 12%,#000 80%,transparent);mask-image:linear-gradient(transparent,#000 12%,#000 80%,transparent)';
        msg.style.cssText = 'padding:20px 0;font-size:16px;color:rgba(255,255,255,.7);text-align:center';
        prog.style.cssText = 'flex:none;max-width:760px;width:100%;margin:8px auto 0';
        times.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;color:rgba(255,255,255,.5);font-variant-numeric:tabular-nums';
        ctl.style.cssText = 'flex:none;display:flex;align-items:center;justify-content:center;gap:clamp(10px,3vw,30px);margin:4px auto 0';
        size(ctBtn, 36); size(shBtn, 36); size(pvBtn, 48); size(plBtn, 62); size(nxBtn, 48); size(rpBtn, 36);
        opts.style.cssText = 'flex:none;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:10px auto 2px';
        cr.style.cssText = 'flex:none;text-align:center;margin-top:8px;font-size:10px;color:rgba(255,255,255,.3)';
        lyBtn.hidden = true; minBtn.hidden = false;
        buildList();
      }
      shownRow = -2; draw();
    }
    function size(x, s) { x.style.width = x.style.height = s + 'px'; x.style.padding = Math.round(s * (x === plBtn ? 0.22 : 0.2)) + 'px'; }
    lyBtn.onclick = function () { full = true; layout(); };
    minBtn.onclick = function () { full = false; layout(); };
    xBtn.onclick = function () { stop(); };

    // ── 재생 방식 단추
    function paintModes() {
      rpBtn.innerHTML = M.repeat === 'one' ? I.repeat1 : I.repeat;
      rpBtn.className = 'ib' + (M.repeat === 'one' ? ' on' : '');
      rpBtn.title = M.repeat === 'one' ? '한 곡 반복 끄기' : '한 곡 반복';
      ctBtn.className = 'ib' + (M.cont ? ' on' : '');
      ctBtn.title = M.cont ? '전곡 연속 재생 끄기' : '전곡 연속 재생(끝나면 다음 장)';
      shBtn.className = 'ib' + (M.shuffle ? ' on' : '');
      shBtn.title = M.shuffle ? '랜덤 재생 끄기' : '랜덤 재생';
      nxBtn.className = 'ib' + (review ? ' dim' : '');
      rBtn.textContent = (Math.round(rate * 100) / 100) + '×';
      rBtn.title = '빠르기';
      if (segs) {
        var vs = verseNos(), on = vs.filter(function (v) { return !sel || sel[v]; });
        vBtn.textContent = !sel || on.length === vs.length ? '모든 절' : on.length ? on.join('·') + '절' : '절 없음';
        vBtn.hidden = false;
      }
    }
    function saveModes() { if (!review) lsSet(MODE_KEY, JSON.stringify({ repeat: M.repeat, cont: M.cont, shuffle: M.shuffle })); }
    rpBtn.onclick = function () { M.repeat = M.repeat === 'one' ? 'off' : 'one'; saveModes(); paintModes(); };
    ctBtn.onclick = function () { if (review) return; M.cont = !M.cont; if (!M.cont) M.shuffle = false; saveModes(); paintModes(); };
    shBtn.onclick = function () { if (review) return; M.shuffle = !M.shuffle; if (M.shuffle) M.cont = true; saveModes(); paintModes(); };

    // 작은 메뉴(빠르기·절)
    var popEl = null;
    function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
    function openPop(anchor, getItems, hd) {
      closePop();
      var items = getItems();
      popEl = doc.createElement('div'); popEl.className = 'pop';
      popEl.innerHTML = (hd ? '<div class="hd">' + esc(hd) + '</div>' : '') + items.map(function (it, i) { return '<button type="button" data-i="' + i + '"><span>' + esc(it.t) + '</span><span class="ck">' + (it.on ? '✓' : '') + '</span></button>'; }).join('');
      box.appendChild(popEl);
      var br = box.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
      var left = Math.min(Math.max(8, ar.left - br.left - 40), br.width - 196);
      popEl.style.left = Math.max(8, left) + 'px';
      popEl.style.bottom = (br.bottom - ar.top + 6) + 'px';
      popEl.onclick = function (e) { var b2 = e.target.closest('[data-i]'); if (!b2) return; var it = items[+b2.getAttribute('data-i')]; it.f(); if (!it.keep) closePop(); else openPop(anchor, getItems, hd); };
    }
    box.addEventListener('click', function (e) { if (popEl && !(e.target.closest && e.target.closest('.pop')) && e.target !== rBtn && e.target !== vBtn) closePop(); });
    rBtn.onclick = function () {
      if (popEl) { closePop(); return; }
      openPop(rBtn, function () {
        return [0.9, 1, 1.1, 1.25, 1.4, 1.5].map(function (v) {
          return { t: v + '배' + (v === 1.25 ? ' (기본)' : ''), on: Math.abs(v - rate) < 0.001, f: function () { rate = v; lsSet(RATE_KEY, v); applyRate(); paintModes(); } };
        });
      }, '빠르기 — 음높이는 그대로');
    };
    function verseNos() { return segs ? segs.filter(function (s) { return s.v; }).map(function (s) { return s.v; }) : []; }
    function verseItems() {
      var vs = verseNos(), items = [];
      items.push({ t: '모든 절', on: !sel, f: function () { sel = null; afterSel(); }, keep: true });
      items.push({ t: '1절만', on: !!sel && Object.keys(sel).length === 1 && sel[1], f: function () { sel = { 1: 1 }; afterSel(); }, keep: true });
      if (vs.length > 2) items.push({ t: '1절과 마지막 절', on: !!sel && Object.keys(sel).length === 2 && sel[1] && sel[vs[vs.length - 1]], f: function () { sel = {}; sel[1] = 1; sel[vs[vs.length - 1]] = 1; afterSel(); }, keep: true });
      vs.forEach(function (v) {
        items.push({ t: v + '절', on: !sel || !!sel[v], keep: true, f: function () {
          if (!sel) { sel = {}; vs.forEach(function (x) { sel[x] = 1; }); }
          if (sel[v]) delete sel[v]; else sel[v] = 1;
          if (Object.keys(sel).length === vs.length) sel = null;
          else if (!Object.keys(sel).length) sel = { 1: 1 };
          afterSel();
        } });
      });
      return items;
    }
    function afterSel() { paintModes(); buildList(); shownRow = -2; guard(); draw(); }
    vBtn.onclick = function () { if (popEl) { closePop(); return; } openPop(vBtn, verseItems, '부를 절 — 전주와 아멘은 그대로'); };

    // ── 절 구간(전주·1절…·아멘). 시간은 가사 시간표 기준(소리 시간 = 가사 시간 − shift)
    function shift() { return ((LY && LY.shift) || {})[kind] || 0; }
    function buildSegs() {
      segs = null;
      if (!LY) return;
      var S = LY.sections && (LY.sections[kind] || LY.sections.orch);
      var out = [];
      if (S && S.v1) {
        out.push({ k: 'intro', a: S.intro ? S.intro[0] : 0, b: S.v1[0] });
        for (var i = 1; S['v' + i]; i++) out.push({ k: 'v' + i, v: i, a: S['v' + i][0], b: S['v' + i][1] });
        if (S.amen) out.push({ k: 'amen', a: S.amen[0], b: S.amen[1] + 30 });
      } else if (LY.verses && LY.verses.length) {        // 예전 시간표: 첫 음절 조금 앞을 절의 시작으로 본다
        var st0 = LY.verses.map(function (v) { var l = (v.lines || [])[0]; return l && l[0] ? l[0][0] - 0.35 : null; });
        if (st0.some(function (x) { return x == null; })) return;
        out.push({ k: 'intro', a: 0, b: st0[0] });
        LY.verses.forEach(function (v, i) {
          var end = i + 1 < st0.length ? st0[i + 1] : (LY.amen && LY.amen.length ? LY.amen[0][0] - 0.35 : 1e9);
          out.push({ k: 'v' + v.n, v: v.n, a: st0[i], b: end });
        });
        if (LY.amen && LY.amen.length) out.push({ k: 'amen', a: LY.amen[0][0] - 0.35, b: 1e9 });
      }
      if (out.length > 2) segs = out;
    }
    function allowed(s) { return !s.v || !sel || !!sel[s.v]; }
    // 고르지 않은 절에 들어서면 다음 고른 구간으로 건너뛴다(살짝 줄였다가 다시 키워 끊김을 덜 느끼게)
    var jumping = false;
    function guard() {
      if (!audio || !segs || !sel || jumping) return;
      var lt = audio.currentTime + shift();
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        if (lt >= s.a && lt < s.b) {
          if (allowed(s)) return;
          for (var j = i + 1; j < segs.length; j++) if (allowed(segs[j])) { jumpTo(segs[j].a - shift()); return; }
          finish(); return;
        }
      }
    }
    function jumpTo(t) {
      jumping = true;
      var a = audio, v0 = 1, k = 0;
      var iv = win.setInterval(function () {
        if (a !== audio) { win.clearInterval(iv); jumping = false; return; }
        k++;
        if (k <= 6) { try { a.volume = Math.max(0, v0 * (1 - k / 6)); } catch (e) {} }
        if (k === 6) { a.currentTime = Math.max(0, t); }
        if (k > 6) { try { a.volume = Math.min(1, (k - 6) / 6); } catch (e) {} }
        if (k >= 12) { win.clearInterval(iv); jumping = false; try { a.volume = 1; } catch (e) {} }
      }, 18);
    }

    // ── 가사
    function setupLyrics(d) {
      LY = d; rows = [];
      if (d.title) { title = d.title; tMain.textContent = no + '장 ' + d.title; mediaMeta(); }
      (d.verses || []).forEach(function (v) { (v.lines || []).forEach(function (ln, li) { if (ln.length) rows.push({ lab: v.n + '절', v: v.n, first: li === 0, syl: ln, t0: ln[0][0], t1: ln[ln.length - 1][1] }); }); });
      if (d.amen && d.amen.length) rows.push({ lab: '아멘', v: 0, first: true, syl: d.amen, t0: d.amen[0][0], t1: d.amen[d.amen.length - 1][1] });
      buildSegs(); paintModes();
      if (!rows.length) return;
      if (opt.big) full = true;                        // 예배 화면(오늘의 예배·설교 발표)은 가사 전체 화면으로 시작
      layout(); tick();
    }
    function rowOn(r) { return !sel || !r.v || !!sel[r.v]; }
    function sylHtml(row, t) {
      return row.syl.map(function (w) {
        var tx = esc(w[2]) + (w[3] ? ' ' : '');
        if (t >= w[1]) return '<span style="color:#fff">' + tx + '</span>';
        if (t >= w[0]) {                                // 지금 부르는 음절: 앞에서부터 차오른다
          var pc = Math.max(0, Math.min(100, Math.round((t - w[0]) / (w[1] - w[0]) * 100)));
          return '<span style="background:linear-gradient(90deg,#fff ' + pc + '%,rgba(255,255,255,.38) ' + pc + '%);-webkit-background-clip:text;background-clip:text;color:transparent">' + tx + '</span>';
        }
        return '<span style="color:rgba(255,255,255,.38)">' + tx + '</span>';
      }).join('');
    }
    function plain(row) { return row ? esc(row.syl.map(function (w) { return w[2] + (w[3] ? ' ' : ''); }).join('')) : ''; }
    var lineEls = [];
    function buildList() {
      if (!full) return;
      lineEls = [];
      lyList.innerHTML = '';
      rows.forEach(function (r, i) {
        if (!rowOn(r)) { lineEls[i] = null; return; }
        if (r.first) {
          var h = doc.createElement('div');
          h.textContent = r.lab;
          h.style.cssText = 'font-size:clamp(13px,1.5vw,17px);font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.06em;margin:' + (i ? '4.2vh' : '0') + ' 0 1.2vh';
          lyList.appendChild(h);
        }
        var d = doc.createElement('div');
        d.className = 'ln';
        d.style.cssText = 'font-size:clamp(28px,4.6vw,60px);font-weight:800;line-height:1.22;letter-spacing:-.01em;margin:0 0 2.1vh;opacity:.3;cursor:pointer';
        d.innerHTML = plain(r);
        d.onclick = function () { if (audio) { audio.currentTime = Math.max(0, r.t0 - shift() - 0.4); if (audio.paused) doPlay(); } };   // 줄을 누르면 거기부터
        lyList.appendChild(d); lineEls[i] = d;
      });
    }
    function tick() {
      raf = 0;
      if (!draw()) return;
      if (audio && !audio.paused) raf = win.requestAnimationFrame(tick);
    }
    function draw() {
      if (myBox !== box || !audio) return false;
      var d = audio.duration || 0, ct = audio.currentTime || 0;
      if (!dragging) fill.style.width = (d ? ct / d * 100 : 0) + '%';
      tL.textContent = fmt(ct); tR.textContent = '-' + fmt(Math.max(0, d - ct));
      guard();
      if (!rows.length) return true;
      var t = ct + shift() + 0.05, i = -1;
      for (var k = 0; k < rows.length; k++) { if (rows[k].t0 <= t + 0.25) i = k; else break; }   // 줄은 0.25초 먼저 보인다
      if (full) {
        if (shownRow !== i) {
          lineEls.forEach(function (el, n) { if (!el) return; el.style.opacity = n === i ? '1' : '.3'; el.style.transform = n === i ? 'scale(1)' : 'scale(.97)'; if (n !== i) el.innerHTML = plain(rows[n]); });
          var tgt = i >= 0 ? lineEls[i] : null;
          if (tgt) {
            var top = tgt.offsetTop - lyList.clientHeight * 0.3;
            try { lyList.scrollTo({ top: top, behavior: 'smooth' }); } catch (e) { lyList.scrollTop = top; }
          } else if (i < 0) lyList.scrollTop = 0;
          shownRow = i;
        }
        if (i >= 0 && lineEls[i]) lineEls[i].innerHTML = sylHtml(rows[i], t);
      } else {
        if (i < 0) {
          if (shownRow !== -1) { lyNow.innerHTML = '<span style="color:rgba(255,255,255,.5);font-weight:600">전주</span>'; lyNext.innerHTML = plain(rows[0]); shownRow = -1; }
        } else {
          lyNow.innerHTML = sylHtml(rows[i], t);
          if (shownRow !== i) {
            var nx = i + 1; while (nx < rows.length && !rowOn(rows[nx])) nx++;
            lyNext.innerHTML = plain(rows[nx]); shownRow = i;
          }
        }
      }
      return true;
    }

    // ── 진행 막대(끌어서 옮기기)
    var dragging = false;
    function seekAt(e) { var r = barEl.getBoundingClientRect(); var x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); fill.style.width = x * 100 + '%'; return x; }
    barEl.addEventListener('pointerdown', function (e) { if (!audio || !audio.duration) return; dragging = true; try { barEl.setPointerCapture(e.pointerId); } catch (x) {} seekAt(e); });
    barEl.addEventListener('pointermove', function (e) { if (dragging) { var x = seekAt(e); tL.textContent = fmt(x * audio.duration); } });
    barEl.addEventListener('pointerup', function (e) { if (!dragging) return; dragging = false; var x = seekAt(e); audio.currentTime = x * audio.duration; ended = false; shownRow = -2; draw(); });
    barEl.addEventListener('pointercancel', function () { dragging = false; });

    // ── 재생
    function applyRate() { if (audio) { audio.defaultPlaybackRate = rate; audio.playbackRate = rate; } }
    function doPlay() {
      if (!audio) return;
      if (ended) { ended = false; audio.currentTime = 0; }
      var p = audio.play(); if (p && p.catch) p.catch(function () { paintPlay(); });
    }
    function paintPlay() {
      var on = audio && !audio.paused;
      plBtn.innerHTML = on ? I.pause : I.play; plBtn.title = on ? '멈춤' : '재생'; plBtn.setAttribute('aria-label', plBtn.title);
      try { if (navigator.mediaSession) navigator.mediaSession.playbackState = on ? 'playing' : 'paused'; } catch (e) {}
    }
    plBtn.onclick = function () { if (!audio) return; if (audio.paused) doPlay(); else audio.pause(); };
    pvBtn.onclick = function () {
      if (!audio) return;
      if (audio.currentTime > 3 || review || !M.cont) { audio.currentTime = 0; ended = false; shownRow = -2; if (audio.paused) doPlay(); return; }
      go(-1);
    };
    nxBtn.onclick = function () { if (review) return; go(1); };
    function nextNo(dir) {
      var L = haveList().filter(function (n) { return n !== no; });
      if (!L.length) return 0;
      if (M.shuffle && dir > 0) return L[Math.floor(Math.random() * L.length)];
      var all = haveList(), i = all.indexOf(no);
      if (i < 0) { for (i = 0; i < all.length && all[i] < no; i++); i = dir > 0 ? i - 1 : i; }
      return all[(i + dir + all.length) % all.length];
    }
    function go(dir) {
      var n = nextNo(dir);
      if (!n) return;
      var o = {}; for (var k in opt) o[k] = opt[k];
      o.verses = sel ? Object.keys(sel).map(Number) : null;   // 고른 절은 다음 장에도(그 장에 없는 절은 무시)
      o._chain = true; o.big = full;                  // 전체 화면이었으면 다음 장도 전체 화면
      play(n, null, o);
    }
    function finish() {
      if (!audio) return;
      if (M.repeat === 'one') { audio.currentTime = 0; doPlay(); return; }
      if (M.cont && !review) { go(1); return; }
      audio.pause(); ended = true; paintPlay();
      fill.style.width = '100%';
    }

    function mediaMeta() {
      try {
        if (!navigator.mediaSession || !win.MediaMetadata) return;
        navigator.mediaSession.metadata = new win.MediaMetadata({ title: no + '장 ' + (title || ''), artist: '새찬송가 반주', album: kind === 'piano' ? '피아노' : '오르간·오케스트라' });
        navigator.mediaSession.setActionHandler('play', function () { doPlay(); });
        navigator.mediaSession.setActionHandler('pause', function () { if (audio) audio.pause(); });
        navigator.mediaSession.setActionHandler('previoustrack', function () { pvBtn.onclick(); });
        navigator.mediaSession.setActionHandler('nexttrack', review ? null : function () { go(1); });
      } catch (e) {}
    }

    function choose(k, user) {
      if (!files[k]) return;
      kind = k;
      if (user) lsSet(KIND_KEY, k);
      Object.keys(kb).forEach(function (n) { kb[n].className = n === k ? 'on' : ''; });
      tSub.textContent = (review ? '검토용 · ' : '새찬송가 · ') + (k === 'piano' ? '피아노' : '오르간·오케스트라');
      var at = audio ? audio.currentTime : 0, was = audio ? !audio.paused : true;
      if (!audio) {
        audio = doc.createElement('audio'); audio.preload = 'auto';
        audio.setAttribute('controlslist', 'nodownload');
        audio.addEventListener('loadedmetadata', function () { applyRate(); draw(); });
        audio.addEventListener('play', function () { paintPlay(); if (!raf) raf = win.requestAnimationFrame(tick); });
        audio.addEventListener('pause', paintPlay);
        audio.addEventListener('seeked', function () { shownRow = -2; draw(); });
        audio.addEventListener('timeupdate', function () { draw(); });   // 화면이 뒤에 있어 그리기 틀이 멈춰도 1초에 4번은 맞춘다
        audio.addEventListener('ended', finish);
        audio.onerror = function () { if (myBox === box && !loadedOk) { msg.hidden = false; msg.textContent = '반주를 틀지 못했습니다. 새로고침 후 다시 눌러 주세요.'; } };
        audio.addEventListener('canplay', function () { loadedOk = true; });
        box.appendChild(audio);
      }
      audio.src = files[k]; applyRate();
      if (at) { audio.addEventListener('loadedmetadata', function f() { audio.removeEventListener('loadedmetadata', f); audio.currentTime = at; }); }
      if (was) doPlay();
      buildSegs(); paintModes(); mediaMeta();
    }

    paintModes(); paintPlay(); layout();
    if (opt.big) { full = true; layout(); }
    var tk = token();
    if (!tk) { msg.textContent = '찬송가 반주는 로그인한 성도만 들을 수 있습니다. 로그인한 뒤 다시 눌러 주세요.'; return true; }
    fetch(STORE + '/hymn-mr-url', { method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' }, body: JSON.stringify(review ? { no: no, review: true } : { no: no }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._s = r.status; return j; }); })
      .then(function (j) {
        if (myBox !== box) return;                       // 그사이 닫거나 다른 장을 눌렀다
        if (j._s === 401) { msg.textContent = '찬송가 반주는 로그인한 성도만 들을 수 있습니다. 다시 로그인해 주세요.'; return; }
        files = j.files || {};
        if (!files.orch && !files.piano) { msg.textContent = j.error || '이 장의 반주는 아직 준비 중입니다.'; return; }
        msg.hidden = true;
        Object.keys(kb).forEach(function (k) { kb[k].hidden = !files[k]; });
        if (!(files.orch && files.piano)) seg.hidden = true;
        choose(files[kind] ? kind : (files.orch ? 'orch' : 'piano'), false);
        if (!files.lyrics && full) { full = false; layout(); }   // 가사가 없는 장은 작은 창으로
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
