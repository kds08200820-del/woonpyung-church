-- ============================================================
--  영상 제작 스튜디오 확장 (2026-07, 1회 실행)
--  Supabase → SQL Editor 에 붙여넣고 Run.
--
--  · video_jobs 확장: 제작 설정(settings)·검토 데이터(review) 컬럼
--    상태 흐름: pending → processing → review(이미지 검토 대기)
--               → regen(선택 장면 재생성) / approved(승인) → done
--  · video_presets: 제작 프레임(프리셋) 저장 — 일관된 산출물용
--
--  되돌리기(참고):
--    alter table public.video_jobs drop column settings, drop column review;
--    alter table public.video_presets rename to video_presets_archived;
-- ============================================================

alter table public.video_jobs add column if not exists settings jsonb default '{}'::jsonb;
alter table public.video_jobs add column if not exists review   jsonb;

comment on column public.video_jobs.settings is '제작 설정: orientation/scene_count/voice/subtitle/instagram';
comment on column public.video_jobs.review   is '검토 데이터: scenes[{name,image_prompt,motion_prompt,subtitle,narration,image_url}], regen[]';

-- 제작 프레임(프리셋)
create table if not exists public.video_presets (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  settings   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.video_presets is '영상 제작 스튜디오 프리셋(제작 프레임) — 일관된 산출물을 위한 설정 저장';

alter table public.video_presets enable row level security;

drop policy if exists "admin all video_presets" on public.video_presets;
create policy "admin all video_presets" on public.video_presets for all
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
