-- 오늘의 예배: 설교 매니저(주일 낮 예배)에 넣은 '경배와 찬양(예배 전 찬양)·입례송·성가대 찬양' 곡을 읽게 한다 (2026-09-27)
--  · sermons.worship_order(JSON 글) 가운데 이 세 항목만 골라 worship_published.songs 로 내보낸다.
--    기도문·소식 같은 다른 순서의 전문(body)은 내보내지 않는다.
--  · 글이 JSON 이 아니어도 뷰 전체가 깨지지 않도록 안전하게 읽는 함수를 쓴다.
--  · 비파괴: 함수 하나 + 뷰에 칸 하나 덧붙이기.
-- 되돌리기: 20260926_1500_worship_published.sql 을 다시 실행하고 drop function public.worship_songs_of(text);

create or replace function public.worship_songs_of(p text)
returns jsonb language plpgsql immutable as $$
declare j jsonb;
begin
  if p is null or p !~ '^\s*\[' then return null; end if;
  begin j := p::jsonb; exception when others then return null; end;
  -- 이름이 조금 달라도(경배와찬양·예배 전 찬양·성가곡 …) 세 자리로 맞춘다
  return (select jsonb_agg(jsonb_build_object('label', k, 'detail', e->>'detail', 'jnos', coalesce(e->'jnos', '[]'::jsonb), 'items', coalesce(e->'items', '[]'::jsonb)) order by n)
          from (select e, n, case
                  when replace(e->>'label', ' ', '') ~ '^(경배와찬양|예배전찬양)' then '경배와 찬양'
                  when replace(e->>'label', ' ', '') ~ '^입례' then '입례송'
                  when replace(e->>'label', ' ', '') ~ '^성가(대찬양|곡|대)?$' then '성가대 찬양' end as k
                from jsonb_array_elements(j) with ordinality as t(e, n)) x
          where k is not null);
end $$;

create or replace view public.worship_published as
  select id, sermon_date, service, title, scripture, hymns, gyodok, preacher,
         public.worship_songs_of(worship_order) as songs
  from public.sermons
  where service in ('매일 QT', '새벽기도', '수요기도회', '금요기도회', '주일 낮 예배', '주일 밤 예배', '특별집회')
    and sermon_date is not null
    and sermon_date <= (now() at time zone 'Asia/Seoul')::date
  order by sermon_date desc;
