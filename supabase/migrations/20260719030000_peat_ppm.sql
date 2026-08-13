-- 피트 강도 PPM(몰트 페놀 ppm 참고치). 논피트=0, 미상=null
alter table hobby.whisky add column if not exists peat_ppm integer;
alter table hobby.liquor_price add column if not exists peat_ppm integer;
comment on column hobby.whisky.peat_ppm is '피트 강도(몰트 페놀 ppm, 참고치). 논피트=0, 미상=null';
comment on column hobby.liquor_price.peat_ppm is '피트 강도(몰트 페놀 ppm, 참고치)';
