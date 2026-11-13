-- ============================================================
--  운평장로교회 — 구제선교위원회: 회기별 관리 · 임원 · 일정 · 회계 장부 (2026-11-13 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  목사님: "왼쪽에 메뉴바를 만들어서 연도별로 관리. 새 회기는 12월 1주에 시작, 그때부터 자동으로
--          2027년 회원 집계. 회계 보고는 엑셀을 넣으면 자동 분류되고 같은 표가 만들어지게.
--          회계 보고서 업로드는 구제선교위원회 회계가. 임원 명단은 최고 관리자가 정하고 권한은 자동 부여.
--          서기는 일정·동향·활동 내용 등록, 회계는 회계 자료 업로드와 회계 장부 기록·수정."
--
--  들어 있는 것 (모두 비파괴: CREATE · ADD COLUMN · 정책·함수 다시 정의):
--   1) mission_officers   : 회기별 임원(위원장·부위원장·서기·회계). 관리자(admins)만 넣고 고친다.
--                           교적 키(member_key)가 들어 있어 표는 관리자만 읽고, 이름·직책은 함수로 내보낸다.
--   2) mission_can(직책, 회기) : 관리자이거나, 그 회기에 그 직책으로 임명된 본인(교적에 연결된 계정)인가.
--   3) mission_posts.kind : '활동' | '동향'. 글쓰기·고치기를 서기에게도 연다.
--   4) mission_events     : 회기별 일정. 누구나 보고, 서기·관리자가 쓴다.
--   5) mission_books · mission_ledger · mission_ledger_rules : 회기별 회계 장부(시작 잔액, 거래, 분류 규칙).
--                           회계·관리자·재정 담당만 읽고 쓴다(거래 내용에 이름이 있을 수 있다).
--   6) mission_report()   : 장부에 거래가 있으면 장부에서 총괄·월별·항목별·날짜별 표를 계산해 돌려준다.
--                           장부가 비어 있으면 지금처럼 올려 둔 보고서(app_settings mission_report_<회기>)를 돌려준다.
--                           보는 사람: 그 회기 회원 · 그 회기 임원 · 관리자·재정 담당.
--   7) mission_home()     : 화면이 한 번에 읽는 것 — 회기 목록(2026 ~ 지금 회기), 임원 이름, 내 권한.
--
--  회기 = 재정 회계연도(12월 1일 시작). 2026-12-01 이 되면 mission_fy() 가 2027 을 돌려주므로
--  2027년도 회원 집계와 메뉴는 따로 손대지 않아도 생긴다.
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · mission_report : supabase/20261112_2100_mission_report_doc.sql 을 다시 실행
--    · mission_posts 정책 : supabase/20261110_1900_mission_committee.sql 의 mission_posts 정책 3개를 다시 실행
--    · 새 함수 : drop function if exists public.mission_home(); public.mission_can(text, int); public.mission_officer_list(int);
--    · 새 표 : alter table public.mission_officers rename to mission_officers_archived;  (mission_events,
--             mission_books, mission_ledger, mission_ledger_rules 도 같은 방식 — DROP 하지 않는다)
--    · mission_posts.kind 칼럼은 그대로 둔다(기본값 '활동'이라 해가 없다).
-- ============================================================

-- ── 1) 임원 ─────────────────────────────────────────────────
create table if not exists public.mission_officers (
  id         bigint generated always as identity primary key,
  fy_year    int  not null check (fy_year between 2000 and 2100),
  role       text not null check (role in ('위원장', '부위원장', '서기', '회계')),
  name       text not null check (char_length(name) between 1 and 50),
  member_key text not null default '',          -- 교적 키. 비어 있으면 이름만 보이고 권한은 없다
  sort       int  not null default 100,
  active     boolean not null default true,     -- 지우는 대신 끔
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mission_officers_year_idx on public.mission_officers (fy_year, role);

alter table public.mission_officers enable row level security;
drop policy if exists "mission_officers_admin_select" on public.mission_officers;
create policy "mission_officers_admin_select" on public.mission_officers
  for select using (exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "mission_officers_admin_insert" on public.mission_officers;
create policy "mission_officers_admin_insert" on public.mission_officers
  for insert with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "mission_officers_admin_update" on public.mission_officers;
create policy "mission_officers_admin_update" on public.mission_officers
  for update using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
revoke all on public.mission_officers from anon;
grant select, insert, update on public.mission_officers to authenticated;

-- ── 2) 권한: 관리자이거나, 그 회기에 그 직책으로 임명된 본인 ──
create or replace function public.mission_can(p_role text, p_year int)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.admins a where a.uid = auth.uid())
    or exists (
      select 1
        from public.mission_officers o
        join public.member_links l on l.member_key = o.member_key
       where l.user_id = auth.uid()
         and coalesce(o.member_key, '') <> ''
         and o.active and o.fy_year = p_year and o.role = p_role)
  )
$$;
revoke all on function public.mission_can(text, int) from public, anon;
grant execute on function public.mission_can(text, int) to authenticated;

-- ── 3) 활동·동향 글 — 서기도 쓴다 ───────────────────────────
alter table public.mission_posts add column if not exists kind text not null default '활동';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mission_posts_kind_check') then
    alter table public.mission_posts add constraint mission_posts_kind_check check (kind in ('활동', '동향'));
  end if;
end $$;

drop policy if exists "mission_posts_select" on public.mission_posts;
create policy "mission_posts_select" on public.mission_posts
  for select using (hidden = false or public.mission_can('서기', fy_year));
drop policy if exists "mission_posts_admin_insert" on public.mission_posts;
create policy "mission_posts_admin_insert" on public.mission_posts
  for insert with check (public.mission_can('서기', fy_year));
drop policy if exists "mission_posts_admin_update" on public.mission_posts;
create policy "mission_posts_admin_update" on public.mission_posts
  for update using (public.mission_can('서기', fy_year))
  with check (public.mission_can('서기', fy_year));

-- ── 4) 일정 ─────────────────────────────────────────────────
create table if not exists public.mission_events (
  id          bigint generated always as identity primary key,
  fy_year     int  not null check (fy_year between 2000 and 2100),
  event_date  date not null,
  end_date    date,
  title       text not null check (char_length(title) between 1 and 200),
  place       text not null default '',
  note        text not null default '',
  hidden      boolean not null default false,
  author_name text,
  user_id     uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists mission_events_year_idx on public.mission_events (fy_year, event_date);

alter table public.mission_events enable row level security;
drop policy if exists "mission_events_select" on public.mission_events;
create policy "mission_events_select" on public.mission_events
  for select using (hidden = false or public.mission_can('서기', fy_year));
drop policy if exists "mission_events_insert" on public.mission_events;
create policy "mission_events_insert" on public.mission_events
  for insert with check (public.mission_can('서기', fy_year));
drop policy if exists "mission_events_update" on public.mission_events;
create policy "mission_events_update" on public.mission_events
  for update using (public.mission_can('서기', fy_year))
  with check (public.mission_can('서기', fy_year));
grant select on public.mission_events to anon, authenticated;
grant insert, update on public.mission_events to authenticated;

-- ── 5) 회계 장부 ────────────────────────────────────────────
-- 장부를 읽고 쓰는 사람: 그 회기 회계 · 관리자 · 재정 담당
create or replace function public.mission_can_book(p_year int)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (public.is_finance() or public.mission_can('회계', p_year))
$$;
revoke all on function public.mission_can_book(int) from public, anon;
grant execute on function public.mission_can_book(int) to authenticated;

-- 회기마다 한 줄: 시작 잔액과 보고서 머리말
create table if not exists public.mission_books (
  fy_year         int primary key check (fy_year between 2000 and 2100),
  opening_balance bigint not null default 0,
  title           text not null default '',     -- 비우면 "<회기> 구제선교위원회 회계 보고서"
  intro           text not null default '',
  updated_at      timestamptz not null default now()
);
alter table public.mission_books enable row level security;
drop policy if exists "mission_books_select" on public.mission_books;
create policy "mission_books_select" on public.mission_books for select using (public.mission_can_book(fy_year));
drop policy if exists "mission_books_insert" on public.mission_books;
create policy "mission_books_insert" on public.mission_books for insert with check (public.mission_can_book(fy_year));
drop policy if exists "mission_books_update" on public.mission_books;
create policy "mission_books_update" on public.mission_books for update
  using (public.mission_can_book(fy_year)) with check (public.mission_can_book(fy_year));
revoke all on public.mission_books from anon;
grant select, insert, update on public.mission_books to authenticated;

-- 거래 한 줄
create table if not exists public.mission_ledger (
  id          bigint generated always as identity primary key,
  fy_year     int  not null check (fy_year between 2000 and 2100),
  entry_date  date not null,
  entry_time  text not null default '',          -- 'HH:MM:SS' (엑셀에 있으면)
  kind        text not null check (kind in ('수입', '지출')),
  category    text not null default '미분류' check (char_length(category) between 1 and 60),
  content     text not null default '',          -- 거래 내용(받는 곳·보낸 분) — 장부를 보는 사람에게만
  memo        text not null default '',
  method      text not null default '',          -- 거래 구분(일반입금·자동이체 …)
  amount      bigint not null check (amount > 0),
  src         text not null default 'manual' check (src in ('manual', 'excel')),
  dedupe      text,                              -- 엑셀에서 온 줄의 지문 — 같은 파일을 다시 올려도 겹치지 않게
  hidden      boolean not null default false,    -- 지우는 대신 뺌(보고서 계산에서 빠진다)
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists mission_ledger_year_idx on public.mission_ledger (fy_year, entry_date);
create unique index if not exists mission_ledger_dedupe_uq on public.mission_ledger (fy_year, dedupe);

alter table public.mission_ledger enable row level security;
drop policy if exists "mission_ledger_select" on public.mission_ledger;
create policy "mission_ledger_select" on public.mission_ledger for select using (public.mission_can_book(fy_year));
drop policy if exists "mission_ledger_insert" on public.mission_ledger;
create policy "mission_ledger_insert" on public.mission_ledger for insert with check (public.mission_can_book(fy_year));
drop policy if exists "mission_ledger_update" on public.mission_ledger;
create policy "mission_ledger_update" on public.mission_ledger for update
  using (public.mission_can_book(fy_year)) with check (public.mission_can_book(fy_year));
revoke all on public.mission_ledger from anon;
grant select, insert, update on public.mission_ledger to authenticated;

-- 분류 규칙: 거래 내용·메모·거래 구분에 낱말이 들어 있으면 그 항목으로
create table if not exists public.mission_ledger_rules (
  id         bigint generated always as identity primary key,
  keyword    text not null check (char_length(keyword) between 1 and 60),
  kind       text not null default '' check (kind in ('', '수입', '지출')),   -- 비우면 수입·지출 모두
  category   text not null check (char_length(category) between 1 and 60),
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
create unique index if not exists mission_ledger_rules_uq on public.mission_ledger_rules (keyword, kind);

-- 규칙은 회기와 상관없이 쓰므로: 어느 회기든 회계로 임명된 사람 · 관리자 · 재정 담당
create or replace function public.mission_can_rules()
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.is_finance()
    or exists (
      select 1 from public.mission_officers o join public.member_links l on l.member_key = o.member_key
       where l.user_id = auth.uid() and coalesce(o.member_key, '') <> '' and o.active and o.role = '회계'))
$$;
revoke all on function public.mission_can_rules() from public, anon;
grant execute on function public.mission_can_rules() to authenticated;

alter table public.mission_ledger_rules enable row level security;
drop policy if exists "mission_ledger_rules_select" on public.mission_ledger_rules;
create policy "mission_ledger_rules_select" on public.mission_ledger_rules for select using (public.mission_can_rules());
drop policy if exists "mission_ledger_rules_insert" on public.mission_ledger_rules;
create policy "mission_ledger_rules_insert" on public.mission_ledger_rules for insert with check (public.mission_can_rules());
drop policy if exists "mission_ledger_rules_update" on public.mission_ledger_rules;
create policy "mission_ledger_rules_update" on public.mission_ledger_rules for update
  using (public.mission_can_rules()) with check (public.mission_can_rules());
revoke all on public.mission_ledger_rules from anon;
grant select, insert, update on public.mission_ledger_rules to authenticated;

-- ── 임원 이름·직책 (누구나) — 교적 키는 내보내지 않는다 ─────
create or replace function public.mission_officer_list(p_year int)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('role', o.role, 'name', o.name)
           order by case o.role when '위원장' then 1 when '부위원장' then 2 when '서기' then 3 else 4 end, o.sort, o.id), '[]'::jsonb)
    from public.mission_officers o
   where o.fy_year = p_year and o.active
$$;
revoke all on function public.mission_officer_list(int) from public;
grant execute on function public.mission_officer_list(int) to anon, authenticated;

-- ── 6) 회계 보고 ────────────────────────────────────────────
create or replace function public.mission_report(p_year int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_fy int;  v_from date;  v_to date;
  v_uid uuid := auth.uid();
  v_ok boolean := false;
  v_doc text;
  v_n int;
  v_open bigint := 0;  v_title text := '';  v_intro text := '';
  v_in bigint;  v_out bigint;  v_d1 date;  v_d2 date;
  v_monthly jsonb;  v_items jsonb;  v_daily jsonb;  v_officers text;
begin
  select f.fy, f.d_from, f.d_to into v_fy, v_from, v_to from public.mission_fy(p_year) f;
  if v_uid is null then return null; end if;

  v_ok := public.is_finance()
       or exists (select 1 from public.admins a where a.uid = v_uid)
       or exists (select 1 from public.mission_officers o join public.member_links l on l.member_key = o.member_key
                   where l.user_id = v_uid and coalesce(o.member_key, '') <> '' and o.active and o.fy_year = v_fy)
       or exists (select 1 from public.offerings o
                   where o.category = '선교헌금' and o.offer_date between v_from and v_to and o.amount > 0
                     and coalesce(o.member_key, '') <> ''
                     and o.member_key in (select public.my_member_keys()));
  if not v_ok then return null; end if;

  select count(*)::int, coalesce(sum(amount) filter (where kind = '수입'), 0), coalesce(sum(amount) filter (where kind = '지출'), 0),
         min(entry_date), max(entry_date)
    into v_n, v_in, v_out, v_d1, v_d2
    from public.mission_ledger where fy_year = v_fy and not hidden;

  -- 장부가 비어 있으면: 올려 둔 보고서(있으면)를 그대로
  if v_n = 0 then
    select value into v_doc from public.app_settings where key = 'mission_report_' || v_fy;
    if v_doc is null or btrim(v_doc) = '' then return jsonb_build_object('year', v_fy, 'doc', null, 'source', 'none'); end if;
    return jsonb_build_object('year', v_fy, 'doc', v_doc::jsonb, 'source', 'doc');
  end if;

  select b.opening_balance, b.title, b.intro into v_open, v_title, v_intro from public.mission_books b where b.fy_year = v_fy;
  v_open := coalesce(v_open, 0);

  select coalesce(jsonb_agg(jsonb_build_object('ym', t.ym, 'income', t.i, 'spend', t.s, 'net', t.i - t.s,
                                               'balance', v_open + t.run) order by t.ym), '[]'::jsonb)
    into v_monthly
    from (select m.ym, m.i, m.s, sum(m.i - m.s) over (order by m.ym) as run
            from (select to_char(entry_date, 'YYYY-MM') as ym,
                         coalesce(sum(amount) filter (where kind = '수입'), 0) as i,
                         coalesce(sum(amount) filter (where kind = '지출'), 0) as s
                    from public.mission_ledger where fy_year = v_fy and not hidden group by 1) m) t;

  select coalesce(jsonb_agg(jsonb_build_object('date', t.d, 'income', t.i, 'spend', t.s, 'net', t.i - t.s,
                                               'balance', v_open + t.run) order by t.d), '[]'::jsonb)
    into v_daily
    from (select m.d, m.i, m.s, sum(m.i - m.s) over (order by m.d) as run
            from (select entry_date::text as d,
                         coalesce(sum(amount) filter (where kind = '수입'), 0) as i,
                         coalesce(sum(amount) filter (where kind = '지출'), 0) as s
                    from public.mission_ledger where fy_year = v_fy and not hidden group by 1) m) t;

  select coalesce(jsonb_agg(jsonb_build_object('label', t.category, 'income', t.i, 'spend', t.s, 'n', t.n) order by t.category), '[]'::jsonb)
    into v_items
    from (select category,
                 coalesce(sum(amount) filter (where kind = '수입'), 0) as i,
                 coalesce(sum(amount) filter (where kind = '지출'), 0) as s,
                 count(*)::int as n
            from public.mission_ledger where fy_year = v_fy and not hidden group by 1) t;

  select string_agg(o.role || ' ' || o.name, E'\n'
           order by case o.role when '위원장' then 1 when '부위원장' then 2 when '서기' then 3 else 4 end, o.sort, o.id)
    into v_officers
    from public.mission_officers o where o.fy_year = v_fy and o.active and o.role in ('위원장', '회계');

  return jsonb_build_object('year', v_fy, 'source', 'ledger', 'doc', jsonb_build_object(
    'title',    case when btrim(coalesce(v_title, '')) <> '' then v_title else v_fy || ' 구제선교위원회 회계 보고서' end,
    'officers', coalesce(v_officers, ''),
    'intro',    coalesce(v_intro, ''),
    'period',   jsonb_build_object('from', v_d1, 'to', v_d2),
    'summary',  jsonb_build_array(
                  jsonb_build_object('label', '시작 잔액', 'amount', v_open),
                  jsonb_build_object('label', '기간 수입', 'amount', v_in),
                  jsonb_build_object('label', '기간 지출', 'amount', v_out),
                  jsonb_build_object('label', '기간 수지', 'amount', v_in - v_out),
                  jsonb_build_object('label', '잔액',      'amount', v_open + v_in - v_out)),
    'monthly',  v_monthly,
    'items',    v_items,
    'daily',    v_daily));
end $$;
revoke all on function public.mission_report(int) from public, anon;
grant execute on function public.mission_report(int) to authenticated;

-- ── 7) 화면이 처음 읽는 것 ──────────────────────────────────
--   years  : 2026 부터 지금 회기까지(새 회기가 시작되면 저절로 늘어난다)
--   my     : 로그인한 사람의 권한 — admin, 그리고 회기별 직책
create or replace function public.mission_home()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_fy int;
  v_uid uuid := auth.uid();
  v_admin boolean := false;
  v_fin boolean := false;
  v_roles jsonb := '[]'::jsonb;
begin
  select f.fy into v_fy from public.mission_fy(null) f;
  if v_uid is not null then
    v_admin := exists (select 1 from public.admins a where a.uid = v_uid);
    v_fin   := public.is_finance();
    select coalesce(jsonb_agg(jsonb_build_object('year', o.fy_year, 'role', o.role)), '[]'::jsonb) into v_roles
      from public.mission_officers o join public.member_links l on l.member_key = o.member_key
     where l.user_id = v_uid and coalesce(o.member_key, '') <> '' and o.active;
  end if;
  return jsonb_build_object(
    'current', v_fy,
    'years',   (select jsonb_agg(y order by y desc) from generate_series(least(2026, v_fy), v_fy) y),
    'my',      jsonb_build_object('admin', v_admin, 'finance', v_fin, 'roles', v_roles));
end $$;
revoke all on function public.mission_home() from public;
grant execute on function public.mission_home() to anon, authenticated;

-- ── 실행 후 확인(메타데이터·건수만) ─────────────────────────
--   select proname from pg_proc where proname like 'mission%' order by 1;        -- 9개
--   select table_name from information_schema.tables where table_name like 'mission%' order by 1;   -- 7개
--   select public.mission_home() - 'my';                                          -- 지금 회기와 회기 목록
--   select count(*) from public.mission_ledger;                                   -- 0
