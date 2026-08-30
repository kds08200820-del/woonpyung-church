-- ============================================================
--  운평장로교회 — 주일학교 미션 '인증 사진 개수' 설정 (2026-08-30)
--  Supabase ▸ SQL Editor 에 통째로 붙여넣고 Run (여러 번 실행해도 안전)
--
--  [무엇인가]
--   · 미션을 정할 때 인증샷을 몇 장 올려야 하는지 정할 수 있다.
--     (예: "책상 치우기 — 치우기 전·후 사진 2장")
--   · 어린이는 사진을 그 개수만큼 한 번에 골라 올리고, 한 건의 인증으로 기록된다.
--   · 홈 '주일학교 성장기'와 대시보드 목록에 사진이 모두 표시된다.
--
--  [만드는 것]
--   1) ss_missions.photo_count   : 인증 사진 개수 (기본 1장)
--   2) ss_submissions.photos     : 인증샷 배열 [{url, key}, …]
--                                  (사진이 2장 이상일 때만 채움. photo_url/photo_key 는
--                                   기존과 같이 '첫 번째 사진'을 담아 옛 화면과 호환)
--   3) ss_current_mission()      : photo_count 포함하도록 교체
--   4) ss_growth_feed()          : photos(사진 URL 배열) 포함하도록 교체
--
--  [주의] 이 파일보다 오래된 미션 SQL(20260823_1500_ss_weekly_mission.sql,
--         20260819_1410_ss_like_by_members.sql)을 나중에 다시 실행하면
--         함수가 photo_count/photos 없는 예전 판으로 돌아간다. 그때는 이 파일을 재실행.
--
--  [되돌리기(롤백) — 삭제 정책에 따라 DROP 대신 조회 중단]
--   -- 함수 원복: supabase/20260823_1500_ss_weekly_mission.sql 의 ss_current_mission,
--   --            supabase/20260819_1410_ss_like_by_members.sql 의 ss_growth_feed 를 다시 실행.
--   -- 칼럼(photo_count, photos)은 프론트에서 조회만 중단, RENAME/삭제는 4주 후 사람이 직접.
-- ============================================================

-- ── 1) 미션에 '인증 사진 개수' ──
alter table public.ss_missions
  add column if not exists photo_count integer not null default 1;

-- ── 2) 인증에 사진 배열(2장 이상일 때 사용) ──
alter table public.ss_submissions
  add column if not exists photos jsonb;

-- ── 3) 이번 주 미션 조회 — photo_count 포함 ──
create or replace function public.ss_current_mission()
returns json language sql security definer stable
set search_path = public as $$
  select json_build_object(
           'id', m.id, 'week_start', m.week_start, 'title', m.title,
           'description', m.description, 'amount', m.amount,
           'photo_count', coalesce(m.photo_count, 1))
  from public.ss_missions m
  where m.week_start = public.ss_week_start()
  limit 1
$$;
grant execute on function public.ss_current_mission() to anon, authenticated;

-- ── 4) 홈 성장기 피드 — photos(사진 URL 배열) 포함 ──
create or replace function public.ss_growth_feed(p_limit int default 60)
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
    limit least(coalesce(p_limit, 60), 200)
  ) t
$$;
grant execute on function public.ss_growth_feed(int) to anon, authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
