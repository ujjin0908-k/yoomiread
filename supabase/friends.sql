-- YoomiRead friends: a name card each reader designs, friends added by code, and a small feed of what friends did.
-- Run once in the Supabase SQL editor, after sync.sql (and buddy.sql). Safe to run again.
--
-- What is shared is only what the reader switched on for their card: the app sends the switched-off items as empty,
-- so the server never holds them. Book text is never sent. Who may read a card is decided here, by the database
-- (row level security), not by the app:
--   public  : anyone signed in who has the card's code (looked up one at a time, never listed);
--   friends : only friends;
--   private : nobody but its owner. A private reader's feed items are hidden from friends too.

create table if not exists public.reader_cards (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- The friend code: 8 letters and digits, no look-alikes (no 0/O, 1/I/L), as for buddy reads.
  code text not null unique,
  -- The name friends see. Chosen by the reader; never the email address.
  name text not null check (char_length(btrim(name)) between 1 and 40),
  visibility text not null default 'friends' check (visibility in ('public', 'friends', 'private')),
  style text not null default 'zine' check (style in ('zine')),
  -- The items on the card. Empty when switched off.
  badge text check (char_length(badge) <= 30),
  now_title text check (char_length(now_title) <= 200),
  now_chapter integer check (now_chapter between 0 and 100000),
  now_total integer check (now_total between 0 and 100000),
  genres text check (char_length(genres) <= 120),
  line text check (char_length(line) <= 300),
  line_book text check (char_length(line_book) <= 200),
  line_chapter integer check (line_chapter between 0 and 100000),
  hours integer check (hours between 0 and 1000000),
  streak integer check (streak between 0 and 100000),
  theories text check (char_length(theories) <= 60),
  wrapped text check (char_length(wrapped) <= 120),
  updated_at timestamptz not null default now()
);

-- A friendship is two rows, one each way, made and ended together by the functions below.
create table if not exists public.reader_friends (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

-- The feed: things a reader did, shown to their friends. A recommendation can go to one friend only.
create table if not exists public.feed_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('started', 'finished', 'recommend', 'wrapped')),
  book_title text check (char_length(book_title) <= 200),
  rating integer check (rating between 1 and 5),
  note text check (char_length(note) <= 280),
  to_user uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists feed_items_user_time on public.feed_items (user_id, created_at desc);

-- Helpers for the rules below. Each only ever answers about the signed-in reader.
create or replace function public.reader_is_friend(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reader_friends f where f.user_id = auth.uid() and f.friend_id = other);
$$;

create or replace function public.reader_visibility(who uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select c.visibility from public.reader_cards c where c.user_id = who), 'friends');
$$;

alter table public.reader_cards enable row level security;
alter table public.reader_friends enable row level security;
alter table public.feed_items enable row level security;

-- My own card always; a friend's card unless it is private. Public cards of non-friends: only by code (card_by_code).
drop policy if exists "own or friends" on public.reader_cards;
create policy "own or friends" on public.reader_cards for select
  using (user_id = auth.uid() or (public.reader_is_friend(user_id) and visibility <> 'private'));
drop policy if exists "own update" on public.reader_cards;
create policy "own update" on public.reader_cards for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own delete" on public.reader_cards;
create policy "own delete" on public.reader_cards for delete using (user_id = auth.uid());

drop policy if exists "my friends" on public.reader_friends;
create policy "my friends" on public.reader_friends for select using (user_id = auth.uid());

-- My own items; a friend's items for everyone or for me, unless that friend's card is private.
drop policy if exists "friends see" on public.feed_items;
create policy "friends see" on public.feed_items for select using (
  user_id = auth.uid()
  or (public.reader_is_friend(user_id) and (to_user is null or to_user = auth.uid()) and public.reader_visibility(user_id) <> 'private')
);
-- I post as myself; a recommendation for one person must be for a friend.
drop policy if exists "post" on public.feed_items;
create policy "post" on public.feed_items for insert
  with check (user_id = auth.uid() and (to_user is null or public.reader_is_friend(to_user)));
drop policy if exists "delete own" on public.feed_items;
create policy "delete own" on public.feed_items for delete using (user_id = auth.uid());

-- No more than 30 feed items an hour from one reader.
create or replace function public.feed_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feed_items f where f.user_id = new.user_id and f.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many posts in an hour. Try again later.';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists feed_limit on public.feed_items;
create trigger feed_limit before insert on public.feed_items for each row execute function public.feed_limit();

create or replace function public.reader_cards_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists reader_cards_touch on public.reader_cards;
create trigger reader_cards_touch before update on public.reader_cards for each row execute function public.reader_cards_touch();

-- My card: made the first time with a fresh friend code; returns the code.
create or replace function public.card_ensure(p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  abc constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
  b bytea;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select r.code into c from public.reader_cards r where r.user_id = auth.uid();
  if c is not null then return c; end if;
  loop
    b := uuid_send(gen_random_uuid());
    c := '';
    for i in 0..7 loop
      c := c || substr(abc, 1 + get_byte(b, i) % length(abc), 1);
    end loop;
    exit when not exists (select 1 from public.reader_cards r where r.code = c);
  end loop;
  insert into public.reader_cards (user_id, code, name) values (auth.uid(), c, btrim(p_name));
  return c;
end $$;

-- A card by its code, before adding a friend: shown if it is public, mine or a friend's (not private). One at a time.
create or replace function public.card_by_code(p_code text) returns setof public.reader_cards
language sql stable security definer set search_path = public as $$
  select * from public.reader_cards r
  where r.code = upper(replace(btrim(p_code), ' ', '')) and auth.uid() is not null
    and (r.user_id = auth.uid() or r.visibility = 'public' or (r.visibility = 'friends' and public.reader_is_friend(r.user_id)));
$$;

-- Add a friend with their code. Both become friends (a code is shared on purpose). At most 200 friends.
create or replace function public.friend_add(p_code text) returns table (friend uuid, name text)
language plpgsql security definer set search_path = public as $$
declare
  r public.reader_cards;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into r from public.reader_cards c where c.code = upper(replace(btrim(p_code), ' ', ''));
  if r.user_id is null then raise exception 'No reader has that code.'; end if;
  if r.user_id = auth.uid() then raise exception 'That is your own code.'; end if;
  if not exists (select 1 from public.reader_friends f where f.user_id = auth.uid() and f.friend_id = r.user_id) then
    if (select count(*) from public.reader_friends f where f.user_id = auth.uid()) >= 200 then
      raise exception 'You have 200 friends. Remove one to add another.';
    end if;
    insert into public.reader_friends (user_id, friend_id) values (auth.uid(), r.user_id), (r.user_id, auth.uid()) on conflict do nothing;
  end if;
  return query select r.user_id, r.name;
end $$;

-- Stop being friends: both rows go.
create or replace function public.friend_remove(p_friend uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.reader_friends f
  where auth.uid() is not null and ((f.user_id = auth.uid() and f.friend_id = p_friend) or (f.user_id = p_friend and f.friend_id = auth.uid()));
$$;

-- Who may do what. Signed-out visitors get nothing.
revoke all on public.reader_cards, public.reader_friends, public.feed_items from anon, authenticated;
grant select, delete on public.reader_cards to authenticated;
grant update (name, visibility, style, badge, now_title, now_chapter, now_total, genres, line, line_book, line_chapter, hours, streak, theories, wrapped)
  on public.reader_cards to authenticated;
grant select on public.reader_friends to authenticated;
grant select, insert (kind, book_title, rating, note, to_user), delete on public.feed_items to authenticated;
revoke all on function public.reader_is_friend(uuid), public.reader_visibility(uuid), public.card_ensure(text), public.card_by_code(text),
  public.friend_add(text), public.friend_remove(uuid) from public, anon;
grant execute on function public.reader_is_friend(uuid), public.reader_visibility(uuid), public.card_ensure(text), public.card_by_code(text),
  public.friend_add(text), public.friend_remove(uuid) to authenticated;
