-- ============================================================
--  운평장로교회 — 주일학교 주보 제작실용 달란트 읽기 API (프로그램 키 인증)
--  Supabase ▸ SQL Editor 에 통째로 붙여넣고 Run (여러 번 실행해도 안전)
--
--  [왜]
--   교회 PC 의 주보 제작 프로그램(주일학교/주보/studio)이 달란트 표를 채우려면
--   지금은 교사 계정으로 브라우저에 로그인해 있어야 한다. 로그인이 풀리면 자동 제작이 멈춘다.
--   → 프로그램에 넣어 둔 키 하나로 '주보에 싣는 값'만 읽어 가게 한다.
--
--  [무엇이 만들어지나]
--   1) api_keys                    : 프로그램 키 장부. 키 자체가 아니라 sha256 해시만 둔다.
--   2) ss_bulletin_talents(키,시작,끝) : 어린이별 이름·기간 달란트·누적 달란트·기간 QT 횟수
--
--  [권한 설계]
--   · 읽기 전용. 쓰기·수정·삭제 길이 없다.
--   · 내보내는 값은 주보 뒷면에 인쇄하는 것뿐(이름, 달란트 합, QT 횟수).
--     생년월일·연락처·매칭키·사유·사진은 내보내지 않는다.
--   · 키가 없거나 틀리거나 폐기됐으면 403. 키는 244비트 이상 난수라 추측할 수 없다.
--   · api_keys 는 관리자만 조회·폐기(revoked_at 기록)할 수 있고, 그 밖의 계정은 못 본다.
--
--  [부르는 법]
--   POST {SUPABASE_URL}/rest/v1/rpc/ss_bulletin_talents
--   헤더  apikey: (홈페이지 공개 열쇠, js/config.js 의 anon)   Content-Type: application/json
--   본문  {"p_key":"프로그램 키","p_from":"2026-11-08","p_to":"2026-11-14"}
--   응답  {"from":…,"to":…,"retrieved_at":…,"verified":true,
--          "rows":[{"name":…,"weekly":…,"total":…,"qt":…}, …]}
--
--  [키 폐기]  (관리자 계정으로, 또는 SQL Editor 에서)
--   -- update public.api_keys set revoked_at = now() where label = '주일학교 주보 제작실';
--
--  [되돌리기(롤백) — 삭제 정책에 따라 DROP 대신 RENAME]
--   -- revoke execute on function public.ss_bulletin_talents(text, date, date) from anon, authenticated;
--   -- alter table public.api_keys rename to api_keys_archived;
--   -- (함수는 표가 없으면 403 대신 오류를 낸다. 4주 뒤 사람이 직접:
--   --   drop function if exists public.ss_bulletin_talents(text, date, date);)
-- ============================================================

-- ── 1) 프로그램 키 장부 ──
create table if not exists public.api_keys (
  id            bigint generated always as identity primary key,
  label         text not null,                    -- 어느 프로그램의 키인지
  scope         text not null,                    -- 이 키로 부를 수 있는 API ('ss_bulletin')
  key_hash      text not null unique,             -- sha256(키) 16진수. 키 원문은 저장하지 않는다
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,                      -- 값이 있으면 폐기된 키
  last_used_at  timestamptz,
  use_count     bigint not null default 0
);

alter table public.api_keys enable row level security;

-- Supabase 기본 권한(anon·authenticated 전체)을 걷고, 로그인 계정에 조회·수정만 남긴다.
-- (그 조회·수정도 아래 정책으로 관리자만 통과한다.)
revoke all on public.api_keys from anon, authenticated;
grant select, update on public.api_keys to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'api_keys' and policyname = 'api_keys admin select') then
    create policy "api_keys admin select" on public.api_keys for select to authenticated
      using (exists (select 1 from public.admins a where a.uid = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'api_keys' and policyname = 'api_keys admin update') then
    create policy "api_keys admin update" on public.api_keys for update to authenticated
      using (exists (select 1 from public.admins a where a.uid = auth.uid()))
      with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
  end if;
end $$;

-- ── 2) 주보용 달란트 읽기 ──
--   weekly : p_from~p_to 사이 달란트 합(지급 +, 차감 -)
--   total  : 지금까지의 달란트 합 (교사 화면 ss_students().total 과 같은 셈)
--   qt     : p_from~p_to 사이 QT 인증 횟수
create or replace function public.ss_bulletin_talents(p_key text, p_from date, p_to date)
returns json language plpgsql security definer volatile
set search_path = public as $$
declare
  v_id   bigint;
  v_rows json;
begin
  if p_key is null or length(p_key) < 32 then
    raise sqlstate 'PT403' using message = 'invalid api key';
  end if;

  select k.id into v_id
  from public.api_keys k
  where k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
    and k.scope = 'ss_bulletin'
    and k.revoked_at is null;

  if v_id is null then
    raise sqlstate 'PT403' using message = 'invalid api key';
  end if;

  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 then
    raise sqlstate 'PT400' using message = 'invalid date range';
  end if;

  update public.api_keys
     set last_used_at = now(), use_count = use_count + 1
   where id = v_id;

  select coalesce(json_agg(json_build_object(
           'name', r.name, 'weekly', r.weekly, 'total', r.total, 'qt', r.qt) order by r.name), '[]'::json)
    into v_rows
  from (
    select g.name,
           coalesce((select sum(t.amount) from public.ss_talents t
                      where t.member_key = g.member_key
                        and t.talent_date between p_from and p_to), 0)::bigint as weekly,
           coalesce((select sum(t.amount) from public.ss_talents t
                      where t.member_key = g.member_key), 0)::bigint as total,
           (select count(*) from public.ss_submissions s
             where s.member_key = g.member_key and s.stype = 'QT'
               and s.sub_date between p_from and p_to)::bigint as qt
    from public.gyojeok g
    where g.ss_role = '어린이'
  ) r;

  return json_build_object(
    'from', p_from, 'to', p_to, 'retrieved_at', now(),
    'verified', true, 'rows', v_rows);
end $$;

revoke all on function public.ss_bulletin_talents(text, date, date) from public;
grant execute on function public.ss_bulletin_talents(text, date, date) to anon, authenticated;

-- ── 3) 주보 제작실 키 등록 (해시만. 키 원문은 교회 PC 의 studio/private 에만 있다) ──
insert into public.api_keys (label, scope, key_hash) values
  ('주일학교 주보 제작실', 'ss_bulletin', '7bc499b66875406e7d00c0c00c68bf8ff3c0eb480333d4dc82a384464b6c0476')
on conflict (key_hash) do nothing;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
