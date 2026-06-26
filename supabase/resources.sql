-- ============================================================
-- 운평장로교회 — 양육 자료실(Supabase Storage)
-- Supabase ▸ SQL Editor 에 붙여넣고 Run 하세요. (한 번만)
-- 로그인 교인: 목록/다운로드, 관리자(admins): 업로드/삭제
-- ============================================================

-- 1) 비공개 버킷 생성
insert into storage.buckets (id, name, public)
values ('resources', 'resources', false)
on conflict (id) do nothing;

-- 2) 로그인 회원은 목록 보기·다운로드(select) 가능
drop policy if exists "resources_read_authenticated" on storage.objects;
create policy "resources_read_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'resources');

-- 3) 관리자만 업로드(insert)
drop policy if exists "resources_insert_admin" on storage.objects;
create policy "resources_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'resources' and auth.uid() in (select uid from public.admins));

-- 4) 관리자만 덮어쓰기(update)
drop policy if exists "resources_update_admin" on storage.objects;
create policy "resources_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'resources' and auth.uid() in (select uid from public.admins));

-- 5) 관리자만 삭제(delete)
drop policy if exists "resources_delete_admin" on storage.objects;
create policy "resources_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'resources' and auth.uid() in (select uid from public.admins));
