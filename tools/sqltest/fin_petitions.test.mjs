// 재정 청원(20261124_0800_fin_petitions) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해
//   node fin_petitions.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const repo = process.argv[2];
const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
create table public.admins(uid uuid);
create table public.app_settings(key text primary key, value text);
insert into public.app_settings values ('fy_start_month','12');
create table public.budget(id bigint generated always as identity primary key, code text, name text, atype text, prev_budget bigint default 0, prev_actual bigint default 0, budget bigint default 0);
create table public.expenses(id bigint generated always as identity primary key, exp_date date, account text, category text, payee text, amount integer not null default 0, method text, memo text);
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
`);
await db.exec(fs.readFileSync(repo + '/supabase/finance-membership.sql', 'utf8').split('-- ★ 운영 참고')[0]);
await db.exec(`create table public.profiles(id uuid primary key, name text, email text); alter table public.member_links add column can_broadcast boolean not null default false, add column can_accompany boolean not null default false, add column can_pastor boolean not null default false, add column can_session boolean not null default false;`);
// mission_fy 만 가져오기
const mc = fs.readFileSync(repo + '/supabase/20261110_1900_mission_committee.sql', 'utf8');
const a = mc.indexOf('create or replace function public.mission_fy'), b = mc.indexOf('revoke all on function public.mission_fy');
await db.exec(mc.slice(a, b));
const mig = fs.readFileSync(repo + '/supabase/20261124_0800_fin_petitions.sql', 'utf8');
await db.exec(mig); await db.exec(mig);   // 두 번 돌려도 안전해야
console.log('migration x2 ok');
await db.exec(`
insert into public.budget(code,name,atype,budget) values ('2050000','기관보조','지출',0),('2050003','중고등부','지출',1200000),('2050004','유초등부(주일학교)','지출',5000000);
insert into public.expenses(exp_date,account,amount) values (current_date - 3,'중고등부',300000),('2020-01-01','중고등부',999);
insert into public.member_links(user_id,member_key,member_name,can_finance) values
 ('00000000-0000-0000-0000-000000000001','홍길동|19700101','홍길동',false),
 ('00000000-0000-0000-0000-000000000002','김재정|19600101','김재정',true),
 ('00000000-0000-0000-0000-000000000003','이일반|19800101','이일반',false);
insert into public.fin_dept_heads(dept,head_name,member_key,accounts) values ('중고등부','홍길동','홍길동|19700101','{중고등부}');
`);
const as = async (uid, sql, p) => { await db.exec(`select set_config('t.uid','${uid}',false)`); return q(sql, p); };
const U1='00000000-0000-0000-0000-000000000001', U2='00000000-0000-0000-0000-000000000002', U3='00000000-0000-0000-0000-000000000003';
console.log('my_depts(head):', (await as(U1, 'select dept, accounts from fin_my_depts()')).rows);
console.log('my_depts(other):', (await as(U3, 'select count(*)::int n from fin_my_depts()')).rows);
const id = (await as(U1, `select fin_petition_submit('중고등부','중고등부','수련회 간식',150000,'메모','["https://x/r1.jpg"]'::jsonb) id`)).rows[0].id;
console.log('submitted id', id);
const row = (await q('select dept,gwan,hang,requester_name,week_sunday,extract(dow from week_sunday)::int dow, week_sunday - current_date as d, status from fin_petitions where id=$1',[id])).rows[0];
console.log('row', row);
for (const [who, sql] of [[U1, `select fin_petition_submit('중고등부','유초등부(주일학교)','x',1)`], [U3, `select fin_petition_submit('중고등부','중고등부','x',1)`], [U1, `select fin_petition_submit('중고등부','중고등부','x',0)`], [U1, `select fin_petition_review(${id},'approved','')`], [U3, `select * from fin_dept_budget('중고등부')`]]) {
  try { await as(who, sql); console.log('SHOULD FAIL', sql); } catch (e) { console.log('blocked ok:', e.message); }
}
console.log('budget(head):', (await as(U1, `select gwan,hang,budget,spent,pending,fy from fin_dept_budget('중고등부')`)).rows);
await as(U2, `select fin_petition_review(${id},'approved','')`);
console.log('after review:', (await q('select status, reviewed_by is not null r from fin_petitions where id=$1',[id])).rows[0]);
try { await as(U1, `select fin_petition_cancel(${id})`); console.log('SHOULD FAIL cancel approved'); } catch (e) { console.log('blocked ok:', e.message); }
const id2 = (await as(U1, `select fin_petition_submit('중고등부','중고등부','책',20000) id`)).rows[0].id;
await as(U1, `select fin_petition_cancel(${id2})`);
console.log('cancelled:', (await q('select status from fin_petitions where id=$1',[id2])).rows[0]);

// 재정 청원 권한(부서 없음)
try { await as(U3, `select fin_petition_submit('','중고등부','x',1000)`); console.log('SHOULD FAIL no perm'); } catch (e) { console.log('blocked ok:', e.message); }
await db.exec(`insert into public.admins values ('${U2}')`);
console.log('set role:', (await as(U2, `select set_worship_role('${U3}','petition',true) r`)).rows[0].r);
console.log('access:', (await as(U3, `select broadcast_access() a`)).rows[0].a);
console.log('budget(all):', (await as(U3, `select hang,budget,spent,pending from fin_dept_budget('')`)).rows);
const id3 = (await as(U3, `select fin_petition_submit('','유초등부(주일학교)','성탄 선물',50000) id`)).rows[0].id;
console.log('perm petition:', (await q('select dept,gwan,hang,requester_name from fin_petitions where id=$1',[id3])).rows[0]);
try { await as(U3, `select fin_petition_submit('','없는계정','x',1000)`); console.log('SHOULD FAIL'); } catch (e) { console.log('blocked ok:', e.message); }
console.log('list_access has canPetition:', JSON.stringify((await as(U2, 'select list_access() a')).rows[0].a));
console.log('isDeptHead U1:', (await as(U1, 'select broadcast_access() a')).rows[0].a.isDeptHead, '| U3:', (await as(U3, 'select broadcast_access() a')).rows[0].a.isDeptHead);
await db.exec(`grant usage on schema public to authenticated; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
async function asRole(uid, sql) { await db.exec(`select set_config('t.uid','${uid}',false)`); await db.exec('set role authenticated'); try { return (await q(sql)).rows; } finally { await db.exec('reset role'); } }
console.log('RLS rows U1(head):', (await asRole(U1, 'select count(*)::int n from fin_petitions'))[0].n, '| U3(perm):', (await asRole(U3, 'select count(*)::int n from fin_petitions'))[0].n, '| U2(finance):', (await asRole(U2, 'select count(*)::int n from fin_petitions'))[0].n);
try { await asRole(U3, `insert into fin_petitions(dept,hang,item,amount,week_sunday) values ('','a','b',1,current_date)`); console.log('SHOULD FAIL direct insert'); } catch (e) { console.log('direct insert blocked ok'); }
try { const r = await asRole(U3, 'select count(*)::int n from fin_dept_heads'); console.log('dept_heads visible to U3:', r[0].n); } catch (e) { console.log('dept_heads blocked ok'); }
