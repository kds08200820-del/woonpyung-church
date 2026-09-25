-- 설교자의 성경 — 사용자 등록(이름·교회, 이메일): 업그레이드 안내용
alter table public.app_licenses add column if not exists user_name text;
alter table public.app_licenses add column if not exists user_email text;
alter table public.app_licenses add column if not exists registered_at timestamptz;
