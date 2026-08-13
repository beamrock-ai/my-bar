-- 구매형태별 통계: buy_count(bottle=구매) / tasting_count(그 외=시음).
-- 가격 min/avg/max는 bottle·price>0 구매 + 관측만 반영(시음·free 제외 → 시세 왜곡 방지)
drop view if exists hobby.whisky_stats;
create view hobby.whisky_stats as
select w.id as whisky_id, w.name,
  (select count(*) from hobby.purchase p where p.whisky_id = w.id) as purchase_count,
  (select count(*) from hobby.purchase p where p.whisky_id = w.id and coalesce(p.form,'bottle')='bottle') as buy_count,
  (select count(*) from hobby.purchase p where p.whisky_id = w.id and coalesce(p.form,'bottle')<>'bottle') as tasting_count,
  st.price_min, st.price_avg, st.price_max, st.price_count
from hobby.whisky w
left join lateral (
  select min(allp.price) as price_min, max(allp.price) as price_max,
         round(avg(allp.price))::integer as price_avg, count(*)::integer as price_count
  from (
    select o.price from hobby.price_observation o where o.whisky_id = w.id and o.price is not null
    union all
    select p.price from hobby.purchase p where p.whisky_id = w.id and p.price is not null and p.price > 0 and coalesce(p.form,'bottle')='bottle'
  ) allp
) st on true;
grant select on hobby.whisky_stats to anon, authenticated, service_role;
