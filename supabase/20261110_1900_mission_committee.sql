-- ============================================================
--  운평장로교회 — 구제선교위원회 (2026-11-10 담임목사 지시)
--   1) mission_posts     : 연간 사역 게시판 (회기 연도별 글, 글쓰기는 관리자)
--   2) mission_partners  : 후원하는 교회·기관 (관리자가 넣고 고침)
--   3) mission_committee(): 회원 = 그 회기(회계연도) 안에 선교헌금을 1회 이상 낸 사람
--        · 금액은 어떤 경우에도 돌려주지 않는다.
--        · 공개 범위(app_settings.mission_member_visibility)
--            'admin' = 회원 수·명단 모두 관리자·재정 권한자만
--            'count' = 회원 수는 누구나, 명단은 관리자·재정 권한자만   ← 기본값
--            'names' = 회원 수는 누구나, 이름은 교적에 연결된 성도(로그인)에게
--        · 로그인한 사람은 자기 자신(+배우자)이 회원인지만 따로 알 수 있다.
--   4) mission_set_visibility(): 공개 범위 바꾸기 (관리자만)
--
--  비파괴 변경만 들어 있다(CREATE · INSERT). 여러 번 실행해도 안전하다.
--  필요한 것: public.admins, public.offerings, public.app_settings,
--            public.member_links, public.is_finance(), public.my_member_keys()
--
--  ── 되돌리는 방법 (사람이 직접, 화면에서 구제선교위원회 페이지를 내린 뒤) ──
--    drop function if exists public.mission_committee(int);
--    drop function if exists public.mission_set_visibility(text);
--    drop function if exists public.mission_fy(int);
--    alter table public.mission_posts    rename to mission_posts_archived;
--    alter table public.mission_partners rename to mission_partners_archived;
--    -- 공개 범위 설정 줄은 남겨 두어도 해가 없다(app_settings.key = 'mission_member_visibility').
-- ============================================================

-- ── 1) 연간 사역 게시판 ─────────────────────────────────────
create table if not exists public.mission_posts (
  id          bigint generated always as identity primary key,
  fy_year     int  not null check (fy_year between 2000 and 2100),   -- 회기 연도(재정 회계연도와 같은 이름)
  title       text not null check (char_length(title) between 1 and 200),
  body        text not null default '',
  event_date  date,                                                  -- 사역한 날(없어도 됨)
  hidden      boolean not null default false,                        -- 지우는 대신 숨김
  author_name text,
  user_id     uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists mission_posts_year_idx on public.mission_posts (fy_year, event_date);

alter table public.mission_posts enable row level security;

drop policy if exists "mission_posts_select" on public.mission_posts;
create policy "mission_posts_select" on public.mission_posts
  for select using (hidden = false or exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "mission_posts_admin_insert" on public.mission_posts;
create policy "mission_posts_admin_insert" on public.mission_posts
  for insert with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "mission_posts_admin_update" on public.mission_posts;
create policy "mission_posts_admin_update" on public.mission_posts
  for update using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));

grant select on public.mission_posts to anon, authenticated;
grant insert, update on public.mission_posts to authenticated;

-- ── 2) 후원하는 교회·기관 ───────────────────────────────────
create table if not exists public.mission_partners (
  id         bigint generated always as identity primary key,
  kind       text not null default '교회' check (kind in ('교회', '기관')),
  name       text not null check (char_length(name) between 1 and 100),
  summary    text not null default '',     -- 한 줄 소개 (예: 제천 작은 교회)
  person     text not null default '',     -- 담당자 (예: ○○○ 목사)
  address    text not null default '',     -- 주소 — 있으면 '지도 보기'
  url        text not null default '',     -- 홈페이지 — 있으면 '홈페이지 보기'
  sort       int  not null default 100,
  active     boolean not null default true,   -- 지우는 대신 숨김(후원을 마친 곳)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mission_partners enable row level security;

drop policy if exists "mission_partners_select" on public.mission_partners;
create policy "mission_partners_select" on public.mission_partners
  for select using (active = true or exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "mission_partners_admin_insert" on public.mission_partners;
create policy "mission_partners_admin_insert" on public.mission_partners
  for insert with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "mission_partners_admin_update" on public.mission_partners;
create policy "mission_partners_admin_update" on public.mission_partners
  for update using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));

grant select on public.mission_partners to anon, authenticated;
grant insert, update on public.mission_partners to authenticated;

-- 처음 한 번: 지금 홈페이지 「선교」에 이미 올라 있던 네 교회를 그대로 옮긴다(표가 비어 있을 때만).
insert into public.mission_partners (kind, name, summary, person, address, url, sort)
select v.kind, v.name, v.summary, v.person, v.address, v.url, v.sort
  from (values
    ('교회', '삽시벧엘교회',   '충청도 섬마을 작은 교회',   '김제현 목사', '충남 보령시 오천면 삽시도3길 97', '', 10),
    ('교회', '용연교회',       '전북 산간 지역 작은 교회',  '차재용 목사', '동상주천로 181-2', '', 20),
    ('교회', '청전교회',       '제천 작은 교회',            '고노엘 목사', '충북 제천시 고암로10길 10', '', 30),
    ('교회', '아름다운숲교회', '동탄 도심 속 개척 교회',    '장정훈 목사', '', 'https://bfch.or.kr/556', 40)
  ) as v(kind, name, summary, person, address, url, sort)
 where not exists (select 1 from public.mission_partners);

-- ── 3) 회기(회계연도) 범위 — js/finance.js 의 fyRange·curFY 와 같은 규칙 ──
--   시작 월 = app_settings.fy_start_month (없으면 12월). 시작 월이 8월 이상이면 '끝나는 해'로 부른다.
--   예) 12월 시작 → 2026년도 = 2025-12-01 ~ 2026-11-30.   p_year 가 없으면 오늘이 속한 회기.
create or replace function public.mission_fy(p_year int default null)
returns table (fy int, d_from date, d_to date)
language plpgsql stable security definer set search_path = public as $$
declare
  v_sm    int;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_y     int  := extract(year  from v_today)::int;
  v_m     int  := extract(month from v_today)::int;
  v_fy    int;
  v_sy    int;
begin
  begin
    select nullif(btrim(value), '')::int into v_sm from public.app_settings where key = 'fy_start_month';
  exception when others then v_sm := null;
  end;
  if v_sm is null or v_sm < 1 or v_sm > 12 then v_sm := 12; end if;

  if p_year is not null then v_fy := p_year;
  elsif v_sm = 1  then v_fy := v_y;
  elsif v_sm >= 8 then v_fy := case when v_m >= v_sm then v_y + 1 else v_y end;
  else                 v_fy := case when v_m >= v_sm then v_y else v_y - 1 end;
  end if;

  v_sy := case when v_sm >= 8 then v_fy - 1 else v_fy end;
  fy     := v_fy;
  d_from := make_date(v_sy, v_sm, 1);
  d_to   := (d_from + interval '1 year' - interval '1 day')::date;
  return next;
end $$;

revoke all on function public.mission_fy(int) from public, anon, authenticated;

-- ── 4) 구제선교위원회 회원 ──────────────────────────────────
--   회원 = 그 회기 안에 항목 '선교헌금' 을 1회 이상 낸 사람.
--   · 교적에 연결된 헌금은 member_key 로, 연결 안 된 헌금은 헌금자 이름으로 한 사람씩 센다.
--   · 이름이 비었거나 무명·익명인 헌금은 세지 않는다.
--   · 금액은 돌려주지 않는다. 낸 횟수(cnt)는 관리자·재정 권한자에게만.
create or replace function public.mission_committee(p_year int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_fy    int;  v_from date;  v_to date;
  v_vis   text;
  v_uid   uuid := auth.uid();
  v_staff boolean := false;
  v_linked boolean := false;
  v_count int;
  v_me    boolean;
  v_names jsonb;
  v_detail jsonb;
begin
  select f.fy, f.d_from, f.d_to into v_fy, v_from, v_to from public.mission_fy(p_year) f;

  select value into v_vis from public.app_settings where key = 'mission_member_visibility';
  if v_vis is null or v_vis not in ('admin', 'count', 'names') then v_vis := 'count'; end if;

  if v_uid is not null then
    v_staff  := public.is_finance();
    v_linked := exists (select 1 from public.member_links m where m.user_id = v_uid and coalesce(m.member_key, '') <> '');
  end if;

  with m as (
    select case when coalesce(o.member_key, '') <> '' then o.member_key else 'g:' || btrim(o.giver) end as k,
           max(case when coalesce(o.member_key, '') <> '' then split_part(o.member_key, '|', 1) else btrim(o.giver) end) as name,
           bool_or(coalesce(o.member_key, '') <> '') as linked,
           count(*)::int as cnt
      from public.offerings o
     where o.category = '선교헌금'
       and o.offer_date between v_from and v_to
       and o.amount > 0
       and (coalesce(o.member_key, '') <> ''
            or btrim(coalesce(o.giver, '')) not in ('', '무명', '익명', '무기명', '무명씨'))
     group by 1
  )
  select count(*)::int,
         case when v_uid is null then null
              else exists (select 1 from m where m.k in (select public.my_member_keys())) end,
         coalesce(jsonb_agg(m.name order by m.name), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'cnt', m.cnt, 'linked', m.linked) order by m.name), '[]'::jsonb)
    into v_count, v_me, v_names, v_detail
    from m;

  return jsonb_build_object(
    'year',       v_fy,
    'from',       v_from,
    'to',         v_to,
    'visibility', v_vis,
    'staff',      v_staff,
    'me',         v_me,
    'count',      case when v_staff or v_vis in ('count', 'names') then v_count end,
    'names',      case when v_staff or (v_vis = 'names' and v_linked) then v_names end,
    'detail',     case when v_staff then v_detail end
  );
end $$;

revoke all on function public.mission_committee(int) from public;
grant execute on function public.mission_committee(int) to anon, authenticated;

-- ── 5) 공개 범위 바꾸기 (관리자만) ──────────────────────────
create or replace function public.mission_set_visibility(p_visibility text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then
    raise exception '관리자만 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  if p_visibility is null or p_visibility not in ('admin', 'count', 'names') then
    raise exception '공개 범위는 admin · count · names 가운데 하나여야 합니다.' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at) values ('mission_member_visibility', p_visibility, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return p_visibility;
end $$;

revoke all on function public.mission_set_visibility(text) from public, anon;
grant execute on function public.mission_set_visibility(text) to authenticated;

-- ── 실행 후 확인(건수·메타데이터만) ─────────────────────────
--   select count(*) from public.mission_partners;                       -- 처음 실행이면 4
--   select count(*) from public.mission_posts;                          -- 0
--   select proname from pg_proc where proname like 'mission_%';         -- 3개
--   select (public.mission_committee(null)) - 'names' - 'detail';       -- 연도·기간·회원 수만
