-- 20261110_2100_finance_holiday_category_and_1108_date.sql
-- 담임목사 지시(2026-11-10): "명절 가정 감사 항목을 만들어 넣으세요. 11월 8일자로 변경 저장하세요."
--   1) 명절 가정 감사: 엑셀 자동입력이 띄어쓰기 든 항목을 못 읽어 앞 항목에 붙였던 24건(1,700,000원)의 항목을 바로잡는다.
--      · 2026-09-27 생일감사 → 명절 가정 감사 23건 1,600,000원 (id 3819~3841)
--      · 2026-10-04 주일헌금 → 명절 가정 감사  1건   100,000원 (id 3927)
--      오직의 그 주 「명절 가정 감사」 명단과 헌금자·금액이 모두 같은 행만 골랐다. 금액·헌금자·교적 연결은 건드리지 않는다.
--      (계정과목 「명절 가정 감사」 1020600 은 20261110_1700 에서 이미 만들어졌다.)
--   2) 11/8 주일분이 2026-11-15 일자로 들어간 것을 2026-11-08 로 고친다(헌금 106건 · 지출 6건).
-- 파괴적 변경 없음: UPDATE 뿐.
--
-- 되돌리는 방법:
--   update public.offerings set category = '생일감사' where id between 3819 and 3841 and offer_date = '2026-09-27' and category = '명절 가정 감사';
--   update public.offerings set category = '주일헌금' where id = 3927 and offer_date = '2026-10-04' and category = '명절 가정 감사';
--   update public.offerings set offer_date = '2026-11-15' where offer_date = '2026-11-08';
--   update public.expenses  set exp_date  = '2026-11-15' where exp_date  = '2026-11-08';
--
-- 두 번 실행해도 결과가 같다.

begin;

update public.offerings set category = '명절 가정 감사'
 where id in (3819, 3820, 3821, 3822, 3823, 3824, 3825, 3826, 3827, 3828, 3829, 3830, 3831, 3832, 3833, 3834, 3835, 3836, 3837, 3838, 3839, 3840, 3841)
   and offer_date = '2026-09-27' and category = '생일감사';

update public.offerings set category = '명절 가정 감사'
 where id = 3927 and offer_date = '2026-10-04' and category = '주일헌금';

update public.offerings set offer_date = '2026-11-08' where offer_date = '2026-11-15';
update public.expenses  set exp_date  = '2026-11-08' where exp_date  = '2026-11-15';

commit;

-- 실행 뒤 확인(건수·합계만):
--   select offer_date, category, count(*), sum(amount) from public.offerings
--    where category = '명절 가정 감사' and offer_date in ('2026-09-27', '2026-10-04') group by 1, 2;
--   기대: 09-27 23건 1,600,000 · 10-04 1건 100,000
--   select (select count(*) from public.offerings where offer_date = '2026-11-08') as off_n,   -- 106
--          (select count(*) from public.expenses  where exp_date  = '2026-11-08') as exp_n;   -- 6
