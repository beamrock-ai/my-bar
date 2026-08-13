-- 오크 품종(아메리칸/유러피안): 캐스크 이력보다 풍미에 더 결정적 → 별도 필드 분리
ALTER TABLE hobby.whisky ADD COLUMN IF NOT EXISTS oak_species text;
