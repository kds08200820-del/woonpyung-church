-- 20261110_1700_budget_sync_ohjic.sql
-- 예산(budget) 표를 오직 재정 3기(2025-12-01 ~ 2026-11-30) 예산과 일치시킨다. (담임목사 지시, 2026-11-10)
--   · 계정 130개(수입 31 · 지출 99)의 코드·이름·예산·전년예산·전년결산을 오직 값으로 맞춘다.
--   · 오직에서 코드가 바뀐 계정 12개는 코드를 옮긴다(행을 새로 만들지 않는다).
--   · 오직에 없는 홈페이지 계정 7개는 지우지 않고 예산만 0 으로 둔다(삭제는 사람이 예산 화면에서).
--   · 파괴적 변경 없음: UPDATE · INSERT · 백업 표 생성뿐. 전표(offerings·expenses)는 건드리지 않는다.
--
-- 되돌리는 방법: 실행 전 상태가 public.budget_backup_20261110 에 그대로 남는다. 사람이 아래를 실행한다.
--   update public.budget b set code = k.code, name = k.name, atype = k.atype,
--          budget = k.budget, prev_budget = k.prev_budget, prev_actual = k.prev_actual
--     from public.budget_backup_20261110 k where k.id = b.id;
--   그리고 이 파일이 새로 넣은 행(백업에 없는 id)은 사람이 직접 지운다:
--     select id, code, name from public.budget where id not in (select id from public.budget_backup_20261110);
--
-- 두 번 실행해도 결과가 같다(백업 표는 처음 한 번만 만든다).

begin;

create table if not exists public.budget_backup_20261110 as select * from public.budget;
alter table public.budget_backup_20261110 enable row level security;   -- 정책 없음 = API 로는 아무도 못 읽는다

-- 1) 코드가 바뀐 계정 옮기기
update public.budget set code = '2130100' where code = '2070200' and not exists (select 1 from public.budget where code = '2130100');   -- 주보비 → 주보비
update public.budget set code = '2140200' where code = '2090200' and not exists (select 1 from public.budget where code = '2140200');   -- 경조비 → 경조비
update public.budget set code = '2140300' where code = '2090300' and not exists (select 1 from public.budget where code = '2140300');   -- 접대비 → 접대비
update public.budget set code = '2140100' where code = '2090100' and not exists (select 1 from public.budget where code = '2140100');   -- 심방,문병 → 심방 및 문병비
update public.budget set code = '2140500' where code = '2091300' and not exists (select 1 from public.budget where code = '2140500');   -- 전도용품 → 전도용품비
update public.budget set code = '2010500' where code = '2091400' and not exists (select 1 from public.budget where code = '2010500');   -- 세례의무금 → 세례의무금
update public.budget set code = '2060500' where code = '2080800' and not exists (select 1 from public.budget where code = '2060500');   -- 시설관리비 → 시설관리비
update public.budget set code = '2060600' where code = '2080900' and not exists (select 1 from public.budget where code = '2060600');   -- 건출물공과금 → 건축물공과금
update public.budget set code = '2081100' where code = '20811000000' and not exists (select 1 from public.budget where code = '2081100');   -- 정수기렌탈요금 → 정수기렌탈요금
update public.budget set code = '2150100' where code = '2090700' and not exists (select 1 from public.budget where code = '2150100');   -- 강사사례 → 강사 사례비
update public.budget set code = '2140400' where code = '2091100' and not exists (select 1 from public.budget where code = '2140400');   -- 구제비 → 선교 / 구제비
update public.budget set code = '2040900' where code = '2040700' and not exists (select 1 from public.budget where code = '2040900');   -- 선교부 → 구제선교위원회

-- 2) 오직 3기 예산 값으로 맞추기 (있으면 고치고 없으면 넣는다)
with src(code, name, atype, prev_budget, prev_actual, budget) as (values
  ('1010000', '일반헌금', '수입', 125500000::bigint, 115204000::bigint, 121500000::bigint),
  ('1010100', '십일조', '수입', 70000000::bigint, 72855000::bigint, 75000000::bigint),
  ('1010300', '감사헌금', '수입', 50000000::bigint, 36304000::bigint, 40000000::bigint),
  ('1010400', '주일헌금', '수입', 3000000::bigint, 2725000::bigint, 3000000::bigint),
  ('1010500', '생일감사', '수입', 2500000::bigint, 2970000::bigint, 3000000::bigint),
  ('1010600', '구역헌금', '수입', 0::bigint, 0::bigint, 0::bigint),
  ('1010200', '헌신예배', '수입', 0::bigint, 0::bigint, 0::bigint),
  ('1010700', '심방감사', '수입', 0::bigint, 350000::bigint, 500000::bigint),
  ('1020000', '절기헌금', '수입', 20700000::bigint, 17223000::bigint, 19000000::bigint),
  ('1020100', '맥추절', '수입', 5000000::bigint, 3770000::bigint, 4000000::bigint),
  ('1020200', '추수감사절', '수입', 7000000::bigint, 5360000::bigint, 6000000::bigint),
  ('1020300', '성탄절', '수입', 2700000::bigint, 2768000::bigint, 3000000::bigint),
  ('1020400', '송구영신', '수입', 2500000::bigint, 2030000::bigint, 2500000::bigint),
  ('1020500', '부활절', '수입', 3500000::bigint, 3295000::bigint, 3500000::bigint),
  ('1020600', '명절 가정 감사', '수입', 0::bigint, 0::bigint, 0::bigint),
  ('1030000', '목적헌금', '수입', 19000000::bigint, 14590000::bigint, 15000000::bigint),
  ('1030100', '건축헌금', '수입', 10000000::bigint, 6450000::bigint, 7000000::bigint),
  ('1030200', '선교헌금', '수입', 9000000::bigint, 8140000::bigint, 8000000::bigint),
  ('1040000', '교회학교', '수입', 2000000::bigint, 4146000::bigint, 4000000::bigint),
  ('1040100', '유년부', '수입', 2000000::bigint, 4146000::bigint, 4000000::bigint),
  ('1040200', '중고등부', '수입', 0::bigint, 0::bigint, 0::bigint),
  ('1040300', '청년부', '수입', 0::bigint, 0::bigint, 0::bigint),
  ('1050000', '특별헌금', '수입', 24500000::bigint, 14625000::bigint, 17500000::bigint),
  ('1050100', '차량헌금', '수입', 6000000::bigint, 0::bigint, 3000000::bigint),
  ('1050200', '특별헌금', '수입', 10000000::bigint, 5740000::bigint, 5000000::bigint),
  ('1050300', '일천번기도', '수입', 8000000::bigint, 8455000::bigint, 8000000::bigint),
  ('1050400', '첫열매', '수입', 0::bigint, 0::bigint, 1000000::bigint),
  ('1050500', '총회세례금', '수입', 500000::bigint, 430000::bigint, 500000::bigint),
  ('1050600', '부흥회', '수입', 0::bigint, 0::bigint, 0::bigint),
  ('1060000', '기타헌금', '수입', 8300000::bigint, 2534000::bigint, 3000000::bigint),
  ('1060100', '기타', '수입', 8300000::bigint, 2534000::bigint, 3000000::bigint),
  ('2010000', '상회비', '지출', 4700000::bigint, 5720330::bigint, 5500000::bigint),
  ('2010100', '총회비', '지출', 200000::bigint, 600000::bigint, 200000::bigint),
  ('2010200', '노회비', '지출', 4000000::bigint, 4570000::bigint, 4100000::bigint),
  ('2010300', '시찰비', '지출', 500000::bigint, 550330::bigint, 500000::bigint),
  ('2010400', '교역자회', '지출', 0::bigint, 0::bigint, 300000::bigint),
  ('2010500', '세례의무금', '지출', 0::bigint, 0::bigint, 400000::bigint),
  ('2120000', '대외협력비', '지출', 0::bigint, 0::bigint, 1140000::bigint),
  ('2120100', '화성시기독교연합회', '지출', 0::bigint, 0::bigint, 100000::bigint),
  ('2120200', '삼괴지역기독교연합회', '지출', 0::bigint, 0::bigint, 240000::bigint),
  ('2120300', '기관 후원금', '지출', 0::bigint, 0::bigint, 500000::bigint),
  ('2120400', '축하/축의금', '지출', 0::bigint, 0::bigint, 300000::bigint),
  ('2020000', '목회비', '지출', 68000000::bigint, 68000000::bigint, 69200000::bigint),
  ('2020100', '목사사례비', '지출', 32000000::bigint, 33500000::bigint, 32000000::bigint),
  ('2020300', '목회운영비', '지출', 1800000::bigint, 300000::bigint, 1800000::bigint),
  ('2020600', '대외사역비', '지출', 0::bigint, 0::bigint, 1200000::bigint),
  ('2020400', '도서비', '지출', 1800000::bigint, 1800000::bigint, 1800000::bigint),
  ('2020200', '은급비', '지출', 2400000::bigint, 2400000::bigint, 2400000::bigint),
  ('2020500', '원로목사', '지출', 30000000::bigint, 30000000::bigint, 30000000::bigint),
  ('2030000', '교육비', '지출', 10800000::bigint, 10905600::bigint, 10900000::bigint),
  ('2030100', '목회자 자녀 교육비', '지출', 7200000::bigint, 7200000::bigint, 7200000::bigint),
  ('2030200', '목회자 교육 및 세미나비', '지출', 300000::bigint, 1390000::bigint, 500000::bigint),
  ('2030300', '중직자 교육비', '지출', 1000000::bigint, 500000::bigint, 200000::bigint),
  ('2030800', '청년부 교육비', '지출', 0::bigint, 0::bigint, 200000::bigint),
  ('2030900', '제자 훈련반 운영비', '지출', 0::bigint, 0::bigint, 200000::bigint),
  ('2031000', '성경 양육반 운영비', '지출', 0::bigint, 0::bigint, 200000::bigint),
  ('2031100', '새신자 교육비', '지출', 0::bigint, 0::bigint, 200000::bigint),
  ('2030600', '교사 교육비', '지출', 300000::bigint, 0::bigint, 200000::bigint),
  ('2030500', '주일학교 교재 및 QT교재비', '지출', 2000000::bigint, 1815600::bigint, 2000000::bigint),
  ('2040000', '기관보조', '지출', 14700000::bigint, 14960740::bigint, 16400000::bigint),
  ('2040100', '남전도회', '지출', 100000::bigint, 0::bigint, 100000::bigint),
  ('2040200', '여전도회', '지출', 100000::bigint, 0::bigint, 100000::bigint),
  ('2041000', '권사회', '지출', 0::bigint, 0::bigint, 100000::bigint),
  ('2040900', '구제선교위원회', '지출', 0::bigint, 0::bigint, 8000000::bigint),
  ('2040300', '중고등부', '지출', 1200000::bigint, 1824040::bigint, 1200000::bigint),
  ('2040400', '유초등부', '지출', 5000000::bigint, 4038070::bigint, 6500000::bigint),
  ('2040800', '청년부', '지출', 900000::bigint, 100000::bigint, 200000::bigint),
  ('2040500', '성가대', '지출', 200000::bigint, 0::bigint, 200000::bigint),
  ('2040600', '장학부', '지출', 1200000::bigint, 800000::bigint, 0::bigint),
  ('2050000', '공과금', '지출', 11450000::bigint, 10002530::bigint, 11350000::bigint),
  ('2050100', '전기요금', '지출', 6000000::bigint, 4697560::bigint, 5000000::bigint),
  ('2050200', '통신 및 인터넷 요금', '지출', 2000000::bigint, 2090210::bigint, 3000000::bigint),
  ('2050300', '의료보험', '지출', 2400000::bigint, 2700000::bigint, 2400000::bigint),
  ('2050400', '의료비', '지출', 500000::bigint, 0::bigint, 500000::bigint),
  ('2050500', '기독신문비', '지출', 400000::bigint, 385000::bigint, 300000::bigint),
  ('2050700', '주민,상하수도', '지출', 150000::bigint, 129760::bigint, 150000::bigint),
  ('2060000', '시설관리비(시설 유지보수비)', '지출', 12500000::bigint, 6294500::bigint, 7700000::bigint),
  ('2060100', '수리 및 공사비', '지출', 2500000::bigint, -644500::bigint, 2000000::bigint),
  ('2060200', '비품비', '지출', 3500000::bigint, 4920970::bigint, 3000000::bigint),
  ('2060400', '소모품비', '지출', 1500000::bigint, 1211380::bigint, 1500000::bigint),
  ('2060500', '시설관리비', '지출', 0::bigint, 0::bigint, 0::bigint),
  ('2060600', '건축물공과금', '지출', 0::bigint, 0::bigint, 0::bigint),
  ('2060800', '설비 교체 적립금', '지출', 0::bigint, 0::bigint, 1200000::bigint),
  ('2070000', '사무 관리비', '지출', 2600000::bigint, 1494390::bigint, 1300000::bigint),
  ('2070600', '프로그램 및 IT 서비스 사용 비용', '지출', 500000::bigint, 360000::bigint, 1000000::bigint),
  ('2070100', '사무용품비', '지출', 600000::bigint, 672390::bigint, 100000::bigint),
  ('2070700', '사무행정비', '지출', 0::bigint, 0::bigint, 100000::bigint),
  ('2070500', '기타', '지출', 200000::bigint, 0::bigint, 100000::bigint),
  ('2080000', '관리비', '지출', 34720000::bigint, 33293934::bigint, 27800000::bigint),
  ('2080100', '차량유지비', '지출', 8400000::bigint, 8400000::bigint, 4800000::bigint),
  ('2080300', '차량수리', '지출', 500000::bigint, 585000::bigint, 500000::bigint),
  ('2080500', '자동차보험', '지출', 9000000::bigint, 8855934::bigint, 3000000::bigint),
  ('2081200', '자동차할부', '지출', 0::bigint, 0::bigint, 12000000::bigint),
  ('2080600', '자동차세금', '지출', 700000::bigint, 900600::bigint, 900000::bigint),
  ('2080200', '연료(난방)', '지출', 800000::bigint, 1930000::bigint, 1000000::bigint),
  ('2080400', '대출상환금', '지출', 12000000::bigint, 12000000::bigint, 5000000::bigint),
  ('2080700', '일반적금', '지출', 0::bigint, 0::bigint, 0::bigint),
  ('2081000', '대출이자', '지출', 0::bigint, 0::bigint, 0::bigint),
  ('2081100', '정수기렌탈요금', '지출', 720000::bigint, 622400::bigint, 600000::bigint),
  ('2150000', '예배 운영비', '지출', 0::bigint, 0::bigint, 900000::bigint),
  ('2150100', '강사 사례비', '지출', 0::bigint, 0::bigint, 300000::bigint),
  ('2150300', '예배 용품비', '지출', 0::bigint, 0::bigint, 100000::bigint),
  ('2150400', '강단 장식비', '지출', 0::bigint, 0::bigint, 200000::bigint),
  ('2150500', '찬양단 운영비', '지출', 0::bigint, 0::bigint, 100000::bigint),
  ('2150600', '특별 집회비', '지출', 0::bigint, 0::bigint, 200000::bigint),
  ('2140000', '전도비', '지출', 0::bigint, 0::bigint, 2200000::bigint),
  ('2140100', '심방 및 문병비', '지출', 0::bigint, 0::bigint, 500000::bigint),
  ('2140500', '전도용품비', '지출', 0::bigint, 0::bigint, 200000::bigint),
  ('2140200', '경조비', '지출', 0::bigint, 0::bigint, 1200000::bigint),
  ('2140300', '접대비', '지출', 0::bigint, 0::bigint, 300000::bigint),
  ('2140400', '선교 / 구제비', '지출', 0::bigint, 0::bigint, 0::bigint),
  ('2090000', '교제 친교비', '지출', 16500000::bigint, 12637600::bigint, 6700000::bigint),
  ('2091500', '주일 식사비', '지출', 1200000::bigint, 1200000::bigint, 1200000::bigint),
  ('2090600', '찬조금', '지출', 1000000::bigint, 1920000::bigint, 500000::bigint),
  ('2091200', '선물비', '지출', 5000000::bigint, 5633400::bigint, 5000000::bigint),
  ('2090400', '행사비', '지출', 3000000::bigint, 624200::bigint, 0::bigint),
  ('2091000', '해외경비', '지출', 500000::bigint, 0::bigint, 0::bigint),
  ('2130000', '홍보 출판비', '지출', 0::bigint, 0::bigint, 1300000::bigint),
  ('2130100', '주보비', '지출', 0::bigint, 0::bigint, 300000::bigint),
  ('2130400', '요람 제작비', '지출', 0::bigint, 0::bigint, 300000::bigint),
  ('2130200', '달력 제작비', '지출', 0::bigint, 0::bigint, 400000::bigint),
  ('2130300', '광고 및 홍보비', '지출', 0::bigint, 0::bigint, 300000::bigint),
  ('2100000', '휴가비', '지출', 1400000::bigint, 1200000::bigint, 1400000::bigint),
  ('2100100', '목사', '지출', 500000::bigint, 500000::bigint, 500000::bigint),
  ('2100200', '원로목사', '지출', 300000::bigint, 300000::bigint, 300000::bigint),
  ('2100300', '장로', '지출', 600000::bigint, 400000::bigint, 600000::bigint),
  ('2110000', '기타', '지출', 12630000::bigint, 0::bigint, 16210000::bigint),
  ('2110100', '부흥회', '지출', 0::bigint, 0::bigint, 0::bigint),
  ('2110200', '예비비', '지출', 518092::bigint, 0::bigint, 285716::bigint),
  ('2110300', '전년도이월금', '지출', 12111908::bigint, 0::bigint, 15924284::bigint)
), upd as (
  update public.budget b set name = s.name, atype = s.atype, prev_budget = s.prev_budget, prev_actual = s.prev_actual, budget = s.budget
    from src s where b.code = s.code returning b.code
)
insert into public.budget (code, name, atype, prev_budget, prev_actual, budget)
select s.code, s.name, s.atype, s.prev_budget, s.prev_actual, s.budget from src s
 where not exists (select 1 from public.budget b where b.code = s.code);

-- 3) 오직에 없는 계정: 지우지 않고 예산만 0 (합계가 오직과 같아지게)
update public.budget set budget = 0 where code = '2030400';   -- 강습회 (예산 0)
update public.budget set budget = 0 where code = '2050600';   -- 적십자비 (예산 100,000)
update public.budget set budget = 0 where code = '2060300';   -- 시설비 (예산 10,000,000)
update public.budget set budget = 0 where code = '2070300';   -- 인쇄비 (예산 1,000,000)
update public.budget set budget = 0 where code = '2070400';   -- 신문광고비 (예산 0)
update public.budget set budget = 0 where code = '2090500';   -- 당회 재정부 (예산 500,000)
update public.budget set budget = 0 where code = '2090900';   -- 기관선교비 (예산 300,000)

commit;

-- 실행 뒤 확인(건수·합계만):
--   select atype, count(*), sum(budget) filter (where right(code, 4) <> '0000') as leaf_budget from public.budget group by atype;
--   기대: 수입 leaf_budget = 180,000,000 · 지출 leaf_budget = 180,000,000
