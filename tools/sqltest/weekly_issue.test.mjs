// 한 주간의 이슈 고민(20261127_1500_weekly_issue) 시험 — 가짜 자료.
//   node tools/sqltest/weekly_issue.test.mjs <저장소 경로>      (@electric-sql/pglite@0.2 필요)
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const repo = process.argv[2] || '.';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
const ADMIN = '00000000-0000-0000-0000-000000000009', MEM = '00000000-0000-0000-0000-000000000001';
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon; grant usage on schema public to authenticated, anon;
create table public.admins(uid uuid primary key); insert into public.admins values ('${ADMIN}');
create table public.schema_log(file text primary key, applied_at timestamptz default now(), note text);
`);
await db.exec(fs.readFileSync(repo + '/supabase/church_settings.sql', 'utf8'));
await db.exec('grant select, insert, update on public.church_settings to authenticated, anon; grant select on public.admins to authenticated, anon;');
const mig = fs.readFileSync(repo + '/supabase/20261127_1500_weekly_issue.sql', 'utf8');
await db.exec(mig); await db.exec(mig);
ok(true, 'migration x2');
const as = async (role, uid, sql) => { await db.exec(`select set_config('t.uid','${uid || ''}',false)`); await db.exec('set role ' + role); try { return (await q(sql)).rows; } finally { await db.exec('reset role'); } };

ok((await as('anon', null, 'select public.weekly_issue_pick() r'))[0].r === null, '고른 것이 없으면 null');
const pick = { week: '2026-11-23', day: '2026-11-27', topic: { theme: '고른 주제', books: [{ id: 'b1', title: '책' }] } };
await as('authenticated', ADMIN, `insert into public.church_settings(key, data) values ('weekly_issue', '${JSON.stringify(pick)}'::jsonb)`);
ok((await as('anon', null, 'select public.weekly_issue_pick() r'))[0].r?.topic?.theme === '고른 주제', '누구나(로그인 없이) 고른 이슈를 읽음');
let denied = false;
try { await as('authenticated', MEM, `insert into public.church_settings(key, data) values ('weekly_issue2', '{}'::jsonb)`); } catch { denied = true; }
const upd = await as('authenticated', MEM, `update public.church_settings set data = '{"week":"x"}'::jsonb where key = 'weekly_issue' returning key`);
ok(denied && upd.length === 0, '보통 회원은 고를 수 없음');
await db.exec(`insert into public.church_settings(key, data) values ('pay_default', '{"account":"secret"}'::jsonb)`);
ok((await as('anon', null, 'select count(*)::int n from public.church_settings'))[0].n === 0, '다른 설정 줄은 여전히 공개 안 됨');
ok((await q(`select count(*)::int n from public.schema_log where file = '20261127_1500_weekly_issue.sql'`)).rows[0].n === 1, '실행 기록 남김');
console.log(`\n${pass} ok · ${fail} fail`);
process.exit(fail ? 1 : 0);
