/* 성경지도 학습 — 실제 고도 격자(STUDY_DEM, SRTM·ETOPO)로 세운 3D 지형. 마우스로 돌리고(끌기) 확대하고(휠) 옮긴다(오른쪽 끌기).
   TERRAIN3D.show(container, view) — view: { dem, n,w,s,e, vert, labels:[[lat,lon,글,'s'?]], cam:{ from:[lat,lon,km], at:[lat,lon] }, paint:function(canvas, win) }
   paint 가 있으면 그 함수가 그린 그림(지역 구분·도로·강수)을 지형 위에 입힌다. */
window.TERRAIN3D = (function(){
  var T = window.THREE, renderer, scene, camera, controls, mesh, labelsEl, box, raf, running = false, curKey = '', labels = [], view = null;
  var dems = {}, lastView = null;
  function dem(id){
    if(dems[id]) return dems[id];
    var d = window.STUDY_DEM && STUDY_DEM[id]; if(!d) return null;
    var bin = atob(d.z), z = new Int16Array(bin.length / 2);
    for(var i = 0; i < z.length; i++) z[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) << 16 >> 16;
    var wb = atob(d.water), water = new Uint8Array(d.rows * d.cols);
    for(var k = 0; k < water.length; k++) water[k] = (wb.charCodeAt(k >> 3) >> (7 - (k & 7))) & 1;
    dems[id] = { north:d.north, west:d.west, south:d.south, east:d.east, rows:d.rows, cols:d.cols, z:z, water:water, sea:id === 'ane' };   /* ETOPO 는 바다 깊이가 음수 */
    return dems[id];
  }
  /* 창(n,w,s,e)에 해당하는 격자 부분 */
  function cropOf(D, v){
    var r0 = Math.max(0, Math.floor((D.north - v.n) / (D.north - D.south) * D.rows)), r1 = Math.min(D.rows, Math.ceil((D.north - v.s) / (D.north - D.south) * D.rows));
    var c0 = Math.max(0, Math.floor((v.w - D.west) / (D.east - D.west) * D.cols)), c1 = Math.min(D.cols, Math.ceil((v.e - D.west) / (D.east - D.west) * D.cols));
    var rows = r1 - r0, cols = c1 - c0, z = new Float32Array(rows * cols), water = new Uint8Array(rows * cols);
    for(var r = 0; r < rows; r++) for(var c = 0; c < cols; c++){ var k = (r0 + r) * D.cols + c0 + c, zz = D.z[k], sea = zz < -30000 || (D.sea && zz < 0); z[r * cols + c] = sea ? 0 : zz; water[r * cols + c] = D.water[k] || (sea ? 1 : 0); }
    var n = D.north - r0 / D.rows * (D.north - D.south), s = D.north - r1 / D.rows * (D.north - D.south), w = D.west + c0 / D.cols * (D.east - D.west), e = D.west + c1 / D.cols * (D.east - D.west);
    return { rows:rows, cols:cols, z:z, water:water, n:n, s:s, w:w, e:e };
  }
  function tint(z){
    var st = [[-430, [120, 150, 90]], [0, [176, 200, 140]], [150, [214, 208, 150]], [400, [210, 186, 126]], [800, [186, 150, 100]], [1400, [158, 118, 84]], [2200, [200, 190, 180]], [3000, [245, 245, 245]]];
    z = Math.max(-430, Math.min(3000, z));
    for(var i = 0; i < st.length - 1; i++) if(z >= st[i][0] && z <= st[i + 1][0]){ var t = (z - st[i][0]) / (st[i + 1][0] - st[i][0]), a = st[i][1], b = st[i + 1][1]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    return st[st.length - 1][1];
  }
  /* 바탕 그림: 색조 + 음영. 덧그림(paint)이 있으면 그 위에 */
  /* 바다·호수: 투명한 파랑을 덧칠해 물 밑 지형이 비친다 */
  function seaGlaze(g, C, up){
    g.fillStyle = 'rgba(60,130,210,.72)';
    for(var r = 0; r < C.rows; r++){
      var c = 0;
      while(c < C.cols){
        if(!C.water[r * C.cols + c]){ c++; continue; }
        var c0 = c; while(c < C.cols && C.water[r * C.cols + c]) c++;
        g.fillRect(c0 * up, r * up, (c - c0) * up, up);
      }
    }
  }
  function baseCanvas(C, v){
    var up = Math.max(2, Math.ceil(2048 / Math.max(C.cols, C.rows))), W = C.cols * up, H = C.rows * up, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    if(v.baseImg && v.baseBox){
      var B = v.baseBox, im = v.baseImg;
      var sx = (C.w - B.west) / (B.east - B.west) * im.width, sy = (B.north - C.n) / (B.north - B.south) * im.height, sw = (C.e - C.w) / (B.east - B.west) * im.width, sh = (C.n - C.s) / (B.north - B.south) * im.height;
      g.fillStyle = '#6092c4'; g.fillRect(0, 0, W, H);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(im, sx, sy, sw, sh, 0, 0, W, H);
      if(v.paint) try{ v.paint(cv, { n:C.n, s:C.s, w:C.w, e:C.e }); }catch(e){ console.error(e); }
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; seaGlaze(g, C, up);
      return cv;
    }
    var small = document.createElement('canvas'); small.width = C.cols; small.height = C.rows;
    var sg = small.getContext('2d'), id = sg.createImageData(C.cols, C.rows), d = id.data;
    var cosl = Math.cos((C.n + C.s) / 2 * Math.PI / 180), dx = (C.e - C.w) / C.cols * 111320 * cosl, dy = (C.n - C.s) / C.rows * 111320;
    var az = 315 * Math.PI / 180, alt = 42 * Math.PI / 180;
    function h(r, c){ r = Math.max(0, Math.min(C.rows - 1, r)); c = Math.max(0, Math.min(C.cols - 1, c)); return C.z[r * C.cols + c]; }
    for(var r = 0; r < C.rows; r++) for(var c = 0; c < C.cols; c++){
      var k = r * C.cols + c, i4 = k * 4;
      if(C.water[k]){ d[i4] = 190; d[i4 + 1] = 205; d[i4 + 2] = 215; d[i4 + 3] = 255; continue; }
      var gx = (h(r, c + 1) - h(r, c - 1)) / (2 * dx), gy = (h(r + 1, c) - h(r - 1, c)) / (2 * dy);
      var sl = Math.atan(1.6 * Math.hypot(gx, gy)), asp = Math.atan2(-gx, gy);
      var sh = Math.max(0, Math.sin(alt) * Math.cos(sl) + Math.cos(alt) * Math.sin(sl) * Math.cos(az - asp));
      var col = tint(C.z[k]), f = .5 + .7 * sh;
      d[i4] = Math.min(255, col[0] * f); d[i4 + 1] = Math.min(255, col[1] * f); d[i4 + 2] = Math.min(255, col[2] * f); d[i4 + 3] = 255;
    }
    sg.putImageData(id, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(small, 0, 0, W, H);
    if(v.paint){
      try{ v.paint(cv, { n:C.n, s:C.s, w:C.w, e:C.e }); }catch(e){ console.error(e); }
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; seaGlaze(g, C, up);
    return cv;
  }
  function init(container){
    box = container;
    renderer = new T.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    container.appendChild(renderer.domElement);
    labelsEl = document.createElement('div'); labelsEl.className = 'j3-labels'; container.appendChild(labelsEl);
    scene = new T.Scene(); scene.background = new T.Color(0xcfdfee);
    camera = new T.PerspectiveCamera(40, 1, .5, 9000);
    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = Math.PI * .49; controls.screenSpacePanning = false;
    scene.add(new T.HemisphereLight(0xffffff, 0x8a7a5a, .9));
    var sun = new T.DirectionalLight(0xfff2dc, .7); sun.position.set(-800, 900, -500); scene.add(sun);
    new ResizeObserver(resize).observe(container);
  }
  var ck = {};
  /* km 높이: 지형 높이는 과장(vert)하고, 카메라 높이는 그대로 */
  function world(v, lat, lon, km, raw){ return { x:(lon - ck.lon0) * ck.kx, z:-(lat - ck.lat0) * ck.ky, y:(km || 0) * (raw ? 1 : v.vert) }; }
  function hAt(C, lat, lon){ var r = Math.max(0, Math.min(C.rows - 1, Math.round((C.n - lat) / (C.n - C.s) * C.rows))), c = Math.max(0, Math.min(C.cols - 1, Math.round((lon - C.w) / (C.e - C.w) * C.cols))); return C.z[r * C.cols + c] / 1000; }
  function build(v){
    var D = dem(v.dem); if(!D) return false;
    var C = cropOf(D, v); ck.C = C; ck.v = v;
    ck.lat0 = (C.n + C.s) / 2; ck.lon0 = (C.w + C.e) / 2; ck.ky = 111.32; ck.kx = 111.32 * Math.cos(ck.lat0 * Math.PI / 180);
    var w = (C.e - C.w) * ck.kx, d = (C.n - C.s) * ck.ky;
    if(mesh){ scene.remove(mesh); mesh.geometry.dispose(); mesh.material.map.dispose(); mesh.material.dispose(); }
    var geo = new T.PlaneGeometry(w, d, C.cols - 1, C.rows - 1); geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    for(var i = 0; i < pos.count; i++){ var ix = i % C.cols, iy = Math.floor(i / C.cols), zz = C.z[iy * C.cols + ix]; if(C.water[iy * C.cols + ix] && zz < 0 && zz > -100) zz = 0; pos.setY(i, zz / 1000 * v.vert); }
    geo.computeVertexNormals();
    var tex = new T.CanvasTexture(baseCanvas(C, v)); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
    mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ map:tex })); scene.add(mesh);
    /* 지명 */
    labelsEl.innerHTML = ''; labels = [];
    (v.labels || []).forEach(function(l){
      var el = document.createElement('div'); el.className = 'j3-label' + (l[3] === 's' ? ' small' : ''); el.textContent = l[2]; labelsEl.appendChild(el);
      var p = world(v, l[0], l[1], hAt(C, l[0], l[1])); labels.push({ el:el, v:new T.Vector3(p.x, p.y, p.z) });
    });
    /* 카메라 */
    var f = v.cam.from, a = v.cam.at, pf = world(v, f[0], f[1], f[2], true), pa = world(v, a[0], a[1], hAt(C, a[0], a[1]));
    camera.position.set(pf.x, pf.y, pf.z); controls.target.set(pa.x, pa.y, pa.z);
    controls.minDistance = Math.max(2, Math.hypot(w, d) * .05); controls.maxDistance = Math.hypot(w, d) * 3; camera.far = Math.hypot(w, d) * 12; camera.updateProjectionMatrix();
    ck.home = { p:camera.position.clone(), t:controls.target.clone() };
    controls.update();
    return true;
  }
  function resize(){ if(!renderer || !box) return; var w = box.clientWidth || 800, h = box.clientHeight || 500; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  var tmp = null;
  function loop(){
    if(!running) return;
    controls.update(); renderer.render(scene, camera);
    if(!tmp) tmp = new T.Vector3();
    var W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight;
    labels.forEach(function(l){ tmp.copy(l.v).project(camera); var on = tmp.z < 1 && tmp.x > -1 && tmp.x < 1 && tmp.y > -1 && tmp.y < 1; l.el.style.display = on ? '' : 'none'; if(on){ l.el.style.transform = 'translate(-50%,-100%) translate(' + ((tmp.x + 1) / 2 * W) + 'px,' + ((1 - tmp.y) / 2 * H - 8) + 'px)'; } });
    raf = requestAnimationFrame(loop);
  }
  function show(container, v, key){
    if(!T || !T.OrbitControls || !window.STUDY_DEM) return false;
    if(!renderer) init(container); else if(renderer.domElement.parentNode !== container){ container.appendChild(renderer.domElement); container.appendChild(labelsEl); box = container; }
    view = v;
    if(key !== curKey || v !== lastView){ if(!build(v)) return false; curKey = key; lastView = v; }
    renderer.domElement.style.display = ''; labelsEl.style.display = ''; resize(); running = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); return true;
  }
  function hide(){ running = false; cancelAnimationFrame(raf); if(renderer){ renderer.domElement.style.display = 'none'; labelsEl.style.display = 'none'; } }
  /* 지명 강조: 표지를 밝히고 카메라를 그 가까이로 옮긴다 */
  var focusEl = null, focusPt = null;
  function focus(lat, lon, name){
    if(!view) return;
    var D = dem(view.dem), C = cropOf(D, view), p = world(view, lat, lon, hAt(C, lat, lon));
    var pt = new T.Vector3(p.x, p.y, p.z);
    labels.forEach(function(l){ l.el.classList.remove('hot'); });
    var l = labels.filter(function(l){ return l.v.distanceTo(pt) < 1 || l.el.textContent === name; })[0];
    if(!l){ var el = document.createElement('div'); el.className = 'j3-label'; el.textContent = name; labelsEl.appendChild(el); l = { el:el, v:pt }; labels.push(l); }
    l.el.classList.add('hot'); focusEl = l.el;
    /* 카메라: 지금 거리의 절반 이하로 다가가되 방향은 유지 */
    var dir = camera.position.clone().sub(controls.target), dist = Math.min(dir.length(), Math.max(controls.minDistance * 3, dir.length() * .45));
    dir.normalize().multiplyScalar(dist);
    var t0 = controls.target.clone(), p0 = camera.position.clone(), t1 = pt.clone(), p1 = pt.clone().add(dir), st = performance.now();
    (function anim(now){ var k = Math.min(1, (now - st) / 700); k = k * k * (3 - 2 * k); controls.target.lerpVectors(t0, t1, k); camera.position.lerpVectors(p0, p1, k); controls.update(); if(k < 1) requestAnimationFrame(anim); })(st);
  }
  /* 화면 좌표 → 지형 위 위도·경도 (선 거리 말풍선용) */
  var ray = null;
  function pick(cx, cy){
    if(!renderer || !mesh || !running) return null;
    var r = renderer.domElement.getBoundingClientRect(); if(!r.width) return null;
    ray = ray || new T.Raycaster();
    ray.setFromCamera({ x:(cx - r.left) / r.width * 2 - 1, y:-(cy - r.top) / r.height * 2 + 1 }, camera);
    var h = ray.intersectObject(mesh)[0]; if(!h) return null;
    return { lat:ck.lat0 - h.point.z / ck.ky, lon:ck.lon0 + h.point.x / ck.kx };
  }
  var pv = null;
  function project(lat, lon){
    if(!renderer || !ck.C || !running) return null;
    var r = renderer.domElement.getBoundingClientRect(), p = world(ck.v, lat, lon, hAt(ck.C, lat, lon));
    pv = pv || new T.Vector3(); pv.set(p.x, p.y, p.z).project(camera);
    if(pv.z > 1) return null;
    return { x:r.left + (pv.x + 1) / 2 * r.width, y:r.top + (1 - pv.y) / 2 * r.height };
  }
  function home(){ if(ck.home){ camera.position.copy(ck.home.p); controls.target.copy(ck.home.t); controls.update(); } }
  return { show:show, hide:hide, pick:pick, project:project, home:home, focus:focus, _crop:function(v){ return cropOf(dem(v.dem), v); }, ok:function(){ return !!(T && T.OrbitControls && window.STUDY_DEM); }, el:function(){ return renderer && renderer.domElement; } };
})();
