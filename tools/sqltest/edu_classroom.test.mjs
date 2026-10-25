// 강의실(학습·세례 교육과정 — 진도·시험·증명서) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node edu_classroom.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } }

const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', U3 = '33333333-3333-4333-8333-333333333333',
  ADM = '44444444-4444-4444-8444-444444444444';
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
  alter table public.member_files enable row level security;
  create policy "admin all member_files" on public.member_files for all using (exists (select 1 from public.admins a where a.uid = auth.uid())) with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
  insert into auth.users values ('${U1}'), ('${U2}'), ('${U3}'), ('${ADM}');
  insert into public.admins values ('${ADM}');
  insert into public.profiles values ('${U1}', '테스트_학습자'), ('${U2}', '테스트_세례자'), ('${U3}', '테스트_미연결'), ('${ADM}', '테스트_목사');
  insert into public.member_links (user_id, member_key, member_name) values ('${U1}', '테스트_학습자|19900101', '테스트_학습자'), ('${U2}', '테스트_세례자|19850505', '테스트_세례자');
`);
const MIG = fs.readFileSync(path.join(ROOT, 'supabase/20261025_1600_edu_classroom.sql'), 'utf8');
await db.exec(MIG);
await db.exec(MIG);
ok('rerun safe', true);

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
async function asErr(uid, sql) { try { await as(uid, sql); return null; } catch (e) { return e.message; } }
async function pg(sql) { return (await db.query(sql)).rows; }
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// 답안지: 20문항, 정답 a, 고른 p — right 개만 맞힘
function sheet(right, opts = {}) {
  const out = [];
  for (let i = 0; i < 20; i++) {
    const n = opts.ox && i % 2 ? 2 : 4;
    const o = Array.from({ length: n }, (_, k) => `보기${i}-${k}`);
    const a = i % n;
    out.push({ id: `T${i}`, ch: (i % 10) + 1, q: `테스트 문제 ${i}`, o, a, p: i < right ? a : (a + 1) % n });
  }
  return out;
}
const submit = (uid, course, sh, name = null) => as(uid, `select public.edu_exam_submit(${q(course)}, ${q(JSON.stringify(sh))}::jsonb, ${name ? q(name) : 'null'}, now() - interval '20 minutes', '20261025')`);

// 1) 진도
let r = await as(U1, `select public.edu_progress_save('learn', '[1,2,2,3,"x",99,-1,0]'::jsonb)`);
ok('progress saved (dedupe·range)', r.ok && JSON.stringify(r.done) === '[0,1,2,3]', r);
r = await as(U1, `select public.edu_progress_save('learn', '[1,2,3,4]'::jsonb)`);
ok('progress upsert', r.ok && JSON.stringify(r.done) === '[1,2,3,4]', r);
ok('progress bad course', !(await as(U1, `select public.edu_progress_save('xx', '[1]'::jsonb)`)).ok);
ok('progress not array', !(await as(U1, `select public.edu_progress_save('learn', '{"a":1}'::jsonb)`)).ok);
ok('progress anon blocked', !!(await asErr(null, `select public.edu_progress_save('learn', '[1]'::jsonb)`)));
ok('progress own row only', (await rows(U2, `select * from public.edu_course_progress`)).length === 0);
ok('progress direct insert blocked', !!(await asErr(U2, `insert into public.edu_course_progress (user_id, course) values ('${U2}', 'learn')`)));
ok('progress admin sees', (await rows(ADM, `select * from public.edu_course_progress`)).length === 1);

// 2) 시험 — 형식 검사
ok('sheet 19 rejected', (await submit(U1, 'learn', sheet(20).slice(0, 19))).why === 'sheet');
let bad = sheet(20); bad[3].id = bad[2].id;
ok('dup id rejected', (await submit(U1, 'learn', bad)).why === 'sheet');
bad = sheet(20); bad[5].a = 7;
ok('answer out of range rejected', (await submit(U1, 'learn', bad)).why === 'sheet');
bad = sheet(20); bad[0].o = ['하나'];
ok('one option rejected', (await submit(U1, 'learn', bad)).why === 'sheet');
bad = sheet(20); bad[0].q = '';
ok('empty question rejected', (await submit(U1, 'learn', bad)).why === 'sheet');
ok('bad course', (await submit(U1, 'xx', sheet(20))).why === 'course');
ok('anon cannot submit', !!(await asErr(null, `select public.edu_exam_submit('learn', '[]'::jsonb)`)));

// 3) 불합격(13개 = 65점) → 기록은 남고 자료실 항목 없음
r = await submit(U1, 'learn', sheet(13));
ok('fail 65', r.ok && r.score === 65 && r.correct === 13 && r.passed === false && r.linked === true, r);
ok('no member_files on fail', (await pg(`select count(*)::int n from public.member_files`))[0].n === 0);
// 고르지 않은 문항(p 없음)은 틀린 것으로
let skip = sheet(20); delete skip[0].p; skip[1].p = null;
r = await submit(U1, 'learn', skip);
ok('unanswered counted wrong (18 → 90)', r.ok && r.score === 90 && r.passed, r);
ok('member_files on pass', (await pg(`select category, title, file_url, member_key, uploaded_by from public.member_files`)).some((f) => f.category === '출석/이수' && /학습 과정 이수 시험지 \(90점\)/.test(f.title) && f.file_url === 'edu-print.html?sheet=' + r.id && f.member_key === '테스트_학습자|19900101' && f.uploaded_by === '강의실'));
const passId = r.id;
ok('already passed blocked', (await submit(U1, 'learn', sheet(20))).why === 'already');
// 14개 = 70점 경계 통과(세례 과정, O/X 섞임)
r = await submit(U2, 'baptism', sheet(14, { ox: true }));
ok('boundary 70 passes', r.ok && r.score === 70 && r.passed, r);
const bapId = r.id;
// 교적 미연결 회원: 이름은 프로필에서
r = await submit(U3, 'learn', sheet(20), '입력이름');
ok('unlinked pass', r.ok && r.passed && r.linked === false, r);
const unlinkedId = r.id;
let row = (await pg(`select member_key, member_name from public.edu_exam_results where id = ${unlinkedId}`))[0];
ok('unlinked name from profile', row.member_key === null && row.member_name === '테스트_미연결', row);

// 4) 읽기 권한
ok('own results only', (await rows(U1, `select id from public.edu_exam_results`)).length === 2);
ok('other cannot read', (await rows(U2, `select id from public.edu_exam_results where user_id = '${U1}'`)).length === 0);
ok('admin reads all', (await rows(ADM, `select id from public.edu_exam_results`)).length === 4);
ok('member cannot insert directly', !!(await asErr(U1, `insert into public.edu_exam_results (course, member_name, score, correct, total, passed, sheet) values ('learn', 'x', 100, 20, 20, true, '[]')`)));
ok('member cannot update score', !!(await asErr(U1, `update public.edu_exam_results set score = 100 where user_id = '${U1}'`)));
await as(U1, `update public.edu_exam_results set member_key = 'x' where user_id = '${U1}'`).catch(() => {});
ok('member cannot relink', (await pg(`select count(*)::int n from public.edu_exam_results where member_key = 'x'`))[0].n === 0);
// 관리자: 교적 연결
await as(ADM, `update public.edu_exam_results set member_key = '테스트_미연결|19700707', member_name = '테스트_미연결' where id = ${unlinkedId}`);
ok('admin links 교적', (await pg(`select member_key from public.edu_exam_results where id = ${unlinkedId}`))[0].member_key === '테스트_미연결|19700707');
ok('admin cannot change score (column grant)', !!(await asErr(ADM, `update public.edu_exam_results set score = 0 where id = ${unlinkedId}`)));
ok('nobody deletes', !!(await asErr(ADM, `delete from public.edu_exam_results where id = ${unlinkedId}`)));

// 5) 하루 10번 제한
for (let i = 0; i < 9; i++) await submit(U2, 'learn', sheet(5));
r = await submit(U2, 'learn', sheet(5));
ok('10th try today ok', r.ok, r);
r = await submit(U2, 'learn', sheet(20));
ok('11th try limited', !r.ok && r.why === 'limit', r);

// 6) 관리자 진도 목록
await as(U2, `select public.edu_progress_save('baptism', '[1,2,3,4,5,6,7,8,9,10,11,0]'::jsonb)`);
let ap = await as(ADM, `select public.edu_admin_progress()`);
ok('admin progress list', Array.isArray(ap) && ap.length === 2 && ap.some((x) => x.course === 'baptism' && x.name === '테스트_세례자' && x.passed === true && x.tries === 1), ap);
ok('admin progress hidden from members', JSON.stringify(await as(U1, `select public.edu_admin_progress()`)) === '[]');

// 7) 증명서 발급
const issue = (uid, kind, result, name, key = null, on = '2026-10-25') => as(uid, `select public.edu_cert_issue(${q(kind)}, ${result == null ? 'null' : result}, ${key ? q(key) : 'null'}, ${q(name)}, '1990-01-01', '2026-10-18', '2026-10-25', '김동석 목사', '운평장로교회', '${on}', null)`);
r = await issue(U1, '학습', passId, '테스트_학습자');
ok('member cannot issue', !r.ok && r.why === 'admin', r);
r = await issue(ADM, '학습', passId, '테스트_학습자');
ok('issue 1', r.ok && r.cert_no === '2026-학-001', r);
const certId = r.id;
r = await issue(ADM, '학습', null, '테스트_수기발급', '테스트_수기|19600101');
ok('issue 2 (no exam)', r.ok && r.cert_no === '2026-학-002', r);
r = await issue(ADM, '세례', bapId, '테스트_세례자');
ok('baptism numbering separate', r.ok && r.cert_no === '2026-세-001', r);
r = await issue(ADM, '입교', null, '테스트_입교자', null, '2027-01-03');
ok('year resets', r.ok && r.cert_no === '2027-입-001', r);
ok('bad kind', (await issue(ADM, '임직', null, 'x')).why === 'kind');
ok('empty name', (await issue(ADM, '학습', null, ' ')).why === 'name');
ok('failed result rejected', (await as(ADM, `select public.edu_cert_issue('학습', (select id from public.edu_exam_results where not passed limit 1), null, 'x', null, null, null, null, null, null, null)`)).why === 'result');
let c = (await pg(`select * from public.edu_certificates where id = ${certId}`))[0];
ok('cert linked to user & 교적', c.user_id === U1 && c.member_key === '테스트_학습자|19900101' && c.officiant === '김동석 목사', c);
ok('cert in 자료실', (await pg(`select * from public.member_files where file_url = 'edu-print.html?cert=${certId}'`)).some((f) => f.category === '학습' && /2026 학습교인 증명서 \(2026-학-001\)/.test(f.title)));
ok('baptism cert category', (await pg(`select category from public.member_files where title like '%세례교인 증명서%'`))[0].category === '세례증명서');
ok('owner reads own cert', (await rows(U1, `select id from public.edu_certificates`)).length === 1);
ok('others cannot read', (await rows(U3, `select id from public.edu_certificates`)).length === 0);
ok('member cannot insert cert', !!(await asErr(U1, `insert into public.edu_certificates (cert_no, kind, member_name) values ('x', '학습', 'x')`)));
ok('member cannot void', (await as(U1, `update public.edu_certificates set voided_at = now() returning id`).catch(() => 'err')) !== certId);
await as(ADM, `update public.edu_certificates set voided_at = now() where id = ${certId}`);
ok('admin voids', (await pg(`select voided_at from public.edu_certificates where id = ${certId}`))[0].voided_at !== null);
ok('admin cannot change cert_no', !!(await asErr(ADM, `update public.edu_certificates set cert_no = 'x' where id = ${certId}`)));
// 같은 해·종류에서 취소된 번호는 재사용하지 않음
r = await issue(ADM, '학습', null, '테스트_셋째');
ok('next number after void', r.ok && r.cert_no === '2026-학-003', r);

// 8) 자료실 표가 없는 곳에서도 동작
await pg(`alter table public.member_files rename to member_files_x`);
r = await submit(U3, 'baptism', sheet(20));
ok('works without member_files', r.ok && r.passed, r);
r = await issue(ADM, '세례', r.id, '테스트_미연결');
ok('issue without member_files', r.ok && r.cert_no === '2026-세-002', r);

console.log(`edu_classroom: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
