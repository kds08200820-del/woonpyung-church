-- ============================================================
--  카카오톡 QT 예약 발송 (2026-09-21)
--
--  설교 매니저의 "⏰ 예약 발송" 버튼이 여기에 작업을 넣고,
--  집/교회 PC 워커(tools/kakao_worker.py)가 예약 시각에 가져가
--  카카오톡 PC 창을 조작해 단톡방으로 보냅니다.
--
--  · 카카오 공식 메시지 API 로는 단톡방에 보낼 수 없어(나에게/친구 1:1만 지원)
--    PC 워커 방식을 씁니다. 자세한 내용은 docs/카카오QT-자동발송-안내.md 참고.
--  · video_jobs / worship_jobs 와 같은 큐 구조이며,
--    claim_kakao_job() 이 FOR UPDATE SKIP LOCKED 로 중복 발송을 막습니다.
--  · 보낼 본문(message)은 예약할 때의 내용을 그대로 저장합니다.
--    나중에 원고를 고쳐도 예약된 내용은 바뀌지 않습니다(예측 가능하게).
--
--  되돌리기 (CLAUDE.md 삭제 정책 — DROP 대신 RENAME):
--    alter table public.kakao_send_jobs rename to kakao_send_jobs_archived;
--    alter table public.kakao_channels  rename to kakao_channels_archived;
--    drop function if exists public.claim_kakao_job(text);
-- ============================================================

-- ── 발송 채널(단톡방) 목록 ─────────────────────────────────
--  방 이름은 운영 정보라 이 파일에 넣지 않습니다.
--  홈페이지 예약 발송 창의 "채널 관리"에서 직접 추가하세요.
--  room_name 은 카카오톡에 보이는 방 이름과 정확히 같아야 합니다
--  (다르면 워커가 발송하지 않고 멈춥니다 — 오발송 방지).
create table if not exists public.kakao_channels (
  id         bigint generated always as identity primary key,
  room_name  text not null unique,
  label      text,                                  -- 화면 표시용 (비우면 room_name)
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.kakao_channels is '카카오톡 예약 발송 대상 단톡방 목록';
comment on column public.kakao_channels.room_name is '카카오톡 PC에 보이는 방 이름 (정확히 일치해야 발송)';

-- ── 예약 발송 큐 ───────────────────────────────────────────
create table if not exists public.kakao_send_jobs (
  id           bigint generated always as identity primary key,
  sermon_date  date,                                -- 어떤 날짜의 QT인지 (조회·표시용)
  channel_id   bigint references public.kakao_channels(id) on delete set null,
  room_name    text not null,                       -- 예약 당시 방 이름 스냅샷
  message      text not null,                       -- 보낼 본문 (카카오톡 복사와 같은 양식)
  scheduled_at timestamptz not null,                -- 이 시각 이후에 발송
  status       text not null default 'pending',     -- pending|processing|sent|error|canceled
  requested_by uuid default auth.uid(),
  claimed_by   text,                                -- 가져간 워커 (home-pc / church-pc)
  claimed_at   timestamptz,
  sent_at      timestamptz,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint kakao_send_jobs_status_chk
    check (status in ('pending', 'processing', 'sent', 'error', 'canceled'))
);

comment on table public.kakao_send_jobs is '카카오톡 QT 예약 발송 큐 — 설교 매니저 버튼 → PC 워커';

-- 워커가 "지금 보낼 것"을 찾는 조회에 맞춘 인덱스
create index if not exists kakao_send_jobs_due_idx
  on public.kakao_send_jobs (scheduled_at)
  where status = 'pending';

create index if not exists kakao_send_jobs_date_idx
  on public.kakao_send_jobs (sermon_date, created_at desc);

-- updated_at 자동 갱신 (video_jobs 와 같은 방식)
create or replace function public.kakao_send_jobs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_kakao_send_jobs_touch on public.kakao_send_jobs;
create trigger trg_kakao_send_jobs_touch before update on public.kakao_send_jobs
for each row execute function public.kakao_send_jobs_touch();

-- ── RLS: 관리자만 (기존 admins 테이블 패턴과 동일) ─────────
alter table public.kakao_channels  enable row level security;
alter table public.kakao_send_jobs enable row level security;

drop policy if exists "admin all kakao_channels" on public.kakao_channels;
create policy "admin all kakao_channels" on public.kakao_channels for all
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));

drop policy if exists "admin all kakao_send_jobs" on public.kakao_send_jobs;
create policy "admin all kakao_send_jobs" on public.kakao_send_jobs for all
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));

-- ── 워커가 예약 시각이 된 작업 1건을 원자적으로 가져간다 ───
--  status='pending' 이고 scheduled_at 이 이미 지난 것만 대상.
--  FOR UPDATE SKIP LOCKED → 집·교회 PC 두 워커가 동시에 돌아도 한 번만 보낸다.
create or replace function public.claim_kakao_job(p_worker text)
returns setof public.kakao_send_jobs
language plpgsql
security invoker
as $$
declare
  v_id bigint;
begin
  select id into v_id
    from public.kakao_send_jobs
   where status = 'pending'
     and scheduled_at <= now()
   order by scheduled_at
   limit 1
   for update skip locked;

  if v_id is null then
    return;
  end if;

  return query
  update public.kakao_send_jobs
     set status = 'processing',
         claimed_by = p_worker,
         claimed_at = now()
   where id = v_id
  returning *;
end $$;

comment on function public.claim_kakao_job(text) is
  '예약 시각이 지난 카카오톡 발송 작업 1건을 원자적으로 가져간다 (중복 발송 방지)';
