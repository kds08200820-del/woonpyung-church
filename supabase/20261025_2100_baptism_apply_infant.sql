-- 학습·세례·입교 신청서에 '유아세례' 신청 (2026-10-25 담임목사 "유아세례가 없습니다")
--  앞선 20261025_1900_baptism_apply_kinds.sql(실행됨)을 이어받는다.
--  유아·어린이 세례는 부모가 자녀를 위해 신청한다(총회 「학습·세례문답서」 세례 2문):
--    만 6세까지 유아세례, 만 7~13세 어린이세례 · 부모 중 한편만이라도 세례교인(입교인)이면 된다(확인은 담임목사가)
--
--  · app_submit_infant(신청서, 부모 이름, 연락처, 자녀 jsonb [{name, birth:'YYYY-MM-DD'}, …]) : 나 — 유아세례 신청(자녀 1~5명)
--      app_entries 한 줄(한 계정에 한 신청)에 apply_kind = '유아세례', participants = [부모(adult), 자녀(minor, birth, rite)…],
--      minors = 자녀 수, memo = '자녀: 홍길순(2024.03.01, 유아세례) · …' 로 넣는다(다시 내면 고친다). 신청비 없음.
--      자녀가 만 14세 이상이면 받지 않는다(학습으로 본인이 신청). 같은 신청서에 다른 분(배우자)이 같은 자녀를 이미 신청했으면 알린다.
--      담임목사가 정한 학습·세례·입교 대상 목록(app_form_targets)과는 상관없이 받는다(부모는 대상 선정에 들지 않음).
--  · 비파괴: 함수 1개 추가. 표·칼럼 변경 없음. 다시 실행해도 안전.
--
-- 되돌리기:
--   drop function if exists public.app_submit_infant(bigint, text, text, jsonb);

create or replace function public.app_submit_infant(p_form bigint, p_name text, p_phone text, p_children jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  f public.app_forms; e public.app_entries;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_parts jsonb; v_memo text := ''; c jsonb; v_cn text; v_cb date; v_age integer; v_n integer := 0; v_id bigint; v_rite text;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 신청할 수 있습니다.'); end if;
  select * into f from public.app_forms where id = p_form and published and kind = 'baptism' for update;
  if not found then return json_build_object('ok', false, 'why', 'form', 'error', '신청서를 찾을 수 없습니다.'); end if;
  if now() < f.open_at then return json_build_object('ok', false, 'why', 'before', 'error', '아직 신청 기간이 아닙니다.'); end if;
  if f.close_at is not null and now() >= f.close_at then return json_build_object('ok', false, 'why', 'closed', 'error', '신청이 마감되었습니다.'); end if;
  if v_name = '' or char_length(v_name) > 60 then return json_build_object('ok', false, 'why', 'name', 'error', '신청하는 분(부모) 이름을 적어 주십시오.'); end if;
  if v_phone = '' or char_length(v_phone) > 30 then return json_build_object('ok', false, 'why', 'phone', 'error', '연락처를 적어 주십시오.'); end if;
  if p_children is null or jsonb_typeof(p_children) <> 'array' or jsonb_array_length(p_children) not between 1 and 5 then
    return json_build_object('ok', false, 'why', 'children', 'error', '세례받을 자녀의 이름과 생년월일을 적어 주십시오(한 번에 5명까지).');
  end if;

  v_parts := jsonb_build_array(jsonb_build_object('name', v_name, 'kind', 'adult'));
  for c in select value from jsonb_array_elements(p_children) loop
    v_n := v_n + 1;
    if jsonb_typeof(c) <> 'object' then return json_build_object('ok', false, 'why', 'child', 'index', v_n - 1, 'error', v_n || '번째 자녀를 다시 적어 주십시오.'); end if;
    v_cn := btrim(coalesce(c ->> 'name', ''));
    if v_cn = '' or char_length(v_cn) > 40 then return json_build_object('ok', false, 'why', 'child', 'index', v_n - 1, 'error', v_n || '번째 자녀의 이름을 적어 주십시오.'); end if;
    v_cb := null;
    if coalesce(c ->> 'birth', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      begin v_cb := (c ->> 'birth')::date; exception when others then v_cb := null; end;
    end if;
    if v_cb is null or v_cb > current_date then
      return json_build_object('ok', false, 'why', 'birth', 'index', v_n - 1, 'error', v_cn || ' — 생년월일을 바르게 적어 주십시오.');
    end if;
    v_age := extract(year from age(current_date, v_cb))::integer;
    if v_age > 13 then
      return json_build_object('ok', false, 'why', 'age', 'index', v_n - 1, 'error', v_cn || ' — 만 14세 이상은 유아·어린이 세례가 아니라 본인이 ‘학습’으로 신청합니다.');
    end if;
    if exists (select 1 from jsonb_array_elements(v_parts) p where p ->> 'kind' = 'minor' and p ->> 'name' = v_cn and p ->> 'birth' = to_char(v_cb, 'YYYY-MM-DD')) then
      return json_build_object('ok', false, 'why', 'child', 'index', v_n - 1, 'error', v_cn || ' — 같은 자녀를 두 번 적으셨습니다.');
    end if;
    if exists (select 1 from public.app_entries x, jsonb_array_elements(x.participants) q
                where x.form_id = f.id and x.user_id <> auth.uid() and x.status = 'active' and x.apply_kind = '유아세례'
                  and q ->> 'kind' = 'minor' and q ->> 'name' = v_cn and q ->> 'birth' = to_char(v_cb, 'YYYY-MM-DD')) then
      return json_build_object('ok', false, 'why', 'dup', 'index', v_n - 1, 'error', v_cn || ' — 이미 신청된 자녀입니다. 배우자께서 신청하셨는지 확인해 주십시오.');
    end if;
    v_rite := case when v_age >= 7 then '어린이세례' else '유아세례' end;
    v_parts := v_parts || jsonb_build_array(jsonb_build_object('name', v_cn, 'kind', 'minor', 'birth', to_char(v_cb, 'YYYY-MM-DD'), 'rite', v_rite));
    v_memo := v_memo || case when v_memo = '' then '' else ' · ' end || v_cn || '(' || to_char(v_cb, 'YYYY.MM.DD') || ', ' || v_rite || ')';
  end loop;
  v_memo := '자녀: ' || v_memo;

  select * into e from public.app_entries where form_id = f.id and user_id = auth.uid() for update;
  if found then
    update public.app_entries
       set name = v_name, phone = v_phone, adults = 1, minors = v_n, memo = v_memo, fee_total = 0, status = 'active',
           participants = v_parts, apply_kind = '유아세례', answers = '[]'::jsonb
     where id = e.id;
    return json_build_object('ok', true, 'id', e.id, 'updated', true, 'children', v_n);
  end if;
  insert into public.app_entries (form_id, user_id, name, phone, adults, minors, memo, fee_total, participants, apply_kind, answers)
  values (f.id, auth.uid(), v_name, v_phone, 1, v_n, v_memo, 0, v_parts, '유아세례', '[]'::jsonb)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'updated', false, 'children', v_n);
end $$;
revoke all on function public.app_submit_infant(bigint, text, text, jsonb) from public, anon;
grant execute on function public.app_submit_infant(bigint, text, text, jsonb) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
