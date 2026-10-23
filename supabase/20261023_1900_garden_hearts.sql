-- ============================================================
-- 신앙 정원 — 하트를 눌러도 달란트가 오르지 않던 것 고침 (2026-10-23 저녁 담임목사 알림)
--
-- [무엇]
-- · 갤러리(우리들 소식) 하트 = 앨범 좋아요(album_like): 0 → 1 달란트, 하루 20번까지 (보상 정한 '하트 하나에 1달란트')
-- · 글의 '사랑해요(❤️)' 반응도 하트: 새 종류 reaction_heart 1 달란트·XP 1·하루 20번 (다른 반응은 그대로 '반응' XP 1)
--   예전에 '반응'으로 이미 적힌 사랑해요는 다시 주지 않는다
-- · 성장기 하트(heart_given): 장부 시각을 인증 날짜 정오 → 처음 셈하는 때(지금)로. 오늘의 할 일에 바로 체크되고, 지난날 한도에 걸리지 않는다
-- · 이미 적힌 장부는 바꾸지 않는다(그 뒤로 누르는 하트부터)
-- [함수] garden_candidates_v2 다시 (20261023_1500 의 것과 같고 맨 앞 기본 후보 부분만 다름)
-- [주의] 20261023_1500 을 다시 실행하면 garden_candidates_v2 가 예전 것으로 돌아가므로 이 파일도 다시 실행한다
-- [실행] SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전)
--
-- [되돌리기(롤백)]
--   update public.garden_rules set talent = 0, daily_cap = 5, label = '{"ko":"앨범 좋아요","en":"Album like"}'::jsonb
--    where church_id is null and kind = 'album_like';
--   update public.garden_rules set active = false where church_id is null and kind = 'reaction_heart';
--   garden_candidates_v2 는 20261023_1500_garden_wallet_shop.sql 의 4) 절 함수를 다시 실행
-- ============================================================

begin;

update public.garden_rules set talent = 1, daily_cap = 20, label = '{"ko":"갤러리 하트","en":"Gallery heart"}'::jsonb, updated_at = now()
 where church_id is null and kind = 'album_like';
insert into public.garden_rules (church_id, kind, label, xp, talent, daily_cap, active, sort) values
  (null, 'reaction_heart', '{"ko":"글에 하트(사랑해요)","en":"Heart on a post"}', 1, 1, 20, true, 74)
on conflict (kind) where church_id is null do nothing;

create or replace function public.garden_candidates_v2(p_uid uuid, p_church uuid)
returns table (kind text, ref text, happened_at timestamptz, source text, amount numeric)
language plpgsql stable security definer set search_path = public as $$
declare c public.garden_churches; v_key text;
begin
  select * into c from public.garden_churches where id = p_church;
  if not found then return; end if;
  -- 하트(2026-10-23 저녁 고침): 성장기 하트는 누른 뒤 처음 셈하는 때(지금)로 적는다 — 인증 날짜로 적으면 오늘의 할 일에 안 잡히고
  --   지난날 한도에 걸린다. 글의 '사랑해요(❤️)' 반응은 하트 = 'reaction_heart'(1달란트). 예전에 '반응'으로 적힌 것은 다시 주지 않는다
  return query
    with b as (select * from public.garden_candidates(p_uid, p_church))
    select x.kind, x.ref, case when x.kind = 'heart_given' then now() else x.happened_at end, x.source, null::numeric
      from b x where not (x.kind = 'reaction' and x.ref like '%|사랑해요')
    union all
    select 'reaction_heart'::text, x.ref, x.happened_at, x.source, null::numeric
      from b x where x.kind = 'reaction' and x.ref like '%|사랑해요'
       and not exists (select 1 from public.garden_ledger l where l.church_id = p_church and l.user_id = p_uid and l.kind = 'reaction' and l.ref = x.ref);
  if coalesce(c.settings->>'adapter', '') <> 'woonpyung' then return; end if;
  if to_regclass('public.member_links') is not null then
    select ml.member_key into v_key from public.member_links ml where ml.user_id = p_uid and coalesce(ml.member_key, '') <> '';
  end if;
  if v_key is null then return; end if;
  -- 주일학교 달란트: 어린이 본인 계정(교적 매칭키)의 장부 한 줄 = 마이월렛 한 줄(차감도 그대로)
  if to_regclass('public.ss_talents') is not null then
    return query select 'ss_talent'::text, t.id::text, t.created_at, 'woonpyung_adapter'::text, t.amount::numeric
                   from public.ss_talents t where t.member_key = v_key and t.amount <> 0;
  end if;
  -- 교육 이수: 참석자/이수자로 올라 있고 교육이 끝난(끝 날짜·없으면 교육 날짜가 지난) 교육의 정한 달란트
  if to_regclass('public.edu_records') is not null and to_regprocedure('public.edu_participant_keys(text)') is not null then
    return query execute
      'select ''edu_done''::text, e.id::text, ((coalesce(e.end_date, e.edu_date) + time ''18:00'') at time zone $2), ''woonpyung_adapter''::text, e.talent_reward::numeric
         from public.edu_records e
        where coalesce(e.talent_reward, 0) > 0 and coalesce(e.end_date, e.edu_date) <= (now() at time zone $2)::date
          and $1 in (select public.edu_participant_keys(e.participants::text))'
      using v_key, c.timezone;
  end if;
  -- 주일학교 인증: 나(어린이) 또는 내 자녀의 QT·필사·미션 인증 한 건 = 마음(XP) 한 줄
  if to_regclass('public.ss_submissions') is not null then
    return query execute
      'select case s.stype when ''QT'' then ''ss_qt'' when ''필사'' then ''ss_pilsa'' else ''ss_mission'' end::text,
              ''ss'' || s.id::text, ((s.sub_date + time ''12:00'') at time zone $2), ''woonpyung_adapter''::text, null::numeric
         from public.ss_submissions s
        where s.stype in (''QT'', ''필사'', ''미션'') and s.member_key in (select k.member_key from public.garden_ss_kids($1) k)'
      using p_uid, c.timezone;
  end if;
  return;
end $$;

revoke all on function public.garden_candidates_v2(uuid, uuid) from public, anon, authenticated;

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
