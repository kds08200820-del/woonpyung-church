-- ============================================================
-- 신앙 정원 — 정원 초대하기 · 이웃 정원 방문하기 · 방명록 (2026-10-23 담임목사 지시)
--
-- [무엇]
-- · 초대하기: 내 정원을 열면(visit_open) 같은 교회 성도가 구경하러 올 수 있다. 닫으면 주인·관리자만 본다
-- · 방문하기: 열린 정원 목록(같은 교회) → 자리 번호(plot_no)로 들어가 나무·밭·인물을 본다. 초대 링크 = garden.html?visit=<자리 번호>
-- · 방명록: 방문한 정원에 한 줄 글(300자까지). 쓴 사람·정원 주인·관리자가 숨길 수 있다(지우지 않고 hidden_at 으로 숨김)
-- · 같은 교회의 활동 중 멤버만. 교적·연락처는 내보내지 않고 별명·캐릭터·식물·밭만
-- · 글은 한 사람이 하루(24시간) 30개까지
-- [표]   garden_gardens(+visit_open, visit_open_at, guestbook_seen_at) · garden_guestbook
-- [함수] garden_visit_set · garden_visit_list · garden_visit_view · garden_guestbook_post · garden_guestbook_hide
--        (안쪽) garden_visit_member · garden_guestbook_json
-- [필요] 20261023_1200·1300·1500 이 먼저 실행돼 있어야 한다(garden_tiles.land/item, garden_xp_since 사용)
-- [실행] SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전)
--
-- [되돌리기(롤백)] — 표·칸은 DROP 대신 RENAME
--   drop function if exists public.garden_visit_set(text, boolean), public.garden_visit_list(text), public.garden_visit_view(text, int),
--     public.garden_guestbook_post(text, int, text), public.garden_guestbook_hide(text, bigint),
--     public.garden_visit_member(uuid, uuid), public.garden_guestbook_json(uuid, uuid, uuid, boolean);
--   alter table public.garden_guestbook rename to garden_guestbook_archived;
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

-- ──────────────────────────────────────────────────────────────
-- 2) 안쪽 도우미
-- ──────────────────────────────────────────────────────────────
-- 같은 교회의 활동 중 멤버인가
create or replace function public.garden_visit_member(p_church uuid, p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.garden_memberships m where m.church_id = p_church and m.user_id = p_uid and m.status = 'active')
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
revoke all on function public.garden_visit_member(uuid, uuid), public.garden_guestbook_json(uuid, uuid, uuid, boolean) from public, anon, authenticated;

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
                    and b.created_at > coalesce(g.guestbook_seen_at, '-infinity'::timestamptz))),
    'gardens', (select coalesce(json_agg(json_build_object('plot_no', x.plot_no, 'nickname', x.nickname, 'avatar_key', x.avatar_key,
                  'avatar_url', x.avatar_url, 'species', x.species, 'plant_name', x.plant_name, 'stage', x.stage,
                  'plants_done', x.plants_done, 'comments', x.comments) order by x.last_at desc nulls last), '[]'::json)
                  from (select pl.plot_no, coalesce(nullif(p.nickname, ''), '성도') as nickname, coalesce(p.avatar_key, 'a') as avatar_key,
                               coalesce(p.avatar_url, '') as avatar_url, gg.species, gg.plant_name, gg.stage, gg.plants_done,
                               (select count(*) from public.garden_guestbook b where b.church_id = v_church and b.owner_id = gg.user_id and b.hidden_at is null) as comments,
                               greatest(gg.last_sync_at, gg.visit_open_at) as last_at
                          from public.garden_gardens gg
                          join public.garden_plots pl on pl.church_id = gg.church_id and pl.owner_user_id = gg.user_id
                          left join public.garden_profiles p on p.user_id = gg.user_id
                         where gg.church_id = v_church and gg.visit_open and gg.user_id <> v_uid
                           and public.garden_visit_member(v_church, gg.user_id)
                         order by greatest(gg.last_sync_at, gg.visit_open_at) desc nulls last
                         limit 100) x));
end $$;

-- 정원 보기(방문) — 열려 있거나 내 정원이거나 관리자. 주인이 보면 방명록을 읽은 것으로
create or replace function public.garden_visit_view(p_church text, p_plot int) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_owner uuid; g public.garden_gardens; v_admin boolean; v_mine boolean;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  if not public.garden_visit_member(v_church, v_uid) then return json_build_object('ok', false, 'why', 'member'); end if;
  select pl.owner_user_id into v_owner from public.garden_plots pl where pl.church_id = v_church and pl.plot_no = p_plot;
  if v_owner is null then return json_build_object('ok', false, 'why', 'none'); end if;
  select * into g from public.garden_gardens where church_id = v_church and user_id = v_owner;
  if not found then return json_build_object('ok', false, 'why', 'none'); end if;
  v_admin := public.garden_is_admin(v_church); v_mine := v_owner = v_uid;
  if not (g.visit_open or v_mine or v_admin) then return json_build_object('ok', false, 'why', 'closed'); end if;
  if v_mine then update public.garden_gardens set guestbook_seen_at = now() where church_id = v_church and user_id = v_uid; end if;
  return json_build_object('ok', true, 'plot_no', p_plot, 'mine', v_mine, 'open', g.visit_open,
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
  if not (g.visit_open or v_owner = v_uid or v_admin) then return json_build_object('ok', false, 'why', 'closed'); end if;
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

revoke all on function public.garden_visit_set(text, boolean), public.garden_visit_list(text), public.garden_visit_view(text, int),
  public.garden_guestbook_post(text, int, text), public.garden_guestbook_hide(text, bigint) from public, anon;
grant execute on function public.garden_visit_set(text, boolean), public.garden_visit_list(text), public.garden_visit_view(text, int),
  public.garden_guestbook_post(text, int, text), public.garden_guestbook_hide(text, bigint) to authenticated;

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
