-- 재정 청원 「지급 완료」 (2026-11-24 담임목사 지시)
--   당회장 도장이 찍힌 지출결의서를 인쇄하면, 그 결의서에 든 (확인된) 온라인 청원을 지급 완료로 적는다.
--   상태(status)는 'approved' 그대로 두고 paid_at 칸만 더한다 → 기존 예산 · 결의서 계산은 바뀌지 않는다.
--   되돌리기: alter table public.fin_petitions drop column paid_at; drop function public.fin_petition_mark_paid(bigint[]);
--            그리고 fin_petition_review 를 20261124_0800_fin_petitions.sql 의 것으로 다시 만든다.

alter table public.fin_petitions add column if not exists paid_at timestamptz;

-- 재정 권한자가 인쇄한 결의서의 청원들을 지급 완료로(이미 적힌 것은 그대로)
create or replace function public.fin_petition_mark_paid(p_ids bigint[])
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.can_access_finance() then raise exception '재정 권한이 필요합니다.'; end if;
  update public.fin_petitions
     set paid_at = now(), updated_at = now()
   where id = any(coalesce(p_ids, '{}'::bigint[])) and status = 'approved' and paid_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.fin_petition_mark_paid(bigint[]) from public, anon;
grant execute on function public.fin_petition_mark_paid(bigint[]) to authenticated;

-- 확인 취소 · 돌려보냄이면 지급 완료 표시도 지운다
create or replace function public.fin_petition_review(p_id bigint, p_status text, p_note text default '')
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.can_access_finance() then raise exception '재정 권한이 필요합니다.'; end if;
  if p_status not in ('approved', 'rejected', 'submitted') then raise exception '알 수 없는 상태: %', p_status; end if;
  update public.fin_petitions
     set status = p_status, review_note = coalesce(p_note, ''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now(),
         paid_at = case when p_status = 'approved' then paid_at else null end
   where id = p_id and status <> 'cancelled';
  if not found then raise exception '청원을 찾지 못했습니다.'; end if;
end $$;
revoke all on function public.fin_petition_review(bigint, text, text) from public, anon;
grant execute on function public.fin_petition_review(bigint, text, text) to authenticated;
