/* forms-admin.js — 목회 행정 > 신청서 (관리자 전용, 2026-10-10)
 *  · 신청서 보관함: 만든 신청서가 차례로 쌓인다. 지우지 않는다 — 지난 신청서도 그대로 연다.
 *    상태: 준비 중(시작 전) · 받는 중 · 마감 · 숨김(공개 해제)
 *  · 신청서 하나 = 한 화면: 신청자 명단 · 인원 · 금액 합계 · 납부 상태
 *      입금 확인 / 납부 취소(미납으로 되돌림) + 안내 보내기 / 납부 처리(현금 등) / 안내 보내기 / 신청 취소·되살리기 / 명단 내려받기
 *  · 양식 만들기·고치기: 제목·안내·행사 날짜/시각/장소·신청 기간·신청비·납부 받는 곳(은행·계좌·예금주·토스 링크)
 *    신청 기간에는 홈페이지 공지사항 맨 위에 저절로 뜬다(js/forms.js).
 *  affairs.js 의 '신청서' 탭이 WPCFormsAdmin.render(panel, { api, esc, msgCard, pushBackClose }) 로 부른다.
 *  자료: app_forms · app_entries — supabase/20261010_1140_app_forms.sql
 */
console.log('[forms-admin.js] v20261010form6');

window.WPCFormsAdmin = (function () {
  var CSS =
    '.fa-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}' +
    '.fa-head h3{margin:0;color:var(--accent,#3A281C);font-size:1.15rem}' +
    '.fa-head .fa-sub{color:#8B7B6C;font-size:.84rem}' +
    '.fa-head .fa-right{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}' +
    '.fa-list{display:flex;flex-direction:column;gap:10px}' +
    '.fa-item{border:1px solid var(--line,#E6D8C6);border-radius:5px;padding:13px 15px;background:#fff;cursor:pointer;text-align:left;font:inherit;width:100%}' +
    '.fa-item:hover{border-color:var(--accent-soft,#6E523C)}' +
    '.fa-item-hd{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}' +
    '.fa-item-hd b{color:var(--accent,#3A281C);font-size:1rem}' +
    '.fa-meta{font-size:.84rem;color:#4A3628;margin-top:3px}' +
    '.fa-stats{font-size:.84rem;color:var(--accent,#3A281C);margin-top:6px;font-weight:600}' +
    '.fa-st{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.74rem;font-weight:700;white-space:nowrap}' +
    '.fa-st-open{background:var(--accent,#3A281C);color:#fff}' +
    '.fa-st-soon{background:#fff;color:var(--accent,#3A281C);border:1px solid var(--gold,#B5562F)}' +
    '.fa-st-closed{background:#F6F2EF;color:var(--accent-soft,#6E523C)}' +
    '.fa-st-hidden{background:#F0EEEB;color:#8B7B6C}' +
    '.fa-st-due{background:#fff;color:var(--accent,#3A281C);border:1px solid var(--gold,#B5562F)}' +
    '.fa-st-paid{background:var(--accent,#3A281C);color:#fff}' +
    '.fa-st-ok{background:#F6F2EF;color:var(--accent-soft,#6E523C)}' +
    '.fa-stat{background:var(--paper-alt,#F6EFE5);border:1px solid var(--line,#E6D8C6);border-radius:4px;padding:10px 12px}' +
    '.fa-stat span{display:block;font-size:.78rem;color:#8B7B6C}' +
    '.fa-stat b{font-size:1.1rem;color:var(--accent,#3A281C)}' +
    '.fa-stat small{display:block;font-size:.76rem;color:#4A3628;margin-top:2px}' +
    '.fa-filter{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 10px}' +
    '.fa-filter button{border:1px solid var(--line,#E6D8C6);background:#fff;border-radius:999px;padding:5px 12px;font:inherit;font-size:.82rem;cursor:pointer;color:#4A3628}' +
    '.fa-filter button.on{background:var(--accent,#3A281C);border-color:var(--accent,#3A281C);color:#fff}' +
    '.fa-ents{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}' +
    '.fa-ent{border:1px solid var(--line,#E6D8C6);border-radius:5px;padding:12px 14px;background:#fff}' +
    '.fa-ent.is-off{background:#FBF9F7;color:#8B7B6C}' +
    '.fa-ent-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}' +
    '.fa-ent-hd b{font-size:1rem;color:var(--accent,#3A281C)}' +
    '.fa-ent p{margin:3px 0 0;font-size:.84rem;color:#4A3628;word-break:keep-all}' +
    '.fa-ent .fa-msg{margin-top:8px;border-left:3px solid var(--gold,#B5562F);background:#FBF5EC;padding:7px 10px;border-radius:6px;font-size:.82rem}' +
    '.fa-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}' +
    '.fa-btns button{padding:5px 11px;font-size:.8rem}' +
    '.fa-warn{color:#A33A2A}' +
    '.fa-note{font-size:.8rem;color:#8B7B6C;margin:6px 0 0}' +
    '.fa-pay{margin-top:10px;padding:10px 12px;border-radius:4px;border:1px dashed var(--gold,#B5562F);font-size:.86rem;background:#fff}' +
    '.fa-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}' +
    '.fa-sgrid{grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px}' +
    '.fa-sec{margin:18px 0 8px;font-size:.92rem;color:var(--accent,#3A281C);font-weight:700;border-bottom:1px solid var(--line,#E6D8C6);padding-bottom:6px}' +
    '.fa-check{display:flex;align-items:center;gap:8px;font-size:.9rem;cursor:pointer}' +
    '.fa-check input{width:18px;height:18px;accent-color:var(--accent,#3A281C)}' +
    '.fa-modal .modal-box{max-width:480px;padding:28px 24px 22px}' +
    '.fa-modal textarea{width:100%;min-height:110px;padding:10px;border:1px solid #ECE6E1;border-radius:4px;font:inherit;box-sizing:border-box}' +
    '.fa-plist{margin:8px 0 0;padding-left:26px;columns:2 220px;column-gap:24px;font-size:.88rem}' +
    '.fa-plist li{break-inside:avoid;padding:2px 0;color:#3A281C}' +
    '.fa-plist li small{color:#8B7B6C}' +
    '.fa-pdet{margin-top:14px;border:1px solid var(--line,#E6D8C6);border-radius:4px;padding:10px 14px;background:#fff}' +
    '.fa-pdet>summary{cursor:pointer;font-weight:700;color:var(--accent,#3A281C);font-size:.92rem}' +
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
  /* 학습·세례(입교) 신청서 (2026-10-25 담임목사 지시, supabase/20261025_1300_app_forms_baptism.sql)
     문답 질문은 신청서마다 관리자가 정한다 — 아래는 처음 넣어 주는 초안(교단 헌법의 문답으로 고쳐 쓰면 된다) */
  /* 질문 앞에 [학습] / [세례] 를 붙이면 그 종류를 고른 분에게만 묻는다 — 한 신청서에 학습·세례(입교) 문답을 함께 둔다 */
  function qText(q) { return String(q || '').replace(/^\[(학습|세례)\]\s*/, ''); }
  var Q_STUDY = ['하나님은 어떤 분이시며, 나는 하나님을 어떻게 믿게 되었습니까?', '나는 죄인임을 고백합니까? 내가 생각하는 죄가 무엇인지 적어 주십시오.',
    '예수 그리스도는 누구시며, 나를 위해 무엇을 해 주셨습니까?', '성경은 어떤 책이라고 믿습니까?', '앞으로 신앙생활(주일 예배·기도·말씀 읽기)을 어떻게 해 나가겠습니까?'].map(function (q) { return '[학습] ' + q; });
  var Q_BAPT = ['나는 죄인임을 고백하며 예수 그리스도를 나의 구주로 믿습니다. 그렇게 믿게 된 과정을 적어 주십시오.', '성부·성자·성령 하나님을 믿으며 사도신경의 고백에 동의합니까? 가장 마음에 와 닿는 고백 한 가지와 그 이유를 적어 주십시오.',
    '하나님의 말씀인 성경의 가르침대로 살며 세상의 죄를 멀리하겠습니까?', '교회의 지체로서 예배와 봉사에 힘쓰고 교회의 덕을 세우겠습니까?', '세례(입교)를 받고 싶은 이유를 나의 말로 적어 주십시오.'].map(function (q) { return '[세례] ' + q; });
  function sha16(s) {   // 서버 app_key_hash 와 같은 규칙: sha256('wpc-bt|' + 키) 앞 16자리
    var data = new TextEncoder().encode('wpc-bt|' + String(s || '').trim());
    return crypto.subtle.digest('SHA-256', data).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').slice(0, 16); });
  }
  function birthYmd(m) {
    var bd = String(m['매칭키'] || '').split('|')[1] || '';
    if (/^\d{8}$/.test(bd)) return bd.slice(0, 4) + '-' + bd.slice(4, 6) + '-' + bd.slice(6, 8);
    return String(m['생년월일'] || '').slice(0, 10);
  }
  function ageOn(ymd, now) {   // 만 나이
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''); if (!m) return null;
    var a = now.getFullYear() - +m[1]; if (now.getMonth() + 1 < +m[2] || (now.getMonth() + 1 === +m[2] && now.getDate() < +m[3])) a--;
    return a;
  }
  /* 신청 대상 기준(2026-10-25 담임목사) — 교적의 신급으로 종류를 정하고, 기준일로 대상인지 본다
       학습: 신급 원입·빈칸, 교회 등록일(등록일)에서 6개월이 지난 초신자 (총회 문답서대로 만 14세 이상)
       세례: 신급 학습, 학습일에서 6개월이 지난 분
       입교: 신급 유아세례, 만 14세가 된 분
     st: 'ok' 기준 충족 · 'check' 날짜가 비어 확인 필요 · 'wait' 아직(기간 미달 — from 날짜부터 대상) */
  function addMonths(ymd, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || ''); if (!m) return '';
    var d = new Date(+m[1], +m[2] - 1 + n, +m[3]);
    if (d.getDate() !== +m[3]) d.setDate(0);   // 31일 → 그 달 마지막 날
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function ymdOf(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function baptTargets(members, now) {
    now = now || new Date();
    var today = ymdOf(now), out = [];
    (members || []).forEach(function (m) {
      if (!m['이름']) return;
      var grade = String(m['신급'] || '').trim(), birth = birthYmd(m), age = ageOn(birth, now);
      var t = { m: m, id: m['교적ID'], name: m['이름'], key: m['매칭키'], age: age, grade: grade };
      if (!grade || grade === '원입') {
        if (age != null && age < 14) return;   // 만 14세 미만은 학습 대신 유아·어린이 세례 길
        t.kind = '학습'; t.basisLabel = '등록일'; t.basisCol = '등록일'; t.basis = String(m['등록일'] || '').slice(0, 10);
        if (!t.basis) { t.st = 'check'; t.why = '등록일 없음'; }
        else { t.from = addMonths(t.basis, 6); t.st = t.from <= today ? 'ok' : 'wait'; }
        if (age == null) { t.st = t.st === 'ok' ? 'check' : t.st; t.why = (t.why ? t.why + ' · ' : '') + '생년월일 없음'; }
      } else if (grade === '학습') {
        t.kind = '세례'; t.basisLabel = '학습일'; t.basisCol = '학습일'; t.basis = String(m['학습일'] || '').slice(0, 10);
        if (!t.basis) { t.st = 'check'; t.why = '학습일 없음'; }
        else { t.from = addMonths(t.basis, 6); t.st = t.from <= today ? 'ok' : 'wait'; }
      } else if (grade === '유아세례') {
        t.kind = '입교'; t.basisLabel = '생년월일'; t.basis = birth;
        if (age == null) { t.st = 'check'; t.why = '생년월일 없음'; }
        else if (age >= 14) t.st = 'ok';
        else { t.st = 'wait'; t.from = addMonths(birth, 14 * 12); }
      } else return;   // 세례·입교·안수 — 이미 세례교인
      out.push(t);
    });
    var ORD = { ok: 0, check: 1, wait: 2 }, KO = { '학습': 0, '세례': 1, '입교': 2 };
    return out.sort(function (a, b) { return (ORD[a.st] - ORD[b.st]) || (KO[a.kind] - KO[b.kind]) || String(a.name).localeCompare(String(b.name), 'ko'); });
  }
  function v0kind(f) { return f && f.kind === 'baptism' ? 'baptism' : 'general'; }
  function plabel(f) { return String((f && f.people_label) || '').trim() || '참가자'; }   /* 신청서마다 정한 이름표(20261024_1800) */
  /* 참가자 이름 — [{name, kind}] (이름을 받기 전에 낸 신청은 [] → '명단 없음') */
  function partsOf(e) { return (e && Array.isArray(e.participants) ? e.participants : []).filter(function (x) { return x && x.name; }); }
  function kindName(x, f) { return f && f.ask_minor === false ? '' : (x.kind === 'minor' ? '미성년자' : '성인'); }
  function partLine(e, f) {
    var ps = partsOf(e); if (!ps.length) return '';
    if (f && f.ask_minor === false) return ps.map(function (x) { return x.name; }).join(', ');
    var ad = ps.filter(function (x) { return x.kind !== 'minor'; }).map(function (x) { return x.name; });
    var mi = ps.filter(function (x) { return x.kind === 'minor'; }).map(function (x) { return x.name; });
    return [ad.length ? '성인 ' + ad.join(', ') : '', mi.length ? '미성년자 ' + mi.join(', ') : ''].filter(Boolean).join(' · ');
  }
  function notReady(e) { return /42P01|42883|PGRST20[0-9]|does not exist|schema cache|Could not find/i.test((e && e.message) || ''); }

  function render(panel, ctx) {
    injectCss();
    var api = ctx.api, esc = ctx.esc, msgCard = ctx.msgCard;
    var FORMS = [], ENTRIES = [], filter = 'all', backClose = null, HASPARTS = true;
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
        api('GET', 'church_settings?key=eq.pay_default&select=data').catch(function () { return []; }),
        api('GET', 'app_entries?select=participants&limit=0').then(function () { return true; }, function () { return false; })   /* 참가자 칸이 있나 (20261010_1300) */
      ]).then(function (r) { FORMS = r[0] || []; ENTRIES = r[1] || []; PAYDEF = (r[2] && r[2][0] && r[2][0].data) || null; HASPARTS = r[3]; });
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
      var html = '<div class="fin-card"><div class="fa-head"><h3>신청서</h3><span class="fa-sub">만든 신청서가 차례로 쌓입니다. 신청 기간에는 홈페이지 공지사항 맨 위에 저절로 뜹니다.</span>' +
        '<div class="fa-right"><button class="btn btn-solid" id="fa_new" style="padding:8px 16px;font-size:.86rem">새 신청서</button></div></div>';
      if (!HASPARTS) html += '<p class="fa-pay" style="margin:0 0 12px"><span class="fa-warn">참가자 이름 기능이 아직 준비되지 않았습니다.</span> Supabase → SQL Editor 에서 supabase/20261010_1300_app_participants.sql 을 한 번 실행해 주십시오. 그 전에는 새 신청을 받을 수 없습니다.</p>';
      if (!FORMS.length) html += '<p style="color:#8B7B6C;margin:0">아직 만든 신청서가 없습니다.</p>';
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

    /* ── 학습·세례(입교) 신청 대상 선정 (2026-10-25 담임목사) ──
         교적부를 불러와 기준(학습: 등록 6개월 · 세례: 학습 6개월 · 입교: 유아세례 + 만 14세)으로 나눠 보여 주고, 담임목사가 고른 분만 확정한다.
         서버에는 이름이 아니라 매칭키의 해시 + 종류만 저장한다(app_form_set_targets_kind, 20261025_1700). 알림 문구는 대상자의 '오늘의 안내'에 나온다.
         등록일·학습일이 비어 있으면 이 표에서 바로 적어 교적에 저장할 수 있다(교적 칼럼이 있을 때). 이 목록은 관리자 화면에서만 보인다 */
    function mountTargets(f) {
      var box = panel.querySelector('#fa_tg'); if (!box) return;
      var CONF = null, CAND = [], tab = 'all', HAS_REG = false;
      var NOTE0 = '담임목사입니다. 이번 학습·세례(입교) 신청 대상으로 선정되셨습니다. 신청 기간 안에 신청서를 내 주시고, 강의실에서 문답을 미리 공부해 주십시오.';
      box.innerHTML = '<div class="fa-sec">신청 대상 선정 — 담임목사가 골라 확정하면 대상자에게 알림이 갑니다</div>' +
        '<p class="fa-note" style="margin-top:0"><b>학습</b> 교회에 등록한 초신자로서 6개월이 지난 분(만 14세 이상) · <b>세례</b> 학습을 받고 6개월이 지난 분 · <b>입교</b> 유아세례를 받고 만 14세가 된 분</p>' +
        '<p class="fa-note" id="tg_state">확정된 대상을 확인하는 중…</p>' +
        '<div class="af-field" style="margin:8px 0 10px"><label for="tg_note">알림 문구 — 대상자의 신앙 정원 ‘오늘의 안내’와 신청서에 나옵니다</label><textarea id="tg_note" rows="2" maxlength="300" style="width:100%">' + esc(f.target_note || NOTE0) + '</textarea></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-line" id="tg_load">교적부에서 대상자 불러오기</button></div><div id="tg_list"></div>' +
        '<p class="fa-note">확정하면, 신청서가 공개·신청 기간일 때 대상자가 신앙 정원을 열면 ‘오늘의 안내’가 한 번 저절로 열려 신청을 안내하고, 오늘의 할 일·신청서 화면에도 ‘○○ 신청 대상’ 으로 나옵니다. 알림을 켠 기기에는 푸시도 갑니다. 대상을 하나도 확정하지 않으면 로그인한 누구나 신청할 수 있습니다.</p>';
      var $ = function (id) { return box.querySelector('#' + id); };
      var KIND_BY_HASH = {};
      function paintState() {
        if (CONF == null) { $('tg_state').innerHTML = '확정된 대상을 확인하는 중…'; return; }
        if (!CONF.size) { $('tg_state').innerHTML = '확정된 대상이 없습니다 — 지금은 로그인한 누구나 신청할 수 있습니다.'; return; }
        var c = { '학습': 0, '세례': 0, '입교': 0 }; CONF.forEach(function (h) { if (KIND_BY_HASH[h]) c[KIND_BY_HASH[h]]++; });
        $('tg_state').innerHTML = '확정된 대상 <b>' + CONF.size + '명</b>' + (c['학습'] + c['세례'] + c['입교'] ? ' (학습 ' + c['학습'] + ' · 세례 ' + c['세례'] + ' · 입교 ' + c['입교'] + ')' : '') + ' — 이 분들만 신청할 수 있고 알림을 받습니다.';
      }
      function readConf() {
        return api('GET', 'app_form_targets?form_id=eq.' + f.id + '&active=eq.true&select=key_hash,kind')
          .catch(function () { return api('GET', 'app_form_targets?form_id=eq.' + f.id + '&active=eq.true&select=key_hash'); })   /* 20261025_1700 실행 전 */
          .then(function (rows) { KIND_BY_HASH = {}; CONF = new Set((rows || []).map(function (r) { if (r.kind) KIND_BY_HASH[r.key_hash] = r.kind; return r.key_hash; })); paintState(); });
      }
      readConf().catch(function (e) { CONF = null; $('tg_state').textContent = notReady(e) ? '학습·세례 신청서 SQL(supabase/20261025_1300_app_forms_baptism.sql)을 먼저 실행해 주십시오.' : '확정된 대상을 읽지 못했습니다: ' + e.message; });
      var ST = { ok: ['대상', '#2E2016', '#fff'], check: ['확인 필요', '#FBEDE4', '#9C4825'], wait: ['기간 미달', '#F2F0EF', '#7D7167'] };
      function kdate(y) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(y || ''); return m ? (+m[2]) + '월 ' + (+m[3]) + '일' : ''; }
      function paintList() {
        var rows = CAND.filter(function (c) { return tab === 'all' || c.kind === tab; });
        var n = function (k, st) { return CAND.filter(function (c) { return (!k || c.kind === k) && (!st || c.st === st); }).length; };
        var sel = CAND.filter(function (c) { return c.on; });
        $('tg_list').innerHTML = '<div class="fa-filter" style="margin:12px 0 6px">' + [['all', '전체'], ['학습', '학습'], ['세례', '세례'], ['입교', '입교']].map(function (t) {
            return '<button type="button" data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] + ' ' + n(t[0] === 'all' ? '' : t[0]) + '</button>'; }).join('') + '</div>' +
          '<div class="fa-note" style="margin:0 0 6px">기준 충족 <b>' + n('', 'ok') + '명</b> · 확인 필요 ' + n('', 'check') + '명 · 기간 미달 ' + n('', 'wait') + '명 · 선택 <b id="tg_n">' + sel.length + '</b>명' + (CAND.nokey ? ' · 매칭키가 없어 뺀 ' + CAND.nokey + '명' : '') +
          ' <button type="button" class="btn btn-line" id="tg_ok" style="padding:3px 10px;font-size:.78rem">기준 충족만 선택</button> <button type="button" class="btn btn-line" id="tg_none" style="padding:3px 10px;font-size:.78rem">전체 해제</button></div>' +
          (HAS_REG ? '' : '<p class="fa-note" style="color:#9C4825;margin:0 0 6px">교적에 등록일·학습일 칸이 아직 없습니다(SQL 20261025_1700 실행 전) — 학습·세례는 모두 ‘확인 필요’로 나옵니다. 직접 확인해 고르십시오.</p>') +
          '<div style="max-height:380px;overflow:auto;border:1px solid var(--line,#E6D8C6);border-radius:10px;background:#fff"><table style="width:100%;border-collapse:collapse;font-size:.86rem"><thead><tr style="background:#f6efe6;text-align:left;position:sticky;top:0"><th style="padding:6px 8px;width:30px"></th><th style="padding:6px 8px">이름</th><th style="padding:6px 8px">신급</th><th style="padding:6px 8px">만 나이</th><th style="padding:6px 8px">대상</th><th style="padding:6px 8px">기준일</th><th style="padding:6px 8px">상태</th></tr></thead><tbody>' +
          rows.map(function (c) {
            var i = CAND.indexOf(c), stc = ST[c.st];
            var basis = c.basis ? esc(c.basis) : (HAS_REG && c.basisCol && c.id != null ? '<span style="display:inline-flex;gap:4px;align-items:center"><input type="date" data-bd="' + i + '" style="padding:3px 5px;border:1px solid #DDD9D5;border-radius:3px;font:inherit;font-size:.8rem"><button type="button" class="btn btn-line" data-bs="' + i + '" style="padding:2px 8px;font-size:.74rem">교적에 저장</button></span>' : '<span style="color:#AFA49C">—</span>');
            var stTxt = stc[0] + (c.st === 'wait' && c.from ? ' · ' + kdate(c.from) + '부터' : '') + (c.st === 'check' && c.why ? ' · ' + c.why : '');
            return '<tr style="border-top:1px solid #f0e8dd"><td style="padding:6px 8px"><input type="checkbox" data-i="' + i + '"' + (c.on ? ' checked' : '') + ' aria-label="' + esc(c.name) + ' 선택"></td>' +
              '<td style="padding:6px 8px"><b>' + esc(c.name) + '</b></td><td style="padding:6px 8px">' + esc(c.grade || '—') + '</td><td style="padding:6px 8px">' + (c.age == null ? '—' : c.age) + '</td>' +
              '<td style="padding:6px 8px"><b>' + esc(c.kind) + '</b></td><td style="padding:6px 8px;white-space:nowrap"><small style="color:#8B7B6C">' + esc(c.basisLabel) + '</small> ' + basis + '</td>' +
              '<td style="padding:6px 8px"><span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:.74rem;font-weight:700;background:' + stc[1] + ';color:' + stc[2] + '">' + esc(stTxt) + '</span></td></tr>';
          }).join('') + (rows.length ? '' : '<tr><td colspan="7" style="padding:14px;color:#8B7B6C">이 종류의 후보가 없습니다.</td></tr>') +
          '</tbody></table></div><div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn btn-solid" id="tg_save" style="padding:8px 18px">선택한 ' + sel.length + '명을 대상으로 확정하고 알림 보내기</button> <span id="tg_msg" class="fa-note" style="margin:0"></span></div>';
        var cnt = function () { var k = CAND.filter(function (c) { return c.on; }).length; $('tg_n').textContent = k; $('tg_save').textContent = '선택한 ' + k + '명을 대상으로 확정하고 알림 보내기'; };
        Array.prototype.forEach.call($('tg_list').querySelectorAll('input[type=checkbox]'), function (cb) { cb.onchange = function () { CAND[+cb.dataset.i].on = cb.checked; cnt(); }; });
        Array.prototype.forEach.call($('tg_list').querySelectorAll('[data-tab]'), function (b) { b.onclick = function () { tab = b.dataset.tab; paintList(); }; });
        $('tg_ok').onclick = function () { CAND.forEach(function (c) { c.on = c.st === 'ok'; }); paintList(); };
        $('tg_none').onclick = function () { CAND.forEach(function (c) { c.on = false; }); paintList(); };
        // 비어 있는 등록일·학습일을 이 표에서 바로 교적에 저장 → 그 줄을 다시 판단
        Array.prototype.forEach.call($('tg_list').querySelectorAll('[data-bs]'), function (b) {
          b.onclick = function () {
            var c = CAND[+b.dataset.bs], v = $('tg_list').querySelector('[data-bd="' + b.dataset.bs + '"]').value;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { $('tg_msg').textContent = c.basisLabel + '을 골라 주십시오.'; return; }
            var fields = {}; fields[c.basisCol] = v; b.disabled = true;
            window.WPF.call('updateGyojeok', { id: c.id, fields: fields }).then(function () {
              c.m[c.basisCol] = v;
              var nc = baptTargets([c.m], new Date())[0];
              if (nc) { ['basis', 'st', 'why', 'from'].forEach(function (k) { c[k] = nc[k]; }); if (c.st === 'ok') c.on = true; }
              paintList(); $('tg_msg').textContent = c.name + ' — ' + c.basisLabel + ' ' + v + ' 를 교적에 저장했습니다.';   // 표를 다시 그린 뒤에(메시지 칸도 새로 생긴다)
            }).catch(function (e) { b.disabled = false; $('tg_msg').textContent = '저장하지 못했습니다: ' + (e && e.message || e); });
          };
        });
        $('tg_save').onclick = function () {
          var picked = CAND.filter(function (c) { return c.on; });
          if (!picked.length && !confirm('선택한 분이 없습니다. 대상을 비우면 로그인한 누구나 신청할 수 있게 됩니다. 계속할까요?')) return;
          var outside = picked.filter(function (c) { return c.st !== 'ok'; }).length;
          if (outside && !confirm('기준을 아직 채우지 않았거나 확인이 필요한 분 ' + outside + '명이 들어 있습니다. 담임목사 판단으로 함께 대상에 넣을까요?')) return;
          var b = this, note = $('tg_note').value.trim(); b.disabled = true; $('tg_msg').textContent = '저장하는 중…';
          var items = picked.map(function (c) { return { h: c.hash, k: c.kind }; });
          api('POST', 'rpc/app_form_set_targets_kind', { p_form: f.id, p_items: items, p_note: note }).catch(function (e) {
            if (!notReady(e)) throw e;   // 20261025_1700 실행 전 — 종류·문구 없이 앞선 방식으로
            return api('POST', 'rpc/app_form_set_targets', { p_form: f.id, p_hashes: items.map(function (x) { return x.h; }) }).then(function (r) { if (r) r.old = true; return r; });
          }).then(function (r) {
            if (!r || !r.ok) throw new Error((r && r.error) || '저장하지 못했습니다.');
            CONF = new Set(items.map(function (x) { return x.h; })); KIND_BY_HASH = {}; items.forEach(function (x) { KIND_BY_HASH[x.h] = x.k; }); f.target_note = note; paintState();
            $('tg_msg').textContent = '확정했습니다 — 대상 ' + r.n + '명' + (r.old ? ' (종류·알림 문구는 SQL 20261025_1700 실행 뒤 저장됩니다)' : ' (학습 ' + r.learn + ' · 세례 ' + r.baptism + ' · 입교 ' + r.confirm + ')') +
              (f.published && (!f.close_at || Date.parse(f.close_at) > Date.now()) ? '. 대상자가 신앙 정원을 열면 ‘오늘의 안내’에 신청 안내가 뜹니다.' : '. 신청서를 공개하면 대상자에게 안내가 뜹니다.');
          }).catch(function (e) { $('tg_msg').textContent = notReady(e) ? 'SQL 을 먼저 실행해 주십시오.' : e.message; }).then(function () { b.disabled = false; });
        };
      }
      $('tg_load').onclick = function () {
        var b = this;
        if (!window.WPF) { $('tg_state').textContent = '교적부를 읽는 기능이 이 화면에 없습니다. 목회 행정에서 다시 열어 주십시오.'; return; }
        b.disabled = true; b.textContent = '교적부를 읽는 중…';
        window.WPF.call('listGyojeok').then(function (r) {
          var ms = (r && r.members) || [];
          HAS_REG = ms.some(function (m) { return '등록일' in m; });
          var cand = baptTargets(ms, new Date());
          var nokey = cand.filter(function (c) { return !c.key; }).length;
          cand = cand.filter(function (c) { return c.key; });
          return Promise.all(cand.map(function (c) { return sha16(c.key); })).then(function (hs) {
            cand.forEach(function (c, i) { c.hash = hs[i]; c.on = CONF && CONF.size ? CONF.has(c.hash) : c.st === 'ok'; });
            CAND = cand; CAND.nokey = nokey; paintList();
          });
        }).catch(function (e) { $('tg_state').textContent = '교적부를 읽지 못했습니다: ' + (e && e.message || e); })
          .then(function () { b.disabled = false; b.textContent = '교적부에서 대상자 다시 불러오기'; });
      };
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
        '<button class="btn btn-line" id="fa_share" style="padding:6px 13px;font-size:.84rem">링크 공유</button>' +
        '<a class="btn btn-line" href="forms.html?f=' + f.id + '" target="_blank" rel="noopener" style="padding:6px 13px;font-size:.84rem">홈페이지에서 보기</a></div></div>' +
        '<div class="fa-item-hd"><b style="font-size:1.2rem;color:var(--accent,#3A281C)">' + esc(f.title) + '</b><span class="fa-st fa-st-' + st[0] + '">' + st[1] + '</span></div>' +
        (eventText(f) || f.place ? '<div class="fa-meta">행사 ' + esc([eventText(f), f.place].filter(Boolean).join(' · ')) + '</div>' : '') +
        '<div class="fa-meta">신청 기간 ' + esc(dt(f.open_at)) + ' ~ ' + esc(f.close_at ? dt(f.close_at) : '마감 없음') + (f.show_hero ? ' · 이 기간에 공지사항에 뜸' : ' · 공지사항에 띄우지 않음') + '</div>' +
        (f.kind === 'baptism' ? '<div class="fa-meta">학습·세례(입교) 신청 · 문답 ' + ((f.questions || []).length) + '개 · 신청비 없음</div>' : '<div class="fa-meta">신청비 ' + esc(feeText(f)) + '</div>') +
        (needsPay ? '<div class="fa-pay">' + (hasPay
          ? '납부 받는 곳: ' + esc([fp.pay_bank, fp.pay_account, fp.pay_holder ? '예금주 ' + fp.pay_holder : ''].filter(Boolean).join(' ')) + (fp.pay_toss_url ? (fp.pay_account ? ' · ' : '') + '토스 링크 ' + esc(fp.pay_toss_url) : '') + (ownPay(f) ? '' : ' (교회 기본 계좌 — 목회 행정 > 설정에서 바꿉니다)')
          : '<span class="fa-warn">납부 받는 곳(계좌·토스 링크)이 비어 있습니다.</span> ‘양식 고치기’에서 넣으면 신청한 분 화면에 ‘토스로 송금하기’와 계좌가 나옵니다.') + '</div>' : '') +
        (f.kind === 'baptism' ? '<div class="fa-grid fa-sgrid" style="margin-top:14px"><div class="fa-stat"><span>신청</span><b>' + s.n + '건</b>' + (s.off ? '<small>취소 ' + s.off + '건 따로</small>' : '') + '</div>' +
          '<div class="fa-stat"><span>학습</span><b>' + list.filter(function (e) { return e.status !== 'cancelled' && e.apply_kind === '학습'; }).length + '명</b></div>' +
          '<div class="fa-stat"><span>세례(입교)</span><b>' + list.filter(function (e) { return e.status !== 'cancelled' && e.apply_kind === '세례(입교)'; }).length + '명</b></div></div>' + '<div id="fa_tg"></div>' : '') +
        (f.kind === 'baptism' ? '' : '<div class="fa-grid fa-sgrid" style="margin-top:14px">' +
        '<div class="fa-stat"><span>신청</span><b>' + s.n + '건</b>' + (s.off ? '<small>취소 ' + s.off + '건 따로</small>' : '') + '</div>' +
        '<div class="fa-stat"><span>인원</span><b>' + (s.ad + s.mi) + '명</b><small>성인 ' + s.ad + '명' + (f.ask_minor ? ' · 미성년자 ' + s.mi + '명' : '') + '</small></div>' +
        '<div class="fa-stat"><span>받을 금액</span><b>' + won(s.fee) + '원</b></div>' +
        '<div class="fa-stat"><span>납부 완료</span><b>' + won(s.paid) + '원</b><small>교회 확인 ' + won(s.conf) + '원' + (s.unconfN ? ' · 확인 전 ' + s.unconfN + '건' : '') + '</small></div>' +
        '<div class="fa-stat"><span>미납</span><b>' + won(s.due) + '원</b><small>' + s.dueN + '건</small></div>' +
        '</div>') +
        (f.kind === 'baptism' ? '' : partListHTML(f, list)) +
        '<div class="fa-filter">' + [['all', '전체'], ['due', '미납'], ['claimed', '납부 완료(확인 전)'], ['conf', '교회 확인'], ['off', '취소']].map(function (t) {
          return '<button type="button" data-f="' + t[0] + '" class="' + (filter === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
        }).join('') + '</div>' +
        (shown.length ? '<div class="fa-ents">' + shown.map(entHTML).join('') + '</div>' : '<p style="color:#8B7B6C;margin:6px 0 0">해당하는 신청이 없습니다.</p>') +
        '<p class="fa-note">‘입금 확인’은 통장 내역과 맞춰 본 뒤 누릅니다. 맞지 않으면 ‘납부 취소’로 미납으로 되돌리고, 신청한 분에게 확인을 부탁하는 안내를 함께 보냅니다(신청한 분의 대시보드·신청서 화면 맨 위에 나옵니다).</p>' +
        '</div>';
      panel.innerHTML = html;
      if (f.kind === 'baptism') mountTargets(f);
      panel.querySelector('#fa_back').onclick = back;
      panel.querySelector('#fa_edit').onclick = function () { showEdit(f); };
      panel.querySelector('#fa_copy').onclick = function () { showEdit(f, true); };
      panel.querySelector('#fa_csv').onclick = function () { csv(f, list); };
      panel.querySelector('#fa_share').onclick = function () {   // 링크 공유: 폰은 공유창(카톡 등), 그 밖에는 링크 복사 — 열면 그 신청서가 바로 열린다
        var btn = this, url = new URL('forms.html?f=' + f.id, location.href).href;
        var text = f.title + (eventText(f) || f.place ? '\n행사 ' + [eventText(f), f.place].filter(Boolean).join(' · ') : '') + (f.close_at ? '\n' + dt(f.close_at) + '까지 신청' : '');
        var copy = function () {
          var done = function () { var o = btn.dataset.o || (btn.dataset.o = btn.textContent); btn.textContent = '링크를 복사했습니다'; setTimeout(function () { btn.textContent = o; }, 1800); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('링크를 복사하십시오', url); });
          else window.prompt('링크를 복사하십시오', url);
        };
        if (navigator.share) navigator.share({ title: f.title, text: text, url: url }).catch(function (er) { if (!er || er.name !== 'AbortError') copy(); });
        else copy();
      };
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
    /* 참가자 명단 — 취소하지 않은 신청의 참가자 전부, 번호와 신청한 분 */
    function partListHTML(f, list) {
      var act = list.filter(function (e) { return e.status !== 'cancelled'; }), rows = [], none = 0;
      act.forEach(function (e) {
        var ps = partsOf(e);
        if (!ps.length) { none++; return; }
        ps.forEach(function (x) { rows.push({ name: x.name, kind: kindName(x, f), from: e.name }); });
      });
      if (!act.length) return '';
      return '<details class="fa-pdet" open><summary>' + esc(plabel(f)) + ' 명단 · ' + rows.length + '명' + (none ? ' (명단 없음 ' + none + '건)' : '') + '</summary>' +
        (rows.length ? '<ol class="fa-plist">' + rows.map(function (r) {
          return '<li>' + esc(r.name) + (r.kind ? ' <small>' + r.kind + '</small>' : '') + ' <small>· ' + esc(r.from) + ' 신청</small></li>';
        }).join('') + '</ol>' : '<p class="fa-note" style="margin-top:8px">아직 이름이 적힌 신청이 없습니다.</p>') +
        (none ? '<p class="fa-note">명단 없음 = 참가자 이름을 받기 전에 낸 신청입니다. 신청한 분이 ‘신청 고치기’로 이름을 적으면 명단에 들어갑니다.</p>' : '') +
        '</details>';
    }
    function entHTML(e) {
      var p = payOf(e), off = e.status === 'cancelled', f = formOf(e.form_id) || {}, btn = [];
      if (!off && e.fee_total > 0) {
        if (!e.confirmed_at) btn.push(['confirm', '입금 확인', 'btn-solid']);   // 신청자가 '납부했습니다'를 누르기 전이라도 통장에 들어왔으면 바로 확정(서버가 납부 완료로 함께 기록)
        if (e.confirmed_at) btn.push(['unconfirm', '입금 확인 풀기', 'btn-line']);
        if (e.paid_at) btn.push(['unpaid', '납부 취소·안내', 'btn-line']);
        else btn.push(['mark_paid', '납부 처리(현금 등)', 'btn-line']);
      }
      if (!off) btn.push(['message', '안내 보내기', 'btn-line']);
      btn.push(off ? ['restore', '되살리기', 'btn-line'] : ['cancel', '신청 취소', 'btn-line']);
      return '<div class="fa-ent' + (off ? ' is-off' : '') + '" data-id="' + e.id + '"><div class="fa-ent-hd"><b>' + esc(e.name) + '</b><span class="fa-st fa-st-' + p[0] + '">' + p[1] + '</span></div>' +
        '<p>' + esc(e.phone || '연락처 없음') + '</p>' +
        (f.kind === 'baptism' ? '<p><b>' + esc(e.apply_kind || '종류 없음') + '</b> 신청</p>' + ((e.answers || []).length ? '<details class="fa-pdet"><summary>문답 보기 (' + e.answers.length + ')</summary>' + (function () { var n = 0; return e.answers.map(function (a, i) { if (!a) return ''; n++; return '<p style="margin:6px 0 0"><b>' + n + '. ' + esc(qText((f.questions || [])[i])) + '</b><br>' + esc(a).replace(/\n/g, '<br>') + '</p>'; }).join(''); })() + '</details>' : '') : '') +
        (f.kind === 'baptism' ? '' : '<p>' + (f.ask_minor === false ? (e.adults + e.minors) + '명' : '성인 ' + e.adults + '명 · 미성년자 ' + e.minors + '명') + ' · ' + (e.fee_total > 0 ? won(e.fee_total) + '원' : '신청비 없음') + '</p>') +
        (f.kind === 'baptism' ? '' : partLine(e, f) ? '<p>' + esc(plabel(f)) + ': ' + esc(partLine(e, f)) + '</p>' : '<p style="color:#8B7B6C">' + esc(plabel(f)) + ': 명단 없음</p>') +
        (f.kind === 'baptism' ? '' : e.memo ? '<p>' + esc((f.memo_label || '메모') + (/[?？.]$/.test(f.memo_label || '') ? ' ' : ': ') + e.memo) + '</p>' : '') +
        '<p style="color:#8B7B6C">신청 ' + esc(day(e.created_at)) + (e.paid_at ? ' · ' + (e.paid_by === 'admin' ? '납부 처리 ' : '납부했습니다 ') + esc(day(e.paid_at)) : '') + (e.confirmed_at ? ' · 교회 확인 ' + esc(day(e.confirmed_at)) : '') + '</p>' +
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
        '<h3 style="margin:0 0 6px;color:var(--accent,#3A281C)">' + (act === 'unpaid' ? '납부 취소 · 안내 보내기' : '안내 보내기') + '</h3>' +
        '<p style="margin:0 0 10px;font-size:.88rem;color:#4A3628">' + (act === 'unpaid' ? esc(e.name) + '님의 신청을 <b>미납</b>으로 되돌리고 아래 안내를 보냅니다.' : esc(e.name) + '님에게 아래 안내를 보냅니다.') + ' 안내는 그분의 대시보드와 신청서 화면 맨 위에 나옵니다.</p>' +
        '<textarea id="fa_msg" maxlength="1000">' + esc(def) + '</textarea>' +
        '<p id="fa_merr" style="color:#A33A2A;font-size:.84rem;margin:6px 0 0" hidden></p>' +
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
      if (f.kind === 'baptism') {   // 학습·세례(입교): 신청 종류 + 문답 칸
        var qs = f.questions || [], head0 = ['번호', '신청일', '이름', '연락처', '신청 종류', '신청 상태'].concat(qs.map(function (q, i) { return (i + 1) + '. ' + String(q).replace(/^\[(학습|세례)\]\s*/, function (m, k) { return '[' + k + '] '; }); }));
        var rows0 = list.map(function (e, i) { return [i + 1, localInput(e.created_at).replace('T', ' '), e.name, e.phone, e.apply_kind || '', e.status === 'cancelled' ? '취소' : '신청'].concat(qs.map(function (_, k) { return (e.answers || [])[k] || ''; })); });
        var text0 = [head0].concat(rows0).map(function (r) { return r.map(function (c) { c = String(c == null ? '' : c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
        var blob0 = new Blob(['\ufeff' + text0], { type: 'text/csv;charset=utf-8' }), a0 = document.createElement('a'); a0.href = URL.createObjectURL(blob0);
        a0.download = f.title.replace(/[\\/:*?"<>|]/g, '') + ' 신청 명단.csv'; document.body.appendChild(a0); a0.click(); setTimeout(function () { URL.revokeObjectURL(a0.href); a0.remove(); }, 500);
        return;
      }
      var head = ['번호', '신청일', '이름', '연락처', '성인', '미성년자', plabel(f), f.memo_label || '메모', '금액', '신청 상태', '납부', '납부일', '교회 확인'];
      var rows = list.map(function (e, i) {
        var ps = partsOf(e).map(function (x) { var k = kindName(x, f); return x.name + (k ? '(' + k + ')' : ''); }).join(', ') || '명단 없음';
        return [i + 1, localInput(e.created_at).replace('T', ' '), e.name, e.phone, e.adults, e.minors, ps, e.memo, e.fee_total, e.status === 'cancelled' ? '취소' : '신청',
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
      var hasLabelCol = FORMS.some(function (x) { return 'people_label' in x; });   /* 20261024_1800_app_forms_people_label.sql 실행 뒤에만 '이름표' 칸 */
      var hasSameCol = FORMS.some(function (x) { return 'allow_same_name' in x; });   /* 20261024_1810_app_forms_allow_same_name.sql 실행 뒤에만 '같은 이름도 받기' 칸 */
      var hasKindCol = FORMS.some(function (x) { return 'kind' in x; }), isBapt = v0kind(f) === 'baptism';   /* 20261025_1300_app_forms_baptism.sql 실행 뒤에만 '신청서 종류' 칸 */
      var hasImgCol = FORMS.some(function (x) { return 'image_url' in x; });   /* 20261010_1700_app_forms_image.sql 실행 뒤에만 '안내 그림' 칸 */
      if (copy) v = Object.assign({}, f, { title: f.title + ' (새)', open_at: null, close_at: null, event_date: null, event_time: null });
      if (isNew && !ownPay(v)) { var dp = defaultPay(); v = Object.assign({}, v, { pay_bank: dp.pay_bank || '', pay_account: dp.pay_account || '', pay_holder: dp.pay_holder || '', pay_toss_url: dp.pay_toss_url || '' }); }   /* 새 신청서 = 교회 기본 계좌 */
      function fld(label, inner, full) { return '<div class="af-field"' + (full ? ' style="grid-column:1/-1"' : '') + '><label>' + label + '</label>' + inner + '</div>'; }
      function chk(id, label, on) { return '<label class="fa-check"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '> ' + label + '</label>'; }
      var html = '<div class="fin-card"><div class="fa-head"><button class="btn btn-line" id="fa_cancel" style="padding:6px 13px;font-size:.84rem">← ' + (f && !copy ? '돌아가기' : '신청서 목록') + '</button><h3>' + (isNew ? '새 신청서' : '양식 고치기') + '</h3></div>' +
        '<div class="fa-sec">무엇을 받는 신청서인가</div><div class="fa-grid">' +
        (hasKindCol ? fld('신청서 종류', '<select id="ff_kind"><option value="general"' + (isBapt ? '' : ' selected') + '>일반 신청서 (행사·모임·책 등)</option><option value="baptism"' + (isBapt ? ' selected' : '') + '>학습·세례(입교) 신청 — 문답을 적어 냄</option></select>', true) : '') +
        fld('제목', '<input id="ff_title" maxlength="200" value="' + esc(v.title || '') + '" placeholder="예: 삼일 만세길 걷기">', true) +
        fld('공지사항 한 줄 안내 (선택)', '<input id="ff_summary" maxlength="200" value="' + esc(v.summary || '') + '" placeholder="비우면 날짜·장소·신청비만 나옵니다">', true) +
        fld('자세한 안내 (선택)', '<textarea id="ff_body" rows="4">' + esc(v.body || '') + '</textarea>', true) +
        /* 안내 그림(코스 약도·포스터) — image_url, 2026-10-10. 칸이 아직 없으면(SQL 전) 보이지 않는다 */
        (hasImgCol ? fld('안내 그림 (선택) — 코스 약도·포스터 등', '<div style="display:flex;gap:6px;align-items:center"><input id="ff_img" maxlength="500" value="' + esc(v.image_url || '') + '" placeholder="그림 주소 — 아래 단추로 올리면 저절로 채워집니다" style="flex:1;min-width:0">' +
          '<button type="button" class="btn btn-line" id="ff_img_up" style="padding:6px 12px;white-space:nowrap">그림 올리기</button><button type="button" class="btn btn-line" id="ff_img_rm" style="padding:6px 10px">빼기</button></div>' +
          '<div id="ff_img_pv" style="margin-top:8px"></div>', true) : '') +
        fld('행사 날짜', '<input type="date" id="ff_date" value="' + esc(v.event_date || '') + '">') +
        fld('행사 시각', '<input type="time" id="ff_time" value="' + esc(String(v.event_time || '').slice(0, 5)) + '">') +
        fld('장소', '<input id="ff_place" maxlength="200" value="' + esc(v.place || '') + '">') +
        '</div>' +
        (hasKindCol ? '<div id="ff_qa"' + (isBapt ? '' : ' hidden') + '><div class="fa-sec">문답 — 신청하는 분이 적어 낼 질문 (한 줄에 질문 하나)</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><button type="button" class="btn btn-line" id="ff_q_study" style="padding:5px 12px;font-size:.82rem">학습+세례 문답 초안 넣기</button><button type="button" class="btn btn-line" id="ff_q_bapt" style="padding:5px 12px;font-size:.82rem">세례 문답만</button><button type="button" class="btn btn-line" id="ff_q_clear" style="padding:5px 12px;font-size:.82rem">비우기</button></div>' +
          '<textarea id="ff_qs" rows="7" style="width:100%" placeholder="예: 하나님은 어떤 분이시며, 나는 하나님을 어떻게 믿게 되었습니까?">' + esc((v.questions || []).join('\n')) + '</textarea>' +
          '<p class="fa-note">초안은 교단 헌법의 문답에 맞게 고쳐 쓰세요. 질문 앞에 <b>[학습]</b> 을 붙이면 학습을 고른 분에게만, <b>[세례]</b> 를 붙이면 세례(입교)를 고른 분에게만 묻고, 아무것도 안 붙이면 모두에게 묻습니다. 신청하는 분은 ‘학습 / 세례(입교)’ 중 하나를 고른 뒤 그에 맞는 질문에 답을 적습니다. 신청비는 받지 않습니다.</p></div>' : '') +
        '<div class="fa-sec">신청 기간 — 이 기간에 홈페이지 공지사항 맨 위에 저절로 뜹니다</div><div class="fa-grid">' +
        fld('신청 시작', '<input type="datetime-local" id="ff_open" value="' + esc(localInput(v.open_at) || localInput(new Date().toISOString())) + '">') +
        fld('신청 마감 (비우면 마감 없음)', '<input type="datetime-local" id="ff_close" value="' + esc(localInput(v.close_at)) + '">') +
        '</div>' +
        '<div id="ff_gen"' + (isBapt ? ' hidden' : '') + '><div class="fa-sec">신청비</div><div class="fa-grid">' +
        (hasLabelCol ? fld('신청하는 분을 뭐라고 부를까요', '<input id="ff_plabel" maxlength="12" list="ff_plabel_l" value="' + esc(plabel(v)) + '" placeholder="참가자"><datalist id="ff_plabel_l"><option value="참가자"><option value="신청자"><option value="수령자"><option value="대상자"><option value="이용자"></datalist><small style="color:#8B7B6C">신청 화면·명단·엑셀에 이 말로 나옵니다. 예) 행사는 참가자, 책은 신청자·수령자</small>', true) : '') +
        (hasSameCol ? '<div class="af-field" style="grid-column:1/-1">' + chk('ff_same', '같은 이름도 받습니다 (예: 한 사람이 책을 여러 권 신청)', !!v.allow_same_name) + '</div>' : '') +
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
        '<p class="fa-note" id="ff_preview"></p></div>' +
        '<div class="fa-sec">보이기</div><div style="display:flex;gap:18px;flex-wrap:wrap">' +
        chk('ff_hero', '신청 기간에 홈페이지 공지사항에 띄웁니다', v.show_hero !== false) +
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
      if (hasKindCol) {
        var syncKind = function () { var b = $('ff_kind').value === 'baptism'; $('ff_qa').hidden = !b; $('ff_gen').hidden = b; };
        $('ff_kind').onchange = function () { syncKind(); if ($('ff_kind').value === 'baptism' && !$('ff_qs').value.trim()) $('ff_qs').value = Q_STUDY.concat(Q_BAPT).join('\n'); };
        $('ff_q_study').onclick = function () { $('ff_qs').value = Q_STUDY.concat(Q_BAPT).join('\n'); };
        $('ff_q_bapt').onclick = function () { $('ff_qs').value = Q_BAPT.join('\n'); };
        $('ff_q_clear').onclick = function () { $('ff_qs').value = ''; };
      }
      ['ff_fa', 'ff_toss', 'ff_bank', 'ff_acct'].forEach(function (id) { $(id).addEventListener('input', preview); });
      preview();
      if (hasImgCol) {   // 안내 그림: 올리기(교회 파일 서버) · 주소 붙여넣기 · 미리보기 · 빼기
        var imgIn = $('ff_img'), imgPv = $('ff_img_pv'), imgMsg = function (t) { imgPv.innerHTML = '<span style="font-size:.82rem;color:#A33A2A">' + esc(t) + '</span>'; };
        var paintImg = function () { var u = imgIn.value.trim(); imgPv.innerHTML = /^(https?:\/\/|images\/)/i.test(u) ? '<img src="' + esc(u) + '" alt="안내 그림 미리보기" style="max-width:100%;max-height:260px;border:1px solid var(--line,#E6D8C6);border-radius:4px">' : ''; };
        imgIn.addEventListener('input', paintImg); paintImg();
        $('ff_img_rm').onclick = function () { imgIn.value = ''; paintImg(); };
        $('ff_img_up').onclick = function () {
          if (!(window.ChurchUpload && window.ChurchUpload.isReady())) { imgMsg('파일 올리기 서버가 준비되지 않았습니다. 그림 주소를 직접 넣어 주십시오.'); return; }
          var fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*';
          fi.onchange = function () {
            var file = fi.files && fi.files[0]; if (!file) return;
            var btn = $('ff_img_up'); btn.disabled = true; btn.textContent = '올리는 중…';
            window.ChurchUpload.upload(file, { folder: 'forms', compress: false })
              .then(function (res) { imgIn.value = res.url; paintImg(); })
              .catch(function (e) { imgMsg('올리지 못했습니다: ' + e.message); })
              .then(function () { btn.disabled = false; btn.textContent = '그림 올리기'; });
          };
          fi.click();
        };
      }
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
        if (hasImgCol) body.image_url = $('ff_img').value.trim() || null;
        if (hasSameCol) body.allow_same_name = $('ff_same').checked;
        if (hasKindCol) {
          body.kind = $('ff_kind').value;
          body.questions = $('ff_qs').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 30);
          if (body.kind === 'baptism') {
            if (!body.questions.length) return fail('문답 질문을 한 줄 이상 적어 주십시오. ‘학습 문답 초안 넣기’를 누르면 처음 틀이 들어갑니다.');
            body.fee_adult = 0; body.fee_minor = 0; body.ask_minor = false; body.memo_label = '';
          } else body.questions = [];
        }
        if (hasLabelCol) body.people_label = ($('ff_plabel').value.trim() || '참가자').slice(0, 12);
        var b = this; b.disabled = true; err.hidden = true;
        var req = isNew ? api('POST', 'app_forms', body, 'return=representation') : api('PATCH', 'app_forms?id=eq.' + f.id, body, 'return=representation');
        req.then(function (rows) {
          var row = (rows || [])[0]; if (!row) throw new Error('저장하지 못했습니다. 관리자 권한을 확인해 주십시오.');
          return load().then(function () { if (alive()) showForm(row.id); });
        }).catch(function (e) { fail(notReady(e) ? '신청서 표가 아직 없습니다. SQL 을 먼저 실행해 주십시오.' : e.message); b.disabled = false; });
      };
    }

    panel.innerHTML = msgCard('신청서', '불러오는 중…');
    load().then(function () {
      var op = window.__faOpen; window.__faOpen = null;
      if (op && formOf(op.id)) { filter = op.filter || 'all'; enter(function () { showForm(op.id); }); return; }
      showList();
    }).catch(function (e) {
      panel.innerHTML = notReady(e)
        ? msgCard('SQL 실행 필요', 'Supabase → SQL Editor 에서 supabase/20261010_1140_app_forms.sql 을 한 번 실행해 주십시오.')
        : msgCard('불러오지 못했습니다', e.message);
    });
  }

  return { render: render };
})();
