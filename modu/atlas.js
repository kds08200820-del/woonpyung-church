/* 성경 지도 — 절에서 오른쪽 단추 → [지도 보기]. 음영 기복 지형(data/maps/*.jpg) 위에
   지명·경로·지역 이름을 그리고, 오른쪽에 해설을 보인다. 자료: data/atlas-places.js · data/atlas-maps.js · data/maps/bases.js */
var ATLAS = (function(){
  var $ = APP.$, esc = APP.esc, BOOKS = APP.BOOKS;
  var cv, g, W = 0, H = 0, DPR = 1, ro = null, opener = null;
  var cur = null, list = [], base = null, img = null, imgCache = {};
  var view = { lat:32, lon:35, k:200 };           /* k = 위도 1도당 화소 */
  var drag = null, hover = null, focusId = null, labelBoxes = [];
  var COL = { text:'#2b2117', halo:'rgba(255,250,240,.92)', region:'rgba(70,45,20,.55)', water:'#1f5f8f', city:'#3a2a18', ring:'#fff8ec', emph:'#8a2e1a' };

  function P(id){ return ATLAS_PLACES[id]; }
  var texFlat = false;   /* 3D 지형 텍스처를 그릴 때는 경도 축을 줄이지 않는다 */
  function cosf(){ return texFlat ? 1 : Math.cos(view.lat * Math.PI / 180); }
  function toXY(lat, lon){ return { x: W / 2 + (lon - view.lon) * view.k * cosf(), y: H / 2 - (lat - view.lat) * view.k }; }
  function fromXY(x, y){ return { lon: view.lon + (x - W / 2) / (view.k * cosf()), lat: view.lat - (y - H / 2) / view.k }; }

  /* ── 어느 지도를 보일지 ── */
  function mapsFor(bi, ci){
    var ch = ci + 1, out = [];
    ATLAS_MAPS.forEach(function(m){
      var best = null;
      (m.match || []).forEach(function(r){ if(r[0] === bi && ch >= r[1] && ch <= r[2]){ var span = r[2] - r[1]; if(best === null || span < best) best = span; } });
      if(best !== null) out.push({ m:m, span:best });
    });
    out.sort(function(a, b){ return a.span - b.span; });
    var ids = out.map(function(o){ return o.m.id; });
    var gen = bi >= 39 ? ['palestine-nt', 'roman-empire'] : ['tribes', 'ane'];
    gen.forEach(function(id){ if(ids.indexOf(id) < 0){ var m = byId(id); if(m){ out.push({ m:m, span:999 }); } } });
    return out.map(function(o){ return o.m; });
  }
  function byId(id){ for(var i = 0; i < ATLAS_MAPS.length; i++) if(ATLAS_MAPS[i].id === id) return ATLAS_MAPS[i]; return null; }

  /* ── 지도 목록(개관): 성경 순서로 모든 지도를 늘어놓고 골라 본다 ── */
  var indexMode = false;
  function firstRef(m){ var r = (m.match || [])[0]; return r ? r[0] * 1000 + r[1] : 9999; }
  function allMaps(){ return ATLAS_MAPS.slice().sort(function(a, b){ return firstRef(a) - firstRef(b); }); }
  function groupOf(m){
    var r = (m.match || [])[0]; if(!r) return '개관';
    if(m.base === 'jerusalem') return '예루살렘';
    if(r[0] <= 4) return '모세오경'; if(r[0] <= 16) return '역사서'; if(r[0] <= 21) return '시가서'; if(r[0] <= 38) return '선지서';
    if(r[0] <= 42) return '복음서'; if(r[0] === 43) return '사도행전'; return '서신·계시록';
  }
  /* ── 나의 지도: 내가 본 지도를 최근 것부터 기억한다 (이 기기의 localStorage, 최대 100장) ── */
  var SEENKEY = 'bibleApp.atlasSeen';
  function seenList(){ try{ var a = JSON.parse(localStorage.getItem(SEENKEY) || '[]'); return Array.isArray(a) ? a.filter(function(x){ return x && byId(x.id); }) : []; }catch(e){ return []; } }
  function seenSave(a){ try{ localStorage.setItem(SEENKEY, JSON.stringify(a.slice(0, 100))); }catch(e){} }
  function seenAdd(m){ if(!m || !m.id) return; var a = seenList().filter(function(x){ return x.id !== m.id; }); a.unshift({ id:m.id, t:Date.now() }); seenSave(a); }
  function seenRemove(id){ seenSave(seenList().filter(function(x){ return x.id !== id; })); }
  function seenDate(t){ var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate(); }
  function paintSeen(){
    var seen = seenList();
    return '<div class="at-h at-seenh">나의 지도 <span class="dim">' + (seen.length ? '내가 본 ' + seen.length + '장 · 최근 순' : '아직 본 지도가 없습니다') + '</span>' +
      (seen.length ? '<button type="button" class="at-seenclear" title="나의 지도 목록을 모두 지웁니다">모두 지우기</button>' : '') + '</div>' +
      (seen.length ? '<div class="at-others at-seen">' + seen.map(function(x){ var m = byId(x.id); return '<div class="at-other at-idx at-seenrow' + (m === cur ? ' on' : '') + '" data-id="' + esc(m.id) + '" role="button" tabindex="0"><span><b>' + esc(m.title) + '</b><br><span class="dim">' + esc(m.ref || '') + '</span></span><span class="dim">' + seenDate(x.t) + '</span><button type="button" class="at-seenx" data-id="' + esc(m.id) + '" title="목록에서 지우기" aria-label="목록에서 지우기">✕</button></div>'; }).join('') + '</div>' : '');
  }
  /* ── 즐겨찾기: 별(☆/★)로 넣고 빼며, '즐겨찾기' 단추로 목록을 옆 칸에 본다 ── */
  var FAVKEY = 'bibleApp.atlasFav', favMode = false;
  function favList(){ try{ var a = JSON.parse(localStorage.getItem(FAVKEY) || '[]'); return Array.isArray(a) ? a.filter(function(id){ return byId(id); }) : []; }catch(e){ return []; } }
  function favSave(a){ try{ localStorage.setItem(FAVKEY, JSON.stringify(a)); }catch(e){} }
  function isFav(id){ return favList().indexOf(id) >= 0; }
  function toggleFav(){
    if(!cur) return; var a = favList(), i = a.indexOf(cur.id);
    if(i >= 0){ a.splice(i, 1); APP.toast('즐겨찾기에서 뺐습니다'); } else { a.unshift(cur.id); APP.toast('즐겨찾기에 넣었습니다 ★'); }
    favSave(a); paintStar(); if(favMode) paintFav(); else if(indexMode) paintIndex();
  }
  function paintStar(){ var b = $('atFavBtn'); if(!b || !cur) return; var on = isFav(cur.id); b.textContent = '★'; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.title = on ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기'; $('atFavListBtn').classList.toggle('on', favMode); }
  function favRows(cls){
    var a = favList();
    return a.length ? '<div class="at-others at-seen">' + a.map(function(id){ var m = byId(id); return '<div class="at-other ' + cls + ' at-seenrow' + (m === cur ? ' on' : '') + '" data-id="' + esc(m.id) + '" role="button" tabindex="0"><span><b>' + esc(m.title) + '</b><br><span class="dim">' + esc(m.ref || '') + '</span></span><span class="dim">' + esc(m.era || '') + '</span><button type="button" class="at-seenx at-favx" data-id="' + esc(m.id) + '" title="즐겨찾기에서 빼기" aria-label="즐겨찾기에서 빼기">✕</button></div>'; }).join('') + '</div>'
      : '<div class="dim at-favempty">아직 즐겨찾기한 지도가 없습니다. 지도 위 별(★)을 누르면 여기에 모입니다.</div>';
  }
  function wireFav(side, repaint){
    [].forEach.call(side.querySelectorAll('.at-favx'), function(x){ x.onclick = function(e){ e.stopPropagation(); favSave(favList().filter(function(id){ return id !== x.dataset.id; })); paintStar(); var top = side.scrollTop; repaint(); side.scrollTop = top; }; });
  }
  function paintFav(){
    var side = $('atSide'), a = favList();
    side.innerHTML = '<div class="at-idxhead"><b>즐겨찾기 지도</b> <span class="dim">' + (a.length ? a.length + '장' : '') + '</span></div>' + favRows('at-favrow');
    [].forEach.call(side.querySelectorAll('.at-favrow'), function(b){ b.onclick = function(e){ if(e.target.closest && e.target.closest('.at-favx')) return; var m = byId(b.dataset.id); if(m){ open(m, null); } }; b.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); b.onclick(e); } }; });
    wireFav(side, paintFav);
  }
  function openIndex(){
    list = allMaps(); indexMode = true;
    open(list[0], null); paintIndex();
  }
  function paintIndex(){
    var side = $('atSide'), groups = [], byG = {};
    list.forEach(function(m){ var gname = groupOf(m); if(!byG[gname]){ byG[gname] = []; groups.push(gname); } byG[gname].push(m); });
    side.innerHTML = '<div class="at-idxhead"><b>성경 지도 목록</b> <span class="dim">' + list.length + '장 · 성경 순서</span></div>' +
      '<input class="at-idxq" id="atIdxQ" placeholder="지도 이름·구절 찾기…" autocomplete="off">' +
      '<div class="at-h at-seenh">즐겨찾기 <span class="dim">' + (favList().length ? favList().length + '장' : '') + '</span></div>' + favRows('at-idx') +
      paintSeen() +
      '<div class="at-h">모든 지도 <span class="dim">성경 순서</span></div>' +
      groups.map(function(gname){ return '<div class="at-h">' + esc(gname) + ' <span class="dim">' + byG[gname].length + '</span></div><div class="at-others">' +
        byG[gname].map(function(m){ return '<button type="button" class="at-other at-idx' + (m === cur ? ' on' : '') + '" data-id="' + esc(m.id) + '"><span><b>' + esc(m.title) + '</b><br><span class="dim">' + esc(m.ref || '') + '</span></span><span class="dim">' + esc(m.era || '') + '</span></button>'; }).join('') + '</div>'; }).join('');
    [].forEach.call(side.querySelectorAll('.at-idx'), function(b){ b.onclick = function(e){ if(e.target.closest && e.target.closest('.at-seenx')) return; var m = byId(b.dataset.id); if(m){ open(m, null); paintIndex(); side.scrollTop = 0; } }; b.onkeydown = function(e){ if(b.tagName !== 'BUTTON' && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); b.onclick(e); } }; });
    /* 나의 지도: ✕ 는 한 장만, '모두 지우기'는 전부 — 목록만 다시 그리고 지도는 그대로 둔다 */
    [].forEach.call(side.querySelectorAll('.at-seenx'), function(x){ x.onclick = function(e){ e.stopPropagation(); seenRemove(x.dataset.id); var top = side.scrollTop; paintIndex(); side.scrollTop = top; }; });
    wireFav(side, paintIndex);
    var clr = side.querySelector('.at-seenclear');
    if(clr) clr.onclick = function(e){ e.stopPropagation(); if(!confirm('나의 지도 목록을 모두 지울까요?')) return; seenSave([]); paintIndex(); side.scrollTop = 0; };
    $('atIdxQ').oninput = function(){
      var q = this.value.trim().toLowerCase();
      [].forEach.call(side.querySelectorAll('.at-idx'), function(b){ var m = byId(b.dataset.id); b.hidden = !!q && (m.title + ' ' + (m.ref || '') + ' ' + (m.era || '')).toLowerCase().indexOf(q) < 0; });
    };
  }

  /* ── 열기 ── */
  function openFor(bi, ci, vi){
    indexMode = false;
    list = mapsFor(bi, ci);
    if(!list.length) return APP.toast('이 본문에 맞는 지도가 아직 없습니다');
    open(list[0], { bi:bi, ci:ci, vi:vi });
  }
  function open(m, from){
    if(ruler) rulerOff(false);                    /* 다른 지도를 열면 거리재기는 끈다 (보기는 새 지도에 맞추므로 되돌리지 않음) */
    meas = { a:null, b:null }; var _me = $('atMeas'); if(_me) _me.hidden = true;
    opener = document.activeElement;
    cur = m; cur.from = from || null; focusId = null; hover = null;
    seenAdd(m);
    if(!list.length || list.indexOf(m) < 0) list = [m];
    cv = $('atCanvas'); g = cv.getContext('2d');
    $('atlasModal').hidden = false; fit();
    if(!ro){ ro = new ResizeObserver(function(){ fit(); draw(); }); ro.observe(cv.parentElement); }
    paintHead(); if(favMode) paintFav(); else if(indexMode) paintIndex(); else paintSide();
    paintStar();
    setView3d(view3dPref, m);
    $('atIndexBtn').classList.toggle('on', indexMode);
    var cr = document.querySelector('#atlasModal .at-credit');
    if(cr) cr.textContent = ATLAS_BASES[m.base] && ATLAS_BASES[m.base].vector ? '시가지 도면: 발굴 결과를 바탕으로 한 통설을 단순화해 그림 — 논쟁 중인 성벽 선은 점선 · 설교자의 성경' : '지형 자료: SRTM 90m (CGIAR-CSI) · ETOPO 2022 (NOAA) — 음영·지명·경로·해설: 설교자의 성경';
    loadBase(m.base, function(){ fitBounds(m.bounds); draw(); });
    setTimeout(function(){ $('atClose').focus(); }, 0);
  }
  var view3dPref = true;
  /* ── 바탕 지도의 3D 지형: 지도 그림(강·지역·경로·지점)을 실제 고도 위에 입히고 지명은 공중에 띄운다 ── */
  var DEMBOX = { levant:[34.0, 31.5, 27.5, 37.0], ane:[42.0, 24.0, 22.0, 56.0] };
  function terrainView(m){
    var b = m.bounds, n = b[0], w = b[1], s = b[2], e = b[3], ph = (n - s) * .35, pw = (e - w) * .35;
    n += ph; s -= ph; w -= pw; e += pw;
    var L = DEMBOX.levant, dem = (n <= L[0] && w >= L[1] && s >= L[2] && e <= L[3]) ? 'levant' : 'ane', D = DEMBOX[dem];
    n = Math.min(n, D[0]); w = Math.max(w, D[1]); s = Math.max(s, D[2]); e = Math.min(e, D[3]);
    var span = Math.max(n - s, (e - w) * .8), vert = span < 1.5 ? 3 : span < 4 ? 4.5 : span < 10 ? 6 : 10;
    var cl = (n + s) / 2, clon = (w + e) / 2, km = span * 111;
    var bid = dem === 'levant' ? 'levant' : 'neareast';
    return { dem:dem, n:n, w:w, s:s, e:e, vert:vert, labels:[], cam:{ from:[cl - span * .95, clon, km * .55], at:[cl + span * .05, clon] },
      baseImg:imgCache[bid] || null, baseBox:ATLAS_BASES[bid],
      paint:function(canvas, win){ paintTexture(canvas, win); } };
  }
  function ensureImg(id, cb){
    if(imgCache[id]) return cb();
    var im = Object.assign(new Image(), { crossOrigin:'anonymous' }); im.onload = function(){ imgCache[id] = im; cb(); }; im.onerror = function(){ cb(); }; im.src = MODU.dataBase + 'maps/' + id + '.jpg';
  }
  var texLabels = [];
  function paintTexture(canvas, win){
    var keep = { cv:cv, g:g, W:W, H:H, DPR:DPR, view:view, boxes:labelBoxes };
    /* 1400px 짜리 가상 화면에 그려서 텍스처에 늘려 넣는다 — 선·표지가 화면에서처럼 보이도록 */
    var sc = canvas.width / 1400;
    cv = canvas; g = canvas.getContext('2d'); W = 1400; H = canvas.height / sc; DPR = sc; labelBoxes = [];
    view = { lat:(win.n + win.s) / 2, lon:(win.w + win.e) / 2, k:H / (win.n - win.s) }; texFlat = true;
    /* 글자는 그리지 않고 자리만 모아 둔다 (3D 에서 공중 표지로) */
    var got = [], seen = {};
    var ft = g.fillText, st = g.strokeText;
    g.fillText = function(t, x, y){ var key = t + '|' + Math.round(x / 8) + '|' + Math.round(y / 8); if(seen[key]) return; seen[key] = 1; var ll = fromXY(x, y); var small = parseInt(g.font) < 12; got.push([ll.lat, ll.lon, String(t), small ? 's' : '']); };
    g.strokeText = function(){};
    try{ g.setTransform(sc, 0, 0, sc, 0, 0); drawRivers(); drawRegions(); drawWaters(); drawRoutes(); drawPlaces(); drawMarks(); }
    catch(e){ console.error(e); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillText = ft; g.strokeText = st; texFlat = false;
    cv = keep.cv; g = keep.g; W = keep.W; H = keep.H; DPR = keep.DPR; view = keep.view; labelBoxes = keep.boxes;
    texLabels = got.slice(0, 80); if(cur3d) cur3d.labels = texLabels;
  }
  var cur3d = null, atlas3dOn = false;
  function setView3d(on, m){
    var j3 = $('atJ3'), seg = $('atViewSeg');
    var hasJ = !!(m && m.era3d && window.JER3DV && JER3DV.ok()), hasT = !hasJ && !!(m && ATLAS_BASES[m.base] && !ATLAS_BASES[m.base].vector && window.TERRAIN3D && TERRAIN3D.ok());
    var has = hasJ || hasT;
    seg.hidden = !has; seg.querySelector('[data-v="3d"]').textContent = hasJ ? '3D 복원' : '3D 지형';
    seg.querySelectorAll('button').forEach(function(b){ b.classList.toggle('on', (b.dataset.v === '3d') === on); });
    if(window.JER3DV) JER3DV.hide(); if(window.TERRAIN3D && atlas3dOn){ TERRAIN3D.hide(); atlas3dOn = false; }
    if(on && hasJ){ j3.hidden = false; cv.style.visibility = 'hidden'; JER3DV.show(j3, m.era3d); }
    else if(on && hasT){
      j3.hidden = false; cv.style.visibility = 'hidden';
      var want = m;
      ensureImg(terrainView(m).dem === 'levant' ? 'levant' : 'neareast', function(){
        if(cur !== want || !view3dPref) return;
        cur3d = terrainView(m);
        if(TERRAIN3D.show(j3, cur3d, 'atlas:' + m.id)) atlas3dOn = true; else { j3.hidden = true; cv.style.visibility = ''; }
      });
    }
    else { j3.hidden = true; cv.style.visibility = ''; }
  }
  function close(){
    if($('atlasModal').hidden) return; showDist(null);
    if(ruler) rulerOff(false);
    if(window.JER3DV) JER3DV.hide(); if(window.TERRAIN3D && atlas3dOn){ TERRAIN3D.hide(); atlas3dOn = false; }
    $('atlasModal').hidden = true;
    if(opener && opener.focus) try{ opener.focus(); }catch(e){}
  }
  var wideLoading = {};
  function loadWide(id){
    if(wideLoading[id]) return; wideLoading[id] = true;
    var im = Object.assign(new Image(), { crossOrigin:'anonymous' }); im.onload = function(){ imgCache[id] = im; draw(); }; im.src = MODU.dataBase + 'maps/' + id + '.jpg';
  }
  function loadBase(id, cb){
    base = ATLAS_BASES[id]; img = null;
    if(base && base.vector){ cb(); return; }
    if(imgCache[id]){ img = imgCache[id]; cb(); return; }
    var im = Object.assign(new Image(), { crossOrigin:'anonymous' });
    im.onload = function(){ imgCache[id] = im; img = im; cb(); };
    im.onerror = function(){ APP.toast('지형 그림(data/maps/' + id + '.jpg)을 읽지 못했습니다'); cb(); };
    im.src = MODU.dataBase + 'maps/' + id + '.jpg';
  }
  function fit(){
    var r = cv.parentElement.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1; W = Math.max(200, r.width); H = Math.max(200, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  function fitBounds(b){
    var n = b[0], w = b[1], s = b[2], e = b[3];
    view.lat = (n + s) / 2; view.lon = (w + e) / 2;
    var kx = (W - 40) / ((e - w) * cosf()), ky = (H - 40) / (n - s);
    view.k = Math.min(kx, ky);
  }

  /* ── 그리기 ── */
  function draw(){
    if(!cur) return;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = '#d9e6ee'; g.fillRect(0, 0, W, H);
    if(base && base.vector){ drawCityBase(); }
    else if(img && base){
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      /* 축소하면 지도 밖으로 넓은 바탕(지중해 → 근동)이 이어져 중동 전체가 보인다 */
      g.fillStyle = '#efe7d6'; g.fillRect(0, 0, W, H);
      ['medit', 'neareast'].forEach(function(id){
        var b = ATLAS_BASES[id]; if(!b || id === cur.base) return;
        var t = toXY(b.north, b.west), r = toXY(b.south, b.east);
        if(r.x < 0 || t.x > W || r.y < 0 || t.y > H) return;
        if(imgCache[id]) g.drawImage(imgCache[id], t.x, t.y, r.x - t.x, r.y - t.y);
        else loadWide(id);
      });
      var tl = toXY(base.north, base.west), br = toXY(base.south, base.east);
      g.drawImage(img, tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    }
    labelBoxes = [];
    drawRivers(); drawRegions(); drawWaters(); drawRoutes(); drawPlaces(); drawMarks(); drawMeasure(); drawRuler(); drawScale();
  }
  /* ── 예루살렘 시가지 도면: 언덕·골짜기·물·성벽·길 ── */
  function pathOf(pts){ g.beginPath(); pts.forEach(function(p, i){ var s = toXY(p[0], p[1]); i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); }); }
  function drawCityBase(){
    var J = window.ATLAS_JER; if(!J) return;
    g.fillStyle = '#e9e0cc'; g.fillRect(0, 0, W, H);
    var TR = window.JER3D_TERRAIN;
    if(TR){
      if(!drawCityBase.img){
        var c = document.createElement('canvas'); c.width = TR.nx; c.height = TR.ny; var cx = c.getContext('2d'), id = cx.createImageData(TR.nx, TR.ny);
        var dx = (TR.east - TR.west) / (TR.nx - 1) * 111320 * Math.cos(31.777 * Math.PI / 180), dy = (TR.north - TR.south) / (TR.ny - 1) * 111320;
        for(var y = 0; y < TR.ny; y++) for(var x = 0; x < TR.nx; x++){
          var hh = function(xx, yy){ xx = Math.max(0, Math.min(TR.nx - 1, xx)); yy = Math.max(0, Math.min(TR.ny - 1, yy)); return TR.h[yy * TR.nx + xx]; };
          var gx = (hh(x + 1, y) - hh(x - 1, y)) / (2 * dx), gy = (hh(x, y + 1) - hh(x, y - 1)) / (2 * dy);
          var sl = Math.atan(2.2 * Math.hypot(gx, gy)), asp = Math.atan2(-gx, gy), sh = Math.max(0, Math.sin(.7) * Math.cos(sl) + Math.cos(.7) * Math.sin(sl) * Math.cos(5.5 - asp));
          var k = (TR.h[y * TR.nx + x] - TR.min) / 260, i4 = (y * TR.nx + x) * 4, bc = [196 + 30 * k, 184 + 30 * k, 146 + 40 * k];
          if(k < .3){ bc[0] -= 26 * (.3 - k) / .3; bc[2] -= 24 * (.3 - k) / .3; }
          var f = .5 + .7 * sh; id.data[i4] = Math.min(255, bc[0] * f); id.data[i4 + 1] = Math.min(255, bc[1] * f); id.data[i4 + 2] = Math.min(255, bc[2] * f); id.data[i4 + 3] = 255;
        }
        cx.putImageData(id, 0, 0); drawCityBase.img = c;
      }
      var t0 = toXY(TR.north, TR.west), t1 = toXY(TR.south, TR.east);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(drawCityBase.img, t0.x, t0.y, t1.x - t0.x, t1.y - t0.y);
    }
    if(!TR) J.hills.forEach(function(h){
      var c = toXY(h[0], h[1]), r = h[2] * view.k;
      var gr = g.createRadialGradient(c.x, c.y, r * .15, c.x, c.y, r);
      gr.addColorStop(0, 'rgba(214,190,140,' + h[3] + ')'); gr.addColorStop(1, 'rgba(214,190,140,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, r, 0, 6.283); g.fill();
    });
    /* 골짜기: 넓고 옅은 띠 + 가운데 개울선 */
    g.lineCap = 'round'; g.lineJoin = 'round';
    if(!TR) Object.keys(J.valleys).forEach(function(k){
      var pts = J.valleys[k];
      g.strokeStyle = 'rgba(120,150,110,.28)'; g.lineWidth = Math.max(8, view.k * 0.0016); pathOf(pts); g.stroke();
      g.strokeStyle = 'rgba(90,130,170,.55)'; g.lineWidth = 1.2; g.setLineDash([4, 5]); pathOf(pts); g.stroke(); g.setLineDash([]);
    });
    /* 길 */
    J.roads.forEach(function(r){ g.strokeStyle = 'rgba(110,90,60,.45)'; g.lineWidth = 2; g.setLineDash([2, 4]); pathOf(r); g.stroke(); g.setLineDash([]); });
    /* 못 · 터널 */
    Object.keys(J.pools).forEach(function(k){ pathOf(J.pools[k]); g.closePath(); g.fillStyle = '#9ec3df'; g.fill(); g.strokeStyle = '#4f7fa8'; g.lineWidth = 1; g.stroke(); });
    if(J.tunnel){ g.strokeStyle = '#3f74a3'; g.lineWidth = 2; g.setLineDash([6, 4]); pathOf(J.tunnel); g.stroke(); g.setLineDash([]); }
    /* 성벽: 이 지도가 고른 시대만 */
    (cur.walls || []).forEach(function(k){
      var wdef = J.walls[k]; if(!wdef) return;
      if(wdef.fill){ pathOf(wdef.pts); g.closePath(); g.fillStyle = wdef.fill; g.fill(); }
      g.strokeStyle = 'rgba(255,250,240,.9)'; g.lineWidth = 7; g.setLineDash([]); pathOf(wdef.pts); if(wdef.fill) g.closePath(); g.stroke();
      g.strokeStyle = wdef.color; g.lineWidth = 3.5; g.setLineDash(wdef.dash ? [10, 7] : []); pathOf(wdef.pts); if(wdef.fill) g.closePath(); g.stroke(); g.setLineDash([]);
    });
    /* 밖은 종이색 */
    var tl = toXY(base.north, base.west), br = toXY(base.south, base.east);
    g.fillStyle = '#efe7d6';
    if(tl.y > 0) g.fillRect(0, 0, W, tl.y); if(br.y < H) g.fillRect(0, br.y, W, H - br.y);
    if(tl.x > 0) g.fillRect(0, 0, tl.x, H); if(br.x < W) g.fillRect(br.x, 0, W - br.x, H);
  }
  function font(px, w){ return (w || 500) + ' ' + px + 'px "맑은 고딕","Malgun Gothic","Apple SD Gothic Neo",sans-serif'; }
  function haloText(t, x, y, col, px, weight, align){
    g.font = font(px, weight); g.textAlign = align || 'left'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = Math.max(3, px * .28); g.strokeStyle = COL.halo; g.strokeText(t, x, y);
    g.fillStyle = col; g.fillText(t, x, y);
  }
  function drawRegions(){
    (cur.regions || []).forEach(function(r){
      var p = toXY(r[1], r[2]);
      var px = Math.max(12, Math.min(22, view.k * 0.075));
      g.font = font(px, 700); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.letterSpacing = Math.round(px * .25) + 'px';
      g.lineWidth = px * .22; g.strokeStyle = 'rgba(255,250,240,.55)'; g.strokeText(r[0], p.x, p.y);
      g.fillStyle = COL.region; g.fillText(r[0], p.x, p.y);
      g.letterSpacing = '0px';
    });
  }
  /* 강줄기: 지형 위에 파란 선. 확대할수록 굵게 */
  function drawRivers(){
    if(!window.ATLAS_RIVERS || (base && base.vector)) return;
    var w = Math.max(1.2, Math.min(4, view.k * 0.012));
    g.lineCap = 'round'; g.lineJoin = 'round';
    Object.keys(ATLAS_RIVERS).forEach(function(k){
      var pts = ATLAS_RIVERS[k].map(function(p){ return toXY(p[0], p[1]); });
      if(pts.every(function(p){ return p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50; })) return;
      [[w + 2.2, 'rgba(255,255,255,.55)'], [w, '#3b7fc4']].forEach(function(st){
        g.beginPath(); pts.forEach(function(p, i){ i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); });
        g.lineWidth = st[0]; g.strokeStyle = st[1]; g.stroke();
      });
    });
  }
  function drawWaters(){
    (cur.waters || []).forEach(function(id){
      var w = P(id); if(!w) return;
      var p = toXY(w[0], w[1]), px = Math.max(11, Math.min(18, view.k * 0.07));
      g.font = 'italic 600 ' + px + 'px "맑은 고딕","Malgun Gothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 3; g.strokeStyle = 'rgba(230,240,250,.7)'; g.strokeText(w[2], p.x, p.y);
      g.fillStyle = COL.water; g.fillText(w[2], p.x, p.y);
    });
  }
  function drawRoutes(){
    (cur.routes || []).forEach(function(rt){
      var pts = rt.pts.map(function(id){ var p = P(id); return p ? toXY(p[0], p[1]) : null; }).filter(Boolean);
      if(pts.length < 2) return;
      g.lineCap = 'round'; g.lineJoin = 'round';
      [[6, 'rgba(255,250,240,.85)', false], [2.6, rt.color || '#c0392b', !!rt.dash]].forEach(function(s){
        g.lineWidth = s[0]; g.strokeStyle = s[1]; g.setLineDash(s[2] ? [9, 7] : []);
        g.beginPath(); pts.forEach(function(p, i){ i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }); g.stroke();
      });
      g.setLineDash([]);
      /* 화살촉: 끝과 긴 구간 중간에 */
      for(var i = 1; i < pts.length; i++){
        var a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        if(len < 30 && i < pts.length - 1) continue;
        var ang = Math.atan2(dy, dx), tx = i === pts.length - 1 ? b.x : a.x + dx * .55, ty = i === pts.length - 1 ? b.y : a.y + dy * .55;
        g.fillStyle = rt.color || '#c0392b'; g.beginPath();
        g.moveTo(tx, ty); g.lineTo(tx - 11 * Math.cos(ang - .45), ty - 11 * Math.sin(ang - .45)); g.lineTo(tx - 11 * Math.cos(ang + .45), ty - 11 * Math.sin(ang + .45)); g.closePath();
        g.strokeStyle = 'rgba(255,250,240,.9)'; g.lineWidth = 2; g.stroke(); g.fill();
      }
    });
  }
  function overlaps(r){ return labelBoxes.some(function(b){ return !(r.x2 < b.x1 || r.x1 > b.x2 || r.y2 < b.y1 || r.y1 > b.y2); }); }
  function drawPlaces(){
    var emph = cur.emph || [];
    var items = (cur.places || []).map(function(id){ var p = P(id); return p ? { id:id, p:p, e:emph.indexOf(id) >= 0 } : null; }).filter(Boolean);
    items.sort(function(a, b){ return (b.e - a.e) || (b.id === focusId) - (a.id === focusId); });
    items.forEach(function(it){
      var p = it.p, s = toXY(p[0], p[1]);
      if(s.x < -60 || s.y < -30 || s.x > W + 60 || s.y > H + 30) return;
      var kind = p[4], isF = it.id === focusId || it.id === hover;
      var r = kind === 'c' ? (it.e ? 5.5 : 4) : 4;
      if(blink.id === it.id){
        var el = (performance.now() - blink.t0) / 650, ph = el - Math.floor(el);
        g.strokeStyle = 'rgba(138,46,26,' + (1 - ph) * .9 + ')'; g.lineWidth = 3;
        g.beginPath(); g.arc(s.x, s.y, r + 4 + ph * 26, 0, 6.283); g.stroke();
        g.fillStyle = 'rgba(255,214,120,' + (0.35 + 0.35 * Math.abs(Math.sin(el * 3.14))) + ')';
        g.beginPath(); g.arc(s.x, s.y, r + 10, 0, 6.283); g.fill();
      }
      if(kind === 'p'){ haloText(p[2], s.x, s.y, COL.region, 12, 700, 'center'); return; }
      if(isF){ g.fillStyle = 'rgba(138,46,26,.25)'; g.beginPath(); g.arc(s.x, s.y, r + 9, 0, 6.283); g.fill(); }
      if(kind === 'm'){
        g.beginPath(); g.moveTo(s.x, s.y - 7); g.lineTo(s.x + 6, s.y + 4); g.lineTo(s.x - 6, s.y + 4); g.closePath();
        g.fillStyle = isF ? COL.emph : '#5a4630'; g.strokeStyle = COL.ring; g.lineWidth = 1.5; g.fill(); g.stroke();
      } else if(kind === 'w'){
        g.fillStyle = COL.water; g.beginPath(); g.arc(s.x, s.y, 3, 0, 6.283); g.fill();
      } else {
        g.beginPath(); g.arc(s.x, s.y, r, 0, 6.283);
        g.fillStyle = kind === 'x' ? COL.ring : (isF || it.e ? COL.emph : COL.city);
        g.strokeStyle = kind === 'x' ? COL.city : COL.ring; g.lineWidth = kind === 'x' ? 1.5 : 2; g.fill(); g.stroke();
      }
      var px = it.e || isF ? 13.5 : 12;
      g.font = font(px, it.e || isF ? 700 : 500);
      var tw = g.measureText(p[2]).width, box = { x1:s.x + r + 4, y1:s.y - px * .7, x2:s.x + r + 4 + tw, y2:s.y + px * .7 };
      if(!it.e && !isF && overlaps(box)){
        box = { x1:s.x - r - 4 - tw, y1:box.y1, x2:s.x - r - 4, y2:box.y2 };
        if(overlaps(box)) return;
        haloText(p[2] + (kind === 'x' ? '?' : ''), s.x - r - 4, s.y, COL.text, px, 500, 'right');
      } else haloText(p[2] + (kind === 'x' ? '?' : ''), s.x + r + 4, s.y, isF || it.e ? COL.emph : COL.text, px, it.e || isF ? 700 : 500, 'left');
      labelBoxes.push(box);
    });
  }
  function markOf(id){ var ms = cur.marks || []; for(var i = 0; i < ms.length; i++) if(ms[i][0] === id) return ms[i]; return null; }
  function drawMarks(){
    (cur.marks || []).forEach(function(mk){
      var p = P(mk[0]); if(!p) return;
      var s = toXY(p[0], p[1]); if(s.x < -30 || s.y < -30 || s.x > W + 30 || s.y > H + 30) return;
      var x = s.x - 13, y = s.y - 13, k = mk[1];
      g.beginPath(); g.arc(x, y, 8.5, 0, 6.283);
      g.fillStyle = k === 'b' ? '#b83227' : k === 'c' ? '#2c6b5e' : '#c9932a'; g.fill();
      g.strokeStyle = '#fff8ec'; g.lineWidth = 1.5; g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round';
      if(k === 'b'){ g.beginPath(); g.moveTo(x - 4.5, y - 4.5); g.lineTo(x + 4.5, y + 4.5); g.moveTo(x + 4.5, y - 4.5); g.lineTo(x - 4.5, y + 4.5); g.stroke(); }
      else if(k === 'c'){ g.beginPath(); g.moveTo(x - 5, y + 4); g.lineTo(x, y - 4.5); g.lineTo(x + 5, y + 4); g.closePath(); g.stroke(); }
      else { g.fillStyle = '#fff'; g.beginPath(); for(var i = 0; i < 10; i++){ var r = i % 2 ? 2 : 4.8, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } g.closePath(); g.fill(); }
    });
  }
  function drawScale(){
    var kmPerDeg = 111.32 * cosf(), pxPerKm = view.k * cosf() / kmPerDeg;
    var cands = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000], km = cands[0];
    for(var i = 0; i < cands.length; i++){ if(cands[i] * pxPerKm <= 160) km = cands[i]; }
    var len = km * pxPerKm, x = 16, y = H - 18;
    g.fillStyle = 'rgba(255,250,240,.8)'; g.fillRect(x - 6, y - 16, len + 12, 24);
    g.strokeStyle = COL.text; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.moveTo(x, y - 5); g.lineTo(x, y + 3); g.moveTo(x + len, y - 5); g.lineTo(x + len, y + 3); g.stroke();
    g.font = font(11, 600); g.fillStyle = COL.text; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(km < 1 ? Math.round(km * 1000) + ' m' : km + ' km', x + len / 2, y - 3);
  }

  /* ── 마우스 ── */
  function pos(e){ var r = cv.getBoundingClientRect(); return { x:e.clientX - r.left, y:e.clientY - r.top }; }
  function pick(x, y){
    var best = null, bd = 14 * 14;
    (cur.places || []).forEach(function(id){ var p = P(id); if(!p || p[4] === 'p') return; var s = toXY(p[0], p[1]); var d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y); if(d < bd){ bd = d; best = id; } });
    return best;
  }
  /* ── 거리 재기: 지명에서 오른쪽 단추로 출발·도착을 찍는다 ── */
  var meas = { a:null, b:null };
  function measEl(){ var el = $('atMeas'); if(!el){ el = document.createElement('div'); el.id = 'atMeas'; el.className = 'at-meas'; el.hidden = true; $('atJ3').parentElement.appendChild(el); } return el; }
  function measTap(id){
    if(!id){ if(meas.a){ meas = { a:null, b:null }; measPaint(); APP.toast('거리 재기를 지웠습니다'); } return; }
    if(!meas.a || meas.b){ meas = { a:id, b:null }; APP.toast('출발: ' + P(id)[2] + ' — 도착할 지명을 오른쪽 단추로 찍으세요'); }
    else if(id !== meas.a) meas.b = id;
    measPaint();
  }
  function measPaint(){
    var el = measEl();
    if(!atlas3dOn) draw();
    if(!meas.a){ el.hidden = true; mark3d(); return; }
    var a = P(meas.a), b = meas.b && P(meas.b);
    el.hidden = false;
    el.innerHTML = b ? '<b>' + esc(a[2]) + ' → ' + esc(b[2]) + '</b> <span class="km">' + fmtKm(km(a, b)) + '</span><span class="dim">곧은 거리 · 오른쪽 단추로 다시 찍거나 빈 곳을 눌러 지움</span>'
                     : '<b>' + esc(a[2]) + '</b>에서 … <span class="dim">도착 지명을 오른쪽 단추로 찍으세요</span>';
    mark3d();
  }
  function mark3d(){
    [].forEach.call($('atJ3').querySelectorAll('.j3-label'), function(l){
      var t = l.textContent; l.classList.toggle('meas', !!(meas.a && (t === P(meas.a)[2] || (meas.b && t === P(meas.b)[2]))));
    });
  }
  function drawMeasure(){
    if(!meas.a) return;
    var a = P(meas.a), sa = toXY(a[0], a[1]);
    g.beginPath(); g.arc(sa.x, sa.y, 9, 0, 6.283); g.lineWidth = 3; g.strokeStyle = '#1f5f8f'; g.stroke();
    if(!meas.b) return;
    var b = P(meas.b), sb = toXY(b[0], b[1]);
    g.beginPath(); g.arc(sb.x, sb.y, 9, 0, 6.283); g.stroke();
    g.setLineDash([8, 6]); g.lineWidth = 2.5; g.beginPath(); g.moveTo(sa.x, sa.y); g.lineTo(sb.x, sb.y); g.stroke(); g.setLineDash([]);
    var t = fmtKm(km(a, b)), mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
    g.font = 'bold 13px sans-serif'; var w = g.measureText(t).width + 14;
    g.fillStyle = '#1f5f8f'; g.beginPath(); g.roundRect ? g.roundRect(mx - w / 2, my - 22, w, 20, 6) : g.rect(mx - w / 2, my - 22, w, 20); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, mx, my - 12); g.textAlign = 'left';
  }
  function pick3d(cx, cy){
    var pj = atlas3dOn && window.TERRAIN3D ? TERRAIN3D.project : (window.JER3DV && JER3DV.active && JER3DV.active() ? JER3DV.project : null);
    if(!pj) return null;
    var best = null, bd = 22 * 22;
    (cur.places || []).forEach(function(id){ var p = P(id); if(!p || p[4] === 'p') return; var s = pj(p[0], p[1]); if(!s) return; var d = (s.x - cx) * (s.x - cx) + (s.y - cy + 14) * (s.y - cy + 14); if(d < bd){ bd = d; best = id; } });
    return best;
  }
  function onDown(e){
    if(e.button !== 0) return; var m = pos(e);
    if(ruler && ruler.mode === 'free'){ var ll0 = fromXY(m.x, m.y); ruler.drawing = { pts:[[ll0.lat, ll0.lon]], sx:m.x, sy:m.y, lx:m.x, ly:m.y, moved:false }; return; }   /* 자유선: 끌면 판을 옮기지 않고 선을 그린다 */
    drag = { x:m.x, y:m.y, lat:view.lat, lon:view.lon, moved:false }; cv.style.cursor = 'grabbing';
  }
  /* ── 선 거리: 경로·성벽·물길에 마우스를 대면 실제 위경도로 잰 거리(대원거리)를 보인다 ── */
  function km(a, b){ var r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r, s = Math.pow(Math.sin(dl / 2), 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.pow(Math.sin(dn / 2), 2); return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(s))); }
  var WALLN = { david:'다윗 성 성벽', solomon:'솔로몬 시대 성벽', hezekiah:'히스기야 성벽', first:'첫째 성벽', herod_temple:'헤롯 성전 기단', square:'성전 기단(정방형)', second:'둘째 성벽', third:'셋째 성벽(아그립바)' };
  function distLines(){
    var out = [];
    if(!cur) return out;
    (cur.routes || []).forEach(function(rt){
      var pts = rt.pts.map(function(id){ var p = P(id); return p ? [p[0], p[1], p[2]] : null; }).filter(Boolean);
      if(pts.length > 1) out.push({ name:rt.name, pts:pts, route:true });
    });
    var J = window.ATLAS_JER;
    if(J && ((base && base.vector) || cur.era3d)){
      (cur.walls || []).forEach(function(k){ var w = J.walls[k]; if(w && w.pts && w.pts.length > 1) out.push({ name:WALLN[k] || '성벽', pts:w.fill ? w.pts.concat([w.pts[0]]) : w.pts, loop:!!w.fill }); });
      if(J.tunnel) out.push({ name:'히스기야 터널', pts:J.tunnel });
      (J.roads || []).forEach(function(r){ out.push({ name:'옛 길', pts:r }); });
    }
    return out;
  }
  function lineHit(lat, lon, tolKm){
    var best = null, c = Math.cos(lat * Math.PI / 180);
    function xy(p){ return [p[1] * c * 111.32, p[0] * 111.32]; }
    var q = xy([lat, lon]);
    distLines().forEach(function(L){
      for(var i = 1; i < L.pts.length; i++){
        var a = xy(L.pts[i - 1]), b = xy(L.pts[i]), dx = b[0] - a[0], dy = b[1] - a[1], ll = dx * dx + dy * dy;
        var t = ll ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / ll)) : 0;
        var d = Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
        if(d <= tolKm && (!best || d < best.d)) best = { d:d, L:L, i:i, t:t };
      }
    });
    return best;
  }
  function fmtKm(k){ return k < 1 ? Math.round(k * 1000).toLocaleString() + ' m' : (k < 20 ? k.toFixed(1) : Math.round(k).toLocaleString()) + ' km'; }
  var dTip = null;
  function showDist(hit, cx, cy){
    if(!hit){ if(dTip) dTip.hidden = true; return; }
    if(!dTip){ dTip = document.createElement('div'); dTip.className = 'ptip dtip'; document.body.appendChild(dTip); }
    var L = hit.L, total = 0, upto = 0;
    for(var i = 1; i < L.pts.length; i++){ var s = km(L.pts[i - 1], L.pts[i]); total += s; if(i < hit.i) upto += s; }
    var seg = km(L.pts[hit.i - 1], L.pts[hit.i]); upto += seg * hit.t;
    var a = L.pts[hit.i - 1][2], b = L.pts[hit.i][2];
    var h = '<div class="ptip-code">' + esc(L.name) + '</div>';
    if(a && b) h += '<div>이 구간 <b>' + esc(a) + ' → ' + esc(b) + '</b> : ' + fmtKm(seg) + '</div>';
    else h += '<div>이 구간 : ' + fmtKm(seg) + '</div>';
    h += '<div>' + (L.loop ? '둘레' : '전체 길이') + ' : <b>' + fmtKm(total) + '</b>' + (L.pts.length > 2 ? ' (' + (L.pts.length - 1) + '구간)' : '') + '</div>';
    if(L.route && L.pts.length > 2) h += '<div>' + esc(L.pts[0][2]) + '에서 여기까지 약 ' + fmtKm(upto) + '</div>';
    h += '<div class="ptip-sum">실제 위도·경도로 잰 곧은 거리입니다' + (L.route ? ' — 실제 걸은 길은 이보다 깁니다' : '') + '</div>';
    dTip.innerHTML = h; dTip.hidden = false;
    var w = dTip.offsetWidth, hh = dTip.offsetHeight;
    dTip.style.left = Math.max(8, Math.min(cx + 14, window.innerWidth - w - 8)) + 'px';
    dTip.style.top = (cy - hh - 12 < 8 ? cy + 18 : cy - hh - 12) + 'px';
  }
  function on3dMove(e){
    if(e.buttons){ showDist(null); return; }
    var pj = atlas3dOn && window.TERRAIN3D ? TERRAIN3D.project : (window.JER3DV && JER3DV.active && JER3DV.active() ? JER3DV.project : null);
    if(!pj){ showDist(null); return; }
    /* 선의 꼭짓점을 화면에 투영해 화면 거리 9px 안의 선을 찾는다 */
    var best = null, mx = e.clientX, my = e.clientY;
    distLines().forEach(function(L){
      var sp = L.pts.map(function(p){ return pj(p[0], p[1]); });
      for(var i = 1; i < sp.length; i++){
        var a = sp[i - 1], b = sp[i]; if(!a || !b) continue;
        var dx = b.x - a.x, dy = b.y - a.y, ll = dx * dx + dy * dy;
        var t = ll ? Math.max(0, Math.min(1, ((mx - a.x) * dx + (my - a.y) * dy) / ll)) : 0;
        var d = Math.hypot(mx - a.x - t * dx, my - a.y - t * dy);
        if(d <= 9 && (!best || d < best.d)) best = { d:d, L:L, i:i, t:t };
      }
    });
    showDist(best, mx, my);
  }
  function onMove(e){
    var m = pos(e);
    if(ruler && ruler.drawing){ rulerFreeMove(m); return; }
    if(!drag && !ruler){ var ll = fromXY(m.x, m.y); showDist(pick(m.x, m.y) ? null : lineHit(ll.lat, ll.lon, 8 / view.k * 111.32), e.clientX, e.clientY); } else showDist(null);
    if(drag){
      var dx = m.x - drag.x, dy = m.y - drag.y; if(Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view.lon = drag.lon - dx / (view.k * cosf()); view.lat = drag.lat + dy / view.k; draw(); return;
    }
    var h = pick(m.x, m.y); if(h !== hover){ hover = h; cv.style.cursor = ruler ? 'crosshair' : (h ? 'pointer' : 'grab'); draw(); }
  }
  function onUp(e){
    if(ruler && ruler.drawing){ rulerFreeUp(pos(e)); return; }
    if(!drag) return; var was = drag; drag = null; cv.style.cursor = ruler ? 'crosshair' : (hover ? 'pointer' : 'grab');
    if(was.moved) return;
    var m = pos(e);
    if(ruler){ rulerClick(m); return; }                /* 직선 모드: 움직이지 않고 뗀 것이 '누름' */
    var id = pick(m.x, m.y);
    if(id){ focusId = id; paintSide(); draw(); notePlace(id); }
  }
  function onWheel(e){
    e.preventDefault();
    var m = pos(e), before = fromXY(m.x, m.y);
    view.k = Math.max(8, Math.min(6000, view.k * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
    var after = fromXY(m.x, m.y);
    view.lon += before.lon - after.lon; view.lat += before.lat - after.lat; draw();
  }
  /* 바탕 그림 밖의 빈 자리가 보이면 그만큼 밀어 넣는다 (지점은 계속 보이게) */
  function clampView(p){
    if(!base) return;
    var tl = fromXY(0, 0), br = fromXY(W, H);
    var dLon = 0, dLat = 0;
    if(br.lon - tl.lon < base.east - base.west){ if(tl.lon < base.west) dLon = base.west - tl.lon; else if(br.lon > base.east) dLon = base.east - br.lon; }
    if(tl.lat - br.lat < base.north - base.south){ if(tl.lat > base.north) dLat = base.north - tl.lat; else if(br.lat < base.south) dLat = base.south - br.lat; }
    view.lon += dLon; view.lat += dLat;
    if(p){ var s = toXY(p[0], p[1]), m = 40; if(s.x < m || s.x > W - m || s.y < m || s.y > H - m){ view.lon -= dLon; view.lat -= dLat; } }
  }
  /* ── 누른 지명을 메모에 담는다 — 지명 하나에 메모 하나, [[지도 제목]]·[[구절]] 로 엮여 지식 그래프에 나온다 ── */
  var KINDN = { c:'도시', m:'산', w:'물', x:'위치 불확실', p:'지역' };
  var noteBusy = {};
  function notePlace(id){
    if(!window.NOTES || !cur) return;
    var p = P(id); if(!p || noteBusy[id]) return;
    noteBusy[id] = true;
    var name = p[2], mapT = cur.title || '', vref = cur.from ? (typeof ref === 'function' ? ref(cur.from.bi, cur.from.ci, cur.from.vi) : '') : '';
    var when = new Date(), ymd = when.getFullYear() + '-' + ('0' + (when.getMonth() + 1)).slice(-2) + '-' + ('0' + when.getDate()).slice(-2);
    var key = '[[' + mapT + ']]' + (vref ? ' · [[' + vref + ']]' : '');
    var line = '- ' + ymd + ' ' + key + (cur.ref ? ' (' + cur.ref + ')' : '');
    NOTES.list(name).then(function(rows){
      var hit = (rows || []).filter(function(n){ return n.title === name; })[0];
      if(hit) return NOTES.get(hit.id).then(function(n){
        if(!n) return null;
        if(String(n.content || '').indexOf(key) >= 0) return n;      /* 같은 지도·같은 구절은 다시 적지 않는다 */
        n.content = String(n.content || '').replace(/\s*$/, '') + '\n' + line + '\n';
        return NOTES.save(n);
      });
      var head = '# ' + name + (p[3] ? ' (' + p[3] + ')' : '') + '\n' +
                 '- 종류: ' + (KINDN[p[4]] || '장소') + '\n' +
                 '- 좌표: ' + (+p[0]).toFixed(3) + ', ' + (+p[1]).toFixed(3) + '\n\n' +
                 '## 지도에서 본 기록\n' + line + '\n';
      return NOTES.save({ id:0, title:name, ref:vref, theme:'', tags:'#지도/' + (KINDN[p[4]] || '장소'), content:head });
    }).then(function(n){ if(n) APP.toast('메모에 담김: ' + name + ' — 지식 그래프에서 볼 수 있습니다'); })
      .catch(function(){}).then(function(){ noteBusy[id] = false; });
  }
  /* 지명 단추: 확대하지 않고 그 자리에서 반짝인다. 화면 밖이면 보일 만큼만 축소한다 */
  var blink = { id:null, t0:0, raf:0 };
  function goTo(id){
    var p = P(id); if(!p) return;
    focusId = id; notePlace(id);
    if(atlas3dOn && window.TERRAIN3D){ TERRAIN3D.focus(p[0], p[1], p[2]); paintSide(); return; }
    var s = toXY(p[0], p[1]), m = 40;
    if(s.x < m || s.y < m || s.x > W - m || s.y > H - m){
      /* 지금 보이는 곳과 그 지점을 함께 담되, 바탕 그림 밖 빈 자리는 잘라 낸 가장 작은 범위로 */
      var tl = fromXY(0, 0), br = fromXY(W, H);
      var n = Math.max(tl.lat, p[0]), so = Math.min(br.lat, p[0]), we = Math.min(tl.lon, p[1]), ea = Math.max(br.lon, p[1]);
      if(base){ n = Math.min(n, base.north); so = Math.max(so, base.south); we = Math.max(we, base.west); ea = Math.min(ea, base.east); }
      n = Math.max(n, p[0] + .05); so = Math.min(so, p[0] - .05); we = Math.min(we, p[1] - .05); ea = Math.max(ea, p[1] + .05);
      var padLat = (n - so) * .06, padLon = (ea - we) * .06;
      fitBounds([n + padLat, we - padLon, so - padLat, ea + padLon]);
    }
    blink.id = id; blink.t0 = performance.now(); cancelAnimationFrame(blink.raf);
    (function tick(now){ if(blink.id !== id) return; draw(); if(now - blink.t0 < 2600) blink.raf = requestAnimationFrame(tick); else { blink.id = null; draw(); } })(blink.t0);
    paintSide();
  }

  /* ── 거리재기(자): 머리의 [거리재기] 단추로 켜고 끈다. 직선(점을 이어 감)·자유선(끌어서 그림) 두 모드,
     점은 위경도로 두고 그릴 때마다 toXY 로 투영한다. 켤 때 보기·3D 를 기억해 두고 끌 때 되돌린다 ── */
  var ruler = null;   /* { mode:'line'|'free', paths:[[ [lat,lon,이름?], … ], …], open:열린 직선이 있나, drawing:자유선 그리는 중, saved:{lat,lon,k,v3d} } */
  var RCOL = '#d9480f', RHALO = 'rgba(255,255,255,.9)';
  function rulerBar(){
    var el = $('atRulebar');
    if(!el){
      el = document.createElement('div'); el.id = 'atRulebar'; el.className = 'at-rulebar'; el.hidden = true;
      el.innerHTML = '<span class="seg"><button type="button" data-mode="line" title="점을 눌러 이어 갑니다">직선</button><button type="button" data-mode="free" title="끌어서 자유롭게 그립니다">자유선</button></span>' +
        '<span class="tot">전체<b id="atRulerTot">0 m</b></span><span class="hint" id="atRulerHint"></span>';
      el.onclick = function(e){ var b = e.target.closest('button[data-mode]'); if(b && ruler){ rulerFinish(); ruler.mode = b.dataset.mode; rulerPaint(); } };
      el.addEventListener('mousedown', function(e){ e.stopPropagation(); });   /* 막대 누름이 지도까지 가지 않게 */
      cv.parentElement.appendChild(el);
    }
    return el;
  }
  function rulerOn(){
    if(ruler || !cur) return;
    ruler = { mode:'line', paths:[], open:false, drawing:null, saved:{ lat:view.lat, lon:view.lon, k:view.k, v3d:view3dPref } };
    meas = { a:null, b:null }; var me = $('atMeas'); if(me) me.hidden = true; mark3d(); showDist(null);
    if(view3dPref){ view3dPref = false; setView3d(false, cur); }     /* 재는 동안만 평면도 — 사용자의 3D 선호는 saved 에 두었다가 되돌린다 */
    hover = null; cv.style.cursor = 'crosshair';
    var b = $('atRulerBtn'); b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
    rulerBar().hidden = false; rulerPaint(); draw();
  }
  function rulerOff(restore){
    if(!ruler) return;
    var sv = ruler.saved; ruler = null;
    var bar = $('atRulebar'); if(bar) bar.hidden = true;
    var b = $('atRulerBtn'); b.classList.remove('on'); b.setAttribute('aria-pressed', 'false');
    cv.style.cursor = 'grab';
    view3dPref = sv.v3d;
    if(restore && cur){ view.lat = sv.lat; view.lon = sv.lon; view.k = sv.k; setView3d(view3dPref, cur); draw(); }
  }
  function rulerLen(pts){ var s = 0; for(var i = 1; i < pts.length; i++) s += km(pts[i - 1], pts[i]); return s; }
  function rulerTotal(){ var s = 0; ruler.paths.forEach(function(p){ s += rulerLen(p); }); if(ruler.drawing) s += rulerLen(ruler.drawing.pts); return s; }
  function rulerPaint(){
    if(!ruler) return;
    var bar = rulerBar();
    [].forEach.call(bar.querySelectorAll('button[data-mode]'), function(b){ b.classList.toggle('on', b.dataset.mode === ruler.mode); });
    $('atRulerTot').textContent = fmtKm(rulerTotal());
    var h = ruler.mode === 'free'
      ? '끌어서 선을 그립니다 · 선을 누르면 그 선을 지움 · 빈 곳을 누르면 모두 지움 · Esc 로 끔'
      : ruler.open ? '누를 때마다 점을 더합니다 (지명 위는 그 자리에 붙음) · 같은 자리 두 번 누름·Enter·오른쪽 단추로 마침'
      : ruler.paths.length ? '선을 누르면 그 구간을 지움 · 점을 누르면 그 점을 지움 · 빈 곳을 누르면 모두 지움' : '지도를 눌러 첫 점을 찍으세요 · 끌면 지도가 움직입니다';
    $('atRulerHint').textContent = h;
  }
  /* 화면 좌표로 점·구간 맞히기 */
  function rulerPtHit(x, y){
    var best = null, bd = 8 * 8;
    ruler.paths.forEach(function(pts, pi){ if(pts.free) return; pts.forEach(function(p, i){ var s = toXY(p[0], p[1]), d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y); if(d < bd){ bd = d; best = { pi:pi, i:i }; } }); });
    return best;
  }
  function rulerSegHit(x, y){
    var best = null, bd = 6;
    ruler.paths.forEach(function(pts, pi){
      for(var i = 1; i < pts.length; i++){
        var a = toXY(pts[i - 1][0], pts[i - 1][1]), b = toXY(pts[i][0], pts[i][1]), dx = b.x - a.x, dy = b.y - a.y, ll = dx * dx + dy * dy;
        var t = ll ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / ll)) : 0;
        var d = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
        if(d <= bd){ bd = d; best = { pi:pi, si:i - 1 }; }
      }
    });
    return best;
  }
  function rulerFinish(){
    if(!ruler) return;
    if(ruler.drawing) rulerFreeUp(null);
    if(ruler.open){ ruler.open = false; var last = ruler.paths[ruler.paths.length - 1]; if(last && last.length < 2) ruler.paths.pop(); }
    rulerPaint(); draw();
  }
  /* 직선 모드의 '누름' */
  function rulerClick(m){
    var ll = fromXY(m.x, m.y), pt = [ll.lat, ll.lon], id = pick(m.x, m.y), p = id && P(id);
    if(p) pt = [p[0], p[1], p[2]];
    if(ruler.open){
      var cur0 = ruler.paths[ruler.paths.length - 1], lp = cur0[cur0.length - 1], ls = toXY(lp[0], lp[1]);
      if(Math.hypot(ls.x - m.x, ls.y - m.y) < 4){ rulerFinish(); return; }   /* 같은 자리 다시 누름(두 번 누르기) = 마침 */
      cur0.push(pt);
    } else {
      var ph = rulerPtHit(m.x, m.y);
      if(ph){ var pts = ruler.paths[ph.pi]; pts.splice(ph.i, 1); if(pts.length < 2) ruler.paths.splice(ph.pi, 1); }
      else {
        var sh = rulerSegHit(m.x, m.y);
        if(sh){                                        /* 구간 하나를 빼면 그 자리에서 두 선으로 갈라진다 */
          var src = ruler.paths[sh.pi], a = src.slice(0, sh.si + 1), b = src.slice(sh.si + 1), rep = [];
          if(a.length > 1) rep.push(a); if(b.length > 1) rep.push(b);
          ruler.paths.splice.apply(ruler.paths, [sh.pi, 1].concat(rep));
        }
        else if(ruler.paths.length){ ruler.paths = []; }   /* 빈 곳 = 모두 지움 */
        else { ruler.paths.push([pt]); ruler.open = true; }
      }
    }
    rulerPaint(); draw();
  }
  /* 자유선 모드: 끄는 동안 4px 마다 점을 더한다 */
  function rulerFreeMove(m){
    var d = ruler.drawing;
    if(Math.hypot(m.x - d.lx, m.y - d.ly) < 4) return;
    if(Math.hypot(m.x - d.sx, m.y - d.sy) > 4) d.moved = true;
    var ll = fromXY(m.x, m.y); d.pts.push([ll.lat, ll.lon]); d.lx = m.x; d.ly = m.y;
    $('atRulerTot').textContent = fmtKm(rulerTotal()); draw();
  }
  function rulerFreeUp(m){
    var d = ruler.drawing; ruler.drawing = null;
    if(d.moved && d.pts.length > 1){ d.pts.free = true; ruler.paths.push(d.pts); }
    else if(m){                                        /* 움직이지 않고 뗌 = 누름: 선 위면 그 선만, 빈 곳이면 모두 지움 */
      var sh = rulerSegHit(m.x, m.y);
      if(sh) ruler.paths.splice(sh.pi, 1); else if(ruler.paths.length) ruler.paths = [];
    }
    rulerPaint(); draw();
  }
  function drawRuler(){
    if(!ruler) return;
    var all = ruler.paths.slice(); if(ruler.drawing) all.push(ruler.drawing.pts);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([]);
    all.forEach(function(pts){
      var sp = pts.map(function(p){ return toXY(p[0], p[1]); }), free = !!pts.free || pts === (ruler.drawing && ruler.drawing.pts);   /* 자유선은 pts.free 표시로 구분 — 모드를 바꿔도 제 모양대로 그린다 */
      if(sp.length > 1){
        [[5.5, RHALO], [2.5, RCOL]].forEach(function(st){ g.lineWidth = st[0]; g.strokeStyle = st[1]; g.beginPath(); sp.forEach(function(s, i){ i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); }); g.stroke(); });
      }
      if(free){
        /* 자유선: 처음·끝 점과 끝에 길이 */
        [sp[0], sp[sp.length - 1]].forEach(function(s){ g.beginPath(); g.arc(s.x, s.y, 3.5, 0, 6.283); g.fillStyle = RCOL; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.fill(); g.stroke(); });
        if(sp.length > 1) haloText(fmtKm(rulerLen(pts)), sp[sp.length - 1].x + 8, sp[sp.length - 1].y - 8, RCOL, 12, 700, 'left');
      } else {
        for(var i = 1; i < sp.length; i++){
          var a = sp[i - 1], b = sp[i], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ang = Math.atan2(b.y - a.y, b.x - a.x);
          var ox = -Math.sin(ang) * 9, oy = Math.cos(ang) * 9; if(oy > 0){ ox = -ox; oy = -oy; }   /* 표지는 늘 구간 위쪽에 */
          haloText(fmtKm(km(pts[i - 1], pts[i])), mx + ox, my + oy, RCOL, 12, 700, 'center');
        }
        sp.forEach(function(s, i){
          g.beginPath(); g.arc(s.x, s.y, 4, 0, 6.283); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = RCOL; g.lineWidth = 2; g.stroke();
          if(pts[i][2]) haloText(pts[i][2], s.x + 7, s.y + 9, RCOL, 11, 600, 'left');
        });
        if(pts.length > 2 && ruler.paths.indexOf(pts) >= 0) haloText('합계 ' + fmtKm(rulerLen(pts)), sp[sp.length - 1].x + 8, sp[sp.length - 1].y - 10, RCOL, 12, 700, 'left');
      }
    });
    g.textAlign = 'left';
  }
  /* ── 머리·옆 칸 ── */
  function refLabel(from){ return from ? APP.ref(from.bi, from.ci, from.vi >= 0 ? from.vi : 0).replace(/:\d+$/, from.vi >= 0 ? '' : '') : ''; }
  function paintHead(){
    $('atTitle').textContent = cur.title;
    $('atEra').textContent = cur.era || '';
    $('atRef').textContent = cur.ref || '';
    var sel = $('atPick'); sel.innerHTML = '';
    list.forEach(function(m){ var o = new Option(m.title, m.id); if(m === cur) o.selected = true; sel.add(o); });
    sel.hidden = list.length < 2;
  }
  function paintSide(){
    if(indexMode){ paintIndex(); var side0 = $('atSide'); var t = document.createElement('div'); t.className = 'at-text at-idxtext'; t.textContent = cur.text || ''; side0.insertBefore(t, side0.children[2] || null); return; }
    var side = $('atSide');
    var legend = (cur.routes || []).map(function(r){ return '<div class="at-lg"><i style="border-top:3px ' + (r.dash ? 'dashed' : 'solid') + ' ' + esc(r.color || '#c0392b') + '"></i>' + esc(r.name) + '</div>'; }).join('');
    var places = (cur.places || []).map(function(id){ var p = P(id); return p && p[4] !== 'p' ? { id:id, p:p } : null; }).filter(Boolean);
    places.sort(function(a, b){ return a.p[2].localeCompare(b.p[2], 'ko'); });
    var f = focusId && P(focusId), fm = focusId && markOf(focusId);
    var marks = (cur.marks || []).filter(function(m){ return P(m[0]); });
    side.innerHTML =
      '<div class="at-text">' + esc(cur.text || '') + '</div>' +
      (f ? '<div class="at-focus"><b>' + esc(f[2]) + '</b> <span class="dim">' + esc(f[3]) + '</span>' + (fm && fm[2] ? '<div class="at-note">' + esc(fm[2]) + '</div>' : '') + (f[4] === 'x' ? '<div class="dim">위치가 확실하지 않아 추정한 자리입니다</div>' : '') + '<div class="dim">' + f[0].toFixed(2) + '°N ' + f[1].toFixed(2) + '°E</div></div>' : '') +
      (marks.length ? '<div class="at-h">사건</div><div class="at-marks">' + marks.map(function(m){ return '<button type="button" class="at-mk k' + m[1] + '" data-id="' + esc(m[0]) + '"><i></i><b>' + esc(P(m[0])[2]) + '</b>' + (m[2] ? '<span>' + esc(m[2]) + '</span>' : '') + '</button>'; }).join('') + '</div>' : '') +
      (legend ? '<div class="at-legend"><div class="at-h">경로</div>' + legend + '</div>' : '') +
      '<div class="at-legend"><div class="at-h">표시</div><div class="at-lg"><i class="sym dot"></i>도시</div><div class="at-lg"><i class="sym dot emph"></i>본문의 중심 장소</div><div class="at-lg"><i class="sym tri"></i>산</div><div class="at-lg"><i class="sym hollow"></i>위치가 불확실한 곳 (?)</div><div class=\"at-lg\"><i class=\"sym mk b\"></i>전투</div><div class=\"at-lg\"><i class=\"sym mk e\"></i>사건</div><div class=\"at-lg\"><i class=\"sym mk c\"></i>진영</div></div>' +
      '<div class="at-h">이 지도의 지명 <span class="dim">' + places.length + '</span></div>' +
      '<div class="at-places">' + places.map(function(x){ return '<button type="button" class="at-pl' + (x.id === focusId ? ' on' : '') + '" data-id="' + esc(x.id) + '">' + esc(x.p[2]) + (x.p[4] === 'x' ? '<span class="q">?</span>' : '') + '</button>'; }).join('') + '</div>' +
      (list.length > 1 ? '<div class="at-h">이 본문의 다른 지도</div><div class="at-others">' + list.filter(function(m){ return m !== cur; }).map(function(m){ return '<button type="button" class="at-other" data-id="' + esc(m.id) + '">' + esc(m.title) + '<span class="dim">' + esc(m.era || '') + '</span></button>'; }).join('') + '</div>' : '');
    [].forEach.call(side.querySelectorAll('.at-pl, .at-mk'), function(b){ b.onclick = function(){ goTo(b.dataset.id); }; });
    [].forEach.call(side.querySelectorAll('.at-other'), function(b){ b.onclick = function(){ var m = byId(b.dataset.id); if(m) open(m, cur.from); }; });
  }

  function init(){
    cv = $('atCanvas');
    cv.addEventListener('mousedown', onDown); cv.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    cv.addEventListener('contextmenu', function(e){ e.preventDefault(); if(ruler){ rulerFinish(); return; } var m = pos(e); measTap(pick(m.x, m.y)); });   /* 거리재기 중엔 오른쪽 단추가 '마침' */
    $('atRulerBtn').onclick = function(){ if(!cur) return; if(ruler) rulerOff(true); else rulerOn(); };
    /* Esc: 거리재기만 끈다 (지도 위에 다른 모달이 없을 때) — app.js 의 Esc(지도 닫기)보다 먼저 받는다. Enter: 열린 직선을 마친다 */
    document.addEventListener('keydown', function(e){
      if(!ruler || $('atlasModal').hidden) return;
      var others = [].filter.call(document.querySelectorAll('.modal'), function(x){ return x.id !== 'atlasModal' && !x.hidden && getComputedStyle(x).display !== 'none'; });   /* hidden 속성 없이 CSS 로만 감춘 모달은 뺀다 */
      if(others.length) return;
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); rulerOff(true); }
      else if(e.key === 'Enter' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)){ e.preventDefault(); rulerFinish(); }
    }, true);
    $('atJ3').addEventListener('contextmenu', function(e){ e.preventDefault(); measTap(pick3d(e.clientX, e.clientY)); });
    $('atJ3').addEventListener('mousemove', on3dMove); $('atJ3').addEventListener('mouseleave', function(){ showDist(null); });
    cv.addEventListener('mouseleave', function(){ showDist(null);  if(!drag && hover){ hover = null; draw(); } });
    cv.addEventListener('wheel', onWheel, { passive:false });
    $('atClose').onclick = function(){ if(window.POP && POP.isPop) POP.close(); else close(); };   /* 따로 뜬 창이면 창을 숨긴다 */
    $('atViewSeg').onclick = function(e){ var b = e.target.closest('button'); if(!b || !cur) return; if(ruler) rulerOff(false); view3dPref = b.dataset.v === '3d'; setView3d(view3dPref, cur); if(!view3dPref) draw(); };
    $('atFavBtn').onclick = toggleFav;
    $('atFavListBtn').onclick = function(){ favMode = !favMode; if(favMode){ indexMode = false; $('atIndexBtn').classList.remove('on'); paintFav(); } else paintSide(); paintStar(); };
    $('atIndexBtn').onclick = function(){ favMode = false; paintStar(); if(indexMode){ indexMode = false; paintSide(); this.classList.remove('on'); } else { indexMode = true; list = allMaps(); paintHead(); paintIndex(); this.classList.add('on'); } };
    $('atFit').onclick = function(){ fitBounds(cur.bounds); draw(); };
    $('atIn').onclick = function(){ view.k = Math.min(6000, view.k * 1.4); draw(); };
    $('atOut').onclick = function(){ view.k = Math.max(8, view.k / 1.4); draw(); };
    $('atPick').onchange = function(){ var m = byId(this.value); if(m) open(m, cur.from); };
    $('atGoVerse').onclick = function(){ if(cur && cur.from){ if(!(window.POP && POP.isPop)) close(); APP.openChapter(cur.from.bi, cur.from.ci, cur.from.vi); } };   /* 팝 창: 지도는 두고 본문 창만 움직인다 */
    var down = false, m = $('atlasModal');
    m.addEventListener('mousedown', function(e){ down = (e.target === m); });
    m.addEventListener('click', function(e){ if(down && e.target === m && !(window.POP && POP.isPop)) close(); down = false; });
  }
  /* 지도를 열고 그 지점을 반짝인다 (본문의 지명 단어에서) */
  function openAt(m, from, placeId, h){
    open(m, from);
    setTimeout(function(){
      if(cur !== m) return;
      if(placeId && P(placeId)){ if(atlas3dOn) TERRAIN3D.focus(P(placeId)[0], P(placeId)[1], P(placeId)[2]); else goTo(placeId); return; }
      if(h){ if(atlas3dOn) TERRAIN3D.focus(h.lat, h.lon, h.name); else { view.lat = h.lat; view.lon = h.lon; draw(); APP.toast(h.name); } }
    }, atlas3dOn ? 900 : 350);
  }
  return { init:init, openFor:openFor, open:open, openAt:openAt, openIndex:openIndex, close:close, byId:byId, mapsFor:mapsFor, isOpen:function(){ return !$('atlasModal').hidden; }, list:function(){ return ATLAS_MAPS; } };
})();
ATLAS.init();
