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
const ADM = "00000000-0000-0000-0000-000000000001", USR = "00000000-0000-0000-0000-000000000002", OFF = "00000000-0000-0000-0000-000000000003";
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
insert into auth.users values ('${ADM}'), ('${USR}'), ('${OFF}'); insert into admins values ('${ADM}');
insert into member_links (user_id, member_key, member_name) values ('${USR}', '김성도|19800101', '김성도'), ('${OFF}', '이회계|19700101', '이회계');`);
for (const f of ["20261110_1900_mission_committee.sql", "20261113_1200_mission_officers_ledger.sql", "20261114_1500_mission_regular_members.sql", "20261114_2200_mission_term_close.sql", "20261114_2200_mission_term_close.sql"]) await db.exec(rd(f));
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
// ── 회계 보고 열람 기간 ──
const w26 = (await db.query("select d_from::text f, d_to::text t, custom, rmode, is_open from mission_report_window(2026)")).rows[0];
ok(w26.f === "2026-11-15" && w26.t === "2026-12-12" && !w26.custom && w26.rmode === "auto", "기본 기간 2026: 11/15 ~ 12/12");
const w27 = (await db.query("select d_from::text f, d_to::text t from mission_report_window(2027)")).rows[0];
ok(w27.f === "2027-11-21" && w27.t === "2027-12-11", "기본 기간 2027: 11/21 ~ 12/11");
const fy = base;
const day = (await db.query("select ((now() at time zone 'Asia/Seoul')::date)::text d")).rows[0].d;
await db.exec(`insert into offerings (category, offer_date, amount, member_key) select '선교헌금', d_from + 1, 1000, '김성도|19800101' from mission_fy(${fy});
  insert into mission_officers (fy_year, role, name, member_key) values (${fy}, '회계', '이회계', '이회계|19700101');
  insert into app_settings values ('mission_report_${fy}', '{"title":"t","summary":[]}');`);
ok(!!(await err(USR, `select mission_report_window_set(${fy}, null, null, 'open')`)), "성도는 공개 전환 못 함");
let w = await as(OFF, `select mission_report_window_set(${fy}, null, null, 'closed')`);
ok(w.mode === "closed" && w.open === false, "임원(회계)이 비공개로");
ok((await as(USR, `select mission_report(${fy})`)) === null, "비공개면 회원에게 안 보임");
let rr = await as(OFF, `select mission_report(${fy})`);
ok(rr && rr.window && rr.window.staff === true && rr.window.open === false, "임원에게는 늘 보임(기간 정보 함께)");
w = await as(OFF, `select mission_report_window_set(${fy}, null, null, 'open')`);
ok(w.open === true && (await as(USR, `select mission_report(${fy})`)) !== null, "공개로 바꾸면 회원에게 보임");
await as(OFF, `select mission_report_window_set(${fy}, '${day}'::date - 1, '${day}'::date + 1, 'auto')`);
ok((await as(USR, `select mission_report(${fy})`)) !== null, "자동: 오늘이 기간 안이면 보임");
await as(OFF, `select mission_report_window_set(${fy}, '${day}'::date + 1, '${day}'::date + 3, 'auto')`);
ok((await as(USR, `select mission_report(${fy})`)) === null, "자동: 기간 밖이면 안 보임");
ok(!!(await err(OFF, `select mission_report_window_set(${fy}, '${day}'::date + 3, '${day}'::date, 'auto')`)), "시작이 끝보다 늦으면 오류");
ok(!!(await err(OFF, `select mission_report_window_set(${fy}, null, null, 'x')`)), "방식 값 검사");
w = await as(ADM, `select mission_report_window_set(${fy}, null, null, 'auto')`);
ok(w.custom === false, "날짜 비우면 기본값");
// ── 자동 승인 ──
let me = await as(USR, "select mission_join_apply(null, '')");
ok(me.member && me.member.status === "정회원" && me.member.approved_at, "신청하면 바로 정회원");
me = await as(USR, "select mission_join_cancel()");
me = await as(USR, "select mission_join_apply(null, '다시')");
ok(me.member.status === "정회원", "탈퇴 뒤 다시 신청해도 바로 정회원");
console.log(`pass ${pass}  fail ${fail}`);
process.exit(fail ? 1 : 0);
