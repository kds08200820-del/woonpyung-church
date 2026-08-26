-- ============================================================
--  운평장로교회 — 보호자(부모)가 자녀의 교적 정보를 직접 수정
--  Supabase ▸ SQL Editor 에 통째로 붙여넣고 Run (1회, 여러 번 실행해도 안전)
--
--  [왜]
--   교적(gyojeok)은 관리자·재정권한자만 고칠 수 있어, 자녀의 생년월일이
--   비어 있으면 매칭키(이름|생년월일)가 만들어지지 않는다. 매칭키가 없으면
--   ss_my_children() 이 그 자녀를 인정하지 않아 대시보드의
--   '우리 아이 주일학교'가 통째로 사라지고, 달란트·QT/필사 인증도
--   아이와 연결되지 않는다. 부모가 개인정보 화면에서 직접 채우게 한다.
--
--  [무엇이 생기나]  (표·칼럼 변경 없음 — 함수 3개만 추가)
--   1) public.child_relations()  — '자녀'로 볼 가족관계 목록
--   2) public.my_child_rows()    — 내가 관리할 수 있는 자녀 교적 목록
--   3) public.update_my_child()  — 정해진 칸만 수정 + 매칭키 자동 생성
--
--  [안전장치]
--   · 세대주 본인 또는 그 배우자만 자격이 있다(자녀·형제·부모 본인은 불가)
--   · 같은 세대 + 가족관계가 자녀류인 교적만 대상
--   · 고칠 수 있는 칸은 생년월일·성별·주일학교·휴대폰 넷뿐
--     (이름·세대주·관계·회원상태·직책 등은 교회 사무실만)
--   · 교적 행을 새로 만들거나 지우는 것은 불가(사무실 담당)
--   · 매칭키는 비어 있거나 '이름|'(생년월일 없음)일 때만 새로 만든다.
--     헌금이 연결돼 있거나 같은 키가 이미 있으면 건드리지 않고 안내만 돌려준다.
--
--  [되돌리기(롤백)]
--   -- drop function if exists public.update_my_child(bigint, text, text, text, text);
--   -- drop function if exists public.my_child_rows();
--   -- drop function if exists public.child_relations();
--   -- 프런트(js/admin.js)는 RPC가 없으면 카드를 조용히 숨기므로 순서 상관없다.
-- ============================================================

-- ── 1) '자녀'로 볼 가족관계 --------------------------------------
--    교적관리(js/gyojeok.js)의 관계 목록과 값을 맞춘다.
create or replace function public.child_relations()
returns text[] language sql immutable
as $$ select array['장남','차남','삼남','사남','아들','장녀','차녀','삼녀','사녀','딸','자녀','손자','손녀']::text[] $$;

grant execute on function public.child_relations() to authenticated;

-- ── 2) 내가 관리할 수 있는 자녀 교적 ------------------------------
--    locked = 헌금이 이미 그 매칭키로 쌓여 있어 매칭키를 바꾸면 안 되는 경우.
create or replace function public.my_child_rows()
returns table (id bigint, name text, member_key text, relation text,
               birth date, sex text, ss_role text, phone text, locked boolean)
language sql security definer stable
set search_path = public as $$
  with mykeys as (select public.my_member_keys() as k),
  me as (
    select g.id, g.name, g.head, g.relation
    from public.gyojeok g
    where g.member_key in (select k from mykeys)
    order by g.id limit 1
  ),
  myhead as (select coalesce(nullif((select head from me), ''), (select name from me)) as h),
  -- 보호자 자격: 세대주 본인이거나 그 배우자
  guard as (
    select coalesce((select name from me) = (select h from myhead)
                 or (select relation from me) = '배우자', false) as ok
  )
  select g.id, g.name, coalesce(g.member_key, '') as member_key, coalesce(g.relation, '') as relation,
         g.birth, coalesce(g.sex, '') as sex, coalesce(g.ss_role, '') as ss_role, coalesce(g.phone, '') as phone,
         exists (select 1 from public.offerings o
                  where coalesce(g.member_key, '') <> '' and o.member_key = g.member_key) as locked
  from public.gyojeok g
  where (select ok from guard)
    and coalesce(nullif(g.head, ''), g.name) = (select h from myhead)
    and coalesce(g.relation, '') = any (public.child_relations())
    and g.id <> (select id from me)
    and coalesce(g.member_key, '') not in (select coalesce(k, '') from mykeys)
  order by g.birth nulls last, g.name
$$;

grant execute on function public.my_child_rows() to authenticated;

-- ── 3) 자녀 교적 수정 ---------------------------------------------
--    각 인자: null = 그대로 두기, '' = 비우기, 값 = 그 값으로 저장
create or replace function public.update_my_child(
  p_id      bigint,
  p_birth   text default null,   -- 'YYYY-MM-DD'
  p_sex     text default null,   -- '남' | '여'
  p_ss_role text default null,   -- '어린이' | '중학생' | '고등학생'
  p_phone   text default null
) returns json
language plpgsql security definer
set search_path = public as $$
declare
  v_name  text;
  v_old   text;
  v_new   text;
  v_birth date;
  v_note  text := '';
begin
  if not exists (select 1 from public.my_child_rows() c where c.id = p_id) then
    raise exception '내 자녀의 교적만 수정할 수 있습니다.';
  end if;
  if nullif(p_birth, '') is not null and p_birth !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '생년월일은 2016-05-03 처럼 적어 주세요.';
  end if;
  if nullif(p_ss_role, '') is not null
     and not (p_ss_role = any (array['어린이', '중학생', '고등학생'])) then
    raise exception '주일학교는 어린이·중학생·고등학생 중에서 골라 주세요.';
  end if;

  update public.gyojeok set
    birth   = case when p_birth   is null then birth   else nullif(p_birth, '')::date end,
    sex     = case when p_sex     is null then sex     else nullif(p_sex, '')         end,
    ss_role = case when p_ss_role is null then ss_role else nullif(p_ss_role, '')     end,
    phone   = case when p_phone   is null then phone
                   else nullif(regexp_replace(p_phone, '[^0-9]', '', 'g'), '')        end
  where id = p_id;

  select g.name, coalesce(g.member_key, ''), g.birth
    into v_name, v_old, v_birth
  from public.gyojeok g where g.id = p_id;

  -- 매칭키 자동 생성: 비어 있거나 생년월일이 빠진 '이름|' 형태일 때만
  if v_birth is not null and (v_old = '' or v_old = v_name || '|') then
    v_new := v_name || '|' || to_char(v_birth, 'YYYYMMDD');
    if exists (select 1 from public.gyojeok g where g.member_key = v_new and g.id <> p_id) then
      v_note := '같은 이름·생년월일의 교적이 이미 있어 매칭키는 그대로 두었습니다. 교회 사무실에 문의해 주세요.';
    elsif v_old <> '' and exists (select 1 from public.offerings o where o.member_key = v_old) then
      v_note := '헌금 기록이 연결돼 있어 매칭키는 교회 사무실에서만 바꿀 수 있습니다.';
    else
      update public.gyojeok set member_key = v_new where id = p_id;
      -- 옛 키로 쌓인 주일학교 기록을 새 키로 옮긴다.
      -- (옛 키를 쓰는 교적이 하나도 남지 않았을 때만 = 동명이인이 섞일 위험이 없을 때만)
      if v_old <> '' and (select count(*) from public.gyojeok g where g.member_key = v_old) = 0 then
        update public.ss_talents     set member_key = v_new where member_key = v_old;
        update public.ss_submissions set member_key = v_new where member_key = v_old;
      end if;
    end if;
  end if;

  return json_build_object(
    'ok', true,
    'note', v_note,
    'member_key', (select coalesce(member_key, '') from public.gyojeok where id = p_id)
  );
end $$;

grant execute on function public.update_my_child(bigint, text, text, text, text) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
