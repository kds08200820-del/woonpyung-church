-- 신청서 '사람 이름표' 고르기 (2026-10-24 담임목사 지시)
--  책 신청처럼 '참가자'가 맞지 않는 신청서를 위해, 신청서를 만들 때 이름표(참가자 · 신청자 · 수령자 …)를 정한다.
--  · app_forms.people_label : 신청 화면·신청 확인·명단·엑셀에서 '참가자' 대신 쓰는 말. 기본 '참가자'(기존 신청서는 그대로).
--  · 비파괴: 칸 하나 추가(DEFAULT 있음). 지우는 것 없음. 이 SQL 을 실행하기 전에도 화면은 '참가자'로 잘 돌아간다.
--
-- 되돌리기 (DROP 대신 RENAME):
--   alter table public.app_forms rename column people_label to people_label_archived;
--   (화면은 이 칸이 없으면 '참가자'로 돌아간다. 칸 자체를 지우는 일은 4주 뒤 백업 확인 후 사람이 한다.)

alter table public.app_forms
  add column if not exists people_label text not null default '참가자'
  check (char_length(btrim(people_label)) between 1 and 12);
