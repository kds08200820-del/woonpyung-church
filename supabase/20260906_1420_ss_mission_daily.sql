-- ============================================================
--  운평장로교회 — 주일학교 '연속미션' (2026-09-06)
--  Supabase ▸ SQL Editor 에 통째로 붙여넣고 Run (여러 번 실행해도 안전)
--
--  [무엇인가]
--   · 미션을 정할 때 '연속미션'을 고르고 연속 일수를 정할 수 있다.
--     (예: "3일 동안 하루 1장씩 기도하는 사진 올리기 — 3일 채우면 성공")
--   · 연속미션은 하루에 1장만 올릴 수 있고(서버 트리거로 강제),
--     정한 일수를 모두 채우는 순간 미션 달란트가 한 번에 지급된다.
--   · 기존 미션(daily_days=0)은 지금과 똑같이 '주 1회, 정한 장수 한 번에' 동작.
--
--  [만드는 것]
--   1) ss_missions.daily_days      : 연속 일수 (0 = 일반 미션, 기본값)
--   2) ss_current_mission()        : daily_days 포함하도록 교체
--   3) ss_submission_one_per_day() : 연속미션 = 하루 1건·최대 daily_days건 규칙 추가
--   4) ss_submission_auto_talent() : 연속미션 = 마지막 날 인증 때 일괄 지급
--
--  [주의] 이 파일보다 오래된 미션 SQL(20260823_1500, 20260830_1420)을 나중에
--         다시 실행하면 함수가 예전 판으로 돌아간다. 그때는 이 파일을 재실행.
--
--  [되돌리기(롤백) — 삭제 정책에 따라 DROP 대신 조회 중단]
--   -- 함수 원복: supabase/20260830_1420_ss_mission_photo_count.sql 의 ss_current_mission,
--   --            supabase/20260823_1500_ss_weekly_mission.sql 의 트리거 함수 2개를 다시 실행.
--   -- 칼럼(daily_days)은 프론트에서 조회만 중단, RENAME/삭제는 4주 후 사람이 직접.
-- ============================================================

-- ── 1) 미션에 '연속 일수' (0 = 일반 미션) ──
alter table public.ss_missions
  add column if not exists daily_days integer not null default 0;

-- ── 2) 이번 주 미션 조회 — daily_days 포함 ──
create or replace function public.ss_current_mission()
returns json language sql security definer stable
set search_path = public as $$
  select json_build_object(
           'id', m.id, 'week_start', m.week_start, 'title', m.title,
           'description', m.description, 'amount', m.amount,
           'photo_count', coalesce(m.photo_count, 1),
           'daily_days', coalesce(m.daily_days, 0))
  from public.ss_missions m
  where m.week_start = public.ss_week_start()
  limit 1
$$;
grant execute on function public.ss_current_mission() to anon, authenticated;

-- ── 3) 올리기 규칙 — 연속미션은 '하루 1건, 최대 daily_days건' ──
create or replace function public.ss_submission_one_per_day()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_daily integer;
begin
  -- 어린이·보호자가 올리면 날짜는 항상 오늘(한국 시간). 교사단은 지난 날짜 대리 등록 허용.
  if not public.is_ss_teacher() then
    new.sub_date := public.kst_today();
  elsif new.sub_date is null then
    new.sub_date := public.kst_today();
  end if;

  if new.stype = '미션' then
    -- 미션 인증: 이번 주 미션에 자동 연결
    if new.mission_id is null then
      select m.id into new.mission_id
        from public.ss_missions m
       where m.week_start = public.ss_week_start(new.sub_date);
      if new.mission_id is null then
        raise exception '이번 주 미션이 아직 등록되지 않았어요. 선생님께 문의해 주세요.';
      end if;
    end if;

    select coalesce(m.daily_days, 0) into v_daily
      from public.ss_missions m where m.id = new.mission_id;

    if coalesce(v_daily, 0) > 0 then
      -- 연속미션: 하루에 1장만
      if exists (select 1 from public.ss_submissions s
                 where s.member_key = new.member_key
                   and s.mission_id = new.mission_id
                   and s.sub_date   = new.sub_date) then
        raise exception '오늘 미션 인증은 이미 올렸어요. 연속미션은 하루에 1장만 올릴 수 있어요. 내일 또 올려 주세요!';
      end if;
      -- 연속미션: 정한 일수를 다 채웠으면 더 못 올림
      if (select count(*) from public.ss_submissions s
           where s.member_key = new.member_key
             and s.mission_id = new.mission_id) >= v_daily then
        raise exception '연속미션 %일을 모두 인증했어요. 이번 주 미션은 이미 성공! 🎉', v_daily;
      end if;
      return new;
    end if;

    -- 일반 미션: 같은 미션은 한 번만(주 1회)
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
drop trigger if exists ss_submissions_one_per_day on public.ss_submissions;
create trigger ss_submissions_one_per_day
before insert on public.ss_submissions
for each row execute function public.ss_submission_one_per_day();

-- ── 4) 달란트 자동 지급 — 연속미션은 마지막 날 인증 때 일괄 지급 ──
create or replace function public.ss_submission_auto_talent()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_amount integer; v_name text; v_daily integer; v_title text; v_cnt integer;
begin
  if new.stype = '미션' then
    select coalesce(m.daily_days, 0), coalesce(nullif(m.amount, 0), 1), m.title
      into v_daily, v_amount, v_title
      from public.ss_missions m where m.id = new.mission_id;

    if coalesce(v_daily, 0) > 0 then
      -- 연속미션: 이번 인증까지 몇 건인지 — 정확히 daily_days건이 되는 순간에만 지급
      -- (초과 등록은 위 트리거가 막으므로 등호 비교면 지급도 정확히 한 번)
      select count(*) into v_cnt from public.ss_submissions s
       where s.member_key = new.member_key and s.mission_id = new.mission_id;
      if v_cnt <> v_daily then
        return new;                       -- 아직 진행 중 — 지급 없음
      end if;
      v_name := '연속미션 ' || v_daily || '일 성공: ' || coalesce(v_title, '이번주 미션');
      if v_amount is null then v_amount := 1; end if;
    else
      -- 일반 미션: 같은 미션 지급이 이미 있으면 중복 지급하지 않음(주 1회)
      if exists (select 1 from public.ss_submissions s
                 where s.member_key = new.member_key
                   and s.mission_id = new.mission_id and s.id <> new.id) then
        return new;
      end if;
      v_name := '이번주 미션: ' || coalesce(v_title, '');
      if v_amount is null then v_amount := 1; v_name := '이번주 미션'; end if;
    end if;
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
drop trigger if exists ss_submissions_auto_talent on public.ss_submissions;
create trigger ss_submissions_auto_talent
after insert on public.ss_submissions
for each row execute function public.ss_submission_auto_talent();

-- ※ 연속미션 달란트는 '마지막 날 인증'에 연결(submission_id)되어 있어,
--   그 인증을 삭제하면 기존 회수 트리거가 달란트도 회수한다. 중간 날 인증을
--   지우면 건수가 줄어 그날 다시 올릴 수 있다(지급은 여전히 마지막 건에서 한 번).

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
