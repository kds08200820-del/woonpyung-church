/* 2026 모두의 성경 — 휴대폰 화면 맞춤 (app.js 뒤에 읽는다)
   · 책·장 목록은 서랍(왼쪽에서 밀려 나옴), 고르면 닫힌다
   · 길게 누르면 오른쪽 단추 메뉴, 낱말을 톡 누르면 뜻 상자
   · 안드로이드 뒤로 단추 = 창 닫기·앞 화면
   · 원어 음성 관련 단추·메뉴는 숨긴다 */
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var X = window.MODU_X || {}, S = X.S || {};
  var toggleNav = X.toggleNav || function(){}, saveSettings = X.saveSettings || function(){}, applySettings = X.applySettings || function(){};
  var infoFromEvent = X.infoFromEvent, fillWordBox = X.fillWordBox, anyPopupOpen = X.anyPopupOpen, goBackToRead = X.goBackToRead;
  var first = false;
  try{ first = !localStorage.getItem('modu.seen'); localStorage.setItem('modu.seen', '1'); }catch(e){}

  /* ── 서랍(책·장 목록) ── */
  var back = document.createElement('div'); back.id = 'moBack'; back.hidden = true; document.body.appendChild(back);
  function drawerOpen(){ return !!S.showNav; }
  function syncDrawer(){ back.hidden = !drawerOpen(); document.body.classList.toggle('mo-drawer', drawerOpen()); }
  back.onclick = function(){ if(drawerOpen()) toggleNav(); };
  if(first && S.showNav){ S.showNav = false; saveSettings(); applySettings(); }   /* 처음엔 본문부터 */
  new MutationObserver(syncDrawer).observe($('booknav'), { attributes:true, attributeFilter:['hidden'] });
  syncDrawer();
  /* 장을 고르면 서랍을 닫고 본문으로 */
  $('bnChaps').addEventListener('click', function(e){ if(e.target.closest('button')) setTimeout(function(){ if(drawerOpen()) toggleNav(); }, 0); });
  /* 오른쪽 위 '책·장' 단추 → 서랍 */
  var vh = document.querySelector('#v-read .vhead');
  if(vh){
    var nb = document.createElement('button'); nb.type = 'button'; nb.className = 'btn mo-navbtn'; nb.textContent = '☰ 책·장';
    nb.onclick = function(){ toggleNav(); };
    vh.insertBefore(nb, vh.firstChild);
  }

  /* ── 원어 음성·따라 읽기 감추기 ── */
  ['listenBtn', 'player', 'readModal', 'recPop', 'audFolder'].forEach(function(id){ var el = $(id); if(el) el.hidden = true; });
  var aud = $('audStatus'); if(aud){ var card = aud.closest('.card'); if(card) card.hidden = true; }
  function pruneMenus(){
    [].forEach.call(document.querySelectorAll('#menubar .mb-item'), function(b){ if(/^원어듣기|^파일/.test(b.textContent)) b.hidden = true; });
    [].forEach.call(document.querySelectorAll('#toolbar .tb-b'), function(b){ var n = b.getAttribute('aria-label') || ''; if(/원어로 듣기|책·장 목록|화면 색 바꾸기/.test(n)) b.hidden = true; });
  }
  pruneMenus();
  var pop = $('menupop');
  if(pop) new MutationObserver(function(){
    if(pop.hidden) return;
    [].forEach.call(pop.querySelectorAll('.mb-row'), function(r){ if(/듣고 따라 읽기|녹음|원어로 듣기|끝내기|프로그램 종료/.test(r.textContent)) r.hidden = true; });
  }).observe(pop, { attributes:true, attributeFilter:['hidden'] });

  /* ── 길게 누르기 → 오른쪽 단추 메뉴 (iOS 는 contextmenu 를 내지 않는다) ── */
  var lp = null, lpFired = false;
  function clearLP(){ if(lp){ clearTimeout(lp); lp = null; } }
  document.addEventListener('touchstart', function(e){
    if(e.touches.length !== 1) return clearLP();
    var t = e.touches[0], tgt = e.target;
    if(!tgt.closest || !tgt.closest('#reader, #trModal .tr-body, .sv')) return;
    lpFired = false; clearLP();
    lp = setTimeout(function(){
      lp = null; lpFired = true;
      try{ navigator.vibrate && navigator.vibrate(12); }catch(err){}
      var ev = new MouseEvent('contextmenu', { bubbles:true, cancelable:true, clientX:t.clientX, clientY:t.clientY, button:2 });
      tgt.dispatchEvent(ev);
    }, 550);
  }, { passive:true });
  document.addEventListener('touchmove', clearLP, { passive:true });
  document.addEventListener('touchend', function(e){ clearLP(); if(lpFired){ e.preventDefault(); lpFired = false; } }, { passive:false });
  document.addEventListener('touchcancel', clearLP, { passive:true });
  /* 크롬(안드로이드)이 스스로 낸 contextmenu 뒤에 오는 click 은 메뉴를 닫아 버린다 → 잠깐 막는다 */
  var lastCM = 0;
  document.addEventListener('contextmenu', function(){ lastCM = Date.now(); }, true);
  document.addEventListener('click', function(e){ if(Date.now() - lastCM < 400 && e.target.closest && !e.target.closest('.cmenu')){ e.stopPropagation(); e.preventDefault(); } }, true);

  /* ── 낱말 톡 누르기 → 뜻 상자(아래 시트) ── */
  var wb = $('wordbox');
  if(wb){
    var close = document.createElement('button'); close.type = 'button'; close.className = 'wb-btn mo-wbclose'; close.textContent = '닫기';
    close.onclick = function(){ wb.classList.remove('mo-on'); };
    var head = wb.querySelector('.wb-head'); if(head) head.appendChild(close);
    $('reader').addEventListener('click', function(e){
      if(Date.now() - lastCM < 400) return;
      var el = e.target.closest ? e.target.closest('.hw, .gw, .eng') : null; if(!el) return;
      var sel = window.getSelection(); if(sel && String(sel).trim()) return;
      var info = (typeof infoFromEvent === 'function') ? infoFromEvent(e) : null; if(!info) return;
      if(typeof fillWordBox === 'function'){ fillWordBox(info); wb.hidden = false; wb.classList.add('mo-on'); }
    });
  }

  /* ── 뒤로 단추: 창이 열려 있으면 닫고, 아니면 앞 화면으로 ── */
  function trap(){ try{ history.pushState({ modu:1 }, ''); }catch(e){} }
  trap();
  window.addEventListener('popstate', function(){
    trap();
    if(drawerOpen()){ toggleNav(); return; }
    var mp = $('menupop'); if(mp && !mp.hidden){ document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); return; }
    if(wb && wb.classList.contains('mo-on')){ wb.classList.remove('mo-on'); return; }
    if(document.querySelector('.cmenu')){ if(window.APP && APP.closeCMenu) APP.closeCMenu(); return; }
    var upd = document.querySelector('.upd-ov'); if(upd && !upd.hidden){ document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); return; }
    if(typeof anyPopupOpen === 'function' && anyPopupOpen()){ document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); return; }
    if(typeof goBackToRead === 'function' && !goBackToRead()) { /* 본문이면 그대로 둔다 (앱을 나가지 않는다) */ }
  });

  /* ── 설치 안내 (홈 화면에 추가) ── */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); deferred = e; var b = $('moInstall'); if(b) b.hidden = false; });
  var about = $('aboutCard');
  if(about){
    var ib = document.createElement('button'); ib.type = 'button'; ib.className = 'btn primary'; ib.id = 'moInstall'; ib.textContent = '홈 화면에 설치'; ib.hidden = true;
    ib.onclick = function(){ if(deferred){ deferred.prompt(); deferred = null; ib.hidden = true; } };
    about.appendChild(ib);
  }

  /* ── 서비스 워커 ── */
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(function(){});
    navigator.serviceWorker.addEventListener('controllerchange', function(){ /* 새 판이 잡히면 다음 열 때 반영 */ });
  }
})();
