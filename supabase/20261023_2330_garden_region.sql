-- ============================================================
-- 신앙 정원 — 내 지역(날씨) 기본값을 교적 주소에서 · 부부는 서로 이웃 (2026-10-23 담임목사 지시)
--   "교적에 있는 데이터를 사용하여 기본적으로 성도들의 거주 지역을 설정하세요. 교적과 연동되어야 합니다."
--
-- [무엇]
-- · garden_my_region(): 로그인한 사람 '본인'의 교적 주소(member_links → gyojeok.address, 없으면 배우자 줄)에서
--   시·도 / 시·군·구 / 읍·면·동까지만 잘라 본인에게만 돌려준다. 도로명·번지·동호수·이름·연락처는 내보내지 않는다.
-- · 화면(js/garden/region.js)은 이 지역 이름으로 좌표를 찾아 날씨·주간 예보를 그 지역으로 보여 준다.
--   성도가 우편번호 검색으로 고른 지역은 그 기기에만 저장한다(교적은 고치지 않는다 — 교적 주소는 목회 행정에서).
-- · 부부는 서로 이웃(가족): "부부는 이웃이 나오지 않습니다. 수정하세요" — 교적의 배우자 연결(member_links 의 spouse_key ↔ 상대의
--   member_key)로 이어진 두 계정은 신청 없이 이웃으로 보고(방문·방명록·선물), 내 이웃 목록 맨 위에 '가족'으로 나온다. 끊기는 없다
--   (20261023_2100 의 garden_is_neighbor · garden_neighbor_json · garden_neighbor_list_json · garden_neighbor_request 를 고쳐 쓴다
--    — 2100 을 다시 실행하면 이 파일도 다시 실행)
-- [표]   새 표·칸 없음
-- [함수] garden_my_region() · garden_family_ids(uuid)(안쪽) · 위 네 함수 고쳐 쓰기
-- [필요] member_links · gyojeok 이 없으면 'none' 을 돌려줄 뿐 오류는 없다
-- [실행] SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전)
--
-- [되돌리기(롤백)]
--   drop function if exists public.garden_my_region();
--   20261023_2100_garden_visits.sql 의 garden_is_neighbor · garden_neighbor_json · garden_neighbor_list_json · garden_neighbor_request
--   네 함수 정의를 그대로 다시 실행한 뒤 drop function if exists public.garden_family_ids(uuid);
-- ============================================================

begin;

create or replace function public.garden_my_region() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_addr text; w text;
  v_sido text; v_sgg text; v_dong text;
  v_short text[] := array['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  if to_regclass('public.member_links') is null or to_regclass('public.gyojeok') is null then
    return json_build_object('ok', false, 'why', 'none');
  end if;
  -- 본인 줄을 먼저, 없으면 배우자 줄(같은 집)
  execute $q$
    select g.address from public.member_links ml
      join public.gyojeok g on g.member_key = ml.member_key or (coalesce(ml.spouse_key, '') <> '' and g.member_key = ml.spouse_key)
     where ml.user_id = $1 and coalesce(btrim(g.address), '') <> ''
     order by (g.member_key = ml.member_key) desc
     limit 1 $q$ into v_addr using v_uid;
  if v_addr is null then return json_build_object('ok', false, 'why', 'none'); end if;

  -- 앞에서부터 시·도 → 시·군·구(둘일 수 있다: 수원시 팔달구) → 읍·면·동 까지. 도로명(로·길)·숫자가 나오면 멈춘다
  foreach w in array regexp_split_to_array(btrim(regexp_replace(v_addr, '\([^)]*\)|,', ' ', 'g')), '\s+') loop
    exit when w = '' or w ~ '[0-9]' or w ~ '(로|길|번지)$';
    if v_sido is null and v_sgg is null and (w ~ '(특별시|광역시|특별자치시|특별자치도|도)$' or w = any (v_short)) then
      v_sido := w;
    elsif v_dong is null and w ~ '(시|군|구)$' then
      v_sgg := coalesce(v_sgg || ' ', '') || w;
    elsif w ~ '(읍|면|동|가)$' then
      v_dong := w; exit;
    else
      exit;
    end if;
  end loop;
  if v_sido is null and v_sgg is null then return json_build_object('ok', false, 'why', 'parse'); end if;
  return json_build_object('ok', true, 'sido', v_sido, 'sigungu', v_sgg, 'dong', v_dong);
end $$;

revoke all on function public.garden_my_region() from public, anon;
grant execute on function public.garden_my_region() to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 부부는 서로 이웃(가족)
-- ──────────────────────────────────────────────────────────────
-- 내 배우자 계정(교적 배우자 연결이 어느 쪽에 적혀 있어도)
create or replace function public.garden_family_ids(p_uid uuid) returns setof uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null or to_regclass('public.member_links') is null then return; end if;
  return query execute $q$
    select distinct b.user_id from public.member_links a
      join public.member_links b on b.user_id <> a.user_id
     where a.user_id = $1
       and ((coalesce(a.spouse_key, '') <> '' and b.member_key = a.spouse_key)
         or (coalesce(b.spouse_key, '') <> '' and b.spouse_key = a.member_key)) $q$ using p_uid;
end $$;
revoke all on function public.garden_family_ids(uuid) from public, anon, authenticated;

create or replace function public.garden_is_neighbor(p_church uuid, p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.garden_neighbors n where n.church_id = p_church and n.status = 'accepted'
                   and least(n.from_id, n.to_id) = least(p_a, p_b) and greatest(n.from_id, n.to_id) = greatest(p_a, p_b))
      or exists (select 1 from public.garden_family_ids(p_a) as f(uid) where f.uid = p_b)
$$;

create or replace function public.garden_neighbor_json(p_church uuid, p_me uuid, p_other uuid) returns json
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from public.garden_family_ids(p_me) as f(uid) where f.uid = p_other)
    then json_build_object('id', null, 'status', 'neighbor', 'family', true)
    else coalesce((select json_build_object('id', n.id, 'status',
            case when n.status = 'accepted' then 'neighbor'
                 when n.status = 'pending' and n.from_id = p_me then 'sent'
                 when n.status = 'pending' then 'received' else 'none' end)
       from public.garden_neighbors n
      where n.church_id = p_church and least(n.from_id, n.to_id) = least(p_me, p_other) and greatest(n.from_id, n.to_id) = greatest(p_me, p_other)),
      json_build_object('id', null, 'status', 'none')) end
$$;

create or replace function public.garden_neighbor_list_json(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  with fam as (select f.uid from public.garden_family_ids(p_uid) as f(uid)),
  x as (
    select n.id, n.status, n.from_id, n.to_id, n.created_at, case when n.from_id = p_uid then n.to_id else n.from_id end as other, false as family
      from public.garden_neighbors n
     where n.church_id = p_church and (n.from_id = p_uid or n.to_id = p_uid) and n.status in ('pending', 'accepted')
       and not exists (select 1 from fam where fam.uid = case when n.from_id = p_uid then n.to_id else n.from_id end)
    union all
    select null::bigint, 'accepted'::text, p_uid, fam.uid, now(), fam.uid, true from fam
  ), y as (
    select x.*, pl.plot_no, coalesce(nullif(p.nickname, ''), '성도') as nickname, coalesce(p.avatar_key, 'a') as avatar_key, coalesce(p.avatar_url, '') as avatar_url,
           gg.species, gg.plant_name, gg.stage, coalesce(gg.visit_open, false) as open
      from x
      join public.garden_plots pl on pl.church_id = p_church and pl.owner_user_id = x.other
      left join public.garden_profiles p on p.user_id = x.other
      left join public.garden_gardens gg on gg.church_id = p_church and gg.user_id = x.other
     where public.garden_visit_member(p_church, x.other)
  )
  select json_build_object(
    'neighbors', (select coalesce(json_agg(json_build_object('id', y.id, 'plot_no', y.plot_no, 'nickname', y.nickname, 'avatar_key', y.avatar_key, 'avatar_url', y.avatar_url,
                    'species', y.species, 'plant_name', y.plant_name, 'stage', y.stage, 'open', y.open, 'family', y.family) order by y.family desc, y.nickname), '[]'::json) from y where y.status = 'accepted'),
    'incoming', (select coalesce(json_agg(json_build_object('id', y.id, 'plot_no', y.plot_no, 'nickname', y.nickname, 'avatar_key', y.avatar_key, 'avatar_url', y.avatar_url,
                    'species', y.species, 'plant_name', y.plant_name, 'stage', y.stage, 'at', y.created_at) order by y.created_at desc), '[]'::json) from y where y.status = 'pending' and y.to_id = p_uid),
    'outgoing', (select coalesce(json_agg(json_build_object('id', y.id, 'plot_no', y.plot_no, 'nickname', y.nickname, 'avatar_key', y.avatar_key, 'avatar_url', y.avatar_url,
                    'at', y.created_at) order by y.created_at desc), '[]'::json) from y where y.status = 'pending' and y.from_id = p_uid))
$$;
revoke all on function public.garden_is_neighbor(uuid, uuid, uuid), public.garden_neighbor_json(uuid, uuid, uuid), public.garden_neighbor_list_json(uuid, uuid)
  from public, anon, authenticated;

-- 이웃 신청: 배우자에게는 신청 없이 바로 이웃(가족)
create or replace function public.garden_neighbor_request(p_church text, p_plot int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_to uuid; n public.garden_neighbors;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_visit_member(v_church, v_uid) then return json_build_object('ok', false, 'why', 'member'); end if;
  select pl.owner_user_id into v_to from public.garden_plots pl where pl.church_id = v_church and pl.plot_no = p_plot;
  if v_to is null or not public.garden_visit_member(v_church, v_to) then return json_build_object('ok', false, 'why', 'none'); end if;
  if v_to = v_uid then return json_build_object('ok', false, 'why', 'self'); end if;
  if exists (select 1 from public.garden_family_ids(v_uid) as f(uid) where f.uid = v_to) then   -- 부부는 신청 없이 이웃
    return json_build_object('ok', true, 'neighbor', public.garden_neighbor_json(v_church, v_uid, v_to));
  end if;
  select * into n from public.garden_neighbors x
   where x.church_id = v_church and least(x.from_id, x.to_id) = least(v_uid, v_to) and greatest(x.from_id, x.to_id) = greatest(v_uid, v_to) for update;
  if found and n.status = 'pending' and n.to_id = v_uid then
    update public.garden_neighbors set status = 'accepted', responded_at = now() where id = n.id;                      -- 서로 신청 → 이웃
  elsif found and n.status in ('accepted', 'pending') then
    null;                                                                                                              -- 이미 이웃이거나 보낸 신청이 있다
  else
    if (select count(*) from public.garden_neighbors x where x.from_id = v_uid and x.created_at > now() - interval '1 day') >= 30 then
      return json_build_object('ok', false, 'why', 'limit');
    end if;
    if found then
      update public.garden_neighbors set from_id = v_uid, to_id = v_to, status = 'pending', created_at = now(), responded_at = null where id = n.id;
    else
      insert into public.garden_neighbors (church_id, from_id, to_id) values (v_church, v_uid, v_to)
      on conflict (church_id, (least(from_id, to_id)), (greatest(from_id, to_id))) do nothing;
    end if;
  end if;
  return json_build_object('ok', true, 'neighbor', public.garden_neighbor_json(v_church, v_uid, v_to));
end $$;
revoke all on function public.garden_neighbor_request(text, int) from public, anon;
grant execute on function public.garden_neighbor_request(text, int) to authenticated;

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
