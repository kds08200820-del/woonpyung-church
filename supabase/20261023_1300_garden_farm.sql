-- ============================================================
--  신앙 정원 2단계 — 내 땅(밭) · 빠른 작물 · 열매 따기 (2026-10-23 담임목사 지시)
--
--  [무엇]
--   · 달란트를 소수 한 자리까지 센다 — 열매 하나 = 0.1 달란트.
--     garden_ledger.talent · garden_gardens.talent_balance : integer → numeric(12,1) (넓히기만, 지금 값은 그대로)
--   · 내 땅: 처음 3×3 칸(가운데 (0,0) = 믿음 나무 자리), 붙은 칸을 달란트로 한 칸씩 산다. 값은 산 칸 수만큼 오른다
--     (3, 4, 5 … 달란트), 최대 9×9. 땅은 줄지 않는다(되팔기 없음)
--   · 빠른 작물(garden_crops): 씨앗 값을 내고 심으면 실제 시간이 지나 익는다. 익으면 열매가 열리고 하나씩 따면 하나에 0.1.
--     작물마다 '믿음 나무가 이 단계 이상'이어야 심을 수 있다(min_stage) — 밭이 신앙생활과 이어지게
--   · 믿음 나무 열매: 열매 맺는 종류(올리브·무화과)가 '열매' 단계면 날마다 열매가 열리고(fruit_per_day) 하나에 0.1
--   · 모든 오르내림은 장부(garden_ledger)에 적고 잔액은 늘 장부 합으로 다시 센다. 같은 열매는 두 번 못 딴다(장부 UNIQUE)
--  [표]   garden_crops(작물 목록·값 — 값은 이 표에서 고친다) · garden_tiles(내 땅의 칸·심은 작물). 쓰기는 함수로만
--  [함수] garden_farm · garden_farm_buy · garden_farm_plant · garden_farm_pick · garden_pick_fruit (RPC)
--         garden_state_json(열매 상태 'fruit' 추가) · garden_sync_user(달란트 합을 소수로) 는 1단계 것을 그대로 옮겨 그 부분만 고쳤다
--  [실행] SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전). 그 뒤에 화면(garden.html 의 내 땅·열매 따기)을 올린다
--
--  [되돌리기(롤백)] — 표는 DROP 대신 RENAME
--    drop function if exists public.garden_farm(text), public.garden_farm_buy(text, int, int),
--      public.garden_farm_plant(text, int, int, text), public.garden_farm_pick(text, int, int, int), public.garden_pick_fruit(text, int),
--      public.garden_farm_json(uuid, uuid), public.garden_fruit_json(uuid, uuid), public.garden_farm_ensure(uuid, uuid),
--      public.garden_balance(uuid, uuid), public.garden_refresh_balance(uuid, uuid), public.garden_land_price(int);
--    alter table public.garden_tiles rename to garden_tiles_archived;
--    alter table public.garden_crops rename to garden_crops_archived;
--    alter table public.garden_species rename column fruit_per_day to fruit_per_day_archived;
--    update public.garden_rules set active = false where church_id is null and kind in ('land_buy','seed','crop_pick','fruit_pick');
--    garden_state_json · garden_sync_user 는 20261023_1200_garden_phase1.sql 의 15)·16) 절을 다시 실행
--    (달란트 열은 numeric 으로 둔다 — integer 로 되돌리면 0.1 단위가 반올림되어 사라진다)
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────
-- 1) 달란트 소수 한 자리
-- ──────────────────────────────────────────────────────────────
alter table public.garden_ledger  alter column talent type numeric(12,1);
alter table public.garden_gardens alter column talent_balance type numeric(12,1);

-- ──────────────────────────────────────────────────────────────
-- 2) 믿음 나무 열매 — 하루에 열리는 수 (0 = 열매 따기 없음)
-- ──────────────────────────────────────────────────────────────
alter table public.garden_species add column if not exists fruit_per_day smallint not null default 0;
update public.garden_species set fruit_per_day = 6 where slug in ('olive', 'fig') and fruit_per_day = 0;

-- ──────────────────────────────────────────────────────────────
-- 3) 작물 목록
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_crops (
  slug        text primary key check (slug ~ '^[a-z][a-z0-9-]{1,30}$'),
  name        jsonb not null default '{}'::jsonb,                          -- {"ko":"상추","en":"Lettuce"}
  grow_sec    integer not null check (grow_sec between 10 and 604800),     -- 심고 익기까지(초)
  seed_cost   numeric(6,1) not null default 0 check (seed_cost >= 0),      -- 심을 때 내는 달란트
  fruits      smallint not null default 4 check (fruits between 1 and 30), -- 익으면 열리는 열매 수
  fruit_value numeric(4,1) not null default 0.1 check (fruit_value >= 0),  -- 열매 하나 값
  min_stage   smallint not null default 1,                                 -- 믿음 나무가 이 단계 이상이어야 심을 수 있다
  active      boolean not null default true,
  sort        integer not null default 100
);
insert into public.garden_crops (slug, name, grow_sec, seed_cost, fruits, fruit_value, min_stage, sort) values
  ('lettuce',    '{"ko":"상추","en":"Lettuce"}',       600, 0.3,  4, 0.1, 1, 10),
  ('strawberry', '{"ko":"딸기","en":"Strawberry"}',   1800, 0.5,  7, 0.1, 2, 20),
  ('tomato',     '{"ko":"토마토","en":"Tomato"}',     3600, 0.8, 12, 0.1, 3, 30),
  ('grape',      '{"ko":"포도","en":"Grape"}',       14400, 1.5, 25, 0.1, 4, 40)
on conflict (slug) do nothing;

-- ──────────────────────────────────────────────────────────────
-- 4) 내 땅의 칸 — (교회, 사람, x, y). 칸은 지우지 않는다
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_tiles (
  church_id  uuid not null references public.garden_churches (id),
  user_id    uuid not null references auth.users (id) on delete cascade,
  x          smallint not null check (x between -4 and 4),
  y          smallint not null check (y between -4 and 4),
  crop       text references public.garden_crops (slug),
  planted_at timestamptz,
  ripe_at    timestamptz,
  picked     smallint[] not null default '{}',                              -- 이번 작물에서 딴 열매 번호
  bought_at  timestamptz not null default now(),
  primary key (church_id, user_id, x, y)
);

alter table public.garden_crops enable row level security;
alter table public.garden_tiles enable row level security;
drop policy if exists garden_crops_read on public.garden_crops;
create policy garden_crops_read on public.garden_crops for select using (true);
drop policy if exists garden_tiles_own on public.garden_tiles;
create policy garden_tiles_own on public.garden_tiles for select using (user_id = auth.uid());
revoke all on public.garden_crops, public.garden_tiles from anon, authenticated;
grant select on public.garden_crops to anon, authenticated;
grant select on public.garden_tiles to authenticated;

-- 장부 이름표(창고 기록에 보이는 글) — 점수는 함수가 정한다
insert into public.garden_rules (church_id, kind, label, xp, talent, daily_cap, active, sort) values
  (null, 'land_buy',   '{"ko":"땅 사기","en":"Land"}',              0, 0, 0, true, 110),
  (null, 'seed',       '{"ko":"씨앗 심기","en":"Seeds"}',           0, 0, 0, true, 111),
  (null, 'crop_pick',  '{"ko":"작물 거두기","en":"Crop harvest"}',  0, 0, 0, true, 112),
  (null, 'fruit_pick', '{"ko":"열매 따기","en":"Fruit picking"}',   0, 0, 0, true, 113)
on conflict (kind) where church_id is null do nothing;

-- ──────────────────────────────────────────────────────────────
-- 5) 도우미 (안쪽 — 직접 부르지 못하게)
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_land_price(p_extra int) returns numeric
language sql immutable as $$ select (3 + greatest(coalesce(p_extra, 0), 0))::numeric $$;

create or replace function public.garden_balance(p_church uuid, p_uid uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.talent), 0)::numeric(12,1) from public.garden_ledger l where l.church_id = p_church and l.user_id = p_uid
$$;

create or replace function public.garden_refresh_balance(p_church uuid, p_uid uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare v numeric := public.garden_balance(p_church, p_uid);
begin
  update public.garden_gardens set talent_balance = v where church_id = p_church and user_id = p_uid;
  return v;
end $$;

create or replace function public.garden_farm_ensure(p_church uuid, p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.garden_tiles t where t.church_id = p_church and t.user_id = p_uid) then
    insert into public.garden_tiles (church_id, user_id, x, y)
    select p_church, p_uid, gx, gy from generate_series(-1, 1) gx, generate_series(-1, 1) gy
    on conflict do nothing;
  end if;
end $$;

-- 믿음 나무 열매: 오늘(교회 시간대) 열린 수와 딴 번호. 장부 ref = 'YYYY-MM-DD#n'
create or replace function public.garden_fruit_json(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('day', d.day, 'per_day', f.per_day, 'value', 0.1,
           'picked', coalesce((select json_agg(substr(l.ref, 12)::int order by substr(l.ref, 12)::int)
                                 from public.garden_ledger l
                                where l.church_id = p_church and l.user_id = p_uid and l.kind = 'fruit_pick'
                                  and left(l.ref, 10) = d.day::text), '[]'::json))
    from (select (now() at time zone c.timezone)::date as day from public.garden_churches c where c.id = p_church) d
    cross join lateral (
      select case when g.stage >= coalesce(array_length(s.stage_xp, 1), 6) then s.fruit_per_day else 0 end as per_day
        from public.garden_gardens g join public.garden_species s on s.slug = g.species
       where g.church_id = p_church and g.user_id = p_uid) f
$$;

create or replace function public.garden_farm_json(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  with t as (select * from public.garden_tiles where church_id = p_church and user_id = p_uid),
       n as (select count(*)::int as n from t)
  select json_build_object(
    'now', now(),
    'balance', public.garden_balance(p_church, p_uid),
    'stage', (select g.stage from public.garden_gardens g where g.church_id = p_church and g.user_id = p_uid),
    'tiles', coalesce((select json_agg(json_build_object('x', t.x, 'y', t.y, 'crop', t.crop, 'planted_at', t.planted_at,
                         'ripe_at', t.ripe_at, 'picked', to_json(t.picked)) order by t.y, t.x) from t), '[]'::json),
    'count', n.n,
    'price', public.garden_land_price(n.n - 9),
    'max', 4,
    'crops', coalesce((select json_agg(json_build_object('slug', c.slug, 'name', c.name, 'grow_sec', c.grow_sec,
                         'seed_cost', c.seed_cost, 'fruits', c.fruits, 'fruit_value', c.fruit_value, 'min_stage', c.min_stage)
                         order by c.sort) from public.garden_crops c where c.active), '[]'::json),
    'fruit', public.garden_fruit_json(p_church, p_uid))
  from n
$$;

revoke all on function public.garden_balance(uuid, uuid), public.garden_refresh_balance(uuid, uuid),
  public.garden_farm_ensure(uuid, uuid), public.garden_fruit_json(uuid, uuid), public.garden_farm_json(uuid, uuid)
  from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 6) 공개 RPC — 모두 로그인한 본인 것만. 사람마다 garden_gardens 행을 잠가 차례로 처리(빠른 연타에도 두 번 적히지 않게)
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_farm(p_church text default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not exists (select 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid) then
    return json_build_object('ok', false, 'why', 'sync');
  end if;
  perform public.garden_farm_ensure(v_church, v_uid);
  return json_build_object('ok', true, 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 땅 사기: 내 땅에 붙은 칸(상하좌우) 하나
create or replace function public.garden_farm_buy(p_church text, p_x int, p_y int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_n int; v_price numeric; v_bal numeric;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  perform public.garden_farm_ensure(v_church, v_uid);
  if p_x is null or p_y is null or abs(p_x) > 4 or abs(p_y) > 4 then return json_build_object('ok', false, 'why', 'range'); end if;
  if exists (select 1 from public.garden_tiles t where t.church_id = v_church and t.user_id = v_uid and t.x = p_x and t.y = p_y) then
    return json_build_object('ok', false, 'why', 'owned');
  end if;
  if not exists (select 1 from public.garden_tiles t where t.church_id = v_church and t.user_id = v_uid
                  and abs(t.x - p_x) + abs(t.y - p_y) = 1) then
    return json_build_object('ok', false, 'why', 'far');
  end if;
  select count(*)::int into v_n from public.garden_tiles t where t.church_id = v_church and t.user_id = v_uid;
  v_price := public.garden_land_price(v_n - 9);
  v_bal := public.garden_balance(v_church, v_uid);
  if v_bal < v_price then return json_build_object('ok', false, 'why', 'talent', 'need', v_price, 'balance', v_bal); end if;
  insert into public.garden_tiles (church_id, user_id, x, y) values (v_church, v_uid, p_x, p_y);
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
  values (v_church, v_uid, 'land_buy', p_x || ',' || p_y, 0, -v_price, now(), 'platform', jsonb_build_object('price', v_price));
  perform public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'spent', v_price, 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 심기: 빈 칸(가운데 나무 자리 빼고)에 작물. 씨앗 값을 내고 지금부터 grow_sec 뒤에 익는다
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
  if t.crop is not null then return json_build_object('ok', false, 'why', 'busy'); end if;
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

-- 작물 열매 하나 따기 (p_n = 1..fruits). 다 따면 칸이 빈다
create or replace function public.garden_farm_pick(p_church text, p_x int, p_y int, p_n int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); t public.garden_tiles; c public.garden_crops; v_ins int; v_bal numeric;
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
  if p_n is null or p_n < 1 or p_n > c.fruits then return json_build_object('ok', false, 'why', 'range'); end if;
  if p_n = any (t.picked) then
    return json_build_object('ok', true, 'picked', false, 'farm', public.garden_farm_json(v_church, v_uid));
  end if;
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
  values (v_church, v_uid, 'crop_pick', p_x || ',' || p_y || '@' || floor(extract(epoch from t.planted_at) * 1000)::bigint || '#' || p_n,
          0, c.fruit_value, now(), 'platform', jsonb_build_object('crop', c.slug))
  on conflict (church_id, user_id, kind, ref) do nothing;
  get diagnostics v_ins = row_count;
  if array_length(array_append(t.picked, p_n::smallint), 1) >= c.fruits then
    update public.garden_tiles set crop = null, planted_at = null, ripe_at = null, picked = '{}'
     where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  else
    update public.garden_tiles set picked = array_append(picked, p_n::smallint)
     where church_id = v_church and user_id = v_uid and x = p_x and y = p_y;
  end if;
  v_bal := public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'picked', v_ins > 0, 'gain', case when v_ins > 0 then c.fruit_value else 0 end,
                           'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- 믿음 나무 열매 하나 따기 (p_n = 1..그날 열린 수)
create or replace function public.garden_pick_fruit(p_church text, p_n int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_per int; v_day date; v_tz text; v_ins int; v_bal numeric;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  select case when g.stage >= coalesce(array_length(s.stage_xp, 1), 6) then s.fruit_per_day else 0 end into v_per
    from public.garden_gardens g join public.garden_species s on s.slug = g.species
   where g.church_id = v_church and g.user_id = v_uid
     for update of g;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  if coalesce(v_per, 0) = 0 then return json_build_object('ok', false, 'why', 'no_fruit'); end if;
  if p_n is null or p_n < 1 or p_n > v_per then return json_build_object('ok', false, 'why', 'range'); end if;
  select c.timezone into v_tz from public.garden_churches c where c.id = v_church;
  v_day := (now() at time zone coalesce(v_tz, 'Asia/Seoul'))::date;
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
  values (v_church, v_uid, 'fruit_pick', v_day::text || '#' || p_n, 0, 0.1, now(), 'platform', jsonb_build_object('n', p_n))
  on conflict (church_id, user_id, kind, ref) do nothing;
  get diagnostics v_ins = row_count;
  v_bal := public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'picked', v_ins > 0, 'gain', case when v_ins > 0 then 0.1 else 0 end,
                           'talent_balance', v_bal, 'fruit', public.garden_fruit_json(v_church, v_uid));
end $$;

revoke all on function public.garden_farm(text), public.garden_farm_buy(text, int, int), public.garden_farm_plant(text, int, int, text),
  public.garden_farm_pick(text, int, int, int), public.garden_pick_fruit(text, int) from public, anon;
grant execute on function public.garden_farm(text), public.garden_farm_buy(text, int, int), public.garden_farm_plant(text, int, int, text),
  public.garden_farm_pick(text, int, int, int), public.garden_pick_fruit(text, int) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 7) 상태 JSON — 1단계 15) 절과 같고 끝에 'fruit'(믿음 나무 열매) 만 더했다
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
    'fruit', public.garden_fruit_json(c.id, p_uid))
    from public.garden_churches c where c.id = p_church
$$;
revoke all on function public.garden_state_json(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 8) 동기화(안쪽) — 1단계 16) 절과 같고 달란트 합(v_tal·v_new_t)만 소수로
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_sync_user(p_uid uuid, p_church uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.garden_churches; g public.garden_gardens;
  v_t0 timestamptz := clock_timestamp();       -- 이번 동기화에 적힌 행을 고르는 표식
  v_first boolean; v_xp int; v_tal numeric; v_stage_xp int[]; v_done int; v_harvest int;
  v_new json; v_new_n int; v_new_xp int; v_new_t numeric; v_locale text;
begin
  select * into c from public.garden_churches where id = p_church and is_active;
  if not found then return json_build_object('ok', false, 'why', 'church'); end if;

  -- 같은 사람 동시 호출(탭 둘·새로고침 연타)은 하나만 — 못 잡으면 현재 상태만 돌려준다
  if not pg_try_advisory_xact_lock(hashtext('garden:' || p_church::text), hashtext(p_uid::text)) then
    return json_build_object('ok', true, 'busy', true, 'new', '[]'::json, 'new_count', 0, 'new_xp', 0, 'new_talent', 0,
                             'state', public.garden_state_json(p_church, p_uid));
  end if;

  v_first := public.garden_ensure_member(p_church, p_uid);
  if v_first is null then return json_build_object('ok', false, 'why', 'member'); end if;

  -- 1) 후보 → 장부에 없는 것만 → 하루 상한(이미 적힌 건수까지 포함) → 지금 규칙 값으로 적는다
  with rules as (select * from public.garden_rules_eff(p_church) r where r.active),
  cand as (select * from public.garden_candidates(p_uid, p_church)),
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
  select p_church, p_uid, k.kind, k.ref, r.xp, r.talent, k.happened_at, k.source, v_t0
    from ranked k
    join rules r on r.kind = k.kind
    left join used u on u.kind = k.kind and u.day = k.day
   where r.daily_cap = 0 or k.rn <= r.daily_cap - coalesce(u.n, 0)
  on conflict (church_id, user_id, kind, ref) do nothing;

  -- 2) 합계 → 열매 거두기(자동, 넘친 경험치는 새 씨앗으로) → 스냅숏
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

  -- 3) 이번에 새로 적힌 것: 합계 + 최근 20건(첫 소급은 수백 건이므로 화면은 합계로 요약)
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

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
