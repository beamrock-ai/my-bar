-- 바이알시음 카테고리: 추천인(recommender) 모델 재사용, kind에 'vial' 허용
ALTER TABLE hobby.recommender DROP CONSTRAINT IF EXISTS recommender_kind_check;
ALTER TABLE hobby.recommender ADD CONSTRAINT recommender_kind_check
  CHECK (kind = ANY (ARRAY['friend'::text, 'expert'::text, 'gift'::text, 'photo'::text, 'vial'::text]));
