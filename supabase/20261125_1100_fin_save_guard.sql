-- ============================================================
--  운평장로교회 — 지출결의서 저장 충돌 막기 · 이력, 지급 완료를 누가 적었는지 (2026-11-25 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  1) 주간 지출결의서는 설정 표(app_settings)의 'petition_<주일>' 글 한 덩어리로 저장된다.
--     두 분이 같은 주를 열어 두면 나중에 저장한 쪽이 먼저 넣은 줄을 말없이 지웠다.
--     → setting_save_if(키, 값, 내가 읽은 시각): 내가 읽은 뒤 다른 사람이 고쳤으면 저장하지 않고 알려 준다.
--       저장할 때 예전 값을 app_settings_history 에 남긴다(같은 사람이 5분 안에 이어 고친 것은 한 번만).
--  2) 지급 완료(fin_petition_mark_paid)를 누가 적었는지 paid_by 에 남긴다. 취소하면 함께 지운다.
--
--  들어 있는 것 (모두 비파괴: CREATE TABLE · ADD COLUMN(null 가능) · CREATE OR REPLACE FUNCTION 뿐):
--   app_settings_history(id, key, old_value, changed_by, changed_at)   — 재정 권한자만 읽음
--   setting_save_if(p_key, p_value, p_base)                            — 재정 권한자만
--   fin_petitions.paid_by · fin_petition_mark_paid · fin_petition_unpay (바뀜)
--   필요한 것: app_settings.sql · 20261124_1000_fin_petition_paid.sql · 20261125_0900_fin_petition_unpay.sql
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · 화면은 setting_save_if 가 없으면 예전 저장(setSetting)으로 돌아간다 → drop function if exists public.setting_save_if(text, text, timestamptz);
--    · 표: alter table public.app_settings_history rename to app_settings_history_archived;
--    · 지급 함수: 20261124_1000 · 20261125_0900 파일의 정의를 다시 실행(paid_by 칸은 남겨 두어도 해가 없다)
-- ============================================================

-- ── 1) 설정 이력 ──────────────────────────────────────────────
create table if not exists public.app_settings_history (
  id         bigint generated always as identity primary key,
  key        text not null,
  old_value  text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists app_settings_history_key_idx on public.app_settings_history (key, changed_at desc);
alter table public.app_settings_history enable row level security;
revoke all on public.app_settings_history from anon, authenticated;
grant select on public.app_settings_history to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_settings_history' and policyname = 'app_settings_history_read') then
    create policy app_settings_history_read on public.app_settings_history for select using (public.is_finance());
  end if;
end $$;

-- ── 2) 읽은 뒤 바뀌지 않았을 때만 저장 ─────────────────────────
--   p_base = 내가 이 값을 읽었을 때의 updated_at(그때 줄이 없었으면 null)
--   돌려주는 것: { ok:true, updated_at } 또는 { ok:false, conflict:true, updated_at, at_by_me }
create or replace function public.setting_save_if(p_key text, p_value text, p_base timestamptz)
returns json language plpgsql volatile security definer set search_path = public as $$
declare
  v_row  public.app_settings%rowtype;
  v_last public.app_settings_history%rowtype;
  v_now  timestamptz := clock_timestamp();
begin
  if not public.is_finance() then raise exception '재정 권한이 필요합니다.' using errcode = '42501'; end if;
  if coalesce(p_key, '') = '' then raise exception '키가 비어 있습니다.'; end if;
  -- 같은 키를 동시에 저장하면 차례로
  perform pg_advisory_xact_lock(hashtext('setting_save_if:' || p_key));
  select * into v_row from public.app_settings where key = p_key;
  if found then
    -- 내가 읽은 뒤(또는 줄이 없을 때 읽었는데 그사이 생겼으면) 남이 고쳤다
    if p_base is null or v_row.updated_at > p_base + interval '1 millisecond' then
      return json_build_object('ok', false, 'conflict', true, 'updated_at', v_row.updated_at);
    end if;
    if v_row.value is not distinct from p_value then
      return json_build_object('ok', true, 'updated_at', v_row.updated_at, 'same', true);
    end if;
    select * into v_last from public.app_settings_history where key = p_key order by changed_at desc limit 1;
    if not found or v_last.changed_by is distinct from auth.uid() or v_last.changed_at < v_now - interval '5 minutes' then
      insert into public.app_settings_history (key, old_value, changed_by, changed_at) values (p_key, v_row.value, auth.uid(), v_now);
    end if;
    update public.app_settings set value = p_value, updated_at = v_now where key = p_key;
  else
    insert into public.app_settings (key, value, updated_at) values (p_key, p_value, v_now);
  end if;
  return json_build_object('ok', true, 'updated_at', v_now);
end $$;
revoke all on function public.setting_save_if(text, text, timestamptz) from public, anon;
grant execute on function public.setting_save_if(text, text, timestamptz) to authenticated;

-- ── 3) 지급 완료를 누가 적었는지 ──────────────────────────────
alter table public.fin_petitions add column if not exists paid_by uuid;

create or replace function public.fin_petition_mark_paid(p_ids bigint[])
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.can_access_finance() then raise exception '재정 권한이 필요합니다.'; end if;
  update public.fin_petitions
     set paid_at = now(), paid_by = auth.uid(), updated_at = now()
   where id = any(coalesce(p_ids, '{}'::bigint[])) and status = 'approved' and paid_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.fin_petition_mark_paid(bigint[]) from public, anon;
grant execute on function public.fin_petition_mark_paid(bigint[]) to authenticated;

create or replace function public.fin_petition_unpay(p_ids bigint[])
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  if not public.can_access_finance() then raise exception '재정 권한이 필요합니다.'; end if;
  update public.fin_petitions
     set paid_at = null, paid_by = null, updated_at = now()
   where id = any(coalesce(p_ids, '{}'::bigint[])) and paid_at is not null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.fin_petition_unpay(bigint[]) from public, anon;
grant execute on function public.fin_petition_unpay(bigint[]) to authenticated;

insert into public.schema_log(file) values ('20261125_1100_fin_save_guard.sql') on conflict (file) do update set applied_at = now();
