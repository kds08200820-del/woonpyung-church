/* 스테판 원어 성경 — 원어성서원 편(허가 받아 수록)
   행간(Interlinear) 보기: 낱말마다 [스트롱 번호 / 원형 / 원문 / 대조본 / 문법 / 한글 뜻 / 영어 뜻]을 세로로 쌓는다.
   신약 원문 = 스테판 본문(TR 1550), 대조본 = 알란드(UBS3).  구약 원문 = BHS 히브리어, 대조본 = 칠십인역(모세오경).
   자료: data/stephan/b<책>.js (책마다, 필요할 때 읽음). 옵션은 줄마다 켜고 끈다(원문만 보고 싶으면 모두 끈다). */
window.STEPH = (function(){
  var $ = APP.$, esc = APP.esc;
  var OPT_KEY = 'steph.opt', ON_KEY = 'steph.on';
  var ROWS = [
    { k:'s', t:'스트롱 번호', d:true }, { k:'l', t:'원형', d:true }, { k:'a', t:'대조본', d:false, tip:'신약: 알란드(UBS3) 본문 · 구약: 칠십인역(모세오경)' },
    { k:'p', t:'문법', d:true }, { k:'k', t:'한글 뜻', d:true }, { k:'e', t:'영어 뜻(KJV)', d:false }
  ];
  var opt = {}, on = false, loading = {};
  try{ opt = JSON.parse(localStorage.getItem(OPT_KEY) || '{}'); }catch(e){}
  ROWS.forEach(function(r){ if(opt[r.k] === undefined) opt[r.k] = r.d; });
  try{ on = localStorage.getItem(ON_KEY) === '1'; }catch(e){}
  function save(){ try{ localStorage.setItem(OPT_KEY, JSON.stringify(opt)); localStorage.setItem(ON_KEY, on ? '1' : '0'); }catch(e){} }

  /* ── 책 자료 읽기 ── */
  function ensure(bi, cb){
    if(window.STEPHAN && STEPHAN[bi]) return cb(true);
    if(loading[bi]){ loading[bi].push(cb); return; }
    loading[bi] = [cb];
    /* 저장소(data/d1/stephan, 빠름)에서 먼저, 없으면 자료 서버에서 한 번 더 */
    var s = document.createElement('script'), tried = false; s.src = 'data/d1/stephan/b' + bi + '.js?v=20260926';
    s.onload = function(){ var q = loading[bi]; delete loading[bi]; q.forEach(function(f){ f(!!(window.STEPHAN && STEPHAN[bi])); }); };
    s.onerror = function(){
      if(!tried){ tried = true; var s2 = document.createElement('script'); s2.src = MODU.dataBase + 'stephan/b' + bi + '.js'; s2.onload = s.onload; s2.onerror = s.onerror; document.head.appendChild(s2); return; }
      var q = loading[bi]; delete loading[bi]; q.forEach(function(f){ f(false); });
    };
    document.head.appendChild(s);
  }

  /* ── 문법 약어 풀이 (책의 '문법분해 약어표') ── */
  var G = {
    pos:{ N:'명사', V:'동사', A:'형용사', D:'관사', P:'전치사', J:'접속사', Q:'접두사', X:'불변사', I:'감탄사' },
    cas:{ N:'주격', G:'소유격', D:'여격', A:'목적격', V:'호격' }, gen:{ M:'남성', F:'여성', N:'중성' }, num:{ S:'단수', P:'복수' },
    mood:{ I:'직설법', S:'가정법', O:'소원법', M:'명령법', N:'부정사', P:'분사', R:'명령분사' },
    tense:{ P:'현재', I:'미완료', F:'미래', A:'과거(부정과거)', R:'완료', L:'과거완료' },
    voice:{ A:'능동태', M:'중간태', P:'수동태', E:'중·수동태', D:'중간디포', O:'수동디포', N:'중·수디포' },
    adj:{ P:'형용대명사', D:'부사', R:'관계사', I:'부정사', T:'의문사', D2:'지시사', C:'기수', O:'서수', M:'비교급', S:'최상급' },
    conj:{ S:'종속접속사', C:'대등접속사', H:'우위접속사' }, pre:{ S:'문장접두사', T:'의문접두사', V:'동사접두사' }
  };
  function gkOne(c){
    if(!c) return '';
    var p = c[0], r = c.slice(1), out = [];
    function cgn(s){ var o = []; if(G.cas[s[0]]) o.push(G.cas[s[0]]); if(G.gen[s[1]]) o.push(G.gen[s[1]]); if(G.num[s[2]]) o.push(G.num[s[2]]); if(/[123]/.test(s[3] || '')) o.push(s[3] + '인칭'); return o; }
    if(p === 'N'){
      if(r[0] === 'P'){ out.push('인칭대명사'); out = out.concat(cgn(r.slice(1))); }
      else { out.push('명사'); out = out.concat(cgn(r)); }
    } else if(p === 'V'){
      out.push('동사');
      if(G.mood[r[0]]) out.push(G.mood[r[0]]);
      if(G.tense[r[1]]) out.push(G.tense[r[1]]);
      if(G.voice[r[2]]) out.push(G.voice[r[2]]);
      var rest = r.slice(3);
      if(r[0] === 'P' || r[0] === 'R') out = out.concat(cgn(rest));
      else if(rest){ if(G.num[rest[0]]) out.push(G.num[rest[0]]); if(/[123]/.test(rest[1] || '')) out.push(rest[1] + '인칭'); }
    } else if(p === 'A'){
      var k = r[0], kinds = { P:'형용대명사', D:'부사', R:'관계대명사', I:'부정대명사', T:'의문대명사', C:'기수', O:'서수', M:'비교급', S:'최상급' };
      if(k === 'P' && G.adj[r[1]] && r.length > 4){ out.push(({ R:'관계대명사', I:'부정대명사', T:'의문대명사', D:'지시대명사' })[r[1]] || '형용대명사'); out = out.concat(cgn(r.slice(2))); }
      else if(k === 'D' && r.length <= 1){ out.push('부사'); }
      else if(kinds[k] && r.length > 3){ out.push(k === 'D' ? '지시형용사' : kinds[k]); out = out.concat(cgn(r.slice(1))); }
      else if(r.length === 0){ out.push('형용사'); }
      else { out.push('형용사'); out = out.concat(cgn(r)); }
      if(c === 'AD') { out = ['부사']; }
    } else if(p === 'D'){ out.push('관사'); out = out.concat(cgn(r)); }
    else if(p === 'P'){ out.push('전치사'); if(G.cas[r[0]]) out.push(G.cas[r[0]] + ' 지배'); }
    else if(p === 'J'){ out.push(G.conj[r[0]] || '접속사'); }
    else if(p === 'Q'){ out.push(G.pre[r[0]] || '접두사'); }
    else out.push(c);
    return out.join(' ');
  }
  function gkParse(code){
    if(!code) return '';
    /* * = ~로 쓰임, & = 그리고, / = 또는, \ = 또는(사본 차이), + = 서로 연결 */
    return code.replace(/\+/g, '').split(/(\*|&|\/|\\)/).map(function(x){
      return ({ '*':' → (…로 쓰임) ', '&':' + 그리고 ', '/':' 또는 ', '\\':' 또는(사본 차이) ' })[x] || gkOne(x);
    }).join('');
  }
  var H = {
    stem:{ Q:'칼', N:'닢알', P:'피엘', U:'푸알', H:'히프일', O:'호프알', T:'히트파엘' },
    tm:{ A:'완료', I:'미완료', M:'명령형' }, gen:{ M:'남성', F:'여성', C:'공성' }, per:{ X:'1인칭', Y:'2인칭', Z:'3인칭' },
    num:{ S:'단수', P:'복수', D:'쌍수' },
    pos:{ C:'접속사', CW:'와우 연속법', P:'전치사', D:'관사', O:'목적격 표시', R:'관계사', Q:'불변사', J:'감탄사', T:'의문사', H:'방향 어미', ABN:'부정 부사' }
  };
  function hbOne(c){
    if(!c) return '';
    var m, o = [];
    var tail = (c.match(/\(([^)]+)\)$/) || [])[1]; c = c.replace(/\([^)]+\)$/, '');
    if((m = c.match(/^V([QNPUHOT])(A|I|M|NA|NG|PA|PP)([MFC]?)([XYZ]?)([SPD]?)(G?)$/))){
      o.push('동사', H.stem[m[1]] + '형', ({ A:'완료', I:'미완료', M:'명령', NA:'부정사 절대형', NG:'부정사 연계형', PA:'능동 분사', PP:'수동 분사' })[m[2]]);
      if(m[4]) o.push(H.per[m[4]]); if(m[3]) o.push(H.gen[m[3]]); if(m[5]) o.push(H.num[m[5]]); if(m[6]) o.push('연계형');
    } else if((m = c.match(/^N(P|E|Ge|S)?([MFC]?)([XYZ]?)([SPD]?)(G?)$/))){
      o.push(({ P:'인칭대명사', E:'고유명사', Ge:'인종 명사', S:'실사' })[m[1]] || '명사');
      if(m[3]) o.push(H.per[m[3]]); if(m[2]) o.push(H.gen[m[2]]); if(m[4]) o.push(H.num[m[4]]); if(m[5]) o.push('연계형');
    } else if((m = c.match(/^A(B|PT|BT|PR|PD|D|NC|NO|Ge)?([MFC]?)([SPD]?)(G?)$/))){
      o.push(({ B:'부사', PT:'의문대명사', BT:'의문부사', PR:'관계대명사', PD:'지시대명사', D:'지시형용사', NC:'기수', NO:'서수', Ge:'종족 형용사' })[m[1]] || '형용사');
      if(m[2]) o.push(H.gen[m[2]]); if(m[3]) o.push(H.num[m[3]]); if(m[4]) o.push('연계형');
    } else if(/^CX[SP]$/.test(c) || /^C[XYZ][MFC]?[SPD]$/.test(c)){
      var s = c.slice(1); o.push('대명접미사'); if(H.per[s[0]]) o.push(H.per[s[0]]); if(H.gen[s[1]]) o.push(H.gen[s[1]]); var n = s[s.length - 1]; if(H.num[n]) o.push(H.num[n]);
    } else if(H.pos[c]) o.push(H.pos[c]);
    else o.push(c);
    if(tail) o.push('(' + ({ J:'단축형', V:'자발형(J 형태)', Ch:'청유 연장형', Vh:'자발 연장형' }[tail] || tail) + ')');
    return o.join(' ');
  }
  function hbParse(code){
    if(!code) return '';
    return code.split(/(\+|\/)/).map(function(part){
      if(part === '+') return ' + ';
      if(part === '/') return ' 또는 ';
      return part.split('.').map(hbOne).filter(Boolean).join(' · ');
    }).join('');
  }
  function explain(bi, code){ return bi >= 39 ? gkParse(code) : hbParse(code); }

  /* ── 문법 약어 글자별 풀이(말풍선) ── */
  var POS = { N:'명사', V:'동사', A:'형용사', D:'관사', P:'전치사', J:'접속사', Q:'접두사', I:'감탄사' };
  var CASE = { N:'주격', G:'소유격', D:'여격', A:'목적격', V:'호격' }, GEN = { M:'남성', F:'여성', N:'중성' }, NUM = { S:'단수', P:'복수' };
  var MOOD = { I:'직설법', S:'가정법', O:'소원법', M:'명령법', N:'부정사', P:'분사', R:'명령분사' };
  var TENSE = { P:'현재', I:'미완료', F:'미래', A:'과거(부정과거)', R:'완료', L:'과거완료' };
  var VOICE = { A:'능동태', M:'중간태', P:'수동태', E:'중·수동태', D:'중간디포', O:'수동디포', N:'중·수디포' };
  function cgn(s, out){ var k = [[CASE, '격'], [GEN, '성'], [NUM, '수']]; for(var i = 0; i < 3 && i < s.length; i++) out.push([s[i], k[i][0][s[i]] || '?']); if(/[123]/.test(s[3] || '')) out.push([s[3], s[3] + '인칭']); }
  function gkParts(c){
    var out = [], r = c.slice(1), p = c[0];
    if(p === 'N' && r[0] === 'P'){ out.push(['NP', '인칭대명사']); r = r.slice(1);
      if(/^[NGDAV][SP][123]$/.test(r)){ out.push([r[0], CASE[r[0]]]); out.push([r[1], NUM[r[1]]]); out.push([r[2], r[2] + '인칭']); } else cgn(r, out); return out; }
    if(p === 'N'){ out.push(['N', '명사']); cgn(r, out); return out; }
    if(p === 'D'){ out.push(['D', '관사']); cgn(r, out); return out; }
    if(p === 'V'){
      out.push(['V', '동사']); out.push([r[0], MOOD[r[0]] || '?']); out.push([r[1], TENSE[r[1]] || '?']); out.push([r[2], VOICE[r[2]] || '?']);
      var rest = r.slice(3);
      if(r[0] === 'P' || r[0] === 'R') cgn(rest, out);
      else { if(rest[0]) out.push([rest[0], NUM[rest[0]] || '?']); if(rest[1]) out.push([rest[1], rest[1] + '인칭']); }
      return out;
    }
    if(p === 'A'){
      if(c === 'AD'){ return [['AD', '부사']]; }
      var kinds = { P:'형용대명사', R:'관계사', I:'부정사(不定)', T:'의문사', D:'지시사', C:'기수', O:'서수', M:'비교급', S:'최상급' };
      out.push(['A', '형용사']);
      if(kinds[r[0]] && r.length > 3){ out.push([r[0], kinds[r[0]]]); r = r.slice(1); if(kinds[r[0]] && r.length > 3){ out.push([r[0], kinds[r[0]]]); r = r.slice(1); } }
      cgn(r, out); return out;
    }
    if(p === 'P'){ out.push(['P', '전치사']); if(CASE[r[0]]) out.push([r[0], CASE[r[0]] + ' 지배']); return out; }
    if(p === 'J'){ out.push(['J', '접속사']); if(r[0]) out.push([r[0], ({ S:'종속접속사', C:'대등접속사', H:'우위접속사' })[r[0]] || '?']); return out; }
    if(p === 'Q'){ out.push(['Q', '접두사']); if(r[0]) out.push([r[0], ({ S:'문장접두사', T:'의문접두사', V:'동사접두사' })[r[0]] || '?']); return out; }
    return [[c, POS[p] || c]];
  }
  var HSTEM = { Q:'칼', N:'닢알', P:'피엘', U:'푸알', H:'히프일', O:'호프알', T:'히트파엘' }, HPER = { X:'1인칭', Y:'2인칭', Z:'3인칭' }, HGEN = { M:'남성', F:'여성', C:'공성' }, HNUM = { S:'단수', P:'복수', D:'쌍수' };
  function hbParts(c){
    var out = [], m, tail = (c.match(/\(([^)]+)\)$/) || [])[1]; c = c.replace(/\([^)]+\)$/, '');
    if((m = c.match(/^V([QNPUHOT])(A|I|M|NA|NG|PA|PP)([MFC]?)([XYZ]?)([SPD]?)(G?)$/))){
      out.push(['V', '동사'], [m[1], HSTEM[m[1]] + '형'], [m[2], ({ A:'완료', I:'미완료', M:'명령', NA:'부정사 절대형', NG:'부정사 연계형', PA:'능동 분사', PP:'수동 분사' })[m[2]]]);
      if(m[3]) out.push([m[3], HGEN[m[3]]]); if(m[4]) out.push([m[4], HPER[m[4]]]); if(m[5]) out.push([m[5], HNUM[m[5]]]); if(m[6]) out.push(['G', '연계형']);
    } else if((m = c.match(/^N(P|E|Ge|S)?([MFC]?)([XYZ]?)([SPD]?)(G?)$/))){
      out.push(['N' + (m[1] || ''), ({ P:'인칭대명사', E:'고유명사', Ge:'인종 명사', S:'실사' })[m[1]] || '명사']);
      if(m[2]) out.push([m[2], HGEN[m[2]]]); if(m[3]) out.push([m[3], HPER[m[3]]]); if(m[4]) out.push([m[4], HNUM[m[4]]]); if(m[5]) out.push(['G', '연계형']);
    } else if((m = c.match(/^A(B|PT|BT|PR|PD|D|NC|NO|Ge)?([MFC]?)([SPD]?)(G?)$/))){
      out.push(['A' + (m[1] || ''), ({ B:'부사', PT:'의문대명사', BT:'의문부사', PR:'관계대명사', PD:'지시대명사', D:'지시형용사', NC:'기수', NO:'서수', Ge:'종족 형용사' })[m[1]] || '형용사']);
      if(m[2]) out.push([m[2], HGEN[m[2]]]); if(m[3]) out.push([m[3], HNUM[m[3]]]); if(m[4]) out.push(['G', '연계형']);
    } else if(/^C[XYZ][MFC]?[SPD]$/.test(c)){
      out.push(['C', '대명접미사']); out.push([c[1], HPER[c[1]]]); if(c.length === 4) out.push([c[2], HGEN[c[2]]]); out.push([c[c.length - 1], HNUM[c[c.length - 1]]]);
    } else out.push([c, ({ C:'접속사', CW:'와우 연속법', P:'전치사', D:'관사', O:'목적격 표시', R:'관계사', Q:'불변사', J:'감탄사', T:'의문사', H:'방향 어미', ABN:'부정 부사' })[c] || c]);
    if(tail) out.push(['(' + tail + ')', ({ J:'단축형', V:'자발형', Ch:'청유 연장형', Vh:'자발 연장형' })[tail] || tail]);
    return out;
  }
  function tipHtml(bi, code){
    var h = '<div class="ptip-code">' + esc(code) + '</div>';
    var sepName = { '*':'…로 쓰임(기능)', '&':'그리고(동시에)', '/':'또는', '\\':'또는(사본 차이)', '+':'서로 연결', '.':'·' };
    var parts = bi >= 39 ? code.replace(/\+/g, '').split(/([*&\/\\])/) : code.split(/([+\/.])/);
    parts.forEach(function(x){
      if(!x) return;
      if(sepName[x]){ if(x !== '.') h += '<div class="ptip-sep">' + esc(x) + ' ' + sepName[x] + '</div>'; return; }
      var ps = bi >= 39 ? gkParts(x) : hbParts(x);
      h += '<div class="ptip-row">' + ps.map(function(q){ return '<span class="ptip-c"><b>' + esc(q[0]) + '</b>' + esc(q[1] || '') + '</span>'; }).join('') + '</div>';
    });
    h += '<div class="ptip-sum">' + esc(explain(bi, code)) + '</div>';
    return h;
  }
  var tipEl = null;
  function showTip(el, bi){
    if(!tipEl){ tipEl = document.createElement('div'); tipEl.className = 'ptip'; document.body.appendChild(tipEl); }
    tipEl.innerHTML = tipHtml(bi, el.dataset.code); tipEl.hidden = false;
    var r = el.getBoundingClientRect(), w = tipEl.offsetWidth, hgt = tipEl.offsetHeight;
    var x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    var y = r.top - hgt - 10; if(y < 8) y = r.bottom + 10;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function hideTip(){ if(tipEl) tipEl.hidden = true; }
  window.addEventListener('scroll', hideTip, true);

  /* ── 그리기 ── */
  function toolbar(){
    var bar = $('stephBar');
    bar.hidden = !on;
    if(!on) return;
    var bi = APP.st.bi;
    bar.innerHTML = '<b class="sb-title">스테판 원어 성경</b>' + ROWS.map(function(r){
      var t = r.k === 'a' ? (bi >= 39 ? '알란드 본문' : '칠십인역') : r.t;
      return '<label class="sb-opt" title="' + esc(r.tip || '') + '"><input type="checkbox" data-k="' + r.k + '"' + (opt[r.k] ? ' checked' : '') + '> ' + esc(t) + '</label>';
    }).join('') + '<button type="button" class="btn sb-min" id="sbOnly" title="모든 줄을 끄고 원문만 봅니다">원문만</button><button type="button" class="btn sb-min" id="sbAll">모두</button>';
    [].forEach.call(bar.querySelectorAll('input[data-k]'), function(x){ x.onchange = function(){ opt[x.dataset.k] = x.checked; save(); APP.render(); }; });
    $('sbOnly').onclick = function(){ ROWS.forEach(function(r){ opt[r.k] = false; }); save(); APP.render(); };
    $('sbAll').onclick = function(){ ROWS.forEach(function(r){ opt[r.k] = true; }); save(); APP.render(); };
  }
  function render(r, bi, ci, vi){
    toolbar();
    r.innerHTML = '<div class="empty">스테판 원어 성경을 읽는 중…</div>';
    ensure(bi, function(ok){
      if(APP.st.bi !== bi || APP.st.ci !== ci) return;
      var B = ok && STEPHAN[bi], ch = B && B.w[ci];
      if(!ok){ APP.toast('스테판 원어 성경 자료를 읽지 못해 일반 본문으로 돌아갑니다'); setOn(false); return; }   /* 자료가 없으면 켜진 채로 두지 않는다 — 체크와 화면이 어긋나지 않게 */
      if(!ch || !ch.length){ r.innerHTML = '<div class="empty">이 장은 스테판 원어 성경 자료에 없습니다.</div>'; return; }
      var ot = bi < 39;   /* 한글 본문은 위의 sv-base(개역개정 등) 줄로만 보인다 — 예전 kor 줄은 같은 글이 두 번 찍혔다 */
      var h = '<div class="readwrap steph' + (ot ? ' ot' : ' nt') + '">';
      ch.forEach(function(ws, i){
        var hit = i === vi ? ' vhit' : '';
        h += '<div class="sv' + hit + '" data-b="' + bi + '" data-c="' + ci + '" data-v="' + i + '">';
        h += '<div class="sv-no">' + (ci + 1) + ':' + (i + 1) + '</div>';
        (APP.verseTexts ? APP.verseTexts(bi, ci, i) : []).forEach(function(bt, k){ h += '<div class="sv-base' + (k ? ' extra' : '') + (bt[2] === 'wlc' ? ' heb' : bt[2] === 'grk' ? ' grk' : '') + '"' + (bt[2] === 'wlc' ? ' dir="rtl"' : '') + '><span class="sv-bn">' + esc(bt[0]) + '</span>' + esc(bt[1]) + '</div>'; });
        if(!ws.length) h += '<div class="sv-none">(이 절은 원어성경 자료에 없습니다)</div>';
        h += '<div class="sv-words"' + (ot ? ' dir="rtl"' : '') + '>';
        ws.forEach(function(w, j){
          var txt = w[2] || '';
          var mark = /</.test(txt); txt = txt.replace(/</g, '');
          var gap = /^-+$/.test(txt);
          h += '<div class="stw' + (gap ? ' gap' : '') + '" data-i="' + j + '">';
          if(opt.s) h += '<span class="stw-s">' + esc(w[0]) + '</span>';
          if(opt.l) h += '<span class="stw-l"' + (ot ? ' dir="rtl"' : '') + '>' + esc(w[1]) + '</span>';
          h += '<span class="stw-t' + (ot ? ' heb' : ' grk') + '"' + (ot ? ' dir="rtl"' : '') + '>' + (gap ? '—' : esc(txt)) + (mark ? '<sup class="stw-m" title="두 본문(스테판·알란드)이 다른 곳">*</sup>' : '') + '</span>';
          if(opt.a && w[3]) h += '<span class="stw-a">' + esc(/^-+$/.test(w[3]) ? '—' : w[3]) + '</span>';
          if(opt.p && w[4]) h += '<span class="stw-p" data-code="' + esc(w[4]) + '">' + esc(w[4]) + '</span>';
          if(opt.k) h += '<span class="stw-k">' + esc(w[5] || '') + '</span>';
          if(opt.e) h += '<span class="stw-e">' + esc(w[6] || '') + '</span>';
          h += '</div>';
        });
        h += '</div></div>';
      });
      h += '</div>';
      r.innerHTML = h;
      [].forEach.call(r.querySelectorAll('.stw-p'), function(el){ el.onmouseenter = function(){ showTip(el, bi); }; el.onmouseleave = hideTip; });
      [].forEach.call(r.querySelectorAll('.stw'), function(el){ el.onclick = function(e){ e.stopPropagation(); wordInfo(el, bi, ci); }; });
      var t = r.querySelector('.vhit'); if(t) t.scrollIntoView({ block:'center' }); else r.scrollTop = 0;
    });
  }
  function wordInfo(el, bi, ci){
    var sv = el.closest('.sv'), vi = +sv.dataset.v, w = STEPHAN[bi].w[ci][vi][+el.dataset.i]; if(!w) return;
    var no = String(w[0] || '').replace(/[^\d]/g, ''), ref = APP.ref(bi, ci, vi);
    var info;
    if(bi >= 39){
      info = { kind:'grk', word:(w[2] || '').replace(/</g, ''), lemma:w[1], no:no, entry:APP.grkEntry(no), morph:gkParse(w[4]) + (w[5] ? ' — ' + w[5] : ''), raw:w[4], ref:ref };
    } else {
      var d = APP.hebEntry(no);
      info = { kind:'heb', word:w[2], entries:[{ no:no, translit:d ? d[0] : '', pron:d ? d[1] : '', mean:d ? d[2] : '' }], morph:hbParse(w[4]) + ' (' + w[4] + ')' + (w[5] ? ' — ' + w[5] : ''), ref:ref };
    }
    APP.openWord(info);
  }
  function setOn(v){
    on = !!v; save(); $('stephBtn').classList.toggle('on', on); $('stephBtn').setAttribute('aria-pressed', on ? 'true' : 'false'); $('stephBar').hidden = !on;
    if(typeof syncVersionUI === 'function') syncVersionUI();   /* 함께 볼 성경 목록의 체크도 같이 맞춘다 */
    APP.render();
  }
  function init(){
    $('stephBtn').onclick = function(){ setOn(!on); APP.toast(on ? '스테판 원어 성경으로 봅니다 — 위 줄에서 보일 항목을 고르세요' : '일반 본문으로 돌아왔습니다'); };
    $('stephBtn').classList.toggle('on', on);
  }
  return { init:init, active:function(){ return on; }, render:render, setOn:setOn, explain:explain, ensure:ensure, tipHtml:tipHtml };
})();
STEPH.init();
