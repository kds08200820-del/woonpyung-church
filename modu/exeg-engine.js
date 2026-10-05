/* 오르(אוֹר) — 원전 연구 엔진. 스테판 원어 성경(data/stephan/b<책>.js)의 낱말 자료를 네 단계로 분석한다.
   이름 '오르'는 히브리어 אוֹר(빛, 창 1:3)에서 — 원문에 빛을 비추어 하나님의 손길을 드러낸다는 뜻.
   이정렬, 『원전 중심 구속사 설교 — 성경 해석에서 설교 작성까지』(2023)의 방법을 따른다(저자 동의).
     ① 형태소 해석   : 어간(칼·닢알·피엘·푸알·히프일·호프알·히트파엘)·시상(완료·미완료·와우 연속법·명령·부정사·분사), 헬라어 시제·태·법
     ② 구문·문장구조 : 어순(술어-주어-목적 기본 어순에서 벗어난 도치 = 강조), 와우 연속법의 서술 줄기, 부정어, 키아즘(교차·교대 병행)·포괄·반복 낱말·시의 병행법
     ③ 구속사적 틀   : "구속사 = 하나님의 손길(activity of God) + 인간의 응답(response of man)" — 동사의 주어·화자·태로 가른다
     ④ 설교 개요     : 중심사상(주제 + 보어, 해돈 로빈슨), 설교 목적, 서론·본론(대지)·결론과 오늘의 적용
   규칙에 따른 자동 분석이므로 설교자의 석의로 검증해야 한다. 브라우저(window.EXEGINE)와 Node(tools/build-exeg.js) 양쪽에서 쓴다. */
(function(root, factory){ if(typeof module === 'object' && module.exports) module.exports = factory(); else root.EXEGINE = factory(); })(this, function(){
  'use strict';

  /* ───────── 낱말 갈래표 ───────── */
  var DIV_H = { 3068:1, 3069:1, 430:1, 410:1, 433:1, 136:1, 7706:1, 3050:1, 5945:1 };                 /* 하나님의 이름 */
  var DIV_G = { 2316:1, 2962:1, 2424:1, 5547:1 };
  var DIV_AGENT_H = { 7307:'영', 4397:'사자', 1697:'말씀', 6310:'입', 3027:'손', 2220:'팔', 6440:'얼굴', 8034:'이름', 3519:'영광' };   /* 하나님의 ○○ (연계형) */
  var SPEECH_H = { 559:1, 1696:1, 5002:1, 6680:1, 6030:1, 7121:1, 1319:1, 5608:1, 7592:1 };          /* 말하다·명하다·대답하다·부르다 */
  var SPEECH_G = { 3004:1, 2036:1, 5346:1, 611:1, 2980:1, 2065:1, 2753:1, 3853:1, 2905:1 };
  var HUMAN_H = { 120:1, 376:1, 802:1, 582:1, 1121:1, 1323:1, 5971:1, 1471:1, 3478:1, 4428:1, 3548:1, 5030:1, 5650:1, 1:1, 517:1, 251:1, 269:1, 7462:1,
                  6662:1, 7563:1, 2450:1, 3684:1, 5288:1, 2205:1, 8269:1, 1368:1, 3816:1, 1004:1, 5712:1, 6951:1, 4397:0, 1419:0, 3063:1, 669:1,
                  1732:1, 85:1, 3290:1, 3327:1, 4872:1, 175:1, 3091:1, 8010:1, 1121:1, 6213:0, 3605:0, 5341:1, 5869:0, 2993:1, 1570:1 };
  var HUMAN_G = { 444:1, 435:1, 1135:1, 2992:1, 1484:1, 3793:1, 3101:1, 80:1, 5043:1, 3816:1, 1401:1, 4396:1, 652:1, 2409:1, 749:1, 935:1, 5330:1,
                  1122:1, 2453:1, 1672:1, 1577:1, 4103:1, 268:1, 5057:1, 4204:1, 5207:0, 3962:0, 3384:1, 3813:1, 4245:1, 3495:1, 1401:1, 4252:1,
                  3588:0, 846:0, 1473:1, 4771:1, 2249:1, 5210:1, 2257:1, 5216:1 };
  var NEG_H = { 3808:1, 408:1, 369:1, 1077:1 };
  var GOD_ONLY_H = { 1254:1, 5545:1 }, GOD_ONLY_G = {};                                               /* 창조하다·용서하다 — 성경에서 하나님만 주어가 되는 동사 */
  var NOT_DIVINE_PASS = { 1377:1, 3958:1, 3985:1, 4105:1, 2346:1, 1848:1, 2607:1, 3680:1, 1210:1, 5020:1, 4624:1, 2967:1, 3860:1, 615:1, 4815:1, 2210:1, 1839:1, 4531:1, 1294:1, 5195:1, 2559:1 };   /* 핍박·고난·시험·속임… 사람이 당하는 수동 */
  var ANTONYM_H = [[6662,7563],[2450,3684],[2416,4194],[216,2822],[2896,7451],[157,8130],[3117,3915],[2617,639],[8085,3985],[1288,7043],[7965,4421],[6666,7562],[2451,200],[6035,1343],[1419,6996],[7919,5528]];
  var ANTONYM_G = [[2222,2288],[5457,4655],[4102,570],[18,4190],[1343,93],[4151,4561],[1680,5401],[4982,622],[25,3404],[2127,2672]];

  /* ───────── 문법 풀이표 ───────── */
  var HSTEM = { Q:'칼', N:'닢알', P:'피엘', U:'푸알', H:'히프일', O:'호프알', T:'히트파엘' };
  var HSTEM_NUANCE = {
    Q:'기본 능동 — 단순한 행위·상태', N:'수동·재귀 — 행위를 받거나 스스로에게 행함', P:'강의(강조·반복·결과) — 행위를 집중적으로, 또는 결과를 만들어 냄',
    U:'피엘의 수동', H:'사역 능동 — "…하게 하다"', O:'히프일의 수동 — "…하게 됨"', T:'재귀·상호·반복 — "자기 자신에게/서로"' };
  var HTMA = { A:'완료', I:'미완료', M:'명령', NA:'부정사 절대형', NG:'부정사 연계형', PA:'능동 분사', PP:'수동 분사' };
  var HGEN = { M:'남성', F:'여성', C:'공성' }, HPER = { X:'1인칭', Y:'2인칭', Z:'3인칭' }, HNUM = { S:'단수', P:'복수', D:'쌍수' };
  var HTAIL = { V:'자발형', Vh:'자발 연장형', J:'단축형(지시·기원)', Ch:'청유 연장형' };
  var GMOOD = { I:'직설법', S:'가정법', O:'소원법', M:'명령법', N:'부정사', P:'분사', R:'명령분사' };
  var GTENSE = { P:'현재', I:'미완료', F:'미래', A:'부정과거', R:'완료', L:'과거완료' };
  var GVOICE = { A:'능동', M:'중간', P:'수동', E:'중·수동', D:'중간디포', O:'수동디포', N:'중·수디포' };
  var GCASE = { N:'주격', G:'소유격', D:'여격', A:'목적격', V:'호격' }, GGEN = { M:'남성', F:'여성', N:'중성' }, GNUM = { S:'단수', P:'복수' };
  var GTENSE_NUANCE = {
    P:'현재 — 진행·반복·습관(계속되는 행위)', I:'미완료 — 과거에 계속·반복·시도된 행위', F:'미래 — 약속·확정, 때로 명령의 힘',
    A:'부정과거(아오리스트) — 사건 전체를 한 점으로 요약(단회적·결정적)', R:'완료 — 끝난 행위의 결과가 지금까지 이어지는 상태', L:'과거완료 — 과거 어느 시점에 이미 이루어져 있던 결과' };
  var GMOOD_NUANCE = {
    I:'사실의 진술', S:'목적(ἵνα)·조건(ἐάν)·권고("…하자")·금지', O:'기원·바람', M:'명령(현재 명령 = 계속·습관적으로, 부정과거 명령 = 단회·즉시)',
    N:'목적·결과·보어', P:'부대 상황(때·원인·수단·조건) 또는 관사와 함께 명사화("…하는 자")', R:'명령의 힘을 가진 분사' };
  var GVOICE_NUANCE = { A:'주어가 행함', M:'주어 자신이 관여·자기를 위해 행함', P:'행위를 받음', E:'행위를 받거나 스스로 함', D:'형태는 중간이나 뜻은 능동', O:'형태는 수동이나 뜻은 능동', N:'형태는 중·수동이나 뜻은 능동' };

  var CAT_KO = { god:'하나님', redeem:'구속·속죄', save:'구원·건지심', grace:'은혜·긍휼·용서', covenant:'언약·약속·복', holy:'거룩·임재', judge:'심판·공의',
                 sin:'죄', faith:'믿음·신뢰', repent:'회개·돌이킴', obey:'순종·지킴·섬김', worship:'예배·찬양·기도', love:'사랑·경외', word:'말씀·계명',
                 spirit:'성령·임재', life:'생명·부활', kingdom:'나라·통치', type:'그리스도 예표', people:'언약 백성·구속사' };
  var GOD_CATS = { redeem:1, save:1, grace:1, covenant:1, holy:1, judge:1, life:1, kingdom:1, god:1, spirit:1, word:1 };
  var MAN_CATS = { faith:1, repent:1, obey:1, worship:1, love:1, sin:1 };

  /* 책의 갈래(장르) — 설교 적용의 틀 */
  var GENRE = [];
  (function(){ for(var i = 0; i < 66; i++){ var g = 'narrative'; if(i === 2 || i === 4) g = 'law'; else if(i >= 17 && i <= 21) g = (i === 18 || i === 21 || i === 17) ? 'poetry' : 'wisdom'; else if(i >= 22 && i <= 38) g = (i === 24) ? 'poetry' : (i === 26 ? 'apocalyptic' : (i === 31 ? 'narrative' : 'prophecy')); else if(i >= 39 && i <= 43) g = 'gospel'; else if(i >= 44 && i <= 64) g = 'epistle'; else if(i === 65) g = 'apocalyptic'; GENRE.push(g); } })();
  var GENRE_KO = { narrative:'이야기(서사)', law:'율법·설교(토라)', poetry:'시', wisdom:'지혜', prophecy:'예언', gospel:'복음서', epistle:'서신', apocalyptic:'묵시' };

  /* ───────── 형태소 해석 ───────── */
  function parseHeb(code){
    var raw = String(code || ''), alt = raw.split('/')[0].trim();
    var t = { pre:{}, pos:'', v:null, n:null, a:null, suf:null, tail:'', raw:raw, ok:false };
    alt.split(/[.\s]+/).forEach(function(p){
      if(!p) return;
      var m, tail = (p.match(/\(([^)]+)\)$/) || [])[1];
      if(tail){ t.tail = tail; p = p.replace(/\([^)]*\)$/, ''); }
      if(p === 'C'){ t.pre.C = 1; return; }
      if(p === 'CW'){ t.pre.CW = 1; t.pre.C = 1; return; }
      if(p === 'P'){ t.pre.P = 1; return; }
      if(p === 'D'){ t.pre.D = 1; return; }
      if(p === 'O'){ t.pre.O = 1; return; }
      if(p === 'R'){ t.pre.R = 1; return; }
      if(p === 'Q'){ t.pre.Q = 1; return; }
      if(p === 'J'){ t.pre.J = 1; return; }
      if(p === 'T'){ t.pre.T = 1; return; }
      if(p === 'H'){ t.pre.H = 1; return; }
      if(p === 'ABN' || p === 'ABNG'){ t.pre.NEG = 1; if(!t.pos) t.pos = 'AB'; t.ok = true; return; }
      if(p === 'AB' || p === 'ABT'){ if(!t.pos) t.pos = 'AB'; t.ok = true; return; }
      if(!t.v && (m = p.match(/^V([A-Za-z])(NA|NG|PA|PP|A|I|M)([MFC]?)([XYZ]?)([SPD]?)(G?)$/))){ t.pos = 'V'; t.v = { stem:m[1], tma:m[2], gen:m[3], per:m[4], num:m[5], cons:!!m[6] }; t.ok = true; return; }
      if(!t.n && t.pos !== 'V' && (m = p.match(/^N(Ge|E|P|S)?([MFC]?)([XYZ]?)([SPD]?)(G?)$/))){ t.pos = m[1] === 'P' ? 'NP' : (m[1] === 'E' ? 'NE' : 'N'); t.n = { kind:m[1] || '', gen:m[2], per:m[3], num:m[4], cons:!!m[5] }; t.ok = true; return; }
      if(!t.a && !t.pos && (m = p.match(/^A(Ge|BN|BT|B|PT|PD|PR|PI|P|NC|NO|N|D)?([MFC]?)([SPD]?)(G?)$/))){ t.pos = 'A'; t.a = { kind:m[1] || '', gen:m[2], num:m[3], cons:!!m[4] }; t.ok = true; return; }
      if((m = p.match(/^([MFC])([XYZ])([SPD])$/))){ t.suf = { gen:m[1], per:m[2], num:m[3] }; return; }
    });
    return t;
  }
  function parseGrk(code){
    var raw = String(code || ''), alt = raw.replace(/\+/g, '').split(/[*&\/\\]/)[0].trim();
    var t = { pos:'', raw:raw, ok:false, pre:{} }, m;
    if((m = alt.match(/^V([ISOMNPR])([PIFARL])([AMPEDON])(.*)$/))){
      t.pos = 'V'; t.v = { mood:m[1], tense:m[2], voice:m[3] }; var r = m[4] || '';
      if(m[1] === 'P' || m[1] === 'R'){ t.v.cas = r[0] || ''; t.v.gen = r[1] || ''; t.v.num = r[2] || ''; t.v.per = r[3] || ''; }
      else { t.v.num = r[0] || ''; t.v.per = r[1] || ''; }
      t.ok = true;
    } else if((m = alt.match(/^NP([NGDAV])([MFN]?)([SP])([123])$/))){ t.pos = 'NP'; t.n = { cas:m[1], gen:m[2], num:m[3], per:m[4] }; t.ok = true; }
    else if((m = alt.match(/^N([NGDAV])([MFN])([SP])$/))){ t.pos = 'N'; t.n = { cas:m[1], gen:m[2], num:m[3] }; t.ok = true; }
    else if((m = alt.match(/^D([NGDAV])([MFN])([SP])$/))){ t.pos = 'D'; t.n = { cas:m[1], gen:m[2], num:m[3] }; t.ok = true; }
    else if(/^AD[A-Z]?$/.test(alt)){ t.pos = 'AB'; t.ok = true; }
    else if((m = alt.match(/^A(P[RDITCOM]?|C|O|M|S|D)?([NGDAV])([MFN])([SP])$/))){ t.pos = 'A'; t.a = { kind:m[1] || '', cas:m[2], gen:m[3], num:m[4] }; t.ok = true; }
    else if((m = alt.match(/^P([NGDA])$/))){ t.pos = 'P'; t.p = { cas:m[1] }; t.ok = true; }
    else if((m = alt.match(/^J([CSH])?$/))){ t.pos = 'J'; t.j = m[1] || ''; t.ok = true; }
    else if(/^Q/.test(alt)){ t.pos = 'Q'; t.ok = true; }
    else if(/^I/.test(alt)){ t.pos = 'I'; t.ok = true; }
    return t;
  }
  function explainHeb(t){
    var o = [];
    if(t.pre.CW) o.push('와우 연속법'); else if(t.pre.C) o.push('접속사');
    if(t.pre.P) o.push('전치사'); if(t.pre.D) o.push('관사'); if(t.pre.O) o.push('목적격 표시'); if(t.pre.R) o.push('관계사'); if(t.pre.T) o.push('의문사'); if(t.pre.NEG) o.push('부정어');
    if(t.v){ var v = t.v; o.push('동사 ' + (HSTEM[v.stem] || '희귀 어간(' + v.stem + ')') + ' ' + (HTMA[v.tma] || v.tma) + (v.per ? ' ' + HPER[v.per] : '') + (v.gen ? ' ' + HGEN[v.gen] : '') + (v.num ? ' ' + HNUM[v.num] : '') + (v.cons ? ' 연계형' : '')); }
    else if(t.n){ var n = t.n; o.push(({ P:'인칭대명사', E:'고유명사', Ge:'종족 명사', S:'실사' })[n.kind] || '명사'); if(n.per) o.push(HPER[n.per]); if(n.gen) o.push(HGEN[n.gen]); if(n.num) o.push(HNUM[n.num]); if(n.cons) o.push('연계형'); }
    else if(t.a){ var a = t.a; o.push(({ B:'부사', BN:'부정 부사', BT:'의문 부사', PT:'의문대명사', PD:'지시대명사', PR:'관계대명사', PI:'부정(不定)대명사', NC:'기수', NO:'서수', Ge:'종족 형용사', D:'지시사' })[a.kind] || '형용사'); if(a.gen) o.push(HGEN[a.gen]); if(a.num) o.push(HNUM[a.num]); }
    else if(t.pos === 'AB') o.push('부사');
    if(t.suf) o.push('+ 대명접미사 ' + HPER[t.suf.per] + (HGEN[t.suf.gen] ? ' ' + HGEN[t.suf.gen] : '') + ' ' + HNUM[t.suf.num]);
    if(t.tail) o.push('(' + (HTAIL[t.tail] || t.tail) + ')');
    return o.join(' ');
  }
  function explainGrk(t){
    var o = [];
    if(t.v){ var v = t.v; o.push('동사 ' + GMOOD[v.mood] + ' ' + GTENSE[v.tense] + ' ' + GVOICE[v.voice] + (v.mood === 'P' || v.mood === 'R' ? ' ' + (GCASE[v.cas] || '') + ' ' + (GGEN[v.gen] || '') + ' ' + (GNUM[v.num] || '') : ' ' + (GNUM[v.num] || '') + ' ' + (v.per ? v.per + '인칭' : ''))); }
    else if(t.n){ var n = t.n; o.push(t.pos === 'NP' ? '인칭대명사' : t.pos === 'D' ? '관사' : '명사'); o.push(GCASE[n.cas] || ''); if(n.gen) o.push(GGEN[n.gen]); o.push(GNUM[n.num] || ''); if(n.per) o.push(n.per + '인칭'); }
    else if(t.a){ var a = t.a; o.push(({ PR:'관계대명사', PD:'지시대명사', PI:'부정대명사', PT:'의문대명사', PC:'상관대명사', P:'형용대명사', C:'기수', O:'서수', M:'비교급', S:'최상급', D:'지시사' })[a.kind] || '형용사'); o.push(GCASE[a.cas] || ''); o.push(GGEN[a.gen] || ''); o.push(GNUM[a.num] || ''); }
    else if(t.pos === 'P') o.push('전치사' + (t.p && GCASE[t.p.cas] ? ' (' + GCASE[t.p.cas] + ' 지배)' : ''));
    else if(t.pos === 'J') o.push(({ C:'대등접속사', S:'종속접속사', H:'우위접속사' })[t.j] || '접속사');
    else if(t.pos === 'AB') o.push('부사'); else if(t.pos === 'Q') o.push('불변사'); else if(t.pos === 'I') o.push('감탄사');
    return o.join(' ').replace(/\s+/g, ' ').trim();
  }

  /* ───────── 엔진 ───────── */
  function create(env){
    env = env || {};
    var LEX = env.lex || {}, FREQ = env.freq || {}, TOTAL = env.total || { H:306000, G:140000 };
    var kor = env.kor || function(){ return ''; }, heads = env.heads || function(){ return []; }, intro = env.intro || function(){ return null; };
    var TUNE = env.tune || { layer:2.3, two:3.2, total:5.5, incl:2.6, leit:2.0 };     /* 구조 후보의 문턱(낱말 무게 = log10(전체/빈도)) — 성경 전체에서 교차 병행 약 3%, 포괄 약 20% 가 잡히도록 맞춤 */
    var bookName = env.bookName || function(bi){ return '책' + (bi + 1); }, dict = env.dict || function(){ return null; };

    function idf(key){ var f = FREQ[key]; if(!f) return 2.2; var tot = key.charAt(0) === 'G' ? TOTAL.G : TOTAL.H; return Math.max(0, Math.log(tot / f) / Math.LN10); }
    function lexOf(key){ return LEX[key] || null; }
    function dictGloss(key){
      var d = dict(key) || ''; if(!d) return '';
      if(key.charAt(0) === 'H'){ var q = d.match(/[‘'‛]([^’'‛]{1,16})[’']/); if(q) return q[1]; d = d.replace(/^기본어근/, '').replace(/【[^】]*】/g, '').replace(/^[;；:\s]+/, ''); return d.split(/[;:,(]/)[0].trim().slice(0, 14); }
      return d.split(/[,;]/)[0].replace(/\([^)]*\)/g, '').trim().slice(0, 24);
    }
    function koGloss(tok){ return String(tok.ko || '').replace(/^\(|\)$/g, '').replace(/^-+|-+$/g, '').split('-')[0].trim(); }
    function koVerbal(k){ return /(다|라|고|며|니|서|여|되|매|든|지|음|함|요|소서|오|자|냐|도다|이다|같이|하사|하되|하여|한|된|신|실|을|라도|면|나)$/.test(k) && !/^(내가|네가|너희가|우리가|그가|그들이|하나님이|여호와께서|주께서|저가|이는|그는)$/.test(k); }
    function shortGloss(tok){
      var L = lexOf(tok.key); if(L) return L[1].split(/[·/]/)[0];
      var k = koGloss(tok); if(k && (tok.pos !== 'V' || koVerbal(k))) return k;
      return dictGloss(tok.key) || k || tok.lemma || '';
    }
    function lexName(tok){ var L = lexOf(tok.key); return L ? L[0] : ''; }

    /* 낱말 → 토큰 */
    function tokens(bi, ws){
      var ot = bi < 39;
      return ws.map(function(w, i){
        var no = String(w[0] || '').replace(/[^\d]/g, ''), text = String(w[2] || '').replace(/</g, '');
        var t = { i:i, no:no, key:no ? (ot ? 'H' : 'G') + no : '', lemma:w[1] || '', text:text, code:w[4] || '', ko:w[5] || '', en:w[6] || '', ot:ot };
        t.m = ot ? parseHeb(t.code) : parseGrk(t.code);
        t.pos = t.m.pos;
        t.gap = /^-+$/.test(text) || !text;
        t.punct = ot ? '' : ((text.match(/[.,;·]$/) || [''])[0]);
        t.etn = ot && /֑/.test(text);                       /* 아트나흐 — 절의 가운데 쉼 */
        t.divine = !!(no && (ot ? DIV_H[+no] : DIV_G[+no]));
        t.neg = ot ? !!(t.m.pre.NEG || NEG_H[+no]) : (no === '3756' || no === '3361' || no === '3762' || no === '3764');
        t.content = (t.pos === 'V' || t.pos === 'N' || t.pos === 'NE' || (t.pos === 'A' && (!t.m.a || !/^(B|BN|BT|PT|PD|PR|PI|NC|NO|D)$/.test(t.m.a.kind || '')) && (ot || !/^P/.test(t.m.a && t.m.a.kind || '')))) && !t.gap && !!no && !t.divine;
        t.weight = t.content ? idf(t.key) : 0;
        t.lex = no ? lexOf(t.key) : null;
        t.human = !!(no && (ot ? HUMAN_H[+no] : HUMAN_G[+no])) || (ot ? t.pos === 'NE' : (t.pos === 'N' && /^[Α-ΩἈ-ὯᾺ-ῼ]/.test(t.lemma.charAt(0))));
        return t;
      });
    }

    /* 절을 마디(절 단위 문장)로 나눈다 */
    function clauses(toks, ot){
      var out = [], cur = [];
      function flush(){ if(cur.length){ out.push(cur); cur = []; } }
      toks.forEach(function(t, i){
        if(t.gap) return;
        var starts = false;
        if(ot){ starts = !!(t.m.pre.C || t.m.pre.R || (t.m.pre.Q && cur.length) || (t.no === '3588' || t.no === '518' || t.no === '6435' || t.no === '4616') || (t.pos === 'AB' && t.m.pre.NEG && cur.length > 1 && cur[cur.length - 1].pos !== 'V')); }
        else { starts = !!(t.pos === 'J' || (t.pos === 'A' && t.m.a && /^PR/.test(t.m.a.kind)) || (i > 0 && toks[i - 1].punct)); }
        if(starts && cur.length) flush();
        cur.push(t);
        if(ot && t.etn) flush();
      });
      flush();
      return out;
    }
    function finite(t){ if(t.pos !== 'V') return false; if(t.ot) return /^(A|I|M)$/.test(t.m.v.tma); return /^[ISOM]$/.test(t.m.v.mood); }
    function isVerbLike(t){ return t.pos === 'V'; }
    function thirdPerson(t){ var v = t.m.v; if(!v) return false; return t.ot ? (!v.per || v.per === 'Z') : (!v.per || v.per === '3'); }
    function subjCandidate(cl, verbIdx, ot){
      /* 동사 앞(도치된 주어)과 뒤(기본 어순)에서 주어가 될 명사·대명사를 찾는다: 전치사·목적격 표시가 안 붙고, 앞에 따로 선 전치사·אֵת 도 없는 명사(연계형이면 뒤 낱말까지).
         1·2인칭 동사는 주어가 동사 안에 있으므로 부르지 않는다. */
      if(!thirdPerson(cl[verbIdx])) return null;
      var order = [], k;
      for(k = verbIdx - 1; k >= 0; k--) order.push(k);
      for(k = verbIdx + 1; k < cl.length; k++) order.push(k);
      function afterPrep(i){ var p = cl[i - 1]; if(!p) return false; if(ot) return !p.pos && !!(p.m.pre.P || p.m.pre.O); return p.pos === 'P'; }
      for(var q = 0; q < order.length; q++){
        var i = order[q], t = cl[i];
        if(t.pos === 'V' && finite(t) && i !== verbIdx) break;      /* 다른 정동사를 넘지 않는다 */
        if(ot){
          if((t.pos === 'N' || t.pos === 'NE' || t.pos === 'NP') && !t.m.pre.P && !t.m.pre.O && !t.m.pre.R && !(t.m.n && t.m.n.kind === 'S') && !afterPrep(i)){
            if(i > 0 && cl[i - 1].m.n && cl[i - 1].m.n.cons) continue;                /* 연계형 뒤의 낱말(…의 ○○)은 주어가 아니다 */
            var ph = [t], j = i;
            while(cl[j] && cl[j].m.n && cl[j].m.n.cons && cl[j + 1] && (cl[j + 1].pos === 'N' || cl[j + 1].pos === 'NE')) { ph.push(cl[j + 1]); j++; }
            return { tok:t, phrase:ph, idx:i };
          }
        } else {
          if((t.pos === 'N' || t.pos === 'NP' || t.pos === 'A') && t.m.n && t.m.n.cas === 'N' && !(t.m.a && /^P[RDIT]/.test(t.m.a.kind || '')) && !afterPrep(i)){ return { tok:t, phrase:[t], idx:i }; }
          if(t.pos === 'D' && t.m.n.cas === 'N' && cl[i + 1] && cl[i + 1].pos === 'V' && cl[i + 1].m.v.mood === 'P') return { tok:cl[i + 1], phrase:[t, cl[i + 1]], idx:i + 1, substPtc:true };
        }
      }
      return null;
    }
    function whoIs(ph){
      /* 주어 구가 하나님인가 사람인가 */
      var divine = ph.some(function(t){ return t.divine; });
      var agent = ph.length > 1 && DIV_AGENT_H[+ph[0].no] && ph.some(function(t, i){ return i > 0 && t.divine; });
      if(divine && (ph[0].divine || agent)) return { kind:'G', label:ph.map(function(t){ return t.text; }).join(' '), agent:agent ? DIV_AGENT_H[+ph[0].no] : '' };
      if(ph.some(function(t){ return t.human; })) return { kind:'M', label:ph.map(function(t){ return t.text; }).join(' ') };
      return { kind:'O', label:ph.map(function(t){ return t.text; }).join(' ') };
    }

    /* ───────── 한 절 분석 ───────── */
    function analyzeVerse(bi, ci, vi, toks, state, genre){
      var ot = bi < 39, cls = clauses(toks, ot), verbs = [], notes = [], keys = [], chain = 0, order = [];
      var neum = ot && toks.some(function(t){ return t.no === '5002'; });        /* 여호와의 말씀이니라 */
      cls.forEach(function(cl, ci2){
        var vIdx = -1;
        for(var k = 0; k < cl.length; k++){ if(isVerbLike(cl[k]) && (finite(cl[k]) || vIdx < 0)){ vIdx = k; if(finite(cl[k])) break; } }
        var starter = cl[0];
        var vt = vIdx >= 0 ? cl[vIdx] : null;
        var subj = vt ? subjCandidate(cl, vIdx, ot) : null;
        var who = subj ? whoIs(subj.phrase) : null;
        /* 관계절(אֲשֶׁר / ὅς)에 주어가 없으면 앞 마디의 마지막 명사(선행사)가 주어 */
        if(vt && !who && thirdPerson(vt) && (ot ? !!starter.m.pre.R : (starter.pos === 'A' && starter.m.a && /^PR/.test(starter.m.a.kind))) && state.antecedent){ who = whoIs(state.antecedent); who.label += '(선행사)'; }
        var lastN = null; cl.forEach(function(t){ if(t.pos === 'N' || t.pos === 'NE' || t.pos === 'NP') lastN = t; }); if(lastN) state.antecedent = [lastN];
        /* 어순 — 히브리어: 술어-주어-목적-부사가 기본. 동사 앞에 놓인 명사·목적어·전치사구는 도치(강조) */
        if(vt && finite(vt)){
          var fronted = [];
          for(var f = 0; f < vIdx; f++){
            var ft = cl[f];
            if(ft.gap) continue;
            if(ot){
              if(ft.m.pre.CW) continue;
              if(ft.pos === 'AB' || ft.pos === 'A' && ft.m.a && /^(PT|BT)$/.test(ft.m.a.kind) || ft.m.pre.T || ft.m.pre.J || ft.m.pre.Q || ft.m.pre.R) { if(ft.pos === 'AB' && !ft.m.pre.NEG) continue; if(ft.m.pre.NEG) continue; continue; }
              if(ft.no === '3588' || ft.no === '518' || ft.no === '2009' || ft.no === '3541' || ft.no === '6258' || ft.no === '1571' || ft.no === '389' || ft.no === '7535' || ft.no === '4994') continue;
              if(ft.pos === 'N' || ft.pos === 'NE' || ft.pos === 'NP' || ft.pos === 'A') fronted.push(ft);
            } else {
              if(ft.pos === 'J' || ft.pos === 'Q' || ft.pos === 'AB' || ft.pos === 'D' || ft.pos === 'P') continue;
              if((ft.pos === 'N' || ft.pos === 'A') && ft.m.n && ft.m.n.cas === 'A' && !ft.m.n.cas.match(/N/)) fronted.push(ft);
              if(ft.pos === 'NP' && ft.m.n.cas === 'N' && (ft.m.n.per === '1' || ft.m.n.per === '2')) fronted.push(ft);
            }
          }
          if(fronted.length && !(ot && vt.m.pre.CW)){
            var kind = 'subj', ft0 = fronted[0];
            if(ot){ if(ft0.m.pre.O || (fronted.length > 1 && fronted.some(function(x){ return x.m.pre.O; }))) kind = 'obj'; else if(ft0.m.pre.P) kind = 'adv'; else if(subj && subj.tok === ft0) kind = 'subj'; else if(ft0.pos === 'NP') kind = 'subj'; else kind = subj && subj.idx < vIdx ? 'subj' : 'obj'; }
            else { kind = ft0.pos === 'NP' ? 'pron' : 'obj'; }
            var txt = fronted.map(function(x){ return x.text; }).join(' ');
            var desc = ot ? ({ subj:'주어 「' + txt + '」가 술어 앞으로 도치 — 대조·강조(이 사람/이것이야말로)', obj:'목적어 「' + txt + '」가 술어 앞으로 도치 — 그 대상을 힘주어 내세움', adv:'상황어 「' + txt + '」가 술어 앞 — 때·곳·배경을 먼저 세움(서사의 쉼표)' })[kind]
                          : ({ obj:'목적어·보어 「' + txt + '」가 동사 앞 — 강조', pron:'주어 대명사 「' + txt + '」를 굳이 적음 — "다른 이가 아니라 바로 ○○가"' })[kind];
            if(desc) order.push({ kind:kind, text:txt, verb:vt.text, desc:desc, neg:cl.some(function(x){ return x.neg; }) });
          }
          if(ot && vt.m.pre.CW && /I/.test(vt.m.v.tma)) chain++;
        }
        /* 말하는 이 추적 */
        if(vt && vt.no && (ot ? SPEECH_H[+vt.no] : SPEECH_G[+vt.no]) && finite(vt) && !(ot ? vt.m.v.tma === 'M' : vt.m.v.mood === 'M')){
          /* 누구에게: אֶל/לְ + 명사, πρός/αὐτοῖς */
          var to = null;
          for(var a = vIdx + 1; a < cl.length; a++){ var at = cl[a]; if(ot ? (at.m.pre.P || at.no === '413') : (at.pos === 'P' || (at.pos === 'NP' && at.m.n.cas === 'D'))){ var nx = ot ? (at.no === '413' ? cl[a + 1] : at) : (at.pos === 'P' ? cl[a + 1] : at); if(nx){ to = nx.divine ? 'G' : 'M'; break; } } }
          var prevSpk = state.speaker, prevTo = state.addressee;
          if(who){ state.speaker = who.kind === 'G' ? 'G' : 'M'; state.addressee = to || (state.speaker === 'G' ? 'M' : (prevSpk && prevSpk !== state.speaker ? prevSpk : (genre === 'poetry' ? 'G' : 'M'))); }
          else if(thirdPerson(vt) && prevSpk && vi === state.speechVerse + 0 || (thirdPerson(vt) && prevSpk && state.speechVerse >= 0 && vi - state.speechVerse <= 2)){
            /* 주어 없는 "이르되" — 대화가 오가는 중이면 말하는 이가 바뀐다 */
            state.speaker = to === 'G' ? 'M' : (to === 'M' && prevSpk === 'M' ? 'G' : (prevTo || (prevSpk === 'G' ? 'M' : 'G'))); state.addressee = to || prevSpk; state.turned = true;
          } else if(thirdPerson(vt)){ state.speaker = state.subj === 'G' ? 'G' : 'M'; state.addressee = to || (state.speaker === 'G' ? 'M' : (genre === 'poetry' ? 'G' : 'M')); }
          else if(!state.speaker){ state.speaker = 'M'; state.addressee = to || 'M'; }
          state.speechVerse = vi;
        }
        if(neum) { state.speaker = 'G'; state.addressee = 'M'; }
        /* 종속절(관계절·כִּי·ὅτι·ἵνα)의 주어는 이야기의 줄기를 바꾸지 않는다 */
        var subordinate = ot ? !!(starter.m.pre.R || starter.no === '3588' || starter.no === '518' || starter.no === '6435' || starter.no === '4616') : ((starter.pos === 'J' && starter.j === 'S') || (starter.pos === 'A' && starter.m.a && /^PR/.test(starter.m.a.kind)));
        if(vt && who && !(ot ? SPEECH_H[+vt.no] : SPEECH_G[+vt.no]) && !subordinate){ state.subj = who.kind; state.subjLabel = who.label; }
        /* 동사 하나하나 — 주체 가르기 */
        cl.forEach(function(t, k){
          if(t.pos !== 'V' || t.gap) return;
          var v = t.m.v, per = ot ? ({ X:'1', Y:'2', Z:'3' })[v.per] || '' : (v.per || '');
          var agentKind = 'O', why = '';
          var passive = ot ? /^(N|U|O)$/.test(v.stem) || v.tma === 'PP' : /^(P|E|O)$/.test(v.voice);
          var mySubj = (k === vIdx) ? who : null;
          if(!mySubj && k !== vIdx && finite(t)){ var s2 = subjCandidate(cl, k, ot); if(s2) mySubj = whoIs(s2.phrase); }
          var L = t.lex, cat = L ? L[2] : '', isSpeech = !!(t.no && (ot ? SPEECH_H[+t.no] : SPEECH_G[+t.no]));
          if(mySubj){ agentKind = mySubj.kind; why = '주어 ' + mySubj.label + (mySubj.agent ? ' (하나님의 ' + mySubj.agent + ')' : ''); }
          else if(per === '1'){
            agentKind = state.speaker === 'G' ? 'G' : 'M'; why = state.speaker === 'G' ? '하나님의 말씀 안의 1인칭 — 하나님의 자기 선언' : '1인칭 — 말하는 이(사람)의 응답·고백';
            if(genre === 'epistle' && !ot && !(L && L[5] === 'M')){ agentKind = 'A'; why = '1인칭 — 글쓴이(사도)의 말'; }
            if(genre === 'poetry' && ot && agentKind === 'M') why = '1인칭 — 시인의 고백';
          }
          else if(per === '2'){ var toG = state.addressee === 'G' || (genre === 'poetry' && cl.some(function(x){ return x.divine && !x.m.pre.P; })); agentKind = toG ? 'G' : 'M'; why = toG ? '2인칭 — 하나님께 아뢰는 말(기도·찬양)' : (v.tma === 'M' || (!ot && v.mood === 'M') ? '2인칭 명령 — 사람에게 요구된 응답' : '2인칭 — 듣는 사람에게 요구·약속된 것'); }
          else if(isSpeech && state.turned){ agentKind = state.speaker; why = '대화 — 말하는 이가 바뀜'; }
          else { agentKind = state.subj || 'O'; why = state.subjLabel ? '앞 문장의 주어(' + state.subjLabel + ')가 이어짐' : '주어가 드러나지 않음'; if(!state.subj) agentKind = 'O'; }
          /* 신적 수동태: 행위자 없는 수동 + 사람 주어 + 구속 어휘 */
          var divPass = false, hasAgent = ot ? false : cl.some(function(x){ return x.no === '5259'; });
          if(passive && agentKind !== 'G' && !cl.some(function(x){ return x.divine; }) && !hasAgent && (L && (L[5] === 'G' || GOD_CATS[cat]))){ divPass = true; agentKind = 'G'; why = '수동태 — 행위자가 숨은 "신적 수동태": 하나님이 하시는 일'; }
          if(!ot && !divPass && v.voice === 'P' && agentKind !== 'G' && genre === 'epistle' && !hasAgent && !NOT_DIVINE_PASS[+t.no] && (per === '2' || (v.mood === 'P' && v.cas === 'N') || (per === '3' && agentKind === 'M'))){ divPass = true; agentKind = 'G'; why = '수동태(행위자 없음) — 성도에게 "이루어진 일": 하나님이 이루시는 일로 읽는다'; }
          if(agentKind !== 'G' && (ot ? GOD_ONLY_H[+t.no] : GOD_ONLY_G[+t.no]) && per === '3' && agentKind === 'O') { agentKind = 'G'; why = '하나님만 주어가 되는 말(' + (L ? L[0].split(' ')[0] : t.lemma) + ')'; }
          if(ot && t.no === '2734' && agentKind === 'G' && !mySubj){ var toWhom = cl.filter(function(x){ return x.m.pre.P && (x.human || x.pos === 'NE'); })[0]; if(toWhom){ agentKind = 'M'; why = 'לְ + 사람(' + toWhom.text + ') — 그 사람에게 분이 일어남(비인칭 구문)'; } }
          if(!isSpeech) state.turned = false;
          var copula = ot ? t.no === '1961' : t.no === '1510';
          var nuance = ot ? hebNuance(t, cl, k, genre, state) : grkNuance(t, cl, k, genre);
          var rec = { vi:vi, i:t.i, text:t.text, lemma:t.lemma, key:t.key, ko:t.ko, en:t.en, code:t.code, morph:ot ? explainHeb(t.m) : explainGrk(t.m), agent:agentKind, why:why, nuance:nuance, cat:cat, lexName:L ? L[0] : '', lexGloss:L ? L[1] : '', christ:L ? L[4] : '', passive:passive, divPass:divPass, per:per,
                      imper:ot ? v.tma === 'M' : v.mood === 'M', volitive:ot ? !!t.m.tail : v.mood === 'S' && per === '1', ptc:ot ? /^P/.test(v.tma) : v.mood === 'P', weight:copula ? 0 : t.weight, gloss:shortGloss(t), copula:copula };
          verbs.push(rec);
        });
      });
      /* 신학 낱말(명사·형용사 포함) — 하나님의 이름은 어디에나 있으므로 빼고, 갈래가 있는 말만 */
      toks.forEach(function(t){ if(t.lex && t.lex[2] && t.lex[2] !== 'god' && !t.gap && t.pos !== 'V'){ keys.push({ vi:vi, i:t.i, text:t.text, key:t.key, lemma:t.lemma, ko:t.ko, lexName:t.lex[0], gloss:t.lex[1], cat:t.lex[2], note:t.lex[3], christ:t.lex[4], morph:ot ? explainHeb(t.m) : explainGrk(t.m), code:t.code }); } });
      /* 부정사 절대형 강조, 강한 부정, 목적절 */
      toks.forEach(function(t, i){
        if(ot && t.pos === 'V' && t.m.v.tma === 'NA'){ var nb = toks[i + 1], pb = toks[i - 1]; if((nb && nb.no === t.no && nb.pos === 'V') || (pb && pb.no === t.no && pb.pos === 'V')) notes.push({ kind:'infabs', text:t.text + ' ' + ((nb && nb.no === t.no) ? nb.text : pb.text), desc:'부정사 절대형 + 같은 어근 동사 — "반드시·정녕 …하다"의 강조 구문' }); }
        if(!ot && t.no === '3756' && toks[i + 1] && toks[i + 1].no === '3361') notes.push({ kind:'negstrong', text:'οὐ μή', desc:'οὐ μή + 가정법/미래 — 가장 강한 부정("결코 …않다")' });
        if(ot && t.no === '3808' && toks[i + 1] && toks[i + 1].pos === 'V' && toks[i + 1].m.v.tma === 'I' && (genre === 'law')) notes.push({ kind:'prohib', text:t.text + ' ' + toks[i + 1].text, desc:'לֹא + 미완료 — 항구적 금지("결코 …하지 말라", 십계명식)' });
        if(ot && t.no === '408' && toks[i + 1] && toks[i + 1].pos === 'V') notes.push({ kind:'prohib2', text:t.text + ' ' + toks[i + 1].text, desc:'אַל + 단축형 — 지금 당장의 금지("…하지 말라")' });
        if(!ot && t.no === '2443' && toks.slice(i + 1, i + 4).some(function(x){ return x.pos === 'V' && x.m.v.mood === 'S'; })) notes.push({ kind:'purpose', text:'ἵνα …', desc:'ἵνα + 가정법 — 목적·결과절("…하기 위하여/…하도록")' });
        if(!ot && t.pos === 'V' && t.m.v.mood === 'P' && t.m.v.cas === 'G' && toks[i + 1] && toks[i + 1].m.n && toks[i + 1].m.n.cas === 'G' && i === 0) notes.push({ kind:'genabs', text:t.text + ' ' + toks[i + 1].text, desc:'독립 속격 — 배경 상황("…할 때에")' });
        if(ot && t.pos === 'V' && t.m.v.per === 'X' && t.m.v.num === 'P' && (t.m.tail === 'Ch' || t.m.tail === 'V')) notes.push({ kind:'cohort', text:t.text, desc:'1인칭 복수 청유형 — "우리가 …하자"(공동체의 결단)' });
      });
      /* 시의 병행법 */
      var par = null;
      if(ot && (genre === 'poetry' || genre === 'wisdom' || genre === 'prophecy')){
        var cut = -1; toks.forEach(function(t, i){ if(t.etn && cut < 0) cut = i; });
        if(cut > 0 && cut < toks.length - 1){
          var A = toks.slice(0, cut + 1), B = toks.slice(cut + 1);
          var ka = A.filter(function(t){ return t.content; }), kb = B.filter(function(t){ return t.content; });
          var shared = ka.filter(function(t){ return kb.some(function(u){ return u.key === t.key; }); });
          var negA = A.some(function(t){ return t.neg; }), negB = B.some(function(t){ return t.neg; });
          var anto = ANTONYM_H.some(function(p){ return (A.some(function(t){ return +t.no === p[0]; }) && B.some(function(t){ return +t.no === p[1]; })) || (A.some(function(t){ return +t.no === p[1]; }) && B.some(function(t){ return +t.no === p[0]; })); });
          var skel = function(ts){ return ts.filter(function(t){ return t.content; }).map(function(t){ return t.pos === 'NE' ? 'N' : t.pos; }).join(''); };
          var type = (anto || (negA !== negB)) ? '반의적 병행' : (shared.length || skel(A) === skel(B)) ? '동의적 병행' : '종합적 병행';
          par = { type:type, a:A.map(function(t){ return t.text; }).join(' '), b:B.map(function(t){ return t.text; }).join(' '), aKo:A.map(function(t){ return t.ko; }).filter(Boolean).join(' '), bKo:B.map(function(t){ return t.ko; }).filter(Boolean).join(' '), shared:shared.map(function(t){ return t.lemma; }),
                  desc:({ '반의적 병행':'앞 행과 뒤 행이 서로 맞서며 뜻을 또렷하게 함', '동의적 병행':'뒤 행이 앞 행을 다른 말로 되풀이하여 뜻을 굳힘', '종합적 병행':'뒤 행이 앞 행을 이어받아 뜻을 완성·발전시킴' })[type] };
        }
      }
      /* 절 안의 교차 배열(ABB'A')  */
      var inner = null;
      var cs = toks.filter(function(t){ return t.content && t.weight >= 2.0; });
      for(var p = 0; p < cs.length && !inner; p++) for(var q = p + 1; q < cs.length && !inner; q++) for(var r = q + 1; r < cs.length && !inner; r++) for(var s = r + 1; s < cs.length && !inner; s++){
        if(cs[p].key === cs[s].key && cs[q].key === cs[r].key && cs[p].key !== cs[q].key) inner = { a:cs[p].lemma, b:cs[q].lemma, text:[cs[p], cs[q], cs[r], cs[s]].map(function(t){ return t.text; }).join(' · ') };
      }
      return { vi:vi, verbs:verbs, order:order, chain:chain, notes:notes, keys:keys, par:par, inner:inner, content:toks.filter(function(t){ return t.content; }), toks:toks, kor:kor(bi, ci, vi) };
    }
    function hebNuance(t, cl, k, genre, state){
      var v = t.m.v, o = [], stem = HSTEM[v.stem];
      if(stem) o.push(stem + '형: ' + HSTEM_NUANCE[v.stem]); else o.push('희귀 어간(' + v.stem + '): 강의·반복의 뜻');
      if(v.tma === 'A'){ if(t.m.pre.C && !t.m.pre.CW && (genre === 'law' || genre === 'prophecy')) o.push('연속 완료(ו+완료) — 앞 동사를 이어받는 미래·명령·조건의 결과'); else if(genre === 'prophecy') o.push('완료형 — 확정된 사실; 예언에서는 아직 안 된 일을 이미 된 것처럼 말하는 "예언적 완료"일 수 있음'); else o.push('완료형 — 완결된 행위·확정된 사실·상태'); }
      else if(v.tma === 'I'){ if(t.m.pre.CW) o.push('와우 연속 미완료(바이크톨) — 이야기의 줄기를 잇는 서술("그리고 …하였다")'); else if(genre === 'law') o.push('미완료형 — 법에서는 "…할지니라"의 명령적 미완료'); else o.push('미완료형 — 아직 끝나지 않은·반복되는·의지적인 행위'); }
      else if(v.tma === 'M') o.push('명령형 — 2인칭에게 직접 명령');
      else if(v.tma === 'NA') o.push('부정사 절대형 — 강조·명령·부사적 쓰임');
      else if(v.tma === 'NG') o.push(t.m.pre.P ? '전치사 + 부정사 연계형 — 목적·때("…하기 위하여 / …할 때")' : '부정사 연계형 — 동사의 이름꼴(…하는 것)');
      else if(v.tma === 'PA') o.push('능동 분사 — 지속·진행 중인 행위, 또는 "…하는 자"');
      else if(v.tma === 'PP') o.push('수동 분사 — 이루어진 상태');
      if(t.m.tail) o.push(HTAIL[t.m.tail] + ' — ' + ({ V:'말하는 이의 뜻·결심("…하리라")', Vh:'간절한 뜻·결심', J:'기원·지시("…할지어다")', Ch:'청유·간구("…하자 / …하게 하소서")' })[t.m.tail]);
      if(v.stem === 'H' && (cl.some(function(x){ return x.divine && !x.m.pre.P; }) || state.subj === 'G')) o.push('하나님이 주어인 히프일 — 주권적으로 일으키시는 행위');
      return o.join(' · ');
    }
    function grkNuance(t, cl, k, genre){
      var v = t.m.v, o = [];
      o.push(GTENSE_NUANCE[v.tense]);
      o.push(GMOOD[v.mood] + ' — ' + GMOOD_NUANCE[v.mood]);
      if(v.mood === 'M'){ o.push(v.tense === 'P' ? '현재 명령 — 계속·습관적으로 하라(또는 μή + 현재 = 하던 일을 그치라)' : v.tense === 'A' ? '부정과거 명령 — 단회·결정적으로 하라' : ''); }
      o.push(GVOICE[v.voice] + '태 — ' + GVOICE_NUANCE[v.voice]);
      if(v.mood === 'P' && k > 0 && cl[k - 1].pos === 'D') o.push('관사 + 분사 — 명사처럼 "…하는 자"');
      if(v.tense === 'R') o.push('완료형 — 과거의 사건이 지금의 상태를 결정함("이미 이루어져 지금도 유효하다")');
      return o.filter(Boolean).join(' · ');
    }

    /* ───────── 단락(페리코페) 나누기 — 표준새번역의 소제목 ───────── */
    function pericopes(bi, ci, nVerses){
      var hs = heads(bi, ci) || [], cuts = {}, titles = {};
      hs.forEach(function(h){ cuts[h[0]] = 1; titles[h[0]] = h[1]; });
      var out = [], start = 0, head = titles[0] || '';
      for(var v = 1; v < nVerses; v++){ if(cuts[v]){ out.push({ v0:start, v1:v - 1, head:head }); start = v; head = titles[v]; } }
      out.push({ v0:start, v1:nVerses - 1, head:head });
      return out;
    }

    /* ───────── 구조 분석(단락) ───────── */
    function structure(vs, ot){
      var n = vs.length, res = { chiasm:null, alt:null, inclusio:null, leit:[], inner:[], par:[] };
      function lemmaSet(v){ var m = {}; v.content.forEach(function(t){ if(t.weight >= 1.3) m[t.key] = { w:t.weight, lemma:t.lemma, gloss:'' }; }); return m; }
      var sets = vs.map(lemmaSet);
      /* 단락 안 여러 절에 두루 나오는 말(후렴·족보의 "낳고·살고·년")은 짝의 근거가 못 된다 */
      var df = {}; sets.forEach(function(s){ Object.keys(s).forEach(function(k){ df[k] = (df[k] || 0) + 1; }); });
      var dfMax = Math.max(2, Math.floor(n * 0.4));
      function shared(a, b){ var out = []; Object.keys(sets[a]).forEach(function(k){ if(sets[b][k] && df[k] <= dfMax) out.push({ key:k, lemma:sets[a][k].lemma, w:sets[a][k].w }); }); out.sort(function(x, y){ return y.w - x.w; }); return out; }
      function score(list){ return list.reduce(function(s, x){ return s + x.w; }, 0); }
      /* 교차 병행(X·키아즘): 가운데를 두고 바깥에서 안으로 짝지어 같은 낱말이 되풀이되는가 */
      if(n >= 4){
        var best = null;
        for(var c2 = 2; c2 <= 2 * n - 4; c2++){                       /* c2 = 2*center (반절 단위) */
          var layers = [], k = 1;
          while(true){
            var a = (c2 - k) / 2, b = (c2 + k) / 2;
            if(a < 0 || b > n - 1) break;
            if(Number.isInteger(a)){ var sh = shared(a, b), sc0 = score(sh); if(sh.length && (sc0 >= TUNE.layer || (sh.length >= 2 && sc0 >= TUNE.two))) layers.push({ a:a, b:b, shared:sh.slice(0, 3), score:sc0 }); else break; }
            k += 1;
            if(layers.length >= 5) break;
          }
          /* 가운데 절(정수 중심)은 C 로 둔다 */
          if(layers.length >= 2){
            var outer = layers[layers.length - 1], spans = outer.a <= 1 && outer.b >= n - 2;            /* 단락 전체를 감싸야 그 단락의 구조다 */
            var sc = layers.reduce(function(s, L){ return s + L.score; }, 0) + layers.length;
            if(spans && sc >= TUNE.total && (!best || sc > best.score)) best = { score:sc, layers:layers, center:(c2 % 2 === 0) ? c2 / 2 : null };
          }
        }
        if(best){
          var labels = ['A', 'B', 'C', 'D', 'E'], rows = [];
          var L = best.layers;
          for(var i = L.length - 1; i >= 0; i--) rows.push({ label:labels[L.length - 1 - i], vi:vs[L[i].a].vi, shared:L[i].shared });
          if(best.center !== null) rows.push({ label:labels[L.length] || 'X', vi:vs[best.center].vi, shared:[], center:true });
          for(var j = 0; j < L.length; j++) rows.push({ label:labels[j] + "'", vi:vs[L[j].b].vi, shared:L[j].shared });
          res.chiasm = { rows:rows, score:best.score, desc:'바깥에서 안으로 짝을 이루는 낱말이 되풀이되어 ' + (best.center !== null ? '가운데(' + labels[L.length] + ')에 무게가 실리는 교차 병행(키아즘) 후보' : '교차 병행(키아즘) 후보') };
        }
        /* 교대 병행(ABC-A\'B\'C\', 순차적 V구조) */
        if(n >= 4 && n % 2 === 0 && !res.chiasm){
          var h = n / 2, hits = [];
          for(var p = 0; p < h; p++){ var sp = shared(p, p + h); if(score(sp) >= TUNE.layer) hits.push({ a:p, b:p + h, shared:sp.slice(0, 3) }); }
          if(hits.length >= 2 && hits.length >= h - 1) res.alt = { rows:hits.map(function(x, i){ return { label:String.fromCharCode(65 + i), vi:vs[x.a].vi, vi2:vs[x.b].vi, shared:x.shared }; }), desc:'앞 반과 뒤 반이 같은 차례로 짝을 이루는 교대 병행(순차 구조) 후보' };
        }
      }
      /* 포괄(인클루지오): 처음과 끝 절이 드문 낱말을 공유 */
      if(n >= 3){ var inc = shared(0, n - 1).filter(function(x){ return x.w >= TUNE.incl; }); if(inc.length) res.inclusio = { vi0:vs[0].vi, vi1:vs[n - 1].vi, shared:inc.slice(0, 3) }; }
      /* 되풀이되는 열쇠말(라이트보르트) */
      var cnt = {};
      vs.forEach(function(v){ v.content.forEach(function(t){ if(t.weight >= TUNE.leit){ var c = cnt[t.key] = cnt[t.key] || { key:t.key, lemma:t.lemma, n:0, w:t.weight, vis:{}, ko:t.ko }; c.n++; c.vis[v.vi] = 1; } }); });
      res.leit = Object.keys(cnt).map(function(k){ return cnt[k]; }).filter(function(c){ return c.n >= 3 && Object.keys(c.vis).length >= 2; }).sort(function(a, b){ return b.n * b.w - a.n * a.w; }).slice(0, 6).map(function(c){ c.verses = Object.keys(c.vis).map(Number).sort(function(a, b){ return a - b; }); delete c.vis; return c; });
      vs.forEach(function(v){ if(v.inner) res.inner.push({ vi:v.vi, inner:v.inner }); if(v.par) res.par.push({ vi:v.vi, par:v.par }); });
      return res;
    }

    /* ───────── 구속사적 틀 + 설교 개요 ───────── */
    function frame(vs, bi, ci, per, genre){
      var god = [], man = [], other = [], christ = [], cats = {}, catsG = {}, catsM = {};
      var ot = bi < 39;
      vs.forEach(function(v){
        v.verbs.forEach(function(r){
          var speech = !!(r.key && (ot ? SPEECH_H[+r.key.slice(1)] : SPEECH_G[+r.key.slice(1)])) || !!r.copula;
          var item = { vi:r.vi, text:r.text, gloss:r.gloss, ko:r.ko, morph:r.morph, why:r.why, cat:speech ? '' : r.cat, imper:r.imper, divPass:r.divPass, key:r.key, lexName:r.lexName, weight:speech ? 0 : r.weight, speech:speech, agent:r.agent, explicit:/^주어|^2인칭|^1인칭|^수동태|^하나님만|^לְ/.test(r.why), fin:!r.ptc && !/부정사/.test(r.morph) };
          if(r.agent === 'G'){ god.push(item); if(r.cat && !speech) catsG[r.cat] = (catsG[r.cat] || 0) + 1; }
          else if(r.agent === 'M'){ man.push(item); if(r.cat && !speech) catsM[r.cat] = (catsM[r.cat] || 0) + 1; }
          else other.push(item);
          if(r.cat) cats[r.cat] = (cats[r.cat] || 0) + 1;
          if(r.christ) christ.push({ vi:r.vi, text:r.text, name:r.lexName, christ:r.christ });
        });
        v.keys.forEach(function(k){ if(k.cat) cats[k.cat] = (cats[k.cat] || 0) + 1; if(k.christ) christ.push({ vi:k.vi, text:k.text, name:k.lexName, christ:k.christ }); });
      });
      /* 같은 그리스도 연결은 한 번만 */
      var seen = {}; christ = christ.filter(function(c){ if(seen[c.name]) return false; seen[c.name] = 1; return true; });
      function topCats(m){ return Object.keys(m).sort(function(a, b){ return m[b] - m[a]; }); }
      var gTop = topCats(catsG).filter(function(c){ return (GOD_CATS[c] && c !== 'word') || c === 'love'; }), mTop = topCats(catsM).filter(function(c){ return MAN_CATS[c]; });
      if(!gTop.length && catsG.word) gTop = ['word'];
      if(!mTop.length && catsM.word) mTop = ['word'];
      var allTop = topCats(cats);
      /* 뼈대 동사: 신학 어휘 > 드문 말 (말하다·이르되 같은 말은 뺀다) */
      function rank(x){ return (x.cat ? 10 : 0) + (x.imper ? 3 : 0) + (x.explicit ? 4 : 0) + (x.fin ? 2 : 0) + x.weight; }
      function pick(list, n){ var seen2 = {}; return list.filter(function(x){ return !x.speech; }).sort(function(a, b){ return rank(b) - rank(a); }).filter(function(x){ if(seen2[x.key]) return false; seen2[x.key] = 1; return true; }).slice(0, n); }
      var gPick = pick(god, 3), mPick = pick(man, 3);
      var ref = bookName(bi) + ' ' + (ci + 1) + ':' + (per.v0 + 1) + (per.v1 > per.v0 ? '-' + (per.v1 + 1) : '');
      var title = (per.head && !/^제\s*\d+\s*권$/.test(per.head) && per.head.length <= 28) ? per.head : ref;
      var GOD_PHR = { redeem:'속죄하고 구속하시는', save:'건지고 구원하시는', grace:'은혜와 긍휼을 베푸시는', covenant:'언약을 세우고 약속을 지키시는', holy:'거룩하게 구별하시는', judge:'공의로 심판하고 바로잡으시는', life:'살리시고 세우시는', kingdom:'다스리시는', god:'친히 일하시는', spirit:'임재하시는', word:'말씀하시는', love:'사랑으로 찾아오시는', type:'그리스도를 예비하시는', people:'자기 백성을 이끄시는' };
      var MAN_PHR = { faith:'믿음으로 신뢰함', repent:'돌이켜 회개함', obey:'듣고 순종하여 지킴', worship:'예배와 찬양과 기도로 나아감', love:'사랑과 경외로 응답함', sin:'죄와 불순종으로 등 돌림(경고)', word:'말씀을 받음' };
      var godPhrase = gTop.length ? GOD_PHR[gTop[0]] : (god.length ? '친히 행하시는' : '말씀으로 다스리시는');
      var manPhrase = mTop.length ? MAN_PHR[mTop[0]] : (man.some(function(x){ return x.imper; }) ? '명령하신 대로 행함' : (man.length ? '믿음과 순종으로 응답함' : '하나님의 일하심을 받아들임'));
      var subject = title + '에서 ' + godPhrase + ' 하나님의 손길';
      var complement = (mTop[0] === 'sin' ? '사람의 등 돌림을 드러내어 참된 응답이 무엇인지 보여 준다' : '사람에게 ' + manPhrase + '으로 응답하기를 요구한다').replace('함으로', '으로');
      var idea = subject + '은 ' + complement + '.';
      var gVerbs = gPick.map(function(x){ return '「' + x.gloss + '」(' + (ci + 1) + ':' + (x.vi + 1) + ')'; }), mVerbs = mPick.map(function(x){ return '「' + x.gloss + '」(' + (ci + 1) + ':' + (x.vi + 1) + ')'; });
      var idea2 = '하나님은 ' + (gVerbs.length ? gVerbs.join(' · ') + ' — ' : '') + godPhrase + ' 분이시고, 사람은 ' + (mVerbs.length ? mVerbs.join(' · ') + ' — ' : '') + manPhrase + '으로 부름받는다.';
      var PURPOSE = { faith:'하나님의 약속을 신뢰하기로 결단하게 한다', repent:'하나님께 돌이키기로 결단하게 한다', obey:'들은 말씀을 지켜 행하기로 결단하게 한다', worship:'참된 예배와 감사로 나아가기로 결단하게 한다', love:'하나님을 사랑하고 경외하기로 결단하게 한다', sin:'자기 죄를 보고 은혜 앞에 서게 한다', word:'말씀을 받아 마음에 새기게 한다' };
      var purpose = '청중이 ' + godPhrase + ' 하나님의 손길을 보고, ' + (PURPOSE[mTop[0]] || '믿음과 순종으로 응답하기로 결단하게 한다') + '.';
      var In = intro(bi) || {};
      var GENRE_APP = {
        narrative:'이야기 본문은 사람의 모범이 아니라 그 사람을 통해 하나님이 무엇을 하셨는가를 설교한다(인물 중심·교훈 중심 설교를 피함). 오늘 우리 삶의 자리에서 같은 하나님이 같은 방식으로 일하신다.',
        law:'율법은 먼저 구원하신 하나님(출 20:2)의 언약 백성에게 주신 삶의 길이다. 명령 뒤에 선 은혜를 먼저 보이고, 그리스도 안에서 성취된 율법의 뜻을 오늘의 순종으로 잇는다.',
        poetry:'시는 하나님 앞에 선 사람의 고백이다. 시인의 자리에 오늘의 청중을 세우고, 같은 하나님께 같은 고백(탄식·신뢰·찬양)으로 나아가게 한다.',
        wisdom:'지혜 본문은 하나님을 경외하는 삶의 기술이다. 경구를 도덕 훈계로 끝내지 않고 지혜 자체이신 그리스도(고전 1:24)와 연결한다.',
        prophecy:'예언은 언약을 깨뜨린 백성에게 주신 심판과 회복의 말씀이다. 심판의 엄중함과 회복의 약속이 그리스도 안에서 어떻게 성취되었는지를 보이고 오늘의 회개를 촉구한다.',
        gospel:'복음서 본문은 예수께서 누구시며 무엇을 하셨는가를 선포한다. 기적·가르침·수난의 사건 자체가 메시지이며, 청중은 제자의 자리에서 응답한다.',
        epistle:'서신은 교리(하나님이 하신 일, 직설법)에서 권면(성도가 할 일, 명령법)으로 흐른다. 수동태로 표현된 하나님의 일하심과 능동태로 요구된 성도의 일을 나누어 세운다.',
        apocalyptic:'묵시 본문은 환난 중의 교회에 주신 승리의 확신이다. 상징을 풀어 어린 양의 승리를 보이고, 오늘의 인내와 충성을 촉구한다.' };
      var outline = [];
      outline.push({ h:'서론', items:[ (In['배경'] ? '배경: ' + In['배경'] : ''), (In['독자'] ? '받는 이: ' + In['독자'] : ''), '오늘의 질문: ' + (mTop[0] === 'sin' ? '우리는 어디서 하나님께 등을 돌리고 있는가?' : '우리는 ' + godPhrase + ' 하나님 앞에 어떤 모습으로 서 있는가?') ].filter(Boolean) });
      outline.push({ h:'본론 1 — 하나님의 손길', items:god.length ? pick(god, 5).map(function(x){ return (ci + 1) + ':' + (x.vi + 1) + ' ' + x.text + ' — ' + x.gloss + ' (' + x.morph + ')' + (x.divPass ? ' · 신적 수동태' : ''); }) : ['본문에서 하나님이 직접 주어로 나오는 동사는 없다 — 사건 뒤에서 일하시는 섭리를 문맥(앞뒤 단락·책 개관)에서 찾는다'] });
      outline.push({ h:'본론 2 — 인간의 응답', items:man.length ? pick(man, 5).map(function(x){ return (ci + 1) + ':' + (x.vi + 1) + ' ' + x.text + ' — ' + x.gloss + ' (' + x.morph + ')' + (x.imper ? ' · 명령' : ''); }) : ['사람의 응답 동사가 드러나지 않는다 — 하나님의 손길이 요구하는 응답을 설교자가 세운다'] });
      outline.push({ h:'본론 3 — 그리스도 안에서', items:(christ.length ? christ.slice(0, 4).map(function(c){ return c.name + ' → ' + c.christ; }) : []).concat(In['그리스도'] ? ['이 책의 그리스도: ' + In['그리스도']] : []).concat(christ.length || In['그리스도'] ? [] : ['본문의 하나님의 손길이 그리스도 안에서 어떻게 완성되는지(눅 24:27)를 신약과 잇는다']) });
      outline.push({ h:'결론 — 오늘의 결단(Here and Now)', items:[ GENRE_APP[genre] || '', '결단: ' + manPhrase + '으로 ' + godPhrase + ' 하나님께 응답하자.', '결론은 책망이 아니라 격려로 맺는다 — 하나님이 먼저 하셨고 지금도 하신다.' ].filter(Boolean) });
      return { god:god, man:man, other:other, christ:christ, cats:allTop.map(function(c){ return { cat:c, ko:CAT_KO[c] || c, n:cats[c] }; }), subject:subject, complement:complement, idea:idea, idea2:idea2, purpose:purpose, outline:outline, ref:ref, title:title, godPhrase:godPhrase, manPhrase:manPhrase };
    }

    /* ───────── 장 전체 ───────── */
    function analyze(bi, ci, chapterWords){
      var ot = bi < 39, genre = GENRE[bi], ch = chapterWords || [];
      var state = { speaker:(genre === 'epistle' || genre === 'poetry' || genre === 'wisdom') ? 'M' : (genre === 'prophecy' ? 'G' : null), addressee:(genre === 'poetry') ? 'G' : 'M', subj:null, subjLabel:'', speechVerse:-9, turned:false };
      var verses = ch.map(function(ws, vi){ return analyzeVerse(bi, ci, vi, tokens(bi, ws || []), state, genre); });
      var pers = pericopes(bi, ci, verses.length).map(function(p){
        var vs = verses.slice(p.v0, p.v1 + 1);
        var st = structure(vs, ot), fr = frame(vs, bi, ci, p, genre);
        return { v0:p.v0, v1:p.v1, head:p.head, verses:vs, structure:st, frame:fr };
      });
      return { bi:bi, ci:ci, genre:genre, genreKo:GENRE_KO[genre], pericopes:pers, nVerses:verses.length };
    }
    /* 글로 — 화면의 '복사'·'메모장에 저장'과 tools/build-exeg.js --text(66권 글 파일)가 같이 쓴다 */
    function toText(res){
      var bi = res.bi, ci = res.ci, out = [], AG = { G:'하나님의 손길', M:'인간의 응답', A:'글쓴이', O:'—' };
      function snip(vi, n){ var t = kor(bi, ci, vi) || ''; return t.length > n ? t.slice(0, n) + '…' : t; }
      out.push('원전 연구 — ' + bookName(bi) + ' ' + (ci + 1) + '장 (' + res.genreKo + ')');
      res.pericopes.forEach(function(p){
        var f = p.frame;
        out.push('', '■ ' + f.ref + (p.head ? ' 「' + p.head + '」' : ''), '중심사상: ' + f.idea, '풀이: ' + f.idea2, '설교 목적: ' + f.purpose, '', '① 본문 흐름과 원어 석의');
        p.verses.forEach(function(v){
          out.push('[' + (ci + 1) + ':' + (v.vi + 1) + '] ' + v.kor);
          v.verbs.forEach(function(r){ out.push('  · ' + r.text + ' (' + r.key + ') ' + r.gloss + ' — ' + r.morph + ' — ' + AG[r.agent] + ': ' + r.why + '\n    ' + r.nuance); });
          v.order.forEach(function(o){ out.push('  · 어순: ' + o.desc); });
          v.notes.forEach(function(n){ out.push('  · ' + n.text + ' — ' + n.desc); });
          if(v.par) out.push('  · ' + v.par.type + ': ' + v.par.a + ' || ' + v.par.b);
          if(v.inner) out.push('  · 절 안의 교차 배열: ' + v.inner.text);
          var seen = {}; v.keys.forEach(function(k){ if(seen[k.key]) return; seen[k.key] = 1; out.push('  · 열쇠말: ' + k.text + ' ' + k.lexName + ' ' + k.gloss + (k.christ ? ' → ' + k.christ : '')); });
        });
        var s = p.structure;
        out.push('', '② 히브리 문장구조');
        if(s.chiasm){ out.push(s.chiasm.desc); s.chiasm.rows.forEach(function(r){ out.push('  ' + r.label + '  ' + (ci + 1) + ':' + (r.vi + 1) + '  ' + snip(r.vi, 30) + (r.shared.length ? '  [' + r.shared.map(function(x){ return x.lemma; }).join(', ') + ']' : (r.center ? '  (중심)' : ''))); }); }
        if(s.alt){ out.push(s.alt.desc); s.alt.rows.forEach(function(r){ out.push('  ' + r.label + ' ' + (r.vi + 1) + '절 ↔ ' + r.label + '′ ' + (r.vi2 + 1) + '절  [' + r.shared.map(function(x){ return x.lemma; }).join(', ') + ']'); }); }
        if(s.inclusio) out.push('포괄: ' + (s.inclusio.vi0 + 1) + '절 ↔ ' + (s.inclusio.vi1 + 1) + '절 ' + s.inclusio.shared.map(function(x){ return x.lemma; }).join(', '));
        if(s.leit.length) out.push('열쇠말 반복: ' + s.leit.map(function(l){ return l.lemma + '×' + l.n + '(' + l.verses.map(function(v){ return v + 1; }).join(',') + '절)'; }).join(', '));
        if(!s.chiasm && !s.alt && !s.inclusio && !s.leit.length) out.push('(낱말 되풀이로 잡히는 구조 없음)');
        out.push('', '③ 구속사적 틀 — 하나님의 손길 + 인간의 응답');
        out.push('하나님의 손길: ' + (f.god.map(function(x){ return (x.vi + 1) + '절 ' + x.text + '(' + x.gloss + ')'; }).join(' | ') || '—'));
        out.push('인간의 응답: ' + (f.man.map(function(x){ return (x.vi + 1) + '절 ' + x.text + '(' + x.gloss + ')'; }).join(' | ') || '—'));
        if(f.christ.length) out.push('그리스도: ' + f.christ.map(function(c){ return c.name + ' → ' + c.christ; }).join(' / '));
        out.push('갈래: ' + f.cats.map(function(c){ return c.ko + ' ' + c.n; }).join(', '));
        out.push('', '④ 설교 개요(초안)');
        f.outline.forEach(function(o){ out.push(o.h); o.items.forEach(function(i){ out.push('  - ' + i); }); });
      });
      out.push('', '(오르(אוֹר) 원전 분석 엔진 ' + '1.0' + ' · 방법: 이정렬, 『원전 중심 구속사 설교 — 성경 해석에서 설교 작성까지』 · 자동 분석 — 설교자의 석의로 검증)');
      return out.join('\n');
    }
    /* 목차용 요약 */
    function summarize(res){
      return res.pericopes.map(function(p){
        var flags = (p.structure.chiasm ? 'X' : '') + (p.structure.alt ? 'A' : '') + (p.structure.inclusio ? 'I' : '') + (p.structure.leit.length ? 'L' : '') + (p.structure.par.length ? 'P' : '');
        return { v0:p.v0, v1:p.v1, h:p.head, i:p.frame.idea2.slice(0, 110), g:p.frame.god.length, m:p.frame.man.length, f:flags, c:p.frame.cats.slice(0, 3).map(function(c){ return c.cat; }) };
      });
    }
    return { analyze:analyze, summarize:summarize, toText:toText, pericopes:pericopes, tokens:tokens, GENRE:GENRE, GENRE_KO:GENRE_KO, CAT_KO:CAT_KO };
  }
  return { NAME:'오르', FULL:'오르(אוֹר) 원전 분석 엔진', VERSION:'1.0', create:create, parseHeb:parseHeb, parseGrk:parseGrk, explainHeb:explainHeb, explainGrk:explainGrk, GENRE:GENRE, GENRE_KO:GENRE_KO, CAT_KO:CAT_KO };
});
