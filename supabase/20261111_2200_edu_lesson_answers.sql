-- 강의실 제자훈련 양육반: 강 화면의 문항마다 수강생이 적은 답 (2026-11-11 담임목사 지시 — "질문과 답변, 성경 구절 안내가 나와야 합니다")
--  · 강 화면이 교재의 문항 순서대로 바뀐다(js/disciple-data.js 의 sections). 문항마다 수강생이 교재처럼 답을 적고, 인도자는 그 답을 본다.
--    교재의 질문 문장과 답지는 홈페이지에 싣지 않는다(출판물) — 화면에는 문항의 짧은 주제와 교재의 성경 구절만 있고, 답은 수강생이 직접 적는다.
--
--  칸 추가
--   edu_lesson_work + answers jsonb default '{}' : {문항 열쇠: 적은 답} — 문항 열쇠는 화면이 정한다(예: 'a3' = 그 강의 셋째 문항, 'p1' = 나눔 첫째)
--  함수
--   edu_answers_save(반, 강, 답 jsonb) : 수강생 — 보낸 문항만 고쳐 쓴다(빈 글이면 그 문항을 지움). 문항 120개·한 답 2,000자까지
--   edu_class_state(반)              : (고침) 수강생의 my_work 와 인도자의 work 에 answers 를 더한다 — 나머지는 20261111_1900 그대로
--  · 비파괴: 칸 1개 추가(default 있음)·함수 1개 추가·함수 1개 고침. 다시 실행해도 안전.
--  · 앞서 실행한 supabase/20261111_1900_edu_disciple.sql 이 있어야 한다.
--
-- 되돌리기 (DROP 대신 RENAME — 삭제 정책대로):
--   drop function if exists public.edu_answers_save(uuid, integer, jsonb);
--   supabase/20261111_1900_edu_disciple.sql 의 edu_class_state 부분(create or replace function public.edu_class_state … 와 그 아래 revoke/grant)을 다시 실행
--   alter table public.edu_lesson_work rename column answers to answers_archived;

alter table public.edu_lesson_work add column if not exists answers jsonb not null default '{}'::jsonb;

-- 수강생: 문항마다 적은 답 저장(교적과 이어진 계정의 그 반 수강생만)
create or replace function public.edu_answers_save(p_edu uuid, p_lesson integer, p_answers jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_key text; v_cur jsonb; k text; v jsonb;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 저장할 수 있습니다.'); end if;
  if p_lesson is null or p_lesson not between 1 and 30 then return json_build_object('ok', false, 'why', 'lesson', 'error', '강 번호를 확인해 주십시오.'); end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then return json_build_object('ok', false, 'why', 'answers', 'error', '답 형식이 올바르지 않습니다.'); end if;
  select nullif(btrim(coalesce(l.member_key, '')), '') into v_key from public.member_links l where l.user_id = v_uid;
  if v_key is null or not exists (
       select 1 from public.edu_records er, public.edu_people(er.participants) p where er.id = p_edu and p.key = v_key) then
    return json_build_object('ok', false, 'why', 'student', 'error', '이 반에 등록된 수강생만 저장할 수 있습니다.');
  end if;
  select coalesce(w.answers, '{}'::jsonb) into v_cur from public.edu_lesson_work w where w.edu_id = p_edu and w.lesson_no = p_lesson and w.user_id = v_uid;
  v_cur := coalesce(v_cur, '{}'::jsonb);
  for k, v in select * from jsonb_each(p_answers) loop
    if k !~ '^[a-z][0-9]{1,3}$' then continue; end if;                       -- 문항 열쇠 꼴만
    if jsonb_typeof(v) <> 'string' or btrim(v #>> '{}') = '' then v_cur := v_cur - k;
    else v_cur := v_cur || jsonb_build_object(k, left(btrim(v #>> '{}'), 2000)); end if;
  end loop;
  if (select count(*) from jsonb_object_keys(v_cur)) > 120 then return json_build_object('ok', false, 'why', 'many', 'error', '문항이 너무 많습니다.'); end if;
  insert into public.edu_lesson_work (edu_id, lesson_no, user_id, member_key, answers)
  values (p_edu, p_lesson, v_uid, v_key, v_cur)
  on conflict (edu_id, lesson_no, user_id) do update set answers = excluded.answers, member_key = excluded.member_key, updated_at = now();
  return json_build_object('ok', true, 'count', (select count(*) from jsonb_object_keys(v_cur)));
end $$;
revoke all on function public.edu_answers_save(uuid, integer, jsonb) from public, anon;
grant execute on function public.edu_answers_save(uuid, integer, jsonb) to authenticated;

-- 반의 상태: 20261111_1900 과 같고, 낸 글에 answers 를 더했다
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
                                                              'share_note', w.share_note, 'task_note', w.task_note, 'answers', w.answers, 'updated_at', w.updated_at) order by w.lesson_no)
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
                                                         'recite_done', w.recite_done, 'share_note', w.share_note, 'task_note', w.task_note, 'answers', w.answers,
                                                         'updated_at', w.updated_at) order by w.lesson_no)
                        from public.edu_lesson_work w where w.edu_id = p_edu), '[]'::jsonb),
    'completions', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'pid', c.member_key, 'name', c.member_name, 'cert_no', c.cert_no,
                                                                'completed_on', c.completed_on, 'voided', c.voided_at is not null) order by c.id)
                               from public.edu_completions c where c.edu_id = p_edu), '[]'::jsonb)
  ))::json;
end $$;

revoke all on function public.edu_class_state(uuid) from public, anon;
grant execute on function public.edu_class_state(uuid) to authenticated;

notify pgrst, 'reload schema';
