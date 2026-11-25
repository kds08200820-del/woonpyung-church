-- ============================================================
--  운평장로교회 — 교적 매칭키가 바뀔 때 따라 옮기는 표를 모두로 (2026-11-25 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  지금까지: 교적의 이름 · 생년월일을 고치면(매칭키 '이름|생년월일'이 바뀌면) rekey_member_records 가
--            계정 연결 · 출석 · 주일학교 달란트 · 인증 · 헌금 · 영수증 · 성도별 자료 8곳만 새 키로 옮겼다.
--            그 뒤 생긴 표(교육 이수 · 시험 · 증명서, 선교회 임원 · 정회원 · 회비, 부서장 · 청원, 심방 · 상담, 기관 보고 등)는
--            옛 키에 남아 화면에서 사라진 것처럼 보였다.
--  이제부터: member_key 칸이 있는 표를 DB 가 스스로 찾아 함께 옮긴다(rekey_member_more). 표가 새로 생겨도 따라간다.
--            같은 키 줄이 이미 있어 겹치면(겹침 막기) 그 줄은 옛 키에 남기고 건수를 기록한다.
--            옮긴 줄 번호는 member_rekey_more_log 에 남긴다(되돌릴 때 쓴다).
--
--  옮기지 않는 표: gyojeok(교적 자신) · 이름에 _archived · _removed · _deleted · _backup 이 든 보관 표 · member_match_requests(신청한 사람이 적은 값) ·
--                  member_rekey_log · member_rekey_more_log(기록) · rekey_member_records 가 이미 옮기는 8곳
--
--  들어 있는 것 (모두 비파괴: CREATE TABLE · CREATE OR REPLACE FUNCTION 뿐):
--   member_rekey_more_log · rekey_member_more(옛 키, 새 키) · rekey_member_records(바뀜 — 끝에 위 함수를 부름)
--   필요한 것: 20260930_0900_gyojeok_rekey.sql · 20261003_2130_ss_link_repair.sql
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · rekey_member_records 는 20261003_2130_ss_link_repair.sql 의 2) 부분을 다시 실행하면 예전 것으로 돌아간다
--    · 옮긴 줄 되돌리기: member_rekey_more_log 의 tbl · row_ids 로 update <표> set member_key = old_key where id::text = any(row_ids)
-- ============================================================

-- ── 1) 기록 ──────────────────────────────────────────────────
create table if not exists public.member_rekey_more_log (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  txid     bigint not null default txid_current(),
  old_key  text not null,
  new_key  text not null,
  tbl      text not null,
  moved    int not null default 0,
  left_n   int not null default 0,     -- 겹쳐서 옛 키에 남긴 줄
  row_ids  text[] not null default '{}'
);
alter table public.member_rekey_more_log enable row level security;   -- 정책 없음 = 화면에서는 못 읽음
revoke all on table public.member_rekey_more_log from anon, authenticated;

-- ── 2) 그 밖의 표 옮기기(내부용) ──────────────────────────────
create or replace function public.rekey_member_more(p_old text, p_new text)
returns jsonb language plpgsql security definer
set search_path = public as $$
declare
  t record; n int; n_left int; ids text[]; has_id boolean; r record;
  v_tables jsonb := '{}'::jsonb; v_total int := 0; v_left int := 0;
  skip text[] := array['gyojeok', 'gyojeok_deleted', 'member_match_requests', 'member_rekey_log', 'member_rekey_more_log',
                       'member_links', 'attendance', 'ss_talents', 'ss_submissions', 'offerings', 'donation_receipts', 'member_files'];
begin
  if coalesce(p_old, '') = '' or coalesce(p_new, '') = '' or p_old = p_new then return jsonb_build_object('moved', 0); end if;
  for t in
    select c.relname as tbl
      from pg_attribute a join pg_class c on c.oid = a.attrelid
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and a.attname = 'member_key' and not a.attisdropped
       and a.atttypid in ('text'::regtype, 'varchar'::regtype)
       and c.relname <> all (skip)
       and c.relname !~ '(_archived|_removed|_deleted|_backup|_bak)'   -- 보관 · 백업 표는 그때 모습 그대로
     order by c.relname
  loop
    has_id := exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                       where c.relnamespace = 'public'::regnamespace and c.relname = t.tbl and a.attname = 'id' and not a.attisdropped);
    n := 0; n_left := 0; ids := '{}';
    begin
      if has_id then
        execute format('with u as (update public.%I set member_key = $1 where member_key = $2 returning id::text) select coalesce(array_agg(id), ''{}'') from u', t.tbl)
          into ids using p_new, p_old;
        n := cardinality(ids);
      else
        execute format('update public.%I set member_key = $1 where member_key = $2', t.tbl) using p_new, p_old;
        get diagnostics n = row_count;
      end if;
    exception when unique_violation then
      -- 새 키에 같은 줄이 이미 있어 겹친다 → 한 줄씩, 겹치는 줄은 옛 키에 남긴다
      n := 0; ids := '{}';
      for r in execute format('select ctid as c%s from public.%I where member_key = $1', case when has_id then ', id::text as i' else ', null::text as i' end, t.tbl) using p_old loop
        begin
          execute format('update public.%I set member_key = $1 where ctid = $2', t.tbl) using p_new, r.c;
          n := n + 1; if r.i is not null then ids := ids || r.i; end if;
        exception when unique_violation then
          n_left := n_left + 1;
        end;
      end loop;
    end;
    if n + n_left > 0 then
      insert into public.member_rekey_more_log (old_key, new_key, tbl, moved, left_n, row_ids) values (p_old, p_new, t.tbl, n, n_left, ids);
      v_tables := v_tables || jsonb_build_object(t.tbl, n);
      v_total := v_total + n; v_left := v_left + n_left;
    end if;
  end loop;
  return jsonb_build_object('moved', v_total, 'left', v_left, 'tables', v_tables);
end $$;
revoke all on function public.rekey_member_more(text, text) from public, anon, authenticated;

-- ── 3) 기존 옮기기 함수 — 20261003_2130 의 것과 같고, 끝에 rekey_member_more 를 부른다 ──
create or replace function public.rekey_member_records(p_old text, p_new text, p_name text default null)
returns json language plpgsql security definer
set search_path = public as $$
declare
  a_link uuid[] := '{}'; a_tal text[] := '{}'; a_sub text[] := '{}'; a_att text[] := '{}';
  a_off text[] := '{}'; a_rec text[] := '{}'; a_file text[] := '{}';
  n_spouse int := 0; n_att_left int := 0; v_counts jsonb;
  v_more jsonb := '{}'::jsonb; n_more int := 0;   -- (2026-11-25) 그 밖의 표
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

  -- 그 밖에 member_key 칸이 있는 표(교육 이수 · 시험 · 증명서, 선교회, 부서장, 심방 · 상담 등) — 2026-11-25
  v_more := public.rekey_member_more(p_old, p_new);
  n_more := coalesce((v_more ->> 'moved')::int, 0);

  v_counts := jsonb_build_object(
    'links', cardinality(a_link), 'spouse_refs', n_spouse,
    'talents', cardinality(a_tal), 'submissions', cardinality(a_sub),
    'attendance', cardinality(a_att), 'attendance_left', n_att_left,
    'offerings', cardinality(a_off), 'receipts', cardinality(a_rec), 'files', cardinality(a_file),
    'more', v_more);

  if cardinality(a_link) + n_spouse + cardinality(a_tal) + cardinality(a_sub) + cardinality(a_att)
     + cardinality(a_off) + cardinality(a_rec) + cardinality(a_file) + n_more > 0 then
    insert into public.member_rekey_log (old_key, new_key, link_uids, talent_ids, submission_ids,
                                         attendance_ids, offering_ids, receipt_ids, file_ids, counts)
    values (p_old, p_new, a_link, a_tal, a_sub, a_att, a_off, a_rec, a_file, v_counts);
  end if;

  return (jsonb_build_object('ok', true, 'old_key', p_old, 'new_key', p_new) || v_counts)::json;
end $$;

-- Supabase 는 새 함수에 anon·authenticated 실행 권한을 기본으로 준다 → 내부용은 셋 모두에서 뺀다
revoke all on function public.rekey_member_records(text, text, text) from public, anon, authenticated;

insert into public.schema_log(file) values ('20261125_1300_rekey_more_tables.sql') on conflict (file) do update set applied_at = now();
