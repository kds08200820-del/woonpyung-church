-- 자료실 > 회의자료실(당회록 · 공동의회록) · 요람 (2026-11-21 담임목사 지시)
--  담임목사: "회의자료실에는 당회록, 공동의회록을 각각 보관 할 수 있도록 해주시고, 접근 권한은 당회록은 장로, 목사로써
--            시무장로 여야 하며, 현재는 신용화장로, 김동석 목사 둘 입니다. 공동의회록은 세례교인이면 열람 할 수 있도록
--            권한 설정 해주세요. 자료실에 요람도 만들어주세요. 요람 자료는 차후에 올릴 것입니다."
--
--  · 파일은 공개 주소가 나가는 R2(/f/)가 아니라 Supabase 비공개 버킷 'meeting-docs' 에 둔다.
--    파일 경로 첫 칸이 종류다:  session/…(당회록) · congregation/…(공동의회록) · yoram/…(요람)
--    목록(meeting_docs 표)과 파일(storage.objects) 둘 다 같은 권한 함수로 막는다 → 주소를 알아도 권한 없으면 못 받는다.
--  · 권한 (바꾸려면 아래 함수만 고치면 된다)
--      meeting_is_session()     당회원 = 내 계정과 이어진 교적(member_links → gyojeok)의 직책이
--                               담임목사 이거나 시무장로(직책에 '장로' — 은퇴·원로·협동·명예 제외)
--                               ※ 원로목사·협동목사·부목사·전도사·은퇴장로는 당회원이 아니다
--      meeting_is_baptized()    세례교인 = 교적 신급이 '세례' 또는 '입교'(유아세례·학습·원입 제외) — 당회원은 늘 포함
--      meeting_is_member()      요람 = 정회원(member_links.member_status = '정회원') 또는 관리자
--      제적·별세·이명·탈퇴 상태의 교적은 세지 않는다.
--  · 올리기·지우기: 당회록 = 당회원만 / 공동의회록 = 당회원 · 관리자 / 요람 = 관리자 · 당회원
--  · meeting_access() : 화면이 쓸 내 권한 6가지(json)
--
-- 실행 뒤 확인(교인 자료 본문은 보지 않고 건수만):
--   select count(*) from public.meeting_session_keys();     -- 2 여야 한다(담임목사 1 + 시무장로 1)
--   select count(*) from storage.buckets where id = 'meeting-docs';   -- 1
--
-- 되돌리기(파괴적이므로 사람이 직접, 자료가 있으면 먼저 내려받아 둘 것):
--   alter table public.meeting_docs rename to meeting_docs_archived;
--   drop policy ... on storage.objects (meeting_docs_* 4개);  drop function public.meeting_access(), public.meeting_can_read(text),
--   public.meeting_can_write(text), public.meeting_is_session(), public.meeting_is_baptized(), public.meeting_is_member(),
--   public.meeting_session_keys();   버킷 'meeting-docs' 는 대시보드에서 비운 뒤 삭제

begin;

-- 1) 비공개 버킷
insert into storage.buckets (id, name, public)
values ('meeting-docs', 'meeting-docs', false)
on conflict (id) do nothing;

-- 2) 권한 함수
-- 교적에서 '살아 있는' 줄만: 상태에 제적·별세·이명·탈퇴·소천이 들면 뺀다
create or replace function public.meeting_my_rows()
returns setof public.gyojeok language sql stable security definer set search_path = public as $$
  select g.* from public.gyojeok g
   where coalesce(g.member_key, '') <> ''
     and g.member_key in (select ml.member_key from public.member_links ml
                           where ml.user_id = auth.uid() and coalesce(ml.member_key, '') <> '')
     and coalesce(g.status, '') !~ '(제적|별세|소천|이명|탈퇴)'
$$;
revoke all on function public.meeting_my_rows() from public, anon, authenticated;

-- 당회원 직책인가 (한 곳에서만 판단)
create or replace function public.meeting_role_is_session(p_role text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_role, '') ~ '담임목사'
      or (coalesce(p_role, '') ~ '장로' and coalesce(p_role, '') !~ '(은퇴|원로|협동|명예)')
$$;

create or replace function public.meeting_is_session()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.meeting_my_rows() g where public.meeting_role_is_session(g.role))
$$;

create or replace function public.meeting_is_baptized()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and (public.meeting_is_session()
          or exists (select 1 from public.meeting_my_rows() g where btrim(coalesce(g.grade, '')) ~ '^(세례|입교)'))
$$;

create or replace function public.meeting_is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and (exists (select 1 from public.admins a where a.uid = auth.uid())
          or exists (select 1 from public.member_links ml where ml.user_id = auth.uid() and coalesce(ml.member_status, '') = '정회원'))
$$;

create or replace function public.meeting_can_read(p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'session'      then public.meeting_is_session()
    when 'congregation' then public.meeting_is_baptized()
    when 'yoram'        then public.meeting_is_member()
    else false end
$$;

create or replace function public.meeting_can_write(p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'session' then public.meeting_is_session()
    when 'congregation' then public.meeting_is_session() or exists (select 1 from public.admins a where a.uid = auth.uid())
    when 'yoram'        then public.meeting_is_session() or exists (select 1 from public.admins a where a.uid = auth.uid())
    else false end
$$;

create or replace function public.meeting_access()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'login', auth.uid() is not null,
    'session', public.meeting_can_read('session'),           'session_w', public.meeting_can_write('session'),
    'congregation', public.meeting_can_read('congregation'), 'congregation_w', public.meeting_can_write('congregation'),
    'yoram', public.meeting_can_read('yoram'),               'yoram_w', public.meeting_can_write('yoram'))
$$;

-- 실행 뒤 확인용: 당회원 교적 열쇠(화면에서는 못 부른다, 건수만 본다)
create or replace function public.meeting_session_keys()
returns setof text language sql stable security definer set search_path = public as $$
  select distinct g.member_key from public.gyojeok g
    join public.member_links ml on ml.member_key = g.member_key
   where public.meeting_role_is_session(g.role)
     and coalesce(g.status, '') !~ '(제적|별세|소천|이명|탈퇴)'
$$;

revoke all on function public.meeting_is_session(), public.meeting_is_baptized(), public.meeting_is_member(),
  public.meeting_can_read(text), public.meeting_can_write(text), public.meeting_access() from public, anon;
grant execute on function public.meeting_is_session(), public.meeting_is_baptized(), public.meeting_is_member(),
  public.meeting_can_read(text), public.meeting_can_write(text), public.meeting_access() to authenticated;
revoke all on function public.meeting_session_keys() from public, anon, authenticated;

-- 3) 목록 표
create table if not exists public.meeting_docs (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('session', 'congregation', 'yoram')),
  title        text not null,                    -- 표시 이름(예: 2026년 제3차 당회)
  meeting_date date,                             -- 회의 날짜(요람은 발행일, 비워도 됨)
  file_name    text not null,                    -- 원본 파일명(내려받을 때 이름)
  path         text not null,                    -- 버킷 안 경로: <kind>/<시각>_<무작위>.<확장자>
  size         bigint,
  uploaded_by  uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  constraint meeting_docs_path_kind check (split_part(path, '/', 1) = kind)
);
create index if not exists meeting_docs_kind_idx on public.meeting_docs (kind, meeting_date desc);
alter table public.meeting_docs enable row level security;
grant select, insert, update, delete on public.meeting_docs to authenticated;

drop policy if exists meeting_docs_read on public.meeting_docs;
create policy meeting_docs_read on public.meeting_docs for select to authenticated
  using (public.meeting_can_read(kind));
drop policy if exists meeting_docs_insert on public.meeting_docs;
create policy meeting_docs_insert on public.meeting_docs for insert to authenticated
  with check (public.meeting_can_write(kind) and uploaded_by = auth.uid());
drop policy if exists meeting_docs_update on public.meeting_docs;
create policy meeting_docs_update on public.meeting_docs for update to authenticated
  using (public.meeting_can_write(kind)) with check (public.meeting_can_write(kind));
drop policy if exists meeting_docs_delete on public.meeting_docs;
create policy meeting_docs_delete on public.meeting_docs for delete to authenticated
  using (public.meeting_can_write(kind));

-- 4) 파일 권한(같은 함수, 경로 첫 칸 = 종류)
drop policy if exists meeting_docs_obj_read on storage.objects;
create policy meeting_docs_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'meeting-docs' and public.meeting_can_read(split_part(name, '/', 1)));
drop policy if exists meeting_docs_obj_insert on storage.objects;
create policy meeting_docs_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'meeting-docs' and public.meeting_can_write(split_part(name, '/', 1)));
drop policy if exists meeting_docs_obj_update on storage.objects;
create policy meeting_docs_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'meeting-docs' and public.meeting_can_write(split_part(name, '/', 1)));
drop policy if exists meeting_docs_obj_delete on storage.objects;
create policy meeting_docs_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'meeting-docs' and public.meeting_can_write(split_part(name, '/', 1)));

commit;
