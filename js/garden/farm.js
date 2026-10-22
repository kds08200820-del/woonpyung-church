/* ============================================================
   신앙 정원 — 내 땅(밭) (2026-10-23 담임목사 지시: "빠르게 심고 거둘 수 있는 작물, 땅을 넓히려면 달란트")
   · 마름모 칸(아이소메트릭)으로 내 땅을 그린다. 가운데(0,0)는 믿음 나무, 붙은 칸은 달란트로 산다
   · 빈 칸 → 작물 고르기(씨앗 값·익는 시간·열매) / 자라는 칸 → 남은 시간 / 익은 칸 → 열매를 하나씩 눌러 0.1 달란트
   · 서버(garden_farm·_buy·_plant·_pick)가 시간·값·중복을 모두 확인한다. 화면은 받은 상태를 그리기만
   GardenFarm.init({ i18n, sdk, hud }) · GardenFarm.open()
   ============================================================ */
window.GardenFarm = (function () {
  'use strict';
  var I, SDK, HUD, t;
  var F = { farm: null, skew: 0, timer: 0, rec: null, busy: false, sel: null, art: 'images/garden/farm/' };
  var TW = 132, TH = 66, DEPTH = 14;          // 칸 너비·높이·두께(px, 화면에 맞춰 줄인다)
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nameOf(v) { if (v && typeof v === 'object') { var l = String(I.locale() || 'ko'); return v[l] || v[l.split('-')[0]] || v.ko || v.en || ''; } return v || ''; }
  function tal(n) { return I.fmtNum(Math.round((+n || 0) * 10) / 10); }
  function now() { return Date.now() + F.skew; }
  function crop(slug) { var cs = (F.farm && F.farm.crops) || []; for (var i = 0; i < cs.length; i++) if (cs[i].slug === slug) return cs[i]; return null; }
  function tile(x, y) { var ts = (F.farm && F.farm.tiles) || []; for (var i = 0; i < ts.length; i++) if (ts[i].x === x && ts[i].y === y) return ts[i]; return null; }
  function left(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    if (s >= 3600) return Math.floor(s % 3600 / 60) ? t('farm.left.h', { h: Math.floor(s / 3600), m: Math.floor(s % 3600 / 60) }) : t('farm.left.h0', { h: s / 3600 });
    if (s >= 60) return t('farm.left.m', { m: Math.ceil(s / 60) });
    return t('farm.left.s', { s: s });
  }
  // 정해진 자리(같은 칸·같은 번호면 늘 같은 곳)에 열매를 흩어 놓는다
  function spot(n, total, seed) {
    var a = (n * 2.39996 + seed) % (Math.PI * 2), r = 0.25 + 0.7 * Math.sqrt((n + 0.5) / Math.max(total, 1));
    return { x: 50 + Math.cos(a) * r * 30, y: 38 + Math.sin(a) * r * 22 };
  }

  /* ── 열기·닫기 ── */
  function open() {
    if (F.rec) return;
    F.rec = HUD.openModal('gmFarm', { onClose: function () { F.rec = null; clearInterval(F.timer); F.timer = 0; closeSheet(); } });
    $('gfBoard').innerHTML = '<p class="g-empty gf-loading">' + esc(t('farm.loading')) + '</p>';
    load();
  }
  function load() {
    return SDK.farm().then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.why) || 'farm');
      setFarm(r.farm);
    }).catch(function (e) {
      $('gfBoard').innerHTML = '<p class="g-empty">' + esc(SDK.notReady(e) ? t('farm.notready') : t('farm.err')) + '</p>';
    });
  }
  function setFarm(f) {
    F.farm = f;
    if (f.now) F.skew = new Date(f.now).getTime() - Date.now();
    HUD.setTalent(f.balance);
    render();
    if (!F.timer) F.timer = setInterval(tick, 1000);
  }

  /* ── 그리기 ── */
  function owned(x, y) { return !!tile(x, y); }
  function buyable(x, y) {
    if (owned(x, y) || Math.abs(x) > F.farm.max || Math.abs(y) > F.farm.max) return false;
    return owned(x + 1, y) || owned(x - 1, y) || owned(x, y + 1) || owned(x, y - 1);
  }
  function render() {
    var f = F.farm, board = $('gfBoard'); if (!f || !board) return;
    $('gfBal').textContent = tal(f.balance);
    $('gfCount').textContent = t('farm.count', { n: I.fmtNum(f.count) });
    $('gfPrice').textContent = t('farm.price', { p: tal(f.price) });
    var cells = [], lo = -f.max, hi = f.max, x, y;
    for (y = lo; y <= hi; y++) for (x = lo; x <= hi; x++) if (owned(x, y) || buyable(x, y)) cells.push({ x: x, y: y });
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    cells.forEach(function (c) { var sx = (c.x - c.y) * TW / 2, sy = (c.x + c.y) * TH / 2; minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy); });
    var wrap = board.parentNode, availW = Math.max(280, (wrap.clientWidth || 600) - 24), availH = Math.max(260, (wrap.clientHeight || 500) - 24);
    var needW = maxX - minX + TW, needH = maxY - minY + TH + DEPTH + 120, scale = Math.max(0.45, Math.min(1.7, availW / needW, availH / needH));
    var w = needW * scale, h = (maxY - minY + TH + DEPTH + 120) * scale;
    board.style.width = w + 'px'; board.style.height = h + 'px';
    board.style.setProperty('--gf-s', scale);
    var html = cells.sort(function (a, b) { return (a.x + a.y) - (b.x + b.y) || a.x - b.x; }).map(function (c) {
      var left = ((c.x - c.y) * TW / 2 - minX) * scale, top = ((c.x + c.y) * TH / 2 - minY + 110) * scale;
      return cellHtml(c.x, c.y, left, top, scale);
    }).join('');
    board.innerHTML = html;
  }
  function cellHtml(x, y, lx, ty, s) {
    var tl = tile(x, y), st = 'left:' + lx.toFixed(1) + 'px;top:' + ty.toFixed(1) + 'px;width:' + (TW * s).toFixed(1) + 'px;height:' + (TH * s).toFixed(1) + 'px;z-index:' + (100 + x + y);
    if (!tl) {
      return '<button type="button" class="gf-cell gf-buy" data-x="' + x + '" data-y="' + y + '" style="' + st + '" aria-label="' + esc(t('farm.buy.aria', { p: tal(F.farm.price) })) + '">' +
        '<span class="gf-top gf-top-buy"></span><span class="gf-tag">' + esc(tal(F.farm.price)) + '</span></button>';
    }
    var tree = x === 0 && y === 0, c = tl.crop ? crop(tl.crop) : null, inner = '', cls = 'gf-cell', label = '';
    if (tree) {
      var g = HUD.garden ? HUD.garden() : {}, stage = Math.max(0, Math.min(5, +(g && g.stage) || 0));   // 장면(scene.setPlant)과 같은 그림
      inner = '<img class="gf-spr gf-tree" alt="" draggable="false" src="images/garden/default/plants/' + esc((g && g.species) || 'sunflower') + '-' + stage + '.webp" onerror="this.remove()">';
      cls += ' gf-is-tree'; label = t('farm.tree.aria');
    } else if (c) {
      var ripe = now() >= new Date(tl.ripe_at).getTime(), prog = 1 - Math.max(0, new Date(tl.ripe_at).getTime() - now()) / (c.grow_sec * 1000);
      var spr = F.art + 'crop-' + c.slug + '-' + (prog < 0.5 ? 1 : 2) + '.webp';
      inner = '<img class="gf-spr" alt="" draggable="false" src="' + spr + '" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'gf-ph\'}))">';
      if (ripe) {
        cls += ' gf-ripe'; label = t('farm.ripe.aria', { name: nameOf(c.name) });
        var picked = tl.picked || [];
        for (var n = 1; n <= c.fruits; n++) {
          if (picked.indexOf(n) >= 0) continue;
          var p = spot(n, c.fruits, x * 7 + y * 3);
          inner += '<span class="gf-fruit" role="button" tabindex="0" data-n="' + n + '" style="left:' + p.x.toFixed(1) + '%;top:' + p.y.toFixed(1) + '%" aria-label="' + esc(t('farm.fruit.aria', { n: n })) + '"><img alt="" draggable="false" src="' + F.art + 'fruit-' + c.slug + '.webp" onerror="this.parentNode.classList.add(\'noimg\');this.remove()"></span>';
        }
      } else {
        cls += ' gf-growing'; label = t('farm.grow.aria', { name: nameOf(c.name) });
        inner += '<span class="gf-tag gf-time" data-ripe="' + esc(tl.ripe_at) + '">' + esc(left(new Date(tl.ripe_at).getTime() - now())) + '</span>';
      }
    } else { cls += ' gf-empty'; label = t('farm.empty.aria'); }
    return '<div class="' + cls + '" data-x="' + x + '" data-y="' + y + '" style="' + st + '">' +
      '<span class="gf-side"></span><button type="button" class="gf-hit" aria-label="' + esc(label) + '"><span class="gf-top ' + (c ? 'gf-top-soil' : 'gf-top-grass') + '"></span></button>' +
      '<span class="gf-stand">' + inner + '</span></div>';
  }
  function tick() {
    if (!F.farm) return;
    var flip = false;
    Array.prototype.forEach.call(document.querySelectorAll('#gfBoard .gf-time'), function (el) {
      var ms = new Date(el.getAttribute('data-ripe')).getTime() - now();
      if (ms <= 0) flip = true; else el.textContent = left(ms);
    });
    if (flip) render();
  }

  /* ── 누르기 ── */
  function onBoard(e) {
    var fr = e.target.closest('.gf-fruit');
    if (fr) { pick(fr); return; }
    var cell = e.target.closest('.gf-cell'); if (!cell) return;
    var x = +cell.getAttribute('data-x'), y = +cell.getAttribute('data-y');
    if (cell.classList.contains('gf-buy')) { sheetBuy(x, y); return; }
    if (cell.classList.contains('gf-is-tree')) { HUD.toast(t('farm.tree.msg')); return; }
    var tl = tile(x, y);
    if (tl && tl.crop) {
      if (now() < new Date(tl.ripe_at).getTime()) HUD.toast(t('farm.growing.msg', { name: nameOf((crop(tl.crop) || {}).name), left: left(new Date(tl.ripe_at).getTime() - now()) }));
      else HUD.toast(t('farm.ripe.msg'));
      return;
    }
    sheetPlant(x, y);
  }
  function pick(fr) {
    if (fr.classList.contains('is-going')) return;
    var cell = fr.closest('.gf-cell'), x = +cell.getAttribute('data-x'), y = +cell.getAttribute('data-y'), n = +fr.getAttribute('data-n');
    fr.classList.add('is-going');
    SDK.farmPick(x, y, n).then(function (r) {
      if (!r || !r.ok) { fr.classList.remove('is-going'); HUD.toast(why(r)); if (r && r.why === 'growing') load(); return; }
      if (r.picked) gain(fr, r.gain);
      setTimeout(function () { setFarm(r.farm); }, 380);
    }).catch(function () { fr.classList.remove('is-going'); HUD.toast(t('farm.err')); });
  }
  function gain(fr, amount) {
    var d = document.createElement('span'); d.className = 'gf-gain'; d.textContent = '+' + tal(amount) + ' ' + HUD.talentLabel();
    var r = fr.getBoundingClientRect(), b = $('gfBoard').getBoundingClientRect();
    d.style.left = (r.left - b.left + r.width / 2) + 'px'; d.style.top = (r.top - b.top) + 'px';
    $('gfBoard').appendChild(d); setTimeout(function () { d.remove(); }, 1100);
  }
  function why(r) {
    var w = (r && r.why) || '';
    if (w === 'talent') return t('farm.why.talent', { need: tal(r.need), have: tal(r.balance) });
    if (w === 'stage') return t('farm.why.stage', { n: r.need });
    if (w === 'far') return t('farm.why.far');
    if (w === 'growing') return t('farm.why.growing');
    if (w === 'busy') return t('farm.why.busy');
    return t('farm.err');
  }

  /* ── 아래 판(작물 고르기·땅 사기) ── */
  function closeSheet() { var s = $('gfSheet'); if (s) { s.hidden = true; s.innerHTML = ''; } F.sel = null; }
  function sheet(html) { var s = $('gfSheet'); s.innerHTML = html; s.hidden = false; var b = s.querySelector('button:not([disabled])'); if (b) b.focus(); }
  function sheetBuy(x, y) {
    F.sel = { x: x, y: y, kind: 'buy' };
    var p = F.farm.price, can = +F.farm.balance >= +p;
    sheet('<p class="gf-s-t">' + esc(t('farm.buy.t')) + '</p><p class="gf-s-m">' + esc(t('farm.buy.m', { p: tal(p), have: tal(F.farm.balance) })) + '</p>' +
      '<div class="gf-s-acts"><button type="button" class="g-btn g-btn-line" data-act="cancel">' + esc(t('farm.cancel')) + '</button>' +
      '<button type="button" class="g-btn g-btn-primary" data-act="buy"' + (can ? '' : ' disabled') + '>' + esc(can ? t('farm.buy.go', { p: tal(p) }) : t('farm.buy.short')) + '</button></div>');
  }
  function sheetPlant(x, y) {
    F.sel = { x: x, y: y, kind: 'plant' };
    var stage = +F.farm.stage || 1, bal = +F.farm.balance;
    var list = (F.farm.crops || []).map(function (c) {
      var lock = stage < c.min_stage, poor = bal < +c.seed_cost, yieldV = Math.round(c.fruits * c.fruit_value * 10) / 10;
      var meta = t('farm.crop.meta', { time: left(c.grow_sec * 1000), cost: tal(c.seed_cost), n: c.fruits, y: tal(yieldV) });
      return '<button type="button" class="gf-crop" data-crop="' + esc(c.slug) + '"' + (lock || poor ? ' disabled' : '') + '>' +
        '<img alt="" src="' + F.art + 'crop-' + esc(c.slug) + '-2.webp" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="gf-crop-t"><b>' + esc(nameOf(c.name)) + '</b><small>' + esc(lock ? t('farm.crop.lock', { n: c.min_stage }) : meta) + '</small></span></button>';
    }).join('');
    sheet('<p class="gf-s-t">' + esc(t('farm.plant.t')) + '</p><div class="gf-crops">' + list + '</div>' +
      '<div class="gf-s-acts"><button type="button" class="g-btn g-btn-line" data-act="cancel">' + esc(t('farm.cancel')) + '</button></div>');
  }
  function onSheet(e) {
    var b = e.target.closest('button'); if (!b || b.disabled || F.busy || !F.sel) return;
    var act = b.getAttribute('data-act'), cr = b.getAttribute('data-crop'), sel = F.sel;
    if (act === 'cancel') { closeSheet(); return; }
    var p = null;
    if (act === 'buy') p = SDK.farmBuy(sel.x, sel.y);
    else if (cr) p = SDK.farmPlant(sel.x, sel.y, cr);
    if (!p) return;
    F.busy = true; b.disabled = true;
    p.then(function (r) {
      if (!r || !r.ok) { HUD.toast(why(r)); b.disabled = false; return; }
      closeSheet(); setFarm(r.farm);
      HUD.toast(act === 'buy' ? t('farm.bought', { p: tal(r.spent) }) : t('farm.planted'));
    }).catch(function () { HUD.toast(t('farm.err')); b.disabled = false; })
      .then(function () { F.busy = false; });
  }

  function init(o) {
    I = o.i18n; SDK = o.sdk; HUD = o.hud; t = I.t;
    var board = $('gfBoard'); if (!board) return;
    board.addEventListener('click', onBoard);
    board.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.gf-fruit')) { e.preventDefault(); pick(e.target.closest('.gf-fruit')); } });
    $('gfSheet').addEventListener('click', onSheet);
    var rz = 0; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (F.rec) render(); }, 150); });
  }
  return { init: init, open: open, reload: load, state: function () { return F.farm; } };
})();
