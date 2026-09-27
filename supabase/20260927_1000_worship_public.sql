-- 오늘의 예배를 로그인하지 않은 사람도 보도록 (2026-09-27 담임목사 지시)
--  · worship_published: 제목·본문·찬송·교독문·설교자만 있는 뷰 (원고·기도문 없음) → anon 에도 읽기 허용
--  · worship_edits: 담임목사 편집본 → anon 에도 읽기 허용 (쓰기는 그대로 admins 만)
-- 되돌리기:
--   revoke select on public.worship_published from anon;
--   drop policy if exists worship_edits_read_anon on public.worship_edits; revoke select on public.worship_edits from anon;
grant select on public.worship_published to anon;
drop policy if exists worship_edits_read_anon on public.worship_edits;
create policy worship_edits_read_anon on public.worship_edits for select to anon using (true);
grant select on public.worship_edits to anon;
