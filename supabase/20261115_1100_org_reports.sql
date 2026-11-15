-- ============================================================
--  운평장로교회 — 기관 보고서 · 예산 청원서 (홈페이지 입력) · 2027 기관 임원 (2026-11-15 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  목사님: "각 기관 부장들이 보고를 할 수 있도록 홈페이지에 만들어 주세요. 권한은 모든 성도들에게 일단 열어
--          모두가 입력할 수 있도록 해 주시고, 올해만 그렇게 하고 자리 잡히면 권한은 따로 부여하겠습니다.
--          선출된 임원은 2027년 교회 행정에 반영하도록 db와 연동해야 합니다. 담임이 승인하여 반영되도록."
--
--  들어 있는 것 (모두 비파괴: CREATE TABLE · CREATE FUNCTION 뿐):
--   1) org_reports  : 기관 보고서(회기 · 기관명 · 담당자 · 임원 선출 결과 · 사업 보고 · 결산 · 사업 계획 · 예산 청원 · 건의).
--                     상태: 작성중 → 제출 → 승인 / 돌려보냄. 지우지 않고 hidden.
--                     로그인한 성도는 누구나 쓰고(올해만 — 나중에 org_report_can_write 만 바꾸면 된다),
--                     자기가 쓴 보고서는 승인 전까지 고칠 수 있다. 로그인한 성도는 모두 목록과 내용을 본다.
--   2) org_officers : 교회 행정의 기관 임원(회기 · 기관 · 직책 · 이름 · 교적 키). 관리자(담임)가 승인할 때 채워진다.
--                     교적에서 같은 이름이 한 분이면 교적 키를 잇는다. 누구나 이름 · 직책을 본다(교적 키는 관리자만).
--   3) 함수: org_report_approve(id) · org_report_return(id, 메모) — 관리자만.
--            승인하면 그 기관 · 회기의 예전 임원은 끄고(active=false) 보고서의 임원을 새로 넣는다.
--            기관이 '구제선교위원회'면 위원장 · 부위원장 · 서기 · 회계를 구제선교위원회 임원(mission_officers)에도 넣어
--            그 직책 권한이 저절로 생긴다.
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · 함수: drop function if exists public.org_report_approve(bigint), public.org_report_return(bigint, text),
--            public.org_report_can_write(), public.org_officer_list(int);
--    · 표: alter table public.org_reports rename to org_reports_archived;
--          alter table public.org_officers rename to org_officers_archived;   (DROP 하지 않는다)
--    · 구제선교위원회 임원으로 들어간 줄은 '임원 정하기'에서 내리면 된다(active=false).
-- ============================================================

-- ── 1) 기관 보고서 ──────────────────────────────────────────
create table if not exists public.org_reports (
  id           bigint generated always as identity primary key,
  fy_year      int  not null default 2027 check (fy_year between 2000 and 2100),   -- 보고 · 청원하는 회기
  org_name     text not null check (char_length(org_name) between 1 and 60),
  manager_name text not null default '',            -- 담당자
  officers     jsonb not null default '[]'::jsonb,  -- [{role, name}]  선출 결과
  biz_report   jsonb not null default '[]'::jsonb,  -- [{name, detail, spent}]  지난 회기 사업 보고
  settle       jsonb not null default '{}'::jsonb,  -- {carry, income, spend, left}  지난 회기 결산
  plan         jsonb not null default '[]'::jsonb,  -- [{name, detail}]  사업 계획
  budget       jsonb not null default '[]'::jsonb,  -- [{item, amount, reason}]  예산 청원
  suggestion   text not null default '',            -- 건의 사항
  status       text not null default '작성중' check (status in ('작성중', '제출', '승인', '돌려보냄')),
  admin_note   text not null default '',            -- 돌려보낼 때 담임 메모
  hidden       boolean not null default false,
  user_id      uuid references auth.users (id) on delete set null,
  author_name  text not null default '',
  submitted_at timestamptz,
  approved_at  timestamptz,
  approved_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists org_reports_year_idx on public.org_reports (fy_year, org_name);

-- 쓰기 권한: 올해는 로그인한 성도 모두. 나중에 권한을 따로 줄 때 이 함수만 바꾼다.
create or replace function public.org_report_can_write()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
$$;
revoke all on function public.org_report_can_write() from public, anon;
grant execute on function public.org_report_can_write() to authenticated;

alter table public.org_reports enable row level security;
drop policy if exists "org_reports_select" on public.org_reports;
create policy "org_reports_select" on public.org_reports
  for select using (auth.uid() is not null and (hidden = false or exists (select 1 from public.admins a where a.uid = auth.uid())));
drop policy if exists "org_reports_insert" on public.org_reports;
create policy "org_reports_insert" on public.org_reports
  for insert with check (public.org_report_can_write() and user_id = auth.uid() and status in ('작성중', '제출'));
-- 고치기: 쓴 사람은 승인 전까지(상태는 작성중 · 제출만), 관리자는 언제나
drop policy if exists "org_reports_update" on public.org_reports;
create policy "org_reports_update" on public.org_reports
  for update using (
    exists (select 1 from public.admins a where a.uid = auth.uid())
    or (user_id = auth.uid() and status <> '승인'))
  with check (
    exists (select 1 from public.admins a where a.uid = auth.uid())
    or (user_id = auth.uid() and status in ('작성중', '제출')));
revoke all on public.org_reports from anon;
grant select, insert, update on public.org_reports to authenticated;

-- ── 2) 교회 행정의 기관 임원 ────────────────────────────────
create table if not exists public.org_officers (
  id         bigint generated always as identity primary key,
  fy_year    int  not null check (fy_year between 2000 and 2100),
  org_name   text not null check (char_length(org_name) between 1 and 60),
  role       text not null check (char_length(role) between 1 and 30),
  name       text not null check (char_length(name) between 1 and 50),
  member_key text not null default '',            -- 교적 키(같은 이름이 한 분일 때). 관리자만 본다
  sort       int  not null default 100,
  active     boolean not null default true,         -- 지우는 대신 끔
  report_id  bigint references public.org_reports (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists org_officers_year_idx on public.org_officers (fy_year, org_name);
alter table public.org_officers enable row level security;
drop policy if exists "org_officers_admin_select" on public.org_officers;
create policy "org_officers_admin_select" on public.org_officers
  for select using (exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "org_officers_admin_write" on public.org_officers;
create policy "org_officers_admin_write" on public.org_officers
  for update using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
revoke all on public.org_officers from anon;
grant select, update on public.org_officers to authenticated;

-- 누구나(로그인) 보는 기관 임원 명단 — 교적 키는 빼고
create or replace function public.org_officer_list(p_year int)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('org', o.org_name, 'role', o.role, 'name', o.name, 'linked', o.member_key <> '')
           order by o.org_name, o.sort, o.id), '[]'::jsonb)
    from public.org_officers o
   where o.fy_year = p_year and o.active and auth.uid() is not null
$$;
revoke all on function public.org_officer_list(int) from public, anon;
grant execute on function public.org_officer_list(int) to authenticated;

-- ── 3) 승인 · 돌려보내기 (관리자 = 담임) ────────────────────
create or replace function public.org_report_approve(p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.org_reports%rowtype;
  o jsonb;
  v_role text;  v_name text;  v_key text;  v_n int := 0;  v_m int := 0;  v_sort int := 0;
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then raise exception '승인은 담임(관리자)이 합니다'; end if;
  select * into r from public.org_reports where id = p_id;
  if r.id is null then raise exception '보고서를 찾지 못했습니다'; end if;

  update public.org_officers set active = false, updated_at = now()
   where fy_year = r.fy_year and org_name = r.org_name and active;

  for o in select * from jsonb_array_elements(coalesce(r.officers, '[]'::jsonb)) loop
    v_role := left(btrim(coalesce(o->>'role', '')), 30);
    v_name := left(btrim(coalesce(o->>'name', '')), 50);
    continue when v_role = '' or v_name = '';
    v_sort := v_sort + 10;
    select case when count(*) = 1 then max(g.member_key) else '' end into v_key
      from public.gyojeok g where g.name = v_name and coalesce(g.member_key, '') <> '';
    insert into public.org_officers (fy_year, org_name, role, name, member_key, sort, report_id)
    values (r.fy_year, r.org_name, v_role, v_name, coalesce(v_key, ''), v_sort, r.id);
    v_n := v_n + 1;
    if v_key <> '' then v_m := v_m + 1; end if;
  end loop;

  -- 구제선교위원회: 위원장 · 부위원장 · 서기 · 회계는 위원회 임원(권한)에도
  if btrim(r.org_name) = '구제선교위원회' and to_regclass('public.mission_officers') is not null then
    update public.mission_officers set active = false, updated_at = now()
     where fy_year = r.fy_year and active and role in ('위원장', '부위원장', '서기', '회계');
    insert into public.mission_officers (fy_year, role, name, member_key, sort)
    select o2.fy_year, o2.role, o2.name, o2.member_key, o2.sort
      from public.org_officers o2
     where o2.report_id = r.id and o2.active and o2.role in ('위원장', '부위원장', '서기', '회계');
  end if;

  update public.org_reports set status = '승인', approved_at = now(), approved_by = auth.uid(), admin_note = '', updated_at = now()
   where id = r.id;
  return jsonb_build_object('officers', v_n, 'linked', v_m);
end $$;
revoke all on function public.org_report_approve(bigint) from public, anon;
grant execute on function public.org_report_approve(bigint) to authenticated;

create or replace function public.org_report_return(p_id bigint, p_note text default '')
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then raise exception '관리자만 할 수 있습니다'; end if;
  update public.org_reports set status = '돌려보냄', admin_note = left(coalesce(p_note, ''), 500), updated_at = now() where id = p_id;
  return found;
end $$;
revoke all on function public.org_report_return(bigint, text) from public, anon;
grant execute on function public.org_report_return(bigint, text) to authenticated;

-- ── 실행 후 확인(메타데이터 · 건수만) ───────────────────────
--   select table_name from information_schema.tables where table_name in ('org_reports', 'org_officers');   -- 2개
--   select count(*) from pg_proc where proname in ('org_report_approve','org_report_return','org_report_can_write','org_officer_list');   -- 4
--   select count(*) from public.org_reports;   -- 0
