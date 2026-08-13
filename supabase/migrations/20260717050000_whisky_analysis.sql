-- 사진 분석 설명문 저장: whisky.analysis (키워드는 기존 keywords text[])
alter table hobby.whisky add column if not exists analysis text;
comment on column hobby.whisky.analysis is '사진 분석 기반 위스키 설명문(키워드 기반, 라벨 근거)';
