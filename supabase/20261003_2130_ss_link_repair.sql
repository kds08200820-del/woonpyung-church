-- ============================================================
--  운평장로교회 — 끊긴 어린이 계정·달란트·인증을 이름으로 찾아 한 번에 잇기 (2026-10-03)
--  Supabase ▸ SQL Editor 에 통째로 붙여넣고 Run (여러 번 실행해도 안전)
--
--  ※ 20260930_0900_gyojeok_rekey.sql 은 운영 DB 에 실행되지 않았다(2026-10-03 확인).
--    이 파일이 그 내용을 모두 담고 보완하므로 이 파일 하나만 실행하면 된다.
--
--  [왜]
--   어린이 계정(member_links)·달란트(ss_talents)·인증(ss_submissions)·출석은 모두
--   교적 매칭키 '이름|생년월일' 로 이어진다. 교적이나 교적 인증에서 생년월일을 잘못 넣었다가
--   고치면 키가 갈라져, 계정은 교적을 못 찾고(→ 'QT 인증 올리기' 칸이 사라짐)
--   달란트는 옛 키에 남아 0 으로 보인다(2026-09-29·10-03 실제 발생).
--   9/30 판에는 다음 빈틈이 있었다.
--    · 계정 키가 끊긴 경우만 찾고, 달란트·인증만 옛 키에 남은 경우(stray)는 못 찾았다
--    · 출석은 (날짜, 예배, 키)가 유일해서, 옛 키와 새 키에 같은 주일 출석이 있으면
--      옮기기 전체가 오류로 취소됐다
--    · SQL Editor 에서 부르면 auth.uid() 가 비어 권한 검사에 막혔다
--    · 계정을 이어도 '준회원'으로 남아 대시보드에 들어갈 수 없었다
--    · 부모가 '내 정보'에서 자녀 생년월일을 고쳐도 매칭키는 그대로였다(키와 생년월일이 어긋남)
--
--  [만드는 것]  (표 1개 추가 + 함수 교체 — 지우는 것 없음)
--   0) ss_link_admin_ok()          — 관리자·재정권한자이거나 SQL Editor(postgres)인지
--   1) member_rekey_log            — 무엇을 어디서 어디로 옮겼는지 행 번호까지 남김(되돌리기용)
--   2) rekey_member_records()      — 표들의 키를 옮김(출석 겹침 안전, 기록 남김)
--   3) gyojeok_rekey 트리거        — 교적 매칭키가 바뀌면 자동으로 2)
--   4) ss_link_check()             — 점검: orphan(계정 끊김) · stray(달란트·인증만 옛 키) · no_role
--   5) rekey_member(옛키, 새키)    — 하나 잇기(+ 계정을 정회원으로)
--   6) ss_link_repair(이름[, 키])  — 이름 하나로 흩어진 기록을 모두 찾아 교적 키로 모으고,
--                                    계정을 정회원으로, 주일학교 칸이 비었으면 학년을 채운다
--   7) update_my_child()           — 부모가 자녀 생년월일을 고치면 매칭키도 따라가게(기록은 3)이 옮김)
--
--  [이미 끊긴 어린이를 고치는 법]  — 둘 중 하나
--   · SQL Editor:  select public.ss_link_repair('이름');
--       같은 이름 교적이 여럿이면 후보가 나온다 → select public.ss_link_repair('이름', '이름|YYYYMMDD');
--   · 교적관리 ▸ 교적 명단 위 '계정 연결 점검' 상자에서 [연결 고치기]
--
--  [되돌리기(롤백)]
--   함수·트리거:
--   -- drop trigger if exists gyojeok_rekey on public.gyojeok;
--   -- drop function if exists public.gyojeok_rekey_tg();
--   -- drop function if exists public.ss_link_repair(text, text);
--   -- drop function if exists public.rekey_member(text, text);
--   -- drop function if exists public.ss_link_check();
--   -- drop function if exists public.rekey_member_records(text, text, text);
--   -- drop function if exists public.ss_link_admin_ok();
--   -- update_my_child 는 20260826_1930_parent_child_gyojeok.sql 의 3) 을 다시 실행
--   -- 기록 표는 지우지 말고: alter table public.member_rekey_log rename to member_rekey_log_archived;
--   옮긴 기록(데이터): member_rekey_log 의 한 줄(id = N)을 그대로 되돌린다.
--   -- with l as (select * from public.member_rekey_log where id = N)
--   --   update public.ss_talents     t set member_key = l.old_key from l where t.id::text = any (l.talent_ids);
--   -- with l as (select * from public.member_rekey_log where id = N)
--   --   update public.ss_submissions s set member_key = l.old_key from l where s.id::text = any (l.submission_ids);
--   -- with l as (select * from public.member_rekey_log where id = N)
--   --   update public.attendance     a set member_key = l.old_key from l where a.id::text = any (l.attendance_ids);
--   -- with l as (select * from public.member_rekey_log where id = N)
--   --   update public.offerings      o set member_key = l.old_key from l where o.id::text = any (l.offering_ids);
--   -- with l as (select * from public.member_rekey_log where id = N)
--   --   update public.member_links   m set member_key = l.old_key from l where m.user_id = any (l.link_uids);
--   (ss_link_repair 가 바꾼 계정 상태·주일학교 칸은 결과 JSON 의 status_fixed·ss_role_set 으로 확인)
-- ============================================================

-- ── 0) 권한: 관리자·재정권한자, 또는 Supabase SQL Editor(postgres) ─────────
--    함수 안에서 current_user 는 늘 함수 주인이므로 session_user(접속한 역할)로 본다.
--    홈페이지(PostgREST)로 들어오면 session_user 는 authenticator 다.
create or replace function public.ss_link_admin_ok()
returns boolean language sql security definer stable
set search_path = public as $$
  select public.is_finance() or session_user in ('postgres', 'supabase_admin')
$$;
revoke all on function public.ss_link_admin_ok() from public, anon;
grant execute on function public.ss_link_admin_ok() to authenticated;

-- ── 1) 옮김 기록 ──────────────────────────────────────────────
create table if not exists public.member_rekey_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  txid           bigint      not null default txid_current(),   -- 한 번의 실행에서 옮긴 것을 묶어 본다
  by_uid         uuid        default auth.uid(),
  old_key        text        not null,
  new_key        text        not null,
  link_uids      uuid[]      not null default '{}',
  talent_ids     text[]      not null default '{}',
  submission_ids text[]      not null default '{}',
  attendance_ids text[]      not null default '{}',
  offering_ids   text[]      not null default '{}',
  receipt_ids    text[]      not null default '{}',
  file_ids       text[]      not null default '{}',
  counts         jsonb       not null default '{}'::jsonb
);
alter table public.member_rekey_log enable row level security;   -- 정책 없음 = 홈페이지에서는 못 읽음(함수·SQL Editor 만)
revoke all on table public.member_rekey_log from anon, authenticated;

-- ── 2) 기록 옮기기(내부용) ─────────────────────────────────────
--    p_name 을 주면 달란트·인증·출석의 표시 이름도 맞춘다. 헌금은 매칭키만 옮긴다(이름·금액 그대로).
--    출석은 달란트보다 먼저 옮긴다: 새 키에 같은 날·같은 예배 출석이 이미 있으면 그 줄은 옛 키에 남긴다.
--    (달란트를 옮길 때 ss_talent_attend 트리거가 '출석' 달란트의 출석 줄을 새 키로 다시 맞춘다)
create or replace function public.rekey_member_records(p_old text, p_new text, p_name text default null)
returns json language plpgsql security definer
set search_path = public as $$
declare
  a_link uuid[] := '{}'; a_tal text[] := '{}'; a_sub text[] := '{}'; a_att text[] := '{}';
  a_off text[] := '{}'; a_rec text[] := '{}'; a_file text[] := '{}';
  n_spouse int := 0; n_att_left int := 0; v_counts jsonb;
begin
  if coalesce(p_old, '') = '' or coalesce(p_new, '') = '' or p_old = p_new then
    return json_build_object('ok', false, 'error', '옛 키와 새 키를 모두 주세요.');
  end if;

  -- 홈페이지 계정 연결(본인 키·배우자 키), 다른 교적이 이 사람을 배우자로 가리키는 키
  with u as (update public.member_links set member_key = p_new, updated_at = now()
              where member_key = p_old returning user_id)
  select coalesce(array_agg(user_id), '{}') into a_link from u;
  update public.member_links set spouse_key = p_new where spouse_key = p_old;
  update public.gyojeok set spouse_key = p_new where spouse_key = p_old;
  get diagnostics n_spouse = row_count;

  -- 출석 (2026-09-27 이후 표 — 아직 안 만들었으면 건너뜀)
  if to_regclass('public.attendance') is not null then
    with u as (
      update public.attendance a
         set member_key = p_new, member_name = coalesce(nullif(p_name, ''), a.member_name)
       where a.member_key = p_old
         and not exists (select 1 from public.attendance b
                          where b.member_key = p_new and b.att_date = a.att_date and b.service = a.service)
      returning a.id)
    select coalesce(array_agg(id::text), '{}') into a_att from u;
  end if;

  -- 주일학교 달란트·인증
  if to_regclass('public.ss_talents') is not null then
    with u as (update public.ss_talents
                  set member_key = p_new, child_name = coalesce(nullif(p_name, ''), child_name)
                where member_key = p_old returning id)
    select coalesce(array_agg(id::text), '{}') into a_tal from u;
  end if;
  if to_regclass('public.ss_submissions') is not null then
    with u as (update public.ss_submissions
                  set member_key = p_new, child_name = coalesce(nullif(p_name, ''), child_name)
                where member_key = p_old returning id)
    select coalesce(array_agg(id::text), '{}') into a_sub from u;
  end if;

  -- 헌금·기부금영수증·개인 파일 — 매칭키(연결)만 옮긴다
  if to_regclass('public.offerings') is not null then
    with u as (update public.offerings set member_key = p_new where member_key = p_old returning id)
    select coalesce(array_agg(id::text), '{}') into a_off from u;
  end if;
  if to_regclass('public.donation_receipts') is not null then
    with u as (update public.donation_receipts set member_key = p_new where member_key = p_old returning id)
    select coalesce(array_agg(id::text), '{}') into a_rec from u;
    update public.donation_receipts set included_keys = array_replace(included_keys, p_old, p_new)
     where p_old = any (included_keys);
  end if;
  if to_regclass('public.member_files') is not null then
    with u as (update public.member_files set member_key = p_new where member_key = p_old returning id)
    select coalesce(array_agg(id::text), '{}') into a_file from u;
  end if;

  if to_regclass('public.attendance') is not null then
    select count(*) into n_att_left from public.attendance where member_key = p_old;
  end if;

  v_counts := jsonb_build_object(
    'links', cardinality(a_link), 'spouse_refs', n_spouse,
    'talents', cardinality(a_tal), 'submissions', cardinality(a_sub),
    'attendance', cardinality(a_att), 'attendance_left', n_att_left,
    'offerings', cardinality(a_off), 'receipts', cardinality(a_rec), 'files', cardinality(a_file));

  if cardinality(a_link) + n_spouse + cardinality(a_tal) + cardinality(a_sub) + cardinality(a_att)
     + cardinality(a_off) + cardinality(a_rec) + cardinality(a_file) > 0 then
    insert into public.member_rekey_log (old_key, new_key, link_uids, talent_ids, submission_ids,
                                         attendance_ids, offering_ids, receipt_ids, file_ids, counts)
    values (p_old, p_new, a_link, a_tal, a_sub, a_att, a_off, a_rec, a_file, v_counts);
  end if;

  return (jsonb_build_object('ok', true, 'old_key', p_old, 'new_key', p_new) || v_counts)::json;
end $$;
-- Supabase 는 새 함수에 anon·authenticated 실행 권한을 기본으로 준다 → 내부용은 셋 모두에서 뺀다
revoke all on function public.rekey_member_records(text, text, text) from public, anon, authenticated;

-- ── 3) 교적 매칭키가 바뀌면 자동으로 따라가기 ───────────────────
create or replace function public.gyojeok_rekey_tg()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if old.member_key is not distinct from new.member_key then return null; end if;
  if coalesce(old.member_key, '') = '' or coalesce(new.member_key, '') = '' then return null; end if;
  -- 동명이인 보호: 옛 키를 아직 쓰는 교적, 새 키를 이미 쓰는 교적이 따로 있으면 옮기지 않는다
  if exists (select 1 from public.gyojeok g where g.id <> new.id and g.member_key = old.member_key) then return null; end if;
  if exists (select 1 from public.gyojeok g where g.id <> new.id and g.member_key = new.member_key) then return null; end if;
  perform public.rekey_member_records(old.member_key, new.member_key, new.name);
  return null;
end $$;

drop trigger if exists gyojeok_rekey on public.gyojeok;
create trigger gyojeok_rekey
after update of member_key on public.gyojeok
for each row execute function public.gyojeok_rekey_tg();

-- ── 4) 점검(관리자·재정권한자) ─────────────────────────────────
--    orphan  : 홈페이지 계정의 키로 교적을 찾을 수 없다(준회원은 같은 이름 교적이 있을 때만 보인다)
--    stray   : 달란트·인증 기록의 키가 교적에도 계정에도 없다(생년월일을 고치면서 옛 키에 남음)
--    no_role : 주일학교 칸이 비어 있는데 달란트·인증 기록이 있다
--    new_key : 같은 이름의 교적이 정확히 하나일 때 그 교적의 키(아니면 null)
--    target_links : new_key 에 이미 이어진 계정 수(같은 아이의 다른 계정이면 괜찮다)
create or replace function public.ss_link_check()
returns json language plpgsql security definer stable
set search_path = public as $$
declare v_out json;
begin
  if not public.ss_link_admin_ok() then return '[]'::json; end if;
  with
  orphan as (
    select l.member_key as k,
           max(coalesce(nullif(l.member_name, ''), split_part(l.member_key, '|', 1))) as nm,
           bool_or(coalesce(l.member_status, '') = '정회원') as full_member,
           string_agg(distinct coalesce(nullif(l.member_status, ''), '준회원'), ',') as st
    from public.member_links l
    where coalesce(l.member_key, '') <> ''
      and not exists (select 1 from public.gyojeok g where g.member_key = l.member_key)
    group by l.member_key
  ),
  stray as (
    select x.k, max(x.nm) as nm
    from (
      select t.member_key as k, coalesce(nullif(t.child_name, ''), split_part(t.member_key, '|', 1)) as nm from public.ss_talents t
      union all
      select s.member_key, coalesce(nullif(s.child_name, ''), split_part(s.member_key, '|', 1)) from public.ss_submissions s
    ) x
    where coalesce(x.k, '') <> ''
      and not exists (select 1 from public.gyojeok g where g.member_key = x.k)
      and not exists (select 1 from public.member_links l where l.member_key = x.k)
    group by x.k
  ),
  cand as (
    select 'orphan'::text as kind, o.k, o.nm, o.st, o.full_member from orphan o
    union all
    select 'stray', s.k, s.nm, '', false from stray s
  ),
  sug as (
    select c.*,
           (select min(g.member_key) from public.gyojeok g
             where g.name = c.nm and coalesce(g.member_key, '') <> ''
            having count(*) = 1) as new_key
    from cand c
  )
  select coalesce(json_agg(x order by x->>'kind', x->>'name'), '[]'::json) into v_out
  from (
    select json_build_object(
      'kind', s.kind, 'name', coalesce(s.nm, ''), 'status', s.st,
      'old_key', s.k, 'new_key', s.new_key,
      'target_links', case when s.new_key is null then 0
                           else (select count(*) from public.member_links l2 where l2.member_key = s.new_key) end,
      'talents',     (select count(*) from public.ss_talents     t where t.member_key = s.k),
      'submissions', (select count(*) from public.ss_submissions u where u.member_key = s.k),
      'offerings',   (select count(*) from public.offerings      o where o.member_key = s.k)
    ) as x
    from sug s
    where s.kind = 'stray' or s.full_member or s.new_key is not null
    union all
    select json_build_object(
      'kind', 'no_role', 'name', g.name, 'status', '',
      'old_key', g.member_key, 'new_key', null, 'target_links', 0,
      'talents',     (select count(*) from public.ss_talents     t where t.member_key = g.member_key),
      'submissions', (select count(*) from public.ss_submissions u where u.member_key = g.member_key),
      'offerings',   0
    ) as x
    from public.gyojeok g
    where coalesce(g.ss_role, '') = '' and coalesce(g.member_key, '') <> ''
      and (exists (select 1 from public.ss_talents     t where t.member_key = g.member_key)
        or exists (select 1 from public.ss_submissions u where u.member_key = g.member_key))
  ) q;
  return v_out;
end $$;
revoke all on function public.ss_link_check() from public, anon;
grant execute on function public.ss_link_check() to authenticated;

-- ── 5) 끊긴 연결 하나 잇기(관리자·재정권한자) ───────────────────
--    새 키의 교적이 정확히 하나 있고, 옛 키를 쓰는 교적이 없을 때만 옮긴다.
--    계정이 함께 옮겨지면 교적과 이어졌으므로 정회원으로 올린다(교적 인증에서 생년월일을 잘못 넣은 준회원).
create or replace function public.rekey_member(p_old text, p_new text)
returns json language plpgsql security definer
set search_path = public as $$
declare v_cnt int; v_name text; v_res json; n_up int := 0;
begin
  if not public.ss_link_admin_ok() then
    return json_build_object('ok', false, 'error', '관리자·재정권한자만 실행할 수 있습니다.');
  end if;
  if coalesce(p_old, '') = '' or coalesce(p_new, '') = '' or p_old = p_new then
    return json_build_object('ok', false, 'error', '옛 키와 새 키를 모두 주세요.');
  end if;
  select count(*), min(g.name) into v_cnt, v_name from public.gyojeok g where g.member_key = p_new;
  if v_cnt <> 1 then
    return json_build_object('ok', false, 'error', '새 키의 교적이 정확히 하나여야 합니다. (지금 ' || v_cnt || '건)');
  end if;
  if exists (select 1 from public.gyojeok g where g.member_key = p_old) then
    return json_build_object('ok', false, 'error', '옛 키를 쓰는 교적이 아직 있습니다. 교적을 먼저 정리해 주세요.');
  end if;
  v_res := public.rekey_member_records(p_old, p_new, v_name);
  update public.member_links set member_status = '정회원', member_name = v_name, updated_at = now()
   where member_key = p_new and coalesce(member_status, '') <> '정회원';
  get diagnostics n_up = row_count;
  return (v_res::jsonb || jsonb_build_object('upgraded', n_up))::json;
end $$;
revoke all on function public.rekey_member(text, text) from public, anon;
grant execute on function public.rekey_member(text, text) to authenticated;

-- ── 6) 이름 하나로 흩어진 기록 모으기(관리자·재정권한자, SQL Editor) ──────
--    기준: 그 이름의 교적(여럿이면 p_key 로 고른다). 교적에 생년월일이 있으면 키를 '이름|생년월일'로 맞춘다
--          (트리거가 옛 키의 기록을 함께 옮긴다). 교적·계정 어디에도 없는 그 이름의 키(계정·달란트·인증)를
--          모두 이 키로 모은다. 다른 교적이 쓰는 키는 절대 건드리지 않는다(동명이인 보호).
--    결과의 accounts 에서 이어진 계정(이메일)이 그 아이의 것인지 꼭 확인할 것.
create or replace function public.ss_link_repair(p_name text, p_key text default null)
returns json language plpgsql security definer
set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_pick text := btrim(coalesce(p_key, ''));
  v_cnt int; v_id bigint; v_birth date; v_target text; v_bkey text; v_role text;
  v_dates text[]; v_sy int; v_age int; v_role_set boolean := false; n_up int := 0;
  v_notes text[] := '{}'; r record;
begin
  if not public.ss_link_admin_ok() then
    return json_build_object('ok', false, 'error', '관리자·재정권한자만 실행할 수 있습니다.');
  end if;
  if v_name = '' then return json_build_object('ok', false, 'error', '이름을 주세요.'); end if;

  -- (1) 기준 교적 하나
  select count(*) into v_cnt from public.gyojeok g
   where g.name = v_name and (v_pick = '' or g.member_key = v_pick);
  if v_cnt = 0 then
    return json_build_object('ok', false, 'error',
      case when v_pick = '' then '교적에 「' || v_name || '」 이(가) 없습니다.'
           else '교적에 「' || v_name || '」 / ' || v_pick || ' 이(가) 없습니다.' end);
  end if;
  if v_cnt > 1 then
    return json_build_object('ok', false,
      'error', '같은 이름의 교적이 ' || v_cnt || '건 있습니다. 어느 교적으로 모을지 키를 함께 주세요: select public.ss_link_repair(''' || v_name || ''', ''키'');',
      'candidates', (select json_agg(json_build_object(
          'key', g.member_key, 'birth', g.birth, 'ss_role', g.ss_role, 'head', g.head, 'relation', g.relation,
          'accounts',    (select count(*) from public.member_links l where l.member_key = g.member_key),
          'talents',     (select count(*) from public.ss_talents t where t.member_key = g.member_key),
          'submissions', (select count(*) from public.ss_submissions s where s.member_key = g.member_key)) order by g.id)
        from public.gyojeok g where g.name = v_name));
  end if;
  select g.id, g.birth, coalesce(g.member_key, ''), coalesce(g.ss_role, '')
    into v_id, v_birth, v_target, v_role
  from public.gyojeok g where g.name = v_name and (v_pick = '' or g.member_key = v_pick);

  -- (2) 교적 키를 '이름|생년월일'로 맞춘다
  if v_birth is not null then
    v_bkey := v_name || '|' || to_char(v_birth, 'YYYYMMDD');
  elsif v_target in ('', v_name || '|') then
    -- 교적에 생년월일이 없으면: 흩어진 키의 생년월일이 한 가지뿐일 때만 그것으로
    select array_agg(distinct split_part(k, '|', 2)) into v_dates from (
      select l.member_key as k from public.member_links l where split_part(l.member_key, '|', 1) = v_name
      union select t.member_key from public.ss_talents t where split_part(t.member_key, '|', 1) = v_name
      union select s.member_key from public.ss_submissions s where split_part(s.member_key, '|', 1) = v_name
    ) x where split_part(k, '|', 2) ~ '^[0-9]{8}$'
          and not exists (select 1 from public.gyojeok g where g.member_key = x.k and g.id <> v_id);
    if cardinality(v_dates) = 1 then
      v_bkey := v_name || '|' || v_dates[1];
      v_notes := v_notes || ('교적에 생년월일이 비어 있어 계정·기록에 쓰인 생년월일(' || v_dates[1] || ')로 키를 맞췄습니다. 교적관리에서 생년월일을 확인해 넣어 주세요.');
    end if;
  end if;
  if v_bkey is not null and v_bkey <> v_target then
    if exists (select 1 from public.gyojeok g where g.member_key = v_bkey and g.id <> v_id) then
      v_notes := v_notes || ('다른 교적이 이미 ' || v_bkey || ' 키를 쓰고 있어 교적 키는 그대로 두었습니다.');
    else
      update public.gyojeok set member_key = v_bkey where id = v_id;   -- gyojeok_rekey 트리거가 옛 키의 기록을 옮긴다
      v_target := v_bkey;
    end if;
  end if;
  if v_target in ('', v_name || '|') then
    return json_build_object('ok', false, 'error', '교적에 생년월일이 없어 키를 정할 수 없습니다. 교적관리에서 생년월일을 먼저 넣어 주세요.');
  end if;

  -- (3) 그 이름으로 흩어진 키(교적이 쓰지 않는 키)를 모두 기준 키로
  for r in
    select distinct x.k from (
      select l.member_key as k from public.member_links l
       where split_part(l.member_key, '|', 1) = v_name or l.member_name = v_name
      union select t.member_key from public.ss_talents t
       where split_part(t.member_key, '|', 1) = v_name or t.child_name = v_name
      union select s.member_key from public.ss_submissions s
       where split_part(s.member_key, '|', 1) = v_name or s.child_name = v_name
    ) x
    where coalesce(x.k, '') <> '' and x.k <> v_target
      and not exists (select 1 from public.gyojeok g where g.member_key = x.k)
  loop
    perform public.rekey_member_records(r.k, v_target, v_name);
  end loop;

  -- (4) 이어진 계정은 정회원으로
  update public.member_links set member_status = '정회원', member_name = v_name, updated_at = now()
   where member_key = v_target and coalesce(member_status, '') <> '정회원';
  get diagnostics n_up = row_count;

  -- (5) 주일학교 칸이 비었으면 학년도(3월 시작) 기준 나이로 채운다: 12세까지 어린이 · 13~15 중학생 · 16~18 고등학생
  if v_role = '' then
    if v_birth is not null then
      v_sy  := extract(year from current_date)::int - case when extract(month from current_date) < 3 then 1 else 0 end;
      v_age := v_sy - extract(year from v_birth)::int;
      v_role := case when v_age <= 12 then '어린이' when v_age <= 15 then '중학생' when v_age <= 18 then '고등학생' else '' end;
      if v_role <> '' then
        update public.gyojeok set ss_role = v_role where id = v_id;
        v_role_set := true;
      else
        v_notes := v_notes || '주일학교 나이가 아니어서 주일학교 칸은 비워 두었습니다.'::text;
      end if;
    else
      v_notes := v_notes || '생년월일이 없어 주일학교 칸을 채우지 못했습니다. 교적관리에서 골라 주세요.'::text;
    end if;
  elsif not (v_role = any (array['어린이', '중학생', '고등학생'])) then
    v_notes := v_notes || ('주일학교 칸이 「' || v_role || '」 이라 학생 화면(QT 인증)은 나오지 않습니다.');
  end if;

  if (select count(*) from public.member_links l where l.member_key = v_target) = 0 then
    v_notes := v_notes || '이어진 홈페이지 계정이 없습니다. 아이가 내 정보 ▸ 교적 인증에서 이름과 생년월일을 넣으면 바로 이어집니다.'::text;
  end if;

  return json_build_object(
    'ok', true, 'name', v_name, 'key', v_target,
    'birth', (select g.birth from public.gyojeok g where g.id = v_id),
    'ss_role', v_role, 'ss_role_set', v_role_set, 'status_fixed', n_up,
    'merged', (select coalesce(json_agg(jsonb_build_object('id', m.id, 'from', m.old_key) || m.counts order by m.id), '[]'::json)
                 from public.member_rekey_log m where m.txid = txid_current()),
    'accounts', (select coalesce(json_agg(json_build_object('email', coalesce(p.email, ''), 'status', l.member_status)), '[]'::json)
                   from public.member_links l left join public.profiles p on p.id = l.user_id
                  where l.member_key = v_target),
    'talents',     (select count(*) from public.ss_talents t where t.member_key = v_target),
    'talent_sum',  (select coalesce(sum(t.amount), 0) from public.ss_talents t where t.member_key = v_target),
    'submissions', (select count(*) from public.ss_submissions s where s.member_key = v_target),
    'notes', to_json(v_notes));
end $$;
revoke all on function public.ss_link_repair(text, text) from public, anon;
grant execute on function public.ss_link_repair(text, text) to authenticated;

-- ── 7) 부모가 자녀 교적을 고칠 때 매칭키도 생년월일을 따라가게 ─────────
--    (20260826_1930 판은 키가 비어 있을 때만 만들었다 → 생년월일을 고쳐도 키는 옛 날짜로 남아
--     아이가 교적 인증에서 바른 생년월일을 넣으면 교적을 못 찾았다)
--    키를 바꾸면 3) 트리거가 계정·달란트·인증·출석을 새 키로 옮긴다. 헌금이 이어진 키는 그대로 둔다(사무실 담당).
create or replace function public.update_my_child(
  p_id      bigint,
  p_birth   text default null,   -- 'YYYY-MM-DD'
  p_sex     text default null,   -- '남' | '여'
  p_ss_role text default null,   -- '어린이' | '중학생' | '고등학생'
  p_phone   text default null
) returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_name  text;
  v_old   text;
  v_new   text;
  v_birth date;
  v_note  text := '';
begin
  if not exists (select 1 from public.my_child_rows() c where c.id = p_id) then
    raise exception '내 자녀의 교적만 수정할 수 있습니다.';
  end if;
  if nullif(p_birth, '') is not null and p_birth !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '생년월일은 2016-05-03 처럼 적어 주세요.';
  end if;
  if nullif(p_ss_role, '') is not null
     and not (p_ss_role = any (array['어린이', '중학생', '고등학생'])) then
    raise exception '주일학교는 어린이·중학생·고등학생 중에서 골라 주세요.';
  end if;

  update public.gyojeok set
    birth   = case when p_birth   is null then birth   else nullif(p_birth, '')::date end,
    sex     = case when p_sex     is null then sex     else nullif(p_sex, '')         end,
    ss_role = case when p_ss_role is null then ss_role else nullif(p_ss_role, '')     end,
    phone   = case when p_phone   is null then phone
                   else nullif(regexp_replace(p_phone, '[^0-9]', '', 'g'), '')        end
  where id = p_id;

  select g.name, coalesce(g.member_key, ''), g.birth
    into v_name, v_old, v_birth
  from public.gyojeok g where g.id = p_id;

  if v_birth is not null then
    v_new := v_name || '|' || to_char(v_birth, 'YYYYMMDD');
    if v_new <> v_old then
      if exists (select 1 from public.gyojeok g where g.member_key = v_new and g.id <> p_id) then
        v_note := '같은 이름·생년월일의 교적이 이미 있어 매칭키는 그대로 두었습니다. 교회 사무실에 문의해 주세요.';
      elsif v_old not in ('', v_name || '|') and exists (select 1 from public.offerings o where o.member_key = v_old) then
        v_note := '헌금 기록이 연결돼 있어 매칭키는 교회 사무실에서만 바꿀 수 있습니다.';
      else
        update public.gyojeok set member_key = v_new where id = p_id;   -- 트리거가 계정·달란트·인증·출석을 옮긴다
      end if;
    end if;
  end if;

  return json_build_object(
    'ok', true,
    'note', v_note,
    'member_key', (select coalesce(member_key, '') from public.gyojeok where id = p_id)
  );
end $$;

grant execute on function public.update_my_child(bigint, text, text, text, text) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
