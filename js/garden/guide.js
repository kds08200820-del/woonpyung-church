/* ============================================================
   신앙 정원 — 안내 도우미 (2026-10-23 담임목사)
   "최근 신앙생활에 대해 격려와 조언, 정원 가꾸는 노하우, 미션 등을 주면서 안내하고 참여를 독려하는 팝업.
    교회 소식이나 날씨. 하루에 처음 접속하면 수확할 것, 관리 대상 식물, 다음 미션, 추구할 방향을 알려 주는 도우미"
   "목적은 정원 가꾸기를 통하여 신앙생활을 즐겁게 해 나갈 수 있도록 독려하는 것"
   · 순서: 인사·격려(큐티 연속·오늘 한 일·주일) → 오늘의 말씀 → 오늘 해 볼 일 → 내 정원 돌보기 → 날씨와 노하우 → 교회 소식 → 다음 걸음
   · 하루 처음 들어올 때 한 번(이 기기 기준), 내 모습 칸의 '오늘의 안내'로 언제든 다시. '매일 보기'를 끄면 저절로 뜨지 않는다
   · 화면에 이미 있는 자료(정원 상태·할 일·내 밭·날씨·큐티)와 공지 제목만 쓴다. 글은 규칙으로 고른다(담담하게)
   GardenGuide.init({ i18n, sdk, hud, scene, farm, ctx }) · GardenGuide.daily() · GardenGuide.open()
   ============================================================ */
window.GardenGuide = (function () {
  'use strict';
  var I, SDK, HUD, SCENE, FARM, ctx, t;
  var KEY_DAY = 'g_guide_day', KEY_OFF = 'g_guide_off', KEY_LAST = 'g_guide_last', KEY_GRANT = 'g_grant_seen', KEY_GIFT = 'g_gift_seen', KEY_BT = 'g_bt_seen';
  var G = { rec: null, tries: 0 };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function fmtTal(n) { return I.fmtNum(Math.round((+n || 0) * 10) / 10); }
  function list(a, max) { a = a || []; var u = []; a.forEach(function (x) { if (x && u.indexOf(x) < 0) u.push(x); }); return u.slice(0, max || 4).join(', ') + (u.length > (max || 4) ? ' …' : ''); }
  function wxKind(code) { return SCENE.weatherOf(code); }

  /* ── 인사 · 격려(최근 신앙생활로 고른다) ── */
  function greet(nick) {
    var h = I.nowParts().hh, k = h < 5 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : h < 21 ? 'evening' : 'night';
    return t('guide.hello.' + k, { name: nick || t('guide.friend') });
  }
  function cheer(st) {
    var streak = st.qt_streak | 0, td = st.today || {}, dow = I.nowParts().dow;
    var last = get(KEY_LAST), gap = last ? Math.round((new Date(I.todayStr()) - new Date(last)) / 86400000) : 0;
    if (dow === 0) return t('guide.cheer.sunday');
    if (streak >= 7) return t('guide.cheer.streak7', { n: I.fmtNum(streak) });
    if (streak >= 2) return t('guide.cheer.streak', { n: I.fmtNum(streak) });
    if (gap >= 4) return t('guide.cheer.back');
    if ((td.xp | 0) > 0) return t('guide.cheer.today');
    return t('guide.cheer.start');
  }
  function sec(key, inner, cls) { return '<section class="gd-sec' + (cls ? ' ' + cls : '') + '"><h3 class="gd-h">' + esc(t('guide.sec.' + key)) + '</h3>' + inner + '</section>'; }
  function act(label, data, primary) { return '<button type="button" class="g-btn ' + (primary ? 'g-btn-primary' : 'g-btn-line') + ' gd-act" ' + data + '>' + esc(label) + '</button>'; }

  /* ── 창 그리기 ── */
  function draw() {
    var st = HUD.state() || {}, me = st.me || {}, c = (ctx && ctx()) || {}, h = '';
    var pic = SCENE.asset('study/sit-pastor.webp') || SCENE.asset('chars/char-pastor.webp');
    $('gdPic').innerHTML = pic ? '<img alt="" src="' + esc(pic) + '">' : '';
    $('gmGuideTitle').textContent = greet(me.nickname);
    $('gdLead').textContent = cheer(st);

    // 목회자 기본 달란트(처음 한 번) · 새로 받은 선물
    if (G.grant > 0 && get(KEY_GRANT) !== '1') { h += sec('grant', '<p class="gd-grant">' + esc(t('guide.grant', { n: I.fmtNum(G.grant) })) + '</p>'); put(KEY_GRANT, '1'); }
    if (G.giftIn > (+get(KEY_GIFT) || 0)) { h += '<p class="gd-ok gd-gift">' + esc(t('guide.gift.in', { n: I.fmtNum(Math.round((G.giftIn - (+get(KEY_GIFT) || 0)) * 10) / 10) })) + '</p>'; put(KEY_GIFT, String(G.giftIn)); }

    // 학습·세례(입교) 신청 대상 — 담임목사가 확정한 분에게 맨 위에(종류·알림 문구·마감) (2026-10-25 담임목사)
    var bts = HUD.baptTargets ? HUD.baptTargets() : [];
    if (bts.length) h += sec('bapt', bts.map(function (f) {
      var until = f.close_at ? t('guide.bapt.until', { date: I.fmtDate(new Date(f.close_at)) }) : '';
      return '<div class="gd-bapt"><p class="gd-bapt-t"><b>' + esc(f.t_kind ? t('guide.bapt.title', { kind: f.t_kind }) : t('guide.bapt.any')) + '</b>' + (until ? '<small>' + esc(f.title || '') + ' · ' + esc(until) + '</small>' : '<small>' + esc(f.title || '') + '</small>') + '</p>' +
        (f.t_note ? '<p class="gd-bapt-n">' + esc(f.t_note) + '</p>' : '') +
        '<div class="gd-bapt-a"><a class="g-btn g-btn-primary gd-act" href="forms.html?f=' + encodeURIComponent(f.id) + '">' + esc(t('guide.bapt.apply')) + '</a><a class="g-btn g-btn-line gd-act" href="classroom.html">' + esc(t('guide.bapt.study')) + '</a></div></div>';
    }).join(''), 'gd-sec-bapt');

    // 오늘의 말씀
    var q = HUD.qt(), items = HUD.todoItems ? HUD.todoItems() : [], amen = items.filter(function (x) { return x.kind === 'qt_amen'; })[0];
    if (q) h += sec('word', '<p class="gd-word"><b>' + esc(q.title || '') + '</b>' + (q.scripture ? '<small>' + esc(q.scripture) + '</small>' : '') + '</p>' +
      (amen && amen.done ? '<p class="gd-ok">' + esc(t('guide.word.done')) + '</p>' : act(t('guide.word.read'), 'data-do="qt"', true)));

    // 오늘 해 볼 일 — 아직 안 한 것 4개까지, 받는 것과 함께
    var todo = items.filter(function (x) { return !x.done && x.kind !== 'qt_amen'; });
    var th = todo.length ? '<ul class="gd-todo">' + todo.slice(0, 4).map(function (x) {
      var rw = (x.talent > 0 ? '+' + fmtTal(x.talent) + ' ' + HUD.talentLabel() : '') + (x.xp > 0 ? (x.talent > 0 ? ' · ' : '') + '+' + I.fmtNum(x.xp) + ' XP' : '');
      return '<li><span class="gd-tt"><b>' + esc(x.label) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + (rw ? '<small class="gd-rw">' + esc(rw) + '</small>' : '') + '</span>' +
        act(t('guide.todo.go'), 'data-do="todo" data-kind="' + esc(x.kind) + '"') + '</li>';
    }).join('') + '</ul>' : '<p class="gd-ok">' + esc(t('guide.todo.all')) + '</p>';
    h += sec('todo', th);

    // 내 정원 돌보기 — 거둘 것 · 목마른 것 · 마음이 더 필요한 것 · 시든 것 · 빈 밭
    var fs = FARM && FARM.state && FARM.state() && FARM.summary ? FARM.summary() : null;
    if (fs) {
      var lines = [];
      if (fs.ripe.length) lines.push(['ripe', t('guide.farm.ripe', { list: list(fs.ripe) })]);
      if (fs.thirsty.length) lines.push(['thirsty', t('guide.farm.thirsty', { list: list(fs.thirsty) })]);
      if (fs.wantXp.length) lines.push(['xp', t('guide.farm.wantXp', { list: list(fs.wantXp) })]);
      if (fs.dead.length) lines.push(['dead', t('guide.farm.dead', { list: list(fs.dead) })]);
      if (fs.empty) lines.push(['empty', t('guide.farm.empty', { n: I.fmtNum(fs.empty) })]);
      var fruit = st.fruit, left = fruit && fruit.per_day ? fruit.per_day - (fruit.picked || []).length : 0;
      if (left > 0) lines.unshift(['ripe', t('guide.farm.tree', { n: I.fmtNum(left) })]);
      h += sec('farm', (lines.length ? '<ul class="gd-list">' + lines.map(function (l) { return '<li class="gd-' + l[0] + '">' + esc(l[1]) + '</li>'; }).join('') + '</ul>' : '<p class="gd-ok">' + esc(t('guide.farm.ok')) + '</p>') +
        act(t('guide.farm.open'), 'data-do="farm"'));
    }

    // 날씨와 정원 노하우 — 지금 날씨에 맞는 한 마디 + 이달의 노하우
    var wx = c.wx, wl = '';
    if (wx) {
      var k = wxKind(wx.code), tip = k;
      if (k === 'clear' || k === 'cloudy') { if (wx.temp != null && wx.temp >= 28) tip = 'hot'; else if (wx.temp != null && wx.temp <= 2) tip = 'cold'; }
      wl = '<p class="gd-wx"><b>' + esc(t('guide.wx.now', { w: t('wx.' + k), temp: wx.temp != null ? Math.round(wx.temp) : '' })) + '</b> ' + esc(t('guide.wx.' + tip)) + '</p>';
    }
    h += sec('wx', '<p class="gd-alert" id="gdWxAlert" hidden></p>' + wl + '<p class="gd-tip">' + esc(t('guide.tip.' + I.nowParts().m)) + '</p>' +
      '<button type="button" class="g-link" data-do="week">' + esc(t('wx.open')) + '</button>');

    // 교회 소식 — 공지 제목(뒤에 채운다) + 예배 띠
    var bn = $('gBanner'), bt = bn && !bn.hidden ? (bn.textContent || '').replace(/\s+/g, ' ').trim() : '';
    h += sec('news', (bt ? '<p class="gd-banner">' + esc(bt) + '</p>' : '') + '<ul class="gd-news" id="gdNews"><li class="g-empty">' + esc(t('visit.loadingList')) + '</li></ul>' +
      '<a class="g-link" href="home.html#homeNotice">' + esc(t('guide.news.more')) + '</a>');

    // 다음 걸음 — 나무의 다음 단계, 이웃, 땅 넓히기
    var gi = HUD.growthInfo ? HUD.growthInfo() : null, nx = [];
    if (gi) nx.push('<li>' + esc(gi.last ? t('guide.next.last', { name: gi.name }) : gi.need > 0 ? t('guide.next.stage', { name: gi.name, next: gi.next, need: I.fmtNum(gi.need) }) : t('guide.next.ready', { name: gi.name, next: gi.next })) + '</li>');
    var vr = $('gVisitRow');
    if (vr && !vr.hidden) nx.push('<li>' + esc(t('guide.next.visit')) + ' ' + act(t('guide.next.visitGo'), 'data-do="visit"') + '</li>');
    if (fs && fs.price > 0 && fs.balance >= fs.price) nx.push('<li>' + esc(t('guide.next.land')) + '</li>');
    var ms = window.GardenStorage && window.GardenStorage.mission ? window.GardenStorage.mission() : null;   // 건축 미션(자산이 기준을 넘으면)
    if (ms && ms.next) nx.unshift('<li>' + esc(t('guide.next.build', { step: ms.next.text })) + ' ' + act(t('guide.next.buildGo'), 'data-do="storage"') + '</li>');
    if (st.ss && st.ss.kids && st.ss.kids.length) nx.push('<li>' + esc(t('guide.next.ss')) + '</li>');
    if (nx.length) h += sec('next', '<ul class="gd-list gd-next">' + nx.join('') + '</ul>');

    $('gdBody').innerHTML = h;
    $('gdDaily').checked = get(KEY_OFF) !== '1';
    loadNews();
    if (window.GardenWeather) window.GardenWeather.alerts().then(function (a) {   // 태풍·강풍·많은 비가 예보된 날(주일 먼저)
      var el = $('gdWxAlert'); if (!el || !a.length) return;
      var x = a.filter(function (v) { return v.sunday; })[0] || a[0];
      el.textContent = x.text; el.hidden = false;
    });
  }
  function loadNews() {
    var ul = $('gdNews'); if (!ul) return;
    if (!SDK.notices) { ul.innerHTML = ''; return; }
    SDK.notices().then(function (rows) {
      rows = Array.isArray(rows) ? rows : [];
      ul.innerHTML = rows.length ? rows.map(function (n) { return '<li><b>' + esc(n.title || '') + '</b><small>' + esc(n.created_at ? I.fmtDate(new Date(n.created_at)) : '') + '</small></li>'; }).join('')
        : '<li class="g-empty">' + esc(t('guide.news.none')) + '</li>';
    }, function () { ul.innerHTML = '<li class="g-empty">' + esc(t('guide.news.none')) + '</li>'; });
  }

  /* ── 열기 · 하루 한 번 ── */
  function open() {
    if (G.rec) return;
    G.rec = HUD.openModal('gmGuide', { onClose: function () { G.rec = null; } });
    if (!G.rec) return;
    draw();
    put(KEY_LAST, I.todayStr());
  }
  function daily() {
    var b = $('gGuideBtn'); if (b) b.hidden = false;
    var c = (ctx && ctx()) || {};
    if (c.offline) return;
    if (!G.checked && SDK.wallet) {   // 목회자 달란트·받은 선물이 있으면 그날 이미 봤어도 한 번 더
      G.checked = true;
      SDK.wallet().then(function (w) {
        (w && w.by_kind || []).forEach(function (k) { if (k.kind === 'staff_grant') G.grant = +k['in'] || 0; if (k.kind === 'gift_in') G.giftIn = +k['in'] || 0; });
        if ((G.grant > 0 && get(KEY_GRANT) !== '1') || (G.giftIn > (+get(KEY_GIFT) || 0))) put(KEY_DAY, '');
        daily();
      }, function () { daily(); });
      return;
    }
    if (get(KEY_OFF) === '1' && !(G.grant > 0 && get(KEY_GRANT) !== '1')) return;
    if (get(KEY_DAY) === I.todayStr()) return;
    // 다른 창(첫 심기·말씀 등)이 열려 있으면 조금 뒤에
    if (document.body.classList.contains('g-modal-open') || (window.Garden3D && window.Garden3D.isOpen())) { if (G.tries++ < 20) setTimeout(daily, 3000); return; }
    put(KEY_DAY, I.todayStr());
    open();
  }
  // 새로 신청 대상이 되면(신청서·종류마다 한 번) '매일 보기'를 꺼 두었거나 오늘 이미 봤어도 안내 창을 연다 — hud.js loadForms 가 부른다
  function targets(list) {
    var seen = (get(KEY_BT) || '').split(',').filter(Boolean);
    var fresh = (list || []).map(function (f) { return f.id + ':' + (f.t_kind || ''); }).filter(function (k) { return seen.indexOf(k) < 0; });
    if (G.rec) { draw(); }
    if (!fresh.length) return;
    if (document.body.classList.contains('g-modal-open') || (window.Garden3D && window.Garden3D.isOpen())) {   // 다른 창이 열려 있으면 조금 뒤에
      G.btTries = (G.btTries || 0) + 1;
      if (G.btTries < 20) setTimeout(function () { targets(list); }, 3000);
      return;
    }
    put(KEY_BT, seen.concat(fresh).slice(-40).join(','));
    put(KEY_DAY, I.todayStr());
    open();
  }
  function onAct(e) {
    var b = e.target.closest && e.target.closest('[data-do]'); if (!b) return;
    var what = b.getAttribute('data-do'), kind = b.getAttribute('data-kind');
    // 안내 창의 '뒤로 가기'가 끝난 다음 다음 창을 연다(곧바로 열면 늦은 '뒤로'가 새 창을 닫는다)
    HUD.closeThen(G.rec, function () {
      if (what === 'qt') { if (HUD.qt()) HUD.openQt(); }
      else if (what === 'farm') { if (FARM) FARM.open(); }
      else if (what === 'visit') { if (window.GardenVisit) window.GardenVisit.openList(); }
      else if (what === 'week') { if (window.GardenWeather) window.GardenWeather.open(); }
      else if (what === 'storage') { if (window.GardenStorage) window.GardenStorage.open(); }
      else if (what === 'todo') { var tb = document.querySelector('.g-todo-btn[data-kind="' + kind + '"]'); if (tb) tb.click(); }
    });
  }

  function init(o) {
    I = o.i18n; SDK = o.sdk; HUD = o.hud; SCENE = o.scene; FARM = o.farm; ctx = o.ctx; t = I.t;
    if (!$('gmGuide')) return;
    $('gdBody').addEventListener('click', onAct);
    $('gdDaily').addEventListener('change', function () { put(KEY_OFF, this.checked ? '0' : '1'); });
    var b = $('gGuideBtn'); if (b) b.addEventListener('click', open);
  }
  return { init: init, daily: daily, open: open, targets: targets };
})();
