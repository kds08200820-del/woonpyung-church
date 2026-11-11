-- 새벽기도회 출석 기준을 오전 5시로 (2026-11-11 담임목사)
--  · 새벽기도회는 오전 5시에 시작한다. 예전엔 4:30 시작으로 잡아, 4:31~5:00 에 출석 단추를 눌러도 '지각'으로 남았다.
--  · 같은 날 홈페이지 예배 판(js/worship.js 의 SCHED)·모두의 성경 예배 띠(modu/worship-banner.js)를 5시 시작으로 바꿨다 — 그 화면은 이 SQL 을 실행한 뒤에 올린다.
--  · 바뀌는 것(새벽기도회만): 출석 창 04:20~06:10 → 04:50~06:10, 지각 계산 기준 04:30 → 05:00
--  · 함수 하나만 다시 정의한다(create or replace). 표·자료는 건드리지 않고, 이미 남은 출석 기록도 고쳐 쓰지 않는다. 여러 번 실행해도 결과가 같다.
-- 되돌리기: 아래 '새벽기도회' 줄의 5*60 을 4*60+30 으로 바꿔 다시 실행한다 (supabase/20260927_1500_attendance.sql 의 att_window 와 같아진다)
-- 실행 뒤 확인(자료 본문 없음):  select * from public.att_window('새벽기도회');   → 300 | 360 | -1

-- 예배 시간표 (한국 시각, 분) — 홈페이지 js/worship.js 의 SCHED 와 같게. 출석 창: 시작 10분 전 ~ 끝난 뒤 10분
create or replace function public.att_window(p_service text, out start_min int, out end_min int, out dow int)
language sql immutable as $$
  select s.a, s.b, s.d from (values
    ('주일 1부', 9*60+20, 10*60+40, 0),
    ('주일 2부', 11*60,   12*60+30, 0),
    ('주일 예배', 11*60,  12*60+30, 0),
    ('수요기도회', 11*60, 12*60,    3),
    ('새벽기도회', 5*60,  6*60,    -1)
  ) as s(n, a, b, d) where s.n = p_service
$$;
