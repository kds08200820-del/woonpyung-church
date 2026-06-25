/* ============================================================
   운평장로교회 — 외부 서비스 설정
   ============================================================ */

/* --- 푸시 알림(OneSignal) ---
   OneSignal App ID. 비어 있으면 푸시 기능 꺼짐(사이트는 정상). */
window.ONESIGNAL_APP_ID = "a22a1ff9-5a05-4915-b70f-b0c6df6ccd71";

/* --- 회원/로그인/게시판(Supabase) ---
   Supabase 프로젝트의 Project URL 과 anon(public) key 를 붙여넣으세요.
   (Supabase ▸ Project Settings ▸ API 에서 확인)
   이 두 값은 공개되어도 안전한 공개키입니다. 보안은 DB의 RLS 정책으로 지킵니다.
   비어 있으면 로그인·게시판 기능은 "준비 중"으로 표시되고 사이트는 정상 동작합니다. */
window.SUPABASE_URL = "";
window.SUPABASE_ANON_KEY = "";
