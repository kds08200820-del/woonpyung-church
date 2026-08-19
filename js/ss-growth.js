/* ss-growth.js — 홈 '주일학교 성장기' 섹션
 * 어린이들의 QT·필사 인증 기록을 전용 섹션으로 게시(우리들 소식과 분리).
 * 데이터: rpc/ss_growth_feed — 이름·종류·날짜·사진·❤·확인 여부만(개인정보 없음), 보기는 로그인 불필요.
 * 좋아요: rpc/ss_toggle_like — 로그인한 성도 누구나 누를 수 있다(교사단 전용이 아니다).
 *   · 로그인했으면 내 토큰으로 피드를 불러와 '내가 누른 하트'(mine)를 채워서 보여 준다.
 * 콘솔: [ss-growth.js] v20260820heart
 */
console.log('[ss-growth.js] v20260820heart');

(function () {
  var body = document.getElementById('ssGrowthBody');
  if (!body) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var SHOW = 8;                       // 처음에 보여줄 카드 수(더 보기로 확장)
  var rows = [], filterName = '', expanded = false;

  // 로그인 정보(다른 홈 섹션과 같은 방식) — 없으면 보기만 가능
  function localSession() {
    try {
      var ref = new URL(window.SUPABASE_URL).hostname.split('.')[0];
      var raw = localStorage.getItem('sb-' + ref + '-auth-token');
      if (!raw) return null;
      var v = JSON.parse(raw);
      return v && v.currentSession ? v.currentSession : v;
    } catch (e) { return null; }
  }
  function token() { var ss = localSession(); return (ss && ss.access_token) || null; }
  function openLogin() { var m = document.getElementById('authModal'); if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; } }

  function pill(stype) {
    var qt = stype === 'QT';
    return '<span style="font-size:.7rem;font-weight:700;border-radius:999px;padding:2px 9px;background:' + (qt ? '#e8f0fb' : '#e8f6ee') + ';color:' + (qt ? '#2b5797' : '#1e874b') + ';">' + esc(stype) + '</span>';
  }
  function monthKey(d) { return String(d || '').slice(0, 7); }

  // 하트 버튼 모양 — 카드를 그릴 때와 누른 뒤 갱신할 때 같은 함수를 쓴다
  function likeStyle(mine) {
    return 'border:1px solid ' + (mine ? '#e0639b' : '#e3e7ee') +
      ';background:' + (mine ? '#fdeef5' : '#fff') +
      ';color:' + (mine ? '#e0639b' : '#9aa5b1') +
      ';border-radius:999px;padding:3px 10px;font:inherit;font-size:.76rem;cursor:pointer;line-height:1.4;';
  }
  // 누른 뒤 그 버튼만 고쳐 그린다 — 목록을 다시 그리면 스크롤이 맨 위로 튄다(휴대폰에서 특히)
  function paintLike(btn, likes, mine) {
    btn.setAttribute('style', likeStyle(mine));
    btn.title = mine ? '좋아요 취소' : '어린이를 응원해 주세요';
    btn.textContent = (mine ? '❤' : '♡') + ' ' + (likes || 0);
  }

  function card(r) {
    var mine = !!r.mine;
    return '<div style="border:1px solid var(--line,#e3e7ee);border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 3px 14px rgba(3,34,87,.06);">' +
      '<a href="' + esc(r.photo) + '" target="_blank" rel="noopener" style="display:block;text-decoration:none;color:inherit;">' +
      '<div style="aspect-ratio:1/1;overflow:hidden;background:#f2f4f8;"><img src="' + esc(r.photo) + '" alt="' + esc(r.name || '') + ' ' + esc(r.stype) + ' 인증" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"></div></a>' +
      '<div style="padding:10px 12px;">' +
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><b style="font-size:.9rem;color:var(--accent,#032257);">' + esc(r.name || '어린이') + '</b>' + pill(r.stype) + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:.76rem;color:#7b8794;">' +
      '<span>' + esc(String(r.date || '').slice(0, 10)) + '</span>' +
      '<span style="display:flex;align-items:center;gap:6px;">' +
      '<button type="button" class="ssg-like" data-id="' + esc(r.id) + '" title="' + (mine ? '좋아요 취소' : '어린이를 응원해 주세요') + '" ' +
      'style="' + likeStyle(mine) + '">' + (mine ? '❤' : '♡') + ' ' + (r.likes || 0) + '</button>' +
      (r.confirmed ? '<span style="color:#1e874b;font-weight:700;">✓ 확인</span>' : '') +
      '</span></div></div></div>';
  }

  // 좋아요 — 로그인한 성도 누구나. 교사 화면과 같은 함수(rpc/ss_toggle_like)를 쓴다.
  function bindLikes() {
    Array.prototype.forEach.call(body.querySelectorAll('.ssg-like'), function (b) {
      b.onclick = function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var tk = token();
        if (!tk) { alert('좋아요를 누르려면 로그인해 주세요.'); openLogin(); return; }
        if (b.disabled) return;
        b.disabled = true;
        fetch(window.SUPABASE_URL + '/rest/v1/rpc/ss_toggle_like', {
          method: 'POST',
          headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_id: Number(b.dataset.id) })
        }).then(function (r) { return r.ok ? r.json() : r.text().then(function (t) { throw new Error(t || ('HTTP ' + r.status)); }); })
          .then(function (res) {
            var row = rows.filter(function (x) { return String(x.id) === String(b.dataset.id); })[0];
            if (row && res) { row.likes = res.likes; row.mine = res.mine; }
            paintLike(b, res && res.likes, res && res.mine);   // 이 버튼만 갱신 → 보던 자리 그대로
            b.disabled = false;
          })
          .catch(function () { b.disabled = false; alert('좋아요를 저장하지 못했어요. 잠시 후 다시 눌러 주세요.'); });
      };
    });
  }

  function render() {
    if (!rows.length) {
      body.innerHTML =
        '<div style="max-width:560px;margin:0 auto;text-align:center;border:1px dashed #cdd7e3;border-radius:16px;padding:34px 20px;background:#fafbfd;">' +
        '<div style="font-size:2rem;">🌱</div>' +
        '<p style="margin:10px 0 4px;font-weight:700;color:var(--accent,#032257);">아직 올라온 성장 기록이 없어요</p>' +
        '<p style="margin:0;color:var(--ink-soft,#7b8794);font-size:.88rem;">어린이들이 대시보드에서 QT·필사 인증샷을 올리면<br>이곳에 한 장 한 장 차곡차곡 쌓입니다.</p></div>';
      return;
    }
    var ym = monthKey(new Date().toISOString());
    var mQt = rows.filter(function (r) { return r.stype === 'QT' && monthKey(r.date) === ym; }).length;
    var mPil = rows.filter(function (r) { return r.stype === '필사' && monthKey(r.date) === ym; }).length;
    var names = [];
    rows.forEach(function (r) { if (r.name && names.indexOf(r.name) < 0) names.push(r.name); });
    names.sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    var list = filterName ? rows.filter(function (r) { return r.name === filterName; }) : rows;
    var shown = expanded ? list : list.slice(0, SHOW);
    body.innerHTML =
      '<p style="text-align:center;color:var(--ink-soft,#7b8794);font-size:.86rem;margin:0 0 14px;">함께 자라는 어린이 <b style="color:var(--accent,#032257);">' + names.length + '명</b> · 이번 달 QT <b>' + mQt + '회</b> · 필사 <b>' + mPil + '회</b></p>' +
      (names.length > 1 ?
        '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:14px;">' +
        '<button type="button" class="ssg-chip" data-n="" style="border:1px solid ' + (!filterName ? 'var(--accent,#032257)' : '#cdd7e3') + ';background:' + (!filterName ? 'var(--accent,#032257)' : '#fff') + ';color:' + (!filterName ? '#fff' : 'var(--accent,#032257)') + ';border-radius:999px;padding:5px 14px;font:inherit;font-size:.82rem;cursor:pointer;">전체</button>' +
        names.map(function (n) {
          var on = filterName === n;
          return '<button type="button" class="ssg-chip" data-n="' + esc(n) + '" style="border:1px solid ' + (on ? 'var(--accent,#032257)' : '#cdd7e3') + ';background:' + (on ? 'var(--accent,#032257)' : '#fff') + ';color:' + (on ? '#fff' : 'var(--accent,#032257)') + ';border-radius:999px;padding:5px 14px;font:inherit;font-size:.82rem;cursor:pointer;">' + esc(n) + '</button>';
        }).join('') + '</div>' : '') +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px;">' + shown.map(card).join('') + '</div>' +
      (list.length > shown.length ?
        '<div style="text-align:center;margin-top:16px;"><button type="button" class="btn btn-line" id="ssgMore">성장 기록 더 보기 (' + list.length + '건)</button></div>' :
        (expanded && list.length > SHOW ? '<div style="text-align:center;margin-top:16px;"><button type="button" class="btn btn-line" id="ssgLess">접기</button></div>' : ''));
    Array.prototype.forEach.call(body.querySelectorAll('.ssg-chip'), function (b) {
      b.onclick = function () { filterName = b.dataset.n; expanded = false; render(); };
    });
    var more = body.querySelector('#ssgMore'); if (more) more.onclick = function () { expanded = true; render(); };
    var less = body.querySelector('#ssgLess'); if (less) less.onclick = function () { expanded = false; render(); };
    bindLikes();
  }

  function load() {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) { body.innerHTML = ''; return; }
    fetch(window.SUPABASE_URL + '/rest/v1/rpc/ss_growth_feed', {
      method: 'POST',
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (token() || window.SUPABASE_ANON_KEY), 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) { rows = data || []; render(); })
      .catch(function () { body.innerHTML = ''; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
