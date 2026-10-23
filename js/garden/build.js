/* ============================================================
   신앙 정원 — 건축: 건재상(모델하우스·집 짓기) · 교회 건축(성도들의 건축헌금) (2026-10-23 담임목사 지시)
   · "건축을 추가 해주세요. 로컬 ai로 3개의 집을 모델하우스로 만들어주세요. 교회도 3개를 만들어주세요.
      교회는 성도들의 헌금으로 지어집니다." · "교회 건축은 목사님이 시작 할 수 있습니다."
   · 건재상(스토어 탭): 모델하우스 세 채(그림 images/garden/build — 교회PC 로컬 AI)와 필요한 것(빈 대지·목재·품삯), 내 형편.
     '짓기'를 누르면 입체 정원에서 대지 칸을 골라 짓는다(farm.js 의 집 고르기). 지은 집은 입체 정원과 첫 화면 밭에 선다
   · 교회 건축(스토어 탭): 짓는 중인 교회의 목표·모인 헌금·드린 사람 수와 내가 드린 헌금(나만 본다), 건축헌금 드리기(달란트, 1부터).
     목사님(관리자)은 세 교회 가운데 골라 목표를 정해 시작하고, 목표를 고치거나 멈출 수 있다(멈추면 드린 헌금을 모두 돌려드림)
   · 교회는 첫 화면 언덕(scene.setChurch)과 입체 정원 뒤편(farm.attach3d → opts.church) — 모든 성도에게 같은 교회
   · 서버에 기능이 없으면(20261024_0200 실행 전) 탭과 교회 그림을 모두 숨긴다
   GardenBuild.init({ i18n, sdk, hud, shop, farm, scene }) · load() · ready() · plan(kind) · homes3d() · homeAt(x, y) · setHomes(r) · church3d()
   ============================================================ */
window.GardenBuild = (function () {
  'use strict';
  var I, SDK, HUD, SHOP, FARM, SCENE, t;
  var B = { ok: false, home: null, church: null, at: 0, p: null, busy: false, amt: 10, pick: null, stopAsk: false };
  var ART = 'images/garden/build/';
  var HOME_ART = { small: 'house-small', hanok: 'house-hanok', big: 'house-big' };
  var CHURCH_ART = { small: 'church-small', brick: 'church-brick', stone: 'church-stone' };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tal(n) { return I.fmtNum(Math.round((+n || 0) * 10) / 10); }
  function unit() { return HUD.talentLabel ? HUD.talentLabel() : t('talent.unit'); }
  function homeSrc(k) { return ART + (HOME_ART[k] || 'house-small') + '.webp'; }
  function churchSrc(k) { return ART + (CHURCH_ART[k] || 'church-small') + '.webp'; }
  function homeName(k) { return t('house.' + k); }
  function churchName(k) { return t('church.' + k); }
  function pct(c) { return c && +c.goal > 0 ? Math.max(0, Math.min(100, Math.floor(+c.raised / +c.goal * 100))) : 0; }
  function img(src, cls) { return '<img alt="" loading="lazy" class="' + (cls || '') + '" src="' + esc(src) + '" onerror="this.style.visibility=\'hidden\'">'; }

  /* ── 자료: 집(건재상)과 교회 건축을 함께 받는다 ── */
  function load() {
    if (B.p) return B.p;
    B.p = Promise.all([SDK.home(), SDK.church()]).then(function (rs) {
      if (!rs[0] || !rs[0].ok || !rs[1] || !rs[1].ok) throw new Error('build');
      B.home = rs[0]; B.church = rs[1]; B.ok = true; B.at = Date.now();
    }).catch(function () { B.ok = false; }).then(function () {
      B.p = null;
      showChurch();
      if (SHOP && SHOP.refreshTabs) SHOP.refreshTabs();
      if (window.GardenStorage && window.GardenStorage.refresh) window.GardenStorage.refresh();   // 건축 미션의 목표 집·빈 대지
      return B.ok;
    });
    return B.p;
  }
  function plans() { return (B.home && B.home.plans) || []; }
  function plan(k) { var a = plans(); for (var i = 0; i < a.length; i++) if (a[i].key === k) return a[i]; return null; }
  function homes() { return (B.home && B.home.homes) || []; }
  function homeAt(x, y) {
    var a = homes();
    for (var i = 0; i < a.length; i++) { var h = a[i]; if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h; }
    return null;
  }
  // 입체 정원·첫 화면에 그릴 집: { x, y, w, h, kind, src, name }
  function homes3d() { return B.ok ? homes().map(function (h) { return { x: h.x, y: h.y, w: h.w, h: h.h, kind: h.kind, src: homeSrc(h.kind), name: homeName(h.kind), built_at: h.built_at }; }) : []; }
  // 집을 지은 뒤(서버 답 r): 내 집·목재·잔액·빈 대지 수를 고친다
  function setHomes(r) {
    if (!B.home || !r) return;
    var p = plan(r.kind);
    B.home.homes = r.homes || B.home.homes;
    if (r.wood_total != null) B.home.wood = r.wood_total;
    if (r.balance != null) B.home.balance = r.balance;
    if (p) B.home.free_dae = Math.max(0, (+B.home.free_dae || 0) - p.dae);
  }

  /* ── 건재상: 모델하우스 세 채 ── */
  function renderBuild(box, api) {
    var h = B.home || {}, bal = api.balance(), wood = +h.wood || 0, free = +h.free_dae || 0, mine = homes();
    var html = '<p class="gs-lead">' + esc(t('build.shop.lead')) + '</p>';
    html += plans().map(function (p) {
      var okD = free >= p.dae, okW = wood >= +p.wood, okT = bal >= +p.wage, can = okD && okW && okT;
      var n = mine.filter(function (x) { return x.kind === p.key; }).length;
      var need = [[okD, t('build.need.dae', { n: p.dae, shape: t(p.dae >= 4 ? 'build.shape.4' : p.dae === 2 ? 'build.shape.2' : 'build.shape.1'), have: I.fmtNum(free) })],
        [okW, t('build.need.wood', { n: I.fmtNum(+p.wood), have: I.fmtNum(wood) })],
        [okT, t('build.need.wage', { n: tal(p.wage), have: tal(bal) })]];
      return '<article class="gs-card gb-model">' +
        '<div class="gb-model-img">' + img(homeSrc(p.key)) + '</div>' +
        '<div class="gb-model-body"><p class="gb-model-t"><b>' + esc(homeName(p.key)) + '</b>' +
        '<small>' + esc(t('build.cost', { dae: p.dae, wood: I.fmtNum(+p.wood), wage: tal(p.wage), u: unit() })) + '</small></p>' +
        '<ul class="gb-need">' + need.map(function (x) { return '<li class="' + (x[0] ? 'is-ok' : '') + '"><span class="gb-chk" aria-hidden="true">' + (x[0] ? '✓' : '') + '</span>' + esc(x[1]) + '</li>'; }).join('') + '</ul>' +
        '<div class="gs-buy"><span class="gs-have">' + esc(n ? t('build.have', { n: n }) : '') + '</span>' +
        '<button type="button" class="g-btn ' + (can ? 'g-btn-primary' : 'g-btn-line') + ' gs-go" data-home="' + esc(p.key) + '"' + (can ? '' : ' disabled') + '>' +
        esc(can ? t('build.go', { name: homeName(p.key) }) : t('build.notyet')) + '</button></div></div></article>';
    }).join('');
    html += '<p class="gs-lead gb-note">' + esc(t('build.shop.note')) + '</p>';
    box.innerHTML = html;
  }
  function clickBuild(e, api) {
    var b = e.target.closest('[data-home]'); if (!b) return false;
    if (b.disabled) return true;
    var k = b.getAttribute('data-home');
    api.close(function () { if (FARM && FARM.startHome) FARM.startHome(k); });
    return true;
  }

  /* ── 교회 건축 ── */
  function renderChurch(box, api) {
    if (Date.now() - B.at > 30000 && !B.p) load().then(function () { if (B.ok) api.render(); });   // 다른 성도의 헌금이 늘었을 수 있다
    var c = B.church || {}, cur = c.current, admin = !!c.admin, bal = api.balance(), L = unit(), html = '<p class="gs-lead">' + esc(t('church.lead')) + '</p>';
    if (cur) {
      var pc = pct(cur);
      html += '<article class="gs-card gb-church">' +
        '<div class="gb-church-imgs">' + img(ART + 'church-site.webp', 'gb-site') + img(churchSrc(cur.kind), 'gb-goal') + '</div>' +
        '<p class="gb-model-t"><b>' + esc(t('church.now', { name: churchName(cur.kind) })) + '</b><small>' + esc(t('church.since', { d: I.fmtDate(new Date(cur.started_at)) })) + '</small></p>' +
        '<span class="g-bar-track gb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pc + '"><span class="g-bar-fill" style="width:' + pc + '%"></span></span>' +
        '<p class="gb-sum">' + esc(t('church.sum', { r: tal(cur.raised), g: tal(cur.goal), u: L, p: pc, n: I.fmtNum(cur.donors) })) + '</p>' +
        '<p class="gb-mine">' + esc(+cur.mine ? t('church.mine', { p: tal(cur.mine), u: L }) : t('church.mine.none')) + '</p>' +
        '<div class="gb-offer"><label class="gb-amt"><span class="g-sr">' + esc(t('church.amt')) + '</span><input type="number" id="gbAmt" min="1" step="1" inputmode="numeric" value="' + esc(B.amt) + '"></label>' +
        '<span class="gb-u">' + esc(L) + '</span>' +
        '<button type="button" class="g-btn g-btn-primary" data-act="offer"' + (bal >= 1 ? '' : ' disabled') + '>' + esc(t('church.offer')) + '</button></div>' +
        '<p class="g-wl-note">' + esc(t('church.offer.note', { left: tal(+cur.goal - +cur.raised), u: L, have: tal(bal) })) + '</p>' +
        (admin ? adminNow(cur) : '') + '</article>';
    } else {
      html += '<p class="g-empty gb-none">' + esc(t(admin ? 'church.none.admin' : 'church.none')) + '</p>';
    }
    html += '<h3 class="gs-sub">' + esc(t('church.plans')) + '</h3><div class="gb-plans">' + (c.plans || []).map(function (p) { return planCard(p, c, admin && !cur); }).join('') + '</div>';
    if ((c.built || []).length) {
      html += '<h3 class="gs-sub">' + esc(t('church.built')) + '</h3><ul class="g-wl-list gb-built">' + c.built.map(function (b) {
        return '<li><span>' + esc(churchName(b.kind)) + ' <small>' + esc(t('church.built.d', { d: I.fmtDate(new Date(b.ended_at)), n: I.fmtNum(b.donors) })) + '</small></span>' +
          '<b>' + esc(tal(b.raised)) + '</b>' + (+b.mine ? '<small class="gb-mine-s">' + esc(t('church.mine.s', { p: tal(b.mine) })) + '</small>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    box.innerHTML = html;
  }
  // 세 교회(모두에게 보이는 모델) — 목사님은 짓는 중인 것이 없을 때 여기서 골라 시작한다
  function planCard(p, c, canStart) {
    var cur = c.current, n = (c.built || []).filter(function (b) { return b.kind === p.key; }).length;
    var st = cur && cur.kind === p.key ? t('church.st.now') : n ? t('church.st.built', { n: n }) : t('church.st.none');
    var open = canStart && B.pick === p.key;
    var act = !canStart ? '' : open
      ? '<div class="gb-start"><label>' + esc(t('church.goal')) + '<input type="number" id="gbGoal" min="1" step="100" inputmode="numeric" value="' + esc(+p.goal || 5000) + '"></label>' +
        '<div class="gf-s-acts"><button type="button" class="g-btn g-btn-line" data-act="cancel">' + esc(t('farm.cancel')) + '</button>' +
        '<button type="button" class="g-btn g-btn-primary" data-act="start">' + esc(t('church.start.go', { name: churchName(p.key) })) + '</button></div></div>'
      : '<button type="button" class="g-btn g-btn-line gb-pick" data-start="' + esc(p.key) + '">' + esc(t('church.start')) + '</button>';
    return '<article class="gs-card gb-plan' + (open ? ' is-open' : '') + '">' + img(churchSrc(p.key)) +
      '<p class="gb-model-t"><b>' + esc(churchName(p.key)) + '</b><small>' + esc(t('church.goal.d', { g: tal(p.goal), u: unit() })) + ' · ' + esc(st) + '</small></p>' + act + '</article>';
  }
  function adminNow(cur) {
    return '<div class="gb-admin"><p class="gf-s-t">' + esc(t('church.admin')) + '</p>' +
      '<div class="gb-offer"><label class="gb-amt"><span class="g-sr">' + esc(t('church.goal')) + '</span><input type="number" id="gbGoalNow" min="1" step="100" inputmode="numeric" value="' + esc(cur.goal) + '"></label>' +
      '<button type="button" class="g-btn g-btn-line" data-act="goal">' + esc(t('church.goal.save')) + '</button></div>' +
      (B.stopAsk
        ? '<p class="gf-s-m gf-warn">' + esc(t('church.stop.warn', { n: I.fmtNum(cur.donors), p: tal(cur.raised) })) + '</p><div class="gf-s-acts">' +
          '<button type="button" class="g-btn g-btn-line" data-act="cancel">' + esc(t('farm.cancel')) + '</button>' +
          '<button type="button" class="g-btn g-btn-danger" data-act="stop">' + esc(t('church.stop.sure')) + '</button></div>'
        : '<button type="button" class="g-btn g-btn-line gb-stop" data-act="stopask">' + esc(t('church.stop')) + '</button>') + '</div>';
  }
  function why(r) {
    var w = (r && r.why) || '';
    if (w === 'talent') return t('farm.why.talent', { need: tal(r.need), have: tal(r.balance) });
    if (w === 'closed') return t('church.why.closed');
    if (w === 'open') return t('church.why.open');
    if (w === 'range') return t('church.why.range');
    if (w === 'admin') return t('farm.why.admin');
    return t('church.err');
  }
  function clickChurch(e, api) {
    var b = e.target.closest('button'); if (!b) return false;
    if (b.disabled) return true;
    var act = b.getAttribute('data-act'), st = b.getAttribute('data-start');
    if (st) { B.pick = st; B.stopAsk = false; api.render(); return true; }
    if (act === 'cancel') { B.pick = null; B.stopAsk = false; api.render(); return true; }
    if (act === 'stopask') { B.stopAsk = true; api.render(); return true; }
    if (B.busy) return true;
    var p = null, c = B.church || {}, v, kind = B.pick;
    if (act === 'offer') {
      v = Math.floor(+$('gbAmt').value * 10) / 10;
      if (!(v >= 1)) { HUD.toast(t('church.why.range')); return true; }
      B.amt = v; p = SDK.churchOffer(c.current.id, v);
    } else if (act === 'start') {
      v = Math.round(+$('gbGoal').value * 10) / 10;
      if (!(v >= 1)) { HUD.toast(t('church.why.range')); return true; }
      p = SDK.adminChurchStart(kind, v);
    } else if (act === 'goal') {
      v = Math.round(+$('gbGoalNow').value * 10) / 10;
      if (!(v >= 1)) { HUD.toast(t('church.why.range')); return true; }
      p = SDK.adminChurchGoal(v);
    } else if (act === 'stop') p = SDK.adminChurchStop();
    if (!p) return false;
    var name = churchName(act === 'start' ? kind : c.current ? c.current.kind : '');
    B.busy = true; b.disabled = true;
    p.then(function (r) {
      if (!r || !r.ok) { HUD.toast(why(r)); b.disabled = false; return; }
      var cj = r.church || r;
      B.church = { ok: true, admin: c.admin, plans: cj.plans || c.plans, current: cj.current || null, built: cj.built || [] };
      B.at = Date.now();
      if (r.balance != null) { api.setBalance(r.balance); if (B.home) B.home.balance = r.balance; }
      B.pick = null; B.stopAsk = false;
      api.render(); showChurch();
      var msg = act === 'offer' ? (r.done ? t('church.done', { name: name }) : t(r.capped ? 'church.offered.cap' : 'church.offered', { p: tal(r.given), u: unit() }))
        : act === 'start' ? t('church.started', { name: name }) : act === 'goal' ? (r.done ? t('church.done', { name: name }) : t('church.goal.saved'))
        : t('church.stopped', { n: I.fmtNum(r.refunded), p: tal(r.total), u: unit() });
      HUD.toast(msg, r.done ? 5200 : null);
    }).catch(function () { HUD.toast(t('church.err')); b.disabled = false; }).then(function () { B.busy = false; });
    return true;
  }

  /* ── 교회 그림: 다 지은 교회 중 가장 최근 것 + 짓는 중이면 공사 터 ── */
  function church3d() {
    var c = B.church; if (!B.ok || !c) return null;
    var built = (c.built || [])[0], cur = c.current;
    if (!built && !cur) return null;
    return {
      src: built ? churchSrc(built.kind) : '', name: built ? churchName(built.kind) : '',
      site: cur ? { src: ART + 'church-site.webp', name: t('church.site', { name: churchName(cur.kind), p: pct(cur) }) } : null
    };
  }
  function showChurch() {
    if (!SCENE || !SCENE.setChurch) return;
    SCENE.setChurch(church3d(), { label: t('church.open'), onOpen: function () { if (SHOP) SHOP.open('church'); } });
  }

  function init(o) {
    I = o.i18n; SDK = o.sdk; HUD = o.hud; SHOP = o.shop || window.GardenShop || null; FARM = o.farm || window.GardenFarm || null; SCENE = o.scene || window.GardenScene || null; t = I.t;
    if (!SDK.home || !SHOP || !SHOP.addTab) return;
    SHOP.addTab({ key: 'build', label: 'shop.tab.build', soon: 'shop.soon.build', ready: function () { return B.ok; }, render: renderBuild, click: clickBuild });
    SHOP.addTab({ key: 'church', label: 'shop.tab.church', ready: function () { return B.ok; }, render: renderChurch, click: clickChurch });
  }
  return { init: init, load: load, ready: function () { return B.ok; }, plan: plan, homes3d: homes3d, homeAt: homeAt, setHomes: setHomes,
    church3d: church3d, info: function () { var h = B.home || {}; return { wood: +h.wood || 0, free: +h.free_dae || 0 }; } };
})();
