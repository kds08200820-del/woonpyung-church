// 신앙 정원 5단계(건축: 집 짓기 · 교회 건축헌금) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node garden_build.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } }
const num = (x) => Number(x);
const near = (a, b) => Math.abs(num(a) - b) < 1e-9;

const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222', U3 = '66666666-6666-4666-8666-666666666666',
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
  create table public.profiles (id uuid primary key, name text, role text);
  insert into auth.users values ('${U1}'), ('${U2}'), ('${U3}'), ('${ADM}');
  insert into public.admins values ('${ADM}');
  insert into public.profiles values ('${U1}', '테스트_성도'), ('${U2}', '테스트_이웃'), ('${U3}', '테스트_새가족'), ('${ADM}', '테스트_목사');
`);
const chain = ['20261023_1200_garden_phase1.sql', '20261023_1300_garden_farm.sql', '20261023_1500_garden_wallet_shop.sql', '20261023_1900_garden_hearts.sql',
  '20261023_2100_garden_visits.sql', '20261023_2330_garden_region.sql', '20261023_2350_garden_guestbook_push.sql', '20261024_0010_garden_economy_build.sql'];
for (const f of chain) await db.exec(fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8'));
const BUILD = fs.readFileSync(path.join(ROOT, 'supabase/20261024_0200_garden_build.sql'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'supabase/20261024_1140_garden_home_rules.sql'), 'utf8');
await db.exec(BUILD);
await db.exec(BUILD);
// 0200 뒤에 새 규칙 파일(작은 집 4칸·건축비 칸당 1,000) — 두 번 실행해도 안전
await db.exec(RULES);
await db.exec(RULES);
ok('rerun safe', true);


async function as(uid, sql) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { const r = await db.query(sql); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }
  finally { await db.exec('reset role; set session authorization postgres;'); }
}
async function asErr(uid, sql) { try { await as(uid, sql); return null; } catch (e) { return e.message; } }
async function pg(sql) { return (await db.query(sql)).rows; }
const one = async (sql) => Object.values((await pg(sql))[0] || {})[0];
const CH = `public.garden_default_church()`;
const grant = (uid, n, ref) => pg(`insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source) values (${CH}, '${uid}', 'admin_grant', '${ref}', 0, ${n}, now(), 'admin')`);
const giveWood = (uid, n, ref) => pg(`insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta) values (${CH}, '${uid}', 'wood_cut', '${ref}', 0, 0, now(), 'platform', '{"wood":${n},"item":"pine"}')`);
const bal = async (uid) => num(await one(`select public.garden_balance(${CH}, '${uid}')`));
const wood = async (uid) => num(await one(`select public.garden_wood(${CH}, '${uid}')`));
const cells = (a) => `'${JSON.stringify(a.map(([x, y]) => ({ x, y })))}'::jsonb`;

for (const u of [U1, U2, U3, ADM]) await as(u, `select public.garden_sync('woonpyung')`);
await as(U1, `select public.garden_farm('woonpyung')`);
await as(U2, `select public.garden_farm('woonpyung')`);
ok('rule labels', (await pg(`select count(*)::int n from public.garden_rules where church_id is null and kind in ('home_build','church_offering','church_refund')`))[0].n === 3);

// 1) 건재상 — 세 채 값(담임목사 10/24: 작은 집 최소 대지 4칸, 건축비 = 대지 한 칸당 1,000 달란트)
let h = await as(U1, `select public.garden_home('woonpyung')`);
ok('home ok', h.ok && h.plans.length === 3 && h.homes.length === 0 && h.wood === 0 && h.dae === 0, h);
ok('plans 4/6/9 cells', h.plans[0].key === 'small' && h.plans[0].dae === 4 && h.plans[0].wood === 200 && near(h.plans[0].wage, 4000)
  && h.plans[1].key === 'hanok' && h.plans[1].dae === 6 && h.plans[1].wood === 600 && near(h.plans[1].wage, 6000)
  && h.plans[2].key === 'big' && h.plans[2].dae === 9 && h.plans[2].wood === 1500 && near(h.plans[2].wage, 9000) && near(h.plans[0].cell_fee, 1000), h.plans);
const bj = await one(`select public.garden_build_json(${CH}, '${U1}')`);
ok('mission reads the same plans', JSON.stringify(bj.houses) === JSON.stringify(h.plans), bj.houses);

// 땅 만들기·대지: 가운데 3×3 은 믿음 나무가 있어 집이 못 앉는다 → 바깥에 사서 대지로
//   작은 집 2×2 = (-1,1)(0,1)(-1,2)(0,2) · 한옥 3×2 = (-4,0)(-3,0)(-2,0)(-4,1)(-3,1)(-2,1) · 큰 집 3×3 = x 2..4 × y -1..1
await grant(U1, 40000, 'g1');
const BIG = [], HAN = [[-4, 0], [-3, 0], [-2, 0], [-4, 1], [-3, 1], [-2, 1]], SML = [[-1, 1], [0, 1], [-1, 2], [0, 2]];
for (let x = 2; x <= 4; x++) for (let y = -1; y <= 1; y++) BIG.push([x, y]);
const buyCells = [...BIG, [-4, 0], [-3, 0], [-2, 0], [-4, 1], [-3, 1], [-2, 1], [-1, 2], [0, 2]];
let bm = await as(U1, `select public.garden_farm_buy_many('woonpyung', ${cells(buyCells)})`);
ok('bought land', bm.ok, bm);
let cv = await as(U1, `select public.garden_farm_convert('woonpyung', ${cells([...BIG, ...HAN, ...SML])})`);
ok('convert 19 dae', cv.ok && cv.n === 19, cv);

// 2) 집 짓기 — 막히는 경우
let r = await as(U1, `select public.garden_home_build('woonpyung', 'small', ${cells([[-1, 0], [0, 0], [-1, 1], [0, 1]])})`);
ok('tree cell', !r.ok && (r.why === 'tree' || r.why === 'not_dae'), r);
r = await as(U1, `select public.garden_home_build('woonpyung', 'small', ${cells([[-1, 1], [0, 1], [-1, 2], [1, 2]])})`);
ok('not owned / not dae', !r.ok && (r.why === 'not_owned' || r.why === 'not_dae'), r);
r = await as(U1, `select public.garden_home_build('woonpyung', 'tent', ${cells(SML)})`);
ok('bad kind', !r.ok && r.why === 'kind', r);
r = await as(U1, `select public.garden_home_build('woonpyung', 'small', ${cells([[-1, 1]])})`);
ok('size: one cell is not enough', !r.ok && r.why === 'size' && r.need === 4, r);
r = await as(U1, `select public.garden_home_build('woonpyung', 'hanok', ${cells(SML)})`);
ok('size: hanok needs 6', !r.ok && r.why === 'size' && r.need === 6, r);
r = await as(U1, `select public.garden_home_build('woonpyung', 'small', ${cells([[-1, 1], [0, 1], [-1, 2], [-4, 0]])})`);
ok('shape (apart)', !r.ok && r.why === 'shape', r);
r = await as(U1, `select public.garden_home_build('woonpyung', 'hanok', ${cells([[-4, 0], [-3, 0], [-2, 0], [-4, 1], [-3, 1], [4, 1]])})`);
ok('shape (not a rectangle)', !r.ok && r.why === 'shape', r);
r = await as(U1, `select public.garden_home_build('woonpyung', 'small', ${cells(SML)})`);
ok('no wood', !r.ok && r.why === 'wood' && r.need === 200 && r.have === 0, r);

// 3) 작은 집(2×2) — 건축비 4,000
await giveWood(U1, 250, 'w1');
let b0 = await bal(U1);
r = await as(U1, `select public.garden_home_build('woonpyung', 'small', ${cells(SML)})`);
ok('small built', r.ok && r.kind === 'small' && near(r.spent, 4000) && r.wood === 200 && r.wood_total === 50 && r.homes.length === 1, r);
ok('fee paid 4000', near(b0 - await bal(U1), 4000));
ok('wood left 50', (await wood(U1)) === 50);
ok('home row 2x2', r.homes[0].x === -1 && r.homes[0].y === 1 && r.homes[0].w === 2 && r.homes[0].h === 2 && r.homes[0].wood === 200 && near(r.homes[0].wage, 4000), r.homes[0]);
ok('farm json back', r.farm && Array.isArray(r.farm.tiles) && r.farm.wood === 50, r.farm && r.farm.wood);
r = await as(U1, `select public.garden_home_build('woonpyung', 'small', ${cells(SML)})`);
ok('taken', !r.ok && r.why === 'taken', r);

// 한옥 3×2 — 건축비 6,000
await giveWood(U1, 600, 'w2');
b0 = await bal(U1);
r = await as(U1, `select public.garden_home_build('woonpyung', 'hanok', ${cells([...HAN, HAN[0]])})`);
ok('hanok built 3x2 (dup cell ignored)', r.ok && r.homes.length === 2 && r.homes[1].w === 3 && r.homes[1].h === 2 && r.homes[1].x === -4 && r.homes[1].y === 0 && near(r.spent, 6000), r);
ok('fee paid 6000', near(b0 - await bal(U1), 6000));
ok('wood after hanok', (await wood(U1)) === 50);

// 건축비 모자람 → 채우면 큰 집 3×3(9,000)
await pg(`insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source) values (${CH}, '${U1}', 'admin_grant', 'drain', 0, -${(await bal(U1)) - 100}, now(), 'admin')`);
await giveWood(U1, 1500, 'w3');
r = await as(U1, `select public.garden_home_build('woonpyung', 'big', ${cells(BIG)})`);
ok('no fee (need 9000)', !r.ok && r.why === 'talent' && near(r.need, 9000), r);
await grant(U1, 9000, 'g1b');
r = await as(U1, `select public.garden_home_build('woonpyung', 'big', ${cells(BIG)})`);
ok('big built 3x3', r.ok && r.homes.length === 3 && r.homes[2].w === 3 && r.homes[2].h === 3 && near(r.spent, 9000) && r.wood === 1500, r);

// 칸당 건축비를 교회 설정으로 바꾸면 새 값(이미 지은 집은 그대로)
await pg(`update public.garden_churches set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{home_cell_fee}', '500') where id = ${CH}`);
h = await as(U1, `select public.garden_home('woonpyung')`);
ok('home_cell_fee 500 -> 2000/3000/4500', near(h.plans[0].wage, 2000) && near(h.plans[1].wage, 3000) && near(h.plans[2].wage, 4500) && near(h.plans[0].cell_fee, 500), h.plans);
await pg(`update public.garden_churches set settings = settings - 'home_cell_fee' where id = ${CH}`);
h = await as(U1, `select public.garden_home('woonpyung')`);
ok('fee back to 1000', near(h.plans[0].wage, 4000));

// 자산: 집 = 목재 + 건축비
const a = await one(`select public.garden_assets(${CH}, '${U1}')`);
ok('assets houses', near(a.houses, 200 + 4000 + 600 + 6000 + 1500 + 9000) && near(a.total, num(a.talent) + num(a.land) + num(a.plants) + num(a.wood) + num(a.houses)), a);
ok('all dae used by three houses', h.dae === 19 && h.free_dae === 0 && h.homes.length === 3, { dae: h.dae, free: h.free_dae });
ok('others cannot see my homes', (await as(U2, `select count(*)::int from public.garden_homes`)) === 0);
ok('owner sees own homes', (await as(U1, `select count(*)::int from public.garden_homes`)) === 3);
ok('cannot write homes', !!(await asErr(U1, `insert into public.garden_homes (church_id, user_id, kind, x, y) values (${CH}, '${U1}', 'small', 1, 1)`)));
ok('rule label updated', (await one(`select label->>'ko' from public.garden_rules where church_id is null and kind = 'home_build'`)) === '집 짓기(건축비)');


// 4) 교회 건축 — 시작은 관리자만
let c = await as(U1, `select public.garden_church('woonpyung')`);
ok('church ok empty', c.ok && c.current === null && c.built.length === 0 && c.plans.length === 3 && c.admin === false, c);
r = await as(U1, `select public.garden_admin_church_start('woonpyung', 'small', 100)`);
ok('member cannot start', !r.ok && r.why === 'admin', r);
r = await as(ADM, `select public.garden_admin_church_start('woonpyung', 'castle', 100)`);
ok('bad church kind', !r.ok && r.why === 'kind', r);
r = await as(ADM, `select public.garden_admin_church_start('woonpyung', 'brick', null)`);
ok('start default goal', r.ok && r.current && r.current.kind === 'brick' && near(r.current.goal, 20000) && near(r.current.raised, 0), r);
r = await as(ADM, `select public.garden_admin_church_start('woonpyung', 'small', 100)`);
ok('one at a time', !r.ok && r.why === 'open', r);
r = await as(ADM, `select public.garden_admin_church_goal('woonpyung', 300)`);
ok('goal changed', r.ok && near(r.current.goal, 300) && !r.done, r);
const bid = r.current.id;

// 헌금
await grant(U2, 500, 'g2');
r = await as(U2, `select public.garden_church_offer('woonpyung', ${bid}, 0.5)`);
ok('min 1', !r.ok && r.why === 'range', r);
r = await as(U3, `select public.garden_church_offer('woonpyung', ${bid}, 10)`);
ok('no talent', !r.ok && r.why === 'talent', r);
const u2b = await bal(U2);
r = await as(U2, `select public.garden_church_offer('woonpyung', ${bid}, 100)`);
ok('offer 100', r.ok && near(r.given, 100) && !r.capped && !r.done && near(r.church.current.raised, 100) && near(r.church.current.mine, 100) && r.church.current.donors === 1, r);
ok('U2 paid', near(u2b - await bal(U2), 100));
r = await as(U1, `select public.garden_church_offer('woonpyung', ${bid}, 50)`);
ok('U1 offer 50', r.ok && near(r.church.current.raised, 150) && near(r.church.current.mine, 50) && r.church.current.donors === 2, r);
c = await as(U3, `select public.garden_church('woonpyung')`);
ok('others see total only', near(c.current.raised, 150) && c.current.donors === 2 && near(c.current.mine, 0) && !JSON.stringify(c).includes(U2), c.current);
ok('ledger meta', (await pg(`select count(*)::int n from public.garden_ledger where kind = 'church_offering' and meta->>'build' = '${bid}'`))[0].n === 2);

// 관리자 멈추기 → 모두 돌려받음
const u1b = await bal(U1);
r = await as(U1, `select public.garden_admin_church_stop('woonpyung')`);
ok('member cannot stop', !r.ok && r.why === 'admin', r);
r = await as(ADM, `select public.garden_admin_church_stop('woonpyung')`);
ok('stopped & refunded', r.ok && r.refunded === 2 && near(r.total, 150) && r.current === null, r);
ok('U1 refunded', near(await bal(U1) - u1b, 50));
ok('U2 refunded', near(await bal(U2), u2b));
r = await as(U2, `select public.garden_church_offer('woonpyung', ${bid}, 10)`);
ok('stopped build closed', !r.ok && r.why === 'closed', r);

// 다시 시작 → 목표 넘게 드리면 남은 만큼만, 완공
r = await as(ADM, `select public.garden_admin_church_start('woonpyung', 'small', 120)`);
ok('restart small', r.ok && r.current.kind === 'small' && near(r.current.goal, 120), r);
const bid2 = r.current.id;
await as(U1, `select public.garden_church_offer('woonpyung', ${bid2}, 100)`);
const u2c = await bal(U2);
r = await as(U2, `select public.garden_church_offer('woonpyung', ${bid2}, 80)`);
ok('capped & done', r.ok && near(r.given, 20) && r.capped && r.done && r.church.current === null && r.church.built.length === 1
  && r.church.built[0].kind === 'small' && near(r.church.built[0].raised, 120) && near(r.church.built[0].mine, 20), r);
ok('U2 paid only 20', near(u2c - await bal(U2), 20));
r = await as(U2, `select public.garden_church_offer('woonpyung', ${bid2}, 10)`);
ok('done closed', !r.ok && r.why === 'closed', r);
ok('raised = ledger', near(await one(`select raised from public.garden_church_builds where id = ${bid2}`),
  num(await one(`select -sum(talent) from public.garden_ledger where kind = 'church_offering' and meta->>'build' = '${bid2}'`))));

// 목표를 모인 것 아래로 낮추면 바로 완공
r = await as(ADM, `select public.garden_admin_church_start('woonpyung', 'stone', 1000)`);
const bid3 = r.current.id;
await grant(U1, 100, 'g1c');
r = await as(U1, `select public.garden_church_offer('woonpyung', ${bid3}, 30)`);
ok('offer to stone', r.ok && near(r.given, 30), r);
r = await as(ADM, `select public.garden_admin_church_goal('woonpyung', 25)`);
ok('goal below raised -> done', r.ok && r.done && r.current === null && r.built[0].kind === 'stone', r);
c = await as(U1, `select public.garden_church('woonpyung')`);
ok('built list newest first', c.built.length === 2 && c.built[0].kind === 'stone' && c.built[1].kind === 'small', c.built);

// 5) 권한·잔액
ok('anon cannot church', !!(await asErr(null, `select public.garden_church('woonpyung')`)));
ok('anon cannot home', !!(await asErr(null, `select public.garden_home('woonpyung')`)));
ok('user cannot call church json', !!(await asErr(U1, `select public.garden_church_json(${CH}, '${U2}')`)));
ok('user cannot write builds', !!(await asErr(ADM, `update public.garden_church_builds set raised = 99999`)) || (await pg(`select max(raised)::numeric m from public.garden_church_builds`))[0].m < 99999);
let s = await as(U1, `select public.garden_sync('woonpyung')`);
const sum = (await pg(`select sum(talent)::text s from public.garden_ledger where user_id='${U1}'`))[0].s;
ok('balance equals ledger', near(s.state.garden.talent_balance, num(sum)), { b: s.state.garden.talent_balance, sum });
s = await as(U1, `select public.garden_storage('woonpyung')`);
ok('storage still works', s.ok && s.build && near(s.build.assets.houses, 21300) && s.build.houses.length === 3, s.build && s.build.assets);
await db.exec(BUILD); await db.exec(RULES);
ok('rerun keeps homes & builds', (await one(`select count(*)::int from public.garden_homes`)) === 3 && (await one(`select count(*)::int from public.garden_church_builds`)) === 3);

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
