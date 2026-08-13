-- 구매완료 입력 정가/실구매가 분리: purchase.list_price(정가), 기존 price=실구매가
alter table hobby.purchase add column if not exists list_price integer;
comment on column hobby.purchase.list_price is '정가(권장소비자가). price=실구매가';
