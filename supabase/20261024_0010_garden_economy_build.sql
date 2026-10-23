-- ============================================================
--  신앙 정원 4단계 — 경제 균형 가격표 + 건축 준비(나무 스토어 재고 · 나의 보관함 · 건축 미션)
--  (2026-10-23 담임목사: 가격표 13가지 확정, 저녁에 세 가지 요청)
--
--  [가격표] 다 거두면 산 값(씨앗·모종·묘목)의 2배. 정원에서 남는 몫은 칸 하나에 하루 약 0.1 달란트
--   · 품목마다 수확 방식(model.harvest)
--       once   = 채소·한해살이 꽃·알뿌리: 익거나 꽃이 피면 한 번에 다 거두고 칸이 빈다 (값 = 산 값 × 2)
--                채소는 익은 뒤 14일(window_days) 안에 거두지 않으면 시든다
--       yearly = 꽃나무·여러해살이: 꽃철마다 한 번 거둔다 (한 해 = 산 값, 첫 꽃 마음 60일, 두 번째 꽃철에 2배)
--       season = 열매 나무: 한 해에 산 값만큼, 열매 철 날마다 나눠 열리고 7일치(keep_days)까지 쌓인다
--                첫 열매는 마음 75·120·150일 (예전 실제 3~4년)
--       timber = 건축용 나무(소나무·상수리나무·낙엽송, 새 품목): 다 자라면 베어 목재(산 값 × 2)가 창고에 쌓인다
--   · 캐내기(garden_farm_dig): 살아 있는 나무·꽃나무 = 산 값의 절반, 시든 것·한 번 거두는 것은 값 없이 치움
--   · 빠른 작물: 상추 0.3/열매 6 · 딸기 0.5/10 · 토마토 1.0/20 · 포도 2.0/40 (열매 하나 0.1, 다 거두면 2배)
--     칸 하나에서 하루 2번(market_free) 거둔 것까지 제값, 3번째부터는 농산물직판장 도매로 30% 낮은 값(market_rate 0.7)
--     장부 달란트는 소수 한 자리라 열매 0.07 은 열매 번호별 누적 반올림으로 준다(상추 6개 = 0.4)
--   · 이미 산 품목은 값을 돌려주지 않고 새 규칙으로 자란다
--  [세 요청]
--   1) 나무 스토어 재고: 다 자란 건축용 나무를 스토어에 팔면 산 값의 2배를 받고 칸이 빈다. 그 교회 스토어 재고가 하나 는다.
--      스토어에 재고가 보이고, 남은 수량까지만 산다. 사는 값도 같은 2배(스토어가 남기지 않는다 — 판 사람에게 가지는 않는다).
--      산 나무는 바로 베어 목재로 보관함에 들어간다(겨울에 심지 못해도 건축 준비). 목재 자체는 여전히 사고팔 수 없다.
--      건축용 나무는 심는 달(3·4·10·11월)에만 심는다 — 겨울(12~2월)에는 서버가 막는다
--   2) 나의 보관함(garden_storage): 모은 건축 자재(목재와 내역) · 아직 안 심은 씨앗·묘목 · 배운 교육 · 다녀온 여행(준비 중) ·
--      지은 집(준비 중) · 내 자산
--   3) 건축 미션: 자산(garden_assets = 달란트 + 땅 + 심은 것·가방 + 목재 + 집)이 기준(settings.build_asset, 기본 500)을 넘거나
--      이미 시작했으면(대지·목재·건축용 나무) 작은 집 준비(대지 1칸 · 목재 200 · 품삯 50)를 안내한다 — garden_farm_json.build
--  [표]   garden_tree_stock(교회별 나무 재고) — 새 표. garden_crops 열매 수 제한 1~30 → 1~100 (포도 40, 자료는 그대로)
--  [함수] 새: garden_wood · garden_season_day_value · garden_item_status · garden_assets · garden_build_json · garden_farm_cut ·
--             garden_farm_dig · garden_tree_sell · garden_tree_buy · garden_storage · garden_admin_set_build · garden_admin_set_stock ·
--             garden_admin_assets
--         다시: garden_farm_json · garden_farm_pick · garden_farm_harvest · garden_farm_plant_item · garden_shop
--  [실행] 20261023_1500 · 1900 · 2100 뒤에. SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전 — 값은 다시 덮어씀)
--         ※ 1500 을 다시 실행하면 품목 모델이 예전 값으로 돌아간다 → 그 뒤에는 이 파일도 다시 실행
--
--  [되돌리기(롤백)] — 표는 DROP 대신 RENAME, 품목은 지우지 않고 끈다
--    drop function if exists public.garden_wood(uuid, uuid), public.garden_season_day_value(numeric, jsonb, date),
--      public.garden_item_status(uuid, uuid, int, int), public.garden_assets(uuid, uuid), public.garden_build_json(uuid, uuid),
--      public.garden_farm_cut(text, int, int), public.garden_farm_dig(text, int, int, boolean), public.garden_tree_sell(text, int, int),
--      public.garden_tree_buy(text, text, int), public.garden_storage(text), public.garden_admin_set_build(text, numeric),
--      public.garden_admin_set_stock(text, text, int), public.garden_admin_assets(text);
--    alter table public.garden_tree_stock rename to garden_tree_stock_archived;
--    update public.garden_shop_items set active = false where slug in ('pine', 'oak', 'larch');
--    값: update public.garden_shop_items set price = case category when 'food' then 5 when 'tree' then 50 else 20 end
--          where slug not in ('pine', 'oak', 'larch');
--        update public.garden_crops set seed_cost = v.c, fruits = v.f from (values ('lettuce', 0.3, 4), ('strawberry', 0.5, 7),
--          ('tomato', 0.8, 12), ('grape', 1.5, 25)) v(s, c, f) where slug = v.s;
--    모델·함수: 20261023_1500_garden_wallet_shop.sql 을 다시 실행(품목 모델·garden_farm_json·garden_farm_harvest·
--      garden_farm_plant_item·garden_shop 이 예전대로), garden_farm_pick 은 20261023_1300_garden_farm.sql 의 6) 절
--    열매 수 제한은 포도를 25로 되돌린 뒤: alter table public.garden_crops drop constraint if exists garden_crops_fruits_check;
--      alter table public.garden_crops add constraint garden_crops_fruits_check check (fruits between 1 and 30);
--    교회 설정 키(build_asset·market_free·market_rate·houses)는 그대로 두어도 쓰이지 않는다
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────
-- 1) 표 — 나무 재고(교회마다). 쓰기는 함수로만
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_tree_stock (
  church_id  uuid not null references public.garden_churches (id),
  item       text not null references public.garden_shop_items (slug),
  qty        integer not null default 0 check (qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (church_id, item)
);
alter table public.garden_tree_stock enable row level security;
drop policy if exists garden_tree_stock_read on public.garden_tree_stock;
create policy garden_tree_stock_read on public.garden_tree_stock for select using (true);
revoke all on public.garden_tree_stock from anon, authenticated;
grant select on public.garden_tree_stock to anon, authenticated;

-- 빠른 작물 열매 수 제한을 넓힌다(포도 40). 칸의 자료는 바뀌지 않는다
alter table public.garden_crops drop constraint if exists garden_crops_fruits_check;
alter table public.garden_crops add constraint garden_crops_fruits_check check (fruits between 1 and 100);

-- 장부 종류 이름표(내부 종류 — 보상 설정 화면에는 안 나온다)
insert into public.garden_rules (church_id, kind, label, xp, talent, daily_cap, active, sort) values
  (null, 'dig',       '{"ko":"나무 캐내기","en":"Digging out"}',          0, 0, 0, true, 117),
  (null, 'wood_cut',  '{"ko":"나무 베기(목재)","en":"Timber cut"}',        0, 0, 0, true, 118),
  (null, 'tree_sell', '{"ko":"스토어에 나무 팔기","en":"Tree sold"}',       0, 0, 0, true, 119),
  (null, 'tree_buy',  '{"ko":"스토어에서 나무 사기","en":"Tree bought"}',   0, 0, 0, true, 120)
on conflict (kind) where church_id is null do nothing;

-- ──────────────────────────────────────────────────────────────
-- 2) 가격표 값
-- ──────────────────────────────────────────────────────────────
-- 빠른 작물: 다 거두면 씨앗 값의 2배 (열매 하나 0.1)
update public.garden_crops c set seed_cost = v.cost, fruits = v.n
  from (values ('lettuce', 0.3, 6), ('strawberry', 0.5, 10), ('tomato', 1.0, 20), ('grape', 2.0, 40)) v(slug, cost, n)
 where c.slug = v.slug;

-- 채소: 값 ≈ 자라는 날 × 0.1, 익으면 한 번에 거둔다(값 × 2), 익은 뒤 14일 지나면 시듦
update public.garden_shop_items s
   set price = v.price,
       model = (s.model - 'per_day' - 'value') || jsonb_build_object('harvest', 'once', 'yield_x', 2, 'first_days', v.d, 'window_days', 14),
       updated_at = now()
  from (values ('lettuce', 3, 28), ('cucumber', 3, 30), ('pepper', 4, 35), ('eggplant', 5, 55), ('cherry-tomato', 6, 60),
               ('tomato', 6, 60), ('potato', 9, 90), ('corn', 10, 100), ('sweet-potato', 12, 115)) v(slug, price, d)
 where s.slug = v.slug;

-- 한해살이 꽃 8 → 꽃다발 16 · 알뿌리 15 → 30 (꽃이 피면 한 번 거두고 칸이 빈다)
update public.garden_shop_items s
   set price = case when s.model->>'type' = 'bulb' then 15 else 8 end,
       model = s.model || '{"harvest":"once","yield_x":2}'::jsonb, updated_at = now()
 where s.category = 'flower' and s.model->>'type' in ('annual', 'bulb');

-- 꽃나무·여러해살이 20: 처음 꽃은 마음 60일 뒤 돌아오는 꽃철, 꽃철마다 20, 캐내기 10
update public.garden_shop_items s
   set price = 20,
       model = s.model || '{"harvest":"yearly","yield_x":1,"first_bloom_days":60,"dig_x":0.5}'::jsonb, updated_at = now()
 where s.category = 'flower' and s.model->>'type' in ('perennial', 'shrub');

-- 열매 나무: 한 해 거둠 = 값, 첫 열매 마음 75·120·150일, 열매 7일치까지 쌓임, 캐내기 = 값의 절반
update public.garden_shop_items s
   set price = v.price,
       model = (s.model - 'per_day' - 'value' - 'years_to_fruit')
               || jsonb_build_object('harvest', 'season', 'yield_x', 1, 'first_days', v.d, 'keep_days', 7, 'dig_x', 0.5),
       updated_at = now()
  from (values ('blueberry', 40, 75), ('nanking-cherry', 40, 75), ('apricot', 40, 75),
               ('apple', 50, 120), ('pear', 50, 120), ('peach', 50, 120), ('grape', 50, 120), ('plum', 50, 120), ('jujube', 50, 120),
               ('persimmon', 60, 150), ('hardy-kiwi', 60, 150), ('chestnut', 60, 150), ('maesil', 60, 150), ('cherry', 60, 150)) v(slug, price, d)
 where s.slug = v.slug and s.category = 'tree';

-- 건축용 나무(새 품목): 목재 1개 = 1 달란트로 셈. 다 자라면 베어 목재(값 × 2) 또는 스토어에 판다(값 × 2)
-- 심는 때는 나무 심기 철(봄 3~4월, 가을 10~11월) — 겨울에는 심지 못한다
insert into public.garden_shop_items (slug, category, name, price, fit, specs, model, sort) values
  ('pine', 'tree', '{"ko":"소나무","en":"Korean red pine"}'::jsonb, 20, 'good',
   '{"plant":"묘목, 봄 3~4월 · 가을 10~11월 (겨울에는 심지 못함)","first":"실제로는 수십 년 — 정원에서는 마음 120일이면 벨 수 있음","water":"자리 잡으면 가뭄을 잘 견딤 (이 정원에서는 비가 10일 없으면 물 주기 알림)","sun":"양지","cold":"강함","drought":"강함","note":"다 자라면 베어 목재 40, 또는 스토어에 40 달란트에 팜. 목재는 집 지을 때 씀"}'::jsonb,
   '{"type":"tree","harvest":"timber","yield_x":2,"sell_x":2,"first_days":120,"dig_x":0.5,"plant_months":[3,4,10,11],"water_every":10,"drought_days":45,"min_temp":-30}'::jsonb, 500),
  ('oak', 'tree', '{"ko":"상수리나무(참나무)","en":"Sawtooth oak"}'::jsonb, 40, 'good',
   '{"plant":"묘목, 봄 3~4월 · 가을 10~11월 (겨울에는 심지 못함)","first":"실제로는 수십 년 — 정원에서는 마음 180일이면 벨 수 있음","water":"자리 잡으면 가뭄을 견딤 (이 정원에서는 비가 10일 없으면 물 주기 알림)","sun":"양지","cold":"강함","drought":"보통","note":"다 자라면 베어 목재 80, 또는 스토어에 80 달란트에 팜. 목재는 집 지을 때 씀"}'::jsonb,
   '{"type":"tree","harvest":"timber","yield_x":2,"sell_x":2,"first_days":180,"dig_x":0.5,"plant_months":[3,4,10,11],"water_every":10,"drought_days":30,"min_temp":-30}'::jsonb, 510),
  ('larch', 'tree', '{"ko":"낙엽송","en":"Japanese larch"}'::jsonb, 60, 'good',
   '{"plant":"묘목, 봄 3~4월 · 가을 10~11월 (겨울에는 심지 못함)","first":"실제로는 수십 년 — 정원에서는 마음 240일이면 벨 수 있음","water":"촉촉한 흙을 좋아함 (이 정원에서는 비가 7일 없으면 물 주기 알림)","sun":"양지","cold":"아주 강함","drought":"약함","note":"다 자라면 베어 목재 120, 또는 스토어에 120 달란트에 팜. 목재는 집 지을 때 씀"}'::jsonb,
   '{"type":"tree","harvest":"timber","yield_x":2,"sell_x":2,"first_days":240,"dig_x":0.5,"plant_months":[3,4,10,11],"water_every":7,"drought_days":20,"min_temp":-35}'::jsonb, 520)
on conflict (slug) do update set category = excluded.category, name = excluded.name, price = excluded.price, fit = excluded.fit,
  specs = excluded.specs, model = excluded.model, sort = excluded.sort, active = true, updated_at = now();

-- ──────────────────────────────────────────────────────────────
-- 3) 도우미 (안쪽 — 직접 부르지 못하게)
-- ──────────────────────────────────────────────────────────────
-- 모은 목재: 장부 meta.wood 의 합(베기 +, 스토어에서 산 나무 +, 집 짓기 −(다음 단계))
create or replace function public.garden_wood(p_church uuid, p_uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum((l.meta->>'wood')::int), 0)::int from public.garden_ledger l
   where l.church_id = p_church and l.user_id = p_uid and l.meta ? 'wood'
$$;

-- 열매 나무 하루치 값: 한 해 거둠(p_total)을 그해 열매 철 날수로 나눈다. 날마다 누적 반올림이라 철을 다 거두면 꼭 p_total
create or replace function public.garden_season_day_value(p_total numeric, p_months jsonb, p_day date) returns numeric
language sql immutable as $$
  with m as (select distinct jsonb_array_elements_text(coalesce(p_months, '[]'::jsonb))::int as mo),
       dm as (select m.mo, extract(day from (make_date(extract(year from p_day)::int, m.mo, 1) + interval '1 month' - interval '1 day'))::int as dn
                from m where m.mo between 1 and 12),
       k as (select coalesce(sum(case when dm.mo < extract(month from p_day)::int then dm.dn
                                      when dm.mo = extract(month from p_day)::int then extract(day from p_day)::int else 0 end), 0) as k,
                    coalesce(sum(dm.dn), 0) as n,
                    coalesce(bool_or(dm.mo = extract(month from p_day)::int), false) as inm
               from dm)
  select case when k.n = 0 or not k.inm then 0::numeric
              else round(p_total * k.k / k.n, 1) - round(p_total * (k.k - 1) / k.n, 1) end
    from k
$$;

-- 꽃집 품목 한 칸의 지금 상태(서버가 수확·베기·팔기·캐내기를 판단하는 하나의 셈). 화면도 이 값으로 거둘 것을 띄운다
--   자란 날(eff) = least(심은 지 날수, 심은 뒤 마음 ÷ 하루치) — 1500 과 같은 셈
--   ready·avail(지금 거두면 받을 달란트)·days(열매 나무: 거둘 날들)·need_xp(날은 찼는데 마음이 모자람)·over(채소 때 놓침)·
--   wood·sell(건축용 나무)·dig(캐내기 값)
create or replace function public.garden_item_status(p_church uuid, p_uid uuid, p_x int, p_y int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t public.garden_tiles; s public.garden_shop_items; m jsonb; v_tz text; v_day date; v_mon int; v_plant date;
        v_age int; v_xp int; v_xd numeric; v_eff int; v_mode text; v_lo int; v_x numeric; v_pref text;
        v_cal boolean := false; v_ready boolean := false; v_over boolean := false; v_avail numeric := 0; v_need int := 0;
        v_days jsonb := '[]'::jsonb; v_keep int; d date; v_total numeric;
begin
  select * into t from public.garden_tiles g where g.church_id = p_church and g.user_id = p_uid and g.x = p_x and g.y = p_y;
  if not found or t.item is null then return null; end if;
  select * into s from public.garden_shop_items where slug = t.item;
  if not found then return null; end if;
  m := coalesce(s.model, '{}'::jsonb);
  v_mode := coalesce(m->>'harvest', case when coalesce((m->>'per_day')::int, 0) > 0 then 'daily' else 'none' end);
  select coalesce(c.timezone, 'Asia/Seoul') into v_tz from public.garden_churches c where c.id = p_church;
  v_tz := coalesce(v_tz, 'Asia/Seoul');
  v_day := (now() at time zone v_tz)::date; v_mon := extract(month from v_day)::int;
  v_plant := (t.item_at at time zone v_tz)::date;
  v_age := greatest(v_day - v_plant, 0);
  v_xp := public.garden_xp_since(p_church, p_uid, t.item_at);
  v_xd := public.garden_xp_day(p_church);
  v_eff := least(v_age, floor(v_xp / v_xd)::int);
  v_x := coalesce((m->>'yield_x')::numeric, case when v_mode in ('once', 'timber') then 2 else 1 end);
  v_lo := case when s.category = 'flower' then coalesce((m->>'first_bloom_days')::int, 30) else coalesce((m->>'first_days')::int, 60) end;
  v_pref := t.x || ',' || t.y || '@' || floor(extract(epoch from t.item_at) * 1000)::bigint || '#';

  if v_mode = 'once' and s.category = 'flower' then
    -- 꽃: 피는 달이고 첫 꽃까지 자랐으면 꽃다발로 (심은 해 안에서)
    v_cal := v_age < 365 and v_mon in (select jsonb_array_elements_text(coalesce(m->'bloom_months', '[]'::jsonb))::int) and v_age >= v_lo;
    v_ready := v_cal and v_eff >= v_lo;
    if v_ready then v_avail := round(s.price * v_x, 1); end if;
  elsif v_mode = 'once' then
    -- 채소: 익은 뒤 window_days 안
    v_cal := v_age >= v_lo;
    v_ready := v_eff >= v_lo and v_eff < v_lo + coalesce((m->>'window_days')::int, 14);
    v_over := v_eff >= v_lo + coalesce((m->>'window_days')::int, 14);
    if v_ready then v_avail := round(s.price * v_x, 1); end if;
  elsif v_mode = 'yearly' then
    v_cal := v_mon in (select jsonb_array_elements_text(coalesce(m->'bloom_months', '[]'::jsonb))::int) and v_age >= v_lo;
    v_ready := v_cal and v_eff >= v_lo
               and not exists (select 1 from public.garden_ledger l where l.church_id = p_church and l.user_id = p_uid and l.kind = 'harvest'
                                  and l.ref = v_pref || 'Y' || extract(year from v_day)::int);
    if v_ready then v_avail := round(s.price * v_x, 1); end if;
  elsif v_mode = 'season' then
    -- 열매 철 날마다 열리고 keep_days 일치까지 쌓인다(첫 열매 날 = 심은 날 + first_days 부터)
    v_keep := greatest(coalesce((m->>'keep_days')::int, 7), 1);
    v_total := round(s.price * v_x, 1);
    for d in select g::date from generate_series((v_day - (v_keep - 1))::timestamp, v_day::timestamp, interval '1 day') g loop
      if d >= v_plant + v_lo and extract(month from d)::int in (select jsonb_array_elements_text(coalesce(m->'harvest_months', '[]'::jsonb))::int) then
        v_cal := true;
        if v_eff >= v_lo and not exists (select 1 from public.garden_ledger l where l.church_id = p_church and l.user_id = p_uid
                                            and l.kind = 'harvest' and l.ref = v_pref || d::text) then
          v_avail := v_avail + public.garden_season_day_value(v_total, m->'harvest_months', d);
          v_days := v_days || to_jsonb(d::text);
        end if;
      end if;
    end loop;
    v_ready := jsonb_array_length(v_days) > 0 and v_avail > 0;
  elsif v_mode = 'timber' then
    v_cal := v_age >= v_lo;
    v_ready := v_eff >= v_lo;
  end if;
  if not v_ready and v_cal and v_eff < v_lo then v_need := greatest(ceil(v_lo * v_xd - v_xp)::int, 0); end if;

  return jsonb_build_object('mode', v_mode, 'age', v_age, 'eff', v_eff, 'lo', v_lo, 'xp', v_xp, 'ready', v_ready, 'avail', v_avail,
    'days', v_days, 'need_xp', v_need, 'over', v_over,
    'wood', case when v_mode = 'timber' then round(s.price * v_x)::int end,
    'sell', case when v_mode = 'timber' then round(s.price * coalesce((m->>'sell_x')::numeric, 2), 1) end,
    'dig', case when v_mode in ('yearly', 'season', 'timber') then round(s.price * coalesce((m->>'dig_x')::numeric, 0.5), 1) else 0 end);
end $$;

-- 내 자산: 달란트 + 땅(전 칸 = 전 값, 대지 칸 = 전 값 + 대지 값) + 심은 것·가방(산 값) + 목재(1개 1) + 집(다음 단계)
create or replace function public.garden_assets(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  with p as (select coalesce((public.garden_land_prices(p_church)->>'jeon')::numeric, 10) as j,
                    coalesce((public.garden_land_prices(p_church)->>'dae')::numeric, 100) as d),
       t as (select * from public.garden_tiles where church_id = p_church and user_id = p_uid),
       v as (select public.garden_balance(p_church, p_uid) as talent,
                    coalesce((select sum(case when t.land = 'dae' then p.j + p.d else p.j end) from t, p), 0) as land,
                    coalesce((select sum(s.price) from t join public.garden_shop_items s on s.slug = t.item), 0)
                      + coalesce((select sum(c.seed_cost) from t join public.garden_crops c on c.slug = t.crop), 0)
                      + coalesce((select sum(i.qty * s.price) from public.garden_inventory i join public.garden_shop_items s on s.slug = i.item
                                   where i.church_id = p_church and i.user_id = p_uid), 0) as plants,
                    public.garden_wood(p_church, p_uid)::numeric as wood)
  select json_build_object('talent', v.talent, 'land', v.land, 'plants', v.plants, 'wood', v.wood, 'houses', 0,
                           'total', round(v.talent + v.land + v.plants + v.wood, 1))
    from v
$$;

-- 건축 미션 자료: 자산·기준·대지·목재·심은 건축용 나무(나올 목재)·잔액·집 값·겨울인지·스토어 재고
create or replace function public.garden_build_json(p_church uuid, p_uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare a json; v_th numeric; v_houses jsonb; v_tz text; v_dae int; v_wood int; v_trees int; v_coming int; v_bal numeric; v_mon int;
begin
  a := public.garden_assets(p_church, p_uid);
  select coalesce((c.settings->>'build_asset')::numeric, 500),
         coalesce(c.settings->'houses', '[{"key":"small","dae":1,"wood":200,"wage":50},{"key":"hanok","dae":2,"wood":600,"wage":150},{"key":"big","dae":4,"wood":1500,"wage":400}]'::jsonb),
         coalesce(c.timezone, 'Asia/Seoul')
    into v_th, v_houses, v_tz from public.garden_churches c where c.id = p_church;
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

revoke all on function public.garden_wood(uuid, uuid), public.garden_item_status(uuid, uuid, int, int), public.garden_assets(uuid, uuid),
  public.garden_build_json(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4) 내 땅 JSON — 1500 과 같고, 칸마다 st(품목 상태)·picks_today(오늘 이 칸에서 거둔 빠른 작물 횟수),
--    wood(모은 목재)·build(건축 미션)·market(직판장 규칙)을 더했다
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_farm_json(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  with t as (select * from public.garden_tiles where church_id = p_church and user_id = p_uid),
       n as (select count(*)::int as n from t),
       ch as (select c.id, coalesce(c.timezone, 'Asia/Seoul') as tz, c.settings from public.garden_churches c where c.id = p_church)
  select json_build_object(
    'now', now(),
    'balance', public.garden_balance(p_church, p_uid),
    'stage', (select g.stage from public.garden_gardens g where g.church_id = p_church and g.user_id = p_uid),
    'tiles', coalesce((select json_agg(json_build_object('x', t.x, 'y', t.y, 'land', t.land, 'crop', t.crop, 'planted_at', t.planted_at,
                         'ripe_at', t.ripe_at, 'picked', to_json(t.picked), 'item', t.item, 'item_at', t.item_at,
                         'xp_since', case when t.item is null then null else public.garden_xp_since(p_church, p_uid, t.item_at) end,
                         'st', case when t.item is null then null else public.garden_item_status(p_church, p_uid, t.x, t.y) end,
                         'picks_today', (select count(distinct split_part(l.ref, '#', 1))::int from public.garden_ledger l, ch
                                          where l.church_id = p_church and l.user_id = p_uid and l.kind = 'crop_pick'
                                            and l.ref like t.x || ',' || t.y || '@%' and (l.at at time zone ch.tz)::date = (now() at time zone ch.tz)::date),
                         -- 오늘 이 품목에서 거둔 번호(예전 방식 품목 — 장부 ref = 'x,y@심은시각ms#오늘#n')
                         'harvested', (select coalesce(json_agg(split_part(l.ref, '#', 3)::int), '[]'::json)
                                         from public.garden_ledger l, ch
                                        where l.church_id = p_church and l.user_id = p_uid and l.kind = 'harvest' and t.item_at is not null
                                          and split_part(l.ref, '#', 3) ~ '^[0-9]+$'
                                          and l.ref like t.x || ',' || t.y || '@' || floor(extract(epoch from t.item_at) * 1000)::bigint || '#'
                                                         || ((now() at time zone ch.tz)::date)::text || '#%'))
                         order by t.y, t.x) from t), '[]'::json),
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
    'watered', exists (select 1 from public.garden_ledger l, ch
                        where l.church_id = p_church and l.user_id = p_uid and l.kind = 'water'
                          and l.ref = ((now() at time zone ch.tz)::date)::text),
    'admin', public.garden_is_admin(p_church),
    'fruit', public.garden_fruit_json(p_church, p_uid),
    'wood', public.garden_wood(p_church, p_uid),
    'build', public.garden_build_json(p_church, p_uid),
    'market', (select json_build_object('free', coalesce((ch.settings->>'market_free')::int, 2), 'rate', coalesce((ch.settings->>'market_rate')::numeric, 0.7)) from ch))
  from n
$$;
revoke all on function public.garden_farm_json(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5) 공개 RPC
-- ──────────────────────────────────────────────────────────────
-- 빠른 작물 따기 — 칸마다 하루 market_free(2)번 거둔 것까지 제값, 그 뒤 심은 것은 직판장 값(× market_rate 0.7, 열매 번호별 누적 반올림)
-- p_n = 0 이면 남은 열매를 한 번에 모두 딴다
create or replace function public.garden_farm_pick(p_church text, p_x int, p_y int, p_n int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); t public.garden_tiles; c public.garden_crops; v_ins int; v_bal numeric;
        v_tz text; v_day date; v_pref text; v_prior int; v_free int; v_rate numeric; v_market boolean; v_val numeric;
        v_gain numeric := 0; v_cnt int := 0; v_picked smallint[]; k int;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select * into t from public.garden_tiles where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  if not found then return json_build_object('ok', false, 'why', 'not_owned'); end if;
  if t.crop is null then return json_build_object('ok', false, 'why', 'empty'); end if;
  if now() < t.ripe_at then return json_build_object('ok', false, 'why', 'growing', 'ripe_at', t.ripe_at); end if;
  select * into c from public.garden_crops where slug = t.crop;
  if p_n is null or p_n < 0 or p_n > c.fruits then return json_build_object('ok', false, 'why', 'range'); end if;
  select coalesce(ch.timezone, 'Asia/Seoul'), coalesce((ch.settings->>'market_free')::int, 2), coalesce((ch.settings->>'market_rate')::numeric, 0.7)
    into v_tz, v_free, v_rate from public.garden_churches ch where ch.id = v_church;
  v_day := (now() at time zone v_tz)::date;
  v_pref := p_x || ',' || p_y || '@' || floor(extract(epoch from t.planted_at) * 1000)::bigint;
  -- 이 칸에서 오늘 이미 거둔 다른 심기 수
  select count(distinct split_part(l.ref, '#', 1))::int into v_prior from public.garden_ledger l
   where l.church_id = v_church and l.user_id = v_uid and l.kind = 'crop_pick'
     and l.ref like p_x || ',' || p_y || '@%' and split_part(l.ref, '#', 1) <> v_pref
     and (l.at at time zone v_tz)::date = v_day;
  v_market := v_prior >= v_free;
  v_picked := t.picked;
  for k in select g from generate_series(1, c.fruits) g loop
    continue when (p_n > 0 and k <> p_n) or k = any (v_picked);
    v_val := case when v_market then round(c.fruit_value * v_rate * k, 1) - round(c.fruit_value * v_rate * (k - 1), 1) else c.fruit_value end;
    insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
    values (v_church, v_uid, 'crop_pick', v_pref || '#' || k, 0, v_val, now(), 'platform',
            jsonb_build_object('crop', c.slug) || case when v_market then jsonb_build_object('market', true) else '{}'::jsonb end)
    on conflict (church_id, user_id, kind, ref) do nothing;
    get diagnostics v_ins = row_count;
    if v_ins > 0 then v_gain := v_gain + v_val; v_cnt := v_cnt + 1; end if;
    v_picked := array_append(v_picked, k::smallint);
  end loop;
  if coalesce(array_length(v_picked, 1), 0) >= c.fruits then
    update public.garden_tiles set crop = null, planted_at = null, ripe_at = null, picked = '{}'
     where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  else
    update public.garden_tiles set picked = v_picked where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  end if;
  v_bal := public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'picked', v_cnt > 0, 'n', v_cnt, 'gain', v_gain, 'market', v_market,
                           'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 꽃집 품목 거두기 — 수확 방식(once·yearly·season)대로 garden_item_status 가 정한 만큼. p_n 은 예전 방식(per_day) 품목만 쓴다
create or replace function public.garden_farm_harvest(p_church text, p_x int, p_y int, p_n int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); t public.garden_tiles; s public.garden_shop_items; m jsonb; v_tz text; v_day date;
        v_ok boolean := false; v_per int; v_val numeric; v_ins int;
        v_age int; v_xp int; v_xd numeric; v_eff int; v_lo int; v_hi int; v_mon boolean := true;
        v_mode text; st jsonb; v_pref text; v_gain numeric := 0; v_n int := 0; v_dv numeric; d text; v_clear boolean := false;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select * into t from public.garden_tiles where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  if not found or t.item is null then return json_build_object('ok', false, 'why', 'empty'); end if;
  select * into s from public.garden_shop_items where slug = t.item;
  m := coalesce(s.model, '{}'::jsonb);
  select c.timezone into v_tz from public.garden_churches c where c.id = v_church;
  v_day := (now() at time zone coalesce(v_tz, 'Asia/Seoul'))::date;
  v_mode := coalesce(m->>'harvest', case when coalesce((m->>'per_day')::int, 0) > 0 then 'daily' else 'none' end);
  if v_mode = 'timber' then return json_build_object('ok', false, 'why', 'cut'); end if;
  if v_mode = 'none' then return json_build_object('ok', false, 'why', 'no_harvest'); end if;

  if v_mode <> 'daily' then
    st := public.garden_item_status(v_church, v_uid, p_x, p_y);
    if not coalesce((st->>'ready')::boolean, false) then
      if coalesce((st->>'need_xp')::int, 0) > 0 then
        return json_build_object('ok', false, 'why', 'xp', 'need', (st->>'need_xp')::int, 'xp', (st->>'xp')::int);
      end if;
      if coalesce((st->>'over')::boolean, false) then return json_build_object('ok', false, 'why', 'over'); end if;
      return json_build_object('ok', false, 'why', 'not_ready');
    end if;
    v_pref := p_x || ',' || p_y || '@' || floor(extract(epoch from t.item_at) * 1000)::bigint || '#';
    if v_mode = 'season' then
      for d in select jsonb_array_elements_text(st->'days') loop
        v_dv := public.garden_season_day_value(round(s.price * coalesce((m->>'yield_x')::numeric, 1), 1), m->'harvest_months', d::date);
        insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
        values (v_church, v_uid, 'harvest', v_pref || d, 0, v_dv, now(), 'platform', jsonb_build_object('item', s.slug, 'mode', 'season', 'day', d))
        on conflict (church_id, user_id, kind, ref) do nothing;
        get diagnostics v_ins = row_count;
        if v_ins > 0 then v_gain := v_gain + v_dv; v_n := v_n + 1; end if;
      end loop;
    else
      v_val := (st->>'avail')::numeric;
      insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
      values (v_church, v_uid, 'harvest', v_pref || case when v_mode = 'once' then 'once' else 'Y' || extract(year from v_day)::int end,
              0, v_val, now(), 'platform', jsonb_build_object('item', s.slug, 'mode', v_mode))
      on conflict (church_id, user_id, kind, ref) do nothing;
      get diagnostics v_ins = row_count;
      if v_ins > 0 then v_gain := v_val; v_n := 1; end if;
      if v_mode = 'once' then
        update public.garden_tiles set item = null, item_at = null where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
        v_clear := true;
      end if;
    end if;
    perform public.garden_refresh_balance(v_church, v_uid);
    return json_build_object('ok', true, 'picked', v_n > 0, 'gain', v_gain, 'n', v_n, 'mode', v_mode, 'cleared', v_clear,
      'day', v_day, 'farm', public.garden_farm_json(v_church, v_uid));
  end if;

  -- 예전 방식(per_day) 품목 — 1500 과 같다
  v_per := coalesce((m->>'per_day')::int, 0); v_val := coalesce((m->>'value')::numeric, 0.1);
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

-- 내 가방의 품목을 전 칸에 심기 — 1500 과 같고, 건축용 나무는 심는 달에만(겨울 12~2월에는 심지 못한다)
create or replace function public.garden_farm_plant_item(p_church text, p_x int, p_y int, p_item text) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); t public.garden_tiles; s public.garden_shop_items; v_qty int; v_mon int;
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
  select * into s from public.garden_shop_items where slug = p_item;
  if s.model->>'harvest' = 'timber' then
    select extract(month from (now() at time zone coalesce(c.timezone, 'Asia/Seoul')))::int into v_mon from public.garden_churches c where c.id = v_church;
    if not (v_mon in (select jsonb_array_elements_text(coalesce(s.model->'plant_months', '[]'::jsonb))::int)) then
      return json_build_object('ok', false, 'why', 'season', 'months', s.model->'plant_months');
    end if;
  end if;
  update public.garden_inventory set qty = qty - 1 where church_id = v_church and user_id = v_uid and item = p_item;
  update public.garden_tiles set item = p_item, item_at = now() where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  return json_build_object('ok', true, 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 건축용 나무 베기 — 다 자랐으면 목재(값 × 2)가 창고에, 칸이 빈다. 베는 값은 들지 않는다
create or replace function public.garden_farm_cut(p_church text, p_x int, p_y int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); t public.garden_tiles; s public.garden_shop_items; st jsonb; v_wood int;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select * into t from public.garden_tiles where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  if not found or t.item is null then return json_build_object('ok', false, 'why', 'empty'); end if;
  select * into s from public.garden_shop_items where slug = t.item;
  if coalesce(s.model->>'harvest', '') <> 'timber' then return json_build_object('ok', false, 'why', 'not_timber'); end if;
  st := public.garden_item_status(v_church, v_uid, p_x, p_y);
  if not coalesce((st->>'ready')::boolean, false) then
    if coalesce((st->>'need_xp')::int, 0) > 0 then return json_build_object('ok', false, 'why', 'xp', 'need', (st->>'need_xp')::int); end if;
    return json_build_object('ok', false, 'why', 'not_ready', 'left', greatest((st->>'lo')::int - (st->>'eff')::int, 0));
  end if;
  v_wood := (st->>'wood')::int;
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
  values (v_church, v_uid, 'wood_cut', p_x || ',' || p_y || '@' || floor(extract(epoch from t.item_at) * 1000)::bigint, 0, 0, now(), 'platform',
          jsonb_build_object('item', s.slug, 'wood', v_wood))
  on conflict (church_id, user_id, kind, ref) do nothing;
  update public.garden_tiles set item = null, item_at = null where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  return json_build_object('ok', true, 'wood', v_wood, 'wood_total', public.garden_wood(v_church, v_uid), 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 캐내기 — 살아 있는 나무·꽃나무·건축용 나무는 산 값의 절반(dig_x)이 들고, 시든 것(p_dead)·한 번 거두는 것은 값 없이 치운다
-- (시듦은 기기가 실제 날씨·물 준 날로 셈한다 — plantsim.js)
create or replace function public.garden_farm_dig(p_church text, p_x int, p_y int, p_dead boolean default false) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); t public.garden_tiles; s public.garden_shop_items; v_mode text; v_cost numeric := 0; v_bal numeric;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select * into t from public.garden_tiles where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  if not found or t.item is null then return json_build_object('ok', false, 'why', 'empty'); end if;
  select * into s from public.garden_shop_items where slug = t.item;
  v_mode := coalesce(s.model->>'harvest', case when coalesce((s.model->>'per_day')::int, 0) > 0 then 'daily' else 'none' end);
  if not coalesce(p_dead, false) and v_mode in ('yearly', 'season', 'timber') then
    v_cost := round(s.price * coalesce((s.model->>'dig_x')::numeric, 0.5), 1);
  end if;
  if v_cost > 0 then
    v_bal := public.garden_balance(v_church, v_uid);
    if v_bal < v_cost then return json_build_object('ok', false, 'why', 'talent', 'need', v_cost, 'balance', v_bal); end if;
    insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
    values (v_church, v_uid, 'dig', p_x || ',' || p_y || '@' || floor(extract(epoch from t.item_at) * 1000)::bigint, 0, -v_cost, now(), 'platform',
            jsonb_build_object('item', s.slug, 'cost', v_cost))
    on conflict (church_id, user_id, kind, ref) do nothing;
  end if;
  update public.garden_tiles set item = null, item_at = null where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  perform public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'spent', v_cost, 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 다 자란 건축용 나무를 스토어에 팔기 — 산 값 × 2(sell_x)를 받고 칸이 빈다. 그 교회 스토어 재고 +1
create or replace function public.garden_tree_sell(p_church text, p_x int, p_y int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); t public.garden_tiles; s public.garden_shop_items; st jsonb; v_gain numeric; v_ins int; v_bal numeric; v_left int;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select * into t from public.garden_tiles where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  if not found or t.item is null then return json_build_object('ok', false, 'why', 'empty'); end if;
  select * into s from public.garden_shop_items where slug = t.item;
  if coalesce(s.model->>'harvest', '') <> 'timber' then return json_build_object('ok', false, 'why', 'not_timber'); end if;
  st := public.garden_item_status(v_church, v_uid, p_x, p_y);
  if not coalesce((st->>'ready')::boolean, false) then
    if coalesce((st->>'need_xp')::int, 0) > 0 then return json_build_object('ok', false, 'why', 'xp', 'need', (st->>'need_xp')::int); end if;
    return json_build_object('ok', false, 'why', 'not_ready', 'left', greatest((st->>'lo')::int - (st->>'eff')::int, 0));
  end if;
  v_gain := (st->>'sell')::numeric;
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
  values (v_church, v_uid, 'tree_sell', p_x || ',' || p_y || '@' || floor(extract(epoch from t.item_at) * 1000)::bigint, 0, v_gain, now(), 'platform',
          jsonb_build_object('item', s.slug, 'price', v_gain))
  on conflict (church_id, user_id, kind, ref) do nothing;
  get diagnostics v_ins = row_count;
  if v_ins = 0 then return json_build_object('ok', false, 'why', 'already'); end if;
  update public.garden_tiles set item = null, item_at = null where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  insert into public.garden_tree_stock (church_id, item, qty) values (v_church, s.slug, 1)
  on conflict (church_id, item) do update set qty = garden_tree_stock.qty + 1, updated_at = now()
  returning qty into v_left;
  v_bal := public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'gain', v_gain, 'balance', v_bal, 'stock', v_left, 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 스토어에서 다 자란 건축용 나무 사기 — 남은 재고까지만. 값은 파는 값과 같은 2배, 산 나무는 바로 베어 목재로
create or replace function public.garden_tree_buy(p_church text, p_item text, p_qty int default 1) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); s public.garden_shop_items; v_left int; v_each numeric; v_cost numeric; v_wood int; v_bal numeric;
        v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select * into s from public.garden_shop_items where slug = p_item and active;
  if not found or coalesce(s.model->>'harvest', '') <> 'timber' then return json_build_object('ok', false, 'why', 'item'); end if;
  if p_qty is null or p_qty < 1 or p_qty > 20 then return json_build_object('ok', false, 'why', 'qty'); end if;
  select st.qty into v_left from public.garden_tree_stock st where st.church_id = v_church and st.item = p_item for update;
  if coalesce(v_left, 0) < p_qty then return json_build_object('ok', false, 'why', 'stock', 'left', coalesce(v_left, 0)); end if;
  v_each := round(s.price * coalesce((s.model->>'sell_x')::numeric, 2), 1);
  v_cost := v_each * p_qty;
  v_wood := round(s.price * coalesce((s.model->>'yield_x')::numeric, 2))::int * p_qty;
  v_bal := public.garden_balance(v_church, v_uid);
  if v_bal < v_cost then return json_build_object('ok', false, 'why', 'talent', 'need', v_cost, 'balance', v_bal); end if;
  update public.garden_tree_stock set qty = qty - p_qty, updated_at = now() where church_id = v_church and item = p_item;
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
  values (v_church, v_uid, 'tree_buy', s.slug || '@' || floor(extract(epoch from v_now) * 1000000)::bigint, 0, -v_cost, v_now, 'platform',
          jsonb_build_object('item', s.slug, 'qty', p_qty, 'price', v_each, 'wood', v_wood));
  v_bal := public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'spent', v_cost, 'wood', v_wood, 'wood_total', public.garden_wood(v_church, v_uid), 'balance', v_bal,
    'left', v_left - p_qty);
end $$;

-- 꽃집 목록 — 1500 과 같고 스토어 재고(stock)·모은 목재(wood)를 더했다
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
    'inventory', public.garden_inventory_json(v_church, v_uid),
    'stock', (select coalesce(json_object_agg(st.item, st.qty), '{}'::json) from public.garden_tree_stock st where st.church_id = v_church),
    'wood', public.garden_wood(v_church, v_uid));
end $$;

-- 나의 보관함 — 모은 건축 자재(목재·내역) · 아직 안 심은 씨앗·묘목 · 배운 교육 · 다녀온 여행 · 지은 집 · 내 자산·건축 미션
create or replace function public.garden_storage(p_church text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_edu json;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if to_regclass('public.edu_records') is not null then
    execute 'select coalesce(json_agg(json_build_object(''title'', e.title, ''date'', coalesce(e.end_date, e.edu_date), ''talent'', l.talent, ''at'', l.at)
                      order by l.at desc), ''[]''::json)
               from public.garden_ledger l left join public.edu_records e on e.id::text = l.ref
              where l.church_id = $1 and l.user_id = $2 and l.kind = ''edu_done'''
      into v_edu using v_church, v_uid;
  else
    select coalesce(json_agg(json_build_object('title', null, 'date', null, 'talent', l.talent, 'at', l.at) order by l.at desc), '[]'::json)
      into v_edu from public.garden_ledger l where l.church_id = v_church and l.user_id = v_uid and l.kind = 'edu_done';
  end if;
  return json_build_object('ok', true,
    'balance', public.garden_balance(v_church, v_uid),
    'wood', public.garden_wood(v_church, v_uid),
    'wood_log', (select coalesce(json_agg(json_build_object('kind', w.kind, 'wood', (w.meta->>'wood')::int, 'item', w.meta->>'item',
                          'qty', coalesce((w.meta->>'qty')::int, 1), 'at', w.at) order by w.at desc, w.id desc), '[]'::json)
                   from (select l.* from public.garden_ledger l where l.church_id = v_church and l.user_id = v_uid and l.meta ? 'wood'
                          order by l.at desc, l.id desc limit 30) w),
    'bag', public.garden_inventory_json(v_church, v_uid),
    'names', (select coalesce(json_object_agg(s.slug, s.name), '{}'::json) from public.garden_shop_items s),
    'edu', v_edu,
    'trips', '[]'::json,
    'houses', '[]'::json,
    'build', public.garden_build_json(v_church, v_uid));
end $$;

-- 관리자: 건축 미션을 안내할 자산 기준(기본 500)
create or replace function public.garden_admin_set_build(p_church text, p_asset numeric) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  if p_asset is null or p_asset < 0 or p_asset > 1000000 then return json_build_object('ok', false, 'why', 'range'); end if;
  update public.garden_churches set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{build_asset}', to_jsonb(round(p_asset))) where id = v_church;
  return json_build_object('ok', true, 'build_asset', round(p_asset));
end $$;

-- 관리자: 스토어 나무 재고를 정한다(처음 재고를 넣어 두거나 고칠 때)
create or replace function public.garden_admin_set_stock(p_church text, p_item text, p_qty int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  if p_qty is null or p_qty < 0 or p_qty > 10000 then return json_build_object('ok', false, 'why', 'range'); end if;
  if not exists (select 1 from public.garden_shop_items s where s.slug = p_item and s.model->>'harvest' = 'timber') then
    return json_build_object('ok', false, 'why', 'item');
  end if;
  insert into public.garden_tree_stock (church_id, item, qty) values (v_church, p_item, p_qty)
  on conflict (church_id, item) do update set qty = excluded.qty, updated_at = now();
  return json_build_object('ok', true, 'item', p_item, 'qty', p_qty);
end $$;

-- 관리자(목회 행정 자산 대시보드용): 교회 전체 자산 규모 — 이름 없이 합·평균·구간별 사람 수만
create or replace function public.garden_admin_assets(p_church text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  return (
    with a as (select public.garden_assets(v_church, g.user_id) as j from public.garden_gardens g where g.church_id = v_church),
         v as (select (j->>'talent')::numeric as talent, (j->>'land')::numeric as land, (j->>'plants')::numeric as plants,
                      (j->>'wood')::numeric as wood, (j->>'houses')::numeric as houses, (j->>'total')::numeric as total from a)
    select json_build_object('ok', true, 'members', count(*),
      'sum', json_build_object('talent', coalesce(sum(talent), 0), 'land', coalesce(sum(land), 0), 'plants', coalesce(sum(plants), 0),
                               'wood', coalesce(sum(wood), 0), 'houses', coalesce(sum(houses), 0), 'total', coalesce(sum(total), 0)),
      'avg', round(coalesce(avg(total), 0), 1),
      'median', round(coalesce(percentile_cont(0.5) within group (order by total), 0)::numeric, 1),
      'bands', json_build_array(
        json_build_object('from', 0,    'to', 100,  'n', count(*) filter (where total < 100)),
        json_build_object('from', 100,  'to', 300,  'n', count(*) filter (where total >= 100 and total < 300)),
        json_build_object('from', 300,  'to', 500,  'n', count(*) filter (where total >= 300 and total < 500)),
        json_build_object('from', 500,  'to', 1000, 'n', count(*) filter (where total >= 500 and total < 1000)),
        json_build_object('from', 1000, 'to', null, 'n', count(*) filter (where total >= 1000))),
      'build_asset', (select coalesce((c.settings->>'build_asset')::numeric, 500) from public.garden_churches c where c.id = v_church))
    from v);
end $$;

revoke all on function public.garden_farm_pick(text, int, int, int), public.garden_farm_harvest(text, int, int, int),
  public.garden_farm_plant_item(text, int, int, text), public.garden_farm_cut(text, int, int), public.garden_farm_dig(text, int, int, boolean),
  public.garden_tree_sell(text, int, int), public.garden_tree_buy(text, text, int), public.garden_shop(text), public.garden_storage(text),
  public.garden_admin_set_build(text, numeric), public.garden_admin_set_stock(text, text, int), public.garden_admin_assets(text) from public, anon;
grant execute on function public.garden_farm_pick(text, int, int, int), public.garden_farm_harvest(text, int, int, int),
  public.garden_farm_plant_item(text, int, int, text), public.garden_farm_cut(text, int, int), public.garden_farm_dig(text, int, int, boolean),
  public.garden_tree_sell(text, int, int), public.garden_tree_buy(text, text, int), public.garden_shop(text), public.garden_storage(text),
  public.garden_admin_set_build(text, numeric), public.garden_admin_set_stock(text, text, int), public.garden_admin_assets(text) to authenticated;

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
