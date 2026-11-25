-- ============================================================
--  운평장로교회 — 재정 지키기를 DB 로: 영수증 번호 · 마감 · 전체 삭제 (2026-11-25 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  1) 기부금영수증 일련번호를 DB 가 매긴다(귀속연도-0001). 두 사람이 동시에, 또는 오래 열어 둔 화면에서
--     발급해도 번호가 겹치지 않는다. 지금 겹친 번호가 없으면 (연도, 번호)가 겹치지 못하게 건다.
--  2) 재정 마감(설정 ▸ 마감일)이 켜져 있으면 마감일 이전 헌금 · 지출 전표의 추가 · 수정 · 삭제를 DB 가 거절한다.
--     (지금까지는 화면에서만 막아, 마감 전에 열어 둔 화면에서는 고쳐졌다) 고쳐야 하면 설정에서 마감일을 바꾼다.
--     SQL 편집기 · 서버 함수는 그대로 고칠 수 있다(화면에서 직접 고칠 때만 본다).
--  3) 헌금 · 지출 전표 「전체 삭제」는 fin_clear_vouchers 함수로만 한다 — 지우기 전에 보관 표에 통째로 옮겨 둔다.
--     화면에서 한 번에 20건 넘게 직접 지우는 것은 DB 가 거절한다.
--
--  들어 있는 것 (모두 비파괴: CREATE TABLE · CREATE INDEX · CREATE OR REPLACE FUNCTION · CREATE OR REPLACE TRIGGER 뿐):
--   donation_receipts_no_trg · donation_receipts_fy_no_uniq(겹친 번호가 없을 때만)
--   fin_lock_guard_trg(offerings · expenses) · fin_bulk_delete_guard_trg(offerings · expenses)
--   fin_cleared_vouchers(지운 전표 보관 표, 재정 권한자만 읽음) · fin_clear_vouchers(p_type)
--   필요한 것: donation_receipts.sql · offerings.sql · finance_migration.sql(expenses · is_finance) · app_settings.sql
--
--  ── 되돌리는 방법 (사람이 직접 — 트리거를 지우면 예전처럼 움직인다) ──
--    drop trigger if exists donation_receipts_no_trg on public.donation_receipts;
--    drop trigger if exists fin_lock_guard_trg on public.offerings;   drop trigger if exists fin_lock_guard_trg on public.expenses;
--    drop trigger if exists fin_bulk_delete_guard_trg on public.offerings;   drop trigger if exists fin_bulk_delete_guard_trg on public.expenses;
--    drop index if exists public.donation_receipts_fy_no_uniq;
--    (보관 표 · 함수는 남겨 두어도 해가 없다)
-- ============================================================

-- ── 1) 영수증 일련번호 ────────────────────────────────────────
create or replace function public.donation_receipts_no()
returns trigger language plpgsql set search_path = public as $$
declare v_max int;
begin
  -- 같은 연도의 발급은 차례로
  perform pg_advisory_xact_lock(hashtext('donation_receipts_no:' || new.fy::text));
  select coalesce(max((substring(r.receipt_no from '^\d+-(\d+)$'))::int), 0) into v_max
    from public.donation_receipts r where r.fy = new.fy;
  new.receipt_no := new.fy::text || '-' || lpad((v_max + 1)::text, 4, '0');
  return new;
end $$;
create or replace trigger donation_receipts_no_trg before insert on public.donation_receipts
  for each row execute function public.donation_receipts_no();

do $$ begin
  if not exists (select 1 from pg_class where relname = 'donation_receipts_fy_no_uniq' and relnamespace = 'public'::regnamespace) then
    if exists (select 1 from public.donation_receipts group by fy, receipt_no having count(*) > 1) then
      raise notice '겹친 영수증 번호가 이미 있어 겹침 막기(unique)는 걸지 않았습니다 — 번호를 정리한 뒤 이 파일을 다시 실행하세요.';
    else
      create unique index donation_receipts_fy_no_uniq on public.donation_receipts (fy, receipt_no);
    end if;
  end if;
end $$;

-- ── 2) 재정 마감 ──────────────────────────────────────────────
--   app_settings: fin_lock_on = '1' 이고 fin_lock_date = 'YYYY-MM-DD' 이면, 그날까지의 전표는 화면에서 바꿀 수 없다.
create or replace function public.fin_lock_date()
returns date language sql stable security definer set search_path = public as $$
  select case when (select value from public.app_settings where key = 'fin_lock_on') = '1'
              then (select case when btrim(value) ~ '^\d{4}-\d{2}-\d{2}$' then btrim(value)::date end
                      from public.app_settings where key = 'fin_lock_date') end
$$;
revoke all on function public.fin_lock_date() from public, anon;
grant execute on function public.fin_lock_date() to authenticated;

create or replace function public.fin_lock_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_lock date; v_col text := case when tg_table_name = 'expenses' then 'exp_date' else 'offer_date' end; v_new date; v_old date;
begin
  if current_user not in ('authenticated', 'anon') then return coalesce(new, old); end if;   -- SQL 편집기 · 서버 함수는 그대로
  v_lock := public.fin_lock_date();
  if v_lock is null then return coalesce(new, old); end if;
  if tg_op <> 'DELETE' then v_new := (to_jsonb(new) ->> v_col)::date; end if;
  if tg_op <> 'INSERT' then v_old := (to_jsonb(old) ->> v_col)::date; end if;
  if (v_new is not null and v_new <= v_lock) or (v_old is not null and v_old <= v_lock) then
    raise exception '마감된 기간(% 이전)의 전표입니다. 고치려면 재정관리 설정에서 마감일을 바꿔 주세요.', to_char(v_lock + 1, 'YYYY-MM-DD')
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create or replace trigger fin_lock_guard_trg before insert or update or delete on public.offerings
  for each row execute function public.fin_lock_guard();
create or replace trigger fin_lock_guard_trg before insert or update or delete on public.expenses
  for each row execute function public.fin_lock_guard();

-- ── 3) 전체 삭제는 보관한 뒤에만 ───────────────────────────────
-- 지운 전표를 통째로(jsonb) 보관 — 표에 칸이 늘어도 그대로 담긴다
create table if not exists public.fin_cleared_vouchers (
  id         bigint generated always as identity primary key,
  src        text not null,          -- offerings | expenses
  row_data   jsonb not null,         -- 지우기 전 전표 한 줄 그대로
  cleared_at timestamptz not null default now(),
  cleared_by uuid
);
create index if not exists fin_cleared_vouchers_at_idx on public.fin_cleared_vouchers (cleared_at desc);
alter table public.fin_cleared_vouchers enable row level security;
revoke all on public.fin_cleared_vouchers from anon, authenticated;
grant select on public.fin_cleared_vouchers to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fin_cleared_vouchers' and policyname = 'fin_cleared_vouchers_read') then
    create policy fin_cleared_vouchers_read on public.fin_cleared_vouchers for select using (public.is_finance());
  end if;
end $$;

-- p_type: '수입'(헌금) | '지출'. 마감이 켜져 있으면 하지 않는다. 돌려주는 것: 지운(=보관한) 건수
create or replace function public.fin_clear_vouchers(p_type text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare n int; kept int;
begin
  if not public.is_finance() then raise exception '재정 권한이 필요합니다.' using errcode = '42501'; end if;
  if public.fin_lock_date() is not null then raise exception '재정 마감이 켜져 있어 전체 삭제를 할 수 없습니다. 설정에서 마감을 끈 뒤 하세요.'; end if;
  if p_type = '지출' then
    insert into public.fin_cleared_vouchers (src, row_data, cleared_by) select 'expenses', to_jsonb(e), auth.uid() from public.expenses e;
    delete from public.expenses where true; get diagnostics n = row_count;
    select count(*) into kept from public.offerings;
  else
    insert into public.fin_cleared_vouchers (src, row_data, cleared_by) select 'offerings', to_jsonb(o), auth.uid() from public.offerings o;
    delete from public.offerings where true; get diagnostics n = row_count;
    select count(*) into kept from public.expenses;
  end if;
  return json_build_object('ok', true, 'deleted', n, 'kept', kept);
end $$;
revoke all on function public.fin_clear_vouchers(text) from public, anon;
grant execute on function public.fin_clear_vouchers(text) to authenticated;

-- 화면에서 직접(REST) 한 번에 20건 넘게 지우는 것은 거절 — 전체 삭제는 위 함수로
create or replace function public.fin_bulk_delete_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and (select count(*) from gone) > 20 then
    raise exception '한 번에 많은 전표를 지울 수 없습니다. 전체 삭제는 재정관리 화면의 「전체 삭제」를 쓰세요.' using errcode = '42501';
  end if;
  return null;
end $$;
create or replace trigger fin_bulk_delete_guard_trg after delete on public.offerings
  referencing old table as gone for each statement execute function public.fin_bulk_delete_guard();
create or replace trigger fin_bulk_delete_guard_trg after delete on public.expenses
  referencing old table as gone for each statement execute function public.fin_bulk_delete_guard();

insert into public.schema_log(file) values ('20261125_1200_fin_db_guards.sql') on conflict (file) do update set applied_at = now();
