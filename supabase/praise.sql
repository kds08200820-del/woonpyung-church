-- ============================================================
-- 운평장로교회 — 마하나임 찬양단 · 콘티(세트리스트) 테이블
-- Supabase ▸ SQL Editor 에 붙여넣고 Run 하세요. (한 번만, 다시 실행해도 안전)
--   · 로그인 교인: 콘티 목록 보기
--   · 관리자(admins 테이블): 콘티 등록·수정·삭제
-- 악보·음원 파일 공유는 기존 resources 테이블/버킷을 그대로 사용합니다(추가 실행 불필요).
-- ============================================================

create table if not exists public.praise_setlists (
  id           bigint generated always as identity primary key,
  service_date date,                              -- 예배/모임 날짜
  title        text not null,                     -- 콘티 제목(예: 7/20 주일 3부 찬양)
  service      text,                              -- 예배·모임 구분(주일1부·수요·새벽·연습 등)
  leader       text,                              -- 인도자
  songs        jsonb not null default '[]'::jsonb, -- [{title,key,bpm,youtube,memo}]
  memo         text,                              -- 콘티 전체 메모/전달사항
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz default now()
);

create index if not exists praise_setlists_date_idx
  on public.praise_setlists (service_date desc, id desc);

alter table public.praise_setlists enable row level security;

-- 로그인 교인은 모두 조회 가능
drop policy if exists "praise_read_authenticated" on public.praise_setlists;
create policy "praise_read_authenticated" on public.praise_setlists
  for select to authenticated using (true);

-- 등록·수정·삭제는 관리자만
drop policy if exists "praise_write_admin" on public.praise_setlists;
create policy "praise_write_admin" on public.praise_setlists
  for all to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
