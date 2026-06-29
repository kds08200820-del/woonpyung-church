-- 설교 기록에 예배 정보(교독문·찬송가) 저장용 컬럼
alter table public.sermons add column if not exists gyodok text;  -- 교독문 (예: 23. 시편 23편)
alter table public.sermons add column if not exists hymns  text;  -- 찬송가 번호 목록 (예: 1,305,391)
alter table public.sermons add column if not exists praise text;  -- 찬양곡 업로드 JSON: [{"title":"...","url":"..."}]
alter table public.sermons add column if not exists worship_order text;  -- 예배 순서 JSON: [{"label":"...","detail":"...","url":"..."}]
alter table public.sermons add column if not exists bible_text text;  -- 설교 성경 본문 전문 (개역개정 — 새벽기도회/주일 등)
alter table public.sermons add column if not exists qt_bible_text text;  -- QT 전용 성경 본문 (우리말성경)

-- 홈페이지 '오늘의 말씀(QT)' 공개 뷰: 매일 QT 중 오늘까지 게시된 글만 anon 에 노출
drop view if exists public.qt_published;
create view public.qt_published as
  select sermon_date, title, scripture, qt_bible_text, content
  from public.sermons
  where service = '매일 QT'
    and sermon_date is not null
    and sermon_date <= current_date
  order by sermon_date desc;
grant select on public.qt_published to anon, authenticated;
