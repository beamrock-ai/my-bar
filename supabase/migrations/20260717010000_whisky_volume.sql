-- 노트(위스키 마스터)에 용량(ml) — 편집 가능 필드
ALTER TABLE hobby.whisky ADD COLUMN IF NOT EXISTS volume_ml integer;
