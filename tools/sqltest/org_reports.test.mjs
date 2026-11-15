// 기관 보고서 · 2027 기관 임원(20261115_1100) 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 복사해  node org_reports.test.mjs <저장소 경로>
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
const ROOT = process.argv[2];
const rd = (f) => fs.readFileSync(path.join(ROOT, "supabase", f), "utf8");
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const ADM = "00000000-0000-0000-0000-000000000001", A = "00000000-0000-0000-0000-000000000002", B = "00000000-0000-0000-0000-000000000003";
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table public.admins (uid uuid primary key); grant select on public.admins to authenticated;
create table public.app_settings (key text primary key, value text);
create table public.member_links (user_id uuid primary key, member_key text, member_name text, can_finance boolean not null default false);
create table public.offerings (id serial primary key, category text, offer_date date, amount bigint, member_key text, giver text);
create table public.gyojeok (id serial primary key, name text, member_key text, birth date, role text);
create or replace function public.my_member_keys() returns setof text language sql security definer stable set search_path = public as $$ select member_key from public.member_links where user_id = auth.uid() $$;
create or replace function public.is_finance() returns boolean language sql security definer stable set search_path = public as $$ select exists(select 1 from public.admins a where a.uid = auth.uid()) $$;
insert into auth.users values ('${ADM}'), ('${A}'), ('${B}'); insert into admins values ('${ADM}');
insert into gyojeok (name, member_key) values ('김위원','김위원|1'), ('이서기','이서기|1'), ('박회계','박회계|1'), ('박회계','박회계|2');`);
for (const f of ["20261110_1900_mission_committee.sql", "20261113_1200_mission_officers_ledger.sql", "20261115_1100_org_reports.sql", "20261115_1100_org_reports.sql"]) await db.exec(rd(f));
async function as(uid, sql, params) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ""}', false);`);
  await db.exec(`set session authorization ${uid ? "authenticated" : "anon"}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("set session authorization postgres"); }
}
async function err(uid, sql, p) { try { await as(uid, sql, p); return null; } catch (e) { return e.message; } }
const one = async (uid, sql, p) => Object.values((await as(uid, sql, p))[0] || {})[0];

const off = JSON.stringify([{ role: "위원장", name: "김위원" }, { role: "서기", name: "이서기" }, { role: "회계", name: "박회계" }, { role: "실행위원", name: "새사람" }]);
ok(!!(await err(null, "insert into org_reports (org_name, user_id) values ('남선교회', null)")), "비로그인은 못 씀");
const id = await one(A, `insert into org_reports (org_name, manager_name, officers, user_id, author_name) values ('구제선교위원회', '담당', $1::jsonb, $2, 'A') returning id`, [off, A]);
ok(id > 0, "성도 A 가 보고서를 씀");
ok(!!(await err(A, `insert into org_reports (org_name, user_id) values ('x', '${B}')`)), "남의 이름으로는 못 씀");
ok(!!(await err(A, `update org_reports set status = '승인' where id = ${id}`)), "스스로 승인 못 함");
await as(A, `update org_reports set status = '제출', submitted_at = now() where id = ${id}`);
ok((await as(B, "select id from org_reports")).length === 1, "다른 성도도 목록을 봄");
await as(B, `update org_reports set suggestion = 'x' where id = ${id}`);
ok((await db.query(`select suggestion from org_reports where id = ${id}`)).rows[0].suggestion === "", "남의 보고서는 못 고침(0줄)");
ok(!!(await err(A, `select org_report_approve(${id})`)), "성도는 승인 함수 못 씀");
let r = await one(ADM, `select org_report_approve(${id})`);
ok(r.officers === 4 && r.linked === 2, "승인: 임원 4명, 교적 연결 2명(동명이인 · 없는 이름 제외)");
ok((await db.query(`select status from org_reports where id = ${id}`)).rows[0].status === "승인", "상태 승인");
await as(A, `update org_reports set suggestion = '고침' where id = ${id}`);
ok((await db.query(`select suggestion from org_reports where id = ${id}`)).rows[0].suggestion === "", "승인 뒤에는 쓴 사람도 못 고침");
const list = await one(A, "select org_officer_list(2027)");
ok(list.length === 4 && !JSON.stringify(list).includes("|"), "성도는 임원 명단(교적 키 없이)을 봄");
ok((await as(A, "select * from org_officers")).length === 0, "임원 표 직접 읽기는 관리자만");
const mo = (await db.query("select role, name, member_key from mission_officers where fy_year = 2027 and active order by sort")).rows;
ok(mo.length === 3 && mo[0].role === "위원장" && mo[0].member_key === "김위원|1", "구제선교위원회 임원(권한)에도 들어감 — 실행위원은 제외");
// 다시 승인(고친 보고서) → 예전 줄은 꺼지고 새로
await db.exec(`update org_reports set officers = '[{"role":"위원장","name":"이서기"}]'::jsonb where id = ${id}`);
r = await one(ADM, `select org_report_approve(${id})`);
ok((await db.query("select count(*)::int n from org_officers where active and fy_year = 2027")).rows[0].n === 1, "다시 승인하면 예전 임원은 꺼짐");
ok((await db.query("select count(*)::int n from org_officers")).rows[0].n === 5, "예전 줄은 지우지 않음");
ok((await db.query("select count(*)::int n from mission_officers where active and fy_year = 2027")).rows[0].n === 1, "위원회 임원도 바뀜");
// 돌려보내기
const id2 = await one(B, `insert into org_reports (org_name, user_id, status) values ('남선교회', $1, '제출') returning id`, [B]);
ok(await one(ADM, `select org_report_return(${id2}, '예산 사유를 적어 주세요')`) === true, "돌려보냄");
await as(B, `update org_reports set status = '제출' where id = ${id2}`);
ok((await db.query(`select status from org_reports where id = ${id2}`)).rows[0].status === "제출", "돌려받은 보고서를 고쳐 다시 제출");
console.log(`pass ${pass}  fail ${fail}`);
process.exit(fail ? 1 : 0);
