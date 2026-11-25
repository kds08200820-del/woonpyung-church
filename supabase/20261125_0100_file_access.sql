-- ============================================================
--  운평장로교회 — 지키는 폴더의 파일을 볼 수 있는 사람 (2026-11-25 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  교적 사진 · 문서 첨부 · 성도별 자료 · 자료실 · 재정 그림 · 증명서 도장은 이제 공개 주소(/f/)로 열리지 않는다.
--  파일 워커(cloudflare/worker.js 의 /sign-urls)가 이 함수에 물어, 볼 수 있는 사람에게만 6시간짜리 서명 주소를 준다.
--
--  들어 있는 것 (비파괴: CREATE OR REPLACE FUNCTION 하나):
--   file_access(p_keys text[]) → 그중 지금 로그인한 사람이 볼 수 있는 키만 돌려준다.
--     · 올린 사람 본인(키의 둘째 마디가 내 계정)
--     · gyojeok/ · financereceipt/ · churchseal/ : 재정 권한(관리자 포함, is_finance)
--     · affairsdocuments/                         : 관리자
--     · archive/ (성도별 자료)                    : 관리자, 또는 그 자료(member_files)를 볼 수 있는 본인 · 배우자
--     · resources/ (자료실)                       : 로그인한 성도
--   부른 사람의 권한으로 돈다(security invoker) — member_files 는 그 사람에게 보이는 줄만 본다.
--   필요한 것: finance_migration.sql(is_finance) · member_files.sql · profiles-admin.sql(admins)
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · drop function if exists public.file_access(text[]);
--      (워커는 이 함수가 없으면 아무 주소도 내주지 않는다 — 워커를 예전 판으로 되돌리면 공개 주소로 돌아간다)
-- ============================================================

create or replace function public.file_access(p_keys text[])
returns text[] language plpgsql stable security invoker set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_out   text[] := '{}';
  v_fin   boolean;
  v_admin boolean;
  k       text;
  f       text;
begin
  if v_uid is null or p_keys is null then return v_out; end if;
  v_fin   := coalesce(public.is_finance(), false);
  v_admin := exists (select 1 from public.admins a where a.uid = v_uid);
  foreach k in array p_keys[1:300] loop
    continue when k is null or k = '' or char_length(k) > 300 or position('..' in k) > 0 or split_part(k, '/', 3) = '';   -- 폴더/올린 사람/파일 이름
    f := split_part(k, '/', 1);
    if split_part(k, '/', 2) = v_uid::text then
      v_out := v_out || k;
    elsif f in ('gyojeok', 'financereceipt', 'churchseal') then
      if v_fin then v_out := v_out || k; end if;
    elsif f = 'affairsdocuments' then
      if v_admin then v_out := v_out || k; end if;
    elsif f = 'archive' then
      if v_admin or exists (select 1 from public.member_files m
                             where m.file_key = k or position('/f/' || k in coalesce(m.file_url, '')) > 0) then
        v_out := v_out || k;
      end if;
    elsif f = 'resources' then
      v_out := v_out || k;
    end if;
  end loop;
  return v_out;
end $$;

revoke all on function public.file_access(text[]) from public, anon;
grant execute on function public.file_access(text[]) to authenticated;

-- ── 실행 뒤 확인(이름만) ──────────────────────────────────────
--   select proname, prosecdef from pg_proc where proname = 'file_access';   -- file_access | false
