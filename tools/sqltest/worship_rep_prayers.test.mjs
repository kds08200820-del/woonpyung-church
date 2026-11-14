// 주일 낮 예배 대표기도문(20261114_0930) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@latest 후 이 파일을 그 폴더로 복사해
//   node worship_rep_prayers.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
const sql = fs.readFileSync(path.join(ROOT, 'supabase/20261114_0930_worship_rep_prayers.sql'), 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } }

const ADM = '44444444-4444-4444-8444-444444444444', GA = '11111111-1111-4111-8111-111111111111',
  NA = '22222222-2222-4222-8222-222222222222', JANG = '33333333-3333-4333-8333-333333333333', OUT = '55555555-5555-4555-8555-555555555555';

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  create table public.admins (uid uuid primary key);
  create table public.member_links (user_id uuid primary key, member_key text, member_name text);
  create table public.sermons (id serial primary key, sermon_date date, service text, title text, scripture text, created_at timestamptz default now());
`);
await db.exec(fs.readFileSync(path.join(ROOT, 'supabase/church_settings.sql'), 'utf8'));

// 앞으로의 주일(서울 날짜 기준) — 함수와 같은 셈으로 '몇째 주'를 만든다
const today = (await db.query(`select (now() at time zone 'Asia/Seoul')::date::text d`)).rows[0].d;
const sundays = (await db.query(`select (d::date)::text d, (d::date - '${today}'::date) k from generate_series('${today}'::date, '${today}'::date + 80, interval '1 day') d where extract(dow from d) = 0 order by d`)).rows;
const nthOf = (d) => Math.floor((Number(d.slice(8, 10)) - 1) / 7) + 1;
const inWin = sundays.filter((r) => r.k <= 62).map((r) => r.d), BEYOND = sundays.find((r) => r.k > 62).d;
const S1 = inWin[0], S2 = inWin[1], S3 = inWin[2], S4 = inWin[3], FAR = inWin[inWin.length - 1];
const months = {};
function put(d, person) { const ym = d.slice(0, 7); (months[ym] = months[ym] || { month: ym, offering: '', guide: '', parking: '', prayer: [] }).prayer.push({ week: nthOf(d) + '주', person }); }
put(S1, '테스트_장 장로'); put(S2, '테스트_가 권사'); put(S3, '테스트_나 권사'); put(S4, '테스트_가 권사님'); put(FAR, '테스트_가 권사'); put(BEYOND, '테스트_가 권사');
const committees = JSON.stringify({ months: Object.values(months) }).replace(/'/g, "''");

await db.exec(`
  insert into auth.users values ('${ADM}'), ('${GA}'), ('${NA}'), ('${JANG}'), ('${OUT}');
  insert into public.admins values ('${ADM}');
  insert into public.member_links (user_id, member_key, member_name) values
    ('${GA}', '테스트_가|19600101', '테스트_가'), ('${NA}', '테스트_나|19610101', ' 테스트_나 '),
    ('${JANG}', '테스트_장|19500101', '테스트_장'), ('${OUT}', '', null);
  insert into public.church_settings (key, data) values ('committees', '${committees}'::jsonb);
  insert into public.sermons (sermon_date, service, title, scripture) values ('${S2}', '주일 낮 예배', '테스트_설교', '아모스 6:1-7'), ('${S2}', '수요기도회', '다른 예배', '창 1:1');
`);

ok('파괴적 구문 없음', !/\b(drop\s+(table|column|function)|delete\s+from|truncate)\b/i.test(sql.replace(/--.*$/gm, '')));

const as = async (role, uid) => { await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${role};`); };
const back = async () => { await db.exec(`reset role; set session authorization postgres;`); };
const mine = async (uid) => { await as('authenticated', uid); try { return (await db.query(`select public.my_rep_prayers() as r`)).rows[0].r; } finally { await back(); } };
const fails = async (role, uid, q) => { await as(role, uid); try { await db.query(q); return false; } catch (e) { return String(e.message); } finally { await back(); } };
const runs = async (role, uid, q) => { await as(role, uid); try { return (await db.query(q)).rows; } finally { await back(); } };

for (let run = 1; run <= 2; run++) {
  await db.exec(sql);
  const T = `run${run} `;
  if (run === 2) await db.exec(`update public.worship_prayers set body = body`);   // 두 번째 실행에도 표·자료 그대로

  // ── 이름 규칙 (js/rep-prayer.js nameOf 와 같게) ──
  const nm = (await db.query(`select public.rep_person_name('차영선 권사') a, public.rep_person_name(' 신용화 장로 ') b, public.rep_person_name('하경순 권사님') c, public.rep_person_name('홍 길동') d, public.rep_person_name(null) e`)).rows[0];
  ok(T + '이름 규칙', nm.a === '차영선' && nm.b === '신용화' && nm.c === '하경순' && nm.d === '홍길동' && nm.e === '', nm);

  // ── 저장 전: 앞으로의 차례만(기도문 없음) ──
  if (run === 1) {
    const g = await mine(GA);
    ok(T + '가 권사: 차례 3번(S2·S4·9주 안)', g.ok && g.name === '테스트_가' && g.items.length === 3, g);
    ok(T + '가 권사: 최근 날짜부터, 기도문 없음', g.items[0].sdate === FAR && g.items.every((x) => x.body === null), g.items);
    const s2 = g.items.find((x) => x.sdate === S2);
    ok(T + 'S2 에 그 주일 낮 예배 설교', s2 && s2.title === '테스트_설교' && s2.scripture === '아모스 6:1-7', s2);
    const n = await mine(NA);
    ok(T + '나 권사(이름 앞뒤 빈칸): S3 하나', n.items.length === 1 && n.items[0].sdate === S3 && n.items[0].person === '테스트_나 권사', n);
    const j = await mine(JANG);
    ok(T + '장로: 차례는 보이되 기도문 없음', j.items.length === 1 && j.items[0].sdate === S1 && j.items[0].body === null, j);
    const o = await mine(OUT);
    ok(T + '교적 미연결: 빈 목록', o.ok && o.name === null && o.items.length === 0, o);
    ok(T + '비로그인은 함수 못 부름', !!(await fails('anon', '', 'select public.my_rep_prayers()')));
    await as('authenticated', ''); const nl = (await db.query('select public.my_rep_prayers() r')).rows[0].r; await back();
    ok(T + '로그인 없음 → ok:false', nl.ok === false && nl.why === 'login', nl);
  }

  // ── 권한(RLS) ──
  ok(T + '성도는 표를 못 읽음(0줄)', (await runs('authenticated', GA, 'select * from public.worship_prayers')).length === 0);
  ok(T + '성도는 못 씀', !!(await fails('authenticated', GA, `insert into public.worship_prayers (sdate, person, body) values ('${S2}', '테스트_가 권사', '가짜')`)));
  ok(T + '비로그인은 못 읽음', !!(await fails('anon', '', 'select * from public.worship_prayers')));
  ok(T + 'source 값 검사', !!(await fails('authenticated', ADM, `insert into public.worship_prayers (sdate, person, body, source) values ('2026-01-04', '테스트_가 권사', '가짜', 'robot')`)));

  // ── 관리자가 저장 ──
  await runs('authenticated', ADM, `insert into public.worship_prayers (sdate, person, body, source) values
      ('${S2}', '테스트_가 권사', '테스트_기도문 S2', 'auto'),
      ('2026-04-26', '테스트_가 권사', '테스트_지난 기도문', 'import'),
      ('${S3}', '테스트_다 권사', '테스트_대신 기도', 'edit'),
      ('2026-03-01', '테스트_나 권사', '', 'auto')
    on conflict (sdate, service) do update set person = excluded.person, body = excluded.body, source = excluded.source, updated_at = now()`);
  ok(T + '관리자는 읽음', (await runs('authenticated', ADM, 'select * from public.worship_prayers')).length === 4);

  const g2 = await mine(GA);
  const byDate = Object.fromEntries(g2.items.map((x) => [x.sdate, x]));
  ok(T + '가 권사: 저장된 S2 기도문 + 지난 기도문 + 남은 차례', byDate[S2] && byDate[S2].body === '테스트_기도문 S2' && byDate[S2].source === 'auto' &&
    byDate['2026-04-26'] && byDate['2026-04-26'].source === 'import' && byDate[S4] && byDate[S4].body === null && g2.items.length === 4, g2.items);
  ok(T + 'S2 는 한 번만(저장분이 차례를 대신)', g2.items.filter((x) => x.sdate === S2).length === 1);
  const n2 = await mine(NA);
  ok(T + '나 권사: S3 은 다른 분이 대신 → 없음, 빈 기도문도 안 보임', n2.items.length === 0, n2);
  ok(T + '남의 기도문은 안 섞임', !JSON.stringify(g2).includes('대신 기도') && !JSON.stringify(await mine(JANG)).includes('테스트_기도문'));
}

console.log(`pass ${pass} fail ${fail}`);
process.exit(fail ? 1 : 0);
