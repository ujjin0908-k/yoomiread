-- Checks the friends rules as three readers: Eve, Fin and Gus. Stops at the first failure.
-- Run with supabase/test/run.sh (a throwaway local Postgres), after buddy_check.sql.
\set ON_ERROR_STOP on
insert into auth.users values ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000a1');

create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
grant execute on function pg_temp.as_user(text), pg_temp.expect(boolean, text) to authenticated;
create table pg_temp.vars (k text primary key, v text);
grant all on pg_temp.vars to authenticated;

set role authenticated;

-- Each makes a card. Making it again keeps the same code.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into pg_temp.vars select 'eve', public.card_ensure('Eve');
select pg_temp.expect(public.card_ensure('Eve again') = (select v from pg_temp.vars where k = 'eve'), 'making a card twice keeps one code');
select pg_temp.expect((select v from pg_temp.vars where k = 'eve') ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$', 'the code is 8 clear letters and digits');
update public.reader_cards set now_title = 'The Harbor Book', now_chapter = 12, line = 'The ship was gone.', line_chapter = 9 where user_id = auth.uid();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into pg_temp.vars select 'fin', public.card_ensure('Fin');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into pg_temp.vars select 'gus', public.card_ensure('Gus');

-- Before being friends, Fin sees only his own card, and Eve's friends-only card is not found by its code.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((select count(*) from public.reader_cards) = 1, 'a stranger''s card is not listed');
select pg_temp.expect((select count(*) from public.card_by_code((select v from pg_temp.vars where k = 'eve'))) = 0, 'a friends-only card is not found by code');

-- Eve makes her card public: now its code finds it, but it is still not listed.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
update public.reader_cards set visibility = 'public' where user_id = auth.uid();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((select name from public.card_by_code(lower((select v from pg_temp.vars where k = 'eve')))) = 'Eve', 'a public card is found by its code');
select pg_temp.expect((select count(*) from public.reader_cards) = 1, 'a public card is still not listed for strangers');

-- Fin adds Eve (lower case and a space in the code are fine). Both are friends now.
select public.friend_add(lower(substr((select v from pg_temp.vars where k = 'eve'), 1, 4)) || ' ' || substr((select v from pg_temp.vars where k = 'eve'), 5));
select public.friend_add((select v from pg_temp.vars where k = 'eve'));
select pg_temp.expect((select count(*) from public.reader_friends) = 1, 'adding twice makes one friendship');
select pg_temp.expect((select now_title from public.reader_cards where name = 'Eve') = 'The Harbor Book', 'Fin sees Eve''s card');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect((select count(*) from public.reader_cards where name = 'Fin') = 1, 'and Eve sees Fin''s');
do $$ begin
  perform public.friend_add((select v from pg_temp.vars where k = 'eve'));
  raise exception 'FAILED: Eve added herself';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: nobody can add their own code';
end $$;

-- Gus is no one's friend: he sees neither card.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect((select count(*) from public.reader_cards) = 1, 'Gus sees only his own card');

-- Fin cannot change Eve's card, nor his own code.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
update public.reader_cards set name = 'Hacked' where name = 'Eve';
select pg_temp.expect((select name from public.reader_cards where user_id = '00000000-0000-0000-0000-0000000000e1') = 'Eve', 'Fin cannot change Eve''s card');
do $$ begin
  update public.reader_cards set code = 'AAAAAAAA' where user_id = auth.uid();
  raise exception 'FAILED: Fin changed his code';
exception when insufficient_privilege then raise notice 'ok: a code cannot be changed by hand';
end $$;

-- The feed: Eve finishes a book and recommends one to Fin.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into public.feed_items (kind, book_title, rating) values ('finished', 'The Harbor Book', 4.5);
select pg_temp.expect((select rating from public.feed_items where kind = 'finished') = 4.5, 'a half-star rating is kept');
insert into public.feed_items (kind, book_title, note, to_user) values ('recommend', 'Oz', 'Cosy and odd', '00000000-0000-0000-0000-0000000000f1');
do $$ begin
  insert into public.feed_items (kind, book_title, to_user) values ('recommend', 'Oz', '00000000-0000-0000-0000-0000000000a1');
  raise exception 'FAILED: Eve recommended to a stranger';
exception when insufficient_privilege then raise notice 'ok: a recommendation goes only to a friend';
end $$;
do $$ begin
  insert into public.feed_items (user_id, kind, book_title) values ('00000000-0000-0000-0000-0000000000f1', 'finished', 'Fake');
  raise exception 'FAILED: Eve posted as Fin';
exception when insufficient_privilege then raise notice 'ok: Eve cannot post as Fin';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((select count(*) from public.feed_items) = 2, 'Fin sees Eve''s post and her recommendation to him');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect((select count(*) from public.feed_items) = 0, 'Gus sees none of it');

-- Eve goes private: her card and her posts disappear for Fin.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
update public.reader_cards set visibility = 'private' where user_id = auth.uid();
select pg_temp.expect((select count(*) from public.reader_cards) = 2, 'Eve still sees her own card (and Fin''s)');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((select count(*) from public.reader_cards where name = 'Eve') = 0, 'a private card is hidden from friends');
select pg_temp.expect((select count(*) from public.card_by_code((select v from pg_temp.vars where k = 'eve'))) = 0, 'and from its code');
select pg_temp.expect((select count(*) from public.feed_items) = 0, 'and so are her posts');

-- Back to friends-only, then Fin removes Eve: both rows go, and he sees nothing of hers.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
update public.reader_cards set visibility = 'friends' where user_id = auth.uid();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect((select count(*) from public.feed_items) = 2, 'friends-only again: Fin sees her posts');
select public.friend_remove('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect((select count(*) from public.reader_cards where name = 'Eve') + (select count(*) from public.feed_items) = 0, 'after removing, Fin sees nothing of Eve''s');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect((select count(*) from public.reader_friends) = 0, 'and the friendship is gone both ways');

-- Too many posts in an hour are refused.
do $$ begin
  for i in 1..30 loop insert into public.feed_items (kind, book_title) values ('started', 'Book ' || i); end loop;
  raise exception 'FAILED: 32 posts in an hour';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: at most 30 posts an hour';
end $$;

-- Deleting an account removes that reader's card, friendships and posts.
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.expect((select count(*) from public.reader_cards where name = 'Eve') + (select count(*) from public.feed_items where book_title = 'Oz') = 0, 'a deleted account takes its card and posts with it');
\warn ALL FRIENDS CHECKS PASSED
