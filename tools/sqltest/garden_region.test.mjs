// 신앙 정원 — 내 지역(교적 주소에서 시·군·구·읍면동만) 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node garden_region.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } }

const A = 'aaaaaaaa-0000-4000-8000-000000000001', B = 'aaaaaaaa-0000-4000-8000-000000000002', C = 'aaaaaaaa-0000-4000-8000-000000000003',
      D = 'aaaaaaaa-0000-4000-8000-000000000004', E = 'aaaaaaaa-0000-4000-8000-000000000005', F = 'aaaaaaaa-0000-4000-8000-000000000006', G = 'aaaaaaaa-0000-4000-8000-000000000007';
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  insert into auth.users values ('${A}'), ('${B}'), ('${C}'), ('${D}'), ('${E}'), ('${F}'), ('${G}');
`);
const sql = fs.readFileSync(path.join(ROOT, 'supabase/20261023_2330_garden_region.sql'), 'utf8');

async function as(uid, q) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { const r = await db.query(q); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }
  finally { await db.exec('reset role; set session authorization postgres;'); }
}
async function asErr(uid, q) { try { await as(uid, q); return null; } catch (e) { return e.message; } }

// 1) 교적 표가 없어도 함수는 만들어지고 'none'
await db.exec(sql);
ok('no gyojeok → none', (await as(A, `select public.garden_my_region()`)).why === 'none');
ok('anon cannot call', !!(await asErr(null, `select public.garden_my_region()`)));

// 2) 가짜 교적
await db.exec(`
  create table public.member_links (user_id uuid primary key, member_key text, spouse_key text);
  create table public.gyojeok (member_key text primary key, name text, address text, phone text);
  revoke all on public.member_links, public.gyojeok from anon, authenticated;
  insert into public.gyojeok values
    ('k1', '테스트_가', '경기도 화성시 우정읍 쌍봉로 123, 101동 202호', '010-0000-0001'),
    ('k2', '테스트_나', '경기 수원시 팔달구 행궁동 정조로 825', '010-0000-0002'),
    ('k3', '테스트_다', '서울특별시 강남구 역삼동 테헤란로 152', '010-0000-0003'),
    ('k4', '테스트_라', '', '010-0000-0004'),
    ('k4s', '테스트_라배우자', '충남 아산시 배방읍 (북수리) 배방로 10', '010-0000-0005'),
    ('k6', '테스트_바', '화성시 남양읍 시청로 159', '010-0000-0006'),
    ('k7', '테스트_사', '123번지', '010-0000-0007');
  insert into public.member_links values ('${A}', 'k1', null), ('${B}', 'k2', null), ('${C}', 'k3', null), ('${D}', 'k4', 'k4s'), ('${F}', 'k6', null), ('${G}', 'k7', null);
`);
let r = await as(A, `select public.garden_my_region()`);
ok('A: 경기도 화성시 우정읍', r.ok && r.sido === '경기도' && r.sigungu === '화성시' && r.dong === '우정읍', r);
ok('no street/number/name/phone leaked', !/쌍봉로|123|101동|010|테스트/.test(JSON.stringify(r)), r);
r = await as(B, `select public.garden_my_region()`);
ok('B: 경기 수원시 팔달구 행궁동', r.ok && r.sido === '경기' && r.sigungu === '수원시 팔달구' && r.dong === '행궁동', r);
r = await as(C, `select public.garden_my_region()`);
ok('C: 서울특별시 강남구 역삼동', r.ok && r.sido === '서울특별시' && r.sigungu === '강남구' && r.dong === '역삼동', r);
r = await as(D, `select public.garden_my_region()`);
ok('D: empty own address → spouse row (괄호 지움)', r.ok && r.sido === '충남' && r.sigungu === '아산시' && r.dong === '배방읍', r);
ok('E: no link → none', (await as(E, `select public.garden_my_region()`)).why === 'none');
r = await as(F, `select public.garden_my_region()`);
ok('F: 시도 없이 화성시 남양읍', r.ok && r.sido === null && r.sigungu === '화성시' && r.dong === '남양읍', r);
ok('G: unparsable → parse', (await as(G, `select public.garden_my_region()`)).why === 'parse');
ok('direct table read still blocked', !!(await asErr(A, `select count(*) from public.gyojeok`)));

// 3) 다시 실행해도 안전
await db.exec(sql);
ok('rerun safe', (await as(A, `select public.garden_my_region()`)).dong === '우정읍');

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
