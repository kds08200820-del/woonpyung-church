-- 오늘의 예배 편집본 — 담임목사(admins)가 그날 예배 순서(슬라이드)를 고쳐 저장하면 정회원 모두에게 그 순서로 보인다
--   되돌리기: drop table if exists public.worship_edits;
create table if not exists public.worship_edits (
  date        date        not null,
  kind        text        not null check (kind in ('sunday', 'wed', 'dawn')),
  slides      jsonb       not null default '[]'::jsonb,
  updated_by  uuid        references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (date, kind)
);
alter table public.worship_edits enable row level security;

drop policy if exists worship_edits_read on public.worship_edits;
create policy worship_edits_read on public.worship_edits
  for select to authenticated using (true);

drop policy if exists worship_edits_admin_write on public.worship_edits;
create policy worship_edits_admin_write on public.worship_edits
  for all to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));

grant select on public.worship_edits to authenticated;
grant insert, update, delete on public.worship_edits to authenticated;
