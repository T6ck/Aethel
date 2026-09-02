create schema if not exists auth;
create table if not exists auth.users(id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub','')::uuid $$;
create or replace function auth.jwt() returns json language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true),'{}')::json $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
-- real Supabase grants these; the stub must match or tests fail on
-- infrastructure rather than on the schema under test
grant usage on schema auth to authenticated;
grant select on auth.users to authenticated;
