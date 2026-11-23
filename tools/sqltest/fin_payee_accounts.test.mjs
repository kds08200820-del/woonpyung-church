// 재정 청원 받는 계좌(20261124_0900_fin_payee_accounts) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해
//   node fin_payee_accounts.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const repo = process.argv[2];
const db = new PGlite();
const q = (s, p) => db.query(s, p);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; grant usage on schema public to authenticated;
create table public.admins(uid uuid);
create table public.app_settings(key text primary key, value text);
create table public.profiles(id uuid primary key, name text, email text);
create table public.budget(id bigint generated always as identity primary key, code text, name text, atype text, prev_budget bigint default 0, prev_actual bigint default 0, budget bigint default 0);
create table public.expenses(id bigint generated always as identity primary key, exp_date date, account text, category text, payee text, amount integer not null default 0, method text, memo text);
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
`);
await db.exec(fs.readFileSync(repo + '/supabase/finance-membership.sql', 'utf8').split('-- ★ 운영 참고')[0]);
await db.exec(`alter table public.member_links add column can_broadcast boolean not null default false, add column can_accompany boolean not null default false, add column can_pastor boolean not null default false, add column can_session boolean not null default false;`);
const mc = fs.readFileSync(repo + '/supabase/20261110_1900_mission_committee.sql', 'utf8');
await db.exec(mc.slice(mc.indexOf('create or replace function public.mission_fy'), mc.indexOf('revoke all on function public.mission_fy')));
await db.exec(fs.readFileSync(repo + '/supabase/20261124_0800_fin_petitions.sql', 'utf8'));
const mig = fs.readFileSync(repo + '/supabase/20261124_0900_fin_payee_accounts.sql', 'utf8');
await db.exec(mig); await db.exec(mig);
ok(true, 'migration x2');
const U1 = '00000000-0000-0000-0000-000000000001', U2 = '00000000-0000-0000-0000-000000000002', U3 = '00000000-0000-0000-0000-000000000003';
await db.exec(`
insert into public.budget(code,name,atype,budget) values ('2050000','기관보조','지출',0),('2050003','중고등부','지출',1200000);
insert into public.member_links(user_id,member_key,member_name,can_finance) values ('${U1}','홍길동|19700101','홍길동',false),('${U2}','김재정|19600101','김재정',true),('${U3}','이일반|19800101','이일반',false);
insert into public.fin_dept_heads(dept,head_name,member_key,accounts) values ('중고등부','홍길동','홍길동|19700101','{중고등부}');
`);
const as = async (uid, sql) => { await db.exec(`select set_config('t.uid','${uid}',false)`); return (await q(sql)).rows; };
const asRole = async (uid, sql) => { await db.exec(`select set_config('t.uid','${uid}',false)`); await db.exec('set role authenticated'); try { return (await q(sql)).rows; } finally { await db.exec('reset role'); } };
// 1) 계좌 등록 + 같은 계좌는 한 줄
const a1 = (await as(U1, `select fin_account_add('테스트은행','000-111-2222','홍길동') id`))[0].id;
const a1b = (await as(U1, `select fin_account_add('테스트은행','000-111-2222','홍길동') id`))[0].id;
ok(a1 === a1b, '같은 계좌는 한 번만 등록');
// 2) 등록 계좌로 청원 → 계좌가 청원에 적힌다
const p1 = (await as(U1, `select fin_petition_submit2('중고등부','중고등부','간식',50000,'','[]'::jsonb,${a1},null,null,null,false) id`))[0].id;
const r1 = (await q('select pay_holder,pay_bank,pay_account,pay_account_id from fin_petitions where id=$1', [p1])).rows[0];
ok(r1.pay_bank === '테스트은행' && r1.pay_account === '000-111-2222' && Number(r1.pay_account_id) === Number(a1), '등록 계좌가 청원에 적힘');
// 3) 다른 사람이 받는 계좌(그때만) — 등록 안 함
const p2 = (await as(U1, `select fin_petition_submit2('중고등부','중고등부','강사비',100000,'','[]'::jsonb,null,'가짜은행','999 888 7777x','강사님',false) id`))[0].id;
const r2 = (await q('select pay_holder,pay_bank,pay_account,pay_account_id from fin_petitions where id=$1', [p2])).rows[0];
ok(r2.pay_holder === '강사님' && r2.pay_account === '9998887777' && r2.pay_account_id === null, '그때만 쓰는 계좌(숫자만 남김), 등록 안 됨');
ok((await as(U1, `select count(*)::int n from fin_payee_accounts where owner_uid='${U1}'`))[0].n === 1, '등록 계좌는 여전히 1개');
// 4) 그때 계좌를 등록까지
await as(U1, `select fin_petition_submit2('중고등부','중고등부','책',20000,'','[]'::jsonb,null,'가짜은행','123-456','강사님',true)`);
ok((await as(U1, `select count(*)::int n from fin_payee_accounts where owner_uid='${U1}'`))[0].n === 2, '등록하기를 고르면 새 계좌가 남음');
// 5) 남의 계좌는 못 고르고, 못 본다
await as(U3, `select 1`);
try { await as(U3, `select fin_petition_submit2('','중고등부','x',1,'','[]'::jsonb,${a1},null,null,null,false)`); ok(false, '남의 계좌 고르기 막힘'); } catch (e) { ok(true, '남의 계좌 고르기 막힘: ' + e.message); }
ok((await asRole(U3, 'select count(*)::int n from fin_payee_accounts'))[0].n === 0, '권한 없는 사람은 남의 계좌를 못 봄');
ok((await asRole(U1, 'select count(*)::int n from fin_payee_accounts'))[0].n === 2, '본인은 자기 계좌를 봄');
ok((await asRole(U2, 'select count(*)::int n from fin_payee_accounts'))[0].n === 2, '재정 권한자는 봄');
// 6) 지우기 · 고치기 · 직접 넣기 — 아무도 못 한다(재정 권한자도)
for (const [who, sql, m] of [[U1, 'delete from fin_payee_accounts', '본인 지우기'], [U2, 'delete from fin_payee_accounts', '재정 권한자 지우기'], [U1, `update fin_payee_accounts set account_no='0'`, '고치기'], [U1, `insert into fin_payee_accounts(holder,bank,account_no) values ('a','b','1234')`, '직접 넣기']]) {
  try { await asRole(who, sql); ok(false, m + ' 막힘'); } catch (e) { ok(true, m + ' 막힘'); }
}
// 7) 권한 없는 사람은 등록도 못 한다
try { await as(U3, `select fin_account_add('가짜은행','1234-5678','이일반')`); ok(false, '권한 없는 등록 막힘'); } catch (e) { ok(true, '권한 없는 등록 막힘'); }
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
