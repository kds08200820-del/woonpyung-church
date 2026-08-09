-- ============================================================
--  운평장로교회 — 주일학교 인증 알림 피드 (Apps Script 푸시용)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (1회, 여러 번 실행해도 안전)
--
--  · apps-script/ss-cert-push.gs 가 5분마다 이 함수를 호출해
--    새 인증이 올라왔는지 확인하고, '교사 태그'가 붙은 기기에만 푸시.
--  · 개인정보(이름·사진) 미포함 — id/종류/날짜/건수만 반환하므로
--    익명(anon) 키로 호출해도 안전.
--
--  [되돌리기(롤백)]
--   -- drop function if exists public.ss_cert_feed();
-- ============================================================

create or replace function public.ss_cert_feed()
returns json language sql security definer stable
set search_path = public as $$
  select json_build_object(
    'maxId', coalesce((select max(id) from public.ss_submissions), 0),
    'pending', (select count(*) from public.ss_submissions where confirmed_by is null),
    'recent', coalesce((select json_agg(json_build_object('id', s.id, 'stype', s.stype, 'date', s.sub_date) order by s.id desc)
              from (select id, stype, sub_date from public.ss_submissions order by id desc limit 10) s), '[]'::json)
  )
$$;
grant execute on function public.ss_cert_feed() to anon, authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
