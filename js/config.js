/* ============================================================
   운평장로교회 — 외부 서비스 설정
   ============================================================ */

/* --- 푸시 알림(OneSignal) ---
   OneSignal App ID. 비어 있으면 푸시 기능 꺼짐(사이트는 정상). */
window.ONESIGNAL_APP_ID = "a22a1ff9-5a05-4915-b70f-b0c6df6ccd71";

/* --- 회원/로그인/게시판(Supabase) — 로컬/프로덕션 자동 분리 ---
   두 값 모두 공개돼도 안전한 공개키입니다. 실제 보안은 DB의 RLS 정책으로 지킵니다.

   환경 판별: 브라우저에는 NODE_ENV가 없으므로 접속 호스트로 판별합니다.
     · localhost / 127.0.0.1 → development (로컬 Supabase)
     · 그 외 도메인          → production (원격 Supabase)
   window.APP_ENV = "development" | "production" 을 이 스크립트보다 먼저 지정하면 강제 전환됩니다.

   안전장치: 개발(development) 환경인데 URL이 원격(*.supabase.co)이면 즉시 에러로 중단합니다.
   (실수로 로컬 개발 중 프로덕션 DB에 연결하는 것을 차단) */
(function () {
  var host = (location.hostname || "").toLowerCase();
  var isLocal = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]";
  var env = window.APP_ENV || (isLocal ? "development" : "production");
  window.APP_ENV = env;

  // 로컬: supabase start 기본 데모 키(로컬에서만 동작). 프로덕션: 공개 publishable 키.
  var LOCAL = {
    url: "http://127.0.0.1:54321",
    anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE"
  };
  var PROD = {
    url: "https://cetacttsdwzxjzkyozgd.supabase.co",
    anon: "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G"
  };
  var cfg = env === "development" ? LOCAL : PROD;
  window.SUPABASE_URL = cfg.url;
  window.SUPABASE_ANON_KEY = cfg.anon;

  // 안전장치: 개발 환경에서 원격 Supabase 연결 시도 시 중단
  if (env === "development" && /\.supabase\.co/i.test(window.SUPABASE_URL)) {
    throw new Error("[config] 개발 환경(development)에서 원격 Supabase(" + window.SUPABASE_URL + ")로 연결하려 합니다. 로컬(supabase start · http://127.0.0.1:54321)만 사용하세요.");
  }
})();

/* --- 파일 업로드(Cloudflare R2 Worker) ---
   Cloudflare에서 Worker를 배포한 뒤 받은 주소를 넣으세요.
   예: "https://church-files.<계정>.workers.dev"
   비어 있으면 사진/파일 업로드 기능은 자동으로 숨겨집니다(사이트는 정상). */
window.R2_UPLOAD_URL = "https://church-files.kds08200820.workers.dev";

/* --- 재정 API (Apps Script 웹앱) ---
   구글시트(교적·재정) 보안 API의 웹 앱 URL.
   공개돼도 안전: 모든 요청을 Supabase 로그인 토큰으로 서버(Apps Script)가 검증하며,
   본인 헌금은 본인만, 재정관리는 권한자만 접근됩니다.
   비어 있으면 헌금조회·재정관리 메뉴만 "준비 중"으로 표시되고 사이트는 정상 동작합니다. */
window.FINANCE_API_URL = "https://script.google.com/macros/s/AKfycbxdwH46NrPMVvkQHBKbyyfvO2UiuWTB8HarNx9UmcxGJsJR4xn6Ey166SWDMTPbVoQ/exec";

/* --- 연말정산 신청 알림 이메일(FormSubmit) ---
   계정/키 없이 관리자 이메일(kds08200820@gmail.com)로 알림이 발송됩니다(민감정보 제외).
   아래 값은 실제 이메일을 숨기는 FormSubmit '별칭(alias)'으로, 이미 활성화 완료됨.
   비어 있으면 이메일 알림만 꺼지고, 신청·관리자 조회는 정상 동작합니다. */
window.FORMSUBMIT_EMAIL = "a1f1dbcdaacadfa2efd1e9872a575b67";

/* --- 나의 도서관(구글 드라이브 책 목록 Apps Script 웹앱) ---
   apps-script/library-api.gs 를 본인 계정에 배포한 뒤(폴더 ID 입력),
   받은 웹앱 주소(/exec)를 아래에 넣으세요.
   비어 있으면 목회행정 '나의 도서관'은 "설정 필요"로 표시됩니다(사이트는 정상). */
window.LIBRARY_API_URL = "https://script.google.com/macros/s/AKfycby7e_8SmhXLpzOZMrpaMFo5dsoT27qf7Y5jfLr9Ud20CfmOfMTHEos08KmOcv7X3dkY/exec";
/* 책 폴더 ID(또는 이름). 비우면 Apps Script 안의 FOLDER_ID 사용.
   드라이브 폴더 주소 .../folders/XXXX 의 XXXX 부분. */
window.LIBRARY_FOLDER_ID = "1AvTRhMLV1ZSIBTSEEa-SbXKhE8U1V67V";
