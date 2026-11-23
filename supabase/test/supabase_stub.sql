-- A stand-in for the parts of Supabase the YoomiRead SQL uses, so it can be tested on a plain local Postgres.
-- Not for Supabase itself (it already has these).
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
-- Supabase reads the signed-in user from the request; here a test sets it with set_config.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
