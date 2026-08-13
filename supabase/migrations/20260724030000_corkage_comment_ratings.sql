-- 콜키지 댓글에도 부문 평점(맛/분위기/응대/쉐어링/가성비)
alter table hobby.corkage_comment add column if not exists service_ratings jsonb;
