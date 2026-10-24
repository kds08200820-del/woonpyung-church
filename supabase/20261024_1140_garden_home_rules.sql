-- ============================================================
--  신앙 정원 — 집 짓기 규칙 바꿈: 작은 집 최소 대지 4칸 · 건축비는 대지 한 칸에 1,000 달란트 (2026-10-24 담임목사 지시)
--   "집은 작은 집이 최소 대지 4칸이 있어야 합니다. 그리고 건축비는 대지 한 칸당 1000달란트 입니다."
--
--  [무엇]
--   · 집 세 채의 대지 칸 수: 작은 집 4칸(2×2) · 한옥 6칸(3×2, 가로·세로 어느 쪽이든) · 큰 집 9칸(3×3)
--   · 건축비(예전 '품삯' 자리) = 대지 칸 수 × 칸당 건축비(기본 1,000 달란트): 작은 집 4,000 · 한옥 6,000 · 큰 집 9,000
--     칸당 건축비는 교회 설정 settings.home_cell_fee 로 바꾼다(없으면 1,000)
--   · 목재는 그대로(200 · 600 · 1,500) — 건축용 나무를 길러 모으는 미션은 그대로 산다
--   · 건축비는 집을 짓는 순간 달란트에서 빠지고, 그 값은 지은 집 기록(garden_homes.wage)과 자산(목재 + 건축비)에 남는다
--   · 운영에는 아직 지은 집이 없다(2026-10-24 확인: garden_homes 0행) — 이미 지은 집은 지을 때의 값을 그대로 간직한다
--  [함수] 다시: garden_home_plans(세 채·칸 수·목재·건축비를 한곳에서) · garden_build_json(0010 의 것과 같고 houses 를 garden_home_plans 로)
--         garden_home_build 는 고치지 않는다 — 0200 의 것이 garden_home_plans 의 wage 를 그대로 읽는다
--  [표] 바꾸는 것 없음. 장부 이름표(home_build)의 글만 '집 짓기(건축비)' 로
--  [실행] 20261024_0200_garden_build.sql 뒤에. SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전)
--         ※ 0010 을 다시 실행하면 garden_build_json 이 예전(settings.houses 직접)으로, 0200 을 다시 실행하면 garden_home_plans 가
--           예전 값(1·2·4칸)으로 돌아간다 → 그 뒤에는 이 파일도 다시 실행
--
--  [되돌리기(롤백)] — 지우는 것 없음
--    garden_home_plans 는 20261024_0200_garden_build.sql 의 2) 절, garden_build_json 은 20261024_0010_garden_economy_build.sql 의 3) 절을 다시 실행
--    update public.garden_rules set label = '{"ko":"집 짓기(품삯)","en":"House built"}'::jsonb where church_id is null and kind = 'home_build';
--    교회 설정 home_cell_fee 는 그대로 두어도 쓰이지 않는다
-- ============================================================

begin;

-- 집 세 채: settings.houses 가 있으면 그것(칸 수·목재, wage 가 있으면 그대로), 없으면 기본(4·6·9칸).
-- 건축비 wage = 칸 수 × 칸당 건축비(settings.home_cell_fee, 기본 1,000) — settings.houses 에 wage 를 직접 적으면 그 값이 이긴다
create or replace function public.garden_home_plans(p_church uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (select coalesce((x.settings->>'home_cell_fee')::numeric, 1000) as fee, x.settings->'houses' as houses
               from public.garden_churches x where x.id = p_church),
       base as (select e as plan, t.n as n
                  from c, jsonb_array_elements(coalesce(c.houses,
                    '[{"key":"small","dae":4,"wood":200},{"key":"hanok","dae":6,"wood":600},{"key":"big","dae":9,"wood":1500}]'::jsonb)) with ordinality as t(e, n))
  select coalesce(jsonb_agg(base.plan || jsonb_build_object('cell_fee', c.fee,
           'wage', coalesce(base.plan->'wage', to_jsonb(round(coalesce((base.plan->>'dae')::numeric, 1) * c.fee, 1)))) order by base.n), '[]'::jsonb)
    from base, c
$$;

-- 건축 미션 자료 — 0010 과 같고 'houses' 만 garden_home_plans 로(미션이 건재상과 같은 칸 수·건축비를 읽게)
create or replace function public.garden_build_json(p_church uuid, p_uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare a json; v_th numeric; v_houses jsonb; v_tz text; v_dae int; v_wood int; v_trees int; v_coming int; v_bal numeric; v_mon int;
begin
  a := public.garden_assets(p_church, p_uid);
  select coalesce((c.settings->>'build_asset')::numeric, 500), coalesce(c.timezone, 'Asia/Seoul')
    into v_th, v_tz from public.garden_churches c where c.id = p_church;
  v_houses := public.garden_home_plans(p_church);
  select (count(*) filter (where t.land = 'dae'))::int into v_dae from public.garden_tiles t where t.church_id = p_church and t.user_id = p_uid;
  v_wood := public.garden_wood(p_church, p_uid);
  select count(*)::int, coalesce(sum(round(s.price * coalesce((s.model->>'yield_x')::numeric, 2))), 0)::int into v_trees, v_coming
    from public.garden_tiles t join public.garden_shop_items s on s.slug = t.item
   where t.church_id = p_church and t.user_id = p_uid and s.model->>'harvest' = 'timber';
  v_bal := public.garden_balance(p_church, p_uid);
  v_mon := extract(month from (now() at time zone coalesce(v_tz, 'Asia/Seoul')))::int;
  return json_build_object(
    'active', (a->>'total')::numeric >= coalesce(v_th, 500) or v_dae > 0 or v_wood > 0 or v_trees > 0,
    'threshold', coalesce(v_th, 500), 'asset', (a->>'total')::numeric, 'assets', a,
    'dae', v_dae, 'wood', v_wood, 'trees', v_trees, 'coming', v_coming, 'balance', v_bal, 'houses', v_houses,
    'winter', v_mon in (12, 1, 2),
    'stock', (select coalesce(json_object_agg(st.item, st.qty), '{}'::json) from public.garden_tree_stock st where st.church_id = p_church));
end $$;

revoke all on function public.garden_home_plans(uuid), public.garden_build_json(uuid, uuid) from public, anon, authenticated;

update public.garden_rules set label = '{"ko":"집 짓기(건축비)","en":"House built"}'::jsonb
 where church_id is null and kind = 'home_build';

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
