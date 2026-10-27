-- 강의실: 학습·세례(입교) 교육과정 — 진도·시험 결과·증명서 (2026-10-25 담임목사 지시)
--  · 화면: classroom.html(강의실) · edu-print.html(시험지·증명서 인쇄) · affairs.js(목회행정 대시보드) · gyojeok.js(교적 상세)
--  · 교재·문제은행은 js/catechism-data.js(화면). 서버는 진도·답안지·점수·증명서만 둔다.
--
--  표
--   edu_course_progress  : 수강 진도(마친 장 번호) — 본인·관리자만 읽음, 쓰기는 edu_progress_save() 로만
--   edu_exam_results     : 시험 답안지(20문항)·점수·통과 여부 — 교적 매칭키(member_links)를 함께 남겨 교적과 잇는다
--                          본인·관리자만 읽음, 넣기는 edu_exam_submit() 로만, 관리자는 교적 연결(member_key·이름)만 고친다
--   edu_certificates     : 학습·세례·입교 교인 증명서 발급 대장(번호 2026-학-001 꼴) — 관리자 발급(edu_cert_issue), 본인은 읽기만
--  함수
--   edu_progress_save(과정, 마친 장 jsonb)                 : 나 — 진도 저장
--   edu_exam_submit(과정, 답안지 jsonb, 이름, 시작 시각, 판) : 나 — 시험 제출·채점(문항당 5점, 70점 이상 통과)
--                                                         통과하면 자료실(member_files)에 '출석/이수' 시험지 항목을 넣는다(표가 있을 때만)
--   edu_admin_progress()                                  : 관리자 — 수강 중인 사람과 진도
--   edu_cert_issue(…)                                     : 관리자 — 증명서 번호를 매겨 발급하고 자료실(member_files)에 증명서 항목을 넣는다
--  · 비파괴: 표 3개 + 함수 4개 추가만. 지우거나 바꾸는 것 없음. 다시 실행해도 안전(if not exists / create or replace / drop policy if exists → create).
--  · 이 SQL 을 실행하기 전에도 강의실 공부·시험은 되고, 결과 저장만 '준비 중' 으로 안내된다(화면이 표 없음을 알아챈다).
--
-- 되돌리기 (DROP 대신 RENAME — 삭제 정책대로, 실제 삭제는 4주 뒤 백업 확인 후 사람이):
--   drop function if exists public.edu_cert_issue(text, bigint, text, text, date, date, date, text, text, date, text);
--   drop function if exists public.edu_admin_progress();
--   drop function if exists public.edu_exam_submit(text, jsonb, text, timestamptz, text);
--   drop function if exists public.edu_progress_save(text, jsonb);
--   alter table public.edu_certificates rename to edu_certificates_archived;
--   alter table public.edu_exam_results rename to edu_exam_results_archived;
--   alter table public.edu_course_progress rename to edu_course_progress_archived;
--   (자료실 member_files 에 들어간 '강의실' 항목은 uploaded_by = '강의실' 로 찾을 수 있다 — 지우는 것은 사람이)

-- 1) 진도
create table if not exists public.edu_course_progress (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  course     text        not null check (course in ('learn', 'baptism')),
  done       jsonb       not null default '[]'::jsonb,     -- 마친 장 번호 [1,2,…] (서약 문답은 0)
  updated_at timestamptz not null default now(),
  primary key (user_id, course)
);
alter table public.edu_course_progress enable row level security;
drop policy if exists "edu_course_progress read" on public.edu_course_progress;
create policy "edu_course_progress read" on public.edu_course_progress for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.admins a where a.uid = auth.uid()));
revoke all on public.edu_course_progress from anon;
revoke insert, update, delete, truncate on public.edu_course_progress from authenticated;
grant select on public.edu_course_progress to authenticated;

-- 2) 시험 결과(답안지)
create table if not exists public.edu_exam_results (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users (id) on delete set null,   -- 탈퇴해도 이수 기록은 교적에 남긴다
  course      text        not null check (course in ('learn', 'baptism')),
  member_key  text,                                                -- 교적 매칭키(이름|YYYYMMDD) — member_links 에서
  member_name text        not null,
  score       integer     not null check (score between 0 and 100),
  correct     integer     not null,
  total       integer     not null,
  passed      boolean     not null,
  sheet       jsonb       not null,                                -- [{id, ch, q, o:[보기…], a:정답 번호, p:고른 번호|null}]
  bank_ver    text,
  started_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists edu_exam_results_user_idx on public.edu_exam_results (user_id, course);
create index if not exists edu_exam_results_key_idx  on public.edu_exam_results (member_key);
create index if not exists edu_exam_results_pass_idx on public.edu_exam_results (passed, created_at desc);
alter table public.edu_exam_results enable row level security;
drop policy if exists "edu_exam_results read" on public.edu_exam_results;
create policy "edu_exam_results read" on public.edu_exam_results for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "edu_exam_results admin link" on public.edu_exam_results;
create policy "edu_exam_results admin link" on public.edu_exam_results for update to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
revoke all on public.edu_exam_results from anon;
revoke insert, update, delete, truncate on public.edu_exam_results from authenticated;
grant select on public.edu_exam_results to authenticated;
grant update (member_key, member_name) on public.edu_exam_results to authenticated;   -- 관리자: 교적 연결만 고친다(정책이 관리자로 막음)

-- 3) 증명서 발급 대장
create table if not exists public.edu_certificates (
  id          bigint generated always as identity primary key,
  cert_no     text        not null unique,                          -- 예: 2026-학-001
  kind        text        not null check (kind in ('학습', '세례', '입교')),
  result_id   bigint references public.edu_exam_results (id) on delete set null,
  user_id     uuid references auth.users (id) on delete set null,
  member_key  text,
  member_name text        not null,
  birth       date,
  qa_date     date,                                                 -- 문답받은 날
  rite_date   date,                                                 -- 학습·세례·입교 받은 날(예식일)
  officiant   text,                                                 -- 집례 목사
  church      text,                                                 -- 받은 곳(교회)
  issued_on   date        not null default current_date,
  memo        text,
  voided_at   timestamptz,                                          -- 잘못 발급한 것은 지우지 않고 '취소' 표시
  issued_by   uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists edu_certificates_key_idx on public.edu_certificates (member_key);
alter table public.edu_certificates enable row level security;
drop policy if exists "edu_certificates read" on public.edu_certificates;
create policy "edu_certificates read" on public.edu_certificates for select to authenticated
  using (
    exists (select 1 from public.admins a where a.uid = auth.uid())
    or user_id = auth.uid()
    or (member_key is not null and member_key = (select l.member_key from public.member_links l where l.user_id = auth.uid()))
  );
drop policy if exists "edu_certificates admin update" on public.edu_certificates;
create policy "edu_certificates admin update" on public.edu_certificates for update to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
revoke all on public.edu_certificates from anon;
revoke insert, update, delete, truncate on public.edu_certificates from authenticated;
grant select on public.edu_certificates to authenticated;
grant update (member_key, member_name, birth, qa_date, rite_date, officiant, church, issued_on, memo, voided_at) on public.edu_certificates to authenticated;

-- 4) 나: 진도 저장 — 장 번호(0~30)만, 30개까지
create or replace function public.edu_progress_save(p_course text, p_done jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_done jsonb;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  if p_course not in ('learn', 'baptism') then return json_build_object('ok', false, 'why', 'course'); end if;
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

-- 5) 나: 시험 제출·채점
--    답안지 20문항의 형식을 확인하고 서버가 다시 센다(문항당 5점). 이미 통과한 과정은 다시 내지 않는다. 하루 10번까지.
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
  if p_course not in ('learn', 'baptism') then return json_build_object('ok', false, 'why', 'course', 'error', '과정을 찾을 수 없습니다.'); end if;
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
    v_label := case p_course when 'learn' then '학습' else '세례(입교)' end;
    execute 'insert into public.member_files (member_key, member_name, category, title, file_url, file_name, doc_date, uploaded_by) values ($1, $2, $3, $4, $5, $6, current_date, $7)'
      using nullif(btrim(coalesce(v_key, '')), ''), v_name, '출석/이수', v_label || ' 과정 이수 시험지 (' || v_score || '점)',
            'edu-print.html?sheet=' || v_rid, v_label || ' 이수 시험지', '강의실';
  end if;
  return json_build_object('ok', true, 'id', v_rid, 'score', v_score, 'correct', v_correct, 'total', v_total, 'passed', v_pass, 'linked', v_key is not null);
end $$;
revoke all on function public.edu_exam_submit(text, jsonb, text, timestamptz, text) from public, anon;
grant execute on function public.edu_exam_submit(text, jsonb, text, timestamptz, text) to authenticated;

-- 6) 관리자: 수강 중인 사람과 진도(이름은 교적 이름 → 회원 이름)
create or replace function public.edu_admin_progress()
returns json language sql stable security definer set search_path = public as $$
  select case when not exists (select 1 from public.admins a where a.uid = auth.uid()) then '[]'::json
    else coalesce((
      select json_agg(json_build_object(
               'user_id', g.user_id, 'course', g.course, 'done', g.done, 'updated_at', g.updated_at,
               'name', coalesce(nullif(btrim(l.member_name), ''), nullif(btrim(p.name), ''), '(이름 없음)'),
               'member_key', l.member_key,
               'tries', (select count(*) from public.edu_exam_results r where r.user_id = g.user_id and r.course = g.course),
               'best', (select max(r.score) from public.edu_exam_results r where r.user_id = g.user_id and r.course = g.course),
               'passed', exists (select 1 from public.edu_exam_results r where r.user_id = g.user_id and r.course = g.course and r.passed))
             order by g.updated_at desc)
        from public.edu_course_progress g
        left join public.member_links l on l.user_id = g.user_id
        left join public.profiles p on p.id = g.user_id), '[]'::json) end
$$;
revoke all on function public.edu_admin_progress() from public, anon;
grant execute on function public.edu_admin_progress() to authenticated;

-- 7) 관리자: 증명서 발급 — 해마다 종류별 번호(2026-학-001 / 2026-세-001 / 2026-입-001)
create or replace function public.edu_cert_issue(p_kind text, p_result bigint, p_member_key text, p_member_name text, p_birth date,
                                                 p_qa_date date, p_rite_date date, p_officiant text, p_church text, p_issued_on date, p_memo text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_on date := coalesce(p_issued_on, current_date);
  v_abbr text; v_seq integer; v_no text; v_id bigint; v_user uuid; v_name text := btrim(coalesce(p_member_name, ''));
  v_key text := nullif(btrim(coalesce(p_member_key, '')), '');
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then
    return json_build_object('ok', false, 'why', 'admin', 'error', '관리자만 발급할 수 있습니다.');
  end if;
  if p_kind not in ('학습', '세례', '입교') then return json_build_object('ok', false, 'why', 'kind', 'error', '증명서 종류를 골라 주십시오.'); end if;
  if v_name = '' or char_length(v_name) > 40 then return json_build_object('ok', false, 'why', 'name', 'error', '이름을 적어 주십시오.'); end if;
  if p_result is not null then
    select r.user_id, coalesce(v_key, r.member_key) into v_user, v_key from public.edu_exam_results r where r.id = p_result and r.passed;
    if not found then return json_build_object('ok', false, 'why', 'result', 'error', '통과한 시험 결과를 찾을 수 없습니다.'); end if;
  end if;
  v_abbr := case p_kind when '학습' then '학' when '세례' then '세' else '입' end;
  perform pg_advisory_xact_lock(hashtext('edu_cert_no|' || p_kind || '|' || extract(year from v_on)::int));
  select coalesce(max(nullif(split_part(cert_no, '-', 3), '')::integer), 0) + 1 into v_seq
    from public.edu_certificates where cert_no like extract(year from v_on)::int || '-' || v_abbr || '-%' and split_part(cert_no, '-', 3) ~ '^[0-9]+$';
  v_no := extract(year from v_on)::int || '-' || v_abbr || '-' || lpad(v_seq::text, 3, '0');
  insert into public.edu_certificates (cert_no, kind, result_id, user_id, member_key, member_name, birth, qa_date, rite_date, officiant, church, issued_on, memo)
  values (v_no, p_kind, p_result, v_user, v_key, v_name, p_birth, p_qa_date, p_rite_date,
          nullif(left(btrim(coalesce(p_officiant, '')), 40), ''), nullif(left(btrim(coalesce(p_church, '')), 60), ''), v_on, nullif(left(btrim(coalesce(p_memo, '')), 500), ''))
  returning id into v_id;

  -- 자료실(성도별 자료 보관)에 증명서 항목 — 분류는 자료실의 '학습'·'세례증명서'·'입교'
  if to_regclass('public.member_files') is not null then
    execute 'insert into public.member_files (member_key, member_name, category, title, file_url, file_name, doc_date, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7, $8)'
      using v_key, v_name, case p_kind when '학습' then '학습' when '세례' then '세례증명서' else '입교' end,
            extract(year from v_on)::int || ' ' || p_kind || '교인 증명서 (' || v_no || ')', 'edu-print.html?cert=' || v_id,
            p_kind || '교인 증명서 ' || v_no, v_on, '강의실';
  end if;
  return json_build_object('ok', true, 'id', v_id, 'cert_no', v_no);
end $$;
revoke all on function public.edu_cert_issue(text, bigint, text, text, date, date, date, text, text, date, text) from public, anon;
grant execute on function public.edu_cert_issue(text, bigint, text, text, date, date, date, text, text, date, text) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
