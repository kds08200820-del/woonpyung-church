/* 교독문 보기 — 새찬송가 교독문 137편(gyodok-data.js)을 번호·제목으로 찾아 인도자·회중 줄로 보여 준다.
   · 본문 화면 [📜 교독문] 단추, 모바일 아래 막대, 주소의 #gyodok=46 으로 연다
   · 다른 화면(오늘의 예배 등)에서는 GYODOK_VIEW.open(번호) 로 부른다 */
var GYODOK_VIEW = (function(){
  var $ = APP.$, esc = APP.esc, toast = APP.toast;
  var LIST = window.GYODOK || [], MAX = LIST.length ? LIST[LIST.length - 1].no : 137;
  var cur = 0, size = 1, SIZES = [0.85, 1, 1.2, 1.45];
  var byNo = {}; LIST.forEach(function(g){ byNo[g.no] = g; });
  function isOpen(){ var m = $('gdModal'); return !!(m && !m.hidden); }
  function tidy(s){ return String(s || '').replace(/\s+([편장절])\b/g, '$1').replace(/\s+/g, ' ').trim(); }
  function title(no){ var g = byNo[no]; return g ? tidy(g.title) : ''; }
  function render(g){
    var h = '', role = 0;                                   /* 0 인도자 · 1 회중, 줄마다 번갈아 — (다같이) 줄은 함께 */
    g.body.forEach(function(line){
      var all = /^\(다\s*같이\)/.test(line);
      var txt = all ? line.replace(/^\(다\s*같이\)\s*/, '') : line;
      var ref = '';
      var m = txt.match(/\s*\(([^()]*\d[^()]*)\)\s*$/);
      if(m){ ref = m[1]; txt = txt.slice(0, m.index); }
      var cls = all ? 'gd-all' : (role ? 'gd-people' : 'gd-leader');
      h += '<p class="gd-line ' + cls + '"><span class="gd-who">' + (all ? '다같이' : (role ? '회중' : '인도자')) + '</span><span class="gd-txt">' + esc(txt) + (ref ? '<small class="gd-ref">(' + esc(ref) + ')</small>' : '') + '</span></p>';
      if(!all) role = 1 - role;
    });
    return h;
  }
  function show(no){
    no = +no;
    var g = byNo[no];
    if(!g) return toast('교독문은 1번부터 ' + MAX + '번까지 있습니다');
    cur = no;
    $('gdTitle').textContent = no + '번 · ' + tidy(g.title);
    $('gdSub').textContent = '새찬송가 교독문';
    $('gdIn').value = ''; $('gdList').hidden = true;
    $('gdBody').innerHTML = render(g);
    $('gdBody').scrollTop = 0;
    $('gdPrev').disabled = no <= 1; $('gdNext').disabled = no >= MAX;
    try{ localStorage.setItem('modu.gyodok.last', String(no)); }catch(e){}
    try{ if(location.hash.indexOf('#gyodok=') === 0 || location.hash === '') history.replaceState(null, '', location.pathname + location.search + '#gyodok=' + no); }catch(e){}
  }
  function open(no){
    var m = $('gdModal'); if(!m) return;
    m.hidden = false; document.body.classList.add('modal-open');
    if(no){ show(no); return; }
    if(!cur){ var last = 0; try{ last = +localStorage.getItem('modu.gyodok.last') || 0; }catch(e){} if(last) show(last); else paintIndex(); }
    setTimeout(function(){ $('gdIn').focus(); }, 0);
  }
  function close(){
    var m = $('gdModal'); if(!m || m.hidden) return;
    m.hidden = true; document.body.classList.remove('modal-open');
    try{ if(location.hash.indexOf('#gyodok=') === 0) history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  }
  function norm(s){ return String(s || '').replace(/\s+/g, '').toLowerCase(); }
  function search(q){
    q = q.trim(); if(!q) return [];
    var n = q.match(/^(\d{1,3})\s*번?$/);
    if(n) return byNo[+n[1]] ? [byNo[+n[1]]] : [];
    var k = norm(q), out = [];
    for(var i = 0; i < LIST.length && out.length < 40; i++) if(norm(LIST[i].title).indexOf(k) >= 0 || norm(LIST[i].body[0]).indexOf(k) >= 0) out.push(LIST[i]);
    return out;
  }
  function item(g){ return '<button type="button" class="gd-it" data-no="' + g.no + '"><b>' + g.no + '번</b><span>' + esc(tidy(g.title)) + '<small>' + esc(g.body[0] || '') + '</small></span></button>'; }
  function paintList(q){
    var box = $('gdList'), r = search(q);
    if(!q.trim()){ box.hidden = true; return; }
    box.innerHTML = r.length ? r.map(item).join('') : '<div class="hy-none">찾는 교독문이 없습니다</div>';
    box.hidden = false;
  }
  /* 아직 고른 교독문이 없을 때: 전체 목록을 본문 자리에 */
  function paintIndex(){
    $('gdTitle').textContent = '교독문'; $('gdSub').textContent = '번호나 제목으로 찾거나 아래에서 고르세요';
    $('gdBody').innerHTML = '<div class="gd-index">' + LIST.map(item).join('') + '</div>';
    $('gdPrev').disabled = true; $('gdNext').disabled = true;
  }
  function setSize(s){
    size = s; $('gdBody').style.fontSize = (s * 100) + '%';
    [].forEach.call(document.querySelectorAll('#gdSize button'), function(b){ b.classList.toggle('on', +b.dataset.s === s); });
    try{ localStorage.setItem('modu.gyodok.size', String(s)); }catch(e){}
  }
  function init(){
    if(!$('gdModal')) return;
    $('gyodokBtn').onclick = function(){ open(0); };
    $('gdClose').onclick = close;
    $('gdPrev').onclick = function(){ if(cur > 1) show(cur - 1); };
    $('gdNext').onclick = function(){ if(cur < MAX) show(cur + 1); };
    $('gdIndexBtn').onclick = function(){ cur = 0; paintIndex(); };
    var input = $('gdIn');
    input.addEventListener('input', function(){ paintList(input.value); });
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ var r = search(input.value); if(r.length) show(r[0].no); else toast('번호나 제목을 적어 주세요 (예: 46 · 시편 104)'); e.preventDefault(); }
      else if(e.key === 'Escape' && !$('gdList').hidden){ $('gdList').hidden = true; input.value = ''; e.stopPropagation(); }
    });
    $('gdModal').addEventListener('click', function(e){ var b = e.target.closest('.gd-it'); if(b) show(+b.dataset.no); });
    $('gdSize').addEventListener('click', function(e){ var b = e.target.closest('button'); if(b) setSize(+b.dataset.s); });
    var m = $('gdModal'), down = false;
    m.addEventListener('mousedown', function(e){ down = (e.target === m); });
    m.addEventListener('click', function(e){ if(down && e.target === m) close(); down = false; });
    document.addEventListener('keydown', function(e){
      if(!isOpen()) return;
      var typing = e.target && /INPUT|TEXTAREA/.test(e.target.tagName);
      if(e.key === 'ArrowLeft' && !typing && cur){ if(cur > 1) show(cur - 1); e.preventDefault(); }
      else if(e.key === 'ArrowRight' && !typing && cur){ if(cur < MAX) show(cur + 1); e.preventDefault(); }
    }, true);
    var s = 1; try{ s = +localStorage.getItem('modu.gyodok.size') || 1; }catch(e){}
    setSize(SIZES.indexOf(s) >= 0 ? s : 1);
    var h = location.hash.match(/^#gyodok=(\d{1,3})$/);
    if(h) open(+h[1]);
    window.addEventListener('hashchange', function(){ var h = location.hash.match(/^#gyodok=(\d{1,3})$/); if(h) open(+h[1]); });
  }
  init();
  return { open:open, close:close, isOpen:isOpen, show:show, title:title, max:MAX };
})();
