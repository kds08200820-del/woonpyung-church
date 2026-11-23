-- ============================================================
--  운평장로교회 — 부서 부장의 온라인 재정 청원 (2026-11-24 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  목사님: "재정청원을 각 부의 부장들이 할 수 있도록 해 주세요. 교적 db를 연동시켜 주세요.
--          청원을 온라인으로 할 때 해당 계정을 입력하고 남은 예산이 몇 %인지 표기되도록.
--          청원이 올라온 내역은 재정청원서에 기재되며, 영수증도 첨부가 되도록."
--  정한 규칙(목사님 답):
--   · 부장은 재정관리에서 지정한다 — 부서마다 교적에서 부장을 고르고, 청원할 수 있는 예산 계정(항)을 정한다.
--   · 올라온 청원은 재정부가 「확인」해야 그 주 지출결의서에 들어간다.
--   · 청원은 제출한 뒤 돌아오는 주일(주일에 내면 그날)의 지출결의서로 간다.
--   · 부장 화면에는 집행률과 남은 예산을 둘 다 보인다.
--   · (추가 지시) "방송실, 반주자처럼 재정 청원을 할 수 있는 권한 설정" → member_links.can_petition.
--     교적관리 ▸ 권한 관리에서 「재정 청원」을 주면, 부서 부장이 아니어도 모든 예산 계정으로 청원할 수 있다(부서 칸은 비운다).
--     부장(fin_dept_heads)은 권한 없이도 자기 부서 계정으로 청원한다.
--
--  들어 있는 것 (모두 비파괴: ADD COLUMN(기본값 false) · CREATE TABLE · CREATE FUNCTION 뿐):
--   0) member_links.can_petition + list_access · set_worship_role('petition') · broadcast_access 에 canPetition 추가
--   1) fin_dept_heads : 부서 · 부장(교적 키) · 청원할 수 있는 예산 계정(항) 목록. 재정 권한자만 읽고 쓴다.
--   2) fin_petitions  : 온라인 청원(부서 · 관 · 항 · 내역 · 금액 · 메모 · 영수증 주소 · 결의서 주일 · 상태).
--                       상태: submitted(확인 대기) → approved(확인, 결의서에 들어감) / rejected(돌려보냄) / cancelled(부장이 거둠).
--                       부장은 자기 청원만 읽고, 쓰기는 아래 함수로만 한다. 재정 권한자는 모두 읽는다.
--   3) 함수
--      fin_my_depts()                     : 로그인한 사람이 부장인 부서 목록(교적 키로 잇는다)
--      fin_dept_budget(부서)              : 그 부서 계정의 연 예산 · 장부 집행 · 청원 중 금액(부장 또는 재정 권한자)
--                                           부서 '' = 재정 청원 권한자용(모든 지출 계정)
--      fin_petition_submit(...)           : 부장이 청원을 낸다(계정이 부서 계정인지, 금액 확인)
--      fin_petition_cancel(id)            : 부장이 확인 전 청원을 거둔다
--      fin_petition_review(id, 상태, 메모): 재정 권한자가 확인 · 돌려보냄 · 다시 대기로
--   필요한 것: public.admins, public.member_links, public.can_access_finance(), public.budget, public.expenses,
--              public.mission_fy() (20261110_1900_mission_committee.sql)
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · 권한: 20261121_1500_meeting_docs.sql 의 list_access · set_worship_role, 20261009_1900_worship_roles.sql 의 broadcast_access 를 다시 실행
--            alter table public.member_links rename column can_petition to can_petition_archived;   (DROP 대신 RENAME)
--    · 함수: drop function if exists public.fin_my_depts(), public.fin_dept_budget(text),
--            public.fin_petition_submit(text, text, text, bigint, text, jsonb), public.fin_petition_cancel(bigint),
--            public.fin_petition_review(bigint, text, text), public.fin_is_head(text), public.fin_can_petition();
--    · 표: alter table public.fin_petitions rename to fin_petitions_archived;
--          alter table public.fin_dept_heads rename to fin_dept_heads_archived;   (DROP 하지 않는다)
-- ============================================================

-- ── 0) 재정 청원 권한 (방송실 관리자 · 반주자와 같은 방식) ─────────────
alter table public.member_links add column if not exists can_petition boolean not null default false;

-- 권한 목록(관리자만) — canPetition 추가 (나머지는 20261121_1500_meeting_docs.sql 과 같다)
create or replace function public.list_access()
returns json language sql security definer set search_path = public as $$
  select coalesce(json_agg(row), '[]'::json) from (
    select json_build_object(
      'uid', p.id, 'name', coalesce(l.member_name, p.name, ''), 'email', coalesce(p.email,''),
      'status', coalesce(l.member_status,'준회원'), 'canFinance', coalesce(l.can_finance,false),
      'canBroadcast', coalesce(l.can_broadcast,false),
      'canAccompany', coalesce(l.can_accompany,false),
      'canPastor', coalesce(l.can_pastor,false),
      'canSession', coalesce(l.can_session,false),
      'canPetition', coalesce(l.can_petition,false),
      'isAdmin', exists(select 1 from public.admins a where a.uid = p.id)
    ) as row
    from public.profiles p left join public.member_links l on l.user_id = p.id
    where exists(select 1 from public.admins where uid = auth.uid())
    order by exists(select 1 from public.admins a where a.uid = p.id) desc, coalesce(l.member_name, p.name)
  ) t;
$$;

-- 지명/해제 (관리자만) — 'petition' 추가 (나머지는 20261121_1500_meeting_docs.sql 과 같다)
create or replace function public.set_worship_role(p_uid uuid, p_role text, p_on boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.admins where uid = auth.uid()) then
    return json_build_object('ok', false, 'error', '관리자만 지명할 수 있습니다.');
  end if;
  if p_role = 'accompany' then
    insert into public.member_links(user_id, can_accompany, updated_at) values (p_uid, coalesce(p_on,false), now())
    on conflict (user_id) do update set can_accompany = coalesce(p_on,false), updated_at = now();
  elsif p_role = 'pastor' then
    insert into public.member_links(user_id, can_pastor, updated_at) values (p_uid, coalesce(p_on,false), now())
    on conflict (user_id) do update set can_pastor = coalesce(p_on,false), updated_at = now();
  elsif p_role = 'session' then
    insert into public.member_links(user_id, can_session, updated_at) values (p_uid, coalesce(p_on,false), now())
    on conflict (user_id) do update set can_session = coalesce(p_on,false), updated_at = now();
  elsif p_role = 'petition' then
    insert into public.member_links(user_id, can_petition, updated_at) values (p_uid, coalesce(p_on,false), now())
    on conflict (user_id) do update set can_petition = coalesce(p_on,false), updated_at = now();
  else
    return json_build_object('ok', false, 'error', '알 수 없는 권한입니다.');
  end if;
  return json_build_object('ok', true);
end $$;
revoke all on function public.set_worship_role(uuid, text, boolean) from public, anon;
grant execute on function public.set_worship_role(uuid, text, boolean) to authenticated;

create or replace function public.fin_can_petition()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_petition from public.member_links where user_id = auth.uid()), false)
$$;
revoke all on function public.fin_can_petition() from public, anon;
grant execute on function public.fin_can_petition() to authenticated;

-- ── 1) 부서 · 부장 ───────────────────────────────────────────
create table if not exists public.fin_dept_heads (
  id          bigint generated always as identity primary key,
  dept        text not null check (char_length(dept) between 1 and 40),
  head_name   text not null default '',
  member_key  text,                                   -- 교적 매칭키 (이름|YYYYMMDD) — member_links.member_key 와 잇는다
  accounts    text[] not null default '{}',           -- 청원할 수 있는 예산 계정(항) 이름
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists fin_dept_heads_key_idx on public.fin_dept_heads (member_key) where active;

alter table public.fin_dept_heads enable row level security;
drop policy if exists "fin_dept_heads_fin" on public.fin_dept_heads;
create policy "fin_dept_heads_fin" on public.fin_dept_heads
  for all using (public.can_access_finance()) with check (public.can_access_finance());
revoke all on public.fin_dept_heads from anon;
grant select, insert, update on public.fin_dept_heads to authenticated;

-- ── 2) 온라인 청원 ───────────────────────────────────────────
create table if not exists public.fin_petitions (
  id             bigint generated always as identity primary key,
  dept           text not null default '',          -- '' = 재정 청원 권한자의 청원(부서 없음)
  head_id        bigint references public.fin_dept_heads (id) on delete set null,
  requester_uid  uuid references auth.users (id) on delete set null default auth.uid(),
  requester_name text not null default '',
  gwan           text not null default '',
  hang           text not null,
  item           text not null check (char_length(item) between 1 and 200),
  amount         bigint not null check (amount > 0 and amount < 100000000000),
  memo           text not null default '',
  receipts       jsonb not null default '[]'::jsonb,  -- 영수증 파일 주소 목록
  week_sunday    date not null,                       -- 들어갈 지출결의서의 주일
  status         text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'cancelled')),
  review_note    text not null default '',
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists fin_petitions_week_idx on public.fin_petitions (week_sunday, status);
create index if not exists fin_petitions_user_idx on public.fin_petitions (requester_uid);

alter table public.fin_petitions enable row level security;
drop policy if exists "fin_petitions_select" on public.fin_petitions;
create policy "fin_petitions_select" on public.fin_petitions
  for select using (requester_uid = auth.uid() or public.can_access_finance());
-- 쓰기는 아래 함수로만(직접 insert/update 권한을 주지 않는다)
revoke all on public.fin_petitions from anon, authenticated;
grant select on public.fin_petitions to authenticated;

-- ── 3) 함수 ──────────────────────────────────────────────────
-- 로그인한 사람이 이 부서의 (활성) 부장인가 → 부장 줄 id
create or replace function public.fin_is_head(p_dept text)
returns bigint
language sql stable security definer set search_path = public as $$
  select h.id from public.fin_dept_heads h
    join public.member_links m on m.member_key = h.member_key and m.user_id = auth.uid()
   where h.active and h.dept = p_dept and h.member_key is not null and h.member_key <> ''
   order by h.id limit 1
$$;
revoke all on function public.fin_is_head(text) from public, anon;
grant execute on function public.fin_is_head(text) to authenticated;

create or replace function public.fin_my_depts()
returns table (id bigint, dept text, head_name text, accounts text[])
language sql stable security definer set search_path = public as $$
  select h.id, h.dept, h.head_name, h.accounts
    from public.fin_dept_heads h
    join public.member_links m on m.member_key = h.member_key and m.user_id = auth.uid()
   where h.active and h.member_key is not null and h.member_key <> ''
   order by h.dept
$$;
revoke all on function public.fin_my_depts() from public, anon;
grant execute on function public.fin_my_depts() to authenticated;

-- 부서 계정의 예산 현황(오늘이 속한 회기). 부장은 자기 부서만, 재정 권한자는 모든 부서.
--   spent   = 장부(expenses)에 적힌 지출
--   pending = 아직 장부에 오르지 않았을 청원(확인 대기 + 이번 주일 이후 결의서로 확인된 것)
create or replace function public.fin_dept_budget(p_dept text)
returns table (gwan text, hang text, budget bigint, spent bigint, pending bigint, fy int, d_from date, d_to date)
language plpgsql stable security definer set search_path = public as $$
declare
  v_acc  text[];
  v_fy   record;
  v_sun  date := (now() at time zone 'Asia/Seoul')::date - extract(dow from (now() at time zone 'Asia/Seoul')::date)::int;
begin
  if coalesce(p_dept, '') = '' then
    -- 재정 청원 권한자: 모든 지출 예산 계정
    if not public.fin_can_petition() and not public.can_access_finance() then
      raise exception '재정 청원 권한이 필요합니다.';
    end if;
    select array_agg(bb.name order by bb.code) into v_acc from public.budget bb where bb.atype = '지출' and right(bb.code, 4) <> '0000';
  else
    if public.fin_is_head(p_dept) is null and not public.can_access_finance() then
      raise exception '이 부서의 부장만 볼 수 있습니다.';
    end if;
    select array_agg(distinct a) into v_acc from public.fin_dept_heads h, unnest(h.accounts) a where h.active and h.dept = p_dept;
  end if;
  select * into v_fy from public.mission_fy();
  return query
  select coalesce((select g.name from public.budget g
                    where g.atype = '지출' and g.code = left(b.code, 3) || '0000' limit 1), '')::text,
         a::text,
         coalesce(b.budget, 0)::bigint,
         coalesce((select sum(e.amount) from public.expenses e
                    where e.account = a and e.exp_date between v_fy.d_from and v_fy.d_to), 0)::bigint,
         coalesce((select sum(p.amount) from public.fin_petitions p
                    where p.hang = a and p.week_sunday between v_fy.d_from and v_fy.d_to
                      and (p.status = 'submitted' or (p.status = 'approved' and p.week_sunday >= v_sun))), 0)::bigint,
         v_fy.fy, v_fy.d_from, v_fy.d_to
    from unnest(coalesce(v_acc, '{}'::text[])) a
    left join lateral (select bb.code, bb.budget from public.budget bb
                        where bb.atype = '지출' and bb.name = a and right(bb.code, 4) <> '0000'
                        order by bb.code limit 1) b on true;
end $$;
revoke all on function public.fin_dept_budget(text) from public, anon;
grant execute on function public.fin_dept_budget(text) to authenticated;

-- 부장이 청원을 낸다 → 돌아오는 주일의 지출결의서로
create or replace function public.fin_petition_submit(p_dept text, p_hang text, p_item text, p_amount bigint,
                                                     p_memo text default '', p_receipts jsonb default '[]'::jsonb)
returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  v_head  bigint := public.fin_is_head(p_dept);
  v_acc   text[];
  v_name  text;
  v_gwan  text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_id    bigint;
begin
  if coalesce(p_dept, '') = '' then
    if not public.fin_can_petition() then raise exception '재정 청원 권한이 필요합니다.'; end if;
    if not exists (select 1 from public.budget b where b.atype = '지출' and b.name = p_hang and right(b.code, 4) <> '0000') then
      raise exception '예산에 없는 계정입니다: %', p_hang;
    end if;
  else
    if v_head is null then raise exception '이 부서의 부장만 청원할 수 있습니다.'; end if;
    select accounts into v_acc from public.fin_dept_heads where id = v_head;
    if not (p_hang = any (v_acc)) then raise exception '이 부서가 청원할 수 있는 계정이 아닙니다: %', p_hang; end if;
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception '금액을 확인해 주세요.'; end if;
  if coalesce(btrim(p_item), '') = '' then raise exception '지출 내역을 적어 주세요.'; end if;
  if jsonb_typeof(coalesce(p_receipts, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_receipts, '[]'::jsonb)) > 10 then
    raise exception '영수증은 10장까지 붙일 수 있습니다.';
  end if;
  select coalesce(nullif(m.member_name, ''), split_part(m.member_key, '|', 1)) into v_name from public.member_links m where m.user_id = auth.uid();
  select coalesce((select g.name from public.budget g where g.atype = '지출' and g.code = left(b.code, 3) || '0000' limit 1), '')
    into v_gwan
    from public.budget b where b.atype = '지출' and b.name = p_hang and right(b.code, 4) <> '0000' order by b.code limit 1;
  insert into public.fin_petitions (dept, head_id, requester_uid, requester_name, gwan, hang, item, amount, memo, receipts, week_sunday)
  values (coalesce(p_dept, ''), v_head, auth.uid(), coalesce(v_name, ''), coalesce(v_gwan, ''), p_hang, btrim(p_item), p_amount,
          coalesce(p_memo, ''), coalesce(p_receipts, '[]'::jsonb),
          v_today + ((7 - extract(dow from v_today)::int) % 7))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.fin_petition_submit(text, text, text, bigint, text, jsonb) from public, anon;
grant execute on function public.fin_petition_submit(text, text, text, bigint, text, jsonb) to authenticated;

-- 부장이 확인 전 청원을 거둔다
create or replace function public.fin_petition_cancel(p_id bigint)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  update public.fin_petitions set status = 'cancelled', updated_at = now()
   where id = p_id and requester_uid = auth.uid() and status = 'submitted';
  if not found then raise exception '확인 전의 내 청원만 거둘 수 있습니다.'; end if;
end $$;
revoke all on function public.fin_petition_cancel(bigint) from public, anon;
grant execute on function public.fin_petition_cancel(bigint) to authenticated;

-- 재정 권한자가 확인 · 돌려보냄 · 다시 대기로
create or replace function public.fin_petition_review(p_id bigint, p_status text, p_note text default '')
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.can_access_finance() then raise exception '재정 권한이 필요합니다.'; end if;
  if p_status not in ('approved', 'rejected', 'submitted') then raise exception '알 수 없는 상태: %', p_status; end if;
  update public.fin_petitions
     set status = p_status, review_note = coalesce(p_note, ''), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   where id = p_id and status <> 'cancelled';
  if not found then raise exception '청원을 찾지 못했습니다.'; end if;
end $$;
revoke all on function public.fin_petition_review(bigint, text, text) from public, anon;
grant execute on function public.fin_petition_review(bigint, text, text) to authenticated;

-- ── 4) 내 권한 — canPetition · isDeptHead 추가 (나머지는 20261009_1900_worship_roles.sql 과 같다) ──
--   머리글 메뉴가 이것으로 교회행정 ▸ 「재정 청원」을 보인다(관리자가 아닌 청원자에게는 그 항목만, 권한 없는 사람에게는 안 보인다).
create or replace function public.broadcast_access()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'isAdmin', exists(select 1 from public.admins where uid = auth.uid()),
    'canBroadcast', coalesce((select can_broadcast from public.member_links where user_id = auth.uid()), false),
    'canAccompany', coalesce((select can_accompany from public.member_links where user_id = auth.uid()), false),
    'canPastor', coalesce((select can_pastor from public.member_links where user_id = auth.uid()), false),
    'canPetition', coalesce((select can_petition from public.member_links where user_id = auth.uid()), false),
    'isDeptHead', exists(select 1 from public.fin_dept_heads h
                          join public.member_links m on m.member_key = h.member_key and m.user_id = auth.uid()
                         where h.active and coalesce(h.member_key, '') <> '')
  );
$$;
revoke all on function public.broadcast_access() from public;
grant execute on function public.broadcast_access() to authenticated;
