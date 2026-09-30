-- 오늘의 예배: 새벽·수요·금요 기도회 '말씀' 화면에 설교 요약을 띄운다 (2026-09-30 담임목사 지시)
--  · 설교 매니저 예배 순서(콘티)의 '말씀' 블록을 누르면 설교 요약 칸이 펼쳐지고, 그 글은 sermons.summary 에 저장된다(칸은 이미 있음).
--  · 그 요약을 worship_published.summary 로 내보낸다 — 원고·기도문은 여전히 내보내지 않는다.
--  · 비파괴: 뷰 끝에 칸 하나 덧붙이기(기존 칸·조건·권한 그대로, create or replace view 는 권한을 유지한다).
-- 되돌리기:
--   20260929_1400_worship_conti.sql 의 create or replace view public.worship_published 부분을 다시 실행
--   (뷰에서 칸을 빼려면 drop view 후 다시 만들어야 하므로: drop view public.worship_published; 그 파일의 뷰 부분 실행;
--    20260926_1500_worship_published.sql 의 grant select on public.worship_published to authenticated;
--    20260927_1000_worship_public.sql 의 grant select on public.worship_published to anon; 다시 실행)
--   ※ drop 은 사람이 직접 실행

create or replace view public.worship_published as
  select id, sermon_date, service, title, scripture, hymns, gyodok, preacher,
         public.worship_songs_of(worship_order) as songs,
         public.worship_conti_of(worship_order) as conti,
         summary
  from public.sermons
  where service in ('매일 QT', '새벽기도', '수요기도회', '금요기도회', '주일 낮 예배', '주일 밤 예배', '특별집회')
    and sermon_date is not null
    and sermon_date <= (now() at time zone 'Asia/Seoul')::date
  order by sermon_date desc;
