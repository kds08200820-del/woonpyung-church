-- 강의실: 유아세례 과정(부모 교육) 추가 — 과정 'infant' · 유아세례 증명서(2026-유-001) (2026-10-25 담임목사 "강의실에 유아세례가 없습니다. 추가해주세요")
--  앞선 20261025_1600_edu_classroom.sql(실행됨)을 이어받는다. 교재·문제은행은 js/catechism-data.js 의 courses.infant(화면).
--
--  · edu_course_progress.course / edu_exam_results.course : 'learn' | 'baptism' 에 'infant' 를 더한다(검사 조건을 넓힘)
--  · edu_certificates.kind : '학습' | '세례' | '입교' 에 '유아세례' 를 더한다 — 번호 2026-유-001, 자료실 분류 '세례증명서'
--  · edu_certificates.parents text : 유아세례 증명서의 부모 이름(비어 있어도 됨)
--  · edu_progress_save · edu_exam_submit · edu_cert_issue : 'infant' · '유아세례' 를 받도록 고쳐 쓴다(인자는 그대로)
--      유아세례 과정은 부모가 공부·시험을 보고, 증명서는 자녀 이름으로 낸다 → 유아세례 증명서는 시험 결과(부모)의 교적 키를
--      자녀 증명서에 끌어오지 않는다(관리자가 고른 자녀 교적 키만). 부모 계정은 user_id 로 증명서를 볼 수 있다.
--  · 비파괴: 검사 조건 2개를 같은 이름으로 넓혀 다시 걸고(지금 있는 값은 모두 그대로 통과), 칼럼 1개(nullable) 추가,
--    함수 3개 고쳐 쓰기. 자료를 지우거나 바꾸는 것 없음. 다시 실행해도 안전.
--
-- 되돌리기:
--   1) 함수: supabase/20261025_1600_edu_classroom.sql 의 4) 5) 7) 부분을 다시 실행하면 앞의 것으로 돌아간다
--   2) 칼럼: alter table public.edu_certificates rename column parents to parents_archived;
--   3) 검사 조건(유아세례 기록이 없을 때만 — 있으면 먼저 사람이 정리):
--      alter table public.edu_course_progress drop constraint edu_course_progress_course_check,
--        add constraint edu_course_progress_course_check check (course in ('learn', 'baptism'));
--      alter table public.edu_exam_results drop constraint edu_exam_results_course_check,
--        add constraint edu_exam_results_course_check check (course in ('learn', 'baptism'));
--      alter table public.edu_certificates drop constraint edu_certificates_kind_check,
--        add constraint edu_certificates_kind_check check (kind in ('학습', '세례', '입교'));

-- 1) 검사 조건 넓히기(같은 이름으로 다시 건다 — 이미 있는 값은 모두 새 조건을 만족)
alter table public.edu_course_progress drop constraint if exists edu_course_progress_course_check,
  add constraint edu_course_progress_course_check check (course in ('learn', 'baptism', 'infant'));
alter table public.edu_exam_results drop constraint if exists edu_exam_results_course_check,
  add constraint edu_exam_results_course_check check (course in ('learn', 'baptism', 'infant'));
alter table public.edu_certificates drop constraint if exists edu_certificates_kind_check,
  add constraint edu_certificates_kind_check check (kind in ('학습', '세례', '입교', '유아세례'));

-- 2) 유아세례 증명서의 부모 이름
alter table public.edu_certificates add column if not exists parents text;
grant update (parents) on public.edu_certificates to authenticated;   -- 관리자만(정책 "edu_certificates admin update" 가 막음)

-- 3) 나: 진도 저장 — 과정에 'infant'
create or replace function public.edu_progress_save(p_course text, p_done jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_done jsonb;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  if p_course not in ('learn', 'baptism', 'infant') then return json_build_object('ok', false, 'why', 'course'); end if;
  if p_done is null or jsonb_typeof(p_done) <> 'array' or jsonb_array_length(p_done) > 30 then
    return json_build_object('ok', false, 'why', 'done');
  end if;
  select coalesce(jsonb_agg(n order by n), '[]'::jsonb) into v_done
    from (select distinct (e #>> '{}')::int n from jsonb_array_elements(p_done) e
           where jsonb_typeof(e) = 'number' and (e #>> '{}') ~ '^[0-9]{1,2}$' and (e #>> '{}')::int between 0 and 30) s;
  insert into public.edu_course_progress (user_id, course, done, updated_at)
  values (auth.uid(), p_course, v_done, now())
  on conflict (user_id, course) do update set done = excluded.done, updated_at = now();
  return json_build_object('ok', true, 'done', v_done);
end $$;
revoke all on function public.edu_progress_save(text, jsonb) from public, anon;
grant execute on function public.edu_progress_save(text, jsonb) to authenticated;

-- 4) 나: 시험 제출·채점 — 과정에 'infant'(자료실 시험지 제목 '유아세례 과정 이수 시험지')
create or replace function public.edu_exam_submit(p_course text, p_sheet jsonb, p_name text default null, p_started timestamptz default null, p_ver text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_total constant integer := 20;
  v_correct integer := 0;
  v_ids text[] := '{}';
  e jsonb; v_id text; v_q text; v_o jsonb; v_no integer; v_a integer; v_p integer; i integer; k integer;
  v_key text; v_name text; v_score integer; v_pass boolean; v_rid bigint; v_label text;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 시험을 제출할 수 있습니다.'); end if;
  if p_course not in ('learn', 'baptism', 'infant') then return json_build_object('ok', false, 'why', 'course', 'error', '과정을 찾을 수 없습니다.'); end if;
  if exists (select 1 from public.edu_exam_results where user_id = v_uid and course = p_course and passed) then
    return json_build_object('ok', false, 'why', 'already', 'error', '이미 통과한 과정입니다.');
  end if;
  if (select count(*) from public.edu_exam_results where user_id = v_uid and course = p_course and created_at > now() - interval '1 day') >= 10 then
    return json_build_object('ok', false, 'why', 'limit', 'error', '오늘은 시험을 더 볼 수 없습니다. 내일 다시 도전해 주십시오.');
  end if;
  if p_sheet is null or jsonb_typeof(p_sheet) <> 'array' or jsonb_array_length(p_sheet) <> v_total then
    return json_build_object('ok', false, 'why', 'sheet', 'error', '답안지가 올바르지 않습니다.');
  end if;
  for i in 0 .. v_total - 1 loop
    e := p_sheet -> i;
    if jsonb_typeof(e) <> 'object' then return json_build_object('ok', false, 'why', 'sheet', 'index', i, 'error', '답안지가 올바르지 않습니다.'); end if;
    v_id := btrim(coalesce(e ->> 'id', ''));
    v_q := btrim(coalesce(e ->> 'q', ''));
    v_o := e -> 'o';
    if v_id = '' or char_length(v_id) > 20 or v_id = any (v_ids) or v_q = '' or char_length(v_q) > 500
       or v_o is null or jsonb_typeof(v_o) <> 'array' or jsonb_array_length(v_o) not between 2 and 4 then
      return json_build_object('ok', false, 'why', 'sheet', 'index', i, 'error', '답안지가 올바르지 않습니다.');
    end if;
    v_ids := v_ids || v_id;
    v_no := jsonb_array_length(v_o);
    for k in 0 .. v_no - 1 loop
      if jsonb_typeof(v_o -> k) <> 'string' or char_length(v_o ->> k) > 300 then
        return json_build_object('ok', false, 'why', 'sheet', 'index', i, 'error', '답안지가 올바르지 않습니다.');
      end if;
    end loop;
    if jsonb_typeof(e -> 'a') <> 'number' or (e ->> 'a') !~ '^[0-9]$' then return json_build_object('ok', false, 'why', 'sheet', 'index', i, 'error', '답안지가 올바르지 않습니다.'); end if;
    v_a := (e ->> 'a')::integer;
    if v_a >= v_no then return json_build_object('ok', false, 'why', 'sheet', 'index', i, 'error', '답안지가 올바르지 않습니다.'); end if;
    v_p := null;
    if e ? 'p' and jsonb_typeof(e -> 'p') = 'number' and (e ->> 'p') ~ '^[0-9]$' and (e ->> 'p')::integer < v_no then v_p := (e ->> 'p')::integer; end if;
    if v_p is not null and v_p = v_a then v_correct := v_correct + 1; end if;
  end loop;

  v_score := v_correct * 100 / v_total;
  v_pass := v_score >= 70;
  select l.member_key, l.member_name into v_key, v_name from public.member_links l where l.user_id = v_uid;
  v_name := coalesce(nullif(btrim(v_name), ''), (select nullif(btrim(p.name), '') from public.profiles p where p.id = v_uid), nullif(left(btrim(coalesce(p_name, '')), 40), ''), '(이름 없음)');
  insert into public.edu_exam_results (user_id, course, member_key, member_name, score, correct, total, passed, sheet, bank_ver, started_at)
  values (v_uid, p_course, nullif(btrim(coalesce(v_key, '')), ''), v_name, v_score, v_correct, v_total, v_pass, p_sheet, left(coalesce(p_ver, ''), 20),
          case when p_started is not null and p_started between now() - interval '2 days' and now() then p_started end)
  returning id into v_rid;

  -- 통과: 자료실(성도별 자료 보관)에 시험지 항목 — 표가 있는 곳에서만
  if v_pass and to_regclass('public.member_files') is not null then
    v_label := case p_course when 'learn' then '학습' when 'infant' then '유아세례' else '세례(입교)' end;
    execute 'insert into public.member_files (member_key, member_name, category, title, file_url, file_name, doc_date, uploaded_by) values ($1, $2, $3, $4, $5, $6, current_date, $7)'
      using nullif(btrim(coalesce(v_key, '')), ''), v_name, '출석/이수', v_label || ' 과정 이수 시험지 (' || v_score || '점)',
            'edu-print.html?sheet=' || v_rid, v_label || ' 이수 시험지', '강의실';
  end if;
  return json_build_object('ok', true, 'id', v_rid, 'score', v_score, 'correct', v_correct, 'total', v_total, 'passed', v_pass, 'linked', v_key is not null);
end $$;
revoke all on function public.edu_exam_submit(text, jsonb, text, timestamptz, text) from public, anon;
grant execute on function public.edu_exam_submit(text, jsonb, text, timestamptz, text) to authenticated;

-- 5) 관리자: 증명서 발급 — '유아세례'(2026-유-001). 인자는 그대로(부모 이름은 발급 뒤 parents 칼럼에 적는다)
create or replace function public.edu_cert_issue(p_kind text, p_result bigint, p_member_key text, p_member_name text, p_birth date,
                                                 p_qa_date date, p_rite_date date, p_officiant text, p_church text, p_issued_on date, p_memo text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_on date := coalesce(p_issued_on, current_date);
  v_abbr text; v_seq integer; v_no text; v_id bigint; v_user uuid; v_name text := btrim(coalesce(p_member_name, ''));
  v_key text := nullif(btrim(coalesce(p_member_key, '')), '');
  v_title text := case when p_kind = '유아세례' then '유아세례 증명서' else coalesce(p_kind, '') || '교인 증명서' end;
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then
    return json_build_object('ok', false, 'why', 'admin', 'error', '관리자만 발급할 수 있습니다.');
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
            v_title || ' ' || v_no, v_on, '강의실';
  end if;
  return json_build_object('ok', true, 'id', v_id, 'cert_no', v_no);
end $$;
revoke all on function public.edu_cert_issue(text, bigint, text, text, date, date, date, text, text, date, text) from public, anon;
grant execute on function public.edu_cert_issue(text, bigint, text, text, date, date, date, text, text, date, text) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
