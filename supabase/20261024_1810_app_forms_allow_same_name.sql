-- 신청서 '같은 이름도 받기' (2026-10-24 담임목사 지시)
--  책처럼 한 사람이 여러 권을 신청하는 신청서는 같은 이름이 여러 번 나올 수 있다.
--  · app_forms.allow_same_name : true 면 한 신청 안에서도, 다른 신청과도 같은 이름을 막지 않는다. 기본 false(지금과 같음).
--  · app_submit(7칸) · app_admin_payment : 20261010_1300 의 본문에서 '같은 이름 막기' 두 곳과 '되살리기' 확인 한 곳만 allow_same_name 이면 건너뛰게 바꾼 것(나머지 같음).
--  · 비파괴: 칸 하나 추가(DEFAULT false) + 함수 교체. 지우는 것 없음. 이 SQL 을 실행하기 전에도 화면은 지금처럼 같은 이름을 막는다.
--
-- 되돌리기 (DROP 대신 RENAME · 함수는 이전 본문으로):
--   update public.app_forms set allow_same_name = false;                         -- 모든 신청서가 다시 같은 이름을 막는다
--   함수를 이전 모양으로 되돌리려면 supabase/20261010_1300_app_participants.sql 의 app_submit(7칸)·app_admin_payment 본문을 다시 실행한다.
--   alter table public.app_forms rename column allow_same_name to allow_same_name_archived;   (칸 삭제는 4주 뒤 백업 확인 후 사람이)

alter table public.app_forms add column if not exists allow_same_name boolean not null default false;

create or replace function public.app_submit(p_form bigint, p_name text, p_phone text, p_adults integer, p_minors integer, p_memo text, p_names jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  f public.app_forms; e public.app_entries;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_ad integer := coalesce(p_adults, 0);
  v_mi integer := coalesce(p_minors, 0);
  v_memo text := left(btrim(coalesce(p_memo, '')), 1000);
  v_fee integer; v_id bigint; v_n integer; v_nm text; v_k text; v_el jsonb;
  v_names text[] := '{}'; v_keys text[] := '{}'; v_dups text[];
  v_parts jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 신청할 수 있습니다.'); end if;
  -- 같은 신청서의 신청을 한 줄로 세운다 (이름 겹침 확인과 저장 사이에 다른 신청이 끼지 않게)
  select * into f from public.app_forms where id = p_form and published for update;
  if not found then return json_build_object('ok', false, 'why', 'form', 'error', '신청서를 찾을 수 없습니다.'); end if;
  if now() < f.open_at then return json_build_object('ok', false, 'why', 'before', 'error', '아직 신청 기간이 아닙니다.'); end if;
  if f.close_at is not null and now() >= f.close_at then return json_build_object('ok', false, 'why', 'closed', 'error', '신청이 마감되었습니다.'); end if;
  if not f.ask_minor then v_mi := 0; end if;
  if f.memo_label = '' then v_memo := ''; end if;
  if v_name = '' or char_length(v_name) > 60 then return json_build_object('ok', false, 'why', 'name', 'error', '신청하는 분 이름을 적어 주십시오.'); end if;
  if v_phone = '' or char_length(v_phone) > 30 then return json_build_object('ok', false, 'why', 'phone', 'error', '연락처를 적어 주십시오.'); end if;
  if v_ad < 0 or v_mi < 0 or v_ad > 50 or v_mi > 50 or v_ad + v_mi < 1 then
    return json_build_object('ok', false, 'why', 'count', 'error', '인원을 확인해 주십시오.');
  end if;

  -- 참가자 이름: 성인 먼저, 그다음 미성년자. 인원 수만큼, 1~30자, 한 신청 안에서 겹치지 않게
  v_n := v_ad + v_mi;
  if p_names is null or jsonb_typeof(p_names) <> 'array' or jsonb_array_length(p_names) <> v_n then
    return json_build_object('ok', false, 'why', 'names', 'error', '참가자 이름을 인원 수만큼 적어 주십시오.');
  end if;
  for i in 0 .. v_n - 1 loop
    v_el := p_names -> i;
    v_nm := btrim(coalesce(case jsonb_typeof(v_el) when 'object' then v_el ->> 'name' when 'string' then v_el #>> '{}' end, ''));
    if v_nm = '' or char_length(v_nm) > 30 then
      return json_build_object('ok', false, 'why', 'pname', 'index', i, 'error', '참가자 이름(' || (i + 1) || '번째)을 1~30자로 적어 주십시오.');
    end if;
    v_k := public.app_name_key(v_nm);
    if v_k = any (v_keys) and not f.allow_same_name then   -- 같은 이름 허용 신청서(책 여러 권 등)는 겹쳐도 된다
      return json_build_object('ok', false, 'why', 'dupself', 'names', json_build_array(v_nm), 'error', '같은 이름을 두 번 적었습니다: ' || v_nm);
    end if;
    v_names := v_names || v_nm; v_keys := v_keys || v_k;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('name', v_nm, 'kind', case when i < v_ad then 'adult' else 'minor' end));
  end loop;

  -- 같은 신청서의 다른 사람 신청(취소하지 않은 것)에 이미 있는 이름
  select array_agg(s.nm order by s.ord) into v_dups
    from unnest(v_names, v_keys) with ordinality as s(nm, k, ord)
   where not f.allow_same_name and exists (select 1 from public.app_entries x, jsonb_array_elements(x.participants) p
                  where x.form_id = f.id and x.status = 'active' and x.user_id <> auth.uid()
                    and jsonb_typeof(p) = 'object' and public.app_name_key(p ->> 'name') = s.k);
  if v_dups is not null then
    return json_build_object('ok', false, 'why', 'dup', 'names', to_json(v_dups), 'error', '이미 신청된 이름이 있습니다: ' || array_to_string(v_dups, ', '));
  end if;

  v_fee := v_ad * f.fee_adult + v_mi * f.fee_minor;
  select * into e from public.app_entries where form_id = f.id and user_id = auth.uid() for update;
  if found then
    if e.paid_at is not null and e.fee_total <> v_fee then
      return json_build_object('ok', false, 'why', 'paid', 'error', '납부를 표시한 뒤에는 금액이 바뀌는 수정을 할 수 없습니다. 교회에 말씀해 주십시오.');
    end if;
    update public.app_entries
       set name = v_name, phone = v_phone, adults = v_ad, minors = v_mi, memo = v_memo, fee_total = v_fee, status = 'active', participants = v_parts
     where id = e.id;
    return json_build_object('ok', true, 'id', e.id, 'fee_total', v_fee, 'updated', true);
  end if;
  insert into public.app_entries (form_id, user_id, name, phone, adults, minors, memo, fee_total, participants)
  values (f.id, auth.uid(), v_name, v_phone, v_ad, v_mi, v_memo, v_fee, v_parts)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'fee_total', v_fee, 'updated', false);
end $$;
revoke all on function public.app_submit(bigint, text, text, integer, integer, text, jsonb) from public, anon;
grant execute on function public.app_submit(bigint, text, text, integer, integer, text, jsonb) to authenticated;

create or replace function public.app_admin_payment(p_id bigint, p_action text, p_msg text default '')
returns json language plpgsql security definer set search_path = public as $$
declare e public.app_entries; v_msg text := left(btrim(coalesce(p_msg, '')), 1000); v_dups text[];
begin
  if not exists (select 1 from public.admins where uid = auth.uid()) then
    return json_build_object('ok', false, 'why', 'admin', 'error', '관리자만 할 수 있습니다.');
  end if;
  select * into e from public.app_entries where id = p_id for update;
  if not found then return json_build_object('ok', false, 'why', 'none', 'error', '신청을 찾을 수 없습니다.'); end if;

  if p_action = 'confirm' then
    update public.app_entries set paid_at = coalesce(paid_at, now()), paid_by = case when paid_at is null then 'admin' else paid_by end, confirmed_at = now() where id = e.id;
  elsif p_action = 'unconfirm' then
    update public.app_entries set confirmed_at = null where id = e.id;
  elsif p_action = 'unpaid' then
    update public.app_entries set paid_at = null, paid_by = '', confirmed_at = null where id = e.id;
  elsif p_action = 'mark_paid' then
    update public.app_entries set paid_at = now(), paid_by = 'admin', confirmed_at = now() where id = e.id;
  elsif p_action = 'message' then
    if v_msg = '' then return json_build_object('ok', false, 'why', 'msg', 'error', '보낼 안내를 적어 주십시오.'); end if;
  elsif p_action = 'cancel' then
    update public.app_entries set status = 'cancelled' where id = e.id;
  elsif p_action = 'restore' then
    perform 1 from public.app_forms where id = e.form_id for update;   -- 신청과 한 줄로
    select array_agg(distinct p ->> 'name') into v_dups
      from jsonb_array_elements(e.participants) p
     where jsonb_typeof(p) = 'object'
       and not coalesce((select allow_same_name from public.app_forms where id = e.form_id), false)   -- 같은 이름 허용 신청서는 겹쳐도 된다
       and exists (
       select 1 from public.app_entries x, jsonb_array_elements(x.participants) q
        where x.form_id = e.form_id and x.status = 'active' and x.id <> e.id
          and jsonb_typeof(q) = 'object' and public.app_name_key(q ->> 'name') = public.app_name_key(p ->> 'name'));
    if v_dups is not null then
      return json_build_object('ok', false, 'why', 'dup', 'names', to_json(v_dups), 'error', '다른 신청에 같은 이름이 있어 되살릴 수 없습니다: ' || array_to_string(v_dups, ', '));
    end if;
    update public.app_entries set status = 'active' where id = e.id;
  else
    return json_build_object('ok', false, 'why', 'action', 'error', '알 수 없는 작업입니다.');
  end if;

  if v_msg <> '' then
    update public.app_entries set admin_msg = v_msg, admin_msg_at = now(), msg_read_at = null where id = e.id;
  end if;
  select * into e from public.app_entries where id = p_id;
  return json_build_object('ok', true, 'entry', row_to_json(e));
end $$;
revoke all on function public.app_admin_payment(bigint, text, text) from public, anon;
grant execute on function public.app_admin_payment(bigint, text, text) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
