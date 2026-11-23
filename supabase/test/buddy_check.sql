-- Checks the buddy-read rules as three readers: Ana starts a read, Ben and Cy join. Stops at the first failure.
-- Run with supabase/test/run.sh (a throwaway local Postgres).
\set ON_ERROR_STOP on
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');

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

-- Ana starts the read.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into pg_temp.vars select 'code', code from public.buddy_create('The Harbor Book', 'Ana');
insert into pg_temp.vars select 'id', id::text from public.buddy_reads;
select pg_temp.expect((select v from pg_temp.vars where k = 'code') ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$', 'the code is 8 clear letters and digits');

-- Ben peeks and joins (lower case and spaces in the code are fine).
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.buddy_reads) = 0, 'before joining, Ben sees no buddy read');
select pg_temp.expect((select title from public.buddy_peek(' ' || lower((select v from pg_temp.vars where k = 'code')))) = 'The Harbor Book', 'peek shows the title');
select public.buddy_join(lower((select v from pg_temp.vars where k = 'code')), 'Ben');
select public.buddy_join((select v from pg_temp.vars where k = 'code'), 'Ben again');
select pg_temp.expect((select count(*) from public.buddy_members) = 2, 'joining twice adds Ben once');
select pg_temp.expect((select name from public.buddy_members where user_id = auth.uid()) = 'Ben', 'and keeps his name');

-- Cy joins too.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.buddy_join((select v from pg_temp.vars where k = 'code'), 'Cy');

-- Progress: Ana has finished 10, Ben 3, Cy 0.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.buddy_members set line = 10 where user_id = auth.uid();
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.buddy_members set line = 3 where user_id = auth.uid();
-- Ben tries to move Ana's progress, and his own row to another read: neither works.
update public.buddy_members set line = 99 where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select line from public.buddy_members where user_id = '00000000-0000-0000-0000-00000000000a') = 10, 'Ben cannot change Ana''s progress');
do $$ begin
  update public.buddy_members set read_id = gen_random_uuid() where user_id = auth.uid();
  raise exception 'FAILED: Ben moved his row to another read';
exception when insufficient_privilege then raise notice 'ok: Ben cannot move his row to another read';
end $$;

-- Ana comments on chapters 2 and 9. She cannot comment as Ben.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.buddy_comments (read_id, chapter, body) values ((select v::uuid from pg_temp.vars where k = 'id'), 2, 'Old Fen is the best');
insert into public.buddy_comments (read_id, chapter, quote, body) values ((select v::uuid from pg_temp.vars where k = 'id'), 9, 'The ship was gone.', 'SPOILER I cried');
do $$ begin
  insert into public.buddy_comments (read_id, user_id, chapter, body) values ((select v::uuid from pg_temp.vars where k = 'id'), '00000000-0000-0000-0000-00000000000b', 2, 'fake');
  raise exception 'FAILED: Ana commented as Ben';
exception when insufficient_privilege then raise notice 'ok: Ana cannot comment as Ben';
end $$;
select pg_temp.expect((select count(*) from public.buddy_comments) = 2, 'Ana sees both her comments');

-- The lock: Ben (finished 3) sees chapter 2, not 9; for 9 he gets a count only.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.buddy_comments) = 1, 'Ben sees one comment');
select pg_temp.expect((select count(*) from public.buddy_comments where body like '%SPOILER%' or quote like '%ship%') = 0, 'Ben never gets the chapter 9 comment or its quote');
select pg_temp.expect((select count(*) from public.buddy_waiting((select v::uuid from pg_temp.vars where k = 'id')) where chapter = 9 and comments = 1) = 1, 'Ben is told one comment waits at chapter 9');
-- Ben can comment on the chapter he is reading (4) but not jump ahead to 9.
insert into public.buddy_comments (read_id, chapter, body) values ((select v::uuid from pg_temp.vars where k = 'id'), 4, 'Reading 4 now');
do $$ begin
  insert into public.buddy_comments (read_id, chapter, body) values ((select v::uuid from pg_temp.vars where k = 'id'), 9, 'jump');
  raise exception 'FAILED: Ben commented ahead of where he is';
exception when insufficient_privilege then raise notice 'ok: Ben cannot comment ahead of where he is';
end $$;

-- Cy (finished nothing) sees no one's comments. Ana (finished 10) sees Ben's chapter 4 comment too.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.buddy_comments) = 0, 'Cy, at chapter 0, sees no comments');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.buddy_comments) = 3, 'Ana, at chapter 10, sees all three');

-- Ben finishes chapter 9: the comment unlocks.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.buddy_members set line = 9 where user_id = auth.uid();
select pg_temp.expect((select count(*) from public.buddy_comments where body = 'SPOILER I cried') = 1, 'after finishing chapter 9, Ben sees it');
select pg_temp.expect((select count(*) from public.buddy_waiting((select v::uuid from pg_temp.vars where k = 'id'))) = 0, 'and nothing waits for him');
-- Ben cannot delete Ana's comment; Ana (owner) can delete Ben's.
delete from public.buddy_comments where user_id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from public.buddy_comments where user_id = '00000000-0000-0000-0000-00000000000a') = 2, 'Ben cannot delete Ana''s comments');

-- Dee is not in the read and sees nothing, and cannot comment.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect((select count(*) from public.buddy_reads) + (select count(*) from public.buddy_members) + (select count(*) from public.buddy_comments) = 0, 'an outsider sees nothing');
select pg_temp.expect((select count(*) from public.buddy_waiting((select v::uuid from pg_temp.vars where k = 'id'))) = 0, 'not even the waiting counts');
do $$ begin
  insert into public.buddy_comments (read_id, chapter, body) values ((select v::uuid from pg_temp.vars where k = 'id'), 1, 'hi');
  raise exception 'FAILED: an outsider commented';
exception when insufficient_privilege then raise notice 'ok: an outsider cannot comment';
end $$;
do $$ begin
  perform public.buddy_join('NOPE2345', 'Dee');
  raise exception 'FAILED: a wrong code worked';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: a wrong code says %', sqlerrm;
end $$;

-- Signed out: nothing at all.
select pg_temp.as_user('');
do $$ begin
  perform public.buddy_create('x', 'y');
  raise exception 'FAILED: signed out could start a read';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: signed out cannot start a read';
end $$;
reset role;
set role anon;
do $$ begin
  perform count(*) from public.buddy_comments;
  raise exception 'FAILED: anon read comments';
exception when insufficient_privilege then raise notice 'ok: signed-out visitors cannot read anything';
end $$;
reset role;

-- The owner removes Cy, then Ben leaves; Ana ends the read and everything goes.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.buddy_comments where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect((select count(*) from public.buddy_comments) = 2, 'the owner can remove a comment');
delete from public.buddy_members where user_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect((select count(*) from public.buddy_members) = 2, 'the owner can remove a reader');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
delete from public.buddy_reads;
reset role;
select pg_temp.expect((select count(*) from public.buddy_reads) = 1, 'Ben cannot end Ana''s read');
set role authenticated;
delete from public.buddy_members where user_id = auth.uid();
select pg_temp.expect((select count(*) from public.buddy_comments) = 0, 'after leaving, Ben sees nothing');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from public.buddy_reads;
reset role;
select pg_temp.expect((select count(*) from public.buddy_reads) + (select count(*) from public.buddy_members) + (select count(*) from public.buddy_comments) = 0, 'ending the read removes its members and comments');

-- Deleting an account removes that reader's buddy reads, membership and comments.
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.buddy_create('Second', 'Ana');
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect((select count(*) from public.buddy_reads) = 0, 'a deleted account takes its buddy reads with it');
\warn ALL BUDDY CHECKS PASSED
