/* 예루살렘 3D 복원 보기 — three.js. 지형은 실제 고도(data/jer3d-terrain.js), 건물·성벽은 data/jer3d-sites.js,
   표면 질감은 로컬 AI(ComfyUI Flux)로 만든 사진 질감(data/maps/tex). 마우스로 돌리고, 휠로 확대, 오른쪽 끌기로 옮긴다. */
var JER3DV = (function(){
  var T = window.THREE, box, renderer, scene, camera, controls, raf = 0, era = null, labelsEl, labelItems = [], built = {}, running = false;
  var VERT = 1.7;                                   /* 높이 과장 */
  var TR = window.JER3D_TERRAIN, S = window.JER3D;
  var lat0, lon0, cosL, MX = 111320, ground = null, ray = null;

  function xz(lat, lon){ return { x:(lon - lon0) * MX * cosL, z:-(lat - lat0) * MX }; }
  function hAt(lat, lon){                             /* 지형 높이 (쌍선형) */
    var fx = (lon - TR.west) / (TR.east - TR.west) * (TR.nx - 1), fy = (TR.north - lat) / (TR.north - TR.south) * (TR.ny - 1);
    fx = Math.max(0, Math.min(TR.nx - 1.001, fx)); fy = Math.max(0, Math.min(TR.ny - 1.001, fy));
    var ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, h = TR.h, n = TR.nx;
    var a = h[iy * n + ix], b = h[iy * n + ix + 1], c = h[(iy + 1) * n + ix], d = h[(iy + 1) * n + ix + 1];
    return ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty - TR.min) * VERT;
  }
  function tex(url, rep){
    var t = new T.TextureLoader().load(url);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; t.encoding = T.sRGBEncoding; return t;
  }

  function init(container){
    box = container;
    lat0 = (TR.north + TR.south) / 2; lon0 = (TR.west + TR.east) / 2; cosL = Math.cos(lat0 * Math.PI / 180);
    renderer = new T.WebGLRenderer({ antialias:true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    box.appendChild(renderer.domElement);
    labelsEl = document.createElement('div'); labelsEl.className = 'j3-labels'; box.appendChild(labelsEl);
    scene = new T.Scene();
    scene.background = new T.Color(0xbfd3e6); scene.fog = new T.Fog(0xd9dde0, 1300, 4200);
    camera = new T.PerspectiveCamera(38, 1, 5, 20000);
    controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = Math.PI * .47; controls.minDistance = 120; controls.maxDistance = 4200;
    /* 빛: 늦은 오후 북서쪽 해 + 하늘빛 */
    scene.add(new T.HemisphereLight(0xdfe9f3, 0x7a6a4a, .45));
    var sun = new T.DirectionalLight(0xffe6c4, 1.55); sun.position.set(-1600, 900, -700); sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096); var sc = sun.shadow.camera; sc.left = -1800; sc.right = 1800; sc.top = 1800; sc.bottom = -1800; sc.near = 100; sc.far = 5000; sun.shadow.bias = -.0006; sun.shadow.normalBias = 1.5;
    scene.add(sun);
    buildTerrain();
    window.addEventListener('resize', resize);
    new ResizeObserver(resize).observe(box);
  }
  function buildTerrain(){
    var w = (TR.east - TR.west) * MX * cosL, d = (TR.north - TR.south) * MX;
    var geo = new T.PlaneGeometry(w, d, TR.nx - 1, TR.ny - 1); geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position, cols = [];
    for(var i = 0; i < pos.count; i++){
      var ix = i % TR.nx, iy = Math.floor(i / TR.nx), y = (TR.h[iy * TR.nx + ix] - TR.min) * VERT;
      pos.setY(i, y);
      /* 골짜기 바닥은 올리브 녹색, 높은 곳은 밝은 석회암 */
      var k = Math.min(1, y / (260 * VERT)), r = .78 + .2 * k, g = .76 + .16 * k, b = .62 + .2 * k;
      if(k < .3){ var v = (.3 - k) / .3; r -= .12 * v; g -= .02 * v; b -= .12 * v; }
      cols.push(r, g, b);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    var mat = new T.MeshStandardMaterial({ map:tex(MODU.dataBase + 'maps/tex/ground.jpg', 110), vertexColors:true, roughness:.95, metalness:0 });
    var mesh = ground = new T.Mesh(geo, mat); mesh.receiveShadow = true; mesh.castShadow = true; scene.add(mesh);
  }

  /* ── 시대별 건물 ── */
  var stoneMat, roofMat, wallGroup;
  function mats(){
    if(stoneMat) return;
    stoneMat = new T.MeshStandardMaterial({ map:tex(MODU.dataBase + 'maps/tex/stone.jpg', 1), color:0xf1e6cf, roughness:.85 });
    roofMat = new T.MeshStandardMaterial({ map:tex(MODU.dataBase + 'maps/tex/roof.jpg', 1), color:0xffffff, roughness:.95 });
  }
  function boxAt(lat, lon, w, dpt, h, mat, rotY, baseY){
    var m = new T.Mesh(new T.BoxGeometry(w, h, dpt), mat), p = xz(lat, lon), y = baseY != null ? baseY : hAt(lat, lon);
    m.position.set(p.x, y + h / 2, p.z); if(rotY) m.rotation.y = rotY; m.castShadow = true; m.receiveShadow = true; return m;
  }
  function wallLine(pts, g, height, thick, dashed){
    for(var i = 1; i < pts.length; i++){
      var a = pts[i - 1], b = pts[i], pa = xz(a[0], a[1]), pb = xz(b[0], b[1]);
      var len = Math.hypot(pb.x - pa.x, pb.z - pa.z), steps = Math.max(1, Math.ceil(len / 24));
      for(var s = 0; s < steps; s++){
        if(dashed && s % 2) continue;
        var t0 = s / steps, t1 = (s + 1) / steps, la = a[0] + (b[0] - a[0]) * (t0 + t1) / 2, lo = a[1] + (b[1] - a[1]) * (t0 + t1) / 2;
        var seg = boxAt(la, lo, len / steps + .6, thick, height, stoneMat, -Math.atan2(pb.z - pa.z, pb.x - pa.x), hAt(la, lo) - 3);
        g.add(seg);
      }
      if(!dashed){ var tw = boxAt(a[0], a[1], thick * 2.2, thick * 2.2, height * 1.35, stoneMat, 0, hAt(a[0], a[1]) - 3); g.add(tw); }
    }
  }
  function platform(poly, g, topY){
    var shape = new T.Shape();
    poly.forEach(function(p, i){ var q = xz(p[0], p[1]); i ? shape.lineTo(q.x, -q.z) : shape.moveTo(q.x, -q.z); });
    var base = Math.min.apply(null, poly.map(function(p){ return hAt(p[0], p[1]); })) - 20;
    var geo = new T.ExtrudeGeometry(shape, { depth: topY - base, bevelEnabled:false }); geo.rotateX(-Math.PI / 2);
    var m = new T.Mesh(geo, stoneMat); m.position.y = base; m.castShadow = true; m.receiveShadow = true; g.add(m);
    /* 기단 윗면: 밝은 포석 */
    var top = new T.Mesh(new T.ShapeGeometry(shape), new T.MeshStandardMaterial({ color:0xece2cd, roughness:.9 }));
    top.rotation.x = -Math.PI / 2; top.position.y = topY + .3; top.receiveShadow = true; g.add(top);
    return topY;
  }
  function temple(kind, g, topY){
    var r = S.sites.temple_rock, rot = 0;
    if(kind === 'herod'){
      g.add(boxAt(r[0], r[1], 150, 190, 12, stoneMat, rot, topY));                      /* 안뜰 담 */
      g.add(boxAt(r[0], r[1] + .00005, 34, 60, 50, new T.MeshStandardMaterial({ color:0xfbf7ee, roughness:.35 }), rot, topY + 12));  /* 성소 */
      g.add(boxAt(r[0], r[1] + .00030, 52, 12, 52, new T.MeshStandardMaterial({ color:0xf6e7b8, roughness:.3, metalness:.35 }), rot, topY + 12)); /* 현관 */
      g.add(boxAt(r[0], r[1] + .00036, 20, 2, 30, new T.MeshStandardMaterial({ color:0xd9a93a, roughness:.25, metalness:.9 }), rot, topY + 20)); /* 금 포도나무 문 */
      /* 행각: 기단 가장자리를 두른 낮은 지붕 */
      var P = S.platforms.herod;
      for(var i = 0; i < P.length; i++){ var a = P[i], b = P[(i + 1) % P.length], pa = xz(a[0], a[1]), pb = xz(b[0], b[1]);
        var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], len = Math.hypot(pb.x - pa.x, pb.z - pa.z);
        g.add(boxAt(mid[0], mid[1], len, 16, i === 0 ? 20 : 12, roofMat, -Math.atan2(pb.z - pa.z, pb.x - pa.x), topY)); }
    } else {
      var small = kind === 'second';
      g.add(boxAt(r[0], r[1], 70, 110, 5, stoneMat, rot, topY));                         /* 뜰 담 */
      g.add(boxAt(r[0], r[1] + .00004, 12, 32, small ? 16 : 17, new T.MeshStandardMaterial({ color:small ? 0xe9dfcb : 0xf2e8d2, roughness:.6 }), rot, topY + 1));
      g.add(boxAt(r[0], r[1] + .00020, 12, 6, small ? 20 : 26, new T.MeshStandardMaterial({ color:0xe6d6b0, roughness:.5, metalness:.15 }), rot, topY + 1));
    }
  }
  function inPoly(lat, lon, poly){
    var c = false; for(var i = 0, j = poly.length - 1; i < poly.length; j = i++){ var a = poly[i], b = poly[j];
      if(((a[0] > lat) !== (b[0] > lat)) && (lon < (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]) + a[1])) c = !c; } return c;
  }
  function houses(zones, density, g, avoid){
    var rnd = (function(s){ return function(){ s = (s * 16807) % 2147483647; return s / 2147483647; }; })(7);
    var geo = new T.BoxGeometry(1, 1, 1), items = [];
    zones.forEach(function(zk){
      var poly = S.zones[zk]; var la = poly.map(function(p){ return p[0]; }), lo = poly.map(function(p){ return p[1]; });
      var n0 = Math.min.apply(null, la), n1 = Math.max.apply(null, la), w0 = Math.min.apply(null, lo), w1 = Math.max.apply(null, lo);
      var area = (n1 - n0) * MX * (w1 - w0) * MX * cosL, count = Math.round(area / 420 * density);
      for(var i = 0; i < count; i++){
        var lat = n0 + rnd() * (n1 - n0), lon = w0 + rnd() * (w1 - w0);
        if(!inPoly(lat, lon, poly) || (avoid && inPoly(lat, lon, avoid))) continue;
        items.push([lat, lon, 7 + rnd() * 9, 7 + rnd() * 9, 4 + rnd() * 5, rnd() * 1.2]);
      }
    });
    var im = new T.InstancedMesh(geo, roofMat, items.length), m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
    items.forEach(function(it, i){ var p = xz(it[0], it[1]); e.set(0, it[5], 0); q.setFromEuler(e);
      m4.compose(new T.Vector3(p.x, hAt(it[0], it[1]) + it[4] / 2 - 1, p.z), q, new T.Vector3(it[2], it[4], it[3])); im.setMatrixAt(i, m4); });
    var cc = new T.Color(); items.forEach(function(it, i){ var t = rnd(); cc.setRGB(.86 + .12 * t, .78 + .1 * t, .62 + .1 * rnd()); im.setColorAt(i, cc); });
    if(im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true; g.add(im);
  }
  function water(lat, lon, w, d, g){
    var m = new T.Mesh(new T.BoxGeometry(w, 1.5, d), new T.MeshStandardMaterial({ color:0x4f86a8, roughness:.15, metalness:.3 }));
    var p = xz(lat, lon); m.position.set(p.x, hAt(lat, lon) + .4, p.z); m.receiveShadow = true; g.add(m);
  }
  function build(key){
    mats();
    if(wallGroup) scene.remove(wallGroup);
    var E = S.eras[key]; if(!E) return;
    wallGroup = new T.Group();
    var topY = hAt(S.sites.temple_rock[0], S.sites.temple_rock[1]) + 8;
    platform(S.platforms[E.platform], wallGroup, topY);
    temple(E.temple, wallGroup, topY);
    E.walls.forEach(function(k){ wallLine(S.walls[k], wallGroup, k === 'third' ? 11 : 13, 5, k === 'third'); });
    houses(E.zones, E.density, wallGroup, S.platforms[E.platform]);
    if(E.palace){ var hp = S.sites.herod_palace; wallGroup.add(boxAt(hp[0], hp[1], 90, 200, 14, stoneMat, 0));
      [S.sites.phasael, S.sites.hippicus].forEach(function(t){ wallGroup.add(boxAt(t[0], t[1], 18, 18, 42, stoneMat, 0)); }); }
    if(E.antonia){ var an = S.sites.antonia; wallGroup.add(boxAt(an[0], an[1], 120, 80, 26, stoneMat, 0, topY - 4));
      [[.0003,-.0005],[.0003,.0005],[-.0003,-.0005],[-.0003,.0005]].forEach(function(o){ wallGroup.add(boxAt(an[0] + o[0], an[1] + o[1], 16, 16, 40, stoneMat, 0, topY - 4)); }); }
    water(S.sites.siloam[0], S.sites.siloam[1], 50, 60, wallGroup);
    if(key === 'herod') water(S.sites.bethesda[0], S.sites.bethesda[1], 45, 95, wallGroup);
    scene.add(wallGroup);
    /* 이름표 */
    labelsEl.innerHTML = ''; labelItems = [];
    E.labels.forEach(function(k){ var s = S.sites[k]; if(!s) return;
      var el = document.createElement('div'); el.className = 'j3-label'; el.textContent = S.names[k] || k; labelsEl.appendChild(el);
      var p = xz(s[0], s[1]); labelItems.push({ el:el, v:new T.Vector3(p.x, hAt(s[0], s[1]) + (k === 'temple_rock' ? 70 : 28), p.z) }); });
  }
  function resize(){ if(!renderer || !box) return; var w = box.clientWidth, h = box.clientHeight; if(!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  function loop(){
    if(!running) return; controls.update(); renderer.render(scene, camera);
    var w = box.clientWidth, h = box.clientHeight, v = new T.Vector3();
    labelItems.forEach(function(it){ v.copy(it.v).project(camera); var vis = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
      it.el.style.display = vis ? '' : 'none'; if(vis) it.el.style.transform = 'translate(-50%,-100%) translate(' + ((v.x + 1) / 2 * w) + 'px,' + ((1 - v.y) / 2 * h) + 'px)'; });
    raf = requestAnimationFrame(loop);
  }
  function home(){
    var r = S.sites.temple_rock, p = xz(r[0], r[1]), y = hAt(r[0], r[1]);
    controls.target.set(p.x - 250, y - 20, p.z + 250);
    camera.position.set(p.x + 1250, y + 900, p.z + 1450);
  }
  function show(container, key){
    if(!T || !TR || !S) return false;
    if(!renderer) init(container); else if(renderer.domElement.parentNode !== container){ container.appendChild(renderer.domElement); container.appendChild(labelsEl); box = container; }
    if(era !== key){ build(key); era = key; home(); }
    renderer.domElement.style.display = ''; labelsEl.style.display = ''; resize(); running = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); return true;
  }
  function hide(){ running = false; cancelAnimationFrame(raf); if(renderer){ renderer.domElement.style.display = 'none'; labelsEl.style.display = 'none'; } }
  var pv = null;
  function project(lat, lon){
    if(!renderer || !running) return null;
    var r = renderer.domElement.getBoundingClientRect(), p = xz(lat, lon);
    pv = pv || new T.Vector3(); pv.set(p.x, hAt(lat, lon), p.z).project(camera);
    if(pv.z > 1) return null;
    return { x:r.left + (pv.x + 1) / 2 * r.width, y:r.top + (1 - pv.y) / 2 * r.height };
  }
  function pick(cx, cy){
    if(!renderer || !ground || !running) return null;
    var r = renderer.domElement.getBoundingClientRect(); if(!r.width) return null;
    ray = ray || new T.Raycaster();
    ray.setFromCamera({ x:(cx - r.left) / r.width * 2 - 1, y:-(cy - r.top) / r.height * 2 + 1 }, camera);
    var h = ray.intersectObject(ground)[0]; if(!h) return null;
    return { lat:lat0 - h.point.z / MX, lon:lon0 + h.point.x / (MX * cosL) };
  }
  return { show:show, hide:hide, pick:pick, project:project, active:function(){ return running; }, home:function(){ if(renderer) home(); }, ok:function(){ return !!(T && T.OrbitControls && TR && S); } };
})();
