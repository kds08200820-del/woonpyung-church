-- 오늘의 예배: 설교 매니저의 '예배 순서(콘티)'를 그대로 따르게 한다 (2026-09-29 담임목사 지시)
--  · 설교 매니저 정보 칸의 순서 블록(예배 전 찬양 → 찬양 → 성경봉독 → 말씀 → 찬양 …)은 sermons.worship_order 에 저장된다.
--  · 그 순서를 worship_published.conti 로 내보낸다 — 각 블록의 이름(label)·곡(items·hno)만.
--    기도문·소식 같은 전문(body)과 자세한 글(detail)은 내보내지 않는다. 교독문만 번호를 위해 detail 을 내보낸다.
--  · 비파괴: 함수 하나 + 뷰 끝에 칸 하나 덧붙이기(기존 칸 그대로).
-- 되돌리기:
--   20260927_1900_worship_songs.sql 의 create or replace view public.worship_published 부분을 다시 실행
--   (뷰에서 칸을 빼려면 drop view 후 다시 만들어야 하므로: drop view public.worship_published; 그 파일의 뷰 부분 실행;
--    20260927_1000_worship_public.sql 의 grant select on public.worship_published to anon; 다시 실행)
--   drop function if exists public.worship_conti_of(text);

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
          where jsonb_typeof(e) = 'object' and coalesce(e->>'label', '') <> '' and not coalesce((e->>'noexport')::boolean, false));
end $$;

create or replace view public.worship_published as
  select id, sermon_date, service, title, scripture, hymns, gyodok, preacher,
         public.worship_songs_of(worship_order) as songs,
         public.worship_conti_of(worship_order) as conti
  from public.sermons
  where service in ('매일 QT', '새벽기도', '수요기도회', '금요기도회', '주일 낮 예배', '주일 밤 예배', '특별집회')
    and sermon_date is not null
    and sermon_date <= (now() at time zone 'Asia/Seoul')::date
  order by sermon_date desc;
