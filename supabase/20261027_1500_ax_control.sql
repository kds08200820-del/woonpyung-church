-- AX 관제실 (2026-10-27 담임목사 지시)
--  목사님이 관제실(ax.html)에 '할 일'을 적으면, 정해진 시간에 깨어나는 Claude 일꾼(AX)이 가져가
--  담당(주보·큐티·음성·참여 현황·중등부 교재·일정)별로 처리하고 결과를 다시 적는다.
--  · ax_tasks   : 할 일 한 줄 = 명령 하나. 상태 queued(대기) → working(작업 중) → review(확인 기다림)
--                 → approved(승인: 게시·발송 같은 바깥 일을 해도 됨) → working → done(끝) / failed(못 함) / cancelled(취소)
--                 관리자만 보고 적는다(지우지 않음 — 취소는 상태로).
--  · ax_workers : 일꾼 계정(홈페이지 로그인 계정 uid). 일꾼은 관리자가 아니다 — 아래 함수로만 할 일을 읽고 쓴다.
--                 일꾼 계정 등록은 사람이 한다(아래 '일꾼 등록').
--  · 함수
--      ax_claim(개수)             : 일꾼·관리자 — 대기·승인된 할 일을 가져가며 '작업 중'으로 (일꾼이 살아 있다는 표시도 남김)
--      ax_update(번호, 상태, 결과, 링크, 메모, 승인필요) : 일꾼·관리자 — 진행 상황·결과 적기
--      ax_report(담당, 제목, 내용, 링크) : 일꾼·관리자 — 사람이 해야 할 일·보고를 '확인 기다림'으로 올림
--      ax_week_stats(시작일, 끝일) : 일꾼·관리자 — 그 기간 참여 '건수'만(이름 없음): 큐티 아멘·출석·주일학교 인증·달란트·성경 읽기·글·신청·정원
--  · 비파괴: 표 2개 + 함수 5개. 지우는 것 없음. 이 SQL 을 실행하기 전에는 관제실이 'SQL 실행 전' 안내만 보여 준다.
--
-- 일꾼 등록 (SQL 실행 뒤, 사람이 한 번):
--   1) 홈페이지에서 일꾼용 계정을 하나 만든다(예: AX 일꾼). 관리자 권한은 주지 않는다.
--   2) insert into public.ax_workers (uid, note) values ('<그 계정 uid>', 'AX 일꾼');
--   3) 그 계정의 이메일·비밀번호를 Claude 환경 비밀값 AX_EMAIL · AX_PASSWORD 에 넣는다.
--
-- 되돌리기 (DROP 대신 RENAME):
--   drop function if exists public.ax_week_stats(date, date);
--   drop function if exists public.ax_report(text, text, text, text);
--   drop function if exists public.ax_update(bigint, text, text, text, text, boolean);
--   drop function if exists public.ax_claim(integer);
--   drop function if exists public.ax_can_work();
--   alter table public.ax_tasks rename to ax_tasks_archived;
--   alter table public.ax_workers rename to ax_workers_archived;
--   (표 삭제는 4주 뒤 백업 확인 후 사람이 한다)

create table if not exists public.ax_tasks (
  id             bigserial primary key,
  role           text        not null default 'auto'
                 check (role in ('auto', 'bulletin', 'qt', 'voice', 'report', 'youth', 'schedule', 'other', 'human')),
  title          text        not null check (char_length(title) between 1 and 200),
  detail         text        not null default '' check (char_length(detail) <= 4000),
  due_date       date,
  status         text        not null default 'queued'
                 check (status in ('queued', 'working', 'review', 'approved', 'done', 'failed', 'cancelled')),
  needs_approval boolean     not null default false,
  approved_at    timestamptz,
  result         text        not null default '' check (char_length(result) <= 8000),
  result_url     text        not null default '' check (char_length(result_url) <= 1000),
  log            jsonb       not null default '[]'::jsonb,
  source         text        not null default 'admin' check (source in ('admin', 'worker')),
  created_by     uuid        default auth.uid(),
  claimed_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists ax_tasks_status_idx on public.ax_tasks (status, created_at);

create table if not exists public.ax_workers (
  uid        uuid        primary key,
  note       text        not null default '',
  created_at timestamptz not null default now()
);

alter table public.ax_tasks enable row level security;
alter table public.ax_workers enable row level security;
drop policy if exists "ax_tasks admin read" on public.ax_tasks;
create policy "ax_tasks admin read" on public.ax_tasks for select to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "ax_tasks admin insert" on public.ax_tasks;
create policy "ax_tasks admin insert" on public.ax_tasks for insert to authenticated
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "ax_tasks admin update" on public.ax_tasks;
create policy "ax_tasks admin update" on public.ax_tasks for update to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "ax_workers admin read" on public.ax_workers;
create policy "ax_workers admin read" on public.ax_workers for select to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()));
revoke all on public.ax_tasks from anon;
revoke all on public.ax_workers from anon;
revoke delete, truncate on public.ax_tasks from authenticated;
revoke insert, update, delete, truncate on public.ax_workers from authenticated;
grant select, insert, update on public.ax_tasks to authenticated;
grant usage, select on sequence public.ax_tasks_id_seq to authenticated;
grant select on public.ax_workers to authenticated;

-- 일꾼 또는 관리자인가
create or replace function public.ax_can_work()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.ax_workers w where w.uid = auth.uid())
    or exists (select 1 from public.admins a where a.uid = auth.uid()))
$$;
revoke all on function public.ax_can_work() from public, anon;
grant execute on function public.ax_can_work() to authenticated;

-- 일꾼: 대기·승인된 할 일을 가져간다 (같은 일을 두 일꾼이 잡지 않게 skip locked)
create or replace function public.ax_claim(p_limit integer default 5)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  if not public.ax_can_work() then return json_build_object('ok', false, 'why', 'worker', 'error', 'AX 일꾼 또는 관리자만 할 수 있습니다.'); end if;
  insert into public.church_settings (key, data, updated_at)
  values ('ax_worker', jsonb_build_object('at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), now())
  on conflict (key) do update set data = excluded.data, updated_at = now();   -- 일꾼이 마지막으로 다녀간 시각(관제실에 표시)
  with picked as (
    select id from public.ax_tasks
     where status in ('queued', 'approved')
     order by (status = 'approved') desc, due_date nulls last, created_at
     limit least(greatest(coalesce(p_limit, 5), 1), 20)
     for update skip locked
  ), upd as (
    update public.ax_tasks t
       set status = 'working', claimed_at = now(), updated_at = now(),
           log = t.log || jsonb_build_array(jsonb_build_object('at', now(), 'by', 'AX', 'status', 'working', 'note', case when t.status = 'approved' then '승인된 일을 이어서 합니다' else '가져감' end))
      from picked p where t.id = p.id
    returning t.id, t.role, t.title, t.detail, t.due_date, t.needs_approval, t.approved_at, t.result, t.result_url, t.log, t.created_at
  )
  select coalesce(json_agg(row_to_json(upd) order by upd.created_at), '[]'::json) into v from upd;
  return json_build_object('ok', true, 'tasks', v);
end $$;
revoke all on function public.ax_claim(integer) from public, anon;
grant execute on function public.ax_claim(integer) to authenticated;

-- 일꾼: 진행 상황·결과 적기
create or replace function public.ax_update(p_id bigint, p_status text, p_result text default null, p_url text default null, p_note text default '', p_needs_approval boolean default null)
returns json language plpgsql security definer set search_path = public as $$
declare t public.ax_tasks;
begin
  if not public.ax_can_work() then return json_build_object('ok', false, 'why', 'worker', 'error', 'AX 일꾼 또는 관리자만 할 수 있습니다.'); end if;
  if p_status not in ('working', 'review', 'done', 'failed') then return json_build_object('ok', false, 'why', 'status', 'error', '알 수 없는 상태입니다.'); end if;
  select * into t from public.ax_tasks where id = p_id for update;
  if not found then return json_build_object('ok', false, 'why', 'none', 'error', '할 일을 찾을 수 없습니다.'); end if;
  if t.status in ('cancelled', 'done') then return json_build_object('ok', false, 'why', 'closed', 'error', '이미 끝났거나 취소된 일입니다.'); end if;
  if p_status = 'done' and t.needs_approval and t.approved_at is null then   -- 승인받아야 하는 일은 승인 전에 끝낼 수 없다
    return json_build_object('ok', false, 'why', 'approval', 'error', '목사님 승인 전에는 끝낼 수 없습니다. review 로 올려 주십시오.');
  end if;
  update public.ax_tasks
     set status = p_status,
         result = coalesce(left(p_result, 8000), result),
         result_url = coalesce(left(p_url, 1000), result_url),
         needs_approval = coalesce(p_needs_approval, needs_approval),
         updated_at = now(),
         log = log || jsonb_build_array(jsonb_build_object('at', now(), 'by', 'AX', 'status', p_status, 'note', left(coalesce(p_note, ''), 500)))
   where id = p_id;
  return json_build_object('ok', true);
end $$;
revoke all on function public.ax_update(bigint, text, text, text, text, boolean) from public, anon;
grant execute on function public.ax_update(bigint, text, text, text, text, boolean) to authenticated;

-- 일꾼: 사람이 할 일·보고를 올린다 ('확인 기다림'으로 바로)
create or replace function public.ax_report(p_role text, p_title text, p_detail text default '', p_url text default '')
returns json language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not public.ax_can_work() then return json_build_object('ok', false, 'why', 'worker', 'error', 'AX 일꾼 또는 관리자만 할 수 있습니다.'); end if;
  if btrim(coalesce(p_title, '')) = '' then return json_build_object('ok', false, 'why', 'title', 'error', '제목이 없습니다.'); end if;
  insert into public.ax_tasks (role, title, detail, status, result_url, source, created_by, log)
  values (case when p_role in ('bulletin', 'qt', 'voice', 'report', 'youth', 'schedule', 'other', 'human') then p_role else 'other' end,
          left(btrim(p_title), 200), left(coalesce(p_detail, ''), 4000), 'review', left(coalesce(p_url, ''), 1000), 'worker', null,
          jsonb_build_array(jsonb_build_object('at', now(), 'by', 'AX', 'status', 'review', 'note', '일꾼이 올림')))
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.ax_report(text, text, text, text) from public, anon;
grant execute on function public.ax_report(text, text, text, text) to authenticated;

-- 참여 현황: 기간 안의 건수만 (이름·내용 없음). 표가 없거나 칸이 다르면 그 항목만 null
create or replace function public.ax_week_stats(p_from date, p_to date)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb := '{}'::jsonb; v jsonb; n bigint; m bigint;
begin
  if not public.ax_can_work() then return json_build_object('ok', false, 'why', 'worker', 'error', 'AX 일꾼 또는 관리자만 볼 수 있습니다.'); end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 92 then return json_build_object('ok', false, 'why', 'range', 'error', '기간을 확인해 주십시오.'); end if;
  begin select count(*), count(distinct user_id) into n, m from public.qt_checks where check_date between p_from and p_to;
        r := r || jsonb_build_object('qt_amen', n, 'qt_people', m); exception when others then r := r || jsonb_build_object('qt_amen', null); end;
  begin select coalesce(jsonb_object_agg(service, c), '{}'::jsonb) into v from (select service, count(distinct member_key) c from public.attendance where att_date between p_from and p_to group by service) s;
        r := r || jsonb_build_object('attendance', v); exception when others then r := r || jsonb_build_object('attendance', null); end;
  begin select coalesce(jsonb_object_agg(stype, c), '{}'::jsonb) into v from (select stype, count(*) c from public.ss_submissions where sub_date between p_from and p_to group by stype) s;
        select count(distinct member_key) into n from public.ss_submissions where sub_date between p_from and p_to;
        r := r || jsonb_build_object('ss_certs', v, 'ss_kids', n); exception when others then r := r || jsonb_build_object('ss_certs', null); end;
  begin select coalesce(sum(amount), 0) into n from public.ss_talents where talent_date between p_from and p_to;
        r := r || jsonb_build_object('ss_talent', n); exception when others then r := r || jsonb_build_object('ss_talent', null); end;
  begin select count(*), count(distinct user_id) into n, m from public.bible_reading where (done_at at time zone 'Asia/Seoul')::date between p_from and p_to;
        r := r || jsonb_build_object('bible', n, 'bible_people', m); exception when others then r := r || jsonb_build_object('bible', null); end;
  begin select count(*) into n from public.posts where (created_at at time zone 'Asia/Seoul')::date between p_from and p_to;
        r := r || jsonb_build_object('posts', n); exception when others then r := r || jsonb_build_object('posts', null); end;
  begin select count(*) into n from public.app_entries where status = 'active' and (created_at at time zone 'Asia/Seoul')::date between p_from and p_to;
        r := r || jsonb_build_object('form_entries', n); exception when others then r := r || jsonb_build_object('form_entries', null); end;
  begin select count(distinct user_id) into n from public.garden_ledger where (at at time zone 'Asia/Seoul')::date between p_from and p_to;
        r := r || jsonb_build_object('garden_people', n); exception when others then r := r || jsonb_build_object('garden_people', null); end;
  return json_build_object('ok', true, 'from', p_from, 'to', p_to, 'stats', r);
end $$;
revoke all on function public.ax_week_stats(date, date) from public, anon;
grant execute on function public.ax_week_stats(date, date) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
