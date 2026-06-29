-- 설교 기록에 예배 정보(교독문·찬송가) 저장용 컬럼
alter table public.sermons add column if not exists gyodok text;  -- 교독문 (예: 23. 시편 23편)
alter table public.sermons add column if not exists hymns  text;  -- 찬송가 번호 목록 (예: 1,305,391)
