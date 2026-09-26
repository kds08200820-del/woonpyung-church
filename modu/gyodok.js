/* 교독문 보기 — 새찬송가 교독문 137편(gyodok-data.js). 찬송가와 같은 목록 화면:
   처음 열면 전체 목록, 위 검색창에 번호·제목을 치면 목록이 줄어들고, 한 편을 누르면 인도자·회중 줄로 보여 준다.
   · 본문 화면 [📜 교독문] 단추, 모바일 아래 막대, 주소의 #gyodok=46 으로 연다
   · 다른 화면(오늘의 예배 등)에서는 GYODOK_VIEW.open(번호) 로 부른다 */
var GYODOK_VIEW = (function(){
  var $ = APP.$, esc = APP.esc, toast = APP.toast;
  var LIST = window.GYODOK || [], MAX = LIST.length ? LIST[LIST.length - 1].no : 137;
  var cur = 0, size = 1, SIZES = [0.85, 1, 1.2, 1.45], indexHtml = '', POPREF = null;
  var byNo = {}; LIST.forEach(function(g){ byNo[g.no] = g; });
  function isOpen(){ var m = $('gdModal'); return !!(m && !m.hidden); }
  function tidy(s){ return String(s || '').replace(/\s+([편장절])\b/g, '$1').replace(/\s+/g, ' ').trim(); }
  function title(no){ var g = byNo[no]; return g ? tidy(g.title) : ''; }
  function row(g){ return '<button type="button" class="hy-row" data-no="' + g.no + '"><b>' + g.no + '</b><span>' + esc(tidy(g.title)) + '</span></button>'; }
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
    var n = q.match(/^(\d{1,3})\s*번?$/);
    if(n){ var k = n[1], out = LIST.filter(function(g){ return String(g.no).indexOf(k) === 0; }); if(byNo[+k]) out = [byNo[+k]].concat(out.filter(function(g){ return g.no !== +k; })); return out; }
    var kk = norm(q);
    return LIST.filter(function(g){ return norm(g.title).indexOf(kk) >= 0 || norm(g.body[0]).indexOf(kk) >= 0; });
  }
  function showIndex(){
    cur = 0; $('gdPop').hidden = true;
    $('gdTools').hidden = true;
    $('gdText').hidden = true;
    $('gdIndex').hidden = false;
    paintIndex($('gdIn').value);
    $('gdBody').scrollTop = 0;
    try{ if(location.hash.indexOf('#gyodok=') === 0) history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  }
  function paintIndex(q){
    var r = search(q), box = $('gdIndex');
    if(r === null){ box.innerHTML = buildIndex(); return; }
    box.innerHTML = r.length ? '<div class="hy-band">찾은 교독문 ' + r.length + '편</div>' + r.map(row).join('') : '<div class="hy-empty">찾는 교독문이 없습니다</div>';
    $('gdBody').scrollTop = 0;
  }
  /* ── 본문 ── */
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
    $('gdNo').textContent = no + '번';
    $('gdSub').textContent = tidy(g.title);
    $('gdIn').value = '';
    $('gdTools').hidden = false; $('gdPop').hidden = true;
    $('gdIndex').hidden = true;
    $('gdText').innerHTML = render(g); $('gdText').hidden = false;
    $('gdBody').scrollTop = 0;
    $('gdPrev').disabled = no <= 1; $('gdNext').disabled = no >= MAX;
    try{ localStorage.setItem('modu.gyodok.last', String(no)); }catch(e){}
    try{ if(location.hash.indexOf('#gyodok=') === 0 || location.hash === '') history.replaceState(null, '', location.pathname + location.search + '#gyodok=' + no); }catch(e){}
  }
  function open(no){
    var m = $('gdModal'); if(!m) return;
    if(window.HYMN && HYMN.isOpen()) HYMN.close();
    m.hidden = false; document.body.classList.add('modal-open'); document.body.classList.add('hy-open');
    $('gdIn').value = '';
    if(no) show(no); else showIndex();
  }
  function close(){
    var m = $('gdModal'); if(!m || m.hidden) return;
    m.hidden = true; document.body.classList.remove('modal-open'); document.body.classList.remove('hy-open');
    try{ if(location.hash.indexOf('#gyodok=') === 0) history.replaceState(null, '', location.pathname + location.search); }catch(e){}
  }
  function setSize(s){
    size = s; $('gdText').style.fontSize = (s * 100) + '%';
    [].forEach.call(document.querySelectorAll('#gdSize button'), function(b){ b.classList.toggle('on', +b.dataset.s === s); });
    try{ localStorage.setItem('modu.gyodok.size', String(s)); }catch(e){}
  }
  function init(){
    if(!$('gdModal')) return;
    $('gyodokBtn').onclick = function(){ open(0); };
    $('gdClose').onclick = close;
    $('gdIndexBtn').onclick = function(){ $('gdIn').value = ''; showIndex(); };
    $('gdPrev').onclick = function(){ if(cur > 1) show(cur - 1); };
    $('gdNext').onclick = function(){ if(cur < MAX) show(cur + 1); };
    var input = $('gdIn');
    input.addEventListener('input', function(){ if(cur) showIndex(); else paintIndex(input.value); });
    input.addEventListener('focus', function(){ if(cur) showIndex(); });
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ var r = search(input.value) || []; if(r.length){ show(r[0].no); input.blur(); } else toast('번호나 제목을 적어 주세요 (예: 46 · 시편 104)'); e.preventDefault(); }
    });
    $('gdIndex').addEventListener('click', function(e){ var b = e.target.closest('.hy-row'); if(b){ show(+b.dataset.no); input.blur(); } });
    var pop = APP.listPop($('gdPop'), $('gdPopList'), function(no){ show(no); });
    POPREF = pop;
    function openPop(){ if(cur) pop.open(buildIndex(), cur); }
    $('gdCur').onclick = openPop; $('gdListBtn').onclick = openPop;
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
    /* 좌우로 밀면 앞뒤 편 */
    if(window.APP && APP.swipe) APP.swipe($('gdBody'), function(dir){ if(!cur) return; if(dir < 0 && cur < MAX) show(cur + 1); else if(dir > 0 && cur > 1) show(cur - 1); });
    var s = 1; try{ s = +localStorage.getItem('modu.gyodok.size') || 1; }catch(e){}
    setSize(SIZES.indexOf(s) >= 0 ? s : 1);
    var h = location.hash.match(/^#gyodok=(\d{1,3})$/);
    if(h) open(+h[1]);
    window.addEventListener('hashchange', function(){ var h = location.hash.match(/^#gyodok=(\d{1,3})$/); if(h) open(+h[1]); });
  }
  function back(){ if(POPREF && POPREF.isOpen()) POPREF.close(); else if(cur){ $('gdIn').value = ''; showIndex(); } else close(); }
  init();
  return { open:open, close:close, back:back, isOpen:isOpen, show:show, title:title, max:MAX };
})();
