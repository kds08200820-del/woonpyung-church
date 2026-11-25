// 지출결의서 저장 충돌 막기 · 이력 · 지급 완료 기록(20261125_1100_fin_save_guard) 시험 — 가짜 자료만(PGlite).
//   node tools/sqltest/fin_save_guard.test.mjs <저장소 경로>      (@electric-sql/pglite@0.2 필요)
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const repo = process.argv[2] || '.';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
const U1 = '00000000-0000-0000-0000-000000000001', FIN = '00000000-0000-0000-0000-000000000002', FIN2 = '00000000-0000-0000-0000-000000000003';
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; grant usage on schema public to authenticated;
create table public.admins(uid uuid);
create table public.profiles(id uuid primary key, name text, email text);
create table public.budget(id bigint generated always as identity primary key, code text, name text, atype text, prev_budget bigint default 0, prev_actual bigint default 0, budget bigint default 0);
create table public.expenses(id bigint generated always as identity primary key, exp_date date, account text, category text, payee text, amount integer not null default 0, method text, memo text);
insert into auth.users values ('${U1}'),('${FIN}'),('${FIN2}');
create table public.schema_log(file text primary key, applied_at timestamptz default now(), note text);
`);
await db.exec(fs.readFileSync(repo + '/supabase/finance-membership.sql', 'utf8').split('-- ★ 운영 참고')[0]);
await db.exec(`alter table public.member_links add column can_broadcast boolean not null default false, add column can_accompany boolean not null default false, add column can_pastor boolean not null default false, add column can_session boolean not null default false, add column if not exists spouse_key text;`);
const fm = fs.readFileSync(repo + '/supabase/finance_migration.sql', 'utf8');
await db.exec(fm.slice(0, fm.indexOf('-- ── 마스터/거래 테이블')));
await db.exec(fs.readFileSync(repo + '/supabase/app_settings.sql', 'utf8'));
await db.exec(`grant select, insert, update, delete on public.app_settings to authenticated;`);
const mc = fs.readFileSync(repo + '/supabase/20261110_1900_mission_committee.sql', 'utf8');
await db.exec(mc.slice(mc.indexOf('create or replace function public.mission_fy'), mc.indexOf('revoke all on function public.mission_fy')));
for (const f of ['20261124_0800_fin_petitions.sql', '20261124_1000_fin_petition_paid.sql', '20261125_0900_fin_petition_unpay.sql']) await db.exec(fs.readFileSync(repo + '/supabase/' + f, 'utf8'));
const mig = fs.readFileSync(repo + '/supabase/20261125_1100_fin_save_guard.sql', 'utf8');
await db.exec(mig); await db.exec(mig);
ok(true, 'migration x2');
await db.exec(`insert into public.member_links(user_id,member_key,member_name,can_finance) values ('${U1}','홍길동|19700101','홍길동',false),('${FIN}','김재정|19600101','김재정',true),('${FIN2}','이재정|19610101','이재정',true);`);
const as = async (uid, sql, p) => { await db.exec(`select set_config('t.uid','${uid}',false)`); await db.exec('set role authenticated'); try { return (await q(sql, p)).rows; } finally { await db.exec('reset role'); } };
const save = async (uid, key, val, base) => (await as(uid, 'select public.setting_save_if($1, $2, $3::timestamptz) r', [key, val, base]))[0].r;

// 1) 처음 저장(줄 없음, base null) → 됨
let a = await save(FIN, 'petition_2026-11-29', '{"rows":[1]}', null);
ok(a.ok === true && a.updated_at, '처음 저장');
// 2) 내가 읽은 시각으로 다시 저장 → 됨, 이력 1줄
const b = await save(FIN, 'petition_2026-11-29', '{"rows":[1,2]}', a.updated_at);
ok(b.ok === true && new Date(b.updated_at) >= new Date(a.updated_at), '내가 읽은 뒤 바뀌지 않았으면 저장');
ok((await q(`select count(*)::int n from app_settings_history where key='petition_2026-11-29'`)).rows[0].n === 1, '예전 값이 이력에 남음');
// 3) 다른 재정 담당이 옛 시각(a)으로 저장 → 충돌, 값은 그대로
const c = await save(FIN2, 'petition_2026-11-29', '{"rows":[9]}', a.updated_at);
ok(c.ok === false && c.conflict === true, '남이 먼저 고쳤으면 충돌로 거절');
ok((await q(`select value from app_settings where key='petition_2026-11-29'`)).rows[0].value === '{"rows":[1,2]}', '먼저 넣은 줄이 지워지지 않음');
// 4) 줄이 없을 때 읽었는데 그사이 생겼다(base null) → 충돌
ok((await save(FIN2, 'petition_2026-11-29', '{"rows":[7]}', null)).conflict === true, '읽을 때 없던 것이 생겼으면 충돌');
// 5) 최신 시각으로 다시 → 됨
const d = await save(FIN2, 'petition_2026-11-29', '{"rows":[1,2,3]}', b.updated_at);
ok(d.ok === true, '다시 불러와 저장하면 됨');
// 6) 같은 사람이 5분 안에 이어 고치면 이력은 한 번만
await save(FIN2, 'petition_2026-11-29', '{"rows":[1,2,3,4]}', d.updated_at);
ok((await q(`select count(*)::int n from app_settings_history where key='petition_2026-11-29'`)).rows[0].n === 2, '같은 사람이 이어 고친 것은 이력 한 번(사람이 바뀌면 새로)');
// 7) 같은 값이면 시각을 바꾸지 않음
const cur = (await q(`select updated_at from app_settings where key='petition_2026-11-29'`)).rows[0].updated_at.toISOString();
const e = await save(FIN2, 'petition_2026-11-29', '{"rows":[1,2,3,4]}', cur);
ok(e.ok === true && e.same === true, '같은 값은 그대로');
// 8) 권한
try { await save(U1, 'petition_x', 'v', null); ok(false, '재정 권한 없으면 거절'); } catch (er) { ok(/재정 권한/.test(er.message), '재정 권한 없으면 거절'); }
ok((await as(U1, 'select count(*)::int n from app_settings_history'))[0].n === 0, '이력은 재정 권한자만 봄');
ok((await as(FIN, 'select count(*)::int n from app_settings_history'))[0].n === 2, '재정 권한자는 이력을 봄');
// 9) 지급 완료 · 취소에 누가 적었는지
await db.exec(`insert into public.fin_petitions(dept, gwan, hang, item, amount, week_sunday, requester_uid, requester_name, status) values ('중고등부','기관보조','중고등부','간식',50000,'2026-11-22','${U1}','홍길동','approved');`);
const pid = (await q('select id from fin_petitions limit 1')).rows[0].id;
ok((await as(FIN, `select public.fin_petition_mark_paid(array[${pid}]::bigint[]) n`))[0].n === 1, '지급 완료로 적기');
let row = (await q('select paid_at, paid_by from fin_petitions where id=$1', [pid])).rows[0];
ok(row.paid_at && row.paid_by === FIN, '누가 적었는지 남음');
ok((await as(FIN2, `select public.fin_petition_unpay(array[${pid}]::bigint[]) n`))[0].n === 1, '지급 완료 취소');
row = (await q('select paid_at, paid_by from fin_petitions where id=$1', [pid])).rows[0];
ok(row.paid_at === null && row.paid_by === null, '취소하면 함께 지움');
try { await as(U1, `select public.fin_petition_mark_paid(array[${pid}]::bigint[])`); ok(false, '재정 권한 없으면 지급 완료 못 적음'); } catch (er) { ok(/재정 권한/.test(er.message), '재정 권한 없으면 지급 완료 못 적음'); }
ok((await q(`select count(*)::int n from schema_log where file='20261125_1100_fin_save_guard.sql'`)).rows[0].n === 1, '실행 기록 남김');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
