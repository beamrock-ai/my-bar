-- 위스키 노트 → 일자별 히스토리(일기). 위스키별 여러 일자 항목.
create table if not exists hobby.whisky_history (
  id uuid primary key default gen_random_uuid(),
  whisky_id uuid not null references hobby.whisky(id) on delete cascade,
  entry_date date not null default current_date,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_whisky_history_whisky on hobby.whisky_history(whisky_id);
create index if not exists idx_whisky_history_date on hobby.whisky_history(whisky_id, entry_date desc);
create or replace function hobby.touch_whisky_history() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;
drop trigger if exists trg_whisky_history_updated on hobby.whisky_history;
create trigger trg_whisky_history_updated before update on hobby.whisky_history for each row execute function hobby.touch_whisky_history();
grant select, insert, update, delete on hobby.whisky_history to anon, authenticated, service_role;

-- 기존 personal_note(작성자별 자유메모) → 히스토리 항목으로 이관(보존). tasted_on 없으면 프로필 생성일.
insert into hobby.whisky_history (whisky_id, entry_date, body, created_at)
select p.whisky_id, coalesce(p.tasted_on, p.created_at::date), btrim(p.personal_note), p.created_at
from hobby.whisky_profile p
where p.personal_note is not null and btrim(p.personal_note) <> ''
  and not exists (
    select 1 from hobby.whisky_history h
    where h.whisky_id = p.whisky_id and h.body = btrim(p.personal_note)
  );
