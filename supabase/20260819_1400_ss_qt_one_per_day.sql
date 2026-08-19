-- ============================================================
--  운평장로교회 — QT·필사 인증은 하루 한 건만 (달란트도 하루 한 번만)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
--
--  [왜]
--   · 같은 어린이가 같은 날 QT 인증을 두 번 올릴 수 있었다(2026-08-19 실제 발생).
--   · 달란트 자동 지급은 이미 하루 1회로 막혀 있었지만(sunday_school_auto_talent.sql),
--     기록 자체가 두 줄로 남아 성장기에도 두 번 보였다.
--
--  [바뀌는 것]
--   1) 같은 (어린이 · 종류 · 날짜) 인증이 이미 있으면 새로 올릴 수 없다(친절한 오류 메시지).
--      - 잘못 올렸으면 지운 뒤 다시 올리면 된다(삭제하면 달란트도 함께 회수됨).
--      - 교사단이 대리 등록할 때도 같은 규칙이 적용된다.
--   2) '오늘' 기준을 한국 시간으로 바로잡는다.
--      - 지금까지 sub_date 기본값이 UTC 기준 current_date 라, 새벽~오전 9시 이전에 올린
--        인증이 '어제' 날짜로 기록됐다. 한국 시간(Asia/Seoul) 날짜로 바꾼다.
--      - 어린이·보호자가 올릴 때는 날짜를 항상 '오늘(한국 시간)'로 강제한다.
--        (당일 QT는 당일에만. 교사단은 대리 등록을 위해 지난 날짜도 허용)
--   3) 인증을 지울 때, 같은 날 같은 종류 인증이 남아 있으면 달란트를 그 인증으로 옮긴다.
--      - 두 건 중 달란트가 붙은 쪽을 지워도 하루 1회 지급이 유지된다.
--
--  ※ 이미 쌓인 중복 데이터는 건드리지 않는다(유니크 인덱스 대신 트리거를 쓴 이유).
--    지난 중복은 교사 화면 'QT·필사 인증 관리'에서 사람이 직접 삭제.
--
--  [되돌리기(롤백)]
--   -- drop trigger if exists ss_submissions_one_per_day on public.ss_submissions;
--   -- drop function if exists public.ss_submission_one_per_day();
--   -- alter table public.ss_submissions alter column sub_date set default current_date;
--   -- (달란트 이관은 sunday_school_auto_talent.sql 의 함수를 다시 실행하면 원래대로)
-- ============================================================

-- 0) 한국 시간 '오늘'
create or replace function public.kst_today()
returns date language sql stable
set search_path = public as $$
  select (now() at time zone 'Asia/Seoul')::date
$$;
grant execute on function public.kst_today() to anon, authenticated;

alter table public.ss_submissions alter column sub_date set default public.kst_today();

-- 1) 하루 한 건만
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

-- 2) 인증 삭제 시 — 같은 날 같은 종류가 남아 있으면 달란트를 그쪽으로 옮긴다
create or replace function public.ss_submission_revoke_talent()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_keep bigint;
begin
  select s.id into v_keep
    from public.ss_submissions s
   where s.member_key = old.member_key
     and s.stype      = old.stype
     and s.sub_date   = old.sub_date
     and s.id <> old.id
   order by s.id
   limit 1;

  if v_keep is not null then
    update public.ss_talents set submission_id = v_keep where submission_id = old.id;
  else
    delete from public.ss_talents where submission_id = old.id;
  end if;
  return old;
end $$;

-- 트리거는 sunday_school_auto_talent.sql 에서 이미 만들어져 있다(함수만 교체됨).
drop trigger if exists ss_submissions_revoke_talent on public.ss_submissions;
create trigger ss_submissions_revoke_talent
after delete on public.ss_submissions
for each row execute function public.ss_submission_revoke_talent();

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
