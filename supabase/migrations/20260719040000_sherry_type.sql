-- 셰리 종류(단일 분류) — 캐스크(전체 이력)와 별개. 당도·향 참조는 앱 SHERRY_INFO에.
alter table hobby.whisky add column if not exists sherry_type text;
alter table hobby.liquor_price add column if not exists sherry_type text;
comment on column hobby.whisky.sherry_type is '셰리 종류(PX/올로로소/아몬티야도/피노/팔로코르타도/만자니아/복합/없음)';
comment on column hobby.liquor_price.sherry_type is '셰리 종류(PX/올로로소/아몬티야도/피노/팔로코르타도/만자니아/복합/없음)';
