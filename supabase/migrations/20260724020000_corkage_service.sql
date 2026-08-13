-- 콜키지 서비스 후기 구조화: 옵션 체크(options) + 부문별 평점(service_ratings)
-- 종합 rating = service_ratings 평균 자동산출
alter table hobby.corkage_place add column if not exists options text[];
alter table hobby.corkage_place add column if not exists service_ratings jsonb;
