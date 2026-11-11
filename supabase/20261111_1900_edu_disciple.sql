-- 강의실: 제자훈련 양육반 — 기수·반·인도자 / 모임별 진도와 출석 / 강별 과제 / 수료 (2026-11-11 담임목사 지시)
--  · 화면: classroom.html(js/disciple.js — 권한에 따라 인도자용·수강생용) · affairs.html 교육관리(js/affairs.js + js/edu-class.js) · gyojeok.js(교적 상세)
--  · 강의 내용(13강 요약·대목·구절·나눔 질문·과제)은 화면용 파일 js/disciple-data.js. 서버는 반·진도·출석·과제·수료만 둔다.
--
--  구조: 기수 → 반 → 수강생
--   · 반 하나 = edu_records 한 줄(교육명 title · 기수 cohort · 반 class_name). 교육명과 기수가 같은 줄들이 한 기수(지금은 1기: 목요반·토요반·주일반).
--   · 수강생 = 그 줄의 participants([{name,key}] 글자 JSON, key = 교적 '이름|YYYYMMDD') — 지금 쓰는 그대로.
--   · 인도자 = 그 줄의 leaders(같은 꼴). 지금은 담임목사(관리자는 지정하지 않아도 모든 반의 인도자), 나중에 다른 사람을 교육관리에서 지정.
--   · 진도 = 강을 '대목'으로 나눠(js/disciple-data.js 의 parts), 모임마다 그날 나간 대목을 '강-대목'(예: '3-4')으로 남긴다.
--     한 과가 한 주에 끝나지 않아도 되고, 반마다 따로 남으며, 다음 모임은 못 다 나간 대목부터 이어진다.
--   · 사람 열쇠(pid) = 교적 열쇠. 교적에 잇지 않고 이름만 적은 수강생은 '~이름'.
--
--  칸 추가(모두 nullable 또는 default — 있는 자료는 그대로)
--   edu_records  + course_code text      : 과정 틀. 'disciple' = 제자훈련 양육반 13강. 비어 있으면 지금까지의 일반 교육
--                + meet_info text        : 모임 요일·시간·장소(예: '목요일 오전 10시 · 교육관')
--                + leaders text '[]'     : 인도자 [{name,key}]
--   edu_materials + lesson_no integer    : 어느 강의 자료인지(비어 있으면 과정 전체)
--  표(새로)
--   edu_meetings       : 반의 모임 한 번 — 날짜 · 그날 나간 대목(parts) · 메모. 잘못 적은 모임은 지우지 않고 취소 표시(voided_at)
--   edu_meeting_attend : 모임 출석 — 수강생마다 출석/지각/결석
--   edu_lesson_checks  : 강별 과제 확인(인도자가 표시) — 예습 · 삶의 과제 · 암송
--   edu_lesson_work    : 수강생이 낸 글(본인이 적음) — 예습 표시 · 암송 표시 · 가족과 나눈 느낀 점 · 과제 실천
--   edu_completions    : 수료 대장 — 기수·반·수료일·수료증 번호(2026-양-001). 학습·세례 증명서 대장(edu_certificates)과 섞지 않는다
--  함수
--   edu_people(글자 JSON)                 : [{name,key}] 를 안전하게 풀기(깨졌으면 빈 결과)
--   edu_pid(name, key)                    : 사람 열쇠
--   edu_is_leader(반) · edu_my_role(반)   : 관리자/인도자/수강생 가리기
--   edu_my_classes(과정)                  : 내가 인도자·수강생인 반(관리자는 그 과정의 모든 반) + 지금 진도
--   edu_class_state(반)                   : 반의 모임·진도 + (수강생) 내 출석·과제·낸 글 / (인도자) 명단·출석·과제·낸 글·수료
--   edu_meeting_save(반, 날짜, 대목, 메모, 출석) : 인도자 — 모임의 진도·출석 저장(같은 날짜는 고쳐 씀)
--   edu_meeting_void(반, 날짜, 취소 여부) : 인도자 — 모임 기록 취소/되살리기
--   edu_check_save(…)                     : 인도자 — 강별 과제 확인
--   edu_work_save(…)                      : 수강생 — 예습·암송 표시와 낸 글
--   edu_complete_issue(…)                 : 인도자 — 이수 처리(수료증 번호 · 성도별 자료실 member_files 에 '출석/이수' 항목)
--   edu_complete_void(번호, 취소 여부)    : 관리자 — 잘못 처리한 수료 취소 표시
--   can_access_edu(반)                    : (고침) 강의 자료실을 인도자도 볼 수 있게 — 수강생·관리자 판별은 그대로
--  · 비파괴: 칸 4개·표 5개·함수·정책 추가만. 지우거나 이름을 바꾸는 것 없음. 다시 실행해도 안전
--    (add column if not exists / create table if not exists / create or replace / drop policy if exists → create).
--  · 화면에서 쓰는 삭제는 없다 — 모임은 취소 표시, 출석은 빈 값으로 고쳐 쓴다. 기록이 달린 반(edu_records)은 삭제가 막힌다(on delete restrict).
--
-- 되돌리기 (DROP 대신 RENAME — 삭제 정책대로, 실제 삭제는 4주 뒤 백업 확인 후 사람이):
--   drop function if exists public.edu_complete_void(bigint, boolean);
--   drop function if exists public.edu_complete_issue(uuid, text, text, date, text);
--   drop function if exists public.edu_work_save(uuid, integer, boolean, boolean, text, text);
--   drop function if exists public.edu_check_save(uuid, integer, text, text, boolean, boolean, boolean, text);
--   drop function if exists public.edu_meeting_void(uuid, date, boolean);
--   drop function if exists public.edu_meeting_save(uuid, date, jsonb, text, jsonb);
--   drop function if exists public.edu_class_state(uuid);
--   drop function if exists public.edu_my_classes(text);
--   drop policy if exists "edu_records_read_leader" on public.edu_records;
--   alter table public.edu_completions    rename to edu_completions_archived;
--   alter table public.edu_lesson_work    rename to edu_lesson_work_archived;
--   alter table public.edu_lesson_checks  rename to edu_lesson_checks_archived;
--   alter table public.edu_meeting_attend rename to edu_meeting_attend_archived;
--   alter table public.edu_meetings       rename to edu_meetings_archived;
--   alter table public.edu_records   rename column course_code to course_code_archived;
--   alter table public.edu_records   rename column meet_info   to meet_info_archived;
--   alter table public.edu_records   rename column leaders     to leaders_archived;
--   alter table public.edu_materials rename column lesson_no   to lesson_no_archived;
--   (can_access_edu 는 supabase/20261022_0940_edu_extra.sql 의 5) 를 다시 실행하면 예전 내용으로 돌아간다.
--    edu_people · edu_pid · edu_is_leader · edu_my_role 은 남겨 두어도 무해. 자료실 member_files 에 들어간 수료증 항목은 uploaded_by = '강의실', category = '출석/이수' 로 찾는다 — 지우는 것은 사람이)

-- ─────────────────────────────────────────────────────────────
-- 1) 칸 추가
-- ─────────────────────────────────────────────────────────────
alter table public.edu_records   add column if not exists course_code text;
alter table public.edu_records   add column if not exists meet_info   text;
alter table public.edu_records   add column if not exists leaders     text default '[]';
alter table public.edu_materials add column if not exists lesson_no   integer;
create index if not exists edu_records_course_idx on public.edu_records (course_code, cohort);

-- ─────────────────────────────────────────────────────────────
-- 2) 사람 목록 풀기 · 사람 열쇠 · 권한
-- ─────────────────────────────────────────────────────────────
-- [{name,key}] 글자 JSON 을 안전하게 풀기. 비었거나 깨졌으면 아무것도 돌려주지 않는다(edu_participant_keys 와 같은 방식 + 이름).
create or replace function public.edu_people(p text)
returns table (name text, key text) language plpgsql immutable as $$
declare j jsonb;
begin
  begin
    j := nullif(btrim(coalesce(p, '')), '')::jsonb;
    if jsonb_typeof(j) = 'string' then j := (j #>> '{}')::jsonb; end if;
  exception when others then
    return;
  end;
  if j is null or jsonb_typeof(j) <> 'array' then return; end if;
  return query
    select btrim(coalesce(e->>'name', '')), btrim(coalesce(e->>'key', ''))
      from jsonb_array_elements(j) e
     where jsonb_typeof(e) = 'object' and btrim(coalesce(e->>'name', '')) <> '';
end $$;

-- 사람 열쇠: 교적 열쇠가 있으면 그것, 없으면 '~이름'
create or replace function public.edu_pid(p_name text, p_key text)
returns text language sql immutable as $$
  select case when btrim(coalesce(p_key, '')) <> '' then btrim(p_key) else '~' || btrim(coalesce(p_name, '')) end
$$;

-- 인도자인가: 관리자이거나, 그 반의 leaders 에 내 교적 열쇠가 있다
create or replace function public.edu_is_leader(p_edu uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.admins a where a.uid = auth.uid())
    or exists (
      select 1 from public.edu_records er
        join public.member_links ml on ml.user_id = auth.uid()
       where er.id = p_edu and coalesce(ml.member_key, '') <> ''
         and ml.member_key in (select p.key from public.edu_people(er.leaders) p where p.key <> '')
    ))
$$;

-- 이 반에서 나는: 'admin' | 'leader' | 'student' | null
create or replace function public.edu_my_role(p_edu uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null
    when exists (select 1 from public.admins a where a.uid = auth.uid()) then 'admin'
    when exists (select 1 from public.edu_records er join public.member_links ml on ml.user_id = auth.uid()
                  where er.id = p_edu and coalesce(ml.member_key, '') <> ''
                    and ml.member_key in (select p.key from public.edu_people(er.leaders) p where p.key <> '')) then 'leader'
    when exists (select 1 from public.edu_records er join public.member_links ml on ml.user_id = auth.uid()
                  where er.id = p_edu and coalesce(ml.member_key, '') <> ''
                    and ml.member_key in (select p.key from public.edu_people(er.participants) p where p.key <> '')) then 'student'
    else null end
$$;
revoke all on function public.edu_is_leader(uuid) from public, anon;
revoke all on function public.edu_my_role(uuid) from public, anon;
grant execute on function public.edu_is_leader(uuid) to authenticated;
grant execute on function public.edu_my_role(uuid) to authenticated;

-- 인도자는 자기가 맡은 반의 줄을 읽는다(수강생 읽기 정책 "edu_records_read_participant" 옆에 추가)
drop policy if exists "edu_records_read_leader" on public.edu_records;
create policy "edu_records_read_leader" on public.edu_records
  for select to authenticated
  using (
    exists (
      select 1 from public.member_links ml
       where ml.user_id = auth.uid() and coalesce(ml.member_key, '') <> ''
         and ml.member_key in (select p.key from public.edu_people(edu_records.leaders) p where p.key <> '')
    )
  );

-- 강의 자료실: 인도자도 읽는다(관리자·수강생 판별은 20261022_0940_edu_extra.sql 그대로)
create or replace function public.can_access_edu(p_edu_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.admins a where a.uid = auth.uid())
    or exists (
      select 1
        from public.edu_records er
        join public.member_links ml on ml.user_id = auth.uid()
       where er.id = p_edu_id
         and ml.member_key is not null
         and (ml.member_key in (select public.edu_participant_keys(er.participants::text))
              or ml.member_key in (select p.key from public.edu_people(er.leaders) p where p.key <> ''))
    );
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) 표
-- ─────────────────────────────────────────────────────────────
-- 모임 한 번(반·날짜마다 한 줄)
create table if not exists public.edu_meetings (
  id         bigint generated always as identity primary key,
  edu_id     uuid        not null references public.edu_records (id) on delete restrict,
  meet_date  date        not null,
  parts      jsonb       not null default '[]'::jsonb,     -- 그날 나간 대목 ['3-4','3-5'] ('강-대목')
  memo       text,
  voided_at  timestamptz,                                  -- 잘못 적은 모임은 지우지 않고 취소 표시
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edu_id, meet_date)
);

-- 모임 출석(모임·사람마다 한 줄)
create table if not exists public.edu_meeting_attend (
  meeting_id  bigint      not null references public.edu_meetings (id) on delete restrict,
  edu_id      uuid        not null references public.edu_records (id) on delete restrict,
  member_key  text        not null,                        -- 사람 열쇠(교적 '이름|YYYYMMDD' 또는 '~이름')
  member_name text        not null default '',
  status      text        not null default '' check (status in ('', '출석', '지각', '결석')),
  updated_at  timestamptz not null default now(),
  primary key (meeting_id, member_key)
);
create index if not exists edu_meeting_attend_edu_idx on public.edu_meeting_attend (edu_id, member_key);
create index if not exists edu_meeting_attend_key_idx on public.edu_meeting_attend (member_key);

-- 강별 과제 확인(인도자가 표시)
create table if not exists public.edu_lesson_checks (
  edu_id      uuid        not null references public.edu_records (id) on delete restrict,
  lesson_no   integer     not null check (lesson_no between 1 and 30),
  member_key  text        not null,
  member_name text        not null default '',
  prep        boolean     not null default false,          -- 예습(성경 구절 적어 오기)
  task        boolean     not null default false,          -- 삶의 과제
  recite      boolean     not null default false,          -- 암송
  memo        text,
  checked_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (edu_id, lesson_no, member_key)
);

-- 수강생이 낸 글(본인이 적음)
create table if not exists public.edu_lesson_work (
  edu_id      uuid        not null references public.edu_records (id) on delete restrict,
  lesson_no   integer     not null check (lesson_no between 1 and 30),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  member_key  text        not null,
  prep_done   boolean     not null default false,          -- '예습했습니다'
  recite_done boolean     not null default false,          -- '외웠습니다'
  share_note  text,                                        -- 가족과 나눈 느낀 점
  task_note   text,                                        -- 삶의 과제 실천
  updated_at  timestamptz not null default now(),
  primary key (edu_id, lesson_no, user_id)
);
create index if not exists edu_lesson_work_key_idx on public.edu_lesson_work (edu_id, member_key);

-- 수료 대장
create table if not exists public.edu_completions (
  id           bigint generated always as identity primary key,
  cert_no      text        not null unique,                -- 예: 2026-양-001
  edu_id       uuid        not null references public.edu_records (id) on delete restrict,
  course_code  text,
  title        text        not null,                       -- 교육명(처리할 때의 이름을 그대로 남긴다)
  cohort       text,                                       -- 기수
  class_name   text,                                       -- 반
  member_key   text        not null,                       -- 사람 열쇠
  member_name  text        not null,
  user_id      uuid references auth.users (id) on delete set null,
  completed_on date        not null default current_date,
  memo         text,
  voided_at    timestamptz,                                -- 잘못 처리한 것은 지우지 않고 '취소' 표시
  issued_by    uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists edu_completions_key_idx on public.edu_completions (member_key);
create unique index if not exists edu_completions_one_idx on public.edu_completions (edu_id, member_key) where voided_at is null;

-- 읽기 정책: 쓰기는 아래 함수로만(표에 직접 쓰기는 막는다)
alter table public.edu_meetings       enable row level security;
alter table public.edu_meeting_attend enable row level security;
alter table public.edu_lesson_checks  enable row level security;
alter table public.edu_lesson_work    enable row level security;
alter table public.edu_completions    enable row level security;

drop policy if exists "edu_meetings read" on public.edu_meetings;
create policy "edu_meetings read" on public.edu_meetings for select to authenticated
  using (public.edu_my_role(edu_id) is not null);

drop policy if exists "edu_meeting_attend read" on public.edu_meeting_attend;
create policy "edu_meeting_attend read" on public.edu_meeting_attend for select to authenticated
  using (public.edu_is_leader(edu_id)
         or member_key = (select l.member_key from public.member_links l where l.user_id = auth.uid()));

drop policy if exists "edu_lesson_checks read" on public.edu_lesson_checks;
create policy "edu_lesson_checks read" on public.edu_lesson_checks for select to authenticated
  using (public.edu_is_leader(edu_id)
         or member_key = (select l.member_key from public.member_links l where l.user_id = auth.uid()));

drop policy if exists "edu_lesson_work read" on public.edu_lesson_work;
create policy "edu_lesson_work read" on public.edu_lesson_work for select to authenticated
  using (user_id = auth.uid() or public.edu_is_leader(edu_id));

drop policy if exists "edu_completions read" on public.edu_completions;
create policy "edu_completions read" on public.edu_completions for select to authenticated
  using (public.edu_is_leader(edu_id) or user_id = auth.uid()
         or member_key = (select l.member_key from public.member_links l where l.user_id = auth.uid()));

revoke all on public.edu_meetings, public.edu_meeting_attend, public.edu_lesson_checks, public.edu_lesson_work, public.edu_completions from anon;
revoke insert, update, delete, truncate on public.edu_meetings, public.edu_meeting_attend, public.edu_lesson_checks, public.edu_lesson_work, public.edu_completions from authenticated;
grant select on public.edu_meetings, public.edu_meeting_attend, public.edu_lesson_checks, public.edu_lesson_work, public.edu_completions to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4) 읽기: 내 반 목록 · 반의 상태
-- ─────────────────────────────────────────────────────────────
-- 내가 인도자·수강생인 반(관리자는 그 과정의 모든 반). 명단은 싣지 않는다(수만).
create or replace function public.edu_my_classes(p_course text default 'disciple')
returns json language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then '[]'::json else coalesce((
    select json_agg(json_build_object(
             'id', x.id, 'title', x.title, 'cohort', x.cohort, 'class_name', x.class_name,
             'teacher', x.teacher, 'meet_info', x.meet_info, 'edu_date', x.edu_date, 'end_date', x.end_date,
             'role', x.role,
             'students', (select count(*) from public.edu_people(x.participants)),
             'meetings', (select count(*) from public.edu_meetings m where m.edu_id = x.id and m.voided_at is null),
             'last_date', (select max(m.meet_date) from public.edu_meetings m where m.edu_id = x.id and m.voided_at is null),
             'done', coalesce((select jsonb_agg(distinct e.v) from public.edu_meetings m, jsonb_array_elements_text(m.parts) e(v)
                                where m.edu_id = x.id and m.voided_at is null), '[]'::jsonb))
           order by x.cohort nulls last, x.edu_date nulls last, x.class_name nulls last)
      from (select er.*, public.edu_my_role(er.id) as role
              from public.edu_records er
             where er.course_code = p_course) x
     where x.role is not null), '[]'::json) end
$$;
revoke all on function public.edu_my_classes(text) from public, anon;
grant execute on function public.edu_my_classes(text) to authenticated;

-- 반의 상태: 모임·진도 + (수강생) 내 기록 / (인도자·관리자) 명단과 모두의 기록
create or replace function public.edu_class_state(p_edu uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := public.edu_my_role(p_edu);
  v_uid uuid := auth.uid();
  v_key text;
  r public.edu_records%rowtype;
  v_base jsonb;
begin
  if v_role is null then return json_build_object('ok', false, 'why', 'forbidden'); end if;
  select * into r from public.edu_records where id = p_edu;
  if not found then return json_build_object('ok', false, 'why', 'notfound'); end if;
  select nullif(btrim(coalesce(l.member_key, '')), '') into v_key from public.member_links l where l.user_id = v_uid;

  v_base := jsonb_build_object(
    'ok', true, 'role', v_role,
    'class', jsonb_build_object('id', r.id, 'title', r.title, 'cohort', r.cohort, 'class_name', r.class_name, 'teacher', r.teacher,
                                'meet_info', r.meet_info, 'edu_date', r.edu_date, 'end_date', r.end_date, 'course_code', r.course_code),
    'meetings', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'meet_date', m.meet_date, 'parts', m.parts, 'memo', m.memo,
                                                             'voided', m.voided_at is not null) order by m.meet_date)
                            from public.edu_meetings m
                           where m.edu_id = p_edu and (m.voided_at is null or v_role in ('admin', 'leader'))), '[]'::jsonb),
    'done', coalesce((select jsonb_agg(distinct e.v) from public.edu_meetings m, jsonb_array_elements_text(m.parts) e(v)
                       where m.edu_id = p_edu and m.voided_at is null), '[]'::jsonb));

  if v_role = 'student' then
    return (v_base || jsonb_build_object(
      'me', jsonb_build_object('key', v_key,
                               'name', (select p.name from public.edu_people(r.participants) p where p.key = v_key limit 1)),
      'my_attend', coalesce((select jsonb_agg(jsonb_build_object('meet_date', m.meet_date, 'status', a.status) order by m.meet_date)
                               from public.edu_meeting_attend a join public.edu_meetings m on m.id = a.meeting_id
                              where a.edu_id = p_edu and a.member_key = v_key and m.voided_at is null and a.status <> ''), '[]'::jsonb),
      'my_checks', coalesce((select jsonb_agg(jsonb_build_object('lesson_no', c.lesson_no, 'prep', c.prep, 'task', c.task, 'recite', c.recite) order by c.lesson_no)
                               from public.edu_lesson_checks c where c.edu_id = p_edu and c.member_key = v_key), '[]'::jsonb),
      'my_work', coalesce((select jsonb_agg(jsonb_build_object('lesson_no', w.lesson_no, 'prep_done', w.prep_done, 'recite_done', w.recite_done,
                                                              'share_note', w.share_note, 'task_note', w.task_note, 'updated_at', w.updated_at) order by w.lesson_no)
                             from public.edu_lesson_work w where w.edu_id = p_edu and w.user_id = v_uid), '[]'::jsonb),
      'completion', (select jsonb_build_object('id', c.id, 'cert_no', c.cert_no, 'completed_on', c.completed_on)
                       from public.edu_completions c where c.edu_id = p_edu and c.member_key = v_key and c.voided_at is null limit 1)
    ))::json;
  end if;

  -- 인도자·관리자
  return (v_base || jsonb_build_object(
    'roster', coalesce((select jsonb_agg(jsonb_build_object(
                                 'pid', public.edu_pid(p.name, p.key), 'name', p.name, 'linked', p.key <> '',
                                 'has_account', p.key <> '' and exists (select 1 from public.member_links l where l.member_key = p.key)))
                          from public.edu_people(r.participants) p), '[]'::jsonb),
    'leaders', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'linked', p.key <> '')) from public.edu_people(r.leaders) p), '[]'::jsonb),
    'attend', coalesce((select jsonb_agg(jsonb_build_object('meeting_id', a.meeting_id, 'pid', a.member_key, 'status', a.status))
                          from public.edu_meeting_attend a where a.edu_id = p_edu and a.status <> ''), '[]'::jsonb),
    'checks', coalesce((select jsonb_agg(jsonb_build_object('lesson_no', c.lesson_no, 'pid', c.member_key, 'prep', c.prep, 'task', c.task,
                                                           'recite', c.recite, 'memo', c.memo))
                          from public.edu_lesson_checks c where c.edu_id = p_edu), '[]'::jsonb),
    'work', coalesce((select jsonb_agg(jsonb_build_object('lesson_no', w.lesson_no, 'pid', w.member_key, 'prep_done', w.prep_done,
                                                         'recite_done', w.recite_done, 'share_note', w.share_note, 'task_note', w.task_note,
                                                         'updated_at', w.updated_at) order by w.lesson_no)
                        from public.edu_lesson_work w where w.edu_id = p_edu), '[]'::jsonb),
    'completions', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'pid', c.member_key, 'name', c.member_name, 'cert_no', c.cert_no,
                                                                'completed_on', c.completed_on, 'voided', c.voided_at is not null) order by c.id)
                               from public.edu_completions c where c.edu_id = p_edu), '[]'::jsonb)
  ))::json;
end $$;
revoke all on function public.edu_class_state(uuid) from public, anon;
grant execute on function public.edu_class_state(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5) 인도자: 모임의 진도·출석 저장
-- ─────────────────────────────────────────────────────────────
--   p_parts  : ['3-4','3-5'] — '강-대목'. 형식이 맞는 것만, 60개까지
--   p_attend : [{pid, status}] — 이 반 명단에 있는 사람만 받는다. status '' 는 '표시 지움'
--   같은 날짜를 다시 저장하면 그 모임을 고쳐 쓴다(취소돼 있었으면 되살린다)
create or replace function public.edu_meeting_save(p_edu uuid, p_date date, p_parts jsonb, p_memo text default null, p_attend jsonb default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_parts jsonb; v_mid bigint; r public.edu_records%rowtype; e jsonb; v_pid text; v_status text; v_name text; v_n integer := 0;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 저장할 수 있습니다.'); end if;
  if not public.edu_is_leader(p_edu) then return json_build_object('ok', false, 'why', 'leader', 'error', '이 반의 인도자만 저장할 수 있습니다.'); end if;
  select * into r from public.edu_records where id = p_edu;
  if not found then return json_build_object('ok', false, 'why', 'notfound', 'error', '반을 찾을 수 없습니다.'); end if;
  if p_date is null or p_date > current_date + 1 or p_date < current_date - 730 then
    return json_build_object('ok', false, 'why', 'date', 'error', '모임 날짜를 확인해 주십시오.');
  end if;
  if p_parts is not null and jsonb_typeof(p_parts) <> 'array' then return json_build_object('ok', false, 'why', 'parts', 'error', '진도 형식이 올바르지 않습니다.'); end if;
  select coalesce(jsonb_agg(v order by split_part(v, '-', 1)::int, split_part(v, '-', 2)::int), '[]'::jsonb) into v_parts
    from (select distinct x.v from jsonb_array_elements_text(coalesce(p_parts, '[]'::jsonb)) x(v)
           where x.v ~ '^[0-9]{1,2}-[0-9]{1,2}$' limit 60) s;

  insert into public.edu_meetings (edu_id, meet_date, parts, memo)
  values (p_edu, p_date, v_parts, nullif(left(btrim(coalesce(p_memo, '')), 500), ''))
  on conflict (edu_id, meet_date) do update
    set parts = excluded.parts, memo = excluded.memo, voided_at = null, updated_at = now()
  returning id into v_mid;

  if p_attend is not null and jsonb_typeof(p_attend) = 'array' then
    for e in select * from jsonb_array_elements(p_attend) loop
      if jsonb_typeof(e) <> 'object' then continue; end if;
      v_pid := btrim(coalesce(e ->> 'pid', ''));
      v_status := coalesce(e ->> 'status', '');
      if v_pid = '' or v_status not in ('', '출석', '지각', '결석') then continue; end if;
      select p.name into v_name from public.edu_people(r.participants) p where public.edu_pid(p.name, p.key) = v_pid limit 1;
      if v_name is null then continue; end if;      -- 이 반 명단에 없는 사람은 받지 않는다
      insert into public.edu_meeting_attend (meeting_id, edu_id, member_key, member_name, status)
      values (v_mid, p_edu, v_pid, v_name, v_status)
      on conflict (meeting_id, member_key) do update set status = excluded.status, member_name = excluded.member_name, updated_at = now();
      v_n := v_n + 1;
    end loop;
  end if;
  return json_build_object('ok', true, 'id', v_mid, 'parts', v_parts, 'attend', v_n);
end $$;
revoke all on function public.edu_meeting_save(uuid, date, jsonb, text, jsonb) from public, anon;
grant execute on function public.edu_meeting_save(uuid, date, jsonb, text, jsonb) to authenticated;

-- 인도자: 잘못 적은 모임 취소(지우지 않는다) / 되살리기
create or replace function public.edu_meeting_void(p_edu uuid, p_date date, p_void boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare v_mid bigint;
begin
  if not public.edu_is_leader(p_edu) then return json_build_object('ok', false, 'why', 'leader', 'error', '이 반의 인도자만 고칠 수 있습니다.'); end if;
  update public.edu_meetings set voided_at = case when coalesce(p_void, true) then now() else null end, updated_at = now()
   where edu_id = p_edu and meet_date = p_date returning id into v_mid;
  if v_mid is null then return json_build_object('ok', false, 'why', 'notfound', 'error', '그 날짜의 모임 기록이 없습니다.'); end if;
  return json_build_object('ok', true, 'id', v_mid, 'voided', coalesce(p_void, true));
end $$;
revoke all on function public.edu_meeting_void(uuid, date, boolean) from public, anon;
grant execute on function public.edu_meeting_void(uuid, date, boolean) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6) 강별 과제: 인도자의 확인 · 수강생이 낸 글
-- ─────────────────────────────────────────────────────────────
create or replace function public.edu_check_save(p_edu uuid, p_lesson integer, p_pid text, p_name text default null,
                                                 p_prep boolean default false, p_task boolean default false, p_recite boolean default false, p_memo text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_pid text := btrim(coalesce(p_pid, '')); v_name text;
begin
  if not public.edu_is_leader(p_edu) then return json_build_object('ok', false, 'why', 'leader', 'error', '이 반의 인도자만 표시할 수 있습니다.'); end if;
  if p_lesson is null or p_lesson not between 1 and 30 then return json_build_object('ok', false, 'why', 'lesson', 'error', '강 번호를 확인해 주십시오.'); end if;
  select p.name into v_name
    from public.edu_records er, public.edu_people(er.participants) p
   where er.id = p_edu and public.edu_pid(p.name, p.key) = v_pid limit 1;
  if v_name is null then return json_build_object('ok', false, 'why', 'member', 'error', '이 반 명단에 없는 사람입니다.'); end if;
  insert into public.edu_lesson_checks (edu_id, lesson_no, member_key, member_name, prep, task, recite, memo)
  values (p_edu, p_lesson, v_pid, v_name, coalesce(p_prep, false), coalesce(p_task, false), coalesce(p_recite, false),
          nullif(left(btrim(coalesce(p_memo, '')), 300), ''))
  on conflict (edu_id, lesson_no, member_key) do update
    set prep = excluded.prep, task = excluded.task, recite = excluded.recite, memo = excluded.memo,
        member_name = excluded.member_name, checked_by = auth.uid(), updated_at = now();
  return json_build_object('ok', true);
end $$;
revoke all on function public.edu_check_save(uuid, integer, text, text, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.edu_check_save(uuid, integer, text, text, boolean, boolean, boolean, text) to authenticated;

-- 수강생: 내 예습·암송 표시와 낸 글(교적과 이어진 계정의 수강생만)
create or replace function public.edu_work_save(p_edu uuid, p_lesson integer, p_prep boolean default null, p_recite boolean default null,
                                                p_share text default null, p_task text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_key text;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 저장할 수 있습니다.'); end if;
  if p_lesson is null or p_lesson not between 1 and 30 then return json_build_object('ok', false, 'why', 'lesson', 'error', '강 번호를 확인해 주십시오.'); end if;
  select nullif(btrim(coalesce(l.member_key, '')), '') into v_key from public.member_links l where l.user_id = v_uid;
  if v_key is null or not exists (
       select 1 from public.edu_records er, public.edu_people(er.participants) p where er.id = p_edu and p.key = v_key) then
    return json_build_object('ok', false, 'why', 'student', 'error', '이 반에 등록된 수강생만 저장할 수 있습니다.');
  end if;
  insert into public.edu_lesson_work (edu_id, lesson_no, user_id, member_key, prep_done, recite_done, share_note, task_note)
  values (p_edu, p_lesson, v_uid, v_key, coalesce(p_prep, false), coalesce(p_recite, false),
          nullif(left(btrim(coalesce(p_share, '')), 2000), ''), nullif(left(btrim(coalesce(p_task, '')), 2000), ''))
  on conflict (edu_id, lesson_no, user_id) do update
    set prep_done   = coalesce(p_prep, public.edu_lesson_work.prep_done),
        recite_done = coalesce(p_recite, public.edu_lesson_work.recite_done),
        share_note  = case when p_share is null then public.edu_lesson_work.share_note else nullif(left(btrim(p_share), 2000), '') end,
        task_note   = case when p_task  is null then public.edu_lesson_work.task_note  else nullif(left(btrim(p_task), 2000), '') end,
        member_key  = excluded.member_key, updated_at = now();
  return json_build_object('ok', true);
end $$;
revoke all on function public.edu_work_save(uuid, integer, boolean, boolean, text, text) from public, anon;
grant execute on function public.edu_work_save(uuid, integer, boolean, boolean, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 7) 수료: 이수 처리 — 해마다 번호(2026-양-001) · 성도별 자료실에 '출석/이수' 항목
-- ─────────────────────────────────────────────────────────────
create or replace function public.edu_complete_issue(p_edu uuid, p_pid text, p_name text default null, p_date date default null, p_memo text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  r public.edu_records%rowtype;
  v_pid text := btrim(coalesce(p_pid, '')); v_name text; v_on date := coalesce(p_date, current_date);
  v_seq integer; v_no text; v_id bigint; v_user uuid; v_key text; v_label text; v_old record;
begin
  if not public.edu_is_leader(p_edu) then return json_build_object('ok', false, 'why', 'leader', 'error', '이 반의 인도자만 이수 처리할 수 있습니다.'); end if;
  select * into r from public.edu_records where id = p_edu;
  if not found then return json_build_object('ok', false, 'why', 'notfound', 'error', '반을 찾을 수 없습니다.'); end if;
  select p.name into v_name from public.edu_people(r.participants) p where public.edu_pid(p.name, p.key) = v_pid limit 1;
  if v_name is null then return json_build_object('ok', false, 'why', 'member', 'error', '이 반 명단에 없는 사람입니다.'); end if;

  select c.id, c.cert_no into v_old from public.edu_completions c where c.edu_id = p_edu and c.member_key = v_pid and c.voided_at is null limit 1;
  if found then return json_build_object('ok', true, 'id', v_old.id, 'cert_no', v_old.cert_no, 'already', true); end if;

  v_key := case when left(v_pid, 1) = '~' then null else v_pid end;       -- 교적에 잇지 않은 사람은 교적 열쇠가 없다
  if v_key is not null then select l.user_id into v_user from public.member_links l where l.member_key = v_key limit 1; end if;

  perform pg_advisory_xact_lock(hashtext('edu_completion_no|' || extract(year from v_on)::int));
  select coalesce(max(nullif(split_part(cert_no, '-', 3), '')::integer), 0) + 1 into v_seq
    from public.edu_completions where cert_no like extract(year from v_on)::int || '-양-%' and split_part(cert_no, '-', 3) ~ '^[0-9]+$';
  v_no := extract(year from v_on)::int || '-양-' || lpad(v_seq::text, 3, '0');
  v_label := coalesce(nullif(btrim(r.title), ''), '교육') || coalesce(' ' || nullif(btrim(r.cohort), ''), '');

  insert into public.edu_completions (cert_no, edu_id, course_code, title, cohort, class_name, member_key, member_name, user_id, completed_on, memo)
  values (v_no, p_edu, r.course_code, coalesce(nullif(btrim(r.title), ''), '교육'), nullif(btrim(r.cohort), ''), nullif(btrim(r.class_name), ''),
          v_pid, v_name, v_user, v_on, nullif(left(btrim(coalesce(p_memo, '')), 500), ''))
  returning id into v_id;

  -- 성도별 자료실: '출석/이수' 분류에 수료증 항목 — 표가 있는 곳에서만
  if to_regclass('public.member_files') is not null then
    execute 'insert into public.member_files (member_key, member_name, category, title, file_url, file_name, doc_date, uploaded_by) values ($1, $2, $3, $4, $5, $6, $7, $8)'
      using v_key, v_name, '출석/이수', v_label || ' 수료증 (' || v_no || ')', 'edu-print.html?done=' || v_id, v_label || ' 수료증 ' || v_no, v_on, '강의실';
  end if;
  return json_build_object('ok', true, 'id', v_id, 'cert_no', v_no);
end $$;
revoke all on function public.edu_complete_issue(uuid, text, text, date, text) from public, anon;
grant execute on function public.edu_complete_issue(uuid, text, text, date, text) to authenticated;

-- 관리자: 잘못 처리한 수료 취소 표시(지우지 않는다) / 되살리기
create or replace function public.edu_complete_void(p_id bigint, p_void boolean default true)
returns json language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then
    return json_build_object('ok', false, 'why', 'admin', 'error', '관리자만 취소할 수 있습니다.');
  end if;
  update public.edu_completions set voided_at = case when coalesce(p_void, true) then now() else null end
   where id = p_id returning id into v_id;
  if v_id is null then return json_build_object('ok', false, 'why', 'notfound', 'error', '수료 기록을 찾을 수 없습니다.'); end if;
  return json_build_object('ok', true, 'id', v_id, 'voided', coalesce(p_void, true));
end $$;
revoke all on function public.edu_complete_void(bigint, boolean) from public, anon;
grant execute on function public.edu_complete_void(bigint, boolean) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
