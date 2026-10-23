/* ============================================================
   신앙 정원 — 스토어(꽃집) (2026-10-23 담임목사 지시)
   · 먹거리 씨앗(5) · 과일나무 묘목(50) · 꽃(20). 품목마다 우정읍 기후에 맞는지와 사실 자료(심는 때·물 주기·열매까지 걸리는 때·약점·출처)
   · 사면 달란트에서 빠지고 내 가방에 들어간다 → 내 땅 '전'에 심는다
   · 우정읍 기후에 안 맞는 품목(fit=no)은 이유만 보여 주고 팔지 않는다
   · 관리자는 값을 바로 고친다(garden_admin_set_item_price)
   · 건축용 나무(2026-10-23 담임목사): 묘목을 사서 길러 베면 목재. 다 자란 나무를 성도들이 스토어에 팔면 재고가 쌓이고,
     재고가 보이며 남은 수량까지만 산다(심은 값의 2배, 산 나무는 바로 목재로 보관함에) — 겨울에도 건축을 준비하게
   · 하우스(2026-10-23 담임목사): '하우스' 칸에서 유리 온실을 짓고(빈 전 칸에 한 동, 입체 정원에서 칸을 고른다) 하우스 작물(model.house)을 산다.
     하우스 작물은 하우스 칸에만 심는다. garden_house 가 없으면(SQL 전) 이 칸은 보이지 않는다
   · 다른 가게(꾸미기·옷·건재상·가구가전·차고)는 '준비 중' — docs/we-church-로드맵-상점.md
   GardenShop.init({ i18n, sdk, hud }) · GardenShop.open(tab, 닫힌 뒤 할 일)
   ============================================================ */
window.GardenShop = (function () {
  'use strict';
  var I, SDK, HUD, t;
  var S = { data: null, tab: 'food', rec: null, busy: false, qty: {}, sq: {}, house: null, done: null };
  var ART = 'images/garden/shop/';
  var TABS = [['food', 'shop.tab.food'], ['tree', 'shop.tab.tree'], ['timber', 'shop.tab.timber'], ['flower', 'shop.tab.flower'], ['house', 'shop.tab.house']];
  var SOON = ['shop.soon.deco', 'shop.soon.wear', 'shop.soon.build', 'shop.soon.home', 'shop.soon.car'];
  var SPEC_ORDER = [['plant', 'shop.spec.plant'], ['first', 'shop.spec.first'], ['harvest', 'shop.spec.harvest'], ['bloom', 'shop.spec.bloom'],
    ['water', 'shop.spec.water'], ['sun', 'shop.spec.sun'], ['cold', 'shop.spec.cold'], ['drought', 'shop.spec.drought'], ['rain', 'shop.spec.rain'],
    ['pollen', 'shop.spec.pollen'], ['height', 'shop.spec.height'], ['note', 'shop.spec.note']];
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nameOf(v) { if (v && typeof v === 'object') { var l = String(I.locale() || 'ko'); return v[l] || v[l.split('-')[0]] || v.ko || v.en || ''; } return v || ''; }
  function tal(n) { return I.fmtNum(Math.round((+n || 0) * 10) / 10); }
  function isTimber(it) { return !!(it && it.model && it.model.harvest === 'timber'); }
  function isHouse(it) { return !!(it && it.model && it.model.house); }
  function tabOf(it) { return isHouse(it) ? 'house' : isTimber(it) ? 'timber' : it.category; }
  function stockOf(slug) { var st = (S.data && S.data.stock) || {}; return +st[slug] || 0; }
  function invOf(slug) { var inv = (S.data && S.data.inventory) || []; for (var i = 0; i < inv.length; i++) if (inv[i].item === slug) return inv[i].qty; return 0; }

  function open(tab, done) {
    if (S.rec) return;
    if (tab) S.tab = tab;
    S.done = done || null;
    S.rec = HUD.openModal('gmShop', { onClose: function () { S.rec = null; var d = S.done; S.done = null; if (d) d(); } });
    $('gsList').innerHTML = '<p class="g-empty">' + esc(t('shop.loading')) + '</p>';
    renderTabs();
    load();
  }
  function load() {
    // 하우스 목록·값은 스토어 창이 열려 있을 때만 함께 받는다(내 땅이 품목만 새로 받을 때는 건너뜀). 없으면(SQL 전) 하우스 칸을 숨긴다
    var hp = S.rec && SDK.house ? SDK.house().then(function (h) { return h && h.ok ? h : null; }, function () { return null; }) : Promise.resolve(S.house);
    return Promise.all([SDK.shop(), hp]).then(function (rs) {
      var r = rs[0];
      if (!r || !r.ok) throw new Error((r && r.why) || 'shop');
      S.data = r; S.house = rs[1]; HUD.setTalent(r.balance);
      if (S.tab === 'house' && !S.house) S.tab = 'food';
      if (S.rec) renderTabs();
      render();
    }).catch(function (e) { $('gsList').innerHTML = '<p class="g-empty">' + esc(SDK.notReady(e) ? t('shop.notready') : t('shop.err')) + '</p>'; });
  }
  function renderTabs() {
    $('gsTabs').innerHTML = TABS.filter(function (tb) { return tb[0] !== 'house' || S.house; }).map(function (tb) {
      return '<button type="button" class="gs-tab' + (S.tab === tb[0] ? ' is-on' : '') + '" role="tab" aria-selected="' + (S.tab === tb[0]) + '" data-tab="' + tb[0] + '">' + esc(t(tb[1])) + '</button>';
    }).join('') + SOON.map(function (k) { return '<span class="gs-tab gs-soon" aria-disabled="true">' + esc(t(k)) + '<small>' + esc(t('shop.soon')) + '</small></span>'; }).join('');
  }
  function render() {
    var d = S.data; if (!d) return;
    $('gsBal').textContent = tal(d.balance);
    var bag = (d.inventory || []).map(function (i) { var it = find(i.item); return it ? esc(nameOf(it.name)) + ' ' + i.qty : ''; }).filter(Boolean);
    $('gsBag').textContent = bag.length ? t('shop.bag', { list: bag.join(' · ') }) : t('shop.bag.empty');
    var items = (d.items || []).filter(function (it) { return tabOf(it) === S.tab; });
    var sell = items.filter(function (it) { return it.fit !== 'no'; }), no = items.filter(function (it) { return it.fit === 'no'; });
    var html = '<p class="gs-lead">' + esc(t('shop.lead.' + S.tab)) + '</p>' +
      (S.tab === 'timber' && d.stock ? '<p class="gs-lead gs-stock-lead">' + esc(t('shop.timber.wood', { n: I.fmtNum(d.wood || 0) })) + '</p>' : '') +
      (S.tab === 'house' && S.house ? houseCard() + '<h3 class="gs-sub">' + esc(t('shop.house.crops')) + '</h3>' : '') + sell.map(card).join('');
    if (no.length) html += '<h3 class="gs-sub">' + esc(t('shop.nofit.t')) + '</h3><p class="gs-lead">' + esc(t('shop.nofit.m')) + '</p>' + no.map(card).join('');
    $('gsList').innerHTML = html || '<p class="g-empty">' + esc(t('shop.empty')) + '</p>';
  }
  function find(slug) { var a = (S.data && S.data.items) || []; for (var i = 0; i < a.length; i++) if (a[i].slug === slug) return a[i]; return null; }
  // 심는 달(model.plant_months)이면 '지금이 심는 때', 아니면 언제 심는지
  function season(it) {
    if (isHouse(it)) return '<small class="gs-when is-now">' + esc(t('shop.when.house')) + '</small>';
    var pm = it.model && it.model.plant_months; if (!pm || !pm.length) return '';
    var on = pm.indexOf(new Date().getMonth() + 1) >= 0, sp = it.specs || {};
    // 하우스가 있으면 채소·꽃은 철이 아니어도 하우스 칸에 심는다(일반 나무·건축용 나무는 빼고)
    var inHouse = !on && it.category !== 'tree' && S.house && (S.house.houses || []).length > 0;
    return '<small class="gs-when' + (on ? ' is-now' : '') + '">' + esc(on ? t('shop.when.now') : t('shop.when.off', { when: sp.plant || '' }) + (inHouse ? ' · ' + t('shop.when.inHouse') : '')) + '</small>';
  }
  // 유리 온실 카드 — 값·지은 수·이점, '지을 칸 고르기'를 누르면 입체 정원에서 빈 전 칸을 고른다
  function houseCard() {
    var h = S.house, p = +h.price || 0, n = (h.houses || []).length, can = +S.data.balance >= p;
    var rows = ['shop.house.r1', 'shop.house.r2', 'shop.house.r3', 'shop.house.r4', 'shop.house.r5'].map(function (k) { return '<li>' + esc(t(k)) + '</li>'; }).join('');
    return '<article class="gs-card gs-house">' +
      '<div class="gs-card-h"><img alt="" loading="lazy" src="' + ART + 'greenhouse.webp" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="gs-card-t"><b>' + esc(t('shop.house.name')) + '</b><small>' + esc(t('shop.house.size')) + '</small>' +
      (n ? '<small class="gs-when is-now">' + esc(t('shop.house.have', { n: I.fmtNum(n) })) + '</small>' : '') + '</div>' +
      '<div class="gs-price">' + (S.data.admin ? '<label class="gs-admin"><span class="g-sr">' + esc(t('shop.admin.price')) + '</span><input type="number" min="0" step="0.1" value="' + esc(p) + '" data-hprice="1"></label>' : '<b>' + esc(tal(p)) + '</b>') +
      '<span>' + esc(HUD.talentLabel()) + '</span></div></div>' +
      '<ul class="gs-house-list">' + rows + '</ul>' +
      '<div class="gs-buy"><span class="gs-have"></span><button type="button" class="g-btn g-btn-primary gs-go" data-house-go="1"' + (can ? '' : ' disabled') + '>' +
      esc(can ? t('shop.house.go') : t('shop.short')) + '</button></div></article>';
  }
  // 첫 수확·첫 꽃·벨 때까지 드는 마음(XP): 자란 날 × 하루치(10) — 가격표 뒤 나무는 first_days(마음 날)
  function xpNeed(it) {
    var m = it.model || {}, xd = +(S.data && S.data.xp_day) || 10, d = 0;
    if (it.category === 'tree') d = m.first_days || Math.ceil((m.years_to_fruit || 0) * 365.25);
    else if (it.category === 'flower') d = m.first_bloom_days || 0;
    else d = m.first_days || 0;
    return d ? { d: d, xp: d * xd, xd: xd } : null;
  }
  function card(it) {
    var sp = it.specs || {}, q = S.qty[it.slug] || 1, no = it.fit === 'no', have = invOf(it.slug), afford = +S.data.balance >= +it.price * q;
    var fit = '<span class="gs-fit gs-fit-' + it.fit + '">' + esc(t('shop.fit.' + it.fit)) + '</span>';
    var rows = SPEC_ORDER.filter(function (k) { return sp[k[0]]; }).map(function (k) { return '<div><dt>' + esc(t(k[1])) + '</dt><dd>' + esc(sp[k[0]]) + '</dd></div>'; }).join('');
    var xn = no ? null : xpNeed(it);
    if (xn) rows += '<div><dt>' + esc(t('shop.spec.xp')) + '</dt><dd>' + esc(t('shop.xp.' + (isHouse(it) ? it.category : tabOf(it)), { xp: I.fmtNum(xn.xp), d: I.fmtNum(xn.d), n: xn.xd })) + '</dd></div>';
    var yl = no ? '' : yieldLine(it);
    var head = '<div class="gs-card-h"><img alt="" loading="lazy" src="' + ART + esc(it.slug) + '.webp" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="gs-card-t"><b>' + esc(nameOf(it.name)) + '</b>' + fit + (sp.fitwhy ? '<small>' + esc(sp.fitwhy) + '</small>' : '') + (no ? '' : season(it)) + '</div>' +
      '<div class="gs-price">' + (S.data.admin ? '<label class="gs-admin"><span class="g-sr">' + esc(t('shop.admin.price')) + '</span><input type="number" min="0" step="0.1" value="' + esc(it.price) + '" data-price="' + esc(it.slug) + '"></label>' : '<b>' + esc(tal(it.price)) + '</b>') +
      '<span>' + esc(HUD.talentLabel()) + '</span></div></div>';
    var buy = no ? '' : '<div class="gs-buy"><span class="gs-have">' + esc(have ? t('shop.have', { n: have }) : '') + '</span>' +
      '<div class="gs-qty" role="group" aria-label="' + esc(t('shop.qty')) + '"><button type="button" data-q="-1" data-slug="' + esc(it.slug) + '" aria-label="' + esc(t('shop.qty.less')) + '">−</button><b>' + q + '</b><button type="button" data-q="1" data-slug="' + esc(it.slug) + '" aria-label="' + esc(t('shop.qty.more')) + '">+</button></div>' +
      '<button type="button" class="g-btn g-btn-primary gs-go" data-buy="' + esc(it.slug) + '"' + (afford ? '' : ' disabled') + '>' + esc(afford ? t('shop.buy', { p: tal(it.price * q) }) : t('shop.short')) + '</button></div>';
    return '<article class="gs-card' + (no ? ' is-no' : '') + '">' + head + (yl ? '<p class="gs-yield">' + esc(yl) + '</p>' : '') +
      (rows ? '<details class="gs-spec"><summary>' + esc(t('shop.spec')) + '</summary><dl>' + rows + '</dl></details>' : '') + buy + (isTimber(it) && !no ? grown(it) : '') + '</article>';
  }
  // 거두면 받는 것 — 가격표(다 거두면 산 값의 2배)를 품목마다 한 줄로
  function yieldLine(it) {
    var m = it.model || {}, p = +it.price || 0;
    if (m.harvest === 'once') return t(it.category === 'flower' ? 'shop.yield.bouquet' : 'shop.yield.once', { p: tal(p * (m.yield_x || 2)) });
    if (m.harvest === 'yearly') return t('shop.yield.year', { p: tal(p * (m.yield_x || 1)) });
    if (m.harvest === 'season') return t('shop.yield.season', { p: tal(p * (m.yield_x || 1)) });
    if (m.harvest === 'timber') return t('shop.yield.timber', { w: I.fmtNum(Math.round(p * (m.yield_x || 2))), p: tal(p * (m.sell_x || 2)) });
    return '';
  }
  // 다 자란 나무 — 성도들이 스토어에 판 재고. 남은 수량까지만 산다(값 = 심은 값의 2배, 산 나무는 바로 목재로)
  function grown(it) {
    var m = it.model || {}, left = stockOf(it.slug), each = Math.round(+it.price * (m.sell_x || 2) * 10) / 10, wood = Math.round(+it.price * (m.yield_x || 2));
    var q = Math.max(1, Math.min(S.sq[it.slug] || 1, Math.max(left, 1))), can = left > 0 && +S.data.balance >= each * q;
    var adm = S.data.admin ? '<label class="gs-admin gs-admin-stock"><span>' + esc(t('shop.admin.stock')) + '</span><input type="number" min="0" step="1" value="' + left + '" data-stock="' + esc(it.slug) + '"></label>' : '';
    return '<div class="gs-grown"><p class="gs-grown-t"><b>' + esc(t('shop.grown.t')) + '</b><span class="gs-left' + (left ? '' : ' is-none') + '">' + esc(left ? t('shop.grown.left', { n: I.fmtNum(left) }) : t('shop.grown.none')) + '</span></p>' +
      '<p class="gs-grown-m">' + esc(t('shop.grown.m', { p: tal(each), w: I.fmtNum(wood) })) + '</p>' +
      '<div class="gs-buy">' + adm + '<span class="gs-have"></span>' +
      (left ? '<div class="gs-qty" role="group" aria-label="' + esc(t('shop.qty')) + '"><button type="button" data-sq="-1" data-slug="' + esc(it.slug) + '" aria-label="' + esc(t('shop.qty.less')) + '">−</button><b>' + q + '</b><button type="button" data-sq="1" data-slug="' + esc(it.slug) + '" aria-label="' + esc(t('shop.qty.more')) + '">+</button></div>' : '') +
      '<button type="button" class="g-btn g-btn-line gs-go" data-grown="' + esc(it.slug) + '"' + (can ? '' : ' disabled') + '>' +
      esc(!left ? t('shop.grown.empty') : can ? t('shop.grown.buy', { n: q, p: tal(each * q) }) : t('shop.short')) + '</button></div></div>';
  }

  function onClick(e) {
    var hg = e.target.closest('[data-house-go]');
    if (hg && !hg.disabled && S.rec) {
      S.done = null;   // 입체 정원으로 옮겨 가므로 닫힌 뒤 할 일은 하지 않는다(내 땅이 새로 받는다)
      HUD.closeThen(S.rec, function () { if (window.GardenFarm && window.GardenFarm.startHouse) window.GardenFarm.startHouse(); });
      return;
    }
    var tb = e.target.closest('.gs-tab[data-tab]');
    if (tb) { S.tab = tb.getAttribute('data-tab'); renderTabs(); render(); $('gsList').scrollTop = 0; return; }
    var sqb = e.target.closest('[data-sq]');
    if (sqb) { var s2 = sqb.getAttribute('data-slug'); S.sq[s2] = Math.max(1, Math.min(Math.min(20, stockOf(s2) || 1), (S.sq[s2] || 1) + (+sqb.getAttribute('data-sq')))); render(); return; }
    var gb = e.target.closest('[data-grown]');
    if (gb && !gb.disabled && !S.busy) { buyGrown(gb.getAttribute('data-grown'), gb); return; }
    var qb = e.target.closest('[data-q]');
    if (qb) { var sl = qb.getAttribute('data-slug'); S.qty[sl] = Math.max(1, Math.min(20, (S.qty[sl] || 1) + (+qb.getAttribute('data-q')))); render(); return; }
    var bb = e.target.closest('[data-buy]');
    if (bb && !bb.disabled && !S.busy) buy(bb.getAttribute('data-buy'), bb);
  }
  function buy(slug, btn) {
    var q = S.qty[slug] || 1, it = find(slug);
    S.busy = true; btn.disabled = true;
    SDK.shopBuy(slug, q).then(function (r) {
      if (!r || !r.ok) { HUD.toast(r && r.why === 'talent' ? t('shop.why.talent', { need: tal(r.need), have: tal(r.balance) }) : t('shop.err.buy')); btn.disabled = false; return; }
      S.data.balance = r.balance; S.data.inventory = r.inventory; S.qty[slug] = 1;
      HUD.setTalent(r.balance); render();
      HUD.toast(t('shop.bought', { name: nameOf(it.name), n: q, p: tal(r.spent) }));
    }).catch(function () { HUD.toast(t('shop.err.buy')); btn.disabled = false; }).then(function () { S.busy = false; });
  }
  function buyGrown(slug, btn) {
    var q = Math.max(1, Math.min(S.sq[slug] || 1, stockOf(slug))), it = find(slug);
    S.busy = true; btn.disabled = true;
    SDK.treeBuy(slug, q).then(function (r) {
      if (!r || !r.ok) {
        HUD.toast(r && r.why === 'talent' ? t('shop.why.talent', { need: tal(r.need), have: tal(r.balance) }) : r && r.why === 'stock' ? t('shop.why.stock', { n: r.left | 0 }) : t('shop.err.buy'));
        return load();
      }
      S.data.balance = r.balance; S.data.wood = r.wood_total; S.sq[slug] = 1;
      if (S.data.stock) S.data.stock[slug] = r.left;
      HUD.setTalent(r.balance); render();
      HUD.toast(t('shop.grown.bought', { name: nameOf(it && it.name), n: q, p: tal(r.spent), w: I.fmtNum(r.wood), total: I.fmtNum(r.wood_total) }), 4200);
    }).catch(function () { HUD.toast(t('shop.err.buy')); btn.disabled = false; }).then(function () { S.busy = false; });
  }
  function onStock(inp) {
    var slug = inp.getAttribute('data-stock'), v = Math.round(+inp.value);
    if (!(v >= 0)) { HUD.toast(t('shop.admin.bad')); return; }
    SDK.adminSetStock(slug, v).then(function (r) {
      if (!r || !r.ok) { HUD.toast(t('shop.admin.fail')); return; }
      (S.data.stock = S.data.stock || {})[slug] = r.qty; render();
      HUD.toast(t('shop.admin.stockSaved', { name: nameOf((find(slug) || {}).name), n: I.fmtNum(r.qty) }));
    }).catch(function () { HUD.toast(t('shop.admin.fail')); });
  }
  function onHousePrice(inp) {
    var v = Math.round(+inp.value * 10) / 10;
    if (!(v >= 0)) { HUD.toast(t('shop.admin.bad')); return; }
    SDK.adminSetHousePrice(v).then(function (r) {
      if (!r || !r.ok) { HUD.toast(t('shop.admin.fail')); return; }
      if (S.house) S.house.price = r.price; render();
      HUD.toast(t('shop.admin.saved', { name: t('shop.house.name'), p: tal(r.price) }));
    }).catch(function () { HUD.toast(t('shop.admin.fail')); });
  }
  function onPrice(e) {
    var stIn = e.target.closest('[data-stock]'); if (stIn) { onStock(stIn); return; }
    var hpIn = e.target.closest('[data-hprice]'); if (hpIn) { onHousePrice(hpIn); return; }
    var inp = e.target.closest('[data-price]'); if (!inp) return;
    var slug = inp.getAttribute('data-price'), v = Math.round(+inp.value * 10) / 10;
    if (!(v >= 0)) { HUD.toast(t('shop.admin.bad')); return; }
    SDK.adminSetItemPrice(slug, v).then(function (r) {
      if (!r || !r.ok) { HUD.toast(t('shop.admin.fail')); return; }
      var it = find(slug); if (it) it.price = r.price; render();
      HUD.toast(t('shop.admin.saved', { name: nameOf(it && it.name), p: tal(r.price) }));
    }).catch(function () { HUD.toast(t('shop.admin.fail')); });
  }

  function init(o) {
    I = o.i18n; SDK = o.sdk; HUD = o.hud; t = I.t;
    if (!$('gmShop')) return;
    $('gmShop').addEventListener('click', onClick);
    $('gmShop').addEventListener('change', onPrice);
  }
  return { init: init, open: open, items: function () { return (S.data && S.data.items) || null; }, load: load, find: find, isHouse: isHouse };
})();
