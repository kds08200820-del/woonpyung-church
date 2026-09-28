-- 출석 (2026-09-27)
--  · 어른: 홈페이지 히어로의 '오늘의 예배' 단추를 예배 시간에 누르면 출석 (rpc attend_hero) — 시간은 서버 시계로 다시 확인한다
--  · 어린이: 주일학교 교사가 달란트를 '출석' 항목으로 주면 정시, '출석(지각)' 항목이면 지각으로 출석 (ss_talents 트리거)
--  · 교적 연동: member_key(교적 '이름|생년월일') 로 저장 — 교적·대시보드가 같은 열쇠로 읽는다
--  · 본인(가족 포함)·주일학교 교사·관리자만 읽는다
-- 되돌리기(DROP 대신 RENAME):
--   drop trigger if exists ss_talent_attend on public.ss_talents; alter table public.attendance rename to attendance_archived;

create table if not exists public.attendance (
  id          bigserial primary key,
  att_date    date        not null,
  service     text        not null,              -- 주일 1부 · 주일 2부 · 주일 예배 · 수요기도회 · 새벽기도회 · 주일학교
  member_key  text        not null,              -- 교적 '이름|YYYYMMDD'
  member_name text        not null default '',
  user_id     uuid,                              -- 홈페이지 계정(어른). 어린이는 비어 있다
  method      text        not null default 'hero',   -- hero · talent · admin
  late        boolean     not null default false,
  late_min    integer     not null default 0,     -- 예배 시작보다 몇 분 늦었나 (지각일 때)
  created_by  text        not null default '',
  checked_at  timestamptz not null default now(),
  unique (att_date, service, member_key)
);
create index if not exists idx_attendance_member on public.attendance (member_key, att_date desc);
create index if not exists idx_attendance_date on public.attendance (att_date, service);
alter table public.attendance enable row level security;

drop policy if exists "attendance read" on public.attendance;
create policy "attendance read" on public.attendance for select to authenticated using (
  member_key in (select public.my_member_keys())
  or member_key in (select c.member_key from public.ss_my_children() c)
  or exists (select 1 from public.admins a where a.uid = auth.uid())
  or (service = '주일학교' and public.is_ss_teacher())
);
drop policy if exists "attendance admin write" on public.attendance;
create policy "attendance admin write" on public.attendance for all to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
grant select on public.attendance to authenticated;
grant insert, update, delete on public.attendance to authenticated;
grant usage, select on sequence public.attendance_id_seq to authenticated;

-- 예배 시간표 (한국 시각, 분) — 홈페이지 js/worship.js 의 SCHED 와 같게. 출석 창: 시작 10분 전 ~ 끝난 뒤 10분
create or replace function public.att_window(p_service text, out start_min int, out end_min int, out dow int)
language sql immutable as $$
  select s.a, s.b, s.d from (values
    ('주일 1부', 9*60+20, 10*60+40, 0),
    ('주일 2부', 11*60,   12*60+30, 0),
    ('주일 예배', 11*60,  12*60+30, 0),
    ('수요기도회', 11*60, 12*60,    3),
    ('새벽기도회', 4*60+30, 6*60,   -1)
  ) as s(n, a, b, d) where s.n = p_service
$$;

-- 어른 출석: 히어로 단추 → 서버 시각으로 출석 창 안인지 확인 → 교적 열쇠로 기록 (같은 예배 두 번은 한 번만)
create or replace function public.attend_hero(p_service text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := (now() at time zone 'Asia/Seoul');
  v_min int := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  v_dow int := extract(dow from v_now)::int;
  w record; m record; v_late int; v_id bigint;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  select * into w from public.att_window(p_service);
  if w.start_min is null then return json_build_object('ok', false, 'why', 'service'); end if;
  if (w.dow >= 0 and v_dow <> w.dow) or (w.dow = -1 and v_dow = 0)
     or v_min < w.start_min - 10 or v_min > w.end_min + 10 then
    return json_build_object('ok', false, 'why', 'time');
  end if;
  select ml.member_key, ml.member_name into m from public.member_links ml where ml.user_id = auth.uid();
  if m.member_key is null or m.member_key = '' then return json_build_object('ok', false, 'why', 'member'); end if;
  v_late := greatest(0, v_min - w.start_min);
  insert into public.attendance (att_date, service, member_key, member_name, user_id, method, late, late_min, created_by)
  values (v_now::date, p_service, m.member_key, coalesce(m.member_name, ''), auth.uid(), 'hero', v_late > 0, v_late, '')
  on conflict (att_date, service, member_key) do nothing
  returning id into v_id;
  return json_build_object('ok', true, 'already', v_id is null, 'late', v_late > 0, 'late_min', v_late, 'service', p_service, 'name', m.member_name);
end $$;
revoke all on function public.attend_hero(text) from public;
grant execute on function public.attend_hero(text) to authenticated;

-- 어린이 출석: 달란트를 '출석' 항목으로 주면 정시, '지각' 이 든 항목이면 지각
create or replace function public.ss_talent_attend() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reason is null or new.reason not like '%출석%' then return new; end if;
  insert into public.attendance (att_date, service, member_key, member_name, method, late, created_by)
  values (new.talent_date, '주일학교', new.member_key, coalesce(new.child_name, ''), 'talent', new.reason like '%지각%', coalesce(new.created_by, ''))
  on conflict (att_date, service, member_key) do update set late = excluded.late, created_by = excluded.created_by, checked_at = now();
  return new;
end $$;
drop trigger if exists ss_talent_attend on public.ss_talents;
create trigger ss_talent_attend after insert on public.ss_talents for each row execute function public.ss_talent_attend();

-- 지각 출석 항목 (금액은 주일학교에서 항목 관리로 바꿀 수 있다)
insert into public.ss_talent_items (name, amount, sort)
select '출석(지각)', 1, coalesce((select sort from public.ss_talent_items where name = '출석' limit 1), 1)
where not exists (select 1 from public.ss_talent_items where name = '출석(지각)');

-- 지금까지 '출석' 달란트로 준 기록도 출석으로 옮긴다 (한 번만, 겹치면 건너뜀)
insert into public.attendance (att_date, service, member_key, member_name, method, late, created_by, checked_at)
select t.talent_date, '주일학교', t.member_key, coalesce(t.child_name, ''), 'talent', t.reason like '%지각%', coalesce(t.created_by, ''), t.created_at
from public.ss_talents t where t.reason like '%출석%'
on conflict (att_date, service, member_key) do nothing;

-- 관리자 통계: 기간 안의 예배별·날짜별 출석 수, 정시 수
create or replace function public.attendance_report(p_from date, p_to date)
returns table (att_date date, service text, total bigint, on_time bigint)
language sql security definer stable set search_path = public as $$
  select a.att_date, a.service, count(*), count(*) filter (where not a.late)
  from public.attendance a
  where a.att_date between p_from and p_to
    and exists (select 1 from public.admins x where x.uid = auth.uid())
  group by a.att_date, a.service order by a.att_date desc, a.service
$$;
grant execute on function public.attendance_report(date, date) to authenticated;
