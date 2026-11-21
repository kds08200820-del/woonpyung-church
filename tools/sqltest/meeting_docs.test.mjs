// 회의자료실(당회록 · 공동의회록) · 요람(20261121_1500) 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 복사해  node meeting_docs.test.mjs <저장소 경로>
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
const ROOT = process.argv[2];
const rd = (f) => fs.readFileSync(path.join(ROOT, "supabase", f), "utf8");
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const u = (n) => "00000000-0000-0000-0000-00000000000" + n;
const PASTOR = u(1), ELDER = u(2), RETIRED = u(3), COOP = u(4), BAPT = u(5), INFANT = u(6), PLAIN = u(7), ADMIN = u(8), DEAD = u(9);
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
grant usage on schema public to anon, authenticated;
create schema storage; grant usage on schema storage to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated; grant usage on sequence storage.objects_id_seq to authenticated;
create table public.admins (uid uuid primary key); grant select on public.admins to authenticated;
create table public.member_links (user_id uuid primary key, member_status text not null default '준회원', member_key text, member_name text, can_finance boolean default false, can_broadcast boolean default false, can_accompany boolean default false, can_pastor boolean default false, updated_at timestamptz);
create table public.profiles (id uuid primary key, name text, email text);
create table public.gyojeok (id serial primary key, name text, member_key text, role text, grade text, status text);
insert into admins values ('${ADMIN}');
insert into member_links (user_id, member_status, member_key, member_name) values
 ('${PASTOR}','정회원','목사|1','김동석'), ('${ELDER}','정회원','장로|1',' 신용화'), ('${RETIRED}','정회원','은퇴|1','은퇴'), ('${COOP}','정회원','협동|1','협동'),
 ('${BAPT}','정회원','세례|1','세례'), ('${INFANT}','정회원','유아|1','유아'), ('${PLAIN}','준회원',null,null), ('${DEAD}','정회원','별세|1','별세');
insert into profiles (id, name) select user_id, member_name from member_links;
insert into gyojeok (name, member_key, role, grade, status) values
 ('가','목사|1','담임목사','세례','재적'), ('나','장로|1','시무장로','세례','재적'), ('다','은퇴|1','은퇴장로','세례','재적'),
 ('라','협동|1','협동목사','세례','재적'), ('마','세례|1','집사','세례','재적'), ('바','유아|1','','유아세례','재적'),
 ('사','별세|1','시무장로','세례','별세');`);
await db.exec(rd("20261121_1500_meeting_docs.sql"));
await db.exec(rd("20261121_1500_meeting_docs.sql")); // 두 번 실행해도 안전

async function as(uid, sql, params) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ""}', false);`);
  await db.exec(`set session authorization ${uid ? "authenticated" : "anon"}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("set session authorization postgres"); }
}
async function err(uid, sql, p) { try { await as(uid, sql, p); return null; } catch (e) { return e.message; } }
const one = async (uid, sql, p) => Object.values((await as(uid, sql, p))[0] || {})[0];

ok((await db.query("select count(*)::int n from storage.buckets where id = 'meeting-docs' and public = false")).rows[0].n === 1, "비공개 버킷");
ok((await db.query("select count(*)::int n from member_links where can_session")).rows[0].n === 2, "처음 당회원 2명 지명(김동석·신용화)");

const acc = async (uid) => one(uid, "select meeting_access()");
let a = await acc(PASTOR); ok(a.session && a.session_w && a.congregation && a.congregation_w && a.yoram, "담임목사: 전부");
a = await acc(ELDER);  ok(a.session && a.session_w && a.congregation && a.yoram, "시무장로: 전부");
a = await acc(RETIRED); ok(!a.session && a.congregation && !a.congregation_w, "은퇴장로: 당회록 X, 공동의회록 열람만");
a = await acc(COOP);   ok(!a.session && a.congregation, "협동목사: 당회록 X");
a = await acc(BAPT);   ok(!a.session && a.congregation && !a.congregation_w && a.yoram && !a.yoram_w, "세례교인: 공동의회록·요람 열람만");
a = await acc(INFANT); ok(!a.session && !a.congregation && a.yoram, "유아세례: 공동의회록 X, 요람 O");
a = await acc(PLAIN);  ok(!a.session && !a.congregation && !a.yoram, "준회원: 다 X");
a = await acc(ADMIN);  ok(!a.session && !a.congregation && a.congregation_w && a.yoram && a.yoram_w, "관리자(교적 없음): 당회록 X, 공동의회록 올리기·요람");
a = await acc(DEAD);   ok(!a.session && !a.congregation, "별세 교적은 세례교인으로 안 셈");
ok(!!(await err(null, "select meeting_access()")), "비로그인: 권한 함수도 못 부름");

// 목록 표
const ins = (uid, kind, p) => as(uid, `insert into meeting_docs (kind, title, file_name, path) values ($1, 't', 'f.pdf', $2) returning id`, [kind, p]);
ok(!!(await err(BAPT, "insert into meeting_docs (kind, title, file_name, path) values ('session','t','f','session/x')")), "세례교인은 당회록 못 올림");
ok(!!(await err(ADMIN, "insert into meeting_docs (kind, title, file_name, path) values ('session','t','f','session/x')")), "관리자도 당회록 못 올림");
await ins(PASTOR, "session", "session/1.pdf");
await ins(ELDER, "congregation", "congregation/1.pdf");
await ins(ADMIN, "yoram", "yoram/1.pdf");
ok(!!(await err(PASTOR, "insert into meeting_docs (kind, title, file_name, path) values ('congregation','t','f','session/2.pdf')")), "경로 첫 칸과 종류가 달라야 하면 거절");
ok((await as(BAPT, "select kind from meeting_docs order by kind")).map((r) => r.kind).join() === "congregation,yoram", "세례교인 목록: 공동의회록·요람");
ok((await as(ELDER, "select kind from meeting_docs")).length === 3, "시무장로 목록: 3");
ok((await as(INFANT, "select kind from meeting_docs")).map((r) => r.kind).join() === "yoram", "유아세례 목록: 요람만");
ok((await as(null, "select kind from meeting_docs").catch(() => [])).length === 0, "비로그인 목록 0");
await as(BAPT, "delete from meeting_docs");
ok((await db.query("select count(*)::int n from meeting_docs")).rows[0].n === 3, "세례교인 지우기 0줄");
await as(ADMIN, "delete from meeting_docs where kind = 'session'");
ok((await db.query("select count(*)::int n from meeting_docs where kind='session'")).rows[0].n === 1, "관리자도 당회록 못 지움");

// 파일(storage.objects)
await db.exec("insert into storage.objects (bucket_id, name) values ('meeting-docs','session/1.pdf'), ('meeting-docs','congregation/1.pdf'), ('meeting-docs','yoram/1.pdf'), ('resources','x/1.pdf')");
ok((await as(BAPT, "select name from storage.objects where bucket_id='meeting-docs' order by name")).map((r) => r.name).join() === "congregation/1.pdf,yoram/1.pdf", "세례교인 파일: 당회록 파일은 못 받음");
ok((await as(PASTOR, "select name from storage.objects where bucket_id='meeting-docs'")).length === 3, "담임목사 파일 3");
ok(!!(await err(BAPT, "insert into storage.objects (bucket_id, name) values ('meeting-docs','congregation/2.pdf')")), "세례교인 파일 올리기 X");
ok(!!(await err(ADMIN, "insert into storage.objects (bucket_id, name) values ('meeting-docs','session/2.pdf')")), "관리자 당회록 파일 올리기 X");
await as(ELDER, "insert into storage.objects (bucket_id, name) values ('meeting-docs','session/2.pdf')");
ok((await db.query("select count(*)::int n from storage.objects where name='session/2.pdf'")).rows[0].n === 1, "시무장로 당회록 파일 올리기 O");
// 지명 · 해제
ok((await one(BAPT, `select set_worship_role('${RETIRED}', 'session', true)`)).ok === false, "성도는 당회원 지명 못 함");
ok((await one(ADMIN, `select set_worship_role('${RETIRED}', 'session', true)`)).ok === true, "관리자가 당회원 지명");
ok((await acc(RETIRED)).session === true, "지명되면 당회록 열람");
await one(ADMIN, `select set_worship_role('${RETIRED}', 'session', false)`);
ok((await acc(RETIRED)).session === false, "해제되면 당회록 잠김");
const la = await one(ADMIN, "select list_access()");
ok(la.filter((x) => x.canSession).length === 2, "권한 목록에 canSession");
ok(!!(await err(BAPT, "update member_links set can_session = true")), "성도가 직접 칸을 못 고침");
// 이름이 둘이면 지명 건너뜀
await db.exec("update member_links set can_session = false; insert into member_links (user_id, member_status, member_name) values ('00000000-0000-0000-0000-000000000099','정회원','신용화')");
await db.exec(rd("20261121_1500_meeting_docs.sql"));
ok((await db.query("select count(*)::int n from member_links where can_session")).rows[0].n === 1, "같은 이름 계정이 둘이면 그 이름은 건너뜀");

console.log(`pass ${pass}, fail ${fail}`);
process.exit(fail ? 1 : 0);
