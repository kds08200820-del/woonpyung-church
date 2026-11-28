-- ============================================================
--  대표기도: 예배 순서에서 기도자를 바꾼 주일은 명단의 예전 기도자 대시보드에 뜨지 않게 (2026-11-28 담임목사 지시)
--
--  · 예배 매니저에서 '기도' 칸에 직접 다른 분(예: 원로장로님)을 적으면, 그 주일 worship_prayers 행의 person 이 새 기도자로 바뀐다
--    (권사님이 아니면 body 는 빈 채로). 지금까지 my_rep_prayers() 는 명단(봉사위원)만 보고 '아직 기도문이 없는 내 차례'를 만들어서,
--    명단의 예전 권사님에게 그 주일이 계속 떴다. → 그 주일 행이 다른 기도자 이름이면 명단 차례에서 뺀다.
--  · 비파괴 변경: 함수 본문만 바꾼다(create or replace). 표·자료는 그대로.
--
--  되돌리기: supabase/20261114_0930_worship_rep_prayers.sql 의 my_rep_prayers() 를 다시 실행
-- ============================================================

create or replace function public.my_rep_prayers()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_items json;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'why', 'login');
  end if;
  select public.rep_person_name(ml.member_name) into v_name
    from public.member_links ml where ml.user_id = v_uid;
  if coalesce(v_name, '') = '' then
    return json_build_object('ok', true, 'name', null, 'today', v_today, 'items', '[]'::json);
  end if;

  with plan as (
    select s.sdate, btrim(p->>'person') as person
      from (select (v_today + g)::date as sdate from generate_series(0, 62) g) s
      join public.church_settings cs on cs.key = 'committees'
      cross join lateral jsonb_array_elements(case when jsonb_typeof(cs.data->'months') = 'array' then cs.data->'months' else '[]'::jsonb end) m
      cross join lateral jsonb_array_elements(case when jsonb_typeof(m->'prayer') = 'array' then m->'prayer' else '[]'::jsonb end) p
     where extract(dow from s.sdate) = 0
       and m->>'month' = to_char(s.sdate, 'YYYY-MM')
       and substring(coalesce(p->>'week', '') from '(\d+)\s*주')::int = (extract(day from s.sdate)::int - 1) / 7 + 1
  ), mine as (
    select wp.sdate, wp.person, wp.body, wp.source
      from public.worship_prayers wp
     where wp.service = '주일 낮 예배'
       and btrim(wp.body) <> ''
       and public.rep_person_name(wp.person) = v_name
    union all
    select pl.sdate, pl.person, null::text, null::text
      from plan pl
     where public.rep_person_name(pl.person) = v_name
       and not exists (select 1 from public.worship_prayers w
                        where w.sdate = pl.sdate and w.service = '주일 낮 예배'
                          and (btrim(w.body) <> '' or public.rep_person_name(w.person) <> v_name))
  )
  select coalesce(json_agg(json_build_object(
           'sdate', x.sdate, 'person', x.person, 'body', x.body, 'source', x.source,
           'title', sm.title, 'scripture', sm.scripture) order by x.sdate desc), '[]'::json)
    into v_items
    from mine x
    left join lateral (
      select s2.title, s2.scripture from public.sermons s2
       where s2.service = '주일 낮 예배' and s2.sermon_date = x.sdate
       order by s2.created_at limit 1) sm on true;

  return json_build_object('ok', true, 'name', v_name, 'today', v_today, 'items', v_items);
end $$;

revoke all on function public.my_rep_prayers() from public, anon;
grant execute on function public.my_rep_prayers() to authenticated;
