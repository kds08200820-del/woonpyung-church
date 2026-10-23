/* ============================================================
   신앙 정원 — 내 땅(밭) (2026-10-23 담임목사 지시)
   · 입체 정원(garden3d.js) 하나에서 가꾼다 — "화면이 2개면 혼동이 있습니다. 둘째 화면으로 통합해서 그곳에서 심고 거두기,
     첫째 화면의 메뉴도 둘째 화면으로" (같은 날). 예전 마름모 2D 창(gmFarm)은 없앴다
   · 가운데(0,0)는 믿음 나무. 땅 종류: 전(밭, 작물을 심는다) · 대(대지, 집 지을 자리)
   · 칸 누르기: 빈 전 → 심기(빠른 작물 · 내 가방) / 익은 작물·열매 → 거두기 / 꽃집 품목 → 상태 / 점선 칸 → 땅 사기
   · 메뉴(땅 사기 · 대지로 바꾸기 · 물 주기 · 달란트 스토어 · 땅 값 바꾸기)와 심기 목록은 입체 창 오른쪽 칸(휴대폰은 아래 칸)
   · 꽃집 품목은 실제 날씨와 물 준 날로 하루씩 셈해(plantsim.js) 자람·꽃·시듦을 보여 주고, 거둘 때가 되면 열매를 거둔다
   · 서버가 시간·값·중복을 모두 확인한다. 화면은 받은 상태를 그리기만
   GardenFarm.init({ i18n, sdk, hud, shop, plant }) · open() · attach3d(opts) · bindView(view)
   ============================================================ */
window.GardenFarm = (function () {
  'use strict';
  var I, SDK, HUD, SHOP, PLANT, t;
  var F = { farm: null, skew: 0, view: null, ui: null, busy: false, sel: null, mode: 'normal', pick: {}, items: null, wx: [], art: 'images/garden/farm/', shopArt: 'images/garden/shop/' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ui(id) { return F.ui ? F.ui.querySelector('#' + id) : null; }
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

  /* ── 열기: 입체 정원으로 (메인 장면의 밭·식물, '내 땅 가꾸기', 안내 도우미가 모두 여기로) ── */
  function open() {
    if (window.GardenApp && window.GardenApp.open3d) window.GardenApp.open3d();
    else HUD.toast(t('g3d.fail'));
  }
  // 입체 창을 열기 전에 붙인다: 내 땅 그림·오른쪽 칸(메뉴·심기 목록)·칸 누르기
  function attach3d(opts) {
    F.mode = 'normal'; F.pick = {};
    opts.side = panel(); opts.sideLabel = t('farm.menu');
    opts.land = (F.farm && F.items ? Promise.resolve() : load()).then(function () { return F.farm ? land3d() : null; });
    opts.onTile = onCell;
    opts.onBubble = function (kind, data) {
      if (kind === 'tree') pickTree();
      else if (data) { var tl = tile(data.x, data.y); if (tl) harvestTile(tl); }
      return true;   // 창은 그대로
    };
    opts.fmtLeft = left;
    opts.onExpire = function () { render(); pushScene(); };
    var prev = opts.onClose;
    opts.onClose = function () { F.view = null; F.mode = 'normal'; F.pick = {}; closeSheet(); if (prev) prev(); };
    closeSheet(); renderPanel();
    return opts;
  }
  function bindView(v) { F.view = v; }
  function used() { if (window.Garden3D && window.Garden3D.markUsed) window.Garden3D.markUsed(); }   // 가꾼 날 — 사흘 잇달아면 쓰는 법 안내를 그만
  function openSide() { if (F.view && F.view.openSide) F.view.openSide(true); }

  function load() {
    var st = HUD.state ? HUD.state() : null, ch = (st && st.church) || {};
    var shopP = SHOP && SHOP.load ? SHOP.load().then(function () { F.items = SHOP.items(); }).catch(function () { }) : Promise.resolve();
    var wxP = PLANT && ch.lat != null ? PLANT.weather(ch.lat, ch.lng, tz()).then(function (rows) { F.wx = rows || []; }).catch(function () { }) : Promise.resolve();
    return SDK.farm().then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.why) || 'farm');
      setFarm(r.farm);
      return Promise.all([shopP, wxP]).then(function () { render(); pushScene(); });
    }).catch(function (e) {
      if (F.view) HUD.toast(SDK.notReady(e) ? t('farm.notready') : t('farm.err'));
    });
  }
  // 스토어에서 산 뒤 돌아오면 남은 달란트·가방을 새로 받는다
  function afterShop() { if (F.view) { closeSheet(); load(); } }
  function setFarm(f) {
    F.farm = f;
    if (f.now) F.skew = new Date(f.now).getTime() - Date.now();
    HUD.setTalent(f.balance);
    render();
    pushScene();
  }

  /* ── 메인 장면의 밭 (2026-10-23 담임목사: 산 땅·심은 꽃이 메인 화면에도 보이게) ──
     칸마다 { x, y, land, src, h, dead, name, planted, bubble } — 나무 칸(0,0)은 뺀다. 그리기는 scene.setField · garden3d
     fm 을 주면 그 밭(이웃 정원 방문: { tiles, water_days, xp_day })으로 — 남의 밭에는 열매 말풍선을 띄우지 않는다 */
  var SPR_BASE = { tree: 140, flower: 92, food: 84 };
  var SPR_STAGE = { sprout: .45, sapling: .55, young: .75, grow: .85, bloom: 1, full: 1.08, harvest: 1, fruit: 1, rest: .9, done: .8, dead: .8 };
  function sceneList(fm) {
    var src0 = fm || F.farm, ts = (src0 && src0.tiles) || [], out = [];
    ts.forEach(function (tl) {
      if (tl.x === 0 && tl.y === 0) return;
      var o = { x: tl.x, y: tl.y, land: tl.land === 'dae' ? 'dae' : 'jeon', src: '', h: 0, dead: false };
      var c = tl.crop ? crop(tl.crop) : null;
      if (c && tl.ripe_at) {
        var prog = 1 - Math.max(0, new Date(tl.ripe_at).getTime() - now()) / (c.grow_sec * 1000);
        o.src = F.art + 'crop-' + c.slug + '-' + (prog < 0.5 ? 1 : 2) + '.webp'; o.h = prog < 0.5 ? 60 : 82; o.planted = true; o.name = nameOf(c.name);
        if (!fm && prog >= 1 && (tl.picked || []).length < c.fruits) o.bubble = F.art + 'fruit-' + c.slug + '.webp';   // 입체 정원의 열매 말풍선
      } else if (tl.item) {
        var it = item(tl.item), v = plantView(tl, fm), cat = (it && it.category) || 'flower', stage = v ? v.stage : 'grow';
        var bud = cat === 'flower' && (stage === 'sprout' || stage === 'grow');
        o.src = bud || stage === 'sprout' ? F.shopArt + '_sprout.webp' : F.shopArt + tl.item + '.webp';
        o.h = Math.round((bud || stage === 'sprout' ? 44 : SPR_BASE[cat] || 90) * (bud ? 1 : (SPR_STAGE[stage] || 1)));
        o.dead = stage === 'dead'; o.planted = true; o.name = it ? nameOf(it.name) : '';
        if (!fm && v && v.ready && it && it.model && it.model.per_day && (tl.harvested || []).length < it.model.per_day) o.bubble = F.shopArt + tl.item + '-fruit.webp';
      }
      out.push(o);
    });
    return out;
  }
  /* 오늘 돌볼 것 — 거둘 것·목마른 것·마음(XP)이 더 필요한 것·시든 것·빈 밭 (안내 도우미) */
  function summary() {
    var out = { ripe: [], thirsty: [], wantXp: [], dead: [], empty: 0, balance: F.farm ? +F.farm.balance || 0 : 0, price: F.farm ? prices().jeon : 0 };
    ((F.farm && F.farm.tiles) || []).forEach(function (tl) {
      if (tl.x === 0 && tl.y === 0) return;
      var c = tl.crop ? crop(tl.crop) : null;
      if (c && tl.ripe_at) {
        if (now() >= new Date(tl.ripe_at).getTime() && (tl.picked || []).length < c.fruits) out.ripe.push(nameOf(c.name));
      } else if (tl.item) {
        var it = item(tl.item), v = plantView(tl), nm = it ? nameOf(it.name) : tl.item;
        if (!v) return;
        if (v.stage === 'dead') out.dead.push(nm);
        else if (v.ready && it && it.model && it.model.per_day && (tl.harvested || []).length < it.model.per_day) out.ripe.push(nm);
        else if (v.needWater) out.thirsty.push(nm);
        else if (v.needXp > 0 || v.age - v.grown >= 3) out.wantXp.push(nm);
      } else if (tl.land !== 'dae') out.empty++;
    });
    return out;
  }
  /* 오른쪽 '내 식물' 칸에 내 땅에 심은 것 — 종류(수량), 나무·꽃·채소·빠른 작물 순 (2026-10-23 담임목사) */
  var CAT_RANK = { tree: 0, flower: 1, food: 2, crop: 3 };
  function renderMine() {
    var box = document.getElementById('gGrowMine'); if (!box || !F.farm) return;
    var by = {}, dead = 0;
    (F.farm.tiles || []).forEach(function (tl) {
      if (tl.x === 0 && tl.y === 0) return;
      var nm = '', cat = 'crop';
      if (tl.crop) { var c = crop(tl.crop); nm = c ? nameOf(c.name) : ''; }
      else if (tl.item) {
        var it = item(tl.item), v = plantView(tl);
        if (v && v.stage === 'dead') { dead++; return; }
        nm = it ? nameOf(it.name) : ''; cat = (it && it.category) || 'flower';
      }
      if (!nm) return;
      var g = by[nm] || (by[nm] = { name: nm, n: 0, rank: CAT_RANK[cat] != null ? CAT_RANK[cat] : 2 });
      g.n++;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.rank - b.rank || b.n - a.n || (a.name < b.name ? -1 : 1); });
    var parts = list.map(function (g) { return t('growth.mine.one', { name: g.name, n: I.fmtNum(g.n) }); });
    if (dead) parts.push(t('growth.mine.dead', { n: I.fmtNum(dead) }));
    box.hidden = !parts.length;
    box.textContent = parts.length ? t('growth.mine', { list: parts.join(' · ') }) : '';
  }
  function pushScene() {
    var SC = window.GardenScene; if (!F.farm) return;
    renderMine();
    if (!SC || !SC.setField) return;
    var list = sceneList(), sig = JSON.stringify(list);
    if (sig === F.sceneSig) return;
    F.sceneSig = sig;
    SC.setField(list, { onOpen: open, label: t('farm.open') });
  }

  /* ── 칸 규칙 ── */
  function owned(x, y) { return !!tile(x, y); }
  function buyable(x, y) {
    if (owned(x, y) || Math.abs(x) > F.farm.max || Math.abs(y) > F.farm.max) return false;
    if (owned(x + 1, y) || owned(x - 1, y) || owned(x, y + 1) || owned(x, y - 1)) return true;
    if (F.mode !== 'buy') return false;
    return !!(F.pick[(x + 1) + ',' + y] || F.pick[(x - 1) + ',' + y] || F.pick[x + ',' + (y + 1)] || F.pick[x + ',' + (y - 1)]);
  }
  function convertible(tl) { return tl && tl.land !== 'dae' && !(tl.x === 0 && tl.y === 0) && !tl.crop && !tl.item; }
  function plantView(tl, fm) {
    var it = item(tl.item), f = fm || F.farm; if (!it || !PLANT || !f) return null;
    return PLANT.state(it, tl, F.wx, f.water_days || [], new Date(now()), tz(), f.xp_day);
  }
  // 품목·날씨를 받아 두었는지(이웃 정원을 그리기 전에) — 없으면 내 밭과 함께 받는다
  function ready() { return F.items && F.farm ? Promise.resolve(true) : load().then(function () { return true; }, function () { return false; }); }
  function remaining(tl) {
    var c = tl.crop ? crop(tl.crop) : null, it = tl.item ? item(tl.item) : null, out = [], n;
    if (c && tl.ripe_at && now() >= new Date(tl.ripe_at).getTime()) { for (n = 1; n <= c.fruits; n++) if ((tl.picked || []).indexOf(n) < 0) out.push(n); }
    else if (it && it.model && it.model.per_day) { var v = plantView(tl); if (v && v.ready) for (n = 1; n <= it.model.per_day; n++) if ((tl.harvested || []).indexOf(n) < 0) out.push(n); }
    return out;
  }

  /* ── 입체 정원에 넘길 땅 ── */
  function land3d() {
    var f = F.farm || {}, list = sceneList(), picks = F.pick, pickable = {}, buy = [];
    list.forEach(function (o) {
      var tl = tile(o.x, o.y); if (!tl) return;
      if (tl.crop && tl.ripe_at) { var ms = new Date(tl.ripe_at).getTime(); if (ms > now()) o.until = ms - F.skew; }
      else if (tl.item) {
        var v = plantView(tl);
        if (v) o.tag = v.stage === 'dead' ? t('plant.st.dead') : v.needWater ? t('plant.thirsty') : (v.needXp > 0 || v.age - v.grown >= 3) ? t('plant.wantXp') : '';
      }
    });
    if (f.max != null) for (var y = -f.max; y <= f.max; y++) for (var x = -f.max; x <= f.max; x++) if (buyable(x, y)) buy.push({ x: x, y: y, label: tal(prices().jeon) });
    if (F.mode === 'convert') (f.tiles || []).forEach(function (tl) { if (convertible(tl)) pickable[tl.x + ',' + tl.y] = 1; });
    return { tiles: list, max: f.max || 4, buyable: buy, picks: picks, pickable: pickable, mode: F.mode };
  }
  function render() {
    renderPanel();
    if (F.view && F.farm) F.view.setLand(land3d());
    if (F.mode !== 'normal' && F.ui) sheetPick();
  }

  /* ── 오른쪽 칸(휴대폰은 아래 칸): 잔액·땅·값 · 메뉴 · 그때그때 판 ── */
  function panel() {
    if (F.ui) return F.ui;
    var d = document.createElement('aside');
    d.className = 'gf3'; d.setAttribute('aria-label', t('farm.title'));
    d.innerHTML = '<div class="gf3-head"><h2 class="gf3-t">' + esc(t('farm.title')) + '</h2>' +
      '<div class="gf-stats"><span class="g-chip gf-bal"><b id="gfBal">0</b><span id="gfUnit"></span></span><span class="g-chip" id="gfCount"></span><span class="g-chip" id="gfPrice"></span></div>' +
      '<div class="gf-tools" id="gfTools" hidden></div></div>' +
      '<div class="gf-sheet gf3-sheet" id="gfSheet"></div>';
    d.querySelector('#gfTools').addEventListener('click', onTools);
    d.querySelector('#gfSheet').addEventListener('click', onSheet);
    F.ui = d;
    return d;
  }
  function renderPanel() {
    var f = F.farm; if (!F.ui || !f) return;
    var P = prices();
    ui('gfBal').textContent = tal(f.balance); ui('gfUnit').textContent = HUD.talentLabel();
    ui('gfCount').textContent = t('farm.count2', { n: I.fmtNum(f.count), d: I.fmtNum((f.tiles || []).filter(function (x) { return x.land === 'dae'; }).length) });
    ui('gfPrice').textContent = t('farm.price2', { j: tal(P.jeon), d: tal(P.dae) });
    renderTools();
  }
  function renderTools() {
    var f = F.farm, el = ui('gfTools'); if (!el || !f) return;
    var h = '';
    if (f.prices) {
      h += '<button type="button" class="g-btn ' + (F.mode === 'buy' ? 'g-btn-primary' : 'g-btn-line') + '" data-tool="buy">' + esc(t('farm.tool.buy')) + '</button>';
      h += '<button type="button" class="g-btn ' + (F.mode === 'convert' ? 'g-btn-primary' : 'g-btn-line') + '" data-tool="convert">' + esc(t('farm.tool.convert')) + '</button>';
      h += '<button type="button" class="g-btn g-btn-line" data-tool="water"' + (f.watered ? ' disabled' : '') + '>' + esc(f.watered ? t('water.done') : t('water.go')) + '</button>';
      if (SHOP) h += '<button type="button" class="g-btn g-btn-line" data-tool="shop">' + esc(t('shop.open')) + '</button>';
      if (f.admin) h += '<button type="button" class="g-btn g-btn-line" data-tool="prices">' + esc(t('farm.tool.prices')) + '</button>';
    }
    el.innerHTML = h; el.hidden = !h;
  }

  /* ── 칸 누르기 ── */
  function onCell(c) {
    if (!F.farm || F.busy) return;
    var x = c.x, y = c.y, key = x + ',' + y, tl = tile(x, y);
    if (F.mode === 'buy') {
      if (!tl && buyable(x, y)) { if (F.pick[key]) delete F.pick[key]; else F.pick[key] = 1; prune(); render(); openSide(); }
      return;
    }
    if (F.mode === 'convert') {
      if (convertible(tl)) { if (F.pick[key]) delete F.pick[key]; else F.pick[key] = 1; render(); openSide(); }
      else HUD.toast(t(tl && tl.land === 'dae' ? 'farm.why.already' : 'farm.why.convert'));
      return;
    }
    if (!tl) {
      if (!buyable(x, y)) return;
      if (F.farm.prices) { F.mode = 'buy'; F.pick = {}; F.pick[key] = 1; render(); }
      else sheetBuyOne(x, y);
      openSide();
      return;
    }
    if (x === 0 && y === 0) { pickTree(); return; }
    if (tl.land === 'dae') { HUD.toast(t('farm.dae.msg')); return; }
    if (tl.crop) {
      if (now() < new Date(tl.ripe_at).getTime()) HUD.toast(t('farm.growing.msg', { name: nameOf((crop(tl.crop) || {}).name), left: left(new Date(tl.ripe_at).getTime() - now()) }));
      else harvestTile(tl);
      return;
    }
    if (tl.item) { sheetItem(tl); openSide(); return; }
    sheetPlant(x, y); openSide();
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
  // 한 칸의 남은 열매를 모두 거둔다(서버는 하나씩 확인)
  function harvestTile(tl) {
    var ns = remaining(tl); if (!ns.length || F.busy) { if (!ns.length) HUD.toast(t('farm.why.growing')); return; }
    F.busy = true;
    var total = 0, cnt = 0, last = null, x = tl.x, y = tl.y, isCrop = !!tl.crop;
    (function next(i) {
      if (i >= ns.length) {
        F.busy = false; if (last) setFarm(last);
        if (cnt) { used(); HUD.toast(t('farm.harvested', { n: cnt, p: tal(total) })); if (F.view) F.view.flash({ x: x, y: y }, '+' + tal(total) + ' ' + HUD.talentLabel()); }
        return;
      }
      (isCrop ? SDK.farmPick(x, y, ns[i]) : SDK.farmHarvest(x, y, ns[i])).then(function (r) {
        if (!r || !r.ok) { F.busy = false; if (last) setFarm(last); HUD.toast(why(r)); if (r && (r.why === 'growing' || r.why === 'not_ready')) load(); return; }
        if (r.picked) { total += +r.gain || 0; cnt++; }
        last = r.farm || last; next(i + 1);
      }, function () { F.busy = false; if (last) setFarm(last); HUD.toast(t('farm.err')); });
    })(0);
  }
  // 믿음 나무 열매(하루 몇 개)를 모두 딴다
  function pickTree() {
    var st = HUD.state ? HUD.state() : null, fr = st && st.fruit, ns = [];
    if (fr && fr.per_day) for (var n = 1; n <= fr.per_day; n++) if ((fr.picked || []).indexOf(n) < 0) ns.push(n);
    if (!ns.length) { HUD.toast(t('farm.tree.msg')); return; }
    if (F.busy) return;
    F.busy = true;
    var total = 0, cnt = 0;
    (function next(i) {
      if (i >= ns.length) {
        F.busy = false;
        if (HUD.fruitRefresh) HUD.fruitRefresh();
        if (F.view) F.view.setTreeBubble(null);
        if (cnt) { used(); HUD.toast(t('farm.tree.picked', { n: cnt, p: tal(total) })); if (F.view) F.view.flash({ x: 0, y: 0 }, '+' + tal(total) + ' ' + HUD.talentLabel()); }
        return;
      }
      SDK.pickFruit(ns[i]).then(function (r) {
        if (!r || !r.ok) { F.busy = false; HUD.toast(t('fruit.err')); return; }
        if (r.picked) { total += +r.gain || 0; cnt++; }
        if (st) st.fruit = r.fruit || st.fruit;
        if (r.talent_balance != null) { HUD.setTalent(r.talent_balance); if (F.farm) { F.farm.balance = r.talent_balance; renderPanel(); } }
        next(i + 1);
      }, function () { F.busy = false; HUD.toast(t('fruit.err')); });
    })(0);
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

  /* ── 메뉴 ── */
  function onTools(e) {
    var b = e.target.closest('[data-tool]'); if (!b || b.disabled) return;
    var k = b.getAttribute('data-tool');
    if (k === 'buy' || k === 'convert') { F.mode = F.mode === k ? 'normal' : k; F.pick = {}; closeSheet(); render(); return; }
    if (k === 'water') { water(b); return; }
    if (k === 'shop' && SHOP) { SHOP.open(null, afterShop); return; }
    if (k === 'prices') { sheetPrices(); return; }
  }
  function water(b) {
    if (b) b.disabled = true;
    SDK.water().then(function (r) {
      if (!r || !r.ok) { if (b) b.disabled = false; HUD.toast(t('water.err')); return; }
      HUD.afterWater(r); used();
      F.farm.watered = true;
      if (r.day && (F.farm.water_days || []).indexOf(r.day) < 0) (F.farm.water_days = F.farm.water_days || []).push(r.day);
      if (r.talent_balance != null) F.farm.balance = r.talent_balance;
      render();
    }).catch(function () { if (b) b.disabled = false; HUD.toast(t('water.err')); });
  }

  /* ── 그때그때 판(오른쪽 칸 아래) ── */
  function closeSheet() { var s = ui('gfSheet'); if (s) s.innerHTML = '<p class="gf-s-m gf3-hint">' + esc(t('farm.hint3d')) + '</p>'; F.sel = null; }
  function sheet(html) { var s = ui('gfSheet'); if (s) s.innerHTML = html; }
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
    var clear = v && (v.stage === 'dead' || v.stage === 'done'), ripe = remaining(tl).length > 0;
    sheet('<p class="gf-s-t">' + esc(nameOf(it.name)) + '</p><ul class="gf-s-list">' + lines.filter(Boolean).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
      acts((F.farm.watered ? '' : '<button type="button" class="g-btn g-btn-line" data-act="water">' + esc(t('water.go')) + '</button>') +
        (ripe ? '<button type="button" class="g-btn g-btn-primary" data-act="harvest">' + esc(t('farm.harvest.go')) + '</button>' : '') +
        (clear ? '<button type="button" class="g-btn g-btn-primary" data-act="clear">' + esc(t('farm.clear')) + '</button>' : '')));
  }
  function sheetPrices() {
    var P = prices();
    F.sel = { kind: 'prices' };
    sheet('<p class="gf-s-t">' + esc(t('farm.prices.t')) + '</p><div class="gf-prices">' +
      '<label>' + esc(t('farm.prices.jeon')) + '<input type="number" id="gfPJ" min="0" step="0.1" value="' + esc(P.jeon) + '"></label>' +
      '<label>' + esc(t('farm.prices.dae')) + '<input type="number" id="gfPD" min="0" step="0.1" value="' + esc(P.dae) + '"></label></div>' +
      acts('<button type="button" class="g-btn g-btn-primary" data-act="prices">' + esc(t('farm.prices.save')) + '</button>'));
    openSide();
  }
  function onSheet(e) {
    var b = e.target.closest('button'); if (!b || b.disabled || F.busy || !F.sel) return;
    var act = b.getAttribute('data-act'), cr = b.getAttribute('data-crop'), itm = b.getAttribute('data-item'), sel = F.sel;
    if (act === 'cancel') { if (F.mode !== 'normal') { F.mode = 'normal'; F.pick = {}; render(); } closeSheet(); return; }
    if (act === 'shop') { if (SHOP) SHOP.open(null, afterShop); return; }
    if (act === 'water') { water(null); closeSheet(); return; }
    if (act === 'harvest') { var ht = tile(sel.x, sel.y); closeSheet(); if (ht) harvestTile(ht); return; }
    var p = null, cells = Object.keys(F.pick).map(function (k) { var a = k.split(','); return { x: +a[0], y: +a[1] }; });
    if (act === 'buy') p = SDK.farmBuy(sel.x, sel.y);
    else if (act === 'buymany') p = SDK.farmBuyMany(cells);
    else if (act === 'convert') p = SDK.farmConvert(cells);
    else if (act === 'clear') p = SDK.farmClear(sel.x, sel.y);
    else if (act === 'prices') {
      var j = Math.round(+ui('gfPJ').value * 10) / 10, d = Math.round(+ui('gfPD').value * 10) / 10;
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
      HUD.toast(msg); used();
    }).catch(function () { HUD.toast(t('farm.err')); b.disabled = false; })
      .then(function () { F.busy = false; });
  }

  function init(o) {
    I = o.i18n; SDK = o.sdk; HUD = o.hud; SHOP = o.shop || window.GardenShop || null; PLANT = o.plant || window.GardenPlant || null; t = I.t;
    setInterval(pushScene, 60 * 1000);   // 입체 창을 열지 않아도 작물이 자라는 모습을 1분마다 메인 장면에
  }
  return { init: init, open: open, attach3d: attach3d, bindView: bindView, reload: load, ready: ready, pushScene: pushScene, sceneList: sceneList, summary: summary, state: function () { return F.farm; } };
})();
