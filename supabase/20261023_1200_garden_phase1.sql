-- ============================================================
--  신앙 정원 1단계 (2026-10-23 담임목사 지시) — 성도마다 식물 한 그루가 신앙 활동으로 자란다
--
--  [무엇]
--   · 로그인한 회원마다 정원(식물 한 그루·달란트)을 두고, 큐티 아멘·성경읽기·예배 출석·오디오북·성장기 하트·
--     나눔터·앨범·행사 신청·모두의 성경 활동을 점수(XP)와 달란트로 환산해 식물이 자란다.
--   · 지난 기록을 모두 소급한다 — 기존 표는 **읽기만** 한다(열 추가·트리거 없음). 점수는 아래 garden_ 표에만 적는다.
--   · 뼈대는 훗날 여러 교회가 들어오는 플랫폼(지역 → 교회(도시 맵) → 자리 → 성도 정원)을 전제로 잡았다.
--     1단계에서는 운평장로교회 한 교회, 성도마다 자리 하나, 식물 한 그루만 실제로 쓴다.
--
--  [표]  garden_regions(지역, 열림/닫힘) · garden_churches(교회, 자기 도시) · garden_memberships(소속·역할)
--        garden_profiles(플랫폼 별명·아바타 — 교적과 분리) · garden_plots(도시 맵의 자리) · garden_species(식물 종류·단계 문턱)
--        garden_rules(점수 규칙: 플랫폼 기본 + 교회별 덮어쓰기) · garden_gardens(정원 스냅숏) · garden_ledger(점수 원장 = 원본)
--  [함수] garden_state · garden_sync · garden_set_plant · garden_set_profile · garden_history · garden_peek (RPC)
--        안쪽: garden_derive_woonpyung(이 사이트 표 → 후보) · garden_candidates · garden_ensure_member · garden_sync_user …
--  [안전] 표에 대한 anon/authenticated 쓰기 권한은 모두 거둔다 — 쓰기는 security definer 함수로만.
--        헌금(offerings)·교적 이름·연락처는 어디에도 쓰지 않는다. 어린이(로그인 없음)는 대상이 아니다(ss_talents 그대로).
--        원천(예: bible_reading 체크 해제)이 지워져도 장부는 남는다 — 성장은 선물. 같은 (종류, 참조)는 UNIQUE 라 두 번 적히지 않는다.
--
--  [실행] 운영 SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전). SQL Editor 는 postgres 라 auth.uid() 가 null →
--        시험은 select public.garden_sync_user('<uid>', public.garden_default_church());  (건수·메타데이터만 출력할 것)
--
--  [되돌리기(롤백)] — DROP 대신 RENAME. 기존 표는 건드린 것이 없으므로 아래만 하면 전과 같다.
--    drop function if exists public.garden_state(text), public.garden_sync(text), public.garden_set_plant(text, text, text),
--      public.garden_set_profile(text, text, text, text), public.garden_history(text, int, int), public.garden_peek(text, int);
--    drop function if exists public.garden_sync_user(uuid, uuid), public.garden_state_json(uuid, uuid), public.garden_ensure_member(uuid, uuid),
--      public.garden_candidates(uuid, uuid), public.garden_derive_woonpyung(uuid, uuid), public.garden_resolve_church(text),
--      public.garden_rules_eff(uuid), public.garden_is_admin(uuid), public.garden_is_member(uuid), public.garden_spiral_xy(int),
--      public.garden_stage(int, int[]), public.garden_default_church(), public.garden_touch();
--    alter table public.garden_ledger      rename to garden_ledger_archived;
--    alter table public.garden_gardens     rename to garden_gardens_archived;
--    alter table public.garden_rules       rename to garden_rules_archived;
--    alter table public.garden_species     rename to garden_species_archived;
--    alter table public.garden_plots       rename to garden_plots_archived;
--    alter table public.garden_profiles    rename to garden_profiles_archived;
--    alter table public.garden_memberships rename to garden_memberships_archived;
--    alter table public.garden_churches    rename to garden_churches_archived;
--    alter table public.garden_regions     rename to garden_regions_archived;
--    (표 자체를 지우는 일은 4주 뒤 백업 확인 후 사람이 한다.)
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────
-- 0) 공통 도우미
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- 이 사이트의 교회 (운평장로교회) — 고정 uuid
create or replace function public.garden_default_church() returns uuid
language sql immutable as $$ select 'a0000000-0000-4000-8000-000000000001'::uuid $$;

-- 경험치 → 단계(1=씨앗 … 6=열매). 문턱 배열은 종류(garden_species.stage_xp)마다
create or replace function public.garden_stage(p_xp int, p_thr int[]) returns smallint
language sql immutable as $$
  select greatest(1, (select count(*) from unnest(coalesce(p_thr, '{0}'::int[])) t where t <= coalesce(p_xp, 0)))::smallint
$$;

-- 자리 번호 → 도시 맵 좌표. 0 = 교회 건물(원점), 1부터 교회 둘레를 네모 나선으로 돈다
--   1:(1,0) 2:(1,1) 3:(0,1) 4:(-1,1) 5:(-1,0) 6:(-1,-1) 7:(0,-1) 8:(1,-1) 9:(2,-1) …
create or replace function public.garden_spiral_xy(p_n int, out x int, out y int)
language plpgsql immutable as $$
declare n int := coalesce(p_n, 0) + 1; k int; t int; m int;
begin
  if n <= 1 then x := 0; y := 0; return; end if;
  k := ceil((sqrt(n::numeric) - 1) / 2)::int;
  t := 2 * k + 1; m := t * t; t := t - 1;
  if n >= m - t then x := k - (m - n); y := -k; return; end if;
  m := m - t;
  if n >= m - t then x := -k; y := -k + (m - n); return; end if;
  m := m - t;
  if n >= m - t then x := -k + (m - n); y := k; return; end if;
  x := k; y := k - (m - n - t);
end $$;

-- ──────────────────────────────────────────────────────────────
-- 1) 지역 — 나라 → 도 → 시. is_open 이 true 인 지역의 교회만 들어올 수 있다(교회 만들기는 2단계)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_regions (
  id         uuid primary key,
  slug       text not null unique,
  name_ko    text not null,
  name_en    text not null default '',
  country    text not null default 'KR',                 -- ISO 3166-1 alpha-2
  parent_id  uuid references public.garden_regions (id),
  level      smallint not null default 0,                -- 0 나라 · 1 도 · 2 시
  lat        numeric(8,5),
  lng        numeric(8,5),
  timezone   text not null default 'Asia/Seoul',
  is_open    boolean not null default false,
  opened_at  timestamptz,
  terrain    jsonb not null default '{}'::jsonb,         -- {"coast":true,"mountain":false,…} 뒷날 도시 테마용
  created_at timestamptz not null default now()
);
create index if not exists idx_garden_regions_parent on public.garden_regions (parent_id);

-- ──────────────────────────────────────────────────────────────
-- 2) 교회 — 자기 도시의 맵을 갖는다. 주소·전화는 저장하지 않는다(교회 안내는 기존 사이트 몫)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_churches (
  id         uuid primary key,
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name       text not null,
  region_id  uuid references public.garden_regions (id),
  locale     text not null default 'ko',
  timezone   text not null default 'Asia/Seoul',
  country    text not null default 'KR',
  city_name  text not null default '',
  lat        numeric(8,5),
  lng        numeric(8,5),
  theme      text not null default 'default',            -- images/garden/<theme>/
  map_size   integer not null default 9,                 -- 도시 맵 한 변의 칸 수(2단계)
  settings   jsonb not null default '{}'::jsonb,         -- {"adapter":"woonpyung","talent_label":{"ko":"달란트","en":"Talents"}}
  verified   boolean not null default false,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists garden_churches_touch on public.garden_churches;
create trigger garden_churches_touch before update on public.garden_churches for each row execute function public.garden_touch();

-- ──────────────────────────────────────────────────────────────
-- 3) 소속 — 계정 하나가 여러 교회에 들 수 있다(기본 교회 하나). 1단계는 이 사이트 사용자를 자동으로 운평에 넣는다
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_memberships (
  church_id   uuid not null references public.garden_churches (id),
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','leader','member','visitor')),
  status      text not null default 'active' check (status in ('active','pending','banned','left')),
  is_primary  boolean not null default false,
  external_id text,                                      -- 다른 프로젝트로 옮길 때 잇는 열쇠 (예: 'woonpyung:<uid>')
  joined_at   timestamptz not null default now(),
  primary key (church_id, user_id)
);
create index if not exists idx_garden_memberships_user on public.garden_memberships (user_id);
create unique index if not exists garden_memberships_primary_ux on public.garden_memberships (user_id) where is_primary;

-- ──────────────────────────────────────────────────────────────
-- 4) 플랫폼 프로필 — 교적(이름·연락처·헌금)과 분리. 별명은 profiles.name 에서 한 번 복사하고 본인이 고친다
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nickname   text not null default '' check (char_length(nickname) <= 20),
  avatar_url text not null default '' check (char_length(avatar_url) <= 300),
  avatar_key text not null default 'a' check (char_length(avatar_key) <= 20),   -- 점토 캐릭터 a/b/c (그림 파일 이름)
  visibility text not null default 'church' check (visibility in ('public','church','private')),
  locale     text not null default 'ko',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists garden_profiles_touch on public.garden_profiles;
create trigger garden_profiles_touch before update on public.garden_profiles for each row execute function public.garden_touch();

-- ──────────────────────────────────────────────────────────────
-- 5) 자리 — 교회 도시 맵의 칸. 0번 = 교회 건물(원점). 성도가 처음 오면 나선형으로 다음 빈 자리를 준다
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_plots (
  id            bigserial primary key,
  church_id     uuid not null references public.garden_churches (id),
  plot_no       integer not null,
  owner_user_id uuid references auth.users (id) on delete set null,
  x             integer not null,
  y             integer not null,
  kind          text not null default 'garden' check (kind in ('garden','church','reserved')),
  created_at    timestamptz not null default now(),
  unique (church_id, plot_no),
  unique (church_id, owner_user_id),
  unique (church_id, x, y)
);

-- ──────────────────────────────────────────────────────────────
-- 6) 식물 종류 — 단계 문턱(씨앗·싹·어린 나무·자란 나무·꽃·열매)과 완성 경험치
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_species (
  slug        text primary key,
  name        jsonb not null default '{}'::jsonb,                     -- {"ko":"해바라기","en":"Sunflower"}
  stage_xp    int[] not null default '{0,150,500,1000,1600,2200}',
  done_xp     integer not null default 2800,                          -- 이만큼이면 열매를 거두고 새 씨앗
  stage_names jsonb not null default '{"ko":["씨앗","싹","어린 나무","자란 나무","꽃","열매"],"en":["Seed","Sprout","Sapling","Tree","Flower","Fruit"]}'::jsonb,
  active      boolean not null default true,                          -- 그림이 있는 종류만 켠다
  sort        integer not null default 100
);

-- ──────────────────────────────────────────────────────────────
-- 7) 규칙 — church_id null = 플랫폼 기본값. 교회 행이 있으면 그 종류는 교회 값(교회가 끈 것도 교회가 이김)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_rules (
  id         bigserial primary key,
  church_id  uuid references public.garden_churches (id),
  kind       text not null,
  label      jsonb not null default '{}'::jsonb,            -- {"ko":"큐티 아멘","en":"QT Amen"}
  xp         integer not null default 0 check (xp >= 0),
  talent     integer not null default 0,
  daily_cap  integer not null default 0 check (daily_cap >= 0),   -- 교회 시간대 하루 최대 건수. 0 = 제한 없음
  active     boolean not null default true,
  sort       integer not null default 100,
  updated_at timestamptz not null default now()
);
create unique index if not exists garden_rules_platform_ux on public.garden_rules (kind) where church_id is null;
create unique index if not exists garden_rules_church_ux   on public.garden_rules (church_id, kind) where church_id is not null;
drop trigger if exists garden_rules_touch on public.garden_rules;
create trigger garden_rules_touch before update on public.garden_rules for each row execute function public.garden_touch();

-- ──────────────────────────────────────────────────────────────
-- 8) 정원 스냅숏 — 교회 × 계정 하나. 지금 자라는 식물을 안에 품는다(여러 그루는 2단계 garden_plants 로)
--    합계는 늘 장부 sum() 으로 다시 센다. chosen_at 이 null 이면 아직 첫 심기(종류·이름 고르기)를 안 한 것
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_gardens (
  church_id      uuid not null references public.garden_churches (id),
  user_id        uuid not null references auth.users (id) on delete cascade,
  plot_id        bigint references public.garden_plots (id),
  species        text not null default 'sunflower' references public.garden_species (slug),
  plant_name     text not null default '' check (char_length(plant_name) <= 20),
  chosen_at      timestamptz,
  planted_at     timestamptz not null default now(),
  plant_xp       integer not null default 0,                -- = xp_total - xp_spent (지금 식물의 경험치)
  stage          smallint not null default 1,
  xp_total       integer not null default 0,
  xp_spent       integer not null default 0,                -- 거둔 식물들에 쓴 경험치 합
  talent_balance integer not null default 0,
  plants_done    integer not null default 0,
  last_sync_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (church_id, user_id)
);
create index if not exists idx_garden_gardens_plot on public.garden_gardens (plot_id);
drop trigger if exists garden_gardens_touch on public.garden_gardens;
create trigger garden_gardens_touch before update on public.garden_gardens for each row execute function public.garden_touch();

-- ──────────────────────────────────────────────────────────────
-- 9) 장부 — 원본. (교회·계정·종류·참조) 유일 = 소급·재실행 안전. talent 는 음수 가능(상점·선물용)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.garden_ledger (
  id         bigserial primary key,
  church_id  uuid not null references public.garden_churches (id),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,
  ref        text not null,
  xp         integer not null default 0 check (xp >= 0),
  talent     integer not null default 0,
  at         timestamptz not null,                          -- 활동이 일어난 시각 (날짜 셈·정렬용)
  source     text not null default 'platform'
             check (source in ('woonpyung_adapter','platform','system','admin','transfer','weather')),
  meta       jsonb not null default '{}'::jsonb,            -- transfer_id · note · species 등
  created_at timestamptz not null default now(),            -- 장부에 적힌 시각
  unique (church_id, user_id, kind, ref)
);
create index if not exists idx_garden_ledger_user_at on public.garden_ledger (church_id, user_id, at desc, id desc);

-- ──────────────────────────────────────────────────────────────
-- 10) 시드 — 지역·교회·식물 종류·플랫폼 규칙 (다시 실행해도 안전)
-- ──────────────────────────────────────────────────────────────
insert into public.garden_regions (id, slug, name_ko, name_en, country, parent_id, level, lat, lng, timezone, is_open, opened_at, terrain) values
  ('b0000000-0000-4000-8000-000000000001', 'kr',                   '대한민국', 'South Korea', 'KR', null,
     0, 36.5,    127.8,    'Asia/Seoul', true,  now(), '{}'),
  ('b0000000-0000-4000-8000-000000000002', 'kr-gyeonggi',          '경기도',   'Gyeonggi-do', 'KR', 'b0000000-0000-4000-8000-000000000001',
     1, 37.41,   127.52,   'Asia/Seoul', true,  now(), '{}'),
  ('b0000000-0000-4000-8000-000000000003', 'kr-gyeonggi-hwaseong', '화성시',   'Hwaseong',    'KR', 'b0000000-0000-4000-8000-000000000002',
     2, 37.09,   126.80,   'Asia/Seoul', true,  now(), '{"coast":true,"mountain":false,"plain":true}'),
  -- 닫힌 지역 예시 — 지역이 열리면(is_open) 그 지역 교회가 들어올 수 있음을 보여 주는 행
  ('b0000000-0000-4000-8000-000000000004', 'kr-gyeonggi-ansan',    '안산시',   'Ansan',       'KR', 'b0000000-0000-4000-8000-000000000002',
     2, 37.3219, 126.8309, 'Asia/Seoul', false, null,  '{"coast":true,"island":true}')
on conflict (id) do nothing;

-- 첫 교회: 운평장로교회 — 화성특례시 우정읍 (도시 이름·좌표만)
insert into public.garden_churches (id, slug, name, region_id, locale, timezone, country, city_name, lat, lng, theme, settings, verified)
values ('a0000000-0000-4000-8000-000000000001', 'woonpyung', '운평장로교회', 'b0000000-0000-4000-8000-000000000003',
        'ko', 'Asia/Seoul', 'KR', '화성시', 37.09, 126.80, 'default',
        '{"adapter":"woonpyung","talent_label":{"ko":"달란트","en":"Talents"}}'::jsonb, true)
on conflict (id) do nothing;

-- 식물 종류 — 1단계 그림이 있는 3종만 켠다. 나머지는 그림이 생기면 active = true
insert into public.garden_species (slug, name, active, sort) values
  ('sunflower', '{"ko":"해바라기","en":"Sunflower"}',  true,  10),
  ('olive',     '{"ko":"올리브나무","en":"Olive"}',    true,  20),
  ('fig',       '{"ko":"무화과나무","en":"Fig"}',      true,  30),
  ('grape',     '{"ko":"포도나무","en":"Grapevine"}',  false, 40),
  ('mustard',   '{"ko":"겨자나무","en":"Mustard"}',    false, 50),
  ('lily',      '{"ko":"백합","en":"Lily"}',           false, 60)
on conflict (slug) do nothing;

-- 플랫폼 기본 규칙 (church_id null). 교회가 바꾸려면 같은 kind 로 church_id 가 든 행을 넣는다
insert into public.garden_rules (church_id, kind, label, xp, talent, daily_cap, active, sort) values
  (null, 'login',             '{"ko":"정원 들르기","en":"Daily visit"}',                     2, 1, 1, true, 10),
  (null, 'qt_amen',           '{"ko":"큐티 아멘","en":"QT Amen"}',                         10, 2, 0, true, 20),
  (null, 'streak_qt_7',       '{"ko":"큐티 7일 연속","en":"7-day QT streak"}',              20, 5, 0, true, 21),
  (null, 'bible_day',         '{"ko":"성경 읽기 하루 분량","en":"Bible reading day"}',       5, 1, 3, true, 30),
  (null, 'worship_sunday',    '{"ko":"주일 예배 출석","en":"Sunday worship"}',               20, 5, 1, true, 40),
  (null, 'worship_weekday',   '{"ko":"수요·새벽 기도회 출석","en":"Weekday prayer meeting"}', 10, 3, 2, true, 41),
  (null, 'audiobook_chapter', '{"ko":"오디오북 한 장 완청","en":"Audiobook chapter"}',       8, 2, 3, true, 50),
  (null, 'heart_given',       '{"ko":"성장기 하트","en":"Heart to a child"}',                 2, 1, 5, true, 60),
  (null, 'post',              '{"ko":"나눔터 글","en":"Board post"}',                         8, 2, 2, true, 70),
  (null, 'comment',           '{"ko":"댓글","en":"Comment"}',                                3, 1, 5, true, 71),
  (null, 'reaction',          '{"ko":"글 반응","en":"Reaction"}',                            1, 0, 5, true, 72),
  (null, 'album_like',        '{"ko":"앨범 좋아요","en":"Album like"}',                       1, 0, 5, true, 73),
  (null, 'form_entry',        '{"ko":"행사 신청","en":"Event sign-up"}',                     15, 5, 1, true, 80),
  (null, 'modu_day',          '{"ko":"모두의 성경 읽기","en":"Bible app day"}',                5, 1, 1, true, 90),
  (null, 'plant_done',        '{"ko":"열매 거두기","en":"Harvest"}',                          0, 30, 0, true, 100),
  (null, 'weather_rain',      '{"ko":"비 오는 날","en":"Rainy day"}',                         3, 0, 1, false, 200)
on conflict (kind) where church_id is null do nothing;

-- ──────────────────────────────────────────────────────────────
-- 11) RLS + 권한 — 읽기만 정책으로 열고, 쓰기는 함수로만 (Supabase 는 새 표에 anon·authenticated 모든 권한을 주므로 거둔다)
-- ──────────────────────────────────────────────────────────────
alter table public.garden_regions     enable row level security;
alter table public.garden_churches    enable row level security;
alter table public.garden_memberships enable row level security;
alter table public.garden_profiles    enable row level security;
alter table public.garden_plots       enable row level security;
alter table public.garden_species     enable row level security;
alter table public.garden_rules       enable row level security;
alter table public.garden_gardens     enable row level security;
alter table public.garden_ledger      enable row level security;

-- 소속·관리자 판정 (security definer 라 garden_memberships 정책 안에서 써도 재귀가 없다)
create or replace function public.garden_is_member(p_church uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.garden_memberships m
                  where m.church_id = p_church and m.user_id = auth.uid() and m.status = 'active')
$$;
create or replace function public.garden_is_admin(p_church uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.uid = auth.uid())           -- 1단계: 이 사이트 관리자 = 플랫폼 운영자
      or exists (select 1 from public.garden_memberships m
                  where m.church_id = p_church and m.user_id = auth.uid()
                    and m.status = 'active' and m.role in ('owner','admin'))
$$;
revoke all on function public.garden_is_member(uuid), public.garden_is_admin(uuid) from public, anon;
grant execute on function public.garden_is_member(uuid), public.garden_is_admin(uuid) to authenticated;

-- 공개 디렉터리(개인정보 없음)
drop policy if exists "garden_regions read" on public.garden_regions;
create policy "garden_regions read" on public.garden_regions for select to anon, authenticated using (true);
drop policy if exists "garden_churches read" on public.garden_churches;
create policy "garden_churches read" on public.garden_churches for select to anon, authenticated using (is_active);
drop policy if exists "garden_species read" on public.garden_species;
create policy "garden_species read" on public.garden_species for select to anon, authenticated using (true);
drop policy if exists "garden_species admin write" on public.garden_species;
create policy "garden_species admin write" on public.garden_species for all to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));

-- 소속: 본인 행, 교회 관리자는 그 교회 전체
drop policy if exists "garden_memberships read" on public.garden_memberships;
create policy "garden_memberships read" on public.garden_memberships for select to authenticated
  using (user_id = auth.uid() or public.garden_is_admin(church_id));

-- 프로필: 본인 · 공개 · 같은 교회(visibility=church) · 사이트 관리자
drop policy if exists "garden_profiles read" on public.garden_profiles;
create policy "garden_profiles read" on public.garden_profiles for select to authenticated
  using (user_id = auth.uid()
      or visibility = 'public'
      or (visibility = 'church' and exists (
            select 1 from public.garden_memberships a join public.garden_memberships b on b.church_id = a.church_id
             where a.user_id = auth.uid() and b.user_id = garden_profiles.user_id
               and a.status = 'active' and b.status = 'active'))
      or exists (select 1 from public.admins x where x.uid = auth.uid()));

-- 자리: 그 교회 소속만(도시 맵 그리기). 손님은 garden_peek 로
drop policy if exists "garden_plots read" on public.garden_plots;
create policy "garden_plots read" on public.garden_plots for select to authenticated
  using (public.garden_is_member(church_id) or public.garden_is_admin(church_id));

-- 정원·장부: 본인, 교회 관리자
drop policy if exists "garden_gardens read" on public.garden_gardens;
create policy "garden_gardens read" on public.garden_gardens for select to authenticated
  using (user_id = auth.uid() or public.garden_is_admin(church_id));
drop policy if exists "garden_ledger read" on public.garden_ledger;
create policy "garden_ledger read" on public.garden_ledger for select to authenticated
  using (user_id = auth.uid() or public.garden_is_admin(church_id));

-- 규칙: 로그인한 누구나 읽고(무엇이 얼마인지), 쓰기는 플랫폼 기본값 = 사이트 관리자 · 교회 행 = 그 교회 관리자. 지우기 정책 없음
drop policy if exists "garden_rules read" on public.garden_rules;
create policy "garden_rules read" on public.garden_rules for select to authenticated using (true);
drop policy if exists "garden_rules admin insert" on public.garden_rules;
create policy "garden_rules admin insert" on public.garden_rules for insert to authenticated
  with check ((church_id is null and exists (select 1 from public.admins a where a.uid = auth.uid()))
           or (church_id is not null and public.garden_is_admin(church_id)));
drop policy if exists "garden_rules admin update" on public.garden_rules;
create policy "garden_rules admin update" on public.garden_rules for update to authenticated
  using ((church_id is null and exists (select 1 from public.admins a where a.uid = auth.uid()))
      or (church_id is not null and public.garden_is_admin(church_id)))
  with check ((church_id is null and exists (select 1 from public.admins a where a.uid = auth.uid()))
           or (church_id is not null and public.garden_is_admin(church_id)));

revoke all on public.garden_regions, public.garden_churches, public.garden_memberships, public.garden_profiles,
              public.garden_plots, public.garden_species, public.garden_rules, public.garden_gardens, public.garden_ledger
  from anon, authenticated;
grant select on public.garden_regions, public.garden_churches, public.garden_species to anon, authenticated;
grant select on public.garden_memberships, public.garden_profiles, public.garden_plots,
                public.garden_gardens, public.garden_ledger, public.garden_rules to authenticated;
grant insert, update on public.garden_rules, public.garden_species to authenticated;     -- 실제 허용은 RLS(관리자)
grant usage, select on sequence public.garden_rules_id_seq to authenticated;
-- garden_plots_id_seq · garden_ledger_id_seq 는 security definer 함수만 쓴다 → 권한을 주지 않는다

-- ──────────────────────────────────────────────────────────────
-- 12) 안쪽 함수 — 규칙 합치기 · 교회 찾기
-- ──────────────────────────────────────────────────────────────
-- 유효 규칙: 교회 행이 있으면 그것, 없으면 플랫폼 기본
create or replace function public.garden_rules_eff(p_church uuid)
returns table (kind text, label jsonb, xp int, talent int, daily_cap int, active boolean, sort int)
language sql stable security definer set search_path = public as $$
  select distinct on (r.kind) r.kind, r.label, r.xp, r.talent, r.daily_cap, r.active, r.sort
    from public.garden_rules r
   where r.church_id = p_church or r.church_id is null
   order by r.kind, (r.church_id is null)           -- 교회 행(false)이 먼저 → 이긴다
$$;
revoke all on function public.garden_rules_eff(uuid) from public, anon, authenticated;

-- p_church: null/'' → 내 기본 교회(is_primary) → 이 사이트 교회 / uuid / slug
create or replace function public.garden_resolve_church(p_church text default null) returns uuid
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(btrim(p_church), '') = '' then
      coalesce((select m.church_id from public.garden_memberships m
                 where m.user_id = auth.uid() and m.is_primary and m.status = 'active'),
               public.garden_default_church())
    when p_church ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      (select c.id from public.garden_churches c where c.id = p_church::uuid and c.is_active)
    else (select c.id from public.garden_churches c where c.slug = lower(btrim(p_church)) and c.is_active)
  end
$$;
revoke all on function public.garden_resolve_church(text) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 13) 어댑터 — 이 사이트의 기존 표(읽기만) → 후보 (종류, 참조, 시각)
--     · 모두 user_id = p_uid 로만 읽는다 (관리자는 전원 행이 보이므로)
--     · 표가 없으면(로컬) to_regclass 로 건너뛴다. 날짜만 있는 기록(출석·하트)은 교회 시간대 정오로 둔다
--     · 출석: 본인 교적 키만 (my_member_keys() 는 배우자 키까지 돌려주므로 쓰지 않는다). 준회원은 교적 연결 뒤 다음 동기화에서 소급
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_derive_woonpyung(p_uid uuid, p_church uuid)
returns table (kind text, ref text, happened_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_tz text; v_key text;
begin
  select c.timezone into v_tz from public.garden_churches c where c.id = p_church;
  v_tz := coalesce(v_tz, 'Asia/Seoul');
  if to_regclass('public.member_links') is not null then
    select ml.member_key into v_key from public.member_links ml
     where ml.user_id = p_uid and coalesce(ml.member_key, '') <> '';
  end if;

  if to_regclass('public.qt_checks') is not null then
    return query select 'qt_amen'::text, q.check_date::text, q.created_at
                   from public.qt_checks q where q.user_id = p_uid;
    -- 큐티 7일 연속: 이어진 날짜 묶음(gaps & islands) 안의 7·14·21…번째 날
    return query
      select 'streak_qt_7'::text, s.check_date::text, s.created_at
        from (select q.check_date, q.created_at,
                     row_number() over (partition by q.grp order by q.check_date) as rn
                from (select q0.check_date, q0.created_at,
                             q0.check_date - (row_number() over (order by q0.check_date))::int as grp
                        from public.qt_checks q0 where q0.user_id = p_uid) q) s
       where s.rn % 7 = 0;
  end if;
  if to_regclass('public.bible_reading') is not null then
    return query select 'bible_day'::text, b.day_no::text, b.done_at
                   from public.bible_reading b where b.user_id = p_uid;
  end if;
  if to_regclass('public.audiobook_progress') is not null then
    return query select 'audiobook_chapter'::text, a.chapter_id, a.updated_at
                   from public.audiobook_progress a where a.user_id = p_uid and a.done;
  end if;
  if v_key is not null and to_regclass('public.attendance') is not null then
    -- 주일(1부·2부·예배)은 날짜당 1건으로 합치고, 평일은 날짜|예배. 주일학교(어린이)는 제외
    return query
      select (case when a.service like '주일%' then 'worship_sunday' else 'worship_weekday' end)::text,
             (case when a.service like '주일%' then a.att_date::text else a.att_date::text || '|' || a.service end),
             ((a.att_date + time '12:00') at time zone v_tz)
        from public.attendance a where a.member_key = v_key and a.service <> '주일학교';
  end if;
  if to_regclass('public.ss_submissions') is not null then
    -- liked_uids 는 jsonb 문자열 배열 → ? 연산자. 하트마다 시각은 없으므로 인증 날짜 정오
    return query select 'heart_given'::text, s.id::text, ((s.sub_date + time '12:00') at time zone v_tz)
                   from public.ss_submissions s where s.liked_uids ? p_uid::text;
  end if;
  if to_regclass('public.posts') is not null then
    return query select 'post'::text, p.id::text, p.created_at from public.posts p where p.user_id = p_uid;
  end if;
  if to_regclass('public.comments') is not null then
    return query select 'comment'::text, 'post:' || m.id::text, m.created_at from public.comments m where m.user_id = p_uid;
  end if;
  if to_regclass('public.album_comments') is not null then
    return query select 'comment'::text, 'album:' || m.id::text, m.created_at from public.album_comments m where m.user_id = p_uid;
  end if;
  if to_regclass('public.post_reactions') is not null then
    return query select 'reaction'::text, r.post_id::text || '|' || r.type, r.created_at
                   from public.post_reactions r where r.user_id = p_uid;
  end if;
  if to_regclass('public.album_likes') is not null then
    return query select 'album_like'::text, l.photo_id::text, l.created_at from public.album_likes l where l.user_id = p_uid;
  end if;
  if to_regclass('public.app_entries') is not null then
    return query select 'form_entry'::text, e.form_id::text, e.created_at
                   from public.app_entries e where e.user_id = p_uid and e.status = 'active';
  end if;
  if to_regclass('public.modu_activity') is not null then
    -- 활동한 날마다 1건 (교회 시간대 날짜). (user_id, at) 인덱스로 날짜별 집계
    return query
      select 'modu_day'::text, d.day::text, d.first_at
        from (select (m.at at time zone v_tz)::date as day, min(m.at) as first_at
                from public.modu_activity m where m.user_id = p_uid group by 1) d;
  end if;
  return;
end $$;
revoke all on function public.garden_derive_woonpyung(uuid, uuid) from public, anon, authenticated;

-- 후보 = 플랫폼 공통(오늘 들르기) + 교회 어댑터(settings->>'adapter' 로 분기). 다른 교회는 어댑터 없이 플랫폼 활동만
create or replace function public.garden_candidates(p_uid uuid, p_church uuid)
returns table (kind text, ref text, happened_at timestamptz, source text)
language plpgsql stable security definer set search_path = public as $$
declare c public.garden_churches;
begin
  select * into c from public.garden_churches where id = p_church;
  if not found then return; end if;
  return query select 'login'::text, ((now() at time zone c.timezone)::date)::text, now(), 'platform'::text;
  if coalesce(c.settings->>'adapter', '') = 'woonpyung' then
    return query select d.kind, d.ref, d.happened_at, 'woonpyung_adapter'::text
                   from public.garden_derive_woonpyung(p_uid, p_church) d;
  end if;
  return;
end $$;
revoke all on function public.garden_candidates(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 14) 소속·프로필·자리·정원 행 보장 — true = 정원을 새로 만들었다(첫 방문), false = 이미 있었다, null = 이 교회 소속이 아니다
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_ensure_member(p_church uuid, p_uid uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_status text; v_no int; v_x int; v_y int; v_plot bigint; v_nick text; v_new boolean;
begin
  select m.status into v_status from public.garden_memberships m where m.church_id = p_church and m.user_id = p_uid;
  if v_status is not null and v_status <> 'active' then return null; end if;
  if v_status is null then
    if p_church <> public.garden_default_church() then return null; end if;      -- 1단계: 이 사이트 교회만 자동 가입
    insert into public.garden_memberships (church_id, user_id, role, is_primary, external_id)
    values (p_church, p_uid,
            case when exists (select 1 from public.admins a where a.uid = p_uid) then 'admin' else 'member' end,
            not exists (select 1 from public.garden_memberships m where m.user_id = p_uid and m.is_primary),
            'woonpyung:' || p_uid::text)
    on conflict (church_id, user_id) do nothing;
  end if;

  if to_regclass('public.profiles') is not null then
    select left(nullif(btrim(p.name), ''), 20) into v_nick from public.profiles p where p.id = p_uid;
  end if;
  insert into public.garden_profiles (user_id, nickname) values (p_uid, coalesce(v_nick, '성도'))
  on conflict (user_id) do nothing;

  select p.id into v_plot from public.garden_plots p where p.church_id = p_church and p.owner_user_id = p_uid;
  if v_plot is null then
    perform pg_advisory_xact_lock(hashtext('garden_plot'), hashtext(p_church::text));   -- 교회 단위: 같은 번호 두 번 방지
    insert into public.garden_plots (church_id, plot_no, x, y, kind) values (p_church, 0, 0, 0, 'church')
    on conflict (church_id, plot_no) do nothing;
    -- 비어 있는 가장 작은 번호 (떠난 사람 자리·예약 자리 모두 고려)
    select s.n into v_no
      from generate_series(1, (select coalesce(max(plot_no), 0) + 1 from public.garden_plots where church_id = p_church)) s(n)
     where not exists (select 1 from public.garden_plots p where p.church_id = p_church and p.plot_no = s.n)
     order by s.n limit 1;
    select sp.x, sp.y into v_x, v_y from public.garden_spiral_xy(v_no) sp;
    insert into public.garden_plots (church_id, plot_no, owner_user_id, x, y, kind)
    values (p_church, v_no, p_uid, v_x, v_y, 'garden') returning id into v_plot;
  end if;

  insert into public.garden_gardens (church_id, user_id, plot_id) values (p_church, p_uid, v_plot)
  on conflict (church_id, user_id) do nothing;
  v_new := found;
  return v_new;
end $$;
revoke all on function public.garden_ensure_member(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 15) 상태 JSON — garden_state · garden_sync · garden_set_plant 가 함께 쓴다. garden 이 null 이면 아직 동기화 전
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
                 'plants_done', g.plants_done, 'last_sync_at', g.last_sync_at)
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
                                                           'done_xp', s.done_xp, 'stage_names', s.stage_names) order by s.sort), '[]'::json)
                  from public.garden_species s where s.active))
    from public.garden_churches c where c.id = p_church
$$;
revoke all on function public.garden_state_json(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 16) 동기화(안쪽) — 소급·멱등. SQL Editor 에서 소급·시험할 때도 이 함수를 쓴다
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_sync_user(p_uid uuid, p_church uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  c public.garden_churches; g public.garden_gardens;
  v_t0 timestamptz := clock_timestamp();       -- 이번 동기화에 적힌 행을 고르는 표식
  v_first boolean; v_xp int; v_tal int; v_stage_xp int[]; v_done int; v_harvest int;
  v_new json; v_new_n int; v_new_xp int; v_new_t int; v_locale text;
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
  select count(*)::int, coalesce(sum(t.xp), 0)::int, coalesce(sum(t.talent), 0)::int,
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
-- 17) 공개 RPC
-- ──────────────────────────────────────────────────────────────
create or replace function public.garden_state(p_church text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  return public.garden_state_json(v_church, auth.uid());
end $$;
revoke all on function public.garden_state(text) from public, anon;
grant execute on function public.garden_state(text) to authenticated;

create or replace function public.garden_sync(p_church text default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  return public.garden_sync_user(auth.uid(), v_church);
end $$;
revoke all on function public.garden_sync(text) from public, anon;
grant execute on function public.garden_sync(text) to authenticated;

-- 식물 종류·이름 (첫 심기, 뒤에 바꾸기도 됨 — 경험치는 그대로, 단계만 새 종류 문턱으로 다시 셈)
create or replace function public.garden_set_plant(p_church text, p_species text, p_name text default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_name text := left(btrim(coalesce(p_name, '')), 20); v_xp int; v_thr int[];
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  select s.stage_xp into v_thr from public.garden_species s where s.slug = p_species and s.active;
  if not found then return json_build_object('ok', false, 'why', 'species'); end if;
  select g.plant_xp into v_xp from public.garden_gardens g where g.church_id = v_church and g.user_id = auth.uid() for update;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;     -- 먼저 garden_sync
  update public.garden_gardens
     set species = p_species, plant_name = v_name, chosen_at = coalesce(chosen_at, now()),
         stage = public.garden_stage(v_xp, v_thr)
   where church_id = v_church and user_id = auth.uid();
  return json_build_object('ok', true, 'state', public.garden_state_json(v_church, auth.uid()));
end $$;
revoke all on function public.garden_set_plant(text, text, text) from public, anon;
grant execute on function public.garden_set_plant(text, text, text) to authenticated;

-- 플랫폼 프로필 (null 인 인자는 그대로 둔다)
create or replace function public.garden_set_profile(p_nickname text default null, p_avatar_url text default null,
                                                     p_visibility text default null, p_locale text default null,
                                                     p_avatar_key text default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_nick text := case when p_nickname is null then null else left(btrim(p_nickname), 20) end; v_def text;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  if v_nick = '' then return json_build_object('ok', false, 'why', 'nickname'); end if;
  if p_visibility is not null and p_visibility not in ('public','church','private') then return json_build_object('ok', false, 'why', 'visibility'); end if;
  if p_locale is not null and p_locale not in ('ko','en') then return json_build_object('ok', false, 'why', 'locale'); end if;
  if p_avatar_key is not null and p_avatar_key !~ '^[a-z0-9-]{1,20}$' then return json_build_object('ok', false, 'why', 'avatar'); end if;
  if p_avatar_url is not null and p_avatar_url <> '' and (char_length(p_avatar_url) > 300 or p_avatar_url !~ '^https://') then
    return json_build_object('ok', false, 'why', 'avatar');
  end if;
  if to_regclass('public.profiles') is not null then
    select left(nullif(btrim(p.name), ''), 20) into v_def from public.profiles p where p.id = auth.uid();
  end if;
  insert into public.garden_profiles (user_id, nickname, avatar_url, avatar_key, visibility, locale)
  values (auth.uid(), coalesce(v_nick, v_def, '성도'), coalesce(p_avatar_url, ''), coalesce(p_avatar_key, 'a'),
          coalesce(p_visibility, 'church'), coalesce(p_locale, 'ko'))
  on conflict (user_id) do update
     set nickname   = coalesce(v_nick, garden_profiles.nickname),
         avatar_url = coalesce(p_avatar_url, garden_profiles.avatar_url),
         avatar_key = coalesce(p_avatar_key, garden_profiles.avatar_key),
         visibility = coalesce(p_visibility, garden_profiles.visibility),
         locale     = coalesce(p_locale, garden_profiles.locale);
  return json_build_object('ok', true, 'me', (select json_build_object('nickname', p.nickname, 'avatar_url', p.avatar_url,
                                                 'avatar_key', p.avatar_key, 'visibility', p.visibility, 'locale', p.locale)
                                                from public.garden_profiles p where p.user_id = auth.uid()));
end $$;
revoke all on function public.garden_set_profile(text, text, text, text, text) from public, anon;
grant execute on function public.garden_set_profile(text, text, text, text, text) to authenticated;

-- 창고(내 장부) — 최신순, 한 번에 최대 100건
create or replace function public.garden_history(p_church text default null, p_limit int default 50, p_offset int default 0) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid; v_locale text;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  v_locale := coalesce((select p.locale from public.garden_profiles p where p.user_id = auth.uid()), 'ko');
  return json_build_object('ok', true,
    'total', (select count(*) from public.garden_ledger l where l.church_id = v_church and l.user_id = auth.uid()),
    'rows', (select coalesce(json_agg(json_build_object('id', l.id, 'kind', l.kind,
                      'label', coalesce(r.label->>v_locale, r.label->>'ko', l.kind), 'ref', l.ref,
                      'xp', l.xp, 'talent', l.talent, 'at', l.at, 'source', l.source) order by l.at desc, l.id desc), '[]'::json)
               from (select * from public.garden_ledger
                      where church_id = v_church and user_id = auth.uid()
                      order by at desc, id desc
                      limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) l
               left join public.garden_rules_eff(v_church) r on r.kind = l.kind));
end $$;
revoke all on function public.garden_history(text, int, int) from public, anon;
grant execute on function public.garden_history(text, int, int) to authenticated;

-- 둘러보기 (로그인 없이도) — 공개 범위에 맞는 필드만. user_id·경험치 합계는 내보내지 않는다 (2단계 이웃·타교회 방문용)
create or replace function public.garden_peek(p_church_slug text, p_plot_no int default 0) returns json
language plpgsql stable security definer set search_path = public as $$
declare c public.garden_churches; pl public.garden_plots; pr public.garden_profiles; v_vis boolean;
begin
  select * into c from public.garden_churches where slug = lower(btrim(coalesce(p_church_slug, ''))) and is_active;
  if not found then return json_build_object('ok', false, 'why', 'church'); end if;
  select * into pl from public.garden_plots where church_id = c.id and plot_no = coalesce(p_plot_no, 0);
  if not found then return json_build_object('ok', false, 'why', 'plot'); end if;
  if pl.kind <> 'garden' or pl.owner_user_id is null then
    return json_build_object('ok', true, 'visible', false,
      'church', json_build_object('slug', c.slug, 'name', c.name, 'city', c.city_name, 'theme', c.theme),
      'plot', json_build_object('plot_no', pl.plot_no, 'x', pl.x, 'y', pl.y, 'kind', pl.kind));
  end if;
  select * into pr from public.garden_profiles where user_id = pl.owner_user_id;
  v_vis := coalesce(pl.owner_user_id = auth.uid(), false)                       -- 로그인 안 했으면 null → false
        or coalesce(pr.visibility, 'private') = 'public'
        or (coalesce(pr.visibility, 'private') = 'church' and auth.uid() is not null and public.garden_is_member(c.id));
  return json_build_object('ok', true, 'visible', v_vis,
    'church', json_build_object('slug', c.slug, 'name', c.name, 'city', c.city_name, 'theme', c.theme),
    'plot', json_build_object('plot_no', pl.plot_no, 'x', pl.x, 'y', pl.y, 'kind', pl.kind),
    'profile', case when v_vis then json_build_object('nickname', pr.nickname, 'avatar_url', pr.avatar_url, 'avatar_key', pr.avatar_key) end,
    'garden', case when v_vis then (select json_build_object('species', g.species, 'species_name', s.name,
                 'plant_name', g.plant_name, 'stage', g.stage, 'stage_names', s.stage_names,
                 'plants_done', g.plants_done, 'planted_at', g.planted_at)
                 from public.garden_gardens g join public.garden_species s on s.slug = g.species
                where g.church_id = c.id and g.user_id = pl.owner_user_id) end);
end $$;
revoke all on function public.garden_peek(text, int) from public;
grant execute on function public.garden_peek(text, int) to anon, authenticated;

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
