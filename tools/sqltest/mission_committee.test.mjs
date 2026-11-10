// 구제선교위원회(20261110_1900) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해
//   node mission_committee.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
const sql = fs.readFileSync(path.join(ROOT, 'supabase/20261110_1900_mission_committee.sql'), 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } }

const ADM = '44444444-4444-4444-8444-444444444444', FIN = '22222222-2222-4222-8222-222222222222',
  MEM = '11111111-1111-4111-8111-111111111111', NON = '33333333-3333-4333-8333-333333333333',
  SPO = '66666666-6666-4666-8666-666666666666', OUT = '55555555-5555-4555-8555-555555555555';

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
  create table public.member_links (user_id uuid primary key, member_key text, spouse_key text, can_finance boolean default false);
`);
// 저장소의 실제 SQL: 헌금 표·is_finance·my_member_keys, 설정 표
await db.exec(fs.readFileSync(path.join(ROOT, 'supabase/offerings.sql'), 'utf8'));
await db.exec(fs.readFileSync(path.join(ROOT, 'supabase/app_settings.sql'), 'utf8'));
await db.exec(`
  insert into auth.users values ('${ADM}'), ('${FIN}'), ('${MEM}'), ('${NON}'), ('${SPO}'), ('${OUT}');
  insert into public.admins values ('${ADM}');
  insert into public.member_links (user_id, member_key, spouse_key, can_finance) values
    ('${FIN}', '테스트_재정|19700101', null, true),
    ('${MEM}', '테스트_가|19800101', null, false),
    ('${NON}', '테스트_나|19810101', null, false),
    ('${SPO}', '테스트_배우자|19820101', '테스트_다|19830101', false),
    ('${OUT}', '', null, false);
  -- 2026년도 회기 = 2025-12-01 ~ 2026-11-30
  insert into public.offerings (offer_date, category, giver, member_key, amount) values
    ('2025-12-01', '선교헌금', '테스트_가', '테스트_가|19800101', 10000),     -- 회기 첫날 → 포함
    ('2026-03-08', '선교헌금', '테스트_가', '테스트_가|19800101', 10000),     -- 같은 사람 두 번째 → 1명·2회
    ('2026-11-30', '선교헌금', '테스트_다', '테스트_다|19830101', 20000),     -- 회기 마지막 날 → 포함
    ('2025-11-30', '선교헌금', '테스트_나', '테스트_나|19810101', 30000),     -- 앞 회기 → 2026 에는 제외
    ('2026-12-01', '선교헌금', '테스트_나', '테스트_나|19810101', 30000),     -- 다음 회기 → 제외
    ('2026-05-03', '십일조',   '테스트_나', '테스트_나|19810101', 500000),    -- 다른 항목 → 제외
    ('2026-06-07', '선교헌금', '테스트_미연결', '', 5000),                    -- 교적 미연결 → 이름으로 1명
    ('2026-07-05', '선교헌금', ' 테스트_미연결 ', null, 5000),                -- 같은 이름(공백) → 같은 사람
    ('2026-06-07', '선교헌금', '무명', '', 7000),                             -- 무명 → 제외
    ('2026-06-14', '선교헌금', '', null, 7000),                               -- 이름 없음 → 제외
    ('2026-08-02', '선교헌금', '테스트_영원', '테스트_영원|19900101', 0);     -- 0원 → 제외
`);

ok('파괴적 구문 없음', !/\b(drop\s+(table|column)|delete\s+from|truncate)\b/i.test(sql.replace(/--.*$/gm, '')));

const as = async (role, uid) => { await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${role};`); };
const back = async () => { await db.exec(`reset role; set session authorization postgres;`); };
const call = async (role, uid, y) => { await as(role, uid); try { return (await db.query(`select public.mission_committee(${y == null ? 'null' : y}) as r`)).rows[0].r; } finally { await back(); } };
const fails = async (role, uid, q) => { await as(role, uid); try { await db.query(q); return false; } catch (e) { return String(e.message); } finally { await back(); } };
const runs = async (role, uid, q) => { await as(role, uid); try { return (await db.query(q)).rows; } finally { await back(); } };

for (let run = 1; run <= 2; run++) {
  await db.exec(sql);
  const T = `run${run} `;

  // 처음 넣는 후원 교회 4곳 — 두 번 실행해도 4
  ok(T + '후원처 4곳(두 번째 실행에도 더 넣지 않음)', (await db.query('select count(*)::int n from public.mission_partners')).rows[0].n === (run === 1 ? 4 : 6));

  // ── 회기 범위 ──
  const fy = (await db.query('select * from public.mission_fy(2026)')).rows[0];
  ok(T + '2026년도 = 2025-12-01~2026-11-30', String(fy.d_from.toISOString ? fy.d_from.toISOString().slice(0, 10) : fy.d_from).slice(0, 10) >= '2025-11-30' && fy.fy === 2026, fy);
  const fyT = (await db.query(`select d_from::text f, d_to::text t from public.mission_fy(2026)`)).rows[0];
  ok(T + '회기 날짜 글자', fyT.f === '2025-12-01' && fyT.t === '2026-11-30', fyT);
  ok(T + 'mission_fy 는 바깥에서 못 부름', !!(await fails('authenticated', MEM, 'select * from public.mission_fy(2026)')));

  // ── 기본 공개 범위(count) ──
  const an = await call('anon', '', 2026);
  ok(T + '비로그인: 회원 수 3', an.count === 3 && an.visibility === 'count' && an.year === 2026 && an.from === '2025-12-01' && an.to === '2026-11-30', an);
  ok(T + '비로그인: 명단·내역·본인 없음', an.names === null && an.detail === null && an.me === null && an.staff === false, an);
  const me = await call('authenticated', MEM, 2026);
  ok(T + '회원 본인: me=true, 명단 없음', me.me === true && me.names === null && me.detail === null && me.count === 3, me);
  const non = await call('authenticated', NON, 2026);
  ok(T + '안 낸 사람: me=false', non.me === false && non.names === null, non);
  const spo = await call('authenticated', SPO, 2026);
  ok(T + '배우자가 낸 경우: me=true', spo.me === true, spo);
  const out = await call('authenticated', OUT, 2026);
  ok(T + '교적 미연결 계정: me=false', out.me === false && out.names === null, out);
  const fin = await call('authenticated', FIN, 2026);
  ok(T + '재정 담당: 명단·횟수', fin.staff === true && Array.isArray(fin.detail) && fin.detail.length === 3, fin);
  const ga = fin.detail.find((d) => d.name === '테스트_가'), un = fin.detail.find((d) => d.name === '테스트_미연결');
  ok(T + '같은 사람 두 번 = 1명·2회', ga && ga.cnt === 2 && ga.linked === true, fin.detail);
  ok(T + '미연결은 이름으로 1명·2회', un && un.cnt === 2 && un.linked === false, fin.detail);
  ok(T + '무명·0원·다른 항목 제외', !fin.detail.some((d) => /무명|영원|나$/.test(d.name)), fin.detail);
  ok(T + '금액은 어디에도 없음', !/amount|10000|20000|5000|500000/.test(JSON.stringify(fin)), fin);
  const adm = await call('authenticated', ADM, 2026);
  ok(T + '관리자: 명단 3', adm.staff === true && adm.names.length === 3 && adm.me === false, adm);

  // ── 다른 회기 ──
  ok(T + '2025년도: 1명(11/30)', (await call('anon', '', 2025)).count === 1);
  ok(T + '2027년도: 1명(12/1)', (await call('anon', '', 2027)).count === 1);
  const cur = await call('anon', '', null);
  ok(T + '연도 없이 부르면 오늘의 회기', Number.isInteger(cur.year) && cur.from.slice(5) === '12-01' && cur.to.slice(5) === '11-30' && Number(cur.to.slice(0, 4)) === cur.year, cur);

  // ── 공개 범위 바꾸기 ──
  ok(T + '일반 성도는 공개 범위 못 바꿈', /관리자만/.test(await fails('authenticated', MEM, `select public.mission_set_visibility('names')`)));
  ok(T + '재정 담당(관리자 아님)도 못 바꿈', /관리자만/.test(await fails('authenticated', FIN, `select public.mission_set_visibility('names')`)));
  ok(T + '비로그인은 함수 권한 없음', !!(await fails('anon', '', `select public.mission_set_visibility('names')`)));
  ok(T + '잘못된 값 거절', /가운데 하나/.test(await fails('authenticated', ADM, `select public.mission_set_visibility('everyone')`)));

  await runs('authenticated', ADM, `select public.mission_set_visibility('names')`);
  const n1 = await call('authenticated', NON, 2026);
  ok(T + 'names: 교적 연결 성도에게 이름만', Array.isArray(n1.names) && n1.names.length === 3 && n1.detail === null, n1);
  const n2 = await call('authenticated', OUT, 2026);
  ok(T + 'names: 교적 미연결 계정에는 이름 없음', n2.names === null && n2.count === 3, n2);
  const n3 = await call('anon', '', 2026);
  ok(T + 'names: 비로그인에는 이름 없음', n3.names === null && n3.count === 3, n3);

  await runs('authenticated', ADM, `select public.mission_set_visibility('admin')`);
  const a1 = await call('authenticated', MEM, 2026);
  ok(T + 'admin: 성도에게 회원 수도 없음, 본인 여부만', a1.count === null && a1.names === null && a1.me === true, a1);
  ok(T + 'admin: 비로그인 회원 수 없음', (await call('anon', '', 2026)).count === null);
  ok(T + 'admin: 재정 담당은 그대로 봄', (await call('authenticated', FIN, 2026)).count === 3);
  await runs('authenticated', ADM, `select public.mission_set_visibility('count')`);
  ok(T + '설정 줄은 하나', (await db.query(`select count(*)::int n from public.app_settings where key = 'mission_member_visibility'`)).rows[0].n === 1);

  // ── 회계 시작 월을 바꾸면 회기도 따라감 ──
  await db.exec(`insert into public.app_settings (key, value) values ('fy_start_month', '1') on conflict (key) do update set value = '1';`);
  const j = (await db.query(`select d_from::text f, d_to::text t from public.mission_fy(2026)`)).rows[0];
  ok(T + '1월 시작이면 2026-01-01~12-31', j.f === '2026-01-01' && j.t === '2026-12-31', j);
  await db.exec(`update public.app_settings set value = '3' where key = 'fy_start_month';`);
  const k = (await db.query(`select d_from::text f, d_to::text t from public.mission_fy(2024)`)).rows[0];
  ok(T + '3월 시작이면 2024-03-01~2025-02-28', k.f === '2024-03-01' && k.t === '2025-02-28', k);
  await db.exec(`update public.app_settings set value = '12' where key = 'fy_start_month';`);

  // ── 게시판·후원처 권한(RLS) ──
  ok(T + '성도는 사역 글 못 씀', !!(await fails('authenticated', MEM, `insert into public.mission_posts (fy_year, title) values (2026, '테스트_글')`)));
  ok(T + '비로그인도 못 씀', !!(await fails('anon', '', `insert into public.mission_posts (fy_year, title) values (2026, '테스트_글')`)));
  await runs('authenticated', ADM, `insert into public.mission_posts (fy_year, title, body, event_date) values (2026, '테스트_사역 ${run}', '테스트 내용', '2026-04-05')`);
  await runs('authenticated', ADM, `insert into public.mission_posts (fy_year, title, hidden) values (2026, '테스트_숨긴 글 ${run}', true)`);
  ok(T + '비로그인: 숨긴 글 안 보임', (await runs('anon', '', `select * from public.mission_posts`)).length === run);
  ok(T + '관리자: 숨긴 글도 보임', (await runs('authenticated', ADM, `select * from public.mission_posts`)).length === run * 2);
  ok(T + '성도는 글 못 고침(0줄)', (await runs('authenticated', MEM, `update public.mission_posts set title = '바꿈' returning id`)).length === 0);
  ok(T + '글 지우기는 관리자도 안 됨(지우는 정책 없음 → 0줄)', (await runs('authenticated', ADM, `delete from public.mission_posts returning id`)).length === 0
    && (await db.query('select count(*)::int n from public.mission_posts')).rows[0].n === run * 2);

  ok(T + '성도는 후원처 못 넣음', !!(await fails('authenticated', MEM, `insert into public.mission_partners (name) values ('테스트_교회')`)));
  ok(T + '후원처 구분은 교회·기관만', !!(await fails('authenticated', ADM, `insert into public.mission_partners (kind, name) values ('개인', '테스트')`)));
  if (run === 1) await runs('authenticated', ADM, `insert into public.mission_partners (kind, name, active) values ('기관', '테스트_기관', true), ('기관', '테스트_끝난 기관', false)`);
  ok(T + '비로그인: 숨긴 후원처 안 보임', (await runs('anon', '', `select * from public.mission_partners`)).length === 5);
  ok(T + '관리자: 숨긴 후원처도 보임', (await runs('authenticated', ADM, `select * from public.mission_partners`)).length === 6);
  ok(T + '성도는 헌금 표를 직접 못 봄(자기 것만)', (await runs('authenticated', NON, `select * from public.offerings`)).every((r) => r.member_key === '테스트_나|19810101'));
}

console.log(`pass ${pass} / fail ${fail}`);
process.exit(fail ? 1 : 0);
