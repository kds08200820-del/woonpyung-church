-- ============================================================
-- 신앙 정원 — 내 지역(날씨) 기본값을 교적 주소에서 (2026-10-23 담임목사 지시)
--   "교적에 있는 데이터를 사용하여 기본적으로 성도들의 거주 지역을 설정하세요. 교적과 연동되어야 합니다."
--
-- [무엇]
-- · garden_my_region(): 로그인한 사람 '본인'의 교적 주소(member_links → gyojeok.address, 없으면 배우자 줄)에서
--   시·도 / 시·군·구 / 읍·면·동까지만 잘라 본인에게만 돌려준다. 도로명·번지·동호수·이름·연락처는 내보내지 않는다.
-- · 화면(js/garden/region.js)은 이 지역 이름으로 좌표를 찾아 날씨·주간 예보를 그 지역으로 보여 준다.
--   성도가 우편번호 검색으로 고른 지역은 그 기기에만 저장한다(교적은 고치지 않는다 — 교적 주소는 목회 행정에서).
-- [표]   새 표·칸 없음
-- [함수] garden_my_region()
-- [필요] member_links · gyojeok 이 없으면 'none' 을 돌려줄 뿐 오류는 없다
-- [실행] SQL Editor 에서 이 파일 내용 그대로 1회 (다시 실행해도 안전)
--
-- [되돌리기(롤백)]
--   drop function if exists public.garden_my_region();
-- ============================================================

begin;

create or replace function public.garden_my_region() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_addr text; w text;
  v_sido text; v_sgg text; v_dong text;
  v_short text[] := array['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
begin
  if v_uid is null then return json_build_object('ok', false, 'why', 'login'); end if;
  if to_regclass('public.member_links') is null or to_regclass('public.gyojeok') is null then
    return json_build_object('ok', false, 'why', 'none');
  end if;
  -- 본인 줄을 먼저, 없으면 배우자 줄(같은 집)
  execute $q$
    select g.address from public.member_links ml
      join public.gyojeok g on g.member_key = ml.member_key or (coalesce(ml.spouse_key, '') <> '' and g.member_key = ml.spouse_key)
     where ml.user_id = $1 and coalesce(btrim(g.address), '') <> ''
     order by (g.member_key = ml.member_key) desc
     limit 1 $q$ into v_addr using v_uid;
  if v_addr is null then return json_build_object('ok', false, 'why', 'none'); end if;

  -- 앞에서부터 시·도 → 시·군·구(둘일 수 있다: 수원시 팔달구) → 읍·면·동 까지. 도로명(로·길)·숫자가 나오면 멈춘다
  foreach w in array regexp_split_to_array(btrim(regexp_replace(v_addr, '\([^)]*\)|,', ' ', 'g')), '\s+') loop
    exit when w = '' or w ~ '[0-9]' or w ~ '(로|길|번지)$';
    if v_sido is null and v_sgg is null and (w ~ '(특별시|광역시|특별자치시|특별자치도|도)$' or w = any (v_short)) then
      v_sido := w;
    elsif v_dong is null and w ~ '(시|군|구)$' then
      v_sgg := coalesce(v_sgg || ' ', '') || w;
    elsif w ~ '(읍|면|동|가)$' then
      v_dong := w; exit;
    else
      exit;
    end if;
  end loop;
  if v_sido is null and v_sgg is null then return json_build_object('ok', false, 'why', 'parse'); end if;
  return json_build_object('ok', true, 'sido', v_sido, 'sigungu', v_sgg, 'dong', v_dong);
end $$;

revoke all on function public.garden_my_region() from public, anon;
grant execute on function public.garden_my_region() to authenticated;

commit;

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
