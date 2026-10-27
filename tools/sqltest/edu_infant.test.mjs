// 강의실 유아세례 과정(20261025_1800) 마이그레이션 시험 — 가짜 자료만(PGlite). 앞선 1600 을 먼저 실행한 뒤 1800 을 두 번 실행한다.
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node edu_infant.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } }
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', ADM = '44444444-4444-4444-8444-444444444444';
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
  create table public.profiles (id uuid primary key, name text);
  create table public.member_links (user_id uuid primary key, member_key text, member_name text, member_status text default '정회원');
  create table public.member_files (id bigint generated always as identity primary key, member_key text, member_name text, category text, title text,
    file_url text, file_key text, file_name text, file_size bigint, memo text, doc_date date, uploaded_by text, created_by uuid default auth.uid(), created_at timestamptz default now());
  insert into auth.users values ('${U1}'), ('${U2}'), ('${ADM}');
  insert into public.admins values ('${ADM}');
  insert into public.profiles values ('${U1}', '테스트_부모'), ('${U2}', '테스트_다른'), ('${ADM}', '테스트_목사');
  insert into public.member_links (user_id, member_key, member_name) values ('${U1}', '테스트_부모|19900101', '테스트_부모');
`);
await db.exec(fs.readFileSync(path.join(ROOT, 'supabase/20261025_1600_edu_classroom.sql'), 'utf8'));

async function as(uid, sql) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { const r = await db.query(sql); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }
  finally { await db.exec('reset role; set session authorization postgres;'); }
}
async function rows(uid, sql) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql)).rows; }
  finally { await db.exec('reset role; set session authorization postgres;'); }
}
const pg = async (sql) => (await db.query(sql)).rows;
function sheet(right) {
  return JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ id: 'I' + i, ch: 1 + (i % 5), q: '문제' + i, o: ['가', '나', '다', '라'], a: 0, p: i < right ? 0 : 1 })));
}

// 1600 만 있을 때: 유아세례는 막힌다 + 운영에 이미 있을 수 있는 학습 기록 하나
ok('before: infant rejected', (await as(U1, `select public.edu_progress_save('infant', '[1]')`)).why === 'course');
let r = await as(U1, `select public.edu_exam_submit('learn', '${sheet(18)}'::jsonb)`);
ok('before: learn pass kept', r.ok && r.passed, r);

const MIG = fs.readFileSync(path.join(ROOT, 'supabase/20261025_1800_edu_infant.sql'), 'utf8');
await db.exec(MIG);
await db.exec(MIG);
ok('rerun safe', true);
ok('old rows intact', (await pg(`select count(*)::int n from public.edu_exam_results where course = 'learn' and passed`))[0].n === 1);
const cons = await pg(`select conname, pg_get_constraintdef(oid) d from pg_constraint where conname in ('edu_course_progress_course_check','edu_exam_results_course_check','edu_certificates_kind_check') order by conname`);
ok('constraints widened (same names, one each)', cons.length === 3 && /infant/.test(cons[1].d) && /infant/.test(cons[2].d) && /유아세례/.test(cons[0].d), cons);
let cerr = null; try { await pg(`insert into public.edu_course_progress (user_id, course) values ('${U2}', '임직')`); } catch (e) { cerr = e.message; }
ok('still rejects unknown course', /check|violates/.test(cerr || ''), cerr);
ok('parents column', (await pg(`select count(*)::int n from information_schema.columns where table_name = 'edu_certificates' and column_name = 'parents' and is_nullable = 'YES'`))[0].n === 1);

// 유아세례 과정: 진도·시험
r = await as(U1, `select public.edu_progress_save('infant', '[1,2,3,4,5,0]')`);
ok('infant progress saved', r.ok && JSON.stringify(r.done) === '[0,1,2,3,4,5]', r);
r = await as(U1, `select public.edu_exam_submit('infant', '${sheet(12)}'::jsonb)`);
ok('infant fail 60', r.ok && !r.passed && r.score === 60, r);
r = await as(U1, `select public.edu_exam_submit('infant', '${sheet(15)}'::jsonb)`);
ok('infant pass 75', r.ok && r.passed && r.score === 75 && r.linked, r);
const rid = r.id;
r = await as(U1, `select public.edu_exam_submit('infant', '${sheet(20)}'::jsonb)`);
ok('infant already', !r.ok && r.why === 'already', r);
const mf = await pg(`select category, title, file_url from public.member_files where file_url = 'edu-print.html?sheet=${rid}'`);
ok('member_files infant sheet', mf.length === 1 && mf[0].category === '출석/이수' && mf[0].title === '유아세례 과정 이수 시험지 (75점)', mf);
ok('learn label unchanged', (await pg(`select title from public.member_files where title like '학습 과정 이수 시험지%'`)).length === 1);

// 유아세례 증명서: 자녀 이름·자녀 키, 부모 키를 끌어오지 않음, 부모는 볼 수 있음
r = await as(U1, `select public.edu_cert_issue('유아세례', ${rid}, null, '테스트_자녀', '2024-03-01', null, '2026-11-01', '김동석', '운평장로교회', '2026-11-01', null)`);
ok('member cannot issue', !r.ok && r.why === 'admin', r);
r = await as(ADM, `select public.edu_cert_issue('유아세례', ${rid}, null, '테스트_자녀', '2024-03-01', null, '2026-11-01', '김동석', '운평장로교회', '2026-11-01', null)`);
ok('infant cert no', r.ok && r.cert_no === '2026-유-001', r);
const cid = r.id;
let c = (await pg(`select * from public.edu_certificates where id = ${cid}`))[0];
ok('child cert: no parent key, parent uid', c.member_key === null && c.user_id === U1 && c.kind === '유아세례' && c.member_name === '테스트_자녀', c);
r = await as(ADM, `select public.edu_cert_issue('유아세례', ${rid}, '테스트_자녀|20240301', '테스트_자녀', '2024-03-01', null, '2026-11-01', '김동석', '운평장로교회', '2026-11-01', null)`);
ok('infant cert no 002 + child key', r.ok && r.cert_no === '2026-유-002', r);
c = (await pg(`select * from public.edu_certificates where id = ${r.id}`))[0];
ok('child key kept', c.member_key === '테스트_자녀|20240301', c);
const mf2 = await pg(`select category, title, file_name from public.member_files where file_url = 'edu-print.html?cert=${cid}'`);
ok('member_files infant cert', mf2.length === 1 && mf2[0].category === '세례증명서' && mf2[0].title === '2026 유아세례 증명서 (2026-유-001)', mf2);
ok('parent can read child cert', (await rows(U1, `select id from public.edu_certificates where kind = '유아세례'`)).length === 2);
ok('other cannot read', (await rows(U2, `select id from public.edu_certificates`)).length === 0);

// 부모 이름: 관리자만 고침
await rows(U1, `update public.edu_certificates set parents = '가짜' where id = ${cid}`).catch(() => null);
ok('member cannot set parents', (await pg(`select parents from public.edu_certificates where id = ${cid}`))[0].parents === null);
await rows(ADM, `update public.edu_certificates set parents = '테스트_부모 · 테스트_엄마' where id = ${cid}`);
ok('admin sets parents', (await pg(`select parents from public.edu_certificates where id = ${cid}`))[0].parents === '테스트_부모 · 테스트_엄마');

// 다른 종류는 그대로: 학습 증명서(결과의 교적 키를 끌어옴), 세례·입교 번호
const lr = (await pg(`select id from public.edu_exam_results where course = 'learn' and passed`))[0].id;
r = await as(ADM, `select public.edu_cert_issue('학습', ${lr}, null, '테스트_부모', null, null, null, null, null, '2026-11-01', null)`);
ok('learn cert', r.ok && r.cert_no === '2026-학-001', r);
ok('learn cert pulls result key', (await pg(`select member_key from public.edu_certificates where id = ${r.id}`))[0].member_key === '테스트_부모|19900101');
ok('learn member_files title', (await pg(`select title from public.member_files where file_url = 'edu-print.html?cert=${r.id}'`))[0].title === '2026 학습교인 증명서 (2026-학-001)');
r = await as(ADM, `select public.edu_cert_issue('입교', null, null, '테스트_입교', null, null, null, null, null, '2026-11-01', null)`);
ok('confirm cert', r.ok && r.cert_no === '2026-입-001', r);
r = await as(ADM, `select public.edu_cert_issue('임직', null, null, '테스트', null, null, null, null, null, null, null)`);
ok('bad kind', !r.ok && r.why === 'kind', r);
r = await as(ADM, `select public.edu_cert_issue(null, null, null, '테스트', null, null, null, null, null, null, null)`);
ok('null kind', !r.ok && r.why === 'kind', r);

// 관리자 진도 목록에 유아세례
const prog = await as(ADM, `select public.edu_admin_progress()`);
ok('admin progress lists infant', prog.some((p) => p.course === 'infant' && p.passed), prog);

console.log(`edu_infant: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
