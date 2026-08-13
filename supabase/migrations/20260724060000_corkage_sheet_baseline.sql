-- 콜키지 시트 양방향 머지용: 마지막 동기화 기준 스냅샷(3-way merge 비교용)
alter table hobby.corkage_place add column if not exists sheet_baseline jsonb;
