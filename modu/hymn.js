/* 찬송가 보기 — 새찬송가 645장 악보 그림(data/hymn/NNN.webp)을 장 번호·제목으로 찾아 보여 준다.
   · 본문 화면 지구본(🌍) 옆 [🎵 찬송가] 단추, 모바일 더보기 메뉴, 주소의 #hymn=570 으로 연다
   · 다른 화면(오늘의 예배 등)에서는 HYMN.open(장번호) 로 부른다 */
var HYMN = (function(){
  var $ = APP.$, esc = APP.esc, toast = APP.toast;
  var LIST = window.HYMNS || [], MAX = LIST.length ? LIST[LIST.length - 1].no : 645;
  var cur = 0, zoom = 1, ZOOMS = [1, 1.5, 2, 3];
  var byNo = {}; LIST.forEach(function(h){ byNo[h.no] = h; });
  function isOpen(){ var m = $('hymnModal'); return !!(m && !m.hidden); }
  function title(no){ var h = byNo[no]; return h ? h.title : ''; }
  function src(no){ return 'data/hymn/' + ('00' + no).slice(-3) + '.webp'; }
  function show(no){
    no = +no;
    if(!(no >= 1 && no <= MAX)) return toast('찬송가는 1장부터 ' + MAX + '장까지 있습니다');
    cur = no;
    $('hyTitle').textContent = no + '장';
    $('hySub').textContent = title(no);
    $('hyIn').value = '';
    $('hyList').hidden = true;
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
    if(no){ show(no); return; }
    if(!cur){ var last = 0; try{ last = +localStorage.getItem('modu.hymn.last') || 0; }catch(e){} if(last) show(last); }
    setTimeout(function(){ $('hyIn').focus(); }, 0);
  }
  function close(){
    var m = $('hymnModal'); if(!m || m.hidden) return;
    m.hidden = true; document.body.classList.remove('modal-open');
    try{ if(location.hash.indexOf('#hymn=') === 0) history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  }
  /* 찾기: 숫자면 장, 글이면 제목에서 찾는다 (띄어쓰기 무시) */
  function norm(s){ return String(s || '').replace(/\s+/g, '').toLowerCase(); }
  function search(q){
    q = q.trim(); if(!q) return [];
    var n = q.match(/^(\d{1,3})\s*장?$/);
    if(n) return byNo[+n[1]] ? [byNo[+n[1]]] : [];
    var k = norm(q), out = [];
    for(var i = 0; i < LIST.length && out.length < 30; i++) if(norm(LIST[i].title).indexOf(k) >= 0) out.push(LIST[i]);
    return out;
  }
  function paintList(q){
    var box = $('hyList'), r = search(q);
    if(!q.trim()){ box.hidden = true; return; }
    if(!r.length){ box.innerHTML = '<div class="hy-none">찾는 찬송이 없습니다</div>'; box.hidden = false; return; }
    box.innerHTML = r.map(function(h){ return '<button type="button" class="hy-it" data-no="' + h.no + '"><b>' + h.no + '장</b><span>' + esc(h.title) + '</span></button>'; }).join('');
    box.hidden = false;
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
    $('hyPrev').onclick = function(){ if(cur > 1) show(cur - 1); };
    $('hyNext').onclick = function(){ if(cur < MAX) show(cur + 1); };
    var input = $('hyIn');
    input.addEventListener('input', function(){ paintList(input.value); });
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ var r = search(input.value); if(r.length) show(r[0].no); else toast('장 번호나 제목을 적어 주세요 (예: 570 · 목자)'); e.preventDefault(); }
      else if(e.key === 'Escape' && !$('hyList').hidden){ $('hyList').hidden = true; input.value = ''; e.stopPropagation(); }
    });
    $('hyList').addEventListener('click', function(e){ var b = e.target.closest('.hy-it'); if(b) show(+b.dataset.no); });
    $('hyZoom').addEventListener('click', function(e){ var b = e.target.closest('button'); if(b) setZoom(+b.dataset.z); });
    $('hyBody').addEventListener('dblclick', function(){ setZoom(zoom === 1 ? 2 : 1); });
    var m = $('hymnModal'), down = false;
    m.addEventListener('mousedown', function(e){ down = (e.target === m); });
    m.addEventListener('click', function(e){ if(down && e.target === m) close(); down = false; });
    document.addEventListener('keydown', function(e){
      if(!isOpen()) return;
      var typing = e.target && /INPUT|TEXTAREA/.test(e.target.tagName);
      if(e.key === 'ArrowLeft' && !typing){ if(cur > 1) show(cur - 1); e.preventDefault(); }
      else if(e.key === 'ArrowRight' && !typing){ if(cur < MAX) show(cur + 1); e.preventDefault(); }
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
