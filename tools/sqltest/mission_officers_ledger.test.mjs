// 구제선교위원회 임원·일정·회계 장부(20261113_1200) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해
//   node mission_officers_ledger.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
const rd = (f) => fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
const sql = rd('20261113_1200_mission_officers_ledger.sql');
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } }

const ADM = '44444444-4444-4444-8444-444444444444', FIN = '22222222-2222-4222-8222-222222222222',
  SEC = '11111111-1111-4111-8111-111111111111', TRE = '33333333-3333-4333-8333-333333333333',
  MEM = '66666666-6666-4666-8666-666666666666', OUT = '55555555-5555-4555-8555-555555555555';

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
await db.exec(rd('offerings.sql'));
await db.exec(rd('app_settings.sql'));
for (const f of ['20261110_1900_mission_committee.sql', '20261112_1930_mission_members_logo.sql', '20261112_2000_mission_report.sql', '20261112_2100_mission_report_doc.sql']) await db.exec(rd(f));
await db.exec(`
  insert into auth.users values ('${ADM}'), ('${FIN}'), ('${SEC}'), ('${TRE}'), ('${MEM}'), ('${OUT}');
  insert into public.admins values ('${ADM}');
  insert into public.member_links (user_id, member_key, can_finance) values
    ('${FIN}', '테스트_재정|19700101', true), ('${SEC}', '테스트_서기|19800101', false),
    ('${TRE}', '테스트_회계|19810101', false), ('${MEM}', '테스트_회원|19820101', false), ('${OUT}', '', false);
  insert into public.offerings (offer_date, category, giver, member_key, amount) values
    ('2026-03-08', '선교헌금', '테스트_회원', '테스트_회원|19820101', 10000),
    ('2026-12-06', '선교헌금', '테스트_서기', '테스트_서기|19800101', 10000);
  insert into public.app_settings (key, value) values ('mission_report_2026', '{"title":"테스트_올려 둔 보고서","summary":[{"label":"잔액","amount":1}]}');
  insert into public.mission_posts (fy_year, title) values (2026, '테스트_예전 글');
`);

ok('파괴적 구문 없음', !/\b(drop\s+(table|column)|delete\s+from|truncate)\b/i.test(sql.replace(/--.*$/gm, '')));

const as = async (role, uid) => { await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${role};`); };
const back = async () => { await db.exec(`reset role; set session authorization postgres;`); };
const runs = async (role, uid, q) => { await as(role, uid); try { return (await db.query(q)).rows; } finally { await back(); } };
const fails = async (role, uid, q) => { await as(role, uid); try { await db.query(q); return false; } catch (e) { return String(e.message); } finally { await back(); } };
const one = async (role, uid, q) => (await runs(role, uid, q))[0].r;

for (let run = 1; run <= 2; run++) {
  await db.exec(sql);
  const T = `run${run} `;

  // ── 예전 글은 '활동' ──
  ok(T + '예전 글 kind=활동', (await db.query(`select kind from public.mission_posts where title = '테스트_예전 글'`)).rows[0].kind === '활동');

  // ── 임원: 관리자만 정한다 ──
  ok(T + '성도는 임원 못 넣음', !!(await fails('authenticated', SEC, `insert into public.mission_officers (fy_year, role, name) values (2026, '서기', '테스트')`)));
  ok(T + '비로그인은 임원 표 못 읽음', !!(await fails('anon', '', `select * from public.mission_officers`)));
  ok(T + '성도는 임원 표 0줄(교적 키 안 보임)', (await runs('authenticated', MEM, `select * from public.mission_officers`)).length === 0);
  ok(T + '없는 직책 거절', !!(await fails('authenticated', ADM, `insert into public.mission_officers (fy_year, role, name) values (2026, '총무', '테스트')`)));
  if (run === 1) await runs('authenticated', ADM, `insert into public.mission_officers (fy_year, role, name, member_key) values
    (2026, '위원장', '테스트_위원장', ''), (2026, '서기', '테스트_서기', '테스트_서기|19800101'), (2026, '회계', '테스트_회계', '테스트_회계|19810101'),
    (2027, '회계', '테스트_새회계', '테스트_회원|19820101')`);
  const ol = await one('anon', '', `select public.mission_officer_list(2026) r`);
  ok(T + '임원 이름은 누구나(순서: 위원장·서기·회계)', ol.length === 3 && ol[0].role === '위원장' && ol[2].role === '회계' && !JSON.stringify(ol).includes('1980'), ol);

  // ── 권한 자동 부여 ──
  const can = async (uid, role, y) => one('authenticated', uid, `select public.mission_can('${role}', ${y}) r`);
  ok(T + '서기 권한(2026)', await can(SEC, '서기', 2026) === true);
  ok(T + '서기는 회계 권한 없음', await can(SEC, '회계', 2026) === false);
  ok(T + '서기는 2027 권한 없음', await can(SEC, '서기', 2027) === false);
  ok(T + '회계 권한(2026)', await can(TRE, '회계', 2026) === true);
  ok(T + '2027 회계는 2026 권한 없음', await can(MEM, '회계', 2026) === false && await can(MEM, '회계', 2027) === true);
  ok(T + '관리자는 모든 권한', await can(ADM, '서기', 2030) === true && await can(ADM, '회계', 2026) === true);
  ok(T + '교적 미연결 계정은 권한 없음(빈 키끼리 맞지 않음)', await can(OUT, '위원장', 2026) === false);
  ok(T + '비로그인은 mission_can 못 부름', !!(await fails('anon', '', `select public.mission_can('서기', 2026)`)));

  // ── 화면 첫 읽기 ──
  const hm = await one('anon', '', `select public.mission_home() r`);
  ok(T + 'home: 회기 목록은 2026부터 지금 회기까지', hm.years[hm.years.length - 1] === 2026 && hm.years[0] === hm.current && hm.my.admin === false && hm.my.roles.length === 0, hm);
  const hs = await one('authenticated', SEC, `select public.mission_home() r`);
  ok(T + 'home: 내 직책', hs.my.roles.length === 1 && hs.my.roles[0].role === '서기' && hs.my.roles[0].year === 2026, hs);
  ok(T + 'home: 관리자', (await one('authenticated', ADM, `select public.mission_home() r`)).my.admin === true);

  // ── 서기: 활동·동향·일정 ──
  await runs('authenticated', SEC, `insert into public.mission_posts (fy_year, title, kind) values (2026, '테스트_동향 ${run}', '동향')`);
  ok(T + '서기는 다른 회기 글 못 씀', !!(await fails('authenticated', SEC, `insert into public.mission_posts (fy_year, title) values (2027, '테스트')`)));
  ok(T + '회계는 글 못 씀', !!(await fails('authenticated', TRE, `insert into public.mission_posts (fy_year, title) values (2026, '테스트')`)));
  ok(T + '없는 글 종류 거절', !!(await fails('authenticated', SEC, `insert into public.mission_posts (fy_year, title, kind) values (2026, '테스트', '공지')`)));
  ok(T + '서기가 글 고침', (await runs('authenticated', SEC, `update public.mission_posts set body = '고침' where title = '테스트_동향 ${run}' returning id`)).length === 1);
  ok(T + '서기는 글을 다른 회기로 못 옮김', !!(await fails('authenticated', SEC, `update public.mission_posts set fy_year = 2027 where title = '테스트_동향 ${run}'`)));
  await runs('authenticated', SEC, `insert into public.mission_events (fy_year, event_date, title) values (2026, '2026-04-05', '테스트_일정 ${run}'), (2026, '2026-05-05', '테스트_숨긴 일정 ${run}')`);
  await runs('authenticated', SEC, `update public.mission_events set hidden = true where title = '테스트_숨긴 일정 ${run}'`);
  ok(T + '일정: 누구나 보되 숨긴 것은 안 보임', (await runs('anon', '', `select * from public.mission_events`)).length === run);
  ok(T + '일정: 서기는 숨긴 것도 봄', (await runs('authenticated', SEC, `select * from public.mission_events`)).length === run * 2);
  ok(T + '일정: 성도는 못 씀', !!(await fails('authenticated', MEM, `insert into public.mission_events (fy_year, event_date, title) values (2026, '2026-04-05', '테스트')`)));

  // ── 회계 보고: 장부가 비어 있으면 올려 둔 보고서 ──
  if (run === 1) {
    const r0 = await one('authenticated', MEM, `select public.mission_report(2026) r`);
    ok(T + '장부 없음 → 올려 둔 보고서 그대로', r0.source === 'doc' && r0.doc.title === '테스트_올려 둔 보고서', r0);
    ok(T + '2027 장부·보고서 없음 → doc null', (await one('authenticated', ADM, `select public.mission_report(2027) r`)).doc === null);
  }

  // ── 회계: 장부 ──
  ok(T + '서기는 장부 못 씀', !!(await fails('authenticated', SEC, `insert into public.mission_ledger (fy_year, entry_date, kind, amount) values (2026, '2026-01-01', '수입', 1)`)));
  ok(T + '성도는 장부 0줄', (await runs('authenticated', MEM, `select * from public.mission_ledger`)).length === 0);
  ok(T + '비로그인은 장부 권한 없음', !!(await fails('anon', '', `select * from public.mission_ledger`)));
  ok(T + '회계는 다른 회기 장부 못 씀', !!(await fails('authenticated', TRE, `insert into public.mission_ledger (fy_year, entry_date, kind, amount) values (2027, '2026-12-01', '수입', 1)`)));
  ok(T + '0원·음수 거절', !!(await fails('authenticated', TRE, `insert into public.mission_ledger (fy_year, entry_date, kind, amount) values (2026, '2026-01-01', '수입', 0)`)));
  if (run === 1) {
    await runs('authenticated', TRE, `insert into public.mission_books (fy_year, opening_balance) values (2026, 1000)`);
    await runs('authenticated', TRE, `insert into public.mission_ledger (fy_year, entry_date, kind, category, content, amount, src, dedupe) values
      (2026, '2025-11-15', '지출', '정기이체 · 테스트교회', '테스트교회', 300, 'excel', 'a1'),
      (2026, '2025-11-16', '수입', '회비', '테스트_이름', 500, 'excel', 'a2'),
      (2026, '2025-12-05', '수입', '회비', '테스트_이름2', 200, 'excel', 'a3'),
      (2026, '2025-12-05', '지출', '심방비', '', 50, 'manual', null),
      (2026, '2026-01-10', '수입', '예금이자', '', 7, 'manual', null),
      (2026, '2026-01-11', '지출', '잘못 넣은 줄', '', 9999, 'manual', null)`);
    await runs('authenticated', TRE, `update public.mission_ledger set hidden = true where category = '잘못 넣은 줄'`);
  }
  ok(T + '같은 지문은 두 번 못 들어감', /duplicate|unique/i.test(await fails('authenticated', TRE, `insert into public.mission_ledger (fy_year, entry_date, kind, amount, src, dedupe) values (2026, '2025-11-15', '지출', 300, 'excel', 'a1')`)));
  ok(T + '재정 담당도 장부를 봄', (await runs('authenticated', FIN, `select * from public.mission_ledger where fy_year = 2026`)).length === 6);

  const rp = await one('authenticated', MEM, `select public.mission_report(2026) r`);
  const d = rp.doc, S = Object.fromEntries(d.summary.map((x) => [x.label, x.amount]));
  ok(T + '장부 있음 → 장부에서 계산', rp.source === 'ledger' && d.title === '2026 구제선교위원회 회계 보고서', rp);
  ok(T + '총괄(숨긴 줄 빼고)', S['시작 잔액'] === 1000 && S['기간 수입'] === 707 && S['기간 지출'] === 350 && S['기간 수지'] === 357 && S['잔액'] === 1357, S);
  ok(T + '월별 잔액 이어 달리기', d.monthly.length === 3 && d.monthly[0].ym === '2025-11' && d.monthly[0].balance === 1200 && d.monthly[1].balance === 1350 && d.monthly[2].balance === 1357, d.monthly);
  ok(T + '날짜별: 같은 날 수입·지출 합침', d.daily.length === 4 && d.daily[2].date === '2025-12-05' && d.daily[2].income === 200 && d.daily[2].spend === 50 && d.daily[2].balance === 1350, d.daily);
  const fee = d.items.find((x) => x.label === '회비');
  ok(T + '항목별 금액·건수', d.items.length === 4 && fee.income === 700 && fee.n === 2, d.items);
  ok(T + '보고 기간 = 첫 거래~마지막 거래', d.period.from === '2025-11-15' && d.period.to === '2026-01-10', d.period);
  ok(T + '머리말 임원: 위원장·회계', d.officers === '위원장 테스트_위원장\n회계 테스트_회계', d.officers);
  ok(T + '보고서에 거래 내용(이름)은 없음', !JSON.stringify(rp).includes('테스트_이름'));
  ok(T + '서기(임원)도 보고서를 봄', (await one('authenticated', SEC, `select public.mission_report(2026) r`)) !== null);
  ok(T + '회원 아닌 계정은 보고서 없음', (await one('authenticated', OUT, `select public.mission_report(2026) r`)) === null);
  ok(T + '비로그인은 보고서 함수 권한 없음', !!(await fails('anon', '', `select public.mission_report(2026)`)));

  // ── 분류 규칙 ──
  ok(T + '서기는 규칙 못 씀', !!(await fails('authenticated', SEC, `insert into public.mission_ledger_rules (keyword, category) values ('테스트', '테스트')`)));
  if (run === 1) await runs('authenticated', TRE, `insert into public.mission_ledger_rules (keyword, category) values ('테스트교회', '정기이체 · 테스트교회')`);
  ok(T + '회계는 규칙을 봄', (await runs('authenticated', TRE, `select * from public.mission_ledger_rules`)).length === 1);
  ok(T + '성도는 규칙 0줄', (await runs('authenticated', MEM, `select * from public.mission_ledger_rules`)).length === 0);

  // ── 회원 집계는 그대로(회기만 바꿔 부름) ──
  ok(T + '2026 회원 1명 · 2027 회원 1명', (await one('anon', '', `select public.mission_committee(2026) r`)).count === 1 && (await one('anon', '', `select public.mission_committee(2027) r`)).count === 1);
}

console.log(`pass ${pass} / fail ${fail}`);
process.exit(fail ? 1 : 0);
