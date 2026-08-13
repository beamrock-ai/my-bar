-- 콜키지 메인 요리 전용 컬럼(시트 왕복용) + 기존 memo '메인: …' 이관
alter table hobby.corkage_place add column if not exists cuisine text;
update hobby.corkage_place set cuisine = replace(memo, '메인: ', ''), memo = null where memo like '메인: %';
