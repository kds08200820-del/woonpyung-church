// 학습·세례·입교 신청 — 종류 셋 · 내 교적으로 신청 자격(20261025_1900) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node baptism_apply.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } }
const U = (n) => `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n.repeat(12)}`;
const [U1, U2, U3, U4, U5, U6, U7, U8, ADM] = ['1', '2', '3', '5', '6', '7', '8', '9', '4'].map(U);
const chain = ['20261010_1140_app_forms.sql', '20261010_1300_app_participants.sql', '20261010_1700_app_forms_image.sql', '20261024_1800_app_forms_people_label.sql',
  '20261024_1810_app_forms_allow_same_name.sql', '20261025_1300_app_forms_baptism.sql'];
const read = (f) => fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
const ymd = (d) => d.toISOString().slice(0, 10);
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return ymd(d); };
const yearsAgo = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() - n); return d; };
const b8 = (d) => ymd(d).replace(/-/g, '');

async function makeDb(with1700) {
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
    create table public.gyojeok (id bigint generated always as identity primary key, name text, birth date, member_key text, grade text, baptism_date date, phone text, created_at timestamptz default now());
    insert into auth.users values ('${U1}'), ('${U2}'), ('${U3}'), ('${U4}'), ('${U5}'), ('${U6}'), ('${U7}'), ('${U8}'), ('${ADM}');
    insert into public.admins values ('${ADM}');
  `);
  for (const f of chain) await db.exec(read(f));
  if (with1700) await db.exec(read('20261025_1700_baptism_targets.sql'));
  const MIG = read('20261025_1900_baptism_apply_kinds.sql');
  await db.exec(MIG); await db.exec(MIG);
  return db;
}
async function as(db, uid, sql) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { const r = await db.query(sql); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }
  finally { await db.exec('reset role; set session authorization postgres;'); }
}
async function asErr(db, uid, sql) { try { await as(db, uid, sql); return null; } catch (e) { return e.message; } }

// ── 1700 다음에 1900 ──
const db = await makeDb(true);
ok('rerun safe', true);
const kAdult = '테스트_초신자|19900101', kLearn = '테스트_학습교인|19850505', kInf = '테스트_유아세례|' + b8(yearsAgo(16)), kBap = '테스트_세례교인|19700101',
  kKid = '테스트_어린이|' + b8(yearsAgo(10)), kNoReg = '테스트_등록일없음|19950101', kNoGj = '테스트_교적없음|19800101';
await db.exec(`
  insert into public.member_links (user_id, member_key) values ('${U1}', '${kAdult}'), ('${U2}', '${kLearn}'), ('${U3}', '${kInf}'), ('${U4}', '${kBap}'),
    ('${U5}', '${kKid}'), ('${U7}', '${kNoGj}'), ('${U8}', '${kNoReg}');
  insert into public.gyojeok (name, birth, member_key, grade, reg_date, learn_date) values
    ('테스트_초신자', '1990-01-01', '${kAdult}', '원입', '${monthsAgo(7)}', null),
    ('테스트_학습교인', '1985-05-05', '${kLearn}', '학습', '${monthsAgo(30)}', '${monthsAgo(2)}'),
    ('테스트_유아세례', null, '${kInf}', '유아세례', null, null),
    ('테스트_세례교인', '1970-01-01', '${kBap}', '집사', null, null),
    ('테스트_어린이', null, '${kKid}', '', '${monthsAgo(24)}', null),
    ('테스트_등록일없음', '1995-01-01', '${kNoReg}', '', null, null);
`);
let s = await as(db, U1, `select public.app_my_baptism_status()`);
ok('원입 + 등록 7개월 → 학습 ok', s.ok && s.st === 'ok' && s.kind === '학습' && s.grade === '원입' && s.age >= 36, s);
s = await as(db, U2, `select public.app_my_baptism_status()`);
ok('학습 + 2개월 → 세례 wait (from = 학습일+6개월)', s.st === 'wait' && s.kind === '세례' && s.from > ymd(new Date()), s);
s = await as(db, U3, `select public.app_my_baptism_status()`);
ok('유아세례 + 만16세 (키의 생년월일) → 입교 ok', s.st === 'ok' && s.kind === '입교' && s.age === 16, s);
s = await as(db, U4, `select public.app_my_baptism_status()`);
ok('집사 → done', s.st === 'done' && !s.kind, s);
s = await as(db, U5, `select public.app_my_baptism_status()`);
ok('만 10세 원입 → young', s.st === 'young', s);
s = await as(db, U6, `select public.app_my_baptism_status()`);
ok('no link → nolink', s.st === 'nolink', s);
s = await as(db, U7, `select public.app_my_baptism_status()`);
ok('no gyojeok → nogj', s.st === 'nogj', s);
s = await as(db, U8, `select public.app_my_baptism_status()`);
ok('no reg date → check', s.st === 'check' && s.kind === '학습' && /등록일/.test(s.why), s);
ok('anon blocked', !!(await asErr(db, null, `select public.app_my_baptism_status()`)));
ok('only own row (no other names)', !JSON.stringify(await as(db, U1, `select public.app_my_baptism_status()`)).includes('테스트_'));

// 신청: 문답 없는 신청서(문답 칸을 없앤 뒤) — 종류 셋
const fid = (await db.query(`insert into public.app_forms (title, open_at, published, kind, questions) values ('테스트 학습·세례·입교 신청', now() - interval '1 day', true, 'baptism', '[]'::jsonb) returning id`)).rows[0].id;
let r = await as(db, U1, `select public.app_submit_qa(${fid}, '테스트_초신자', '010-0000-0000', '학습', '[]'::jsonb)`);
ok('학습 apply, no questions', r.ok, r);
r = await as(db, U2, `select public.app_submit_qa(${fid}, '테스트_학습교인', '010-0000-0000', '세례', '[]'::jsonb)`);
ok('세례 apply', r.ok, r);
r = await as(db, U3, `select public.app_submit_qa(${fid}, '테스트_유아세례', '010-0000-0000', '입교', '[]'::jsonb)`);
ok('입교 apply', r.ok, r);
r = await as(db, U8, `select public.app_submit_qa(${fid}, '테스트', '010-0000-0000', '세례(입교)', '[]'::jsonb)`);
ok('legacy 세례(입교) still accepted', r.ok, r);
r = await as(db, U4, `select public.app_submit_qa(${fid}, '테스트', '010-0000-0000', '임직', '[]'::jsonb)`);
ok('bad kind rejected', !r.ok && r.why === 'apply', r);
const kinds = (await db.query(`select apply_kind from public.app_entries where form_id = ${fid} order by id`)).rows.map((x) => x.apply_kind);
ok('stored kinds', JSON.stringify(kinds) === JSON.stringify(['학습', '세례', '입교', '세례(입교)']), kinds);

// 담임목사가 정한 대상 종류: 세례 대상 → '세례'·'세례(입교)' 만, 입교 대상 → '입교'
const hash = async (k) => (await db.query(`select public.app_key_hash('${k}') h`)).rows[0].h;
const items = JSON.stringify([{ h: await hash(kLearn), k: '세례' }, { h: await hash(kInf), k: '입교' }, { h: await hash(kAdult), k: '학습' }]);
r = await as(db, ADM, `select public.app_form_set_targets_kind(${fid}, '${items}'::jsonb, '알림')`);
ok('targets set', r.ok && r.n === 3, r);
r = await as(db, U2, `select public.app_submit_qa(${fid}, '테스트_학습교인', '010-0000-0000', '학습', '[]'::jsonb)`);
ok('세례 target cannot apply 학습', !r.ok && r.why === 'kind' && r.kind === '세례' && /‘세례’/.test(r.error), r);
r = await as(db, U2, `select public.app_submit_qa(${fid}, '테스트_학습교인', '010-0000-0000', '입교', '[]'::jsonb)`);
ok('세례 target cannot apply 입교', !r.ok && r.why === 'kind', r);
r = await as(db, U2, `select public.app_submit_qa(${fid}, '테스트_학습교인', '010-0000-0000', '세례', '[]'::jsonb)`);
ok('세례 target applies 세례 (update)', r.ok && r.updated, r);
r = await as(db, U3, `select public.app_submit_qa(${fid}, '테스트_유아세례', '010-0000-0000', '세례(입교)', '[]'::jsonb)`);
ok('입교 target legacy ok', r.ok, r);
r = await as(db, U3, `select public.app_submit_qa(${fid}, '테스트_유아세례', '010-0000-0000', '세례', '[]'::jsonb)`);
ok('입교 target cannot apply 세례', !r.ok && r.why === 'kind', r);
r = await as(db, U5, `select public.app_submit_qa(${fid}, '테스트_어린이', '010-0000-0000', '학습', '[]'::jsonb)`);
ok('non-target blocked', !r.ok && r.why === 'target', r);

// 옛 신청서(문답 있음): [세례] 질문은 세례·입교를 고른 분에게
const fid2 = (await db.query(`insert into public.app_forms (title, open_at, published, kind, questions) values ('옛 양식', now() - interval '1 day', true, 'baptism', '["[학습] 학습 질문", "[세례] 세례 질문"]'::jsonb) returning id`)).rows[0].id;
r = await as(db, U3, `select public.app_submit_qa(${fid2}, '테스트', '010', '입교', '["", ""]'::jsonb)`);
ok('입교 must answer [세례] question', !r.ok && r.why === 'answer' && r.index === 1, r);
r = await as(db, U3, `select public.app_submit_qa(${fid2}, '테스트', '010', '입교', '["무시됨", "입교 답"]'::jsonb)`);
ok('입교 answers [세례] only', r.ok, r);
const a2 = (await db.query(`select answers from public.app_entries where form_id = ${fid2}`)).rows[0].answers;
ok('학습 question skipped for 입교', a2[0] === '' && a2[1] === '입교 답', a2);
r = await as(db, U1, `select public.app_submit_qa(${fid2}, '테스트', '010', '학습', '["학습 답", ""]'::jsonb)`);
ok('학습 skips [세례]', r.ok, r);

// ── 1700 없이 1900 만(순서가 바뀌어도 함수는 돈다 — 날짜 칼럼이 없으면 '확인 필요') ──
const db2 = await makeDb(false);
await db2.exec(`insert into public.member_links (user_id, member_key) values ('${U1}', '${kAdult}'); insert into public.gyojeok (name, birth, member_key, grade) values ('테스트_초신자', '1990-01-01', '${kAdult}', '원입');`);
s = await as(db2, U1, `select public.app_my_baptism_status()`);
ok('without 1700: check (no reg_date column)', s.ok && s.st === 'check' && s.kind === '학습', s);
const fid3 = (await db2.query(`insert into public.app_forms (title, open_at, published, kind, questions) values ('t', now() - interval '1 day', true, 'baptism', '[]'::jsonb) returning id`)).rows[0].id;
r = await as(db2, U1, `select public.app_submit_qa(${fid3}, '테스트', '010', '세례', '[]'::jsonb)`);
ok('without 1700: submit works when no targets', r.ok, r);

console.log(`baptism_apply: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
