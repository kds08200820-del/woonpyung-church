-- ============================================================
--  운평장로교회 — 보호자 화면 자녀 표시 순서 (맨 앞 자녀가 자동 선택)
--  Supabase ▸ SQL Editor 에 통째로 붙여넣고 Run (여러 번 실행해도 안전)
--
--  [왜]
--   대시보드 '우리 아이 주일학교'는 자녀가 둘 이상이면 맨 앞 자녀가 자동으로
--   선택된다. 큰아이는 제 계정으로 직접 인증하고 보호자는 작은아이 것만 대신
--   올리는 집은, 들어올 때마다 작은아이를 다시 눌러야 했다(2026-09-18 요청).
--   또 ss_my_children() 에 order by 가 없어 자녀 순서가 매번 달라질 수 있었다.
--
--  [바뀌는 것]  (비파괴적 — 칼럼 1개 추가, 함수 1개 교체, 함수 1개 추가)
--   1) gyojeok.ss_sort integer (nullable) — 보호자 화면 표시 순서. 작을수록 앞.
--   2) ss_my_children() — ss_sort → 생년월일 → 이름 순으로 정렬해 돌려준다.
--      (반환 칼럼은 그대로 둔다: ss_talents/ss_submissions 정책이 이 함수를 참조)
--   3) ss_set_child_order(text[]) — 보호자가 '내 자녀'의 순서를 저장.
--      배열 순서대로 1, 2, 3… 을 ss_sort 에 넣는다. 내 자녀가 아닌 키가 섞이면 거부.
--
--  [되돌리기(롤백)]
--   -- drop function if exists public.ss_set_child_order(text[]);
--   -- supabase/20260817_2345_ss_school_levels.sql 의 4) ss_my_children() 블록을 다시 실행
--   -- (칼럼은 삭제 정책에 따라 DROP 하지 않는다. 4주 후 사람이 직접:
--   --  alter table public.gyojeok rename column ss_sort to ss_sort_archived;)
-- ============================================================

-- 1) 표시 순서 칼럼 (nullable — 지정 안 한 집은 생년월일 순)
alter table public.gyojeok add column if not exists ss_sort integer;

-- 2) 보호자의 자녀 목록 — 순서를 고정 (반환 칼럼 변경 없음)
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
  order by g.ss_sort nulls last, g.birth nulls last, g.name
$$;
grant execute on function public.ss_my_children() to authenticated;

-- 3) 자녀 순서 저장 — 보호자 본인의 자녀만
create or replace function public.ss_set_child_order(p_keys text[])
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_n int := coalesce(array_length(p_keys, 1), 0);
  i   int;
begin
  if v_n = 0 then return; end if;
  if exists (select 1 from unnest(p_keys) as k
             where k not in (select c.member_key from public.ss_my_children() c)) then
    raise exception '내 자녀의 순서만 바꿀 수 있습니다.';
  end if;
  for i in 1..v_n loop
    update public.gyojeok set ss_sort = i where member_key = p_keys[i];
  end loop;
end $$;
grant execute on function public.ss_set_child_order(text[]) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
