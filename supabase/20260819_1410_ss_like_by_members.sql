-- ============================================================
--  운평장로교회 — 주일학교 성장기: 일반 성도도 좋아요를 누를 수 있게
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
--
--  [왜]
--   · 지금까지 좋아요(liked_by)는 교사단만 누를 수 있었다(update 정책이 교사단 전용).
--   · 홈 '주일학교 성장기'를 보는 성도님들도 어린이들을 응원할 수 있게 한다.
--
--  [바뀌는 것]
--   1) liked_uids 칼럼 추가 — 누가 눌렀는지 계정(uid)으로 기록.
--      · 이름만 저장하던 liked_by 는 그대로 두어(표시·개수) 기존 기록이 사라지지 않는다.
--      · 동명이인이 있어도 내 좋아요만 정확히 취소된다.
--   2) ss_toggle_like(인증id) 함수 — 로그인한 성도 누구나 호출 가능.
--      · 누르면 추가, 다시 누르면 취소. 한 사람당 한 번만 반영된다.
--      · 인증 기록의 다른 칼럼(확인·사진 등)은 건드릴 수 없다(정책은 그대로 교사단 전용).
--   3) ss_growth_feed 에 mine(내가 눌렀는지) 추가 — 하트를 채워 보여 주기 위함.
--      · 로그인 안 한 방문자는 mine=false. 좋아요를 누르려면 로그인해야 한다.
--
--  [되돌리기(롤백)]
--   -- drop function if exists public.ss_toggle_like(bigint);
--   -- supabase/sunday_school_growth_v2.sql 을 다시 실행하면 피드가 예전 모양으로 돌아감
--   -- (liked_uids 칼럼은 조회만 중단. 삭제는 4주 후 사람이 직접)
-- ============================================================

alter table public.ss_submissions add column if not exists liked_uids jsonb not null default '[]'::jsonb;

-- 좋아요 토글 — 로그인한 성도 누구나
create or replace function public.ss_toggle_like(p_id bigint)
returns json language plpgsql security definer
set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_names jsonb;
  v_uids  jsonb;
  v_mine  boolean;
  v_drop  bigint;   -- ordinality 는 bigint
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select coalesce(nullif(l.member_name, ''), '성도') into v_name
    from public.member_links l where l.user_id = v_uid;
  if v_name is null then v_name := '성도'; end if;

  select coalesce(s.liked_by, '[]'::jsonb), coalesce(s.liked_uids, '[]'::jsonb)
    into v_names, v_uids
    from public.ss_submissions s where s.id = p_id for update;
  if not found then
    raise exception '인증 기록을 찾을 수 없습니다.';
  end if;

  v_mine := v_uids ? v_uid::text;

  if v_mine then
    -- 취소: 내 uid 를 빼고, 내 이름 '한 개'만 뺀다(같은 이름이 여럿이어도 하나만)
    v_uids := (select coalesce(jsonb_agg(x.value), '[]'::jsonb)
                 from jsonb_array_elements(v_uids) x
                where x.value <> to_jsonb(v_uid::text));
    select min(e.ord) into v_drop
      from jsonb_array_elements(v_names) with ordinality as e(value, ord)
     where e.value = to_jsonb(v_name);
    if v_drop is not null then
      v_names := (select coalesce(jsonb_agg(e.value order by e.ord), '[]'::jsonb)
                    from jsonb_array_elements(v_names) with ordinality as e(value, ord)
                   where e.ord <> v_drop);
    end if;
  else
    v_uids  := v_uids  || to_jsonb(v_uid::text);
    v_names := v_names || to_jsonb(v_name);
  end if;

  update public.ss_submissions
     set liked_by = v_names, liked_uids = v_uids
   where id = p_id;

  return json_build_object('likes', jsonb_array_length(v_names), 'mine', not v_mine);
end $$;
grant execute on function public.ss_toggle_like(bigint) to authenticated;

-- 홈 성장기 피드 — mine(내가 누른 하트) 추가
create or replace function public.ss_growth_feed(p_limit int default 60)
returns json language sql security definer stable
set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'id', t.id, 'name', t.child_name, 'stype', t.stype, 'date', t.sub_date,
           'photo', t.photo_url, 'likes', t.likes, 'confirmed', t.confirmed, 'mine', t.mine)
         order by t.sub_date desc, t.id desc), '[]'::json)
  from (
    select s.id, s.child_name, s.stype, s.sub_date, s.photo_url,
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
