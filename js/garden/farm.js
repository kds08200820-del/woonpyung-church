/* ============================================================
   신앙 정원 — 내 땅(밭) (2026-10-23 담임목사 지시)
   · 마름모 칸(아이소메트릭). 가운데(0,0)는 믿음 나무
   · 땅 종류: 전(밭, 작물을 심는다) · 대(대지, 집 지을 자리). 붙은 칸을 여러 개 골라 한 번에 '전'으로 사고(칸당 전 값),
     빈 전을 여러 개 골라 '대지로 바꾸기'(칸당 대지 값). 값은 관리자가 바꾼다
   · 빈 전 → 빠른 작물(분 단위) 또는 내 가방(꽃집에서 산 씨앗·묘목·꽃) 심기
   · 꽃집 품목은 실제 날씨와 물 준 날로 하루씩 셈해(plantsim.js) 자람·꽃·시듦을 보여 주고, 거둘 때가 되면 열매를 하나씩 거둔다
   · 서버가 시간·값·중복을 모두 확인한다. 화면은 받은 상태를 그리기만
   GardenFarm.init({ i18n, sdk, hud, shop, plant }) · GardenFarm.open()
   ============================================================ */
window.GardenFarm = (function () {
  'use strict';
  var I, SDK, HUD, SHOP, PLANT, t;
  var F = { farm: null, skew: 0, timer: 0, rec: null, busy: false, sel: null, mode: 'normal', pick: {}, items: null, wx: [], art: 'images/garden/farm/', shopArt: 'images/garden/shop/' };
  var TW = 132, TH = 66, DEPTH = 14;          // 칸 너비·높이·두께(px, 화면에 맞춰 줄인다)
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nameOf(v) { if (v && typeof v === 'object') { var l = String(I.locale() || 'ko'); return v[l] || v[l.split('-')[0]] || v.ko || v.en || ''; } return v || ''; }
  function tal(n) { return I.fmtNum(Math.round((+n || 0) * 10) / 10); }
  function now() { return Date.now() + F.skew; }
  function crop(slug) { var cs = (F.farm && F.farm.crops) || []; for (var i = 0; i < cs.length; i++) if (cs[i].slug === slug) return cs[i]; return null; }
  function item(slug) { var a = F.items || []; for (var i = 0; i < a.length; i++) if (a[i].slug === slug) return a[i]; return null; }
  function tile(x, y) { var ts = (F.farm && F.farm.tiles) || []; for (var i = 0; i < ts.length; i++) if (ts[i].x === x && ts[i].y === y) return ts[i]; return null; }
  function prices() { var p = (F.farm && F.farm.prices) || {}; return { jeon: +(p.jeon != null ? p.jeon : F.farm.price), dae: +(p.dae != null ? p.dae : 100) }; }
  function tz() { var st = HUD.state ? HUD.state() : null; return (st && st.church && st.church.timezone) || 'Asia/Seoul'; }
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
    F.mode = 'normal'; F.pick = {};
    F.rec = HUD.openModal('gmFarm', { onClose: function () { F.rec = null; clearInterval(F.timer); F.timer = 0; closeSheet(); F.mode = 'normal'; F.pick = {}; } });
    $('gfBoard').innerHTML = '<p class="g-empty gf-loading">' + esc(t('farm.loading')) + '</p>';
    load();
  }
  function load() {
    var st = HUD.state ? HUD.state() : null, ch = (st && st.church) || {};
    var shopP = SHOP && SHOP.load ? SHOP.load().then(function () { F.items = SHOP.items(); }).catch(function () { }) : Promise.resolve();
    var wxP = PLANT && ch.lat != null ? PLANT.weather(ch.lat, ch.lng, tz()).then(function (rows) { F.wx = rows || []; }).catch(function () { }) : Promise.resolve();
    return SDK.farm().then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.why) || 'farm');
      setFarm(r.farm);
      return Promise.all([shopP, wxP]).then(function () { if (F.rec) render(); pushScene(); });
    }).catch(function (e) {
      $('gfBoard').innerHTML = '<p class="g-empty">' + esc(SDK.notReady(e) ? t('farm.notready') : t('farm.err')) + '</p>';
    });
  }
  // 꽃집에서 산 뒤 돌아오면 남은 달란트·가방을 새로 받는다
  function afterShop() { if (F.rec) { closeSheet(); load(); } }
  function setFarm(f) {
    F.farm = f;
    if (f.now) F.skew = new Date(f.now).getTime() - Date.now();
    HUD.setTalent(f.balance);
    render();
    if (F.rec && !F.timer) F.timer = setInterval(tick, 1000);
    pushScene();
  }

  /* ── 메인 장면의 밭 (2026-10-23 담임목사: 산 땅·심은 꽃이 메인 화면에도 보이게) ──
     칸마다 { x, y, land, src, h, dead } — 나무 칸(0,0)은 빼고, 그림 고르기는 위 cellHtml 과 같다. 그리기는 scene.setField */
  var SPR_BASE = { tree: 140, flower: 92, food: 84 };
  var SPR_STAGE = { sprout: .45, sapling: .55, young: .75, grow: .85, bloom: 1, full: 1.08, harvest: 1, fruit: 1, rest: .9, done: .8, dead: .8 };
  function sceneList() {
    var ts = (F.farm && F.farm.tiles) || [], out = [];
    ts.forEach(function (tl) {
      if (tl.x === 0 && tl.y === 0) return;
      var o = { x: tl.x, y: tl.y, land: tl.land === 'dae' ? 'dae' : 'jeon', src: '', h: 0, dead: false };
      var c = tl.crop ? crop(tl.crop) : null;
      if (c && tl.ripe_at) {
        var prog = 1 - Math.max(0, new Date(tl.ripe_at).getTime() - now()) / (c.grow_sec * 1000);
        o.src = F.art + 'crop-' + c.slug + '-' + (prog < 0.5 ? 1 : 2) + '.webp'; o.h = prog < 0.5 ? 60 : 82; o.planted = true; o.name = nameOf(c.name);
        if (prog >= 1 && (tl.picked || []).length < c.fruits) o.bubble = F.art + 'fruit-' + c.slug + '.webp';   // 입체 정원의 열매 말풍선
      } else if (tl.item) {
        var it = item(tl.item), v = plantView(tl), cat = (it && it.category) || 'flower', stage = v ? v.stage : 'grow';
        var bud = cat === 'flower' && (stage === 'sprout' || stage === 'grow');
        o.src = bud || stage === 'sprout' ? F.shopArt + '_sprout.webp' : F.shopArt + tl.item + '.webp';
        o.h = Math.round((bud || stage === 'sprout' ? 44 : SPR_BASE[cat] || 90) * (bud ? 1 : (SPR_STAGE[stage] || 1)));
        o.dead = stage === 'dead'; o.planted = true; o.name = it ? nameOf(it.name) : '';
        if (v && v.ready && it && it.model && it.model.per_day && (tl.harvested || []).length < it.model.per_day) o.bubble = F.shopArt + tl.item + '-fruit.webp';
      }
      out.push(o);
    });
    return out;
  }
  function pushScene() {
    var SC = window.GardenScene; if (!SC || !SC.setField || !F.farm) return;
    var list = sceneList(), sig = JSON.stringify(list);
    if (sig === F.sceneSig) return;
    F.sceneSig = sig;
    SC.setField(list, { onOpen: open, label: t('farm.open') });
  }

  /* ── 그리기 ── */
  function owned(x, y) { return !!tile(x, y); }
  function buyable(x, y) {
    if (owned(x, y) || Math.abs(x) > F.farm.max || Math.abs(y) > F.farm.max) return false;
    if (owned(x + 1, y) || owned(x - 1, y) || owned(x, y + 1) || owned(x, y - 1)) return true;
    if (F.mode !== 'buy') return false;
    return !!(F.pick[(x + 1) + ',' + y] || F.pick[(x - 1) + ',' + y] || F.pick[x + ',' + (y + 1)] || F.pick[x + ',' + (y - 1)]);
  }
  function convertible(tl) { return tl && tl.land !== 'dae' && !(tl.x === 0 && tl.y === 0) && !tl.crop && !tl.item; }
  function plantView(tl) {
    var it = item(tl.item); if (!it || !PLANT) return null;
    return PLANT.state(it, tl, F.wx, F.farm.water_days || [], new Date(now()), tz(), F.farm.xp_day);
  }
  function render() {
    var f = F.farm, board = $('gfBoard'); if (!f || !board) return;
    var P = prices();
    $('gfBal').textContent = tal(f.balance);
    $('gfCount').textContent = t('farm.count2', { n: I.fmtNum(f.count), d: I.fmtNum((f.tiles || []).filter(function (x) { return x.land === 'dae'; }).length) });
    $('gfPrice').textContent = t('farm.price2', { j: tal(P.jeon), d: tal(P.dae) });
    renderTools();
    var cells = [], lo = -f.max, hi = f.max, x, y;
    for (y = lo; y <= hi; y++) for (x = lo; x <= hi; x++) if (owned(x, y) || buyable(x, y)) cells.push({ x: x, y: y });
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    cells.forEach(function (c) { var sx = (c.x - c.y) * TW / 2, sy = (c.x + c.y) * TH / 2; minX = Math.min(minX, sx); maxX = Math.max(maxX, sx); minY = Math.min(minY, sy); maxY = Math.max(maxY, sy); });
    var wrap = board.parentNode, availW = Math.max(280, (wrap.clientWidth || 600) - 24), availH = Math.max(260, (wrap.clientHeight || 500) - 24);
    var needW = maxX - minX + TW, needH = maxY - minY + TH + DEPTH + 120, scale = Math.max(0.45, Math.min(1.7, availW / needW, availH / needH));
    board.style.width = needW * scale + 'px'; board.style.height = needH * scale + 'px';
    board.style.setProperty('--gf-s', scale);
    board.classList.toggle('is-buying', F.mode === 'buy'); board.classList.toggle('is-converting', F.mode === 'convert');
    board.innerHTML = cells.sort(function (a, b) { return (a.x + a.y) - (b.x + b.y) || a.x - b.x; }).map(function (c) {
      return cellHtml(c.x, c.y, ((c.x - c.y) * TW / 2 - minX) * scale, ((c.x + c.y) * TH / 2 - minY + 110) * scale, scale);
    }).join('');
    if (F.mode !== 'normal') sheetPick();
  }
  function renderTools() {
    var f = F.farm, el = $('gfTools'); if (!el) return;
    var phase3 = !!f.prices;
    var h = '';
    if (phase3) {
      h += '<button type="button" class="g-btn ' + (F.mode === 'buy' ? 'g-btn-primary' : 'g-btn-line') + '" data-tool="buy">' + esc(t('farm.tool.buy')) + '</button>';
      h += '<button type="button" class="g-btn ' + (F.mode === 'convert' ? 'g-btn-primary' : 'g-btn-line') + '" data-tool="convert">' + esc(t('farm.tool.convert')) + '</button>';
      h += '<button type="button" class="g-btn g-btn-line" data-tool="water"' + (f.watered ? ' disabled' : '') + '>' + esc(f.watered ? t('water.done') : t('water.go')) + '</button>';
      if (SHOP) h += '<button type="button" class="g-btn g-btn-line" data-tool="shop">' + esc(t('shop.open')) + '</button>';
      if (f.admin) h += '<button type="button" class="g-btn g-btn-line" data-tool="prices">' + esc(t('farm.tool.prices')) + '</button>';
    }
    el.innerHTML = h; el.hidden = !h;
  }
  function cellHtml(x, y, lx, ty, s) {
    var tl = tile(x, y), key = x + ',' + y, picked = !!F.pick[key];
    var st = 'left:' + lx.toFixed(1) + 'px;top:' + ty.toFixed(1) + 'px;width:' + (TW * s).toFixed(1) + 'px;height:' + (TH * s).toFixed(1) + 'px;z-index:' + (100 + x + y);
    if (!tl) {
      return '<button type="button" class="gf-cell gf-buy' + (picked ? ' is-picked' : '') + '" data-x="' + x + '" data-y="' + y + '" style="' + st + '" aria-pressed="' + picked + '" aria-label="' + esc(t('farm.buy.aria', { p: tal(prices().jeon) })) + '">' +
        '<span class="gf-top gf-top-buy"></span><span class="gf-tag">' + esc(picked ? '✓' : tal(prices().jeon)) + '</span></button>';
    }
    var tree = x === 0 && y === 0, c = tl.crop ? crop(tl.crop) : null, inner = '', cls = 'gf-cell', label = '', top = 'gf-top-grass';
    if (tl.land === 'dae') { cls += ' gf-dae'; top = 'gf-top-dae'; label = t('farm.dae.aria'); }
    if (tree) {
      var g = HUD.garden ? HUD.garden() : {}, stage = Math.max(0, Math.min(5, +(g && g.stage) || 0));   // 장면(scene.setPlant)과 같은 그림
      inner = '<img class="gf-spr gf-tree" alt="" draggable="false" src="images/garden/default/plants/' + esc((g && g.species) || 'sunflower') + '-' + stage + '.webp" onerror="this.remove()">';
      cls += ' gf-is-tree'; label = t('farm.tree.aria');
    } else if (c) {
      top = 'gf-top-soil';
      var ripe = now() >= new Date(tl.ripe_at).getTime(), prog = 1 - Math.max(0, new Date(tl.ripe_at).getTime() - now()) / (c.grow_sec * 1000);
      inner = '<img class="gf-spr" alt="" draggable="false" src="' + F.art + 'crop-' + c.slug + '-' + (prog < 0.5 ? 1 : 2) + '.webp" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'gf-ph\'}))">';
      if (ripe) {
        cls += ' gf-ripe'; label = t('farm.ripe.aria', { name: nameOf(c.name) });
        for (var n = 1; n <= c.fruits; n++) {
          if ((tl.picked || []).indexOf(n) >= 0) continue;
          inner += fruitHtml('crop', n, spot(n, c.fruits, x * 7 + y * 3), F.art + 'fruit-' + c.slug + '.webp');
        }
      } else {
        cls += ' gf-growing'; label = t('farm.grow.aria', { name: nameOf(c.name) });
        inner += '<span class="gf-tag gf-time" data-ripe="' + esc(tl.ripe_at) + '">' + esc(left(new Date(tl.ripe_at).getTime() - now())) + '</span>';
      }
    } else if (tl.item) {
      top = 'gf-top-soil';
      var it = item(tl.item), v = plantView(tl);
      var nm = it ? nameOf(it.name) : tl.item;
      if (!v) { inner = '<span class="gf-ph"></span>'; label = nm; }
      else {
        var size = { sprout: 45, sapling: 55, young: 70, grow: 80, bloom: 100, full: 108, harvest: 100, fruit: 100, rest: 85, done: 85, dead: 85 }[v.stage] || 85;
        var flowerBud = it.category === 'flower' && (v.stage === 'sprout' || v.stage === 'grow');
        var src = flowerBud || v.stage === 'sprout' ? F.shopArt + '_sprout.webp' : F.shopArt + tl.item + '.webp';
        inner = '<img class="gf-spr gf-st-' + v.stage + '" style="height:' + size + '%" alt="" draggable="false" src="' + src + '" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'gf-ph\'}))">';
        cls += ' gf-item gf-item-' + v.stage + (v.needWater ? ' gf-thirsty' : '');
        label = nm + ' — ' + t('plant.st.' + v.stage);
        if (v.ready && it.model && it.model.per_day) {
          var done = tl.harvested || [], per = it.model.per_day;
          for (var k = 1; k <= per; k++) if (done.indexOf(k) < 0) inner += fruitHtml('item', k, spot(k, per, x * 5 + y * 11), F.shopArt + tl.item + '-fruit.webp');
        }
        if (v.stage === 'dead') inner += '<span class="gf-tag gf-warn">' + esc(t('plant.st.dead')) + '</span>';
        else if (v.needWater) inner += '<span class="gf-tag gf-water">' + esc(t('plant.thirsty')) + '</span>';
        else if (v.needXp > 0 || v.age - v.grown >= 3) inner += '<span class="gf-tag gf-xp">' + esc(t('plant.wantXp')) + '</span>';
      }
    } else if (tl.land !== 'dae') { cls += ' gf-empty'; label = t('farm.empty.aria'); }
    if (picked) cls += ' is-picked';
    if (F.mode === 'convert' && convertible(tl)) cls += ' is-pickable';
    return '<div class="' + cls + '" data-x="' + x + '" data-y="' + y + '" style="' + st + '">' +
      '<span class="gf-side' + (tl.land === 'dae' ? ' gf-side-dae' : '') + '"></span><button type="button" class="gf-hit" aria-label="' + esc(label) + '"' + (F.mode === 'convert' ? ' aria-pressed="' + picked + '"' : '') + '><span class="gf-top ' + top + '"></span></button>' +
      '<span class="gf-stand">' + inner + '</span>' + (picked ? '<span class="gf-tag gf-pick">✓</span>' : '') + '</div>';
  }
  function fruitHtml(kind, n, p, src) {
    return '<span class="gf-fruit" role="button" tabindex="0" data-kind="' + kind + '" data-n="' + n + '" style="left:' + p.x.toFixed(1) + '%;top:' + p.y.toFixed(1) + '%" aria-label="' + esc(t('farm.fruit.aria', { n: n })) + '"><img alt="" draggable="false" src="' + src + '" onerror="this.parentNode.classList.add(\'noimg\');this.remove()"></span>';
  }
  function tick() {
    if (!F.farm) return;
    var flip = false;
    Array.prototype.forEach.call(document.querySelectorAll('#gfBoard .gf-time'), function (el) {
      var ms = new Date(el.getAttribute('data-ripe')).getTime() - now();
      if (ms <= 0) flip = true; else el.textContent = left(ms);
    });
    if (flip) { render(); pushScene(); }
  }

  /* ── 누르기 ── */
  function onBoard(e) {
    var fr = e.target.closest('.gf-fruit');
    if (fr && F.mode === 'normal') { pick(fr); return; }
    var cell = e.target.closest('.gf-cell'); if (!cell) return;
    var x = +cell.getAttribute('data-x'), y = +cell.getAttribute('data-y'), key = x + ',' + y, tl = tile(x, y);
    if (F.mode === 'buy') {
      if (!tl) { if (F.pick[key]) delete F.pick[key]; else F.pick[key] = 1; prune(); render(); }
      return;
    }
    if (F.mode === 'convert') {
      if (convertible(tl)) { if (F.pick[key]) delete F.pick[key]; else F.pick[key] = 1; render(); }
      else HUD.toast(t(tl && tl.land === 'dae' ? 'farm.why.already' : 'farm.why.convert'));
      return;
    }
    if (!tl) {
      if (F.farm.prices) { F.mode = 'buy'; F.pick = {}; F.pick[key] = 1; render(); }
      else sheetBuyOne(x, y);
      return;
    }
    if (cell.classList.contains('gf-is-tree')) { HUD.toast(t('farm.tree.msg')); return; }
    if (tl.land === 'dae') { HUD.toast(t('farm.dae.msg')); return; }
    if (tl.crop) {
      if (now() < new Date(tl.ripe_at).getTime()) HUD.toast(t('farm.growing.msg', { name: nameOf((crop(tl.crop) || {}).name), left: left(new Date(tl.ripe_at).getTime() - now()) }));
      else HUD.toast(t('farm.ripe.msg'));
      return;
    }
    if (tl.item) { sheetItem(tl); return; }
    sheetPlant(x, y);
  }
  // 산 칸에 붙은 것만 남긴다(고른 칸을 빼면 그 칸에만 붙어 있던 칸도 빠진다)
  function prune() {
    var keep = {}, changed = true, ks = Object.keys(F.pick);
    while (changed) {
      changed = false;
      ks.forEach(function (k) {
        if (keep[k]) return;
        var p = k.split(','), x = +p[0], y = +p[1];
        var near = owned(x + 1, y) || owned(x - 1, y) || owned(x, y + 1) || owned(x, y - 1) || keep[(x + 1) + ',' + y] || keep[(x - 1) + ',' + y] || keep[x + ',' + (y + 1)] || keep[x + ',' + (y - 1)];
        if (near) { keep[k] = 1; changed = true; }
      });
    }
    F.pick = keep;
  }
  function pick(fr) {
    if (fr.classList.contains('is-going')) return;
    var cell = fr.closest('.gf-cell'), x = +cell.getAttribute('data-x'), y = +cell.getAttribute('data-y'), n = +fr.getAttribute('data-n');
    var p = fr.getAttribute('data-kind') === 'item' ? SDK.farmHarvest(x, y, n) : SDK.farmPick(x, y, n);
    fr.classList.add('is-going');
    p.then(function (r) {
      if (!r || !r.ok) { fr.classList.remove('is-going'); HUD.toast(why(r)); if (r && (r.why === 'growing' || r.why === 'not_ready')) load(); return; }
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
    if (w === 'growing' || w === 'not_ready') return t('farm.why.growing');
    if (w === 'busy') return t('farm.why.busy');
    if (w === 'xp') return t('farm.why.xp', { need: I.fmtNum(r.need) });
    if (w === 'dae') return t('farm.dae.msg');
    if (w === 'already') return t('farm.why.already');
    if (w === 'admin') return t('farm.why.admin');
    return t('farm.err');
  }

  /* ── 위 단추 ── */
  function onTools(e) {
    var b = e.target.closest('[data-tool]'); if (!b || b.disabled) return;
    var k = b.getAttribute('data-tool');
    if (k === 'buy' || k === 'convert') { F.mode = F.mode === k ? 'normal' : k; F.pick = {}; closeSheet(); render(); return; }
    if (k === 'water') { water(b); return; }
    if (k === 'shop' && SHOP) { SHOP.open(null, afterShop); return; }
    if (k === 'prices') { sheetPrices(); return; }
  }
  function water(b) {
    b.disabled = true;
    SDK.water().then(function (r) {
      if (!r || !r.ok) { b.disabled = false; HUD.toast(t('water.err')); return; }
      HUD.afterWater(r);
      F.farm.watered = true;
      if (r.day && (F.farm.water_days || []).indexOf(r.day) < 0) (F.farm.water_days = F.farm.water_days || []).push(r.day);
      if (r.talent_balance != null) F.farm.balance = r.talent_balance;
      render();
    }).catch(function () { b.disabled = false; HUD.toast(t('water.err')); });
  }

  /* ── 아래 판 ── */
  function closeSheet() { var s = $('gfSheet'); if (s) { s.hidden = true; s.innerHTML = ''; } F.sel = null; }
  function sheet(html) { var s = $('gfSheet'); s.innerHTML = html; s.hidden = false; }
  function acts(main) { return '<div class="gf-s-acts"><button type="button" class="g-btn g-btn-line" data-act="cancel">' + esc(t('farm.cancel')) + '</button>' + (main || '') + '</div>'; }
  function sheetPick() {
    var n = Object.keys(F.pick).length, P = prices(), buy = F.mode === 'buy', per = buy ? P.jeon : P.dae, total = Math.round(per * n * 10) / 10, can = n > 0 && +F.farm.balance >= total;
    F.sel = { kind: F.mode };
    sheet('<p class="gf-s-t">' + esc(t(buy ? 'farm.pick.buy.t' : 'farm.pick.convert.t')) + '</p>' +
      '<p class="gf-s-m">' + esc(n ? t('farm.pick.sum', { n: n, per: tal(per), total: tal(total), have: tal(F.farm.balance) }) : t(buy ? 'farm.pick.buy.hint' : 'farm.pick.convert.hint')) + '</p>' +
      acts('<button type="button" class="g-btn g-btn-primary" data-act="' + (buy ? 'buymany' : 'convert') + '"' + (can ? '' : ' disabled') + '>' +
        esc(!n ? t('farm.pick.none') : can ? t(buy ? 'farm.pick.buy.go' : 'farm.pick.convert.go', { n: n, total: tal(total) }) : t('farm.buy.short')) + '</button>'));
  }
  function sheetBuyOne(x, y) {   // 3단계 SQL 전(값이 하나뿐일 때)
    F.sel = { x: x, y: y, kind: 'buy' };
    var p = F.farm.price, can = +F.farm.balance >= +p;
    sheet('<p class="gf-s-t">' + esc(t('farm.buy.t')) + '</p><p class="gf-s-m">' + esc(t('farm.buy.m', { p: tal(p), have: tal(F.farm.balance) })) + '</p>' +
      acts('<button type="button" class="g-btn g-btn-primary" data-act="buy"' + (can ? '' : ' disabled') + '>' + esc(can ? t('farm.buy.go', { p: tal(p) }) : t('farm.buy.short')) + '</button>'));
  }
  function sheetPlant(x, y) {
    F.sel = { x: x, y: y, kind: 'plant' };
    var stage = +F.farm.stage || 1, bal = +F.farm.balance;
    var quick = (F.farm.crops || []).map(function (c) {
      var lock = stage < c.min_stage, poor = bal < +c.seed_cost, yieldV = Math.round(c.fruits * c.fruit_value * 10) / 10;
      return '<button type="button" class="gf-crop" data-crop="' + esc(c.slug) + '"' + (lock || poor ? ' disabled' : '') + '>' +
        '<img alt="" src="' + F.art + 'crop-' + esc(c.slug) + '-2.webp" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="gf-crop-t"><b>' + esc(nameOf(c.name)) + '</b><small>' + esc(lock ? t('farm.crop.lock', { n: c.min_stage }) : t('farm.crop.meta', { time: left(c.grow_sec * 1000), cost: tal(c.seed_cost), n: c.fruits, y: tal(yieldV) })) + '</small></span></button>';
    }).join('');
    var inv = (F.farm.inventory || []).map(function (i) {
      var it = item(i.item); if (!it) return '';
      var pm = it.model && it.model.plant_months, off = pm && pm.length && pm.indexOf(new Date(Date.now() + F.skew).getMonth() + 1) < 0;
      return '<button type="button" class="gf-crop' + (off ? ' gf-off' : '') + '" data-item="' + esc(i.item) + '"><img alt="" src="' + F.shopArt + esc(i.item) + '.webp" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="gf-crop-t"><b>' + esc(nameOf(it.name)) + ' <em>×' + i.qty + '</em></b><small>' + esc(off ? t('farm.bag.off', { when: (it.specs && it.specs.plant) || '' }) : (it.specs && (it.specs.first || it.specs.bloom)) || '') + '</small></span></button>';
    }).join('');
    var bagH = F.farm.inventory ? '<p class="gf-s-t gf-s-t2">' + esc(t('farm.bag.t')) + '</p>' + (inv ? '<div class="gf-crops">' + inv + '</div>' : '<p class="gf-s-m">' + esc(t('farm.bag.empty')) + '</p>') : '';
    sheet(bagH + '<p class="gf-s-t gf-s-t2">' + esc(t('farm.plant.t')) + '</p><div class="gf-crops">' + quick + '</div>' +
      acts(SHOP && F.farm.inventory ? '<button type="button" class="g-btn g-btn-line" data-act="shop">' + esc(t('shop.open')) + '</button>' : ''));
  }
  function sheetItem(tl) {
    var it = item(tl.item), v = plantView(tl);
    F.sel = { x: tl.x, y: tl.y, kind: 'item' };
    if (!it) { sheet('<p class="gf-s-t">' + esc(tl.item) + '</p>' + acts()); return; }
    var sp = it.specs || {}, lines = [];
    if (v) {
      lines.push(t('plant.age', { d: v.age }) + ' · ' + t('plant.st.' + v.stage));
      if (v.xp != null) lines.push(t('plant.grown', { g: v.grown, xp: I.fmtNum(v.xp) }));
      if (v.needXp > 0) lines.push(t('plant.needXp', { n: I.fmtNum(v.needXp) }));
      else if (v.age - v.grown >= 3) lines.push(t('plant.slowXp', { n: v.xpDay }));
      if (v.stage === 'dead') lines.push(PLANT.CAUSE[v.cause] || '');
      if (v.yearsLeft) lines.push(t(v.xp != null ? 'plant.yearsLeftXp' : 'plant.yearsLeft', { n: v.yearsLeft, x: v.xpDay }));
      if (v.daysLeft) lines.push(t(v.xp != null ? 'plant.daysLeftXp' : 'plant.daysLeft', { n: v.daysLeft, x: v.xpDay }));
      if (v.full) lines.push(t('plant.full'));
      lines.push(v.needWater ? t('plant.needWater', { d: v.sinceWater }) : t('plant.moist', { mm: v.moisture }));
    }
    if (sp.water) lines.push(t('shop.spec.water') + ': ' + sp.water);
    var clear = v && (v.stage === 'dead' || v.stage === 'done');
    sheet('<p class="gf-s-t">' + esc(nameOf(it.name)) + '</p><ul class="gf-s-list">' + lines.filter(Boolean).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      acts((F.farm.watered ? '' : '<button type="button" class="g-btn g-btn-line" data-act="water">' + esc(t('water.go')) + '</button>') +
        (clear ? '<button type="button" class="g-btn g-btn-primary" data-act="clear">' + esc(t('farm.clear')) + '</button>' : '')));
  }
  function sheetPrices() {
    var P = prices();
    F.sel = { kind: 'prices' };
    sheet('<p class="gf-s-t">' + esc(t('farm.prices.t')) + '</p><div class="gf-prices">' +
      '<label>' + esc(t('farm.prices.jeon')) + '<input type="number" id="gfPJ" min="0" step="0.1" value="' + esc(P.jeon) + '"></label>' +
      '<label>' + esc(t('farm.prices.dae')) + '<input type="number" id="gfPD" min="0" step="0.1" value="' + esc(P.dae) + '"></label></div>' +
      acts('<button type="button" class="g-btn g-btn-primary" data-act="prices">' + esc(t('farm.prices.save')) + '</button>'));
  }
  function onSheet(e) {
    var b = e.target.closest('button'); if (!b || b.disabled || F.busy || !F.sel) return;
    var act = b.getAttribute('data-act'), cr = b.getAttribute('data-crop'), itm = b.getAttribute('data-item'), sel = F.sel;
    if (act === 'cancel') { if (F.mode !== 'normal') { F.mode = 'normal'; F.pick = {}; render(); } closeSheet(); return; }
    if (act === 'shop') { if (SHOP) SHOP.open(null, afterShop); return; }
    if (act === 'water') { water(b); closeSheet(); return; }
    var p = null, cells = Object.keys(F.pick).map(function (k) { var a = k.split(','); return { x: +a[0], y: +a[1] }; });
    if (act === 'buy') p = SDK.farmBuy(sel.x, sel.y);
    else if (act === 'buymany') p = SDK.farmBuyMany(cells);
    else if (act === 'convert') p = SDK.farmConvert(cells);
    else if (act === 'clear') p = SDK.farmClear(sel.x, sel.y);
    else if (act === 'prices') {
      var j = Math.round(+$('gfPJ').value * 10) / 10, d = Math.round(+$('gfPD').value * 10) / 10;
      if (!(j >= 0 && d >= 0)) { HUD.toast(t('shop.admin.bad')); return; }
      p = SDK.adminSetLandPrices(j, d).then(function (r) { if (r && r.ok) { F.farm.prices = r.prices; return { ok: true, farm: F.farm, prices: r.prices }; } return r; });
    }
    else if (cr) p = SDK.farmPlant(sel.x, sel.y, cr);
    else if (itm) p = SDK.farmPlantItem(sel.x, sel.y, itm);
    if (!p) return;
    F.busy = true; b.disabled = true;
    p.then(function (r) {
      if (!r || !r.ok) { HUD.toast(why(r)); b.disabled = false; return; }
      var msg = act === 'buy' ? t('farm.bought', { p: tal(r.spent) }) : act === 'buymany' ? t('farm.bought.many', { n: r.n, p: tal(r.spent) })
        : act === 'convert' ? t('farm.converted', { n: r.n, p: tal(r.spent) }) : act === 'clear' ? t('farm.cleared') : act === 'prices' ? t('farm.prices.saved') : t('farm.planted');
      F.mode = 'normal'; F.pick = {}; closeSheet(); setFarm(r.farm);
      HUD.toast(msg);
    }).catch(function () { HUD.toast(t('farm.err')); b.disabled = false; })
      .then(function () { F.busy = false; });
  }

  function init(o) {
    I = o.i18n; SDK = o.sdk; HUD = o.hud; SHOP = o.shop || window.GardenShop || null; PLANT = o.plant || window.GardenPlant || null; t = I.t;
    var board = $('gfBoard'); if (!board) return;
    board.addEventListener('click', onBoard);
    board.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.gf-fruit')) { e.preventDefault(); pick(e.target.closest('.gf-fruit')); } });
    $('gfSheet').addEventListener('click', onSheet);
    if ($('gfTools')) $('gfTools').addEventListener('click', onTools);
    var rz = 0; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (F.rec) render(); }, 150); });
    setInterval(pushScene, 60 * 1000);   // 창이 닫혀 있어도 작물이 자라는 모습을 1분마다
  }
  return { init: init, open: open, reload: load, pushScene: pushScene, sceneList: sceneList, state: function () { return F.farm; } };
})();
