-- 노트↔시세 수동 매칭 키. 자동 매칭은 이름(공백제거) 일치로만 되므로,
-- 이름이 다른 경우 이 값(시세[liquor_price]의 한글명)으로 명시적으로 연결한다. null=자동(name_ko 사용).
alter table hobby.whisky add column if not exists price_name text;
comment on column hobby.whisky.price_name is '수동 시세 매칭: 연결할 liquor_price.name(한글명). null이면 name_ko로 자동 매칭';
