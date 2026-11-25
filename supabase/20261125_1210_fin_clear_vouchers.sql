-- ============================================================
--  운평장로교회 — 재정 전표 「전체 삭제」를 보관한 뒤에만 (2026-11-25 담임목사 지시)
--  ※ 이 파일은 사람이 직접 실행한다 — 지우는 문장(전체 삭제 함수)이 들어 있어 SQL 편집기가
--     「Potential issue detected」 확인 창을 띄운다. 내용을 확인하고 「Run query」를 누른다.
--     (이 파일을 실행하는 것만으로는 아무것도 지워지지 않는다 — 함수를 만들 뿐이다)
--
--  재정관리 ▸ 일괄 입력의 「기존 수입 전표 전체 삭제」가 이 함수를 부른다.
--   · 재정 권한자만, 마감이 켜져 있으면 하지 않는다.
--   · 지우기 전에 전표를 한 줄씩 통째로(jsonb) fin_cleared_vouchers 에 옮겨 둔다(누가 · 언제 포함).
--  이 파일을 실행하기 전에는 화면의 「전체 삭제」가 「아직 준비되지 않았습니다」로 멈춘다.
--  필요한 것: 20261125_1200_fin_db_guards.sql(fin_lock_date) · finance_migration.sql(is_finance)
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    drop function if exists public.fin_clear_vouchers(text);
--    alter table public.fin_cleared_vouchers rename to fin_cleared_vouchers_archived;   (DROP 하지 않는다)
-- ============================================================

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

insert into public.schema_log(file) values ('20261125_1210_fin_clear_vouchers.sql') on conflict (file) do update set applied_at = now();
