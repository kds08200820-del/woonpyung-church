// 신앙 정원 5단계(하우스 · 하우스 작물) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node garden_greenhouse.test.mjs <저장소 경로>
//   1200 → 1300 → 1500 → 1900 → 2100 → 2330 → 2350 → 20261024_0010(경제) → 20261024_0100(하우스) 차례로
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
  create table public.member_links (user_id uuid primary key, member_key text, spouse_key text, member_status text default '정회원');
  create table public.gyojeok (id serial primary key, member_key text, name text, head text, ss_role text, birth date);
  create table public.qt_checks (user_id uuid, check_date date, created_at timestamptz default now());
  create table public.bible_reading (user_id uuid, day_no int, done_at timestamptz);
  create table public.attendance (att_date date, service text, member_key text);
  insert into auth.users values ('${U1}'), ('${U2}'), ('${U3}'), ('${ADM}');
  insert into public.admins values ('${ADM}');
  insert into public.profiles values ('${U1}', '테스트_성도'), ('${U2}', '테스트_이웃'), ('${U3}', '테스트_새가족'), ('${ADM}', '테스트_목사');
`);
const files = ['20261023_1200_garden_phase1.sql', '20261023_1300_garden_farm.sql', '20261023_1500_garden_wallet_shop.sql', '20261023_1900_garden_hearts.sql',
  '20261023_2100_garden_visits.sql', '20261023_2330_garden_region.sql', '20261023_2350_garden_guestbook_push.sql', '20261024_0010_garden_economy_build.sql'];
for (const f of files) await db.exec(fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8'));
const HOUSE = fs.readFileSync(path.join(ROOT, 'supabase/20261024_0100_garden_greenhouse.sql'), 'utf8');
await db.exec(HOUSE);
await db.exec(HOUSE);
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
const giveXp = (uid, n, ref) => pg(`insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source) values (${CH}, '${uid}', 'test_xp', '${ref}', ${n}, 0, now() - interval '1 hour', 'system')`);
const back = (uid, x, y, days) => pg(`update public.garden_tiles set item_at = now() - interval '${days} days' where user_id = '${uid}' and x = ${x} and y = ${y}`);
const bal = async (uid) => num(await one(`select public.garden_balance(${CH}, '${uid}')`));
const tileRow = async (uid, x, y) => (await pg(`select * from public.garden_tiles where user_id = '${uid}' and x = ${x} and y = ${y}`))[0];
const tileOf = (farm, x, y) => farm.tiles.find((t) => t.x === x && t.y === y);
const invOf = async (uid, item) => num((await pg(`select coalesce(sum(qty), 0) q from public.garden_inventory where user_id = '${uid}' and item = '${item}'`))[0].q);
const M = num(await one(`select extract(month from now() at time zone 'Asia/Seoul')::int`));
const setModel = (slug, key, val) => pg(`update public.garden_shop_items set model = jsonb_set(model, '{${key}}', '${JSON.stringify(val)}') where slug = '${slug}'`);
const cells = (a) => `'${JSON.stringify(a.map(([x, y]) => ({ x, y })))}'::jsonb`;

// 1) 칸·품목·장부 이름표
const cols = (await pg(`select column_name, is_nullable from information_schema.columns where table_name = 'garden_tiles' and column_name in ('building', 'building_at')`));
ok('columns nullable', cols.length === 2 && cols.every((c) => c.is_nullable === 'YES'), cols);
ok('rule label house_build', (await pg(`select count(*)::int n from public.garden_rules where church_id is null and kind = 'house_build' and sort = 121`))[0].n === 1);
let items = Object.fromEntries((await pg(`select slug, category, price, fit, model, specs, active from public.garden_shop_items`)).map((r) => [r.slug, r]));
const HOUSE_ITEMS = { strawberry: ['food', 9, 'once'], paprika: ['food', 10, 'once'], melon: ['food', 10, 'once'], 'korean-melon': ['food', 8, 'once'],
  fig: ['tree', 50, 'season'], kiwi: ['tree', 60, 'season'], 'apple-mango': ['tree', 60, 'season'], banana: ['tree', 50, 'season'] };
const badItem = Object.entries(HOUSE_ITEMS).filter(([s, [cat, p, mode]]) => {
  const it = items[s]; return !it || it.category !== cat || !near(it.price, p) || it.model.harvest !== mode || it.model.house !== true || it.fit !== 'good' || !it.active;
});
ok('house items: category·price·mode·house·fit', badItem.length === 0, badItem.map(([s]) => [s, items[s]]));
ok('once veg: price ≈ days × 0.1, 2×', ['strawberry', 'paprika', 'melon', 'korean-melon'].every((s) => near(items[s].price, items[s].model.first_days / 10) && items[s].model.yield_x === 2 && items[s].model.window_days === 14));
ok('house trees have harvest months', ['fig', 'kiwi', 'apple-mango', 'banana'].every((s) => Array.isArray(items[s].model.harvest_months) && items[s].model.keep_days === 7 && items[s].model.dig_x === 0.5));
ok('specs carry plant/first/harvest/src', Object.keys(HOUSE_ITEMS).every((s) => items[s].specs.plant && items[s].specs.first && items[s].specs.harvest && items[s].specs.src));
ok('other items untouched (not house)', ['lettuce', 'apple', 'pine', 'sunflower'].every((s) => items[s].model.house === undefined));
ok('sweet persimmon still unfit', items['sweet-persimmon'].fit === 'no');

// 관리자가 바꾼 값은 다시 실행해도 지킨다(무화과는 처음 한 번만 값을 정한다)
await db.exec(`update public.garden_shop_items set price = 12 where slug = 'strawberry'; update public.garden_shop_items set price = 55 where slug = 'fig';`);
await db.exec(HOUSE);
items = Object.fromEntries((await pg(`select slug, price, model from public.garden_shop_items where slug in ('strawberry', 'fig')`)).map((r) => [r.slug, r]));
ok('rerun keeps admin prices', near(items.strawberry.price, 12) && near(items.fig.price, 55), items);
await db.exec(`update public.garden_shop_items set price = 9 where slug = 'strawberry'; update public.garden_shop_items set price = 50 where slug = 'fig';`);

// 2) 동기화 · 하우스 목록
for (const u of [U1, U2, U3, ADM]) { const s = await as(u, `select public.garden_sync('woonpyung')`); ok('sync ' + u.slice(0, 4), s.ok, s); }
await grant(U1, 2000, 'g1'); await grant(U2, 60, 'g2');
let h = await asErr(null, `select public.garden_house('woonpyung')`);
ok('anon cannot call', h && h.includes('permission denied'), h);
await as(U1, `select public.garden_farm('woonpyung')`);   // 처음 3×3 칸
h = await as(U1, `select public.garden_house('woonpyung')`);
ok('house list empty, price 50', h.ok && near(h.price, 50) && h.houses.length === 0 && h.admin === false && near(h.balance, 2000), h);

// 3) 짓기 — 여러 칸 한 번에, 값 × 칸 수, 장부 두 줄
let b0 = await bal(U1);
let r = await as(U1, `select public.garden_house_build('woonpyung', ${cells([[1, 0], [0, 1], [1, 0]])})`);
ok('build 2 (dup ignored)', r.ok && r.n === 2 && near(r.spent, 100) && near(r.balance, b0 - 100) && near(await bal(U1), b0 - 100), r);
ok('build returns houses + farm', r.house.houses.length === 2 && r.house.houses.every((x) => x.building === 'greenhouse' && x.at) && Array.isArray(r.farm.tiles), r.house);
const led = await pg(`select ref, talent, meta from public.garden_ledger where user_id = '${U1}' and kind = 'house_build' order by ref`);
ok('ledger 2 × −50', led.length === 2 && led.every((l) => near(l.talent, -50) && l.meta.building === 'greenhouse') && /^0,1@\d+$/.test(led[0].ref), led);
ok('tile row', (await tileRow(U1, 1, 0)).building === 'greenhouse' && (await tileRow(U1, 1, 0)).building_at !== null);

// 안 되는 칸 — 하나라도 안 되면 하나도 짓지 않는다
b0 = await bal(U1);
r = await as(U1, `select public.garden_house_build('woonpyung', ${cells([[1, 1], [1, 0]])})`);
ok('already → none built', !r.ok && r.why === 'already' && (await tileRow(U1, 1, 1)).building === null && near(await bal(U1), b0), r);
r = await as(U1, `select public.garden_house_build('woonpyung', ${cells([[0, 0]])})`);
ok('tree cell', !r.ok && r.why === 'tree', r);
r = await as(U1, `select public.garden_house_build('woonpyung', ${cells([[3, 3]])})`);
ok('not owned', !r.ok && r.why === 'not_owned', r);
r = await as(U1, `select public.garden_house_build('woonpyung', ${cells([[5, 0]])})`);
ok('range', !r.ok && r.why === 'range', r);
r = await as(U1, `select public.garden_house_build('woonpyung', '[]'::jsonb)`);
ok('empty', !r.ok && r.why === 'empty', r);
let cv = await as(U1, `select public.garden_farm_convert('woonpyung', ${cells([[-1, -1]])})`);
ok('convert -1,-1 to dae', cv.ok, cv);
r = await as(U1, `select public.garden_house_build('woonpyung', ${cells([[-1, -1]])})`);
ok('dae cell refused', !r.ok && r.why === 'dae', r);
let by = await as(U1, `select public.garden_shop_buy('woonpyung', 'lettuce', 2)`);
await as(U1, `select public.garden_farm_plant_item('woonpyung', -1, 0, 'lettuce')`);
r = await as(U1, `select public.garden_house_build('woonpyung', ${cells([[-1, 0]])})`);
ok('busy cell refused', !r.ok && r.why === 'busy', r);
await as(U1, `select public.garden_farm_plant('woonpyung', -1, 1, 'lettuce')`);
r = await as(U1, `select public.garden_house_build('woonpyung', ${cells([[-1, 1]])})`);
ok('quick crop cell refused', !r.ok && r.why === 'busy', r);
r = await as(U2, `select public.garden_house_build('woonpyung', ${cells([[1, 0], [0, 1]])})`);
ok('short of talents', !r.ok && r.why === 'talent' && near(r.need, 100) && near(r.balance, 60), r);
r = await as(U2, `select public.garden_house_build('woonpyung', ${cells([[1, 0]])})`);
ok('U2 builds one with 60', r.ok && r.n === 1, r);
h = await as(U1, `select public.garden_house('woonpyung')`);
ok('houses are per user', h.houses.length === 2, h.houses);
ok('U2 cannot read U1 tiles', (await as(U2, `select count(*)::int from public.garden_tiles where user_id = '${U1}'`)) === 0);

// 4) 하우스 작물은 하우스 칸에만 (트리거) — 막히면 가방도 그대로
by = await as(U1, `select public.garden_shop_buy('woonpyung', 'strawberry', 2)`);
ok('buy strawberry 2×9', by.ok && near(by.spent, 18), by);
let e = await asErr(U1, `select public.garden_farm_plant_item('woonpyung', 1, 1, 'strawberry')`);
ok('strawberry outdoors refused', e && e.includes('garden_house_only'), e);
ok('bag kept after refusal', (await invOf(U1, 'strawberry')) === 2);
let pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', 1, 0, 'strawberry')`);
ok('strawberry in greenhouse', pl.ok && tileOf(pl.farm, 1, 0).item === 'strawberry' && (await invOf(U1, 'strawberry')) === 1, pl);
by = await as(U1, `select public.garden_shop_buy('woonpyung', 'fig', 1)`);
ok('fig is sold now', by.ok && near(by.spent, 50), by);

// 하우스 칸에는 일반 나무를 심지 않는다 · 채소·꽃·빠른 작물은 된다
await as(U1, `select public.garden_house_build('woonpyung', ${cells([[1, -1], [0, -1], [1, 1]])})`);
by = await as(U1, `select public.garden_shop_buy('woonpyung', 'apple', 1)`);
e = await asErr(U1, `select public.garden_farm_plant_item('woonpyung', 1, -1, 'apple')`);
ok('apple tree in greenhouse refused', e && e.includes('garden_house_tree'), e);
ok('apple still in bag', (await invOf(U1, 'apple')) === 1);
await setModel('pine', 'plant_months', [M]);
by = await as(U1, `select public.garden_shop_buy('woonpyung', 'pine', 1)`);
e = await asErr(U1, `select public.garden_farm_plant_item('woonpyung', 1, -1, 'pine')`);
ok('timber in greenhouse refused', e && e.includes('garden_house_tree'), e);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', 1, -1, 'lettuce')`);
ok('vegetable in greenhouse ok', pl.ok, pl);
pl = await as(U1, `select public.garden_farm_plant('woonpyung', 0, -1, 'lettuce')`);
ok('quick crop in greenhouse ok', pl.ok, pl);
by = await as(U1, `select public.garden_shop_buy('woonpyung', 'sunflower', 1)`);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', 1, 1, 'sunflower')`);
ok('flower in greenhouse ok', pl.ok, pl);
await as(U1, `select public.garden_farm_buy_many('woonpyung', ${cells([[-2, -1]])})`);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', -2, -1, 'apple')`);
ok('apple tree outdoors ok', pl.ok && (await invOf(U1, 'apple')) === 0, pl);

// 5) 하우스 칸은 대지로 바꾸지 못한다
await as(U1, `select public.garden_farm_buy_many('woonpyung', ${cells([[2, 0]])})`);
await as(U1, `select public.garden_house_build('woonpyung', ${cells([[2, 0]])})`);
b0 = await bal(U1);
e = await asErr(U1, `select public.garden_farm_convert('woonpyung', ${cells([[2, 0]])})`);
ok('greenhouse cell cannot become dae', e && e.includes('garden_house_land') && (await tileRow(U1, 2, 0)).land === 'jeon' && near(await bal(U1), b0), e);

// 6) 거두기 — 하우스 채소는 익으면 한 번에 값 × 2, 하우스 나무는 열매 철에
await giveXp(U1, 5000, 'x1');
await back(U1, 1, 0, 95);
b0 = await bal(U1);
let hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 0, 0)`);
ok('strawberry once +18, cell empty, house stays', hv.ok && near(hv.gain, 18) && hv.cleared && tileOf(hv.farm, 1, 0).item === null && (await tileRow(U1, 1, 0)).building === 'greenhouse' && near(await bal(U1) - b0, 18), hv);
await setModel('fig', 'harvest_months', [M]);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', 1, 0, 'fig')`);
ok('fig in greenhouse', pl.ok, pl);
await back(U1, 1, 0, 130);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 0, 0)`);
ok('fig season harvest', hv.ok && hv.mode === 'season' && num(hv.gain) > 0 && !hv.cleared, hv);

// 7) 걷기 — 빈 칸일 때만, 돌려받는 값 없음
r = await as(U1, `select public.garden_house_remove('woonpyung', 1, 0)`);
ok('remove busy refused', !r.ok && r.why === 'busy', r);
r = await as(U1, `select public.garden_house_remove('woonpyung', 2, 2)`);
ok('remove non-house', !r.ok && r.why === 'no_house', r);
b0 = await bal(U1);
r = await as(U1, `select public.garden_house_remove('woonpyung', 2, 0)`);
ok('remove empty house, no refund', r.ok && (await tileRow(U1, 2, 0)).building === null && near(await bal(U1), b0) && !r.house.houses.some((x) => x.x === 2 && x.y === 0), r);
cv = await as(U1, `select public.garden_farm_convert('woonpyung', ${cells([[2, 0]])})`);
ok('after removal the cell can become dae', cv.ok, cv);
r = await as(U1, `select public.garden_house_build('woonpyung', ${cells([[0, 1]])})`);
ok('rebuild on an existing house refused', !r.ok && r.why === 'already', r);
await as(U1, `select public.garden_house_remove('woonpyung', 0, 1)`);
r = await as(U1, `select public.garden_house_build('woonpyung', ${cells([[0, 1]])})`);
ok('rebuild after removal (new ledger ref)', r.ok && (await pg(`select count(*)::int n from public.garden_ledger where user_id = '${U1}' and kind = 'house_build' and ref like '0,1@%'`))[0].n === 2, r);

// 8) 관리자 값
r = await as(U1, `select public.garden_admin_set_house_price('woonpyung', 10)`);
ok('non-admin refused', !r.ok && r.why === 'admin', r);
r = await as(ADM, `select public.garden_admin_set_house_price('woonpyung', -1)`);
ok('admin range', !r.ok && r.why === 'range', r);
r = await as(ADM, `select public.garden_admin_set_house_price('woonpyung', 70)`);
ok('admin sets 70', r.ok && near(r.price, 70), r);
h = await as(U1, `select public.garden_house('woonpyung')`);
ok('price 70 seen', near(h.price, 70), h);
await as(U1, `select public.garden_farm_buy_many('woonpyung', ${cells([[-2, 0]])})`);
b0 = await bal(U1);
r = await as(U1, `select public.garden_house_build('woonpyung', ${cells([[-2, 0]])})`);
ok('build at 70', r.ok && near(r.spent, 70) && near(await bal(U1), b0 - 70), r);
await db.exec(HOUSE);
ok('rerun keeps house price', near((await as(U1, `select public.garden_house('woonpyung')`)).price, 70));

// 9) 지킴이는 품목·건물이 바뀔 때만 — 예전부터 있던 줄의 다른 갱신은 그대로 지나간다
await db.exec(`alter table public.garden_tiles disable trigger garden_tiles_house_guard;
          update public.garden_tiles set item = 'kiwi', item_at = now() where user_id = '${U2}' and x = -1 and y = -1;
          alter table public.garden_tiles enable trigger garden_tiles_house_guard;`);
let passed = true;
try { await pg(`update public.garden_tiles set picked = '{}' where user_id = '${U2}' and x = -1 and y = -1`); } catch (err) { passed = false; }
ok('legacy row other update passes', passed);
e = null;
try { await pg(`update public.garden_tiles set item = 'banana' where user_id = '${U2}' and x = -1 and y = -1`); } catch (err) { e = err.message; }
ok('changing item on legacy row still checked', e && e.includes('garden_house_only'), e);

// 10) 직접 쓰기 막힘 · 함수 권한
e = await asErr(U1, `update public.garden_tiles set building = 'greenhouse' where user_id = '${U1}' and x = -1 and y = 0`);
ok('direct write blocked', !!e, e);
e = await asErr(U1, `select public.garden_house_json(${CH}, '${U1}')`);
ok('inner helper not callable', !!e, e);
e = await asErr(null, `select public.garden_house_build('woonpyung', ${cells([[1, 1]])})`);
ok('anon cannot call build', !!e, e);
await as(U3, `select public.garden_farm('woonpyung')`);
ok('bad building name refused', await (async () => { try { await pg(`update public.garden_tiles set building = 'Green House' where user_id = '${U3}' and x = 1 and y = 1`); return false; } catch (err) { return /garden_tiles_building_ck/.test(err.message); } })());

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
