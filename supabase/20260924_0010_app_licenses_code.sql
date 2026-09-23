-- 설교자의 성경 — 인증 코드 원문 칸 (관리자만 본다; 기존 RLS 정책이 그대로 적용됨)
-- 코드 원문은 이 파일이 아니라 대시보드 "코드 목록 넣기"로 채운다 (저장소에 코드가 남지 않게).
-- 되돌리기: alter table public.app_licenses rename column code to code_archived;

alter table public.app_licenses add column if not exists code text;
