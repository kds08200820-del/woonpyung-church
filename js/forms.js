/* forms.js — 신청서 (행사·모임 신청, 2026-10-10)
 *  · 공지사항(홈·우리 이야기) 맨 위: 신청 기간인 신청서 — '신청하기' · '신청 확인' (히어로에는 넣지 않는다)
 *  · 신청서 페이지(forms.html): 지금 받는 신청서 · 내 신청서 · 지난 신청서
 *  · 대시보드 카드: dashboard.js 가 WPCForms.mineCard(el, { noticeEl }) 로 부른다 (헌금 바로 위)
 *  · 신청·고치기·취소·'납부했습니다'·교회 안내 읽음은 모두 Supabase 함수(rpc)로 한다
 *  자료: app_forms · app_entries — supabase/20261010_1140_app_forms.sql (실행 전에는 조용히 숨는다)
 *  참가자 이름(2026-10-10): 인원마다 이름을 받아 app_submit(…, p_names) 로 보낸다 — 같은 신청서에 같은 이름은 서버가 막는다
 *    (supabase/20261010_1300_app_participants.sql)
 */
console.log('[forms.js] v20261025ia1');

(function () {
  if (window.WPCForms) return;
  var SB = String(window.SUPABASE_URL || '').replace(/\/$/, ''), AK = window.SUPABASE_ANON_KEY;

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var nl2br = function (s) { return esc(s).replace(/\n/g, '<br>'); };
  var won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR'); };

  /* ── 화면 모양 (테마 색만: 남색·연남색·금색·선·바탕) ── */
  var CSS =
    /* 공지사항 맨 위 신청 안내 (공지 목록의 .nt-item 모양을 그대로 쓴다) */
    '.ap-ntbox{margin-bottom:12px}' +
    '.ap-ntbtns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
    '.ap-ntbtns .btn{padding:8px 18px;font-size:.88rem;cursor:pointer}' +
    '@media (max-width:560px){.ap-ntbtns .btn{flex:1}}' +
    '.ap-modal .modal-box{max-width:520px;padding:34px 30px 26px}' +
    '@media (max-width:560px){.ap-modal{padding:10px}.ap-modal .modal-box{padding:28px 18px 20px;max-height:92vh;border-radius:14px}}' +
    '.ap-eye{font-size:.76rem;letter-spacing:.12em;color:var(--accent-soft,#6E523C);margin:0 0 4px}' +
    '.ap-title{font-family:var(--font, sans-serif);font-size:1.32rem;line-height:1.4;color:var(--accent,#3A281C);margin:0 0 6px;word-break:keep-all}' +
    '.ap-meta{color:var(--ink-soft,#4A3628);font-size:.9rem;margin:0 0 2px;word-break:keep-all}' +
    '.ap-img{display:block;margin:12px 0 0;border:1px solid var(--line,#E6D8C6);border-radius:10px;overflow:hidden;background:#fff}.ap-img img{display:block;width:100%;height:auto}' +
    '.ap-imgnote{font-size:.76rem;color:#8B7B6C;margin:4px 0 0}' +
    '.ap-body{font-size:.92rem;line-height:1.75;color:var(--ink,#3A281C);background:var(--paper-alt,#F6EFE5);border-radius:10px;padding:12px 14px;margin:12px 0 0;word-break:keep-all}' +
    '.ap-text{font-size:.94rem;color:var(--ink-soft,#4A3628);margin:12px 0 0;word-break:keep-all}' +
    '.ap-form{margin-top:16px;display:flex;flex-direction:column;gap:12px}' +
    '.ap-field{display:flex;flex-direction:column;gap:5px}' +
    '.ap-kinds{border:0;margin:0;padding:0;min-width:0}.ap-kinds legend{font-size:.84rem;color:var(--ink-soft,#4A3628);font-weight:500;margin-bottom:6px;padding:0}' +
    '.ap-kinds{display:flex;flex-direction:row;flex-wrap:wrap;gap:8px}.ap-kinds legend{flex:0 0 100%}.ap-kinds small{flex:0 0 100%;color:var(--ink-soft,#6b5a4a);font-size:.78rem;line-height:1.5}' +
    '.ap-kind{display:inline-flex;align-items:center;gap:7px;padding:11px 16px;border:1px solid var(--line,#E6D8C6);border-radius:12px;background:#fff;cursor:pointer;font-size:.98rem}' +
    '.ap-kind:has(input:checked){border-color:var(--accent,#3A281C);background:#f6efe6;font-weight:700}.ap-kind input{width:18px;height:18px;margin:0}' +
    '.ap-qa{display:flex;flex-direction:column;gap:12px;margin-top:4px}.ap-qa-h{margin:6px 0 0;font-weight:700;color:var(--accent,#3A281C)}.ap-qa-h small{font-weight:400;color:var(--ink-soft,#6b5a4a)}' +
    '.ap-qa-view{margin-top:14px;display:flex;flex-direction:column;gap:10px}.ap-qa-i{background:#fff;border:1px solid var(--line,#E6D8C6);border-radius:12px;padding:10px 13px}.ap-qa-i b{font-size:.9rem;color:var(--accent,#3A281C)}.ap-qa-i p{margin:5px 0 0;font-size:.92rem;line-height:1.6;white-space:pre-wrap;word-break:keep-all}' +
    '.ap-field>span{font-size:.84rem;color:var(--ink-soft,#4A3628);font-weight:500}' +
    '.ap-field input,.ap-field textarea{font:inherit;font-size:1rem;padding:11px 13px;border:1px solid var(--line,#E6D8C6);border-radius:10px;width:100%;box-sizing:border-box;background:#fff}' +
    '.ap-field input:focus,.ap-field textarea:focus{outline:none;border-color:var(--accent-soft,#6E523C)}' +
    '.ap-count{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line,#E6D8C6);border-radius:10px;padding:8px 10px 8px 14px}' +
    '.ap-count>span{display:flex;flex-direction:column;font-weight:500;color:var(--ink,#3A281C)}' +
    '.ap-count small{font-size:.78rem;color:var(--muted,#8B7B6C);font-weight:400}' +
    '.ap-step{display:flex;align-items:center;gap:6px}' +
    '.ap-step button{width:38px;height:38px;border-radius:50%;border:1px solid var(--line,#E6D8C6);background:#fff;color:var(--accent,#3A281C);font-size:1.25rem;line-height:1;cursor:pointer;font-family:inherit}' +
    '.ap-step button:disabled{opacity:.35;cursor:default}' +
    '.ap-step b{min-width:30px;text-align:center;font-size:1.08rem;color:var(--accent,#3A281C)}' +
    '.ap-names{display:flex;flex-direction:column;gap:8px;border:1px solid var(--line,#E6D8C6);border-radius:10px;padding:12px 12px 10px;background:var(--paper-alt,#F6EFE5)}' +
    '.ap-names>p{margin:0;font-size:.84rem;color:var(--ink-soft,#4A3628);font-weight:500}' +
    '.ap-names>p small{font-weight:400;color:var(--muted,#8B7B6C)}' +
    '.ap-pname{display:flex;align-items:center;gap:10px;margin:0}' +
    '.ap-pname>span{flex:0 0 74px;font-size:.84rem;color:var(--accent,#3A281C)}' +
    '.ap-pname input{flex:1;min-width:0;font:inherit;font-size:1rem;padding:9px 12px;border:1px solid var(--line,#E6D8C6);border-radius:9px;background:#fff;box-sizing:border-box}' +
    '.ap-pname input:focus{outline:none;border-color:var(--accent-soft,#6E523C)}' +
    '.ap-pname input.is-bad{border-color:#A33A2A}' +
    '.ap-nerr{color:#A33A2A;font-size:.84rem;margin:0}' +
    '.ap-total{display:flex;justify-content:space-between;align-items:baseline;padding:12px 2px 2px;border-top:1px solid var(--line,#E6D8C6);color:var(--accent,#3A281C);font-weight:700}' +
    '.ap-total b{font-size:1.2rem}' +
    '.ap-err{color:#A33A2A;font-size:.88rem;margin:0}' +
    '.ap-note{font-size:.8rem;color:var(--muted,#8B7B6C);margin:8px 0 0;line-height:1.6;word-break:keep-all}' +
    '.ap-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-weight:700;font-size:.95rem;border-radius:30px;padding:12px 22px;cursor:pointer;border:1.5px solid var(--accent,#3A281C);background:var(--accent,#3A281C);color:#fff;text-decoration:none;box-sizing:border-box}' +
    '.ap-btn:hover{background:#563720}' +
    '.ap-btn:disabled{opacity:.55;cursor:default}' +
    '.ap-btn-line{display:inline-flex;align-items:center;justify-content:center;font:inherit;font-weight:600;font-size:.88rem;border-radius:30px;padding:9px 16px;cursor:pointer;border:1px solid var(--accent-soft,#6E523C);background:#fff;color:var(--accent,#3A281C);text-decoration:none}' +
    '.ap-btn-line:hover{background:var(--paper-alt,#F6EFE5)}' +
    '.ap-btn-sm{padding:7px 14px;font-size:.84rem}' +
    '.ap-wide{width:100%}' +
    '.ap-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}' +
    '.ap-actions .ap-quiet{color:var(--muted,#8B7B6C);border-color:var(--line,#E6D8C6)}' +
    '.ap-chip{display:inline-block;padding:3px 11px;border-radius:999px;font-size:.76rem;font-weight:700;white-space:nowrap;vertical-align:middle}' +
    '.ap-chip-paid{background:var(--accent,#3A281C);color:#fff}' +
    '.ap-chip-ok{background:#F6F2EF;color:var(--accent-soft,#6E523C)}' +
    '.ap-chip-due{background:#fff;color:var(--accent,#3A281C);border:1px solid var(--gold,#B5562F)}' +
    '.ap-chip-off{background:#F0EEEB;color:var(--muted,#8B7B6C)}' +
    '.ap-done{margin:12px 0 0;padding:10px 14px;border-radius:10px;background:#F6F2EF;color:var(--accent,#3A281C);font-weight:600;font-size:.92rem}' +
    '.ap-msg{border:1px solid var(--gold,#B5562F);border-left-width:4px;background:#FBF5EC;border-radius:8px;padding:11px 14px;margin:12px 0 0}' +
    '.ap-msg.is-old{border-color:var(--line,#E6D8C6);border-left-color:var(--gold,#B5562F);background:#fff}' +
    '.ap-msg-hd{font-size:.78rem;color:var(--accent-soft,#6E523C);font-weight:700;margin:0 0 4px}' +
    '.ap-msg-tx{font-size:.93rem;color:var(--ink,#3A281C);margin:0;line-height:1.65;word-break:keep-all}' +
    '.ap-msg .ap-btn-line{margin-top:9px;padding:6px 13px;font-size:.82rem}' +
    '.ap-msg.is-ok{border-color:#5E7A55;background:#F2F6EF}.ap-msg.is-stop{border-color:#A33A2A;background:#FBF1EE}' +
    '.ap-cr{border-color:#5E7A55}.ap-crgo{display:inline-flex;align-items:center;justify-content:center;margin-top:10px;text-decoration:none;width:auto}' +
    '.ap-kind.is-3{flex:1 1 170px;flex-direction:column;align-items:flex-start;gap:3px}.ap-kind.is-3 .k{display:inline-flex;align-items:center;gap:7px;font-weight:inherit}' +
    '.ap-kind .d{font-size:.76rem;color:var(--muted,#8B7B6C);font-weight:400;line-height:1.45;word-break:keep-all}' +
    '.ap-kind .rec{font-style:normal;font-size:.68rem;font-weight:700;color:#fff;background:#5E7A55;border-radius:999px;padding:1px 7px;margin-left:2px}' +
    '.ap-kind:has(input:disabled){opacity:.45;cursor:default}.ap-kinds small.is-warn{color:#A33A2A}' +
    '.ap-kinds .ap-kind input{width:18px;height:18px;padding:0;margin:0;flex:0 0 18px;border-radius:50%}.ap-kind.is-3 .k,.ap-kind .rec{white-space:nowrap}' +
    '.ap-kind .rec.soon{background:#A3907F}' +
    '.ap-kids{border:1px solid var(--line,#E6D8C6);border-radius:12px;padding:12px 14px;background:#fff}.ap-kids>span small{color:var(--muted,#8B7B6C);font-weight:400}' +
    '.ap-kid{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center;margin-top:8px}' +
    '.ap-kid-x{border:1px solid var(--line,#E6D8C6);background:#fff;border-radius:8px;width:36px;height:40px;cursor:pointer;color:#8B7B6C;font:inherit}' +
    '.ap-kid-r{grid-column:1/-1;font-size:.78rem;color:#5E7A55;margin-top:-2px}.ap-kid-r.is-warn{color:#A33A2A}' +
    '.ap-kid-add{margin-top:10px;padding:6px 13px;font-size:.84rem;align-self:flex-start}' +
    '.ap-kid input{min-width:0}' +
    '.ap-dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:14px 0 0;font-size:.92rem}' +
    '.ap-dl dt{color:var(--muted,#8B7B6C)}' +
    '.ap-dl dd{margin:0;color:var(--ink,#3A281C);word-break:break-all}' +
    '.ap-pay{background:var(--paper-alt,#F6EFE5);border:1px solid var(--line,#E6D8C6);border-radius:12px;padding:14px 16px;margin-top:16px;display:flex;flex-direction:column;gap:10px}' +
    '.ap-pay-amt{display:flex;justify-content:space-between;align-items:baseline;color:var(--accent,#3A281C)}' +
    '.ap-pay-amt b{font-size:1.2rem}' +
    '.ap-acct{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid var(--line,#E6D8C6);border-radius:10px;padding:9px 12px;font-size:.92rem}' +
    '.ap-acct span{word-break:break-all}' +
    '.ap-pay .ap-note{margin:0}' +
    '.ap-card h3.ap-card-h{margin:0 0 10px;font-size:1rem;color:var(--accent,#3A281C)}' +
    '.ap-list{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}' +
    '.ap-item{border:1px solid var(--line,#E6D8C6);border-radius:12px;padding:12px 14px;background:#fff}' +
    '.ap-item.is-off{background:#FBF9F7}' +
    '.ap-item-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}' +
    '.ap-item-hd b{color:var(--accent,#3A281C);font-size:.98rem;word-break:keep-all}' +
    '.ap-item-meta{margin:3px 0 0;font-size:.84rem;color:var(--ink-soft,#4A3628);word-break:keep-all}' +
    '.ap-item .ap-msg{margin-top:9px}' +
    '.ap-link{background:none;border:0;padding:0;margin-top:8px;font:inherit;font-size:.86rem;font-weight:600;color:var(--accent-soft,#6E523C);cursor:pointer;text-decoration:underline;text-underline-offset:3px}' +
    '.ap-more{margin-top:14px;border-top:1px solid var(--line,#E6D8C6);padding-top:12px}' +
    '.ap-more>summary{cursor:pointer;font-size:.92rem;font-weight:700;color:var(--accent,#3A281C)}' +
    '.ap-empty{color:var(--muted,#8B7B6C);font-size:.9rem;margin:0}' +
    '.ap-open{display:flex;flex-direction:column;gap:8px;margin:0 0 4px}' +
    '.ap-open-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px dashed var(--gold,#B5562F);border-radius:12px;padding:10px 14px;background:#fff}' +
    '.ap-open-row b{display:block;color:var(--accent,#3A281C);word-break:keep-all}' +
    '.ap-open-row span{font-size:.82rem;color:var(--ink-soft,#4A3628)}' +
    '.ap-topnote{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border:1px solid var(--gold,#B5562F);border-left-width:4px;background:#FBF5EC;border-radius:10px;padding:11px 14px;font-size:.92rem;color:var(--accent,#3A281C);max-width:680px;margin:0 auto 22px;box-sizing:border-box}' +
    '.ap-sec{margin:0 0 40px}' +
    '.ap-sec>h2{font-family:var(--font, sans-serif);font-size:1.2rem;color:var(--accent,#3A281C);margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid var(--accent,#3A281C)}' +
    '.ap-fcard{background:#fff;border:1px solid var(--line,#E6D8C6);border-radius:16px;padding:20px 22px;margin-bottom:14px}' +
    '.ap-fcard .ap-actions{margin-top:14px}' +
    '.ap-past{list-style:none;margin:0;padding:0}' +
    '.ap-past li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 2px;border-bottom:1px solid var(--line,#E6D8C6)}' +
    '.ap-past li button{background:none;border:0;padding:0;font:inherit;text-align:left;cursor:pointer;color:var(--ink,#3A281C)}' +
    '.ap-past li button b{display:block;color:var(--accent,#3A281C);font-weight:600}' +
    '.ap-past li button span{font-size:.82rem;color:var(--muted,#8B7B6C)}' +
    '@media (max-width:560px){.ap-fcard{padding:16px}.ap-open-row{flex-direction:column;align-items:stretch}.ap-open-row .ap-btn{width:100%}}';
  (function () {
    if (document.getElementById('apFormsCss')) return;
    var st = document.createElement('style'); st.id = 'apFormsCss'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  })();

  /* ── 로그인 세션 (localStorage 의 Supabase 세션 — layout.js·affairs.js 와 같은 방식) ── */
  function ref() { try { return new URL(SB).hostname.split('.')[0]; } catch (e) { return ''; } }
  function sess() {
    try {
      var raw = localStorage.getItem('sb-' + ref() + '-auth-token');
      if (!raw) return null;
      var s = JSON.parse(raw); s = (s && s.currentSession) ? s.currentSession : s;
      if (!s || !s.access_token || !s.user) return null;
      return { uid: s.user.id, token: s.access_token };
    } catch (e) { return null; }
  }
  var refreshing = null;
  function refreshToken() {
    if (refreshing) return refreshing;
    refreshing = new Promise(function (resolve, reject) {
      var key = 'sb-' + ref() + '-auth-token', stored, cur;
      try { stored = JSON.parse(localStorage.getItem(key)); cur = stored && (stored.currentSession || stored); } catch (e) { }
      var rt = cur && cur.refresh_token;
      if (!rt) { reject(new Error('no refresh token')); return; }
      fetch(SB + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: AK, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d || !d.access_token) throw new Error('refresh failed');
          cur.access_token = d.access_token; cur.refresh_token = d.refresh_token || rt;
          if (d.expires_at) cur.expires_at = d.expires_at;
          if (d.user) cur.user = d.user;
          localStorage.setItem(key, JSON.stringify(stored));
          resolve(d.access_token);
        }).catch(reject);
    });
    refreshing.then(function () { refreshing = null; }, function () { refreshing = null; });
    return refreshing;
  }
  function api(method, path, body, retried) {
    if (!SB || !AK) return Promise.reject(new Error('no-config'));
    var s = sess(), h = { apikey: AK, 'Content-Type': 'application/json' };
    if (s) h.Authorization = 'Bearer ' + s.token;
    var opt = { method: method, headers: h };
    if (body) opt.body = JSON.stringify(body);
    return fetch(SB + '/rest/v1/' + path, opt).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        if (!retried && s && (r.status === 401 || /JWT expired|PGRST303|invalid (JWT|token)/i.test(t || ''))) {
          return refreshToken().then(function () { return api(method, path, body, true); });
        }
        var e = new Error(t || ('HTTP ' + r.status)); e.status = r.status; throw e;
      });
      return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
    });
  }
  function rpc(name, args) { return api('POST', 'rpc/' + name, args || {}); }
  function notReady(e) { return /42P01|42883|PGRST20[0-9]|does not exist|schema cache|Could not find/i.test((e && e.message) || ''); }

  /* ── 날짜·금액 글 ── */
  var DOW = ['주일', '월', '화', '수', '목', '금', '토'];
  function hm(h, m) { var ap = h < 12 ? '오전 ' : (h === 12 ? '낮 ' : '오후 '); return ap + (h === 0 ? 0 : (h % 12 || 12)) + '시' + (m ? ' ' + m + '분' : ''); }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function eventText(f) {                      // 10월 18일(주일) 오후 2시
    if (!f || !f.event_date) return '';
    var p = String(f.event_date).split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    var s = (+p[1]) + '월 ' + (+p[2]) + '일(' + DOW[d.getDay()] + ')';
    if (f.event_time) { var t = String(f.event_time).split(':'); s += ' ' + hm(+t[0], +t[1]); }
    return s;
  }
  function whenPlace(f) { return [eventText(f), f && f.place].filter(Boolean).join(' · '); }
  function dtText(iso) {                       // 10월 18일(주일) 오후 2시
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + DOW[d.getDay()] + ') ' + hm(d.getHours(), d.getMinutes());
  }
  function dayText(iso) { var d = new Date(iso); return isNaN(d) ? '' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
  function feeText(f) {
    if (f && f.kind === 'baptism') return '신청비 없음';
    var a = +f.fee_adult || 0, m = f.ask_minor ? (+f.fee_minor || 0) : 0;
    if (!a && !m) return '신청비 없음';
    if (!f.ask_minor) return '1명 ' + won(a) + '원';
    return '성인 ' + (a ? won(a) + '원' : '무료') + ' · 미성년자 ' + (m ? won(m) + '원' : '무료');
  }
  function untilText(f) {                      // 마감이 행사 날과 다를 때만 따로 적는다
    if (!f.close_at) return '';
    var c = new Date(f.close_at);
    if (f.event_date && ymd(c) === String(f.event_date)) return '';
    return dtText(f.close_at) + '까지 신청';
  }
  function peopleText(e, f) {
    if (f && f.ask_minor === false) return (e.adults + e.minors) + '명';
    return '성인 ' + e.adults + '명' + (e.minors ? ' · 미성년자 ' + e.minors + '명' : '');
  }
  /* 사람 이름표 — 신청서마다 '참가자'·'신청자'·'수령자' 등 (app_forms.people_label, 20261024_1800 · 없으면 '참가자') */
  function plabel(f) { return String((f && f.people_label) || '').trim() || '참가자'; }
  /* 참가자 이름 — [{name, kind:'adult'|'minor'}] (20261010_1300 전에 낸 신청은 []) */
  function partsOf(e) { return (e && Array.isArray(e.participants) ? e.participants : []).filter(function (x) { return x && x.name; }); }
  function partText(e, f) {
    var ps = partsOf(e); if (!ps.length) return '';
    var ad = ps.filter(function (x) { return x.kind !== 'minor'; }).map(function (x) { return x.name; });
    var mi = ps.filter(function (x) { return x.kind === 'minor'; }).map(function (x) { return x.name; });
    if (f && f.ask_minor === false) return ad.concat(mi).join(', ');
    return [ad.length ? '성인 ' + ad.join(', ') : '', mi.length ? '미성년자 ' + mi.join(', ') : ''].filter(Boolean).join(' · ');
  }
  function nameKey(n) { return String(n || '').replace(/\s+/g, '').toLowerCase(); }   // 서버 app_name_key 와 같게
  function memoLine(f, e) { var l = (f && f.memo_label) || '메모'; return l + (/[?？.]$/.test(l) ? ' ' : ': ') + e.memo; }
  function isOpen(f) {
    var now = Date.now();
    return !!f && f.published !== false && new Date(f.open_at).getTime() <= now && (!f.close_at || new Date(f.close_at).getTime() > now);
  }
  function stateOf(e) {
    if (e.status === 'cancelled') return ['off', '취소함'];
    if (!(e.fee_total > 0)) return ['ok', '신청 완료'];
    if (e.paid_at && e.confirmed_at) return ['paid', '납부 완료 · 교회 확인'];
    if (e.paid_at) return ['paid', '납부 완료'];
    return ['due', '미납'];
  }
  function chip(e) { var s = stateOf(e); return '<span class="ap-chip ap-chip-' + s[0] + '">' + s[1] + '</span>'; }

  /* ── 납부: 토스 송금 링크 · 계좌 ── */
  /* 납부 받는 곳을 비워 둔 신청서는 교회 계좌로 받는다 (2026-10-10 목사님 지시)
     교회 계좌 = 홈페이지 온라인헌금 창(layout.js)에 적힌 계좌. 목회 행정 > 설정 > '신청서 납부 계좌'에서 바꾸면
     계좌를 따로 정하지 않은 신청서에 그 계좌가 저장된다(affairs.js) — 여기는 그 전까지의 기본값 */
  function churchPay() {
    function txt(sel) { var el = document.querySelector(sel); return el ? String(el.textContent || '').trim() : ''; }
    return { pay_bank: txt('#giveModal .give-bank') || '농협', pay_account: txt('#giveAcctNo') || '351-1344-7987-23',
      pay_holder: txt('#giveModal .give-holder').replace(/^예금주\s*[·:]?\s*/, '') || '운평장로교회', pay_toss_url: '' };
  }
  function payTarget(f) { return (f.pay_toss_url || (f.pay_bank && f.pay_account)) ? f : Object.assign({}, f, churchPay()); }
  function tossMeUrl(u, amount) {              // https://toss.me/아이디 → https://toss.me/아이디/금액
    u = String(u || '').trim(); if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    var x; try { x = new URL(u); } catch (e) { return ''; }
    if (!/^https?:$/.test(x.protocol)) return '';
    if (/(^|\.)toss\.me$/i.test(x.hostname) && amount > 0) {
      var parts = x.pathname.split('/').filter(Boolean);
      if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) parts.pop();
      if (parts.length) return x.origin + '/' + parts.join('/') + '/' + amount;
    }
    return x.href;
  }
  function tossApp(f, amount) {                // 토스 앱 송금 화면 (휴대폰에 토스가 있을 때)
    var acct = String(f.pay_account || '').replace(/[^0-9]/g, '');
    if (!f.pay_bank || !acct) return '';
    return 'supertoss://send?bank=' + encodeURIComponent(f.pay_bank) + '&accountNo=' + acct + (amount > 0 ? '&amount=' + amount : '');
  }
  function payHTML(f, e) {
    f = payTarget(f);
    var amt = +e.fee_total || 0, web = tossMeUrl(f.pay_toss_url, amt), app = web ? '' : tossApp(f, amt);
    var acct = f.pay_bank && f.pay_account;
    var h = '<div class="ap-pay"><div class="ap-pay-amt"><span>낼 금액</span><b>' + won(amt) + '원</b></div>';
    if (web) h += '<a class="ap-btn ap-wide" href="' + esc(web) + '" target="_blank" rel="noopener">토스로 송금하기</a>';
    if (app) h += '<a class="ap-btn ap-wide" href="' + esc(app) + '">토스로 송금하기</a>';
    if (acct) h += '<div class="ap-acct"><span>' + esc(f.pay_bank) + ' ' + esc(f.pay_account) + (f.pay_holder ? ' · 예금주 ' + esc(f.pay_holder) : '') + '</span>' +
      '<button type="button" class="ap-btn-line ap-btn-sm" data-copy="' + esc(String(f.pay_account).replace(/[^0-9-]/g, '')) + '">계좌번호 복사</button></div>';
    if (web || acct) h += '<p class="ap-note">보내는 분 이름은 신청한 분 이름(' + esc(e.name) + ')으로 해 주십시오.' + (app ? ' ‘토스로 송금하기’는 토스 앱이 있는 휴대폰에서 송금 화면으로 열립니다. 다른 기기에서는 계좌번호를 복사해 보내 주십시오.' : '') + '</p>';
    else h += '<p class="ap-note">납부 받는 계좌를 교회에서 정하고 있습니다. 정해지면 이곳에 계좌와 송금 단추가 나옵니다.</p>';
    h += '<button type="button" class="ap-btn-line ap-wide" data-paid="' + e.id + '">납부했습니다</button>';
    h += '<p class="ap-note">신청비를 보낸 뒤에 누르십시오. 신청서 확인에 ‘납부 완료’로 나옵니다. 교회가 통장 내역과 맞춰 봅니다.</p>';
    return h + '</div>';
  }
  /* 신청서 링크 공유 — 폰은 공유창(카톡 등), 그 밖에는 링크 복사. 링크는 forms.html?f=번호 (열면 그 신청서가 바로 열린다) */
  var SHARE = {};
  function shareUrl(id) { return new URL('forms.html?f=' + encodeURIComponent(id), location.href).href; }
  function shareForm(id, btn) {
    var f = SHARE[id] || { id: id, title: '신청서' }, url = shareUrl(id);
    var text = f.title + (whenPlace(f) ? '\n' + whenPlace(f) : '') + (untilText(f) ? '\n' + untilText(f) : '');
    var copy = function () {
      var done = function () { if (!btn) return; var o = btn.dataset.o || (btn.dataset.o = btn.textContent); btn.textContent = '링크를 복사했습니다'; setTimeout(function () { btn.textContent = o; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('링크를 복사하십시오', url); });
      else window.prompt('링크를 복사하십시오', url);
    };
    if (navigator.share) navigator.share({ title: f.title, text: text, url: url }).catch(function (er) { if (!er || er.name !== 'AbortError') copy(); });
    else copy();
  }
  function copyText(txt, btn) {
    var done = function () { if (!btn) return; var o = btn.textContent; btn.textContent = '복사했습니다'; setTimeout(function () { btn.textContent = o; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { window.prompt('계좌번호를 복사하십시오', txt); });
    else window.prompt('계좌번호를 복사하십시오', txt);
  }

  function msgHTML(e, withForm, f) {
    if (!e.admin_msg) return '';
    var unread = !e.msg_read_at;
    return '<div class="ap-msg' + (unread ? '' : ' is-old') + '"><p class="ap-msg-hd">교회에서 보낸 안내' + (withForm && f ? ' · ' + esc(f.title) : '') + (e.admin_msg_at ? ' · ' + esc(dayText(e.admin_msg_at)) : '') + '</p>' +
      '<p class="ap-msg-tx">' + nl2br(e.admin_msg) + '</p>' +
      (unread ? '<button type="button" class="ap-btn-line" data-read="' + e.id + '">확인했습니다</button>' : '') + '</div>';
  }

  /* ── 자료 ── */
  function loadOpen() { return rpc('app_open_forms').then(function (l) { return l || []; }); }
  function loadForm(id) { return api('GET', 'app_forms?id=eq.' + encodeURIComponent(id) + '&select=*').then(function (r) { return (r || [])[0] || null; }); }
  function loadMine() {
    var s = sess(); if (!s) return Promise.resolve([]);
    return api('GET', 'app_entries?user_id=eq.' + s.uid + '&select=*,form:app_forms(*)&order=created_at.desc').then(function (r) { return r || []; });
  }
  function loadEntry(formId) {
    var s = sess(); if (!s) return Promise.resolve(null);
    return api('GET', 'app_entries?form_id=eq.' + encodeURIComponent(formId) + '&user_id=eq.' + s.uid + '&select=*').then(function (r) { return (r || [])[0] || null; });
  }
  function loadProfile() {
    var s = sess(); if (!s) return Promise.resolve({});
    return api('GET', 'profiles?id=eq.' + s.uid + '&select=name,phone').then(function (r) { return (r || [])[0] || {}; }).catch(function () { return {}; });
  }

  /* ── 바뀌면 다시 그릴 곳들(신청서 페이지·대시보드 카드) ── */
  var watchers = [];
  function changed() { watchers.forEach(function (fn) { try { fn(); } catch (e) { } }); }

  /* ── 창(모달) ── */
  var modal = null, afterClose = null;
  function closeDom() {
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
    if (afterClose) { var f = afterClose; afterClose = null; f(); }
  }
  function closeModal() { if (modal && modal.hidden) return; if (window.ModalNav && window.ModalNav.close()) return; closeDom(); }
  function openModal(html, wire) {
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal ap-modal'; modal.hidden = true;
      modal.innerHTML = '<div class="modal-backdrop" data-apclose></div><div class="modal-box" role="dialog" aria-modal="true" aria-label="신청서"><button type="button" class="modal-close" data-apclose aria-label="닫기">&times;</button><div class="ap-mbody"></div></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', function (ev) { if (ev.target.closest('[data-apclose]')) closeModal(); });
      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && modal && !modal.hidden) closeModal(); });
    }
    var was = !modal.hidden, body = modal.querySelector('.ap-mbody');
    body.innerHTML = html;
    modal.hidden = false; document.body.style.overflow = 'hidden';
    var box = modal.querySelector('.modal-box'); if (box) box.scrollTop = 0;
    if (!was && window.ModalNav) window.ModalNav.open(closeDom);
    if (wire) wire(body);
  }
  function loadingHTML() { return '<p class="qt-loading" style="margin:20px 0">불러오는 중…</p>'; }
  function errorHTML(e) {
    return '<h3 class="ap-title">신청서를 불러오지 못했습니다</h3><p class="ap-text">' + (notReady(e) ? '신청서 기능을 준비하고 있습니다. 잠시 뒤에 다시 열어 주십시오.' : '잠시 뒤에 다시 해 주십시오.') + '</p>';
  }
  function openLogin() {
    var m = document.getElementById('authModal');
    if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; }
  }
  function needLogin(text) {
    openModal('<p class="ap-eye">신청서</p><h3 class="ap-title">로그인이 필요합니다</h3><p class="ap-text">' + esc(text) + '</p>' +
      '<div class="ap-actions"><button type="button" class="ap-btn" data-login>로그인</button><button type="button" class="ap-btn-line ap-quiet" data-apclose>닫기</button></div>', function (b) {
      b.querySelector('[data-login]').onclick = function () { afterClose = openLogin; closeModal(); };
    });
  }

  /* ── 신청하기 / 고치기 ── */
  function openApply(formId, edit) {
    if (!sess()) { needLogin('신청은 로그인한 뒤에 할 수 있습니다. 로그인하면 신청한 내용과 납부 상태도 볼 수 있습니다.'); return; }
    openModal(loadingHTML());
    Promise.all([loadForm(formId), loadEntry(formId), loadProfile()]).then(function (r) {
      var f = r[0], e = r[1], p = r[2];
      if (!f) { openModal('<h3 class="ap-title">신청서를 찾을 수 없습니다</h3><p class="ap-text">교회에서 내린 신청서입니다.</p>'); return; }
      if (e && e.status === 'active' && !edit) { showStatus(f, e); return; }
      if (!isOpen(f)) { showStatus(f, e); return; }
      // 학습·세례·입교: 담임목사가 정한 대상 종류·알림 문구(app_my_target_info, 1700) + 내 교적으로 본 신청 자격(app_my_baptism_status, 1900)
      //   SQL 실행 전이면 둘 다 없이(null) 고르는 그대로
      //   유아세례 신청 함수(app_submit_infant, 2100)가 있는지는 없는 신청서 번호(0)로 물어본다 — 쓰지 않고 'form' 으로 돌아온다
      if (f.kind === 'baptism') return Promise.all([
        rpc('app_my_target_info').then(function (ts) { return (ts || []).filter(function (x) { return String(x.form_id) === String(f.id); })[0] || null; }, function () { return null; }),
        rpc('app_my_baptism_status').catch(function () { return null; }),
        rpc('app_submit_infant', { p_form: 0, p_name: '', p_phone: '', p_children: [] }).then(function (r) { return !!(r && r.why); }, function () { return false; })
      ]).then(function (x) { showBaptism(f, e, p, x[0], x[1], x[2]); });
      showForm(f, e, p);
    }).catch(function (e) { openModal(errorHTML(e)); });
  }
  /* 안내 그림(app_forms.image_url, 2026-10-10) — 코스 약도·포스터. 누르면 새 창에서 크게 */
  function imgHTML(f) {
    var u = String((f && f.image_url) || '').trim(); if (!/^(https?:\/\/|images\/)/i.test(u)) return '';
    return '<a class="ap-img" href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="' + esc(f.title) + ' 안내 그림"></a><p class="ap-imgnote">그림을 누르면 크게 볼 수 있습니다.</p>';
  }
  /* 안내만 보기(로그인 없이) — 공지사항 '코스·안내 보기' */
  function openInfo(f) {
    if (!f) return;
    if (f.kind === 'baptism' && sess()) { openApply(f.id); return; }   // 학습·세례·입교: 여는 순간 교적으로 자격을 안내한다
    openModal(headHTML(f, '안내') + (f.summary ? '<p class="ap-text">' + esc(f.summary) + '</p>' : '') + (f.body ? '<div class="ap-body">' + nl2br(f.body) + '</div>' : '') + imgHTML(f) +
      '<div class="ap-actions"><button type="button" class="ap-btn" data-go="apply">신청하기</button><button type="button" class="ap-btn-line" data-go="status">신청 확인</button></div>',
      function (body) {
        Array.prototype.forEach.call(body.querySelectorAll('[data-go]'), function (b) { b.onclick = function () { if (b.getAttribute('data-go') === 'apply') openApply(f.id); else openStatus(f.id); }; });
      });
  }
  function headHTML(f, eye) {
    return '<p class="ap-eye">' + esc(eye) + '</p><h3 class="ap-title">' + esc(f.title) + '</h3>' +
      (whenPlace(f) ? '<p class="ap-meta">' + esc(whenPlace(f)) + '</p>' : '') +
      '<p class="ap-meta">' + esc(feeText(f)) + (untilText(f) ? ' · ' + esc(untilText(f)) : '') + '</p>';
  }
  /* ── 학습·세례·입교 신청 (2026-10-25 담임목사 지시, supabase/20261025_1300 · 1700 · 1900)
       신청 화면을 열면 내 교적(신급·등록일·학습일·생년월일)으로 신청 자격과 종류를 안내하고(app_my_baptism_status, 1900),
       학습 · 세례 · 입교 가운데 하나를 고른다. 담임목사가 정한 대상 종류가 있으면 그 종류로 고정한다(app_my_target_info, 1700).
       기준은 목회행정 대상 선정(forms-admin.js baptTargets)과 같다. 신청비 없음. 신청한 뒤에는 강의실로 바로 간다.
       유아세례(2026-10-25 담임목사 "유아세례가 없습니다"): 부모가 자녀(만 13세까지) 이름·생년월일을 적어 신청 —
         app_submit_infant(supabase/20261025_2100). 이미 세례교인인 분은 학습·세례·입교 대신 유아세례만 고를 수 있다.
         서버 함수가 아직 없으면(2100 실행 전) 유아세례는 '준비 중'으로 고를 수 없게 둔다.
       문답 칸은 없앴다(2026-10-25) — 예전 신청서에 질문이 있으면 그대로 보여 준다 ── */
  var BAPT_KINDS = [
    ['학습', '처음 믿고 교회에 등록한 지 6개월이 지난 분 (만 14세 이상)'],
    ['세례', '학습을 받고 6개월이 지난 분'],
    ['입교', '유아세례를 받고 만 14세가 된 분'],
    ['유아세례', '자녀(만 13세까지)에게 세례를 받게 하려는 부모 — 부모 중 한 분 이상 세례교인(입교인)']
  ];
  var SELF_KINDS = ['학습', '세례', '입교'], INFANT = '유아세례', MAX_KIDS = 5;
  var LEGACY_BAPT = '세례(입교)';   // 1900 실행 전 서버가 받는 옛 종류(세례·입교를 하나로)
  function qParts(q) {   // '[학습] 질문' · '[세례] 질문' · '질문' → { text, only: '학습' | '세례' | '' }
    var m = /^\[(학습|세례)\]\s*/.exec(String(q || ''));
    return m ? { text: String(q).slice(m[0].length), only: m[1] } : { text: String(q || ''), only: '' };
  }
  function qShows(only, kind) { return !only || (only === '학습' ? kind === '학습' : !!kind && kind !== '학습'); }
  function dotYmd(v) { return v ? String(v).slice(0, 10).replace(/-/g, '.') : ''; }
  // 교적으로 본 신청 자격 → 안내 상자 · 고를 수 없는 종류(deny) · 권하는 종류(rec) · 부모로서 세례교인인가(parent: true/false/null 모름)
  function eligOf(st) {
    var o = { html: '', deny: {}, rec: '', parent: null };
    if (!st || !st.ok) return o;
    var k = st.kind || '', base = k === '학습' ? '교회 등록일 ' + dotYmd(st.basis) : k === '세례' ? '학습일 ' + dotYmd(st.basis) : '';
    var box = function (cls, hd, tx, extra) { return '<div class="ap-msg ap-elig ' + cls + '"><p class="ap-msg-hd">' + hd + '</p><p class="ap-msg-tx">' + tx + '</p>' + (extra || '') + '</div>'; };
    var office = ' 교적 내용이 다르면 교회 사무실(담임목사님)에 말씀해 주십시오.';
    var denySelf = function () { SELF_KINDS.forEach(function (x) { o.deny[x] = 1; }); };
    o.parent = st.st === 'done' ? true : (st.st === 'nolink' || st.st === 'nogj') ? null : false;
    if (st.st === 'ok') {
      o.rec = k;
      o.html = box('is-ok', '✅ 신청하실 수 있습니다', '교적으로 확인했습니다 — <b>‘' + esc(k) + '’</b> 신청 대상이십니다' +
        (k === '입교' ? ' (유아세례 · 만 ' + esc(st.age) + '세).' : base ? ' (' + esc(base) + ' · 6개월이 지났습니다).' : '.') + ' 아래에서 ‘' + esc(k) + '’을 골라 신청해 주십시오.');
    } else if (st.st === 'check') {
      o.rec = k;
      o.html = box('', 'ℹ️ 교적 확인이 필요합니다', esc(st.why || '교적에 날짜가 비어 있습니다') + '. 교적의 신급으로는 <b>‘' + esc(k) + '’</b> 신청에 해당합니다. 신청하시면 담임목사님이 교적을 확인합니다.');
    } else if (st.st === 'wait') {
      denySelf();
      o.html = box('is-stop', '⏳ 아직 신청할 때가 아닙니다', '<b>‘' + esc(k) + '’</b> 신청은 <b>' + esc(dotYmd(st.from)) + '</b>부터 할 수 있습니다 — ' +
        (k === '입교' ? '만 14세가 되어야 입교 문답을 받습니다.' : esc(base) + '에서 6개월이 지나야 합니다.') + office);
    } else if (st.st === 'done') {
      denySelf(); o.rec = INFANT;
      o.html = box('', 'ℹ️ 이미 세례(입교)교인이십니다', '교적의 신급이 ‘' + esc(st.grade) + '’이어서 학습·세례·입교 신청 대상은 아니십니다. 자녀(만 13세까지)에게 유아·어린이 세례를 받게 하시려면 아래 <b>‘유아세례’</b>에 자녀 이름과 생년월일을 적어 신청해 주십시오.');
    } else if (st.st === 'young') {
      denySelf(); o.deny[INFANT] = 1;
      o.html = box('is-stop', '만 14세 미만입니다', '만 14세 미만은 학습·세례 대신 부모님의 신앙고백으로 유아·어린이 세례를 받습니다. 부모님께서 이 신청서의 ‘유아세례’로 신청해 주십시오.',
        '<a class="ap-btn-line" href="classroom.html#infant">강의실 유아세례 과정(부모 교육)</a>');
    } else if (st.st === 'nolink' || st.st === 'nogj') {
      o.html = box('', 'ℹ️ 교적으로 자격을 확인하지 못했습니다', (st.st === 'nolink' ? '계정이 아직 교적과 연결되지 않았습니다.' : '교적에서 찾지 못했습니다.') + ' 아래 기준을 보고 알맞은 것을 고르시면 교회가 교적을 확인합니다.');
    }
    return o;
  }
  // 자녀 나이 → 유아세례(만 6세까지) · 어린이세례(만 7~13세) · 만 14세 이상은 받지 않음
  function kidAge(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); if (!m) return null;
    var now = new Date(), a = now.getFullYear() - +m[1];
    if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3])) a--;
    return a;
  }
  function kidRite(age) { return age == null || age < 0 ? '' : age <= 6 ? '유아세례' : age <= 13 ? '어린이세례' : ''; }
  function kidsOf(e) { return partsOf(e).filter(function (x) { return x.kind === 'minor'; }); }
  function kidText(x) { return x.name + (x.birth ? ' (' + dotYmd(x.birth) + (x.rite ? ' · ' + x.rite : '') + ')' : ''); }
  // 신청한 뒤: 강의실 바로 가기 (학습 → 학습 과정, 세례·입교 → 세례(입교) 과정, 유아세례 → 유아세례 과정(부모 교육))
  function classroomHTML(kind) {
    var inf = kind === INFANT, c = kind === '학습' ? 'learn' : inf ? 'infant' : 'baptism', t = kind === '학습' ? '학습 과정' : inf ? '유아세례 과정(부모 교육)' : '세례(입교) 과정';
    return '<div class="ap-msg ap-cr"><p class="ap-msg-hd">📖 다음 차례 — 강의실</p><p class="ap-msg-tx">' + (inf ? '자녀가 세례받기 전에 부모님이' : '당회 문답을 받기 전에') + ' 강의실 <b>‘' + t + '’</b>을 공부하고 이수 시험(20문항 · 70점 이상)을 보십시오. 이수하면 교적에 기록됩니다.</p>' +
      '<a class="ap-btn ap-crgo" href="classroom.html#' + c + '">강의실 바로 가기 ›</a></div>';
  }
  function showBaptism(f, e, p, ti, st, infantOk) {
    var cur = e || {}, qs = Array.isArray(f.questions) ? f.questions : [], ans = Array.isArray(cur.answers) ? cur.answers : [];
    // 담임목사가 정한 대상 종류가 있으면 학습·세례·입교는 그 종류로 고정한다(유아세례는 부모가 자녀를 위해 따로 신청)
    var lock = ti && ti.kind ? ti.kind : '', el = lock ? { html: '', deny: {}, rec: lock, parent: null } : eligOf(st);
    if (lock) SELF_KINDS.forEach(function (x) { if (x !== lock) el.deny[x] = 1; });
    if (!infantOk) el.deny[INFANT] = 1;
    var can = function (k) { return !!k && !el.deny[k]; };
    var prev = cur.apply_kind === LEGACY_BAPT ? (el.rec !== '학습' ? el.rec : '') : (cur.apply_kind || '');
    var pick0 = [lock, prev, el.rec].filter(can)[0] || '';
    var allDenied = BAPT_KINDS.every(function (k) { return el.deny[k[0]]; });
    var kids0 = cur.apply_kind === INFANT ? kidsOf(cur) : [];
    if (!kids0.length) kids0 = [{ name: '', birth: '' }];
    var today = new Date(), todayYmd = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
    var kidRow = function (x) {
      return '<div class="ap-kid"><input name="kn" maxlength="40" placeholder="자녀 이름" value="' + esc(x.name || '') + '" aria-label="자녀 이름">' +
        '<input name="kb" type="date" max="' + todayYmd + '" value="' + esc(x.birth || '') + '" aria-label="자녀 생년월일">' +
        '<button type="button" class="ap-kid-x" data-kid-x aria-label="이 자녀 빼기">✕</button><span class="ap-kid-r"></span></div>';
    };
    var html = headHTML(f, e ? '신청 고치기' : '신청서') +
      (ti ? '<div class="ap-msg"><p class="ap-msg-hd">📖 ' + esc(ti.kind ? ti.kind + ' 신청 대상' : '신청 대상') + '으로 선정되셨습니다</p>' + (ti.note ? '<p class="ap-msg-tx">' + nl2br(ti.note) + '</p>' : '') +
        '<a class="ap-btn-line" href="classroom.html#' + (ti.kind === '학습' ? 'learn' : 'baptism') + '">강의실에서 문답 공부하기</a></div>' : '') +
      el.html +
      (f.summary ? '<p class="ap-text">' + esc(f.summary) + '</p>' : '') +
      (f.body ? '<div class="ap-body">' + nl2br(f.body) + '</div>' : '') +
      '<form class="ap-form" novalidate>' +
      '<label class="ap-field"><span data-name-l>신청하는 분 이름</span><input name="name" maxlength="60" autocomplete="name" value="' + esc(cur.name || p.name || '') + '" required></label>' +
      '<label class="ap-field"><span>연락처</span><input name="phone" type="tel" inputmode="tel" maxlength="30" autocomplete="tel" placeholder="010-0000-0000" value="' + esc(cur.phone || p.phone || '') + '" required></label>' +
      '<fieldset class="ap-field ap-kinds"><legend>무엇을 신청하시나요 — 학습 · 세례 · 입교 · 유아세례 가운데 하나</legend>' +
        BAPT_KINDS.map(function (k) {
          var soon = k[0] === INFANT && !infantOk;
          return '<label class="ap-kind is-3"><span class="k"><input type="radio" name="apply" value="' + esc(k[0]) + '"' + (pick0 === k[0] ? ' checked' : '') + (el.deny[k[0]] ? ' disabled' : '') + '> ' + esc(k[0]) +
            (el.rec === k[0] && !lock ? '<i class="rec">교적 기준</i>' : '') + (soon ? '<i class="rec soon">준비 중</i>' : '') + '</span><span class="d">' + esc(k[1]) + '</span></label>';
        }).join('') +
        '<small data-kind-note>' + (lock ? '담임목사님이 정하신 신청 종류입니다.' : '총회 「학습·세례문답서」 기준입니다. 어릴 때 유아세례를 받으셨으면 ‘입교’를, 자녀의 세례는 ‘유아세례’를 고르세요.') + '</small></fieldset>' +
      '<div class="ap-field ap-kids" data-kids hidden><span>세례받을 자녀 <small>· 만 6세까지 유아세례, 만 7~13세 어린이세례</small></span>' +
        '<div data-kid-list>' + kids0.map(kidRow).join('') + '</div>' +
        '<button type="button" class="ap-btn-line ap-kid-add" data-kid-add>＋ 자녀 한 명 더</button>' +
        '<p class="ap-note" data-kid-note style="margin:4px 0 0">' + (el.parent === true ? '교적으로 세례교인(입교인)이심을 확인했습니다.' : el.parent === false ? '교적에는 아직 세례교인이 아니십니다. 배우자(자녀의 다른 부모)께서 세례교인(입교인)이시면 신청하실 수 있고, 담임목사님이 확인합니다.' : '부모 중 한 분 이상이 세례교인(입교인)이어야 합니다. 담임목사님이 교적으로 확인합니다.') + '</p></div>' +
      (qs.length ? '<div class="ap-qa"><p class="ap-qa-h">문답 <small>· 아는 대로 정성껏 적어 주십시오</small></p><p class="ap-note" data-qa-hint hidden>위에서 학습·세례·입교 가운데 하나를 고르면, 그에 맞는 문답이 나옵니다.</p>' + qs.map(function (q, i) {
        var qp = qParts(q);
        return '<label class="ap-field" data-only="' + esc(qp.only) + '"><span><em data-n></em>' + esc(qp.text) + '</span><textarea name="a' + i + '" rows="3" maxlength="3000" data-i="' + i + '">' + esc(ans[i] || '') + '</textarea></label>';
      }).join('') + '</div>' : '') +
      '<p class="ap-err" hidden></p>' +
      '<button type="submit" class="ap-btn ap-wide"' + (allDenied ? ' disabled' : '') + '>' + (allDenied ? '지금은 신청할 수 없습니다' : e && e.status === 'active' ? '고친 내용 저장' : '신청하기') + '</button>' +
      '<p class="ap-note">한 계정으로 한 번 신청하며, 다시 내면 앞의 신청을 고칩니다. 신청 기간 안에는 언제든 고칠 수 있습니다. 신청비는 없습니다.</p></form>';
    openModal(html, function (b) {
      var form = b.querySelector('form'), err = b.querySelector('.ap-err'), btn = form.querySelector('button[type=submit]');
      var label = e && e.status === 'active' ? '고친 내용 저장' : '신청하기';
      function fail(msg, el2) { err.textContent = msg; err.hidden = false; btn.disabled = false; btn.textContent = label; if (el2 && el2.focus) el2.focus(); }
      var qLabels = Array.prototype.slice.call(form.querySelectorAll('.ap-qa label[data-only]'));
      var note = form.querySelector('[data-kind-note]'), note0 = note.textContent;
      var kidsBox = form.querySelector('[data-kids]'), kidList = form.querySelector('[data-kid-list]'), kidAdd = form.querySelector('[data-kid-add]');
      function paintKids() {   // 자녀마다 나이 → 유아세례·어린이세례 표시, 5명까지
        var rows = kidList.querySelectorAll('.ap-kid');
        Array.prototype.forEach.call(rows, function (r) {
          var a = kidAge(r.querySelector('[name=kb]').value), lab = r.querySelector('.ap-kid-r');
          lab.textContent = a == null ? '' : a < 0 ? '생년월일을 확인해 주십시오' : a <= 13 ? '만 ' + a + '세 · ' + kidRite(a) : '만 ' + a + '세 — 만 14세 이상은 본인이 ‘학습’으로 신청합니다';
          lab.classList.toggle('is-warn', a != null && (a < 0 || a > 13));
          r.querySelector('[data-kid-x]').hidden = rows.length < 2;
        });
        kidAdd.hidden = rows.length >= MAX_KIDS;
      }
      function wireKids() {
        Array.prototype.forEach.call(kidList.querySelectorAll('.ap-kid'), function (r) {
          r.querySelector('[name=kb]').oninput = paintKids;
          r.querySelector('[data-kid-x]').onclick = function () { r.remove(); paintKids(); };
        });
        paintKids();
      }
      kidAdd.onclick = function () { kidList.insertAdjacentHTML('beforeend', kidRow({})); wireKids(); var ins = kidList.querySelectorAll('[name=kn]'); ins[ins.length - 1].focus(); };
      wireKids();
      function paint() {   // 고른 종류에 맞는 질문만 보이고 번호를 다시 매긴다 · 교적 기준과 다르게 고르면 알려 준다 · 유아세례면 자녀 칸
        var pick = form.querySelector('input[name=apply]:checked'), kind = pick ? pick.value : '', n = 0;
        kidsBox.hidden = kind !== INFANT;
        form.querySelector('[data-name-l]').textContent = kind === INFANT ? '신청하는 분(부모) 이름' : '신청하는 분 이름';
        qLabels.forEach(function (l) {
          var show = kind !== INFANT && qShows(l.getAttribute('data-only'), kind);
          l.hidden = !show; if (show) { n++; l.querySelector('em[data-n]').textContent = n + '. '; }
        });
        var hint = form.querySelector('[data-qa-hint]'); if (hint) hint.hidden = !!kind || !qLabels.some(function (l) { return l.getAttribute('data-only'); });
        var off = !lock && el.rec && kind && kind !== el.rec && kind !== INFANT;
        note.textContent = off ? '교적 기준으로는 ‘' + el.rec + '’ 대상이십니다. ‘' + kind + '’(으)로 신청하시면 담임목사님이 확인합니다.' : note0;
        note.classList.toggle('is-warn', !!off);
      }
      Array.prototype.forEach.call(form.querySelectorAll('input[name=apply]'), function (r) { r.onchange = paint; });
      paint();
      form.onsubmit = function (ev) {
        ev.preventDefault();
        var name = form.name.value.trim(), phone = form.phone.value.trim(), pick = form.querySelector('input[name=apply]:checked');
        if (allDenied || (pick && el.deny[pick.value])) return;
        if (!name) return fail('신청하는 분 이름을 적어 주십시오.', form.name);
        if (!phone) return fail('연락처를 적어 주십시오.', form.phone);
        if (!pick) return fail('학습·세례·입교·유아세례 가운데 하나를 골라 주십시오.');
        if (pick.value === INFANT) {   // 유아세례: 부모가 자녀를 적어 신청(app_submit_infant)
          var kids = [], bad = null;
          Array.prototype.forEach.call(kidList.querySelectorAll('.ap-kid'), function (r) {
            var kn = r.querySelector('[name=kn]'), kb = r.querySelector('[name=kb]'), nm = kn.value.trim(), bd = kb.value, a = kidAge(bd);
            if (!nm && !bd) return;
            if (bad) return;
            if (!nm) bad = ['자녀 이름을 적어 주십시오.', kn];
            else if (a == null || a < 0) bad = [nm + ' — 생년월일을 적어 주십시오.', kb];
            else if (a > 13) bad = [nm + ' — 만 14세 이상은 유아·어린이 세례가 아니라 본인이 ‘학습’으로 신청합니다.', kb];
            else kids.push({ name: nm, birth: bd });
          });
          if (bad) return fail(bad[0], bad[1]);
          if (!kids.length) return fail('세례받을 자녀의 이름과 생년월일을 적어 주십시오.', kidList.querySelector('[name=kn]'));
          err.hidden = true; btn.disabled = true; btn.textContent = '보내는 중…';
          rpc('app_submit_infant', { p_form: f.id, p_name: name, p_phone: phone, p_children: kids }).then(function (r) {
            if (!r || !r.ok) throw new Error((r && r.error) || '신청하지 못했습니다.');
            changed();
            return loadEntry(f.id).then(function (e2) { showStatus(f, e2, r.updated ? '고친 내용을 저장했습니다.' : '자녀의 유아세례를 신청했습니다.'); });
          }).catch(function (e2) { fail(/^\{/.test(e2.message || '') || notReady(e2) ? '신청하지 못했습니다. 잠시 뒤에 다시 해 주십시오.' : e2.message); });
          return;
        }
        var answers = qs.map(function (_, i) { var l = qLabels[i]; return l && l.hidden ? '' : String(form['a' + i].value || '').trim(); });
        var miss = answers.findIndex(function (a, i) { return !a && !(qLabels[i] && qLabels[i].hidden); });
        if (miss >= 0) return fail('빈 문답이 있습니다. 모든 질문에 답을 적어 주십시오.', form['a' + miss]);
        err.hidden = true; btn.disabled = true; btn.textContent = '보내는 중…';
        var send = function (kind) { return rpc('app_submit_qa', { p_form: f.id, p_name: name, p_phone: phone, p_apply: kind, p_answers: answers }); };
        send(pick.value).then(function (r) {
          // 1900 실행 전 서버는 '학습' · '세례(입교)' 만 받는다 → 세례·입교는 옛 이름으로 다시 보낸다
          if (r && !r.ok && r.why === 'apply' && pick.value !== '학습') return send(LEGACY_BAPT);
          return r;
        }).then(function (r) {
          if (!r || !r.ok) throw new Error((r && r.error) || '신청하지 못했습니다.');
          changed();
          return loadEntry(f.id).then(function (e2) { showStatus(f, e2, r.updated ? '고친 내용을 저장했습니다.' : '신청했습니다.'); });
        }).catch(function (e2) { fail(/^\{/.test(e2.message || '') || notReady(e2) ? '신청하지 못했습니다. 잠시 뒤에 다시 해 주십시오.' : e2.message); });
      };
    });
  }
  function showForm(f, e, p) {
    var cur = e || {};
    var v = { adults: e ? e.adults : 1, minors: e ? e.minors : 0 };
    /* 참가자 이름 — 인원 단추로 칸이 늘고 준다. 줄였다 다시 늘리면 적어 둔 이름이 돌아온다 */
    var nm = { adults: [], minors: [] };
    partsOf(e).forEach(function (x) { nm[x.kind === 'minor' ? 'minors' : 'adults'].push(x.name); });
    if (!nm.adults[0]) nm.adults[0] = cur.name || p.name || '';
    var PL = plabel(f), askMinor = f.ask_minor !== false, paidLock = e && e.paid_at && e.status === 'active';
    var aFee = +f.fee_adult || 0, mFee = +f.fee_minor || 0;
    function countRow(k, label, sub) {
      return '<div class="ap-count"><span>' + label + '<small>' + sub + '</small></span><div class="ap-step">' +
        '<button type="button" data-k="' + k + '" data-d="-1" aria-label="' + label + ' 한 명 빼기">−</button><b data-v="' + k + '">' + v[k] + '</b>' +
        '<button type="button" data-k="' + k + '" data-d="1" aria-label="' + label + ' 한 명 더하기">+</button></div></div>';
    }
    var html = headHTML(f, e ? '신청 고치기' : '신청서') +
      (f.summary ? '<p class="ap-text">' + esc(f.summary) + '</p>' : '') +
      (f.body ? '<div class="ap-body">' + nl2br(f.body) + '</div>' : '') + imgHTML(f) +
      '<form class="ap-form" novalidate>' +
      '<label class="ap-field"><span>신청하는 분 이름</span><input name="name" maxlength="60" autocomplete="name" value="' + esc(cur.name || p.name || '') + '" required></label>' +
      '<label class="ap-field"><span>연락처</span><input name="phone" type="tel" inputmode="tel" maxlength="30" autocomplete="tel" placeholder="010-0000-0000" value="' + esc(cur.phone || p.phone || '') + '" required></label>' +
      (askMinor
        ? countRow('adults', '성인', aFee ? '1명 ' + won(aFee) + '원' : '무료') + countRow('minors', '미성년자', '만 19세 미만 · ' + (mFee ? '1명 ' + won(mFee) + '원' : '무료'))
        : countRow('adults', '인원', aFee ? '1명 ' + won(aFee) + '원' : '무료')) +
      '<div class="ap-names" data-names></div>' +
      (f.memo_label ? '<label class="ap-field"><span>' + esc(f.memo_label) + '</span><textarea name="memo" rows="3" maxlength="1000">' + esc(cur.memo || '') + '</textarea></label>' : '') +
      '<div class="ap-total"><span>신청비 합계</span><b data-total></b></div>' +
      (paidLock ? '<p class="ap-note">‘납부했습니다’를 누른 신청입니다. 금액이 바뀌는 인원 수정은 교회에 말씀해 주십시오.</p>' : '') +
      '<p class="ap-err" hidden></p>' +
      '<button type="submit" class="ap-btn ap-wide">' + (e && e.status === 'active' ? '고친 내용 저장' : '신청하기') + '</button>' +
      '<p class="ap-note">가족이 함께 오시면 인원에 함께 적어 주십시오. 한 계정으로 한 번 신청하며, 다시 내면 앞의 신청을 고칩니다.</p>' +
      '</form>';
    openModal(html, function (b) {
      var form = b.querySelector('form'), err = b.querySelector('.ap-err'), box = b.querySelector('[data-names]');
      function total() { return v.adults * aFee + (askMinor ? v.minors * mFee : 0); }
      function nameRows() {                     // 지금 인원에 맞는 이름 칸 — [{k, i, label}]
        var out = [], k, i;
        for (i = 0; i < v.adults; i++) out.push({ k: 'adults', i: i, label: (askMinor ? '성인 ' : PL + ' ') + (i + 1) });
        if (askMinor) for (i = 0; i < v.minors; i++) out.push({ k: 'minors', i: i, label: '미성년자 ' + (i + 1) });
        return out;
      }
      function drawNames(msg) {
        var rows = nameRows();
        box.innerHTML = '<p>' + esc(PL) + ' 이름 <small>· 한 분씩 적어 주십시오</small></p>' + rows.map(function (r) {
          return '<label class="ap-pname"><span>' + r.label + '</span><input data-k="' + r.k + '" data-i="' + r.i + '" maxlength="30" autocomplete="off" value="' + esc(nm[r.k][r.i] || '') + '" aria-label="' + r.label + ' 이름"></label>';
        }).join('') + '<p class="ap-nerr"' + (msg ? '' : ' hidden') + '>' + esc(msg || '') + '</p>';
        box.hidden = !rows.length;
        Array.prototype.forEach.call(box.querySelectorAll('input'), function (inp) {
          inp.oninput = function () { nm[inp.dataset.k][+inp.dataset.i] = inp.value; inp.classList.remove('is-bad'); };
        });
      }
      function markNames(keys, msg) {           // 문제 있는 이름 칸을 빨간 테두리로
        drawNames(msg);
        Array.prototype.forEach.call(box.querySelectorAll('input'), function (inp) { if (keys.indexOf(nameKey(inp.value)) >= 0) inp.classList.add('is-bad'); });
        var first = box.querySelector('input.is-bad'); if (first) first.focus();
      }
      function collect() {                      // 보낼 이름 — 성인 먼저, 그다음 미성년자
        return nameRows().map(function (r) { return String(nm[r.k][r.i] || '').trim(); });
      }
      /* 신청하는 분 이름을 고치면, 아직 손대지 않은 '성인 1'도 따라간다 */
      var autoFirst = !partsOf(e).length;
      form.name.addEventListener('input', function () { if (autoFirst) { nm.adults[0] = form.name.value; var i0 = box.querySelector('input[data-k="adults"][data-i="0"]'); if (i0) i0.value = form.name.value; } });
      box.addEventListener('input', function (ev) { if (ev.target.matches('input[data-k="adults"][data-i="0"]')) autoFirst = false; });
      function paint() {
        ['adults', 'minors'].forEach(function (k) {
          var el = b.querySelector('[data-v="' + k + '"]'); if (el) el.textContent = v[k];
          var minus = b.querySelector('[data-k="' + k + '"][data-d="-1"]'); if (minus) minus.disabled = v[k] <= 0;
          var plus = b.querySelector('[data-k="' + k + '"][data-d="1"]'); if (plus) plus.disabled = v[k] >= 50;
        });
        var t = total(); b.querySelector('[data-total]').textContent = t ? won(t) + '원' : '없음';
      }
      Array.prototype.forEach.call(b.querySelectorAll('.ap-step button'), function (btn) {
        btn.onclick = function () { var k = btn.dataset.k; v[k] = Math.max(0, Math.min(50, v[k] + (+btn.dataset.d))); paint(); drawNames(); };
      });
      paint(); drawNames();
      form.onsubmit = function (ev) {
        ev.preventDefault();
        var name = form.name.value.trim(), phone = form.phone.value.trim(), memo = form.memo ? form.memo.value.trim() : '';
        var bad = !name ? '신청하는 분 이름을 적어 주십시오.' : !phone ? '연락처를 적어 주십시오.' : (v.adults + (askMinor ? v.minors : 0)) < 1 ? '인원을 한 명 이상 적어 주십시오.' : '';
        if (bad) { err.textContent = bad; err.hidden = false; return; }
        err.hidden = true;
        var names = collect(), keys = names.map(nameKey), seen = {}, twice = [];
        var empty = names.some(function (n) { return !n; }), long = names.filter(function (n) { return n.length > 30; });
        keys.forEach(function (k, i) { if (k && seen[k] && !f.allow_same_name) twice.push(names[i]); seen[k] = 1; });   // allow_same_name(20261024_1810): 책 여러 권처럼 같은 이름을 받는 신청서
        if (empty) { markNames([''], PL + ' 이름을 모두 적어 주십시오.'); return; }
        if (long.length) { markNames(long.map(nameKey), '이름은 30자까지 적을 수 있습니다.'); return; }
        if (twice.length) { markNames(twice.map(nameKey), '같은 이름을 두 번 적었습니다: ' + twice.join(', ')); return; }
        drawNames();
        var btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = '보내는 중…';
        rpc('app_submit', { p_form: f.id, p_name: name, p_phone: phone, p_adults: v.adults, p_minors: askMinor ? v.minors : 0, p_memo: memo, p_names: names }).then(function (r) {
          if (r && !r.ok && (r.why === 'dup' || r.why === 'dupself')) {   // 이미 신청된 이름 — 그 칸을 표시
            markNames((r.names || []).map(nameKey), String(r.error || '').replace(/\.?$/, '.') + (r.why === 'dup' ? ' 같은 이름의 다른 분이면 이름 뒤에 구별할 말을 붙여 주십시오. 예: 홍길동(청년부)' : ''));
            btn.disabled = false; btn.textContent = e && e.status === 'active' ? '고친 내용 저장' : '신청하기';
            return;
          }
          if (r && !r.ok && r.why === 'pname') {
            drawNames(r.error);
            var bi = box.querySelectorAll('input')[r.index]; if (bi) { bi.classList.add('is-bad'); bi.focus(); }
            btn.disabled = false; btn.textContent = e && e.status === 'active' ? '고친 내용 저장' : '신청하기';
            return;
          }
          if (!r || !r.ok) throw new Error((r && r.error) || '신청하지 못했습니다.');
          changed();
          return loadEntry(f.id).then(function (e2) { showStatus(f, e2, r.updated ? '고친 내용을 저장했습니다.' : '신청했습니다.'); });
        }).catch(function (e2) {
          err.textContent = /^\{/.test(e2.message || '') || notReady(e2) ? '신청하지 못했습니다. 잠시 뒤에 다시 해 주십시오.' : e2.message;
          err.hidden = false; btn.disabled = false; btn.textContent = e && e.status === 'active' ? '고친 내용 저장' : '신청하기';
        });
      };
    });
  }

  /* ── 신청 확인 ── */
  function openStatus(formId) {
    if (!sess()) { needLogin('신청 확인은 로그인한 뒤에 할 수 있습니다.'); return; }
    openModal(loadingHTML());
    Promise.all([loadForm(formId), loadEntry(formId)]).then(function (r) {
      showStatus(r[0] || { id: formId, title: '교회에서 내린 신청서', published: false }, r[1]);
    }).catch(function (e) { openModal(errorHTML(e)); });
  }
  function showStatus(f, e, done) {
    SHARE[f.id] = f;
    var open = isOpen(f), html = headHTML(f, '신청 확인') + (done ? '<p class="ap-done">' + esc(done) + '</p>' : '');
    if (!e) {
      var before = f.open_at && new Date(f.open_at).getTime() > Date.now();
      html += (f.summary ? '<p class="ap-text">' + esc(f.summary) + '</p>' : '') + (f.body ? '<div class="ap-body">' + nl2br(f.body) + '</div>' : '') + imgHTML(f) +
        '<p class="ap-text">이 신청서에 아직 신청하지 않았습니다.</p>' +
        (open ? '<div class="ap-actions"><button type="button" class="ap-btn ap-wide" data-edit>신청하기</button></div>'
          : '<p class="ap-note">' + (before ? esc(dtText(f.open_at)) + '부터 신청을 받습니다.' : '신청이 마감되었습니다.') + '</p>');
    } else {
      var active = e.status === 'active', due = active && e.fee_total > 0 && !e.paid_at;
      html += '<div style="margin-top:12px">' + chip(e) + '</div>' + msgHTML(e) +
        '<dl class="ap-dl"><dt>신청한 분</dt><dd>' + esc(e.name) + '</dd><dt>연락처</dt><dd>' + esc(e.phone) + '</dd>' +
        (f.kind === 'baptism'
          ? '<dt>신청 종류</dt><dd>' + esc(e.apply_kind || '') + '</dd>' +
            (e.apply_kind === INFANT && kidsOf(e).length ? '<dt>자녀</dt><dd>' + kidsOf(e).map(function (x) { return esc(kidText(x)); }).join('<br>') + '</dd>' : '')
          : '<dt>인원</dt><dd>' + esc(peopleText(e, f)) + '</dd>' +
            (partText(e, f) ? '<dt>' + esc(plabel(f)) + '</dt><dd>' + esc(partText(e, f)) + '</dd>' : '') +
            (e.memo ? '<dt>' + esc(f.memo_label || '메모') + '</dt><dd>' + nl2br(e.memo) + '</dd>' : '') +
            '<dt>신청비</dt><dd>' + (e.fee_total > 0 ? won(e.fee_total) + '원' : '없음') + '</dd>') +
        '<dt>신청한 날</dt><dd>' + esc(dtText(e.created_at)) + '</dd>' +
        (e.paid_at ? '<dt>납부</dt><dd>' + esc(dtText(e.paid_at)) + (e.paid_by === 'admin' ? ' · 교회에서 납부 처리' : ' · ‘납부했습니다’') + (e.confirmed_at ? ' · 교회가 입금을 확인했습니다' : '') + '</dd>' : '') +
        '</dl>' +
        (f.kind === 'baptism' && Array.isArray(e.answers) && e.answers.some(Boolean) ? '<div class="ap-qa-view"><p class="ap-qa-h">내가 적은 문답</p>' + (function () { var n = 0; return e.answers.map(function (a, i) {
          if (!a) return ''; n++; return '<div class="ap-qa-i"><b>' + n + '. ' + esc(qParts((f.questions || [])[i]).text) + '</b><p>' + nl2br(a) + '</p></div>'; }).join(''); })() + '</div>' : '') +
        (due ? payHTML(f, e) : '') +
        (f.kind === 'baptism' && active ? classroomHTML(e.apply_kind) : '') +
        '<div class="ap-actions">' +
        (active && open ? '<button type="button" class="ap-btn-line" data-edit>신청 고치기</button>' : '') +
        (active && !e.paid_at ? '<button type="button" class="ap-btn-line ap-quiet" data-cancel="' + e.id + '">신청 취소</button>' : '') +
        (!active && open ? '<button type="button" class="ap-btn" data-edit>다시 신청하기</button>' : '') +
        (open ? '<button type="button" class="ap-btn-line" data-share="' + f.id + '">링크 공유</button>' : '') +
        '</div>' +
        (active && e.paid_at && !e.confirmed_at && e.paid_by === 'self' ? '<p class="ap-note">교회가 통장 내역과 맞춰 본 뒤 ‘교회 확인’이 붙습니다. 입금이 확인되지 않으면 이곳에 안내가 옵니다.</p>' : '');
    }
    openModal(html, function (b) { wireActions(b, f.id, function (msg) { reloadStatus(f.id, msg); }); });
  }
  function reloadStatus(formId, msg) {
    Promise.all([loadForm(formId), loadEntry(formId)]).then(function (r) { showStatus(r[0] || { id: formId, title: '교회에서 내린 신청서' }, r[1], msg); });
  }
  /* 단추 공통: 고치기·취소·납부했습니다·확인했습니다·계좌 복사 */
  function wireActions(b, formId, after) {
    Array.prototype.forEach.call(b.querySelectorAll('[data-edit]'), function (x) { x.onclick = function () { openApply(x.dataset.edit || formId, true); }; });
    Array.prototype.forEach.call(b.querySelectorAll('[data-copy]'), function (x) { x.onclick = function () { copyText(x.dataset.copy, x); }; });
    Array.prototype.forEach.call(b.querySelectorAll('[data-share]'), function (x) { x.onclick = function () { shareForm(x.dataset.share, x); }; });
    Array.prototype.forEach.call(b.querySelectorAll('[data-cancel]'), function (x) {
      x.onclick = function () {
        if (!confirm('이 신청을 취소할까요?\n신청 기간 안에는 다시 신청할 수 있습니다.')) return;
        x.disabled = true;
        rpc('app_cancel', { p_id: +x.dataset.cancel }).then(function (r) {
          if (!r || !r.ok) throw new Error((r && r.error) || '취소하지 못했습니다.');
          changed(); after('신청을 취소했습니다.');
        }).catch(function (e) { alert(e.message); x.disabled = false; });
      };
    });
    Array.prototype.forEach.call(b.querySelectorAll('[data-paid]'), function (x) {
      x.onclick = function () {
        if (!confirm('신청비를 보내셨습니까?\n확인을 누르면 신청서 확인에 ‘납부 완료’로 나옵니다.')) return;
        x.disabled = true;
        rpc('app_mark_paid', { p_id: +x.dataset.paid }).then(function (r) {
          if (!r || !r.ok) throw new Error((r && r.error) || '표시하지 못했습니다.');
          changed(); after('납부 완료로 표시했습니다.');
        }).catch(function (e) { alert(e.message); x.disabled = false; });
      };
    });
    Array.prototype.forEach.call(b.querySelectorAll('[data-read]'), function (x) {
      x.onclick = function () {
        x.disabled = true;
        rpc('app_msg_read', { p_id: +x.dataset.read }).then(function () { changed(); after(''); }).catch(function () { x.disabled = false; });
      };
    });
  }

  /* ── 신청 목록 (대시보드·신청서 페이지) ── */
  function listHTML(entries, full) {
    return '<ul class="ap-list">' + entries.map(function (e) {
      var f = e.form || { title: '교회에서 내린 신청서' }, st = stateOf(e);
      return '<li class="ap-item' + (e.status === 'cancelled' ? ' is-off' : '') + '"><div class="ap-item-hd"><b>' + esc(f.title) + '</b>' + chip(e) + '</div>' +
        (whenPlace(f) ? '<p class="ap-item-meta">' + esc(whenPlace(f)) + '</p>' : '') +
        '<p class="ap-item-meta">' + esc(peopleText(e, f)) + ' · ' + (e.fee_total > 0 ? won(e.fee_total) + '원' : '신청비 없음') + ' · ' + esc(dayText(e.created_at)) + ' 신청</p>' +
        (full ? '<p class="ap-item-meta">신청한 분 ' + esc(e.name) + (e.phone ? ' · ' + esc(e.phone) : '') + '</p>' +
          (partText(e, f) ? '<p class="ap-item-meta">' + esc(plabel(f)) + ' ' + esc(partText(e, f)) + '</p>' : '') +
          (e.memo ? '<p class="ap-item-meta">' + esc(memoLine(f, e)) + '</p>' : '') +
          (e.paid_at ? '<p class="ap-item-meta">납부 ' + esc(dtText(e.paid_at)) + (e.confirmed_at ? ' · 교회 확인' : '') + '</p>' : '') +
          msgHTML(e) : '') +
        '<button type="button" class="ap-link" data-status="' + e.form_id + '">' + (st[0] === 'due' ? '납부하기 · 자세히' : '자세히') + '</button></li>';
    }).join('') + '</ul>';
  }
  function wireList(el) {
    Array.prototype.forEach.call(el.querySelectorAll('[data-status]'), function (x) { x.onclick = function () { openStatus(x.dataset.status); }; });
    Array.prototype.forEach.call(el.querySelectorAll('[data-apply]'), function (x) { x.onclick = function () { openApply(x.dataset.apply); }; });
    Array.prototype.forEach.call(el.querySelectorAll('[data-read]'), function (x) {
      x.onclick = function () { x.disabled = true; rpc('app_msg_read', { p_id: +x.dataset.read }).then(changed).catch(function () { x.disabled = false; }); };
    });
  }

  /* ── 대시보드 카드 — '신청서' (헌금 바로 위) ── */
  function mineCard(el, opts) {
    if (!el) return;
    opts = opts || {};
    var head = '<div class="form-card ap-card" style="padding:16px 18px"><h3 class="ap-card-h">신청서</h3>';
    function draw() {
      if (!el.innerHTML) el.innerHTML = head + '<p class="qt-loading">불러오는 중…</p></div>';
      Promise.all([loadMine(), loadOpen().catch(function () { return []; })]).then(function (r) {
        var mine = r[0], open = r[1], applied = {};
        mine.forEach(function (e) { applied[e.form_id] = e; });
        var fresh = open.filter(function (f) { return !applied[f.id] || applied[f.id].status !== 'active'; });
        var unread = mine.filter(function (e) { return e.admin_msg && !e.msg_read_at; });
        var html = head + unread.map(function (e) { return msgHTML(e, true, e.form); }).join('');
        if (fresh.length) html += '<div class="ap-open">' + fresh.map(function (f) {
          return '<div class="ap-open-row"><div><b>' + esc(f.title) + '</b><span>' + esc([eventText(f), feeText(f)].filter(Boolean).join(' · ')) + '</span></div>' +
            '<button type="button" class="ap-btn ap-btn-sm" data-apply="' + f.id + '">신청하기</button></div>';
        }).join('') + '</div>';
        if (!mine.length) html += '<p class="ap-empty"' + (fresh.length ? ' style="margin-top:8px"' : '') + '>아직 작성한 신청서가 없습니다.</p>';
        else html += listHTML(mine.slice(0, 3), false) +
          '<details class="ap-more"' + (opts.openMore ? ' open' : '') + '><summary>신청서 작성 상세 보기 (' + mine.length + '건)</summary>' + listHTML(mine, true) + '</details>';
        el.innerHTML = html + '</div>';
        var det = el.querySelector('.ap-more'); if (det) det.addEventListener('toggle', function () { opts.openMore = det.open; });
        wireList(el);
        if (opts.noticeEl) {
          opts.noticeEl.innerHTML = unread.length ? '<div class="ap-topnote"><span>신청서에 교회에서 보낸 안내가 ' + unread.length + '건 있습니다.</span><button type="button" class="ap-btn-line ap-btn-sm">보기</button></div>' : '';
          var go = opts.noticeEl.querySelector('button');
          if (go) go.onclick = function () { if (typeof opts.onGo === 'function') opts.onGo(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
        }
      }).catch(function (e) {
        el.innerHTML = notReady(e) ? '' : head + '<p class="ap-empty">신청서를 불러오지 못했습니다.</p></div>';
        if (opts.noticeEl) opts.noticeEl.innerHTML = '';
      });
    }
    watchers.push(draw);
    draw();
  }

  /* ── 신청서 페이지 (forms.html) ── */
  function renderPage(root) {
    if (!root) return;
    function sec(title, inner, id) { return '<section class="ap-sec"' + (id ? ' id="' + id + '"' : '') + '><h2>' + title + '</h2>' + inner + '</section>'; }
    function draw() {
      var s = sess();
      Promise.all([
        loadOpen(),
        api('GET', 'app_forms?select=id,title,summary,event_date,event_time,place,open_at,close_at,fee_adult,fee_minor,ask_minor,published&order=open_at.desc&limit=100'),
        loadMine()
      ]).then(function (r) {
        var open = r[0], all = (r[1] || []).filter(function (f) { return f.published !== false; }), mine = r[2], applied = {}, now = Date.now();
        mine.forEach(function (e) { applied[e.form_id] = e; });
        var openIds = {}; open.forEach(function (f) { openIds[f.id] = 1; });
        var soon = all.filter(function (f) { return !openIds[f.id] && new Date(f.open_at).getTime() > now; });
        var past = all.filter(function (f) { return !openIds[f.id] && new Date(f.open_at).getTime() <= now; });
        var cards = open.map(function (f) {
          var e = applied[f.id], has = e && e.status === 'active'; SHARE[f.id] = f;
          return '<div class="ap-fcard"><h3 class="ap-title">' + esc(f.title) + '</h3>' +
            (whenPlace(f) ? '<p class="ap-meta">' + esc(whenPlace(f)) + '</p>' : '') +
            '<p class="ap-meta">' + esc(feeText(f)) + (f.close_at ? ' · ' + esc(dtText(f.close_at)) + '까지 신청' : '') + '</p>' +
            (f.summary ? '<p class="ap-text">' + esc(f.summary) + '</p>' : '') +
            (f.body ? '<div class="ap-body">' + nl2br(f.body) + '</div>' : '') + imgHTML(f) +
            (has ? '<div style="margin-top:12px">신청함 ' + chip(e) + '</div>' : '') +
            '<div class="ap-actions">' + (has ? '<button type="button" class="ap-btn" data-status="' + f.id + '">신청 확인</button><button type="button" class="ap-btn-line" data-edit="' + f.id + '">신청 고치기</button>'
              : '<button type="button" class="ap-btn" data-apply="' + f.id + '">신청하기</button>' + (s ? '' : '<button type="button" class="ap-btn-line" data-status="' + f.id + '">신청 확인</button>')) + '<button type="button" class="ap-btn-line" data-share="' + f.id + '">링크 공유</button></div></div>';
        }).join('') + soon.map(function (f) {
          return '<div class="ap-fcard"><h3 class="ap-title">' + esc(f.title) + '</h3>' + (whenPlace(f) ? '<p class="ap-meta">' + esc(whenPlace(f)) + '</p>' : '') +
            '<p class="ap-meta">' + esc(dtText(f.open_at)) + '부터 신청을 받습니다.</p></div>';
        }).join('');
        var html = sec('지금 받는 신청서', cards || '<p class="ap-empty">지금 받는 신청서가 없습니다.</p>');
        if (!s) html += sec('내 신청서', '<p class="ap-empty">로그인하면 내가 낸 신청서와 납부 상태를 볼 수 있습니다.</p><div class="ap-actions"><button type="button" class="ap-btn-line" data-login>로그인</button></div>', 'mine');
        else html += sec('내 신청서', (mine.length ? listHTML(mine, true) : '<p class="ap-empty">아직 작성한 신청서가 없습니다.</p>'), 'mine');
        if (past.length) html += sec('지난 신청서', '<ul class="ap-past">' + past.map(function (f) {
          return '<li><button type="button" data-status="' + f.id + '"><b>' + esc(f.title) + '</b><span>' + esc(whenPlace(f) || dayText(f.open_at)) + '</span></button>' +
            (applied[f.id] ? chip(applied[f.id]) : '<span class="ap-chip ap-chip-off">마감</span>') + '</li>';
        }).join('') + '</ul>');
        root.innerHTML = html;
        wireList(root);
        Array.prototype.forEach.call(root.querySelectorAll('[data-edit]'), function (x) { x.onclick = function () { openApply(x.dataset.edit, true); }; });
        Array.prototype.forEach.call(root.querySelectorAll('[data-share]'), function (x) { x.onclick = function () { shareForm(x.dataset.share, x); }; });
        var lg = root.querySelector('[data-login]'); if (lg) lg.onclick = openLogin;
        if (/#mine/.test(location.hash)) { var m = document.getElementById('mine'); if (m) m.scrollIntoView(); }
      }).catch(function (e) {
        root.innerHTML = '<p class="ap-empty">' + (notReady(e) ? '신청서 기능을 준비하고 있습니다.' : '신청서를 불러오지 못했습니다. 잠시 뒤에 다시 열어 주십시오.') + '</p>';
      });
    }
    watchers.push(draw);
    draw();
    var q = location.search.match(/[?&]f=(\d+)/);           // forms.html?f=번호 — 그 신청서를 바로 연다
    if (q) openApply(q[1]);
  }

  /* ── 공지사항 맨 위 신청 안내 (2026-10-10 목사님 지시)
       히어로에 넣으면 오늘의 예배·문구 슬라이드와 부딪친다 → 히어로는 손대지 않고, 공지사항 목록 위에 고정 안내로.
       신청 기간인 신청서(show_hero = '공지사항에 띄움')마다 한 칸(최대 3). 홈 공지사항·우리 이야기 공지사항. ── */
  function notice() {
    var boxes = ['homeNoticeBox', 'communityNoticeBox'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (!boxes.length) return;
    loadOpen().then(function (list) {
      list = list.filter(function (f) { return f.show_hero; }).slice(0, 3);
      if (!list.length) return;
      boxes.forEach(function (nb) {
        var prev = nb.previousElementSibling; if (prev && prev.classList.contains('ap-ntbox')) return;
        var w = document.createElement('div'); w.className = 'nt-wrap ap-ntbox';
        w.innerHTML = '<div class="nt-list">' + list.map(function (f) {
          var until = untilText(f), line = [whenPlace(f), feeText(f)].filter(Boolean).join(' · ');
          return '<div class="nt-item pinned" data-form="' + esc(f.id) + '"><div class="nt-head"><div class="nt-t"><span class="nt-pin">신청</span>' + esc(f.title) + '</div>' +
            (until ? '<div class="nt-meta">' + esc(until) + '</div>' : '') + '</div>' +
            '<div class="nt-body">' + (f.summary ? esc(f.summary) + '<br>' : '') + esc(line) + '</div>' +
            '<div class="ap-ntbtns"><button type="button" class="btn btn-solid" data-act="apply">신청하기</button><button type="button" class="btn btn-line" data-act="status">신청 확인</button>' +
            (f.body || f.image_url ? '<button type="button" class="btn btn-line" data-act="info">' + (f.image_url ? '코스·안내 보기' : '안내 보기') + '</button>' : '') + '</div></div>';
        }).join('') + '</div>';
        nb.parentNode.insertBefore(w, nb);
        w.addEventListener('click', function (ev) {
          var b = ev.target.closest('[data-act]'); if (!b) return;
          var id = b.closest('[data-form]').getAttribute('data-form');
          var act = b.getAttribute('data-act');
          if (act === 'apply') openApply(id); else if (act === 'info') openInfo(list.filter(function (f) { return String(f.id) === String(id); })[0]); else openStatus(id);
        });
      });
    }).catch(function () { /* 표가 아직 없으면(SQL 실행 전) 공지사항 그대로 */ });
  }

  window.WPCForms = { openApply: openApply, openStatus: openStatus, mineCard: mineCard, renderPage: renderPage, tossMeUrl: tossMeUrl, tossApp: tossApp, payTarget: payTarget, churchPay: churchPay, partText: partText };
  notice();
  var pageRoot = document.getElementById('apPage');
  if (pageRoot) renderPage(pageRoot);
})();
