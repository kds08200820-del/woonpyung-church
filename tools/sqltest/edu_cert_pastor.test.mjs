// 증명서 발급은 목회자만(20261025_2000) 마이그레이션 시험 — 가짜 자료만(PGlite). 1600 → 1800 → 2000(두 번).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node edu_cert_pastor.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } }
const PASTOR = '11111111-1111-4111-8111-111111111111', STAFF = '22222222-2222-4222-8222-222222222222', NAMED = '33333333-3333-4333-8333-333333333333',
  MEMBER = '55555555-5555-4555-8555-555555555555', NAMED_NOADMIN = '66666666-6666-4666-8666-666666666666';
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  create table public.admins (uid uuid primary key);
  create table public.profiles (id uuid primary key, name text, role text);
  create table public.member_links (user_id uuid primary key, member_key text, member_name text, member_status text default '정회원', can_pastor boolean not null default false);
  create table public.member_files (id bigint generated always as identity primary key, member_key text, member_name text, category text, title text,
    file_url text, file_key text, file_name text, file_size bigint, memo text, doc_date date, uploaded_by text, created_by uuid default auth.uid(), created_at timestamptz default now());
  insert into auth.users values ('${PASTOR}'), ('${STAFF}'), ('${NAMED}'), ('${MEMBER}'), ('${NAMED_NOADMIN}');
  insert into public.admins values ('${PASTOR}'), ('${STAFF}'), ('${NAMED}');
  insert into public.profiles values ('${PASTOR}', '테스트_목사', '담임목사'), ('${STAFF}', '테스트_간사', '집사'), ('${NAMED}', '테스트_전도', null), ('${MEMBER}', '테스트_성도', '성도'), ('${NAMED_NOADMIN}', '테스트_부목', '협동목사');
  insert into public.member_links (user_id, member_key, can_pastor) values ('${NAMED}', '테스트_전도|19800101', true), ('${NAMED_NOADMIN}', '테스트_부목|19750101', true);
`);
for (const f of ['20261025_1600_edu_classroom.sql', '20261025_1800_edu_infant.sql']) await db.exec(fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8'));
const MIG = fs.readFileSync(path.join(ROOT, 'supabase/20261025_2000_edu_cert_pastor.sql'), 'utf8');
await db.exec(MIG); await db.exec(MIG);
ok('rerun safe', true);
async function as(uid, sql) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { const r = await db.query(sql); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }
  finally { await db.exec('reset role; set session authorization postgres;'); }
}
const pg = async (sql) => (await db.query(sql)).rows;
ok('담임목사(관리자) = 목회자', (await as(PASTOR, `select public.edu_is_pastor()`)) === true);
ok('관리자 + 집사 = 아님', (await as(STAFF, `select public.edu_is_pastor()`)) === false);
ok('관리자 + 목회자 지명 = 목회자', (await as(NAMED, `select public.edu_is_pastor()`)) === true);
ok('성도 = 아님', (await as(MEMBER, `select public.edu_is_pastor()`)) === false);
ok('목회자 지명이지만 관리자 아님 = 아님', (await as(NAMED_NOADMIN, `select public.edu_is_pastor()`)) === false);
let anonErr = null; try { await as(null, `select public.edu_is_pastor()`); } catch (e) { anonErr = e.message; }
ok('anon blocked', !!anonErr);

const call = (k, key, name) => `select public.edu_cert_issue('${k}', null, ${key ? `'${key}'` : 'null'}, '${name}', '1990-01-01', '2026-10-18', '2026-10-25', '김동석 목사', '운평장로교회', '2026-10-25', null)`;
let r = await as(STAFF, call('세례', '테스트_가|19900101', '테스트_가'));
ok('non-pastor admin blocked', !r.ok && r.why === 'pastor', r);
r = await as(MEMBER, call('세례', '테스트_가|19900101', '테스트_가'));
ok('member blocked', !r.ok && r.why === 'pastor', r);
r = await as(PASTOR, call('세례', '테스트_가|19900101', '테스트_가'));
ok('pastor issues without exam', r.ok && r.cert_no === '2026-세-001', r);
const mf = await pg(`select member_key, category, title, uploaded_by from public.member_files where file_url = 'edu-print.html?cert=${r.id}'`);
ok('자료실 row (member key, 세례증명서, 증명서 발급)', mf.length === 1 && mf[0].member_key === '테스트_가|19900101' && mf[0].category === '세례증명서' && mf[0].uploaded_by === '증명서 발급', mf);
r = await as(NAMED, call('학습', '테스트_나|19910101', '테스트_나'));
ok('named pastor issues 학습', r.ok && r.cert_no === '2026-학-001', r);
r = await as(PASTOR, call('유아세례', '테스트_다|20240101', '테스트_다'));
ok('infant cert', r.ok && r.cert_no === '2026-유-001', r);
r = await as(PASTOR, call('입교', null, '테스트_라'));
ok('no key still issues (name only)', r.ok && r.cert_no === '2026-입-001', r);
ok('bad kind', (await as(PASTOR, call('임직', null, '테스트'))).why === 'kind');
// 강의실 결과가 있으면 '강의실'
const sheet = JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ id: 'L' + i, ch: 1, q: 'q' + i, o: ['a', 'b'], a: 0, p: 0 })));
await db.exec(`insert into public.member_links (user_id, member_key) values ('${MEMBER}', '테스트_성도|19990101')`);
const rid = (await as(MEMBER, `select public.edu_exam_submit('learn', '${sheet}'::jsonb)`)).id;
r = await as(PASTOR, `select public.edu_cert_issue('학습', ${rid}, null, '테스트_성도', null, null, null, null, null, '2026-10-25', null)`);
ok('with exam result', r.ok && r.cert_no === '2026-학-002', r);
ok('자료실 uploaded_by 강의실 when result', (await pg(`select uploaded_by from public.member_files where file_url = 'edu-print.html?cert=${r.id}'`))[0].uploaded_by === '강의실');

console.log(`edu_cert_pastor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
