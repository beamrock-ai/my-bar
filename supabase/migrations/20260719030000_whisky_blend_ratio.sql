-- 블렌디드 위스키의 몰트/그레인 배합비율(추정치, 공식 비공개가 대부분이라 텍스트로 자유 기재)
ALTER TABLE hobby.whisky ADD COLUMN IF NOT EXISTS blend_ratio TEXT;
