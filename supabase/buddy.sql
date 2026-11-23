-- YoomiRead buddy reads: friends read the same book, each in their own copy, and leave comments on chapters.
-- A comment on chapter N reaches a friend's phone only once that friend has finished chapter N: the database itself
-- holds it back (row level security), so no app, old or changed, can show it early.
-- Run once in the Supabase SQL editor, after sync.sql. Safe to run again.

create table if not exists public.buddy_reads (
  id uuid primary key default gen_random_uuid(),
  -- The invite code: 8 letters and digits, no look-alikes (no 0/O, 1/I/L).
  code text not null unique,
  title text not null check (char_length(title) between 1 and 200),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.buddy_members (
  read_id uuid not null references public.buddy_reads (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The name friends see. Chosen by the reader; never the email address.
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- The last chapter this reader has finished. Comments up to here are shown to them.
  line integer not null default 0 check (line between 0 and 100000),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (read_id, user_id)
);

create table if not exists public.buddy_comments (
  id uuid primary key default gen_random_uuid(),
  read_id uuid not null references public.buddy_reads (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chapter integer not null check (chapter between 1 and 100000),
  -- An optional line from the chapter the comment is about.
  quote text check (char_length(quote) <= 300),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists buddy_comments_read_chapter on public.buddy_comments (read_id, chapter);
create index if not exists buddy_members_user on public.buddy_members (user_id);

-- Helpers for the rules below. They run as the table owner so a rule can look at the members table without
-- calling itself; each only ever answers about the signed-in reader.
create or replace function public.buddy_is_member(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.buddy_members m where m.read_id = r and m.user_id = auth.uid());
$$;

create or replace function public.buddy_my_line(r uuid) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce((select m.line from public.buddy_members m where m.read_id = r and m.user_id = auth.uid()), -1);
$$;

create or replace function public.buddy_is_owner(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.buddy_reads b where b.id = r and b.owner = auth.uid());
$$;

alter table public.buddy_reads enable row level security;
alter table public.buddy_members enable row level security;
alter table public.buddy_comments enable row level security;

-- A buddy read and its members are seen only by its members. The owner can end it.
drop policy if exists "members see" on public.buddy_reads;
create policy "members see" on public.buddy_reads for select using (public.buddy_is_member(id));
drop policy if exists "owner ends" on public.buddy_reads;
create policy "owner ends" on public.buddy_reads for delete using (owner = auth.uid());

drop policy if exists "members see" on public.buddy_members;
create policy "members see" on public.buddy_members for select using (public.buddy_is_member(read_id));
-- Each reader changes only their own name and line (see the column grants below).
drop policy if exists "own row" on public.buddy_members;
create policy "own row" on public.buddy_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Leave, or (the owner) remove someone.
drop policy if exists "leave or remove" on public.buddy_members;
create policy "leave or remove" on public.buddy_members for delete using (user_id = auth.uid() or public.buddy_is_owner(read_id));

-- The chapter lock: my own comments always, and others' only up to the last chapter I have finished.
drop policy if exists "chapter lock" on public.buddy_comments;
create policy "chapter lock" on public.buddy_comments for select
  using (public.buddy_is_member(read_id) and (user_id = auth.uid() or chapter <= public.buddy_my_line(read_id)));
-- I comment as myself, in a buddy read I am in, on a chapter I have finished or am reading now.
drop policy if exists "comment" on public.buddy_comments;
create policy "comment" on public.buddy_comments for insert
  with check (user_id = auth.uid() and public.buddy_is_member(read_id) and chapter <= public.buddy_my_line(read_id) + 1);
-- Delete my own, or (the owner) any in the buddy read.
drop policy if exists "delete" on public.buddy_comments;
create policy "delete" on public.buddy_comments for delete using (user_id = auth.uid() or public.buddy_is_owner(read_id));

-- No more than 60 comments an hour from one reader, so a mistake or a script cannot flood a group.
create or replace function public.buddy_comment_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.buddy_comments c where c.user_id = new.user_id and c.created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Too many comments in an hour. Try again later.';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists buddy_comment_limit on public.buddy_comments;
create trigger buddy_comment_limit before insert on public.buddy_comments for each row execute function public.buddy_comment_limit();

create or replace function public.buddy_members_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists buddy_members_touch on public.buddy_members;
create trigger buddy_members_touch before update on public.buddy_members for each row execute function public.buddy_members_touch();

-- Start a buddy read: makes the invite code and adds me as its first member.
create or replace function public.buddy_create(p_title text, p_name text) returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare
  abc constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
  b bytea;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if (select count(*) from public.buddy_reads r where r.owner = auth.uid()) >= 20 then
    raise exception 'You have started 20 buddy reads. End one to start another.';
  end if;
  loop
    b := uuid_send(gen_random_uuid());
    c := '';
    for i in 0..7 loop
      c := c || substr(abc, 1 + get_byte(b, i) % length(abc), 1);
    end loop;
    exit when not exists (select 1 from public.buddy_reads r where r.code = c);
  end loop;
  insert into public.buddy_reads (code, title, owner) values (c, btrim(p_title), auth.uid()) returning buddy_reads.id into new_id;
  insert into public.buddy_members (read_id, user_id, name) values (new_id, auth.uid(), btrim(p_name));
  return query select new_id, c;
end $$;

-- What a code is for, before joining: the book's title and how many are reading. Nothing else.
create or replace function public.buddy_peek(p_code text) returns table (title text, members integer)
language sql stable security definer set search_path = public as $$
  select r.title, (select count(*)::integer from public.buddy_members m where m.read_id = r.id)
  from public.buddy_reads r where r.code = upper(btrim(p_code)) and auth.uid() is not null;
$$;

-- Join with a code. At most 12 readers in one buddy read. Joining again only changes nothing.
create or replace function public.buddy_join(p_code text, p_name text) returns table (id uuid, title text)
language plpgsql security definer set search_path = public as $$
declare
  r public.buddy_reads;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into r from public.buddy_reads b where b.code = upper(btrim(p_code));
  if r.id is null then raise exception 'No buddy read has that code.'; end if;
  if not exists (select 1 from public.buddy_members m where m.read_id = r.id and m.user_id = auth.uid()) then
    if (select count(*) from public.buddy_members m where m.read_id = r.id) >= 12 then
      raise exception 'This buddy read is full (12 readers).';
    end if;
    insert into public.buddy_members (read_id, user_id, name) values (r.id, auth.uid(), btrim(p_name));
  end if;
  return query select r.id, r.title;
end $$;

-- What is waiting for me: how many comments from others are on chapters I have not finished yet. Counts only.
create or replace function public.buddy_waiting(r uuid) returns table (chapter integer, comments integer)
language sql stable security definer set search_path = public as $$
  select c.chapter, count(*)::integer from public.buddy_comments c
  where c.read_id = r and public.buddy_is_member(r) and c.user_id <> auth.uid() and c.chapter > public.buddy_my_line(r)
  group by c.chapter order by c.chapter;
$$;

-- Who may do what. Signed-out visitors get nothing.
revoke all on public.buddy_reads, public.buddy_members, public.buddy_comments from anon, authenticated;
grant select, delete on public.buddy_reads to authenticated;
grant select, delete on public.buddy_members to authenticated;
grant update (name, line) on public.buddy_members to authenticated;
grant select, insert (read_id, chapter, quote, body), delete on public.buddy_comments to authenticated;
revoke all on function public.buddy_is_member(uuid), public.buddy_my_line(uuid), public.buddy_is_owner(uuid),
  public.buddy_create(text, text), public.buddy_peek(text), public.buddy_join(text, text), public.buddy_waiting(uuid) from public, anon;
grant execute on function public.buddy_is_member(uuid), public.buddy_my_line(uuid), public.buddy_is_owner(uuid),
  public.buddy_create(text, text), public.buddy_peek(text), public.buddy_join(text, text), public.buddy_waiting(uuid) to authenticated;
