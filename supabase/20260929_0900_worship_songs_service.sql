-- 오늘의 예배: 수요기도회 등의 '예배 찬양'(예배 중 부르는 찬양 2~3곡)도 읽게 한다 (2026-09-29 담임목사 지시)
--  · 설교 매니저 '🎤 예배 찬양' 칸(worship_order 의 label '예배 찬양')을 worship_published.songs 에 함께 내보낸다.
--  · 20260927_1900_worship_songs.sql 의 함수에 한 줄('^예배찬양' → '예배 찬양')만 더한다. 뷰는 그대로(함수만 바꾸면 반영).
--  · 비파괴: 함수 교체만.
-- 되돌리기: 20260927_1900_worship_songs.sql 의 create or replace function public.worship_songs_of 부분을 다시 실행

create or replace function public.worship_songs_of(p text)
returns jsonb language plpgsql immutable as $$
declare j jsonb;
begin
  if p is null or p !~ '^\s*\[' then return null; end if;
  begin j := p::jsonb; exception when others then return null; end;
  -- 이름이 조금 달라도(경배와찬양·예배 전 찬양·성가곡 …) 네 자리로 맞춘다
  return (select jsonb_agg(jsonb_build_object('label', k, 'detail', e->>'detail', 'jnos', coalesce(e->'jnos', '[]'::jsonb), 'items', coalesce(e->'items', '[]'::jsonb)) order by n)
          from (select e, n, case
                  when replace(e->>'label', ' ', '') ~ '^(경배와찬양|예배전찬양)' then '경배와 찬양'
                  when replace(e->>'label', ' ', '') ~ '^예배찬양' then '예배 찬양'
                  when replace(e->>'label', ' ', '') ~ '^입례' then '입례송'
                  when replace(e->>'label', ' ', '') ~ '^성가(대찬양|곡|대)?$' then '성가대 찬양' end as k
                from jsonb_array_elements(j) with ordinality as t(e, n)) x
          where k is not null);
end $$;
