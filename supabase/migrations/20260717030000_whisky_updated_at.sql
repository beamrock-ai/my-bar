-- 노트 변경시각(updated_at) + 최신순 정렬. 위스키 본체 + 연관 기록 변경 모두 갱신.
ALTER TABLE hobby.whisky ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
UPDATE hobby.whisky SET updated_at = COALESCE(updated_at, created_at, now());

-- 위스키 본체 UPDATE 시 자동 갱신
CREATE OR REPLACE FUNCTION hobby.set_whisky_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_whisky_updated_at ON hobby.whisky;
CREATE TRIGGER trg_whisky_updated_at BEFORE UPDATE ON hobby.whisky
  FOR EACH ROW EXECUTE FUNCTION hobby.set_whisky_updated_at();

-- 연관 레코드(구매/희망/추천/시세/이미지/프로필) 변경 시 부모 위스키 갱신
CREATE OR REPLACE FUNCTION hobby.touch_whisky() RETURNS trigger AS $$
BEGIN
  UPDATE hobby.whisky SET updated_at = now() WHERE id = COALESCE(NEW.whisky_id, OLD.whisky_id);
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase','wishlist','recommendation','price_observation','whisky_image','whisky_profile'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_whisky ON hobby.%I', t);
    EXECUTE format('CREATE TRIGGER trg_touch_whisky AFTER INSERT OR UPDATE OR DELETE ON hobby.%I FOR EACH ROW EXECUTE FUNCTION hobby.touch_whisky()', t);
  END LOOP;
END $$;
