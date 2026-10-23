/* ============================================================
   신앙 정원 — HUD (레일·서재·큐티 팝업·창고·첫 심기·예배 띠·하단 바·토스트·모달 공통)
   · 모달 공통: window.ModalNav(layout.js) + 포커스 가둠·복귀 + 드래그 밖 닫힘 방지(누르기·놓기 둘 다 배경일 때만)
     + Esc 는 맨 위 창만 + role=dialog aria-modal + 배경 스크롤 잠금(body.g-modal-open)
   · 문구는 전부 GardenI18n.t(), 백엔드가 쓰는 고정값은 GardenI18n.db
   · 네트워크는 전부 GardenSDK 를 통해서만
   ============================================================ */
window.GardenHud = (function () {
  'use strict';
  var I, SDK, SCENE, t, P = {};
  var H = { state: null, offline: false, qt: null, qtDate: '', amenDone: false, rankMsg: '', doneKinds: {}, talentLabel: '', svcForce: '', onPlanted: null };
  var TASK_KINDS = ['water', 'login', 'qt_amen', 'bible_day', 'worship_sunday', 'worship_weekday', 'audiobook_chapter', 'heart_given', 'modu_day'];
  var TASK_HREF = { bible_day: 'dashboard.html', audiobook_chapter: 'audiobook.html', heart_given: 'story.html#growth', modu_day: 'modu/' };
  var SEED_ICON = { sunflower: '🌻', olive: '🫒', fig: '🍐', grape: '🍇', mustard: '🌼', lily: '🌷' };
  var WX_ICON = { clear: '☀️', night: '🌙', cloudy: '☁️', fog: '🌫️', rain: '🌧️', snow: '❄️' };
  /* 예배 묶음 — index.html 이 쓰는 ?v= 그대로(이미 올라간 파일은 건너뜀) */
  var BUNDLE_CSS = ['css/worship.css?v=20261023lib1'];
  var BUNDLE_JS = ['js/bulletins.js?v=20261017sum1', 'js/bulletins-live.js?v=20261010sum1', 'js/gyodok-data.js?v=20260926ws', 'js/hymn-data.js?v=20260927meta', 'modu/ccm-data.js?v=20260928ccm2', 'js/worship.js?v=20261023lib1'];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function show(el, on) { if (el) el.hidden = !on; }
  function label(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') { var l = I.locale(); if (v[l]) return v[l]; if (v.ko) return v.ko; for (var k in v) if (v[k]) return String(v[k]); }
    return String(v);
  }

  /* ── 토스트(한 번에 하나, 새것이 오면 교체) ── */
  var toastT = 0;
  function toast(msg, ms) {
    var el = $('gToast'); if (!el) return;
    el.textContent = msg; el.hidden = false;
    el.classList.remove('is-on'); void el.offsetWidth; el.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove('is-on'); setTimeout(function () { if (!el.classList.contains('is-on')) el.hidden = true; }, 320); }, ms || 2600);
  }

  /* ── 모달 공통 ── */
  var mstack = [];
  var FOC = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function openModal(id, o) {
    o = o || {};
    var m = $(id); if (!m || !m.hidden) return null;
    var rec = { id: id, el: m, opener: document.activeElement, onClose: o.onClose, closed: false, depth: 0, nav: false };
    m.hidden = false;
    document.body.classList.add('g-modal-open');
    mstack.push(rec);
    rec.doClose = function () {
      if (rec.closed) return; rec.closed = true;
      var i = mstack.indexOf(rec); if (i >= 0) mstack.splice(i, 1);
      m.hidden = true;
      if (!mstack.length) document.body.classList.remove('g-modal-open');
      try { if (rec.opener && rec.opener.focus && document.contains(rec.opener)) rec.opener.focus({ preventScroll: true }); } catch (e) { }
      if (rec.onClose) { try { rec.onClose(); } catch (e) { } }
    };
    if (window.ModalNav) { ModalNav.open(rec.doClose); rec.depth = ModalNav.count(); rec.nav = true; }
    var box = m.querySelector('[role="dialog"]');
    if (box && !box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
    setTimeout(function () {
      if (rec.closed) return;
      var f = o.initialFocus ? m.querySelector(o.initialFocus) : null;
      if (!f) { var list = m.querySelectorAll(FOC); for (var i = 0; i < list.length; i++) { if (!list[i].hasAttribute('data-close') && list[i].offsetParent !== null) { f = list[i]; break; } } }
      try { (f || box || m).focus({ preventScroll: true }); } catch (e) { }
    }, 30);
    return rec;
  }
  function closeModal(rec) {
    if (!rec || rec.closed) return;
    if (rec.nav && window.ModalNav && ModalNav.count() === rec.depth) ModalNav.close(); else rec.doClose();
  }
  function recOf(id) { for (var i = mstack.length - 1; i >= 0; i--) if (mstack[i].id === id) return mstack[i]; return null; }
  function topModal() { return mstack[mstack.length - 1] || null; }
  function isTop(rec) { return !!rec && topModal() === rec && (!rec.nav || !window.ModalNav || ModalNav.count() === rec.depth); }
  function bindModal(id) {
    var m = $(id); if (!m) return;
    var bd = m.querySelector('.g-backdrop'), down = false;
    if (bd) {
      bd.addEventListener('pointerdown', function (e) { down = (e.target === bd); });
      bd.addEventListener('click', function (e) { if (down && e.target === bd) closeModal(recOf(id)); down = false; });
    }
    Array.prototype.forEach.call(m.querySelectorAll('[data-close]'), function (b) { if (b !== bd) b.addEventListener('click', function () { closeModal(recOf(id)); }); });
    m.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var list = Array.prototype.filter.call(m.querySelectorAll(FOC), function (x) { return x.offsetParent !== null; });
      if (!list.length) { e.preventDefault(); return; }
      var first = list[0], last = list[list.length - 1], act = document.activeElement;
      if (e.shiftKey && (act === first || !m.contains(act))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (act === last || !m.contains(act))) { e.preventDefault(); first.focus(); }
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var top = topModal(); if (!top || !isTop(top)) return;
    e.preventDefault(); closeModal(top);
  });

  /* ── 상태 도우미 ── */
  function garden() {
    var g = (H.state && H.state.garden) || {};
    return { species: g.species || 'sunflower', plant_name: g.plant_name || '', stage: g.stage | 0, plant_xp: g.plant_xp | 0, xp_total: g.xp_total | 0, talent_balance: g.talent_balance | 0, plants_done: g.plants_done | 0, chosen_at: g.chosen_at || null };
  }
  function speciesList() {
    var list = ((H.state && H.state.species) || []).filter(function (s) { return s && s.slug && s.active !== false; });
    if (list.length) return list;
    return ['sunflower', 'olive', 'fig'].map(function (slug) { return { slug: slug, name: t('species.' + slug), stage_xp: [0, 150, 500, 1000, 1600, 2200], done_xp: 2800 }; });
  }
  function speciesOf(slug) { var L = speciesList(); for (var i = 0; i < L.length; i++) if (L[i].slug === slug) return L[i]; return null; }
  function speciesName(slug) { var s = speciesOf(slug); var n = s ? label(s.name) : ''; return n || (I.has('species.' + slug) ? t('species.' + slug) : slug); }
  function stageName(slug, stage) {
    var s = speciesOf(slug), names = s && s.stage_names;
    if (names && typeof names === 'object' && !Array.isArray(names)) names = names[I.locale()] || names.ko;
    if (Array.isArray(names) && names[stage]) return String(names[stage]);
    return t('stage.' + stage);
  }
  function rulesMap() { var m = {}; ((H.state && H.state.rules) || []).forEach(function (r) { if (r && r.kind && r.active !== false) m[r.kind] = r; }); return m; }
  function kindLabel(kind, rules) { var r = (rules || rulesMap())[kind]; var l = r ? label(r.label) : ''; return l || (I.has('kind.' + kind) ? t('kind.' + kind) : kind); }
  function avatarKeyOf(url) { var m = String(url || '').match(/char-([a-z0-9-]+)\.webp/); return m ? m[1] : ''; }
  /* 고를 수 있는 모습 — 도서관 인물(서 있는 전신 그림이 있을 때). 목사님 모습은 교회 관리자에게만.
     예전 키 a/b/c 는 m1·f1·m2 와 같은 그림이라 그 칸에 표시한다 */
  var AV_PEOPLE = ['m1', 'f1', 'm2', 'f2', 'm3', 'f3', 'm4', 'f4'];
  var AV_LEGACY = { a: 'm1', b: 'f1', c: 'm2' };
  function avatarChoices(me) {
    var list = AV_PEOPLE.filter(function (k) { return SCENE.has('chars/char-' + k + '.webp'); });
    if (!list.length) return ['a', 'b', 'c'];                                   /* 그림이 없으면 예전 자리표시 3칸 */
    var role = (me && me.role) || '';
    if ((role === 'owner' || role === 'admin') && SCENE.has('chars/char-pastor.webp')) list.unshift('pastor');
    return list;
  }
  function avatarUrlOf(key) { return 'images/garden/default/chars/char-' + key + '.webp'; }

  /* ── 레일 ── */
  // 교회 설정의 글자는 {"ko":"달란트","en":"Talents"} 처럼 언어별 묶음일 수 있다 — 지금 언어 것을 고른다
  function labelOf(v) {
    if (v && typeof v === 'object') { var loc = String(I.locale() || 'ko'); return v[loc] || v[loc.split('-')[0]] || v.ko || v.en || ''; }
    return v ? String(v) : '';
  }
  function fmtTal(n) { return I.fmtNum(Math.round((+n || 0) * 10) / 10); }
  /* 달란트 잔액을 바꿔 그린다(내 땅·열매 따기 뒤) */
  function setTalent(v) {
    var g = garden(); if (g && v != null) g.talent_balance = +v;
    $('gTalentNum').textContent = fmtTal(g ? g.talent_balance : v);
    if (store.rec) $('gmStoreNum').textContent = fmtTal(g ? g.talent_balance : v);
  }
  /* ── 믿음 나무 열매 따기 (state.fruit 는 2단계 SQL 뒤에만 온다 — 없으면 단추도 숨긴다) ── */
  var FR = { on: false, layer: null };
  function fruitLeft() { var f = (H.state || {}).fruit; if (!f || !f.per_day) return []; var out = []; for (var n = 1; n <= f.per_day; n++) if ((f.picked || []).indexOf(n) < 0) out.push(n); return out; }
  function renderFruitBtn() {
    var b = $('gFruitBtn'), fb = $('gFarmBtn'), st = H.state || {};
    if (fb) show(fb, st.fruit !== undefined && !H.offline);
    if (!b) return;
    var f = st.fruit, left = fruitLeft();
    show(b, !!(f && f.per_day > 0));
    if (!f || !f.per_day) { fruitMode(false); return; }
    b.disabled = !left.length;
    b.textContent = left.length ? (FR.on ? t('fruit.done') : t('fruit.open', { n: left.length })) : t('fruit.none');
    if (!left.length) fruitMode(false);
  }
  function fruitMode(on) {
    FR.on = !!on;
    if (FR.layer) { FR.layer.remove(); FR.layer = null; }
    window.removeEventListener('resize', placeFruits); window.removeEventListener('scroll', placeFruits);
    if (!FR.on) return;
    var layer = document.createElement('div'); layer.className = 'g-fruit-layer'; layer.setAttribute('role', 'group'); layer.setAttribute('aria-label', t('fruit.layer'));
    var sp = (garden() || {}).species || 'olive';
    fruitLeft().forEach(function (n) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'g-fruit'; b.setAttribute('data-n', n);
      b.setAttribute('aria-label', t('fruit.aria', { n: n }));
      b.innerHTML = '<img alt="" draggable="false" src="images/garden/farm/fruit-' + esc(sp) + '.webp" onerror="this.parentNode.classList.add(\'noimg\');this.remove()">';
      b.addEventListener('click', function () { pickFruit(b); });
      layer.appendChild(b);
    });
    document.body.appendChild(layer); FR.layer = layer;
    placeFruits();
    window.addEventListener('resize', placeFruits); window.addEventListener('scroll', placeFruits, { passive: true });
  }
  function placeFruits() {
    var L = FR.layer, pl = document.querySelector('.g-plant-anchor .g-plant'); if (!L || !pl) return;
    var r = pl.getBoundingClientRect(), fixed = getComputedStyle($('gScene')).position === 'fixed';
    L.style.position = fixed ? 'fixed' : 'absolute';
    L.style.left = r.left + (fixed ? 0 : window.scrollX) + 'px'; L.style.top = r.top + (fixed ? 0 : window.scrollY) + 'px';
    L.style.width = r.width + 'px'; L.style.height = r.height + 'px';
    var bs = L.querySelectorAll('.g-fruit'), tot = (H.state.fruit || {}).per_day || bs.length;
    Array.prototype.forEach.call(bs, function (b) {
      var n = +b.getAttribute('data-n'), a = n * 2.39996, rr = 0.3 + 0.7 * Math.sqrt((n - 0.5) / tot);
      b.style.left = (50 + Math.cos(a) * rr * 30) + '%'; b.style.top = (30 + Math.sin(a) * rr * 16) + '%';
    });
  }
  function pickFruit(b) {
    if (b.disabled) return; b.disabled = true; b.classList.add('is-going');
    SDK.pickFruit(+b.getAttribute('data-n')).then(function (r) {
      if (!r || !r.ok) { b.disabled = false; b.classList.remove('is-going'); toast(t('fruit.err')); return; }
      if (r.picked) SCENE.floatXp(0, '+' + fmtTal(r.gain) + ' ' + H.talentLabel);
      H.state.fruit = r.fruit; setTalent(r.talent_balance);
      setTimeout(function () { b.remove(); renderFruitBtn(); }, 420);
    }).catch(function () { b.disabled = false; b.classList.remove('is-going'); toast(t('fruit.err')); });
  }
  /* ── 정원에 물 주기 (하루 한 번, 3단계 SQL 뒤에만 — state.watered 가 있을 때) ── */
  function renderWaterBtn() {
    var b = $('gWaterBtn'), sb = $('gShopBtn'), st = H.state || {}, on = st.watered !== undefined && !H.offline;
    if (sb) show(sb, on && !!window.GardenShop);
    if (!b) return;
    show(b, on);
    var r = rulesMap().water;
    b.disabled = !!st.watered;
    b.textContent = st.watered ? t('water.done') : t('water.go.n', { n: fmtTal(r ? r.talent : 2) });
  }
  function doWater() {
    var b = $('gWaterBtn'); if (b) b.disabled = true;
    SDK.water().then(function (r) { if (!r || !r.ok) throw new Error('water'); afterWater(r); })
      .catch(function () { if (b) b.disabled = false; toast(t('water.err')); });
  }
  function afterWater(r) {
    if (!H.state) return;
    H.state.watered = true; H.doneKinds.water = 1;
    if (r.talent_balance != null) setTalent(r.talent_balance);
    if (r.watered && +r.gain > 0) { SCENE.floatXp(0, '+' + fmtTal(r.gain) + ' ' + H.talentLabel); SCENE.sparkle(10); toast(t('water.thanks', { n: fmtTal(r.gain) })); }
    else toast(t('water.done.msg'));
    renderWaterBtn(); renderTodo();
  }
  function renderRail() {
    var st = H.state || {}, g = garden(), ch = st.church || {};
    H.talentLabel = labelOf(ch.talent_label) || t('talent.unit');
    $('gTalentNum').textContent = fmtTal(g.talent_balance); $('gTalentUnit').textContent = H.talentLabel;
    renderFruitBtn(); renderWaterBtn();
    var streak = st.qt_streak | 0;
    show($('gStreak'), streak > 0); $('gStreakText').textContent = t('rail.streak', { n: I.fmtNum(streak) });
    show($('gOffline'), H.offline);
    renderGrowth(); renderTodo();
  }
  function renderGrowth() {
    var g = garden(), sp = speciesOf(g.species) || {}, th = Array.isArray(sp.stage_xp) ? sp.stage_xp : [0, 150, 500, 1000, 1600, 2200], done = sp.done_xp || 2800;
    var cur = th[g.stage] || 0, next = g.stage >= 5 ? done : (th[g.stage + 1] || done);
    var pct = next > cur ? Math.max(0, Math.min(100, Math.round((g.plant_xp - cur) / (next - cur) * 100))) : 100;
    $('gGrowStage').textContent = (g.plant_name ? g.plant_name + ' · ' : '') + stageName(g.species, g.stage);
    $('gGrowXp').textContent = t('growth.xp', { cur: I.fmtNum(g.plant_xp), next: I.fmtNum(next) });
    $('gGrowFill').style.width = pct + '%';
    var fill = $('gGrowFill').parentNode; fill.setAttribute('aria-valuenow', String(pct)); fill.setAttribute('aria-label', t('growth.title'));
    var d = $('gGrowDone'); d.textContent = g.plants_done > 0 ? t('growth.done', { n: I.fmtNum(g.plants_done) }) : t('growth.first');
  }
  function isDone(kind) {
    var td = (H.state && H.state.today) || {};
    if (kind === 'login' && td.checked_in) return true;
    if (kind === 'qt_amen' && H.amenDone) return true;
    if (kind === 'water' && H.state && H.state.watered) return true;
    var kinds = td.kinds || td.done;
    if (Array.isArray(kinds) && kinds.indexOf(kind) >= 0) return true;
    if (kinds && typeof kinds === 'object' && !Array.isArray(kinds) && (kinds[kind] | 0) > 0) return true;
    return !!H.doneKinds[kind];
  }
  function renderTodo() {
    var ul = $('gTodoList'); if (!ul) return;
    var rules = rulesMap(), dow = I.nowParts().dow, items = [];
    TASK_KINDS.forEach(function (k) {
      var r = rules[k]; if (!r) return;
      if (k === 'worship_sunday' && dow !== 0) return;
      if (k === 'login' && rules.water) return;
      if (k === 'worship_weekday' && dow === 0) return;
      items.push({ kind: k, rule: r, done: isDone(k), talent: +r.talent || 0, xp: r.xp | 0 });
    });
    ssTasks(rules).forEach(function (x) { items.push(x); });
    ul.innerHTML = '';
    show($('gTodoEmpty'), !items.length);
    var cnt = $('gTodoCount');
    if (cnt) { cnt.textContent = t('todo.count', { done: items.filter(function (x) { return x.done; }).length, total: items.length }); show(cnt, items.length > 0); }
    items.forEach(function (it) {
      var li = document.createElement('li'); li.className = 'g-todo-item' + (it.done ? ' is-done' : '');
      var href = it.href || TASK_HREF[it.kind], tag = href ? 'a' : 'button', lab = it.label || kindLabel(it.kind, rules);
      // 받는 것: 달란트와 XP 를 함께 (주일학교 인증의 달란트는 어린이에게)
      var rw = (it.talent > 0 ? '<span class="g-todo-tal">+' + esc(fmtTal(it.talent)) + ' ' + esc(H.talentLabel) + '</span>' : '') +
        (it.xp > 0 ? '<span class="g-todo-xp">+' + esc(I.fmtNum(it.xp)) + ' XP</span>' : '');
      var inner = '<span class="g-todo-chk" aria-hidden="true">' + (it.done ? '✓' : '') + '</span><span class="g-todo-label">' + esc(lab) +
        (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span>' + (rw ? '<span class="g-todo-rw">' + rw + '</span>' : '');
      var b = document.createElement(tag); b.className = 'g-todo-btn'; b.innerHTML = inner;
      if (href) b.href = href; else b.type = 'button';
      b.setAttribute('aria-label', lab + (it.done ? ' · ' + t('todo.done') : ''));
      if (it.kind === 'qt_amen') b.addEventListener('click', function () { if (H.qt) openQt(); else toast(t('qt.none')); });
      else if (it.kind === 'login') b.addEventListener('click', function () { toast(it.done ? t('todo.login.done') : t('todo.login.todo')); });
      else if (it.kind === 'water') b.addEventListener('click', function () { if (it.done) toast(t('water.done.msg')); else doWater(); });
      else if (it.kind.indexOf('worship') === 0) b.addEventListener('click', function () { var bn = $('gBanner'); if (bn && !bn.hidden) bn.click(); else toast(t('todo.worship.none')); });
      li.appendChild(b); ul.appendChild(li);
    });
  }
  /* 주일학교 인증(어린이 본인·보호자): 오늘 QT · 이번 주 필사 · 이번 주 미션 중 아직 안 한 것만 — 누르면 대시보드 인증 칸으로 */
  function ssTasks(rules) {
    var ss = H.state && H.state.ss, out = []; if (!ss || !ss.kids) return out;
    var ms = ss.mission;
    ss.kids.forEach(function (k) {
      var who = k.self ? '' : k.name, href = k.self ? 'dashboard.html' : 'dashboard.html#kids';
      function add(kind, label, talent, sub) {
        var r = rules[kind] || {};
        out.push({ kind: kind, label: label + (who ? ' · ' + who : ''), sub: sub || '', href: href, done: false, talent: +talent || 0, xp: r.xp | 0, rule: r });
      }
      if (!k.qt) add('ss_qt', t('todo.ss.qt'), ss.qt_talent);
      if (!k.pilsa) add('ss_pilsa', t('todo.ss.pilsa'), ss.pilsa_talent, t('todo.ss.week'));
      if (ms) {
        var dd = ms.daily_days | 0, n = k.mission_n | 0;
        var need = dd > 0 ? (n < dd && !k.mission_today) : n === 0;
        if (need) add('ss_mission', t('todo.ss.mission'), ms.talent, ms.title + (dd > 0 ? ' · ' + t('todo.ss.daily', { n: n, d: dd }) : ''));
      }
    });
    return out;
  }
  function setWeather(wx, phase) {
    var chip = $('gWx'); if (!chip) return;
    if (!wx) { chip.hidden = true; return; }
    var w = SCENE.weatherOf(wx.code), ic = (w === 'clear' && phase === 'night') ? WX_ICON.night : WX_ICON[w];
    $('gWxIc').textContent = ic || '';
    $('gWxText').textContent = (wx.temp != null ? Math.round(wx.temp) + '°' : '') + ' ' + t('wx.' + w);
    chip.setAttribute('aria-label', t('wx.label', { w: t('wx.' + w), temp: wx.temp != null ? Math.round(wx.temp) : '' }));
    chip.hidden = false;
  }

  /* ── 서재: 오늘의 큐티 ── */
  function loadQt() {
    var today = I.todayStr();
    show($('gQtLoading'), true); show($('gQtEmpty'), false); show($('gQtCard'), false);
    return SDK.qtToday(today).then(function (q) {
      show($('gQtLoading'), false);
      if (!q) { show($('gQtEmpty'), true); return; }
      H.qt = q; H.qtDate = String(q.sermon_date || today).slice(0, 10); H.rankMsg = '';
      var isToday = H.qtDate === today, badge = (isToday ? t('qt.badge.today') : t('qt.badge.recent')) + ' · ' + H.qtDate.replace(/-/g, '.');
      $('gQtBadge').textContent = badge; $('gQtTitle').textContent = q.title || ''; $('gQtRef').textContent = q.scripture || '';
      $('gmQtBadge').textContent = badge; $('gmQtTitle').textContent = q.title || t('qt.title'); $('gmQtRef').textContent = q.scripture || '';
      show($('gQtCard'), true);
      var lb = $('gQtListen');
      if (!(window.WPCTts && window.WPCTts.supported && window.WPCQtText)) lb.hidden = true;
      else {
        lb.hidden = false;
        var readText = window.WPCQtText.readTextFromRow(q), preText = [q.title || '', q.scripture || ''].filter(Boolean).join(' ');
        lb.onclick = function () { window.WPCTts.toggle(readText, lb, t('qt.listen'), { date: H.qtDate, trackEl: $('gmQtBody'), preText: preText }); };
      }
      return SDK.amenState(H.qtDate).then(function (done) { H.amenDone = !!done; renderQtDone(); renderTodo(); }).catch(function () { });
    }).catch(function () { show($('gQtLoading'), false); show($('gQtEmpty'), true); });
  }
  function renderQtDone() { var d = $('gQtDone'); if (!d) return; d.hidden = !H.amenDone; d.textContent = t('qt.amen.done'); }
  function bibleHTML(text) {
    return String(text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (ln) {
      var m = ln.match(/^(\d+)\s*(.*)$/);
      return m ? '<div class="g-verse"><span class="g-vn">' + m[1] + '</span><span>' + esc(m[2]) + '</span></div>' : '<div class="g-verse"><span>' + esc(ln) + '</span></div>';
    }).join('');
  }
  function paraHTML(text) {
    var s = String(text || ''); if (!s.trim()) return '';
    if (/<[a-z][\s\S]*>/i.test(s)) return s;   /* 관리자가 쓴 서식(HTML) 원고는 대시보드와 같게 그대로 */
    return s.split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }

  /* ── 큐티 팝업(데스크톱: 캐릭터 오른쪽 말풍선 / 폰: 시트) ── */
  var qtRec = null;
  function openQt() {
    if (!H.qt || qtRec) return;
    var q = H.qt;
    $('gmQtBody').innerHTML =
      (q.qt_bible_text ? '<div class="g-bible">' + bibleHTML(q.qt_bible_text) + '</div>' : '') +
      (q.content ? '<h3 class="g-qh">' + esc(t('qt.meditation')) + '</h3><div class="g-qb">' + paraHTML(q.content) + '</div>' : '') +
      (q.prayer ? '<h3 class="g-qh">' + esc(t('qt.prayer')) + '</h3><div class="g-qb">' + paraHTML(q.prayer) + '</div>' : '');
    renderAmen();
    var box = $('gmQt').querySelector('.g-mbox'), ro = null;
    if (window.ResizeObserver) { try { ro = new ResizeObserver(function () { positionQt(); }); } catch (e) { ro = null; } }
    qtRec = openModal('gmQt', { onClose: function () { qtRec = null; window.removeEventListener('resize', positionQt); if (ro) ro.disconnect(); } });
    positionQt(); requestAnimationFrame(positionQt); setTimeout(positionQt, 350);
    window.addEventListener('resize', positionQt);
    if (ro) ro.observe(box);
  }
  function positionQt() {
    var m = $('gmQt'), box = m && m.querySelector('.g-mbox'); if (!box || m.hidden) return;
    if (window.innerWidth <= 760) { box.style.left = ''; box.style.top = ''; box.classList.remove('is-bubble'); return; }
    box.classList.add('is-bubble');                       /* 먼저 말풍선 크기로 바꾼 뒤 잰다 */
    var a = SCENE.anchors().bubble, p = SCENE.project(a.x, a.y);
    var w = box.offsetWidth || 440, h = box.offsetHeight || 420;
    var left = Math.round(Math.min(Math.max(8, p.x), window.innerWidth - w - 8));
    var top = Math.round(Math.min(Math.max(80, p.y - 24), Math.max(8, window.innerHeight - h - 8)));
    if (box.style.left !== left + 'px') box.style.left = left + 'px';
    if (box.style.top !== top + 'px') box.style.top = top + 'px';
  }
  function renderAmen() {
    var box = $('gmAmen'); if (!box) return;
    if (H.amenDone) {
      box.innerHTML = '<div class="g-amen-done">' + esc(H.rankMsg || t('amen.done')) + '</div>';
      if (!H.rankMsg) SDK.amenRank(H.qtDate).then(function (rank) { if (rank) { H.rankMsg = t('amen.rank', { n: I.fmtNum(rank) }); var d = box.querySelector('.g-amen-done'); if (d) d.textContent = H.rankMsg; } });
      return;
    }
    box.innerHTML = '<label class="g-amen-row"><input type="checkbox" id="gAmenChk"><span>' + esc(t('amen.label')) + '</span></label><p class="g-amen-err" id="gAmenErr" hidden></p>';
    var chk = $('gAmenChk'), busy = false;
    chk.addEventListener('change', function () {
      if (!chk.checked || busy) return;
      busy = true; chk.disabled = true; box.classList.add('is-busy');
      SDK.amen(H.qtDate).then(function () {
        H.amenDone = true; H.doneKinds.qt_amen = true;
        renderAmen(); renderQtDone(); renderTodo(); toast(t('amen.saved'));
        return SDK.sync().then(applySync).catch(function () { });
      }).catch(function (e) {
        chk.disabled = false; chk.checked = false; busy = false; box.classList.remove('is-busy');
        var err = $('gAmenErr'); err.textContent = SDK.notReady(e) ? t('amen.err.table') : t('amen.err.save'); err.hidden = false;
      });
    });
  }

  /* ── 창고(원장 30건씩) ── */
  var store = { offset: 0, total: 0, busy: false, rec: null };
  function openStore() {
    if (store.rec) return;
    var g = garden();
    var isWallet = !!(H.state && H.state.wallet);
    $('gmStoreTitle').textContent = t(isWallet ? 'wallet.title' : 'store.title');
    if ($('gmStoreSub')) $('gmStoreSub').textContent = t(isWallet ? 'wallet.sub' : 'store.sub');
    var top = $('gmWalletTop'); if (top) { top.innerHTML = ''; show(top, isWallet); }
    if (isWallet && top) loadWallet(top);
    $('gmStoreNum').textContent = fmtTal(g.talent_balance); $('gmStoreUnit').textContent = H.talentLabel;
    $('gmStoreList').innerHTML = ''; $('gmStoreTotal').textContent = '';
    store.offset = 0; store.total = 0; show($('gmStoreEmpty'), false); show($('gmStoreMore'), false);
    store.rec = openModal('gmStore', { onClose: function () { store.rec = null; } });
    loadMore();
  }
  function loadWallet(top) {
    top.innerHTML = '<p class="g-empty">' + esc(t('store.loading')) + '</p>';
    SDK.wallet().then(function (w) {
      if (!w || !w.ok) throw new Error('wallet');
      setTalent(w.balance);
      var L = H.talentLabel;
      var sum = '<div class="g-wl-sum"><div><span>' + esc(t('wallet.earned')) + '</span><b>' + esc(fmtTal(w.earned)) + '</b></div>' +
        '<div><span>' + esc(t('wallet.spent')) + '</span><b>' + esc(fmtTal(w.spent)) + '</b></div>' +
        '<div><span>' + esc(t('wallet.month')) + '</span><b>' + esc(fmtTal(w.month)) + '</b></div></div>';
      var rules = (w.rules || []).map(function (r) {
        var v = r.kind === 'edu_done' ? t('wallet.rule.edu') : r.kind === 'ss_talent' ? t('wallet.rule.ss') : (+r.talent ? '+' + fmtTal(r.talent) + ' ' + L : '');
        if (+r.xp) v += (v ? ' · ' : '') + t('wallet.rule.xp', { n: r.xp });
        return '<li><span>' + esc(label(r.label) || r.kind) + (r.daily_cap ? ' <small>' + esc(t('wallet.cap', { n: r.daily_cap })) + '</small>' : '') + '</span><b>' + esc(v) + '</b></li>';
      }).join('');
      var by = (w.by_kind || []).map(function (k) {
        var v = (+k['in'] ? '+' + fmtTal(k['in']) : '') + (+k.out ? (+k['in'] ? ' / ' : '') + '−' + fmtTal(k.out) : '');
        return '<li><span>' + esc(k.label) + ' <small>' + esc(t('wallet.n', { n: k.n })) + '</small></span><b class="' + (+k['in'] >= +k.out ? 'is-in' : 'is-out') + '">' + esc(v) + '</b></li>';
      }).join('');
      top.innerHTML = sum +
        '<details class="g-wl-box" open><summary>' + esc(t('wallet.rules')) + '</summary><p class="g-wl-note">' + esc(t('wallet.xp.note', { n: w.xp_day || 10 })) + '</p><ul class="g-wl-list">' + rules + '</ul></details>' +
        (by ? '<details class="g-wl-box"><summary>' + esc(t('wallet.by')) + '</summary><ul class="g-wl-list">' + by + '</ul></details>' : '') +
        '<h3 class="g-wl-h">' + esc(t('wallet.history')) + '</h3>';
    }).catch(function () { top.innerHTML = ''; });
  }
  function loadMore() {
    if (store.busy) return;
    store.busy = true;
    var btn = $('gmStoreMore'), empty = $('gmStoreEmpty');
    btn.disabled = true; btn.textContent = t('store.loading'); show(btn, true);
    SDK.history(30, store.offset).then(function (r) {
      var rows = (r && r.rows) || [], rules = rulesMap();
      store.total = (r && r.total) | 0;
      rows.forEach(function (row) { appendRow(row, rules); });
      store.offset += rows.length;
      empty.textContent = t('store.empty'); show(empty, store.offset === 0);
      $('gmStoreTotal').textContent = store.total ? t('store.total', { n: I.fmtNum(store.total), shown: I.fmtNum(store.offset) }) : '';
      show(btn, store.offset < store.total);
    }).catch(function (e) {
      empty.textContent = SDK.notReady(e) ? t('store.notready') : t('store.err'); show(empty, store.offset === 0); show(btn, false);
    }).then(function () { store.busy = false; btn.disabled = false; btn.textContent = t('store.more'); });
  }
  function appendRow(row, rules) {
    var li = document.createElement('li'); li.className = 'g-led';
    var when = row.at ? I.fmtDate(new Date(row.at)) : '';
    li.innerHTML = '<span class="g-led-k">' + esc(kindLabel(row.kind, rules)) + '</span><span class="g-led-d">' + esc(when) + '</span>' +
      '<span class="g-led-x">' + ((row.xp | 0) ? '+' + esc(I.fmtNum(row.xp | 0)) + ' XP' : '') + '</span>' +
      '<span class="g-led-t">' + ((+row.talent || 0) ? ((row.talent > 0 ? '+' : '') + esc(fmtTal(row.talent)) + ' ' + esc(H.talentLabel)) : '') + '</span>';
    $('gmStoreList').appendChild(li);
  }

  /* ── 첫 심기(온보딩): 1 닉네임·아바타 → 2 씨앗·이름 ── */
  var ob = { step: 1, avatar: 'a', species: '', rec: null, busy: false, resolve: null, planted: null, mode: 'plant', savedAvatar: '' };
  function pickAvatar(me) {
    ob.choices = avatarChoices(me);
    ob.avatar = me.avatar_key || avatarKeyOf(me.avatar_url) || ob.choices[0];
    if (ob.choices.indexOf(ob.avatar) < 0) ob.avatar = AV_LEGACY[ob.avatar] && ob.choices.indexOf(AV_LEGACY[ob.avatar]) >= 0 ? AV_LEGACY[ob.avatar] : ob.choices[0];
  }
  /* 모습 바꾸기 — 첫 심기 창의 1단계(이름·모습)만 열어 저장한다. 저장 없이 닫으면 원래 모습으로 되돌린다 */
  function openProfile() {
    if (ob.rec || !H.state) return;
    var me = H.state.me || {};
    ob.mode = 'profile'; ob.busy = false; ob.resolve = null;
    pickAvatar(me); ob.savedAvatar = me.avatar_key || ob.avatar;
    $('gObNick').value = String(me.nickname || '').slice(0, 20);
    renderAvatars();
    $('gObErr').hidden = true;
    showStep(1);
    ob.rec = openModal('gmPlant', { initialFocus: '#gObNick', onClose: function () {
      ob.rec = null;
      if (ob.mode === 'profile') SCENE.setCharacter((H.state && H.state.me && H.state.me.avatar_key) || ob.savedAvatar, { nickname: (H.state && H.state.me && H.state.me.nickname) || '' });
      ob.mode = 'plant';
    } });
  }
  function openOnboarding(st) {
    return new Promise(function (resolve) {
      if (ob.rec) { resolve(null); return; }
      ob.mode = 'plant'; ob.resolve = resolve; ob.planted = null; ob.busy = false;
      var me = (st && st.me) || {};
      pickAvatar(me);
      $('gObNick').value = String(me.nickname || '').slice(0, 20);
      renderAvatars();
      var list = speciesList();
      ob.species = list[0].slug;
      $('gObSeeds').innerHTML = list.map(function (s) {
        var desc = I.has('species.' + s.slug + '.desc') ? t('species.' + s.slug + '.desc') : '';
        return '<button type="button" class="g-seed" role="radio" data-sp="' + esc(s.slug) + '" aria-checked="false"><span class="g-seed-ic" aria-hidden="true">' + (SEED_ICON[s.slug] || '🌱') + '</span><b>' + esc(label(s.name) || speciesName(s.slug)) + '</b>' + (desc ? '<small>' + esc(desc) + '</small>' : '') + '</button>';
      }).join('');
      Array.prototype.forEach.call($('gObSeeds').querySelectorAll('.g-seed'), function (b) {
        b.addEventListener('click', function () { selectSeed(b.getAttribute('data-sp')); });
      });
      selectSeed(ob.species, true);
      $('gObErr').hidden = true;
      showStep(1);
      ob.rec = openModal('gmPlant', { initialFocus: '#gObNick', onClose: function () { ob.rec = null; var r = ob.resolve; ob.resolve = null; if (r) r(ob.planted); } });
    });
  }
  function renderAvatars() {
    var wrap = $('gObAvatars');
    var keys = ob.choices || ['a', 'b', 'c'];
    wrap.innerHTML = keys.map(function (k, i) {
      var src = SCENE.asset('chars/char-' + k + '.webp');
      var name = k === 'pastor' ? t('onboard.avatar.pastor') : (I.has('onboard.avatar.' + k) ? t('onboard.avatar.' + k) : t('onboard.avatar.n', { n: i + 1 }));
      /* 얼굴이 보이게 전신 그림의 윗부분을 둥근 칸에 크게 — 그림이 없으면 예전 색 동그라미 */
      var face = src ? '<span class="g-av-face" style="background-image:url(&quot;' + esc(src) + '&quot;)"></span>' : '<i></i>';
      return '<button type="button" class="g-av g-av-' + esc(k) + (src ? ' has-img' : '') + (k === ob.avatar ? ' is-on' : '') + '" role="radio" aria-checked="' + (k === ob.avatar) + '" data-key="' + esc(k) + '" aria-label="' + esc(name) + '" title="' + esc(name) + '">' + face + '</button>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('.g-av'), function (b) {
      b.addEventListener('click', function () {
        ob.avatar = b.getAttribute('data-key');
        Array.prototype.forEach.call(wrap.querySelectorAll('.g-av'), function (x) { var on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); });
        SCENE.setCharacter(ob.avatar, { nickname: $('gObNick').value });
      });
    });
  }
  function selectSeed(slug, init) {
    var prev = ob.species; ob.species = slug;
    Array.prototype.forEach.call($('gObSeeds').querySelectorAll('.g-seed'), function (x) { var on = x.getAttribute('data-sp') === slug; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', String(on)); });
    var nameEl = $('gObName');
    if (init || !nameEl.value || nameEl.value === speciesName(prev)) nameEl.value = speciesName(slug).slice(0, 12);
    SCENE.setPlant(slug, 0, { animate: !init });
  }
  function showStep(n) {
    ob.step = n;
    show($('gObStep1'), n === 1); show($('gObStep2'), n === 2);
    var prof = ob.mode === 'profile';
    $('gmPlantTitle').textContent = prof ? t('profile.title') : t(n === 1 ? 'onboard.step1.title' : 'onboard.step2.title');
    $('gObStepNum').textContent = prof ? '' : t('onboard.step', { n: n, total: 2 });
    $('gObNext').textContent = prof ? t('profile.save') : t('onboard.next');
    setTimeout(function () { try { (n === 1 ? $('gObNick') : $('gObName')).focus({ preventScroll: true }); } catch (e) { } }, 30);
  }
  function bindOnboarding() {
    $('gObNext').addEventListener('click', function () {
      var nick = $('gObNick').value.trim();
      if (!nick || nick.length > 20) { $('gObErr').textContent = t('onboard.err.nick'); $('gObErr').hidden = false; $('gObNick').focus(); return; }
      $('gObErr').hidden = true; SCENE.setCharacter(ob.avatar, { nickname: nick });
      if (ob.mode !== 'profile') { showStep(2); return; }
      if (ob.busy) return;                                         /* 모습 바꾸기: 저장하고 닫는다 (이중 저장 막기) */
      ob.busy = true;
      var btn = $('gObNext'); btn.disabled = true; btn.textContent = t('profile.saving');
      SDK.setProfile({ nickname: nick, avatar_key: ob.avatar })
        .then(function (r) {
          if (!r || r.ok === false) throw new Error((r && r.why) || 'profile');
          if (H.state) { H.state.me = r.me || H.state.me || {}; H.state.me.nickname = nick; H.state.me.avatar_key = ob.avatar; SDK.saveState(H.state); }
          ob.mode = 'saved'; closeModal(ob.rec); renderRail(); toast(t('profile.done'));
        })
        .catch(function (e) { var err = $('gObErr'); err.textContent = SDK.notReady(e) ? t('onboard.err.notready') : t('onboard.err.save'); err.hidden = false; })
        .then(function () { ob.busy = false; btn.disabled = false; btn.textContent = ob.mode === 'profile' ? t('profile.save') : t('onboard.next'); });
    });
    if ($('gProfileBtn')) $('gProfileBtn').addEventListener('click', openProfile);
    $('gObNick').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('gObNext').click(); } });
    $('gObBack').addEventListener('click', function () { showStep(1); });
    $('gObName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('gObPlant').click(); } });
    $('gObPlant').addEventListener('click', function () {
      if (ob.busy) return;
      var nick = $('gObNick').value.trim().slice(0, 20), name = $('gObName').value.trim().slice(0, 12) || speciesName(ob.species).slice(0, 12);
      if (!ob.species) return;
      ob.busy = true;
      var btn = $('gObPlant'), orig = t('onboard.plant'); btn.disabled = true; btn.textContent = t('onboard.planting'); $('gObErr').hidden = true;
      SDK.setProfile({ nickname: nick, avatar_key: ob.avatar })   /* 캐릭터는 키(a/b/c)로 저장 — avatar_url 은 https 사진용 */
        .then(function (r) { if (r && r.ok === false) throw new Error(r.why || 'profile'); if (r && r.me && H.state) H.state.me = r.me; return SDK.setPlant(ob.species, name); })
        .then(function (r) {
          if (!r || r.ok === false) throw new Error((r && r.why) || 'plant');
          if (r.state) { H.state = r.state; SDK.saveState(H.state); }
          else if (H.state) { H.state.garden = H.state.garden || {}; H.state.garden.species = ob.species; H.state.garden.plant_name = name; H.state.garden.chosen_at = new Date().toISOString(); }
          if (H.state && H.state.me) { H.state.me.nickname = nick; H.state.me.avatar_key = ob.avatar; }
          ob.planted = { species: ob.species, name: name, nickname: nick, avatar: ob.avatar };
          closeModal(ob.rec);
          syncPlot(true); renderRail();
          toast(t('onboard.done', { name: name }));
        })
        .catch(function (e) {
          var err = $('gObErr'); err.textContent = SDK.notReady(e) ? t('onboard.err.notready') : t('onboard.err.save'); err.hidden = false;
        })
        .then(function () { ob.busy = false; btn.disabled = false; btn.textContent = orig; });
    });
  }

  /* ── 예배 띠 (modu/worship-banner.js 의 SCHED/tick 이식, 교회 시간대 시계) ── */
  var BN = { cur: null, okCache: {}, timer: 0, loading: null };
  function sched() {
    var D = I.db;
    return [
      { kind: 'dawn', label: t('svc.dawn'), time: t('svc.dawn.time'), days: [1, 2, 3, 4, 5, 6], from: 4 * 60 + 30, to: 6 * 60, lead: 30, cal: D.cal_dawn, svc: D.svc_dawn },
      { kind: 'wed', label: t('svc.wed'), time: t('svc.wed.time'), days: [3], from: 11 * 60, to: 12 * 60, lead: 60, cal: D.cal_wed, svc: D.svc_wed },
      { kind: 'sunday', part: 1, label: t('svc.sun1'), time: t('svc.sun1.time'), days: [0], from: 9 * 60 + 20, to: 10 * 60 + 40, lead: 200, cal: '', svc: D.svc_sun1 },
      { kind: 'sunday', part: 2, label: t('svc.sun2'), time: t('svc.sun2.time'), days: [0], from: 11 * 60, to: 12 * 60 + 30, lead: 30, cal: '', svc: D.svc_sun2 }
    ];
  }
  function sundayBulletin(date) { var B = window.BULLETINS; if (!Array.isArray(B)) return null; for (var i = 0; i < B.length; i++) if (B[i] && B[i].date === date) return B[i]; return null; }
  function combinedSunday(date) {
    var b = sundayBulletin(date); if (!b) return false;
    if (b.combined === true || b.combined === false) return b.combined;
    var txt = (b.news || []).map(function (n) { return (n.title || '') + ' ' + (n.detail || ''); }).join(' ') + ' ' + (b.note || '') + ' ' + (b.notice || '');
    return new RegExp(I.db.combined_re).test(txt);
  }
  function applySunday(L, comb) {
    var p1 = L[2], p2 = L[3];
    p1.days = comb ? [] : [0];
    p2.single = !!comb; p2.label = comb ? t('svc.sun') : t('svc.sun2'); p2.lead = comb ? 200 : 30; p2.svc = comb ? I.db.svc_sun : I.db.svc_sun2;
  }
  function pname(sc) { return sc.kind === 'sunday' && !sc.single && sc.part ? t('svc.part', { n: sc.part }) + ' ' : ''; }
  function joined(date) { try { return localStorage.getItem('ws_joined_' + date); } catch (e) { return null; } }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function showBanner(title, count, state, sc) {
    var b = $('gBanner'); if (!b) return;
    $('gBnT').textContent = title; $('gBnC').textContent = count || '';
    b.dataset.state = state; b.dataset.kind = sc.kind; b.dataset.part = sc.part ? String(sc.part) : ''; b.dataset.svc = sc.svc || '';
    b.classList.toggle('is-live', state === 'live'); b.hidden = false; BN.cur = sc;
    document.body.classList.add('g-has-banner');
  }
  function hideBanner() { var b = $('gBanner'); if (b) b.hidden = true; BN.cur = null; document.body.classList.remove('g-has-banner'); }
  function tick() {
    var n = I.nowParts(), dow = n.dow, date = n.date, sec = n.hh * 3600 + n.mm * 60 + n.ss;
    var L = sched(), pick = null, sc, i;
    if (dow === 0) applySunday(L, combinedSunday(date));
    var jn = joined(date);
    if (H.svcForce) {
      sc = dow === 0 ? L[3] : L[0];
      pick = { sc: sc, left: H.svcForce === 'soon' ? 25 * 60 : (H.svcForce === 'day' ? 4 * 3600 : 0), live: H.svcForce === 'live', day: H.svcForce === 'day' };
    } else {
      for (i = 0; i < L.length; i++) {
        sc = L[i];
        if (sc.days.indexOf(dow) < 0) continue;
        var left = sc.from * 60 - sec;
        if (sc.kind === 'sunday' && sc.part === 1 && !jn && sc.days.length) { var p2 = L[i + 1], l2 = p2.from * 60 - sec; if (l2 > 600 && l2 <= p2.lead * 60) { pick = { sc: p2, left: l2, live: false }; break; } }
        if (sec >= (sc.from - 10) * 60 && sec <= (sc.to + 10) * 60) { pick = { sc: sc, left: left, live: true }; break; }
        if (sc.kind === 'sunday' && sc.part === 2 && !sc.single && jn) continue;
        if (left > 600 && left <= sc.lead * 60) { pick = { sc: sc, left: left, live: false }; break; }
      }
    }
    if (!pick) { hideBanner(); return; }
    sc = pick.sc;
    var key = date + '|' + sc.cal;
    if (!H.svcForce && sc.cal) {
      if (BN.okCache[key] === undefined) { BN.okCache[key] = null; SDK.hasSermon(date, sc.cal).then(function (ok) { BN.okCache[key] = ok; tick(); }); }
      if (!BN.okCache[key]) { hideBanner(); return; }
    }
    if (pick.live) { showBanner(sc.kind === 'sunday' ? t('banner.live.sun', { part: pname(sc) }) : t('banner.live', { label: sc.label }), sc.kind === 'sunday' ? t('banner.join.sun', { part: pname(sc) }) : t('banner.open'), 'live', sc); return; }
    var l = pick.left, soon = !(sc.kind === 'sunday' && (sc.part === 1 || sc.single)) || l <= 3600;
    if (pick.day || !soon) { showBanner(t('banner.sunday'), sc.label + ' ' + sc.time, 'day', sc); return; }
    var h = Math.floor(l / 3600), m = Math.floor(l % 3600 / 60), s = l % 60;
    showBanner(t('banner.soon', { label: sc.kind === 'sunday' ? pname(sc) + t('svc.word') : sc.label }), (h ? h + ':' : '') + pad(m) + ':' + pad(s), 'soon', sc);
  }
  function startBanner(force) {
    H.svcForce = /^(live|soon|day)$/.test(force || '') ? force : '';
    clearInterval(BN.timer); tick(); BN.timer = setInterval(tick, 1000);
  }
  function doAttend(svc) {
    if (!SDK.session()) { toast(t('attend.login')); return; }
    SDK.attend(svc).then(function (j) {
      if (!j) return;
      if (j.ok && !j.already) toast(j.late ? t('attend.ok.late', { svc: svc, min: j.late_min }) : t('attend.ok', { svc: svc }));
      else if (j.ok && j.already) toast(t('attend.already', { svc: svc }));
      else if (j.why === 'member') toast(t('attend.member'));
      if (j.ok) { H.doneKinds[I.nowParts().dow === 0 ? 'worship_sunday' : 'worship_weekday'] = true; renderTodo(); SDK.sync().then(applySync).catch(function () { }); }
    }).catch(function () { });
  }
  function loadOne(src, css) {
    return new Promise(function (res, rej) {
      var base = src.split('?')[0];
      if (css) { if (document.querySelector('link[href^="' + base + '"]')) return res(); var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = src; l.onload = res; l.onerror = rej; document.head.appendChild(l); return; }
      if (document.querySelector('script[src^="' + base + '"]')) return res();
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.body.appendChild(s);
    });
  }
  function loadBundle() {
    if (BN.loading) return BN.loading;
    var p = Promise.all(BUNDLE_CSS.map(function (c) { return loadOne(c, true); }));
    BUNDLE_JS.forEach(function (src) { p = p.then(function () { return loadOne(src, false); }); });
    BN.loading = p.catch(function (e) { BN.loading = null; throw e; });
    return BN.loading;
  }
  function openWorship(kind) {
    var b = $('gBanner'); if (b) b.classList.add('is-busy');
    return loadBundle().then(function () {
      if (b) b.classList.remove('is-busy');
      if (window.WPCWorship && WPCWorship.open) WPCWorship.open(kind); else toast(t('worship.err'));
    }).catch(function () { if (b) b.classList.remove('is-busy'); toast(t('worship.err')); });
  }
  function bindBanner() {
    var b = $('gBanner'); if (!b) return;
    b.addEventListener('click', function (e) {
      e.preventDefault();
      var sc = BN.cur; if (!sc) return;
      var st = b.dataset.state, date = I.nowParts().date;
      if (st === 'live') {
        if (b.dataset.part) { try { localStorage.setItem('ws_joined_' + date, b.dataset.part); } catch (x) { } }
        doAttend(sc.svc);
      }
      openWorship(sc.kind);
    });
  }

  /* ── 하단 바 ── */
  function bindBar() {
    Array.prototype.forEach.call(document.querySelectorAll('#gBar .g-tab[data-tab]'), function (b) {
      b.addEventListener('click', function () {
        var tab = b.getAttribute('data-tab');
        if (tab === 'mine') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        toast(t('bar.soon', { what: t('bar.' + tab) }));
      });
    });
  }

  /* ── 안내판(gate) ── */
  function showGate(kind, o) {
    o = o || {};
    var g = $('gGate'); if (!g) return;
    $('gGateT').textContent = t('gate.' + kind + '.t'); $('gGateM').textContent = o.msg || t('gate.' + kind + '.m');
    var acts = $('gGateActions'); acts.innerHTML = '';
    function add(tag, cls, text, fn, href) { var b = document.createElement(tag); b.className = 'g-btn ' + cls; b.textContent = text; if (href) b.href = href; else b.type = 'button'; if (fn) b.addEventListener('click', fn); acts.appendChild(b); return b; }
    if (kind === 'login') add('button', 'g-btn-primary', t('gate.login.btn'), function () { var lb = document.getElementById('loginBtnInit') || document.querySelector('#authSlot .auth-btn'); if (lb) lb.click(); else location.href = 'account.html'; });
    if (kind === 'error') add('button', 'g-btn-primary', t('gate.retry'), o.retry);
    if (kind !== 'signing') add('a', 'g-btn-line', t('gate.home'), null, 'home.html?home=1');
    g.hidden = false; $('gRoot').setAttribute('data-mode', 'gate');
  }
  function hideGate() { var g = $('gGate'); if (g) g.hidden = true; $('gRoot').setAttribute('data-mode', 'garden'); }

  /* ── 장면의 내 자리 ── */
  function syncPlot(animate) {
    var st = H.state || {}, me = st.me || {}, g = garden();
    SCENE.setCharacter(me.avatar_key || avatarKeyOf(me.avatar_url) || 'a', { avatarUrl: me.avatar_url, nickname: me.nickname || '' });
    SCENE.setPlant(g.species, g.stage, { animate: !!animate });
    SCENE.setNameplate(g.plant_name || speciesName(g.species), stageName(g.species, g.stage));
  }

  /* ── 동기화 결과 적용 ── */
  function applySync(r) {
    if (!r) return;
    if (r.ok === false) { if (r.why === 'login') showGate('login'); return; }
    if (r.busy && !r.state) return;
    var before = garden();
    if (r.state) { H.state = r.state; SDK.saveState(H.state); }
    var rows = r['new'] || [], today = I.todayStr();
    rows.forEach(function (row) { if (row && row.kind && (!row.at || I.dateStr(new Date(row.at)) === today)) H.doneKinds[row.kind] = true; });
    renderRail();
    var n = Math.min(rows.length, 12);
    rows.slice(0, n).forEach(function (row, i) { setTimeout(function () { SCENE.floatXp(row.xp | 0, '+' + I.fmtNum(row.xp | 0) + ' XP'); }, i * 600); });
    if (r.first && ((r.new_count | 0) || rows.length)) setTimeout(function () { toast(t('sync.first', { n: I.fmtNum((r.new_count | 0) || rows.length), xp: I.fmtNum(r.new_xp | 0) }), 4200); }, 400);
    var after = garden(), delay = n * 600 + 200;
    if (after.plants_done > before.plants_done) setTimeout(function () { toast(t('sync.harvest', { n: I.fmtNum(after.plants_done) }), 4000); }, delay);
    if (after.species === before.species && after.stage > before.stage) {
      setTimeout(function () {
        SCENE.stageUp(after.species, after.stage).then(function () {
          SCENE.setNameplate(after.plant_name || speciesName(after.species), stageName(after.species, after.stage));
          toast(t('sync.stageup', { name: after.plant_name || speciesName(after.species), stage: stageName(after.species, after.stage) }), 3600);
        });
      }, delay);
    } else if (after.species !== before.species || after.stage !== before.stage) syncPlot(false);
    else SCENE.setNameplate(after.plant_name || speciesName(after.species), stageName(after.species, after.stage));
  }

  /* ── 올리기 ── */
  function init(o) {
    I = o.i18n; SDK = o.sdk; SCENE = o.scene; t = I.t; P = o.params || {};
    I.apply(document);
    ['gmQt', 'gmStore', 'gmPlant', 'gmFarm', 'gmShop'].forEach(function (id) { if ($(id)) bindModal(id); });
    $('gTalentBtn').addEventListener('click', openStore);
    $('gQtOpen').addEventListener('click', function () { openQt(); });
    $('gmStoreMore').addEventListener('click', loadMore);
    bindOnboarding(); bindBanner(); bindBar(); bindTodoFold();
    if ($('gFruitBtn')) $('gFruitBtn').addEventListener('click', function () { fruitMode(!FR.on); renderFruitBtn(); });
    if ($('gWaterBtn')) $('gWaterBtn').addEventListener('click', doWater);
    if ($('gShopBtn')) $('gShopBtn').addEventListener('click', function () { if (window.GardenShop) window.GardenShop.open(); });
    if ($('gFarmBtn') && window.GardenFarm) $('gFarmBtn').addEventListener('click', function () { fruitMode(false); renderFruitBtn(); window.GardenFarm.open(); });
  }
  /* 오늘의 할 일 접기 — 접어 두면 다음에도 접힌 채로(이 기기에 기억) */
  function bindTodoFold() {
    var b = $('gTodoFold'), body = $('gTodoBody'); if (!b || !body) return;
    function set(open, save) {
      b.setAttribute('aria-expanded', String(open)); body.hidden = !open;
      if (save) { try { localStorage.setItem('g_todo_open', open ? '1' : '0'); } catch (e) { } }
    }
    var saved = null; try { saved = localStorage.getItem('g_todo_open'); } catch (e) { }
    set(saved !== '0', false);
    b.addEventListener('click', function () { set(b.getAttribute('aria-expanded') !== 'true', true); });
  }
  function render(state, o) {
    o = o || {};
    H.state = state; H.offline = !!o.offline;
    hideGate(); renderRail(); syncPlot(false);
  }

  return {
    init: init, render: render, state: function () { return H.state; }, setState: function (s) { H.state = s; },
    toast: toast, openModal: openModal, closeModal: closeModal, openQt: openQt, openStore: openStore, openOnboarding: openOnboarding,
    loadQt: loadQt, setWeather: setWeather, applySync: applySync, startBanner: startBanner, tickBanner: tick, showGate: showGate, hideGate: hideGate,
    syncPlot: syncPlot, renderTodo: renderTodo, garden: garden,
    setTalent: setTalent, talentLabel: function () { return H.talentLabel; }, afterWater: afterWater
  };
})();
