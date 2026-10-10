/* forms-admin.js — 목회 행정 > 신청서 (관리자 전용, 2026-10-10)
 *  · 신청서 보관함: 만든 신청서가 차례로 쌓인다. 지우지 않는다 — 지난 신청서도 그대로 연다.
 *    상태: 준비 중(시작 전) · 받는 중 · 마감 · 숨김(공개 해제)
 *  · 신청서 하나 = 한 화면: 신청자 명단 · 인원 · 금액 합계 · 납부 상태
 *      입금 확인 / 납부 취소(미납으로 되돌림) + 안내 보내기 / 납부 처리(현금 등) / 안내 보내기 / 신청 취소·되살리기 / 명단 내려받기
 *  · 양식 만들기·고치기: 제목·안내·행사 날짜/시각/장소·신청 기간·신청비·납부 받는 곳(은행·계좌·예금주·토스 링크)
 *    신청 기간에는 홈페이지 첫 화면(히어로)에 저절로 뜬다(js/forms.js).
 *  affairs.js 의 '신청서' 탭이 WPCFormsAdmin.render(panel, { api, esc, msgCard, pushBackClose }) 로 부른다.
 *  자료: app_forms · app_entries — supabase/20261010_1140_app_forms.sql
 */
console.log('[forms-admin.js] v20261010form3');

window.WPCFormsAdmin = (function () {
  var CSS =
    '.fa-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}' +
    '.fa-head h3{margin:0;color:var(--accent,#032257);font-size:1.15rem}' +
    '.fa-head .fa-sub{color:#8a8a8a;font-size:.84rem}' +
    '.fa-head .fa-right{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}' +
    '.fa-list{display:flex;flex-direction:column;gap:10px}' +
    '.fa-item{border:1px solid var(--line,#e6e3dd);border-radius:12px;padding:13px 15px;background:#fff;cursor:pointer;text-align:left;font:inherit;width:100%}' +
    '.fa-item:hover{border-color:var(--accent-soft,#4a6a9c)}' +
    '.fa-item-hd{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}' +
    '.fa-item-hd b{color:var(--accent,#032257);font-size:1rem}' +
    '.fa-meta{font-size:.84rem;color:#4a4a4a;margin-top:3px}' +
    '.fa-stats{font-size:.84rem;color:var(--accent,#032257);margin-top:6px;font-weight:600}' +
    '.fa-st{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.74rem;font-weight:700;white-space:nowrap}' +
    '.fa-st-open{background:var(--accent,#032257);color:#fff}' +
    '.fa-st-soon{background:#fff;color:var(--accent,#032257);border:1px solid var(--gold,#b89b5e)}' +
    '.fa-st-closed{background:#eef2f7;color:var(--accent-soft,#4a6a9c)}' +
    '.fa-st-hidden{background:#f1efea;color:#8a8a8a}' +
    '.fa-st-due{background:#fff;color:var(--accent,#032257);border:1px solid var(--gold,#b89b5e)}' +
    '.fa-st-paid{background:var(--accent,#032257);color:#fff}' +
    '.fa-st-ok{background:#eef2f7;color:var(--accent-soft,#4a6a9c)}' +
    '.fa-stat{background:var(--paper-alt,#f7f5f0);border:1px solid var(--line,#e6e3dd);border-radius:10px;padding:10px 12px}' +
    '.fa-stat span{display:block;font-size:.78rem;color:#8a8a8a}' +
    '.fa-stat b{font-size:1.1rem;color:var(--accent,#032257)}' +
    '.fa-stat small{display:block;font-size:.76rem;color:#4a4a4a;margin-top:2px}' +
    '.fa-filter{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 10px}' +
    '.fa-filter button{border:1px solid var(--line,#e6e3dd);background:#fff;border-radius:999px;padding:5px 12px;font:inherit;font-size:.82rem;cursor:pointer;color:#4a4a4a}' +
    '.fa-filter button.on{background:var(--accent,#032257);border-color:var(--accent,#032257);color:#fff}' +
    '.fa-ents{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}' +
    '.fa-ent{border:1px solid var(--line,#e6e3dd);border-radius:12px;padding:12px 14px;background:#fff}' +
    '.fa-ent.is-off{background:#fbfaf7;color:#8a8a8a}' +
    '.fa-ent-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}' +
    '.fa-ent-hd b{font-size:1rem;color:var(--accent,#032257)}' +
    '.fa-ent p{margin:3px 0 0;font-size:.84rem;color:#4a4a4a;word-break:keep-all}' +
    '.fa-ent .fa-msg{margin-top:8px;border-left:3px solid var(--gold,#b89b5e);background:#fbf8f1;padding:7px 10px;border-radius:6px;font-size:.82rem}' +
    '.fa-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}' +
    '.fa-btns button{padding:5px 11px;font-size:.8rem}' +
    '.fa-warn{color:#c0392b}' +
    '.fa-note{font-size:.8rem;color:#8a8a8a;margin:6px 0 0}' +
    '.fa-pay{margin-top:10px;padding:10px 12px;border-radius:10px;border:1px dashed var(--gold,#b89b5e);font-size:.86rem;background:#fff}' +
    '.fa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}' +
    '.fa-sgrid{grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}' +
    '.fa-sec{margin:18px 0 8px;font-size:.92rem;color:var(--accent,#032257);font-weight:700;border-bottom:1px solid var(--line,#e6e3dd);padding-bottom:6px}' +
    '.fa-check{display:flex;align-items:center;gap:8px;font-size:.9rem;cursor:pointer}' +
    '.fa-check input{width:18px;height:18px;accent-color:var(--accent,#032257)}' +
    '.fa-modal .modal-box{max-width:480px;padding:28px 24px 22px}' +
    '.fa-modal textarea{width:100%;min-height:110px;padding:10px;border:1px solid #dfe5ee;border-radius:8px;font:inherit;box-sizing:border-box}' +
    '@media (max-width:560px){.fa-ents{grid-template-columns:1fr}.fa-head .fa-right{margin-left:0}}';

  function injectCss() {
    if (document.getElementById('faFormsCss')) return;
    var st = document.createElement('style'); st.id = 'faFormsCss'; st.textContent = CSS; document.head.appendChild(st);
  }

  var DOW = ['주일', '월', '화', '수', '목', '금', '토'];
  var won = function (n) { return (Number(n) || 0).toLocaleString('ko-KR'); };
  function hm(h, m) { var ap = h < 12 ? '오전 ' : (h === 12 ? '낮 ' : '오후 '); return ap + (h === 0 ? 0 : (h % 12 || 12)) + '시' + (m ? ' ' + m + '분' : ''); }
  function eventText(f) {
    if (!f.event_date) return '';
    var p = String(f.event_date).split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    var s = (+p[1]) + '월 ' + (+p[2]) + '일(' + DOW[d.getDay()] + ')';
    if (f.event_time) { var t = String(f.event_time).split(':'); s += ' ' + hm(+t[0], +t[1]); }
    return s;
  }
  function dt(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + hm(d.getHours(), d.getMinutes()); }
  function day(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : (d.getMonth() + 1) + '/' + d.getDate(); }
  function localInput(iso) {               // ISO → datetime-local 값(이 기기 시각)
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    var p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function stateOf(f) {
    var now = Date.now();
    if (!f.published) return ['hidden', '숨김'];
    if (new Date(f.open_at).getTime() > now) return ['soon', '준비 중'];
    if (f.close_at && new Date(f.close_at).getTime() <= now) return ['closed', '마감'];
    return ['open', '받는 중'];
  }
  function payOf(e) {
    if (e.status === 'cancelled') return ['hidden', '취소'];
    if (!(e.fee_total > 0)) return ['ok', '신청비 없음'];
    if (e.paid_at && e.confirmed_at) return ['paid', '교회 확인'];
    if (e.paid_at) return ['due', e.paid_by === 'admin' ? '납부 처리' : '납부 완료(확인 전)'];
    return ['due', '미납'];
  }
  function feeText(f) {
    var a = +f.fee_adult || 0, m = f.ask_minor ? (+f.fee_minor || 0) : 0;
    if (!a && !m) return '신청비 없음';
    if (!f.ask_minor) return '1명 ' + won(a) + '원';
    return '성인 ' + (a ? won(a) + '원' : '무료') + ' · 미성년자 ' + (m ? won(m) + '원' : '무료');
  }
  function sum(list) {
    var s = { n: 0, off: 0, ad: 0, mi: 0, fee: 0, paid: 0, conf: 0, due: 0, dueN: 0, unconfN: 0 };
    list.forEach(function (e) {
      if (e.status === 'cancelled') { s.off++; return; }
      s.n++; s.ad += e.adults; s.mi += e.minors; s.fee += e.fee_total;
      if (e.fee_total > 0 && e.paid_at) { s.paid += e.fee_total; if (e.confirmed_at) s.conf += e.fee_total; else s.unconfN++; }
      if (e.fee_total > 0 && !e.paid_at) { s.due += e.fee_total; s.dueN++; }
    });
    return s;
  }
  function notReady(e) { return /42P01|42883|PGRST20[0-9]|does not exist|schema cache|Could not find/i.test((e && e.message) || ''); }

  function render(panel, ctx) {
    injectCss();
    var api = ctx.api, esc = ctx.esc, msgCard = ctx.msgCard;
    var FORMS = [], ENTRIES = [], filter = 'all', backClose = null;
    function alive() { return document.body.contains(panel); }
    function rpcPay(id, action, msg) {
      return api('POST', 'rpc/app_admin_payment', { p_id: id, p_action: action, p_msg: msg || '' }).then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || '바꾸지 못했습니다.');
        return r.entry;
      });
    }
    var PAYDEF = null;   // 목회 행정 > 설정 > '신청서 납부 계좌' (church_settings.pay_default)
    function load() {
      return Promise.all([
        api('GET', 'app_forms?select=*&order=open_at.desc,id.desc'),
        api('GET', 'app_entries?select=*&order=created_at.asc'),
        api('GET', 'church_settings?key=eq.pay_default&select=data').catch(function () { return []; })
      ]).then(function (r) { FORMS = r[0] || []; ENTRIES = r[1] || []; PAYDEF = (r[2] && r[2][0] && r[2][0].data) || null; });
    }
    /* 교회 기본 납부 계좌 — 설정에 저장한 것, 없으면 홈페이지 온라인헌금 창의 계좌 */
    function defaultPay() {
      if (PAYDEF && (PAYDEF.pay_toss_url || (PAYDEF.pay_bank && PAYDEF.pay_account))) return PAYDEF;
      return window.WPCForms && window.WPCForms.churchPay ? window.WPCForms.churchPay() : {};
    }
    function ownPay(f) { return !!(f.pay_toss_url || (f.pay_bank && f.pay_account)); }
    function entriesOf(id) { return ENTRIES.filter(function (e) { return String(e.form_id) === String(id); }); }
    function formOf(id) { return FORMS.filter(function (f) { return String(f.id) === String(id); })[0]; }
    function enter(fn) {                      // 목록 → 한 신청서/양식 화면: 휴대폰 '뒤로'가 목록으로 오게
      if (!backClose && ctx.pushBackClose) backClose = ctx.pushBackClose(function () { backClose = null; if (alive()) showList(); });
      fn();
    }
    function back() { if (backClose) { var c = backClose; c(); } else showList(); }

    /* ── 목록(보관함) ── */
    function showList() {
      if (!alive()) return;
      var html = '<div class="fin-card"><div class="fa-head"><h3>신청서</h3><span class="fa-sub">만든 신청서가 차례로 쌓입니다. 신청 기간에는 홈페이지 첫 화면에 저절로 뜹니다.</span>' +
        '<div class="fa-right"><button class="btn btn-solid" id="fa_new" style="padding:8px 16px;font-size:.86rem">새 신청서</button></div></div>';
      if (!FORMS.length) html += '<p style="color:#8a8a8a;margin:0">아직 만든 신청서가 없습니다.</p>';
      html += '<div class="fa-list">' + FORMS.map(function (f) {
        var st = stateOf(f), s = sum(entriesOf(f.id));
        return '<button type="button" class="fa-item" data-id="' + f.id + '"><div class="fa-item-hd"><b>' + esc(f.title) + '</b><span class="fa-st fa-st-' + st[0] + '">' + st[1] + '</span></div>' +
          (eventText(f) || f.place ? '<div class="fa-meta">행사 ' + esc([eventText(f), f.place].filter(Boolean).join(' · ')) + '</div>' : '') +
          '<div class="fa-meta">신청 기간 ' + esc(dt(f.open_at)) + ' ~ ' + esc(f.close_at ? dt(f.close_at) : '마감 없음') + '</div>' +
          '<div class="fa-stats">신청 ' + s.n + '건 · 성인 ' + s.ad + '명' + (f.ask_minor ? ' · 미성년자 ' + s.mi + '명' : '') + ' · 받을 금액 ' + won(s.fee) + '원 · 납부 ' + won(s.paid) + '원' + (s.dueN ? ' · 미납 ' + s.dueN + '건' : '') + '</div></button>';
      }).join('') + '</div></div>';
      panel.innerHTML = html;
      panel.querySelector('#fa_new').onclick = function () { enter(function () { showEdit(null); }); };
      Array.prototype.forEach.call(panel.querySelectorAll('.fa-item'), function (b) { b.onclick = function () { filter = 'all'; enter(function () { showForm(b.dataset.id); }); }; });
    }

    /* ── 신청서 하나 — 명단·인원·금액·납부 ── */
    function showForm(id) {
      if (!alive()) return;
      var f = formOf(id); if (!f) { showList(); return; }
      var list = entriesOf(id), s = sum(list), st = stateOf(f);
      var fp = ownPay(f) ? f : Object.assign({}, f, defaultPay());   /* 비워 두면 교회 기본 계좌 */
      var hasPay = fp.pay_toss_url || (fp.pay_bank && fp.pay_account);
      var needsPay = (+f.fee_adult || 0) > 0 || (f.ask_minor && (+f.fee_minor || 0) > 0);
      var shown = list.filter(function (e) {
        if (filter === 'all') return e.status !== 'cancelled';
        if (filter === 'off') return e.status === 'cancelled';
        if (e.status === 'cancelled') return false;
        if (filter === 'due') return e.fee_total > 0 && !e.paid_at;
        if (filter === 'claimed') return e.fee_total > 0 && e.paid_at && !e.confirmed_at;
        if (filter === 'conf') return e.fee_total > 0 && e.confirmed_at;
        return true;
      });
      var html = '<div class="fin-card"><div class="fa-head"><button class="btn btn-line" id="fa_back" style="padding:6px 13px;font-size:.84rem">← 신청서 목록</button>' +
        '<div class="fa-right"><button class="btn btn-line" id="fa_edit" style="padding:6px 13px;font-size:.84rem">양식 고치기</button>' +
        '<button class="btn btn-line" id="fa_copy" style="padding:6px 13px;font-size:.84rem">이 양식으로 새 신청서</button>' +
        '<button class="btn btn-line" id="fa_csv" style="padding:6px 13px;font-size:.84rem">명단 내려받기</button>' +
        '<a class="btn btn-line" href="forms.html?f=' + f.id + '" target="_blank" rel="noopener" style="padding:6px 13px;font-size:.84rem">홈페이지에서 보기</a></div></div>' +
        '<div class="fa-item-hd"><b style="font-size:1.2rem;color:var(--accent,#032257)">' + esc(f.title) + '</b><span class="fa-st fa-st-' + st[0] + '">' + st[1] + '</span></div>' +
        (eventText(f) || f.place ? '<div class="fa-meta">행사 ' + esc([eventText(f), f.place].filter(Boolean).join(' · ')) + '</div>' : '') +
        '<div class="fa-meta">신청 기간 ' + esc(dt(f.open_at)) + ' ~ ' + esc(f.close_at ? dt(f.close_at) : '마감 없음') + (f.show_hero ? ' · 이 기간에 첫 화면에 뜸' : ' · 첫 화면에 띄우지 않음') + '</div>' +
        '<div class="fa-meta">신청비 ' + esc(feeText(f)) + '</div>' +
        (needsPay ? '<div class="fa-pay">' + (hasPay
          ? '납부 받는 곳: ' + esc([fp.pay_bank, fp.pay_account, fp.pay_holder ? '예금주 ' + fp.pay_holder : ''].filter(Boolean).join(' ')) + (fp.pay_toss_url ? (fp.pay_account ? ' · ' : '') + '토스 링크 ' + esc(fp.pay_toss_url) : '') + (ownPay(f) ? '' : ' (교회 기본 계좌 — 목회 행정 > 설정에서 바꿉니다)')
          : '<span class="fa-warn">납부 받는 곳(계좌·토스 링크)이 비어 있습니다.</span> ‘양식 고치기’에서 넣으면 신청한 분 화면에 ‘토스로 송금하기’와 계좌가 나옵니다.') + '</div>' : '') +
        '<div class="fa-grid fa-sgrid" style="margin-top:14px">' +
        '<div class="fa-stat"><span>신청</span><b>' + s.n + '건</b>' + (s.off ? '<small>취소 ' + s.off + '건 따로</small>' : '') + '</div>' +
        '<div class="fa-stat"><span>인원</span><b>' + (s.ad + s.mi) + '명</b><small>성인 ' + s.ad + '명' + (f.ask_minor ? ' · 미성년자 ' + s.mi + '명' : '') + '</small></div>' +
        '<div class="fa-stat"><span>받을 금액</span><b>' + won(s.fee) + '원</b></div>' +
        '<div class="fa-stat"><span>납부 완료</span><b>' + won(s.paid) + '원</b><small>교회 확인 ' + won(s.conf) + '원' + (s.unconfN ? ' · 확인 전 ' + s.unconfN + '건' : '') + '</small></div>' +
        '<div class="fa-stat"><span>미납</span><b>' + won(s.due) + '원</b><small>' + s.dueN + '건</small></div>' +
        '</div>' +
        '<div class="fa-filter">' + [['all', '전체'], ['due', '미납'], ['claimed', '납부 완료(확인 전)'], ['conf', '교회 확인'], ['off', '취소']].map(function (t) {
          return '<button type="button" data-f="' + t[0] + '" class="' + (filter === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
        }).join('') + '</div>' +
        (shown.length ? '<div class="fa-ents">' + shown.map(entHTML).join('') + '</div>' : '<p style="color:#8a8a8a;margin:6px 0 0">해당하는 신청이 없습니다.</p>') +
        '<p class="fa-note">‘입금 확인’은 통장 내역과 맞춰 본 뒤 누릅니다. 맞지 않으면 ‘납부 취소’로 미납으로 되돌리고, 신청한 분에게 확인을 부탁하는 안내를 함께 보냅니다(신청한 분의 대시보드·신청서 화면 맨 위에 나옵니다).</p>' +
        '</div>';
      panel.innerHTML = html;
      panel.querySelector('#fa_back').onclick = back;
      panel.querySelector('#fa_edit').onclick = function () { showEdit(f); };
      panel.querySelector('#fa_copy').onclick = function () { showEdit(f, true); };
      panel.querySelector('#fa_csv').onclick = function () { csv(f, list); };
      Array.prototype.forEach.call(panel.querySelectorAll('.fa-filter button'), function (b) { b.onclick = function () { filter = b.dataset.f; showForm(id); }; });
      Array.prototype.forEach.call(panel.querySelectorAll('[data-act]'), function (b) {
        b.onclick = function () {
          var eid = +b.closest('.fa-ent').dataset.id, e = ENTRIES.filter(function (x) { return x.id === eid; })[0], act = b.dataset.act;
          if (act === 'unpaid' || act === 'message') { compose(f, e, act); return; }
          var ask = { confirm: e.name + '님의 신청비 ' + won(e.fee_total) + '원이 통장에 들어온 것을 확인했습니까?', mark_paid: e.name + '님의 신청비 ' + won(e.fee_total) + '원을 (현금 등으로) 받은 것으로 처리할까요?', unconfirm: '입금 확인을 풀까요? (납부 완료는 그대로 둡니다)', cancel: e.name + '님의 신청을 취소할까요?', restore: e.name + '님의 신청을 되살릴까요?' }[act];
          if (ask && !confirm(ask)) return;
          b.disabled = true;
          rpcPay(eid, act).then(function (row) { replace(row); showForm(id); }).catch(function (er) { alert(er.message); b.disabled = false; });
        };
      });
    }
    function entHTML(e) {
      var p = payOf(e), off = e.status === 'cancelled', f = formOf(e.form_id) || {}, btn = [];
      if (!off && e.fee_total > 0) {
        if (e.paid_at && !e.confirmed_at) btn.push(['confirm', '입금 확인', 'btn-solid']);
        if (e.confirmed_at) btn.push(['unconfirm', '입금 확인 풀기', 'btn-line']);
        if (e.paid_at) btn.push(['unpaid', '납부 취소·안내', 'btn-line']);
        else btn.push(['mark_paid', '납부 처리(현금 등)', 'btn-line']);
      }
      if (!off) btn.push(['message', '안내 보내기', 'btn-line']);
      btn.push(off ? ['restore', '되살리기', 'btn-line'] : ['cancel', '신청 취소', 'btn-line']);
      return '<div class="fa-ent' + (off ? ' is-off' : '') + '" data-id="' + e.id + '"><div class="fa-ent-hd"><b>' + esc(e.name) + '</b><span class="fa-st fa-st-' + p[0] + '">' + p[1] + '</span></div>' +
        '<p>' + esc(e.phone || '연락처 없음') + '</p>' +
        '<p>' + (f.ask_minor === false ? (e.adults + e.minors) + '명' : '성인 ' + e.adults + '명 · 미성년자 ' + e.minors + '명') + ' · ' + (e.fee_total > 0 ? won(e.fee_total) + '원' : '신청비 없음') + '</p>' +
        (e.memo ? '<p>' + esc((f.memo_label || '메모') + (/[?？.]$/.test(f.memo_label || '') ? ' ' : ': ') + e.memo) + '</p>' : '') +
        '<p style="color:#8a8a8a">신청 ' + esc(day(e.created_at)) + (e.paid_at ? ' · ' + (e.paid_by === 'admin' ? '납부 처리 ' : '납부했습니다 ') + esc(day(e.paid_at)) : '') + (e.confirmed_at ? ' · 교회 확인 ' + esc(day(e.confirmed_at)) : '') + '</p>' +
        (e.admin_msg ? '<div class="fa-msg">보낸 안내(' + esc(day(e.admin_msg_at)) + ', ' + (e.msg_read_at ? '읽음' : '아직 안 읽음') + '): ' + esc(e.admin_msg) + '</div>' : '') +
        '<div class="fa-btns">' + btn.map(function (b) { return '<button type="button" class="btn ' + b[2] + '" data-act="' + b[0] + '">' + b[1] + '</button>'; }).join('') + '</div></div>';
    }
    function replace(row) { if (!row) return; ENTRIES = ENTRIES.map(function (x) { return x.id === row.id ? row : x; }); }

    /* 납부 취소 + 안내 / 안내만 — 글을 고쳐 보낼 수 있다 */
    function compose(f, e, act) {
      var m = document.createElement('div'); m.className = 'modal fa-modal';
      var def = act === 'unpaid'
        ? e.name + '님, ‘' + f.title + '’ 신청비 ' + won(e.fee_total) + '원의 입금이 아직 확인되지 않았습니다. 납부 상태를 다시 확인해 주십시오. 보내셨다면 보낸 날과 보낸 분 이름을 알려 주십시오.'
        : '';
      m.innerHTML = '<div class="modal-backdrop" data-x></div><div class="modal-box" role="dialog" aria-modal="true"><button class="modal-close" data-x aria-label="닫기">&times;</button>' +
        '<h3 style="margin:0 0 6px;color:var(--accent,#032257)">' + (act === 'unpaid' ? '납부 취소 · 안내 보내기' : '안내 보내기') + '</h3>' +
        '<p style="margin:0 0 10px;font-size:.88rem;color:#4a4a4a">' + (act === 'unpaid' ? esc(e.name) + '님의 신청을 <b>미납</b>으로 되돌리고 아래 안내를 보냅니다.' : esc(e.name) + '님에게 아래 안내를 보냅니다.') + ' 안내는 그분의 대시보드와 신청서 화면 맨 위에 나옵니다.</p>' +
        '<textarea id="fa_msg" maxlength="1000">' + esc(def) + '</textarea>' +
        '<p id="fa_merr" style="color:#c0392b;font-size:.84rem;margin:6px 0 0" hidden></p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap"><button class="btn btn-line" data-x style="padding:7px 14px;font-size:.86rem">닫기</button>' +
        '<button class="btn btn-solid" id="fa_send" style="padding:7px 16px;font-size:.86rem">' + (act === 'unpaid' ? '미납으로 되돌리고 보내기' : '보내기') + '</button></div></div>';
      document.body.appendChild(m);
      var ta = m.querySelector('#fa_msg'); ta.focus();
      function close() { m.remove(); }
      Array.prototype.forEach.call(m.querySelectorAll('[data-x]'), function (x) { x.onclick = close; });
      m.querySelector('#fa_send').onclick = function () {
        var msg = ta.value.trim(), err = m.querySelector('#fa_merr');
        if (act === 'message' && !msg) { err.textContent = '보낼 안내를 적어 주십시오.'; err.hidden = false; return; }
        var b = this; b.disabled = true;
        rpcPay(e.id, act, msg).then(function (row) { replace(row); close(); showForm(f.id); })
          .catch(function (er) { err.textContent = er.message; err.hidden = false; b.disabled = false; });
      };
    }

    function csv(f, list) {
      var head = ['번호', '신청일', '이름', '연락처', '성인', '미성년자', f.memo_label || '메모', '금액', '신청 상태', '납부', '납부일', '교회 확인'];
      var rows = list.map(function (e, i) {
        return [i + 1, localInput(e.created_at).replace('T', ' '), e.name, e.phone, e.adults, e.minors, e.memo, e.fee_total, e.status === 'cancelled' ? '취소' : '신청',
          e.fee_total > 0 ? (e.paid_at ? (e.paid_by === 'admin' ? '납부 처리' : '납부 완료') : '미납') : '없음',
          e.paid_at ? localInput(e.paid_at).replace('T', ' ') : '', e.confirmed_at ? localInput(e.confirmed_at).replace('T', ' ') : ''];
      });
      var text = [head].concat(rows).map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
      var blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = f.title.replace(/[\\/:*?"<>|]/g, '') + ' 신청 명단.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    /* ── 양식 만들기·고치기 ── */
    function showEdit(f, copy) {
      if (!alive()) return;
      var isNew = !f || copy, v = f || {};
      if (copy) v = Object.assign({}, f, { title: f.title + ' (새)', open_at: null, close_at: null, event_date: null, event_time: null });
      if (isNew && !ownPay(v)) { var dp = defaultPay(); v = Object.assign({}, v, { pay_bank: dp.pay_bank || '', pay_account: dp.pay_account || '', pay_holder: dp.pay_holder || '', pay_toss_url: dp.pay_toss_url || '' }); }   /* 새 신청서 = 교회 기본 계좌 */
      function fld(label, inner, full) { return '<div class="af-field"' + (full ? ' style="grid-column:1/-1"' : '') + '><label>' + label + '</label>' + inner + '</div>'; }
      function chk(id, label, on) { return '<label class="fa-check"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + label + '</label>'; }
      var html = '<div class="fin-card"><div class="fa-head"><button class="btn btn-line" id="fa_cancel" style="padding:6px 13px;font-size:.84rem">← ' + (f && !copy ? '돌아가기' : '신청서 목록') + '</button><h3>' + (isNew ? '새 신청서' : '양식 고치기') + '</h3></div>' +
        '<div class="fa-sec">무엇을 받는 신청서인가</div><div class="fa-grid">' +
        fld('제목', '<input id="ff_title" maxlength="200" value="' + esc(v.title || '') + '" placeholder="예: 삼일 만세길 걷기">', true) +
        fld('첫 화면 한 줄 안내 (선택)', '<input id="ff_summary" maxlength="200" value="' + esc(v.summary || '') + '" placeholder="비우면 날짜·장소·신청비만 나옵니다">', true) +
        fld('자세한 안내 (선택)', '<textarea id="ff_body" rows="4">' + esc(v.body || '') + '</textarea>', true) +
        fld('행사 날짜', '<input type="date" id="ff_date" value="' + esc(v.event_date || '') + '">') +
        fld('행사 시각', '<input type="time" id="ff_time" value="' + esc(String(v.event_time || '').slice(0, 5)) + '">') +
        fld('장소', '<input id="ff_place" maxlength="200" value="' + esc(v.place || '') + '">') +
        '</div>' +
        '<div class="fa-sec">신청 기간 — 이 기간에 홈페이지 첫 화면에 저절로 뜹니다</div><div class="fa-grid">' +
        fld('신청 시작', '<input type="datetime-local" id="ff_open" value="' + esc(localInput(v.open_at) || localInput(new Date().toISOString())) + '">') +
        fld('신청 마감 (비우면 마감 없음)', '<input type="datetime-local" id="ff_close" value="' + esc(localInput(v.close_at)) + '">') +
        '</div>' +
        '<div class="fa-sec">신청비</div><div class="fa-grid">' +
        fld('성인 1명 (원)', '<input type="number" min="0" step="500" id="ff_fa" value="' + esc(v.fee_adult != null ? v.fee_adult : 0) + '">') +
        fld('미성년자 1명 (원)', '<input type="number" min="0" step="500" id="ff_fm" value="' + esc(v.fee_minor != null ? v.fee_minor : 0) + '">') +
        '<div class="af-field" style="justify-content:flex-end;display:flex;flex-direction:column">' + chk('ff_minor', '미성년자 인원을 따로 받습니다', v.ask_minor !== false) + '</div>' +
        fld('더 물어볼 것 (선택 — 비우면 메모 칸 없음)', '<input id="ff_memo" maxlength="200" value="' + esc(v.memo_label || '') + '" placeholder="예: 차량이 필요하신가요?">', true) +
        '</div>' +
        '<div class="fa-sec">납부 받는 곳 — 신청한 분 화면에 ‘토스로 송금하기’와 계좌가 나옵니다</div><div class="fa-grid">' +
        fld('은행', '<input id="ff_bank" maxlength="40" value="' + esc(v.pay_bank || '') + '" placeholder="예: 농협">') +
        fld('계좌번호', '<input id="ff_acct" maxlength="40" value="' + esc(v.pay_account || '') + '" inputmode="numeric">') +
        fld('예금주', '<input id="ff_holder" maxlength="60" value="' + esc(v.pay_holder || '') + '">') +
        fld('토스 송금 링크 (선택)', '<input id="ff_toss" maxlength="200" value="' + esc(v.pay_toss_url || '') + '" placeholder="https://toss.me/아이디">') +
        '</div>' +
        '<p class="fa-note">토스 송금 링크(toss.me)를 넣으면 ‘토스로 송금하기’가 그 링크에 금액을 붙여 열립니다. 비워 두면 은행·계좌번호로 토스 앱 송금 화면을 엽니다(토스 앱이 있는 휴대폰). 계좌번호 복사 단추는 늘 함께 나옵니다.</p>' +
        '<p class="fa-note" id="ff_preview"></p>' +
        '<div class="fa-sec">보이기</div><div style="display:flex;gap:18px;flex-wrap:wrap">' +
        chk('ff_hero', '신청 기간에 홈페이지 첫 화면에 띄웁니다', v.show_hero !== false) +
        chk('ff_pub', '공개 (끄면 숨김 — 홈페이지·신청서 페이지에서 내립니다)', v.published !== false) +
        '</div>' +
        '<p id="ff_err" class="fa-warn" style="font-size:.88rem;margin:12px 0 0" hidden></p>' +
        '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><button class="btn btn-solid" id="ff_save" style="padding:9px 20px">저장</button><button class="btn btn-line" id="ff_back2" style="padding:9px 18px">취소</button></div>' +
        '</div>';
      panel.innerHTML = html;
      var $ = function (id) { return panel.querySelector('#' + id); };
      function goBack() { if (f && !copy) showForm(f.id); else back(); }
      $('fa_cancel').onclick = goBack; $('ff_back2').onclick = goBack;
      function preview() {
        var amt = +$('ff_fa').value || 0, toss = $('ff_toss').value.trim(), bank = $('ff_bank').value.trim(), acct = $('ff_acct').value.trim();
        var F = window.WPCForms, link = '';
        if (F && amt > 0) link = F.tossMeUrl(toss, amt) || F.tossApp({ pay_bank: bank, pay_account: acct }, amt);
        $('ff_preview').textContent = link ? '성인 1명이 신청하면 ‘토스로 송금하기’가 여는 주소: ' + link : '';
      }
      ['ff_fa', 'ff_toss', 'ff_bank', 'ff_acct'].forEach(function (id) { $(id).addEventListener('input', preview); });
      preview();
      $('ff_save').onclick = function () {
        var err = $('ff_err');
        function fail(t) { err.textContent = t; err.hidden = false; }
        var title = $('ff_title').value.trim();
        if (!title) return fail('제목을 적어 주십시오.');
        var openV = $('ff_open').value, closeV = $('ff_close').value;
        if (!openV) return fail('신청 시작을 정해 주십시오.');
        var openIso = new Date(openV).toISOString(), closeIso = closeV ? new Date(closeV).toISOString() : null;
        if (closeIso && new Date(closeIso) <= new Date(openIso)) return fail('신청 마감은 시작보다 뒤여야 합니다.');
        var fa = Math.max(0, Math.round(+$('ff_fa').value || 0)), fm = Math.max(0, Math.round(+$('ff_fm').value || 0));
        var toss = $('ff_toss').value.trim();
        if (toss && !/^https?:\/\//i.test(toss)) toss = 'https://' + toss;
        if (toss && window.WPCForms && !window.WPCForms.tossMeUrl(toss, 0)) return fail('토스 송금 링크를 확인해 주십시오. 예: https://toss.me/아이디');
        var body = {
          title: title, summary: $('ff_summary').value.trim(), body: $('ff_body').value.replace(/\s+$/, ''),
          event_date: $('ff_date').value || null, event_time: $('ff_time').value || null, place: $('ff_place').value.trim(),
          open_at: openIso, close_at: closeIso, fee_adult: fa, fee_minor: fm, ask_minor: $('ff_minor').checked,
          memo_label: $('ff_memo').value.trim(),
          pay_bank: $('ff_bank').value.trim(), pay_account: $('ff_acct').value.trim(), pay_holder: $('ff_holder').value.trim(), pay_toss_url: toss,
          show_hero: $('ff_hero').checked, published: $('ff_pub').checked
        };
        var b = this; b.disabled = true; err.hidden = true;
        var req = isNew ? api('POST', 'app_forms', body, 'return=representation') : api('PATCH', 'app_forms?id=eq.' + f.id, body, 'return=representation');
        req.then(function (rows) {
          var row = (rows || [])[0]; if (!row) throw new Error('저장하지 못했습니다. 관리자 권한을 확인해 주십시오.');
          return load().then(function () { if (alive()) showForm(row.id); });
        }).catch(function (e) { fail(notReady(e) ? '신청서 표가 아직 없습니다. SQL 을 먼저 실행해 주십시오.' : e.message); b.disabled = false; });
      };
    }

    panel.innerHTML = msgCard('신청서', '불러오는 중…');
    load().then(showList).catch(function (e) {
      panel.innerHTML = notReady(e)
        ? msgCard('SQL 실행 필요', 'Supabase → SQL Editor 에서 supabase/20261010_1140_app_forms.sql 을 한 번 실행해 주십시오.')
        : msgCard('불러오지 못했습니다', e.message);
    });
  }

  return { render: render };
})();
