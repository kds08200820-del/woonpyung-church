-- ============================================================
--  매주 월요일 생일(생월)자 알림 — 담임목사 2026-11-22 지시
--  "매주 월요일이 되면 생월자를 알림으로 나에게 알려주세요. 교적부 db 를 사용하세요."
--
--  · bday_push_keys          : 관리자(admins) 기기의 알림 열쇠(무작위 32자). 이름·교적 정보 아님.
--  · bday_my_push_key()      : 관리자가 목회행정 화면을 열면 열쇠를 받아 그 기기에 OneSignal 태그 bk=<열쇠> 를 붙인다.
--  · bday_push_feed(날짜?)   : (공개키로 부름, 날짜는 시험용 — 빼면 오늘) 이번 주(월~일, 한국 시간)·이번 달 생일 '건수'와 관리자 열쇠만.
--                              이름·생년월일은 내보내지 않는다 → apps-script/birthday-week-push.gs 가 매주 월요일 아침 푸시.
--  · bday_list(from, to)     : 관리자만. 그 기간 생일자 이름·생일(월-일)·태어난 해·직책·구역. 알림을 누르면 열리는 창에서 씀.
--  · 생일은 교적부 gyojeok.birth(양력). 2월 29일생은 평년에 2월 28일로 친다. 삭제된 교적(gyojeok_deleted)은 안 셈.
--
--  되돌리기(파괴 없이):
--    revoke execute on function public.bday_push_feed(date) from anon, authenticated;
--    revoke execute on function public.bday_my_push_key(), public.bday_list(date, date) from authenticated;
--    alter table public.bday_push_keys rename to bday_push_keys_archived;
--    (Apps Script 쪽은 deleteBirthdayPushTrigger 실행)
-- ============================================================

create table if not exists public.bday_push_keys (
  uid        uuid primary key,
  push_key   text not null unique,
  created_at timestamptz not null default now()
);
alter table public.bday_push_keys enable row level security;
-- 정책 없음: 표는 아래 security definer 함수로만 다룬다.

create or replace function public.bday_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.uid = auth.uid())
$$;

-- 올해(또는 기준 해)의 생일 날짜. 2/29 생은 평년이면 2/28.
create or replace function public.bday_on(p_birth date, p_year int)
returns date language sql immutable set search_path = public as $$
  select case
    when p_birth is null then null
    when extract(month from p_birth) = 2 and extract(day from p_birth) = 29
         and not ((p_year % 4 = 0 and p_year % 100 <> 0) or p_year % 400 = 0)
      then make_date(p_year, 2, 28)
    else make_date(p_year, extract(month from p_birth)::int, extract(day from p_birth)::int)
  end
$$;

-- p_from~p_to(최대 1년) 사이에 생일이 드는 날짜(해를 넘는 주도 처리)
create or replace function public.bday_next(p_birth date, p_from date)
returns date language sql immutable set search_path = public as $$
  select case
    when p_birth is null then null
    when public.bday_on(p_birth, extract(year from p_from)::int) >= p_from
      then public.bday_on(p_birth, extract(year from p_from)::int)
    else public.bday_on(p_birth, extract(year from p_from)::int + 1)
  end
$$;

create or replace function public.bday_my_push_key()
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not public.bday_is_admin() then return null; end if;
  select push_key into v from public.bday_push_keys where uid = auth.uid();
  if v is null then
    v := md5(gen_random_uuid()::text || clock_timestamp()::text);
    insert into public.bday_push_keys (uid, push_key) values (auth.uid(), v)
      on conflict (uid) do nothing;
    select push_key into v from public.bday_push_keys where uid = auth.uid();
  end if;
  return v;
end $$;

create or replace function public.bday_push_feed(p_today date default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with d as (
    select coalesce(p_today, (now() at time zone 'Asia/Seoul')::date) as today
  ), w as (
    select today - ((extract(isodow from today)::int) - 1) as ws, today from d
  ), r as (
    select w.ws, w.ws + 6 as we,
           date_trunc('month', w.today)::date as ms,
           (date_trunc('month', w.today) + interval '1 month - 1 day')::date as me
      from w
  )
  select jsonb_build_object(
    'week_start', r.ws, 'week_end', r.we, 'month', to_char(r.ms, 'YYYY-MM'),
    'week_n',  (select count(*) from public.gyojeok g where g.birth is not null and public.bday_next(g.birth, r.ws) <= r.we),
    'month_n', (select count(*) from public.gyojeok g where g.birth is not null and public.bday_next(g.birth, r.ms) <= r.me),
    'keys', coalesce((select jsonb_agg(k.push_key order by k.created_at)
                        from public.bday_push_keys k join public.admins a on a.uid = k.uid), '[]'::jsonb)
  ) from r
$$;

create or replace function public.bday_list(p_from date, p_to date)
returns table (id bigint, name text, on_date date, birth_year int, role text, groups text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.bday_is_admin() then raise exception '관리자만 볼 수 있습니다'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception '기간이 맞지 않습니다'; end if;
  return query
    select g.id::bigint, g.name, public.bday_next(g.birth, p_from), extract(year from g.birth)::int, g.role, g.groups
      from public.gyojeok g
     where g.birth is not null and public.bday_next(g.birth, p_from) <= p_to
     order by 3, g.name;
end $$;

revoke all on function public.bday_my_push_key() from public, anon;
revoke all on function public.bday_list(date, date) from public, anon;
revoke all on function public.bday_is_admin() from public, anon;
revoke all on function public.bday_push_feed(date) from public;
grant execute on function public.bday_my_push_key() to authenticated;
grant execute on function public.bday_list(date, date) to authenticated;
grant execute on function public.bday_push_feed(date) to anon, authenticated;
