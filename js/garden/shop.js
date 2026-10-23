/* ============================================================
   신앙 정원 — 스토어(꽃집) (2026-10-23 담임목사 지시)
   · 먹거리 씨앗(5) · 과일나무 묘목(50) · 꽃(20). 품목마다 우정읍 기후에 맞는지와 사실 자료(심는 때·물 주기·열매까지 걸리는 때·약점·출처)
   · 사면 달란트에서 빠지고 내 가방에 들어간다 → 내 땅 '전'에 심는다
   · 우정읍 기후에 안 맞는 품목(fit=no)은 이유만 보여 주고 팔지 않는다
   · 관리자는 값을 바로 고친다(garden_admin_set_item_price)
   · 다른 가게(꾸미기·옷·건재상·가구가전·차고)는 '준비 중' — docs/we-church-로드맵-상점.md
   GardenShop.init({ i18n, sdk, hud }) · GardenShop.open(tab, 닫힌 뒤 할 일)
   ============================================================ */
window.GardenShop = (function () {
  'use strict';
  var I, SDK, HUD, t;
  var S = { data: null, tab: 'food', rec: null, busy: false, qty: {} };
  var ART = 'images/garden/shop/';
  var TABS = [['food', 'shop.tab.food'], ['tree', 'shop.tab.tree'], ['flower', 'shop.tab.flower']];
  var SOON = ['shop.soon.deco', 'shop.soon.wear', 'shop.soon.build', 'shop.soon.home', 'shop.soon.car'];
  var SPEC_ORDER = [['plant', 'shop.spec.plant'], ['first', 'shop.spec.first'], ['harvest', 'shop.spec.harvest'], ['bloom', 'shop.spec.bloom'],
    ['water', 'shop.spec.water'], ['sun', 'shop.spec.sun'], ['cold', 'shop.spec.cold'], ['drought', 'shop.spec.drought'], ['rain', 'shop.spec.rain'],
    ['pollen', 'shop.spec.pollen'], ['height', 'shop.spec.height'], ['note', 'shop.spec.note']];
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nameOf(v) { if (v && typeof v === 'object') { var l = String(I.locale() || 'ko'); return v[l] || v[l.split('-')[0]] || v.ko || v.en || ''; } return v || ''; }
  function tal(n) { return I.fmtNum(Math.round((+n || 0) * 10) / 10); }
  function invOf(slug) { var inv = (S.data && S.data.inventory) || []; for (var i = 0; i < inv.length; i++) if (inv[i].item === slug) return inv[i].qty; return 0; }

  function open(tab, done) {
    if (S.rec) return;
    if (tab) S.tab = tab;
    S.rec = HUD.openModal('gmShop', { onClose: function () { S.rec = null; if (done) done(); } });
    $('gsList').innerHTML = '<p class="g-empty">' + esc(t('shop.loading')) + '</p>';
    renderTabs();
    load();
  }
  function load() {
    return SDK.shop().then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.why) || 'shop');
      S.data = r; HUD.setTalent(r.balance); render();
    }).catch(function (e) { $('gsList').innerHTML = '<p class="g-empty">' + esc(SDK.notReady(e) ? t('shop.notready') : t('shop.err')) + '</p>'; });
  }
  function renderTabs() {
    $('gsTabs').innerHTML = TABS.map(function (tb) {
      return '<button type="button" class="gs-tab' + (S.tab === tb[0] ? ' is-on' : '') + '" role="tab" aria-selected="' + (S.tab === tb[0]) + '" data-tab="' + tb[0] + '">' + esc(t(tb[1])) + '</button>';
    }).join('') + SOON.map(function (k) { return '<span class="gs-tab gs-soon" aria-disabled="true">' + esc(t(k)) + '<small>' + esc(t('shop.soon')) + '</small></span>'; }).join('');
  }
  function render() {
    var d = S.data; if (!d) return;
    $('gsBal').textContent = tal(d.balance);
    var bag = (d.inventory || []).map(function (i) { var it = find(i.item); return it ? esc(nameOf(it.name)) + ' ' + i.qty : ''; }).filter(Boolean);
    $('gsBag').textContent = bag.length ? t('shop.bag', { list: bag.join(' · ') }) : t('shop.bag.empty');
    var items = (d.items || []).filter(function (it) { return it.category === S.tab; });
    var sell = items.filter(function (it) { return it.fit !== 'no'; }), no = items.filter(function (it) { return it.fit === 'no'; });
    var html = '<p class="gs-lead">' + esc(t('shop.lead.' + S.tab)) + '</p>' + sell.map(card).join('');
    if (no.length) html += '<h3 class="gs-sub">' + esc(t('shop.nofit.t')) + '</h3><p class="gs-lead">' + esc(t('shop.nofit.m')) + '</p>' + no.map(card).join('');
    $('gsList').innerHTML = html || '<p class="g-empty">' + esc(t('shop.empty')) + '</p>';
  }
  function find(slug) { var a = (S.data && S.data.items) || []; for (var i = 0; i < a.length; i++) if (a[i].slug === slug) return a[i]; return null; }
  // 심는 달(model.plant_months)이면 '지금이 심는 때', 아니면 언제 심는지
  function season(it) {
    var pm = it.model && it.model.plant_months; if (!pm || !pm.length) return '';
    var on = pm.indexOf(new Date().getMonth() + 1) >= 0, sp = it.specs || {};
    return '<small class="gs-when' + (on ? ' is-now' : '') + '">' + esc(on ? t('shop.when.now') : t('shop.when.off', { when: sp.plant || '' })) + '</small>';
  }
  function card(it) {
    var sp = it.specs || {}, q = S.qty[it.slug] || 1, no = it.fit === 'no', have = invOf(it.slug), afford = +S.data.balance >= +it.price * q;
    var fit = '<span class="gs-fit gs-fit-' + it.fit + '">' + esc(t('shop.fit.' + it.fit)) + '</span>';
    var rows = SPEC_ORDER.filter(function (k) { return sp[k[0]]; }).map(function (k) { return '<div><dt>' + esc(t(k[1])) + '</dt><dd>' + esc(sp[k[0]]) + '</dd></div>'; }).join('');
    var head = '<div class="gs-card-h"><img alt="" loading="lazy" src="' + ART + esc(it.slug) + '.webp" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="gs-card-t"><b>' + esc(nameOf(it.name)) + '</b>' + fit + (sp.fitwhy ? '<small>' + esc(sp.fitwhy) + '</small>' : '') + (no ? '' : season(it)) + '</div>' +
      '<div class="gs-price">' + (S.data.admin ? '<label class="gs-admin"><span class="g-sr">' + esc(t('shop.admin.price')) + '</span><input type="number" min="0" step="0.1" value="' + esc(it.price) + '" data-price="' + esc(it.slug) + '"></label>' : '<b>' + esc(tal(it.price)) + '</b>') +
      '<span>' + esc(HUD.talentLabel()) + '</span></div></div>';
    var buy = no ? '' : '<div class="gs-buy"><span class="gs-have">' + esc(have ? t('shop.have', { n: have }) : '') + '</span>' +
      '<div class="gs-qty" role="group" aria-label="' + esc(t('shop.qty')) + '"><button type="button" data-q="-1" data-slug="' + esc(it.slug) + '" aria-label="' + esc(t('shop.qty.less')) + '">−</button><b>' + q + '</b><button type="button" data-q="1" data-slug="' + esc(it.slug) + '" aria-label="' + esc(t('shop.qty.more')) + '">+</button></div>' +
      '<button type="button" class="g-btn g-btn-primary gs-go" data-buy="' + esc(it.slug) + '"' + (afford ? '' : ' disabled') + '>' + esc(afford ? t('shop.buy', { p: tal(it.price * q) }) : t('shop.short')) + '</button></div>';
    return '<article class="gs-card' + (no ? ' is-no' : '') + '">' + head + (rows ? '<details class="gs-spec"><summary>' + esc(t('shop.spec')) + '</summary><dl>' + rows + '</dl>' + (sp.src ? '<p class="gs-src">' + esc(t('shop.src')) + ' ' + esc(sp.src) + '</p>' : '') + '</details>' : '') + buy + '</article>';
  }

  function onClick(e) {
    var tb = e.target.closest('.gs-tab[data-tab]');
    if (tb) { S.tab = tb.getAttribute('data-tab'); renderTabs(); render(); $('gsList').scrollTop = 0; return; }
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
  function onPrice(e) {
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
  return { init: init, open: open, items: function () { return (S.data && S.data.items) || null; }, load: load, find: find };
})();
