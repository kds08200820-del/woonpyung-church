-- 학습·세례·입교 신청: 신청 종류 셋(학습 | 세례 | 입교) · 내 교적으로 신청 자격 안내 (2026-10-25 담임목사 지시)
--  앞선 20261025_1300_app_forms_baptism.sql(실행됨) · 20261025_1700_baptism_targets.sql 을 이어받는다 — 1700 다음에 실행.
--  담임목사: "신청서 작성 페이지를 클릭하면 교적 정보를 바탕으로 신청 가능 여부를 안내하고, 학습 또는 세례 또는 입교 중
--            어떤 것을 해야 하는지 안내해 주세요. 셋 중 하나를 선택하는 항목이 있어야 합니다."
--
--  · app_my_baptism_status() : 나 — 내 교적(member_links 의 매칭키로 찾은 gyojeok 한 줄)으로 신청 자격을 계산해 돌려준다.
--      기준(js/forms-admin.js baptTargets 와 같음):
--        학습: 신급 원입·빈칸, 교회 등록일(reg_date)에서 6개월 지남, 만 14세 이상
--        세례: 신급 학습, 학습일(learn_date)에서 6개월 지남
--        입교: 신급 유아세례, 만 14세
--      st: ok 신청 가능 · wait 아직(from 날짜부터) · check 교적 날짜가 비어 확인 필요 · done 이미 세례교인 · young 만 14세 미만(유아·어린이 세례 길)
--          · nolink 계정이 교적과 연결되지 않음 · nogj 교적에서 찾지 못함
--      돌려주는 것은 본인 교적의 신급·생년월일·등록일·학습일과 계산 결과뿐(다른 사람 자료 없음).
--  · app_submit_qa(…) : 신청 종류로 '학습' | '세례' | '입교' 를 받는다(앞서 쓰던 '세례(입교)' 도 그대로 받음).
--      담임목사가 정한 대상 종류가 있으면 그 종류로만(세례 대상 → '세례', 입교 대상 → '입교'; 옛 '세례(입교)' 도 통과).
--      질문 앞 [세례] 는 세례·입교를 고른 분에게, [학습] 은 학습을 고른 분에게만 묻는다(문답 칸을 없앤 뒤에는 질문이 비어 있다).
--  · 비파괴: 함수 1개 추가 + app_submit_qa 같은 이름·같은 인자로 바꿈. 표·칼럼 변경 없음. 다시 실행해도 안전.
--
-- 되돌리기:
--   drop function if exists public.app_my_baptism_status();
--   app_submit_qa 는 supabase/20261025_1700_baptism_targets.sql 의 5) 부분을 다시 실행하면 앞의 것으로 돌아간다

-- 1) 나: 내 교적으로 신청 자격 — 교적에 칼럼이 없어도(1700 전) 돌아가게 한 줄을 jsonb 로 읽는다
create or replace function public.app_my_baptism_status()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_key text; g jsonb; v_grade text; v_birth date; v_reg date; v_learn date; v_age integer;
  v_kind text; v_st text; v_from date; v_basis date; v_why text; v_b8 text;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  select nullif(btrim(l.member_key), '') into v_key from public.member_links l where l.user_id = auth.uid();
  if v_key is null then return json_build_object('ok', true, 'st', 'nolink'); end if;
  select to_jsonb(x) into g from public.gyojeok x where x.member_key = v_key order by x.id limit 1;
  if g is null then return json_build_object('ok', true, 'st', 'nogj'); end if;

  v_grade := btrim(coalesce(g ->> 'grade', ''));
  v_b8 := split_part(v_key, '|', 2);
  if v_b8 ~ '^[0-9]{8}$' then
    begin v_birth := to_date(v_b8, 'YYYYMMDD'); exception when others then v_birth := null; end;
  end if;
  if v_birth is null and coalesce(g ->> 'birth', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then v_birth := left(g ->> 'birth', 10)::date; end if;
  if coalesce(g ->> 'reg_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then v_reg := left(g ->> 'reg_date', 10)::date; end if;
  if coalesce(g ->> 'learn_date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then v_learn := left(g ->> 'learn_date', 10)::date; end if;
  if v_birth is not null then v_age := extract(year from age(current_date, v_birth))::integer; end if;

  if v_grade = '' or v_grade = '원입' then
    v_kind := '학습'; v_basis := v_reg;
    if v_age is not null and v_age < 14 then v_st := 'young';
    elsif v_reg is null then v_st := 'check'; v_why := '교적에 교회 등록일이 없습니다';
    else
      v_from := (v_reg + interval '6 months')::date;
      v_st := case when v_from <= current_date then 'ok' else 'wait' end;
      if v_age is null and v_st = 'ok' then v_st := 'check'; v_why := '교적에 생년월일이 없습니다'; end if;
    end if;
  elsif v_grade = '학습' then
    v_kind := '세례'; v_basis := v_learn;
    if v_learn is null then v_st := 'check'; v_why := '교적에 학습일이 없습니다';
    else
      v_from := (v_learn + interval '6 months')::date;
      v_st := case when v_from <= current_date then 'ok' else 'wait' end;
    end if;
  elsif v_grade = '유아세례' then
    v_kind := '입교'; v_basis := v_birth;
    if v_age is null then v_st := 'check'; v_why := '교적에 생년월일이 없습니다';
    elsif v_age >= 14 then v_st := 'ok';
    else v_st := 'wait'; v_from := (v_birth + interval '14 years')::date;
    end if;
  else
    v_st := 'done';   -- 세례·입교·직분(집사·권사·장로 등) — 이미 세례교인
  end if;
  return json_build_object('ok', true, 'st', v_st, 'kind', v_kind, 'grade', v_grade, 'age', v_age,
                           'birth', v_birth, 'reg_date', v_reg, 'learn_date', v_learn, 'basis', v_basis, 'from', v_from, 'why', v_why);
end $$;
revoke all on function public.app_my_baptism_status() from public, anon;
grant execute on function public.app_my_baptism_status() to authenticated;

-- 2) 신청 — 종류 셋(학습 | 세례 | 입교), 옛 '세례(입교)' 도 받음
create or replace function public.app_submit_qa(p_form bigint, p_name text, p_phone text, p_apply text, p_answers jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  f public.app_forms; e public.app_entries;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_nq integer; v_id bigint; v_ans jsonb := '[]'::jsonb; v_a text; v_q text; i integer;
  v_has_targets boolean; v_tkind text; v_found boolean;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 신청할 수 있습니다.'); end if;
  select * into f from public.app_forms where id = p_form and published and kind = 'baptism' for update;
  if not found then return json_build_object('ok', false, 'why', 'form', 'error', '신청서를 찾을 수 없습니다.'); end if;
  if now() < f.open_at then return json_build_object('ok', false, 'why', 'before', 'error', '아직 신청 기간이 아닙니다.'); end if;
  if f.close_at is not null and now() >= f.close_at then return json_build_object('ok', false, 'why', 'closed', 'error', '신청이 마감되었습니다.'); end if;
  if v_name = '' or char_length(v_name) > 60 then return json_build_object('ok', false, 'why', 'name', 'error', '신청하는 분 이름을 적어 주십시오.'); end if;
  if v_phone = '' or char_length(v_phone) > 30 then return json_build_object('ok', false, 'why', 'phone', 'error', '연락처를 적어 주십시오.'); end if;
  if p_apply is null or p_apply not in ('학습', '세례', '입교', '세례(입교)') then
    return json_build_object('ok', false, 'why', 'apply', 'error', '학습·세례·입교 가운데 하나를 골라 주십시오.');
  end if;

  select exists (select 1 from public.app_form_targets where form_id = f.id and active) into v_has_targets;
  if v_has_targets then
    select true, t.kind into v_found, v_tkind from public.app_form_targets t
     where t.form_id = f.id and t.active
       and t.key_hash = public.app_key_hash((select l.member_key from public.member_links l where l.user_id = auth.uid()))
     limit 1;
    if not coalesce(v_found, false) then
      return json_build_object('ok', false, 'why', 'target', 'error', '신청 대상이 아닙니다. 대상이어야 하는데 신청이 안 되면 교회에 말씀해 주십시오.');
    end if;
    if v_tkind is not null and not (p_apply = v_tkind or (p_apply = '세례(입교)' and v_tkind in ('세례', '입교'))) then
      return json_build_object('ok', false, 'why', 'kind', 'kind', v_tkind, 'error', v_tkind || ' 신청 대상이십니다. ‘' || v_tkind || '’을 골라 주십시오.');
    end if;
  end if;

  v_nq := case when jsonb_typeof(f.questions) = 'array' then jsonb_array_length(f.questions) else 0 end;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> v_nq then
    return json_build_object('ok', false, 'why', 'answers', 'error', '문답을 모두 적어 주십시오.');
  end if;
  for i in 0 .. v_nq - 1 loop
    v_q := coalesce(f.questions ->> i, '');
    if (v_q like '[학습]%' and p_apply <> '학습') or (v_q like '[세례]%' and p_apply = '학습') then   -- 고른 종류에 해당하지 않는 질문은 건너뛴다(빈 답으로 둔다)
      v_ans := v_ans || to_jsonb(''::text); continue;
    end if;
    v_a := btrim(coalesce(p_answers ->> i, ''));
    if v_a = '' then return json_build_object('ok', false, 'why', 'answer', 'index', i, 'error', (i + 1) || '번 문답을 적어 주십시오.'); end if;
    if char_length(v_a) > 3000 then return json_build_object('ok', false, 'why', 'answer', 'index', i, 'error', (i + 1) || '번 답은 3000자까지 적을 수 있습니다.'); end if;
    v_ans := v_ans || to_jsonb(v_a);
  end loop;

  select * into e from public.app_entries where form_id = f.id and user_id = auth.uid() for update;
  if found then
    update public.app_entries
       set name = v_name, phone = v_phone, adults = 1, minors = 0, memo = '', fee_total = 0, status = 'active',
           participants = jsonb_build_array(jsonb_build_object('name', v_name, 'kind', 'adult')), apply_kind = p_apply, answers = v_ans
     where id = e.id;
    return json_build_object('ok', true, 'id', e.id, 'updated', true);
  end if;
  insert into public.app_entries (form_id, user_id, name, phone, adults, minors, memo, fee_total, participants, apply_kind, answers)
  values (f.id, auth.uid(), v_name, v_phone, 1, 0, '', 0, jsonb_build_array(jsonb_build_object('name', v_name, 'kind', 'adult')), p_apply, v_ans)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'updated', false);
end $$;
revoke all on function public.app_submit_qa(bigint, text, text, text, jsonb) from public, anon;
grant execute on function public.app_submit_qa(bigint, text, text, text, jsonb) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
