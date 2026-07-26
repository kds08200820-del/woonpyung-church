-- ============================================================
--  주일 자료 일괄 생성 작업 큐 (2026-07, 1회 실행)
--  Supabase → SQL Editor 에 붙여넣고 Run.
--
--  · 설교 매니저의 "📦 주일 자료 일괄 생성" 버튼이 이 테이블에 작업을 넣고,
--    집/교회 PC의 워커(tools/worship_worker.py)가 작업을 가져가
--    Claude Code CLI 로 예배 자료를 만들어 업로드합니다.
--  · 산출물: 방송실 PPT·큐시트 / 중등부 교재·교사용 / 주보·예배순서 / 설교 요약
--  · video_jobs 와 동일한 구조입니다. 두 PC가 동시에 돌아도
--    claim_worship_job() 이 FOR UPDATE SKIP LOCKED 로
--    한 작업을 한 워커만 가져가도록 보장합니다.
--
--  되돌리기(참고용 — CLAUDE.md 삭제 정책에 따라 실제로는 RENAME 권장):
--    alter table public.worship_jobs rename to worship_jobs_archived;
--    drop function if exists public.claim_worship_job(text);
-- ============================================================

create table if not exists public.worship_jobs (
  id           bigint generated always as identity primary key,
  sermon_date  date not null,                       -- 어느 주일 설교로 자료를 만들지
  job_type     text not null default 'weekly',      -- weekly(전체) / 개별 산출물 확장용
  outputs      text[] not null                      -- 이번 작업에서 만들 산출물
                 default array['ppt','cuesheet','youth','teacher','bulletin','summary'],
  status       text not null default 'pending',     -- pending | processing | done | error
  requested_by uuid default auth.uid(),             -- 버튼을 누른 관리자
  claimed_by   text,                                -- 작업을 가져간 워커 이름 (home-pc / church-pc)
  claimed_at   timestamptz,
  progress     text,                                -- 진행 단계 표시 ("3/6 중등부 교재 생성 중" 등)
  result       jsonb,                               -- 생성 결과 [{kind,title,path,resource_id}]
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.worship_jobs is '주일 예배 자료 일괄 생성 작업 큐 — 설교 매니저 버튼 → PC 워커(Claude Code CLI)';
comment on column public.worship_jobs.outputs is 'ppt·cuesheet·youth·teacher·bulletin·summary 중 이번에 만들 것';
comment on column public.worship_jobs.result  is '생성된 산출물 목록. 자료실 업로드분은 resource_id 포함';

-- 같은 주일 작업이 중복으로 쌓이지 않도록 — 대기·진행 중인 건은 날짜당 하나만.
-- (완료·실패 건은 이력으로 남으므로 제외한다)
create unique index if not exists worship_jobs_active_uniq
  on public.worship_jobs (sermon_date)
  where status in ('pending', 'processing');

-- updated_at 자동 갱신
create or replace function public.worship_jobs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_worship_jobs_touch on public.worship_jobs;
create trigger trg_worship_jobs_touch before update on public.worship_jobs
for each row execute function public.worship_jobs_touch();

-- RLS: 관리자만 (기존 admins 테이블 패턴과 동일)
alter table public.worship_jobs enable row level security;

drop policy if exists "admin all worship_jobs" on public.worship_jobs;
create policy "admin all worship_jobs" on public.worship_jobs for all
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));

-- 워커가 대기 작업 1건을 원자적으로 가져가는 함수.
-- security invoker → 호출자는 관리자 계정으로 로그인한 워커여야 함(RLS 그대로 적용).
-- FOR UPDATE SKIP LOCKED → 두 워커가 동시에 호출해도 같은 작업을 두 번 가져가지 않음.
create or replace function public.claim_worship_job(p_worker text)
returns setof public.worship_jobs
language plpgsql
security invoker
as $$
declare
  v_id bigint;
begin
  select id into v_id
    from public.worship_jobs
   where status = 'pending'
   order by created_at
   limit 1
   for update skip locked;

  if v_id is null then
    return;
  end if;

  return query
  update public.worship_jobs
     set status = 'processing',
         claimed_by = p_worker,
         claimed_at = now(),
         progress = '작업 시작'
   where id = v_id
   returning *;
end $$;
