-- ============================================================
-- 신앙 정원 — 정원 초대하기 · 이웃 정원 방문하기 · 방명록 · 이웃 신청 (2026-10-23 담임목사 지시)
--
-- [무엇]
-- · 초대하기: 내 정원을 열면(visit_open) 같은 교회 성도가 구경하러 올 수 있다. 닫으면 주인·관리자만 본다
-- · 방문하기: 열린 정원 목록(같은 교회) → 자리 번호(plot_no)로 들어가 나무·밭·인물을 본다. 초대 링크 = garden.html?visit=<자리 번호>
-- · 방명록: 방문한 정원에 한 줄 글(300자까지). 쓴 사람·정원 주인·관리자가 숨길 수 있다(지우지 않고 hidden_at 으로 숨김)
-- · 같은 교회의 활동 중 멤버만. 교적·연락처는 내보내지 않고 별명·캐릭터·식물·밭만
-- · 글은 한 사람이 하루(24시간) 30개까지
-- · 이웃 신청: 정원 자리로 신청 → 받은 사람이 수락·거절. 서로 신청하면 바로 이웃. 이웃끼리는 초대를 꺼도 서로 방문·방명록 가능
--   끊기·취소는 지우지 않고 status 로(removed·declined). 신청은 한 사람이 하루 30개까지
-- [표]   garden_gardens(+visit_open, visit_open_at, guestbook_seen_at) · garden_guestbook · garden_neighbors
-- [함수] garden_visit_set · garden_visit_list · garden_visit_view · garden_guestbook_post · garden_guestbook_hide
--        garden_neighbor_request · garden_neighbor_respond · garden_neighbor_remove · garden_neighbor_list
--        (안쪽) garden_visit_member · garden_guestbook_json · garden_is_neighbor · garden_neighbor_json · garden_neighbor_list_json
-- [필요] 20261023_1200·1300·1500 이 먼저 실행돼 있어야 한다(garden_tiles.land/item, garden_xp_since 사용)
-- [실행] SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전)
--
-- [되돌리기(롤백)] — 표·칸은 DROP 대신 RENAME
--   drop function if exists public.garden_visit_set(text, boolean), public.garden_visit_list(text), public.garden_visit_view(text, int),
--     public.garden_guestbook_post(text, int, text), public.garden_guestbook_hide(text, bigint),
--     public.garden_visit_member(uuid, uuid), public.garden_guestbook_json(uuid, uuid, uuid, boolean),
--     public.garden_neighbor_request(text, int), public.garden_neighbor_respond(text, bigint, boolean), public.garden_neighbor_remove(text, bigint),
--     public.garden_neighbor_list(text), public.garden_is_neighbor(uuid, uuid, uuid), public.garden_neighbor_json(uuid, uuid, uuid),
--     public.garden_neighbor_list_json(uuid, uuid);
--   alter table public.garden_guestbook rename to garden_guestbook_archived;
--   alter table public.garden_neighbors rename to garden_neighbors_archived;
--   alter table public.garden_gardens rename column visit_open to visit_open_archived;
--   alter table public.garden_gardens rename column visit_open_at to visit_open_at_archived;
--   alter table public.garden_gardens rename column guestbook_seen_at to guestbook_seen_at_archived;
-- ============================================================

begin;

-- ──────────────────────────────────────────────────────────────
-- 1) 칸·표
-- ──────────────────────────────────────────────────────────────
alter table public.garden_gardens add column if not exists visit_open boolean not null default false;   -- 초대하기(정원 열기)
alter table public.garden_gardens add column if not exists visit_open_at timestamptz;                    -- 마지막으로 연 때
alter table public.garden_gardens add column if not exists guestbook_seen_at timestamptz;                -- 주인이 방명록을 마지막으로 본 때

create table if not exists public.garden_guestbook (
  id         bigserial primary key,
  church_id  uuid not null references public.garden_churches (id),
  owner_id   uuid not null references auth.users (id) on delete cascade,   -- 정원 주인
  author_id  uuid not null references auth.users (id) on delete cascade,   -- 쓴 사람
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now(),
  hidden_at  timestamptz,                                                   -- 숨김(지우지 않는다)
  hidden_by  uuid
);
create index if not exists idx_garden_guestbook_owner on public.garden_guestbook (church_id, owner_id, created_at desc);
create index if not exists idx_garden_guestbook_author on public.garden_guestbook (author_id, created_at desc);
alter table public.garden_guestbook enable row level security;
revoke all on public.garden_guestbook from anon, authenticated;   -- 아래 RPC 로만 읽고 쓴다

-- 이웃: 한 쌍에 한 줄(누가 먼저 신청했든). 끊기·거절도 줄을 남기고 status 만 바꾼다
create table if not exists public.garden_neighbors (
  id           bigserial primary key,
  church_id    uuid not null references public.garden_churches (id),
  from_id      uuid not null references auth.users (id) on delete cascade,   -- 신청한 사람
  to_id        uuid not null references auth.users (id) on delete cascade,   -- 신청받은 사람
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'removed')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_id <> to_id)
);
create unique index if not exists uq_garden_neighbors_pair on public.garden_neighbors (church_id, least(from_id, to_id), greatest(from_id, to_id));
create index if not exists idx_garden_neighbors_to on public.garden_neighbors (church_id, to_id, status);
create index if not exists idx_garden_neighbors_from on public.garden_neighbors (from_id, created_at desc);
alter table public.garden_neighbors enable row level security;
revoke all on public.garden_neighbors from anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 2) 안쪽 도우미
-- ──────────────────────────────────────────────────────────────
-- 같은 교회의 활동 중 멤버인가
create or replace function public.garden_visit_member(p_church uuid, p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.garden_memberships m where m.church_id = p_church and m.user_id = p_uid and m.status = 'active')
$$;
-- 서로 이웃인가(수락된 쌍)
create or replace function public.garden_is_neighbor(p_church uuid, p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.garden_neighbors n where n.church_id = p_church and n.status = 'accepted'
                   and least(n.from_id, n.to_id) = least(p_a, p_b) and greatest(n.from_id, n.to_id) = greatest(p_a, p_b))
$$;
-- 나(p_me)와 상대(p_other)의 이웃 사이: none · sent(내가 신청) · received(받음) · neighbor
create or replace function public.garden_neighbor_json(p_church uuid, p_me uuid, p_other uuid) returns json
language sql stable security definer set search_path = public as $$
  select coalesce((select json_build_object('id', n.id, 'status',
            case when n.status = 'accepted' then 'neighbor'
                 when n.status = 'pending' and n.from_id = p_me then 'sent'
                 when n.status = 'pending' then 'received' else 'none' end)
     from public.garden_neighbors n
    where n.church_id = p_church and least(n.from_id, n.to_id) = least(p_me, p_other) and greatest(n.from_id, n.to_id) = greatest(p_me, p_other)),
    json_build_object('id', null, 'status', 'none'))
$$;
-- 내 이웃·받은 신청·보낸 신청 (별명·캐릭터·식물·자리 번호만)
create or replace function public.garden_neighbor_list_json(p_church uuid, p_uid uuid) returns json
language sql stable security definer set search_path = public as $$
  with x as (
    select n.id, n.status, n.from_id, n.to_id, n.created_at, case when n.from_id = p_uid then n.to_id else n.from_id end as other
      from public.garden_neighbors n
     where n.church_id = p_church and (n.from_id = p_uid or n.to_id = p_uid) and n.status in ('pending', 'accepted')
  ), y as (
    select x.*, pl.plot_no, coalesce(nullif(p.nickname, ''), '성도') as nickname, coalesce(p.avatar_key, 'a') as avatar_key, coalesce(p.avatar_url, '') as avatar_url,
           gg.species, gg.plant_name, gg.stage, coalesce(gg.visit_open, false) as open
      from x
      join public.garden_plots pl on pl.church_id = p_church and pl.owner_user_id = x.other
      left join public.garden_profiles p on p.user_id = x.other
      left join public.garden_gardens gg on gg.church_id = p_church and gg.user_id = x.other
     where public.garden_visit_member(p_church, x.other)
  )
  select json_build_object(
    'neighbors', (select coalesce(json_agg(json_build_object('id', y.id, 'plot_no', y.plot_no, 'nickname', y.nickname, 'avatar_key', y.avatar_key, 'avatar_url', y.avatar_url,
                    'species', y.species, 'plant_name', y.plant_name, 'stage', y.stage, 'open', y.open) order by y.nickname), '[]'::json) from y where y.status = 'accepted'),
    'incoming', (select coalesce(json_agg(json_build_object('id', y.id, 'plot_no', y.plot_no, 'nickname', y.nickname, 'avatar_key', y.avatar_key, 'avatar_url', y.avatar_url,
                    'species', y.species, 'plant_name', y.plant_name, 'stage', y.stage, 'at', y.created_at) order by y.created_at desc), '[]'::json) from y where y.status = 'pending' and y.to_id = p_uid),
    'outgoing', (select coalesce(json_agg(json_build_object('id', y.id, 'plot_no', y.plot_no, 'nickname', y.nickname, 'avatar_key', y.avatar_key, 'avatar_url', y.avatar_url,
                    'at', y.created_at) order by y.created_at desc), '[]'::json) from y where y.status = 'pending' and y.from_id = p_uid))
$$;

-- 방명록(숨긴 글 빼고 최근 60개) — 쓴 사람은 별명·캐릭터만
create or replace function public.garden_guestbook_json(p_church uuid, p_owner uuid, p_viewer uuid, p_admin boolean) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', b.id, 'body', b.body, 'at', b.created_at,
           'author', json_build_object('nickname', coalesce(nullif(p.nickname, ''), '성도'), 'avatar_key', coalesce(p.avatar_key, 'a'), 'avatar_url', coalesce(p.avatar_url, '')),
           'mine', b.author_id = p_viewer,
           'can_hide', b.author_id = p_viewer or p_owner = p_viewer or coalesce(p_admin, false)) order by b.created_at desc, b.id desc), '[]'::json)
    from (select * from public.garden_guestbook g
           where g.church_id = p_church and g.owner_id = p_owner and g.hidden_at is null
           order by g.created_at desc, g.id desc limit 60) b
    left join public.garden_profiles p on p.user_id = b.author_id
$$;
revoke all on function public.garden_visit_member(uuid, uuid), public.garden_guestbook_json(uuid, uuid, uuid, boolean), public.garden_is_neighbor(uuid, uuid, uuid),
  public.garden_neighbor_json(uuid, uuid, uuid), public.garden_neighbor_list_json(uuid, uuid) from public, anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 3) 공개 RPC
-- ──────────────────────────────────────────────────────────────
-- 초대하기 켜고 끄기
create or replace function public.garden_visit_set(p_church text, p_open boolean) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_open boolean := coalesce(p_open, false); v_plot int;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  update public.garden_gardens g set visit_open = v_open, visit_open_at = case when v_open then now() else g.visit_open_at end
   where g.church_id = v_church and g.user_id = v_uid;
  if not found then return json_build_object('ok', false, 'why', 'sync'); end if;
  select pl.plot_no into v_plot from public.garden_plots pl where pl.church_id = v_church and pl.owner_user_id = v_uid;
  return json_build_object('ok', true, 'open', v_open, 'plot_no', v_plot);
end $$;

-- 열린 정원 목록 + 내 상태(열림·자리 번호·읽지 않은 방명록 수)
create or replace function public.garden_visit_list(p_church text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); g public.garden_gardens; v_plot int;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_visit_member(v_church, v_uid) then return json_build_object('ok', false, 'why', 'member'); end if;
  select * into g from public.garden_gardens where church_id = v_church and user_id = v_uid;
  select pl.plot_no into v_plot from public.garden_plots pl where pl.church_id = v_church and pl.owner_user_id = v_uid;
  return json_build_object('ok', true,
    'me', json_build_object('open', coalesce(g.visit_open, false), 'plot_no', v_plot,
      'unread', (select count(*) from public.garden_guestbook b
                  where b.church_id = v_church and b.owner_id = v_uid and b.author_id <> v_uid and b.hidden_at is null
                    and b.created_at > coalesce(g.guestbook_seen_at, '-infinity'::timestamptz)),
      'requests', (select count(*) from public.garden_neighbors n where n.church_id = v_church and n.to_id = v_uid and n.status = 'pending')),
    'gardens', (select coalesce(json_agg(json_build_object('plot_no', x.plot_no, 'nickname', x.nickname, 'avatar_key', x.avatar_key,
                  'avatar_url', x.avatar_url, 'species', x.species, 'plant_name', x.plant_name, 'stage', x.stage,
                  'plants_done', x.plants_done, 'comments', x.comments, 'open', x.visit_open, 'neighbor', x.neighbor) order by x.neighbor desc, x.last_at desc nulls last), '[]'::json)
                  from (select pl.plot_no, coalesce(nullif(p.nickname, ''), '성도') as nickname, coalesce(p.avatar_key, 'a') as avatar_key,
                               coalesce(p.avatar_url, '') as avatar_url, gg.species, gg.plant_name, gg.stage, gg.plants_done,
                               (select count(*) from public.garden_guestbook b where b.church_id = v_church and b.owner_id = gg.user_id and b.hidden_at is null) as comments,
                               greatest(gg.last_sync_at, gg.visit_open_at) as last_at, gg.visit_open,
                               public.garden_is_neighbor(v_church, v_uid, gg.user_id) as neighbor
                          from public.garden_gardens gg
                          join public.garden_plots pl on pl.church_id = gg.church_id and pl.owner_user_id = gg.user_id
                          left join public.garden_profiles p on p.user_id = gg.user_id
                         where gg.church_id = v_church and gg.user_id <> v_uid
                           and (gg.visit_open or public.garden_is_neighbor(v_church, v_uid, gg.user_id))
                           and public.garden_visit_member(v_church, gg.user_id)
                         order by public.garden_is_neighbor(v_church, v_uid, gg.user_id) desc, greatest(gg.last_sync_at, gg.visit_open_at) desc nulls last
                         limit 100) x));
end $$;

-- 정원 보기(방문) — 열려 있거나 내 정원이거나 관리자. 주인이 보면 방명록을 읽은 것으로
create or replace function public.garden_visit_view(p_church text, p_plot int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_owner uuid; g public.garden_gardens; v_admin boolean; v_mine boolean; v_nb boolean;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_visit_member(v_church, v_uid) then return json_build_object('ok', false, 'why', 'member'); end if;
  select pl.owner_user_id into v_owner from public.garden_plots pl where pl.church_id = v_church and pl.plot_no = p_plot;
  if v_owner is null then return json_build_object('ok', false, 'why', 'none'); end if;
  select * into g from public.garden_gardens where church_id = v_church and user_id = v_owner;
  if not found then return json_build_object('ok', false, 'why', 'none'); end if;
  v_admin := public.garden_is_admin(v_church); v_mine := v_owner = v_uid; v_nb := public.garden_is_neighbor(v_church, v_uid, v_owner);
  if not (g.visit_open or v_mine or v_admin or v_nb) then return json_build_object('ok', false, 'why', 'closed'); end if;
  if v_mine then update public.garden_gardens set guestbook_seen_at = now() where church_id = v_church and user_id = v_uid; end if;
  return json_build_object('ok', true, 'plot_no', p_plot, 'mine', v_mine, 'open', g.visit_open,
    'neighbor', case when v_mine then null else public.garden_neighbor_json(v_church, v_uid, v_owner) end,
    'owner', coalesce((select json_build_object('nickname', coalesce(nullif(p.nickname, ''), '성도'), 'avatar_key', coalesce(p.avatar_key, 'a'), 'avatar_url', coalesce(p.avatar_url, ''))
                         from public.garden_profiles p where p.user_id = v_owner),
                      json_build_object('nickname', '성도', 'avatar_key', 'a', 'avatar_url', '')),
    'garden', json_build_object('species', g.species, 'plant_name', g.plant_name, 'stage', g.stage, 'plant_xp', g.plant_xp, 'plants_done', g.plants_done),
    'farm', json_build_object(
      'tiles', (select coalesce(json_agg(json_build_object('x', t.x, 'y', t.y, 'land', t.land, 'crop', t.crop, 'planted_at', t.planted_at, 'ripe_at', t.ripe_at,
                  'item', t.item, 'item_at', t.item_at,
                  'xp_since', case when t.item is null then null else public.garden_xp_since(v_church, v_owner, t.item_at) end) order by t.y, t.x), '[]'::json)
                  from public.garden_tiles t where t.church_id = v_church and t.user_id = v_owner),
      'water_days', (select coalesce(json_agg(l.ref order by l.ref), '[]'::json) from public.garden_ledger l
                      where l.church_id = v_church and l.user_id = v_owner and l.kind = 'water' and l.at >= now() - interval '120 days'),
      'xp_day', public.garden_xp_day(v_church)),
    'guestbook', public.garden_guestbook_json(v_church, v_owner, v_uid, v_admin));
end $$;

-- 방명록 쓰기 — 열린 정원(또는 내 정원·관리자)에만, 공백 정리 후 1~300자, 하루 30개까지
create or replace function public.garden_guestbook_post(p_church text, p_plot int, p_body text) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_owner uuid; g public.garden_gardens; v_admin boolean; v_body text;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_visit_member(v_church, v_uid) then return json_build_object('ok', false, 'why', 'member'); end if;
  select pl.owner_user_id into v_owner from public.garden_plots pl where pl.church_id = v_church and pl.plot_no = p_plot;
  if v_owner is null then return json_build_object('ok', false, 'why', 'none'); end if;
  select * into g from public.garden_gardens where church_id = v_church and user_id = v_owner;
  if not found then return json_build_object('ok', false, 'why', 'none'); end if;
  v_admin := public.garden_is_admin(v_church);
  if not (g.visit_open or v_owner = v_uid or v_admin or public.garden_is_neighbor(v_church, v_uid, v_owner)) then return json_build_object('ok', false, 'why', 'closed'); end if;
  v_body := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  if char_length(v_body) < 1 or char_length(v_body) > 300 then return json_build_object('ok', false, 'why', 'length'); end if;
  if (select count(*) from public.garden_guestbook b where b.author_id = v_uid and b.created_at > now() - interval '1 day') >= 30 then
    return json_build_object('ok', false, 'why', 'limit');
  end if;
  insert into public.garden_guestbook (church_id, owner_id, author_id, body) values (v_church, v_owner, v_uid, v_body);
  return json_build_object('ok', true, 'guestbook', public.garden_guestbook_json(v_church, v_owner, v_uid, v_admin));
end $$;

-- 방명록 숨기기 — 쓴 사람·정원 주인·관리자
create or replace function public.garden_guestbook_hide(p_church text, p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); b public.garden_guestbook; v_admin boolean;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  select * into b from public.garden_guestbook where id = p_id and church_id = v_church;
  if not found or b.hidden_at is not null then return json_build_object('ok', false, 'why', 'none'); end if;
  v_admin := public.garden_is_admin(v_church);
  if not (b.author_id = v_uid or b.owner_id = v_uid or v_admin) then return json_build_object('ok', false, 'why', 'denied'); end if;
  update public.garden_guestbook set hidden_at = now(), hidden_by = v_uid where id = p_id;
  return json_build_object('ok', true, 'guestbook', public.garden_guestbook_json(v_church, b.owner_id, v_uid, v_admin));
end $$;

-- 이웃 신청(정원 자리로). 상대가 먼저 신청해 두었으면 바로 이웃. 거절·끊긴 사이는 다시 신청할 수 있다
create or replace function public.garden_neighbor_request(p_church text, p_plot int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_to uuid; n public.garden_neighbors;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_visit_member(v_church, v_uid) then return json_build_object('ok', false, 'why', 'member'); end if;
  select pl.owner_user_id into v_to from public.garden_plots pl where pl.church_id = v_church and pl.plot_no = p_plot;
  if v_to is null or not public.garden_visit_member(v_church, v_to) then return json_build_object('ok', false, 'why', 'none'); end if;
  if v_to = v_uid then return json_build_object('ok', false, 'why', 'self'); end if;
  select * into n from public.garden_neighbors x
   where x.church_id = v_church and least(x.from_id, x.to_id) = least(v_uid, v_to) and greatest(x.from_id, x.to_id) = greatest(v_uid, v_to) for update;
  if found and n.status = 'pending' and n.to_id = v_uid then
    update public.garden_neighbors set status = 'accepted', responded_at = now() where id = n.id;                      -- 서로 신청 → 이웃
  elsif found and n.status in ('accepted', 'pending') then
    null;                                                                                                              -- 이미 이웃이거나 보낸 신청이 있다
  else
    if (select count(*) from public.garden_neighbors x where x.from_id = v_uid and x.created_at > now() - interval '1 day') >= 30 then
      return json_build_object('ok', false, 'why', 'limit');
    end if;
    if found then
      update public.garden_neighbors set from_id = v_uid, to_id = v_to, status = 'pending', created_at = now(), responded_at = null where id = n.id;
    else
      insert into public.garden_neighbors (church_id, from_id, to_id) values (v_church, v_uid, v_to)
      on conflict (church_id, (least(from_id, to_id)), (greatest(from_id, to_id))) do nothing;
    end if;
  end if;
  return json_build_object('ok', true, 'neighbor', public.garden_neighbor_json(v_church, v_uid, v_to));
end $$;

-- 받은 신청에 답하기(받은 사람만)
create or replace function public.garden_neighbor_respond(p_church text, p_id bigint, p_accept boolean) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); n public.garden_neighbors;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  select * into n from public.garden_neighbors where id = p_id and church_id = v_church for update;
  if not found or n.status <> 'pending' then return json_build_object('ok', false, 'why', 'none'); end if;
  if n.to_id <> v_uid then return json_build_object('ok', false, 'why', 'denied'); end if;
  update public.garden_neighbors set status = case when coalesce(p_accept, false) then 'accepted' else 'declined' end, responded_at = now() where id = p_id;
  return (json_build_object('ok', true, 'accepted', coalesce(p_accept, false)) :: jsonb || (public.garden_neighbor_list_json(v_church, v_uid) :: jsonb)) :: json;
end $$;

-- 이웃 끊기 · 보낸 신청 취소(두 사람 모두 할 수 있다)
create or replace function public.garden_neighbor_remove(p_church text, p_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); n public.garden_neighbors;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  select * into n from public.garden_neighbors where id = p_id and church_id = v_church for update;
  if not found or n.status not in ('pending', 'accepted') then return json_build_object('ok', false, 'why', 'none'); end if;
  if v_uid not in (n.from_id, n.to_id) then return json_build_object('ok', false, 'why', 'denied'); end if;
  update public.garden_neighbors set status = 'removed', responded_at = now() where id = p_id;
  return (json_build_object('ok', true) :: jsonb || (public.garden_neighbor_list_json(v_church, v_uid) :: jsonb)) :: json;
end $$;

-- 내 이웃 · 받은 신청 · 보낸 신청
create or replace function public.garden_neighbor_list(p_church text default null) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_visit_member(v_church, v_uid) then return json_build_object('ok', false, 'why', 'member'); end if;
  return (json_build_object('ok', true) :: jsonb || (public.garden_neighbor_list_json(v_church, v_uid) :: jsonb)) :: json;
end $$;

revoke all on function public.garden_visit_set(text, boolean), public.garden_visit_list(text), public.garden_visit_view(text, int),
  public.garden_guestbook_post(text, int, text), public.garden_guestbook_hide(text, bigint),
  public.garden_neighbor_request(text, int), public.garden_neighbor_respond(text, bigint, boolean), public.garden_neighbor_remove(text, bigint),
  public.garden_neighbor_list(text) from public, anon;
grant execute on function public.garden_visit_set(text, boolean), public.garden_visit_list(text), public.garden_visit_view(text, int),
  public.garden_guestbook_post(text, int, text), public.garden_guestbook_hide(text, bigint),
  public.garden_neighbor_request(text, int), public.garden_neighbor_respond(text, bigint, boolean), public.garden_neighbor_remove(text, bigint),
  public.garden_neighbor_list(text) to authenticated;

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
