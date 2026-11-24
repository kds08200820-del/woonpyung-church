// 교적 인증 「신청 → 관리자 승인」(20261124_2330_member_match_approval) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해
//   node member_match_approval.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
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
// 예전 match_member(그 자리에서 정회원) 위에 덮어쓰는 것까지 본다
const old = fs.readFileSync(repo + '/supabase/finance_migration.sql', 'utf8');
await db.exec(old.slice(old.indexOf('create or replace function public.match_member'), old.indexOf('-- 내 상태(정/준회원')));
await db.exec(`
insert into public.gyojeok(name, birth, member_key, spouse, spouse_key) values
  ('홍길동', '1970-01-01', '홍길동|19700101', '성춘향', '성춘향|19720202'),
  ('성춘향', '1972-02-02', '성춘향|19720202', '홍길동', '홍길동|19700101'),
  ('이몽룡', '1980-03-03', '이몽룡|19800303', '', '');
insert into public.member_links(user_id, member_status, member_key, member_name) values ('${U(4)}', '정회원', '이몽룡|19800303', '이몽룡');
`);
const as = async (uid, sql) => { await db.exec(`select set_config('t.uid','${uid}',false)`); return (await q(sql)).rows; };
const asRole = async (uid, sql, role = 'authenticated') => { await db.exec(`select set_config('t.uid','${uid}',false)`); await db.exec('set role ' + role); try { return (await q(sql)).rows; } finally { await db.exec('reset role'); } };

// 0) 예전 함수는 그 자리에서 정회원을 만들었다(고치려는 것)
ok((await as(U(8), `select match_member('홍길동','19700101') r`))[0].r.status === '정회원', '(예전) 이름+생년월일만으로 정회원이 됨');
await db.exec(`delete from public.member_links where user_id = '${U(8)}'`);

const mig = fs.readFileSync(repo + '/supabase/20261124_2330_member_match_approval.sql', 'utf8');
await db.exec(mig); await db.exec(mig);
ok(true, 'migration x2');
ok((await q(`select member_status s, member_key k from member_links where user_id='${U(4)}'`)).rows[0].s === '정회원', '이미 정회원인 계정은 그대로');

// 1) 로그인 없이 · 틀린 입력
ok((await as('', `select match_member('홍길동','19700101') r`))[0].r.ok === false, '로그인 없이는 거절');
try { await asRole('', `select match_member('홍길동','19700101')`, 'anon'); ok(false, 'anon 은 실행 권한 없음'); } catch (e) { ok(/permission denied/.test(e.message), 'anon 은 실행 권한 없음'); }
ok((await as(U(1), `select match_member('','19700101') r`))[0].r.ok === false, '빈 이름 거절');
ok((await as(U(1), `select match_member('홍길동','1970-01-01') r`))[0].r.ok === false, '생년월일 형식 거절');
ok((await as(U(1), `select match_member('홍|길동','19700101') r`))[0].r.ok === false, '이름에 | 거절');
ok((await q(`select count(*)::int n from member_match_requests`)).rows[0].n === 0, '거절된 입력은 신청으로 남지 않음');

// 2) 교적과 맞아도 정회원이 되지 않는다
const r1 = (await asRole(U(1), `select match_member(' 홍길동 ','19700101') r`))[0].r;
ok(r1.ok === true && r1.status === '승인대기', '맞는 이름+생년월일 → 승인대기');
ok((await q(`select count(*)::int n from member_links where user_id='${U(1)}'`)).rows[0].n === 0, '신청만으로는 member_links 에 줄이 생기지 않음');
// 3) 교적에 없어도 같은 답(맞는지 알려 주지 않는다)
const r2 = (await asRole(U(2), `select match_member('없는사람','19990909') r`))[0].r;
ok(r2.status === r1.status && r2.message === r1.message && Object.keys(r2).length === Object.keys(r1).length, '교적에 없어도 같은 답');
// 4) 내 신청 상태
const m1 = (await asRole(U(1), `select my_match_request() r`))[0].r;
ok(m1.status === '대기' && m1.name === '홍길동', '내 신청: 대기 · 이름');
ok((await asRole(U(3), `select my_match_request() r`))[0].r.status === '', '신청한 적 없으면 빈 상태');
// 5) 표는 직접 못 읽는다
try { await asRole(U(1), `select * from member_match_requests`); ok(false, '표 직접 읽기 막힘'); } catch (e) { ok(/permission denied/.test(e.message), '표 직접 읽기 막힘'); }
try { await asRole(U(1), `insert into member_match_requests(user_id,member_key,member_name,status) values ('${U(1)}','홍길동|19700101','홍길동','승인')`); ok(false, '표 직접 쓰기 막힘'); } catch (e) { ok(/permission denied/.test(e.message), '표 직접 쓰기 막힘'); }
// 6) 다시 신청하면 앞의 것은 닫힌다
await as(U(1), `select match_member('홍길동','19700101')`);
const c1 = (await q(`select status, count(*)::int n from member_match_requests where user_id='${U(1)}' group by 1 order by 1`)).rows;
ok(c1.length === 2 && c1.find(x => x.status === '대기').n === 1 && c1.find(x => x.status === '바뀜').n === 1, '기다리는 신청은 하나만');
// 7) 하루 다섯 번
for (let i = 0; i < 5; i++) await as(U(5), `select match_member('아무개','1990010${i + 1}')`);
const r6 = (await as(U(5), `select match_member('아무개','19900109') r`))[0].r;
ok(r6.ok === false && /다섯 번/.test(r6.error), '여섯 번째는 거절');
ok((await q(`select count(*)::int n from member_match_requests where user_id='${U(5)}'`)).rows[0].n === 5, '거절된 시도는 남지 않음');
await db.exec(`update member_match_requests set created_at = now() - interval '25 hours' where user_id='${U(5)}'`);
ok((await as(U(5), `select match_member('아무개','19900109') r`))[0].r.ok === true, '하루가 지나면 다시 신청');

// 8) 관리자가 아니면 목록 · 승인 불가
ok((await asRole(U(1), `select list_match_requests() r`))[0].r.length === 0, '관리자가 아니면 빈 목록');
const id1 = (await q(`select id from member_match_requests where user_id='${U(1)}' and status='대기'`)).rows[0].id;
const id2 = (await q(`select id from member_match_requests where user_id='${U(2)}' and status='대기'`)).rows[0].id;
ok((await asRole(U(1), `select decide_match_request(${id1}, true) r`))[0].r.ok === false, '본인이 자기 신청을 승인할 수 없음');
ok((await q(`select count(*)::int n from member_links where user_id='${U(1)}'`)).rows[0].n === 0, '그래도 연결되지 않음');
// 9) 관리자 목록
const L = (await asRole(ADMIN, `select list_match_requests() r`))[0].r;
const l1 = L.find(x => x.uid === U(1)), l2 = L.find(x => x.uid === U(2));
ok(L.length === 3 && l1 && l1.matched === true && Number(l1.linked) === 0 && l1.birth === '19700101' && l1.signupName === '가입자1', '목록: 교적에 있음 · 연결된 계정 0');
ok(l2 && l2.matched === false, '목록: 교적에 없음');
// 10) 교적에 없는 신청은 승인되지 않는다
const d2 = (await asRole(ADMIN, `select decide_match_request(${id2}, true) r`))[0].r;
ok(d2.ok === false && (await q(`select status from member_match_requests where id=${id2}`)).rows[0].status === '대기', '교적에 없는 신청은 승인 불가(그대로 대기)');
// 11) 승인 → 정회원 + 배우자 키
ok((await asRole(ADMIN, `select decide_match_request(${id1}, true) r`))[0].r.ok === true, '관리자 승인');
const k1 = (await q(`select member_status s, member_key k, member_name n, spouse_key sp from member_links where user_id='${U(1)}'`)).rows[0];
ok(k1.s === '정회원' && k1.k === '홍길동|19700101' && k1.n === '홍길동' && k1.sp === '성춘향|19720202', '정회원 · 매칭키 · 배우자 키');
ok((await asRole(ADMIN, `select decide_match_request(${id1}, true) r`))[0].r.ok === false, '같은 신청을 두 번 처리할 수 없음');
ok((await asRole(U(1), `select my_match_request() r`))[0].r.status === '', '승인된 뒤에는 대기 표시 없음');
// 12) 정회원이 다시 넣어도 바뀌지 않는다
const before = (await q(`select count(*)::int n from member_match_requests`)).rows[0].n;
const r1b = (await asRole(U(1), `select match_member('성춘향','19720202') r`))[0].r;
ok(r1b.status === '정회원' && r1b.name === '홍길동' && (await q(`select count(*)::int n from member_match_requests`)).rows[0].n === before
  && (await q(`select member_key k from member_links where user_id='${U(1)}'`)).rows[0].k === '홍길동|19700101', '정회원은 다시 넣어도 그대로');
// 13) 같은 교적에 다른 계정이 신청 → 이미 연결된 계정 수가 보인다
await as(U(3), `select match_member('홍길동','19700101')`);
const l3 = (await asRole(ADMIN, `select list_match_requests() r`))[0].r.find(x => x.uid === U(3));
ok(l3 && Number(l3.linked) === 1, '이미 연결된 계정 1');
// 14) 돌려보냄
ok((await asRole(ADMIN, `select decide_match_request(${l3.id}, false) r`))[0].r.ok === true, '돌려보냄');
ok((await asRole(U(3), `select my_match_request() r`))[0].r.status === '돌려보냄' && (await q(`select count(*)::int n from member_links where user_id='${U(3)}'`)).rows[0].n === 0, '돌려보낸 신청: 본인에게 보이고 연결되지 않음');
// 15) 관리자가 표에서 직접 연결한 계정의 신청은 목록에서 빠진다
await db.exec(`insert into public.member_links(user_id, member_status, member_key, member_name) values ('${U(2)}', '정회원', '성춘향|19720202', '성춘향')`);
ok(!(await asRole(ADMIN, `select list_match_requests() r`))[0].r.some(x => x.uid === U(2)), '직접 연결한 계정의 신청은 목록에서 빠짐');
ok((await q(`select member_status s from member_links where user_id='${U(4)}'`)).rows[0].s === '정회원', '끝까지 기존 정회원은 그대로');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
