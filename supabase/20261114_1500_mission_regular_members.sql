-- ============================================================
--  운평장로교회 — 구제선교위원회: 정회원 가입 신청 · 회비 납부 기록 (2026-11-14 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--  먼저 실행되어 있어야 하는 것: 20261113_1200_mission_officers_ledger.sql (mission_officers · mission_can · mission_can_book)
--
--  목사님: "정회원 회원가입 신청을 홈페이지에 해 주세요. 회비 납부 내역을 회계가 체크하고
--          개인이 대시보드에서 확인할 수 있도록 교적과 함께 DB 연동."
--  회칙 개정안(2026-11-15 총회): 일반회원 = 선교헌금을 낸 모든 성도, 정회원 = 홈페이지로 가입,
--          정회원은 탈퇴하지 않는 한 다음 회기에 자동 연장(명부의 상태가 회기와 상관없이 이어진다),
--          정회원 회비 연 10만 원(월 1만 원), 임원회비 월 2만 원, 실행위원 5인(정회원 중 추천, 임원회비 없음),
--          총회 의결권 = 그 회기 회비를 총회 전까지 낸 정회원(화면이 회비 칸으로 '완납'을 보여 준다).
--
--  들어 있는 것 (모두 비파괴: CREATE TABLE · CREATE FUNCTION 뿐):
--   1) mission_regular_members : 정회원 명부. 신청 → 정회원(승인) / 반려 / 탈퇴. 실행위원 표시.
--                                교적 키(member_key)는 신청한 계정의 교적 연결(member_links)에서 가져온다.
--   1-2) mission_pay_account   : 회비 받는 계좌 한 줄(은행 · 계좌번호 · 예금주 · 토스 송금 링크). 회계가 정한다.
--   2) mission_dues            : 회비 납부 기록. 정회원 · 회기 · 칸(연납 또는 01~12월)마다 한 줄. 지우지 않고 paid 를 끈다.
--   3) 함수(화면은 이 함수로만 읽고 쓴다 — 두 표는 RLS 만 켜고 정책이 없어 직접 읽을 수 없다):
--        mission_join_me()            : 내 정회원 상태와 이번 회기 회비(대시보드 · 구제선교위원회 페이지)
--        mission_join_apply(이름, 한마디) / mission_join_cancel() : 가입 신청 · 신청 취소(탈퇴)
--        mission_roster(회기)          : 정회원 명부와 회비 칸 — 그 회기 임원 · 관리자 · 재정 담당
--        mission_member_set(…)         : 승인 · 반려 · 탈퇴 · 실행위원 · 메모 — 그 회기 임원 · 관리자 · 재정 담당
--        mission_member_add(이름)      : 홈페이지를 안 쓰는 분을 임원이 대신 올림(교적에서 같은 이름 한 분이면 연결)
--        mission_member_link(id)       : 교적 연결 다시 시도(같은 이름 한 분일 때만)
--        mission_dues_set(…)           : 회비 칸 체크 · 해제 — 그 회기 회계 · 관리자 · 재정 담당
--        mission_join_set_due_day(일)  : 본인이 회비 납부일(매달 며칠)을 정한다
--        mission_dues_push_feed()      : 납부일이 지났는데 이번 달(연납 포함) 회비가 체크되지 않은 정회원의 알림 열쇠 — 열쇠와 달만.
--                                        apps-script/mission-dues-push.gs 가 하루 한 번 읽어 그 기기에 푸시(달마다 한 번)
--        mission_pay_set(…)            : 회비 계좌 정하기 — 지금 회기 회계 · 관리자 · 재정 담당 (계좌는 mission_join_me 로 로그인한 성도에게 보인다)
--
--  회비 칸: 회기 2027 = 2026-12-01 ~ 2027-11-30. 칸 '12' 는 2026년 12월, '01' ~ '11' 은 2027년.
--           '연납' 칸은 한 해 회비를 한 번에 낸 것.
--  회비 장부와의 관계: 이 표는 '누가 냈는가' 확인표다. 통장 거래는 지금처럼 회계 장부(mission_ledger)에 따로 들어간다.
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · 먼저 화면에서 부르는 곳을 되돌린다(js/mission.js · js/dashboard.js 는 함수가 없으면 그 칸을 숨긴다).
--    · 함수: drop function if exists public.mission_join_me(int), public.mission_join_apply(text, text), public.mission_join_cancel(),
--            public.mission_roster(int), public.mission_member_set(bigint, text, boolean, text), public.mission_member_add(text),
--            public.mission_member_link(bigint), public.mission_dues_set(bigint, int, text, boolean, bigint, date, text),
--            public.mission_staff(int), public.mission_dues_rate(bigint, int), public.mission_dues_cells(bigint, int),
--            public.mission_gyojeok_key(text), public.mission_pay_set(text, text, text, text), public.mission_pay_info(),
--            public.mission_join_set_due_day(int), public.mission_dues_push_feed();
--    · 칸: alter table public.mission_regular_members rename column due_day to due_day_archived;  (push_key 도 같은 방식)
--    · Apps Script: 함수 목록에서 deleteMissionDuesPushTrigger 실행
--    · 표: alter table public.mission_dues rename to mission_dues_archived;
--          alter table public.mission_regular_members rename to mission_regular_members_archived;
--          alter table public.mission_pay_account rename to mission_pay_account_archived;   (DROP 하지 않는다)
-- ============================================================

-- ── 1) 정회원 명부 ──────────────────────────────────────────
create table if not exists public.mission_regular_members (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete set null,   -- 홈페이지로 신청한 계정 (임원이 대신 올리면 비어 있을 수 있다)
  member_key  text not null default '',                              -- 교적 키(이름|생년월일). 비어 있으면 교적 미연결
  name        text not null check (char_length(name) between 1 and 50),
  status      text not null default '신청' check (status in ('신청', '정회원', '반려', '탈퇴')),
  exec_member boolean not null default false,                        -- 실행위원
  note        text not null default '',                              -- 신청할 때 남긴 말
  staff_note  text not null default '',                              -- 임원 메모(신청자에게 안 보임)
  src         text not null default 'web' check (src in ('web', 'staff')),
  applied_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- 회비 납부일(매달 며칠, 본인이 정함)과 알림 열쇠(기기 OneSignal 태그 md=<열쇠>, 무작위 32자 — 이름·교적 키가 아님)
alter table public.mission_regular_members add column if not exists due_day int check (due_day between 1 and 31);
alter table public.mission_regular_members add column if not exists push_key text;
create unique index if not exists mission_regular_members_push_uq on public.mission_regular_members (push_key) where push_key is not null;
create unique index if not exists mission_regular_members_user_uq on public.mission_regular_members (user_id) where user_id is not null;
create index if not exists mission_regular_members_key_idx on public.mission_regular_members (member_key);
alter table public.mission_regular_members enable row level security;     -- 정책 없음 = 함수로만
revoke all on public.mission_regular_members from anon, authenticated;

-- ── 2) 회비 납부 기록 ───────────────────────────────────────
create table if not exists public.mission_dues (
  id         bigint generated always as identity primary key,
  member_id  bigint not null references public.mission_regular_members (id),
  fy_year    int  not null check (fy_year between 2000 and 2100),
  period     text not null check (period in ('연납', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12')),
  amount     bigint not null default 0 check (amount >= 0),
  paid       boolean not null default true,            -- 잘못 체크했으면 지우지 않고 false
  paid_date  date,
  note       text not null default '',
  checked_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index if not exists mission_dues_uq on public.mission_dues (member_id, fy_year, period);
alter table public.mission_dues enable row level security;
revoke all on public.mission_dues from anon, authenticated;

-- ── 2-2) 회비 받는 계좌 (한 줄) ─────────────────────────────
create table if not exists public.mission_pay_account (
  id         int primary key default 1 check (id = 1),
  bank       text not null default '' check (char_length(bank) <= 30),
  account    text not null default '' check (char_length(account) <= 40),
  holder     text not null default '' check (char_length(holder) <= 50),
  toss_url   text not null default '' check (toss_url = '' or toss_url ~* '^https://'),   -- 예) https://toss.me/아이디
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.mission_pay_account enable row level security;
revoke all on public.mission_pay_account from anon, authenticated;

create or replace function public.mission_pay_info()
returns jsonb
language sql stable security definer set search_path = public as $$
  select (select jsonb_build_object('bank', a.bank, 'account', a.account, 'holder', a.holder, 'toss_url', a.toss_url, 'updated_at', a.updated_at)
            from public.mission_pay_account a where a.id = 1 and (a.account <> '' or a.toss_url <> ''))
$$;
revoke all on function public.mission_pay_info() from public, anon, authenticated;

-- ── 3) 권한: 그 회기 임원(직책 상관없이) · 관리자 · 재정 담당 ──
create or replace function public.mission_staff(p_year int)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.is_finance()
    or exists (select 1 from public.mission_officers o join public.member_links l on l.member_key = o.member_key
                where l.user_id = auth.uid() and coalesce(o.member_key, '') <> '' and o.active and o.fy_year = p_year))
$$;
revoke all on function public.mission_staff(int) from public, anon;
grant execute on function public.mission_staff(int) to authenticated;

-- 한 달 회비: 그 회기 임원이면 2만 원(회칙 제12조 3호), 아니면 1만 원
create or replace function public.mission_dues_rate(p_member_id bigint, p_year int)
returns bigint
language sql stable security definer set search_path = public as $$
  select case when exists (
    select 1 from public.mission_regular_members m join public.mission_officers o on o.member_key = m.member_key
     where m.id = p_member_id and coalesce(m.member_key, '') <> '' and o.active and o.fy_year = p_year
       and o.role in ('위원장', '부위원장', '서기', '회계')) then 20000 else 10000 end::bigint
$$;
revoke all on function public.mission_dues_rate(bigint, int) from public, anon, authenticated;

-- 회기 하나의 회비 칸을 jsonb 로: {"연납": {"amount":…, "date":…}, "12": {…}, …} (paid 인 것만)
create or replace function public.mission_dues_cells(p_member_id bigint, p_year int)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(d.period, jsonb_build_object('amount', d.amount, 'date', d.paid_date, 'note', d.note)), '{}'::jsonb)
    from public.mission_dues d where d.member_id = p_member_id and d.fy_year = p_year and d.paid
$$;
revoke all on function public.mission_dues_cells(bigint, int) from public, anon, authenticated;

-- ── 4) 내 정회원 상태와 이번 회기 회비 ──────────────────────
--   교적 연결이 없는 계정도 신청할 수 있다. 내 줄 = 내가 신청한 줄, 또는 임원이 올린 줄 가운데 내 교적 키와 같은 줄.
create or replace function public.mission_join_me(p_year int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_key text;  v_lname text;
  v_fy int;  v_from date;  v_to date;
  m public.mission_regular_members%rowtype;
begin
  if v_uid is null then return null; end if;
  select f.fy, f.d_from, f.d_to into v_fy, v_from, v_to from public.mission_fy(p_year) f;
  select coalesce(l.member_key, ''), coalesce(l.member_name, '') into v_key, v_lname from public.member_links l where l.user_id = v_uid;
  select * into m from public.mission_regular_members r
   where r.user_id = v_uid or (coalesce(v_key, '') <> '' and r.member_key = v_key)
   order by (r.user_id = v_uid) desc nulls last, r.id desc limit 1;
  return jsonb_build_object(
    'year', v_fy, 'from', v_from, 'to', v_to,
    'linked', coalesce(v_key, '') <> '',
    'name', nullif(v_lname, ''),
    'member', case when m.id is null then null else jsonb_build_object(
        'status', m.status, 'exec', m.exec_member, 'applied_at', m.applied_at, 'approved_at', m.approved_at, 'linked', m.member_key <> '',
        'due_day', m.due_day, 'push_key', case when m.status = '정회원' then m.push_key end) end,
    'rate', case when m.id is null then 10000 else public.mission_dues_rate(m.id, v_fy) end,
    'pay', public.mission_pay_info(),
    'dues', case when m.id is null then '{}'::jsonb else public.mission_dues_cells(m.id, v_fy) end,
    'prev', case when m.id is null then '{}'::jsonb else public.mission_dues_cells(m.id, v_fy - 1) end);
end $$;
-- 비로그인도 부를 수 있다(늘 null) — 화면이 '이 기능이 준비되었는가'를 이 함수로 알아본다.
revoke all on function public.mission_join_me(int) from public;
grant execute on function public.mission_join_me(int) to anon, authenticated;

-- ── 5) 가입 신청 · 취소 ─────────────────────────────────────
create or replace function public.mission_join_apply(p_name text default null, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_key text := '';  v_lname text := '';  v_name text;
  m public.mission_regular_members%rowtype;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  select coalesce(l.member_key, ''), coalesce(l.member_name, '') into v_key, v_lname from public.member_links l where l.user_id = v_uid;
  v_key := coalesce(v_key, '');
  v_name := coalesce(nullif(btrim(v_lname), ''), nullif(btrim(p_name), ''));
  if v_name is null then raise exception '이름을 적어 주세요'; end if;
  v_name := left(v_name, 50);

  select * into m from public.mission_regular_members r
   where r.user_id = v_uid or (v_key <> '' and r.member_key = v_key)
   order by (r.user_id = v_uid) desc nulls last, r.id desc limit 1;

  if m.id is null then
    insert into public.mission_regular_members (user_id, member_key, name, note, src)
    values (v_uid, v_key, v_name, left(coalesce(p_note, ''), 500), 'web');
  elsif m.status in ('반려', '탈퇴') then
    update public.mission_regular_members
       set status = '신청', user_id = coalesce(user_id, v_uid), member_key = case when member_key = '' then v_key else member_key end,
           note = left(coalesce(p_note, ''), 500), applied_at = now(), approved_at = null, approved_by = null, updated_at = now()
     where id = m.id;
  elsif m.user_id is null then
    -- 임원이 대신 올려 둔 줄에 내 계정을 잇는다(상태는 그대로)
    update public.mission_regular_members set user_id = v_uid, updated_at = now() where id = m.id;
  end if;
  return public.mission_join_me(null);
end $$;
revoke all on function public.mission_join_apply(text, text) from public, anon;
grant execute on function public.mission_join_apply(text, text) to authenticated;

create or replace function public.mission_join_cancel()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  update public.mission_regular_members set status = '탈퇴', exec_member = false, updated_at = now()
   where user_id = v_uid and status in ('신청', '정회원');
  return public.mission_join_me(null);
end $$;
revoke all on function public.mission_join_cancel() from public, anon;
grant execute on function public.mission_join_cancel() to authenticated;

-- ── 6) 정회원 명부와 회비 칸 (임원 · 관리자 · 재정 담당) ────
--   교적 키는 내보내지 않는다. linked = 교적 연결 여부, officer = 그 회기 임원(회비 2만 원).
create or replace function public.mission_roster(p_year int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_fy int;
begin
  select f.fy into v_fy from public.mission_fy(p_year) f;
  if not public.mission_staff(v_fy) then return null; end if;
  return jsonb_build_object(
    'year', v_fy,
    'can_dues', public.mission_can_book(v_fy),
    'pay', public.mission_pay_info(),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', m.name, 'status', m.status, 'exec', m.exec_member,
               'linked', m.member_key <> '', 'web', m.user_id is not null, 'src', m.src,
               'note', m.note, 'staff_note', m.staff_note, 'applied_at', m.applied_at, 'approved_at', m.approved_at, 'due_day', m.due_day,
               'rate', public.mission_dues_rate(m.id, v_fy),
               'officer', public.mission_dues_rate(m.id, v_fy) = 20000,
               'dues', public.mission_dues_cells(m.id, v_fy))
             order by case m.status when '신청' then 1 when '정회원' then 2 when '반려' then 3 else 4 end, m.name, m.id)
        from public.mission_regular_members m), '[]'::jsonb));
end $$;
revoke all on function public.mission_roster(int) from public, anon;
grant execute on function public.mission_roster(int) to authenticated;

-- ── 7) 승인 · 반려 · 탈퇴 · 실행위원 · 메모 ─────────────────
create or replace function public.mission_member_set(p_id bigint, p_status text default null, p_exec boolean default null, p_staff_note text default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_fy int;
begin
  select f.fy into v_fy from public.mission_fy(null) f;
  if not public.mission_staff(v_fy) then raise exception '권한이 없습니다'; end if;
  if p_status is not null and p_status not in ('신청', '정회원', '반려', '탈퇴') then raise exception '상태 값이 틀렸습니다'; end if;
  update public.mission_regular_members
     set status      = coalesce(p_status, status),
         approved_at = case when p_status = '정회원' and status <> '정회원' then now() when p_status is not null and p_status <> '정회원' then null else approved_at end,
         approved_by = case when p_status = '정회원' and status <> '정회원' then auth.uid() when p_status is not null and p_status <> '정회원' then null else approved_by end,
         exec_member = case when coalesce(p_status, status) <> '정회원' then false else coalesce(p_exec, exec_member) end,
         staff_note  = coalesce(left(p_staff_note, 500), staff_note),
         updated_at  = now()
   where id = p_id;
  return found;
end $$;
revoke all on function public.mission_member_set(bigint, text, boolean, text) from public, anon;
grant execute on function public.mission_member_set(bigint, text, boolean, text) to authenticated;

-- 교적에서 같은 이름이 꼭 한 분이면 그 교적 키, 아니면 ''
create or replace function public.mission_gyojeok_key(p_name text)
returns text
language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then max(g.member_key) else '' end
    from public.gyojeok g where g.name = btrim(p_name) and coalesce(g.member_key, '') <> ''
$$;
revoke all on function public.mission_gyojeok_key(text) from public, anon, authenticated;

-- 홈페이지를 쓰지 않는 분을 임원이 대신 올린다 — 바로 정회원
create or replace function public.mission_member_add(p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fy int;  v_name text := left(btrim(coalesce(p_name, '')), 50);  v_key text;  v_uid uuid;  v_id bigint;
begin
  select f.fy into v_fy from public.mission_fy(null) f;
  if not public.mission_staff(v_fy) then raise exception '권한이 없습니다'; end if;
  if v_name = '' then raise exception '이름을 적어 주세요'; end if;
  v_key := public.mission_gyojeok_key(v_name);
  if v_key <> '' then
    if exists (select 1 from public.mission_regular_members where member_key = v_key) then raise exception '이미 명부에 있는 분입니다'; end if;
    select l.user_id into v_uid from public.member_links l where l.member_key = v_key
      and not exists (select 1 from public.mission_regular_members r where r.user_id = l.user_id) limit 1;
  end if;
  insert into public.mission_regular_members (user_id, member_key, name, status, src, approved_at, approved_by)
  values (v_uid, v_key, v_name, '정회원', 'staff', now(), auth.uid()) returning id into v_id;
  return jsonb_build_object('id', v_id, 'linked', v_key <> '');
end $$;
revoke all on function public.mission_member_add(text) from public, anon;
grant execute on function public.mission_member_add(text) to authenticated;

create or replace function public.mission_member_link(p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fy int;  v_name text;  v_key text;  v_uid uuid;
begin
  select f.fy into v_fy from public.mission_fy(null) f;
  if not public.mission_staff(v_fy) then raise exception '권한이 없습니다'; end if;
  select name, user_id into v_name, v_uid from public.mission_regular_members where id = p_id;
  if v_name is null then return jsonb_build_object('linked', false); end if;
  -- 신청한 계정이 그 사이 교적에 연결되었으면 그 키, 아니면 같은 이름 한 분
  select coalesce(l.member_key, '') into v_key from public.member_links l where v_uid is not null and l.user_id = v_uid;
  if coalesce(v_key, '') = '' then v_key := public.mission_gyojeok_key(v_name); end if;
  if v_key = '' or exists (select 1 from public.mission_regular_members where member_key = v_key and id <> p_id) then
    return jsonb_build_object('linked', false);
  end if;
  update public.mission_regular_members set member_key = v_key, updated_at = now() where id = p_id;
  return jsonb_build_object('linked', true);
end $$;
revoke all on function public.mission_member_link(bigint) from public, anon;
grant execute on function public.mission_member_link(bigint) to authenticated;

-- ── 8) 회비 칸 체크 · 해제 (회계 · 관리자 · 재정 담당) ──────
create or replace function public.mission_dues_set(p_member_id bigint, p_year int, p_period text, p_paid boolean,
                                                   p_amount bigint default null, p_date date default null, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_amt bigint;
begin
  if not public.mission_can_book(p_year) then raise exception '회비는 그 회기 회계가 기록합니다'; end if;
  if not exists (select 1 from public.mission_regular_members where id = p_member_id) then raise exception '명부에 없는 분입니다'; end if;
  if p_period not in ('연납', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12') then raise exception '칸 이름이 틀렸습니다'; end if;
  v_amt := coalesce(p_amount, case when p_period = '연납'
                                   then case when public.mission_dues_rate(p_member_id, p_year) = 20000 then 240000 else 100000 end
                                   else public.mission_dues_rate(p_member_id, p_year) end);
  if v_amt < 0 then raise exception '금액이 틀렸습니다'; end if;
  insert into public.mission_dues (member_id, fy_year, period, amount, paid, paid_date, note, checked_by, updated_at)
  values (p_member_id, p_year, p_period, v_amt, coalesce(p_paid, true),
          coalesce(p_date, (now() at time zone 'Asia/Seoul')::date), left(coalesce(p_note, ''), 200), auth.uid(), now())
  on conflict (member_id, fy_year, period) do update
     set paid = excluded.paid,
         amount = case when excluded.paid then excluded.amount else mission_dues.amount end,
         paid_date = case when excluded.paid then excluded.paid_date else mission_dues.paid_date end,
         note = excluded.note, checked_by = excluded.checked_by, updated_at = now();
  return public.mission_dues_cells(p_member_id, p_year);
end $$;
revoke all on function public.mission_dues_set(bigint, int, text, boolean, bigint, date, text) from public, anon;
grant execute on function public.mission_dues_set(bigint, int, text, boolean, bigint, date, text) to authenticated;

-- ── 9) 회비 계좌 정하기 (지금 회기 회계 · 관리자 · 재정 담당) ─
create or replace function public.mission_pay_set(p_bank text, p_account text, p_holder text, p_toss_url text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fy int;  v_toss text := btrim(coalesce(p_toss_url, ''));
begin
  select f.fy into v_fy from public.mission_fy(null) f;
  if not public.mission_can_book(v_fy) then raise exception '회비 계좌는 회계가 정합니다'; end if;
  if v_toss <> '' and v_toss !~* '^https?://' then v_toss := 'https://' || v_toss; end if;
  if v_toss ~* '^http://' then v_toss := regexp_replace(v_toss, '^http://', 'https://', 'i'); end if;
  insert into public.mission_pay_account (id, bank, account, holder, toss_url, updated_by, updated_at)
  values (1, left(btrim(coalesce(p_bank, '')), 30), left(btrim(coalesce(p_account, '')), 40), left(btrim(coalesce(p_holder, '')), 50), v_toss, auth.uid(), now())
  on conflict (id) do update set bank = excluded.bank, account = excluded.account, holder = excluded.holder,
         toss_url = excluded.toss_url, updated_by = excluded.updated_by, updated_at = now();
  return public.mission_pay_info();
end $$;
revoke all on function public.mission_pay_set(text, text, text, text) from public, anon;
grant execute on function public.mission_pay_set(text, text, text, text) to authenticated;

-- ── 10) 회비 납부일 (본인) ──────────────────────────────────
--   정하면 알림 열쇠도 함께 만든다. null 이면 납부일을 지운다(알림 없음).
create or replace function public.mission_join_set_due_day(p_day int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();  v_key text;  v_id bigint;
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if p_day is not null and (p_day < 1 or p_day > 31) then raise exception '납부일은 1일부터 31일 사이로 정해 주세요'; end if;
  select coalesce(l.member_key, '') into v_key from public.member_links l where l.user_id = v_uid;
  select r.id into v_id from public.mission_regular_members r
   where (r.user_id = v_uid or (coalesce(v_key, '') <> '' and r.member_key = v_key)) and r.status = '정회원'
   order by (r.user_id = v_uid) desc nulls last, r.id desc limit 1;
  if v_id is null then raise exception '정회원만 납부일을 정할 수 있습니다'; end if;
  update public.mission_regular_members
     set due_day = p_day, push_key = coalesce(push_key, replace(gen_random_uuid()::text, '-', '')), updated_at = now()
   where id = v_id;
  return public.mission_join_me(null);
end $$;
revoke all on function public.mission_join_set_due_day(int) from public, anon;
grant execute on function public.mission_join_set_due_day(int) to authenticated;

-- ── 11) 납부일이 지난 정회원의 알림 열쇠 (Apps Script 가 공개 키로 읽는다) ─
--   오늘(한국 시각)이 이번 달 납부일 다음 날 이후이고(말일보다 큰 납부일은 말일로), 이번 회기 연납도 이번 달 칸도 체크되지 않은 정회원.
--   돌려주는 것: 열쇠와 'YYYY-MM' 뿐 — 이름 · 교적 키 · 금액 없음. 같은 달에 두 번 보내지 않는 것은 Apps Script 가 기억한다.
create or replace function public.mission_dues_push_feed()
returns jsonb
language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone 'Asia/Seoul')::date as d),
       f as (select fy from public.mission_fy(null))
  select coalesce(jsonb_agg(jsonb_build_object('key', m.push_key, 'ym', to_char(t.d, 'YYYY-MM'))), '[]'::jsonb)
    from public.mission_regular_members m, t, f
   where m.status = '정회원' and m.due_day is not null and m.push_key is not null
     and extract(day from t.d)::int > least(m.due_day, extract(day from (date_trunc('month', t.d) + interval '1 month - 1 day'))::int)
     and not exists (select 1 from public.mission_dues d
                      where d.member_id = m.id and d.fy_year = f.fy and d.paid
                        and d.period in ('연납', to_char(t.d, 'MM')))
$$;
revoke all on function public.mission_dues_push_feed() from public;
grant execute on function public.mission_dues_push_feed() to anon, authenticated;

-- ── 실행 후 확인(메타데이터 · 건수만) ───────────────────────
--   select table_name from information_schema.tables where table_name in ('mission_regular_members', 'mission_dues', 'mission_pay_account');   -- 3개
--   select count(*) from pg_proc where proname in ('mission_join_me','mission_join_apply','mission_join_cancel','mission_roster',
--     'mission_member_set','mission_member_add','mission_member_link','mission_dues_set','mission_staff','mission_dues_rate',
--     'mission_dues_cells','mission_gyojeok_key','mission_pay_info','mission_pay_set','mission_join_set_due_day','mission_dues_push_feed');   -- 16
--   select count(*) from public.mission_regular_members;   -- 처음에는 0
