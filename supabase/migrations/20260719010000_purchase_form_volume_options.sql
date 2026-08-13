-- 구매 기록: 구매형태(form)·건별 용량(volume_ml) + 사용자 관리 드롭다운 프리셋(field_option)
alter table hobby.purchase add column if not exists form text not null default 'bottle';
alter table hobby.purchase add column if not exists volume_ml integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='purchase_form_check') then
    alter table hobby.purchase add constraint purchase_form_check check (form in ('bottle','glass','vial','miniature'));
  end if;
end $$;
comment on column hobby.purchase.form is '구매형태: bottle|glass|vial|miniature';
comment on column hobby.purchase.volume_ml is '구매 건별 용량(ml)';

-- 가격·용량 드롭다운 프리셋(사용자 추가/삭제)
create table if not exists hobby.field_option (
  id uuid primary key default gen_random_uuid(),
  field text not null check (field in ('price','volume')),
  value text not null,
  created_at timestamptz default now(),
  unique(field, value)
);
grant select, insert, update, delete on hobby.field_option to anon, authenticated, service_role;

insert into hobby.field_option(field, value) values
 ('volume','700'),('volume','750'),('volume','1000'),('volume','500'),
 ('volume','375'),('volume','200'),('volume','100'),('volume','50'),('volume','30')
on conflict (field, value) do nothing;
