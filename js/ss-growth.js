/* ss-growth.js — 홈 '주일학교 성장기' 섹션
 * 어린이들의 QT·필사 인증 기록을 전용 섹션으로 게시(우리들 소식과 분리).
 * 데이터: rpc/ss_growth_feed — 이름·종류·날짜·사진·❤·확인 여부만(개인정보 없음), 로그인 불필요.
 * 콘솔: [ss-growth.js] v20260809ss9
 */
console.log('[ss-growth.js] v20260809ss9');

(function () {
  var body = document.getElementById('ssGrowthBody');
  if (!body) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var SHOW = 8;                       // 처음에 보여줄 카드 수(더 보기로 확장)
  var rows = [], filterName = '', expanded = false;

  function pill(stype) {
    var qt = stype === 'QT';
    return '<span style="font-size:.7rem;font-weight:700;border-radius:999px;padding:2px 9px;background:' + (qt ? '#e8f0fb' : '#e8f6ee') + ';color:' + (qt ? '#2b5797' : '#1e874b') + ';">' + esc(stype) + '</span>';
  }
  function monthKey(d) { return String(d || '').slice(0, 7); }

  function card(r) {
    return '<a href="' + esc(r.photo) + '" target="_blank" rel="noopener" style="display:block;border:1px solid var(--line,#e3e7ee);border-radius:14px;overflow:hidden;background:#fff;text-decoration:none;color:inherit;box-shadow:0 3px 14px rgba(3,34,87,.06);">' +
      '<div style="aspect-ratio:1/1;overflow:hidden;background:#f2f4f8;"><img src="' + esc(r.photo) + '" alt="' + esc(r.name || '') + ' ' + esc(r.stype) + ' 인증" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"></div>' +
      '<div style="padding:10px 12px;">' +
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><b style="font-size:.9rem;color:var(--accent,#032257);">' + esc(r.name || '어린이') + '</b>' + pill(r.stype) + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;font-size:.76rem;color:#7b8794;">' +
      '<span>' + esc(String(r.date || '').slice(0, 10)) + '</span>' +
      '<span>' + (r.likes ? '<span style="color:#e0639b;">❤ ' + r.likes + '</span> ' : '') + (r.confirmed ? '<span style="color:#1e874b;font-weight:700;">✓ 확인</span>' : '') + '</span>' +
      '</div></div></a>';
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
  }

  function load() {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) { body.innerHTML = ''; return; }
    fetch(window.SUPABASE_URL + '/rest/v1/rpc/ss_growth_feed', {
      method: 'POST',
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + window.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) { rows = data || []; render(); })
      .catch(function () { body.innerHTML = ''; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
