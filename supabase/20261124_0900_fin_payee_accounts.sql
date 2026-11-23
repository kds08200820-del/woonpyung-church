-- ============================================================
--  운평장로교회 — 재정 청원 받는 계좌 (2026-11-24 담임목사 지시)
--  Supabase → SQL Editor 에서 1회 실행 (여러 번 실행해도 안전)
--
--  목사님: "청원자의 계좌 번호를 등록할 수 있도록. 계좌번호 등록하기를 선택하여 이후에도 계속 쓸 수 있도록,
--          청원서를 출력할 때 계좌도 같이 출력. 다른 사람이 받을 때는 계좌 번호를 따로 입력할 수 있고,
--          등록된 계좌는 삭제되지 않아야 합니다."
--
--  들어 있는 것 (모두 비파괴: CREATE TABLE · ADD COLUMN(기본값 '') · CREATE FUNCTION 뿐):
--   1) fin_payee_accounts : 청원자가 등록한 계좌(예금주 · 은행 · 계좌번호). 등록한 사람과 재정 권한자만 읽는다.
--                           지우는 길이 없다 — delete 권한도, 지우는 함수도 두지 않는다(회원이 탈퇴해도 줄은 남는다).
--                           고치는 길도 없다 — 바뀌면 새로 등록한다(예전 청원서에 찍힌 계좌가 그대로 남도록).
--   2) fin_petitions 에 받는 계좌 칸(pay_holder · pay_bank · pay_account · pay_account_id) — 청원할 때의 계좌를 그대로 적어 둔다.
--   3) 함수
--      fin_account_add(은행, 계좌번호, 예금주)  : 계좌 등록(같은 계좌면 있던 줄 번호를 돌려준다)
--      fin_petition_submit2(..., 계좌)          : 받는 계좌와 함께 청원. 등록한 계좌를 고르거나(p_account_id),
--                                                 그때만 쓰는 계좌를 적는다(다른 사람이 받을 때). p_save=true 면 그 계좌도 등록.
--      (예전 fin_petition_submit 은 그대로 둔다 — 계좌 없이 내는 청원)
--   필요한 것: 20261124_0800_fin_petitions.sql
--
--  ── 되돌리는 방법 (사람이 직접) ──
--    · 함수: drop function if exists public.fin_account_add(text, text, text),
--            public.fin_petition_submit2(text, text, text, bigint, text, jsonb, bigint, text, text, text, boolean);
--    · 칸: alter table public.fin_petitions rename column pay_account to pay_account_archived;  (나머지 pay_* 도 같은 방식, DROP 하지 않는다)
--    · 표: alter table public.fin_payee_accounts rename to fin_payee_accounts_archived;
-- ============================================================

-- ── 1) 등록 계좌 ──────────────────────────────────────────────
create table if not exists public.fin_payee_accounts (
  id          bigint generated always as identity primary key,
  owner_uid   uuid references auth.users (id) on delete set null default auth.uid(),
  holder      text not null check (char_length(holder) between 1 and 40),     -- 예금주
  bank        text not null check (char_length(bank) between 1 and 30),       -- 은행
  account_no  text not null check (char_length(account_no) between 4 and 40), -- 계좌번호(숫자 · - 만)
  created_at  timestamptz not null default now()
);
create index if not exists fin_payee_accounts_owner_idx on public.fin_payee_accounts (owner_uid);

alter table public.fin_payee_accounts enable row level security;
drop policy if exists "fin_payee_accounts_select" on public.fin_payee_accounts;
create policy "fin_payee_accounts_select" on public.fin_payee_accounts
  for select using (owner_uid = auth.uid() or public.can_access_finance());
-- 읽기만. 넣기는 아래 함수로, 고치기 · 지우기는 아무도 못 한다.
revoke all on public.fin_payee_accounts from anon, authenticated;
grant select on public.fin_payee_accounts to authenticated;

-- ── 2) 청원의 받는 계좌 ───────────────────────────────────────
alter table public.fin_petitions add column if not exists pay_holder     text not null default '';
alter table public.fin_petitions add column if not exists pay_bank       text not null default '';
alter table public.fin_petitions add column if not exists pay_account    text not null default '';
alter table public.fin_petitions add column if not exists pay_account_id bigint references public.fin_payee_accounts (id) on delete set null;

-- ── 3) 함수 ──────────────────────────────────────────────────
create or replace function public.fin_account_add(p_bank text, p_account text, p_holder text)
returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  v_no  text := regexp_replace(coalesce(p_account, ''), '[^0-9-]', '', 'g');
  v_id  bigint;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if public.fin_can_petition() is not true and not exists (
       select 1 from public.fin_dept_heads h join public.member_links m on m.member_key = h.member_key and m.user_id = auth.uid()
        where h.active and coalesce(h.member_key, '') <> '')
     and not public.can_access_finance() then
    raise exception '재정 청원 권한이 필요합니다.';
  end if;
  if char_length(regexp_replace(v_no, '-', '', 'g')) < 4 then raise exception '계좌번호를 확인해 주세요.'; end if;
  if coalesce(btrim(p_bank), '') = '' then raise exception '은행을 적어 주세요.'; end if;
  if coalesce(btrim(p_holder), '') = '' then raise exception '예금주를 적어 주세요.'; end if;
  select id into v_id from public.fin_payee_accounts
   where owner_uid = auth.uid() and bank = btrim(p_bank) and account_no = v_no and holder = btrim(p_holder)
   order by id limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.fin_payee_accounts (owner_uid, holder, bank, account_no)
  values (auth.uid(), btrim(p_holder), btrim(p_bank), v_no)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.fin_account_add(text, text, text) from public, anon;
grant execute on function public.fin_account_add(text, text, text) to authenticated;

-- 받는 계좌와 함께 청원한다. 청원 자체의 확인(부서 · 계정 · 금액 · 영수증)은 fin_petition_submit 그대로.
create or replace function public.fin_petition_submit2(p_dept text, p_hang text, p_item text, p_amount bigint,
                                                      p_memo text, p_receipts jsonb,
                                                      p_account_id bigint, p_bank text, p_account text, p_holder text,
                                                      p_save boolean default false)
returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  v_id   bigint;
  v_aid  bigint := null;
  v_no   text := regexp_replace(coalesce(p_account, ''), '[^0-9-]', '', 'g');
  v_h    text := coalesce(btrim(p_holder), '');
  v_b    text := coalesce(btrim(p_bank), '');
begin
  if p_account_id is not null then
    select id, holder, bank, account_no into v_aid, v_h, v_b, v_no
      from public.fin_payee_accounts where id = p_account_id and owner_uid = auth.uid();
    if v_aid is null then raise exception '내가 등록한 계좌만 고를 수 있습니다.'; end if;
  elsif v_no <> '' then
    if coalesce(btrim(p_bank), '') = '' or coalesce(btrim(p_holder), '') = '' then raise exception '은행과 예금주를 함께 적어 주세요.'; end if;
    if char_length(regexp_replace(v_no, '-', '', 'g')) < 4 then raise exception '계좌번호를 확인해 주세요.'; end if;
  end if;
  v_id := public.fin_petition_submit(p_dept, p_hang, p_item, p_amount, p_memo, p_receipts);
  if v_aid is null and v_no <> '' and coalesce(p_save, false) then
    v_aid := public.fin_account_add(v_b, v_no, v_h);
  end if;
  update public.fin_petitions
     set pay_account_id = v_aid, pay_holder = v_h, pay_bank = v_b, pay_account = v_no
   where id = v_id;
  return v_id;
end $$;
revoke all on function public.fin_petition_submit2(text, text, text, bigint, text, jsonb, bigint, text, text, text, boolean) from public, anon;
grant execute on function public.fin_petition_submit2(text, text, text, bigint, text, jsonb, bigint, text, text, text, boolean) to authenticated;
