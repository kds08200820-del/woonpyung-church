/* 찬송가 보기 — 새찬송가 645장. 처음 열면 전체 목록(1~50 · 51~100 …)이 나오고, 위 검색창에 장 번호·제목을 치면 목록이 줄어든다.
   한 곡을 누르면 악보 그림(data/hymn/NNN.webp)을 보여 준다.
   · 본문 화면 [🎵 찬송가] 단추, 모바일 아래 막대, 주소의 #hymn=570 으로 연다
   · 다른 화면(오늘의 예배 등)에서는 HYMN.open(장번호) 로 부른다 */
/* 좌우로 미는 손짓 — 가로 스크롤이 있는 상자(확대한 악보)는 끝에 닿았을 때만 넘긴다. fn(-1)=다음, fn(1)=이전 */
APP.swipe = function(el, fn){
  var sx = 0, sy = 0, sl = 0, on = false;
  el.addEventListener('touchstart', function(e){ if(e.touches.length !== 1){ on = false; return; } on = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY; sl = el.scrollLeft; }, { passive:true });
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
  var LIST = window.HYMNS || [], MAX = LIST.length ? LIST[LIST.length - 1].no : 645;
  var cur = 0, zoom = 1, locked = false, indexHtml = '', POPREF = null;
  var byNo = {}; LIST.forEach(function(h){ byNo[h.no] = h; });
  function isOpen(){ var m = $('hymnModal'); return !!(m && !m.hidden); }
  function title(no){ var h = byNo[no]; return h ? h.title : ''; }
  function src(no){ return 'data/hymn/' + ('00' + no).slice(-3) + '.webp'; }
  function row(h){ return '<button type="button" class="hy-row" data-no="' + h.no + '"><b>' + h.no + '</b><span>' + esc(h.title) + '</span></button>'; }
  /* ── 목록 ── */
  function buildIndex(){
    if(indexHtml) return indexHtml;
    var h = '', band = -1;
    LIST.forEach(function(x){
      var b = Math.floor((x.no - 1) / 50);
      if(b !== band){ band = b; h += '<div class="hy-band">' + (b * 50 + 1) + '~' + Math.min(b * 50 + 50, MAX) + '</div>'; }
      h += row(x);
    });
    return (indexHtml = h);
  }
  function norm(s){ return String(s || '').replace(/\s+/g, '').toLowerCase(); }
  function search(q){
    q = q.trim(); if(!q) return null;
    var n = q.match(/^(\d{1,3})\s*장?$/);
    if(n){ var k = n[1], out = LIST.filter(function(h){ return String(h.no).indexOf(k) === 0; }); if(byNo[+k]) out = [byNo[+k]].concat(out.filter(function(h){ return h.no !== +k; })); return out; }
    var kk = norm(q);
    return LIST.filter(function(h){ return norm(h.title).indexOf(kk) >= 0; });
  }
  /* ── 빨리 내리기 띠 ── */
  var BANDS = [];
  function buildRail(){
    var rail = $('hyRail'); if(!rail || rail.childNodes.length) return;
    BANDS.push(1); for(var b = 100; b <= MAX; b += 100) BANDS.push(b);     /* 1 · 100 · 200 … 600 */
    rail.innerHTML = BANDS.map(function(n){ return '<i>' + n + '</i>'; }).join('');
    var bub = null;
    function at(y){
      var r = rail.getBoundingClientRect(), i = Math.floor((y - r.top) / r.height * BANDS.length);
      i = Math.max(0, Math.min(BANDS.length - 1, i));
      var no = BANDS[i], el = $('hyIndex').querySelector('.hy-row[data-no="' + no + '"]');
      if(el){ var box = $('hyBody'); box.scrollTop = el.offsetTop - box.offsetTop - 26; }
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
    $('hyTitle').textContent = '새찬송가';
    $('hyTools').hidden = true;
    $('hyImg').hidden = true; $('hyWait').hidden = true; $('hyNone').hidden = true;
    $('hyIndex').hidden = false;
    paintIndex($('hyIn').value);
    $('hyBody').scrollTop = 0;
    try{ if(location.hash.indexOf('#hymn=') === 0) history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  }
  function paintIndex(q){
    var r = search(q), box = $('hyIndex');
    if(r === null){ box.innerHTML = buildIndex(); buildRail(); $('hyRail').hidden = false; return; }
    $('hyRail').hidden = true;
    box.innerHTML = r.length ? '<div class="hy-band">찾은 찬송 ' + r.length + '곡</div>' + r.map(row).join('') : '<div class="hy-empty">찾는 찬송이 없습니다</div>';
    $('hyBody').scrollTop = 0;
  }
  /* ── 악보 ── */
  function show(no){
    no = +no;
    if(!(no >= 1 && no <= MAX)) return toast('찬송가는 1장부터 ' + MAX + '장까지 있습니다');
    cur = no;
    $('hyTitle').textContent = '새찬송가';
    $('hyNo').textContent = no + '장';
    $('hySub').textContent = title(no);
    $('hyTools').hidden = false; $('hyIn').value = ''; $('hyPop').hidden = true;
    $('hyIndex').hidden = true; $('hyRail').hidden = true;
    var img = $('hyImg'), box = $('hyBody');
    img.hidden = true; $('hyWait').hidden = false; $('hyNone').hidden = true;
    setZoom(1);                                              /* 새 장은 늘 화면 폭에 맞춤 */
    img.onload = function(){ img.hidden = false; $('hyWait').hidden = true; box.scrollTop = 0; box.scrollLeft = 0; };
    img.onerror = function(){ $('hyWait').hidden = true; $('hyNone').hidden = false; };
    img.src = src(no);
    img.alt = '새찬송가 ' + no + '장 ' + title(no);
    $('hyPrev').disabled = no <= 1; $('hyNext').disabled = no >= MAX;
    try{ localStorage.setItem('modu.hymn.last', String(no)); }catch(e){}
    try{ if(location.hash.indexOf('#hymn=') === 0 || location.hash === '') history.replaceState(null, '', location.pathname + location.search + '#hymn=' + no); }catch(e){}
  }
  function open(no){
    var m = $('hymnModal'); if(!m) return;
    if(window.GYODOK_VIEW && GYODOK_VIEW.isOpen()) GYODOK_VIEW.close();
    m.hidden = false; document.body.classList.add('modal-open'); document.body.classList.add('hy-open');
    $('hyIn').value = '';
    if(no) show(no); else showIndex();
  }
  function close(){
    var m = $('hymnModal'); if(!m || m.hidden) return;
    m.hidden = true; document.body.classList.remove('modal-open'); document.body.classList.remove('hy-open');
    try{ if(location.hash.indexOf('#hymn=') === 0) history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  }
  function setZoom(z){ zoom = Math.max(1, Math.min(4, z)); $('hyImg').style.width = (zoom * 100) + '%'; }
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
    var h = location.hash.match(/^#hymn=(\d{1,3})$/);
    if(h) open(+h[1]);
    window.addEventListener('hashchange', function(){ var h = location.hash.match(/^#hymn=(\d{1,3})$/); if(h) open(+h[1]); });
  }
  /* 뒤로 단추: 한 단계씩 — 고르기 팝업 → 악보 → 목록 → 닫기 */
  function back(){ if(POPREF && POPREF.isOpen()) POPREF.close(); else if(cur){ $('hyIn').value = ''; showIndex(); } else close(); }
  init();
  return { open:open, close:close, back:back, isOpen:isOpen, show:show, title:title, src:src, max:MAX };
})();
