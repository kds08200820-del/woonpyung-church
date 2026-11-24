-- ============================================================
--  운평장로교회 — 교적 인증을 「신청 → 관리자 승인」으로 (2026-11-24 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  지금까지: 내 정보 화면에서 이름 + 생년월일을 넣어 교적과 맞으면 그 자리에서 정회원이 됐다.
--  이제부터: 본인 확인을 사람이 한다. 넣은 이름 + 생년월일은 「신청」으로만 남고, 관리자가 권한 관리 화면에서 승인해야 정회원이 된다.
--            이미 정회원인 계정은 그대로다(이 파일은 member_links 의 기존 줄을 건드리지 않는다).
--
--  들어 있는 것 (모두 비파괴: CREATE TABLE · CREATE OR REPLACE FUNCTION 뿐):
--   1) member_match_requests : 교적 인증 신청. 화면에서 바로 읽고 쓰는 길은 없고(권한 · 정책 없음) 아래 함수로만 다룬다.
--   2) 함수
--      match_member(이름, 생년월일)      : (바뀜) 신청만 남긴다. 교적과 맞는지는 돌려주지 않는다(맞는지 알려 주면 남의 생년월일을 맞혀 볼 수 있다).
--                                         하루 다섯 번까지. 이미 정회원이면 아무것도 바꾸지 않는다.
--      my_match_request()                : 내 가장 최근 신청의 상태(대기 · 돌려보냄)와 신청한 이름
--      list_match_requests()             : (관리자) 기다리는 신청 목록 — 교적에 있는지, 그 교적에 이미 연결된 다른 계정이 몇인지 함께
--      decide_match_request(번호, 승인)  : (관리자) 승인하면 정회원으로 연결(admin_set_member 와 같은 방식), 아니면 돌려보냄
--   필요한 것: finance-membership.sql(member_links) · gyojeok.sql · offerings.sql(spouse_key) · admins · profiles
--
--  함께 할 일: 옛 Apps Script(apps-script/finance-api.gs)의 match 는 저장소에서 꺼 두었다 — Apps Script 편집기에서 다시 배포해야 실제로 꺼진다.
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · match_member 를 예전처럼: supabase/finance_migration.sql 의 76 ~ 99행(create or replace function public.match_member …)을 다시 실행
--    · 함수: drop function if exists public.my_match_request(), public.list_match_requests(), public.decide_match_request(bigint, boolean);
--    · 표: alter table public.member_match_requests rename to member_match_requests_archived;   (DROP 하지 않는다)
-- ============================================================

-- ── 1) 교적 인증 신청 ─────────────────────────────────────────
create table if not exists public.member_match_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  member_key  text not null,                      -- 신청한 '이름|YYYYMMDD'
  member_name text not null,
  status      text not null default '대기',       -- 대기 | 승인 | 돌려보냄 | 바뀜(본인이 다시 신청해 앞의 것이 닫힘)
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid
);
create index if not exists member_match_requests_user_idx on public.member_match_requests (user_id, created_at desc);
create index if not exists member_match_requests_wait_idx on public.member_match_requests (id) where status = '대기';

-- 화면(REST)에서 직접 읽고 쓰지 못하게: RLS 를 켜고 정책을 두지 않는다. 아래 함수(security definer)만 이 표를 다룬다.
alter table public.member_match_requests enable row level security;
revoke all on public.member_match_requests from anon, authenticated;

-- ── 2) 신청 (본인) ────────────────────────────────────────────
create or replace function public.match_member(p_name text, p_birth text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_birth text := coalesce(p_birth, '');
  v_link  public.member_links%rowtype;
  v_n     int;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '로그인이 필요합니다.');
  end if;
  if v_name = '' or char_length(v_name) > 40 or position('|' in v_name) > 0 or v_birth !~ '^[0-9]{8}$' then
    return json_build_object('ok', false, 'error', '이름과 생년월일(YYYYMMDD)을 정확히 입력하세요.');
  end if;

  -- 이미 정회원이면 그대로 둔다(다른 교적으로 바꾸는 일은 관리자가 한다)
  select * into v_link from public.member_links where user_id = v_uid;
  if found and v_link.member_status = '정회원' then
    return json_build_object('ok', true, 'status', '정회원', 'name', coalesce(v_link.member_name, ''));
  end if;

  -- 한 계정의 신청은 차례로(동시에 눌러도 횟수가 새지 않게), 하루 다섯 번까지
  perform pg_advisory_xact_lock(hashtext('member_match:' || v_uid::text));
  select count(*) into v_n from public.member_match_requests
   where user_id = v_uid and created_at > now() - interval '24 hours';
  if v_n >= 5 then
    return json_build_object('ok', false, 'error', '교적 인증 신청은 하루 다섯 번까지입니다. 내일 다시 해 주세요.');
  end if;

  -- 기다리던 앞의 신청은 닫고(한 계정에 기다리는 신청은 하나) 새로 남긴다
  update public.member_match_requests set status = '바뀜', decided_at = now()
   where user_id = v_uid and status = '대기';
  insert into public.member_match_requests (user_id, member_key, member_name)
  values (v_uid, v_name || '|' || v_birth, v_name);

  return json_build_object('ok', true, 'status', '승인대기', 'name', v_name,
    'message', '신청을 받았습니다. 관리자가 확인하면 정회원이 됩니다.');
end $$;

revoke all on function public.match_member(text, text) from public, anon;
grant execute on function public.match_member(text, text) to authenticated;

-- ── 3) 내 신청 상태 (본인) ────────────────────────────────────
create or replace function public.my_match_request()
returns json language sql security definer stable set search_path = public as $$
  select coalesce((
    select json_build_object('status', r.status, 'name', r.member_name, 'at', r.created_at)
      from public.member_match_requests r
     where r.user_id = auth.uid() and r.status in ('대기', '돌려보냄')
     order by r.id desc limit 1
  ), json_build_object('status', ''));
$$;

revoke all on function public.my_match_request() from public, anon;
grant execute on function public.my_match_request() to authenticated;

-- ── 4) 기다리는 신청 목록 (관리자) ────────────────────────────
--   matched : 신청한 이름|생년월일이 지금 교적에 있는가
--   linked  : 그 교적에 이미 정회원으로 연결된 다른 계정 수(0 이 보통)
--   이미 정회원이 된 계정의 신청(관리자가 표에서 직접 연결한 경우)은 목록에서 빠진다.
create or replace function public.list_match_requests()
returns json language sql security definer stable set search_path = public as $$
  select coalesce(json_agg(t.item order by t.id), '[]'::json) from (
    select r.id, json_build_object(
      'id', r.id, 'uid', r.user_id,
      'signupName', coalesce(p.name, ''), 'email', coalesce(p.email, ''),
      'name', r.member_name, 'birth', split_part(r.member_key, '|', 2),
      'matched', exists (select 1 from public.gyojeok g where g.member_key = r.member_key),
      'linked', (select count(*) from public.member_links o
                  where o.member_key = r.member_key and o.member_status = '정회원' and o.user_id <> r.user_id),
      'at', r.created_at
    ) as item
      from public.member_match_requests r
      left join public.profiles p on p.id = r.user_id
      left join public.member_links l on l.user_id = r.user_id
     where r.status = '대기'
       and coalesce(l.member_status, '준회원') <> '정회원'
       and exists (select 1 from public.admins a where a.uid = auth.uid())
  ) t;
$$;

revoke all on function public.list_match_requests() from public, anon;
grant execute on function public.list_match_requests() to authenticated;

-- ── 5) 승인 · 돌려보냄 (관리자) ───────────────────────────────
create or replace function public.decide_match_request(p_id bigint, p_approve boolean)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_r      public.member_match_requests%rowtype;
  v_spouse text;
begin
  if not exists (select 1 from public.admins where uid = auth.uid()) then
    return json_build_object('ok', false, 'error', '관리자만 가능합니다.');
  end if;
  select * into v_r from public.member_match_requests where id = p_id for update;
  if not found or v_r.status <> '대기' then
    return json_build_object('ok', false, 'error', '이미 처리했거나 없는 신청입니다.');
  end if;

  if coalesce(p_approve, false) then
    select coalesce(g.spouse_key, '') into v_spouse from public.gyojeok g where g.member_key = v_r.member_key limit 1;
    if not found then
      return json_build_object('ok', false, 'error', '교적에 없는 이름 · 생년월일입니다. 아래 표의 회원 칸에서 교적을 골라 연결해 주세요.');
    end if;
    insert into public.member_links (user_id, member_status, member_key, member_name, spouse_key, updated_at)
    values (v_r.user_id, '정회원', v_r.member_key, v_r.member_name, nullif(v_spouse, ''), now())
    on conflict (user_id) do update set
      member_status = '정회원',
      member_key    = excluded.member_key,
      member_name   = excluded.member_name,
      spouse_key    = excluded.spouse_key,
      updated_at    = now();
    update public.member_match_requests set status = '승인', decided_at = now(), decided_by = auth.uid() where id = p_id;
  else
    update public.member_match_requests set status = '돌려보냄', decided_at = now(), decided_by = auth.uid() where id = p_id;
  end if;
  return json_build_object('ok', true);
end $$;

revoke all on function public.decide_match_request(bigint, boolean) from public, anon;
grant execute on function public.decide_match_request(bigint, boolean) to authenticated;

-- ── 실행 뒤 확인(건수 · 이름만) ───────────────────────────────
--   select count(*) from public.member_match_requests;                                   -- 0 (처음)
--   select proname from pg_proc where proname in ('match_member','my_match_request','list_match_requests','decide_match_request') order by 1;   -- 4줄
--   select public.my_match_request();                                                     -- {"status" : ""}
