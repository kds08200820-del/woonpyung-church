-- ============================================================
--  AI 작업 큐 (2026-08, 1회 실행)
--  Supabase → SQL Editor 에 붙여넣고 Run.
--
--  · 지금까지 '운평 말씀지기'(index.html)와 목회행정의 AI 기능은
--    Edge Function 이 구글 Gemini API 를 부르는 방식이었습니다.
--    구글 프로젝트의 사용 한도(spend cap)가 걸리면서 전부 멈췄습니다.
--  · 이제부터는 교회 컴퓨터(24시간 켜짐)에서 도는 워커
--    tools/ai_worker.py 가 **Claude Code CLI** 로 답을 만들어 돌려줍니다.
--    → 외부 API 키·요금이 필요 없습니다(이미 쓰는 Claude 구독 그대로).
--
--  흐름:
--    브라우저 --ai_enqueue()--> ai_jobs(pending)
--                                   ↑ claim_ai_job()  교회 PC 워커
--    브라우저 <--- 폴링 --- ai_jobs(done, result)
--
--  worship_jobs / video_jobs 와 같은 구조입니다.
--  FOR UPDATE SKIP LOCKED 로 워커를 여러 개 띄워도 한 작업은 한 번만 처리됩니다.
--
--  되돌리기(참고용 — CLAUDE.md 삭제 정책에 따라 실제로는 RENAME 권장):
--    alter table public.ai_jobs rename to ai_jobs_archived;
--    drop function if exists public.ai_enqueue(text, jsonb);
--    drop function if exists public.claim_ai_job(text);
-- ============================================================

create table if not exists public.ai_jobs (
  id           bigint generated always as identity primary key,
  kind         text not null,                       -- counsel | prayer | headline | review
  payload      jsonb not null default '{}'::jsonb,  -- 질문·설교원고 등 입력값
  status       text not null default 'pending',     -- pending | processing | done | error
  requested_by uuid not null default auth.uid(),    -- 질문한 사람(교인/관리자)
  claimed_by   text,                                -- 가져간 워커 이름 (church-pc 등)
  claimed_at   timestamptz,
  result       text,                                -- AI 답변 본문
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.ai_jobs is
  '말씀지기·목회행정 AI 작업 큐 — 브라우저 → 교회 PC 워커(Claude Code CLI)';
comment on column public.ai_jobs.kind is
  'counsel(교인 말씀지기) / prayer(마침 기도문) / headline(표지 말씀) / review(주보 검수)';

-- 워커가 대기 작업을 찾는 경로
create index if not exists ai_jobs_pending_idx
  on public.ai_jobs (created_at)
  where status in ('pending', 'processing');

-- 브라우저가 자기 작업을 폴링하는 경로
create index if not exists ai_jobs_owner_idx
  on public.ai_jobs (requested_by, created_at desc);

-- updated_at 자동 갱신
create or replace function public.ai_jobs_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_ai_jobs_touch on public.ai_jobs;
create trigger trg_ai_jobs_touch before update on public.ai_jobs
for each row execute function public.ai_jobs_touch();

-- ── 권한 ────────────────────────────────────────────────────
-- 읽기는 '내 작업'만. 쓰기는 아래 ai_enqueue() 함수로만 가능하게 막는다.
alter table public.ai_jobs enable row level security;

drop policy if exists "own ai_jobs" on public.ai_jobs;
create policy "own ai_jobs" on public.ai_jobs for select
  using (requested_by = auth.uid());

revoke insert, update, delete on public.ai_jobs from anon, authenticated;
grant select on public.ai_jobs to authenticated;

-- ── 작업 등록 (브라우저가 부르는 유일한 쓰기 통로) ──────────
--  · 로그인 확인, 관리자 확인, 1인 1일 한도, 동시 요청 제한을 여기서 모두 처리.
--  · 한도 초과 등은 예외가 아니라 { ok:false, error:'...' } 로 돌려준다
--    (화면에서 그대로 보여 주기 위함).
create or replace function public.ai_enqueue(p_kind text, p_payload jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_limit  int  := 20;          -- 교인 1인 1일 질문 한도(말씀지기)
  v_used   int;
  v_active int;
  v_id     bigint;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'code', 'login_required',
                             'error', '로그인이 필요합니다.');
  end if;

  if p_kind not in ('counsel', 'prayer', 'headline', 'review') then
    return json_build_object('ok', false, 'error', '알 수 없는 요청입니다.');
  end if;

  -- 목회행정 기능(기도문·헤드라인·주보 검수)은 관리자 전용
  if p_kind <> 'counsel'
     and not exists (select 1 from public.admins a where a.uid = v_uid) then
    return json_build_object('ok', false, 'error', '관리자만 이용할 수 있습니다.');
  end if;

  -- 앞선 질문이 아직 처리 중이면 새 작업을 쌓지 않는다(큐 폭주 방지).
  -- 3분이 지난 것은 멈춘 작업으로 보고 세지 않는다 — 영영 막히지 않도록.
  select count(*) into v_active
    from public.ai_jobs
   where requested_by = v_uid
     and status in ('pending', 'processing')
     and created_at > now() - interval '3 minutes';
  if v_active >= 2 then
    return json_build_object('ok', false,
      'error', '앞선 질문에 답하는 중입니다. 잠시만 기다렸다가 다시 눌러 주세요.');
  end if;

  -- 교인용 말씀지기만 1인 1일 한도(기존 counsel_usage 테이블 재사용)
  if p_kind = 'counsel' then
    select cu.count into v_used
      from public.counsel_usage cu
     where cu.user_id = v_uid and cu.day = current_date;
    v_used := coalesce(v_used, 0);

    if v_used >= v_limit then
      return json_build_object('ok', false, 'limited', true,
        'error', format('오늘은 질문을 %s번까지 나눌 수 있어요. 충분히 묵상하시고 내일 다시 이어가요. 🙂', v_limit));
    end if;

    insert into public.counsel_usage(user_id, day, count)
    values (v_uid, current_date, 1)
    on conflict (user_id, day)
    do update set count = public.counsel_usage.count + 1;
  end if;

  insert into public.ai_jobs (kind, payload, requested_by)
  values (p_kind, coalesce(p_payload, '{}'::jsonb), v_uid)
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function public.ai_enqueue(text, jsonb) from public, anon;
grant execute on function public.ai_enqueue(text, jsonb) to authenticated;

-- ── 워커가 작업 1건을 원자적으로 가져간다 ───────────────────
--  security definer + service_role 에게만 실행 권한.
--  (교인 계정으로는 절대 호출할 수 없어야 한다 — 남의 질문을 볼 수 있으므로)
--  15분 넘게 processing 인 작업은 워커가 죽은 것으로 보고 다시 가져간다.
create or replace function public.claim_ai_job(p_worker text)
returns setof public.ai_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  select id into v_id
    from public.ai_jobs
   where status = 'pending'
      or (status = 'processing' and claimed_at < now() - interval '15 minutes')
   order by created_at
   limit 1
   for update skip locked;

  if v_id is null then
    return;
  end if;

  return query
  update public.ai_jobs
     set status = 'processing',
         claimed_by = p_worker,
         claimed_at = now()
   where id = v_id
   returning *;
end $$;

revoke all on function public.claim_ai_job(text) from public, anon, authenticated;
grant execute on function public.claim_ai_job(text) to service_role;

-- 새로 만든 함수를 REST API 가 바로 인식하도록 스키마 캐시를 새로 고친다.
-- (없어도 대개 자동 반영되지만, 간혹 404 가 나는 것을 막아 준다)
notify pgrst, 'reload schema';

-- ── 오래된 이력 정리(선택) ──────────────────────────────────
-- 질문 기록이 계속 쌓입니다. 필요할 때 사람이 직접 아래를 실행하세요.
-- (자동 삭제는 넣지 않았습니다 — CLAUDE.md 삭제 정책)
--
--   delete from public.ai_jobs
--    where status in ('done','error') and created_at < now() - interval '90 days';
