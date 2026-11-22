-- YoomiRead sync: each reader's library rows (books, chapters and their text, notes, sessions, translations,
-- glossary, world links and events), one row per (table, id). Run once in the Supabase SQL editor.
-- Only the reader can read or write their own rows. Device settings (keys) are never sent.

create table if not exists public.sync_rows (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tbl text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  device text not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, tbl, id)
);

create index if not exists sync_rows_user_updated on public.sync_rows (user_id, updated_at);

-- The server sets the time of every change, so devices with wrong clocks still sync in the right order.
create or replace function public.sync_rows_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists sync_rows_touch on public.sync_rows;
create trigger sync_rows_touch before insert or update on public.sync_rows for each row execute function public.sync_rows_touch();

alter table public.sync_rows enable row level security;
drop policy if exists "own rows" on public.sync_rows;
create policy "own rows" on public.sync_rows for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- For the owner: how much each reader stores (Supabase's free plan has 500 MB in all).
create or replace view public.sync_size_by_reader with (security_invoker = true) as
select user_id, count(*) as rows, pg_size_pretty(sum(pg_column_size(data))) as size
from public.sync_rows group by user_id order by sum(pg_column_size(data)) desc;
revoke all on public.sync_size_by_reader from anon, authenticated;
