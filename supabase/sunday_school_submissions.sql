-- ============================================================
--  운평장로교회 — 주일학교 QT·필사 인증 기록
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (1회, 여러 번 실행해도 안전)
--
--  · 어린이가 QT/필사 인증샷(R2 저장 URL)을 올리면 기록으로 남음.
--  · 교사단(교사·부장·서기·관리자)이 좋아요(liked_by)와 확인(confirmed_by) 처리.
--  · 어린이는 자기 기록만 조회/올리기/삭제, 교사단은 전체 관리.
--
--  [되돌리기(롤백)] DROP 대신 RENAME 정책:
--   -- alter table public.ss_submissions rename to ss_submissions_archived;
-- ============================================================

create table if not exists public.ss_submissions (
  id           bigint generated always as identity primary key,
  member_key   text not null,                    -- 어린이 매칭키
  child_name   text,                             -- 어린이 이름(표시용)
  stype        text not null default 'QT',       -- 'QT' | '필사'
  sub_date     date not null default current_date,
  photo_url    text,                             -- R2 인증샷 URL
  photo_key    text,                             -- R2 키(삭제용)
  note         text,
  liked_by     jsonb not null default '[]'::jsonb,  -- 좋아요 누른 교사 이름 배열
  confirmed_by text,                             -- 확인한 교사 이름(null=미확인)
  confirmed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists ss_submissions_member_key_idx on public.ss_submissions(member_key);
create index if not exists ss_submissions_date_idx       on public.ss_submissions(sub_date);

alter table public.ss_submissions enable row level security;
grant select, insert, update, delete on public.ss_submissions to authenticated;

-- 조회: 교사단 전체, 어린이는 자기 것만
drop policy if exists ss_submissions_select on public.ss_submissions;
create policy ss_submissions_select on public.ss_submissions for select
  using ( public.is_ss_teacher() or member_key in (select public.my_member_keys()) );

-- 올리기: 본인 기록(어린이) 또는 교사단(대리 등록)
drop policy if exists ss_submissions_insert on public.ss_submissions;
create policy ss_submissions_insert on public.ss_submissions for insert
  with check ( public.is_ss_teacher() or member_key in (select public.my_member_keys()) );

-- 수정(좋아요·확인): 교사단만
drop policy if exists ss_submissions_update on public.ss_submissions;
create policy ss_submissions_update on public.ss_submissions for update
  using ( public.is_ss_teacher() ) with check ( public.is_ss_teacher() );

-- 삭제: 교사단 또는 본인(잘못 올린 사진 정리)
drop policy if exists ss_submissions_delete on public.ss_submissions;
create policy ss_submissions_delete on public.ss_submissions for delete
  using ( public.is_ss_teacher() or member_key in (select public.my_member_keys()) );

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
