-- ============================================================
--  운평장로교회 — 주일학교 '연속 QT 미션' (2026-11-15, 담임목사 지시)
--  Supabase ▸ SQL Editor 에 통째로 붙여넣고 Run (여러 번 실행해도 안전)
--
--  [무엇인가]
--   · 정한 기간 동안 하루도 빠지지 않고 QT 인증을 올리면 추가 달란트를 한 번 지급한다.
--     첫 미션: 2026-11-15(주일) ~ 2026-11-21(토) 7일, 추가 50달란트.
--   · QT 인증 한 건마다 받는 달란트(주일학교 항목 'QT 인증')는 지금 그대로 — 이것은 그 위에 얹는 추가분.
--   · 기간의 모든 날짜에 QT 인증이 채워지는 순간(마지막 날 인증, 또는 교사단의 지난 날짜 대리 등록) 지급.
--     어린이 한 명에게 미션 하나당 한 번만.
--   · 기간 안의 QT 인증을 지워 빈 날이 생기면 추가 달란트도 회수한다(다시 채우면 다시 지급).
--
--  [만드는 것]
--   1) ss_qt_streaks              : 연속 QT 미션(기간·추가 달란트)
--   2) ss_talents.qt_streak_id    : 이 미션으로 지급한 달란트 표시(중복 지급 방지·회수용, 비어 있어도 됨)
--   3) ss_qt_streak_grant()       : QT 인증 올리면 — 기간을 다 채웠는지 보고 지급 (트리거)
--   4) ss_qt_streak_revoke()      : QT 인증 지우면 — 빈 날이 생겼으면 회수 (트리거)
--   5) ss_qt_streak_current()     : 오늘 진행 중인 연속 QT 미션(화면 안내용)
--
--  ※ 기존 함수(ss_submission_auto_talent 등)는 건드리지 않는다 — 트리거를 따로 붙인다.
--
--  [되돌리기(롤백) — 삭제 정책에 따라 DROP 대신 멈추기]
--   -- alter table public.ss_submissions disable trigger ss_submissions_qt_streak_grant;
--   -- alter table public.ss_submissions disable trigger ss_submissions_qt_streak_revoke;
--   -- (화면은 ss_qt_streak_current 가 null 을 주면 아무것도 안 보인다 — 미션 기간을 지난 날짜로 바꿔도 됨)
--   -- 표(ss_qt_streaks)·칼럼(qt_streak_id)은 조회만 중단, RENAME/삭제는 4주 후 사람이 직접.
-- ============================================================

-- ── 1) 연속 QT 미션 ──
create table if not exists public.ss_qt_streaks (
  id          bigint generated always as identity primary key,
  title       text not null,
  start_date  date not null,
  end_date    date not null,
  amount      integer not null default 0,     -- 다 채우면 주는 추가 달란트
  created_by  text,
  created_at  timestamptz not null default now(),
  constraint ss_qt_streaks_range check (end_date >= start_date)
);

alter table public.ss_qt_streaks enable row level security;
grant select on public.ss_qt_streaks to anon, authenticated;
grant insert, update, delete on public.ss_qt_streaks to authenticated;

-- 조회: 누구나(기간·달란트 수만 들어 있다) / 추가·수정·삭제: 교사단(+관리자)
drop policy if exists ss_qt_streaks_select on public.ss_qt_streaks;
create policy ss_qt_streaks_select on public.ss_qt_streaks for select using ( true );
drop policy if exists ss_qt_streaks_write on public.ss_qt_streaks;
create policy ss_qt_streaks_write on public.ss_qt_streaks for all
  using ( public.is_ss_teacher() ) with check ( public.is_ss_teacher() );

-- ── 2) 이 미션으로 지급한 달란트 표시 ──
alter table public.ss_talents add column if not exists qt_streak_id bigint;
create index if not exists ss_talents_qt_streak_idx on public.ss_talents(qt_streak_id) where qt_streak_id is not null;

-- ── 3) QT 인증 올리면 — 기간을 다 채웠으면 추가 달란트 ──
create or replace function public.ss_qt_streak_grant()
returns trigger language plpgsql security definer
set search_path = public as $$
declare s record; v_days integer;
begin
  if new.stype <> 'QT' then return new; end if;
  for s in select * from public.ss_qt_streaks q
            where new.sub_date between q.start_date and q.end_date and q.amount > 0
  loop
    select count(distinct u.sub_date) into v_days
      from public.ss_submissions u
     where u.member_key = new.member_key and u.stype = 'QT'
       and u.sub_date between s.start_date and s.end_date;
    if v_days >= (s.end_date - s.start_date + 1)
       and not exists (select 1 from public.ss_talents t
                        where t.member_key = new.member_key and t.qt_streak_id = s.id) then
      insert into public.ss_talents (member_key, child_name, amount, reason, talent_date, created_by, qt_streak_id)
      values (new.member_key, new.child_name, s.amount, s.title || ' 성공', new.sub_date, '자동 지급', s.id);
    end if;
  end loop;
  return new;
end $$;

create or replace trigger ss_submissions_qt_streak_grant
after insert on public.ss_submissions
for each row execute function public.ss_qt_streak_grant();

-- ── 4) QT 인증 지우면 — 그 날짜가 비었으면 추가 달란트 회수 ──
create or replace function public.ss_qt_streak_revoke()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if old.stype <> 'QT' then return old; end if;
  -- 같은 날 QT 인증이 남아 있으면(지난 중복 자료) 연속은 그대로
  if exists (select 1 from public.ss_submissions u
              where u.member_key = old.member_key and u.stype = 'QT'
                and u.sub_date = old.sub_date and u.id <> old.id) then
    return old;
  end if;
  delete from public.ss_talents t
   where t.member_key = old.member_key
     and t.qt_streak_id in (select q.id from public.ss_qt_streaks q
                             where old.sub_date between q.start_date and q.end_date);
  return old;
end $$;

create or replace trigger ss_submissions_qt_streak_revoke
after delete on public.ss_submissions
for each row execute function public.ss_qt_streak_revoke();

-- ── 5) 오늘 진행 중인 연속 QT 미션 (없으면 null) ──
create or replace function public.ss_qt_streak_current()
returns json language sql security definer stable
set search_path = public as $$
  select json_build_object(
           'id', q.id, 'title', q.title, 'start_date', q.start_date,
           'end_date', q.end_date, 'amount', q.amount,
           'days', (q.end_date - q.start_date + 1))
  from public.ss_qt_streaks q
  where public.kst_today() between q.start_date and q.end_date and q.amount > 0
  order by q.start_date desc, q.id desc
  limit 1
$$;
grant execute on function public.ss_qt_streak_current() to anon, authenticated;

-- ── 6) 첫 미션: 11/15(주일)~11/21(토) 매일 QT → 추가 50달란트 (이미 있으면 넣지 않음) ──
insert into public.ss_qt_streaks (title, start_date, end_date, amount, created_by)
select '연속 QT 미션(11/15~11/21)', date '2026-11-15', date '2026-11-21', 50, '담임목사'
where not exists (select 1 from public.ss_qt_streaks q
                   where q.start_date = date '2026-11-15' and q.end_date = date '2026-11-21');

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
