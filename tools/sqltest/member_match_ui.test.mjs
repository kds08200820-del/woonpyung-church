// 교적 인증 「신청 → 관리자 승인」 화면 · 증명서 도장 시험 — 가짜 자료만(jsdom).
//   빈 폴더에서 npm i jsdom 후 이 파일을 그 폴더로 복사해
//   node member_match_ui.test.mjs <저장소 경로>
//   보는 것: 내 정보의 신청 표시(js/finance-member.js) · 권한 관리의 신청 상자(js/gyojeok.js)
//           · 도장 설정(js/edu-admin.js) · 증명서 인쇄의 교회 직인(js/edu-print.js)
import { JSDOM } from 'jsdom'; import fs from 'fs';
const ROOT = process.argv[2];
const src = f => fs.readFileSync(ROOT + '/js/' + f, 'utf8');
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const wait = async n => { for (let i = 0; i < n; i++) await tick(); };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
function win(body, url) {
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + body + '</body></html>', { url: url || 'http://localhost/x.html', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window; w.__calls = []; w.confirm = () => true; w.alert = () => { }; w.console.log = () => { };
  return w;
}
// WPF 가짜: answers[action] = 값 | 함수(params) | Error
function wpf(w, answers) {
  w.FINANCE_API_URL = 'x';
  w.WPF = {
    token: () => 't',
    call: (a, p) => {
      w.__calls.push([a, p]);
      const v = typeof answers[a] === 'function' ? answers[a](p) : answers[a];
      return v instanceof Error || v === undefined ? Promise.reject(v || new Error('404 ' + a)) : Promise.resolve(JSON.parse(JSON.stringify(v)));
    }
  };
}

/* ── 1) 내 정보: 교적 인증 신청 ── */
const MEMBER_BODY = '<div id="offeringBox" hidden><div id="offeringBody"></div></div>';
{ // (가) 기다리는 신청이 있으면 그 사실을 먼저 보인다
  const w = win(MEMBER_BODY); wpf(w, { me: { ok: true, status: '준회원', memberName: '' }, myMatchRequest: { status: '대기', name: '홍길동', at: '2026-11-24T10:00:00Z' } });
  w.eval(src('finance-member.js')); await wait(4);
  const t = w.document.getElementById('offeringBody').textContent;
  ok(/홍길동/.test(t) && /신청했습니다/.test(t) && /관리자가 확인하면 정회원/.test(t), '내 정보: 기다리는 신청 표시');
  ok(w.document.getElementById('mm_btn').textContent === '다시 신청', '내 정보: 단추는 「다시 신청」');
}
{ // (나) 서버에 함수가 아직 없어도(SQL 실행 전) 양식은 그대로, 옛 답도 그대로 보인다
  const w = win(MEMBER_BODY); wpf(w, { me: { ok: true, status: '준회원', memberName: '' }, match: { ok: true, status: '준회원', message: '옛 안내' } });
  w.eval(src('finance-member.js')); await wait(4);
  const d = w.document;
  ok(d.getElementById('mm_btn').textContent === '교적 인증 신청' && !/신청했습니다/.test(d.getElementById('offeringBody').textContent), '내 정보: SQL 실행 전에도 양식이 뜸');
  d.getElementById('mm_name').value = '홍길동'; d.getElementById('mm_birth').value = '1970-01-01';
  d.getElementById('mm_btn').click(); await wait(3);
  const c = w.__calls.filter(x => x[0] === 'match')[0];
  ok(c && c[1].name === '홍길동' && c[1].birth === '19700101', '내 정보: 이름 · 생년월일 8자리로 신청');
  ok(d.getElementById('mm_msg').textContent === '옛 안내' && !d.getElementById('mm_btn').disabled, '내 정보: 옛 서버 답도 그대로 보임');
}
{ // (다) 새 서버 답: 승인대기 → 받았다는 안내, 거절 → 사유와 다시 누를 수 있음, 두 번 눌러도 한 번만
  const w = win(MEMBER_BODY); let n = 0;
  wpf(w, { me: { ok: true, status: '준회원', memberName: '' }, myMatchRequest: { status: '' }, match: () => (++n === 1 ? { ok: false, error: '하루 다섯 번까지입니다.' } : { ok: true, status: '승인대기', message: '신청을 받았습니다.' }) });
  w.eval(src('finance-member.js')); await wait(4);
  const d = w.document;
  d.getElementById('mm_name').value = '홍길동'; d.getElementById('mm_birth').value = '19700101';
  d.getElementById('mm_btn').click(); await wait(3);
  ok(d.getElementById('mm_msg').textContent === '하루 다섯 번까지입니다.' && !d.getElementById('mm_btn').disabled, '내 정보: 거절 사유 표시');
  d.getElementById('mm_btn').click(); d.getElementById('mm_btn').click(); await wait(3);
  ok(w.__calls.filter(x => x[0] === 'match').length === 2 && /신청을 받았습니다/.test(d.getElementById('mm_msg').textContent), '내 정보: 승인대기 안내 · 두 번 눌러도 한 번만');
}
{ // (라) 정회원은 예전 화면 그대로
  const w = win(MEMBER_BODY); w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  wpf(w, { me: { ok: true, status: '정회원', memberName: '홍길동' } });
  w.eval(src('finance-member.js')); await wait(4);
  ok(/정회원/.test(w.document.getElementById('offeringBody').textContent) && !w.document.getElementById('mm_btn') && !w.__calls.some(x => x[0] === 'myMatchRequest'), '내 정보: 정회원은 신청 양식 없음');
}

/* ── 2) 권한 관리: 신청 상자 ── */
const USERS = [{ uid: 'u1', name: '가입자1', email: 'u1@example.test', status: '준회원', isAdmin: false, canFinance: false }];
const REQS = [
  { id: 11, uid: 'u1', signupName: '가입자1', email: 'u1@example.test', name: '홍길동', birth: '19700101', matched: true, linked: 1, at: '2026-11-24T10:00:00Z' },
  { id: 12, uid: 'u2', signupName: '<b>가입자2</b>', email: 'u2@example.test', name: '없는사람', birth: '19990909', matched: false, linked: 0, at: '2026-11-24T11:00:00Z' }
];
{ // (가) 신청 2건: 교적에 있는 것만 승인 단추, 승인하면 번호와 함께 서버로
  const w = win('<div id="gjRoot"></div>'); let asked = '';
  w.confirm = m => { asked = m; return true; };
  wpf(w, { listAccess: { ok: true, users: USERS }, listGyojeok: { ok: true, members: [] }, listMatchRequests: { ok: true, requests: REQS }, decideMatchRequest: { ok: true } });
  w.eval(src('gyojeok.js')); await wait(5);
  const d = w.document, rows = d.querySelectorAll('#gjReq tr[data-id]');
  ok(rows.length === 2 && /교적 인증 신청 2건/.test(d.getElementById('gjReq').textContent), '권한 관리: 신청 2건 상자');
  ok(!!rows[0].querySelector('[data-ok="1"]') && !rows[1].querySelector('[data-ok="1"]') && !!rows[1].querySelector('[data-ok="0"]'), '권한 관리: 교적에 없는 신청은 승인 단추 없음');
  ok(/1970-01-01/.test(rows[0].textContent) && /이미 연결된 계정 1개/.test(rows[0].textContent), '권한 관리: 생년월일 · 이미 연결된 계정 표시');
  ok(!rows[1].querySelector('td b b') && /<b>가입자2<\/b>/.test(rows[1].textContent), '권한 관리: 이름은 글자로만(태그로 풀리지 않음)');
  ok(d.querySelectorAll('#gjPanel > .fin-card tr[data-uid]').length === 1, '권한 관리: 아래 회원 표도 그대로');
  rows[0].querySelector('[data-ok="1"]').click(); await wait(5);
  const c = w.__calls.filter(x => x[0] === 'decideMatchRequest')[0];
  ok(c && c[1].id === 11 && c[1].approve === true && /이미 다른 계정 1개/.test(asked), '권한 관리: 승인 → 번호 11 · 이미 연결된 계정을 물음');
  ok(w.__calls.filter(x => x[0] === 'listAccess').length === 2, '권한 관리: 승인 뒤 다시 그림');
}
{ // (나) 돌려보냄 실패 → 사유를 보이고 단추를 다시 살린다
  const w = win('<div id="gjRoot"></div>');
  wpf(w, { listAccess: { ok: true, users: USERS }, listGyojeok: { ok: true, members: [] }, listMatchRequests: { ok: true, requests: REQS }, decideMatchRequest: { ok: false, error: '이미 처리했거나 없는 신청입니다.' } });
  w.eval(src('gyojeok.js')); await wait(5);
  const d = w.document, b = d.querySelectorAll('#gjReq tr[data-id]')[1].querySelector('[data-ok="0"]');
  b.click(); await wait(4);
  const c = w.__calls.filter(x => x[0] === 'decideMatchRequest')[0];
  ok(c && c[1].id === 12 && c[1].approve === false && /이미 처리했거나/.test(d.getElementById('gjReqMsg').textContent) && !b.disabled, '권한 관리: 돌려보냄 실패 → 사유 · 단추 다시 살아남');
}
{ // (다) SQL 실행 전(함수 없음) · 신청 없음 → 상자 없이 회원 표만
  for (const ans of [undefined, { ok: true, requests: [] }]) {
    const w = win('<div id="gjRoot"></div>');
    wpf(w, { listAccess: { ok: true, users: USERS }, listGyojeok: { ok: true, members: [] }, listMatchRequests: ans });
    w.eval(src('gyojeok.js')); await wait(5);
    ok(w.document.getElementById('gjReq').innerHTML === '' && w.document.querySelectorAll('tr[data-uid]').length === 1, '권한 관리: ' + (ans ? '신청 없음' : 'SQL 실행 전') + ' → 상자 없음, 회원 표는 뜸');
  }
}

/* ── 3) 도장 설정(증명서 발급 화면) ── */
async function seals(settings) {
  const w = win('<div id="root"></div>');
  wpf(w, { listGyojeok: { ok: true, members: [] }, getSettings: { ok: true, settings }, setSetting: { ok: true } });
  w.WPC_CATECHISM = { courses: {}, church: { name: '운평장로교회', pastor: '홍길동' } };
  w.eval(src('edu-admin.js'));
  w.WPCEduAdmin.page(w.document.getElementById('root'), { api: () => Promise.resolve([]), esc: s => String(s), note: () => { }, pushBackClose: () => { } });
  await wait(5); return w;
}
{
  let w = await seals({}), d = w.document;
  const cs = () => d.querySelector('[data-seal="cs"]'), ps = () => d.querySelector('[data-seal="ps"]');
  ok(cs() && ps() && cs().querySelector('.sl-prev').textContent === '미등록' && ps().querySelector('.sl-prev').textContent === '미등록', '도장 설정: 둘 다 미등록');
  ok(!/images\//.test(d.getElementById('root').innerHTML), '도장 설정: 저장소 그림 주소를 쓰지 않음');
  w = await seals({ rcp_img_seal: 'https://files.example.test/f/fin/seal.png', edu_img_pastor_seal: 'https://files.example.test/f/church/seal/p.png' }); d = w.document;
  ok(cs().querySelector('img').getAttribute('src') === 'https://files.example.test/f/fin/seal.png' && cs().querySelector('.sl-del').hidden && /재정 설정/.test(cs().querySelector('.sl-msg').textContent), '도장 설정: 교회 직인이 없으면 재정 설정의 직인');
  ok(ps().querySelector('img').getAttribute('src') === 'https://files.example.test/f/church/seal/p.png' && !ps().querySelector('.sl-del').hidden, '도장 설정: 당회장 인은 그대로');
  w = await seals({ rcp_img_seal: 'https://files.example.test/f/fin/seal.png', edu_img_church_seal: 'https://files.example.test/f/church/seal/c.png' }); d = w.document;
  ok(cs().querySelector('img').getAttribute('src') === 'https://files.example.test/f/church/seal/c.png' && !cs().querySelector('.sl-del').hidden, '도장 설정: 따로 올린 교회 직인이 먼저');
  cs().querySelector('.sl-del').click(); await wait(3);
  const c = w.__calls.filter(x => x[0] === 'setSetting')[0];
  ok(c && c[1].key === 'edu_img_church_seal' && c[1].value === '' && cs().querySelector('img').getAttribute('src') === 'https://files.example.test/f/fin/seal.png', '도장 설정: 지우면 재정 설정의 직인으로 돌아감');
}

/* ── 4) 증명서 인쇄: 교회 직인 ── */
async function cert(settingsRows) {
  const w = win('<div id="bar" hidden><button id="btnPrint"></button><button id="btnClose"></button></div><div id="doc"></div>', 'http://localhost/edu-print.html?cert=7');
  w.SUPABASE_URL = 'https://abc.supabase.test'; w.SUPABASE_ANON_KEY = 'k';
  w.localStorage.setItem('sb-abc-auth-token', JSON.stringify({ access_token: 't', user: { id: 'u1', user_metadata: { name: '홍길동' } } }));
  w.WPC_CATECHISM = { courses: {}, church: { name: '운평장로교회', pastor: '홍길동' } };
  w.fetch = url => {
    w.__calls.push(['fetch', url]);
    const body = /edu_certificates/.test(url) ? [{ id: 7, kind: '세례', cert_no: '2026-세-001', member_name: '이몽룡', birth: '1980-03-03', qa_date: '2026-11-01', rite_date: '2026-11-08', officiant: '홍길동', issued_on: '2026-11-08' }]
      : /app_settings/.test(url) ? settingsRows : [];
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
  };
  w.eval(src('edu-print.js')); await wait(5); return w;
}
{
  let w = await cert([]), d = w.document;
  ok(/이몽룡/.test(d.getElementById('doc').textContent) && !d.querySelector('.c-sign img') && d.querySelector('.c-sign .last').textContent === '회', '증명서: 도장을 못 읽으면 직인 없이(글자는 그대로)');
  ok(w.__calls.some(x => /app_settings\?key=in\.\(edu_img_pastor_seal,edu_img_church_seal,rcp_img_seal\)/.test(x[1])) && !/images\//.test(d.getElementById('doc').innerHTML), '증명서: 저장소 그림 대신 설정에서 읽음');
  w = await cert([{ key: 'rcp_img_seal', value: 'https://files.example.test/f/fin/seal.png' }, { key: 'edu_img_pastor_seal', value: 'https://files.example.test/f/church/seal/p.png' }]); d = w.document;
  ok(d.querySelector('.c-sign .last img').getAttribute('src') === 'https://files.example.test/f/fin/seal.png' && d.querySelector('.c-sign .in img').getAttribute('src') === 'https://files.example.test/f/church/seal/p.png', '증명서: 재정 설정의 직인 · 당회장 인');
  w = await cert([{ key: 'rcp_img_seal', value: 'https://files.example.test/f/fin/seal.png' }, { key: 'edu_img_church_seal', value: 'https://files.example.test/f/church/seal/c.png' }]); d = w.document;
  ok(d.querySelector('.c-sign .last img').getAttribute('src') === 'https://files.example.test/f/church/seal/c.png' && !d.querySelector('.c-sign .in img'), '증명서: 따로 올린 교회 직인이 먼저');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
