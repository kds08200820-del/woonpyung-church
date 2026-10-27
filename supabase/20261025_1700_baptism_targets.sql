-- 학습·세례(입교) 신청 대상 — 종류별 기준 · 담임목사 알림 문구 · 교적 등록일·학습일 (2026-10-25 담임목사 지시)
--  앞선 20261025_1300_app_forms_baptism.sql(실행됨)을 이어받는다. 담임목사 기준:
--   1. 학습 : 교회에 등록한 초신자로서 6개월이 지난 자 (총회 문답서: 만 14세 이상)  → 교적 등록일(reg_date)
--   2. 세례 : 학습을 받은 뒤 6개월이 지난 자                                       → 교적 학습일(learn_date)
--   3. 입교 : 유아세례를 받은 자로서 만 14세가 된 자                                 → 교적 신급·생년월일
--  대상 계산은 관리자 화면(js/forms-admin.js)이 교적부로 하고, 담임목사가 고른 사람만 '해시 + 종류' 로 서버에 확정한다(이름은 저장하지 않음).
--  확정된 대상은 신앙 정원 '오늘의 안내'·오늘의 할 일·신청서 화면에서 '○○ 신청 대상' 안내와 담임목사 알림 문구를 본다.
--
--  · gyojeok.reg_date   date : 교회 등록일(교적 수정 화면 '등록일')   — 비어 있으면 화면이 '확인 필요' 로 보여 준다
--  · gyojeok.learn_date date : 학습일(교적 수정 화면 '학습일', 학습 교인 증명서 발급 때 함께 채울 수 있음)
--  · app_form_targets.kind   : '학습' | '세례' | '입교' (비어 있으면 종류 제한 없음 — 앞선 방식으로 확정된 대상)
--  · app_forms.target_note   : 대상에게 보이는 담임목사 알림 문구
--  · app_form_set_targets_kind(신청서, [{h:해시, k:종류}], 문구) : 관리자 — 대상 확정(이전 대상은 비활성, 지우지 않음)
--  · app_my_target_info()      : 나 — 내가 대상인 지금 받는 학습·세례 신청서 [{form_id, kind, note, title, close_at}]
--  · app_submit_qa(…)          : 앞선 것과 같고, 대상의 종류가 정해져 있으면 그 종류로만 신청하게 한다(학습 → '학습', 세례·입교 → '세례(입교)')
--  · 비파괴: 칼럼 4개 추가(모두 비어 있어도 됨) + 함수 2개 추가 + app_submit_qa 같은 이름으로 바꿈. 지우는 것 없음. 다시 실행해도 안전.
--
-- 되돌리기:
--   drop function if exists public.app_my_target_info();
--   drop function if exists public.app_form_set_targets_kind(bigint, jsonb, text);
--   app_submit_qa 는 supabase/20261025_1300_app_forms_baptism.sql 의 5) 부분을 다시 실행하면 앞의 것으로 돌아간다
--   alter table public.app_forms rename column target_note to target_note_archived;
--   alter table public.app_form_targets rename column kind to kind_archived;
--   alter table public.gyojeok rename column reg_date to reg_date_archived;
--   alter table public.gyojeok rename column learn_date to learn_date_archived;
--   (칼럼 삭제는 4주 뒤 백업 확인 후 사람이)

-- 1) 교적: 등록일 · 학습일
alter table public.gyojeok add column if not exists reg_date date;
alter table public.gyojeok add column if not exists learn_date date;
comment on column public.gyojeok.reg_date is '교회 등록일 — 학습 대상(등록 6개월 경과) 판단';
comment on column public.gyojeok.learn_date is '학습일 — 세례 대상(학습 6개월 경과) 판단';

-- 2) 대상 종류 · 알림 문구
-- (SQL Editor 에서 do 블록이 'no language specified' 를 내는 일이 있어, 검사 조건은 칼럼을 만들 때 함께 단다 — 다시 실행하면 칼럼째 건너뛴다)
alter table public.app_form_targets add column if not exists kind text constraint app_form_targets_kind_chk check (kind is null or kind in ('학습', '세례', '입교'));
alter table public.app_forms add column if not exists target_note text;

-- 3) 관리자: 종류와 함께 대상 확정 + 알림 문구
create or replace function public.app_form_set_targets_kind(p_form bigint, p_items jsonb, p_note text)
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer; v_l integer; v_b integer; v_c integer;
begin
  if not exists (select 1 from public.admins where uid = auth.uid()) then
    return json_build_object('ok', false, 'why', 'admin', 'error', '관리자만 할 수 있습니다.');
  end if;
  if not exists (select 1 from public.app_forms where id = p_form and kind = 'baptism') then
    return json_build_object('ok', false, 'why', 'form', 'error', '학습·세례 신청서가 아닙니다.');
  end if;
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    return json_build_object('ok', false, 'why', 'items', 'error', '대상 목록이 올바르지 않습니다.');
  end if;
  update public.app_form_targets set active = false where form_id = p_form;
  insert into public.app_form_targets (form_id, key_hash, active, kind)
  select p_form, s.h, true, s.k
    from (select distinct on (e ->> 'h') e ->> 'h' as h, nullif(e ->> 'k', '') as k
            from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
           where jsonb_typeof(e) = 'object' and (e ->> 'h') ~ '^[0-9a-f]{16}$' and coalesce(e ->> 'k', '') in ('', '학습', '세례', '입교')
           order by e ->> 'h') s
  on conflict (form_id, key_hash) do update set active = true, kind = excluded.kind;
  update public.app_forms set target_note = nullif(left(btrim(coalesce(p_note, '')), 300), '') where id = p_form;
  select count(*), count(*) filter (where kind = '학습'), count(*) filter (where kind = '세례'), count(*) filter (where kind = '입교')
    into v_n, v_l, v_b, v_c from public.app_form_targets where form_id = p_form and active;
  return json_build_object('ok', true, 'n', v_n, 'learn', v_l, 'baptism', v_b, 'confirm', v_c);
end $$;
revoke all on function public.app_form_set_targets_kind(bigint, jsonb, text) from public, anon;
grant execute on function public.app_form_set_targets_kind(bigint, jsonb, text) to authenticated;

-- 4) 나: 내가 대상인 지금 받는 학습·세례 신청서 — 종류·알림 문구 함께 (대상 이름·해시는 돌려주지 않는다)
create or replace function public.app_my_target_info()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('form_id', t.form_id, 'kind', t.kind, 'note', f.target_note, 'title', f.title, 'close_at', f.close_at) order by t.form_id), '[]'::json)
    from public.app_form_targets t
    join public.app_forms f on f.id = t.form_id
   where auth.uid() is not null and t.active and f.published and f.kind = 'baptism'
     and f.open_at <= now() and (f.close_at is null or f.close_at > now())
     and t.key_hash = public.app_key_hash((select l.member_key from public.member_links l where l.user_id = auth.uid()))
$$;
revoke all on function public.app_my_target_info() from public, anon;
grant execute on function public.app_my_target_info() to authenticated;

-- 5) 신청하기·고치기 — 앞선 것(20261025_1300)과 같고, 대상 종류가 정해져 있으면 그 종류로만
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
  if p_apply not in ('학습', '세례(입교)') then return json_build_object('ok', false, 'why', 'apply', 'error', '학습과 세례(입교) 가운데 하나를 골라 주십시오.'); end if;

  select exists (select 1 from public.app_form_targets where form_id = f.id and active) into v_has_targets;
  if v_has_targets then
    select true, t.kind into v_found, v_tkind from public.app_form_targets t
     where t.form_id = f.id and t.active
       and t.key_hash = public.app_key_hash((select l.member_key from public.member_links l where l.user_id = auth.uid()))
     limit 1;
    if not coalesce(v_found, false) then
      return json_build_object('ok', false, 'why', 'target', 'error', '신청 대상이 아닙니다. 대상이어야 하는데 신청이 안 되면 교회에 말씀해 주십시오.');
    end if;
    if v_tkind is not null and ((v_tkind = '학습' and p_apply <> '학습') or (v_tkind in ('세례', '입교') and p_apply <> '세례(입교)')) then
      return json_build_object('ok', false, 'why', 'kind', 'kind', v_tkind,
        'error', v_tkind || ' 신청 대상이십니다. ‘' || case when v_tkind = '학습' then '학습' else '세례(입교)' end || '’을 골라 주십시오.');
    end if;
  end if;

  v_nq := case when jsonb_typeof(f.questions) = 'array' then jsonb_array_length(f.questions) else 0 end;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> v_nq then
    return json_build_object('ok', false, 'why', 'answers', 'error', '문답을 모두 적어 주십시오.');
  end if;
  for i in 0 .. v_nq - 1 loop
    v_q := coalesce(f.questions ->> i, '');
    if (v_q like '[학습]%' and p_apply <> '학습') or (v_q like '[세례]%' and p_apply <> '세례(입교)') then   -- 고른 종류에 해당하지 않는 질문은 건너뛴다(빈 답으로 둔다)
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
