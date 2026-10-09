-- 오늘의 예배를 권한별로 — 반주자·목회자 (2026-10-09 담임목사 지시)
--  · member_links.can_accompany(반주자) · can_pastor(목회자): 관리자가 교적관리 > 권한 관리에서 지명한다 (방송실 관리자와 같은 방식)
--    관리자(admins)는 따로 지명하지 않아도 목회자 화면을 본다.
--  · 설교 매니저(주일 낮 예배)의 예배 순서(sermons.worship_order) 블록마다 보는 사람(aud)을 단다
--      aud 없음·'all' = 모두(주보 순서) · 'accomp' = 반주자만(기도송·헌금송·폐회송 악보) · 'pastor' = 목회자만(설교 전 기도·헌금 기도 등)
--    블록의 전문(body = 기도문·메모)은 지금처럼 공개 뷰로 내보내지 않는다 — 목회자만 받는다.
--  · 공개 뷰(worship_published)의 conti·songs 에서 반주자·목회자 블록을 뺀다 → 성도 화면·로그인 전 화면에 나오지 않는다.
--  · 반주자·목회자는 새 함수 worship_role_order(날짜) 로 자기 블록을 받는다 (security definer, 본인 권한을 확인)
--      - 목회자(관리자 포함): 목회자 블록 + 모든 블록의 전문(body)
--      - 반주자: 반주자 블록(곡 번호·악보 그림 주소·메모)
--      - 모두 블록은 이름(label)만 — 반주자·목회자 블록을 주보 순서의 어느 자리에 끼울지 정하는 데 쓴다
--      - 그 주 순서를 설교 매니저에서 아직 짜지 않았으면, 가장 최근에 짠 주일의 📌 고정 블록을 그대로 돌려준다(기도송·헌금송은 한 해 내내 같다)
--  · 비파괴: 칼럼 2개 추가(기본값 false) + 함수 교체·추가. 지우는 것 없음.
--
-- 되돌리기:
--   drop function if exists public.worship_role_order(date, text);
--   drop function if exists public.set_worship_role(uuid, text, boolean);
--   20260927_1200_broadcast_admin.sql 의 list_access · broadcast_access 부분을 다시 실행
--   20260929_0900_worship_songs_service.sql 의 worship_songs_of, 20260929_1400_worship_conti.sql 의 worship_conti_of 부분을 다시 실행
--   alter table public.member_links rename column can_accompany to can_accompany_archived;   (DROP 대신 RENAME)
--   alter table public.member_links rename column can_pastor to can_pastor_archived;

alter table public.member_links add column if not exists can_accompany boolean not null default false;
alter table public.member_links add column if not exists can_pastor boolean not null default false;

-- 권한 목록(관리자만) — canAccompany · canPastor 추가 (나머지는 20260927_1200 과 같다)
create or replace function public.list_access()
returns json language sql security definer set search_path = public as $$
  select coalesce(json_agg(row), '[]'::json) from (
    select json_build_object(
      'uid', p.id, 'name', coalesce(l.member_name, p.name, ''), 'email', coalesce(p.email,''),
      'status', coalesce(l.member_status,'준회원'), 'canFinance', coalesce(l.can_finance,false),
      'canBroadcast', coalesce(l.can_broadcast,false),
      'canAccompany', coalesce(l.can_accompany,false),
      'canPastor', coalesce(l.can_pastor,false),
      'isAdmin', exists(select 1 from public.admins a where a.uid = p.id)
    ) as row
    from public.profiles p left join public.member_links l on l.user_id = p.id
    where exists(select 1 from public.admins where uid = auth.uid())
    order by exists(select 1 from public.admins a where a.uid = p.id) desc, coalesce(l.member_name, p.name)
  ) t;
$$;

-- 반주자·목회자 지명/해제 (관리자만) — p_role: 'accompany' | 'pastor'
create or replace function public.set_worship_role(p_uid uuid, p_role text, p_on boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.admins where uid = auth.uid()) then
    return json_build_object('ok', false, 'error', '관리자만 지명할 수 있습니다.');
  end if;
  if p_role = 'accompany' then
    insert into public.member_links(user_id, can_accompany, updated_at) values (p_uid, coalesce(p_on,false), now())
    on conflict (user_id) do update set can_accompany = coalesce(p_on,false), updated_at = now();
  elsif p_role = 'pastor' then
    insert into public.member_links(user_id, can_pastor, updated_at) values (p_uid, coalesce(p_on,false), now())
    on conflict (user_id) do update set can_pastor = coalesce(p_on,false), updated_at = now();
  else
    return json_build_object('ok', false, 'error', '알 수 없는 권한입니다.');
  end if;
  return json_build_object('ok', true);
end $$;
revoke all on function public.set_worship_role(uuid, text, boolean) from public, anon;
grant execute on function public.set_worship_role(uuid, text, boolean) to authenticated;

-- 내 권한 — { isAdmin, canBroadcast, canAccompany, canPastor } (본인 것만). 머리글 이름 아래 표기·오늘의 예배가 쓴다
create or replace function public.broadcast_access()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'isAdmin', exists(select 1 from public.admins where uid = auth.uid()),
    'canBroadcast', coalesce((select can_broadcast from public.member_links where user_id = auth.uid()), false),
    'canAccompany', coalesce((select can_accompany from public.member_links where user_id = auth.uid()), false),
    'canPastor', coalesce((select can_pastor from public.member_links where user_id = auth.uid()), false)
  );
$$;
revoke all on function public.broadcast_access() from public;
grant execute on function public.broadcast_access() to authenticated;

-- 공개 뷰의 찬양 자리(songs) — 반주자·목회자 블록은 뺀다 (나머지는 20260929_0900 과 같다)
create or replace function public.worship_songs_of(p text)
returns jsonb language plpgsql immutable as $$
declare j jsonb;
begin
  if p is null or p !~ '^\s*\[' then return null; end if;
  begin j := p::jsonb; exception when others then return null; end;
  return (select jsonb_agg(jsonb_build_object('label', k, 'detail', e->>'detail', 'jnos', coalesce(e->'jnos', '[]'::jsonb), 'items', coalesce(e->'items', '[]'::jsonb)) order by n)
          from (select e, n, case
                  when replace(e->>'label', ' ', '') ~ '^(경배와찬양|예배전찬양)' then '경배와 찬양'
                  when replace(e->>'label', ' ', '') ~ '^예배찬양' then '예배 찬양'
                  when replace(e->>'label', ' ', '') ~ '^입례' then '입례송'
                  when replace(e->>'label', ' ', '') ~ '^성가(대찬양|곡|대)?$' then '성가대 찬양' end as k
                from jsonb_array_elements(j) with ordinality as t(e, n)
                where coalesce(e->>'aud', 'all') not in ('accomp', 'pastor')) x
          where k is not null);
end $$;

-- 공개 뷰의 예배 순서(conti) — 반주자·목회자 블록은 뺀다 (나머지는 20260929_1400 과 같다)
create or replace function public.worship_conti_of(p text)
returns jsonb language plpgsql immutable as $$
declare j jsonb;
begin
  if p is null or p !~ '^\s*\[' then return null; end if;
  begin j := p::jsonb; exception when others then return null; end;
  if jsonb_typeof(j) <> 'array' then return null; end if;
  return (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'label', e->>'label',
            'items', case when jsonb_typeof(e->'items') = 'array' then e->'items' end,
            'jnos',  case when jsonb_typeof(e->'jnos') = 'array' then e->'jnos' end,
            'hno',   e->>'hno',
            'detail', case when replace(coalesce(e->>'label', ''), ' ', '') ~ '^(교독|성시교독)' then e->>'detail' end
          )) order by n)
          from jsonb_array_elements(j) with ordinality as t(e, n)
          where jsonb_typeof(e) = 'object' and coalesce(e->>'label', '') <> '' and not coalesce((e->>'noexport')::boolean, false)
            and coalesce(e->>'aud', 'all') not in ('accomp', 'pastor'));
end $$;

-- 반주자·목회자의 그날 예배 블록
--   돌려주는 것: { isAdmin, pastor, accomp, date(쓴 기록의 날짜), carried(지난 주일 고정 블록을 가져왔는가), order:[블록…] }
--   권한이 없으면 { isAdmin:false, pastor:false, accomp:false } 만, 로그인하지 않았으면 null
create or replace function public.worship_role_order(p_date date, p_service text default '주일 낮 예배')
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean; v_acc boolean := false; v_pas boolean := false;
  v_src text; v_date date; v_carried boolean := false; j jsonb; outj jsonb;
begin
  if auth.uid() is null then return null; end if;
  v_admin := exists(select 1 from public.admins where uid = auth.uid());
  select coalesce(l.can_accompany, false), coalesce(l.can_pastor, false) into v_acc, v_pas
    from public.member_links l where l.user_id = auth.uid();
  v_acc := coalesce(v_acc, false);
  v_pas := coalesce(v_pas, false) or v_admin;
  if not (v_admin or v_acc or v_pas) then
    return json_build_object('isAdmin', false, 'pastor', false, 'accomp', false);
  end if;

  -- 그날 기록 — 설교 매니저에서 보는 사람(aud)을 단 순서가 있을 때만 그것을 쓴다
  select s.worship_order, s.sermon_date into v_src, v_date
    from public.sermons s
   where s.service = p_service and s.sermon_date = p_date and s.worship_order like '%"aud"%'
   order by s.created_at limit 1;
  if v_src is null then
    -- 아직 짜지 않은 주: 가장 최근에 짠 같은 예배의 📌 고정 블록
    select s.worship_order, s.sermon_date into v_src, v_date
      from public.sermons s
     where s.service = p_service and s.sermon_date < p_date and s.worship_order like '%"aud"%'
     order by s.sermon_date desc, s.created_at limit 1;
    v_carried := v_src is not null;
  end if;
  if v_src is null or v_src !~ '^\s*\[' then
    return json_build_object('isAdmin', v_admin, 'pastor', v_pas, 'accomp', v_acc, 'date', null, 'carried', false, 'order', '[]'::json);
  end if;
  begin j := v_src::jsonb; exception when others then j := '[]'::jsonb; end;
  if jsonb_typeof(j) <> 'array' then j := '[]'::jsonb; end if;

  select coalesce(jsonb_agg(case
           when x.aud = 'all' then jsonb_strip_nulls(jsonb_build_object(
             'label', x.e->>'label', 'aud', 'all',
             'body', case when v_pas and (not v_carried or x.fx) then nullif(x.e->>'body', '') end))
           else jsonb_strip_nulls(jsonb_build_object(
             'label', x.e->>'label', 'aud', x.aud,
             'detail', nullif(x.e->>'detail', ''),
             'items', case when jsonb_typeof(x.e->'items') = 'array' then x.e->'items' end,
             'hno', x.e->>'hno',
             'url', nullif(x.e->>'url', ''),
             'images', case when jsonb_typeof(x.e->'images') = 'array' then x.e->'images' end,
             'body', nullif(x.e->>'body', ''),
             'fixed', x.fx))
         end order by x.n), '[]'::jsonb)
    into outj
    from (select t.e, t.n, coalesce(nullif(t.e->>'aud', ''), 'all') as aud,
                 coalesce(t.e->>'fixed', '') = 'true' as fx
            from jsonb_array_elements(j) with ordinality as t(e, n)
           where jsonb_typeof(t.e) = 'object' and coalesce(t.e->>'label', '') <> '') x
   where x.aud = 'all'
      or (x.aud = 'accomp' and (v_acc or v_admin) and (not v_carried or x.fx))
      or (x.aud = 'pastor' and v_pas and (not v_carried or x.fx));

  return json_build_object('isAdmin', v_admin, 'pastor', v_pas, 'accomp', v_acc, 'date', v_date, 'carried', v_carried, 'order', outj);
end $$;
revoke all on function public.worship_role_order(date, text) from public, anon;
grant execute on function public.worship_role_order(date, text) to authenticated;
