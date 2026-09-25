/* 메모장 — 목록·쓰기, 연결 그래프(vis-network), 관심사 분석(통계).
   저장은 preload 의 NOTES(SQLite) 로. app.js 뒤에 읽힌다. */
var NT = (function(){
  var $ = APP.$, esc = APP.esc, toast = APP.toast, copyText = APP.copyText, showView = APP.showView, openChapter = APP.openChapter, parseRefList = APP.parseRefList, BOOKS = APP.BOOKS, st = APP.st;
  var mode = 'list', cur = null, list = [], net = null, graphData = null;

  function fmt(d){ return String(d || '').slice(0, 16).replace('T', ' '); }
  function tagsHTML(t){ return String(t || '').split(/\s+/).filter(Boolean).map(function(x){ return '<span class="r">' + esc(x) + '</span>'; }).join(''); }

  /* ── 목록 ── */
  function paintList(){
    var box = $('ntList');
    if(!list.length){ box.innerHTML = '<div class="nt-none">' + ($('ntSearch').value ? '찾는 메모가 없습니다' : '아직 메모가 없습니다.<br>＋ 새 메모 로 시작하세요') + '</div>'; return; }
    box.innerHTML = list.map(function(n){
      return '<button type="button" class="nt-item' + (cur && cur.id === n.id ? ' on' : '') + '" data-id="' + n.id + '">' +
        '<span class="t">' + esc(n.title) + '</span>' +
        (n.ref ? '<span class="r">' + esc(n.ref) + '</span>' : '') + (n.theme ? '<span class="r">' + esc(n.theme) + '</span>' : '') +
        (n.snip ? '<span class="s">' + esc(n.snip.replace(/\s+/g, ' ')) + '</span>' : '') +
        '<span class="g">' + fmt(n.updated_at) + (n.tags ? ' · ' + esc(n.tags) : '') + '</span></button>';
    }).join('');
  }
  function reload(){
    return NOTES.list($('ntSearch').value).then(function(r){ list = r || []; paintList(); });
  }

  /* ── 편집 ── */
  function edit(n){
    cur = n;
    $('ntEmpty').hidden = true; $('ntForm').hidden = false;
    $('ntRef').value = n.ref || ''; $('ntTitle').value = n.title || ''; $('ntTheme').value = n.theme || '';
    $('ntTags').value = n.tags || ''; $('ntContent').value = n.content || '';
    $('ntDelete').hidden = !n.id;
    $('ntMeta').textContent = n.id ? '만든 날 ' + fmt(n.created_at) + ' · 고친 날 ' + fmt(n.updated_at) : '새 메모';
    paintLinks();
    paintList();
    setTimeout(function(){ (n.title ? $('ntContent') : $('ntTitle')).focus(); }, 0);
  }
  function paintLinks(){
    var box = $('ntLinks'), out = [];
    var titles = {}; list.forEach(function(n){ titles[n.title] = n.id; });
    var seen = {}, m, re = /\[\[([^\[\]|#]+?)(?:[|#][^\]]*)?\]\]/g, txt = $('ntContent').value;
    while((m = re.exec(txt))){ var t = m[1].trim(); if(t && !seen[t]){ seen[t] = 1; out.push('<button type="button" class="lk' + (titles[t] ? '' : ' ghost') + '" data-t="' + esc(t) + '">→ ' + esc(t) + '</button>'); } }
    if(cur && cur.backlinks && cur.backlinks.length){
      out.push('<span>이 메모를 연결한 곳:</span>');
      cur.backlinks.forEach(function(b){ out.push('<button type="button" class="lk" data-id="' + b.id + '">← ' + esc(b.title) + '</button>'); });
    }
    box.innerHTML = out.length ? out.join('') : '<span>[[제목]] 을 적으면 여기에 연결이 나옵니다</span>';
  }
  function openById(id){ return NOTES.get(id).then(function(n){ if(n) edit(n); }); }
  function openByTitle(t){
    var hit = list.filter(function(n){ return n.title === t; })[0];
    if(hit) return openById(hit.id);
    edit({ id:0, title:t, ref:'', theme:'', tags:'', content:'' });
    toast('"' + t + '" 메모를 새로 만듭니다');
  }
  function collect(){
    return { id: cur ? cur.id : 0, ref: $('ntRef').value.trim(), title: $('ntTitle').value.trim(), theme: $('ntTheme').value.trim(),
             tags: $('ntTags').value.trim(), content: $('ntContent').value };
  }
  function save(){
    var n = collect();
    if(!n.title){ toast('제목을 적어 주세요'); $('ntTitle').focus(); return Promise.resolve(); }
    return NOTES.save(n).then(function(saved){ cur = saved; return reload(); }).then(function(){ edit(cur); toast('메모 저장됨'); graphData = null; });
  }
  function remove(){
    if(!cur || !cur.id) return;
    if(!confirm('"' + cur.title + '" 메모를 지울까요?')) return;
    NOTES.remove(cur.id).then(function(){ cur = null; $('ntForm').hidden = true; $('ntEmpty').hidden = false; graphData = null; return reload(); });
  }
  function newNote(pre){
    pre = pre || {};
    edit({ id:0, title: pre.title || '', ref: pre.ref || '', theme: pre.theme || '', tags: pre.tags || '', content: pre.content || '' });
  }

  /* ── 본문·주석에서 담기 ── */
  function fromVerses(vs, g){
    var label = g.label || (BOOKS[g.bi].n + ' ' + (g.ci+1) + ':' + (g.from+1) + (g.to > g.from ? '-' + (g.to+1) : ''));
    var body = copyText(vs.slice(0, 1), [{ bi:g.bi, ci:g.ci, from:g.from, to:g.to, label:label }]);
    showView('notes'); setMode('list');
    newNote({ ref: label, title: label, tags: g.tags || '#형태/본문', content: body + '\n\n' });
  }
  function fromComm(bi, s, text){
    var label = BOOKS[bi].n + ' ' + s[1] + ':' + s[2] + (s[3] !== s[1] || s[4] !== s[2] ? '-' + (s[3] !== s[1] ? s[3] + ':' : '') + s[4] : '');
    showView('notes'); setMode('list');
    newNote({ ref: label, title: (s[7] || label).replace(/\s*\([^)]*\)\s*$/, ''), tags: '#형태/주석', content: text + '\n\n' });
  }

  /* ── 그래프 ── */
  function paintGraph(){
    var box = $('ntGraph');
    if(!window.vis){ box.innerHTML = '<div class="nt-none">그래프 라이브러리를 읽지 못했습니다</div>'; return; }
    Promise.all([NOTES.graph(), window.HLDB ? HLDB.all() : []]).then(function(r){
      var g = r[0], hls = r[1] || [];
      graphData = g;
      var cs = getComputedStyle(document.documentElement);
      var accent = cs.getPropertyValue('--accent').trim(), fg = cs.getPropertyValue('--fg').trim(), fg3 = cs.getPropertyValue('--fg3').trim(), line = cs.getPropertyValue('--line').trim(), panel2 = cs.getPropertyValue('--panel2').trim();
      var nodes = g.nodes.map(function(n){
        return { id:n.id, label:n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label, title: n.ref ? n.ref + ' · ' + n.label : n.label,
                 value: 1 + n.deg, shape: n.ghost ? 'dot' : 'dot',
                 color: n.ghost ? { background: panel2, border: line } : { background: accent, border: accent },
                 font: { color: fg, size: 13 + Math.min(8, n.deg) }, borderWidth: n.ghost ? 1 : 2, shapeProperties: n.ghost ? { borderDashes: [4, 3] } : {} };
      });
      var edges = g.edges.map(function(e){ return { from:e.from, to:e.to, arrows:'to', color:{ color: line, highlight: accent }, width:1.2 }; });
      var extra = {};                       /* id → 누르면 할 일 */
      /* 태그 — 메모를 묶는 작은 마디 */
      var tagIds = {};
      g.nodes.forEach(function(n){
        String(n.tags || '').split(/\s+/).filter(Boolean).forEach(function(t){
          var id = 't:' + t;
          if(!tagIds[id]){ tagIds[id] = 1; nodes.push({ id:id, label:t, shape:'box', color:{ background: panel2, border: line }, font:{ color: fg3, size: 11 }, margin: 5 }); extra[id] = function(){ setMode('list'); $('ntSearch').value = t; reload(); }; }
          edges.push({ from:n.id, to:id, color:{ color: line, opacity: .6 }, width: .8, dashes: [3, 3] });
        });
      });
      /* 형광펜 — 절마다 색 점, 분류(색 이름)가 가운데 마디. 같은 절을 다루는 메모와도 잇는다 */
      if(hls.length && window.HL){
        var hv = {}; HL.COLORS.forEach(function(c){ hv[c] = cs.getPropertyValue('--hl-' + c).trim(); });
        var cats = {};
        var noteRefs = g.nodes.filter(function(n){ return n.ref; }).map(function(n){ var ps = APP.parseRefList(n.ref); return ps ? { id:n.id, ps:ps } : null; }).filter(Boolean);
        hls.forEach(function(h){
          var cid = 'c:' + h.color;
          if(!cats[cid]){ cats[cid] = 1; nodes.push({ id:cid, label:HL.nameOf(h.color), shape:'ellipse', color:{ background: hv[h.color], border: line }, font:{ color: fg, size: 13, bold: true }, value: 3 }); extra[cid] = (function(c){ return function(){ setMode('hl'); HL.setFilter(c); }; })(h.color); }
          var id = 'h:' + h.bi + ':' + h.ci + ':' + h.vi;
          nodes.push({ id:id, label:h.ref, title: APP.korText(h.bi, h.ci, h.vi), shape:'dot', size: 9, color:{ background: hv[h.color], border: hv[h.color] }, font:{ color: fg3, size: 11 } });
          extra[id] = (function(h){ return function(){ APP.openChapter(h.bi, h.ci, h.vi); }; })(h);
          edges.push({ from:id, to:cid, color:{ color: line, opacity: .7 }, width: .9 });
          noteRefs.forEach(function(nr){
            if(nr.ps.some(function(p){ return p.bi === h.bi && p.ci === h.ci && (p.from < 0 || (h.vi >= p.from && h.vi <= p.to)); }))
              edges.push({ from:nr.id, to:id, color:{ color: accent, opacity: .5 }, width: 1 });
          });
        });
      }
      var data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
      var opt = { physics: { solver:'forceAtlas2Based', forceAtlas2Based:{ gravitationalConstant:-40, springLength:120 }, stabilization:{ iterations: 150 } },
                  nodes: { scaling: { min: 12, max: 44 } }, interaction: { hover:true, tooltipDelay: 120 } };
      if(net) net.destroy();
      net = new vis.Network(box, data, opt);
      net.on('click', function(p){
        if(!p.nodes.length) return;
        if(extra[p.nodes[0]]){ extra[p.nodes[0]](); return; }
        var n = g.nodes.filter(function(x){ return x.id === p.nodes[0]; })[0]; if(!n) return;
        setMode('list');
        if(n.nid) openById(n.nid); else openByTitle(n.label);
      });
      if(!nodes.length) box.innerHTML = '<div class="nt-none">메모나 형광펜이 생기면 여기에 연결망이 그려집니다</div>';
    });
  }

  /* ── 관심사 분석 ── */
  function bars(items, key){
    if(!items.length) return '<div class="hint">아직 없음</div>';
    var max = Math.max.apply(null, items.map(function(x){ return x.c; }));
    return items.map(function(x){ return '<div class="nt-bar"><span class="n" title="' + esc(x[key]) + '">' + esc(x[key]) + '</span><span class="b"><i style="width:' + Math.round(100 * x.c / max) + '%"></i></span><span class="c">' + x.c + '</span></div>'; }).join('');
  }
  function paintStats(){
    Promise.all([NOTES.stats(), window.HLDB ? HLDB.all() : []]).then(function(r){
      var s = r[0], hls = r[1] || [];
      var hc = {}, hb = {};
      hls.forEach(function(h){ var n = HL.nameOf(h.color); hc[n] = (hc[n] || 0) + 1; var b = BOOKS[h.bi].n; hb[b] = (hb[b] || 0) + 1; });
      var hcats = Object.keys(hc).map(function(k){ return { cat:k, c:hc[k] }; }).sort(function(a, b){ return b.c - a.c; });
      var hbooks = Object.keys(hb).map(function(k){ return { book:k, c:hb[k] }; }).sort(function(a, b){ return b.c - a.c; }).slice(0, 12);
      $('ntStats').innerHTML =
        '<div class="nt-stat"><h3>형광펜</h3><div class="big">' + hls.length + '</div><div class="sub">칠한 절</div></div>' +
        '<div class="nt-stat"><h3>형광펜 분류</h3>' + bars(hcats, 'cat') + '</div>' +
        '<div class="nt-stat"><h3>형광펜 많은 성경</h3>' + bars(hbooks, 'book') + '</div>' +
        '<div class="nt-stat"><h3>메모</h3><div class="big">' + s.total + '</div><div class="sub">최근 30일 ' + s.recent + '개</div></div>' +
        '<div class="nt-stat"><h3>많이 다룬 성경</h3>' + bars(s.books, 'book') + '</div>' +
        '<div class="nt-stat"><h3>최근 30일 성경</h3>' + bars(s.recentBooks, 'book') + '</div>' +
        '<div class="nt-stat"><h3>주제</h3>' + bars(s.themes, 'theme') + '</div>' +
        '<div class="nt-stat"><h3>태그</h3>' + bars(s.tags, 'tag') + '</div>' +
        '<div class="nt-stat"><h3>많이 연결된 메모</h3>' + bars(s.linked, 'title') + '</div>';
    });
  }
  /* ── 화면 전환 ── */
  function setMode(m){
    mode = m;
    $('ntMode').querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', b.dataset.m === m); });
    $('ntListPane').hidden = m !== 'list'; $('ntGraphPane').hidden = m !== 'graph'; $('ntInsightPane').hidden = m !== 'insight'; $('ntHlPane').hidden = m !== 'hl';
    if(m === 'hl' && window.HL) HL.paintPane();
    if(m === 'graph') paintGraph();
    if(m === 'insight') paintStats();
  }
  function show(){ reload(); if(mode === 'graph') paintGraph(); if(mode === 'insight') paintStats(); if(mode === 'hl' && window.HL) HL.paintPane(); }

  /* ── 이벤트 ── */
  $('ntMode').onclick = function(e){ var b = e.target.closest('button'); if(b) setMode(b.dataset.m); };
  $('ntNew').onclick = function(){ setMode('list'); newNote(); };
  $('ntSearch').oninput = function(){ if(mode === 'hl' && window.HL) HL.paintPane(); else reload(); };
  $('ntList').onclick = function(e){ var b = e.target.closest('.nt-item'); if(b) openById(+b.dataset.id); };
  $('ntForm').onsubmit = function(e){ e.preventDefault(); save(); };
  $('ntDelete').onclick = remove;
  $('ntContent').oninput = paintLinks;
  $('ntLinks').onclick = function(e){
    var b = e.target.closest('.lk'); if(!b) return;
    var go = function(){ if(b.dataset.id) openById(+b.dataset.id); else openByTitle(b.dataset.t); };
    if(cur && JSON.stringify(collect()) !== JSON.stringify({ id:cur.id, ref:cur.ref||'', title:cur.title||'', theme:cur.theme||'', tags:cur.tags||'', content:cur.content||'' })) save().then(go); else go();
  };
  $('ntOpenRef').onclick = function(){
    var ps = parseRefList($('ntRef').value);
    if(!ps || !ps.length){ toast('좌표를 읽지 못했습니다 — 예: 창 1:1'); return; }
    var p = ps[0]; openChapter(p.bi, p.ci, p.from);
  };
  $('ntGraphFit').onclick = function(){ if(net) net.fit({ animation:true }); };
  document.addEventListener('keydown', function(e){
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && st.view === 'notes' && !$('ntForm').hidden){ e.preventDefault(); save(); }
  });

  function openNote(id, title){ setMode('list'); reload().then(function(){ if(id) openById(id); else openByTitle(title); }); }
  function searchTag(t){ setMode('list'); $('ntSearch').value = t; reload(); }
  return { show: show, fromVerses: fromVerses, fromComm: fromComm, setMode: setMode, openNote: openNote, searchTag: searchTag };
})();
