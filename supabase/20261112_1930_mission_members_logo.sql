-- ============================================================
--  구제선교위원회: 회원 명단을 회원에게 · 헌금 횟수 빼기 · 후원처 로고 · CTS기독교TV 추가
--  (2026-11-12, 담임목사 지시) — Supabase → SQL Editor 에서 1회 실행
--
--  바뀌는 것 (모두 비파괴):
--   1) mission_partners 에 logo_url 칼럼 추가(빈 글자가 기본값). 화면은 있으면 이름 위에 로고를 보인다.
--   2) mission_committee() 가 헌금 횟수(cnt)를 돌려주지 않는다(관리자·재정 담당에게도). 이름·교적 연결 여부만.
--   3) 공개 범위에 'members' 추가 — 회원 수는 누구나, 명단은 그 회기 회원(로그인한 본인이 회원일 때)에게.
--      관리자·재정 담당은 지금처럼 늘 명단을 본다.
--   4) 공개 범위를 'members' 로 정한다(목사님 지시: "회원 명단은 회원들에게 보여주세요").
--   5) 후원 기관에 CTS기독교TV 를 더한다(같은 이름이 이미 있으면 더하지 않음). 로고 파일은 저장소 images/partners/cts.png.
--
--  되돌리는 방법 (사람이 직접):
--   · 공개 범위: update public.app_settings set value = 'count' where key = 'mission_member_visibility';
--   · CTS 후원처: 화면의 「숨기기」 또는 update public.mission_partners set active = false where name = 'CTS기독교TV';
--   · 함수 두 개: supabase/20261110_1900_mission_committee.sql 의 4)·5) 정의를 다시 실행
--     (단, 그 정의는 'members' 를 모르므로 먼저 공개 범위를 'count' 로 돌려 둘 것)
--   · logo_url 칼럼: 지우지 말고 그대로 둔다(빈 값이면 화면에 아무것도 안 나온다). 꼭 없애야 하면
--     alter table public.mission_partners rename column logo_url to logo_url_archived;
-- ============================================================

-- 1) 로고 칼럼
alter table public.mission_partners add column if not exists logo_url text not null default '';

-- 2)·3) 회원 — 횟수 없이, 'members' 공개 범위
create or replace function public.mission_committee(p_year int default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_fy    int;  v_from date;  v_to date;
  v_vis   text;
  v_uid   uuid := auth.uid();
  v_staff boolean := false;
  v_linked boolean := false;
  v_count int;
  v_me    boolean;
  v_names jsonb;
  v_detail jsonb;
begin
  select f.fy, f.d_from, f.d_to into v_fy, v_from, v_to from public.mission_fy(p_year) f;

  select value into v_vis from public.app_settings where key = 'mission_member_visibility';
  if v_vis is null or v_vis not in ('admin', 'count', 'names', 'members') then v_vis := 'count'; end if;

  if v_uid is not null then
    v_staff  := public.is_finance();
    v_linked := exists (select 1 from public.member_links m where m.user_id = v_uid and coalesce(m.member_key, '') <> '');
  end if;

  with m as (
    select case when coalesce(o.member_key, '') <> '' then o.member_key else 'g:' || btrim(o.giver) end as k,
           max(case when coalesce(o.member_key, '') <> '' then split_part(o.member_key, '|', 1) else btrim(o.giver) end) as name,
           bool_or(coalesce(o.member_key, '') <> '') as linked
      from public.offerings o
     where o.category = '선교헌금'
       and o.offer_date between v_from and v_to
       and o.amount > 0
       and (coalesce(o.member_key, '') <> ''
            or btrim(coalesce(o.giver, '')) not in ('', '무명', '익명', '무기명', '무명씨'))
     group by 1
  )
  select count(*)::int,
         case when v_uid is null then null
              else exists (select 1 from m where m.k in (select public.my_member_keys())) end,
         coalesce(jsonb_agg(m.name order by m.name), '[]'::jsonb),
         coalesce(jsonb_agg(jsonb_build_object('name', m.name, 'linked', m.linked) order by m.name), '[]'::jsonb)
    into v_count, v_me, v_names, v_detail
    from m;

  return jsonb_build_object(
    'year',       v_fy,
    'from',       v_from,
    'to',         v_to,
    'visibility', v_vis,
    'staff',      v_staff,
    'me',         v_me,
    'count',      case when v_staff or v_vis in ('count', 'names', 'members') then v_count end,
    'names',      case when v_staff
                         or (v_vis = 'names' and v_linked)
                         or (v_vis = 'members' and coalesce(v_me, false)) then v_names end,
    'detail',     case when v_staff then v_detail end
  );
end $$;

revoke all on function public.mission_committee(int) from public;
grant execute on function public.mission_committee(int) to anon, authenticated;

create or replace function public.mission_set_visibility(p_visibility text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then
    raise exception '관리자만 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  if p_visibility is null or p_visibility not in ('admin', 'count', 'names', 'members') then
    raise exception '공개 범위는 admin · count · names · members 가운데 하나여야 합니다.' using errcode = '22023';
  end if;
  insert into public.app_settings (key, value, updated_at) values ('mission_member_visibility', p_visibility, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return p_visibility;
end $$;

revoke all on function public.mission_set_visibility(text) from public, anon;
grant execute on function public.mission_set_visibility(text) to authenticated;

-- 4) 공개 범위: 명단은 회원에게
insert into public.app_settings (key, value, updated_at) values ('mission_member_visibility', 'members', now())
on conflict (key) do update set value = excluded.value, updated_at = now();

-- 5) 후원 기관: CTS기독교TV
insert into public.mission_partners (kind, name, summary, person, address, url, logo_url, sort)
select '기관', 'CTS기독교TV', '기독교 방송', '', '', 'https://www.cts.tv', 'images/partners/cts.png', 200
 where not exists (select 1 from public.mission_partners where name = 'CTS기독교TV');

-- 실행 뒤 확인(메타데이터·건수만):
--   select column_name from information_schema.columns where table_name = 'mission_partners' and column_name = 'logo_url';
--   select value from public.app_settings where key = 'mission_member_visibility';          -- members
--   select count(*) from public.mission_partners where name = 'CTS기독교TV';                 -- 1
