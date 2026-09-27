-- 달란트 ↔ 주일학교 출석 연동을 지우기·고치기까지 (2026-09-27)
--  · 넣기: '출석' 이 든 달란트 → 그날 주일학교 출석
--  · 지우기: 그날 그 아이의 '출석' 달란트가 더 없으면 출석도 지운다
--  · 고치기(날짜·이유를 바꿈): 옛 날짜 쪽을 지우기처럼, 새 쪽을 넣기처럼
-- 되돌리기: 20260927_1500_attendance.sql 의 ss_talent_attend 트리거(넣기만)로 다시 만들면 된다
create or replace function public.ss_talent_attend() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('DELETE', 'UPDATE') and old.reason like '%출석%' then
    if not exists (select 1 from public.ss_talents t
                   where t.member_key = old.member_key and t.talent_date = old.talent_date and t.reason like '%출석%'
                     and (tg_op = 'DELETE' or t.id <> old.id)) then
      delete from public.attendance where service = '주일학교' and member_key = old.member_key and att_date = old.talent_date;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.reason like '%출석%' then
    insert into public.attendance (att_date, service, member_key, member_name, method, late, created_by)
    values (new.talent_date, '주일학교', new.member_key, coalesce(new.child_name, ''), 'talent', new.reason like '%지각%', coalesce(new.created_by, ''))
    on conflict (att_date, service, member_key) do update set late = excluded.late, created_by = excluded.created_by, checked_at = now();
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists ss_talent_attend on public.ss_talents;
create trigger ss_talent_attend after insert or update or delete on public.ss_talents for each row execute function public.ss_talent_attend();
