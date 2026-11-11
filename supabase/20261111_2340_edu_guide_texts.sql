-- 강의실 제자훈련 양육반: 인도자가 문항마다 직접 적어 두는 질문 글 (2026-11-11 담임목사 지시)
--  · "질문이 수강생에게 안 보이게, 인도자에게만" · "인도자는 인도자용 강의안도" — 강 화면에서 인도자만 문항마다 질문과 강의안을 본다.
--    질문·강의안의 기본 글은 교회가 새로 쓴 것(js/disciple-guide.js, 인도자일 때만 불러옴).
--    인도자가 교재의 문장을 쓰고 싶으면 문항마다 '질문 고쳐 쓰기' 칸에 직접 붙여 넣는다 → 이 표에 저장되고, 인도자에게만 기본 글 대신 보인다.
--    수강생은 이 글을 읽을 수 없다(표에 직접 읽기 정책이 없고, 읽는 함수는 인도자·관리자에게만 돌려준다).
--
--  표(새로)
--   edu_guide_texts : 과정(course)·문항 열쇠(item_key)마다 인도자가 적은 질문 글 하나 — 반과 상관없이 그 과정의 인도자가 함께 쓴다
--                     문항 열쇠: '3-a2' = 3강 둘째 교재 문항, '3-p1' = 3강 '나눔과 적용' 첫째(화면 js/disciple.js 의 열쇠와 같다)
--  함수
--   edu_course_leader(과정)                   : 관리자이거나, 그 과정의 반 하나라도 인도자인가
--   edu_guide_texts(과정)                     : 인도자·관리자 — {ok, texts:{열쇠:{body, at}}} (빈 글은 빼고). 그 밖에는 {ok:false}
--   edu_guide_text_save(과정, 열쇠, 글)       : 인도자·관리자 — 고쳐 씀. 빈 글이면 '' 로 남겨 기본 글로 돌아간다(지우지 않음). 한 글 4,000자까지
--  · 비파괴: 표 1개·함수 3개 추가만. 다시 실행해도 안전(create … if not exists / create or replace).
--  · 앞서 실행한 supabase/20261111_1900_edu_disciple.sql 이 있어야 한다(edu_people · edu_records.leaders · course_code).
--
-- 되돌리기 (DROP 대신 RENAME — 삭제 정책대로. 함수는 자료가 없어 지워도 됨):
--   drop function if exists public.edu_guide_text_save(text, text, text);
--   drop function if exists public.edu_guide_texts(text);
--   drop function if exists public.edu_course_leader(text);
--   alter table public.edu_guide_texts rename to edu_guide_texts_archived;

create table if not exists public.edu_guide_texts (
  course     text not null,
  item_key   text not null,
  body       text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (course, item_key)
);
alter table public.edu_guide_texts enable row level security;
revoke all on public.edu_guide_texts from public, anon, authenticated;

-- 이 과정의 인도자인가: 관리자이거나, 그 과정(course_code)의 반 가운데 하나라도 leaders 에 내 교적 열쇠가 있다
create or replace function public.edu_course_leader(p_course text)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.admins a where a.uid = auth.uid())
    or exists (
      select 1 from public.edu_records er
        join public.member_links ml on ml.user_id = auth.uid()
       where er.course_code = p_course and coalesce(ml.member_key, '') <> ''
         and ml.member_key in (select p.key from public.edu_people(er.leaders) p where p.key <> '')
    ))
$$;
revoke all on function public.edu_course_leader(text) from public, anon;
grant execute on function public.edu_course_leader(text) to authenticated;

-- 인도자·관리자: 그 과정에서 인도자들이 적어 둔 질문 글
create or replace function public.edu_guide_texts(p_course text default 'disciple')
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.edu_course_leader(p_course) then
    return json_build_object('ok', false, 'why', 'leader', 'error', '이 과정의 인도자만 볼 수 있습니다.');
  end if;
  return json_build_object('ok', true, 'texts', coalesce((
    select jsonb_object_agg(g.item_key, jsonb_build_object('body', g.body, 'at', g.updated_at))
      from public.edu_guide_texts g where g.course = p_course and g.body <> ''), '{}'::jsonb));
end $$;
revoke all on function public.edu_guide_texts(text) from public, anon;
grant execute on function public.edu_guide_texts(text) to authenticated;

-- 인도자·관리자: 문항 하나의 질문 글 고쳐 쓰기(빈 글 = 기본 글로 되돌리기)
create or replace function public.edu_guide_text_save(p_course text, p_key text, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare v_body text := left(btrim(coalesce(p_body, '')), 4000);
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 저장할 수 있습니다.'); end if;
  if not public.edu_course_leader(p_course) then
    return json_build_object('ok', false, 'why', 'leader', 'error', '이 과정의 인도자만 저장할 수 있습니다.');
  end if;
  if coalesce(p_key, '') !~ '^[0-9]{1,2}-[a-z][0-9]{1,3}$' then
    return json_build_object('ok', false, 'why', 'key', 'error', '문항 열쇠가 올바르지 않습니다.');
  end if;
  insert into public.edu_guide_texts (course, item_key, body, updated_by, updated_at)
  values (p_course, p_key, v_body, auth.uid(), now())
  on conflict (course, item_key) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = now();
  return json_build_object('ok', true, 'key', p_key, 'body', v_body);
end $$;
revoke all on function public.edu_guide_text_save(text, text, text) from public, anon;
grant execute on function public.edu_guide_text_save(text, text, text) to authenticated;

notify pgrst, 'reload schema';
