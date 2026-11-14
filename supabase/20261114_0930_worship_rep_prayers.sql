-- ============================================================
--  주일 낮 예배 대표기도문 (2026-11-14 담임목사 지시)
--
--  · 설정 → 연간 봉사위원의 '이주의 기도'(church_settings key='committees' → months[].prayer[{week:'N주', person}])에서
--    권사님 차례인 주일의 대표기도문을 이 표에 둔다. 장로님 차례는 기도문을 만들지 않는다.
--  · 기도문은 예배 매니저(affairs.js)가 js/rep-prayer.js 로 만든다 — 그 주일의 절기·계절과 설교(제목·본문)를 넣고,
--    자동(source='auto')인 동안은 절기·설교가 바뀌면 다시 만든다. 목사님이 고치면 'edit', 기존 문서에서 넣으면 'import'.
--  · 권사님은 대시보드에서 my_rep_prayers() 로 '내 차례'의 기도문만 본다 — 교적 이름(member_links.member_name)으로 맞춘다.
--    아직 저장된 기도문이 없는 앞으로의 차례는 날짜·기도자·그 주일 설교만 돌려주고, 대시보드가 같은 생성기로 보여 준다.
--  · 표는 관리자만 읽고 쓴다(교인 화면은 함수로만).
--
--  비파괴 변경만 있다(새 표·새 함수). 정책은 다시 실행해도 되도록 drop policy if exists → create.
--
--  되돌리기(참고 — 삭제 정책에 따라 RENAME):
--    revoke execute on function public.my_rep_prayers() from authenticated;
--    alter table public.worship_prayers rename to worship_prayers_archived;
-- ============================================================

create table if not exists public.worship_prayers (
  sdate      date not null,                                   -- 주일
  service    text not null default '주일 낮 예배',
  person     text not null default '',                        -- '차영선 권사'
  body       text not null default '',                        -- 기도문
  source     text not null default 'auto'
             check (source in ('auto', 'edit', 'import')),    -- auto 자동 · edit 목사님이 고침 · import 문서에서 가져옴
  variant    integer not null default 0,                      -- '다시 만들기' 번호
  updated_at timestamptz not null default now(),
  primary key (sdate, service)
);

comment on table public.worship_prayers is
  '주일 낮 예배 대표기도문 — 봉사위원 이주의 기도(권사) 차례마다 1편. 관리자만 읽고 쓰며, 권사님은 my_rep_prayers()로 자기 것만 본다';

alter table public.worship_prayers enable row level security;
drop policy if exists worship_prayers_admin on public.worship_prayers;
create policy worship_prayers_admin on public.worship_prayers for all
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
revoke all on public.worship_prayers from anon;
grant select, insert, update on public.worship_prayers to authenticated;

-- '차영선 권사님' → '차영선' (js/rep-prayer.js nameOf 와 같은 규칙)
create or replace function public.rep_person_name(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(btrim(coalesce(p, '')), '\s*(안수집사|권사|장로|집사|목사|전도사|성도|권찰)\s*님?\s*$', ''),
           '\s+', '', 'g')
$$;

-- 내 대표기도 — 저장된 내 기도문(지난 것 포함) + 앞으로 9주 안의 내 차례 중 아직 기도문이 없는 날
--   { ok, name, today, items:[{ sdate, person, body|null, source|null, title, scripture }] } (최근 날짜부터)
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
                        where w.sdate = pl.sdate and w.service = '주일 낮 예배' and btrim(w.body) <> '')
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
