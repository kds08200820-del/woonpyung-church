-- ============================================================
--  운평장로교회 — 교적 매칭키가 바뀌면 그 사람의 기록이 새 키로 따라간다 (2026-09-30)
--  Supabase ▸ SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
--
--  ※ 2026-10-03: 이 파일은 운영 DB 에 실행되지 않았고, 20261003_2130_ss_link_repair.sql 이
--    이 내용을 모두 담아 보완했다(출석 겹침 오류·SQL Editor 권한·내부 함수 권한·옛 키에 남은 달란트).
--    이 파일 대신 그 파일만 실행할 것.
--
--  [왜]
--   교적관리에서 교적을 고쳐 저장하면(js/finance-api.js updateGyojeok) 매칭키가
--   '이름|생년월일'로 다시 만들어진다. 이름·생년월일을 바로잡거나 옛 형식의 키가
--   정리되면 키가 바뀌는데, 지금까지는 교적 행만 바뀌고
--     · member_links(홈페이지 계정 ↔ 교적)          · ss_talents(달란트)
--     · ss_submissions(QT·필사·미션 인증)            · attendance(출석)
--     · offerings(헌금) · donation_receipts(기부금영수증) · member_files(개인 파일)
--   는 옛 키에 그대로 남았다. 그러면 그 어린이의 홈페이지 계정은 교적과 이어지지 않아
--   ss_my_role() 이 빈 값 → 대시보드가 학생으로 보지 않음 → 'QT 인증 올리기' 칸이 사라지고,
--   부모 화면(ss_my_children)은 새 키로 아이를 찾아 달란트·인증이 0으로 보인다.
--   (2026-09-29 실제 발생: 어린이 계정 대시보드에 달란트는 보이는데 QT 인증 칸이 없음)
--
--  [만드는 것]
--   1) rekey_member_records(옛키, 새키, 이름) — 위 표들의 키를 옮긴다(내부용, 건수 반환)
--   2) gyojeok_rekey 트리거 — 교적 member_key 가 바뀌면 자동으로 1)을 부른다
--      · 동명이인 보호: 옛 키를 아직 쓰는 다른 교적이 있거나, 새 키를 이미 쓰는 다른 교적이
--        있으면 아무것도 옮기지 않는다(엉뚱한 사람의 기록이 섞이는 사고 방지)
--   3) ss_link_check() — 관리자·재정권한자용 점검: 끊긴 계정 연결(orphan)과
--      주일학교 칸이 비어 있는데 달란트·인증 기록이 있는 교적(no_role)
--   4) rekey_member(옛키, 새키) — 관리자·재정권한자용: 이미 끊긴 연결을 잇는다
--   교적관리 화면(js/gyojeok.js '계정 연결 점검' 상자)이 3)·4)를 쓴다.
--
--  [이미 끊긴 어린이를 고치는 법]
--   · 교적관리 ▸ 교적 명단 맨 위 '계정 연결 점검' 상자에서 [연결 고치기]
--   · 또는 SQL Editor 에서:  select public.ss_link_check();
--                          select public.rekey_member('이름|옛생년월일', '이름|새생년월일');
--
--  [되돌리기(롤백)]
--   -- drop trigger if exists gyojeok_rekey on public.gyojeok;
--   -- drop function if exists public.gyojeok_rekey_tg();
--   -- drop function if exists public.rekey_member(text, text);
--   -- drop function if exists public.ss_link_check();
--   -- drop function if exists public.rekey_member_records(text, text, text);
--   -- 잘못 옮긴 기록은 교적 키를 옛 키로 돌린 뒤 select public.rekey_member('새키', '옛키'); 로 되돌린다.
-- ============================================================

-- ── 1) 기록 옮기기(내부용) ─────────────────────────────────────
--    p_name 을 주면 달란트·인증·출석의 표시 이름도 새 이름으로 맞춘다(이름 오타를 고친 경우).
--    헌금 장부(offerings)는 매칭키만 옮기고 헌금자 이름·금액은 손대지 않는다.
create or replace function public.rekey_member_records(p_old text, p_new text, p_name text default null)
returns json language plpgsql security definer
set search_path = public as $$
declare
  n_link int := 0; n_spouse int := 0; n_tal int := 0; n_sub int := 0;
  n_att int := 0; n_off int := 0; n_rec int := 0; n_file int := 0;
begin
  if coalesce(p_old, '') = '' or coalesce(p_new, '') = '' or p_old = p_new then
    return json_build_object('ok', false, 'error', '옛 키와 새 키를 모두 주세요.');
  end if;

  -- 홈페이지 계정 연결(본인 키·배우자 키)
  update public.member_links set member_key = p_new, updated_at = now() where member_key = p_old;
  get diagnostics n_link = row_count;
  update public.member_links set spouse_key = p_new where spouse_key = p_old;
  -- 다른 교적이 이 사람을 배우자로 가리키는 키
  update public.gyojeok set spouse_key = p_new where spouse_key = p_old;
  get diagnostics n_spouse = row_count;

  -- 주일학교 달란트·인증
  if to_regclass('public.ss_talents') is not null then
    update public.ss_talents
       set member_key = p_new, child_name = coalesce(nullif(p_name, ''), child_name)
     where member_key = p_old;
    get diagnostics n_tal = row_count;
  end if;
  if to_regclass('public.ss_submissions') is not null then
    update public.ss_submissions
       set member_key = p_new, child_name = coalesce(nullif(p_name, ''), child_name)
     where member_key = p_old;
    get diagnostics n_sub = row_count;
  end if;

  -- 출석 (2026-09-27 이후 표 — 아직 안 만들었으면 건너뜀)
  if to_regclass('public.attendance') is not null then
    update public.attendance
       set member_key = p_new, member_name = coalesce(nullif(p_name, ''), member_name)
     where member_key = p_old;
    get diagnostics n_att = row_count;
  end if;

  -- 헌금·기부금영수증·개인 파일 — 매칭키(연결)만 옮긴다
  if to_regclass('public.offerings') is not null then
    update public.offerings set member_key = p_new where member_key = p_old;
    get diagnostics n_off = row_count;
  end if;
  if to_regclass('public.donation_receipts') is not null then
    update public.donation_receipts set member_key = p_new where member_key = p_old;
    get diagnostics n_rec = row_count;
    update public.donation_receipts set included_keys = array_replace(included_keys, p_old, p_new)
     where p_old = any (included_keys);
  end if;
  if to_regclass('public.member_files') is not null then
    update public.member_files set member_key = p_new where member_key = p_old;
    get diagnostics n_file = row_count;
  end if;

  return json_build_object(
    'ok', true, 'old_key', p_old, 'new_key', p_new,
    'links', n_link, 'spouse_refs', n_spouse, 'talents', n_tal, 'submissions', n_sub,
    'attendance', n_att, 'offerings', n_off, 'receipts', n_rec, 'files', n_file);
end $$;
revoke all on function public.rekey_member_records(text, text, text) from public;

-- ── 2) 교적 매칭키가 바뀌면 자동으로 따라가기 ───────────────────
create or replace function public.gyojeok_rekey_tg()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  if old.member_key is not distinct from new.member_key then return null; end if;
  if coalesce(old.member_key, '') = '' or coalesce(new.member_key, '') = '' then return null; end if;
  -- 동명이인 보호: 옛 키를 아직 쓰는 교적, 새 키를 이미 쓰는 교적이 따로 있으면 옮기지 않는다
  if exists (select 1 from public.gyojeok g where g.id <> new.id and g.member_key = old.member_key) then return null; end if;
  if exists (select 1 from public.gyojeok g where g.id <> new.id and g.member_key = new.member_key) then return null; end if;
  perform public.rekey_member_records(old.member_key, new.member_key, new.name);
  return null;
end $$;

drop trigger if exists gyojeok_rekey on public.gyojeok;
create trigger gyojeok_rekey
after update of member_key on public.gyojeok
for each row execute function public.gyojeok_rekey_tg();

-- ── 3) 점검(관리자·재정권한자) ─────────────────────────────────
--    orphan  : 홈페이지 계정의 키로 교적을 찾을 수 없다 → new_key 는 같은 이름의 교적이
--              정확히 하나(그리고 다른 계정에 안 이어짐)일 때만 제안한다
--    no_role : 주일학교 칸이 비어 있는데 달란트·인증 기록이 있다(학생 칸이 지워진 어린이)
create or replace function public.ss_link_check()
returns json language plpgsql security definer stable
set search_path = public as $$
declare v_out json;
begin
  if not public.is_finance() then return '[]'::json; end if;
  select coalesce(json_agg(x order by x->>'kind', x->>'name'), '[]'::json) into v_out
  from (
    select json_build_object(
      'kind', 'orphan',
      'name', coalesce(l.member_name, ''),
      'old_key', l.member_key,
      'new_key', (select min(g.member_key) from public.gyojeok g
                   where g.name = l.member_name and coalesce(g.member_key, '') <> ''
                     and not exists (select 1 from public.member_links l2 where l2.member_key = g.member_key)
                  having count(*) = 1),
      'talents',     (select count(*) from public.ss_talents     t where t.member_key = l.member_key),
      'submissions', (select count(*) from public.ss_submissions s where s.member_key = l.member_key),
      'offerings',   (select count(*) from public.offerings      o where o.member_key = l.member_key)
    ) as x
    from public.member_links l
    where coalesce(l.member_key, '') <> ''
      and not exists (select 1 from public.gyojeok g where g.member_key = l.member_key)
    union all
    select json_build_object(
      'kind', 'no_role',
      'name', g.name,
      'old_key', g.member_key,
      'new_key', null,
      'talents',     (select count(*) from public.ss_talents     t where t.member_key = g.member_key),
      'submissions', (select count(*) from public.ss_submissions s where s.member_key = g.member_key),
      'offerings',   0
    ) as x
    from public.gyojeok g
    where coalesce(g.ss_role, '') = '' and coalesce(g.member_key, '') <> ''
      and (exists (select 1 from public.ss_talents     t where t.member_key = g.member_key)
        or exists (select 1 from public.ss_submissions s where s.member_key = g.member_key))
  ) q;
  return v_out;
end $$;
revoke all on function public.ss_link_check() from public;
grant execute on function public.ss_link_check() to authenticated;

-- ── 4) 끊긴 연결 잇기(관리자·재정권한자) ───────────────────────
--    새 키의 교적이 정확히 하나 있고, 옛 키를 쓰는 교적이 없을 때만 옮긴다.
create or replace function public.rekey_member(p_old text, p_new text)
returns json language plpgsql security definer
set search_path = public as $$
declare v_cnt int; v_name text;
begin
  if not public.is_finance() then
    return json_build_object('ok', false, 'error', '관리자·재정권한자만 실행할 수 있습니다.');
  end if;
  if coalesce(p_old, '') = '' or coalesce(p_new, '') = '' or p_old = p_new then
    return json_build_object('ok', false, 'error', '옛 키와 새 키를 모두 주세요.');
  end if;
  select count(*), min(g.name) into v_cnt, v_name from public.gyojeok g where g.member_key = p_new;
  if v_cnt <> 1 then
    return json_build_object('ok', false, 'error', '새 키의 교적이 정확히 하나여야 합니다. (지금 ' || v_cnt || '건)');
  end if;
  if exists (select 1 from public.gyojeok g where g.member_key = p_old) then
    return json_build_object('ok', false, 'error', '옛 키를 쓰는 교적이 아직 있습니다. 교적을 먼저 정리해 주세요.');
  end if;
  return public.rekey_member_records(p_old, p_new, v_name);
end $$;
revoke all on function public.rekey_member(text, text) from public;
grant execute on function public.rekey_member(text, text) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
