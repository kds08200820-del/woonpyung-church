-- 출석률의 기준을 담임목사로 · '설교하기'로도 출석 (2026-11-11 담임목사 지시)
--  담임목사: "수요기도회 설교하기를 누르면 출결이 체크 되어야 합니다. 새벽기도회도 출결에 포함 시켜주세요.
--            담임 목사는 예배 인도자이기 때문에 모든 예배에 100% 참석 합니다. 김동석 목사의 출결이 100이고
--            그것을 기준으로 다른 사람들의 출결이 비율에 따라 조정 되어야 합니다."
--
--  · attend_preach(p_service) : 히어로 '설교하기'(관리자에게만 보임)를 누르면 그 예배 출석을 남긴다.
--      발표자 모드는 예배 전 카운트 때 미리 여는 일이 많아, 출석 창을 '시작 4시간 전 ~ 끝난 뒤 10분'으로 넓게 둔다.
--      인도자는 늦지 않으므로 늘 정시(late=false), method='preach'. 같은 예배를 두 번 눌러도 한 번만 남는다.
--  · attendance_basis()       : 대시보드 '나의 출석'의 분모. 출석 기록이 시작된 2026-09-27 부터 오늘(한국 시각)까지
--      '모인 예배'(누구든 한 사람이라도 출석한 예배 = 담임목사가 인도한 예배) 목록을 날짜·종류(sunday·wed·dawn)로만 돌려준다.
--      주일은 1부·2부·통합을 하루 한 번으로 센다. 주일학교는 넣지 않는다. 누가 왔는지(이름·열쇠)는 돌려주지 않는다.
--      더불어 내 교적 열쇠(나·배우자) 가운데 담임목사 열쇠가 있으면 알려 준다 → 화면은 그분을 100% 로 보여 준다.
--  · att_pastor_keys()        : 담임목사 교적 열쇠 (안에서만 씀, 화면에서 부를 수 없음)
--      = 성경 동기화 주인(sync_owners, 20260927_1100_bible_sync.sql 의 '담임목사 계정')
--        또는 직책(profiles.role, 관리자 화면에서 지정)에 '담임목사'가 든 계정의 member_links.member_key
--      바꾸려면 이 함수만 고치면 된다.
--
--  표·열은 바꾸지 않는다(함수만 새로 만든다). 실행 전에도 화면은 예전처럼 돈다:
--   대시보드는 attendance_basis 가 없으면 예전 셈(주일만), 설교하기는 attend_preach 가 없으면 attend_hero(예배 시간 안에서만)로 출석.
--
-- 실행 뒤 확인(교인 자료 본문은 보지 않고 건수만):
--   select count(*) from public.att_pastor_keys();                      -- 1 이어야 한다 (0 이면 담임목사 계정을 못 찾은 것)
--   select count(*) from json_array_elements((select public.attendance_basis())->'held');   -- SQL Editor 는 로그인이 없어 0 (화면에서 확인)
--
-- 되돌리기(함수만 지우면 화면은 예전 셈으로 돌아간다):
--   drop function if exists public.attendance_basis();
--   drop function if exists public.attend_preach(text);
--   drop function if exists public.att_pastor_keys();

begin;

-- 담임목사 교적 열쇠 — 두 군데 중 있는 곳에서 (표·열이 없으면 건너뜀)
create or replace function public.att_pastor_keys()
returns setof text language plpgsql stable security definer set search_path = public as $$
begin
  begin
    return query
      select ml.member_key from public.member_links ml
        join public.sync_owners s on s.user_id = ml.user_id
       where coalesce(ml.member_key, '') <> '';
  exception when undefined_table then null;
  end;
  begin
    return query execute
      'select ml.member_key from public.member_links ml join public.profiles p on p.id = ml.user_id
        where coalesce(ml.member_key, '''') <> '''' and coalesce(p.role, '''') like ''%담임목사%''';
  exception when undefined_table or undefined_column then null;
  end;
end $$;
revoke all on function public.att_pastor_keys() from public, anon, authenticated;

-- 대시보드 출석률의 분모: 모인 예배(날짜·종류) + 내 열쇠 가운데 담임목사 열쇠
create or replace function public.attendance_basis()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_held   json;
  v_pastor json;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  select coalesce(json_agg(json_build_object('d', u.d, 'k', u.k) order by u.d, u.k), '[]'::json) into v_held
    from (select distinct a.att_date as d,
                 case when a.service like '주일%' then 'sunday'
                      when a.service = '수요기도회' then 'wed'
                      when a.service = '새벽기도회' then 'dawn' end as k
            from public.attendance a
           where a.service <> '주일학교'
             and a.att_date between date '2026-09-27' and v_today) u
   where u.k is not null;
  select coalesce(json_agg(distinct x.k), '[]'::json) into v_pastor
    from (select mk.k from public.my_member_keys() as mk(k)
           where mk.k in (select pk.k from public.att_pastor_keys() as pk(k))) x;
  return json_build_object('ok', true, 'from', date '2026-09-27', 'today', v_today, 'held', v_held, 'pastor', v_pastor);
end $$;
revoke all on function public.attendance_basis() from public, anon;
grant execute on function public.attendance_basis() to authenticated;

-- 설교하기 → 출석 (관리자만. 예배 요일에, 시작 4시간 전 ~ 끝난 뒤 10분)
create or replace function public.attend_preach(p_service text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_now timestamp := (now() at time zone 'Asia/Seoul');
  v_min int := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  v_dow int := extract(dow from v_now)::int;
  w record; m record; v_id bigint;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  if not exists (select 1 from public.admins a where a.uid = auth.uid()) then return json_build_object('ok', false, 'why', 'admin'); end if;
  select * into w from public.att_window(p_service);
  if w.start_min is null then return json_build_object('ok', false, 'why', 'service'); end if;
  if (w.dow >= 0 and v_dow <> w.dow) or (w.dow = -1 and v_dow = 0)
     or v_min < w.start_min - 240 or v_min > w.end_min + 10 then
    return json_build_object('ok', false, 'why', 'time');
  end if;
  select ml.member_key, ml.member_name into m from public.member_links ml where ml.user_id = auth.uid();
  if m.member_key is null or m.member_key = '' then return json_build_object('ok', false, 'why', 'member'); end if;
  insert into public.attendance (att_date, service, member_key, member_name, user_id, method, late, late_min, created_by)
  values (v_now::date, p_service, m.member_key, coalesce(m.member_name, ''), auth.uid(), 'preach', false, 0, '')
  on conflict (att_date, service, member_key) do nothing
  returning id into v_id;
  return json_build_object('ok', true, 'already', v_id is null, 'late', false, 'late_min', 0, 'service', p_service, 'name', m.member_name);
end $$;
revoke all on function public.attend_preach(text) from public, anon;
grant execute on function public.attend_preach(text) to authenticated;

commit;
