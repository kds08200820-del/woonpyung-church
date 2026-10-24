/* ============================================================
   신앙 정원 — 내 모습 만들기 (2026-10-25 담임목사: "내 모습 캐릭터를 바꾸는 것이 아니라 이목구비, 눈썹, 피부색, 머리색,
     얼굴의 눈·코·입·귀 형태, 몸매 사이즈, 키 등 모든 신체 구조에 대한 설정이 가능해야")
   · 설정 33갈래(얼굴형·피부·볼·점 / 눈 모양·크기·사이·색·속눈썹 / 눈썹 모양·굵기·색 / 코·입·입술·귀 / 머리 모양·색·수염 /
     키·체형·어깨·다리·머리 크기 / 윗옷·아래옷·색·신발·안경)를 SVG 한 장으로 그린다 — 그림 파일이 필요 없다
   · 저장: 서버 칸을 늘리지 않고 garden_profiles.avatar_key(garden_set_profile 이 ^[a-z0-9-]{1,20}$ 만 받는다)에
     '1'(판) + 36진수 19자로 접어 넣는다(갈래마다 진법이 다른 혼합 진법). 그래서 이웃 방문·방명록·이웃 목록에도 그대로 보인다
     ※ V1 의 갈래 순서와 진법(둘째 수)은 절대 바꾸지 말 것 — 바꿔야 하면 새 판('2')을 만들고 V1 풀이는 남긴다.
       고를거리(셋째 수)는 진법 안에서 뒤에 덧붙일 수만 있다(앞의 번호가 곧 저장된 값)
   · 예전 그림 키(m1~m4·f1~f4·pastor·a/b/c)는 그대로 그림으로 보이고, 고치기 시작하면 비슷한 설정에서 출발한다
   GardenAvatar.isCustom(key) · decode(key) · encode(spec) · fromKey(key) · defaults() · random()
     · svg(spec, view) · uri(spec, view)   view = full|face|head|eyes|brows|nose|mouth|ear|torso|legs
     · editor(host, { t, onChange }) → { set(spec, base), get() }
   ============================================================ */
window.GardenAvatar = (function () {
  'use strict';
  /* [갈래, 진법(저장 칸 크기), 지금 고를 수 있는 개수, 기본값] — 순서·진법 고정(위 ※) */
  var V1 = [
    ['face', 8, 8, 0], ['skin', 16, 12, 2], ['blush', 4, 4, 1], ['mark', 4, 4, 0],
    ['eye', 10, 10, 0], ['eyeSize', 7, 7, 3], ['eyeGap', 7, 7, 3], ['eyeColor', 10, 8, 0], ['lash', 3, 3, 0],
    ['brow', 8, 8, 2], ['browThick', 5, 5, 2], ['browColor', 9, 9, 0],
    ['nose', 8, 8, 1], ['noseSize', 5, 5, 2],
    ['mouth', 8, 8, 0], ['mouthSize', 5, 5, 2], ['lip', 6, 6, 0],
    ['ear', 6, 6, 0], ['earSize', 5, 5, 2],
    ['hair', 24, 18, 1], ['hairColor', 16, 12, 0], ['beard', 8, 6, 0],
    ['height', 11, 11, 5], ['build', 9, 9, 3], ['shoulder', 7, 7, 3], ['leg', 5, 5, 2], ['head', 5, 5, 2],
    ['top', 10, 7, 2], ['topColor', 16, 16, 2], ['bottom', 8, 5, 0], ['bottomColor', 12, 12, 0], ['shoes', 8, 8, 0], ['glasses', 8, 6, 0]
  ];
  var DIGITS = 19, B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  var IDX = {}; V1.forEach(function (p) { IDX[p[0]] = p; });

  var SKIN = ['#FCE6D8', '#F9DCC8', '#F5D0B5', '#EFC3A2', '#E8B590', '#DDA47D', '#CF936B', '#BE8059', '#A86C48', '#8F583A', '#73452E', '#563222'];
  var HAIR = ['#2A2220', '#3E2C23', '#5C3D2B', '#86593A', '#8E4129', '#D4AF73', '#9C948C', '#8A8886', '#B9B5AF', '#E6E2DB', '#6B2536', '#2C3654'];
  var EYE = ['#3B2618', '#5E3B22', '#8B5B2C', '#1F1B19', '#6C7A84', '#3F78B5', '#4C8A5A', '#B07A2A'];
  var BROW = ['#26201E', '#3B2A22', '#5A3C2A', '#86593A', '#C9A46C', '#8A8886', '#D9D5CE', '#8E4129'];   /* browColor 1~8 (0 = 머리색 따라) */
  var LIP = ['#D98A7C', '#E68C9C', '#F08A6C', '#D2424F', '#B5546B', '#C68A72'];
  var TOP = ['#F7F4EE', '#EFE5CF', '#A9DCC6', '#9CC4E8', '#34466F', '#6FA77A', '#8C8F55', '#F2CC5B', '#F6C3A1', '#EE8E4E', '#D2504A', '#F0A6B8', '#A48BCB', '#D8BE9A', '#A7A7AB', '#3A3A3F'];
  var BOTTOM = ['#D9C3A0', '#4C6D99', '#2E4468', '#34343A', '#8D8D92', '#7A553A', '#2D3A5E', '#F2EFE8', '#7D7F4E', '#EEE3C8', '#7A2D3E', '#E7A3B3'];
  var SHOES = ['#7A4E2E', '#F4F2EE', '#2E2B2B', '#E8B84A', '#C9473F', '#34466E', '#9A9A9E', '#EBA2B2'];
  var LID = '#3A2A24';

  /* ── 값 ↔ 저장 키 ── */
  function norm(sp) {
    var s = {}; sp = sp || {};
    V1.forEach(function (p) { var v = Math.floor(+sp[p[0]]); s[p[0]] = v >= 0 && v < p[2] ? v : p[3]; });
    return s;
  }
  function defaults() { return norm({}); }
  function used(k) { return IDX[k][2]; }
  function encode(sp) {
    var s = norm(sp), d = [0];
    for (var i = V1.length - 1; i >= 0; i--) {                         /* 맨 끝 갈래가 가장 큰 자리 */
      var carry = s[V1[i][0]], m = V1[i][1];
      for (var k = 0; k < d.length; k++) { var x = d[k] * m + carry; d[k] = x % 36; carry = Math.floor(x / 36); }
      while (carry) { d.push(carry % 36); carry = Math.floor(carry / 36); }
    }
    var out = ''; for (var j = DIGITS - 1; j >= 0; j--) out += B36.charAt(d[j] || 0);
    return '1' + out;
  }
  function isCustom(key) { return /^1[0-9a-z]{19}$/.test(String(key || '')); }
  function decode(key) {
    if (!isCustom(key)) return null;
    var str = String(key).slice(1), d = [], s = {};
    for (var j = DIGITS - 1; j >= 0; j--) d.push(B36.indexOf(str.charAt(j)));   /* d[0] = 가장 작은 자리 */
    for (var i = 0; i < V1.length; i++) {
      var m = V1[i][1], rem = 0;
      for (var k = d.length - 1; k >= 0; k--) { var x = rem * 36 + d[k]; d[k] = Math.floor(x / m); rem = x % m; }
      s[V1[i][0]] = rem;
    }
    return norm(s);
  }
  /* 예전 그림 인물과 비슷한 출발점 */
  var LEGACY = {
    m1: { hair: 1, glasses: 1, top: 2, topColor: 2, shoes: 1 },
    pastor: { hair: 1, glasses: 1, top: 3, topColor: 2 },
    f1: { hair: 9, eye: 1, lash: 1, top: 3, topColor: 8, bottom: 3, bottomColor: 9, shoes: 3 },
    m2: { hair: 2, top: 0, topColor: 3, bottomColor: 1, shoes: 1 },
    f2: { hair: 8, lash: 1, top: 6, topColor: 11, bottom: 2, bottomColor: 9, shoes: 7 },
    m3: { hair: 3, brow: 0, top: 1, topColor: 0, bottomColor: 6, shoes: 2 },
    f3: { hair: 11, lash: 1, top: 0, topColor: 7, bottomColor: 1, shoes: 1 },
    m4: { hair: 6, hairColor: 8, glasses: 2, top: 4, topColor: 4, bottomColor: 6, shoes: 2 },
    f4: { hair: 15, hairColor: 1, lash: 1, top: 3, topColor: 12, bottom: 3, bottomColor: 9 }
  };
  LEGACY.a = LEGACY.m1; LEGACY.b = LEGACY.f1; LEGACY.c = LEGACY.m2;
  function fromKey(key) {
    var s = decode(key); if (s) return s;
    var L = LEGACY[String(key || '').toLowerCase()], d = defaults();
    if (L) for (var k in L) d[k] = L[k];
    return norm(d);
  }
  function random() {
    var s = {};
    function r(n) { return Math.floor(Math.random() * n); }
    function mid(n) { return Math.round((Math.random() + Math.random()) / 2 * (n - 1)); }
    V1.forEach(function (p) { s[p[0]] = r(p[2]); });
    ['eyeSize', 'eyeGap', 'browThick', 'noseSize', 'mouthSize', 'earSize', 'height', 'build', 'shoulder', 'leg', 'head'].forEach(function (k) { s[k] = mid(used(k)); });
    if (Math.random() < 0.75) s.beard = 0;
    if (Math.random() < 0.65) s.glasses = 0;
    if (Math.random() < 0.7) s.mark = 0;
    if (Math.random() < 0.7) s.browColor = 0;
    if (Math.random() < 0.6) s.lip = 0;
    if (Math.random() < 0.75) s.hairColor = r(4);
    if (Math.random() < 0.8) s.eyeColor = r(4);
    return norm(s);
  }

  /* ── 그리기 도우미 ── */
  function f(n) { return Math.round(n * 10) / 10; }
  function pt(x, y) { return f(x) + ',' + f(y); }
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return '#' + [0, 1, 2].map(function (i) { var v = Math.round(x[i] + (y[i] - x[i]) * t); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function dk(c, t) { return mix(c, '#2a1810', t); }
  function lt(c, t) { return mix(c, '#ffffff', t); }
  function lum(c) { var x = rgb(c); return (0.299 * x[0] + 0.587 * x[1] + 0.114 * x[2]) / 255; }
  function browOf(hair) { return lum(hair) > 0.55 ? mix(hair, '#4a3a30', 0.35) : dk(hair, 0.1); }
  /* 점들을 지나는 부드러운 곡선(Catmull-Rom → 베지어). 셋째 값이 있는 점은 모서리 */
  function smooth(p, closed, k) {
    k = k == null ? 0.17 : k;
    var n = p.length, d = 'M' + pt(p[0][0], p[0][1]), last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
      var t1 = p1[2] ? 0 : k, t2 = p2[2] ? 0 : k;
      d += 'C' + pt(p1[0] + (p2[0] - p0[0]) * t1, p1[1] + (p2[1] - p0[1]) * t1) + ' ' + pt(p2[0] - (p3[0] - p1[0]) * t2, p2[1] - (p3[1] - p1[1]) * t2) + ' ' + pt(p2[0], p2[1]);
    }
    return d + (closed ? 'Z' : '');
  }
  function shape(d, fill, stroke, sw, extra) {
    return '<path d="' + d + '" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + f(sw || 2) + '" stroke-linejoin="round"' : '') + (extra || '') + '/>';
  }
  function line(d, c, w, op, capStyle) {
    return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + f(w) + '" stroke-linecap="' + (capStyle || 'round') + '" stroke-linejoin="round"' + (op != null ? ' opacity="' + op + '"' : '') + '/>';
  }
  /* 테두리 있는 굵은 선(팔·다리) */
  function cap(d, w, c, oc, capStyle) { return line(d, oc || dk(c, 0.3), w + 3, null, capStyle) + line(d, c, w, null, capStyle); }
  function circ(x, y, r, fill, extra) { return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function ell(x, y, rx, ry, fill, extra) { return '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function mirror(cx, R) { var L = []; for (var i = R.length - 1; i >= 0; i--) L.push([2 * cx - R[i][0], R[i][1], R[i][2]]); return L; }

  /* ── 몸의 치수 ── */
  var FACE = [
    { fw: 0.95, cw: 1.0, jw: 0.86, chw: 0.46, hr: 1.0 },     /* 둥근형 */
    { fw: 0.9, cw: 0.93, jw: 0.74, chw: 0.32, hr: 1.05 },    /* 계란형 */
    { fw: 1.0, cw: 0.93, jw: 0.66, chw: 0.2, hr: 1.0 },      /* 하트형 */
    { fw: 0.95, cw: 0.98, jw: 0.94, chw: 0.62, hr: 0.98 },   /* 각진형 */
    { fw: 0.86, cw: 0.88, jw: 0.76, chw: 0.38, hr: 1.13 },   /* 긴 얼굴 */
    { fw: 0.82, cw: 1.0, jw: 0.72, chw: 0.26, hr: 1.05 },    /* 마름모형 */
    { fw: 0.94, cw: 1.07, jw: 1.0, chw: 0.62, hr: 0.96 },    /* 통통한 얼굴 */
    { fw: 0.95, cw: 0.92, jw: 0.6, chw: 0.13, hr: 1.05 }     /* V라인 */
  ];
  function geom(s) {
    var hs = [0.9, 0.95, 1, 1.05, 1.1][s.head], F = FACE[s.face], cx = 200;
    var a = 74 * hs, h = 158 * hs * F.hr;
    var hk = 0.82 + s.height * 0.034, lr = [0.9, 0.95, 1, 1.05, 1.1][s.leg];
    var wf = 0.8 + s.build * 0.07, sw = 0.88 + s.shoulder * 0.04;
    var ground = 590, shoeH = 14;
    var L = 152 * hk * lr, T = 122 * hk * (1 + (1 - lr) * 0.6);
    var yHip = ground - shoeH - L, ySh = yHip - T, yChin = ySh - 12 * hk, top = yChin - h;
    var g = { cx: cx, hs: hs, a: a, h: h, top: top, yChin: yChin, ySh: ySh, yHip: yHip, ground: ground, shoeH: shoeH, L: L, T: T, hk: hk, wf: wf, sw: sw };
    g.SH = 62 * sw * (0.78 + 0.22 * wf);
    g.WH = 48 * wf * (0.92 + 0.08 * sw);
    g.HPH = 50 * Math.pow(wf, 0.9);
    g.NW = 14 * (0.9 + 0.12 * wf);
    g.AT = 25 * (0.78 + 0.22 * wf);
    g.LT = 27 * (0.72 + 0.28 * wf);
    /* 얼굴 윤곽(오른쪽, 정수리 → 턱) */
    g.fp = [[cx, top], [cx + a * F.fw * 0.62, top + h * 0.05], [cx + a * F.fw, top + h * 0.3], [cx + a * F.cw, top + h * 0.57], [cx + a * F.jw, top + h * 0.8], [cx + a * F.chw, top + h * 0.965], [cx, top + h]];
    g.er = 9.5 * hs * (0.8 + s.eyeSize * 0.065);
    g.ey = top + h * 0.58;
    g.edx = a * (0.38 + (s.eyeGap - 3) * 0.035);
    g.yb = g.ey - (g.er * 1.55 + 9 * hs);
    g.yn = top + h * 0.715;
    g.ym = top + h * 0.835;
    g.mw = 11 * (0.75 + s.mouthSize * 0.125) * hs;
    return g;
  }
  function faceHalf(g, y) {
    var p = g.fp;
    for (var i = 1; i < p.length; i++) if (y <= p[i][1]) { var t = (y - p[i - 1][1]) / ((p[i][1] - p[i - 1][1]) || 1); return p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t - g.cx; }
    return 0;
  }
  function facePath(g) {
    var p = g.fp, L = p.slice();
    return smooth(L.concat(mirror(g.cx, p.slice(1, p.length - 1))), true, 0.17);
  }

  /* ── 머리 모양: 머리 상자 기준 좌표(x 는 얼굴 반폭 a, y 는 얼굴 높이 h 배수, 0 = 정수리 · 1 = 턱) ── */
  var SKULL = [[-1.07, 0.62], [-1.12, 0.36], [-0.96, 0.07], [-0.55, -0.08], [0, -0.11], [0.55, -0.08], [0.96, 0.07], [1.12, 0.36], [1.07, 0.62], [0.85, 0.7], [-0.85, 0.7]];
  var BOB_B = [[-1.16, 0.3], [-1.24, 0.62], [-1.2, 0.95], [-1.05, 1.04, 1], [1.05, 1.04, 1], [1.2, 0.95], [1.24, 0.62], [1.16, 0.3], [0.9, -0.03], [0, -0.12], [-0.9, -0.03]];
  var LONG_B = [[-1.16, 0.3], [-1.24, 0.8], [-1.27, 1.35], [-1.22, 1.75, 1], [1.22, 1.75, 1], [1.27, 1.35], [1.24, 0.8], [1.16, 0.3], [0.9, -0.03], [0, -0.12], [-0.9, -0.03]];
  var CROWN = [[-1.22, 0.55], [-1.12, 0.2], [-0.72, -0.06], [0, -0.13], [0.72, -0.06], [1.12, 0.2], [1.22, 0.55]];   /* 긴 머리 겉선 */
  var PART_C = [[0.97, 0.62], [0.9, 0.36], [0.6, 0.17], [0, 0.06, 1], [-0.6, 0.17], [-0.9, 0.36], [-0.97, 0.62]];  /* 가운데 가르마 머리선 */
  var BANGS = [[0.97, 0.6], [0.93, 0.38], [0.72, 0.36, 1], [0.52, 0.32], [0.3, 0.36, 1], [0.08, 0.32], [-0.14, 0.36, 1], [-0.36, 0.32], [-0.58, 0.36, 1], [-0.78, 0.32], [-0.93, 0.38], [-0.97, 0.6]];
  var PULLED = [[-1.03, 0.55, 1], [-1.1, 0.3], [-0.97, 0.07], [-0.58, -0.1], [0, -0.14], [0.58, -0.1], [0.97, 0.07], [1.1, 0.3], [1.03, 0.55, 1], [0.94, 0.55, 1], [0.91, 0.32], [0.72, 0.2], [0.38, 0.15], [0, 0.17], [-0.38, 0.15], [-0.72, 0.2], [-0.91, 0.32], [-0.94, 0.55, 1]];
  var CROP = [[-1.02, 0.5, 1], [-1.08, 0.32], [-0.95, 0.1], [-0.58, -0.05], [0, -0.09], [0.58, -0.05], [0.95, 0.1], [1.08, 0.32], [1.02, 0.5, 1], [0.93, 0.5, 1], [0.9, 0.34], [0.68, 0.25], [0.34, 0.23], [0, 0.24], [-0.34, 0.23], [-0.68, 0.25], [-0.9, 0.34], [-0.93, 0.5, 1]];
  function longFront(sideY, inner) { return [[-1.2, sideY, 1]].concat(CROWN, [[1.2, sideY, 1], [1.0, sideY, 1]], inner, [[-1.0, sideY, 1]]); }
  function strands(P, col, hs, list) {
    return list.map(function (q) { var a = P(q[0], q[1]), b = P(q[2], q[3]), c = P(q[4], q[5]); return line('M' + pt(a[0], a[1]) + 'Q' + pt(b[0], b[1]) + ' ' + pt(c[0], c[1]), dk(col, 0.3), 1.5 * hs, 0.55); }).join('');
  }
  function curls(P, g, col, ring, ry, r, from, to, step) {
    var o = [], n = Math.max(1, Math.round((from - to) / step));
    for (var i = 0; i <= n; i++) {
      var an = (from - (from - to) * i / n) * Math.PI / 180, p = P(Math.cos(an) * ring, 0.36 - Math.sin(an) * ry);
      o.push(circ(p[0], p[1], r * g.a, 'url(#hc)', ' stroke="' + dk(col, 0.3) + '" stroke-width="1.4"'));
    }
    return o.join('');
  }
  function curlRow(P, g, col, y, x0, x1, step, r) {
    var o = [];
    for (var x = x0; x <= x1 + 1e-6; x += step) { var p = P(x, y + (Math.abs(x) > 0.6 ? 0.04 : 0)); o.push(circ(p[0], p[1], r * g.a, 'url(#hc)', ' stroke="' + dk(col, 0.3) + '" stroke-width="1.3"')); }
    return o.join('');
  }
  function braid(P, g, col, sd) {
    var o = [], n = 6, y0 = 0.78, y1 = 1.74, seg = (y1 - y0) * g.h / n, rx = 0.17 * g.a;
    for (var i = 0; i < n; i++) {
      var p = P(sd * (1.07 + (i % 2 ? 0.02 : -0.02)), y0 + (i + 0.5) * (y1 - y0) / n), w = rx * (1 - i * 0.04);
      o.push(ell(p[0], p[1], w, seg * 0.62, 'url(#hc)', ' stroke="' + dk(col, 0.32) + '" stroke-width="1.4"'));
      o.push(line('M' + pt(p[0] - w * 0.55, p[1] - seg * 0.3) + 'Q' + pt(p[0], p[1]) + ' ' + pt(p[0] + w * 0.55, p[1] + seg * 0.3), dk(col, 0.3), 1.2, 0.6));
    }
    var e = P(sd * 1.07, y1 + 0.02);
    o.push(shape('M' + pt(e[0] - rx * 0.5, e[1]) + 'Q' + pt(e[0], e[1] + seg * 0.9) + ' ' + pt(e[0] + rx * 0.5, e[1]) + 'Z', col, dk(col, 0.32), 1.3));
    o.push(ell(e[0], e[1], rx * 0.55, seg * 0.18, '#E9805F'));
    return o.join('');
  }
  var HAIRS = [
    /* 0 짧은 머리 */ { b: [SKULL], f: [CROP] },
    /* 1 옆가르마 */ { b: [SKULL], f: [[[-1.04, 0.56, 1], [-1.12, 0.32], [-1.0, 0.08], [-0.6, -0.08], [0.05, -0.13], [0.65, -0.07], [1.02, 0.1], [1.13, 0.34], [1.05, 0.56, 1], [0.95, 0.56, 1], [0.93, 0.42], [0.85, 0.36], [0.62, 0.39], [0.35, 0.33], [0.05, 0.27], [-0.3, 0.22], [-0.6, 0.21], [-0.85, 0.27], [-0.94, 0.4], [-0.95, 0.56, 1]]],
      x: function (P, g, col) { return strands(P, col, g.hs, [[-0.4, -0.08, -0.43, 0.06, -0.36, 0.2], [-0.3, 0.0, 0.3, 0.05, 0.8, 0.3], [-0.2, 0.1, 0.25, 0.17, 0.55, 0.36]]); } },
    /* 2 덮은 앞머리 */ { b: [SKULL], f: [[[-1.03, 0.6, 1], [-1.12, 0.34], [-1.0, 0.08], [-0.6, -0.07], [0, -0.11], [0.6, -0.07], [1.0, 0.08], [1.12, 0.34], [1.03, 0.6, 1], [0.94, 0.6, 1], [0.93, 0.42], [0.78, 0.37, 1], [0.6, 0.33], [0.42, 0.37, 1], [0.22, 0.33], [0.02, 0.37, 1], [-0.18, 0.33], [-0.38, 0.37, 1], [-0.58, 0.33], [-0.78, 0.37, 1], [-0.93, 0.42], [-0.94, 0.6, 1]]],
      x: function (P, g, col) { return strands(P, col, g.hs, [[-0.1, -0.08, -0.25, 0.12, -0.38, 0.34], [0.25, -0.07, 0.3, 0.15, 0.42, 0.34]]); } },
    /* 3 넘긴 머리 */ { b: [[[-1.07, 0.62], [-1.12, 0.36], [-0.97, 0.05], [-0.56, -0.12], [0, -0.15], [0.56, -0.12], [0.97, 0.05], [1.12, 0.36], [1.07, 0.62], [0.85, 0.7], [-0.85, 0.7]]],
      f: [[[-1.02, 0.5, 1], [-1.1, 0.3], [-0.98, 0.05], [-0.58, -0.11], [0, -0.15], [0.58, -0.11], [0.98, 0.05], [1.1, 0.3], [1.02, 0.5, 1], [0.93, 0.5, 1], [0.9, 0.3], [0.72, 0.17], [0.38, 0.13], [0, 0.15], [-0.38, 0.13], [-0.72, 0.17], [-0.9, 0.3], [-0.93, 0.5, 1]]],
      x: function (P, g, col) { return strands(P, col, g.hs, [[-0.6, 0.16, -0.66, 0.02, -0.7, -0.08], [-0.25, 0.13, -0.27, 0.0, -0.28, -0.12], [0.1, 0.14, 0.1, 0.0, 0.1, -0.13], [0.45, 0.13, 0.48, 0.01, 0.5, -0.1]]); } },
    /* 4 곱슬 짧은 머리 */ { b: [SKULL], f: [CROP],
      x: function (P, g, col) { return curls(P, g, col, 1.02, 0.46, 0.16, 195, -15, 17) + curlRow(P, g, col, 0.25, -0.75, 0.75, 0.25, 0.12); } },
    /* 5 민머리 */ { b: [], f: [], hl: false,
      x: function (P, g) { var p = P(-0.32, 0.12); return ell(p[0], p[1], 0.22 * g.a, 0.06 * g.h, '#ffffff', ' opacity=".28"'); } },
    /* 6 옆머리만 */ { b: [[[-1.08, 0.62], [-1.12, 0.4], [-1.02, 0.2], [-0.86, 0.3], [0.86, 0.3], [1.02, 0.2], [1.12, 0.4], [1.08, 0.62], [0.85, 0.7], [-0.85, 0.7]]],
      f: [[[-1.06, 0.6, 1], [-1.11, 0.42], [-1.03, 0.25], [-0.9, 0.22], [-0.86, 0.36], [-0.9, 0.6, 1]], [[1.06, 0.6, 1], [0.9, 0.6, 1], [0.86, 0.36], [0.9, 0.22], [1.03, 0.25], [1.11, 0.42]]], hl: false,
      x: function (P, g, col) { var p = P(-0.3, 0.1); return ell(p[0], p[1], 0.2 * g.a, 0.055 * g.h, '#ffffff', ' opacity=".26"') + strands(P, col, g.hs, [[-0.5, 0.06, 0, -0.04, 0.45, 0.05], [-0.4, 0.13, 0.05, 0.05, 0.5, 0.14]]); } },
    /* 7 단발 */ { b: [BOB_B], f: [longFront(0.98, PART_C)],
      x: function (P, g, col) { return strands(P, col, g.hs, [[0, 0.03, -0.45, -0.02, -0.98, 0.42], [0, 0.03, 0.45, -0.02, 0.98, 0.42]]); } },
    /* 8 앞머리 단발 */ { b: [BOB_B], f: [longFront(0.98, BANGS)] },
    /* 9 긴 생머리 */ { b: [LONG_B], f: [longFront(1.3, PART_C)],
      x: function (P, g, col) { return strands(P, col, g.hs, [[0, 0.03, -0.45, -0.02, -1.02, 0.5], [0, 0.03, 0.45, -0.02, 1.02, 0.5], [1.1, 0.7, 1.12, 1.0, 1.08, 1.25]]); } },
    /* 10 앞머리 긴 머리 */ { b: [LONG_B], f: [longFront(1.3, BANGS)] },
    /* 11 묶은 머리 */ { b: [SKULL, [[0.55, 0.05], [1.05, 0.12], [1.32, 0.45], [1.36, 0.9], [1.22, 1.35, 1], [1.12, 1.22], [1.16, 0.88], [1.06, 0.5], [0.85, 0.32]]], f: [PULLED],
      x: function (P, g, col) { var p = P(1.02, 0.2); return strands(P, col, g.hs, [[-0.6, 0.18, -0.1, -0.12, 0.9, 0.12], [-0.2, 0.15, 0.3, -0.05, 0.95, 0.2]]) + ell(p[0], p[1], 0.11 * g.a, 0.08 * g.h, '#E9805F', ' stroke="#C9603F" stroke-width="1.2"'); } },
    /* 12 올림머리 */ { b: [SKULL], f: [PULLED], bun: true,
      x: function (P, g, col) { return strands(P, col, g.hs, [[-0.6, 0.18, -0.4, -0.08, 0, -0.12], [0.6, 0.18, 0.4, -0.08, 0, -0.12]]); } },
    /* 13 땋은 머리 */ { b: [[[-1.14, 0.3], [-1.2, 0.62], [-1.12, 0.85], [1.12, 0.85], [1.2, 0.62], [1.14, 0.3], [0.9, -0.03], [0, -0.12], [-0.9, -0.03]]],
      f: [[[-1.16, 0.8, 1], [-1.2, 0.55], [-1.12, 0.2], [-0.72, -0.06], [0, -0.13], [0.72, -0.06], [1.12, 0.2], [1.2, 0.55], [1.16, 0.8, 1], [0.98, 0.8, 1]].concat(PART_C, [[-0.98, 0.8, 1]])],
      x: function (P, g, col) { return braid(P, g, col, -1) + braid(P, g, col, 1); } },
    /* 14 웨이브 긴 머리 */ { b: [[[-1.16, 0.3], [-1.28, 0.62], [-1.2, 0.9], [-1.32, 1.2], [-1.24, 1.48], [-1.3, 1.7, 1], [1.3, 1.7, 1], [1.24, 1.48], [1.32, 1.2], [1.2, 0.9], [1.28, 0.62], [1.16, 0.3], [0.9, -0.03], [0, -0.13], [-0.9, -0.03]]],
      f: [[[-1.24, 1.25, 1], [-1.17, 1.0], [-1.26, 0.62], [-1.12, 0.2], [-0.72, -0.06], [0, -0.14], [0.72, -0.06], [1.12, 0.2], [1.26, 0.62], [1.17, 1.0], [1.24, 1.25, 1], [1.02, 1.22, 1], [0.99, 0.95], [0.98, 0.62], [0.9, 0.36], [0.55, 0.2], [0.2, 0.1], [-0.25, 0.07, 1], [-0.5, 0.2], [-0.86, 0.36], [-0.97, 0.62], [-0.94, 0.95], [-1.02, 1.22, 1]]],
      x: function (P, g, col) { return strands(P, col, g.hs, [[-0.25, 0.04, -0.7, 0.02, -1.05, 0.5], [-0.25, 0.04, 0.4, -0.02, 1.02, 0.42], [1.12, 0.75, 1.2, 0.95, 1.1, 1.15]]); } },
    /* 15 짧은 파마 */ { b: [[[-1.16, 0.66], [-1.22, 0.36], [-1.05, 0.04], [-0.6, -0.14], [0, -0.18], [0.6, -0.14], [1.05, 0.04], [1.22, 0.36], [1.16, 0.66], [0.9, 0.74], [-0.9, 0.74]]],
      f: [[[-1.1, 0.58, 1], [-1.16, 0.34], [-1.02, 0.06], [-0.6, -0.12], [0, -0.16], [0.6, -0.12], [1.02, 0.06], [1.16, 0.34], [1.1, 0.58, 1], [0.94, 0.58, 1], [0.92, 0.36], [0.7, 0.27], [0.35, 0.25], [0, 0.26], [-0.35, 0.25], [-0.7, 0.27], [-0.92, 0.36], [-0.94, 0.58, 1]]], hl: false,
      x: function (P, g, col) { return curls(P, g, col, 1.1, 0.52, 0.19, 200, -20, 15) + curls(P, g, col, 0.62, 0.42, 0.17, 165, 15, 30) + curlRow(P, g, col, 0.27, -0.72, 0.72, 0.24, 0.14); } },
    /* 16 숏컷 */ { b: [SKULL], f: [[[-1.03, 0.52, 1], [-1.12, 0.32], [-1.0, 0.07], [-0.6, -0.09], [0.05, -0.13], [0.65, -0.08], [1.02, 0.09], [1.12, 0.33], [1.03, 0.55, 1], [0.94, 0.55, 1], [0.93, 0.42], [0.84, 0.34], [0.6, 0.42], [0.34, 0.45, 1], [0.14, 0.37], [-0.16, 0.29], [-0.48, 0.24], [-0.8, 0.28], [-0.93, 0.4], [-0.95, 0.52, 1]]],
      x: function (P, g, col) { return strands(P, col, g.hs, [[-0.5, -0.06, 0.0, 0.1, 0.4, 0.4], [-0.2, -0.1, 0.3, 0.05, 0.75, 0.32]]); } },
    /* 17 중단발 */ { b: [[[-1.16, 0.3], [-1.24, 0.7], [-1.22, 1.12], [-1.1, 1.26, 1], [1.1, 1.26, 1], [1.22, 1.12], [1.24, 0.7], [1.16, 0.3], [0.9, -0.03], [0, -0.12], [-0.9, -0.03]]],
      f: [longFront(1.18, [[0.97, 0.62], [0.9, 0.38], [0.65, 0.24], [0.2, 0.13], [-0.38, 0.06, 1], [-0.62, 0.18], [-0.9, 0.36], [-0.97, 0.62]])],
      x: function (P, g, col) { return strands(P, col, g.hs, [[-0.38, 0.03, 0.3, -0.02, 1.0, 0.45], [-0.38, 0.03, -0.75, 0.08, -1.02, 0.5]]); } }
  ];
  function hairLayer(H, which, P, g, col) {
    var o = [];
    if (which === 'b' && H.bun) { var c = P(0, -0.16); o.push(circ(c[0], c[1], 0.32 * g.a, 'url(#hc)', ' stroke="' + dk(col, 0.32) + '" stroke-width="1.6"')); o.push(line('M' + pt(c[0] - 0.22 * g.a, c[1] - 0.05 * g.a) + 'Q' + pt(c[0], c[1] - 0.3 * g.a) + ' ' + pt(c[0] + 0.2 * g.a, c[1] + 0.02 * g.a), dk(col, 0.3), 1.5, 0.55)); }
    (H[which] || []).forEach(function (pts) {
      o.push(shape(smooth(pts.map(function (q) { return P(q[0], q[1], q[2]); }), true, 0.17), which === 'b' ? dk(col, 0.1) : 'url(#hc)', dk(col, 0.32), 1.6));
    });
    if (which === 'f') {
      if (H.x) o.push(H.x(P, g, col));
      if (H.hl !== false) { var a = P(-0.62, 0.04), b = P(-0.32, -0.07), e = P(0.02, -0.06); o.push(line('M' + pt(a[0], a[1]) + 'Q' + pt(b[0], b[1]) + ' ' + pt(e[0], e[1]), '#ffffff', 4 * g.hs, 0.22)); }
    }
    return o.join('');
  }

  /* ── 얼굴 ── */
  var EAR = [[11, 15, 5, 0], [8.5, 11.5, 3, 0], [14, 19, 8, 0], null, [8, 14, 1.5, 0], [11, 17.5, 5, 3]];
  function ears(s, g, skin, ln) {
    var o = [], es = (0.8 + s.earSize * 0.1) * g.hs, y = g.ey - 2 * g.hs, half = faceHalf(g, y) - 3 * g.hs, ic = dk(skin, 0.22), iw = 2 * g.hs;
    [-1, 1].forEach(function (sd) {
      var bx = g.cx + sd * half, E = EAR[s.ear];
      if (!E) {                                                       /* 뾰족한 귀 */
        o.push(shape('M' + pt(bx, y + 12 * es) + 'C' + pt(bx + sd * 15 * es, y + 15 * es) + ' ' + pt(bx + sd * 19 * es, y - 2 * es) + ' ' + pt(bx + sd * 17 * es, y - 21 * es) +
          'C' + pt(bx + sd * 9 * es, y - 14 * es) + ' ' + pt(bx + sd * 2 * es, y - 12 * es) + ' ' + pt(bx, y - 9 * es) + 'Z', 'url(#fc)', ln, 2));
        o.push(line('M' + pt(bx + sd * 5 * es, y - 5 * es) + 'Q' + pt(bx + sd * 13 * es, y - 6 * es) + ' ' + pt(bx + sd * 7 * es, y + 7 * es), ic, iw));
        return;
      }
      var rx = E[0] * es, ry = E[1] * es, ex = bx + sd * E[2] * es, ey = y + E[3] * es, rot = ' transform="rotate(' + (sd * 8) + ' ' + f(ex) + ' ' + f(ey) + ')"';
      if (s.ear === 5) o.push(ell(ex + sd * rx * 0.1, ey + ry * 0.72, rx * 0.66, rx * 0.6, skin, ' stroke="' + ln + '" stroke-width="2"'));
      o.push(ell(ex, ey, rx, ry, 'url(#fc)', ' stroke="' + ln + '" stroke-width="2"' + rot));
      o.push(line('M' + pt(ex - sd * rx * 0.15, ey - ry * 0.5) + 'Q' + pt(ex + sd * rx * 0.55, ey - ry * 0.1) + ' ' + pt(ex - sd * rx * 0.05, ey + ry * 0.48), ic, iw));
    });
    return o.join('');
  }
  function eyes(s, g, skin) {
    var o = [], r = g.er, hs = g.hs, iris = EYE[s.eyeColor] || EYE[0], lw = 2.4 * hs;
    [-1, 1].forEach(function (sd) {
      var ex = g.cx + sd * g.edx, ey = g.ey, id = sd < 0 ? 'eL' : 'eR', lash = null;
      function almond(rx, ry, tilt) {
        var ix = ex - sd * rx, ox = ex + sd * rx, iy = ey + tilt * r * 0.5, oy = ey - tilt * r;
        var top = 'M' + pt(ix, iy) + 'C' + pt(ex - sd * rx * 0.45, ey - ry * 1.32) + ' ' + pt(ex + sd * rx * 0.5, ey - ry * 1.32 - tilt * r * 0.7) + ' ' + pt(ox, oy);
        return { top: top, full: top + 'C' + pt(ex + sd * rx * 0.45, ey + ry * 0.95) + ' ' + pt(ex - sd * rx * 0.5, ey + ry * 0.95) + ' ' + pt(ix, iy) + 'Z', ox: ox, oy: oy, ix: ix, iy: iy, rx: rx, ry: ry };
      }
      function round(rx, ry) {
        var top = 'M' + pt(ex - sd * rx, ey) + 'A' + f(rx) + ' ' + f(ry) + ' 0 0 ' + (sd > 0 ? 1 : 0) + ' ' + pt(ex + sd * rx, ey);
        return { top: top, full: 'M' + pt(ex - rx, ey) + 'A' + f(rx) + ' ' + f(ry) + ' 0 1 1 ' + pt(ex + rx, ey) + 'A' + f(rx) + ' ' + f(ry) + ' 0 1 1 ' + pt(ex - rx, ey) + 'Z', ox: ex + sd * rx, oy: ey, rx: rx, ry: ry };
      }
      function ball(sh, ri, dy) {
        var ix = ex + sd * r * 0.04, iy = ey + (dy || 0);
        o.push('<clipPath id="' + id + '"><path d="' + sh.full + '"/></clipPath>' + shape(sh.full, '#FFFDF8'));
        o.push('<g clip-path="url(#' + id + ')">' + circ(ix, iy, ri, iris) + circ(ix, iy, ri * 0.52, dk(iris, 0.6)) +
          circ(ix - ri * 0.35, iy - ri * 0.38, ri * 0.3, '#fff') + circ(ix + ri * 0.32, iy + ri * 0.3, ri * 0.13, '#fff', ' opacity=".8"') + '</g>');
      }
      function lid(sh, w) { o.push(line(sh.top, LID, w || lw)); lash = sh; }
      var sh;
      switch (s.eye) {
        case 0:                                                       /* 초롱 눈(점 눈) */
          o.push(ell(ex, ey, r * 0.86, r * 0.98, dk(iris, 0.45)) + ell(ex, ey + r * 0.3, r * 0.55, r * 0.42, iris, ' opacity=".6"') +
            circ(ex - r * 0.3, ey - r * 0.36, r * 0.3, '#fff') + circ(ex + r * 0.3, ey + r * 0.28, r * 0.12, '#fff', ' opacity=".85"'));
          lash = { ox: ex + sd * r * 0.82, oy: ey - r * 0.25, rx: r * 0.86, ry: r * 0.9 };
          break;
        case 1: sh = round(r * 1.05, r * 1.08); ball(sh, r * 0.78); lid(sh); break;                       /* 동그란 눈 */
        case 2: sh = almond(r * 1.3, r * 0.82, 0.08); ball(sh, r * 0.72, r * 0.06); lid(sh); break;        /* 아몬드 */
        case 3:                                                       /* 쌍꺼풀 */
          sh = almond(r * 1.25, r * 0.86, 0.04); ball(sh, r * 0.72, r * 0.06); lid(sh);
          o.push(line('M' + pt(sh.ix + sd * r * 0.25, sh.iy - r * 0.55) + 'C' + pt(ex - sd * r * 0.5, ey - r * 1.75) + ' ' + pt(ex + sd * r * 0.55, ey - r * 1.75) + ' ' + pt(sh.ox - sd * r * 0.05, sh.oy - r * 0.45), dk(skin, 0.35), 1.3 * hs));
          break;
        case 4: sh = almond(r * 1.3, r * 0.6, 0.12); ball(sh, r * 0.66, r * 0.12); lid(sh, lw * 1.45); break;   /* 홑꺼풀 */
        case 5: sh = almond(r * 1.25, r * 0.8, -0.22); ball(sh, r * 0.7, r * 0.05); lid(sh); break;       /* 처진 눈 */
        case 6: sh = almond(r * 1.25, r * 0.76, 0.28); ball(sh, r * 0.7, r * 0.05); lid(sh); break;       /* 올라간 눈 */
        case 7:                                                       /* 웃는 눈 */
          o.push(line('M' + pt(ex - r * 1.05, ey + r * 0.25) + 'Q' + pt(ex, ey - r * 1.25) + ' ' + pt(ex + r * 1.05, ey + r * 0.25), LID, lw * 1.25));
          lash = { ox: ex + sd * r * 1.0, oy: ey + r * 0.15, rx: r, ry: r * 0.7 };
          break;
        case 8:                                                       /* 졸린 눈 */
          sh = almond(r * 1.25, r * 0.82, 0.02); ball(sh, r * 0.72, r * 0.18);
          o.push('<g clip-path="url(#' + id + ')"><rect x="' + f(ex - r * 2) + '" y="' + f(ey - r * 2) + '" width="' + f(r * 4) + '" height="' + f(r * 1.88) + '" fill="' + dk(skin, 0.05) + '"/></g>');
          o.push(line('M' + pt(sh.ix, ey - r * 0.12) + 'Q' + pt(ex, ey - r * 0.32) + ' ' + pt(sh.ox, ey - r * 0.1), LID, lw * 1.2));
          lash = { ox: sh.ox, oy: ey - r * 0.1, rx: sh.rx, ry: r * 0.3 };
          break;
        default: sh = almond(r * 1.3, r * 0.34, 0.05); ball(sh, r * 0.55); lid(sh, lw * 1.3); break;       /* 가는 눈 */
      }
      if (s.lash && lash) {                                            /* 속눈썹: 눈꼬리 위로 */
        var n = s.lash === 2 ? 3 : 2, len = (s.lash === 2 ? 5.5 : 3.6) * hs;
        for (var i = 0; i < n; i++) {
          var tt = (i + 1) / (n + 0.4), bx = ex + sd * lash.rx * (0.25 + 0.75 * tt), by = (ey - lash.ry * 1.0) + (lash.oy - (ey - lash.ry * 1.0)) * tt;
          o.push(line('M' + pt(bx, by) + 'L' + pt(bx + sd * len * (0.4 + tt * 0.5), by - len * (1 - tt * 0.35)), LID, 1.5 * hs));
        }
      }
    });
    return o.join('');
  }
  var BROWS = [
    { p: [[0, 0], [0.5, -0.3], [1, 0]] },                 /* 일자 */
    { p: [[0, 0.3], [0.55, -1.5], [1, 0.4]] },            /* 아치 */
    { p: [[0, 0.1], [0.5, -0.8], [1, 0.6]] },             /* 부드러운 */
    { p: [[0, 0.3], [0.66, -1.3], [1, 0.3]], corner: 1 }, /* 각진 */
    { p: [[0, 1.0], [0.5, -0.1], [1, -1.2]] },            /* 올라간 */
    { p: [[0, -0.9], [0.5, -0.6], [1, 1.0]] },            /* 처진 */
    { p: [[0.18, 0], [0.5, -0.4], [0.82, 0]] },           /* 짧은 */
    { p: [[0, 0], [0.5, -0.35], [1, 0.1]], th: 1.7, taper: 0.85 }   /* 짙은 */
  ];
  function brows(s, g, col) {
    var B = BROWS[s.brow], u = g.er * 0.5, bw = g.er * 2.6, th = (2.3 + s.browThick * 1.05) * g.hs * (B.th || 1), taper = B.taper || 0.5, o = [];
    [-1, 1].forEach(function (sd) {
      var x0 = g.cx + sd * g.edx - sd * bw * 0.45;
      function Q(q) { return [x0 + sd * bw * q[0], g.yb + q[1] * u]; }
      var A = Q(B.p[0]), M = Q(B.p[1]), C = Q(B.p[2]), N = 10, pts = [], up = [], dn = [], i;
      var qx = 2 * M[0] - (A[0] + C[0]) / 2, qy = 2 * M[1] - (A[1] + C[1]) / 2;
      for (i = 0; i <= N; i++) {
        var t = i / N;
        if (B.corner) { var a = t < 0.5 ? A : M, b = t < 0.5 ? M : C, u2 = t < 0.5 ? t * 2 : (t - 0.5) * 2; pts.push([a[0] + (b[0] - a[0]) * u2, a[1] + (b[1] - a[1]) * u2]); }
        else pts.push([(1 - t) * (1 - t) * A[0] + 2 * (1 - t) * t * qx + t * t * C[0], (1 - t) * (1 - t) * A[1] + 2 * (1 - t) * t * qy + t * t * C[1]]);
      }
      for (i = 0; i <= N; i++) {
        var p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(N, i + 1)], dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / L, ny = dx / L; if (ny > 0) { nx = -nx; ny = -ny; }
        var w = th / 2 * (1 - (1 - taper) * (i / N)) * (i === 0 ? 0.85 : 1);
        up.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); dn.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
      }
      o.push(shape(smooth(up.concat(dn.reverse()), true, 0.12), col));
    });
    return o.join('');
  }
  function nose(s, g, skin) {
    var cx = g.cx, y = g.yn, n = (0.75 + s.noseSize * 0.125) * g.hs, c = dk(skin, 0.3), w = 1.9 * g.hs, o = [];
    function st(d, op) { o.push(line(d, c, w, op)); }
    function nos(dx, r) { o.push(ell(cx - dx, y + n, r, r * 0.75, c, ' opacity=".8"') + ell(cx + dx, y + n, r, r * 0.75, c, ' opacity=".8"')); }
    switch (s.nose) {
      case 0: st('M' + pt(cx - 4 * n, y) + 'Q' + pt(cx, y + 4 * n) + ' ' + pt(cx + 4 * n, y)); break;
      case 1: o.push(ell(cx, y, 7.5 * n, 6 * n, dk(skin, 0.08)) + ell(cx - 2.2 * n, y - 2.2 * n, 2.4 * n, 1.8 * n, lt(skin, 0.5), ' opacity=".85"')); st('M' + pt(cx - 4 * n, y + 5 * n) + 'Q' + pt(cx, y + 6.5 * n) + ' ' + pt(cx + 4 * n, y + 5 * n), 0.5); break;
      case 2: st('M' + pt(cx + 1.5 * n, y - 17 * n) + 'Q' + pt(cx + 4.5 * n, y - 4 * n) + ' ' + pt(cx + 3 * n, y + 1.5 * n) + 'Q' + pt(cx, y + 3.5 * n) + ' ' + pt(cx - 3 * n, y + n)); break;
      case 3: st('M' + pt(cx - 8.5 * n, y - n) + 'Q' + pt(cx - 10.5 * n, y + 4 * n) + ' ' + pt(cx - 5 * n, y + 3.5 * n) + 'Q' + pt(cx, y + 6 * n) + ' ' + pt(cx + 5 * n, y + 3.5 * n) + 'Q' + pt(cx + 10.5 * n, y + 4 * n) + ' ' + pt(cx + 8.5 * n, y - n)); nos(3.5 * n, 1.4 * n); break;
      case 4: st('M' + pt(cx - 3 * n, y - 7 * n) + 'L' + pt(cx + 1.5 * n, y + 3 * n) + 'L' + pt(cx + 4 * n, y + 0.5 * n)); break;
      case 5: st('M' + pt(cx + n, y - 18 * n) + 'Q' + pt(cx + 6.5 * n, y - 12 * n) + ' ' + pt(cx + 4.5 * n, y - 6 * n) + 'Q' + pt(cx + 7.5 * n, y + n) + ' ' + pt(cx + 2 * n, y + 3 * n) + 'Q' + pt(cx - n, y + 3.5 * n) + ' ' + pt(cx - 3.5 * n, y + n)); break;
      case 6: nos(3.2 * n, 2 * n); st('M' + pt(cx - 6 * n, y - n) + 'Q' + pt(cx, y - 5 * n) + ' ' + pt(cx + 6 * n, y - n), 0.6); break;
      default: st('M' + pt(cx - n, y - 12 * n) + 'L' + pt(cx - 2.5 * n, y + 2 * n) + 'L' + pt(cx + 3 * n, y + 2 * n)); break;
    }
    return o.join('');
  }
  function mouth(s, g) {
    var cx = g.cx, y = g.ym, w = g.mw, lc = LIP[s.lip], lnc = mix(lc, '#5a2a22', 0.45), sw = 2.4 * g.hs, o = [];
    function open(d, teeth) {
      o.push('<clipPath id="mo"><path d="' + d + '"/></clipPath>' + shape(d, '#8E3B3B', dk(lc, 0.35), 1.6));
      o.push('<g clip-path="url(#mo)">' + (teeth ? '<rect x="' + f(cx - w * 1.2) + '" y="' + f(y - 4) + '" width="' + f(w * 2.4) + '" height="' + f(w * 0.42 + 3) + '" fill="#FFFDF8"/>' : '') + ell(cx, y + w * 1.1, w * 0.62, w * 0.42, '#E68A8A') + '</g>');
    }
    switch (s.mouth) {
      case 0: o.push(line('M' + pt(cx - w, y - 1) + 'Q' + pt(cx, y + w * 0.75) + ' ' + pt(cx + w, y - 1), lnc, sw)); break;
      case 1: open('M' + pt(cx - w * 1.1, y - 2) + 'Q' + pt(cx, y - 1) + ' ' + pt(cx + w * 1.1, y - 2) + 'Q' + pt(cx + w * 0.9, y + w * 1.15) + ' ' + pt(cx, y + w * 1.15) + 'Q' + pt(cx - w * 0.9, y + w * 1.15) + ' ' + pt(cx - w * 1.1, y - 2) + 'Z', true); break;
      case 2: o.push(line('M' + pt(cx - w * 0.6, y) + 'Q' + pt(cx, y + w * 0.42) + ' ' + pt(cx + w * 0.6, y), lnc, sw)); break;
      case 3: o.push(line('M' + pt(cx - w * 0.65, y + 1) + 'Q' + pt(cx, y + 1.8) + ' ' + pt(cx + w * 0.65, y + 1), lnc, sw)); break;
      case 4:
        o.push(shape('M' + pt(cx - w, y) + 'C' + pt(cx - w * 0.6, y - w * 0.45) + ' ' + pt(cx - w * 0.15, y - w * 0.5) + ' ' + pt(cx, y - w * 0.28) + 'C' + pt(cx + w * 0.15, y - w * 0.5) + ' ' + pt(cx + w * 0.6, y - w * 0.45) + ' ' + pt(cx + w, y) + 'Q' + pt(cx, y + w * 0.12) + ' ' + pt(cx - w, y) + 'Z', lc, dk(lc, 0.25), 1));
        o.push(shape('M' + pt(cx - w * 0.92, y + 0.5) + 'Q' + pt(cx, y + w * 0.95) + ' ' + pt(cx + w * 0.92, y + 0.5) + 'Q' + pt(cx, y + w * 0.2) + ' ' + pt(cx - w * 0.92, y + 0.5) + 'Z', lc, dk(lc, 0.25), 1));
        o.push(line('M' + pt(cx - w * 0.95, y + 0.3) + 'Q' + pt(cx, y + w * 0.18) + ' ' + pt(cx + w * 0.95, y + 0.3), lnc, 1.3 * g.hs) + ell(cx - w * 0.15, y + w * 0.45, w * 0.28, w * 0.1, '#fff', ' opacity=".35"'));
        break;
      case 5:
        o.push(shape('M' + pt(cx - w, y) + 'Q' + pt(cx, y - w * 0.2) + ' ' + pt(cx + w, y) + 'Q' + pt(cx, y + w * 0.32) + ' ' + pt(cx - w, y) + 'Z', lc, dk(lc, 0.25), 1));
        o.push(line('M' + pt(cx - w, y) + 'Q' + pt(cx, y + w * 0.06) + ' ' + pt(cx + w, y), lnc, 1.2 * g.hs));
        break;
      case 6: o.push(line('M' + pt(cx - w * 0.8, y + 1) + 'Q' + pt(cx + w * 0.1, y + w * 0.35) + ' ' + pt(cx + w, y - w * 0.35), lnc, sw)); break;
      default: open('M' + pt(cx - w, y - 1) + 'Q' + pt(cx, y) + ' ' + pt(cx + w, y - 1) + 'Q' + pt(cx + w * 0.8, y + w * 1.05) + ' ' + pt(cx, y + w * 1.05) + 'Q' + pt(cx - w * 0.8, y + w * 1.05) + ' ' + pt(cx - w, y - 1) + 'Z', false); break;
    }
    return o.join('');
  }
  function marks(s, g, skin) {
    var cx = g.cx, a = g.a, ey = g.ey, r = g.er, o = [];
    if (s.mark === 1) {
      var c = dk(skin, 0.38);
      [[0.42, 1.5], [0.52, 1.9], [0.34, 2.1], [0.6, 1.5], [0.46, 2.3]].forEach(function (q) { [-1, 1].forEach(function (sd) { o.push(circ(cx + sd * a * q[0], ey + r * q[1], 1.2 * g.hs, c, ' opacity=".55"')); }); });
    } else if (s.mark === 2) o.push(circ(cx - a * 0.42, ey + r * 2.4, 1.8 * g.hs, '#4a3428'));
    else if (s.mark === 3) o.push(circ(cx + g.mw * 1.4, g.ym + 4 * g.hs, 1.7 * g.hs, '#4a3428'));
    return o.join('');
  }
  function beard(s, g, col) {                                            /* 입 아래 덩어리(콧수염은 mustache) */
    var b = s.beard, cx = g.cx, p = g.fp, hs = g.hs, w = g.mw, ym = g.ym, st = ' stroke="' + dk(col, 0.3) + '" stroke-width="1.4"';
    if (b === 3) return shape(smooth([[cx - w * 0.95, ym + w * 0.7], [cx - w * 0.8, g.yChin + 3], [cx, g.yChin + 9 * hs], [cx + w * 0.8, g.yChin + 3], [cx + w * 0.95, ym + w * 0.7], [cx, ym + w * 0.55]], true), col, null, 0, st);
    if (b === 4) {
      var R = [[p[3][0] - 1, p[3][1] + 8, 1], [p[4][0] + 1.5, p[4][1]], [p[5][0] + 2, p[5][1] + 3]];
      var inR = [[cx + (p[4][0] - cx) * 0.82, p[4][1] - 2], [cx + w * 1.1, ym + w * 0.6]];
      var pts = R.concat([[cx, g.yChin + 6 * hs]], mirror(cx, R), [[cx - (p[3][0] - cx) * 0.9, p[3][1] + 10, 1]], mirror(cx, inR).reverse(), [[cx, ym + w * 0.75]], inR.slice().reverse(), [[cx + (p[3][0] - cx) * 0.9, p[3][1] + 10, 1]]);
      return shape(smooth(pts, true, 0.15), col, null, 0, st);
    }
    var F = [[p[3][0] + 1, g.ey + g.er * 1.7, 1], [p[4][0] + 3, p[4][1]], [p[5][0] + 4, p[5][1] + 6]];
    var full = F.concat([[cx, g.yChin + 16 * hs]], mirror(cx, F), [[cx - w * 1.75, ym - 3], [cx - w * 0.9, ym - 9 * hs], [cx, ym - 10 * hs], [cx + w * 0.9, ym - 9 * hs], [cx + w * 1.75, ym - 3]]);
    return shape(smooth(full, true, 0.15), col, null, 0, b === 1 ? ' opacity=".2"' : st);
  }
  function mustache(s, g, col) {
    var cx = g.cx, w = g.mw, hs = g.hs, my = g.ym - 5 * hs;
    return shape(smooth([[cx - w * 1.3, my + 4 * hs, 1], [cx - w, my - 2.5 * hs], [cx - w * 0.4, my - 4.5 * hs], [cx, my - 3 * hs], [cx + w * 0.4, my - 4.5 * hs], [cx + w, my - 2.5 * hs], [cx + w * 1.3, my + 4 * hs, 1], [cx + w * 0.7, my + hs], [cx, my + 0.5 * hs], [cx - w * 0.7, my + hs]], true), col, dk(col, 0.3), 1.2);
  }
  function glasses(s, g) {
    var k = s.glasses; if (!k) return '';
    var cx = g.cx, y = g.ey, hs = g.hs, R = Math.min(Math.max(g.er * 1.6, 13 * hs), g.edx * 0.9), o = [];
    var col = ['', '#2F2A28', '#3A3330', '#4A3326', '#3A3330', '#C9A35A'][k], w = [0, 2.6, 2.4, 4.4, 1.3, 1.8][k] * hs;
    var rw = k === 1 ? R : k === 5 ? R * 1.05 : R * 1.12, rh = k === 1 ? R : k === 5 ? R * 0.85 : R * 0.82, lens = ' fill="#ffffff" fill-opacity=".16" stroke="' + (k === 4 ? '#8a8580' : col) + '" stroke-width="' + f(w) + '"';
    [-1, 1].forEach(function (sd) {
      var x = cx + sd * g.edx;
      if (k === 1 || k === 5) o.push(ell(x, y, rw, rh, '#ffffff', lens.replace(' fill="#ffffff"', '')));
      else o.push('<rect x="' + f(x - rw) + '" y="' + f(y - rh) + '" width="' + f(rw * 2) + '" height="' + f(rh * 2) + '" rx="' + f(R * 0.35) + '"' + lens + '/>');
      if (k === 4) o.push(line('M' + pt(x - rw, y - rh + R * 0.3) + 'Q' + pt(x - rw, y - rh) + ' ' + pt(x, y - rh) + 'Q' + pt(x + rw, y - rh) + ' ' + pt(x + rw, y - rh + R * 0.3), col, 3.4 * hs));
      o.push(line('M' + pt(x - rw * 0.45, y - rh * 0.25) + 'L' + pt(x - rw * 0.1, y - rh * 0.6), '#ffffff', 2 * hs, 0.55));
      var ox = x + sd * rw, fx = cx + sd * (faceHalf(g, y) + 3 * hs);
      if (sd * (fx - ox) > 1) o.push(line('M' + pt(ox, y - rh * 0.3) + 'L' + pt(fx, y - rh * 0.45), col, Math.max(1.2, w * 0.8)));
    });
    o.push(line('M' + pt(cx - g.edx + rw, y - rh * 0.2) + 'Q' + pt(cx, y - rh * 0.55) + ' ' + pt(cx + g.edx - rw, y - rh * 0.2), k === 4 ? col : col, Math.max(1.4, w * 0.9)));
    return o.join('');
  }

  /* ── 몸·옷 ── */
  function armGeo(g, sd) {
    var J = [g.cx + sd * (g.SH - g.AT * 0.42), g.ySh + g.AT * 0.55], len = g.T * 0.9 + 12 * g.hk, off = 5 + (g.wf - 0.8) * 26;
    return { J: J, E: [J[0] + sd * (off * 0.5 + 2), J[1] + len * 0.5], W: [J[0] + sd * (off + 3), J[1] + len] };
  }
  function arms(s, g, skin, top) {
    var o = [], sl = dk(top, 0.04);
    [-1, 1].forEach(function (sd) {
      var A = armGeo(g, sd), d = 'M' + pt(A.J[0], A.J[1]) + 'L' + pt(A.E[0], A.E[1]) + 'L' + pt(A.W[0], A.W[1]);
      if (s.top === 0) {                                              /* 반소매 */
        var S = [A.J[0] + (A.E[0] - A.J[0]) * 0.8, A.J[1] + (A.E[1] - A.J[1]) * 0.8];
        o.push(cap(d, g.AT * 0.82, dk(skin, 0.04), dk(skin, 0.3)) + cap('M' + pt(A.J[0], A.J[1]) + 'L' + pt(S[0], S[1]), g.AT + 3, sl, dk(top, 0.3)));
      } else {
        o.push(cap(d, g.AT, sl, dk(top, 0.3)));
        if (s.top === 2 || s.top === 3 || s.top === 5) { var C = [A.W[0] + (A.E[0] - A.W[0]) * 0.18, A.W[1] + (A.E[1] - A.W[1]) * 0.18]; o.push(line('M' + pt(C[0], C[1]) + 'L' + pt(A.W[0], A.W[1]), dk(top, 0.12), g.AT)); }
      }
      if (s.top === 6) o.push(circ(A.J[0] + sd * 2, A.J[1] + 4, g.AT * 0.74, sl, ' stroke="' + dk(top, 0.3) + '" stroke-width="2"'));   /* 퍼프 소매 */
    });
    return o.join('');
  }
  function hands(g, skin, ln) {
    return [-1, 1].map(function (sd) { var A = armGeo(g, sd); return circ(A.W[0] + sd, A.W[1] + g.AT * 0.28, g.AT * 0.55, skin, ' stroke="' + ln + '" stroke-width="2"'); }).join('');
  }
  function lower(s, g, skin, bot, shoe) {
    var cx = g.cx, o = [], lx = g.HPH * 0.46, LT = g.LT, y0 = g.yHip - 4, y1 = g.ground - g.shoeH + 2, knee = g.yHip + g.L * 0.46;
    var legC = dk(skin, 0.04), legL = dk(skin, 0.3), bl = dk(bot, 0.3);
    function leg(sd, ya, yb, w, c, oc, cs) { return cap('M' + pt(cx + sd * lx, ya) + 'L' + pt(cx + sd * (lx + 1.5), yb), w, c, oc, cs); }
    var pelvis = shape('M' + pt(cx - g.HPH, g.yHip - 16) + 'L' + pt(cx + g.HPH, g.yHip - 16) + 'L' + pt(cx + lx + LT * 0.56, g.yHip + 22) + 'L' + pt(cx, g.yHip + 12) + 'L' + pt(cx - lx - LT * 0.56, g.yHip + 22) + 'Z', bot, bl, 2);
    function skirt(yb, flare, pleat) {
      var x0 = g.HPH + flare * g.wf, d;
      if (pleat) {
        var n = 8, z = []; for (var i = 0; i <= n; i++) z.push(pt(cx + x0 - 2 * x0 * i / n, yb + (i % 2 ? -5 : 2)));
        d = 'M' + pt(cx - g.HPH, g.yHip - 16) + 'L' + pt(cx + g.HPH, g.yHip - 16) + 'L' + z.join('L') + 'Z';
      } else d = 'M' + pt(cx - g.HPH, g.yHip - 16) + 'L' + pt(cx + g.HPH, g.yHip - 16) + 'L' + pt(cx + x0, yb) + 'Q' + pt(cx, yb + 8) + ' ' + pt(cx - x0, yb) + 'Z';
      o.push(shape(d, bot, bl, 2));
      if (pleat) for (var j = 1; j < 8; j += 2) { var tx = cx - g.HPH + 2 * g.HPH * j / 8, bx = cx - x0 + 2 * x0 * j / 8; o.push(line('M' + pt(tx, g.yHip - 4) + 'L' + pt(bx, yb - 4), dk(bot, 0.22), 1.4, 0.8)); }
    }
    if (s.bottom === 0) { o.push(leg(-1, y0, y1, LT + 3, bot) + leg(1, y0, y1, LT + 3, bot) + pelvis); [-1, 1].forEach(function (sd) { o.push(line('M' + pt(cx + sd * (lx - LT * 0.5 - 0.5), y1 - 8) + 'L' + pt(cx + sd * (lx + LT * 0.5 + 3), y1 - 8), dk(bot, 0.2), 1.6)); }); }
    else {
      o.push(leg(-1, y0, y1, LT * 0.86, legC, legL) + leg(1, y0, y1, LT * 0.86, legC, legL));
      if (s.bottom === 1) o.push(leg(-1, y0, knee - 4, LT + 6, bot, bl, 'butt') + leg(1, y0, knee - 4, LT + 6, bot, bl, 'butt') + pelvis);
      else if (s.bottom === 2) skirt(knee, 12);
      else if (s.bottom === 3) skirt(g.yHip + g.L * 0.8, 22);
      else skirt(knee, 14, true);
    }
    [-1, 1].forEach(function (sd) {                                      /* 신발(발끝은 바깥으로 조금) */
      var fx = cx + sd * (lx + 1.5), a = fx - LT * 0.62 + sd * 1, b = fx + LT * 0.62 + sd * 5, x0 = Math.min(a, b), x1 = Math.max(a, b), G = g.ground;
      o.push(shape('M' + pt(x0, G) + 'L' + pt(x0, G - 6) + 'Q' + pt(x0, G - 16) + ' ' + pt((x0 + x1) / 2, G - 17) + 'Q' + pt(x1, G - 16) + ' ' + pt(x1, G - 6) + 'L' + pt(x1, G) + 'Z', shoe, dk(shoe, 0.35), 2));
      o.push(ell((x0 + x1) / 2 - sd * 3, G - 11, (x1 - x0) * 0.22, 2.6, lt(shoe, 0.4), ' opacity=".6"') + line('M' + pt(x0 + 1, G - 2.5) + 'L' + pt(x1 - 1, G - 2.5), dk(shoe, 0.25), 2));
    });
    return o.join('');
  }
  function torso(s, g, top) {
    var cx = g.cx, SH = g.SH, WH = g.WH, HP = g.HPH + 3, y = g.ySh, T = g.T, NW = g.NW, o = [];
    var hem = g.yHip + (s.top === 4 ? 22 : 11), belly = Math.max(0, g.wf - 1.05) * 46, ln = dk(top, 0.3);
    var R = [[cx + NW + 2, y - 3, 1], [cx + SH * 0.8, y + 3], [cx + SH, y + 20], [cx + SH - 5, y + T * 0.38], [cx + WH + belly * 0.4, y + T * 0.7], [cx + HP + belly * 0.15, hem, 1]];
    o.push(shape(smooth(R.concat([[cx, hem + 3]], mirror(cx, R), [[cx, y + 9]]), true, 0.16), 'url(#tc)', ln, 2));
    var nL = [cx - NW - 2, y - 3], nR = [cx + NW + 2, y - 3], neckQ = 'M' + pt(nL[0], nL[1]) + 'Q' + pt(cx, y + 13) + ' ' + pt(nR[0], nR[1]);
    function band() { o.push(line('M' + pt(cx - HP + 2, hem - 9) + 'L' + pt(cx + HP - 2, hem - 9), dk(top, 0.14), 1.5)); for (var x = cx - HP + 7; x < cx + HP - 4; x += 6) o.push(line('M' + pt(x, hem - 8) + 'L' + pt(x, hem - 1), dk(top, 0.14), 1, 0.6)); }
    function vee(vy) { var inner = lum(top) > 0.82 ? '#E9E2D5' : '#FBF8F2'; o.push(shape(neckQ + 'L' + pt(cx, vy) + 'Z', inner, dk(inner, 0.25), 1.4)); return inner; }
    var i, vy;
    switch (s.top) {
      case 0: o.push(line(neckQ, dk(top, 0.18), 3.5)); break;                                     /* 티셔츠 */
      case 1:                                                                                     /* 셔츠 */
        o.push(line('M' + pt(cx + 2, y + 11) + 'L' + pt(cx + 2, hem), ln, 1.6));
        for (i = 0; i < 3; i++) o.push(circ(cx + 5, y + 26 + i * (hem - y - 34) / 3, 2.2, ln));
        [-1, 1].forEach(function (sd) { o.push(shape('M' + pt(cx + sd, y + 13) + 'L' + pt(cx + sd * (NW + 12), y + 7) + 'L' + pt(cx + sd * (NW + 3), y - 6) + 'Z', lt(top, 0.35), ln, 1.6)); });
        break;
      case 2:                                                                                     /* 니트 */
        o.push(line(neckQ, dk(top, 0.1), 7) + line(neckQ, lt(top, 0.2), 1.5, 0.7));
        [-1, 1].forEach(function (sd) { var x = cx + sd * SH * 0.36, h2 = (hem - y - 34) / 2; o.push(line('M' + pt(x, y + 22) + 'q' + pt(5, h2 * 0.5) + ' ' + pt(0, h2) + 't' + pt(0, h2), dk(top, 0.1), 2.2, 0.7)); });
        band();
        break;
      case 3:                                                                                     /* 가디건 */
        vy = y + T * 0.48; var inner = vee(vy);
        [-1, 1].forEach(function (sd) {
          o.push(shape('M' + pt(cx + sd, y + 10) + 'L' + pt(cx + sd * (NW + 6), y + 4) + 'L' + pt(cx + sd * (NW - 1), y - 3) + 'Z', inner, dk(inner, 0.25), 1.2));
          o.push(line('M' + pt(cx + sd * (NW + 2), y - 3) + 'L' + pt(cx + sd * 2, vy) + 'L' + pt(cx + sd * 2, hem), ln, 2));
        });
        for (i = 0; i < 3; i++) o.push(circ(cx, vy + 9 + i * (hem - vy - 20) / 2.4, 3, dk(top, 0.45)));
        band();
        break;
      case 4:                                                                                     /* 정장 */
        vy = y + T * 0.55; vee(vy);
        var tc = lum(top) < 0.35 ? '#B83C3C' : '#2F416B';
        o.push(shape('M' + pt(cx - 4, y + 9) + 'L' + pt(cx + 4, y + 9) + 'L' + pt(cx + 3, y + 16) + 'L' + pt(cx - 3, y + 16) + 'Z', tc, dk(tc, 0.3), 1.2));
        o.push(shape('M' + pt(cx - 3, y + 16) + 'L' + pt(cx + 3, y + 16) + 'L' + pt(cx + 6.5, vy - 6) + 'L' + pt(cx, vy + 2) + 'L' + pt(cx - 6.5, vy - 6) + 'Z', tc, dk(tc, 0.3), 1.2));
        [-1, 1].forEach(function (sd) {
          o.push(shape('M' + pt(cx + sd * (NW + 2), y - 3) + 'L' + pt(cx + sd * (NW + 15), y + 20) + 'L' + pt(cx + sd * (NW + 8), y + 27) + 'L' + pt(cx + sd * 2, vy) + 'Z', dk(top, 0.08), ln, 1.6));
          o.push(line('M' + pt(cx + sd * HP * 0.75, hem - 30) + 'L' + pt(cx + sd * HP * 0.3, hem - 30), ln, 1.6));
        });
        o.push(line('M' + pt(cx, vy) + 'L' + pt(cx, hem), ln, 1.6) + circ(cx - 3, vy + 10, 3, dk(top, 0.4)) + circ(cx - 3, vy + 26, 3, dk(top, 0.4)));
        break;
      case 5:                                                                                     /* 후드티 */
        o.push(line(neckQ, dk(top, 0.16), 6));
        [-1, 1].forEach(function (sd) { o.push(line('M' + pt(cx + sd * 6, y + 10) + 'L' + pt(cx + sd * 7, y + 42), '#F5F2EC', 2.2) + circ(cx + sd * 7, y + 43, 2.4, '#E0D8CC')); });
        o.push(line('M' + pt(cx - WH * 0.72, hem - 6) + 'L' + pt(cx - WH * 0.56, hem - 34) + 'L' + pt(cx + WH * 0.56, hem - 34) + 'L' + pt(cx + WH * 0.72, hem - 6), dk(top, 0.22), 2));
        break;
      default:                                                                                    /* 블라우스 */
        o.push(line(neckQ, dk(top, 0.15), 3));
        var bc = lum(top) > 0.7 ? dk(top, 0.35) : lt(top, 0.45), by = y + 10;
        [-1, 1].forEach(function (sd) {
          o.push(shape('M' + pt(cx, by) + 'C' + pt(cx + sd * 15, by - 10) + ' ' + pt(cx + sd * 17, by + 10) + ' ' + pt(cx, by) + 'Z', bc, dk(bc, 0.25), 1.4));
          o.push(line('M' + pt(cx + sd, by) + 'L' + pt(cx + sd * 6, by + 18), bc, 3));
        });
        o.push(circ(cx, by, 3.2, bc));
        break;
    }
    return o.join('');
  }

  /* ── 한 장으로 ── */
  function viewBox(g, view) {
    var S, cx = g.cx, x, y;
    function sq(px, py, size) { S = size; x = px - size / 2; y = py - size / 2; }
    switch (view) {
      case 'face': sq(cx, g.top + g.h * 0.52, g.h * 1.62); break;
      case 'head': sq(cx, g.top + g.h * 0.55, g.h * 1.8); break;
      case 'eyes': sq(cx, g.ey - g.er * 0.2, g.a * 1.45); break;
      case 'brows': sq(cx, (g.yb + g.ey) / 2, g.a * 1.45); break;
      case 'nose': sq(cx, g.yn - 4 * g.hs, g.a * 1.05); break;
      case 'mouth': sq(cx, g.ym + 2 * g.hs, g.a * 1.05); break;
      case 'ear': sq(cx + faceHalf(g, g.ey) + 10 * g.hs, g.ey, g.a * 1.0); break;
      case 'torso': sq(cx, g.ySh + g.T * 0.5, Math.max(g.T * 1.5, g.SH * 3)); break;
      case 'legs': sq(cx, g.yHip + g.L * 0.5, g.L * 1.3); break;
      default: return { vb: '0 -24 400 624', w: 400, h: 624 };   /* 가장 큰 키 + 올림머리까지 */
    }
    return { vb: f(x) + ' ' + f(y) + ' ' + f(S) + ' ' + f(S), w: Math.round(S), h: Math.round(S) };
  }
  function svg(spec, view) {
    var s = norm(spec), g = geom(s), cx = g.cx;
    var skin = SKIN[s.skin], ln = dk(skin, 0.36), hc = HAIR[s.hairColor], top = TOP[s.topColor], bot = BOTTOM[s.bottomColor], shoe = SHOES[s.shoes];
    var P = function (x, y, c) { return [cx + x * g.a, g.top + y * g.h, c]; }, H = HAIRS[s.hair] || HAIRS[1];
    var o = ['<defs>',
      '<radialGradient id="fc" cx=".42" cy=".36" r=".78"><stop offset="0" stop-color="' + lt(skin, 0.16) + '"/><stop offset=".6" stop-color="' + skin + '"/><stop offset="1" stop-color="' + dk(skin, 0.08) + '"/></radialGradient>',
      '<linearGradient id="hc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + lt(hc, 0.16) + '"/><stop offset=".55" stop-color="' + hc + '"/><stop offset="1" stop-color="' + dk(hc, 0.14) + '"/></linearGradient>',
      '<linearGradient id="tc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + dk(top, 0.07) + '"/><stop offset=".45" stop-color="' + lt(top, 0.07) + '"/><stop offset="1" stop-color="' + dk(top, 0.1) + '"/></linearGradient>',
      '<radialGradient id="bl"><stop offset="0" stop-color="#F2827A"/><stop offset="1" stop-color="#F2827A" stop-opacity="0"/></radialGradient>',
      '</defs>'];
    o.push(ell(cx, g.ground + 1, Math.max(g.SH, g.HPH + 12) * 1.15, 9, '#503c28', ' opacity=".16"'));
    o.push(hairLayer(H, 'b', P, g, hc));
    o.push(lower(s, g, skin, bot, shoe));
    o.push(arms(s, g, skin, top));
    if (s.top === 5) o.push(ell(cx, g.ySh - 1, g.NW + 20, 11, dk(top, 0.08), ' stroke="' + dk(top, 0.3) + '" stroke-width="2"'));   /* 후드 */
    o.push(shape('M' + pt(cx - g.NW, g.yChin - 18) + 'L' + pt(cx + g.NW, g.yChin - 18) + 'L' + pt(cx + g.NW + 1, g.ySh + 10) + 'L' + pt(cx - g.NW - 1, g.ySh + 10) + 'Z', dk(skin, 0.06), ln, 2));
    o.push(ell(cx, g.yChin + 2, g.NW + 1, 4, dk(skin, 0.2), ' opacity=".45"'));
    o.push(torso(s, g, top));
    o.push(hands(g, skin, ln));
    o.push(ears(s, g, skin, ln));
    o.push(shape(facePath(g), 'url(#fc)', ln, 2));
    if (s.blush) { var op = [0, 0.3, 0.45, 0.62][s.blush]; [-1, 1].forEach(function (sd) { o.push(ell(cx + sd * g.a * 0.56, g.ey + g.er * 1.55 + 3 * g.hs, 13 * g.hs, 8 * g.hs, 'url(#bl)', ' opacity="' + op + '"')); }); }
    o.push(marks(s, g, skin));
    if (s.beard && s.beard !== 2) o.push(beard(s, g, hc));
    o.push(eyes(s, g, skin));
    o.push(brows(s, g, s.browColor ? BROW[s.browColor - 1] : browOf(hc)));
    o.push(nose(s, g, skin));
    o.push(mouth(s, g));
    if (s.beard === 2 || s.beard >= 4) o.push(mustache(s, g, hc));
    o.push(glasses(s, g));
    o.push(hairLayer(H, 'f', P, g, hc));
    var vb = viewBox(g, view);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb.vb + '" width="' + vb.w + '" height="' + vb.h + '">' + o.join('') + '</svg>';
  }
  var CACHE = {}, CN = 0;
  function uri(spec, view) {
    var k = encode(spec) + (view || 'full');
    if (CACHE[k]) return CACHE[k];
    if (++CN > 400) { CACHE = {}; CN = 1; }
    return (CACHE[k] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(spec, view)));
  }

  /* ── 고르는 창(첫 심기·내 모습 바꾸기 창 안) ── */
  var TABS = [
    ['face', ['face', 'skin', 'blush', 'mark']],
    ['eyes', ['eye', 'eyeSize', 'eyeGap', 'eyeColor', 'lash']],
    ['brows', ['brow', 'browThick', 'browColor']],
    ['nme', ['nose', 'noseSize', 'mouth', 'mouthSize', 'lip', 'ear', 'earSize']],
    ['hair', ['hair', 'hairColor', 'beard']],
    ['body', ['height', 'build', 'shoulder', 'leg', 'head']],
    ['wear', ['top', 'topColor', 'bottom', 'bottomColor', 'shoes', 'glasses']]
  ];
  /* 그림 단추: 보여 줄 부분 + 잘 보이게 덮어쓸 값(눈썹·귀는 머리카락·안경을 걷고) */
  var PICK = {
    face: { v: 'head', o: { hair: 3, glasses: 0 } }, blush: { v: 'face' }, mark: { v: 'face' },
    eye: { v: 'eyes', o: { glasses: 0 } }, lash: { v: 'eyes', o: { glasses: 0 } },
    brow: { v: 'brows', o: { hair: 3, glasses: 0 } },
    nose: { v: 'nose', o: { glasses: 0 } }, mouth: { v: 'mouth', o: { beard: 0 } }, ear: { v: 'ear', o: { hair: 5, glasses: 0 } },
    hair: { v: 'head' }, beard: { v: 'face' },
    top: { v: 'torso' }, bottom: { v: 'legs' }, glasses: { v: 'face' }
  };
  var PAL = { skin: SKIN, hairColor: HAIR, eyeColor: EYE, browColor: [null].concat(BROW), lip: LIP, topColor: TOP, bottomColor: BOTTOM, shoes: SHOES };
  var RANGE = { eyeSize: 'size7', eyeGap: 'gap', browThick: 'thick', noseSize: 'size5', mouthSize: 'size5', earSize: 'size5', height: 'height', build: 'build', shoulder: 'shoulder', leg: 'leg', head: 'size5' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function words(v) { return String(v || '').split('|'); }
  var EDN = 0;
  function editor(host, opt) {
    var t = opt.t, cur = defaults(), base = defaults(), tab = 'face', raf = 0, uid = 'gavx' + (++EDN);
    host.innerHTML = '<div class="g-avx"><div class="g-avx-head"><div class="g-avx-pv"><img alt="' + esc(t('avx.preview')) + '" draggable="false"></div>' +
      '<div class="g-avx-tabs" role="tablist" aria-label="' + esc(t('avx.tabs')) + '">' + TABS.map(function (tb) {
        return '<button type="button" role="tab" class="g-avx-tab" id="' + uid + '-t-' + tb[0] + '" aria-controls="' + uid + '-p" data-tab="' + tb[0] + '" aria-selected="false" tabindex="-1">' + esc(t('avx.tab.' + tb[0])) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="g-avx-panel" id="' + uid + '-p" role="tabpanel"></div>' +
      '<div class="g-avx-acts"><button type="button" class="g-btn g-btn-line" data-act="rand">' + esc(t('avx.rand')) + '</button><button type="button" class="g-btn g-btn-line" data-act="reset">' + esc(t('avx.reset')) + '</button></div></div>';
    var pv = host.querySelector('.g-avx-pv img'), panel = host.querySelector('.g-avx-panel'), tabsEl = host.querySelector('.g-avx-tabs');
    function valueText(k, v) { return k === 'height' ? t('avx.v.height', { n: 145 + v * 4 }) : (words(t('avx.v.' + RANGE[k]))[v] || String(v + 1)); }
    function rowHtml(k) {
      var id = uid + '-' + k, lb = esc(t('avx.p.' + k)), n = used(k), i, h = '';
      if (RANGE[k]) return '<div class="g-avx-row g-avx-rg"><label class="g-avx-lb" for="' + id + '">' + lb + '</label><output class="g-avx-val" for="' + id + '" data-val="' + k + '"></output>' +
        '<input type="range" id="' + id + '" min="0" max="' + (n - 1) + '" step="1" data-k="' + k + '"></div>';
      var names = words(t('avx.o.' + k)), pal = PAL[k];
      for (i = 0; i < n; i++) {
        var nm = esc(names[i] || String(i + 1));
        h += pal ? '<button type="button" role="radio" class="g-avx-sw' + (k === 'browColor' && !i ? ' is-link' : '') + '" data-k="' + k + '" data-v="' + i + '" aria-label="' + nm + '" title="' + nm + '"></button>'
          : '<button type="button" role="radio" class="g-avx-op" data-k="' + k + '" data-v="' + i + '" aria-label="' + nm + '" title="' + nm + '"><img alt="" draggable="false"></button>';
      }
      return '<div class="g-avx-row"><span class="g-avx-lb" id="' + id + '">' + lb + '</span><div class="' + (pal ? 'g-avx-sws' : 'g-avx-opts') + '" role="radiogroup" aria-labelledby="' + id + '">' + h + '</div></div>';
    }
    function thumb(k, v) { var sp = {}, P2 = PICK[k], q; for (q in cur) sp[q] = cur[q]; if (P2.o) for (q in P2.o) sp[q] = P2.o[q]; sp[k] = v; return uri(sp, P2.v); }
    function refresh() {
      raf = 0;
      pv.src = uri(cur, 'full');
      Array.prototype.forEach.call(panel.querySelectorAll('[data-k]'), function (el) {
        var k = el.getAttribute('data-k');
        if (el.tagName === 'INPUT') {
          if (+el.value !== cur[k]) el.value = cur[k];
          var txt = valueText(k, cur[k]); panel.querySelector('[data-val="' + k + '"]').textContent = txt; el.setAttribute('aria-valuetext', txt);
          return;
        }
        var v = +el.getAttribute('data-v'), on = cur[k] === v;
        el.setAttribute('aria-checked', String(on)); el.tabIndex = on ? 0 : -1;
        if (PAL[k]) el.style.setProperty('--c', PAL[k][v] || browOf(HAIR[cur.hairColor]));
        else { var im = el.firstChild, src = thumb(k, v); if (im.getAttribute('src') !== src) im.setAttribute('src', src); }
      });
    }
    function changed() {
      if (!raf) raf = requestAnimationFrame(function () { refresh(); if (opt.onChange) opt.onChange(get()); });
    }
    function pick(k, v) { if (cur[k] === v) return; cur[k] = v; changed(); }
    function selectTab(id, focus) {
      tab = id;
      Array.prototype.forEach.call(tabsEl.querySelectorAll('.g-avx-tab'), function (b) { var on = b.getAttribute('data-tab') === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
      for (var i = 0; i < TABS.length; i++) if (TABS[i][0] === id) panel.innerHTML = TABS[i][1].map(rowHtml).join('');
      panel.setAttribute('aria-labelledby', uid + '-t-' + id);
      refresh();
    }
    function roam(list, i, e) {                                            /* 방향 키로 옮겨 가며 고른다 */
      var j = -1, n = list.length;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = n - 1;
      if (j >= 0) e.preventDefault();
      return j;
    }
    tabsEl.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.g-avx-tab'); if (b) selectTab(b.getAttribute('data-tab')); });
    tabsEl.addEventListener('keydown', function (e) {
      var list = Array.prototype.slice.call(tabsEl.querySelectorAll('.g-avx-tab')), j = roam(list, list.indexOf(e.target), e);
      if (j >= 0) selectTab(list[j].getAttribute('data-tab'), true);
    });
    panel.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-k]'); if (b) pick(b.getAttribute('data-k'), +b.getAttribute('data-v')); });
    panel.addEventListener('input', function (e) { var r = e.target; if (r.type === 'range') pick(r.getAttribute('data-k'), +r.value); });
    panel.addEventListener('keydown', function (e) {
      var b = e.target.closest && e.target.closest('button[role="radio"]'); if (!b) return;
      var list = Array.prototype.slice.call(b.parentNode.querySelectorAll('button[role="radio"]')), j = roam(list, list.indexOf(b), e);
      if (j >= 0) { list[j].focus(); pick(list[j].getAttribute('data-k'), +list[j].getAttribute('data-v')); }
    });
    host.querySelector('.g-avx-acts').addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-act]'); if (!b) return;
      var next = b.getAttribute('data-act') === 'rand' ? random() : base;
      for (var k in next) cur[k] = next[k];
      changed();
    });
    function get() { var o = {}; for (var k in cur) o[k] = cur[k]; return o; }
    selectTab(tab);
    return {
      /* spec 으로 열고, '처음대로'는 base 로 */
      set: function (spec, baseSpec) { cur = norm(spec); base = norm(baseSpec || spec); refresh(); },
      get: get
    };
  }

  return { isCustom: isCustom, decode: decode, encode: encode, fromKey: fromKey, defaults: defaults, random: random, svg: svg, uri: uri, editor: editor, V1: V1 };
})();
