/* ss-growth.js — 홈 '주일학교 성장기' 섹션
 * 어린이들의 QT·필사 인증 기록을 전용 섹션으로 게시(우리들 소식과 분리).
 * 데이터: rpc/ss_growth_feed — 이름·종류·날짜·사진·❤·확인 여부만(개인정보 없음), 보기는 로그인 불필요.
 * 좋아요: rpc/ss_toggle_like — 로그인한 성도 누구나 누를 수 있다(교사단 전용이 아니다).
 *   · 로그인했으면 내 토큰으로 피드를 불러와 '내가 누른 하트'(mine)를 채워서 보여 준다.
 * 이번주 미션: rpc/ss_current_mission — 있으면 배너로 안내(로그인 불필요).
 * 교사단(rpc/ss_context.isTeacher)에게는 카드마다 [📣 소식으로] 버튼 —
 *   잘 나온 인증샷을 '우리들 소식' 갤러리(album_photos)에 게시한다(파일 복사 없이 URL 공유, 중복 방지).
 * 콘솔: [ss-growth.js] v20260902pub
 */
console.log('[ss-growth.js] v20260902pub');

(function () {
  var body = document.getElementById('ssGrowthBody');
  if (!body) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var SHOW = 8;                       // 처음에 보여줄 카드 수(더 보기로 확장)
  var rows = [], filterName = '', expanded = false, mission = null;
  var isTeacher = false;              // 교사단이면 카드에 [📣 소식으로] 버튼 표시

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
    var qt = stype === 'QT', ms = stype === '미션';
    return '<span style="font-size:.7rem;font-weight:700;border-radius:999px;padding:2px 9px;background:' + (ms ? '#fdf3e0' : qt ? '#e8f0fb' : '#e8f6ee') + ';color:' + (ms ? '#b7791f' : qt ? '#2b5797' : '#1e874b') + ';">' + esc(stype) + '</span>';
  }
  // 이번주 미션 배너 — 기록이 없어도, 미션만 정해져 있으면 보여 준다
  function missionBanner() {
    if (!mission) return '';
    var cnt = Math.max(1, Number(mission.photo_count) || 1);
    return '<div style="max-width:620px;margin:0 auto 16px;text-align:center;border:1px solid #f2e2ae;background:#fffbe8;border-radius:12px;padding:11px 16px;">' +
      '<b style="color:#8a6d1f;font-size:.9rem;">🎯 이번주 미션</b> · <span style="font-size:.9rem;color:#3a4a63;">' + esc(mission.title) + '</span> ' +
      '<span style="color:#b7791f;font-weight:700;font-size:.86rem;">(달란트 ' + (Number(mission.amount) || 1) + '개' + (cnt > 1 ? ' · 사진 ' + cnt + '장' : '') + ')</span>' +
      (mission.description ? '<div style="font-size:.8rem;color:#6b5b26;margin-top:4px;line-height:1.6;">' + esc(mission.description).replace(/\n/g, '<br>') + '</div>' : '') +
      '<div style="font-size:.74rem;color:#9aa5b1;margin-top:4px;">주중 언제든 한 번, 대시보드에서 인증샷' + (cnt > 1 ? ' ' + cnt + '장' : '') + '을 올리면 달란트가 지급돼요</div></div>';
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

  // 카드의 사진 영역 — 여러 장 미션(photos 배열)이면 나눠서, 아니면 한 장 크게
  function photoArea(r) {
    var alt = esc(r.name || '') + ' ' + esc(r.stype) + ' 인증';
    var ps = (Array.isArray(r.photos) && r.photos.length > 1 ? r.photos : [r.photo]).filter(Boolean);
    if (ps.length <= 1) {
      return '<a href="' + esc(ps[0] || r.photo) + '" target="_blank" rel="noopener" style="display:block;text-decoration:none;color:inherit;">' +
        '<div style="aspect-ratio:1/1;overflow:hidden;background:#f2f4f8;"><img src="' + esc(ps[0] || r.photo) + '" alt="' + alt + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"></div></a>';
    }
    var shown = ps.slice(0, 4);   // 카드에는 4장까지, 나머지는 +n 으로
    return '<div style="aspect-ratio:1/1;overflow:hidden;background:#f2f4f8;display:grid;grid-template-columns:repeat(2,1fr);' +
      (shown.length > 2 ? 'grid-template-rows:repeat(2,1fr);' : '') + 'gap:2px;">' +
      shown.map(function (u, i) {
        var extra = (i === shown.length - 1) ? ps.length - shown.length : 0;
        return '<a href="' + esc(u) + '" target="_blank" rel="noopener" style="position:relative;display:block;overflow:hidden;">' +
          '<img src="' + esc(u) + '" alt="' + alt + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;">' +
          (extra > 0 ? '<span style="position:absolute;inset:0;background:rgba(3,34,87,.45);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;">+' + extra + '</span>' : '') +
          '</a>';
      }).join('') + '</div>';
  }

  function card(r) {
    var mine = !!r.mine;
    return '<div style="border:1px solid var(--line,#e3e7ee);border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 3px 14px rgba(3,34,87,.06);">' +
      photoArea(r) +
      '<div style="padding:10px 12px;">' +
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><b style="font-size:.9rem;color:var(--accent,#032257);">' + esc(r.name || '어린이') + '</b>' + pill(r.stype) + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:.76rem;color:#7b8794;">' +
      '<span>' + esc(String(r.date || '').slice(0, 10)) + '</span>' +
      '<span style="display:flex;align-items:center;gap:6px;">' +
      '<button type="button" class="ssg-like" data-id="' + esc(r.id) + '" title="' + (mine ? '좋아요 취소' : '어린이를 응원해 주세요') + '" ' +
      'style="' + likeStyle(mine) + '">' + (mine ? '❤' : '♡') + ' ' + (r.likes || 0) + '</button>' +
      (r.confirmed ? '<span style="color:#1e874b;font-weight:700;">✓ 확인</span>' : '') +
      '</span></div>' +
      (isTeacher
        ? '<button type="button" class="ssg-pub" data-id="' + esc(r.id) + '" title="이 인증샷을 홈 \'우리들 소식\' 갤러리에 게시합니다(교사)" ' +
          'style="margin-top:8px;width:100%;border:1px solid #cdd7e3;background:#f7f9fc;color:var(--accent,#032257);border-radius:9px;padding:5px 8px;font:inherit;font-size:.78rem;font-weight:600;cursor:pointer;">📣 우리들 소식으로 올리기</button>'
        : '') +
      '</div></div>';
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

  // ── [교사] 인증샷을 '우리들 소식' 갤러리에 게시 ──
  //   파일은 복사하지 않고 같은 URL을 album_photos에 등록(key=null → 갤러리에서 지워도 원본 인증샷 파일은 유지).
  //   같은 URL이 이미 갤러리에 있으면 중복 게시하지 않는다.
  function restHeaders(extra) {
    var h = { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + (token() || window.SUPABASE_ANON_KEY), 'Content-Type': 'application/json' };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }
  function publishRow(r, btn) {
    var ss = localSession(), me = ss && ss.user;
    if (!me) { alert('로그인이 필요합니다.'); openLogin(); return; }
    var photos = (Array.isArray(r.photos) && r.photos.length ? r.photos : [r.photo]).filter(Boolean);
    if (!photos.length) { alert('사진 주소를 찾지 못했습니다.'); return; }
    if (!confirm(r.name + ' 어린이의 ' + r.stype + ' 인증샷 ' + photos.length + '장을\n홈 \'우리들 소식\' 갤러리에 올릴까요?')) return;
    btn.disabled = true; btn.textContent = '올리는 중…';
    var authorName = (me.user_metadata && (me.user_metadata.name || me.user_metadata.full_name)) || (me.email ? me.email.split('@')[0] : '교사');
    var title = '주일학교 · ' + (r.name || '어린이') + ' ' + r.stype + ' 인증';
    var date = String(r.date || '').slice(0, 10) || null;
    var posted = 0, dup = 0;
    function one(i) {
      if (i >= photos.length) {
        btn.textContent = posted ? '✓ 소식에 올렸습니다' : '이미 올라가 있어요';
        btn.style.color = '#1e874b'; btn.style.borderColor = '#bfe0c8'; btn.style.background = '#f0f9f2';
        if (posted) try { window.dispatchEvent(new Event('church:auth')); } catch (e) {}   // 홈 '우리들 소식' 즉시 갱신
        return;
      }
      var u = photos[i];
      // 중복 확인 → 없을 때만 게시
      fetch(window.SUPABASE_URL + '/rest/v1/album_photos?select=id&url=eq.' + encodeURIComponent(u) + '&limit=1', { headers: restHeaders() })
        .then(function (res) { return res.ok ? res.json() : []; })
        .then(function (ex) {
          if (ex && ex.length) { dup++; one(i + 1); return null; }
          var base = { category: '주일학교', url: u, key: null, caption: null, user_id: me.id, author_name: authorName };
          var withCols = Object.assign({ title: title, event_date: date }, base);
          return fetch(window.SUPABASE_URL + '/rest/v1/album_photos', { method: 'POST', headers: restHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(withCols) })
            .then(function (res) {
              if (res.ok) return true;
              return res.text().then(function (t) {
                // title/event_date 컬럼이 없는 옛 스키마면 기본 필드로 재시도
                if (/column|event_date|title|schema cache/i.test(t)) {
                  return fetch(window.SUPABASE_URL + '/rest/v1/album_photos', { method: 'POST', headers: restHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(base) })
                    .then(function (r2) { if (!r2.ok) return r2.text().then(function (t2) { throw new Error(t2); }); return true; });
                }
                throw new Error(t || ('HTTP ' + res.status));
              });
            })
            .then(function (ok) { if (ok) posted++; one(i + 1); });
        })
        .catch(function (e) {
          btn.disabled = false; btn.textContent = '📣 우리들 소식으로 올리기';
          alert('게시하지 못했습니다: ' + ((e && e.message) || '오류') + '\n잠시 후 다시 시도해 주세요.');
        });
    }
    one(0);
  }
  function bindPublish() {
    Array.prototype.forEach.call(body.querySelectorAll('.ssg-pub'), function (b) {
      b.onclick = function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        var row = rows.filter(function (x) { return String(x.id) === String(b.dataset.id); })[0];
        if (row) publishRow(row, b);
      };
    });
  }
  // 교사단 여부 — 로그인한 경우에만 확인(교사면 다시 그려서 버튼 표시)
  function checkTeacher() {
    var tk = token(); if (!tk || isTeacher) return;
    fetch(window.SUPABASE_URL + '/rest/v1/rpc/ss_context', {
      method: 'POST',
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (ctx) { if (ctx && ctx.isTeacher) { isTeacher = true; if (rows.length) render(); } })
      .catch(function () {});
  }

  function render() {
    if (!rows.length) {
      body.innerHTML = missionBanner() +
        '<div style="max-width:560px;margin:0 auto;text-align:center;border:1px dashed #cdd7e3;border-radius:16px;padding:34px 20px;background:#fafbfd;">' +
        '<div style="font-size:2rem;">🌱</div>' +
        '<p style="margin:10px 0 4px;font-weight:700;color:var(--accent,#032257);">아직 올라온 성장 기록이 없어요</p>' +
        '<p style="margin:0;color:var(--ink-soft,#7b8794);font-size:.88rem;">어린이들이 대시보드에서 QT·필사 인증샷을 올리면<br>이곳에 한 장 한 장 차곡차곡 쌓입니다.</p></div>';
      return;
    }
    var ym = monthKey(new Date().toISOString());
    var mQt = rows.filter(function (r) { return r.stype === 'QT' && monthKey(r.date) === ym; }).length;
    var mPil = rows.filter(function (r) { return r.stype === '필사' && monthKey(r.date) === ym; }).length;
    var mMs = rows.filter(function (r) { return r.stype === '미션' && monthKey(r.date) === ym; }).length;
    var names = [];
    rows.forEach(function (r) { if (r.name && names.indexOf(r.name) < 0) names.push(r.name); });
    names.sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    var list = filterName ? rows.filter(function (r) { return r.name === filterName; }) : rows;
    var shown = expanded ? list : list.slice(0, SHOW);
    body.innerHTML = missionBanner() +
      '<p style="text-align:center;color:var(--ink-soft,#7b8794);font-size:.86rem;margin:0 0 14px;">함께 자라는 어린이 <b style="color:var(--accent,#032257);">' + names.length + '명</b> · 이번 달 QT <b>' + mQt + '회</b> · 필사 <b>' + mPil + '회</b>' + (mMs ? ' · 미션 <b>' + mMs + '회</b>' : '') + '</p>' +
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
    bindPublish();
  }

  function callRpc(name, auth) {
    return fetch(window.SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: window.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + auth, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  // 홈을 오랜만에 열면 저장된 로그인 토큰이 만료돼 401이 나면서 성장기가
  // '기록 없음'으로 비어 보이던 문제(2026-08-25) — 실패하면 익명 키로 다시
  // 시도한다. 피드·미션은 익명으로도 볼 수 있어 화면은 항상 채워진다.
  // (익명 폴백에서는 '내가 누른 하트' 표시만 빠지며, 토큰이 갱신되면 복원됨)
  function rpc(name) {
    var tk = token();
    var p = callRpc(name, tk || window.SUPABASE_ANON_KEY);
    if (tk) p = p.catch(function () { return callRpc(name, window.SUPABASE_ANON_KEY); });
    return p.catch(function () { return null; });   // null = 진짜 실패(빈 배열과 구분)
  }
  var retries = 0;
  function load() {
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) { body.innerHTML = ''; return; }
    Promise.all([rpc('ss_growth_feed'), rpc('ss_current_mission')])
      .then(function (res) {
        // 네트워크가 잠깐 막힌 경우 — 빈 화면으로 확정하지 말고 잠시 뒤 다시 시도
        if (res[0] === null && retries < 2) { retries++; setTimeout(load, 2000 * retries); return; }
        rows = res[0] || []; mission = res[1] || null; render();
        checkTeacher();   // 교사단이면 카드에 [📣 우리들 소식으로] 버튼을 붙여 다시 그림
      })
      .catch(function () { body.innerHTML = ''; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
  // 로그인 세션이 준비되면(토큰 갱신 포함) 한 번 더 불러와 '내 하트' 표시를 복원
  window.addEventListener('sb-ready', function () { setTimeout(load, 400); }, { once: true });
})();
