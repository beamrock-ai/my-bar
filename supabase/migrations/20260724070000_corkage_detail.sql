-- 콜키지비용(정수) → 콜키지내역(텍스트: 무제한/1병/인당 1만원 등) + 무료/유료별 프리셋
alter table hobby.corkage_place add column if not exists corkage_detail text;
update hobby.corkage_place set corkage_detail = corkage_fee::text || '원' where corkage_fee is not null;
alter table hobby.corkage_place drop column if exists corkage_fee;

create table if not exists hobby.corkage_option (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('무료','유료')),
  value text not null,
  created_at timestamptz default now(),
  unique(kind, value)
);
grant select, insert, update, delete on hobby.corkage_option to anon, authenticated, service_role;
insert into hobby.corkage_option(kind, value) values
 ('무료','무제한'),('무료','1병'),('무료','2병'),('무료','예약시'),
 ('유료','인당 10,000원'),('유료','인당 5,000원'),('유료','10,000원'),('유료','20,000원')
on conflict (kind, value) do nothing;
