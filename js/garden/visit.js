/* ============================================================
   신앙 정원 — 정원 초대하기 · 이웃 정원 방문 · 방명록
   2026-10-23 담임목사: "정원 초대하기 버튼, 방문하기 버튼을 만들어주세요. 초대하기가 활성화된 사람의 정원을
     구경하러 갈 수 있습니다. 그리고 댓글도 달고 소통할 수 있도록 해주세요."
   · 초대하기: 내 정원을 열고 닫는다(garden_visit_set). 열면 주소(garden.html?visit=자리 번호)를 보내거나 복사하고, 내 방명록을 읽고 숨긴다
   · 방문하기: 정원을 연 성도 목록(garden_visit_list) → 누르면 그 정원을 입체(garden3d.js)로, 옆에 방명록(쓰기·숨기기)
   · 이웃 신청(같은 날 지시 "이웃신청하기도 만들어주세요"): 방문한 정원에서 신청 → 받은 사람이 초대 창에서 수락·거절.
     이웃끼리는 초대를 꺼도 서로 방문·방명록. 방문 목록 맨 위는 내 이웃
   · 달란트 선물(같은 날 지시 "이웃 신청한 사람에 한해 달란트를 줄 수 있도록"): 이웃 목록·이웃 정원 칸의 '선물'
   · 서버(20261023_2100 SQL)가 없으면 단추를 숨긴다. 이름은 정원 별명만 보인다(실명·연락처 없음)
   GardenVisit.init({ i18n, sdk, hud, scene, farm, base3d }) · GardenVisit.start() · GardenVisit.visit(plotNo)
   ============================================================ */
window.GardenVisit = (function () {
  'use strict';
  var I, SDK, HUD, SCENE, FARM, base3d, t;
  var V = { me: null, ok: false, inv: null, list: null };
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function avatarSrc(key, url) {
    if (url && /^https:\/\//.test(url)) return url;
    var k = String(key || 'a').toLowerCase();
    if (!/^[a-z0-9-]{1,20}$/.test(k)) k = 'a';
    return SCENE.asset('chars/char-' + k + '.webp') || SCENE.asset('chars/char-a.webp') || '';
  }
  function plantLabel(g) {
    var sp = (g && g.species) || 'sunflower', si = Math.max(0, Math.min(5, ((g && g.stage) | 0) - 1));   // 서버 단계 1부터 → 그림 0부터
    return { sp: sp, si: si, text: ((g && g.plant_name) || HUD.speciesName(sp)) + ' · ' + HUD.stageName(sp, si) };
  }
  function ago(iso) {
    var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
    if (!(s >= 0)) return '';
    if (s < 60) return t('visit.now');
    if (s < 3600) return t('visit.min', { n: Math.floor(s / 60) });
    if (s < 86400) return t('visit.hour', { n: Math.floor(s / 3600) });
    return I.fmtDate(d);
  }
  function whyText(r, e) {
    if (e) return SDK.notReady(e) ? t('visit.notready') : t('visit.err');
    var w = r && r.why;
    return w && I.has('visit.why.' + w) ? t('visit.why.' + w) : t('visit.err');
  }
  function pageUrl(plot) { return location.origin + location.pathname.replace(/[^/]*$/, '') + 'garden.html?visit=' + plot; }

  /* ── 방명록 목록(초대 창·방문 칸 같이 씀) ──
     hide 단추는 두 번 눌러야 숨긴다(첫 번째는 '숨길까요?'로 바뀌고 3초 뒤 되돌아온다) */
  function gbHtml(list) {
    if (!list || !list.length) return '';
    return list.map(function (b) {
      var a = b.author || {}, src = avatarSrc(a.avatar_key, a.avatar_url);
      return '<li class="gv-gbi' + (b.mine ? ' is-mine' : '') + '">' +
        '<span class="gv-av">' + (src ? '<img alt="" src="' + esc(src) + '">' : '') + '</span>' +
        '<div class="gv-gbt"><div class="gv-gbm"><b>' + esc(a.nickname || '') + '</b><small>' + esc(ago(b.at)) + '</small>' +
        (b.can_hide ? '<button type="button" class="gv-hide" data-id="' + esc(b.id) + '">' + esc(t('visit.gb.hide')) + '</button>' : '') + '</div>' +
        '<p>' + esc(b.body) + '</p></div></li>';
    }).join('');
  }
  function bindHide(ul, onDone) {
    ul.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.gv-hide'); if (!b || b.disabled) return;
      if (!b.classList.contains('is-arm')) {
        b.classList.add('is-arm'); b.textContent = t('visit.gb.hide2');
        setTimeout(function () { if (document.contains(b)) { b.classList.remove('is-arm'); b.textContent = t('visit.gb.hide'); } }, 3000);
        return;
      }
      b.disabled = true;
      SDK.guestbookHide(+b.getAttribute('data-id')).then(function (r) {
        if (!r || !r.ok) { b.disabled = false; HUD.toast(whyText(r)); return; }
        onDone(r.guestbook || []);
      }, function (er) { b.disabled = false; HUD.toast(whyText(null, er)); });
    });
  }

  /* ── 달란트 선물: 단추 아래에 작은 칸(금액·한 마디)을 펼친다 ── */
  function giftForm(anchor, plot, name) {
    var old = document.querySelector('.gv-gift'); if (old) old.remove();
    var bal = (HUD.garden() || {}).talent_balance || 0;
    var f = document.createElement('form'); f.className = 'gv-gift';
    f.innerHTML = '<b>' + esc(t('gift.title', { name: name || '' })) + '</b>' +
      '<div class="gv-gift-row"><label class="g-sr" for="gvGiftAmt">' + esc(t('gift.amount')) + '</label>' +
      '<input type="number" id="gvGiftAmt" min="1" step="1" value="10" inputmode="numeric"><span>' + esc(HUD.talentLabel()) + '</span></div>' +
      '<label class="g-sr" for="gvGiftNote">' + esc(t('gift.note')) + '</label><input type="text" id="gvGiftNote" maxlength="60" placeholder="' + esc(t('gift.note')) + '">' +
      '<small>' + esc(t('gift.bal', { n: I.fmtNum(Math.round(bal * 10) / 10) })) + '</small>' +
      '<div class="gv-gift-b"><button type="button" class="g-btn g-btn-line" data-x>' + esc(t('gift.cancel')) + '</button><button type="submit" class="g-btn g-btn-primary">' + esc(t('gift.send')) + '</button></div>';
    anchor.insertAdjacentElement('afterend', f);
    f.querySelector('[data-x]').addEventListener('click', function () { f.remove(); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var amt = Math.floor(+f.querySelector('#gvGiftAmt').value || 0), note = f.querySelector('#gvGiftNote').value, btn = f.querySelector('[type=submit]');
      if (amt < 1) { f.querySelector('#gvGiftAmt').focus(); return; }
      btn.disabled = true;
      SDK.gift(plot, amt, note).then(function (r) {
        btn.disabled = false;
        if (!r || !r.ok) { HUD.toast(r && r.why === 'amount' && r.max ? t('gift.why.max', { n: I.fmtNum(r.max) }) : r && r.why === 'limit' ? t('gift.why.limit', { n: I.fmtNum(r.left || 0) }) : whyText(r)); return; }
        HUD.setTalent(r.balance); f.remove();
        HUD.toast(t('gift.sent', { name: name || '', n: I.fmtNum(r.amount) }));
      }, function (er) { btn.disabled = false; HUD.toast(whyText(null, er)); });
    });
    setTimeout(function () { var a = f.querySelector('#gvGiftAmt'); a.focus(); a.select(); }, 30);
  }

  /* ── 오른쪽 메뉴 단추 ── */
  function setBadge() {
    var bd = $('gInviteBadge'), n = ((V.me && V.me.unread) | 0) + ((V.me && V.me.requests) | 0); if (!bd) return;
    bd.hidden = !n; bd.textContent = t('invite.badge', { n: n }); bd.setAttribute('aria-label', t('invite.badge.aria', { n: n }));
  }
  function start() {
    var row = $('gVisitRow'); if (!row || V.started) return;
    V.started = true;
    SDK.visitList().then(function (r) {
      if (!r || !r.ok) return;
      V.ok = true; V.me = r.me || {}; V.list = r.gardens || [];
      row.hidden = false; setBadge();
      // 받은 주소(garden.html?visit=12)로 들어오면 그 정원으로 — 주소는 한 번 쓰고 지운다
      var q = null; try { q = new URLSearchParams(location.search).get('visit'); } catch (e) { }
      if (q && /^\d{1,6}$/.test(q)) { try { history.replaceState(history.state, '', location.pathname); } catch (e) { } visit(+q); }
    }, function () { /* 서버에 기능이 아직 없으면 단추를 숨긴 채로 */ });
  }

  /* ── 초대하기 창 ── */
  function openInvite() {
    V.inv = HUD.openModal('gmInvite', { onClose: function () { V.inv = null; } });
    if (!V.inv) return;
    drawInvite();
    loadMyBook();
    loadNeighbors();
  }
  /* 이웃: 받은 신청(수락·거절) · 내 이웃(방문·끊기) · 보낸 신청(취소) */
  function loadNeighbors() {
    var box = $('gvNb'); if (!box || !SDK.neighborList) return;
    SDK.neighborList().then(function (r) { if (r && r.ok) drawNeighbors(r); }, function () { box.innerHTML = ''; });
  }
  function nbRow(n, acts) {
    var src = avatarSrc(n.avatar_key, n.avatar_url);
    return '<li class="gv-nbi" data-id="' + esc(n.id) + '" data-plot="' + esc(n.plot_no) + '"><span class="gv-av">' + (src ? '<img alt="" src="' + esc(src) + '">' : '') + '</span>' +
      '<span class="gv-nbt"><b>' + esc(n.nickname) + (n.family ? ' <span class="gv-fam">' + esc(t('nb.family')) + '</span>' : '') + '</b>' + (n.species ? '<small>' + esc(plantLabel(n).text) + '</small>' : '') + '</span><span class="gv-nba">' + acts + '</span></li>';
  }
  function drawNeighbors(r) {
    var box = $('gvNb'), inc = r.incoming || [], nb = r.neighbors || [], out = r.outgoing || [], h = '';
    if (V.me) { V.me.requests = inc.length; setBadge(); }
    if (inc.length) h += '<h4 class="gv-nbh">' + esc(t('nb.incoming')) + '</h4><ul class="gv-nbl">' + inc.map(function (n) {
      return nbRow(n, '<button type="button" class="g-btn g-btn-primary gv-nb-b" data-act="yes">' + esc(t('nb.accept')) + '</button><button type="button" class="g-btn g-btn-line gv-nb-b" data-act="no">' + esc(t('nb.decline')) + '</button>');
    }).join('') + '</ul>';
    h += '<h4 class="gv-nbh">' + esc(t('nb.mine')) + ' <span class="gv-n">' + (nb.length ? I.fmtNum(nb.length) : '') + '</span></h4>';
    h += nb.length ? '<ul class="gv-nbl">' + nb.map(function (n) {
      return nbRow(n, '<button type="button" class="g-btn g-btn-line gv-nb-b" data-act="go">' + esc(t('nb.go')) + '</button>' +
        (SDK.gift ? '<button type="button" class="g-btn g-btn-line gv-nb-b" data-act="gift">' + esc(t('gift.open')) + '</button>' : '') +
        (n.family ? '' : '<button type="button" class="gv-hide" data-act="cut">' + esc(t('nb.cut')) + '</button>'));   // 부부(가족)는 끊기 없음
    }).join('') + '</ul>' : '<p class="g-empty">' + esc(t('nb.none')) + '</p>';
    if (out.length) h += '<h4 class="gv-nbh">' + esc(t('nb.outgoing')) + '</h4><ul class="gv-nbl">' + out.map(function (n) {
      return nbRow(n, '<button type="button" class="gv-hide" data-act="cancel">' + esc(t('nb.cancel')) + '</button>');
    }).join('') + '</ul>';
    box.innerHTML = h;
  }
  function bindNeighbors() {
    var box = $('gvNb'); if (!box) return;
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-act]'); if (!b || b.disabled) return;
      var li = b.closest('.gv-nbi'), id = +li.getAttribute('data-id'), act = b.getAttribute('data-act');
      if (act === 'go') { if (V.inv) HUD.closeModal(V.inv); visit(+li.getAttribute('data-plot')); return; }
      if (act === 'gift') { giftForm(li, +li.getAttribute('data-plot'), (li.querySelector('.gv-nbt b') || {}).textContent); return; }
      if ((act === 'cut' || act === 'cancel') && !b.classList.contains('is-arm')) {   // 끊기·취소는 두 번 눌러야
        b.classList.add('is-arm'); b.textContent = t('nb.sure');
        setTimeout(function () { if (document.contains(b)) { b.classList.remove('is-arm'); b.textContent = t(act === 'cut' ? 'nb.cut' : 'nb.cancel'); } }, 3000);
        return;
      }
      b.disabled = true;
      var p = act === 'yes' || act === 'no' ? SDK.neighborRespond(id, act === 'yes') : SDK.neighborRemove(id);
      p.then(function (r) {
        if (!r || !r.ok) { b.disabled = false; HUD.toast(whyText(r)); return; }
        drawNeighbors(r); if (act === 'yes') HUD.toast(t('nb.accepted'));
      }, function (er) { b.disabled = false; HUD.toast(whyText(null, er)); });
    });
  }
  function drawInvite() {
    var me = V.me || {}, on = !!me.open;
    $('gvState').textContent = t(on ? 'invite.state.on' : 'invite.state.off');
    $('gvState').classList.toggle('is-on', on);
    var sw = $('gvSwitch'); sw.setAttribute('aria-pressed', String(on)); sw.textContent = t(on ? 'invite.off' : 'invite.on');
    sw.className = 'g-btn ' + (on ? 'g-btn-line' : 'g-btn-primary');
    $('gvShare').hidden = !on || !me.plot_no;
    if (me.plot_no) $('gvUrl').value = pageUrl(me.plot_no);
    $('gvSend').hidden = !navigator.share;
    $('gvPreview').hidden = !me.plot_no;
  }
  function loadMyBook() {
    var ul = $('gvMyGb'), me = V.me || {};
    if (!me.plot_no) { ul.innerHTML = ''; $('gvMyGbNone').hidden = false; return; }
    ul.innerHTML = '<li class="g-empty">' + esc(t('visit.loadingList')) + '</li>'; $('gvMyGbNone').hidden = true;
    SDK.visitView(me.plot_no).then(function (r) {
      if (!r || !r.ok) { ul.innerHTML = '<li class="g-empty">' + esc(whyText(r)) + '</li>'; return; }
      drawMyBook(r.guestbook || []);
      V.me.unread = 0; setBadge();   // 주인이 열어 보면 읽은 것으로
    }, function (e) { ul.innerHTML = '<li class="g-empty">' + esc(whyText(null, e)) + '</li>'; });
  }
  function drawMyBook(list) { $('gvMyGb').innerHTML = gbHtml(list); $('gvMyGbNone').hidden = !!list.length; }
  function bindInvite() {
    $('gvSwitch').addEventListener('click', function () {
      var b = this, want = !(V.me && V.me.open); b.disabled = true;
      SDK.visitSet(want).then(function (r) {
        b.disabled = false;
        if (!r || !r.ok) { HUD.toast(whyText(r)); return; }
        V.me.open = !!r.open; if (r.plot_no) V.me.plot_no = r.plot_no;
        drawInvite(); HUD.toast(t(r.open ? 'invite.toast.on' : 'invite.toast.off'));
      }, function (e) { b.disabled = false; HUD.toast(whyText(null, e)); });
    });
    $('gvCopy').addEventListener('click', function () {
      var inp = $('gvUrl'), done = function () { HUD.toast(t('invite.copied')); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done, function () { inp.select(); });
      else { inp.select(); try { document.execCommand('copy'); done(); } catch (e) { } }
    });
    $('gvSend').addEventListener('click', function () {
      var nick = ((HUD.state() || {}).me || {}).nickname || '';
      try { navigator.share({ title: t('invite.share.title'), text: t('invite.share.text', { name: nick }), url: $('gvUrl').value }).catch(function () { }); } catch (e) { }
    });
    $('gvPreview').addEventListener('click', function () { var p = V.me && V.me.plot_no; if (!p) return; if (V.inv) HUD.closeModal(V.inv); visit(p); });
    bindHide($('gvMyGb'), drawMyBook);
    bindNeighbors();
  }

  /* ── 방문하기 창: 정원을 연 성도 목록 ── */
  function openList() {
    var rec = HUD.openModal('gmVisit'); if (!rec) return;
    var box = $('gvList');
    box.innerHTML = '<p class="g-empty">' + esc(t('visit.loadingList')) + '</p>';
    SDK.visitList().then(function (r) {
      if (!r || !r.ok) { box.innerHTML = '<p class="g-empty">' + esc(whyText(r)) + '</p>'; return; }
      V.me = r.me || V.me; V.list = r.gardens || []; setBadge();
      if (!V.list.length) { box.innerHTML = '<p class="g-empty gv-none">' + esc(t('visit.none')) + '</p>'; return; }
      box.innerHTML = V.list.map(function (g) {
        var pl = plantLabel(g), src = avatarSrc(g.avatar_key, g.avatar_url), tree = SCENE.asset('plants/' + pl.sp + '-' + pl.si + '-s.webp') || SCENE.asset('plants/' + pl.sp + '-' + pl.si + '.webp');
        return '<button type="button" class="gv-card" data-plot="' + esc(g.plot_no) + '">' +
          '<span class="gv-sign' + (g.neighbor ? ' is-nb' : '') + '">' + esc(t(g.neighbor ? 'nb.sign' : 'visit.sign')) + '</span>' +
          '<span class="gv-pics"><span class="gv-av gv-av-lg">' + (src ? '<img alt="" src="' + esc(src) + '">' : '') + '</span>' + (tree ? '<img class="gv-tree" alt="" src="' + esc(tree) + '">' : '') + '</span>' +
          '<span class="gv-cardt"><b>' + esc(g.nickname) + '</b><small>' + esc(pl.text) + '</small>' +
          '<small class="gv-meta">' + esc(t('visit.comments', { n: I.fmtNum(g.comments | 0) })) + (g.plants_done ? ' · ' + esc(t('visit.done', { n: I.fmtNum(g.plants_done) })) : '') + '</small></span></button>';
      }).join('');
    }, function (e) { box.innerHTML = '<p class="g-empty">' + esc(whyText(null, e)) + '</p>'; });
  }
  function bindList() {
    $('gvList').addEventListener('click', function (e) {
      var c = e.target.closest && e.target.closest('.gv-card'); if (!c) return;
      var top = document.getElementById('gmVisit'); if (top && !top.hidden) { var x = top.querySelector('[data-close]'); if (x) x.click(); }
      visit(+c.getAttribute('data-plot'), c);
    });
  }

  /* ── 방문: 그 정원을 입체로 + 옆에 방명록 ──
     누른 순간 창부터 연다(휴대폰 전체 화면은 누른 순간에만 허락된다). 자료는 prep 으로 뒤에 채운다 */
  function visit(plot, opener) {
    if (!window.Garden3D || !window.Garden3D.supported() || window.Garden3D.isOpen()) return;
    var side = document.createElement('aside');
    side.className = 'gv-side'; side.setAttribute('aria-label', t('visit.gb'));
    side.innerHTML = '<div class="gv-nbbar" id="gvNbBar" hidden><span id="gvNbText"></span><button type="button" class="g-btn g-btn-primary gv-nb-b" id="gvNbBtn"></button><button type="button" class="g-btn g-btn-primary gv-nb-b" id="gvGiftBtn" hidden></button></div>' +
      '<div class="gv-side-h"><b>' + esc(t('visit.gb')) + '</b><span class="gv-n" id="gvN"></span></div>' +
      '<form class="gv-form" id="gvForm"><label class="g-sr" for="gvBody">' + esc(t('visit.gb.ph')) + '</label>' +
      '<textarea id="gvBody" maxlength="300" rows="3" placeholder="' + esc(t('visit.gb.ph')) + '"></textarea>' +
      '<div class="gv-form-row"><small id="gvCnt">0/300</small><button type="submit" class="g-btn g-btn-primary" id="gvSendBtn">' + esc(t('visit.gb.send')) + '</button></div></form>' +
      '<ul class="gv-gb" id="gvGb"></ul><p class="g-empty" id="gvGbNone" hidden>' + esc(t('visit.gb.none')) + '</p>';
    var ul = side.querySelector('#gvGb'), none = side.querySelector('#gvGbNone'), form = side.querySelector('#gvForm'), ta = side.querySelector('#gvBody'), cnt = side.querySelector('#gvCnt'), nEl = side.querySelector('#gvN');
    var view = null, ownerName = '', giftBtn = side.querySelector('#gvGiftBtn'), nbBar = side.querySelector('#gvNbBar'), nbBtn = side.querySelector('#gvNbBtn'), nbText = side.querySelector('#gvNbText'), nb = null;
    // 이웃 사이 단추: none → 신청 / sent → 신청 취소(두 번) / received → 수락 / neighbor → 단추 없음(끊기는 초대 창에서)
    function drawNb(x) {
      nb = x; if (!x || !SDK.neighborRequest) { nbBar.hidden = true; return; }
      var st = x.status || 'none';
      nbBar.hidden = false; nbBtn.disabled = false; nbBtn.classList.remove('is-arm');
      nbText.textContent = t(x.family ? 'nb.state.family' : 'nb.state.' + st);
      nbBtn.hidden = st === 'neighbor';
      giftBtn.hidden = st !== 'neighbor' || !SDK.gift; giftBtn.textContent = t('gift.open');
      nbBtn.textContent = t(st === 'sent' ? 'nb.cancel' : st === 'received' ? 'nb.accept' : 'nb.request');
      nbBtn.className = 'g-btn gv-nb-b ' + (st === 'sent' ? 'g-btn-line' : 'g-btn-primary');
    }
    giftBtn.addEventListener('click', function () { giftForm(nbBar, plot, ownerName); });
    nbBtn.addEventListener('click', function () {
      if (!nb) return;
      var st = nb.status, p;
      if (st === 'sent' && !nbBtn.classList.contains('is-arm')) { nbBtn.classList.add('is-arm'); nbBtn.textContent = t('nb.sure'); return; }
      nbBtn.disabled = true;
      if (st === 'sent') p = SDK.neighborRemove(nb.id).then(function (r) { return r && r.ok ? { ok: true, neighbor: { id: null, status: 'none' } } : r; });
      else if (st === 'received') p = SDK.neighborRespond(nb.id, true).then(function (r) { return r && r.ok ? { ok: true, neighbor: { id: nb.id, status: 'neighbor' } } : r; });
      else p = SDK.neighborRequest(plot);
      p.then(function (r) {
        if (!r || !r.ok) { nbBtn.disabled = false; HUD.toast(whyText(r)); return; }
        drawNb(r.neighbor);
        HUD.toast(t(r.neighbor.status === 'neighbor' ? 'nb.accepted' : r.neighbor.status === 'sent' ? 'nb.sent' : 'nb.cancelled'));
      }, function (er) { nbBtn.disabled = false; HUD.toast(whyText(null, er)); });
    });
    function draw(list) {
      ul.innerHTML = gbHtml(list); none.hidden = !!list.length; nEl.textContent = list.length ? I.fmtNum(list.length) : '';
      if (view) view.side(t('visit.gb.btn', { n: list.length }));
    }
    bindHide(ul, draw);
    ta.addEventListener('input', function () { cnt.textContent = ta.value.length + '/300'; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var body = ta.value.replace(/\s+/g, ' ').trim(), btn = side.querySelector('#gvSendBtn');
      if (!body) { ta.focus(); return; }
      btn.disabled = true;
      SDK.guestbookPost(plot, body).then(function (r) {
        btn.disabled = false;
        if (!r || !r.ok) { HUD.toast(whyText(r)); return; }
        ta.value = ''; cnt.textContent = '0/300'; draw(r.guestbook || []);
      }, function (er) { btn.disabled = false; HUD.toast(whyText(null, er)); });
    });
    var prep = Promise.all([SDK.visitView(plot), FARM && FARM.ready ? FARM.ready() : null]).then(function (rs) {
      var r = rs[0];
      if (!r || !r.ok) return { error: whyText(r) };
      var g = r.garden || {}, own = r.owner || {}, pl = plantLabel(g), fm = r.farm || {};
      var tiles = FARM && FARM.sceneList ? FARM.sceneList({ tiles: fm.tiles || [], water_days: fm.water_days || [], xp_day: fm.xp_day }) : [];
      var mine = (FARM && FARM.state && FARM.state()) || {}, max = mine.max || 4;
      if (r.mine && V.me) { V.me.unread = 0; setBadge(); }
      draw(r.guestbook || []);
      ownerName = own.nickname || '';
      drawNb(r.mine ? null : r.neighbor);
      return {
        title: r.mine ? t('visit.title.mine') : t('visit.title', { name: own.nickname || '' }), sub: pl.text,
        plant: { src: SCENE.asset('plants/' + pl.sp + '-' + pl.si + '.webp'), name: pl.text },
        land: { tiles: tiles, max: max }, side: side, sideLabel: t('visit.gb.btn', { n: (r.guestbook || []).length })
      };
    }, function (e) { return { error: whyText(null, e) }; });
    view = window.Garden3D.open(Object.assign(base3d(), { title: t('visit.loading'), sub: '', opener: opener || $('gVisitBtn'), prep: prep }));
  }

  function init(o) {
    I = o.i18n; SDK = o.sdk; HUD = o.hud; SCENE = o.scene; FARM = o.farm; base3d = o.base3d; t = I.t;
    if (!SDK.visitList || !$('gVisitRow')) return;
    $('gInviteBtn').addEventListener('click', openInvite);
    $('gVisitBtn').addEventListener('click', openList);
    bindInvite(); bindList();
  }
  return { init: init, start: start, visit: visit, openInvite: openInvite, openList: openList };
})();
