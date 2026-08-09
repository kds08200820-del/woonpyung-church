-- ============================================================
--  운평장로교회 — 주일학교 보호자(부모) 열람·대리 업로드
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (1회, 여러 번 실행해도 안전)
--
--  · 보호자 판별: 교적 가계도에서 '같은 세대'에 주일학교=어린이 가 있는 회원.
--    (별도 지정 불필요 — 교적의 세대주/가족관계를 그대로 사용)
--  · 보호자는 자녀의 달란트·QT/필사 인증·헌금을 조회하고,
--    자녀 대신 인증샷을 올리거나 잘못 올린 것을 삭제할 수 있음.
--
--  [되돌리기(롤백)]
--   -- drop function if exists public.ss_child_offerings(text);
--   -- drop function if exists public.ss_my_children();
--   -- 그리고 sunday_school.sql / sunday_school_submissions.sql 의
--   -- 원래 policy 블록을 다시 실행하면 보호자 권한이 제거됩니다.
-- ============================================================

-- 1) 내 자녀(같은 세대의 '어린이') 목록
create or replace function public.ss_my_children()
returns table (member_key text, name text, birth date)
language sql security definer stable
set search_path = public as $$
  with mykeys as (select public.my_member_keys() as k),
  me as (
    select g.head, g.name from public.gyojeok g
    where g.member_key in (select k from mykeys)
    order by g.id limit 1
  ),
  myhead as (select coalesce(nullif((select head from me), ''), (select name from me)) as h)
  select g.member_key, g.name, g.birth
  from public.gyojeok g
  where coalesce(nullif(g.head, ''), g.name) = (select h from myhead)
    and g.ss_role = '어린이'
    and coalesce(g.member_key, '') <> ''
    and g.member_key not in (select k from mykeys)
$$;
grant execute on function public.ss_my_children() to authenticated;

-- 2) 달란트 조회에 보호자 추가
drop policy if exists ss_talents_select on public.ss_talents;
create policy ss_talents_select on public.ss_talents for select
  using ( public.is_ss_teacher()
       or member_key in (select public.my_member_keys())
       or member_key in (select c.member_key from public.ss_my_children() c) );

-- 3) QT·필사 인증: 보호자 조회·대리 등록·삭제 추가 (좋아요/확인 수정은 교사단만 유지)
drop policy if exists ss_submissions_select on public.ss_submissions;
create policy ss_submissions_select on public.ss_submissions for select
  using ( public.is_ss_teacher()
       or member_key in (select public.my_member_keys())
       or member_key in (select c.member_key from public.ss_my_children() c) );

drop policy if exists ss_submissions_insert on public.ss_submissions;
create policy ss_submissions_insert on public.ss_submissions for insert
  with check ( public.is_ss_teacher()
       or member_key in (select public.my_member_keys())
       or member_key in (select c.member_key from public.ss_my_children() c) );

drop policy if exists ss_submissions_delete on public.ss_submissions;
create policy ss_submissions_delete on public.ss_submissions for delete
  using ( public.is_ss_teacher()
       or member_key in (select public.my_member_keys())
       or member_key in (select c.member_key from public.ss_my_children() c) );

-- 4) 자녀 헌금 조회(보호자 전용 — 본인 자녀가 아니면 빈 결과)
create or replace function public.ss_child_offerings(p_key text)
returns json language sql security definer stable
set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'date', o.offer_date, 'account', o.category, 'service', o.service, 'amount', o.amount)
         order by o.offer_date desc), '[]'::json)
  from public.offerings o
  where o.member_key = p_key
    and p_key in (select c.member_key from public.ss_my_children() c)
$$;
grant execute on function public.ss_child_offerings(text) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
