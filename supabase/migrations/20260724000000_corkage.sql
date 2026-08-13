-- 콜키지(corkage) 가능 장소 등록
create table if not exists hobby.corkage_place (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  address text,
  corkage_type text default '가능',      -- 가능 / 유료 / 무료
  corkage_fee integer,                  -- 유료 시 콜키지 비용
  visit_status text default '방문예정',   -- 방문예정 / 방문완료
  rating numeric,                       -- 평점(0~5, 0.5단위)
  service_note text,                    -- 서비스 후기
  memo text,
  phone text,
  url text,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists hobby.corkage_image (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hobby.corkage_place(id) on delete cascade,
  url text not null,
  is_primary boolean default false,
  created_at timestamptz default now()
);
create index if not exists idx_corkage_image_place on hobby.corkage_image(place_id);

create or replace function hobby.touch_corkage() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;
drop trigger if exists trg_corkage_updated on hobby.corkage_place;
create trigger trg_corkage_updated before update on hobby.corkage_place for each row execute function hobby.touch_corkage();

grant select, insert, update, delete on hobby.corkage_place, hobby.corkage_image to anon, authenticated, service_role;
