// 교적 인증 신청 알림(20261124_2355_member_match_push) 시험 — 가짜 자료만(PGlite) + Apps Script(apps-script/member-match-push.gs)를 가짜 환경에서.
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해
//   node member_match_push.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import vm from 'vm';
const repo = process.argv[2];
const db = new PGlite();
const q = (s, p) => db.query(s, p);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
const U = n => '00000000-0000-0000-0000-00000000000' + n;
const ADMIN = U(9);
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon; grant usage on schema public to authenticated, anon;
create table public.admins(uid uuid);
create table public.profiles(id uuid primary key, name text, email text);
insert into auth.users select ('00000000-0000-0000-0000-00000000000' || g)::uuid from generate_series(1, 9) g;
insert into public.profiles select id, '가입자' || right(id::text, 1), 'u' || right(id::text, 1) || '@example.test' from auth.users;
insert into public.admins values ('${ADMIN}');
`);
await db.exec(fs.readFileSync(repo + '/supabase/finance-membership.sql', 'utf8').split('-- ★ 운영 참고')[0]);
await db.exec(`alter table public.member_links add column if not exists spouse_key text;`);
await db.exec(fs.readFileSync(repo + '/supabase/gyojeok.sql', 'utf8'));
await db.exec(fs.readFileSync(repo + '/supabase/app_settings.sql', 'utf8'));
await db.exec(`insert into public.gyojeok(name, birth, member_key) values ('홍길동', '1970-01-01', '홍길동|19700101'), ('성춘향', '1972-02-02', '성춘향|19720202'), ('이몽룡', '1980-03-03', '이몽룡|19800303');`);
await db.exec(fs.readFileSync(repo + '/supabase/20261124_2330_member_match_approval.sql', 'utf8'));
const as = async (uid, sql) => { await db.exec(`select set_config('t.uid','${uid}',false)`); return (await q(sql)).rows; };
const asRole = async (uid, sql, role = 'authenticated') => { await db.exec(`select set_config('t.uid','${uid}',false)`); await db.exec('set role ' + role); try { return (await q(sql)).rows; } finally { await db.exec('reset role'); } };
const feed = async after => (await asRole('', `select member_match_push_feed(${after}) r`, 'anon'))[0].r;

// 알림 SQL 전에 들어온 신청(열쇠 없음)이 있어도 마이그레이션이 지나간다
await as(U(8), `select match_member('성춘향','19720202')`);
const mig = fs.readFileSync(repo + '/supabase/20261124_2355_member_match_push.sql', 'utf8');
await db.exec(mig); await db.exec(mig);
ok(true, 'migration x2');
ok((await q(`select push_key from member_match_requests where user_id='${U(8)}'`)).rows[0].push_key === null, '예전 신청은 열쇠 없이 그대로');

// 1) 처음 피드: 열쇠 없음, 기다리는 신청 1건
let f = await feed(0);
ok(f.key === null && f.n === 1 && Number(f.max_id) === 1 && f.decided.length === 0, '처음 피드: 관리자 열쇠 없음 · 새 신청 1 · 결과 없음');
// 2) 관리자 열쇠: 관리자만, 부를 때마다 같은 값
ok((await asRole(U(1), `select member_match_admin_push_key() r`))[0].r.ok === false, '관리자가 아니면 열쇠를 주지 않음');
ok((await q(`select count(*)::int n from app_settings where key='member_match_push_key'`)).rows[0].n === 0, '관리자가 아닌 사람이 불러도 열쇠가 만들어지지 않음');
const ak = (await asRole(ADMIN, `select member_match_admin_push_key() r`))[0].r;
const ak2 = (await asRole(ADMIN, `select member_match_admin_push_key() r`))[0].r;
ok(ak.ok === true && /^[0-9a-f]{32}$/.test(ak.key) && ak2.key === ak.key, '관리자 열쇠: 32자 · 다시 불러도 같음');
try { await asRole('', `select member_match_admin_push_key()`, 'anon'); ok(false, 'anon 은 관리자 열쇠 함수 실행 불가'); } catch (e) { ok(/permission denied/.test(e.message), 'anon 은 관리자 열쇠 함수 실행 불가'); }
// 3) 신청하면 열쇠가 함께 생기고 본인만 받는다
const r1 = (await asRole(U(1), `select match_member('홍길동','19700101') r`))[0].r;
ok(r1.status === '승인대기' && /^[0-9a-f]{32}$/.test(r1.pushKey), '신청: 알림 열쇠를 돌려줌');
const m1 = (await asRole(U(1), `select my_match_request() r`))[0].r;
ok(m1.status === '대기' && m1.pushKey === r1.pushKey, '내 신청: 같은 열쇠');
ok((await asRole(U(2), `select my_match_request() r`))[0].r.pushKey === undefined, '다른 사람에게는 열쇠가 가지 않음');
// 4) 피드: 새 신청 수는 p_after 뒤의 것만, 관리자 열쇠 포함, 이름 · 생년월일 없음
f = await feed(0);
ok(f.key === ak.key && f.n === 2 && Number(f.max_id) === 2, '피드: 관리자 열쇠 · 새 신청 2');
ok((await feed(1)).n === 1 && (await feed(2)).n === 0, '피드: 기준 번호 뒤의 신청만 셈');
const txt = JSON.stringify(f);
ok(!/홍길동|성춘향|1970|1972|example\.test|가입자/.test(txt) && Object.keys(f).sort().join() === 'decided,key,max_id,n', '피드: 이름 · 생년월일 · 메일 없음');
// 5) 다시 신청하면 앞의 것은 세지 않는다(기다리는 것만)
await as(U(1), `select match_member('홍길동','19700101')`);
f = await feed(0);
ok(f.n === 2 && Number(f.max_id) === 3, '다시 신청: 기다리는 신청 수는 그대로 2');
const k1 = (await asRole(U(1), `select my_match_request() r`))[0].r.pushKey;
ok(k1 !== r1.pushKey, '다시 신청하면 열쇠도 새로');
// 6) 승인 → decided 에 ok=true, 새 신청 수에서 빠짐
const id1 = (await q(`select id from member_match_requests where user_id='${U(1)}' and status='대기'`)).rows[0].id;
await asRole(ADMIN, `select decide_match_request(${id1}, true)`);
f = await feed(0);
ok(f.n === 1 && f.decided.length === 1 && Number(f.decided[0].id) === Number(id1) && f.decided[0].key === k1 && f.decided[0].ok === true, '승인: 결과 목록에 열쇠 · 승인');
// 7) 돌려보냄 → ok=false
await as(U(3), `select match_member('홍길동','19700101')`);
const id3 = (await q(`select id from member_match_requests where user_id='${U(3)}' and status='대기'`)).rows[0].id;
await asRole(ADMIN, `select decide_match_request(${id3}, false)`);
f = await feed(0);
ok(f.decided.length === 2 && f.decided.find(d => Number(d.id) === Number(id3)).ok === false, '돌려보냄: 결과 목록에 승인 아님');
ok((await asRole(U(3), `select my_match_request() r`))[0].r.pushKey === null, '돌려보낸 신청은 열쇠를 다시 내주지 않음');
// 8) 관리자가 표에서 직접 연결 → 승인으로 본다. 열쇠 없는 예전 신청은 결과 알림 대상이 아니다
await as(U(4), `select match_member('이몽룡','19800303')`);
const id4 = (await q(`select id from member_match_requests where user_id='${U(4)}' and status='대기'`)).rows[0].id;
await db.exec(`insert into public.member_links(user_id, member_status, member_key, member_name, updated_at) values ('${U(4)}', '정회원', '이몽룡|19800303', '이몽룡', now()), ('${U(8)}', '정회원', '성춘향|19720202', '성춘향', now())`);
f = await feed(0);
ok(f.decided.some(d => Number(d.id) === Number(id4) && d.ok === true) && f.decided.length === 3 && f.n === 0, '직접 연결: 승인으로 알림 · 열쇠 없는 예전 신청은 빠짐 · 기다리는 신청 0');
// 9) 하루가 지나면 피드에서 빠진다
await db.exec(`update member_match_requests set decided_at = now() - interval '2 days', created_at = now() - interval '2 days'; update member_links set updated_at = now() - interval '2 days'`);
f = await feed(0);
ok(f.decided.length === 0 && f.n === 0, '하루 지난 결과 · 신청은 피드에서 빠짐');

/* ── Apps Script 를 가짜 환경에서 ── */
function gas(feeds) {
  const props = {}, sent = [], logs = [];
  let i = 0;
  const ctx = {
    Logger: { log: m => logs.push(String(m)) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger: () => { }, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => { } }) }) }) },
    UrlFetchApp: {
      fetch: (url, opt) => {
        if (/member_match_push_feed/.test(url)) { const body = feeds[Math.min(i++, feeds.length - 1)]; return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) }; }
        sent.push(JSON.parse(opt.payload)); return { getResponseCode: () => 200, getContentText: () => '{}' };
      }
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(repo + '/apps-script/member-match-push.gs', 'utf8'), ctx);
  props.ONESIGNAL_REST_KEY = 'test-rest-key-0123456789';
  return { ctx, props, sent, logs, run: fn => vm.runInContext(fn + '()', ctx) };
}
{ // 첫 실행은 기준만 저장하고 보내지 않는다
  const g = gas([{ max_id: 7, key: 'K', n: 3, decided: [{ id: 5, key: 'a', ok: true }] }]);
  g.run('pollMemberMatch');
  ok(g.sent.length === 0 && g.props.memberMatchAfter === '7' && g.props.memberMatchDecided === '[5]', 'GAS: 첫 실행은 기준만 저장');
}
{ // 새 신청 → 관리자 태그 mm, 결과 → 신청자 태그 mq (한 번만)
  const DEC = [{ id: 5, key: 'a', ok: true }, { id: 8, key: 'b', ok: false }, { id: 6, key: 'c', ok: true }];
  // 두 번째 확인: 기준 번호(9) 뒤의 신청은 없고(n=0), 결과 목록은 하루 동안 그대로 남아 있다
  const g = gas([{ max_id: 9, key: 'ADMINKEY', n: 2, decided: DEC }, { max_id: 9, key: 'ADMINKEY', n: 0, decided: DEC }]);
  g.props.memberMatchAfter = '7'; g.props.memberMatchDecided = '[5]';
  g.run('pollMemberMatch');
  const adminPush = g.sent.find(p => p.filters[0].key === 'mm');
  ok(adminPush && adminPush.filters[0].value === 'ADMINKEY' && /2건/.test(adminPush.contents.ko) && /gyojeok\.html$/.test(adminPush.url), 'GAS: 새 신청 2건 → 관리자 기기');
  const mq = g.sent.filter(p => p.filters[0].key === 'mq');
  ok(mq.length === 2 && mq.find(p => p.filters[0].value === 'b' && /승인되지 않았습니다/.test(p.contents.ko) && /admin\.html$/.test(p.url)) && mq.find(p => p.filters[0].value === 'c' && /정회원으로 승인/.test(p.contents.ko) && /dashboard\.html$/.test(p.url)), 'GAS: 결과 2건 → 신청자 기기(이미 보낸 5번은 건너뜀)');
  ok(g.props.memberMatchAfter === '9' && g.props.memberMatchDecided === '[5,8,6]', 'GAS: 기준 번호 · 보낸 번호 저장');
  ok(!/홍길동|19700101/.test(JSON.stringify(g.sent)), 'GAS: 알림에 이름 · 생년월일 없음');
  g.run('pollMemberMatch');
  ok(g.sent.length === 3, 'GAS: 같은 피드를 다시 읽어도 또 보내지 않음');
}
{ // 관리자 열쇠가 아직 없으면 기준 번호를 넘기지 않는다 → 열쇠가 생기면 그때 보낸다
  const g = gas([{ max_id: 9, key: null, n: 1, decided: [] }, { max_id: 9, key: 'ADMINKEY', n: 1, decided: [] }]);
  g.props.memberMatchAfter = '8'; g.props.memberMatchDecided = '[]';
  g.run('pollMemberMatch');
  ok(g.sent.length === 0 && g.props.memberMatchAfter === '8', 'GAS: 관리자 열쇠가 없으면 보내지 않고 기준도 그대로');
  g.run('pollMemberMatch');
  ok(g.sent.length === 1 && g.props.memberMatchAfter === '9', 'GAS: 열쇠가 생기면 그때 보냄');
}
{ // 새 신청이 없으면 아무것도 보내지 않는다
  const g = gas([{ max_id: 9, key: 'ADMINKEY', n: 0, decided: [] }]);
  g.props.memberMatchAfter = '9'; g.props.memberMatchDecided = '[]';
  g.run('pollMemberMatch');
  ok(g.sent.length === 0, 'GAS: 새 신청이 없으면 조용함');
}
{ // 트리거 등록: 이미 있던 것은 보낸 것으로
  const g = gas([{ max_id: 4, key: 'ADMINKEY', n: 4, decided: [{ id: 2, key: 'a', ok: true }] }]);
  g.run('createMemberMatchPushTrigger');
  ok(g.sent.length === 0 && g.props.memberMatchAfter === '4' && g.props.memberMatchDecided === '[2]', 'GAS: 등록할 때 있던 신청 · 결과는 보낸 것으로');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
