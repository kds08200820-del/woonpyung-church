-- 오늘의 예배(홈페이지 히어로·예배순서 보관함)가 읽는 정회원용 뷰
--  · 설교 매니저(sermons)에 저장한 찬송가(hymns "7,570")·교독문(gyodok "46. 시편 104편")·제목·본문 구절을
--    새벽기도회(매일 QT)·수요기도회 순서에 넣기 위한 것. 주일 낮 예배 찬송은 주보(js/bulletins.js)에서 온다.
--  · 로그인한 사용자(authenticated)만 읽을 수 있다. anon 에는 열지 않는다 — 홈페이지 쪽 정회원 확인은 js/worship.js 가 한다.
--  · 설교 원고(content)·기도문(prayer)은 내보내지 않는다. 본문 글(bible_text)도 내보내지 않는다 — 홈페이지는 구절(scripture)로 개역개정을 직접 편다.
--  · 날짜는 한국 시각 기준 오늘까지만 (qt_published 와 같은 규칙).
--  · 비파괴: 뷰 하나 만들기만 한다.
--
-- 되돌리기:
--   drop view if exists public.worship_published;

drop view if exists public.worship_published;
create view public.worship_published as
  select id, sermon_date, service, title, scripture, hymns, gyodok, preacher
  from public.sermons
  where service in ('매일 QT', '새벽기도', '수요기도회', '금요기도회', '주일 낮 예배', '주일 밤 예배', '특별집회')
    and sermon_date is not null
    and sermon_date <= (now() at time zone 'Asia/Seoul')::date
  order by sermon_date desc;

revoke all on public.worship_published from anon;
grant select on public.worship_published to authenticated;
