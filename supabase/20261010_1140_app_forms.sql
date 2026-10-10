-- 신청서 (2026-10-10 담임목사 지시) — 행사·모임 신청을 받고, 지난 신청서도 지우지 않고 쌓아 둔다
--  · app_forms   : 신청서 양식 — 제목·내용·행사 날짜/시각/장소·신청 기간(시작~마감)·신청비(성인/미성년자)
--                  ·납부 받는 곳(은행·계좌번호·예금주·토스 송금 링크). 계좌는 관리자가 목회 행정 > 신청서에서 넣는다.
--                  공개(published) 양식은 누구나 읽는다(로그인 전 홈페이지 히어로·신청서 페이지). 쓰기는 관리자(admins)만.
--  · app_entries : 신청 — 한 양식에 한 계정이 한 건(가족은 성인·미성년자 인원으로). 이름·연락처·인원·메모·금액(서버가 계산)
--                  읽기: 본인과 관리자만. 쓰기: 아래 함수로만 (표에 직접 쓰기·지우기는 막는다 — 지우는 기능 없음)
--                    app_submit        신청하기·고치기 (신청 기간에만, 금액은 양식의 신청비로 서버가 계산)
--                    app_cancel        신청 취소 (납부를 표시하기 전까지만)
--                    app_mark_paid     '납부했습니다' → 신청서 확인에 '납부 완료'
--                    app_msg_read      교회가 보낸 안내를 읽음으로 표시
--                    app_admin_payment 관리자: 입금 확인 · 납부 취소(미납으로 되돌림)+안내 보내기 · 납부 처리(현금 등) · 신청 취소/되살리기
--  · app_open_forms() : 지금 신청 기간인 양식 (서버 시계 기준) — 홈페이지 히어로·신청서 페이지가 쓴다
--  · 교회 안내(admin_msg): 사이트에 개인 쪽지함이 따로 없어(공지 notices 는 전체 공개) 신청 기록에 붙여 둔다.
--    신청한 사람은 대시보드 맨 위·신청서 카드·신청서 페이지·히어로 '신청 확인'에서 본다.
--  · 비파괴: 새 표 2개 + 함수 + 트리거. 지우는 것 없음. 맨 끝에 첫 신청서(삼일 만세길 걷기)를 한 번만 넣는다(이미 있으면 건너뜀).
--
-- 되돌리기 (DROP 대신 숨김·RENAME):
--   update public.app_forms set published = false;                 -- 홈페이지·신청서 페이지에서 모두 내림
--   drop function if exists public.app_open_forms();
--   drop function if exists public.app_submit(bigint, text, text, integer, integer, text);
--   drop function if exists public.app_cancel(bigint);
--   drop function if exists public.app_mark_paid(bigint);
--   drop function if exists public.app_msg_read(bigint);
--   drop function if exists public.app_admin_payment(bigint, text, text);
--   alter table public.app_entries rename to app_entries_archived;
--   alter table public.app_forms rename to app_forms_archived;
--   (함수는 자료를 담지 않으므로 지워도 신청 기록은 남는다. 표 자체를 지우는 일은 4주 뒤 백업 확인 후 사람이 한다.)

-- ── 신청서 양식 ──
create table if not exists public.app_forms (
  id           bigserial primary key,
  title        text        not null check (char_length(title) between 1 and 200),
  summary      text        not null default '',          -- 히어로에 띄울 한 줄 안내 (비우면 날짜·장소만)
  body         text        not null default '',          -- 자세한 안내 (줄바꿈 그대로 보인다)
  event_date   date,                                     -- 행사 날짜
  event_time   time,                                     -- 행사 시각
  place        text        not null default '',          -- 장소
  open_at      timestamptz not null default now(),       -- 신청 시작 — 이때부터 히어로에 뜬다
  close_at     timestamptz,                              -- 신청 마감 — 이때 히어로에서 내려간다 (비우면 마감 없음)
  fee_adult    integer     not null default 0 check (fee_adult >= 0),   -- 성인 1명 신청비(원)
  fee_minor    integer     not null default 0 check (fee_minor >= 0),  -- 미성년자 1명 신청비(원)
  ask_minor    boolean     not null default true,        -- 미성년자 인원을 따로 받는가
  memo_label   text        not null default '',          -- 메모 칸 질문 (비우면 메모 칸 없음)
  pay_bank     text        not null default '',          -- 납부 받는 은행 (예: 농협) — 토스 송금 연결에 쓴다
  pay_account  text        not null default '',          -- 계좌번호
  pay_holder   text        not null default '',          -- 예금주
  pay_toss_url text        not null default '',          -- 토스 송금 링크 (https://toss.me/아이디)
  show_hero    boolean     not null default true,        -- 신청 기간에 홈페이지 첫 화면(히어로)에 띄움
  published    boolean     not null default true,        -- false = 숨김(준비 중·내림)
  created_by   uuid                 default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint app_forms_period check (close_at is null or close_at > open_at)
);
create index if not exists idx_app_forms_period on public.app_forms (open_at, close_at);

-- ── 신청 ──
create table if not exists public.app_entries (
  id           bigserial primary key,
  form_id      bigint      not null references public.app_forms (id),
  user_id      uuid        not null default auth.uid(),
  name         text        not null check (char_length(name) between 1 and 60),
  phone        text        not null default '' check (char_length(phone) <= 30),
  adults       integer     not null default 1 check (adults between 0 and 50),
  minors       integer     not null default 0 check (minors between 0 and 50),
  memo         text        not null default '' check (char_length(memo) <= 1000),
  fee_total    integer     not null default 0 check (fee_total >= 0),
  status       text        not null default 'active' check (status in ('active', 'cancelled')),
  paid_at      timestamptz,                               -- '납부했습니다'(본인) 또는 관리자 납부 처리 → '납부 완료'
  paid_by      text        not null default '' check (paid_by in ('', 'self', 'admin')),
  confirmed_at timestamptz,                               -- 관리자가 통장 내역과 맞춰 본 시각
  admin_msg    text        not null default '' check (char_length(admin_msg) <= 1000),   -- 교회가 신청한 사람에게 보내는 안내
  admin_msg_at timestamptz,
  msg_read_at  timestamptz,                               -- 신청한 사람이 안내를 읽음으로 표시한 시각
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint app_entries_one_per_user unique (form_id, user_id),
  constraint app_entries_people check (adults + minors >= 1)
);
create index if not exists idx_app_entries_user on public.app_entries (user_id, created_at desc);

-- updated_at 자동
create or replace function public.app_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists app_forms_touch on public.app_forms;
create trigger app_forms_touch before update on public.app_forms for each row execute function public.app_touch();
drop trigger if exists app_entries_touch on public.app_entries;
create trigger app_entries_touch before update on public.app_entries for each row execute function public.app_touch();

-- ── RLS ──
alter table public.app_forms enable row level security;
alter table public.app_entries enable row level security;

-- 양식: 공개 양식은 누구나, 관리자는 숨긴 양식까지 읽고 쓴다 (지우기 정책은 없다 → 지울 수 없다)
drop policy if exists "app_forms public read" on public.app_forms;
create policy "app_forms public read" on public.app_forms for select to anon, authenticated using (published);
drop policy if exists "app_forms admin read" on public.app_forms;
create policy "app_forms admin read" on public.app_forms for select to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "app_forms admin insert" on public.app_forms;
create policy "app_forms admin insert" on public.app_forms for insert to authenticated
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
drop policy if exists "app_forms admin update" on public.app_forms;
create policy "app_forms admin update" on public.app_forms for update to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()))
  with check (exists (select 1 from public.admins a where a.uid = auth.uid()));
revoke insert, update, delete, truncate on public.app_forms from anon;
revoke delete, truncate on public.app_forms from authenticated;
grant select on public.app_forms to anon, authenticated;
grant insert, update on public.app_forms to authenticated;
grant usage, select on sequence public.app_forms_id_seq to authenticated;

-- 신청: 본인 것만(관리자는 모두) 읽는다. 쓰기는 함수로만 — 표 권한을 거둔다
drop policy if exists "app_entries own read" on public.app_entries;
create policy "app_entries own read" on public.app_entries for select to authenticated using (user_id = auth.uid());
drop policy if exists "app_entries admin read" on public.app_entries;
create policy "app_entries admin read" on public.app_entries for select to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()));
revoke all on public.app_entries from anon;
revoke insert, update, delete, truncate on public.app_entries from authenticated;
grant select on public.app_entries to authenticated;

-- ── 지금 신청 기간인 양식 (서버 시계) ──
create or replace function public.app_open_forms()
returns setof public.app_forms language sql stable set search_path = public as $$
  select * from public.app_forms f
   where f.published and f.open_at <= now() and (f.close_at is null or f.close_at > now())
   order by f.open_at desc, f.id desc
$$;
grant execute on function public.app_open_forms() to anon, authenticated;

-- ── 신청하기·고치기 ──
--   같은 양식에 이미 신청했으면 그 신청을 고친다(취소했던 신청이면 되살린다).
--   '납부했습니다'를 누른 뒤에는 금액이 바뀌는 수정은 받지 않는다(이름·연락처·메모처럼 금액이 그대로면 된다).
create or replace function public.app_submit(p_form bigint, p_name text, p_phone text, p_adults integer, p_minors integer default 0, p_memo text default '')
returns json language plpgsql security definer set search_path = public as $$
declare
  f public.app_forms; e public.app_entries;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_ad integer := coalesce(p_adults, 0);
  v_mi integer := coalesce(p_minors, 0);
  v_memo text := left(btrim(coalesce(p_memo, '')), 1000);
  v_fee integer; v_id bigint;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 신청할 수 있습니다.'); end if;
  select * into f from public.app_forms where id = p_form and published;
  if not found then return json_build_object('ok', false, 'why', 'form', 'error', '신청서를 찾을 수 없습니다.'); end if;
  if now() < f.open_at then return json_build_object('ok', false, 'why', 'before', 'error', '아직 신청 기간이 아닙니다.'); end if;
  if f.close_at is not null and now() >= f.close_at then return json_build_object('ok', false, 'why', 'closed', 'error', '신청이 마감되었습니다.'); end if;
  if not f.ask_minor then v_mi := 0; end if;
  if f.memo_label = '' then v_memo := ''; end if;
  if v_name = '' or char_length(v_name) > 60 then return json_build_object('ok', false, 'why', 'name', 'error', '신청하는 분 이름을 적어 주십시오.'); end if;
  if v_phone = '' or char_length(v_phone) > 30 then return json_build_object('ok', false, 'why', 'phone', 'error', '연락처를 적어 주십시오.'); end if;
  if v_ad < 0 or v_mi < 0 or v_ad > 50 or v_mi > 50 or v_ad + v_mi < 1 then
    return json_build_object('ok', false, 'why', 'count', 'error', '인원을 확인해 주십시오.');
  end if;
  v_fee := v_ad * f.fee_adult + v_mi * f.fee_minor;

  select * into e from public.app_entries where form_id = f.id and user_id = auth.uid() for update;
  if found then
    if e.paid_at is not null and e.fee_total <> v_fee then
      return json_build_object('ok', false, 'why', 'paid', 'error', '납부를 표시한 뒤에는 금액이 바뀌는 수정을 할 수 없습니다. 교회에 말씀해 주십시오.');
    end if;
    update public.app_entries
       set name = v_name, phone = v_phone, adults = v_ad, minors = v_mi, memo = v_memo, fee_total = v_fee, status = 'active'
     where id = e.id;
    return json_build_object('ok', true, 'id', e.id, 'fee_total', v_fee, 'updated', true);
  end if;
  insert into public.app_entries (form_id, user_id, name, phone, adults, minors, memo, fee_total)
  values (f.id, auth.uid(), v_name, v_phone, v_ad, v_mi, v_memo, v_fee)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'fee_total', v_fee, 'updated', false);
end $$;
revoke all on function public.app_submit(bigint, text, text, integer, integer, text) from public, anon;
grant execute on function public.app_submit(bigint, text, text, integer, integer, text) to authenticated;

-- ── 신청 취소 (본인, 납부 표시 전까지) ──
create or replace function public.app_cancel(p_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare e public.app_entries;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인이 필요합니다.'); end if;
  select * into e from public.app_entries where id = p_id and user_id = auth.uid() for update;
  if not found then return json_build_object('ok', false, 'why', 'none', 'error', '신청을 찾을 수 없습니다.'); end if;
  if e.status <> 'active' then return json_build_object('ok', true, 'already', true); end if;
  if e.paid_at is not null then return json_build_object('ok', false, 'why', 'paid', 'error', '납부를 표시한 신청은 교회에 말씀해 취소해 주십시오.'); end if;
  update public.app_entries set status = 'cancelled' where id = e.id;
  return json_build_object('ok', true);
end $$;
revoke all on function public.app_cancel(bigint) from public, anon;
grant execute on function public.app_cancel(bigint) to authenticated;

-- ── '납부했습니다' (본인) — 교회 안내가 있었으면 그 안내도 읽은 것으로 ──
create or replace function public.app_mark_paid(p_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare e public.app_entries;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인이 필요합니다.'); end if;
  select * into e from public.app_entries where id = p_id and user_id = auth.uid() for update;
  if not found then return json_build_object('ok', false, 'why', 'none', 'error', '신청을 찾을 수 없습니다.'); end if;
  if e.status <> 'active' then return json_build_object('ok', false, 'why', 'cancelled', 'error', '취소한 신청입니다.'); end if;
  if e.fee_total <= 0 then return json_build_object('ok', false, 'why', 'free', 'error', '낼 신청비가 없습니다.'); end if;
  if e.paid_at is not null then return json_build_object('ok', true, 'already', true); end if;
  update public.app_entries
     set paid_at = now(), paid_by = 'self', confirmed_at = null,
         msg_read_at = case when admin_msg <> '' then now() else msg_read_at end
   where id = e.id;
  return json_build_object('ok', true);
end $$;
revoke all on function public.app_mark_paid(bigint) from public, anon;
grant execute on function public.app_mark_paid(bigint) to authenticated;

-- ── 교회 안내 읽음 (본인) ──
create or replace function public.app_msg_read(p_id bigint)
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login'); end if;
  update public.app_entries set msg_read_at = now()
   where id = p_id and user_id = auth.uid() and admin_msg <> '' and msg_read_at is null;
  return json_build_object('ok', true);
end $$;
revoke all on function public.app_msg_read(bigint) from public, anon;
grant execute on function public.app_msg_read(bigint) to authenticated;

-- ── 관리자: 납부·신청 상태 바꾸기 + 안내 보내기 ──
--   p_action: 'confirm'   입금 확인 (통장 내역과 맞음)
--             'unconfirm' 입금 확인 풀기
--             'unpaid'    납부 취소 — 미납으로 되돌림 (p_msg 가 있으면 함께 안내를 보낸다)
--             'mark_paid' 납부 처리 — 현금 등으로 받았을 때 (입금 확인까지)
--             'message'   안내만 보내기 (p_msg 필수)
--             'cancel'    신청 취소 · 'restore' 되살리기
create or replace function public.app_admin_payment(p_id bigint, p_action text, p_msg text default '')
returns json language plpgsql security definer set search_path = public as $$
declare e public.app_entries; v_msg text := left(btrim(coalesce(p_msg, '')), 1000);
begin
  if not exists (select 1 from public.admins where uid = auth.uid()) then
    return json_build_object('ok', false, 'why', 'admin', 'error', '관리자만 할 수 있습니다.');
  end if;
  select * into e from public.app_entries where id = p_id for update;
  if not found then return json_build_object('ok', false, 'why', 'none', 'error', '신청을 찾을 수 없습니다.'); end if;

  if p_action = 'confirm' then
    update public.app_entries set paid_at = coalesce(paid_at, now()), paid_by = case when paid_at is null then 'admin' else paid_by end, confirmed_at = now() where id = e.id;
  elsif p_action = 'unconfirm' then
    update public.app_entries set confirmed_at = null where id = e.id;
  elsif p_action = 'unpaid' then
    update public.app_entries set paid_at = null, paid_by = '', confirmed_at = null where id = e.id;
  elsif p_action = 'mark_paid' then
    update public.app_entries set paid_at = now(), paid_by = 'admin', confirmed_at = now() where id = e.id;
  elsif p_action = 'message' then
    if v_msg = '' then return json_build_object('ok', false, 'why', 'msg', 'error', '보낼 안내를 적어 주십시오.'); end if;
  elsif p_action = 'cancel' then
    update public.app_entries set status = 'cancelled' where id = e.id;
  elsif p_action = 'restore' then
    update public.app_entries set status = 'active' where id = e.id;
  else
    return json_build_object('ok', false, 'why', 'action', 'error', '알 수 없는 작업입니다.');
  end if;

  if v_msg <> '' then
    update public.app_entries set admin_msg = v_msg, admin_msg_at = now(), msg_read_at = null where id = e.id;
  end if;
  select * into e from public.app_entries where id = p_id;
  return json_build_object('ok', true, 'entry', row_to_json(e));
end $$;
revoke all on function public.app_admin_payment(bigint, text, text) from public, anon;
grant execute on function public.app_admin_payment(bigint, text, text) to authenticated;

-- ── 첫 신청서: 삼일 만세길 걷기 (2026-10-18 주일 오후 2시 · 쌍봉산 근린공원 · 성인 5,000원 / 미성년자 무료)
--    신청 기간: 2026-10-10 0시 ~ 행사 시작(10-18 오후 2시). 납부 받는 곳(은행·계좌·예금주·토스 링크)은 비워 둔다
--    → 관리자가 목회 행정 > 신청서 > '양식 고치기'에서 넣는다. 이미 있으면 다시 넣지 않는다.
--    되돌리기: update public.app_forms set published = false where title = '삼일 만세길 걷기' and event_date = '2026-10-18';
insert into public.app_forms (title, summary, body, event_date, event_time, place, open_at, close_at, fee_adult, fee_minor, ask_minor, memo_label, show_hero, published)
select '삼일 만세길 걷기', '', '', date '2026-10-18', time '14:00', '쌍봉산 근린공원',
       timestamptz '2026-10-10 00:00:00+09', timestamptz '2026-10-18 14:00:00+09', 5000, 0, true, '', true, true
where not exists (select 1 from public.app_forms where title = '삼일 만세길 걷기' and event_date = date '2026-10-18');

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
