-- ============================================================
--  운평장로교회 — 교회 PC 워커가 멈춘 것을 알기 (2026-11-25 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  워커들(tools/ai_worker.py · worship_worker.py · kakao_worker.py)은 돌고 있는 동안 5분에 한 번
--  church_settings 의 'worker_ai' · 'worker_worship' · 'kakao_worker' 줄에 마지막 확인 시각을 남긴다.
--   · worker_health()          : (관리자) 워커마다 마지막 확인 시각 · 몇 분 전인지 · 멈춘 것 같은지
--                                → 목회행정 대시보드 「해야 할 일」에 「교회 PC 워커 확인」이 뜬다
--   · worker_health_push_feed(): (공개) 멈춘 워커 이름과 관리자 알림 열쇠만 — apps-script/worker-health-push.gs 가 읽어
--                                관리자 기기에 알린다(교적 인증 신청 알림과 같은 기기 태그 mm)
--  멈춤 기준: AI · 주일 자료 워커는 마지막 확인이 40분 넘게, 카카오톡 워커는 아침에만 돌므로 26시간 넘게(하루를 건너뜀) 지남.
--  한 번도 기록이 없는 워커(아직 새 코드로 켜지 않은 것)는 알리지 않는다.
--  들어 있는 것: CREATE OR REPLACE FUNCTION 둘(비파괴). 필요한 것: church_settings.sql · 20261124_2355_member_match_push.sql
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    drop function if exists public.worker_health(), public.worker_health_push_feed();
-- ============================================================

create or replace function public.worker_health()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'name', w.name, 'label', w.label,
           'last_seen', s.data ->> 'last_seen',
           'host', s.data ->> 'host',
           'state', coalesce(s.data ->> 'state', s.data ->> 'kakao'),
           'minutes', case when s.data ? 'last_seen' then floor(extract(epoch from (now() - (s.data ->> 'last_seen')::timestamptz)) / 60)::int end,
           'stale', coalesce((s.data ->> 'last_seen')::timestamptz < now() - make_interval(mins => w.lim), false)
         ) order by w.ord), '[]'::json)
    from (values (1, 'ai', 'worker_ai', 'AI 답변 · 설교 PDF', 40), (2, 'worship', 'worker_worship', '주일 예배 자료', 40), (3, 'kakao', 'kakao_worker', '카카오톡 QT 발송', 1560))
         as w(ord, name, k, label, lim)
    left join public.church_settings s on s.key = w.k
   where exists (select 1 from public.admins a where a.uid = auth.uid())
$$;
revoke all on function public.worker_health() from public, anon;
grant execute on function public.worker_health() to authenticated;

-- 공개 키로 부른다 — 멈춘 워커 이름 · 몇 분 · 관리자 알림 열쇠만 내보낸다(PC 이름 · 자료 없음)
create or replace function public.worker_health_push_feed()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'key', (select nullif(value, '') from public.app_settings where key = 'member_match_push_key'),
    'stale', coalesce((
      select json_agg(json_build_object('name', w.name, 'label', w.label,
                                        'minutes', floor(extract(epoch from (now() - (s.data ->> 'last_seen')::timestamptz)) / 60)::int) order by w.ord)
        from (values (1, 'ai', 'worker_ai', 'AI 답변 · 설교 PDF', 40), (2, 'worship', 'worker_worship', '주일 예배 자료', 40), (3, 'kakao', 'kakao_worker', '카카오톡 QT 발송', 1560))
             as w(ord, name, k, label, lim)
        join public.church_settings s on s.key = w.k
       where s.data ? 'last_seen'
         and coalesce(s.data ->> 'state', '') <> 'stopped'
         and (s.data ->> 'last_seen')::timestamptz < now() - make_interval(mins => w.lim)), '[]'::json));
$$;
revoke all on function public.worker_health_push_feed() from public;
grant execute on function public.worker_health_push_feed() to anon, authenticated;

insert into public.schema_log(file) values ('20261125_1400_worker_health.sql') on conflict (file) do update set applied_at = now();
