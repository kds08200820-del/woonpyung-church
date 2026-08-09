-- ============================================================
--  운평장로교회 — 주일학교 성장기 v2: 홈 전용 섹션으로 분리
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (1회, 여러 번 실행해도 안전)
--
--  [변경 이유]
--   · 성장기를 우리들 소식(앨범)에 섞지 않고, 홈 화면의 '주일학교 성장기'
--     전용 섹션이 인증 기록(ss_submissions)을 직접 보여주도록 변경.
--   · 따라서 v1의 '앨범 자동 게시' 트리거는 제거(게시물 원본은 인증 기록 하나로 유지).
--
--  [만드는 것]
--   · ss_growth_feed(p_limit) — 홈 섹션용 공개 피드 RPC.
--     이름·종류·날짜·사진·❤수·확인여부만 반환(연락처 등 개인정보 없음), anon 호출 가능.
--
--  [되돌리기(롤백)]
--   -- drop function if exists public.ss_growth_feed(int);
--   -- v1 앨범 게시로 복귀: supabase/sunday_school_growth.sql 재실행
-- ============================================================

-- 1) v1 앨범 자동 게시 중단 (성장기는 전용 섹션에서 표시)
drop trigger if exists ss_submissions_publish_album on public.ss_submissions;
drop trigger if exists ss_submissions_unpublish_album on public.ss_submissions;
drop function if exists public.ss_submission_publish_album();
drop function if exists public.ss_submission_unpublish_album();
-- ※ 앨범 카테고리 '주일학교 성장기'는 남겨둠(교사가 행사 사진 등을 수동 게시할 때 사용 가능).
--    필요 없으면 관리자 화면(카테고리 관리)에서 직접 삭제하세요.

-- 2) 홈 '주일학교 성장기' 섹션용 공개 피드
create or replace function public.ss_growth_feed(p_limit int default 60)
returns json language sql security definer stable
set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'id', t.id, 'name', t.child_name, 'stype', t.stype, 'date', t.sub_date,
           'photo', t.photo_url, 'likes', t.likes, 'confirmed', t.confirmed)
         order by t.sub_date desc, t.id desc), '[]'::json)
  from (
    select s.id, s.child_name, s.stype, s.sub_date, s.photo_url,
           coalesce(jsonb_array_length(s.liked_by), 0) as likes,
           (s.confirmed_by is not null) as confirmed
    from public.ss_submissions s
    where coalesce(s.photo_url, '') <> ''
    order by s.sub_date desc, s.id desc
    limit least(coalesce(p_limit, 60), 200)
  ) t
$$;
grant execute on function public.ss_growth_feed(int) to anon, authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
