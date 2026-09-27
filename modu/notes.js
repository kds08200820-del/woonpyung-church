/* 메모장 — 목록·쓰기, 연결 그래프(vis-network), 관심사 분석(통계).
   저장은 preload 의 NOTES(SQLite) 로. app.js 뒤에 읽힌다. */
var NT = (function(){
  var $ = APP.$, esc = APP.esc, toast = APP.toast, copyText = APP.copyText, showView = APP.showView, openChapter = APP.openChapter, parseRefList = APP.parseRefList, BOOKS = APP.BOOKS, st = APP.st;
  var mode = 'list', cur = null, list = [], net = null, graphData = null;

  function fmt(d){ return String(d || '').slice(0, 16).replace('T', ' '); }

  /* ════ 옵시디언 방식 연결 ════
     [[제목]] · [[제목|보이는 글]] · [[제목#소제목]] · [[제목#^블록]] · ![[제목]] 끼워 넣기 · 별칭(머리말 aliases) ·
     대소문자 무시 · 제목 바꾸면 링크도 바뀜(저장 쪽) · 연결 안 된 언급 · [[ 자동 완성 · 읽기 보기 · 로컬 그래프 */
  var LINK_RE = /(!?)\[\[([^\[\]|#\n]+?)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g;
  var tIdx = {}, tList = [], mentionHtml = '', reading = false;
  function norm(t){ return String(t || '').trim().toLowerCase(); }
  function loadTitles(){
    if(!NOTES.titles) return Promise.resolve();
    return NOTES.titles().then(function(ts){
      tList = ts || []; tIdx = {};
      tList.forEach(function(t){ tIdx[norm(t.title)] = { id:t.id, title:t.title }; });
      tList.forEach(function(t){ (t.aliases || []).forEach(function(a){ if(!tIdx[norm(a)]) tIdx[norm(a)] = { id:t.id, title:t.title, alias:a }; }); });
    }).catch(function(){});
  }
  function resolve(t){ return tIdx[norm(t)] || null; }
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
    return Promise.all([NOTES.list($('ntSearch').value), loadTitles()]).then(function(r){ list = r[0] || []; paintList(); });
  }

  /* ── 편집 ── */
  function edit(n){
    cur = n;
    $('ntEmpty').hidden = true; $('ntForm').hidden = false;
    $('ntRef').value = n.ref || ''; $('ntTitle').value = n.title || ''; $('ntTheme').value = n.theme || '';
    $('ntTags').value = n.tags || ''; $('ntContent').value = n.content || '';
    $('ntDelete').hidden = !n.id;
    $('ntMeta').textContent = n.id ? '만든 날 ' + fmt(n.created_at) + ' · 고친 날 ' + fmt(n.updated_at) + ((n.aliases || []).length ? ' · 별칭 ' + n.aliases.join(', ') : '') : '새 메모';
    mentionHtml = ''; acClose();
    if(n.id && NOTES.mentions) NOTES.mentions(n.id).then(function(ms){
      if(cur !== n) return;
      mentionHtml = (ms || []).length ? '<span class="nt-mh">연결 안 된 언급 ' + ms.length + ':</span>' + ms.map(function(m){
        return '<span class="nt-mn"><button type="button" class="lk" data-id="' + m.id + '" title="' + esc(m.snip) + '">↔ ' + esc(m.title) + '</button>' +
          '<button type="button" class="nt-mlink" data-mid="' + m.id + '" data-name="' + esc(m.name) + '" title="그 메모의 「' + esc(m.name) + '」 을(를) [[링크]]로 바꿉니다">링크로</button></span>';
      }).join('') : '';
      paintLinks();
    });
    paintLinks();
    if(reading) paintRead();
    paintList();
    setTimeout(function(){ (n.title ? $('ntContent') : $('ntTitle')).focus(); }, 0);
  }
  function paintLinks(){
    var box = $('ntLinks'), out = [];
    var seen = {}, m, txt = $('ntContent').value; LINK_RE.lastIndex = 0;
    while((m = LINK_RE.exec(txt))){
      var t = m[2].trim(), a = (m[3] || '').slice(1), key = norm(t) + '#' + a; if(!t || seen[key]) continue; seen[key] = 1;
      var hit = resolve(t);
      out.push('<button type="button" class="lk' + (hit ? '' : ' ghost') + '" data-t="' + esc(t) + '" data-a="' + esc(a) + '">' + (m[1] ? '⧉ ' : '→ ') + esc(hit ? hit.title : t) + (a ? ' <small>#' + esc(a) + '</small>' : '') + '</button>');
    }
    if(cur && cur.backlinks && cur.backlinks.length){
      out.push('<span>이 메모를 연결한 곳:</span>');
      cur.backlinks.forEach(function(b){ out.push('<button type="button" class="lk" data-id="' + b.id + '">← ' + esc(b.title) + '</button>'); });
    }
    if(mentionHtml) out.push(mentionHtml);
    box.innerHTML = out.length ? out.join('') : '<span>[[제목]] 으로 연결 · [[제목#소제목]] · ![[제목]] 끼워 넣기 · 맨 위에 <code>---</code> / <code>aliases: [별칭]</code> / <code>---</code> 로 별칭</span>';
  }
  function openById(id){ return NOTES.get(id).then(function(n){ if(n) edit(n); }); }
  function openByTitle(t, anchor){
    var hit = resolve(t) || list.filter(function(n){ return norm(n.title) === norm(t); })[0];
    if(hit) return openById(hit.id).then(function(){ if(anchor) jump(anchor); });
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
    var renamed = 0;
    return NOTES.save(n).then(function(saved){ cur = saved; renamed = saved && saved.renamed || 0; return reload(); }).then(function(){ edit(cur); toast(renamed ? '메모 저장됨 · 다른 메모 ' + renamed + '개의 링크도 새 제목으로 바꿨습니다' : '메모 저장됨'); graphData = null; if(window.POP) try{ POP.notify('notes'); }catch(e){} });
  }
  function remove(){
    if(!cur || !cur.id) return;
    if(!confirm('"' + cur.title + '" 메모를 지울까요?')) return;
    NOTES.remove(cur.id).then(function(){ cur = null; $('ntForm').hidden = true; $('ntEmpty').hidden = false; graphData = null; if(window.POP) try{ POP.notify('notes'); }catch(e){} return reload(); });
  }
  function newNote(pre){
    pre = pre || {};
    edit({ id:0, title: pre.title || '', ref: pre.ref || '', theme: pre.theme || '', tags: pre.tags || '', content: pre.content || '' });
  }

  /* [[제목#소제목]] · [[제목#^블록]] → 그 줄로 */
  function jump(anchor){
    var ta = $('ntContent'), txt = ta.value, pos = -1, len = 0;
    if(anchor.charAt(0) === '^'){ var bi = txt.search(new RegExp('\\s\\' + anchor.replace(/[.*+?${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm')); if(bi >= 0){ pos = txt.lastIndexOf('\n', bi) + 1; len = bi - pos; } }
    else {
      var lines = txt.split('\n'), off = 0;
      for(var i = 0; i < lines.length; i++){ var h = lines[i].match(/^#{1,6}\s+(.+?)\s*#*\s*$/); if(h && norm(h[1]) === norm(anchor)){ pos = off; len = lines[i].length; break; } off += lines[i].length + 1; }
    }
    if(pos < 0){ toast('「' + anchor + '」 을(를) 이 메모에서 찾지 못했습니다'); return; }
    if(reading){ var el = $('ntRead').querySelector('[data-anchor="' + CSS.escape(norm(anchor)) + '"]'); if(el){ el.scrollIntoView({ block:'center' }); el.classList.add('nt-flash'); setTimeout(function(){ el.classList.remove('nt-flash'); }, 1600); } return; }
    ta.focus(); ta.setSelectionRange(pos, pos + len);
    var lh = parseFloat(getComputedStyle(ta).lineHeight) || 22, lineNo = txt.slice(0, pos).split('\n').length - 1;
    ta.scrollTop = Math.max(0, lineNo * lh - ta.clientHeight / 3);
  }
  /* 연결 안 된 언급을 [[링크]]로 — 그 메모 안의 제목·별칭(이미 링크인 곳 빼고)을 모두 */
  function linkMention(mid, name){
    if(!cur || !cur.id) return;
    var target = cur.title;
    NOTES.get(mid).then(function(o){
      if(!o) return;
      var re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      var parts = String(o.content || '').split(/(!?\[\[[^\]]*\]\])/), n = 0;
      for(var i = 0; i < parts.length; i += 2) parts[i] = parts[i].replace(re, function(w){ n++; return norm(w) === norm(target) ? '[[' + w + ']]' : '[[' + target + '|' + w + ']]'; });
      if(!n) return toast('바꿀 곳이 없습니다');
      return NOTES.save({ id:o.id, ref:o.ref || '', title:o.title, theme:o.theme || '', tags:o.tags || '', content:parts.join('') }).then(function(){
        toast('「' + o.title + '」 에서 ' + n + '곳을 [[' + target + ']] 로 이었습니다');
        return openById(cur.id);
      });
    });
  }
  /* ── 읽기 보기 (옵시디언의 읽기 모드) — 머리말·소제목·목록·인용·굵게·[[링크]]·![[끼워 넣기]]·#태그 ── */
  function inline(t){
    t = esc(t);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/==([^=]+)==/g, '<mark>$1</mark>');
    t = t.replace(/(^|\s)(#[^\s#,.;:!?()]+)/g, '$1<span class="nt-tag" data-tag="$2">$2</span>');
    return t;
  }
  function withLinks(line, depth){
    var out = '', last = 0, m; LINK_RE.lastIndex = 0;
    while((m = LINK_RE.exec(line))){
      out += inline(line.slice(last, m.index)); last = LINK_RE.lastIndex;
      var t = m[2].trim(), a = (m[3] || '').slice(1), hit = resolve(t), label = m[4] || (a && !m[1] ? t + ' › ' + a : (hit ? t : t));
      if(m[1] && depth < 2) out += '<div class="nt-embed" data-t="' + esc(t) + '" data-a="' + esc(a) + '" data-depth="' + (depth + 1) + '"><div class="nt-embed-h">' + esc(hit ? hit.title : t) + (a ? ' › ' + esc(a) : '') + '</div><div class="nt-embed-b">읽는 중…</div></div>';
      else out += '<a href="#" class="nt-wl' + (hit ? '' : ' ghost') + '" data-t="' + esc(t) + '" data-a="' + esc(a) + '">' + esc(label) + '</a>';
    }
    return out + inline(line.slice(last));
  }
  function md(src, depth){
    var txt = String(src || ''), html = '', fm = txt.match(/^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
    if(fm){ html += '<div class="nt-front">' + esc(fm[1]).replace(/\n/g, '<br>') + '</div>'; txt = txt.slice(fm[0].length); }
    var lines = txt.split(/\r?\n/), list = '', para = [];
    function flushP(){ if(para.length){ html += '<p>' + para.join('<br>') + '</p>'; para = []; } }
    function flushL(){ if(list){ html += '</' + list + '>'; list = ''; } }
    lines.forEach(function(raw){
      var blk = raw.match(/\s\^([A-Za-z0-9-]+)\s*$/), line = blk ? raw.slice(0, blk.index) : raw;
      var ba = blk ? ' data-anchor="' + esc('^' + blk[1].toLowerCase()) + '"' : '';
      var h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/), li = line.match(/^\s*[-*+]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/), q = line.match(/^>\s?(.*)$/);
      if(!line.trim()){ flushP(); flushL(); return; }
      if(h){ flushP(); flushL(); html += '<h' + h[1].length + ' data-anchor="' + esc(norm(h[2])) + '">' + withLinks(h[2], depth) + '</h' + h[1].length + '>'; return; }
      if(li || ol){ flushP(); var tag = li ? 'ul' : 'ol'; if(list !== tag){ flushL(); html += '<' + tag + '>'; list = tag; } html += '<li' + ba + '>' + withLinks((li || ol)[1], depth) + '</li>'; return; }
      flushL();
      if(q){ flushP(); html += '<blockquote' + ba + '>' + withLinks(q[1], depth) + '</blockquote>'; return; }
      para.push(blk ? '<span' + ba + '>' + withLinks(line, depth) + '</span>' : withLinks(line, depth));
    });
    flushP(); flushL();
    return html;
  }
  function section(content, anchor){
    if(!anchor) return String(content || '').replace(/^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
    var lines = String(content || '').split(/\r?\n/);
    if(anchor.charAt(0) === '^'){ var id = anchor.slice(1).toLowerCase(); for(var k = 0; k < lines.length; k++){ var mm = lines[k].match(/\s\^([A-Za-z0-9-]+)\s*$/); if(mm && mm[1].toLowerCase() === id) return lines[k]; } return ''; }
    var start = -1, lvl = 0;
    for(var i = 0; i < lines.length; i++){
      var h = lines[i].match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if(start < 0){ if(h && norm(h[2]) === norm(anchor)){ start = i; lvl = h[1].length; } }
      else if(h && h[1].length <= lvl) return lines.slice(start, i).join('\n');
    }
    return start >= 0 ? lines.slice(start).join('\n') : '';
  }
  function fillEmbeds(root){
    [].forEach.call(root.querySelectorAll('.nt-embed:not([data-done])'), function(el){
      el.setAttribute('data-done', '1');
      var hit = resolve(el.dataset.t), body = el.querySelector('.nt-embed-b');
      if(!hit){ body.innerHTML = '<span class="dim">아직 없는 메모입니다</span>'; return; }
      NOTES.get(hit.id).then(function(n){
        var part = n ? section(n.content, el.dataset.a) : '';
        body.innerHTML = part ? md(part, +el.dataset.depth || 1) : '<span class="dim">' + (el.dataset.a ? '「' + esc(el.dataset.a) + '」 을(를) 찾지 못했습니다' : '(내용 없음)') + '</span>';
        fillEmbeds(body);
      });
    });
  }
  function paintRead(){
    var box = $('ntRead'); if(!box) return;
    box.innerHTML = md($('ntContent').value, 0) || '<p class="dim">(내용 없음)</p>';
    fillEmbeds(box);
  }
  function setReading(on){
    reading = !!on;
    $('ntContent').hidden = reading; $('ntRead').hidden = !reading;
    $('ntReadBtn').textContent = reading ? '편집' : '읽기 보기';
    $('ntReadBtn').setAttribute('aria-pressed', reading ? 'true' : 'false');
    if(reading) paintRead(); else $('ntContent').focus();
  }
  /* ── [[ 자동 완성 ── */
  var ac = { box:null, items:[], i:0, start:0, mode:'' };
  function acClose(){ if(ac.box) ac.box.hidden = true; ac.items = []; }
  function acPaint(){
    if(!ac.items.length){ acClose(); return; }
    ac.box.innerHTML = ac.items.map(function(it, k){ return '<button type="button" class="nt-ac-it' + (k === ac.i ? ' on' : '') + '" data-k="' + k + '">' + esc(it.label) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</button>'; }).join('');
    ac.box.hidden = false;
  }
  function acUpdate(){
    var ta = $('ntContent'), before = ta.value.slice(0, ta.selectionStart), m;
    if((m = before.match(/!?\[\[([^\[\]\n|#]+)#([^\[\]\n|]*)$/))){
      var hit = resolve(m[1]); if(!hit){ acClose(); return; }
      ac.mode = 'head'; ac.start = ta.selectionStart - m[2].length;
      NOTES.get(hit.id).then(function(n){
        var q = norm(m[2]), hs = String(n && n.content || '').split('\n').map(function(l){ var h = l.match(/^#{1,6}\s+(.+?)\s*#*\s*$/); return h ? h[1] : null; }).filter(Boolean);
        ac.items = hs.filter(function(h){ return norm(h).indexOf(q) >= 0; }).slice(0, 8).map(function(h){ return { label:h, sub:'소제목', ins:h }; }); ac.i = 0; acPaint();
      });
      return;
    }
    if((m = before.match(/!?\[\[([^\[\]\n|#]*)$/))){
      ac.mode = 'title'; ac.start = ta.selectionStart - m[1].length;
      var q = norm(m[1]), seen = {}, out = [];
      Object.keys(tIdx).forEach(function(k){
        var it = tIdx[k]; if(q && k.indexOf(q) < 0) return;
        var key = it.id + '|' + (it.alias || ''); if(seen[key]) return; seen[key] = 1;
        out.push({ label:it.alias || it.title, sub:it.alias ? '별칭 → ' + it.title : '', ins:it.alias ? it.title + '|' + it.alias : it.title, rank:k.indexOf(q) });
      });
      out.sort(function(a, b){ return a.rank - b.rank || a.label.length - b.label.length; });
      if(m[1].trim() && !resolve(m[1])) out.push({ label:m[1].trim(), sub:'새 메모로 연결', ins:m[1].trim(), rank:99 });
      ac.items = out.slice(0, 9); ac.i = 0; acPaint(); return;
    }
    acClose();
  }
  function acPick(k){
    var it = ac.items[k]; if(!it) return;
    var ta = $('ntContent'), v = ta.value, end = ta.selectionStart, after = v.slice(end);
    var closeTail = after.match(/^[^\[\]\n]*\]\]/) ? '' : ']]';
    var ins = it.ins + (ac.mode === 'title' || ac.mode === 'head' ? closeTail : '');
    var cut = after.match(/^[^\[\]\n|]*\]\]/) ? after.indexOf(']]') : 0;
    ta.value = v.slice(0, ac.start) + ins + v.slice(end + (closeTail ? 0 : cut));
    var caret = ac.start + ins.length + (closeTail ? 0 : 2);
    ta.setSelectionRange(caret, caret); ta.focus(); acClose(); paintLinks();
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
  $('ntContent').oninput = function(){ paintLinks(); acUpdate(); };
  (function(){
    /* 읽기 보기·로컬 그래프 단추, 읽기 칸, 자동 완성 상자, 모양 */
    var ta = $('ntContent');
    var rd = document.createElement('div'); rd.id = 'ntRead'; rd.className = 'nt-read'; rd.hidden = true; ta.parentNode.insertBefore(rd, ta.nextSibling);
    ac.box = document.createElement('div'); ac.box.className = 'nt-ac'; ac.box.hidden = true; ta.parentNode.insertBefore(ac.box, rd);
    var ref = $('ntOpenRef');
    var rb = document.createElement('button'); rb.type = 'button'; rb.className = 'btn'; rb.id = 'ntReadBtn'; rb.textContent = '읽기 보기'; rb.title = '링크·끼워 넣기·소제목을 펼쳐 봅니다 (옵시디언 읽기 모드)';
    var kb = document.createElement('button'); kb.type = 'button'; kb.className = 'btn'; kb.id = 'ntKgBtn'; kb.textContent = '로컬 그래프'; kb.title = '이 메모 둘레의 지식 그래프';
    ref.parentNode.insertBefore(rb, ref); ref.parentNode.insertBefore(kb, ref);
    rb.onclick = function(){ setReading(!reading); };
    kb.onclick = function(){ if(!cur || !cur.id){ toast('먼저 저장해 주세요'); return; } if(APP.openKG) APP.openKG({ nid:cur.id, title:cur.title }); else if(window.KG) KG.open({ nid:cur.id, title:cur.title }); };
    rd.addEventListener('click', function(e){
      var a = e.target.closest('.nt-wl'), tg = e.target.closest('.nt-tag'), eh = e.target.closest('.nt-embed-h');
      if(a){ e.preventDefault(); var t = a.dataset.t, an = a.dataset.a; if(!resolve(t) || norm(resolve(t).title) !== norm(cur && cur.title)) openByTitle(t, an); else if(an) jump(an); }
      else if(eh){ var em = eh.parentNode; openByTitle(em.dataset.t, em.dataset.a); }
      else if(tg){ searchTag(tg.dataset.tag); }
    });
    rd.addEventListener('dblclick', function(e){ if(!e.target.closest('a,button')) setReading(false); });
    ac.box.addEventListener('mousedown', function(e){ var b = e.target.closest('.nt-ac-it'); if(b){ e.preventDefault(); acPick(+b.dataset.k); } });
    ta.addEventListener('keydown', function(e){
      if(ac.box.hidden || !ac.items.length) return;
      if(e.key === 'ArrowDown'){ e.preventDefault(); ac.i = (ac.i + 1) % ac.items.length; acPaint(); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); ac.i = (ac.i - 1 + ac.items.length) % ac.items.length; acPaint(); }
      else if(e.key === 'Enter' || e.key === 'Tab'){ e.preventDefault(); acPick(ac.i); }
      else if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); acClose(); }
    });
    ta.addEventListener('blur', function(){ setTimeout(acClose, 150); });
    ta.addEventListener('click', acUpdate);
    var st = document.createElement('style');
    st.textContent =
      '.nt-read{flex:1;min-height:220px;overflow:auto;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:var(--panel);line-height:1.8;font-size:15px}' +
      '.nt-read h1,.nt-read h2,.nt-read h3,.nt-read h4{margin:.9em 0 .35em;line-height:1.35}.nt-read h1{font-size:1.45em}.nt-read h2{font-size:1.25em}.nt-read h3{font-size:1.1em}' +
      '.nt-read p{margin:.35em 0}.nt-read ul,.nt-read ol{margin:.3em 0 .3em 1.3em;padding:0}.nt-read blockquote{margin:.5em 0;padding:4px 12px;border-left:3px solid var(--accent);color:var(--fg2)}' +
      '.nt-read code{background:var(--panel2);padding:1px 5px;border-radius:5px}.nt-read mark{background:var(--hl-yellow,#fff1a8);padding:0 2px}' +
      '.nt-wl{color:var(--accent);text-decoration:none;border-bottom:1px solid transparent;cursor:pointer}.nt-wl:hover{border-bottom-color:currentColor}.nt-wl.ghost{opacity:.6;border-bottom:1px dashed currentColor}' +
      '.nt-tag{color:var(--accent);background:var(--accent-bg);border-radius:6px;padding:0 5px;font-size:.92em;cursor:pointer}' +
      '.nt-front{font-size:12.5px;color:var(--fg3);background:var(--panel2);border-radius:8px;padding:6px 10px;margin-bottom:8px;font-family:ui-monospace,Consolas,monospace}' +
      '.nt-embed{margin:.6em 0;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;background:var(--bg);padding:6px 12px}' +
      '.nt-embed-h{font-size:12.5px;font-weight:700;color:var(--accent);cursor:pointer;margin-bottom:2px}.nt-read .dim{color:var(--fg3)}' +
      '.nt-flash{background:var(--sel,#fff3b0);transition:background .6s}' +
      '.nt-ac{position:relative;z-index:30;margin:-4px 0 4px;display:flex;flex-direction:column;max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--panel);box-shadow:var(--shadow2,0 10px 30px rgba(0,0,0,.18))}' +
      '.nt-ac-it{display:flex;justify-content:space-between;gap:10px;text-align:left;padding:7px 12px;border:0;background:none;font:inherit;font-size:14px;cursor:pointer;color:var(--fg)}' +
      '.nt-ac-it small{color:var(--fg3);font-size:12px}.nt-ac-it.on,.nt-ac-it:hover{background:var(--accent-bg);color:var(--accent)}' +
      '.nt-mh{margin-left:6px;color:var(--fg3)}.nt-mn{display:inline-flex;align-items:center;gap:2px}' +
      '.nt-mlink{border:1px dashed var(--accent);background:none;color:var(--accent);border-radius:6px;font-size:11.5px;padding:1px 6px;cursor:pointer}' +
      '#ntLinks code{background:var(--panel2);padding:0 4px;border-radius:4px}';
    document.head.appendChild(st);
  })();
  $('ntLinks').onclick = function(e){
    var ml = e.target.closest('.nt-mlink'); if(ml){ linkMention(+ml.dataset.mid, ml.dataset.name); return; }
    var b = e.target.closest('.lk'); if(!b) return;
    var go = function(){ if(b.dataset.id) openById(+b.dataset.id); else openByTitle(b.dataset.t, b.dataset.a); };
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
