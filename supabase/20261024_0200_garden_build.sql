-- ============================================================
--  신앙 정원 5단계 — 건축: 집 짓기(모델하우스 3채) · 교회 건축(성도들의 건축헌금) (2026-10-23 담임목사 지시)
--   "건축을 추가 해주세요. 로컬 ai로 3개의 집을 모델하우스로 만들어주세요. 교회도 3개를 만들어주세요.
--    교회는 성도들의 헌금으로 지어집니다." · "교회 건축은 목사님이 시작 할 수 있습니다."
--
--  [집] 스토어 '건재상'에 모델하우스 세 채(그림 images/garden/build/house-*.webp). 값은 경제 가격표(0010 의 settings.houses):
--       작은 집 대지 1칸·목재 200·품삯 50 / 한옥 대지 2칸·목재 600·품삯 150 / 큰 집 대지 4칸(2×2)·목재 1,500·품삯 400
--   · 내 땅의 대지 칸을 골라 짓는다 — 고른 칸이 꼭 맞는 직사각형(칸 수 = 대지 수)이어야 하고, 다른 집과 겹치지 않는다
--   · 목재는 장부 meta.wood 로 빠지고(garden_wood 합이 준다), 품삯은 달란트로 빠진다. 지은 집은 자산(목재 + 품삯)으로 센다
--   · 이름: 하우스(유리 온실, 20261024_0100)와 헷갈리지 않게 집은 'home' 이라 부른다
--  [교회] 작은 예배당(small) · 벽돌 교회(brick) · 큰 돌 교회(stone). 목사님(관리자)이 셋 가운데 골라 시작하고 한 번에 하나만 짓는다
--   · 목표 헌금 기본 5,000 · 20,000 · 60,000 달란트(settings.church_plans 로 바꾸고, 시작할 때 따로 정할 수 있다)
--   · 성도는 달란트로 건축헌금을 드린다(한 번에 1 달란트부터, 남은 목표보다 많이 드리면 남은 만큼만). 목표에 이르면 완공
--   · 공개는 모인 합계와 드린 사람 수만. 내가 드린 금액은 나만 본다(마 6:3)
--   · 목사님은 목표를 고치거나(이미 모인 것보다 낮추면 바로 완공) 건축을 멈출 수 있다 — 멈추면 드린 헌금을 모두 돌려준다
--  [표]   garden_homes(지은 집) · garden_church_builds(교회 건축, 교회마다 '짓는 중'은 하나)
--  [함수] 새: garden_home_plans · garden_church_plans · garden_homes_json · garden_church_json ·
--             garden_home · garden_home_build · garden_church · garden_church_offer ·
--             garden_admin_church_start · garden_admin_church_goal · garden_admin_church_stop
--         다시: garden_assets(0010 과 같고 'houses' = 지은 집의 목재 + 품삯)
--  [실행] 20261024_0010_garden_economy_build.sql 뒤에. SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전)
--         ※ 0010 을 다시 실행하면 garden_assets 가 집을 빼고 센다 → 그 뒤에는 이 파일도 다시 실행
--
--  [되돌리기(롤백)] — 표는 DROP 대신 RENAME, 장부는 그대로 둔다(달란트·목재 합은 장부로 센다)
--    drop function if exists public.garden_home_plans(uuid), public.garden_church_plans(uuid), public.garden_homes_json(uuid, uuid),
--      public.garden_church_json(uuid, uuid), public.garden_home(text), public.garden_home_build(text, text, jsonb),
--      public.garden_church(text), public.garden_church_offer(text, bigint, numeric),
--      public.garden_admin_church_start(text, text, numeric), public.garden_admin_church_goal(text, numeric),
--      public.garden_admin_church_stop(text);
--    alter table public.garden_homes rename to garden_homes_archived;
--    alter table public.garden_church_builds rename to garden_church_builds_archived;
--    garden_assets 는 20261024_0010_garden_economy_build.sql 의 3) 절을 다시 실행
--    (집 짓기·건축헌금으로 빠진 달란트·목재는 장부에 남는다 — 돌려주려면 장부에 + 줄을 새로 적는다)
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────
-- 1) 표 — 쓰기는 함수로만
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_homes (
  id         bigserial primary key,
  church_id  uuid not null references public.garden_churches (id),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind ~ '^[a-z][a-z0-9-]{1,30}$'),     -- settings.houses 의 key (small·hanok·big)
  x          smallint not null check (x between -4 and 4),              -- 집이 앉은 직사각형의 x·y 가 가장 작은 칸
  y          smallint not null check (y between -4 and 4),
  w          smallint not null default 1 check (w between 1 and 9),
  h          smallint not null default 1 check (h between 1 and 9),
  wood       integer not null default 0 check (wood >= 0),               -- 지을 때 든 목재
  wage       numeric(10,1) not null default 0 check (wage >= 0),         -- 지을 때 든 품삯(달란트)
  built_at   timestamptz not null default now()
);
create index if not exists garden_homes_owner on public.garden_homes (church_id, user_id);

create table if not exists public.garden_church_builds (
  id          bigserial primary key,
  church_id   uuid not null references public.garden_churches (id),
  kind        text not null check (kind ~ '^[a-z][a-z0-9-]{1,30}$'),    -- settings.church_plans 의 key (small·brick·stone)
  goal        numeric(12,1) not null check (goal > 0),
  raised      numeric(12,1) not null default 0 check (raised >= 0),     -- 모인 헌금(장부 church_offering 합과 같게 함수가 함께 고친다)
  status      text not null default 'open' check (status in ('open', 'done', 'stopped')),
  started_by  uuid references auth.users (id) on delete set null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create unique index if not exists garden_church_builds_one_open on public.garden_church_builds (church_id) where status = 'open';

alter table public.garden_homes enable row level security;
alter table public.garden_church_builds enable row level security;
drop policy if exists garden_homes_own on public.garden_homes;
create policy garden_homes_own on public.garden_homes for select using (user_id = auth.uid());
drop policy if exists garden_church_builds_read on public.garden_church_builds;
create policy garden_church_builds_read on public.garden_church_builds for select using (true);
revoke all on public.garden_homes, public.garden_church_builds from anon, authenticated;
grant select on public.garden_homes, public.garden_church_builds to authenticated;

-- 장부 종류 이름표(내부 종류 — 보상 설정 화면에는 안 나온다)
insert into public.garden_rules (church_id, kind, label, xp, talent, daily_cap, active, sort) values
  (null, 'home_build',      '{"ko":"집 짓기(품삯)","en":"House built"}',              0, 0, 0, true, 123),
  (null, 'church_offering', '{"ko":"교회 건축헌금","en":"Church building offering"}', 0, 0, 0, true, 124),
  (null, 'church_refund',   '{"ko":"건축헌금 돌려받음","en":"Offering returned"}',     0, 0, 0, true, 125)
on conflict (kind) where church_id is null do nothing;

-- ──────────────────────────────────────────────────────────────
-- 2) 도우미 (안쪽 — 직접 부르지 못하게)
-- ──────────────────────────────────────────────────────────────
-- 집 세 채(0010 garden_build_json 과 같은 기본값)
create or replace function public.garden_home_plans(p_church uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select c.settings->'houses' from public.garden_churches c where c.id = p_church),
    '[{"key":"small","dae":1,"wood":200,"wage":50},{"key":"hanok","dae":2,"wood":600,"wage":150},{"key":"big","dae":4,"wood":1500,"wage":400}]'::jsonb)
$$;

-- 교회 세 채와 기본 목표 헌금
create or replace function public.garden_church_plans(p_church uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select c.settings->'church_plans' from public.garden_churches c where c.id = p_church),
    '[{"key":"small","goal":5000},{"key":"brick","goal":20000},{"key":"stone","goal":60000}]'::jsonb)
$$;

create or replace function public.garden_homes_json(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', h.id, 'kind', h.kind, 'x', h.x, 'y', h.y, 'w', h.w, 'h', h.h,
                                             'wood', h.wood, 'wage', h.wage, 'built_at', h.built_at) order by h.built_at, h.id), '[]'::json)
    from public.garden_homes h where h.church_id = p_church and h.user_id = p_uid
$$;

-- 교회 건축: 짓는 중인 것(합계·드린 사람 수·내가 드린 것) · 다 지은 것(최근 것부터). 남의 금액은 내보내지 않는다
create or replace function public.garden_church_json(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'plans', public.garden_church_plans(p_church),
    'current', (select json_build_object('id', b.id, 'kind', b.kind, 'goal', b.goal, 'raised', b.raised, 'started_at', b.started_at,
                  'donors', (select count(distinct l.user_id) from public.garden_ledger l
                              where l.church_id = p_church and l.kind = 'church_offering' and l.meta->>'build' = b.id::text),
                  'mine', (select coalesce(-sum(l.talent), 0) from public.garden_ledger l
                            where l.church_id = p_church and l.user_id = p_uid and l.kind = 'church_offering' and l.meta->>'build' = b.id::text))
                  from public.garden_church_builds b where b.church_id = p_church and b.status = 'open'),
    'built', (select coalesce(json_agg(json_build_object('id', b.id, 'kind', b.kind, 'goal', b.goal, 'raised', b.raised,
                  'started_at', b.started_at, 'ended_at', b.ended_at,
                  'donors', (select count(distinct l.user_id) from public.garden_ledger l
                              where l.church_id = p_church and l.kind = 'church_offering' and l.meta->>'build' = b.id::text),
                  'mine', (select coalesce(-sum(l.talent), 0) from public.garden_ledger l
                            where l.church_id = p_church and l.user_id = p_uid and l.kind = 'church_offering' and l.meta->>'build' = b.id::text))
                  order by b.ended_at desc, b.id desc), '[]'::json)
                from public.garden_church_builds b where b.church_id = p_church and b.status = 'done'))
$$;

-- 내 자산 — 0010 과 같고 'houses' = 지은 집에 든 목재 + 품삯
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
                    public.garden_wood(p_church, p_uid)::numeric as wood,
                    coalesce((select sum(h.wood + h.wage) from public.garden_homes h where h.church_id = p_church and h.user_id = p_uid), 0) as houses)
  select json_build_object('talent', v.talent, 'land', v.land, 'plants', v.plants, 'wood', v.wood, 'houses', v.houses,
                           'total', round(v.talent + v.land + v.plants + v.wood + v.houses, 1))
    from v
$$;

revoke all on function public.garden_home_plans(uuid), public.garden_church_plans(uuid), public.garden_homes_json(uuid, uuid),
  public.garden_church_json(uuid, uuid), public.garden_assets(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 3) 공개 RPC — 집
-- ──────────────────────────────────────────────────────────────
-- 건재상(모델하우스): 세 채 값 · 내 집 · 목재 · 대지(집이 앉지 않은 칸) · 잔액
create or replace function public.garden_home(p_church text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  return json_build_object('ok', true,
    'plans', public.garden_home_plans(v_church),
    'homes', public.garden_homes_json(v_church, v_uid),
    'wood', public.garden_wood(v_church, v_uid),
    'balance', public.garden_balance(v_church, v_uid),
    'dae', (select count(*) from public.garden_tiles t where t.church_id = v_church and t.user_id = v_uid and t.land = 'dae'),
    'free_dae', (select count(*) from public.garden_tiles t where t.church_id = v_church and t.user_id = v_uid and t.land = 'dae'
                   and not exists (select 1 from public.garden_homes h where h.church_id = v_church and h.user_id = v_uid
                                     and t.x between h.x and h.x + h.w - 1 and t.y between h.y and h.y + h.h - 1)),
    'admin', public.garden_is_admin(v_church));
end $$;

-- 집 짓기: p_cells = [{"x":1,"y":2}, …] — 내 대지, 꼭 맞는 직사각형, 다른 집과 겹치지 않게. 목재와 품삯이 빠진다
create or replace function public.garden_home_build(p_church text, p_kind text, p_cells jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); p jsonb; v_n int; v_wood int; v_wage numeric; e jsonb; vx int; vy int;
        v_cells jsonb := '[]'::jsonb; t public.garden_tiles; x0 int; x1 int; y0 int; y1 int; v_have int; v_bal numeric; v_id bigint;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select x into p from jsonb_array_elements(public.garden_home_plans(v_church)) x where x->>'key' = p_kind limit 1;
  if p is null then return json_build_object('ok', false, 'why', 'kind'); end if;
  v_n := greatest(coalesce((p->>'dae')::int, 1), 1);
  v_wood := greatest(coalesce((p->>'wood')::int, 0), 0);
  v_wage := greatest(coalesce((p->>'wage')::numeric, 0), 0);
  if p_cells is null or jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) = 0 then return json_build_object('ok', false, 'why', 'empty'); end if;
  if jsonb_array_length(p_cells) > 81 then return json_build_object('ok', false, 'why', 'range'); end if;
  for e in select * from jsonb_array_elements(p_cells) loop
    vx := (e->>'x')::int; vy := (e->>'y')::int;
    if vx is null or vy is null or abs(vx) > 4 or abs(vy) > 4 then return json_build_object('ok', false, 'why', 'range'); end if;
    if vx = 0 and vy = 0 then return json_build_object('ok', false, 'why', 'tree'); end if;
    select * into t from public.garden_tiles g where g.church_id = v_church and g.user_id = v_uid and g.x = vx and g.y = vy;
    if not found then return json_build_object('ok', false, 'why', 'not_owned', 'x', vx, 'y', vy); end if;
    if t.land <> 'dae' then return json_build_object('ok', false, 'why', 'not_dae', 'x', vx, 'y', vy); end if;
    if exists (select 1 from public.garden_homes h where h.church_id = v_church and h.user_id = v_uid
                and vx between h.x and h.x + h.w - 1 and vy between h.y and h.y + h.h - 1) then
      return json_build_object('ok', false, 'why', 'taken', 'x', vx, 'y', vy);
    end if;
    if not v_cells @> jsonb_build_array(jsonb_build_object('x', vx, 'y', vy)) then
      v_cells := v_cells || jsonb_build_array(jsonb_build_object('x', vx, 'y', vy));
    end if;
  end loop;
  if jsonb_array_length(v_cells) <> v_n then return json_build_object('ok', false, 'why', 'size', 'need', v_n); end if;
  select min((c->>'x')::int), max((c->>'x')::int), min((c->>'y')::int), max((c->>'y')::int)
    into x0, x1, y0, y1 from jsonb_array_elements(v_cells) c;
  if (x1 - x0 + 1) * (y1 - y0 + 1) <> v_n then return json_build_object('ok', false, 'why', 'shape', 'need', v_n); end if;
  v_have := public.garden_wood(v_church, v_uid);
  if v_have < v_wood then return json_build_object('ok', false, 'why', 'wood', 'need', v_wood, 'have', v_have); end if;
  v_bal := public.garden_balance(v_church, v_uid);
  if v_bal < v_wage then return json_build_object('ok', false, 'why', 'talent', 'need', v_wage, 'balance', v_bal); end if;
  insert into public.garden_homes (church_id, user_id, kind, x, y, w, h, wood, wage)
  values (v_church, v_uid, p_kind, x0, y0, x1 - x0 + 1, y1 - y0 + 1, v_wood, v_wage) returning id into v_id;
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
  values (v_church, v_uid, 'home_build', 'home#' || v_id, 0, -v_wage, now(), 'platform',
          jsonb_build_object('wood', -v_wood, 'home', v_id, 'item', p_kind, 'wage', v_wage, 'x', x0, 'y', y0));
  v_bal := public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'id', v_id, 'kind', p_kind, 'spent', v_wage, 'wood', v_wood,
    'wood_total', public.garden_wood(v_church, v_uid), 'balance', v_bal,
    'homes', public.garden_homes_json(v_church, v_uid), 'farm', public.garden_farm_json(v_church, v_uid));
end $$;

-- ──────────────────────────────────────────────────────────────
-- 4) 공개 RPC — 교회 건축
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_church(p_church text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  return (public.garden_church_json(v_church, v_uid)::jsonb
          || jsonb_build_object('ok', true, 'balance', public.garden_balance(v_church, v_uid), 'admin', public.garden_is_admin(v_church)))::json;
end $$;

-- 건축헌금: 짓는 중인 건축(p_build)에 p_amount 달란트(1 이상). 남은 목표보다 많으면 남은 만큼만 받고, 목표에 이르면 완공
create or replace function public.garden_church_offer(p_church text, p_build bigint, p_amount numeric) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); b public.garden_church_builds; v_amt numeric; v_give numeric; v_bal numeric;
        v_done boolean; v_now timestamptz := clock_timestamp();
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  perform 1 from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  v_amt := round(p_amount, 1);
  if v_amt is null or v_amt < 1 or v_amt > 1000000 then return json_build_object('ok', false, 'why', 'range'); end if;
  select * into b from public.garden_church_builds where id = p_build and church_id = v_church for update;
  if not found or b.status <> 'open' then return json_build_object('ok', false, 'why', 'closed'); end if;
  v_give := least(v_amt, b.goal - b.raised);
  if v_give <= 0 then return json_build_object('ok', false, 'why', 'closed'); end if;
  v_bal := public.garden_balance(v_church, v_uid);
  if v_bal < v_give then return json_build_object('ok', false, 'why', 'talent', 'need', v_give, 'balance', v_bal); end if;
  insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
  values (v_church, v_uid, 'church_offering', 'cb' || b.id || '@' || floor(extract(epoch from v_now) * 1000000)::bigint, 0, -v_give, v_now, 'platform',
          jsonb_build_object('build', b.id, 'item', b.kind, 'amount', v_give));
  v_done := b.raised + v_give >= b.goal;
  update public.garden_church_builds
     set raised = raised + v_give,
         status = case when v_done then 'done' else status end,
         ended_at = case when v_done then now() else ended_at end
   where id = b.id;
  v_bal := public.garden_refresh_balance(v_church, v_uid);
  return json_build_object('ok', true, 'given', v_give, 'capped', v_give < v_amt, 'done', v_done, 'balance', v_bal,
    'church', public.garden_church_json(v_church, v_uid));
end $$;

-- 관리자: 교회 건축 시작 — 셋 가운데 하나, 목표는 p_goal(없으면 기본값). 짓는 중인 것이 있으면 시작하지 못한다
create or replace function public.garden_admin_church_start(p_church text, p_kind text, p_goal numeric default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; p jsonb; v_goal numeric; v_id bigint;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  select x into p from jsonb_array_elements(public.garden_church_plans(v_church)) x where x->>'key' = p_kind limit 1;
  if p is null then return json_build_object('ok', false, 'why', 'kind'); end if;
  v_goal := round(coalesce(p_goal, (p->>'goal')::numeric, 5000), 1);
  if v_goal < 1 or v_goal > 10000000 then return json_build_object('ok', false, 'why', 'range'); end if;
  perform pg_advisory_xact_lock(hashtext('garden_church_build'), hashtext(v_church::text));
  if exists (select 1 from public.garden_church_builds b where b.church_id = v_church and b.status = 'open') then
    return json_build_object('ok', false, 'why', 'open');
  end if;
  insert into public.garden_church_builds (church_id, kind, goal, started_by) values (v_church, p_kind, v_goal, auth.uid()) returning id into v_id;
  return (public.garden_church_json(v_church, auth.uid())::jsonb || jsonb_build_object('ok', true, 'id', v_id))::json;
end $$;

-- 관리자: 짓는 중인 건축의 목표 고치기 — 이미 모인 것 이하로 낮추면 바로 완공
create or replace function public.garden_admin_church_goal(p_church text, p_goal numeric) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; b public.garden_church_builds; v_goal numeric;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  v_goal := round(p_goal, 1);
  if v_goal is null or v_goal < 1 or v_goal > 10000000 then return json_build_object('ok', false, 'why', 'range'); end if;
  select * into b from public.garden_church_builds where church_id = v_church and status = 'open' for update;
  if not found then return json_build_object('ok', false, 'why', 'closed'); end if;
  update public.garden_church_builds
     set goal = v_goal,
         status = case when raised >= v_goal then 'done' else status end,
         ended_at = case when raised >= v_goal then now() else ended_at end
   where id = b.id;
  return (public.garden_church_json(v_church, auth.uid())::jsonb || jsonb_build_object('ok', true, 'done', b.raised >= v_goal))::json;
end $$;

-- 관리자: 건축 멈추기 — 드린 헌금을 사람마다 모두 돌려준다(장부 church_refund). 잔액 숫자(캐시)는 다음 동기화 때 고쳐진다
create or replace function public.garden_admin_church_stop(p_church text) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; b public.garden_church_builds; v_n int; v_total numeric;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  select * into b from public.garden_church_builds where church_id = v_church and status = 'open' for update;
  if not found then return json_build_object('ok', false, 'why', 'closed'); end if;
  with s as (select l.user_id, -sum(l.talent) as amt from public.garden_ledger l
              where l.church_id = v_church and l.kind = 'church_offering' and l.meta->>'build' = b.id::text
              group by l.user_id having -sum(l.talent) > 0),
       ins as (insert into public.garden_ledger (church_id, user_id, kind, ref, xp, talent, at, source, meta)
               select v_church, s.user_id, 'church_refund', 'cb' || b.id, 0, s.amt, now(), 'platform', jsonb_build_object('build', b.id, 'item', b.kind)
                 from s
               on conflict (church_id, user_id, kind, ref) do nothing
               returning talent)
  select count(*)::int, coalesce(sum(talent), 0) into v_n, v_total from ins;
  update public.garden_church_builds set status = 'stopped', ended_at = now() where id = b.id;
  return (public.garden_church_json(v_church, auth.uid())::jsonb || jsonb_build_object('ok', true, 'refunded', v_n, 'total', v_total))::json;
end $$;

revoke all on function public.garden_home(text), public.garden_home_build(text, text, jsonb), public.garden_church(text),
  public.garden_church_offer(text, bigint, numeric), public.garden_admin_church_start(text, text, numeric),
  public.garden_admin_church_goal(text, numeric), public.garden_admin_church_stop(text) from public, anon;
grant execute on function public.garden_home(text), public.garden_home_build(text, text, jsonb), public.garden_church(text),
  public.garden_church_offer(text, bigint, numeric), public.garden_admin_church_start(text, text, numeric),
  public.garden_admin_church_goal(text, numeric), public.garden_admin_church_stop(text) to authenticated;

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
