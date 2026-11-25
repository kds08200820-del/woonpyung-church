// SQL 실행 기록 · 구조 목록(20261125_1000_schema_log) + 대조 스크립트(tools/schema-check.mjs) 시험 — 가짜 자료만(PGlite).
//   node tools/sqltest/schema_log.test.mjs <저장소 경로>      (@electric-sql/pglite@0.2 필요)
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
const repo = process.argv[2] || '.';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
const ADMIN = '00000000-0000-0000-0000-000000000009', MEM = '00000000-0000-0000-0000-000000000001';
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('t.role', true),'') $$;
grant usage on schema auth to authenticated, anon, service_role; grant execute on all functions in schema auth to authenticated, anon, service_role;
grant usage on schema public to authenticated, anon, service_role;
create table public.admins(uid uuid primary key);
insert into public.admins values ('${ADMIN}');
create table public.thing(id int primary key, name text);
create policy "thing_read" on public.thing for select using (true);
create index thing_name_idx on public.thing(name);
`);
const mig = fs.readFileSync(path.join(repo, 'supabase/20261125_1000_schema_log.sql'), 'utf8');
await db.exec(mig); await db.exec(mig);
ok((await q(`select count(*)::int n from public.schema_log`)).rows[0].n === 5, 'migration x2 · 기록 5줄(확인한 넷 + 자기 자신)');
const as = async (role, uid, sql) => {
  await db.exec(`select set_config('t.uid','${uid || ''}',false), set_config('t.role','${role === 'anon' ? 'anon' : role}',false)`);
  await db.exec('set role ' + role);
  try { return (await q(sql)).rows; } finally { await db.exec('reset role'); }
};
let cat = (await as('authenticated', ADMIN, 'select public.schema_catalog() c'))[0].c;
ok(cat.functions.includes('schema_catalog') && cat.tables.includes('thing') && cat.columns.includes('thing.name') && cat.policies.includes('thing.thing_read') && cat.indexes.includes('thing_name_idx'), '관리자: 이름 목록');
ok(cat.logged.length === 5 && !JSON.stringify(cat).includes('가짜'), '기록 목록 포함, 자료는 없음');
ok((await as('service_role', null, 'select public.schema_catalog() c'))[0].c.tables.includes('schema_log'), '서버 키(service_role)로도 볼 수 있음');
try { await as('authenticated', MEM, 'select public.schema_catalog()'); ok(false, '보통 회원은 못 봄'); } catch (e) { ok(/관리자만/.test(e.message), '보통 회원은 못 봄'); }
try { await as('anon', null, 'select public.schema_catalog()'); ok(false, '로그인 없이 못 부름'); } catch (e) { ok(/permission denied/.test(e.message), '로그인 없이 못 부름'); }
try { await as('authenticated', ADMIN, 'select * from public.schema_log'); ok(false, '기록 표를 직접 못 읽음'); } catch (e) { ok(/permission denied/.test(e.message), '기록 표는 화면에서 직접 못 읽음'); }

// ── 대조 스크립트 ──
const sc = await import(pathToFileURL(path.join(repo, 'tools/schema-check.mjs')).href);
const o = sc.objectsOf(`
-- drop function if exists public.should_not_count();
create or replace function public.alpha(x int) returns int language sql as $$ select 1 $$;
create table if not exists public.beta (id int);
alter table public.beta add column if not exists gamma text, add column delta int;
create or replace trigger beta_trg before insert on public.beta for each row execute function public.alpha();
create policy "beta read" on public.beta for select using (true);
create policy beta_write on public.beta for insert with check (true);
create unique index if not exists beta_idx on public.beta(id);`);
ok([...o.functions].join() === 'alpha' && [...o.tables].join() === 'beta' && [...o.columns].sort().join() === 'beta.delta,beta.gamma'
  && [...o.triggers].join() === 'beta_trg' && [...o.policies].sort().join() === 'beta.beta read,beta.beta_write' && [...o.indexes].join() === 'beta_idx', '파일에서 만드는 이름 뽑기(주석 속 이름은 빼고)');
const fake = { functions: ['alpha'], tables: ['beta'], columns: ['beta.gamma'], triggers: [], policies: [], indexes: [], logged: [{ file: 'x_logged.sql' }] };
ok(sc.judge('a.sql', o, fake).state === '일부만', '일부만 있으면 「일부만」');
ok(sc.judge('a.sql', sc.objectsOf('create function public.zzz() returns int language sql as $$ select 1 $$;'), fake).state === '안 된 듯', '하나도 없으면 「안 된 듯」');
ok(sc.judge('x_logged.sql', sc.objectsOf('create function public.zzz() returns int language sql as $$ select 1 $$;'), fake).state === '실행됨', '기록이 있으면 「실행됨」');
ok(sc.judge('d.sql', sc.objectsOf('update public.beta set id = 1;'), fake).state === '알 수 없음', '만드는 이름이 없으면 「알 수 없음」');
// 실제 저장소 파일 전부를 이 가짜 DB 목록과 견줘도 오류 없이 끝나는지
const files = fs.readdirSync(path.join(repo, 'supabase')).filter((f) => f.endsWith('.sql'));
let errs = 0; for (const f of files) { try { sc.judge(f, sc.objectsOf(fs.readFileSync(path.join(repo, 'supabase', f), 'utf8')), cat); } catch (e) { errs++; } }
ok(errs === 0 && files.length > 100, '저장소 SQL 파일 전부 읽기(' + files.length + '개)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
