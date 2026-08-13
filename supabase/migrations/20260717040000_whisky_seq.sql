-- 노트 등록순 고유번호(seq). 기존은 생성순 백필, 신규는 시퀀스 자동채번.
ALTER TABLE hobby.whisky ADD COLUMN IF NOT EXISTS seq integer;

-- 백필(생성순). updated_at 보존 위해 트리거 잠시 off
ALTER TABLE hobby.whisky DISABLE TRIGGER trg_whisky_updated_at;
WITH ordered AS (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM hobby.whisky)
UPDATE hobby.whisky w SET seq = o.rn FROM ordered o WHERE w.id = o.id AND w.seq IS NULL;
ALTER TABLE hobby.whisky ENABLE TRIGGER trg_whisky_updated_at;

-- 신규 등록 자동 채번
CREATE SEQUENCE IF NOT EXISTS hobby.whisky_seq;
SELECT setval('hobby.whisky_seq', (SELECT COALESCE(max(seq),0) FROM hobby.whisky));
ALTER TABLE hobby.whisky ALTER COLUMN seq SET DEFAULT nextval('hobby.whisky_seq');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whisky_seq_uniq') THEN
    ALTER TABLE hobby.whisky ADD CONSTRAINT whisky_seq_uniq UNIQUE (seq);
  END IF;
END $$;
