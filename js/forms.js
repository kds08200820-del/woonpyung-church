/* forms.js — 신청서 (행사·모임 신청, 2026-10-10)
 *  · 홈페이지 히어로: 신청 기간인 신청서(show_hero)를 첫 슬라이드로 — '신청하기' · '신청 확인'
 *  · 신청서 페이지(forms.html): 지금 받는 신청서 · 내 신청서 · 지난 신청서
 *  · 대시보드 카드: dashboard.js 가 WPCForms.mineCard(el, { noticeEl }) 로 부른다 (헌금 바로 위)
 *  · 신청·고치기·취소·'납부했습니다'·교회 안내 읽음은 모두 Supabase 함수(rpc)로 한다
 *  자료: app_forms · app_entries — supabase/20261010_1140_app_forms.sql (실행 전에는 조용히 숨는다)
 */
console.log('[forms.js] v20261010form1');

(function () {
  if (window.WPCForms) return;
  var SB = String(window.SUPABASE_URL || '').replace(/\/$/, ''), AK = window.SUPABASE_ANON_KEY;

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var nl2br = function (s) { return esc(s).replace(/\n/g, '<br>'); };
  var won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR'); };

  /* ── 화면 모양 (테마 색만: 남색·연남색·금색·선·바탕) ── */
  var CSS =
    '.hero-apply .ap-heye{font-size:.78rem;letter-spacing:.3em;color:var(--gold,#b89b5e);margin:0 0 14px}' +
    '.hero-apply .ap-hsum{margin-top:12px!important;font-size:1rem}' +
    '.hero-apply .ap-hwhen{margin-top:12px!important;font-size:1.02rem;opacity:.95}' +
    '.hero-apply .ap-hfee{margin:6px 0 0;font-size:.92rem;color:rgba(255,255,255,.82)}' +
    '.ap-hbtns{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:24px}' +
    '.ap-hbtns .hero-cta{margin-top:0;min-width:150px;font:inherit;cursor:pointer;background:rgba(255,255,255,.1)}' +
    '.ap-hbtns .hero-cta.ap-hgo{background:#fff;color:var(--accent,#032257);border-color:#fff;font-weight:700}' +
    '.ap-hbtns .hero-cta.ap-hgo:hover{background:rgba(255,255,255,.88)}' +
    '@media (max-width:560px){.ap-hbtns{flex-wrap:nowrap;width:100%;max-width:340px;margin-left:auto;margin-right:auto}.ap-hbtns .hero-cta{flex:1;min-width:0;padding:12px 8px}}' +
    '.ap-modal .modal-box{max-width:520px;padding:34px 30px 26px}' +
    '@media (max-width:560px){.ap-modal{padding:10px}.ap-modal .modal-box{padding:28px 18px 20px;max-height:92vh;border-radius:14px}}' +
    '.ap-eye{font-size:.76rem;letter-spacing:.12em;color:var(--accent-soft,#4a6a9c);margin:0 0 4px}' +
    '.ap-title{font-family:"Noto Serif KR",serif;font-size:1.32rem;line-height:1.4;color:var(--accent,#032257);margin:0 0 6px;word-break:keep-all}' +
    '.ap-meta{color:var(--ink-soft,#4a4a4a);font-size:.9rem;margin:0 0 2px;word-break:keep-all}' +
    '.ap-body{font-size:.92rem;line-height:1.75;color:var(--ink,#1a1a1a);background:var(--paper-alt,#f7f5f0);border-radius:10px;padding:12px 14px;margin:12px 0 0;word-break:keep-all}' +
    '.ap-text{font-size:.94rem;color:var(--ink-soft,#4a4a4a);margin:12px 0 0;word-break:keep-all}' +
    '.ap-form{margin-top:16px;display:flex;flex-direction:column;gap:12px}' +
    '.ap-field{display:flex;flex-direction:column;gap:5px}' +
    '.ap-field>span{font-size:.84rem;color:var(--ink-soft,#4a4a4a);font-weight:500}' +
    '.ap-field input,.ap-field textarea{font:inherit;font-size:1rem;padding:11px 13px;border:1px solid var(--line,#e6e3dd);border-radius:10px;width:100%;box-sizing:border-box;background:#fff}' +
    '.ap-field input:focus,.ap-field textarea:focus{outline:none;border-color:var(--accent-soft,#4a6a9c)}' +
    '.ap-count{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line,#e6e3dd);border-radius:10px;padding:8px 10px 8px 14px}' +
    '.ap-count>span{display:flex;flex-direction:column;font-weight:500;color:var(--ink,#1a1a1a)}' +
    '.ap-count small{font-size:.78rem;color:var(--muted,#8a8a8a);font-weight:400}' +
    '.ap-step{display:flex;align-items:center;gap:6px}' +
    '.ap-step button{width:38px;height:38px;border-radius:50%;border:1px solid var(--line,#e6e3dd);background:#fff;color:var(--accent,#032257);font-size:1.25rem;line-height:1;cursor:pointer;font-family:inherit}' +
    '.ap-step button:disabled{opacity:.35;cursor:default}' +
    '.ap-step b{min-width:30px;text-align:center;font-size:1.08rem;color:var(--accent,#032257)}' +
    '.ap-total{display:flex;justify-content:space-between;align-items:baseline;padding:12px 2px 2px;border-top:1px solid var(--line,#e6e3dd);color:var(--accent,#032257);font-weight:700}' +
    '.ap-total b{font-size:1.2rem}' +
    '.ap-err{color:#c0392b;font-size:.88rem;margin:0}' +
    '.ap-note{font-size:.8rem;color:var(--muted,#8a8a8a);margin:8px 0 0;line-height:1.6;word-break:keep-all}' +
    '.ap-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-weight:700;font-size:.95rem;border-radius:30px;padding:12px 22px;cursor:pointer;border:1.5px solid var(--accent,#032257);background:var(--accent,#032257);color:#fff;text-decoration:none;box-sizing:border-box}' +
    '.ap-btn:hover{background:#0b2f6b}' +
    '.ap-btn:disabled{opacity:.55;cursor:default}' +
    '.ap-btn-line{display:inline-flex;align-items:center;justify-content:center;font:inherit;font-weight:600;font-size:.88rem;border-radius:30px;padding:9px 16px;cursor:pointer;border:1px solid var(--accent-soft,#4a6a9c);background:#fff;color:var(--accent,#032257);text-decoration:none}' +
    '.ap-btn-line:hover{background:var(--paper-alt,#f7f5f0)}' +
    '.ap-btn-sm{padding:7px 14px;font-size:.84rem}' +
    '.ap-wide{width:100%}' +
    '.ap-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}' +
    '.ap-actions .ap-quiet{color:var(--muted,#8a8a8a);border-color:var(--line,#e6e3dd)}' +
    '.ap-chip{display:inline-block;padding:3px 11px;border-radius:999px;font-size:.76rem;font-weight:700;white-space:nowrap;vertical-align:middle}' +
    '.ap-chip-paid{background:var(--accent,#032257);color:#fff}' +
    '.ap-chip-ok{background:#eef2f7;color:var(--accent-soft,#4a6a9c)}' +
    '.ap-chip-due{background:#fff;color:var(--accent,#032257);border:1px solid var(--gold,#b89b5e)}' +
    '.ap-chip-off{background:#f1efea;color:var(--muted,#8a8a8a)}' +
    '.ap-done{margin:12px 0 0;padding:10px 14px;border-radius:10px;background:#eef2f7;color:var(--accent,#032257);font-weight:600;font-size:.92rem}' +
    '.ap-msg{border:1px solid var(--gold,#b89b5e);border-left-width:4px;background:#fbf8f1;border-radius:8px;padding:11px 14px;margin:12px 0 0}' +
    '.ap-msg.is-old{border-color:var(--line,#e6e3dd);border-left-color:var(--gold,#b89b5e);background:#fff}' +
    '.ap-msg-hd{font-size:.78rem;color:var(--accent-soft,#4a6a9c);font-weight:700;margin:0 0 4px}' +
    '.ap-msg-tx{font-size:.93rem;color:var(--ink,#1a1a1a);margin:0;line-height:1.65;word-break:keep-all}' +
    '.ap-msg .ap-btn-line{margin-top:9px;padding:6px 13px;font-size:.82rem}' +
    '.ap-dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:14px 0 0;font-size:.92rem}' +
    '.ap-dl dt{color:var(--muted,#8a8a8a)}' +
    '.ap-dl dd{margin:0;color:var(--ink,#1a1a1a);word-break:break-all}' +
    '.ap-pay{background:var(--paper-alt,#f7f5f0);border:1px solid var(--line,#e6e3dd);border-radius:12px;padding:14px 16px;margin-top:16px;display:flex;flex-direction:column;gap:10px}' +
    '.ap-pay-amt{display:flex;justify-content:space-between;align-items:baseline;color:var(--accent,#032257)}' +
    '.ap-pay-amt b{font-size:1.2rem}' +
    '.ap-acct{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid var(--line,#e6e3dd);border-radius:10px;padding:9px 12px;font-size:.92rem}' +
    '.ap-acct span{word-break:break-all}' +
    '.ap-pay .ap-note{margin:0}' +
    '.ap-card h3.ap-card-h{margin:0 0 10px;font-size:1rem;color:var(--accent,#032257)}' +
    '.ap-list{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}' +
    '.ap-item{border:1px solid var(--line,#e6e3dd);border-radius:12px;padding:12px 14px;background:#fff}' +
    '.ap-item.is-off{background:#fbfaf7}' +
    '.ap-item-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}' +
    '.ap-item-hd b{color:var(--accent,#032257);font-size:.98rem;word-break:keep-all}' +
    '.ap-item-meta{margin:3px 0 0;font-size:.84rem;color:var(--ink-soft,#4a4a4a);word-break:keep-all}' +
    '.ap-item .ap-msg{margin-top:9px}' +
    '.ap-link{background:none;border:0;padding:0;margin-top:8px;font:inherit;font-size:.86rem;font-weight:600;color:var(--accent-soft,#4a6a9c);cursor:pointer;text-decoration:underline;text-underline-offset:3px}' +
    '.ap-more{margin-top:14px;border-top:1px solid var(--line,#e6e3dd);padding-top:12px}' +
    '.ap-more>summary{cursor:pointer;font-size:.92rem;font-weight:700;color:var(--accent,#032257)}' +
    '.ap-empty{color:var(--muted,#8a8a8a);font-size:.9rem;margin:0}' +
    '.ap-open{display:flex;flex-direction:column;gap:8px;margin:0 0 4px}' +
    '.ap-open-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px dashed var(--gold,#b89b5e);border-radius:12px;padding:10px 14px;background:#fff}' +
    '.ap-open-row b{display:block;color:var(--accent,#032257);word-break:keep-all}' +
    '.ap-open-row span{font-size:.82rem;color:var(--ink-soft,#4a4a4a)}' +
    '.ap-topnote{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border:1px solid var(--gold,#b89b5e);border-left-width:4px;background:#fbf8f1;border-radius:10px;padding:11px 14px;font-size:.92rem;color:var(--accent,#032257);max-width:680px;margin:0 auto 22px;box-sizing:border-box}' +
    '.ap-sec{margin:0 0 40px}' +
    '.ap-sec>h2{font-family:"Noto Serif KR",serif;font-size:1.2rem;color:var(--accent,#032257);margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid var(--accent,#032257)}' +
    '.ap-fcard{background:#fff;border:1px solid var(--line,#e6e3dd);border-radius:16px;padding:20px 22px;margin-bottom:14px}' +
    '.ap-fcard .ap-actions{margin-top:14px}' +
    '.ap-past{list-style:none;margin:0;padding:0}' +
    '.ap-past li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 2px;border-bottom:1px solid var(--line,#e6e3dd)}' +
    '.ap-past li button{background:none;border:0;padding:0;font:inherit;text-align:left;cursor:pointer;color:var(--ink,#1a1a1a)}' +
    '.ap-past li button b{display:block;color:var(--accent,#032257);font-weight:600}' +
    '.ap-past li button span{font-size:.82rem;color:var(--muted,#8a8a8a)}' +
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
      showForm(f, e, p);
    }).catch(function (e) { openModal(errorHTML(e)); });
  }
  function headHTML(f, eye) {
    return '<p class="ap-eye">' + esc(eye) + '</p><h3 class="ap-title">' + esc(f.title) + '</h3>' +
      (whenPlace(f) ? '<p class="ap-meta">' + esc(whenPlace(f)) + '</p>' : '') +
      '<p class="ap-meta">' + esc(feeText(f)) + (untilText(f) ? ' · ' + esc(untilText(f)) : '') + '</p>';
  }
  function showForm(f, e, p) {
    var cur = e || {};
    var v = { adults: e ? e.adults : 1, minors: e ? e.minors : 0 };
    var askMinor = f.ask_minor !== false, paidLock = e && e.paid_at && e.status === 'active';
    var aFee = +f.fee_adult || 0, mFee = +f.fee_minor || 0;
    function countRow(k, label, sub) {
      return '<div class="ap-count"><span>' + label + '<small>' + sub + '</small></span><div class="ap-step">' +
        '<button type="button" data-k="' + k + '" data-d="-1" aria-label="' + label + ' 한 명 빼기">−</button><b data-v="' + k + '">' + v[k] + '</b>' +
        '<button type="button" data-k="' + k + '" data-d="1" aria-label="' + label + ' 한 명 더하기">+</button></div></div>';
    }
    var html = headHTML(f, e ? '신청 고치기' : '신청서') +
      (f.summary ? '<p class="ap-text">' + esc(f.summary) + '</p>' : '') +
      (f.body ? '<div class="ap-body">' + nl2br(f.body) + '</div>' : '') +
      '<form class="ap-form" novalidate>' +
      '<label class="ap-field"><span>신청하는 분 이름</span><input name="name" maxlength="60" autocomplete="name" value="' + esc(cur.name || p.name || '') + '" required></label>' +
      '<label class="ap-field"><span>연락처</span><input name="phone" type="tel" inputmode="tel" maxlength="30" autocomplete="tel" placeholder="010-0000-0000" value="' + esc(cur.phone || p.phone || '') + '" required></label>' +
      (askMinor
        ? countRow('adults', '성인', aFee ? '1명 ' + won(aFee) + '원' : '무료') + countRow('minors', '미성년자', '만 19세 미만 · ' + (mFee ? '1명 ' + won(mFee) + '원' : '무료'))
        : countRow('adults', '인원', aFee ? '1명 ' + won(aFee) + '원' : '무료')) +
      (f.memo_label ? '<label class="ap-field"><span>' + esc(f.memo_label) + '</span><textarea name="memo" rows="3" maxlength="1000">' + esc(cur.memo || '') + '</textarea></label>' : '') +
      '<div class="ap-total"><span>신청비 합계</span><b data-total></b></div>' +
      (paidLock ? '<p class="ap-note">‘납부했습니다’를 누른 신청입니다. 금액이 바뀌는 인원 수정은 교회에 말씀해 주십시오.</p>' : '') +
      '<p class="ap-err" hidden></p>' +
      '<button type="submit" class="ap-btn ap-wide">' + (e && e.status === 'active' ? '고친 내용 저장' : '신청하기') + '</button>' +
      '<p class="ap-note">가족이 함께 오시면 인원에 함께 적어 주십시오. 한 계정으로 한 번 신청하며, 다시 내면 앞의 신청을 고칩니다.</p>' +
      '</form>';
    openModal(html, function (b) {
      var form = b.querySelector('form'), err = b.querySelector('.ap-err');
      function total() { return v.adults * aFee + (askMinor ? v.minors * mFee : 0); }
      function paint() {
        ['adults', 'minors'].forEach(function (k) {
          var el = b.querySelector('[data-v="' + k + '"]'); if (el) el.textContent = v[k];
          var minus = b.querySelector('[data-k="' + k + '"][data-d="-1"]'); if (minus) minus.disabled = v[k] <= 0;
          var plus = b.querySelector('[data-k="' + k + '"][data-d="1"]'); if (plus) plus.disabled = v[k] >= 50;
        });
        var t = total(); b.querySelector('[data-total]').textContent = t ? won(t) + '원' : '없음';
      }
      Array.prototype.forEach.call(b.querySelectorAll('.ap-step button'), function (btn) {
        btn.onclick = function () { var k = btn.dataset.k; v[k] = Math.max(0, Math.min(50, v[k] + (+btn.dataset.d))); paint(); };
      });
      paint();
      form.onsubmit = function (ev) {
        ev.preventDefault();
        var name = form.name.value.trim(), phone = form.phone.value.trim(), memo = form.memo ? form.memo.value.trim() : '';
        var bad = !name ? '신청하는 분 이름을 적어 주십시오.' : !phone ? '연락처를 적어 주십시오.' : (v.adults + (askMinor ? v.minors : 0)) < 1 ? '인원을 한 명 이상 적어 주십시오.' : '';
        if (bad) { err.textContent = bad; err.hidden = false; return; }
        err.hidden = true;
        var btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = '보내는 중…';
        rpc('app_submit', { p_form: f.id, p_name: name, p_phone: phone, p_adults: v.adults, p_minors: askMinor ? v.minors : 0, p_memo: memo }).then(function (r) {
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
    var open = isOpen(f), html = headHTML(f, '신청 확인') + (done ? '<p class="ap-done">' + esc(done) + '</p>' : '');
    if (!e) {
      var before = f.open_at && new Date(f.open_at).getTime() > Date.now();
      html += (f.summary ? '<p class="ap-text">' + esc(f.summary) + '</p>' : '') + (f.body ? '<div class="ap-body">' + nl2br(f.body) + '</div>' : '') +
        '<p class="ap-text">이 신청서에 아직 신청하지 않았습니다.</p>' +
        (open ? '<div class="ap-actions"><button type="button" class="ap-btn ap-wide" data-edit>신청하기</button></div>'
          : '<p class="ap-note">' + (before ? esc(dtText(f.open_at)) + '부터 신청을 받습니다.' : '신청이 마감되었습니다.') + '</p>');
    } else {
      var active = e.status === 'active', due = active && e.fee_total > 0 && !e.paid_at;
      html += '<div style="margin-top:12px">' + chip(e) + '</div>' + msgHTML(e) +
        '<dl class="ap-dl"><dt>신청한 분</dt><dd>' + esc(e.name) + '</dd><dt>연락처</dt><dd>' + esc(e.phone) + '</dd>' +
        '<dt>인원</dt><dd>' + esc(peopleText(e, f)) + '</dd>' +
        (e.memo ? '<dt>' + esc(f.memo_label || '메모') + '</dt><dd>' + nl2br(e.memo) + '</dd>' : '') +
        '<dt>신청비</dt><dd>' + (e.fee_total > 0 ? won(e.fee_total) + '원' : '없음') + '</dd>' +
        '<dt>신청한 날</dt><dd>' + esc(dtText(e.created_at)) + '</dd>' +
        (e.paid_at ? '<dt>납부</dt><dd>' + esc(dtText(e.paid_at)) + (e.paid_by === 'admin' ? ' · 교회에서 납부 처리' : ' · ‘납부했습니다’') + (e.confirmed_at ? ' · 교회가 입금을 확인했습니다' : '') + '</dd>' : '') +
        '</dl>' +
        (due ? payHTML(f, e) : '') +
        '<div class="ap-actions">' +
        (active && open ? '<button type="button" class="ap-btn-line" data-edit>신청 고치기</button>' : '') +
        (active && !e.paid_at ? '<button type="button" class="ap-btn-line ap-quiet" data-cancel="' + e.id + '">신청 취소</button>' : '') +
        (!active && open ? '<button type="button" class="ap-btn" data-edit>다시 신청하기</button>' : '') +
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
          var e = applied[f.id], has = e && e.status === 'active';
          return '<div class="ap-fcard"><h3 class="ap-title">' + esc(f.title) + '</h3>' +
            (whenPlace(f) ? '<p class="ap-meta">' + esc(whenPlace(f)) + '</p>' : '') +
            '<p class="ap-meta">' + esc(feeText(f)) + (f.close_at ? ' · ' + esc(dtText(f.close_at)) + '까지 신청' : '') + '</p>' +
            (f.summary ? '<p class="ap-text">' + esc(f.summary) + '</p>' : '') +
            (f.body ? '<div class="ap-body">' + nl2br(f.body) + '</div>' : '') +
            (has ? '<div style="margin-top:12px">신청함 ' + chip(e) + '</div>' : '') +
            '<div class="ap-actions">' + (has ? '<button type="button" class="ap-btn" data-status="' + f.id + '">신청 확인</button><button type="button" class="ap-btn-line" data-edit="' + f.id + '">신청 고치기</button>'
              : '<button type="button" class="ap-btn" data-apply="' + f.id + '">신청하기</button>' + (s ? '' : '<button type="button" class="ap-btn-line" data-status="' + f.id + '">신청 확인</button>')) + '</div></div>';
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

  /* ── 홈페이지 히어로 — 신청 기간인 신청서를 첫 슬라이드로 ── */
  function hero() {
    var rot = document.getElementById('heroRotator'); if (!rot) return;
    loadOpen().then(function (list) {
      list = list.filter(function (f) { return f.show_hero; }).slice(0, 2);
      if (!list.length) return;
      var heroEl = rot.closest('.hero') || document.body;
      if (heroEl.classList.contains('hero-worship-only') || document.getElementById('heroWorship')) return;   // 예배 시간에는 예배만
      list.slice().reverse().forEach(function (f) {
        var d = document.createElement('div');
        d.className = 'hero-slide hero-apply'; d.setAttribute('data-form', f.id);
        var fee = feeText(f), until = untilText(f);
        d.innerHTML = '<p class="ap-heye">신청 안내</p><h1 class="hero-title">' + esc(f.title) + '</h1>' +
          (f.summary ? '<p class="hero-sub ap-hsum">' + esc(f.summary) + '</p>' : '') +
          (whenPlace(f) ? '<p class="hero-sub ap-hwhen">' + esc(whenPlace(f)) + '</p>' : '') +
          '<p class="ap-hfee">' + esc(fee) + (until ? ' · ' + esc(until) : '') + '</p>' +
          '<div class="ap-hbtns"><button type="button" class="hero-cta ap-hgo" data-act="apply">신청하기</button><button type="button" class="hero-cta" data-act="status">신청 확인</button></div>';
        rot.insertBefore(d, rot.firstChild);
      });
      Array.prototype.forEach.call(rot.querySelectorAll('.hero-slide'), function (s) { s.classList.remove('is-active'); });
      rot.querySelector('.hero-apply').classList.add('is-active');
      if (window.WPCHero) window.WPCHero.refresh();
    }).catch(function () { /* 표가 아직 없으면(SQL 실행 전) 원래 첫 화면 그대로 */ });
    rot.addEventListener('click', function (ev) {
      var b = ev.target.closest('.hero-apply [data-act]'); if (!b) return;
      var id = b.closest('.hero-apply').getAttribute('data-form');
      if (b.getAttribute('data-act') === 'apply') openApply(id); else openStatus(id);
    });
  }

  window.WPCForms = { openApply: openApply, openStatus: openStatus, mineCard: mineCard, renderPage: renderPage, tossMeUrl: tossMeUrl, tossApp: tossApp };
  hero();
  var pageRoot = document.getElementById('apPage');
  if (pageRoot) renderPage(pageRoot);
})();
