// 학습·세례(입교) 신청 대상 — 종류·알림 문구·교적 등록일/학습일(20261025_1700) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node baptism_targets.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } }
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', U3 = '33333333-3333-4333-8333-333333333333',
  U4 = '55555555-5555-4555-8555-555555555555', ADM = '44444444-4444-4444-8444-444444444444';
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
  insert into auth.users values ('${U1}'), ('${U2}'), ('${U3}'), ('${U4}'), ('${ADM}');
  insert into public.admins values ('${ADM}');
  insert into public.member_links (user_id, member_key) values ('${U1}', '테스트_초신자|19900101'), ('${U2}', '테스트_학습교인|19850505'), ('${U3}', '테스트_유아세례|20100101'), ('${U4}', '테스트_비대상|19700101');
  insert into public.gyojeok (name, birth, member_key, grade) values ('테스트_초신자', '1990-01-01', '테스트_초신자|19900101', '원입');
`);
const chain = ['20261010_1140_app_forms.sql', '20261010_1300_app_participants.sql', '20261010_1700_app_forms_image.sql', '20261024_1800_app_forms_people_label.sql',
  '20261024_1810_app_forms_allow_same_name.sql', '20261025_1300_app_forms_baptism.sql'];
for (const f of chain) await db.exec(fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8'));
const MIG = fs.readFileSync(path.join(ROOT, 'supabase/20261025_1700_baptism_targets.sql'), 'utf8');
await db.exec(MIG);
await db.exec(MIG);
ok('rerun safe', true);

async function as(uid, sql) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { const r = await db.query(sql); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }
  finally { await db.exec('reset role; set session authorization postgres;'); }
}
async function asErr(uid, sql) { try { await as(uid, sql); return null; } catch (e) { return e.message; } }
const pg = async (sql) => (await db.query(sql)).rows;
const hash = async (k) => (await pg(`select public.app_key_hash('${k}') h`))[0].h;

// 교적 칼럼
const cols = (await pg(`select column_name from information_schema.columns where table_name = 'gyojeok' and column_name in ('reg_date','learn_date')`)).map((r) => r.column_name).sort();
ok('gyojeok reg_date/learn_date', JSON.stringify(cols) === '["learn_date","reg_date"]', cols);
let kerr = null; try { await pg(`insert into public.app_form_targets (form_id, key_hash, kind) values (1, '0123456789abcdef', '임직')`); } catch (e) { kerr = e.message; }
ok('kind check constraint', /app_form_targets_kind_chk|violates/.test(kerr || ''), kerr);

// 학습·세례 신청서 하나(공개·신청 기간), 문답 2개(학습용 1·세례용 1)
const fid = (await pg(`insert into public.app_forms (title, open_at, published, kind, questions) values ('테스트 학습·세례 신청', now() - interval '1 day', true, 'baptism', '["[학습] 학습 질문", "[세례] 세례 질문"]'::jsonb) returning id`))[0].id;
const H1 = await hash('테스트_초신자|19900101'), H2 = await hash('테스트_학습교인|19850505'), H3 = await hash('테스트_유아세례|20100101');
const items = JSON.stringify([{ h: H1, k: '학습' }, { h: H2, k: '세례' }, { h: H3, k: '입교' }, { h: 'bad', k: '학습' }, { h: H1, k: '학습' }, { h: 'ffffffffffffffff', k: '임직' }]);
let r = await as(U1, `select public.app_form_set_targets_kind(${fid}, '${items}'::jsonb, '알림')`);
ok('member cannot set targets', !r.ok && r.why === 'admin', r);
r = await as(ADM, `select public.app_form_set_targets_kind(${fid}, '${items}'::jsonb, '  담임목사입니다. 이번 부활절에 신청해 주십시오.  ')`);
ok('admin sets targets by kind', r.ok && r.n === 3 && r.learn === 1 && r.baptism === 1 && r.confirm === 1, r);
ok('note saved trimmed', (await pg(`select target_note from public.app_forms where id = ${fid}`))[0].target_note === '담임목사입니다. 이번 부활절에 신청해 주십시오.');
ok('not a baptism form', (await as(ADM, `select public.app_form_set_targets_kind(999, '[]'::jsonb, null)`)).why === 'form');

// 내 대상 정보
let info = await as(U1, `select public.app_my_target_info()`);
ok('my info (학습)', info.length === 1 && info[0].form_id == fid && info[0].kind === '학습' && /부활절/.test(info[0].note) && info[0].title === '테스트 학습·세례 신청', info);
info = await as(U3, `select public.app_my_target_info()`);
ok('my info (입교)', info.length === 1 && info[0].kind === '입교', info);
ok('non-target empty', JSON.stringify(await as(U4, `select public.app_my_target_info()`)) === '[]');
ok('old app_my_targets still works', JSON.stringify(await as(U2, `select public.app_my_targets()`)) === `[${fid}]`);
ok('anon blocked', !!(await asErr(null, `select public.app_my_target_info()`)));

// 신청 — 종류가 맞아야
const ans = (a, b) => `'${JSON.stringify([a, b])}'::jsonb`;
r = await as(U1, `select public.app_submit_qa(${fid}, '테스트_초신자', '010-0000-0000', '세례(입교)', ${ans('', '답')})`);
ok('학습 target cannot apply 세례', !r.ok && r.why === 'kind' && r.kind === '학습', r);
r = await as(U1, `select public.app_submit_qa(${fid}, '테스트_초신자', '010-0000-0000', '학습', ${ans('학습 답', '')})`);
ok('학습 target applies 학습', r.ok && !r.updated, r);
r = await as(U3, `select public.app_submit_qa(${fid}, '테스트_유아세례', '010-0000-0000', '학습', ${ans('답', '')})`);
ok('입교 target cannot apply 학습', !r.ok && r.why === 'kind', r);
r = await as(U3, `select public.app_submit_qa(${fid}, '테스트_유아세례', '010-0000-0000', '세례(입교)', ${ans('', '세례 답')})`);
ok('입교 target applies 세례(입교)', r.ok, r);
r = await as(U4, `select public.app_submit_qa(${fid}, '테스트_비대상', '010-0000-0000', '학습', ${ans('답', '')})`);
ok('non-target blocked', !r.ok && r.why === 'target', r);
const ent = await pg(`select apply_kind, answers from public.app_entries where form_id = ${fid} order by id`);
ok('entries stored', ent.length === 2 && ent[0].apply_kind === '학습' && ent[0].answers[1] === '' && ent[1].apply_kind === '세례(입교)', ent);

// 다시 확정: 이전 대상은 비활성(지우지 않음), 종류 없는 옛 방식도 된다
r = await as(ADM, `select public.app_form_set_targets_kind(${fid}, '${JSON.stringify([{ h: H2, k: '세례' }])}'::jsonb, '')`);
ok('re-confirm', r.ok && r.n === 1, r);
ok('old rows kept inactive', (await pg(`select count(*)::int n from public.app_form_targets where form_id = ${fid} and not active`))[0].n === 2);
ok('note cleared', (await pg(`select target_note from public.app_forms where id = ${fid}`))[0].target_note === null);
ok('U1 no longer target', JSON.stringify(await as(U1, `select public.app_my_target_info()`)) === '[]');
r = await as(ADM, `select public.app_form_set_targets(${fid}, array['${H1}'])`);
ok('old set_targets still works (kind cleared? kept as given)', r.ok, r);
r = await as(U1, `select public.app_submit_qa(${fid}, '테스트_초신자', '010-0000-0000', '세례(입교)', ${ans('', '답')})`);
const k1 = (await pg(`select kind from public.app_form_targets where form_id = ${fid} and key_hash = '${H1}'`))[0].kind;
ok('old-style target follows stored kind', (k1 === null && r.ok) || (k1 === '학습' && r.why === 'kind'), { k1, r });

// 비공개·마감 신청서는 안내하지 않음
await pg(`update public.app_forms set close_at = now() - interval '1 minute' where id = ${fid}`);
ok('closed form hidden', JSON.stringify(await as(U2, `select public.app_my_target_info()`)) === '[]');

console.log(`baptism_targets: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
