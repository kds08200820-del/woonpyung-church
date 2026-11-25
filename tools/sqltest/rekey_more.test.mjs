// 교적 매칭키를 나머지 표까지 옮기기(20261125_1300_rekey_more_tables) 시험 — 가짜 자료만(PGlite).
//   node tools/sqltest/rekey_more.test.mjs <저장소 경로>      (@electric-sql/pglite@0.2 필요)
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const repo = process.argv[2] || '.';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
const OLD = '홍길동|19700101', NEW = '홍길동|19700110';
// rekey_member_records 가 직접 다루는 표 · 기록 표는 실제 파일 정의를 쓰고, 나머지는 가짜 표
await db.exec(`
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table public.schema_log(file text primary key, applied_at timestamptz default now(), note text);
create table public.gyojeok(id bigint generated always as identity primary key, name text, member_key text, spouse_key text);
create table public.member_links(user_id uuid primary key, member_key text, spouse_key text, updated_at timestamptz);
create table public.attendance(id bigint generated always as identity primary key, member_key text, member_name text, att_date date, service text);
create table public.ss_talents(id bigint generated always as identity primary key, member_key text, child_name text);
create table public.ss_submissions(id bigint generated always as identity primary key, member_key text, child_name text);
create table public.offerings(id bigint generated always as identity primary key, member_key text, amount int);
create table public.donation_receipts(id bigint generated always as identity primary key, member_key text, included_keys text[] default '{}');
create table public.member_files(id bigint generated always as identity primary key, member_key text);
-- 그 뒤에 생긴 표들(가짜)
create table public.edu_exam_results(id bigint generated always as identity primary key, member_key text, course text);
create table public.edu_course_progress(id bigint generated always as identity primary key, member_key text, course text, unique (member_key, course));
create table public.mission_officers(id bigint generated always as identity primary key, member_key text);
create table public.counsels(id bigint generated always as identity primary key, member_key text);
create table public.no_id_table(member_key text, note text);
create table public.member_match_requests(id bigint generated always as identity primary key, member_key text);
create table public.gyojeok_deleted(id bigint primary key, member_key text);
create table public.offerings_removed_20261110(id bigint primary key, member_key text);
create table public.other_key(id int, member_key int);   -- 글자 칸이 아니면 건드리지 않음
`);
const src = fs.readFileSync(repo + '/supabase/20261003_2130_ss_link_repair.sql', 'utf8');
const logDef = src.slice(src.indexOf('create table if not exists public.member_rekey_log'), src.indexOf('-- ── 2) 기록 옮기기'));
await db.exec(logDef);
const mig = fs.readFileSync(repo + '/supabase/20261125_1300_rekey_more_tables.sql', 'utf8');
await db.exec(mig); await db.exec(mig);
ok(true, 'migration x2');
// 새 함수 본문이 예전 본문 + 덧붙임인지(빠진 줄이 없는지)
const oldFn = src.slice(src.indexOf('create or replace function public.rekey_member_records('), src.indexOf('end $$;', src.indexOf('create or replace function public.rekey_member_records(')));
const newFn = mig.slice(mig.indexOf('create or replace function public.rekey_member_records('));
const missing = oldFn.split('\n').map((l) => l.trim()).filter((l) => l && !newFn.includes(l));
ok(missing.length <= 3, '예전 함수의 줄이 그대로 들어 있음(바뀐 줄 ' + missing.length + '개: 선언 · 건수 · 조건)');

await db.exec(`
insert into public.member_links values ('00000000-0000-0000-0000-000000000001', '${OLD}', null, now());
insert into public.offerings(member_key, amount) values ('${OLD}', 1000);
insert into public.edu_exam_results(member_key, course) values ('${OLD}', 'learn'), ('${OLD}', 'baptism'), ('다른|19990101', 'learn');
insert into public.edu_course_progress(member_key, course) values ('${OLD}', 'learn'), ('${OLD}', 'baptism'), ('${NEW}', 'learn');   -- learn 은 새 키에 이미 있음(겹침)
insert into public.mission_officers(member_key) values ('${OLD}');
insert into public.counsels(member_key) values ('${OLD}'), ('${OLD}');
insert into public.no_id_table values ('${OLD}', 'x');
insert into public.member_match_requests(member_key) values ('${OLD}');
insert into public.gyojeok_deleted values (1, '${OLD}');
insert into public.offerings_removed_20261110 values (1, '${OLD}');
`);
const r = (await q(`select public.rekey_member_records($1, $2, '홍길동') r`, [OLD, NEW])).rows[0].r;
ok(r.ok === true && r.links === 1 && r.offerings === 1, '예전 8곳은 예전처럼(계정 · 헌금)');
ok(r.more && r.more.moved === 7 && r.more.left === 1, '그 밖의 표: 7줄 옮김 · 겹친 1줄 남김');
const cnt = async (t, k) => (await q(`select count(*)::int n from public.${t} where member_key = $1`, [k])).rows[0].n;
ok(await cnt('edu_exam_results', NEW) === 2 && await cnt('edu_exam_results', '다른|19990101') === 1, '시험 결과 옮김(다른 사람 것은 그대로)');
ok(await cnt('edu_course_progress', NEW) === 2 && await cnt('edu_course_progress', OLD) === 1, '진도: 겹치지 않는 줄만 옮기고 겹친 줄은 옛 키에');
ok(await cnt('mission_officers', NEW) === 1 && await cnt('counsels', NEW) === 2 && await cnt('no_id_table', NEW) === 1, '선교회 · 상담 · id 없는 표도 옮김');
ok(await cnt('member_match_requests', OLD) === 1 && await cnt('gyojeok_deleted', OLD) === 1 && await cnt('offerings_removed_20261110', OLD) === 1, '신청 · 보관 표는 그대로');
const lg = (await q(`select tbl, moved, left_n, cardinality(row_ids) k from public.member_rekey_more_log order by tbl`)).rows;
ok(lg.length === 5 && lg.find((x) => x.tbl === 'edu_course_progress').left_n === 1 && lg.find((x) => x.tbl === 'counsels').k === 2 && lg.find((x) => x.tbl === 'no_id_table').k === 0, '옮긴 줄 번호 기록(표마다)');
const main = (await q(`select counts from public.member_rekey_log order by id desc limit 1`)).rows[0];
ok(main && main.counts.more.moved === 7, '예전 기록 표에도 건수가 함께');
// 다시 불러도 옮길 것이 없으면 기록하지 않음
const before = (await q('select count(*)::int n from public.member_rekey_more_log')).rows[0].n;
await q(`select public.rekey_member_records($1, $2, '홍길동')`, [OLD + 'x', NEW + 'x']);
ok((await q('select count(*)::int n from public.member_rekey_more_log')).rows[0].n === before, '옮길 것이 없으면 기록 없음');
ok((await q(`select count(*)::int n from public.schema_log where file = '20261125_1300_rekey_more_tables.sql'`)).rows[0].n === 1, '실행 기록 남김');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
