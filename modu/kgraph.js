/* 지식 그래프 — 메모·[[연결]]·#태그·형광펜을 힘-배치로 그린다 (옵시디언 그래프 뷰 방식).
   검은 바탕에 흰 점·흰 선. 마디를 누르면 이어진 것들이 보라색으로 켜지고, 오른쪽에 관련 메모가 한꺼번에 펼쳐진다.
   저절로 돌지 않는다. 끌면 돌고, 휠로 확대한다. */
var KG = (function(){
  var $ = APP.$, esc = APP.esc;
  var cv, g, W = 0, H = 0, DPR = 1;
  var N = [], E = [], byId = {}, adj = {};
  var rotY = 0, rotX = 0, zoom = 1, raf = 0, last = 0, settled = 0;
  var hover = null, focus = null, dragging = false, moved = false, dx0 = 0, dy0 = 0, opener = null;
  var ro = null, running = false, hlColors = {};
  var C = { bg:'#0b0b0d', node:'#a3a3a8', nodeHub:'#c9c9cf', ghost:'#5a5a60', text:'#e6e6ea', text2:'#8e8e95',
            edge:'rgba(255,255,255,', sel:'#8b7cf6', near:'#b3a8ff', selEdge:'rgba(139,124,246,' };

  /* ── 자료 → 마디·선 ── */
  function build(){
    return Promise.all([NOTES.graph(), window.HLDB ? HLDB.all() : [], window.ACT ? ACT.list(4000) : []]).then(function(r){
      var gr = r[0], hls = r[1] || [], acts = r[2] || [];
      N = []; E = []; byId = {}; adj = {};
      function add(n){ byId[n.id] = n; adj[n.id] = []; N.push(n); return n; }
      function link(a, b, w){ if(!byId[a] || !byId[b] || a === b) return; if(adj[a].indexOf(b) >= 0) return; E.push({ a:a, b:b, w:w || 1 }); adj[a].push(b); adj[b].push(a); }
      gr.nodes.forEach(function(n){
        add({ id:n.id, kind:n.ghost ? 'ghost' : 'note', label:n.label, sub:n.ref || '', nid:n.nid, tags:n.tags, book:n.book });
      });
      gr.edges.forEach(function(e){ link(e.from, e.to, 1); });
      gr.nodes.forEach(function(n){
        String(n.tags || '').split(/\s+/).filter(Boolean).forEach(function(tg){
          var id = 't:' + tg; if(!byId[id]) add({ id:id, kind:'tag', label:'#' + tg, sub:'태그', tag:tg });
          link(n.id, id, .6);
        });
      });
      if(hls.length && window.HL){
        var cs = getComputedStyle(document.documentElement); hlColors = {};
        HL.COLORS.forEach(function(c){ hlColors[c] = cs.getPropertyValue('--hl-' + c).trim(); });
        var noteRefs = gr.nodes.filter(function(n){ return n.ref; }).map(function(n){ var ps = APP.parseRefList(n.ref); return ps ? { id:n.id, ps:ps } : null; }).filter(Boolean);
        hls.forEach(function(h){
          var cid = 'c:' + h.color;
          if(!byId[cid]) add({ id:cid, kind:'cat', label:HL.nameOf(h.color), sub:'형광펜 분류', color:hlColors[h.color] || '#e6c65a', hcolor:h.color });
          var id = 'h:' + h.bi + ':' + h.ci + ':' + h.vi;
          if(!byId[id]) add({ id:id, kind:'hl', label:h.ref, sub:APP.korText(h.bi, h.ci, h.vi), color:hlColors[h.color] || '#e6c65a', bi:h.bi, ci:h.ci, vi:h.vi });
          link(id, cid, .8);
          noteRefs.forEach(function(nr){
            if(nr.ps.some(function(p){ return p.bi === h.bi && p.ci === h.ci && (p.from < 0 || (h.vi >= p.from && h.vi <= p.to)); })) link(nr.id, id, .9);
          });
        });
      }

      /* ── 성경 기록(활동) — 읽은 장·찾은 말·지도·낱말·주석·학습·개관 ── */
      if(acts.length){
        var KN = { read:'읽은 장', search:'찾은 말', map:'본 지도', word:'찾아본 낱말', comm:'읽은 주석', study:'학습 해설', intro:'책 개관' };
        var AC = { read:'#6cc4a1', search:'#f0a35e', map:'#5fa8e8', word:'#d98ad8', comm:'#c9b458', study:'#8fb3ff', intro:'#9ad0c2' };
        var nRefs = gr.nodes.filter(function(n){ return n.ref; }).map(function(n){ var ps = APP.parseRefList(n.ref); return ps ? { id:n.id, ps:ps } : null; }).filter(Boolean);
        var chapNode = function(bi, ci){
          var id = 'a:read:' + bi + ':' + ci; if(byId[id]) return id;
          var B = APP.BOOKS[bi]; if(!B) return null;
          if(!byId['k:read']) add({ id:'k:read', kind:'akind', akind:'read', label:KN.read, sub:'성경 기록', color:AC.read });
          add({ id:id, kind:'act', akind:'read', label:B.n + ' ' + (ci + 1) + '장', sub:'', color:AC.read, count:0, lastAt:'', devices:{}, bi:bi, ci:ci, vi:-1 });
          link(id, 'k:read', .5);
          return id;
        };
        acts.forEach(function(a){
          var k = a.kind; if(!KN[k]) return;
          var d = a.data || {}, hasCh = d.bi != null && d.bi >= 0 && d.ci != null && d.ci >= 0;
          if(!hasCh && a.ref){ var ps = APP.parseRefList(String(a.ref).replace(/[–—~]/g, '-')); if(ps && ps[0]){ d = Object.assign({}, d, { bi:ps[0].bi, ci:ps[0].ci }); hasCh = true; } }
          var id = k === 'read' ? (hasCh ? chapNode(d.bi, d.ci) : null) : 'a:' + k + ':' + (k === 'comm' && hasCh ? d.bi + ':' + d.ci : a.label);
          if(!id) return;
          var hub = 'k:' + k;
          if(!byId[hub]) add({ id:hub, kind:'akind', akind:k, label:KN[k], sub:'성경 기록', color:AC[k] });
          var n = byId[id];
          if(!n) n = add({ id:id, kind:'act', akind:k, label:k === 'comm' && hasCh && APP.BOOKS[d.bi] ? APP.BOOKS[d.bi].n + ' ' + (d.ci + 1) + '장 주석' : a.label, sub:'', color:AC[k], count:0, lastAt:'', devices:{},
                           bi:hasCh ? d.bi : -1, ci:hasCh ? d.ci : -1, vi:d.vi != null ? d.vi : -1, xid:d.id || '', q:a.label });
          n.count = (n.count || 0) + 1; if(!n.lastAt || a.at > n.lastAt) n.lastAt = a.at; if(a.device) n.devices[a.device] = 1;
          link(id, hub, .5);
          if(hasCh && k !== 'read'){ var cid = chapNode(d.bi, d.ci); if(cid) link(id, cid, .7); }
        });
        /* 장 ↔ 그 장을 다룬 메모·형광펜, 찾은 말 ↔ 그 말이 제목에 든 메모 */
        N.slice().forEach(function(p){
          if(p.kind === 'act' && p.akind === 'read'){
            nRefs.forEach(function(nr){ if(nr.ps.some(function(q){ return q.bi === p.bi && q.ci === p.ci; })) link(nr.id, p.id, .8); });
            hls.forEach(function(h){ if(h.bi === p.bi && h.ci === p.ci) link('h:' + h.bi + ':' + h.ci + ':' + h.vi, p.id, .6); });
          } else if(p.kind === 'act' && p.akind === 'search' && p.q && p.q.length >= 2){
            gr.nodes.forEach(function(n){ if(!n.ghost && String(n.label || '').indexOf(p.q) >= 0) link(n.id, p.id, .5); });
          }
        });
      }
      N.forEach(function(n){
        n.deg = adj[n.id].length;
        n.r = n.kind === 'note' ? 4 + Math.min(12, Math.sqrt(n.deg) * 3) : n.kind === 'cat' ? 5 + Math.min(8, Math.sqrt(n.deg) * 2) : n.kind === 'tag' ? 3 + Math.min(6, Math.sqrt(n.deg) * 1.6) : n.kind === 'hl' ? 2.8 : n.kind === 'akind' ? 6 + Math.min(9, Math.sqrt(n.deg) * 1.4) : n.kind === 'act' ? 2.6 + Math.min(8, Math.sqrt(n.count || 1) * 1.5) : 3.5;
        n.hub = n.deg >= 3;
        var th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), rad = 120 + Math.random() * 200;
        n.x = rad * Math.sin(ph) * Math.cos(th); n.y = rad * Math.sin(ph) * Math.sin(th); n.z = rad * Math.cos(ph) * .35;   /* 납작한 구 — 정면에서 보기 좋게 */
        n.vx = n.vy = n.vz = 0;
      });
      for(var k = 0; k < 140; k++) step(1);
      settled = 0;
      FULL = { N:N, E:E, byId:byId, adj:adj };
      if(center && !FULL.byId[center.id]) center = null;
      applyView();
    });
  }


  /* ── 보기: 거르기 · 로컬 그래프 (옵시디언 그래프 보기와 같은 뜻) ── */
  var FULL = null, center = null;
  var VDEF = { note:1, tag:1, ghost:1, hl:1, act:1, orphans:1, local:0, depth:1 };
  var VIEW = (function(){ try { return Object.assign({}, VDEF, JSON.parse(localStorage.getItem('kg.view') || '{}')); } catch(e){ return Object.assign({}, VDEF); } })();
  function saveView(){ try { localStorage.setItem('kg.view', JSON.stringify(VIEW)); } catch(e){} }
  function kindOn(p){
    var k = p.kind;
    return k === 'note' ? VIEW.note : k === 'tag' ? VIEW.tag : k === 'ghost' ? VIEW.ghost : (k === 'hl' || k === 'cat') ? VIEW.hl : (k === 'act' || k === 'akind') ? VIEW.act : 1;
  }
  function applyView(){
    if(!FULL) return;
    var ok = {};
    FULL.N.forEach(function(p){ if(kindOn(p)) ok[p.id] = 1; });
    if(center && ok[center.id] === undefined) ok[center.id] = 1;         /* 가운데 마디는 늘 보인다 */
    if(VIEW.local && center && FULL.byId[center.id]){
      var keep = {}, q = [[center.id, 0]]; keep[center.id] = 1;
      while(q.length){
        var it = q.shift(); if(it[1] >= VIEW.depth) continue;
        (FULL.adj[it[0]] || []).forEach(function(id){ if(!keep[id] && ok[id]){ keep[id] = 1; q.push([id, it[1] + 1]); } });
      }
      ok = keep;
    }
    var nb = {}, na = {}, nn = [], ne = [];
    FULL.N.forEach(function(p){ if(ok[p.id]){ nb[p.id] = p; na[p.id] = []; nn.push(p); } });
    FULL.E.forEach(function(e){ if(nb[e.a] && nb[e.b]){ ne.push(e); na[e.a].push(e.b); na[e.b].push(e.a); } });
    if(!VIEW.orphans && !VIEW.local){
      nn = nn.filter(function(p){ if(na[p.id].length) return true; delete nb[p.id]; delete na[p.id]; return false; });
    }
    N = nn; E = ne; byId = nb; adj = na; settled = 0;
    if(focus && !byId[focus.id]) focus = null;
    if(hover && !byId[hover.id]) hover = null;
  }
  function syncBar(){
    var b = $('kgLocal'); if(!b) return;
    b.classList.toggle('on', !!VIEW.local); b.setAttribute('aria-pressed', VIEW.local ? 'true' : 'false');
    $('kgDepth').value = String(VIEW.depth); $('kgDepth').disabled = !VIEW.local;
    [].forEach.call(document.querySelectorAll('#kgFilterBox input[data-k]'), function(i){ i.checked = !!VIEW[i.dataset.k]; });
  }
  function reView(){ saveView(); syncBar(); applyView(); paintStats(); if(focus) select(focus); else select(null); }
  function makeBar(){
    if($('kgLocal')) return;
    var st = document.createElement('style');
    st.textContent = '.kg-vbar{display:inline-flex;align-items:center;gap:6px;position:relative}' +
      '.kg-vbar .btn.on{background:#8b7cf6;color:#fff;border-color:#8b7cf6}' +
      '.kg-vbar select{height:30px;border-radius:8px;padding:0 6px}' +
      '#kgFilterBox{position:absolute;top:calc(100% + 6px);right:0;z-index:5;background:#16161a;color:#e6e6ea;border:1px solid #2c2c33;border-radius:12px;padding:10px 12px;min-width:210px;box-shadow:0 12px 30px rgba(0,0,0,.45)}' +
      '#kgFilterBox label{display:flex;align-items:center;gap:8px;padding:5px 2px;font-size:13px;cursor:pointer}' +
      '#kgFilterBox .kgf-h{font-size:11.5px;color:#8e8e95;margin:2px 0 4px}' +
      '#kgFilterBox hr{border:0;border-top:1px solid #2c2c33;margin:6px 0}' +
      '.modal.kg-modal{z-index:210}';   /* 메모장 등 떠 있는 창 위로 */
    document.head.appendChild(st);
    var bar = document.createElement('span'); bar.className = 'kg-vbar';
    bar.innerHTML = '<button type="button" class="btn" id="kgLocal" title="고른 마디 둘레만 봅니다 (로컬 그래프)">로컬 그래프</button>' +
      '<select id="kgDepth" title="몇 단계 이웃까지 볼지"><option value="1">1단계</option><option value="2">2단계</option><option value="3">3단계</option></select>' +
      '<button type="button" class="btn" id="kgFilterBtn" aria-expanded="false">거르기 ▾</button>' +
      '<div id="kgFilterBox" hidden><div class="kgf-h">보일 것</div>' +
      '<label><input type="checkbox" data-k="note">메모</label><label><input type="checkbox" data-k="tag">태그</label>' +
      '<label><input type="checkbox" data-k="ghost">아직 없는 메모</label><label><input type="checkbox" data-k="hl">형광펜</label>' +
      '<label><input type="checkbox" data-k="act">성경 기록</label><hr><label><input type="checkbox" data-k="orphans">연결 없는 마디</label></div>';
    var anchor = $('kgSearch'); anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    $('kgLocal').onclick = function(){ VIEW.local = VIEW.local ? 0 : 1; if(VIEW.local && !center) center = focus; reView(); };
    $('kgDepth').onchange = function(){ VIEW.depth = +this.value || 1; reView(); };
    var box = $('kgFilterBox');
    $('kgFilterBtn').onclick = function(e){ e.stopPropagation(); box.hidden = !box.hidden; this.setAttribute('aria-expanded', box.hidden ? 'false' : 'true'); };
    box.addEventListener('click', function(e){ e.stopPropagation(); });
    box.addEventListener('change', function(e){ var i = e.target; if(i.dataset && i.dataset.k){ VIEW[i.dataset.k] = i.checked ? 1 : 0; reView(); } });
    document.addEventListener('click', function(){ if(!box.hidden){ box.hidden = true; $('kgFilterBtn').setAttribute('aria-expanded', 'false'); } });
    syncBar();
  }

  /* ── 힘 배치 — 자리가 잡히면 멈춘다 ── */
  function step(dt){
    var n = N.length, i, j, a, b, ddx, ddy, ddz, d2, d, f, energy = 0;
    var rep = 4200, spring = 0.01, restLen = 90, grav = 0.003, gravZ = 0.02, damp = 0.85;
    for(i = 0; i < n; i++){ a = N[i]; a.fx = -a.x * grav; a.fy = -a.y * grav; a.fz = -a.z * gravZ; }
    for(i = 0; i < n; i++){
      a = N[i];
      for(j = i + 1; j < n; j++){
        b = N[j];
        ddx = a.x - b.x; ddy = a.y - b.y; ddz = a.z - b.z;
        d2 = ddx * ddx + ddy * ddy + ddz * ddz + 40; if(d2 > 250000) continue;
        f = rep / d2; d = Math.sqrt(d2);
        ddx = ddx / d * f; ddy = ddy / d * f; ddz = ddz / d * f;
        a.fx += ddx; a.fy += ddy; a.fz += ddz; b.fx -= ddx; b.fy -= ddy; b.fz -= ddz;
      }
    }
    for(i = 0; i < E.length; i++){
      a = byId[E[i].a]; b = byId[E[i].b];
      ddx = b.x - a.x; ddy = b.y - a.y; ddz = b.z - a.z;
      d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
      f = (d - restLen * (1 + (a.r + b.r) / 24)) * spring * E[i].w;
      ddx = ddx / d * f; ddy = ddy / d * f; ddz = ddz / d * f;
      a.fx += ddx; a.fy += ddy; a.fz += ddz; b.fx -= ddx; b.fy -= ddy; b.fz -= ddz;
    }
    for(i = 0; i < n; i++){
      a = N[i];
      a.vx = (a.vx + a.fx * dt) * damp; a.vy = (a.vy + a.fy * dt) * damp; a.vz = (a.vz + a.fz * dt) * damp;
      a.x += a.vx; a.y += a.vy; a.z += a.vz;
      energy += a.vx * a.vx + a.vy * a.vy + a.vz * a.vz;
    }
    return energy / Math.max(1, n);
  }

  /* ── 투영 ── */
  function project(){
    var cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
    var cw = sidePane() ? (W - 360) / 2 : W / 2, ch = H / 2, F = 1100;
    N.forEach(function(p){
      var x = p.x * cy - p.z * sy, z = p.x * sy + p.z * cy;
      var y = p.y * cx - z * sx; z = p.y * sx + z * cx;
      var s = F / (F + z) * zoom;
      p.sx = cw + x * s; p.sy = ch + y * s; p.s = s; p.sz = z;
    });
  }
  function sidePane(){ return !$('kgSide').hidden; }

  /* ── 그리기 ── */
  function draw(now){
    if(!running) return;
    var dt = Math.min(2, (now - last) / 16.7 || 1); last = now;
    if(settled < 3){ var en = step(dt); if(en < 0.002) settled++; else settled = 0; }
    project();
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);

    var sel = focus || hover, lit = {};
    if(sel){ lit[sel.id] = 2; adj[sel.id].forEach(function(id){ lit[id] = 1; }); }

    /* 선 */
    g.lineCap = 'round';
    E.forEach(function(e){
      var a = byId[e.a], b = byId[e.b];
      var on = sel && lit[a.id] && lit[b.id];
      if(sel && !on){ g.globalAlpha = .035; g.strokeStyle = C.edge + '1)'; g.lineWidth = .6; }
      else if(on){ g.globalAlpha = .9; g.strokeStyle = C.selEdge + '1)'; g.lineWidth = 1.4 * Math.min(1.5, zoom); }
      else { g.globalAlpha = .16; g.strokeStyle = C.edge + '1)'; g.lineWidth = .7 * Math.min(1.5, zoom); }
      g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); g.stroke();
    });

    /* 마디 — 먼 것부터 */
    var order = N.slice().sort(function(a, b){ return b.sz - a.sz; });
    var labelAll = zoom >= 0.9;
    order.forEach(function(p){
      var r = p.r * p.s, col = colorOf(p), state = sel ? (lit[p.id] || 0) : -1;
      var dimmed = sel && !state;
      g.globalAlpha = dimmed ? .18 : 1;
      if(state === 2){ col = C.sel; } else if(state === 1){ col = C.near; }
      if(state === 2){ g.globalAlpha = .35; g.fillStyle = C.sel; g.beginPath(); g.arc(p.sx, p.sy, r + 7, 0, 6.283); g.fill(); g.globalAlpha = 1; }
      if(p.kind === 'ghost' && state !== 2){
        g.fillStyle = C.bg; g.beginPath(); g.arc(p.sx, p.sy, r, 0, 6.283); g.fill();
        g.setLineDash([2, 3]); g.strokeStyle = state === 1 ? C.near : col; g.lineWidth = 1; g.stroke(); g.setLineDash([]);
      } else {
        g.fillStyle = col; g.beginPath(); g.arc(p.sx, p.sy, r, 0, 6.283); g.fill();
      }
      /* 이름표 — 확대했거나, 허브·분류·선택·이웃 */
      var show = state > 0 || p === hover || (!dimmed && (p.hub || p.kind === 'cat' || p.kind === 'akind' || (labelAll && p.kind !== 'hl'))) || (state !== 0 && p.kind === 'hl' && zoom >= 1.6);
      if(show){
        var fs = Math.max(9, Math.min(17, (p.hub ? 12.5 : 11) * Math.sqrt(p.s)));
        g.font = (state === 2 ? '600 ' : '400 ') + fs + 'px -apple-system,"Segoe UI","맑은 고딕","Malgun Gothic",sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'top';
        g.globalAlpha = dimmed ? .12 : (state > 0 ? 1 : labelAll ? Math.min(.9, .35 + (zoom - .9) * 1.2 + (p.hub ? .4 : 0)) : .85);
        g.fillStyle = state === 2 ? '#ffffff' : state === 1 ? C.text : (p.kind === 'hl' ? C.text2 : C.text);
        g.fillText(p.label, p.sx, p.sy + r + 4);
      }
    });
    g.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  }
  function colorOf(p){ return p.kind === 'ghost' ? C.ghost : p.kind === 'cat' || p.kind === 'hl' || p.kind === 'act' || p.kind === 'akind' ? (p.color || '#e6c65a') : p.hub ? C.nodeHub : C.node; }

  /* ── 마우스 ── */
  function pick(mx, my){
    var best = null, bd = 1e9;
    N.forEach(function(p){ var r = Math.max(8, p.r * p.s + 4), d = (p.sx - mx) * (p.sx - mx) + (p.sy - my) * (p.sy - my); if(d < r * r && p.sz < bd){ best = p; bd = p.sz; } });
    return best;
  }
  function pos(e){ var r = cv.getBoundingClientRect(); return { x:e.clientX - r.left, y:e.clientY - r.top }; }
  function onMove(e){
    var m = pos(e);
    if(dragging){ var ddx = m.x - dx0, ddy = m.y - dy0; if(Math.abs(ddx) + Math.abs(ddy) > 3) moved = true; rotY += ddx * .005; rotX = Math.max(-1.2, Math.min(1.2, rotX + ddy * .005)); dx0 = m.x; dy0 = m.y; return; }
    var h = pick(m.x, m.y); if(h !== hover){ hover = h; cv.style.cursor = h ? 'pointer' : 'grab'; }
  }
  function onDown(e){ var m = pos(e); dragging = true; moved = false; dx0 = m.x; dy0 = m.y; cv.style.cursor = 'grabbing'; }
  function onUp(e){
    if(!dragging) return; dragging = false; cv.style.cursor = hover ? 'pointer' : 'grab';
    if(moved) return;
    var m = pos(e), p = pick(m.x, m.y);
    if(!p){ select(null); return; }
    select(p);
  }
  function onWheel(e){ e.preventDefault(); zoom = Math.max(.35, Math.min(4, zoom * (e.deltaY < 0 ? 1.1 : .91))); }
  function onDbl(e){ var m = pos(e), p = pick(m.x, m.y); if(p) act(p); }
  function act(p){
    var pw = !!(window.POP && POP.isPop);            /* 따로 뜬 창이면 그래프는 그대로 두고 메모장 창·본문 창을 움직인다 */
    if(!pw) close();
    if(p.kind === 'note' || p.kind === 'ghost'){ if(APP.openNotes) APP.openNotes({ nid:p.nid, title:p.label }); else { APP.showView('notes'); NT.openNote(p.nid, p.label); } }
    else if(p.kind === 'hl'){ APP.openChapter(p.bi, p.ci, p.vi); }
    else if(p.kind === 'act'){
      if(p.akind === 'search'){ var qi = document.getElementById('q'); if(qi){ qi.value = p.q; APP.showView('search'); qi.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true })); } }
      else if(p.akind === 'map' && window.ATLAS){ var mm = p.xid && ATLAS.byId ? ATLAS.byId(p.xid) : null; if(mm) ATLAS.open(mm); else ATLAS.openIndex(); }
      else if(p.akind === 'study' && window.STUDY){ STUDY.open(p.xid); }
      else if(p.akind === 'intro' && APP.openIntro && p.bi >= 0){ APP.openIntro(p.bi); }
      else if(p.bi >= 0){ APP.openChapter(p.bi, p.ci, p.vi >= 0 ? p.vi : undefined); }
    }
    else if(p.kind === 'tag'){ if(APP.openNotes) APP.openNotes({ tag:p.tag }); else { APP.showView('notes'); NT.searchTag(p.tag); } }
    else if(p.kind === 'cat'){ if(APP.openNotes) APP.openNotes({ hl:p.hcolor }); else { APP.showView('notes'); NT.setMode('hl'); HL.setFilter(p.hcolor); } }
  }

  /* ── 고르기 → 이웃 켜기 + 오른쪽에 관련 메모 펼치기 ── */
  var sideReq = 0;
  function select(p){
    if(VIEW.local && p && p !== center){ center = p; applyView(); paintStats(); }
    focus = p;
    var side = $('kgSide');
    if(!p){ side.hidden = true; side.innerHTML = ''; side.parentElement.classList.remove('with-side'); return; }
    side.hidden = false; side.parentElement.classList.add('with-side');
    var my = ++sideReq;
    var kindName = { note:'메모', ghost:'아직 쓰지 않은 메모', tag:'태그', cat:'형광펜 분류', hl:'형광펜 절', act:'성경 기록', akind:'성경 기록 분류' }[p.kind];
    var related = adj[p.id].map(function(id){ return byId[id]; }).filter(Boolean)
      .sort(function(a, b){ return (a.kind === 'note' ? 0 : 1) - (b.kind === 'note' ? 0 : 1) || b.deg - a.deg; });
    side.innerHTML = '<div class="kgs-head"><div class="kgs-kind">' + kindName + ' · 이어진 지식 ' + related.length + '</div>' +
      '<div class="kgs-title">' + esc(p.label) + '</div>' + (p.sub && p.kind !== 'tag' ? '<div class="kgs-ref">' + esc(p.sub) + '</div>' : '') +
      '<button type="button" class="kgs-open">' + openLabel(p) + '</button></div><div class="kgs-body"><div class="kgs-loading">읽는 중…</div></div>';
    side.querySelector('.kgs-open').onclick = function(){ act(p); };
    /* 본인 + 이웃의 메모 본문을 한꺼번에 읽는다 */
    var items = [p].concat(related);
    Promise.all(items.map(function(q){ return q.kind === 'note' && q.nid ? NOTES.get(q.nid).catch(function(){ return null; }) : Promise.resolve(null); })).then(function(notes){
      if(my !== sideReq) return;
      var body = side.querySelector('.kgs-body'), html = '';
      items.forEach(function(q, i){
        var n = notes[i], self = i === 0;
        if(q.kind === 'note'){
          html += '<article class="kgs-card' + (self ? ' self' : '') + '" data-id="' + esc(q.id) + '">' +
            '<h4>' + esc(q.label) + (self ? ' <span class="kgs-me">지금 고른 것</span>' : '') + '</h4>' +
            (n && n.ref ? '<div class="kgs-ref">' + esc(n.ref) + (n.theme ? ' · ' + esc(n.theme) : '') + '</div>' : '') +
            (n && n.content ? '<div class="kgs-text">' + esc(n.content) + '</div>' : '<div class="kgs-text dim">(내용 없음)</div>') +
            (n && n.tags ? '<div class="kgs-tags">' + String(n.tags).split(/\s+/).filter(Boolean).map(function(t){ return '<span>#' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
            '</article>';
        } else if(q.kind === 'hl'){
          html += '<article class="kgs-card hl" data-id="' + esc(q.id) + '"><h4><i style="background:' + (q.color || '#e6c65a') + '"></i>' + esc(q.label) + '</h4><div class="kgs-text">' + esc(q.sub || '') + '</div></article>';
        } else if(q.kind === 'tag'){
          if(self) return;
          html += '<article class="kgs-card tag" data-id="' + esc(q.id) + '"><h4>' + esc(q.label) + '</h4><div class="kgs-ref">이 태그가 달린 메모 ' + q.deg + '개</div></article>';
        } else if(q.kind === 'cat'){
          if(self) return;
          html += '<article class="kgs-card tag" data-id="' + esc(q.id) + '"><h4><i style="background:' + (q.color || '#e6c65a') + '"></i>' + esc(q.label) + '</h4><div class="kgs-ref">형광펜 절 ' + q.deg + '개</div></article>';
        } else if(q.kind === 'act'){
          var devs = Object.keys(q.devices || {}), when = q.lastAt ? new Date(q.lastAt) : null;
          html += '<article class="kgs-card tag" data-id="' + esc(q.id) + '"><h4><i style="background:' + (q.color || '#6cc4a1') + '"></i>' + esc(q.label) + (self ? ' <span class="kgs-me">지금 고른 것</span>' : '') + '</h4>' +
            '<div class="kgs-ref">' + (q.count ? q.count + '번' : '') + (when ? ' · 마지막 ' + (when.getMonth() + 1) + '/' + when.getDate() + ' ' + String(when.getHours()).padStart(2, '0') + ':' + String(when.getMinutes()).padStart(2, '0') : '') + (devs.length ? ' · ' + esc(devs.join(', ')) : '') + '</div></article>';
        } else if(q.kind === 'akind'){
          if(self) return;
          html += '<article class="kgs-card tag" data-id="' + esc(q.id) + '"><h4><i style="background:' + (q.color || '#6cc4a1') + '"></i>' + esc(q.label) + '</h4><div class="kgs-ref">성경 기록 ' + q.deg + '개</div></article>';
        } else if(q.kind === 'ghost'){
          html += '<article class="kgs-card ghost" data-id="' + esc(q.id) + '"><h4>' + esc(q.label) + '</h4><div class="kgs-ref">아직 쓰지 않은 메모 — 두 번 누르면 새로 씁니다</div></article>';
        }
      });
      body.innerHTML = html || '<div class="kgs-loading">이어진 지식이 없습니다</div>';
      [].forEach.call(body.querySelectorAll('.kgs-card'), function(card){
        card.onclick = function(){ var q = byId[card.dataset.id]; if(!q) return; if(q === focus) act(q); else select(q); };
      });
    });
  }
  function openLabel(p){ return p.kind === 'act' ? ({ search:'다시 찾기', map:'지도 열기', study:'해설 열기', intro:'개관 열기' }[p.akind] || '이 본문으로 가기') : p.kind === 'akind' ? '성경 기록' : p.kind === 'hl' ? '이 절로 가기' : p.kind === 'tag' ? '이 태그의 메모 찾기' : p.kind === 'cat' ? '이 분류의 형광펜 보기' : p.kind === 'ghost' ? '이 제목으로 메모 쓰기' : '메모장에서 열기'; }

  function paintStats(){
    var c = { note:0, ghost:0, tag:0, cat:0, hl:0, act:0, akind:0 }; N.forEach(function(p){ c[p.kind]++; });
    $('kgStats').innerHTML = '<b>' + c.note + '</b> 메모 · <b>' + E.length + '</b> 연결 · <b>' + c.tag + '</b> 태그 · <b>' + c.hl + '</b> 형광펜 절' + (c.act ? ' · <b>' + c.act + '</b> 성경 기록' : '') + (c.ghost ? ' · <span class="dim">아직 없는 메모 ' + c.ghost + '</span>' : '');
    $('kgEmpty').hidden = N.length > 0 || (FULL && FULL.N.length > 0);
    if(VIEW.local) $('kgStats').innerHTML += center ? ' · <span class="dim">로컬: ' + esc(center.label) + ' 둘레 ' + VIEW.depth + '단계</span>' : ' · <span class="dim">로컬: 마디를 누르면 그 둘레만 봅니다</span>';
  }
  function search(q){
    q = (q || '').trim().toLowerCase(); if(!q){ select(null); return; }
    var hit = (FULL ? FULL.N : N).filter(function(p){ return p.label.toLowerCase().indexOf(q) >= 0; }).sort(function(a, b){ return b.deg - a.deg; })[0];
    if(hit && !byId[hit.id]){ if(VIEW.local) center = hit; else { VIEW[hit.kind === 'cat' ? 'hl' : hit.kind === 'akind' ? 'act' : hit.kind] = 1; saveView(); syncBar(); } applyView(); paintStats(); }
    if(hit) select(hit);
  }

  /* ── 창 열고 닫기 ── */
  function fit(){
    var box = cv.parentElement, r = box.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1; W = Math.max(200, r.width); H = Math.max(200, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  function baseZoom(){ return Math.max(.6, Math.min(1.4, Math.min(W, H) / 640)); }
  function open(o){
    opener = document.activeElement;
    makeBar();
    cv = $('kgCanvas'); g = cv.getContext('2d');
    $('kgModal').hidden = false; fit();
    if(!ro){ ro = new ResizeObserver(fit); ro.observe(cv.parentElement); }
    hover = null; rotY = 0; rotX = 0; zoom = baseZoom(); running = true; last = 0;
    select(null); $('kgSearch').value = '';
    $('kgStats').textContent = '읽는 중…';
    build().then(function(){
      if(o && (o.nid || o.title)){
        var c = FULL.N.filter(function(p){ return (p.kind === 'note' || p.kind === 'ghost') && ((o.nid && p.nid === +o.nid) || (o.title && p.label === o.title)); })[0];
        if(c){ VIEW.local = 1; syncBar(); center = c; applyView(); select(c); }
      }
      paintStats(); cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
    });
    setTimeout(function(){ $('kgSearch').focus(); }, 0);
  }
  function close(){
    if($('kgModal').hidden) return;
    running = false; cancelAnimationFrame(raf); $('kgModal').hidden = true;
    if(opener && opener.focus) try{ opener.focus(); }catch(e){}
  }
  function init(){
    cv = $('kgCanvas');
    cv.addEventListener('mousemove', onMove); cv.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp); cv.addEventListener('mouseleave', function(){ if(!dragging) hover = null; });
    cv.addEventListener('wheel', onWheel, { passive:false }); cv.addEventListener('dblclick', onDbl);
    $('kgClose').onclick = function(){ if(window.POP && POP.isPop) POP.close(); else close(); };   /* 따로 뜬 창이면 창을 숨긴다 */
    $('kgReset').onclick = function(){ rotY = 0; rotX = 0; zoom = baseZoom(); if(VIEW.local){ center = null; applyView(); paintStats(); } select(null); };
    $('kgShuffle').onclick = function(){ N.forEach(function(p){ p.x += (Math.random() - .5) * 160; p.y += (Math.random() - .5) * 160; }); settled = 0; };
    $('kgReload').onclick = function(){ $('kgStats').textContent = '읽는 중…'; build().then(function(){ paintStats(); select(null); }); };
    $('kgSearch').oninput = function(){ search(this.value); };
    $('kgSearch').onkeydown = function(e){ if(e.key === 'Enter' && focus) act(focus); };
    $('kgLegend').innerHTML = [[C.node,'메모'],[C.sel,'고른 것과 이어진 지식'],['#e6c65a','형광펜'],[C.ghost,'아직 없는 메모']].map(function(d){
      return '<span><i style="background:' + d[0] + '"></i>' + d[1] + '</span>'; }).join('');
    var down = false, m = $('kgModal');
    m.addEventListener('mousedown', function(e){ down = (e.target === m); });
    m.addEventListener('click', function(e){ if(down && e.target === m && !(window.POP && POP.isPop)) close(); down = false; });
  }
  return { open:open, close:close, init:init, isOpen:function(){ return !$('kgModal').hidden; } };
})();
KG.init();
