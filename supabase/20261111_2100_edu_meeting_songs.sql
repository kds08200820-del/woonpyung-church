-- 강의실 제자훈련 양육반: 모임마다 함께 부를 찬양 (2026-11-11 담임목사 지시 — "매 수업마다 함께 부를 찬양을 모두의 찬양 db 에서 불러와 함께 볼 수 있도록")
--  · 화면: classroom.html(js/disciple.js) — 인도자가 반 화면에서 모임 날짜를 고르고 모두의 찬양(modu/ccm-data.js, window.CCMS)에서 곡을 고른다.
--    수강생·인도자는 '이번 모임 찬양'에서 곡 목록을 보고, 곡마다 모두의 성경 악보 보기(modu/index.html#ccm=번호)로 함께 연다.
--  · 모임 기록(edu_meetings)과 따로 둔다 — 찬양은 모임 전에 미리 고르는 일이 많고, 미리 고른 날짜가 '모임 횟수'·출석 기준에 들어가면 안 되기 때문.
--
--  표(새로)
--   edu_meeting_songs : 반·날짜마다 한 줄 — songs [{b:'c', n:번호}] (b: 'c' 모두의 찬양, 'h' 새찬송가 — 지금 화면은 'c' 만 고른다)
--                       읽기: 그 반의 인도자·수강생·관리자(edu_my_role) / 쓰기: 아래 함수로만(표에 직접 쓰기 막음)
--  함수
--   edu_songs_save(반, 날짜, 곡 jsonb) : 인도자 — 그 날짜의 찬양을 저장(같은 날짜는 고쳐 씀, 빈 목록이면 비움). 12곡까지, 날짜는 2년 전~60일 뒤
--  · 앞서 실행한 supabase/20261111_1900_edu_disciple.sql 의 edu_my_role · edu_is_leader 를 쓴다(그 파일을 먼저 실행해야 한다).
--  · 비파괴: 표 1개·함수 1개·정책 추가만. 다시 실행해도 안전(create table if not exists / create or replace / drop policy if exists → create).
--
-- 되돌리기 (DROP 대신 RENAME — 삭제 정책대로, 실제 삭제는 4주 뒤 백업 확인 후 사람이):
--   drop function if exists public.edu_songs_save(uuid, date, jsonb);
--   alter table public.edu_meeting_songs rename to edu_meeting_songs_archived;

create table if not exists public.edu_meeting_songs (
  edu_id     uuid        not null references public.edu_records (id) on delete restrict,
  meet_date  date        not null,
  songs      jsonb       not null default '[]'::jsonb,     -- [{"b":"c","n":12}, …] 부를 순서대로
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (edu_id, meet_date)
);

alter table public.edu_meeting_songs enable row level security;
drop policy if exists "edu_meeting_songs read" on public.edu_meeting_songs;
create policy "edu_meeting_songs read" on public.edu_meeting_songs for select to authenticated
  using (public.edu_my_role(edu_id) is not null);
revoke all on public.edu_meeting_songs from anon;
revoke insert, update, delete, truncate on public.edu_meeting_songs from authenticated;
grant select on public.edu_meeting_songs to authenticated;

-- 인도자: 그 날짜의 찬양 저장 — 형식이 맞는 곡만, 겹치면 한 번, 고른 순서 그대로
create or replace function public.edu_songs_save(p_edu uuid, p_date date, p_songs jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_songs jsonb;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 저장할 수 있습니다.'); end if;
  if not public.edu_is_leader(p_edu) then return json_build_object('ok', false, 'why', 'leader', 'error', '이 반의 인도자만 찬양을 고를 수 있습니다.'); end if;
  if not exists (select 1 from public.edu_records where id = p_edu) then return json_build_object('ok', false, 'why', 'notfound', 'error', '반을 찾을 수 없습니다.'); end if;
  if p_date is null or p_date > current_date + 60 or p_date < current_date - 730 then
    return json_build_object('ok', false, 'why', 'date', 'error', '날짜를 확인해 주십시오.');
  end if;
  if p_songs is not null and jsonb_typeof(p_songs) <> 'array' then return json_build_object('ok', false, 'why', 'songs', 'error', '곡 목록 형식이 올바르지 않습니다.'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('b', s.b, 'n', s.n) order by s.ord), '[]'::jsonb) into v_songs
    from (select distinct on (x.b, x.n) x.b, x.n, x.ord
            from (select e ->> 'b' as b, (e ->> 'n')::int as n, o as ord
                    from jsonb_array_elements(coalesce(p_songs, '[]'::jsonb)) with ordinality t(e, o)
                   where jsonb_typeof(e) = 'object' and e ->> 'b' in ('c', 'h') and (e ->> 'n') ~ '^[0-9]{1,3}$' and (e ->> 'n')::int between 1 and 999) x
           order by x.b, x.n, x.ord) s
   where s.ord <= 50;
  if jsonb_array_length(v_songs) > 12 then return json_build_object('ok', false, 'why', 'many', 'error', '한 모임에 12곡까지 고를 수 있습니다.'); end if;
  insert into public.edu_meeting_songs (edu_id, meet_date, songs)
  values (p_edu, p_date, v_songs)
  on conflict (edu_id, meet_date) do update set songs = excluded.songs, updated_by = auth.uid(), updated_at = now();
  return json_build_object('ok', true, 'songs', v_songs);
end $$;
revoke all on function public.edu_songs_save(uuid, date, jsonb) from public, anon;
grant execute on function public.edu_songs_save(uuid, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
