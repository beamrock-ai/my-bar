-- 데일리샷 시세 키를 품목ID(app_id)로 전환 + 시세 항목 숨김(삭제) 레이어. 별칭(병합/개명) 레이어 제거.

-- 1) 별칭 레이어 제거(병합·이름편집 폐기 → 삭제로 대체)
drop table if exists hobby.price_alias;

-- 2) liquor_price에 품목ID(app_id). 데일리샷 동기화의 시계열 키.
alter table hobby.liquor_price add column if not exists app_id integer;
create index if not exists idx_liquor_price_app on hobby.liquor_price(app_id);
-- 기존 데일리샷 행 app_id 백필(url의 .../item/{id})
update hobby.liquor_price
set app_id = (regexp_match(url, 'item/(\d+)'))[1]::int
where shop = '데일리샷' and app_id is null and url ~ 'item/[0-9]+';

-- 3) 숨김(삭제) 목록: 이름 기준. 동기화 재적재 방지 + 조회 제외.
create table if not exists hobby.price_hidden (
  name text primary key,
  created_at timestamptz default now()
);
grant select, insert, update, delete on hobby.price_hidden to anon, authenticated, service_role;
