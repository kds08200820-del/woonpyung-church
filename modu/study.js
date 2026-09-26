/* 성경지도 학습 — 성서 지리·고고학·시대사 해설 (성경연구 메뉴)
   자료: data/study/articles.js (STUDY_ARTICLES). 그림: data/study/fig (고도 자료로 만든 단면·3D), data/study/img (AI 재현),
   그리고 이 파일이 캔버스로 그리는 도표(지역 구분·도로·강수·기후·연표·농사 달력).
   해설은 참고한 책을 바탕으로 새로 쓴 글이며, 끝에 출처를 밝힌다. */
window.STUDY = (function(){
  var $ = APP.$, esc = APP.esc;
  var cur = null, opener = null, partSel = 'all', q = '', hist = [];
  var PARTS = { geo:'성서 지리', arch:'고고학', hist:'시대사' };
  var PART_DESC = { geo:'땅의 생김새와 기후, 길과 생활 — 성경 사건의 무대', arch:'발굴이 말해 주는 것 — 열세 가지 질문으로 보는 고고학', hist:'족장 시대부터 초대 교회까지 — 시대별 역사 지리' };

  function list(){ return (window.STUDY_ARTICLES || []).slice().sort(function(a, b){ return a.order - b.order; }); }
  function byId(id){ return list().filter(function(a){ return a.id === id; })[0] || null; }

  /* ── 열기·닫기 (ui-defect-guard: 배경 mousedown+click, Esc, ×, 초점 복귀, 스크롤 가둠) ── */
  function open(id){
    opener = document.activeElement;
    var m = $('studyModal'); m.hidden = false; document.body.classList.add('modal-open');
    if(!list().length){ $('stBody').innerHTML = '<div class="st-empty">해설 자료(data/study/articles.js)를 읽지 못했습니다.</div>'; paintSide(); return; }
    show(byId(id) || cur || list()[0]);
    setTimeout(function(){ $('stClose').focus(); }, 0);
  }
  function back(){
    if(!$('stVpop').hidden){ closeVpop(); return true; }
    if(!$('stLight').hidden){ closeLight(); return true; }
    var h = hist.pop(); if(!h) return false;
    show(h.a, true); $('stBody').scrollTop = h.top; $('stBack').disabled = !hist.length; return true;
  }
  function close(){
    var m = $('studyModal'); if(m.hidden) return; closeVpop();
    m.hidden = true; document.body.classList.remove('modal-open'); closeLight();
    if(opener && opener.focus) try{ opener.focus(); }catch(e){}
  }
  function show(a, noHist){
    if(cur && !noHist && cur !== a) hist.push({ a:cur, top:$('stBody').scrollTop });
    if(hist.length > 50) hist.shift();
    cur = a; paintSide(); paintArticle(a);
    $('stBody').scrollTop = 0; $('stBack').disabled = !hist.length;
    try{ localStorage.setItem('study.last', a.id); }catch(e){}
  }

  /* ── 왼쪽 목록 ── */
  function paintSide(){
    var side = $('stSide'), all = list();
    var parts = ['geo', 'arch', 'hist'];
    var html = '<div class="st-idxhead"><b>성경지도 학습</b> <span class="dim">' + all.length + '편</span></div>' +
      '<input class="at-idxq" id="stQ" placeholder="제목·내용 찾기…" autocomplete="off" value="' + esc(q) + '">' +
      '<div class="seg st-parts"><button type="button" data-p="all"' + (partSel === 'all' ? ' class="on"' : '') + '>전체</button>' +
      parts.map(function(p){ return '<button type="button" data-p="' + p + '"' + (partSel === p ? ' class="on"' : '') + '>' + PARTS[p] + '</button>'; }).join('') + '</div>';
    parts.forEach(function(p){
      if(partSel !== 'all' && partSel !== p) return;
      var items = all.filter(function(a){ return a.part === p && match(a); });
      if(!items.length) return;
      html += '<div class="at-h">' + PARTS[p] + ' <span class="dim">' + items.length + '</span></div><div class="st-desc">' + esc(PART_DESC[p]) + '</div><div class="at-others">' +
        items.map(function(a){ return '<button type="button" class="at-other st-item' + (cur && a.id === cur.id ? ' on' : '') + '" data-id="' + esc(a.id) + '"><span><b>' + esc(a.title) + '</b><br><span class="dim">' + esc(a.sub || '') + '</span></span></button>'; }).join('') + '</div>';
    });
    if(q && !all.some(match)) html += '<div class="st-empty">"' + esc(q) + '"에 맞는 해설이 없습니다.</div>';
    side.innerHTML = html;
    [].forEach.call(side.querySelectorAll('.st-item'), function(b){ b.onclick = function(){ var a = byId(b.dataset.id); if(a) show(a); }; });
    [].forEach.call(side.querySelectorAll('.st-parts button'), function(b){ b.onclick = function(){ partSel = b.dataset.p; paintSide(); }; });
    var qi = $('stQ');
    qi.oninput = function(){ var pos = qi.selectionStart; q = qi.value; paintSide(); var n = $('stQ'); n.focus(); try{ n.setSelectionRange(pos, pos); }catch(e){} };
  }
  function match(a){
    if(!q.trim()) return true;
    var s = q.trim().toLowerCase();
    if(!a._txt) a._txt = (a.title + ' ' + (a.sub || '') + ' ' + (a.lead || '') + ' ' + (a.sections || []).map(function(sc){ return sc.h + ' ' + (sc.p || []).join(' '); }).join(' ') + ' ' + (a.terms || []).map(function(t){ return t[0]; }).join(' ')).toLowerCase();
    return a._txt.indexOf(s) >= 0;
  }

  /* ── 본문 ── */
  function paintArticle(a){
    var h = '<article class="st-art">';
    h += '<div class="st-kicker">' + esc(PARTS[a.part] || '') + '</div><h1>' + esc(a.title) + '</h1>' + (a.sub ? '<div class="st-sub">' + esc(a.sub) + '</div>' : '');
    if(a.lead) h += '<p class="st-lead">' + esc(a.lead) + '</p>';
    if(a.sections && a.sections.length > 3) h += '<nav class="st-toc">' + a.sections.map(function(s, i){ return '<a href="#" data-i="' + i + '">' + (i + 1) + '. ' + esc(s.h) + '</a>'; }).join('') + '</nav>';
    (a.sections || []).forEach(function(s, i){
      h += '<section class="st-sec" id="stSec' + i + '"><h2>' + esc(s.h) + '</h2>';
      if(s.fig) h += figHtml(s.fig, a, i);
      if(s.img) h += imgHtml(s.img, a, i);
      (s.p || []).forEach(function(p){ h += '<p>' + esc(p) + '</p>'; });
      if(s.table && s.table.head) h += '<table class="st-table"><thead><tr>' + s.table.head.map(function(c){ return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        (s.table.rows || []).map(function(r){ return '<tr>' + r.map(function(c){ return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
      if(s.box) h += '<aside class="st-box"><b>' + esc(s.box.t || '더 알기') + '</b><div>' + esc(s.box.p || '') + '</div></aside>';
      h += '</section>';
    });
    if(a.keypoints && a.keypoints.length) h += '<section class="st-sec st-key"><h2>핵심 정리</h2><ul>' + a.keypoints.map(function(k){ return '<li>' + esc(k) + '</li>'; }).join('') + '</ul></section>';
    if(a.terms && a.terms.length) h += '<section class="st-sec"><h2>용어</h2><dl class="st-terms">' + a.terms.map(function(t){ return '<dt>' + esc(t[0]) + '</dt><dd>' + esc(t[1]) + '</dd>'; }).join('') + '</dl></section>';
    if(a.verses && a.verses.length) h += '<section class="st-sec"><h2>관련 성경 구절</h2><ul class="st-verses">' + a.verses.map(function(v){ return '<li><button type="button" class="st-ref" data-ref="' + esc(v.ref) + '">' + esc(v.ref) + '</button> <span>' + esc(v.note || '') + '</span></li>'; }).join('') + '</ul></section>';
    if(a.maps && a.maps.length && window.ATLAS){
      var ms = a.maps.map(function(id){ return ATLAS.byId(id); }).filter(Boolean);
      if(ms.length) h += '<section class="st-sec"><h2>관련 지도</h2><div class="st-maps">' + ms.map(function(m){ return '<button type="button" class="st-map" data-id="' + esc(m.id) + '">🗺 ' + esc(m.title) + '</button>'; }).join('') + '</div></section>';
    }
    var rel = related(a);
    if(rel.length) h += '<section class="st-sec"><h2>함께 읽을 해설</h2><div class="st-maps">' + rel.map(function(r){ return '<button type="button" class="st-map" data-go="' + esc(r.id) + '">📚 ' + esc(r.title) + '</button>'; }).join('') + '</div></section>';
    if(a.src && a.src.length) h += '<footer class="st-src"><b>참고한 책</b><ul>' + a.src.map(function(s){ return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></footer>';
    /* 앞·뒤 글 */
    var all = list(), k = all.indexOf(a);
    h += '<div class="st-nav">' + (k > 0 ? '<button type="button" class="btn" data-go="' + esc(all[k - 1].id) + '">← ' + esc(all[k - 1].title) + '</button>' : '<span></span>') +
      (k < all.length - 1 ? '<button type="button" class="btn" data-go="' + esc(all[k + 1].id) + '">' + esc(all[k + 1].title) + ' →</button>' : '') + '</div>';
    h += '</article>';
    var body = $('stBody'); body.innerHTML = h;
    /* 캔버스 도표 채우기 */
    [].forEach.call(body.querySelectorAll('canvas[data-fig]'), function(c){ drawFig(c, c.dataset.fig); });
    [].forEach.call(body.querySelectorAll('.st-toc a'), function(l){ l.onclick = function(e){ e.preventDefault(); var t = $('stSec' + l.dataset.i); if(t) t.scrollIntoView({ behavior:'smooth', block:'start' }); }; });
    [].forEach.call(body.querySelectorAll('.st-ref'), function(b){ b.onclick = function(){ goRef(b.dataset.ref, b); }; });
    [].forEach.call(body.querySelectorAll('.st-map[data-id]'), function(b){ b.onclick = function(){ var m = ATLAS.byId(b.dataset.id); if(m){ ATLAS.open(m, null); APP.toast('지도를 닫으면 해설로 돌아옵니다'); } }; });
    [].forEach.call(body.querySelectorAll('[data-go]'), function(b){ b.onclick = function(){ var a2 = byId(b.dataset.go); if(a2) show(a2); }; });
    if(active3d) active3d = null;   /* 글이 바뀌면 이전 3D 는 사라진 그림에 붙어 있었다 */
    if(window.TERRAIN3D) TERRAIN3D.hide();
    [].forEach.call(body.querySelectorAll('.st-3dbtn'), function(b){ b.onclick = function(e){ e.stopPropagation(); var f = b.closest('.st-fig'); activate3d(f, f.dataset.ref); }; });
    [].forEach.call(body.querySelectorAll('.st-fig'), function(f){ f.onclick = function(e){ if(e.target.closest('.st-3dbox')) return; openLight(f); }; f.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openLight(f); } }; });
  }
  /* 관련 해설: related 로 지정했거나, 지도 두 장 이상을 함께 쓰거나, 같은 구절을 다루는 글 */
  function related(a){
    var all = list(), ids = {};
    (a.related || []).forEach(function(id){ ids[id] = 3; });
    all.forEach(function(b){
      if(b === a) return;
      var shared = (a.maps || []).filter(function(m){ return (b.maps || []).indexOf(m) >= 0; }).length;
      if(shared >= 2) ids[b.id] = (ids[b.id] || 0) + shared;
      if((b.related || []).indexOf(a.id) >= 0) ids[b.id] = (ids[b.id] || 0) + 3;
    });
    return Object.keys(ids).sort(function(x, y){ return ids[y] - ids[x]; }).slice(0, 6).map(byId).filter(Boolean);
  }
  /* 본문 연동: 이 절(또는 장)을 다루는 해설 */
  var vindex = null;
  function buildIndex(){
    vindex = [];
    list().forEach(function(a){
      (a.verses || []).forEach(function(v){
        var r = APP.parseRefList(v.ref); if(!r) return;
        r.forEach(function(p){ vindex.push({ a:a, bi:p.bi, ci:p.ci, from:p.from, to:p.to }); });
      });
    });
  }
  function forVerse(bi, ci, vi, exactOnly){
    if(!vindex) buildIndex();
    var hit = {}, out = [];
    vindex.forEach(function(x){
      if(x.bi !== bi || x.ci !== ci) return;
      if(exactOnly && (x.from < 0 || vi < x.from || vi > x.to)) return;
      var exact = x.from < 0 || (vi >= x.from && vi <= x.to);
      var w = exact ? 2 : 1;
      if(!hit[x.a.id] || hit[x.a.id] < w) hit[x.a.id] = w;
    });
    Object.keys(hit).forEach(function(id){ out.push({ a:byId(id), w:hit[id] }); });
    return out.sort(function(x, y){ return y.w - x.w; }).map(function(x){ return x.a; }).filter(Boolean);
  }
  function goRef(ref, btn){
    var r = APP.parseRefList(ref); if(!r || !r.length) return APP.toast('구절을 찾지 못했습니다: ' + ref);
    var p = r[0], from = p.from >= 0 ? p.from : 0, to = p.from >= 0 ? p.to : from + 7, html = '';
    for(var v = from; v <= to; v++){ var t = APP.verseText(p.bi, p.ci, v); if(!t) break; html += '<p><b>' + (v + 1) + '</b> ' + esc(t) + '</p>'; }
    if(p.from < 0) html += '<p class="dim">… 장 전체는 [본문으로]</p>';
    $('stVpopRef').textContent = ref; $('stVpopBody').innerHTML = html || '<p class="dim">본문을 읽지 못했습니다.</p>';
    var pop = $('stVpop'); pop.hidden = false;
    /* 단추 옆에 두되 화면 밖으로 나가지 않게 */
    var rc = btn ? btn.getBoundingClientRect() : { left:200, bottom:200 };
    pop.style.left = '0px'; pop.style.top = '0px';
    var w = pop.offsetWidth, h = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(rc.left, window.innerWidth - w - 8)) + 'px';
    pop.style.top = Math.max(8, Math.min(rc.bottom + 6, window.innerHeight - h - 8)) + 'px';
    $('stVpopGo').onclick = function(){ closeVpop(); close(); APP.openChapter(p.bi, p.ci, from); };
    $('stVpopBody').scrollTop = 0; $('stVpopX').focus();
  }
  function closeVpop(){ var pop = $('stVpop'); if(pop && !pop.hidden) pop.hidden = true; }
  /* 3D 지형 시점 (실제 고도 격자 위) — 마우스로 돌리고 확대한다 */
  var VIEWS = {
    'relief3d:levant': { dem:'levant', n:33.6, w:33.8, s:29.3, e:36.6, vert:6, cam:{ from:[31.3, 32.1, 250], at:[31.7, 35.35] },
      labels:[[31.78, 35.23, '예루살렘'], [32.82, 35.6, '갈릴리 바다'], [31.4, 35.45, '사해'], [31.25, 34.8, '브엘세바'], [32.58, 35.18, '므깃도'], [33.25, 35.65, '단'], [32.28, 35.19, '사마리아'], [31.5, 34.45, '가사'], [32.05, 34.75, '욥바'], [32.65, 35.55, '이스르엘 골짜기', 's'], [31.0, 35.1, '네게브', 's'], [32.5, 35.8, '길르앗', 's'], [31.3, 35.75, '모압', 's']] },
    'relief3d:rift': { dem:'levant', n:33.4, w:34.9, s:30.9, e:36.2, vert:5, cam:{ from:[30.55, 35.5, 95], at:[32.3, 35.55] },
      labels:[[32.82, 35.6, '갈릴리 바다'], [31.4, 35.45, '사해'], [31.87, 35.44, '여리고'], [32.5, 35.5, '벧산'], [33.08, 35.6, '훌레'], [31.78, 35.23, '예루살렘'], [32.28, 35.19, '사마리아'], [32.2, 35.6, '요단 강', 's'], [32.5, 35.85, '길르앗', 's']] },
    'relief3d:judea': { dem:'levant', n:32.05, w:34.7, s:31.2, e:35.75, vert:4, cam:{ from:[31.05, 34.55, 38], at:[31.68, 35.25] },
      labels:[[31.78, 35.23, '예루살렘'], [31.53, 35.10, '헤브론'], [31.71, 35.2, '베들레헴', 's'], [31.87, 35.44, '여리고'], [31.4, 35.45, '사해'], [31.62, 34.85, '라기스'], [31.7, 35.0, '엘라 골짜기', 's'], [31.6, 35.35, '유다 광야', 's'], [31.9, 34.95, '쉐펠라', 's'], [32.05, 34.75, '욥바']] },
    'relief3d:galilee': { dem:'levant', n:33.35, w:35.0, s:32.4, e:36.0, vert:3.5, cam:{ from:[32.0, 35.22, 34], at:[32.85, 35.62] },
      labels:[[32.82, 35.6, '갈릴리 바다'], [32.88, 35.575, '가버나움', 's'], [32.7, 35.5, '디베랴', 's'], [32.7, 35.3, '나사렛'], [32.69, 35.39, '다볼 산', 's'], [33.25, 35.65, '단'], [33.42, 35.85, '헤르몬 산'], [32.92, 35.08, '악고'], [32.8, 35.75, '골란', 's'], [32.55, 35.5, '이스르엘 골짜기', 's'], [33.08, 35.6, '훌레', 's']] },
    'relief3d:jezreel': { dem:'levant', n:32.95, w:34.85, s:32.25, e:35.75, vert:3.5, cam:{ from:[32.0, 34.72, 30], at:[32.6, 35.35] },
      labels:[[32.58, 35.18, '므깃도'], [32.82, 34.97, '갈멜 산'], [32.55, 35.33, '이스르엘'], [32.5, 35.5, '벧산'], [32.69, 35.39, '다볼 산', 's'], [32.6, 35.25, '이스르엘 골짜기', 's'], [32.55, 35.35, '길보아 산', 's'], [32.7, 35.3, '나사렛'], [32.5, 35.0, '해변 길', 's'], [32.45, 35.15, '도단', 's']] },
    'relief3d:shephelah': { dem:'levant', n:32.05, w:34.45, s:31.35, e:35.35, vert:4, cam:{ from:[31.42, 34.22, 27], at:[31.72, 35.0] },
      labels:[[31.62, 34.85, '라기스'], [31.7, 34.98, '아세가', 's'], [31.75, 35.1, '엘라 골짜기'], [31.87, 35.02, '벧세메스'], [31.95, 35.05, '아얄론 골짜기', 's'], [31.78, 35.23, '예루살렘'], [31.53, 35.10, '헤브론'], [31.5, 34.45, '가사'], [31.55, 34.55, '아스글론'], [31.67, 34.57, '아스돗', 's'], [31.78, 34.85, '에그론', 's'], [31.6, 34.8, '가드', 's']] },
    'relief3d:negev': { dem:'levant', n:31.6, w:34.3, s:29.4, e:35.6, vert:4, cam:{ from:[30.2, 33.7, 58], at:[30.75, 34.9] },
      labels:[[31.25, 34.8, '브엘세바'], [30.9, 34.95, '신 광야', 's'], [30.6, 34.8, '가데스 바네아'], [30.5, 35.2, '아라바', 's'], [29.55, 34.95, '엘랏'], [31.4, 35.45, '사해'], [31.1, 35.2, '마크테쉬 라몬', 's'], [31.53, 35.10, '헤브론'], [30.5, 35.55, '에돔', 's']] },
    'relief3d:sinai': { dem:'levant', n:31.7, w:31.5, s:27.6, e:36.0, vert:5, cam:{ from:[25.6, 32.2, 270], at:[29.7, 33.7] },
      labels:[[28.54, 33.98, '시내 산(예벨 무사)'], [29.97, 32.55, '수에즈'], [29.55, 34.95, '엘랏'], [30.6, 34.8, '가데스 바네아'], [30.8, 32.3, '나일 삼각주', 's'], [31.25, 34.8, '브엘세바'], [31.5, 34.45, '가사'], [29.5, 33.4, '시내 반도', 's'], [31.0, 32.3, '고센(추정)', 's']] },
    'relief3d:ane': { dem:'ane', n:41.5, w:25.0, s:23.0, e:52.0, vert:12, cam:{ from:[14.0, 30.5, 1300], at:[33.0, 40.0] },
      labels:[[31.78, 35.23, '예루살렘'], [30.05, 31.23, '이집트(멤피스)'], [32.53, 44.42, '바벨론'], [36.36, 43.15, '니느웨'], [30.96, 46.1, '우르'], [36.87, 39.03, '하란'], [33.5, 36.3, '다메섹'], [39.9, 32.85, '아나톨리아(핫투샤)', 's'], [34.5, 43.3, '메소포타미아', 's'], [35.0, 38.5, '비옥한 초승달', 's'], [28.0, 43.0, '아라비아 사막', 's'], [25.7, 32.65, '테베', 's']] }
  };
  VIEWS['regions:ane'] = VIEWS['relief3d:ane'];
  /* 지역 구분·도로·강수 도표는 같은 도표를 지형 위에 입힌다 */
  ['regions:natural', 'regions:roads', 'regions:rain'].forEach(function(ref){
    VIEWS[ref] = { dem:'levant', n:33.45, w:34.0, s:29.45, e:36.4, vert:5, cam:{ from:[27.9, 33.3, 230], at:[31.6, 35.3] }, labels:[],
      paint:function(cv, win){ cv._3d = true; cv._labels = []; drawFig(cv, ref); VIEWS[ref].labels = cv._labels; } };
  });
  var active3d = null;   /* { fig, ref } */
  function has3d(ref){ return !!(VIEWS[ref] && window.TERRAIN3D && TERRAIN3D.ok()); }
  function activate3d(fig, ref, host){
    var v = VIEWS[ref]; if(!v) return false;
    var bid = v.dem === 'levant' ? 'levant' : 'neareast';
    if(!v.baseImg){ withBase(bid, function(im){ if(im){ v.baseImg = im; v.baseBox = ATLAS_BASES[bid]; } activate3d(fig, ref, host); }); if(!baseCache[bid]) return true; }
    host = host || fig;
    if(active3d && active3d.fig !== fig && active3d.fig.isConnected) restore3d();
    var box = host.querySelector('.st-3dbox');
    if(!box){
      var pv = host.querySelector('.st-preview'); if(pv) pv.hidden = true;
      box = document.createElement('div'); box.className = 'st-3dbox j3-box';
      box.innerHTML = '<div class="st-3dtools"><button type="button" class="btn st-3dhome">처음 위치</button><span class="st-3dhint">끌기: 돌리기 · 휠: 확대 · 오른쪽 끌기: 옮기기</span></div>';
      host.insertBefore(box, host.querySelector('figcaption'));
      box.querySelector('.st-3dhome').onclick = function(e){ e.stopPropagation(); TERRAIN3D.home(); };
      box.onclick = function(e){ e.stopPropagation(); }; box.onkeydown = function(e){ e.stopPropagation(); };
    }
    if(!TERRAIN3D.show(box, v, ref)){ box.remove(); var pv2 = host.querySelector('.st-preview'); if(pv2) pv2.hidden = false; return false; }
    active3d = { fig:fig, ref:ref, host:host }; return true;
  }
  function restore3d(){
    if(!active3d) return; TERRAIN3D.hide();
    var box = active3d.host.querySelector('.st-3dbox'); if(box) box.remove();
    var pv = active3d.host.querySelector('.st-preview'); if(pv) pv.hidden = false;
    active3d = null;
  }
  /* 그림: 파일 그림(fig 폴더)이거나 캔버스 도표 */
  var FILE_FIG = { 'profile:south':'profile-south', 'profile:center':'profile-center', 'profile:north':'profile-north', 'profile:galilee':'profile-galilee', 'profile:rift':'profile-rift',
    'relief3d:levant':'relief3d-levant', 'relief3d:rift':'relief3d-rift', 'relief3d:judea':'relief3d-judea', 'relief3d:galilee':'relief3d-galilee', 'relief3d:jezreel':'relief3d-jezreel',
    'relief3d:shephelah':'relief3d-shephelah', 'relief3d:negev':'relief3d-negev', 'relief3d:sinai':'relief3d-sinai', 'relief3d:ane':'relief3d-ane', 'regions:ane':'relief3d-ane' };
  var FIG_TITLE = { 'profile:south':'남부 동서 단면', 'profile:center':'중부 동서 단면', 'profile:north':'북부 동서 단면', 'profile:galilee':'갈릴리 동서 단면', 'profile:rift':'요단 지구대 남북 단면',
    'relief3d:levant':'레반트 3D 조감', 'relief3d:rift':'요단 지구대 3D', 'relief3d:judea':'유다 산지와 사해 3D', 'relief3d:galilee':'갈릴리 3D', 'relief3d:jezreel':'이스르엘 골짜기 3D', 'relief3d:shephelah':'쉐펠라 3D',
    'relief3d:negev':'네게브·아라바 3D', 'relief3d:sinai':'시내 반도 3D', 'relief3d:ane':'고대 근동 3D', 'regions:ane':'고대 근동 — 비옥한 초승달',
    'regions:natural':'팔레스타인의 자연 지역', 'regions:roads':'고대 국제 도로', 'regions:rain':'연 강수량 분포', 'climate:jerusalem':'예루살렘의 달별 비와 기온', 'climate:compare':'도시별 연 강수량',
    'timeline:periods':'고고학 시대 연표', 'calendar:agri':'농사 달력과 절기' };
  function figHtml(f, a, i){
    var ref = f.ref || '', file = FILE_FIG[ref], cap = f.cap || FIG_TITLE[ref] || '';
    var t3 = has3d(ref), btn = t3 ? '<button type="button" class="st-3dbtn" title="실제 고도 자료 위에서 마우스로 돌리고 확대해 봅니다">🧭 3D로 돌려 보기</button>' : '';
    if(file) return '<figure class="st-fig' + (t3 ? ' st-3d' : '') + '" tabindex="0" title="크게 보기" data-ref="' + esc(ref) + '"><div class="st-preview"><img src="data/d1/study/fig/' + file + '.jpg" alt="' + esc(FIG_TITLE[ref] || '') + '" loading="lazy">' + btn + '</div><figcaption><b>' + esc(FIG_TITLE[ref] || '') + '</b> ' + esc(cap) + '</figcaption></figure>';
    if(DRAW[ref]){ var tall = /^regions:(natural|roads|rain)$/.test(ref); return '<figure class="st-fig' + (tall ? ' st-fig-map' : '') + (t3 ? ' st-3d' : '') + '" tabindex="0" title="크게 보기" data-ref="' + esc(ref) + '"><div class="st-preview"><canvas data-fig="' + esc(ref) + '" width="' + (tall ? 1000 : 1400) + '" height="' + (tall ? 1300 : 900) + '"></canvas>' + btn + '</div><figcaption><b>' + esc(FIG_TITLE[ref] || '') + '</b> ' + esc(cap) + '</figcaption></figure>'; }
    return '';
  }
  function imgHtml(im, a, i){
    var file = im.file || (a.id + '-' + i);
    return '<figure class="st-fig st-ai" tabindex="0" title="크게 보기"><img src="data/d1/study/img/' + esc(file) + '.jpg" alt="" loading="lazy" onerror="this.parentNode.classList.add(\'st-noimg\')"><figcaption>' + esc(im.cap || '') + ' <span class="dim">(AI 재현 그림)</span></figcaption></figure>';
  }
  /* ── 크게 보기 ── */
  function openLight(f){
    var lb = $('stLight'), inner = $('stLightIn'); inner.innerHTML = '';
    var ref = f.dataset.ref;
    if(ref && has3d(ref)){
      var host = document.createElement('div'); host.className = 'st-lighthost'; inner.appendChild(host);
      var cap0 = f.querySelector('figcaption'); $('stLightCap').textContent = cap0 ? cap0.textContent : '';
      lb.hidden = false; if(active3d) restore3d(); activate3d(f, ref, host); host.querySelector('.st-3dbox').classList.add('big'); $('stLightX').focus(); return;
    }
    var src = f.querySelector('img, canvas'); if(!src) return;
    if(src.tagName === 'IMG'){ var im = Object.assign(new Image(), { crossOrigin:'anonymous' }); im.src = src.src; inner.appendChild(im); }
    else { var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); inner.appendChild(c); }
    var cap = f.querySelector('figcaption'); $('stLightCap').textContent = cap ? cap.textContent : '';
    lb.hidden = false; $('stLightX').focus();
  }
  function closeLight(){ var lb = $('stLight'); if(lb && !lb.hidden){ lb.hidden = true; if(active3d && active3d.host.classList.contains('st-lighthost')) restore3d(); } }

  /* ═══════════ 캔버스 도표 ═══════════ */
  var DRAW = {};
  var baseCache = {};
  var base3d = null;
  function withBase(id, cb){
    if(base3d){ cb(null); return; }
    if(baseCache[id]){ cb(baseCache[id]); return; }
    var im = Object.assign(new Image(), { crossOrigin:'anonymous' }); im.onload = function(){ baseCache[id] = im; cb(im); }; im.onerror = function(){ cb(null); }; im.src = 'data/maps/' + id + '.jpg';
  }
  /* 레반트 바탕(등장방형): ATLAS_BASES.levant 범위 안의 창을 잘라 그린다 */
  function mapCtx(c, win){
    var g = c.getContext('2d'), W = c.width, H = c.height, B = ATLAS_BASES.levant;
    var k = Math.min(W / (win.e - win.w), H / (win.n - win.s) / 1.0);
    var cosf = Math.cos((win.n + win.s) / 2 * Math.PI / 180);
    var kx = k * cosf, ky = k;
    /* 창이 캔버스 비율과 다르면 가운데 맞춤 */
    var ox = (W - (win.e - win.w) * kx) / 2, oy = (H - (win.n - win.s) * ky) / 2, placed = [], t3 = !!c._3d;
    if(t3){ ox = 0; oy = 0; kx = W / (win.e - win.w); ky = H / (win.n - win.s); }
    function X(lon){ return ox + (lon - win.w) * kx; } function Y(lat){ return oy + (win.n - lat) * ky; }
    return { g:g, W:W, H:H, X:X, Y:Y, B:B, kx:kx, ky:ky,
      clear:function(im){ if(t3) return; g.fillStyle = '#d9e6ee'; g.fillRect(0, 0, W, H); this.base(im); },
      is3d:t3,
      base:function(im){ if(!im) return; var sx = (win.w - B.west) / (B.east - B.west) * im.width, sy = (B.north - win.n) / (B.north - B.south) * im.height, sw = (win.e - win.w) / (B.east - B.west) * im.width, sh = (win.n - win.s) / (B.north - B.south) * im.height; g.drawImage(im, sx, sy, sw, sh, X(win.w), Y(win.n), (win.e - win.w) * kx, (win.n - win.s) * ky); },
      poly:function(pts, fill, stroke, dash){ g.beginPath(); pts.forEach(function(p, i){ g[i ? 'lineTo' : 'moveTo'](X(p[1]), Y(p[0])); }); g.closePath(); if(fill){ g.fillStyle = fill; g.fill(); } if(stroke){ g.setLineDash(dash || []); g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); g.setLineDash([]); } },
      line:function(pts, color, w, dash){ g.beginPath(); pts.forEach(function(p, i){ g[i ? 'lineTo' : 'moveTo'](X(p[1]), Y(p[0])); }); g.setLineDash(dash || []); g.strokeStyle = color; g.lineWidth = w || 3; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); g.setLineDash([]); },
      label:function(lat, lon, t, o){ o = o || {}; if(t3){ c._labels.push([lat, lon, t, (o.size || 22) < 20 ? 's' : '']); return; } var x0 = X(lon), y0 = Y(lat), x = x0, y = y0; g.font = (o.bold ? '700 ' : '600 ') + (o.size || 22) + 'px "Malgun Gothic", "Noto Sans KR", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        if(o.dot){ g.beginPath(); g.arc(x, y, 5, 0, 7); g.fillStyle = '#c0392b'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); y -= 18; }
        x += (o.dx || 0); y += (o.dy || 0);
        var tw = g.measureText(t).width, th = (o.size || 22), pad = 3;
        function rect(cx, cy){ return [cx - tw / 2 - pad, cy - th / 2 - pad, cx + tw / 2 + pad, cy + th / 2 + pad]; }
        function hits(r){ return placed.some(function(p){ return !(r[2] < p[0] || r[0] > p[2] || r[3] < p[1] || r[1] > p[3]); }) || r[0] < 0 || r[2] > W || r[1] < 0 || r[3] > H; }
        var r = rect(x, y), moved = false;
        if(hits(r)){
          var cand = [], d;
          for(d = 1; d <= 6 && !moved; d++){
            cand = [[tw / 2 + 14 + d * 10, -d * 6], [-(tw / 2 + 14 + d * 10), -d * 6], [tw / 2 + 14 + d * 10, d * 12], [-(tw / 2 + 14 + d * 10), d * 12], [0, -(th + 6 + d * 12)], [0, th + 10 + d * 12], [tw / 2 + 10, -(th + d * 12)], [-(tw / 2 + 10), -(th + d * 12)]];
            for(var k = 0; k < cand.length; k++){ var rr = rect(x + cand[k][0], y + cand[k][1]); if(!hits(rr)){ x += cand[k][0]; y += cand[k][1]; r = rr; moved = true; break; } }
          }
        }
        placed.push(r);
        if(moved){ /* 지점에서 글자 상자 가장자리까지 가는 선 */
          var ex = Math.max(r[0], Math.min(x0, r[2])), ey = Math.max(r[1], Math.min(y0, r[3]));
          g.beginPath(); g.moveTo(x0, y0); g.lineTo(ex, ey); g.strokeStyle = 'rgba(43,33,23,.85)'; g.lineWidth = 1.5; g.stroke();
          g.fillStyle = 'rgba(255,250,240,.85)'; g.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
        }
        g.lineWidth = 5; g.strokeStyle = o.halo || 'rgba(255,250,240,.9)'; g.strokeText(t, x, y); g.fillStyle = o.color || '#2b2117'; g.fillText(t, x, y); },
      credit:function(t){ if(t3) return; g.font = '14px "Malgun Gothic", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillStyle = 'rgba(255,250,240,.85)'; var w = g.measureText(t).width; g.fillRect(8, H - 26, w + 12, 22); g.fillStyle = '#5a4a3a'; g.fillText(t, 14, H - 8); },
      legend:function(items, x, y){ if(t3) return; g.font = '600 17px "Malgun Gothic", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; var w = 0; items.forEach(function(it){ w = Math.max(w, g.measureText(it[1]).width); });
        g.fillStyle = 'rgba(255,250,240,.92)'; g.fillRect(x, y, w + 50, items.length * 26 + 14); g.strokeStyle = '#a08c70'; g.strokeRect(x, y, w + 50, items.length * 26 + 14);
        items.forEach(function(it, i){ var yy = y + 20 + i * 26; if(it[2] === 'line'){ g.strokeStyle = it[0]; g.lineWidth = 4; g.setLineDash(it[3] || []); g.beginPath(); g.moveTo(x + 10, yy); g.lineTo(x + 34, yy); g.stroke(); g.setLineDash([]); } else { g.fillStyle = it[0]; g.fillRect(x + 10, yy - 9, 24, 18); g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1; g.strokeRect(x + 10, yy - 9, 24, 18); } g.fillStyle = '#2b2117'; g.fillText(it[1], x + 42, yy); }); }
    };
  }
  /* 덧칠한 뒤 바다(바탕 그림의 파란 화소)를 되살린다 */
  function keepSea(m, im, win){
    if(!im || m.is3d) return; var off = document.createElement('canvas'); off.width = m.W; off.height = m.H; var og = off.getContext('2d');
    var B = m.B, sx = (win.w - B.west) / (B.east - B.west) * im.width, sy = (B.north - win.n) / (B.north - B.south) * im.height, sw = (win.e - win.w) / (B.east - B.west) * im.width, sh = (win.n - win.s) / (B.north - B.south) * im.height;
    og.fillStyle = '#d9e6ee'; og.fillRect(0, 0, m.W, m.H); og.drawImage(im, sx, sy, sw, sh, m.X(win.w), m.Y(win.n), (win.e - win.w) * m.kx, (win.n - win.s) * m.ky);
    var src = og.getImageData(0, 0, m.W, m.H), dst = m.g.getImageData(0, 0, m.W, m.H), a = src.data, d = dst.data;
    for(var i = 0; i < a.length; i += 4){ if(a[i + 2] > a[i] + 25 && a[i + 2] >= a[i + 1]){ d[i] = a[i]; d[i + 1] = a[i + 1]; d[i + 2] = a[i + 2]; } }
    m.g.putImageData(dst, 0, 0);
  }
  var LEV = { n:33.45, s:29.45, w:34.0, e:36.4 };
  /* 자연 지역 — 다섯 띠 + 네게브·이스르엘 (개략 경계, 지형 위에 반투명) */
  DRAW['regions:natural'] = function(c){
    withBase('levant', function(im){
      var m = mapCtx(c, LEV); m.clear(im);
      var coast = [[33.1, 35.1], [32.85, 34.98], [32.55, 34.9], [32.3, 34.85], [32.0, 34.75], [31.6, 34.5], [31.35, 34.3], [31.25, 34.2], [31.35, 34.55], [31.6, 34.7], [31.9, 34.95], [32.2, 34.95], [32.45, 35.0], [32.7, 35.05], [32.85, 35.12], [33.1, 35.2]];
      var sheph = [[31.95, 34.95], [31.85, 34.85], [31.6, 34.75], [31.35, 34.6], [31.3, 34.85], [31.5, 34.95], [31.75, 35.05], [31.95, 35.1]];
      var hills = [[33.3, 35.2], [33.3, 35.55], [33.0, 35.5], [32.75, 35.45], [32.5, 35.4], [32.2, 35.4], [31.9, 35.35], [31.5, 35.3], [31.3, 35.2], [31.25, 34.95], [31.3, 34.85], [31.5, 34.95], [31.75, 35.05], [31.95, 35.1], [32.2, 34.95], [32.45, 35.0], [32.5, 35.3], [32.7, 35.05], [32.85, 35.12], [33.1, 35.2]];
      var jezreel = [[32.75, 35.05], [32.72, 35.4], [32.55, 35.5], [32.45, 35.5], [32.5, 35.3], [32.6, 35.1]];
      var rift = [[33.45, 35.55], [33.45, 35.75], [32.75, 35.7], [32.2, 35.6], [31.8, 35.55], [31.3, 35.55], [30.9, 35.45], [30.2, 35.25], [29.5, 35.0], [29.5, 34.85], [30.2, 35.05], [30.9, 35.25], [31.3, 35.35], [31.8, 35.4], [32.2, 35.42], [32.75, 35.45], [33.0, 35.5], [33.3, 35.55]];
      var trans = [[33.45, 35.75], [33.45, 36.4], [29.45, 36.4], [29.45, 35.0], [30.2, 35.25], [30.9, 35.45], [31.3, 35.55], [31.8, 35.55], [32.2, 35.6], [32.75, 35.7]];
      var negev = [[31.35, 34.3], [31.35, 35.35], [30.9, 35.25], [30.2, 35.05], [29.5, 34.85], [29.5, 34.3], [30.5, 34.3], [31.0, 34.2]];
      var C = { coast:'rgba(70,150,220,.35)', sheph:'rgba(240,200,60,.4)', hills:'rgba(180,90,40,.35)', jezreel:'rgba(90,190,90,.45)', rift:'rgba(120,80,160,.35)', trans:'rgba(200,120,60,.3)', negev:'rgba(210,180,120,.4)' };
      m.poly(negev, C.negev); m.poly(trans, C.trans); m.poly(hills, C.hills); m.poly(sheph, C.sheph); m.poly(coast, C.coast); m.poly(rift, C.rift); m.poly(jezreel, C.jezreel);
      keepSea(m, im, LEV);
      m.label(32.0, 34.72, '해안 평야', { size:22, bold:true }); m.label(31.72, 34.82, '쉐펠라', { size:22, bold:true });
      m.label(31.62, 35.25, '유다 산지', { size:22, bold:true }); m.label(32.15, 35.15, '사마리아 산지', { size:22, bold:true }); m.label(32.95, 35.35, '갈릴리', { size:22, bold:true });
      m.label(32.62, 35.28, '이스르엘 골짜기', { size:19 }); m.label(32.0, 35.52, '요단 지구대', { size:19, bold:true, color:'#3a2a5a' }); m.label(31.5, 35.45, '사해', { size:18, color:'#123' });
      m.label(32.7, 35.95, '바산', { size:22, bold:true }); m.label(32.2, 35.95, '길르앗', { size:22, bold:true }); m.label(31.55, 35.85, '모압', { size:22, bold:true }); m.label(30.5, 35.7, '에돔', { size:22, bold:true });
      m.label(30.7, 34.75, '네게브', { size:24, bold:true }); m.label(30.5, 35.15, '아라바', { size:18 }); m.label(31.9, 35.85, '암몬', { size:20 });
      [[31.78, 35.23, '예루살렘'], [32.82, 35.6, '갈릴리 바다'], [31.25, 34.8, '브엘세바'], [32.58, 35.18, '므깃도'], [33.25, 35.65, '단'], [31.5, 34.45, '가사'], [32.05, 34.75, '욥바'], [31.53, 35.1, '헤브론'], [32.28, 35.19, '사마리아']].forEach(function(p){ m.label(p[0], p[1], p[2], { size:17, dot:true }); });
      m.legend([[C.coast, '해안 평야'], [C.sheph, '쉐펠라(구릉)'], [C.hills, '중앙 산지'], [C.jezreel, '이스르엘 골짜기'], [C.rift, '요단 지구대'], [C.trans, '트랜스요르단 고원'], [C.negev, '네게브']], 16, 16);
      m.credit('지역 경계는 개략 · 지형: SRTM 90m (CGIAR-CSI) · 2026 설교자의 성경');
    });
  };
  /* 고대 도로 */
  DRAW['regions:roads'] = function(c){
    withBase('levant', function(im){
      var m = mapCtx(c, c._3d ? LEV : { n:33.45, s:29.45, w:33.9, e:36.5 }); m.clear(im);
      var via = [[29.9, 33.95], [30.6, 34.1], [31.1, 34.25], [31.5, 34.45], [31.8, 34.65], [32.05, 34.8], [32.35, 34.9], [32.55, 35.0], [32.58, 35.18], [32.7, 35.3], [32.85, 35.55], [33.0, 35.62], [33.25, 35.65], [33.5, 36.0], [33.5, 36.3]];
      var via2 = [[32.85, 35.55], [32.95, 35.4], [33.1, 35.2], [33.3, 35.15]];
      var king = [[29.55, 34.95], [30.2, 35.45], [30.6, 35.6], [31.05, 35.7], [31.3, 35.75], [31.6, 35.8], [31.95, 35.9], [32.25, 35.85], [32.55, 35.85], [32.8, 36.0], [33.1, 36.1], [33.5, 36.3]];
      var ridge = [[31.25, 34.8], [31.53, 35.1], [31.71, 35.2], [31.78, 35.23], [31.9, 35.22], [32.05, 35.28], [32.22, 35.27], [32.28, 35.19], [32.45, 35.15], [32.58, 35.18]];
      var cross = [[32.05, 34.8], [31.9, 35.05], [31.78, 35.23], [31.87, 35.44], [31.95, 35.6], [32.2, 35.85]];
      var cross2 = [[32.58, 35.18], [32.5, 35.5], [32.55, 35.8]];
      var cross3 = [[31.5, 34.45], [31.25, 34.8], [31.1, 35.3], [30.6, 35.6]];
      m.line(via, 'rgba(255,255,255,.9)', 9); m.line(via, '#c0392b', 5); m.line(via2, 'rgba(255,255,255,.9)', 8); m.line(via2, '#c0392b', 4);
      m.line(king, 'rgba(255,255,255,.9)', 9); m.line(king, '#2a6fbd', 5);
      m.line(ridge, 'rgba(255,255,255,.9)', 8); m.line(ridge, '#7a4b1e', 4);
      [cross, cross2, cross3].forEach(function(r){ m.line(r, 'rgba(255,255,255,.8)', 6); m.line(r, '#4a4a4a', 3, [10, 8]); });
      [[31.5, 34.45, '가사'], [31.8, 34.65, '아스돗'], [32.05, 34.75, '욥바'], [32.55, 35.0, '아루보'], [32.58, 35.18, '므깃도'], [33.0, 35.62, '하솔'], [33.5, 36.3, '다메섹'], [31.78, 35.23, '예루살렘'], [31.53, 35.1, '헤브론'], [31.25, 34.8, '브엘세바'], [32.28, 35.19, '사마리아'], [32.22, 35.27, '세겜'], [31.95, 35.9, '랍바(암몬)'], [31.6, 35.8, '디본'], [30.2, 35.45, '보스라'], [29.55, 34.95, '엘랏'], [32.55, 35.85, '라못길르앗'], [31.87, 35.44, '여리고'], [32.5, 35.5, '벧산'], [29.9, 33.95, '이집트로']].forEach(function(p){ m.label(p[0], p[1], p[2], { size:17, dot:true }); });
      m.legend([['#c0392b', '해변 길 (Via Maris)', 'line'], ['#2a6fbd', '왕의 대로', 'line'], ['#7a4b1e', '산지 능선길', 'line'], ['#4a4a4a', '동서 연결로', 'line', [10, 8]]], 16, 16);
      m.credit('도로 선은 통설을 단순화한 것 · 지형: SRTM 90m (CGIAR-CSI) · 2026 설교자의 성경');
    });
  };
  /* 연 강수량 — 대략적 등우선 띠 */
  DRAW['regions:rain'] = function(c){
    withBase('levant', function(im){
      var m = mapCtx(c, LEV); m.clear(im);
      var g = m.g; g.globalAlpha = .55;
      /* 남·동으로 갈수록 마름: 네 띠를 폴리곤으로 */
      var z800 = [[33.45, 35.1], [33.45, 35.9], [33.1, 35.85], [32.95, 35.5], [32.95, 35.15]];
      var z600 = [[33.45, 34.9], [33.45, 36.2], [32.6, 36.0], [32.3, 35.45], [31.9, 35.4], [31.6, 35.3], [31.45, 35.15], [31.5, 34.9], [31.9, 34.85], [32.3, 34.9], [32.95, 35.05]];
      var z400 = [[33.45, 34.7], [33.45, 36.4], [31.8, 36.1], [31.3, 35.85], [31.2, 35.4], [31.2, 34.75], [31.5, 34.5], [32.0, 34.7], [32.95, 34.95]];
      var z200 = [[33.45, 34.5], [33.45, 36.4], [30.9, 36.4], [30.7, 35.6], [30.9, 35.0], [31.0, 34.4], [31.4, 34.25], [32.0, 34.6]];
      m.poly([[33.45, 34.0], [33.45, 36.4], [29.45, 36.4], [29.45, 34.0]], '#e8c57a'); m.poly(z200, '#c9d88a'); m.poly(z400, '#8fc47a'); m.poly(z600, '#4fa36a'); m.poly(z800, '#2a7a55');
      /* 요단 골짜기·사해 비그늘 */
      m.poly([[32.4, 35.5], [31.9, 35.45], [31.3, 35.35], [31.0, 35.3], [31.0, 35.6], [31.3, 35.7], [31.9, 35.6], [32.4, 35.62]], '#e8c57a');
      g.globalAlpha = 1;
      keepSea(m, im, LEV);
      [[33.25, 35.65, '단 ~800'], [32.95, 35.5, '상 갈릴리 700+'], [32.82, 35.6, '디베랴 400'], [32.28, 35.19, '사마리아 600'], [31.78, 35.23, '예루살렘 550'], [31.87, 35.44, '여리고 150'], [31.53, 35.1, '헤브론 500'], [32.05, 34.75, '욥바 530'], [31.25, 34.8, '브엘세바 200'], [30.6, 34.8, '가데스 100'], [29.55, 34.95, '엘랏 25'], [31.95, 35.9, '암만 270'], [32.6, 35.85, '길르앗 500'], [31.5, 35.45, '사해 50']].forEach(function(p){ m.label(p[0], p[1], p[2], { size:16, dot:true }); });
      m.legend([['#2a7a55', '800mm 이상'], ['#4fa36a', '600–800'], ['#8fc47a', '400–600'], ['#c9d88a', '200–400'], ['#e8c57a', '200mm 미만 (반건조·사막)']], 16, 16);
      m.credit('연 강수량(mm)은 대략값 · 등우선은 개략 · 지형: SRTM 90m · 2026 설교자의 성경');
    });
  };
  /* 예루살렘 달별 기후 */
  DRAW['climate:jerusalem'] = function(c){
    var g = c.getContext('2d'), W = c.width, H = c.height; g.fillStyle = '#fffdf8'; g.fillRect(0, 0, W, H);
    var rain = [133, 118, 92, 24, 3, 0, 0, 0, 0.3, 15, 60, 105], hi = [12, 13, 16, 21, 25, 28, 29, 29, 28, 25, 19, 14], lo = [6, 6, 8, 12, 15, 17, 19, 19, 18, 16, 12, 8];
      var mon = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    var L = 90, R = 90, T = 90, B = 110, pw = W - L - R, ph = H - T - B;
    g.font = '700 28px "Malgun Gothic", sans-serif'; g.fillStyle = '#2b2117'; g.textAlign = 'left'; g.fillText('예루살렘 — 달별 강수량과 기온 (연 약 550mm, 겨울에만 비)', L, 48);
    for(var v = 0; v <= 150; v += 25){ var y = T + ph - v / 150 * ph; g.strokeStyle = '#e6e0d4'; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); g.font = '16px "Malgun Gothic", sans-serif'; g.fillStyle = '#4a6fa5'; g.textAlign = 'right'; g.fillText(v + 'mm', L - 10, y + 6); }
    for(var t = 0; t <= 30; t += 10){ var yy = T + ph - t / 30 * ph; g.fillStyle = '#b5451b'; g.textAlign = 'left'; g.fillText(t + '°C', L + pw + 10, yy + 6); }
    var bw = pw / 12;
    rain.forEach(function(r, i){ var x = L + i * bw + bw * .18, h = r / 150 * ph; g.fillStyle = '#4a8fd6'; g.fillRect(x, T + ph - h, bw * .64, h); g.fillStyle = '#2b2117'; g.textAlign = 'center'; g.font = '16px "Malgun Gothic", sans-serif'; g.fillText(mon[i], L + i * bw + bw / 2, T + ph + 26); if(r >= 1) g.fillText(Math.round(r), L + i * bw + bw / 2, T + ph - h - 8); });
    function poly(arr, col){ g.beginPath(); arr.forEach(function(v, i){ var x = L + i * bw + bw / 2, y = T + ph - v / 30 * ph; g[i ? 'lineTo' : 'moveTo'](x, y); }); g.strokeStyle = col; g.lineWidth = 4; g.stroke(); arr.forEach(function(v, i){ g.beginPath(); g.arc(L + i * bw + bw / 2, T + ph - v / 30 * ph, 5, 0, 7); g.fillStyle = col; g.fill(); }); }
    poly(hi, '#d35400'); poly(lo, '#e6a23c');
    /* 이른 비·늦은 비 표시 */
    g.font = '700 18px "Malgun Gothic", sans-serif'; g.textAlign = 'center';
    g.fillStyle = 'rgba(74,143,214,.15)'; g.fillRect(L + 9.5 * bw, T, bw * 1.5, ph); g.fillStyle = '#1f4e8c'; g.fillText('이른 비 (요레)', L + 10.25 * bw, T + 28); g.fillText('10–11월', L + 10.25 * bw, T + 52);
    g.fillStyle = 'rgba(74,143,214,.15)'; g.fillRect(L + 2 * bw, T, bw * 1.5, ph); g.fillStyle = '#1f4e8c'; g.fillText('늦은 비 (말코쉬)', L + 2.75 * bw, T + 28); g.fillText('3–4월', L + 2.75 * bw, T + 52);
    g.fillStyle = 'rgba(230,160,60,.12)'; g.fillRect(L + 5 * bw, T, bw * 4, ph); g.fillStyle = '#8a4b1f'; g.fillText('건기 — 비 없음, 이슬만', L + 7 * bw, T + 28);
    g.font = '16px "Malgun Gothic", sans-serif'; g.textAlign = 'left'; g.fillStyle = '#4a8fd6'; g.fillRect(L, H - 44, 22, 14); g.fillStyle = '#2b2117'; g.fillText('강수량', L + 30, H - 32);
    g.strokeStyle = '#d35400'; g.lineWidth = 4; g.beginPath(); g.moveTo(L + 130, H - 37); g.lineTo(L + 160, H - 37); g.stroke(); g.fillText('낮 최고 기온', L + 168, H - 32);
    g.strokeStyle = '#e6a23c'; g.beginPath(); g.moveTo(L + 310, H - 37); g.lineTo(L + 340, H - 37); g.stroke(); g.fillText('밤 최저 기온', L + 348, H - 32);
    g.fillStyle = '#7b6a58'; g.fillText('기후 평년값(대략) · 2026 설교자의 성경', L + 520, H - 32);
  };
  DRAW['climate:compare'] = function(c){
    var g = c.getContext('2d'), W = c.width, H = c.height; g.fillStyle = '#fffdf8'; g.fillRect(0, 0, W, H);
    var d = [['단(헤르몬 기슭)', 800, '#2a7a55'], ['사펫(상 갈릴리)', 700, '#2a7a55'], ['사마리아', 600, '#4fa36a'], ['예루살렘', 550, '#4fa36a'], ['욥바(해안)', 530, '#4fa36a'], ['헤브론', 500, '#4fa36a'], ['디베랴(갈릴리 바다)', 400, '#8fc47a'], ['암만(길르앗)', 270, '#c9d88a'], ['브엘세바', 200, '#c9d88a'], ['여리고', 150, '#e8c57a'], ['사해 연안', 50, '#e8c57a'], ['엘랏', 25, '#e8c57a']];
    var L = 300, R = 80, T = 90, B = 60, pw = W - L - R, rh = (H - T - B) / d.length;
    g.font = '700 28px "Malgun Gothic", sans-serif'; g.fillStyle = '#2b2117'; g.textAlign = 'left'; g.fillText('도시별 연 강수량 비교 — 북에서 남으로, 서에서 동으로 줄어든다', 40, 48);
    for(var v = 0; v <= 800; v += 200){ var x = L + v / 850 * pw; g.strokeStyle = '#e6e0d4'; g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - B); g.stroke(); g.font = '16px "Malgun Gothic", sans-serif'; g.fillStyle = '#7b6a58'; g.textAlign = 'center'; g.fillText(v + 'mm', x, H - B + 24); }
    d.forEach(function(r, i){ var y = T + i * rh; g.fillStyle = r[2]; g.fillRect(L, y + rh * .18, r[1] / 850 * pw, rh * .64); g.fillStyle = '#2b2117'; g.font = '600 19px "Malgun Gothic", sans-serif'; g.textAlign = 'right'; g.fillText(r[0], L - 14, y + rh / 2 + 7); g.textAlign = 'left'; g.fillText('약 ' + r[1] + 'mm', L + r[1] / 850 * pw + 10, y + rh / 2 + 7); });
    g.font = '15px "Malgun Gothic", sans-serif'; g.fillStyle = '#7b6a58'; g.textAlign = 'right'; g.fillText('대략값(연 평균) · 참고: 서울 약 1,400mm · 2026 설교자의 성경', W - 40, H - 10);
  };
  /* 연표 */
  DRAW['timeline:periods'] = function(c){
    var g = c.getContext('2d'), W = c.width, H = c.height; g.fillStyle = '#fffdf8'; g.fillRect(0, 0, W, H);
    var per = [['초기 청동기', -3300, -2000, '#cbb8a0'], ['중기 청동기', -2000, -1550, '#d9c39a'], ['후기 청동기', -1550, -1175, '#e2b46a'], ['철기 1', -1175, -1000, '#c98f5a'], ['철기 2', -1000, -720, '#b8744a'], ['철기 3', -720, -586, '#9c5a3a'], ['바벨론', -586, -539, '#8a7ba0'], ['페르시아', -539, -332, '#7d9bc4'], ['헬라', -332, -63, '#79b7a5'], ['로마', -63, 330, '#c47a7a']];
    var ev = [[-2000, '아브라함'], [-1700, '요셉'], [-1446, '출애굽(이른 연대)'], [-1260, '출애굽(늦은 연대)'], [-1207, '메르넵타 석비'], [-1180, '블레셋 정착'], [-1000, '다윗'], [-960, '솔로몬 성전'], [-925, '시삭 침공'], [-853, '카르카르 전투'], [-722, '사마리아 함락'], [-701, '산헤립'], [-586, '예루살렘 함락'], [-538, '귀환'], [-445, '느헤미야'], [-332, '알렉산더'], [-167, '마카비'], [-37, '헤롯'], [-4, '예수 탄생'], [30, '십자가'], [70, '성전 파괴']];
    var L = 60, R = 60, T = 120, pw = W - L - R, a = -2300, b = 400;
    function X(y){ return L + (y - a) / (b - a) * pw; }
    g.font = '700 28px "Malgun Gothic", sans-serif'; g.fillStyle = '#2b2117'; g.textAlign = 'left'; g.fillText('고고학 시대 구분과 성경의 사건들', L, 48);
    g.font = '15px "Malgun Gothic", sans-serif'; g.fillStyle = '#7b6a58'; g.fillText('시대 구분은 학자마다 조금씩 다르며, 출애굽 연대는 이른 연대(BC 1446)와 늦은 연대(BC 13세기)가 함께 논의된다', L, 76);
    per.forEach(function(p){ if(p[2] <= a) return; var x0 = Math.max(X(p[1]), L); g.fillStyle = p[3]; g.fillRect(x0, T, X(p[2]) - x0, 70); g.strokeStyle = '#fff'; g.strokeRect(x0, T, X(p[2]) - x0, 70); g.fillStyle = '#2b2117'; g.textAlign = 'center'; var narrow = (X(p[2]) - x0) < 90; g.font = '700 ' + (narrow ? 14 : 17) + 'px "Malgun Gothic", sans-serif'; var cx = (x0 + X(p[2])) / 2; g.fillText(p[0], cx, T + 30); g.font = (narrow ? 11 : 14) + 'px "Malgun Gothic", sans-serif'; g.fillText((p[1] < 0 ? 'BC ' + (-p[1]) : 'AD ' + p[1]) + '–' + (p[2] < 0 ? -p[2] : 'AD ' + p[2]), cx, T + 54); });
    for(var y = -2000; y <= 300; y += 500){ g.strokeStyle = '#d6cbb8'; g.beginPath(); g.moveTo(X(y), T + 70); g.lineTo(X(y), T + 90); g.stroke(); g.fillStyle = '#5a4a3a'; g.font = '14px "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.fillText(y < 0 ? 'BC ' + (-y) : 'AD ' + y, X(y), T + 108); }
    ev.forEach(function(e, i){ var x = X(e[0]), lane = i % 6, y0 = T + 130 + lane * 62; g.strokeStyle = '#8a7060'; g.beginPath(); g.moveTo(x, T + 70); g.lineTo(x, y0); g.stroke(); g.beginPath(); g.arc(x, y0, 5, 0, 7); g.fillStyle = '#c0392b'; g.fill(); g.font = '600 16px "Malgun Gothic", sans-serif'; g.fillStyle = '#2b2117'; g.textAlign = 'center'; g.fillText(e[1], x, y0 + 24); g.font = '13px "Malgun Gothic", sans-serif'; g.fillStyle = '#7b6a58'; g.fillText(e[0] < 0 ? 'BC ' + (-e[0]) : 'AD ' + e[0], x, y0 + 42); });
    g.font = '15px "Malgun Gothic", sans-serif'; g.fillStyle = '#7b6a58'; g.textAlign = 'right'; g.fillText('2026 설교자의 성경', W - R, H - 14);
  };
  /* 농사 달력 (원형) */
  DRAW['calendar:agri'] = function(c){
    var g = c.getContext('2d'), W = c.width, H = c.height; g.fillStyle = '#fffdf8'; g.fillRect(0, 0, W, H);
    var cx = W * .36, cy = H / 2 + 20, R0 = 150, R1 = 300, R2 = 380;
    var months = ['티쉬리 (9-10월)', '헤쉬반 (10-11월)', '키슬레브 (11-12월)', '테벳 (12-1월)', '쉐밧 (1-2월)', '아달 (2-3월)', '니산 (3-4월)', '이야르 (4-5월)', '시반 (5-6월)', '탐무즈 (6-7월)', '압 (7-8월)', '엘룰 (8-9월)'];
    var work = ['올리브 수확', '올리브 수확·파종', '파종 (밀·보리)', '파종·늦은 파종', '아마 수확·가지치기', '가지치기·꼴 베기', '보리 수확', '밀 수확', '밀 수확·타작', '포도 손질', '포도 수확', '포도·무화과·여름 열매'];
    var rain = [0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];   /* 우기 */
    var feasts = { 0:'나팔절·속죄일·초막절', 6:'유월절·무교절', 8:'칠칠절(오순절)' };
    g.font = '700 28px "Malgun Gothic", sans-serif'; g.fillStyle = '#2b2117'; g.textAlign = 'left'; g.fillText('농사 달력 — 비와 수확, 그리고 절기', 40, 48);
    months.forEach(function(mn, i){
      var a0 = -Math.PI / 2 + i * Math.PI / 6, a1 = a0 + Math.PI / 6;
      g.beginPath(); g.arc(cx, cy, R1, a0, a1); g.arc(cx, cy, R0, a1, a0, true); g.closePath(); g.fillStyle = rain[i] ? 'rgba(74,143,214,.35)' : 'rgba(230,180,80,.35)'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      var am = (a0 + a1) / 2, rx = cx + Math.cos(am) * (R0 + R1) / 2, ry = cy + Math.sin(am) * (R0 + R1) / 2;
      g.fillStyle = '#2b2117'; g.textAlign = 'center'; g.font = '600 16px "Malgun Gothic", sans-serif'; work[i].split('·').forEach(function(t, k){ g.fillText(t, rx, ry - 8 + k * 20); });
      var lx = cx + Math.cos(am) * (R1 + 45), ly = cy + Math.sin(am) * (R1 + 45); g.font = '15px "Malgun Gothic", sans-serif'; g.fillStyle = '#5a4a3a'; g.fillText(mn, lx, ly + 5);
      if(feasts[i]){ g.beginPath(); g.arc(cx, cy, R2, a0 + .02, a1 - .02); g.strokeStyle = '#c0392b'; g.lineWidth = 8; g.stroke(); var fx = cx + Math.cos(am) * (R2 + 34), fy = cy + Math.sin(am) * (R2 + 34); g.font = '700 15px "Malgun Gothic", sans-serif'; g.fillStyle = '#c0392b'; g.fillText(feasts[i], fx, fy + 5); }
    });
    g.beginPath(); g.arc(cx, cy, R0 - 6, 0, 7); g.fillStyle = '#f3ead8'; g.fill();
    g.fillStyle = '#2b2117'; g.textAlign = 'center'; g.font = '700 20px "Malgun Gothic", sans-serif'; g.fillText('이른 비 10-11월', cx, cy - 30); g.fillText('늦은 비 3-4월', cx, cy); g.font = '16px "Malgun Gothic", sans-serif'; g.fillText('건기 5-9월: 이슬', cx, cy + 32);
    /* 오른쪽 설명 */
    var tx = W * .68, ty = 130; g.textAlign = 'left'; g.font = '700 20px "Malgun Gothic", sans-serif'; g.fillStyle = '#2b2117'; g.fillText('게셀 달력(BC 10세기 석회암 판)의 농사 순서', tx, ty);
    ['두 달: 거두기(올리브)', '두 달: 씨 뿌리기', '두 달: 늦은 씨 뿌리기', '한 달: 아마 베기', '한 달: 보리 거두기', '한 달: 거두고 되질하기', '두 달: 포도 손질', '한 달: 여름 열매'].forEach(function(t, i){ g.font = '17px "Malgun Gothic", sans-serif'; g.fillStyle = '#3a2a1a'; g.fillText('• ' + t, tx, ty + 36 + i * 30); });
    g.font = '16px "Malgun Gothic", sans-serif'; g.fillStyle = '#5a4a3a'; ['파랑 띠 = 우기(이른 비~늦은 비)', '주황 띠 = 건기(비가 전혀 없음)', '붉은 테 = 세 순례 절기'].forEach(function(t, i){ g.fillText(t, tx, ty + 300 + i * 28); });
    g.font = '15px "Malgun Gothic", sans-serif'; g.fillStyle = '#7b6a58'; g.textAlign = 'right'; g.fillText('2026 설교자의 성경', W - 40, H - 14);
  };
  function drawFig(c, ref){ var f = DRAW[ref]; if(f) try{ base3d = !!c._3d; f(c); }catch(e){ console.error(e); } finally{ base3d = false; } }

  /* ── 초기화 ── */
  function init(){
    var m = $('studyModal'); if(!m) return;
    $('stClose').onclick = close;
    $('stBack').onclick = back;
    $('stVpopX').onclick = closeVpop;
    document.addEventListener('mousedown', function(e){ var pop = $('stVpop'); if(!pop.hidden && !pop.contains(e.target) && !e.target.closest('.st-ref')) closeVpop(); });
    document.addEventListener('keydown', function(e){
      if(m.hidden) return;
      if(e.key === 'Escape' && !$('stVpop').hidden){ e.stopPropagation(); closeVpop(); return; }
      if(e.key === 'BrowserBack' || (e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.metaKey)){
        var t = e.target, tag = t && t.tagName; if(tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable)) return;
        if(window.ATLAS && ATLAS.isOpen()) return;
        e.preventDefault(); e.stopPropagation(); back();
      }
    }, true);
    document.addEventListener('mouseup', function(e){ if(e.button === 3 && !m.hidden && !(window.ATLAS && ATLAS.isOpen())){ e.preventDefault(); back(); } }, true);
    var down = false;
    m.addEventListener('mousedown', function(e){ down = (e.target === m); });
    m.addEventListener('click', function(e){ if(down && e.target === m) close(); down = false; });
    var lb = $('stLight'); var d2 = false;
    lb.addEventListener('mousedown', function(e){ d2 = (e.target === lb); });
    lb.addEventListener('click', function(e){ if(d2 && e.target === lb) closeLight(); d2 = false; });
    $('stLightX').onclick = closeLight;
    document.addEventListener('keydown', function(e){
      if(e.key !== 'Escape') return;
      if(!$('stLight').hidden){ e.stopPropagation(); closeLight(); return; }
      if(!m.hidden && (!window.ATLAS || !ATLAS.isOpen())){ e.stopPropagation(); close(); }
    }, true);
    /* Tab 가두기 */
    m.addEventListener('keydown', function(e){
      if(e.key !== 'Tab') return;
      var f = [].filter.call(m.querySelectorAll('button, input, [tabindex="0"], a[href]'), function(el){ return !el.hidden && el.offsetParent; });
      if(!f.length) return; var first = f[0], last = f[f.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    });
    $('stPrint').onclick = function(){ if(!cur) return; if(!window.PRINT){ APP.toast('이 창에서는 인쇄할 수 없습니다'); return; } PRINT.html('<!doctype html><meta charset="utf-8"><title>' + esc(cur.title) + '</title><style>body{font-family:"Malgun Gothic",sans-serif;max-width:820px;margin:30px auto;line-height:1.8;color:#222}h1{font-size:26px}h2{font-size:19px;margin-top:28px}figure{margin:14px 0}img,canvas{max-width:100%}figcaption{font-size:13px;color:#666}table{border-collapse:collapse;font-size:14px}td,th{border:1px solid #ccc;padding:4px 8px}.st-nav,.st-toc,button{display:none}footer{margin-top:30px;font-size:13px;color:#555}</style>' + $('stBody').innerHTML).then(function(r){ if(!(r && r.ok)) APP.toast('인쇄 창을 열지 못했습니다'); }); };
  }
  return { init:init, open:open, close:close, back:back, list:list, byId:byId, draw:drawFig, forVerse:forVerse, related:related, isOpen:function(){ return !$('studyModal').hidden; } };
})();
STUDY.init();
