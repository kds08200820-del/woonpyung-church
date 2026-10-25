// 학습·세례·입교 신청서의 유아세례 신청(20261025_2100) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node baptism_infant_apply.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } }
const P1 = '11111111-1111-4111-8111-111111111111', P2 = '22222222-2222-4222-8222-222222222222', P3 = '33333333-3333-4333-8333-333333333333', ADM = '44444444-4444-4444-8444-444444444444';
const read = (f) => fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
const ymd = (d) => d.toISOString().slice(0, 10);
const yearsAgo = (n, extraDays = 0) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); d.setDate(d.getDate() - extraDays); return ymd(d); };
const db = new PGlite();
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
  create table public.gyojeok (id bigint generated always as identity primary key, name text, birth date, member_key text, grade text, baptism_date date, created_at timestamptz default now());
  insert into auth.users values ('${P1}'), ('${P2}'), ('${P3}'), ('${ADM}');
  insert into public.admins values ('${ADM}');
`);
for (const f of ['20261010_1140_app_forms.sql', '20261010_1300_app_participants.sql', '20261010_1700_app_forms_image.sql', '20261024_1800_app_forms_people_label.sql',
  '20261024_1810_app_forms_allow_same_name.sql', '20261025_1300_app_forms_baptism.sql', '20261025_1700_baptism_targets.sql', '20261025_1900_baptism_apply_kinds.sql']) await db.exec(read(f));
const MIG = read('20261025_2100_baptism_apply_infant.sql');
await db.exec(MIG); await db.exec(MIG);
ok('rerun safe', true);
async function as(uid, sql) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { const r = await db.query(sql); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }
  finally { await db.exec('reset role; set session authorization postgres;'); }
}
const pg = async (sql) => (await db.query(sql)).rows;
const kids = (arr) => `'${JSON.stringify(arr)}'::jsonb`;
const fid = (await pg(`insert into public.app_forms (title, open_at, published, kind, questions) values ('테스트 학습·세례·입교·유아세례', now() - interval '1 day', true, 'baptism', '[]'::jsonb) returning id`))[0].id;
const sub = (uid, list, name = '테스트_부모') => as(uid, `select public.app_submit_infant(${fid}, '${name}', '010-0000-0000', ${kids(list)})`);

let r = await sub(P1, [{ name: '테스트_아기', birth: yearsAgo(2) }, { name: '테스트_어린이', birth: yearsAgo(9) }]);
ok('two children', r.ok && r.children === 2 && !r.updated, r);
let e = (await pg(`select apply_kind, adults, minors, memo, participants, fee_total, answers from public.app_entries where user_id = '${P1}'`))[0];
ok('stored 유아세례', e.apply_kind === '유아세례' && e.adults === 1 && e.minors === 2 && e.fee_total === 0 && JSON.stringify(e.answers) === '[]', e);
ok('rite labels (6세까지 유아세례 · 7~13세 어린이세례)', e.participants[1].rite === '유아세례' && e.participants[2].rite === '어린이세례' && e.participants[1].birth === yearsAgo(2), e.participants);
ok('memo', /^자녀: 테스트_아기\(.*유아세례\) · 테스트_어린이\(.*어린이세례\)$/.test(e.memo), e.memo);
r = await sub(P1, [{ name: '테스트_아기', birth: yearsAgo(2) }]);
ok('resubmit updates', r.ok && r.updated && r.children === 1, r);
r = await sub(P2, [{ name: '테스트_아기', birth: yearsAgo(2) }], '테스트_배우자');
ok('spouse dup blocked', !r.ok && r.why === 'dup', r);
r = await sub(P2, [{ name: '테스트_큰아이', birth: yearsAgo(14) }]);
ok('14세 rejected', !r.ok && r.why === 'age' && /학습/.test(r.error), r);
r = await sub(P2, [{ name: '테스트_13세', birth: yearsAgo(13) }]);
ok('13세 ok (어린이세례)', r.ok, r);
r = await sub(P3, [{ name: '테스트', birth: '2099-01-01' }]);
ok('future birth rejected', !r.ok && r.why === 'birth', r);
r = await sub(P3, [{ name: '테스트', birth: '2024-02-30' }]);
ok('invalid date rejected', !r.ok && r.why === 'birth', r);
r = await sub(P3, [{ name: '', birth: yearsAgo(1) }]);
ok('empty child name rejected', !r.ok && r.why === 'child', r);
r = await sub(P3, []);
ok('no children rejected', !r.ok && r.why === 'children', r);
r = await sub(P3, Array.from({ length: 6 }, (_, i) => ({ name: '테스트' + i, birth: yearsAgo(1) })));
ok('6 children rejected', !r.ok && r.why === 'children', r);
r = await sub(P3, [{ name: '테스트_쌍', birth: yearsAgo(1) }, { name: '테스트_쌍', birth: yearsAgo(1) }]);
ok('same child twice rejected', !r.ok && r.why === 'child', r);
let anonErr = null; try { await as(null, `select public.app_submit_infant(${fid}, 'a', 'b', '[]'::jsonb)`); } catch (x) { anonErr = x.message; }
ok('anon has no execute', !!anonErr, anonErr);
// 담임목사가 정한 대상 목록이 있어도 유아세례(부모)는 받는다
const h = (await pg(`select public.app_key_hash('테스트_대상|19900101') h`))[0].h;
r = await as(ADM, `select public.app_form_set_targets_kind(${fid}, '${JSON.stringify([{ h, k: '학습' }])}'::jsonb, '알림')`);
ok('targets set', r.ok, r);
r = await sub(P3, [{ name: '테스트_셋째', birth: yearsAgo(3) }]);
ok('infant ok with targets present', r.ok, r);
r = await as(P3, `select public.app_submit_qa(${fid}, '테스트', '010', '학습', '[]'::jsonb)`);
ok('qa still target-restricted', !r.ok && r.why === 'target', r);
// 마감·비공개 신청서
await pg(`update public.app_forms set close_at = now() - interval '1 minute' where id = ${fid}`);
r = await sub(P1, [{ name: '테스트_아기', birth: yearsAgo(2) }]);
ok('closed', !r.ok && r.why === 'closed', r);
const gen = (await pg(`insert into public.app_forms (title, open_at, published) values ('일반', now() - interval '1 day', true) returning id`))[0].id;
r = await as(P1, `select public.app_submit_infant(${gen}, 'a', '010', ${kids([{ name: 'x', birth: yearsAgo(1) }])})`);
ok('general form rejected', !r.ok && r.why === 'form', r);

console.log(`baptism_infant_apply: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
