-- ============================================================
-- 운평장로교회 — 주일 자료 작업에 '항목별 진행 상황' 추가
-- Supabase ▸ SQL Editor 에 붙여넣고 Run 하세요. (한 번만, 다시 실행해도 안전)
--
-- 왜 필요한가:
--   지금은 progress 에 "예배 자료 생성 중" 같은 문장 하나만 남아서,
--   6가지 산출물 중 무엇이 끝났는지 알 수 없다. 이 칸에 항목별 상태를
--   적어 두면 설교 매니저 화면에서 체크 표시로 보여줄 수 있다.
--
-- 담기는 모양 (키는 outputs 의 항목명과 같다):
--   {"ppt":"done","cuesheet":"done","youth":"working",
--    "teacher":"wait","bulletin":"wait","summary":"wait"}
--     wait    = 아직 시작 전
--     working = 만드는 중
--     done    = 파일 생성 완료
--     up      = 자료실 업로드까지 완료
--     fail    = 실패
--
-- 되돌리려면 (자료는 지우지 않는다):
--   alter table public.worship_jobs drop column if exists steps;
-- ============================================================

alter table public.worship_jobs
  add column if not exists steps jsonb not null default '{}'::jsonb;

comment on column public.worship_jobs.steps is
  '산출물별 진행 상황. {"ppt":"done","youth":"working",...} — 설교 매니저 화면의 체크 표시에 쓰인다.';
