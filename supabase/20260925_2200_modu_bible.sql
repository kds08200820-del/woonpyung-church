-- 2026 모두의 성경(모바일 PWA) — 정회원 전용
--  · modu_notes / modu_highlights : 계정별 메모·형광펜 (데스크탑 「설교자의 성경」의 SQLite 와 같은 뜻)
--  · modu_release                : 대시보드에서 관리하는 모바일판 배포 판 (데스크탑 app_release 와 별도)
-- 실행: Supabase ▸ SQL Editor 에 붙여넣기

create table if not exists public.modu_notes (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  ref        text not null default '',
  book       text not null default '',
  title      text not null,
  theme      text not null default '',
  content    text not null default '',
  tags       text not null default '',
  links      text[] not null default '{}',          -- [[제목]] 연결 (저장할 때 앱이 풀어서 넣는다)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_modu_notes_user on public.modu_notes(user_id, updated_at desc);
alter table public.modu_notes enable row level security;
drop policy if exists "own modu_notes" on public.modu_notes;
create policy "own modu_notes" on public.modu_notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.modu_highlights (
  user_id    uuid not null references auth.users(id) on delete cascade,
  bi         smallint not null,
  ci         smallint not null,
  vi         smallint not null,
  color      text not null,
  ref        text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, bi, ci, vi)
);
alter table public.modu_highlights enable row level security;
drop policy if exists "own modu_highlights" on public.modu_highlights;
create policy "own modu_highlights" on public.modu_highlights for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 모바일판 배포 판: 관리자가 대시보드(목회 행정 ▸ 설치 관리 ▸ 모바일)에서 적는다. 앱은 켤 때 enabled 인 최신 판을 읽어 새 판이면 알린다.
create table if not exists public.modu_release (
  id         serial primary key,
  version    text not null unique,                 -- 예: 1.0.0
  notes      text not null default '',
  enabled    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.modu_release enable row level security;
drop policy if exists "admin all modu_release" on public.modu_release;
create policy "admin all modu_release" on public.modu_release for all
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "read enabled modu_release" on public.modu_release;
create policy "read enabled modu_release" on public.modu_release for select
  to authenticated using (enabled);

grant select, insert, update, delete on public.modu_notes, public.modu_highlights to authenticated;
grant usage, select on sequence public.modu_notes_id_seq to authenticated;
grant select on public.modu_release to authenticated;
grant all on public.modu_release to authenticated;   -- 실제 쓰기는 RLS(관리자)로 막힌다
grant usage, select on sequence public.modu_release_id_seq to authenticated;
