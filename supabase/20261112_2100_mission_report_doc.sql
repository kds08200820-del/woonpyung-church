-- ============================================================
--  구제선교위원회 회계 보고 — 회계가 만든 보고서로 바꾸기 (2026-11-12, 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행
--
--  목사님: "회계 보고서 지워주세요. 그리고 이것으로 다시 업로드 하세요."
--   · 재정 장부에서 계산하던 mission_report() 를 버리고, 위원회 회계가 만든 보고서
--     (2026_구제선교위원회_총회_회계보고서(보고용).docx 의 표 4개)를 그대로 돌려준다.
--   · 보고서 숫자는 app_settings 의 'mission_report_<회기>' 에 JSON 으로 둔다(관리자 화면에서 올린다).
--     app_settings 는 재정 담당만 읽을 수 있는 표라, 회원이 아닌 사람에게는 보이지 않는다.
--     (저장소·GitHub 에는 숫자를 두지 않는다 — 저장소는 공개)
--   · 보는 사람은 그대로: 그 회기 구제선교위원회 회원(선교헌금을 드린 본인)과 관리자·재정 담당.
--  비파괴: 함수 정의만 바꾼다.
--
--  되돌리는 방법 (사람이 직접): supabase/20261112_2000_mission_report.sql 을 다시 실행
-- ============================================================

create or replace function public.mission_report(p_year int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_fy int;  v_from date;  v_to date;
  v_uid uuid := auth.uid();
  v_staff boolean := false;
  v_me boolean := false;
  v_doc text;
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

  select value into v_doc from public.app_settings where key = 'mission_report_' || v_fy;
  if v_doc is null or btrim(v_doc) = '' then
    return jsonb_build_object('year', v_fy, 'doc', null);   -- 아직 올린 보고서가 없다
  end if;
  return jsonb_build_object('year', v_fy, 'doc', v_doc::jsonb);
end $$;

revoke all on function public.mission_report(int) from public, anon;
grant execute on function public.mission_report(int) to authenticated;

-- 실행 뒤 확인(메타데이터만):
--   select position('mission_report_' in pg_get_functiondef('public.mission_report(int)'::regprocedure)) > 0;   -- true
