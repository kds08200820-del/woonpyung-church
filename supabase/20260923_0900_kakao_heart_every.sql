-- ============================================================
--  카카오톡 예약 발송 — 댓글 하트를 N분마다 확인 (2026-09-23)
--
--  "글 보낸 뒤 30분 동안 달린 댓글에, 10분마다 확인해서 하트"
--    → 10분·20분·30분에 한 번씩 그때까지 달린 댓글 중 하트 없는 것에 누른다.
--  (이미 누른 댓글은 건너뛰므로 여러 번 확인해도 하트가 꺼지지 않는다)
--
--  · 비파괴 변경만 있습니다 (nullable/DEFAULT 칼럼 추가 + 함수 교체).
--  · heart_every 가 null 이면 끝날 때 한 번만 (기존 동작).
--  · 선행: 20260923_0800_kakao_heart.sql
--
--  되돌리기 (CLAUDE.md 삭제 정책 — DROP 대신 RENAME):
--    alter table public.kakao_send_jobs rename column heart_every  to heart_every_archived;
--    alter table public.kakao_send_jobs rename column heart_passes to heart_passes_archived;
--    그리고 20260923_0800_kakao_heart.sql 의 claim_kakao_heart_job 정의를 다시 실행
-- ============================================================

alter table public.kakao_send_jobs
  add column if not exists heart_every  int,                     -- 몇 분마다 확인 (null = 끝날 때 한 번)
  add column if not exists heart_passes int not null default 0;  -- 지금까지 몇 번 확인했는지

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'kakao_send_jobs_heart_every_chk') then
    alter table public.kakao_send_jobs
      add constraint kakao_send_jobs_heart_every_chk
      check (heart_every is null or heart_every between 1 and 180);
  end if;
end $$;

comment on column public.kakao_send_jobs.heart_every  is '댓글 하트를 몇 분마다 확인할지 (null = heart_minutes 가 끝날 때 한 번)';
comment on column public.kakao_send_jobs.heart_passes is '댓글 하트 확인을 지금까지 몇 번 했는지';

-- ── 다음 확인 차례가 된 하트 작업 1건 ────────────────────
--  k번째(1부터) 확인 시각 = sent_at + least(heart_every × k, heart_minutes) 분
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
     and sent_at + make_interval(mins => least(
           coalesce(heart_every, heart_minutes) * (coalesce(heart_passes, 0) + 1),
           heart_minutes)) <= now()
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
  '댓글 하트 확인 차례(N분마다 포함)가 된 카카오톡 예약 작업 1건을 원자적으로 가져간다';
