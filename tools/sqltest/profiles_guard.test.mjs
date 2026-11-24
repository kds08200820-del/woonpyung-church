// 내 정보(profiles)에서 본인이 바꿀 수 없는 칸 지키기(20261125_0030_profiles_guard) 시험 — 가짜 자료만(PGlite).
//   빈 폴더에서 npm i @electric-sql/pglite@0.2 후 이 파일을 그 폴더로 복사해
//   node profiles_guard.test.mjs <저장소 경로>
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const repo = process.argv[2];
const db = new PGlite();
const q = (s, p) => db.query(s, p);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok', m); } else { fail++; console.log('  FAIL', m); } };
const U = n => '00000000-0000-0000-0000-00000000000' + n;
const ADMIN = U(9);
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key, email text, banned_until timestamptz);
create table auth.sessions(user_id uuid); create table auth.refresh_tokens(user_id text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon; grant usage on schema public to authenticated, anon;
create table public.admins(uid uuid primary key);
alter table public.admins enable row level security;
create policy admins_select_self on public.admins for select using (auth.uid() = uid);
create table public.profiles(id uuid primary key, name text, email text, provider text, created_at timestamptz not null default now(),
  role text, address text, birth text, phone text, bio text, family text, withdrawn_at timestamptz);
alter table public.profiles enable row level security;
create policy profiles_select_self_or_admin on public.profiles for select using (auth.uid() = id or auth.uid() in (select uid from public.admins));
create policy profiles_update_self_or_admin on public.profiles for update using (auth.uid() = id or auth.uid() in (select uid from public.admins));
create policy profiles_delete_self_or_admin on public.profiles for delete using (auth.uid() = id or auth.uid() in (select uid from public.admins));
create policy profiles_insert_self on public.profiles for insert with check (auth.uid() = id);   -- 운영 DB 에 있을 수도 있는 경우까지 본다
grant select, insert, update, delete on public.profiles to authenticated; grant select on public.admins to authenticated;
insert into auth.users(id, email) select ('00000000-0000-0000-0000-00000000000' || g)::uuid, 'real' || g || '@example.test' from generate_series(1, 9) g;
insert into public.profiles(id, name, email, provider) select id, '가입자' || right(id::text, 1), email, 'email' from auth.users;
insert into public.admins values ('${ADMIN}');
-- 탈퇴(본인) 함수의 줄임꼴: 서버 안의 함수는 지킬 칸도 바꿀 수 있어야 한다
create or replace function public.withdraw_me_lite() returns void language plpgsql security definer set search_path = public as $$
begin update public.profiles set withdrawn_at = now(), name = '탈퇴한 회원', role = null where id = auth.uid(); end $$;
grant execute on function public.withdraw_me_lite() to authenticated;
`);
await db.exec(fs.readFileSync(repo + '/supabase/suspend.sql', 'utf8'));          // suspended_at · suspend_note 칸과 admin_set_suspend
await db.exec(fs.readFileSync(repo + '/supabase/finance-membership.sql', 'utf8').split('-- ★ 운영 참고')[0]);
await db.exec(`alter table public.member_links add column if not exists spouse_key text;`);
await db.exec(fs.readFileSync(repo + '/supabase/gyojeok.sql', 'utf8'));
await db.exec(fs.readFileSync(repo + '/supabase/app_settings.sql', 'utf8'));
await db.exec(fs.readFileSync(repo + '/supabase/20261124_2330_member_match_approval.sql', 'utf8'));
await db.exec(fs.readFileSync(repo + '/supabase/20261124_2355_member_match_push.sql', 'utf8'));
const mig = fs.readFileSync(repo + '/supabase/20261125_0030_profiles_guard.sql', 'utf8');
await db.exec(mig); await db.exec(mig);
ok((await q(`select count(*)::int n from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_guard_biu'`)).rows[0].n === 1, 'migration x2 · 트리거는 하나');

const asRole = async (uid, sql, role = 'authenticated') => { await db.exec(`select set_config('t.uid','${uid}',false)`); await db.exec('set role ' + role); try { return (await q(sql)).rows; } finally { await db.exec('reset role'); } };
const fails = async (uid, sql) => { try { await asRole(uid, sql); return ''; } catch (e) { return e.message; } };
const row = async n => (await q(`select * from profiles where id='${U(n)}'`)).rows[0];

// 1) 보통 칸과 보통 직분은 지금처럼 본인이 고친다
await asRole(U(1), `update profiles set name='홍길동', phone='010-0000-0000', role='집사' where id='${U(1)}'`);
let r = await row(1);
ok(r.name === '홍길동' && r.phone === '010-0000-0000' && r.role === '집사', '본인: 이름 · 연락처 · 집사 저장');
await asRole(U(1), `update profiles set role='장로' where id='${U(1)}'`);
ok((await row(1)).role === '장로', '본인: 다른 보통 직분으로 바꾸기');
// 2) 목회 직분은 본인이 새로 달 수 없다
for (const t of ['담임목사', '부목사', '원로목사', '전도사', '교육전도사', '강도사']) {
  const m = await fails(U(1), `update profiles set role='${t}', name='바뀌면안됨' where id='${U(1)}'`);
  ok(/관리자가 지정합니다/.test(m), '본인이 「' + t + '」 로 바꾸기 → 거절');
}
r = await row(1);
ok(r.role === '장로' && r.name === '홍길동', '거절된 저장은 다른 칸도 바뀌지 않음');
// 3) 정지 · 탈퇴 표시는 본인이 직접 못 바꾼다(다른 칸은 저장된다)
await asRole(ADMIN, `select admin_set_suspend('${U(2)}', true, '시험')`);
ok((await row(2)).suspended_at !== null && (await row(2)).suspend_note === '시험', '관리자 함수로 정지(서버 안의 함수는 지나간다)');
await asRole(U(2), `update profiles set suspended_at=null, suspend_note=null, withdrawn_at=now(), bio='소개' where id='${U(2)}'`);
r = await row(2);
ok(r.suspended_at !== null && r.suspend_note === '시험' && r.withdrawn_at === null && r.bio === '소개', '본인이 정지 · 탈퇴 표시를 직접 고쳐도 그대로, 소개글은 저장');
await asRole(ADMIN, `select admin_set_suspend('${U(2)}', false)`);
ok((await row(2)).suspended_at === null, '관리자 함수로 정지 해제');
// 4) 관리자는 남의 직분도, 자기 직분도 정한다
await asRole(ADMIN, `update profiles set role='부목사' where id='${U(3)}'`);
await asRole(ADMIN, `update profiles set role='담임목사' where id='${ADMIN}'`);
ok((await row(3)).role === '부목사' && (await row(9)).role === '담임목사', '관리자: 목회 직분 지정');
// 5) 이미 목회 직분인 사람은 내 정보를 그대로 저장할 수 있고, 내려놓을 수도 있다
await asRole(U(3), `update profiles set role='부목사', phone='010-1111-2222' where id='${U(3)}'`);
ok((await row(3)).role === '부목사' && (await row(3)).phone === '010-1111-2222', '부목사 본인: 직분 그대로 두고 저장');
ok(/관리자가 지정합니다/.test(await fails(U(3), `update profiles set role='담임목사' where id='${U(3)}'`)), '부목사 본인이 담임목사로 → 거절');
await asRole(U(3), `update profiles set role='성도' where id='${U(3)}'`);
ok((await row(3)).role === '성도', '목회 직분을 스스로 내려놓기');
// 6) 화면의 저장 방식(넣거나 고치기)
await asRole(ADMIN, `update profiles set role='부목사' where id='${U(4)}'`);
await asRole(ADMIN, `select admin_set_suspend('${U(5)}', true, '메모')`);
await asRole(U(4), `insert into profiles(id, name, email, role, phone) values ('${U(4)}', '김목사', 'real4@example.test', '부목사', '010-4') on conflict (id) do update set name=excluded.name, email=excluded.email, role=excluded.role, phone=excluded.phone`);
r = await row(4);
ok(r.role === '부목사' && r.name === '김목사' && r.phone === '010-4', '넣거나 고치기: 있던 목회 직분이 지워지지 않음');
await asRole(U(5), `insert into profiles(id, name, role, bio) values ('${U(5)}', '오성도', '권사', '안녕') on conflict (id) do update set name=excluded.name, role=excluded.role, bio=excluded.bio`);
r = await row(5);
ok(r.role === '권사' && r.bio === '안녕' && r.suspended_at !== null && r.suspend_note === '메모', '넣거나 고치기: 정지 표시는 그대로');
ok(/관리자가 지정합니다/.test(await fails(U(5), `insert into profiles(id, name, role) values ('${U(5)}', '오성도', '담임목사') on conflict (id) do update set role=excluded.role`)), '넣거나 고치기로 담임목사 → 거절');
// 7) 줄을 지웠다가 새로 넣는 길도 막힌다
await asRole(U(6), `delete from profiles where id='${U(6)}'`);
ok(/관리자가 지정합니다/.test(await fails(U(6), `insert into profiles(id, name, role) values ('${U(6)}', '육', '담임목사')`)), '새 줄을 담임목사로 넣기 → 거절');
await asRole(U(6), `insert into profiles(id, name, role, suspended_at, withdrawn_at) values ('${U(6)}', '육', '집사', now(), now())`);
r = await row(6);
ok(r.role === '집사' && r.suspended_at === null && r.withdrawn_at === null, '새 줄: 보통 직분은 되고 정지 · 탈퇴 표시는 비워짐');
// 8) 서버 안의 함수 · SQL 편집기는 지나간다
await asRole(U(7), `select withdraw_me_lite()`);
ok((await row(7)).withdrawn_at !== null && (await row(7)).name === '탈퇴한 회원', '탈퇴 함수는 그대로 동작');
await db.exec(`update public.profiles set role='담임목사', suspended_at=now() where id='${U(8)}'`);
ok((await row(8)).role === '담임목사' && (await row(8)).suspended_at !== null, 'SQL 편집기(관리 권한)는 그대로');
// 9) 남의 줄은 여전히 못 고친다(RLS)
await asRole(U(1), `update profiles set name='남의것' where id='${U(3)}'`);
ok((await row(3)).name !== '남의것', '남의 프로필은 고쳐지지 않음');
// 10) 교적 인증 신청 목록의 메일은 로그인 계정의 것
await asRole(U(1), `update profiles set email='fake@example.test', name='성춘향' where id='${U(1)}'`);
await asRole(U(1), `select match_member('성춘향','19720202')`);
const L = (await asRole(ADMIN, `select list_match_requests() r`))[0].r;
ok(L.length === 1 && L[0].email === 'real1@example.test' && L[0].signupName === '성춘향' && L[0].provider === 'email', '신청 목록: 프로필 메일을 바꿔도 로그인 계정의 메일이 보임');
ok((await asRole(U(1), `select list_match_requests() r`))[0].r.length === 0, '신청 목록: 관리자가 아니면 빈 목록');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
