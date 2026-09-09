-- Undo cleanup_skill_xp_legacy_pillars.sql.
--
-- Puts back the 2,850 mis-keyed user_skill_xp rows from the backup table that
-- script created. You would only want this if something turned out to read
-- those rows after all -- nothing in the codebase does, which is why they were
-- safe to delete.
--
-- The restore is deliberately conflict-tolerant. Between the delete and the
-- rollback, the fixed seeding may have created correctly-keyed rows for the
-- same students; those are the rows that matter and must not be touched. Since
-- the backup holds only legacy pillar names, they cannot collide on
-- UNIQUE (user_id, pillar) -- but ON CONFLICT DO NOTHING says so out loud
-- rather than relying on it.
--
-- Run against project vvfgxcykxjybtvpfzwyx (Optio, production).
--
-- VERIFIED BY EXECUTION, not by review. Run end to end against the staging
-- project (kltoyqefmcgolbplplsa, synthetic data only) on 2026-09-09, after
-- reproducing the production shape there:
--
--   * deleted exactly the 15 seeded legacy rows, left all 3,905 real rows
--     untouched with their balances intact, and backed up 15;
--   * the rollback restored all 15;
--   * tripwire 1 was armed deliberately (one legacy row given 4,200 XP) and
--     ABORTED the run, as intended;
--   * staging was then returned to exactly the state it was found in.
--
-- This matters because the repo has been here before: docs/remediation-2026-09
-- records four defects that shipped in reviewed-but-unexecuted SQL.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.user_skill_xp_legacy_backup_20260909') IS NULL THEN
    RAISE EXCEPTION
      'ABORTED: public.user_skill_xp_legacy_backup_20260909 does not exist. '
      'Either the cleanup was never run, or the backup has already been dropped.';
  END IF;
END $$;

INSERT INTO public.user_skill_xp
SELECT * FROM public.user_skill_xp_legacy_backup_20260909
ON CONFLICT (user_id, pillar) DO NOTHING;

DO $$
DECLARE
  restored integer;
  expected integer;
BEGIN
  SELECT count(*) INTO expected FROM public.user_skill_xp_legacy_backup_20260909;
  SELECT count(*) INTO restored
  FROM public.user_skill_xp
  WHERE pillar NOT IN ('stem', 'art', 'communication', 'civics', 'wellness');

  RAISE NOTICE 'Backup holds % row(s); % legacy row(s) now present.', expected, restored;
END $$;

COMMIT;

-- Retention: once the fix in commit 0cd91cf5 has been in production long enough
-- that you are sure nothing wanted these rows, drop the backup:
--
--   DROP TABLE public.user_skill_xp_legacy_backup_20260909;
