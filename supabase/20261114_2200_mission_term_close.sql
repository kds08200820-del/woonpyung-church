-- ============================================================
--  운평장로교회 — 구제선교위원회: 회기 마감 (2026-11-14 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--  먼저 실행되어 있어야 하는 것: 20261110_1900 · 20261113_1200 (mission_fy · mission_home)
--
--  목사님: "관리자 페이지에서 회기년도 마감을 누르면 내년부터는 2028년이 새롭게 생성되어야 합니다."
--
--  규칙:
--   · 회기 메뉴 = 2026 부터 '지금 회기' 까지 + 다음 회기 1개('준비').
--   · '지금 회기' = 날짜로 정한 회기(12월 1일 시작)와 '마지막으로 마감한 회기 + 1' 가운데 큰 것.
--     예) 지금(2026-11-14) 2026 이 '지금', 2027 이 '준비'.
--         관리자가 2026 을 마감하면 → 2027 이 '지금', 2028 이 '준비'로 새로 생긴다.
--         마감하지 않아도 12월 1일이 되면 날짜로 2027 이 '지금', 2028 이 '준비'.
--   · 마감 취소(되돌리기)도 관리자만. 마감 기록은 지우지 않고 closed_at 을 비운다.
--
--  들어 있는 것 (모두 비파괴: CREATE TABLE · 함수 다시 정의):
--   1) mission_terms            : 회기별 마감 기록(회기, 마감 시각, 마감한 사람, 메모)
--   2) mission_fy(p_year)        : p_year 가 없을 때 '지금 회기' 를 위 규칙으로 (p_year 를 주면 예전과 같음)
--   3) mission_home()            : 회기 목록에 다음 회기(준비)를 붙이고, 마감한 회기 목록(closed)을 함께 준다
--   4) mission_term_close(회기) / mission_term_reopen(회기) : 관리자만
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · mission_fy · mission_home : 20261110_1900_mission_committee.sql 의 mission_fy, 20261113_1200_mission_officers_ledger.sql 의
--      mission_home 부분을 다시 실행
--    · 새 함수: drop function if exists public.mission_term_close(int), public.mission_term_reopen(int), public.mission_last_closed();
--    · 표: alter table public.mission_terms rename to mission_terms_archived;   (DROP 하지 않는다)
-- ============================================================

-- ── 1) 회기 마감 기록 ───────────────────────────────────────
create table if not exists public.mission_terms (
  fy_year    int primary key check (fy_year between 2000 and 2100),
  closed_at  timestamptz,                         -- 비어 있으면 마감 안 됨(또는 마감 취소)
  closed_by  uuid references auth.users (id) on delete set null,
  note       text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.mission_terms enable row level security;     -- 정책 없음 = 함수로만
revoke all on public.mission_terms from anon, authenticated;

-- 마지막으로 마감한 회기 (없으면 null)
create or replace function public.mission_last_closed()
returns int
language sql stable security definer set search_path = public as $$
  select max(fy_year) from public.mission_terms where closed_at is not null
$$;
revoke all on function public.mission_last_closed() from public, anon, authenticated;

-- ── 2) 회기 범위 — '지금 회기' 에 마감을 반영 ───────────────
create or replace function public.mission_fy(p_year int default null)
returns table (fy int, d_from date, d_to date)
language plpgsql stable security definer set search_path = public as $$
declare
  v_sm    int;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_y     int  := extract(year  from v_today)::int;
  v_m     int  := extract(month from v_today)::int;
  v_fy    int;
  v_sy    int;
  v_last  int;
begin
  begin
    select nullif(btrim(value), '')::int into v_sm from public.app_settings where key = 'fy_start_month';
  exception when others then v_sm := null;
  end;
  if v_sm is null or v_sm < 1 or v_sm > 12 then v_sm := 12; end if;

  if p_year is not null then v_fy := p_year;
  else
    if v_sm = 1  then v_fy := v_y;
    elsif v_sm >= 8 then v_fy := case when v_m >= v_sm then v_y + 1 else v_y end;
    else                 v_fy := case when v_m >= v_sm then v_y else v_y - 1 end;
    end if;
    -- 관리자가 회기를 마감했으면 그다음 회기가 '지금'
    begin
      v_last := public.mission_last_closed();
    exception when others then v_last := null;
    end;
    if v_last is not null and v_last + 1 > v_fy then v_fy := v_last + 1; end if;
  end if;

  v_sy := case when v_sm >= 8 then v_fy - 1 else v_fy end;
  fy     := v_fy;
  d_from := make_date(v_sy, v_sm, 1);
  d_to   := (d_from + interval '1 year' - interval '1 day')::date;
  return next;
end $$;
revoke all on function public.mission_fy(int) from public, anon, authenticated;

-- ── 3) 화면이 처음 읽는 것 — 다음 회기(준비)와 마감 목록 ─────
create or replace function public.mission_home()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_fy int;
  v_uid uuid := auth.uid();
  v_admin boolean := false;
  v_fin boolean := false;
  v_roles jsonb := '[]'::jsonb;
begin
  select f.fy into v_fy from public.mission_fy(null) f;
  if v_uid is not null then
    v_admin := exists (select 1 from public.admins a where a.uid = v_uid);
    v_fin   := public.is_finance();
    select coalesce(jsonb_agg(jsonb_build_object('year', o.fy_year, 'role', o.role)), '[]'::jsonb) into v_roles
      from public.mission_officers o join public.member_links l on l.member_key = o.member_key
     where l.user_id = v_uid and coalesce(o.member_key, '') <> '' and o.active;
  end if;
  return jsonb_build_object(
    'current', v_fy,
    'next',    v_fy + 1,
    'years',   (select jsonb_agg(y order by y desc) from generate_series(least(2026, v_fy), v_fy + 1) y),
    'closed',  coalesce((select jsonb_agg(t.fy_year order by t.fy_year desc) from public.mission_terms t where t.closed_at is not null), '[]'::jsonb),
    'my',      jsonb_build_object('admin', v_admin, 'finance', v_fin, 'roles', v_roles));
end $$;
revoke all on function public.mission_home() from public;
grant execute on function public.mission_home() to anon, authenticated;

-- ── 4) 회기 마감 · 마감 취소 (관리자만) ─────────────────────
--   마감할 수 있는 회기 = 지금 회기와 그 앞 회기. 마감 취소 = 마지막으로 마감한 회기만.
create or replace function public.mission_term_close(p_year int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fy int;
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then raise exception '회기 마감은 관리자가 합니다'; end if;
  select f.fy into v_fy from public.mission_fy(null) f;
  if p_year is null or p_year > v_fy then raise exception '지금 회기(%년도)까지만 마감할 수 있습니다', v_fy; end if;
  insert into public.mission_terms (fy_year, closed_at, closed_by, updated_at) values (p_year, now(), auth.uid(), now())
  on conflict (fy_year) do update set closed_at = now(), closed_by = auth.uid(), updated_at = now();
  return public.mission_home();
end $$;
revoke all on function public.mission_term_close(int) from public, anon;
grant execute on function public.mission_term_close(int) to authenticated;

create or replace function public.mission_term_reopen(p_year int)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then raise exception '마감 취소는 관리자가 합니다'; end if;
  if p_year is distinct from public.mission_last_closed() then raise exception '마지막으로 마감한 회기만 마감을 취소할 수 있습니다'; end if;
  update public.mission_terms set closed_at = null, closed_by = auth.uid(), updated_at = now() where fy_year = p_year;
  return public.mission_home();
end $$;
revoke all on function public.mission_term_reopen(int) from public, anon;
grant execute on function public.mission_term_reopen(int) to authenticated;

-- ── 실행 후 확인(메타데이터 · 건수만) ───────────────────────
--   select public.mission_home() - 'my';      -- current 2026, next 2027, years [2027, 2026], closed []
--   select count(*) from public.mission_terms; -- 0
