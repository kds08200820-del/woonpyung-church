-- ============================================================
--  우리들 소식 — 인스타그램·유튜브 링크 게시 지원
--  Supabase → SQL Editor 에 붙여넣고 RUN 하세요. (여러 번 실행해도 안전)
--  (album.sql · album-social.sql 이 먼저 실행되어 있어야 합니다.)
-- ============================================================

-- 링크 게시물의 원본 주소(사진 게시물은 null)
alter table public.album_photos add column if not exists link_url text;

-- album_feed 뷰에 새 컬럼이 반영되도록 재생성
drop view if exists public.album_feed;
create view public.album_feed as
select
  p.*,
  coalesce(l.cnt, 0) as like_count,
  coalesce(c.cnt, 0) as comment_count
from public.album_photos p
left join (select photo_id, count(*)::int cnt from public.album_likes    group by photo_id) l on l.photo_id = p.id
left join (select photo_id, count(*)::int cnt from public.album_comments group by photo_id) c on c.photo_id = p.id;
