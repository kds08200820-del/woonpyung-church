/* 형광펜 — 절에 색을 칠하고(오른쪽 단추), 색마다 사용자가 정한 분류 이름으로 메모장 「형광펜」 탭에서 모아 본다.
   저장은 HLDB(SQLite highlights 표). 분류 이름은 localStorage. app.js·notes.js 뒤에 읽힌다. */
var HL = (function(){
  var $ = APP.$, esc = APP.esc, toast = APP.toast, BOOKS = APP.BOOKS, st = APP.st;
  var COLORS = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple'];
  var KO = { yellow:'노랑', green:'초록', blue:'파랑', pink:'분홍', orange:'주황', purple:'보라' };
  var DEFAULT = { yellow:'은혜·위로', green:'약속', blue:'교리·진리', pink:'그리스도', orange:'명령·적용', purple:'설교 본문' };
  var NKEY = 'bibleApp.hlNames', names = {};
  try{ names = Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(NKEY) || '{}')); }catch(e){ names = Object.assign({}, DEFAULT); }
  function saveNames(){ try{ localStorage.setItem(NKEY, JSON.stringify(names)); }catch(e){} }
  function nameOf(c){ return (names[c] || '').trim() || KO[c]; }

  /* ── 본문에 칠하기 ── */
  var cache = {};                                    /* 'bi:ci' → { vi: color } */
  function key(bi, ci){ return bi + ':' + ci; }
  function paint(){
    var rows = $('reader').querySelectorAll('.vpara[data-b],.vrow[data-b]');
    if(!rows.length) return;
    var need = {};
    rows.forEach(function(r){ need[key(+r.dataset.b, +r.dataset.c)] = [+r.dataset.b, +r.dataset.c]; });
    var ks = Object.keys(need);
    Promise.all(ks.map(function(k){
      if(cache[k]) return cache[k];
      return HLDB.chapter(need[k][0], need[k][1]).then(function(list){
        var m = {}; (list || []).forEach(function(h){ m[h.vi] = h.color; });
        return (cache[k] = m);
      });
    })).then(function(){ apply(); });
  }
  function apply(){
    $('reader').querySelectorAll('.vpara[data-b],.vrow[data-b]').forEach(function(r){
      var m = cache[key(+r.dataset.b, +r.dataset.c)] || {}, c = m[+r.dataset.v];
      COLORS.forEach(function(x){ r.classList.toggle('hl-' + x, c === x); });
    });
  }
  function currentColor(g){
    var m = cache[key(g.bi, g.ci)] || {};
    return m[g.from] || null;
  }
  function refOf(bi, ci, vi){ return BOOKS[bi].n + ' ' + (ci+1) + ':' + (vi+1); }
  function setColor(g, color){
    var list = [];
    for(var v = g.from; v <= g.to; v++) list.push({ bi:g.bi, ci:g.ci, vi:v, color:color, ref:refOf(g.bi, g.ci, v) });
    var m = cache[key(g.bi, g.ci)] || (cache[key(g.bi, g.ci)] = {});
    var p = color ? HLDB.set(list) : HLDB.remove(list);
    list.forEach(function(h){ if(color) m[h.vi] = color; else delete m[h.vi]; });
    apply();
    return p.then(function(){ toast(color ? '형광펜 · ' + nameOf(color) : '형광펜 지움'); });
  }

  /* ── 오른쪽 단추 메뉴에 들어가는 색 고르기 줄 ── */
  function menuRow(g){
    var cur = currentColor(g);
    var d = document.createElement('div'); d.className = 'hl-row';
    var label = g.label || (g.from === g.to ? refOf(g.bi, g.ci, g.from) : refOf(g.bi, g.ci, g.from) + '-' + (g.to+1));
    d.innerHTML = '<div class="hl-title">🖍 형광펜 — ' + esc(label) + '</div><div class="hl-opts"></div>';
    var box = d.querySelector('.hl-opts');
    COLORS.forEach(function(c){
      var b = document.createElement('button'); b.type = 'button';
      b.className = cur === c ? 'on' : '';
      b.innerHTML = '<span class="hl-sw ' + c + '"></span>' + esc(nameOf(c));
      b.title = KO[c];
      b.onclick = function(ev){ ev.stopPropagation(); APP.closeCMenu(); setColor(g, c); };
      box.appendChild(b);
    });
    if(cur){
      var x = document.createElement('button'); x.type = 'button'; x.className = 'clear'; x.textContent = '지우기';
      x.onclick = function(ev){ ev.stopPropagation(); APP.closeCMenu(); setColor(g, null); };
      box.appendChild(x);
    }
    return d;
  }

  /* ── 메모장 「형광펜」 탭 ── */
  var filter = '';                                   /* '' = 전체, 아니면 색 */
  function paintPane(){
    Promise.all([HLDB.all(), HLDB.counts()]).then(function(r){
      var all = r[0] || [], counts = r[1] || {};
      var q = ($('ntSearch').value || '').trim().toLowerCase();
      var chips = '<button type="button" class="hl-chip' + (filter ? '' : ' on') + '" data-c="">전체 <small>' + all.length + '</small></button>';
      COLORS.forEach(function(c){
        chips += '<button type="button" class="hl-chip' + (filter === c ? ' on' : '') + '" data-c="' + c + '"><span class="hl-sw ' + c + '"></span><b>' + esc(nameOf(c)) + '</b><small>' + (counts[c] || 0) + '</small></button>';
      });
      $('hlChips').innerHTML = chips;
      $('hlChips').querySelectorAll('.hl-chip').forEach(function(b){ b.onclick = function(){ filter = b.dataset.c; paintPane(); }; });
      var list = all.filter(function(h){ return !filter || h.color === filter; }).map(function(h){
        h.text = APP.korText(h.bi, h.ci, h.vi); return h;
      }).filter(function(h){
        if(!q) return true;
        return (h.ref + ' ' + h.text + ' ' + nameOf(h.color) + ' ' + KO[h.color]).toLowerCase().indexOf(q) >= 0;
      });
      $('hlCount').textContent = list.length + '절' + (q ? ' — "' + q + '"' : '');
      if(!list.length){ $('hlList').innerHTML = '<div class="nt-none">' + (all.length ? '해당하는 형광펜이 없습니다' : '아직 칠한 곳이 없습니다.<br>본문에서 절을 오른쪽 단추로 누르고 형광펜 색을 고르세요') + '</div>'; return; }
      $('hlList').innerHTML = list.map(function(h, i){
        return '<div class="hl-item" data-i="' + i + '"><span class="bar hl-sw ' + h.color + '"></span><div class="body">' +
          '<span class="ref">' + esc(h.ref) + '</span><span class="cat">' + esc(nameOf(h.color)) + ' · ' + esc(String(h.created_at || '').slice(0, 10)) + '</span>' +
          '<div class="txt">' + esc(h.text) + '</div></div>' +
          '<div class="ops"><button type="button" data-op="note" title="이 절로 메모 만들기">메모</button><button type="button" data-op="del" title="형광펜 지우기">지움</button></div></div>';
      }).join('');
      $('hlList').querySelectorAll('.hl-item').forEach(function(el){
        var h = list[+el.dataset.i];
        el.onclick = function(e){
          var op = e.target.dataset && e.target.dataset.op;
          if(op === 'del'){ e.stopPropagation(); setColor({ bi:h.bi, ci:h.ci, from:h.vi, to:h.vi }, null).then(paintPane); return; }
          if(op === 'note'){ e.stopPropagation(); NT.setMode('list'); NT.fromVerses([{ id:'gyr', name:'개역개정' }], { bi:h.bi, ci:h.ci, from:h.vi, to:h.vi, label:h.ref, tags:'#형광펜/' + nameOf(h.color) }); return; }
          APP.openChapter(h.bi, h.ci, h.vi);
        };
      });
    });
  }

  /* ── 설정: 분류 이름 ── */
  function paintSettings(){
    var box = $('hlNames'); if(!box) return;
    box.innerHTML = COLORS.map(function(c){
      return '<label><span class="hl-sw ' + c + '"></span><small>' + KO[c] + '</small><input data-c="' + c + '" value="' + esc(names[c] || '') + '" placeholder="' + esc(DEFAULT[c]) + '" maxlength="20"></label>';
    }).join('');
    box.querySelectorAll('input').forEach(function(inp){
      inp.oninput = function(){ names[inp.dataset.c] = inp.value; saveNames(); };
    });
  }
  paintSettings();

  function setFilter(c){ filter = c || ''; paintPane(); }
  return { paint: paint, menuRow: menuRow, paintPane: paintPane, nameOf: nameOf, COLORS: COLORS, setFilter: setFilter };
})();
