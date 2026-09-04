-- ============================================================
--  주일학교 성장기 — 지난 기록 계속 보기(페이지 넘김)
--  2026-09-04
--
--  [왜]
--   홈 '주일학교 성장기'는 ss_growth_feed() 가 돌려주는 최신 60건만 받아 온다.
--   그래서 '성장 기록 더 보기'를 눌러도 60건까지만 펼쳐지고, 그보다 오래된
--   인증 사진은 화면까지 아예 오지 않았다(2026-09-04 기준 8/29 이전이 안 보임).
--   기록·사진은 모두 그대로 남아 있고, 화면에 불러오는 개수만 막혀 있던 문제다.
--
--  [무엇]
--   ss_growth_feed 에 p_offset(건너뛸 개수)을 추가해, 프론트가 60건씩
--   이어서 받아올 수 있게 한다. 한 번에 받는 최대치(200건)는 그대로 둔다.
--
--  [파괴적 변경 없음]
--   테이블·칼럼은 건드리지 않는다. 함수 하나만 교체한다.
--   인자를 늘리려면 옛 서명(int 1개)을 먼저 지워야 한다. 안 지우고 2인자 판을
--   더하면, 인자 없이 부르는 기존 호출(ss_growth_feed())이 두 함수 모두에
--   해당돼 'function is not unique' 오류가 난다.
--   새 함수도 기본값을 갖고 있어 인자 없는 예전 호출은 그대로 동작한다.
--   (드롭~생성 사이에 함수가 비는 일이 없도록 트랜잭션으로 묶었다)
--
--  [되돌리기(롤백)]
--   supabase/20260830_1420_ss_mission_photo_count.sql 의
--   '4) 홈 성장기 피드' 블록을 다시 실행하면 예전 판(p_limit 만 있는 함수)으로 돌아간다.
--   그 전에 아래를 먼저 실행: drop function if exists public.ss_growth_feed(int, int);
-- ============================================================

begin;

-- 옛 서명 제거(위 주석의 'function is not unique' 방지)
drop function if exists public.ss_growth_feed(int);

create or replace function public.ss_growth_feed(p_limit int default 60, p_offset int default 0)
returns json language sql security definer stable
set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'id', t.id, 'name', t.child_name, 'stype', t.stype, 'date', t.sub_date,
           'photo', t.photo_url, 'photos', t.photo_urls,
           'likes', t.likes, 'confirmed', t.confirmed, 'mine', t.mine)
         order by t.sub_date desc, t.id desc), '[]'::json)
  from (
    select s.id, s.child_name, s.stype, s.sub_date, s.photo_url,
           (select json_agg(p->>'url')
              from jsonb_array_elements(coalesce(s.photos, '[]'::jsonb)) p
             where coalesce(p->>'url', '') <> '') as photo_urls,
           coalesce(jsonb_array_length(s.liked_by), 0) as likes,
           (s.confirmed_by is not null) as confirmed,
           (auth.uid() is not null and coalesce(s.liked_uids, '[]'::jsonb) ? auth.uid()::text) as mine
    from public.ss_submissions s
    where coalesce(s.photo_url, '') <> ''
    order by s.sub_date desc, s.id desc
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
    offset greatest(coalesce(p_offset, 0), 0)
  ) t
$$;

grant execute on function public.ss_growth_feed(int, int) to anon, authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';

commit;
