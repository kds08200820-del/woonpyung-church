-- ============================================================
--  운평장로교회 — 구제선교위원회 후원 기관에 화성서부경찰서 경목회 추가 (2026-11-14 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전 — 같은 이름이 있으면 더하지 않는다)
--
--  목사님: "기관 후원에 화성서부경찰서 로고를 포함해서 넣어 주세요." "화성서부경찰서 경목회라고 표기하세요."
--  로고 파일: 저장소 images/partners/hwaseong-seobu-police.jpg (경찰서 홈페이지의 로고 그림, 166×55)
--  비파괴: INSERT 한 줄뿐.
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    화면의 「숨기기」 또는  update public.mission_partners set active = false where name = '화성서부경찰서 경목회';
-- ============================================================

insert into public.mission_partners (kind, name, summary, person, address, url, logo_url, sort)
select '기관', '화성서부경찰서 경목회', '경찰 선교', '', '', 'https://www.ggpolice.go.kr/hssb/index.do',
       'images/partners/hwaseong-seobu-police.jpg', 210
 where not exists (select 1 from public.mission_partners where name = '화성서부경찰서 경목회');

-- 실행 뒤 확인(건수만):
--   select count(*) from public.mission_partners where name = '화성서부경찰서 경목회' and active;   -- 1
