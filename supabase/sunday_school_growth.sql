-- ============================================================
--  운평장로교회 — 우리들 소식 '주일학교 성장기' (QT·필사 인증 자동 게시)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (1회, 여러 번 실행해도 안전)
--
--  [동작]
--   · 앨범 카테고리에 '주일학교 성장기' 추가
--   · 어린이가 QT/필사 인증샷을 올리면(ss_submissions INSERT)
--     우리들 소식에 자동 게시(album_photos INSERT, 작성자=올린 계정)
--   · 대시보드에서 인증을 삭제하면 게시글도 자동 삭제
--   · 성장기 게시글은 본인 + 교사단(교사·부장·서기·관리자)이 수정/삭제 가능
--
--  [되돌리기(롤백)]
--   -- drop trigger if exists ss_submissions_publish_album on public.ss_submissions;
--   -- drop trigger if exists ss_submissions_unpublish_album on public.ss_submissions;
--   -- drop function if exists public.ss_submission_publish_album();
--   -- drop function if exists public.ss_submission_unpublish_album();
--   -- drop policy if exists album_update_ss_teacher on public.album_photos;
--   -- drop policy if exists album_delete_ss_teacher on public.album_photos;
--   -- delete from public.album_categories where name = '주일학교 성장기';  -- (사람이 실행)
-- ============================================================

-- 1) 앨범 카테고리 추가
insert into public.album_categories (name, sort) values ('주일학교 성장기', 15)
on conflict (name) do nothing;

-- 2) 인증-게시글 연결 칼럼 (nullable — 기존 데이터 영향 없음)
alter table public.ss_submissions add column if not exists album_id bigint;

-- 3) 인증 업로드 → 우리들 소식 자동 게시
create or replace function public.ss_submission_publish_album()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_album_id bigint;
begin
  if coalesce(new.photo_url, '') = '' or auth.uid() is null then return new; end if;
  insert into public.album_photos (category, url, key, caption, user_id, author_name)
  values ('주일학교 성장기', new.photo_url, new.photo_key,
          new.stype || ' 성장기록 🌱 (' || to_char(new.sub_date, 'YYYY.MM.DD') || ')',
          auth.uid(), coalesce(nullif(new.child_name, ''), '주일학교'))
  returning id into v_album_id;
  update public.ss_submissions set album_id = v_album_id where id = new.id;
  return new;
end $$;

drop trigger if exists ss_submissions_publish_album on public.ss_submissions;
create trigger ss_submissions_publish_album
after insert on public.ss_submissions
for each row execute function public.ss_submission_publish_album();

-- 4) 인증 삭제 → 게시글도 삭제
create or replace function public.ss_submission_unpublish_album()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if old.album_id is not null then
    delete from public.album_photos where id = old.album_id;
  end if;
  return old;
end $$;

drop trigger if exists ss_submissions_unpublish_album on public.ss_submissions;
create trigger ss_submissions_unpublish_album
after delete on public.ss_submissions
for each row execute function public.ss_submission_unpublish_album();

-- 5) 성장기 게시글: 교사단(+관리자) 수정/삭제 허용 (본인 수정/삭제는 기존 정책 유지)
drop policy if exists album_update_ss_teacher on public.album_photos;
create policy album_update_ss_teacher on public.album_photos
  for update using ( category = '주일학교 성장기' and public.is_ss_teacher() )
  with check ( public.is_ss_teacher() );

drop policy if exists album_delete_ss_teacher on public.album_photos;
create policy album_delete_ss_teacher on public.album_photos
  for delete using ( category = '주일학교 성장기' and public.is_ss_teacher() );

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
