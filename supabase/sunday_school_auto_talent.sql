-- ============================================================
--  운평장로교회 — QT·필사 인증 업로드 시 달란트 자동 지급
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (1회, 여러 번 실행해도 안전)
--
--  [동작]
--   · 인증샷 업로드(ss_submissions INSERT) → 달란트 자동 지급(ss_talents INSERT)
--   · 지급량: 달란트 항목 관리의 'QT 인증' / '필사 인증' 값 (없으면 1)
--     → 교사단이 항목 관리에서 값을 바꾸면 그대로 반영됨
--   · 같은 날 같은 종류 인증을 또 올리면 중복 지급하지 않음(하루 1회)
--   · 인증 삭제 시 그 인증으로 지급된 달란트 자동 회수
--
--  [되돌리기(롤백)]
--   -- drop trigger if exists ss_submissions_auto_talent on public.ss_submissions;
--   -- drop trigger if exists ss_submissions_revoke_talent on public.ss_submissions;
--   -- drop function if exists public.ss_submission_auto_talent();
--   -- drop function if exists public.ss_submission_revoke_talent();
--   -- (ss_talents.submission_id 칼럼은 조회만 중단, RENAME은 4주 후)
-- ============================================================

-- 자동 지급분과 인증을 연결(삭제 시 회수용)
alter table public.ss_talents add column if not exists submission_id bigint;

-- 인증 종류별 지급 항목 시드('QT 인증'/'필사 인증'이 없을 때만 추가)
insert into public.ss_talent_items (name, amount, sort)
select v.name, v.amount, v.sort
from (values ('QT 인증', 1, 6), ('필사 인증', 2, 7)) as v(name, amount, sort)
where not exists (select 1 from public.ss_talent_items i where i.name = v.name);

-- 업로드 → 자동 지급
create or replace function public.ss_submission_auto_talent()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_amount integer; v_name text;
begin
  -- 같은 날 같은 종류 인증이 이미 있으면 중복 지급하지 않음
  if exists (select 1 from public.ss_submissions s
             where s.member_key = new.member_key and s.stype = new.stype
               and s.sub_date = new.sub_date and s.id <> new.id) then
    return new;
  end if;
  v_name := new.stype || ' 인증';
  select i.amount into v_amount from public.ss_talent_items i where i.name = v_name limit 1;
  if v_amount is null or v_amount = 0 then v_amount := 1; end if;
  insert into public.ss_talents (member_key, child_name, amount, reason, talent_date, created_by, submission_id)
  values (new.member_key, new.child_name, v_amount, v_name, new.sub_date, '자동 지급', new.id);
  return new;
end $$;

drop trigger if exists ss_submissions_auto_talent on public.ss_submissions;
create trigger ss_submissions_auto_talent
after insert on public.ss_submissions
for each row execute function public.ss_submission_auto_talent();

-- 인증 삭제 → 자동 지급분 회수
create or replace function public.ss_submission_revoke_talent()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  delete from public.ss_talents where submission_id = old.id;
  return old;
end $$;

drop trigger if exists ss_submissions_revoke_talent on public.ss_submissions;
create trigger ss_submissions_revoke_talent
after delete on public.ss_submissions
for each row execute function public.ss_submission_revoke_talent();

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
