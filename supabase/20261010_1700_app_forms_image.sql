-- 신청서 안내 그림 (2026-10-10 담임목사 지시: "걷기대회 신청 란에 코스를 넣어 안내해 주세요")
--  · app_forms.image_url (text, 비워도 됨) — 신청 창·신청서 페이지·공지사항 '안내 보기'에 그림으로 나온다.
--    목회 행정 > 신청서 > 양식 고치기 > '안내 그림'에서 올리거나 주소를 넣는다.
--  · 삼일 만세길 걷기(2026-10-18)에 코스 약도와 코스 안내 글을 넣는다.
--    자세한 안내(body)는 비어 있을 때만 채운다 — 이미 적어 둔 안내가 있으면 그대로 둔다.
--  · 먼저 20261010_1140_app_forms.sql 을 실행한 뒤에 실행한다. 두 번 실행해도 같다.
--  · 비파괴: 칼럼 1개 추가(빈 값 허용) + 신청서 한 건의 그림·안내 채우기. 지우는 것 없음.
--
-- 되돌리기:
--   update public.app_forms set image_url = null where title = '삼일 만세길 걷기' and event_date = date '2026-10-18';
--   alter table public.app_forms rename column image_url to image_url_archived;   -- 칼럼은 지우지 않고 이름만 바꾼다

do $$ begin
  if to_regclass('public.app_forms') is null then
    raise exception '먼저 supabase/20261010_1140_app_forms.sql 을 실행해 주십시오.';
  end if;
end $$;

alter table public.app_forms add column if not exists image_url text;

update public.app_forms
   set image_url = 'https://k-logos.com/images/forms/samil-walk-course-20261018.png',
       body = case when coalesce(btrim(body), '') = '' then
'코스: 쌍봉산 근린공원에서 출발해 다시 돌아오는 순환 코스입니다.
총 거리 약 4.3km · 걸어서 약 70분(성인 기준)

진행 순서
① 쌍봉산 근린공원 (출발)
② 조원삼거리 (1,410m)
③ 조암삼거리 (200m)
④ 3·1만세로
⑤ 장안119안전센터 (1,260m)
⑥ 조암한라비발디 (550m)
⑦ 삼괴고등학교 옆길 (570m)
⑧ 쌍봉산 근린공원 (도착, 280m)'
         else body end
 where title = '삼일 만세길 걷기' and event_date = date '2026-10-18';

-- PostgREST 스키마 캐시 갱신
notify pgrst, 'reload schema';
