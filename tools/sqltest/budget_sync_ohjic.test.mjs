// 예산 오직 일치(20261110_1700) 마이그레이션 시험 — PGlite. 전표·교인 자료 없음(예산 계정표만).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후
//   node budget_sync_ohjic.test.mjs <저장소 경로> <실행 전 예산 JSON> <기대값 JSON>
//   실행 전 예산 JSON = budget 표 행 배열, 기대값 JSON = { O: [오직 계정…], left: [남는 코드…], nH: 실행 전 행 수 }
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const [ROOT, BEFORE, EXPECT] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(BEFORE, 'utf8'));
const exp = JSON.parse(fs.readFileSync(EXPECT, 'utf8'));
const sql = fs.readFileSync(path.join(ROOT, 'supabase/20261110_1700_budget_sync_ohjic.sql'), 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) pass++; else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } }
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

await db.exec(`create table public.budget (id bigint generated always as identity primary key, code text, name text, atype text,
  prev_budget bigint default 0, prev_actual bigint default 0, budget bigint default 0);`);
for (const r of before) await db.exec(`insert into public.budget (id, code, name, atype, prev_budget, prev_actual, budget) overriding system value values (${r.id}, ${q(r.code)}, ${q(r.name)}, ${q(r.atype)}, ${r.prev_budget}, ${r.prev_actual}, ${r.budget});`);
await db.exec(`select setval(pg_get_serial_sequence('public.budget','id'), (select max(id) from public.budget));`);

ok('파괴적 구문 없음', !/\b(drop|delete|truncate)\b/i.test(sql.replace(/--.*$/gm, '')));

for (let run = 1; run <= 2; run++) {
  await db.exec(sql);
  const rows = (await db.query('select * from public.budget order by code')).rows;
  const by = {}; rows.forEach((r) => { (by[r.code] = by[r.code] || []).push(r); });
  ok(`run${run} 코드 중복 없음`, Object.values(by).every((a) => a.length === 1));
  ok(`run${run} 행 수`, rows.length === exp.O.length + exp.left.length, rows.length);
  let bad = [];
  for (const o of exp.O) { const r = (by[o.code] || [])[0]; if (!r || r.name !== o.name || r.atype !== o.atype || Number(r.budget) !== o.budget || Number(r.prev_budget) !== o.prev_budget || Number(r.prev_actual) !== o.prev_actual) bad.push(o.code); }
  ok(`run${run} 오직 계정 130개 값 일치`, bad.length === 0, bad);
  ok(`run${run} 남는 계정 예산 0`, exp.left.every((c) => by[c] && Number(by[c][0].budget) === 0));
  const leaf = (t) => rows.filter((r) => r.atype === t && !/0000$/.test(r.code)).reduce((s, r) => s + Number(r.budget), 0);
  ok(`run${run} 수입 예산 합 1.8억`, leaf('수입') === 180000000, leaf('수입'));
  ok(`run${run} 지출 예산 합 1.8억`, leaf('지출') === 180000000, leaf('지출'));
  // 옮긴 계정은 원래 행(id)을 그대로 쓴다
  for (const [a, b] of exp.moves) { const old = before.find((r) => r.code === a); ok(`run${run} 이동 ${a}→${b} 같은 id`, by[b] && Number(by[b][0].id) === old.id); }
  const bk = (await db.query('select count(*)::int as n from public.budget_backup_20261110')).rows[0].n;
  ok(`run${run} 백업 표 = 실행 전 행 수`, bk === exp.nH, bk);
}
// 되돌리기(주석의 update) 시험
await db.exec(`update public.budget b set code = k.code, name = k.name, atype = k.atype, budget = k.budget, prev_budget = k.prev_budget, prev_actual = k.prev_actual
  from public.budget_backup_20261110 k where k.id = b.id;`);
const back = (await db.query('select * from public.budget where id in (select id from public.budget_backup_20261110) order by id')).rows;
ok('되돌리기: 원래 값', before.every((r) => { const x = back.find((y) => Number(y.id) === r.id); return x && x.code === r.code && x.name === r.name && Number(x.budget) === r.budget; }));
console.log(`pass ${pass} fail ${fail}`);
process.exit(fail ? 1 : 0);
