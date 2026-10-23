/* ============================================================
   신앙 정원 — 나의 보관함 · 건축 미션 (2026-10-23 담임목사)
   · "나의 보관함을 만들어주세요. 그곳에 내가 모은 건축 자재, 내가 경험한 여행, 배운 교육 등 앞으로 있을 상품들에 대한 리스트업"
     → 내 자산 · 다음 미션 · 건축 자재(목재와 내역) · 심지 않은 씨앗·묘목 · 배운 교육 · 다녀온 여행(준비 중) · 지은 집(준비 중)
   · "일정 수준의 자산 형성이 되고 나면 다음 미션으로 건축을 위한 준비를 안내"
     → 자산(서버 garden_assets: 달란트 + 땅 + 심은 것·가방 + 목재 + 집)이 기준(기본 500)을 넘거나 이미 시작하면
       오른쪽 메뉴에 '다음 미션' 칸. 가장 작은 집(대지 1칸 · 목재 200 · 품삯 50)부터 대지 → 나무 → 목재 → 품삯 → 집 짓기(건재상, 다음 단계)
   · 미션 자료는 내 땅 JSON(build)으로 받는다 — 화면은 받은 값을 그리기만
   GardenStorage.init({ i18n, sdk, hud, farm, shop }) · open(닫힌 뒤 할 일) · setFarm(farm) · mission()
   ============================================================ */
window.GardenStorage = (function () {
  'use strict';
  var I, SDK, HUD, FARM, SHOP, t;
  var S = { rec: null, data: null, build: null, prices: null, done: null };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nameOf(v) { if (v && typeof v === 'object') { var l = String(I.locale() || 'ko'); return v[l] || v[l.split('-')[0]] || v.ko || v.en || ''; } return v || ''; }
  function tal(n) { return I.fmtNum(Math.round((+n || 0) * 10) / 10); }
  function unit() { return HUD.talentLabel ? HUD.talentLabel() : t('talent.unit'); }

  /* ── 건축 미션: 단계와 다음 할 일 ── */
  function mission(b) {
    b = b || S.build; if (!b) return null;
    var h = (b.houses && b.houses[0]) || { key: 'small', dae: 1, wood: 200, wage: 50 };
    var wood = +b.wood || 0, coming = +b.coming || 0, st = b.stock || {}, left = 0;
    Object.keys(st).forEach(function (k) { left += +st[k] || 0; });
    var list = [
      { key: 'dae', done: (+b.dae || 0) >= h.dae, text: t('build.s.dae', { n: h.dae }), sub: t('build.s.dae.sub', { have: I.fmtNum(+b.dae || 0) }), go: 'farm' },
      { key: 'trees', done: wood + coming >= h.wood, text: t('build.s.trees'),
        sub: b.winter ? t('build.s.trees.winter', { n: I.fmtNum(left) }) : t('build.s.trees.sub', { n: I.fmtNum(+b.trees || 0), w: I.fmtNum(coming) }), go: 'timber' },
      { key: 'wood', done: wood >= h.wood, text: t('build.s.wood', { n: I.fmtNum(h.wood) }), sub: t('build.s.wood.sub', { have: I.fmtNum(wood), need: I.fmtNum(h.wood) }),
        bar: Math.max(0, Math.min(1, wood / h.wood)) },
      { key: 'wage', done: (+b.balance || 0) >= h.wage, text: t('build.s.wage', { n: I.fmtNum(h.wage) }), sub: t('build.s.wage.sub', { have: tal(b.balance) }) },
      { key: 'house', done: false, soon: true, text: t('build.s.house', { name: t('house.' + h.key) }), sub: t('build.s.house.sub') }
    ];
    var prep = list.slice(0, 4), d = prep.filter(function (s) { return s.done; }).length, next = null;
    for (var i = 0; i < prep.length; i++) if (!prep[i].done) { next = prep[i]; break; }
    return { house: h, list: list, done: d, total: prep.length, next: next };
  }

  /* ── 오른쪽 메뉴: 보관함 단추 · 다음 미션 칸 ── */
  function setFarm(f) {
    if (!f) return;
    if (f.prices) S.prices = f.prices;
    var b = f.build || null, btn = $('gStorageBtn');
    if (btn) btn.hidden = !b;
    S.build = b;
    renderMission();
    if (b && b.active) noticeOnce(b);
  }
  function renderMission() {
    var box = $('gMission'), b = S.build; if (!box) return;
    if (!b || !b.active) { box.hidden = true; return; }
    var m = mission(b);
    $('gMissionM').textContent = m.next ? t('build.next', { step: m.next.text }) : t('build.ready');
    $('gMissionP').textContent = t('build.prog', { n: m.total, d: m.done });
    $('gMissionFill').style.width = Math.round(m.done / m.total * 100) + '%';
    var tr = $('gMissionFill').parentNode; tr.setAttribute('aria-valuenow', String(Math.round(m.done / m.total * 100)));
    box.hidden = false;
  }
  // 미션이 처음 열린 날 한 번 알린다(기기마다)
  function noticeOnce(b) {
    var s = SDK.session ? SDK.session() : null, key = 'g_build_on:' + (SDK.slug ? SDK.slug() : '') + ':' + (s ? s.uid : '');
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, String(Date.now())); } catch (e) { return; }
    setTimeout(function () { HUD.toast(t('build.toast', { a: tal(b.asset) }), 5200); }, 1800);
  }

  /* ── 보관함 창 ── */
  function open(done) {
    if (S.rec) return;
    S.done = done || null;
    S.rec = HUD.openModal('gmStorage', { onClose: function () { S.rec = null; var d = S.done; S.done = null; if (d) d(); } });
    if (!S.rec) return;
    $('gstBody').innerHTML = '<p class="g-empty">' + esc(t('storage.loading')) + '</p>';
    SDK.storage().then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.why) || 'storage');
      S.data = r; if (r.build) { S.build = r.build; renderMission(); }
      HUD.setTalent(r.balance);
      draw();
    }).catch(function (e) { $('gstBody').innerHTML = '<p class="g-empty">' + esc(SDK.notReady(e) ? t('storage.notready') : t('storage.err')) + '</p>'; });
  }
  function box(title, inner, open1, extra) {
    return '<details class="g-wl-box gst-box"' + (open1 ? ' open' : '') + '><summary>' + esc(title) + (extra ? '<span class="gst-sum">' + esc(extra) + '</span>' : '') + '</summary>' + inner + '</details>';
  }
  function draw() {
    var d = S.data, b = d.build || {}, a = b.assets || {}, names = d.names || {}, L = unit(), h = '';
    // 내 자산
    var P = S.prices || {}, j = P.jeon != null ? +P.jeon : 10, dd = P.dae != null ? +P.dae : 100;
    var rows = [['talent', a.talent], ['land', a.land], ['plants', a.plants], ['wood', a.wood], ['houses', a.houses]].map(function (x) {
      return '<li><span>' + esc(t('storage.a.' + x[0])) + '</span><b>' + esc(tal(x[1])) + '</b></li>';
    }).join('');
    h += box(t('storage.assets'), '<p class="gst-total"><span>' + esc(t('storage.assets.total')) + '</span><b>' + esc(tal(a.total)) + '</b><span>' + esc(L) + '</span></p>' +
      '<ul class="g-wl-list">' + rows + '</ul>' +
      (b.active ? '' : '<p class="g-wl-note gst-until">' + esc(t('storage.assets.until', { th: tal(b.threshold), a: tal(a.total) })) + '</p>') +
      '<p class="g-wl-note">' + esc(t('storage.assets.note', { j: tal(j), d: tal(j + dd) })) + '</p>', true);
    // 다음 미션
    if (b.active) {
      var m = mission(b);
      h += box(t('build.title'), '<p class="g-wl-note">' + esc(t('build.lead', { house: t('house.' + m.house.key), dae: m.house.dae, wood: I.fmtNum(m.house.wood), wage: I.fmtNum(m.house.wage) })) + '</p>' +
        '<ol class="gst-steps">' + m.list.map(function (s) {
          var go = s.done || s.soon || !s.go ? '' : '<button type="button" class="g-btn g-btn-line gst-go" data-go="' + s.go + '">' + esc(t(s.go === 'farm' ? 'build.go.farm' : 'build.go.timber')) + '</button>';
          return '<li class="gst-step' + (s.done ? ' is-done' : '') + (s.soon ? ' is-soon' : '') + '"><span class="gst-chk" aria-hidden="true">' + (s.done ? '✓' : '') + '</span>' +
            '<span class="gst-st"><b>' + esc(s.text) + (s.soon ? ' <small class="gst-soon">' + esc(t('storage.soon')) + '</small>' : '') + '</b><small>' + esc(s.sub) + '</small>' +
            (s.bar != null ? '<span class="g-bar-track gst-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(s.bar * 100) + '"><span class="g-bar-fill" style="width:' + Math.round(s.bar * 100) + '%"></span></span>' : '') +
            '</span>' + go + '</li>';
        }).join('') + '</ol>', true, t('build.prog', { n: m.total, d: m.done }));
    }
    // 건축 자재
    var log = (d.wood_log || []).map(function (w) {
      var nm = nameOf(names[w.item]) || w.item || '';
      var lab = w.kind === 'tree_buy' ? t('storage.wood.buy', { name: nm, n: I.fmtNum(w.qty || 1) }) : w.kind === 'wood_cut' ? t('storage.wood.cut', { name: nm }) : t('storage.wood.use');
      return '<li><span>' + esc(lab) + ' <small>' + esc(w.at ? I.fmtDate(new Date(w.at)) : '') + '</small></span><b class="' + (+w.wood >= 0 ? 'is-in' : 'is-out') + '">' + (+w.wood >= 0 ? '+' : '−') + esc(I.fmtNum(Math.abs(+w.wood || 0))) + '</b></li>';
    }).join('');
    h += box(t('storage.wood'), '<p class="gst-total"><b>' + esc(t('storage.wood.n', { n: I.fmtNum(d.wood || 0) })) + '</b></p>' +
      (log ? '<ul class="g-wl-list">' + log + '</ul>' : '<p class="g-wl-note">' + esc(t('storage.wood.none')) + '</p>'), true, t('storage.wood.n', { n: I.fmtNum(d.wood || 0) }));
    // 심지 않은 씨앗·묘목
    var bag = (d.bag || []).map(function (x) { return '<li><span>' + esc(nameOf(names[x.item]) || x.item) + '</span><b>×' + esc(I.fmtNum(x.qty)) + '</b></li>'; }).join('');
    h += box(t('storage.bag'), bag ? '<ul class="g-wl-list">' + bag + '</ul>' : '<p class="g-wl-note">' + esc(t('storage.bag.none')) + '</p>', false, bag ? I.fmtNum((d.bag || []).length) : '');
    // 배운 교육
    var edu = (d.edu || []).map(function (e) {
      var dt = e.date ? I.fmtDate(new Date(e.date + 'T12:00:00')) : e.at ? I.fmtDate(new Date(e.at)) : '';
      return '<li><span>' + esc(e.title || t('storage.edu.noname')) + ' <small>' + esc(dt) + '</small></span><b>' + (+e.talent ? '+' + esc(tal(e.talent)) : '') + '</b></li>';
    }).join('');
    h += box(t('storage.edu'), edu ? '<ul class="g-wl-list">' + edu + '</ul>' : '<p class="g-wl-note">' + esc(t('storage.edu.none')) + '</p>', !!edu, edu ? I.fmtNum((d.edu || []).length) : '');
    // 다녀온 여행 · 지은 집 — 앞으로 생길 상품
    h += box(t('storage.trip'), '<p class="g-wl-note">' + esc(t('storage.trip.soon')) + '</p>', false, t('storage.soon'));
    h += box(t('storage.house'), '<p class="g-wl-note">' + esc(t('storage.house.soon')) + '</p>', false, t('storage.soon'));
    $('gstBody').innerHTML = h;
  }
  function onBody(e) {
    var b = e.target.closest('[data-go]'); if (!b || !S.rec) return;
    var go = b.getAttribute('data-go');
    S.done = null;   // 다른 창으로 옮겨 가므로 닫힌 뒤 할 일은 하지 않는다
    HUD.closeThen(S.rec, function () {
      if (go === 'farm' && FARM) FARM.open();
      else if (go === 'timber' && SHOP) SHOP.open('timber');
    });
  }

  function init(o) {
    I = o.i18n; SDK = o.sdk; HUD = o.hud; FARM = o.farm || window.GardenFarm || null; SHOP = o.shop || window.GardenShop || null; t = I.t;
    if (!$('gmStorage')) return;
    $('gstBody').addEventListener('click', onBody);
    var btn = $('gStorageBtn'); if (btn) btn.addEventListener('click', function () { open(); });
    var mb = $('gMissionBtn'); if (mb) mb.addEventListener('click', function () { open(); });
  }
  return { init: init, open: open, setFarm: setFarm, mission: function () { return S.build && S.build.active ? mission(S.build) : null; } };
})();
