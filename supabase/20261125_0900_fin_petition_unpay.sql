-- 재정 청원 「지급 완료」 취소 (2026-11-25 담임목사 지시)
--   「아직 5주 결제가 이루어지지 않았는데 지급 완료라고 나옵니다. 수정해주세요.」
--   · 재정 권한자가 잘못 적힌 지급 완료를 지운다(금주 청구 내역 「지급 완료 취소」).
--   · 11월 5주(2026-11-29) 결의서를 미리 인쇄하며 적힌 지급 완료를 지운다.
--   되돌리기: drop function public.fin_petition_unpay(bigint[]);

create or replace function public.fin_petition_unpay(p_ids bigint[])
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.can_access_finance() then raise exception '재정 권한이 필요합니다.'; end if;
  update public.fin_petitions
     set paid_at = null, updated_at = now()
   where id = any(coalesce(p_ids, '{}'::bigint[])) and paid_at is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.fin_petition_unpay(bigint[]) from public, anon;
grant execute on function public.fin_petition_unpay(bigint[]) to authenticated;

-- 아직 오지 않은 주의 결의서를 미리 인쇄해 적힌 지급 완료를 지운다
update public.fin_petitions set paid_at = null, updated_at = now()
 where paid_at is not null and week_sunday > (paid_at at time zone 'Asia/Seoul')::date;
