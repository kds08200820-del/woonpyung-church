-- 방송실 관리자 (2026-09-27 담임목사 지시)
--  · member_links.can_broadcast : 관리자(admins)가 교적관리 > 권한 관리에서 지명한다
--  · 방송실 관리자·관리자는 홈페이지 히어로의 '예배 전 카운트'를 전체 화면으로 띄울 수 있다 (js/worship.js)
--  · 로그인하면 헤더 이름 아래에 '(방송실 관리자)' 표기 (js/layout.js)
--  · list_access 에 canBroadcast 를 더하고, 지명은 새 함수 set_broadcast 로 (set_access 는 그대로 둔다)
-- 되돌리기:
--   drop function if exists public.set_broadcast(uuid, boolean);
--   drop function if exists public.broadcast_access();
--   list_access 를 finance_migration.sql 의 원래 정의로 다시 실행
--   alter table public.member_links rename column can_broadcast to can_broadcast_archived;   (DROP 대신 RENAME)

alter table public.member_links add column if not exists can_broadcast boolean not null default false;

-- 권한 목록(관리자만) — canBroadcast 추가
create or replace function public.list_access()
returns json language sql security definer set search_path = public as $$
  select coalesce(json_agg(row), '[]'::json) from (
    select json_build_object(
      'uid', p.id, 'name', coalesce(l.member_name, p.name, ''), 'email', coalesce(p.email,''),
      'status', coalesce(l.member_status,'준회원'), 'canFinance', coalesce(l.can_finance,false),
      'canBroadcast', coalesce(l.can_broadcast,false),
      'isAdmin', exists(select 1 from public.admins a where a.uid = p.id)
    ) as row
    from public.profiles p left join public.member_links l on l.user_id = p.id
    where exists(select 1 from public.admins where uid = auth.uid())
    order by exists(select 1 from public.admins a where a.uid = p.id) desc, coalesce(l.member_name, p.name)
  ) t;
$$;

-- 방송실 관리자 지명/해제 (관리자만)
create or replace function public.set_broadcast(p_uid uuid, p_on boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.admins where uid = auth.uid()) then
    return json_build_object('ok', false, 'error', '관리자만 지명할 수 있습니다.');
  end if;
  insert into public.member_links(user_id, can_broadcast, updated_at) values (p_uid, coalesce(p_on,false), now())
  on conflict (user_id) do update set can_broadcast = coalesce(p_on,false), updated_at = now();
  return json_build_object('ok', true);
end $$;
revoke all on function public.set_broadcast(uuid, boolean) from public;
grant execute on function public.set_broadcast(uuid, boolean) to authenticated;

-- 내 방송실 권한 — { isAdmin, canBroadcast } (본인 것만)
create or replace function public.broadcast_access()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'isAdmin', exists(select 1 from public.admins where uid = auth.uid()),
    'canBroadcast', coalesce((select can_broadcast from public.member_links where user_id = auth.uid()), false)
  );
$$;
revoke all on function public.broadcast_access() from public;
grant execute on function public.broadcast_access() to authenticated;
