-- ============================================================
--  카카오톡 예약 발송 — 댓글 하트 달기 (2026-09-23)
--
--  예약할 때 "💗 댓글에 하트 달기"를 체크하면, 글을 보낸 뒤 정해진 시간(분)이
--  지났을 때 PC 워커(tools/kakao_worker.py → kakao_heart.py)가 그 방을 다시 열어
--  "글 보낸 시각 ~ +N분" 사이에 달린 댓글에 하트(공감)를 누릅니다.
--
--  · 비파괴 변경만 있습니다 (nullable 칼럼 추가 + 함수 추가).
--  · heart_minutes 가 null 이면 하트를 달지 않습니다 (기존 예약은 그대로).
--  · 선행: 20260921_2345_kakao_send_jobs.sql
--
--  되돌리기 (CLAUDE.md 삭제 정책 — DROP 대신 RENAME):
--    alter table public.kakao_send_jobs rename column heart_minutes to heart_minutes_archived;
--    alter table public.kakao_send_jobs rename column heart_status  to heart_status_archived;
--    alter table public.kakao_send_jobs rename column heart_count   to heart_count_archived;
--    alter table public.kakao_send_jobs rename column heart_error   to heart_error_archived;
--    alter table public.kakao_send_jobs rename column heart_done_at to heart_done_at_archived;
--    drop function if exists public.claim_kakao_heart_job(text);
-- ============================================================

alter table public.kakao_send_jobs
  add column if not exists heart_minutes int,          -- null = 하트 안 함, 1~180 = 글 보낸 뒤 몇 분까지의 댓글
  add column if not exists heart_status  text,         -- null | pending | processing | done | error
  add column if not exists heart_count   int,          -- 하트를 누른 댓글 수
  add column if not exists heart_error   text,
  add column if not exists heart_done_at timestamptz;

-- 다시 실행해도 안전하도록, 없을 때만 추가 (DROP 없이)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'kakao_send_jobs_heart_chk') then
    alter table public.kakao_send_jobs
      add constraint kakao_send_jobs_heart_chk check (
        (heart_minutes is null or heart_minutes between 1 and 180)
        and (heart_status is null or heart_status in ('pending', 'processing', 'done', 'error'))
      );
  end if;
end $$;

comment on column public.kakao_send_jobs.heart_minutes is '글 보낸 뒤 이 분(分) 안에 달린 댓글에 하트 (null=안 함)';
comment on column public.kakao_send_jobs.heart_status  is '하트 작업 상태: pending|processing|done|error';

-- 하트 차례가 된 작업을 찾는 조회용
create index if not exists kakao_send_jobs_heart_due_idx
  on public.kakao_send_jobs (sent_at)
  where heart_status = 'pending';

-- ── 워커가 하트 차례가 된 작업 1건을 원자적으로 가져간다 ───
--  발송이 끝났고(status='sent') 보낸 뒤 heart_minutes 분이 지난 것만.
--  FOR UPDATE SKIP LOCKED → 두 PC 워커가 동시에 돌아도 한 번만 처리한다.
create or replace function public.claim_kakao_heart_job(p_worker text)
returns setof public.kakao_send_jobs
language plpgsql
security invoker
as $$
declare
  v_id bigint;
begin
  select id into v_id
    from public.kakao_send_jobs
   where status = 'sent'
     and heart_status = 'pending'
     and heart_minutes is not null
     and sent_at is not null
     and sent_at + make_interval(mins => heart_minutes) <= now()
   order by sent_at
   limit 1
   for update skip locked;

  if v_id is null then
    return;
  end if;

  return query
  update public.kakao_send_jobs
     set heart_status = 'processing'
   where id = v_id
  returning *;
end $$;

comment on function public.claim_kakao_heart_job(text) is
  '댓글 하트 차례가 된 카카오톡 예약 작업 1건을 원자적으로 가져간다';
