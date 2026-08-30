-- ============================================================
--  운평장로교회 — 필사 인증은 한 주에 한 번만 (2026-08-30)
--  Supabase ▸ SQL Editor 에 통째로 붙여넣고 Run (여러 번 실행해도 안전)
--
--  [바뀌는 것]
--   · 필사 인증: 하루 1회 → 한 주(일요일 시작, ss_week_start 기준)에 1회
--   · QT는 하루 1회, 미션은 주 1회 — 기존 그대로
--   · 달란트 자동 지급·삭제 시 회수(이관)도 필사만 '같은 주' 기준으로 맞춘다
--
--  [바꾸는 함수 3개 — 트리거는 그대로, 함수만 교체]
--   1) ss_submission_one_per_day : 필사에 '주 1회' 규칙 추가
--   2) ss_submission_auto_talent : 필사 중복 지급 방지를 '같은 주' 기준으로
--   3) ss_submission_revoke_talent : 필사 인증 삭제 시 같은 주에 남은 인증으로 달란트 이관
--
--  ※ 이미 쌓인 데이터(한 주에 여러 건)는 건드리지 않는다.
--    새로 올리는 것만 막고, 지난 중복은 교사 화면에서 사람이 정리.
--
--  [되돌리기(롤백)]
--   -- supabase/20260823_1500_ss_weekly_mission.sql 을 다시 실행하면
--   -- 세 함수 모두 이전 동작(필사 하루 1회)으로 복귀한다.
-- ============================================================

-- ── 1) 올리기 규칙: QT 하루 1회 · 필사 주 1회 · 미션 주 1회 ──
create or replace function public.ss_submission_one_per_day()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_ws date;
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

  if new.stype = '필사' then
    -- 필사: 한 주(일요일 시작)에 한 건만
    v_ws := public.ss_week_start(new.sub_date);
    if exists (select 1 from public.ss_submissions s
               where s.member_key = new.member_key
                 and s.stype      = '필사'
                 and s.sub_date  >= v_ws
                 and s.sub_date   < v_ws + 7) then
      raise exception '필사 인증은 그 주(%~%)에 이미 올렸습니다. 필사는 한 주에 한 번만 올릴 수 있어요.',
        to_char(v_ws, 'MM월 DD일'), to_char(v_ws + 6, 'MM월 DD일');
    end if;
    return new;
  end if;

  -- QT: 하루 한 건만 (기존 규칙 그대로)
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

-- ── 2) 달란트 자동 지급: 필사 중복 방지도 '같은 주' 기준으로 ──
create or replace function public.ss_submission_auto_talent()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_amount integer; v_name text; v_ws date;
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
    -- QT: 같은 날 · 필사: 같은 주에 인증이 이미 있으면 중복 지급하지 않음
    if new.stype = '필사' then
      v_ws := public.ss_week_start(new.sub_date);
      if exists (select 1 from public.ss_submissions s
                 where s.member_key = new.member_key and s.stype = '필사'
                   and s.sub_date >= v_ws and s.sub_date < v_ws + 7
                   and s.id <> new.id) then
        return new;
      end if;
    elsif exists (select 1 from public.ss_submissions s
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

-- ── 3) 인증 삭제 시 달란트 이관: 필사는 같은 주에 남은 인증으로 ──
--  (지난 중복 데이터에서 달란트가 붙은 쪽을 지워도 주 1회 지급이 유지되도록)
create or replace function public.ss_submission_revoke_talent()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_keep bigint; v_ws date;
begin
  if old.stype = '필사' then
    v_ws := public.ss_week_start(old.sub_date);
    select s.id into v_keep
      from public.ss_submissions s
     where s.member_key = old.member_key
       and s.stype      = '필사'
       and s.sub_date  >= v_ws and s.sub_date < v_ws + 7
       and s.id <> old.id
     order by s.id
     limit 1;
  else
    select s.id into v_keep
      from public.ss_submissions s
     where s.member_key = old.member_key
       and s.stype      = old.stype
       and s.sub_date   = old.sub_date
       and s.id <> old.id
     order by s.id
     limit 1;
  end if;

  if v_keep is not null then
    update public.ss_talents set submission_id = v_keep where submission_id = old.id;
  else
    delete from public.ss_talents where submission_id = old.id;
  end if;
  return old;
end $$;
-- 트리거는 sunday_school_auto_talent.sql 에서 이미 만들어져 있다(함수만 교체).
drop trigger if exists ss_submissions_revoke_talent on public.ss_submissions;
create trigger ss_submissions_revoke_talent
after delete on public.ss_submissions
for each row execute function public.ss_submission_revoke_talent();

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
