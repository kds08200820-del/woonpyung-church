-- ============================================================
--  운평장로교회 — 내 정보(profiles)에서 본인이 바꿀 수 없는 칸 지키기 (2026-11-25 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  지금까지: 본인 프로필 수정에 칸 제한이 없었다(profile-tax.sql 의 profiles_update_self_or_admin).
--  이제부터: 화면에서 직접 고칠 때(REST) 관리자가 아니면
--    · 정지 · 탈퇴 표시(suspended_at · suspend_note · withdrawn_at)는 바뀌지 않는다(있던 값 그대로).
--    · 직분(role)을 목사 · 전도사 · 강도사가 든 값으로 새로 바꿀 수 없다 — 관리자가 회원 목록에서 지정한다.
--      (이미 그 직분인 사람이 내 정보를 저장하는 것은 그대로 된다. 집사 · 권사 · 장로 등 다른 직분은 지금처럼 본인이 고른다.)
--    관리자, 서버 안의 함수(탈퇴 withdraw_me · 정지 admin_set_suspend 등), SQL 편집기는 지금처럼 모든 칸을 바꾼다.
--
--  들어 있는 것 (모두 비파괴: CREATE OR REPLACE FUNCTION · CREATE TRIGGER 뿐. 표 · 자료는 건드리지 않는다):
--   profiles_caller_is_admin()  : 지금 부른 사람이 관리자인가
--   profiles_guard()            : profiles 의 BEFORE INSERT OR UPDATE 트리거 함수
--   trigger profiles_guard_biu  : 위 함수를 profiles 에 건다
--   list_match_requests()       : (바뀜) 교적 인증 신청 목록의 메일을 로그인 계정(auth.users)의 것으로 — 프로필의 메일은 본인이 고칠 수 있다
--   필요한 것: profiles-admin.sql · 20261124_2330_member_match_approval.sql
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · drop trigger if exists profiles_guard_biu on public.profiles;   ← 이것만 실행하면 예전처럼 움직인다
--    · drop function if exists public.profiles_guard(), public.profiles_caller_is_admin();
--    · list_match_requests 는 20261124_2330_member_match_approval.sql 의 4) 를 다시 실행
-- ============================================================

-- ── 1) 지금 부른 사람이 관리자인가 ────────────────────────────
create or replace function public.profiles_caller_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.admins a where a.uid = auth.uid());
$$;
revoke all on function public.profiles_caller_is_admin() from public, anon;
grant execute on function public.profiles_caller_is_admin() to authenticated;

-- ── 2) 지키는 트리거 ──────────────────────────────────────────
--   · 화면에서 직접 고칠 때만 본다: current_user 가 authenticated / anon 일 때.
--     서버 안의 함수(security definer)나 SQL 편집기 · service_role 은 current_user 가 달라서 그대로 지나간다.
--   · 칸 이름을 글자로 다뤄서(jsonb), 어떤 칸이 아직 없는 DB 에서도 저장이 막히지 않는다.
create or replace function public.profiles_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_keep text[] := array['suspended_at', 'suspend_note', 'withdrawn_at'];
  v_new  jsonb;
  v_old  jsonb;
  v_col  text;
  v_role_new text;
  v_role_old text;
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if current_user = 'authenticated' and public.profiles_caller_is_admin() then return new; end if;

  v_new := to_jsonb(new);
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  elsif exists (select 1 from public.profiles p where p.id = new.id) then
    -- 이미 있는 줄에 대한 「넣거나 고치기」 — 곧이어 UPDATE 쪽에서 본다. 여기서 값을 비우면 있던 값이 지워진다.
    return new;
  else
    v_old := '{}'::jsonb;   -- 새 줄: 지킬 칸은 비운 채로 시작한다
  end if;

  v_role_new := coalesce(v_new->>'role', '');
  v_role_old := coalesce(v_old->>'role', '');
  if v_role_new <> v_role_old and v_role_new ~ '(목사|전도사|강도사)' then
    raise exception '목사 · 전도사 직분은 관리자가 지정합니다. 다른 직분을 고르거나 교회에 문의해 주세요.' using errcode = '42501';
  end if;

  foreach v_col in array v_keep loop
    if v_new ? v_col then
      v_new := jsonb_set(v_new, array[v_col], coalesce(v_old->v_col, 'null'::jsonb));
    end if;
  end loop;
  return jsonb_populate_record(new, v_new);
end $$;

-- 지우고 다시 만들지 않고 바로 바꿔 끼운다(create or replace trigger — PostgreSQL 14 이상)
create or replace trigger profiles_guard_biu before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- ── 3) 교적 인증 신청 목록: 메일은 로그인 계정의 것으로 ───────
--   20261124_2330 의 4) 와 같고, 'email' 만 auth.users 의 메일을 먼저 쓴다(카카오처럼 메일이 없으면 프로필의 것),
--   'provider' (가입 방식) 를 더한다.
create or replace function public.list_match_requests()
returns json language sql security definer stable set search_path = public as $$
  select coalesce(json_agg(t.item order by t.id), '[]'::json) from (
    select r.id, json_build_object(
      'id', r.id, 'uid', r.user_id,
      'signupName', coalesce(p.name, ''),
      'email', coalesce(nullif(u.email, ''), p.email, ''),
      'provider', coalesce(p.provider, ''),
      'name', r.member_name, 'birth', split_part(r.member_key, '|', 2),
      'matched', exists (select 1 from public.gyojeok g where g.member_key = r.member_key),
      'linked', (select count(*) from public.member_links o
                  where o.member_key = r.member_key and o.member_status = '정회원' and o.user_id <> r.user_id),
      'at', r.created_at
    ) as item
      from public.member_match_requests r
      left join public.profiles p on p.id = r.user_id
      left join auth.users u on u.id = r.user_id
      left join public.member_links l on l.user_id = r.user_id
     where r.status = '대기'
       and coalesce(l.member_status, '준회원') <> '정회원'
       and exists (select 1 from public.admins a where a.uid = auth.uid())
  ) t;
$$;

revoke all on function public.list_match_requests() from public, anon;
grant execute on function public.list_match_requests() to authenticated;

-- ── 실행 뒤 확인(건수 · 이름만) ───────────────────────────────
--   select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal order by 1;   -- profiles_guard_biu 포함
--   select count(*) from public.profiles where coalesce(role, '') ~ '(목사|전도사|강도사)';                       -- 목회 직분으로 적힌 계정 수(많으면 회원 목록에서 살펴본다)
