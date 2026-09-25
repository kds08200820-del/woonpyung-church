/* ── 재생기 단추 (아래 재생기와 원어 읽기 창이 똑같은 모양을 쓴다) ── */
var IC = (function(){
  function sv(d, fill){ return '<svg viewBox="0 0 24 24" aria-hidden="true" ' + (fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') + '>' + d + '</svg>'; }
  return {
    prev:  sv('<path d="M19 19.5 9.5 12 19 4.5z"/><rect x="5" y="4.5" width="2.4" height="15" rx="1"/>', 1),
    next:  sv('<path d="M5 4.5 14.5 12 5 19.5z"/><rect x="16.6" y="4.5" width="2.4" height="15" rx="1"/>', 1),
    play:  sv('<path d="M8 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L9.6 3.9C8.9 3.5 8 4 8 4.8z"/>', 1),
    pause: sv('<rect x="6" y="4.5" width="4" height="15" rx="1.3"/><rect x="14" y="4.5" width="4" height="15" rx="1.3"/>', 1),
    again: sv('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
    echo:  sv('<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>'),
    loop:  sv('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
    rec:   sv('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4"/>'),
    mine:  sv('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>'),
    folder:sv('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
    speed: sv('<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>'),
    times: sv('<path d="m17 1 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M11 14h1v5"/>')
  };
})();
(function buildIpod(){
  var rates = ['0.3','0.4','0.5','0.6','0.7','0.8','0.9','1','1.15','1.3'];
  function b(p, id, ic, title, cls){ return '<button type="button" class="ip-b ' + (cls || '') + '" id="' + p + id + '" title="' + title + '" aria-label="' + title + '">' + IC[ic] + '</button>'; }
  document.querySelectorAll('.ip-trans[data-p]').forEach(function(el){
    var p = el.dataset.p;
    el.innerHTML = b(p,'Prev','prev','이전 절') + b(p,'Play','play','재생 · 멈춤 (Ctrl+Space)','play') + b(p,'Next','next','다음 절') + b(p,'Again','again','이 절 다시');
  });
  document.querySelectorAll('.ip-tools[data-p]').forEach(function(el){
    var p = el.dataset.p;
    el.innerHTML =
      b(p,'Echo','echo','따라 읽기 — 절마다 따라 읽을 만큼 쉬어 갑니다','tog') +
      b(p,'Loop','loop','구간 반복 — 끝까지 들으면 처음부터 다시','tog') +
      b(p,'Rec','rec','녹음 — 따라 읽는 내 목소리를 녹음해 저장합니다','tog rec') +
      '<span class="ip-sep"></span>' +
      b(p,'Mine','mine','내 녹음 듣기 (이 절)') +
      b(p,'RecDir','folder','녹음 폴더 열기') +
      '<span class="ip-sep"></span>' +
      '<label class="ip-pill" title="속도">' + IC.speed + '<select id="' + p + 'Rate">' +
        rates.map(function(r){ return '<option value="' + r + '">' + (r === '1' ? '1.0' : r) + '×</option>'; }).join('') + '</select></label>' +
      '<label class="ip-pill" title="절마다 몇 번 들을지">' + IC.times + '<select id="' + p + 'Repeat">' +
        [1,2,3,5].map(function(n){ return '<option value="' + n + '">' + n + '번</option>'; }).join('') + '</select></label>';
  });
})();
/* 성경 — 읽기·대조·검색
   데이터는 ../data/bible.js 에서 window.BIBLE 로 들어옵니다. */
(function(){
"use strict";

var B = window.BIBLE;
if(!B){
  document.getElementById('boot').innerHTML =
    '<div class="bootbox">성경 데이터를 읽지 못했습니다.<br>data 폴더의 bible.js 가 있는지 확인해 주세요.</div>';
  return;
}
var BOOKS = B.books, VERS = B.versions, TEXT = B.text;
var MORPH   = B.morph || null;
var MCODES  = MORPH ? MORPH.codes  : [];
var MLEMMAS = MORPH ? MORPH.lemmas : [];
var MWORDS  = MORPH ? MORPH.words  : [];

var APP_TITLE = (window.APPINFO && APPINFO.title) || '설교자의 성경';
var APP_VERSION = window.MODU && MODU.version || '3.6.2';        /* package.json 의 version 과 같이 올린다 */

var DICT = window.DICT || { lem:{}, ko:{} };     /* 영어 낱말 뜻·원형 */
var HEB  = window.HEB  || null;                  /* 히브리어 낱말별 스트롱 번호·형태 */
var GRKD = (window.GRK && window.GRK.d) || null;  /* 헬라어 스트롱 사전 */
var COMM = window.COMMENTARY || null;            /* 주석 (절 범위별 단락) */
var IPA  = (window.DICT && window.DICT.ipa) || {};  /* 영어 발음기호 */

/* 내가 적어 넣은 뜻 — 사전에 없는 낱말을 여기에 쌓는다 */
var MYKEY = 'bibleApp.mydict', myDict = {};
try{ myDict = JSON.parse(localStorage.getItem(MYKEY) || '{}') || {}; }catch(e){ myDict = {}; }
function saveMyDict(){ try{ localStorage.setItem(MYKEY, JSON.stringify(myDict)); }catch(e){} }
var ENG  = { nasb:1, kjv:1 };

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }

/* ─────────────── 설정 ─────────────── */
var SKEY = 'bibleApp.settings';
var DEFAULTS = {
  theme:'light', fs:17, lh:1.85, width:'normal',
  base:'gyr', extra:[], nonote:false, optNum:true, optSrc:true,
  showNav:true, font:'system', dictHover:true, hebAccent:false, bi:0, ci:0
};
var FONTS = {
  system:  { name:'맑은 고딕 (기본)', css:'"맑은 고딕","Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif' },
  myungjo: { name:'부크크명조',        css:'"Bookk Myungjo","맑은 고딕",serif' },
  gothic:  { name:'부크크고딕',        css:'"Bookk Gothic","맑은 고딕",sans-serif' }
};
var WIDTHS = { narrow:'860px', normal:'1180px', wide:'1600px' };
var THEMES = ['light','sepia','dark','navy'];
var S = (function(){
  var out = {};
  for(var k in DEFAULTS) out[k] = DEFAULTS[k];
  try{
    var raw = JSON.parse(localStorage.getItem(SKEY) || '{}');
    for(var k2 in DEFAULTS) if(raw[k2] !== undefined) out[k2] = raw[k2];
  }catch(e){}
  if(!vinfoOrNull(out.base)) out.base = DEFAULTS.base;
  if(!Array.isArray(out.extra)) out.extra = [];
  out.extra = out.extra.filter(function(id){ return id !== out.base && !!vinfoOrNull(id); });
  if(THEMES.indexOf(out.theme) < 0) out.theme = 'light';
  if(!FONTS[out.font]) out.font = 'system';
  if(!(out.bi >= 0 && out.bi < BOOKS.length)) out.bi = 0;
  if(!(out.ci >= 0 && out.ci < BOOKS[out.bi].c)) out.ci = 0;
  return out;
})();
function saveSettings(){
  try{ localStorage.setItem(SKEY, JSON.stringify(S)); }catch(e){}
}
function applySettings(){
  var d = document.documentElement;
  d.setAttribute('data-theme', S.theme);
  d.style.setProperty('--fs', S.fs + 'px');
  d.style.setProperty('--lh', S.lh);
  d.style.setProperty('--maxw', WIDTHS[S.width] || WIDTHS.normal);
  d.style.setProperty('--bodyfont', (FONTS[S.font] || FONTS.system).css);
  $('booknav').hidden = !S.showNav;
  $('navToggle').classList.toggle('on', !!S.showNav);
}

/* ─────────────── 역본 ─────────────── */
function vinfoOrNull(id){
  for(var i=0;i<VERS.length;i++) if(VERS[i].id === id) return VERS[i];
  return null;
}
function vinfo(id){ return vinfoOrNull(id) || VERS[0]; }
/* 기본 성경이 늘 첫 단, 그 뒤에 대조로 고른 성경들이 원래 차례대로 붙는다 */
function activeVersions(){
  var out = [vinfo(S.base)];
  VERS.forEach(function(v){ if(v.id !== S.base && S.extra.indexOf(v.id) >= 0) out.push(v); });
  return out;
}
/* 헬라어는 신약에만, 히브리어는 구약에만 있다 */
function hasBook(v,bi){
  if(v.nt && BOOKS[bi].t === 0) return false;
  if(v.ot && BOOKS[bi].t === 1) return false;
  return true;
}
function versionsFor(bi){
  return activeVersions().filter(function(v){ return hasBook(v,bi); });
}
/* 히브리어(마소라 본문)는 시편 표제를 한 절로 세는 등 절 번호가 다를 때가 있다 */
function mtNote(bi,ci,vs){
  if(vs.length < 2) return '';
  var he = null, i;
  for(i=0;i<vs.length;i++) if(vs[i].ot){ he = vs[i]; break; }
  if(!he || he === vs[0]) return '';
  var a = verses(vs[0].id,bi,ci).length, b = verses(he.id,bi,ci).length;
  if(!a || !b || a === b) return '';
  return '<div class="gnote">이 장은 <b>' + esc(he.name) + '</b>의 절 나눔이 ' + esc(vs[0].name) +
         '과 다릅니다 — 마소라 본문 ' + b + '절, ' + esc(vs[0].name) + ' ' + a +
         '절. 시편 표제처럼 한 절씩 밀릴 수 있으니 절 번호를 함께 확인해 주세요.</div>';
}

/* ─────────────── 본문 손질 ─────────────── */
var BRK = String.fromCharCode(1);               // 문단 나눔 자리표시
function clean(s){
  if(!S.nonote) return s;
  return s.replace(/\([a-z](?:[\s,][^)]*)?\)/g,'')
          .replace(/(^|[\s(“"'])[a-z](?=[가-힣])/g,'$1')
          .replace(/\s{2,}/g,' ').trim();
}
function split(s){          // <소제목>·{표제} 와 ○ 문단표시를 본문에서 떼어 낸다
  var head = '', para = false, m = s.match(/^<([^>]*)>\s*/) || s.match(/^\{([^}]*)\}\s*/);
  if(m){ head = m[1]; s = s.slice(m[0].length); }
  if(s.charAt(0) === '○'){ para = true; s = s.replace(/^○\s*/,''); }
  s = s.replace(/\s*○\s*/g, BRK);
  return { head:head, para:para, text:clean(s) };
}
function htmlText(s){ return esc(s).split(BRK).join('<span class="pbrk"></span>'); }
/* 히브리어 성경 기호(U+0591~U+05AF)는 글꼴에 없으면 네모로 보이므로 기본으로 감춘다 */
function heb(t){ return S.hebAccent ? t : String(t || '').replace(/[\u0591-\u05AF]/g, ''); }
function flat(s){ return s.split(BRK).join(' '); }
function ref(bi,ci,vi){ return BOOKS[bi].n + ' ' + (ci+1) + ':' + (vi+1); }
function verses(vid,bi,ci){ var b = TEXT[vid][bi]; return (b && b[ci]) || []; }
function lastVerse(bi,ci){
  var n = 0;
  VERS.forEach(function(v){ var l = verses(v.id,bi,ci).length; if(l > n) n = l; });
  return n - 1;
}

/* ─────────────── 상태 ─────────────── */
var st = { view:'read', mode:'chapter', bi:S.bi, ci:S.ci, vi:-1, passages:[], hits:[], sel:-1 };

/* ─────────────── 화면 전환 ─────────────── */
var VIEWS = { read:'v-read', search:'v-search', vocab:'v-vocab', notes:'v-notes', settings:'v-settings' };
var viewHist = [];                      /* 화면 이동 내력 — 뒤로 가기 (검색 결과 → 본문 → 뒤로 → 검색 결과) */
function showView(name, isBack){
  if(!VIEWS[name]) name = 'read';
  if(!isBack && st.view && st.view !== name){ viewHist.push(st.view); if(viewHist.length > 30) viewHist.shift(); }
  st.view = name;
  for(var k in VIEWS) $(VIEWS[k]).classList.toggle('on', k === name);
  document.querySelectorAll('.rnav[data-view]').forEach(function(b){
    b.classList.toggle('on', b.dataset.view === name);
  });
  if(name === 'search') setTimeout(function(){ $('q').focus(); $('q').select(); }, 0);
  if(name === 'vocab'){ if(lsMode === 'word') paintVocab(); else paintLessons(); }
  if(name === 'settings') refreshAudioInfo();
  if(name === 'notes' && window.NT) NT.show();
  closeMorph(); closeDrops();
}
document.querySelectorAll('.rnav[data-view]').forEach(function(b){
  b.onclick = function(){ showView(b.dataset.view); };
});
$('navToggle').onclick = function(){ toggleNav(); };
function toggleNav(){
  S.showNav = !S.showNav;
  saveSettings(); applySettings(); syncSettingsUI();
  if(S.showNav) scrollNavIntoView();
}

/* ─────────────── 왼쪽 책·장 목록 ─────────────── */
function buildBookNav(){
  var box = $('bnBooks'), out = [];
  function grid(t, label){
    var cls = t === 0 ? 'ot' : 'nt';
    var g = ['<div class="bn-sec ' + cls + '">' + label + '</div><div class="bn-grid">'];
    BOOKS.forEach(function(b,i){
      if(b.t !== t) return;
      g.push('<button type="button" class="' + cls + '" data-bi="' + i + '" title="' +
             esc(b.n) + ' (' + b.c + '장)">' + esc(b.a) + '</button>');
    });
    g.push('</div>');
    return g.join('');
  }
  out.push(grid(0, '구약'));
  out.push(grid(1, '신약'));
  box.innerHTML = out.join('');
  box.querySelectorAll('button').forEach(function(el){
    el.onclick = function(){
      var bi = +el.dataset.bi;
      openChapter(bi, (bi === st.bi ? st.ci : 0), -1);
    };
  });
}
function buildChapNav(){
  var box = $('bnChaps'), bi = st.bi;
  if(bi < 0){ box.innerHTML = '<div class="bn-empty">책을 고르세요</div>'; return; }
  var out = ['<div class="bn-grid">'];
  for(var c=0;c<BOOKS[bi].c;c++){
    out.push('<button type="button" data-ci="' + c + '"' + (c === st.ci ? ' class="on"' : '') + '>' + (c+1) + '</button>');
  }
  out.push('</div>');
  box.innerHTML = out.join('');
  $('bnChapHead').textContent = BOOKS[bi].a + ' · ' + BOOKS[bi].c + '장';
  box.querySelectorAll('button').forEach(function(el){
    el.onclick = function(){ openChapter(st.bi, +el.dataset.ci, -1); };
  });
}
function syncBookNav(){
  $('bnBooks').querySelectorAll('button').forEach(function(el){
    el.classList.toggle('on', +el.dataset.bi === st.bi);
  });
  $('booknav').dataset.t = (st.bi >= 0 ? BOOKS[st.bi].t : 0);
  buildChapNav();
}
function scrollNavIntoView(){
  var b = $('bnBooks').querySelector('button.on');
  if(b) b.scrollIntoView({block:'nearest'});
  var c = $('bnChaps').querySelector('button.on');
  if(c) c.scrollIntoView({block:'nearest'});
}

/* ─────────────── 본문 읽기 ─────────────── */
function openChapter(bi,ci,vi){
  st.mode = 'chapter'; st.bi = bi; st.ci = ci; st.vi = (vi === undefined ? -1 : vi);
  S.bi = bi; S.ci = ci; saveSettings();
  render();
  syncBookNav();
  scrollNavIntoView();
  showView('read');
}
function colsOpen(vs){
  var out = '<div class="cols" style="grid-template-columns:44px repeat(' + vs.length + ',minmax(200px,1fr))">' +
            '<div class="colhead gutter"></div>';
  vs.forEach(function(v){ out += '<div class="colhead">' + esc(v.name) + '</div>'; });
  return out;
}
function hebInner(bi,ci,i,t){
  if(!HEB) return esc(t);
  return t.split(' ').map(function(w,wi){
    return '<span class="hw" data-hb="' + bi + '" data-hc="' + ci + '" data-hv="' + i +
           '" data-hi="' + wi + '">' + esc(heb(w)) + '</span>';
  }).join(' ');
}
function greekInner(bi,ci,i,t){
  var ws = gwordsOf(bi,ci,i);
  if(ws && ws.length){
    return ws.map(function(w,wi){
      return '<span class="gw" data-gb="' + bi + '" data-gc="' + ci + '" data-gv="' + i +
             '" data-gw="' + wi + '">' + esc(w[0]) + '</span>';
    }).join(' ');
  }
  return esc(t);
}
/* 한 역본만 볼 때 — "1:1 태초에 하나님이…" 한 문단씩 */
function versePara(v,bi,ci,i,sel){
  var t = verses(v.id,bi,ci)[i];
  if(!t) return '';                              /* 그 역본에 없는 절 */
  var cls = 'vpara' + (sel ? ' vhit' : '') + (v.id === 'grk' ? ' grk' : '') + (v.ot ? ' heb' : '') +
            (ENG[v.id] ? ' eng' : '');
  var body, head = '';
  if(v.id === 'grk') body = greekInner(bi,ci,i,t);
  else if(v.ot) body = hebInner(bi,ci,i,t);
  else {
    var sp = split(t);
    if(sp.head) head = '<div class="sheadrow">' + esc(sp.head) + '</div>';
    if(sp.para) cls += ' para';
    body = htmlText(sp.text);
  }
  return head + '<div class="' + cls + '" data-b="' + bi + '" data-c="' + ci + '" data-v="' + i + '">' +
         '<span class="vref">' + (ci+1) + ':' + (i+1) + '</span> ' + body + '</div>';
}
/* 대조로 볼 때 — 절마다 한 줄, 역본마다 한 단 */
function verseRow(vs,bi,ci,i,sel){
  var cells = '', head = '', para = false, any = false, hi = sel ? ' vhit' : '';
  for(var k=0;k<vs.length;k++){
    var t = verses(vs[k].id,bi,ci)[i];
    if(!t){ cells += '<div class="vcell' + hi + '"></div>'; continue; }
    any = true;
    if(vs[k].id === 'grk'){
      cells += '<div class="vcell' + hi + '"><div class="vtext grk">' + greekInner(bi,ci,i,t) + '</div></div>';
      continue;
    }
    if(vs[k].ot){
      cells += '<div class="vcell' + hi + '"><div class="vtext heb">' + hebInner(bi,ci,i,t) + '</div></div>';
      continue;
    }
    var sp = split(t);
    if(sp.head && !head) head = sp.head;
    if(sp.para) para = true;
    cells += '<div class="vcell' + hi + '"><div class="vtext' + (ENG[vs[k].id] ? ' eng' : '') + '">' +
             htmlText(sp.text) + '</div></div>';
  }
  if(!any) return '';
  return (head ? '<div class="sheadrow">' + esc(head) + '</div>' : '') +
         '<div class="vrow' + (para ? ' para' : '') +
         '" data-b="' + bi + '" data-c="' + ci + '" data-v="' + i + '">' +
         '<div class="vno' + hi + '">' + (i+1) + '</div>' + cells + '</div>';
}
function maxVerses(bi,ci,vs){
  var n = 0;
  vs.forEach(function(v){ var l = verses(v.id,bi,ci).length; if(l > n) n = l; });
  return n;
}
/* ─────────────── 🌍 지도·고고학 연동 — 절마다 지도(지명이 본문에 나옴)·해설(구절 목록)이 있으면 절 번호를 진하게 ─────────────── */
var GEO = { on:false }; window.GEO = GEO;
try{ GEO.on = localStorage.getItem('geo.on') === '1'; }catch(e){}
function geoData(bi, ci, vi){
  /* 지도: 이 장의 지도 가운데 그 지도의 지명이 이 절 본문에 나오는 것. 해설: 이 절을 다루는 학습 글 */
  var out = { maps:[], arts:[] };
  if(window.ATLAS && window.ATLAS_PLACES){
    var text = korText(bi, ci, vi) || '';
    var maps = ATLAS.mapsFor(bi, ci);
    maps.forEach(function(m){
      var hit = (m.places || []).some(function(id){ var p = ATLAS_PLACES[id]; if(!p) return false; var nm = String(p[2] || '').replace(/\(.*?\)/g, '').trim(); return nm.length >= 2 && text.indexOf(nm) >= 0; });
      if(hit) out.maps.push(m);
    });
  }
  if(window.STUDY) out.arts = STUDY.forVerse(bi, ci, vi, true).filter(function(a){ return a; });
  return out;
}
var geoCache = {};
/* 본문 지명 → 지도: data/geo-names.js 의 GEO_ENGINE 이 찾고(전수 조사 규칙 포함), 여기서는 그 지점을 담은 지도를 고른다 */
function geoMapsAt(lat, lon, bi, ci){
  if(!window.ATLAS) return [];
  function inside(m){ var b = m.bounds; return b && lat <= b[0] && lat >= b[2] && lon >= b[1] && lon <= b[3] && !(ATLAS_BASES[m.base] && ATLAS_BASES[m.base].vector); }
  function area(m){ var b = m.bounds; return (b[0] - b[2]) * (b[3] - b[1]); }
  var here = ATLAS.mapsFor(bi, ci).filter(inside);
  var rest = ATLAS_MAPS.filter(function(m){ return inside(m) && here.indexOf(m) < 0; }).sort(function(a, b){ return area(a) - area(b); });
  return here.slice(0, 4).concat(rest.slice(0, here.length ? 1 : 3));
}
function geoMark(r){
  $('geoBtn').classList.toggle('on', GEO.on); $('geoBtn').setAttribute('aria-pressed', GEO.on ? 'true' : 'false');
  r.querySelectorAll('.geoword').forEach(function(w){ w.replaceWith(document.createTextNode(w.textContent)); });
  r.querySelectorAll('.vtext, .vpara').forEach(function(el){ el.normalize(); });
  if(!GEO.on || !window.GEO_ENGINE) return;
  r.querySelectorAll('.vrow,.vpara').forEach(function(el){
    var bi = +el.dataset.b, ci = +el.dataset.c, vi = +el.dataset.v;
    var arts = window.STUDY ? STUDY.forVerse(bi, ci, vi, true) : [];
    var boxes = el.classList.contains('vpara') ? (el.classList.contains('heb') || el.classList.contains('grk') || el.classList.contains('eng') ? [] : [el]) : [].slice.call(el.querySelectorAll('.vtext:not(.eng):not(.grk)'));
    boxes.forEach(function(box){
      var walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null), nodes = [], n;
      while((n = walker.nextNode())) if(!n.parentNode.closest('.vref, .geoword, .sheadrow')) nodes.push(n);
      nodes.forEach(function(tn){
        var t = tn.nodeValue, hits = GEO_ENGINE.find(t, bi, ci); if(!hits.length) return;
        var frag = document.createDocumentFragment(), last = 0;
        hits.forEach(function(h){
          var maps = geoMapsAt(h.lat, h.lon, bi, ci); if(!maps.length) return;
          if(h.s > last) frag.appendChild(document.createTextNode(t.slice(last, h.s)));
          var sp = document.createElement('span'); sp.className = 'geoword'; sp.textContent = t.slice(h.s, h.e);
          sp.title = '🗺 지도 보기 — ' + h.name + '\n' + maps.map(function(x){ return '· ' + x.title; }).join('\n') + (arts.length ? '\n📚 해설: ' + arts.map(function(a){ return a.title; }).join(' · ') : '') + '\n(누르면 엽니다)';
          sp.onclick = function(e){
            e.stopPropagation();
            var go = function(m){ ATLAS.openAt(m, { bi:bi, ci:ci, vi:vi }, h.id, h); };
            if(maps.length === 1 && !arts.length){ go(maps[0]); return; }
            openCMenu(e.clientX, e.clientY, maps.map(function(m){ return ['🗺 ' + m.title, function(){ go(m); }]; }).concat(arts.map(function(a){ return ['📚 ' + a.title, function(){ STUDY.open(a.id); }]; })));
          };
          frag.appendChild(sp); last = h.e;
        });
        if(!last) return;
        if(last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
        tn.parentNode.replaceChild(frag, tn);
      });
    });
  });
}
$('geoBtn').onclick = function(){
  GEO.on = !GEO.on; try{ localStorage.setItem('geo.on', GEO.on ? '1' : '0'); }catch(e){}
  geoMark($('reader'));
  if(GEO.on){ var n = $('reader').querySelectorAll('.geoword').length; toast(n ? '지도에 있는 지명 ' + n + '곳을 표시했습니다 — 지명에 마우스를 대면 안내가, 누르면 지도가 열립니다' : '이 장의 본문에는 지도에 실린 지명이 없습니다 — 오른쪽 단추 메뉴의 [지도 보기]를 쓰세요'); }
  else toast('지도·고고학 연동 표시를 껐습니다');
};
function bindVerses(r){
  r.querySelectorAll('.vrow,.vpara').forEach(function(el){
  });
}
function chunk(vs,bi,ci,from,to,sel){
  var out = [], i;
  if(vs.length === 1){
    for(i=from;i<=to;i++) out.push(versePara(vs[0],bi,ci,i,i === sel));
    return out.join('');
  }
  out.push(colsOpen(vs));
  for(i=from;i<=to;i++) out.push(verseRow(vs,bi,ci,i,i === sel));
  out.push('</div>');
  return out.join('');
}
function passLabel(p){
  if(p.whole) return BOOKS[p.bi].n + ' ' + (p.ci+1) + '장';
  return BOOKS[p.bi].n + ' ' + (p.ci+1) + ':' + (p.from+1) + (p.to > p.from ? '-' + (p.to+1) : '');
}
function renderChapter(){
  var r = $('reader');
  if(st.bi < 0){
    $('readTitle').textContent = '본문'; $('readVer').textContent = '';
    r.innerHTML = '<div class="empty"><div class="big">읽을 곳을 고르세요</div>' +
      '<div>왼쪽 목록에서 책과 장을 고르거나, <b>검색</b>에서 <code>요 3:16</code> 처럼 적으면 그곳이 열립니다.</div></div>';
    return;
  }
  $('readTitle').textContent = BOOKS[st.bi].n + ' ' + (st.ci+1) + '장';
  if(window.STEPH && STEPH.active()){ $('readVer').textContent = vinfo(S.base).name + ' · 스테판 원어 성경'; STEPH.render(r, st.bi, st.ci, st.vi); return; }
  var vs = versionsFor(st.bi);
  $('readVer').textContent = vs.map(function(v){ return v.name; }).join(' · ');
  if(!vs.length){
    r.innerHTML = '<div class="empty">이 책에서 볼 수 있는 성경이 없습니다.</div>';
    return;
  }
  var n = maxVerses(st.bi,st.ci,vs);
  r.innerHTML = mtNote(st.bi, st.ci, vs) + '<div class="readwrap">' +
                chunk(vs, st.bi, st.ci, 0, n-1, st.vi) + '</div>';
  bindVerses(r); geoMark(r);
  var t = r.querySelector('.vhit');
  if(t) t.scrollIntoView({block:'center'});
  else r.scrollTop = 0;
}
function renderPassages(){
  var r = $('reader'), out = [], total = 0;
  st.passages.forEach(function(p){
    var vs = versionsFor(p.bi);
    out.push('<div class="readwrap"><div class="sheadrow">' + esc(passLabel(p)) + '</div>');
    if(vs.length){
      out.push(chunk(vs, p.bi, p.ci, p.from, p.to, -1));
      total += (p.to - p.from + 1);
    }
    out.push('</div>');
  });
  $('readTitle').textContent = '구절 모음 · ' + st.passages.length + '곳 ' + total + '절';
  r.innerHTML = out.join('');
  bindVerses(r); geoMark(r);
  r.scrollTop = 0;
}
function render(){
  if($('copyMenu').hidden) buildCopyMenu();
  if($('verMenu').hidden) buildVerMenu(); else $('verCnt').textContent = activeVersions().length;
  if(st.mode === 'passages') renderPassages();
  else renderChapter();
  updateWordBox();
  syncPlayerToChapter();
  if(window.HL) HL.paint();
}
function step(d){
  if(st.mode !== 'chapter' || st.bi < 0) return;
  var bi = st.bi, ci = st.ci + d;
  if(ci < 0){ if(bi === 0) return; bi--; ci = BOOKS[bi].c - 1; }
  else if(ci >= BOOKS[bi].c){ if(bi === BOOKS.length - 1) return; bi++; ci = 0; }
  openChapter(bi,ci,-1);
}
$('prev').onclick = function(){ step(-1); };
$('next').onclick = function(){ step(1); };

/* ─────────────── 대조 성경 고르기 ─────────────── */
function buildVerMenu(){
  var m = $('verMenu'), base = vinfo(S.base);
  m.innerHTML = '';
  var t = document.createElement('div');
  t.className = 'mtitle'; t.textContent = '기본 성경';
  m.appendChild(t);
  var fixed = document.createElement('label');
  fixed.className = 'fixed';
  fixed.innerHTML = '<input type="checkbox" checked disabled><span>' + esc(base.name) + '</span>';
  m.appendChild(fixed);
  var t2 = document.createElement('div');
  t2.className = 'mtitle'; t2.textContent = '함께 볼 성경';
  m.appendChild(t2);
  VERS.forEach(function(v){
    if(v.id === S.base) return;
    var on = S.extra.indexOf(v.id) >= 0;
    var lab = document.createElement('label');
    lab.innerHTML = '<input type="checkbox"' + (on ? ' checked' : '') + '><span>' + esc(v.name) + '</span>';
    lab.querySelector('input').onchange = function(){
      if(this.checked){ if(S.extra.indexOf(v.id) < 0) S.extra.push(v.id); }
      else S.extra = S.extra.filter(function(x){ return x !== v.id; });
      saveSettings(); syncVersionUI(); render();
    };
    m.appendChild(lab);
  });
  if(window.STEPH){
    var sl = document.createElement('label');
    sl.innerHTML = '<input type="checkbox"' + (STEPH.active() ? ' checked' : '') + '><span>스테판 원어 성경</span>';
    sl.querySelector('input').onchange = function(){ STEPH.setOn(this.checked); };
    m.appendChild(sl);
  }
  var div = document.createElement('div');
  div.className = 'divider'; m.appendChild(div);
  var b = document.createElement('button');
  b.textContent = '기본 성경 바꾸기 →';
  b.onclick = function(){ closeDrops(); showView('settings'); $('baseVer').focus(); };
  m.appendChild(b);
  $('verCnt').textContent = activeVersions().length;
}
function syncVersionUI(){
  $('verCnt').textContent = activeVersions().length;
  var box = $('extraVer');
  if(box) box.querySelectorAll('label').forEach(function(lab){
    var id = lab.dataset.v;
    var on = S.extra.indexOf(id) >= 0;
    var cb = lab.querySelector('input');
    if(cb) cb.checked = on;
    lab.classList.toggle('on', on);
  });
}

/* ─────────────── 드롭다운 ─────────────── */
function closeDrops(){
  $('verMenu').hidden = true;
  $('copyMenu').hidden = true;
}
$('verBtn').onclick = function(e){
  e.stopPropagation();
  var open = $('verMenu').hidden;
  closeDrops();
  if(open){ buildVerMenu(); $('verMenu').hidden = false; }
};
$('copyBtn').onclick = function(e){
  e.stopPropagation();
  var open = $('copyMenu').hidden;
  closeDrops();
  if(open){ buildCopyMenu(); $('copyMenu').hidden = false; }
};
$('verMenu').onclick  = function(e){ e.stopPropagation(); };
$('copyMenu').onclick = function(e){ e.stopPropagation(); };
document.addEventListener('click', function(){ closeDrops(); closeMorph(); });

/* ─────────────── 복사 ─────────────── */
function toast(m){
  var t = $('toast');
  t.textContent = m; t.classList.add('show');
  clearTimeout(toast.k);
  toast.k = setTimeout(function(){ t.classList.remove('show'); }, 1500);
}
function put(s,m){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(s).then(function(){ toast(m); }, function(){ fallback(s,m); });
  } else fallback(s,m);
}
function fallback(s,m){
  var a = document.createElement('textarea');
  a.value = s; a.style.position = 'fixed'; a.style.opacity = '0';
  document.body.appendChild(a); a.select();
  try{ document.execCommand('copy'); toast(m); }catch(e){ toast('복사하지 못했습니다'); }
  a.remove();
}
function copyGroups(){
  if(st.mode === 'passages'){
    return st.passages.map(function(p){
      return { bi:p.bi, ci:p.ci, from:p.from, to:p.to, label:passLabel(p) };
    });
  }
  if(st.bi < 0) return [];
  return [{ bi:st.bi, ci:st.ci, from:0, to:Math.max(0,lastVerse(st.bi,st.ci)),
            label:BOOKS[st.bi].n + ' ' + (st.ci+1) + '장' }];
}
function copyBody(g, vid){
  var arr = verses(vid,g.bi,g.ci), o = [];
  for(var i=g.from;i<=g.to;i++){
    var t = arr[i];
    if(!t) continue;
    var s = flat(split(t).text);
    if(!s) continue;
    o.push(S.optNum ? (i+1) + ' ' + s : s);
  }
  return o.join(S.optNum ? '\n' : ' ');
}
function copyText(vs, groups){
  var out = [];
  if(vs.length > 1){
    if(groups.length === 1){
      if(S.optSrc) out.push(groups[0].label, '');
      var k = 0;
      vs.forEach(function(v){
        var b = copyBody(groups[0], v.id);
        if(!b) return;
        if(k++) out.push('');
        out.push('[' + v.name + ']', b);
      });
      return out.join('\n');
    }
    var m = 0;
    vs.forEach(function(v){
      var parts = [];
      groups.forEach(function(g){
        var b = copyBody(g, v.id);
        if(!b) return;
        if(parts.length) parts.push('');
        if(S.optSrc) parts.push(g.label);
        parts.push(b);
      });
      if(!parts.length) return;
      if(m++) out.push('', '');
      out.push('[' + v.name + ']');
      out = out.concat(parts);
    });
    return out.join('\n');
  }
  var v1 = vs[0];
  groups.forEach(function(g){
    var b = copyBody(g, v1.id);
    if(!b) return;
    if(out.length) out.push('');
    if(S.optSrc) out.push(g.label + ' (' + v1.name + ')');
    out.push(b);
  });
  return out.join('\n');
}
function doCopy(vs){
  var groups = copyGroups();
  if(!groups.length) return toast('먼저 본문을 여세요');
  var text = copyText(vs, groups);
  if(!text) return toast('복사할 본문이 없습니다');
  var what = groups.length === 1 ? groups[0].label : groups.length + '곳';
  put(text, what + ' 복사됨 (' + (vs.length > 1 ? vs.length + '개 성경' : vs[0].short) + ')');
}
function copyVerse(bi,ci,vi){
  var vs = versionsFor(bi);
  var text = copyText(vs, [{ bi:bi, ci:ci, from:vi, to:vi, label:ref(bi,ci,vi) }]);
  if(!text) return toast('복사할 본문이 없습니다');
  put(text, ref(bi,ci,vi) + ' 복사됨');
}
function buildCopyMenu(){
  var m = $('copyMenu');
  if(!m) return;
  m.innerHTML = '';
  var vs = st.bi < 0 ? activeVersions() : versionsFor(st.bi);
  var t = document.createElement('div');
  t.className = 'mtitle'; t.textContent = '지금 보는 곳을';
  m.appendChild(t);
  vs.forEach(function(v){
    var b = document.createElement('button');
    b.textContent = v.name + ' 복사';
    b.onclick = function(){ closeDrops(); doCopy([v]); };
    m.appendChild(b);
  });
  if(vs.length > 1){
    var all = document.createElement('button');
    all.textContent = '모두 함께 복사';
    all.onclick = function(){ closeDrops(); doCopy(vs); };
    m.appendChild(all);
  }
  var div = document.createElement('div');
  div.className = 'divider'; m.appendChild(div);
  [['optNum','절 번호 넣기'],['optSrc','출처 넣기']].forEach(function(o){
    var lab = document.createElement('label');
    lab.innerHTML = '<input type="checkbox"' + (S[o[0]] ? ' checked' : '') + '><span>' + o[1] + '</span>';
    lab.querySelector('input').onchange = function(){
      S[o[0]] = this.checked; saveSettings(); syncSettingsUI();
    };
    m.appendChild(lab);
  });
}

/* 드래그해서 복사(Ctrl+C)할 때도 어디 말씀인지 붙여 준다 */
function selectionGroups(picked){
  var groups = [], cur = null;
  picked.forEach(function(el){
    var b = +el.dataset.b, c = +el.dataset.c, v = +el.dataset.v;
    if(cur && cur.bi === b && cur.ci === c && v === cur.to + 1){ cur.to = v; return; }
    cur = { bi:b, ci:c, from:v, to:v };
    groups.push(cur);
  });
  groups.forEach(function(g){ g.label = passLabel(g); });
  return groups;
}
document.addEventListener('copy', function(e){
  var sel = window.getSelection();
  if(!sel || sel.isCollapsed || !sel.rangeCount) return;
  var reader = $('reader');
  if(!reader || !reader.contains(sel.getRangeAt(0).commonAncestorContainer)) return;

  var picked = [];
  reader.querySelectorAll('.vpara,.vrow').forEach(function(el){
    if(sel.containsNode(el, true)) picked.push(el);
  });
  if(!picked.length) return;

  var groups = selectionGroups(picked), text;
  var vs = versionsFor(groups[0].bi);

  /* 한 절 안에서 일부만 긁었으면 그 대목만, 뒤에 출처를 붙인다 */
  if(groups.length === 1 && groups[0].from === groups[0].to){
    var g = groups[0];
    var raw = sel.toString().replace(/\s+/g,' ').trim().replace(/^\d+:\d+\s*/,'');
    var full = flat(split(verses(vs[0].id, g.bi, g.ci)[g.from] || '').text);
    if(raw && full && raw.length < full.length - 1){
      text = raw + ' (' + ref(g.bi,g.ci,g.from) + (S.optSrc ? ', ' + vs[0].name : '') + ')';
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
      toast(ref(g.bi,g.ci,g.from) + ' 복사됨');
      return;
    }
  }
  text = copyText(vs, groups);
  if(!text) return;
  e.clipboardData.setData('text/plain', text);
  e.preventDefault();
  toast((groups.length === 1 ? groups[0].label : groups.length + '곳') + ' 복사됨');
});

/* ─────────────── 헬라어 낱말 풀이 ─────────────── */
function gwordsOf(bi,ci,vi){
  var b = MWORDS[bi]; if(!b) return null;
  var c = b[ci];      if(!c) return null;
  return c[vi] || null;
}
var GPOS = {
  N:'명사', V:'동사', T:'관사', A:'형용사', ADV:'부사', CONJ:'접속사', PREP:'전치사',
  PRT:'불변화사', COND:'조건 불변화사', P:'인칭대명사', R:'관계대명사', D:'지시대명사',
  I:'의문대명사', X:'부정(不定)대명사', F:'재귀대명사', S:'소유대명사', K:'상관대명사',
  C:'상호대명사', Q:'상관의문대명사', INJ:'감탄사', HEB:'히브리어 음역', ARAM:'아람어 음역'
};
var GC={N:'주격',V:'호격',G:'속격',D:'여격',A:'대격'};
var GN={S:'단수',P:'복수'};
var GG={M:'남성',F:'여성',N:'중성'};
var GT={P:'현재',I:'미완료',F:'미래',A:'부정과거',R:'완료',L:'과거완료'};
var GV={A:'능동',M:'중간',P:'수동',E:'중간/수동',D:'중간디포넌트',O:'수동디포넌트',N:'중간·수동디포넌트'};
var GM={I:'직설법',S:'가정법',O:'희구법',M:'명령법',N:'부정사',P:'분사'};
var GSUF={N:'부정(否定)',I:'의문',K:'크라시스',C:'비교급',S:'최상급',ATT:'아티카형',
          PRI:'고유명사·불변화',NUI:'수사·불변화',LI:'문자',OI:'기타 불변화',ABB:'약어',P:'강조'};
function cng(seg){ return GC[seg.charAt(0)] + ' ' + GN[seg.charAt(1)] + ' ' + GG[seg.charAt(2)]; }
function decodeMorph(code){
  if(!code) return '';
  var p = code.split('-'), out = [];
  if(p[0] === 'V'){
    var tvm = p[1] || '', second = false;
    if(tvm.charAt(0) === '2'){ second = true; tvm = tvm.slice(1); }
    out.push('동사');
    if(GT[tvm.charAt(0)]) out.push((second ? '제2' : '') + GT[tvm.charAt(0)]);
    if(GV[tvm.charAt(1)]) out.push(GV[tvm.charAt(1)]);
    if(GM[tvm.charAt(2)]) out.push(GM[tvm.charAt(2)]);
    for(var i=2;i<p.length;i++){
      var g = p[i];
      if(/^[123][SP]$/.test(g))              out.push(g.charAt(0) + '인칭 ' + GN[g.charAt(1)]);
      else if(/^[NVGDA][SP][MFN]$/.test(g))  out.push(cng(g));
      else if(GSUF[g])                        out.push(GSUF[g]);
    }
    return out.join(' · ');
  }
  out.push(GPOS[p[0]] || p[0]);
  for(var j=1;j<p.length;j++){
    var g2 = p[j];
    if(/^[NVGDA][SP][MFN]$/.test(g2))               out.push(cng(g2));
    else if(/^[123][NVGDA][SP][MFN]$/.test(g2))     out.push(g2.charAt(0) + '인칭 · ' + cng(g2.slice(1)));
    else if(/^[123][SP][NVGDA][SP][MFN]$/.test(g2)) out.push(g2.charAt(0) + '인칭 ' + GN[g2.charAt(1)] + ' 소유 · ' + cng(g2.slice(2)));
    else if(GSUF[g2])                               out.push(GSUF[g2]);
    else if(g2)                                     out.push(g2);
  }
  return out.join(' · ');
}
function closeMorph(){
  var p = document.getElementById('gpop');
  if(p) p.remove();
}
function showMorph(el){
  closeMorph();
  var ws = gwordsOf(+el.dataset.gb, +el.dataset.gc, +el.dataset.gv);
  var w = ws && ws[+el.dataset.gw];
  if(!w) return;
  var code = MCODES[w[1]], lemma = MLEMMAS[w[2]], parsed = decodeMorph(code);
  var d = document.createElement('div');
  d.id = 'gpop'; d.className = 'gpop';
  d.innerHTML =
    '<div class="gp-w">' + esc(w[0]) + '</div>' +
    '<div class="gp-row"><span>원형</span><b>' + esc(lemma) + '</b></div>' +
    (parsed ? '<div class="gp-row"><span>파싱</span><b>' + esc(parsed) + '</b></div>' : '') +
    '<div class="gp-row"><span>코드</span><code>' + esc(code) + '</code></div>' +
    (w[3] ? '<div class="gp-row"><span>스트롱</span><code>' + esc(w[3]) + '</code></div>' : '') +
    '<div class="gp-act"><button type="button" id="gpFind">이 원형이 쓰인 곳 모두 찾기</button></div>';
  d.onclick = function(e){ e.stopPropagation(); };
  document.body.appendChild(d);
  var r = el.getBoundingClientRect();
  d.style.left = r.left + 'px';
  d.style.top  = (r.bottom + 6) + 'px';
  var b = d.getBoundingClientRect();
  if(b.right  > window.innerWidth  - 10) d.style.left = Math.max(10, window.innerWidth - 10 - b.width) + 'px';
  if(b.bottom > window.innerHeight - 10) d.style.top  = Math.max(10, r.top - b.height - 6) + 'px';
  document.getElementById('gpFind').onclick = function(){
    closeMorph();
    $('lemmaSearch').checked = true;
    $('sver').value = 'grk';
    $('q').value = lemma;
    showView('search');
    doSearch();
  };
}
window.addEventListener('resize', closeMorph);

/* ─────────────── 헬라어 정규화 ─────────────── */
var GREEK_RE = /[Ͱ-Ͽἀ-῿]/;
function gnorm(x){
  return x.normalize('NFD').replace(/[̀-ͯ]/g,'')
          .toLowerCase().replace(/ς/g,'σ');
}
var GMAP = null;
function gclass(ch){
  if(!GMAP){
    GMAP = {};
    for(var c=0x370;c<=0x1fff;c++){
      var s1 = String.fromCharCode(c);
      if(!GREEK_RE.test(s1)) continue;
      var b = gnorm(s1);
      if(b.length !== 1) continue;
      (GMAP[b] = GMAP[b] || []).push(s1);
    }
  }
  var list = GMAP[ch];
  if(!list || !list.length) return ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return '[' + list.join('').replace(/[\]\\^-]/g,'\\$&') + ']';
}
function greekPattern(term){
  var t = gnorm(term), out = '';
  for(var i=0;i<t.length;i++){
    var ch = t.charAt(i);
    out += GREEK_RE.test(ch) ? gclass(ch) : ch.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  }
  return out;
}
var GNORM_CACHE = null;
function gnormVerse(bi,ci,vi){
  if(!GNORM_CACHE) GNORM_CACHE = {};
  var key = bi + '_' + ci + '_' + vi, v = GNORM_CACHE[key];
  if(v === undefined){
    var t = verses('grk',bi,ci)[vi];
    v = GNORM_CACHE[key] = t ? gnorm(t) : '';
  }
  return v;
}
var LEMN = null;
function lemmaNorm(i){
  if(!LEMN) LEMN = MLEMMAS.map(gnorm);
  return LEMN[i];
}

/* ─────────────── 주소 파싱 ─────────────── */
var NAMEMAP = {};
BOOKS.forEach(function(b,i){ NAMEMAP[b.n] = i; NAMEMAP[b.a] = i; });
NAMEMAP['스'] = 14; NAMEMAP['에'] = 16;
function bookIndex(name){
  for(var len=name.length; len>0; len--){
    var k = name.slice(0,len);
    if(Object.prototype.hasOwnProperty.call(NAMEMAP,k)) return { bi:NAMEMAP[k], rest:name.slice(len) };
  }
  return null;
}
var REF_RE = /^[,;·/]?\s*([가-힣]+)\s*(\d+)\s*(?:[:장]\s*(\d+)(?:\s*[-~–]\s*(\d+))?\s*절?)?\s*/;
function parseRefList(q){
  var rest = q.trim(), out = [], guard = 0;
  if(!rest) return null;
  while(rest.length && guard++ < 80){
    var m = rest.match(REF_RE);
    if(!m) return null;
    var b = bookIndex(m[1]);
    if(!b || b.rest) return null;
    var ci = Math.min(+m[2], BOOKS[b.bi].c) - 1;
    if(!m[3]) out.push({ bi:b.bi, ci:ci, from:-1, to:-1 });
    else {
      var f = +m[3] - 1, t = m[4] ? +m[4] - 1 : f;
      out.push({ bi:b.bi, ci:ci, from:f, to:(t < f ? f : t) });
    }
    rest = rest.slice(m[0].length);
  }
  return (out.length && !rest.length) ? out : null;
}
function expand(p){
  if(p.from >= 0) return p;
  return { bi:p.bi, ci:p.ci, from:0, to:Math.max(0,lastVerse(p.bi,p.ci)), whole:true };
}

/* ─────────────── 검색 ─────────────── */
var LIMIT = 3000;
function buildMatcher(q){
  var ci = $('ci').checked, flags = 'g' + (ci ? 'i' : '');
  if($('re').checked){
    try{
      var r = new RegExp(q, flags);
      return { re:r, test:function(s){ r.lastIndex = 0; return r.test(s); } };
    }catch(e){ return { err:'정규식 오류: ' + e.message }; }
  }
  var t = q.trim();
  var phrase = t.length > 1 && /^["'“].*["'”]$/.test(t);
  var terms = (phrase ? [t.slice(1,-1)] : t.split(/\s+/)).filter(function(x){ return x.length > 0; });
  if(!terms.length) return { err:'찾을 낱말을 적어 주세요.' };
  if(terms.some(function(x){ return GREEK_RE.test(x); })){
    var gterms = terms.map(gnorm);
    var gre = new RegExp(terms.map(greekPattern).join('|'), 'gi');
    return {
      re:gre, greek:true, terms:gterms,
      test:function(s){
        for(var i=0;i<gterms.length;i++) if(s.indexOf(gterms[i]) < 0) return false;
        return true;
      }
    };
  }
  var pat = terms.map(function(x){ return x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }).join('|');
  var re = new RegExp(pat, flags);
  var ts = ci ? terms.map(function(x){ return x.toLowerCase(); }) : terms;
  return { re:re, test:function(s){
    var x = ci ? s.toLowerCase() : s;
    for(var i=0;i<ts.length;i++) if(x.indexOf(ts[i]) < 0) return false;
    return true;
  }};
}
function lemmaHit(bi,ci,vi,terms){
  var ws = gwordsOf(bi,ci,vi);
  if(!ws || !terms) return false;
  for(var i=0;i<terms.length;i++){
    var found = false;
    for(var j=0;j<ws.length;j++){
      if(lemmaNorm(ws[j][2]).indexOf(terms[i]) >= 0){ found = true; break; }
    }
    if(!found) return false;
  }
  return true;
}
function doSearch(){
  var q = $('q').value.trim();
  if(!q){ $('status').textContent = '찾을 낱말이나 구절을 적고 Enter.'; $('hits').innerHTML = ''; if(window.OMNI) OMNI.clear(); return; }
  showView('search');
  if(window.OMNI) OMNI.run(q);            /* 종합 검색: 지명·지도·학습·사전·개관·주석·노트 */

  /* 주소면 그 자리로 */
  if(!$('re').checked){
    var refs = parseRefList(q);
    if(refs){
      $('hits').innerHTML = ''; st.hits = []; st.sel = -1;
      if(refs.length === 1 && refs[0].from < 0){
        $('status').textContent = '주소 이동 → ' + BOOKS[refs[0].bi].n + ' ' + (refs[0].ci+1) + '장';
        addHist(q, '장', BOOKS[refs[0].bi].n + ' ' + (refs[0].ci+1) + '장');
        openChapter(refs[0].bi, refs[0].ci, -1);
      } else if(refs.length === 1 && refs[0].from === refs[0].to){
        $('status').textContent = '주소 이동 → ' + ref(refs[0].bi, refs[0].ci, refs[0].from);
        addHist(q, '절', ref(refs[0].bi, refs[0].ci, refs[0].from) + ' 있는 장');
        openChapter(refs[0].bi, refs[0].ci, refs[0].from);
      } else {
        st.mode = 'passages';
        st.passages = refs.map(expand);
        $('status').textContent = st.passages.length + '곳 — ' + st.passages.map(passLabel).join(' · ');
        addHist(q, '모음', st.passages.length + '곳');
        render();
        showView('read');
      }
      return;
    }
  }

  var M = buildMatcher(q);
  if(M.err){ $('status').textContent = M.err; $('hits').innerHTML = ''; return; }

  var only = $('scopeBook').value, scope = $('scope').value;
  var vids = $('sver').value === '*' ? VERS.map(function(v){ return v.id; }) : [$('sver').value];
  var hits = [], truncated = false, t0 = performance.now();

  outer:
  for(var bi=0; bi<BOOKS.length; bi++){
    if(only !== ''){ if(bi !== +only) continue; }
    else if(scope === 'ot' && BOOKS[bi].t !== 0) continue;
    else if(scope === 'nt' && BOOKS[bi].t !== 1) continue;
    for(var k=0; k<vids.length; k++){
      var vid = vids[k], book = TEXT[vid][bi];
      if(!book) continue;
      for(var ci=0; ci<book.length; ci++){
        var ch = book[ci];
        var gk = (vid === 'grk' && M.greek);
        var byLemma = gk && $('lemmaSearch').checked;
        for(var vi=0; vi<ch.length; vi++){
          var t = ch[vi];
          if(!t) continue;
          var ok = M.test(gk ? gnormVerse(bi,ci,vi) : t);
          if(!ok && byLemma) ok = lemmaHit(bi,ci,vi,M.terms);
          if(ok){
            if(hits.length >= LIMIT){ truncated = true; break outer; }
            hits.push({ bi:bi, ci:ci, vi:vi, vid:vid, t:t });
          }
        }
      }
    }
  }
  st.hits = hits; st.sel = -1;
  var ms = Math.round(performance.now() - t0);
  $('status').textContent = hits.length === 0
    ? '‘' + q + '’ — 찾지 못했습니다 · ' + ms + 'ms'
    : hits.length + '개 구절' + (truncated ? ' 이상 (앞 ' + LIMIT + '개만)' : '') + ' · ' + ms + 'ms';
  addHist(q, '검색', hits.length ? hits.length + '개 구절' + (truncated ? ' 이상' : '') : '결과 없음');
  paintHits(M, vids.length > 1);
}
function greekPreview(x, terms){
  var ws = gwordsOf(x.bi, x.ci, x.vi);
  if(!ws || !ws.length || !terms || !terms.length) return null;
  return ws.map(function(w){
    var sn = gnorm(w[0]), ln = lemmaNorm(w[2]);
    for(var i=0;i<terms.length;i++){
      if(sn.indexOf(terms[i]) >= 0 || ln.indexOf(terms[i]) >= 0) return '<mark>' + esc(w[0]) + '</mark>';
    }
    return esc(w[0]);
  }).join(' ');
}
function paintHits(M, multi){
  var box = $('hits');
  box.innerHTML = st.hits.map(function(x,i){
    var body = null;
    if(M.greek && x.vid === 'grk') body = greekPreview(x, M.terms);
    if(body === null){
      var p = split(x.t);
      var disp = (p.head ? '〔' + p.head + '〕 ' : '') + p.text;
      body = flat(esc(disp)).replace(M.re, function(m){ return '<mark>' + m + '</mark>'; });
    }
    var tag = multi ? ' <span class="dim" style="font-weight:400">· ' + esc(vinfo(x.vid).short) + '</span>' : '';
    var kor = x.vid !== 'gyr' ? korText(x.bi, x.ci, x.vi) : '';
    return '<div class="hit" data-i="' + i + '"><div class="ref">' + ref(x.bi,x.ci,x.vi) + tag +
           '</div><div class="txt' + (x.vid === 'grk' ? ' grk' : '') +
           (vinfo(x.vid).ot ? ' heb' : '') + '">' + body + '</div>' +
           (kor ? '<div class="kor">' + esc(kor) + '</div>' : '') + '</div>';
  }).join('');
  box.querySelectorAll('.hit').forEach(function(el){
    el.onclick = function(){
      box.querySelectorAll('.hit').forEach(function(e){ e.classList.remove('on'); });
      el.classList.add('on');
      var x = st.hits[+el.dataset.i];
      st.sel = +el.dataset.i;
      openChapter(x.bi, x.ci, x.vi);
    };
  });
}
function moveSel(d){
  if(!st.hits.length) return;
  var n = st.sel < 0 ? 0 : Math.max(0, Math.min(st.hits.length - 1, st.sel + d));
  var el = $('hits').querySelector('.hit[data-i="' + n + '"]');
  if(el){ el.click(); el.scrollIntoView({block:'nearest'}); }
}
$('go').onclick = doSearch;
$('qclear').onclick = function(){ $('q').value = ''; $('qclear').hidden = true; $('q').focus(); };
$('q').oninput = function(){ $('qclear').hidden = !$('q').value; };
$('q').onkeydown = function(e){
  if(e.key === 'Enter') doSearch();
  else if(e.key === 'ArrowDown'){ e.preventDefault(); moveSel(1); }
  else if(e.key === 'Escape'){ $('q').value = ''; $('qclear').hidden = true; }
};
['scope','scopeBook','sver','ci','re','lemmaSearch'].forEach(function(id){
  $(id).onchange = function(){ if($('q').value.trim()) doSearch(); };
});

/* ─────────────── 기록 ─────────────── */
var HKEY = 'bibleApp.history', HMAX = 40, hist = [];
function loadHist(){
  try{ hist = JSON.parse(localStorage.getItem(HKEY) || '[]') || []; }catch(e){ hist = []; }
}
function addHist(q, kind, sub){
  q = (q || '').trim();
  if(!q) return;
  hist = hist.filter(function(h){ return h.q !== q; });
  hist.unshift({ q:q, k:kind, s:sub || '', t:Date.now() });
  if(hist.length > HMAX) hist.length = HMAX;
  try{ localStorage.setItem(HKEY, JSON.stringify(hist)); }catch(e){}
  paintHist();
}
function paintHist(){
  var box = $('histList');
  if(!box) return;
  if(!hist.length){
    box.innerHTML = '<div class="status" style="border:none">아직 기록이 없습니다.</div>';
    return;
  }
  box.innerHTML = hist.map(function(h,i){
    return '<div class="hrow" data-i="' + i + '"><span class="hq">' + esc(h.q) + '</span>' +
           '<span class="hs">' + esc(h.k) + (h.s ? ' · ' + esc(h.s) : '') + '</span></div>';
  }).join('');
  box.querySelectorAll('.hrow').forEach(function(el){
    el.onclick = function(){
      var h = hist[+el.dataset.i];
      if(!h) return;
      $('q').value = h.q; $('qclear').hidden = false;
      doSearch();
    };
  });
}
$('histClear').onclick = function(){
  hist = [];
  try{ localStorage.removeItem(HKEY); }catch(e){}
  paintHist();
};

/* ─────────────── 설정 화면 ─────────────── */
function buildSettings(){
  $('themePick').querySelectorAll('button').forEach(function(b){
    b.onclick = function(){ S.theme = b.dataset.theme; saveSettings(); applySettings(); syncSettingsUI(); };
  });
  $('widthPick').querySelectorAll('button').forEach(function(b){
    b.onclick = function(){ S.width = b.dataset.w; saveSettings(); applySettings(); syncSettingsUI(); };
  });
  $('fontPick').querySelectorAll('button').forEach(function(b){
    b.onclick = function(){
      S.font = b.dataset.font;
      saveSettings(); applySettings(); syncSettingsUI();
      toast('글꼴 — ' + (FONTS[S.font] || FONTS.system).name);
    };
  });
  $('fs').oninput = function(){ S.fs = +this.value; saveSettings(); applySettings(); syncSettingsUI(); };
  $('lh').oninput = function(){ S.lh = +this.value; saveSettings(); applySettings(); syncSettingsUI(); };
  $('fsUp').onclick   = function(){ bumpFont(1); };
  $('fsDown').onclick = function(){ bumpFont(-1); };
  $('showNav').onchange = function(){ toggleNav(); };

  var sel = $('baseVer');
  VERS.forEach(function(v){ sel.add(new Option(v.name, v.id)); });
  sel.onchange = function(){
    S.base = sel.value;
    S.extra = S.extra.filter(function(x){ return x !== S.base; });
    saveSettings(); buildExtraChecks(); syncVersionUI(); render(); buildPreview();
    document.title = APP_TITLE + ' ' + APP_VERSION + ' · ' + vinfo(S.base).name;
  };
  buildExtraChecks();

  $('dictHover').onchange = function(){
    S.dictHover = this.checked;
    saveSettings(); updateWordBox();
  };
  $('hebAccent').onchange = function(){
    S.hebAccent = this.checked; saveSettings(); render(); paintVocab();
  };
  $('nonote').onchange = function(){
    S.nonote = this.checked; saveSettings(); render(); buildPreview();
    if(st.hits.length) doSearch();
  };
  $('saveAll').onclick = function(){
    saveSettings();
    toast('설정을 저장했습니다 — 다음에 열 때도 그대로입니다');
  };
  $('optNum').onchange = function(){ S.optNum = this.checked; saveSettings(); };
  $('optSrc').onchange = function(){ S.optSrc = this.checked; saveSettings(); };
  $('resetAll').onclick = function(){
    for(var k in DEFAULTS){
      if(k === 'bi' || k === 'ci') continue;                 // 보던 곳은 그대로 둔다
      S[k] = Array.isArray(DEFAULTS[k]) ? DEFAULTS[k].slice() : DEFAULTS[k];
    }
    saveSettings(); applySettings(); buildExtraChecks(); syncSettingsUI(); syncVersionUI();
    render(); buildPreview();
    toast('설정을 처음으로 되돌렸습니다');
  };
  buildAbout();
  buildPreview();
}
/* 글꼴·글자 크기·줄 간격을 바꾸면 여기서 바로 보인다 */
function buildPreview(){
  var box = $('fsPreview');
  if(!box) return;
  var v = vinfo(S.base), bi = 42, ci = 2, from = 15, to = 17;   /* 요한복음 3:16-18 */
  if(v.nt && BOOKS[bi].t === 0) v = VERS[0];
  var out = ['<div class="plabel">' + esc(BOOKS[bi].n + ' ' + (ci+1) + ':' + (from+1) + '-' + (to+1)) +
             ' · ' + esc(v.name) + '</div>'];
  for(var i=from;i<=to;i++) out.push(versePara(v, bi, ci, i, false));
  box.innerHTML = out.join('');
}
function buildAbout(){
  $('aboutVer').textContent = APP_VERSION;
  var dictHe = HEB ? Object.keys(HEB.d).length : 0;
  var dictEn = Object.keys(DICT.ko || {}).length, lemEn = Object.keys(DICT.lem || {}).length;
  var rows = [
    ['버전', APP_VERSION + ' (2026년 9월)'],
    ['들어 있는 성경', VERS.map(function(v){ return v.name; }).join(' · ')],
    ['분량', BOOKS.length + '권 · 구약 39권, 신약 27권' +
             (MWORDS.length ? ' · 헬라어 형태분석' : '') + (HEB ? ' · 히브리어 스트롱 번호' : '')],
    ['사전', '히브리어 스트롱 ' + dictHe.toLocaleString() + '항목 · 헬라어 스트롱 ' +
             (GRKD ? Object.keys(GRKD).length.toLocaleString() : 0) + '항목 · 영어 뜻 ' +
             dictEn.toLocaleString() + '낱말 · 영어 원형 ' + lemEn.toLocaleString() + '형태'],
    ['단어장', vocab.length + '개 담김 · 간격 반복으로 복습'],
    ['원어 발음', '히브리어·헬라어 낱말 1,999개를 미리 녹음해 두었습니다 (없는 낱말은 윈도우 음성)'],
    ['원어 낭독', '히브리어(WLC)·헬라어(Nestle 1904) 절을 이 컴퓨터의 Piper 신경망 음성으로 읽어 줍니다 — 속도·반복·따라 읽기, 화면을 옮겨도 이어 듣기'],
    ['개관', '66권 저자·연대·독자·배경·목적·구조·그리스도·설교 길잡이 (본문 머리의 개관 단추)'],
    ['주석', commSummary() + ' (절에서 오른쪽 단추 → 주석 보기)'],
    ['메모장', '주석·구절·생각을 [[연결]]과 #태그로 엮고, 연결 그래프와 관심사 분석으로 살펴봅니다'],
    ['형광펜', '절을 오른쪽 단추로 눌러 여섯 색으로 칠하고, 색마다 정한 분류로 메모장에서 모아 봅니다 (설정에서 분류 이름 변경)'],
    ['하는 일', '읽기 · 대조 · 검색 · 원문 낱말 뜻과 파싱 · 단어장과 퀴즈 · 절 복사 · 메모장'],
    ['자료 출처', '히브리어 본문 Westminster Leningrad Codex(Open Scriptures) · ' +
                  '헬라어 사전 Strong(1890, 저작권 만료) · 영어 낱말 뜻 위키낱말사전·kengdic(CC BY-SA) · ' +
                  '영어 원형 AGID · 원어 발음 Piper 로컬 음성합성'],
    ['만든 곳', 'K-LOGOS'],
    ['쓰는 법', '낱말에 마우스를 올리면 아래 상자에 뜻, 낱말이나 절에서 오른쪽 단추를 누르면 자세히 보기·복사·지도 메뉴']
  ];
  $('aboutList').innerHTML = rows.map(function(r){
    return '<li><b>' + esc(r[0]) + '</b><span>' + esc(r[1]) + '</span></li>';
  }).join('');
}
function buildExtraChecks(){
  var box = $('extraVer');
  box.innerHTML = '';
  VERS.forEach(function(v){
    if(v.id === S.base) return;
    var on = S.extra.indexOf(v.id) >= 0;
    var lab = document.createElement('label');
    lab.dataset.v = v.id;
    lab.className = on ? 'on' : '';
    lab.innerHTML = '<input type="checkbox"' + (on ? ' checked' : '') + '><span>' + esc(v.name) +
                    (v.nt ? ' <span class="dim">(신약)</span>' : '') + '</span>';
    lab.querySelector('input').onchange = function(){
      if(this.checked){ if(S.extra.indexOf(v.id) < 0) S.extra.push(v.id); }
      else S.extra = S.extra.filter(function(x){ return x !== v.id; });
      saveSettings(); syncVersionUI(); render();
    };
    box.appendChild(lab);
  });
  syncVersionUI();
}
function syncSettingsUI(){
  $('themePick').querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.theme === S.theme); });
  $('fontPick').querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.font === S.font); });
  $('widthPick').querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.w === S.width); });
  $('fs').value = S.fs; $('fsVal').textContent = S.fs + 'px';
  $('lh').value = S.lh; $('lhVal').textContent = (+S.lh).toFixed(2);
  $('baseVer').value = S.base;
  $('nonote').checked = S.nonote;
  $('optNum').checked = S.optNum;
  $('optSrc').checked = S.optSrc;
  $('showNav').checked = S.showNav;
  $('dictHover').checked = S.dictHover;
  $('hebAccent').checked = S.hebAccent;
}
function bumpFont(d){
  S.fs = Math.max(14, Math.min(34, S.fs + d));
  saveSettings(); applySettings(); syncSettingsUI();
}
function cycleTheme(){
  S.theme = THEMES[(THEMES.indexOf(S.theme) + 1) % THEMES.length];
  saveSettings(); applySettings(); syncSettingsUI();
  toast('바탕 — ' + ({light:'밝게',sepia:'세피아',dark:'어둡게',navy:'네이비'}[S.theme]));
}


/* ─────────────── 낱말 뜻 보기 (히브리어·영어) ─────────────── */
var HPOS   = {A:'형용사',C:'접속사',D:'부사',N:'명사',P:'대명사',R:'전치사',S:'접미어',T:'불변화사',V:'동사'};
var HSTEM  = {q:'칼',N:'니팔',p:'피엘',P:'푸알',h:'히필',H:'호팔',t:'히트파엘',
              o:'폴렐',r:'히트폴렐',m:'포엘',f:'히트파엘(수동)',
              a:'아펠',e:'샤펠',c:'페알',j:'페일',i:'하펠',u:'호팔(아람)',v:'이트페엘'};
var HASP   = {p:'완료',q:'연속 완료',i:'미완료',w:'연속 미완료',h:'권유형',j:'단축형',v:'명령형',
              r:'분사',s:'수동 분사',a:'부정사 절대형',c:'부정사 연계형'};
var HGEN   = {m:'남성',f:'여성',b:'남·여성',c:'공성'};
var HNUM   = {s:'단수',p:'복수',d:'쌍수'};
var HSTATE = {a:'절대형',c:'연계형',d:'한정형'};
var HNTYPE = {c:'보통명사',p:'고유명사',g:'족속명'};
var HTTYPE = {a:'긍정',d:'정관사',e:'권유',i:'의문',j:'감탄',m:'지시',n:'부정(否定)',o:'목적격 표시',r:'관계사'};
var HPTYPE = {d:'지시대명사',f:'부정(不定)대명사',i:'의문대명사',p:'인칭대명사',r:'관계대명사'};
var HATYPE = {a:'형용사',c:'기수',g:'족속',o:'서수'};
function decodeHebPart(p){
  if(!p) return '';
  var t = p.charAt(0), out = [], rest = p.slice(1);
  if(t === 'V'){
    out.push('동사');
    if(HSTEM[rest.charAt(0)]) out.push(HSTEM[rest.charAt(0)]);
    if(HASP[rest.charAt(1)])  out.push(HASP[rest.charAt(1)]);
    var tail = rest.slice(2);
    if(/^[123]/.test(tail)){ out.push(tail.charAt(0) + '인칭'); tail = tail.slice(1); }
    if(HGEN[tail.charAt(0)]) out.push(HGEN[tail.charAt(0)]);
    if(HNUM[tail.charAt(1)]) out.push(HNUM[tail.charAt(1)]);
    if(HSTATE[tail.charAt(2)]) out.push(HSTATE[tail.charAt(2)]);
    return out.join(' ');
  }
  if(t === 'N'){
    out.push(HNTYPE[rest.charAt(0)] || '명사');
    if(HGEN[rest.charAt(1)]) out.push(HGEN[rest.charAt(1)]);
    if(HNUM[rest.charAt(2)]) out.push(HNUM[rest.charAt(2)]);
    if(HSTATE[rest.charAt(3)]) out.push(HSTATE[rest.charAt(3)]);
    return out.join(' ');
  }
  if(t === 'A'){
    out.push(HATYPE[rest.charAt(0)] || '형용사');
    if(HGEN[rest.charAt(1)]) out.push(HGEN[rest.charAt(1)]);
    if(HNUM[rest.charAt(2)]) out.push(HNUM[rest.charAt(2)]);
    if(HSTATE[rest.charAt(3)]) out.push(HSTATE[rest.charAt(3)]);
    return out.join(' ');
  }
  if(t === 'P'){
    out.push(HPTYPE[rest.charAt(0)] || '대명사');
    var r2 = rest.slice(1);
    if(/^[123]/.test(r2)){ out.push(r2.charAt(0) + '인칭'); r2 = r2.slice(1); }
    if(HGEN[r2.charAt(0)]) out.push(HGEN[r2.charAt(0)]);
    if(HNUM[r2.charAt(1)]) out.push(HNUM[r2.charAt(1)]);
    return out.join(' ');
  }
  if(t === 'T') return HTTYPE[rest.charAt(0)] || '불변화사';
  if(t === 'S'){
    out.push('접미 대명사');
    var r3 = rest.slice(1);
    if(/^[123]/.test(r3)){ out.push(r3.charAt(0) + '인칭'); r3 = r3.slice(1); }
    if(HGEN[r3.charAt(0)]) out.push(HGEN[r3.charAt(0)]);
    if(HNUM[r3.charAt(1)]) out.push(HNUM[r3.charAt(1)]);
    return out.join(' ');
  }
  return HPOS[t] || p;
}
function decodeHeb(code){
  if(!code) return '';
  return code.split('/').map(decodeHebPart).filter(Boolean).join(' + ');
}
function hebWordAt(el){
  if(!HEB) return null;
  var bi = +el.dataset.hb, ci = +el.dataset.hc, vi = +el.dataset.hv, wi = +el.dataset.hi;
  var line = (((HEB.w[bi] || [])[ci] || [])[vi] || '');
  if(!line) return null;
  var tok = line.split('|')[wi];
  if(!tok) return null;
  var parts = tok.split(':');
  var nums = parts[0] ? parts[0].split('+') : [];
  var codes = (parts[1] || '').split(',').map(function(x){ return HEB.m[+x] || ''; });
  var entries = nums.map(function(n){
    var d = HEB.d[n];
    return { no:n, translit:(d ? d[0] : ''), pron:(d ? d[1] : ''), mean:(d ? d[2] : '') };
  });
  return { kind:'heb', word:el.textContent, entries:entries,
           morph:codes.filter(Boolean).map(decodeHeb).join(' / ') };
}
function engWordAt(w){
  var k = w.toLowerCase().replace(/^'+|'+$/g, '');
  if(k.length < 2) return null;
  var L = DICT.lem[k] || null;
  var base = L ? L[0] : k;
  var mean = DICT.ko[k] || DICT.ko[base] || null;
  var mine = myDict['E:' + base] || myDict['E:' + k];
  if(mine) mean = mean || [mine];
  return { kind:'eng', word:w, lemma:(L ? L[0] : base), lemKind:(L ? L[1] : null),
           mean:mean, base:base, nodict:!(L || mean) };
}
function wordUnderPoint(x,y){
  var r = document.caretRangeFromPoint(x,y);
  if(!r || r.startContainer.nodeType !== 3) return null;
  var node = r.startContainer, t = node.nodeValue || '', i = r.startOffset;
  var re = /[A-Za-z']/;
  if(i >= t.length) i = t.length - 1;
  if(i < 0 || !re.test(t.charAt(i))){
    if(i > 0 && re.test(t.charAt(i-1))) i--;
    else return null;
  }
  var a = i, b = i;
  while(a > 0 && re.test(t.charAt(a-1))) a--;
  while(b < t.length - 1 && re.test(t.charAt(b+1))) b++;
  var rr = document.createRange();
  rr.setStart(node, a); rr.setEnd(node, b+1);
  return { word:t.slice(a, b+1), rect:rr.getBoundingClientRect() };
}
function hideWordPop(){ }   /* 예전 팝업 자리 — 지금은 아래 상자로만 보여 준다 */
function findWord(info){
  if(info.kind === 'heb'){
    var no = info.entries.length ? info.entries[0].no : '';
    if(no) searchStrong(no);
    return;
  }
  if(info.kind === 'grk'){
    $('lemmaSearch').checked = true;
    $('sver').value = 'grk';
    $('q').value = info.lemma || info.word;
    $('qclear').hidden = false;
    showView('search');
    doSearch();
    return;
  }
  var pick = ENG[S.base] ? S.base : (S.extra.filter(function(x){ return ENG[x]; })[0] || 'kjv');
  $('sver').value = pick;
  $('q').value = info.word;
  $('qclear').hidden = false;
  showView('search');
  doSearch();
}
function boxSupported(){
  var vs = st.bi < 0 ? activeVersions() : versionsFor(st.bi);
  return vs.some(function(v){ return v.ot || v.nt || ENG[v.id]; });
}
function updateWordBox(){
  $('wordbox').hidden = !(S.dictHover && boxSupported());
}
function fillWordBox(info){
  var body = $('wbBody'), find = $('wbFind');
  $('wbTitle').textContent = info.kind === 'heb' ? '히브리어 낱말'
                           : info.kind === 'grk' ? '헬라어 낱말' : '영어 낱말';
  body.innerHTML = '<div class="wb-word' + (info.kind === 'eng' ? ' ltr' : '') + '"' +
                   (info.kind === 'heb' ? ' dir="rtl"' : '') + '>' +
                   esc(info.kind === 'heb' ? heb(info.word) : info.word) + '</div>' +
                   '<div class="wb-info">' + wordHTML(info) + '</div>';
  find.hidden = false;
  find.onclick = function(){ findWord(info); };
  var say = $('wbSay'), s = sayOf(info);
  say.hidden = !(s && s.t);
  say.onclick = function(){ speak(s); };
}

var popTimer = null, lastWord = '';
function onReaderMove(e){
  if(!S.dictHover) return;
  var info = infoFromEvent(e), rect = info ? info.rect : null;
  if(!info){ lastWord = ''; return; }
  var key = info.kind + ':' + info.word + ':' + vocabId(info);
  if(key === lastWord) return;
  lastWord = key;
  fillWordBox(info);          /* 뜻은 아래 상자에만 — 따로 뜨는 창은 쓰지 않는다 */
}
$('reader').addEventListener('mousemove', onReaderMove);
$('reader').addEventListener('mouseleave', function(){ lastWord = ''; });
/* 두 번 누르기는 한글과 똑같이 낱말을 고르는 데만 쓴다. 자세히 보기는 오른쪽 단추 메뉴에서. */

function searchStrong(no){
  if(!HEB) return;
  var hits = [], t0 = performance.now();
  outer:
  for(var bi=0; bi<BOOKS.length; bi++){
    var bk = HEB.w[bi];
    if(!bk) continue;
    for(var ci=0; ci<bk.length; ci++){
      var ch = bk[ci];
      if(!ch) continue;
      for(var vi=0; vi<ch.length; vi++){
        var line = ch[vi];
        if(!line || line.indexOf(no) < 0) continue;
        var toks = line.split('|'), hitIdx = [];
        for(var k=0; k<toks.length; k++){
          if(toks[k].split(':')[0].split('+').indexOf(no) >= 0) hitIdx.push(k);
        }
        if(!hitIdx.length) continue;
        if(hits.length >= LIMIT) break outer;
        hits.push({ bi:bi, ci:ci, vi:vi, vid:'wlc', t:verses('wlc',bi,ci)[vi] || '', idx:hitIdx });
      }
    }
  }
  st.hits = hits; st.sel = -1;
  var d = HEB.d[no], label = 'H' + no + (d && d[0] ? ' ' + d[0] : '');
  $('status').textContent = hits.length
    ? label + ' — ' + hits.length + '개 구절 · ' + Math.round(performance.now()-t0) + 'ms'
    : label + ' — 찾지 못했습니다';
  addHist('H' + no, '원형', label + ' ' + hits.length + '곳');
  var box = $('hits');
  box.innerHTML = hits.map(function(x,i){
    var toks = x.t.split(' ').map(function(w,wi){
      var ww = esc(heb(w));
      return x.idx.indexOf(wi) >= 0 ? '<mark>' + ww + '</mark>' : ww;
    }).join(' ');
    var kor = korText(x.bi, x.ci, x.vi);
    return '<div class="hit" data-i="' + i + '"><div class="ref">' + ref(x.bi,x.ci,x.vi) +
           ' <span class="dim" style="font-weight:400">· WLC</span></div>' +
           '<div class="txt heb">' + toks + '</div>' + (kor ? '<div class="kor">' + esc(kor) + '</div>' : '') + '</div>';
  }).join('');
  box.querySelectorAll('.hit').forEach(function(el){
    el.onclick = function(){
      box.querySelectorAll('.hit').forEach(function(e2){ e2.classList.remove('on'); });
      el.classList.add('on');
      var x = st.hits[+el.dataset.i];
      st.sel = +el.dataset.i;
      openChapter(x.bi, x.ci, x.vi);
    };
  });
  showView('search');
}


/* ─────────────── 헬라어 낱말 ─────────────── */
function grkWordAt(el){
  var ws = gwordsOf(+el.dataset.gb, +el.dataset.gc, +el.dataset.gv);
  var w = ws && ws[+el.dataset.gw];
  if(!w) return null;
  var code = MCODES[w[1]] || '', lemma = MLEMMAS[w[2]] || '';
  var no = String(w[3] || '').split('&')[0].replace(/\D/g, '');
  return { kind:'grk', word:w[0], lemma:lemma, no:no,
           entry:(GRKD ? GRKD[no] : null), morph:decodeMorph(code), raw:code,
           bi:+el.dataset.gb, ci:+el.dataset.gc, vi:+el.dataset.gv };
}
function cut(t, n){ t = String(t || ''); return t.length > n ? t.slice(0, n) + '…' : t; }

/* ─────────────── 낱말 자세히 보기 ─────────────── */
function wordRows(info, full){
  var rows = [];
  if(info.kind === 'heb'){
    info.entries.forEach(function(e){
      var mine = myDict['H' + e.no];
      var mean = mine || e.mean;
      rows.push(['뜻', mean ? '<span class="dmean">' + esc(full ? mean : cut(mean, 160)) + '</span>' +
                              (mine ? ' <span class="dkind">(내가 적은 뜻)</span>' : '')
                            : '<span class="dnone">사전에 없는 낱말입니다</span>']);
      if(e.translit) rows.push(['원형', esc(e.translit)]);
      if(e.pron)     rows.push(['발음', '<b class="dpron ipa">' + esc(e.pron) + '</b>']);
      if(e.no)       rows.push(['번호', '<span class="wb-code">H' + esc(e.no) + '</span>']);
    });
    if(info.morph) rows.push(['형태', esc(info.morph)]);
  } else if(info.kind === 'grk'){
    var d = info.entry, mineG = myDict['G' + info.no];
    var meanG = mineG || (d && d[5]) || '';
    if(meanG) rows.push(['뜻', '<span class="dmean">' + esc(meanG) + '</span>' +
                               (mineG ? ' <span class="dkind">(내가 적은 뜻)</span>' : '')]);
    if(d && d[3]) rows.push(['풀이', esc(full ? d[3] : cut(d[3], 170))]);
    if(full && d && d[4]) rows.push(['KJV 표현', esc(d[4])]);
    if(full && d && d[6]) rows.push(['유래', esc(d[6])]);
    rows.push(['원형', '<b class="grk-in">' + esc(info.lemma) + '</b>' +
      (d && d[1] ? ' <span class="dkind">' + esc(d[1]) + '</span>' : '')]);
    if(d && d[2]) rows.push(['발음', '<b class="dpron ipa">' + esc(d[2]) + '</b>']);
    if(info.no)   rows.push(['번호', '<span class="wb-code">G' + esc(info.no) + '</span>']);
    if(info.morph) rows.push(['파싱', esc(info.morph) + (full && info.raw ? ' <span class="dkind">' + esc(info.raw) + '</span>' : '')]);
    if(!d && !meanG) rows.push(['알림', '<span class="dnone">이 번호는 사전에 없습니다</span>']);
  } else {
    var key = 'E:' + String(info.lemma || info.word).toLowerCase();
    var mineE = myDict[key];
    if(mineE) rows.push(['뜻', '<span class="dmean">' + esc(mineE) + '</span> <span class="dkind">(내가 적은 뜻)</span>']);
    else if(info.mean) rows.push(['뜻', '<span class="dmean">' + esc(info.mean.join(', ')) + '</span>']);
    else rows.push(['뜻', '<span class="dnone">사전에 없는 낱말입니다 — 오른쪽 단추로 찾아보세요</span>']);
    if(info.lemma && info.lemma !== info.word.toLowerCase())
      rows.push(['원형', esc(info.lemma) + (info.lemKind ? ' <span class="dkind">' + esc(info.lemKind) + '</span>' : '')]);
    var ip = IPA[String(info.word).toLowerCase()] || IPA[String(info.lemma || '').toLowerCase()];
    if(ip) rows.push(['발음', '<b class="dpron ipa">' + esc(ip) + '</b>']);
  }
  if(full && info.ref) rows.push(['나온 곳', esc(info.ref)]);
  return rows;
}
function wordHTML(info){
  return wordRows(info, false).map(function(r){
    return '<div class="drow"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
  }).join('');
}
function openWordModal(info){
  if(!info) return;
  hideWordPop();
  $('mWord').className = 'm-word' + (info.kind === 'eng' ? ' ltr' : '');
  $('mWord').textContent = (info.kind === 'heb' ? heb(info.word) : info.word);
  $('mWord').setAttribute('dir', info.kind === 'heb' ? 'rtl' : 'ltr');
  $('mBody').innerHTML = wordRows(info, true).map(function(r){
    return '<div class="m-row"><div class="k">' + r[0] + '</div><div class="v">' + r[1] + '</div></div>';
  }).join('');
  var save = $('mSave'), has = !!vocabFind(vocabId(info));
  save.textContent = has ? '단어장에 있음 — 빼기' : '단어장에 담기';
  save.onclick = function(){
    if(vocabFind(vocabId(info))){ removeVocab(vocabId(info)); save.textContent = '단어장에 담기'; }
    else { addVocab(info); save.textContent = '단어장에 있음 — 빼기'; }
  };
  $('mFind').onclick = function(){ closeWordModal(); findWord(info); };
  var mw = $('mWeb'), ma = $('mAsk');
  if(mw) mw.onclick = function(){ webSearch(info); };
  if(ma) ma.onclick = function(){ closeWordModal(); askMeaning(info); };
  var ms = sayOf(info);
  $('mSay').hidden = !(ms && ms.t);
  $('mSay').onclick = function(){ speak(ms); };
  $('wordModal').hidden = false;
}
function closeWordModal(){ $('wordModal').hidden = true; }
$('mClose').onclick = closeWordModal;
backdropClose('wordModal', closeWordModal);

/* 마우스가 가리키는 낱말 알아내기 (히브리어·헬라어·영어) */
function infoFromEvent(e){
  var el = e.target.closest ? e.target.closest('.hw,.gw') : null;
  var info = null, rect = null;
  if(el && el.classList.contains('hw')){ info = hebWordAt(el); rect = el.getBoundingClientRect(); }
  else if(el && el.classList.contains('gw')){ info = grkWordAt(el); rect = el.getBoundingClientRect(); }
  else {
    var eng = e.target.closest ? e.target.closest('.eng') : null;
    if(eng){
      var w = wordUnderPoint(e.clientX, e.clientY);
      if(w){ info = engWordAt(w.word); rect = w.rect; if(info) info.word = w.word; }
    }
  }
  if(!info) return null;
  var row = e.target.closest ? e.target.closest('.vpara,.vrow,.sv') : null;
  if(row && row.dataset.b !== undefined) info.ref = ref(+row.dataset.b, +row.dataset.c, +row.dataset.v);
  else if(info.bi !== undefined) info.ref = ref(info.bi, info.ci, info.vi);
  info.rect = rect;
  return info;
}




/* ─────────────── 인터넷에서 찾기 · 내가 뜻 적어 넣기 ─────────────── */
function webSearchUrl(info){
  var w = encodeURIComponent(info.word);
  if(info.kind === 'heb'){
    var hn = (info.entries[0] || {}).no;
    return hn ? 'https://biblehub.com/hebrew/' + hn + '.htm' : 'https://www.google.com/search?q=' + w;
  }
  if(info.kind === 'grk'){
    return info.no ? 'https://biblehub.com/greek/' + info.no + '.htm'
                   : 'https://www.google.com/search?q=' + w;
  }
  return 'https://en.dict.naver.com/#/search?query=' + w;
}
function webSearch(info){
  if(!window.WEB) return toast('이 창에서는 인터넷을 열 수 없습니다');
  window.WEB.open(webSearchUrl(info));
  toast('인터넷 사전을 열었습니다');
}
var askFor = null;
function askMeaning(info){
  askFor = info;
  $('askWord').textContent = info.kind === 'heb' ? heb(info.word) : info.word;
  $('askWord').className = 'm-word' + (info.kind === 'eng' ? ' ltr' : '');
  $('askWord').setAttribute('dir', info.kind === 'heb' ? 'rtl' : 'ltr');
  var key = vocabId(info);
  $('askInput').value = myDict[key] || '';
  $('askLabel').textContent = info.word + ' — 이 낱말의 뜻을 적어 주세요';
  $('askModal').hidden = false;
  setTimeout(function(){ $('askInput').focus(); $('askInput').select(); }, 0);
}
function closeAsk(){ $('askModal').hidden = true; askFor = null; }
$('askClose').onclick = closeAsk;
backdropClose('askModal', closeAsk);
$('askWeb').onclick = function(){ if(askFor) webSearch(askFor); };
$('askInput').onkeydown = function(e){
  if(e.key === 'Enter'){ $('askOk').click(); }
  else if(e.key === 'Escape'){ closeAsk(); }
};
$('askOk').onclick = function(){
  if(!askFor) return;
  var t = $('askInput').value.trim();
  if(!t) return toast('뜻을 적어 주세요');
  var key = vocabId(askFor);
  myDict[key] = t;
  saveMyDict();
  var info = askFor;
  closeAsk();
  /* 단어장에도 담는다 */
  var have = vocabFind(key);
  if(have){ have.mean = t; saveVocab(); paintVocab(); toast('뜻을 저장했습니다'); }
  else { addVocab(info); }
  render();
};

/* ─────────────── 주석 보기 ───────────────
   data/commentary.js — "주석 텍스트" 폴더의 주석을 tools/make_commentary.py 로 절 범위별 단락으로 나눈 것.
   secs 한 줄 = [책, 장1, 절1, 장2, 절2, 첫 줄, 끝 줄(안 넣음), 제목] */
var CM = { bi:-1, ci:-1, vi:-1, list:[], wi:0, si:0 };
function commWorks(bi){
  if(!COMM || !COMM.works) return [];
  return COMM.works.filter(function(w){ return w.books.indexOf(bi) >= 0; });
}
function cmKey(c, v){ return c * 1000 + v; }
function cmSpan(s){ return cmKey(s[3], s[4]) - cmKey(s[1], s[2]); }
function cmLen(w, s){ var n = 0; for(var i = s[5]; i < s[6]; i++) n += w.text[i].length; return n; }
/* 이 절을 다루는 단락들 — 넓은 것부터 좁은 것 순서 */
function commSecs(w, bi, ci, vi){
  var k = cmKey(ci + 1, vi + 1);
  return w.secs.filter(function(s){ return s[0] === bi && cmKey(s[1], s[2]) <= k && k <= cmKey(s[3], s[4]); })
    .sort(function(a, b){ return (cmSpan(b) - cmSpan(a)) || (a[5] - b[5]); });
}
function commHits(bi, ci, vi){
  var out = [];
  commWorks(bi).forEach(function(w){
    var ss = commSecs(w, bi, ci, vi);
    if(!ss.length) return;
    /* 너무 짧은 꼬마 단락(①·A 같은 소항목)보다는 읽을 만한 단락부터 보인다 */
    var pick = ss.length - 1;
    for(var i = ss.length - 1; i >= 0; i--){ if(cmLen(w, ss[i]) >= 700){ pick = i; break; } }
    out.push({ work:w, secs:ss, pick:pick });
  });
  return out;
}
function cmRange(s){
  return BOOKS[s[0]].a + ' ' + s[1] + ':' + s[2] + (cmKey(s[1], s[2]) === cmKey(s[3], s[4]) ? ''
         : '–' + (s[3] === s[1] ? '' : s[3] + ':') + s[4]);
}
/* 단락 첫머리 줄 → 제목 (주석마다 한 번만 만든다) */
function cmHeads(w){
  if(!w._heads){ w._heads = {}; w.secs.forEach(function(x){ w._heads[x[5]] = x[7]; }); }
  return w._heads;
}
function cmLine(w, i){
  var raw = w.text[i], t = raw.replace(/\s+/g, ' ').trim();
  if(!t) return '';
  if(cmHeads(w)[i] !== undefined) return '<h4 class="cm-h" data-l="' + i + '">' + esc(t) + '</h4>';
  if(t.length <= 26 && !/[.。?!…:"”’)\]]$|[다요라까]$/.test(t)) return '<div class="cm-sub">' + esc(t) + '</div>';
  return '<p' + (/^\s{4,}/.test(raw) ? ' class="ind"' : '') + '>' + esc(t) + '</p>';
}
/* 끊김 없이 읽기: 고른 단락 뒤로 주석 끝까지 스크롤하는 대로 이어 붙인다 */
function cmMore(n){
  var hit = CM.list[CM.wi]; if(!hit) return;
  var w = hit.work, end = Math.min(w.text.length, CM.pos + n), h = [];
  if(CM.pos >= w.text.length) return;
  for(var i = CM.pos; i < end; i++) h.push(cmLine(w, i));
  CM.pos = end;
  if(end >= w.text.length) h.push('<div class="cm-end">— ' + esc(w.name) + ' 끝 —</div>');
  $('cmText').insertAdjacentHTML('beforeend', h.join(''));
}
function cmFill(){
  var el = $('cmBody');
  var guard = 0;
  while(el.scrollHeight - el.scrollTop - el.clientHeight < 1500 && guard++ < 20){
    var before = CM.pos; cmMore(120); if(CM.pos === before) break;
  }
}
/* 지금 읽는 곳 — 화면 위쪽을 지난 마지막 소제목 */
var cmTick = 0;
function cmWhere(){
  cmTick = 0;
  var el = $('cmBody'), top = el.getBoundingClientRect().top + 40, now = '';
  var hs = $('cmText').querySelectorAll('.cm-h');
  for(var i = 0; i < hs.length; i++){
    if(hs[i].getBoundingClientRect().top > top) break;
    now = hs[i].textContent;
  }
  $('cmNow').textContent = now ? '지금 읽는 곳: ' + now : '';
}
$('cmBody').addEventListener('scroll', function(){
  if($('commModal').hidden) return;
  cmFill();
  if(!cmTick) cmTick = requestAnimationFrame(cmWhere);
});
function paintComm(){
  var hit = CM.list[CM.wi]; if(!hit) return;
  var w = hit.work, s = hit.secs[CM.si];
  $('cmTitle').textContent = '주석 — ' + ref(CM.bi, CM.ci, CM.vi);
  $('cmTabs').innerHTML = CM.list.map(function(x, i){
    return '<button class="cm-tab' + (i === CM.wi ? ' on' : '') + '" data-i="' + i + '">' + esc(x.work.name) + '</button>';
  }).join('');
  $('cmTabs').hidden = CM.list.length < 2;
  $('cmName').innerHTML = '<b>' + esc(w.name) + '</b>' + (w.author ? ' <span class="dim">· ' + esc(w.author) + '</span>' : '');
  $('cmCrumb').innerHTML = hit.secs.map(function(x, i){
    return '<button class="cm-crumb' + (i === CM.si ? ' on' : '') + '" data-i="' + i + '" title="' + esc(x[7]) + '">' +
           esc(cmRange(x)) + '</button>';
  }).join('<span class="cm-sep">›</span>');
  $('cmHead').textContent = s[7];
  $('cmText').innerHTML = '';
  $('cmNow').textContent = '';
  $('cmBody').scrollTop = 0;
  CM.pos = s[5] + 1;
  cmMore(s[6] - s[5] - 1);                  /* 고른 단락은 한 번에 */
  if(!$('commModal').hidden) cmFill();
}
function openComm(bi, ci, vi){
  var hits = commHits(bi, ci, vi);
  if(!hits.length) return toast('이 절에 연결된 주석이 없습니다');
  CM = { bi:bi, ci:ci, vi:vi, list:hits, wi:0, si:hits[0].pick };
  $('commModal').hidden = false;
  paintComm();
}
function closeComm(){ $('commModal').hidden = true; }
function commText(){
  var hit = CM.list[CM.wi]; if(!hit) return '';
  var w = hit.work, s = hit.secs[CM.si], out = [];
  for(var i = s[5]; i < s[6]; i++){ var t = w.text[i].replace(/\s+/g, ' ').trim(); if(t) out.push(t); }
  return w.name + (w.author ? ' (' + w.author + ')' : '') + '\n' + out.join('\n');
}
$('cmTabs').onclick = function(e){
  var b = e.target.closest('.cm-tab'); if(!b) return;
  CM.wi = +b.dataset.i; CM.si = CM.list[CM.wi].pick; paintComm();
};
$('cmCrumb').onclick = function(e){
  var b = e.target.closest('.cm-crumb'); if(!b) return;
  CM.si = +b.dataset.i; paintComm();
};
$('cmClose').onclick = closeComm;
backdropClose('commModal', closeComm);
$('cmCopy').onclick = function(){ var t = commText(); if(t) put(t, '주석 복사됨'); };
$('cmNote').onclick = function(){ var t = commText(); if(t && window.NT){ var s = CM.list[CM.wi].secs[CM.si]; NT.fromComm(CM.bi, s, t); closeComm(); } };
$('cmWider').onclick = function(){ if(CM.si > 0){ CM.si--; paintComm(); } else toast('가장 넓은 단락입니다'); };
$('cmNarrow').onclick = function(){
  var hit = CM.list[CM.wi];
  if(hit && CM.si < hit.secs.length - 1){ CM.si++; paintComm(); } else toast('가장 좁은 단락입니다');
};
function commSummary(){
  if(!COMM || !COMM.works || !COMM.works.length) return window.COMMSTATE || '주석을 아직 풀지 않음';
  var bs = {};
  COMM.works.forEach(function(w){ w.books.forEach(function(b){ bs[b] = 1; }); });
  var names = Object.keys(bs).map(Number).sort(function(a, b){ return a - b; }).map(function(b){ return BOOKS[b].n; });
  return '주석 ' + COMM.works.length + '종 · ' + names.length + '책 — ' + names.join('·');
}
function paintCommInfo(){
  if(!$('commWhere')) return;
  $('commWhere').textContent = commSummary();
  $('commWorks').innerHTML = COMM && COMM.works ? COMM.works.map(function(w){
    return '<li><b>' + esc(w.name) + '</b>' + (w.author ? ' · ' + esc(w.author) : '') +
           ' <span class="dim">(' + w.books.map(function(b){ return BOOKS[b].n; }).join('·') + ')</span></li>';
  }).join('') : '';
}
paintCommInfo();
/* 주석은 암호화되어 있어 인증이 끝난 뒤 main 이 풀어 준다 (license.js → APP.setComm) */
function setComm(data){ COMM = data || null; paintCommInfo(); buildAbout(); }

/* ─────────────── 발음 듣기 ───────────────
   히브리어·헬라어 음성이 윈도우에 없으면 음역(baw-raw' 같은 것)을 영어 음성으로 읽어 준다. */
var TTS = window.TTS || null;
function sayOf(info){
  if(!info) return null;
  if(info.kind === 'heb'){
    var e = (info.entries || [])[0] || {};
    return { t:(e.pron || e.translit || ''), lang:'he', file:(e.no ? 'H' + e.no : '') };
  }
  if(info.kind === 'grk'){
    var d = info.entry || [];
    return { t:(d[2] || d[1] || info.lemma || ''), lang:'el', file:(info.no ? 'G' + info.no : '') };
  }
  return { t:(info.word || ''), lang:'en', file:'' };
}
function sayOfCard(v){
  return { t:(v.kind === 'eng' ? v.word : (v.pron || v.lemma || v.word)),
           lang:(v.kind === 'heb' ? 'he' : v.kind === 'grk' ? 'el' : 'en'),
           file:(v.kind === 'eng' ? '' : (v.code || '')) };
}
/* 미리 만들어 둔 음성 파일이 있으면 그것을, 없으면 윈도우 음성으로 읽어 준다 */
var audioCache = {};
/* 낱말 발음 속도 — 한 번 고르면 모든 낱말에 쓰고 저장한다 */
var WRKEY = 'bibleApp.wordRate', WRATE = 1;
try{ WRATE = +localStorage.getItem(WRKEY) || 1; }catch(e){}
(function(){
  var sels = [].slice.call(document.querySelectorAll('.wrate-sel'));
  sels.forEach(function(sel){
    ['0.3','0.4','0.5','0.6','0.7','0.8','0.9','1','1.15','1.3'].forEach(function(r){ sel.add(new Option((r === '1' ? '1.0' : r) + '×', r)); });
    sel.value = String(WRATE); if(!sel.value){ sel.value = '1'; WRATE = 1; }
    sel.onchange = function(){
      WRATE = +this.value || 1; try{ localStorage.setItem(WRKEY, String(WRATE)); }catch(e){}
      var v = this.value; sels.forEach(function(o){ o.value = v; });
      toast('발음 속도 ' + this.options[this.selectedIndex].text + ' — 모든 낱말에 적용됩니다');
    };
  });
})();
function speakFile(o, onFail){
  var a = new Audio('data/audio/' + o.file + '.mp3');
  a.defaultPlaybackRate = a.playbackRate = WRATE;
  var failed = false;
  a.onerror = function(){ if(!failed){ failed = true; onFail(); } };
  a.play().catch(function(){ if(!failed){ failed = true; onFail(); } });
}
function speakVoice(o){
  if(!TTS) return toast('이 창에서는 발음을 읽어 줄 수 없습니다');
  if(!o || !o.t) return toast('읽어 줄 발음이 없습니다');
  TTS.speak(o.t, o.lang, WRATE).then(function(r){
    if(r && r.ok === false){
      toast(r.why === 'no-voice' ? '윈도우에 쓸 수 있는 음성이 없습니다' : '발음을 읽지 못했습니다');
    }
  }, function(){ toast('발음을 읽지 못했습니다'); });
}
function speak(o){
  if(!o) return;
  if(o.file && audioCache[o.file] !== false){
    speakFile(o, function(){ audioCache[o.file] = false; speakVoice(o); });
    return;
  }
  speakVoice(o);
}

/* ─────────────── 단어장 ─────────────── */
/* 공부 방법은 셋을 겹쳐 씁니다.
   ① 간격 반복 — 맞힌 낱말은 보는 사이를 늘리고, 틀린 낱말은 곧 다시 (에빙하우스 망각곡선)
   ② 인출 연습 — 눈으로 보는 대신 떠올려서 답하기 (시험 효과)
   ③ 양방향·교차 — 낱말→뜻, 뜻→낱말, 스스로 떠올리기를 섞어서 (교차 학습) */
var VKEY = 'bibleApp.vocab', SKEY2 = 'bibleApp.study', vocab = [];
var study = { last:'', streak:0, today:'', count:0 };
var vbTab = 'all';
var SESSION = 12;                          /* 한 번에 다루는 낱말 수 — 너무 많으면 오히려 안 남는다 */

function loadVocab(){
  try{ vocab = JSON.parse(localStorage.getItem(VKEY) || '[]') || []; }catch(e){ vocab = []; }
  vocab.forEach(function(v){
    if(v.ef === undefined) v.ef = 2.5;
    if(v.iv === undefined) v.iv = 0;
    if(v.rep === undefined) v.rep = (v.box && v.box > 1) ? v.box - 1 : 0;
  });
  try{ study = JSON.parse(localStorage.getItem(SKEY2) || 'null') || study; }catch(e){}
}
function saveVocab(){
  try{ localStorage.setItem(VKEY, JSON.stringify(vocab)); }catch(e){}
  paintVocabCount();
}
function saveStudy(){ try{ localStorage.setItem(SKEY2, JSON.stringify(study)); }catch(e){} }
function today(){
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}
function markStudied(n){
  var t = today();
  if(study.today !== t){
    var y = new Date(Date.now() - 86400000);
    var yst = y.getFullYear() + '-' + (y.getMonth()+1) + '-' + y.getDate();
    study.streak = (study.last === yst || study.last === t) ? (study.streak || 0) + 1 : 1;
    study.today = t; study.count = 0;
  }
  study.count += n; study.last = t;
  saveStudy();
}
function vocabId(info){
  if(info.kind === 'heb') return 'H' + ((info.entries[0] || {}).no || info.word);
  if(info.kind === 'grk') return 'G' + (info.no || info.word);
  return 'E:' + String(info.lemma || info.word).toLowerCase();
}
function vocabFind(id){
  for(var i=0;i<vocab.length;i++) if(vocab[i].id === id) return vocab[i];
  return null;
}
function vocabMean(info){
  var mine = myDict[vocabId(info)];
  if(mine) return mine;
  if(info.kind === 'heb') return ((info.entries[0] || {}).mean || '').slice(0, 220);
  if(info.kind === 'grk'){
    var d = info.entry;
    return d ? (d[5] ? d[5] + (d[3] ? ' / ' + cut(d[3], 120) : '') : cut(d[3], 160)) : '';
  }
  return info.mean ? info.mean.join(', ') : '';
}
function addVocab(info){
  var id = vocabId(info);
  if(vocabFind(id)){ toast('이미 단어장에 있습니다'); return false; }
  var e = {
    id:id, kind:info.kind, word:info.word,
    lemma:(info.kind === 'heb' ? ((info.entries[0] || {}).translit || '')
          : info.kind === 'grk' ? (info.lemma || '') : (info.lemma || info.word)),
    pron:(info.kind === 'heb' ? ((info.entries[0] || {}).pron || '')
         : info.kind === 'grk' ? ((info.entry || [])[2] || '') : ''),
    code:(info.kind === 'eng' ? '' : id),
    mean:vocabMean(info),
    morph:(info.morph || (info.lemKind || '')),
    ref:(info.ref || ''), t:Date.now(),
    rep:0, ef:2.5, iv:0, due:0, ok:0, bad:0
  };
  if(!e.mean){ toast('뜻이 없는 낱말이라 담지 않았습니다'); return false; }
  vocab.unshift(e);
  saveVocab(); paintVocab();
  toast('단어장에 담았습니다 (' + vocab.length + '개)');
  return true;
}
function removeVocab(id){
  vocab = vocab.filter(function(v){ return v.id !== id; });
  saveVocab(); paintVocab();
}
function tabList(k){
  k = k || vbTab;
  return k === 'all' ? vocab.slice() : vocab.filter(function(v){ return v.kind === k; });
}
function dueList(k){
  var now = Date.now();
  return tabList(k).filter(function(v){ return (v.due || 0) <= now; });
}
function paintVocabCount(){
  var el = $('vbCount');
  if(el) el.textContent = vocab.length + '개';
  var tabs = $('vbTabs');
  if(tabs) tabs.querySelectorAll('button').forEach(function(b){
    var k = b.dataset.k, n = k === 'all' ? vocab.length : vocab.filter(function(v){ return v.kind === k; }).length;
    var label = { all:'전체', heb:'히브리어', grk:'헬라어', eng:'영어' }[k];
    b.textContent = label + ' ' + n;
    b.classList.toggle('on', k === vbTab);
  });
}
function kindLabel(k){ return k === 'heb' ? '히브리어' : k === 'grk' ? '헬라어' : '영어'; }
function paintStats(){
  var box = $('vbStats');
  if(!box) return;
  var list = tabList(), due = dueList().length;
  var fresh = list.filter(function(v){ return !v.rep; }).length;
  var done  = list.filter(function(v){ return (v.rep || 0) >= 3; }).length;
  var t = today();
  box.innerHTML =
    '<div class="stat due"><div class="n">' + due + '</div><div class="t">오늘 복습할 낱말</div></div>' +
    '<div class="stat"><div class="n">' + fresh + '</div><div class="t">아직 안 외운 낱말</div></div>' +
    '<div class="stat"><div class="n">' + done + '</div><div class="t">익숙해진 낱말</div></div>' +
    '<div class="stat"><div class="n">' + (study.today === t ? study.count : 0) + '</div><div class="t">오늘 공부한 횟수</div></div>' +
    '<div class="stat"><div class="n">' + (study.streak || 0) + '일</div><div class="t">이어서 공부한 날</div></div>';
}
function paintVocab(){
  paintVocabCount(); paintStats();
  var box = $('vbList');
  if(!box) return;
  var list = tabList();
  if(!list.length){
    box.innerHTML = '<div class="vempty"><b>' +
      (vocab.length ? kindLabel(vbTab) + ' 낱말이 아직 없습니다' : '단어장이 비어 있습니다') + '</b><br>' +
      '본문에서 히브리어·헬라어·영어 낱말에 <b>오른쪽 단추</b>를 눌러 자세히 보기 창을 열고,<br>' +
      '거기서 <b>단어장에 담기</b> 를 누르면 여기에 쌓입니다.</div>';
    return;
  }
  var now = Date.now();
  box.innerHTML = list.map(function(v){
    var d = (v.due || 0) <= now ? '복습할 때' : '다음 복습 ' + Math.ceil(((v.due||0) - now) / 86400000) + '일 뒤';
    return '<div class="vcard" data-id="' + esc(v.id) + '">' +
      '<div class="vw' + (v.kind === 'eng' ? ' ltr' : '') + '"' + (v.kind === 'heb' ? ' dir="rtl"' : '') + '>' +
        esc(v.kind === 'heb' ? heb(v.word) : v.word) + '</div>' +
      '<div class="vi"><b class="dmean">' + esc(cut(v.mean, 150)) + '</b>' +
        '<div class="sub">' + esc(kindLabel(v.kind)) + (v.code ? ' · ' + esc(v.code) : '') +
        (v.lemma ? ' · 원형 ' + esc(v.lemma) : '') + (v.pron ? ' · ' + esc(v.pron) : '') +
        (v.ref ? ' · ' + esc(v.ref) : '') +
        '<span class="vbox">' + (v.rep || 0) + '번 익힘 · ' + esc(d) + '</span></div></div>' +
      '<button class="vsay" title="발음 듣기">듣기</button>' +
      '<button class="vdel" title="빼기">×</button></div>';
  }).join('');
  box.querySelectorAll('.vcard').forEach(function(card){
    var v = vocabFind(card.dataset.id);
    card.querySelector('.vdel').onclick = function(){ removeVocab(card.dataset.id); };
    card.querySelector('.vsay').onclick = function(){ if(v) speak(sayOfCard(v)); };
  });
}
$('vbTabs').querySelectorAll('button').forEach(function(b){
  b.onclick = function(){ vbTab = b.dataset.k; stopQuiz(); paintVocab(); };
});
$('vbClear').onclick = function(){
  var list = tabList();
  if(!list.length) return;
  var ids = {};
  list.forEach(function(v){ ids[v.id] = 1; });
  vocab = vocab.filter(function(v){ return !ids[v.id]; });
  saveVocab(); paintVocab(); stopQuiz();
  toast('단어장을 비웠습니다');
};
$('vbExport').onclick = function(){
  var list = tabList();
  if(!list.length) return toast('내보낼 낱말이 없습니다');
  var t = list.map(function(v){
    return [v.word, v.lemma, v.pron, v.code, v.mean, v.morph, v.ref].filter(Boolean).join('\t');
  }).join('\n');
  put(t, list.length + '개를 복사했습니다 — 메모장에 붙여 넣으세요');
};

/* ─────────────── 학습 (간격 반복 + 인출 연습) ─────────────── */
var quiz = null;
function shuffle(a){
  a = a.slice();
  for(var i=a.length-1;i>0;i--){ var j = Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; }
  return a;
}
/* 되새김 간격 — SM-2 를 단순하게 옮긴 것 */
function grade(v, q){
  if(q < 3){                                   /* 다시 — 10분 뒤 */
    v.rep = 0; v.iv = 0; v.bad = (v.bad||0) + 1;
    v.ef = Math.max(1.3, (v.ef||2.5) - 0.2);
    v.due = Date.now() + 10*60000;
  } else {
    v.rep = (v.rep||0) + 1; v.ok = (v.ok||0) + 1;
    v.ef = Math.max(1.3, (v.ef||2.5) + (0.1 - (5-q)*(0.08 + (5-q)*0.02)));
    if(v.rep === 1) v.iv = 1;
    else if(v.rep === 2) v.iv = 3;
    else v.iv = Math.round((v.iv || 1) * v.ef);
    if(q === 3) v.iv = Math.max(1, Math.round(v.iv * 0.7));
    if(q === 5) v.iv = Math.round(v.iv * 1.3);
    v.due = Date.now() + v.iv * 86400000;
  }
  v.box = Math.min(5, (v.rep || 0) + 1);       /* 예전 표시와 맞추기 */
  saveVocab();
}
function modeFor(v){
  if(!v.rep) return 'mc';                      /* 처음엔 알아보기 — 낱말 → 뜻 */
  if(v.rep < 3) return 'rev';                  /* 익숙해지면 되돌리기 — 뜻 → 낱말 */
  return 'recall';                             /* 마지막은 스스로 떠올리기 */
}
function startQuiz(){
  var pool = tabList();
  if(pool.length < 2) return toast('낱말을 두 개 이상 담아 주세요');
  var now = Date.now();
  var due  = pool.filter(function(v){ return (v.due||0) <= now && v.rep; });
  var fresh = pool.filter(function(v){ return !v.rep; });
  var queue = shuffle(due).concat(shuffle(fresh)).slice(0, SESSION);
  if(!queue.length) queue = shuffle(pool).slice(0, SESSION);
  quiz = { queue:queue, pool:pool, i:0, ok:0, bad:0, done:0, state:'ask' };
  $('vbList').hidden = true; $('vbStats').hidden = true;
  $('vbQuizPane').hidden = false;
  paintQuiz();
}
function stopQuiz(){
  quiz = null;
  $('vbQuizPane').hidden = true; $('vbQuizPane').innerHTML = '';
  $('vbList').hidden = false; $('vbStats').hidden = false;
  paintVocab();
}
function wordOf(v){ return v.kind === 'heb' ? heb(v.word) : v.word; }
function quizDone(){
  var pane = $('vbQuizPane');
  var total = quiz.ok + quiz.bad;
  var next = vocab.filter(function(v){ return v.due; }).sort(function(a,b){ return a.due - b.due; })[0];
  var when = next ? Math.max(0, Math.ceil((next.due - Date.now())/3600000)) : 0;
  pane.innerHTML = '<div class="qcard qdone"><div class="big">오늘 공부 끝</div>' +
    '<div class="num">' + quiz.ok + ' / ' + total + '</div>' +
    '<div class="dim">맞힌 낱말은 사이를 두고 다시 나오고, 틀린 낱말은 곧 다시 나옵니다.' +
    (next ? '<br>다음 복습은 ' + (when < 24 ? when + '시간' : Math.ceil(when/24) + '일') + ' 뒤입니다.' : '') +
    '</div><div class="qfoot" style="justify-content:center">' +
    '<button class="btn primary" id="qAgain">한 번 더</button>' +
    '<button class="btn" id="qEnd">단어장으로</button></div></div>';
  $('qAgain').onclick = startQuiz;
  $('qEnd').onclick = stopQuiz;
}
function paintQuiz(){
  if(!quiz) return;
  if(quiz.i >= quiz.queue.length) return quizDone();
  var pane = $('vbQuizPane');
  var v = quiz.queue[quiz.i], mode = modeFor(v);
  var others = shuffle(quiz.pool.filter(function(x){ return x.id !== v.id && x.mean; })).slice(0, 3);
  var choices = shuffle([v].concat(others));
  var head =
    '<div class="qtop"><span>' + (quiz.i + 1) + ' / ' + quiz.queue.length + '</span>' +
    '<span class="qbar"><i style="width:' + Math.round(quiz.i / quiz.queue.length * 100) + '%"></i></span>' +
    '<span>맞힘 ' + quiz.ok + ' · 틀림 ' + quiz.bad + '</span></div>';
  var body, label;

  if(mode === 'mc'){
    label = '뜻 고르기 — 처음 보는 낱말';
    body = '<div class="qword' + (v.kind === 'eng' ? ' ltr' : '') + '"' + (v.kind === 'heb' ? ' dir="rtl"' : '') + '>' +
             esc(wordOf(v)) + '</div>' +
           '<div class="qsub">' + esc(kindLabel(v.kind)) + (v.code ? ' · ' + esc(v.code) : '') +
             (v.lemma ? ' · 원형 ' + esc(v.lemma) : '') + '</div>' +
           '<div class="qchoices">' + choices.map(function(c,i){
               return '<button type="button" data-i="' + i + '">' + esc(cut(c.mean, 90)) + '</button>'; }).join('') +
           '</div>';
  } else if(mode === 'rev'){
    label = '낱말 고르기 — 뜻을 보고 떠올리기';
    body = '<div class="qmean dmean">' + esc(cut(v.mean, 150)) + '</div>' +
           '<div class="qsub">' + esc(kindLabel(v.kind)) + ' — 이 뜻에 맞는 낱말은?</div>' +
           '<div class="qchoices">' + choices.map(function(c,i){
               return '<button type="button" data-i="' + i + '"' + (c.kind === 'heb' ? ' dir="rtl"' : '') +
                      ' style="font-size:19px' + (c.kind === 'heb' ? ';font-family:\'Bible Hebrew\',serif' : '') + '">' +
                      esc(wordOf(c)) + '</button>'; }).join('') +
           '</div>';
  } else {
    label = '스스로 떠올리기 — 뜻을 생각한 뒤 뒤집기';
    body = '<div class="qword' + (v.kind === 'eng' ? ' ltr' : '') + '"' + (v.kind === 'heb' ? ' dir="rtl"' : '') + '>' +
             esc(wordOf(v)) + '</div>' +
           '<div class="qsub">' + esc(kindLabel(v.kind)) + (v.code ? ' · ' + esc(v.code) : '') + '</div>' +
           '<div class="qfoot" style="justify-content:center">' +
             '<button class="btn primary" id="qFlip">뒤집어 보기</button></div>';
  }
  pane.innerHTML = '<div class="qcard"><span class="qtype">' + label + '</span>' + head + body +
    '<div class="qfoot"><span class="qmsg" id="qMsg"></span>' +
      '<button class="btn" id="qSkip">건너뛰기</button>' +
      '<button class="btn" id="qStop">그만하기</button></div>' +
    (v.ref ? '<div class="qctx">' + esc(v.ref) + ' 에서 만난 낱말</div>' : '') + '</div>';
  var sayBtn = document.createElement('button');
  sayBtn.className = 'qsay'; sayBtn.type = 'button'; sayBtn.textContent = '발음 듣기';
  sayBtn.onclick = function(){ speak(sayOfCard(v)); };
  var anchorEl = pane.querySelector('.qsub') || pane.querySelector('.qword');
  if(anchorEl && anchorEl.parentNode) anchorEl.parentNode.insertBefore(sayBtn, anchorEl.nextSibling);

  function afterAnswer(right, showGrades){
    quiz.done++;
    markStudied(1);
    if(right) quiz.ok++; else quiz.bad++;
    if(!right && quiz.queue.indexOf(v, quiz.i + 1) < 0) quiz.queue.push(v);   /* 틀린 것은 이 자리에서 한 번 더 */
    if(!showGrades){
      grade(v, right ? 4 : 0);
      var next = document.createElement('button');
      next.className = 'btn primary'; next.textContent = '다음';
      next.onclick = function(){ quiz.i++; paintQuiz(); };
      $('qMsg').parentNode.insertBefore(next, $('qSkip'));
      $('qSkip').hidden = true;
    }
    paintStats();
  }

  if(mode === 'recall'){
    $('qFlip').onclick = function(){
      var card = pane.querySelector('.qcard');
      var rev = document.createElement('div');
      rev.className = 'qreveal';
      rev.innerHTML = '<div class="rw dmean">' + esc(v.mean) + '</div>' +
        (v.lemma ? '<div class="qsub" style="margin:8px 0 0">원형 ' + esc(v.lemma) +
                   (v.pron ? ' · <b class="dpron">' + esc(v.pron) + '</b>' : '') + '</div>' : '') +
        '<div class="qgrades">' +
          '<button type="button" class="again" data-q="0">다시<b>못 떠올림</b></button>' +
          '<button type="button" data-q="3">어려움<b>겨우 생각남</b></button>' +
          '<button type="button" data-q="4">좋음<b>떠올랐음</b></button>' +
          '<button type="button" data-q="5">쉬움<b>바로 나옴</b></button>' +
        '</div>';
      $('qFlip').parentNode.remove();
      card.insertBefore(rev, card.querySelector('.qfoot'));
      rev.querySelectorAll('.qgrades button').forEach(function(b){
        b.onclick = function(){
          var q = +b.dataset.q;
          grade(v, q);
          afterAnswer(q >= 3, true);
          quiz.i++; paintQuiz();
        };
      });
    };
  } else {
    var btns = pane.querySelectorAll('.qchoices button');
    var answered = false;
    btns.forEach(function(b, i){
      b.onclick = function(){
        if(answered) return;
        answered = true;
        var right = choices[i].id === v.id;
        btns.forEach(function(x, k){
          if(choices[k].id === v.id) x.classList.add('ok');
          else if(k === i) x.classList.add('no');
        });
        $('qMsg').innerHTML = right ? '맞았습니다'
          : '아쉽습니다 — 정답은 <b class="dmean">' +
            esc(mode === 'mc' ? cut(v.mean, 70) : wordOf(v)) + '</b>';
        afterAnswer(right, false);
      };
    });
  }
  $('qSkip').onclick = function(){ quiz.i++; paintQuiz(); };
  $('qStop').onclick = stopQuiz;
}
$('vbQuiz').onclick = startQuiz;

/* ─────────────── 오른쪽 단추 메뉴 ─────────────── */
/* 모달 바깥을 눌렀다가 바깥에서 뗄 때만 닫는다 — 본문을 끌어 고르다 밖에서 손을 떼도 창이 남는다 */
function backdropClose(id, fn){
  var el = $(id), down = false;
  el.addEventListener('mousedown', function(e){ down = (e.target === el); });
  el.addEventListener('click', function(e){ if(down && e.target === el) fn(); down = false; });
}
var CMENU = null;
function closeCMenu(){ if(CMENU){ CMENU.remove(); CMENU = null; } }
function openCMenu(x, y, items){
  closeCMenu();
  var d = document.createElement('div');
  d.className = 'cmenu';
  items.forEach(function(it){
    if(it === '-'){ var hr = document.createElement('div'); hr.className = 'divider'; d.appendChild(hr); return; }
    if(it instanceof Element){ d.appendChild(it); return; }
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = it[0];
    b.onclick = function(){ closeCMenu(); it[1](); };
    d.appendChild(b);
  });
  document.body.appendChild(d);
  var b2 = d.getBoundingClientRect();
  d.style.left = Math.max(6, Math.min(x, window.innerWidth - b2.width - 8)) + 'px';
  d.style.top  = Math.max(6, Math.min(y, window.innerHeight - b2.height - 8)) + 'px';
  CMENU = d;
}
document.addEventListener('click', closeCMenu);
document.addEventListener('scroll', closeCMenu, true);
function copyVerseOnly(bi,ci,vi,vid){
  var t = verses(vid,bi,ci)[vi];
  if(!t) return toast('복사할 본문이 없습니다');
  put(flat(split(t).text), ref(bi,ci,vi) + ' 복사됨 (본문만)');
}
/* ─────────────── 뒤로 가기 — 설정·검색·학습·메모장 등에서 마우스 뒤로 단추나 백스페이스로 본문에 돌아온다 ─────────────── */
function goBackToRead(){
  var prev = viewHist.pop();
  if(prev && prev !== st.view){ showView(prev, true); return true; }
  if(st.view === 'read') return false;
  showView('read', true);
  return true;
}
function anyPopupOpen(){
  return ['ciModal','trModal','atlasModal','findModal','kgModal','commModal','introModal','askModal','wordModal','readModal','studyModal'].some(function(id){ var m = $(id); return m && !m.hidden; }) || !$('recPop').hidden;
}
document.addEventListener('mouseup', function(e){
  if(e.button === 3){ e.preventDefault(); if(!anyPopupOpen()) goBackToRead(); }      /* 마우스 옆 단추(뒤로) */
});
document.addEventListener('mousedown', function(e){ if(e.button === 3) e.preventDefault(); });
window.addEventListener('app-nav-back', function(){ if(!anyPopupOpen()) goBackToRead(); });
document.addEventListener('keydown', function(e){
  if(e.key === 'BrowserBack'){ e.preventDefault(); if(!anyPopupOpen()) goBackToRead(); return; }
  if(e.key !== 'Backspace' || e.ctrlKey || e.altKey || e.metaKey) return;
  var t = e.target, tag = t && t.tagName;
  if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;   /* 글을 쓰는 중이면 지우기 */
  if(anyPopupOpen()) return;
  if(goBackToRead()) e.preventDefault();
});

/* ─────────────── 주석 목록 — 책별로 단락을 훑어보고 골라 읽는다 (성경연구 메뉴) ─────────────── */
var CI = { bi:0, opener:null };
function openCommIndex(bi){
  if(!COMM || !COMM.works || !COMM.works.length) return toast(window.COMMSTATE || '주석을 아직 풀지 않았습니다');
  CI.opener = document.activeElement; CI.bi = bi != null && bi >= 0 ? bi : (st.bi >= 0 ? st.bi : 0);
  var sb = $('ciBook'); sb.innerHTML = '';
  BOOKS.forEach(function(b, i){ if(commWorks(i).length) sb.add(new Option(b.n, i)); });
  sb.value = String(CI.bi); if(!sb.value){ sb.selectedIndex = 0; CI.bi = +sb.value; }
  $('ciModal').hidden = false; paintCommIndex(true);
  setTimeout(function(){ sb.focus(); }, 0);
}
function closeCommIndex(){ if($('ciModal').hidden) return; $('ciModal').hidden = true; if(CI.opener && CI.opener.focus) try{ CI.opener.focus(); }catch(e){} }
function paintCommIndex(resetWork){
  var bi = CI.bi, works = commWorks(bi), sw = $('ciWork');
  if(resetWork){ sw.innerHTML = ''; sw.add(new Option('모든 주석 (' + works.length + ')', '*')); works.forEach(function(w, i){ sw.add(new Option(w.name, String(COMM.works.indexOf(w)))); }); sw.value = '*'; }
  var pick = sw.value === '*' ? works : works.filter(function(w){ return String(COMM.works.indexOf(w)) === sw.value; });
  var big = $('ciBig').checked, rows = [];
  pick.forEach(function(w){
    w.secs.forEach(function(s){ if(s[0] !== bi) return; if(big && cmLen(w, s) < 700) return; rows.push({ w:w, s:s }); });
  });
  rows.sort(function(a, b){ return (a.s[1] - b.s[1]) || (a.s[2] - b.s[2]) || ((b.s[3] * 1000 + b.s[4]) - (a.s[3] * 1000 + a.s[4])); });
  $('ciCount').textContent = BOOKS[bi].n + ' · 단락 ' + rows.length + '개 · 주석 ' + works.length + '종';
  var out = '', lastC = -1;
  rows.forEach(function(r, i){
    if(r.s[1] !== lastC){ lastC = r.s[1]; out += '<div class="fp-book">' + BOOKS[bi].n + ' ' + lastC + '장</div>'; }
    out += '<div class="hit ci-row" tabindex="0" data-i="' + i + '"><div class="ref">' + esc(cmRange(r.s)) + '</div><div class="txt"><b>' + esc(r.s[7].replace(/\s+/g, ' ')) + '</b>' + (pick.length > 1 ? '<span class="dim"> · ' + esc(r.w.name) + '</span>' : '') + '</div></div>';
  });
  $('ciBody').innerHTML = out || '<div class="fp-empty">이 책에는 아직 주석이 없습니다.</div>';
  $('ciBody').querySelectorAll('.ci-row').forEach(function(el){
    var r = rows[+el.dataset.i];
    var go = function(){
      closeCommIndex();
      openChapter(bi, r.s[1] - 1, r.s[2] - 1);
      /* 그 주석·그 단락으로 곧바로 */
      var hits = commHits(bi, r.s[1] - 1, r.s[2] - 1);
      if(!hits.length) return;
      var wi = Math.max(0, hits.map(function(h){ return h.work; }).indexOf(r.w));
      var si = Math.max(0, hits[wi].secs.indexOf(r.s));
      CM = { bi:bi, ci:r.s[1] - 1, vi:r.s[2] - 1, list:hits, wi:wi, si:si };
      $('commModal').hidden = false; paintComm();
    };
    el.onclick = go; el.onkeydown = function(ev){ if(ev.key === 'Enter'){ ev.preventDefault(); go(); } };
  });
}
$('ciClose').onclick = closeCommIndex;
backdropClose('ciModal', closeCommIndex);
$('ciBook').onchange = function(){ CI.bi = +this.value; paintCommIndex(true); };
$('ciWork').onchange = function(){ paintCommIndex(false); };
$('ciBig').onchange = function(){ paintCommIndex(false); };

/* ─────────────── 구글 번역 — 영어를 끌어 고르고 오른쪽 단추 ─────────────── */
function selectedForTranslate(){
  var sel = window.getSelection(), t = sel ? String(sel).trim() : '';
  if(!t || !/[A-Za-z]{3,}/.test(t)) return '';
  return t;
}
function translateItems(){
  var t = selectedForTranslate(); if(!t) return [];
  var cut = t.length > 4500, body = cut ? t.slice(0, 4500) : t;
  var label = '🌐 구글 번역으로 보기 — “' + (t.length > 22 ? t.slice(0, 21) + '…' : t) + '”' + (cut ? ' (앞 4,500자)' : '');
  return [[label, function(){ openTranslate(body); if(cut) toast('너무 길어 앞 4,500자만 번역합니다'); }]];
}
/* 번역 창 — 프로그램 안에서, 같은 테마로 */
var TR = { src:'', out:'', opener:null, req:0 };
function openTranslate(text){
  TR.src = text; TR.out = ''; TR.opener = document.activeElement;
  $('trSrc').textContent = text; $('trOut').innerHTML = '<span class="dim">번역하는 중…</span>';
  $('trModal').hidden = false; $('trCopy').disabled = true;
  var my = ++TR.req;
  var done = function(r){
    if(my !== TR.req) return;
    if(r && r.ok){ TR.out = r.text; $('trOut').textContent = r.text; $('trCopy').disabled = false; }
    else $('trOut').innerHTML = '<span class="dim">번역을 받아오지 못했습니다' + (r && r.why ? ' (' + esc(String(r.why)) + ')' : '') + '. 인터넷 연결을 확인하거나 [사이트에서 열기]를 눌러 주세요.</span>';
  };
  if(window.WEB && WEB.translate) WEB.translate(text, 'auto', 'ko').then(done, function(){ done(null); });
  else done(null);
  setTimeout(function(){ $('trClose').focus(); }, 0);
}
function closeTranslate(){
  if($('trModal').hidden) return;
  $('trModal').hidden = true; TR.req++;
  if(TR.opener && TR.opener.focus) try{ TR.opener.focus(); }catch(e){}
}
$('trClose').onclick = closeTranslate;
backdropClose('trModal', closeTranslate);
$('trCopy').onclick = function(){ if(TR.out) put(TR.out, '번역을 복사했습니다'); };
$('trWeb').onclick = function(){ var url = 'https://translate.google.com/?sl=auto&tl=ko&op=translate&text=' + encodeURIComponent(TR.src.slice(0, 4500)); if(window.WEB && WEB.open) WEB.open(url); };
$('trModal').addEventListener('contextmenu', function(e){
  var t = String(window.getSelection() || '').trim(); if(!t) return;
  e.preventDefault(); openCMenu(e.clientX, e.clientY, [['고른 글 복사', function(){ put(t, '복사했습니다'); }]]);
});
/* 주석·개관·낱말 창 안에서 오른쪽 단추 */
['cmBody', 'inBody', 'mBody'].forEach(function(id){
  var el = $(id); if(!el) return;
  el.addEventListener('contextmenu', function(e){
    var items = translateItems();
    var t = String(window.getSelection() || '').trim();
    if(t) items.push(['고른 글 복사', function(){ put(t, '복사했습니다'); }]);
    if(!items.length) return;
    e.preventDefault(); openCMenu(e.clientX, e.clientY, items);
  });
});

/* ─────────────── 낱말 찾기 팝업 — 고른 글(또는 커서 밑 낱말)을 성경 전체에서 ─────────────── */
function wordForFind(e){
  var sel = window.getSelection(), s = sel ? String(sel).trim() : '';
  if(s && s.length <= 40 && s.indexOf('\n') < 0) return s;
  if(s) return '';
  var rng = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
  if(!rng || !rng.startContainer || rng.startContainer.nodeType !== 3) return '';
  var txt = rng.startContainer.nodeValue, i = rng.startOffset, ok = /[가-힣A-Za-z0-9\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF'’]/;
  var a = i, b = i;
  while(a > 0 && ok.test(txt[a-1])) a--;
  while(b < txt.length && ok.test(txt[b])) b++;
  var w = txt.slice(a, b).trim();
  return w.length >= 1 && w.length <= 40 ? w : '';
}
var FP = { q:'', scope:'all', opener:null };
/* 고른 글의 문자로 어느 성경에서 찾을지 정한다: 히브리어 → WLC, 헬라어 → Nestle, 영어 → NASB, 그 밖 → 기본 성경 */
function hstrip(t){ return String(t || '').replace(/[֑-ׇ]/g, '').replace(/־/g, ' ').replace(/[׃׀]/g, ''); }
function findVidFor(q){
  if(/[֐-׿]/.test(q)) return TEXT.wlc ? 'wlc' : S.base;
  if(/[Ͱ-Ͽἀ-῿]/.test(q)) return TEXT.grk ? 'grk' : S.base;
  if(/[A-Za-z]/.test(q) && !/[가-힣]/.test(q)) return TEXT.nasb ? 'nasb' : (TEXT.kjv ? 'kjv' : S.base);
  return S.base;
}
function findAll(q, scope){
  var vid = findVidFor(q), M;
  if(vid === 'wlc'){
    var hq = hstrip(q).trim();
    if(!hq) return { err:'찾을 낱말을 적어 주세요.', hits:[] };
    M = { heb:true, terms:[hq], test:function(t){ return hstrip(t).indexOf(hq) >= 0; } };
  } else {
    M = buildMatcher(q); if(M.err) return { err:M.err, hits:[] };
  }
  var hits = [], truncated = false, LIM = 500;
  outer:
  for(var bi=0; bi<BOOKS.length; bi++){
    if(scope === 'ot' && BOOKS[bi].t !== 0) continue;
    if(scope === 'nt' && BOOKS[bi].t !== 1) continue;
    var book = TEXT[vid] && TEXT[vid][bi]; if(!book) continue;
    for(var ci=0; ci<book.length; ci++){
      var ch = book[ci];
      for(var vi=0; vi<ch.length; vi++){
        var t = ch[vi]; if(!t) continue;
        var ok = vid === 'grk' && M.greek ? M.test(gnormVerse(bi,ci,vi)) : M.test(t);
        if(ok){ if(hits.length >= LIM){ truncated = true; break outer; } hits.push({ bi:bi, ci:ci, vi:vi, t:t }); }
      }
    }
  }
  return { M:M, hits:hits, truncated:truncated, vid:vid };
}
function openFindPop(q){
  FP.q = q; FP.opener = document.activeElement;
  $('findModal').hidden = false;
  paintFindPop();
  setTimeout(function(){ var f = $('fpBody').querySelector('.hit'); if(f) f.focus(); else $('fpClose').focus(); }, 0);
}
function closeFindPop(){
  if($('findModal').hidden) return;
  $('findModal').hidden = true;
  if(FP.opener && FP.opener.focus) try{ FP.opener.focus(); }catch(e){}
}
function paintFindPop(){
  var r = findAll(FP.q, FP.scope), box = $('fpBody');
  $('fpQ').textContent = '“' + FP.q + '”';
  $('fpScope').querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.s === FP.scope); });
  if(r.err){ $('fpCount').textContent = ''; box.innerHTML = '<div class="fp-empty">' + esc(r.err) + '</div>'; return; }
  var books = {}; r.hits.forEach(function(h){ books[h.bi] = (books[h.bi] || 0) + 1; });
  $('fpCount').textContent = r.hits.length ? r.hits.length + '개 구절' + (r.truncated ? ' 이상 (앞 500개만)' : '') + ' · ' + Object.keys(books).length + '책 · ' + vinfo(r.vid).name : '찾지 못했습니다 · ' + vinfo(r.vid).name;
  if(!r.hits.length){ box.innerHTML = '<div class="fp-empty">‘' + esc(FP.q) + '’ 이(가) 들어 있는 절이 없습니다.<br><span class="dim">조사나 어미를 빼고 어간만 골라 보세요 (예: 바리새인이요 → 바리새인)</span></div>'; return; }
  var out = '', lastB = -1;
  r.hits.forEach(function(x, i){
    if(x.bi !== lastB){ lastB = x.bi; out += '<div class="fp-book' + (BOOKS[x.bi].t === 1 ? ' nt' : ' ot') + '">' + esc(BOOKS[x.bi].n) + ' <span>' + books[x.bi] + '</span></div>'; }
    var body;
    if(r.M.heb){
      body = x.t.split(' ').map(function(w){ var ww = esc(heb(w)); return hstrip(w).indexOf(r.M.terms[0]) >= 0 ? '<mark>' + ww + '</mark>' : ww; }).join(' ');
    } else if(r.vid === 'grk' && r.M.greek){
      body = greekPreview(x, r.M.terms) || esc(x.t);
    } else {
      var p = split(x.t), disp = (p.head ? '〔' + p.head + '〕 ' : '') + p.text;
      body = flat(esc(disp)).replace(r.M.re, function(m){ return '<mark>' + m + '</mark>'; });
    }
    var kor = r.vid !== 'gyr' ? korText(x.bi, x.ci, x.vi) : '';
    out += '<div class="hit" tabindex="0" data-i="' + i + '"><div class="ref">' + ref(x.bi,x.ci,x.vi) + '</div><div class="txt' + (r.vid === 'wlc' ? ' heb' : r.vid === 'grk' ? ' grk' : '') + '">' + body + '</div>' + (kor ? '<div class="kor">' + esc(kor) + '</div>' : '') + '</div>';
  });
  box.innerHTML = out;
  box.querySelectorAll('.hit').forEach(function(el){
    var x = r.hits[+el.dataset.i];
    var go = function(){ closeFindPop(); openChapter(x.bi, x.ci, x.vi); };
    el.onclick = go;
    el.onkeydown = function(ev){ if(ev.key === 'Enter'){ ev.preventDefault(); go(); } };
  });
  box.scrollTop = 0;
}
$('fpClose').onclick = closeFindPop;
backdropClose('findModal', closeFindPop);
$('fpScope').onclick = function(e){ var b = e.target.closest('button'); if(!b) return; FP.scope = b.dataset.s; paintFindPop(); };
$('fpMore').onclick = function(){ closeFindPop(); showView('search'); $('q').value = FP.q; $('scope').value = FP.scope; $('scopeBook').value = ''; var v = findVidFor(FP.q); if([].some.call($('sver').options, function(o){ return o.value === v; })) $('sver').value = v; doSearch(); };

/* ─────────────── 히스토리 — 왼쪽 단추로 누른 절을 묵상 기록으로 남긴다 ─────────────── */
var RHKEY = 'bibleApp.readHist', rdHist = [];
function loadRdHist(){ try{ rdHist = JSON.parse(localStorage.getItem(RHKEY) || '[]') || []; }catch(e){ rdHist = []; } if(!Array.isArray(rdHist)) rdHist = []; }
function saveRdHist(){ try{ localStorage.setItem(RHKEY, JSON.stringify(rdHist.slice(0, 300))); }catch(e){} }
function recordRead(bi, ci, vi){
  var now = Date.now(), last = rdHist[0];
  if(last && last.bi === bi && last.ci === ci && last.vi === vi){ last.t = now; }
  else rdHist.unshift({ bi:bi, ci:ci, vi:vi, t:now });
  if(rdHist.length > 300) rdHist.length = 300;
  saveRdHist(); paintRdHist();
}
function dayLabel(t){
  var d = new Date(t), today = new Date(); today.setHours(0,0,0,0);
  var diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if(diff === 0) return '오늘'; if(diff === 1) return '어제';
  return (d.getMonth()+1) + '월 ' + d.getDate() + '일' + (d.getFullYear() !== today.getFullYear() ? ' ' + d.getFullYear() : '');
}
function paintRdHist(){
  var box = $('rdHist'); if(!box) return;
  if(!rdHist.length){ box.innerHTML = '<div class="bh-empty">본문에서 절을 누르면 여기에 남습니다</div>'; return; }
  var out = '', day = '';
  rdHist.slice().reverse().forEach(function(h){
    var i = rdHist.indexOf(h);
    var dl = dayLabel(h.t);
    if(dl !== day){ day = dl; out += '<div class="bh-day">' + dl + '</div>'; }
    var d = new Date(h.t), hh = d.getHours(), mm = ('0' + d.getMinutes()).slice(-2);
    var cur = st.mode === 'chapter' && st.bi === h.bi && st.ci === h.ci;
    out += '<div role="button" tabindex="0" class="bh-item' + (h.bi >= 39 ? ' nt' : ' ot') + (cur ? ' cur' : '') + '" data-i="' + i + '" title="' + esc(ref(h.bi, h.ci, h.vi) + ' — ' + (korText(h.bi, h.ci, h.vi) || '')) + '">' +
           '<span class="bh-ref">' + esc(ref(h.bi, h.ci, h.vi)) + '</span><span class="bh-time">' + hh + ':' + mm + '</span>' +
           '<button type="button" class="bh-x" data-x="' + i + '" title="이 기록 지우기" aria-label="이 기록 지우기">×</button></div>';
  });
  box.innerHTML = out;
}
$('rdHist').onclick = function(e){
  var x = e.target.closest('.bh-x');
  if(x){ e.stopPropagation(); rdHist.splice(+x.dataset.x, 1); saveRdHist(); paintRdHist(); return; }
  var b = e.target.closest('.bh-item'); if(!b) return;
  var h = rdHist[+b.dataset.i]; if(!h) return;
  openChapter(h.bi, h.ci, h.vi);
};
$('rdHist').onkeydown = function(e){
  var b = e.target.closest('.bh-item'); if(!b) return;
  if(e.key === 'Enter'){ e.preventDefault(); b.click(); }
  else if(e.key === 'Delete'){ e.preventDefault(); rdHist.splice(+b.dataset.i, 1); saveRdHist(); paintRdHist(); }
};
$('rdHistClear').onclick = function(){
  if(!rdHist.length) return;
  if(!confirm('묵상 기록 ' + rdHist.length + '개를 모두 지울까요?')) return;
  rdHist = []; saveRdHist(); paintRdHist(); toast('히스토리를 지웠습니다');
};
/* 누르는 순간의 상태를 기억한다 — 블록이 있었으면(해제하려는 클릭) 또는 끌어서 고르면 기록하지 않는다 */
var rdDown = null;
$('reader').addEventListener('mousedown', function(e){
  if(e.button !== 0){ rdDown = null; return; }
  var sel = window.getSelection();
  rdDown = { x:e.clientX, y:e.clientY, hadSel: !!(sel && String(sel).trim()) };
});
$('reader').addEventListener('click', function(e){
  if(e.button !== 0) return;
  var d = rdDown; rdDown = null;
  if(!d || d.hadSel) return;                                                      /* 블록 해제용 클릭 */
  if(Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) return;           /* 끌어서 고른 경우 */
  if(e.detail > 1) return;                                                        /* 두 번·세 번 눌러 낱말·줄 고르기 */
  if(e.target.closest('a, button, .wpop, .morph, input, select')) return;
  var sel = window.getSelection(); if(sel && String(sel).trim()) return;
  var row = e.target.closest ? e.target.closest('.vpara,.vrow') : null;
  if(!row || row.dataset.b === undefined) return;
  if(st.mode !== 'chapter' || st.bi < 0) return;
  recordRead(+row.dataset.b, +row.dataset.c, +row.dataset.v);
});
loadRdHist(); paintRdHist();

$('reader').addEventListener('contextmenu', function(e){
  /* .sv 는 스테판 원어 성경의 절 줄 — 거기서도 같은 메뉴가 나온다 */
  var row = e.target.closest ? e.target.closest('.vpara,.vrow,.sv') : null;
  if(!row || row.dataset.b === undefined) return;
  e.preventDefault();
  hideWordPop();
  var bi = +row.dataset.b, ci = +row.dataset.c, vi = +row.dataset.v;
  var vs = versionsFor(bi), items = [];
  /* 여러 절을 긁은 채 눌렀으면 그 범위를 */
  var rng = null, sel = window.getSelection();
  if(sel && !sel.isCollapsed && sel.rangeCount && $('reader').contains(sel.getRangeAt(0).commonAncestorContainer)){
    var picked = [];
    $('reader').querySelectorAll('.vpara,.vrow,.sv').forEach(function(el){ if(sel.containsNode(el, true)) picked.push(el); });
    var gs = selectionGroups(picked);
    if(gs.length){
      rng = gs.filter(function(g){ return g.bi === bi && g.ci === ci && vi >= g.from && vi <= g.to; })[0] || gs[0];
      if(rng.from === rng.to && gs.length === 1) rng = null;
    }
  }
  var one = { bi:bi, ci:ci, from:vi, to:vi }, lg = langName(langOf(bi));
  var label = rng ? rng.label : ref(bi,ci,vi);

  /* 1 주석 */
  var hits = commHits(bi, ci, vi);
  if(hits.length) items.push(['📖 주석 보기' + (hits.length > 1 ? ' (' + hits.length + '종)' : ' — ' + hits[0].work.name), function(){ openComm(bi, ci, vi); }]);
  /* 2 지도 */
  if(window.ATLAS) items.push(['🗺 지도 보기 — ' + ref(bi,ci,vi), function(){ ATLAS.openFor(bi, ci, vi); }]);
  /* 2-1 성경지도 학습 — 이 절·장을 다루는 해설 */
  if(window.STUDY) STUDY.forVerse(bi, ci, vi).slice(0, 3).forEach(function(a){ items.push(['📚 성경지도 학습 — ' + a.title, function(){ STUDY.open(a.id); }]); });
  /* 3 검색 (고른 낱말·번역) */
  var fw = wordForFind(e);
  if(fw) items.push(['🔍 “' + (fw.length > 24 ? fw.slice(0, 23) + '…' : fw) + '” 성경 전체에서 찾기', function(){ openFindPop(fw); }]);
  translateItems().forEach(function(it){ items.push(it); });
  var winfo = infoFromEvent(e);
  if(winfo){
    var wshort = cut(winfo.word, 14);
    items.push(['‘' + wshort + '’ 자세히 보기', function(){ openWordModal(winfo); }]);
    items.push(['‘' + wshort + '’ 인터넷에서 찾기', function(){ webSearch(winfo); }]);
    items.push(['‘' + wshort + '’ 뜻 적어 넣기', function(){ askMeaning(winfo); }]);
    if(!vocabFind(vocabId(winfo))) items.push(['‘' + wshort + '’ 단어장에 담기', function(){ addVocab(winfo); }]);
  }
  items.push('-');
  /* 4 메모 */
  items.push(['📝 메모에 담기 — ' + label, function(){ if(window.NT) NT.fromVerses(vs, rng || one); }]);
  /* 5 형광펜 */
  if(window.HL) items.push('-', HL.menuRow(rng || one));
  items.push('-');
  /* 6·7 듣기 */
  if(rng) items.push(['🔊 ' + lg + '로 듣기 — ' + rng.label, function(){ openReading([rng]); }]);
  items.push(['🔊 ' + lg + '로 이 절 듣기 — ' + ref(bi,ci,vi), function(){ openReading([one]); }]);
  items.push(['🔊 ' + lg + '로 이 장 전체 듣기 (' + (vi+1) + '절부터)', function(){ openReading([{ bi:bi, ci:ci, from:-1, to:-1 }], vi); }]);
  items.push(['📚 원어 학습에 담기 — ' + label, function(){ addLessonGroups([rng || one]); }]);
  items.push('-');
  /* 8 복사 */
  items.push([label + ' 복사', function(){ if(rng) put(copyText(vs, [rng]), rng.label + ' 복사됨'); else copyVerse(bi,ci,vi); }]);
  if(vs.length > 1){
    vs.forEach(function(v){
      items.push([v.name + '으로만 복사', function(){
        put(copyText([v], [rng || { bi:bi, ci:ci, from:vi, to:vi, label:ref(bi,ci,vi) }]), label + ' 복사됨 (' + v.short + ')');
      }]);
    });
  }
  openCMenu(e.clientX, e.clientY, items);
});

/* ─────────────── 단축키 ─────────────── */
document.addEventListener('keydown', function(e){
  var mod = e.ctrlKey || e.metaKey;
  var typing = e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA';
  if(mod && e.key.toLowerCase() === 'f'){ e.preventDefault(); showView('search'); return; }
  if(mod && e.key.toLowerCase() === 'b'){ e.preventDefault(); toggleNav(); return; }
  if(mod && e.key.toLowerCase() === 'd'){ e.preventDefault(); cycleTheme(); return; }
  if(mod && (e.key === '+' || e.key === '=')){ e.preventDefault(); bumpFont(1); return; }
  if(mod && (e.key === '-' || e.key === '_')){ e.preventDefault(); bumpFont(-1); return; }
  if(mod && e.code === 'Space'){ if(PL.list.length){ e.preventDefault(); togglePlay(); } return; }
  if(e.key === 'Escape'){
    if(window.KG && KG.isOpen()){ KG.close(); return; }
    if(window.ATLAS && ATLAS.isOpen()){ ATLAS.close(); return; }
    if(!$('ciModal').hidden){ closeCommIndex(); return; }
    if(!$('trModal').hidden){ closeTranslate(); return; }
    if(!$('findModal').hidden){ closeFindPop(); return; }
    if(!$('recPop').hidden){ rpCloseAsk(); return; }
    if(!$('readModal').hidden){ closeRead(); return; }
    if(!$('commModal').hidden){ closeComm(); return; }
    if(!$('introModal').hidden){ closeIntro(); return; }
    if(!$('askModal').hidden){ closeAsk(); return; }
    if(!$('wordModal').hidden){ closeWordModal(); return; }
    closeCMenu(); closeDrops(); closeMorph(); hideWordPop(); return;
  }
  if(typing) return;
  if(st.view === 'read'){
    if(e.key === 'ArrowLeft')  step(-1);
    else if(e.key === 'ArrowRight') step(1);
  }
  if(st.view === 'search'){
    if(e.key === 'ArrowDown'){ e.preventDefault(); moveSel(1); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); moveSel(-1); }
  }
});

/* ─────────────── 원어로 듣기 · 따라 읽기 ───────────────
   히브리어(구약)·헬라어(신약) 절을 이 컴퓨터의 Piper 음성으로 읽어 준다.
   재생기(#player)는 화면 아래에 늘 남아 있어, 검색·설정으로 옮겨도 소리가 이어진다.
   듣던 자리는 저장해 두었다가 다음에 열 때 '이어 듣기'로 되살린다. */
var PKEY = 'bibleApp.player', LKEY = 'bibleApp.lessons';
var PL = { list:[], i:0, rate:1, repeat:1, echo:false, loop:false, on:false, rep:0, lesson:'' };
var pAudio = new Audio();
pAudio.preload = 'auto';
var pTimer = null, pReq = 0, pSrcReq = 0, pFails = 0, AUD_INFO = null;

function langOf(bi){ return BOOKS[bi].t === 0 ? 'wlc' : 'grk'; }
function langName(vid){ return vid === 'grk' ? '헬라어' : '히브리어'; }
function origText(vid,bi,ci,vi){ return verses(vid,bi,ci)[vi] || ''; }
function korText(bi,ci,vi){ var t = verses('gyr',bi,ci)[vi]; return t ? flat(split(t).text) : ''; }
function buildList(groups){
  var list = [];
  (groups || []).forEach(function(g){
    var p = g.from < 0 ? expand(g) : g, vid = langOf(p.bi);
    for(var v=p.from; v<=p.to; v++) if(origText(vid,p.bi,p.ci,v)) list.push({ vid:vid, bi:p.bi, ci:p.ci, vi:v });
  });
  return list;
}
function listLabel(list){
  if(!list || !list.length) return '';
  var a = list[0], b = list[list.length-1];
  if(list.length === 1) return ref(a.bi,a.ci,a.vi);
  if(a.bi === b.bi && a.ci === b.ci) return BOOKS[a.bi].n + ' ' + (a.ci+1) + ':' + (a.vi+1) + '-' + (b.vi+1);
  return ref(a.bi,a.ci,a.vi) + ' ~ ' + ref(b.bi,b.ci,b.vi);
}
function savePL(){
  try{ localStorage.setItem(PKEY, JSON.stringify({ list:PL.list, i:PL.i, rate:PL.rate, repeat:PL.repeat,
                                                    echo:PL.echo, loop:PL.loop, rec:PL.rec, lesson:PL.lesson })); }catch(e){}
}
function loadPL(){
  try{
    var o = JSON.parse(localStorage.getItem(PKEY) || 'null');
    if(o && o.list && o.list.length){
      PL.list = o.list; PL.i = Math.min(o.i || 0, o.list.length-1);
      PL.rate = +o.rate || 1; PL.repeat = +o.repeat || 1; PL.echo = !!o.echo; PL.loop = !!o.loop; PL.rec = false; PL.lesson = o.lesson || '';
      return true;
    }
  }catch(e){}
  return false;
}
function tellMain(on){ if(window.AUDIO && AUDIO.playing) AUDIO.playing(on); }
function cur(){ return PL.list[PL.i] || null; }

function startPlay(list, i, lessonId){
  if(!list || !list.length) return toast('들을 원어 본문이 없습니다');
  if(!window.AUDIO) return toast('이 창에서는 원어 듣기를 쓸 수 없습니다');
  PL.list = list; PL.i = Math.max(0, Math.min(i || 0, list.length-1)); PL.rep = 0; PL.lesson = lessonId || '';
  PL.on = true; pFails = 0; PL.asked = true; PL.dismissed = false;
  $('player').hidden = false;
  savePL(); paintPlayer(); playCur();
}
/* 재생기는 지금 보는 장을 따라간다.
   · 목록이 다른 장이면 멈추고 이 장으로 바꾼다
   · 원어(히브리어·헬라어) 성경을 함께 볼 때, 또는 직접 듣기를 눌렀을 때만 보인다 */
function origActive(){
  return st.mode === 'chapter' && st.bi >= 0 && versionsFor(st.bi).some(function(v){ return v.id === 'wlc' || v.id === 'grk'; });
}
function syncPlayerToChapter(){
  if(!PL || !pAudio) return;                       /* 시작할 때 재생기가 준비되기 전의 그리기 */
  if(st.mode !== 'chapter' || st.bi < 0){ $('player').hidden = true; return; }
  var first = PL.list[0];
  var here = first && first.bi === st.bi && first.ci === st.ci;
  if(!here){
    if(PL.on) pausePlay();
    try{ pAudio.removeAttribute('src'); pAudio.load(); }catch(e){}
    PL.list = buildList([{ bi:st.bi, ci:st.ci, from:-1, to:-1 }]);
    PL.i = 0; PL.rep = 0; PL.lesson = ''; PL.asked = false; PL.dismissed = false;
    savePL(); paintPlayer();
  }
  $('player').hidden = !PL.list.length || PL.dismissed || !(origActive() || PL.asked || PL.on);
}
function playCur(){
  var it = cur();
  if(!it){ pausePlay(); return; }
  var my = ++pReq;
  clearTimeout(pTimer);
  try{ pAudio.pause(); }catch(e){}            /* 앞 절이 아직 나는 중이면 먼저 멈춘다 */
  paintPlayer(); paintRead(true);
  AUDIO.verse({ vid:it.vid, bi:it.bi, ci:it.ci, vi:it.vi, text:origText(it.vid,it.bi,it.ci,it.vi) }).then(function(r){
    if(my !== pReq) return;
    pSrcReq = my;
    if(!r || !r.ok){
      pFails++;
      toast(r && r.why === 'no-python' ? '음성 엔진(파이썬·Piper)을 찾지 못했습니다'
                                       : '이 절의 음성을 만들지 못했습니다' + (r && r.why ? ' (' + String(r.why).slice(0, 40) + ')' : ''));
      if(pFails >= 3 || PL.i >= PL.list.length-1){ pausePlay(); return; }
      pTimer = setTimeout(function(){ stepPlay(1); }, 800);
      return;
    }
    pFails = 0;
    pAudio.src = r.url;
    pAudio.playbackRate = PL.rate;
    pAudio.play().then(function(){ tellMain(true); paintPlayer(); paintRead(false); },
                       function(){ toast('소리를 낼 수 없습니다'); pausePlay(); });
    prefetchAhead();
  }, function(){ if(my === pReq){ toast('음성 엔진에 닿지 못했습니다'); pausePlay(); } });
}
function prefetchAhead(){
  var ahead = [];
  for(var k=PL.i+1; k<PL.list.length && ahead.length<4; k++){
    var it = PL.list[k];
    ahead.push({ vid:it.vid, bi:it.bi, ci:it.ci, vi:it.vi, text:origText(it.vid,it.bi,it.ci,it.vi) });
  }
  if(ahead.length && AUDIO.prefetch) AUDIO.prefetch(ahead);
}
/* 따라 읽기 쉼 동안 남은 초를 보여 준다 */
var echoTick = 0;
function echoCountdown(ms){
  clearInterval(echoTick);
  var end = Date.now() + ms;
  function show(){
    var left = Math.ceil((end - Date.now()) / 1000);
    if(left <= 0 || !PL.on){ clearInterval(echoTick); $('rdHint').textContent = ''; return; }
    $('rdHint').textContent = '따라 읽어 보세요 · 다음 절까지 ' + left + '초';
  }
  show(); echoTick = setInterval(show, 250);
}
pAudio.addEventListener('ended', function(){
  if(!PL.on || pSrcReq !== pReq) return;      /* 바뀌기 전 절의 '끝남'은 무시 */
  PL.rep++;
  var dur = isFinite(pAudio.duration) ? pAudio.duration : 3;
  var rec = false;
  var gap = PL.echo ? Math.min(15000, Math.max(1400, dur * 1000 * 1.2 / Math.max(PL.rate, 0.8))) : 350;
  if(rec){ PL.rep = 0; paintPlayer(); recStart(cur()); pTimer = setTimeout(recFinish, gap); return; }
  if(PL.rep < PL.repeat){
    paintPlayer(); if(!rec) $('rdHint').textContent = PL.echo ? '따라 읽어 보세요 — 곧 다시 들려 드립니다' : '';
    pTimer = setTimeout(function(){ recStop(); if(!PL.on) return; pAudio.currentTime = 0; pAudio.play().catch(function(){}); $('rdHint').textContent = ''; }, gap);
    return;
  }
  PL.rep = 0;
  if(PL.echo) echoCountdown(gap);
  pTimer = setTimeout(function(){ if(PL.on) stepPlay(1, true); }, gap);
});
pAudio.addEventListener('timeupdate', function(){
  paintProgress();
});
/* 장 전체에서 얼마나 왔는지: (지나간 절 + 지금 절의 진행) / 전체 절 */
function paintProgress(){
  var n = PL.list.length; if(!n) return;
  var part = (isFinite(pAudio.duration) && pAudio.duration > 0) ? Math.min(1, pAudio.currentTime / pAudio.duration) : 0;
  var pct = Math.min(100, (PL.i + part) / n * 100);
  ['plFill','rdFill'].forEach(function(id){ var f = $(id); if(f) f.style.width = pct + '%'; });
  var lab = $('rdProg'); if(lab) lab.textContent = Math.round(pct) + '%';
}

function stepPlay(d, auto){
  if(!PL.list.length) return;
  var n = PL.i + d;
  if(n >= PL.list.length){
    if(PL.loop) n = 0;
    else { finishPlay(); return; }
  }
  if(n < 0) n = 0;
  PL.i = n; PL.rep = 0; PL.on = true; savePL(); playCur();
}
function pausePlay(){
  recStop();
  PL.on = false; clearTimeout(pTimer); pReq++;
  try{ pAudio.pause(); }catch(e){}
  tellMain(false); savePL(); paintPlayer(); paintRead(false);
}
function resumePlay(){
  if(!PL.list.length) return;
  PL.on = true; pFails = 0;
  $('player').hidden = false;
  if(pAudio.src && pAudio.paused && !pAudio.ended && pAudio.currentTime > 0){
    pAudio.playbackRate = PL.rate;
    pAudio.play().then(function(){ tellMain(true); paintPlayer(); }, function(){ playCur(); });
  } else playCur();
}
function togglePlay(){ if(PL.on) pausePlay(); else resumePlay(); }
function finishPlay(){
  PL.on = false; clearTimeout(pTimer);
  try{ pAudio.pause(); }catch(e){}
  tellMain(false);
  if(PL.lesson) bumpLesson(PL.lesson);
  PL.i = 0; PL.rep = 0; savePL(); paintPlayer(); paintRead(false);
  toast(listLabel(PL.list) + ' 다 들었습니다');
}
function closePlayer(){
  recStop(true); rpDiscardTake(); rpHide();
  pausePlay();
  try{ mineAudio.pause(); }catch(e){}
  PL.dismissed = true; PL.asked = false; savePL();
  $('player').hidden = true; closeRead();
}
function setRate(r){ PL.rate = +r || 1; pAudio.playbackRate = PL.rate; savePL(); syncPlayerUI(); }
function syncPlayerUI(){
  ['pl','rd'].forEach(function(p){
    $(p+'Rate').value = String(PL.rate); if(!$(p+'Rate').value) $(p+'Rate').value = '1';
    $(p+'Repeat').value = String(PL.repeat);
    $(p+'Echo').setAttribute('aria-pressed', PL.echo ? 'true' : 'false');
    $(p+'Loop').setAttribute('aria-pressed', PL.loop ? 'true' : 'false');
    $(p+'Rec').setAttribute('aria-pressed', PL.rec ? 'true' : 'false');
    $(p+'Play').innerHTML = PL.on ? IC.pause : IC.play;
    $(p+'Play').title = PL.on ? '멈춤 (Ctrl+Space)' : '재생 (Ctrl+Space)';
  });
}
function paintPlayer(){
  var it = cur();
  if(!it){ $('plRef').textContent = '—'; $('plSub').textContent = ''; return; }
  $('plRef').textContent = ref(it.bi,it.ci,it.vi);
  $('plSub').textContent = langName(it.vid) + ' · ' + (PL.i+1) + '/' + PL.list.length + ' · ' + listLabel(PL.list) +
                           (PL.repeat > 1 ? ' · ' + (PL.rep+1) + '/' + PL.repeat + '번째' : '') +
                           (PL.on ? '' : ' · 멈춤');
  paintProgress();
  syncPlayerUI(); paintMine();
  if(RP.mode === 'ready') rpShow('ready');
  document.querySelectorAll('.lcard').forEach(function(c){ c.classList.toggle('now', !!PL.lesson && c.dataset.id === PL.lesson); });
}
function setEcho(on){ PL.echo = on; if(!on && PL.rec){ PL.rec = false; recStop(); micOff(); } savePL(); syncPlayerUI(); }
/* 녹음할 절: 듣던 절, 없으면 지금 보는 장의 첫 절 */
function recTarget(){
  var it = cur();
  if(it) return it;
  if(st.bi < 0) return null;
  return { bi:st.bi, ci:st.ci, vi:0, vid:(st.bi >= 39 ? 'grk' : 'wlc') };
}
function setRec(on){
  PL.rec = on;
  if(on){
    if(PL.on) pausePlay();                  /* 녹음을 누르면 재생은 멈추고 곧바로 녹음한다 */
    var it = recTarget();
    if(!it){ PL.rec = false; savePL(); syncPlayerUI(); return toast('먼저 책과 장을 고르세요'); }
    micOn().then(function(){
      if(!PL.rec) return;
      recStart(it, true);
    }, function(){ toast('마이크를 쓸 수 없습니다 — 윈도우 설정에서 마이크 사용을 허용해 주세요'); PL.rec = false; savePL(); syncPlayerUI(); });
  }
  else { recStop(true); rpDiscardTake(); rpHide(); micOff(); }
  savePL(); syncPlayerUI();
}
['pl','rd'].forEach(function(p){
  $(p+'Play').onclick = togglePlay;
  $(p+'Prev').onclick = function(){ stepPlay(-1); };
  $(p+'Next').onclick = function(){ stepPlay(1); };
  $(p+'Again').onclick = function(){ PL.rep = 0; PL.on = true; playCur(); };
  $(p+'Rate').onchange = function(){ setRate(this.value); };
  $(p+'Repeat').onchange = function(){ PL.repeat = +this.value || 1; PL.rep = 0; savePL(); paintPlayer(); };
  $(p+'Echo').onclick = function(){ setEcho(!PL.echo); };
  $(p+'Loop').onclick = function(){ PL.loop = !PL.loop; savePL(); syncPlayerUI(); };
  $(p+'Rec').onclick = function(){ setRec(!PL.rec); };
  $(p+'Mine').onclick = function(){ playMine(this.dataset.url); };
  $(p+'RecDir').onclick = function(){ REC.folder(); };
});
$('plClose').onclick = closePlayer;

/* ── 원어 읽기 창 ── */
function openRead(){ if(!PL.list.length) return; $('readModal').hidden = false; paintRead(false); }
function closeRead(){ var was = !$('readModal').hidden; $('readModal').hidden = true; if(was){ if(PL.on) pausePlay(); try{ mineAudio.pause(); }catch(e){} } }   /* 창을 닫으면 소리도 멈춘다 */
function origInner(it){
  var t = origText(it.vid,it.bi,it.ci,it.vi);
  if(it.vid === 'grk'){
    var ws = gwordsOf(it.bi,it.ci,it.vi);
    if(ws && ws.length) return ws.map(function(w){ return '<span class="w">' + esc(w[0]) + '</span>'; }).join(' ');
    return esc(t);
  }
  return t.split(' ').map(function(w){ return '<span class="w">' + esc(heb(w)) + '</span>'; }).join(' ');
}
function paintRead(busy){
  if($('readModal').hidden) return;
  var it = cur();
  if(!it) return;
  $('rdRef').textContent = ref(it.bi,it.ci,it.vi);
  $('rdLang').textContent = langName(it.vid) + (it.vid === 'grk' ? ' (Nestle 1904)' : ' (WLC)');
  var o = $('rdOrig');
  o.className = 'rd-orig ' + (it.vid === 'grk' ? 'grk' : 'heb');
  o.setAttribute('dir', it.vid === 'grk' ? 'ltr' : 'rtl');
  o.innerHTML = origInner(it);
  $('rdKor').textContent = korText(it.bi,it.ci,it.vi);
  $('rdPos').textContent = (PL.i+1) + ' / ' + PL.list.length + ' 절';
  syncPlayerUI();
  $('rdHint').textContent = busy ? '음성을 준비하는 중…' : (PL.echo ? '들은 뒤 소리 내어 따라 읽어 보세요' : '');
  document.querySelector('#readModal .rd-body').classList.toggle('busy', !!busy);
  $('rdHint').classList.remove('recording');
  paintMine();
}
/* ── 내 목소리 녹음: 따라 읽기 쉼 동안 마이크로 녹음 → 절마다 저장 ── */
var recStream = null, recMR = null, recChunks = [], recKey = '', mineAudio = new Audio();
function recKeyOf(it){ return it ? ref(it.bi,it.ci,it.vi).replace(/\s+/g, '_').replace(/:/g, '-') + '_' + it.vid : ''; }
function micOn(){
  if(recStream) return Promise.resolve(recStream);
  return navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true } })
    .then(function(st){ recStream = st; return st; });
}
function micOff(){ if(recStream){ recStream.getTracks().forEach(function(t){ t.stop(); }); recStream = null; } }
/* 녹음 팝업: 녹음 중에는 목소리 파형·시간, 끝나면 들어 보기·다시·삭제·저장 */
var RP = { mode:'', take:null, ctx:null, an:null, src:null, raf:0, t0:0, peaks:[], discard:false, auto:false, busy:false };
function rpShow(mode){
  var pop = $('recPop'); pop.hidden = false; RP.mode = mode;
  pop.classList.toggle('reviewing', mode === 'review');
  pop.classList.toggle('ready', mode === 'ready');
  $('rpRecBtns').hidden = mode === 'review';
  $('rpRevBtns').hidden = mode !== 'review';
  $('rpTitle').textContent = mode === 'rec' ? '녹음 중' : mode === 'ready' ? '녹음 준비' : '녹음 확인';
  $('rpStop').textContent = mode === 'ready' ? '녹음 그만두기' : '■ 녹음 끝내기';
  if(mode === 'ready'){
    var it = cur();
    $('rpRef').textContent = it ? ref(it.bi,it.ci,it.vi) : '';
    $('rpTime').textContent = '대기';
    $('rpMsg').textContent = '들은 절을 소리 내어 따라 읽어 보세요';
  }
}
/* 녹음이 켜져 있으면 준비 상태로, 아니면 닫는다 */
function rpIdle(){
  if(PL.rec && recStream){ RP.peaks = []; rpShow('ready'); rpMeter(recStream); }
  else rpHide();
}
function rpHide(){
  $('recPop').hidden = true; RP.mode = '';
  cancelAnimationFrame(RP.raf); RP.raf = 0;
  try{ mineAudio.pause(); }catch(e){}
}
function fmtT(sec){ sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + ('0' + sec % 60).slice(-2); }
function rpDraw(progress){
  var c = $('rpWave'), g = c.getContext('2d'), W = c.width, H = c.height, pk = RP.peaks;
  var css = getComputedStyle(document.documentElement);
  var acc = css.getPropertyValue('--accent').trim() || '#8a5a2b', dim = css.getPropertyValue('--line').trim() || '#ddd';
  g.clearRect(0, 0, W, H);
  var n = 68, bw = W / n, from = Math.max(0, pk.length - (progress == null ? n : pk.length));
  var shown = progress == null ? pk.slice(from) : pk;
  for(var i = 0; i < n; i++){
    var v;
    if(progress == null) v = shown[i - (n - shown.length)] || 0;
    else { var k = Math.floor(i * shown.length / n); v = shown[k] || 0; }
    var h = Math.max(4, Math.min(1, v * 3.2) * (H - 10));
    var lit = progress == null ? (i >= n - shown.length) : (i / n <= progress);
    g.fillStyle = lit ? (progress == null ? '#d43b2c' : acc) : dim;
    var x = i * bw + bw * .2, w = bw * .6, y = (H - h) / 2;
    if(g.roundRect){ g.beginPath(); g.roundRect(x, y, w, h, w / 2); g.fill(); } else g.fillRect(x, y, w, h);
  }
}
function rpMeter(stream){
  try{
    if(!RP.ctx) RP.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if(RP.ctx.state === 'suspended') RP.ctx.resume();
    try{ if(RP.src) RP.src.disconnect(); }catch(e){}
    RP.src = RP.ctx.createMediaStreamSource(stream);
    RP.an = RP.ctx.createAnalyser(); RP.an.fftSize = 1024;
    RP.src.connect(RP.an);
  }catch(e){ RP.an = null; }
  cancelAnimationFrame(RP.raf);
  var buf = new Float32Array(1024), last = 0;
  (function loop(ts){
    if(RP.mode !== 'rec' && RP.mode !== 'ready') return;
    var lvl = 0;
    if(RP.an){ RP.an.getFloatTimeDomainData(buf); var sum = 0; for(var i = 0; i < buf.length; i++) sum += buf[i] * buf[i]; lvl = Math.sqrt(sum / buf.length); }
    if(!last || ts - last > 60){ RP.peaks.push(lvl); if(RP.peaks.length > 600) RP.peaks.shift(); last = ts; rpDraw(null); }
    if(RP.mode === 'rec'){
      $('rpTime').textContent = fmtT((Date.now() - RP.t0) / 1000);
      $('rpMsg').textContent = lvl > 0.02 ? '🎙 목소리가 들립니다 — 계속 따라 읽으세요' : '들은 절을 소리 내어 따라 읽어 보세요';
    } else {
      $('rpMsg').textContent = '들은 절을 소리 내어 따라 읽어 보세요';
    }
    RP.raf = requestAnimationFrame(loop);
  })(0);
}
function recStart(it, force){
  if(!it || recMR) return;
  var key = recKeyOf(it), label = ref(it.bi,it.ci,it.vi);
  micOn().then(function(st){
    if(recMR || (!force && !PL.on)) return;
    rpDiscardTake();
    recChunks = []; recKey = key; RP.peaks = []; RP.t0 = Date.now(); RP.discard = false; RP.auto = false;
    try{ recMR = new MediaRecorder(st, { mimeType:'audio/webm' }); }catch(e){ recMR = new MediaRecorder(st); }
    recMR.ondataavailable = function(ev){ if(ev.data && ev.data.size) recChunks.push(ev.data); };
    recMR.onstop = function(){
      var chunks = recChunks; recChunks = [];
      cancelAnimationFrame(RP.raf); RP.raf = 0;
      if(RP.discard || !chunks.length){ rpHide(); return; }
      var blob = new Blob(chunks, { type:'audio/webm' });
      RP.take = { it:it, blob:blob, url:URL.createObjectURL(blob), key:key, label:label, sec:(Date.now() - RP.t0) / 1000 };
      $('rpTime').textContent = fmtT(RP.take.sec);
      $('rpMsg').textContent = '들어 보고 마음에 들면 저장하세요';
      rpShow('review'); rpDraw(0);
      setTimeout(function(){ $('rpSave').focus(); }, 0);
    };
    recMR.start();
    $('rpRef').textContent = label;
    rpShow('rec'); rpMeter(st);
    var h = $('rdHint'); h.textContent = '● 녹음 중 — 따라 읽어 보세요'; h.classList.add('recording');
    $('plRec').classList.add('live'); $('rdRec').classList.add('live');
  }, function(){
    toast('마이크를 쓸 수 없습니다 — 윈도우 설정에서 마이크 사용을 허용해 주세요');
    PL.rec = false; savePL(); syncPlayerUI();
  });
}
/* 녹음을 멈춘다. discard=true 면 버리고, 아니면 확인 창으로 */
function recStop(discard){
  if(recMR){ RP.discard = !!discard; try{ if(recMR.state !== 'inactive') recMR.stop(); }catch(e){} recMR = null; }
  $('plRec').classList.remove('live'); $('rdRec').classList.remove('live');
  var h = $('rdHint'); if(h && h.classList.contains('recording')){ h.classList.remove('recording'); h.textContent = ''; }
}
/* 따라 읽기 쉼이 끝남 → 녹음을 끝내고 재생을 잠시 세운 채 확인을 기다린다 */
function recFinish(){
  RP.auto = true;
  recStop(false);
  PL.on = false; clearTimeout(pTimer); pReq++;
  tellMain(false); savePL(); paintPlayer(); paintRead(false);
}
function rpDiscardTake(){
  if(RP.take){ try{ URL.revokeObjectURL(RP.take.url); }catch(e){} RP.take = null; }
}
/* 녹음 창을 닫으면 녹음 단추도 끈다 */
function rpCloseAsk(){
  if(RP.take && !recMR && !confirm('저장하지 않은 녹음을 버릴까요?')) return;
  if(recMR && PL.on) pausePlay();
  setRec(false);
}
$('rpClose').onclick = rpCloseAsk;
$('rpStop').onclick = function(){ recFinish(); RP.auto = false; };
$('rpPlay').onclick = function(){
  if(!RP.take) return;
  mineAudio.pause(); mineAudio.src = RP.take.url; mineAudio.playbackRate = 1;
  mineAudio.play().catch(function(){ toast('녹음을 재생하지 못했습니다'); });
  (function prog(){
    if($('recPop').hidden || !RP.take) return;
    var d = isFinite(mineAudio.duration) && mineAudio.duration > 0 ? mineAudio.duration : RP.take.sec;
    rpDraw(Math.min(1, mineAudio.currentTime / d));
    if(!mineAudio.paused && !mineAudio.ended) RP.raf = requestAnimationFrame(prog); else rpDraw(mineAudio.ended ? 1 : mineAudio.currentTime / d);
  })();
};
$('rpRedo').onclick = function(){
  var it = RP.take ? RP.take.it : recTarget();
  rpDiscardTake();
  if(it) recStart(it, true);
};
$('rpDel').onclick = function(){
  rpDiscardTake(); setRec(false); toast('녹음을 지웠습니다');
};
$('rpSave').onclick = function(){
  if(RP.busy || !RP.take) return;
  RP.busy = true; var b = this; b.disabled = true; b.textContent = '저장 중…';
  var take = RP.take;
  take.blob.arrayBuffer().then(function(buf){ return REC.save(take.key, new Uint8Array(buf)); }).then(function(r){
    RP.busy = false; b.disabled = false; b.textContent = '저장';
    if(!(r && r.ok)){ toast('녹음을 저장하지 못했습니다'); return; }
    toast(take.label + ' 내 목소리를 저장했습니다');
    rpDiscardTake(); setRec(false); paintMine();
  }, function(){ RP.busy = false; b.disabled = false; b.textContent = '저장'; toast('녹음을 저장하지 못했습니다'); });
};
function paintMine(){
  var it = cur(), bs = [$('plMine'), $('rdMine')];
  if(!it || !window.REC){ bs.forEach(function(b){ b.disabled = true; }); return; }
  var key = recKeyOf(it);
  REC.get(key).then(function(u){
    var now = cur(); if(recKeyOf(now) !== key) return;
    bs.forEach(function(b){ b.disabled = !u; b.dataset.url = u || ''; });
  });
}
function playMine(u){
  if(!u) return;
  if(PL.on) pausePlay();
  mineAudio.pause(); mineAudio.src = u; mineAudio.playbackRate = 1;
  mineAudio.play().catch(function(){ toast('녹음을 재생하지 못했습니다'); });
}
$('rdClose').onclick = closeRead;
backdropClose('readModal', closeRead);
$('rdAdd').onclick = function(){ if(PL.list.length) addLessonList(PL.list); };

function openReading(groups, i){
  var list = buildList(groups);
  if(!list.length) return toast('이 곳의 원어 본문이 없습니다');
  if(i == null && PL.list.length === list.length && PL.i > 0 && lessonId(PL.list) === lessonId(list)) i = PL.i;   /* 멈춘 절부터 이어 듣기 */
  startPlay(list, i || 0, '');        /* 원어 읽기 창은 없앴다 — 아래 재생기에서 듣는다 */
}

/* ── 원어 학습 — 듣고 따라 읽을 구절 모음 ── */
var lessons = [], lsMode = 'passage';
function loadLessons(){ try{ lessons = JSON.parse(localStorage.getItem(LKEY) || '[]'); }catch(e){ lessons = []; } if(!Array.isArray(lessons)) lessons = []; }
function saveLessons(){ try{ localStorage.setItem(LKEY, JSON.stringify(lessons)); }catch(e){} }
function lessonId(list){ var a = list[0], b = list[list.length-1]; return a.vid + ':' + a.bi + ':' + a.ci + ':' + a.vi + '-' + b.bi + ':' + b.ci + ':' + b.vi; }
function addLessonList(list){
  if(!list || !list.length) return;
  var id = lessonId(list);
  if(lessons.some(function(l){ return l.id === id; })) return toast('이미 담겨 있습니다');
  lessons.unshift({ id:id, list:list, label:listLabel(list), vid:list[0].vid, plays:0, added:Date.now() });
  saveLessons(); paintLessons();
  toast(listLabel(list) + ' 을(를) 원어 학습에 담았습니다');
}
function addLessonGroups(groups){ addLessonList(buildList(groups)); }
function removeLesson(id){ lessons = lessons.filter(function(l){ return l.id !== id; }); saveLessons(); paintLessons(); }
function bumpLesson(id){
  var l = lessons.find(function(x){ return x.id === id; });
  if(l){ l.plays = (l.plays || 0) + 1; l.last = Date.now(); saveLessons(); paintLessons(); }
}
function paintLessons(){
  var box = $('lsList');
  if(!box) return;
  $('lsResume').hidden = !(PL.list.length && !PL.on);
  if(!lessons.length){
    box.innerHTML = '<div class="vempty"><b>아직 담은 구절이 없습니다</b><br>' +
      '위 칸에 <code>창 1:1-5</code> 처럼 적어 담거나, 본문에서 절을 <b>오른쪽 단추</b>로 눌러 <b>원어 학습에 담기</b> 를 고르세요.<br>' +
      '담은 구절은 히브리어·헬라어 음성으로 듣고, <b>따라 읽기</b> 로 절마다 소리 내어 따라 할 수 있습니다.</div>';
    return;
  }
  box.innerHTML = lessons.map(function(l){
    var a = l.list[0], t = origText(a.vid,a.bi,a.ci,a.vi);
    return '<div class="lcard' + (PL.lesson === l.id ? ' now' : '') + '" data-id="' + esc(l.id) + '">' +
      '<div class="lref"><b>' + esc(l.label) + '</b><span>' + esc(langName(l.vid)) + ' · ' + l.list.length + '절</span></div>' +
      '<div class="lprev' + (l.vid === 'grk' ? ' grk' : ' heb') + '" dir="' + (l.vid === 'grk' ? 'ltr' : 'rtl') + '">' + esc(l.vid === 'grk' ? t : heb(t)) + '</div>' +
      '<div class="lmeta">' + (l.plays || 0) + '번 들음</div>' +
      '<div class="lbtns"><button class="wb-btn lplay">▶ 듣기</button><button class="wb-btn lecho">따라 읽기</button></div>' +
      '<button class="vdel" title="빼기">×</button></div>';
  }).join('');
  box.querySelectorAll('.lcard').forEach(function(card){
    var l = lessons.find(function(x){ return x.id === card.dataset.id; });
    if(!l) return;
    card.querySelector('.lplay').onclick = function(){ PL.echo = false; startPlay(l.list.slice(), 0, l.id); openRead(); };
    card.querySelector('.lecho').onclick = function(){ PL.echo = true; if(PL.repeat < 2) PL.repeat = 2; startPlay(l.list.slice(), 0, l.id); openRead(); };
    card.querySelector('.vdel').onclick = function(){ removeLesson(l.id); };
  });
}
function addFromInput(){
  var q = $('lsInput').value.trim();
  if(!q) return;
  var ps = parseRefList(q);
  if(!ps) return toast('구절을 알아듣지 못했습니다 — 예: 창 1:1-5, 시 23, 요 3:16');
  var list = buildList(ps);
  if(!list.length) return toast('그 곳의 원어 본문이 없습니다');
  addLessonList(list);
  $('lsInput').value = '';
}
$('lsAddBtn').onclick = addFromInput;
$('lsInput').onkeydown = function(e){ if(e.key === 'Enter') addFromInput(); };
$('lsAddCur').onclick = function(){
  if(st.bi < 0) return toast('먼저 본문에서 장을 여세요');
  addLessonGroups([{ bi:st.bi, ci:st.ci, from:-1, to:-1 }]);
};
$('lsResume').onclick = function(){ resumePlay(); openRead(); };
function setLsMode(m){
  lsMode = m;
  $('lsMode').querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.m === m); });
  var word = m === 'word';
  if(!word && typeof stopQuiz === 'function') stopQuiz();     /* 먼저 — 퀴즈를 접으면 낱말 영역을 다시 펼치므로 */
  ['vbTabs','vbQuiz','vbExport','vbClear','vbStats','vbList'].forEach(function(id){ var el = $(id); if(el) el.hidden = !word; });
  $('vbQuizPane').hidden = true;
  $('lsPane').hidden = word;
  if(word) paintVocab(); else paintLessons();
}
$('lsMode').querySelectorAll('button').forEach(function(b){ b.onclick = function(){ setLsMode(b.dataset.m); }; });

/* ── 본문 머리의 '원어로 듣기' 단추: 지금 보는 장 ── */
$('listenBtn').onclick = function(){
  if(st.bi < 0) return toast('먼저 장을 여세요');
  if(st.mode !== 'chapter' && st.passages && st.passages.length) return openReading(st.passages.map(function(p){ return { bi:p.bi, ci:p.ci, from:p.from, to:p.to }; }));
  openReading([{ bi:st.bi, ci:st.ci, from:-1, to:-1 }]);
};

/* ── 설정: 음성 엔진 상태 ── */
function refreshAudioInfo(){
  var el = $('audStatus');
  if(!window.AUDIO || !AUDIO.info){ if(el) el.textContent = '이 창에서는 원어 듣기를 쓸 수 없습니다'; return; }
  AUDIO.info().then(function(r){
    AUD_INFO = r;
    if(!el) return;
    if(r && r.engine === 'piper'){
      el.textContent = 'Piper 음성 엔진 준비됨 · 만들어 둔 절 ' + (r.files || 0).toLocaleString() + '개' +
                       (r.he ? '' : ' · 히브리어 모델 없음') + (r.el ? '' : ' · 헬라어 모델 없음');
    } else {
      el.textContent = '음성 엔진을 찾지 못했습니다 (' + (r && r.why || '') + ') — 파이썬과 Piper 가 필요합니다. 만들어 둔 절 ' + (r && r.files || 0) + '개는 그대로 들을 수 있습니다.';
    }
  }, function(){ if(el) el.textContent = '음성 엔진 상태를 알 수 없습니다'; });
}
$('audFolder').onclick = function(){ if(window.AUDIO && AUDIO.folder) AUDIO.folder(); };

/* ─────────────── 개관 ─────────────── */
var INTRO = window.INTRO || {}, introBi = -1;
function introRows(d){
  var keys = [['저자','저자'],['연대','기록 연대'],['독자','받는 이'],['배경','배경'],['목적','기록 목적'],['주제','열쇠말']];
  var h = keys.map(function(k){
    return d[k[0]] ? '<div class="in-row"><div class="k">' + k[1] + '</div><div class="v">' + esc(d[k[0]]) + '</div></div>' : '';
  }).join('');
  if(d['개요'] && d['개요'].length)
    h += '<div class="in-row"><div class="k">구조</div><div class="v"><ol>' + d['개요'].map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></div></div>';
  if(d['그리스도']) h += '<div class="in-row hi"><div class="k">그리스도</div><div class="v">' + esc(d['그리스도']) + '</div></div>';
  if(d['설교']) h += '<div class="in-row"><div class="k">설교 길잡이</div><div class="v">' + esc(d['설교']) + '</div></div>';
  return h;
}
function openIntro(bi){
  if(bi < 0 || bi >= BOOKS.length) return;
  introBi = bi;
  var b = BOOKS[bi], d = INTRO[b.n];
  $('inTitle').textContent = b.n;
  $('inSub').textContent = (b.t === 0 ? '구약' : '신약') + ' · ' + b.c + '장';
  $('inBody').innerHTML = d ? introRows(d) : '<div class="in-none">이 책의 개관은 아직 준비 중입니다.</div>';
  $('inBody').scrollTop = 0;
  $('introModal').hidden = false;
}
function closeIntro(){ $('introModal').hidden = true; }
function introText(bi){
  var b = BOOKS[bi], d = INTRO[b.n];
  if(!d) return '';
  var out = [b.n + ' 개관'];
  [['저자','저자'],['연대','기록 연대'],['독자','받는 이'],['배경','배경'],['목적','기록 목적'],['주제','열쇠말']].forEach(function(k){ if(d[k[0]]) out.push(k[1] + ': ' + d[k[0]]); });
  if(d['개요']) out.push('구조:\n' + d['개요'].map(function(x, i){ return '  ' + (i+1) + '. ' + x; }).join('\n'));
  if(d['그리스도']) out.push('그리스도: ' + d['그리스도']);
  if(d['설교']) out.push('설교 길잡이: ' + d['설교']);
  return out.join('\n');
}
$('introBtn').onclick = function(){ if(st.bi < 0) return toast('먼저 책을 고르세요'); openIntro(st.bi); };
$('inClose').onclick = closeIntro;
backdropClose('introModal', closeIntro);
$('inPrev').onclick = function(){ if(introBi > 0) openIntro(introBi - 1); };
$('inNext').onclick = function(){ if(introBi < BOOKS.length - 1) openIntro(introBi + 1); };
$('inCopy').onclick = function(){ var t = introText(introBi); if(t) put(t, BOOKS[introBi].n + ' 개관 복사됨'); };

/* ─────────────── 시작 ─────────────── */
applySettings();
buildSettings();
syncSettingsUI();
buildBookNav();
VERS.forEach(function(v){ $('sver').add(new Option(v.name, v.id)); });
$('sver').add(new Option('▸ 모든 성경', '*'));
$('sver').value = S.base;
BOOKS.forEach(function(b,i){ $('scopeBook').add(new Option(b.n, i)); });
loadHist();
paintHist();
loadVocab();
paintVocab();
loadLessons();
setLsMode('passage');
loadPL(); paintPlayer(); syncPlayerToChapter();
refreshAudioInfo();
render();
syncBookNav();
scrollNavIntoView();
showView('read');
document.title = APP_TITLE + ' ' + APP_VERSION + ' · ' + vinfo(S.base).name;
$('boot').remove();

/* notes.js·license.js 가 쓰는 것들 (app.js 는 닫힌 함수 안이라 밖으로 내보낸다) */
window.MODU_X = { S:S, toggleNav:toggleNav, saveSettings:saveSettings, applySettings:applySettings, infoFromEvent:infoFromEvent, fillWordBox:fillWordBox, anyPopupOpen:anyPopupOpen, goBackToRead:goBackToRead, step:step, verses:verses, parseRefList:parseRefList, bumpFont:bumpFont, cycleTheme:cycleTheme, openComm:openComm };
window.APP = { $:$, esc:esc, toast:toast, put:put, copyText:copyText, showView:showView, openChapter:openChapter,
               parseRefList:parseRefList, BOOKS:BOOKS, st:st, CM:CM, korText:korText, ref:ref, closeCMenu:closeCMenu, setComm:setComm,
               render:function(){ render(); }, openWord:function(info){ openWordModal(info); },
               grkEntry:function(no){ return GRKD ? GRKD[no] : null; }, hebEntry:function(no){ return HEB && HEB.d ? HEB.d[no] : null; },
               vname:function(){ return vinfo(S.base).name; }, openIntro:openIntro, comm:function(){ return COMM; }, commHits:commHits, cmRange:cmRange,
               showComm:function(bi, ci, vi, hits, wi, si){ CM = { bi:bi, ci:ci, vi:vi, list:hits, wi:wi, si:si }; $('commModal').hidden = false; paintComm(); },
               /* 기본 성경 + 함께 볼 성경의 이 절 본문 [[이름, 글, 원어?]] — 스테판 원어 보기의 대역 줄 */
               verseTexts:function(bi, ci, vi){ return [S.base].concat(S.extra.filter(function(x){ return x !== S.base; })).map(function(id){ var v = vinfo(id); if(!v || !versionsFor(bi).some(function(x){ return x.id === id; })) return null; var t = verses(id, bi, ci)[vi]; if(!t) return null; return [v.name, id === 'wlc' || id === 'grk' ? t : flat(split(t).text), id]; }).filter(Boolean); },
               verseText:function(bi, ci, vi){ var t = verses(S.base, bi, ci)[vi]; return t ? flat(split(t).text) : ''; } };

/* ═══════════════ 위쪽 메뉴 · 아이콘 줄 (MyBible 식 구성) ═══════════════ */
(function(){
  function inRead(){ showView('read'); }
  function stepBook(d){
    inRead();
    var bi = st.bi < 0 ? 0 : st.bi + d;
    if(bi < 0 || bi >= BOOKS.length) return;
    openChapter(bi, 0, -1);
  }
  function findIn(scope, book){
    showView('search');
    $('scope').value = scope; $('scopeBook').value = book == null ? '' : String(book);
    if($('q').value.trim()) doSearch();
  }
  function toggleExtra(id){
    if(S.extra.indexOf(id) >= 0) S.extra = S.extra.filter(function(x){ return x !== id; });
    else S.extra.push(id);
    saveSettings(); syncVersionUI(); render();
  }
  function openWordStudy(tab){
    showView('vocab'); setLsMode('word');
    vbTab = tab; $('vbTabs').querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.k === tab); });
    stopQuiz(); paintVocab();
  }
  function openDrop(btnId){ inRead(); setTimeout(function(){ $(btnId).click(); }, 0); }
  function aboutPage(){ showView('settings'); setTimeout(function(){ var a = $('aboutList'); if(a) a.scrollIntoView({ block:'center' }); }, 30); }

  /* 메뉴 구성: [이름, 단축키 글자, 항목들] · 항목 = { t, k, fn, on, off } 또는 '-' */
  var MENUS = [
    ['파일', 'F', function(){ return [
      { t:'메모장 열기', fn:function(){ showView('notes'); } },
      '-',
      { t:'설정을 파일로 보관…', fn:function(){ showView('settings'); $('saveAll').click(); } },
      '-',
      { t:'끝내기', k:'Alt+F4', fn:function(){ window.close(); } }
    ]; }],
    ['편집', 'E', function(){ return [
      { t:'본문 복사…', fn:function(){ openDrop('copyBtn'); } },
      { t:'복사할 때 절 번호 넣기', on:!!S.optNum, fn:function(){ S.optNum = !S.optNum; saveSettings(); syncSettingsUI(); } },
      { t:'복사할 때 출처 붙이기', on:!!S.optSrc, fn:function(){ S.optSrc = !S.optSrc; saveSettings(); syncSettingsUI(); } },
      '-',
      { t:'형광펜 분류 이름 바꾸기…', fn:function(){ showView('settings'); setTimeout(function(){ $('hlNames').scrollIntoView({ block:'center' }); }, 30); } }
    ]; }],
    ['이동', 'G', function(){ return [
      { t:'이전 장', k:'←', fn:function(){ inRead(); step(-1); } },
      { t:'다음 장', k:'→', fn:function(){ inRead(); step(1); } },
      '-',
      { t:'이전 책', fn:function(){ stepBook(-1); } },
      { t:'다음 책', fn:function(){ stepBook(1); } },
      { t:'처음으로 (창세기 1장)', fn:function(){ inRead(); openChapter(0, 0, -1); } },
      { t:'신약 처음 (마태복음 1장)', fn:function(){ inRead(); openChapter(39, 0, -1); } },
      '-',
      { t:'책·장 목록 보이기', k:'Ctrl+B', on:!!S.showNav, fn:toggleNav }
    ]; }],
    ['문구찾기', 'S', function(){ return [
      { t:'찾기 창', k:'Ctrl+F', fn:function(){ showView('search'); } },
      '-',
      { t:'성경 전체에서', fn:function(){ findIn('all'); } },
      { t:'구약 안에서', fn:function(){ findIn('ot'); } },
      { t:'신약 안에서', fn:function(){ findIn('nt'); } },
      { t:'현재 권 안에서' + (st.bi >= 0 ? ' (' + BOOKS[st.bi].n + ')' : ''), off:st.bi < 0, fn:function(){ findIn('all', st.bi); } }
    ]; }],
    ['학습', 'T', function(){ return [
      { t:'원어 구절 듣고 따라 읽기', fn:function(){ showView('vocab'); setLsMode('passage'); } },
      '-',
      { t:'히브리어 낱말 학습', fn:function(){ openWordStudy('heb'); } },
      { t:'헬라어 낱말 학습', fn:function(){ openWordStudy('grk'); } },
      { t:'영단어 학습', fn:function(){ openWordStudy('eng'); } },
      { t:'낱말 전체 보기', fn:function(){ openWordStudy('all'); } },
      '-',
      { t:'오늘 복습 시작 (퀴즈)', fn:function(){ openWordStudy(vbTab); setTimeout(function(){ $('vbQuiz').click(); }, 50); } },
      '-',
      { t:'지식 그래프', fn:function(){ KG.open(); } }
    ]; }],
    ['성경연구', 'R', function(){
      var here = st.mode === 'chapter' && st.bi >= 0, v = here && st.vi >= 0 ? st.vi : 0;
      var hits = here ? commHits(st.bi, st.ci, v) : [];
      return [
      { t:'이 절의 주석 보기' + (here ? ' — ' + ref(st.bi, st.ci, v) : ''), off:!hits.length, fn:function(){ openComm(st.bi, st.ci, v); } },
      { t:'주석 목록 — 책별 단락 훑어보기', fn:function(){ openCommIndex(here ? st.bi : 0); } },
      '-',
      { t:'이 장의 지도 보기', off:!here, fn:function(){ ATLAS.openFor(st.bi, st.ci, v); } },
      { t:'성경 지도 목록 (개관)', fn:function(){ ATLAS.openIndex(); } },
      { t:'성경지도 학습 — 성서 지리·고고학·시대사', fn:function(){ STUDY.open(); } },
      { t:'이 절과 관련된 성경지도 학습' + (here ? ' — ' + ref(st.bi, st.ci, v) : ''), off:!(here && window.STUDY && STUDY.forVerse(st.bi, st.ci, v).length), fn:function(){ var a = STUDY.forVerse(st.bi, st.ci, v)[0]; if(a) STUDY.open(a.id); } },
      '-',
      { t:'낱말·구절 찾기', k:'Ctrl+F', fn:function(){ showView('search'); } },
      { t:'원어 낱말 자세히 보기 안내', fn:function(){ toast('본문의 히브리어·헬라어 낱말에서 오른쪽 단추 → 자세히 보기'); } },
      '-',
      { t:'메모장', fn:function(){ showView('notes'); } },
      { t:'지식 그래프', fn:function(){ KG.open(); } }
    ]; }],
    ['보기', 'V', function(){ return [
      { t:'본문', on:st.view === 'read', fn:function(){ showView('read'); } },
      { t:'검색', on:st.view === 'search', fn:function(){ showView('search'); } },
      { t:'원어 학습', on:st.view === 'vocab', fn:function(){ showView('vocab'); } },
      { t:'메모장', on:st.view === 'notes', fn:function(){ showView('notes'); } },
      '-',
      { t:'이 책 개관', off:st.bi < 0, fn:function(){ inRead(); $('introBtn').click(); } },
      { t:'지도 보기 (이 장)', off:st.bi < 0, fn:function(){ ATLAS.openFor(st.bi, st.ci, st.vi >= 0 ? st.vi : 0); } },
      { t:'성경 지도 목록 (개관)', fn:function(){ ATLAS.openIndex(); } }
    ]; }],
    ['본문성경', 'B', function(){
      var list = [{ t:'기본 성경: ' + vinfo(S.base).name, off:true }, '-'];
      VERS.forEach(function(v){ if(v.id !== S.base) list.push({ t:v.name, on:S.extra.indexOf(v.id) >= 0, keep:true, fn:function(){ toggleExtra(v.id); } }); });
      list.push('-', { t:'기본 성경 바꾸기…', fn:function(){ showView('settings'); $('baseVer').focus(); } });
      return list;
    }],
    ['원어듣기', 'L', function(){ return [
      { t:'이 장을 원어로 듣기', off:st.bi < 0, fn:function(){ inRead(); $('listenBtn').click(); } },
      { t:(PL.on ? '멈춤' : '재생'), k:'Ctrl+Space', off:!PL.list.length, fn:togglePlay },
      '-',
      { t:'따라 읽기', on:!!PL.echo, keep:true, fn:function(){ setEcho(!PL.echo); } },
      { t:'구간 반복', on:!!PL.loop, keep:true, fn:function(){ PL.loop = !PL.loop; savePL(); syncPlayerUI(); } },
      { t:'녹음', on:!!PL.rec, keep:true, fn:function(){ setRec(!PL.rec); } },
      '-',
      { t:'내 녹음 폴더 열기', fn:function(){ REC.folder(); } }
    ]; }],
    ['환경설정', 'O', function(){ return [
      { t:'글자 크게', k:'Ctrl+=', fn:function(){ bumpFont(1); } },
      { t:'글자 작게', k:'Ctrl+-', fn:function(){ bumpFont(-1); } },
      { t:'화면 색 바꾸기', k:'Ctrl+D', fn:cycleTheme },
      '-',
      { t:'설정 열기…', fn:function(){ showView('settings'); } }
    ]; }],
    ['도움말', 'H', function(){ return [
      { t:'단축키 보기', fn:function(){ toast('←→ 장 이동 · Ctrl+F 찾기 · Ctrl+B 목록 · Ctrl+D 화면 색 · Ctrl+± 글자 · Ctrl+Space 재생'); } },
      { t:'이 프로그램 정보', fn:aboutPage }
    ]; }]
  ];

  var bar = $('menubar'), pop = $('menupop'), openIdx = -1, opener = null;
  bar.innerHTML = MENUS.map(function(m, i){
    return '<button type="button" class="mb-item" role="menuitem" aria-haspopup="true" data-i="' + i + '">' + esc(m[0]) + '(<u>' + m[1] + '</u>)</button>';
  }).join('');
  var heads = [].slice.call(bar.children);

  function closeMenu(back){
    if(openIdx < 0) return;
    pop.hidden = true; heads.forEach(function(h){ h.classList.remove('on'); h.setAttribute('aria-expanded', 'false'); });
    openIdx = -1;
    if(back && opener) opener.focus();
  }
  function openMenu(i, focusFirst){
    var items = MENUS[i][2]();
    openIdx = i; opener = heads[i];
    heads.forEach(function(h, k){ h.classList.toggle('on', k === i); h.setAttribute('aria-expanded', k === i ? 'true' : 'false'); });
    pop.innerHTML = items.map(function(it, k){
      if(it === '-') return '<div class="mb-sep" role="separator"></div>';
      return '<button type="button" class="mb-row" role="menuitem" data-k="' + k + '"' + (it.off ? ' disabled' : '') + '>' +
        '<span class="mb-chk">' + (it.on ? '✓' : '') + '</span><span class="mb-t">' + esc(it.t) + '</span><span class="mb-key">' + esc(it.k || '') + '</span></button>';
    }).join('');
    [].forEach.call(pop.querySelectorAll('.mb-row'), function(r){
      r.onclick = function(e){
        e.stopPropagation();
        var it = items[+r.dataset.k]; if(!it || it.off) return;
        if(it.keep){ it.fn(); openMenu(i); var again = pop.querySelector('[data-k="' + r.dataset.k + '"]'); if(again) again.focus(); return; }
        closeMenu(false); it.fn();
      };
    });
    pop.hidden = false;
    var hb = heads[i].getBoundingClientRect();
    pop.style.left = '0px'; pop.style.top = '0px';
    var w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(6, Math.min(hb.left, innerWidth - w - 8)) + 'px';
    pop.style.top = Math.max(6, Math.min(hb.bottom + 2, innerHeight - h - 8)) + 'px';
    if(focusFirst){ var f = pop.querySelector('.mb-row:not([disabled])'); if(f) f.focus(); }
  }
  heads.forEach(function(h, i){
    h.onclick = function(e){ e.stopPropagation(); if(openIdx === i) closeMenu(false); else openMenu(i, e.detail === 0); };
    h.onmouseenter = function(){ if(openIdx >= 0 && openIdx !== i) openMenu(i); };
  });
  pop.addEventListener('click', function(e){ e.stopPropagation(); });
  document.addEventListener('mousedown', function(e){ if(openIdx >= 0 && !pop.contains(e.target) && !bar.contains(e.target)) closeMenu(false); });
  window.addEventListener('resize', function(){ closeMenu(false); hideTip(); });
  window.addEventListener('blur', function(){ closeMenu(false); hideTip(); });
  document.addEventListener('keydown', function(e){
    /* Alt+글자 로 메뉴 열기 */
    if(e.altKey && !e.ctrlKey && e.key && e.key.length === 1){
      var idx = MENUS.findIndex(function(m){ return m[1] === e.key.toUpperCase(); });
      if(idx >= 0){ e.preventDefault(); e.stopPropagation(); openMenu(idx, true); return; }
    }
    if(openIdx < 0) return;
    var rows = [].slice.call(pop.querySelectorAll('.mb-row:not([disabled])')), cur = rows.indexOf(document.activeElement);
    if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeMenu(true); }
    else if(e.key === 'ArrowDown'){ e.preventDefault(); e.stopPropagation(); if(rows.length) rows[(cur + 1) % rows.length].focus(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); e.stopPropagation(); if(rows.length) rows[(cur - 1 + rows.length) % rows.length].focus(); }
    else if(e.key === 'ArrowRight'){ e.preventDefault(); e.stopPropagation(); openMenu((openIdx + 1) % MENUS.length, true); }
    else if(e.key === 'ArrowLeft'){ e.preventDefault(); e.stopPropagation(); openMenu((openIdx - 1 + MENUS.length) % MENUS.length, true); }
    else if(e.key === 'Tab'){ e.preventDefault(); }
  }, true);

  /* ── 아이콘 줄 ── */
  function sv(d){ return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
  var TI = {
    back:   sv('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
    prev:   sv('<path d="m15 18-6-6 6-6"/>'),
    next:   sv('<path d="m9 18 6-6-6-6"/>'),
    book:   sv('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
    search: sv('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    vocab:  sv('<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/>'),
    map:    sv('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>'),
    graph:  sv('<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="17" r="2.2"/><circle cx="19" cy="17" r="2.2"/><circle cx="12" cy="13" r="1.6"/><path d="M12 7.2v4.2M10.8 14 6.6 15.8M13.2 14l4.2 1.8"/>'),
    notes:  sv('<path d="M8 2v4M12 2v4M16 2v4"/><rect x="4" y="4" width="16" height="18" rx="2"/><path d="M8 11h6M8 15h8M8 19h5"/>'),
    intro:  sv('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
    listen: sv('<path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/>'),
    readw:  sv('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>'),
    vers:   sv('<rect x="3" y="3" width="7.5" height="18" rx="1.5"/><path d="M3 7h7.5M3 17h7.5"/><rect x="13.5" y="5" width="7.5" height="16" rx="1.5"/><path d="M13.5 9h7.5M13.5 17h7.5"/>'),
    copy:   sv('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    fdown:  sv('<path d="M4 18 9 6l5 12"/><path d="M5.5 14h7"/><path d="M16 12h6"/>'),
    fup:    sv('<path d="M4 18 9 6l5 12"/><path d="M5.5 14h7"/><path d="M16 12h6M19 9v6"/>'),
    theme:  sv('<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>'),
    nav:    sv('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>'),
    update: sv('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/><path d="M12 8v5l3 2"/>'),
    gear:   sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')
  };
  /* [아이콘, 색, 이름, 설명, 단축키, 동작] */
  var TOOLS = [
    ['back','','뒤로','바로 앞 화면으로 돌아갑니다 (검색 결과 → 본문 → 다시 검색 결과). 마우스 뒤로 단추·Backspace 도 같습니다','Backspace',function(){ if(!goBackToRead()) toast('돌아갈 앞 화면이 없습니다'); }],
    ['prev','','이전 장','앞 장으로 넘어갑니다','←',function(){ inRead(); step(-1); }],
    ['next','','다음 장','다음 장으로 넘어갑니다','→',function(){ inRead(); step(1); }],
    ['nav','','책·장 목록','왼쪽 책·장 목록을 보이거나 숨깁니다','Ctrl+B',toggleNav],
    '|',
    ['book','','본문','성경 본문 화면으로 돌아갑니다','',function(){ showView('read'); }],
    ['search','','문구 찾기','낱말이나 구절(요 3:16)을 성경 전체에서 찾습니다','Ctrl+F',function(){ showView('search'); }],
    ['vocab','','원어 학습','담아 둔 원어 낱말·구절을 복습하고 퀴즈를 풉니다','',function(){ showView('vocab'); }],
    ['notes','','메모장','주석·구절·생각을 적고 [[연결]]과 #태그로 엮습니다','',function(){ showView('notes'); }],
    ['graph','','지식 그래프','메모·연결·태그·형광펜을 3차원 별자리로 봅니다','',function(){ KG.open(); }],
    ['map','','성경 지도','모든 지도를 성경 순서로 훑어보며 개관합니다','',function(){ ATLAS.openIndex(); }],
    '|',
    ['intro','','책 개관','이 책의 저자·연대·목적·구조를 봅니다','',function(){ if(st.bi < 0) return toast('먼저 책을 고르세요'); inRead(); $('introBtn').click(); }],
    ['listen','','원어로 듣기','이 장을 히브리어·헬라어 음성으로 들려줍니다','',function(){ if(st.bi < 0) return toast('먼저 책을 고르세요'); inRead(); $('listenBtn').click(); }],
    ['vers','','대조 성경','여러 번역을 나란히 놓고 봅니다','',function(){ openDrop('verBtn'); }],
    '|',
    ['fdown','','글자 작게','본문 글자를 줄입니다','Ctrl+-',function(){ bumpFont(-1); }],
    ['fup','','글자 크게','본문 글자를 키웁니다','Ctrl+=',function(){ bumpFont(1); }],
    ['theme','','화면 색 바꾸기','밝은 색·종이 색·어두운 색을 차례로 바꿉니다','Ctrl+D',cycleTheme],
    ['gear','','설정','글자·성경·주석·음성·복사 설정을 엽니다','',function(){ showView('settings'); }],
    ['update','','최신 업데이트 확인','새 판이 나왔는지 확인하고, 있으면 내려받아 설치합니다','',function(){ if(window.UPD) UPD.manual(); }]
  ];
  var tb = $('toolbar');
  tb.innerHTML = TOOLS.map(function(t, i){
    if(t === '|') return '<span class="tb-sep"></span>';
    return '<button type="button" class="tb-b ' + t[1] + '" data-i="' + i + '" aria-label="' + esc(t[2]) + '">' + TI[t[0]] + '</button>';
  }).join('');
  var tip = $('tbTip'), tipT = 0;
  function hideTip(){ clearTimeout(tipT); tip.hidden = true; }
  function showTip(btn){
    var t = btn.dataset.tn ? [0, 0, btn.dataset.tn, btn.dataset.td, btn.dataset.tk || ''] : TOOLS[+btn.dataset.i];
    tip.innerHTML = '<b>' + esc(t[2]) + '</b>' + (t[4] ? '<kbd>' + esc(t[4]) + '</kbd>' : '') + '<span>' + esc(t[3]) + '</span>';
    tip.hidden = false;
    var r = btn.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
    tip.style.top = Math.min(r.bottom + 6, innerHeight - h - 8) + 'px';
  }
  [].forEach.call(tb.querySelectorAll('.tb-b'), function(b){
    b.onclick = function(e){ e.stopPropagation(); hideTip(); TOOLS[+b.dataset.i][5](); };
    b.onmouseenter = function(){ clearTimeout(tipT); tipT = setTimeout(function(){ showTip(b); }, 350); };
    b.onmouseleave = hideTip;
    b.onfocus = function(){ showTip(b); };
    b.onblur = hideTip;
  });

  /* 본문 위 단추도 같은 아이콘 모양으로 */
  var TI2 = { copy: TI.copy };
  [['prev','prev','이전 장','앞 장으로 넘어갑니다','←'],
   ['next','next','다음 장','다음 장으로 넘어갑니다','→'],
   ['introBtn','intro','책 개관','이 책의 저자·연대·목적·구조를 봅니다',''],
   ['listenBtn','listen','원어로 듣기','이 장을 히브리어·헬라어 음성으로 들려줍니다',''],
   ['verBtn','vers','대조 성경','여러 번역을 나란히 놓고 봅니다 (숫자는 지금 보는 성경 수)',''],
   ['copyBtn','copy','복사','이 장이나 고른 절을 복사합니다','']
  ].forEach(function(d){
    var b = $(d[0]); if(!b) return;
    var cnt = b.querySelector('.cnt');
    b.innerHTML = TI[d[1]] || TI2[d[1]];
    if(cnt) b.appendChild(cnt);
    b.className = 'tb-b rh-b';
    b.removeAttribute('title');
    b.setAttribute('aria-label', d[2]);
    b.dataset.tn = d[2]; b.dataset.td = d[3]; if(d[4]) b.dataset.tk = d[4];
    b.addEventListener('mouseenter', function(){ clearTimeout(tipT); tipT = setTimeout(function(){ showTip(b); }, 350); });
    b.addEventListener('mouseleave', hideTip);
    b.addEventListener('click', hideTip);
  });
})();

})();

/* 제품 이름(해마다 바뀜)을 화면 곳곳에 */
(function(){ try{ document.querySelectorAll('[data-app-title]').forEach(function(el){ el.textContent = (window.APPINFO && APPINFO.title) || el.textContent; }); }catch(e){} })();
