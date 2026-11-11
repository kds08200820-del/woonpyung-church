-- 양육반 모임 기록: 한 모임에 저장되는 대목 수 60 → 200 (2026-11-11 담임목사 신고)
--  증상: 1~8강 진도를 한 모임 기록에 몰아 적으니(1~7강 56대목 + 8강 4대목 = 60), 8강 '5. 금하시는 교제'를 더 체크해도
--        저장되지 않고 다음 모임이 다시 5번부터 시작됨. 서버가 한 모임의 대목을 60개까지만 받아 맨 끝(8-5)을 조용히 버렸다.
--  고침: edu_meeting_save 의 대목 수 상한만 200 으로(13강 전체 115대목). 나머지는 20261111_1900 과 한 글자도 다르지 않다.
--  비파괴: 같은 이름·같은 인자의 함수를 바꿔 씀. 표·칼럼·자료 변경 없음. 다시 실행해도 안전.
--
-- 되돌리기:
--   supabase/20261111_1900_edu_disciple.sql 의 edu_meeting_save 부분(create or replace function public.edu_meeting_save … grant execute …)을 다시 실행
--   (되돌리면 다시 60대목까지만 저장된다)

create or replace function public.edu_meeting_save(p_edu uuid, p_date date, p_parts jsonb, p_memo text default null, p_attend jsonb default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_parts jsonb; v_mid bigint; r public.edu_records%rowtype; e jsonb; v_pid text; v_status text; v_name text; v_n integer := 0;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 저장할 수 있습니다.'); end if;
  if not public.edu_is_leader(p_edu) then return json_build_object('ok', false, 'why', 'leader', 'error', '이 반의 인도자만 저장할 수 있습니다.'); end if;
  select * into r from public.edu_records where id = p_edu;
  if not found then return json_build_object('ok', false, 'why', 'notfound', 'error', '반을 찾을 수 없습니다.'); end if;
  if p_date is null or p_date > current_date + 1 or p_date < current_date - 730 then
    return json_build_object('ok', false, 'why', 'date', 'error', '모임 날짜를 확인해 주십시오.');
  end if;
  if p_parts is not null and jsonb_typeof(p_parts) <> 'array' then return json_build_object('ok', false, 'why', 'parts', 'error', '진도 형식이 올바르지 않습니다.'); end if;
  select coalesce(jsonb_agg(v order by split_part(v, '-', 1)::int, split_part(v, '-', 2)::int), '[]'::jsonb) into v_parts
    from (select distinct x.v from jsonb_array_elements_text(coalesce(p_parts, '[]'::jsonb)) x(v)
           where x.v ~ '^[0-9]{1,2}-[0-9]{1,2}$' limit 200) s;   -- 60 → 200: 13강 전체가 115대목

  insert into public.edu_meetings (edu_id, meet_date, parts, memo)
  values (p_edu, p_date, v_parts, nullif(left(btrim(coalesce(p_memo, '')), 500), ''))
  on conflict (edu_id, meet_date) do update
    set parts = excluded.parts, memo = excluded.memo, voided_at = null, updated_at = now()
  returning id into v_mid;

  if p_attend is not null and jsonb_typeof(p_attend) = 'array' then
    for e in select * from jsonb_array_elements(p_attend) loop
      if jsonb_typeof(e) <> 'object' then continue; end if;
      v_pid := btrim(coalesce(e ->> 'pid', ''));
      v_status := coalesce(e ->> 'status', '');
      if v_pid = '' or v_status not in ('', '출석', '지각', '결석') then continue; end if;
      select p.name into v_name from public.edu_people(r.participants) p where public.edu_pid(p.name, p.key) = v_pid limit 1;
      if v_name is null then continue; end if;      -- 이 반 명단에 없는 사람은 받지 않는다
      insert into public.edu_meeting_attend (meeting_id, edu_id, member_key, member_name, status)
      values (v_mid, p_edu, v_pid, v_name, v_status)
      on conflict (meeting_id, member_key) do update set status = excluded.status, member_name = excluded.member_name, updated_at = now();
      v_n := v_n + 1;
    end loop;
  end if;
  return json_build_object('ok', true, 'id', v_mid, 'parts', v_parts, 'attend', v_n);
end $$;
revoke all on function public.edu_meeting_save(uuid, date, jsonb, text, jsonb) from public, anon;
grant execute on function public.edu_meeting_save(uuid, date, jsonb, text, jsonb) to authenticated;
