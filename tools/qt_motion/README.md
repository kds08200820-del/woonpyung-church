# 매일 QT 모션 영상 (교회 PC 자동 제작)

매일 새벽 1시에 **다음 날** QT 를 세로 영상(유튜브 쇼츠)으로 만들고, 유튜브에 예약 공개로 올리고,
홈페이지 QT 글에 영상 주소를 넣는다. 예: 13일 01:00 에 14일자 QT 영상을 만든다.

```
QT 원고(sermons) → Claude 가 계획(plan.json) → QT 목소리 녹음 → 로컬 AI 그림 → MP4 굽기
   → 유튜브 예약 공개(QT 날짜 00:00) → sermons.media_url 에 주소 → 홈페이지 「오늘의 말씀 영상」 단추
```

모두 교회 PC 안에서 돈다. 돈 드는 외부 서비스는 쓰지 않는다(Claude 구독, 유튜브 무료 API).

## 파일

| 파일 | 하는 일 |
|---|---|
| `qt_motion.py` | 하루 한 편을 처음부터 끝까지 만든다 |
| `plan_prompt.md` | Claude 에게 주는 계획 작성 지침(대본·그림·장면) |
| `template/` | 영상 틀 — 계획(js/plan.js)을 읽어 화면을 만든다 |
| `sovits_bridge.mjs` | 영상 도구가 교회 QT 목소리(GPT-SoVITS)로 녹음하게 하는 연결 |
| `youtube.py` | 유튜브 로그인·올리기 |
| `examples/2026-11-11.plan.json` | 계획 예(아모스 5:7-17) |
| `설치.bat` · `유튜브_연결.bat` · `매일예약_등록.bat` · `점검.bat` | 한 번씩 누르는 준비 단추 |

교회 PC 쪽 폴더(저장소 밖): `C:\qt-video\motion\`

- `script-to-motion\` 영상 도구(github.com/kstost/script-to-motion, MIT) + 고친 두 줄
- `work\<날짜>\` 그날의 계획·그림·프로젝트(다시 돌리면 이어서 한다)
- `out\qt_<날짜>.mp4` 완성 영상
- `config.json` 설정(없으면 기본값) · `client_secret.json` · `youtube_token.json` 유튜브 열쇠

## 처음 한 번 하는 일

1. `설치.bat` — 영상 도구를 `C:\qt-video\motion` 에 받는다.
2. 유튜브 연결 (목사님이 직접):
   1. console.cloud.google.com 에서 프로젝트를 만들고 **YouTube Data API v3** 를 '사용' 으로.
   2. 'OAuth 동의 화면' 을 만들고(외부, 앱 이름 아무거나) **게시 상태를 '프로덕션'** 으로.
      '테스트' 로 두면 로그인이 7일마다 풀린다.
   3. '사용자 인증 정보 > OAuth 클라이언트 ID > 데스크톱 앱' 을 만들어 JSON 을 내려받아
      `C:\qt-video\motion\client_secret.json` 으로 저장.
   4. `유튜브_연결.bat` 실행 → 브라우저에서 교회 채널 계정으로 '허용'.
3. Supabase SQL `supabase/20261112_1100_qt_published_media_url.sql` 실행(홈페이지 단추용).
4. `점검.bat` — 모두 ✓ 인지 확인.
5. `매일예약_등록.bat` — 매일 01:00 에 돌도록 Windows 작업 스케줄러에 등록.

## 유튜브가 영상을 비공개로 잠글 때

구글 심사를 받지 않은 API 프로젝트로 올린 영상은 유튜브가 **비공개로 잠근다**. 그러면 예약 공개도 되지 않는다.
매니저의 영상 상태에 "비공개로 잠김" 으로 나온다. 푸는 길은 둘이다.

- 구글에 'YouTube API 서비스 심사(Audit and Quota Extension)' 를 신청해 통과한다(무료, 몇 주).
- 통과 전까지는 유튜브 스튜디오에서 그날 영상을 손으로 공개로 바꾼다(잠긴 영상은 이것도 막힐 수 있다 → 그 경우
  `config.json` 에 `"no_youtube": true` 를 두고 `out\` 의 MP4 를 스튜디오에 직접 올린다).

## 설정 (`C:\qt-video\motion\config.json`, 쓰는 것만 적는다)

```json
{
  "publish_time": "00:00",
  "image_model": "flux1-dev-Q4_K_S.gguf",
  "image_steps": 20,
  "max_images": 8,
  "youtube_playlist": "",
  "claude_model": "sonnet"
}
```

- `publish_time`: QT 날짜의 몇 시(한국)에 유튜브에서 열릴지. 홈페이지 QT 글·음성은 그날 00:00 에 열린다.
- 그림이 너무 오래 걸리면 `image_steps` 를 12 로, 또는 `image_model` 을 `flux1-schnell-Q4_K_S.gguf` + `image_steps` 4 로.

## 손으로 돌리기

```
python qt_motion.py --doctor                                  준비 상태
python qt_motion.py --date 2026-11-14                         그 날짜 한 편
python qt_motion.py --date 2026-11-14 --until render          굽기까지만
python qt_motion.py --date 2026-11-11 --plan examples\2026-11-11.plan.json --no-youtube
```

- 멈췄다가 같은 명령을 다시 돌리면 끝난 단계는 건너뛴다(계획·녹음·그림은 `work\<날짜>\` 에 남는다).
- 계획이 마음에 들지 않으면 `work\<날짜>\plan.json` 을 고치거나 지우고 다시 돌린다.
- 그림 한 장만 다시: `work\<날짜>\images\<이름>.png` 를 지우고 다시 돌린다.
- 진행은 목회행정 매니저의 영상 상태(`video_jobs`, job_type=motion)에 보인다.

## 걸리는 시간 (RTX 4060 8GB, 2026-11-12 잰 값)

- 계획 1~3분 · 녹음 2~3분 · 그림 한 장 20~24분(Flux dev) · 굽기는 영상 길이의 몇 배
- 그림 6장이면 2시간쯤. 01:00 에 시작하면 아침 전에 끝난다.

## 지키는 것

- 원고에 없는 해석을 보태지 않는다(계획 지침).
- 성경 본문을 그대로 싣는 것은 한두 절만.
- 하나님·예수님의 얼굴을 그리지 않는다.
- 사람이 `media_url` 에 넣어 둔 다른 주소는 덮어쓰지 않는다(유튜브 주소일 때만 바꾼다).
- 유튜브에 'AI 로 만든 콘텐츠' 표시를 켜고, 설명에도 적는다.
