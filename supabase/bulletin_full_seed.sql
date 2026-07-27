-- ============================================================
-- 운평장로교회 — 주보 09 섬기는 사람들 · 10 후원 선교지 · 05 예배 및 교육 안내
-- 초기값 입력 (church_settings 테이블 재사용, 1회 실행)
--
-- 이 세 항목은 자주 바뀌지 않는 정보라, 매주 새로 입력하지 않고
-- 여기 한 번 넣어 두면 주보 생성 때마다 자동으로 실린다.
-- 나중에 인사이동·선교지 변경이 있으면 이 표만 다시 UPDATE 하면 된다.
--
-- 업로드해 주신 2026-07-26 주보(hwpx)의 내용을 그대로 옮겼다.
-- 잘못되었거나 바뀐 부분이 있으면 각 UPDATE 문의 data 값을 고쳐서 다시 실행하면 된다.
-- ============================================================

insert into public.church_settings (key, data, updated_at) values
('servants', '{
  "pastors": [
    {"role": "원로목사", "name": "김충현"},
    {"role": "담임목사", "name": "김동석"},
    {"role": "협동목사", "name": "안창선"}
  ],
  "elders": [
    {"role": "원로장로", "name": "조용상"},
    {"role": "시무장로", "name": "신용화"}
  ],
  "deacons": {"안수집사": "서재필 임수만 이상돈"},
  "deaconesses": {
    "시무권사": "한춘택 이국휘 조희숙 최영자 유영자 이은숙 권술이 차영선 고영례 이삼순 조혜영 하경순 김애자 박경자 석만순",
    "은퇴권사": "홍영숙 양재순 이기월 홍사일",
    "명예권사": "조용순 한분수"
  },
  "committees": {
    "구제선교위원장": "이은숙",
    "남전도회장": "조용상",
    "마리아회장": "석만순",
    "권사회장": "조희숙",
    "주일학교부장": "김보라",
    "중고등부부장": "김애자",
    "피아노반주": "김보라 신은경"
  }
}'::jsonb, now())
on conflict (key) do nothing;

insert into public.church_settings (key, data, updated_at) values
('missions', '{
  "list": [
    {"preacher": "김제현 목사", "church": "삽시벧엘교회", "region": "충청도 섬마을 작은 교회"},
    {"preacher": "차재용 목사", "church": "용연교회",     "region": "전북 산간 지역 작은 교회"},
    {"preacher": "고노엘 목사", "church": "청전교회",     "region": "제천 작은 교회"},
    {"preacher": "장정훈 목사", "church": "아름다운숲교회", "region": "동탄 도심 속 개척 교회"}
  ]
}'::jsonb, now())
on conflict (key) do nothing;

-- 05 예배 및 교육 안내 — 시간표는 거의 안 바뀌므로 템플릿으로 저장.
-- "이번 주 THIS WEEK" 칸(주일~토 일정)은 계절(혹서기 자율 등)에 따라 달라질 수 있어
-- 주보 편집 화면에서 그 주만 따로 고칠 수 있게 해 둔다(기본값은 이 템플릿).
insert into public.church_settings (key, data, updated_at) values
('service_schedule', '{
  "sunday_worship": [
    {"session": "1부", "time": "오전 09:20", "label": "Morning Worship"},
    {"session": "2부", "time": "오전 11:00", "label": "Main Worship"}
  ],
  "sunday_school": [
    {"group": "주일학교", "time": "오전 11시", "place": "교육관 2층", "label": "Bible study"},
    {"group": "주일학교", "time": "오후 1시",  "place": "본당",      "label": "Worship"},
    {"group": "중등부",   "time": "오후 1시",  "place": "교육관 2층", "label": "Bible study"}
  ],
  "week_days": ["주일", "화", "수", "목", "금", "토"],
  "week_default": {
    "주일": ["양육반"],
    "화":   ["새벽기도회"],
    "수":   ["새벽기도회", "수요기도회"],
    "목":   ["새벽기도회"],
    "금":   ["새벽기도회", "양육반"],
    "토":   []
  }
}'::jsonb, now())
on conflict (key) do nothing;
