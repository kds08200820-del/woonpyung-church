-- 20261110_2000_finance_remove_misfiled_19.sql
-- 재정 장부에서 잘못 들어간 19건을 지운다. (담임목사가 2026-11-10 에 "삭제 금지 규칙을 이 19건에 한해 푼다"고 허락)
--   1) 헌금(offerings) 10건 — 2026-11-01, 항목 "(2026.10.26~2026.11.01)", 합계 11,342,758원.
--      그 주 재정보고서(지출) 파일이 헌금자 리스트로 잘못 읽혀 들어간 것. 교인과 연결된 행은 없다.
--   2) 지출(expenses) 9건 — 2026-10-11, 합계 3,663,670원.
--      같은 파일이 2026-10-13 06:38 과 06:39 에 두 번 저장됐다. 06:39 에 들어간 쪽(id 526~534)을 지운다.
-- 파괴적 변경만 들어 있다(백업 표 생성 포함). 다른 변경과 섞지 않는다.
--
-- 되돌리는 방법: 지운 행은 아래 백업 표에 그대로 남는다.
--   insert into public.offerings overriding system value select * from public.offerings_removed_20261110;
--   insert into public.expenses  overriding system value select * from public.expenses_removed_20261110;
--
-- 두 번 실행해도 안전하다(두 번째에는 지울 행이 없다).

begin;

create table if not exists public.offerings_removed_20261110 as
  select * from public.offerings
   where id in (4095, 4096, 4097, 4098, 4099, 4100, 4101, 4102, 4103, 4104)
     and offer_date = '2026-11-01' and category = '(2026.10.26~2026.11.01)';
alter table public.offerings_removed_20261110 enable row level security;   -- 정책 없음 = API 로는 아무도 못 읽는다

create table if not exists public.expenses_removed_20261110 as
  select * from public.expenses
   where id in (526, 527, 528, 529, 530, 531, 532, 533, 534)
     and exp_date = '2026-10-11';
alter table public.expenses_removed_20261110 enable row level security;

-- id 와 조건이 모두 맞는 행만 지운다
delete from public.offerings
 where id in (4095, 4096, 4097, 4098, 4099, 4100, 4101, 4102, 4103, 4104)
   and offer_date = '2026-11-01' and category = '(2026.10.26~2026.11.01)';

delete from public.expenses
 where id in (526, 527, 528, 529, 530, 531, 532, 533, 534)
   and exp_date = '2026-10-11';

commit;

-- 실행 뒤 확인(건수·합계만):
--   select (select sum(amount) from public.offerings where offer_date between '2025-12-01' and '2026-11-30') as income,
--          (select sum(amount) from public.expenses  where exp_date  between '2025-12-01' and '2026-11-30') as expense;
--   기대: income 152,231,400 · expense 162,423,055
