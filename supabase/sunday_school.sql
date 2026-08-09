-- ============================================================
--  운평장로교회 — 주일학교 모듈 (교사·부장·서기·어린이 / 달란트·현황판)
--  Supabase ▸ SQL Editor 에 통째로 붙여넣고 Run (1회, 여러 번 실행해도 안전)
--
--  [무엇이 만들어지나]
--   1) gyojeok.ss_role  : 교적에 '주일학교 직분' 칸 추가 (부장/서기/교사/어린이)
--   2) ss_talents       : 어린이 달란트 지급/차감 장부
--   3) ss_board         : 주일학교 현황판(공지) — 부장·서기가 편집
--   4) 함수: ss_my_role / is_ss_teacher / is_ss_editor / ss_context / ss_students
--
--  [권한 설계]
--   · 교사·부장·서기(+관리자) : 주일학교 현황 조회, 달란트 추가/수정/삭제
--   · 부장·서기(+관리자)      : 현황판(공지) 작성/수정/삭제
--   · 어린이                  : 자기 달란트만 조회 (교적 연결된 정회원 계정)
--
--  [되돌리기(롤백) 방법 — 삭제 정책에 따라 DROP 대신 RENAME]
--   -- alter table public.ss_talents rename to ss_talents_archived;
--   -- alter table public.ss_board   rename to ss_board_archived;
--   -- 교적의 주일학교 칸은 프런트에서 조회만 중단 후 4주 뒤:
--   --   alter table public.gyojeok rename column ss_role to ss_role_archived;
--   -- drop function if exists public.ss_students();
--   -- drop function if exists public.ss_context();
--   -- drop function if exists public.is_ss_editor();
--   -- drop function if exists public.is_ss_teacher();
--   -- drop function if exists public.ss_my_role();
-- ============================================================

-- ── 1) 교적: 주일학교 직분 칸 (nullable — 기존 데이터 영향 없음) ──
alter table public.gyojeok add column if not exists ss_role text;

-- ── 2) 권한 함수 ──
-- 내 주일학교 직분: 로그인 계정 → member_links.member_key → 교적의 ss_role
create or replace function public.ss_my_role()
returns text language sql security definer stable
set search_path = public as $$
  select g.ss_role
  from public.member_links l
  join public.gyojeok g on g.member_key = l.member_key
  where l.user_id = auth.uid() and coalesce(g.ss_role, '') <> ''
  limit 1
$$;

-- 교사단(교사·부장·서기) 또는 관리자
create or replace function public.is_ss_teacher()
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce(public.ss_my_role() in ('교사', '부장', '서기'), false)
      or exists(select 1 from public.admins a where a.uid = auth.uid())
$$;

-- 현황판 편집(부장·서기) 또는 관리자
create or replace function public.is_ss_editor()
returns boolean language sql security definer stable
set search_path = public as $$
  select coalesce(public.ss_my_role() in ('부장', '서기'), false)
      or exists(select 1 from public.admins a where a.uid = auth.uid())
$$;

grant execute on function public.ss_my_role()    to authenticated;
grant execute on function public.is_ss_teacher() to authenticated;
grant execute on function public.is_ss_editor()  to authenticated;

-- ── 3) 달란트 장부 ──
create table if not exists public.ss_talents (
  id           bigint generated always as identity primary key,
  member_key   text not null,                 -- 어린이 매칭키(이름|YYYYMMDD)
  child_name   text,                          -- 어린이 이름(표시용)
  amount       integer not null default 0,    -- 지급(+) / 차감(-)
  reason       text,                          -- 사유 (예: 암송, 출석)
  talent_date  date not null default current_date,
  created_by   text,                          -- 입력한 교사 이름
  created_at   timestamptz not null default now()
);
create index if not exists ss_talents_member_key_idx on public.ss_talents(member_key);

alter table public.ss_talents enable row level security;
grant select, insert, update, delete on public.ss_talents to authenticated;

-- 조회: 교사단(+관리자) 전체, 어린이는 자기 것만
drop policy if exists ss_talents_select on public.ss_talents;
create policy ss_talents_select on public.ss_talents for select
  using ( public.is_ss_teacher() or member_key in (select public.my_member_keys()) );

-- 추가/수정/삭제: 교사단(+관리자)만
drop policy if exists ss_talents_write on public.ss_talents;
create policy ss_talents_write on public.ss_talents for all
  using ( public.is_ss_teacher() ) with check ( public.is_ss_teacher() );

-- ── 4) 주일학교 현황판(공지) ──
create table if not exists public.ss_board (
  id          bigint generated always as identity primary key,
  title       text not null,
  content     text,
  sort        int not null default 0,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.ss_board enable row level security;
grant select, insert, update, delete on public.ss_board to authenticated;

-- 조회: 교사단(+관리자)
drop policy if exists ss_board_select on public.ss_board;
create policy ss_board_select on public.ss_board for select
  using ( public.is_ss_teacher() );

-- 작성/수정/삭제: 부장·서기(+관리자)만
drop policy if exists ss_board_write on public.ss_board;
create policy ss_board_write on public.ss_board for all
  using ( public.is_ss_editor() ) with check ( public.is_ss_editor() );

-- ── 5) 대시보드용 RPC ──
-- 내 주일학교 상태(대시보드가 어떤 화면을 보여줄지 결정)
create or replace function public.ss_context()
returns json language sql security definer stable
set search_path = public as $$
  select json_build_object(
    'role', coalesce(public.ss_my_role(), ''),
    'isTeacher', public.is_ss_teacher(),
    'isEditor', public.is_ss_editor(),
    'teacherCount', case when public.is_ss_teacher()
      then (select count(*) from public.gyojeok where ss_role in ('교사', '부장', '서기'))
      else 0 end
  )
$$;

-- 어린이 명단 + 달란트 합계(교사단 전용 — 아니면 빈 결과)
create or replace function public.ss_students()
returns table (member_key text, name text, birth date, groups text, total bigint, cnt bigint)
language sql security definer stable
set search_path = public as $$
  select g.member_key, g.name, g.birth, g.groups,
         coalesce(sum(t.amount), 0)::bigint as total, count(t.id)::bigint as cnt
  from public.gyojeok g
  left join public.ss_talents t on t.member_key = g.member_key
  where g.ss_role = '어린이' and public.is_ss_teacher()
  group by g.member_key, g.name, g.birth, g.groups
  order by 2
$$;

grant execute on function public.ss_context()  to authenticated;
grant execute on function public.ss_students() to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
