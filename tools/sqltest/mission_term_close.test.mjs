// 구제선교위원회 회기 마감(20261114_2200) 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 복사해  node mission_term_close.test.mjs <저장소 경로>
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
const ROOT = process.argv[2];
const rd = (f) => fs.readFileSync(path.join(ROOT, "supabase", f), "utf8");
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const ADM = "00000000-0000-0000-0000-000000000001", USR = "00000000-0000-0000-0000-000000000002";
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table public.admins (uid uuid primary key);
create table public.app_settings (key text primary key, value text);
create table public.member_links (user_id uuid primary key, member_key text, member_name text, can_finance boolean not null default false);
create table public.offerings (id serial primary key, category text, offer_date date, amount bigint, member_key text, giver text);
create table public.gyojeok (id serial primary key, name text, member_key text, birth date, role text);
create or replace function public.my_member_keys() returns setof text language sql security definer stable set search_path = public as $$ select member_key from public.member_links where user_id = auth.uid() $$;
create or replace function public.is_finance() returns boolean language sql security definer stable set search_path = public as $$ select exists(select 1 from public.admins a where a.uid = auth.uid()) $$;
insert into auth.users values ('${ADM}'), ('${USR}'); insert into admins values ('${ADM}');`);
for (const f of ["20261110_1900_mission_committee.sql", "20261113_1200_mission_officers_ledger.sql", "20261114_2200_mission_term_close.sql", "20261114_2200_mission_term_close.sql"]) await db.exec(rd(f));
async function as(uid, sql) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ""}', false);`);
  await db.exec(`set session authorization ${uid ? "authenticated" : "anon"}`);
  try { return Object.values((await db.query(sql)).rows[0])[0]; } finally { await db.exec("set session authorization postgres"); }
}
async function err(uid, sql) { try { await as(uid, sql); return null; } catch (e) { return e.message; } }
const base = (await db.query("select fy from mission_fy(null)")).rows[0].fy;
let h = await as(null, "select mission_home()");
ok(h.current === base && h.next === base + 1 && h.years[0] === base + 1 && h.closed.length === 0, "처음: 지금 회기 + 준비 회기");
ok(!!(await err(USR, `select mission_term_close(${base})`)), "관리자 아니면 마감 못 함");
ok(!!(await err(ADM, `select mission_term_close(${base + 1})`)), "준비 회기는 마감 못 함");
h = await as(ADM, `select mission_term_close(${base})`);
ok(h.current === base + 1 && h.years[0] === base + 2 && h.closed[0] === base, "마감하면 다음 회기가 지금, 그다음 회기가 준비로 생김");
const r = (await db.query("select fy, d_from::text from mission_fy(null)")).rows[0];
ok(r.fy === base + 1 && r.d_from === `${base}-12-01`, "mission_fy(null) 도 다음 회기, 12월 1일 시작");
ok((await db.query(`select fy from mission_fy(${base})`)).rows[0].fy === base, "회기를 주면 그대로");
ok(!!(await err(ADM, `select mission_term_reopen(${base - 1})`)), "마지막 마감 회기만 취소");
h = await as(ADM, `select mission_term_reopen(${base})`);
ok(h.current === base && h.closed.length === 0, "마감 취소 → 되돌아감");
ok((await db.query("select count(*)::int n from mission_terms")).rows[0].n === 1, "기록은 남음(지우지 않음)");
ok(!!(await err(USR, "select * from mission_terms")), "표 직접 읽기 막힘");
console.log(`pass ${pass}  fail ${fail}`);
process.exit(fail ? 1 : 0);
