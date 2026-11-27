-- ============================================================
--  운평장로교회 — 한 주간의 이슈 고민: 관리자가 고른 이슈 (2026-11-27 담임목사 지시)
--  "오늘의 이슈 고민을 한 주간의 이슈 고민으로 해주시고, 4개 중 하나를 관리자가 선택해서 기재 할 수 있도록.
--   선택이 없을 시 월요일을 기준으로 업데이트를 하고 1번 이슈를 메인으로"
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  관리자는 세상을 향하여 › 한 주간의 이슈 고민 에서 나의 서재 달력으로 날과 이슈를 고른다 (js/issues-feed.js)
--  → church_settings 의 'weekly_issue' 줄에 { week: 그 주 월요일, day, topic: {theme, why, issue, source, books} } 로 저장
--    (church_settings 는 관리자만 읽고 쓴다 — 기존 정책 그대로)
--   · weekly_issue_pick() : (공개) 그 한 줄만 돌려준다. 첫 화면 · 세상을 향하여 화면이 읽는다
--  들어 있는 것: CREATE OR REPLACE FUNCTION 하나 · GRANT (비파괴). 필요한 것: church_settings.sql
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    drop function if exists public.weekly_issue_pick();
--    (고른 것 지우기: church_settings 의 key = 'weekly_issue' 줄 — 화면은 줄이 없으면 월요일 1번 이슈를 보인다)
-- ============================================================

create or replace function public.weekly_issue_pick()
returns json language sql stable security definer set search_path = public as $$
  select coalesce((select data::json from public.church_settings where key = 'weekly_issue'), 'null'::json)
$$;
revoke all on function public.weekly_issue_pick() from public;
grant execute on function public.weekly_issue_pick() to anon, authenticated;

insert into public.schema_log(file) values ('20261127_1500_weekly_issue.sql') on conflict (file) do update set applied_at = now();
