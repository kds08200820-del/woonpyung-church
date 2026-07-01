-- ============================================================
-- 대시보드 "오늘의 큐티" 아멘 체크 기록
-- Supabase ▸ SQL Editor 에 붙여넣고 Run 하세요. (한 번만, 다시 실행해도 안전)
-- 본인만 자신의 체크를 읽고/쓸 수 있습니다.
-- ============================================================

create table if not exists public.qt_checks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  check_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, check_date)
);
alter table public.qt_checks enable row level security;

drop policy if exists "qt_checks_own" on public.qt_checks;
create policy "qt_checks_own" on public.qt_checks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
