-- ============================================================
--  신앙 정원 5단계 — 하우스(유리 온실) · 하우스 작물 (2026-10-23 담임목사: "스토어에서 하우스를 만들 수 있도록 해주세요.
--  하우스 재배 식물을 기를 수 있으면 좋겠습니다.")
--
--  [담임목사 결정 10/23]
--   · 하우스 = 밭(전) 칸 하나에 한 동, 50 달란트(교회 설정 settings.house_price — 관리자가 바꾼다). 빈 전 칸을 여러 개 골라 한 번에 짓는다
--   · 하우스 작물(하우스 칸에만 심는다): 딸기·파프리카·멜론·참외(채소 — 익으면 한 번에 거두고 값의 2배) ·
--     무화과·참다래(우정읍 노지에서는 얼어 팔지 않던 나무 — 하우스에서는 기른다) · 애플망고·바나나(열매 나무 — 해마다 열매 철에 값만큼)
--   · 하우스의 이점: 서리·추위·장마로 시들지 않는다(비가 들지 않아 물은 직접 준다 — 화면 plantsim.js 가 셈) · 철 상관없이 심는다 ·
--     일반 채소·꽃·빠른 작물도 하우스 칸에 심는다(방울토마토 겨울 재배 등). 일반 과일나무·건축용 나무는 하우스에 심지 않는다
--   · 자람 속도는 같다(수확 = 투자의 2배 균형을 지킴). 하우스 걷기는 빈 칸일 때만, 돌려받는 값은 없다
--  [표]   garden_tiles(+building, building_at) — building 은 지은 건물 종류('greenhouse'. 집·교회 같은 건물 종류가 뒤에 더해질 수 있다)
--         garden_shop_items — 하우스 작물 6가지 새로, 무화과(fig)·참다래(kiwi)는 하우스 전용으로 바꿈. 하우스 전용 = model.house = true
--  [트리거] garden_tiles_house_guard — 하우스 전용 품목은 하우스 칸에만, 하우스 칸에는 일반 나무·건축용 나무를 심지 못하고, 하우스 칸은 전으로 둔다.
--         심기·캐내기 함수(20261024_0010)는 다시 쓰지 않고 이 트리거가 지킨다(어긴 요청은 오류로 끝나고 아무것도 바뀌지 않는다)
--  [함수] garden_house(내 하우스·값) · garden_house_build(여러 칸 짓기) · garden_house_remove(걷기) · garden_admin_set_house_price
--         garden_farm_json 은 바꾸지 않는다 — 화면은 하우스 목록을 garden_house 로 따로 받는다
--  [실행] 20261024_0010_garden_economy_build.sql 뒤에. SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전 — 관리자가 바꾼 값은 지킨다)
--         ※ 20261023_1500 을 다시 실행하면 무화과·참다래가 '안 맞음'으로 돌아간다 → 그 뒤에는 0010 과 이 파일도 다시 실행
--
--  [되돌리기(롤백)] — 칼럼은 DROP 대신 RENAME, 품목은 지우지 않고 끈다
--    drop trigger if exists garden_tiles_house_guard on public.garden_tiles;
--    drop function if exists public.garden_tiles_house_guard(), public.garden_house_price(uuid), public.garden_house_json(uuid, uuid),
--      public.garden_house(text), public.garden_house_build(text, jsonb), public.garden_house_remove(text, int, int),
--      public.garden_admin_set_house_price(text, numeric);
--    update public.garden_shop_items set active = false where slug in ('strawberry', 'paprika', 'melon', 'korean-melon', 'apple-mango', 'banana');
--    무화과·참다래: update public.garden_shop_items set fit = 'no', model = model - 'house' where slug in ('fig', 'kiwi');
--      (설명·모델을 예전대로 하려면 20261023_1500_garden_wallet_shop.sql 의 9) 품목 절을 다시 실행 — 그 뒤 0010 도 다시)
--    alter table public.garden_tiles rename column building to building_archived;
--    alter table public.garden_tiles rename column building_at to building_at_archived;
--    교회 설정 키 house_price 와 장부 종류 house_build 는 그대로 두어도 쓰이지 않는다(지난 장부는 그대로)
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────
-- 1) 칸에 건물 — 값 검사는 이름 꼴만(종류는 함수가 정한다)
-- ──────────────────────────────────────────────────────────────
alter table public.garden_tiles add column if not exists building text;              -- null = 없음 · 'greenhouse' = 하우스(유리 온실)
alter table public.garden_tiles add column if not exists building_at timestamptz;    -- 지은 시각
do $$ begin
  alter table public.garden_tiles add constraint garden_tiles_building_ck check (building is null or building ~ '^[a-z][a-z0-9-]{1,30}$');
exception when duplicate_object then null; end $$;

-- 장부 종류 이름표(내부 종류 — 보상 설정 화면에는 안 나온다)
insert into public.garden_rules (church_id, kind, label, xp, talent, daily_cap, active, sort) values
  (null, 'house_build', '{"ko":"하우스 짓기","en":"Greenhouse"}', 0, 0, 0, true, 121)
on conflict (kind) where church_id is null do nothing;

-- ──────────────────────────────────────────────────────────────
-- 2) 지킴이 — 하우스 전용 품목은 하우스 칸에만 · 하우스 칸에 일반 나무 금지 · 하우스 칸은 전
--    품목이나 건물이 바뀔 때만 본다(그 밖의 갱신 — 거두기 표시 등 — 은 그대로 지나간다)
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_tiles_house_guard() returns trigger
language plpgsql set search_path = public as $$
declare m jsonb; v_cat text;
begin
  if new.building is not null and new.land <> 'jeon'
     and (tg_op = 'INSERT' or new.land is distinct from old.land or new.building is distinct from old.building) then
    raise exception 'garden_house_land: 하우스를 지은 칸은 전(밭)으로 둡니다' using errcode = 'check_violation';
  end if;
  if new.item is not null and (tg_op = 'INSERT' or new.item is distinct from old.item or new.building is distinct from old.building) then
    select s.model, s.category into m, v_cat from public.garden_shop_items s where s.slug = new.item;
    if coalesce((m->>'house')::boolean, false) then
      if new.building is distinct from 'greenhouse' then
        raise exception 'garden_house_only: 하우스 작물은 하우스를 지은 칸에만 심습니다' using errcode = 'check_violation';
      end if;
    elsif new.building = 'greenhouse' and (v_cat = 'tree' or m->>'harvest' = 'timber') then
      raise exception 'garden_house_tree: 하우스 칸에는 일반 나무를 심지 않습니다' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create or replace trigger garden_tiles_house_guard before insert or update on public.garden_tiles
  for each row execute function public.garden_tiles_house_guard();

-- ──────────────────────────────────────────────────────────────
-- 3) 도우미 (안쪽 — 직접 부르지 못하게)
-- ──────────────────────────────────────────────────────────────
-- 하우스 한 동 값: 교회 설정 settings.house_price, 없으면 50
create or replace function public.garden_house_price(p_church uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (c.settings->>'house_price')::numeric from public.garden_churches c where c.id = p_church), 50)
$$;

create or replace function public.garden_house_json(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'price', public.garden_house_price(p_church),
    'houses', coalesce((select json_agg(json_build_object('x', t.x, 'y', t.y, 'building', t.building, 'at', t.building_at) order by t.y, t.x)
                          from public.garden_tiles t where t.church_id = p_church and t.user_id = p_uid and t.building is not null), '[]'::json))
$$;
revoke all on function public.garden_house_price(uuid), public.garden_house_json(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4) 공개 RPC
-- ──────────────────────────────────────────────────────────────
-- 내 하우스 · 한 동 값 · 잔액 · 관리자 여부
create or replace function public.garden_house(p_church text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); h json;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  h := public.garden_house_json(v_church, v_uid);
  return json_build_object('ok', true, 'price', h->'price', 'houses', h->'houses',
                           'balance', public.garden_balance(v_church, v_uid), 'admin', public.garden_is_admin(v_church));
end $$;

-- 하우스 짓기: p_cells = [{"x":1,"y":2}, …]. 비어 있는 전 칸만(가운데 나무 자리 빼고). 한 칸이라도 안 되면 하나도 짓지 않는다
create or replace function public.garden_house_build(p_church text, p_cells jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_price numeric; v_bal numeric; e jsonb; vx int; vy int; t public.garden_tiles;
        v_cells jsonb := '[]'::jsonb; v_n int; v_now timestamptz := clock_timestamp(); v_ms bigint;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  perform public.garden_farm_ensure(v_church, v_uid);
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) = 0 then return json_build_object('ok', false, 'why', 'empty'); end if;
  if jsonb_array_length(p_cells) > 81 then return json_build_object('ok', false, 'why', 'range'); end if;
  for e in select * from jsonb_array_elements(p_cells) loop
    vx := (e->>'x')::int; vy := (e->>'y')::int;
    if vx is null or vy is null or abs(vx) > 4 or abs(vy) > 4 then return json_build_object('ok', false, 'why', 'range'); end if;
    if vx = 0 and vy = 0 then return json_build_object('ok', false, 'why', 'tree'); end if;
    select * into t from public.garden_tiles g where g.church_id = v_church and g.user_id = v_uid and g.x = vx and g.y = vy;
    if not found then return json_build_object('ok', false, 'why', 'not_owned', 'x', vx, 'y', vy); end if;
    if t.land <> 'jeon' then return json_build_object('ok', false, 'why', 'dae', 'x', vx, 'y', vy); end if;
    if t.building is not null then return json_build_object('ok', false, 'why', 'already', 'x', vx, 'y', vy); end if;
    if t.crop is not null or t.item is not null then return json_build_object('ok', false, 'why', 'busy', 'x', vx, 'y', vy); end if;
    if not v_cells @> jsonb_build_array(jsonb_build_object('x', vx, 'y', vy)) then v_cells := v_cells || jsonb_build_array(jsonb_build_object('x', vx, 'y', vy)); end if;
  end loop;
  v_n := jsonb_array_length(v_cells);
  v_price := public.garden_house_price(v_church);
  v_bal := public.garden_balance(v_church, v_uid);
  if v_bal < v_price * v_n then return json_build_object('ok', false, 'why', 'talent', 'need', v_price * v_n, 'balance', v_bal); end if;
  v_ms := floor(extract(epoch from v_now) * 1000)::bigint;
  for e in select * from jsonb_array_elements(v_cells) loop
    vx := (e->>'x')::int; vy := (e->>'y')::int;
    update public.garden_tiles g set building = 'greenhouse', building_at = v_now
     where g.church_id = v_church and g.user_id = v_uid and g.x = vx and g.y = vy;
    insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
    values (v_church, v_uid, 'house_build', vx || ',' || vy || '@' || v_ms, 0, -v_price, v_now, 'platform',
            jsonb_build_object('price', v_price, 'building', 'greenhouse'));
  end loop;
  v_bal := public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'n', v_n, 'spent', v_price * v_n, 'balance', v_bal,
    'house', public.garden_house_json(v_church, v_uid), 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 하우스 걷기: 빈 칸일 때만. 돌려받는 값은 없다
create or replace function public.garden_house_remove(p_church text, p_x int, p_y int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); t public.garden_tiles;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select * into t from public.garden_tiles g where g.church_id = v_church and g.user_id = v_uid and g.x = p_x and g.y = p_y;
  if not found or t.building is distinct from 'greenhouse' then return json_build_object('ok', false, 'why', 'no_house'); end if;
  if t.crop is not null or t.item is not null then return json_build_object('ok', false, 'why', 'busy'); end if;
  update public.garden_tiles g set building = null, building_at = null
   where g.church_id = v_church and g.user_id = v_uid and g.x = p_x and g.y = p_y;
  return json_build_object('ok', true, 'house', public.garden_house_json(v_church, v_uid), 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 관리자: 하우스 한 동 값
create or replace function public.garden_admin_set_house_price(p_church text, p_price numeric) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  if p_price is null or p_price < 0 or p_price > 100000 then return json_build_object('ok', false, 'why', 'range'); end if;
  update public.garden_churches set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{house_price}', to_jsonb(round(p_price, 1))) where id = v_church;
  return json_build_object('ok', true, 'price', public.garden_house_price(v_church));
end $$;

revoke all on function public.garden_house(text), public.garden_house_build(text, jsonb), public.garden_house_remove(text, int, int),
  public.garden_admin_set_house_price(text, numeric) from public, anon;
grant execute on function public.garden_house(text), public.garden_house_build(text, jsonb), public.garden_house_remove(text, int, int),
  public.garden_admin_set_house_price(text, numeric) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5) 하우스 작물 (model.house = true → 하우스 칸에만). 값은 가격표 규칙(값 ≈ 자라는 날 × 0.1 · 채소는 거두면 2배 ·
--    열매 나무는 해마다 값만큼)으로 처음 넣고, 다시 실행해도 덮지 않는다(관리자가 바꾼 값 지킴)
-- ──────────────────────────────────────────────────────────────
-- 무화과·참다래: 지금까지 '안 맞음'이라 팔지 않던 것 — 처음 한 번만 값을 정한다(하우스 전용으로 바뀌기 전일 때)
update public.garden_shop_items s set price = v.price, updated_at = now()
  from (values ('fig', 50), ('kiwi', 60)) v(slug, price)
 where s.slug = v.slug and not coalesce((s.model->>'house')::boolean, false);

-- 품목 시작 (화면 카드에 그대로 보이는 사실 — specs.src 가 출처)
insert into public.garden_shop_items (slug, category, name, price, fit, specs, model, sort) values
  ('strawberry', 'food', '{"ko":"딸기(설향)","en":"Strawberry"}'::jsonb, 9, 'good',
   '{"plant":"모종, 9월 상중순 하우스에 아주심기 (촉성재배)","first":"심고 약 80~90일 (11월 하순~12월부터)","harvest":"12월~이듬해 5월","water":"점적관수로 흙이 마르지 않게, 조금씩 자주 (하우스는 비가 들지 않아 물 주기가 꼭 필요)","cold":"밤 5~8℃ 아래로 내려가지 않게 보온","note":"하우스 전용 — 이 정원에서는 익으면 한 번에 거둡니다","src":"농사로 딸기 https://www.nongsaro.go.kr"}'::jsonb,
   '{"type":"annual","house":true,"harvest":"once","yield_x":2,"first_days":90,"window_days":14,"water_every":2,"drought_days":7,"wet":"mid"}'::jsonb, 600),
  ('paprika', 'food', '{"ko":"파프리카","en":"Bell pepper"}'::jsonb, 10, 'good',
   '{"plant":"모종, 하우스 촉성재배는 7~8월 아주심기","first":"심고 약 90~100일 (꽃 핀 뒤 색이 들기까지 50~60일)","harvest":"10월~이듬해 6월 (작형에 따라)","water":"점적관수, 흙이 늘 촉촉하게","cold":"밤 16~18℃ 안팎 유지","note":"하우스 전용","src":"농사로 파프리카 https://www.nongsaro.go.kr"}'::jsonb,
   '{"type":"annual","house":true,"harvest":"once","yield_x":2,"first_days":100,"window_days":14,"water_every":2,"drought_days":7,"wet":"mid"}'::jsonb, 610),
  ('melon', 'food', '{"ko":"멜론","en":"Melon"}'::jsonb, 10, 'good',
   '{"plant":"모종, 하우스 봄 재배는 2~3월 아주심기","first":"심고 약 100일 (열매 맺힌 뒤 50~55일)","harvest":"5~7월 (봄 재배)","water":"열매가 커질 때 넉넉히, 익을 무렵에는 줄여 단맛을 올림","cold":"밤 15℃ 아래로 내려가지 않게","note":"하우스 전용","src":"농사로 멜론 https://www.nongsaro.go.kr"}'::jsonb,
   '{"type":"annual","house":true,"harvest":"once","yield_x":2,"first_days":100,"window_days":14,"water_every":3,"drought_days":8,"wet":"mid"}'::jsonb, 620),
  ('korean-melon', 'food', '{"ko":"참외","en":"Korean melon"}'::jsonb, 8, 'good',
   '{"plant":"모종, 하우스 촉성재배는 1~2월 아주심기","first":"심고 약 70~80일 (열매 맺힌 뒤 25~30일)","harvest":"3월 하순~7월","water":"흙이 마르면 넉넉히, 익을 무렵 줄임","cold":"밤 12℃ 아래로 내려가지 않게 보온","note":"하우스 전용","src":"농사로 참외 https://www.nongsaro.go.kr"}'::jsonb,
   '{"type":"annual","house":true,"harvest":"once","yield_x":2,"first_days":80,"window_days":14,"water_every":3,"drought_days":8,"wet":"mid"}'::jsonb, 630),
  ('fig', 'tree', '{"ko":"무화과","en":"Fig"}'::jsonb, 50, 'good',
   '{"fitwhy":"우정읍 노지는 겨울에 얼어(어린나무 −6℃) 하우스에서만 기릅니다","plant":"묘목, 봄","first":"심고 이듬해부터 (2년째)","harvest":"하우스 7월 하순~10월","water":"열매가 클 때 넉넉히, 물 빠짐이 좋아야 함","cold":"−6~−8℃에 얼어 죽음 — 하우스에서 겨울나기","note":"하우스 전용 — 이 정원에서는 마음 120일 뒤부터 열매 철마다 거둡니다","src":"농사로 무화과 https://www.nongsaro.go.kr"}'::jsonb,
   '{"type":"tree","house":true,"harvest":"season","yield_x":1,"first_days":120,"keep_days":7,"dig_x":0.5,"harvest_months":[8,9,10],"water_every":5,"drought_days":20}'::jsonb, 640),
  ('kiwi', 'tree', '{"ko":"참다래(키위)","en":"Kiwifruit"}'::jsonb, 60, 'good',
   '{"fitwhy":"우정읍 노지는 −10℃ 추위에 얼어 하우스에서만 기릅니다","plant":"묘목, 봄","first":"심고 3~4년째","harvest":"10월 하순~11월 중순","water":"뿌리가 얕아 가물면 넉넉히, 물 빠짐이 좋아야 함","cold":"−10℃에서 얼어 상함","note":"하우스 전용 — 이 정원에서는 마음 150일 뒤부터 열매 철마다 거둡니다","src":"농사로 참다래 https://www.nongsaro.go.kr"}'::jsonb,
   '{"type":"tree","house":true,"harvest":"season","yield_x":1,"first_days":150,"keep_days":7,"dig_x":0.5,"harvest_months":[10,11],"water_every":5,"drought_days":15}'::jsonb, 650),
  ('apple-mango', 'tree', '{"ko":"애플망고","en":"Apple mango"}'::jsonb, 60, 'good',
   '{"fitwhy":"열대 과일 — 겨울에도 데우는 하우스에서만 기릅니다","plant":"접목 묘목","first":"심고 약 3년","harvest":"6~8월","water":"꽃 필 무렵은 건조하게, 열매가 클 때 넉넉히","cold":"겨울에도 하우스 안을 데워야 함 (확인 못 함: 정확한 최저 온도)","note":"하우스 전용 — 이 정원에서는 마음 150일 뒤부터 열매 철마다 거둡니다","src":"확인 못 함"}'::jsonb,
   '{"type":"tree","house":true,"harvest":"season","yield_x":1,"first_days":150,"keep_days":7,"dig_x":0.5,"harvest_months":[6,7,8],"water_every":4,"drought_days":15}'::jsonb, 660),
  ('banana', 'tree', '{"ko":"바나나","en":"Banana"}'::jsonb, 50, 'good',
   '{"fitwhy":"열대 과일 — 겨울에도 데우는 하우스에서만 기릅니다","plant":"새끼 포기(흡지)·모종","first":"심고 약 1년 (꽃대가 나온 뒤 3~4개월)","harvest":"확인 못 함 (하우스는 거의 한 해 내내)","water":"잎이 넓어 물을 많이 씀 — 흙이 마르지 않게","cold":"추위에 매우 약함, 겨울에도 하우스 안을 데워야 함","note":"한 포기에서 한 송이가 나고 곁순으로 이어 갑니다. 이 정원에서는 마음 120일 뒤부터 열매 철마다 거둡니다","src":"확인 못 함"}'::jsonb,
   '{"type":"tree","house":true,"harvest":"season","yield_x":1,"first_days":120,"keep_days":7,"dig_x":0.5,"harvest_months":[7,8,9,10],"water_every":3,"drought_days":10}'::jsonb, 670)
on conflict (slug) do update set category = excluded.category, name = excluded.name, fit = excluded.fit,
  specs = excluded.specs, model = excluded.model, sort = excluded.sort, active = true, updated_at = now();
-- 품목 끝

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
