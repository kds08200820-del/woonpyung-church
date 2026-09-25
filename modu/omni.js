/* 종합 검색 — 검색 창에서 성경 구절뿐 아니라 프로그램 안의 모든 자료를 한 번에 찾는다.
   지명(지도 좌표) · 지도 · 성경지도 학습 해설(지리·지형·토양·기후·고고학·역사) · 원어 사전(히브리어·헬라어) · 영어 낱말 ·
   책 개관 · 주석 · 내 노트.  결과는 구절 목록 위에 갈래별로 보이고, 누르면 그 자료를 연다. */
var OMNI = (function(){
  var $ = APP.$, esc = APP.esc;
  var MAXSHOW = 5, box = null, groups = [];

  function norm(s){ return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function has(s, q){ return norm(s).indexOf(q) >= 0; }
  function mark(s, q){
    var t = esc(String(s || '')), re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return t.replace(re, function(m){ return '<mark>' + m + '</mark>'; });
  }
  /* 맞은 자리 앞뒤로 잘라 보이는 조각 */
  function snip(s, q, len){
    s = String(s || ''); len = len || 110;
    var i = norm(s).indexOf(q); if(i < 0) return mark(s.slice(0, len) + (s.length > len ? '…' : ''), q);
    var a = Math.max(0, i - Math.round(len * .35)), b = Math.min(s.length, a + len);
    return (a > 0 ? '…' : '') + mark(s.slice(a, b), q) + (b < s.length ? '…' : '');
  }
  function firstHit(arr, q){ for(var i = 0; i < arr.length; i++){ if(has(arr[i], q)) return arr[i]; } return ''; }

  /* ── 지명 ── */
  function findPlaces(q){
    var out = [], PL = window.ATLAS_PLACES || {};
    Object.keys(PL).forEach(function(id){
      var p = PL[id]; if(!p || p[4] === 'p') return;
      if(has(p[2], q) || has(p[3], q)) out.push({ id:id, p:p });
    });
    out.sort(function(a, b){ return (norm(a.p[2]) === q ? 0 : 1) - (norm(b.p[2]) === q ? 0 : 1) || a.p[2].length - b.p[2].length; });
    var kind = { c:'도시', m:'산', w:'물', x:'위치 불확실', r:'지역' };
    return out.map(function(x){
      var maps = ATLAS.list().filter(function(m){ return (m.places || []).indexOf(x.id) >= 0; });
      if(!maps.length) maps = ATLAS.list().filter(function(m){ var b = m.bounds; return b && x.p[0] <= b[0] && x.p[0] >= b[2] && x.p[1] >= b[1] && x.p[1] <= b[3]; });
      return { t:mark(x.p[2], q) + ' <span class="om-en">' + mark(x.p[3], q) + '</span>', s:(kind[x.p[4]] || '') + ' · ' + x.p[0].toFixed(2) + '°N ' + x.p[1].toFixed(2) + '°E' + (maps.length ? ' · 지도 ' + maps.length + '장 (' + esc(maps[0].title) + ')' : ''),
        go:function(){ if(maps.length) ATLAS.openAt(maps[0], null, x.id); else APP.toast('이 지명이 실린 지도가 없습니다'); } };
    });
  }
  /* ── 지도 ── */
  function findMaps(q){
    return ATLAS.list().filter(function(m){
      return has(m.title, q) || has(m.era, q) || has(m.ref, q) || has(m.text, q) || (m.regions || []).some(function(r){ return has(r[0], q); }) || (m.routes || []).some(function(r){ return has(r.name, q); });
    }).map(function(m){
      var where = has(m.title, q) ? '' : (m.regions || []).filter(function(r){ return has(r[0], q); }).map(function(r){ return r[0]; }).join(', ');
      return { t:mark(m.title, q), s:esc(m.era || '') + (m.ref ? ' · ' + esc(m.ref) : '') + (where ? ' · 지역: ' + mark(where, q) : ''), b:has(m.text, q) ? snip(m.text, q) : '', go:function(){ ATLAS.open(m, null); } };
    });
  }
  /* ── 성경지도 학습 해설 ── */
  function findStudy(q){
    var part = { geo:'지리·지형', arch:'고고학', hist:'역사' };
    return (window.STUDY && STUDY.list ? STUDY.list() : []).map(function(a){
      var where = '', body = '';
      if(has(a.title, q) || has(a.sub, q)) where = '제목';
      else if(has(a.lead, q)){ where = '머리글'; body = snip(a.lead, q); }
      else {
        (a.sections || []).some(function(sec){
          if(has(sec.h, q)){ where = '소제목 「' + sec.h + '」'; return true; }
          var p = firstHit(sec.p || [], q); if(p){ where = '「' + sec.h + '」'; body = snip(p, q, 140); return true; }
        });
        if(!where){ var k = firstHit(a.keypoints || [], q); if(k){ where = '요점'; body = snip(k, q); } }
        if(!where){ (a.terms || []).some(function(t){ if(has(t[0], q) || has(t[1], q)){ where = '용어 ' + t[0]; body = mark(t[1], q); return true; } }); }
        if(!where){ (a.verses || []).some(function(v){ if(has(v.note, q) || has(v.ref, q)){ where = '관련 구절 ' + v.ref; body = snip(v.note, q); return true; } }); }
      }
      if(!where) return null;
      return { t:mark(a.title, q), s:(part[a.part] || '학습') + (a.sub ? ' · ' + mark(a.sub, q) : '') + (where !== '제목' ? ' · ' + esc(where) : ''), b:body, go:function(){ STUDY.open(a.id); } };
    }).filter(Boolean);
  }
  /* ── 원어 사전 ── */
  function findLex(q){
    var out = [], G = window.GRK && GRK.d, H = window.HEB && HEB.d, n = 0;
    var m = q.match(/^([gh])?\s*0*(\d{1,4})$/i), num = m ? m[2] : null, want = m && m[1] ? m[1].toLowerCase() : null;
    function push(kind, no, e){
      if(kind === 'grk') out.push({ t:'<span class="grk">' + esc(e[0]) + '</span> <span class="om-en">' + esc(e[1]) + '</span> <span class="dim">G' + no + '</span>', s:esc(e[5] || ''), b:snip(e[3], q, 120),
        go:function(){ APP.openWord({ kind:'grk', word:e[0], lemma:e[0], no:no, entry:e, morph:'', ref:'' }); } });
      else out.push({ t:'<span class="om-en">' + esc(e[0]) + '</span> <span class="dim">H' + no + ' · ' + esc(e[1]) + '</span>', s:'', b:snip(e[2], q, 140),
        go:function(){ APP.openWord({ kind:'heb', word:e[0], entries:[{ no:no, translit:e[0], pron:e[1], mean:e[2] }], morph:'', ref:'' }); } });
    }
    if(num){
      if(H && H[num] && want !== 'g') push('heb', num, H[num]);
      if(G && G[num] && want !== 'h') push('grk', num, G[num]);
      return out;
    }
    if(q.length < 2) return out;
    if(H) for(var k in H){ var e = H[k]; if(has(e[0], q) || has(e[2], q)){ push('heb', k, e); if(++n > 60) break; } }
    n = 0;
    if(G) for(var k2 in G){ var g = G[k2]; if(has(g[0], q) || has(g[1], q) || has(g[5], q) || has(g[3], q)){ push('grk', k2, g); if(++n > 60) break; } }
    /* 정확히 맞는 것을 앞으로 */
    out.sort(function(a, b){ return (a.b.indexOf('<mark>') === 0 || /^<mark>/.test(a.t) ? 0 : 1) - (b.b.indexOf('<mark>') === 0 || /^<mark>/.test(b.t) ? 0 : 1); });
    return out;
  }
  /* ── 영어 낱말 ── */
  function findEng(q){
    var D = window.DICT, out = []; if(!D || !D.ko || q.length < 2) return out;
    var latin = /^[a-z][a-z' -]*$/.test(q);
    for(var w in D.ko){
      var ko = D.ko[w];
      if(latin ? w.indexOf(q) === 0 : ko.some(function(k){ return has(k, q); })){
        out.push({ t:'<span class="om-en">' + mark(w, q) + '</span>', s:mark(ko.join(', '), q), go:(function(w){ return function(){ try{ APP.openWord({ kind:'eng', word:w, ref:'' }); }catch(e){ APP.toast(w + ' — ' + D.ko[w].join(', ')); } }; })(w) });
        if(out.length >= 40) break;
      }
    }
    out.sort(function(a, b){ return a.t.length - b.t.length; });
    return out;
  }
  /* ── 책 개관 ── */
  function findIntro(q){
    var I = window.INTRO, out = []; if(!I) return out;
    APP.BOOKS.forEach(function(b, bi){
      var d = I[b.n]; if(!d) return;
      var hit = has(b.n, q) ? ['이름', b.n] : null;
      if(!hit) for(var k in d){ var v = Array.isArray(d[k]) ? d[k].join(' ') : String(d[k]); if(has(v, q)){ hit = [k, v]; break; } }
      if(hit) out.push({ t:mark(b.n + ' 개관', q), s:esc(hit[0]), b:hit[0] === '이름' ? esc(String(d['주제'] || '').slice(0, 100)) : snip(hit[1], q), go:function(){ APP.openIntro(bi); } });
    });
    return out;
  }
  /* ── 주석 ── */
  function findComm(q){
    var C = APP.comm ? APP.comm() : null, out = []; if(!C || !C.works || q.length < 2) return out;
    C.works.forEach(function(w){
      if(!w._low) w._low = w.text.map(function(l){ return norm(l); });
      var n = 0;
      for(var i = 0; i < w._low.length && n < 12; i++){
        if(w._low[i].indexOf(q) < 0) continue;
        var sec = null;
        w.secs.forEach(function(s){ if(s[5] <= i && i < s[6] && (!sec || (s[6] - s[5]) < (sec[6] - sec[5]))) sec = s; });
        if(!sec) continue;
        n++;
        (function(sec, line){
          out.push({ t:esc(w.name) + ' <span class="dim">' + esc(APP.cmRange(sec)) + '</span>', s:esc(sec[7] || ''), b:snip(line, q, 140),
            go:function(){
              var bi = sec[0], ci = sec[1] - 1, vi = sec[2] - 1;
              APP.openChapter(bi, ci, vi);
              var hits = APP.commHits(bi, ci, vi); if(!hits.length) return;
              var wi = Math.max(0, hits.map(function(h){ return h.work; }).indexOf(w)), si = Math.max(0, hits[wi].secs.indexOf(sec));
              APP.showComm(bi, ci, vi, hits, wi, si);
            } });
        })(sec, w.text[i]);
      }
    });
    return out;
  }
  /* ── 내 노트 (비동기) ── */
  function findNotes(q, cb){
    if(!window.NOTES || !NOTES.list) return cb([]);
    NOTES.list(q).then(function(r){
      cb((r || []).slice(0, 40).map(function(n){
        return { t:mark(n.title || '(제목 없음)', q), s:esc(n.ref || '') + (n.theme ? ' · ' + esc(n.theme) : ''), b:snip(n.body || n.text || '', q),
          go:function(){ APP.showView('notes'); if(window.NT && NT.openNote) NT.openNote(n.id, n.title); } };
      }));
    }, function(){ cb([]); });
  }

  /* ── 그리기 ── */
  function paintGroup(g){
    var sh = g.open ? g.items : g.items.slice(0, MAXSHOW);
    var h = '<div class="om-g"><div class="om-h">' + esc(g.icon) + ' ' + esc(g.name) + ' <b>' + g.items.length + '</b></div>';
    h += sh.map(function(it, i){ return '<div class="om-it" data-g="' + g.key + '" data-i="' + i + '"><div class="om-t">' + it.t + '</div>' + (it.s ? '<div class="om-s">' + it.s + '</div>' : '') + (it.b ? '<div class="om-b">' + it.b + '</div>' : '') + '</div>'; }).join('');
    if(g.items.length > MAXSHOW) h += '<button type="button" class="lnk om-more" data-g="' + g.key + '">' + (g.open ? '접기' : '더 보기 (' + (g.items.length - MAXSHOW) + ')') + '</button>';
    return h + '</div>';
  }
  function paint(q){
    if(!box) return;
    var live = groups.filter(function(g){ return g.items.length; });
    if(!live.length){ box.innerHTML = ''; box.hidden = true; return; }
    var total = live.reduce(function(n, g){ return n + g.items.length; }, 0);
    box.hidden = false;
    box.innerHTML = '<div class="om-top">종합 검색 ‘' + esc(q) + '’ — ' + live.map(function(g){ return g.name + ' ' + g.items.length; }).join(' · ') + ' <span class="dim">(' + total + '건)</span></div>' + live.map(paintGroup).join('');
    [].forEach.call(box.querySelectorAll('.om-it'), function(el){ el.onclick = function(){ var g = groups.filter(function(x){ return x.key === el.dataset.g; })[0]; var it = g && g.items[+el.dataset.i]; if(it) it.go(); }; });
    [].forEach.call(box.querySelectorAll('.om-more'), function(b){ b.onclick = function(){ var g = groups.filter(function(x){ return x.key === b.dataset.g; })[0]; if(g){ g.open = !g.open; paint(q); } }; });
  }
  function clear(){ groups = []; if(box){ box.innerHTML = ''; box.hidden = true; } }
  var req = 0;
  function run(raw){
    if(!box){ box = document.createElement('div'); box.id = 'omni'; box.className = 'omni'; var hits = $('hits'); hits.parentNode.insertBefore(box, hits); }
    var q = norm(raw).replace(/^"|"$/g, ''); if(!q){ clear(); return; }
    var my = ++req;
    groups = [
      { key:'place', icon:'📍', name:'지명', items:findPlaces(q) },
      { key:'map', icon:'🗺', name:'지도', items:findMaps(q) },
      { key:'study', icon:'📚', name:'성경지도 학습(지리·지형·기후·고고학·역사)', items:findStudy(q) },
      { key:'lex', icon:'א', name:'원어 사전', items:findLex(q) },
      { key:'eng', icon:'Aa', name:'영어 낱말', items:findEng(q) },
      { key:'intro', icon:'📖', name:'책 개관', items:findIntro(q) },
      { key:'comm', icon:'✎', name:'주석', items:findComm(q) },
      { key:'note', icon:'🗒', name:'내 노트', items:[] }
    ];
    paint(raw);
    findNotes(q, function(items){ if(my !== req) return; groups[groups.length - 1].items = items; paint(raw); });
  }
  return { run:run, clear:clear };
})();
