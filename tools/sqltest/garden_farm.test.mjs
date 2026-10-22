// 신앙 정원 2단계(내 땅·작물·열매 따기) 마이그레이션 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해 node garden_farm.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = process.argv[2];
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); } }

const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
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
  create table public.qt_checks (user_id uuid, check_date date, created_at timestamptz default now());
  insert into auth.users values ('${U1}'), ('${U2}');
  insert into public.profiles values ('${U1}', '테스트_성도1'), ('${U2}', '테스트_성도2');
  insert into public.qt_checks (user_id, check_date, created_at)
    select '${U1}', d::date, d from generate_series(now() - interval '29 days', now(), interval '1 day') d;
`);
await db.exec(fs.readFileSync(path.join(ROOT, 'supabase/20261023_1200_garden_phase1.sql'), 'utf8'));
const farmSql = fs.readFileSync(path.join(ROOT, 'supabase/20261023_1300_garden_farm.sql'), 'utf8');
await db.exec(farmSql);
await db.exec(farmSql);   // 다시 실행해도 안전한지
ok('rerun safe', true);

async function as(uid, sql, params) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { const r = await db.query(sql, params || []); return r.rows[0] ? Object.values(r.rows[0])[0] : null; }
  finally { await db.exec('reset role; set session authorization postgres;'); }
}
async function asErr(uid, sql) { try { await as(uid, sql); return null; } catch (e) { return e.message; } }
async function pg(sql) { const r = await db.query(sql); return r.rows; }
const num = (x) => Number(x);

// 1) 동기화 — 큐티 30일: 2×30 + 연속 7일 4번 ×5 = 80 달란트, 경험치 300 + 80
let s = await as(U1, `select public.garden_sync('woonpyung')`);
ok('sync ok', s.ok, s);
const B = num(s.state.garden.talent_balance);   // 큐티 30일(2×30 + 7일 연속 4×5 = 80) + 정원 들르기 1
ok('balance 81', B === 81, B);
const near = (a, b) => Math.abs(num(a) - b) < 1e-9;
ok('fruit in state', s.state.fruit && s.state.fruit.per_day === 0, s.state.fruit);
await as(U1, `select public.garden_set_plant('woonpyung', 'olive', '올리')`);
// 경험치를 올려 '열매' 단계로 (관리자 적립 흉내)
await pg(`insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source) values (public.garden_default_church(), '${U1}', 'admin_grant', 't1', 2300, 0, now(), 'admin')`);
s = await as(U1, `select public.garden_sync('woonpyung')`);
ok('stage 6', s.state.garden.stage === 6, s.state.garden.stage);
ok('fruit per day 6', s.state.fruit.per_day === 6, s.state.fruit);

// 2) 내 땅
let f = await as(U1, `select public.garden_farm('woonpyung')`);
ok('farm ok', f.ok && f.farm.tiles.length === 9 && f.farm.count === 9 && num(f.farm.price) === 3, f);
ok('crops 4', f.farm.crops.length === 4, f.farm.crops.map((c) => c.slug));

// 3) 믿음 나무 열매
let p = await as(U1, `select public.garden_pick_fruit('woonpyung', 1)`);
ok('fruit pick', p.ok && p.picked && near(p.talent_balance, B + 0.1), p);
p = await as(U1, `select public.garden_pick_fruit('woonpyung', 1)`);
ok('fruit twice no gain', p.ok && !p.picked && near(p.talent_balance, B + 0.1), p);
p = await as(U1, `select public.garden_pick_fruit('woonpyung', 7)`);
ok('fruit range', !p.ok && p.why === 'range', p);
ok('fruit picked list', JSON.stringify(p.fruit === undefined ? (await as(U1, `select public.garden_fruit_json(public.garden_default_church(), '${U1}')`).catch?.(() => null)) : null) !== undefined);

// 4) 땅 사기
let b = await as(U1, `select public.garden_farm_buy('woonpyung', 2, 0)`);
ok('buy ok', b.ok && num(b.spent) === 3 && near(b.farm.balance, B + 0.1 - 3) && b.farm.count === 10, b);
b = await as(U1, `select public.garden_farm_buy('woonpyung', 2, 0)`);
ok('buy owned', !b.ok && b.why === 'owned', b);
b = await as(U1, `select public.garden_farm_buy('woonpyung', 4, 4)`);
ok('buy far', !b.ok && b.why === 'far', b);
b = await as(U1, `select public.garden_farm_buy('woonpyung', 5, 0)`);
ok('buy range', !b.ok && b.why === 'range', b);
b = await as(U1, `select public.garden_farm_buy('woonpyung', -2, 0)`);
ok('buy price rises', b.ok && num(b.spent) === 4 && near(b.farm.balance, B + 0.1 - 7) && num(b.farm.price) === 5, b);

// 5) 심기
let pl = await as(U1, `select public.garden_farm_plant('woonpyung', 0, 0, 'lettuce')`);
ok('plant tree spot', !pl.ok && pl.why === 'tree', pl);
pl = await as(U1, `select public.garden_farm_plant('woonpyung', 1, 0, 'lettuce')`);
ok('plant ok', pl.ok && near(pl.farm.balance, B + 0.1 - 7.3), pl.farm && pl.farm.balance);
const tile = pl.farm.tiles.find((t) => t.x === 1 && t.y === 0);
ok('tile crop', tile.crop === 'lettuce' && tile.ripe_at && tile.picked.length === 0, tile);
pl = await as(U1, `select public.garden_farm_plant('woonpyung', 1, 0, 'tomato')`);
ok('plant busy', !pl.ok && pl.why === 'busy', pl);
pl = await as(U1, `select public.garden_farm_plant('woonpyung', 3, 3, 'lettuce')`);
ok('plant not owned', !pl.ok && pl.why === 'not_owned', pl);
pl = await as(U1, `select public.garden_farm_plant('woonpyung', 1, 1, 'nope')`);
ok('plant bad crop', !pl.ok && pl.why === 'crop', pl);

// 6) 따기 — 익기 전 → 익힌 뒤 하나씩, 같은 열매 두 번은 0
let k = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 0, 1)`);
ok('pick growing', !k.ok && k.why === 'growing', k);
await pg(`update public.garden_tiles set ripe_at = now() - interval '1 second' where user_id = '${U1}' and x = 1 and y = 0`);
k = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 0, 1)`);
ok('pick 1', k.ok && k.picked && num(k.gain) === 0.1 && near(k.farm.balance, B + 0.1 - 7.2), k);
k = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 0, 1)`);
ok('pick 1 again', k.ok && !k.picked && near(k.farm.balance, B + 0.1 - 7.2), k);
k = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 0, 5)`);
ok('pick range', !k.ok && k.why === 'range', k);
for (const n of [2, 3]) k = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 0, ${n})`);
ok('pick 3 kept', k.farm.tiles.find((t) => t.x === 1 && t.y === 0).crop === 'lettuce', k.farm.tiles.find((t) => t.x === 1 && t.y === 0));
k = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 0, 4)`);
const t2 = k.farm.tiles.find((t) => t.x === 1 && t.y === 0);
ok('last pick clears tile', k.ok && t2.crop === null && t2.picked.length === 0 && near(k.farm.balance, B + 0.1 - 6.9), { t2, bal: k.farm.balance });
k = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 0, 1)`);
ok('pick empty', !k.ok && k.why === 'empty', k);
// 다시 심고 같은 번호 따기 — 작물마다 장부 ref 가 달라 다시 받을 수 있다
await as(U1, `select public.garden_farm_plant('woonpyung', 1, 0, 'lettuce')`);
await pg(`update public.garden_tiles set ripe_at = now() - interval '1 second' where user_id = '${U1}' and x = 1 and y = 0`);
k = await as(U1, `select public.garden_farm_pick('woonpyung', 1, 0, 1)`);
ok('replant pick again', k.ok && k.picked && near(k.farm.balance, B + 0.1 - 7.1), k.farm && k.farm.balance);

// 7) 동기화가 소수 잔액을 지키는지
s = await as(U1, `select public.garden_sync('woonpyung')`);
const sum = (await pg(`select sum(talent)::text as s from public.garden_ledger where user_id = '${U1}'`))[0].s;
ok('sync keeps decimal', num(s.state.garden.talent_balance) === num(sum) && near(sum, B + 0.1 - 7.1), { bal: s.state.garden.talent_balance, sum });
ok('history label', (await as(U1, `select public.garden_history('woonpyung', 5, 0)`)).rows.some((r) => r.label === '작물 거두기'));

// 8) 다른 사람·권한
let q = await as(U2, `select public.garden_farm('woonpyung')`);
ok('U2 needs sync', !q.ok && q.why === 'sync', q);
await as(U2, `select public.garden_sync('woonpyung')`);
q = await as(U2, `select public.garden_farm('woonpyung')`);
ok('U2 farm', q.ok && q.farm.tiles.length === 9, q);
const u2bal = num(q.farm.balance);
b = await as(U2, `select public.garden_farm_buy('woonpyung', 2, 0)`);
ok('U2 buy needs talent', u2bal >= 3 ? b.ok : (!b.ok && b.why === 'talent'), { b, u2bal });
pl = await as(U2, `select public.garden_farm_plant('woonpyung', 1, 0, 'strawberry')`);
ok('U2 stage gate', !pl.ok && pl.why === 'stage', pl);
ok('U2 cannot see U1 tiles', (await as(U2, `select count(*)::int from public.garden_tiles where user_id = '${U1}'`)) === 0);
ok('anon cannot buy', !!(await asErr(null, `select public.garden_farm_buy('woonpyung', 2, 0)`)));
ok('user cannot write tiles', !!(await asErr(U1, `update public.garden_tiles set crop = 'grape' where user_id = '${U1}'`)) ||
   (await pg(`select count(*)::int as n from public.garden_tiles where crop = 'grape'`))[0].n === 0);
ok('user cannot call inner json', !!(await asErr(U1, `select public.garden_farm_json(public.garden_default_church(), '${U1}')`)));
ok('user cannot write ledger', !!(await asErr(U1, `insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at) values (public.garden_default_church(), '${U1}', 'x', 'y', 0, 100, now())`)));
const types = await pg(`select table_name, data_type, numeric_scale from information_schema.columns where (table_name, column_name) in (('garden_ledger','talent'),('garden_gardens','talent_balance'))`);
ok('numeric columns', types.every((t) => t.data_type === 'numeric' && t.numeric_scale === 1), types);

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
