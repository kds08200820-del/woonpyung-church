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
    var home = document.createElement('a'); home.className = 'mo-home'; home.href = '../'; home.title = '운평장로교회 홈페이지로';
    home.innerHTML = '<img src="../images/icon-192.png" alt="운평장로교회">';
    vh.insertBefore(home, vh.firstChild);
    title.classList.add('mo-title'); title.setAttribute('role', 'button');
    title.addEventListener('click', function(){ if(narrow.matches) openPick(); });
    var icons = document.createElement('div'); icons.className = 'mo-icons';
    icons.innerHTML =
      '<button type="button" class="mo-ib mo-fs" id="moFsDown" title="글자 작게">A−</button>' +
      '<button type="button" class="mo-ib mo-fs" id="moFsUp" title="글자 크게">A+</button>' +
      '<button type="button" class="mo-ib" id="moVerBtn" title="대조 성경"><svg viewBox="0 0 24 24"><path d="M4 5h6a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4z"/><path d="M20 5h-6a3 3 0 0 0-3 3v11a2 2 0 0 1 2-2h7z"/></svg><span class="mo-cnt" id="moVerCnt"></span></button>' +
      '<button type="button" class="mo-ib" id="moSearchBtn" title="찾기"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></button>' +
      '<button type="button" class="mo-ib" id="moMoreBtn" title="더보기"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button>';
    vh.appendChild(icons);
    $('moFsDown').onclick = function(){ if(X.bumpFont) X.bumpFont(-1); };
    $('moFsUp').onclick = function(){ if(X.bumpFont) X.bumpFont(1); };
    $('moVerBtn').onclick = function(e){ e.stopPropagation(); var b = $('verBtn'); if(b) b.click(); };   /* 문서 click 이 드롭다운을 곧바로 닫지 않도록 */
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
        ['🔤', '스테판 원어 성경', function(){ if(!window.STEPH) return toast('원어 자료를 읽지 못했습니다'); STEPH.setOn(!STEPH.active()); toast(STEPH.active() ? '스테판 원어 성경으로 봅니다 — 본문 위 줄에서 보일 항목을 고르세요' : '일반 본문으로 돌아왔습니다'); }],
        ['🎓', '원어 학습', function(){ APP.showView('vocab'); }],
        ['✨', '지식 그래프', function(){ if(window.KG) KG.open(); }],
        ['🖍', '형광펜 모아 보기', function(){ APP.showView('notes'); if(window.NT) NT.setMode('hl'); }],
        ['A−', '글자 작게', function(){ if(X.bumpFont) X.bumpFont(-1); }],
        ['A+', '글자 크게', function(){ if(X.bumpFont) X.bumpFont(1); }],
        ['🌓', '화면 색', function(){ if(X.cycleTheme) X.cycleTheme(); }],
        ['⚙', '설정', function(){ APP.showView('settings'); }],
        ['🔄', '업데이트 확인', function(){ if(window.UPD) UPD.manual(); }],
        ['📲', '홈 화면에 설치', function(){ doInstall(); }]
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

  /* ── 절 고르기: 절을 톡 누르면 골라진다(여러 절 가능). 오른쪽 둥근 단추가 고른 절에 작용한다 ── */
  var SEL = {};                                  /* "bi:ci:vi" → true */
  function selKeys(){ return Object.keys(SEL); }
  function paintSel(){ [].forEach.call(document.querySelectorAll('#reader .vpara[data-b], #reader .vrow[data-b]'), function(r){ r.classList.toggle('mo-sel', !!SEL[r.dataset.b + ':' + r.dataset.c + ':' + r.dataset.v]); }); fab.classList.toggle('has-sel', selKeys().length > 0); }
  function clearSel(){ SEL = {}; paintSel(); }
  function selGroups(){
    var ks = selKeys().map(function(k){ var a = k.split(':').map(Number); return { bi:a[0], ci:a[1], vi:a[2] }; }).sort(function(x, y){ return x.bi - y.bi || x.ci - y.ci || x.vi - y.vi; });
    var out = [], cur = null;
    ks.forEach(function(v){ if(cur && cur.bi === v.bi && cur.ci === v.ci && v.vi === cur.to + 1){ cur.to = v.vi; return; } cur = { bi:v.bi, ci:v.ci, from:v.vi, to:v.vi }; out.push(cur); });
    out.forEach(function(g){ g.label = BOOKS[g.bi].n + ' ' + (g.ci + 1) + ':' + (g.from + 1) + (g.to > g.from ? '-' + (g.to + 1) : ''); });
    return out;
  }
  function target(){ var g = selGroups(); if(g.length) return g; var st = APP.st; if(st.bi < 0) return []; var vi = st.vi >= 0 ? st.vi : 0; return [{ bi:st.bi, ci:st.ci, from:vi, to:vi, label:BOOKS[st.bi].n + ' ' + (st.ci + 1) + ':' + (vi + 1) }]; }
  var reader0 = $('reader');
  if(reader0){
    reader0.addEventListener('click', function(e){
      if(!narrow.matches || Date.now() - lastCM < 400) return;
      if(e.target.closest('a, button, input, select, .wpop, .morph, .hw, .gw, .eng, .stw')) return;
      var sel = window.getSelection(); if(sel && String(sel).trim()) return;
      var row = e.target.closest('.vpara[data-b], .vrow[data-b], .vrow .vcell'); if(!row) return;
      if(row.classList.contains('vcell')) row = row.closest('.vrow'); if(!row || row.dataset.b === undefined) return;
      var k = row.dataset.b + ':' + row.dataset.c + ':' + row.dataset.v;
      if(row.classList.contains('vhit') && !SEL[k]){ row.classList.remove('vhit'); if(APP.st) APP.st.vi = -1; paintSel(); return; }   /* 찾기·목차로 와서 미리 표시된 절은 한 번 누르면 풀린다 */
      if(SEL[k]) delete SEL[k]; else SEL[k] = true;
      paintSel();
    });
    new MutationObserver(function(){ var st = APP.st; var keep = {}; selKeys().forEach(function(k){ if(k.indexOf(st.bi + ':' + st.ci + ':') === 0) keep[k] = true; }); SEL = keep; paintSel(); }).observe(reader0, { childList:true });
  }

  /* ── 오른쪽 둥근 단추: 색연필 · 복사 · 주석 · 지도 ── */
  var HLC = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'], hlColor = 'yellow';
  try{ hlColor = localStorage.getItem('modu.hlColor') || 'yellow'; }catch(e){}
  var fab = document.createElement('div'); fab.id = 'moFab';
  fab.innerHTML = '<button type="button" class="mo-fab pen" data-k="pen"><span class="ic">🖍</span><span class="lb">색연필</span><i class="dot"></i></button>' +
                  '<button type="button" class="mo-fab copy" data-k="copy"><span class="ic">📋</span><span class="lb">복사</span></button>' +
                  '<button type="button" class="mo-fab comm" data-k="comm"><span class="ic">📖</span><span class="lb">주석</span></button>' +
                  '<button type="button" class="mo-fab map" data-k="map"><span class="ic">🗺</span><span class="lb">지도</span></button>';
  document.body.appendChild(fab);
  var pen = fab.querySelector('.pen');
  function paintPen(){ pen.className = 'mo-fab pen hl-' + hlColor; pen.title = '색연필 — ' + (window.HL && HL.nameOf ? HL.nameOf(hlColor) : ''); }
  paintPen();
  function doPen(){
    if(!window.HL || !HL.setColor) return toast('형광펜을 쓸 수 없습니다');
    var gs = target(); if(!gs.length) return toast('절을 먼저 고르세요');
    var allOn = gs.every(function(g){ for(var v = g.from; v <= g.to; v++) if(HL.currentColor({ bi:g.bi, ci:g.ci, from:v }) !== hlColor) return false; return true; });
    gs.forEach(function(g){ HL.setColor(g, allOn ? null : hlColor); });   /* 이미 그 색이면 지운다 */
    clearSel();
  }
  function doCopy(){
    var gs = target(); if(!gs.length) return toast('절을 먼저 고르세요');
    var vs = [{ id:S.base, name:APP.vname() }], text = (APP.copyText ? APP.copyText(vs, gs) : '') || '';
    if(!text) return toast('복사할 본문이 없습니다');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function(){ toast(gs.map(function(g){ return g.label; }).join(', ') + ' 복사됨'); clearSel(); }, function(){ toast('복사하지 못했습니다'); });
  }
  function doComm(){
    var gs = target(); if(!gs.length) return toast('절을 먼저 고르세요');
    var g = gs[0];
    if(X.openComm) X.openComm(g.bi, g.ci, g.from);                     /* 오른쪽 단추 메뉴의 '주석 보기'와 같은 길 */
    else { var hits = APP.commHits ? APP.commHits(g.bi, g.ci, g.from) : []; if(!hits || !hits.length) return toast('이 절에는 주석이 없습니다'); APP.showComm(g.bi, g.ci, g.from, hits); }
  }
  function doMap(){ var gs = target(); if(!window.ATLAS) return; if(!gs.length) return ATLAS.openIndex(); var g = gs[0]; ATLAS.openFor(g.bi, g.ci, g.from); }
  /* 색 고르기: 색연필을 길게 누르면 타원 팔레트가 부드럽게 튀어나온다 */
  var pal = document.createElement('div'); pal.id = 'moPal'; pal.hidden = true;
  pal.innerHTML = HLC.map(function(c){ return '<button type="button" class="pal-c hl-' + c + '" data-c="' + c + '"></button>'; }).join('') + '<button type="button" class="pal-x" data-c="" title="지우기">✕</button>';
  document.body.appendChild(pal);
  function palOpen(){
    [].forEach.call(pal.querySelectorAll('.pal-c'), function(b){ b.classList.toggle('on', b.dataset.c === hlColor); b.title = window.HL && HL.nameOf ? HL.nameOf(b.dataset.c) : b.dataset.c; });
    var r = pen.getBoundingClientRect();
    pal.style.top = (r.top + r.height / 2) + 'px'; pal.style.right = (window.innerWidth - r.left + 8) + 'px';
    pal.hidden = false; requestAnimationFrame(function(){ pal.classList.add('open'); });
  }
  function palClose(){ pal.classList.remove('open'); setTimeout(function(){ if(!pal.classList.contains('open')) pal.hidden = true; }, 220); }
  pal.addEventListener('click', function(e){
    var b = e.target.closest('button'); if(!b) return;
    e.stopPropagation();
    if(b.dataset.c){ hlColor = b.dataset.c; try{ localStorage.setItem('modu.hlColor', hlColor); }catch(err){} paintPen(); palClose(); if(selKeys().length) doPen(); else toast('색연필 · ' + (window.HL && HL.nameOf ? HL.nameOf(hlColor) : hlColor)); }
    else { var gs = target(); if(gs.length && window.HL && HL.setColor) gs.forEach(function(g){ HL.setColor(g, null); }); clearSel(); palClose(); }
  });
  document.addEventListener('click', function(e){ if(!pal.hidden && !e.target.closest('#moPal') && !e.target.closest('.pen')) palClose(); });
  var penT = null, penLong = false;
  pen.addEventListener('touchstart', function(){ penLong = false; clearTimeout(penT); penT = setTimeout(function(){ penLong = true; try{ navigator.vibrate && navigator.vibrate(10); }catch(e){} palOpen(); }, 420); }, { passive:true });
  pen.addEventListener('touchend', function(e){ clearTimeout(penT); if(penLong){ e.preventDefault(); setTimeout(function(){ penLong = false; }, 300); } }, { passive:false });
  pen.addEventListener('touchmove', function(){ clearTimeout(penT); }, { passive:true });
  pen.addEventListener('contextmenu', function(e){ e.preventDefault(); palOpen(); });
  fab.addEventListener('click', function(e){
    var b = e.target.closest('.mo-fab'); if(!b || penLong) return;
    ({ pen:doPen, copy:doCopy, comm:doComm, map:doMap })[b.dataset.k]();
  });

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
    function toggle(){
      var h = side.getBoundingClientRect().height, mid = Math.round(window.innerHeight * .38);
      if(o.big){ setH(h < maxH() - 4 ? maxH() : mid); }                    /* 지도 해설: 톡 누르면 크게 ↔ 보통 */
      else setH(h <= minH() + 4 ? mid : minH());                              /* 학습 목록: 접기 ↔ 보통 */
      side.scrollTop = 0;
    }
    side._collapse = function(){ setH(minH()); side.scrollTop = 0; };
  }
  function armSplits(){
    if(!narrow.matches) return;
    var st = $('stSide'); if(st && st.parentNode) splitHandle(st, { after:true, keep:'.st-parts' });
  }
  var stm = $('studyModal');
  if(stm){
    new MutationObserver(function(){ if(!stm.hidden) setTimeout(function(){ armSplits(); var sd = $('stSide'), b = $('stBody'); if(narrow.matches && sd && sd._collapse && b && b.children.length) sd._collapse(); }, 50); }).observe(stm, { attributes:true, attributeFilter:['hidden'] });
    var stBody = $('stBody');
    if(stBody) new MutationObserver(function(){ var sd = $('stSide'); if(narrow.matches && sd && sd._collapse && !stm.hidden) sd._collapse(); }).observe(stBody, { childList:true });   /* 글을 열면 목록을 접어 읽는 칸을 넓힌다 */
  }

  /* ── 지도 창 '본문으로': 절에서 연 게 아니면 그냥 닫고 본문으로 · 학습 창 '← 뒤로': 앞 글이 없으면 닫는다 ── */
  var agv = $('atGoVerse');
  if(agv) agv.addEventListener('click', function(){ setTimeout(function(){ var m = $('atlasModal'); if(m && !m.hidden && window.ATLAS){ ATLAS.close(); APP.showView('read'); } }, 0); });
  var stBack = $('stBack');
  if(stBack){
    /* 앞 글이 없어 비활성일 때 그 자리를 누르면 학습 창을 닫고 본문으로 (비활성 단추는 click 을 내지 않으므로 손가락 위치로 본다) */
    var head = stBack.parentNode;
    head.addEventListener('touchend', function(e){
      if(!stBack.disabled || !narrow.matches) return;
      var t = e.changedTouches[0], r = stBack.getBoundingClientRect();
      if(t.clientX >= r.left - 6 && t.clientX <= r.right + 6 && t.clientY >= r.top - 6 && t.clientY <= r.bottom + 6){ e.preventDefault(); var c = $('stClose'); if(c) c.click(); APP.showView('read'); }
    }, { passive:false });
    head.addEventListener('click', function(e){
      if(!stBack.disabled || !narrow.matches) return;
      var r = stBack.getBoundingClientRect();
      if(e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6){ var c = $('stClose'); if(c) c.click(); APP.showView('read'); }
    });
  }
  /* 3D 그림 → '평면 그림' 단추 */
  new MutationObserver(function(ms){ ms.forEach(function(m){ [].forEach.call(m.addedNodes, function(n){
    if(n.nodeType !== 1 || !n.classList || !n.classList.contains('st-3dbox')) return;
    var tools = n.querySelector('.st-3dtools'); if(!tools || tools.querySelector('.mo-2d')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn mo-2d'; b.textContent = '평면 그림';
    b.onclick = function(e){ e.stopPropagation(); try{ if(window.TERRAIN3D) TERRAIN3D.hide(); }catch(err){} var host = n.parentNode; n.remove(); var pv = host && host.querySelector('.st-preview'); if(pv) pv.hidden = false; };
    tools.insertBefore(b, tools.firstChild.nextSibling);
    var hint = tools.querySelector('.st-3dhint'); if(hint) hint.textContent = '한 손가락: 돌리기 · 두 손가락: 확대·옮기기';
  }); }); }).observe(document.body, { childList:true, subtree:true });

  /* ── 지도(평면도): 한 손가락 끌기 = 옮기기, 두 손가락 = 확대·축소 (마우스·휠 사건으로 바꿔 넣는다) ── */
  (function(){
    var cv = $('atCanvas'); if(!cv) return;
    var pinch = null, one = null;
    function mouse(type, x, y, target){ (target || cv).dispatchEvent(new MouseEvent(type, { bubbles:true, cancelable:true, clientX:x, clientY:y, button:0, buttons:type === 'mouseup' ? 0 : 1 })); }
    function mid(t){ return { x:(t[0].clientX + t[1].clientX) / 2, y:(t[0].clientY + t[1].clientY) / 2, d:Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) }; }
    cv.addEventListener('touchstart', function(e){
      if(e.touches.length === 1){ var t = e.touches[0]; one = { x:t.clientX, y:t.clientY }; mouse('mousedown', t.clientX, t.clientY); }
      else if(e.touches.length === 2){ var m = mid(e.touches); pinch = { d:m.d, acc:1 }; mouse('mouseup', m.x, m.y, window); mouse('mousedown', m.x, m.y); one = null; }
      e.preventDefault();
    }, { passive:false });
    cv.addEventListener('touchmove', function(e){
      if(e.touches.length === 2 && pinch){
        var m = mid(e.touches), ratio = m.d / pinch.d; pinch.d = m.d; pinch.acc *= ratio;
        mouse('mousemove', m.x, m.y);                                             /* 두 손가락 가운데를 따라 옮긴다 */
        while(pinch.acc > 1.09){ cv.dispatchEvent(new WheelEvent('wheel', { bubbles:true, cancelable:true, clientX:m.x, clientY:m.y, deltaY:-100 })); pinch.acc /= 1.18; }
        while(pinch.acc < 1 / 1.09){ cv.dispatchEvent(new WheelEvent('wheel', { bubbles:true, cancelable:true, clientX:m.x, clientY:m.y, deltaY:100 })); pinch.acc *= 1.18; }
      } else if(e.touches.length === 1 && one){ var t = e.touches[0]; mouse('mousemove', t.clientX, t.clientY); }
      e.preventDefault();
    }, { passive:false });
    function end(e){
      if(e.touches.length === 0){ var t = e.changedTouches[0]; mouse('mouseup', t.clientX, t.clientY, window); pinch = null; one = null; }
      else if(e.touches.length === 1 && pinch){ pinch = null; var t1 = e.touches[0]; mouse('mouseup', t1.clientX, t1.clientY, window); one = { x:t1.clientX, y:t1.clientY }; mouse('mousedown', t1.clientX, t1.clientY); }
      e.preventDefault();
    }
    cv.addEventListener('touchend', end, { passive:false });
    cv.addEventListener('touchcancel', end, { passive:false });
  })();

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
  /* 오른쪽 단추 메뉴에서 원어 듣기·학습 담기 항목은 뺀다 (모바일판에는 음성이 없다) */
  new MutationObserver(function(ms){ ms.forEach(function(m){ [].forEach.call(m.addedNodes, function(n){ if(n.nodeType === 1 && n.classList && n.classList.contains('cmenu')) [].forEach.call(n.querySelectorAll('button'), function(b){ if(/^🔊|원어 학습에 담기/.test(b.textContent.trim())) b.remove(); }); }); }); }).observe(document.body, { childList:true });
  /* 원어 학습 화면은 낱말 공부로 고정 */
  var lsWord = document.querySelector('#lsMode button[data-m="word"]'); if(lsWord && narrow.matches) setTimeout(function(){ lsWord.click(); }, 0);
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

  /* ── 홈 화면에 설치: 안드로이드는 설치 창을 바로 띄우고, 아이폰은 방법을 안내한다. 설치된 앱도 켤 때마다 로그인·정회원 확인을 거친다 ── */
  var deferred = null, standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
  function installBar(){
    if(standalone || $('moInstallBar')) return;
    try{ if(localStorage.getItem('modu.installLater') && Date.now() - (+localStorage.getItem('modu.installLater')) < 7 * 864e5) return; }catch(e){}
    var bar = document.createElement('div'); bar.id = 'moInstallBar';
    bar.innerHTML = '<img src="icon.png" alt=""><div class="t"><b>홈 화면에 설치</b><small>' + (ios ? '공유(⬆) → "홈 화면에 추가"를 누르세요' : '앱처럼 바로 열 수 있습니다') + '</small></div>' +
      (ios ? '' : '<button type="button" class="btn primary" id="moInstallGo">설치</button>') + '<button type="button" class="btn" id="moInstallX" aria-label="닫기">✕</button>';
    document.body.appendChild(bar);
    var go = $('moInstallGo'); if(go) go.onclick = doInstall;
    $('moInstallX').onclick = function(){ bar.remove(); try{ localStorage.setItem('modu.installLater', String(Date.now())); }catch(e){} };
  }
  function doInstall(){
    if(deferred){ deferred.prompt(); deferred.userChoice.then(function(){ deferred = null; var b = $('moInstallBar'); if(b) b.remove(); }); return; }
    toast(ios ? 'Safari 의 공유(⬆) 단추 → "홈 화면에 추가"를 누르세요' : '브라우저 메뉴(⋮)에서 "앱 설치" 또는 "홈 화면에 추가"를 누르세요');
  }
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); deferred = e; var b = $('moInstall'); if(b) b.hidden = false; if(narrow.matches) installBar(); });
  window.addEventListener('appinstalled', function(){ var b = $('moInstallBar'); if(b) b.remove(); toast('홈 화면에 설치되었습니다'); });
  if(ios && narrow.matches && !standalone) window.addEventListener('modu-opened', installBar, { once:true });
  window.MODU_INSTALL = doInstall;
  var about = $('aboutCard');
  if(about){
    var ib = document.createElement('button'); ib.type = 'button'; ib.className = 'btn primary'; ib.id = 'moInstall'; ib.textContent = '홈 화면에 설치'; ib.hidden = true;
    ib.onclick = doInstall; if(!standalone) ib.hidden = false;
    about.appendChild(ib);
  }

  /* ── 서비스 워커 ── */
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function(){});
  window.MODU_UI = { openPick:openPick, openMore:openMore };
})();
