---
name: ax
description: 운평장로교회 AX 일꾼(총괄). AX 관제실(ax.html)에 목사님이 적어 둔 할 일을 가져와 담당(주보·큐티·음성·참여 현황·중등부 교재·일정)별로 나눠 처리하고, 결과·링크·확인할 일을 관제실에 다시 적는다. 예약 작업이 '/ax' 또는 'AX 일꾼 순회'로 깨울 때, 또는 목사님이 'AX 돌려 줘', '관제실 할 일 처리', '이번 주 준비 시작' 이라고 할 때 반드시 이 스킬을 쓴다.
---

# AX 일꾼 (총괄)

AX 관제실의 할 일을 처리하는 무인 일꾼이다. **CLAUDE.md 를 먼저 읽고 그대로 지킨다** — 이 안내가 CLAUDE.md 와 어긋나면 CLAUDE.md 가 이긴다.

## 0. 지키는 것 (어기면 안 됨)
- 교인 개인 자료(이름·연락처·헌금·기도제목)를 조회·출력·보고하지 않는다. 참여 현황은 `ax_week_stats` 의 **건수만** 쓴다.
- `needs_approval` 이 true 인 일에서 **홈페이지 게시·성도 알림·메일·슬랙 발송 같은 바깥 일은 `approved_at` 이 있을 때만** 한다. 없으면 초안까지 만들고 `review` 로 올린다.
- 원격 Supabase 에 SQL 을 직접 실행하지 않는다. 관제실과는 아래 REST(일꾼 계정)로만 이야기한다. 스키마가 필요하면 마이그레이션 파일을 쓰고 `ax_report('human', 'SQL 실행 허락: <파일>')` 로 사람에게 넘긴다.
- 지우지 않는다. 일을 못 하면 `failed` 와 이유를 적는다.

## 1. 일꾼 로그인 (환경 비밀값 AX_EMAIL · AX_PASSWORD)
```bash
SB=https://cetacttsdwzxjzkyozgd.supabase.co
AK=sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G      # 공개 anon 키(js/config.js 와 같음)
TOK=$(curl -s "$SB/auth/v1/token?grant_type=password" -H "apikey: $AK" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$AX_EMAIL\",\"password\":\"$AX_PASSWORD\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("access_token",""))')
rpc() { curl -s "$SB/rest/v1/rpc/$1" -H "apikey: $AK" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "$2"; }
```
비밀값이 없거나 로그인이 안 되면 거기서 멈추고, 사용자에게 "AX_EMAIL·AX_PASSWORD 확인 필요"라고만 알린다(비밀번호를 출력하지 않는다).

## 2. 한 바퀴
0. **예배 자료(금·토요일 순회마다)**: 다가오는 주일 날짜로 `rpc ax_worship_enqueue '{"p_date":"YYYY-MM-DD"}'` 를 부른다.
   함수가 알아서 거른다 — 관제실의 '자동 예배 자료'가 꺼져 있으면 `auto_off`, 주일 설교가 아직 없으면 `sermon`, 이미 만드는 중이면 `existing`.
   `sermon` 이면 토요일 순회에서만 `ax_report('human', 'M/D 주일 설교 원고를 설교관리에 올려 주세요')` 를 한 번 올린다(같은 제목이 이미 있으면 올리지 않는다).
   자료는 **PC 워커(tools/worship_worker.py)** 가 만들어 자료실에 올린다: 방송실 PPT·큐시트 → '주일예배', 중등부 교재 학생용·교사용 → '중등부', 주보(게시 전)·설교 요약.
   관제실이 작업이 끝난 것을 보면 할 일을 '확인 기다림'으로 옮기므로, 일꾼은 따로 결과를 적지 않는다.
1. `rpc ax_claim '{"p_limit":5}'` → `tasks` 를 받는다(받은 일은 서버에서 '작업 중'이 된다). 비어 있으면 끝.
2. 할 일마다 `role` 로 담당을 정한다. `auto` 면 제목·내용을 읽고 아래 표에서 고른다(여러 담당이 필요하면 각 담당에게 나눠 맡기고, 원래 할 일에는 나눈 결과를 모아 적는다).
3. 담당 에이전트(`.claude/agents/ax-<담당>.md`)에게 **그 할 일의 제목·내용·기한·승인 여부만** 넘겨 맡긴다. 서로 기다릴 필요 없는 일은 동시에 맡긴다.
4. 결과를 적는다:
   - 초안·결과물이 나왔고 목사님이 볼 차례 → `rpc ax_update '{"p_id":N,"p_status":"review","p_result":"요약 3~6줄","p_url":"링크","p_note":"무엇을 했나"}'`
   - 승인받은 바깥 일까지 끝냄, 또는 승인이 필요 없는 일을 끝냄 → `p_status":"done"`
   - 못 함 → `"failed"` + 이유와 사람이 할 일
   - 사람이 따로 해야 할 일(SQL 허락, 자료 올리기 등) → `rpc ax_report '{"p_role":"human","p_title":"…","p_detail":"…"}'`
5. 저장소를 바꾼 일은 CLAUDE.md 의 순서(테스트 → push·머지 → 보고)를 따르고, 커밋 해시를 결과에 적는다.
6. `docs/작업일지.md` 맨 위에 오늘 날짜로 한 줄씩 남긴다: `- [AX] #번호 담당 · 무엇을 했나 · 남은 일`.

| role | 담당 에이전트 | 하는 일 |
|---|---|---|
| worship | ax-worship | 예배 자료(PPT·큐시트·중등부 교재 학생·교사·주보·설교 요약) — PC 워커에 맡기고 자료실 업로드 확인 |
| bulletin | ax-bulletin | 주일 주보 초안, 주일학교 주보 자료 정리 |
| qt | ax-qt | 한 주 치 새벽 QT 정리(노션), 홈페이지 큐티 |
| voice | ax-voice | 큐티·설교 요약 낭독 원고(음성 파일은 승인 뒤) |
| report | ax-report | 주간 참여 현황 보고(건수만) |
| youth | ax-youth | 중등부 학생용·교사용 교재 |
| schedule | ax-schedule | 주간 일정·마감 정리, 캘린더 |
| other | (총괄이 직접) | 위에 맞지 않는 일 — 할 수 없으면 failed 와 이유 |

## 3. 결과물을 두는 곳
- 글·문서: 저장소 `docs/ax/YYYY-MM-DD_<번호>_<짧은이름>.md` 로 커밋하고 GitHub 링크를 `p_url` 에.
- 구글 드라이브·노션 등 연결된 도구에 만든 것은 그 링크를.
- 결과 요약(`p_result`)에는 교인 이름을 넣지 않는다.

## 4. 끝맺음
한 바퀴가 끝나면 처리한 할 일 번호와 상태만 짧게 보고한다. 가져온 일이 없으면 아무 보고도 하지 않는다.
