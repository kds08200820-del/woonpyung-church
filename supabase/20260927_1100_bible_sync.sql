-- 성경 기록 하나로 — 설교자의 성경(교회·집 PC) · 모두의 성경(웹·휴대폰)의 메모·형광펜·활동 기록을 한 계정에 모은다 (2026-09-27)
--  · 담임목사 한 사람만: sync_owners 에 적힌 식별 코드(해시) → 그 계정(user_id)
--  · modu_activity : 찾기·장 읽기·지도·낱말·주석·학습 등 모든 활동 (지식 그래프 재료)
--  · modu_tombstones : 지운 메모·형광펜 표시 — 다른 기기가 받아 가서 같이 지운다
--  · 앱(PC)은 Edge Function bible-sync 가 서명된 허가증을 확인한 뒤 service_role 로 대신 읽고 쓴다
-- 되돌리기:
--   drop trigger if exists modu_notes_tomb on public.modu_notes; drop trigger if exists modu_hl_tomb on public.modu_highlights;
--   drop function if exists public.modu_tomb_note(); drop function if exists public.modu_tomb_hl();
--   drop table if exists public.modu_tombstones, public.modu_activity, public.sync_owners;

create table if not exists public.sync_owners (
  code_hash text primary key,                       -- sha256(식별 코드 16자)
  user_id   uuid not null references auth.users (id) on delete cascade,
  label     text not null default ''
);
alter table public.sync_owners enable row level security;   -- 정책 없음: service_role(Edge Function)만

create table if not exists public.modu_activity (
  id       bigserial primary key,
  user_id  uuid not null references auth.users (id) on delete cascade,
  kind     text not null,                           -- read · search · map · word · comm · study · hymn · gyodok · note · hl · worship …
  ref      text not null default '',                -- 본문 좌표 (역대상 16:1)
  book     text not null default '',
  label    text not null default '',                -- 보이는 이름 (찾은 말, 지도 이름, 낱말 …)
  data     jsonb not null default '{}'::jsonb,
  device   text not null default '',                -- 교회 PC · 집 PC · 웹 · 휴대폰
  at       timestamptz not null default now()
);
create index if not exists idx_modu_activity_user on public.modu_activity (user_id, at desc);
alter table public.modu_activity enable row level security;
drop policy if exists "own modu_activity" on public.modu_activity;
create policy "own modu_activity" on public.modu_activity for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.modu_activity to authenticated;
grant usage, select on sequence public.modu_activity_id_seq to authenticated;

create table if not exists public.modu_tombstones (
  id       bigserial primary key,
  user_id  uuid not null,
  kind     text not null,                           -- note · hl
  key      text not null,                           -- note: 메모 id / hl: 'bi:ci:vi'
  at       timestamptz not null default now()
);
create index if not exists idx_modu_tomb_user on public.modu_tombstones (user_id, at);
alter table public.modu_tombstones enable row level security;
drop policy if exists "own modu_tombstones" on public.modu_tombstones;
create policy "own modu_tombstones" on public.modu_tombstones for select to authenticated using (user_id = auth.uid());
grant select on public.modu_tombstones to authenticated;

create or replace function public.modu_tomb_note() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.modu_tombstones (user_id, kind, key) values (old.user_id, 'note', old.id::text); return old; end $$;
create or replace function public.modu_tomb_hl() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.modu_tombstones (user_id, kind, key) values (old.user_id, 'hl', old.bi || ':' || old.ci || ':' || old.vi); return old; end $$;
drop trigger if exists modu_notes_tomb on public.modu_notes;
create trigger modu_notes_tomb after delete on public.modu_notes for each row execute function public.modu_tomb_note();
drop trigger if exists modu_hl_tomb on public.modu_highlights;
create trigger modu_hl_tomb after delete on public.modu_highlights for each row execute function public.modu_tomb_hl();

-- 모두의 성경(웹·휴대폰)이 '이 계정이 담임목사인가'만 묻는 함수 (sync_owners 는 직접 못 읽는다)
create or replace function public.is_sync_owner() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sync_owners where user_id = auth.uid())
$$;
revoke all on function public.is_sync_owner() from public;
grant execute on function public.is_sync_owner() to authenticated;

-- 담임목사 계정 (관리자 중 이름이 김동석) ← 식별 코드 1·2번 (교회·집)
insert into public.sync_owners (code_hash, user_id, label)
select h.code_hash, p.id, h.label
from (values ('2c2014e7937aa30793e2e361219eb7e1641e11c4512589409d00b29855adedbc', '코드 1'),
             ('506acb104dbb19918210688f2bb30152b60a0ccacf278248bef4f0d31f78ad43', '코드 2')) as h(code_hash, label)
cross join lateral (select pr.id from public.profiles pr join public.admins a on a.uid = pr.id where pr.name like '김동석%' limit 1) p
on conflict (code_hash) do update set user_id = excluded.user_id;

select s.label, s.user_id, p.name, p.email from public.sync_owners s left join public.profiles p on p.id = s.user_id;
