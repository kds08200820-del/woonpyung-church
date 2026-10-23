-- ============================================================
--  신앙 정원 3단계 — 마이월렛 · 보상 · 땅 종류(전·대) · 꽃집 (2026-10-23 담임목사 지시)
--
--  [무엇]
--   · 마이월렛: 화폐 단위 달란트. 잔액·받은 곳·쓴 곳을 장부(garden_ledger)로 보여 준다(garden_wallet RPC)
--   · 보상(플랫폼 규칙 값 바꿈): 주일 낮 예배·새벽기도회·수요기도회 출석 각 10 · 큐티 아멘 5 · 매일 정원에 물 주기 2(새 '물 주기')
--     · 성경 읽기 하루 10(하루 1번) · 하트 하나에 1(하루 20번까지) · 교육 이수 = 교육마다 정한 달란트(edu_records.talent_reward)
--   · 마음(XP) = 신앙생활. 꽃집 품목은 심었다고 자라지 않고, 심은 뒤 쌓인 마음(XP)만큼 자란다(2026-10-23 담임목사 지시)
--     하루 마음 10(큐티 한 번)이면 실제 날수만큼 자라고, 덜 쌓이면 그만큼 늦다: 자란 날 = least(심은 지 날수, 심은 뒤 XP ÷ 10)
--     하루 기준(10)은 garden_churches.settings.xp_day 로 바꿀 수 있다
--     · 정원 들르기(로그인)는 달란트 0 — 물 주기로 옮김. 이미 적힌 지난 기록의 값은 바꾸지 않는다(장부는 그대로)
--   · 주일학교 달란트(ss_talents)를 그 어린이 계정의 마이월렛에 그대로 — 지금까지 모은 것 전부와 앞으로 받는 것(차감 포함)
--   · 땅 종류: 전(밭) — 사서 작물을 심는다(칸당 10) · 대(대지) — 전을 '대지로 바꾸기'(칸당 100), 집 지을 자리
--     여러 칸을 골라 한 번에 결제(garden_farm_buy_many · garden_farm_convert). 값은 관리자가 바꾼다(garden_admin_set_land_prices)
--   · 꽃집: 먹거리 씨앗(5) · 과일나무 묘목(50) · 꽃(20). 품목마다 우정읍 기후에 맞는지와 심는 때·물 주기·열매까지 걸리는 때를
--     사실대로 적는다(specs). 사면 달란트가 빠지고 내 가방(garden_inventory)에 들어가 내 땅 전에 심는다.
--     먹거리·과일나무는 실제 기간이 지나야 거둔다(하루 열매 수·한 알 0.1). 꽃은 꽃 피는 달에 핀다. 값은 관리자가 바꾼다
--  [표]   garden_shop_items · garden_inventory · garden_tiles(+land, item, item_at) · edu_records(+talent_reward)
--  [함수] garden_wallet · garden_water · garden_farm_buy_many · garden_farm_convert · garden_shop · garden_shop_buy
--         · garden_farm_plant_item · garden_farm_harvest · garden_farm_clear · garden_admin_set_land_prices · garden_admin_set_item_price
--         garden_candidates_v2(값이 정해진 후보: 주일학교 달란트·교육 이수) · garden_sync_user · garden_state_json · garden_farm_json 다시
--  [실행] SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전 — 규칙 값은 다시 덮어씀)
--
--  [되돌리기(롤백)] — 표·칸은 DROP 대신 RENAME
--    drop function if exists public.garden_wallet(text), public.garden_water(text), public.garden_farm_buy_many(text, jsonb),
--      public.garden_farm_convert(text, jsonb), public.garden_shop(text), public.garden_shop_buy(text, text, int),
--      public.garden_farm_plant_item(text, int, int, text), public.garden_farm_harvest(text, int, int, int), public.garden_farm_clear(text, int, int),
--      public.garden_admin_set_land_prices(text, numeric, numeric), public.garden_admin_set_item_price(text, text, numeric),
--      public.garden_candidates_v2(uuid, uuid), public.garden_land_prices(uuid), public.garden_inventory_json(uuid, uuid),
--      public.garden_xp_since(uuid, uuid, timestamptz), public.garden_xp_day(uuid);
--    alter table public.garden_inventory rename to garden_inventory_archived;
--    alter table public.garden_shop_items rename to garden_shop_items_archived;
--    alter table public.garden_tiles rename column land to land_archived;
--    alter table public.garden_tiles rename column item to item_archived;
--    alter table public.garden_tiles rename column item_at to item_at_archived;
--    alter table public.edu_records rename column talent_reward to talent_reward_archived;
--    규칙 값 되돌리기: 아래 2) 의 update 를 1단계 값(주일 5·평일 3·큐티 2·성경 1(하루 3)·하트 1(하루 5)·들르기 1)으로
--    garden_sync_user · garden_state_json · garden_farm_json 은 20261023_1300_garden_farm.sql 의 7)·8) 절과 5) 절을 다시 실행
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────
-- 1) 칸 추가
-- ──────────────────────────────────────────────────────────────
alter table public.garden_tiles add column if not exists land text not null default 'jeon';
alter table public.garden_tiles add column if not exists item text;                 -- 꽃집에서 사서 심은 품목(garden_shop_items.slug)
alter table public.garden_tiles add column if not exists item_at timestamptz;       -- 그 품목을 심은 시각
do $$ begin
  alter table public.garden_tiles add constraint garden_tiles_land_ck check (land in ('jeon', 'dae'));
exception when duplicate_object then null; end $$;

do $$ begin
  if to_regclass('public.edu_records') is not null then
    alter table public.edu_records add column if not exists talent_reward numeric(8,1) default 0;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- 2) 보상 규칙 (플랫폼 기본값 — 교회가 따로 정하면 church_id 행이 이긴다)
-- ──────────────────────────────────────────────────────────────
update public.garden_rules set talent = 10, updated_at = now() where church_id is null and kind in ('worship_sunday', 'worship_weekday');
update public.garden_rules set talent = 5,  updated_at = now() where church_id is null and kind = 'qt_amen';
update public.garden_rules set talent = 10, daily_cap = 1, updated_at = now() where church_id is null and kind = 'bible_day';
update public.garden_rules set talent = 1,  daily_cap = 20, updated_at = now() where church_id is null and kind = 'heart_given';
update public.garden_rules set talent = 0,  updated_at = now() where church_id is null and kind = 'login';
insert into public.garden_rules (church_id, kind, label, xp, talent, daily_cap, active, sort) values
  (null, 'water',        '{"ko":"정원에 물 주기","en":"Watering"}',            2, 2, 1, true, 11),
  (null, 'edu_done',     '{"ko":"교육 이수","en":"Course completed"}',         30, 0, 0, true, 85),
  (null, 'ss_talent',    '{"ko":"주일학교 달란트","en":"Sunday school"}',       0, 0, 0, true, 86),
  (null, 'land_convert', '{"ko":"대지로 바꾸기","en":"Building site"}',        0, 0, 0, true, 114),
  (null, 'shop_buy',     '{"ko":"꽃집에서 사기","en":"Flower shop"}',          0, 0, 0, true, 115),
  (null, 'harvest',      '{"ko":"수확","en":"Harvest"}',                       0, 0, 0, true, 116)
on conflict (kind) where church_id is null do nothing;

-- ──────────────────────────────────────────────────────────────
-- 3) 꽃집 품목 · 내 가방
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_shop_items (
  slug      text primary key check (slug ~ '^[a-z][a-z0-9-]{1,40}$'),
  category  text not null check (category in ('food', 'tree', 'flower')),
  name      jsonb not null default '{}'::jsonb,                 -- {"ko":"방울토마토"}
  price     numeric(8,1) not null default 0 check (price >= 0),
  fit       text not null default 'good' check (fit in ('good', 'ok', 'no')),   -- 우정읍 기후: 잘 자람 · 조건부 · 안 맞음(팔지 않음)
  specs     jsonb not null default '{}'::jsonb,                 -- 화면에 보이는 사실: 심는 때·첫 수확·물 주기·햇빛·추위·가뭄·장마·출처 …
  model     jsonb not null default '{}'::jsonb,                 -- 자람 계산: type·first_days·window_days·years_to_fruit·harvest_months·per_day·value·bloom_months·water_every·drought_days·wet·min_temp
  active    boolean not null default true,
  sort      integer not null default 100,
  updated_at timestamptz not null default now()
);
create table if not exists public.garden_inventory (
  church_id uuid not null references public.garden_churches (id),
  user_id   uuid not null references auth.users (id) on delete cascade,
  item      text not null references public.garden_shop_items (slug),
  qty       integer not null default 0 check (qty >= 0),
  primary key (church_id, user_id, item)
);
alter table public.garden_shop_items enable row level security;
alter table public.garden_inventory  enable row level security;
drop policy if exists garden_shop_items_read on public.garden_shop_items;
create policy garden_shop_items_read on public.garden_shop_items for select using (true);
drop policy if exists garden_inventory_own on public.garden_inventory;
create policy garden_inventory_own on public.garden_inventory for select using (user_id = auth.uid());
revoke all on public.garden_shop_items, public.garden_inventory from anon, authenticated;
grant select on public.garden_shop_items to anon, authenticated;
grant select on public.garden_inventory to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4) 도우미
-- ──────────────────────────────────────────────────────────────
-- 땅 값: 교회 설정 settings->'land_price' = {"jeon":10,"dae":100}. 없으면 기본값
create or replace function public.garden_land_prices(p_church uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'jeon', coalesce((c.settings->'land_price'->>'jeon')::numeric, 10),
    'dae',  coalesce((c.settings->'land_price'->>'dae')::numeric, 100))
    from public.garden_churches c where c.id = p_church
$$;

-- 심은 뒤 쌓인 마음(XP): 그 시각 뒤에 신앙생활(예배·QT·성경·물 주기·하트·교육 …)로 받은 XP 합
create or replace function public.garden_xp_since(p_church uuid, p_uid uuid, p_at timestamptz) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.xp), 0)::int from public.garden_ledger l
   where l.church_id = p_church and l.user_id = p_uid and l.at >= p_at and l.xp > 0
$$;
-- 하루치 마음(XP) — 이만큼 쌓이면 실제 하루만큼 자란다(기본 10)
create or replace function public.garden_xp_day(p_church uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(coalesce((select (c.settings->>'xp_day')::numeric from public.garden_churches c where c.id = p_church), 10), 1)
$$;
revoke all on function public.garden_xp_since(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.garden_xp_day(uuid) from public, anon, authenticated;

create or replace function public.garden_inventory_json(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('item', i.item, 'qty', i.qty) order by s.sort), '[]'::json)
    from public.garden_inventory i join public.garden_shop_items s on s.slug = i.item
   where i.church_id = p_church and i.user_id = p_uid and i.qty > 0
$$;

-- 값이 정해진 후보(주일학교 달란트·교육 이수) + 1단계 후보. amount 가 있으면 규칙 값 대신 그 값을 적는다
create or replace function public.garden_candidates_v2(p_uid uuid, p_church uuid)
returns table (kind text, ref text, happened_at timestamptz, source text, amount numeric)
language plpgsql stable security definer set search_path = public as $$
declare c public.garden_churches; v_key text;
begin
  select * into c from public.garden_churches where id = p_church;
  if not found then return; end if;
  return query select x.kind, x.ref, x.happened_at, x.source, null::numeric from public.garden_candidates(p_uid, p_church) x;
  if coalesce(c.settings->>'adapter', '') <> 'woonpyung' then return; end if;
  if to_regclass('public.member_links') is not null then
    select ml.member_key into v_key from public.member_links ml where ml.user_id = p_uid and coalesce(ml.member_key, '') <> '';
  end if;
  if v_key is null then return; end if;
  -- 주일학교 달란트: 어린이 본인 계정(교적 매칭키)의 장부 한 줄 = 마이월렛 한 줄(차감도 그대로)
  if to_regclass('public.ss_talents') is not null then
    return query select 'ss_talent'::text, t.id::text, t.created_at, 'woonpyung_adapter'::text, t.amount::numeric
                   from public.ss_talents t where t.member_key = v_key and t.amount <> 0;
  end if;
  -- 교육 이수: 참석자/이수자로 올라 있고 교육이 끝난(끝 날짜·없으면 교육 날짜가 지난) 교육의 정한 달란트
  if to_regclass('public.edu_records') is not null and to_regprocedure('public.edu_participant_keys(text)') is not null then
    return query execute
      'select ''edu_done''::text, e.id::text, ((coalesce(e.end_date, e.edu_date) + time ''18:00'') at time zone $2), ''woonpyung_adapter''::text, e.talent_reward::numeric
         from public.edu_records e
        where coalesce(e.talent_reward, 0) > 0 and coalesce(e.end_date, e.edu_date) <= (now() at time zone $2)::date
          and $1 in (select public.edu_participant_keys(e.participants::text))'
      using v_key, c.timezone;
  end if;
  return;
end $$;

revoke all on function public.garden_land_prices(uuid), public.garden_inventory_json(uuid, uuid), public.garden_candidates_v2(uuid, uuid)
  from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5) 내 땅 JSON — 땅 값(전·대)·땅 종류·심은 품목·내 가방·관리자 여부를 더했다
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_farm_json(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  with t as (select * from public.garden_tiles where church_id = p_church and user_id = p_uid),
       n as (select count(*)::int as n from t)
  select json_build_object(
    'now', now(),
    'balance', public.garden_balance(p_church, p_uid),
    'stage', (select g.stage from public.garden_gardens g where g.church_id = p_church and g.user_id = p_uid),
    'tiles', coalesce((select json_agg(json_build_object('x', t.x, 'y', t.y, 'land', t.land, 'crop', t.crop, 'planted_at', t.planted_at,
                         'ripe_at', t.ripe_at, 'picked', to_json(t.picked), 'item', t.item, 'item_at', t.item_at,
                         'xp_since', case when t.item is null then null else public.garden_xp_since(p_church, p_uid, t.item_at) end,
                         -- 오늘 이 품목에서 거둔 번호(장부 ref = 'x,y@심은시각ms#오늘#n')
                         'harvested', (select coalesce(json_agg(split_part(l.ref, '#', 3)::int), '[]'::json)
                                         from public.garden_ledger l, public.garden_churches ch
                                        where ch.id = p_church and l.church_id = p_church and l.user_id = p_uid and l.kind = 'harvest' and t.item_at is not null
                                          and l.ref like t.x || ',' || t.y || '@' || floor(extract(epoch from t.item_at) * 1000)::bigint || '#'
                                                         || ((now() at time zone ch.timezone)::date)::text || '#%'))
                         order by t.y, t.x) from t), '[]'::json),
    -- 최근 120일 물 준 날(식물 건강 계산용, 교회 시간대 날짜)
    'water_days', (select coalesce(json_agg(l.ref order by l.ref), '[]'::json) from public.garden_ledger l
                    where l.church_id = p_church and l.user_id = p_uid and l.kind = 'water' and l.at >= now() - interval '120 days'),
    'count', n.n,
    'prices', public.garden_land_prices(p_church),
    'price', (public.garden_land_prices(p_church)->>'jeon')::numeric,
    'max', 4,
    'xp_day', public.garden_xp_day(p_church),
    'crops', coalesce((select json_agg(json_build_object('slug', c.slug, 'name', c.name, 'grow_sec', c.grow_sec,
                         'seed_cost', c.seed_cost, 'fruits', c.fruits, 'fruit_value', c.fruit_value, 'min_stage', c.min_stage)
                         order by c.sort) from public.garden_crops c where c.active), '[]'::json),
    'inventory', public.garden_inventory_json(p_church, p_uid),
    'watered', exists (select 1 from public.garden_ledger l, public.garden_churches ch
                        where ch.id = p_church and l.church_id = p_church and l.user_id = p_uid and l.kind = 'water'
                          and l.ref = ((now() at time zone ch.timezone)::date)::text),
    'admin', public.garden_is_admin(p_church),
    'fruit', public.garden_fruit_json(p_church, p_uid))
  from n
$$;
revoke all on function public.garden_farm_json(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 6) 공개 RPC
-- ──────────────────────────────────────────────────────────────
-- 마이월렛: 잔액 · 받은 합 · 쓴 합 · 종류별 합(이름표 포함) · 최근 30일 받은 합
create or replace function public.garden_wallet(p_church text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_locale text;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  v_locale := coalesce((select p.locale from public.garden_profiles p where p.user_id = v_uid), 'ko');
  return json_build_object('ok', true,
    'balance', public.garden_balance(v_church, v_uid),
    'earned', (select coalesce(sum(l.talent), 0) from public.garden_ledger l where l.church_id = v_church and l.user_id = v_uid and l.talent > 0),
    'spent', (select coalesce(-sum(l.talent), 0) from public.garden_ledger l where l.church_id = v_church and l.user_id = v_uid and l.talent < 0),
    'month', (select coalesce(sum(l.talent), 0) from public.garden_ledger l where l.church_id = v_church and l.user_id = v_uid and l.talent > 0
                and l.at >= now() - interval '30 days'),
    'by_kind', (select coalesce(json_agg(json_build_object('kind', k.kind, 'label', coalesce(r.label->>v_locale, r.label->>'ko', k.kind),
                       'in', k.inn, 'out', k.outt, 'n', k.n) order by k.inn desc, k.outt desc), '[]'::json)
                  from (select l.kind, sum(greatest(l.talent, 0)) as inn, -sum(least(l.talent, 0)) as outt, count(*) as n
                          from public.garden_ledger l where l.church_id = v_church and l.user_id = v_uid and l.talent <> 0 group by l.kind) k
                  left join public.garden_rules_eff(v_church) r on r.kind = k.kind),
    -- 받는 법: 달란트와 마음(XP)을 함께 (마음은 심은 것을 자라게 한다)
    'rules', (select coalesce(json_agg(json_build_object('kind', r.kind, 'label', r.label, 'talent', r.talent, 'xp', r.xp, 'daily_cap', r.daily_cap)
                       order by r.sort), '[]'::json)
                from public.garden_rules_eff(v_church) r where r.active and (r.talent > 0 or r.xp > 0 or r.kind in ('edu_done', 'ss_talent'))),
    'xp_day', public.garden_xp_day(v_church));
end $$;

-- 정원에 물 주기: 하루 한 번(교회 시간대). 규칙 값만큼 적립하고, 그날 물 준 기록은 식물 건강 계산에 쓴다
create or replace function public.garden_water(p_church text default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_tz text; v_day date; r record; v_ins int := 0; v_bal numeric;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select c.timezone into v_tz from public.garden_churches c where c.id = v_church;
  v_day := (now() at time zone coalesce(v_tz, 'Asia/Seoul'))::date;
  select * into r from public.garden_rules_eff(v_church) e where e.kind = 'water';
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source)
  values (v_church, v_uid, 'water', v_day::text, case when r.active then r.xp else 0 end, case when r.active then r.talent else 0 end, now(), 'platform')
  on conflict (church_id, user_id, kind, ref) do nothing;
  get diagnostics v_ins = row_count;
  v_bal := public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'watered', v_ins > 0, 'gain', case when v_ins > 0 and r.active then r.talent else 0 end,
                           'talent_balance', v_bal, 'day', v_day);
end $$;

-- 땅 여러 칸 사기(전). p_cells = [{"x":1,"y":2}, …]. 내 땅이나 함께 사는 칸에 붙어 있어야 한다. 한 칸이라도 안 되면 하나도 사지 않는다
create or replace function public.garden_farm_buy_many(p_church text, p_cells jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_price numeric; v_bal numeric; v_left jsonb; v_next jsonb; v_ok jsonb := '[]'::jsonb;
        e jsonb; vx int; vy int; v_progress boolean; v_n int;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  perform public.garden_farm_ensure(v_church, v_uid);
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) = 0 then return json_build_object('ok', false, 'why', 'empty'); end if;
  if jsonb_array_length(p_cells) > 81 then return json_build_object('ok', false, 'why', 'range'); end if;
  -- 겹친 칸·범위 밖·이미 산 칸 거르기
  v_left := '[]'::jsonb;
  for e in select * from jsonb_array_elements(p_cells) loop
    vx := (e->>'x')::int; vy := (e->>'y')::int;
    if vx is null or vy is null or abs(vx) > 4 or abs(vy) > 4 then return json_build_object('ok', false, 'why', 'range'); end if;
    if exists (select 1 from public.garden_tiles t where t.church_id = v_church and t.user_id = v_uid and t.x = vx and t.y = vy) then
      return json_build_object('ok', false, 'why', 'owned', 'x', vx, 'y', vy);
    end if;
    if not v_left @> jsonb_build_array(jsonb_build_object('x', vx, 'y', vy)) then v_left := v_left || jsonb_build_array(jsonb_build_object('x', vx, 'y', vy)); end if;
  end loop;
  -- 붙어 있는지: 내 땅(또는 이미 통과한 칸)에 붙은 칸부터 하나씩 받아들인다
  loop
    v_progress := false; v_next := '[]'::jsonb;
    for e in select * from jsonb_array_elements(v_left) loop
      vx := (e->>'x')::int; vy := (e->>'y')::int;
      if exists (select 1 from public.garden_tiles t where t.church_id = v_church and t.user_id = v_uid and abs(t.x - vx) + abs(t.y - vy) = 1)
         or exists (select 1 from jsonb_array_elements(v_ok) o where abs((o->>'x')::int - vx) + abs((o->>'y')::int - vy) = 1) then
        v_ok := v_ok || jsonb_build_array(e); v_progress := true;
      else
        v_next := v_next || jsonb_build_array(e);
      end if;
    end loop;
    v_left := v_next;
    exit when jsonb_array_length(v_left) = 0 or not v_progress;
  end loop;
  if jsonb_array_length(v_left) > 0 then return json_build_object('ok', false, 'why', 'far'); end if;
  v_n := jsonb_array_length(v_ok);
  v_price := (public.garden_land_prices(v_church)->>'jeon')::numeric;
  v_bal := public.garden_balance(v_church, v_uid);
  if v_bal < v_price * v_n then return json_build_object('ok', false, 'why', 'talent', 'need', v_price * v_n, 'balance', v_bal); end if;
  for e in select * from jsonb_array_elements(v_ok) loop
    vx := (e->>'x')::int; vy := (e->>'y')::int;
    insert into public.garden_tiles (church_id, user_id, x, y, land) values (v_church, v_uid, vx, vy, 'jeon');
    insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
    values (v_church, v_uid, 'land_buy', vx || ',' || vy, 0, -v_price, now(), 'platform', jsonb_build_object('price', v_price, 'land', 'jeon'));
  end loop;
  perform public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'n', v_n, 'spent', v_price * v_n, 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 한 칸 사기(2단계 화면) — 이제 여러 칸 사기와 같은 값(전 칸당)
create or replace function public.garden_farm_buy(p_church text, p_x int, p_y int) returns json
language sql security definer set search_path = public as $$
  select public.garden_farm_buy_many(p_church, jsonb_build_array(jsonb_build_object('x', p_x, 'y', p_y)))
$$;

-- 전을 대지로 바꾸기(칸당 대지 값). 비어 있는 전만(나무 자리 (0,0) 빼고). 한 칸이라도 안 되면 하나도 바꾸지 않는다
create or replace function public.garden_farm_convert(p_church text, p_cells jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_price numeric; v_bal numeric; e jsonb; vx int; vy int; t public.garden_tiles; v_n int := 0;
        v_cells jsonb := '[]'::jsonb;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) = 0 then return json_build_object('ok', false, 'why', 'empty'); end if;
  for e in select * from jsonb_array_elements(p_cells) loop
    vx := (e->>'x')::int; vy := (e->>'y')::int;
    if vx = 0 and vy = 0 then return json_build_object('ok', false, 'why', 'tree'); end if;
    select * into t from public.garden_tiles where church_id = v_church and user_id = v_uid and garden_tiles.x = vx and garden_tiles.y = vy;
    if not found then return json_build_object('ok', false, 'why', 'not_owned', 'x', vx, 'y', vy); end if;
    if t.land <> 'jeon' then return json_build_object('ok', false, 'why', 'already', 'x', vx, 'y', vy); end if;
    if t.crop is not null or t.item is not null then return json_build_object('ok', false, 'why', 'busy', 'x', vx, 'y', vy); end if;
    if not v_cells @> jsonb_build_array(jsonb_build_object('x', vx, 'y', vy)) then v_cells := v_cells || jsonb_build_array(jsonb_build_object('x', vx, 'y', vy)); end if;
  end loop;
  v_n := jsonb_array_length(v_cells);
  v_price := (public.garden_land_prices(v_church)->>'dae')::numeric;
  v_bal := public.garden_balance(v_church, v_uid);
  if v_bal < v_price * v_n then return json_build_object('ok', false, 'why', 'talent', 'need', v_price * v_n, 'balance', v_bal); end if;
  for e in select * from jsonb_array_elements(v_cells) loop
    vx := (e->>'x')::int; vy := (e->>'y')::int;
    update public.garden_tiles set land = 'dae' where church_id = v_church and user_id = v_uid and garden_tiles.x = vx and garden_tiles.y = vy;
    insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
    values (v_church, v_uid, 'land_convert', vx || ',' || vy, 0, -v_price, now(), 'platform', jsonb_build_object('price', v_price, 'land', 'dae'));
  end loop;
  perform public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'n', v_n, 'spent', v_price * v_n, 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 빠른 작물 심기 — 전에만(대지에는 못 심는다). 그 밖은 2단계와 같다
create or replace function public.garden_farm_plant(p_church text, p_x int, p_y int, p_crop text) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_stage int; t public.garden_tiles; c public.garden_crops; v_bal numeric; v_now timestamptz := now();
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  select g.stage into v_stage from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  if p_x = 0 and p_y = 0 then return json_build_object('ok', false, 'why', 'tree'); end if;
  select * into t from public.garden_tiles where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  if not found then return json_build_object('ok', false, 'why', 'not_owned'); end if;
  if t.land <> 'jeon' then return json_build_object('ok', false, 'why', 'dae'); end if;
  if t.crop is not null or t.item is not null then return json_build_object('ok', false, 'why', 'busy'); end if;
  select * into c from public.garden_crops where slug = p_crop and active;
  if not found then return json_build_object('ok', false, 'why', 'crop'); end if;
  if coalesce(v_stage, 1) < c.min_stage then return json_build_object('ok', false, 'why', 'stage', 'need', c.min_stage); end if;
  v_bal := public.garden_balance(v_church, v_uid);
  if v_bal < c.seed_cost then return json_build_object('ok', false, 'why', 'talent', 'need', c.seed_cost, 'balance', v_bal); end if;
  update public.garden_tiles
     set crop = c.slug, planted_at = v_now, ripe_at = v_now + make_interval(secs => c.grow_sec), picked = '{}'
   where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
  values (v_church, v_uid, 'seed', p_x || ',' || p_y || '@' || floor(extract(epoch from v_now) * 1000)::bigint, 0, -c.seed_cost,
          v_now, 'platform', jsonb_build_object('crop', c.slug));
  perform public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 꽃집 목록 + 내 가방 + 잔액
create or replace function public.garden_shop(p_church text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  return json_build_object('ok', true, 'balance', public.garden_balance(v_church, v_uid), 'admin', public.garden_is_admin(v_church),
    'items', (select coalesce(json_agg(json_build_object('slug', s.slug, 'category', s.category, 'name', s.name, 'price', s.price,
                       'fit', s.fit, 'specs', s.specs, 'model', s.model) order by s.category, s.sort), '[]'::json)
                from public.garden_shop_items s where s.active),
    'xp_day', public.garden_xp_day(v_church),
    'inventory', public.garden_inventory_json(v_church, v_uid));
end $$;

-- 꽃집에서 사기: 값 × 수량을 달란트에서 빼고 내 가방에 넣는다. '안 맞음(no)' 품목은 팔지 않는다
create or replace function public.garden_shop_buy(p_church text, p_item text, p_qty int default 1) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); s public.garden_shop_items; v_bal numeric; v_cost numeric; v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select * into s from public.garden_shop_items where slug = p_item and active;
  if not found then return json_build_object('ok', false, 'why', 'item'); end if;
  if s.fit = 'no' then return json_build_object('ok', false, 'why', 'unfit'); end if;
  if p_qty is null or p_qty < 1 or p_qty > 20 then return json_build_object('ok', false, 'why', 'qty'); end if;
  v_cost := s.price * p_qty;
  v_bal := public.garden_balance(v_church, v_uid);
  if v_bal < v_cost then return json_build_object('ok', false, 'why', 'talent', 'need', v_cost, 'balance', v_bal); end if;
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
  values (v_church, v_uid, 'shop_buy', s.slug || '@' || floor(extract(epoch from v_now) * 1000000)::bigint, 0, -v_cost, v_now, 'platform',
          jsonb_build_object('item', s.slug, 'qty', p_qty, 'price', s.price));
  insert into public.garden_inventory (church_id, user_id, item, qty) values (v_church, v_uid, s.slug, p_qty)
  on conflict (church_id, user_id, item) do update set qty = garden_inventory.qty + excluded.qty;
  v_bal := public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'spent', v_cost, 'balance', v_bal, 'inventory', public.garden_inventory_json(v_church, v_uid));
end $$;

-- 내 가방의 품목을 전 칸에 심기
create or replace function public.garden_farm_plant_item(p_church text, p_x int, p_y int, p_item text) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); t public.garden_tiles; v_qty int;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  if p_x = 0 and p_y = 0 then return json_build_object('ok', false, 'why', 'tree'); end if;
  select * into t from public.garden_tiles where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  if not found then return json_build_object('ok', false, 'why', 'not_owned'); end if;
  if t.land <> 'jeon' then return json_build_object('ok', false, 'why', 'dae'); end if;
  if t.crop is not null or t.item is not null then return json_build_object('ok', false, 'why', 'busy'); end if;
  select i.qty into v_qty from public.garden_inventory i where i.church_id = v_church and i.user_id = v_uid and i.item = p_item for update;
  if coalesce(v_qty, 0) < 1 then return json_build_object('ok', false, 'why', 'no_item'); end if;
  update public.garden_inventory set qty = qty - 1 where church_id = v_church and user_id = v_uid and item = p_item;
  update public.garden_tiles set item = p_item, item_at = now() where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  return json_build_object('ok', true, 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 꽃집 품목 수확: 먹거리는 자란 날이 first_days 부터 window_days 동안, 과일나무는 자란 날이 years_to_fruit 해를 넘고 harvest_months 에.
-- 자란 날 = least(심은 지 날수, 심은 뒤 마음(XP) ÷ 하루치) — 날은 찼는데 마음이 모자라면 why 'xp' 와 모자란 XP(need)
-- 하루 per_day 개까지, 한 개에 value 달란트. 장부 ref = 'x,y@심은시각ms#날짜#n'
create or replace function public.garden_farm_harvest(p_church text, p_x int, p_y int, p_n int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); t public.garden_tiles; s public.garden_shop_items; m jsonb; v_tz text; v_day date;
        v_ok boolean := false; v_per int; v_val numeric; v_ins int;
        v_age int; v_xp int; v_xd numeric; v_eff int; v_lo int; v_hi int; v_mon boolean := true;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select * into t from public.garden_tiles where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  if not found or t.item is null then return json_build_object('ok', false, 'why', 'empty'); end if;
  select * into s from public.garden_shop_items where slug = t.item;
  m := s.model;
  select c.timezone into v_tz from public.garden_churches c where c.id = v_church;
  v_day := (now() at time zone coalesce(v_tz, 'Asia/Seoul'))::date;
  v_per := coalesce((m->>'per_day')::int, 0); v_val := coalesce((m->>'value')::numeric, 0.1);
  if v_per < 1 then return json_build_object('ok', false, 'why', 'no_harvest'); end if;
  v_age := v_day - (t.item_at at time zone coalesce(v_tz, 'Asia/Seoul'))::date;
  v_xp := public.garden_xp_since(v_church, v_uid, t.item_at);
  v_xd := public.garden_xp_day(v_church);
  v_eff := least(v_age, floor(v_xp / v_xd)::int);
  if m->>'type' = 'tree' then
    v_lo := ceil(coalesce((m->>'years_to_fruit')::numeric, 3) * 365.25)::int; v_hi := null;
    v_mon := extract(month from (now() at time zone coalesce(v_tz, 'Asia/Seoul')))::int
             in (select jsonb_array_elements_text(coalesce(m->'harvest_months', '[]'::jsonb))::int);
  else
    v_lo := coalesce((m->>'first_days')::int, 60); v_hi := v_lo + coalesce((m->>'window_days')::int, 30);
  end if;
  v_ok := v_mon and v_eff >= v_lo and (v_hi is null or v_eff < v_hi);
  if not v_ok then
    -- 날도 철도 맞는데 마음이 모자람
    if v_mon and v_age >= v_lo and v_eff < v_lo then
      return json_build_object('ok', false, 'why', 'xp', 'need', ceil(v_lo * v_xd - v_xp)::int, 'xp', v_xp);
    end if;
    return json_build_object('ok', false, 'why', 'not_ready');
  end if;
  if p_n is null or p_n < 1 or p_n > v_per then return json_build_object('ok', false, 'why', 'range'); end if;
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
  values (v_church, v_uid, 'harvest', p_x || ',' || p_y || '@' || floor(extract(epoch from t.item_at) * 1000)::bigint || '#' || v_day || '#' || p_n,
          0, v_val, now(), 'platform', jsonb_build_object('item', s.slug))
  on conflict (church_id, user_id, kind, ref) do nothing;
  get diagnostics v_ins = row_count;
  perform public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'picked', v_ins > 0, 'gain', case when v_ins > 0 then v_val else 0 end,
    'day', v_day, 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 칸 비우기(꽃집 품목) — 시들었거나 수확이 끝난 것을 뽑는다. 돌려받는 것은 없다
create or replace function public.garden_farm_clear(p_church text, p_x int, p_y int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  update public.garden_tiles set item = null, item_at = null where church_id = v_church and user_id = v_uid and x = p_x and y = p_y and item is not null;
  return json_build_object('ok', true, 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 관리자: 땅 값(전 칸당 · 대지로 바꾸기 칸당)
create or replace function public.garden_admin_set_land_prices(p_church text, p_jeon numeric, p_dae numeric) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  if p_jeon is null or p_dae is null or p_jeon < 0 or p_dae < 0 or p_jeon > 100000 or p_dae > 100000 then return json_build_object('ok', false, 'why', 'range'); end if;
  update public.garden_churches
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{land_price}', jsonb_build_object('jeon', round(p_jeon, 1), 'dae', round(p_dae, 1)))
   where id = v_church;
  return json_build_object('ok', true, 'prices', public.garden_land_prices(v_church));
end $$;

-- 관리자: 꽃집 품목 값
create or replace function public.garden_admin_set_item_price(p_church text, p_item text, p_price numeric) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  if p_price is null or p_price < 0 or p_price > 100000 then return json_build_object('ok', false, 'why', 'range'); end if;
  update public.garden_shop_items set price = round(p_price, 1), updated_at = now() where slug = p_item;
  if not found then return json_build_object('ok', false, 'why', 'item'); end if;
  return json_build_object('ok', true, 'item', p_item, 'price', round(p_price, 1));
end $$;

revoke all on function public.garden_wallet(text), public.garden_water(text), public.garden_farm_buy_many(text, jsonb), public.garden_farm_buy(text, int, int),
  public.garden_farm_convert(text, jsonb), public.garden_farm_plant(text, int, int, text), public.garden_shop(text), public.garden_shop_buy(text, text, int),
  public.garden_farm_plant_item(text, int, int, text), public.garden_farm_harvest(text, int, int, int), public.garden_farm_clear(text, int, int),
  public.garden_admin_set_land_prices(text, numeric, numeric), public.garden_admin_set_item_price(text, text, numeric) from public, anon;
grant execute on function public.garden_wallet(text), public.garden_water(text), public.garden_farm_buy_many(text, jsonb), public.garden_farm_buy(text, int, int),
  public.garden_farm_convert(text, jsonb), public.garden_farm_plant(text, int, int, text), public.garden_shop(text), public.garden_shop_buy(text, text, int),
  public.garden_farm_plant_item(text, int, int, text), public.garden_farm_harvest(text, int, int, int), public.garden_farm_clear(text, int, int),
  public.garden_admin_set_land_prices(text, numeric, numeric), public.garden_admin_set_item_price(text, text, numeric) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 7) 동기화(안쪽) — 2단계 8) 절과 같고, 후보를 garden_candidates_v2 로(값이 정해진 후보는 그 값으로 적는다)
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_sync_user(p_uid uuid, p_church uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.garden_churches; g public.garden_gardens;
  v_t0 timestamptz := clock_timestamp();
  v_first boolean; v_xp int; v_tal numeric; v_stage_xp int[]; v_done int; v_harvest int;
  v_new json; v_new_n int; v_new_xp int; v_new_t numeric; v_locale text;
begin
  select * into c from public.garden_churches where id = p_church and is_active;
  if not found then return json_build_object('ok', false, 'why', 'church'); end if;
  if not pg_try_advisory_xact_lock(hashtext('garden:' || p_church::text), hashtext(p_uid::text)) then
    return json_build_object('ok', true, 'busy', true, 'new', '[]'::json, 'new_count', 0, 'new_xp', 0, 'new_talent', 0,
                             'state', public.garden_state_json(p_church, p_uid));
  end if;
  v_first := public.garden_ensure_member(p_church, p_uid);
  if v_first is null then return json_build_object('ok', false, 'why', 'member'); end if;

  with rules as (select * from public.garden_rules_eff(p_church) r where r.active),
  cand as (select * from public.garden_candidates_v2(p_uid, p_church)),
  fresh as (
    select x.* from cand x
     where not exists (select 1 from public.garden_ledger l
                        where l.church_id = p_church and l.user_id = p_uid and l.kind = x.kind and l.ref = x.ref)),
  used as (
    select l.kind, (l.at at time zone c.timezone)::date as day, count(*)::int as n
      from public.garden_ledger l where l.church_id = p_church and l.user_id = p_uid group by 1, 2),
  ranked as (
    select f.*, (f.happened_at at time zone c.timezone)::date as day,
           row_number() over (partition by f.kind, (f.happened_at at time zone c.timezone)::date
                              order by f.happened_at, f.ref)::int as rn
      from fresh f)
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, created_at)
  select p_church, p_uid, k.kind, k.ref, r.xp, coalesce(k.amount, r.talent), k.happened_at, k.source, v_t0
    from ranked k
    join rules r on r.kind = k.kind
    left join used u on u.kind = k.kind and u.day = k.day
   where r.daily_cap = 0 or k.rn <= r.daily_cap - coalesce(u.n, 0)
  on conflict (church_id, user_id, kind, ref) do nothing;

  select * into g from public.garden_gardens where church_id = p_church and user_id = p_uid for update;
  select s.stage_xp, s.done_xp into v_stage_xp, v_done from public.garden_species s where s.slug = g.species;
  select coalesce(sum(l.xp), 0) into v_xp from public.garden_ledger l where l.church_id = p_church and l.user_id = p_uid;
  select r.talent into v_harvest from public.garden_rules_eff(p_church) r where r.kind = 'plant_done' and r.active;
  while v_done > 0 and v_xp - g.xp_spent >= v_done loop
    g.xp_spent := g.xp_spent + v_done;
    g.plants_done := g.plants_done + 1;
    g.planted_at := v_t0;
    insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, created_at, meta)
    values (p_church, p_uid, 'plant_done', g.plants_done::text, 0, coalesce(v_harvest, 0), v_t0, 'system', v_t0,
            jsonb_build_object('species', g.species, 'name', g.plant_name))
    on conflict (church_id, user_id, kind, ref) do nothing;
  end loop;
  select coalesce(sum(l.talent), 0) into v_tal from public.garden_ledger l where l.church_id = p_church and l.user_id = p_uid;

  update public.garden_gardens
     set xp_total = v_xp, xp_spent = g.xp_spent, plant_xp = v_xp - g.xp_spent,
         stage = public.garden_stage(v_xp - g.xp_spent, v_stage_xp),
         plants_done = g.plants_done, planted_at = g.planted_at,
         talent_balance = v_tal, last_sync_at = v_t0
   where church_id = p_church and user_id = p_uid;

  v_locale := coalesce((select p.locale from public.garden_profiles p where p.user_id = p_uid), c.locale, 'ko');
  select count(*)::int, coalesce(sum(t.xp), 0)::int, coalesce(sum(t.talent), 0)::numeric(12,1),
         coalesce(json_agg(json_build_object('kind', t.kind, 'label', coalesce(r.label->>v_locale, r.label->>'ko', t.kind),
                    'ref', t.ref, 'xp', t.xp, 'talent', t.talent, 'at', t.at) order by t.at desc, t.id desc)
                  filter (where t.rnk <= 20), '[]'::json)
    into v_new_n, v_new_xp, v_new_t, v_new
    from (select l.*, row_number() over (order by l.at desc, l.id desc) as rnk
            from public.garden_ledger l
           where l.church_id = p_church and l.user_id = p_uid and l.created_at = v_t0) t
    left join public.garden_rules_eff(p_church) r on r.kind = t.kind;

  return json_build_object('ok', true, 'busy', false, 'first', v_first,
    'new', v_new, 'new_count', v_new_n, 'new_xp', v_new_xp, 'new_talent', v_new_t,
    'state', public.garden_state_json(p_church, p_uid));
end $$;
revoke all on function public.garden_sync_user(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 8) 상태 JSON — 2단계 7) 절과 같고 'watered'(오늘 물 줌)·'admin' 을 더했다
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_state_json(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ok', true,
    'church', json_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'timezone', c.timezone, 'locale', c.locale,
                'city', c.city_name, 'lat', c.lat, 'lng', c.lng, 'theme', c.theme, 'map_size', c.map_size,
                'talent_label', coalesce(c.settings->'talent_label', '{"ko":"달란트","en":"Talents"}'::jsonb),
                'region', (select json_build_object('slug', r.slug, 'name_ko', r.name_ko, 'name_en', r.name_en,
                                                    'lat', r.lat, 'lng', r.lng, 'timezone', r.timezone, 'is_open', r.is_open)
                             from public.garden_regions r where r.id = c.region_id)),
    'me', (select json_build_object('nickname', p.nickname, 'avatar_url', p.avatar_url, 'avatar_key', p.avatar_key,
                                    'visibility', p.visibility, 'locale', p.locale, 'role', m.role)
             from public.garden_profiles p
             left join public.garden_memberships m on m.user_id = p.user_id and m.church_id = c.id
            where p.user_id = p_uid),
    'plot', (select json_build_object('plot_no', pl.plot_no, 'x', pl.x, 'y', pl.y)
               from public.garden_plots pl where pl.church_id = c.id and pl.owner_user_id = p_uid),
    'garden', (select json_build_object('species', g.species, 'species_name', s.name, 'plant_name', g.plant_name,
                 'chosen_at', g.chosen_at, 'planted_at', g.planted_at, 'plant_xp', g.plant_xp, 'stage', g.stage,
                 'stage_xp', to_json(s.stage_xp), 'done_xp', s.done_xp, 'stage_names', s.stage_names,
                 'xp_total', g.xp_total, 'xp_spent', g.xp_spent, 'talent_balance', g.talent_balance,
                 'plants_done', g.plants_done, 'last_sync_at', g.last_sync_at, 'fruit_per_day', s.fruit_per_day)
                 from public.garden_gardens g join public.garden_species s on s.slug = g.species
                where g.church_id = c.id and g.user_id = p_uid),
    'today', (select json_build_object('day', d.day, 'xp', coalesce(sum(l.xp), 0), 'talent', coalesce(sum(l.talent), 0),
                                       'kinds', coalesce(json_agg(distinct l.kind) filter (where l.kind is not null), '[]'::json))
                from (select (now() at time zone c.timezone)::date as day) d
                left join public.garden_ledger l on l.church_id = c.id and l.user_id = p_uid
                                                and (l.at at time zone c.timezone)::date = d.day
               group by d.day),
    'qt_streak', coalesce((
        with d as (select distinct l.ref::date as dd from public.garden_ledger l
                    where l.church_id = c.id and l.user_id = p_uid and l.kind = 'qt_amen'),
             g as (select dd, dd - (row_number() over (order by dd))::int as grp from d),
             last as (select count(*) as n, max(dd) as mx from g group by grp order by max(dd) desc limit 1)
        select case when mx >= (now() at time zone c.timezone)::date - 1 then n else 0 end from last), 0),
    'rules', (select coalesce(json_agg(json_build_object('kind', r.kind, 'label', r.label, 'xp', r.xp,
                       'talent', r.talent, 'daily_cap', r.daily_cap) order by r.sort), '[]'::json)
                from public.garden_rules_eff(c.id) r where r.active),
    'species', (select coalesce(json_agg(json_build_object('slug', s.slug, 'name', s.name, 'stage_xp', to_json(s.stage_xp),
                                                           'done_xp', s.done_xp, 'stage_names', s.stage_names,
                                                           'fruit_per_day', s.fruit_per_day) order by s.sort), '[]'::json)
                  from public.garden_species s where s.active),
    'fruit', public.garden_fruit_json(c.id, p_uid),
    'watered', exists (select 1 from public.garden_ledger l where l.church_id = c.id and l.user_id = p_uid and l.kind = 'water'
                          and l.ref = ((now() at time zone c.timezone)::date)::text),
    'admin', public.garden_is_admin(c.id),
    'wallet', true)
    from public.garden_churches c where c.id = p_church
$$;
revoke all on function public.garden_state_json(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 9) 꽃집 품목 (값·사실은 아래 표 — 출처는 specs.src)  ※ 품목 자료는 이 절에 넣는다
-- ──────────────────────────────────────────────────────────────
-- @@SHOP_ITEMS@@

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
