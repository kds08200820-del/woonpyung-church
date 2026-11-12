-- ============================================================
--  구제선교위원회 회계 보고 (2026-11-12, 담임목사 지시) — Supabase → SQL Editor 에서 1회 실행
--
--  mission_report(p_year) 함수 하나를 더한다(비파괴 — 표·정책은 그대로).
--  · 보는 사람: 그 회기 구제선교위원회 회원(그 회기에 선교헌금을 드린 본인)과 관리자·재정 담당. 그 밖에는 null.
--  · 수입: 그 회기 '선교헌금' 의 달별 합계. 누가 얼마 냈는지는 돌려주지 않는다.
--  · 지출: 재정 지출 전표 가운데 계정 '구제선교위원회'·'선교 / 구제비' 를 받는 곳별로 합한다.
--          받는 곳이 후원처 목록(mission_partners)의 이름을 담고 있으면 그 이름으로,
--          아니면 '그 밖의 구제·후원' 한 줄로 묶는다 — 구제를 받은 분의 이름은 나오지 않는다(목사님 선택).
--  · 회기: mission_fy() 와 같다(12월 1일 ~ 다음 해 11월 30일).
--
--  되돌리는 방법 (사람이 직접): drop function if exists public.mission_report(int);
--    (화면은 함수가 없으면 회계 보고 칸을 보이지 않는다)
-- ============================================================

create or replace function public.mission_report(p_year int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_fy int;  v_from date;  v_to date;
  v_uid uuid := auth.uid();
  v_staff boolean := false;
  v_me boolean := false;
  v_income jsonb;  v_in_total bigint;
  v_spend  jsonb;  v_out_total bigint;
begin
  select f.fy, f.d_from, f.d_to into v_fy, v_from, v_to from public.mission_fy(p_year) f;
  if v_uid is null then return null; end if;

  v_staff := public.is_finance();
  v_me := exists (
    select 1 from public.offerings o
     where o.category = '선교헌금' and o.offer_date between v_from and v_to and o.amount > 0
       and coalesce(o.member_key, '') <> ''
       and o.member_key in (select public.my_member_keys()));
  if not (v_staff or v_me) then return null; end if;

  -- 수입: 달별 합계
  select coalesce(jsonb_agg(jsonb_build_object('ym', x.ym, 'amount', x.amt) order by x.ym), '[]'::jsonb),
         coalesce(sum(x.amt), 0)
    into v_income, v_in_total
    from (select to_char(o.offer_date, 'YYYY-MM') as ym, sum(o.amount)::bigint as amt
            from public.offerings o
           where o.category = '선교헌금' and o.offer_date between v_from and v_to and o.amount > 0
           group by 1) x;

  -- 지출: 받는 곳별 합계(후원처 이름이 아니면 한 줄로)
  select coalesce(jsonb_agg(jsonb_build_object('label', y.label, 'amount', y.amt, 'n', y.n) order by y.other, y.amt desc), '[]'::jsonb),
         coalesce(sum(y.amt), 0)
    into v_spend, v_out_total
    from (select coalesce(p.name, '그 밖의 구제·후원') as label,
                 (p.name is null) as other,
                 sum(e.amount)::bigint as amt, count(*)::int as n
            from public.expenses e
            left join lateral (
              select mp.name from public.mission_partners mp
               where btrim(coalesce(e.payee, '')) <> ''
                 and position(replace(mp.name, ' ', '') in replace(e.payee, ' ', '')) > 0
               order by char_length(mp.name) desc limit 1) p on true
           where e.account in ('구제선교위원회', '선교 / 구제비')
             and e.exp_date between v_from and v_to
           group by 1, 2) y;

  return jsonb_build_object(
    'year', v_fy, 'from', v_from, 'to', v_to,
    'income', v_income, 'income_total', v_in_total,
    'spend', v_spend, 'spend_total', v_out_total,
    'balance', v_in_total - v_out_total
  );
end $$;

revoke all on function public.mission_report(int) from public, anon;
grant execute on function public.mission_report(int) to authenticated;

-- 실행 뒤 확인(메타데이터만):
--   select count(*) from pg_proc where proname = 'mission_report';   -- 1
