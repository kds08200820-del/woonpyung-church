/* 지도 비교 — 같은 지역의 두 시대 지도를 나란히 놓고 통치 구조·지명·사건이 어떻게 달라졌는지 본다 (성경연구 메뉴)
   · 왼쪽·오른쪽 지도를 고르면 같은 범위로 맞춰 그린다 (ATLAS.renderTo)
   · 오른쪽 목록 맨 위에 '같은 지역 · 다른 시대' 추천 (겹치는 범위가 넓고 성경 순서가 먼 것)
   · 아래에 두 지도의 해설, 그리고 지명 비교(왼쪽에만 · 양쪽 모두 · 오른쪽에만)
   · 지도를 누르면 그 지도를 크게 연다 */
var MAPCMP = (function(){
  var $ = APP.$, esc = APP.esc, BOOKS = APP.BOOKS;
  var box = null, L = null, R = null, same = true, ro = null, opener = null;

  function maps(){ return (window.ATLAS && ATLAS.list ? ATLAS.list() : window.ATLAS_MAPS || []).filter(function(m){ return m.bounds; }); }
  function firstRef(m){ var r = (m.match || [])[0]; return r ? r[0] * 1000 + r[1] : 99999; }
  function refLabel(m){ var r = (m.match || [])[0]; return r && BOOKS[r[0]] ? BOOKS[r[0]].n + ' ' + r[1] + (r[2] !== r[1] ? '-' + r[2] : '') + '장' : '개관'; }
  function area(b){ return Math.max(1e-9, (b[0] - b[2]) * (b[3] - b[1])); }
  function overlap(a, b){
    var n = Math.min(a[0], b[0]), s = Math.max(a[2], b[2]), w = Math.max(a[1], b[1]), e = Math.min(a[3], b[3]);
    if(n <= s || e <= w) return 0;
    var o = (n - s) * (e - w); return o / Math.max(area(a), area(b));     /* 1 = 같은 범위 */
  }
  var RULE = /왕국|제국|지파|시대|나라|통치|분열|통일|정복|포로|귀환|분할|영토/;   /* 통치 구조를 다루는 지도끼리 먼저 */
  function suggest(m){
    if(!m) return [];
    return maps().filter(function(x){ return x !== m && overlap(x.bounds, m.bounds) >= .25; })
      .map(function(x){ return { m:x, s:overlap(x.bounds, m.bounds) * 2 + Math.min(1, Math.abs(firstRef(x) - firstRef(m)) / 20000) + (x.base === m.base ? .3 : 0) + (RULE.test(x.title) && RULE.test(m.title) ? 1.2 : 0) }; })
      .sort(function(a, b){ return b.s - a.s; }).slice(0, 12).map(function(o){ return o.m; });
  }
  function options(sel, list, rec){
    var all = maps().slice().sort(function(a, b){ return firstRef(a) - firstRef(b); });
    var h = sel && sel.id === 'mcRSel' ? '<optgroup label="현대"><option value="__modern">현대지도</option></optgroup>' : '';
    if(rec && rec.length) h += '<optgroup label="추천">' + rec.map(function(m){ return '<option value="' + esc(m.id) + '">' + esc(m.title) + ' — ' + esc(refLabel(m)) + '</option>'; }).join('') + '</optgroup>';
    h += '<optgroup label="모든 지도">' + all.map(function(m){ return '<option value="' + esc(m.id) + '">' + esc(m.title) + ' — ' + esc(refLabel(m)) + '</option>'; }).join('') + '</optgroup>';
    sel.innerHTML = h;
  }
  function union(a, b){ return [Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3])]; }
  function placeName(id){ var p = window.ATLAS_PLACES && ATLAS_PLACES[id]; return p ? String(p[2] || id) : id; }
  function placesOf(m){ var o = {}; (m.places || []).forEach(function(id){ var p = window.ATLAS_PLACES && ATLAS_PLACES[id]; if(p && p[4] !== 'p') o[id] = 1; }); (m.marks || []).forEach(function(k){ if(k && k[0]) o[k[0]] = 1; }); return o; }
  function chips(ids){ return ids.length ? ids.map(function(id){ return '<span class="mc-chip">' + esc(placeName(id)) + '</span>'; }).join('') : '<span class="mc-dim">없음</span>'; }


  /* ════ 현대 세계 지도 — 오늘의 나라·도시와 옛 성경 지명을 겹쳐 본다 (자료: data/world-countries.js · world-cities.js) ════ */
  var MOD = { id:'__modern', title:'현대지도', modern:true };
  var mv = { lat:32, lon:35, k:60 }, overlay = true, worldP = null, mDrag = null, mRaf = 0;
  function loadWorld(){
    if(window.WORLD_COUNTRIES && window.WORLD_CITIES) return Promise.resolve();
    if(worldP) return worldP;
    var base = /\/modu\//.test(location.pathname) ? 'data/d1/' : '../data/';
    function one(f){ return new Promise(function(res, rej){ var sc = document.createElement('script'); sc.src = base + f + '?v=20260927'; sc.onload = res; sc.onerror = function(){ worldP = null; rej(new Error(f)); }; document.head.appendChild(sc); }); }
    worldP = Promise.all([one('world-countries.js'), one('world-cities.js')]).then(function(){
      WORLD_COUNTRIES.forEach(function(c){
        var a = 180, b = 90, x = -180, y = -90;
        c.p.forEach(function(poly){ poly.forEach(function(r){ for(var i = 0; i < r.length; i += 2){ if(r[i] < a) a = r[i]; if(r[i] > x) x = r[i]; if(r[i + 1] < b) b = r[i + 1]; if(r[i + 1] > y) y = r[i + 1]; } }); });
        c.bb = [a, b, x, y];
      });
    });
    return worldP;
  }
  function mcos(){ return Math.cos(Math.max(-70, Math.min(70, mv.lat)) * Math.PI / 180); }
  function mxy(lat, lon, W, H){ return { x:W / 2 + (lon - mv.lon) * mv.k * mcos(), y:H / 2 - (lat - mv.lat) * mv.k }; }
  function mll(x, y, W, H){ return { lon:mv.lon + (x - W / 2) / (mv.k * mcos()), lat:mv.lat - (y - H / 2) / mv.k }; }
  function mFit(b, W, H){ mv.lat = (b[0] + b[2]) / 2; mv.lon = (b[1] + b[3]) / 2; mv.k = Math.min((W - 40) / ((b[3] - b[1]) * mcos()), (H - 40) / (b[0] - b[2])); }
  function mMinK(W, H){ return Math.min(W / 360, H / 170) * .95; }        /* 이만큼 줄이면 전 세계가 다 보인다 */
  function inRing(r, lon, lat){ var ins = false; for(var i = 0, j = r.length - 2; i < r.length; j = i, i += 2){ var xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]; if(((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
  function countryAt(lat, lon){
    if(!window.WORLD_COUNTRIES) return null;
    for(var i = 0; i < WORLD_COUNTRIES.length; i++){
      var c = WORLD_COUNTRIES[i], b = c.bb; if(lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      for(var p = 0; p < c.p.length; p++) if(inRing(c.p[p][0], lon, lat)){ var hole = false; for(var h = 1; h < c.p[p].length; h++) if(inRing(c.p[p][h], lon, lat)) hole = true; if(!hole) return c; }
    }
    return null;
  }
  function km(a, b, c, d){ var R = 6371, t = Math.PI / 180, x = Math.sin((c - a) * t / 2), y = Math.sin((d - b) * t / 2); return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * t) * Math.cos(c * t) * y * y)); }
  function nearCity(lat, lon){ var best = null, bd = 1e9; (window.WORLD_CITIES || []).forEach(function(c){ var d = km(lat, lon, c[0], c[1]); if(d < bd){ bd = d; best = c; } }); return best && bd <= 30 ? { c:best, d:bd } : null; }
  function drawModern(cv){
    var r = cv.parentElement.getBoundingClientRect(), W = Math.max(240, r.width), H = Math.max(220, r.height), DPR = window.devicePixelRatio || 1;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    var g = cv.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    mv.k = Math.max(mMinK(W, H), Math.min(3000, mv.k)); mv.lat = Math.max(-80, Math.min(80, mv.lat)); mv.lon = Math.max(-180, Math.min(180, mv.lon));
    g.fillStyle = '#cfe0ea'; g.fillRect(0, 0, W, H);
    var tl = mll(0, 0, W, H), br = mll(W, H, W, H);
    /* 경위선 */
    var step = mv.k < 6 ? 30 : mv.k < 20 ? 10 : mv.k < 80 ? 5 : 1;
    g.strokeStyle = 'rgba(40,80,110,.12)'; g.lineWidth = 1; g.beginPath();
    for(var lo = Math.ceil(tl.lon / step) * step; lo <= br.lon; lo += step){ var p1 = mxy(0, lo, W, H); g.moveTo(p1.x, 0); g.lineTo(p1.x, H); }
    for(var la = Math.ceil(br.lat / step) * step; la <= tl.lat; la += step){ var p2 = mxy(la, 0, W, H); g.moveTo(0, p2.y); g.lineTo(W, p2.y); }
    g.stroke();
    /* 나라 */
    var labels = [];
    WORLD_COUNTRIES.forEach(function(c, ix){
      var b = c.bb; if(b[2] < tl.lon || b[0] > br.lon || b[3] < br.lat || b[1] > tl.lat) return;
      g.beginPath();
      c.p.forEach(function(poly){ poly.forEach(function(rr){ for(var i = 0; i < rr.length; i += 2){ var q = mxy(rr[i + 1], rr[i], W, H); if(i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); } g.closePath(); }); });
      g.fillStyle = ['#f6f1e4', '#efe6d2', '#f2ead9', '#ebe3cf'][ix % 4]; g.fill('evenodd');
      g.strokeStyle = '#8c806b'; g.lineWidth = mv.k > 40 ? 1.1 : .7; g.stroke();
      var a = mxy(b[3], b[0], W, H), z = mxy(b[1], b[2], W, H);
      if(b[2] - b[0] < 180 && z.x - a.x > 46 && z.y - a.y > 14) labels.push({ c:c, p:mxy(c.l[1], c.l[0], W, H), size:Math.min(22, 10 + Math.log2((z.x - a.x) / 46 + 1) * 3) });
    });
    g.textAlign = 'center'; g.textBaseline = 'middle';
    labels.forEach(function(L2){
      g.font = '600 ' + L2.size + 'px "Malgun Gothic","맑은 고딕",sans-serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.85)'; g.fillStyle = 'rgba(70,58,40,.78)';
      g.strokeText(L2.c.k, L2.p.x, L2.p.y); g.fillText(L2.c.k, L2.p.x, L2.p.y);
    });
    /* 이름표가 겹치면 뒤의 것은 빼고 점만 (옛 성경 지명 → 수도 → 다른 도시 차례로 자리를 잡는다) */
    var boxes = [];
    function free(x, y, w, h){ for(var i = 0; i < boxes.length; i++){ var b = boxes[i]; if(x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false; } boxes.push([x, y, w, h]); return true; }
    var anc = [];
    if(overlay && L) Object.keys(placesOf(L)).forEach(function(id){ var p = window.ATLAS_PLACES && ATLAS_PLACES[id]; if(!p) return; var q = mxy(p[0], p[1], W, H); if(q.x < -20 || q.y < -20 || q.x > W + 20 || q.y > H + 20) return; anc.push({ p:p, q:q }); });
    g.font = 'italic 600 12px "Malgun Gothic","맑은 고딕",serif';
    anc.forEach(function(a){ a.show = mv.k >= 18 && free(a.q.x + 5, a.q.y - 17, g.measureText(a.p[2]).width + 4, 15); boxes.push([a.q.x - 5, a.q.y - 5, 10, 10]); });
    /* 오늘의 도시 */
    g.textAlign = 'left'; g.textBaseline = 'middle';
    var cities = (window.WORLD_CITIES || []).slice().sort(function(a, b){ return (b[4] ? 1 : 0) - (a[4] ? 1 : 0); });
    cities.forEach(function(c){
      if(!(c[4] || mv.k >= 45)) return;
      var q = mxy(c[0], c[1], W, H); if(q.x < -20 || q.y < -20 || q.x > W + 20 || q.y > H + 20) return;
      g.fillStyle = c[4] ? '#1d3b58' : '#3f5d78'; g.beginPath(); if(c[4]){ g.rect(q.x - 3.2, q.y - 3.2, 6.4, 6.4); } else g.arc(q.x, q.y, 2.8, 0, 6.283); g.fill();
      if(mv.k < 9) return;                                  /* 세계를 볼 때는 점만 — 이름은 조금 확대하면 */
      var name = c[2] + (overlay && c[5] && mv.k >= 45 ? '  (옛 ' + c[5] + ')' : '');
      g.font = (c[4] ? '700 ' : '500 ') + (mv.k >= 45 ? 12.5 : 11) + 'px "Malgun Gothic","맑은 고딕",sans-serif';
      if(!free(q.x + 5, q.y - 8, g.measureText(name).width + 4, 16)) return;
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.9)'; g.strokeText(name, q.x + 6, q.y); g.fillStyle = '#1d3b58'; g.fillText(name, q.x + 6, q.y);
    });
    /* 옛 성경 지명 (왼쪽 지도) */
    if(overlay && L){
      anc.forEach(function(a){
        var p = a.p, q = a.q;
        g.strokeStyle = '#8a2e1a'; g.lineWidth = 2; g.fillStyle = 'rgba(255,248,236,.9)'; g.beginPath(); g.arc(q.x, q.y, 4.2, 0, 6.283); g.fill(); g.stroke();
        if(a.show){ g.font = 'italic 600 12px "Malgun Gothic","맑은 고딕",serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,248,236,.92)'; g.strokeText(p[2], q.x + 6, q.y - 9); g.fillStyle = '#8a2e1a'; g.fillText(p[2], q.x + 6, q.y - 9); }
      });
    }
    /* 축척 */
    var kmPerPx = 111.32 / mv.k, nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000], len = nice.filter(function(n){ return n / kmPerPx <= 140; }).pop() || 1;
    var px = len / kmPerPx; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(12, H - 30, px + 16, 20); g.strokeStyle = '#333'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(20, H - 16); g.lineTo(20 + px, H - 16); g.moveTo(20, H - 20); g.lineTo(20, H - 12); g.moveTo(20 + px, H - 20); g.lineTo(20 + px, H - 12); g.stroke();
    g.fillStyle = '#222'; g.font = '11px sans-serif'; g.textAlign = 'center'; g.fillText(len + ' km', 20 + px / 2, H - 23);
  }
  function mRedraw(){ cancelAnimationFrame(mRaf); mRaf = requestAnimationFrame(function(){ if(R && R.modern) drawModern($('mcRCv')); }); }
  function modernDiff(){
    var groups = {}, rows = [];
    Object.keys(placesOf(L)).forEach(function(id){
      var p = ATLAS_PLACES[id]; if(!p) return;
      var c = countryAt(p[0], p[1]);
      for(var d = 1; !c && d <= 3; d++) [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].some(function(o){ c = countryAt(p[0] + o[0] * .04 * d, p[1] + o[1] * .04 * d); return c; });   /* 바닷가 지명은 경계선이 조금 안쪽이라 둘레(약 4~13km)를 본다 */
      var key = c ? c.k : '바다·기타', nc = nearCity(p[0], p[1]);
      (groups[key] = groups[key] || []).push('<span class="mc-chip" title="' + esc(p[3] || '') + '">' + esc(p[2]) + (nc ? ' <small>→ ' + esc(nc.c[2]) + (nc.d > 6 ? ' 곁' : '') + '</small>' : '') + '</span>');
    });
    Object.keys(groups).sort(function(a, b){ return groups[b].length - groups[a].length; }).forEach(function(k){ rows.push('<div class="mc-mrow"><b>' + esc(k) + '</b> <span class="mc-dim">' + groups[k].length + '곳</span><div>' + groups[k].join('') + '</div></div>'); });
    $('mcDiff').innerHTML = '<div class="mc-dcol mc-mod"><div class="mc-dh">성경 지명 → <b>오늘의 나라</b> · 가까운 도시</div>' + (rows.join('') || '<span class="mc-dim">지명이 없습니다</span>') + '</div>';
  }
  function bindModern(){
    var cv = $('mcRCv'), tip = document.createElement('div'); tip.className = 'mc-tip'; tip.hidden = true; cv.parentElement.appendChild(tip);
    function pt(e){ var r = cv.getBoundingClientRect(); return { x:e.clientX - r.left, y:e.clientY - r.top, W:r.width, H:r.height }; }
    cv.addEventListener('wheel', function(e){
      if(!R || !R.modern) return; e.preventDefault();
      var p = pt(e), before = mll(p.x, p.y, p.W, p.H);
      mv.k = Math.max(mMinK(p.W, p.H), Math.min(3000, mv.k * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
      var after = mll(p.x, p.y, p.W, p.H); mv.lon += before.lon - after.lon; mv.lat += before.lat - after.lat; if(same){ same = false; $('mcSame').classList.remove('on'); } mRedraw();
    }, { passive:false });
    cv.addEventListener('pointerdown', function(e){ if(!R || !R.modern || e.button !== 0) return; var p = pt(e); mDrag = { x:p.x, y:p.y, lat:mv.lat, lon:mv.lon, moved:false }; cv.setPointerCapture(e.pointerId); tip.hidden = true; });
    cv.addEventListener('pointermove', function(e){
      if(!R || !R.modern) return; var p = pt(e);
      if(mDrag){ var dx = p.x - mDrag.x, dy = p.y - mDrag.y; if(Math.abs(dx) + Math.abs(dy) > 3){ mDrag.moved = true; if(same){ same = false; $('mcSame').classList.remove('on'); } } mv.lon = mDrag.lon - dx / (mv.k * mcos()); mv.lat = mDrag.lat + dy / mv.k; mRedraw(); return; }
      var ll = mll(p.x, p.y, p.W, p.H), c = countryAt(ll.lat, ll.lon);
      if(!c){ tip.hidden = true; return; }
      var olds = L ? Object.keys(placesOf(L)).map(function(id){ return ATLAS_PLACES[id]; }).filter(function(q){ return q && countryAt(q[0], q[1]) === c; }).map(function(q){ return q[2]; }) : [];
      tip.innerHTML = '<b>' + esc(c.k) + '</b>' + (c.k !== c.n ? ' <small>' + esc(c.n) + '</small>' : '') + (olds.length ? '<div>여기 있던 성경 지명: ' + esc(olds.slice(0, 12).join(' · ')) + (olds.length > 12 ? ' …' : '') + '</div>' : '');
      tip.style.left = Math.min(p.W - 230, p.x + 14) + 'px'; tip.style.top = Math.min(p.H - 60, p.y + 14) + 'px'; tip.hidden = false;
    });
    function end(e){ if(!mDrag) return; mDrag = null; try { cv.releasePointerCapture(e.pointerId); } catch(x){} }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', function(){ tip.hidden = true; });
    cv.addEventListener('dblclick', function(){ if(!R || !R.modern || !L) return; var r = cv.getBoundingClientRect(); mFit(L.bounds, r.width, r.height); mRedraw(); });
  }

  function paint(){
    if(!L || !R) return;
    var b = same && !R.modern ? union(L.bounds, R.bounds) : null;
    $('mcSwap').disabled = !!R.modern; $('mcSwap').title = R.modern ? '현대지도와는 자리를 바꿀 수 없습니다' : '왼쪽·오른쪽 바꾸기';
    $('mcModern').classList.toggle('on', !!R.modern); $('mcModern').title = R.modern ? '성경 지도로 돌아가기' : '오른쪽을 오늘의 세계 지도로';
    $('mcSame').classList.toggle('on', same); $('mcSame').title = R.modern ? (same ? '현대지도를 왼쪽 지도 범위에 맞춰 둡니다 (휠·끌기로 풀림)' : '현대지도를 왼쪽 지도 범위에 맞춥니다') : '두 지도를 같은 범위로 맞춰 그립니다';
    [['L', L], ['R', R]].forEach(function(p){
      if(p[1].modern){
        $('mcRT').textContent = MOD.title; $('mcRRef').textContent = '오늘';
        $('mcRRt').innerHTML = '<label class="mc-ov"><input type="checkbox" id="mcOverlay"' + (overlay ? ' checked' : '') + '> 성경 지명 겹쳐 보기</label>';
        $('mcOverlay').onchange = function(){ overlay = this.checked; mRedraw(); };
        $('mcRTxt').textContent = '■ 수도 · (옛 ○○) 그 자리의 성경 지명 · 갈색 동그라미 왼쪽 지도의 성경 지명. 휠 확대·축소, 끌어 옮기기, 두 번 누르면 왼쪽 범위로.';
        $('mcRCv').classList.add('mc-loading');
        if(same){ var rr0 = $('mcRCv').parentElement.getBoundingClientRect(); mFit(L.bounds, rr0.width || 600, rr0.height || 400); }   /* 같은 범위: 왼쪽 지도 범위로 */
        loadWorld().then(function(){ $('mcRCv').classList.remove('mc-loading'); drawModern($('mcRCv')); modernDiff(); }, function(){ $('mcRTxt').textContent = '현대 지도 자료를 읽지 못했습니다.'; });
        return;
      }
      var side = p[0], m = p[1], cv = $('mc' + side + 'Cv'), wrap = cv.parentElement, r = wrap.getBoundingClientRect();
      $('mc' + side + 'T').textContent = m.title; $('mc' + side + 'Ref').textContent = refLabel(m);
      $('mc' + side + 'Txt').textContent = m.text || '';
      $('mc' + side + 'Rt').innerHTML = (m.routes || []).map(function(rt){ return '<span class="mc-rt"><i style="border-top:3px ' + (rt.dash ? 'dashed' : 'solid') + ' ' + esc(rt.color || '#c0392b') + '"></i>' + esc(rt.name) + '</span>'; }).join('');
      cv.classList.add('mc-loading');
      ATLAS.renderTo(m, cv, Math.max(240, r.width), Math.max(220, r.height), b, function(){ cv.classList.remove('mc-loading'); });
    });
    if(R.modern){ if(window.ACT) ACT.log('map', { label:'현대 지도와 비교 · ' + L.title, data:{ id:L.id, cmp:'modern' } }); return; }
    var a = placesOf(L), c = placesOf(R), onlyL = [], both = [], onlyR = [];
    Object.keys(a).forEach(function(id){ (c[id] ? both : onlyL).push(id); });
    Object.keys(c).forEach(function(id){ if(!a[id]) onlyR.push(id); });
    var ko = function(x, y){ return placeName(x).localeCompare(placeName(y), 'ko'); };
    onlyL.sort(ko); both.sort(ko); onlyR.sort(ko);
    $('mcDiff').innerHTML =
      '<div class="mc-dcol"><div class="mc-dh">왼쪽에만 <b>' + onlyL.length + '</b></div>' + chips(onlyL) + '</div>' +
      '<div class="mc-dcol mid"><div class="mc-dh">양쪽 모두 <b>' + both.length + '</b></div>' + chips(both) + '</div>' +
      '<div class="mc-dcol"><div class="mc-dh">오른쪽에만 <b>' + onlyR.length + '</b></div>' + chips(onlyR) + '</div>';
    $('mcSame').classList.toggle('on', same);
    if(window.ACT) ACT.log('map', { label:'지도 비교 · ' + L.title + ' ↔ ' + R.title, data:{ id:L.id, cmp:R.id } });
  }
  function setL(m, keepR){ L = m; $('mcLSel').value = m.id; var rec = suggest(m); options($('mcRSel'), null, rec);
    if(R && R.modern && keepR){ $('mcRSel').value = MOD.id; var rr = $('mcRCv').getBoundingClientRect(); mFit(m.bounds, rr.width || 600, rr.height || 400); paint(); return; }
    if(!keepR || !R || R === L || R.modern || overlap(R.bounds, m.bounds) < .25) R = rec[0] || maps().filter(function(x){ return x !== m; })[0];   /* 오른쪽은 같은 지역일 때만 그대로 */ $('mcRSel').value = R.id; paint(); }
  var prevR = null;
  function toModern(){ if(R && !R.modern) prevR = R; R = MOD; $('mcRSel').value = MOD.id; var rr = $('mcRCv').getBoundingClientRect(); mFit(L.bounds, rr.width || 600, rr.height || 400); paint(); }
  function build(){
    box = document.createElement('div'); box.className = 'modal mc-modal'; box.id = 'mcModal'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', '지도 비교');
    box.innerHTML =
      '<div class="mc-card">' +
        '<div class="mc-head"><b>비교지도</b><span class="mc-sp"></span>' +
          '<button type="button" class="btn" id="mcModern" title="오른쪽을 오늘의 세계 지도로">현대지도</button>' +
          '<button type="button" class="btn" id="mcSplit" title="두 지도·지명 비교를 각각 따로 움직이는 창으로">창 나누기</button>' +
          '<button type="button" class="btn" id="mcSame" title="두 지도를 같은 범위로 맞춰 그립니다">같은 범위</button>' +
          '<button type="button" class="btn" id="mcSwap" title="왼쪽·오른쪽 바꾸기">바꾸기</button>' +
          '<button type="button" class="wb-x" id="mcClose" aria-label="닫기">×</button></div>' +
        '<div class="mc-body">' +
          ['L', 'R'].map(function(s){
            return '<section class="mc-pane mc-win" id="mc' + s + 'Win"><div class="mc-pbar"><span class="mc-grip" title="끌어서 옮기기">⠿ ' + (s === 'L' ? '왼쪽' : '오른쪽') + '</span><select id="mc' + s + 'Sel" class="mc-sel"></select></div>' +
              '<div class="mc-cvwrap"><canvas id="mc' + s + 'Cv" title="누르면 이 지도를 크게 엽니다"></canvas></div>' +
              '<div class="mc-info"><div class="mc-t"><span id="mc' + s + 'T"></span> <small id="mc' + s + 'Ref"></small></div><div class="mc-rts" id="mc' + s + 'Rt"></div><div class="mc-txt" id="mc' + s + 'Txt"></div></div></section>';
          }).join('') +
        '</div>' +
        '<div class="mc-diff mc-win" id="mcDiffWin"><div class="mc-pbar mc-dbar"><span class="mc-grip">⠿ 지명 비교</span></div><div class="mc-diffin" id="mcDiff"></div></div>' +
      '</div>';
    document.body.appendChild(box);
    var st = document.createElement('style');
    st.textContent =
      '.mc-modal{z-index:205;padding:14px}.mc-card{width:min(1500px,86vw);height:min(960px,86vh);display:flex;flex-direction:column;background:var(--panel);border:1px solid var(--line);border-radius:15px;box-shadow:var(--shadow2);overflow:hidden}' +
      '.mc-card{position:relative;resize:both;min-width:560px;min-height:420px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px)}' +
      '.mc-head{cursor:move;user-select:none;touch-action:none}.mc-head :is(button,select,input){cursor:pointer}.mc-dragging,.mc-dragging *{cursor:move!important;user-select:none!important}' +
      '@media (max-width:900px){.mc-card{min-width:0;resize:none}}' +
      '.mc-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line)}.mc-head b{font-size:17px}.mc-sub{color:var(--fg3);font-size:13px}.mc-sp{flex:1}' +
      '.mc-head .btn.on{background:var(--accent);color:var(--accent-fg,#fff);border-color:var(--accent)}.mc-head .btn:disabled{opacity:.38;cursor:default;pointer-events:none}' +
      '.mc-body{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px}' +
      '.mc-pane{display:flex;flex-direction:column;min-height:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg)}' +
      '.mc-pbar{display:flex;align-items:center;gap:6px;padding:0 0 0 8px}.mc-pbar .mc-sel{flex:1;margin:8px 8px 8px 0}.mc-grip{display:none;font-size:12.5px;color:var(--fg3);white-space:nowrap;cursor:move;user-select:none}' +
      '.mc-diff{display:block}.mc-diffin{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}.mc-dbar{display:none}' +
      /* 나눈 창 */
      '.mc-split.mc-modal{background:transparent;pointer-events:none;padding:0}.mc-split .mc-card{transform:none!important;background:none;border:0;box-shadow:none;resize:none;width:0;height:0;min-width:0;min-height:0;overflow:visible}' +
      '.mc-split .mc-head{position:fixed;pointer-events:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow2);z-index:3}' +
      '.mc-split .mc-body{display:contents}.mc-split .mc-win{position:fixed;pointer-events:auto;resize:both;overflow:hidden;min-width:280px;min-height:200px;box-shadow:0 14px 40px rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;background:var(--bg);display:flex;flex-direction:column;padding:0;max-height:none}' +
      '.mc-split .mc-grip{display:inline}.mc-split .mc-pbar{cursor:move;background:var(--panel);border-bottom:1px solid var(--line)}.mc-split .mc-dbar{display:flex;padding:7px 10px}' +
      '.mc-split .mc-diffin{flex:1;overflow:auto;padding:8px}.mc-split .mc-win.mc-front{box-shadow:0 18px 50px rgba(0,0,0,.36)}' +
      '.mc-sel{margin:8px;height:34px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--fg);font:inherit;font-size:14px;padding:0 8px}' +
      '.mc-cvwrap{flex:1;min-height:200px;position:relative;cursor:zoom-in}.mc-cvwrap canvas{position:absolute;inset:0;width:100%;height:100%}.mc-loading{opacity:.35}' +
      '.mc-info{max-height:34%;overflow:auto;padding:8px 12px;border-top:1px solid var(--line);font-size:13.5px;line-height:1.7}.mc-t{font-weight:700;margin-bottom:4px}.mc-t small{color:var(--fg3);font-weight:400}' +
      '.mc-txt{color:var(--fg2);white-space:pre-wrap}.mc-rts{display:flex;flex-wrap:wrap;gap:4px 12px;margin-bottom:4px}.mc-rt{display:inline-flex;align-items:center;gap:6px;font-size:12.5px}.mc-rt i{display:inline-block;width:22px}' +
      '.mc-diff{padding:0 10px 10px;max-height:24%;overflow:auto}' +
      '.mc-dcol{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--bg)}.mc-dcol.mid{background:var(--panel2)}.mc-dh{font-size:12.5px;color:var(--fg3);margin-bottom:6px}.mc-dh b{color:var(--fg)}' +
      '.mc-mod{grid-column:1/-1}.mc-mrow{margin:0 0 6px}.mc-mrow b{font-size:13px}.mc-mrow>div{margin-top:3px}.mc-chip small{color:var(--fg3)}' +
      '.mc-tip{position:absolute;z-index:3;max-width:230px;background:rgba(20,24,30,.9);color:#fff;border-radius:8px;padding:6px 9px;font-size:12.5px;line-height:1.5;pointer-events:none}.mc-tip small{opacity:.7}' +
      '.mc-ov{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer}' +
      '.mc-chip{display:inline-block;margin:0 5px 5px 0;padding:1px 8px;border-radius:999px;border:1px solid var(--line);font-size:12.5px;background:var(--panel)}.mc-dim{color:var(--fg3);font-size:12.5px}' +
      '@media (max-width:900px){.mc-body{grid-template-columns:1fr;overflow:auto}.mc-pane{min-height:420px}.mc-diffin{grid-template-columns:1fr}.mc-sub{display:none}#mcSplit{display:none}}';
    document.head.appendChild(st);
    $('mcClose').onclick = function(){ if(window.POP && POP.isPop) POP.close(); else close(); };   /* 따로 뜬 창이면 창을 숨긴다 */
    /* ── 창 나누기: 각 창을 따로 끌어 옮기고(머리줄) 모서리로 크기를 바꾼다. 자리는 기억한다. 뒤의 본문도 그대로 쓸 수 있다 ── */
    var SPK = 'mc.split', split = false, zTop = 10;
    function spSaved(){ try { return JSON.parse(localStorage.getItem(SPK) || 'null'); } catch(e){ return null; } }
    function spSave(){
      var o = { on:split };
      ['mcLWin', 'mcRWin', 'mcDiffWin'].forEach(function(id){ var el = $(id), r = el.getBoundingClientRect(); if(split) o[id] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; });
      var h = box.querySelector('.mc-head').getBoundingClientRect(); if(split) o.head = [Math.round(h.left), Math.round(h.top)];
      var old = spSaved() || {}; try { localStorage.setItem(SPK, JSON.stringify(split ? o : Object.assign(old, { on:false }))); } catch(e){}
    }
    function place(el, r){ el.style.left = r[0] + 'px'; el.style.top = r[1] + 'px'; if(r[2]){ el.style.width = r[2] + 'px'; el.style.height = r[3] + 'px'; } }
    function fitIn(r){ var W = window.innerWidth, H = window.innerHeight; r[2] = r[2] ? Math.min(r[2], W - 16) : r[2]; r[3] = r[3] ? Math.min(r[3], H - 16) : r[3]; r[0] = Math.max(8 - (r[2] || 200) + 160, Math.min(W - 160, r[0])); r[1] = Math.max(8, Math.min(H - 48, r[1])); return r; }
    function setSplit(on){
      split = !!on; box.classList.toggle('mc-split', split); $('mcSplit').classList.toggle('on', split); $('mcSplit').textContent = split ? '한 창으로' : '창 나누기';
      var head = box.querySelector('.mc-head');
      ['mcLWin', 'mcRWin', 'mcDiffWin'].forEach(function(id){ var el = $(id); if(!split){ el.style.left = el.style.top = el.style.width = el.style.height = el.style.zIndex = ''; } });
      if(!split){ head.style.left = head.style.top = ''; spSave(); setTimeout(paint, 60); return; }
      var W = window.innerWidth, H = window.innerHeight, sv = spSaved() || {}, half = Math.round((W - 36) / 2), mh = Math.max(300, H - 290);
      place(head, fitIn(sv.head || [Math.round(W / 2 - 330), 10]));
      place($('mcLWin'), fitIn(sv.mcLWin || [12, 70, half, mh]));
      place($('mcRWin'), fitIn(sv.mcRWin || [24 + half, 70, half, mh]));
      place($('mcDiffWin'), fitIn(sv.mcDiffWin || [12, 80 + mh, W - 24, Math.max(150, H - mh - 92)]));
      spSave(); setTimeout(paint, 60);
    }
    function drag(el, handle){
      var on = null;
      handle.addEventListener('pointerdown', function(e){
        if(!split || e.button !== 0 || e.target.closest('select,button,input,a')) return;
        var r = el.getBoundingClientRect(); on = { x:e.clientX, y:e.clientY, l:r.left, t:r.top };
        handle.setPointerCapture(e.pointerId); document.body.classList.add('mc-dragging'); e.preventDefault(); e.stopPropagation();
      });
      handle.addEventListener('pointermove', function(e){ if(!on) return; el.style.left = (on.l + e.clientX - on.x) + 'px'; el.style.top = Math.max(0, Math.min(window.innerHeight - 40, on.t + e.clientY - on.y)) + 'px'; });
      function end(e){ if(!on) return; on = null; document.body.classList.remove('mc-dragging'); try { handle.releasePointerCapture(e.pointerId); } catch(x){} var r = el.getBoundingClientRect(); place(el, fitIn([r.left, r.top])); spSave(); }
      handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
      el.addEventListener('pointerdown', function(){ if(split){ el.style.zIndex = ++zTop; box.querySelectorAll('.mc-front').forEach(function(x){ x.classList.remove('mc-front'); }); el.classList.add('mc-front'); } }, true);
    }
    drag($('mcLWin'), $('mcLWin').querySelector('.mc-pbar')); drag($('mcRWin'), $('mcRWin').querySelector('.mc-pbar')); drag($('mcDiffWin'), $('mcDiffWin').querySelector('.mc-pbar'));
    drag(box.querySelector('.mc-head'), box.querySelector('.mc-head'));
    var rs = new ResizeObserver(function(){ if(!box.hidden && split){ clearTimeout(rs._t); rs._t = setTimeout(function(){ spSave(); paint(); }, 200); } });
    rs.observe($('mcLWin')); rs.observe($('mcRWin'));
    $('mcSplit').onclick = function(){ setSplit(!split); };
    MAPCMP._split = function(){ if(window.POP && POP.isPop){ setSplit(false); $('mcSplit').hidden = true; return; } var sv = spSaved(); setSplit(sv ? sv.on !== false : window.innerWidth > 900); };

    /* 창 옮기기: 머리줄을 끌면 창이 따라온다 (화면 밖으로는 못 나감), 두 번 누르면 가운데로. 끌다가 밖에서 놓아도 창은 닫히지 않는다 */
    (function(){
      var card = box.querySelector('.mc-card'), head = box.querySelector('.mc-head'), dx = 0, dy = 0, sx = 0, sy = 0, ox = 0, oy = 0, on = false;
      function apply(){ card.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; }
      function clamp(){
        card.style.transform = ''; var r = card.getBoundingClientRect();
        dx = Math.max(160 - r.right, Math.min(window.innerWidth - 160 - r.left, dx));   /* 창이 적어도 160px 는 보이게 */
        dy = Math.max(8 - r.top, Math.min(window.innerHeight - 56 - r.top, dy)); apply();   /* 머리줄은 늘 화면 안에 */
      }
      head.addEventListener('pointerdown', function(e){
        if(e.button !== 0 || e.target.closest('button,select,input,a') || box.classList.contains('mc-split') || (window.POP && POP.isPop)) return;
        on = true; sx = e.clientX; sy = e.clientY; ox = dx; oy = dy; head.setPointerCapture(e.pointerId); document.body.classList.add('mc-dragging'); e.preventDefault();
      });
      head.addEventListener('pointermove', function(e){ if(!on) return; dx = ox + e.clientX - sx; dy = oy + e.clientY - sy; apply(); });
      function end(e){ if(!on) return; on = false; document.body.classList.remove('mc-dragging'); try { head.releasePointerCapture(e.pointerId); } catch(x){} clamp(); }
      head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
      head.addEventListener('dblclick', function(e){ if(e.target.closest('button,select,input')) return; dx = dy = 0; apply(); });
      window.addEventListener('resize', function(){ if(!box.hidden) clamp(); });
    })();
    $('mcSame').onclick = function(){ same = !same; paint(); };
    $('mcSwap').onclick = function(){ if(R && R.modern) return; var t = L; L = R; R = t; $('mcLSel').value = L.id; options($('mcRSel'), null, suggest(L)); $('mcRSel').value = R.id; paint(); };
    $('mcLSel').onchange = function(){ var m = ATLAS.byId(this.value); if(m) setL(m, true); };
    $('mcRSel').onchange = function(){ if(this.value === MOD.id){ toModern(); return; } var m = ATLAS.byId(this.value); if(m){ R = m; paint(); } };
    $('mcModern').onclick = function(){ if(R && R.modern){ var back = (prevR && prevR !== L && ATLAS.byId(prevR.id)) ? prevR : (suggest(L)[0] || maps().filter(function(x){ return x !== L; })[0]); if(!back) return; R = back; options($('mcRSel'), null, suggest(L)); $('mcRSel').value = R.id; paint(); } else toModern(); };
    bindModern();
    /* 지도를 누르면 크게 본다 — 따로 뜬 비교지도 창이면 비교는 그대로 두고 성경 지도 창을 따로 띄운다 (평면도로) */
    ['L', 'R'].forEach(function(s){ $('mc' + s + 'Cv').onclick = function(){ var m = s === 'L' ? L : R; if(m.modern) return; if(window.POP && POP.isPop && POP.open){ POP.open('atlas', { map:m.id }); return; } close(); if(APP.openAtlasAt) APP.openAtlasAt(m, null); else ATLAS.open(m); }; });
    var down = false;
    box.addEventListener('mousedown', function(e){ down = e.target === box; });
    box.addEventListener('click', function(e){ if(down && e.target === box && !box.classList.contains('mc-split') && !(window.POP && POP.isPop)) close(); down = false; });
    box.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ e.stopPropagation(); close(); } });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !box.hidden && box.classList.contains('mc-split') && !e.defaultPrevented && document.activeElement && box.contains(document.activeElement)) close(); });
    ro = new ResizeObserver(function(){ if(!box.hidden) { clearTimeout(ro._t); ro._t = setTimeout(function(){ if(R && R.modern){ drawModern($('mcRCv')); ATLAS.renderTo(L, $('mcLCv'), $('mcLCv').parentElement.getBoundingClientRect().width, $('mcLCv').parentElement.getBoundingClientRect().height, null, function(){}); } else paint(); }, 150); } });
    ro.observe($('mcLCv').parentElement); ro.observe($('mcRCv').parentElement);
  }
  /* 비교지도(데스크탑): 성경 지도 창 두 개를 화면 왼쪽·오른쪽 반에 나란히 띄운다 — 각 창은 지도 창의 모든 기능(3D 지형·거리재기·목록)을 그대로 쓴다.
     현대지도 비교와 웹(모두의 성경)은 아래 한 창 비교(open)로 */
  function twoWindows(left, right){
    return false;   /* 비교지도는 따로 뜨는 창 하나(?pop=compare)로 연다 — 지도 창 두 개 방식은 쓰지 않는다 */
    var st = APP.st || {}, l = left || (st.bi >= 0 ? ATLAS.mapsFor(st.bi, st.ci)[0] : null) || maps()[0], r = right || suggest(l)[0] || maps().filter(function(x){ return x !== l; })[0];
    if(!l || !r) return false;
    POP.open('atlas', { map:l.id }, 'left');
    setTimeout(function(){ POP.open('atlas2', { map:r.id }, 'right'); }, 120);
    if(window.ACT) ACT.log('map', { label:'비교지도 · ' + l.title + ' ↔ ' + r.title, data:{ id:l.id, cmp:r.id } });
    return true;
  }
  function openModern(left){
    if(!window.ATLAS || !ATLAS.renderTo){ APP.toast('지도 자료를 읽지 못했습니다'); return; }
    open(left, null, true);
  }
  function open(left, right, modern){
    if(!window.ATLAS || !ATLAS.renderTo){ APP.toast('지도 자료를 읽지 못했습니다'); return; }
    if(!modern && twoWindows(left, right)) return;
    if(!box) build();
    opener = document.activeElement;
    options($('mcLSel'), null, null);
    box.hidden = false;
    if(MAPCMP._split) MAPCMP._split();
    var st = APP.st || {}, m = left || (st.bi >= 0 ? (ATLAS.mapsFor(st.bi, st.ci)[0]) : null) || maps()[0];
    setL(m, false);
    if(right){ R = right; $('mcRSel').value = R.id; paint(); }
    if(modern) toModern();
    setTimeout(function(){ $('mcLSel').focus(); }, 0);
  }
  function close(){ if(!box || box.hidden) return; box.hidden = true; if(opener && opener.focus) try { opener.focus(); } catch(e){} }
  return { open:open, openModern:openModern, close:close };
})();
