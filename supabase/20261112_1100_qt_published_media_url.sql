-- ============================================================
--  매일 QT 공개 뷰에 영상 주소(media_url) 칼럼 추가  (2026-11-12, 1회 실행)
--
--  · 교회 PC 가 매일 QT 모션 영상을 유튜브에 올리고 그 주소를 sermons.media_url 에 넣는다
--    (tools/qt_motion/qt_motion.py). 홈페이지 '오늘의 말씀' 이 그 주소를 읽어
--    「오늘의 말씀 영상」 단추를 보이게 하려면 공개 뷰에 이 칼럼이 있어야 한다.
--  · 비파괴 변경: 뷰 맨 끝에 칼럼 하나를 더할 뿐이다. 기존 칼럼의 이름·순서·조건은 그대로.
--    (create or replace view 는 끝에 칼럼을 더하는 것만 허용하므로 drop 이 필요 없다.)
--  · 날짜 조건(한국 시각 오늘까지만 공개)은 그대로라서, 미리 만들어 둔 내일 영상의 주소는
--    그날이 되기 전까지 밖에 보이지 않는다 — QT 글·음성과 같은 때 열린다.
--
--  되돌리는 방법 (칼럼을 빼려면 뷰를 다시 만들어야 한다 — 사람이 직접 실행):
--    drop view if exists public.qt_published;
--    create view public.qt_published as
--      select sermon_date, title, scripture,
--             coalesce(nullif(btrim(qt_bible_text), ''), bible_text) as qt_bible_text,
--             content, prayer
--      from public.sermons
--      where service = '매일 QT' and sermon_date is not null
--        and sermon_date <= (now() at time zone 'Asia/Seoul')::date
--      order by sermon_date desc;
--    grant select on public.qt_published to anon, authenticated;
-- ============================================================

create or replace view public.qt_published as
  select sermon_date, title, scripture,
         coalesce(nullif(btrim(qt_bible_text), ''), bible_text) as qt_bible_text,
         content, prayer,
         media_url
  from public.sermons
  where service = '매일 QT'
    and sermon_date is not null
    and sermon_date <= (now() at time zone 'Asia/Seoul')::date
  order by sermon_date desc;

grant select on public.qt_published to anon, authenticated;
