-- Roles and schemas that Supabase Cloud provides and the migrations rely on.
-- Runs once, before the migrations, when the database volume is first created.

create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;
create role authenticator login   noinherit;          -- the password is set in generado/01-authenticator.sql
grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
grant usage on schema public, extensions to anon, authenticated, service_role;
grant all on schema public to service_role;

-- Tables, sequences and functions the migrations create are usable by the backend's key (service_role).
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
