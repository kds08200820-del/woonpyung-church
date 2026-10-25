-- 1부 예배 종료 (2026-10-25 담임목사 지시)
--  목회자 또는 방송실 담당이 정원 첫 화면의 '예배 종료'를 누르면 1부가 끝난 것으로 기록되고, 방송실이 곧바로 2부 카운트다운을 전체 화면으로 열 수 있다.
--  · 기록은 church_settings(key='worship_end') 한 줄에 둔다 — 새 표 없음. 그 표는 관리자만 읽고 쓰므로 아래 함수(security definer)로만 다룬다.
--    data = { date: 'YYYY-MM-DD'(한국 날짜), part: 1, at: 'ISO 시각', by: uid }
--  · worship_end(p_part, p_undo)   : 목회자(member_links.can_pastor)·방송실 담당(can_broadcast)·관리자만. 오늘 그 부를 종료로 기록(p_undo=true 면 종료 취소).
--  · worship_end_state()           : 누구나 읽는다(공개 정보: 오늘 몇 부가 끝났는지). 오늘 기록이 아니면 null.
--  · 비파괴: 함수 둘 추가 + church_settings 에 한 줄(없으면 만들고 있으면 바꿈). 지우는 것 없음.
--    이 SQL 을 실행하기 전에도 화면은 지금처럼 동작한다('예배 종료' 단추가 나타나지 않는다).
--
-- 되돌리기:
--   update public.church_settings set data = '{}'::jsonb where key = 'worship_end';   -- 종료 기록 비우기
--   drop function if exists public.worship_end(integer, boolean);        -- 함수는 자료를 담지 않으므로 지워도 기록은 그대로다
--   drop function if exists public.worship_end_state();

create or replace function public.worship_end(p_part integer default 1, p_undo boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_today text := to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD');
  v_ok boolean;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인이 필요합니다.'); end if;
  v_ok := exists (select 1 from public.admins where uid = auth.uid())
       or coalesce((select can_pastor or can_broadcast from public.member_links where user_id = auth.uid()), false);
  if not v_ok then return json_build_object('ok', false, 'why', 'role', 'error', '목회자 또는 방송실 담당만 예배를 종료할 수 있습니다.'); end if;
  if p_part is null or p_part < 1 or p_part > 3 then return json_build_object('ok', false, 'why', 'part', 'error', '몇 부인지 알 수 없습니다.'); end if;

  if p_undo then
    update public.church_settings set data = '{}'::jsonb, updated_at = now() where key = 'worship_end' and data ->> 'date' = v_today and (data ->> 'part')::int = p_part;
    return json_build_object('ok', true, 'undone', true, 'state', null);
  end if;

  insert into public.church_settings (key, data, updated_at)
  values ('worship_end', jsonb_build_object('date', v_today, 'part', p_part, 'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'by', auth.uid()), now())
  on conflict (key) do update set data = excluded.data, updated_at = now();
  return json_build_object('ok', true, 'state', (select data - 'by' from public.church_settings where key = 'worship_end'));
end $$;
revoke all on function public.worship_end(integer, boolean) from public, anon;
grant execute on function public.worship_end(integer, boolean) to authenticated;

create or replace function public.worship_end_state()
returns json language sql stable security definer set search_path = public as $$
  select (data - 'by')::json
    from public.church_settings
   where key = 'worship_end'
     and data ->> 'date' = to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD')
$$;
revoke all on function public.worship_end_state() from public;
grant execute on function public.worship_end_state() to anon, authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
