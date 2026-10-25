-- 학습·세례(입교) 신청서 (2026-10-25 담임목사 지시)
--  · 신청서에 '종류'를 둔다: general(지금까지의 일반 신청서) · baptism(학습·세례(입교) 신청 — 문답을 적어 낸다)
--  · app_forms.kind       : 'general' | 'baptism' (기본 general — 기존 신청서는 그대로)
--  · app_forms.questions  : 문답 질문 목록 jsonb ["질문1","질문2",…] — 관리자가 신청서를 만들 때 학습·세례 문답을 넣는다.
--                           질문 앞에 '[학습] ' 이나 '[세례] ' 를 붙이면 그 종류를 고른 분에게만 묻는다(안 붙이면 모두에게). 한 신청서에 두 문답을 함께 둘 수 있다
--  · app_entries.apply_kind : 신청 종류 '학습' | '세례(입교)'  ·  app_entries.answers : 답변 jsonb ["답1","답2",…]
--  · app_form_targets     : 신청 대상(교적부에서 세례를 받지 않은 만 14세 이상). 이름은 저장하지 않고 교적 매칭키의 해시(16자리)만 둔다.
--                           대상 판단은 관리자 화면이 교적부(구글시트)를 읽어 계산해 '해시 목록'만 서버에 확정한다.
--                           관리자만 읽고 쓴다(공개 안 됨). 대상이 하나도 확정되지 않았으면 로그인한 누구나 신청할 수 있다.
--  · 함수
--      app_key_hash(키)                 : 매칭키 → 해시(서버·화면 같은 규칙)
--      app_form_set_targets(신청서, 해시들) : 관리자 — 대상 목록 확정(이전 대상은 비활성으로 돌려 두고 새 목록을 켠다, 지우지 않음)
--      app_my_targets()                 : 로그인한 나 — 내가 대상인 '지금 받는' 학습·세례 신청서 번호들(알림 태그·안내 카드에 쓴다)
--      app_submit_qa(신청서, 이름, 연락처, 종류, 답변들) : 신청하기·고치기(대상 확인 포함, 신청비 없음)
--  · 비파괴: 칸 4개 추가(기본값 있음) + 표 1개 + 함수 4개. 지우는 것 없음.
--    이 SQL 을 실행하기 전에도 화면은 지금처럼 동작한다(학습·세례 신청서를 만드는 칸이 나타나지 않는다).
--
-- 되돌리기 (DROP 대신 숨김·RENAME):
--   update public.app_forms set published = false where kind = 'baptism';       -- 학습·세례 신청서를 모두 내림
--   drop function if exists public.app_submit_qa(bigint, text, text, text, jsonb);
--   drop function if exists public.app_my_targets();
--   drop function if exists public.app_form_set_targets(bigint, text[]);
--   drop function if exists public.app_key_hash(text);
--   alter table public.app_form_targets rename to app_form_targets_archived;
--   alter table public.app_forms rename column kind to kind_archived;  (questions 도 같은 방식)
--   alter table public.app_entries rename column apply_kind to apply_kind_archived;  (answers 도 같은 방식)
--   (표·칸 삭제는 4주 뒤 백업 확인 후 사람이 한다)

alter table public.app_forms add column if not exists kind text not null default 'general' check (kind in ('general', 'baptism'));
alter table public.app_forms add column if not exists questions jsonb not null default '[]'::jsonb;
alter table public.app_entries add column if not exists apply_kind text not null default '';
alter table public.app_entries add column if not exists answers jsonb not null default '[]'::jsonb;

create table if not exists public.app_form_targets (
  form_id    bigint      not null references public.app_forms (id),
  key_hash   text        not null check (key_hash ~ '^[0-9a-f]{16}$'),
  active     boolean     not null default true,
  created_at timestamptz not null default now(),
  primary key (form_id, key_hash)
);
alter table public.app_form_targets enable row level security;
drop policy if exists "app_form_targets admin read" on public.app_form_targets;
create policy "app_form_targets admin read" on public.app_form_targets for select to authenticated
  using (exists (select 1 from public.admins a where a.uid = auth.uid()));
revoke all on public.app_form_targets from anon;
revoke insert, update, delete, truncate on public.app_form_targets from authenticated;
grant select on public.app_form_targets to authenticated;

-- 교적 매칭키('이름|YYYYMMDD') → 해시. 화면(JS)도 같은 규칙: sha256('wpc-bt|' + 키) 앞 16자리
create or replace function public.app_key_hash(p text)
returns text language sql immutable as $$
  select case when btrim(coalesce(p, '')) = '' then null
              else left(encode(sha256(convert_to('wpc-bt|' || btrim(p), 'UTF8')), 'hex'), 16) end
$$;

-- 관리자: 신청 대상 확정
create or replace function public.app_form_set_targets(p_form bigint, p_hashes text[])
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not exists (select 1 from public.admins where uid = auth.uid()) then
    return json_build_object('ok', false, 'why', 'admin', 'error', '관리자만 할 수 있습니다.');
  end if;
  if not exists (select 1 from public.app_forms where id = p_form and kind = 'baptism') then
    return json_build_object('ok', false, 'why', 'form', 'error', '학습·세례 신청서가 아닙니다.');
  end if;
  update public.app_form_targets set active = false where form_id = p_form;
  insert into public.app_form_targets (form_id, key_hash, active)
  select p_form, h, true from (select distinct h from unnest(coalesce(p_hashes, '{}'::text[])) h where h ~ '^[0-9a-f]{16}$') s
  on conflict (form_id, key_hash) do update set active = true;
  select count(*) into v_n from public.app_form_targets where form_id = p_form and active;
  return json_build_object('ok', true, 'n', v_n);
end $$;
revoke all on function public.app_form_set_targets(bigint, text[]) from public, anon;
grant execute on function public.app_form_set_targets(bigint, text[]) to authenticated;

-- 나: 내가 대상인 지금 받는 학습·세례 신청서 번호들 (대상 이름·해시는 돌려주지 않는다)
create or replace function public.app_my_targets()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(t.form_id order by t.form_id), '[]'::json)
    from public.app_form_targets t
    join public.app_forms f on f.id = t.form_id
   where auth.uid() is not null and t.active and f.published and f.kind = 'baptism'
     and f.open_at <= now() and (f.close_at is null or f.close_at > now())
     and t.key_hash = public.app_key_hash((select l.member_key from public.member_links l where l.user_id = auth.uid()))
$$;
revoke all on function public.app_my_targets() from public, anon;
grant execute on function public.app_my_targets() to authenticated;

-- 신청하기·고치기 (학습·세례(입교)) — 신청비 없음, 신청 기간에만, 대상이 확정돼 있으면 대상만
create or replace function public.app_submit_qa(p_form bigint, p_name text, p_phone text, p_apply text, p_answers jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  f public.app_forms; e public.app_entries;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_nq integer; v_id bigint; v_ans jsonb := '[]'::jsonb; v_a text; v_q text; i integer;
  v_has_targets boolean; v_is_target boolean;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'why', 'login', 'error', '로그인한 뒤 신청할 수 있습니다.'); end if;
  select * into f from public.app_forms where id = p_form and published and kind = 'baptism' for update;
  if not found then return json_build_object('ok', false, 'why', 'form', 'error', '신청서를 찾을 수 없습니다.'); end if;
  if now() < f.open_at then return json_build_object('ok', false, 'why', 'before', 'error', '아직 신청 기간이 아닙니다.'); end if;
  if f.close_at is not null and now() >= f.close_at then return json_build_object('ok', false, 'why', 'closed', 'error', '신청이 마감되었습니다.'); end if;
  if v_name = '' or char_length(v_name) > 60 then return json_build_object('ok', false, 'why', 'name', 'error', '신청하는 분 이름을 적어 주십시오.'); end if;
  if v_phone = '' or char_length(v_phone) > 30 then return json_build_object('ok', false, 'why', 'phone', 'error', '연락처를 적어 주십시오.'); end if;
  if p_apply not in ('학습', '세례(입교)') then return json_build_object('ok', false, 'why', 'apply', 'error', '학습과 세례(입교) 가운데 하나를 골라 주십시오.'); end if;

  select exists (select 1 from public.app_form_targets where form_id = f.id and active) into v_has_targets;
  if v_has_targets then
    select exists (select 1 from public.app_form_targets t
                    where t.form_id = f.id and t.active
                      and t.key_hash = public.app_key_hash((select l.member_key from public.member_links l where l.user_id = auth.uid()))) into v_is_target;
    if not v_is_target then
      return json_build_object('ok', false, 'why', 'target', 'error', '신청 대상이 아닙니다. 대상이어야 하는데 신청이 안 되면 교회에 말씀해 주십시오.');
    end if;
  end if;

  v_nq := case when jsonb_typeof(f.questions) = 'array' then jsonb_array_length(f.questions) else 0 end;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> v_nq then
    return json_build_object('ok', false, 'why', 'answers', 'error', '문답을 모두 적어 주십시오.');
  end if;
  for i in 0 .. v_nq - 1 loop
    v_q := coalesce(f.questions ->> i, '');
    if (v_q like '[학습]%' and p_apply <> '학습') or (v_q like '[세례]%' and p_apply <> '세례(입교)') then   -- 고른 종류에 해당하지 않는 질문은 건너뛴다(빈 답으로 둔다)
      v_ans := v_ans || to_jsonb(''::text); continue;
    end if;
    v_a := btrim(coalesce(p_answers ->> i, ''));
    if v_a = '' then return json_build_object('ok', false, 'why', 'answer', 'index', i, 'error', (i + 1) || '번 문답을 적어 주십시오.'); end if;
    if char_length(v_a) > 3000 then return json_build_object('ok', false, 'why', 'answer', 'index', i, 'error', (i + 1) || '번 답은 3000자까지 적을 수 있습니다.'); end if;
    v_ans := v_ans || to_jsonb(v_a);
  end loop;

  select * into e from public.app_entries where form_id = f.id and user_id = auth.uid() for update;
  if found then
    update public.app_entries
       set name = v_name, phone = v_phone, adults = 1, minors = 0, memo = '', fee_total = 0, status = 'active',
           participants = jsonb_build_array(jsonb_build_object('name', v_name, 'kind', 'adult')), apply_kind = p_apply, answers = v_ans
     where id = e.id;
    return json_build_object('ok', true, 'id', e.id, 'updated', true);
  end if;
  insert into public.app_entries (form_id, user_id, name, phone, adults, minors, memo, fee_total, participants, apply_kind, answers)
  values (f.id, auth.uid(), v_name, v_phone, 1, 0, '', 0, jsonb_build_array(jsonb_build_object('name', v_name, 'kind', 'adult')), p_apply, v_ans)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'updated', false);
end $$;
revoke all on function public.app_submit_qa(bigint, text, text, text, jsonb) from public, anon;
grant execute on function public.app_submit_qa(bigint, text, text, text, jsonb) to authenticated;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
