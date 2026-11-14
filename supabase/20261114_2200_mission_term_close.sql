-- ============================================================
--  운평장로교회 — 구제선교위원회: 회기 마감 (2026-11-14 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--  먼저 실행되어 있어야 하는 것: 20261110_1900 · 20261113_1200 · 20261114_1500 (mission_fy · mission_home · 정회원 명부)
--
--  목사님: "관리자 페이지에서 회기년도 마감을 누르면 내년부터는 2028년이 새롭게 생성되어야 합니다."
--          "회계자료 열람 기간을 설정할 수 있도록. 설정하지 않았을 때 기본으로 11월 3주 ~ 12월 1주까지 공개.
--           이후 비공개 전환되고, 임원에게만 보이도록." "공개, 비공개 전환도 언제든 임원이 할 수 있습니다."
--          "정회원 승인은 자동으로 되도록 해 주세요. 이후 회비 납부 안내를 해 주세요."
--
--  규칙:
--   · 회기 메뉴 = 2026 부터 '지금 회기' 까지 + 다음 회기 1개('준비').
--   · '지금 회기' = 날짜로 정한 회기(12월 1일 시작)와 '마지막으로 마감한 회기 + 1' 가운데 큰 것.
--     예) 지금(2026-11-14) 2026 이 '지금', 2027 이 '준비'.
--         관리자가 2026 을 마감하면 → 2027 이 '지금', 2028 이 '준비'로 새로 생긴다.
--         마감하지 않아도 12월 1일이 되면 날짜로 2027 이 '지금', 2028 이 '준비'.
--   · 마감 취소(되돌리기)도 관리자만. 마감 기록은 지우지 않고 closed_at 을 비운다.
--
--  들어 있는 것 (모두 비파괴: CREATE TABLE · 함수 다시 정의):
--   1) mission_terms            : 회기별 마감 기록(회기, 마감 시각, 마감한 사람, 메모)
--   2) mission_fy(p_year)        : p_year 가 없을 때 '지금 회기' 를 위 규칙으로 (p_year 를 주면 예전과 같음)
--   3) mission_home()            : 회기 목록에 다음 회기(준비)를 붙이고, 마감한 회기 목록(closed)을 함께 준다
--   4) mission_term_close(회기) / mission_term_reopen(회기) : 관리자만
--   5) 회계 보고 열람 기간: mission_terms.report_from · report_to (회기마다, 비우면 기본값)
--        기본값 = 그 회기 끝 해의 11월 셋째 주일 ~ 12월 첫째 주일이 있는 주의 토요일 (2026: 11/15 ~ 12/12)
--      mission_report_window(회기)      : 열람 기간(설정값 또는 기본값)
--      mission_report_window_set(회기, 시작, 끝, 방식) : 그 회기 임원 · 관리자 · 재정 담당 (날짜를 비우면 기본값)
--        방식 report_mode: 'auto'(기간대로, 기본) · 'open'(지금 바로 공개) · 'closed'(지금 바로 비공개) — 임원이 언제든 바꾼다
--      mission_report(회기)             : 임원 · 관리자 · 재정 담당은 늘, 그 회기 회원(선교헌금을 드린 분 · 정회원)은 열람 기간에만.
--                                         돌려줄 때 window(기간 · 지금 공개 여부)를 함께 준다
--
--   6) 정회원 가입 자동 승인: mission_join_apply 가 신청하면 바로 '정회원'(승인 기다림 없음).
--      이미 '신청' 상태로 남아 있던 줄도 '정회원'으로 바꾼다(UPDATE 만). 임원은 명부에서 반려 · 탈퇴로 되돌릴 수 있다.
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · mission_fy · mission_home : 20261110_1900_mission_committee.sql 의 mission_fy, 20261113_1200_mission_officers_ledger.sql 의
--      mission_home 부분을 다시 실행
--    · mission_report : 20261113_1200_mission_officers_ledger.sql 의 mission_report 부분을 다시 실행
--    · 자동 승인 : 20261114_1500_mission_regular_members.sql 의 mission_join_apply 부분을 다시 실행
--                  (이 파일이 '정회원'으로 바꾼 줄은 그대로 둔다 — 필요하면 명부에서 하나씩 '신청'·'반려'로)
--    · 새 함수: drop function if exists public.mission_term_close(int), public.mission_term_reopen(int), public.mission_last_closed(),
--             public.mission_report_window(int), public.mission_report_window_set(int, date, date, text);
--    · 표: alter table public.mission_terms rename to mission_terms_archived;   (DROP 하지 않는다)
-- ============================================================

-- ── 1) 회기 마감 기록 ───────────────────────────────────────
create table if not exists public.mission_terms (
  fy_year    int primary key check (fy_year between 2000 and 2100),
  closed_at  timestamptz,                         -- 비어 있으면 마감 안 됨(또는 마감 취소)
  closed_by  uuid references auth.users (id) on delete set null,
  note       text not null default '',
  updated_at timestamptz not null default now()
);
-- 회계 보고 열람 기간(회원에게 공개). 비우면 기본값
alter table public.mission_terms add column if not exists report_from date;
alter table public.mission_terms add column if not exists report_to date;
alter table public.mission_terms add column if not exists report_mode text not null default 'auto';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mission_terms_report_mode_check') then
    alter table public.mission_terms add constraint mission_terms_report_mode_check check (report_mode in ('auto', 'open', 'closed'));
  end if;
end $$;
alter table public.mission_terms enable row level security;     -- 정책 없음 = 함수로만
revoke all on public.mission_terms from anon, authenticated;

-- 마지막으로 마감한 회기 (없으면 null)
create or replace function public.mission_last_closed()
returns int
language sql stable security definer set search_path = public as $$
  select max(fy_year) from public.mission_terms where closed_at is not null
$$;
revoke all on function public.mission_last_closed() from public, anon, authenticated;

-- ── 2) 회기 범위 — '지금 회기' 에 마감을 반영 ───────────────
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
  v_last  int;
begin
  begin
    select nullif(btrim(value), '')::int into v_sm from public.app_settings where key = 'fy_start_month';
  exception when others then v_sm := null;
  end;
  if v_sm is null or v_sm < 1 or v_sm > 12 then v_sm := 12; end if;

  if p_year is not null then v_fy := p_year;
  else
    if v_sm = 1  then v_fy := v_y;
    elsif v_sm >= 8 then v_fy := case when v_m >= v_sm then v_y + 1 else v_y end;
    else                 v_fy := case when v_m >= v_sm then v_y else v_y - 1 end;
    end if;
    -- 관리자가 회기를 마감했으면 그다음 회기가 '지금'
    begin
      v_last := public.mission_last_closed();
    exception when others then v_last := null;
    end;
    if v_last is not null and v_last + 1 > v_fy then v_fy := v_last + 1; end if;
  end if;

  v_sy := case when v_sm >= 8 then v_fy - 1 else v_fy end;
  fy     := v_fy;
  d_from := make_date(v_sy, v_sm, 1);
  d_to   := (d_from + interval '1 year' - interval '1 day')::date;
  return next;
end $$;
revoke all on function public.mission_fy(int) from public, anon, authenticated;

-- ── 3) 화면이 처음 읽는 것 — 다음 회기(준비)와 마감 목록 ─────
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
    'next',    v_fy + 1,
    'years',   (select jsonb_agg(y order by y desc) from generate_series(least(2026, v_fy), v_fy + 1) y),
    'closed',  coalesce((select jsonb_agg(t.fy_year order by t.fy_year desc) from public.mission_terms t where t.closed_at is not null), '[]'::jsonb),
    'my',      jsonb_build_object('admin', v_admin, 'finance', v_fin, 'roles', v_roles));
end $$;
revoke all on function public.mission_home() from public;
grant execute on function public.mission_home() to anon, authenticated;

-- ── 4) 회기 마감 · 마감 취소 (관리자만) ─────────────────────
--   마감할 수 있는 회기 = 지금 회기와 그 앞 회기. 마감 취소 = 마지막으로 마감한 회기만.
create or replace function public.mission_term_close(p_year int)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fy int;
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then raise exception '회기 마감은 관리자가 합니다'; end if;
  select f.fy into v_fy from public.mission_fy(null) f;
  if p_year is null or p_year > v_fy then raise exception '지금 회기(%년도)까지만 마감할 수 있습니다', v_fy; end if;
  insert into public.mission_terms (fy_year, closed_at, closed_by, updated_at) values (p_year, now(), auth.uid(), now())
  on conflict (fy_year) do update set closed_at = now(), closed_by = auth.uid(), updated_at = now();
  return public.mission_home();
end $$;
revoke all on function public.mission_term_close(int) from public, anon;
grant execute on function public.mission_term_close(int) to authenticated;

create or replace function public.mission_term_reopen(p_year int)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then raise exception '마감 취소는 관리자가 합니다'; end if;
  if p_year is distinct from public.mission_last_closed() then raise exception '마지막으로 마감한 회기만 마감을 취소할 수 있습니다'; end if;
  update public.mission_terms set closed_at = null, closed_by = auth.uid(), updated_at = now() where fy_year = p_year;
  return public.mission_home();
end $$;
revoke all on function public.mission_term_reopen(int) from public, anon;
grant execute on function public.mission_term_reopen(int) to authenticated;

-- ── 5) 회계 보고 열람 기간 ──────────────────────────────────
create or replace function public.mission_report_window(p_year int)
returns table (d_from date, d_to date, custom boolean, rmode text, is_open boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_f date;  v_t date;  v_m text;  n1 date;  d1 date;
begin
  select t.report_from, t.report_to, t.report_mode into v_f, v_t, v_m from public.mission_terms t where t.fy_year = p_year;
  -- 기본값: 11월 셋째 주일, 12월 첫째 주일이 있는 주의 토요일 (회기 이름의 해 = 회기가 끝나는 해)
  n1 := make_date(p_year, 11, 1);
  d1 := make_date(p_year, 12, 1);
  d_from := coalesce(v_f, n1 + ((7 - extract(dow from n1)::int) % 7) + 14);
  d_to   := coalesce(v_t, d1 + ((7 - extract(dow from d1)::int) % 7) + 6);
  custom := v_f is not null or v_t is not null;
  rmode   := coalesce(v_m, 'auto');
  is_open := case rmode when 'open' then true when 'closed' then false
                      else (now() at time zone 'Asia/Seoul')::date between d_from and d_to end;
  return next;
end $$;
revoke all on function public.mission_report_window(int) from public, anon, authenticated;

create or replace function public.mission_report_window_set(p_year int, p_from date, p_to date, p_mode text default 'auto')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare w record;  v_mode text := coalesce(nullif(btrim(p_mode), ''), 'auto');
begin
  if not public.mission_staff(p_year) then raise exception '열람 기간과 공개 여부는 그 회기 임원이 정합니다'; end if;
  if v_mode not in ('auto', 'open', 'closed') then raise exception '공개 방식이 틀렸습니다'; end if;
  if p_from is not null and p_to is not null and p_from > p_to then raise exception '시작 날짜가 끝 날짜보다 늦습니다'; end if;
  insert into public.mission_terms (fy_year, report_from, report_to, report_mode, updated_at) values (p_year, p_from, p_to, v_mode, now())
  on conflict (fy_year) do update set report_from = excluded.report_from, report_to = excluded.report_to,
         report_mode = excluded.report_mode, updated_at = now();
  select * into w from public.mission_report_window(p_year);
  return jsonb_build_object('from', w.d_from, 'to', w.d_to, 'custom', w.custom, 'mode', w.rmode, 'open', w.is_open);
end $$;
revoke all on function public.mission_report_window_set(int, date, date, text) from public, anon;
grant execute on function public.mission_report_window_set(int, date, date, text) to authenticated;

-- 회계 보고 — 20261113_1200 의 것에 열람 기간을 더함 (먼저 실행되어 있어야 하는 것: 20261114_1500 의 mission_regular_members)
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
  v_staff boolean := false;  v_pub boolean := false;  v_wf date;  v_wt date;
  v_mode text;  v_custom boolean;  v_win jsonb;
begin
  select f.fy, f.d_from, f.d_to into v_fy, v_from, v_to from public.mission_fy(p_year) f;
  if v_uid is null then return null; end if;

  -- 임원 · 관리자 · 재정 담당은 늘, 그 회기 회원(선교헌금 · 정회원)은 열람 기간에만 (2026-11-14)
  v_staff := public.is_finance()
       or exists (select 1 from public.admins a where a.uid = v_uid)
       or exists (select 1 from public.mission_officers o join public.member_links l on l.member_key = o.member_key
                   where l.user_id = v_uid and coalesce(o.member_key, '') <> '' and o.active and o.fy_year = v_fy);
  select w.d_from, w.d_to, w.is_open, w.rmode, w.custom into v_wf, v_wt, v_pub, v_mode, v_custom from public.mission_report_window(v_fy) w;
  v_ok := v_staff
       or (v_pub and (
            exists (select 1 from public.offerings o
                     where o.category = '선교헌금' and o.offer_date between v_from and v_to and o.amount > 0
                       and coalesce(o.member_key, '') <> ''
                       and o.member_key in (select public.my_member_keys()))
         or exists (select 1 from public.mission_regular_members r left join public.member_links l on l.user_id = v_uid
                     where r.status = '정회원' and (r.user_id = v_uid or (coalesce(l.member_key, '') <> '' and r.member_key = l.member_key)))));
  if not v_ok then return null; end if;
  v_win := jsonb_build_object('from', v_wf, 'to', v_wt, 'open', v_pub, 'mode', v_mode, 'custom', v_custom, 'staff', v_staff);

  select count(*)::int, coalesce(sum(amount) filter (where kind = '수입'), 0), coalesce(sum(amount) filter (where kind = '지출'), 0),
         min(entry_date), max(entry_date)
    into v_n, v_in, v_out, v_d1, v_d2
    from public.mission_ledger where fy_year = v_fy and not hidden;

  -- 장부가 비어 있으면: 올려 둔 보고서(있으면)를 그대로
  if v_n = 0 then
    select value into v_doc from public.app_settings where key = 'mission_report_' || v_fy;
    if v_doc is null or btrim(v_doc) = '' then return jsonb_build_object('year', v_fy, 'doc', null, 'source', 'none', 'window', v_win); end if;
    return jsonb_build_object('year', v_fy, 'doc', v_doc::jsonb, 'source', 'doc', 'window', v_win);
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

  return jsonb_build_object('year', v_fy, 'source', 'ledger', 'window', v_win, 'doc', jsonb_build_object(
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

-- ── 6) 정회원 가입 자동 승인 ───────────────────────────────
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
    insert into public.mission_regular_members (user_id, member_key, name, note, src, status, approved_at)
    values (v_uid, v_key, v_name, left(coalesce(p_note, ''), 500), 'web', '정회원', now());
  elsif m.status in ('반려', '탈퇴') then
    update public.mission_regular_members
       set status = '정회원', user_id = coalesce(user_id, v_uid), member_key = case when member_key = '' then v_key else member_key end,
           note = left(coalesce(p_note, ''), 500), applied_at = now(), approved_at = now(), approved_by = null, updated_at = now()
     where id = m.id;
  elsif m.status = '신청' then
    update public.mission_regular_members set status = '정회원', user_id = coalesce(user_id, v_uid), approved_at = now(), updated_at = now() where id = m.id;
  elsif m.user_id is null then
    -- 임원이 대신 올려 둔 줄에 내 계정을 잇는다(상태는 그대로)
    update public.mission_regular_members set user_id = v_uid, updated_at = now() where id = m.id;
  end if;
  return public.mission_join_me(null);
end $$;
revoke all on function public.mission_join_apply(text, text) from public, anon;
grant execute on function public.mission_join_apply(text, text) to authenticated;

update public.mission_regular_members set status = '정회원', approved_at = coalesce(approved_at, now()), updated_at = now()
 where status = '신청';

-- ── 실행 후 확인(메타데이터 · 건수만) ───────────────────────
--   select public.mission_home() - 'my';      -- current 2026, next 2027, years [2027, 2026], closed []
--   select count(*) from public.mission_terms; -- 0
--   select count(*) from public.mission_regular_members where status = '신청';   -- 0
--   select * from public.mission_report_window(2026);   -- 2026-11-15 ~ 2026-12-12, custom false, mode auto
