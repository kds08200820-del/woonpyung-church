-- 증명서 발급은 목회자만 (2026-10-25 담임목사 "증명서 발급은 교회 행정에 증명서 발급 란을 만들어 주시고, 목회자만 이용할 수 있도록 해주세요")
--  앞선 20261025_1800_edu_infant.sql 을 이어받는다 — 1800 다음에 실행.
--
--  · edu_is_pastor() : 나 — 목회자인가. 관리자(admins)이면서 ① 직분(profiles.role)에 '목사'·'전도사'가 들어 있거나
--                      ② 교적관리 > 권한 관리에서 '목회자'(member_links.can_pastor)로 지명된 분. 화면(cert.html)이 이것으로 문을 연다.
--  · edu_cert_issue(…) : 관리자 → 목회자만 발급(인자·내용은 1800 그대로). 강의실 시험 결과 없이도(p_result null) 발급된다.
--                        자료실(member_files) 항목의 올린 곳(uploaded_by)은 시험 결과 없이 낸 것이면 '증명서 발급', 있으면 '강의실'.
--  · 비파괴: 함수 1개 추가 + edu_cert_issue 같은 이름·같은 인자로 바꿈. 표·칼럼 변경 없음. 다시 실행해도 안전.
--
-- 되돌리기:
--   drop function if exists public.edu_is_pastor();   ← 먼저 아래처럼 edu_cert_issue 를 되돌린 뒤
--   edu_cert_issue 는 supabase/20261025_1800_edu_infant.sql 의 5) 부분을 다시 실행하면 관리자 누구나 발급하던 것으로 돌아간다

-- 1) 나: 목회자인가
create or replace function public.edu_is_pastor()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.admins a where a.uid = auth.uid())
     and (coalesce((select l.can_pastor from public.member_links l where l.user_id = auth.uid()), false)
          or coalesce((select p.role from public.profiles p where p.id = auth.uid()), '') ~ '(목사|전도사)')
$$;
revoke all on function public.edu_is_pastor() from public, anon;
grant execute on function public.edu_is_pastor() to authenticated;

-- 2) 증명서 발급 — 목회자만 (나머지는 1800 과 같다)
create or replace function public.edu_cert_issue(p_kind text, p_result bigint, p_member_key text, p_member_name text, p_birth date,
                                                 p_qa_date date, p_rite_date date, p_officiant text, p_church text, p_issued_on date, p_memo text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_on date := coalesce(p_issued_on, current_date);
  v_abbr text; v_seq integer; v_no text; v_id bigint; v_user uuid; v_name text := btrim(coalesce(p_member_name, ''));
  v_key text := nullif(btrim(coalesce(p_member_key, '')), '');
  v_title text := case when p_kind = '유아세례' then '유아세례 증명서' else coalesce(p_kind, '') || '교인 증명서' end;
begin
  if not public.edu_is_pastor() then
    return json_build_object('ok', false, 'why', 'pastor', 'error', '증명서는 목회자만 발급할 수 있습니다.');
  end if;
  if p_kind is null or p_kind not in ('학습', '세례', '입교', '유아세례') then return json_build_object('ok', false, 'why', 'kind', 'error', '증명서 종류를 골라 주십시오.'); end if;
  if v_name = '' or char_length(v_name) > 40 then return json_build_object('ok', false, 'why', 'name', 'error', '이름을 적어 주십시오.'); end if;
  if p_result is not null then
    -- 유아세례: 시험은 부모가 보았으므로 부모의 교적 키를 자녀 증명서에 끌어오지 않는다
    select r.user_id, case when p_kind = '유아세례' then v_key else coalesce(v_key, r.member_key) end into v_user, v_key
      from public.edu_exam_results r where r.id = p_result and r.passed;
    if not found then return json_build_object('ok', false, 'why', 'result', 'error', '통과한 시험 결과를 찾을 수 없습니다.'); end if;
  end if;
  v_abbr := case p_kind when '학습' then '학' when '세례' then '세' when '유아세례' then '유' else '입' end;
  perform pg_advisory_xact_lock(hashtext('edu_cert_no|' || p_kind || '|' || extract(year from v_on)::int));
  select coalesce(max(nullif(split_part(cert_no, '-', 3), '')::integer), 0) + 1 into v_seq
    from public.edu_certificates where cert_no like extract(year from v_on)::int || '-' || v_abbr || '-%' and split_part(cert_no, '-', 3) ~ '^[0-9]+$';
  v_no := extract(year from v_on)::int || '-' || v_abbr || '-' || lpad(v_seq::text, 3, '0');
  insert into public.edu_certificates (cert_no, kind, result_id, user_id, member_key, member_name, birth, qa_date, rite_date, officiant, church, issued_on, memo)
  values (v_no, p_kind, p_result, v_user, v_key, v_name, p_birth, p_qa_date, p_rite_date,
          nullif(left(btrim(coalesce(p_officiant, '')), 40), ''), nullif(left(btrim(coalesce(p_church, '')), 60), ''), v_on, nullif(left(btrim(coalesce(p_memo, '')), 500), ''))
  returning id into v_id;

  -- 자료실(성도별 자료 보관)에 증명서 항목 — 분류는 자료실의 '학습'·'세례증명서'·'입교' (유아세례도 '세례증명서')
  if to_regclass('public.member_files') is not null then
    execute 'insert into public.member_files (member_key, member_name, category, title, file_url, file_name, doc_date, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7, $8)'
      using v_key, v_name, case p_kind when '학습' then '학습' when '입교' then '입교' else '세례증명서' end,
            extract(year from v_on)::int || ' ' || v_title || ' (' || v_no || ')', 'edu-print.html?cert=' || v_id,
            v_title || ' ' || v_no, v_on, case when p_result is null then '증명서 발급' else '강의실' end;
  end if;
  return json_build_object('ok', true, 'id', v_id, 'cert_no', v_no);
end $$;
revoke all on function public.edu_cert_issue(text, bigint, text, text, date, date, date, text, text, date, text) from public, anon;
grant execute on function public.edu_cert_issue(text, bigint, text, text, date, date, date, text, text, date, text) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
