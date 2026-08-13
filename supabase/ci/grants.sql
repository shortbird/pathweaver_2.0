-- Data API grants for the LOCAL integration stack.
--
-- The prod-schema baseline (20260812000000_baseline_prod_schema.sql) is schema
-- objects only -- "no grants, no cron jobs, no storage buckets", by design,
-- because preview branches never exercised them. A local stack running the real
-- integration suite does: every request goes through PostgREST as `anon` or
-- `authenticated`, and without grants every one of them returns 42501
-- permission denied before a single assertion runs.
--
-- In production these grants come from
-- supabase/migrations-archive/20260527_restore_default_data_api_grants.sql
-- (ALTER DEFAULT PRIVILEGES), which predates the baseline squash. This file is
-- the local equivalent, applied by tests-integration.yml after `supabase start`.
--
-- RLS is unchanged and remains the access-control mechanism -- the baseline
-- carries the policies. This grants table access; the policies decide rows.

-- Future tables inherit these, matching the prod ALTER DEFAULT PRIVILEGES.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- Existing tables created by the baseline.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;
