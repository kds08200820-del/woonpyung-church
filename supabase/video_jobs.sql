-- ============================================================
--  QT 영상 제작 작업 큐 (2026-07, 1회 실행)
--  Supabase → SQL Editor 에 붙여넣고 Run.
--
--  · 설교 매니저의 "🎬 영상 제작" 버튼이 이 테이블에 작업을 넣고,
--    집/교회 PC의 워커(qt_worker.py)가 작업을 가져가 영상을 만듭니다.
--  · 두 PC가 동시에 돌아도 claim_video_job()이 FOR UPDATE SKIP LOCKED로
--    한 작업을 한 워커만 가져가도록 보장합니다.
--
--  되돌리기(참고용 — CLAUDE.md 삭제 정책에 따라 실제로는 RENAME 권장):
--    alter table public.video_jobs rename to video_jobs_archived;
--    drop function if exists public.claim_video_job(text);
-- ============================================================

create table if not exists public.video_jobs (
  id           bigint generated always as identity primary key,
  sermon_date  date not null,                       -- 어떤 날짜의 QT로 영상을 만들지
  job_type     text not null default 'qt',          -- 추후 확장용 (qt / sermon 등)
  status       text not null default 'pending',     -- pending | processing | done | error
  requested_by uuid default auth.uid(),             -- 버튼을 누른 관리자
  claimed_by   text,                                -- 작업을 가져간 워커 이름 (home-pc / church-pc)
  claimed_at   timestamptz,
  progress     text,                                -- 진행 단계 표시 ("장면 2/5 영상 생성 중" 등)
  video_url    text,                                -- 완성 영상 URL (R2)
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.video_jobs is 'QT 영상 자동 제작 작업 큐 — 설교 매니저 버튼 → PC 워커';

-- updated_at 자동 갱신
create or replace function public.video_jobs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_video_jobs_touch on public.video_jobs;
create trigger trg_video_jobs_touch before update on public.video_jobs
for each row execute function public.video_jobs_touch();

-- RLS: 관리자만 (기존 admins 테이블 패턴과 동일)
alter table public.video_jobs enable row level security;

drop policy if exists "admin all video_jobs" on public.video_jobs;
create policy "admin all video_jobs" on public.video_jobs for all
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));

-- 워커가 대기 작업 1건을 원자적으로 가져가는 함수.
-- security invoker → 호출자는 관리자 계정으로 로그인한 워커여야 함(RLS 그대로 적용).
-- FOR UPDATE SKIP LOCKED → 두 워커가 동시에 호출해도 같은 작업을 두 번 가져가지 않음.
create or replace function public.claim_video_job(p_worker text)
returns setof public.video_jobs
language plpgsql
security invoker
as $$
declare
  v_id bigint;
begin
  select id into v_id
    from public.video_jobs
   where status = 'pending'
   order by created_at
   limit 1
   for update skip locked;

  if v_id is null then
    return;
  end if;

  return query
  update public.video_jobs
     set status = 'processing',
         claimed_by = p_worker,
         claimed_at = now(),
         progress = '작업 시작'
   where id = v_id
   returning *;
end $$;
