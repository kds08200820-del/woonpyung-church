-- ============================================================
--  운평장로교회 — 교적 인증 신청 알림(푸시) (2026-11-24 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  목사님: "홈페이지에 가입해서 정회원 신청을 한 사람은 알람을 통해 알 수 있어야 합니다."
--
--  [무엇]
--   · 신청이 들어오면 관리자 기기에 「교적 인증 신청 N건」 알림.
--   · 관리자가 승인하거나 돌려보내면 신청한 사람의 기기에 결과 알림.
--   · 보내기는 Apps Script(apps-script/member-match-push.gs)가 5분마다 member_match_push_feed 를 읽어서 한다.
--     피드는 공개 키로 부르므로 열쇠 · 건수 · 번호 · 승인 여부만 내보낸다(이름 · 생년월일 없음).
--   · 기기 판별: 관리자가 로그인해 홈페이지를 열면 그 기기에 OneSignal 태그 mm=<관리자 알림 열쇠>(js/layout.js),
--     신청한 사람이 내 정보 화면을 열면 mq=<그 신청의 알림 열쇠>(js/finance-member.js). 열쇠는 무작위 32자.
--
--  들어 있는 것 (모두 비파괴: ADD COLUMN(null 가능) · CREATE OR REPLACE FUNCTION 뿐):
--   [칸]   member_match_requests.push_key (text, null 가능)
--   [함수] match_member(이름, 생년월일)        : (바뀜) 신청 줄에 알림 열쇠를 함께 만들고 돌려준다. 나머지는 20261124_2330 과 같다
--          my_match_request()                  : (바뀜) 기다리는 신청이면 알림 열쇠도 돌려준다
--          member_match_admin_push_key()       : (관리자) 관리자 알림 열쇠 — 없으면 만든다(app_settings 'member_match_push_key')
--          member_match_push_feed(p_after)     : (공개) 알림 피드
--   필요한 것: 20261124_2330_member_match_approval.sql · app_settings.sql
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · Apps Script: 함수 목록에서 deleteMemberMatchPushTrigger 실행(알림만 멈춘다)
--    · 함수: drop function if exists public.member_match_admin_push_key(), public.member_match_push_feed(bigint);
--            match_member · my_match_request 는 20261124_2330_member_match_approval.sql 을 다시 실행하면 예전 모양이 된다
--    · 칸: alter table public.member_match_requests rename column push_key to push_key_archived;   (DROP 하지 않는다)
-- ============================================================

-- ── 1) 신청 줄의 알림 열쇠 ────────────────────────────────────
alter table public.member_match_requests add column if not exists push_key text;

-- ── 2) 신청 (본인) — 20261124_2330 과 같고, 알림 열쇠만 더한다 ──
create or replace function public.match_member(p_name text, p_birth text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_birth text := coalesce(p_birth, '');
  v_link  public.member_links%rowtype;
  v_n     int;
  v_push  text := replace(gen_random_uuid()::text, '-', '');
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
  insert into public.member_match_requests (user_id, member_key, member_name, push_key)
  values (v_uid, v_name || '|' || v_birth, v_name, v_push);

  return json_build_object('ok', true, 'status', '승인대기', 'name', v_name,
    'message', '신청을 받았습니다. 관리자가 확인하면 정회원이 됩니다.', 'pushKey', v_push);
end $$;

revoke all on function public.match_member(text, text) from public, anon;
grant execute on function public.match_member(text, text) to authenticated;

-- ── 3) 내 신청 상태 (본인) — 기다리는 신청이면 알림 열쇠도 ────
create or replace function public.my_match_request()
returns json language sql security definer stable set search_path = public as $$
  select coalesce((
    select json_build_object('status', r.status, 'name', r.member_name, 'at', r.created_at,
                             'pushKey', case when r.status = '대기' then r.push_key end)
      from public.member_match_requests r
     where r.user_id = auth.uid() and r.status in ('대기', '돌려보냄')
     order by r.id desc limit 1
  ), json_build_object('status', ''));
$$;

revoke all on function public.my_match_request() from public, anon;
grant execute on function public.my_match_request() to authenticated;

-- ── 4) 관리자 알림 열쇠 (관리자만) — 없으면 만든다 ────────────
create or replace function public.member_match_admin_push_key()
returns json language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  if not exists (select 1 from public.admins where uid = auth.uid()) then
    return json_build_object('ok', false);
  end if;
  select value into v_key from public.app_settings where key = 'member_match_push_key';
  if coalesce(v_key, '') = '' then
    insert into public.app_settings (key, value, updated_at)
    values ('member_match_push_key', replace(gen_random_uuid()::text, '-', ''), now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
      where coalesce(public.app_settings.value, '') = '';
    select value into v_key from public.app_settings where key = 'member_match_push_key';
  end if;
  return json_build_object('ok', true, 'key', v_key);
end $$;

revoke all on function public.member_match_admin_push_key() from public, anon;
grant execute on function public.member_match_admin_push_key() to authenticated;

-- ── 5) 알림 피드 (공개 키로 부른다) ───────────────────────────
--   max_id  : 가장 큰 신청 번호(Apps Script 가 다음 확인의 기준으로 삼는다)
--   key     : 관리자 알림 열쇠(아직 없으면 null — 관리자가 홈페이지를 한 번 열면 생긴다)
--   n       : p_after 보다 뒤에 들어와 아직 기다리는 신청 수(하루 안의 것만, 이미 정회원이 된 계정 제외)
--   decided : 하루 안에 결과가 난 신청 — 번호 · 그 신청의 알림 열쇠 · 승인 여부.
--             관리자가 권한 관리 표에서 직접 정회원으로 연결한 경우도 승인으로 본다.
create or replace function public.member_match_push_feed(p_after bigint default 0)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'max_id', coalesce((select max(r.id) from public.member_match_requests r), 0),
    'key', (select nullif(s.value, '') from public.app_settings s where s.key = 'member_match_push_key'),
    'n', (select count(*)::int
            from public.member_match_requests r
            left join public.member_links l on l.user_id = r.user_id
           where r.id > coalesce(p_after, 0)
             and r.status = '대기'
             and r.created_at > now() - interval '1 day'
             and coalesce(l.member_status, '준회원') <> '정회원'),
    'decided', coalesce((
      select json_agg(json_build_object('id', x.id, 'key', x.push_key, 'ok', x.ok) order by x.id)
        from (
          select r.id, r.push_key, (r.status = '승인') as ok
            from public.member_match_requests r
           where r.status in ('승인', '돌려보냄')
             and r.push_key is not null
             and r.decided_at > now() - interval '1 day'
          union all
          select r.id, r.push_key, true
            from public.member_match_requests r
            join public.member_links l on l.user_id = r.user_id
           where r.status = '대기'
             and r.push_key is not null
             and l.member_status = '정회원'
             and l.updated_at > now() - interval '1 day'
        ) x), '[]'::json));
$$;

revoke all on function public.member_match_push_feed(bigint) from public;
grant execute on function public.member_match_push_feed(bigint) to anon, authenticated;

-- ── 실행 뒤 확인(건수 · 이름만) ───────────────────────────────
--   select public.member_match_push_feed(0);     -- {"max_id" : …, "key" : null 또는 32자, "n" : 0, "decided" : []}
--   select count(*) from information_schema.columns where table_name = 'member_match_requests' and column_name = 'push_key';   -- 1
