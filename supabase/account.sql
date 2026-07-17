-- ============================================================
--  운평장로교회 — 계정 정책 (회원 탈퇴 Soft Delete + 익명화)
--  Supabase → SQL Editor 에 붙여넣고 RUN 하세요. (여러 번 실행해도 안전)
--
--  탈퇴 정책:
--   · 데이터는 진짜 삭제하지 않고 '탈퇴 표시(withdrawn_at)'만 남김
--   · 이메일·이름·연락처 등 개인식별정보는 익명화
--   · 게시물(글·사진·댓글)은 남기되 작성자명을 '탈퇴한 회원'으로 변경
--   · 연말정산 신청(주민번호 등 민감정보)은 즉시 삭제
--   · 탈퇴한 계정은 로그인 불가(계정 잠금), 같은 이메일·카카오로 재가입은 가능
-- ============================================================

-- 탈퇴 표시 컬럼
alter table public.profiles add column if not exists withdrawn_at timestamptz;

-- 탈퇴 처리 함수: 로그인한 본인만 자신을 탈퇴시킬 수 있음
create or replace function public.withdraw_me()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  cols text;
begin
  if uid is null then
    raise exception '로그인이 필요합니다';
  end if;

  -- 1) 프로필: 탈퇴 표시 + 익명화 (연락처·생일·주소 등은 있는 컬럼만 비움)
  select string_agg(format('%I = null', column_name), ', ')
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name in ('phone','bio','birth','address','address_detail','role','family');
  execute format(
    'update public.profiles set withdrawn_at = now(), name = ''탈퇴한 회원'', email = null%s where id = %L',
    coalesce(', ' || cols, ''), uid);

  -- 2) 민감정보(연말정산 신청: 주민번호 등)는 즉시 삭제
  if to_regclass('public.tax_requests') is not null then
    execute format('delete from public.tax_requests where user_id = %L', uid);
  end if;

  -- 3) 교적 연결 해제(정회원 인증 기록)
  if to_regclass('public.member_links') is not null then
    execute format('delete from public.member_links where user_id = %L', uid);
  end if;

  -- 4) 게시물은 남기고 작성자명만 익명화
  if to_regclass('public.posts') is not null then
    execute format('update public.posts set author_name = ''탈퇴한 회원'' where user_id = %L', uid);
  end if;
  if to_regclass('public.comments') is not null then
    execute format('update public.comments set author_name = ''탈퇴한 회원'' where user_id = %L', uid);
  end if;
  if to_regclass('public.album_photos') is not null then
    execute format('update public.album_photos set author_name = ''탈퇴한 회원'' where user_id = %L', uid);
  end if;
  if to_regclass('public.album_comments') is not null then
    execute format('update public.album_comments set author_name = ''탈퇴한 회원'' where user_id = %L', uid);
  end if;

  -- 5) 로그인 계정 잠금 + 이메일 익명화 (같은 이메일로 재가입 가능해짐)
  update auth.users
     set email = 'withdrawn+' || uid || '@deleted.invalid',
         raw_user_meta_data = jsonb_build_object('name', '탈퇴한 회원', 'withdrawn', true),
         banned_until = now() + interval '100 years',
         encrypted_password = 'withdrawn'
   where id = uid;

  -- 소셜(카카오) 연결 해제 → 같은 카카오 계정으로 재가입 가능
  delete from auth.identities where user_id = uid;

  -- 열려 있는 세션 종료
  delete from auth.sessions where user_id = uid;
  delete from auth.refresh_tokens where user_id = uid::text;
end; $$;

revoke all on function public.withdraw_me() from public, anon;
grant execute on function public.withdraw_me() to authenticated;
