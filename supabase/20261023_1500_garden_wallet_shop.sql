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
--   · 목회 행정 > 설정에서 관리자가 보상(달란트·XP·하루 한도·켜기)과 주일학교 QT·필사 인증 달란트, 땅 값, 하루치 마음을 정한다
--     (교회별 줄 garden_rules(church_id=교회)로 저장 — 플랫폼 기본값은 그대로 둔다. 바꾼 값은 그 뒤 동기화부터 적용, 지난 장부는 그대로)
--   · 주일학교 인증(QT·필사·미션, ss_submissions): 오늘의 할 일에 안 한 인증을 보여 주고(어린이 본인·보호자), 인증하면 마음(XP)이 쌓인다
--     (달란트는 지금처럼 ss_talents 로 어린이에게 — 마이월렛에는 주일학교 달란트로 들어온다). 보호자도 자녀 인증을 함께하면 마음이 쌓인다
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
--      public.garden_xp_since(uuid, uuid, timestamptz), public.garden_xp_day(uuid), public.garden_ss_kids(uuid), public.garden_ss_todo(uuid, uuid),
--      public.garden_admin_rules(text), public.garden_admin_set_rule(text, text, numeric, int, int, boolean), public.garden_admin_set_ss_talent(text, int, int),
--      public.garden_admin_set_xp_day(text, numeric);
--    교회별로 바꾼 보상 줄은 지우지 않고 플랫폼 값으로 되돌린다: update garden_rules r set xp = b.xp, talent = b.talent, daily_cap = b.daily_cap, active = b.active
--      from garden_rules b where r.church_id is not null and b.church_id is null and b.kind = r.kind;
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
  (null, 'harvest',      '{"ko":"수확","en":"Harvest"}',                       0, 0, 0, true, 116),
  -- 주일학교 인증: 마음(XP)만 — 달란트는 주일학교 항목값으로 ss_talents 에 따로 들어온다
  (null, 'ss_qt',        '{"ko":"주일학교 QT 인증","en":"Sunday school QT"}',  10, 0, 0, true, 87),
  (null, 'ss_pilsa',     '{"ko":"주일학교 필사 인증","en":"Sunday school copying"}', 15, 0, 0, true, 88),
  (null, 'ss_mission',   '{"ko":"주일학교 미션 인증","en":"Sunday school mission"}', 15, 0, 0, true, 89)
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
-- 주일학교 인증을 볼 어린이: 내 계정의 교적이 학생이면 나(self), 보호자면 같은 세대의 학생 자녀 (ss_my_children 과 같은 셈, 계정을 인자로)
create or replace function public.garden_ss_kids(p_uid uuid)
returns table (member_key text, name text, self boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if to_regclass('public.member_links') is null or to_regclass('public.gyojeok') is null
     or to_regprocedure('public.ss_student_roles()') is null then return; end if;
  return query execute $q$
    with mykeys as (
      select ml.member_key as k from public.member_links ml where ml.user_id = $1 and coalesce(ml.member_key, '') <> ''
      union select ml.spouse_key from public.member_links ml where ml.user_id = $1 and coalesce(ml.spouse_key, '') <> ''),
    me as (select g.head, g.name from public.gyojeok g where g.member_key in (select k from mykeys) order by g.id limit 1),
    myhead as (select coalesce(nullif((select head from me), ''), (select name from me)) as h)
    select g.member_key::text, g.name::text, true from public.gyojeok g
     where g.member_key in (select k from mykeys) and g.ss_role = any (public.ss_student_roles())
    union all
    select g.member_key::text, g.name::text, false from public.gyojeok g
     where coalesce(nullif(g.head, ''), g.name) = (select h from myhead) and g.ss_role = any (public.ss_student_roles())
       and coalesce(g.member_key, '') <> '' and g.member_key not in (select k from mykeys)
       -- 학생 본인 계정이면 형제자매는 넣지 않는다(자기 인증만)
       and not exists (select 1 from public.gyojeok g2 where g2.member_key in (select k from mykeys) and g2.ss_role = any (public.ss_student_roles()))$q$ using p_uid;
end $$;

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
  -- 주일학교 인증: 나(어린이) 또는 내 자녀의 QT·필사·미션 인증 한 건 = 마음(XP) 한 줄
  if to_regclass('public.ss_submissions') is not null then
    return query execute
      'select case s.stype when ''QT'' then ''ss_qt'' when ''필사'' then ''ss_pilsa'' else ''ss_mission'' end::text,
              ''ss'' || s.id::text, ((s.sub_date + time ''12:00'') at time zone $2), ''woonpyung_adapter''::text, null::numeric
         from public.ss_submissions s
        where s.stype in (''QT'', ''필사'', ''미션'') and s.member_key in (select k.member_key from public.garden_ss_kids($1) k)'
      using p_uid, c.timezone;
  end if;
  return;
end $$;

-- 오늘의 할 일 — 주일학교 인증: 어린이마다 오늘 QT·이번 주 필사·이번 주 미션을 했는지, 달란트(주일학교 항목값·미션 값)
-- (대시보드 인증 카드와 같은 셈: QT 하루 한 번, 필사 한 주 한 번(주일 시작), 미션은 이번 주 미션 — 연속미션은 하루 한 장씩 daily_days 일)
create or replace function public.garden_ss_todo(p_church uuid, p_uid uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_day date; v_week date; v_m json; v_qt int; v_pil int; v_out json;
begin
  if to_regclass('public.ss_submissions') is null then return null; end if;
  select coalesce(c.timezone, 'Asia/Seoul') into v_tz from public.garden_churches c where c.id = p_church;
  v_day := (now() at time zone coalesce(v_tz, 'Asia/Seoul'))::date;
  v_week := v_day - extract(dow from v_day)::int;
  if to_regprocedure('public.ss_current_mission()') is not null then execute 'select public.ss_current_mission()' into v_m; end if;
  if to_regclass('public.ss_talent_items') is not null then
    execute 'select (select amount from public.ss_talent_items where name = ''QT 인증'' order by id limit 1),
                    (select amount from public.ss_talent_items where name = ''필사 인증'' order by id limit 1)' into v_qt, v_pil;
  end if;
  execute $q$
    select coalesce(json_agg(json_build_object('key', k.member_key, 'name', k.name, 'self', k.self,
             'qt', exists (select 1 from public.ss_submissions s where s.member_key = k.member_key and s.stype = 'QT' and s.sub_date = $1),
             'pilsa', exists (select 1 from public.ss_submissions s where s.member_key = k.member_key and s.stype = '필사' and s.sub_date >= $2),
             'mission_n', (select count(*) from public.ss_submissions s where s.member_key = k.member_key and s.stype = '미션'
                             and $3 is not null and s.mission_id::text = ($3->>'id')),
             'mission_today', exists (select 1 from public.ss_submissions s where s.member_key = k.member_key and s.stype = '미션'
                             and $3 is not null and s.mission_id::text = ($3->>'id') and s.sub_date = $1))
             order by k.self desc, k.name), '[]'::json)
      from public.garden_ss_kids($4) k$q$
    into v_out using v_day, v_week, v_m, p_uid;
  if json_array_length(v_out) = 0 then return null; end if;
  return json_build_object('kids', v_out, 'qt_talent', v_qt, 'pilsa_talent', v_pil,
    'mission', case when v_m is null then null else json_build_object('id', v_m->>'id', 'title', v_m->>'title',
                 'talent', (v_m->>'amount')::numeric, 'daily_days', coalesce((v_m->>'daily_days')::int, 0)) end);
end $$;

revoke all on function public.garden_land_prices(uuid), public.garden_inventory_json(uuid, uuid), public.garden_candidates_v2(uuid, uuid),
  public.garden_ss_kids(uuid), public.garden_ss_todo(uuid, uuid) from public, anon, authenticated;

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

-- 관리자(목회 행정 > 설정): 보상 규칙 · 주일학교 인증 달란트 · 땅 값 · 하루치 마음
create or replace function public.garden_admin_rules(p_church text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid; v_qt int; v_pil int; v_ss boolean := false;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  if to_regclass('public.ss_talent_items') is not null then
    v_ss := true;
    execute 'select (select amount from public.ss_talent_items where name = ''QT 인증'' order by id limit 1),
                    (select amount from public.ss_talent_items where name = ''필사 인증'' order by id limit 1)' into v_qt, v_pil;
  end if;
  return json_build_object('ok', true,
    -- 성도가 받는 보상만(내부 장부 종류·들르기·주일학교 달란트 옮김은 빼고)
    'rules', (select coalesce(json_agg(json_build_object('kind', e.kind, 'label', e.label, 'xp', e.xp, 'talent', e.talent,
                 'daily_cap', e.daily_cap, 'active', e.active,
                 'custom', exists (select 1 from public.garden_rules r where r.church_id = v_church and r.kind = e.kind),
                 'base', (select json_build_object('xp', b.xp, 'talent', b.talent, 'daily_cap', b.daily_cap, 'active', b.active)
                            from public.garden_rules b where b.church_id is null and b.kind = e.kind)) order by e.sort), '[]'::json)
                from public.garden_rules_eff(v_church) e where e.sort < 100 and e.kind not in ('login', 'ss_talent')),
    'prices', public.garden_land_prices(v_church),
    'xp_day', public.garden_xp_day(v_church),
    'ss', case when v_ss then json_build_object('qt', v_qt, 'pilsa', v_pil) else null end);
end $$;

-- 보상 한 줄 정하기 — 교회 줄로 넣거나 고친다(플랫폼 기본 줄은 건드리지 않는다)
create or replace function public.garden_admin_set_rule(p_church text, p_kind text, p_talent numeric, p_xp int, p_daily_cap int, p_active boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare v_church uuid; b public.garden_rules;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  select * into b from public.garden_rules where church_id is null and kind = p_kind;
  if not found or b.sort >= 100 or p_kind in ('login', 'ss_talent') then return json_build_object('ok', false, 'why', 'kind'); end if;
  if p_talent is null or p_xp is null or p_daily_cap is null or p_talent < 0 or p_talent > 1000 or p_xp < 0 or p_xp > 1000
     or p_daily_cap < 0 or p_daily_cap > 100 then return json_build_object('ok', false, 'why', 'range'); end if;
  insert into public.garden_rules (church_id, kind, label, xp, talent, daily_cap, active, sort)
  values (v_church, p_kind, b.label, p_xp, round(p_talent)::int, p_daily_cap, coalesce(p_active, true), b.sort)
  on conflict (church_id, kind) where church_id is not null
  do update set xp = excluded.xp, talent = excluded.talent, daily_cap = excluded.daily_cap, active = excluded.active, updated_at = now();
  return json_build_object('ok', true, 'kind', p_kind, 'talent', round(p_talent)::int, 'xp', p_xp, 'daily_cap', p_daily_cap, 'active', coalesce(p_active, true));
end $$;

-- 주일학교 QT·필사 인증 달란트(주일학교 지급 항목 'QT 인증'·'필사 인증' 값 — 대시보드 교사 화면과 같은 값)
create or replace function public.garden_admin_set_ss_talent(p_church text, p_qt int, p_pilsa int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  if to_regclass('public.ss_talent_items') is null then return json_build_object('ok', false, 'why', 'no_ss'); end if;
  if p_qt is null or p_pilsa is null or p_qt < 0 or p_qt > 100 or p_pilsa < 0 or p_pilsa > 100 then return json_build_object('ok', false, 'why', 'range'); end if;
  execute 'update public.ss_talent_items set amount = $1 where name = ''QT 인증''' using p_qt;
  execute 'insert into public.ss_talent_items (name, amount) select ''QT 인증'', $1 where not exists (select 1 from public.ss_talent_items where name = ''QT 인증'')' using p_qt;
  execute 'update public.ss_talent_items set amount = $1 where name = ''필사 인증''' using p_pilsa;
  execute 'insert into public.ss_talent_items (name, amount) select ''필사 인증'', $1 where not exists (select 1 from public.ss_talent_items where name = ''필사 인증'')' using p_pilsa;
  return json_build_object('ok', true, 'qt', p_qt, 'pilsa', p_pilsa);
end $$;

-- 하루치 마음(XP): 이만큼 쌓이면 심은 것이 실제 하루만큼 자란다(기본 10)
create or replace function public.garden_admin_set_xp_day(p_church text, p_n numeric) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_is_admin(v_church) then return json_build_object('ok', false, 'why', 'admin'); end if;
  if p_n is null or p_n < 1 or p_n > 1000 then return json_build_object('ok', false, 'why', 'range'); end if;
  update public.garden_churches set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{xp_day}', to_jsonb(round(p_n, 1))) where id = v_church;
  return json_build_object('ok', true, 'xp_day', round(p_n, 1));
end $$;

revoke all on function public.garden_admin_rules(text), public.garden_admin_set_rule(text, text, numeric, int, int, boolean),
  public.garden_admin_set_ss_talent(text, int, int), public.garden_admin_set_xp_day(text, numeric) from public, anon;
grant execute on function public.garden_admin_rules(text), public.garden_admin_set_rule(text, text, numeric, int, int, boolean),
  public.garden_admin_set_ss_talent(text, int, int), public.garden_admin_set_xp_day(text, numeric) to authenticated;

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
    'ss', public.garden_ss_todo(c.id, p_uid),
    'wallet', true)
    from public.garden_churches c where c.id = p_church
$$;
revoke all on function public.garden_state_json(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 9) 꽃집 품목 (값·사실은 아래 표 — 출처는 specs.src)  ※ 품목 자료는 이 절에 넣는다
-- ──────────────────────────────────────────────────────────────
-- 품목 시작 (scratchpad build_shop.py 로 만든 줄 — 값(price)은 다시 실행해도 덮어쓰지 않는다: 관리자가 바꾼 값 지킴)
insert into public.garden_shop_items (slug, category, name, price, fit, specs, model, sort) values
  ('cherry-tomato', 'food', '{"ko":"방울토마토","en":"Cherry tomato"}'::jsonb, 5, 'good', '{"plant":"모종, 4월 하순","first":"심고 약 2개월 (6월 하순부터)","harvest":"6월 하순~9월 중순","water":"2~3일 간격으로 알맞게, 조금씩 여러 번 (이 정원에서는 비가 2일 없으면 물 주기 알림)","sun":"양지 — 해가 모자라면 꽃이 떨어지고 모양이 나빠짐","cold":"밤 13℃ 아래면 열매가 떨어지거나 터짐, 10℃ 아래 생육 장해, 서리에 죽음","drought":"열매 달린 뒤 마르면 배꼽썩음","rain":"수확기에 물이 많으면 열매가 터지고 단맛이 줄어듦 (장마 주의)","note":"장마철에는 자주 따 주기","src":"농촌진흥청 보도자료 2017-04-03 텃밭 모종 시기 · 농촌진흥청 웹진 2020-03 텃밭 토마토 · 농사로 토마토 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30646"}'::jsonb, '{"type":"annual","plant_months":[4,5],"first_days":60,"window_days":80,"per_day":3,"value":0.1,"water_every":2,"drought_days":8,"wet":"mid","frost_kill":true}'::jsonb, 10),
  ('tomato', 'food', '{"ko":"토마토","en":"Tomato"}'::jsonb, 5, 'good', '{"plant":"모종, 4월 하순","first":"심고 약 2개월 (6월 하순부터)","harvest":"6월 하순~9월 중순","water":"2~3일 간격으로 알맞게 (이 정원에서는 비가 2일 없으면 물 주기 알림)","sun":"양지","cold":"밤 13℃ 아래면 열매 떨어짐·터짐, 서리에 죽음","drought":"열매 달린 뒤 마르면 배꼽썩음","rain":"고온다습·장마에 열매가 터짐","note":"큰 열매는 지주를 세워 묶어 줌","src":"농촌진흥청 웹진 2020-03 텃밭 토마토 · 농사로 토마토 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30646"}'::jsonb, '{"type":"annual","plant_months":[4,5],"first_days":60,"window_days":80,"per_day":2,"value":0.1,"water_every":2,"drought_days":8,"wet":"mid","frost_kill":true}'::jsonb, 20),
  ('pepper', 'food', '{"ko":"고추","en":"Chili pepper"}'::jsonb, 5, 'good', '{"plant":"모종(본잎 10~13장), 5월 상순~중순","first":"풋고추는 꽃 핀 뒤 15~20일, 붉은 고추는 45~50일","harvest":"풋고추 6월부터, 붉은 고추 7~9월","water":"심은 직후 2~3일에 한 번, 뿌리 내리면 일주일에 한 번 흠뻑 (이 정원에서는 비가 7일 없으면 물 주기 알림)","sun":"양지","cold":"가을 저온에 냉해, 서리에 죽음","drought":"마르면 꽃과 열매가 떨어짐","rain":"장마에 습해·역병이 많음, 큰비·태풍에 쓰러짐","note":"장마철 역병·탄저병 주의","src":"농사로 고추 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30600 · 농사로 고추 수확적기 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=28190"}'::jsonb, '{"type":"annual","plant_months":[5],"first_days":35,"window_days":110,"per_day":3,"value":0.1,"water_every":7,"drought_days":12,"wet":"mid","frost_kill":true}'::jsonb, 30),
  ('cucumber', 'food', '{"ko":"오이","en":"Cucumber"}'::jsonb, 5, 'good', '{"plant":"모종, 4월 하순 (노지 5월 상~하순)","first":"심고 약 30일","harvest":"노지 6~7월","water":"물을 좋아함 — 2~8일 간격(평균 4일), 거둘 때는 더 자주 (이 정원에서는 비가 4일 없으면 물 주기 알림)","sun":"확인 못 함","cold":"노지는 더위·습기에 강한 품종, 서리에 죽음","drought":"마르면 모양이 휘고 늦게 큼","rain":"물이 너무 많으면 습해","note":"덩굴손이 감을 지주·망을 세워 줌","src":"농촌진흥청 보도자료 2017-04-03 · 농사로 오이 작형 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=27913 · 오이 수확 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=27945 · 오이 물관리 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=27927"}'::jsonb, '{"type":"annual","plant_months":[4,5],"first_days":30,"window_days":60,"per_day":2,"value":0.1,"water_every":4,"drought_days":7,"wet":"mid","frost_kill":true}'::jsonb, 40),
  ('lettuce', 'food', '{"ko":"상추","en":"Lettuce"}'::jsonb, 5, 'good', '{"plant":"씨앗·모종, 4월 상·중순 (봄·가을 재배, 한여름은 꽃대가 올라옴)","first":"심고 25~30일","harvest":"약 2개월, 겉잎부터","water":"봄·가을 3~5일, 여름 2~3일 간격으로 흙이 마르지 않게 (이 정원에서는 비가 3일 없으면 물 주기 알림)","sun":"양지~반그늘","cold":"혹한에 얼어 상함","drought":"마르면 잘 못 자람","rain":"장마·고온·큰비에 꽃대가 올라오고 잠김·병해충","note":"겉잎부터 따면 오래 거둠","src":"농촌진흥청 웹진 2020-06 텃밭 상추 · 농사로 상추 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30624"}'::jsonb, '{"type":"annual","plant_months":[3,4,5,8,9],"first_days":28,"window_days":60,"per_day":4,"value":0.1,"water_every":3,"drought_days":6,"wet":"mid","min_temp":-5}'::jsonb, 50),
  ('potato', 'food', '{"ko":"감자","en":"Potato"}'::jsonb, 5, 'good', '{"plant":"씨감자(잘라서 싹 틔운 뒤), 3월 하순~4월 상순","first":"심고 약 80~95일 (싹은 20~30일 뒤)","harvest":"6월 하순~7월 상순 한 번","water":"모래땅 3~4일, 참흙 일주일에 한 번 흠뻑. 잎이 누래지면 건조하게 (이 정원에서는 비가 7일 없으면 물 주기 알림)","sun":"해를 많이 받는 것이 좋음","cold":"늦서리에 새싹이 갈색으로 죽음, 서늘한 작물(14~23℃)","drought":"싹 날 때~알이 클 때 가뭄 피해","rain":"물에 잠기면 아주 약함 — 수확기 24시간 잠기면 썩기 시작","note":"장마 전, 비 없는 날 캐기","src":"농촌진흥청 웹진 2021-03 텃밭 감자 · 농사로 감자 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30699"}'::jsonb, '{"type":"annual","plant_months":[3,4],"first_days":90,"window_days":20,"per_day":5,"value":0.1,"water_every":7,"drought_days":14,"wet":"low","frost_kill":true,"emerge_days":25}'::jsonb, 60),
  ('sweet-potato', 'food', '{"ko":"고구마","en":"Sweet potato"}'::jsonb, 5, 'good', '{"plant":"순(4~5마디 묻기), 5월 중순~하순 (6월 하순 넘으면 수확이 줄어듦)","first":"심고 110~120일","harvest":"9월 중순~10월 중순 (서리 전)","water":"처음엔 넉넉히, 가뭄이 이어지면 일주일에 1~2번 (이 정원에서는 비가 7일 없으면 물 주기 알림)","sun":"확인 못 함","cold":"서리 전에 캐기, 12℃ 아래 저장하면 썩음","drought":"심을 때 가물면 비 온 뒤 심기","rain":"습해 — 물 빠질 고랑 정비","note":"캐서 며칠 말리면 단맛이 오름","src":"농촌진흥청 보도자료 2016-04-25 고구마 · 농사로 고구마 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30701"}'::jsonb, '{"type":"annual","plant_months":[5,6],"first_days":115,"window_days":30,"per_day":4,"value":0.1,"water_every":7,"drought_days":14,"wet":"mid","frost_kill":true}'::jsonb, 70),
  ('corn', 'food', '{"ko":"옥수수","en":"Corn"}'::jsonb, 5, 'good', '{"plant":"씨앗, 4월 중순 직접 뿌림 (평균기온 10~15℃ 넘을 때)","first":"약 100일 (찰옥수수는 수염이 나온 뒤 20~25일)","harvest":"7월 하순~8월 상순, 적기가 짧음","water":"가물 때 이랑 사이에 흠뻑 (이 정원에서는 비가 7일 없으면 물 주기 알림)","sun":"확인 못 함","cold":"10℃ 아래 멈춤, −1.7℃ 아래 얼어 죽음","drought":"가물면 물 주기 필요","rain":"물 안 빠지는 진흙밭은 맞지 않음, 꽃가루 날릴 때 35℃ 넘으면 알이 덜 참","note":"여러 줄로 모아 심어야 알이 잘 참","src":"농촌진흥청 웹진 2021-05 옥수수 · 농사로 옥수수 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30709"}'::jsonb, '{"type":"annual","plant_months":[4,5],"first_days":100,"window_days":14,"per_day":2,"value":0.1,"water_every":7,"drought_days":12,"wet":"mid","frost_kill":true,"emerge_days":10}'::jsonb, 80),
  ('eggplant', 'food', '{"ko":"가지","en":"Eggplant"}'::jsonb, 5, 'good', '{"plant":"모종, 5월 상순","first":"꽃 핀 뒤 10~20일 (7월부터)","harvest":"7월~10월 상순","water":"비가 없으면 4~5일 간격 (이 정원에서는 비가 4일 없으면 물 주기 알림)","sun":"햇빛을 좋아함","cold":"17℃ 아래 더디고 8℃ 아래 저온 피해, 서리에 죽음","drought":"확인 못 함","rain":"물이 많으면 뿌리가 썩고 병 — 장마 전 물길 정비","src":"농촌진흥청 웹진 2020-02 가지 · 농사로 가지 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30770"}'::jsonb, '{"type":"annual","plant_months":[5],"first_days":55,"window_days":90,"per_day":2,"value":0.1,"water_every":4,"drought_days":10,"wet":"mid","frost_kill":true}'::jsonb, 90),
  ('apple', 'tree', '{"ko":"사과나무","en":"Apple"}'::jsonb, 50, 'good', '{"plant":"접목 묘목, 봄 3월 중·하순 (가을 심기는 동해 위험)","first":"심고 3년 (밀식 3년생 묘는 심은 해에도 몇 개)","harvest":"8월 하순~11월 상순 (품종별)","bloom":"4월 중순~5월 상순","water":"31℃ 넘는 더위에 물 주기 (햇볕 데임 방지) (이 정원에서는 비가 10일 없으면 물 주기 알림)","cold":"−30~−35℃까지 견딤","rain":"과습하면 생리장해 — 이랑·배수","pollen":"다른 품종 수분수가 필요 (꽃사과도 씀)","height":"4.5~9m (왜성 대목은 낮음)","note":"화성 온석동에 밀식 사과 농가가 있음. 우정읍은 사과 적지(연평균 8~11℃)보다 따뜻해 빨간 색이 덜 들 수 있음. 과수 결실 일반 기준(농사로 Q&A): 결실 3년, 성과기 5~7년","src":"농사로 사과 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30663 · 사과 수분수 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31438 · 농사로 Q&A 사과 결실 https://www.nongsaro.go.kr/portal/ps/psz/psza/contentSub.ps?menuId=PS00078&cntntsNo=208420 · 경기일보 2014-08-26 화성 밀식사과"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":3,"harvest_months":[9,10],"per_day":4,"value":0.1,"water_every":10,"drought_days":30,"min_temp":-30}'::jsonb, 100),
  ('pear', 'tree', '{"ko":"배나무","en":"Korean pear"}'::jsonb, 50, 'good', '{"plant":"접목 묘목, 3월 중순~4월 상순","first":"심고 3년 (과수 일반)","harvest":"조생 8월 중순~9월 상순, 중생 9월 중순~10월 중순, 만생 10월 중순~11월 상순","bloom":"4월 중·하순","water":"7~10일 간격으로 20~30mm (이 정원에서는 비가 7일 없으면 물 주기 알림)","cold":"휴면기 −25~−30℃, 꽃 필 때 −1.7~−2.8℃에 상함","drought":"가물면 짚·풀 덮기","rain":"늦서리 주의","pollen":"수분수 20% 이상 꼭 필요 (신고는 꽃가루가 없어 다른 품종)","height":"6~12m","note":"바람 약하고 물 잘 빠지는 평지가 적지. 과수 결실 일반 기준(농사로 Q&A): 결실 3년, 성과기 5~7년","src":"농사로 배 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30661 · 농사로 Q&A https://www.nongsaro.go.kr/portal/ps/psz/psza/contentSub.ps?menuId=PS00078&cntntsNo=208420"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":3,"harvest_months":[9,10],"per_day":3,"value":0.1,"water_every":7,"drought_days":25,"min_temp":-25}'::jsonb, 110),
  ('peach', 'tree', '{"ko":"복숭아나무","en":"Peach"}'::jsonb, 50, 'good', '{"plant":"접목 묘목, 봄","first":"1년생 묘는 3년째, 2년생 묘는 2년째","harvest":"조생 6월 중순~7월 하순, 중생 8월 상~중순, 만생 8월 중순~9월 하순","bloom":"4월 중·하순","water":"가물 때 20~30mm (이 정원에서는 비가 10일 없으면 물 주기 알림)","cold":"−15~−20℃ (겨울에 흙덮기·짚싸기)","rain":"장마 땐 익은 열매를 3~4일 일찍 따기, 과습하면 수지병","pollen":"대개 필요 없음 (꽃가루 없는 품종은 섞어 심기)","height":"4.5~7.5m","note":"우정읍 연최저 평균 −12.6℃로 견딜 수 있음","src":"농사로 복숭아 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30662 · 농사로 Q&A 복숭아 결실 https://www.nongsaro.go.kr/portal/ps/psz/psza/contentSub.ps?menuId=PS00078&cntntsNo=20879"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":3,"harvest_months":[7,8],"per_day":4,"value":0.1,"water_every":10,"drought_days":30,"min_temp":-18}'::jsonb, 120),
  ('grape', 'tree', '{"ko":"포도나무","en":"Grape"}'::jsonb, 50, 'good', '{"plant":"묘목, 봄","first":"확인 못 함 (과수 일반 3년 적용)","harvest":"캠벨얼리 8월 하순, 거봉 9월 중순","bloom":"6월 상순","water":"봄 가뭄에 넉넉히, 수확기에도 물을 끊지 않기 (이 정원에서는 비가 7일 없으면 물 주기 알림)","cold":"캠벨·콩코드 −20~−25℃, 거봉·샤인머스캣 −13~−20℃","rain":"익을 때 비가 오면 당도가 떨어지고 탄저병·열매 터짐","pollen":"대부분 필요 없음 (해외 2차 자료)","height":"덩굴 — 덕·울타리에 유인","note":"화성 해안(송산·서신·마도)이 포도 주산지 — 바닷바람 덕에 당도가 높음. 습기·가뭄에 강함","src":"농사로 포도 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30669 · 경기일보 2013-08-20 화성포도축제 · 경북매일 2020-12-28 과종별 동해 한계온도"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":3,"harvest_months":[8,9],"per_day":4,"value":0.1,"water_every":7,"drought_days":30,"min_temp":-22}'::jsonb, 130),
  ('plum', 'tree', '{"ko":"자두나무","en":"Plum"}'::jsonb, 50, 'good', '{"plant":"묘목, 3월 중순~4월 상순 (가을 11월 중순~12월 상순도)","first":"3년생부터 (대석조생)","harvest":"7월 상순~9월 중순","bloom":"3월 하순~4월 중순","water":"횟수 확인 못 함 (이 정원에서는 비가 10일 없으면 물 주기 알림)","cold":"약 −29℃ (NCSU 5a)","rain":"수확기 비가 이어지면 품질이 떨어지고 병이 늘어남","pollen":"꼭 필요 — 대부분 제 꽃가루로 안 열림, 2~3품종 섞기","height":"6~10m","note":"기후 적응성이 넓어 전국 재배. 늦서리 피해가 많음","src":"농사로 자두 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30667 · 자두 재배적지 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31161 · 대석조생 결실 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31167"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":3,"harvest_months":[7,8],"per_day":5,"value":0.1,"water_every":10,"drought_days":25,"min_temp":-29}'::jsonb, 140),
  ('persimmon', 'tree', '{"ko":"감나무(떫은감)","en":"Astringent persimmon"}'::jsonb, 50, 'ok', '{"fitwhy":"감 적지(연평균 11~15℃) 안이지만 −15~−16℃ 강추위에 1·2년생 가지가 얼 수 있음. 단감이 아닌 떫은감이 안전","plant":"묘목, 잎 진 뒤~싹 트기 전 (가을 심기는 동해 염려)","first":"심고 3~4년째","harvest":"10월 하순 (청도반시)","bloom":"5월 중·하순","water":"횟수 확인 못 함 (이 정원에서는 비가 10일 없으면 물 주기 알림)","cold":"−10~−12℃ 약한 가지, −15~−16℃ 1·2년생 가지 동해","rain":"서리·태풍이 잦은 곳은 맞지 않음","pollen":"대개 필요 없음 (수정 없이 열림)","height":"6~9m","note":"청도반시는 추위에 약해 중부 내륙에 맞지 않음. 곶감·홍시","src":"농사로 감 기상조건 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31493 · 농사로 Q&A 감 결실 https://www.nongsaro.go.kr/portal/ps/psz/psza/contentSub.ps?menuId=PS00078&cntntsNo=20877 · 산림청 수실류 감"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":4,"harvest_months":[10,11],"per_day":5,"value":0.1,"water_every":10,"drought_days":25,"min_temp":-20}'::jsonb, 150),
  ('jujube', 'tree', '{"ko":"대추나무","en":"Jujube"}'::jsonb, 50, 'good', '{"plant":"묘목, 중북부는 봄","first":"3~4년째 (왕대추 2년째)","harvest":"10월 상순","bloom":"6월 중순~7월 중순","water":"건조에 강함, 심하게 마르면 시들기 전에 (이 정원에서는 비가 14일 없으면 물 주기 알림)","cold":"−30℃까지","rain":"과습에 약함. 꽃 필 때 장마면 덜 열리고, 수확기 비에 열매가 터짐","pollen":"한 그루도 열림 (수분수 20% 권장)","height":"4.5~9m","note":"적지: 연평균 8℃ 이상, 1월 평균 −10℃ 이상 — 중부가 적지","src":"산림청 수실류 대추 · NCSU ziziphus-jujuba"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":3,"harvest_months":[10],"per_day":6,"value":0.1,"water_every":14,"drought_days":45,"min_temp":-30}'::jsonb, 160),
  ('blueberry', 'tree', '{"ko":"블루베리","en":"Blueberry"}'::jsonb, 50, 'ok', '{"fitwhy":"중부는 하이부시가 맞지만 pH 4~5 산성흙이 꼭 필요하고 강풍이 부는 곳은 맞지 않음","plant":"묘목, 봄 (공식 달 확인 못 함)","first":"심고 3년째 (1~2년차는 꽃눈을 따 줌)","harvest":"하이부시 6월 중순~7월 하순","bloom":"확인 못 함","water":"뿌리가 얕아 이른 아침 겉흙까지 흠뻑. 흙을 쥐어 뭉쳐지지 않으면 마른 것 (이 정원에서는 비가 3일 없으면 물 주기 알림)","cold":"하이부시 꽃눈 −30~−35℃","drought":"건조에 약함","rain":"익을 때 잎 위로 물을 주면 열매가 터짐, 배수 불량에 약함","pollen":"한 그루도 열리나 여러 품종을 섞으면 더 많이 열림","height":"1.8~4m","note":"성과기 6~7년","src":"농사로 블루베리 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31180 · https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31177 · https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31183"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":3,"harvest_months":[6,7],"per_day":8,"value":0.1,"water_every":3,"drought_days":10,"min_temp":-30}'::jsonb, 170),
  ('maesil', 'tree', '{"ko":"매실나무(매화)","en":"Japanese apricot"}'::jsonb, 50, 'ok', '{"fitwhy":"안전재배선(서산~대전, 연평균 12℃) 바로 북쪽 — 일찍 피는 꽃이 3월 서리에 약함","plant":"묘목, 봄","first":"3~4년생","harvest":"6월 상·중순 (청매)","bloom":"3월 상순~4월 상순","water":"뿌리가 얕음 (이 정원에서는 비가 7일 없으면 물 주기 알림)","cold":"나무는 −20℃까지, 꽃 −8℃, 어린 열매 −4℃","rain":"배수가 나쁘면 3~4년생이 죽음, 장마 습해","pollen":"꼭 필요 — 같은 품종끼리 잘 안 열림, 3~4품종 섞기","height":"4.5~6m","note":"성과기 9년째. 봄에 매화를 먼저 봄","src":"농사로 매실 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30658 · 매실 기상조건 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31365 · 매실 수분·저온 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31364"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":4,"harvest_months":[6],"per_day":6,"value":0.1,"water_every":7,"drought_days":20,"min_temp":-20}'::jsonb, 180),
  ('nanking-cherry', 'tree', '{"ko":"앵두나무","en":"Nanking cherry"}'::jsonb, 50, 'good', '{"plant":"묘목, 봄 (공식 달 확인 못 함)","first":"확인 못 함 (과수 일반 3년 적용)","harvest":"6~7월","bloom":"4월","water":"자리 잡으면 가뭄을 견딤 (이 정원에서는 비가 10일 없으면 물 주기 알림)","cold":"추위에 아주 강함 (2a 구역)","rain":"고온다습에 약함","pollen":"두 그루 이상 권장","height":"1.8~3m","note":"꽃이 약해 바람 막힌 곳에. 국내 공식 자료를 못 찾아 해외 자료(NCSU·위스콘신대)를 씀","src":"NCSU prunus-tomentosa · UW Uncommon Fruit Nanking cherry"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":3,"harvest_months":[6],"per_day":8,"value":0.1,"water_every":10,"drought_days":30,"min_temp":-40}'::jsonb, 190),
  ('cherry', 'tree', '{"ko":"체리(양앵두)","en":"Sweet cherry"}'::jsonb, 50, 'ok', '{"fitwhy":"연평균 12~15℃ 범위지만 꽃 필 때 −2℃가 4시간이면 꽃이 죽고, 수확기 비에 열매가 터져 비가림이 권장됨","plant":"묘목, 봄 3월 중순~4월 상순 (추운 곳은 봄)","first":"확인 못 함 (늦은 편 — 4년 적용)","harvest":"6월 중순~7월 상순","bloom":"4월 하순~5월 상순","water":"흙 물기를 알맞게 유지 (이 정원에서는 비가 7일 없으면 물 주기 알림)","cold":"−20℃ 아래에서 가지가 얼어 상함","rain":"비에 열매가 터짐","pollen":"꼭 필요 — 수분수 20~30%","height":"다 자라면 6~10m","src":"농사로 양앵두 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30665 · 양앵두 기상조건 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31127 · 재식시기 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31121"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":4,"harvest_months":[6],"per_day":6,"value":0.1,"water_every":7,"drought_days":20,"min_temp":-22}'::jsonb, 200),
  ('apricot', 'tree', '{"ko":"살구나무","en":"Apricot"}'::jsonb, 50, 'good', '{"plant":"묘목, 3월 상순~4월 상순 (가을 11월 중순~12월 상순도)","first":"확인 못 함 (과수 일반 3년 적용)","harvest":"6월 중순~7월 상순","bloom":"4월 상·중순","water":"씨가 굳기 전에 흙이 마르지 않게 (이 정원에서는 비가 10일 없으면 물 주기 알림)","cold":"−20~−25℃","rain":"뿌리가 물에 잠기면 죽음 — 배수 필수, 수확 직전 잦은 비에 열매가 터짐","pollen":"최근 품종은 수분수 20~30% 필요","height":"6~12m","note":"연평균 11~15℃가 적지","src":"농사로 살구 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30664"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":3,"harvest_months":[6,7],"per_day":5,"value":0.1,"water_every":10,"drought_days":25,"min_temp":-22}'::jsonb, 210),
  ('hardy-kiwi', 'tree', '{"ko":"다래","en":"Hardy kiwi"}'::jsonb, 50, 'good', '{"plant":"묘목, 봄 (공식 달 확인 못 함)","first":"심고 4년째","harvest":"9~10월","bloom":"5~6월","water":"건조할 때 넉넉히, 짚·풀 덮기 (이 정원에서는 비가 5일 없으면 물 주기 알림)","cold":"추위에 강함 (NCSU 3a)","drought":"뿌리가 얕아 가뭄에 약함","rain":"뿌리가 얕아 서리에도 약함","pollen":"꼭 필요 — 암수딴그루, 암그루 8 : 수그루 1","height":"덩굴 20m까지","note":"전국 산에 자라는 우리 과일. 성과기 5년째부터","src":"산림청 수실류 다래 · NCSU actinidia-arguta"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":4,"harvest_months":[9,10],"per_day":6,"value":0.1,"water_every":5,"drought_days":15,"min_temp":-35}'::jsonb, 220),
  ('chestnut', 'tree', '{"ko":"밤나무","en":"Chestnut"}'::jsonb, 50, 'ok', '{"fitwhy":"기온(연평균 10~14℃)은 맞지만 해안은 상업 재배가 어렵고 태풍에 밤송이가 많이 떨어짐","plant":"묘목, 3월 하순~4월 상순","first":"심고 3~4년","harvest":"8월 하순~10월 상순 (품종별)","bloom":"6월","water":"건조에 약함 — 물기가 유지되는 곳 (이 정원에서는 비가 7일 없으면 물 주기 알림)","cold":"수치 확인 못 함 (동해가 잦은 곳은 피함)","drought":"수확기 가뭄이면 알이 덜 큼","rain":"태풍에 낙과","pollen":"꼭 필요 — 제 꽃가루로 안 열림","height":"재배할 땐 4m 이하로 낮춤","note":"성목기 6~7년","src":"산림청 수실류 밤"}'::jsonb, '{"type":"tree","plant_months":[3,4],"years_to_fruit":4,"harvest_months":[9,10],"per_day":4,"value":0.1,"water_every":7,"drought_days":15,"min_temp":-25}'::jsonb, 230),
  ('sweet-persimmon', 'tree', '{"ko":"단감나무","en":"Sweet persimmon"}'::jsonb, 50, 'no', '{"fitwhy":"안전 재배는 연평균 13℃ 넘고 −14~−15℃ 아래로 안 내려가는 남부뿐. 서늘하면 떫은맛이 남고, −10℃에 열매 맺을 가지 10%가 얼어 죽음 (우정읍 연최저 평균 −12.6℃)","first":"심고 3~4년째","harvest":"9월 중순~11월 중순","src":"농사로 단감 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30656 · 단감 안전재배지대 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31498"}'::jsonb, '{"type":"tree"}'::jsonb, 240),
  ('fig', 'tree', '{"ko":"무화과","en":"Fig"}'::jsonb, 50, 'no', '{"fitwhy":"안전지대는 연평균 14℃ 이상, 가장 추운 날 −8℃ 위인 남부 해안. 다 자란 나무도 −8~−12℃, 어린나무는 −6℃에 얼어 노지 월동이 어려움","first":"2년째","harvest":"8월 상순~10월 하순","src":"농사로 무화과 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30659 · 무화과 결실 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31335"}'::jsonb, '{"type":"tree"}'::jsonb, 250),
  ('kiwi', 'tree', '{"ko":"참다래(키위)","en":"Kiwifruit"}'::jsonb, 50, 'no', '{"fitwhy":"−10℃에서 얼어 상함 — 제주·남해안 일부만 안전 (적지 연평균 14℃ 이상)","harvest":"10월 하순~11월 중순","src":"농사로 참다래 https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=30668 · 농사로 Q&A 참다래 동해 https://www.nongsaro.go.kr/portal/ps/psz/psza/contentSub.ps?menuId=PS00078&cntntsNo=208309"}'::jsonb, '{"type":"tree"}'::jsonb, 260),
  ('sunflower', 'flower', '{"ko":"해바라기","en":"Sunflower"}'::jsonb, 20, 'good', '{"plant":"씨앗, 4월 상순부터 직접 뿌림 (꽃 볼 날 60~70일 전)","bloom":"7~9월 (4월 상순에 뿌리면 6월 중순~7월 상순)","water":"싹 틀 때까지만 넉넉히, 그 뒤는 건조하게 (이 정원에서는 비가 7일 없으면 물 주기 알림)","sun":"양지, 하루 6시간 넘게","drought":"강함","rain":"약함 — 장마에 습해, 물 빠지는 고랑 필요","cold":"서리에 죽음, 10℃ 아래에서 잘 못 자람","height":"키 큰 품종은 바람 막는 곳·지주","note":"어린 포기는 해를 따라 돌고, 다 핀 꽃은 동쪽을 봄","src":"국립원예특작과학원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=244 · 농사로 꽃해바라기 농작업일정 · NCSU helianthus-annuus"}'::jsonb, '{"type":"annual","plant_months":[4,5],"bloom_months":[7,8,9],"first_bloom_days":65,"water_every":7,"drought_days":25,"wet":"mid","frost_kill":true,"emerge_days":7}'::jsonb, 270),
  ('cosmos', 'flower', '{"ko":"코스모스","en":"Cosmos"}'::jsonb, 20, 'good', '{"plant":"씨앗, 늦서리 뒤 직접 뿌림 (꽃 볼 날 50~70일 전)","bloom":"6~11월 (가을이 한창)","water":"싹 날 때까지 겉흙이 마르지 않게, 그 뒤는 건조도 견딤 (이 정원에서는 비가 7일 없으면 물 주기 알림)","sun":"양지, 하루 6시간 넘게","drought":"강함","rain":"약함 — 다습에 약하고 강풍에 쓰러짐","cold":"0℃ 아래에서 죽음","note":"낮이 짧아지는 가을에 꽃이 잘 핌. 척박한 땅에서도 잘 자람","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=266 · 농사로 코스모스 기술 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=32502 · 서울식물원 코스모스"}'::jsonb, '{"type":"annual","plant_months":[4,5,6,7],"bloom_months":[8,9,10],"first_bloom_days":60,"water_every":7,"drought_days":25,"wet":"mid","frost_kill":true,"emerge_days":7}'::jsonb, 280),
  ('marigold', 'flower', '{"ko":"메리골드(만수국)","en":"Marigold"}'::jsonb, 20, 'good', '{"plant":"모종, 4~5월","bloom":"장마 전 한 번, 장마 뒤 다시 피어 서리 때까지 (6월·10월이 한창)","water":"고르게 촉촉하고 물 잘 빠지는 흙 (이 정원에서는 비가 3일 없으면 물 주기 알림)","sun":"양지 (해가 적으면 꽃이 적음)","drought":"보통~강함","rain":"약함 — 30℃ 넘는 장마에 시들기 쉬움","cold":"5℃ 아래 멈춤, 0℃ 아래 죽음","note":"장마 직전에 짧게 잘라 주면 장마 뒤 다시 핌","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=170 · 농사로 매리골드 기술 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=32101"}'::jsonb, '{"type":"annual","plant_months":[4,5],"bloom_months":[6,7,9,10],"first_bloom_days":35,"water_every":3,"drought_days":14,"wet":"mid","frost_kill":true}'::jsonb, 290),
  ('zinnia', 'flower', '{"ko":"백일홍","en":"Zinnia"}'::jsonb, 20, 'good', '{"plant":"씨앗, 5월 상순 직접 뿌림 (서리 끝난 뒤)","bloom":"6월~서리 올 때까지","water":"뿌리 내릴 때까지 넉넉히, 그 뒤 줄임 (이 정원에서는 비가 4일 없으면 물 주기 알림)","sun":"양지","drought":"강함","rain":"약함 — 젖은 흙이 이어지면 노균병","cold":"0℃ 아래에서 죽음","note":"15~25℃에서 가장 잘 자람","src":"농사로 지니아 기술 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=32317 · NCSU zinnia-elegans"}'::jsonb, '{"type":"annual","plant_months":[5],"bloom_months":[6,7,8,9,10],"first_bloom_days":50,"water_every":4,"drought_days":25,"wet":"mid","frost_kill":true,"emerge_days":7}'::jsonb, 300),
  ('balsam', 'flower', '{"ko":"봉선화","en":"Garden balsam"}'::jsonb, 20, 'good', '{"plant":"모종, 4~5월","bloom":"여름","water":"촉촉한 곳을 좋아함 (이 정원에서는 비가 2일 없으면 물 주기 알림)","sun":"양지~반양지","drought":"약함","rain":"확인 못 함","cold":"서리에 약함","note":"꼬투리를 건드리면 씨가 튐. 꽃잎으로 손톱을 물들임","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=226 · NCSU impatiens-balsamina"}'::jsonb, '{"type":"annual","plant_months":[4,5],"bloom_months":[6,7,8],"first_bloom_days":45,"water_every":2,"drought_days":7,"wet":"mid","frost_kill":true}'::jsonb, 310),
  ('portulaca', 'flower', '{"ko":"채송화","en":"Moss rose"}'::jsonb, 20, 'good', '{"plant":"씨앗, 5월 중순 이후 직접 뿌림","bloom":"여름~가을","water":"아주 건조할 때만. 가물어도 한 달 넘게 버팀 (이 정원에서는 비가 10일 없으면 물 주기 알림)","sun":"양지, 덥고 해가 많아야 함","drought":"아주 강함","rain":"약함 — 과습하면 잿빛곰팡이병·무름","cold":"노지 월동 못 함","note":"오전에 피고 오후·흐린 날에는 닫힘","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=176 · 농사로 채송화 기술 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=32434"}'::jsonb, '{"type":"annual","plant_months":[5,6],"bloom_months":[7,8,9],"first_bloom_days":50,"water_every":10,"drought_days":35,"wet":"mid","frost_kill":true,"emerge_days":10}'::jsonb, 320),
  ('mum', 'flower', '{"ko":"국화(소국)","en":"Garden mum"}'::jsonb, 20, 'good', '{"plant":"모종·꺾꽂이, 초여름 (농가 노지는 7월 하순~8월 상순 아주심기)","bloom":"10월 하순~11월 중순","water":"심은 직후 넉넉히, 뿌리 내린 뒤 겉흙이 마르면 (이 정원에서는 비가 4일 없으면 물 주기 알림)","sun":"양지","drought":"확인 못 함 (심하게 마르면 아랫잎이 마름)","rain":"약함 — 뿌리가 물에 약해 장마 때 주의","cold":"노지 월동 (우정읍 7b, 국화는 5a까지)","note":"낮이 12시간보다 짧아져야 꽃눈이 생김. 여러해살이","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=246 · 농사로 국화 수분관리 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31840 · 농사로 국화 농작업일정"}'::jsonb, '{"type":"perennial","plant_months":[5,6,7],"bloom_months":[10,11],"first_bloom_days":60,"water_every":4,"drought_days":14,"wet":"mid","min_temp":-28}'::jsonb, 330),
  ('hydrangea', 'flower', '{"ko":"수국","en":"Hydrangea"}'::jsonb, 20, 'ok', '{"fitwhy":"노지 월동은 되나 강추위·늦서리에 꽃눈이 상해 꽃이 적은 해가 있음","plant":"묘목, 봄 (심는 달은 공식 자료 확인 못 함 — 일반 나무심기 철)","bloom":"6월 중순~7월 중순","water":"늘 중간 정도로 촉촉하게 (해가 많으면 더 자주) (이 정원에서는 비가 2일 없으면 물 주기 알림)","sun":"반그늘, 오후 햇빛은 피함","drought":"약함","rain":"보통","cold":"우정읍 7b 노지 월동 (수국은 6~9구역)","note":"흙이 산성이면 파랑, 알칼리면 분홍. 지난해 가지에서 꽃이 핌","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=166 · Missouri Botanical Garden Hydrangea macrophylla · NCSU hydrangea-macrophylla"}'::jsonb, '{"type":"shrub","plant_months":[3,4],"bloom_months":[6,7],"first_bloom_days":60,"water_every":2,"drought_days":7,"min_temp":-20}'::jsonb, 340),
  ('rose', 'flower', '{"ko":"덩굴장미","en":"Climbing rose"}'::jsonb, 20, 'good', '{"plant":"묘목, 3~4월","bloom":"5월부터 (다시 피는 품종은 10월까지)","water":"자라는 철에 알맞게 (횟수 공식 자료 확인 못 함) (이 정원에서는 비가 4일 없으면 물 주기 알림)","sun":"양지 6시간 넘게, 바람이 잘 통하는 곳","drought":"확인 못 함","rain":"약함 — 덥고 습하면 검은무늬병·흰가루병","cold":"노지 월동 (장미속 5a 구역부터)","note":"아치·울타리에 유인해 기름","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=140 · 농사로 장미 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31849 · 서울식물원 덩굴장미"}'::jsonb, '{"type":"shrub","plant_months":[3,4],"bloom_months":[5,6],"first_bloom_days":60,"water_every":4,"drought_days":14,"wet":"mid","min_temp":-28}'::jsonb, 350),
  ('lavender', 'flower', '{"ko":"라벤더(잉글리시)","en":"English lavender"}'::jsonb, 20, 'ok', '{"fitwhy":"추위는 견디지만 장마철 습기에 뿌리가 쉽게 썩음 — 물 잘 빠지는 높은 곳에","plant":"모종, 봄 (심는 달 공식 자료 확인 못 함)","bloom":"5~8월","water":"건조한 편으로, 과습 금지 (이 정원에서는 비가 10일 없으면 물 주기 알림)","sun":"양지, 건조하고 해가 쨍쨍한 곳","drought":"강함","rain":"아주 약함 — 장마 습도 관리가 가장 중요","cold":"노지 월동 (5a~9b, 우정읍 7b)","note":"꽃과 잎 전체에 향","src":"서울식물원 라벤더 · NCSU lavandula-angustifolia"}'::jsonb, '{"type":"perennial","plant_months":[4,5],"bloom_months":[5,6,7,8],"first_bloom_days":45,"water_every":10,"drought_days":30,"wet":"mid","min_temp":-28}'::jsonb, 360),
  ('tulip', 'flower', '{"ko":"튤립","en":"Tulip"}'::jsonb, 20, 'good', '{"plant":"구근, 가을(10월경)","bloom":"4월 하순","water":"알뿌리가 커지는 5~6월 물 관리를 철저히, 과습하면 구근이 썩음 (이 정원에서는 비가 5일 없으면 물 주기 알림)","sun":"양지","drought":"확인 못 함","rain":"약함 — 구근 부패","cold":"노지 월동, 겨울 추위를 거쳐야 꽃이 핌","note":"따뜻하면 꽃잎이 열리고 서늘하면 닫힘. 3년쯤 지나면 알뿌리가 약해짐","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=76 · 농사로 튤립 작형 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31958 · 농사로 튤립 농작업일정"}'::jsonb, '{"type":"bulb","plant_months":[10,11],"bloom_months":[4],"first_bloom_days":150,"water_every":5,"drought_days":20,"wet":"mid","min_temp":-35,"emerge_days":140}'::jsonb, 370),
  ('daffodil', 'flower', '{"ko":"수선화","en":"Daffodil"}'::jsonb, 20, 'good', '{"plant":"구근, 9월 말~10월 중순","bloom":"3월 하순~4월","water":"심은 뒤 넉넉히, 뿌리 내리면 줄이고 5~6월엔 마르지 않게 (이 정원에서는 비가 5일 없으면 물 주기 알림)","sun":"양지 (그늘에 약함)","drought":"보통","rain":"약함 — 습한 땅에서 구근이 썩음","cold":"전국 노지 월동 (제주수선은 추위에 약함)","note":"꽃이 진 뒤 잎이 말라 알뿌리로 여름을 남","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=5 · 농사로 수선화 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=32579"}'::jsonb, '{"type":"bulb","plant_months":[9,10],"bloom_months":[3,4],"first_bloom_days":150,"water_every":5,"drought_days":14,"wet":"mid","min_temp":-34,"emerge_days":150}'::jsonb, 380),
  ('lily', 'flower', '{"ko":"백합(나리)","en":"Lily"}'::jsonb, 20, 'good', '{"plant":"구근, 9~10월","bloom":"6~8월","water":"심은 뒤 넉넉히, 뒤에는 겉흙이 마르지 않게 (이 정원에서는 비가 3일 없으면 물 주기 알림)","sun":"양지~반그늘","drought":"약함 — 껍질 없는 구근이라 쉽게 마름","rain":"약함 — 덥고 습하면 약해짐","cold":"노지 월동 (참나리 5a~8b)","note":"해가 모자라면 봉오리가 피지 못함. 부활절 백합은 교회에서 많이 씀","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=162 · 농사로 아시아틱나리 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=32374"}'::jsonb, '{"type":"bulb","plant_months":[9,10],"bloom_months":[6,7,8],"first_bloom_days":240,"water_every":3,"drought_days":8,"wet":"mid","min_temp":-28,"emerge_days":180}'::jsonb, 390),
  ('celosia', 'flower', '{"ko":"맨드라미","en":"Cockscomb"}'::jsonb, 20, 'good', '{"plant":"씨앗, 4월 중순~5월 직접 뿌림 (중부 5월 중순)","bloom":"6~10월 (5월 중순에 뿌리면 8월 상순부터)","water":"더운 철엔 건조하게 (모잘록병 예방) (이 정원에서는 비가 6일 없으면 물 주기 알림)","sun":"양지 (반그늘이면 꽃이 작아짐)","drought":"강함","rain":"약함 — 비·고습에 꽃이 썩음","cold":"추위에 약함, 서리 때까지 핌","note":"수탉 볏 모양, 더위에 강함","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=253 · 농사로 맨드라미 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=31978"}'::jsonb, '{"type":"annual","plant_months":[4,5],"bloom_months":[7,8,9,10],"first_bloom_days":75,"water_every":6,"drought_days":25,"wet":"mid","frost_kill":true,"emerge_days":7}'::jsonb, 400),
  ('morning-glory', 'flower', '{"ko":"나팔꽃","en":"Morning glory"}'::jsonb, 20, 'good', '{"plant":"씨앗, 봄에 직접 뿌림 (월·순은 확인 못 함)","bloom":"7~8월","water":"촉촉하고 물 잘 빠지는 흙 (근연종 자료) (이 정원에서는 비가 4일 없으면 물 주기 알림)","sun":"양지","drought":"확인 못 함","rain":"확인 못 함","cold":"한해살이, 서리에 죽음","note":"아침에 피어 오후에 닫히고 하루 만에 짐. 덩굴은 왼쪽으로 감아 오름","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=187 · NCSU ipomoea-purpurea(근연종)"}'::jsonb, '{"type":"annual","plant_months":[4,5,6],"bloom_months":[7,8],"first_bloom_days":60,"water_every":4,"drought_days":14,"wet":"mid","frost_kill":true,"emerge_days":7}'::jsonb, 410),
  ('mugunghwa', 'flower', '{"ko":"무궁화","en":"Rose of Sharon"}'::jsonb, 20, 'good', '{"plant":"묘목, 봄 (꺾꽂이 4월 하순~5월 초, 씨앗 4월 중·하순)","bloom":"7월 초~10월 초, 약 100일","water":"물 잘 빠지고 적당히 촉촉한 곳 (이 정원에서는 비가 5일 없으면 물 주기 알림)","sun":"양지","drought":"보통","rain":"보통","cold":"노지 월동, 추위에 강함","note":"나라꽃. 한 송이는 아침에 피고 해 지면 짐, 한 그루에 매일 20~30송이. 바닷바람·공해에 강함","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=199 · 농사로 무궁화 https://www.nongsaro.go.kr/portal/ps/psb/psbk/kidoContentsFileDownload.ps?kidofcomdtyNo=32216 · 국립산림과학원 무궁화 · 국가기록원 무궁화 가꾸기"}'::jsonb, '{"type":"shrub","plant_months":[3,4,5],"bloom_months":[7,8,9],"first_bloom_days":60,"water_every":5,"drought_days":14,"min_temp":-28}'::jsonb, 420),
  ('jindallae', 'flower', '{"ko":"진달래","en":"Korean rhododendron"}'::jsonb, 20, 'good', '{"plant":"묘목, 봄 (옮겨심기 쉬움, 공식 달 확인 못 함 — 일반 나무심기 철)","bloom":"4월 (잎보다 꽃이 먼저)","water":"약간 습하게, 과습 금지 (이 정원에서는 비가 4일 없으면 물 주기 알림)","sun":"반그늘 (종일 직사광보다)","drought":"보통 (척박한 땅도 견딤)","rain":"약함 — 과습하면 뿌리가 썩음","cold":"노지 월동 (4a~8b)","note":"''참꽃''. 바닷바람에 강함. 일찍 피어 봄 늦추위에 꽃이 상하기도 함","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=74 · 서울식물원 진달래 · NCSU rhododendron-mucronulatum"}'::jsonb, '{"type":"shrub","plant_months":[3,4],"bloom_months":[4],"first_bloom_days":20,"water_every":4,"drought_days":14,"wet":"mid","min_temp":-34}'::jsonb, 430),
  ('azalea', 'flower', '{"ko":"철쭉","en":"Royal azalea"}'::jsonb, 20, 'good', '{"plant":"묘목, 봄 (심는 달 공식 자료 확인 못 함 — 일반 나무심기 철)","bloom":"4~5월","water":"물이 잘 빠지는 곳 (횟수 확인 못 함) (이 정원에서는 비가 4일 없으면 물 주기 알림)","sun":"양지~반그늘 (엷은 그늘을 더 좋아함)","drought":"확인 못 함","rain":"약함 — 물이 고이면 뿌리가 썩음","cold":"노지 월동, 추위에 강함","note":"자생 철쭉(연분홍). 길가의 영산홍은 일본 원예종","src":"원예원 오늘의 꽃 https://www.nihhs.go.kr/usr/persnal/Flower_today.do?mc=MN0000000089&dataNo=126 · 농사로 철쭉 농작업일정 · NCSU rhododendron-schlippenbachii"}'::jsonb, '{"type":"shrub","plant_months":[3,4],"bloom_months":[4,5],"first_bloom_days":30,"water_every":4,"drought_days":14,"wet":"mid","min_temp":-34}'::jsonb, 440)
on conflict (slug) do update set category = excluded.category, name = excluded.name, fit = excluded.fit,
  specs = excluded.specs, model = excluded.model, sort = excluded.sort, active = true, updated_at = now();
-- 품목 끝

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
