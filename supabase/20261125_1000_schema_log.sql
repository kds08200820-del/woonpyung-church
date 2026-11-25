-- ============================================================
--  운평장로교회 — SQL 실행 기록(schema_log)과 DB 구조 목록(schema_catalog) (2026-11-25 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  왜: supabase/ 의 SQL 파일 중 어느 것이 실제 DB 에 실행됐는지 적어 두는 곳이 없었다.
--      실행이 빠지면 화면은 「준비하고 있습니다」로 조용히 버텨서, 기능이 반쯤만 도는 것을 아무도 모른다.
--
--  들어 있는 것 (모두 비파괴: CREATE TABLE · CREATE OR REPLACE FUNCTION · INSERT 뿐):
--   1) schema_log(file, applied_at, note) : 실행한 SQL 파일 기록. 앞으로 SQL 파일 끝에 아래 한 줄을 넣는다.
--        insert into public.schema_log(file) values ('<파일 이름>') on conflict (file) do update set applied_at = now();
--   2) schema_catalog() : DB 에 있는 함수 · 표 · 칸 · 트리거 · 정책 · 색인의 *이름만*(자료 없음).
--        관리자 로그인이나 서버 키(service_role)로만 부를 수 있다.
--        tools/schema-check.mjs 가 이것과 SQL 파일을 견줘 「실행 안 된 것 같은 파일」을 알려 준다.
--   3) 2026-11-24 ~ 25 에 실행을 확인한 파일 넷을 기록해 둔다.
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · drop function if exists public.schema_catalog();
--    · alter table public.schema_log rename to schema_log_archived;   (DROP 하지 않는다)
-- ============================================================

create table if not exists public.schema_log (
  file       text primary key,
  applied_at timestamptz not null default now(),
  note       text
);
alter table public.schema_log enable row level security;
revoke all on public.schema_log from anon, authenticated;

create or replace function public.schema_catalog()
returns json language plpgsql stable security definer set search_path = public, pg_catalog as $$
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or exists (select 1 from public.admins a where a.uid = auth.uid())) then
    raise exception '관리자만 볼 수 있습니다.' using errcode = '42501';
  end if;
  return json_build_object(
    'at', now(),
    'functions', (select coalesce(json_agg(p.proname order by p.proname), '[]'::json)
                    from (select distinct p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace) p),
    'tables', (select coalesce(json_agg(c.relname order by c.relname), '[]'::json)
                 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')),
    'columns', (select coalesce(json_agg(c.relname || '.' || a.attname order by c.relname, a.attname), '[]'::json)
                  from pg_attribute a join pg_class c on c.oid = a.attrelid
                 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm') and a.attnum > 0 and not a.attisdropped),
    'triggers', (select coalesce(json_agg(t.tgname order by t.tgname), '[]'::json)
                   from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relnamespace = 'public'::regnamespace and not t.tgisinternal),
    'policies', (select coalesce(json_agg(p.tablename || '.' || p.policyname order by p.tablename, p.policyname), '[]'::json)
                   from pg_policies p where p.schemaname = 'public'),
    'indexes', (select coalesce(json_agg(i.relname order by i.relname), '[]'::json)
                  from pg_class i where i.relnamespace = 'public'::regnamespace and i.relkind = 'i'),
    'logged', (select coalesce(json_agg(json_build_object('file', l.file, 'at', l.applied_at) order by l.file), '[]'::json) from public.schema_log l)
  );
end $$;

revoke all on function public.schema_catalog() from public, anon;
grant execute on function public.schema_catalog() to authenticated, service_role;

-- 실행을 확인한 파일(2026-11-24 ~ 25, 실행 뒤 확인 질의까지 본 것)
insert into public.schema_log(file, note) values
  ('20261124_2330_member_match_approval.sql', '2026-11-24 실행 · 확인'),
  ('20261124_2355_member_match_push.sql', '2026-11-24 실행 · 확인'),
  ('20261125_0030_profiles_guard.sql', '2026-11-25 실행 · 확인'),
  ('20261125_0100_file_access.sql', '2026-11-25 실행 · 확인')
on conflict (file) do nothing;

insert into public.schema_log(file) values ('20261125_1000_schema_log.sql') on conflict (file) do update set applied_at = now();
