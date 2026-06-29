-- 설교 기록에 예배 정보(교독문·찬송가) 저장용 컬럼
alter table public.sermons add column if not exists gyodok text;  -- 교독문 (예: 23. 시편 23편)
alter table public.sermons add column if not exists hymns  text;  -- 찬송가 번호 목록 (예: 1,305,391)
alter table public.sermons add column if not exists praise text;  -- 찬양곡 업로드 JSON: [{"title":"...","url":"..."}]
alter table public.sermons add column if not exists worship_order text;  -- 예배 순서 JSON: [{"label":"...","detail":"...","url":"..."}]
alter table public.sermons add column if not exists bible_text text;  -- 설교 성경 본문 전문 (담임목사 직접 입력, 원고 위에 표시)
