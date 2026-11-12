# 매일 QT 모션 영상 (교회 PC 자동 제작)

매일 새벽 1시에 **다음 날** QT 를 세로 영상으로 만들어 **교회 홈페이지**에 올린다(유튜브에는 올리지 않는다).
영상 파일은 교회 파일 저장소(음성 QT 가 올라가는 곳)에 두고, 홈페이지 QT 글에 그 주소를 넣는다.
예: 13일 01:00 에 14일자 QT 영상을 만든다.

```
QT 원고(sermons) → Claude 가 계획(plan.json) → QT 목소리 녹음 → 로컬 AI 그림 → MP4 굽기
   → 홈페이지용으로 줄이기(10MB 안팎) → 교회 파일 저장소에 올리기 → sermons.media_url 에 주소
   → 홈페이지 「오늘의 말씀 영상」 단추(오늘 글) · QT 글 창의 「말씀 영상」 단추(지난 날짜)
```

모두 교회 PC 안에서 돈다. 돈 드는 외부 서비스는 쓰지 않는다(Claude 구독, 교회 파일 저장소는 기존 것).
영상은 미리 올라가지만 주소에 난수가 들어 있고, 홈페이지는 QT 날짜가 되어야 그 주소를 내보낸다
(공개 뷰 qt_published 의 날짜 조건) — QT 글·음성과 같은 때 열린다.

## 파일

| 파일 | 하는 일 |
|---|---|
| `qt_motion.py` | 하루 한 편을 처음부터 끝까지 만든다 |
| `plan_prompt.md` | Claude 에게 주는 계획 작성 지침(대본·그림·장면) |
| `template/` | 영상 틀 — 계획(js/plan.js)을 읽어 화면을 만든다 |
| `sovits_bridge.mjs` | 영상 도구가 교회 QT 목소리(GPT-SoVITS)로 녹음하게 하는 연결 |
| `youtube.py` | (선택) 유튜브 로그인·올리기 — 기본은 쓰지 않는다 |
| `examples/2026-11-11.plan.json` | 계획 예(아모스 5:7-17) |
| `설치.bat` · `유튜브_연결.bat` · `매일예약_등록.bat` · `점검.bat` | 한 번씩 누르는 준비 단추 |

교회 PC 쪽 폴더(저장소 밖): `C:\qt-video\motion\`

- `script-to-motion\` 영상 도구(github.com/kstost/script-to-motion, MIT) + 고친 두 줄
- `work\<날짜>\` 그날의 계획·그림·프로젝트(다시 돌리면 이어서 한다)
- `out\qt_<날짜>.mp4` 완성 영상(원본) · `out\qt_<날짜>_web.mp4` 홈페이지에 올린 사본
- `config.json` 설정(없으면 기본값) · `client_secret.json` · `youtube_token.json` 유튜브 열쇠

## 처음 한 번 하는 일

1. `설치.bat` — 영상 도구를 `C:\qt-video\motion` 에 받는다.
2. `점검.bat` — 모두 ✓ 인지 확인.
3. `매일예약_등록.bat` — 매일 01:00 에 돌도록 Windows 작업 스케줄러에 등록.

(Supabase SQL `supabase/20261112_1100_qt_published_media_url.sql` 은 2026-11-12 실행됨.)

## 유튜브에도 올리려면 (선택)

기본은 올리지 않는다. 올리려면 `config.json` 에 `"youtube": true` 를 두거나 `--youtube` 를 붙인다. 먼저 연결이 필요하다.

1. console.cloud.google.com 에서 프로젝트를 만들고 **YouTube Data API v3** 를 '사용' 으로.
2. 'OAuth 동의 화면' 을 만들고(외부) **게시 상태를 '프로덕션'** 으로. '테스트' 로 두면 로그인이 7일마다 풀린다.
3. 'OAuth 클라이언트 ID > 데스크톱 앱' 의 JSON 을 `C:\qt-video\motion\client_secret.json` 으로 저장.
4. `유튜브_연결.bat` 실행 → 브라우저에서 교회 채널 계정으로 '허용'.

구글 심사를 받지 않은 API 프로젝트로 올린 영상은 유튜브가 **비공개로 잠근다**(예약 공개도 안 된다).
풀려면 'YouTube API 서비스 심사' 를 신청해 통과해야 한다(무료, 몇 주).

## 설정 (`C:\qt-video\motion\config.json`, 쓰는 것만 적는다)

```json
{
  "web_bitrate": "950k",
  "youtube": false,
  "image_model": "flux1-dev-Q4_K_S.gguf",
  "image_steps": 20,
  "max_images": 8,
  "youtube_playlist": "",
  "claude_model": "sonnet"
}
```

- `web_bitrate`: 홈페이지에 올리는 사본의 화질. 950k 면 1분 44초 영상이 9MB 쯤(저장소 1건 한도 100MB).
- `youtube`: true 면 유튜브에도 올린다(`publish_time` 에 예약 공개).
- 그림이 너무 오래 걸리면 `image_steps` 를 12 로, 또는 `image_model` 을 `flux1-schnell-Q4_K_S.gguf` + `image_steps` 4 로.

## 손으로 돌리기

```
python qt_motion.py --doctor                                  준비 상태
python qt_motion.py --date 2026-11-14                         그 날짜 한 편
python qt_motion.py --date 2026-11-14 --until render          굽기까지만
python qt_motion.py --date 2026-11-14 --youtube              유튜브에도 올림
```

- 멈췄다가 같은 명령을 다시 돌리면 끝난 단계는 건너뛴다(계획·녹음·그림·굽기·올리기 기록이 `work\<날짜>\` 에 남는다).
- 영상을 다시 올리려면 `work\<날짜>\site.json` 을 지우고 다시 돌린다(다시 구우려면 `render.sig` 도).
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
- 사람이 `media_url` 에 넣어 둔 다른 주소는 덮어쓰지 않는다(비었거나, 이 도구가 올린 주소·유튜브 주소일 때만 바꾼다).
- 유튜브에 올릴 때는 'AI 로 만든 콘텐츠' 표시를 켜고, 설명에도 적는다.
