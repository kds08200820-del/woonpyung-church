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
window.SUPABASE_URL = "https://cetacttsdwzxjzkyozgd.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_qfq4Hvs4tF_1ZIezPoMojg_h6XNw01G";

/* --- 연말정산 신청 알림 이메일(FormSubmit) ---
   계정/키 없이 관리자 이메일(kds08200820@gmail.com)로 알림이 발송됩니다(민감정보 제외).
   아래 값은 실제 이메일을 숨기는 FormSubmit '별칭(alias)'으로, 이미 활성화 완료됨.
   비어 있으면 이메일 알림만 꺼지고, 신청·관리자 조회는 정상 동작합니다. */
window.FORMSUBMIT_EMAIL = "a1f1dbcdaacadfa2efd1e9872a575b67";
