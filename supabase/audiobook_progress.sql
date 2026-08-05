-- ============================================================
--  운평장로교회 — 오디오북 듣기 진행 기록
--  «레위기에서 만난 예수 그리스도» 성도별 청취 위치·완료 여부를 저장.
--  · audiobook.html 재생기가 본인 기록을 올리고,
--  · 목회행정 ▸ 설교 대시보드 '오디오북 듣기 현황' 카드가 전체를 읽는다.
--  Supabase ▸ SQL Editor 에 1회 실행.
--
--  되돌리는 방법(사람이 직접 실행):
--    drop trigger if exists audiobook_progress_touch on public.audiobook_progress;
--    drop function if exists public.audiobook_progress_touch();
--    alter table public.audiobook_progress rename to audiobook_progress_archived;
--    (실제 DROP TABLE 은 4주 후 백업 확인 뒤에만)
-- ============================================================

create table if not exists public.audiobook_progress (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chapter_id text not null,                          -- 'book-00' ~ 'book-28' (audiobook-data.js 의 id)
  sec        integer not null default 0,             -- 마지막으로 듣던 위치(초). 완료 시 0
  dur        integer not null default 0,             -- 그 장의 전체 길이(초)
  done       boolean not null default false,         -- 끝까지 들었는지
  updated_at timestamptz not null default now(),
  primary key (user_id, chapter_id)
);
create index if not exists audiobook_progress_user_idx on public.audiobook_progress(user_id);

-- 갱신 시각 자동 기록(기기 시계에 의존하지 않기 위해 서버에서)
create or replace function public.audiobook_progress_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists audiobook_progress_touch on public.audiobook_progress;
create trigger audiobook_progress_touch
  before update on public.audiobook_progress
  for each row execute function public.audiobook_progress_touch();

alter table public.audiobook_progress enable row level security;

-- 본인 기록: 조회·저장·갱신
drop policy if exists "own read audiobook_progress" on public.audiobook_progress;
create policy "own read audiobook_progress" on public.audiobook_progress for select
  using (auth.uid() = user_id);
drop policy if exists "own insert audiobook_progress" on public.audiobook_progress;
create policy "own insert audiobook_progress" on public.audiobook_progress for insert
  with check (auth.uid() = user_id);
drop policy if exists "own update audiobook_progress" on public.audiobook_progress;
create policy "own update audiobook_progress" on public.audiobook_progress for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 관리자: 전체 현황 조회(목회행정 카드)
--   ※ 관리자 계정도 '본인 진도'를 읽을 때는 반드시 user_id=eq. 필터를 붙여 조회할 것
--     (성경읽기에서 관리자 화면에 남의 진도가 섞여 보였던 것과 같은 문제 예방)
drop policy if exists "admin read audiobook_progress" on public.audiobook_progress;
create policy "admin read audiobook_progress" on public.audiobook_progress for select
  using (exists (select 1 from public.admins a where a.uid = auth.uid()));
