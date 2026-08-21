-- 시세 병합/이름편집(별칭) + 수동 판매점가격. 동기화(시트/데일리샷)에 덮어써지지 않는 별도 레이어.

-- 1) 이름 별칭: from_name 으로 표기된 시세를 to_name 으로 통합/개명(읽기 시점 적용, 전이 해석)
create table if not exists hobby.price_alias (
  from_name text primary key,
  to_name text not null,
  created_at timestamptz default now()
);
grant select, insert, update, delete on hobby.price_alias to anon, authenticated, service_role;

-- 2) 수동 판매점 시세: 사용자가 직접 입력(일자·판매점·가격). 동기화가 건드리지 않음.
create table if not exists hobby.liquor_price_manual (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shop text,
  price integer,
  observed_on date,
  volume_ml integer,
  url text,
  memo text,
  created_at timestamptz default now()
);
create index if not exists idx_liquor_price_manual_name on hobby.liquor_price_manual(name);
grant select, insert, update, delete on hobby.liquor_price_manual to anon, authenticated, service_role;
