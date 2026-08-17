-- ============================================================
--  운평장로교회 — 주일학교 학년 구분 추가 (어린이 / 중학생 / 고등학생)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (1회, 여러 번 실행해도 안전)
--
--  [왜]
--   지금까지 교적의 '주일학교' 칸은 부장/서기/교사/어린이 넷뿐이어서
--   중·고등학생을 등록할 곳이 없었고, 등록해도 교사 대시보드의 학생 명단
--   (ss_students)이 ss_role='어린이' 만 뽑아 화면에 나오지 않았다.
--
--  [바뀌는 것]
--   · public.ss_student_roles()  — '학생'으로 취급할 직분 목록(어린이·중학생·고등학생)
--   · public.ss_students()       — 학생 3종을 모두 반환 + ss_role(학년) 칼럼 추가
--   · public.ss_context()        — isStudent(학생 본인 여부)·studentCount 추가
--   · public.ss_my_children()    — 보호자 자녀 판정에 중·고등학생 포함
--   교적 데이터는 건드리지 않는다(칼럼 추가·삭제 없음). 기존 '어린이' 지정은 그대로 유효.
--
--  [되돌리기(롤백)]
--   -- supabase/sunday_school.sql 과 supabase/sunday_school_guardian.sql 을
--   -- 다시 실행하면 '어린이'만 보는 예전 동작으로 돌아간다.
--   -- drop function if exists public.ss_student_roles();
-- ============================================================

-- 1) '학생'으로 취급할 주일학교 직분 -----------------------------
--    나중에 유치부·청년부 등을 늘릴 때 이 함수 한 곳만 고치면 된다.
create or replace function public.ss_student_roles()
returns text[] language sql immutable
as $$ select array['어린이', '중학생', '고등학생']::text[] $$;

grant execute on function public.ss_student_roles() to authenticated, anon;

-- 2) 학생 명단 + 달란트 합계 (교사단 전용) ----------------------
--    반환 칼럼이 늘어나 CREATE OR REPLACE 로는 바꿀 수 없어 drop 후 재생성한다.
--    (이 함수는 RLS 정책에서 참조하지 않으므로 drop 이 안전하다 — 정책이 쓰는 것은
--     is_ss_teacher() / ss_my_children() 이고 둘 다 그대로 둔다.)
drop function if exists public.ss_students();
create or replace function public.ss_students()
returns table (member_key text, name text, birth date, groups text, ss_role text, total bigint, cnt bigint)
language sql security definer stable
set search_path = public as $$
  select g.member_key, g.name, g.birth, g.groups, g.ss_role,
         coalesce(sum(t.amount), 0)::bigint as total, count(t.id)::bigint as cnt
  from public.gyojeok g
  left join public.ss_talents t on t.member_key = g.member_key
  where g.ss_role = any (public.ss_student_roles()) and public.is_ss_teacher()
  group by g.member_key, g.name, g.birth, g.groups, g.ss_role
  order by 2
$$;

-- 3) 내 주일학교 상태 -------------------------------------------
--    isStudent: 어린이·중학생·고등학생 본인 계정인지(대시보드가 '나의 달란트'를 띄우는 조건)
create or replace function public.ss_context()
returns json language sql security definer stable
set search_path = public as $$
  select json_build_object(
    'role', coalesce(public.ss_my_role(), ''),
    'isTeacher', public.is_ss_teacher(),
    'isEditor', public.is_ss_editor(),
    'isStudent', coalesce(public.ss_my_role() = any (public.ss_student_roles()), false),
    'teacherCount', case when public.is_ss_teacher()
      then (select count(*) from public.gyojeok where ss_role in ('교사', '부장', '서기'))
      else 0 end,
    'studentCount', case when public.is_ss_teacher()
      then (select count(*) from public.gyojeok where ss_role = any (public.ss_student_roles()))
      else 0 end
  )
$$;

-- 4) 보호자의 자녀 목록 — 중·고등학생도 자녀로 인정 ---------------
--    (반환 칼럼은 그대로 두어야 한다: ss_talents/ss_submissions 정책이 이 함수를 참조)
create or replace function public.ss_my_children()
returns table (member_key text, name text, birth date)
language sql security definer stable
set search_path = public as $$
  with mykeys as (select public.my_member_keys() as k),
  me as (
    select g.head, g.name from public.gyojeok g
    where g.member_key in (select k from mykeys)
    order by g.id limit 1
  ),
  myhead as (select coalesce(nullif((select head from me), ''), (select name from me)) as h)
  select g.member_key, g.name, g.birth
  from public.gyojeok g
  where coalesce(nullif(g.head, ''), g.name) = (select h from myhead)
    and g.ss_role = any (public.ss_student_roles())
    and coalesce(g.member_key, '') <> ''
    and g.member_key not in (select k from mykeys)
$$;

grant execute on function public.ss_students()    to authenticated;
grant execute on function public.ss_context()     to authenticated;
grant execute on function public.ss_my_children() to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
