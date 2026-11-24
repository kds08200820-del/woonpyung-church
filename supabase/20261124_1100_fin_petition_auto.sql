-- 재정 청원: 확인 없이 바로 지출결의서에 들어감 (2026-11-24 담임목사 지시)
--   「결의서에 자동으로 들어가도록 해주세요. 확인할 필요 없습니다. 들어간 결의서를 삭제할 수 있으면 됩니다.」
--   · 새 청원의 기본 상태를 'approved'(결의서에 들어감)로. 올리는 함수(fin_petition_submit · submit2)는 기본값을 쓰므로 그대로.
--   · 지금 '확인 대기'인 청원도 결의서에 넣는다.
--   · 청원자는 지급 전이면 스스로 거둘 수 있다(전에는 확인 대기일 때만).
--   · 재정부는 지출결의서에서 ✕ 로 뺀다 → fin_petition_review(..., 'rejected') (돌려보냄으로 청원자에게 보임).
--   되돌리기: alter table public.fin_petitions alter column status set default 'submitted';
--            fin_petition_cancel 은 20261124_0800_fin_petitions.sql 의 것으로 다시 만든다.

alter table public.fin_petitions alter column status set default 'approved';

update public.fin_petitions set status = 'approved', updated_at = now() where status = 'submitted';

create or replace function public.fin_petition_cancel(p_id bigint)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  update public.fin_petitions set status = 'cancelled', updated_at = now()
   where id = p_id and requester_uid = auth.uid() and status in ('submitted', 'approved') and paid_at is null;
  if not found then raise exception '지급 전의 내 청원만 거둘 수 있습니다.'; end if;
end $$;
revoke all on function public.fin_petition_cancel(bigint) from public, anon;
grant execute on function public.fin_petition_cancel(bigint) to authenticated;
