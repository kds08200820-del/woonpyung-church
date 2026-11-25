// 재정 지키기(20261125_1200_fin_db_guards) 시험 — 영수증 번호 · 마감 · 전체 삭제. 가짜 자료만(PGlite).
//   node tools/sqltest/fin_db_guards.test.mjs <저장소 경로>      (@electric-sql/pglite@0.2 필요)
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const repo = process.argv[2] || '.';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
const FIN = '00000000-0000-0000-0000-000000000002', MEM = '00000000-0000-0000-0000-000000000001';
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated; grant usage on schema public to authenticated;
create table public.admins(uid uuid);
insert into auth.users values ('${FIN}'),('${MEM}');
create table public.schema_log(file text primary key, applied_at timestamptz default now(), note text);
`);
await db.exec(fs.readFileSync(repo + '/supabase/finance-membership.sql', 'utf8').split('-- ★ 운영 참고')[0]);
await db.exec(`alter table public.member_links add column if not exists spouse_key text;`);
await db.exec(fs.readFileSync(repo + '/supabase/offerings.sql', 'utf8'));
const fm = fs.readFileSync(repo + '/supabase/finance_migration.sql', 'utf8');
await db.exec(fm.slice(0, fm.indexOf('-- ============================================================\n--  RPC')));
await db.exec(fs.readFileSync(repo + '/supabase/app_settings.sql', 'utf8'));
await db.exec(fs.readFileSync(repo + '/supabase/donation_receipts.sql', 'utf8'));
await db.exec(`grant select, insert, update, delete on public.offerings, public.expenses, public.donation_receipts, public.app_settings to authenticated;
insert into public.member_links(user_id, member_status, can_finance) values ('${FIN}', '정회원', true), ('${MEM}', '정회원', false);
insert into public.donation_receipts(receipt_no, fy, donor_name) values ('2026-0001', 2026, '가짜1'), ('2026-0002', 2026, '가짜2'), ('2025-0007', 2025, '가짜3');`);
// 마이그레이션 전 트리거 없이 넣은 위 줄은 클라이언트 번호 그대로
const mig = fs.readFileSync(repo + '/supabase/20261125_1200_fin_db_guards.sql', 'utf8');
await db.exec(mig); await db.exec(mig);
ok(true, 'migration x2');
ok((await q(`select count(*)::int n from pg_indexes where indexname='donation_receipts_fy_no_uniq'`)).rows[0].n === 1, '겹친 번호가 없으면 겹침 막기를 건다');
const as = async (uid, sql, p) => { await db.exec(`select set_config('t.uid','${uid}',false)`); await db.exec('set role authenticated'); try { return (await q(sql, p)).rows; } finally { await db.exec('reset role'); } };
const tryAs = async (uid, sql) => { try { await as(uid, sql); return ''; } catch (e) { return e.message; } };

// 1) 영수증 번호: 화면이 보낸 번호와 상관없이 DB 가 다음 번호
let r = await as(FIN, `insert into donation_receipts(receipt_no, fy, donor_name) values ('2026-0001', 2026, '가짜4') returning receipt_no`);
ok(r[0].receipt_no === '2026-0003', '2026년 다음 번호 0003(화면이 0001 을 보내도)');
r = await as(FIN, `insert into donation_receipts(receipt_no, fy, donor_name) values ('x', 2025, '가짜5') returning receipt_no`);
ok(r[0].receipt_no === '2025-0008', '연도마다 따로 매김');
r = await as(FIN, `insert into donation_receipts(receipt_no, fy, donor_name) values ('x', 2027, '가짜6') returning receipt_no`);
ok(r[0].receipt_no === '2027-0001', '새 연도는 0001부터');
ok(/duplicate key|unique/.test(await tryAs(FIN, `update donation_receipts set receipt_no = '2026-0001' where donor_name = '가짜2'`)), '번호를 겹치게 고치면 거절');
// 2) 마감
await db.exec(`insert into public.offerings(offer_date, giver, amount) values ('2026-03-01', '가짜', 1000), ('2026-06-01', '가짜', 2000);
insert into public.expenses(exp_date, account, amount) values ('2026-03-02', '가짜', 500);`);
ok(await tryAs(FIN, `insert into offerings(offer_date, giver, amount) values ('2026-01-01', '가', 1)`) === '', '마감이 꺼져 있으면 옛 날짜도 넣을 수 있음');
await db.exec(`insert into public.app_settings(key, value) values ('fin_lock_on', '1'), ('fin_lock_date', '2026-04-30');`);
ok(/마감된 기간/.test(await tryAs(FIN, `insert into offerings(offer_date, giver, amount) values ('2026-04-30', '가', 1)`)), '마감일 당일 추가 → 거절');
ok(/마감된 기간/.test(await tryAs(FIN, `update offerings set amount = 9 where offer_date = '2026-03-01'`)), '마감 전 전표 수정 → 거절');
ok(/마감된 기간/.test(await tryAs(FIN, `update offerings set offer_date = '2026-03-03' where offer_date = '2026-06-01'`)), '마감 뒤 전표를 마감 전 날짜로 옮기기 → 거절');
ok(/마감된 기간/.test(await tryAs(FIN, `delete from expenses where exp_date = '2026-03-02'`)), '마감 전 지출 삭제 → 거절');
ok(await tryAs(FIN, `update offerings set amount = 2100 where offer_date = '2026-06-01'`) === '', '마감 뒤 전표는 고칠 수 있음');
ok(await tryAs(FIN, `insert into offerings(offer_date, giver, amount) values ('2026-05-01', '가', 1)`) === '', '마감 뒤 날짜는 넣을 수 있음');
await db.exec(`update public.offerings set amount = 1111 where offer_date = '2026-03-01'`);
ok((await q(`select amount from offerings where offer_date = '2026-03-01'`)).rows[0].amount === 1111, 'SQL 편집기(관리 권한)는 그대로');
await db.exec(`update public.app_settings set value = '0' where key = 'fin_lock_on'`);
ok(await tryAs(FIN, `update offerings set amount = 1000 where offer_date = '2026-03-01'`) === '', '마감을 끄면 다시 고칠 수 있음');
// 3) 전체 삭제
await db.exec(`insert into public.offerings(offer_date, giver, amount) select date '2026-07-01' + g, '가짜', g from generate_series(1, 30) g;`);
const before = (await q('select count(*)::int n from offerings')).rows[0].n;
ok(/많은 전표/.test(await tryAs(FIN, `delete from offerings where id > 0`)) && (await q('select count(*)::int n from offerings')).rows[0].n === before, '화면에서 직접 20건 넘게 지우기 → 거절(하나도 안 지워짐)');
ok(await tryAs(FIN, `delete from offerings where offer_date = '2026-07-02'`) === '', '한 건씩 지우기는 그대로');
ok(/재정 권한/.test(await tryAs(MEM, `select fin_clear_vouchers('수입')`)), '재정 권한 없으면 전체 삭제 못 함');
await db.exec(`update public.app_settings set value = '1' where key = 'fin_lock_on'`);
ok(/마감이 켜져/.test(await tryAs(FIN, `select fin_clear_vouchers('수입')`)), '마감이 켜져 있으면 전체 삭제 못 함');
await db.exec(`update public.app_settings set value = '0' where key = 'fin_lock_on'`);
const n0 = (await q('select count(*)::int n from offerings')).rows[0].n;
r = await as(FIN, `select fin_clear_vouchers('수입') r`);
ok(r[0].r.deleted === n0 && r[0].r.kept === 1 && (await q('select count(*)::int n from offerings')).rows[0].n === 0, '전체 삭제(헌금만, 지출은 그대로)');
const kept = (await q(`select count(*)::int n, min(src) s, bool_and(cleared_by = '${FIN}') b from fin_cleared_vouchers`)).rows[0];
ok(kept.n === n0 && kept.s === 'offerings' && kept.b === true, '지운 전표는 보관 표에 그대로(누가 지웠는지 포함)');
ok((await as(MEM, 'select count(*)::int n from fin_cleared_vouchers'))[0].n === 0 && (await as(FIN, 'select count(*)::int n from fin_cleared_vouchers'))[0].n === n0, '보관 표는 재정 권한자만 봄');
ok((await q(`select count(*)::int n from schema_log where file='20261125_1200_fin_db_guards.sql'`)).rows[0].n === 1, '실행 기록 남김');

// 4) 겹친 번호가 이미 있으면 겹침 막기는 걸지 않고 알린다
const db2 = new PGlite();
await db2.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table public.admins(uid uuid); create table public.schema_log(file text primary key, applied_at timestamptz default now(), note text);`);
await db2.exec(fs.readFileSync(repo + '/supabase/finance-membership.sql', 'utf8').split('-- ★ 운영 참고')[0]);
await db2.exec(`alter table public.member_links add column if not exists spouse_key text;`);
await db2.exec(fs.readFileSync(repo + '/supabase/offerings.sql', 'utf8'));
await db2.exec(fm.slice(0, fm.indexOf('-- ============================================================\n--  RPC')));
await db2.exec(fs.readFileSync(repo + '/supabase/app_settings.sql', 'utf8'));
await db2.exec(fs.readFileSync(repo + '/supabase/donation_receipts.sql', 'utf8'));
await db2.exec(`insert into public.donation_receipts(receipt_no, fy, donor_name) values ('2026-0001', 2026, 'a'), ('2026-0001', 2026, 'b');`);
await db2.exec(mig);
ok((await db2.query(`select count(*)::int n from pg_indexes where indexname='donation_receipts_fy_no_uniq'`)).rows[0].n === 0, '겹친 번호가 있으면 겹침 막기를 걸지 않음(실행은 끝까지 됨)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
