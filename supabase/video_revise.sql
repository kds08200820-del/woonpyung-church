-- ============================================================
--  영상 수정(재제작) 지원 (2026-07, 1회 실행)
--  Supabase → SQL Editor 에 붙여넣고 Run.
--
--  · 완성된 영상(done)을 스튜디오에서 "수정 반영 — 재제작"하면
--    상태가 revise 로 바뀌고, 워커가 pending 과 동일하게 가져가
--    선택 장면 클립만 다시 만들어 재조립합니다.
--  · claim_video_job() 이 pending 외에 revise 도 가져가도록 교체.
--
--  되돌리기: 이 파일 실행 전의 함수 본문은 supabase/video_jobs.sql 참고.
-- ============================================================

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
   where status in ('pending', 'revise')
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
