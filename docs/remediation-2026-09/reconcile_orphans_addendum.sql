--
-- OPS-03 addendum -- the one file part 1 wrongly excluded.
--
-- supabase/migrations/20260824_admin_platform_metrics_daily.sql carries an
-- 8-digit stamp instead of 14. supabase/migrations/README.md states that the CLI
-- "recognises a migration by a 14-digit version, so this file is not part of the
-- sequence at all -- it is skipped rather than applied or tracked", and on that
-- basis reconcile_schema_migrations.sql deliberately left it out.
--
-- THAT IS WRONG, and `db push` proved it:
--
--     Found local migration files to be inserted before the last migration on
--     remote database. Rerun the command with --include-all flag to apply these
--     migrations: supabase/migrations/20260824_admin_platform_metrics_daily.sql
--
-- The CLI reads `20260824` as a version perfectly well. It only became visible
-- now because the row that used to cover this migration (20260824233745, the
-- apply-time stamp) was removed with the other 90 orphans, leaving the file with
-- nothing at all.
--
-- The migration is applied: public.admin_platform_metrics_daily(integer) exists
-- in production, verified before writing this. So this is the same bookkeeping
-- the other 66 files got, at the version the file actually carries.
--
-- Renaming the file to 20260824233745 would be tidier and is NOT done here: a
-- rename reads as a new file to Perch, which applies the migration files a PR
-- introduces (see supabase/migrations/README.md). Adding the row touches no
-- file. If the rename is wanted later it is a separate, deliberate decision.
--
-- Rollback: DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260824';
--

BEGIN;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements, created_by)
VALUES ('20260824', 'admin_platform_metrics_daily', NULL, 'reconcile-ops-03')
ON CONFLICT (version) DO NOTHING;

-- Expect 72: 71 after the orphan removal, plus this one.
SELECT count(*) AS history_rows FROM supabase_migrations.schema_migrations;

COMMIT;
