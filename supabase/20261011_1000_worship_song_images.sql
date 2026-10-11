-- 찬양곡 악보·가사 파일 올리기 (2026-10-11 담임목사 지시)
--  · 성가대 찬양처럼 찬송가·모두의 찬양에 없는 곡은 설교 매니저의 곡 고르기 창에서 파일(그림·PDF)을 끌어다 놓아 올린다.
--    예배 순서 블록(sermons.worship_order 의 JSON)에 images:[주소…] 로 저장된다 — 칼럼 변경 없음.
--  · 공개 뷰(worship_published)의 songs·conti 에 그 파일 주소(images)를 함께 내보낸다 → 오늘의 예배가 곡 슬라이드 뒤에 악보 슬라이드로 보여 준다.
--    (SQL 실행 전에는 파일이 설교 매니저에만 저장되고 성도 화면에는 나오지 않는다 — 화면은 그대로 동작)
--  · 반주자·목회자 블록은 지금처럼 걸러 낸다. 함수 두 개만 교체 — 지우는 것·칼럼 추가 없음, 비파괴.
--
-- 되돌리기: 20261009_1900_worship_roles.sql 의 worship_songs_of · worship_conti_of 부분을 다시 실행

create or replace function public.worship_songs_of(p text)
returns jsonb language plpgsql immutable as $$
declare j jsonb;
begin
  if p is null or p !~ '^\s*\[' then return null; end if;
  begin j := p::jsonb; exception when others then return null; end;
  return (select jsonb_agg(jsonb_build_object('label', k, 'detail', e->>'detail', 'jnos', coalesce(e->'jnos', '[]'::jsonb), 'items', coalesce(e->'items', '[]'::jsonb),
                                              'images', case when jsonb_typeof(e->'images') = 'array' then e->'images' else '[]'::jsonb end) order by n)
          from (select e, n, case
                  when replace(e->>'label', ' ', '') ~ '^(경배와찬양|예배전찬양)' then '경배와 찬양'
                  when replace(e->>'label', ' ', '') ~ '^예배찬양' then '예배 찬양'
                  when replace(e->>'label', ' ', '') ~ '^입례' then '입례송'
                  when replace(e->>'label', ' ', '') ~ '^성가(대찬양|곡|대)?$' then '성가대 찬양' end as k
                from jsonb_array_elements(j) with ordinality as t(e, n)
                where coalesce(e->>'aud', 'all') not in ('accomp', 'pastor')) x
          where k is not null);
end $$;

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
            'images', case when jsonb_typeof(e->'images') = 'array' and jsonb_array_length(e->'images') > 0 then e->'images' end,
            'detail', case when replace(coalesce(e->>'label', ''), ' ', '') ~ '^(교독|성시교독)' then e->>'detail' end
          )) order by n)
          from jsonb_array_elements(j) with ordinality as t(e, n)
          where jsonb_typeof(e) = 'object' and coalesce(e->>'label', '') <> '' and not coalesce((e->>'noexport')::boolean, false)
            and coalesce(e->>'aud', 'all') not in ('accomp', 'pastor'));
end $$;
