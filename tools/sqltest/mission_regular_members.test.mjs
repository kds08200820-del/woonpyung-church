// 가짜 자료로 20261114_1500 마이그레이션(구제선교위원회 정회원 · 회비 · 계좌)을 PGlite 에서 실제 실행해 본다
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// 실행: (pglite 가 있는 곳에서) node tools/sqltest/mission_regular_members.test.mjs
const SUP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase") + path.sep;
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const U = { pastor: "00000000-0000-0000-0000-000000000001", acct: "00000000-0000-0000-0000-000000000002", sec: "00000000-0000-0000-0000-000000000003",
  kim: "00000000-0000-0000-0000-000000000004", lee: "00000000-0000-0000-0000-000000000005", nobody: "00000000-0000-0000-0000-000000000006" };

await db.exec(`
create role anon; create role authenticated; create role authenticator;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table public.admins (uid uuid primary key);
create table public.app_settings (key text primary key, value text);
create table public.member_links (user_id uuid primary key, member_status text default '정회원', member_key text, member_name text, can_finance boolean not null default false, spouse_key text);
create table public.gyojeok (id serial primary key, name text, member_key text, birth date, role text);
create table public.offerings (id serial primary key, category text, offer_date date, amount bigint, member_key text, giver text);
create or replace function public.my_member_keys() returns setof text language sql security definer stable set search_path = public as $$
  select member_key from public.member_links where user_id = auth.uid() and coalesce(member_key,'') <> '' $$;
create or replace function public.is_finance() returns boolean language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.admins a where a.uid = auth.uid()) or exists(select 1 from public.member_links m where m.user_id = auth.uid() and m.can_finance) $$;
`);
for (const u of Object.values(U)) await db.query("insert into auth.users values ($1)", [u]);
await db.exec(`
insert into admins values ('${U.pastor}');
insert into member_links (user_id, member_key, member_name) values
 ('${U.acct}', '신회계|19700101', '신회계'), ('${U.sec}', '신서기|19710101', '신서기'),
 ('${U.kim}', '김정회|19800101', '김정회'), ('${U.lee}', '', '');
insert into gyojeok (name, member_key) values ('신회계','신회계|19700101'),('신서기','신서기|19710101'),('김정회','김정회|19800101'),
 ('박할머니','박할머니|19400101'),('최동명','최동명|19500101'),('최동명','최동명|19600101'),('이새신','이새신|19900101');
update gyojeok set birth = to_date(split_part(member_key, '|', 2), 'YYYYMMDD'), role = '집사';
`);
for (const f of ["20261110_1900_mission_committee.sql", "20261113_1200_mission_officers_ledger.sql", "20261114_1500_mission_regular_members.sql"])
  await db.exec(fs.readFileSync(SUP + f, "utf8"));
// 두 번 실행해도 안전한지
await db.exec(fs.readFileSync(SUP + "20261114_1500_mission_regular_members.sql", "utf8"));

const fy = (await db.query("select fy from mission_fy(null)")).rows[0].fy;
await db.exec(`insert into mission_officers (fy_year, role, name, member_key) values (${fy}, '회계', '신회계', '신회계|19700101'), (${fy}, '서기', '신서기', '신서기|19710101');`);

async function as(uid, sql, params) {
  await db.exec(`set session authorization postgres; select set_config('test.uid', '${uid || ""}', false);`);
  await db.exec(`set session authorization ${uid ? "authenticated" : "anon"}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("set session authorization postgres"); }
}
async function err(uid, sql, params) { try { await as(uid, sql, params); return null; } catch (e) { return e.message; } }
const one = async (uid, sql, p) => Object.values((await as(uid, sql, p))[0])[0];

// 직접 표 읽기 막힘
ok(!!(await err(U.kim, "select * from mission_regular_members")), "표 직접 읽기는 막혀야");
ok((await one(null, "select mission_join_me()")) === null, "비로그인은 null");
ok(!!(await err(null, "select mission_join_apply('x','')")), "비로그인 신청 불가");

// 1) 김정회(교적 연결) 신청
let me = await one(U.kim, "select mission_join_me()");
ok(me.member === null && me.linked === true && me.name === "김정회", "신청 전 상태");
me = await one(U.kim, "select mission_join_apply(null, '함께하고 싶습니다')");
ok(me.member.status === "신청" && me.member.linked, "신청 → 신청 상태");
me = await one(U.kim, "select mission_join_apply(null, '두 번')");
const cnt = (await db.query("select count(*)::int n from mission_regular_members")).rows[0].n;
ok(cnt === 1, "두 번 신청해도 한 줄");

// 2) 교적 미연결 계정 — 이름 필수
ok((await err(U.lee, "select mission_join_apply(null, '')")) || "" , "이름 없으면 오류");
me = await one(U.lee, "select mission_join_apply('이새신', '')");
ok(me.member.status === "신청" && me.member.linked === false && me.linked === false, "미연결 신청");

// 3) 명부 — 일반 성도는 null, 서기·회계·관리자는 보임
ok((await one(U.kim, "select mission_roster(null)")) === null, "일반 성도 명부 안 보임");
let ro = await one(U.sec, "select mission_roster(null)");
ok(ro && ro.members.length === 2 && ro.can_dues === false, "서기는 명부는 보고 회비 체크는 못 함");
ok(!JSON.stringify(ro).includes("19800101"), "교적 키를 내보내지 않음");
ro = await one(U.acct, "select mission_roster(null)");
ok(ro.can_dues === true, "회계는 회비 체크 가능");
const kimId = ro.members.find((m) => m.name === "김정회").id, leeId = ro.members.find((m) => m.name === "이새신").id;

// 4) 승인 — 일반 성도 불가, 서기 가능
ok(!!(await err(U.kim, `select mission_member_set(${kimId}, '정회원')`)), "본인 승인 불가");
await as(U.sec, `select mission_member_set(${kimId}, '정회원', true, '추천 받음')`);
me = await one(U.kim, "select mission_join_me()");
ok(me.member.status === "정회원" && me.member.exec === true && me.member.approved_at, "승인 + 실행위원");
ok(!JSON.stringify(me).includes("추천 받음"), "임원 메모는 본인에게 안 보임");

// 5) 교적 연결 다시 시도: 이새신 계정 → 교적 같은 이름 한 분
let lk = await one(U.sec, `select mission_member_link(${leeId})`);
ok(lk.linked === true, "같은 이름 한 분이면 연결");
// 6) 대신 올리기 — 박할머니(교적 1명) 연결, 최동명(동명이인) 미연결, 중복 오류
let ad = await one(U.sec, "select mission_member_add('박할머니')");
ok(ad.linked === true, "대신 올리기 교적 연결");
ad = await one(U.sec, "select mission_member_add('최동명')");
ok(ad.linked === false, "동명이인은 연결 안 함");
ok(!!(await err(U.sec, "select mission_member_add('박할머니')")), "중복 올리기 막힘");
ok(!!(await err(U.kim, "select mission_member_add('홍길동')")), "일반 성도는 대신 올리기 불가");

// 7) 회비 — 서기 불가, 회계 가능, 기본 금액, 해제는 지우지 않고 paid=false
ok(!!(await err(U.sec, `select mission_dues_set(${kimId}, ${fy}, '12', true)`)), "서기는 회비 체크 불가");
let cells = await one(U.acct, `select mission_dues_set(${kimId}, ${fy}, '12', true)`);
ok(cells["12"].amount === 10000, "월 회비 기본 1만");
cells = await one(U.acct, `select mission_dues_set(${kimId}, ${fy}, '01', true, 15000, '2026-01-05', '현금')`);
ok(cells["01"].amount === 15000 && cells["01"].note === "현금", "금액·메모 지정");
cells = await one(U.acct, `select mission_dues_set(${kimId}, ${fy}, '12', false)`);
ok(!cells["12"] && cells["01"], "해제하면 칸에서 빠짐");
const rows = (await db.query("select count(*)::int n from mission_dues")).rows[0].n;
ok(rows === 2, "해제해도 줄은 남음(지우지 않음)");
ok(!!(await err(U.acct, `select mission_dues_set(${kimId}, ${fy}, '13', true)`)), "칸 이름 검사");
// 임원 회비: 신회계를 명부에 올리면 2만
ad = await one(U.pastor, "select mission_member_add('신회계')");  // 관리자
cells = await one(U.acct, `select mission_dues_set(${ad.id}, ${fy}, '연납', true)`);
ok(cells["연납"].amount === 240000, "임원 연납 기본 24만");
cells = await one(U.acct, `select mission_dues_set(${kimId}, ${fy}, '연납', true)`);
ok(cells["연납"].amount === 100000, "정회원 연납 기본 10만");
ro = await one(U.acct, "select mission_roster(null)");
ok(ro.members.find((m) => m.name === "신회계").officer === true, "임원 표시");

// 8) 본인 대시보드 값
me = await one(U.kim, "select mission_join_me()");
ok(me.dues["01"] && me.dues["연납"] && me.rate === 10000, "본인 회비 보임");
// 신회계 계정은 대신 올린 줄에 자동으로 이어짐
me = await one(U.acct, "select mission_join_me()");
ok(me.member && me.member.status === "정회원" && me.rate === 20000, "대신 올린 줄 = 내 줄(교적 키)");

// 9) 탈퇴 → 다시 신청
me = await one(U.kim, "select mission_join_cancel()");
ok(me.member.status === "탈퇴" && me.member.exec === false, "탈퇴하면 실행위원도 꺼짐");
me = await one(U.kim, "select mission_join_apply(null, '다시')");
ok(me.member.status === "신청", "다시 신청");
// 10) 반려
await as(U.sec, `select mission_member_set(${kimId}, '반려')`);
me = await one(U.kim, "select mission_join_me()");
ok(me.member.status === "반려" && !me.member.approved_at, "반려");
ok(!!(await err(U.sec, `select mission_member_set(${kimId}, '없는상태')`)), "상태 값 검사");

// 11) 회비 계좌
me = await one(U.kim, "select mission_join_me()");
ok(me.pay === null, "계좌 정하기 전에는 pay 없음");
ok(!!(await err(U.sec, "select mission_pay_set('농협','351-0000-0000-00','구제선교위원회','')")), "서기는 계좌 못 정함");
ok(!!(await err(U.kim, "select mission_pay_set('농협','1','x','')")), "성도는 계좌 못 정함");
let pay = await one(U.acct, "select mission_pay_set('농협','351-0000-0000-00','구제선교위원회','toss.me/test')");
ok(pay.bank === '농협' && pay.toss_url === 'https://toss.me/test', "회계가 계좌 정함, 토스 주소 https 붙임");
me = await one(U.kim, "select mission_join_me()");
ok(me.pay && me.pay.account === '351-0000-0000-00', "성도에게 계좌 보임");
ok(!!(await err(U.kim, "select * from mission_pay_account")), "계좌 표 직접 접근 막힘");
ro = await one(U.sec, "select mission_roster(null)");
ok(ro.pay && ro.pay.holder === '구제선교위원회', "명부에도 계좌");
// 12) 납부일 · 알림 피드 (오늘 날짜에 따라 달라지지 않게 납부일을 오늘 앞뒤로 잡는다)
const today = (await db.query("select extract(day from (now() at time zone 'Asia/Seoul'))::int d")).rows[0].d;
ok(!!(await err(U.kim, "select mission_join_set_due_day(5)")), "정회원이 아니면(반려) 납부일 못 정함");
ok(!!(await err(U.acct, "select mission_join_set_due_day(40)")), "납부일 범위 검사");
const accId = (await one(U.acct, "select mission_roster(null)")).members.find((m) => m.name === "신회계").id;
await as(U.acct, `select mission_dues_set(${accId}, ${fy}, '연납', false)`);
const thisMM = (await db.query("select to_char(now() at time zone 'Asia/Seoul', 'MM') m")).rows[0].m;
if (today > 1) {
  me = await one(U.acct, "select mission_join_set_due_day(1)");
  ok(me.member.due_day === 1 && /^[0-9a-f]{32}$/.test(me.member.push_key), "납부일 정하면 알림 열쇠 생김");
  let feed = await one(null, "select mission_dues_push_feed()");
  ok(feed.length === 1 && feed[0].key === me.member.push_key && !JSON.stringify(feed).includes("신회계"), "납부일 지남 → 피드(열쇠만, 비로그인도 읽음)");
  await as(U.acct, `select mission_dues_set(${accId}, ${fy}, '${thisMM}', true)`);
  feed = await one(null, "select mission_dues_push_feed()");
  ok(feed.length === 0, "이번 달 체크하면 피드에서 빠짐");
  await as(U.acct, `select mission_dues_set(${accId}, ${fy}, '${thisMM}', false)`);
}
me = await one(U.acct, "select mission_join_set_due_day(31)");
let feed2 = await one(null, "select mission_dues_push_feed()");
ok(feed2.length === 0, "납부일이 아직 안 지났으면(31일) 피드 없음");
me = await one(U.acct, "select mission_join_set_due_day(null)");
ok(me.member.due_day === null, "납부일 지우기");
// 13) 실행위원 — 위원장 · 서기만, 교적에서 찾아 바로 세우기, 5인까지
ok(!!(await err(U.acct, `select mission_member_set(${leeId}, null, true)`)), "회계는 실행위원을 못 정함");
let found = await one(U.sec, "select mission_gyojeok_find('최동')");
ok(found.length === 2 && found[0].born && !JSON.stringify(found).includes("|"), "교적 찾기: 동명이인 둘, 교적 키 없음");
ok(!!(await err(U.kim, "select mission_gyojeok_find('최')")), "일반 성도는 교적 찾기 못 함");
let ex = await one(U.sec, `select mission_member_add('', ${found[1].id}, true)`);
ok(ex.linked === true && ex.existed === false, "교적에서 골라 실행위원으로 올림(동명이인도 연결)");
ro = await one(U.sec, "select mission_roster(null)");
ok(ro.can_exec === true && ro.members.filter((m) => m.exec).length === 1, "실행위원 1명");
const yiId = (await db.query("select id from gyojeok where name='이새신'")).rows[0].id;
ex = await one(U.sec, `select mission_member_add('', ${yiId}, true)`);
ok(ex.existed === true, "이미 명부에 있는 분은 그 줄을 실행위원으로");
ok(!!(await err(U.sec, `select mission_member_add('', ${yiId}, false)`)), "이미 정회원이면 그냥 올리기는 막힘");
// 5인 제한
for (const nm of ["가","나","다"]) { await db.query("insert into gyojeok (name, member_key) values ($1, $2)", ["실행" + nm, "실행" + nm + "|1"]); }
for (const nm of ["가","나","다"]) { const gid = (await db.query("select id from gyojeok where name=$1", ["실행" + nm])).rows[0].id; await as(U.sec, `select mission_member_add('', ${gid}, true)`); }
await db.query("insert into gyojeok (name, member_key) values ('실행라', '실행라|1')");
const g6 = (await db.query("select id from gyojeok where name='실행라'")).rows[0].id;
ok(!!(await err(U.sec, `select mission_member_add('', ${g6}, true)`)), "실행위원 6번째는 막힘");
console.log(`pass ${pass}  fail ${fail}`);
process.exit(fail ? 1 : 0);
