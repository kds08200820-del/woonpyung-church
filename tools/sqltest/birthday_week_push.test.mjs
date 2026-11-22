// 매주 월요일 생일자 알림(20261122_1200) 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 복사해  node birthday_week_push.test.mjs <저장소 경로>
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
const ROOT = process.argv[2];
const rd = (f) => fs.readFileSync(path.join(ROOT, "supabase", f), "utf8");
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const ADMIN = "00000000-0000-0000-0000-000000000001", USER = "00000000-0000-0000-0000-000000000002";
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table public.admins (uid uuid primary key); grant select on public.admins to authenticated;
create table public.gyojeok (id bigint generated always as identity primary key, name text, birth date, role text, groups text, status text, phone text);
insert into admins values ('${ADMIN}');
insert into gyojeok (name, birth, role, groups, status, phone) values
 ('월요일생', '1970-11-23', '장로', '1구역', '정회원', '010-0000-0001'),
 ('일요일생', '1985-11-29', '집사', '2구역', '정회원후보', null),
 ('다음주생', '1990-11-30', null, null, '정회원후보', null),
 ('지난주생', '1960-11-22', null, null, '정회원후보', null),
 ('윤일생',   '2000-02-29', null, null, '정회원후보', null),
 ('연말생',   '1975-12-31', null, null, '정회원후보', null),
 ('새해생',   '1978-01-02', null, null, '정회원후보', null),
 ('생일없음', null,         null, null, '헌금등록', null);`);
await db.exec(rd("20261122_1200_birthday_week_push.sql"));
await db.exec(rd("20261122_1200_birthday_week_push.sql")); // 두 번 실행해도 안전

async function as(uid, sql, params) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ""}', false);`);
  await db.exec(`set session authorization ${uid ? "authenticated" : "anon"}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("set session authorization postgres"); }
}
async function err(uid, sql, p) { try { await as(uid, sql, p); return null; } catch (e) { return e.message; } }
const one = async (uid, sql, p) => Object.values((await as(uid, sql, p))[0] || {})[0];

// 열쇠: 관리자만, 같은 열쇠를 다시 돌려줌
const k1 = await one(ADMIN, "select bday_my_push_key()");
const k2 = await one(ADMIN, "select bday_my_push_key()");
ok(typeof k1 === "string" && k1.length === 32 && k1 === k2, "관리자 열쇠 32자, 다시 불러도 같음");
ok((await one(USER, "select bday_my_push_key()")) === null, "일반 로그인은 열쇠 없음");
ok(!!(await err(null, "select bday_my_push_key()")), "비로그인은 열쇠 함수 못 부름");
ok(!!(await err(USER, "select * from bday_push_keys")) || (await as(USER, "select * from bday_push_keys")).length === 0, "열쇠 표 직접 읽기 막힘");

// 피드: 2026-11-23(월) 기준 주 = 11/23~11/29
let f = await one(null, "select bday_push_feed('2026-11-23')");
ok(f.week_start === "2026-11-23" && f.week_end === "2026-11-29", "월요일 기준 주 " + f.week_start + "~" + f.week_end);
ok(f.week_n === 2, "이번 주 2명(월·일요일생) — " + f.week_n);
ok(f.month === "2026-11" && f.month_n === 4, "11월 4명 — " + f.month_n);
ok(JSON.stringify(f.keys) === JSON.stringify([k1]), "관리자 열쇠만");
ok(!JSON.stringify(f).includes("요일생") && !JSON.stringify(f).includes("1970"), "피드에 이름·생년월일 없음");
f = await one(null, "select bday_push_feed('2026-11-26')");
ok(f.week_start === "2026-11-23" && f.week_n === 2, "주 중간(목)이어도 그 주 월요일부터");
f = await one(null, "select bday_push_feed('2026-11-29')");
ok(f.week_start === "2026-11-23", "일요일은 그 주 끝날");
// 해를 넘는 주: 2026-12-28(월)~2027-01-03
f = await one(null, "select bday_push_feed('2026-12-28')");
ok(f.week_n === 2, "해 넘는 주에 12/31·1/2 생 2명 — " + f.week_n);
// 윤일생: 평년 2027 은 2/28 로
f = await one(null, "select bday_push_feed('2027-02-22')");
ok(f.week_n === 1, "평년 2/28 주에 2/29 생 1명 — " + f.week_n);
f = await one(null, "select bday_push_feed('2028-02-28')");
ok(f.week_n === 1, "윤년 2028 2/29 주에 1명 — " + f.week_n);

// 명단: 관리자만, 전화 같은 칸 없음
const rows = await as(ADMIN, "select * from bday_list('2026-11-23', '2026-11-29')");
ok(rows.map(r => r.name).join() === "월요일생,일요일생", "명단 날짜순 2명");
ok(rows[0].birth_year === 1970 && String(rows[0].on_date).length > 0 && rows[0].role === "장로" && rows[0].groups === "1구역", "명단 칸: 날짜·태어난 해·직책·구역");
ok(!("phone" in rows[0]) && !("birth" in rows[0]), "명단에 전화·생년월일 칸 없음");
ok(!!(await err(USER, "select * from bday_list('2026-11-23','2026-11-29')")), "일반 로그인은 명단 못 봄");
ok(!!(await err(null, "select * from bday_list('2026-11-23','2026-11-29')")), "비로그인은 명단 못 봄");
ok(!!(await err(ADMIN, "select * from bday_list('2026-01-01','2027-06-01')")), "1년 넘는 기간 거절");
const yr = await as(ADMIN, "select * from bday_list('2026-12-28', '2027-01-03')");
ok(yr.map(r => r.name).join() === "연말생,새해생", "해 넘는 기간 명단");

console.log(`pass ${pass} / fail ${fail}`);
process.exit(fail ? 1 : 0);
