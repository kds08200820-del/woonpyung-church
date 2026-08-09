-- ============================================================
--  운평장로교회 — 주일학교 달란트 항목(프리셋)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (1회, 여러 번 실행해도 안전)
--
--  · 자주 쓰는 지급 항목(출석·암송 등)과 기본 달란트 값을 저장.
--  · 대시보드 지급 화면에서 '내용' 칸을 클릭하면 목록으로 표시됨.
--  · 교사단(교사·부장·서기·관리자)이 항목을 추가/수정/삭제.
--
--  [되돌리기(롤백)] DROP 대신 RENAME 정책:
--   -- alter table public.ss_talent_items rename to ss_talent_items_archived;
-- ============================================================

create table if not exists public.ss_talent_items (
  id          bigint generated always as identity primary key,
  name        text not null,                 -- 항목 이름 (예: 출석)
  amount      integer not null default 1,    -- 기본 달란트 값
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.ss_talent_items enable row level security;
grant select, insert, update, delete on public.ss_talent_items to authenticated;

drop policy if exists ss_talent_items_select on public.ss_talent_items;
create policy ss_talent_items_select on public.ss_talent_items for select
  using ( public.is_ss_teacher() );

drop policy if exists ss_talent_items_write on public.ss_talent_items;
create policy ss_talent_items_write on public.ss_talent_items for all
  using ( public.is_ss_teacher() ) with check ( public.is_ss_teacher() );

-- 기본 항목(비어 있을 때 1회만 채움 — 이후 교사단이 자유롭게 수정)
insert into public.ss_talent_items (name, amount, sort)
select v.name, v.amount, v.sort
from (values ('출석', 1, 1), ('성경 암송', 3, 2), ('성경 읽기', 2, 3), ('전도', 5, 4), ('착한 일', 2, 5)) as v(name, amount, sort)
where not exists (select 1 from public.ss_talent_items);

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
