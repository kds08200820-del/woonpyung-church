/* 찬송가 보기 — 새찬송가 645장. 처음 열면 전체 목록(1~50 · 51~100 …)이 나오고, 위 검색창에 장 번호·제목을 치면 목록이 줄어든다.
   한 곡을 누르면 악보 그림(data/hymn/NNN.webp)을 보여 준다.
   · 본문 화면 [🎵 찬송가] 단추, 모바일 아래 막대, 주소의 #hymn=570 으로 연다
   · 다른 화면(오늘의 예배 등)에서는 HYMN.open(장번호) 로 부른다 */
var HYMN = (function(){
  var $ = APP.$, esc = APP.esc, toast = APP.toast;
  var LIST = window.HYMNS || [], MAX = LIST.length ? LIST[LIST.length - 1].no : 645;
  var cur = 0, zoom = 1, ZOOMS = [1, 1.5, 2, 3], indexHtml = '';
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
    cur = 0;
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
    $('hyTools').hidden = false; $('hyIn').value = '';
    $('hyIndex').hidden = true; $('hyRail').hidden = true;
    var img = $('hyImg'), box = $('hyBody');
    img.hidden = true; $('hyWait').hidden = false; $('hyNone').hidden = true;
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
    m.hidden = false; document.body.classList.add('modal-open');
    $('hyIn').value = '';
    if(no) show(no); else showIndex();
  }
  function close(){
    var m = $('hymnModal'); if(!m || m.hidden) return;
    m.hidden = true; document.body.classList.remove('modal-open');
    try{ if(location.hash.indexOf('#hymn=') === 0) history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  }
  function setZoom(z){
    zoom = z; var img = $('hyImg');
    img.style.width = (z * 100) + '%';
    [].forEach.call(document.querySelectorAll('#hyZoom button'), function(b){ b.classList.toggle('on', +b.dataset.z === z); });
    try{ localStorage.setItem('modu.hymn.zoom', String(z)); }catch(e){}
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
    $('hyZoom').addEventListener('click', function(e){ var b = e.target.closest('button'); if(b) setZoom(+b.dataset.z); });
    $('hyBody').addEventListener('dblclick', function(e){ if(cur && e.target.id === 'hyImg') setZoom(zoom === 1 ? 2 : 1); });
    var m = $('hymnModal'), down = false;
    m.addEventListener('mousedown', function(e){ down = (e.target === m); });
    m.addEventListener('click', function(e){ if(down && e.target === m) close(); down = false; });
    document.addEventListener('keydown', function(e){
      if(!isOpen()) return;
      var typing = e.target && /INPUT|TEXTAREA/.test(e.target.tagName);
      if(e.key === 'ArrowLeft' && !typing && cur){ if(cur > 1) show(cur - 1); e.preventDefault(); }
      else if(e.key === 'ArrowRight' && !typing && cur){ if(cur < MAX) show(cur + 1); e.preventDefault(); }
    }, true);
    var z = 0; try{ z = +localStorage.getItem('modu.hymn.zoom') || 0; }catch(e){}
    if(!z) z = window.innerWidth < 600 ? 1.5 : 1;                 /* 휴대폰은 처음에 1.5× — 가사가 읽히는 크기 */
    setZoom(ZOOMS.indexOf(z) >= 0 ? z : 1);
    var h = location.hash.match(/^#hymn=(\d{1,3})$/);
    if(h) open(+h[1]);
    window.addEventListener('hashchange', function(){ var h = location.hash.match(/^#hymn=(\d{1,3})$/); if(h) open(+h[1]); });
  }
  init();
  return { open:open, close:close, isOpen:isOpen, show:show, title:title, src:src, max:MAX };
})();
