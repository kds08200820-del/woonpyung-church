-- 주일학교가 모인 날(그해 어린이 출석이 한 명이라도 있는 날) — 어린이 출석률의 분모 (2026-09-27)
-- 학부모는 다른 아이의 출석을 볼 수 없으므로(RLS) 날짜만 내어 주는 함수로 둔다
-- 되돌리기: drop function if exists public.attendance_ss_days(int);
create or replace function public.attendance_ss_days(p_year int)
returns setof date language sql security definer stable set search_path = public as $$
  select distinct a.att_date from public.attendance a
  where a.service = '주일학교' and extract(year from a.att_date)::int = p_year
  order by 1
$$;
revoke all on function public.attendance_ss_days(int) from public;
grant execute on function public.attendance_ss_days(int) to authenticated;
