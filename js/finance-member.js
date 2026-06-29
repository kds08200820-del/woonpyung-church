/* finance-member.js — 내 정보(admin.html)의 "교적 인증 · 내 헌금" 섹션
 * 로그인한 회원이 이름+생년월일로 교적 인증(정/준회원) 후 본인 헌금만 조회.
 * 콘솔: [finance-member.js] v20260701bk
 */
console.log('[finance-member.js] v20260701bk');

(function () {
  var box = document.getElementById('offeringBox');
  var body = document.getElementById('offeringBody');
  if (!box || !body) return;

  var won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR'); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // 로그인 토큰이 준비될 때까지 잠깐 대기(auth.js 로딩 시차)
  var tries = 0;
  function waitLogin() {
    if (!window.FINANCE_API_URL) { box.hidden = true; return; }
    if (window.WPF && WPF.token()) { box.hidden = false; loadMe(); return; }
    if (tries++ < 20) { setTimeout(waitLogin, 400); return; }
    box.hidden = true; // 끝내 비로그인 → 섹션 숨김
  }

  function loading(msg) { body.innerHTML = '<p class="qt-loading">' + esc(msg || '확인 중입니다…') + '</p>'; }
  function errBox(msg) {
    body.innerHTML = '<p style="color:var(--accent-soft);font-size:.9rem;">' + esc(msg) + '</p>';
    var b = document.createElement('button');
    b.className = 'btn btn-line'; b.textContent = '다시 시도'; b.style.marginTop = '10px';
    b.onclick = loadMe; body.appendChild(b);
  }

  function loadMe() {
    loading();
    WPF.call('me').then(function (me) {
      if (me.status === '정회원') renderMember(me);
      else renderMatchForm(me);
    }).catch(function (e) { errBox('불러오기에 실패했습니다: ' + e.message); });
  }

  // 준회원/미인증 → 인증 폼
  function renderMatchForm(me) {
    var pending = me.status === '준회원' && me.memberName;
    body.innerHTML =
      (pending ? '<p style="color:var(--accent-soft);font-size:.92rem;margin-bottom:12px;">현재 <b>준회원</b>입니다. 교적에서 자동 인증되지 않아 관리자 승인을 기다리고 있거나, 아래에서 다시 인증할 수 있습니다.</p>' : '') +
      '<div class="form-grid">' +
      '  <div class="form-field"><label>이름</label><input type="text" id="mm_name" maxlength="40" placeholder="교적에 등록된 이름" /></div>' +
      '  <div class="form-field"><label>생년월일</label><input type="text" id="mm_birth" maxlength="10" placeholder="예: 1981-08-19" inputmode="numeric" /></div>' +
      '</div>' +
      '<div class="form-actions" style="margin-top:14px;display:flex;gap:10px;align-items:center;">' +
      '  <button type="button" class="btn btn-solid" id="mm_btn">교적 인증</button>' +
      '  <span class="profile-msg" id="mm_msg"></span>' +
      '</div>';
    document.getElementById('mm_btn').onclick = function () {
      var name = document.getElementById('mm_name').value.trim();
      var birth = document.getElementById('mm_birth').value.replace(/[^0-9]/g, '');
      var msg = document.getElementById('mm_msg');
      if (!name || birth.length !== 8) { msg.textContent = '이름과 생년월일 8자리를 정확히 입력하세요.'; msg.style.color = 'var(--accent-soft)'; return; }
      msg.style.color = 'var(--ink-soft)'; msg.textContent = '확인 중…';
      WPF.call('match', { name: name, birth: birth }).then(function (r) {
        if (r.status === '정회원') { msg.style.color = 'green'; msg.textContent = '✓ 정회원 인증 완료'; setTimeout(loadMe, 700); }
        else { msg.style.color = 'var(--accent-soft)'; msg.textContent = r.message || '교적에서 일치하는 정보를 찾지 못했습니다.'; }
      }).catch(function (e) { msg.style.color = 'var(--accent-soft)'; msg.textContent = '오류: ' + e.message; });
    };
  }

  // 정회원 → 본인 헌금 + (권한자면) 재정관리 버튼
  function renderMember(me) {
    body.innerHTML =
      '<p style="font-size:.95rem;margin-bottom:14px;">✓ <b>정회원</b>' + (me.memberName ? ' · ' + esc(me.memberName) + '님' : '') + '</p>' +
      '<div id="offeringList"><p class="qt-loading">헌금 내역을 불러오는 중…</p></div>';
    if (me.canFinance) {
      var a = document.createElement('a');
      a.className = 'btn btn-solid'; a.href = 'finance.html'; a.textContent = '재정관리 페이지로 이동 →';
      a.style.marginTop = '16px'; a.style.display = 'inline-block';
      body.appendChild(a);
    }
    loadOfferings(me);
  }

  function spouseBanner(name) {
    return name ? '<p style="background:#e8f6ee;border:1px solid #bfe3cd;color:#1e874b;padding:8px 12px;border-radius:8px;font-size:.85rem;margin-bottom:14px;">💑 배우자 <b>' + esc(name) + '</b>님과 <b>가정 헌금</b>이 합산되어 표시됩니다.</p>' : '';
  }

  // Supabase offerings 직접 조회(빠름). 본인+배우자 매칭키로 필터(권한자도 개인뷰는 본인 것만).
  function offeringsFromSupabase(me) {
    var url = window.SUPABASE_URL, ak = window.SUPABASE_ANON_KEY, tok = (window.WPF && WPF.token && WPF.token());
    var keys = [me.memberKey, me.spouseKey].filter(Boolean);
    if (!url || !ak || !tok || !keys.length) return Promise.reject(new Error('no-supabase'));
    var inlist = keys.map(function (k) { return '"' + encodeURIComponent(k) + '"'; }).join(',');
    var q = url + '/rest/v1/offerings?select=offer_date,category,service,giver,member_key,amount&member_key=in.(' + inlist + ')&order=offer_date.desc&limit=5000';
    return fetch(q, { headers: { apikey: ak, Authorization: 'Bearer ' + tok } })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); }); return r.json(); });
  }

  function loadOfferings(me) {
    var el = document.getElementById('offeringList');
    offeringsFromSupabase(me).then(function (rows) {
      var note = spouseBanner(me.spouse);
      var list = (rows || []).map(function (o) {
        return { date: o.offer_date, account: o.category || '', service: o.service || '', amount: o.amount, giver: o.giver || '',
                 who: (me.spouseKey && String(o.member_key) === String(me.spouseKey)) ? 'spouse' : 'self' };
      });
      if (!list.length) { el.innerHTML = note + '<p style="color:var(--ink-soft);font-size:.9rem;">조회된 헌금 내역이 없습니다.</p>'; return; }
      var r = { spouse: me.spouse || '', total: list.reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0) };
      renderWithFilter(el, list, r, me, note);
    }).catch(function () {
      // 폴백: 구버전 'me'(매칭키 없음)이거나 Supabase 실패 → 기존 Apps Script 경로
      WPF.call('myOfferings').then(function (r) {
        var note = spouseBanner(r.spouse);
        var list = r.offerings || [];
        if (!list.length) { el.innerHTML = note + '<p style="color:var(--ink-soft);font-size:.9rem;">조회된 헌금 내역이 없습니다.</p>'; return; }
        renderWithFilter(el, list, r, me, note);
      }).catch(function (e) {
        if (el) el.innerHTML = '<p style="color:var(--accent-soft);font-size:.9rem;">헌금 조회 실패: ' + esc(e.message) + '</p>';
      });
    });
  }

  // 날짜 방어적 정규화(서버 미정규화 대비): 'YYYY-MM-DD'
  function fmtDate(d) { return String(d == null ? '' : d).slice(0, 10); }
  function anyService(list) { return list.some(function (o) { return o.service; }); }
  function statCard(label, val, color) {
    return '<div style="flex:1;min-width:104px;background:#fff;border:1px solid #e8edf3;border-radius:12px;padding:13px 15px;"><div style="color:#7b8794;font-size:.76rem;margin-bottom:5px;">' + label + '</div><div style="font-size:1.2rem;font-weight:700;color:' + color + ';">' + val + '</div></div>';
  }

  // 헌금 1건이 본인 것인지 배우자 것인지 판별
  //  1) 실제 헌금자명(giver)이 본인/배우자 이름과 일치하면 그대로 사용 — "누가 냈나"를 가장 잘 반영
  //  2) 헌금자명이 비어있으면 서버 who('self'/'spouse', 매칭키 기준)로 판별
  //  3) 둘 다 없으면 본인으로 간주
  function whoOf(o, selfName, spouseName) {
    if (o.giver) {
      if (spouseName && o.giver === spouseName) return 'spouse';
      if (selfName && o.giver === selfName) return 'self';
    }
    if (o.who === 'self' || o.who === 'spouse') return o.who;
    return 'self';
  }

  // 부부 합산이 가능한 경우 [합산 · 본인 · 배우자] 선택을 띄우고,
  // 선택에 맞춰 같은 화면(카드·도넛·탭)을 필터링해 다시 그린다.
  function renderWithFilter(el, list, r, me, spouseNote) {
    var selfName = me.memberName || '본인';
    var spouseName = r.spouse || '';
    var hasSelf = list.some(function (o) { return whoOf(o, selfName, spouseName) === 'self'; });
    var hasSpouse = !!spouseName && list.some(function (o) { return whoOf(o, selfName, spouseName) === 'spouse'; });

    // 분리할 게 없으면(혼자 헌금) 토글 없이 기존처럼 한 번만 렌더
    if (!hasSpouse || !hasSelf) { renderOfferingView(el, list, r, me, spouseNote); return; }

    el.innerHTML =
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
      '  <button type="button" class="btn fm-who" data-w="all">합산</button>' +
      '  <button type="button" class="btn fm-who" data-w="self">' + esc(selfName) + '</button>' +
      '  <button type="button" class="btn fm-who" data-w="spouse">' + esc(spouseName) + '</button>' +
      '</div><div id="fmInner"></div>';

    var inner = el.querySelector('#fmInner');
    var tabs = el.querySelectorAll('.fm-who');
    function setActive(b) {
      Array.prototype.forEach.call(tabs, function (x) { x.style.background = '#fff'; x.style.color = 'var(--accent,#032257)'; x.style.border = '1px solid #cdd7e3'; });
      b.style.background = 'var(--accent,#032257)'; b.style.color = '#fff'; b.style.border = '1px solid var(--accent,#032257)';
    }
    function show(w, btn) {
      setActive(btn);
      var filtered = w === 'all' ? list : list.filter(function (o) { return whoOf(o, selfName, spouseName) === w; });
      var note = w === 'all' ? spouseNote : '';            // 합산일 때만 안내 배너 표시
      var rr = { spouse: r.spouse, total: w === 'all' ? r.total : undefined }; // 분리 시 합계는 필터된 목록으로 재계산
      renderOfferingView(inner, filtered, rr, me, note);
    }
    Array.prototype.forEach.call(tabs, function (b) { b.onclick = function () { show(b.dataset.w, b); }; });
    show('all', tabs[0]);
  }

  // 깔끔한 시각화(요약 카드 + 도넛 + 항목별/전체 탭)
  function renderOfferingView(el, list, r, me, spouseNote) {
    var PAL = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7', '#eab308', '#f43f5e', '#0ea5e9'];
    var byAcc = {};
    list.forEach(function (o) { var a = o.account || '기타'; if (!byAcc[a]) byAcc[a] = { name: a, total: 0, count: 0 }; byAcc[a].total += Number(o.amount) || 0; byAcc[a].count++; });
    var accs = Object.keys(byAcc).map(function (k) { return byAcc[k]; }).sort(function (a, b) { return b.total - a.total; });
    accs.forEach(function (a, i) { a.color = PAL[i % PAL.length]; });
    var total = r.total || list.reduce(function (s, o) { return s + (Number(o.amount) || 0); }, 0);
    var ds = list.map(function (o) { return fmtDate(o.date); }).filter(Boolean).sort();
    var period = ds.length ? ds[0] + ' ~ ' + ds[ds.length - 1] : '';
    var hasGiver = list.some(function (o) { return o.giver && o.giver !== (me.memberName || ''); });

    // 도넛(SVG, 라이브러리 없음)
    var R = 54, C = 2 * Math.PI * R, off = 0;
    var segs = accs.map(function (a) {
      var len = (a.total / (total || 1)) * C;
      var s = '<circle r="' + R + '" cx="75" cy="75" fill="none" stroke="' + a.color + '" stroke-width="22" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 75 75)"></circle>';
      off += len; return s;
    }).join('');
    var donut = '<svg viewBox="0 0 150 150" width="150" height="150" style="flex:0 0 auto;">' + segs +
      '<text x="75" y="70" text-anchor="middle" font-size="10" fill="#7b8794">총 헌금</text>' +
      '<text x="75" y="89" text-anchor="middle" font-size="12" font-weight="700" fill="#032257">' + won(total) + '</text></svg>';
    var legend = '<div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:6px;">' +
      accs.map(function (a) { return '<div style="display:flex;align-items:center;gap:8px;font-size:.85rem;"><span style="width:11px;height:11px;border-radius:3px;background:' + a.color + ';flex:0 0 auto;"></span><span style="flex:1;">' + esc(a.name) + '</span><b style="font-variant-numeric:tabular-nums;">' + won(a.total) + '</b><span style="color:#9aa5b1;width:40px;text-align:right;">' + (total ? (a.total / total * 100).toFixed(0) : 0) + '%</span></div>'; }).join('') +
      '</div>';

    // 항목별 막대
    var maxAcc = accs.length ? accs[0].total : 1;
    var byTab = '<table style="width:100%;border-collapse:collapse;font-size:.88rem;">' +
      accs.map(function (a) {
        var bar = (a.total / (maxAcc || 1) * 100).toFixed(1);
        return '<tr><td style="padding:7px 8px 7px 0;white-space:nowrap;"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + a.color + ';margin-right:6px;"></span>' + esc(a.name) + '</td>' +
          '<td style="width:44%;padding:7px 0;"><div style="background:#eef2f7;border-radius:5px;height:9px;overflow:hidden;"><div style="width:' + bar + '%;height:100%;background:' + a.color + ';"></div></div></td>' +
          '<td style="text-align:right;padding:7px 0 7px 8px;font-variant-numeric:tabular-nums;"><b>' + won(a.total) + '</b> <span style="color:#9aa5b1;">' + a.count + '건</span></td></tr>';
      }).join('') + '</table>';

    // 전체 내역
    var sorted = list.slice().sort(function (a, b) { return String(fmtDate(b.date)).localeCompare(String(fmtDate(a.date))); });
    var sv = anyService(list);
    var allTab = '<div style="overflow:auto;max-height:460px;"><table class="board-table" style="width:100%;border-collapse:collapse;font-size:.88rem;">' +
      '<thead><tr style="position:sticky;top:0;background:#f5f8fc;"><th style="text-align:left;padding:8px;">일자</th>' + (hasGiver ? '<th style="text-align:left;padding:8px;">헌금자</th>' : '') + '<th style="text-align:left;padding:8px;">항목</th>' + (sv ? '<th style="text-align:left;padding:8px;">예배</th>' : '') + '<th style="text-align:right;padding:8px;">금액</th></tr></thead><tbody>' +
      sorted.map(function (o) { return '<tr><td style="padding:6px 8px;">' + esc(fmtDate(o.date)) + '</td>' + (hasGiver ? '<td style="padding:6px 8px;">' + esc(o.giver || '') + '</td>' : '') + '<td style="padding:6px 8px;">' + esc(o.account || '') + '</td>' + (sv ? '<td style="padding:6px 8px;">' + esc(o.service || '') + '</td>' : '') + '<td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;">' + won(o.amount) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr style="font-weight:700;background:#f5f8fc;"><td colspan="' + (1 + (hasGiver ? 1 : 0) + (sv ? 1 : 0)) + '" style="padding:8px;text-align:right;">합계</td><td style="padding:8px;text-align:right;">' + won(total) + '</td></tr></tfoot></table></div>';

    el.innerHTML = spouseNote +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">' +
        statCard('총 헌금액', won(total) + '원', '#032257') +
        statCard('헌금 건수', list.length + '건', '#1e874b') +
        statCard('헌금 항목', accs.length + '개', '#3b82f6') +
      '</div>' +
      '<div class="form-card" style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;justify-content:center;margin-bottom:14px;padding:18px;">' + donut + legend + '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
        '<button type="button" class="btn os-tab" data-o="acc">항목별</button>' +
        '<button type="button" class="btn os-tab" data-o="all">전체 내역</button>' +
      '</div>' +
      '<div id="osPanel"></div>' +
      '<p style="color:var(--ink-soft);font-size:.8rem;margin-top:10px;">🔒 본인(부부)에게만 표시됩니다.' + (period ? ' · 기간 ' + esc(period) : '') + '</p>';

    var panel = el.querySelector('#osPanel');
    var tabs = el.querySelectorAll('.os-tab');
    function setActive(b) {
      Array.prototype.forEach.call(tabs, function (x) { x.style.background = '#fff'; x.style.color = 'var(--accent,#032257)'; x.style.border = '1px solid #cdd7e3'; });
      b.style.background = 'var(--accent,#032257)'; b.style.color = '#fff'; b.style.border = '1px solid var(--accent,#032257)';
    }
    function show(which, btn) { setActive(btn); panel.innerHTML = which === 'all' ? allTab : '<div class="form-card" style="padding:16px;">' + byTab + '</div>'; }
    Array.prototype.forEach.call(tabs, function (b) { b.onclick = function () { show(b.dataset.o, b); }; });
    show('acc', tabs[0]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitLogin);
  else waitLogin();
})();
