-- 콜키지 구분에서 '가능' 제거 → 유료/무료(또는 미지정 null)만. 기존 '가능'은 미지정으로.
update hobby.corkage_place set corkage_type = null where corkage_type = '가능';
