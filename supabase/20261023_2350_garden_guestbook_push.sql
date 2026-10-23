-- ============================================================
-- 신앙 정원 — 방명록에 글이 달리면 정원 주인에게 알림(푸시) (2026-10-23 담임목사: "방문록에 댓글을 달면 상대방에게 알람이 가도록")
--
-- [무엇]
-- · 정원마다 알림 열쇠(push_key, 무작위 글자 32자). 주인이 정원을 열면 그 기기에 OneSignal 태그 gk=<열쇠> 를 붙인다(js/garden/visit.js)
-- · 보내기는 Apps Script(apps-script/garden-guestbook-push.gs)가 5분마다 garden_guestbook_push_feed 를 읽어
--   새 글이 있는 열쇠마다 그 태그가 붙은 기기에만 푸시한다 — 피드에는 열쇠와 건수만(이름·글·교인 자료 없음)
-- · 알리지 않는 글: 주인이 스스로 쓴 글, 숨긴 글, 주인이 이미 본 글(guestbook_seen_at 뒤가 아님), 하루 지난 글
-- [칸]   garden_gardens.push_key (text, null 가능 — 처음 부를 때 만든다)
-- [함수] garden_push_key(p_church) — 로그인한 주인만, 내 열쇠 · garden_guestbook_push_feed(p_after) — 열쇠·건수만
-- [필요] 20261023_2100 이 먼저 실행돼 있어야 한다(garden_guestbook · garden_gardens.guestbook_seen_at)
-- [실행] SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전). 그 뒤 Apps Script 에 garden-guestbook-push.gs 를 넣고
--        createGardenGbPushTrigger 를 한 번 실행
--
-- [되돌리기(롤백)] — 칸은 DROP 대신 RENAME
--   drop function if exists public.garden_push_key(text), public.garden_guestbook_push_feed(bigint);
--   drop index if exists public.idx_garden_gardens_push_key;
--   alter table public.garden_gardens rename column push_key to push_key_archived;
--   (Apps Script 쪽은 트리거만 지우면 된다: 함수 목록에서 deleteGardenGbPushTrigger 실행)
-- ============================================================

begin;

alter table public.garden_gardens add column if not exists push_key text;   -- 방명록 알림 열쇠(기기 태그 gk 값)
create unique index if not exists idx_garden_gardens_push_key on public.garden_gardens (push_key) where push_key is not null;

-- 내 알림 열쇠 — 없으면 만든다
create or replace function public.garden_push_key(p_church text default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_church uuid; v_uid uuid := auth.uid(); v_key text;
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  v_church := public.garden_resolve_church(p_church);
  if v_church is null then return json_build_object('ok', false, 'why', 'church'); end if;
  select g.push_key into v_key from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid;
  if not found then return json_build_object('ok', false, 'why', 'none'); end if;
  if v_key is null then
    update public.garden_gardens set push_key = replace(gen_random_uuid()::text, '-', '')
     where church_id = v_church and user_id = v_uid and push_key is null;
    select g.push_key into v_key from public.garden_gardens g where g.church_id = v_church and g.user_id = v_uid;
  end if;
  return json_build_object('ok', true, 'key', v_key);
end $$;
revoke all on function public.garden_push_key(text) from public, anon;
grant execute on function public.garden_push_key(text) to authenticated;

-- 알림 피드 — p_after 보다 뒤의 글을 열쇠별 건수로. 공개 키로 부르므로 열쇠·건수·마지막 번호만 내보낸다
create or replace function public.garden_guestbook_push_feed(p_after bigint default 0) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'max_id', coalesce((select max(b.id) from public.garden_guestbook b), 0),
    'keys', coalesce((
      select json_agg(json_build_object('key', x.push_key, 'n', x.n) order by x.push_key)
        from (select g.push_key, count(*)::int n
                from public.garden_guestbook b
                join public.garden_gardens g on g.church_id = b.church_id and g.user_id = b.owner_id
               where b.id > coalesce(p_after, 0)
                 and b.hidden_at is null
                 and b.author_id <> b.owner_id
                 and b.created_at > now() - interval '1 day'
                 and b.created_at > coalesce(g.guestbook_seen_at, '-infinity'::timestamptz)
                 and g.push_key is not null
               group by g.push_key) x), '[]'::json))
$$;
revoke all on function public.garden_guestbook_push_feed(bigint) from public;
grant execute on function public.garden_guestbook_push_feed(bigint) to anon, authenticated;

commit;
