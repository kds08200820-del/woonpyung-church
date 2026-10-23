// 신앙 정원 4단계(경제 가격표 · 나무 스토어 재고 · 나의 보관함 · 건축 미션) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node garden_economy_build.test.mjs <저장소 경로>
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
  create table public.edu_records (id uuid primary key default gen_random_uuid(), edu_date date, title text, end_date date, participants text default '[]');
  create or replace function public.edu_participant_keys(p text) returns setof text language plpgsql immutable as $$
  declare j jsonb; begin
    begin j := nullif(btrim(coalesce(p, '')), '')::jsonb; exception when others then return; end;
    if j is null or jsonb_typeof(j) <> 'array' then return; end if;
    return query select e->>'key' from jsonb_array_elements(j) e where jsonb_typeof(e) = 'object' and coalesce(e->>'key', '') <> '';
  end $$;
  insert into auth.users values ('${U1}'), ('${U2}'), ('${U3}'), ('${ADM}');
  insert into public.admins values ('${ADM}');
  insert into public.profiles values ('${U1}', '테스트_성도'), ('${U2}', '테스트_이웃'), ('${U3}', '테스트_새가족'), ('${ADM}', '테스트_목사');
  insert into public.member_links (user_id, member_key) values ('${U1}', '테스트_성도|19800101');
  insert into public.gyojeok (member_key, name, head) values ('테스트_성도|19800101', '테스트_성도', '');
  insert into public.edu_records (edu_date, title, end_date, participants) values
    (current_date - 40, '테스트_새가족반', current_date - 7, '[{"name":"테스트_성도","key":"테스트_성도|19800101"}]');
  insert into public.qt_checks (user_id, check_date, created_at) values ('${U1}', current_date, now());
`);
const base = ['20261023_1200_garden_phase1.sql', '20261023_1300_garden_farm.sql'];
for (const f of base) await db.exec(fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8'));
const prev = ['20261023_1500_garden_wallet_shop.sql', '20261023_1900_garden_hearts.sql', '20261023_2100_garden_visits.sql',
  '20261023_2330_garden_region.sql', '20261023_2350_garden_guestbook_push.sql'].map((f) => fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8')).join('\n');
await db.exec(prev);
await db.exec(`update public.edu_records set talent_reward = 25 where title = '테스트_새가족반';`);
// 예전 방식(per_day) 품목 하나 — 새 규칙 뒤에도 그대로 거둔다
await db.exec(`insert into public.garden_shop_items (slug, category, name, price, fit, model) values
  ('t-legacy', 'food', '{"ko":"테스트_예전채소"}', 5, 'good', '{"type":"annual","first_days":10,"window_days":60,"per_day":3,"value":0.1}') on conflict (slug) do nothing;`);
const ECON = fs.readFileSync(path.join(ROOT, 'supabase/20261024_0010_garden_economy_build.sql'), 'utf8');
await db.exec(ECON);
await db.exec(ECON);
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
const tileOf = (farm, x, y) => farm.tiles.find((t) => t.x === x && t.y === y);
const M = num(await one(`select extract(month from now() at time zone 'Asia/Seoul')::int`));
const PM = M === 1 ? 12 : M - 1, NM = M === 12 ? 1 : M + 1;
const setModel = (slug, key, val) => pg(`update public.garden_shop_items set model = jsonb_set(model, '{${key}}', '${JSON.stringify(val)}') where slug = '${slug}'`);

// 1) 가격표 값
const crops = Object.fromEntries((await pg(`select slug, seed_cost, fruits from public.garden_crops`)).map((r) => [r.slug, r]));
ok('crop lettuce 0.3/6', near(crops.lettuce.seed_cost, 0.3) && crops.lettuce.fruits === 6, crops.lettuce);
ok('crop strawberry 0.5/10', near(crops.strawberry.seed_cost, 0.5) && crops.strawberry.fruits === 10);
ok('crop tomato 1.0/20', near(crops.tomato.seed_cost, 1) && crops.tomato.fruits === 20);
ok('crop grape 2.0/40 (limit widened)', near(crops.grape.seed_cost, 2) && crops.grape.fruits === 40, crops.grape);
const items = Object.fromEntries((await pg(`select slug, category, price, model from public.garden_shop_items`)).map((r) => [r.slug, r]));
const want = { lettuce: 3, cucumber: 3, pepper: 4, eggplant: 5, 'cherry-tomato': 6, tomato: 6, potato: 9, corn: 10, 'sweet-potato': 12,
  sunflower: 8, cosmos: 8, marigold: 8, zinnia: 8, balsam: 8, portulaca: 8, celosia: 8, 'morning-glory': 8, tulip: 15, daffodil: 15, lily: 15,
  mum: 20, lavender: 20, hydrangea: 20, rose: 20, mugunghwa: 20, jindallae: 20, azalea: 20,
  blueberry: 40, 'nanking-cherry': 40, apricot: 40, apple: 50, pear: 50, peach: 50, grape: 50, plum: 50, jujube: 50,
  persimmon: 60, 'hardy-kiwi': 60, chestnut: 60, maesil: 60, cherry: 60, pine: 20, oak: 40, larch: 60 };
const badPrice = Object.entries(want).filter(([s, p]) => !items[s] || !near(items[s].price, p));
ok('all prices per table', badPrice.length === 0, badPrice);
const modeOf = (s) => items[s].model.harvest;
ok('veg once 14d, no per_day', ['lettuce', 'sweet-potato', 'corn'].every((s) => modeOf(s) === 'once' && items[s].model.window_days === 14 && items[s].model.per_day === undefined), items.lettuce.model);
ok('veg first days', items.lettuce.model.first_days === 28 && items.potato.model.first_days === 90 && items['sweet-potato'].model.first_days === 115);
ok('flowers once/yearly', modeOf('sunflower') === 'once' && modeOf('tulip') === 'once' && modeOf('mum') === 'yearly' && modeOf('azalea') === 'yearly' && items.jindallae.model.first_bloom_days === 60);
ok('fruit trees season', ['apple', 'blueberry', 'cherry'].every((s) => modeOf(s) === 'season' && items[s].model.years_to_fruit === undefined && items[s].model.keep_days === 7)
  && items.blueberry.model.first_days === 75 && items.apple.model.first_days === 120 && items.cherry.model.first_days === 150, items.apple.model);
ok('timber items', ['pine', 'oak', 'larch'].every((s) => modeOf(s) === 'timber' && items[s].category === 'tree') && items.oak.model.first_days === 180 && items.larch.model.first_days === 240);
ok('unfit trees untouched', items.fig && items.fig.model.harvest === undefined && near(items.fig.price, 50));
ok('rule labels', (await pg(`select count(*)::int n from public.garden_rules where church_id is null and kind in ('dig','wood_cut','tree_sell','tree_buy')`))[0].n === 4);

// 열매 나무 하루치: 한 철을 다 거두면 꼭 한 해 값
const seasonSum = num(await one(`select sum(public.garden_season_day_value(50, '[9,10]', d::date)) from generate_series('2026-09-01'::timestamp, '2026-10-31'::timestamp, interval '1 day') d`));
ok('season values sum to price', near(seasonSum, 50), seasonSum);
ok('season value 0 out of season', near(await one(`select public.garden_season_day_value(50, '[9,10]', '2026-08-31')`), 0));
const s60 = num(await one(`select sum(public.garden_season_day_value(60, '[6]', d::date)) from generate_series('2026-06-01'::timestamp, '2026-06-30'::timestamp, interval '1 day') d`));
ok('season 60 over June', near(s60, 60), s60);

// 2) 동기화 · 땅
let s = await as(U1, `select public.garden_sync('woonpyung')`);
ok('sync U1', s.ok, s);
for (const u of [U2, U3, ADM]) await as(u, `select public.garden_sync('woonpyung')`);
await grant(U1, 2000, 'g1'); await grant(U2, 500, 'g2');
let f = (await as(U1, `select public.garden_farm('woonpyung')`)).farm;
ok('farm json new keys', f.market && f.market.free === 2 && near(f.market.rate, 0.7) && f.wood === 0 && f.build && f.build.threshold === 500, { m: f.market, w: f.wood, b: f.build });
ok('farm tiles have picks_today', f.tiles.every((t) => t.picks_today === 0));

// 3) 빠른 작물 — 칸마다 하루 2번 제값, 3번째부터 직판장(30% 낮음, 상추 6개 = 0.4)
const ripe = (x, y) => pg(`update public.garden_tiles set ripe_at = now() - interval '1 second' where user_id = '${U1}' and x = ${x} and y = ${y}`);
const picks = [];
for (let i = 0; i < 3; i++) {
  const pl = await as(U1, `select public.garden_farm_plant('woonpyung', 1, 0, 'lettuce')`);
  ok('plant lettuce ' + i, pl.ok, pl);
  await ripe(1, 0);
  const b0 = await bal(U1);
  const pk = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 0, 0)`);
  picks.push(pk);
  ok('pick all ' + i, pk.ok && pk.n === 6 && near(await bal(U1) - b0, num(pk.gain)), pk);
  // 다음 심기와 심은 시각이 겹치지 않게
  await pg(`select pg_sleep(0.002)`);
}
ok('1st/2nd full price 0.6', near(picks[0].gain, 0.6) && !picks[0].market && near(picks[1].gain, 0.6) && !picks[1].market, picks.map((p) => [p.gain, p.market]));
ok('3rd at market 0.4', near(picks[2].gain, 0.4) && picks[2].market, [picks[2].gain, picks[2].market]);
ok('picks_today = 3', tileOf(picks[2].farm, 1, 0).picks_today === 3 && tileOf(picks[2].farm, 1, 0).crop === null, tileOf(picks[2].farm, 1, 0));
ok('market rows marked', (await pg(`select count(*)::int n from public.garden_ledger where user_id = '${U1}' and kind = 'crop_pick' and meta->>'market' = 'true'`))[0].n === 6);
let pl = await as(U1, `select public.garden_farm_plant('woonpyung', 1, 1, 'lettuce')`);
await ripe(1, 1);
let pk = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 1, 2)`);
ok('other cell: single pick full', pk.ok && pk.n === 1 && near(pk.gain, 0.1) && !pk.market, pk);
pk = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 1, 2)`);
ok('same fruit twice', pk.ok && !pk.picked && pk.n === 0, pk);
pk = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 1, 0)`);
ok('rest of the cell', pk.ok && pk.n === 5 && near(pk.gain, 0.5) && tileOf(pk.farm, 1, 1).crop === null, pk);
pk = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 1, 41)`);
ok('pick range', !pk.ok, pk);

// 4) 채소 한 번 거두기 — 마음이 모자라면 need, 익으면 값 × 2, 14일 지나면 시듦(over)
let by = await as(U1, `select public.garden_shop_buy('woonpyung', 'lettuce', 3)`);
ok('buy lettuce item 3×3', by.ok && near(by.spent, 9), by);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', -1, 0, 'lettuce')`);
ok('plant lettuce item', pl.ok, pl);
await back(U1, -1, 0, 30);
let hv = await as(U1, `select public.garden_farm_harvest('woonpyung', -1, 0, 0)`);
const xp0 = num(await one(`select public.garden_xp_since(${CH}, '${U1}', (select item_at from public.garden_tiles where user_id = '${U1}' and x = -1 and y = 0))`));
ok('veg needs heart', !hv.ok && hv.why === 'xp' && hv.need === 280 - xp0, { hv, xp0 });
await giveXp(U1, 5000, 'x1');
f = (await as(U1, `select public.garden_farm('woonpyung')`)).farm;
let st = tileOf(f, -1, 0).st;
ok('status ready avail 6', st.mode === 'once' && st.ready && near(st.avail, 6) && st.need_xp === 0, st);
let b0 = await bal(U1);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', -1, 0, 0)`);
ok('veg once +6, cell empty', hv.ok && hv.picked && near(hv.gain, 6) && hv.cleared && tileOf(hv.farm, -1, 0).item === null && near(await bal(U1) - b0, 6), hv);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', -1, 0, 'lettuce')`);
await back(U1, -1, 0, 45);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', -1, 0, 0)`);
ok('veg over after 14 days', !hv.ok && hv.why === 'over', hv);
let dg = await as(U1, `select public.garden_farm_dig('woonpyung', -1, 0, false)`);
ok('wilted veg cleared free', dg.ok && near(dg.spent, 0) && tileOf(dg.farm, -1, 0).item === null, dg);

// 5) 꽃 — 한해살이 꽃다발(값 × 2) · 꽃나무는 꽃철마다 값 한 번, 캐내기 반값
await setModel('sunflower', 'bloom_months', [M]);
await setModel('mum', 'bloom_months', [M]);
by = await as(U1, `select public.garden_shop_buy('woonpyung', 'sunflower', 1)`);
by = await as(U1, `select public.garden_shop_buy('woonpyung', 'mum', 1)`);
await as(U1, `select public.garden_farm_plant_item('woonpyung', 0, 1, 'sunflower')`);
await as(U1, `select public.garden_farm_plant_item('woonpyung', 0, -1, 'mum')`);
await back(U1, 0, 1, 70); await back(U1, 0, -1, 61);
await giveXp(U1, 5000, 'x2');
b0 = await bal(U1);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 0, 1, 0)`);
ok('bouquet 16, cell empty', hv.ok && near(hv.gain, 16) && hv.cleared, hv);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 0, -1, 0)`);
ok('perennial 20 once a year', hv.ok && near(hv.gain, 20) && !hv.cleared && tileOf(hv.farm, 0, -1).item === 'mum', hv);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 0, -1, 0)`);
ok('perennial again same year', !hv.ok && hv.why === 'not_ready', hv);
ok('balance +36', near(await bal(U1) - b0, 36));
await setModel('mum', 'bloom_months', [NM]);
f = (await as(U1, `select public.garden_farm('woonpyung')`)).farm;
ok('perennial out of bloom not ready', !tileOf(f, 0, -1).st.ready && near(tileOf(f, 0, -1).st.dig, 10), tileOf(f, 0, -1).st);
b0 = await bal(U1);
dg = await as(U1, `select public.garden_farm_dig('woonpyung', 0, -1, false)`);
ok('dig living perennial costs 10', dg.ok && near(dg.spent, 10) && near(await bal(U1) - b0, -10) && tileOf(dg.farm, 0, -1).item === null, dg);

// 6) 열매 나무 — 첫 열매 마음 120일, 열매 철 날마다 열리고 7일치까지 쌓인다
await setModel('apple', 'harvest_months', [PM, M]);
by = await as(U1, `select public.garden_shop_buy('woonpyung', 'apple', 2)`);
await as(U1, `select public.garden_farm_plant_item('woonpyung', -1, 1, 'apple')`);
await as(U1, `select public.garden_farm_plant_item('woonpyung', -1, -1, 'apple')`);
await back(U1, -1, 1, 200);
await back(U1, -1, -1, 122);    // 다 자란 지 이틀 → 오늘 포함 사흘치
await giveXp(U1, 5000, 'x3');
f = (await as(U1, `select public.garden_farm('woonpyung')`)).farm;
const a1 = tileOf(f, -1, 1).st, a2 = tileOf(f, -1, -1).st;
const exp7 = num(await one(`select sum(public.garden_season_day_value(50, '[${PM},${M}]', d::date)) from generate_series((current_date - 6)::timestamp, current_date::timestamp, interval '1 day') d`));
ok('apple 7 days piled', a1.mode === 'season' && a1.ready && a1.days.length === 7 && near(a1.avail, exp7), { a1, exp7 });
ok('young apple only since mature', a2.ready && a2.days.length === 3, a2);
b0 = await bal(U1);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', -1, 1, 0)`);
ok('apple harvest = piled days', hv.ok && hv.n === 7 && near(hv.gain, exp7) && near(await bal(U1) - b0, exp7) && !hv.cleared, hv);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', -1, 1, 0)`);
ok('apple nothing left today', !hv.ok && hv.why === 'not_ready', hv);
ok('apple digs 25', near(tileOf(hv.farm || f, -1, 1).st.dig, 25));
await setModel('apple', 'harvest_months', [NM]);
f = (await as(U1, `select public.garden_farm('woonpyung')`)).farm;
ok('apple out of season', !tileOf(f, -1, -1).st.ready, tileOf(f, -1, -1).st);
dg = await as(U1, `select public.garden_farm_dig('woonpyung', -1, -1, true)`);
ok('dead tree cleared free', dg.ok && near(dg.spent, 0), dg);

// 7) 예전 방식 품목은 그대로
by = await as(U1, `select public.garden_shop_buy('woonpyung', 't-legacy', 1)`);
await as(U1, `select public.garden_farm_plant_item('woonpyung', 2, 0, 't-legacy')`).catch(() => null);
pl = await as(U1, `select public.garden_farm_buy_many('woonpyung', '[{"x":2,"y":0},{"x":2,"y":1},{"x":2,"y":-1}]'::jsonb)`);
ok('buy more land', pl.ok, pl);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', 2, 0, 't-legacy')`);
await back(U1, 2, 0, 12);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 2, 0, 1)`);
ok('legacy per_day harvest', hv.ok && hv.picked && near(hv.gain, 0.1), hv);

// 8) 건축용 나무 — 겨울엔 못 심음 · 다 자라면 베어 목재 · 스토어에 팔면 재고 +1
by = await as(U1, `select public.garden_shop_buy('woonpyung', 'pine', 3)`);
ok('buy pine seedlings 3×20', by.ok && near(by.spent, 60), by);
await setModel('pine', 'plant_months', [NM]);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', 2, 1, 'pine')`);
ok('timber out of planting months refused', !pl.ok && pl.why === 'season', pl);
await setModel('pine', 'plant_months', [3, 4, 10, 11, M]);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', 2, 1, 'pine')`);
ok('plant pine', pl.ok, pl);
let ct = await as(U1, `select public.garden_farm_cut('woonpyung', 2, 1)`);
ok('young pine cannot be cut', !ct.ok && (ct.why === 'not_ready' || ct.why === 'xp'), ct);
let sl = await as(U1, `select public.garden_tree_sell('woonpyung', 2, 1)`);
ok('young pine cannot be sold', !sl.ok, sl);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 2, 1, 0)`);
ok('timber is not harvested', !hv.ok && hv.why === 'cut', hv);
await back(U1, 2, 1, 121);
await giveXp(U1, 5000, 'x4');
f = (await as(U1, `select public.garden_farm('woonpyung')`)).farm;
st = tileOf(f, 2, 1).st;
ok('pine ready: wood 40, sell 40', st.mode === 'timber' && st.ready && st.wood === 40 && near(st.sell, 40), st);
ok('build counts planted timber', f.build.trees === 1 && f.build.coming === 40, f.build);
b0 = await bal(U1);
ct = await as(U1, `select public.garden_farm_cut('woonpyung', 2, 1)`);
ok('cut → wood 40, cell empty, no talent', ct.ok && ct.wood === 40 && ct.wood_total === 40 && tileOf(ct.farm, 2, 1).item === null && near(await bal(U1), b0), ct);
ok('farm wood 40', ct.farm.wood === 40);
await as(U1, `select public.garden_farm_plant_item('woonpyung', 2, 1, 'pine')`);
await as(U1, `select public.garden_farm_plant_item('woonpyung', 2, -1, 'pine')`);
await back(U1, 2, 1, 121); await back(U1, 2, -1, 121);
await giveXp(U1, 5000, 'x5');
b0 = await bal(U1);
sl = await as(U1, `select public.garden_tree_sell('woonpyung', 2, 1)`);
ok('sell pine +40, stock 1', sl.ok && near(sl.gain, 40) && sl.stock === 1 && near(await bal(U1) - b0, 40) && tileOf(sl.farm, 2, 1).item === null, sl);
sl = await as(U1, `select public.garden_tree_sell('woonpyung', 2, -1)`);
ok('sell second pine, stock 2', sl.ok && sl.stock === 2, sl);
ok('wood unchanged by selling', num(await one(`select public.garden_wood(${CH}, '${U1}')`)) === 40);
let shop = await as(U2, `select public.garden_shop('woonpyung')`);
ok('shop shows stock', shop.ok && shop.stock.pine === 2 && shop.wood === 0, { st: shop.stock, w: shop.wood });

// 9) 스토어에서 사기 — 남은 수량까지만, 값 2배, 산 나무는 목재로
let tb = await as(U2, `select public.garden_tree_buy('woonpyung', 'pine', 3)`);
ok('buy over stock refused', !tb.ok && tb.why === 'stock' && tb.left === 2, tb);
b0 = await bal(U2);
tb = await as(U2, `select public.garden_tree_buy('woonpyung', 'pine', 2)`);
ok('buy 2 pines: -80, wood 80, left 0', tb.ok && near(tb.spent, 80) && tb.wood === 80 && tb.wood_total === 80 && tb.left === 0 && near(await bal(U2) - b0, -80), tb);
tb = await as(U2, `select public.garden_tree_buy('woonpyung', 'pine', 1)`);
ok('stock empty', !tb.ok && tb.why === 'stock' && tb.left === 0, tb);
tb = await as(U2, `select public.garden_tree_buy('woonpyung', 'apple', 1)`);
ok('only timber can be bought', !tb.ok && tb.why === 'item', tb);
let as1 = await as(U2, `select public.garden_admin_set_stock('woonpyung', 'oak', 3)`);
ok('non-admin cannot set stock', !as1.ok && as1.why === 'admin', as1);
as1 = await as(ADM, `select public.garden_admin_set_stock('woonpyung', 'oak', 3)`);
ok('admin sets stock', as1.ok && as1.qty === 3, as1);
as1 = await as(ADM, `select public.garden_admin_set_stock('woonpyung', 'apple', 3)`);
ok('admin stock only timber', !as1.ok && as1.why === 'item', as1);
tb = await as(U2, `select public.garden_tree_buy('woonpyung', 'oak', 6)`);
ok('buy oak over stock', !tb.ok && tb.why === 'stock' && tb.left === 3, tb);
await pg(`update public.garden_tree_stock set qty = 20 where item = 'oak'`);
tb = await as(U2, `select public.garden_tree_buy('woonpyung', 'oak', 6)`);
ok('buy oak short of talent', !tb.ok && tb.why === 'talent' && near(tb.need, 480), tb);
ok('stock untouched on fail', (await pg(`select qty from public.garden_tree_stock where item = 'oak'`))[0].qty === 20);

// 10) 나의 보관함 · 자산 · 건축 미션
let sg = await as(U1, `select public.garden_storage('woonpyung')`);
ok('storage wood + log', sg.ok && sg.wood === 40 && sg.wood_log.length === 1 && sg.wood_log[0].kind === 'wood_cut' && sg.wood_log[0].wood === 40 && sg.wood_log[0].item === 'pine', sg.wood_log);
ok('storage bag', sg.bag.some((b) => b.item === 'lettuce' && b.qty === 1) && sg.bag.some((b) => b.item === 'apple') === false && sg.names.pine.ko === '소나무', sg.bag);
ok('storage edu with title', sg.edu.length === 1 && sg.edu[0].title === '테스트_새가족반' && near(sg.edu[0].talent, 25), sg.edu);
ok('storage trips/houses empty', Array.isArray(sg.trips) && sg.trips.length === 0 && Array.isArray(sg.houses));
const A = sg.build.assets;
const landExp = num(await one(`select count(*) * 10 from public.garden_tiles where user_id = '${U1}'`));
ok('assets add up', near(A.total, num(A.talent) + num(A.land) + num(A.plants) + num(A.wood)) && near(A.land, landExp) && near(A.wood, 40) && near(A.talent, await bal(U1)), A);
const plantsExp = num(await one(`select coalesce(sum(s.price), 0) from public.garden_tiles t join public.garden_shop_items s on s.slug = t.item where t.user_id = '${U1}'`))
  + num(await one(`select coalesce(sum(i.qty * s.price), 0) from public.garden_inventory i join public.garden_shop_items s on s.slug = i.item where i.user_id = '${U1}'`));
ok('assets plants = planted + bag', near(A.plants, plantsExp), { A, plantsExp });
ok('U1 mission active', sg.build.active && sg.build.wood === 40 && sg.build.houses[0].key === 'small' && sg.build.houses[0].wood === 200, sg.build);
ok('no land yet → asset 0', near((await as(U3, `select public.garden_storage('woonpyung')`)).build.asset, 0));
await as(U3, `select public.garden_farm('woonpyung')`);   // 처음 여는 내 땅 9칸
let s3 = await as(U3, `select public.garden_storage('woonpyung')`);
ok('new member: not active yet', s3.ok && !s3.build.active && near(s3.build.asset, 90) && s3.edu.length === 0, s3.build);
let ab = await as(U3, `select public.garden_admin_set_build('woonpyung', 50)`);
ok('non-admin cannot set build', !ab.ok && ab.why === 'admin');
ab = await as(ADM, `select public.garden_admin_set_build('woonpyung', 50)`);
s3 = await as(U3, `select public.garden_storage('woonpyung')`);
ok('lower threshold → active', ab.ok && s3.build.active && s3.build.threshold === 50, s3.build);
await as(ADM, `select public.garden_admin_set_build('woonpyung', 500)`);
// 대지 한 칸이면(자산이 모자라도) 시작한 것으로
await grant(U3, 100, 'g3');
let cv = await as(U3, `select public.garden_farm_convert('woonpyung', '[{"x":1,"y":0}]'::jsonb)`);
ok('U3 converts one 대지', cv.ok && cv.farm.build.dae === 1 && cv.farm.build.active, cv.farm && cv.farm.build);

// 11) 관리자 자산 셈(이름 없이)
let aa = await as(U1, `select public.garden_admin_assets('woonpyung')`);
ok('non-admin cannot see church assets', !aa.ok && aa.why === 'admin');
aa = await as(ADM, `select public.garden_admin_assets('woonpyung')`);
const totals = await pg(`select (public.garden_assets(g.church_id, g.user_id)->>'total')::numeric t from public.garden_gardens g`);
const tsum = totals.reduce((a, r) => a + num(r.t), 0);
ok('church assets sum', aa.ok && aa.members === totals.length && near(aa.sum.total, Math.round(tsum * 10) / 10) && aa.bands.reduce((a, b) => a + b.n, 0) === totals.length, { aa, tsum });
ok('church assets no names', !JSON.stringify(aa).includes('테스트_'));

// 12) 마이월렛 — 새 장부 종류 이름표
let wl = await as(U1, `select public.garden_wallet('woonpyung')`);
ok('wallet labels', wl.by_kind.some((k) => k.kind === 'tree_sell' && k.label === '스토어에 나무 팔기' && near(k.in, 80)) && wl.by_kind.some((k) => k.kind === 'dig' && near(k.out, 10)), wl.by_kind);
let w2 = await as(U2, `select public.garden_wallet('woonpyung')`);
ok('wallet tree_buy out', w2.by_kind.some((k) => k.kind === 'tree_buy' && near(k.out, 80)), w2.by_kind);

// 13) 잔액 = 장부 합, 권한
s = await as(U1, `select public.garden_sync('woonpyung')`);
const sum = (await pg(`select sum(talent)::text s from public.garden_ledger where user_id='${U1}'`))[0].s;
ok('balance equals ledger', near(s.state.garden.talent_balance, num(sum)), { b: s.state.garden.talent_balance, sum });
ok('anon cannot storage', !!(await asErr(null, `select public.garden_storage('woonpyung')`)));
ok('anon cannot buy tree', !!(await asErr(null, `select public.garden_tree_buy('woonpyung', 'pine', 1)`)));
ok('user cannot call item status', !!(await asErr(U1, `select public.garden_item_status(${CH}, '${U2}', 0, 0)`)));
ok('user cannot call assets of others', !!(await asErr(U1, `select public.garden_assets(${CH}, '${U2}')`)));
ok('user cannot write stock', !!(await asErr(U1, `update public.garden_tree_stock set qty = 99`)) || (await pg(`select max(qty)::int m from public.garden_tree_stock`))[0].m !== 99);
ok('user can read stock', (await as(U1, `select count(*)::int from public.garden_tree_stock`)) >= 1);
ok('rerun keeps stock', await (async () => { await db.exec(ECON); return (await pg(`select qty from public.garden_tree_stock where item = 'oak'`))[0].qty === 20; })());

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
