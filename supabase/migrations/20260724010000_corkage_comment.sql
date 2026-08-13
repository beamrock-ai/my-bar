-- 콜키지 장소별 댓글(누구나 작성/수정/삭제)
create table if not exists hobby.corkage_comment (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references hobby.corkage_place(id) on delete cascade,
  author text,
  body text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_corkage_comment_place on hobby.corkage_comment(place_id);
create or replace function hobby.touch_corkage_comment() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;
drop trigger if exists trg_corkage_comment_updated on hobby.corkage_comment;
create trigger trg_corkage_comment_updated before update on hobby.corkage_comment for each row execute function hobby.touch_corkage_comment();
grant select, insert, update, delete on hobby.corkage_comment to anon, authenticated, service_role;
