/* 원전 연구 — 화면 (renderer/exeg-engine.js 가 분석, 이 파일은 보여 주기)
   메뉴 '원전연구' 또는 본문 머리의 [원전 연구] 단추 → 데스크탑에서는 따로 뜨는 창(?pop=exeg), 웹판은 본문 위 팝업.
   왼쪽: 66권 → 장 → 단락 목차(data/exeg-index.js 의 한 줄 요약). 오른쪽: 단락마다
     ① 본문 흐름과 원어 석의(절마다 동사·어순·열쇠말·병행법) ② 히브리 문장구조(키아즘·교대·포괄·반복) ③ 구속사적 틀(하나님의 손길 + 인간의 응답, 그리스도) ④ 설교 개요
   방법: 이정렬, 『원전 중심 구속사 설교 — 성경 해석에서 설교 작성까지』(저자 동의). 규칙에 따른 자동 분석이므로 설교자의 석의로 검증한다. */
window.EXEG = (function(){
  var $ = APP.$, esc = APP.esc, BOOKS = APP.BOOKS;
  var eng = null, cache = {}, cur = { bi:-1, ci:0, vi:-1 }, helpOn = false;
  var BIB = window.BIBLE || {}, TXT = BIB.text || {};

  function heads(bi, ci){ var ch = ((TXT.sae || [])[bi] || [])[ci] || [], out = []; ch.forEach(function(t, vi){ var m = String(t).match(/^<([^>]*)>/); if(m) out.push([vi, m[1].replace(/\([^)]*\)/g, '').trim()]); }); return out; }
  function korOf(bi, ci, vi){ return APP.verseText ? APP.verseText(bi, ci, vi) : ''; }
  function dict(key){ var no = key.slice(1); if(key.charAt(0) === 'H'){ var d = APP.hebEntry(no); return d ? d[2] : ''; } var g = APP.grkEntry(no); return g ? (g[4] || g[3] || '') : ''; }
  function engine(){
    if(eng) return eng;
    var F = window.EXFREQ || { f:{}, t:{ H:306000, G:140000 } };
    eng = EXEGINE.create({ lex:window.EXLEX || {}, freq:F.f, total:F.t, kor:korOf, heads:heads, intro:function(bi){ return (window.INTRO || {})[BOOKS[bi].n] || null; }, bookName:function(bi){ return BOOKS[bi].n; }, dict:dict });
    return eng;
  }
  function analyze(bi, ci, cb){
    var k = bi + '-' + ci;
    if(cache[k]) return cb(cache[k]);
    STEPH.ensure(bi, function(ok){
      var B = ok && window.STEPHAN && STEPHAN[bi];
      if(!B){ cb(null); return; }
      var res = engine().analyze(bi, ci, B.w[ci] || []);
      cache[k] = res; cb(res);
    });
  }

  /* ───────── 머리(책·장 고르기) ───────── */
  function fillBooks(){
    var s = $('exBook'); if(!s || s.options.length) return;
    s.innerHTML = '<option value="-1">66권 목차</option>' + BOOKS.map(function(b, i){ return '<option value="' + i + '">' + esc(b.n) + '</option>'; }).join('');
  }
  function fillChaps(bi){
    var s = $('exChap'); if(!s) return;
    if(bi < 0){ s.innerHTML = ''; s.hidden = true; return; }
    s.hidden = false;
    var n = BOOKS[bi].c, h = '';
    for(var i = 0; i < n; i++) h += '<option value="' + i + '">' + (i + 1) + '장</option>';
    s.innerHTML = h; s.value = String(cur.ci);
  }

  /* ───────── 목차(왼쪽) ───────── */
  function flagsKo(f){ return (f || '').split('').map(function(c){ return ({ X:'교차', A:'교대', I:'포괄', L:'반복', P:'병행' })[c] || ''; }).filter(Boolean).join('·'); }
  function paintToc(){
    var el = $('exToc'); if(!el) return;
    var IDX = window.EXIDX || [];
    var h = '';
    if(cur.bi < 0){
      /* 66권 목차 */
      h += '<div class="ex-tochead">66권 목차 <span class="dim">책을 고르면 장과 단락이 나옵니다</span></div>';
      [['구약', 0, 39], ['신약', 39, 66]].forEach(function(g){
        h += '<div class="ex-tocsec">' + g[0] + '</div><div class="ex-books">';
        for(var i = g[1]; i < g[2]; i++){ var n = (IDX[i] || []).reduce(function(s, c){ return s + c.length; }, 0); h += '<button type="button" class="ex-bk' + (i >= 39 ? ' nt' : ' ot') + '" data-bi="' + i + '" title="' + esc(BOOKS[i].n) + ' — ' + BOOKS[i].c + '장 · 단락 ' + n + '개">' + esc(BOOKS[i].a) + '</button>'; }
        h += '</div>';
      });
    } else {
      var b = BOOKS[cur.bi];
      h += '<div class="ex-tochead"><button type="button" class="lnk" id="exTocAll">66권</button> › <b>' + esc(b.n) + '</b></div>';
      h += '<div class="ex-chaps">';
      for(var c = 0; c < b.c; c++) h += '<button type="button" class="ex-ch' + (c === cur.ci ? ' on' : '') + '" data-ci="' + c + '">' + (c + 1) + '</button>';
      h += '</div>';
      var list = (IDX[cur.bi] || [])[cur.ci] || [];
      h += '<div class="ex-tocsec">' + esc(b.n) + ' ' + (cur.ci + 1) + '장의 단락 ' + list.length + '개</div>';
      list.forEach(function(p, i){
        h += '<button type="button" class="ex-per" data-p="' + i + '"><div class="ex-perref">' + (cur.ci + 1) + ':' + (p.v0 + 1) + (p.v1 > p.v0 ? '-' + (p.v1 + 1) : '') + (p.h ? ' <span class="ex-perhead">' + esc(p.h) + '</span>' : '') + '</div>' +
             '<div class="ex-peridea">' + esc(p.i) + '</div><div class="ex-permeta">하나님의 손길 ' + p.g + ' · 인간의 응답 ' + p.m + (p.f ? ' · ' + flagsKo(p.f) : '') + '</div></button>';
      });
    }
    el.innerHTML = h;
    [].forEach.call(el.querySelectorAll('.ex-bk'), function(x){ x.onclick = function(){ go(+x.dataset.bi, 0, -1); }; });
    [].forEach.call(el.querySelectorAll('.ex-ch'), function(x){ x.onclick = function(){ go(cur.bi, +x.dataset.ci, -1); }; });
    [].forEach.call(el.querySelectorAll('.ex-per'), function(x){ x.onclick = function(){ var t = $('exP' + x.dataset.p); if(t) t.scrollIntoView({ block:'start', behavior:'smooth' }); }; });
    var all = $('exTocAll'); if(all) all.onclick = function(){ go(-1, 0, -1); };
  }

  /* ───────── 본문(오른쪽) ───────── */
  function wspan(bi, t, cls){ return '<span class="ex-w ' + (bi < 39 ? 'ex-heb' : 'ex-grk') + (cls ? ' ' + cls : '') + '"' + (bi < 39 ? ' dir="rtl"' : '') + '>' + esc(t) + '</span>'; }
  function agentTag(a){ return ({ G:'<span class="ex-ag g">하나님의 손길</span>', M:'<span class="ex-ag m">인간의 응답</span>', A:'<span class="ex-ag a">글쓴이</span>', O:'<span class="ex-ag o">—</span>' })[a] || ''; }
  function vref(ci, vi){ return '<button type="button" class="ex-vref" data-vi="' + vi + '" title="본문 창을 이 절로">' + (ci + 1) + ':' + (vi + 1) + '</button>'; }
  function korSnip(bi, ci, vi, n){ var t = korOf(bi, ci, vi) || ''; return t.length > n ? t.slice(0, n) + '…' : t; }
  function wordAttr(bi, ci, vi, i){ return ' data-b="' + bi + '" data-c="' + ci + '" data-v="' + vi + '" data-i="' + i + '"'; }

  function paintHelp(){
    return '<div class="ex-help card"><h2>오르(אוֹר) 엔진은 이렇게 분석합니다</h2>' +
      '<p>‘오르’는 히브리어로 빛(창 1:3 “빛이 있으라”)입니다. 이정렬 목사의 『원전 중심 구속사 설교 — 성경 해석에서 설교 작성까지』(2023, 저자 동의)의 방법을 스테판 원어 성경의 낱말 자료(스트롱 번호·원형·문법 분해·뜻)에 적용한 규칙 기반 분석 엔진으로, 66권 전체를 장·절·단락마다 같은 네 단계로 다룹니다.</p>' +
      '<ol><li><b>형태소 해석</b> — 동사마다 어간(칼·닢알·피엘·푸알·히프일·호프알·히트파엘)과 시상(완료·미완료·와우 연속법·명령·부정사·분사), 헬라어는 시제·태·법을 풀고 그 뉘앙스를 적습니다.</li>' +
      '<li><b>구문·문장구조</b> — 히브리어의 기본 어순(술어-주어-목적-부사)에서 벗어나 술어 앞으로 나온 말은 도치(강조)로 표시합니다. 단락 안에서 바깥에서 안으로 같은 낱말이 되풀이되면 교차 병행(키아즘), 앞 반과 뒤 반이 같은 차례로 짝지으면 교대 병행, 처음과 끝이 같은 말이면 포괄, 세 번 넘게 되풀이되는 드문 말은 열쇠말로 봅니다. 시·지혜·예언 본문은 아트나흐(절 가운데 쉼)로 두 행을 나누어 동의·반의·종합 병행을 가늠합니다.</li>' +
      '<li><b>구속사적 틀</b> — "구속사 = 하나님의 손길(activity of God) + 인간의 응답(response of man)". 동사의 주어가 하나님(여호와·엘로힘·주·예수·그리스도…)인지 사람인지, 말하는 이가 누구인지(하나님의 말씀 안의 1인칭, 기도 안의 2인칭), 행위자 없는 수동태(신적 수동태)인지로 가릅니다.</li>' +
      '<li><b>설교 개요</b> — 중심사상은 주제(무엇에 관해 말하는가) + 보어(그것에 대해 무엇을 말하는가)로 세우고(해돈 로빈슨), 설교 목적·서론·본론(하나님의 손길 / 인간의 응답 / 그리스도 안에서)·결론(오늘의 결단)을 초안으로 내놓습니다.</li></ol>' +
      '<p class="hint">자동 분석은 설교의 출발점일 뿐입니다. 주어·화자 판단과 구조 후보는 설교자가 본문과 문맥으로 반드시 검증하십시오. 낱말을 누르면 낱말 창(사전·용례·메모)이 열립니다.</p></div>';
  }

  function paintVerse(bi, ci, v){
    var h = '<div class="ex-verse" id="exV' + v.vi + '">';
    h += '<div class="ex-vhead">' + vref(ci, v.vi) + ' <span class="ex-kor">' + esc(v.kor) + '</span></div>';
    if(v.verbs.length){
      h += '<table class="ex-vt"><tbody>';
      v.verbs.forEach(function(r){
        h += '<tr><td class="ex-td-w"><button type="button" class="ex-wbtn"' + wordAttr(bi, ci, v.vi, r.i) + '>' + wspan(bi, r.text) + '</button></td>' +
             '<td class="ex-td-g"><b>' + esc(r.gloss) + '</b>' + (r.lexName ? '<div class="ex-lex">' + esc(r.lexName) + (r.cat ? ' <span class="ex-cat">' + esc(EXEGINE.CAT_KO[r.cat] || r.cat) + '</span>' : '') + '</div>' : '') + '</td>' +
             '<td class="ex-td-m">' + esc(r.morph) + '<div class="ex-nu">' + esc(r.nuance) + '</div></td>' +
             '<td class="ex-td-a">' + agentTag(r.agent) + '<div class="ex-why">' + esc(r.why) + '</div></td></tr>';
      });
      h += '</tbody></table>';
    } else h += '<div class="dim ex-novb">동사가 없는 절(명사문·이름 목록)</div>';
    v.order.forEach(function(o){ h += '<div class="ex-note order">어순 · ' + esc(o.desc) + (o.neg ? ' <span class="ex-neg">부정어와 함께 — 단호한 거절·금지</span>' : '') + '</div>'; });
    v.notes.forEach(function(n){ h += '<div class="ex-note">' + wspan(bi, n.text) + ' — ' + esc(n.desc) + '</div>'; });
    if(v.par) h += '<div class="ex-par"><b>' + esc(v.par.type) + '</b> <span class="dim">' + esc(v.par.desc) + '</span><div class="ex-parrow">' + wspan(bi, v.par.a) + '</div><div class="ex-parrow">' + wspan(bi, v.par.b) + '</div>' + (v.par.shared.length ? '<div class="dim">같은 낱말: ' + wspan(bi, v.par.shared.join(' · ')) + '</div>' : '') + '</div>';
    if(v.inner) h += '<div class="ex-note">절 안의 교차 배열(A B B′ A′): ' + wspan(bi, v.inner.text) + '</div>';
    if(v.keys.length){
      var seen = {};
      h += '<div class="ex-keys">열쇠말 ' + v.keys.filter(function(k){ if(seen[k.key]) return false; seen[k.key] = 1; return true; }).map(function(k){
        return '<button type="button" class="ex-key" ' + wordAttr(bi, ci, v.vi, k.i) + ' title="' + esc((k.note || '') + (k.christ ? '\n→ ' + k.christ : '')) + '">' + wspan(bi, k.text) + ' <span class="ex-keyn">' + esc(k.lexName.split(' ')[0]) + '</span> <span class="dim">' + esc(k.gloss) + '</span>' + (k.christ ? ' <span class="ex-x">✝</span>' : '') + '</button>';
      }).join(' ') + '</div>';
    }
    h += '</div>';
    return h;
  }
  function paintStructure(bi, ci, p){
    var s = p.structure, h = '', any = false;
    function row(label, vi, shared, center){ return '<tr class="' + (center ? 'center' : '') + '"><td class="ex-sl">' + esc(label) + '</td><td class="ex-sv">' + vref(ci, vi) + '</td><td class="ex-sk">' + esc(korSnip(bi, ci, vi, 34)) + '</td><td class="ex-ss">' + (shared.length ? wspan(bi, shared.map(function(x){ return x.lemma; }).join(' · ')) : (center ? '<span class="dim">중심</span>' : '')) + '</td></tr>'; }
    if(s.chiasm){ any = true; h += '<div class="ex-st"><div class="ex-sthead">교차 병행(키아즘) 후보 <span class="dim">' + esc(s.chiasm.desc) + '</span></div><table class="ex-stt"><tbody>' + s.chiasm.rows.map(function(r){ return row(r.label, r.vi, r.shared, r.center); }).join('') + '</tbody></table></div>'; }
    if(s.alt){ any = true; h += '<div class="ex-st"><div class="ex-sthead">교대 병행(순차 구조) 후보 <span class="dim">' + esc(s.alt.desc) + '</span></div><table class="ex-stt"><tbody>' + s.alt.rows.map(function(r){ return row(r.label, r.vi, r.shared) + row(r.label + '′', r.vi2, r.shared); }).join('') + '</tbody></table></div>'; }
    if(s.inclusio){ any = true; h += '<div class="ex-st"><div class="ex-sthead">포괄(인클루지오)</div><div>' + vref(ci, s.inclusio.vi0) + ' ↔ ' + vref(ci, s.inclusio.vi1) + ' 같은 낱말 ' + wspan(bi, s.inclusio.shared.map(function(x){ return x.lemma; }).join(' · ')) + ' — 처음과 끝이 같은 말로 묶여 한 단락임을 보인다</div></div>'; }
    if(s.leit.length){ any = true; h += '<div class="ex-st"><div class="ex-sthead">되풀이되는 열쇠말(라이트보르트)</div><div class="ex-leit">' + s.leit.map(function(l){ return '<span class="ex-leitw">' + wspan(bi, l.lemma) + ' <b>×' + l.n + '</b> <span class="dim">' + l.verses.map(function(v){ return v + 1; }).join(', ') + '절</span></span>'; }).join('') + '</div></div>'; }
    if(s.par.length){ any = true; var cnt = {}; s.par.forEach(function(x){ cnt[x.par.type] = (cnt[x.par.type] || 0) + 1; }); h += '<div class="ex-st"><div class="ex-sthead">시의 병행법</div><div class="dim">' + Object.keys(cnt).map(function(k){ return k + ' ' + cnt[k] + '절'; }).join(' · ') + ' — 절마다 위 석의에 표시</div></div>'; }
    if(s.inner.length){ any = true; h += '<div class="ex-st"><div class="ex-sthead">절 안의 교차 배열</div>' + s.inner.map(function(x){ return '<div>' + vref(ci, x.vi) + ' ' + wspan(bi, x.inner.text) + '</div>'; }).join('') + '</div>'; }
    if(!any) h += '<div class="dim">낱말의 되풀이로 잡히는 구조가 없습니다 — 뜻의 흐름(사건·대화의 짝)으로 구조를 세워 보십시오.</div>';
    return h;
  }
  function paintFrame(bi, ci, p){
    var f = p.frame, h = '';
    function list(items, cls){ if(!items.length) return '<div class="dim">—</div>'; return '<ul class="ex-fl ' + cls + '">' + items.filter(function(x){ return !x.speech; }).concat(items.filter(function(x){ return x.speech; })).map(function(x){ return '<li>' + vref(ci, x.vi) + ' ' + wspan(bi, x.text) + ' <b>' + esc(x.gloss) + '</b> <span class="dim">' + esc(x.morph) + (x.divPass ? ' · 신적 수동태' : '') + (x.imper ? ' · 명령' : '') + '</span><div class="ex-why">' + esc(x.why) + '</div></li>'; }).join('') + '</ul>'; }
    h += '<div class="ex-frame"><div class="ex-fcol"><div class="ex-fhead g">하나님의 손길 <span class="dim">' + f.god.length + '</span></div>' + list(f.god, 'g') + '</div>' +
         '<div class="ex-fcol"><div class="ex-fhead m">인간의 응답 <span class="dim">' + f.man.length + '</span></div>' + list(f.man, 'm') + '</div></div>';
    if(f.other.length) h += '<details class="ex-other"><summary>그 밖의 동사 ' + f.other.length + '개 (주어가 사물·불명, 글쓴이의 말)</summary>' + list(f.other, 'o') + '</details>';
    h += '<div class="ex-cats">' + f.cats.map(function(c){ return '<span class="ex-cat">' + esc(c.ko) + ' <b>' + c.n + '</b></span>'; }).join('') + '</div>';
    if(f.christ.length) h += '<div class="ex-christ"><div class="ex-sthead">그리스도와의 연결</div><ul>' + f.christ.map(function(c){ return '<li>' + vref(ci, c.vi) + ' ' + wspan(bi, c.text) + ' <b>' + esc(c.name) + '</b> → ' + esc(c.christ) + '</li>'; }).join('') + '</ul></div>';
    return h;
  }
  function paintSermon(p){
    var f = p.frame, h = '';
    h += '<div class="ex-idea"><div class="ex-ideak">중심사상</div><div class="ex-ideav">' + esc(f.idea) + '</div>' +
         '<div class="ex-ideak">주제 + 보어</div><div class="ex-ideav dim">주제: ' + esc(f.subject) + '<br>보어: ' + esc(f.complement) + '</div>' +
         '<div class="ex-ideak">풀어 쓰면</div><div class="ex-ideav">' + esc(f.idea2) + '</div>' +
         '<div class="ex-ideak">설교 목적</div><div class="ex-ideav">' + esc(f.purpose) + '</div></div>';
    h += f.outline.map(function(o){ return '<div class="ex-ol"><div class="ex-olh">' + esc(o.h) + '</div><ul>' + o.items.map(function(i){ return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></div>'; }).join('');
    return h;
  }
  function paintMain(res){
    var el = $('exMain'); if(!el) return;
    var bi = res.bi, ci = res.ci, b = BOOKS[bi];
    var h = '<div class="ex-title"><h2>' + esc(b.n) + ' ' + (ci + 1) + '장 <span class="ex-genre">' + esc(res.genreKo) + '</span></h2><div class="dim">단락 ' + res.pericopes.length + '개 · 절 ' + res.nVerses + ' · 오르(אוֹר) 엔진의 규칙 기반 자동 분석 — 설교자의 석의로 검증하십시오</div></div>';
    if(helpOn) h += paintHelp();
    res.pericopes.forEach(function(p, i){
      var f = p.frame;
      h += '<section class="ex-peri" id="exP' + i + '">';
      h += '<header class="ex-ph"><h3>' + esc(f.ref) + (p.head ? ' <span class="ex-perhead">「' + esc(p.head) + '」</span>' : '') + '</h3><div class="ex-idea1">' + esc(f.idea) + '</div></header>';
      h += '<h4 class="ex-h4">① 본문 흐름과 원어 석의</h4>' + p.verses.map(function(v){ return paintVerse(bi, ci, v); }).join('');
      h += '<h4 class="ex-h4">② 히브리 문장구조 — 교차·교대 병행, 포괄, 열쇠말</h4>' + paintStructure(bi, ci, p);
      h += '<h4 class="ex-h4">③ 구속사적 틀 — 하나님의 손길 + 인간의 응답</h4>' + paintFrame(bi, ci, p);
      h += '<h4 class="ex-h4">④ 설교 개요(초안)</h4>' + paintSermon(p);
      h += '</section>';
    });
    h += '<div class="ex-foot">분석: 오르(אוֹר) 원전 분석 엔진 ' + esc(EXEGINE.VERSION) + ' · 방법: 이정렬, 『원전 중심 구속사 설교 — 성경 해석에서 설교 작성까지』(2023). 자료: 스테판 원어 성경(원어성서원). 자동 분석의 주어·화자·구조 판단에는 오류가 있을 수 있습니다.</div>';
    el.innerHTML = h;
    [].forEach.call(el.querySelectorAll('.ex-vref'), function(x){ x.onclick = function(){ APP.openChapter(bi, ci, +x.dataset.vi); }; });
    [].forEach.call(el.querySelectorAll('.ex-wbtn, .ex-key'), function(x){ x.onclick = function(e){ e.stopPropagation(); openWord(+x.dataset.b, +x.dataset.c, +x.dataset.v, +x.dataset.i); }; });
    if(cur.vi >= 0){ var t = $('exV' + cur.vi); if(t){ t.scrollIntoView({ block:'start' }); t.classList.add('hit'); } }
    else el.scrollTop = 0;
  }
  function openWord(bi, ci, vi, i){
    var w = STEPHAN[bi] && STEPHAN[bi].w[ci] && STEPHAN[bi].w[ci][vi] && STEPHAN[bi].w[ci][vi][i]; if(!w) return;
    var no = String(w[0] || '').replace(/[^\d]/g, ''), ref = APP.ref(bi, ci, vi), info;
    if(bi >= 39) info = { kind:'grk', word:(w[2] || '').replace(/</g, ''), lemma:w[1], no:no, entry:APP.grkEntry(no), morph:STEPH.explain(bi, w[4]) + (w[5] ? ' — ' + w[5] : ''), raw:w[4], ref:ref };
    else { var d = APP.hebEntry(no); info = { kind:'heb', word:w[2], entries:[{ no:no, translit:d ? d[0] : '', pron:d ? d[1] : '', mean:d ? d[2] : '' }], morph:STEPH.explain(bi, w[4]) + ' (' + w[4] + ')' + (w[5] ? ' — ' + w[5] : ''), ref:ref }; }
    APP.openWord(info);
  }

  /* ───────── 글로 내보내기 — 엔진의 toText 를 쓴다 ───────── */
  function asText(res){ return engine().toText(res); }
  function copyAll(){ if(cur.bi < 0 || !cache[cur.bi + '-' + cur.ci]) return APP.toast('먼저 장을 고르세요'); APP.copyText(asText(cache[cur.bi + '-' + cur.ci])); APP.toast('원전 연구를 복사했습니다'); }
  function saveNote(){
    if(cur.bi < 0 || !cache[cur.bi + '-' + cur.ci]) return APP.toast('먼저 장을 고르세요');
    if(!window.NOTES) return APP.toast('이 창에서는 메모장을 쓸 수 없습니다');
    var res = cache[cur.bi + '-' + cur.ci], title = '원전 연구 — ' + BOOKS[cur.bi].n + ' ' + (cur.ci + 1) + '장';
    NOTES.save({ id:0, ref:BOOKS[cur.bi].a + ' ' + (cur.ci + 1), title:title, theme:'원전 연구', tags:'#원전연구 #' + BOOKS[cur.bi].n, content:asText(res) }).then(function(){ APP.toast('메모장에 저장했습니다 — ' + title); if(window.POP) try{ POP.notify('notes'); }catch(e){} }, function(){ APP.toast('메모를 저장하지 못했습니다'); });
  }

  /* ───────── 열기 ───────── */
  function go(bi, ci, vi){
    cur.bi = bi; cur.ci = Math.max(0, ci || 0); cur.vi = (vi === undefined || vi === null) ? -1 : vi;
    fillBooks(); $('exBook').value = String(bi); fillChaps(bi);
    paintToc();
    var el = $('exMain');
    if(bi < 0){ el.innerHTML = '<div class="ex-title"><h2>원전 연구 — 66권 목차 <span class="ex-genre">오르 엔진</span></h2><div class="dim">왼쪽에서 책을 고르면 장마다 단락별 석의·구조·구속사적 틀·설교 개요가 나옵니다.</div></div>' + paintHelp(); return; }
    el.innerHTML = '<div class="empty">' + esc(BOOKS[bi].n) + ' ' + (cur.ci + 1) + '장을 분석하는 중…</div>';
    analyze(bi, cur.ci, function(res){ if(cur.bi !== bi || cur.ci !== ci) return; if(!res){ el.innerHTML = '<div class="empty">이 장의 스테판 원어 자료를 읽지 못했습니다.</div>'; return; } paintMain(res); });
    if(window.POP && POP.isPop) try{ document.title = '원전 연구 — ' + BOOKS[bi].n + ' ' + (cur.ci + 1) + '장'; POP.setTitle(document.title); }catch(e){}
  }
  function show(a){
    a = a || {};
    helpOn = String(a.help) === '1';
    var bi = (a.bi === undefined || a.bi === '' || a.bi === null) ? (APP.st.bi >= 0 ? APP.st.bi : -1) : +a.bi;
    var ci = (a.ci === undefined || a.ci === '') ? (APP.st.ci || 0) : +a.ci, vi = (a.vi === undefined || a.vi === '' || a.vi === null) ? -1 : +a.vi;
    if(a.index) bi = -1;
    go(bi, ci, vi);
  }
  function init(){
    if(!$('exBook')) return;
    fillBooks();
    $('exBook').onchange = function(){ go(+$('exBook').value, 0, -1); };
    $('exChap').onchange = function(){ go(cur.bi, +$('exChap').value, -1); };
    $('exPrev').onclick = function(){ if(cur.bi < 0) return; if(cur.ci > 0) go(cur.bi, cur.ci - 1, -1); else if(cur.bi > 0) go(cur.bi - 1, BOOKS[cur.bi - 1].c - 1, -1); };
    $('exNext').onclick = function(){ if(cur.bi < 0) return; if(cur.ci < BOOKS[cur.bi].c - 1) go(cur.bi, cur.ci + 1, -1); else if(cur.bi < 65) go(cur.bi + 1, 0, -1); };
    $('exGo').onclick = function(){ if(cur.bi < 0) return; APP.openChapter(cur.bi, cur.ci, cur.vi >= 0 ? cur.vi : undefined); };
    $('exCopy').onclick = copyAll;
    $('exNote').onclick = saveNote;
    $('exHelp').onclick = function(){ helpOn = !helpOn; if(cur.bi < 0) go(-1, 0, -1); else if(cache[cur.bi + '-' + cur.ci]) paintMain(cache[cur.bi + '-' + cur.ci]); };
    var hb = $('exegBtn'); if(hb) hb.onclick = function(){ if(APP.st.bi < 0) return APP.toast('먼저 책을 고르세요'); if(APP.openExeg) APP.openExeg(APP.st.bi, APP.st.ci, APP.st.vi >= 0 ? APP.st.vi : -1); };
  }
  init();
  return { show:show, go:go, analyze:analyze, asText:asText };
})();
