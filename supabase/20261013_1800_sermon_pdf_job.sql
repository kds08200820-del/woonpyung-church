-- ============================================================
--  설교 PDF 작업 종류 추가 (2026-10-13) — Supabase → SQL Editor 에서 1회 실행
--
--  설교 매니저 '내보내기' → sermon-print.html → [Google Drive 에 저장] 이
--  ai_jobs 큐에 kind = 'sermon_pdf' 작업을 넣는다. 교회 PC 워커(tools/ai_worker.py)가
--  편집 화면과 똑같은 독립 HTML 을 Edge 로 PDF 로 찍어 Apps Script 로 Drive 폴더에 저장한다.
--  (Google 문서 변환 방식(exportSermonPdf)은 글꼴·쪽이 화면과 달라 이 방식으로 바꿈)
--
--  바뀌는 것: ai_enqueue() 가 받는 작업 종류에 'sermon_pdf' 추가(관리자 전용). 표·정책 변경 없음.
--  payload 가 설교 한 편의 HTML(수십~수백 KB)이라 jsonb 에 그대로 실린다.
--
--  되돌리기: supabase/ai_jobs.sql 의 ai_enqueue 정의를 다시 실행하면 된다
--           (허용 목록에서 'sermon_pdf' 만 빠진다).
-- ============================================================

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

  if p_kind not in ('counsel', 'prayer', 'headline', 'review', 'sermon_pdf') then
    return json_build_object('ok', false, 'error', '알 수 없는 요청입니다.');
  end if;

  -- 목회행정 기능(기도문·헤드라인·주보 검수·설교 PDF)은 관리자 전용
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

comment on column public.ai_jobs.kind is
  'counsel(교인 말씀지기) / prayer(마침 기도문) / headline(표지 말씀) / review(주보 검수) / sermon_pdf(설교 PDF → Drive)';
