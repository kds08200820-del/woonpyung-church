/* 찬송가 보기 — 새찬송가 645장. 처음 열면 전체 목록(1~50 · 51~100 …)이 나오고, 위 검색창에 장 번호·제목을 치면 목록이 줄어든다.
   한 곡을 누르면 악보 그림(data/hymn/NNN.webp)을 보여 준다.
   · 본문 화면 [🎵 찬송가] 단추, 모바일 아래 막대, 주소의 #hymn=570 으로 연다
   · 다른 화면(오늘의 예배 등)에서는 HYMN.open(장번호) 로 부른다 */
/* 좌우로 미는 손짓 — 가로 스크롤이 있는 상자(확대한 악보)는 끝에 닿았을 때만 넘긴다. fn(-1)=다음, fn(1)=이전 */
APP.swipe = function(el, fn){
  var sx = 0, sy = 0, sl = 0, on = false;
  el.addEventListener('touchstart', function(e){ if(e.touches.length !== 1 || e.touches[0].clientX < 28){ on = false; return; } on = true;   /* 왼쪽 가장자리에서 민 것은 '뒤로'(성경으로) — 장 넘기기로 세지 않는다 */ sx = e.touches[0].clientX; sy = e.touches[0].clientY; sl = el.scrollLeft; }, { passive:true });
  el.addEventListener('touchend', function(e){
    if(!on) return; on = false;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if(Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    var maxL = el.scrollWidth - el.clientWidth;
    if(maxL > 2){ if(sl !== el.scrollLeft) return; if(dx < 0 && el.scrollLeft < maxL - 2) return; if(dx > 0 && el.scrollLeft > 2) return; }
    fn(dx < 0 ? -1 : 1);
  }, { passive:true });
};
/* 그 자리에서 고르는 목록 팝업 — pop: 덮개, list: 목록 칸. open(html, curNo) 로 띄우고 행을 누르면 onPick(no) */
APP.listPop = function(pop, list, onPick){
  pop.addEventListener('click', function(e){
    var b = e.target.closest('.hy-row');
    if(b){ pop.hidden = true; onPick(+b.dataset.no); return; }
    if(e.target === pop) pop.hidden = true;
  });
  return {
    open:function(html, curNo){
      if(!list.childNodes.length) list.innerHTML = html;
      [].forEach.call(list.querySelectorAll('.hy-row'), function(r){ r.classList.toggle('on', +r.dataset.no === curNo); });
      pop.hidden = false;
      var on = list.querySelector('.hy-row.on'); if(on) list.scrollTop = on.offsetTop - list.clientHeight / 2 + 20;
    },
    close:function(){ pop.hidden = true; },
    isOpen:function(){ return !pop.hidden; }
  };
};
var HYMN = (function(){
  var $ = APP.$, esc = APP.esc, toast = APP.toast;
  /* 두 권: 새찬송가(장) · 기쁨으로 찬양(번, CCM — 조·주제로 나눠 찾기) (2026-09-27) */
  var BOOKS = {
    hymn: { name:'새찬송가', list:window.HYMNS || [], dir:'data/hymn/', unit:'장', hash:'hymn' },
    joy:  { name:'기쁨으로 찬양', list:window.JOYS || [], dir:'data/joy/', unit:'번', hash:'joy' }
  };
  var BK = 'hymn', B = BOOKS.hymn, LIST = B.list, MAX = 0, byNo = {};
  var cur = 0, zoom = 1, locked = false, indexHtml = '', POPREF = null;
  var F = { key:'', tag:'', sort:'no' };                    /* 기쁨으로 찬양 거르기 */
  function setBook(k){
    if(!BOOKS[k] || !BOOKS[k].list.length) k = 'hymn';
    BK = k; B = BOOKS[k]; LIST = B.list; MAX = LIST.length ? LIST[LIST.length - 1].no : 0;
    byNo = {}; LIST.forEach(function(h){ byNo[h.no] = h; });
    indexHtml = ''; var pl = $('hyPopList'); if(pl) pl.innerHTML = '';
    [].forEach.call(document.querySelectorAll('#hyBooks button'), function(b){ b.classList.toggle('on', b.dataset.bk === k); b.setAttribute('aria-pressed', b.dataset.bk === k ? 'true' : 'false'); });
    F.key = ''; F.tag = ''; buildFilters();
    var fl = $('hyFilt'); if(fl) fl.hidden = !hasMeta();
    var inp = $('hyIn'); if(inp) inp.placeholder = k === 'joy' ? '번호, 제목, 조(D·Em), 주제(감사·은혜)' : '장, 제목, 조(G·F), 주제(성탄·감사)';
    try{ localStorage.setItem('modu.hymn.book', k); }catch(e){}
  }
  /* 조·주제 거르기 — 두 책 모두 (찬송가 주제는 새찬송가 목차 분류, 조는 악보에서 읽음 2026-09-27) */
  function hasMeta(){ return LIST.some(function(h){ return h.key || (h.tags && h.tags.length); }); }
  var KORD = ['C','Cm','D','Dm','Eb','E','Em','F','F#m','G','Gm','Ab','A','Am','Bb','Bm','B','Db','Fm','Bbm','C#m'];
  function buildFilters(){
    var ks = $('hyKey'), ts = $('hyTag'); if(!ks || !ts) return;
    var keys = {}, tags = {};
    LIST.forEach(function(h){ if(h.key) keys[h.key] = (keys[h.key] || 0) + 1; (h.tags || []).forEach(function(t){ tags[t] = (tags[t] || 0) + 1; }); });
    var kl = Object.keys(keys).sort(function(a, b){ var i = KORD.indexOf(a), j = KORD.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || a.localeCompare(b); });
    ks.innerHTML = '<option value="">모든 조</option>' + kl.map(function(k){ return '<option value="' + esc(k) + '">' + esc(k) + '조 (' + keys[k] + ')</option>'; }).join('');
    var order = (BK === 'joy' ? window.JOY_TAGS : window.HYMN_TAGS) || Object.keys(tags);
    ts.innerHTML = '<option value="">모든 주제</option>' + order.filter(function(t){ return tags[t]; }).map(function(t){ return '<option value="' + esc(t) + '">' + esc(t) + ' (' + tags[t] + ')</option>'; }).join('');
  }
  setBook('hymn');
  function isOpen(){ var m = $('hymnModal'); return !!(m && !m.hidden); }
  function title(no){ var h = byNo[no]; return h ? h.title : ''; }
  function src(no){ return B.dir + ('00' + no).slice(-3) + '.webp'; }
  function row(h){ return '<button type="button" class="hy-row" data-no="' + h.no + '"><b>' + h.no + '</b><span>' + esc(h.title) + '</span>' + (h.key ? '<em class="hy-key">' + esc(h.key) + '</em>' : '') + '</button>'; }
  /* ── 목록 ── */
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', CHO_MERGE = { 'ㄲ':'ㄱ', 'ㄸ':'ㄷ', 'ㅃ':'ㅂ', 'ㅆ':'ㅅ', 'ㅉ':'ㅈ' };
  function cho(s){ var c = String(s || '').replace(/^[^가-힣A-Za-z0-9]+/, '').charCodeAt(0); if(c >= 0xAC00 && c <= 0xD7A3){ var j = CHO[Math.floor((c - 0xAC00) / 588)]; return CHO_MERGE[j] || j; } return '#'; }
  function sorted(list){ return F.sort === 'title' ? list.slice().sort(function(a, b){ return a.title.localeCompare(b.title, 'ko'); }) : list; }
  function bandHtml(list){
    var h = '', band = null;
    list.forEach(function(x){
      var b = F.sort === 'title' ? cho(x.title) : Math.floor((x.no - 1) / 50);
      if(b !== band){ band = b; var lb = F.sort === 'title' ? b : (b * 50 + 1) + '~' + Math.min(b * 50 + 50, MAX); h += '<div class="hy-band" data-r="' + esc(F.sort === 'title' ? b : String(b * 50 + 1)) + '">' + esc(lb) + '</div>'; }
      h += row(x);
    });
    return h;
  }
  function buildIndex(){ if(indexHtml) return indexHtml; return (indexHtml = bandHtml(sorted(LIST))); }
  function norm(s){ return String(s || '').replace(/\s+/g, '').toLowerCase(); }
  function filtered(){
    if(!F.key && !F.tag) return null;
    return LIST.filter(function(h){ return (!F.key || h.key === F.key) && (!F.tag || (h.tags || []).indexOf(F.tag) >= 0); });
  }
  function search(q){
    q = q.trim(); var base = filtered();
    if(!q) return base;
    var pool = base || LIST;
    var n = q.match(/^(\d{1,3})\s*(장|번)?$/);
    if(n){ var k = n[1], out = pool.filter(function(h){ return String(h.no).indexOf(k) === 0; }); if(byNo[+k] && pool.indexOf(byNo[+k]) >= 0) out = [byNo[+k]].concat(out.filter(function(h){ return h.no !== +k; })); return out; }
    var kk = norm(q), kq = q.replace(/\s*조$/, '').trim().toLowerCase();
    return pool.filter(function(h){
      return norm(h.title).indexOf(kk) >= 0 || (h.alt || []).some(function(a){ return norm(a).indexOf(kk) >= 0; }) ||
        (h.key && h.key.toLowerCase() === kq) || (h.tags || []).some(function(t){ return norm(t).indexOf(kk) >= 0; });
    });
  }
  /* ── 빨리 내리기 띠: 지금 목록의 묶음(1·51·… 또는 ㄱ·ㄴ·…)을 그대로 ── */
  var BANDS = [], railBound = false;
  function buildRail(){
    var rail = $('hyRail'); if(!rail) return;
    BANDS = [].map.call($('hyIndex').querySelectorAll('.hy-band[data-r]'), function(b){ return b.dataset.r; });
    if(BANDS.length > 14 && F.sort !== 'title') BANDS = BANDS.filter(function(r, i){ return i % 2 === 0; });
    rail.innerHTML = BANDS.map(function(n){ return '<i>' + esc(n) + '</i>'; }).join('');
    if(railBound) return; railBound = true;
    var bub = null;
    function at(y){
      if(!BANDS.length) return;
      var r = rail.getBoundingClientRect(), i = Math.floor((y - r.top) / r.height * BANDS.length);
      i = Math.max(0, Math.min(BANDS.length - 1, i));
      var no = BANDS[i], el = [].filter.call($('hyIndex').querySelectorAll('.hy-band[data-r]'), function(b){ return b.dataset.r === no; })[0];
      if(el){ var box = $('hyBody'); box.scrollTop = el.offsetTop - box.offsetTop; }
      if(!bub){ bub = document.createElement('span'); bub.className = 'bub'; rail.appendChild(bub); }
      bub.textContent = no; bub.style.top = Math.max(0, Math.min(r.height - 44, y - r.top - 22)) + 'px';
    }
    var on = false;
    rail.addEventListener('pointerdown', function(e){ on = true; rail.classList.add('on'); try{ rail.setPointerCapture(e.pointerId); }catch(x){} at(e.clientY); e.preventDefault(); });
    rail.addEventListener('pointermove', function(e){ if(on) at(e.clientY); });
    function end(){ if(!on) return; on = false; rail.classList.remove('on'); if(bub){ bub.remove(); bub = null; } }
    rail.addEventListener('pointerup', end); rail.addEventListener('pointercancel', end);
    /* 목록을 스크롤할 때만 나타나고, 멈추면 잠시 뒤 사라진다 */
    var tm = 0;
    $('hyBody').addEventListener('scroll', function(){
      if(rail.hidden || cur) return;
      rail.classList.add('show'); clearTimeout(tm);
      tm = setTimeout(function(){ if(!on) rail.classList.remove('show'); }, 1500);
    }, { passive:true });
  }
  function showIndex(){
    cur = 0; $('hyPop').hidden = true;
    $('hyTitle').textContent = B.name;
    $('hymnModal').classList.remove('hy-viewing');
    $('hyBody').classList.remove('hy-fitm'); $('hyImg').classList.remove('fit');   /* 악보용 스크롤 잠금을 풀어 목록이 움직이게 (2026-09-27: 뒤로 온 목록이 멈추던 문제) */
    $('hyTools').hidden = true;
    if($('hyBooks')) $('hyBooks').hidden = !BOOKS.joy.list.length; if($('hyFilt')) $('hyFilt').hidden = !hasMeta();
    $('hyImg').hidden = true; $('hyWait').hidden = true; $('hyNone').hidden = true;
    $('hyIndex').hidden = false;
    paintIndex($('hyIn').value);
    $('hyBody').scrollTop = 0;
    try{ if(/^#(hymn|joy)=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  }
  function paintIndex(q){
    var r = search(q), box = $('hyIndex');
    if(r === null){ box.innerHTML = buildIndex(); buildRail(); $('hyRail').hidden = false; return; }
    if(!(q || '').trim() && r.length > 30){ box.innerHTML = bandHtml(sorted(r)); buildRail(); $('hyRail').hidden = false; $('hyBody').scrollTop = 0; return; }
    $('hyRail').hidden = true;
    box.innerHTML = r.length ? '<div class="hy-band">찾은 곡 ' + r.length + '곡</div>' + sorted(r).map(row).join('') : '<div class="hy-empty">찾는 곡이 없습니다</div>';
    $('hyBody').scrollTop = 0;
  }
  /* ── 악보 ── */
  function show(no){
    no = +no;
    if(!(no >= 1 && no <= MAX)) return toast(B.name + '는 1' + B.unit + '부터 ' + MAX + B.unit + '까지 있습니다');
    cur = no;
    $('hyTitle').textContent = B.name;
    $('hyNo').textContent = no + B.unit;
    var hx = byNo[no] || {};
    $('hySub').textContent = title(no) + (hx.key ? ' · ' + hx.key + '조' : '') + (hx.tags && hx.tags.length ? ' · ' + hx.tags.join(' ') : '');
    $('hymnModal').classList.add('hy-viewing');
    $('hyTools').hidden = false; $('hyIn').value = ''; if($('hyBooks')) $('hyBooks').hidden = true; if($('hyFilt')) $('hyFilt').hidden = true;   /* 악보를 볼 때는 악보 자리를 넓게 */ $('hyPop').hidden = true;
    $('hyIndex').hidden = true; $('hyRail').hidden = true;
    var img = $('hyImg'), box = $('hyBody');
    img.hidden = true; $('hyWait').hidden = false; $('hyNone').hidden = true;
    setZoom(1);                                              /* 새 장은 늘 화면 폭에 맞춤 */
    img.onload = function(){ img.hidden = false; $('hyWait').hidden = true; box.scrollTop = 0; box.scrollLeft = 0; };
    img.onerror = function(){ $('hyWait').hidden = true; $('hyNone').hidden = false; };
    img.src = src(no);
    img.alt = B.name + ' ' + no + B.unit + ' ' + title(no);
    $('hyPrev').disabled = no <= 1; $('hyNext').disabled = no >= MAX;
    try{ localStorage.setItem('modu.' + B.hash + '.last', String(no)); }catch(e){}
    try{ if(/^#(hymn|joy)=/.test(location.hash) || location.hash === '') history.replaceState(null, '', location.pathname + location.search + '#' + B.hash + '=' + no); }catch(e){}
  }
  function open(no, bk){
    var m = $('hymnModal'); if(!m) return;
    var want = bk || (no ? 'hymn' : (function(){ try{ return localStorage.getItem('modu.hymn.book') || 'hymn'; }catch(e){ return 'hymn'; } })());   /* 다른 화면이 장 번호로 부르면 늘 새찬송가 */
    if(want !== BK) setBook(want);
    if(window.GYODOK_VIEW && GYODOK_VIEW.isOpen()) GYODOK_VIEW.close();
    m.hidden = false; document.body.classList.add('modal-open'); document.body.classList.add('hy-open');
    $('hyIn').value = '';
    if(no) show(no); else showIndex();
  }
  function close(){
    var m = $('hymnModal'); if(!m || m.hidden) return;
    m.hidden = true; document.body.classList.remove('modal-open'); document.body.classList.remove('hy-open');
    try{ if(/^#(hymn|joy)=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  }
  function setZoom(z){ zoom = Math.max(1, Math.min(4, z)); $('hyImg').style.width = (zoom * 100) + '%'; $('hyImg').classList.toggle('fit', zoom === 1); $('hyBody').classList.toggle('hy-fitm', zoom === 1); }
  function setLock(v){
    locked = !!v; var b = $('hyLock');
    b.setAttribute('aria-pressed', locked ? 'true' : 'false'); b.textContent = locked ? '고정됨' : '고정';
    try{ localStorage.setItem('modu.hymn.lock', locked ? '1' : ''); }catch(e){}
  }
  /* 두 손가락으로 벌리면 커지고 오므리면 작아진다 — 손가락 사이 지점이 제자리에 있도록 스크롤을 맞춘다 */
  function pinch(box){
    var d0 = 0, z0 = 1, on = false;
    function dist(t){ var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
    box.addEventListener('touchstart', function(e){ if(e.touches.length === 2 && cur && !locked){ on = true; d0 = dist(e.touches); z0 = zoom; } else on = false; }, { passive:true });
    box.addEventListener('touchmove', function(e){
      if(!on || e.touches.length !== 2) return;
      e.preventDefault();
      var r = box.getBoundingClientRect(), mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left, my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      var old = zoom, px = (box.scrollLeft + mx) / old, py = (box.scrollTop + my) / old;
      setZoom(z0 * dist(e.touches) / d0);
      box.scrollLeft = px * zoom - mx; box.scrollTop = py * zoom - my;
    }, { passive:false });
    box.addEventListener('touchend', function(e){ if(e.touches.length < 2) on = false; }, { passive:true });
  }
  function init(){
    if(!$('hymnModal')) return;
    $('hymnBtn').onclick = function(){ open(0); };
    $('hyClose').onclick = close;
    $('hyIndexBtn').onclick = function(){ $('hyIn').value = ''; showIndex(); };
    $('hyPrev').onclick = function(){ if(cur > 1) show(cur - 1); };
    $('hyNext').onclick = function(){ if(cur < MAX) show(cur + 1); };
    var input = $('hyIn');
    input.addEventListener('input', function(){ if(cur) showIndex(); else paintIndex(input.value); });
    input.addEventListener('focus', function(){ if(cur) showIndex(); });
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ var r = search(input.value) || []; if(r.length){ show(r[0].no); input.blur(); } else toast('장 번호나 제목을 적어 주세요 (예: 570 · 목자)'); e.preventDefault(); }
    });
    $('hyIndex').addEventListener('click', function(e){ var b = e.target.closest('.hy-row'); if(b){ show(+b.dataset.no); input.blur(); } });
    var pop = APP.listPop($('hyPop'), $('hyPopList'), function(no){ show(no); });
    POPREF = pop;
    function openPop(){ if(cur) pop.open(buildIndex(), cur); }
    $('hyCur').onclick = openPop; $('hyListBtn').onclick = openPop;
    $('hyLock').onclick = function(){ setLock(!locked); toast(locked ? '크기를 고정했습니다 — 손가락으로 벌려도 바뀌지 않습니다' : '고정을 풀었습니다 — 두 손가락으로 크기를 바꿀 수 있습니다'); };
    pinch($('hyBody'));
    /* 웹: Ctrl + 마우스 휠(노트북 터치패드 벌리기도 같은 신호)로 악보만 확대·축소 — 가리키는 곳이 제자리에 (2026-09-27) */
    $('hyBody').addEventListener('wheel', function(e){
      if(!e.ctrlKey || !cur) return;
      e.preventDefault();
      if(locked) return;
      var box = $('hyBody'), r = box.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      var old = zoom, img = $('hyImg'), ir = img.getBoundingClientRect();
      var px = (box.scrollLeft + mx) / (ir.width || 1), py = (box.scrollTop + my) / (ir.height || 1);
      setZoom(old * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      var nr = img.getBoundingClientRect();
      box.scrollLeft = px * nr.width - mx; box.scrollTop = py * nr.height - my;
    }, { passive:false });
    $('hyBody').addEventListener('dblclick', function(e){ if(cur && !locked && e.target.id === 'hyImg') setZoom(zoom === 1 ? 2 : 1); });
    var m = $('hymnModal'), down = false;
    m.addEventListener('mousedown', function(e){ down = (e.target === m); });
    m.addEventListener('click', function(e){ if(down && e.target === m) close(); down = false; });
    document.addEventListener('keydown', function(e){
      if(!isOpen()) return;
      var typing = e.target && /INPUT|TEXTAREA/.test(e.target.tagName);
      if(e.key === 'ArrowLeft' && !typing && cur){ if(cur > 1) show(cur - 1); e.preventDefault(); }
      else if(e.key === 'ArrowRight' && !typing && cur){ if(cur < MAX) show(cur + 1); e.preventDefault(); }
    }, true);
    APP.swipe($('hyBody'), function(dir){ if(!cur) return; if(dir < 0 && cur < MAX) show(cur + 1); else if(dir > 0 && cur > 1) show(cur - 1); });
    var lk = ''; try{ lk = localStorage.getItem('modu.hymn.lock') || ''; }catch(e){}
    setLock(!!lk);
    /* 두 권 고르기 · 조 · 주제 · 정렬 */
    var bks = $('hyBooks');
    if(bks){
      if(!BOOKS.joy.list.length) bks.hidden = true;
      bks.addEventListener('click', function(e){ var b = e.target.closest('button[data-bk]'); if(!b || b.dataset.bk === BK) return; setBook(b.dataset.bk); $('hyIn').value = ''; showIndex(); });
    }
    if($('hyKey')){
      buildFilters(); if($('hyFilt')) $('hyFilt').hidden = !hasMeta();
      $('hyKey').onchange = function(){ F.key = this.value; if(cur) showIndex(); else paintIndex($('hyIn').value); };
      $('hyTag').onchange = function(){ F.tag = this.value; if(cur) showIndex(); else paintIndex($('hyIn').value); };
      $('hySort').onclick = function(){ F.sort = F.sort === 'no' ? 'title' : 'no'; this.textContent = F.sort === 'no' ? '번호순' : '가나다순'; indexHtml = ''; if(cur) showIndex(); else paintIndex($('hyIn').value); };
    }
    function fromHash(){ var h = location.hash.match(/^#(hymn|joy)=(\d{1,3})$/); if(h) open(+h[2], h[1]); }
    fromHash();
    window.addEventListener('hashchange', fromHash);
  }
  /* 뒤로 단추: 한 단계씩 — 고르기 팝업 → 악보 → 목록 → 닫기 */
  function back(){
    if(POPREF && POPREF.isOpen()){ POPREF.close(); return; }
    if(BK === 'joy' && cur){
      var was = cur; $('hyIn').value = ''; showIndex();
      var row = $('hyIndex').querySelector('.hy-row[data-no="' + was + '"]');          /* 보던 곡이 목록 가운데 오게 */
      if(row){ var box = $('hyBody'); box.scrollTop = Math.max(0, row.offsetTop - box.offsetTop - box.clientHeight / 2 + row.offsetHeight / 2); row.classList.add('on'); }
      return;
    }   /* 기쁨으로 찬양: 악보 → 곡 목록 → 성경 (2026-09-27 요청) */
    close();                                                              /* 새찬송가: 한 번에 성경으로 */
  }
  init();
  return { open:open, close:close, back:back, isOpen:isOpen, show:show, title:title, src:src, max:MAX };
})();
