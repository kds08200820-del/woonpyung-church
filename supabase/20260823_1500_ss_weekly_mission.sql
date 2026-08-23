-- ============================================================
--  운평장로교회 — 주일학교 '이번주 미션' (2026-08-23)
--  Supabase ▸ SQL Editor 에 통째로 붙여넣고 Run (여러 번 실행해도 안전)
--
--  [무엇인가]
--   · 교사단(교사·부장·서기·담임목사=관리자)이 한 주에 한 번 미션을 정한다.
--     (예: "부모님 안마해 드리기 — 달란트 3개")
--   · 어린이는 주중 언제든 한 번, QT·필사와 같은 방식으로 인증샷을 올린다.
--   · 올리는 순간 그 미션의 달란트가 자동 지급된다. (주 1회만)
--   · 홈 화면 '주일학교 성장기'에 미션 인증도 함께 게시된다.
--
--  [만드는 것]
--   1) ss_missions            : 주간 미션 (week_start = 그 주 일요일, 주당 1건)
--   2) ss_submissions.mission_id : 인증 ↔ 미션 연결 칼럼
--   3) ss_week_start()        : 한국 시간 기준 '이번 주 일요일' 계산
--   4) ss_current_mission()   : 이번 주 미션 조회 RPC (홈 화면용, anon 허용)
--   5) 트리거 함수 교체:
--      · ss_submission_one_per_day : 미션은 '주 1회' 규칙 + mission_id 자동 연결
--      · ss_submission_auto_talent : 미션은 미션에 정한 달란트로 지급
--
--  [되돌리기(롤백) — 삭제 정책에 따라 DROP 대신 RENAME]
--   -- alter table public.ss_missions rename to ss_missions_archived;
--   -- drop function if exists public.ss_current_mission();
--   -- drop function if exists public.ss_week_start(date);
--   -- 트리거 함수는 supabase/20260819_1400_ss_qt_one_per_day.sql 과
--   --   supabase/sunday_school_auto_talent.sql 을 다시 실행하면 이전 동작으로 복귀.
--   -- (ss_submissions.mission_id 칼럼은 조회만 중단, RENAME은 4주 후)
-- ============================================================

-- ── 1) 이번 주 일요일(한국 시간) ──
-- 주일학교의 '한 주'는 주일(일요일)에 시작한다. dow: 일=0 … 토=6
create or replace function public.ss_week_start(d date default null)
returns date language sql stable
set search_path = public as $$
  select coalesce(d, public.kst_today())
       - extract(dow from coalesce(d, public.kst_today()))::int
$$;
grant execute on function public.ss_week_start(date) to anon, authenticated;

-- ── 2) 주간 미션 ──
create table if not exists public.ss_missions (
  id          bigint generated always as identity primary key,
  week_start  date not null,                  -- 그 주 일요일
  title       text not null,                  -- 미션 이름
  description text,                           -- 설명(선택)
  amount      integer not null default 3,     -- 달성 시 달란트
  created_by  text,                           -- 만든 교사 이름
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- 한 주에 미션은 1건
create unique index if not exists ss_missions_week_idx on public.ss_missions(week_start);

create or replace function public.ss_missions_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_ss_missions_touch on public.ss_missions;
create trigger trg_ss_missions_touch before update on public.ss_missions
for each row execute function public.ss_missions_touch();

alter table public.ss_missions enable row level security;
grant select, insert, update, delete on public.ss_missions to authenticated;

-- 조회: 로그인한 누구나(어린이·보호자가 미션을 봐야 한다. 민감정보 없음)
drop policy if exists ss_missions_select on public.ss_missions;
create policy ss_missions_select on public.ss_missions for select
  using ( true );

-- 작성/수정/삭제: 교사단(교사·부장·서기)과 관리자(담임목사)만
drop policy if exists ss_missions_write on public.ss_missions;
create policy ss_missions_write on public.ss_missions for all
  using ( public.is_ss_teacher() ) with check ( public.is_ss_teacher() );

-- ── 3) 인증 ↔ 미션 연결 ──
alter table public.ss_submissions add column if not exists mission_id bigint;

-- ── 4) 이번 주 미션 조회(홈 '성장기' 배너·어린이 화면 공용, 없으면 null) ──
create or replace function public.ss_current_mission()
returns json language sql security definer stable
set search_path = public as $$
  select json_build_object(
           'id', m.id, 'week_start', m.week_start, 'title', m.title,
           'description', m.description, 'amount', m.amount)
  from public.ss_missions m
  where m.week_start = public.ss_week_start()
  limit 1
$$;
grant execute on function public.ss_current_mission() to anon, authenticated;

-- ── 5-1) 올리기 규칙: QT·필사는 하루 1회(기존 유지), 미션은 주 1회 ──
--  (20260819_1400_ss_qt_one_per_day.sql 의 함수를 미션 지원판으로 교체)
create or replace function public.ss_submission_one_per_day()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  -- 어린이·보호자가 올리면 날짜는 항상 오늘(한국 시간). 교사단은 지난 날짜 대리 등록 허용.
  if not public.is_ss_teacher() then
    new.sub_date := public.kst_today();
  elsif new.sub_date is null then
    new.sub_date := public.kst_today();
  end if;

  if new.stype = '미션' then
    -- 미션 인증: 이번 주 미션에 자동 연결하고, 같은 미션은 한 번만
    if new.mission_id is null then
      select m.id into new.mission_id
        from public.ss_missions m
       where m.week_start = public.ss_week_start(new.sub_date);
      if new.mission_id is null then
        raise exception '이번 주 미션이 아직 등록되지 않았어요. 선생님께 문의해 주세요.';
      end if;
    end if;
    if exists (select 1 from public.ss_submissions s
               where s.member_key = new.member_key
                 and s.mission_id = new.mission_id) then
      raise exception '이번 주 미션 인증은 이미 올렸어요. 미션은 한 주에 한 번만 올릴 수 있어요.';
    end if;
    return new;
  end if;

  -- QT·필사: 하루 한 건만 (기존 규칙 그대로)
  if exists (select 1 from public.ss_submissions s
             where s.member_key = new.member_key
               and s.stype      = new.stype
               and s.sub_date   = new.sub_date) then
    raise exception '%(%) 인증은 이미 올렸습니다. 하루에 한 번만 올릴 수 있어요.',
      new.stype, to_char(new.sub_date, 'MM월 DD일');
  end if;

  return new;
end $$;
-- 트리거는 20260819_1400_ss_qt_one_per_day.sql 에서 이미 만들어져 있다(함수만 교체).
drop trigger if exists ss_submissions_one_per_day on public.ss_submissions;
create trigger ss_submissions_one_per_day
before insert on public.ss_submissions
for each row execute function public.ss_submission_one_per_day();

-- ── 5-2) 달란트 자동 지급: 미션은 미션에 정한 달란트로 ──
--  (sunday_school_auto_talent.sql 의 함수를 미션 지원판으로 교체)
create or replace function public.ss_submission_auto_talent()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_amount integer; v_name text;
begin
  if new.stype = '미션' then
    -- 같은 미션 지급이 이미 있으면 중복 지급하지 않음(주 1회)
    if exists (select 1 from public.ss_submissions s
               where s.member_key = new.member_key
                 and s.mission_id = new.mission_id and s.id <> new.id) then
      return new;
    end if;
    select coalesce(nullif(m.amount, 0), 1), '이번주 미션: ' || m.title
      into v_amount, v_name
      from public.ss_missions m where m.id = new.mission_id;
    if v_amount is null then v_amount := 1; v_name := '이번주 미션'; end if;
  else
    -- QT·필사: 같은 날 같은 종류 인증이 이미 있으면 중복 지급하지 않음(하루 1회)
    if exists (select 1 from public.ss_submissions s
               where s.member_key = new.member_key and s.stype = new.stype
                 and s.sub_date = new.sub_date and s.id <> new.id) then
      return new;
    end if;
    v_name := new.stype || ' 인증';
    select i.amount into v_amount from public.ss_talent_items i where i.name = v_name limit 1;
    if v_amount is null or v_amount = 0 then v_amount := 1; end if;
  end if;

  insert into public.ss_talents (member_key, child_name, amount, reason, talent_date, created_by, submission_id)
  values (new.member_key, new.child_name, v_amount, v_name, new.sub_date, '자동 지급', new.id);
  return new;
end $$;
-- 트리거는 sunday_school_auto_talent.sql 에서 이미 만들어져 있다(함수만 교체).
drop trigger if exists ss_submissions_auto_talent on public.ss_submissions;
create trigger ss_submissions_auto_talent
after insert on public.ss_submissions
for each row execute function public.ss_submission_auto_talent();

-- ※ 인증 삭제 시 달란트 회수(ss_submission_revoke_talent)는 submission_id 로 연결되어
--   있어 미션 인증에도 그대로 동작한다(수정 불필요).

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
