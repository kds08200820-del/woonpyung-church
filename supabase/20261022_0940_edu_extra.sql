-- 교육 개설이 저장되지 않는 문제 (2026-10-22 담임목사 신고)
--  · 증상: 목회 행정 > 교육관리 > 교육 개설 > 저장 →
--    "Could not find the 'class_name' column of 'edu_records' in the schema cache"
--  · 원인: 2026-07-01 에 화면(기수·반·강의 자료실)만 올라가고 supabase/edu_extra.sql 은 운영 DB 에서 실행되지 않았다.
--    운영 DB 확인(칼럼 이름만, 2026-10-22): end_date·participants 는 있음 / cohort·class_name 칼럼, edu_materials 표 없음.
--    그래서 교육 개설·수정 저장, 교적 상세의 '수강 중 교육', 나의 정보의 '수강 중 교육'이 모두 막혀 있었다.
--  · 내용: edu_extra.sql 과 같다. 다시 실행해도 안전(if not exists / create or replace / drop policy if exists → create).
--    참석자 칸(participants)은 글자로 저장되므로 읽을 때 JSON 이 깨져 있어도 오류 없이 넘어가도록 edu_participant_keys() 로 읽는다.
--  · 칼럼 추가(nullable)·표·함수·정책·비공개 버킷 추가만 — 지우는 것 없음, 비파괴.
--
-- 되돌리기 (사람이 직접, 삭제 정책대로 이름만 바꿈):
--   drop policy if exists "edu_materials_storage_read" on storage.objects;
--   drop policy if exists "edu_materials_storage_write_admin" on storage.objects;
--   drop policy if exists "edu_records_read_participant" on public.edu_records;
--   alter table public.edu_materials rename to edu_materials_archived;
--   alter table public.edu_records rename column cohort to cohort_archived;
--   alter table public.edu_records rename column class_name to class_name_archived;
--   (함수 edu_participant_keys · edu_id_from_path · can_access_edu 와 버킷 edu_materials 는 남겨 두어도 무해)

-- 1) edu_records 확장 칼럼 (기간·기수·반·참석자)
alter table public.edu_records add column if not exists end_date date;
alter table public.edu_records add column if not exists cohort text;
alter table public.edu_records add column if not exists class_name text;
alter table public.edu_records add column if not exists participants text default '[]';

-- 2) 참석자 JSON([{name, key}…]) 에서 교적 매칭키만 꺼내기. 비었거나 깨졌으면 아무것도 돌려주지 않는다.
create or replace function public.edu_participant_keys(p text)
returns setof text language plpgsql immutable as $$
declare j jsonb;
begin
  begin
    j := nullif(btrim(coalesce(p, '')), '')::jsonb;
    if jsonb_typeof(j) = 'string' then j := (j #>> '{}')::jsonb; end if;
  exception when others then
    return;
  end;
  if j is null or jsonb_typeof(j) <> 'array' then return; end if;
  return query
    select e->>'key' from jsonb_array_elements(j) e
    where jsonb_typeof(e) = 'object' and coalesce(e->>'key', '') <> '';
end $$;

-- 3) 수강생 본인은 자신이 참석자로 등록된 교육을 조회할 수 있음(관리자 전용 정책에 추가, "나의 정보"·교적에서 조회용)
drop policy if exists "edu_records_read_participant" on public.edu_records;
create policy "edu_records_read_participant" on public.edu_records
  for select to authenticated
  using (
    exists (
      select 1 from public.member_links ml
      where ml.user_id = auth.uid()
        and ml.member_key is not null
        and ml.member_key in (select public.edu_participant_keys(edu_records.participants::text))
    )
  );

-- 4) 경로 첫 세그먼트를 uuid로 안전 변환(형식이 아니면 null)
create or replace function public.edu_id_from_path(p text)
returns uuid language plpgsql immutable as $$
declare v_id uuid;
begin
  begin
    v_id := split_part(p, '/', 1)::uuid;
  exception when others then
    v_id := null;
  end;
  return v_id;
end $$;

-- 5) 수강생 판별 함수: 관리자이거나, 해당 교육의 참석자(교적 매칭키)와 내 계정이 연결되어 있으면 true
create or replace function public.can_access_edu(p_edu_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (select 1 from public.admins a where a.uid = auth.uid())
    or exists (
      select 1
      from public.edu_records er
      join public.member_links ml on ml.user_id = auth.uid()
      where er.id = p_edu_id
        and ml.member_key is not null
        and ml.member_key in (select public.edu_participant_keys(er.participants::text))
    );
$$;

-- 6) 강의 자료실: 파일 목록 표(수강생만 조회, 관리자만 올리기/지우기)
create table if not exists public.edu_materials (
  id bigint generated always as identity primary key,
  edu_id uuid not null references public.edu_records(id) on delete cascade,
  title text not null,
  path text not null,
  size bigint,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.edu_materials enable row level security;

drop policy if exists "edu_materials_read" on public.edu_materials;
create policy "edu_materials_read" on public.edu_materials
  for select to authenticated using (public.can_access_edu(edu_id));

drop policy if exists "edu_materials_write_admin" on public.edu_materials;
create policy "edu_materials_write_admin" on public.edu_materials
  for all to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));

-- 7) Storage 버킷(비공개) — 객체 경로는 "{edu_id}/파일명" 형태로 저장
insert into storage.buckets (id, name, public)
values ('edu_materials', 'edu_materials', false)
on conflict (id) do nothing;

drop policy if exists "edu_materials_storage_read" on storage.objects;
create policy "edu_materials_storage_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'edu_materials' and public.can_access_edu(public.edu_id_from_path(name)));

drop policy if exists "edu_materials_storage_write_admin" on storage.objects;
create policy "edu_materials_storage_write_admin" on storage.objects
  for all to authenticated
  using (bucket_id = 'edu_materials' and exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (bucket_id = 'edu_materials' and exists (select 1 from public.admins a where a.uid = auth.uid()));

-- 8) 새 칼럼을 API 가 바로 알도록
notify pgrst, 'reload schema';
