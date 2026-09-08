-- ============================================================
--  우리들 소식 — 주일학교 인증샷 중복 게시 방지(서버 쪽 안전장치)
--  2026-09-08
--
--  [왜]
--   홈 '주일학교 성장기'의 교사용 [📣 우리들 소식으로 올리기] 버튼이,
--   이미 게시된 인증샷인데도 누가 로그인하든 늘 다시 떠서 다른 교사가
--   또 누르면 같은 사진이 '우리들 소식'에 두 번 올라갈 수 있었다.
--   화면(js/ss-growth.js)은 고쳤지만, 화면을 거치지 않는 경로까지 막으려면
--   DB가 같은 인증샷 주소를 두 번 받지 않도록 해 두는 것이 확실하다.
--
--  [무엇]
--   album_photos.url 에 부분 유니크 인덱스를 만든다.
--   대상은 주일학교 인증샷 파일(주소에 /f/ss-cert/ 포함)뿐이라,
--   일반 앨범 사진·링크 공유(같은 링크를 여러 성도가 올릴 수 있음)에는 영향이 없다.
--
--  [실행 전 확인] ※ 이미 중복 게시된 사진이 있으면 인덱스 생성이 실패한다.
--   먼저 supabase/20260908_2350_album_photos_ss_cert_dedupe.sql 을 (사람이) 실행해
--   중복 행을 정리한 뒤 이 파일을 실행한다.
--   중복이 있는지 건수만 보려면:
--     select url, count(*) from public.album_photos
--      where url like '%/f/ss-cert/%' group by url having count(*) > 1;
--
--  [파괴적 변경 없음] 테이블·칼럼·데이터는 건드리지 않는다. 인덱스 하나만 추가.
--
--  [되돌리기(롤백)]
--   drop index if exists public.album_photos_ss_cert_url_uniq;
-- ============================================================

create unique index if not exists album_photos_ss_cert_url_uniq
  on public.album_photos (url)
  where url like '%/f/ss-cert/%';
