/* 2026 모두의 성경 — 휴대폰 화면 (app.js 뒤에 읽는다)
   · 위: 큰 제목(누르면 목차) + 대조 성경·찾기·더보기 아이콘
   · 목차: 책(분류별) · 장 · 절 세 열 전체 화면 + "창 25:3" 바로 가기
   · 오른쪽 아래 둥근 단추(메모·원어 학습·지도·그래프), 아래 탭(성경·찾기·메모·지도·더보기)
   · 길게 누르면 오른쪽 단추 메뉴, 낱말 톡 누르면 뜻 상자, 좌우로 밀면 앞·뒤 장, 뒤로 단추 처리
   · 원어 음성 관련 단추·메뉴는 숨긴다. PC 폭(900px 초과)에서는 데스크탑 배치를 그대로 쓴다 */
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var X = window.MODU_X || {}, S = X.S || {};
  var toggleNav = X.toggleNav || function(){}, saveSettings = X.saveSettings || function(){}, applySettings = X.applySettings || function(){};
  var infoFromEvent = X.infoFromEvent, fillWordBox = X.fillWordBox, anyPopupOpen = X.anyPopupOpen, goBackToRead = X.goBackToRead;
  var BOOKS = (window.APP && APP.BOOKS) || [];
  var narrow = window.matchMedia('(max-width: 900px)');
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }
  function toast(m){ if(window.APP) APP.toast(m); }
  var first = false;
  try{ first = !localStorage.getItem('modu.seen'); localStorage.setItem('modu.seen', '1'); }catch(e){}
  if(first && S.showNav && narrow.matches){ S.showNav = false; saveSettings(); applySettings(); }   /* 휴대폰은 본문부터 */

  /* ── 원어 음성·따라 읽기 감추기 ── */
  ['listenBtn', 'player', 'readModal', 'recPop', 'audFolder'].forEach(function(id){ var el = $(id); if(el) el.hidden = true; });
  var aud = $('audStatus'); if(aud){ var card = aud.closest('.card'); if(card) card.hidden = true; }
  [].forEach.call(document.querySelectorAll('#menubar .mb-item'), function(b){ if(/^원어듣기|^파일/.test(b.textContent)) b.hidden = true; });
  [].forEach.call(document.querySelectorAll('#toolbar .tb-b'), function(b){ var n = b.getAttribute('aria-label') || ''; if(/원어로 듣기/.test(n)) b.hidden = true; });
  var pop = $('menupop');
  if(pop) new MutationObserver(function(){
    if(pop.hidden) return;
    [].forEach.call(pop.querySelectorAll('.mb-row'), function(r){ if(/듣고 따라 읽기|녹음|원어로 듣기|끝내기|프로그램 종료/.test(r.textContent)) r.hidden = true; });
  }).observe(pop, { attributes:true, attributeFilter:['hidden'] });

  /* ── 위 막대: 제목을 누르면 목차, 오른쪽 아이콘 ── */
  var vh = document.querySelector('#v-read .vhead'), title = $('readTitle');
  if(vh && title){
    title.classList.add('mo-title'); title.setAttribute('role', 'button');
    title.addEventListener('click', function(){ if(narrow.matches) openPick(); });
    var icons = document.createElement('div'); icons.className = 'mo-icons';
    icons.innerHTML =
      '<button type="button" class="mo-ib" id="moVerBtn" title="대조 성경"><svg viewBox="0 0 24 24"><path d="M4 5h6a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4z"/><path d="M20 5h-6a3 3 0 0 0-3 3v11a2 2 0 0 1 2-2h7z"/></svg><span class="mo-cnt" id="moVerCnt"></span></button>' +
      '<button type="button" class="mo-ib" id="moSearchBtn" title="찾기"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></button>' +
      '<button type="button" class="mo-ib" id="moMoreBtn" title="더보기"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button>';
    vh.appendChild(icons);
    $('moVerBtn').onclick = function(){ var b = $('verBtn'); if(b) b.click(); };
    $('moSearchBtn').onclick = function(){ APP.showView('search'); };
    $('moMoreBtn').onclick = openMore;
    var cnt = $('verCnt');
    if(cnt) new MutationObserver(function(){ $('moVerCnt').textContent = cnt.textContent; }).observe(cnt, { childList:true, characterData:true, subtree:true });
    $('moVerCnt').textContent = cnt ? cnt.textContent : '';
  }

  /* ── 목차(책·장·절) ── */
  var GROUPS = [['율법서', 0, 4], ['역사서', 5, 16], ['시가서', 17, 21], ['대선지서', 22, 26], ['소선지서', 27, 38],
                ['복음서', 39, 42], ['역사서', 43, 43], ['바울서신', 44, 56], ['일반서신', 57, 64], ['예언서', 65, 65]];
  var EN = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Songs','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi',
            'Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];
  var pick = null, pk = { bi:0, ci:0 };
  function pickEl(){
    if(pick) return pick;
    pick = document.createElement('div'); pick.id = 'moPick'; pick.hidden = true;
    pick.innerHTML =
      '<div class="mp-head"><b>목차 · 성경본문</b><button type="button" class="mp-x" id="mpClose" aria-label="닫기">✕</button></div>' +
      '<div class="mp-body"><div class="mp-col mp-books" id="mpBooks"></div><div class="mp-col mp-chs" id="mpChs"></div><div class="mp-col mp-vs" id="mpVs"></div></div>' +
      '<div class="mp-foot"><input id="mpIn" placeholder="창 25  또는  창세기 25:3" autocomplete="off"><button type="button" class="btn primary" id="mpGo">가기</button></div>';
    document.body.appendChild(pick);
    var books = $('mpBooks'), h = '';
    GROUPS.forEach(function(g){
      h += '<div class="mp-grp">' + esc(g[0]) + '</div>';
      for(var i = g[1]; i <= g[2] && i < BOOKS.length; i++)
        h += '<button type="button" class="mp-bk" data-bi="' + i + '"><span class="mp-ab">' + esc(BOOKS[i].a) + '</span><span class="mp-nm">' + esc(BOOKS[i].n) + '<small>' + esc(EN[i] || '') + '</small></span></button>';
    });
    books.innerHTML = h;
    books.addEventListener('click', function(e){ var b = e.target.closest('.mp-bk'); if(!b) return; pk.bi = +b.dataset.bi; pk.ci = 0; paintPick(); });
    $('mpChs').addEventListener('click', function(e){ var b = e.target.closest('button'); if(!b) return; pk.ci = +b.dataset.ci; paintPick(); if(e.detail > 1) go(pk.bi, pk.ci, -1); });
    $('mpVs').addEventListener('click', function(e){ var b = e.target.closest('button'); if(!b) return; go(pk.bi, pk.ci, +b.dataset.vi); });
    $('mpClose').onclick = closePick;
    function typed(){
      var q = $('mpIn').value.trim(); if(!q) return;
      var r = X.parseRefList ? X.parseRefList(q) : null;
      if(!r || !r.length){ toast('창 25 · 창세기 25:3 처럼 적어 주세요'); return; }
      go(r[0].bi, r[0].ci, r[0].from);
    }
    $('mpGo').onclick = typed;
    $('mpIn').addEventListener('keydown', function(e){ if(e.key === 'Enter') typed(); });
    return pick;
  }
  function paintPick(){
    [].forEach.call(pick.querySelectorAll('.mp-bk'), function(b){ b.classList.toggle('on', +b.dataset.bi === pk.bi); });
    var n = BOOKS[pk.bi] ? BOOKS[pk.bi].c : 0, h = '';
    for(var c = 0; c < n; c++) h += '<button type="button" data-ci="' + c + '"' + (c === pk.ci ? ' class="on"' : '') + '>' + (c + 1) + ' 장</button>';
    $('mpChs').innerHTML = h;
    var vn = X.verses ? X.verses(S.base, pk.bi, pk.ci).length : 0, v = '';
    for(var i = 0; i < vn; i++) v += '<button type="button" data-vi="' + i + '">' + (i + 1) + ' 절</button>';
    $('mpVs').innerHTML = v || '<div class="mp-none">본문 없음</div>';
    var on = pick.querySelector('.mp-bk.on'); if(on) on.scrollIntoView({ block:'center' });
    var oc = $('mpChs').querySelector('.on'); if(oc) oc.scrollIntoView({ block:'center' });
    $('mpVs').scrollTop = 0;
  }
  function openPick(){
    pickEl(); var st = APP.st || {};
    pk.bi = st.bi >= 0 ? st.bi : 0; pk.ci = st.ci >= 0 ? st.ci : 0;
    paintPick(); pick.hidden = false; document.body.classList.add('modal-open');
    $('mpIn').value = '';
  }
  function closePick(){ if(pick){ pick.hidden = true; document.body.classList.remove('modal-open'); } }
  function go(bi, ci, vi){ closePick(); APP.openChapter(bi, ci, vi); window.scrollTo(0, 0); var r = $('reader'); if(r && vi < 0) r.scrollTop = 0; }
  /* 옛 서랍(책·장 목록)을 열려는 단추는 목차로 */
  var nt = $('navToggle'); if(nt) nt.addEventListener('click', function(e){ if(narrow.matches){ e.stopImmediatePropagation(); e.preventDefault(); if(S.showNav) toggleNav(); openPick(); } }, true);

  /* ── 더보기: 메뉴 묶음 시트 ── */
  var more = null;
  function openMore(){
    if(!more){
      more = document.createElement('div'); more.id = 'moMore'; more.hidden = true;
      more.innerHTML = '<div class="mm-sheet"><div class="mm-head"><b>더보기</b><button type="button" class="mp-x" id="mmClose" aria-label="닫기">✕</button></div><div class="mm-grid" id="mmGrid"></div></div>';
      document.body.appendChild(more);
      more.addEventListener('click', function(e){ if(e.target === more) closeMore(); });
      $('mmClose').onclick = closeMore;
      var grid = $('mmGrid'), rows = [
        ['📖', '책 개관', function(){ var b = $('introBtn'); if(b) b.click(); }],
        ['🌍', '지도·고고학 표시', function(){ var b = $('geoBtn'); if(b) b.click(); }],
        ['📋', '본문 복사', function(){ var b = $('copyBtn'); if(b) b.click(); }],
        ['🔤', '스테판 원어 성경', function(){ var b = $('stephBtn'); if(b && !b.hidden) b.click(); else toast('이 책은 원어 자료가 없습니다'); }],
        ['🎓', '원어 학습', function(){ APP.showView('vocab'); }],
        ['✨', '지식 그래프', function(){ if(window.KG) KG.open(); }],
        ['🖍', '형광펜 모아 보기', function(){ APP.showView('notes'); if(window.NT) NT.setMode('hl'); }],
        ['A−', '글자 작게', function(){ if(X.bumpFont) X.bumpFont(-1); }],
        ['A+', '글자 크게', function(){ if(X.bumpFont) X.bumpFont(1); }],
        ['🌓', '화면 색', function(){ if(X.cycleTheme) X.cycleTheme(); }],
        ['⚙', '설정', function(){ APP.showView('settings'); }],
        ['🔄', '업데이트 확인', function(){ if(window.UPD) UPD.manual(); }]
      ];
      grid.innerHTML = rows.map(function(r, i){ return '<button type="button" class="mm-it" data-i="' + i + '"><span class="mm-ic">' + r[0] + '</span>' + esc(r[1]) + '</button>'; }).join('');
      /* 데스크탑 메뉴 묶음도 그대로 (편집·이동·찾기·학습·성경연구·보기·본문성경·환경설정·도움말) */
      var mb = [].slice.call(document.querySelectorAll('#menubar .mb-item')).filter(function(b){ return !b.hidden; });
      if(mb.length){
        grid.insertAdjacentHTML('beforeend', '<div class="mm-sub">전체 메뉴</div>' + mb.map(function(b, i){ return '<button type="button" class="mm-it mm-menu" data-m="' + i + '">' + esc(b.textContent.replace(/\(.\)$/, '')) + '</button>'; }).join(''));
      }
      grid.addEventListener('click', function(e){
        var it = e.target.closest('.mm-it'); if(!it) return;
        closeMore();
        if(it.dataset.m !== undefined){ var b = mb[+it.dataset.m]; if(b){ b.click(); } return; }
        rows[+it.dataset.i][2]();
      });
    }
    more.hidden = false;
  }
  function closeMore(){ if(more) more.hidden = true; }

  /* ── 둥근 단추·아래 탭 ── */
  var fab = document.createElement('div'); fab.id = 'moFab';
  fab.innerHTML = [['note', '📝', '메모', function(){ APP.showView('notes'); }],
                   ['lex', 'א', '원어\n학습', function(){ APP.showView('vocab'); }],
                   ['map', '🗺', '지도', function(){ if(window.ATLAS){ var st = APP.st; if(st.bi >= 0) ATLAS.openFor(st.bi, st.ci, Math.max(0, st.vi)); else ATLAS.openIndex(); } }],
                   ['kg', '✨', '그래프', function(){ if(window.KG) KG.open(); }]]
    .map(function(b){ return '<button type="button" class="mo-fab ' + b[0] + '" data-k="' + b[0] + '"><span class="ic">' + b[1] + '</span><span class="lb">' + esc(b[2]).replace(/\n/g, '<br>') + '</span></button>'; }).join('');
  document.body.appendChild(fab);
  fab.addEventListener('click', function(e){ var b = e.target.closest('.mo-fab'); if(!b) return; ({ note:function(){ APP.showView('notes'); }, lex:function(){ APP.showView('vocab'); }, map:function(){ if(window.ATLAS){ var st = APP.st; if(st.bi >= 0) ATLAS.openFor(st.bi, st.ci, Math.max(0, st.vi)); else ATLAS.openIndex(); } }, kg:function(){ if(window.KG) KG.open(); } })[b.dataset.k](); });

  var tabs = document.createElement('nav'); tabs.id = 'moTabs';
  tabs.innerHTML = [['read', '📖', '성경'], ['search', '🔍', '찾기'], ['notes', '📝', '메모'], ['atlas', '🗺', '지도'], ['more', '☰', '더보기']]
    .map(function(t){ return '<button type="button" class="mo-tab" data-t="' + t[0] + '"><span class="ic">' + t[1] + '</span><span class="lb">' + t[2] + '</span></button>'; }).join('');
  document.body.appendChild(tabs);
  tabs.addEventListener('click', function(e){
    var b = e.target.closest('.mo-tab'); if(!b) return;
    var t = b.dataset.t;
    if(t === 'more') return openMore();
    if(t === 'atlas'){ if(window.ATLAS) ATLAS.openIndex(); return; }
    APP.showView(t);
  });
  function syncTabs(){ var v = (APP.st && APP.st.view) || 'read'; [].forEach.call(tabs.querySelectorAll('.mo-tab'), function(b){ b.classList.toggle('on', b.dataset.t === v); }); fab.hidden = v !== 'read'; }
  new MutationObserver(syncTabs).observe($('v-read'), { attributes:true, attributeFilter:['class'] });
  ['v-search', 'v-notes', 'v-vocab', 'v-settings'].forEach(function(id){ var el = $(id); if(el) new MutationObserver(syncTabs).observe(el, { attributes:true, attributeFilter:['class'] }); });
  syncTabs();

  /* ── 대조 성경: 절마다 쌓인 줄에 성경 이름을 붙인다 ── */
  function labelCols(){
    if(!narrow.matches) return;
    [].forEach.call(document.querySelectorAll('#reader .cols'), function(cols){
      var names = [].map.call(cols.querySelectorAll('.colhead:not(.gutter)'), function(h){ return h.textContent; });
      [].forEach.call(cols.querySelectorAll('.vrow'), function(row){
        [].forEach.call(row.querySelectorAll('.vcell'), function(c, i){ if(names[i] && !c.dataset.v) c.dataset.v = names[i]; });
      });
    });
  }
  if($('reader')) new MutationObserver(labelCols).observe($('reader'), { childList:true });
  labelCols();

  /* ── 학습·지도 창: 목록 칸과 글 칸 사이 손잡이 — 잡고 끌면 칸 높이가 바뀌고, 톡 누르면 접었다 편다 ── */
  function splitHandle(side, o){
    if(!side || side._grip) return;
    var grip = document.createElement('div'); grip.className = 'mo-grip'; grip.innerHTML = '<i></i>'; side._grip = grip;
    if(o.after) side.parentNode.insertBefore(grip, side.nextSibling); else side.parentNode.insertBefore(grip, side);
    function minH(){ var k = o.keep ? side.querySelector(o.keep) : null; return k ? Math.ceil(k.getBoundingClientRect().bottom - side.getBoundingClientRect().top + 8) : 40; }
    function maxH(){ return Math.round(side.parentNode.getBoundingClientRect().height * .85); }
    function setH(h){ side.style.setProperty('--sd', Math.max(minH(), Math.min(maxH(), h)) + 'px'); }
    var d = null;
    grip.addEventListener('touchstart', function(e){ var t = e.touches[0]; d = { y:t.clientY, h:side.getBoundingClientRect().height, moved:false }; }, { passive:true });
    grip.addEventListener('touchmove', function(e){ if(!d) return; var dy = e.touches[0].clientY - d.y; if(Math.abs(dy) > 4) d.moved = true; setH(o.after ? d.h + dy : d.h - dy); e.preventDefault(); }, { passive:false });
    grip.addEventListener('touchend', function(){ if(d && !d.moved) toggle(); d = null; });
    grip.addEventListener('click', function(e){ if(!('ontouchstart' in window)) toggle(); });
    function toggle(){ var h = side.getBoundingClientRect().height; setH(h <= minH() + 4 ? Math.round(window.innerHeight * .38) : minH()); side.scrollTop = 0; }
    side._collapse = function(){ setH(minH()); side.scrollTop = 0; };
  }
  function armSplits(){
    if(!narrow.matches) return;
    var st = $('stSide'); if(st && st.parentNode) splitHandle(st, { after:true, keep:'.st-parts' });
    var at = document.querySelector('#atlasModal .at-side'); if(at) splitHandle(at, { after:false });
  }
  var stm = $('studyModal');
  if(stm){
    new MutationObserver(function(){ if(!stm.hidden) setTimeout(function(){ armSplits(); var sd = $('stSide'), b = $('stBody'); if(narrow.matches && sd && sd._collapse && b && b.children.length) sd._collapse(); }, 50); }).observe(stm, { attributes:true, attributeFilter:['hidden'] });
    var stBody = $('stBody');
    if(stBody) new MutationObserver(function(){ var sd = $('stSide'); if(narrow.matches && sd && sd._collapse && !stm.hidden) sd._collapse(); }).observe(stBody, { childList:true });   /* 글을 열면 목록을 접어 읽는 칸을 넓힌다 */
  }
  var atm = $('atlasModal');
  if(atm) new MutationObserver(function(){ if(!atm.hidden) setTimeout(armSplits, 50); }).observe(atm, { attributes:true, attributeFilter:['hidden'] });

  /* ── 좌우로 밀어 앞·뒤 장 ── */
  var sw = null, reader = $('reader');
  if(reader){
    reader.addEventListener('touchstart', function(e){ if(e.touches.length === 1) sw = { x:e.touches[0].clientX, y:e.touches[0].clientY, t:Date.now() }; }, { passive:true });
    reader.addEventListener('touchend', function(e){
      if(!sw) return; var t = e.changedTouches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y, dt = Date.now() - sw.t; sw = null;
      if(dt > 600 || Math.abs(dx) < 90 || Math.abs(dy) > 60 || !narrow.matches) return;
      var sel = window.getSelection(); if(sel && String(sel).trim()) return;
      if(X.step){ X.step(dx < 0 ? 1 : -1); reader.scrollTop = 0; window.scrollTo(0, 0); }
    }, { passive:true });
  }

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
      tgt.dispatchEvent(new MouseEvent('contextmenu', { bubbles:true, cancelable:true, clientX:t.clientX, clientY:t.clientY, button:2 }));
    }, 550);
  }, { passive:true });
  document.addEventListener('touchmove', clearLP, { passive:true });
  document.addEventListener('touchend', function(e){ clearLP(); if(lpFired){ e.preventDefault(); lpFired = false; } }, { passive:false });
  document.addEventListener('touchcancel', clearLP, { passive:true });
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
      if(!narrow.matches || Date.now() - lastCM < 400) return;
      var el = e.target.closest ? e.target.closest('.hw, .gw, .eng') : null; if(!el) return;
      var sel = window.getSelection(); if(sel && String(sel).trim()) return;
      var info = infoFromEvent ? infoFromEvent(e) : null; if(!info) return;
      if(fillWordBox){ fillWordBox(info); wb.hidden = false; wb.classList.add('mo-on'); }
    });
  }

  /* ── 뒤로 단추: 창이 열려 있으면 닫고, 아니면 앞 화면으로 ── */
  function trap(){ try{ history.pushState({ modu:1 }, ''); }catch(e){} }
  trap();
  window.addEventListener('popstate', function(){
    trap();
    if(pick && !pick.hidden){ closePick(); return; }
    if(more && !more.hidden){ closeMore(); return; }
    if(S.showNav && narrow.matches){ toggleNav(); return; }
    var mp = $('menupop'); if(mp && !mp.hidden){ document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); return; }
    if(wb && wb.classList.contains('mo-on')){ wb.classList.remove('mo-on'); return; }
    if(document.querySelector('.cmenu')){ if(window.APP && APP.closeCMenu) APP.closeCMenu(); return; }
    var upd = document.querySelector('.upd-ov'); if(upd && !upd.hidden){ document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); return; }
    if(anyPopupOpen && anyPopupOpen()){ document.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true })); return; }
    if(goBackToRead) goBackToRead();
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
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function(){});
  window.MODU_UI = { openPick:openPick, openMore:openMore };
})();
