// 신앙 정원 3단계(마이월렛·보상·땅 종류·꽃집) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node garden_wallet_shop.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } }
const num = (x) => Number(x);
const near = (a, b) => Math.abs(num(a) - b) < 1e-9;

const U1 = '11111111-1111-4111-8111-111111111111', KID = '33333333-3333-4333-8333-333333333333', ADM = '44444444-4444-4444-8444-444444444444';
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
  create table public.member_links (user_id uuid primary key, member_key text, member_status text default '정회원');
  create table public.qt_checks (user_id uuid, check_date date, created_at timestamptz default now());
  create table public.bible_reading (user_id uuid, day_no int, done_at timestamptz);
  create table public.attendance (att_date date, service text, member_key text);
  create table public.ss_talents (id bigint generated always as identity primary key, member_key text not null, child_name text, amount integer not null default 0, reason text, talent_date date default current_date, created_by text, created_at timestamptz not null default now());
  create table public.edu_records (id uuid primary key default gen_random_uuid(), edu_date date, title text, end_date date, participants text default '[]');
  create or replace function public.edu_participant_keys(p text) returns setof text language plpgsql immutable as $$
  declare j jsonb; begin
    begin j := nullif(btrim(coalesce(p, '')), '')::jsonb; exception when others then return; end;
    if j is null or jsonb_typeof(j) <> 'array' then return; end if;
    return query select e->>'key' from jsonb_array_elements(j) e where jsonb_typeof(e) = 'object' and coalesce(e->>'key', '') <> '';
  end $$;
  insert into auth.users values ('${U1}'), ('${KID}'), ('${ADM}');
  insert into public.admins values ('${ADM}');
  insert into public.profiles values ('${U1}', '테스트_성도'), ('${KID}', '테스트_어린이'), ('${ADM}', '테스트_목사');
  insert into public.member_links (user_id, member_key) values ('${U1}', '테스트_성도|19800101'), ('${KID}', '테스트_어린이|20150101');
  -- 어린이 주일학교 달란트: +30, +12, -5(달란트 시장)
  insert into public.ss_talents (member_key, amount, reason, created_at) values
    ('테스트_어린이|20150101', 30, '출석', now() - interval '20 days'), ('테스트_어린이|20150101', 12, '암송', now() - interval '10 days'),
    ('테스트_어린이|20150101', -5, '달란트 시장', now() - interval '3 days'), ('테스트_다른아이|20150202', 99, '다른 아이', now());
  -- 교육: 끝난 교육(이수 25) · 아직 안 끝난 교육(이수 40) · 이수 달란트 0 인 교육
  insert into public.edu_records (edu_date, title, end_date, participants) values
    (current_date - 40, '테스트_새가족반', current_date - 7, '[{"name":"테스트_성도","key":"테스트_성도|19800101"}]'),
    (current_date - 10, '테스트_제자반', current_date + 30, '[{"name":"테스트_성도","key":"테스트_성도|19800101"}]'),
    (current_date - 50, '테스트_무보상', current_date - 20, '[{"name":"테스트_성도","key":"테스트_성도|19800101"}]');
  -- 성도: 큐티 3일, 성경 읽기 같은 날 3회(하루 1번만), 수요·새벽 출석
  insert into public.qt_checks (user_id, check_date, created_at) select '${U1}', d::date, d from generate_series(now() - interval '2 days', now(), interval '1 day') d;
  insert into public.bible_reading values ('${U1}', 1, now() - interval '1 hour'), ('${U1}', 2, now() - interval '50 minutes'), ('${U1}', 3, now() - interval '40 minutes');
  insert into public.attendance values (current_date - 1, '새벽기도회', '테스트_성도|19800101'), (current_date - 1, '수요기도회', '테스트_성도|19800101'), (current_date - 3, '주일 2부', '테스트_성도|19800101');
`);
await db.exec(fs.readFileSync(path.join(ROOT, 'supabase/20261023_1200_garden_phase1.sql'), 'utf8'));
await db.exec(fs.readFileSync(path.join(ROOT, 'supabase/20261023_1300_garden_farm.sql'), 'utf8'));
const sql3 = fs.readFileSync(path.join(ROOT, 'supabase/20261023_1500_garden_wallet_shop.sql'), 'utf8');
await db.exec(sql3);
await db.exec(sql3);
ok('rerun safe', true);
await db.exec(`update public.edu_records set talent_reward = 25 where title = '테스트_새가족반';
               update public.edu_records set talent_reward = 40 where title = '테스트_제자반';`);
// 시험용 품목 (실제 품목은 마이그레이션 9) 절)
await db.exec(`insert into public.garden_shop_items (slug, category, name, price, fit, model) values
  ('t-tomato', 'food', '{"ko":"테스트_토마토"}', 5, 'good', '{"type":"annual","first_days":60,"window_days":60,"per_day":3,"value":0.1}'),
  ('t-apple', 'tree', '{"ko":"테스트_사과"}', 50, 'good', '{"type":"tree","years_to_fruit":3,"harvest_months":[9,10],"per_day":4,"value":0.1}'),
  ('t-rose', 'flower', '{"ko":"테스트_장미"}', 20, 'good', '{"type":"shrub","bloom_months":[5,6]}'),
  ('t-olive', 'tree', '{"ko":"테스트_올리브"}', 50, 'no', '{"type":"tree"}')
  on conflict (slug) do nothing;`);

async function as(uid, sql) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { const r = await db.query(sql); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }
  finally { await db.exec('reset role; set session authorization postgres;'); }
}
async function asErr(uid, sql) { try { await as(uid, sql); return null; } catch (e) { return e.message; } }
async function pg(sql) { return (await db.query(sql)).rows; }
const led = async (uid, kind) => (await pg(`select coalesce(sum(talent),0)::text s, count(*)::int n from public.garden_ledger where user_id='${uid}' and kind='${kind}'`))[0];

// 1) 보상 값
const rules = Object.fromEntries((await pg(`select kind, talent, daily_cap from public.garden_rules where church_id is null`)).map((r) => [r.kind, r]));
ok('rule worship 10', rules.worship_sunday.talent === 10 && rules.worship_weekday.talent === 10, rules.worship_weekday);
ok('rule qt 5', rules.qt_amen.talent === 5);
ok('rule bible 10/day', rules.bible_day.talent === 10 && rules.bible_day.daily_cap === 1);
ok('rule heart 1', rules.heart_given.talent === 1);
ok('rule water 2', rules.water.talent === 2 && rules.water.daily_cap === 1);
ok('rule login 0', rules.login.talent === 0);

// 2) 성도 동기화: 큐티 3×5=15, 성경 1×10=10, 출석은 member_links 키로 — 새벽·수요·주일 각 10 = 30, 교육 이수 25(끝난 것만)
let s = await as(U1, `select public.garden_sync('woonpyung')`);
ok('sync ok', s.ok, s);
ok('qt 15', near((await led(U1, 'qt_amen')).s, 15), await led(U1, 'qt_amen'));
ok('bible 10 once', near((await led(U1, 'bible_day')).s, 10) && (await led(U1, 'bible_day')).n === 1, await led(U1, 'bible_day'));
ok('worship 30', near(num((await led(U1, 'worship_weekday')).s) + num((await led(U1, 'worship_sunday')).s), 30), [await led(U1, 'worship_weekday'), await led(U1, 'worship_sunday')]);
ok('edu 25 only ended', near((await led(U1, 'edu_done')).s, 25) && (await led(U1, 'edu_done')).n === 1, await led(U1, 'edu_done'));
ok('login 0', near((await led(U1, 'login')).s, 0));
const B1 = num(s.state.garden.talent_balance);
ok('balance = 80', near(B1, 80), B1);
ok('state watered false', s.state.watered === false && s.state.admin === false, { w: s.state.watered, a: s.state.admin });

// 3) 물 주기 — 하루 한 번 2
let w = await as(U1, `select public.garden_water('woonpyung')`);
ok('water +2', w.ok && w.watered && near(w.talent_balance, B1 + 2), w);
w = await as(U1, `select public.garden_water('woonpyung')`);
ok('water once a day', w.ok && !w.watered && near(w.talent_balance, B1 + 2), w);

// 4) 어린이: 주일학교 달란트 30+12-5 = 37 (다른 아이 것은 안 섞임)
let k = await as(KID, `select public.garden_sync('woonpyung')`);
ok('kid ss talents 37', near((await led(KID, 'ss_talent')).s, 37) && (await led(KID, 'ss_talent')).n === 3, await led(KID, 'ss_talent'));
ok('kid balance', near(k.state.garden.talent_balance, 37), k.state.garden.talent_balance);
await pg(`insert into public.ss_talents (member_key, amount, reason) values ('테스트_어린이|20150101', 8, '새 지급')`);
k = await as(KID, `select public.garden_sync('woonpyung')`);
ok('kid new ss talent flows', near(k.state.garden.talent_balance, 45) && near(k.new_talent, 8), { b: k.state.garden.talent_balance, n: k.new_talent });

// 5) 마이월렛
let wl = await as(U1, `select public.garden_wallet('woonpyung')`);
ok('wallet', wl.ok && near(wl.balance, B1 + 2) && near(wl.earned, B1 + 2) && near(wl.spent, 0), wl);
ok('wallet by kind labels', wl.by_kind.some((r) => r.label === '교육 이수') && wl.rules.some((r) => r.kind === 'water'), wl.by_kind);

// 6) 땅: 여러 칸 사기(전 10) · 붙지 않은 칸 · 대지로 바꾸기(100) · 관리자 값
let f = await as(U1, `select public.garden_farm('woonpyung')`);
ok('farm prices', near(f.farm.prices.jeon, 10) && near(f.farm.prices.dae, 100) && f.farm.tiles.every((t) => t.land === 'jeon'), f.farm.prices);
let b = await as(U1, `select public.garden_farm_buy_many('woonpyung', '[{"x":2,"y":0},{"x":3,"y":0},{"x":2,"y":1}]'::jsonb)`);
ok('buy many chain', b.ok && b.n === 3 && near(b.spent, 30) && near(b.farm.balance, B1 + 2 - 30) && b.farm.count === 12, b);
b = await as(U1, `select public.garden_farm_buy_many('woonpyung', '[{"x":-2,"y":0},{"x":-4,"y":-4}]'::jsonb)`);
ok('buy many far → none', !b.ok && b.why === 'far', b);
ok('nothing bought on fail', (await pg(`select count(*)::int n from public.garden_tiles where user_id='${U1}'`))[0].n === 12);
b = await as(U1, `select public.garden_farm_buy_many('woonpyung', '[{"x":2,"y":0}]'::jsonb)`);
ok('buy owned', !b.ok && b.why === 'owned', b);
let cv = await as(U1, `select public.garden_farm_convert('woonpyung', '[{"x":0,"y":0}]'::jsonb)`);
ok('convert tree spot no', !cv.ok && cv.why === 'tree', cv);
cv = await as(U1, `select public.garden_farm_convert('woonpyung', '[{"x":3,"y":0}]'::jsonb)`);
ok('convert needs 100', !cv.ok && cv.why === 'talent' && near(cv.need, 100), cv);
let ap = await as(U1, `select public.garden_admin_set_land_prices('woonpyung', 1, 20)`);
ok('non-admin cannot set prices', !ap.ok && ap.why === 'admin', ap);
await as(ADM, `select public.garden_sync('woonpyung')`);
ap = await as(ADM, `select public.garden_admin_set_land_prices('woonpyung', 12, 40)`);
ok('admin sets prices', ap.ok && near(ap.prices.jeon, 12) && near(ap.prices.dae, 40), ap);
await pg(`insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source) values (public.garden_default_church(), '${U1}', 'admin_grant', 'g1', 0, 200, now(), 'admin')`);
cv = await as(U1, `select public.garden_farm_convert('woonpyung', '[{"x":3,"y":0},{"x":2,"y":1}]'::jsonb)`);
ok('convert two at 40', cv.ok && cv.n === 2 && near(cv.spent, 80) && cv.farm.tiles.filter((t) => t.land === 'dae').length === 2, cv);
const B2 = num(cv.farm.balance);
ok('balance after land', near(B2, B1 + 2 + 200 - 30 - 80), B2);
cv = await as(U1, `select public.garden_farm_convert('woonpyung', '[{"x":3,"y":0}]'::jsonb)`);
ok('convert already', !cv.ok && cv.why === 'already', cv);
let pl = await as(U1, `select public.garden_farm_plant('woonpyung', 3, 0, 'lettuce')`);
ok('no planting on 대지', !pl.ok && pl.why === 'dae', pl);
await as(ADM, `select public.garden_admin_set_land_prices('woonpyung', 10, 100)`);

// 7) 꽃집: 사기 → 가방 → 심기 → 수확 시기
let sh = await as(U1, `select public.garden_shop('woonpyung')`);
ok('shop list', sh.ok && sh.items.length === 4 && near(sh.balance, B2), sh.items && sh.items.length);
let by = await as(U1, `select public.garden_shop_buy('woonpyung', 't-olive', 1)`);
ok('unfit not sold', !by.ok && by.why === 'unfit', by);
by = await as(U1, `select public.garden_shop_buy('woonpyung', 't-tomato', 2)`);
ok('buy 2 tomato -10', by.ok && near(by.spent, 10) && near(by.balance, B2 - 10) && by.inventory[0].qty === 2, by);
by = await as(U1, `select public.garden_shop_buy('woonpyung', 't-apple', 99)`);
ok('qty limit', !by.ok && by.why === 'qty', by);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', 1, 0, 't-tomato')`);
ok('plant item', pl.ok && pl.farm.tiles.find((t) => t.x === 1 && t.y === 0).item === 't-tomato' && pl.farm.inventory[0].qty === 1, pl.farm && pl.farm.inventory);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', 1, 0, 't-tomato')`);
ok('plant item busy', !pl.ok && pl.why === 'busy', pl);
pl = await as(U1, `select public.garden_farm_plant_item('woonpyung', 1, 1, 't-apple')`);
ok('plant without item', !pl.ok && pl.why === 'no_item', pl);
let hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 0, 1)`);
ok('harvest too early', !hv.ok && hv.why === 'not_ready', hv);
await pg(`update public.garden_tiles set item_at = now() - interval '61 days' where user_id='${U1}' and x=1 and y=0`);
// 마음(XP): 날은 찼어도 심은 뒤 마음이 하루 10 × 60일 = 600 이 안 되면 못 거둔다
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 0, 1)`);
const xp0 = (await as(U1, `select public.garden_farm('woonpyung')`)).farm.tiles.find((t) => t.x === 1 && t.y === 0).xp_since;
ok('harvest needs xp', !hv.ok && hv.why === 'xp' && hv.need === 600 - xp0 && hv.xp === xp0, { hv, xp0 });
await pg(`insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source) values (public.garden_default_church(), '${U1}', 'test_xp', 'x1', 600, 0, now() - interval '30 days', 'system')`);
let fj = (await as(U1, `select public.garden_farm('woonpyung')`)).farm;
ok('farm xp_since and xp_day', fj.tiles.find((t) => t.x === 1 && t.y === 0).xp_since === xp0 + 600 && +fj.xp_day === 10, { x: fj.tiles.find((t) => t.x === 1 && t.y === 0).xp_since, d: fj.xp_day });
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 0, 1)`);
ok('harvest +0.1', hv.ok && hv.picked && near(hv.farm.balance, B2 - 10 + 0.1), hv);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 0, 1)`);
ok('harvest same fruit today once', hv.ok && !hv.picked, hv);
ok('farm shows today harvested', JSON.stringify(hv.farm.tiles.find((t) => t.x === 1 && t.y === 0).harvested) === '[1]' && hv.farm.water_days.length === 1, { h: hv.farm.tiles.find((t) => t.x === 1 && t.y === 0).harvested, w: hv.farm.water_days });
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 0, 4)`);
ok('harvest per_day limit', !hv.ok && hv.why === 'range', hv);
await pg(`update public.garden_tiles set item_at = now() - interval '130 days' where user_id='${U1}' and x=1 and y=0`);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 0, 2)`);
ok('window waits for xp (grown < 120)', hv.ok && hv.picked, hv);
await pg(`insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source) values (public.garden_default_church(), '${U1}', 'test_xp', 'x2', 700, 0, now() - interval '10 days', 'system')`);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 0, 3)`);
ok('harvest window over', !hv.ok && hv.why === 'not_ready', hv);
// 과일나무: 3년 뒤 수확 달에만
await as(U1, `select public.garden_shop_buy('woonpyung', 't-apple', 1)`);
await as(U1, `select public.garden_farm_plant_item('woonpyung', 1, 1, 't-apple')`);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 1, 1)`);
ok('tree not before years', !hv.ok && hv.why === 'not_ready', hv);
const m = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getMonth() + 1;
await pg(`update public.garden_tiles set item_at = now() - interval '3 years 1 day' where user_id='${U1}' and x=1 and y=1`);
await pg(`update public.garden_shop_items set model = jsonb_set(model, '{harvest_months}', '[${m}]') where slug='t-apple'`);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 1, 4)`);
ok('tree needs xp (1096 days x 10)', !hv.ok && hv.why === 'xp' && hv.need > 9000, hv);
await pg(`insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source) values (public.garden_default_church(), '${U1}', 'test_xp', 'x3', 11000, 0, now() - interval '1 day', 'system')`);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 1, 4)`);
ok('tree harvest in season', hv.ok && hv.picked, hv);
await pg(`update public.garden_shop_items set model = jsonb_set(model, '{harvest_months}', '[${m === 12 ? 1 : m + 1}]') where slug='t-apple'`);
hv = await as(U1, `select public.garden_farm_harvest('woonpyung', 1, 1, 3)`);
ok('tree harvest out of season', !hv.ok && hv.why === 'not_ready', hv);
let cl = await as(U1, `select public.garden_farm_clear('woonpyung', 1, 0)`);
ok('clear item', cl.ok && cl.farm.tiles.find((t) => t.x === 1 && t.y === 0).item === null);
let ip = await as(U1, `select public.garden_admin_set_item_price('woonpyung', 't-rose', 25)`);
ok('non-admin item price', !ip.ok && ip.why === 'admin', ip);
ip = await as(ADM, `select public.garden_admin_set_item_price('woonpyung', 't-rose', 25)`);
ok('admin item price', ip.ok && near(ip.price, 25), ip);

// 8) 잔액 = 장부 합, 권한
s = await as(U1, `select public.garden_sync('woonpyung')`);
const sum = (await pg(`select sum(talent)::text s from public.garden_ledger where user_id='${U1}'`))[0].s;
ok('balance equals ledger', near(s.state.garden.talent_balance, num(sum)), { b: s.state.garden.talent_balance, sum });
ok('anon cannot wallet', !!(await asErr(null, `select public.garden_wallet('woonpyung')`)));
ok('user cannot read others inventory', (await as(KID, `select count(*)::int from public.garden_inventory where user_id = '${U1}'`)) === 0);
ok('user cannot write inventory', !!(await asErr(U1, `insert into public.garden_inventory values (public.garden_default_church(), '${U1}', 't-rose', 5)`)));
ok('user cannot edit shop', !!(await asErr(U1, `update public.garden_shop_items set price = 0`)) || (await pg(`select count(*)::int n from public.garden_shop_items where price = 0`))[0].n === 0);

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
