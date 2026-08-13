-- Restore implicit Data API grants on the `public` schema.
--
-- Background: Supabase is changing the default for new tables in `public`. After
-- 2026-10-30, tables created in `public` on this (existing) project will no longer
-- be exposed to PostgREST / supabase-js / GraphQL automatically -- each new table
-- would need an explicit GRANT or it would 404 from the Data API.
--
-- Optio's backend uses supabase-py (PostgREST under the hood) and would silently
-- break on any new table created after the cutoff. To avoid having to remember
-- per-table grants in every future migration, this sets ALTER DEFAULT PRIVILEGES
-- so any future CREATE TABLE in `public` (run by `postgres`, which is the role
-- the Supabase MCP, dashboard SQL editor, and `supabase db push` all use)
-- inherits the same grants Supabase previously applied implicitly.
--
-- Existing tables are unaffected -- they already have the implicit grants.
-- RLS remains the actual access control; these grants only make the table
-- visible to the Data API layer.
--
-- Safe to re-run.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
