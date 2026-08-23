# 홈페이지 AI — 교회 컴퓨터(Claude CLI) 방식 안내

2026-08-15부터 홈페이지의 AI 기능은 **교회 컴퓨터에서 24시간 돌아가는 워커**가
**Claude Code CLI**로 답을 만듭니다. 구글 Gemini API 키도, 앤트로픽 API 키도
더 이상 필요 없습니다. (이미 쓰고 계신 Claude 구독을 그대로 씁니다.)

## 왜 바꿨나

기존에는 Supabase Edge Function이 구글 Gemini를 불렀는데,
구글 클라우드 프로젝트의 **사용 한도(spend cap)** 가 걸리면서 이런 오류가 났습니다.

```
[gemini/...] 403 "Spend cap breached for project: projects/923940546165
for service: generativelanguage.googleapis.com"
```

교회 PC가 이미 주일 자료 워커(`worship_worker.py`)로 Claude CLI를 쓰고 있어서,
같은 방식으로 AI 기능 전체를 옮겼습니다.

## 무엇이 이 방식으로 바뀌었나

| 기능 | 위치 | 작업 종류 |
|---|---|---|
| 운평 말씀지기 (교인 질문창) | 홈 화면 아래 | `counsel` |
| 마침 기도문 생성 🙏 | 목회행정 → 설교 매니저 | `prayer` |
| 표지 말씀 헤드라인 ✨ | 목회행정 → 주보 편집기 | `headline` |
| AI 주보 검수 ✨ | 목회행정 → 주보 편집기 | `review` |

## 어떻게 도는가

```
[교인·목사님 브라우저]
      │ ① ai_enqueue()  — 질문을 큐에 넣기
      ▼
[Supabase · ai_jobs 테이블]  pending
      │ ② claim_ai_job()  — 교회 PC가 가져감
      ▼
[교회 PC · tools/ai_worker.py]  →  claude -p  (Claude 구독)
      │ ③ 답변을 ai_jobs 에 기록          done
      ▼
[브라우저]  1.5초마다 확인하다가 답이 오면 표시
```

---

# 설치 (교회 컴퓨터에서 한 번만)

## 1단계 — Supabase에 표 만들기

Supabase → 프로젝트 **cetacttsdwzxjzkyozgd** → 왼쪽 **SQL Editor** →
`supabase/ai_jobs.sql` 내용을 통째로 붙여넣고 **Run**.

한 번만 하면 됩니다. (표 `ai_jobs` + 함수 `ai_enqueue`, `claim_ai_job` 생성)

## 2단계 — 환경변수 확인

교회 PC에서 **PowerShell**을 열고 아래를 실행합니다.
주일 자료 워커를 이미 쓰고 계시면 **이미 설정돼 있어서 건너뛰어도 됩니다.**

```bash
setx SUPABASE_SERVICE_ROLE_KEY "여기에_service_role_키"
```

> service_role 키는 Supabase → **Project Settings → API → service_role** 에 있습니다.
> 이 키는 모든 권한을 가지므로 **교회 PC 밖으로 절대 내보내지 마세요.**

## 3단계 — Claude CLI 로그인 확인

```bash
claude --version
```

버전이 나오면 설치된 것입니다. 로그인이 안 돼 있으면 `claude` 를 한 번 실행해
로그인해 두세요. (API 키가 아니라 **구독 로그인**입니다)

## 4단계 — 워커 켜기

`tools\목회AI워커.bat` 를 더블클릭하면 검은 창이 뜨고 대기 상태가 됩니다.
**이 창은 계속 켜 두세요.** 창을 닫으면 홈페이지 AI가 멈춥니다.

```
워커 'church-pc' / 모델 교인=haiku 관리=sonnet
claude C:\Users\...\claude.exe
큐 https://cetacttsdwzxjzkyozgd.supabase.co/rest/v1/ai_jobs
대기 중… (1.5초 간격, Ctrl+C 로 종료)
```

## 5단계 — 재부팅해도 자동으로 켜지게

PowerShell에서 한 번만 실행하면, 앞으로 윈도우에 로그인할 때마다 자동으로 켜집니다.

```bash
powershell -ExecutionPolicy Bypass -File tools\ai-worker-autostart.ps1
```

끄려면 `-Off` 를 붙여 다시 실행하세요.

---

# 점검 · 문제 해결

## 잘 되는지 시험

큐를 거치지 않고 교회 PC에서 바로 답변만 확인해 볼 수 있습니다.

```bash
python tools/ai_worker.py --test "구원은 어떻게 받는 건가요?"
```

## 홈페이지에 "교회 컴퓨터의 응답이 늦어지고 있어요" 가 뜬다

교회 PC의 워커 창이 꺼져 있거나 밀린 질문을 처리하는 중이라는 뜻입니다.
`tools\목회AI워커.bat` 가 켜져 있는지 확인하세요.
(목회행정 화면에서는 "교회 컴퓨터의 AI 워커가 꺼져 있는 것 같습니다"로 표시됩니다)

2026-08-22부터 질문은 사라지지 않습니다 — 워커가 꺼져 있어도 질문이 큐에
저장되고, 워커가 다시 켜지면 답이 만들어져 화면의 '질문 기록'에 나타납니다.
같은 날부터 `목회AI워커.bat` 는 워커가 죽으면 15초 뒤 자동으로 다시 켭니다.
(2026-08-18~21에 워커가 조용히 죽은 채 방치되어 질문이 하루 넘게 밀린 일의 재발 방지)

## "AI 준비가 아직 끝나지 않았습니다"

1단계 SQL(`supabase/ai_jobs.sql`)을 아직 실행하지 않았습니다.

## 답이 느리다

한 번 답하는 데 **20~30초**가 걸립니다(주보 검수는 1분 내외).
Claude CLI를 새로 띄우는 시간이 포함돼 있어서, 예전 Gemini보다 조금 느립니다.

여러 사람이 동시에 물으면 **한 사람씩 차례로** 처리합니다.
많이 밀린다면 `목회AI워커.bat` 를 **한 번 더 실행**해 창을 두 개 띄우면
두 건씩 동시에 처리됩니다. (같은 질문을 두 번 처리하지 않도록 설계돼 있습니다)

## 워커 창에 뜨는 로그

```
▶ #41 말씀지기 (19:32:07)
   · 말씀지기 생성 완료 (23.2초, 684자)
✅ #41 완료
```

실패하면 `❌` 와 함께 원인이 남습니다. 교인 화면에는 원인이 아니라
짧은 안내 문구만 보입니다.

---

# 설정값 (필요할 때만)

`setx` 로 지정하면 워커를 다시 켤 때 반영됩니다.

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | (필수) | Supabase service_role 키 |
| `AI_WORKER_NAME` | `church-pc` | 워커 이름(로그 구분용) |
| `AI_MODEL_COUNSEL` | `haiku` | 교인 질문용 모델. 더 깊은 답을 원하면 `sonnet` |
| `AI_MODEL_ADMIN` | `sonnet` | 기도문·헤드라인·검수용 모델 |
| `CLAUDE_BIN` | 자동 탐지 | claude 실행 파일 경로 |

말씀지기의 **1인 1일 질문 한도는 20회**입니다.
바꾸려면 `supabase/ai_jobs.sql` 의 `v_limit int := 20;` 을 고쳐 다시 Run 하세요.

# 안전장치

- **도구 차단** — Claude는 빈 임시 폴더에서 실행되고, 파일·명령·검색 도구가
  전부 막혀 있습니다(`--disallowed-tools`, `--strict-mcp-config`,
  `--disable-slash-commands`). 교인이 어떤 문장을 보내든 글쓰기 외에는
  아무것도 할 수 없습니다.
- **위기 신호** — 자살·자해·학대 등이 감지되면 Claude를 부르지 않고
  즉시 상담전화(109·1577-0199·112/119)와 목사님 연락처를 안내합니다.
- **권한** — 기도문·헤드라인·검수는 `admins` 테이블에 있는 관리자만,
  말씀지기는 로그인한 교인만 쓸 수 있습니다. 질문 기록은 본인만 볼 수 있습니다.

# 옛 Edge Function은 어떻게 되나

`supabase/functions/counsel`, `supabase/functions/bulletin-ai` 는 **지우지 않았습니다.**
지금은 홈페이지가 부르지 않으므로 그냥 잠들어 있습니다.
나중에 API 키를 넣어 되돌리고 싶으면 [상담AI-설치안내.md](상담AI-설치안내.md) 를 보세요.
