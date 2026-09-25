-- 설교자의 성경 — 원격 업데이트: 지금 배포 중인 판 (관리 화면 "설치 관리 → 업데이트" 에서 적는다)
-- 앱은 인증할 때 license 함수(op:'update')로 이 표의 enabled 인 판을 읽어, 자기 판보다 새로우면 알린다.
create table if not exists public.app_release (
  id         serial primary key,
  version    text not null unique,                 -- 예: 3.6.0
  url        text not null default '',             -- R2 의 update-<판>.zip 공개 주소
  size       bigint not null default 0,
  sha256     text not null default '',
  full_only  boolean not null default false,       -- true 면 전체 설치 파일로만 설치 (음성·자료가 크게 바뀐 판)
  full_url   text not null default '',             -- 전체 설치 파일(exe) 공개 주소
  notes      text not null default '',             -- 공지문(바뀐 점)
  enabled    boolean not null default false,       -- 배포 켜기
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.app_release enable row level security;
drop policy if exists "admin all app_release" on public.app_release;
create policy "admin all app_release" on public.app_release for all
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
